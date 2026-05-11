# -*- coding: utf-8 -*-
"""
Kiro Gateway - Web UI Panel

Provides a browser-based interface for:
- First-time setup wizard (password, proxy, etc.)
- Account management (add/remove accounts via JSON or CSV)
- Gateway status dashboard
"""

import csv
import hashlib
import io
import json
import os
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

router = APIRouter(prefix="/ui", tags=["UI"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

UI_CONFIG_FILE = "ui_config.json"
CREDENTIALS_FILE = "credentials.json"
KIRO_ACCOUNTS_DIR = "kiro_accounts_json"


def _load_ui_config() -> dict:
    p = Path(UI_CONFIG_FILE)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_ui_config(cfg: dict) -> None:
    Path(UI_CONFIG_FILE).write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def is_setup_complete() -> bool:
    cfg = _load_ui_config()
    return bool(cfg.get("password_hash"))


def _check_auth(request: Request) -> bool:
    cfg = _load_ui_config()
    stored_hash = cfg.get("password_hash", "")
    if not stored_hash:
        return False
    token = (
        request.headers.get("X-UI-Token")
        or request.cookies.get("ui_token")
        or ""
    )
    return token == stored_hash


def require_auth(request: Request):
    if not _check_auth(request):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _write_env(updates: dict) -> None:
    env_path = Path(".env")
    lines: list[str] = []

    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    updated_keys: set[str] = set()
    new_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#") or not stripped:
            new_lines.append(line)
            continue
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*=', stripped)
        if m:
            key = m.group(1)
            if key in updates:
                new_lines.append(f'{key}="{updates[key]}"')
                updated_keys.add(key)
                continue
        new_lines.append(line)

    for key, value in updates.items():
        if key not in updated_keys:
            new_lines.append(f'{key}="{value}"')

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _load_credentials() -> list:
    p = Path(CREDENTIALS_FILE)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _save_credentials(creds: list) -> None:
    Path(CREDENTIALS_FILE).write_text(json.dumps(creds, indent=2, ensure_ascii=False), encoding="utf-8")


def _parse_csv_accounts(text: str) -> list[dict]:
    """Parse CSV with columns: RefreshToken, ClientId, ClientSecret, Region (+ optional email/nickname)."""
    reader = csv.DictReader(io.StringIO(text))
    accounts = []
    for row in reader:
        # Normalize keys (strip BOM, spaces, quotes)
        normalized = {k.strip().strip('"').strip('﻿'): v for k, v in row.items()}

        refresh_token = (
            normalized.get("RefreshToken") or normalized.get("refreshToken") or ""
        ).strip()
        client_id = (
            normalized.get("ClientId") or normalized.get("clientId") or ""
        ).strip()
        client_secret = (
            normalized.get("ClientSecret") or normalized.get("clientSecret") or ""
        ).strip()
        region = (
            normalized.get("Region") or normalized.get("region") or "us-east-1"
        ).strip()
        email = (normalized.get("邮箱") or normalized.get("Email") or normalized.get("email") or "").strip()

        if not refresh_token:
            continue

        accounts.append({
            "email": email,
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
            "region": region,
        })
    return accounts


def _write_accounts_from_parsed(accounts: list[dict]) -> tuple[int, str]:
    """Write individual JSON files and update credentials.json. Returns (count, folder_path)."""
    folder = Path(KIRO_ACCOUNTS_DIR)
    folder.mkdir(exist_ok=True)

    count = 0
    for acc in accounts:
        email = acc.get("email", "")
        refresh_token = acc["refresh_token"]

        # Deterministic filename based on token hash
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()[:12]
        if email:
            safe = email.replace("@", "_at_").replace(".", "_")[:40]
            filename = folder / f"{safe}_{token_hash}.json"
        else:
            filename = folder / f"account_{token_hash}.json"

        cred = {
            "refreshToken": acc["refresh_token"],
        }
        if acc.get("client_id"):
            cred["clientId"] = acc["client_id"]
        if acc.get("client_secret"):
            cred["clientSecret"] = acc["client_secret"]

        filename.write_text(json.dumps(cred, indent=2, ensure_ascii=False), encoding="utf-8")
        count += 1

    # Update credentials.json to point to the folder
    existing = _load_credentials()
    folder_entry = {"type": "json", "path": f"./{KIRO_ACCOUNTS_DIR}"}

    # Replace or add folder entry
    new_creds = [e for e in existing if not (e.get("type") == "json" and e.get("path", "").endswith(KIRO_ACCOUNTS_DIR))]
    new_creds.insert(0, folder_entry)
    _save_credentials(new_creds)

    return count, str(folder)


def _list_account_files() -> list[dict]:
    """Return masked list of accounts from the JSON folder."""
    folder = Path(KIRO_ACCOUNTS_DIR)
    if not folder.exists():
        return []
    result = []
    for f in sorted(folder.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            token = data.get("refreshToken", "")
            masked = token[:8] + "..." + token[-6:] if len(token) > 14 else token
            result.append({
                "file": f.name,
                "token_preview": masked,
                "has_client_id": bool(data.get("clientId")),
            })
        except Exception:
            result.append({"file": f.name, "token_preview": "?", "has_client_id": False})
    return result


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@router.get("/api/check")
async def api_check(request: Request):
    setup = is_setup_complete()
    accounts = _list_account_files() if setup else []
    creds = _load_credentials() if setup else []
    return {
        "setup_complete": setup,
        "authenticated": _check_auth(request) if setup else False,
        "accounts_count": len(accounts),
        "credentials_entries": len(creds),
    }


@router.post("/api/setup")
async def api_setup(request: Request):
    body = await request.json()
    password = (body.get("password") or "").strip()
    proxy_url = (body.get("proxy_url") or "").strip()
    server_port = (body.get("server_port") or "").strip()
    account_system = body.get("account_system", True)
    proxy_api_key = (body.get("proxy_api_key") or password).strip()

    if not password:
        raise HTTPException(400, "Password is required")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    cfg = _load_ui_config()
    cfg["password_hash"] = _hash_password(password)
    _save_ui_config(cfg)

    env_updates = {
        "PROXY_API_KEY": proxy_api_key,
        "ACCOUNT_SYSTEM": "true" if account_system else "false",
    }
    if proxy_url:
        env_updates["VPN_PROXY_URL"] = proxy_url
    if server_port and server_port.isdigit():
        env_updates["SERVER_PORT"] = server_port

    _write_env(env_updates)

    return {"success": True, "message": "Setup complete. Please restart the server."}


@router.post("/api/login")
async def api_login(request: Request):
    body = await request.json()
    password = (body.get("password") or "").strip()
    cfg = _load_ui_config()
    stored_hash = cfg.get("password_hash", "")
    if not stored_hash or _hash_password(password) != stored_hash:
        raise HTTPException(401, "Invalid password")
    return {"success": True, "token": stored_hash}


@router.get("/api/accounts", dependencies=[Depends(require_auth)])
async def api_accounts():
    return {"accounts": _list_account_files()}


@router.post("/api/accounts", dependencies=[Depends(require_auth)])
async def api_add_accounts(request: Request):
    body = await request.json()
    mode = body.get("mode", "csv")  # "csv" or "json"
    content = body.get("content", "")

    if mode == "csv":
        parsed = _parse_csv_accounts(content)
        if not parsed:
            raise HTTPException(400, "No valid accounts found in CSV. Make sure it has a RefreshToken column.")
        count, folder = _write_accounts_from_parsed(parsed)
        return {
            "success": True,
            "count": count,
            "message": f"Added {count} account(s) to {folder}. Restart the server to apply.",
        }

    elif mode == "json":
        try:
            data = json.loads(content)
        except Exception:
            raise HTTPException(400, "Invalid JSON")

        if isinstance(data, dict):
            # Single credentials.json-style entry
            data = [data]

        if not isinstance(data, list):
            raise HTTPException(400, "JSON must be an array of credential entries")

        # Check if it's raw account objects (with refreshToken) or credentials.json format
        if data and "refreshToken" in (data[0] if isinstance(data[0], dict) else {}):
            # Raw account objects like [{refreshToken: "...", clientId: "...", ...}]
            parsed = []
            for entry in data:
                if not isinstance(entry, dict) or not entry.get("refreshToken"):
                    continue
                parsed.append({
                    "email": entry.get("email", ""),
                    "refresh_token": entry["refreshToken"],
                    "client_id": entry.get("clientId", ""),
                    "client_secret": entry.get("clientSecret", ""),
                    "region": entry.get("region", "us-east-1"),
                })
            if not parsed:
                raise HTTPException(400, "No valid accounts found in JSON")
            count, folder = _write_accounts_from_parsed(parsed)
            return {
                "success": True,
                "count": count,
                "message": f"Added {count} account(s) to {folder}. Restart the server to apply.",
            }
        else:
            # credentials.json format entries
            valid = [e for e in data if isinstance(e, dict) and e.get("type") and not e.get("comment")]
            if not valid:
                raise HTTPException(400, "No valid credential entries found in JSON")
            existing = _load_credentials()
            # Merge: avoid duplicates by type+path/token combo
            for entry in valid:
                key = entry.get("path") or entry.get("refresh_token") or ""
                if not any((e.get("path") or e.get("refresh_token") or "") == key for e in existing):
                    existing.append(entry)
            _save_credentials(existing)
            return {
                "success": True,
                "count": len(valid),
                "message": f"Added {len(valid)} credential entry(ies) to credentials.json. Restart the server to apply.",
            }
    else:
        raise HTTPException(400, f"Unknown mode: {mode}")


@router.delete("/api/accounts", dependencies=[Depends(require_auth)])
async def api_clear_accounts():
    folder = Path(KIRO_ACCOUNTS_DIR)
    removed = 0
    if folder.exists():
        for f in folder.glob("*.json"):
            f.unlink()
            removed += 1
    # Remove folder entry from credentials.json
    creds = [e for e in _load_credentials() if not (e.get("type") == "json" and e.get("path", "").endswith(KIRO_ACCOUNTS_DIR))]
    _save_credentials(creds)
    return {"success": True, "removed": removed, "message": f"Removed {removed} account file(s). Restart the server to apply."}


@router.get("/api/settings", dependencies=[Depends(require_auth)])
async def api_settings():
    env_path = Path(".env")
    settings = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or not line or "=" not in line:
                continue
            k, _, v = line.partition("=")
            settings[k.strip()] = v.strip().strip('"').strip("'")

    return {
        "proxy_api_key": settings.get("PROXY_API_KEY", ""),
        "vpn_proxy_url": settings.get("VPN_PROXY_URL", ""),
        "server_port": settings.get("SERVER_PORT", "8000"),
        "account_system": settings.get("ACCOUNT_SYSTEM", "false").lower() in ("true", "1", "yes"),
        "log_level": settings.get("LOG_LEVEL", "INFO"),
    }


@router.post("/api/settings", dependencies=[Depends(require_auth)])
async def api_update_settings(request: Request):
    body = await request.json()
    updates = {}

    if "proxy_api_key" in body and body["proxy_api_key"]:
        updates["PROXY_API_KEY"] = body["proxy_api_key"]
    if "vpn_proxy_url" in body:
        updates["VPN_PROXY_URL"] = body["vpn_proxy_url"]
    if "server_port" in body and str(body["server_port"]).isdigit():
        updates["SERVER_PORT"] = str(body["server_port"])
    if "account_system" in body:
        updates["ACCOUNT_SYSTEM"] = "true" if body["account_system"] else "false"
    if "log_level" in body:
        updates["LOG_LEVEL"] = body["log_level"]

    if updates:
        _write_env(updates)

    # If new UI password provided
    if body.get("new_password"):
        if len(body["new_password"]) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
        cfg = _load_ui_config()
        cfg["password_hash"] = _hash_password(body["new_password"])
        _save_ui_config(cfg)

    return {"success": True, "message": "Settings saved. Restart the server to apply changes."}


@router.get("/api/status")
async def api_status(request: Request):
    if not _check_auth(request):
        raise HTTPException(401, "Unauthorized")

    accounts = _list_account_files()
    creds = _load_credentials()
    env_path = Path(".env")

    return {
        "accounts_in_folder": len(accounts),
        "credentials_entries": len(creds),
        "env_exists": env_path.exists(),
        "credentials_exists": Path(CREDENTIALS_FILE).exists(),
    }


# ---------------------------------------------------------------------------
# HTML Page
# ---------------------------------------------------------------------------

@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def ui_index():
    return HTMLResponse(content=_render_html())


def _render_html() -> str:
    return '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kiro Gateway</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { background: #0f1117; color: #e2e8f0; font-family: 'Inter', system-ui, sans-serif; }
  .card { background: #1a1d2e; border: 1px solid #2d3154; border-radius: 12px; }
  .btn-primary { background: #6366f1; color: white; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
  .btn-primary:hover { background: #4f52d4; }
  .btn-danger { background: #dc2626; color: white; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
  .btn-danger:hover { background: #b91c1c; }
  .btn-ghost { background: transparent; color: #94a3b8; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 500; cursor: pointer; border: 1px solid #2d3154; transition: all 0.2s; }
  .btn-ghost:hover { background: #1e2235; color: #e2e8f0; }
  input, textarea, select { background: #0f1117; border: 1px solid #2d3154; color: #e2e8f0; border-radius: 8px; padding: 0.5rem 0.75rem; width: 100%; outline: none; transition: border-color 0.2s; }
  input:focus, textarea:focus, select:focus { border-color: #6366f1; }
  .tab { padding: 0.5rem 1rem; cursor: pointer; border-bottom: 2px solid transparent; color: #64748b; font-weight: 500; transition: all 0.2s; }
  .tab.active { border-color: #6366f1; color: #6366f1; }
  .tab:hover:not(.active) { color: #94a3b8; }
  .badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600; }
  .badge-green { background: #14532d; color: #4ade80; }
  .badge-gray { background: #1e293b; color: #94a3b8; }
  .badge-yellow { background: #713f12; color: #fbbf24; }
  .section { display: none; }
  .section.active { display: block; }
  .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; padding: 0.75rem 1.25rem; border-radius: 10px; font-size: 0.875rem; font-weight: 500; z-index: 9999; animation: slideIn 0.3s ease; max-width: 400px; }
  .toast-success { background: #14532d; color: #4ade80; border: 1px solid #166534; }
  .toast-error { background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; }
  @keyframes slideIn { from { transform: translateX(100%); opacity:0; } to { transform: translateX(0); opacity:1; } }
  .spinner { border: 2px solid #2d3154; border-top-color: #6366f1; border-radius: 50%; width: 16px; height: 16px; animation: spin 0.6s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0f1117; } ::-webkit-scrollbar-thumb { background: #2d3154; border-radius: 3px; }
</style>
</head>
<body class="min-h-screen">

<!-- App will be rendered here by JS -->
<div id="app" class="min-h-screen flex items-center justify-center">
  <div class="spinner" style="width:32px;height:32px;border-width:3px;"></div>
</div>

<script>
const API = '/ui/api';
let token = localStorage.getItem('kiro_ui_token') || '';

// ---- API helpers ----
async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-UI-Token': token },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
  return data;
}

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ---- Router ----
async function init() {
  const check = await api('GET', '/check').catch(() => ({ setup_complete: false, authenticated: false }));

  if (!check.setup_complete) return renderSetup();
  if (!check.authenticated || !token) return renderLogin();
  renderDashboard(check);
}

// ---- Setup Wizard ----
function renderSetup() {
  document.getElementById('app').innerHTML = `
  <div class="w-full max-w-md mx-auto p-6">
    <div class="text-center mb-8">
      <div class="text-4xl mb-2">👻</div>
      <h1 class="text-2xl font-bold text-white">Kiro Gateway</h1>
      <p class="text-slate-400 mt-1 text-sm">First-time setup</p>
    </div>
    <div class="card p-6 space-y-5">
      <div>
        <label class="block text-sm font-medium text-slate-300 mb-1.5">UI Password <span class="text-red-400">*</span></label>
        <input type="password" id="s-password" placeholder="Min. 6 characters" />
        <p class="text-xs text-slate-500 mt-1">Used to log into this panel</p>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 mb-1.5">API Key (PROXY_API_KEY)</label>
        <input type="text" id="s-apikey" placeholder="Leave blank to use UI password" />
        <p class="text-xs text-slate-500 mt-1">The key clients must send in Authorization header</p>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 mb-1.5">VPN / Proxy URL <span class="text-slate-500 font-normal">(optional)</span></label>
        <input type="text" id="s-proxy" placeholder="http://127.0.0.1:7890 or socks5://..." />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 mb-1.5">Server Port</label>
        <input type="number" id="s-port" value="8000" min="1" max="65535" />
      </div>
      <div class="flex items-center gap-3">
        <input type="checkbox" id="s-accsys" checked class="w-4 h-4 accent-indigo-500" />
        <label for="s-accsys" class="text-sm text-slate-300">Enable multi-account failover (recommended)</label>
      </div>
      <button class="btn-primary w-full mt-2" id="s-submit">Complete Setup</button>
      <div id="s-msg" class="text-sm text-center hidden"></div>
    </div>
  </div>`;

  document.getElementById('s-submit').addEventListener('click', async () => {
    const btn = document.getElementById('s-submit');
    btn.innerHTML = '<span class="spinner"></span>Saving...';
    btn.disabled = true;
    try {
      const res = await api('POST', '/setup', {
        password: document.getElementById('s-password').value,
        proxy_api_key: document.getElementById('s-apikey').value,
        proxy_url: document.getElementById('s-proxy').value,
        server_port: document.getElementById('s-port').value,
        account_system: document.getElementById('s-accsys').checked,
      });
      const msg = document.getElementById('s-msg');
      msg.className = 'text-sm text-center text-green-400 mt-2';
      msg.textContent = '✓ ' + res.message;
      msg.classList.remove('hidden');
      setTimeout(() => renderLogin(), 1500);
    } catch(e) {
      toast(e.message, 'error');
      btn.innerHTML = 'Complete Setup';
      btn.disabled = false;
    }
  });
}

// ---- Login ----
function renderLogin() {
  document.getElementById('app').innerHTML = `
  <div class="w-full max-w-sm mx-auto p-6">
    <div class="text-center mb-8">
      <div class="text-4xl mb-2">👻</div>
      <h1 class="text-2xl font-bold text-white">Kiro Gateway</h1>
    </div>
    <div class="card p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
        <input type="password" id="l-password" placeholder="Enter your password" autofocus />
      </div>
      <button class="btn-primary w-full" id="l-submit">Sign In</button>
    </div>
  </div>`;

  const doLogin = async () => {
    const btn = document.getElementById('l-submit');
    btn.innerHTML = '<span class="spinner"></span>Signing in...';
    btn.disabled = true;
    try {
      const res = await api('POST', '/login', { password: document.getElementById('l-password').value });
      token = res.token;
      localStorage.setItem('kiro_ui_token', token);
      const check = await api('GET', '/check');
      renderDashboard(check);
    } catch(e) {
      toast(e.message, 'error');
      btn.innerHTML = 'Sign In';
      btn.disabled = false;
    }
  };

  document.getElementById('l-submit').addEventListener('click', doLogin);
  document.getElementById('l-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

// ---- Dashboard ----
function renderDashboard(check) {
  document.getElementById('app').innerHTML = `
  <div class="min-h-screen flex flex-col">
    <!-- Nav -->
    <nav class="border-b border-slate-800 px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-xl">👻</span>
        <span class="font-semibold text-white">Kiro Gateway</span>
        <span class="badge badge-green">v2.4</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-slate-400">${check.accounts_count} account(s)</span>
        <button class="btn-ghost text-sm" id="btn-logout">Logout</button>
      </div>
    </nav>

    <!-- Tabs -->
    <div class="border-b border-slate-800 px-6 flex gap-1">
      <div class="tab active" data-tab="accounts">Accounts</div>
      <div class="tab" data-tab="settings">Settings</div>
      <div class="tab" data-tab="status">Status</div>
    </div>

    <!-- Content -->
    <div class="flex-1 p-6 max-w-4xl mx-auto w-full">

      <!-- Accounts Tab -->
      <div class="section active" id="tab-accounts">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Account Management</h2>
          <button class="btn-danger text-sm" id="btn-clear">Clear All Accounts</button>
        </div>

        <!-- Add accounts -->
        <div class="card p-5 mb-5">
          <div class="flex gap-2 mb-4">
            <button class="tab active" id="mode-csv" data-mode="csv">CSV</button>
            <button class="tab" id="mode-json" data-mode="json">JSON</button>
          </div>

          <div id="csv-hint" class="text-xs text-slate-400 mb-3 p-3 bg-slate-800/50 rounded-lg">
            <strong class="text-slate-300">CSV format:</strong> Must have columns <code class="text-indigo-300">RefreshToken</code>, <code class="text-indigo-300">ClientId</code>, <code class="text-indigo-300">ClientSecret</code>, <code class="text-indigo-300">Region</code>.<br>
            Paste your CSV content below (including header row).
          </div>
          <div id="json-hint" class="text-xs text-slate-400 mb-3 p-3 bg-slate-800/50 rounded-lg hidden">
            <strong class="text-slate-300">JSON format (two options):</strong><br>
            Option 1 – Array of <code class="text-indigo-300">credentials.json</code> entries (type: "json"/"sqlite"/"refresh_token")<br>
            Option 2 – Array of account objects: <code class="text-indigo-300">[{{"refreshToken":"...", "clientId":"...", "clientSecret":"...", "region":"..."}}]</code>
          </div>

          <textarea id="acc-content" rows="8" placeholder="Paste content here..."></textarea>
          <div class="flex justify-end mt-3">
            <button class="btn-primary" id="btn-add">Add Accounts</button>
          </div>
        </div>

        <!-- Account list -->
        <div class="card p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-medium">Current Accounts</h3>
            <button class="btn-ghost text-xs" id="btn-refresh-list">Refresh</button>
          </div>
          <div id="acc-list"><div class="text-slate-500 text-sm">Loading...</div></div>
        </div>

        <div id="restart-notice" class="hidden mt-4 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-yellow-300 text-sm">
          ⚠️ Changes saved. <strong>Restart the server</strong> to apply new accounts.
        </div>
      </div>

      <!-- Settings Tab -->
      <div class="section" id="tab-settings">
        <h2 class="text-lg font-semibold mb-4">Settings</h2>
        <div class="card p-5 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">API Key (PROXY_API_KEY)</label>
            <input type="text" id="cfg-apikey" placeholder="Current key" />
            <p class="text-xs text-slate-500 mt-1">Key clients must send in Authorization header</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">VPN / Proxy URL</label>
            <input type="text" id="cfg-proxy" placeholder="Leave blank to disable" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Server Port</label>
            <input type="number" id="cfg-port" min="1" max="65535" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Log Level</label>
            <select id="cfg-loglevel">
              <option value="DEBUG">DEBUG</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
            </select>
          </div>
          <div class="flex items-center gap-3">
            <input type="checkbox" id="cfg-accsys" class="w-4 h-4 accent-indigo-500" />
            <label for="cfg-accsys" class="text-sm text-slate-300">Enable multi-account failover</label>
          </div>
          <hr class="border-slate-700" />
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">New UI Password <span class="text-slate-500 font-normal">(leave blank to keep current)</span></label>
            <input type="password" id="cfg-password" placeholder="Min. 6 characters" />
          </div>
          <button class="btn-primary" id="btn-save-settings">Save Settings</button>
          <p class="text-xs text-slate-500">Restart the server after saving to apply changes.</p>
        </div>
      </div>

      <!-- Status Tab -->
      <div class="section" id="tab-status">
        <h2 class="text-lg font-semibold mb-4">Status</h2>
        <div id="status-content" class="card p-5">
          <div class="text-slate-500 text-sm">Loading...</div>
        </div>
      </div>

    </div>
  </div>`;

  // Tab switching
  let activeMode = 'csv';
  document.querySelectorAll('.tab[data-tab]').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-tab]').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('tab-' + t.dataset.tab).classList.add('active');
      if (t.dataset.tab === 'settings') loadSettings();
      if (t.dataset.tab === 'status') loadStatus();
    });
  });

  // Mode switching (CSV / JSON)
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMode = btn.dataset.mode;
      document.getElementById('csv-hint').classList.toggle('hidden', activeMode !== 'csv');
      document.getElementById('json-hint').classList.toggle('hidden', activeMode !== 'json');
      document.getElementById('acc-content').placeholder = activeMode === 'csv'
        ? 'Paste CSV content here...' : 'Paste JSON content here...';
    });
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    token = ''; localStorage.removeItem('kiro_ui_token'); renderLogin();
  });

  // Add accounts
  document.getElementById('btn-add').addEventListener('click', async () => {
    const btn = document.getElementById('btn-add');
    const content = document.getElementById('acc-content').value.trim();
    if (!content) return toast('Paste some content first', 'error');
    btn.innerHTML = '<span class="spinner"></span>Processing...';
    btn.disabled = true;
    try {
      const res = await api('POST', '/accounts', { mode: activeMode, content });
      toast(res.message);
      document.getElementById('acc-content').value = '';
      document.getElementById('restart-notice').classList.remove('hidden');
      await loadAccountList();
    } catch(e) {
      toast(e.message, 'error');
    }
    btn.innerHTML = 'Add Accounts';
    btn.disabled = false;
  });

  // Clear accounts
  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!confirm('Remove all accounts from the kiro_accounts_json folder?')) return;
    try {
      const res = await api('DELETE', '/accounts');
      toast(res.message);
      document.getElementById('restart-notice').classList.remove('hidden');
      await loadAccountList();
    } catch(e) {
      toast(e.message, 'error');
    }
  });

  // Refresh list
  document.getElementById('btn-refresh-list').addEventListener('click', loadAccountList);

  // Save settings
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-settings');
    btn.innerHTML = '<span class="spinner"></span>Saving...';
    btn.disabled = true;
    try {
      const res = await api('POST', '/settings', {
        proxy_api_key: document.getElementById('cfg-apikey').value,
        vpn_proxy_url: document.getElementById('cfg-proxy').value,
        server_port: document.getElementById('cfg-port').value,
        account_system: document.getElementById('cfg-accsys').checked,
        log_level: document.getElementById('cfg-loglevel').value,
        new_password: document.getElementById('cfg-password').value || undefined,
      });
      toast(res.message);
    } catch(e) {
      toast(e.message, 'error');
    }
    btn.innerHTML = 'Save Settings';
    btn.disabled = false;
  });

  loadAccountList();
}

async function loadAccountList() {
  try {
    const res = await api('GET', '/accounts');
    const el = document.getElementById('acc-list');
    if (!res.accounts.length) {
      el.innerHTML = '<p class="text-slate-500 text-sm">No accounts in kiro_accounts_json folder.</p>';
      return;
    }
    el.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-slate-400 border-b border-slate-700">
              <th class="pb-2 pr-4">File</th>
              <th class="pb-2 pr-4">Token</th>
              <th class="pb-2">ClientId</th>
            </tr>
          </thead>
          <tbody>
            ${res.accounts.map(a => `
              <tr class="border-b border-slate-800 last:border-0">
                <td class="py-2 pr-4 font-mono text-xs text-slate-300">${a.file}</td>
                <td class="py-2 pr-4 font-mono text-xs text-slate-400">${a.token_preview}</td>
                <td class="py-2">${a.has_client_id ? '<span class="badge badge-green">yes</span>' : '<span class="badge badge-gray">no</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    document.getElementById('acc-list').innerHTML = '<p class="text-red-400 text-sm">Failed to load accounts.</p>';
  }
}

async function loadSettings() {
  try {
    const s = await api('GET', '/settings');
    document.getElementById('cfg-apikey').value = s.proxy_api_key || '';
    document.getElementById('cfg-proxy').value = s.vpn_proxy_url || '';
    document.getElementById('cfg-port').value = s.server_port || '8000';
    document.getElementById('cfg-accsys').checked = s.account_system;
    document.getElementById('cfg-loglevel').value = s.log_level || 'INFO';
  } catch(e) {
    toast('Failed to load settings', 'error');
  }
}

async function loadStatus() {
  try {
    const s = await api('GET', '/status');
    document.getElementById('status-content').innerHTML = `
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div class="text-center p-4 bg-slate-800/50 rounded-lg">
          <div class="text-3xl font-bold text-indigo-400">${s.accounts_in_folder}</div>
          <div class="text-xs text-slate-400 mt-1">Account Files</div>
        </div>
        <div class="text-center p-4 bg-slate-800/50 rounded-lg">
          <div class="text-3xl font-bold text-indigo-400">${s.credentials_entries}</div>
          <div class="text-xs text-slate-400 mt-1">Credential Entries</div>
        </div>
        <div class="text-center p-4 bg-slate-800/50 rounded-lg">
          <div class="text-2xl font-bold ${s.env_exists ? 'text-green-400' : 'text-red-400'}">${s.env_exists ? '✓' : '✗'}</div>
          <div class="text-xs text-slate-400 mt-1">.env File</div>
        </div>
        <div class="text-center p-4 bg-slate-800/50 rounded-lg">
          <div class="text-2xl font-bold ${s.credentials_exists ? 'text-green-400' : 'text-red-400'}">${s.credentials_exists ? '✓' : '✗'}</div>
          <div class="text-xs text-slate-400 mt-1">credentials.json</div>
        </div>
      </div>
      <div class="mt-4 p-3 bg-slate-800/30 rounded-lg text-xs text-slate-400">
        After making changes, restart the gateway server to apply them.<br>
        API endpoints: <code class="text-indigo-300">http://localhost:8000/v1/chat/completions</code> (OpenAI) &nbsp;|&nbsp; <code class="text-indigo-300">/v1/messages</code> (Anthropic)
      </div>`;
  } catch(e) {
    document.getElementById('status-content').innerHTML = '<p class="text-red-400 text-sm">Failed to load status.</p>';
  }
}

// Boot
init();
</script>
</body>
</html>'''
