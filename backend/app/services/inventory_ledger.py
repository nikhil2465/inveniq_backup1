"""
Inventory Ledger Service — InvenIQ ERP
=======================================
Creates immutable stock movement entries for every inventory-affecting transaction.
Provides FIFO-style cost tracking, running balance, and full audit trail.

Movement Types:
  GRN_RECEIPT        — goods received via GRN (pending QC or direct accept)
  QC_ACCEPT          — QC-cleared goods moved to main stock
  QC_REJECT          — QC-rejected goods moved to rejection warehouse
  QC_HOLD            — goods placed in QC hold warehouse
  PURCHASE_RETURN    — goods returned to supplier (inventory reduction)
  LANDED_COST_ADJ    — cost adjustment after landed cost allocation
  SALE_DISPATCH      — goods dispatched on sales order
  DAMAGE_WRITEOFF    — damaged goods written off
  STOCK_ADJUSTMENT   — manual stock adjustment / cycle count correction
  TRANSFER           — inter-warehouse transfer
"""
import logging
from typing import Optional
from datetime import datetime, date

logger = logging.getLogger(__name__)

# ── Movement type constants ────────────────────────────────────────────────────
GRN_RECEIPT      = "GRN_RECEIPT"
QC_ACCEPT        = "QC_ACCEPT"
QC_REJECT        = "QC_REJECT"
QC_HOLD          = "QC_HOLD"
PURCHASE_RETURN  = "PURCHASE_RETURN"
LANDED_COST_ADJ  = "LANDED_COST_ADJ"
SALE_DISPATCH    = "SALE_DISPATCH"
DAMAGE_WRITEOFF  = "DAMAGE_WRITEOFF"
STOCK_ADJUSTMENT = "STOCK_ADJUSTMENT"
TRANSFER         = "TRANSFER"

INWARD_TYPES  = {GRN_RECEIPT, QC_ACCEPT, STOCK_ADJUSTMENT, TRANSFER}
OUTWARD_TYPES = {PURCHASE_RETURN, QC_REJECT, SALE_DISPATCH, DAMAGE_WRITEOFF}


# ── Table DDL (created by startup_migrations.py) ─────────────────────────────
STOCK_MOVEMENTS_DDL = """
CREATE TABLE IF NOT EXISTS stock_movements (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    movement_date   DATE            NOT NULL,
    movement_type   VARCHAR(30)     NOT NULL,
    direction       ENUM('IN','OUT','COST_ADJ') NOT NULL,

    -- References (all nullable for flexibility)
    sku_code        VARCHAR(100)    NOT NULL,
    sku_name        VARCHAR(300)    NOT NULL,
    warehouse_code  VARCHAR(100)    DEFAULT 'MAIN',

    ref_type        VARCHAR(30)     NOT NULL,   -- GRN / PO / QC / RETURN / MANUAL
    ref_number      VARCHAR(100)    NOT NULL,   -- e.g. GRN-2026-0042
    po_number       VARCHAR(100)    DEFAULT '',
    supplier_name   VARCHAR(200)    DEFAULT '',

    -- Quantities
    qty_in          DECIMAL(12,3)   DEFAULT 0,
    qty_out         DECIMAL(12,3)   DEFAULT 0,
    uom             VARCHAR(20)     DEFAULT 'Pcs',

    -- Costing
    unit_cost       DECIMAL(12,4)   DEFAULT 0,   -- cost per unit at time of movement
    total_cost      DECIMAL(14,2)   DEFAULT 0,   -- qty × unit_cost

    -- Running balance (snapshot at time of entry)
    qty_balance     DECIMAL(12,3)   DEFAULT 0,
    cost_balance    DECIMAL(14,2)   DEFAULT 0,

    -- Who + when
    created_by      VARCHAR(100)    DEFAULT 'system',
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT            DEFAULT '',

    INDEX idx_sku      (sku_code),
    INDEX idx_ref      (ref_number),
    INDEX idx_po       (po_number),
    INDEX idx_date     (movement_date),
    INDEX idx_type     (movement_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


async def record_movement(
    pool,
    *,
    movement_type: str,
    sku_code: str,
    sku_name: str,
    ref_type: str,
    ref_number: str,
    qty_in: float = 0.0,
    qty_out: float = 0.0,
    unit_cost: float = 0.0,
    warehouse_code: str = "MAIN",
    po_number: str = "",
    supplier_name: str = "",
    uom: str = "Pcs",
    created_by: str = "system",
    notes: str = "",
    movement_date: Optional[date] = None,
) -> Optional[dict]:
    """
    Insert one stock movement entry and return the record.
    Safe to call with pool=None (demo mode) — returns a synthetic record.
    All DB errors are caught and logged; caller is never blocked.
    """
    if movement_date is None:
        movement_date = date.today()

    direction = (
        "IN"       if movement_type in INWARD_TYPES else
        "OUT"      if movement_type in OUTWARD_TYPES else
        "COST_ADJ" if movement_type == LANDED_COST_ADJ else
        "IN"
    )
    total_cost = round(max(qty_in, qty_out) * unit_cost, 2)

    base_record = {
        "movement_type":  movement_type,
        "direction":      direction,
        "sku_code":       sku_code,
        "sku_name":       sku_name,
        "warehouse_code": warehouse_code,
        "ref_type":       ref_type,
        "ref_number":     ref_number,
        "po_number":      po_number,
        "supplier_name":  supplier_name,
        "qty_in":         round(qty_in, 3),
        "qty_out":        round(qty_out, 3),
        "uom":            uom,
        "unit_cost":      round(unit_cost, 4),
        "total_cost":     total_cost,
        "created_by":     created_by,
        "notes":          notes,
        "movement_date":  movement_date.isoformat(),
        "created_at":     datetime.utcnow().isoformat(),
    }

    if pool is None:
        base_record.update({"id": 0, "qty_balance": qty_in - qty_out, "cost_balance": total_cost})
        return base_record

    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                # Running balance from last movement for this SKU+warehouse
                await cur.execute(
                    "SELECT qty_balance, cost_balance FROM stock_movements "
                    "WHERE sku_code=%s AND warehouse_code=%s "
                    "ORDER BY id DESC LIMIT 1",
                    (sku_code, warehouse_code),
                )
                row = await cur.fetchone()
                prev_qty_bal  = float(row[0]) if row else 0.0
                prev_cost_bal = float(row[1]) if row else 0.0

                qty_balance  = round(prev_qty_bal  + qty_in  - qty_out, 3)
                cost_balance = round(prev_cost_bal + total_cost * (1 if direction == "IN" else -1), 2)

                await cur.execute(
                    """INSERT INTO stock_movements
                       (movement_date, movement_type, direction,
                        sku_code, sku_name, warehouse_code,
                        ref_type, ref_number, po_number, supplier_name,
                        qty_in, qty_out, uom,
                        unit_cost, total_cost, qty_balance, cost_balance,
                        created_by, notes)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        movement_date, movement_type, direction,
                        sku_code, sku_name, warehouse_code,
                        ref_type, ref_number, po_number, supplier_name,
                        qty_in, qty_out, uom,
                        unit_cost, total_cost, qty_balance, cost_balance,
                        created_by, notes,
                    ),
                )
                new_id = cur.lastrowid
                base_record.update({"id": new_id, "qty_balance": qty_balance, "cost_balance": cost_balance})
                logger.info(
                    "Stock movement %s: %s %s %.3f %s @ ₹%.2f — ref %s",
                    new_id, movement_type, sku_code, max(qty_in, qty_out), uom, unit_cost, ref_number,
                )
                return base_record
    except Exception as exc:
        logger.error("inventory_ledger.record_movement failed: %s", exc)
        base_record.update({"id": 0, "qty_balance": 0, "cost_balance": 0, "error": str(exc)})
        return base_record


async def get_ledger(
    pool,
    sku_code: str,
    warehouse_code: str = "",
    limit: int = 100,
) -> list[dict]:
    """Return stock movement history for a SKU, newest first."""
    if pool is None:
        return []
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                if warehouse_code:
                    await cur.execute(
                        "SELECT * FROM stock_movements WHERE sku_code=%s AND warehouse_code=%s "
                        "ORDER BY id DESC LIMIT %s",
                        (sku_code, warehouse_code, limit),
                    )
                else:
                    await cur.execute(
                        "SELECT * FROM stock_movements WHERE sku_code=%s ORDER BY id DESC LIMIT %s",
                        (sku_code, limit),
                    )
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row)) for row in await cur.fetchall()]
    except Exception as exc:
        logger.error("inventory_ledger.get_ledger failed: %s", exc)
        return []


async def get_sku_balance(pool, sku_code: str, warehouse_code: str = "MAIN") -> dict:
    """Return current qty balance and weighted average cost for a SKU."""
    if pool is None:
        return {"sku_code": sku_code, "qty_balance": 0, "cost_balance": 0, "avg_cost": 0}
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT qty_balance, cost_balance FROM stock_movements "
                    "WHERE sku_code=%s AND warehouse_code=%s ORDER BY id DESC LIMIT 1",
                    (sku_code, warehouse_code),
                )
                row = await cur.fetchone()
                if row:
                    qty  = float(row[0])
                    cost = float(row[1])
                    return {
                        "sku_code":     sku_code,
                        "warehouse":    warehouse_code,
                        "qty_balance":  qty,
                        "cost_balance": cost,
                        "avg_cost":     round(cost / qty, 4) if qty > 0 else 0,
                    }
    except Exception as exc:
        logger.error("inventory_ledger.get_sku_balance failed: %s", exc)
    return {"sku_code": sku_code, "qty_balance": 0, "cost_balance": 0, "avg_cost": 0}
