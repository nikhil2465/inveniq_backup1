"""
Advanced Analytics & Business Intelligence API — InvenIQ
Revenue trends, margin analysis, customer LTV, product performance, inventory efficiency.
DB-first / mock-fallback pattern.
"""
import asyncio
import datetime
import logging
from fastapi import APIRouter

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
async def get_analytics():
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
    revenue_data = [18.4, 19.2, 20.1, 21.4, 22.8, 21.6, 20.4, 22.1, 23.8, 24.4, 26.0, 28.4]
    margin_pct   = [20.1, 20.8, 21.2, 22.0, 21.8, 21.5, 21.9, 22.1, 22.4, 22.6, 22.9, 22.4]
    orders_count = [188, 196, 204, 218, 225, 210, 205, 219, 232, 241, 255, 268]

    # ── Revenue by Category (MTD) ──────────────────────────────────────────────
    category_revenue = [
        {"category": "Aluminium Louvers",       "revenue_L": 8.4,  "orders": 42, "margin_pct": 19.2, "yoy_growth": 18.4},
        {"category": "High Pressure Laminate",  "revenue_L": 6.8,  "orders": 87, "margin_pct": 22.1, "yoy_growth": 9.7},
        {"category": "Compact Laminate",        "revenue_L": 5.2,  "orders": 31, "margin_pct": 17.8, "yoy_growth": 22.3},
        {"category": "Operable Louvre System",  "revenue_L": 4.1,  "orders": 8,  "margin_pct": 23.3, "yoy_growth": 31.0},
        {"category": "Acrylic Laminate",        "revenue_L": 2.4,  "orders": 28, "margin_pct": 18.1, "yoy_growth": 5.8},
        {"category": "PVC Louvers",             "revenue_L": 1.8,  "orders": 52, "margin_pct": 32.8, "yoy_growth": 12.6},
        {"category": "ACP / Cladding",          "revenue_L": 1.2,  "orders": 15, "margin_pct": 25.0, "yoy_growth": 44.0},
        {"category": "PVC Laminate",            "revenue_L": 0.9,  "orders": 38, "margin_pct": 34.5, "yoy_growth": -3.2},
    ]

    # ── Top Products by Margin Contribution ────────────────────────────────────
    top_products = [
        {"rank": 1, "name": "Operable Louvre System (Motorised)", "category": "Operable Louvre System",
         "revenue_L": 4.1, "margin_L": 0.96, "margin_pct": 23.3, "units_sold": 48, "unit": "SQM",
         "trend": "up", "trend_pct": 31.0},
        {"rank": 2, "name": "Aluminium Z-Profile 100mm Anodized", "category": "Aluminium Louvers",
         "revenue_L": 4.8, "margin_L": 0.92, "margin_pct": 19.2, "units_sold": 2280, "unit": "RM",
         "trend": "up", "trend_pct": 18.4},
        {"rank": 3, "name": "PVC Louver Blades 100mm", "category": "PVC Louvers",
         "revenue_L": 1.8, "margin_L": 0.59, "margin_pct": 32.8, "units_sold": 3100, "unit": "RM",
         "trend": "up", "trend_pct": 12.6},
        {"rank": 4, "name": "HPL Compact 6mm (8×4)", "category": "Compact Laminate",
         "revenue_L": 3.6, "margin_L": 0.64, "margin_pct": 17.2, "units_sold": 420, "unit": "sheet",
         "trend": "up", "trend_pct": 22.3},
        {"rank": 5, "name": "HPL 1mm Matte (8×4)", "category": "High Pressure Laminate",
         "revenue_L": 2.8, "margin_L": 0.75, "margin_pct": 26.9, "units_sold": 2150, "unit": "sheet",
         "trend": "up", "trend_pct": 9.7},
        {"rank": 6, "name": "Acrylic Laminate (8×4)", "category": "Acrylic Laminate",
         "revenue_L": 2.4, "margin_L": 0.43, "margin_pct": 18.1, "units_sold": 1140, "unit": "sheet",
         "trend": "flat", "trend_pct": 5.8},
        {"rank": 7, "name": "Aluminium Z-Profile 80mm PC", "category": "Aluminium Louvers",
         "revenue_L": 2.1, "margin_L": 0.41, "margin_pct": 19.6, "units_sold": 1250, "unit": "RM",
         "trend": "up", "trend_pct": 15.2},
        {"rank": 8, "name": "HPL Compact 12mm", "category": "Compact Laminate",
         "revenue_L": 1.6, "margin_L": 0.31, "margin_pct": 19.4, "units_sold": 88, "unit": "sheet",
         "trend": "up", "trend_pct": 28.1},
    ]

    # ── Customer Analytics ─────────────────────────────────────────────────────
    top_customers = [
        {"rank": 1, "name": "Prestige Developers", "type": "Developer",
         "revenue_L": 6.2, "orders": 14, "avg_order_L": 0.44, "margin_pct": 20.1,
         "last_order_days": 4, "credit_days": 30, "outstanding_L": 1.8, "status": "healthy",
         "yoy_growth": 24.0},
        {"rank": 2, "name": "Skyline Architects", "type": "Architect",
         "revenue_L": 4.8, "orders": 22, "avg_order_L": 0.22, "margin_pct": 18.9,
         "last_order_days": 6, "credit_days": 30, "outstanding_L": 0.9, "status": "healthy",
         "yoy_growth": 18.0},
        {"rank": 3, "name": "Metro Constructions", "type": "Contractor",
         "revenue_L": 3.9, "orders": 31, "avg_order_L": 0.13, "margin_pct": 16.8,
         "last_order_days": 8, "credit_days": 60, "outstanding_L": 2.4, "status": "watch",
         "yoy_growth": 8.0},
        {"rank": 4, "name": "Urban Living Interiors", "type": "Interior Firm",
         "revenue_L": 3.1, "orders": 28, "avg_order_L": 0.11, "margin_pct": 22.4,
         "last_order_days": 11, "credit_days": 30, "outstanding_L": 0.4, "status": "healthy",
         "yoy_growth": 15.0},
        {"rank": 5, "name": "TechPark Infra", "type": "Developer",
         "revenue_L": 2.6, "orders": 7, "avg_order_L": 0.37, "margin_pct": 15.4,
         "last_order_days": 25, "credit_days": 45, "outstanding_L": 1.1, "status": "at_risk",
         "yoy_growth": -5.0},
        {"rank": 6, "name": "Horizon Hotels", "type": "Developer",
         "revenue_L": 2.4, "orders": 9, "avg_order_L": 0.27, "margin_pct": 19.2,
         "last_order_days": 9, "credit_days": 30, "outstanding_L": 0.8, "status": "healthy",
         "yoy_growth": 32.0},
        {"rank": 7, "name": "Decor Workspace", "type": "Interior Firm",
         "revenue_L": 2.1, "orders": 19, "avg_order_L": 0.11, "margin_pct": 21.8,
         "last_order_days": 7, "credit_days": 30, "outstanding_L": 0.3, "status": "healthy",
         "yoy_growth": 9.0},
        {"rank": 8, "name": "Gloss Studio", "type": "Interior Firm",
         "revenue_L": 1.8, "orders": 16, "avg_order_L": 0.11, "margin_pct": 18.1,
         "last_order_days": 3, "credit_days": 30, "outstanding_L": 0.2, "status": "healthy",
         "yoy_growth": 6.0},
    ]

    customer_type_breakdown = [
        {"type": "Developer",      "count": 8,  "revenue_L": 12.2, "share_pct": 43.0, "avg_margin_pct": 21.2},
        {"type": "Contractor",     "count": 14, "revenue_L": 7.8,  "share_pct": 27.5, "avg_margin_pct": 17.1},
        {"type": "Interior Firm",  "count": 22, "revenue_L": 5.4,  "share_pct": 19.0, "avg_margin_pct": 20.8},
        {"type": "Architect",      "count": 11, "revenue_L": 2.8,  "share_pct": 9.9,  "avg_margin_pct": 19.4},
        {"type": "Retailer",       "count": 6,  "revenue_L": 0.2,  "share_pct": 0.7,  "avg_margin_pct": 28.6},
    ]

    # ── Supplier Performance ───────────────────────────────────────────────────
    supplier_performance = [
        {"name": "Century Plyboards",    "category": "HPL / Compact", "orders": 38, "value_L": 8.4,
         "ontime_pct": 94, "price_vs_market": -3.0, "quality_score": 92, "status": "preferred"},
        {"name": "Merino Industries",    "category": "HPL", "orders": 24, "value_L": 5.2,
         "ontime_pct": 96, "price_vs_market": +2.0, "quality_score": 95, "status": "preferred"},
        {"name": "Supreme Profile India","category": "Aluminium Louvers", "orders": 31, "value_L": 6.8,
         "ontime_pct": 88, "price_vs_market": -1.0, "quality_score": 87, "status": "good"},
        {"name": "Technal India",        "category": "Operable Systems", "orders": 8, "value_L": 4.1,
         "ontime_pct": 98, "price_vs_market": +8.0, "quality_score": 98, "status": "preferred"},
        {"name": "Durian Industries",    "category": "Acrylic", "orders": 18, "value_L": 2.4,
         "ontime_pct": 82, "price_vs_market": +4.0, "quality_score": 88, "status": "good"},
        {"name": "Polycab India",        "category": "PVC Louvers", "orders": 28, "value_L": 1.8,
         "ontime_pct": 92, "price_vs_market": -2.0, "quality_score": 90, "status": "good"},
        {"name": "Stylam Industries",    "category": "Compact Laminate", "orders": 12, "value_L": 1.6,
         "ontime_pct": 75, "price_vs_market": +6.0, "quality_score": 80, "status": "review"},
        {"name": "Aluline India",        "category": "Aluminium Louvers", "orders": 16, "value_L": 1.4,
         "ontime_pct": 79, "price_vs_market": +3.0, "quality_score": 82, "status": "good"},
    ]

    # ── KPI Summary ────────────────────────────────────────────────────────────
    kpis = {
        "revenue_mtd_L":          28.4,
        "revenue_ytd_L":          284.2,
        "revenue_target_ytd_L":   300.0,
        "achievement_pct":        94.7,
        "gross_margin_pct":       22.4,
        "margin_target_pct":      22.0,
        "orders_mtd":             268,
        "avg_order_value_L":      0.106,
        "new_customers_mtd":      6,
        "active_customers":       61,
        "outstanding_receivable_L": 12.8,
        "overdue_L":              4.2,
        "inventory_value_L":      38.6,
        "dead_stock_L":           4.2,
        "stock_turnover_x":       4.2,
        "quote_win_rate_pct":     38.0,
        "quotes_pipeline_L":      9.2,
        "best_margin_category":   "PVC Louvers (32.8%)",
        "fastest_growing":        "ACP / Cladding (+44% YoY)",
        "working_capital_days":   48,
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
