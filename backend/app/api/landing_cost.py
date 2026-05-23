"""
Landing Cost API — InvenIQ
Full workflow for computing the true landed cost of goods for Purchase Orders and Sales Orders.

Charge heads:
  Labour · Custom Duty · Taxes · Insurance · Freight Charge · Service Charge ·
  Local Freight Charge · Unloading

Operation types:
  Sales Order:    Own Operated | Customer Operated | Third Party Operated | Vendor Operated
  Purchase Order: Customer Operated | Third Party Operated | Vendor Operated
"""
import datetime
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Landing Cost"])

try:
    from app.db.connection import get_pool
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False

# ── Charge head definitions ───────────────────────────────────────────────────

CHARGE_HEADS = [
    {
        "key":         "labour",
        "label":       "Labour Charges",
        "description": "Loading / unloading labour at origin or destination warehouse",
    },
    {
        "key":         "custom_duty",
        "label":       "Custom Duty",
        "description": "Import duty levied by customs on inbound goods (applies to imports only)",
    },
    {
        "key":         "taxes",
        "label":       "Taxes (GST on freight/services)",
        "description": "GST applicable on freight invoices and third-party service bills",
    },
    {
        "key":         "insurance",
        "label":       "Insurance",
        "description": "Transit insurance premium for goods in transit",
    },
    {
        "key":         "freight_charge",
        "label":       "Freight Charge",
        "description": "Main long-haul or inter-city freight cost for moving goods",
    },
    {
        "key":         "service_charge",
        "label":       "Service Charge",
        "description": "Third-party logistics (3PL) service / handling fee",
    },
    {
        "key":         "local_freight",
        "label":       "Local Freight Charge",
        "description": "Last-mile delivery within city / local transport to destination",
    },
    {
        "key":         "unloading",
        "label":       "Unloading Charges",
        "description": "Cost of unloading goods at destination — labour, crane, or forklift hire",
    },
]

# ── Defaults matrix: operation_type → {charge_key: {applicable, who_bears}} ───
# who_bears: "company" | "customer" | "vendor" | "third_party" | "included_in_price"
DEFAULTS_MATRIX: dict[str, dict[str, dict]] = {
    # ── Purchase Order ────────────────────────────────────────────────────────
    "po_customer": {  # buyer sends own vehicle to collect from supplier
        "labour":         {"applicable": True,  "who_bears": "company",  "note": "Loading at supplier site"},
        "custom_duty":    {"applicable": True,  "who_bears": "company",  "note": "On imports only"},
        "taxes":          {"applicable": True,  "who_bears": "company",  "note": "GST on own freight"},
        "insurance":      {"applicable": True,  "who_bears": "company",  "note": "Buyer arranges transit insurance"},
        "freight_charge": {"applicable": True,  "who_bears": "company",  "note": "Own vehicle running cost"},
        "service_charge": {"applicable": False, "who_bears": "company",  "note": "No 3PL"},
        "local_freight":  {"applicable": True,  "who_bears": "company",  "note": "Delivery from collection point"},
        "unloading":      {"applicable": True,  "who_bears": "company",  "note": "At buyer warehouse"},
    },
    "po_third_party": {  # 3PL company handles transport
        "labour":         {"applicable": False, "who_bears": "third_party", "note": "3PL handles loading"},
        "custom_duty":    {"applicable": True,  "who_bears": "company",     "note": "On imports only"},
        "taxes":          {"applicable": True,  "who_bears": "company",     "note": "GST on 3PL invoice"},
        "insurance":      {"applicable": True,  "who_bears": "company",     "note": "Buyer arranges"},
        "freight_charge": {"applicable": True,  "who_bears": "company",     "note": "3PL freight invoice"},
        "service_charge": {"applicable": True,  "who_bears": "company",     "note": "3PL handling fee"},
        "local_freight":  {"applicable": True,  "who_bears": "company",     "note": "3PL last-mile"},
        "unloading":      {"applicable": True,  "who_bears": "company",     "note": "At buyer warehouse"},
    },
    "po_vendor": {  # vendor delivers (CIF / DDP terms)
        "labour":         {"applicable": False, "who_bears": "vendor",          "note": "Vendor loads"},
        "custom_duty":    {"applicable": True,  "who_bears": "company",         "note": "On imports — buyer pays duty"},
        "taxes":          {"applicable": False, "who_bears": "included_in_price", "note": "Included in vendor invoice"},
        "insurance":      {"applicable": False, "who_bears": "vendor",          "note": "Vendor arranges"},
        "freight_charge": {"applicable": False, "who_bears": "included_in_price", "note": "Included in invoice"},
        "service_charge": {"applicable": False, "who_bears": "vendor",          "note": "N/A"},
        "local_freight":  {"applicable": False, "who_bears": "included_in_price", "note": "Included in invoice"},
        "unloading":      {"applicable": True,  "who_bears": "company",         "note": "At buyer warehouse"},
    },
    # ── Sales Order ───────────────────────────────────────────────────────────
    "so_own": {  # company delivers using its own vehicle
        "labour":         {"applicable": True,  "who_bears": "company",  "note": "Own loading labour"},
        "custom_duty":    {"applicable": False, "who_bears": "company",  "note": "N/A for domestic SO"},
        "taxes":          {"applicable": True,  "who_bears": "company",  "note": "GST on own freight"},
        "insurance":      {"applicable": True,  "who_bears": "company",  "note": "Company arranges"},
        "freight_charge": {"applicable": True,  "who_bears": "company",  "note": "Own vehicle running cost"},
        "service_charge": {"applicable": False, "who_bears": "company",  "note": "No 3PL"},
        "local_freight":  {"applicable": True,  "who_bears": "company",  "note": "Last-mile delivery"},
        "unloading":      {"applicable": True,  "who_bears": "customer", "note": "Customer unloads at site"},
    },
    "so_customer": {  # customer picks up from our warehouse (ex-warehouse)
        "labour":         {"applicable": False, "who_bears": "customer", "note": "Customer handles loading"},
        "custom_duty":    {"applicable": False, "who_bears": "customer", "note": "N/A"},
        "taxes":          {"applicable": False, "who_bears": "customer", "note": "N/A"},
        "insurance":      {"applicable": False, "who_bears": "customer", "note": "Customer arranges"},
        "freight_charge": {"applicable": False, "who_bears": "customer", "note": "Customer arranges"},
        "service_charge": {"applicable": False, "who_bears": "customer", "note": "N/A"},
        "local_freight":  {"applicable": False, "who_bears": "customer", "note": "Customer arranges"},
        "unloading":      {"applicable": False, "who_bears": "customer", "note": "Customer arranges"},
    },
    "so_third_party": {  # 3PL delivers to customer
        "labour":         {"applicable": False, "who_bears": "third_party", "note": "3PL handles"},
        "custom_duty":    {"applicable": False, "who_bears": "company",     "note": "N/A"},
        "taxes":          {"applicable": True,  "who_bears": "company",     "note": "GST on 3PL invoice"},
        "insurance":      {"applicable": True,  "who_bears": "company",     "note": "In-transit insurance"},
        "freight_charge": {"applicable": True,  "who_bears": "company",     "note": "3PL freight"},
        "service_charge": {"applicable": True,  "who_bears": "company",     "note": "3PL handling fee"},
        "local_freight":  {"applicable": True,  "who_bears": "company",     "note": "3PL last-mile"},
        "unloading":      {"applicable": True,  "who_bears": "third_party", "note": "3PL unloads at customer site"},
    },
    "so_vendor": {  # vendor/supplier delivers direct to customer (drop-ship)
        "labour":         {"applicable": False, "who_bears": "vendor",          "note": "Vendor loads"},
        "custom_duty":    {"applicable": False, "who_bears": "vendor",          "note": "N/A"},
        "taxes":          {"applicable": True,  "who_bears": "company",         "note": "GST on vendor delivery invoice"},
        "insurance":      {"applicable": False, "who_bears": "vendor",          "note": "Vendor arranges"},
        "freight_charge": {"applicable": True,  "who_bears": "company",         "note": "Freight paid to vendor"},
        "service_charge": {"applicable": False, "who_bears": "vendor",          "note": "N/A"},
        "local_freight":  {"applicable": False, "who_bears": "included_in_price", "note": "Included in vendor charge"},
        "unloading":      {"applicable": False, "who_bears": "customer",        "note": "Customer unloads at site"},
    },
}

WHO_BEARS_LABEL = {
    "company":          "Company Bears",
    "customer":         "Customer Bears",
    "vendor":           "Vendor Bears",
    "third_party":      "3PL Bears",
    "included_in_price": "Included in Price",
}

# ── Session state (in-process fallback when DB is unavailable) ────────────────
_SHEET_COUNTER = [100]
_SESSION_SHEETS: list[dict] = []


def _next_sheet_id() -> str:
    _SHEET_COUNTER[0] += 1
    return f"LC-2026-{_SHEET_COUNTER[0]:04d}"


# ── DB persistence helpers ────────────────────────────────────────────────────

async def _db_save_sheet(sheet: dict) -> bool:
    """Persist sheet to landing_cost_sheets table. Returns True on success."""
    if not _DB_AVAILABLE:
        return False
    try:
        pool = await get_pool()
        if not pool:
            return False
        product = sheet.get("product", {})
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO landing_cost_sheets
                        (sheet_id, ref_type, ref_number, operation_type,
                         sku_code, sku_name, qty, unit, base_price,
                         charges_json, total_landed, per_unit_cost, margin_impact)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                        charges_json   = VALUES(charges_json),
                        total_landed   = VALUES(total_landed),
                        per_unit_cost  = VALUES(per_unit_cost),
                        margin_impact  = VALUES(margin_impact)
                """, (
                    sheet["sheet_id"],
                    sheet["ref_type"],
                    sheet["ref_number"],
                    sheet.get("operation_type", ""),
                    product.get("sku_code", "")[:100],
                    product.get("sku_name", "")[:300],
                    product.get("qty", 0),
                    product.get("unit", "Pcs")[:20],
                    product.get("base_price", 0),
                    json.dumps(sheet, ensure_ascii=False),
                    sheet.get("landed_cost", 0),
                    sheet.get("landed_cost_per_unit", 0),
                    sheet.get("margin_impact_pct", 0),
                ))
                await conn.commit()
        return True
    except Exception as exc:
        logger.warning("LC sheet DB save failed: %s", exc)
        return False


async def _db_list_sheets(ref_type: str = "", operation: str = "") -> list | None:
    """Return sheets from DB; None if DB unavailable."""
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        where_parts, params = [], []
        if ref_type:
            where_parts.append("ref_type = %s")
            params.append(ref_type.upper())
        if operation:
            where_parts.append("operation_type LIKE %s")
            params.append(f"%{operation}%")
        where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    f"SELECT charges_json FROM landing_cost_sheets {where} "
                    f"ORDER BY created_at DESC LIMIT 200",
                    params,
                )
                rows = await cur.fetchall()
        sheets = []
        for row in rows:
            try:
                sheets.append(json.loads(row[0]))
            except (json.JSONDecodeError, TypeError):
                pass
        return sheets
    except Exception as exc:
        logger.warning("LC sheet DB list failed: %s", exc)
        return None


async def _db_get_sheet(sheet_id: str) -> dict | None:
    """Fetch one sheet from DB by sheet_id. Returns None if not found or DB unavailable."""
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT charges_json FROM landing_cost_sheets WHERE sheet_id=%s LIMIT 1",
                    (sheet_id,),
                )
                row = await cur.fetchone()
        if row:
            return json.loads(row[0])
        return None
    except Exception as exc:
        logger.warning("LC sheet DB get failed: %s", exc)
        return None


# ── Static demo sheets ────────────────────────────────────────────────────────

def _mock_sheets() -> list[dict]:
    today = datetime.date.today()

    def d(n: int) -> str:
        return (today - datetime.timedelta(days=n)).isoformat()

    return [
        {
            "sheet_id":        "LC-2026-0012",
            "ref_type":        "PO",
            "ref_number":      "PO-7742",
            "operation_type":  "po_third_party",
            "operation_label": "Purchase Order — Third Party Operated",
            "date":            d(4),
            "product": {
                "sku_name":   "Ebco Soft-Close Hinge 35mm Pk-10",
                "sku_code":   "EBCO-SCH-35",
                "qty":        500,
                "unit":       "packs",
                "base_price": 380.0,
                "base_total": 190000.0,
            },
            "charges": {
                "labour":         {"amount": 0,      "applicable": False, "who_bears": "third_party"},
                "custom_duty":    {"amount": 0,      "applicable": False, "who_bears": "company"},
                "taxes":          {"amount": 3420,   "applicable": True,  "who_bears": "company"},
                "insurance":      {"amount": 950,    "applicable": True,  "who_bears": "company"},
                "freight_charge": {"amount": 12500,  "applicable": True,  "who_bears": "company"},
                "service_charge": {"amount": 2800,   "applicable": True,  "who_bears": "company"},
                "local_freight":  {"amount": 1500,   "applicable": True,  "who_bears": "company"},
                "unloading":      {"amount": 1200,   "applicable": True,  "who_bears": "company"},
            },
            "base_cost":            190000.0,
            "total_charges":        22370.0,
            "landed_cost":          212370.0,
            "landed_cost_per_unit": 424.74,
            "margin_impact_pct":    11.8,
            "status":               "FINALISED",
        },
        {
            "sheet_id":        "LC-2026-0011",
            "ref_type":        "SO",
            "ref_number":      "SO-2026-0138",
            "operation_type":  "so_own",
            "operation_label": "Sales Order — Own Operated",
            "date":            d(9),
            "product": {
                "sku_name":   "Hafele Zinc D-Handle 128mm",
                "sku_code":   "HAFL-ZDH-128",
                "qty":        300,
                "unit":       "pcs",
                "base_price": 320.0,
                "base_total": 96000.0,
            },
            "charges": {
                "labour":         {"amount": 800,  "applicable": True,  "who_bears": "company"},
                "custom_duty":    {"amount": 0,    "applicable": False, "who_bears": "company"},
                "taxes":          {"amount": 756,  "applicable": True,  "who_bears": "company"},
                "insurance":      {"amount": 480,  "applicable": True,  "who_bears": "company"},
                "freight_charge": {"amount": 4200, "applicable": True,  "who_bears": "company"},
                "service_charge": {"amount": 0,    "applicable": False, "who_bears": "company"},
                "local_freight":  {"amount": 1500, "applicable": True,  "who_bears": "company"},
                "unloading":      {"amount": 0,    "applicable": True,  "who_bears": "customer"},
            },
            "base_cost":            96000.0,
            "total_charges":        7736.0,
            "landed_cost":          103736.0,
            "landed_cost_per_unit": 345.79,
            "margin_impact_pct":    8.06,
            "status":               "FINALISED",
        },
    ]


# ── Pydantic models ────────────────────────────────────────────────────────────

class ChargeEntry(BaseModel):
    amount:      float = Field(default=0.0, ge=0)
    applicable:  bool  = True
    who_bears:   str   = "company"


class ProductInfo(BaseModel):
    sku_name:   str
    sku_code:   str   = ""
    qty:        float = Field(gt=0)
    unit:       str
    base_price: float = Field(gt=0, description="Price per unit (buy price for PO, sell price for SO)")


class CreateLandingCostSheet(BaseModel):
    ref_type:        str   = Field(description="PO or SO")
    ref_number:      str
    operation_type:  str   = Field(description="po_customer | po_third_party | po_vendor | so_own | so_customer | so_third_party | so_vendor")
    product:         ProductInfo
    charges:         dict[str, ChargeEntry] = {}


class CalculateRequest(BaseModel):
    base_cost:   float = Field(gt=0)
    qty:         float = Field(gt=0)
    charges:     dict[str, float] = {}
    only_company_borne: bool = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/landing-cost/charge-heads")
async def get_charge_heads():
    """Return the list of charge heads with labels and descriptions."""
    return {"charge_heads": CHARGE_HEADS}


@router.get("/landing-cost/defaults/{operation_type}")
async def get_defaults(operation_type: str):
    """Return the default applicability and who-bears for each charge head for an operation type."""
    defaults = DEFAULTS_MATRIX.get(operation_type)
    if defaults is None:
        valid = list(DEFAULTS_MATRIX.keys())
        raise HTTPException(
            status_code=422,
            detail=f"Unknown operation_type '{operation_type}'. Valid: {valid}",
        )
    result = {}
    for ch in CHARGE_HEADS:
        key = ch["key"]
        d   = defaults[key]
        result[key] = {
            **ch,
            "applicable":       d["applicable"],
            "who_bears":        d["who_bears"],
            "who_bears_label":  WHO_BEARS_LABEL.get(d["who_bears"], d["who_bears"]),
            "note":             d.get("note", ""),
            "amount":           0.0,
        }
    return {
        "operation_type": operation_type,
        "defaults":       result,
    }


@router.post("/landing-cost/calculate")
async def calculate_landed_cost(req: CalculateRequest):
    """
    Stateless calculation — given a base cost, qty, and charge amounts,
    returns total landed cost and per-unit landed cost.
    """
    total_charges = sum(
        v for v in req.charges.values() if isinstance(v, (int, float)) and v > 0
    )
    landed_cost          = round(req.base_cost + total_charges, 2)
    landed_cost_per_unit = round(landed_cost / req.qty, 4) if req.qty > 0 else 0
    base_per_unit        = round(req.base_cost / req.qty, 4)
    overhead_pct         = round((total_charges / req.base_cost * 100), 2) if req.base_cost > 0 else 0

    breakdown = []
    for k, v in req.charges.items():
        if isinstance(v, (int, float)) and v > 0:
            head = next((h for h in CHARGE_HEADS if h["key"] == k), None)
            label = head["label"] if head else k
            breakdown.append({
                "key":    k,
                "label":  label,
                "amount": v,
                "pct_of_base": round(v / req.base_cost * 100, 2) if req.base_cost else 0,
            })

    return {
        "base_cost":            req.base_cost,
        "base_cost_per_unit":   base_per_unit,
        "total_charges":        round(total_charges, 2),
        "landed_cost":          landed_cost,
        "landed_cost_per_unit": landed_cost_per_unit,
        "overhead_pct":         overhead_pct,
        "breakdown":            breakdown,
    }


@router.get("/landing-cost/sheets")
async def list_sheets(
    period:    str = Query(default="MTD"),
    ref_type:  str = Query(default=""),
    operation: str = Query(default=""),
):
    db_sheets = await _db_list_sheets(ref_type=ref_type, operation=operation)
    if db_sheets is not None:
        # DB available: return DB sheets + mock demo sheets (mock sheets have IDs < LC-2026-0100)
        mock = _mock_sheets()
        if ref_type:
            mock = [s for s in mock if s["ref_type"] == ref_type.upper()]
        if operation:
            mock = [s for s in mock if operation in s["operation_type"]]
        sheets = db_sheets + mock
        data_source = "mysql"
    else:
        # DB unavailable: fall back to mock + in-process session sheets
        sheets = _mock_sheets() + _SESSION_SHEETS
        if ref_type:
            sheets = [s for s in sheets if s["ref_type"] == ref_type.upper()]
        if operation:
            sheets = [s for s in sheets if operation in s["operation_type"]]
        data_source = "demo"

    total_landed = sum(s.get("landed_cost", 0) for s in sheets)
    return {
        "sheets":       sheets,
        "total_sheets": len(sheets),
        "total_landed": round(total_landed, 2),
        "period":       period,
        "data_source":  data_source,
    }


@router.get("/landing-cost/sheets/{sheet_id}")
async def get_sheet(sheet_id: str):
    # Try DB first
    sheet = await _db_get_sheet(sheet_id)
    if sheet:
        return {"sheet": sheet, "data_source": "mysql"}
    # Fall back to mock + session
    all_sheets = _mock_sheets() + _SESSION_SHEETS
    sheet = next((s for s in all_sheets if s["sheet_id"] == sheet_id), None)
    if not sheet:
        raise HTTPException(status_code=404, detail=f"Landing cost sheet {sheet_id} not found")
    return {"sheet": sheet, "data_source": "demo"}


@router.post("/landing-cost/sheets")
async def create_sheet(req: CreateLandingCostSheet):
    """Create and save a new landing cost sheet."""
    ref_type_upper = req.ref_type.upper()
    if ref_type_upper not in ("PO", "SO"):
        raise HTTPException(status_code=422, detail="ref_type must be 'PO' or 'SO'")

    defaults = DEFAULTS_MATRIX.get(req.operation_type)
    if defaults is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown operation_type '{req.operation_type}'. Valid: {list(DEFAULTS_MATRIX.keys())}",
        )

    # Build charges dict — user-supplied values override defaults
    charges_out: dict[str, dict] = {}
    total_company_charges = 0.0

    for ch in CHARGE_HEADS:
        key   = ch["key"]
        dflt  = defaults[key]
        entry = req.charges.get(key)

        amount     = entry.amount     if entry else 0.0
        applicable = entry.applicable if entry else dflt["applicable"]
        who_bears  = entry.who_bears  if entry else dflt["who_bears"]

        charges_out[key] = {
            "amount":     amount,
            "applicable": applicable,
            "who_bears":  who_bears,
        }
        if applicable and who_bears == "company" and amount > 0:
            total_company_charges += amount

    base_total           = req.product.base_price * req.product.qty
    landed_cost          = round(base_total + total_company_charges, 2)
    landed_cost_per_unit = round(landed_cost / req.product.qty, 4)
    total_all_charges    = sum(c["amount"] for c in charges_out.values())
    margin_impact_pct    = round(total_company_charges / base_total * 100, 2) if base_total > 0 else 0

    # Human-readable operation label
    label_map = {
        "po_customer":    "Purchase Order — Customer (Buyer) Operated",
        "po_third_party": "Purchase Order — Third Party Operated",
        "po_vendor":      "Purchase Order — Vendor Operated",
        "so_own":         "Sales Order — Own Operated",
        "so_customer":    "Sales Order — Customer Operated",
        "so_third_party": "Sales Order — Third Party Operated",
        "so_vendor":      "Sales Order — Vendor Operated",
    }

    sheet_id = _next_sheet_id()
    sheet = {
        "sheet_id":        sheet_id,
        "ref_type":        ref_type_upper,
        "ref_number":      req.ref_number,
        "operation_type":  req.operation_type,
        "operation_label": label_map.get(req.operation_type, req.operation_type),
        "date":            datetime.date.today().isoformat(),
        "product": {
            "sku_name":   req.product.sku_name,
            "sku_code":   req.product.sku_code,
            "qty":        req.product.qty,
            "unit":       req.product.unit,
            "base_price": req.product.base_price,
            "base_total": round(base_total, 2),
        },
        "charges":              charges_out,
        "base_cost":            round(base_total, 2),
        "total_charges":        round(total_all_charges, 2),
        "company_borne_charges": round(total_company_charges, 2),
        "landed_cost":          landed_cost,
        "landed_cost_per_unit": landed_cost_per_unit,
        "margin_impact_pct":    margin_impact_pct,
        "status":               "FINALISED",
    }

    # Persist to DB (primary); fall back to session memory if DB unavailable
    saved_to_db = await _db_save_sheet(sheet)
    if not saved_to_db:
        _SESSION_SHEETS.append(sheet)

    logger.info(
        "Landing cost sheet %s %s — landed cost ₹%.2f/unit",
        sheet_id, "saved to DB" if saved_to_db else "saved to session", landed_cost_per_unit,
    )

    return {
        "success":     True,
        "sheet":       sheet,
        "data_source": "mysql" if saved_to_db else "demo",
        "message":     f"Sheet {sheet_id} created. Landed cost: ₹{landed_cost_per_unit:,.2f}/{req.product.unit}",
    }
