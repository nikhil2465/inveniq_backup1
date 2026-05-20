"""
Invoice Matching API — 3-Way Match: PO ↔ GRN ↔ Supplier Invoice.
Supports the P2P cycle step: GRN → Invoice Match → Discrepancy Detection → AP Approval.
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
                    CREATE TABLE IF NOT EXISTS invoice_matches (
                        match_id        INT AUTO_INCREMENT PRIMARY KEY,
                        match_number    VARCHAR(40)    NOT NULL UNIQUE,
                        po_number       VARCHAR(40)    NOT NULL,
                        grn_number      VARCHAR(40)    NOT NULL,
                        invoice_number  VARCHAR(80)    NOT NULL,
                        supplier_name   VARCHAR(150)   NOT NULL,
                        invoice_date    DATE           NOT NULL,
                        po_value        DECIMAL(14,2)  NOT NULL DEFAULT 0,
                        grn_value       DECIMAL(14,2)  NOT NULL DEFAULT 0,
                        invoice_value   DECIMAL(14,2)  NOT NULL DEFAULT 0,
                        discrepancy_amt DECIMAL(14,2)  NOT NULL DEFAULT 0,
                        match_status    ENUM('MATCHED','DISCREPANCY','PENDING_REVIEW','APPROVED','PAID')
                                        NOT NULL DEFAULT 'PENDING_REVIEW',
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
    except Exception as exc:
        logger.warning("Invoice match table bootstrap failed: %s", exc)


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


# ── Mock data ──────────────────────────────────────────────────────────────────

_MOCK_MATCHES = [
    {"match_id": 1, "match_number": "IM-2026-001",
     "po_number": "PO-20260510-001", "grn_number": "GRN-20260512-001",
     "invoice_number": "EBCO/INV/2026/0341", "supplier_name": "Ebco India Pvt Ltd",
     "invoice_date": "2026-05-13",
     "po_value": 48500.00, "grn_value": 48500.00, "invoice_value": 48500.00,
     "discrepancy_amt": 0.00, "match_status": "APPROVED",
     "discrepancy_reason": None, "approved_by": "Finance Manager",
     "approved_at": "2026-05-14 10:00:00", "payment_due_date": "2026-06-13",
     "payment_terms": "Net 30", "notes": "Perfect 3-way match",
     "created_at": "2026-05-13 15:00:00"},
    {"match_id": 2, "match_number": "IM-2026-002",
     "po_number": "PO-20260515-003", "grn_number": "GRN-20260517-002",
     "invoice_number": "JAQ/2026/SW/4421", "supplier_name": "Jaquar India",
     "invoice_date": "2026-05-18",
     "po_value": 97000.00, "grn_value": 87300.00, "invoice_value": 97000.00,
     "discrepancy_amt": 9700.00, "match_status": "DISCREPANCY",
     "discrepancy_reason": "Invoice value exceeds GRN received value by ₹9,700. Short delivery on 2 line items.",
     "approved_by": None, "approved_at": None, "payment_due_date": "2026-06-18",
     "payment_terms": "Net 30", "notes": "Pending resolution with supplier",
     "created_at": "2026-05-18 12:00:00"},
    {"match_id": 3, "match_number": "IM-2026-003",
     "po_number": "PO-20260519-005", "grn_number": "GRN-20260520-001",
     "invoice_number": "HET/MAY/2026/1187", "supplier_name": "Hettich India",
     "invoice_date": "2026-05-20",
     "po_value": 38400.00, "grn_value": 38400.00, "invoice_value": 38400.00,
     "discrepancy_amt": 0.00, "match_status": "PENDING_REVIEW",
     "discrepancy_reason": None, "approved_by": None, "approved_at": None,
     "payment_due_date": "2026-06-20",
     "payment_terms": "Net 30", "notes": "Awaiting finance approval",
     "created_at": "2026-05-20 10:30:00"},
]


# ── Models ─────────────────────────────────────────────────────────────────────

class InvoiceMatchCreateIn(BaseModel):
    po_number: str
    grn_number: str
    invoice_number: str
    supplier_name: str
    invoice_date: str
    po_value: float
    grn_value: float
    invoice_value: float
    payment_terms: str = "Net 30"
    notes: Optional[str] = None


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


@router.post("/invoice-matching", summary="Create 3-Way Invoice Match", status_code=201)
async def create_match(payload: InvoiceMatchCreateIn):
    await _ensure_tables()
    today = datetime.date.today()
    ts    = datetime.datetime.utcnow().strftime("%m%d%H%M%S")
    match_number = f"IM-{today.year}-{ts}"

    discrepancy = round(abs(payload.invoice_value - payload.grn_value), 2)
    tol = 0.01 * payload.po_value  # 1% tolerance
    if discrepancy <= tol:
        match_status = "PENDING_REVIEW"
        discrepancy  = 0.0
    else:
        match_status = "DISCREPANCY"

    # Payment due based on terms
    days = int("".join(filter(str.isdigit, payload.payment_terms)) or 30)
    due_date = (datetime.datetime.strptime(payload.invoice_date, "%Y-%m-%d").date()
                + datetime.timedelta(days=days)).isoformat()

    if not _DB_AVAILABLE:
        return {"data_source": "demo", "match_number": match_number,
                "match_status": match_status, "discrepancy_amt": discrepancy}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO invoice_matches
                        (match_number, po_number, grn_number, invoice_number, supplier_name,
                         invoice_date, po_value, grn_value, invoice_value, discrepancy_amt,
                         match_status, payment_due_date, payment_terms, notes)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (match_number, payload.po_number, payload.grn_number,
                      payload.invoice_number, payload.supplier_name, payload.invoice_date,
                      payload.po_value, payload.grn_value, payload.invoice_value,
                      discrepancy, match_status, due_date, payload.payment_terms, payload.notes))
                match_id = cur.lastrowid
                return {"data_source": "mysql", "match_number": match_number,
                        "match_id": match_id, "match_status": match_status,
                        "discrepancy_amt": discrepancy, "payment_due_date": due_date}
    except Exception as exc:
        logger.error("Invoice match create error: %s", exc)
        return {"data_source": "demo", "match_number": match_number,
                "match_status": match_status, "discrepancy_amt": discrepancy}


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
                return {"data_source": "mysql", "match_id": match_id, "match_status": "PAID"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Mark paid error: %s", exc)
        return {"data_source": "demo", "match_id": match_id, "match_status": "PAID"}
