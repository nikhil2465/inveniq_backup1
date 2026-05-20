"""
Warehouse Management REST API endpoints.
Covers warehouse listing, capacity checks, inventory tracking, GRN log,
distributor inventory, and internal stock transfers.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Warehouse"])

try:
    from app.db.connection import get_pool
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


async def _try_db_warehouses():
    """Attempt DB fetch — returns None on any failure."""
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    SELECT g.godown_id, g.godown_name, g.location,
                           g.capacity_sheets, g.manager_name, g.contact_phone,
                           COALESCE(SUM(s.quantity), 0) AS current_stock_sheets,
                           COALESCE(SUM(s.quantity * p.buy_price), 0) AS current_stock_value
                    FROM godowns g
                    LEFT JOIN stock s ON s.godown_id = g.godown_id
                    LEFT JOIN products p ON p.product_id = s.product_id
                    WHERE g.is_active = 1
                    GROUP BY g.godown_id
                    ORDER BY g.godown_id
                """)
                rows = await cur.fetchall()
                if not rows:
                    return None
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, r)) for r in rows]
    except Exception as exc:
        logger.warning("Warehouse DB fetch failed: %s", exc)
        return None


async def _try_db_grn_log(godown_id: Optional[int]):
    """Attempt DB GRN log fetch — returns None on any failure."""
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                where = "WHERE gr.godown_id = %s" if godown_id else ""
                params = (godown_id,) if godown_id else ()
                await cur.execute(f"""
                    SELECT gr.grn_number, gr.received_date, gr.invoice_number,
                           s.supplier_name, g.godown_name,
                           gr.invoice_value, gr.grn_value,
                           gr.match_status, gr.discrepancy_amt,
                           gr.created_by, gr.po_number,
                           p.sku_name AS product_name, gr.qty_received, gr.unit
                    FROM grn_receipts gr
                    JOIN suppliers s ON s.supplier_id = gr.supplier_id
                    JOIN godowns g ON g.godown_id = gr.godown_id
                    JOIN products p ON p.product_id = gr.product_id
                    {where}
                    ORDER BY gr.received_date DESC
                    LIMIT 50
                """, params)
                rows = await cur.fetchall()
                if rows is None:
                    return None
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, r)) for r in rows]
    except Exception as exc:
        logger.warning("GRN log DB fetch failed: %s", exc)
        return None


# ── GET /api/warehouses ───────────────────────────────────────────────────────

@router.get("/warehouses")
async def list_warehouses():
    """Return all active warehouses with capacity, current stock, and space info."""
    db_result = await _try_db_warehouses()
    if db_result is not None:
        return {"warehouses": db_result, "data_source": "mysql"}
    return {"warehouses": _mock_warehouses(), "data_source": "demo"}


# ── GET /api/warehouses/grn-log ───────────────────────────────────────────────

@router.get("/warehouses/grn-log")
async def warehouse_grn_log(godown_id: Optional[int] = Query(None)):
    """Return GRN receipts log, optionally filtered by warehouse."""
    db_result = await _try_db_grn_log(godown_id)
    if db_result is not None:
        return {"grn_log": db_result, "data_source": "mysql"}
    return {"grn_log": _mock_grn_log(), "data_source": "demo"}


# ── GET /api/warehouses/capacity-check ───────────────────────────────────────

@router.get("/warehouses/capacity-check")
async def capacity_check(godown_id: int, qty: int):
    """Validate whether a warehouse can accept qty sheets."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            SELECT g.godown_name, g.capacity_sheets,
                                   COALESCE(SUM(s.quantity), 0) AS current
                            FROM godowns g
                            LEFT JOIN stock s ON s.godown_id = g.godown_id
                            WHERE g.godown_id = %s
                            GROUP BY g.godown_id
                        """, (godown_id,))
                        row = await cur.fetchone()
                        if row:
                            name, cap, cur_stock = row
                            avail = cap - cur_stock
                            valid = avail >= qty
                            return {
                                "valid": valid,
                                "godown_name": name,
                                "capacity": cap,
                                "current": cur_stock,
                                "available": avail,
                                "requested": qty,
                                "reason": None if valid else f"Insufficient space: only {avail} sheets available",
                                "data_source": "mysql",
                            }
        except Exception as exc:
            logger.warning("Capacity check DB failed: %s", exc)

    mock_wh = {
        1: ("Main WH (HSR Layout)", 1800, 1140),
        2: ("Showroom (Koramangala)", 620, 444),
        3: ("Overflow (Whitefield)", 540, 430),
    }
    if godown_id in mock_wh:
        name, cap, cur_stock = mock_wh[godown_id]
        avail = cap - cur_stock
        valid = avail >= qty
        return {
            "valid": valid,
            "godown_name": name,
            "capacity": cap,
            "current": cur_stock,
            "available": avail,
            "requested": qty,
            "reason": None if valid else f"Insufficient space: only {avail} sheets available",
            "data_source": "demo",
        }
    return {"valid": False, "reason": "Warehouse not found", "data_source": "demo"}


# ── GET /api/products/stock ───────────────────────────────────────────────────

@router.get("/products/stock")
async def products_with_stock():
    """Return all active products with total stock and per-warehouse breakdown."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            SELECT p.product_id, p.sku_code, p.sku_name,
                                   p.brand, p.category, p.unit,
                                   p.sell_price, p.buy_price,
                                   COALESCE(SUM(s.quantity), 0) AS total_stock
                            FROM products p
                            LEFT JOIN stock s ON s.product_id = p.product_id
                            WHERE p.is_active = 1
                            GROUP BY p.product_id
                            ORDER BY p.sku_name
                        """)
                        rows = await cur.fetchall()
                        if rows:
                            cols = [d[0] for d in cur.description]
                            return {"products": [dict(zip(cols, r)) for r in rows], "data_source": "mysql"}
        except Exception as exc:
            logger.warning("Products stock DB fetch failed: %s", exc)
    return {"products": _mock_products_stock(), "data_source": "demo"}


# ── Mock data ─────────────────────────────────────────────────────────────────

def _mock_warehouses():
    return [
        {
            "godown_id": 1, "godown_name": "Main WH (HSR Layout)",
            "location": "HSR Layout, Bangalore",
            "capacity_sheets": 1800,
            "manager_name": "Ramesh Kumar", "contact_phone": "9845001234",
            "current_stock_sheets": 1140, "current_stock_value": 1382000,
            "current_stock_value_fmt": "₹13.8L",
            "available_capacity_sheets": 660, "utilisation_pct": 63.3,
            "products": [
                {"product_id": 1, "sku_code": "18BWP-C-8x4", "sku_name": "18mm BWP (8x4)",
                 "brand": "Century", "category": "BWP Plywood",
                 "quantity": 110, "buy_price": 1420, "stock_value": 156200, "stock_status": "CRITICAL"},
                {"product_id": 2, "sku_code": "12BWP-C-8x4", "sku_name": "12mm BWP (8x4)",
                 "brand": "Century", "category": "BWP Plywood",
                 "quantity": 180, "buy_price": 980, "stock_value": 176400, "stock_status": "CRITICAL"},
                {"product_id": 3, "sku_code": "12MR-G-8x4", "sku_name": "12mm MR Plain (8x4)",
                 "brand": "Greenply", "category": "MR Plywood",
                 "quantity": 280, "buy_price": 720, "stock_value": 201600, "stock_status": "HEALTHY"},
            ],
            "recent_grns": [
                {"grn_number": "GRN-4421", "supplier_name": "Century Plyboards",
                 "received_date": "2026-05-07", "invoice_number": "INV-2026-0038",
                 "grn_value": 284000, "match_status": "MATCH", "created_by": "Ramesh Kumar"},
                {"grn_number": "GRN-4418", "supplier_name": "Greenply Industries",
                 "received_date": "2026-05-05", "invoice_number": "INV-2026-0035",
                 "grn_value": 201600, "match_status": "MISMATCH", "created_by": "Suresh Patil"},
            ],
        },
        {
            "godown_id": 2, "godown_name": "Showroom (Koramangala)",
            "location": "Koramangala, Bangalore",
            "capacity_sheets": 620,
            "manager_name": "Suresh Patil", "contact_phone": "9741002345",
            "current_stock_sheets": 444, "current_stock_value": 448200,
            "current_stock_value_fmt": "₹4.5L",
            "available_capacity_sheets": 176, "utilisation_pct": 71.6,
            "products": [
                {"product_id": 4, "sku_code": "LAM-TK-8x4", "sku_name": "Laminates Teak",
                 "brand": "Greenlam", "category": "Laminate",
                 "quantity": 60, "buy_price": 580, "stock_value": 34800, "stock_status": "HEALTHY"},
                {"product_id": 5, "sku_code": "18MR-G-8x4", "sku_name": "18mm MR (8x4)",
                 "brand": "Greenply", "category": "MR Plywood",
                 "quantity": 50, "buy_price": 820, "stock_value": 41000, "stock_status": "HEALTHY"},
            ],
            "recent_grns": [],
        },
        {
            "godown_id": 3, "godown_name": "Overflow (Whitefield)",
            "location": "Whitefield, Bangalore",
            "capacity_sheets": 540,
            "manager_name": "Mahesh Reddy", "contact_phone": "9980003456",
            "current_stock_sheets": 430, "current_stock_value": 294200,
            "current_stock_value_fmt": "₹2.9L",
            "available_capacity_sheets": 110, "utilisation_pct": 79.6,
            "products": [
                {"product_id": 1, "sku_code": "18BWP-C-8x4", "sku_name": "18mm BWP (8x4)",
                 "brand": "Century", "category": "BWP Plywood",
                 "quantity": 10, "buy_price": 1420, "stock_value": 14200, "stock_status": "CRITICAL"},
                {"product_id": 3, "sku_code": "12MR-G-8x4", "sku_name": "12mm MR Plain (8x4)",
                 "brand": "Greenply", "category": "MR Plywood",
                 "quantity": 20, "buy_price": 720, "stock_value": 14400, "stock_status": "CRITICAL"},
            ],
            "recent_grns": [],
        },
    ]


def _mock_grn_log():
    return [
        {
            "grn_number": "GRN-4421", "received_date": "2026-05-07",
            "invoice_number": "INV-2026-0038", "supplier_name": "Century Plyboards",
            "godown_name": "Main WH (HSR Layout)",
            "invoice_value": 284000, "grn_value": 284000,
            "match_status": "MATCH", "discrepancy_amt": 0,
            "created_by": "Ramesh Kumar", "po_number": "PO-7733",
            "product_name": "18mm BWP (8x4)", "qty_received": 200, "unit": "Sheets",
        },
        {
            "grn_number": "GRN-4418", "received_date": "2026-05-05",
            "invoice_number": "INV-2026-0035", "supplier_name": "Greenply Industries",
            "godown_name": "Main WH (HSR Layout)",
            "invoice_value": 228600, "grn_value": 201600,
            "match_status": "MISMATCH", "discrepancy_amt": 27000,
            "created_by": "Suresh Patil", "po_number": "PO-7734",
            "product_name": "12mm MR Plain (8x4)", "qty_received": 280, "unit": "Sheets",
        },
        {
            "grn_number": "GRN-4412", "received_date": "2026-04-28",
            "invoice_number": "INV-2026-0029", "supplier_name": "Gauri Laminates",
            "godown_name": "Showroom (Koramangala)",
            "invoice_value": 46400, "grn_value": 40600,
            "match_status": "MISMATCH", "discrepancy_amt": 5800,
            "created_by": "Suresh Patil", "po_number": "PO-7728",
            "product_name": "8mm Flexi BWP", "qty_received": 76, "unit": "Sheets",
        },
        {
            "grn_number": "GRN-4407", "received_date": "2026-04-22",
            "invoice_number": "INV-2026-0021", "supplier_name": "Century Plyboards",
            "godown_name": "Overflow (Whitefield)",
            "invoice_value": 198400, "grn_value": 198400,
            "match_status": "MATCH", "discrepancy_amt": 0,
            "created_by": "Mahesh Reddy", "po_number": "PO-7720",
            "product_name": "18mm BWP (8x4)", "qty_received": 140, "unit": "Sheets",
        },
    ]


def _mock_products_stock():
    return [
        {"product_id": 1, "sku_code": "18BWP-C-8x4", "sku_name": "18mm BWP (8x4)",
         "brand": "Century", "category": "BWP Plywood", "unit": "sheet",
         "sell_price": 1920, "buy_price": 1420, "total_stock": 140,
         "warehouse_breakdown": [
             {"godown_id": 1, "godown_name": "Main WH (HSR Layout)", "quantity": 110},
             {"godown_id": 2, "godown_name": "Showroom (Koramangala)", "quantity": 20},
             {"godown_id": 3, "godown_name": "Overflow (Whitefield)", "quantity": 10},
         ]},
        {"product_id": 2, "sku_code": "12BWP-C-8x4", "sku_name": "12mm BWP (8x4)",
         "brand": "Century", "category": "BWP Plywood", "unit": "sheet",
         "sell_price": 1280, "buy_price": 980, "total_stock": 220,
         "warehouse_breakdown": [
             {"godown_id": 1, "godown_name": "Main WH (HSR Layout)", "quantity": 180},
             {"godown_id": 2, "godown_name": "Showroom (Koramangala)", "quantity": 30},
             {"godown_id": 3, "godown_name": "Overflow (Whitefield)", "quantity": 10},
         ]},
        {"product_id": 3, "sku_code": "12MR-G-8x4", "sku_name": "12mm MR Plain (8x4)",
         "brand": "Greenply", "category": "MR Plywood", "unit": "sheet",
         "sell_price": 940, "buy_price": 720, "total_stock": 340,
         "warehouse_breakdown": [
             {"godown_id": 1, "godown_name": "Main WH (HSR Layout)", "quantity": 280},
             {"godown_id": 2, "godown_name": "Showroom (Koramangala)", "quantity": 40},
             {"godown_id": 3, "godown_name": "Overflow (Whitefield)", "quantity": 20},
         ]},
        {"product_id": 4, "sku_code": "LAM-TK-8x4", "sku_name": "Laminates Teak",
         "brand": "Greenlam", "category": "Laminate", "unit": "sheet",
         "sell_price": 760, "buy_price": 580, "total_stock": 280,
         "warehouse_breakdown": [
             {"godown_id": 1, "godown_name": "Main WH (HSR Layout)", "quantity": 200},
             {"godown_id": 2, "godown_name": "Showroom (Koramangala)", "quantity": 60},
             {"godown_id": 3, "godown_name": "Overflow (Whitefield)", "quantity": 20},
         ]},
        {"product_id": 5, "sku_code": "18MR-G-8x4", "sku_name": "18mm MR (8x4)",
         "brand": "Greenply", "category": "MR Plywood", "unit": "sheet",
         "sell_price": 1060, "buy_price": 820, "total_stock": 290,
         "warehouse_breakdown": [
             {"godown_id": 1, "godown_name": "Main WH (HSR Layout)", "quantity": 240},
             {"godown_id": 2, "godown_name": "Showroom (Koramangala)", "quantity": 50},
         ]},
    ]


# ── DISTRIBUTOR INVENTORY ─────────────────────────────────────────────────────

def _mock_distributor_inventory():
    return [
        {
            "distributor_id": 1,
            "distributor_name": "Allied Hardware Distributors",
            "contact_person": "Rajesh Kumar",
            "phone": "+91-98765-11111",
            "city": "Bangalore",
            "status": "ACTIVE",
            "last_dispatch_date": "2026-05-10",
            "total_stock_value": 136750,
            "total_stock_value_fmt": "₹1.37L",
            "stock": [
                {"sku_code": "EBCO-SCH-35", "sku_name": "Ebco Soft-Close Hinge 35mm Pk-10",
                 "category": "Hardware Fittings", "qty": 150, "unit": "packs",
                 "buy_price": 485, "sell_price": 620, "stock_value": 72750,
                 "dispatched_date": "2026-05-10", "order_ref": "ORD-2840"},
                {"sku_code": "HAFL-ZDH-128", "sku_name": "Hafele Zinc D-Handle 128mm",
                 "category": "Hardware Fittings", "qty": 200, "unit": "pcs",
                 "buy_price": 320, "sell_price": 420, "stock_value": 64000,
                 "dispatched_date": "2026-05-08", "order_ref": "ORD-2836"},
            ],
        },
        {
            "distributor_id": 2,
            "distributor_name": "Metro Bath & Kitchen",
            "contact_person": "Priya Sharma",
            "phone": "+91-98765-22222",
            "city": "Bangalore",
            "status": "ACTIVE",
            "last_dispatch_date": "2026-05-08",
            "total_stock_value": 116400,
            "total_stock_value_fmt": "₹1.16L",
            "stock": [
                {"sku_code": "JAQ-LYR-CHR", "sku_name": "Jaquar Lyric Basin Mixer Chrome",
                 "category": "Sanitary CP Fittings", "qty": 12, "unit": "pcs",
                 "buy_price": 4850, "sell_price": 6200, "stock_value": 58200,
                 "dispatched_date": "2026-05-08", "order_ref": "ORD-2834"},
                {"sku_code": "HIND-QST-230", "sku_name": "Hindware Quartz Sensor Tap 230V",
                 "category": "Sanitary CP Fittings", "qty": 8, "unit": "pcs",
                 "buy_price": 2850, "sell_price": 3600, "stock_value": 22800,
                 "dispatched_date": "2026-05-06", "order_ref": "ORD-2831"},
                {"sku_code": "HETT-INN-400", "sku_name": "Hettich InnoTech Drawer 400mm",
                 "category": "Hardware Fittings", "qty": 28, "unit": "sets",
                 "buy_price": 1280, "sell_price": 1620, "stock_value": 35840,
                 "dispatched_date": "2026-05-05", "order_ref": "ORD-2829"},
            ],
        },
        {
            "distributor_id": 3,
            "distributor_name": "South Decor Supplies",
            "contact_person": "Anand Raju",
            "phone": "+91-98765-33333",
            "city": "Mysore",
            "status": "ACTIVE",
            "last_dispatch_date": "2026-05-03",
            "total_stock_value": 84700,
            "total_stock_value_fmt": "₹0.85L",
            "stock": [
                {"sku_code": "EBCO-SCH-35", "sku_name": "Ebco Soft-Close Hinge 35mm Pk-10",
                 "category": "Hardware Fittings", "qty": 80, "unit": "packs",
                 "buy_price": 485, "sell_price": 620, "stock_value": 38800,
                 "dispatched_date": "2026-05-03", "order_ref": "ORD-2824"},
                {"sku_code": "HAFL-ZDH-128", "sku_name": "Hafele Zinc D-Handle 128mm",
                 "category": "Hardware Fittings", "qty": 145, "unit": "pcs",
                 "buy_price": 320, "sell_price": 420, "stock_value": 46400,
                 "dispatched_date": "2026-05-03", "order_ref": "ORD-2824"},
            ],
        },
    ]


def _mock_transfer_history():
    today = datetime.date.today()
    def d(n): return (today - datetime.timedelta(days=n)).isoformat()
    return [
        {
            "transfer_id": "TRF-0998", "from_godown_id": 1, "from_godown_name": "Main WH (HSR Layout)",
            "to_godown_id": 2, "to_godown_name": "Showroom (Koramangala)",
            "sku_code": "LAM-TK-8x4", "sku_name": "Laminates Teak",
            "qty": 40, "unit": "Sheets", "transfer_date": d(3),
            "reason": "Showroom Replenishment", "authorized_by": "Ramesh Kumar",
            "status": "COMPLETED",
            "accounting_entry": {"debit": "Showroom (Koramangala) Stock A/c", "credit": "Main WH (HSR Layout) Stock A/c", "amount": 23200},
        },
        {
            "transfer_id": "TRF-0997", "from_godown_id": 3, "from_godown_name": "Overflow (Whitefield)",
            "to_godown_id": 1, "to_godown_name": "Main WH (HSR Layout)",
            "sku_code": "18BWP-C-8x4", "sku_name": "18mm BWP (8x4)",
            "qty": 10, "unit": "Sheets", "transfer_date": d(7),
            "reason": "Customer Order Fulfilment", "authorized_by": "Suresh Patil",
            "status": "COMPLETED",
            "accounting_entry": {"debit": "Main WH (HSR Layout) Stock A/c", "credit": "Overflow (Whitefield) Stock A/c", "amount": 14200},
        },
        {
            "transfer_id": "TRF-0996", "from_godown_id": 1, "from_godown_name": "Main WH (HSR Layout)",
            "to_godown_id": 3, "to_godown_name": "Overflow (Whitefield)",
            "sku_code": "12MR-G-8x4", "sku_name": "12mm MR Plain (8x4)",
            "qty": 60, "unit": "Sheets", "transfer_date": d(12),
            "reason": "Overflow / Capacity Balancing", "authorized_by": "Mahesh Reddy",
            "status": "COMPLETED",
            "accounting_entry": {"debit": "Overflow (Whitefield) Stock A/c", "credit": "Main WH (HSR Layout) Stock A/c", "amount": 43200},
        },
    ]


# ── Request models ────────────────────────────────────────────────────────────

class DistributorDispatchRequest(BaseModel):
    distributor_id:   int
    distributor_name: str
    sku_code:         str
    sku_name:         str
    category:         Optional[str] = None
    qty:              int
    unit:             str
    buy_price:        float
    sell_price:       Optional[float] = None
    dispatched_by:    Optional[str] = None
    order_ref:        Optional[str] = None
    notes:            Optional[str] = None


class StockTransferRequest(BaseModel):
    from_godown_id:   int
    from_godown_name: str
    to_godown_id:     int
    to_godown_name:   str
    sku_code:         str
    sku_name:         str
    qty:              int
    unit:             str
    buy_price:        Optional[float] = None
    transfer_date:    Optional[str] = None
    reason:           str
    authorized_by:    str
    notes:            Optional[str] = None


# ── GET /api/distributors/inventory ──────────────────────────────────────────

@router.get("/distributors/inventory")
async def get_distributor_inventory():
    """Return stock currently held by distributors (DB or demo)."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            SELECT d.distributor_id, d.distributor_name,
                                   d.contact_person, d.phone, d.city, d.status,
                                   MAX(sd.dispatch_date) AS last_dispatch_date,
                                   COALESCE(SUM(sd.qty * sd.buy_price), 0) AS total_stock_value,
                                   COUNT(DISTINCT sd.dispatch_id) AS dispatch_count
                            FROM distributors d
                            LEFT JOIN stock_dispatches sd ON sd.distributor_id = d.distributor_id
                                AND sd.status = 'ACTIVE'
                            WHERE d.is_active = 1
                            GROUP BY d.distributor_id
                            ORDER BY d.distributor_name
                        """)
                        rows = await cur.fetchall()
                        if rows:
                            cols = [c[0] for c in cur.description]
                            dist_list = [dict(zip(cols, r)) for r in rows]
                            for dist in dist_list:
                                await cur.execute("""
                                    SELECT sd.sku_code, p.sku_name, p.category,
                                           sd.qty, sd.unit, sd.buy_price,
                                           p.sell_price,
                                           sd.qty * sd.buy_price AS stock_value,
                                           sd.dispatch_date AS dispatched_date,
                                           sd.order_ref
                                    FROM stock_dispatches sd
                                    JOIN products p ON p.sku_code = sd.sku_code
                                    WHERE sd.distributor_id = %s AND sd.status = 'ACTIVE'
                                    ORDER BY sd.dispatch_date DESC
                                """, (dist["distributor_id"],))
                                srows = await cur.fetchall()
                                scols = [c[0] for c in cur.description]
                                dist["stock"] = [dict(zip(scols, sr)) for sr in srows]
                                dist["total_stock_value_fmt"] = (
                                    f"₹{dist['total_stock_value']/100000:.2f}L"
                                    if dist["total_stock_value"] >= 100000
                                    else f"₹{int(dist['total_stock_value']):,}"
                                )
                            return {"distributors": dist_list, "data_source": "mysql"}
        except Exception as exc:
            logger.warning("Distributor inventory DB fetch failed: %s", exc)

    # Demo fallback — merge in-session dispatches onto mock base
    from app.core.demo_state import get_distributor_dispatches
    base = _mock_distributor_inventory()
    session_dispatches = get_distributor_dispatches()
    if session_dispatches:
        # Group session dispatches by distributor name and inject
        by_dist: dict[str, list] = {}
        for sd in session_dispatches:
            by_dist.setdefault(sd["distributor_name"], []).append(sd)
        # Try to append to existing distributor or add new entry
        existing_names = {d["distributor_name"] for d in base}
        for dist_name, items in by_dist.items():
            if dist_name in existing_names:
                dist = next(d for d in base if d["distributor_name"] == dist_name)
                for item in items:
                    dist["stock"].append({
                        "sku_code": item["sku_code"], "sku_name": item["sku_name"],
                        "category": item.get("category", "—"), "qty": item["qty"],
                        "unit": item["unit"], "buy_price": item["buy_price"],
                        "sell_price": item.get("sell_price", item["buy_price"]),
                        "stock_value": item["qty"] * item["buy_price"],
                        "dispatched_date": item.get("dispatch_date", datetime.date.today().isoformat()),
                        "order_ref": item.get("order_ref", "—"),
                    })
                    dist["total_stock_value"] += item["qty"] * item["buy_price"]
                dist["total_stock_value_fmt"] = (
                    f"₹{dist['total_stock_value']/100000:.2f}L"
                    if dist["total_stock_value"] >= 100000
                    else f"₹{int(dist['total_stock_value']):,}"
                )
            else:
                total_val = sum(it["qty"] * it["buy_price"] for it in items)
                base.append({
                    "distributor_id": 100 + len(base),
                    "distributor_name": dist_name,
                    "contact_person": "—", "phone": "—", "city": "—", "status": "ACTIVE",
                    "last_dispatch_date": items[0].get("dispatch_date", datetime.date.today().isoformat()),
                    "total_stock_value": total_val,
                    "total_stock_value_fmt": f"₹{total_val/100000:.2f}L" if total_val >= 100000 else f"₹{int(total_val):,}",
                    "stock": [{
                        "sku_code": it["sku_code"], "sku_name": it["sku_name"],
                        "category": it.get("category", "—"), "qty": it["qty"],
                        "unit": it["unit"], "buy_price": it["buy_price"],
                        "sell_price": it.get("sell_price", it["buy_price"]),
                        "stock_value": it["qty"] * it["buy_price"],
                        "dispatched_date": it.get("dispatch_date", datetime.date.today().isoformat()),
                        "order_ref": it.get("order_ref", "—"),
                    } for it in items],
                })
    return {"distributors": base, "data_source": "demo"}


# ── POST /api/stock-dispatch/distributor ──────────────────────────────────────

@router.post("/stock-dispatch/distributor")
async def dispatch_to_distributor(req: DistributorDispatchRequest):
    """Record stock dispatched to a distributor (DB or demo state)."""
    today = datetime.date.today().isoformat()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            INSERT INTO stock_dispatches
                              (distributor_id, sku_code, qty, unit, buy_price,
                               dispatch_date, dispatched_by, order_ref, status, notes)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ACTIVE', %s)
                        """, (
                            req.distributor_id, req.sku_code, req.qty, req.unit,
                            req.buy_price, today, req.dispatched_by or "System",
                            req.order_ref, req.notes,
                        ))
                    await conn.commit()
                return {
                    "success": True, "demo_mode": False,
                    "distributor_name": req.distributor_name,
                    "sku_name": req.sku_name, "qty": req.qty,
                    "dispatch_date": today,
                }
        except Exception as exc:
            logger.warning("Distributor dispatch DB failed: %s", exc)

    from app.core.demo_state import add_distributor_dispatch
    record = {
        "distributor_id": req.distributor_id, "distributor_name": req.distributor_name,
        "sku_code": req.sku_code, "sku_name": req.sku_name,
        "category": req.category, "qty": req.qty, "unit": req.unit,
        "buy_price": req.buy_price, "sell_price": req.sell_price,
        "dispatch_date": today, "dispatched_by": req.dispatched_by,
        "order_ref": req.order_ref, "notes": req.notes,
    }
    add_distributor_dispatch(record)
    return {
        "success": True, "demo_mode": True,
        "distributor_name": req.distributor_name,
        "sku_name": req.sku_name, "qty": req.qty,
        "dispatch_date": today,
    }


# ── GET /api/warehouse/transfers ──────────────────────────────────────────────

@router.get("/warehouse/transfers")
async def get_transfers(godown_id: Optional[int] = Query(None)):
    """Return internal stock transfer history, optionally filtered by godown."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        where = "WHERE (t.from_godown_id = %s OR t.to_godown_id = %s)" if godown_id else ""
                        params = (godown_id, godown_id) if godown_id else ()
                        await cur.execute(f"""
                            SELECT t.transfer_id, t.from_godown_id, fg.godown_name AS from_godown_name,
                                   t.to_godown_id, tg.godown_name AS to_godown_name,
                                   t.sku_code, p.sku_name, t.qty, t.unit, t.buy_price,
                                   t.transfer_date, t.reason, t.authorized_by, t.status, t.notes
                            FROM stock_transfers t
                            JOIN godowns fg ON fg.godown_id = t.from_godown_id
                            JOIN godowns tg ON tg.godown_id = t.to_godown_id
                            JOIN products p  ON p.sku_code = t.sku_code
                            {where}
                            ORDER BY t.transfer_date DESC LIMIT 100
                        """, params)
                        rows = await cur.fetchall()
                        if rows is not None:
                            cols = [c[0] for c in cur.description]
                            transfers = [dict(zip(cols, r)) for r in rows]
                            # Compute accounting entries
                            for t in transfers:
                                amt = (t.get("qty") or 0) * (t.get("buy_price") or 0)
                                t["accounting_entry"] = {
                                    "debit":  f"{t['to_godown_name']} Stock A/c",
                                    "credit": f"{t['from_godown_name']} Stock A/c",
                                    "amount": amt,
                                }
                            return {"transfers": transfers, "data_source": "mysql"}
        except Exception as exc:
            logger.warning("Transfers DB fetch failed: %s", exc)

    from app.core.demo_state import get_stock_transfers
    session_transfers = get_stock_transfers()
    mock_history = _mock_transfer_history()
    all_transfers = session_transfers + mock_history
    if godown_id is not None:
        all_transfers = [t for t in all_transfers
                         if t.get("from_godown_id") == godown_id or t.get("to_godown_id") == godown_id]
    return {"transfers": all_transfers, "data_source": "demo"}


# ── POST /api/warehouse/transfer ──────────────────────────────────────────────

@router.post("/warehouse/transfer")
async def create_stock_transfer(req: StockTransferRequest):
    """Record an internal stock transfer between godowns (DB or demo state)."""
    if req.from_godown_id == req.to_godown_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouse must be different.")
    if req.qty <= 0:
        raise HTTPException(status_code=400, detail="Transfer quantity must be greater than zero.")

    today = req.transfer_date or datetime.date.today().isoformat()
    buy_price = req.buy_price or 0.0
    amount = round(req.qty * buy_price, 2)

    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        # Deduct from source godown
                        await cur.execute("""
                            UPDATE stock SET quantity = quantity - %s
                            WHERE godown_id = %s
                              AND product_id = (SELECT product_id FROM products WHERE sku_code = %s LIMIT 1)
                              AND quantity >= %s
                        """, (req.qty, req.from_godown_id, req.sku_code, req.qty))
                        if cur.rowcount == 0:
                            raise HTTPException(status_code=400, detail="Insufficient stock in source warehouse for this transfer.")
                        # Add to destination
                        await cur.execute("""
                            INSERT INTO stock (product_id, godown_id, quantity)
                            SELECT product_id, %s, %s FROM products WHERE sku_code = %s LIMIT 1
                            ON DUPLICATE KEY UPDATE quantity = quantity + %s
                        """, (req.to_godown_id, req.qty, req.sku_code, req.qty))
                        # Log transfer
                        await cur.execute("""
                            INSERT INTO stock_transfers
                              (from_godown_id, to_godown_id, sku_code, qty, unit,
                               buy_price, transfer_date, reason, authorized_by, status, notes)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'COMPLETED', %s)
                        """, (
                            req.from_godown_id, req.to_godown_id, req.sku_code,
                            req.qty, req.unit, buy_price, today,
                            req.reason, req.authorized_by, req.notes,
                        ))
                    await conn.commit()
                return {
                    "success": True, "demo_mode": False,
                    "transfer_id": f"TRF-DB-{cur.lastrowid}",
                    "from": req.from_godown_name, "to": req.to_godown_name,
                    "sku_name": req.sku_name, "qty": req.qty, "transfer_date": today,
                    "accounting_entry": {
                        "debit":  f"{req.to_godown_name} Stock A/c",
                        "credit": f"{req.from_godown_name} Stock A/c",
                        "amount": amount,
                    },
                }
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Stock transfer DB failed: %s", exc)

    from app.core.demo_state import add_stock_transfer
    record = {
        "from_godown_id": req.from_godown_id, "from_godown_name": req.from_godown_name,
        "to_godown_id":   req.to_godown_id,   "to_godown_name":   req.to_godown_name,
        "sku_code": req.sku_code, "sku_name": req.sku_name,
        "qty": req.qty, "unit": req.unit, "buy_price": buy_price,
        "transfer_date": today, "reason": req.reason,
        "authorized_by": req.authorized_by, "status": "COMPLETED",
        "notes": req.notes or "",
        "accounting_entry": {
            "debit":  f"{req.to_godown_name} Stock A/c",
            "credit": f"{req.from_godown_name} Stock A/c",
            "amount": amount,
        },
    }
    saved = add_stock_transfer(record)
    return {
        "success": True, "demo_mode": True,
        "transfer_id": saved["transfer_id"],
        "from": req.from_godown_name, "to": req.to_godown_name,
        "sku_name": req.sku_name, "qty": req.qty, "transfer_date": today,
        "accounting_entry": record["accounting_entry"],
    }


# ── GET /api/distributor/my-stock ─────────────────────────────────────────────

@router.get("/distributor/my-stock")
async def distributor_my_stock(request: Request):
    """
    Return stock allocated to the authenticated distributor only.
    Reads distributor_id from the JWT claim set at login.
    Returns 403 if the caller is not a distributor account.
    """
    user           = request.scope.get("user", {})
    distributor_id = user.get("distributor_id")
    role           = user.get("role", "")

    if role != "distributor" or distributor_id is None:
        raise HTTPException(
            status_code=403,
            detail="Access restricted to distributor accounts.",
        )

    # ── Try DB first ─────────────────────────────────────────────────────────
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        # Distributor header
                        await cur.execute(
                            "SELECT distributor_id, distributor_name, contact_person, "
                            "phone, city, status FROM distributors WHERE distributor_id = %s AND is_active = 1",
                            (distributor_id,),
                        )
                        dist_row = await cur.fetchone()
                        if dist_row:
                            dcols = [c[0] for c in cur.description]
                            dist  = dict(zip(dcols, dist_row))
                            # Stock items dispatched to this distributor
                            await cur.execute("""
                                SELECT sd.sku_code, p.sku_name, p.category,
                                       sd.qty, sd.unit,
                                       sd.qty * sd.buy_price AS stock_value,
                                       sd.dispatch_date, sd.order_ref
                                FROM stock_dispatches sd
                                JOIN products p ON p.sku_code = sd.sku_code
                                WHERE sd.distributor_id = %s AND sd.status = 'ACTIVE'
                                ORDER BY sd.dispatch_date DESC
                            """, (distributor_id,))
                            srows = await cur.fetchall()
                            scols = [c[0] for c in cur.description]
                            dist["stock"] = [dict(zip(scols, sr)) for sr in srows]
                            dist["total_stock_value"] = sum(i["stock_value"] for i in dist["stock"])
                            return {"distributor": dist, "data_source": "mysql"}
        except Exception as exc:
            logger.warning("Distributor my-stock DB failed: %s", exc)

    # ── Demo fallback — find matching distributor from mock data ──────────────
    from app.core.demo_state import get_distributor_dispatches
    mock_all  = _mock_distributor_inventory()
    base      = next((d for d in mock_all if d["distributor_id"] == distributor_id), None)

    if base is None:
        return {"distributor": None, "stock": [], "message": "No stock allocated yet", "data_source": "demo"}

    # Merge session dispatches for this distributor
    session_items = [
        s for s in get_distributor_dispatches()
        if s.get("distributor_id") == distributor_id
    ]
    extra_stock = [
        {
            "sku_code":       it["sku_code"],
            "sku_name":       it["sku_name"],
            "category":       it.get("category", "—"),
            "qty":            it["qty"],
            "unit":           it["unit"],
            "stock_value":    it["qty"] * it["buy_price"],
            "dispatch_date":  it.get("dispatch_date", datetime.date.today().isoformat()),
            "order_ref":      it.get("order_ref", "—"),
        }
        for it in session_items
    ]

    all_stock = base["stock"] + extra_stock
    total_val = sum(i.get("stock_value", 0) for i in all_stock)

    return {
        "distributor": {
            "distributor_id":   base["distributor_id"],
            "distributor_name": base["distributor_name"],
            "contact_person":   base["contact_person"],
            "phone":            base["phone"],
            "city":             base["city"],
            "status":           base["status"],
            "stock":            all_stock,
            "total_stock_value": total_val,
            "total_stock_value_fmt": (
                f"₹{total_val/100000:.2f}L" if total_val >= 100000
                else f"₹{int(total_val):,}"
            ),
        },
        "data_source": "demo",
    }
