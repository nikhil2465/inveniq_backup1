"""
PO & GRN REST API endpoints.
Provides dashboard data for the PO & GRN page, and a create-PO action.
Both endpoints follow the same DB-first / mock-fallback pattern as the chat tools.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["PO & GRN"])

try:
    import aiomysql
    from app.db.connection import get_pool
    from app.db.po_grn_queries import (
        get_po_grn_dashboard,
        create_purchase_order as _db_create_po,
        create_grn as _db_create_grn,
        get_quotations as _db_get_quotations,
        ensure_approval_schema as _ensure_approval_schema,
        ensure_landing_cost_schema as _ensure_lc_schema,
        get_pending_approvals as _db_get_pending_approvals,
        approve_po as _db_approve_po,
        reject_po as _db_reject_po,
        release_po_to_supplier as _db_release_po,
        get_open_pos_with_freight as _db_get_open_pos_with_freight,
        get_purchase_returns as _db_get_purchase_returns,
        create_purchase_return as _db_create_purchase_return,
        approve_purchase_return as _db_approve_purchase_return,
        get_purchase_invoices as _db_get_purchase_invoices,
        approve_purchase_invoice as _db_approve_purchase_invoice,
        pay_purchase_invoice as _db_pay_purchase_invoice,
        create_purchase_invoice as _db_create_purchase_invoice,
        close_po as _db_close_po,
        cancel_remaining_qty as _db_cancel_remaining_qty,
        get_po_quantity_summary as _db_get_po_qty_summary,
        mark_po_complete as _db_mark_po_complete,
    )
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False
    aiomysql = None

_approval_schema_ready = False


async def _maybe_ensure_schema() -> None:
    """Lazily run all schema migrations once per process lifetime."""
    global _approval_schema_ready
    if _approval_schema_ready or not _DB_AVAILABLE:
        return
    try:
        pool = await get_pool()
        if pool:
            await _ensure_approval_schema(pool)
            await _ensure_lc_schema(pool)
    except Exception as exc:
        logger.warning("Schema migration check failed: %s", exc)
    finally:
        _approval_schema_ready = True


# ── GET /api/po-grn  ──────────────────────────────────────────────────────────

@router.get("/po-grn")
async def get_po_grn():
    """Return full PO & GRN dashboard: KPIs, open POs, GRN discrepancies."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                return await get_po_grn_dashboard(pool)
        except Exception as exc:
            logger.warning("PO/GRN DB fetch failed, using mock: %s", exc)

    return _mock_po_grn_data()


# ── POST /api/po  ─────────────────────────────────────────────────────────────

class CreatePORequest(BaseModel):
    supplier_name: str
    sku_name: str
    quantity: int
    unit_price: Optional[float] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    operation_type: Optional[str] = "Regular Purchase"
    freight_type: Optional[str] = "Supplier Own Operated"
    matching_type: Optional[str] = "3-Way"
    pr_number: Optional[str] = None
    # Optional fields passed by the scanner — used when auto-creating new product records
    category: Optional[str] = None
    unit: Optional[str] = None
    brand: Optional[str] = None


@router.post("/po")
async def create_po(req: CreatePORequest):
    """Create a new purchase order as DRAFT, pending sales & finance approval.
    DB mode: always persists — auto-creates supplier/product records if needed.
    Demo mode fallback: returns a structured DRAFT response for UI testing.
    """
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_create_po(pool, req.model_dump())
                if result.get("success"):
                    return result
                logger.info("PO demo fallback: %s", result.get("error"))
        except Exception as exc:
            logger.warning("DB PO creation failed, using demo: %s", exc)

    # Demo-mode mock response — always DRAFT
    po_number = f"PO-{datetime.date.today().strftime('%Y%m%d')}-DEMO"
    return {
        "success":        True,
        "po_number":      po_number,
        "status":         "DRAFT",
        "supplier":       req.supplier_name,
        "sku":            req.sku_name,
        "quantity":       req.quantity,
        "unit_price":     req.unit_price or 0,
        "total_value":    (req.unit_price or 0) * req.quantity,
        "expected_date":  req.expected_date or (
            datetime.date.today() + datetime.timedelta(days=7)
        ).isoformat(),
        "notes":          req.notes or "Created via InvenIQ AI Assistant",
        "operation_type": req.operation_type or "Regular Purchase",
        "freight_type":   req.freight_type or "Supplier Own Operated",
        "matching_type":  req.matching_type or "3-Way",
        "pr_number":      req.pr_number or None,
        "demo_mode":      True,
    }


# ── GET /api/po/pending-approvals  ───────────────────────────────────────────

@router.get("/po/pending-approvals")
async def get_pending_po_approvals():
    """Return all POs in DRAFT / PENDING_APPROVAL / APPROVED status with their approval levels."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                items = await _db_get_pending_approvals(pool)
                return {"pending_approvals": items, "data_source": "mysql"}
        except Exception as exc:
            logger.warning("Pending approvals DB fetch failed: %s", exc)
    return {"pending_approvals": _mock_pending_approvals(), "data_source": "mock"}


# ── Approval action models ────────────────────────────────────────────────────

class POApproveRequest(BaseModel):
    level: str          # 'sales' or 'finance'
    approver_name: str
    comments: Optional[str] = None


class PORejectRequest(BaseModel):
    level: str          # 'sales' or 'finance'
    approver_name: str
    reason: str


# ── PATCH /api/po/{po_number}/approve  ───────────────────────────────────────

@router.patch("/po/{po_number}/approve")
async def approve_po(po_number: str, req: POApproveRequest):
    """Approve a PO at 'sales' or 'finance' level. Promotes to APPROVED when both levels approve."""
    level = req.level.lower()
    if level not in ("sales", "finance"):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="level must be 'sales' or 'finance'")

    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_approve_po(
                    pool, po_number, level, req.approver_name, req.comments or ""
                )
                if result.get("success"):
                    return result
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail=result.get("error", "Approval failed"))
        except Exception as exc:
            logger.warning("PO approve DB failed: %s", exc)

    # Demo fallback
    return {
        "success":       True,
        "po_number":     po_number,
        "level":         level,
        "new_po_status": "PENDING_APPROVAL",
        "fully_approved": False,
        "demo_mode":     True,
    }


# ── PATCH /api/po/{po_number}/reject  ────────────────────────────────────────

@router.patch("/po/{po_number}/reject")
async def reject_po(po_number: str, req: PORejectRequest):
    """Reject a PO at 'sales' or 'finance' level and mark it as REJECTED."""
    level = req.level.lower()
    if level not in ("sales", "finance"):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="level must be 'sales' or 'finance'")

    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_reject_po(
                    pool, po_number, level, req.approver_name, req.reason
                )
                if result.get("success"):
                    return result
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail=result.get("error", "Rejection failed"))
        except Exception as exc:
            logger.warning("PO reject DB failed: %s", exc)

    return {
        "success":       True,
        "po_number":     po_number,
        "new_po_status": "REJECTED",
        "demo_mode":     True,
    }


# ── POST /api/po/{po_number}/release  ────────────────────────────────────────

@router.post("/po/{po_number}/release")
async def release_po(po_number: str):
    """Release a fully-approved PO to the supplier (APPROVED → OPEN)."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_release_po(pool, po_number)
                if result.get("success"):
                    return result
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail=result.get("error", "Release failed"))
        except Exception as exc:
            logger.warning("PO release DB failed: %s", exc)

    return {
        "success":    True,
        "po_number":  po_number,
        "new_status": "OPEN",
        "message":    "PO released to supplier.",
        "demo_mode":  True,
    }


# ── POST /api/po/{po_number}/close  ──────────────────────────────────────────

class POCloseRequest(BaseModel):
    closed_by: str
    reason: Optional[str] = None


@router.post("/po/{po_number}/close")
async def close_po(po_number: str, req: POCloseRequest):
    """Manually close a PO. Allowed from: FULLY_RECEIVED, RECEIVED, RETURNED, PARTIAL, COMPLETE, OPEN."""
    await _maybe_ensure_schema()
    if not req.closed_by or not req.closed_by.strip():
        raise HTTPException(status_code=422, detail="closed_by is required")

    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_close_po(pool, po_number, req.closed_by.strip(), req.reason or "")
                if not result.get("success"):
                    raise HTTPException(status_code=400, detail=result.get("error", "Close failed"))
                return result
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("close_po DB error: %s", exc)

    return {
        "success":    True, "po_number": po_number,
        "new_status": "CLOSED", "closed_by": req.closed_by,
        "message":    f"[DEMO] PO {po_number} closed.", "demo_mode": True,
    }


# ── GET /api/po/{po_number}/qty-summary  ─────────────────────────────────────

@router.get("/po/{po_number}/qty-summary")
async def get_po_qty_summary(po_number: str):
    """Return all 7 quantity types for a PO: ordered, received, accepted, rejected, returned, pending, qc_pending."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_get_po_qty_summary(pool, po_number)
                if result.get("success"):
                    return result
        except Exception as exc:
            logger.warning("get_po_qty_summary DB error: %s", exc)

    return {
        "success": True, "po_number": po_number, "data_source": "demo",
        "qty_ordered": 100, "qty_received": 60, "accepted_qty": 55, "rejected_qty": 5,
        "qty_returned": 0, "qc_pending_qty": 60, "pending_qty": 40, "fill_pct": 60.0,
    }


# ── POST /api/po/{po_number}/cancel-remaining  ────────────────────────────────

class CancelRemainingRequest(BaseModel):
    action: str           # 'CANCEL' | 'DEBIT_NOTE'
    cancelled_by: str
    reason: Optional[str] = None


@router.post("/po/{po_number}/cancel-remaining")
async def cancel_remaining(po_number: str, req: CancelRemainingRequest):
    """Cancel or raise debit note for remaining (pending) quantity on a partial PO."""
    await _maybe_ensure_schema()
    if not req.cancelled_by or not req.cancelled_by.strip():
        raise HTTPException(status_code=422, detail="cancelled_by is required")
    if req.action.upper() not in ("CANCEL", "DEBIT_NOTE"):
        raise HTTPException(status_code=422, detail="action must be 'CANCEL' or 'DEBIT_NOTE'")

    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_cancel_remaining_qty(
                    pool, po_number, req.action.upper(), req.cancelled_by.strip(), req.reason or ""
                )
                if not result.get("success"):
                    raise HTTPException(status_code=400, detail=result.get("error", "Operation failed"))
                return result
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("cancel_remaining DB error: %s", exc)

    return {
        "success": True, "po_number": po_number, "action": req.action.upper(),
        "message": f"[DEMO] Remaining qty marked as {req.action.upper()}.", "demo_mode": True,
    }


# ── POST /api/po/{po_number}/complete  ───────────────────────────────────────

@router.post("/po/{po_number}/complete")
async def mark_complete(po_number: str):
    """Mark a FULLY_RECEIVED PO as COMPLETE after all GRNs have QC completed."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_mark_po_complete(pool, po_number)
                if not result.get("success"):
                    raise HTTPException(status_code=400, detail=result.get("error", "Cannot mark COMPLETE"))
                return result
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("mark_complete DB error: %s", exc)

    return {
        "success": True, "po_number": po_number, "new_status": "COMPLETE",
        "message": f"[DEMO] PO {po_number} marked COMPLETE.", "demo_mode": True,
    }


@router.get("/po/{po_number}/grns")
async def get_po_grns(po_number: str):
    """List all GRNs associated with a purchase order (for multi-GRN invoicing)."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor(aiomysql.DictCursor) as cur:
                        await cur.execute("""
                            SELECT
                                g.grn_number,
                                g.received_date,
                                COALESCE(g.grn_value, g.invoice_value, 0) AS grn_value,
                                COALESCE(g.invoice_value, 0)              AS invoice_value,
                                g.match_status,
                                COALESCE(g.qc_completed, 0)               AS qc_completed,
                                COALESCE(SUM(gli.qty_received), 0)        AS qty_received,
                                COALESCE(
                                    GROUP_CONCAT(DISTINCT gli.sku_name ORDER BY gli.id SEPARATOR ' / '),
                                    ''
                                ) AS sku_names
                            FROM grn g
                            JOIN purchase_orders po
                                ON g.po_id = po.po_id AND po.po_number = %s
                            LEFT JOIN grn_line_items gli
                                ON g.grn_number = gli.grn_number
                            GROUP BY g.grn_number, g.received_date, g.grn_value,
                                     g.invoice_value, g.match_status, g.qc_completed
                            ORDER BY g.received_date DESC
                        """, (po_number,))
                        rows = await cur.fetchall()
                        return {
                            "data_source": "mysql",
                            "po_number":   po_number,
                            "grns":        [dict(r) for r in rows],
                        }
        except Exception as exc:
            logger.warning("get_po_grns DB error: %s", exc)
    return {"data_source": "demo", "po_number": po_number, "grns": []}


def _mock_pending_approvals() -> list:
    return [
        {
            "po_id": 101, "po_number": "PO-20260518-005",
            "supplier": "Ebco India Pvt. Ltd.",
            "sku": "Soft-Close Hinge 35mm Pk-10",
            "total_value": 48500.0, "expected_date": "2026-05-28",
            "status": "PENDING_APPROVAL", "po_date": "2026-05-18",
            "notes": "Monthly restocking — urgent",
            "approvals": {
                "sales": {
                    "status": "approved", "approver": "Rajesh Kumar",
                    "approved_at": "2026-05-19 10:30:00",
                    "comments": "Approved. Priority order.",
                },
                "finance": {
                    "status": "pending", "approver": None,
                    "approved_at": None, "comments": None,
                },
            },
        },
        {
            "po_id": 102, "po_number": "PO-20260519-008",
            "supplier": "Hettich India",
            "sku": "InnoTech Drawer 400mm",
            "total_value": 38400.0, "expected_date": "2026-05-30",
            "status": "DRAFT", "po_date": "2026-05-19",
            "notes": "Quarterly reorder — kitchen systems batch",
            "approvals": {
                "sales":   {"status": "pending", "approver": None, "approved_at": None, "comments": None},
                "finance": {"status": "pending", "approver": None, "approved_at": None, "comments": None},
            },
        },
        {
            "po_id": 103, "po_number": "PO-20260520-011",
            "supplier": "Jaquar India",
            "sku": "Lyric Basin Mixer Chrome",
            "total_value": 97000.0, "expected_date": "2026-06-01",
            "status": "APPROVED", "po_date": "2026-05-20",
            "notes": "Showroom display units",
            "approvals": {
                "sales": {
                    "status": "approved", "approver": "Rajesh Kumar",
                    "approved_at": "2026-05-20 09:00:00",
                    "comments": "High-value order — approved",
                },
                "finance": {
                    "status": "approved", "approver": "Finance Manager",
                    "approved_at": "2026-05-20 11:00:00",
                    "comments": "Budget available. Approved.",
                },
            },
        },
    ]


# ── GET /api/quotations  ─────────────────────────────────────────────────────

@router.get("/quotations")
async def get_quotations(industry: str = "all"):
    """Return supplier quotation comparisons per item, filterable by industry. DB-first."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                items = await _db_get_quotations(pool, industry)
                if items:
                    return {"quotations": items, "data_source": "mysql"}
        except Exception as exc:
            logger.warning("DB quotations failed, using mock: %s", exc)
    # Fallback to mock
    all_quotes = _mock_quotations()
    if industry != "all":
        all_quotes = [q for q in all_quotes if q.get("industry") == industry]
    return {"quotations": all_quotes, "data_source": "mock"}


def _mock_quotations():
    return [
        # ── PLYWOOD / BWP ─────────────────────────────────────────────────────
        {
            "item": "18mm BWP (8×4 ft)", "industry": "laminates",
            "category": "BWP Plywood", "unit": "per sheet",
            "last_purchased_rate": 640, "last_supplier": "Century Plyboards",
            "quotes": [
                {"supplier": "Century Plyboards", "rate": 640, "freight": 15,
                 "lead_time": "6 days", "moq": 100, "valid_till": "2026-04-30",
                 "reliability": 96, "notes": "ISI certified, consistent quality"},
                {"supplier": "Greenply Industries", "rate": 665, "freight": 12,
                 "lead_time": "5 days", "moq": 150, "valid_till": "2026-04-25",
                 "reliability": 84, "notes": "Faster delivery, premium packaging"},
                {"supplier": "Kitply Industries", "rate": 618, "freight": 18,
                 "lead_time": "8 days", "moq": 200, "valid_till": "2026-04-20",
                 "reliability": 71, "notes": "Cheapest rate, grade inconsistency reported"},
                {"supplier": "Archidply Industries", "rate": 598, "freight": 20,
                 "lead_time": "10 days", "moq": 250, "valid_till": "2026-04-18",
                 "reliability": 68, "notes": "Lowest rate — verify grade before ordering"},
            ],
        },
        {
            "item": "12mm MR Plain (8×4 ft)", "industry": "laminates",
            "category": "MR Plywood", "unit": "per sheet",
            "last_purchased_rate": 295, "last_supplier": "Greenply Industries",
            "quotes": [
                {"supplier": "Century Plyboards", "rate": 310, "freight": 14,
                 "lead_time": "6 days", "moq": 100, "valid_till": "2026-04-30",
                 "reliability": 96, "notes": ""},
                {"supplier": "Greenply Industries", "rate": 295, "freight": 11,
                 "lead_time": "5 days", "moq": 200, "valid_till": "2026-04-28",
                 "reliability": 84, "notes": "Bulk discount >500 sheets"},
                {"supplier": "Archidply Industries", "rate": 278, "freight": 19,
                 "lead_time": "9 days", "moq": 300, "valid_till": "2026-04-22",
                 "reliability": 68, "notes": "High MOQ, plan 10 days ahead"},
            ],
        },
        # ── HPL LAMINATES ─────────────────────────────────────────────────────
        {
            "item": "HPL 1mm Matte (8×4 ft)", "industry": "laminates",
            "category": "High Pressure Laminate", "unit": "per sheet",
            "last_purchased_rate": 1080, "last_supplier": "Greenlam Industries",
            "quotes": [
                {"supplier": "Merino Industries", "rate": 1150, "freight": 22,
                 "lead_time": "7 days", "moq": 50, "valid_till": "2026-05-15",
                 "reliability": 94, "notes": "Premium finish, consistent colour match"},
                {"supplier": "Greenlam Industries", "rate": 1080, "freight": 18,
                 "lead_time": "6 days", "moq": 50, "valid_till": "2026-05-10",
                 "reliability": 91, "notes": "Best overall value"},
                {"supplier": "Action Tesa", "rate": 990, "freight": 25,
                 "lead_time": "8 days", "moq": 100, "valid_till": "2026-04-30",
                 "reliability": 82, "notes": "Competitive rate, wider colour range"},
                {"supplier": "Formica India", "rate": 1225, "freight": 20,
                 "lead_time": "5 days", "moq": 30, "valid_till": "2026-05-20",
                 "reliability": 97, "notes": "International brand, highest reliability"},
            ],
        },
        {
            "item": "HPL Compact 6mm (8×4 ft)", "industry": "laminates",
            "category": "Compact Laminate", "unit": "per sheet",
            "last_purchased_rate": 2980, "last_supplier": "Greenlam Industries",
            "quotes": [
                {"supplier": "Merino Industries", "rate": 3200, "freight": 35,
                 "lead_time": "7 days", "moq": 20, "valid_till": "2026-05-15",
                 "reliability": 94, "notes": "FR-rated option available"},
                {"supplier": "Greenlam Industries", "rate": 2980, "freight": 28,
                 "lead_time": "6 days", "moq": 25, "valid_till": "2026-05-10",
                 "reliability": 91, "notes": ""},
                {"supplier": "Stylam Industries", "rate": 2750, "freight": 40,
                 "lead_time": "10 days", "moq": 30, "valid_till": "2026-04-28",
                 "reliability": 79, "notes": "Lowest rate, longer lead time"},
            ],
        },
        {
            "item": "Acrylic Laminate (8×4 ft)", "industry": "laminates",
            "category": "Acrylic / High Gloss", "unit": "per sheet",
            "last_purchased_rate": 1720, "last_supplier": "Durian Industries",
            "quotes": [
                {"supplier": "Action Tesa", "rate": 1850, "freight": 28,
                 "lead_time": "8 days", "moq": 25, "valid_till": "2026-05-01",
                 "reliability": 82, "notes": "Widest colour palette (180+ shades)"},
                {"supplier": "Durian Industries", "rate": 1720, "freight": 22,
                 "lead_time": "7 days", "moq": 20, "valid_till": "2026-04-30",
                 "reliability": 88, "notes": "Anti-scratch coating included"},
                {"supplier": "Merino Industries", "rate": 1960, "freight": 24,
                 "lead_time": "6 days", "moq": 30, "valid_till": "2026-05-10",
                 "reliability": 94, "notes": "Premium UV-resistant grade"},
            ],
        },
        # ── LOUVER PROFILES ───────────────────────────────────────────────────
        {
            "item": "Aluminium Z-Profile 100mm Anodized", "industry": "louvers",
            "category": "Aluminium Louvers", "unit": "per RM",
            "last_purchased_rate": 1720, "last_supplier": "Supreme Profile India",
            "quotes": [
                {"supplier": "Alufit Systems", "rate": 1850, "freight": 45,
                 "lead_time": "10 days", "moq": 50, "valid_till": "2026-05-15",
                 "reliability": 92, "notes": "AA-25 anodizing, QUALICOAT certified"},
                {"supplier": "Supreme Profile India", "rate": 1720, "freight": 38,
                 "lead_time": "8 days", "moq": 75, "valid_till": "2026-05-10",
                 "reliability": 85, "notes": "Best price for bulk orders >200 RM"},
                {"supplier": "Alumax Profiles", "rate": 1680, "freight": 52,
                 "lead_time": "12 days", "moq": 100, "valid_till": "2026-05-05",
                 "reliability": 78, "notes": "Cheaper, verify anodize thickness"},
                {"supplier": "Jindal Aluminium", "rate": 1790, "freight": 35,
                 "lead_time": "9 days", "moq": 60, "valid_till": "2026-05-20",
                 "reliability": 95, "notes": "Most reliable, consistent alloy grade"},
            ],
        },
        {
            "item": "Aluminium Z-Profile 80mm Powder Coated", "industry": "louvers",
            "category": "Aluminium Louvers", "unit": "per RM",
            "last_purchased_rate": 1350, "last_supplier": "Aluline India",
            "quotes": [
                {"supplier": "Alufit Systems", "rate": 1480, "freight": 40,
                 "lead_time": "12 days", "moq": 50, "valid_till": "2026-05-15",
                 "reliability": 92, "notes": "PVDF coating, 20-yr warranty"},
                {"supplier": "Aluline India", "rate": 1350, "freight": 35,
                 "lead_time": "9 days", "moq": 80, "valid_till": "2026-05-08",
                 "reliability": 83, "notes": "Polyester powder coat, standard colours"},
                {"supplier": "Supreme Profile India", "rate": 1290, "freight": 42,
                 "lead_time": "10 days", "moq": 100, "valid_till": "2026-05-05",
                 "reliability": 85, "notes": "Lowest rate — custom RAL +7 days lead"},
            ],
        },
        {
            "item": "PVC Louver Blades 100mm", "industry": "louvers",
            "category": "PVC Louvers", "unit": "per RM",
            "last_purchased_rate": 390, "last_supplier": "Supreme Profile India",
            "quotes": [
                {"supplier": "Coltors India", "rate": 420, "freight": 18,
                 "lead_time": "6 days", "moq": 100, "valid_till": "2026-04-30",
                 "reliability": 80, "notes": "UV stabilised, 10-yr warranty"},
                {"supplier": "Supreme Profile India", "rate": 390, "freight": 15,
                 "lead_time": "5 days", "moq": 150, "valid_till": "2026-05-10",
                 "reliability": 85, "notes": "Best value PVC grade"},
                {"supplier": "Polycab India", "rate": 445, "freight": 12,
                 "lead_time": "4 days", "moq": 100, "valid_till": "2026-05-15",
                 "reliability": 90, "notes": "Highest grade PVC, fire retardant"},
            ],
        },
        {
            "item": "Operable Louvre System (Motorised)", "industry": "louvers",
            "category": "Operable Louvre Systems", "unit": "per SQM",
            "last_purchased_rate": 9200, "last_supplier": "Technal India",
            "quotes": [
                {"supplier": "Alufit Systems", "rate": 8500, "freight": 200,
                 "lead_time": "21 days", "moq": 10, "valid_till": "2026-05-30",
                 "reliability": 92, "notes": "Somfy motor, 5-yr system warranty"},
                {"supplier": "Technal India", "rate": 9200, "freight": 180,
                 "lead_time": "18 days", "moq": 8, "valid_till": "2026-05-25",
                 "reliability": 96, "notes": "European quality, BIM files available"},
                {"supplier": "YKK AP India", "rate": 10500, "freight": 150,
                 "lead_time": "25 days", "moq": 5, "valid_till": "2026-06-15",
                 "reliability": 98, "notes": "Premium — architectural specification grade"},
            ],
        },
    ]


# ── GET /api/po-grn/open-pos  ────────────────────────────────────────────────

@router.get("/po-grn/open-pos")
async def get_open_pos():
    """Return list of open/partially-received POs for GRN recording selection, including freight_type."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                open_pos = await _db_get_open_pos_with_freight(pool)
                return {"open_pos": open_pos, "data_source": "mysql"}
        except Exception as exc:
            logger.warning("open-pos DB failed: %s", exc)

    mock = _mock_po_grn_data()
    open_pos = [
        {
            **po,
            "freight_type":  "Supplier Own Operated",
            "matching_type": "3-Way",
            "qty_pending":   max(0, po.get("qty_ordered", 0) - po.get("qty_received", 0)),
        }
        for po in mock["open_pos"]
        if po.get("fill_pct", 100) < 100 and po.get("status") not in ("RECEIVED",)
    ]
    return {"open_pos": open_pos, "data_source": "mock"}


# ── POST /api/grn  ───────────────────────────────────────────────────────────

class CreateGRNRequest(BaseModel):
    supplier_name: str
    po_number: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    received_date: Optional[str] = None
    product_name: Optional[str] = None
    qty_ordered: Optional[float] = None
    qty_received: Optional[float] = None
    unit: Optional[str] = "sheets"
    condition: Optional[str] = "Good"
    invoice_value: Optional[float] = None
    grn_value: Optional[float] = None
    vehicle_number: Optional[str] = None
    received_by: Optional[str] = None
    quality_status: Optional[str] = None
    industry: Optional[str] = None
    notes: Optional[str] = None
    godown_id: Optional[int] = None
    godown_name: Optional[str] = None
    # Landing cost breakdown — captured at GRN entry time
    freight_charges: Optional[float] = 0
    insurance_charges: Optional[float] = 0
    loading_unloading: Optional[float] = 0
    local_transport: Optional[float] = 0
    other_charges: Optional[float] = 0


@router.post("/grn")
async def create_grn(req: CreateGRNRequest):
    """Create a new GRN record (DB or demo mode). Inventory is updated on successful GRN."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_create_grn(pool, req.model_dump())
                if not result.get("success"):
                    # Business validation errors → 422 (never fall through to demo)
                    err_code = result.get("code", "")
                    if err_code in ("OVER_RECEIVE", "FULLY_RECEIVED", "PO_CLOSED"):
                        raise HTTPException(status_code=422, detail=result["error"])
                    # Other DB-layer failures → fall through to demo
                    logger.info("GRN DB failed, using demo: %s", result.get("error"))
                else:
                    qty_received = req.qty_received or 0
                    # Optional: update legacy inventory table for backward compatibility
                    try:
                        if qty_received > 0 and req.product_name:
                            async with pool.acquire() as conn:
                                async with conn.cursor() as cur:
                                    await cur.execute(
                                        "UPDATE inventory SET quantity = quantity + %s "
                                        "WHERE sku_name LIKE %s LIMIT 1",
                                        (qty_received, f"%{req.product_name[:30]}%"),
                                    )
                    except Exception as inv_exc:
                        logger.debug("Legacy inventory update skipped: %s", inv_exc)
                    # Update warehouse-specific stock if a godown was selected
                    if req.godown_id and req.product_name and qty_received > 0:
                        try:
                            async with pool.acquire() as conn:
                                async with conn.cursor() as cur:
                                    await cur.execute(
                                        "INSERT INTO stock (product_id, godown_id, quantity) "
                                        "SELECT product_id, %s, %s FROM products "
                                        "WHERE sku_name LIKE %s LIMIT 1 "
                                        "ON DUPLICATE KEY UPDATE quantity = quantity + %s",
                                        (req.godown_id, qty_received,
                                         f"%{req.product_name[:30]}%", qty_received),
                                    )
                            result["godown_name"] = req.godown_name
                            result["warehouse_stock_updated"] = True
                        except Exception as wh_exc:
                            logger.debug("Warehouse stock update skipped: %s", wh_exc)
                            result["godown_name"] = req.godown_name
                    # Fire mismatch email alert if applicable (non-blocking)
                    if result.get("match_status") == "MISMATCH":
                        _fire_mismatch_alert(result, req)
                    return result
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("DB GRN creation failed, using demo: %s", exc)

    # Demo-mode mock response
    grn_number = f"GRN-{datetime.date.today().strftime('%Y%m%d')}-DEMO"
    invoice_val = req.invoice_value or 0
    grn_val = req.grn_value or invoice_val
    discrepancy = round(abs(invoice_val - grn_val), 2)
    qty_received = req.qty_received or 0
    match_status = "MATCH" if discrepancy < 1 else "MISMATCH"

    # Landing cost calculation (demo)
    _freight   = req.freight_charges   or 0
    _insurance = req.insurance_charges or 0
    _loading   = req.loading_unloading or 0
    _transport = req.local_transport   or 0
    _other     = req.other_charges     or 0
    _total_lc  = round(grn_val + _freight + _insurance + _loading + _transport + _other, 2)
    _lc_unit   = round(_total_lc / qty_received, 4) if qty_received > 0 else 0

    response = {
        "success":               True,
        "grn_number":            grn_number,
        "supplier":              req.supplier_name,
        "po_number":             req.po_number or "—",
        "invoice_value":         invoice_val,
        "grn_value":             grn_val,
        "match_status":          match_status,
        "discrepancy_amt":       discrepancy,
        "received_date":         req.received_date or datetime.date.today().isoformat(),
        "inventory_updated":     qty_received > 0,
        "inventory_note":        (
            f"+{qty_received} {req.unit or 'units'} of {req.product_name or 'product'} added to stock"
            if qty_received > 0 else "No quantity to update"
        ),
        "godown_name":           req.godown_name or None,
        "freight_charges":       _freight,
        "insurance_charges":     _insurance,
        "loading_unloading":     _loading,
        "local_transport":       _transport,
        "other_charges":         _other,
        "total_landed_cost":       _total_lc,
        "landing_cost_per_unit":   _lc_unit,
        "purchase_invoice_number": f"PI-{datetime.date.today().strftime('%Y%m%d')}-DEMO" if qty_received > 0 else None,
        "demo_mode":               True,
    }

    if match_status == "MISMATCH":
        _fire_mismatch_alert(response, req)

    return response


# ── GET /api/purchase-returns  ───────────────────────────────────────────────

@router.get("/purchase-returns")
async def get_purchase_returns():
    """Return all purchase returns with their document (debit/credit note) details."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                items = await _db_get_purchase_returns(pool)
                return {"purchase_returns": items, "total": len(items), "data_source": "mysql"}
        except Exception as exc:
            logger.warning("purchase-returns DB fetch failed: %s", exc)

    return {"purchase_returns": _mock_purchase_returns(), "total": 2, "data_source": "mock"}


# ── POST /api/purchase-returns  ──────────────────────────────────────────────

class PurchaseReturnRequest(BaseModel):
    po_number: str
    po_id: Optional[int] = None
    supplier_name: str
    supplier_id: Optional[int] = None
    product_name: str
    return_type: str = "PARTIAL"       # 'FULL' or 'PARTIAL'
    qty_returned: float
    unit: Optional[str] = "Units"
    unit_price: float
    reason: str
    document_type: str = "DEBIT_NOTE"  # 'DEBIT_NOTE' or 'CREDIT_NOTE'
    return_date: Optional[str] = None
    authorized_by: Optional[str] = None
    notes: Optional[str] = None


@router.post("/purchase-returns")
async def create_purchase_return(req: PurchaseReturnRequest):
    """Record a purchase return and generate a debit note or credit note against the supplier."""
    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_create_purchase_return(pool, req.model_dump())
                if result.get("success"):
                    return result
                logger.warning("Purchase return DB error: %s", result.get("error"))
        except Exception as exc:
            logger.warning("Purchase return DB failed, using demo: %s", exc)

    # Demo fallback
    today_str = datetime.date.today().strftime('%Y%m%d')
    prefix = "DN" if req.document_type == "DEBIT_NOTE" else "CN"
    return {
        "success":         True,
        "return_number":   f"PR-{today_str}-DEMO",
        "document_number": f"{prefix}-{today_str}-DEMO",
        "document_type":   req.document_type,
        "return_value":    round(req.qty_returned * req.unit_price, 2),
        "status":          "PENDING",
        "demo_mode":       True,
    }


# ── PATCH /api/purchase-returns/{return_id}/approve  ─────────────────────────

class PurchaseReturnApproveRequest(BaseModel):
    approver_name: str


@router.patch("/purchase-returns/{return_id}/approve")
async def approve_purchase_return(return_id: int, req: PurchaseReturnApproveRequest):
    """Approve a PENDING purchase return. Debit note becomes active post-approval."""
    if not req.approver_name.strip():
        raise HTTPException(status_code=422, detail="approver_name is required")

    await _maybe_ensure_schema()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_approve_purchase_return(pool, return_id, req.approver_name.strip())
                if result.get("success"):
                    return result
                raise HTTPException(status_code=400, detail=result.get("error", "Approval failed"))
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Purchase return approve DB failed: %s", exc)

    # Demo fallback
    return {
        "success":       True,
        "return_id":     return_id,
        "new_status":    "APPROVED",
        "authorized_by": req.approver_name,
        "message":       f"Purchase return #{return_id} approved. Debit note is now active.",
        "demo_mode":     True,
    }


def _mock_purchase_returns() -> list:
    today = datetime.date.today()
    def d(delta): return (today - datetime.timedelta(days=delta)).isoformat()
    return [
        {
            "return_id": 1, "return_number": "PR-20260515-001",
            "po_number": "PO-7734", "supplier": "Greenply Industries",
            "product": "12mm MR Plain", "return_type": "PARTIAL",
            "qty_returned": 40.0, "unit": "Sheets", "unit_price": 295.0,
            "return_value": 11800.0, "reason": "Grade mismatch — MR received, BWP ordered",
            "document_type": "DEBIT_NOTE", "document_number": "DN-20260515-001",
            "return_date": d(6), "status": "APPROVED",
            "authorized_by": "Rajesh Kumar", "notes": "Supplier to replace or credit",
            "created_at": f"{d(6)} 10:30:00",
        },
        {
            "return_id": 2, "return_number": "PR-20260518-002",
            "po_number": "PO-7731", "supplier": "Gauri Laminates",
            "product": "8mm Flexi Sheet", "return_type": "FULL",
            "qty_returned": 76.0, "unit": "Sheets", "unit_price": 245.0,
            "return_value": 18620.0, "reason": "Damaged in transit — water stains on all sheets",
            "document_type": "CREDIT_NOTE", "document_number": "CN-20260518-002",
            "return_date": d(3), "status": "PENDING",
            "authorized_by": "Store Manager", "notes": "Insurance claim in progress",
            "created_at": f"{d(3)} 14:15:00",
        },
    ]


def _fire_mismatch_alert(grn_response: dict, req) -> None:
    """Fire GRN mismatch email alert as a background task (non-blocking)."""
    import asyncio
    try:
        from app.core.config import get_settings
        from app.services.email_service import send_grn_mismatch_alert
        cfg = get_settings()
        grn_payload = {
            "grn_number":   grn_response.get("grn_number"),
            "supplier":     grn_response.get("supplier"),
            "product_name": getattr(req, "product_name", None) or "—",
            "po_number":    grn_response.get("po_number"),
            "invoice_value": grn_response.get("invoice_value", 0),
            "grn_value":    grn_response.get("grn_value", 0),
            "discrepancy_amt": grn_response.get("discrepancy_amt", 0),
            "qty_ordered":  getattr(req, "qty_ordered", None),
            "qty_received": getattr(req, "qty_received", None),
            "unit":         getattr(req, "unit", "units"),
            "received_date": grn_response.get("received_date"),
        }
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(send_grn_mismatch_alert(grn_payload, cfg))
        else:
            loop.run_until_complete(send_grn_mismatch_alert(grn_payload, cfg))
    except Exception as exc:
        logger.warning("Could not fire GRN mismatch alert: %s", exc)


# ── GET /api/po-grn/recent-grn  ──────────────────────────────────────────────

def _mock_recent_grn() -> list:
    today = datetime.date.today()
    def d(delta): return (today - datetime.timedelta(days=delta)).isoformat()
    return [
        {"grn_number": "GRN-4428", "po_number": "PO-7740", "supplier": "Ebco India Pvt. Ltd.",
         "product": "Soft-Close Hinge 35mm Pk-10", "qty_received": 100, "unit": "packs",
         "grn_value": "₹48,500", "match_status": "MATCH", "received_date": d(0), "received_by": "Ravi M."},
        {"grn_number": "GRN-4427", "po_number": "PO-7738", "supplier": "Hettich India",
         "product": "InnoTech Drawer 400mm", "qty_received": 50, "unit": "sets",
         "grn_value": "₹64,000", "match_status": "MATCH", "received_date": d(0), "received_by": "Santhosh K."},
        {"grn_number": "GRN-4426", "po_number": "PO-7735", "supplier": "Hafele India",
         "product": "Zinc D-Handle 128mm", "qty_ordered": 212, "qty_received": 200, "unit": "pcs",
         "invoice_value": "₹67,840", "grn_value": "₹64,000", "discrepancy_amt": "₹3,840",
         "match_status": "MISMATCH", "received_date": d(1), "received_by": "Ravi M.",
         "notes": "Short by 12 pcs — Hafele to credit note. PO rate ₹320/pc × 212 = ₹67,840 invoiced, only 200 received."},
        {"grn_number": "GRN-4425", "po_number": "PO-7733", "supplier": "Jaquar India",
         "product": "Lyric Basin Mixer Chrome", "qty_received": 20, "unit": "pcs",
         "grn_value": "₹97,000", "match_status": "MATCH", "received_date": d(1), "received_by": "Santhosh K."},
        {"grn_number": "GRN-4424", "po_number": "PO-7729", "supplier": "Hindware",
         "product": "Quartz Sensor Tap 230V", "qty_received": 8, "unit": "pcs",
         "grn_value": "₹28,000", "match_status": "MATCH", "received_date": d(2), "received_by": "Ravi M."},
    ]


@router.get("/po-grn/recent-grn")
async def get_recent_grn(limit: int = 20):
    """Recent GRN activity — used by Inward/Outward for real-time feed."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor(aiomysql.DictCursor) as cur:
                        await cur.execute(
                            "SELECT grn_number, po_number, supplier_name AS supplier, "
                            "product_name AS product, qty_received, unit, grn_value, "
                            "match_status, received_date, received_by, notes "
                            "FROM grn_records ORDER BY received_date DESC LIMIT %s", (limit,)
                        )
                        rows = await cur.fetchall()
                        if rows:
                            return {"grn_entries": rows, "total": len(rows), "data_source": "mysql"}
        except Exception as exc:
            logger.warning("recent-grn DB failed: %s", exc)

    entries = _mock_recent_grn()[:limit]
    return {"grn_entries": entries, "total": len(entries), "data_source": "mock"}


# ── Mock data (same shape as DB, matches existing static POGRN.jsx data) ──────

def _mock_po_grn_data() -> dict:
    return {
        "kpis": {
            "open_pos": 8,
            "open_po_value": "₹11.8L",
            "overdue_pos": 2,
            "overdue_po_list": "PO-7734 (Greenply +2d), PO-7731 (Gauri +4d)",
            "grn_match_rate": "96%",
            "grn_mismatches_mtd": 3,
            "grn_variance_value": "₹8,400",
            "partial_pos": 3,
            "ai_auto_pos": 4,
        },
        "open_pos": [
            {
                "po_number": "PO-7734", "supplier": "Greenply Industries",
                "sku": "12mm MR Plain", "qty_ordered": 300, "qty_received": 180,
                "qty_pending": 120,
                "fill_pct": 60, "value": "₹2.16L", "eta": "Overdue +2d",
                "status": "OVERDUE", "overdue_days": 2, "unit_price": 720, "unit": "Sheets",
                "grn_number": "GRN-20260520-001",
            },
            {
                "po_number": "PO-7733", "supplier": "Century Plyboards",
                "sku": "18mm BWP", "qty_ordered": 200, "qty_received": 200,
                "qty_pending": 0,
                "fill_pct": 100, "value": "₹2.84L", "eta": "Received",
                "status": "RECEIVED", "overdue_days": 0, "unit_price": 1420, "unit": "Sheets",
                "grn_number": "GRN-20260518-003",
            },
            {
                "po_number": "PO-7732", "supplier": "Century Plyboards",
                "sku": "12mm BWP", "qty_ordered": 150, "qty_received": 130,
                "qty_pending": 20,
                "fill_pct": 87, "value": "₹1.73L", "eta": "ETA 2d",
                "status": "PARTIAL", "overdue_days": 0, "unit_price": 1153, "unit": "Sheets",
                "grn_number": "GRN-20260519-002",
            },
            {
                "po_number": "PO-7731", "supplier": "Gauri Laminates",
                "sku": "8mm Flexi", "qty_ordered": 200, "qty_received": 76,
                "qty_pending": 124,
                "fill_pct": 38, "value": "₹0.49L", "eta": "Overdue +4d",
                "status": "OVERDUE", "overdue_days": 4, "unit_price": 245, "unit": "Sheets",
                "grn_number": "GRN-20260517-001",
            },
            {
                "po_number": "PO-7730", "supplier": "Supreme Laminates",
                "sku": "Laminates Teak", "qty_ordered": 100, "qty_received": 100,
                "qty_pending": 0,
                "fill_pct": 100, "value": "₹0.34L", "eta": "Received",
                "status": "RECEIVED", "overdue_days": 0, "unit_price": 340, "unit": "Sheets",
                "grn_number": "GRN-20260516-004",
            },
            {
                "po_number": "PO-7729", "supplier": "Merino Industries",
                "sku": "HPL 1mm Matte", "qty_ordered": 50, "qty_received": 0,
                "qty_pending": 50,
                "fill_pct": 0, "value": "₹1.78L", "eta": "ETA 3d",
                "status": "OPEN", "overdue_days": 0, "unit_price": 3560, "unit": "Sheets",
                "grn_number": None,
            },
            {
                "po_number": "PO-7726", "supplier": "Greenlam Industries",
                "sku": "Compact Laminate 6mm", "qty_ordered": 25, "qty_received": 10,
                "qty_pending": 15,
                "fill_pct": 40, "value": "₹1.62L", "eta": "ETA 1d",
                "status": "PARTIAL", "overdue_days": 0, "unit_price": 6480, "unit": "Sheets",
                "grn_number": "GRN-20260521-001",
            },
            {
                "po_number": "PO-7724", "supplier": "Action Tesa",
                "sku": "Acrylic Laminate 1mm", "qty_ordered": 30, "qty_received": 12,
                "qty_pending": 18,
                "fill_pct": 40, "value": "₹0.84L", "eta": "ETA 4d",
                "status": "PARTIAL", "overdue_days": 0, "unit_price": 2800, "unit": "Sheets",
                "grn_number": "GRN-20260520-002",
            },
        ],
        "grn_discrepancies": [
            {
                "grn_number": "GRN-4421", "po_number": "PO-7728",
                "supplier": "Gauri Laminates",
                "invoice_value": "₹8,200", "grn_value": "₹5,000",
                "discrepancy_amt": "₹3,200",
                "notes": "Wrong Grade — 8mm MR received vs 8mm BWP ordered",
                "action": "Return & Reorder",
            },
            {
                "grn_number": "GRN-4418", "po_number": "PO-7725",
                "supplier": "Gauri Laminates",
                "invoice_value": "₹12,400", "grn_value": "₹9,600",
                "discrepancy_amt": "₹2,800",
                "notes": "Short by 14 sheets",
                "action": "Raise Credit Note",
            },
            {
                "grn_number": "GRN-4412", "po_number": "PO-7719",
                "supplier": "Gauri Laminates",
                "invoice_value": "₹2,400", "grn_value": "₹0",
                "discrepancy_amt": "₹2,400",
                "notes": "Price Mismatch: Invoice ₹156 vs PO rate ₹142",
                "action": "Block Payment",
            },
        ],
        "data_source": "mock",
    }


# ── POST /api/po-grn/scan-invoice ────────────────────────────────────────────

class ScanInvoiceRequest(BaseModel):
    image_base64: str
    image_type: str = "image/jpeg"


@router.post("/po-grn/scan-invoice")
async def scan_grn_invoice(req: ScanInvoiceRequest):
    """Extract GRN fields from a supplier invoice / delivery challan image using GPT-4o Vision."""
    import os, json as _json
    from app.core.config import get_settings
    cfg = get_settings()

    if not cfg.openai_api_key:
        return {
            "success": True, "demo": True,
            "extracted": {
                "invoice_number": "INV-SCAN-DEMO", "supplier_name": "Demo Supplier",
                "product_name": "Demo Product", "qty_ordered": None, "qty_received": None,
                "invoice_value": None, "grn_value": None,
                "po_number": "", "vehicle_number": "", "received_by": "",
                "notes": "Demo mode — add OPENAI_API_KEY to .env for real AI invoice scanning.",
            },
        }

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=cfg.openai_api_key, timeout=60.0)
        prompt = (
            "You are a GRN extraction AI for an Indian hardware/building-materials dealer. "
            "Extract all visible fields from this supplier invoice or delivery challan image.\n\n"
            "Return ONLY a JSON object with exactly these keys:\n"
            '{"invoice_number":"","supplier_name":"","product_name":"","qty_ordered":null,'
            '"qty_received":null,"invoice_value":null,"grn_value":null,"po_number":"",'
            '"vehicle_number":"","received_by":"","notes":""}\n\n'
            "Rules: Remove ₹ symbols and commas from numbers. Use null for missing numerics. "
            "notes should capture discrepancies, damage, or shortfall mentions. "
            "Return ONLY the JSON — no markdown, no explanation."
        )
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {
                    "url": f"data:{req.image_type};base64,{req.image_base64}",
                    "detail": "high",
                }},
            ]}],
            temperature=0,
            max_tokens=400,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        extracted = _json.loads(raw.strip())
        return {"success": True, "demo": False, "extracted": extracted}
    except Exception as exc:
        logger.warning("GRN scan failed: %s", exc)
        return {"success": False, "error": str(exc), "extracted": {}}


# ── POST /api/po/scan ────────────────────────────────────────────────────────

@router.post("/po/scan")
async def scan_po_document(
    file: Optional[UploadFile] = File(None),
    text_input: Optional[str] = Form(None),
):
    """
    Extract PO creation fields from a product image/document OR plain text
    using GPT-4o Vision (image) or GPT-4o text (text-only).
    Returns structured multi-item PO data for form prefill.
    """
    import base64, json as _json
    from app.core.config import get_settings
    cfg = get_settings()

    has_image = file is not None
    has_text  = bool(text_input and text_input.strip())

    if not has_image and not has_text:
        raise HTTPException(status_code=422, detail="Provide either file or text_input.")

    # ── Demo fallback when no API key ─────────────────────────────────────────
    if not cfg.openai_api_key:
        _eta = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
        return {
            "success": True, "demo": True,
            "supplier_name": "Demo Supplier Pvt. Ltd.",
            "payment_terms": "NET-30 Days",
            "expected_date": _eta,
            "notes": "Demo mode — add OPENAI_API_KEY to .env for real AI extraction.",
            "items": [
                {
                    "sku_name": "HPL 1mm Matte 8×4 BW-8071",
                    "category": "Laminates",
                    "quantity": 50,
                    "unit": "Sheets",
                    "unit_price": 480,
                    "specifications": "Size: 8×4 ft, Thickness: 1mm, Finish: Matte",
                },
                {
                    "sku_name": "Compact Laminate 6mm Gloss White",
                    "category": "Laminates",
                    "quantity": 20,
                    "unit": "Sheets",
                    "unit_price": 1200,
                    "specifications": "Size: 8×4 ft, Thickness: 6mm, Finish: Gloss White",
                },
            ],
        }

    # ── Read image bytes if provided ──────────────────────────────────────────
    image_b64  = None
    image_type = "image/jpeg"
    if has_image:
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large — max 10 MB.")
        image_b64  = base64.b64encode(content).decode()
        image_type = file.content_type or "image/jpeg"

    # ── System prompt ─────────────────────────────────────────────────────────
    _eta = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
    SYSTEM_PROMPT = (
        "You are a Purchase Order extraction AI for an Indian hardware and "
        "building-materials dealer (laminates, louvers, hardware fittings, sanitary).\n"
        "Extract product/order information to populate a PO creation form.\n\n"
        "Return ONLY a JSON object with exactly this structure:\n"
        '{"supplier_name":"","payment_terms":"","expected_date":"","notes":"",'
        '"items":[{"sku_name":"","category":"","quantity":null,"unit":"","unit_price":null,"specifications":""}]}\n\n'
        "Rules:\n"
        "- supplier_name: company/brand name from the document or product label. Empty string if unknown.\n"
        "- payment_terms: e.g. 'NET-30 Days', '100% Advance'. Empty string if unknown.\n"
        f"- expected_date: ISO date YYYY-MM-DD. Default to {_eta} if not visible.\n"
        "- notes: certifications, grade requirements, handling instructions, or special notes.\n"
        "- items: array of distinct products. Each item:\n"
        "  * sku_name: full descriptive name including model/grade/size e.g. 'HPL 1mm Matte 8x4 BW-8071'\n"
        "  * category: e.g. 'Laminates', 'Louvers', 'Hardware Fittings', 'Sanitary', 'Door Hardware'\n"
        "  * quantity: numeric only (null if not visible)\n"
        "  * unit: e.g. 'Sheets', 'Pieces', 'Running Meters', 'SQM', 'Packs'\n"
        "  * unit_price: price per unit in INR as number — strip Rs/commas (null if not visible)\n"
        "  * specifications: brief spec string e.g. 'Size: 8x4, Finish: Matte, Grade: A'\n"
        "Return ONLY the JSON — no markdown, no explanation."
    )

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=cfg.openai_api_key, timeout=60.0)

        if image_b64:
            content_parts = [
                {"type": "text", "text": SYSTEM_PROMPT + (
                    f"\n\nAdditional context: {text_input.strip()}" if has_text else ""
                )},
                {"type": "image_url", "image_url": {
                    "url": f"data:{image_type};base64,{image_b64}",
                    "detail": "high",
                }},
            ]
        else:
            content_parts = [
                {"type": "text", "text": SYSTEM_PROMPT + f"\n\nDocument / product text:\n{text_input.strip()}"},
            ]

        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": content_parts}],
            temperature=0,
            max_tokens=700,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = _json.loads(raw.strip())

        if not isinstance(result.get("items"), list):
            result["items"] = []

        return {"success": True, "demo": False, **result}

    except Exception as exc:
        logger.warning("PO scan failed: %s", exc)
        return {"success": False, "error": str(exc), "items": []}


# ── Purchase Invoice Lifecycle endpoints ──────────────────────────────────────

class CreateInvoiceRequest(BaseModel):
    po_number:     str
    supplier_name: str
    product_name:  str
    qty_received:  float
    unit:          Optional[str]   = "Units"
    unit_cost:     Optional[float] = None
    invoice_value: Optional[float] = None
    pi_date:       Optional[str]   = None
    grn_number:    Optional[str]   = None
    notes:         Optional[str]   = None


@router.post("/po-grn/purchase-invoices")
async def create_purchase_invoice_endpoint(req: CreateInvoiceRequest):
    """Manually create a purchase invoice in DRAFT status from an open PO."""
    await _maybe_ensure_schema()
    if not req.po_number or not req.po_number.strip():
        raise HTTPException(status_code=422, detail="po_number is required")
    if not req.supplier_name or not req.supplier_name.strip():
        raise HTTPException(status_code=422, detail="supplier_name is required")

    async def _try_db():
        if not _DB_AVAILABLE:
            return None
        pool = await get_pool()
        if not pool:
            return None
        return await _db_create_purchase_invoice(pool, req.model_dump())

    try:
        result = await _try_db()
        if result is not None:
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Invoice creation failed"))
            return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("create_purchase_invoice DB error: %s", exc)

    # Demo fallback
    pi_number = f"PI-{datetime.date.today().strftime('%Y%m%d')}-DEMO"
    qty = req.qty_received or 0
    inv_value = req.invoice_value or round(qty * (req.unit_cost or 0), 2)
    return {
        "success":       True,
        "pi_number":     pi_number,
        "invoice_value": inv_value,
        "status":        "DRAFT",
        "message":       f"[DEMO] Purchase invoice {pi_number} created in DRAFT mode.",
        "demo_mode":     True,
    }


def _mock_purchase_invoices() -> list:
    today = datetime.date.today()
    def d(delta): return (today - datetime.timedelta(days=delta)).isoformat()
    return [
        {
            "pi_id": 1, "pi_number": f"PI-{today.strftime('%Y%m%d')}-001",
            "grn_number": "GRN-4428", "po_number": "PO-7740",
            "supplier_name": "Ebco India Pvt. Ltd.", "product_name": "Soft-Close Hinge 35mm Pk-10",
            "qty_received": 100.0, "unit": "packs", "unit_cost": 485.0, "invoice_value": 48500.0,
            "pi_date": d(0), "status": "DRAFT", "notes": "Auto-generated for GRN: GRN-4428",
            "approved_by": None, "approved_at": None,
            "paid_by": None, "payment_mode": None, "payment_ref": None, "paid_at": None,
            "created_at": f"{d(0)} 11:00:00", "match_status": "MATCH",
            "received_by": "Ravi M.", "freight_charges": 0.0, "total_landed_cost": 48500.0,
        },
        {
            "pi_id": 2, "pi_number": f"PI-{today.strftime('%Y%m%d')}-002",
            "grn_number": "GRN-4427", "po_number": "PO-7738",
            "supplier_name": "Hettich India", "product_name": "InnoTech Drawer 400mm",
            "qty_received": 50.0, "unit": "sets", "unit_cost": 1280.0, "invoice_value": 64000.0,
            "pi_date": d(0), "status": "APPROVED", "notes": "Auto-generated for GRN: GRN-4427",
            "approved_by": "Finance Head", "approved_at": f"{d(0)} 14:00:00",
            "paid_by": None, "payment_mode": None, "payment_ref": None, "paid_at": None,
            "created_at": f"{d(0)} 10:00:00", "match_status": "MATCH",
            "received_by": "Santhosh K.", "freight_charges": 1200.0, "total_landed_cost": 65200.0,
        },
        {
            "pi_id": 3, "pi_number": f"PI-{(today - datetime.timedelta(days=1)).strftime('%Y%m%d')}-001",
            "grn_number": "GRN-4426", "po_number": "PO-7735",
            "supplier_name": "Hafele India", "product_name": "Zinc D-Handle 128mm",
            "qty_received": 200.0, "unit": "pcs", "unit_cost": 320.0, "invoice_value": 64000.0,
            "pi_date": d(1), "status": "PAID", "notes": "Auto-generated for GRN: GRN-4426",
            "approved_by": "Finance Head", "approved_at": f"{d(1)} 11:00:00",
            "paid_by": "Accounts", "payment_mode": "Bank Transfer", "payment_ref": "NEFT-7742281",
            "paid_at": f"{d(1)} 16:30:00",
            "created_at": f"{d(1)} 09:30:00", "match_status": "MISMATCH",
            "received_by": "Kumar S.", "freight_charges": 500.0, "total_landed_cost": 64500.0,
        },
    ]


class InvoiceApproveRequest(BaseModel):
    approved_by: str


class InvoicePayRequest(BaseModel):
    paid_by: str
    payment_mode: Optional[str] = "Bank Transfer"
    payment_ref: Optional[str] = ""


@router.get("/po-grn/purchase-invoices")
async def get_purchase_invoices(
    status: Optional[str] = None,
    po_number: Optional[str] = None,
    grn_number: Optional[str] = None,
):
    """List all purchase invoices with optional status/PO/GRN filters."""
    await _maybe_ensure_schema()
    async def _try_db():
        if not _DB_AVAILABLE:
            return None
        pool = await get_pool()
        if not pool:
            return None
        return await _db_get_purchase_invoices(pool, status=status, po_number=po_number, grn_number=grn_number)

    try:
        invoices = await _try_db()
        if invoices is not None:
            return {"success": True, "invoices": invoices, "data_source": "mysql"}
    except Exception as exc:
        logger.warning("get_purchase_invoices DB error: %s", exc)

    # Mock fallback
    mock = _mock_purchase_invoices()
    if status:
        mock = [i for i in mock if i["status"] == status]
    if po_number:
        mock = [i for i in mock if i["po_number"] == po_number]
    if grn_number:
        mock = [i for i in mock if i["grn_number"] == grn_number]
    return {"success": True, "invoices": mock, "data_source": "demo"}


@router.patch("/po-grn/purchase-invoices/{pi_number}/approve")
async def approve_purchase_invoice(pi_number: str, req: InvoiceApproveRequest):
    """Approve a DRAFT purchase invoice — transitions to APPROVED and validates GRN match."""
    await _maybe_ensure_schema()
    if not req.approved_by or not req.approved_by.strip():
        raise HTTPException(status_code=422, detail="approved_by is required")

    async def _try_db():
        if not _DB_AVAILABLE:
            return None
        pool = await get_pool()
        if not pool:
            return None
        return await _db_approve_purchase_invoice(pool, pi_number, req.approved_by.strip())

    try:
        result = await _try_db()
        if result is not None:
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Approval failed"))
            return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("approve_purchase_invoice DB error: %s", exc)

    # Demo mode
    return {
        "success": True, "pi_number": pi_number, "new_status": "APPROVED",
        "approved_by": req.approved_by.strip(), "match_status": "MATCH",
        "message": f"[DEMO] Invoice {pi_number} approved and ready for payment.",
    }


@router.patch("/po-grn/purchase-invoices/{pi_number}/pay")
async def pay_purchase_invoice(pi_number: str, req: InvoicePayRequest):
    """Mark an APPROVED invoice as PAID — invoice is locked and immutable after this."""
    await _maybe_ensure_schema()
    if not req.paid_by or not req.paid_by.strip():
        raise HTTPException(status_code=422, detail="paid_by is required")

    async def _try_db():
        if not _DB_AVAILABLE:
            return None
        pool = await get_pool()
        if not pool:
            return None
        return await _db_pay_purchase_invoice(
            pool, pi_number, req.paid_by.strip(),
            req.payment_mode or "Bank Transfer",
            req.payment_ref or "",
        )

    try:
        result = await _try_db()
        if result is not None:
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Payment failed"))
            return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("pay_purchase_invoice DB error: %s", exc)

    # Demo mode
    return {
        "success": True, "pi_number": pi_number, "new_status": "PAID",
        "paid_by": req.paid_by.strip(), "payment_mode": req.payment_mode,
        "message": f"[DEMO] Invoice {pi_number} marked as PAID. Invoice is now locked.",
    }
