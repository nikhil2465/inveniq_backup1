"""
QC Inspection API — Post-GRN quality control for hardware & sanitary industry.
Supports the P2P cycle step: GRN → QC Inspection → Accept to Inventory or RTV.

Inventory posting logic (runs post-commit, non-blocking):
  - GRN_RECEIPT (recorded at GRN time) already added received qty to the stock ledger.
  - QC_REJECT removes rejected qty from the ledger (net balance = accepted qty).
  - QC_ACCEPT does NOT record a separate ledger movement to avoid double-counting.
  - Updates grn.qc_completed = 1 so invoice_matching can proceed.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["QC Inspection"])

try:
    from app.db.connection import get_pool
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False

try:
    from app.services.inventory_ledger import record_movement as _ledger_move
    _LEDGER_AVAILABLE = True
except ImportError:
    _LEDGER_AVAILABLE = False
    _ledger_move = None

try:
    from app.services.audit_logger import log_action as _audit_log
    _AUDIT_AVAILABLE = True
except ImportError:
    _AUDIT_AVAILABLE = False
    _audit_log = None


# ── DB bootstrap ───────────────────────────────────────────────────────────────

async def _ensure_tables():
    if not _DB_AVAILABLE:
        return
    try:
        pool = await get_pool()
        if not pool:
            return
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS qc_inspections (
                        qc_id           INT AUTO_INCREMENT PRIMARY KEY,
                        inspection_no   VARCHAR(40)  NOT NULL UNIQUE,
                        grn_number      VARCHAR(40),
                        po_number       VARCHAR(40),
                        supplier_name   VARCHAR(150) NOT NULL,
                        inspector_name  VARCHAR(100) NOT NULL,
                        inspection_date DATE         NOT NULL,
                        status          ENUM('PENDING','IN_PROGRESS','ACCEPTED','PARTIAL','REJECTED')
                                        NOT NULL DEFAULT 'PENDING',
                        batch_no        VARCHAR(50),
                        category        VARCHAR(80)  NOT NULL DEFAULT 'Hardware Fittings',
                        total_qty_inspected DECIMAL(10,2) NOT NULL DEFAULT 0,
                        accepted_qty    DECIMAL(10,2) NOT NULL DEFAULT 0,
                        rejected_qty    DECIMAL(10,2) NOT NULL DEFAULT 0,
                        rejection_reason TEXT,
                        rtv_initiated   TINYINT(1)   NOT NULL DEFAULT 0,
                        notes           TEXT,
                        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS qc_checklist_items (
                        check_id        INT AUTO_INCREMENT PRIMARY KEY,
                        qc_id           INT          NOT NULL,
                        parameter       VARCHAR(120) NOT NULL,
                        standard_value  VARCHAR(80),
                        actual_value    VARCHAR(80),
                        result          ENUM('PASS','FAIL','NA') NOT NULL DEFAULT 'NA',
                        remarks         VARCHAR(200),
                        FOREIGN KEY (qc_id) REFERENCES qc_inspections(qc_id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
    except Exception as exc:
        logger.warning("QC table bootstrap failed: %s", exc)


# ── DB helpers ─────────────────────────────────────────────────────────────────

async def _db_list(status: str, limit: int, offset: int):
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                if status:
                    await cur.execute("""
                        SELECT * FROM qc_inspections WHERE status=%s
                        ORDER BY created_at DESC LIMIT %s OFFSET %s
                    """, (status, limit, offset))
                else:
                    await cur.execute("""
                        SELECT * FROM qc_inspections
                        ORDER BY created_at DESC LIMIT %s OFFSET %s
                    """, (limit, offset))
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, r)) for r in rows]
    except Exception as exc:
        logger.warning("QC list DB error: %s", exc)
        return None


async def _db_get(qc_id: int):
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT * FROM qc_inspections WHERE qc_id=%s", (qc_id,))
                row = await cur.fetchone()
                if not row:
                    return {}
                cols = [d[0] for d in cur.description]
                qc = dict(zip(cols, row))
                await cur.execute("SELECT * FROM qc_checklist_items WHERE qc_id=%s ORDER BY check_id", (qc_id,))
                irows = await cur.fetchall()
                icols = [d[0] for d in cur.description]
                qc["checklist"] = [dict(zip(icols, r)) for r in irows]
                return qc
    except Exception as exc:
        logger.warning("QC get DB error: %s", exc)
        return None


# ── Post-decision inventory + GRN flag update ──────────────────────────────────

async def _post_qc_inventory(
    pool,
    grn_number: str,
    inspection_no: str,
    accepted_qty: float,
    rejected_qty: float,
    supplier_name: str,
) -> dict:
    """
    Called after QC decision is committed.
    - Records QC_REJECT movements (proportional across GRN lines) in stock_movements.
    - Updates grn.qc_completed = 1, grn.qc_reference = inspection_no.
    - Updates grn_line_items.qc_status for all lines of this GRN.
    Returns a summary dict; never raises (all errors are logged and suppressed).
    """
    result = {"inventory_updated": False, "grn_flagged": False, "lines_updated": 0}
    if not grn_number:
        return result

    # ── Update grn table ──────────────────────────────────────────────────────
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE grn SET qc_completed = 1, qc_reference = %s WHERE grn_number = %s",
                    (inspection_no, grn_number),
                )
            await conn.commit()
        result["grn_flagged"] = True
    except Exception as exc:
        logger.warning("QC: failed to update grn.qc_completed for %s — %s", grn_number, exc)

    # ── Fetch GRN line items for per-SKU inventory posting ────────────────────
    grn_lines = []
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT id, sku_code, sku_name, qty_received, unit_cost
                       FROM grn_line_items WHERE grn_number = %s AND qty_received > 0""",
                    (grn_number,),
                )
                rows = await cur.fetchall()
                if rows:
                    grn_lines = [
                        {"id": r[0], "sku_code": r[1], "sku_name": r[2],
                         "qty_received": float(r[3] or 0), "unit_cost": float(r[4] or 0)}
                        for r in rows
                    ]
    except Exception as exc:
        logger.warning("QC: could not fetch grn_line_items for %s — %s", grn_number, exc)

    if not grn_lines:
        logger.info("QC: no grn_line_items found for %s — skipping per-line inventory/QC update", grn_number)
        return result

    total_received = sum(ln["qty_received"] for ln in grn_lines)
    if total_received <= 0:
        return result

    # Determine final QC status per line
    if rejected_qty <= 0:
        line_qc_status = "ACCEPTED"
    elif accepted_qty <= 0:
        line_qc_status = "REJECTED"
    else:
        line_qc_status = "PARTIAL"

    # ── Per-line: update qc_status + record QC_REJECT in ledger ──────────────
    lines_updated = 0
    for ln in grn_lines:
        weight = ln["qty_received"] / total_received

        # Proportional split of rejected qty across lines
        line_rejected = round(rejected_qty * weight, 3)
        line_accepted = max(0.0, round(ln["qty_received"] - line_rejected, 3))

        # Update grn_line_items QC columns
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """UPDATE grn_line_items
                           SET qc_status = %s, accepted_qty = %s, rejected_qty = %s
                           WHERE id = %s""",
                        (line_qc_status, line_accepted, line_rejected, ln["id"]),
                    )
                await conn.commit()
            lines_updated += 1
        except Exception as exc:
            logger.warning("QC: grn_line_items update failed (id=%s) — %s", ln["id"], exc)

        # Record QC_REJECT movement in stock ledger (reduces balance)
        if line_rejected > 0 and _LEDGER_AVAILABLE and _ledger_move:
            try:
                await _ledger_move(
                    pool,
                    movement_type="QC_REJECT",
                    sku_code=ln["sku_code"] or f"GRN-{grn_number}",
                    sku_name=ln["sku_name"] or supplier_name,
                    ref_type="QC",
                    ref_number=inspection_no,
                    qty_in=0.0,
                    qty_out=line_rejected,
                    unit_cost=ln["unit_cost"],
                    notes=f"QC rejection — {grn_number}",
                )
            except Exception as exc:
                logger.warning("QC: QC_REJECT ledger move failed (sku=%s) — %s", ln["sku_code"], exc)

    result["inventory_updated"] = True
    result["lines_updated"]     = lines_updated
    return result


# ── Mock data ──────────────────────────────────────────────────────────────────

_DEFAULT_CHECKLIST = [
    {"parameter": "Packaging Intact",        "standard_value": "Yes",        "result": "PASS"},
    {"parameter": "Quantity as per DC",       "standard_value": "Match",      "result": "PASS"},
    {"parameter": "Brand Label Present",      "standard_value": "Yes",        "result": "PASS"},
    {"parameter": "No Physical Damage",       "standard_value": "Yes",        "result": "PASS"},
    {"parameter": "Finish / Coating Quality", "standard_value": "Acceptable", "result": "PASS"},
    {"parameter": "Dimensions within Spec",   "standard_value": "±2mm",       "result": "PASS"},
    {"parameter": "Batch/Lot Number Present", "standard_value": "Yes",        "result": "NA"},
]

_MOCK_QCS = [
    {"qc_id": 1, "inspection_no": "QCI-2026-001", "grn_number": "GRN-20260518-001",
     "po_number": "PO-20260518-001", "supplier_name": "Ebco India Pvt Ltd",
     "inspector_name": "Quality Lead", "inspection_date": "2026-05-18",
     "status": "ACCEPTED", "batch_no": "EB-MAY-01", "category": "Hardware Fittings",
     "total_qty_inspected": 500, "accepted_qty": 490, "rejected_qty": 10,
     "rejection_reason": "10 pcs with minor finish defects — returned", "rtv_initiated": 1,
     "notes": "Batch accepted with 98% pass rate", "created_at": "2026-05-18 11:00:00"},
    {"qc_id": 2, "inspection_no": "QCI-2026-002", "grn_number": "GRN-20260519-003",
     "po_number": "PO-20260516-002", "supplier_name": "Jaquar India",
     "inspector_name": "QC Team", "inspection_date": "2026-05-19",
     "status": "PENDING", "batch_no": "JAQ-Q2-B3", "category": "Sanitary CP Fittings",
     "total_qty_inspected": 0, "accepted_qty": 0, "rejected_qty": 0,
     "rejection_reason": None, "rtv_initiated": 0,
     "notes": "Awaiting inspection", "created_at": "2026-05-19 14:00:00"},
    {"qc_id": 3, "inspection_no": "QCI-2026-003", "grn_number": "GRN-20260520-001",
     "po_number": "PO-20260520-011", "supplier_name": "Hettich India",
     "inspector_name": "Quality Lead", "inspection_date": "2026-05-20",
     "status": "IN_PROGRESS", "batch_no": "HET-MAY-07", "category": "Kitchen Systems",
     "total_qty_inspected": 100, "accepted_qty": 95, "rejected_qty": 5,
     "rejection_reason": None, "rtv_initiated": 0,
     "notes": "Inspection in progress — 5 units under review", "created_at": "2026-05-20 09:30:00"},
]


# ── Models ─────────────────────────────────────────────────────────────────────

class ChecklistItemIn(BaseModel):
    parameter: str
    standard_value: Optional[str] = None
    actual_value:   Optional[str] = None
    result: str = "NA"
    remarks: Optional[str] = None


class QCCreateIn(BaseModel):
    grn_number: Optional[str] = None
    po_number:  Optional[str] = None
    supplier_name: str
    inspector_name: str
    batch_no: Optional[str] = None
    category: str = "Hardware Fittings"
    total_qty_inspected: float = 0
    notes: Optional[str] = None
    checklist: list[ChecklistItemIn] = []


class QCDecisionIn(BaseModel):
    accepted_qty:     float
    rejected_qty:     float
    rework_qty:       float = 0.0   # qty sent for rework (separate from accept/reject)
    hold_qty:         float = 0.0   # qty put on QC hold pending further review
    rejection_reason: Optional[str] = None
    initiate_rtv:     bool = False
    notes:            Optional[str] = None
    inspector_name:   Optional[str] = None


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/qc", summary="List QC Inspections")
async def list_qc(
    status: str = Query("", description="Filter by status"),
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    await _ensure_tables()
    data = await _db_list(status.upper() if status else "", limit, offset)
    if data is not None:
        return {"data_source": "mysql", "inspections": data, "total": len(data)}
    filtered = [q for q in _MOCK_QCS if not status or q["status"] == status.upper()]
    return {"data_source": "demo", "inspections": filtered[offset:offset+limit], "total": len(filtered)}


@router.get("/qc/kpis", summary="QC KPI summary")
async def qc_kpis():
    await _ensure_tables()
    if not _DB_AVAILABLE:
        return {"data_source": "demo", "pending": 1, "in_progress": 1, "accepted": 1,
                "rejected": 0, "partial": 0, "acceptance_rate": 98.0}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    SELECT
                        SUM(CASE WHEN status='PENDING'     THEN 1 ELSE 0 END) AS pending,
                        SUM(CASE WHEN status='IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
                        SUM(CASE WHEN status='ACCEPTED'    THEN 1 ELSE 0 END) AS accepted,
                        SUM(CASE WHEN status='REJECTED'    THEN 1 ELSE 0 END) AS rejected,
                        SUM(CASE WHEN status='PARTIAL'     THEN 1 ELSE 0 END) AS partial,
                        ROUND(
                            100.0 * SUM(accepted_qty) / NULLIF(SUM(total_qty_inspected),0), 1
                        ) AS acceptance_rate
                    FROM qc_inspections
                """)
                row = await cur.fetchone()
                cols = [d[0] for d in cur.description]
                result = dict(zip(cols, row)) if row else {}
                return {"data_source": "mysql", **{k: (v or 0) for k, v in result.items()}}
    except Exception as exc:
        logger.warning("QC kpis DB error: %s", exc)
        return {"data_source": "demo", "pending": 1, "in_progress": 1, "accepted": 1,
                "rejected": 0, "partial": 0, "acceptance_rate": 98.0}


@router.get("/qc/{qc_id}", summary="Get QC Inspection Detail")
async def get_qc(qc_id: int):
    await _ensure_tables()
    data = await _db_get(qc_id)
    if data is not None:
        if not data:
            raise HTTPException(404, "QC Inspection not found")
        return {"data_source": "mysql", "inspection": data}
    qc = next((q for q in _MOCK_QCS if q["qc_id"] == qc_id), None)
    if not qc:
        raise HTTPException(404, "QC Inspection not found")
    return {"data_source": "demo", "inspection": {**qc, "checklist": [
        {**c, "actual_value": c["standard_value"], "check_id": i+1, "qc_id": qc_id, "remarks": None}
        for i, c in enumerate(_DEFAULT_CHECKLIST)
    ]}}


@router.post("/qc", summary="Create QC Inspection", status_code=201)
async def create_qc(payload: QCCreateIn):
    await _ensure_tables()
    today = datetime.date.today()
    ts    = datetime.datetime.utcnow().strftime("%m%d%H%M%S")
    inspection_no = f"QCI-{today.year}-{ts}"

    if not _DB_AVAILABLE:
        return {"data_source": "demo", "inspection_no": inspection_no, "status": "PENDING"}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO qc_inspections
                        (inspection_no, grn_number, po_number, supplier_name, inspector_name,
                         inspection_date, status, batch_no, category, total_qty_inspected, notes)
                    VALUES (%s,%s,%s,%s,%s,%s,'PENDING',%s,%s,%s,%s)
                """, (inspection_no, payload.grn_number, payload.po_number,
                      payload.supplier_name, payload.inspector_name, today.isoformat(),
                      payload.batch_no, payload.category, payload.total_qty_inspected,
                      payload.notes))
                qc_id = cur.lastrowid
                for item in (payload.checklist or _DEFAULT_CHECKLIST):
                    av   = item.actual_value   if hasattr(item, "actual_value")   else None
                    sv   = item.standard_value if hasattr(item, "standard_value") else None
                    rem  = item.remarks        if hasattr(item, "remarks")        else None
                    res  = item.result         if hasattr(item, "result")         else "NA"
                    par  = item.parameter      if hasattr(item, "parameter")      else str(item.get("parameter", ""))
                    await cur.execute("""
                        INSERT INTO qc_checklist_items
                            (qc_id, parameter, standard_value, actual_value, result, remarks)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, (qc_id, par, sv, av, res, rem))
            await conn.commit()
            return {"data_source": "mysql", "inspection_no": inspection_no, "qc_id": qc_id, "status": "PENDING"}
    except Exception as exc:
        logger.error("QC create error: %s", exc)
        return {"data_source": "demo", "inspection_no": inspection_no, "status": "PENDING"}


@router.patch("/qc/{qc_id}/decision", summary="Record QC Accept / Reject decision")
async def qc_decision(qc_id: int, payload: QCDecisionIn):
    """
    Finalize a QC inspection with accepted/rejected quantities.

    Post-commit side effects (non-blocking — errors are logged, not raised):
    - QC_REJECT movements posted to stock_movements (reduces balance by rejected qty).
    - grn.qc_completed set to 1 + grn.qc_reference = inspection_no (enables invoice matching).
    - grn_line_items.qc_status updated for all lines of the linked GRN.
    """
    accepted   = float(payload.accepted_qty)
    rejected   = float(payload.rejected_qty)
    rework     = max(0.0, float(payload.rework_qty))
    hold       = max(0.0, float(payload.hold_qty))
    total      = accepted + rejected

    if total <= 0 and rework <= 0 and hold <= 0:
        raise HTTPException(422, "At least one of accepted_qty / rejected_qty / rework_qty / hold_qty must be > 0")
    if total <= 0:
        total = rework + hold  # pure rework/hold scenario

    # Determine status based on accepted/rejected; rework/hold cause PARTIAL
    if rework > 0 or hold > 0:
        status = "PARTIAL"
    elif rejected == 0:
        status = "ACCEPTED"
    elif accepted == 0:
        status = "REJECTED"
    else:
        status = "PARTIAL"

    if not _DB_AVAILABLE:
        return {"data_source": "demo", "qc_id": qc_id, "status": status}

    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")

        # Fetch QC record first — needed for post-decision inventory update
        grn_number    = ""
        inspection_no = ""
        supplier_name = ""
        po_number     = ""
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT grn_number, inspection_no, supplier_name, po_number FROM qc_inspections WHERE qc_id=%s",
                        (qc_id,),
                    )
                    row = await cur.fetchone()
            if row:
                grn_number, inspection_no, supplier_name, po_number = (
                    row[0] or "", row[1] or "", row[2] or "", row[3] or ""
                )
        except Exception as exc:
            logger.warning("QC: could not pre-fetch inspection record for qc_id=%s — %s", qc_id, exc)

        # Update qc_inspections with the final decision (including rework + hold)
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    UPDATE qc_inspections
                    SET status=%s, accepted_qty=%s, rejected_qty=%s,
                        rework_qty=COALESCE(%s, 0), hold_qty=COALESCE(%s, 0),
                        total_qty_inspected=%s, rejection_reason=%s,
                        rtv_initiated=%s, notes=COALESCE(%s, notes)
                    WHERE qc_id=%s
                """, (status, accepted, rejected, rework, hold,
                      accepted + rejected + rework + hold,
                      payload.rejection_reason, int(payload.initiate_rtv),
                      payload.notes, qc_id))
                if cur.rowcount == 0:
                    raise HTTPException(404, "QC Inspection not found")
            await conn.commit()

        # ── Update po_items: accepted_qty, rejected_qty, reduce qc_pending_qty (non-blocking) ──
        if po_number:
            try:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            UPDATE po_items
                            SET accepted_qty   = accepted_qty   + %s,
                                rejected_qty   = rejected_qty   + %s,
                                qc_pending_qty = GREATEST(0, qc_pending_qty - %s)
                            WHERE po_id = (
                                SELECT po_id FROM purchase_orders
                                WHERE po_number = %s LIMIT 1
                            )
                        """, (accepted, rejected, accepted + rejected + rework + hold, po_number))
                    await conn.commit()
            except Exception as exc:
                logger.warning("QC: po_items qty update failed for PO %s — %s", po_number, exc)

        # ── Post-commit side effects (non-blocking) ────────────────────────────
        inventory_result = {"inventory_updated": False, "grn_flagged": False, "lines_updated": 0}
        if grn_number:
            try:
                inventory_result = await _post_qc_inventory(
                    pool,
                    grn_number=grn_number,
                    inspection_no=inspection_no,
                    accepted_qty=accepted,
                    rejected_qty=rejected,
                    supplier_name=supplier_name,
                )
            except Exception as exc:
                logger.warning("QC: post-decision inventory update failed for %s — %s", grn_number, exc)

        # ── Check if PO is now COMPLETE (all GRNs QC-done) ───────────────────
        po_complete_msg = None
        if po_number:
            try:
                from app.db.po_grn_queries import mark_po_complete as _mark_complete
                cr = await _mark_complete(pool, po_number)
                if cr.get("success"):
                    po_complete_msg = cr.get("message")
            except Exception:
                pass

        total_inspected = accepted + rejected + rework + hold
        return {
            "data_source":     "mysql",
            "qc_id":           qc_id,
            "status":          status,
            "accepted_qty":    accepted,
            "rejected_qty":    rejected,
            "rework_qty":      rework,
            "hold_qty":        hold,
            "acceptance_rate": round(100 * accepted / total_inspected, 1) if total_inspected > 0 else 0,
            "rtv_initiated":   payload.initiate_rtv,
            "grn_flagged":     inventory_result["grn_flagged"],
            "inventory_updated": inventory_result["inventory_updated"],
            "lines_updated":   inventory_result["lines_updated"],
            "po_complete":     po_complete_msg,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("QC decision error: %s", exc)
        return {"data_source": "demo", "qc_id": qc_id, "status": status}
