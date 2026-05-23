"""
Audit Logger Service — InvenIQ ERP
====================================
Immutable per-field changelog for every P2P transaction.
Tracks: who changed what, from what value, to what value, when.

Supported entity types:
  PR, PO, GRN, QC, PURCHASE_RETURN, INVOICE_MATCH, LANDED_COST
"""
import json
import logging
from typing import Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

AUDIT_LOG_DDL = """
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entity_type     VARCHAR(30)     NOT NULL,    -- PR / PO / GRN / QC / RETURN / INVOICE / LC
    entity_id       VARCHAR(100)    NOT NULL,    -- e.g. PR-2026-0042
    action          VARCHAR(50)     NOT NULL,    -- CREATE / APPROVE / REJECT / STATUS_CHANGE / EDIT / DELETE
    field_name      VARCHAR(100)    DEFAULT '',  -- which field changed (empty for CREATE/DELETE)
    old_value       TEXT            DEFAULT '',
    new_value       TEXT            DEFAULT '',
    changed_by      VARCHAR(100)    NOT NULL,
    changed_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    ip_address      VARCHAR(45)     DEFAULT '',
    notes           TEXT            DEFAULT '',

    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_user   (changed_by),
    INDEX idx_date   (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# ── Action constants ──────────────────────────────────────────────────────────
CREATE        = "CREATE"
APPROVE       = "APPROVE"
REJECT        = "REJECT"
STATUS_CHANGE = "STATUS_CHANGE"
EDIT          = "EDIT"
CONVERT       = "CONVERT"
GRN_RECEIVE   = "GRN_RECEIVE"
QC_DECISION   = "QC_DECISION"
RETURN_RAISED = "RETURN_RAISED"
INVOICE_MATCH = "INVOICE_MATCH"
PAYMENT       = "PAYMENT"
CANCEL        = "CANCEL"
CLOSE         = "CLOSE"


def _serialize(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    return str(value)


async def log_action(
    pool,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    changed_by: str,
    field_name: str = "",
    old_value: Any = None,
    new_value: Any = None,
    ip_address: str = "",
    notes: str = "",
) -> None:
    """
    Append one audit log entry. Non-blocking — errors are logged but never raised.
    Safe to call with pool=None (demo mode).
    """
    if pool is None:
        logger.debug("AUDIT [demo] %s %s %s by %s", entity_type, entity_id, action, changed_by)
        return

    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO audit_log
                       (entity_type, entity_id, action, field_name,
                        old_value, new_value, changed_by, ip_address, notes)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        entity_type, entity_id, action, field_name,
                        _serialize(old_value), _serialize(new_value),
                        changed_by, ip_address, notes,
                    ),
                )
        logger.info("AUDIT: %s %s %s — %s", entity_type, entity_id, action, changed_by)
    except Exception as exc:
        logger.error("audit_logger.log_action failed: %s", exc)


async def log_status_change(
    pool,
    *,
    entity_type: str,
    entity_id: str,
    old_status: str,
    new_status: str,
    changed_by: str,
    notes: str = "",
) -> None:
    """Convenience wrapper for status transitions."""
    await log_action(
        pool,
        entity_type=entity_type,
        entity_id=entity_id,
        action=STATUS_CHANGE,
        changed_by=changed_by,
        field_name="status",
        old_value=old_status,
        new_value=new_status,
        notes=notes,
    )


async def log_create(
    pool,
    *,
    entity_type: str,
    entity_id: str,
    changed_by: str,
    snapshot: Optional[dict] = None,
    notes: str = "",
) -> None:
    """Log a CREATE event with an optional snapshot of initial values."""
    await log_action(
        pool,
        entity_type=entity_type,
        entity_id=entity_id,
        action=CREATE,
        changed_by=changed_by,
        field_name="",
        old_value=None,
        new_value=snapshot,
        notes=notes,
    )


async def get_history(pool, entity_type: str, entity_id: str) -> list[dict]:
    """Return full audit history for an entity, oldest first."""
    if pool is None:
        return []
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT entity_type, entity_id, action, field_name, "
                    "old_value, new_value, changed_by, changed_at, notes "
                    "FROM audit_log WHERE entity_type=%s AND entity_id=%s ORDER BY id ASC",
                    (entity_type, entity_id),
                )
                cols = ["entity_type", "entity_id", "action", "field_name",
                        "old_value", "new_value", "changed_by", "changed_at", "notes"]
                rows = await cur.fetchall()
                result = []
                for row in rows:
                    entry = dict(zip(cols, row))
                    entry["changed_at"] = str(entry["changed_at"])
                    for key in ("old_value", "new_value"):
                        try:
                            entry[key] = json.loads(entry[key]) if entry[key] else None
                        except (json.JSONDecodeError, TypeError):
                            pass
                    result.append(entry)
                return result
    except Exception as exc:
        logger.error("audit_logger.get_history failed: %s", exc)
        return []
