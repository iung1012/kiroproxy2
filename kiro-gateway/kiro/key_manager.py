# -*- coding: utf-8 -*-
"""
API Key management with Claude-style rate limiting windows.

Rate limits are enforced per fixed time window (minute / hour / day).
Each key can have independent request and token limits per window.
"""

import asyncio
import secrets
import sqlite3
import string
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from loguru import logger


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _window_start(dt: datetime, window: str) -> datetime:
    if window == "minute":
        return dt.replace(second=0, microsecond=0)
    if window == "hour":
        return dt.replace(minute=0, second=0, microsecond=0)
    if window == "day":
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)
    raise ValueError(f"Unknown window: {window}")


def _window_duration(window: str) -> timedelta:
    if window == "minute":
        return timedelta(minutes=1)
    if window == "hour":
        return timedelta(hours=1)
    return timedelta(days=1)


def _generate_key() -> str:
    alphabet = string.ascii_letters + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(40))
    return f"sk-kiro-{suffix}"


def _mask_key(key: str) -> str:
    return key[:12] + "..." + key[-4:]


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class KeyValidationResult:
    is_valid: bool
    key_id: Optional[str] = None
    key_name: Optional[str] = None
    # reason: "invalid" | "inactive" | "expired" | "rate_limited" | "token_limit"
    reason: Optional[str] = None
    retry_after: Optional[int] = None   # seconds until window resets
    limit_window: Optional[str] = None  # "minute" | "hour" | "day"
    limit_type: Optional[str] = None    # "requests" | "tokens"


@dataclass
class ApiKeyRecord:
    id: str
    key: str           # full key — shown only on creation
    key_masked: str    # sk-kiro-...XXXX
    name: str
    is_active: bool
    rpm_limit: int     # requests per minute  (-1 = unlimited)
    rph_limit: int     # requests per hour
    rpd_limit: int     # requests per day
    tpm_limit: int     # tokens per minute (input+output)
    tph_limit: int     # tokens per hour
    tpd_limit: int     # tokens per day
    expires_at: Optional[str]
    created_at: str
    notes: str


@dataclass
class WindowUsage:
    requests: int
    tokens_input: int
    tokens_output: int

    @property
    def tokens_total(self) -> int:
        return self.tokens_input + self.tokens_output


@dataclass
class UsageStats:
    key_id: str
    minute: WindowUsage
    hour: WindowUsage
    day: WindowUsage
    total_requests: int
    total_tokens_input: int
    total_tokens_output: int
    last_used_at: Optional[str]


# ---------------------------------------------------------------------------
# KeyManager
# ---------------------------------------------------------------------------

class KeyManager:
    """Thread-safe SQLite-backed API key manager with time-window rate limiting."""

    _WINDOWS = ("minute", "hour", "day")

    def __init__(self, db_path: str = "keys.db"):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._initialized = False

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def _sync_initialize(self) -> None:
        con = sqlite3.connect(self.db_path, check_same_thread=False)
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA foreign_keys=ON")
        con.executescript("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id          TEXT PRIMARY KEY,
                key         TEXT UNIQUE NOT NULL,
                name        TEXT NOT NULL DEFAULT '',
                is_active   INTEGER NOT NULL DEFAULT 1,
                rpm_limit   INTEGER NOT NULL DEFAULT -1,
                rph_limit   INTEGER NOT NULL DEFAULT -1,
                rpd_limit   INTEGER NOT NULL DEFAULT -1,
                tpm_limit   INTEGER NOT NULL DEFAULT -1,
                tph_limit   INTEGER NOT NULL DEFAULT -1,
                tpd_limit   INTEGER NOT NULL DEFAULT -1,
                expires_at  TEXT,
                created_at  TEXT NOT NULL,
                notes       TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS usage_windows (
                key_id       TEXT NOT NULL,
                window_type  TEXT NOT NULL,
                window_start TEXT NOT NULL,
                requests     INTEGER NOT NULL DEFAULT 0,
                tok_input    INTEGER NOT NULL DEFAULT 0,
                tok_output   INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (key_id, window_type),
                FOREIGN KEY (key_id) REFERENCES api_keys(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS usage_totals (
                key_id         TEXT PRIMARY KEY,
                total_requests INTEGER NOT NULL DEFAULT 0,
                total_tok_in   INTEGER NOT NULL DEFAULT 0,
                total_tok_out  INTEGER NOT NULL DEFAULT 0,
                last_used_at   TEXT,
                FOREIGN KEY (key_id) REFERENCES api_keys(id) ON DELETE CASCADE
            );
        """)
        con.commit()
        con.close()

    async def initialize(self) -> None:
        await asyncio.to_thread(self._sync_initialize)
        self._initialized = True
        logger.info(f"KeyManager initialized: {self.db_path}")

    # ------------------------------------------------------------------
    # Internal helpers (sync, run inside executor)
    # ------------------------------------------------------------------

    def _con(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path, check_same_thread=False)
        con.execute("PRAGMA foreign_keys=ON")
        con.row_factory = sqlite3.Row
        return con

    def _get_window_usage(
        self, con: sqlite3.Connection, key_id: str, window: str, now: datetime
    ) -> WindowUsage:
        ws = _window_start(now, window).isoformat()
        row = con.execute(
            "SELECT window_start, requests, tok_input, tok_output "
            "FROM usage_windows WHERE key_id=? AND window_type=?",
            (key_id, window),
        ).fetchone()
        if row is None or row["window_start"] != ws:
            return WindowUsage(0, 0, 0)
        return WindowUsage(row["requests"], row["tok_input"], row["tok_output"])

    def _sync_validate(self, key: str) -> KeyValidationResult:
        now = _now_utc()
        with self._lock:
            con = self._con()
            try:
                row = con.execute(
                    "SELECT * FROM api_keys WHERE key=?", (key,)
                ).fetchone()

                if not row:
                    return KeyValidationResult(is_valid=False, reason="invalid")

                if not row["is_active"]:
                    return KeyValidationResult(is_valid=False, reason="inactive")

                if row["expires_at"]:
                    exp = datetime.fromisoformat(row["expires_at"])
                    if now > exp:
                        return KeyValidationResult(is_valid=False, reason="expired")

                key_id = row["id"]

                limit_map = {
                    "minute": (row["rpm_limit"], row["tpm_limit"]),
                    "hour":   (row["rph_limit"], row["tph_limit"]),
                    "day":    (row["rpd_limit"], row["tpd_limit"]),
                }

                for window, (req_limit, tok_limit) in limit_map.items():
                    usage = self._get_window_usage(con, key_id, window, now)
                    ws = _window_start(now, window)
                    next_reset = ws + _window_duration(window)
                    retry_after = max(1, int((next_reset - now).total_seconds()) + 1)

                    if req_limit != -1 and usage.requests >= req_limit:
                        return KeyValidationResult(
                            is_valid=False,
                            reason="rate_limited",
                            retry_after=retry_after,
                            limit_window=window,
                            limit_type="requests",
                        )

                    if tok_limit != -1 and usage.tokens_total >= tok_limit:
                        return KeyValidationResult(
                            is_valid=False,
                            reason="token_limit",
                            retry_after=retry_after,
                            limit_window=window,
                            limit_type="tokens",
                        )

                return KeyValidationResult(
                    is_valid=True,
                    key_id=key_id,
                    key_name=row["name"],
                )
            finally:
                con.close()

    def _sync_record_usage(
        self, key_id: str, tokens_input: int, tokens_output: int
    ) -> None:
        now = _now_utc()
        with self._lock:
            con = self._con()
            try:
                for window in self._WINDOWS:
                    ws = _window_start(now, window).isoformat()
                    con.execute(
                        """
                        INSERT INTO usage_windows
                            (key_id, window_type, window_start, requests, tok_input, tok_output)
                        VALUES (?, ?, ?, 1, ?, ?)
                        ON CONFLICT(key_id, window_type) DO UPDATE SET
                            requests   = CASE WHEN window_start = excluded.window_start
                                              THEN requests + 1 ELSE 1 END,
                            tok_input  = CASE WHEN window_start = excluded.window_start
                                              THEN tok_input + excluded.tok_input
                                              ELSE excluded.tok_input END,
                            tok_output = CASE WHEN window_start = excluded.window_start
                                              THEN tok_output + excluded.tok_output
                                              ELSE excluded.tok_output END,
                            window_start = excluded.window_start
                        """,
                        (key_id, window, ws, tokens_input, tokens_output),
                    )

                con.execute(
                    """
                    INSERT INTO usage_totals (key_id, total_requests, total_tok_in, total_tok_out, last_used_at)
                    VALUES (?, 1, ?, ?, ?)
                    ON CONFLICT(key_id) DO UPDATE SET
                        total_requests = total_requests + 1,
                        total_tok_in   = total_tok_in + excluded.total_tok_in,
                        total_tok_out  = total_tok_out + excluded.total_tok_out,
                        last_used_at   = excluded.last_used_at
                    """,
                    (key_id, tokens_input, tokens_output, now.isoformat()),
                )
                con.commit()
            finally:
                con.close()

    def _sync_create_key(
        self,
        name: str,
        rpm_limit: int,
        rph_limit: int,
        rpd_limit: int,
        tpm_limit: int,
        tph_limit: int,
        tpd_limit: int,
        expires_at: Optional[str],
        notes: str,
    ) -> ApiKeyRecord:
        key_id = str(uuid.uuid4())
        key = _generate_key()
        created_at = _now_utc().isoformat()

        with self._lock:
            con = self._con()
            try:
                con.execute(
                    """
                    INSERT INTO api_keys
                        (id, key, name, is_active, rpm_limit, rph_limit, rpd_limit,
                         tpm_limit, tph_limit, tpd_limit, expires_at, created_at, notes)
                    VALUES (?,?,?,1,?,?,?,?,?,?,?,?,?)
                    """,
                    (key_id, key, name, rpm_limit, rph_limit, rpd_limit,
                     tpm_limit, tph_limit, tpd_limit, expires_at, created_at, notes),
                )
                con.commit()
            finally:
                con.close()

        return ApiKeyRecord(
            id=key_id, key=key, key_masked=_mask_key(key),
            name=name, is_active=True,
            rpm_limit=rpm_limit, rph_limit=rph_limit, rpd_limit=rpd_limit,
            tpm_limit=tpm_limit, tph_limit=tph_limit, tpd_limit=tpd_limit,
            expires_at=expires_at, created_at=created_at, notes=notes,
        )

    def _row_to_record(self, row: sqlite3.Row, full_key: bool = False) -> ApiKeyRecord:
        key = row["key"]
        return ApiKeyRecord(
            id=row["id"],
            key=key if full_key else "",
            key_masked=_mask_key(key),
            name=row["name"],
            is_active=bool(row["is_active"]),
            rpm_limit=row["rpm_limit"],
            rph_limit=row["rph_limit"],
            rpd_limit=row["rpd_limit"],
            tpm_limit=row["tpm_limit"],
            tph_limit=row["tph_limit"],
            tpd_limit=row["tpd_limit"],
            expires_at=row["expires_at"],
            created_at=row["created_at"],
            notes=row["notes"] or "",
        )

    def _sync_list_keys(self) -> list[ApiKeyRecord]:
        con = self._con()
        try:
            rows = con.execute(
                "SELECT * FROM api_keys ORDER BY created_at DESC"
            ).fetchall()
            return [self._row_to_record(r) for r in rows]
        finally:
            con.close()

    def _sync_get_key(self, key_id: str) -> Optional[ApiKeyRecord]:
        con = self._con()
        try:
            row = con.execute(
                "SELECT * FROM api_keys WHERE id=?", (key_id,)
            ).fetchone()
            return self._row_to_record(row) if row else None
        finally:
            con.close()

    def _sync_update_key(self, key_id: str, updates: dict) -> Optional[ApiKeyRecord]:
        allowed = {
            "name", "is_active", "rpm_limit", "rph_limit", "rpd_limit",
            "tpm_limit", "tph_limit", "tpd_limit", "expires_at", "notes",
        }
        clean = {k: v for k, v in updates.items() if k in allowed}
        if not clean:
            return self._sync_get_key(key_id)

        set_clause = ", ".join(f"{k}=?" for k in clean)
        values = list(clean.values()) + [key_id]

        with self._lock:
            con = self._con()
            try:
                con.execute(f"UPDATE api_keys SET {set_clause} WHERE id=?", values)
                con.commit()
            finally:
                con.close()

        return self._sync_get_key(key_id)

    def _sync_delete_key(self, key_id: str) -> bool:
        with self._lock:
            con = self._con()
            try:
                cur = con.execute("DELETE FROM api_keys WHERE id=?", (key_id,))
                con.commit()
                return cur.rowcount > 0
            finally:
                con.close()

    def _sync_get_stats(self, key_id: str) -> Optional[UsageStats]:
        now = _now_utc()
        con = self._con()
        try:
            if not con.execute(
                "SELECT 1 FROM api_keys WHERE id=?", (key_id,)
            ).fetchone():
                return None

            m = self._get_window_usage(con, key_id, "minute", now)
            h = self._get_window_usage(con, key_id, "hour", now)
            d = self._get_window_usage(con, key_id, "day", now)

            tot = con.execute(
                "SELECT * FROM usage_totals WHERE key_id=?", (key_id,)
            ).fetchone()

            return UsageStats(
                key_id=key_id,
                minute=m, hour=h, day=d,
                total_requests=tot["total_requests"] if tot else 0,
                total_tokens_input=tot["total_tok_in"] if tot else 0,
                total_tokens_output=tot["total_tok_out"] if tot else 0,
                last_used_at=tot["last_used_at"] if tot else None,
            )
        finally:
            con.close()

    def _sync_reset_usage(self, key_id: str) -> None:
        with self._lock:
            con = self._con()
            try:
                con.execute(
                    "DELETE FROM usage_windows WHERE key_id=?", (key_id,)
                )
                con.execute(
                    "DELETE FROM usage_totals WHERE key_id=?", (key_id,)
                )
                con.commit()
            finally:
                con.close()

    # ------------------------------------------------------------------
    # Public async API
    # ------------------------------------------------------------------

    async def validate_key(self, key: str) -> KeyValidationResult:
        return await asyncio.to_thread(self._sync_validate, key)

    async def record_usage(
        self, key_id: str, tokens_input: int = 0, tokens_output: int = 0
    ) -> None:
        try:
            await asyncio.to_thread(
                self._sync_record_usage, key_id, tokens_input, tokens_output
            )
        except Exception as e:
            logger.warning(f"Failed to record usage for key {key_id}: {e}")

    async def create_key(
        self,
        name: str,
        rpm_limit: int = -1,
        rph_limit: int = -1,
        rpd_limit: int = -1,
        tpm_limit: int = -1,
        tph_limit: int = -1,
        tpd_limit: int = -1,
        expires_at: Optional[str] = None,
        notes: str = "",
    ) -> ApiKeyRecord:
        return await asyncio.to_thread(
            self._sync_create_key,
            name, rpm_limit, rph_limit, rpd_limit,
            tpm_limit, tph_limit, tpd_limit,
            expires_at, notes,
        )

    async def list_keys(self) -> list[ApiKeyRecord]:
        return await asyncio.to_thread(self._sync_list_keys)

    async def get_key(self, key_id: str) -> Optional[ApiKeyRecord]:
        return await asyncio.to_thread(self._sync_get_key, key_id)

    async def update_key(self, key_id: str, **kwargs) -> Optional[ApiKeyRecord]:
        return await asyncio.to_thread(self._sync_update_key, key_id, kwargs)

    async def delete_key(self, key_id: str) -> bool:
        return await asyncio.to_thread(self._sync_delete_key, key_id)

    async def get_stats(self, key_id: str) -> Optional[UsageStats]:
        return await asyncio.to_thread(self._sync_get_stats, key_id)

    async def reset_usage(self, key_id: str) -> None:
        await asyncio.to_thread(self._sync_reset_usage, key_id)


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------

_key_manager: Optional[KeyManager] = None


def get_key_manager() -> KeyManager:
    if _key_manager is None:
        raise RuntimeError("KeyManager not initialized. Call initialize_key_manager() first.")
    return _key_manager


async def initialize_key_manager(db_path: str = "keys.db") -> KeyManager:
    global _key_manager
    _key_manager = KeyManager(db_path)
    await _key_manager.initialize()
    return _key_manager
