"""
API Key Manager for Kiro Gateway.

Validates user API keys with daily limits and expiration.
Keys are stored in a shared SQLite database at /shared/credentials/keys.db,
accessible by both kiro-gateway (validation) and kirobug (management).
"""

import os
import sqlite3
import secrets
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional, Tuple

from loguru import logger

KEYS_DB_PATH = os.getenv("KEYS_DB_PATH", "/shared/credentials/keys.db")


def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(KEYS_DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_keys_db() -> None:
    """Initialize the keys database schema if not exists."""
    try:
        Path(KEYS_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
        conn = _get_connection()
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
        logger.info(f"Keys database ready at {KEYS_DB_PATH}")
    except Exception as e:
        logger.warning(f"Could not initialize keys database: {e}")


def validate_key(api_key: str) -> Tuple[bool, str, Optional[str]]:
    """
    Validate an API key and increment usage counters.

    Returns:
        (is_valid, reason, key_id)
    """
    try:
        conn = _get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM api_keys WHERE key = ? AND is_active = 1",
            (api_key,)
        )
        row = cursor.fetchone()

        if not row:
            conn.close()
            return False, "Invalid API key", None

        key_id = row["id"]

        # Check expiration
        if row["expires_at"]:
            try:
                expires = datetime.fromisoformat(row["expires_at"]).date()
                if date.today() > expires:
                    conn.close()
                    return False, "API key expired", None
            except Exception:
                pass

        # Reset daily counter if new day
        today = date.today().isoformat()
        requests_today = row["requests_today"]
        if row["last_reset_date"] != today:
            cursor.execute(
                "UPDATE api_keys SET requests_today = 0, last_reset_date = ? WHERE id = ?",
                (today, key_id)
            )
            requests_today = 0

        # Check daily limit
        daily_limit = row["daily_limit"]
        if daily_limit != -1 and requests_today >= daily_limit:
            conn.commit()
            conn.close()
            return False, f"Daily limit of {daily_limit} requests exceeded", None

        # Increment counters
        cursor.execute(
            "UPDATE api_keys SET requests_today = requests_today + 1, total_requests = total_requests + 1 WHERE id = ?",
            (key_id,)
        )
        conn.commit()
        conn.close()
        return True, "ok", key_id

    except Exception as e:
        logger.error(f"Error validating API key: {e}")
        return False, "Internal error during key validation", None


# Initialize on import
try:
    init_keys_db()
except Exception:
    pass
