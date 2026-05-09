"""
MCP (Model Context Protocol) Tools for StockSense AI
Structured data providers that feed live business context to the LLM.

Data source priority:
  1. MySQL database (if MYSQL_HOST is set in .env and connection succeeds)
  2. Mock data (fallback -- always works, no setup required)

The chatbot, streaming, RCA, and all other features are unaffected regardless
of whether MySQL is connected or not.
"""
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Try to load DB layer (graceful if aiomysql not installed or not configured)
try:
    from app.db.connection import get_pool
    from app.db import queries as db_q
    _DB_LAYER_AVAILABLE = True
except ImportError:
    _DB_LAYER_AVAILABLE = False
    logger.info("DB layer not available (aiomysql not installed) -- using mock data")


async def _try_db(fn_name: str, query: str) -> Optional[dict]:
    """Attempt a DB query. Returns None on any failure so caller uses mock."""
    if not _DB_LAYER_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if pool is None:
            return None
        fn = getattr(db_q, fn_name)
        result = await fn(pool, query)
        logger.debug("DB query OK: %s", fn_name)
        return result
    except Exception as exc:
        logger.warning("DB query failed (%s: %s) -- falling back to mock", fn_name, exc)
        return None


# =============================================================================
# TOOL FUNCTIONS — each tries DB first, falls back to rich mock data
# =============================================================================

async def stock_tool(query: Optional[str] = None) -> dict:
    """Real-time stock levels, SKU health, ABC analysis, godown positions."""
    db_result = await _try_db("query_stock", query or "")
    if db_result:
        return db_result
    # Mock fallback
    return {
        "total_stock_value": "Rs.38.6L",
        "critical_low": [
            {"sku": "18mm BWP (8x4)", "brand": "Century", "stock": 140, "days_cover": 8,
             "daily_sale": 17, "reorder_level": 120, "lead_time": "6 days", "revenue_at_risk": "Rs.1.9L"},
            {"sku": "12mm BWP (8x4)", "brand": "Century", "stock": 220, "days_cover": 11,
             "daily_sale": 20, "reorder_level": 200, "lead_time": "6 days", "revenue_at_risk": "Rs.1.1L"},
        ],
        "dead_stock": [
            {"sku": "6mm Gurjan BWP", "days_old": 118, "stock": 186, "value": "Rs.1.79L",
             "last_sale": "No movement in 90+ days", "action": "12% discount to contractors"},
            {"sku": "4mm MR Plain", "days_old": 97, "stock": 240, "value": "Rs.1.39L",
             "last_sale": "4 sheets in 30 days", "action": "Bundle with 18mm BWP orders"},
            {"sku": "19mm Commercial", "days_old": 91, "stock": 102, "value": "Rs.0.99L",
             "last_sale": "2 sheets in 30 days", "action": "Return to supplier if policy allows"},
        ],
        "overstock": [
            {"sku": "8mm Flexi BWP", "stock": 110, "days_cover": 28, "value": "Rs.0.70L"},
            {"sku": "10mm Flexi BWP", "stock": 88, "days_cover": 74, "value": "Rs.1.09L"},
        ],
        "healthy_skus": ["12mm MR Plain (18d cover)", "Laminate Teak (32d cover)", "18mm MR (22d cover)"],
        "inventory_accuracy": "96.8%",
        "stock_turnover": "4.2x",
        "gmroi": "Rs.1.98",
        "godowns": {
            "Main WH (HSR Layout)":   {"value": "Rs.28.4L", "sheets": 1420, "capacity_pct": 82},
            "Showroom (Koramangala)": {"value": "Rs.6.8L",  "sheets": 280,  "capacity_pct": 45},
            "Overflow (Whitefield)":  {"value": "Rs.3.4L",  "sheets": 152,  "capacity_pct": 28},
        },
        "abc_class": {
            "A_skus": ["18mm BWP", "12mm BWP", "12mm MR", "Laminates Teak"],
            "A_revenue_share": "78%", "B_count": 8, "C_count": 30,
        },
        "true_landed_cost": {
            "18mm BWP":      {"buy": 1420, "freight": 42,  "loading": 18, "wastage": 14, "true_cost": 1494, "sell": 1920, "real_margin": "22.2%", "stated_margin": "26.0%"},
            "8mm Flexi BWP": {"buy": 640,  "freight": 110, "loading": 15, "wastage": 19, "true_cost": 784,  "sell": 840,  "real_margin": "6.7%",  "stated_margin": "23.8%"},
            "12mm MR Plain": {"buy": 720,  "freight": 56,  "loading": 12, "wastage": 7,  "true_cost": 795,  "sell": 940,  "real_margin": "15.4%", "stated_margin": "23.4%"},
        },
        "data_source": "mock",
    }


async def demand_tool(query: Optional[str] = None) -> dict:
    """Demand forecasting, trends, seasonal analysis, and AI demand signals."""
    db_result = await _try_db("query_demand", query or "")
    if db_result:
        return db_result
    return {
        "current_month_top": [
            {"sku": "18mm BWP", "curr": 480, "f30": 596, "f60": 680, "f90": 712,
             "signal": "SURGE +24%", "action": "Pre-order 300 extra sheets NOW"},
            {"sku": "12mm MR",  "curr": 420, "f30": 448, "f60": 436, "f90": 380,
             "signal": "STABLE +6.7%", "action": "Normal ordering cycle"},
            {"sku": "12mm BWP", "curr": 380, "f30": 432, "f60": 498, "f90": 524,
             "signal": "GROWING +13.7%", "action": "Increase stock by 25%"},
            {"sku": "Laminates","curr": 320, "f30": 298, "f60": 274, "f90": 250,
             "signal": "DECLINING -6.9%", "action": "Reduce next order quantity"},
        ],
        "seasonal_insight": "Oct-Dec historically strongest quarter (+28%). Stock up BWP grades by September.",
        "demand_drivers": [
            "Construction activity up 18% in HSR/Koramangala zone",
            "Interior firm orders spiking -- Diwali renovation season approaching",
            "18mm BWP shortage in market -- competitors currently out of stock",
        ],
        "risk_factors": [
            "Monsoon slowdown expected July-August",
            "Century Plyboards price hike rumoured next quarter",
            "New competitor opened in BTM Layout last month",
        ],
        "data_source": "mock",
    }


async def supplier_tool(query: Optional[str] = None) -> dict:
    """Supplier scorecards, PO status, GRN matching, delivery performance."""
    db_result = await _try_db("query_supplier", query or "")
    if db_result:
        return db_result
    return {
        "suppliers": [
            {
                "name": "Century Plyboards", "on_time_pct": 96, "avg_delay_days": 0.4,
                "price_vs_market": "-3% (below market -- excellent)", "lead_time": "5-6 days",
                "freight_cost": "Rs.8.4/sheet (full truck)", "grn_match_rate": "100%",
                "recommendation": "PREFERRED -- expand orders",
                "open_pos": 2, "pending_value": "Rs.6.8L",
            },
            {
                "name": "Gauri Laminates", "on_time_pct": 68, "avg_delay_days": 3.2,
                "price_vs_market": "+6% (above market)", "lead_time": "10-11 days",
                "freight_cost": "Rs.22/sheet (42% truck fill, 240 km)",
                "true_landed_premium": "+11% above market when freight included",
                "grn_match_rate": "82% (18% failure rate)", "delivery_failures_month": 3,
                "recommendation": "REVIEW -- consider alternate sourcing",
                "open_pos": 1, "pending_value": "Rs.2.8L",
                "overdue": "PO-7731 overdue 4 days",
            },
            {
                "name": "Greenply Industries", "on_time_pct": 88, "avg_delay_days": 1.2,
                "price_vs_market": "+1% (slightly above)", "lead_time": "7 days",
                "freight_cost": "Rs.12.6/sheet", "grn_match_rate": "94%",
                "recommendation": "GOOD -- second preferred supplier",
                "open_pos": 1, "pending_value": "Rs.2.8L",
                "overdue": "PO-7734 overdue 2 days",
            },
        ],
        "total_open_pos": 8,
        "open_po_value": "Rs.12.4L",
        "overdue_pos": ["PO-7734 (Greenply, +2d)", "PO-7731 (Gauri, +4d)"],
        "grn_match_rate": "96%",
        "mismatches_month": "3 (Rs.8,400 total)",
        "data_source": "mock",
    }


async def customer_tool(query: Optional[str] = None) -> dict:
    """Customer intelligence, receivables, risk scoring, discount analysis."""
    db_result = await _try_db("query_customer", query or "")
    if db_result:
        return db_result
    return {
        "total_customers": 148,
        "segments": {
            "Contractors (44%)":    {"avg_margin": "19%", "avg_dso": 28, "top": "Mehta Constructions Rs.3.8L/mo"},
            "Interior Firms (26%)": {"avg_margin": "31%", "avg_dso": 18, "top": "Design Studio Patel Rs.1.6L/mo"},
            "Retailers (18%)":      {"avg_margin": "21%", "avg_dso": 22, "top": "Kumar & Sons Rs.2.1L/mo"},
            "Carpenters (12%)":     {"avg_margin": "22%", "avg_dso": 12, "top": "Raj Carpentry Works Rs.0.9L/mo"},
        },
        "at_risk": [
            {"name": "City Interiors",        "days_silent": 47, "monthly_value": "Rs.2.4L",
             "margin": "28.4%", "reason": "Possibly switched to competitor"},
            {"name": "Gupta Materials Retail","days_silent": 38, "monthly_value": "Rs.0.8L",
             "reason": "Price complaint logged last month"},
        ],
        "overdue_receivables": [
            {"customer": "Sharma Constructions", "amount": "Rs.3.4L", "days_overdue": 78, "risk": "HIGH"},
            {"customer": "Mehta Brothers",       "amount": "Rs.2.1L", "days_overdue": 52, "risk": "MEDIUM"},
            {"customer": "Patel Contractors",    "amount": "Rs.1.8L", "days_overdue": 44, "risk": "MEDIUM"},
            {"customer": "Rajan Interior",       "amount": "Rs.1.2L", "days_overdue": 31, "risk": "LOW"},
            {"customer": "Others (12 accounts)", "amount": "Rs.4.3L", "days_overdue": "<30", "risk": "LOW"},
        ],
        "total_outstanding": "Rs.12.8L",
        "discount_leakage": {
            "Sharma Constructions": "9.2% avg vs 4.8% standard -- costs Rs.22,100/month",
            "SK Traders": "6.5% -- costs Rs.8,400/month",
        },
        "data_source": "mock",
    }


async def finance_tool(query: Optional[str] = None) -> dict:
    """Financial KPIs, GST status, working capital, profitability."""
    db_result = await _try_db("query_finance", query or "")
    if db_result:
        return db_result
    return {
        "revenue_mtd": "Rs.28.4L",
        "revenue_growth": "+9.2% MoM",
        "gross_profit_mtd": "Rs.6.36L",
        "gross_margin": "22.4%",
        "working_capital_days": 48,
        "cash_cycle": "DIO 22 + DSO 34 - DPO 8 = 48 days (target <40)",
        "outstanding_receivables": "Rs.12.8L",
        "dead_stock_locked": "Rs.7.8L",
        "net_operating_cash": "Rs.4.1L",
        "gst": {
            "output_collected": "Rs.5.11L",
            "itc_available": "Rs.4.28L",
            "net_payable": "Rs.0.83L",
            "unclaimed_itc": "Rs.0.14L (3 Gauri invoices missing from GSTR-2B)",
            "gstr1": "Filed", "gstr3b": "PENDING -- due 20 Apr",
            "ewaybills_expiring_today": 2,
        },
        "margin_by_sku": {
            "18mm BWP (true landed)":   "22.2% (not 26% -- freight/wastage hidden)",
            "12mm BWP":                 "25.6%",
            "8mm Flexi BWP (true landed)": "6.7% CRITICAL (Gauri freight Rs.110/sh)",
            "Commercial grade":         "8.2%",
        },
        "returns_mtd": "Rs.0.82L",
        "return_causes": ["Damage in transit Rs.0.42L", "Wrong grade shipped Rs.0.28L", "Customer changed mind Rs.0.12L"],
        "data_source": "mock",
    }


async def order_tool(query: Optional[str] = None) -> dict:
    """Order pipeline, fulfilment SLA, dispatch status."""
    db_result = await _try_db("query_order", query or "")
    if db_result:
        return db_result
    return {
        "today_orders": 24,
        "dispatched": 18,
        "pending": 6,
        "pending_details": [
            {"order": "ORD-2847", "customer": "Mehta Constructions", "value": "Rs.3.8L",
             "delayed": "30 hours", "reason": "18mm BWP stock shortage"},
            {"order": "ORD-2852", "customer": "Patel Contractors", "value": "Rs.1.2L",
             "delayed": "4 hours", "reason": "QC pending on MR grade"},
        ],
        "dispatch_sla_hit": "87% (target 95%)",
        "avg_fulfillment_time": "3.2 hours",
        "order_trend": "+6 vs yesterday",
        "issues": [
            "QC bottleneck on MR grades: 48 min avg vs 12 min for BWP",
            "3 wrong-grade picking errors this week",
            "Mehta Constructions order delayed 30 hrs -- Rs.3.8L/month account at risk",
        ],
        "data_source": "mock",
    }


async def freight_tool(query: Optional[str] = None) -> dict:
    """Freight costs, vehicle utilisation, lane analysis, consolidation opportunities."""
    db_result = await _try_db("query_freight", query or "")
    if db_result:
        return db_result
    return {
        "outbound_cost_per_sheet": "Rs.18.4 (target Rs.16)",
        "vehicle_utilisation": "68% (target 85%)",
        "inbound_costs": {
            "Century Plyboards":  "Rs.8.4/sheet (full truck -- excellent)",
            "Gauri Laminates":    "Rs.22/sheet (42% fill, 240 km -- very high)",
            "Greenply Industries":"Rs.12.6/sheet",
        },
        "outbound_lanes": [
            {"lane": "Whitefield",      "cost_per_sheet": 14, "fill_pct": 78, "status": "BEST"},
            {"lane": "Koramangala",     "cost_per_sheet": 16, "fill_pct": 72, "status": "OK"},
            {"lane": "HSR Layout",      "cost_per_sheet": 17, "fill_pct": 65, "status": "OK"},
            {"lane": "BTM Layout",      "cost_per_sheet": 19, "fill_pct": 58, "status": "HIGH"},
            {"lane": "Electronic City", "cost_per_sheet": 24, "fill_pct": 54, "status": "WORST"},
        ],
        "consolidation_opportunity": "Merge 3 Whitefield deliveries today (Mehta 40sh + Patel 30sh + Gupta 10sh) -- save Rs.2,400",
        "today_savings_potential": "Rs.2,400",
        "data_source": "mock",
    }


async def email_tool(query: Optional[str] = None) -> dict:
    """Draft communications and action triggers."""
    recipient = "supplier" if "supplier" in (query or "").lower() else "customer"
    return {
        "status": "Draft Ready",
        "ref": f"DRAFT-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "action": f"AI drafted {recipient} communication from your query",
        "next_step": "Review draft -> confirm -> send",
        "data_source": "mock",
    }


async def po_grn_tool(query: Optional[str] = None) -> dict:
    """Detailed PO status, GRN match rates, discrepancy log, and procurement KPIs."""
    db_result = await _try_db("query_po_grn", query or "")
    if db_result:
        return db_result
    # Mock fallback — mirrors the static data in POGRN.jsx
    return {
        "kpis": {
            "open_pos": 8,
            "open_po_value": "Rs.12.4L",
            "overdue_pos": 2,
            "grn_match_rate": "96%",
            "grn_mismatches_mtd": 3,
            "grn_variance_value": "Rs.8,400",
            "partial_pos": 3,
        },
        "open_pos": [
            {
                "po_number": "PO-7734", "supplier": "Greenply Industries",
                "sku": "12mm MR Plain", "qty_ordered": 300, "qty_received": 180,
                "fill_pct": 60, "value": "Rs.2.16L", "status": "OVERDUE", "overdue_days": 2,
            },
            {
                "po_number": "PO-7732", "supplier": "Century Plyboards",
                "sku": "12mm BWP", "qty_ordered": 150, "qty_received": 130,
                "fill_pct": 87, "value": "Rs.1.73L", "status": "PARTIAL", "overdue_days": 0,
            },
            {
                "po_number": "PO-7731", "supplier": "Gauri Laminates",
                "sku": "8mm Flexi", "qty_ordered": 200, "qty_received": 76,
                "fill_pct": 38, "value": "Rs.0.49L", "status": "OVERDUE", "overdue_days": 4,
            },
        ],
        "grn_discrepancies": [
            {
                "grn_number": "GRN-4421", "po_number": "PO-7728",
                "supplier": "Gauri Laminates", "discrepancy_amt": "Rs.3,200",
                "notes": "Wrong Grade — 8mm MR received vs 8mm BWP ordered",
                "action": "Return & Reorder",
            },
            {
                "grn_number": "GRN-4418", "po_number": "PO-7725",
                "supplier": "Gauri Laminates", "discrepancy_amt": "Rs.2,800",
                "notes": "Short by 14 sheets", "action": "Raise Credit Note",
            },
            {
                "grn_number": "GRN-4412", "po_number": "PO-7719",
                "supplier": "Gauri Laminates", "discrepancy_amt": "Rs.2,400",
                "notes": "Price Mismatch: Invoice Rs.156 vs PO rate Rs.142",
                "action": "Block Payment",
            },
        ],
        "data_source": "mock",
    }


async def sales_tool(query: Optional[str] = None) -> dict:
    """Sales revenue trends, margin by SKU, day-of-week patterns."""
    db_result = await _try_db("query_sales", query or "")
    if db_result:
        return db_result
    return {
        "revenue_mtd": "Rs.28.4L",
        "orders_mtd": 486,
        "avg_order_value": "Rs.58,400",
        "monthly_revenue": [
            {"month": "May", "revenue": 19.2}, {"month": "Jun", "revenue": 20.1},
            {"month": "Jul", "revenue": 21.4}, {"month": "Aug", "revenue": 22.8},
            {"month": "Sep", "revenue": 21.6}, {"month": "Oct", "revenue": 20.4},
            {"month": "Nov", "revenue": 22.1}, {"month": "Dec", "revenue": 23.8},
            {"month": "Jan", "revenue": 24.4}, {"month": "Feb", "revenue": 25.2},
            {"month": "Mar", "revenue": 26.0}, {"month": "Apr", "revenue": 28.4},
        ],
        "day_of_week": [
            {"day": "Mon", "avg": 42.0}, {"day": "Fri", "avg": 62.4}, {"day": "Sat", "avg": 78.6},
        ],
        "top_sku": "18mm BWP",
        "revenue_growth": "+9.2% MoM",
        "data_source": "mock",
    }


async def inward_tool(query: Optional[str] = None) -> dict:
    """Inward/outward stock movements, GRN summary, shrinkage."""
    db_result = await _try_db("query_inward", query or "")
    if db_result:
        return db_result
    return {
        "inward_today": "Rs.6.8L",
        "outward_today": "Rs.8.2L",
        "inward_count": 12,
        "outward_count": 18,
        "shrinkage_mtd": "Rs.0.24L",
        "qc_pass_rate": "94%",
        "recent_grn": [
            {"grn": "GRN-4424", "supplier": "Century Plyboards",  "value": "Rs.3.8L", "status": "MATCH",    "date": "today"},
            {"grn": "GRN-4423", "supplier": "Greenply Industries", "value": "Rs.1.6L", "status": "MATCH",    "date": "today"},
            {"grn": "GRN-4422", "supplier": "Gauri Laminates",    "value": "Rs.1.4L", "status": "MISMATCH", "date": "today"},
        ],
        "data_source": "mock",
    }


async def discount_tool(query: Optional[str] = None) -> dict:
    """
    Distributor discount rules, pricing schedule, margin guardrails, and quote history.
    Enables AI to answer: what discount can I give? Is this offer within policy?
    """
    # Try live DB — reuses the discount dashboard endpoint's query logic
    if _DB_LAYER_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                from app.db.discount_queries import get_discount_dashboard
                data = await get_discount_dashboard(pool)
                return _format_discount_for_ai(data)
        except Exception as exc:
            logger.warning("Discount tool DB failed: %s", exc)

    # Mock fallback — same rules/prices as discounts.py mock
    return {
        "policy_note": (
            "Discount policy: segment-based slabs with per-product margin guardrails. "
            "Category rules override segment rules when both match."
        ),
        "rules_by_segment": {
            "Contractor": [
                {"qty_range": "1–49",    "discount": "3%",  "margin_floor": "9%"},
                {"qty_range": "50–99",   "discount": "4%",  "margin_floor": "8.5%"},
                {"qty_range": "100–199", "discount": "5%",  "margin_floor": "8%"},
                {"qty_range": "200–499", "discount": "7%",  "margin_floor": "7%"},
                {"qty_range": "500+",    "discount": "9%",  "margin_floor": "6%"},
            ],
            "Interior Firm": [
                {"qty_range": "1–49",  "discount": "2%",  "margin_floor": "9.5%"},
                {"qty_range": "50–99", "discount": "3.5%","margin_floor": "9%"},
                {"qty_range": "100+",  "discount": "5–7%","margin_floor": "8–8.5%"},
            ],
            "Retailer": [
                {"qty_range": "1–49",  "discount": "1%",  "margin_floor": "10%"},
                {"qty_range": "50–99", "discount": "2%",  "margin_floor": "9.5%"},
                {"qty_range": "100+",  "discount": "3%",  "margin_floor": "9%"},
            ],
            "Carpenter": [
                {"qty_range": "1–24",  "discount": "3%",  "margin_floor": "9%"},
                {"qty_range": "25–49", "discount": "5%",  "margin_floor": "8.5%"},
                {"qty_range": "50–99", "discount": "7%",  "margin_floor": "8%"},
                {"qty_range": "100+",  "discount": "9%",  "margin_floor": "7%"},
            ],
        },
        "category_overrides": [
            {"category": "High Pressure Laminate", "max_discount": "8%",  "margin_floor": "9%",  "note": "17% natural margin — more room"},
            {"category": "Compact Laminate",        "max_discount": "6%",  "margin_floor": "11%", "note": "Premium product"},
            {"category": "Acrylic",                 "max_discount": "5%",  "margin_floor": "11%", "note": "18% natural margin"},
            {"category": "Laminate",                "max_discount": "4%",  "margin_floor": "11%", "note": "Decorative laminates"},
            {"category": "Commercial",              "max_discount": "5%",  "margin_floor": "12%", "note": "21–22% natural margin"},
            {"category": "Louvers",                 "max_discount": "4%",  "margin_floor": "12%", "note": "Aluminium profiles"},
        ],
        "product_pricing_summary": {
            "18mm BWP (8x4)":     {"buy": 1680, "sell": 1920, "natural_margin": "12.5%"},
            "12mm BWP (8x4)":     {"buy": 1100, "sell": 1280, "natural_margin": "14.1%"},
            "18mm MR Plain (8x4)":{"buy": 920,  "sell": 1080, "natural_margin": "14.8%"},
            "HPL 1mm Matte (8x4)":{"buy": 1080, "sell": 1300, "natural_margin": "16.9%"},
            "Acrylic Laminate":   {"buy": 1720, "sell": 2100, "natural_margin": "18.1%"},
        },
        "kpis": {
            "avg_discount_given_mtd": "4.9%",
            "acceptance_rate":        "43%",
            "quotes_this_month":      7,
            "avg_margin_held":        "10.8%",
        },
        "recent_accepted_quotes": [
            {"customer": "Mehta Constructions",  "product": "18mm BWP",          "qty": 80,  "discount": "4%", "margin": "8.76%", "value": "Rs.1.47L"},
            {"customer": "Kumar Furniture Works","product": "12mm BWP",          "qty": 70,  "discount": "5%", "margin": "9.54%", "value": "Rs.0.85L"},
            {"customer": "Nair Builders",         "product": "HPL Compact 6mm",  "qty": 20,  "discount": "6%", "margin": "11.94%","value": "Rs.0.68L"},
        ],
        "guardrail_examples": {
            "safe":   "18mm BWP × 80sh × Contractor × 4% → margin 8.76% — above 8.5% floor",
            "warning":"18mm BWP × 150sh × Contractor × 6% → margin 7.03% — below 8% floor",
            "danger": "18mm BWP × 250sh × Contractor × 7% → margin 5.91% — CRITICAL, needs approval",
        },
        "data_source": "mock",
    }


def _format_discount_for_ai(data: dict) -> dict:
    """Reshape discount dashboard data into AI-friendly summary."""
    rules    = data.get("rules", [])
    quotes   = data.get("quotes", [])
    kpis     = data.get("kpis", {})

    by_seg: dict = {}
    cat_rules = []
    for r in rules:
        if not r.get("is_active", True):
            continue
        qty = f"{r['min_qty']}–{r['max_qty']}" if r.get("max_qty") else f"{r['min_qty']}+"
        entry = {"qty_range": qty, "discount": f"{r['discount_pct']}%", "margin_floor": f"{r['min_margin_pct']}%"}
        if r.get("segment"):
            by_seg.setdefault(r["segment"], []).append(entry)
        elif r.get("category"):
            cat_rules.append({"category": r["category"], **entry})

    accepted = [
        {
            "customer": q.get("customer_name", "—"),
            "product":  q.get("product_name", "—"),
            "qty":      q.get("quantity"),
            "discount": f"{q.get('discount_pct')}%",
            "margin":   f"{q.get('margin_pct')}%",
            "value":    f"Rs.{round(q.get('total_net', 0)/100000, 2)}L",
        }
        for q in quotes if q.get("status") == "ACCEPTED"
    ][:5]

    return {
        "rules_by_segment":        by_seg,
        "category_overrides":      cat_rules,
        "recent_accepted_quotes":  accepted,
        "kpis": {
            "avg_discount_given_mtd": f"{kpis.get('avg_discount_pct', 0)}%",
            "acceptance_rate":        f"{kpis.get('acceptance_rate', 0)}%",
            "quotes_this_month":      kpis.get("quotes_this_month", 0),
            "avg_margin_held":        f"{kpis.get('avg_margin_pct', 0)}%",
        },
        "data_source": data.get("data_source", "mysql"),
    }


async def louvers_tool(query: Optional[str] = None) -> dict:
    """Sales orders, distributor claims, customer rebates for louvers & laminates."""
    try:
        from app.api.louvers_laminates import _mock_dashboard
        d = _mock_dashboard()
        orders  = d.get("orders",  [])
        claims  = d.get("claims",  [])
        rebates = d.get("rebates", [])
        kpis    = d.get("kpis",    {})
        return {
            "summary": {
                "active_orders":    kpis.get("active_orders"),
                "order_revenue_mtd": f"₹{kpis.get('order_revenue',0)/100000:.2f}L",
                "avg_margin":       f"{kpis.get('avg_margin_pct',0)}%",
                "pipeline_value":   f"₹{kpis.get('pipeline_value',0)/100000:.2f}L",
                "claims_pending":   f"₹{kpis.get('claims_pending',0)/100000:.2f}L",
                "rebate_liability": f"₹{kpis.get('rebate_liability',0)/100000:.2f}L",
            },
            "top_orders":  [{"#": o["order_number"], "customer": o["customer_name"],
                             "product": o["product_name"], "value": f"₹{o['total_value']/100000:.2f}L",
                             "status": o["status"]} for o in orders[:5]],
            "open_claims": [{"#": c["claim_number"], "dist": c["distributor_name"],
                             "type": c["claim_type"], "amount": f"₹{c['amount_claimed']:,.0f}",
                             "status": c["status"]} for c in claims if c["status"] not in ("APPROVED","REJECTED")],
            "active_rebates": [{"#": r["rebate_number"], "customer": r["customer_name"],
                                "type": r["rebate_type"], "target": f"₹{r['target_amount']/100000:.1f}L",
                                "actual": f"₹{r['actual_amount']/100000:.1f}L",
                                "value": f"₹{r['rebate_value']:,.0f}",
                                "status": r["status"]} for r in rebates if r["status"] in ("ACTIVE","PENDING_APPROVAL")],
            "data_source": "mock",
        }
    except Exception as exc:
        logger.warning("louvers_tool failed: %s", exc)
        return {"error": str(exc)}


async def quotes_tool(query: Optional[str] = None) -> dict:
    """Quotation pipeline: quotes by status, win rate, pipeline value, expiring quotes."""
    if _DB_LAYER_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                from app.db import quote_queries
                import datetime
                await quote_queries.ensure_tables(pool)
                kpis   = await quote_queries.kpis_db(pool)
                quotes = await quote_queries.list_quotes_db(pool)
                today  = datetime.date.today()

                # Build enriched quote list
                enriched = []
                by_status: dict = {}
                for q in quotes[:20]:
                    status = q.get("status", "DRAFT")
                    by_status.setdefault(status, {"count": 0, "value": 0.0})
                    by_status[status]["count"] += 1
                    by_status[status]["value"] += float(q.get("grand_total", 0))
                    try:
                        vt = datetime.date.fromisoformat(str(q["valid_till"]))
                        days_to_expiry = (vt - today).days
                    except Exception:
                        days_to_expiry = None
                    enriched.append({
                        "quote_number":   q["quote_number"],
                        "customer":       q["customer_name"],
                        "customer_type":  q.get("customer_type", ""),
                        "contact_person": q.get("contact_person", ""),
                        "contact_phone":  q.get("contact_phone", ""),
                        "project":        q.get("project_name", ""),
                        "site_location":  q.get("site_location", ""),
                        "value_inr":      float(q.get("grand_total", 0)),
                        "value_L":        round(float(q.get("grand_total", 0)) / 100000, 2),
                        "status":         status,
                        "created_at":     q.get("created_at", ""),
                        "valid_till":     q.get("valid_till", ""),
                        "days_to_expiry": days_to_expiry,
                        "margin_pct":     float(q.get("avg_margin_pct", 0)),
                        "payment_terms":  q.get("payment_terms", ""),
                        "notes":          q.get("notes", ""),
                        "remarks":        q.get("remarks", ""),
                        "items_count":    len(q.get("line_items", [])),
                    })

                # Category breakdown from line items
                cat_value: dict = {}
                for q in quotes:
                    for item in q.get("line_items", []):
                        cat = item.get("category", "Other")
                        cat_value[cat] = cat_value.get(cat, 0.0) + float(item.get("line_total", 0))
                top_categories = sorted(
                    [{"category": k, "value_L": round(v / 100000, 2)} for k, v in cat_value.items()],
                    key=lambda x: -x["value_L"]
                )[:6]

                expiring_soon = [q for q in enriched if q["days_to_expiry"] is not None
                                 and 0 <= q["days_to_expiry"] <= 7
                                 and q["status"] in ("SENT", "NEGOTIATING")]

                return {
                    "kpis": kpis,
                    "pipeline_by_status": by_status,
                    "recent_quotes": enriched,
                    "expiring_soon": expiring_soon,
                    "top_categories_in_pipeline": top_categories,
                    "data_source": "mysql",
                }
        except Exception as exc:
            logger.warning("quotes_tool DB error: %s", exc)

    return {
        "kpis": {
            "pipeline_value": 1307840,
            "won_value": 377600,
            "lost_value": 908200,
            "win_rate_pct": 50.0,
            "avg_margin_pct": 19.8,
            "quotes_expiring": 2,
            "total_quotes": 5,
        },
        "recent_quotes": [
            {"quote_number": "QT-2026-0089", "customer": "Prestige Developers",
             "project": "Prestige Skyrise — Tower A & B Facade", "value": 584400,
             "status": "NEGOTIATING", "valid_till": "2026-05-14", "margin_pct": 20.1},
            {"quote_number": "QT-2026-0088", "customer": "Sobha Builders",
             "project": "Sobha Dream Series — Phase 2", "value": 377600,
             "status": "WON", "valid_till": "2026-05-10", "margin_pct": 23.5},
            {"quote_number": "QT-2026-0087", "customer": "Brigade Group",
             "project": "Brigade Tech Park — Amenity Block", "value": 242100,
             "status": "SENT", "valid_till": "2026-04-30", "margin_pct": 18.2},
            {"quote_number": "QT-2026-0086", "customer": "Nambiar Builders",
             "project": "Nambiar Millenia — Clubhouse", "value": 103840,
             "status": "DRAFT", "valid_till": "2026-04-30", "margin_pct": 21.4},
            {"quote_number": "QT-2026-0082", "customer": "Godrej Properties",
             "project": "Godrej Horizon — External Cladding", "value": 908200,
             "status": "LOST", "valid_till": "2026-04-18", "margin_pct": 15.8},
        ],
        "data_source": "mock",
    }


async def projects_tool(query: Optional[str] = None) -> dict:
    """Project pipeline tracker: inquiry to invoice, deal values, at-risk projects."""
    try:
        from app.api.projects import _mock_projects
        projects = _mock_projects()
        by_stage: dict = {}
        total_value = 0.0
        for p in projects:
            stage = p.get("stage", "INQUIRY")
            by_stage[stage] = by_stage.get(stage, 0) + 1
            total_value += p.get("estimated_value", 0)
        return {
            "pipeline_summary": {
                "total_projects": len(projects),
                "total_pipeline_value": f"₹{total_value/100000:.1f}L",
                "by_stage": by_stage,
            },
            "projects": [
                {
                    "name":     p["project_name"],
                    "customer": p["client_name"],
                    "stage":    p["stage"],
                    "value":    f"₹{p.get('estimated_value', 0)/100000:.2f}L",
                    "priority": p.get("priority", "MEDIUM"),
                    "close":    p.get("expected_close", ""),
                    "margin":   f"{p.get('margin_pct', 0)}%",
                }
                for p in projects[:8]
            ],
            "data_source": "mock",
        }
    except Exception as exc:
        logger.warning("projects_tool failed: %s", exc)
        return {"error": str(exc), "data_source": "error"}


async def catalog_tool(query: Optional[str] = None) -> dict:
    """Product catalog: all products with sell/buy price, specs, and category. Includes runtime-added products."""
    try:
        from app.api.catalog import _get_all_products
        all_products = _get_all_products()
        q = (query or "").lower()
        filtered = (
            [p for p in all_products if
             q in p["name"].lower() or
             q in p.get("category", "").lower() or
             q in p.get("brand", "").lower() or
             any(q in t.lower() for t in p.get("tags", []))]
            if q else all_products
        )
        by_cat: dict = {}
        for p in filtered:
            cat = p["category"]
            by_cat.setdefault(cat, []).append({
                "id":           p["product_id"],
                "name":         p["name"],
                "brand":        p.get("brand", ""),
                "sell_price":   p["sell_price"],
                "buy_price":    p["buy_price"],
                "margin_pct":   p.get("margin_pct", 0),
                "unit":         p["unit"],
                "size":         p.get("size", ""),
                "thickness":    p.get("thickness", ""),
                "finish":       p.get("finish", ""),
                "stock_status": p.get("stock_status", "in_stock"),
                "applications": p.get("applications", [])[:3],
            })
        return {
            "categories":     list(by_cat.keys()),
            "total_products": len(filtered),
            "by_category":    by_cat,
            "data_source":    "catalog",
        }
    except Exception as exc:
        logger.warning("catalog_tool failed: %s", exc)
        return {"error": str(exc), "data_source": "error"}


TOOLS = {
    "stock":    stock_tool,
    "demand":   demand_tool,
    "supplier": supplier_tool,
    "customer": customer_tool,
    "finance":  finance_tool,
    "order":    order_tool,
    "freight":  freight_tool,
    "email":    email_tool,
    "po_grn":   po_grn_tool,
    "sales":    sales_tool,
    "inward":   inward_tool,
    "discount": discount_tool,
    "louvers":  louvers_tool,
    "quotes":   quotes_tool,
    "projects": projects_tool,
    "catalog":  catalog_tool,
}
