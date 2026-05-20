"""
Distributor Portal REST API — InvenIQ
Provides a read-only stock view for distributor accounts:
  GET /distributor/my-stock    — stock dispatched to this distributor (filtered by JWT distributor_id)
  GET /distributor/inventory   — full supplier catalog with availability (sell prices only, no buy_price)
"""
import logging
from typing import Optional

from fastapi import APIRouter, Query, Request

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Distributor"])

try:
    from app.db.connection import get_pool
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


# ── Mock data — mirrors MOCK_STOCK_BY_DIST in DistributorPortal.jsx ─────────────

_MOCK_STOCK: dict[int, dict] = {
    1: {
        "distributor_name": "Allied Hardware Distributors",
        "contact_person":   "Rajesh Kumar",
        "phone":            "+91-98765-11111",
        "city":             "Bangalore",
        "status":           "ACTIVE",
        "stock": [
            {
                "sku_code": "EBCO-SCH-35", "sku_name": "Ebco Soft-Close Hinge 35mm Pk-10",
                "category": "Hardware Fittings", "qty": 150, "unit": "packs",
                "sell_price": 485, "stock_value": 72750,
                "dispatch_date": "2026-05-10", "order_ref": "ORD-2840",
            },
            {
                "sku_code": "HAFL-ZDH-128", "sku_name": "Hafele Zinc D-Handle 128mm",
                "category": "Hardware Fittings", "qty": 200, "unit": "pcs",
                "sell_price": 320, "stock_value": 64000,
                "dispatch_date": "2026-05-08", "order_ref": "ORD-2836",
            },
        ],
        "total_stock_value": 136750,
    },
    2: {
        "distributor_name": "Metro Bath & Kitchen",
        "contact_person":   "Priya Sharma",
        "phone":            "+91-98765-22222",
        "city":             "Bangalore",
        "status":           "ACTIVE",
        "stock": [
            {
                "sku_code": "JAQ-LYR-CHR", "sku_name": "Jaquar Lyric Basin Mixer Chrome",
                "category": "Sanitary CP Fittings", "qty": 12, "unit": "pcs",
                "sell_price": 4850, "stock_value": 58200,
                "dispatch_date": "2026-05-08", "order_ref": "ORD-2834",
            },
            {
                "sku_code": "HIND-QST-230", "sku_name": "Hindware Quartz Sensor Tap 230V",
                "category": "Sanitary CP Fittings", "qty": 8, "unit": "pcs",
                "sell_price": 2850, "stock_value": 22800,
                "dispatch_date": "2026-05-06", "order_ref": "ORD-2831",
            },
            {
                "sku_code": "HETT-INN-400", "sku_name": "Hettich InnoTech Drawer 400mm",
                "category": "Hardware Fittings", "qty": 28, "unit": "sets",
                "sell_price": 1280, "stock_value": 35840,
                "dispatch_date": "2026-05-05", "order_ref": "ORD-2829",
            },
        ],
        "total_stock_value": 116840,
    },
    3: {
        "distributor_name": "South Decor Supplies",
        "contact_person":   "Anand Raju",
        "phone":            "+91-98765-33333",
        "city":             "Mysore",
        "status":           "ACTIVE",
        "stock": [
            {
                "sku_code": "EBCO-SCH-35", "sku_name": "Ebco Soft-Close Hinge 35mm Pk-10",
                "category": "Hardware Fittings", "qty": 80, "unit": "packs",
                "sell_price": 485, "stock_value": 38800,
                "dispatch_date": "2026-05-03", "order_ref": "ORD-2824",
            },
            {
                "sku_code": "HAFL-ZDH-128", "sku_name": "Hafele Zinc D-Handle 128mm",
                "category": "Hardware Fittings", "qty": 145, "unit": "pcs",
                "sell_price": 320, "stock_value": 46400,
                "dispatch_date": "2026-05-03", "order_ref": "ORD-2824",
            },
        ],
        "total_stock_value": 85200,
    },
}

# Supplier-side catalog with stock levels (no buy_price — distributor-safe)
_MOCK_INVENTORY = [
    {
        "product_id": 1, "sku_code": "EBCO-SCH-35",
        "name": "Ebco Soft-Close Hinge 35mm Pk-10",
        "brand": "Ebco India", "category": "Hardware Fittings",
        "unit": "packs", "sell_price": 485, "gst_rate": 18.0,
        "stock_qty": 480, "stock_status": "in_stock",
        "lead_time": "2-3 days",
        "features": ["Hydraulic soft-close", "100,000-cycle tested", "3-way adjustable"],
    },
    {
        "product_id": 2, "sku_code": "HAFL-ZDH-128",
        "name": "Hafele Zinc D-Handle 128mm",
        "brand": "Hafele India", "category": "Hardware Fittings",
        "unit": "pcs", "sell_price": 320, "gst_rate": 18.0,
        "stock_qty": 650, "stock_status": "in_stock",
        "lead_time": "2-3 days",
        "features": ["Zinc die-cast", "Satin finish", "Hole pitch 128mm"],
    },
    {
        "product_id": 3, "sku_code": "HETT-INN-400",
        "name": "Hettich InnoTech Drawer 400mm",
        "brand": "Hettich India", "category": "Hardware Fittings",
        "unit": "sets", "sell_price": 1280, "gst_rate": 18.0,
        "stock_qty": 120, "stock_status": "in_stock",
        "lead_time": "3-4 days",
        "features": ["Undermount system", "Silent close", "50 kg load"],
    },
    {
        "product_id": 4, "sku_code": "EBCO-MSL-600",
        "name": "Ebco Magic Slider 600mm Full Extension",
        "brand": "Ebco India", "category": "Hardware Fittings",
        "unit": "pairs", "sell_price": 850, "gst_rate": 18.0,
        "stock_qty": 75, "stock_status": "in_stock",
        "lead_time": "2-3 days",
        "features": ["Full extension", "45 kg load", "Ball bearing"],
    },
    {
        "product_id": 5, "sku_code": "HETT-SB-8671",
        "name": "Hettich Sensys Blue 8671 Hinge",
        "brand": "Hettich India", "category": "Hardware Fittings",
        "unit": "pcs", "sell_price": 285, "gst_rate": 18.0,
        "stock_qty": 0, "stock_status": "out_of_stock",
        "lead_time": "7-10 days",
        "features": ["Integrated soft-close", "110° opening", "Tool-free removal"],
    },
    {
        "product_id": 6, "sku_code": "HAFL-CHS-SYM",
        "name": "Hafele Chest Lift Mechanism Symo",
        "brand": "Hafele India", "category": "Hardware Fittings",
        "unit": "pairs", "sell_price": 2150, "gst_rate": 18.0,
        "stock_qty": 42, "stock_status": "in_stock",
        "lead_time": "3-4 days",
        "features": ["For 4-10 kg lids", "Soft-close integrated", "Corrosion resistant"],
    },
    {
        "product_id": 7, "sku_code": "JAQ-LYR-CHR",
        "name": "Jaquar Lyric Basin Mixer Chrome",
        "brand": "Jaquar India", "category": "Sanitary CP Fittings",
        "unit": "pcs", "sell_price": 4850, "gst_rate": 18.0,
        "stock_qty": 45, "stock_status": "in_stock",
        "lead_time": "5-7 days",
        "features": ["Ceramic cartridge", "Brass body", "360° swivel spout"],
    },
    {
        "product_id": 8, "sku_code": "HIND-QST-230",
        "name": "Hindware Quartz Sensor Tap 230V",
        "brand": "Hindware", "category": "Sanitary CP Fittings",
        "unit": "pcs", "sell_price": 2850, "gst_rate": 18.0,
        "stock_qty": 28, "stock_status": "in_stock",
        "lead_time": "5-7 days",
        "features": ["Infrared sensor", "Waterproof", "0.5-sec response"],
    },
    {
        "product_id": 9, "sku_code": "JAQ-CHE-MIX",
        "name": "Jaquar Chelsa Single Lever Shower Mixer",
        "brand": "Jaquar India", "category": "Sanitary CP Fittings",
        "unit": "pcs", "sell_price": 3750, "gst_rate": 18.0,
        "stock_qty": 18, "stock_status": "low_stock",
        "lead_time": "5-7 days",
        "features": ["Single lever", "Ceramic disc cartridge", "Overhead shower included"],
    },
    {
        "product_id": 10, "sku_code": "HIND-ATL-WC",
        "name": "Hindware Atlantic Wall Hung WC",
        "brand": "Hindware", "category": "Sanitary CP Fittings",
        "unit": "pcs", "sell_price": 8400, "gst_rate": 18.0,
        "stock_qty": 12, "stock_status": "low_stock",
        "lead_time": "7-10 days",
        "features": ["Wall hung", "Dual flush 3/6L", "Soft-close seat included"],
    },
    {
        "product_id": 11, "sku_code": "HPL-1MM-MATTE",
        "name": "HPL 1mm Matte / Suede Sheet 8×4ft",
        "brand": "Greenlam / Merino", "category": "High Pressure Laminate",
        "unit": "sheet", "sell_price": 1300, "gst_rate": 18.0,
        "stock_qty": 340, "stock_status": "in_stock",
        "lead_time": "5-7 days",
        "features": ["Abrasion resistant EN 438 Grade P", "Moisture resistant", "200+ shades"],
    },
    {
        "product_id": 12, "sku_code": "HPL-1.5MM-MATTE",
        "name": "HPL 1.5mm Post-Form Sheet 8×4ft",
        "brand": "Greenlam / Merino", "category": "High Pressure Laminate",
        "unit": "sheet", "sell_price": 1680, "gst_rate": 18.0,
        "stock_qty": 210, "stock_status": "in_stock",
        "lead_time": "5-7 days",
        "features": ["Post-formable", "Round-edge furniture", "Impact resistant"],
    },
    {
        "product_id": 13, "sku_code": "PVC-6MM-WP",
        "name": "PVC Foam Board 6mm Waterproof 8×4ft",
        "brand": "Alstone / Fundermax", "category": "PVC & WPC",
        "unit": "sheet", "sell_price": 890, "gst_rate": 18.0,
        "stock_qty": 180, "stock_status": "in_stock",
        "lead_time": "3-5 days",
        "features": ["100% waterproof", "Termite proof", "Easy to cut & route"],
    },
    {
        "product_id": 14, "sku_code": "DOOR-MORTICE-SS",
        "name": "Dorset Mortice Lock SS Finish",
        "brand": "Dorset", "category": "Door Hardware",
        "unit": "set", "sell_price": 1150, "gst_rate": 18.0,
        "stock_qty": 95, "stock_status": "in_stock",
        "lead_time": "2-3 days",
        "features": ["Stainless steel", "Double throw", "Anti-pick levers"],
    },
    {
        "product_id": 15, "sku_code": "EBCO-GLS-HNG",
        "name": "Ebco Glass Door Hinge 135° Frameless",
        "brand": "Ebco India", "category": "Door Hardware",
        "unit": "pcs", "sell_price": 680, "gst_rate": 18.0,
        "stock_qty": 55, "stock_status": "in_stock",
        "lead_time": "2-3 days",
        "features": ["135° opening", "For 8-12mm glass", "Self-closing option"],
    },
]


# ── DB helpers ──────────────────────────────────────────────────────────────────

async def _try_db_my_stock(distributor_id: int) -> Optional[dict]:
    """Fetch stock dispatched to this distributor from DB. Returns None on any failure."""
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT distributor_id, distributor_name, contact_person, phone, city, status "
                    "FROM distributors WHERE distributor_id = %s AND is_active = 1 LIMIT 1",
                    (distributor_id,)
                )
                dist_row = await cur.fetchone()
                if not dist_row:
                    return None
                dist_cols = [d[0] for d in cur.description]
                dist_info = dict(zip(dist_cols, dist_row))

                await cur.execute("""
                    SELECT p.sku_code, p.sku_name,
                           COALESCE(pc.category_name, 'General') AS category,
                           sd.qty_dispatched AS qty, p.unit,
                           (sd.qty_dispatched * p.sell_price) AS stock_value,
                           p.sell_price,
                           DATE_FORMAT(sd.dispatch_date, '%%Y-%%m-%%d') AS dispatch_date,
                           sd.order_ref
                    FROM stock_dispatches sd
                    JOIN products p ON p.product_id = sd.product_id
                    LEFT JOIN product_categories pc ON pc.category_id = p.category_id
                    WHERE sd.distributor_id = %s AND sd.status = 'DELIVERED'
                    ORDER BY sd.dispatch_date DESC
                """, (distributor_id,))
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
                stock = [dict(zip(cols, r)) for r in rows]
                total_value = sum(float(s.get("stock_value") or 0) for s in stock)
                return {
                    **dist_info,
                    "stock": stock,
                    "total_stock_value": total_value,
                }
    except Exception as exc:
        logger.warning("Distributor my-stock DB fetch failed: %s", exc)
        return None


async def _try_db_inventory() -> Optional[list]:
    """Fetch supplier catalog with stock levels from DB. buy_price intentionally excluded."""
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    SELECT p.product_id, p.sku_code, p.sku_name AS name,
                           p.brand, COALESCE(pc.category_name, 'General') AS category,
                           p.unit, p.sell_price, p.gst_rate,
                           COALESCE(SUM(s.quantity), 0) AS stock_qty,
                           p.lead_time
                    FROM products p
                    LEFT JOIN product_categories pc ON pc.category_id = p.category_id
                    LEFT JOIN stock s ON s.product_id = p.product_id
                    WHERE p.is_active = 1
                    GROUP BY p.product_id
                    ORDER BY pc.category_name, p.sku_name
                """)
                rows = await cur.fetchall()
                if not rows:
                    return None
                cols = [d[0] for d in cur.description]
                items = []
                for r in rows:
                    item = dict(zip(cols, r))
                    qty = int(item.get("stock_qty") or 0)
                    item["stock_qty"] = qty
                    item["stock_status"] = (
                        "in_stock" if qty > 30
                        else ("low_stock" if qty > 0 else "out_of_stock")
                    )
                    items.append(item)
                return items
    except Exception as exc:
        logger.warning("Distributor inventory DB fetch failed: %s", exc)
        return None


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.get("/distributor/my-stock")
async def get_my_stock(request: Request):
    """
    Returns stock allocated/dispatched to the authenticated distributor.
    distributor_id is extracted from the JWT claim set at login.
    """
    user = request.scope.get("user", {})
    distributor_id = user.get("distributor_id")

    if distributor_id is not None:
        db_data = await _try_db_my_stock(int(distributor_id))
        if db_data:
            db_data["distributor_id"] = distributor_id
            return {"data_source": "mysql", "distributor": db_data}

        mock = _MOCK_STOCK.get(int(distributor_id))
        if mock:
            return {"data_source": "demo", "distributor": {**mock, "distributor_id": distributor_id}}

        return {"data_source": "demo", "distributor": None, "message": "No stock allocated yet."}

    # No distributor_id in token — return demo data for dist 1
    return {"data_source": "demo", "distributor": {**_MOCK_STOCK[1], "distributor_id": 1}}


@router.get("/distributor/inventory")
async def get_supplier_inventory(
    request: Request,
    category:      str  = Query("",    description="Filter by category name"),
    search:        str  = Query("",    description="Search by product name or SKU code"),
    in_stock_only: bool = Query(False, description="Show only items with qty > 0"),
):
    """
    Full supplier product catalog with stock availability.
    Sell prices are shown; buy prices are never exposed to distributor accounts.
    """
    db_items = await _try_db_inventory()
    all_items   = db_items if db_items is not None else _MOCK_INVENTORY
    data_source = "mysql" if db_items is not None else "demo"

    categories = sorted({i.get("category") or "General" for i in all_items})

    filtered = all_items
    if category:
        filtered = [i for i in filtered if (i.get("category") or "").lower() == category.lower()]
    if search:
        q = search.lower()
        filtered = [
            i for i in filtered
            if q in (i.get("name") or "").lower() or q in (i.get("sku_code") or "").lower()
        ]
    if in_stock_only:
        filtered = [i for i in filtered if (i.get("stock_qty") or 0) > 0]

    return {
        "data_source": data_source,
        "total":       len(filtered),
        "categories":  categories,
        "items":       filtered,
    }
