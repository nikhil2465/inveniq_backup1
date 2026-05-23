"""
Sales Return API — InvenIQ
Handles sales returns with UOM conversion, credit note generation, and accounting entries.
Supports partial returns — e.g., 3 pieces from a box of 10 sold as a box.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Sales Return"])

try:
    from app.db.connection import get_pool, is_db_available
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False

# ── UOM Conversion Table ──────────────────────────────────────────────────────
# Key: (from_uom, to_uom)  Value: how many to_uom units equal 1 from_uom unit
UOM_CONVERSIONS: dict[tuple[str, str], float] = {
    ("box",    "pcs"):     10.0,
    ("box",    "pieces"):  10.0,
    ("box",    "units"):   10.0,
    ("box",    "nos"):     10.0,
    ("case",   "pcs"):     12.0,
    ("case",   "pieces"):  12.0,
    ("case",   "nos"):     12.0,
    ("dozen",  "pcs"):     12.0,
    ("dozen",  "pieces"):  12.0,
    ("bag",    "kg"):      25.0,
    ("bag",    "kgs"):     25.0,
    ("reel",   "mtrs"):    100.0,
    ("reel",   "metres"):  100.0,
    ("roll",   "mtrs"):    50.0,
    ("roll",   "sqft"):    100.0,
    ("sheet",  "sqft"):    32.0,    # 8×4 ft standard sheet
    ("sheet",  "sqm"):     2.974,
    ("pack",   "pcs"):     6.0,
    ("pack",   "pieces"):  6.0,
    ("set",    "pcs"):     2.0,     # default; user can override
    ("bundle", "pcs"):     5.0,
}

STANDARD_UOMS = [
    "pcs", "pieces", "units", "nos",
    "box", "boxes", "case", "cases",
    "sheet", "sheets",
    "bag", "bags",
    "kg", "kgs",
    "ltr", "litres",
    "mtr", "mtrs", "metres",
    "sqft", "sqm",
    "reel", "roll",
    "dozen",
    "set", "sets",
    "pair", "pairs",
    "pack", "packs",
    "bundle",
]


def get_conversion(from_uom: str, to_uom: str) -> Optional[float]:
    """Return factor: 1 from_uom = factor * to_uom.  None if unknown."""
    fu = from_uom.lower().strip()
    tu = to_uom.lower().strip()
    if fu == tu:
        return 1.0
    factor = UOM_CONVERSIONS.get((fu, tu))
    if factor:
        return factor
    rev = UOM_CONVERSIONS.get((tu, fu))
    if rev:
        return 1.0 / rev
    return None


# ── Session state (demo mode — resets on server restart) ──────────────────────
_RETURN_COUNTER = [200]
_SESSION_RETURNS: list[dict] = []
_SESSION_CREDIT_NOTES: list[dict] = []


def _next_ids() -> tuple[str, str]:
    _RETURN_COUNTER[0] += 1
    n = _RETURN_COUNTER[0]
    return f"SR-2026-{n:04d}", f"CN-2026-{n:04d}"


# ── Static demo data ──────────────────────────────────────────────────────────

def _mock_invoices() -> list[dict]:
    today = datetime.date.today()

    def d(n: int) -> str:
        return (today - datetime.timedelta(days=n)).isoformat()

    return [
        {
            "invoice_id":    "INV-2026-0091",
            "customer_id":   "C003",
            "customer_name": "Prestige Developers",
            "invoice_date":  d(10),
            "total_amount":  84700.0,
            "items": [
                {
                    "line_id":         1,
                    "sku_code":        "EBCO-SCH-35",
                    "sku_name":        "Ebco Soft-Close Hinge 35mm Pk-10",
                    "qty":             50,
                    "uom":             "box",
                    "pieces_per_unit": 10,
                    "unit_price":      485.0,
                    "buy_price":       380.0,
                    "gst_rate":        18.0,
                    "amount":          24250.0,
                },
                {
                    "line_id":         2,
                    "sku_code":        "HAFL-ZDH-128",
                    "sku_name":        "Hafele Zinc D-Handle 128mm",
                    "qty":             100,
                    "uom":             "pcs",
                    "pieces_per_unit": 1,
                    "unit_price":      320.0,
                    "buy_price":       240.0,
                    "gst_rate":        18.0,
                    "amount":          32000.0,
                },
            ],
        },
        {
            "invoice_id":    "INV-2026-0088",
            "customer_id":   "C001",
            "customer_name": "Sharma Constructions",
            "invoice_date":  d(18),
            "total_amount":  63840.0,
            "items": [
                {
                    "line_id":         1,
                    "sku_code":        "HETT-INN-400",
                    "sku_name":        "Hettich InnoTech Drawer 400mm",
                    "qty":             20,
                    "uom":             "set",
                    "pieces_per_unit": 1,
                    "unit_price":      1280.0,
                    "buy_price":       980.0,
                    "gst_rate":        18.0,
                    "amount":          25600.0,
                },
                {
                    "line_id":         2,
                    "sku_code":        "JAQ-LYR-CHR",
                    "sku_name":        "Jaquar Lyric Basin Mixer Chrome",
                    "qty":             4,
                    "uom":             "pcs",
                    "pieces_per_unit": 1,
                    "unit_price":      4850.0,
                    "buy_price":       3600.0,
                    "gst_rate":        18.0,
                    "amount":          19400.0,
                },
            ],
        },
        {
            "invoice_id":    "INV-2026-0082",
            "customer_id":   "C002",
            "customer_name": "Mehta Interiors",
            "invoice_date":  d(25),
            "total_amount":  45360.0,
            "items": [
                {
                    "line_id":         1,
                    "sku_code":        "EBCO-SCH-35",
                    "sku_name":        "Ebco Soft-Close Hinge 35mm Pk-10",
                    "qty":             30,
                    "uom":             "box",
                    "pieces_per_unit": 10,
                    "unit_price":      485.0,
                    "buy_price":       380.0,
                    "gst_rate":        18.0,
                    "amount":          14550.0,
                },
                {
                    "line_id":         2,
                    "sku_code":        "HIND-QST-230",
                    "sku_name":        "Hindware Quartz Sensor Tap 230V",
                    "qty":             5,
                    "uom":             "pcs",
                    "pieces_per_unit": 1,
                    "unit_price":      2850.0,
                    "buy_price":       2100.0,
                    "gst_rate":        18.0,
                    "amount":          14250.0,
                },
            ],
        },
    ]


def _mock_returns() -> list[dict]:
    today = datetime.date.today()

    def d(n: int) -> str:
        return (today - datetime.timedelta(days=n)).isoformat()

    return [
        {
            "return_id":          "SR-2026-0012",
            "credit_note_id":     "CN-2026-0012",
            "invoice_id":         "INV-2026-0071",
            "customer_name":      "Mehta Interiors",
            "return_date":        d(3),
            "sku_code":           "EBCO-SCH-35",
            "sku_name":           "Ebco Soft-Close Hinge 35mm Pk-10",
            "original_qty":       10,
            "original_uom":       "box",
            "return_qty":         3,
            "return_uom":         "pcs",
            "conversion_ratio":   10.0,
            "converted_base_qty": 0.3,
            "return_reason":      "Damaged pieces on arrival",
            "unit_price":         485.0,
            "piece_price":        48.5,
            "return_amount":      145.50,
            "gst_rate":           18.0,
            "gst_amount":         26.19,
            "credit_amount":      171.69,
            "status":             "PROCESSED",
            "accounting": {
                "entries": [
                    {
                        "dr": "Sales Return A/c",
                        "cr": "Customer A/c (Mehta Interiors)",
                        "amount": 171.69,
                        "narration": "Sales return — Ebco Soft-Close Hinge 35mm Pk-10 — 3 pcs from INV-2026-0071",
                    },
                    {
                        "dr": "Inventory A/c",
                        "cr": "COGS A/c",
                        "amount": 114.0,
                        "narration": "Stock reversal on return — 3 pcs @ ₹38.00/pcs",
                    },
                    {
                        "dr": "GST Payable A/c",
                        "cr": "GST Liability A/c",
                        "amount": 26.19,
                        "narration": "GST reversal on sales return — 18%",
                    },
                ],
            },
        },
        {
            "return_id":          "SR-2026-0011",
            "credit_note_id":     "CN-2026-0011",
            "invoice_id":         "INV-2026-0064",
            "customer_name":      "Sharma Constructions",
            "return_date":        d(8),
            "sku_code":           "HAFL-ZDH-128",
            "sku_name":           "Hafele Zinc D-Handle 128mm",
            "original_qty":       50,
            "original_uom":       "pcs",
            "return_qty":         5,
            "return_uom":         "pcs",
            "conversion_ratio":   1.0,
            "converted_base_qty": 5.0,
            "return_reason":      "Wrong specification — 96mm supplied instead of 128mm",
            "unit_price":         320.0,
            "piece_price":        320.0,
            "return_amount":      1600.0,
            "gst_rate":           18.0,
            "gst_amount":         288.0,
            "credit_amount":      1888.0,
            "status":             "CREDIT_APPLIED",
            "accounting": {
                "entries": [
                    {
                        "dr": "Sales Return A/c",
                        "cr": "Customer A/c (Sharma Constructions)",
                        "amount": 1888.0,
                        "narration": "Sales return — Hafele Zinc D-Handle 128mm — 5 pcs from INV-2026-0064",
                    },
                    {
                        "dr": "Inventory A/c",
                        "cr": "COGS A/c",
                        "amount": 1200.0,
                        "narration": "Stock reversal on return — 5 pcs @ ₹240.00/pcs",
                    },
                    {
                        "dr": "GST Payable A/c",
                        "cr": "GST Liability A/c",
                        "amount": 288.0,
                        "narration": "GST reversal on sales return — 18%",
                    },
                ],
            },
        },
    ]


def _mock_credit_notes() -> list[dict]:
    today = datetime.date.today()

    def d(n: int) -> str:
        return (today - datetime.timedelta(days=n)).isoformat()

    exp = (today + datetime.timedelta(days=90)).isoformat()

    return [
        {
            "credit_note_id": "CN-2026-0012",
            "return_id":      "SR-2026-0012",
            "customer_name":  "Mehta Interiors",
            "issue_date":     d(3),
            "amount":         171.69,
            "balance":        171.69,
            "status":         "OPEN",
            "valid_until":    (today + datetime.timedelta(days=87)).isoformat(),
        },
        {
            "credit_note_id": "CN-2026-0011",
            "return_id":      "SR-2026-0011",
            "customer_name":  "Sharma Constructions",
            "issue_date":     d(8),
            "amount":         1888.0,
            "balance":        0.0,
            "status":         "APPLIED",
            "valid_until":    (today + datetime.timedelta(days=82)).isoformat(),
        },
    ]


# ── Pydantic models ────────────────────────────────────────────────────────────

class SalesReturnRequest(BaseModel):
    invoice_id:       str
    customer_name:    str
    sku_code:         str
    sku_name:         str
    original_qty:     float = Field(gt=0, description="Qty on original invoice")
    original_uom:     str   = Field(description="UOM used in original sale (e.g. box)")
    return_qty:       float = Field(gt=0, description="Qty being returned")
    return_uom:       str   = Field(description="UOM of the return (e.g. pcs)")
    custom_ratio:     Optional[float] = Field(default=None, gt=0, description="Override: pieces per original unit")
    unit_price:       float = Field(gt=0, description="Sell price per original UOM")
    buy_price:        float = Field(default=0.0, ge=0, description="Buy price per original UOM for COGS reversal")
    gst_rate:         float = Field(default=18.0, ge=0, le=100)
    return_reason:    str   = ""
    # Workflow linking fields
    so_number:        Optional[str]   = None   # linked Sales Order number
    dc_number:        Optional[str]   = None   # linked Delivery Challan number
    return_condition: str             = "GOOD" # GOOD | PARTIALLY_DAMAGED | FULLY_DAMAGED
    damage_qty:       Optional[float] = None   # damaged piece count (for PARTIALLY_DAMAGED)
    damage_desc:      Optional[str]   = None   # damage description


class ApplyCreditRequest(BaseModel):
    credit_note_id: str
    apply_amount:   float = Field(gt=0)
    reference:      str   = ""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/sales-returns/uom-conversions")
async def list_uom_conversions():
    """Return the full UOM list and built-in conversion table."""
    return {
        "standard_uoms": STANDARD_UOMS,
        "known_conversions": [
            {"from_uom": k[0], "to_uom": k[1], "factor": v}
            for k, v in UOM_CONVERSIONS.items()
        ],
    }


@router.get("/sales-returns/invoices")
async def list_invoices(customer: str = Query(default="")):
    """Return invoices eligible for sales return.
    DB-first: reads from sales_orders where invoice_number is set.
    Falls back to mock data when DB is unavailable.
    """
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            SELECT id, order_number, customer_name, customer_type,
                                   product_name, category,
                                   quantity, unit, sell_price, buy_price, total_value,
                                   invoice_number,
                                   DATE(COALESCE(invoiced_at, created_at)) AS invoice_date
                            FROM sales_orders
                            WHERE invoice_number IS NOT NULL AND invoice_number != ''
                            ORDER BY invoiced_at DESC
                            LIMIT 100
                        """)
                        rows = await cur.fetchall()
                        if rows:
                            cols = [d[0] for d in cur.description]
                            db_invoices = []
                            for r in rows:
                                row = dict(zip(cols, r))
                                inv_date = row.get("invoice_date")
                                if inv_date and not isinstance(inv_date, str):
                                    inv_date = str(inv_date)
                                db_invoices.append({
                                    "invoice_id":    row["invoice_number"],
                                    "customer_name": row["customer_name"],
                                    "invoice_date":  inv_date or datetime.date.today().isoformat(),
                                    "total_amount":  float(row.get("total_value") or 0),
                                    "items": [{
                                        "line_id":         1,
                                        "sku_code":        row["order_number"],
                                        "sku_name":        row.get("product_name") or "",
                                        "qty":             float(row.get("quantity") or 0),
                                        "uom":             row.get("unit") or "pcs",
                                        "pieces_per_unit": 1,
                                        "unit_price":      float(row.get("sell_price") or 0),
                                        "buy_price":       float(row.get("buy_price") or 0),
                                        "gst_rate":        18.0,
                                        "amount":          float(row.get("total_value") or 0),
                                    }],
                                })
                            if customer:
                                db_invoices = [i for i in db_invoices if customer.lower() in i["customer_name"].lower()]
                            # Merge: DB invoices first, then mock (for demo products reference)
                            mock = _mock_invoices()
                            if customer:
                                mock = [i for i in mock if customer.lower() in i["customer_name"].lower()]
                            seen_ids = {i["invoice_id"] for i in db_invoices}
                            merged = db_invoices + [m for m in mock if m["invoice_id"] not in seen_ids]
                            return {"invoices": merged, "data_source": "mysql"}
        except Exception as exc:
            logger.warning("list_invoices DB fetch failed: %s", exc)

    invoices = _mock_invoices()
    if customer:
        invoices = [i for i in invoices if customer.lower() in i["customer_name"].lower()]
    return {"invoices": invoices, "data_source": "demo"}


@router.get("/sales-returns")
async def list_sales_returns(
    period:   str = Query(default="MTD"),
    customer: str = Query(default=""),
    status:   str = Query(default=""),
):
    returns = _mock_returns() + _SESSION_RETURNS
    if customer:
        returns = [r for r in returns if customer.lower() in r["customer_name"].lower()]
    if status:
        returns = [r for r in returns if r["status"] == status.upper()]
    total_credit = sum(r["credit_amount"] for r in returns)
    open_returns = [r for r in returns if r["status"] == "PROCESSED"]
    return {
        "returns":             returns,
        "total_returns":       len(returns),
        "total_credit_issued": round(total_credit, 2),
        "open_count":          len(open_returns),
        "period":              period,
        "data_source":         "demo",
    }


@router.get("/sales-returns/credit-notes")
async def list_credit_notes(
    customer: str = Query(default=""),
    status:   str = Query(default=""),
):
    cns = _mock_credit_notes() + _SESSION_CREDIT_NOTES
    if customer:
        cns = [c for c in cns if customer.lower() in c["customer_name"].lower()]
    if status:
        cns = [c for c in cns if c["status"] == status.upper()]
    total_open = sum(c["balance"] for c in cns if c["status"] == "OPEN")
    return {
        "credit_notes":        cns,
        "total_open_balance":  round(total_open, 2),
        "data_source":         "demo",
    }


@router.post("/sales-returns")
async def create_sales_return(req: SalesReturnRequest):
    """
    Create a sales return with UOM conversion.
    Automatically computes credit amount and generates accounting entries.

    Example: sold 10 boxes (each box = 10 pcs).  Customer returns 3 pcs.
      → conversion_ratio = 10  →  converted_base_qty = 3/10 = 0.3 boxes
      → piece_price = 485/10 = 48.50  →  return_amount = 48.50 × 3 = 145.50
    """
    # ── Resolve conversion ratio ─────────────────────────────────────────────
    if req.custom_ratio and req.custom_ratio > 0:
        ratio = req.custom_ratio
    else:
        ratio = get_conversion(req.original_uom, req.return_uom)
        if ratio is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"No built-in conversion from '{req.original_uom}' to '{req.return_uom}'. "
                    "Please pass custom_ratio (number of return_uom units per original_uom unit)."
                ),
            )

    converted_base_qty = req.return_qty / ratio  # original-UOM equivalent being returned

    if converted_base_qty > req.original_qty + 1e-9:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Return of {req.return_qty} {req.return_uom} converts to "
                f"{converted_base_qty:.4f} {req.original_uom}, which exceeds "
                f"the original sale of {req.original_qty} {req.original_uom}."
            ),
        )

    # ── Calculate financials ─────────────────────────────────────────────────
    piece_price   = req.unit_price / ratio
    return_amount = round(piece_price * req.return_qty, 2)
    gst_amount    = round(return_amount * req.gst_rate / 100, 2)
    credit_amount = round(return_amount + gst_amount, 2)

    # COGS reversal (restock at buy price)
    buy_piece_price = (req.buy_price / ratio) if req.buy_price > 0 else piece_price * 0.75
    cogs_reversal   = round(buy_piece_price * req.return_qty, 2)

    return_id, cn_id = _next_ids()
    today            = datetime.date.today().isoformat()
    valid_until      = (datetime.date.today() + datetime.timedelta(days=90)).isoformat()

    # Build accounting entries — split for PARTIALLY_DAMAGED condition
    condition        = req.return_condition or "GOOD"
    is_damaged       = condition in ("PARTIALLY_DAMAGED", "FULLY_DAMAGED")
    damaged_qty      = float(req.damage_qty or 0) if is_damaged else 0.0
    good_qty         = max(0, req.return_qty - damaged_qty) if condition == "PARTIALLY_DAMAGED" else (0 if is_damaged else req.return_qty)

    damaged_cost     = round(buy_piece_price * damaged_qty, 2)
    good_cost        = round(cogs_reversal - damaged_cost, 2) if is_damaged else cogs_reversal

    acct_entries = [
        {
            "dr":       "Sales Return A/c",
            "cr":       f"Customer A/c ({req.customer_name})",
            "amount":   credit_amount,
            "narration": (
                f"Sales return — {req.sku_name} — "
                f"{req.return_qty} {req.return_uom} ref {req.invoice_id}"
                + (f" / {req.so_number}" if req.so_number else "")
            ),
        },
        {
            "dr":       "GST Payable A/c",
            "cr":       "GST Liability A/c",
            "amount":   gst_amount,
            "narration": f"GST reversal on sales return — {req.gst_rate}%",
        },
    ]
    if good_cost > 0:
        acct_entries.append({
            "dr":       "Inventory A/c",
            "cr":       "COGS A/c",
            "amount":   good_cost,
            "narration": f"Good stock reversal — {good_qty} {req.return_uom} back to inventory",
        })
    if damaged_cost > 0:
        acct_entries.append({
            "dr":       "Damage Loss A/c",
            "cr":       "COGS A/c",
            "amount":   damaged_cost,
            "narration": f"Damaged items write-down — {damaged_qty} {req.return_uom} @ ₹{buy_piece_price:.2f}",
        })

    return_rec = {
        "return_id":          return_id,
        "credit_note_id":     cn_id,
        "invoice_id":         req.invoice_id,
        "so_number":          req.so_number or None,
        "dc_number":          req.dc_number or None,
        "return_condition":   condition,
        "damage_qty":         damaged_qty if is_damaged else None,
        "damage_desc":        req.damage_desc or None,
        "customer_name":      req.customer_name,
        "return_date":        today,
        "sku_code":           req.sku_code,
        "sku_name":           req.sku_name,
        "original_qty":       req.original_qty,
        "original_uom":       req.original_uom,
        "return_qty":         req.return_qty,
        "return_uom":         req.return_uom,
        "conversion_ratio":   ratio,
        "converted_base_qty": round(converted_base_qty, 4),
        "return_reason":      req.return_reason,
        "unit_price":         req.unit_price,
        "piece_price":        round(piece_price, 4),
        "return_amount":      return_amount,
        "gst_rate":           req.gst_rate,
        "gst_amount":         gst_amount,
        "credit_amount":      credit_amount,
        "status":             "PROCESSED",
        "accounting":         {"entries": acct_entries},
    }

    cn_rec = {
        "credit_note_id": cn_id,
        "return_id":      return_id,
        "customer_name":  req.customer_name,
        "issue_date":     today,
        "amount":         credit_amount,
        "balance":        credit_amount,
        "status":         "OPEN",
        "valid_until":    valid_until,
    }

    _SESSION_RETURNS.append(return_rec)
    _SESSION_CREDIT_NOTES.append(cn_rec)

    logger.info("Sales return %s created — credit note %s for ₹%.2f", return_id, cn_id, credit_amount)

    return {
        "success":          True,
        "return":           return_rec,
        "credit_note":      cn_rec,
        "conversion_detail": {
            "original_uom":        req.original_uom,
            "return_uom":          req.return_uom,
            "ratio":               ratio,
            "description":         f"1 {req.original_uom} = {ratio} {req.return_uom}",
            "converted_base_qty":  round(converted_base_qty, 4),
        },
        "message": (
            f"Sales return {return_id} processed. "
            f"Credit note {cn_id} raised for ₹{credit_amount:,.2f}."
        ),
    }


@router.post("/sales-returns/{return_id}/apply-credit")
async def apply_credit_note(return_id: str, req: ApplyCreditRequest):
    """Partially or fully apply a credit note against future purchases."""
    all_cns = _mock_credit_notes() + _SESSION_CREDIT_NOTES
    cn = next((c for c in all_cns if c["credit_note_id"] == req.credit_note_id), None)
    if not cn:
        raise HTTPException(status_code=404, detail=f"Credit note {req.credit_note_id} not found")
    if cn["status"] == "APPLIED":
        raise HTTPException(status_code=422, detail="Credit note already fully applied")
    if req.apply_amount > cn["balance"] + 1e-9:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot apply ₹{req.apply_amount:,.2f} — available balance is ₹{cn['balance']:,.2f}",
        )

    cn["balance"] = round(cn["balance"] - req.apply_amount, 2)
    cn["status"]  = "APPLIED" if cn["balance"] < 0.01 else "PARTIAL"

    return {
        "success":           True,
        "credit_note":       cn,
        "applied_amount":    req.apply_amount,
        "remaining_balance": cn["balance"],
        "message":           f"₹{req.apply_amount:,.2f} applied from {req.credit_note_id}. Remaining: ₹{cn['balance']:,.2f}",
    }
