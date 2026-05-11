"""
bridge/export.py

Sincroniza contas Kiro do kirobug para o kiro-gateway.

Fluxo:
  1. Aguarda o kirobug ficar disponível
  2. Consulta GET /api/accounts?platform=kiro
  3. Extrai refreshToken + accessToken do campo extra_json de cada conta válida
  4. Escreve um arquivo kiro_<id>.json por conta em CREDENTIALS_DIR
  5. Atualiza accounts.json (índice lido pelo kiro-gateway)
  6. Repete a cada SYNC_INTERVAL segundos
"""

import json
import logging
import os
import time
from pathlib import Path

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

KIROBUG_URL    = os.environ["KIROBUG_URL"].rstrip("/")
KIROBUG_API_KEY = os.environ.get("KIROBUG_API_KEY", "").strip()
CREDENTIALS_DIR = Path(os.environ.get("CREDENTIALS_DIR", "/shared/credentials"))
SYNC_INTERVAL   = int(os.environ.get("SYNC_INTERVAL", "300"))
ACCOUNTS_FILE   = CREDENTIALS_DIR / "accounts.json"

VALID_STATUSES = {"active", "valid", "success", "ok", "verified", ""}


def _headers() -> dict:
    if KIROBUG_API_KEY:
        return {"Authorization": f"Bearer {KIROBUG_API_KEY}"}
    return {}


def _parse_extra(raw) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return {}


def fetch_kiro_accounts() -> list[dict]:
    resp = httpx.get(
        f"{KIROBUG_URL}/api/accounts",
        params={"platform": "kiro", "page_size": 1000},
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("items", [])


def sync(accounts: list[dict]) -> int:
    CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []
    active: set[str] = set()

    for acc in accounts:
        status = (acc.get("status") or "").lower().strip()
        if status not in VALID_STATUSES:
            continue

        extra = _parse_extra(acc.get("extra_json"))
        refresh_token = extra.get("refreshToken") or acc.get("token", "")
        if not refresh_token:
            continue

        acc_id   = acc.get("id", "unknown")
        fname    = f"kiro_{acc_id}.json"
        fpath    = CREDENTIALS_DIR / fname
        active.add(fname)

        cred: dict = {"refreshToken": refresh_token}
        if extra.get("accessToken"):
            cred["accessToken"] = extra["accessToken"]

        fpath.write_text(json.dumps(cred, indent=2))

        entry: dict = {
            "type":    "json",
            "path":    str(fpath),
            "comment": acc.get("email", f"account_{acc_id}"),
            "enabled": True,
        }
        region = acc.get("region") or extra.get("region")
        if region:
            entry["region"] = region

        entries.append(entry)

    # Remove arquivos de contas que já não existem no kirobug
    for old in CREDENTIALS_DIR.glob("kiro_*.json"):
        if old.name not in active:
            old.unlink(missing_ok=True)
            log.info("Removido: %s", old.name)

    ACCOUNTS_FILE.write_text(json.dumps(entries, indent=2))
    return len(entries)


def wait_for_kirobug(timeout: int = 300) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            httpx.get(
                f"{KIROBUG_URL}/api/accounts/stats",
                headers=_headers(),
                timeout=5,
            ).raise_for_status()
            log.info("kirobug disponível em %s", KIROBUG_URL)
            return
        except Exception:
            log.info("Aguardando kirobug... (retry em 10s)")
            time.sleep(10)
    raise RuntimeError(f"kirobug não respondeu em {timeout}s")


def main() -> None:
    log.info(
        "Bridge iniciado | kirobug=%s | intervalo=%ds | destino=%s",
        KIROBUG_URL, SYNC_INTERVAL, CREDENTIALS_DIR,
    )
    wait_for_kirobug()

    while True:
        try:
            accounts = fetch_kiro_accounts()
            exported = sync(accounts)
            log.info(
                "Sync OK: %d/%d contas exportadas → %s",
                exported, len(accounts), ACCOUNTS_FILE,
            )
        except httpx.HTTPStatusError as e:
            log.error("HTTP %s ao consultar kirobug: %s", e.response.status_code, e.response.text[:300])
        except Exception as e:
            log.error("Erro no sync: %s", e)

        time.sleep(SYNC_INTERVAL)


if __name__ == "__main__":
    main()
