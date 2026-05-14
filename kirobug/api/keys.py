"""API endpoints for managing user API keys."""

import os
import secrets
import sqlite3
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

KEYS_DB_PATH = os.getenv("KEYS_DB_PATH", "/shared/credentials/keys.db")

router = APIRouter(prefix="/api/keys", tags=["keys"])


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(KEYS_DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    try:
        Path(KEYS_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
        conn = _get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                key TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                daily_limit INTEGER DEFAULT -1,
                expires_at TEXT,
                created_at TEXT NOT NULL,
                requests_today INTEGER DEFAULT 0,
                last_reset_date TEXT,
                total_requests INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1
            )
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[keys] Could not initialize keys DB: {e}")


_init_db()


class CreateKeyRequest(BaseModel):
    name: str
    daily_limit: int = -1
    expires_at: Optional[str] = None  # "YYYY-MM-DD" or null


class UpdateKeyRequest(BaseModel):
    name: Optional[str] = None
    daily_limit: Optional[int] = None
    expires_at: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
def list_keys():
    """List all API keys."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM api_keys ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("")
def create_key(req: CreateKeyRequest):
    """Create a new API key."""
    key_id = str(uuid.uuid4())
    key_value = f"kp-{secrets.token_hex(24)}"
    now = datetime.utcnow().isoformat()
    today = date.today().isoformat()

    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO api_keys
               (id, key, name, daily_limit, expires_at, created_at, last_reset_date)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (key_id, key_value, req.name, req.daily_limit, req.expires_at, now, today)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()
        return dict(row)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{key_id}")
def delete_key(key_id: str):
    """Delete an API key."""
    conn = _get_conn()
    result = conn.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"ok": True}


@router.patch("/{key_id}")
def update_key(key_id: str, req: UpdateKeyRequest):
    """Update an API key."""
    fields = []
    values = []

    if req.name is not None:
        fields.append("name = ?")
        values.append(req.name)
    if req.daily_limit is not None:
        fields.append("daily_limit = ?")
        values.append(req.daily_limit)
    if req.expires_at is not None:
        fields.append("expires_at = ?")
        values.append(req.expires_at if req.expires_at != "" else None)
    if req.is_active is not None:
        fields.append("is_active = ?")
        values.append(1 if req.is_active else 0)

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(key_id)
    conn = _get_conn()
    result = conn.execute(
        f"UPDATE api_keys SET {', '.join(fields)} WHERE id = ?", values
    )
    conn.commit()

    if result.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Key not found")

    row = conn.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()
    conn.close()
    return dict(row)
