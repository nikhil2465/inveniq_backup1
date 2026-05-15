"""
Advanced Analytics & Business Intelligence API — InvenIQ
Revenue trends, margin analysis, customer LTV, product performance, inventory efficiency.
DB-first / mock-fallback pattern.
"""
import asyncio
import datetime
import logging
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Analytics"])

try:
    from app.db.connection import get_pool
    from app.db import queries as db_q
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


def _months_back(n: int):
    today = datetime.date.today()
    months = []
    for i in range(n - 1, -1, -1):
        d = today.replace(day=1) - datetime.timedelta(days=i * 28)
        months.append(d.strftime("%b '%y"))
    return months


@router.get("/analytics")
async def get_analytics(period: str = Query("MTD")):
    # Try DB for live revenue + margin data to enrich the analytics response
    live_sales = None
    live_finance = None
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                live_sales, live_finance = await asyncio.gather(
                    db_q.query_sales(pool, ""),
                    db_q.query_finance(pool, ""),
                    return_exceptions=True,
                )
                if isinstance(live_sales, Exception):
                    live_sales = None
                if isinstance(live_finance, Exception):
                    live_finance = None
        except Exception as exc:
            logger.warning("Analytics DB query failed: %s", exc)

    labels = _months_back(12)

    # ── Revenue & Margin Trends (12 months) ────────────────────────────────────
    revenue_data = [18.6, 19.4, 20.2, 21.8, 20.8, 22.4, 23.6, 25.4, 24.8, 25.8, 26.4, 28.4]
    margin_pct   = [23.2, 23.6, 24.0, 24.2, 23.8, 24.1, 24.4, 24.6, 24.8, 24.9, 25.0, 24.8]
    orders_count = [196, 204, 212, 228, 218, 234, 248, 264, 258, 272, 284, 296]

    # ── Revenue by Category (MTD) ──────────────────────────────────────────────
    category_revenue = [
        {"category": "Hardware Fittings",       "revenue_L": 11.9, "orders": 226, "margin_pct": 28.4, "yoy_growth": 22.4},
        {"category": "Sanitary CP Fittings",    "revenue_L": 9.7,  "orders": 148, "margin_pct": 32.6, "yoy_growth": 18.8},
        {"category": "Kitchen Systems",         "revenue_L": 4.0,  "orders": 68,  "margin_pct": 29.2, "yoy_growth": 28.6},
        {"category": "Door Hardware & Locks",   "revenue_L": 2.8,  "orders": 94,  "margin_pct": 24.1, "yoy_growth": 14.2},
    ]

    # ── Top Products by Margin Contribution ────────────────────────────────────
    top_products = [
        {"rank": 1, "name": "Jaquar Lyric Basin Mixer Chrome",       "category": "Sanitary CP Fittings",
         "revenue_L": 2.04, "margin_L": 0.70, "margin_pct": 34.2, "units_sold": 42, "unit": "unit",
         "trend": "up", "trend_pct": 28.6},
        {"rank": 2, "name": "Hettich InnoTech Drawer System 400mm",  "category": "Kitchen Systems",
         "revenue_L": 1.66, "margin_L": 0.52, "margin_pct": 31.1, "units_sold": 130, "unit": "set",
         "trend": "up", "trend_pct": 24.4},
        {"rank": 3, "name": "Ebco Soft-Close Hinge 35mm Pk-10",      "category": "Hardware Fittings",
         "revenue_L": 1.94, "margin_L": 0.55, "margin_pct": 28.4, "units_sold": 400, "unit": "pack",
         "trend": "up", "trend_pct": 22.8},
        {"rank": 4, "name": "Hafele Zinc D-Handle 128mm (pair)",      "category": "Hardware Fittings",
         "revenue_L": 1.18, "margin_L": 0.35, "margin_pct": 29.6, "units_sold": 370, "unit": "pair",
         "trend": "up", "trend_pct": 16.4},
        {"rank": 5, "name": "Hindware Aura Stop Cock DN15",           "category": "Sanitary CP Fittings",
         "revenue_L": 1.44, "margin_L": 0.40, "margin_pct": 27.8, "units_sold": 192, "unit": "unit",
         "trend": "up", "trend_pct": 18.2},
        {"rank": 6, "name": "Blum Tandem Drawer Runner 500mm",        "category": "Hardware Fittings",
         "revenue_L": 0.98, "margin_L": 0.28, "margin_pct": 28.8, "units_sold": 60, "unit": "pair",
         "trend": "up", "trend_pct": 21.0},
        {"rank": 7, "name": "Jaquar Allied Overhead Shower 200mm",    "category": "Sanitary CP Fittings",
         "revenue_L": 1.63, "margin_L": 0.44, "margin_pct": 27.2, "units_sold": 68, "unit": "unit",
         "trend": "flat", "trend_pct": 8.4},
        {"rank": 8, "name": "Godrej Ultra Deadbolt Lock 60mm",        "category": "Door Hardware & Locks",
         "revenue_L": 0.76, "margin_L": 0.18, "margin_pct": 23.8, "units_sold": 81, "unit": "unit",
         "trend": "up", "trend_pct": 12.2},
    ]

    # ── Customer Analytics ─────────────────────────────────────────────────────
    top_customers = [
        {"rank": 1, "name": "Mehta Construction Group",    "type": "Contractor",
         "revenue_L": 4.8, "orders": 18, "avg_order_L": 0.27, "margin_pct": 24.8,
         "last_order_days": 2, "credit_days": 30, "outstanding_L": 0.4, "status": "healthy",
         "yoy_growth": 26.0},
        {"rank": 2, "name": "Modern Kitchens Pvt Ltd",     "type": "Kitchen Studio",
         "revenue_L": 4.2, "orders": 24, "avg_order_L": 0.18, "margin_pct": 28.4,
         "last_order_days": 45, "credit_days": 30, "outstanding_L": 0.0, "status": "at_risk",
         "yoy_growth": 18.0},
        {"rank": 3, "name": "Kumar Bath & Tile Studio",    "type": "Bath Studio",
         "revenue_L": 3.6, "orders": 32, "avg_order_L": 0.11, "margin_pct": 30.8,
         "last_order_days": 6, "credit_days": 30, "outstanding_L": 0.4, "status": "healthy",
         "yoy_growth": 32.0},
        {"rank": 4, "name": "Green Valley Interiors",      "type": "Interior Firm",
         "revenue_L": 2.8, "orders": 21, "avg_order_L": 0.13, "margin_pct": 26.2,
         "last_order_days": 38, "credit_days": 30, "outstanding_L": 0.0, "status": "watch",
         "yoy_growth": 12.0},
        {"rank": 5, "name": "Sharma Constructions",        "type": "Contractor",
         "revenue_L": 2.2, "orders": 14, "avg_order_L": 0.16, "margin_pct": 22.4,
         "last_order_days": 78, "credit_days": 60, "outstanding_L": 3.4, "status": "at_risk",
         "yoy_growth": -8.0},
        {"rank": 6, "name": "Metro Builders & Developers", "type": "Contractor",
         "revenue_L": 1.8, "orders": 12, "avg_order_L": 0.15, "margin_pct": 21.8,
         "last_order_days": 52, "credit_days": 60, "outstanding_L": 2.1, "status": "at_risk",
         "yoy_growth": -4.0},
        {"rank": 7, "name": "Raju Plumbing & Sanitary",   "type": "Plumber/Installer",
         "revenue_L": 1.1, "orders": 28, "avg_order_L": 0.04, "margin_pct": 27.6,
         "last_order_days": 4, "credit_days": 15, "outstanding_L": 0.2, "status": "healthy",
         "yoy_growth": 44.0},
        {"rank": 8, "name": "Sunrise Hardware Traders",   "type": "Retailer",
         "revenue_L": 0.9, "orders": 22, "avg_order_L": 0.04, "margin_pct": 24.4,
         "last_order_days": 8, "credit_days": 15, "outstanding_L": 0.0, "status": "healthy",
         "yoy_growth": 18.0},
    ]

    customer_type_breakdown = [
        {"type": "Contractor",       "count": 18, "revenue_L": 10.4, "share_pct": 36.6, "avg_margin_pct": 23.6},
        {"type": "Kitchen Studio",   "count": 8,  "revenue_L": 8.2,  "share_pct": 28.9, "avg_margin_pct": 28.4},
        {"type": "Bath Studio",      "count": 6,  "revenue_L": 4.8,  "share_pct": 16.9, "avg_margin_pct": 30.8},
        {"type": "Interior Firm",    "count": 12, "revenue_L": 3.2,  "share_pct": 11.3, "avg_margin_pct": 26.2},
        {"type": "Plumber/Installer","count": 22, "revenue_L": 1.4,  "share_pct": 4.9,  "avg_margin_pct": 27.4},
        {"type": "Retailer",         "count": 8,  "revenue_L": 0.8,  "share_pct": 2.8,  "avg_margin_pct": 24.4},
    ]

    # ── Supplier Performance ───────────────────────────────────────────────────
    supplier_performance = [
        {"name": "Ebco India",    "category": "Hardware Fittings",    "orders": 48, "value_L": 8.6,
         "ontime_pct": 94, "price_vs_market": -2.0, "quality_score": 96, "status": "preferred"},
        {"name": "Hafele India",  "category": "Hardware & Handles",   "orders": 32, "value_L": 6.4,
         "ontime_pct": 92, "price_vs_market": +3.0, "quality_score": 94, "status": "preferred"},
        {"name": "Hettich India", "category": "Drawer & Slide Sys",   "orders": 28, "value_L": 5.8,
         "ontime_pct": 90, "price_vs_market": +2.0, "quality_score": 93, "status": "preferred"},
        {"name": "Jaquar India",  "category": "CP Fittings",          "orders": 38, "value_L": 7.2,
         "ontime_pct": 88, "price_vs_market": -1.0, "quality_score": 92, "status": "good"},
        {"name": "Blum India",    "category": "Premium Drawer & Hinge","orders": 14, "value_L": 3.4,
         "ontime_pct": 96, "price_vs_market": +8.0, "quality_score": 98, "status": "preferred"},
        {"name": "Hindware",      "category": "Sanitary & CP",        "orders": 24, "value_L": 4.2,
         "ontime_pct": 76, "price_vs_market": -4.0, "quality_score": 82, "status": "review"},
        {"name": "Dorset India",  "category": "Door Hardware & Locks", "orders": 18, "value_L": 2.4,
         "ontime_pct": 84, "price_vs_market": +1.0, "quality_score": 86, "status": "good"},
        {"name": "Godrej & Boyce","category": "Security & Locks",     "orders": 12, "value_L": 1.8,
         "ontime_pct": 94, "price_vs_market": +5.0, "quality_score": 92, "status": "good"},
    ]

    # ── KPI Summary ────────────────────────────────────────────────────────────
    kpis = {
        "revenue_mtd_L":          28.4,
        "revenue_ytd_L":          296.8,
        "revenue_target_ytd_L":   310.0,
        "achievement_pct":        95.7,
        "gross_margin_pct":       24.8,
        "margin_target_pct":      24.0,
        "orders_mtd":             296,
        "avg_order_value_L":      0.096,
        "new_customers_mtd":      8,
        "active_customers":       74,
        "outstanding_receivable_L": 12.8,
        "overdue_L":              7.3,
        "inventory_value_L":      42.6,
        "dead_stock_L":           3.8,
        "stock_turnover_x":       5.2,
        "quote_win_rate_pct":     42.0,
        "quotes_pipeline_L":      11.4,
        "best_margin_category":   "Sanitary CP Fittings (32.6%)",
        "fastest_growing":        "Plumber/Installer segment (+44% YoY)",
        "working_capital_days":   44,
    }

    # ── Monthly P&L Summary ────────────────────────────────────────────────────
    monthly_pl = [
        {"month": labels[i], "revenue_L": revenue_data[i],
         "cogs_L": round(revenue_data[i] * (1 - margin_pct[i] / 100), 2),
         "gross_profit_L": round(revenue_data[i] * margin_pct[i] / 100, 2),
         "margin_pct": margin_pct[i],
         "orders": orders_count[i]}
        for i in range(12)
    ]

    # Merge live data over static baseline where available
    if live_sales and isinstance(live_sales, dict):
        db_monthly = live_sales.get("monthly_revenue", [])
        if db_monthly and len(db_monthly) >= 2:
            revenue_data = [m.get("revenue", revenue_data[i]) for i, m in enumerate(db_monthly[-12:])]
        if live_sales.get("revenue_mtd"):
            kpis["revenue_mtd_L"] = float(str(live_sales["revenue_mtd"]).replace("₹", "").replace("L", "").replace("Rs.", "").strip() or kpis["revenue_mtd_L"])

    if live_finance and isinstance(live_finance, dict):
        gm = live_finance.get("gross_margin", "")
        if gm:
            try:
                kpis["gross_margin_pct"] = float(str(gm).replace("%", "").strip())
            except ValueError:
                pass

    data_source = "mysql" if (live_sales or live_finance) else "demo"

    return {
        "kpis":                  kpis,
        "monthly_pl":            monthly_pl,
        "revenue_labels":        labels,
        "revenue_data":          revenue_data,
        "margin_data":           margin_pct,
        "category_revenue":      category_revenue,
        "top_products":          top_products,
        "top_customers":         top_customers,
        "customer_type_breakdown": customer_type_breakdown,
        "supplier_performance":  supplier_performance,
        "data_source":           data_source,
    }
