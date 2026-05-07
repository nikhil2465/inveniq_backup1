"""
PO & GRN REST API endpoints.
Provides dashboard data for the PO & GRN page, and a create-PO action.
Both endpoints follow the same DB-first / mock-fallback pattern as the chat tools.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["PO & GRN"])

try:
    from app.db.connection import get_pool
    from app.db.po_grn_queries import (
        get_po_grn_dashboard,
        create_purchase_order as _db_create_po,
        create_grn as _db_create_grn,
        get_quotations as _db_get_quotations,
    )
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


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


@router.post("/po")
async def create_po(req: CreatePORequest):
    """Create a new purchase order (DB or demo mode).
    Falls back to demo mode when the supplier/SKU is not yet in the DB
    (e.g. new industry products like louvers profiles).
    """
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_create_po(pool, req.model_dump())
                if result.get("success"):
                    return result
                # Product/supplier not in DB (new industry item) → fall to demo
                logger.info("PO demo fallback: %s", result.get("error"))
        except Exception as exc:
            logger.warning("DB PO creation failed, using demo: %s", exc)

    # Demo-mode mock response
    po_number = f"PO-{datetime.date.today().strftime('%Y%m%d')}-DEMO"
    return {
        "success": True,
        "po_number": po_number,
        "supplier": req.supplier_name,
        "sku": req.sku_name,
        "quantity": req.quantity,
        "unit_price": req.unit_price or 0,
        "total_value": (req.unit_price or 0) * req.quantity,
        "expected_date": req.expected_date or (
            datetime.date.today() + datetime.timedelta(days=7)
        ).isoformat(),
        "notes": req.notes or "Created via InvenIQ AI Assistant",
        "demo_mode": True,
    }


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


@router.post("/grn")
async def create_grn(req: CreateGRNRequest):
    """Create a new GRN record (DB or demo mode)."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_create_grn(pool, req.model_dump())
                if result.get("success"):
                    return result
        except Exception as exc:
            logger.warning("DB GRN creation failed, using demo: %s", exc)

    # Demo-mode mock response
    grn_number = f"GRN-{datetime.date.today().strftime('%Y%m%d')}-DEMO"
    invoice_val = req.invoice_value or 0
    grn_val = req.grn_value or invoice_val
    discrepancy = round(abs(invoice_val - grn_val), 2)
    return {
        "success": True,
        "grn_number": grn_number,
        "supplier": req.supplier_name,
        "po_number": req.po_number or "—",
        "invoice_value": invoice_val,
        "grn_value": grn_val,
        "match_status": "MATCH" if discrepancy < 1 else "MISMATCH",
        "discrepancy_amt": discrepancy,
        "received_date": req.received_date or datetime.date.today().isoformat(),
        "demo_mode": True,
    }


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
                "fill_pct": 60, "value": "₹2.16L", "eta": "Overdue +2d",
                "status": "OVERDUE", "overdue_days": 2,
            },
            {
                "po_number": "PO-7733", "supplier": "Century Plyboards",
                "sku": "18mm BWP", "qty_ordered": 200, "qty_received": 200,
                "fill_pct": 100, "value": "₹2.84L", "eta": "Received",
                "status": "RECEIVED", "overdue_days": 0,
            },
            {
                "po_number": "PO-7732", "supplier": "Century Plyboards",
                "sku": "12mm BWP", "qty_ordered": 150, "qty_received": 130,
                "fill_pct": 87, "value": "₹1.73L", "eta": "ETA 2d",
                "status": "PARTIAL", "overdue_days": 0,
            },
            {
                "po_number": "PO-7731", "supplier": "Gauri Laminates",
                "sku": "8mm Flexi", "qty_ordered": 200, "qty_received": 76,
                "fill_pct": 38, "value": "₹0.49L", "eta": "Overdue +4d",
                "status": "OVERDUE", "overdue_days": 4,
            },
            {
                "po_number": "PO-7730", "supplier": "Supreme Laminates",
                "sku": "Laminates Teak", "qty_ordered": 100, "qty_received": 100,
                "fill_pct": 100, "value": "₹0.34L", "eta": "Received",
                "status": "RECEIVED", "overdue_days": 0,
            },
            {
                "po_number": "PO-7729", "supplier": "Merino Industries",
                "sku": "HPL 1mm Matte", "qty_ordered": 50, "qty_received": 0,
                "fill_pct": 0, "value": "₹1.78L", "eta": "ETA 3d",
                "status": "OPEN", "overdue_days": 0,
            },
            {
                "po_number": "PO-7726", "supplier": "Greenlam Industries",
                "sku": "Compact Laminate 6mm", "qty_ordered": 25, "qty_received": 10,
                "fill_pct": 40, "value": "₹1.62L", "eta": "ETA 1d",
                "status": "PARTIAL", "overdue_days": 0,
            },
            {
                "po_number": "PO-7724", "supplier": "Action Tesa",
                "sku": "Acrylic Laminate 1mm", "qty_ordered": 30, "qty_received": 12,
                "fill_pct": 40, "value": "₹0.84L", "eta": "ETA 4d",
                "status": "PARTIAL", "overdue_days": 0,
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
