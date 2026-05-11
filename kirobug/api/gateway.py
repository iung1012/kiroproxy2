"""
api/gateway.py
Expõe o status do kiro-gateway para o frontend unificado.
"""
import json
import os
from pathlib import Path

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/gateway", tags=["gateway"])

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://kiro-gateway:8000")
ACCOUNTS_FILE = Path(os.getenv("GATEWAY_ACCOUNTS_FILE", "/shared/credentials/accounts.json"))


def _read_accounts() -> list:
    try:
        if ACCOUNTS_FILE.exists():
            return json.loads(ACCOUNTS_FILE.read_text())
    except Exception:
        pass
    return []


@router.get("/status")
async def gateway_status():
    """Retorna status do kiro-gateway e contagem de contas sincronizadas."""
    online = False
    models: list[str] = []

    try:
        resp = httpx.get(f"{GATEWAY_URL}/health", timeout=5)
        online = resp.status_code == 200
    except Exception:
        online = False

    try:
        resp = httpx.get(f"{GATEWAY_URL}/v1/models", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            models = [m["id"] for m in data.get("data", [])]
    except Exception:
        pass

    accounts = _read_accounts()

    return {
        "online": online,
        "url": GATEWAY_URL,
        "synced_accounts": len([a for a in accounts if a.get("enabled", True)]),
        "total_accounts": len(accounts),
        "models": models,
    }
