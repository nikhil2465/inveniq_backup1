"""
Dashboard REST endpoints for all InvenIQ pages.
Each endpoint follows DB-first / mock-fallback pattern.
One router file to serve all 11 pages and the AI validation endpoint.
"""
import asyncio
import logging
from datetime import date, timedelta

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Dashboard"])

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
async def get_overview():
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
        "Revenue up 9.2% this month — 18mm BWP and 12mm MR are your top movers. "
        "Dead stock worth ₹4.2L sitting unsold for 90+ days — 3 SKUs identified for urgent action."
    )


_MOCK_MONTHLY_REVENUE = [
    {"month": "Apr", "revenue": 19.2, "orders": 312},
    {"month": "May", "revenue": 20.1, "orders": 328},
    {"month": "Jun", "revenue": 21.4, "orders": 344},
    {"month": "Jul", "revenue": 22.8, "orders": 369},
    {"month": "Aug", "revenue": 21.6, "orders": 350},
    {"month": "Sep", "revenue": 20.4, "orders": 336},
    {"month": "Oct", "revenue": 22.1, "orders": 357},
    {"month": "Nov", "revenue": 23.8, "orders": 384},
    {"month": "Dec", "revenue": 24.4, "orders": 394},
    {"month": "Jan", "revenue": 25.2, "orders": 406},
    {"month": "Feb", "revenue": 26.0, "orders": 419},
    {"month": "Mar", "revenue": 27.2, "orders": 438},
    {"month": "Apr", "revenue": 28.4, "orders": 486},
]


def _mock_overview():
    return {
        "revenue_mtd": "₹28.4L", "gross_margin": "22.4%",
        "dead_stock_value": "₹4.2L", "outstanding_receivables": "₹12.8L",
        "orders_today": 24, "orders_dispatched": 18, "orders_pending": 6,
        "low_stock_skus": 7, "working_capital_days": 48,
        "inventory_accuracy": "96.8%", "stock_turnover": "4.2x", "gmroi": "₹1.98",
        "at_risk_customers": 8, "total_stock_value": "₹38.6L",
        "critical_low": [
            {"sku": "18mm BWP (8x4)", "days_cover": 8, "stock": 140},
            {"sku": "12mm BWP (8x4)", "days_cover": 11, "stock": 220},
        ],
        "top_at_risk": [
            {"name": "City Interiors", "days_silent": 47, "monthly_value": "Rs.2.4L"},
            {"name": "Sharma Constructions", "days_silent": 34, "monthly_value": "Rs.1.8L"},
        ],
        "monthly_revenue": _MOCK_MONTHLY_REVENUE,
        "ai_brief": (
            "Revenue up 9.2% this month — 18mm BWP and 12mm MR are your top movers. "
            "Dead stock worth ₹4.2L sitting unsold for 90+ days — 3 SKUs identified for urgent action. "
            "Customer 'City Interiors' hasn't ordered in 47 days — at-risk account worth ₹1.8L/month. "
            "Supplier 'Gauri Laminates' has delayed 2 deliveries this month."
        ),
        "data_source": "mock",
    }


# ── /api/inventory ─────────────────────────────────────────────────────────────
@router.get("/inventory")
async def get_inventory():
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
        "total_stock_value": "₹38.6L",
        "critical_count": 7,
        "dead_stock_value": 4.2,
        "inventory_accuracy": "96.8%",
        "stock_turnover": "4.2x",
        "skus": [
            {"name": "18mm BWP (8×4)", "brand": "Century", "stock": 140, "buy": 1420, "sell": 1920, "days_cover": 8, "sales_30": 480, "status": "critical"},
            {"name": "12mm BWP (8×4)", "brand": "Century", "stock": 220, "buy": 1080, "sell": 1480, "days_cover": 11, "sales_30": 380, "status": "critical"},
            {"name": "12mm MR Plain",  "brand": "Greenply", "stock": 380, "buy": 720,  "sell": 940,  "days_cover": 18, "sales_30": 420, "status": "ok"},
            {"name": "18mm MR Plain",  "brand": "Greenply", "stock": 290, "buy": 880,  "sell": 1120, "days_cover": 22, "sales_30": 258, "status": "ok"},
            {"name": "8mm Flexi BWP",  "brand": "Gauri",   "stock": 110, "buy": 640,  "sell": 840,  "days_cover": 28, "sales_30": 72,  "status": "over"},
            {"name": "6mm Gurjan BWP", "brand": "National","stock": 186, "buy": 960,  "sell": 0,    "days_cover": 118,"sales_30": 0,   "status": "dead"},
            {"name": "4mm MR Plain",   "brand": "National","stock": 240, "buy": 580,  "sell": 0,    "days_cover": 97, "sales_30": 4,   "status": "dead"},
            {"name": "19mm Commercial","brand": "National","stock": 102, "buy": 980,  "sell": 0,    "days_cover": 91, "sales_30": 2,   "status": "dead"},
            {"name": "10mm Flexi BWP", "brand": "Gauri",   "stock": 88,  "buy": 1240, "sell": 1580, "days_cover": 74, "sales_30": 14,  "status": "over"},
            {"name": "Laminate Teak",  "brand": "Supreme", "stock": 165, "buy": 340,  "sell": 460,  "days_cover": 32, "sales_30": 128, "status": "ok"},
        ],
        "data_source": "mock",
    }


# ── /api/dead-stock ────────────────────────────────────────────────────────────
@router.get("/dead-stock")
async def get_dead_stock():
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
        "total_value": "₹4.2L",
        "skus_count": 5,
        "oldest_days": 118,
        "cash_recovery_potential": "₹3.6L",
        "items": [
            {"sku": "6mm Gurjan BWP",  "days_old": 118, "stock": 186, "value": "₹1.79L", "action": "12% discount to contractors"},
            {"sku": "4mm MR Plain",    "days_old": 97,  "stock": 240, "value": "₹1.39L", "action": "Bundle with 18mm BWP orders"},
            {"sku": "19mm Commercial", "days_old": 91,  "stock": 102, "value": "₹0.99L", "action": "Return to supplier if policy allows"},
            {"sku": "10mm Flexi BWP",  "days_old": 74,  "stock": 88,  "value": "₹1.09L", "action": "Offer to liquidators at 20% discount"},
            {"sku": "16mm MR Teak",    "days_old": 62,  "stock": 44,  "value": "₹0.42L", "action": "Bundle with Teak laminate promotions"},
        ],
        "data_source": "mock",
    }


# ── /api/inward ────────────────────────────────────────────────────────────────
@router.get("/inward")
async def get_inward():
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
            {"grn": "GRN-4424", "supplier": "Century Plyboards",  "value": "₹3.8L", "status": "MATCH",    "date": str(date.today())},
            {"grn": "GRN-4423", "supplier": "Greenply Industries", "value": "₹1.6L", "status": "MATCH",    "date": str(date.today())},
            {"grn": "GRN-4422", "supplier": "Gauri Laminates",    "value": "₹1.4L", "status": "MISMATCH", "date": str(date.today())},
        ],
        "data_source": "mock",
    }


# ── /api/sales ─────────────────────────────────────────────────────────────────
@router.get("/sales")
async def get_sales():
    result = await _try_db("query_sales")
    if result:
        return result
    return {
        "revenue_mtd": "₹28.4L",
        "revenue_growth": "+9.2% MoM",
        "orders_mtd": 486,
        "avg_order_value": "₹58,400",
        "gross_margin": "22.4%",
        "top_sku": "18mm BWP",
        "monthly_revenue": [
            {"month": "May",  "revenue": 19.2}, {"month": "Jun",  "revenue": 20.1},
            {"month": "Jul",  "revenue": 21.4}, {"month": "Aug",  "revenue": 22.8},
            {"month": "Sep",  "revenue": 21.6}, {"month": "Oct",  "revenue": 20.4},
            {"month": "Nov",  "revenue": 22.1}, {"month": "Dec",  "revenue": 23.8},
            {"month": "Jan",  "revenue": 24.4}, {"month": "Feb",  "revenue": 25.2},
            {"month": "Mar",  "revenue": 26.0}, {"month": "Apr",  "revenue": 28.4},
        ],
        "margin_by_sku": [
            {"sku": "18mm BWP",  "margin": 22.2}, {"sku": "12mm BWP",  "margin": 25.6},
            {"sku": "12mm MR",   "margin": 15.4}, {"sku": "8mm Flexi", "margin": 6.7},
            {"sku": "Laminates", "margin": 28.4}, {"sku": "Others",    "margin": 18.2},
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
async def get_customers():
    result = await _try_db("query_customer_list")
    if result:
        return result
    basic = await _try_db("query_customer")
    if basic:
        return {
            "total_customers": basic.get("total_customers", 148),
            "at_risk_count": len(basic.get("at_risk", [])),
            "total_outstanding": basic.get("total_outstanding", "₹12.8L"),
            "overdue_receivables": basic.get("overdue_receivables", []),
            "at_risk": basic.get("at_risk", []),
            "customers": [],
            "data_source": "mysql",
        }
    return _mock_customers()


def _mock_customers():
    return {
        "total_customers": 148,
        "at_risk_count": 8,
        "total_outstanding": "₹12.8L",
        "best_segment": "Interior Firms",
        "customers": [
            {"name": "Mehta Constructions",    "segment": "Contractor",    "monthly_value": "₹3.8L", "outstanding": "₹0",    "days_since_order": 2,  "risk": "LOW",    "score": 94},
            {"name": "Design Studio Patel",    "segment": "Interior Firm", "monthly_value": "₹1.6L", "outstanding": "₹0",    "days_since_order": 4,  "risk": "LOW",    "score": 91},
            {"name": "Kumar & Sons",           "segment": "Retailer",      "monthly_value": "₹2.1L", "outstanding": "₹0.4L", "days_since_order": 6,  "risk": "LOW",    "score": 88},
            {"name": "Sharma Constructions",   "segment": "Contractor",    "monthly_value": "₹2.2L", "outstanding": "₹3.4L", "days_since_order": 78, "risk": "HIGH",   "score": 42},
            {"name": "Mehta Brothers",         "segment": "Contractor",    "monthly_value": "₹1.4L", "outstanding": "₹2.1L", "days_since_order": 52, "risk": "MEDIUM", "score": 58},
            {"name": "City Interiors",         "segment": "Interior Firm", "monthly_value": "₹2.4L", "outstanding": "₹0",    "days_since_order": 47, "risk": "MEDIUM", "score": 55},
            {"name": "Patel Contractors",      "segment": "Contractor",    "monthly_value": "₹1.2L", "outstanding": "₹1.8L", "days_since_order": 44, "risk": "MEDIUM", "score": 62},
            {"name": "Raj Carpentry Works",    "segment": "Carpenter",     "monthly_value": "₹0.9L", "outstanding": "₹0.2L", "days_since_order": 8,  "risk": "LOW",    "score": 85},
        ],
        "overdue_receivables": [
            {"customer": "Sharma Constructions", "amount": "₹3.4L", "days_overdue": 78, "risk": "HIGH"},
            {"customer": "Mehta Brothers",       "amount": "₹2.1L", "days_overdue": 52, "risk": "MEDIUM"},
            {"customer": "Patel Contractors",    "amount": "₹1.8L", "days_overdue": 44, "risk": "MEDIUM"},
            {"customer": "Rajan Interior",       "amount": "₹1.2L", "days_overdue": 31, "risk": "LOW"},
        ],
        "data_source": "mock",
    }


# ── /api/orders ────────────────────────────────────────────────────────────────
@router.get("/orders")
async def get_orders():
    result = await _try_db("query_order")
    if result:
        return result
    return {
        "today_orders": 24, "dispatched": 18, "pending": 6,
        "avg_fulfillment_hrs": 3.2, "orders_mtd": 486,
        "dispatch_sla": "87%",
        "pending_details": [
            {"order": "ORD-2847", "customer": "Mehta Constructions", "value": "₹3.8L", "delayed": "30 hours", "reason": "18mm BWP stock shortage"},
            {"order": "ORD-2852", "customer": "Patel Contractors",   "value": "₹1.2L", "delayed": "4 hours",  "reason": "QC pending on MR grade"},
            {"order": "ORD-2855", "customer": "Kumar & Sons",        "value": "₹0.8L", "delayed": "No delay", "reason": "On track"},
            {"order": "ORD-2856", "customer": "Raj Carpentry",       "value": "₹0.4L", "delayed": "No delay", "reason": "On track"},
        ],
        "order_trend_30d": [4,6,3,8,5,7,4,9,6,8,4,7,5,6,8,4,9,7,5,8,6,7,4,8,5,9,6,7,8,24],
        "data_source": "mock",
    }


# ── /api/procurement ───────────────────────────────────────────────────────────
@router.get("/procurement")
async def get_procurement():
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
                return {
                    "suppliers": s.get("suppliers", []),
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


def _mock_procurement():
    return {
        "suppliers": [
            {"name": "Century Plyboards",  "on_time_pct": 96,  "avg_delay_days": 0.4, "grn_match_rate": "100%", "recommendation": "PREFERRED",  "open_pos": 2, "overdue_pos": 0},
            {"name": "Greenply Industries","on_time_pct": 88,  "avg_delay_days": 1.2, "grn_match_rate": "94%",  "recommendation": "GOOD",        "open_pos": 1, "overdue_pos": 1},
            {"name": "Gauri Laminates",    "on_time_pct": 68,  "avg_delay_days": 3.2, "grn_match_rate": "82%",  "recommendation": "REVIEW",      "open_pos": 1, "overdue_pos": 1},
        ],
        "overdue_pos": ["PO-7734 (Greenply, +2d)", "PO-7731 (Gauri, +4d)"],
        "open_pos": 8,
        "open_po_value": "₹12.4L",
        "grn_match_rate": "96%",
        "grn_mismatches": 3,
        "alerts": [
            {"type": "danger",  "text": "PO-7731 Gauri Laminates overdue +4 days — ₹0.49L pending"},
            {"type": "danger",  "text": "PO-7734 Greenply Industries overdue +2 days — ₹2.16L pending"},
            {"type": "warning", "text": "GRN-4421: Wrong grade received from Gauri — ₹3,200 discrepancy"},
            {"type": "info",    "text": "Century Plyboards 96% on-time — preferred supplier this quarter"},
        ],
        "data_source": "mock",
    }


# ── /api/freight ───────────────────────────────────────────────────────────────
@router.get("/freight")
async def get_freight():
    result = await _try_db("query_freight")
    if result:
        return result
    return {
        "outbound_cost_per_sheet": "₹18.4",
        "vehicle_utilisation": "68%",
        "lanes_count": 6,
        "savings_potential": "₹2,400",
        "outbound_lanes": [
            {"lane": "Whitefield",      "zone": "East",  "cost_per_sheet": 14, "fill_pct": 78, "status": "BEST"},
            {"lane": "Koramangala",     "zone": "South", "cost_per_sheet": 16, "fill_pct": 72, "status": "OK"},
            {"lane": "HSR Layout",      "zone": "South", "cost_per_sheet": 17, "fill_pct": 65, "status": "OK"},
            {"lane": "BTM Layout",      "zone": "South", "cost_per_sheet": 19, "fill_pct": 58, "status": "HIGH"},
            {"lane": "Electronic City", "zone": "South", "cost_per_sheet": 24, "fill_pct": 54, "status": "WORST"},
            {"lane": "Hebbal",          "zone": "North", "cost_per_sheet": 21, "fill_pct": 61, "status": "HIGH"},
        ],
        "inbound_costs": {
            "Century Plyboards":   "₹8.4/sheet",
            "Gauri Laminates":     "₹22/sheet",
            "Greenply Industries": "₹12.6/sheet",
        },
        "freight_trend_30d": [18, 19, 17, 20, 18, 21, 19, 18, 17, 20, 19, 18, 20, 21, 18, 17, 19, 18, 20, 18, 17, 19, 18, 19, 20, 18, 17, 18, 19, 18],
        "data_source": "mock",
    }


# ── /api/finance ───────────────────────────────────────────────────────────────
@router.get("/finance")
async def get_finance():
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
                    "overdue_receivables": c.get("overdue_receivables", [])[:5],
                    "data_source": "mysql",
                }
        except Exception as exc:
            logger.warning("Finance DB failed: %s", exc)
    return _mock_finance()


def _mock_finance():
    return {
        "revenue_mtd": "₹28.4L",
        "gross_profit_mtd": "₹6.36L",
        "gross_margin": "22.4%",
        "working_capital_days": 48,
        "outstanding_receivables": "₹12.8L",
        "dead_stock_locked": "₹7.8L",
        "returns_mtd": "₹0.82L",
        "net_cash": "₹4.1L",
        "gst": {
            "output_collected": "₹5.11L",
            "itc_available": "₹4.28L",
            "net_payable": "₹0.83L",
            "gstr3b_status": "PENDING",
        },
        "cash_cycle": "DIO 22 + DSO 34 − DPO 8 = 48 days",
        "margin_by_sku": [
            {"sku": "18mm BWP",  "margin": 22.2}, {"sku": "12mm BWP",  "margin": 25.6},
            {"sku": "12mm MR",   "margin": 15.4}, {"sku": "8mm Flexi", "margin": 6.7},
            {"sku": "Laminates", "margin": 28.4}, {"sku": "Commercial","margin": 8.2},
            {"sku": "18mm MR",   "margin": 18.6}, {"sku": "Others",    "margin": 16.4},
        ],
        "cash_flow_6m": [
            {"month": "Nov", "collections": 24.1, "purchases": 18.4},
            {"month": "Dec", "collections": 26.8, "purchases": 19.2},
            {"month": "Jan", "collections": 22.4, "purchases": 20.1},
            {"month": "Feb", "collections": 25.2, "purchases": 18.8},
            {"month": "Mar", "collections": 26.0, "purchases": 19.6},
            {"month": "Apr", "collections": 28.4, "purchases": 21.2},
        ],
        "overdue_receivables": [
            {"customer": "Sharma Constructions", "amount": "₹3.4L", "days_overdue": 78, "risk": "HIGH"},
            {"customer": "Mehta Brothers",       "amount": "₹2.1L", "days_overdue": 52, "risk": "MEDIUM"},
            {"customer": "Patel Contractors",    "amount": "₹1.8L", "days_overdue": 44, "risk": "MEDIUM"},
            {"customer": "Rajan Interior",       "amount": "₹1.2L", "days_overdue": 31, "risk": "LOW"},
            {"customer": "Others (12 accounts)", "amount": "₹4.3L", "days_overdue": 25, "risk": "LOW"},
        ],
        "data_source": "mock",
    }


# ── /api/demand ────────────────────────────────────────────────────────────────
@router.get("/demand")
async def get_demand():
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
            {"sku": "18mm BWP",  "curr": 480, "f30": 596, "f60": 680, "f90": 712, "signal": "SURGE +24%",    "action": "Pre-order 300 extra sheets NOW"},
            {"sku": "12mm MR",   "curr": 420, "f30": 448, "f60": 436, "f90": 380, "signal": "STABLE +6.7%",  "action": "Normal ordering cycle"},
            {"sku": "12mm BWP",  "curr": 380, "f30": 432, "f60": 498, "f90": 524, "signal": "GROWING +13.7%","action": "Increase stock by 25%"},
            {"sku": "Laminates", "curr": 320, "f30": 298, "f60": 274, "f90": 250, "signal": "DECLINING -6.9%","action": "Reduce next order quantity"},
            {"sku": "8mm Flexi", "curr": 72,  "f30": 68,  "f60": 60,  "f90": 55,  "signal": "SLOW",          "action": "Hold — do not reorder yet"},
            {"sku": "18mm MR",   "curr": 258, "f30": 272, "f60": 284, "f90": 290, "signal": "GROWING +5.4%", "action": "Light increase in next order"},
            {"sku": "Gurjan BWP","curr": 0,   "f30": 0,   "f60": 4,   "f90": 8,   "signal": "DEAD",          "action": "Liquidate — no demand forecast"},
        ],
        "seasonal_insight": "Oct-Dec historically strongest quarter (+28%). Stock up BWP grades by September.",
        "seasonal_index": [82, 78, 92, 88, 94, 76, 64, 68, 108, 120, 132, 138],
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
