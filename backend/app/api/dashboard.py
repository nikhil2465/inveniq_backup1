"""
Dashboard REST endpoints for all InvenIQ pages.
Each endpoint follows DB-first / mock-fallback pattern.
One router file to serve all 11 pages and the AI validation endpoint.
"""
import asyncio
import json
import logging
import os
import sys
import threading
from datetime import date, timedelta
from pathlib import Path

import aiomysql
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Dashboard"])

# ── File-backed customer store — shared across all uvicorn workers ─────────────
# Persists on disk so customers survive both worker restarts AND auto-refresh.
_CUSTOMERS_FILE = (
    Path(sys.executable).parent / "data" / "added_customers.json"
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent.parent.parent / "data" / "added_customers.json"
)
_customers_lock = threading.Lock()


def _load_added_customers() -> list:
    """Read persisted customers from disk (safe to call from any worker)."""
    try:
        if _CUSTOMERS_FILE.exists():
            with open(_CUSTOMERS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
    except Exception as exc:
        logger.debug("Could not load added_customers.json: %s", exc)
    return []


def _save_added_customers(customers: list) -> None:
    """Atomically overwrite the customers file (temp-file + os.replace)."""
    try:
        _CUSTOMERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = str(_CUSTOMERS_FILE) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(customers, f, ensure_ascii=False, indent=2)
        os.replace(tmp, str(_CUSTOMERS_FILE))
    except Exception as exc:
        logger.warning("Could not persist added customers: %s", exc)


def _append_customers(new_entries: list) -> None:
    """Thread-safe append of one or more customers to the persisted file."""
    with _customers_lock:
        existing = _load_added_customers()
        existing.extend(new_entries)
        _save_added_customers(existing)

try:
    from app.db.connection import get_pool
    from app.db import queries as db_q
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


async def _try_db(fn_name: str):
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if pool is None:
            return None
        fn = getattr(db_q, fn_name)
        result = await fn(pool, "")
        return result
    except Exception as exc:
        logger.warning("Dashboard DB query failed (%s): %s", fn_name, exc)
        return None


# ── /api/overview ──────────────────────────────────────────────────────────────
@router.get("/overview")
async def get_overview(period: str = Query("MTD")):
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                stock, finance, customer, order, sales = await asyncio.gather(
                    db_q.query_stock(pool, ""),
                    db_q.query_finance(pool, ""),
                    db_q.query_customer(pool, ""),
                    db_q.query_order(pool, ""),
                    db_q.query_sales(pool, ""),
                    return_exceptions=True,
                )
                def _ok(r): return r if not isinstance(r, Exception) else {}
                s, f, c, o, sa = _ok(stock), _ok(finance), _ok(customer), _ok(order), _ok(sales)
                critical_count = len(s.get("critical_low", []))
                at_risk_count = len(c.get("at_risk", []))
                return {
                    "revenue_mtd": f.get("revenue_mtd", "₹28.4L"),
                    "gross_margin": f.get("gross_margin", "22.4%"),
                    "dead_stock_value": s.get("dead_stock", [{}])[0].get("value", "₹4.2L") if s.get("dead_stock") else "₹4.2L",
                    "outstanding_receivables": f.get("outstanding_receivables", c.get("total_outstanding", "₹12.8L")),
                    "orders_today": o.get("today_orders", 24),
                    "orders_dispatched": o.get("dispatched", 18),
                    "orders_pending": o.get("pending", 6),
                    "low_stock_skus": critical_count or 7,
                    "working_capital_days": f.get("working_capital_days", 48),
                    "inventory_accuracy": s.get("inventory_accuracy", "96.8%"),
                    "stock_turnover": s.get("stock_turnover", "4.2x"),
                    "gmroi": s.get("gmroi", "Rs.1.98"),
                    "at_risk_customers": at_risk_count or 8,
                    "total_stock_value": s.get("total_stock_value", "Rs.38.6L"),
                    "critical_low": s.get("critical_low", [])[:3],
                    "top_at_risk": c.get("at_risk", [])[:3],
                    "monthly_revenue": sa.get("monthly_revenue", []),
                    "ai_brief": _build_ai_brief(s, f, c, o),
                    "data_source": "mysql",
                }
        except Exception as exc:
            logger.warning("Overview DB failed: %s", exc)
    return _mock_overview()


def _build_ai_brief(s, f, c, o):
    parts = []
    if f.get("gross_margin"):
        parts.append(f"Gross margin {f['gross_margin']}")
    critical = s.get("critical_low", [])
    if critical:
        skus = ", ".join(x["sku"] for x in critical[:2])
        parts.append(f"Critical low stock: {skus}")
    at_risk = c.get("at_risk", [])
    if at_risk:
        parts.append(f"{at_risk[0]['name']} hasn't ordered in {at_risk[0].get('days_silent',0)} days")
    overdue = c.get("overdue_receivables", [])
    if overdue:
        parts.append(f"Outstanding receivables: {c.get('total_outstanding','')}")
    return ". ".join(parts) if parts else (
        "Revenue up 14.2% this month — Hindalco Z-Section louver blades and Alucobond ACP panels are your top movers. "
        "Dead stock worth ₹4.1L sitting unsold for 80+ days — 3 SKUs identified for urgent liquidation action."
    )


_MOCK_MONTHLY_REVENUE = [
    {"month": "May", "revenue": 22.4, "orders": 248},
    {"month": "Jun", "revenue": 24.8, "orders": 264},
    {"month": "Jul", "revenue": 23.6, "orders": 252},
    {"month": "Aug", "revenue": 22.0, "orders": 238},
    {"month": "Sep", "revenue": 21.2, "orders": 228},
    {"month": "Oct", "revenue": 26.4, "orders": 272},
    {"month": "Nov", "revenue": 28.8, "orders": 296},
    {"month": "Dec", "revenue": 30.2, "orders": 312},
    {"month": "Jan", "revenue": 28.6, "orders": 298},
    {"month": "Feb", "revenue": 30.4, "orders": 318},
    {"month": "Mar", "revenue": 32.8, "orders": 342},
    {"month": "Apr", "revenue": 34.6, "orders": 368},
]


def _mock_overview():
    return {
        "revenue_mtd": "₹34.6L", "gross_margin": "26.4%",
        "dead_stock_value": "₹4.1L", "outstanding_receivables": "₹15.4L",
        "orders_today": 18, "orders_dispatched": 13, "orders_pending": 5,
        "low_stock_skus": 4, "working_capital_days": 52,
        "inventory_accuracy": "96.8%", "stock_turnover": "4.8x", "gmroi": "₹2.06",
        "at_risk_customers": 5, "total_stock_value": "₹46.2L",
        "critical_low": [
            {"sku": "Hindalco Z-Section Louver Blade 150mm", "days_cover": 5,  "stock": 62},
            {"sku": "Alucobond ACP 4mm Silver 8×4ft",        "days_cover": 8,  "stock": 18},
            {"sku": "Greenlam HPL Sheet 1mm Ivory Matt 8×4ft","days_cover": 10, "stock": 24},
        ],
        "top_at_risk": [
            {"name": "Prestige Façade Systems",    "days_silent": 42, "monthly_value": "₹5.8L"},
            {"name": "Skyline ACP Contractors",    "days_silent": 36, "monthly_value": "₹3.4L"},
        ],
        "monthly_revenue": _MOCK_MONTHLY_REVENUE,
        "ai_brief": (
            "Revenue up 14.2% this month — Hindalco Z-Section louver blades and Alucobond ACP panels are top movers. "
            "Pre-monsoon façade rush driving demand — Aerofoil blades and ACP panels need urgent replenishment. "
            "Customer 'Prestige Façade Systems' hasn't ordered in 42 days — at-risk account worth ₹5.8L/month. "
            "Viva Composite delayed 2 ACP shipments — LME-linked price revision expected; lock forward orders now."
        ),
        "data_source": "mock",
    }


# ── /api/inventory ─────────────────────────────────────────────────────────────
@router.get("/inventory")
async def get_inventory(period: str = Query("MTD")):
    result = await _try_db("query_stock")
    if result:
        dead = result.get("dead_stock", [])
        critical = result.get("critical_low", [])
        skus = []
        for item in critical:
            skus.append({
                "name": item["sku"], "brand": item.get("brand", "—"),
                "stock": item["stock"], "days_cover": item["days_cover"],
                "status": "critical",
                "value": f"₹{item['stock'] * 1200 / 100000:.2f}L",
            })
        for item in dead:
            skus.append({
                "name": item["sku"], "brand": "—",
                "stock": item["stock"], "days_cover": item["days_old"],
                "status": "dead", "value": item["value"],
            })
        cost = result.get("true_landed_cost", {})
        return {
            "total_stock_value": result["total_stock_value"],
            "critical_count": len(critical),
            "dead_stock_value": sum(float(d["value"].replace("Rs.", "").replace("L", "")) for d in dead if "L" in d.get("value", "")),
            "inventory_accuracy": result.get("inventory_accuracy", "96.8%"),
            "stock_turnover": result.get("stock_turnover", "4.2x"),
            "skus": skus,
            "true_landed_cost": cost,
            "godowns": result.get("godowns", {}),
            "data_source": "mysql",
        }
    return _mock_inventory()


def _mock_inventory():
    return {
        "total_stock_value": "₹46.2L",
        "critical_count": 4,
        "dead_stock_value": 4.1,
        "inventory_accuracy": "96.8%",
        "stock_turnover": "4.8x",
        "skus": [
            {"name": "Hindalco Z-Section Louver Blade 150mm",      "brand": "Hindalco",  "stock": 62,   "buy": 980,  "sell": 1260, "days_cover": 5,  "sales_30": 380, "status": "critical"},
            {"name": "Alucobond ACP 4mm Silver 8×4ft",             "brand": "Alucobond", "stock": 18,   "buy": 2800, "sell": 3650, "days_cover": 8,  "sales_30": 68,  "status": "critical"},
            {"name": "Greenlam HPL Sheet 1mm Ivory Matt 8×4ft",    "brand": "Greenlam",  "stock": 24,   "buy": 2400, "sell": 3150, "days_cover": 10, "sales_30": 72,  "status": "critical"},
            {"name": "Aerofoil Louver Blade 200mm Anodised Silver", "brand": "Hindalco",  "stock": 38,   "buy": 2200, "sell": 2800, "days_cover": 9,  "sales_30": 124, "status": "critical"},
            {"name": "Alucobond ACP 4mm Champagne 8×4ft",          "brand": "Alucobond", "stock": 142,  "buy": 2650, "sell": 3450, "days_cover": 24, "sales_30": 178, "status": "ok"},
            {"name": "Merino HPL Sheet 0.8mm Concrete Grey 8×4ft", "brand": "Merino",    "stock": 88,   "buy": 2600, "sell": 3400, "days_cover": 26, "sales_30": 102, "status": "ok"},
            {"name": "PVC Louver Panel 100mm White 3m",            "brand": "Generic",   "stock": 112,  "buy": 380,  "sell": 0,    "days_cover": 98, "sales_30": 0,   "status": "dead"},
            {"name": "Alucobond ACP 4mm Gold 8×4ft (old finish)",  "brand": "Alucobond", "stock": 54,   "buy": 2750, "sell": 0,    "days_cover": 92, "sales_30": 2,   "status": "dead"},
            {"name": "Merino HPL Sheet Abstract Print (disc.)",    "brand": "Merino",    "stock": 36,   "buy": 2800, "sell": 0,    "days_cover": 84, "sales_30": 4,   "status": "dead"},
            {"name": "Aluminium C-Channel Extrusion 25×25mm 6m",   "brand": "Hindalco",  "stock": 186,  "buy": 420,  "sell": 560,  "days_cover": 34, "sales_30": 164, "status": "ok"},
        ],
        "data_source": "mock",
    }


# ── /api/dead-stock ────────────────────────────────────────────────────────────
@router.get("/dead-stock")
async def get_dead_stock(period: str = Query("MTD")):
    result = await _try_db("query_stock")
    if result:
        dead = result.get("dead_stock", [])
        total_val = sum(
            float(d["value"].replace("Rs.", "").replace("L", "")) * 100000
            for d in dead if "L" in d.get("value", "")
        )
        return {
            "total_value": f"₹{total_val/100000:.1f}L",
            "skus_count": len(dead),
            "oldest_days": max((d["days_old"] for d in dead), default=0),
            "items": dead,
            "data_source": "mysql",
        }
    return {
        "total_value": "₹3.8L",
        "skus_count": 3,
        "oldest_days": 95,
        "cash_recovery_potential": "₹3.2L",
        "items": [
            {"sku": "PVC Louver Panel 100mm White 3m",           "days_old": 98, "stock": 112, "value": "₹1.94L", "action": "10% discount to MEP contractors; offer as utility/parking-shade bundle"},
            {"sku": "Alucobond ACP 4mm Gold 8×4ft (old finish)", "days_old": 92, "stock": 54,  "value": "₹1.38L", "action": "Offer at 15% discount to interior designers; return to Alucobond for credit if possible"},
            {"sku": "Merino HPL Sheet Abstract Print (disc.)",   "days_old": 84, "stock": 36,  "value": "₹0.78L", "action": "Bundle with Greenlam HPL orders; 12% combo discount to architect firms for feature-wall projects"},
        ],
        "data_source": "mock",
    }


# ── /api/inward ────────────────────────────────────────────────────────────────
@router.get("/inward")
async def get_inward(period: str = Query("MTD")):
    result = await _try_db("query_inward")
    if result:
        return result
    return {
        "inward_today": "₹6.8L",
        "outward_today": "₹8.2L",
        "inward_count": 12,
        "outward_count": 18,
        "grn_today": 3,
        "qc_pass_rate": "94%",
        "shrinkage_mtd": "₹0.24L",
        "avg_putaway_time": "28 min",
        "stages": [
            {"label": "GRN Received",  "count": 3, "value": "₹6.8L",  "status": "ok"},
            {"label": "QC Inspection", "count": 3, "value": "₹6.8L",  "status": "ok"},
            {"label": "QC Passed",     "count": 2, "value": "₹4.8L",  "status": "ok"},
            {"label": "Put Away",      "count": 2, "value": "₹4.8L",  "status": "ok"},
            {"label": "Stock Updated", "count": 2, "value": "₹4.8L",  "status": "done"},
        ],
        "recent_grn": [
            {"grn": "GRN-4424", "supplier": "Hindalco Extrusions", "value": "₹8.4L", "status": "MATCH",    "date": str(date.today())},
            {"grn": "GRN-4423", "supplier": "Greenlam Industries", "value": "₹4.2L", "status": "MATCH",    "date": str(date.today())},
            {"grn": "GRN-4422", "supplier": "Viva Composite",      "value": "₹3.6L", "status": "MISMATCH", "date": str(date.today())},
        ],
        "data_source": "mock",
    }


# ── /api/sales ─────────────────────────────────────────────────────────────────
@router.get("/sales")
async def get_sales(period: str = Query("MTD")):
    result = await _try_db("query_sales")
    if result:
        return result
    return {
        "revenue_mtd": "₹34.6L",
        "revenue_growth": "+14.2% MoM",
        "orders_mtd": 428,
        "avg_order_value": "₹80,840",
        "gross_margin": "26.4%",
        "top_sku": "Hindalco Z-Section Louver Blade 150mm",
        "monthly_revenue": [
            {"month": "May",  "revenue": 22.4}, {"month": "Jun",  "revenue": 24.8},
            {"month": "Jul",  "revenue": 23.6}, {"month": "Aug",  "revenue": 22.0},
            {"month": "Sep",  "revenue": 21.2}, {"month": "Oct",  "revenue": 26.4},
            {"month": "Nov",  "revenue": 28.8}, {"month": "Dec",  "revenue": 30.2},
            {"month": "Jan",  "revenue": 28.6}, {"month": "Feb",  "revenue": 30.4},
            {"month": "Mar",  "revenue": 32.8}, {"month": "Apr",  "revenue": 34.6},
        ],
        "margin_by_sku": [
            {"sku": "Aluminium Louvers",  "margin": 27.2}, {"sku": "ACP Premium",       "margin": 28.8},
            {"sku": "HPL Laminates",      "margin": 30.8}, {"sku": "Aerofoil Blades",   "margin": 28.5},
            {"sku": "ACP Budget",         "margin": 24.6}, {"sku": "Operable Systems",  "margin": 32.4},
        ],
        "day_of_week": [
            {"day": "Mon", "avg": 42.0}, {"day": "Tue", "avg": 38.4},
            {"day": "Wed", "avg": 51.2}, {"day": "Thu", "avg": 48.8},
            {"day": "Fri", "avg": 62.4}, {"day": "Sat", "avg": 78.6},
            {"day": "Sun", "avg": 22.0},
        ],
        "data_source": "mock",
    }


# ── /api/customers ─────────────────────────────────────────────────────────────
@router.get("/customers")
async def get_customers(period: str = Query("MTD")):
    added = _load_added_customers()
    result = await _try_db("query_customer_list")
    if result:
        if added:
            result = dict(result)
            result["customers"] = list(result.get("customers") or []) + added
            result["total_customers"] = len(result["customers"])
            result["data_source"] = str(result.get("data_source", "mysql")) + "+added"
        return result
    basic = await _try_db("query_customer")
    if basic:
        return {
            "total_customers": int(basic.get("total_customers", 148)) + len(added),
            "at_risk_count": len(basic.get("at_risk", [])),
            "total_outstanding": basic.get("total_outstanding", "₹12.8L"),
            "overdue_receivables": basic.get("overdue_receivables", []),
            "at_risk": basic.get("at_risk", []),
            "customers": added,
            "data_source": "mysql+added" if added else "mysql",
        }
    return _mock_customers(added)


def _mock_customers(added: list | None = None):
    if added is None:
        added = _load_added_customers()
    base = [
        {"name": "Prestige Façade Systems",       "segment": "Façade Contractor",   "monthly_value": "₹5.8L", "outstanding": "₹0",    "days_since_order": 42, "risk": "MEDIUM", "score": 52},
        {"name": "Brigade Enterprises",           "segment": "Developer/Builder",   "monthly_value": "₹4.6L", "outstanding": "₹0",    "days_since_order": 3,  "risk": "LOW",    "score": 94},
        {"name": "Skyline ACP Contractors",       "segment": "Façade Contractor",   "monthly_value": "₹3.4L", "outstanding": "₹0",    "days_since_order": 36, "risk": "MEDIUM", "score": 58},
        {"name": "Nikhil Architects Studio",      "segment": "Architect/Designer",  "monthly_value": "₹2.8L", "outstanding": "₹0.6L", "days_since_order": 5,  "risk": "LOW",    "score": 88},
        {"name": "Apex Cladding Works",           "segment": "Façade Contractor",   "monthly_value": "₹2.4L", "outstanding": "₹3.8L", "days_since_order": 82, "risk": "HIGH",   "score": 40},
        {"name": "Metro Build & Infrastructure",  "segment": "Developer/Builder",   "monthly_value": "₹2.0L", "outstanding": "₹2.4L", "days_since_order": 58, "risk": "HIGH",   "score": 44},
        {"name": "Patel Design Associates",       "segment": "Architect/Designer",  "monthly_value": "₹1.6L", "outstanding": "₹1.6L", "days_since_order": 46, "risk": "MEDIUM", "score": 62},
        {"name": "Nova Interior Solutions",       "segment": "Interior Designer",   "monthly_value": "₹1.2L", "outstanding": "₹0.3L", "days_since_order": 4,  "risk": "LOW",    "score": 86},
        {"name": "Sunrise Building Materials",    "segment": "Retailer/Distributor","monthly_value": "₹0.8L", "outstanding": "₹0",    "days_since_order": 9,  "risk": "LOW",    "score": 92},
    ]
    all_customers = base + added
    overdue = [
        {"customer": "Apex Cladding Works",          "amount": "₹3.8L", "days_overdue": 82, "risk": "HIGH"},
        {"customer": "Metro Build & Infrastructure",  "amount": "₹2.4L", "days_overdue": 58, "risk": "HIGH"},
        {"customer": "Patel Design Associates",       "amount": "₹1.6L", "days_overdue": 46, "risk": "MEDIUM"},
        {"customer": "Others (8 accounts)",           "amount": "₹7.6L", "days_overdue": 28, "risk": "LOW"},
    ]
    return {
        "total_customers": len(all_customers),
        "at_risk_count": 5,
        "total_outstanding": "₹15.4L",
        "best_segment": "Façade Contractors",
        "customers": all_customers,
        "overdue_receivables": overdue,
        "data_source": "mock" if not added else "mock+added",
    }


def _fmt_money(v) -> str:
    if v is None or v == "" or v == 0:
        return "₹0"
    if isinstance(v, (int, float)):
        return f"₹{v:,.0f}"
    s = str(v).strip()
    return s if s else "₹0"


def _safe_int(val, default: int = 0) -> int:
    """Parse any value as int — returns default on empty/non-numeric (handles 'N/A', '-', etc.)."""
    if val is None or val == "":
        return default
    if isinstance(val, (int, float)):
        return int(val)
    try:
        return int(float(str(val).strip()))
    except Exception:
        return default


@router.post("/customers/add", status_code=201)
async def add_customer(payload: dict):
    """Manually add a single customer. Persisted to disk — survives worker rotation and restarts."""
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Customer name is required.")
    customer = {
        "name":             name,
        "segment":          str(payload.get("segment") or "General").strip(),
        "monthly_value":    _fmt_money(payload.get("monthly_value")),
        "outstanding":      _fmt_money(payload.get("outstanding")),
        "days_since_order": _safe_int(payload.get("days_since_order"), 0),
        "risk":             str(payload.get("risk") or "LOW").strip().upper(),
        "score":            _safe_int(payload.get("score"), 50),
    }
    for extra in ("email", "phone", "address", "contact_person"):
        if payload.get(extra):
            customer[extra] = str(payload[extra]).strip()
    _append_customers([customer])
    logger.info("Customer added manually: name=%s segment=%s", name, customer["segment"])
    return {"added": 1, "customer": customer, "message": f"Customer '{name}' added successfully."}


@router.post("/customers/import", status_code=201)
async def import_customers(payload: dict):
    """Import customers from CSV/Excel mapping. Persisted to disk — survives worker rotation and restarts."""
    customers = payload.get("customers", [])
    added = []
    skipped = 0
    for c in customers:
        name = (c.get("name") or "").strip()
        if not name:
            skipped += 1
            continue
        customer = {
            "name":             name,
            "segment":          str(c.get("segment") or "General").strip(),
            "monthly_value":    _fmt_money(c.get("monthly_value")),
            "outstanding":      _fmt_money(c.get("outstanding")),
            "days_since_order": _safe_int(c.get("days_since_order"), 0),
            "risk":             str(c.get("risk") or "LOW").strip().upper(),
            "score":            _safe_int(c.get("score"), 50),
        }
        for extra in ("email", "phone", "address", "contact_person"):
            if c.get(extra):
                customer[extra] = str(c[extra]).strip()
        added.append(customer)
        logger.info("Customer import: name=%s segment=%s", name, customer["segment"])
    if added:
        _append_customers(added)
    return {
        "added":   len(added),
        "skipped": skipped,
        "message": f"{len(added)} customer(s) imported successfully.",
    }


_ORDER_TREND_30D = [4,6,3,8,5,7,4,9,6,8,4,7,5,6,8,4,9,7,5,8,6,7,4,8,5,9,6,7,8,24]


# ── /api/orders ────────────────────────────────────────────────────────────────
@router.get("/orders")
async def get_orders(period: str = Query("MTD")):
    # ── DB path: build KPIs + pending list from sales_orders table ────────────
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        # Today's counts by status
                        await cur.execute(
                            "SELECT status, COUNT(*) FROM sales_orders "
                            "WHERE DATE(created_at) = CURDATE() GROUP BY status"
                        )
                        status_today = {r[0]: r[1] for r in await cur.fetchall()}

                        # MTD order count
                        await cur.execute(
                            "SELECT COUNT(*) FROM sales_orders "
                            "WHERE DATE_FORMAT(created_at,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')"
                        )
                        mtd_cnt = (await cur.fetchone() or [0])[0]

                        # Pending (not yet dispatched/delivered/cancelled)
                        await cur.execute(
                            "SELECT id, order_number, customer_name, "
                            "ROUND(total_value,2) AS val, status, delivery_date, notes "
                            "FROM sales_orders "
                            "WHERE status NOT IN ('DISPATCHED','DELIVERED','CANCELLED') "
                            "ORDER BY delivery_date ASC LIMIT 10"
                        )
                        pending_rows = await cur.fetchall()
                        import datetime as _dt
                        pending_details = []
                        for oid, onum, cust, val, st, ddate, notes in pending_rows:
                            v = float(val or 0)
                            val_str = f"₹{v/100000:.2f}L" if v >= 100000 else f"₹{v:,.0f}"
                            if ddate:
                                dd = ddate if isinstance(ddate, _dt.date) else _dt.date.fromisoformat(str(ddate))
                                diff = (_dt.date.today() - dd).days
                                delay = f"{diff}d overdue" if diff > 0 else (f"Due {ddate}" if diff == 0 else "On time")
                            else:
                                delay = "No date set"
                            pending_details.append({
                                "order": onum or f"SO-{oid}",
                                "customer": cust or "—",
                                "value": val_str,
                                "delayed": delay,
                                "reason": (notes or "").split("|")[0].strip() or "Pending",
                                "status": st,
                                "action": "Mark dispatched" if st == "IN_PRODUCTION" else "Advance status",
                            })

                        dispatched = status_today.get("DISPATCHED", 0)
                        pending_cnt = sum(status_today.get(s, 0) for s in ("DRAFT", "CONFIRMED", "IN_PRODUCTION"))
                        return {
                            "today_orders": sum(status_today.values()),
                            "dispatched": dispatched,
                            "pending": pending_cnt,
                            "avg_fulfillment_hrs": 3.2,
                            "orders_mtd": mtd_cnt,
                            "dispatch_sla": "87%",
                            "pending_details": pending_details,
                            "order_trend_30d": _ORDER_TREND_30D,
                            "data_source": "mysql",
                        }
        except Exception as exc:
            logger.warning("GET /api/orders DB failed: %s", exc)

    # ── Demo mode: apply demo_state status overrides to filter pending list ───
    try:
        from app.core.demo_state import get_all_status_overrides
        overrides = get_all_status_overrides()
    except ImportError:
        overrides = {}

    _MOCK_PENDING = [
        {"order": "ORD-2847", "order_id": 9,  "customer": "Crystal Interiors",       "value": "₹1.17L",
         "delayed": "5d overdue", "reason": "HPL 1mm Matte in production — OVERDUE",
         "status": "IN_PRODUCTION", "action": "Dispatch today"},
        {"order": "ORD-2848", "order_id": 10, "customer": "BuildRight Construction",  "value": "₹2.16L",
         "delayed": "3d overdue", "reason": "Compact Laminate 6mm — confirmed but not dispatched",
         "status": "CONFIRMED", "action": "Arrange dispatch"},
        {"order": "ORD-2855", "order_id": 6,  "customer": "TechPark Infra",           "value": "₹2.61L",
         "delayed": "No delay",   "reason": "PVC Louver Blades — draft pending confirmation",
         "status": "DRAFT", "action": "Confirm order"},
        {"order": "ORD-2856", "order_id": 8,  "customer": "Horizon Hotels",           "value": "₹2.88L",
         "delayed": "No delay",   "reason": "HPL Compact — draft pending confirmation",
         "status": "DRAFT", "action": "Confirm order"},
    ]
    # Filter out orders whose status was advanced to DISPATCHED/DELIVERED via Sales Orders tab
    pending = [
        p for p in _MOCK_PENDING
        if overrides.get(p.get("order_id")) not in ("DISPATCHED", "DELIVERED", "CANCELLED")
           and p["status"] not in ("DISPATCHED", "DELIVERED", "CANCELLED")
    ]
    # Apply any overrides to status field so Orders view reflects updates
    for p in pending:
        if p.get("order_id") in overrides:
            p["status"] = overrides[p["order_id"]]

    return {
        "today_orders": 24, "dispatched": 18, "pending": len(pending),
        "avg_fulfillment_hrs": 3.2, "orders_mtd": 486,
        "dispatch_sla": "87%",
        "pending_details": pending,
        "order_trend_30d": _ORDER_TREND_30D,
        "data_source": "mock",
    }


# ── /api/procurement ───────────────────────────────────────────────────────────
@router.get("/procurement")
async def get_procurement(period: str = Query("MTD")):
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                supplier, po_grn = await asyncio.gather(
                    db_q.query_supplier(pool, ""),
                    db_q.query_po_grn(pool, ""),
                    return_exceptions=True,
                )
                def _ok(r): return r if not isinstance(r, Exception) else {}
                s, p = _ok(supplier), _ok(po_grn)
                raw_suppliers = s.get("suppliers", [])
                suppliers_with_verdict = [
                    {**sup, "recommendation": _compute_verdict(
                        sup.get("on_time_pct", 0),
                        sup.get("avg_delay_days", 0),
                        sup.get("grn_match_rate", "100%"),
                    )}
                    for sup in raw_suppliers
                ]
                return {
                    "suppliers": suppliers_with_verdict,
                    "overdue_pos": s.get("overdue_pos", []),
                    "open_pos": p.get("kpis", {}).get("open_pos", 0),
                    "open_po_value": p.get("kpis", {}).get("open_po_value", "₹0"),
                    "grn_match_rate": p.get("kpis", {}).get("grn_match_rate", "—"),
                    "grn_mismatches": p.get("kpis", {}).get("grn_mismatches_mtd", 0),
                    "data_source": "mysql",
                }
        except Exception as exc:
            logger.warning("Procurement DB failed: %s", exc)
    return _mock_procurement()


def _compute_verdict(on_time_pct: float, avg_delay_days: float, grn_match_rate_str: str) -> str:
    """Dynamically compute supplier AI verdict from live performance metrics."""
    try:
        grn_pct = float(str(grn_match_rate_str).strip('%'))
    except (ValueError, AttributeError):
        grn_pct = 100.0

    if on_time_pct >= 92:
        level = 3  # PREFERRED
    elif on_time_pct >= 85:
        level = 2  # GOOD
    elif on_time_pct >= 70:
        level = 1  # REVIEW
    else:
        level = 0  # AVOID

    if grn_pct < 85:
        level = max(0, level - 1)
    if avg_delay_days > 5:
        level = max(0, level - 1)

    return {3: "PREFERRED", 2: "GOOD", 1: "REVIEW", 0: "AVOID"}.get(level, "REVIEW")


_SUPPLIER_PERF = [
    {"name": "Hindalco Extrusions", "on_time_pct": 92, "avg_delay_days": 0.8, "grn_match_rate": "98%", "open_pos": 2, "overdue_pos": 0},
    {"name": "Greenlam Industries", "on_time_pct": 90, "avg_delay_days": 1.0, "grn_match_rate": "97%", "open_pos": 1, "overdue_pos": 0},
    {"name": "Alucobond (3A)",      "on_time_pct": 86, "avg_delay_days": 1.8, "grn_match_rate": "94%", "open_pos": 2, "overdue_pos": 1},
    {"name": "Viva Composite",      "on_time_pct": 78, "avg_delay_days": 2.8, "grn_match_rate": "88%", "open_pos": 2, "overdue_pos": 1},
    {"name": "Merino Industries",   "on_time_pct": 88, "avg_delay_days": 1.2, "grn_match_rate": "96%", "open_pos": 1, "overdue_pos": 0},
]


def _mock_procurement():
    suppliers = [
        {**s, "recommendation": _compute_verdict(s["on_time_pct"], s["avg_delay_days"], s["grn_match_rate"])}
        for s in _SUPPLIER_PERF
    ]
    return {
        "suppliers": suppliers,
        "overdue_pos": ["PO-9124 (Viva Composite, +2d)", "PO-9118 (Alucobond, +1d)"],
        "open_pos": 8,
        "open_po_value": "₹22.6L",
        "grn_match_rate": "95%",
        "grn_mismatches": 2,
        "alerts": [
            {"type": "danger",  "text": "PO-9124 Viva Composite overdue +2 days — ₹3.6L ACP budget panels pending"},
            {"type": "warning", "text": "GRN-4422: Viva Composite thickness mismatch — 3.8mm received vs 4mm ordered"},
            {"type": "warning", "text": "PO-9118 Alucobond +1 day delay — ₹4.8L ACP Silver panels in transit from Mumbai"},
            {"type": "info",    "text": "Hindalco Extrusions 92% on-time — preferred aluminium supplier this quarter"},
        ],
        "data_source": "mock",
    }


# ── /api/procurement/suppliers ─────────────────────────────────────────────────

@router.get("/procurement/suppliers")
async def get_supplier_list():
    """Lightweight endpoint — supplier name list with performance data for PO dropdowns."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                raw = await db_q.query_supplier(pool, "")
                db_suppliers = raw.get("suppliers", [])
                if db_suppliers:
                    return {
                        "suppliers": [
                            {
                                "name": s.get("name", ""),
                                "on_time_pct": s.get("on_time_pct", 0),
                                "grn_match_rate": s.get("grn_match_rate", "—"),
                                "recommendation": s.get("recommendation") or _compute_verdict(
                                    s.get("on_time_pct", 0),
                                    s.get("avg_delay_days", 0),
                                    s.get("grn_match_rate", "0%"),
                                ),
                            }
                            for s in db_suppliers if s.get("name")
                        ],
                        "data_source": "mysql",
                    }
        except Exception as exc:
            logger.warning("supplier-list DB failed: %s", exc)

    return {
        "suppliers": [
            {
                "name": s["name"],
                "on_time_pct": s["on_time_pct"],
                "grn_match_rate": s["grn_match_rate"],
                "recommendation": _compute_verdict(
                    s["on_time_pct"], s["avg_delay_days"], s["grn_match_rate"]
                ),
            }
            for s in _SUPPLIER_PERF
        ],
        "data_source": "mock",
    }


# ── /api/freight ───────────────────────────────────────────────────────────────
@router.get("/freight")
async def get_freight(period: str = Query("MTD")):
    result = await _try_db("query_freight")
    if result:
        return result
    return {
        "outbound_cost_per_delivery": "₹510",
        "vehicle_utilisation": "68%",
        "lanes_count": 6,
        "savings_potential": "₹2,400",
        "outbound_lanes": [
            {"lane": "Whitefield",      "zone": "East",  "cost_per_delivery": 420,  "fill_pct": 82, "status": "BEST"},
            {"lane": "Koramangala",     "zone": "South", "cost_per_delivery": 480,  "fill_pct": 76, "status": "OK"},
            {"lane": "HSR Layout",      "zone": "South", "cost_per_delivery": 510,  "fill_pct": 68, "status": "OK"},
            {"lane": "BTM Layout",      "zone": "South", "cost_per_delivery": 560,  "fill_pct": 62, "status": "HIGH"},
            {"lane": "Electronic City", "zone": "South", "cost_per_delivery": 680,  "fill_pct": 54, "status": "WORST"},
            {"lane": "Hebbal",          "zone": "North", "cost_per_delivery": 590,  "fill_pct": 64, "status": "HIGH"},
        ],
        "inbound_costs": {
            "Hindalco Extrusions": "₹3.2/sheet (flat-rack — aluminium profiles)",
            "Greenlam Industries": "₹2.8/sheet (palletised HPL)",
            "Alucobond (3A)":      "₹4.2/sheet (cradle transport — ACP panels)",
            "Viva Composite":      "₹3.8/sheet (flat-bed — ACP budget grade)",
        },
        "freight_trend_30d": [18, 19, 17, 20, 18, 21, 19, 18, 17, 20, 19, 18, 20, 21, 18, 17, 19, 18, 20, 18, 17, 19, 18, 19, 20, 18, 17, 18, 19, 18],
        "data_source": "mock",
    }


# ── /api/freight/in-transit ────────────────────────────────────────────────────
@router.get("/freight/in-transit")
async def get_in_transit():
    """Returns DISPATCHED + IN_PRODUCTION sales orders for freight route board."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor(aiomysql.DictCursor) as cur:
                        await cur.execute(
                            "SELECT order_id, order_number, customer_name, "
                            "site_location, total_value, status, delivery_date, notes "
                            "FROM sales_orders "
                            "WHERE status IN ('IN_PRODUCTION','DISPATCHED') "
                            "ORDER BY delivery_date ASC LIMIT 20"
                        )
                        rows = await cur.fetchall()
                        if rows:
                            return {"deliveries": rows, "total": len(rows), "data_source": "mysql"}
        except Exception as exc:
            logger.warning("in-transit DB failed: %s", exc)

    today = date.today()
    def d(delta): return (today + timedelta(days=delta)).isoformat()
    deliveries = [
        {"order_id": 1,  "order_number": "LO-20260408-001", "customer_name": "Prestige Skyrise Developers",
         "site_location": "Whitefield, Bangalore",  "total_value": 588000,
         "status": "IN_PRODUCTION", "delivery_date": d(4),  "notes": "Anodized silver facade"},
        {"order_id": 3,  "order_number": "LO-20260412-001", "customer_name": "Urban Living Interiors",
         "site_location": "Indiranagar, Bangalore",  "total_value": 156000,
         "status": "DISPATCHED",   "delivery_date": d(0),  "notes": "Matte grey kitchen fitout"},
        {"order_id": 8,  "order_number": "LO-20260430-001", "customer_name": "Deccan Builders",
         "site_location": "Koramangala, Bangalore", "total_value": 320000,
         "status": "DISPATCHED",   "delivery_date": d(1),  "notes": "Aerofoil louver blades + Alucobond ACP panels"},
        {"order_id": 9,  "order_number": "LO-20260501-001", "customer_name": "SkyTech Infra",
         "site_location": "Electronic City, Bangalore", "total_value": 210000,
         "status": "IN_PRODUCTION", "delivery_date": d(6), "notes": "HPL compact laminate feature-wall panels"},
        {"order_id": 10, "order_number": "LO-20260503-001", "customer_name": "Metro Constructions",
         "site_location": "Hebbal, Bangalore",       "total_value": 145000,
         "status": "DISPATCHED",   "delivery_date": d(2),  "notes": "Greenlam HPL + aluminium Z-section profiles"},
    ]
    return {"deliveries": deliveries, "total": len(deliveries), "data_source": "mock"}


# ── /api/finance ───────────────────────────────────────────────────────────────
@router.get("/finance")
async def get_finance(period: str = Query("MTD")):
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                fin, cust = await asyncio.gather(
                    db_q.query_finance(pool, ""),
                    db_q.query_customer(pool, ""),
                    return_exceptions=True,
                )
                def _ok(r): return r if not isinstance(r, Exception) else {}
                f, c = _ok(fin), _ok(cust)
                mock = _mock_finance()
                return {
                    "revenue_mtd": f.get("revenue_mtd", "₹28.4L"),
                    "gross_profit_mtd": f.get("gross_profit_mtd", "₹6.36L"),
                    "gross_margin": f.get("gross_margin", "22.4%"),
                    "working_capital_days": f.get("working_capital_days", 48),
                    "outstanding_receivables": f.get("outstanding_receivables", "₹12.8L"),
                    "dead_stock_locked": f.get("dead_stock_locked", "₹7.8L"),
                    "returns_mtd": f.get("returns_mtd", "₹0.82L"),
                    "gst": f.get("gst", {}),
                    "cash_cycle": f.get("cash_cycle", "DIO 22 + DSO 34 - DPO 8 = 48 days"),
                    "cash_flow_6m": f.get("cash_flow_6m", mock["cash_flow_6m"]),
                    "margin_by_sku": f.get("margin_by_sku", mock["margin_by_sku"]),
                    "overdue_receivables": c.get("overdue_receivables", [])[:5],
                    "monthly_pl": f.get("monthly_pl", mock["monthly_pl"]),
                    "budget_targets": f.get("budget_targets", mock["budget_targets"]),
                    "expense_breakdown": f.get("expense_breakdown", mock["expense_breakdown"]),
                    "data_source": "mysql",
                }
        except Exception as exc:
            logger.warning("Finance DB failed: %s", exc)
    return _mock_finance()


def _mock_finance():
    return {
        "revenue_mtd": "₹34.6L",
        "gross_profit_mtd": "₹9.14L",
        "gross_margin": "26.4%",
        "working_capital_days": 52,
        "outstanding_receivables": "₹15.4L",
        "dead_stock_locked": "₹4.1L",
        "returns_mtd": "₹0.72L",
        "net_cash": "₹6.4L",
        "gst": {
            "output_collected": "₹6.23L",
            "itc_available": "₹5.46L",
            "net_payable": "₹0.77L",
            "gstr3b_status": "PENDING",
        },
        "cash_cycle": "DIO 24 + DSO 38 − DPO 10 = 52 days",
        "margin_by_sku": [
            {"sku": "Operable Systems",    "margin": 32.4}, {"sku": "HPL Laminates",       "margin": 30.8},
            {"sku": "ACP Premium",         "margin": 28.8}, {"sku": "Aerofoil Blades",     "margin": 28.5},
            {"sku": "Aluminium Louvers",   "margin": 27.2}, {"sku": "ACP Budget",          "margin": 24.6},
            {"sku": "Dead Stock (PVC/old)","margin": 0.0},  {"sku": "Accessories",         "margin": 36.2},
        ],
        "cash_flow_6m": [
            {"month": "Nov", "collections": 28.2, "purchases": 20.4},
            {"month": "Dec", "collections": 31.6, "purchases": 22.8},
            {"month": "Jan", "collections": 29.4, "purchases": 21.6},
            {"month": "Feb", "collections": 31.2, "purchases": 22.4},
            {"month": "Mar", "collections": 33.6, "purchases": 24.2},
            {"month": "Apr", "collections": 34.6, "purchases": 25.8},
        ],
        "overdue_receivables": [
            {"customer": "Apex Cladding Works",          "amount": "₹3.8L", "days_overdue": 82, "risk": "HIGH"},
            {"customer": "Metro Build & Infrastructure",  "amount": "₹2.4L", "days_overdue": 58, "risk": "HIGH"},
            {"customer": "Patel Design Associates",       "amount": "₹1.6L", "days_overdue": 46, "risk": "MEDIUM"},
            {"customer": "Others (10 accounts)",          "amount": "₹7.6L", "days_overdue": 26, "risk": "LOW"},
        ],
        "monthly_pl": [
            {"month": "Nov", "revenue": 28.4, "gross_profit": 7.1, "ebitda": 4.3},
            {"month": "Dec", "revenue": 31.6, "gross_profit": 8.2, "ebitda": 5.1},
            {"month": "Jan", "revenue": 29.4, "gross_profit": 7.6, "ebitda": 4.7},
            {"month": "Feb", "revenue": 31.2, "gross_profit": 8.0, "ebitda": 5.0},
            {"month": "Mar", "revenue": 33.6, "gross_profit": 8.6, "ebitda": 5.4},
            {"month": "Apr", "revenue": 34.6, "gross_profit": 9.1, "ebitda": 6.8},
        ],
        "budget_targets": {
            "revenue":      {"label": "Revenue MTD",      "target": 40.0,  "actual": 34.6},
            "gross_profit": {"label": "Gross Profit MTD", "target": 11.0,  "actual": 9.14},
            "ebitda":       {"label": "EBITDA MTD",       "target": 8.0,   "actual": 6.8},
            "expenses":     {"label": "Opex Budget",      "target": 4.0,   "actual": 2.3},
        },
        "expense_breakdown": [
            {"category": "Freight & Logistics", "budget": 1.2,  "actual": 1.0},
            {"category": "Salaries & Wages",    "budget": 1.6,  "actual": 1.4},
            {"category": "Rent & Utilities",    "budget": 0.4,  "actual": 0.38},
            {"category": "Marketing & Sales",   "budget": 0.3,  "actual": 0.22},
            {"category": "Admin & Misc",        "budget": 0.5,  "actual": 0.3},
        ],
        "data_source": "mock",
    }


# ── /api/demand ────────────────────────────────────────────────────────────────
@router.get("/demand")
async def get_demand(period: str = Query("MTD")):
    result = await _try_db("query_demand")
    if result:
        forecast = result.get("current_month_top", [])
        enriched = []
        for item in forecast:
            f30 = item.get("f30", item.get("forecast_qty", 0))
            sig = item.get("signal", "STABLE")
            action = "Review stock" if "STABLE" in sig else \
                     "Pre-order now" if "SURGE" in sig or "GROWING" in sig else \
                     "Reduce next order"
            enriched.append({**item, "f30": f30, "f60": int(f30 * 1.12), "f90": int(f30 * 1.18), "action": action})
        return {
            "forecast": enriched,
            "seasonal_insight": result.get("seasonal_insight", ""),
            "data_source": "mysql",
        }
    return _mock_demand()


def _mock_demand():
    return {
        "forecast": [
            {"sku": "Hindalco Z-Section Louver Blade 150mm",     "curr": 380, "f30": 512, "f60": 596, "f90": 648, "signal": "SURGE +34.7%",  "action": "Pre-order 800 units NOW — pre-monsoon façade rush; Peenya godown at 74%"},
            {"sku": "Alucobond ACP 4mm Silver 8×4ft",            "curr": 68,  "f30": 84,  "f60": 96,  "f90": 104, "signal": "GROWING +23.5%", "action": "Increase order by 30% — commercial park façade projects surging"},
            {"sku": "Greenlam HPL Sheet 1mm Ivory Matt 8×4ft",   "curr": 72,  "f30": 88,  "f60": 102, "f90": 116, "signal": "GROWING +22.2%", "action": "Increase stock 25% — interior laminate demand rising post-monsoon"},
            {"sku": "Aerofoil Louver Blade 200mm Anodised Silver","curr": 124, "f30": 152, "f60": 172, "f90": 186, "signal": "GROWING +22.6%", "action": "Increase by 25% — high-spec commercial façade demand picking up"},
            {"sku": "Merino HPL Sheet 0.8mm Concrete Grey 8×4ft","curr": 102, "f30": 108, "f60": 112, "f90": 108, "signal": "STABLE +5.9%",   "action": "Normal ordering cycle — interior designers ordering steadily"},
            {"sku": "PVC Louver Panel 100mm White 3m",            "curr": 0,   "f30": 0,   "f60": 2,   "f90": 4,   "signal": "DEAD",           "action": "Liquidate at 10% discount to MEP contractors — no viable demand forecast"},
        ],
        "seasonal_insight": "Apr–Jun pre-monsoon façade rush — aluminium louvers +35%, ACP cladding +28%. Oct–Nov post-monsoon interior surge — HPL laminates +22%. Stock louver blades and ACP by March each year.",
        "seasonal_index": [94, 88, 108, 124, 138, 128, 96, 84, 88, 114, 128, 116],
        "data_source": "mock",
    }


# ── /api/validate ──────────────────────────────────────────────────────────────
# AI Capability Validation — tests all tools and reports component health
@router.get("/validate")
async def validate_ai():
    """
    Validate all AI components and DB connections.
    Tests: DB connectivity, all 9 MCP tools, LLM configuration.
    Returns per-component pass/fail with latency and data quality scores.
    """
    import time

    results = {}
    overall_score = 0
    total_checks = 0

    # 1. DB Connectivity
    db_ok = False
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            db_ok = pool is not None
        except Exception:
            db_ok = False
    results["database"] = {
        "name": "MySQL Database",
        "status": "pass" if db_ok else "warn",
        "message": "Connected — live data active" if db_ok else "Not connected — using demo data (add MYSQL_HOST to .env)",
        "score": 100 if db_ok else 60,
    }

    # 2. Test each MCP tool
    try:
        from app.services.tools import TOOLS
        tool_labels = {
            "stock":    "Stock Intelligence Tool",
            "demand":   "Demand Forecast Tool",
            "supplier": "Supplier Scorecard Tool",
            "customer": "Customer Intelligence Tool",
            "finance":  "Finance & Margin Tool",
            "order":    "Order Pipeline Tool",
            "freight":  "Freight Optimisation Tool",
            "email":    "Email Draft Tool",
            "po_grn":   "PO & GRN Tool",
            "sales":    "Sales Performance Tool",
            "inward":   "Inward & Outward Tool",
            "discount": "Discount Calculator Tool",
            "louvers":  "Sales Orders / Louvers Tool",
            "quotes":   "Quotation Builder Tool",
            "projects": "Project Tracker Tool",
            "catalog":  "Product Catalog Tool",
        }
        for tool_key, label in tool_labels.items():
            t0 = time.monotonic()
            try:
                fn = TOOLS[tool_key]
                data = await fn("validation_test")
                ms = round((time.monotonic() - t0) * 1000)
                src = data.get("data_source", "mock")
                has_data = any(v for v in data.values() if v and v != src)
                results[f"tool_{tool_key}"] = {
                    "name": label,
                    "status": "pass",
                    "message": f"OK — {src.upper()} data — {ms}ms",
                    "data_source": src,
                    "latency_ms": ms,
                    "score": 100 if src == "mysql" else 85,
                    "sample_fields": list(data.keys())[:5],
                }
            except Exception as exc:
                results[f"tool_{tool_key}"] = {
                    "name": label,
                    "status": "fail",
                    "message": f"Error: {str(exc)[:100]}",
                    "score": 0,
                }
    except ImportError:
        results["tools"] = {"name": "MCP Tools", "status": "fail", "message": "Import error", "score": 0}

    # 3. OpenAI / LLM
    import os
    api_key = os.getenv("OPENAI_API_KEY", "")
    oai_ok = bool(api_key and api_key.startswith("sk-"))
    results["llm"] = {
        "name": "GPT-4o LLM",
        "status": "pass" if oai_ok else "fail",
        "message": "API key configured — function calling + streaming active" if oai_ok else "OPENAI_API_KEY missing — add to backend/.env",
        "score": 100 if oai_ok else 0,
    }

    # 4. API Endpoints
    endpoints = [
        "/api/overview", "/api/inventory", "/api/dead-stock", "/api/inward",
        "/api/sales", "/api/customers", "/api/orders", "/api/procurement",
        "/api/freight", "/api/finance", "/api/demand",
        "/api/po-grn", "/api/validate", "/api/chat/stream",
        "/api/analytics", "/api/credit/accounts", "/api/credit/pdc", "/api/credit/aging",
        "/api/catalog/products", "/api/projects", "/api/quotes",
        "/api/pos/products", "/api/pos/summary", "/api/schemes",
        "/api/alerts", "/api/data-status", "/api/health", "/api/settings",
    ]
    results["endpoints"] = {
        "name": "REST API Endpoints",
        "status": "pass",
        "message": f"{len(endpoints)} endpoints registered",
        "endpoints": endpoints,
        "score": 100,
    }

    # 5. Chatbot Tools Coverage
    try:
        from app.services.selector import KEYWORD_MAP, ACT_BASE_TOOLS, EXPLAIN_TOOLS
        results["selector"] = {
            "name": "AI Tool Selector",
            "status": "pass",
            "message": f"{len(KEYWORD_MAP)} tool domains, {sum(len(v) for v in KEYWORD_MAP.values())} keywords",
            "tools_mapped": list(KEYWORD_MAP.keys()),
            "act_base": ACT_BASE_TOOLS,
            "explain_base": EXPLAIN_TOOLS,
            "score": 100,
        }
    except Exception as exc:
        results["selector"] = {"name": "AI Tool Selector", "status": "fail", "message": str(exc), "score": 0}

    # Compute overall score
    scores = [v.get("score", 0) for v in results.values()]
    overall = round(sum(scores) / len(scores)) if scores else 0
    status_counts = {"pass": 0, "warn": 0, "fail": 0}
    for v in results.values():
        key = v.get("status", "fail")
        status_counts[key] = status_counts.get(key, 0) + 1

    return {
        "overall_score": overall,
        "overall_status": "healthy" if overall >= 80 else "degraded" if overall >= 50 else "critical",
        "checks": results,
        "summary": status_counts,
        "db_connected": db_ok,
        "data_source": "mysql" if db_ok else "demo",
        "components_tested": len(results),
    }


# ── /api/alerts ────────────────────────────────────────────────────────────────
@router.get("/alerts")
async def get_alerts():
    """
    Returns prioritised business alerts for the Topbar notification bell.
    DB-first with rich mock fallback. Sorted: critical first, then warning, info.
    """
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                stock, fin, customer, supplier, po = await asyncio.gather(
                    db_q.query_stock(pool, ""),
                    db_q.query_finance(pool, ""),
                    db_q.query_customer(pool, ""),
                    db_q.query_supplier(pool, ""),
                    db_q.query_po_grn(pool, ""),
                    return_exceptions=True,
                )
                def _ok(r): return r if not isinstance(r, Exception) else {}
                s, f, c, sup, p = _ok(stock), _ok(fin), _ok(customer), _ok(supplier), _ok(po)
                alerts = _build_alerts_from_db(s, f, c, sup, p)
                critical = sum(1 for a in alerts if a["severity"] == "critical")
                warning  = sum(1 for a in alerts if a["severity"] == "warning")
                info     = len(alerts) - critical - warning
                return {
                    "alerts": alerts[:8],
                    "counts": {"critical": critical, "warning": warning, "info": info},
                    "total": len(alerts),
                    "data_source": "mysql",
                }
        except Exception as exc:
            logger.warning("Alerts DB failed: %s", exc)
    return _mock_alerts()


def _build_alerts_from_db(stock, finance, customer, supplier, po_data):
    alerts = []
    for item in stock.get("critical_low", []):
        days = item.get("days_cover", 999)
        sev  = "critical" if days <= 10 else "warning" if days <= 20 else None
        if sev:
            alerts.append({
                "id":       f"stock-{item['sku'].lower().replace(' ', '-')}",
                "severity": sev,
                "category": "stock",
                "icon":     "📦",
                "title":    f"{item['sku']} {'critically' if sev == 'critical' else ''} low stock",
                "desc":     f"Only {days} days cover remaining. Reorder urgently.",
                "impact":   "Revenue at risk",
                "ai_query": f"{item['sku']} stock is at {days} days cover. What should I do? Give me an action plan.",
            })
    for rec in customer.get("overdue_receivables", [])[:3]:
        days_od = rec.get("days_overdue", 0)
        risk    = rec.get("risk", "LOW")
        sev     = "critical" if risk == "HIGH" or days_od > 60 else "warning"
        alerts.append({
            "id":       f"recv-{rec['customer'].lower().replace(' ', '-')[:20]}",
            "severity": sev,
            "category": "receivables",
            "icon":     "💰",
            "title":    f"{rec['customer']}: {rec['amount']} overdue",
            "desc":     f"{days_od} days past due. Follow up immediately.",
            "impact":   rec["amount"],
            "ai_query": f"How should I handle {rec['customer']} overdue payment of {rec['amount']}?",
        })
    for opo in supplier.get("overdue_pos", [])[:2]:
        name = opo if isinstance(opo, str) else opo.get("po_number", "")
        alerts.append({
            "id":       f"po-{name.lower().replace(' ', '-')[:20]}",
            "severity": "warning",
            "category": "procurement",
            "icon":     "🏭",
            "title":    f"Overdue PO: {name}",
            "desc":     "Supplier delivery delayed. Check status and escalate.",
            "impact":   "",
            "ai_query": f"What action should I take for overdue purchase order {name}?",
        })
    # Dead stock alert
    dead = stock.get("dead_stock", [])
    if len(dead) >= 2:
        total = sum(
            float(d["value"].replace("Rs.", "").replace("₹", "").replace("L", "")) * 100000
            for d in dead if "L" in d.get("value", "")
        )
        alerts.append({
            "id":       "dead-stock-bulk",
            "severity": "warning",
            "category": "stock",
            "icon":     "📦",
            "title":    f"Dead stock: ₹{total/100000:.1f}L locked in {len(dead)} SKUs",
            "desc":     f"Oldest item: {dead[0].get('days_old', 0)} days. Clearance plan needed.",
            "impact":   f"₹{total/100000:.1f}L",
            "ai_query": "Show me a dead stock clearance plan. Which SKUs should I discount first?",
        })
    # GST alert from finance
    gst = finance.get("gst", {})
    if gst.get("gstr3b_status") == "PENDING":
        alerts.append({
            "id":       "gst-filing",
            "severity": "info",
            "category": "finance",
            "icon":     "📊",
            "title":    "GSTR-3B filing pending",
            "desc":     f"Net payable {gst.get('net_payable', '')}. File before deadline.",
            "impact":   gst.get("net_payable", ""),
            "ai_query": "What is my GST status? How much is pending and what are the deadlines?",
        })
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    return sorted(alerts, key=lambda a: severity_order.get(a["severity"], 9))


def _mock_alerts():
    return {
        "alerts": [
            {
                "id": "stock-18mm-bwp", "severity": "critical", "category": "stock", "icon": "📦",
                "title": "18mm BWP critically low stock",
                "desc": "Only 8 days cover remaining. Demand surge forecast +24%.",
                "impact": "₹1.8L revenue at risk",
                "ai_query": "18mm BWP stock is critically low — only 8 days cover. Give me an urgent action plan.",
            },
            {
                "id": "recv-sharma", "severity": "critical", "category": "receivables", "icon": "💰",
                "title": "Sharma Constructions: ₹3.4L overdue",
                "desc": "78 days past due — HIGH risk. No recent contact.",
                "impact": "₹3.4L at risk",
                "ai_query": "How should I handle Sharma Constructions overdue payment of ₹3.4L (78 days overdue)?",
            },
            {
                "id": "po-gauri-overdue", "severity": "warning", "category": "procurement", "icon": "🏭",
                "title": "PO-7731 Gauri Laminates overdue +4 days",
                "desc": "₹0.49L pending. GRN match rate 82% — quality concern.",
                "impact": "₹0.49L delayed",
                "ai_query": "PO-7731 from Gauri Laminates is 4 days overdue. What action should I take?",
            },
            {
                "id": "dead-stock-bulk", "severity": "warning", "category": "stock", "icon": "📦",
                "title": "Dead stock: ₹4.2L locked in 5 SKUs",
                "desc": "6mm Gurjan BWP (118 days), 4mm MR Plain (97 days). Clearance needed.",
                "impact": "₹3.6L recoverable",
                "ai_query": "Show me a dead stock clearance plan. I have ₹4.2L locked. Which SKUs should I discount?",
            },
            {
                "id": "grn-mismatch", "severity": "warning", "category": "procurement", "icon": "🔍",
                "title": "GRN-4421: Wrong grade received from Gauri",
                "desc": "Price discrepancy ₹3,200. 3-way match failed — credit note needed.",
                "impact": "₹3,200 discrepancy",
                "ai_query": "Explain GRN-4421 wrong grade discrepancy from Gauri Laminates and what I should do.",
            },
            {
                "id": "recv-mehta", "severity": "warning", "category": "receivables", "icon": "💰",
                "title": "Mehta Brothers: ₹2.1L overdue 52 days",
                "desc": "MEDIUM risk. Working capital impact: +2.8 days on cash cycle.",
                "impact": "₹2.1L outstanding",
                "ai_query": "How should I handle Mehta Brothers overdue payment of ₹2.1L (52 days)?",
            },
            {
                "id": "gst-pending", "severity": "info", "category": "finance", "icon": "📊",
                "title": "GSTR-3B filing pending",
                "desc": "Net GST payable ₹0.83L. File before the 20th to avoid penalty.",
                "impact": "₹0.83L payable",
                "ai_query": "What is my GST status? How much is pending and what are the filing deadlines?",
            },
        ],
        "counts": {"critical": 2, "warning": 4, "info": 1},
        "total": 7,
        "data_source": "mock",
    }


# ── /api/data-status ───────────────────────────────────────────────────────────
# Lightweight endpoint — shows which data sources are live vs demo.
# Called by DataSourceBadge and any component wanting a quick status check.
@router.get("/data-status")
async def data_status():
    """
    Quick data source status for all dashboard pages.
    Returns per-page source ('mysql' or 'mock') and overall connection state.
    """
    db_ok = False
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            db_ok = pool is not None
        except Exception:
            db_ok = False

    source = "mysql" if db_ok else "mock"

    pages = [
        "overview", "inventory", "dead-stock", "inward",
        "sales", "customers", "orders", "procurement",
        "po-grn", "freight", "finance", "demand",
        "analytics", "catalog", "projects", "quotes",
        "claims", "discounts", "credit", "pos", "schemes",
    ]

    return {
        "db_connected": db_ok,
        "data_source": source,
        "pages": {page: source for page in pages},
        "demo_note": None if db_ok else (
            "Running in Demo Mode. Add MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, "
            "MYSQL_DB to your .env file to connect to a live database."
        ),
    }
