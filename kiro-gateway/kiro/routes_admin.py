# -*- coding: utf-8 -*-
"""
Admin API for key management.

All endpoints require Authorization: Bearer {PROXY_API_KEY} (master key).

Endpoints:
  GET    /admin/keys              — list all keys
  POST   /admin/keys              — create key
  GET    /admin/keys/{id}         — get key + current window usage
  PATCH  /admin/keys/{id}         — update limits / metadata
  DELETE /admin/keys/{id}         — permanently delete key
  POST   /admin/keys/{id}/revoke  — deactivate (soft delete)
  POST   /admin/keys/{id}/activate — reactivate
  POST   /admin/keys/{id}/reset-usage — zero out usage counters
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from kiro.config import PROXY_API_KEY
from kiro.key_manager import get_key_manager

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

_auth_header = APIKeyHeader(name="Authorization", auto_error=False)


async def _require_master(auth: Optional[str] = Security(_auth_header)) -> None:
    if auth and auth == f"Bearer {PROXY_API_KEY}":
        return
    raise HTTPException(status_code=401, detail="Master key required")


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CreateKeyRequest(BaseModel):
    name: str
    rpm_limit: int = -1    # requests per minute  (-1 = unlimited)
    rph_limit: int = -1    # requests per hour
    rpd_limit: int = -1    # requests per day
    tpm_limit: int = -1    # tokens per minute  (input + output)
    tph_limit: int = -1    # tokens per hour
    tpd_limit: int = -1    # tokens per day
    expires_at: Optional[str] = None   # ISO-8601 UTC, e.g. "2026-12-31T23:59:59+00:00"
    notes: str = ""


class UpdateKeyRequest(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    rpm_limit: Optional[int] = None
    rph_limit: Optional[int] = None
    rpd_limit: Optional[int] = None
    tpm_limit: Optional[int] = None
    tph_limit: Optional[int] = None
    tpd_limit: Optional[int] = None
    expires_at: Optional[str] = None
    notes: Optional[str] = None


def _key_to_dict(rec, include_full_key: bool = False) -> dict:
    return {
        "id": rec.id,
        "key": rec.key if include_full_key else rec.key_masked,
        "name": rec.name,
        "is_active": rec.is_active,
        "limits": {
            "rpm": rec.rpm_limit,
            "rph": rec.rph_limit,
            "rpd": rec.rpd_limit,
            "tpm": rec.tpm_limit,
            "tph": rec.tph_limit,
            "tpd": rec.tpd_limit,
        },
        "expires_at": rec.expires_at,
        "created_at": rec.created_at,
        "notes": rec.notes,
    }


def _stats_to_dict(stats) -> dict:
    def w(u):
        return {
            "requests": u.requests,
            "tokens_input": u.tokens_input,
            "tokens_output": u.tokens_output,
            "tokens_total": u.tokens_total,
        }
    return {
        "windows": {
            "minute": w(stats.minute),
            "hour": w(stats.hour),
            "day": w(stats.day),
        },
        "all_time": {
            "requests": stats.total_requests,
            "tokens_input": stats.total_tokens_input,
            "tokens_output": stats.total_tokens_output,
            "tokens_total": stats.total_tokens_input + stats.total_tokens_output,
        },
        "last_used_at": stats.last_used_at,
    }


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(_require_master)])


@router.get("/keys")
async def list_keys():
    km = get_key_manager()
    keys = await km.list_keys()
    return {"keys": [_key_to_dict(k) for k in keys], "total": len(keys)}


@router.post("/keys", status_code=201)
async def create_key(body: CreateKeyRequest):
    km = get_key_manager()
    rec = await km.create_key(
        name=body.name,
        rpm_limit=body.rpm_limit,
        rph_limit=body.rph_limit,
        rpd_limit=body.rpd_limit,
        tpm_limit=body.tpm_limit,
        tph_limit=body.tph_limit,
        tpd_limit=body.tpd_limit,
        expires_at=body.expires_at,
        notes=body.notes,
    )
    # Return full key once — never shown again in list
    return {
        "message": "Key created. Save the 'key' value now — it will not be shown again.",
        "key": _key_to_dict(rec, include_full_key=True),
    }


@router.get("/keys/{key_id}")
async def get_key(key_id: str):
    km = get_key_manager()
    rec = await km.get_key(key_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Key not found")
    stats = await km.get_stats(key_id)
    return {
        "key": _key_to_dict(rec),
        "usage": _stats_to_dict(stats) if stats else None,
    }


@router.patch("/keys/{key_id}")
async def update_key(key_id: str, body: UpdateKeyRequest):
    km = get_key_manager()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    rec = await km.update_key(key_id, **updates)
    if not rec:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"key": _key_to_dict(rec)}


@router.delete("/keys/{key_id}", status_code=204)
async def delete_key(key_id: str):
    km = get_key_manager()
    deleted = await km.delete_key(key_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Key not found")


@router.post("/keys/{key_id}/revoke")
async def revoke_key(key_id: str):
    km = get_key_manager()
    rec = await km.update_key(key_id, is_active=False)
    if not rec:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"message": "Key revoked", "key": _key_to_dict(rec)}


@router.post("/keys/{key_id}/activate")
async def activate_key(key_id: str):
    km = get_key_manager()
    rec = await km.update_key(key_id, is_active=True)
    if not rec:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"message": "Key activated", "key": _key_to_dict(rec)}


@router.post("/keys/{key_id}/reset-usage")
async def reset_usage(key_id: str):
    km = get_key_manager()
    rec = await km.get_key(key_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Key not found")
    await km.reset_usage(key_id)
    return {"message": "Usage counters reset"}


@router.get("/usage")
async def aggregate_usage():
    """Aggregate usage across all keys."""
    km = get_key_manager()
    keys = await km.list_keys()
    result = []
    for k in keys:
        stats = await km.get_stats(k.id)
        result.append({
            "id": k.id,
            "name": k.name,
            "key_masked": k.key_masked,
            "is_active": k.is_active,
            "usage": _stats_to_dict(stats) if stats else None,
        })
    return {"keys": result}
