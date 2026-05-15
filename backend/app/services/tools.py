"""
MCP (Model Context Protocol) Tools for InvenIQ AI
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
            {"sku": "Ebco Soft-Close Hinge 35mm (Pk-10)", "brand": "Ebco", "stock": 42, "days_cover": 7,
             "daily_sale": 6, "reorder_level": 60, "lead_time": "5 days", "revenue_at_risk": "Rs.1.6L"},
            {"sku": "Jaquar Lyric Basin Mixer Chrome", "brand": "Jaquar", "stock": 18, "days_cover": 9,
             "daily_sale": 2, "reorder_level": 25, "lead_time": "7 days", "revenue_at_risk": "Rs.1.2L"},
        ],
        "dead_stock": [
            {"sku": "Parryware Pilot EV Sensor Tap (old model)", "days_old": 95, "stock": 12, "value": "Rs.1.84L",
             "last_sale": "No movement in 90+ days", "action": "10% discount to plumbing contractors"},
            {"sku": "Dorset Euro Profile Cylinder Lock (superseded)", "days_old": 87, "stock": 34, "value": "Rs.1.21L",
             "last_sale": "2 units in 30 days", "action": "Bundle with Ebco handles for project deals"},
            {"sku": "Ebco LED Cabinet Light 12V (old model)", "days_old": 76, "stock": 48, "value": "Rs.0.78L",
             "last_sale": "3 units in 30 days", "action": "Offer to liquidators at 20% discount"},
        ],
        "overstock": [
            {"sku": "Cera Flora Wall Mixer Chrome", "stock": 28, "days_cover": 34, "value": "Rs.0.90L"},
            {"sku": "Hafele Cam Lock 19mm (Pk-50)", "stock": 18, "days_cover": 52, "value": "Rs.0.54L"},
        ],
        "healthy_skus": [
            "Hettich InnoTech Drawer 400mm (18d cover)",
            "Hindware Smart Divertor 2-in-1 (22d cover)",
            "Ebco Full-Ext Slide 450mm SC (15d cover)",
        ],
        "inventory_accuracy": "97.2%",
        "stock_turnover": "5.2x",
        "gmroi": "Rs.2.14",
        "godowns": {
            "Main WH (HSR Layout)":   {"value": "Rs.27.8L", "units": 4840, "capacity_pct": 78},
            "Showroom (Koramangala)": {"value": "Rs.7.2L",  "units": 620,  "capacity_pct": 52},
            "Overflow (Whitefield)":  {"value": "Rs.3.6L",  "units": 380,  "capacity_pct": 31},
        },
        "abc_class": {
            "A_skus": [
                "Ebco Soft-Close Hinge 35mm Pk-10",
                "Jaquar Lyric Basin Mixer Chrome",
                "Hettich InnoTech Drawer 400mm",
                "Hindware Smart Divertor 2-in-1",
            ],
            "A_revenue_share": "76%", "B_count": 11, "C_count": 34,
        },
        "true_landed_cost": {
            "Jaquar Lyric Basin Mixer":    {"buy": 3200, "freight": 48,  "loading": 22, "wastage": 0, "true_cost": 3270, "sell": 4850, "real_margin": "32.6%", "stated_margin": "34.0%"},
            "Hindware Smart Divertor":     {"buy": 1120, "freight": 82,  "loading": 18, "wastage": 0, "true_cost": 1220, "sell": 1680, "real_margin": "27.4%", "stated_margin": "33.3%"},
            "Hettich InnoTech Drawer 400": {"buy": 880,  "freight": 55,  "loading": 12, "wastage": 0, "true_cost": 947,  "sell": 1280, "real_margin": "26.0%", "stated_margin": "31.3%"},
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
            {"sku": "Ebco Soft-Close Hinge 35mm Pk-10", "curr": 380, "f30": 468, "f60": 520, "f90": 544,
             "signal": "SURGE +23%", "action": "Pre-order 200 extra packs NOW before Diwali peak"},
            {"sku": "Jaquar Lyric Basin Mixer Chrome", "curr": 48, "f30": 52, "f60": 48, "f90": 44,
             "signal": "STABLE +8.3%", "action": "Normal ordering cycle — maintain 25-unit buffer"},
            {"sku": "Hettich InnoTech Drawer 400mm", "curr": 142, "f30": 168, "f60": 195, "f90": 210,
             "signal": "GROWING +18.3%", "action": "Increase stock by 30% — premium kitchen segment booming"},
            {"sku": "Hindware Smart Divertor 2-in-1", "curr": 88, "f30": 76, "f60": 68, "f90": 60,
             "signal": "DECLINING -13.6%", "action": "Reduce next order — new model released, old stock clearing"},
        ],
        "seasonal_insight": "Oct-Dec peak renovation season (+32%). Hardware/kitchen fittings surge with Diwali refurbishments. Pre-order Ebco and Hettich by September. April-June: pre-monsoon plumbing demand spike — stock Jaquar shower sets and Hindware divertors.",
        "demand_drivers": [
            "Modular kitchen installations up 24% in Koramangala/Indiranagar zone",
            "Luxury apartment completions driving Hafele/Hettich premium hardware demand",
            "Pre-monsoon: plumbing contractors sourcing shower systems and divertors early",
        ],
        "risk_factors": [
            "Jaquar price revision rumoured Q3 — potential 6-8% increase on CP fittings",
            "New Hafele showroom opened in Whitefield — direct competition for premium architects",
            "Monsoon slowdown (Jul-Aug) for kitchen hardware; but plumbing demand rises",
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
                "name": "Ebco Industries Ltd", "on_time_pct": 94, "avg_delay_days": 0.6,
                "price_vs_market": "-2% (below market — excellent)", "lead_time": "4-5 days",
                "freight_cost": "Rs.0.8/unit (full truck — free above Rs.1L)", "grn_match_rate": "99%",
                "recommendation": "PREFERRED — expand hardware orders",
                "open_pos": 3, "pending_value": "Rs.7.2L",
            },
            {
                "name": "Hafele India Pvt Ltd", "on_time_pct": 92, "avg_delay_days": 0.8,
                "price_vs_market": "+3% (slightly above — premium brand premium)",
                "lead_time": "5-6 days", "freight_cost": "Rs.1.2/unit", "grn_match_rate": "98%",
                "recommendation": "GOOD — preferred premium hardware supplier",
                "open_pos": 2, "pending_value": "Rs.4.8L",
            },
            {
                "name": "Jaquar Group", "on_time_pct": 88, "avg_delay_days": 1.4,
                "price_vs_market": "+1% (within acceptable range)", "lead_time": "6-7 days",
                "freight_cost": "Rs.1.8/unit", "grn_match_rate": "96%",
                "recommendation": "GOOD — primary sanitary supplier",
                "open_pos": 2, "pending_value": "Rs.5.6L",
            },
            {
                "name": "Hindware Ltd", "on_time_pct": 76, "avg_delay_days": 2.8,
                "price_vs_market": "+4% (above market on certain lines)", "lead_time": "8-10 days",
                "freight_cost": "Rs.3.4/unit (partial loads, 280 km)",
                "true_landed_premium": "+9% above market when freight included",
                "grn_match_rate": "84% (16% mismatch rate)", "delivery_failures_month": 2,
                "recommendation": "REVIEW — delivery reliability needs improvement",
                "open_pos": 1, "pending_value": "Rs.2.4L",
                "overdue": "PO-8841 overdue 3 days",
            },
        ],
        "total_open_pos": 8,
        "open_po_value": "Rs.20.0L",
        "overdue_pos": ["PO-8841 (Hindware, +3d)", "PO-8836 (Jaquar, +1d)"],
        "grn_match_rate": "95%",
        "mismatches_month": "2 (Rs.6,200 total)",
        "data_source": "mock",
    }


async def customer_tool(query: Optional[str] = None) -> dict:
    """Customer intelligence, receivables, risk scoring, discount analysis."""
    db_result = await _try_db("query_customer", query or "")
    if db_result:
        return db_result
    return {
        "total_customers": 162,
        "segments": {
            "Interior Firms (32%)":     {"avg_margin": "32%", "avg_dso": 22, "top": "Modern Kitchens Pvt Ltd Rs.4.2L/mo"},
            "Contractors (28%)":        {"avg_margin": "22%", "avg_dso": 30, "top": "Prestige Site Engineers Rs.2.8L/mo"},
            "Plumbers/Installers (18%)":{"avg_margin": "28%", "avg_dso": 15, "top": "Shivam Plumbing Works Rs.2.1L/mo"},
            "Retailers (14%)":          {"avg_margin": "24%", "avg_dso": 18, "top": "Kumar & Sons Hardware Rs.1.4L/mo"},
            "Carpenters (8%)":          {"avg_margin": "26%", "avg_dso": 10, "top": "Raj Carpentry Rs.0.9L/mo"},
        },
        "at_risk": [
            {"name": "Modern Kitchens Pvt Ltd",  "days_silent": 45, "monthly_value": "Rs.4.2L",
             "margin": "32.4%", "reason": "Possibly switched to Hafele direct — large account at risk"},
            {"name": "Green Valley Interiors",    "days_silent": 38, "monthly_value": "Rs.1.6L",
             "reason": "Price complaint — quoted Hettich but delivered Ebco substitute last order"},
        ],
        "overdue_receivables": [
            {"customer": "Sharma Constructions",  "amount": "Rs.3.4L", "days_overdue": 78, "risk": "HIGH"},
            {"customer": "Metro Builders",         "amount": "Rs.2.1L", "days_overdue": 52, "risk": "MEDIUM"},
            {"customer": "Patel Interiors",        "amount": "Rs.1.8L", "days_overdue": 44, "risk": "MEDIUM"},
            {"customer": "Rajan Plumbing Works",   "amount": "Rs.1.2L", "days_overdue": 31, "risk": "LOW"},
            {"customer": "Others (14 accounts)",   "amount": "Rs.4.3L", "days_overdue": "<30", "risk": "LOW"},
        ],
        "total_outstanding": "Rs.12.8L",
        "discount_leakage": {
            "Sharma Constructions":   "8.8% avg vs 5% standard — costs Rs.18,400/month",
            "Metro Hardware Retail":  "6.2% — costs Rs.7,200/month",
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
        "revenue_growth": "+11.4% MoM",
        "gross_profit_mtd": "Rs.7.04L",
        "gross_margin": "24.8%",
        "working_capital_days": 44,
        "cash_cycle": "DIO 18 + DSO 32 - DPO 6 = 44 days (target <38)",
        "outstanding_receivables": "Rs.12.8L",
        "dead_stock_locked": "Rs.3.83L",
        "net_operating_cash": "Rs.5.2L",
        "gst": {
            "output_collected": "Rs.5.11L",
            "itc_available": "Rs.4.28L",
            "net_payable": "Rs.0.83L",
            "unclaimed_itc": "Rs.0.12L (2 Hindware invoices missing from GSTR-2B)",
            "gstr1": "Filed", "gstr3b": "PENDING -- due 20 Apr",
            "ewaybills_expiring_today": 1,
        },
        "margin_by_sku": {
            "Ebco Soft-Close Hinge 35mm":    "28.4%",
            "Jaquar Lyric Basin Mixer":       "32.6% (true landed — freight factored)",
            "Hettich InnoTech Drawer 400mm":  "26.0%",
            "Hindware Smart Divertor (true landed)": "27.4% (Hindware freight Rs.82/unit pulls margin down from 33%)",
            "Hafele Mortice Lock SS":          "31.0%",
            "Parryware Pilot EV Sensor Tap":  "18.2% WATCH (slow mover — holding cost eroding margin)",
        },
        "returns_mtd": "Rs.0.62L",
        "return_causes": ["Defective product warranty claim Rs.0.32L", "Wrong item dispatched Rs.0.18L", "Customer size change Rs.0.12L"],
        "data_source": "mock",
    }


async def order_tool(query: Optional[str] = None) -> dict:
    """Order pipeline, fulfilment SLA, dispatch status."""
    db_result = await _try_db("query_order", query or "")
    if db_result:
        return db_result
    return {
        "today_orders": 28,
        "dispatched": 22,
        "pending": 6,
        "pending_details": [
            {"order": "ORD-3104", "customer": "Modern Kitchens Pvt Ltd", "value": "Rs.2.6L",
             "delayed": "18 hours", "reason": "Ebco Soft-Close Hinge Pk-10 critically low stock — awaiting urgent PO"},
            {"order": "ORD-3108", "customer": "Prestige Site Engineers", "value": "Rs.1.4L",
             "delayed": "6 hours", "reason": "Jaquar Lyric Basin Mixer pending quality check"},
        ],
        "dispatch_sla_hit": "91% (target 95%)",
        "avg_fulfillment_time": "2.8 hours",
        "order_trend": "+4 vs yesterday",
        "issues": [
            "Ebco hinge stockout causing delays on 3 interior firm orders — raise emergency PO today",
            "2 wrong-SKU picking errors this week (Ebco vs Hafele hinges — similar packaging)",
            "Modern Kitchens Pvt Ltd order delayed 18 hrs — Rs.4.2L/month account at risk of switching",
        ],
        "data_source": "mock",
    }


async def freight_tool(query: Optional[str] = None) -> dict:
    """Freight costs, vehicle utilisation, lane analysis, consolidation opportunities."""
    db_result = await _try_db("query_freight", query or "")
    if db_result:
        return db_result
    return {
        "outbound_cost_per_delivery": "Rs.380 avg per order (target Rs.320)",
        "vehicle_utilisation": "72% (target 85%)",
        "inbound_costs": {
            "Ebco Industries Ltd":   "Rs.0.8/unit (free freight above Rs.1L order — excellent)",
            "Hafele India Pvt Ltd":  "Rs.1.2/unit (standard — acceptable)",
            "Jaquar Group":          "Rs.1.8/unit (partial loads — negotiate free freight above Rs.2L)",
            "Hindware Ltd":          "Rs.3.4/unit (280 km, partial loads — very high, impacting margins)",
        },
        "outbound_lanes": [
            {"lane": "Koramangala",     "cost_per_delivery": 280, "fill_pct": 84, "status": "BEST"},
            {"lane": "Indiranagar",     "cost_per_delivery": 310, "fill_pct": 78, "status": "OK"},
            {"lane": "HSR Layout",      "cost_per_delivery": 340, "fill_pct": 68, "status": "OK"},
            {"lane": "Whitefield",      "cost_per_delivery": 420, "fill_pct": 61, "status": "HIGH"},
            {"lane": "Electronic City", "cost_per_delivery": 520, "fill_pct": 54, "status": "WORST"},
        ],
        "consolidation_opportunity": "Merge 4 Whitefield deliveries today (Modern Kitchens + Prestige + 2 retailers) — save Rs.1,800",
        "today_savings_potential": "Rs.1,800",
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
            "open_po_value": "Rs.20.0L",
            "overdue_pos": 2,
            "grn_match_rate": "95%",
            "grn_mismatches_mtd": 2,
            "grn_variance_value": "Rs.6,200",
            "partial_pos": 2,
        },
        "open_pos": [
            {
                "po_number": "PO-8841", "supplier": "Hindware Ltd",
                "sku": "Hindware Smart Divertor 2-in-1", "qty_ordered": 60, "qty_received": 28,
                "fill_pct": 47, "value": "Rs.1.01L", "status": "OVERDUE", "overdue_days": 3,
            },
            {
                "po_number": "PO-8838", "supplier": "Ebco Industries Ltd",
                "sku": "Ebco Soft-Close Hinge 35mm Pk-10", "qty_ordered": 200, "qty_received": 120,
                "fill_pct": 60, "value": "Rs.2.91L", "status": "PARTIAL", "overdue_days": 0,
            },
            {
                "po_number": "PO-8836", "supplier": "Jaquar Group",
                "sku": "Jaquar Lyric Basin Mixer Chrome", "qty_ordered": 30, "qty_received": 22,
                "fill_pct": 73, "value": "Rs.1.07L", "status": "OVERDUE", "overdue_days": 1,
            },
        ],
        "grn_discrepancies": [
            {
                "grn_number": "GRN-5218", "po_number": "PO-8831",
                "supplier": "Hindware Ltd", "discrepancy_amt": "Rs.3,600",
                "notes": "Wrong finish — Ivory White received vs Chrome ordered (Hindware Basin Tap)",
                "action": "Return & Reorder",
            },
            {
                "grn_number": "GRN-5214", "po_number": "PO-8824",
                "supplier": "Hindware Ltd", "discrepancy_amt": "Rs.2,600",
                "notes": "Short by 8 units — invoice shows 40 units, received 32",
                "action": "Raise Credit Note",
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
        "orders_mtd": 512,
        "avg_order_value": "Rs.55,500",
        "monthly_revenue": [
            {"month": "May", "revenue": 19.8}, {"month": "Jun", "revenue": 20.4},
            {"month": "Jul", "revenue": 20.9}, {"month": "Aug", "revenue": 21.8},
            {"month": "Sep", "revenue": 22.4}, {"month": "Oct", "revenue": 21.2},
            {"month": "Nov", "revenue": 23.6}, {"month": "Dec", "revenue": 25.4},
            {"month": "Jan", "revenue": 24.8}, {"month": "Feb", "revenue": 25.8},
            {"month": "Mar", "revenue": 26.4}, {"month": "Apr", "revenue": 28.4},
        ],
        "day_of_week": [
            {"day": "Mon", "avg": 44.2}, {"day": "Fri", "avg": 68.6}, {"day": "Sat", "avg": 82.4},
        ],
        "top_sku": "Ebco Soft-Close Hinge 35mm Pack",
        "revenue_growth": "+11.4% MoM",
        "category_split": {
            "Hardware Fittings (Ebco/Hafele/Hettich)": "42%",
            "Sanitary Fittings (Jaquar/Hindware/Cera)": "34%",
            "Kitchen Systems & Baskets": "14%",
            "Door Hardware & Locks": "10%",
        },
        "data_source": "mock",
    }


async def inward_tool(query: Optional[str] = None) -> dict:
    """Inward/outward stock movements, GRN summary, shrinkage."""
    db_result = await _try_db("query_inward", query or "")
    if db_result:
        return db_result
    return {
        "inward_today": "Rs.7.2L",
        "outward_today": "Rs.8.6L",
        "inward_count": 14,
        "outward_count": 22,
        "shrinkage_mtd": "Rs.0.18L",
        "qc_pass_rate": "96%",
        "recent_grn": [
            {"grn": "GRN-5222", "supplier": "Ebco Industries Ltd",  "value": "Rs.3.6L", "status": "MATCH",    "date": "today"},
            {"grn": "GRN-5221", "supplier": "Hafele India Pvt Ltd", "value": "Rs.2.4L", "status": "MATCH",    "date": "today"},
            {"grn": "GRN-5220", "supplier": "Hindware Ltd",         "value": "Rs.1.2L", "status": "MISMATCH", "date": "today"},
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
            "Category rules override segment rules when both match. Hardware: 28-34% natural margin. Sanitary: 28-34%."
        ),
        "rules_by_segment": {
            "Interior Firm": [
                {"qty_range": "1–9",    "discount": "3%",  "margin_floor": "12%"},
                {"qty_range": "10–24",  "discount": "5%",  "margin_floor": "11%"},
                {"qty_range": "25–49",  "discount": "7%",  "margin_floor": "10%"},
                {"qty_range": "50+",    "discount": "9%",  "margin_floor": "9%"},
            ],
            "Contractor": [
                {"qty_range": "1–9",   "discount": "2%",  "margin_floor": "13%"},
                {"qty_range": "10–24", "discount": "4%",  "margin_floor": "12%"},
                {"qty_range": "25–49", "discount": "6%",  "margin_floor": "11%"},
                {"qty_range": "50+",   "discount": "8%",  "margin_floor": "10%"},
            ],
            "Plumber/Installer": [
                {"qty_range": "1–9",   "discount": "3%",  "margin_floor": "12%"},
                {"qty_range": "10–24", "discount": "5%",  "margin_floor": "11%"},
                {"qty_range": "25+",   "discount": "7%",  "margin_floor": "10%"},
            ],
            "Retailer": [
                {"qty_range": "1–9",   "discount": "2%",  "margin_floor": "13%"},
                {"qty_range": "10–24", "discount": "3%",  "margin_floor": "12%"},
                {"qty_range": "25+",   "discount": "5%",  "margin_floor": "11%"},
            ],
        },
        "category_overrides": [
            {"category": "Sanitary CP Fittings",     "max_discount": "8%",  "margin_floor": "12%", "note": "28-34% natural margin — good room"},
            {"category": "Premium Hardware (Hafele/Hettich/Blum)", "max_discount": "6%", "margin_floor": "14%", "note": "Premium brand — protect margin"},
            {"category": "Kitchen Systems",          "max_discount": "7%",  "margin_floor": "12%", "note": "Project volumes justify moderate discount"},
            {"category": "Sanitary Ware (WC/Basins)","max_discount": "5%",  "margin_floor": "15%", "note": "Branded goods — low discount elasticity"},
            {"category": "Budget Hardware (Ebco/Dorset)", "max_discount": "10%", "margin_floor": "10%", "note": "Volume product — trade freely"},
        ],
        "product_pricing_summary": {
            "Ebco Soft-Close Hinge 35mm Pk-10":  {"buy": 350,  "sell": 485,  "natural_margin": "27.8%"},
            "Hettich InnoTech Drawer 400mm SC":   {"buy": 880,  "sell": 1280, "natural_margin": "31.3%"},
            "Jaquar Lyric Basin Mixer Chrome":    {"buy": 3200, "sell": 4850, "natural_margin": "34.0%"},
            "Hindware Smart Divertor 2-in-1":     {"buy": 1120, "sell": 1680, "natural_margin": "33.3%"},
            "Hafele Mortice Lock SS":             {"buy": 1450, "sell": 2100, "natural_margin": "31.0%"},
        },
        "kpis": {
            "avg_discount_given_mtd": "5.4%",
            "acceptance_rate":        "48%",
            "quotes_this_month":      12,
            "avg_margin_held":        "22.1%",
        },
        "recent_accepted_quotes": [
            {"customer": "Modern Kitchens Pvt Ltd", "product": "Hettich InnoTech Drawer 400mm", "qty": 40, "discount": "6%", "margin": "25.7%", "value": "Rs.0.48L"},
            {"customer": "Prestige Site Engineers", "product": "Jaquar Lyric Basin Mixer",       "qty": 12, "discount": "5%", "margin": "29.5%", "value": "Rs.0.55L"},
            {"customer": "Shivam Plumbing Works",   "product": "Hindware Smart Divertor",        "qty": 20, "discount": "7%", "margin": "26.3%", "value": "Rs.0.31L"},
        ],
        "guardrail_examples": {
            "safe":   "Jaquar Basin Mixer × 10 × Interior Firm × 5% → margin 29.5% — above 12% floor",
            "warning":"Jaquar Basin Mixer × 25 × Interior Firm × 9% → margin 25.1% — watch margin floor",
            "danger": "Hettich Drawer × 50 × Contractor × 12% → margin 19.3% — below 14% premium floor",
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


async def credit_tool(query: Optional[str] = None) -> dict:
    """Credit management: customer credit limits, utilisation, overdue accounts, PDC tracker."""
    return {
        "summary": {
            "total_credit_exposure": "₹42.8L",
            "utilised":              "₹31.4L (73%)",
            "overdue_amount":        "₹8.6L",
            "pdc_pending":           "₹5.2L (6 cheques)",
            "high_risk_accounts":    3,
        },
        "credit_limits": [
            {"customer": "Rajesh Construction Pvt Ltd",   "limit": "₹10L",  "used": "₹8.4L",  "utilisation": "84%", "status": "NEAR_LIMIT"},
            {"customer": "Modern Interiors & Designs",    "limit": "₹8L",   "used": "₹3.2L",  "utilisation": "40%", "status": "HEALTHY"},
            {"customer": "BuildRight Infrastructure Ltd", "limit": "₹15L",  "used": "₹14.1L", "utilisation": "94%", "status": "AT_LIMIT"},
            {"customer": "Skyline Contractors",           "limit": "₹6L",   "used": "₹5.8L",  "utilisation": "97%", "status": "AT_LIMIT"},
            {"customer": "Premium Architects Studio",     "limit": "₹5L",   "used": "₹1.4L",  "utilisation": "28%", "status": "HEALTHY"},
        ],
        "overdue_accounts": [
            {"customer": "BuildRight Infrastructure Ltd", "overdue_amt": "₹3.8L", "days": 62, "risk": "HIGH",   "action": "Block new orders until ₹2L cleared"},
            {"customer": "Skyline Contractors",           "overdue_amt": "₹2.4L", "days": 45, "risk": "HIGH",   "action": "Send legal notice, hold shipments"},
            {"customer": "Metro Builders & Associates",   "overdue_amt": "₹1.6L", "days": 31, "risk": "MEDIUM", "action": "Call MD directly, request PDC"},
            {"customer": "Horizon Developers",            "overdue_amt": "₹0.8L", "days": 18, "risk": "LOW",    "action": "Polite reminder, no block yet"},
        ],
        "pdc_tracker": [
            {"customer": "Rajesh Construction Pvt Ltd",   "amount": "₹1.8L", "date": "15 May 2026", "status": "UPCOMING",   "bank": "HDFC"},
            {"customer": "Modern Interiors & Designs",    "amount": "₹0.9L", "date": "20 May 2026", "status": "UPCOMING",   "bank": "SBI"},
            {"customer": "Grand Construction Corp",       "amount": "₹2.2L", "date": "28 May 2026", "status": "UPCOMING",   "bank": "ICICI"},
            {"customer": "Sunshine Interiors LLP",        "amount": "₹0.3L", "date": "05 Apr 2026", "status": "BOUNCED",    "bank": "Axis"},
        ],
        "policy": {
            "standard_credit_days": 30,
            "max_credit_days":      60,
            "interest_on_overdue":  "18% p.a. after 60 days",
            "block_threshold":      "Outstanding > 90 days OR utilisation > 95%",
        },
        "data_source": "mock",
    }


async def pos_tool(query: Optional[str] = None) -> dict:
    """Counter POS intelligence: walk-in sales, daily summary, top products, billing history."""
    return {
        "today_summary": {
            "transactions":   18,
            "gross_revenue":  "₹1.24L",
            "cash_sales":     "₹0.68L (55%)",
            "upi_sales":      "₹0.44L (35%)",
            "card_sales":     "₹0.12L (10%)",
            "avg_bill_value": "₹6,880",
            "returns":        2,
            "return_value":   "₹8,400",
        },
        "top_products_today": [
            {"name": "Ebco Soft-Close Hinge 35mm Pk-10",      "qty": 32, "revenue": "₹15,520", "margin": "28.4%"},
            {"name": "Jaquar Lyric Basin Mixer Chrome",        "qty":  6, "revenue": "₹29,100", "margin": "34.2%"},
            {"name": "Hettich InnoTech Drawer Sys 400mm",      "qty":  9, "revenue": "₹11,520", "margin": "31.1%"},
            {"name": "Hafele Zinc D-Handle 128mm (pair)",      "qty": 28, "revenue": "₹8,960",  "margin": "29.6%"},
            {"name": "Hindware Aura Concealed Stop Cock DN15", "qty": 14, "revenue": "₹11,060", "margin": "27.8%"},
        ],
        "walk_in_trend": {
            "today": 18, "yesterday": 15, "week_avg": 16,
            "peak_hours": "10AM–12PM and 4PM–6PM",
            "busiest_day": "Saturday (avg 28 transactions)",
        },
        "recent_transactions": [
            {"bill": "B-2048", "customer": "Walk-in",                   "amount": "₹14,850", "items": 4, "payment": "Cash",   "time": "11:42 AM"},
            {"bill": "B-2047", "customer": "Raju Plumbing Works",       "amount": "₹9,720",  "items": 3, "payment": "UPI",    "time": "11:18 AM"},
            {"bill": "B-2046", "customer": "Walk-in",                   "amount": "₹4,850",  "items": 1, "payment": "Cash",   "time": "10:55 AM"},
            {"bill": "B-2045", "customer": "Mehta Kitchen & Bath Studio","amount": "₹38,400", "items": 8, "payment": "Card",   "time": "10:22 AM"},
        ],
        "low_stock_alerts_at_counter": [
            {"sku": "Ebco Soft-Close Hinge 35mm Pk-10",   "counter_stock": 6,  "reorder_flag": True},
            {"sku": "Jaquar Lyric Basin Mixer Chrome",     "counter_stock": 2,  "reorder_flag": True},
            {"sku": "Hafele Zinc D-Handle 128mm",          "counter_stock": 8,  "reorder_flag": False},
        ],
        "data_source": "mock",
    }


async def warehouse_tool(query: Optional[str] = None) -> dict:
    """Warehouse management: godown capacity, utilisation, stock distribution, GRN activity."""
    if _DB_LAYER_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            SELECT g.godown_id, g.godown_name, g.location, g.capacity_sheets, g.manager_name,
                                   COALESCE(SUM(s.quantity), 0) AS current_stock,
                                   COALESCE(SUM(s.quantity * p.buy_price), 0) AS stock_value
                            FROM godowns g
                            LEFT JOIN stock s ON s.godown_id = g.godown_id
                            LEFT JOIN products p ON p.product_id = s.product_id
                            WHERE g.is_active = 1
                            GROUP BY g.godown_id
                        """)
                        rows = await cur.fetchall()
                        if rows:
                            cols = [d[0] for d in cur.description]
                            whs = [dict(zip(cols, r)) for r in rows]
                            total_cap = sum(w["capacity_sheets"] for w in whs)
                            total_stock = sum(w["current_stock"] for w in whs)
                            return {
                                "warehouses": [
                                    {
                                        "name": w["godown_name"],
                                        "location": w["location"],
                                        "capacity": w["capacity_sheets"],
                                        "stock": w["current_stock"],
                                        "utilisation_pct": round(w["current_stock"] / w["capacity_sheets"] * 100, 1) if w["capacity_sheets"] else 0,
                                        "value": f"₹{w['stock_value'] / 100000:.2f}L",
                                        "manager": w["manager_name"],
                                    }
                                    for w in whs
                                ],
                                "summary": {
                                    "total_warehouses": len(whs),
                                    "total_capacity_sheets": total_cap,
                                    "total_stock_sheets": total_stock,
                                    "overall_utilisation": f"{round(total_stock / total_cap * 100, 1) if total_cap else 0}%",
                                },
                                "data_source": "mysql",
                            }
        except Exception as exc:
            logger.warning("warehouse_tool DB query failed: %s", exc)

    # Mock fallback — 3 warehouses with hardware+sanitary profile
    return {
        "warehouses": [
            {
                "name": "Main Godown — Whitefield",
                "location": "Whitefield Industrial Area, Bangalore",
                "capacity": 5000,
                "stock": 3840,
                "utilisation_pct": 76.8,
                "value": "₹38.6L",
                "manager": "Rajesh Kumar",
                "top_skus": ["Ebco Soft-Close Hinge 35mm", "Hettich InnoTech Drawer 400mm", "Jaquar Lyric Basin Mixer"],
            },
            {
                "name": "Transit Hub — Koramangala",
                "location": "Koramangala 6th Block, Bangalore",
                "capacity": 1000,
                "stock": 320,
                "utilisation_pct": 32.0,
                "value": "₹4.8L",
                "manager": "Suresh Nair",
                "note": "Staging area for city deliveries — typical 2–3 day hold",
            },
            {
                "name": "Counter Stock — Showroom",
                "location": "Showroom Floor, Whitefield",
                "capacity": 200,
                "stock": 164,
                "utilisation_pct": 82.0,
                "value": "₹3.2L",
                "manager": "Priya Iyer",
                "note": "Counter stock replenished from Main Godown daily",
            },
        ],
        "summary": {
            "total_warehouses": 3,
            "total_capacity_sheets": 6200,
            "total_stock_sheets": 4324,
            "overall_utilisation": "69.7%",
            "available_capacity": "1876 sheets free",
            "near_capacity_alert": "Counter Stock at 82% — replenish Ebco hinges and Jaquar mixers",
        },
        "grn_activity": {
            "this_week": 8,
            "mismatches": 2,
            "top_supplier_this_week": "Ebco India (₹1.2L received)",
        },
        "data_source": "mock",
    }


async def schemes_tool(query: Optional[str] = None) -> dict:
    """Scheme management: supplier promotions, sales targets, accruals, loyalty schemes."""
    return {
        "active_schemes": [
            {
                "scheme_id":   "SCH-Q1-2026",
                "name":        "Ebco Q1 FY26 Volume Bonus",
                "supplier":    "Ebco India",
                "type":        "VOLUME_TARGET",
                "period":      "Q1 FY26 (Apr–Jun 2026)",
                "target":      "₹18L purchases",
                "achieved":    "₹13.4L (74.4%)",
                "reward":      "3.5% cash rebate on target achievement",
                "est_payout":  "₹63,000 on full achievement",
                "status":      "ON_TRACK",
                "days_left":   49,
            },
            {
                "scheme_id":   "SCH-ANN-2026",
                "name":        "Jaquar Premier Partner Annual FY26",
                "supplier":    "Jaquar India",
                "type":        "LOYALTY_ANNUAL",
                "period":      "FY26 (Apr 2025–Mar 2026)",
                "target":      "₹30L purchases",
                "achieved":    "₹21.6L (72%)",
                "reward":      "2% accrual on all CP fittings + display support",
                "est_payout":  "₹60,000 accrual + ₹15,000 display kit",
                "status":      "ON_TRACK",
            },
            {
                "scheme_id":   "SCH-PROMO-05",
                "name":        "Hindware May Monsoon Push",
                "supplier":    "Hindware",
                "type":        "PROMO_MONTH",
                "period":      "May 2026",
                "target":      "60 units concealed cisterns + stop cocks",
                "achieved":    "27 units (45%)",
                "reward":      "₹350/unit cash discount on full achievement",
                "est_payout":  "₹21,000",
                "status":      "AT_RISK",
                "days_left":   19,
            },
            {
                "scheme_id":   "SCH-HTT-Q1",
                "name":        "Hettich Q1 Modular Growth Bonus",
                "supplier":    "Hettich India",
                "type":        "VOLUME_TARGET",
                "period":      "Q1 FY26 (Apr–Jun 2026)",
                "target":      "₹10L drawer system purchases",
                "achieved":    "₹9.1L (91%)",
                "reward":      "4% credit note on full achievement",
                "est_payout":  "₹40,000 credit note",
                "status":      "ON_TRACK",
                "days_left":   49,
            },
        ],
        "target_summary": {
            "schemes_active":       4,
            "schemes_achieved":     0,
            "schemes_at_risk":      1,
            "total_payout_est":     "₹1.84L",
            "total_payout_secured": "₹1.20L (accruals + Hettich near-complete)",
        },
        "accrual_ledger": [
            {"supplier": "Jaquar India",  "month": "Apr 2026", "purchases": "₹5.8L",  "accrual_rate": "2%",   "accrual_amt": "₹11,600"},
            {"supplier": "Jaquar India",  "month": "Mar 2026", "purchases": "₹6.4L",  "accrual_rate": "2%",   "accrual_amt": "₹12,800"},
            {"supplier": "Ebco India",    "month": "Apr 2026", "purchases": "₹7.2L",  "accrual_rate": "3.5%", "accrual_amt": "₹25,200"},
            {"supplier": "Hettich India", "month": "Apr 2026", "purchases": "₹4.6L",  "accrual_rate": "4%",   "accrual_amt": "₹18,400"},
        ],
        "recommendations": [
            "Push ₹4.6L more Ebco hardware in 49 days to lock ₹63,000 Q1 bonus — focus soft-close hinges and drawer slides",
            "Hindware May promo: need 33 more concealed cisterns in 19 days — call top 5 plumbers and bathroom contractors",
            "Hettich Q1 scheme at 91% — place one more ₹0.9L PO to secure ₹40,000 credit note",
            "Jaquar loyalty on track — maintain ₹5.5L+/month purchase velocity through Jun",
        ],
        "data_source": "mock",
    }


TOOLS = {
    "stock":     stock_tool,
    "demand":    demand_tool,
    "supplier":  supplier_tool,
    "customer":  customer_tool,
    "finance":   finance_tool,
    "order":     order_tool,
    "freight":   freight_tool,
    "email":     email_tool,
    "po_grn":    po_grn_tool,
    "sales":     sales_tool,
    "inward":    inward_tool,
    "discount":  discount_tool,
    "louvers":   louvers_tool,
    "quotes":    quotes_tool,
    "projects":  projects_tool,
    "catalog":   catalog_tool,
    "credit":    credit_tool,
    "pos":       pos_tool,
    "schemes":   schemes_tool,
    "warehouse": warehouse_tool,
}
