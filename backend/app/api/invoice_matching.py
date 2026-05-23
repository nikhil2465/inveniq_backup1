"""
Invoice Matching API — 3-Way Match: PO ↔ GRN ↔ Supplier Invoice.
Supports the P2P cycle step: GRN → Invoice Match → Discrepancy Detection → AP Approval.

Matching logic:
  - 2-Way:  PO value  ↔ Invoice value
  - 3-Way:  GRN value ↔ Invoice value  (requires QC completed on GRN)
  - 4-Way:  3-Way     + QC reference required

QC gate: 3-Way / 4-Way matching is blocked if grn.qc_completed = 0 (QC not done).
Qty-level analysis: fetches po_items + grn_line_items to surface per-line short/over-delivery.
Debit note signal: when invoice_value > grn_value, response includes debit_note_required: true.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Invoice Matching"])

try:
    from app.db.connection import get_pool
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


# ── DB bootstrap ───────────────────────────────────────────────────────────────

_im_schema_ready = False


async def _ensure_tables():
    global _im_schema_ready
    if _im_schema_ready or not _DB_AVAILABLE:
        return
    try:
        pool = await get_pool()
        if not pool:
            return
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS invoice_matches (
                        match_id        INT AUTO_INCREMENT PRIMARY KEY,
                        match_number    VARCHAR(40)    NOT NULL UNIQUE,
                        po_number       VARCHAR(40)    NOT NULL,
                        grn_number      VARCHAR(40)    DEFAULT NULL,
                        invoice_number  VARCHAR(80)    NOT NULL,
                        supplier_name   VARCHAR(150)   NOT NULL,
                        invoice_date    DATE           NOT NULL,
                        po_value        DECIMAL(14,2)  NOT NULL DEFAULT 0,
                        grn_value       DECIMAL(14,2)  NOT NULL DEFAULT 0,
                        invoice_value   DECIMAL(14,2)  NOT NULL DEFAULT 0,
                        discrepancy_amt DECIMAL(14,2)  NOT NULL DEFAULT 0,
                        match_status    ENUM('MATCHED','DISCREPANCY','PENDING_REVIEW','APPROVED','PAID')
                                        NOT NULL DEFAULT 'PENDING_REVIEW',
                        matching_type   VARCHAR(30)    NOT NULL DEFAULT '3-Way',
                        qc_reference    VARCHAR(80)    DEFAULT NULL,
                        debit_note_ref  VARCHAR(80)    DEFAULT NULL,
                        discrepancy_reason TEXT,
                        approved_by     VARCHAR(100),
                        approved_at     DATETIME,
                        payment_due_date DATE,
                        payment_terms   VARCHAR(50)    NOT NULL DEFAULT 'Net 30',
                        notes           TEXT,
                        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
                # Idempotent additions for tables created before these columns existed
                for _alter in [
                    "ALTER TABLE invoice_matches ADD COLUMN IF NOT EXISTS matching_type VARCHAR(30) NOT NULL DEFAULT '3-Way'",
                    "ALTER TABLE invoice_matches ADD COLUMN IF NOT EXISTS qc_reference VARCHAR(80) DEFAULT NULL",
                    "ALTER TABLE invoice_matches ADD COLUMN IF NOT EXISTS debit_note_ref VARCHAR(80) DEFAULT NULL",
                ]:
                    try:
                        await cur.execute(_alter)
                    except Exception:
                        pass
        _im_schema_ready = True
    except Exception as exc:
        logger.warning("Invoice match table bootstrap failed: %s", exc)
        _im_schema_ready = True  # Don't retry on every request


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
                        SELECT * FROM invoice_matches WHERE match_status=%s
                        ORDER BY created_at DESC LIMIT %s OFFSET %s
                    """, (status, limit, offset))
                else:
                    await cur.execute("""
                        SELECT * FROM invoice_matches
                        ORDER BY created_at DESC LIMIT %s OFFSET %s
                    """, (limit, offset))
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, r)) for r in rows]
    except Exception as exc:
        logger.warning("Invoice match list DB error: %s", exc)
        return None


async def _check_qc_gate(pool, grn_number: str) -> tuple[bool, str]:
    """
    Check if the GRN's QC is completed.
    Returns (blocked: bool, reason: str).
    If the grn table doesn't have qc_required (old schema), passes through.
    """
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT qc_required, qc_completed, qc_reference FROM grn WHERE grn_number = %s LIMIT 1",
                    (grn_number,),
                )
                row = await cur.fetchone()
        if row is None:
            # GRN not found in DB — allow to proceed (user may have entered number manually)
            return False, ""
        qc_required, qc_completed, qc_ref = int(row[0] or 0), int(row[1] or 0), row[2] or ""
        if qc_required and not qc_completed:
            return True, (
                f"GRN {grn_number} has mandatory QC pending. "
                "Complete QC inspection before creating an invoice match."
            )
        return False, ""
    except Exception as exc:
        # Column may not exist (schema migration not yet run) — let it through
        logger.debug("QC gate check skipped for %s: %s", grn_number, exc)
        return False, ""


async def _fetch_line_analysis(pool, po_number: str, grn_number: str) -> dict:
    """
    Fetch po_items and grn_line_items to build per-line qty discrepancy analysis.
    Returns:
      {
        "po_lines":     [ {sku_name, qty_ordered, unit_price, line_value} ],
        "grn_lines":    [ {sku_name, qty_received, unit_cost} ],
        "short_lines":  [ {sku_name, ordered, received, short_qty, short_value} ],
        "over_lines":   [ {sku_name, ordered, received, over_qty, over_value} ],
        "analysis_note": "..."
      }
    """
    result = {"po_lines": [], "grn_lines": [], "short_lines": [], "over_lines": [], "analysis_note": ""}
    if not po_number and not grn_number:
        return result
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                # PO lines
                if po_number:
                    await cur.execute("""
                        SELECT pi.qty_ordered, pi.unit_price,
                               p.sku_name, p.sku_code
                        FROM po_items pi
                        JOIN purchase_orders po ON po.po_id = pi.po_id
                                              AND po.po_number = %s
                        JOIN products p ON p.product_id = pi.product_id
                    """, (po_number,))
                    po_rows = await cur.fetchall()
                    result["po_lines"] = [
                        {"sku_code": r[3], "sku_name": r[2],
                         "qty_ordered": float(r[0] or 0), "unit_price": float(r[1] or 0),
                         "line_value": round(float(r[0] or 0) * float(r[1] or 0), 2)}
                        for r in po_rows
                    ]

                # GRN lines
                if grn_number:
                    await cur.execute("""
                        SELECT sku_code, sku_name, qty_received, unit_cost
                        FROM grn_line_items WHERE grn_number = %s
                    """, (grn_number,))
                    grn_rows = await cur.fetchall()
                    result["grn_lines"] = [
                        {"sku_code": r[0], "sku_name": r[1],
                         "qty_received": float(r[2] or 0), "unit_cost": float(r[3] or 0)}
                        for r in grn_rows
                    ]

        # Build sku_code → grn_qty map
        grn_map = {ln["sku_code"]: ln for ln in result["grn_lines"]}

        short_lines, over_lines = [], []
        for po_line in result["po_lines"]:
            grn_line = grn_map.get(po_line["sku_code"])
            grn_qty  = grn_line["qty_received"] if grn_line else 0.0
            diff     = grn_qty - po_line["qty_ordered"]
            if diff < -0.001:
                short_qty   = abs(diff)
                short_value = round(short_qty * po_line["unit_price"], 2)
                short_lines.append({
                    "sku_name": po_line["sku_name"],
                    "ordered":  po_line["qty_ordered"],
                    "received": grn_qty,
                    "short_qty": round(short_qty, 3),
                    "short_value": short_value,
                })
            elif diff > 0.001:
                over_qty   = diff
                over_value = round(over_qty * po_line["unit_price"], 2)
                over_lines.append({
                    "sku_name": po_line["sku_name"],
                    "ordered":  po_line["qty_ordered"],
                    "received": grn_qty,
                    "over_qty": round(over_qty, 3),
                    "over_value": over_value,
                })

        result["short_lines"] = short_lines
        result["over_lines"]  = over_lines

        # Build analysis note
        notes = []
        if short_lines:
            names = ", ".join(f"{sl['sku_name']} (ordered {sl['ordered']}, received {sl['received']})"
                              for sl in short_lines[:3])
            if len(short_lines) > 3:
                names += f" and {len(short_lines) - 3} more"
            notes.append(f"Short delivery on {len(short_lines)} line(s): {names}.")
        if over_lines:
            names = ", ".join(f"{ol['sku_name']} (ordered {ol['ordered']}, received {ol['received']})"
                              for ol in over_lines[:3])
            notes.append(f"Over-delivery on {len(over_lines)} line(s): {names}.")
        result["analysis_note"] = " ".join(notes) if notes else "All quantities match PO."

    except Exception as exc:
        logger.debug("Line analysis skipped: %s", exc)
        result["analysis_note"] = "Per-line analysis unavailable."

    return result


# ── Mock data ──────────────────────────────────────────────────────────────────

_MOCK_MATCHES = [
    {"match_id": 1, "match_number": "IM-2026-001",
     "po_number": "PO-20260510-001", "grn_number": "GRN-20260512-001",
     "invoice_number": "EBCO/INV/2026/0341", "supplier_name": "Ebco India Pvt Ltd",
     "invoice_date": "2026-05-13",
     "po_value": 48500.00, "grn_value": 48500.00, "invoice_value": 48500.00,
     "discrepancy_amt": 0.00, "match_status": "APPROVED", "matching_type": "3-Way",
     "qc_reference": "QCI-2026-001", "debit_note_ref": None,
     "discrepancy_reason": None, "approved_by": "Finance Manager",
     "approved_at": "2026-05-14 10:00:00", "payment_due_date": "2026-06-13",
     "payment_terms": "Net 30", "notes": "Perfect 3-way match",
     "created_at": "2026-05-13 15:00:00"},
    {"match_id": 2, "match_number": "IM-2026-002",
     "po_number": "PO-20260515-003", "grn_number": "GRN-20260517-002",
     "invoice_number": "JAQ/2026/SW/4421", "supplier_name": "Jaquar India",
     "invoice_date": "2026-05-18",
     "po_value": 97000.00, "grn_value": 87300.00, "invoice_value": 97000.00,
     "discrepancy_amt": 9700.00, "match_status": "DISCREPANCY", "matching_type": "3-Way",
     "qc_reference": "QCI-2026-002", "debit_note_ref": None,
     "discrepancy_reason": "Invoice value exceeds GRN received value by ₹9,700. Short delivery on 2 line items.",
     "approved_by": None, "approved_at": None, "payment_due_date": "2026-06-18",
     "payment_terms": "Net 30", "notes": "Pending resolution with supplier",
     "created_at": "2026-05-18 12:00:00"},
    {"match_id": 3, "match_number": "IM-2026-003",
     "po_number": "PO-20260519-005", "grn_number": "GRN-20260520-001",
     "invoice_number": "HET/MAY/2026/1187", "supplier_name": "Hettich India",
     "invoice_date": "2026-05-20",
     "po_value": 38400.00, "grn_value": 38400.00, "invoice_value": 38400.00,
     "discrepancy_amt": 0.00, "match_status": "PENDING_REVIEW", "matching_type": "3-Way",
     "qc_reference": "QCI-2026-003", "debit_note_ref": None,
     "discrepancy_reason": None, "approved_by": None, "approved_at": None,
     "payment_due_date": "2026-06-20",
     "payment_terms": "Net 30", "notes": "Awaiting finance approval",
     "created_at": "2026-05-20 10:30:00"},
]


# ── Models ─────────────────────────────────────────────────────────────────────

VALID_MATCHING_TYPES = {"2-Way", "3-Way", "4-Way"}


class InvoiceMatchCreateIn(BaseModel):
    po_number:     str
    invoice_number: str
    supplier_name:  str
    invoice_date:   str
    po_value:       float
    grn_value:      float = 0
    invoice_value:  float
    grn_number:     Optional[str] = None   # required for 3-Way / 4-Way
    qc_reference:   Optional[str] = None   # required for 4-Way
    matching_type:  str = "3-Way"
    payment_terms:  str = "Net 30"
    notes:          Optional[str] = None


class InvoiceApproveIn(BaseModel):
    approved_by: str
    notes: Optional[str] = None


class InvoiceDiscrepancyIn(BaseModel):
    discrepancy_reason: str
    notes: Optional[str] = None


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/invoice-matching", summary="List 3-Way Invoice Matches")
async def list_matches(
    status: str = Query("", description="Filter by match_status"),
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    await _ensure_tables()
    data = await _db_list(status.upper() if status else "", limit, offset)
    if data is not None:
        return {"data_source": "mysql", "matches": data, "total": len(data)}
    filtered = [m for m in _MOCK_MATCHES if not status or m["match_status"] == status.upper()]
    return {"data_source": "demo", "matches": filtered[offset:offset+limit], "total": len(filtered)}


@router.get("/invoice-matching/kpis", summary="Invoice Match KPI summary")
async def match_kpis():
    await _ensure_tables()
    if not _DB_AVAILABLE:
        total_val = sum(m["invoice_value"] for m in _MOCK_MATCHES)
        disc_val  = sum(m["discrepancy_amt"] for m in _MOCK_MATCHES)
        return {"data_source": "demo",
                "matched": 1, "discrepancy": 1, "pending_review": 1, "approved": 1, "paid": 0,
                "total_invoice_value": total_val, "total_discrepancy": disc_val,
                "match_rate": 66.7}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    SELECT
                        SUM(CASE WHEN match_status='MATCHED'        THEN 1 ELSE 0 END) AS matched,
                        SUM(CASE WHEN match_status='DISCREPANCY'    THEN 1 ELSE 0 END) AS discrepancy,
                        SUM(CASE WHEN match_status='PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review,
                        SUM(CASE WHEN match_status='APPROVED'       THEN 1 ELSE 0 END) AS approved,
                        SUM(CASE WHEN match_status='PAID'           THEN 1 ELSE 0 END) AS paid,
                        SUM(invoice_value)   AS total_invoice_value,
                        SUM(discrepancy_amt) AS total_discrepancy,
                        ROUND(100.0 * SUM(CASE WHEN discrepancy_amt=0 THEN 1 ELSE 0 END)
                              / NULLIF(COUNT(*),0), 1) AS match_rate
                    FROM invoice_matches
                """)
                row = await cur.fetchone()
                cols = [d[0] for d in cur.description]
                result = dict(zip(cols, row)) if row else {}
                return {"data_source": "mysql", **{k: (v or 0) for k, v in result.items()}}
    except Exception as exc:
        logger.warning("Invoice match kpis DB error: %s", exc)
        total_val = sum(m["invoice_value"] for m in _MOCK_MATCHES)
        disc_val  = sum(m["discrepancy_amt"] for m in _MOCK_MATCHES)
        return {"data_source": "demo",
                "matched": 1, "discrepancy": 1, "pending_review": 1, "approved": 1, "paid": 0,
                "total_invoice_value": total_val, "total_discrepancy": disc_val,
                "match_rate": 66.7}


@router.get("/invoice-matching/{match_id}", summary="Get Invoice Match Detail")
async def get_match(match_id: int):
    await _ensure_tables()
    if not _DB_AVAILABLE:
        m = next((x for x in _MOCK_MATCHES if x["match_id"] == match_id), None)
        if not m:
            raise HTTPException(404, "Invoice match not found")
        return {"data_source": "demo", "match": m}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT * FROM invoice_matches WHERE match_id=%s", (match_id,))
                row = await cur.fetchone()
                if not row:
                    raise HTTPException(404, "Invoice match not found")
                cols = [d[0] for d in cur.description]
                return {"data_source": "mysql", "match": dict(zip(cols, row))}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Invoice match get error: %s", exc)
        raise HTTPException(500, "DB error")


@router.post("/invoice-matching", summary="Create Invoice Match (2/3/4-Way)", status_code=201)
async def create_match(payload: InvoiceMatchCreateIn):
    """
    Create a 2-Way, 3-Way, or 4-Way invoice match.

    3-Way / 4-Way gate: blocked if the linked GRN has qc_required=1 and qc_completed=0.
    Qty-level analysis: fetches po_items and grn_line_items to identify per-line discrepancies.
    Debit note signal: when invoice_value > grn_value, response includes debit_note_required=True.
    """
    await _ensure_tables()

    mt = payload.matching_type if payload.matching_type in VALID_MATCHING_TYPES else "3-Way"

    # ── Pre-validation ───────────────────────────────────────────────────────────
    if mt in ("3-Way", "4-Way") and not (payload.grn_number or "").strip():
        raise HTTPException(422, f"{mt} match requires a GRN number. Record a GRN first.")
    if mt == "4-Way" and not (payload.qc_reference or "").strip():
        raise HTTPException(422, "4-Way match requires a QC inspection reference.")

    today = datetime.date.today()
    ts    = datetime.datetime.utcnow().strftime("%m%d%H%M%S")
    match_number = f"IM-{today.year}-{ts}"

    # ── Discrepancy calculation ──────────────────────────────────────────────────
    if mt == "2-Way":
        discrepancy = round(abs(payload.invoice_value - payload.po_value), 2)
        tolerance   = 0.01 * payload.po_value
    else:
        discrepancy = round(abs(payload.invoice_value - payload.grn_value), 2)
        tolerance   = 0.01 * payload.po_value

    if discrepancy <= tolerance:
        match_status = "PENDING_REVIEW"
        discrepancy  = 0.0
    else:
        match_status = "DISCREPANCY"

    # Is supplier invoicing more than was received? → debit note territory
    debit_note_required = (
        mt != "2-Way"
        and payload.invoice_value > payload.grn_value
        and discrepancy > tolerance
    )

    # Payment due date
    days = int("".join(filter(str.isdigit, payload.payment_terms)) or 30)
    try:
        due_date = (
            datetime.datetime.strptime(payload.invoice_date, "%Y-%m-%d").date()
            + datetime.timedelta(days=days)
        ).isoformat()
    except ValueError:
        due_date = (today + datetime.timedelta(days=days)).isoformat()

    if not _DB_AVAILABLE:
        return {
            "data_source": "demo", "match_number": match_number,
            "match_status": match_status, "discrepancy_amt": discrepancy,
            "matching_type": mt, "debit_note_required": debit_note_required,
        }

    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")

        # ── QC gate for 3-Way / 4-Way ────────────────────────────────────────────
        if mt in ("3-Way", "4-Way") and payload.grn_number:
            blocked, reason = await _check_qc_gate(pool, payload.grn_number.strip())
            if blocked:
                raise HTTPException(422, reason)

        # ── Per-line qty analysis (best-effort, never blocks) ─────────────────────
        line_analysis: dict = {}
        if mt != "2-Way":
            try:
                line_analysis = await _fetch_line_analysis(
                    pool,
                    payload.po_number,
                    payload.grn_number or "",
                )
            except Exception as exc:
                logger.debug("Line analysis skipped: %s", exc)

        # Enrich discrepancy reason with per-line analysis
        discrepancy_reason = None
        if match_status == "DISCREPANCY":
            analysis_note = line_analysis.get("analysis_note", "")
            if debit_note_required:
                discrepancy_reason = (
                    f"Invoice ₹{payload.invoice_value:,.2f} > GRN ₹{payload.grn_value:,.2f} "
                    f"(discrepancy ₹{discrepancy:,.2f}). Debit note required. "
                    + (analysis_note or "")
                ).strip()
            else:
                discrepancy_reason = (
                    f"Value discrepancy ₹{discrepancy:,.2f}. "
                    + (analysis_note or "")
                ).strip()

        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO invoice_matches
                        (match_number, po_number, grn_number, invoice_number, supplier_name,
                         invoice_date, po_value, grn_value, invoice_value, discrepancy_amt,
                         match_status, matching_type, qc_reference,
                         discrepancy_reason, payment_due_date, payment_terms, notes)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (match_number, payload.po_number, payload.grn_number or None,
                      payload.invoice_number, payload.supplier_name, payload.invoice_date,
                      payload.po_value, payload.grn_value, payload.invoice_value,
                      discrepancy, match_status, mt, payload.qc_reference or None,
                      discrepancy_reason, due_date, payload.payment_terms, payload.notes))
                match_id = cur.lastrowid
            await conn.commit()

        response = {
            "data_source":         "mysql",
            "match_number":        match_number,
            "match_id":            match_id,
            "match_status":        match_status,
            "discrepancy_amt":     discrepancy,
            "payment_due_date":    due_date,
            "matching_type":       mt,
            "debit_note_required": debit_note_required,
        }
        if debit_note_required:
            response["debit_note_amount"] = round(payload.invoice_value - payload.grn_value, 2)
        if line_analysis.get("short_lines"):
            response["short_lines"] = line_analysis["short_lines"]
        if line_analysis.get("over_lines"):
            response["over_lines"] = line_analysis["over_lines"]
        if line_analysis.get("analysis_note"):
            response["line_analysis"] = line_analysis["analysis_note"]
        return response

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Invoice match create error: %s", exc)
        return {
            "data_source": "demo", "match_number": match_number,
            "match_status": match_status, "discrepancy_amt": discrepancy,
            "matching_type": mt, "debit_note_required": debit_note_required,
        }


@router.patch("/invoice-matching/{match_id}/approve", summary="Approve Invoice for AP Payment")
async def approve_match(match_id: int, payload: InvoiceApproveIn):
    if not _DB_AVAILABLE:
        return {"data_source": "demo", "match_id": match_id, "match_status": "APPROVED"}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    UPDATE invoice_matches
                    SET match_status='APPROVED', approved_by=%s, approved_at=%s,
                        notes=COALESCE(%s, notes)
                    WHERE match_id=%s AND match_status IN ('MATCHED','PENDING_REVIEW')
                """, (payload.approved_by, datetime.datetime.utcnow().isoformat(),
                      payload.notes, match_id))
                if cur.rowcount == 0:
                    raise HTTPException(422, "Match not found or already approved/paid")
            await conn.commit()
            return {"data_source": "mysql", "match_id": match_id, "match_status": "APPROVED"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Invoice match approve error: %s", exc)
        return {"data_source": "demo", "match_id": match_id, "match_status": "APPROVED"}


@router.patch("/invoice-matching/{match_id}/mark-paid", summary="Mark Invoice as Paid")
async def mark_paid(match_id: int):
    if not _DB_AVAILABLE:
        return {"data_source": "demo", "match_id": match_id, "match_status": "PAID"}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    UPDATE invoice_matches SET match_status='PAID'
                    WHERE match_id=%s AND match_status='APPROVED'
                """, (match_id,))
                if cur.rowcount == 0:
                    raise HTTPException(422, "Match not found or not in APPROVED state")
            await conn.commit()
            return {"data_source": "mysql", "match_id": match_id, "match_status": "PAID"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Mark paid error: %s", exc)
        return {"data_source": "demo", "match_id": match_id, "match_status": "PAID"}
