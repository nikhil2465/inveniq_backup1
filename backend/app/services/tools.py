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
        "total_stock_value": "Rs.46.2L",
        "critical_low": [
            {"sku": "Hindalco Z-Section Louver Blade 75×25mm 6m", "brand": "Hindalco", "stock": 38, "days_cover": 6,
             "daily_sale": 7, "reorder_level": 60, "lead_time": "5 days", "revenue_at_risk": "Rs.1.8L"},
            {"sku": "Alucobond 4mm ACP Sheet Silver Metallic 1220×2440mm", "brand": "Alucobond", "stock": 14, "days_cover": 8,
             "daily_sale": 2, "reorder_level": 20, "lead_time": "7 days", "revenue_at_risk": "Rs.1.5L"},
        ],
        "dead_stock": [
            {"sku": "PVC Louver Blade 100mm (discontinued model)", "days_old": 110, "stock": 24, "value": "Rs.2.1L",
             "last_sale": "No movement in 100+ days", "action": "15% discount to façade contractors; offer as budget alternative"},
            {"sku": "Alucobond 3mm ACP Gold Mirror Finish (discontinued)", "days_old": 92, "stock": 18, "value": "Rs.1.64L",
             "last_sale": "1 sheet in 60 days", "action": "Bundle with standard ACP for project deals at 12% discount"},
            {"sku": "Merino HPL Abstract Art Print 1mm (low-demand print)", "days_old": 78, "stock": 42, "value": "Rs.0.94L",
             "last_sale": "4 sheets in 30 days", "action": "Offer to interior designers at 10% discount"},
        ],
        "overstock": [
            {"sku": "Alucoil 3mm ACP Off-White Matt (excess)", "stock": 32, "days_cover": 38, "value": "Rs.1.12L"},
            {"sku": "Aluminium C-Channel 40×40mm 6m (slow season)", "stock": 210, "days_cover": 46, "value": "Rs.0.67L"},
        ],
        "healthy_skus": [
            "Greenlam HPL 1mm Teak 8×4ft (19d cover)",
            "Aerofoil Louver Blade 150mm Anodized 6m (16d cover)",
            "Merino HPL 1mm Walnut 8×4ft (21d cover)",
        ],
        "inventory_accuracy": "96.8%",
        "stock_turnover": "4.8x",
        "gmroi": "Rs.2.06",
        "godowns": {
            "Main Godown (Peenya)":      {"value": "Rs.32.4L", "units": 5120, "capacity_pct": 81},
            "Display Centre (HSR Layout)":{"value": "Rs.9.6L",  "units": 480,  "capacity_pct": 58},
            "Transit Hub (Koramangala)": {"value": "Rs.4.2L",  "units": 320,  "capacity_pct": 34},
        },
        "abc_class": {
            "A_skus": [
                "Hindalco Z-Section Louver Blade 75×25mm 6m",
                "Alucobond 4mm ACP Sheet Silver Metallic",
                "Greenlam HPL 1mm Compact Sheet Teak",
                "Aerofoil Louver Blade 150mm Anodized 6m",
            ],
            "A_revenue_share": "74%", "B_count": 12, "C_count": 38,
        },
        "true_landed_cost": {
            "Alucobond 4mm ACP Silver Metallic": {"buy": 2300, "freight": 120, "loading": 35, "wastage": 48, "true_cost": 2503, "sell": 3200, "real_margin": "21.8%", "stated_margin": "28.1%"},
            "Hindalco Z-Section Louver 75×25mm":  {"buy": 340,  "freight": 18,  "loading": 8,  "wastage": 0,  "true_cost": 366,  "sell": 485,  "real_margin": "24.5%", "stated_margin": "29.9%"},
            "Greenlam HPL 1mm Teak 8×4ft":        {"buy": 1250, "freight": 62,  "loading": 14, "wastage": 22, "true_cost": 1348, "sell": 1850, "real_margin": "27.1%", "stated_margin": "32.4%"},
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
            {"sku": "Hindalco Z-Section Louver Blade 75×25mm 6m", "curr": 420, "f30": 540, "f60": 620, "f90": 580,
             "signal": "SURGE +28.6%", "action": "Pre-order 300 extra pieces NOW — pre-monsoon façade project rush starting"},
            {"sku": "Alucobond 4mm ACP Sheet Silver Metallic", "curr": 62, "f30": 68, "f60": 58, "f90": 52,
             "signal": "STABLE +9.7%", "action": "Normal ordering cycle — maintain 20-sheet buffer for project deliveries"},
            {"sku": "Greenlam HPL 1mm Teak 8×4ft", "curr": 186, "f30": 224, "f60": 260, "f90": 280,
             "signal": "GROWING +20.4%", "action": "Increase stock by 35% — interior laminate demand rising with new commercial completions"},
            {"sku": "PVC Louver Blade 100mm (old model)", "curr": 6, "f30": 4, "f60": 2, "f90": 0,
             "signal": "DECLINING -33%", "action": "Liquidate remaining stock at 15% discount — aluminium blades have fully replaced PVC in market"},
        ],
        "seasonal_insight": "Apr-Jun pre-monsoon peak (+35-45%) for ACP cladding and aluminium louvers — façade contractors rush to complete exterior work before rains. Oct-Nov: interior laminate surge (+28-35%) for commercial fit-outs. Jan-Mar: commercial construction completions drive all-category demand +20-25%.",
        "demand_drivers": [
            "Pre-monsoon façade project completions — ACP and aluminium louver demand surging in Peenya/Whitefield belt",
            "New commercial parks (Brigade Gateway, Embassy Tech Village) specifying Alucobond and Hindalco aluminium systems",
            "Interior designers shifting from PVC to aluminium and HPL — premium material upgrade trend",
        ],
        "risk_factors": [
            "Hindalco LME aluminium price up 8% — review buy prices and pass on selectively to project customers",
            "Alucobond India extended lead times to 14 days (from 7) — order earlier for committed projects",
            "Monsoon (Jul-Sep): exterior façade installs slow dramatically — ACP/louver demand drops 40-50%",
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
                "name": "Hindalco Industries Ltd", "on_time_pct": 94, "avg_delay_days": 0.5,
                "price_vs_market": "-1% (LME-linked pricing — very competitive)", "lead_time": "4-5 days",
                "freight_cost": "Rs.1.2/piece (free freight above Rs.2L order)", "grn_match_rate": "99%",
                "recommendation": "PREFERRED — expand aluminium profile orders",
                "open_pos": 3, "pending_value": "Rs.8.4L",
            },
            {
                "name": "Greenlam Industries Ltd", "on_time_pct": 91, "avg_delay_days": 0.9,
                "price_vs_market": "+2% (brand premium — justified by quality)",
                "lead_time": "5-7 days", "freight_cost": "Rs.2.4/sheet", "grn_match_rate": "97%",
                "recommendation": "PREFERRED — primary HPL/laminate supplier",
                "open_pos": 2, "pending_value": "Rs.5.2L",
            },
            {
                "name": "Alucobond India (3A Composites)", "on_time_pct": 89, "avg_delay_days": 1.2,
                "price_vs_market": "+1% (standard market rate)", "lead_time": "7-10 days",
                "freight_cost": "Rs.3.8/sheet", "grn_match_rate": "96%",
                "recommendation": "GOOD — primary ACP panel supplier",
                "open_pos": 2, "pending_value": "Rs.6.1L",
            },
            {
                "name": "Viva Composite Panel Pvt Ltd", "on_time_pct": 74, "avg_delay_days": 3.1,
                "price_vs_market": "+5% (above market for quality received)", "lead_time": "10-14 days",
                "freight_cost": "Rs.4.8/sheet (partial loads — 310 km)",
                "true_landed_premium": "+12% above market when freight included",
                "grn_match_rate": "82% (18% mismatch rate)", "delivery_failures_month": 2,
                "recommendation": "REVIEW — delivery reliability needs improvement",
                "open_pos": 1, "pending_value": "Rs.2.8L",
                "overdue": "PO-9124 overdue 4 days",
            },
        ],
        "total_open_pos": 8,
        "open_po_value": "Rs.22.5L",
        "overdue_pos": ["PO-9124 (Viva Composite, +4d)", "PO-9118 (Alucobond, +2d)"],
        "grn_match_rate": "94%",
        "mismatches_month": "2 (Rs.8,400 total)",
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
            "Façade Contractors (35%)":   {"avg_margin": "22%", "avg_dso": 38, "top": "Prestige Façade Systems Rs.5.8L/mo"},
            "Architects & Design Firms (28%)": {"avg_margin": "31%", "avg_dso": 24, "top": "Studio Morphogenesis Rs.3.4L/mo"},
            "Real Estate Developers (18%)":    {"avg_margin": "24%", "avg_dso": 46, "top": "Brigade Enterprises Rs.4.2L/mo"},
            "Interior Designers (12%)":   {"avg_margin": "32%", "avg_dso": 22, "top": "Livspace Design Studio Rs.1.8L/mo"},
            "MEP Contractors (7%)":       {"avg_margin": "20%", "avg_dso": 42, "top": "Alpha MEP Works Rs.0.9L/mo"},
        },
        "at_risk": [
            {"name": "Prestige Façade Systems", "days_silent": 42, "monthly_value": "Rs.5.8L",
             "margin": "22.4%", "reason": "Possibly sourcing Hindalco profiles direct — large account at risk"},
            {"name": "Skyline ACP Contractors", "days_silent": 36, "monthly_value": "Rs.2.2L",
             "reason": "Price complaint — ACP sheet thickness discrepancy on last GRN"},
        ],
        "overdue_receivables": [
            {"customer": "Brigade Enterprises Ltd",  "amount": "Rs.4.2L", "days_overdue": 82, "risk": "HIGH"},
            {"customer": "Metro Façade Contractors", "amount": "Rs.2.8L", "days_overdue": 54, "risk": "HIGH"},
            {"customer": "Horizon Developers",       "amount": "Rs.2.1L", "days_overdue": 45, "risk": "MEDIUM"},
            {"customer": "Coastal MEP Works",        "amount": "Rs.1.4L", "days_overdue": 32, "risk": "LOW"},
            {"customer": "Others (11 accounts)",     "amount": "Rs.4.9L", "days_overdue": "<30", "risk": "LOW"},
        ],
        "total_outstanding": "Rs.15.4L",
        "discount_leakage": {
            "Brigade Enterprises Ltd":   "9.2% avg vs 6% standard — costs Rs.22,600/month",
            "Metro Façade Contractors":  "7.4% — costs Rs.11,400/month",
        },
        "data_source": "mock",
    }


async def finance_tool(query: Optional[str] = None) -> dict:
    """Financial KPIs, GST status, working capital, profitability."""
    db_result = await _try_db("query_finance", query or "")
    if db_result:
        return db_result
    return {
        "revenue_mtd": "Rs.34.6L",
        "revenue_growth": "+13.2% MoM",
        "gross_profit_mtd": "Rs.9.13L",
        "gross_margin": "26.4%",
        "working_capital_days": 52,
        "cash_cycle": "DIO 22 + DSO 38 - DPO 8 = 52 days (target <45 — project billing cycles are longer)",
        "outstanding_receivables": "Rs.15.4L",
        "dead_stock_locked": "Rs.4.68L",
        "net_operating_cash": "Rs.6.8L",
        "gst": {
            "output_collected": "Rs.6.23L",
            "itc_available": "Rs.4.96L",
            "net_payable": "Rs.1.27L",
            "unclaimed_itc": "Rs.0.18L (2 Viva Composite invoices missing from GSTR-2B)",
            "gstr1": "Filed", "gstr3b": "PENDING -- due 20 May",
            "ewaybills_expiring_today": 2,
        },
        "margin_by_sku": {
            "Hindalco Z-Section Louver 75×25mm":      "24.5% (true landed — freight factored)",
            "Alucobond 4mm ACP Silver Metallic":       "21.8% (true landed — freight Rs.120/sheet pulls margin down from 28%)",
            "Greenlam HPL 1mm Teak 8×4ft":            "27.1%",
            "Aerofoil Louver Blade 150mm Anodized":    "26.8%",
            "Merino HPL 1mm Walnut 8×4ft":            "26.2%",
            "PVC Louver Blade 100mm (dead stock)":    "4.8% WATCH (slow mover — holding cost eroding margin)",
        },
        "returns_mtd": "Rs.0.84L",
        "return_causes": ["ACP sheet thickness not as specified Rs.0.42L", "Wrong profile section delivered Rs.0.28L", "Excess order on project cancellation Rs.0.14L"],
        "data_source": "mock",
    }


async def order_tool(query: Optional[str] = None) -> dict:
    """Order pipeline, fulfilment SLA, dispatch status."""
    db_result = await _try_db("query_order", query or "")
    if db_result:
        return db_result
    return {
        "today_orders": 22,
        "dispatched": 17,
        "pending": 5,
        "pending_details": [
            {"order": "ORD-4218", "customer": "Prestige Façade Systems", "value": "Rs.4.2L",
             "delayed": "22 hours", "reason": "Hindalco Z-Section critically low — awaiting urgent PO from Peenya"},
            {"order": "ORD-4224", "customer": "Brigade Enterprises Ltd", "value": "Rs.2.8L",
             "delayed": "8 hours", "reason": "Alucobond 4mm Silver ACP — QC inspection pending on freshly arrived GRN"},
        ],
        "dispatch_sla_hit": "89% (target 95% — large-profile loads need longer loading times)",
        "avg_fulfillment_time": "3.4 hours",
        "order_trend": "+3 vs yesterday",
        "issues": [
            "Hindalco Z-Section stockout causing delays on 2 façade contractor orders — raise emergency PO today",
            "1 wrong-profile picking error this week (75×25mm vs 75×50mm Z-section — similar bundles)",
            "Prestige Façade Systems order delayed 22 hrs — Rs.5.8L/month account at risk of switching to direct mill purchase",
        ],
        "data_source": "mock",
    }


async def freight_tool(query: Optional[str] = None) -> dict:
    """Freight costs, vehicle utilisation, lane analysis, consolidation opportunities."""
    db_result = await _try_db("query_freight", query or "")
    if db_result:
        return db_result
    return {
        "outbound_cost_per_delivery": "Rs.1,240 avg per order (target Rs.980 — large-format profile loads)",
        "vehicle_utilisation": "68% (target 82% — ACP panels need flat-bed trucks, reduce partial loads)",
        "inbound_costs": {
            "Hindalco Industries Ltd":        "Rs.1.2/piece (free freight above Rs.2L order — bundle profiles)",
            "Greenlam Industries Ltd":        "Rs.2.4/sheet (standard — acceptable for HPL)",
            "Alucobond India (3A Composites)":"Rs.3.8/sheet (ACP panels — negotiate free freight above Rs.3L)",
            "Viva Composite Panel Pvt Ltd":   "Rs.4.8/sheet (310 km, partial loads — very high, true margin shrinks)",
        },
        "outbound_lanes": [
            {"lane": "Peenya / Rajajinagar",  "cost_per_delivery": 680,  "fill_pct": 86, "status": "BEST"},
            {"lane": "Whitefield Tech Park",   "cost_per_delivery": 820,  "fill_pct": 78, "status": "OK"},
            {"lane": "HSR / Koramangala",      "cost_per_delivery": 940,  "fill_pct": 72, "status": "OK"},
            {"lane": "Electronic City",        "cost_per_delivery": 1240, "fill_pct": 62, "status": "HIGH"},
            {"lane": "Hosur Road / Chandapura","cost_per_delivery": 1680, "fill_pct": 48, "status": "WORST"},
        ],
        "consolidation_opportunity": "Merge 3 Whitefield project deliveries today (Brigade + Prestige + Alpha MEP) — save Rs.4,200 on flat-bed truck",
        "today_savings_potential": "Rs.4,200",
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
                "po_number": "PO-9124", "supplier": "Viva Composite Panel Pvt Ltd",
                "sku": "Viva ACP 4mm Ivory White 1220×2440mm", "qty_ordered": 40, "qty_received": 18,
                "fill_pct": 45, "value": "Rs.1.28L", "status": "OVERDUE", "overdue_days": 4,
            },
            {
                "po_number": "PO-9118", "supplier": "Alucobond India (3A Composites)",
                "sku": "Alucobond 4mm ACP Silver Metallic 1220×2440mm", "qty_ordered": 60, "qty_received": 38,
                "fill_pct": 63, "value": "Rs.3.84L", "status": "PARTIAL", "overdue_days": 0,
            },
            {
                "po_number": "PO-9112", "supplier": "Hindalco Industries Ltd",
                "sku": "Hindalco Z-Section Louver Blade 75×25mm 6m", "qty_ordered": 300, "qty_received": 180,
                "fill_pct": 60, "value": "Rs.2.19L", "status": "PARTIAL", "overdue_days": 0,
            },
        ],
        "grn_discrepancies": [
            {
                "grn_number": "GRN-6108", "po_number": "PO-9098",
                "supplier": "Viva Composite Panel Pvt Ltd", "discrepancy_amt": "Rs.5,600",
                "notes": "ACP thickness 3.2mm received vs 4mm ordered — structural spec mismatch for project use",
                "action": "Full Return & Reorder from Alucobond",
            },
            {
                "grn_number": "GRN-6102", "po_number": "PO-9084",
                "supplier": "Alucobond India", "discrepancy_amt": "Rs.2,800",
                "notes": "Short by 5 sheets — invoice shows 30 sheets, received 25",
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
        "revenue_mtd": "Rs.34.6L",
        "orders_mtd": 428,
        "avg_order_value": "Rs.80,840",
        "monthly_revenue": [
            {"month": "May", "revenue": 22.4}, {"month": "Jun", "revenue": 28.8},
            {"month": "Jul", "revenue": 18.6}, {"month": "Aug", "revenue": 19.4},
            {"month": "Sep", "revenue": 20.8}, {"month": "Oct", "revenue": 26.4},
            {"month": "Nov", "revenue": 28.2}, {"month": "Dec", "revenue": 27.6},
            {"month": "Jan", "revenue": 28.8}, {"month": "Feb", "revenue": 30.2},
            {"month": "Mar", "revenue": 31.8}, {"month": "Apr", "revenue": 34.6},
        ],
        "day_of_week": [
            {"day": "Mon", "avg": 62.4}, {"day": "Wed", "avg": 78.8}, {"day": "Fri", "avg": 94.2},
        ],
        "top_sku": "Hindalco Z-Section Louver Blade 75×25mm 6m",
        "revenue_growth": "+13.2% MoM",
        "category_split": {
            "Aluminium Louvers & Profiles (Hindalco/National Aluminium)": "45%",
            "ACP Panels & Cladding (Alucobond/Alucoil/Alstrong)": "25%",
            "HPL Laminates & Surfaces (Greenlam/Merino/Century)": "18%",
            "Operable Louver Systems & Accessories": "12%",
        },
        "data_source": "mock",
    }


async def inward_tool(query: Optional[str] = None) -> dict:
    """Inward/outward stock movements, GRN summary, shrinkage."""
    db_result = await _try_db("query_inward", query or "")
    if db_result:
        return db_result
    return {
        "inward_today": "Rs.9.8L",
        "outward_today": "Rs.11.4L",
        "inward_count": 8,
        "outward_count": 14,
        "shrinkage_mtd": "Rs.0.28L",
        "qc_pass_rate": "93%",
        "recent_grn": [
            {"grn": "GRN-6112", "supplier": "Hindalco Industries Ltd",        "value": "Rs.4.8L", "status": "MATCH",    "date": "today"},
            {"grn": "GRN-6111", "supplier": "Greenlam Industries Ltd",        "value": "Rs.3.2L", "status": "MATCH",    "date": "today"},
            {"grn": "GRN-6110", "supplier": "Viva Composite Panel Pvt Ltd",   "value": "Rs.1.8L", "status": "MISMATCH", "date": "today"},
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
            "Category rules override segment rules when both match. Aluminium profiles: 22-30% natural margin. ACP panels: 20-28%. HPL laminates: 26-34%."
        ),
        "rules_by_segment": {
            "Façade Contractor": [
                {"qty_range": "1–49",    "discount": "3%",  "margin_floor": "12%"},
                {"qty_range": "50–149",  "discount": "5%",  "margin_floor": "11%"},
                {"qty_range": "150–299", "discount": "7%",  "margin_floor": "10%"},
                {"qty_range": "300+",    "discount": "9%",  "margin_floor": "9%"},
            ],
            "Architect/Design Firm": [
                {"qty_range": "1–49",   "discount": "2%",  "margin_floor": "14%"},
                {"qty_range": "50–149", "discount": "4%",  "margin_floor": "13%"},
                {"qty_range": "150–299","discount": "6%",  "margin_floor": "12%"},
                {"qty_range": "300+",   "discount": "8%",  "margin_floor": "11%"},
            ],
            "Developer/Builder": [
                {"qty_range": "1–49",   "discount": "3%",  "margin_floor": "12%"},
                {"qty_range": "50–149", "discount": "5%",  "margin_floor": "11%"},
                {"qty_range": "150+",   "discount": "7%",  "margin_floor": "10%"},
            ],
            "Interior Designer": [
                {"qty_range": "1–29",   "discount": "2%",  "margin_floor": "15%"},
                {"qty_range": "30–99",  "discount": "4%",  "margin_floor": "13%"},
                {"qty_range": "100+",   "discount": "6%",  "margin_floor": "12%"},
            ],
        },
        "category_overrides": [
            {"category": "Aluminium Louver Profiles (Hindalco)",  "max_discount": "8%",  "margin_floor": "10%", "note": "LME-linked price — protect floor margin"},
            {"category": "ACP Panels (Alucobond/Premium)",        "max_discount": "6%",  "margin_floor": "12%", "note": "Premium brand — freight eats margin quickly"},
            {"category": "ACP Panels (Budget/Viva/Alucoil)",      "max_discount": "10%", "margin_floor": "9%",  "note": "Volume product — trade more freely"},
            {"category": "HPL Laminates (Greenlam/Merino)",       "max_discount": "7%",  "margin_floor": "13%", "note": "Good margins — room to discount on volume"},
            {"category": "Operable Louver Systems",               "max_discount": "5%",  "margin_floor": "15%", "note": "Low volume, high value — protect margin"},
        ],
        "product_pricing_summary": {
            "Hindalco Z-Section Louver Blade 75×25mm 6m": {"buy": 340,  "sell": 485,  "natural_margin": "29.9%"},
            "Alucobond 4mm ACP Silver Metallic 1220×2440":{"buy": 2300, "sell": 3200, "natural_margin": "28.1%"},
            "Greenlam HPL 1mm Teak 8×4ft":               {"buy": 1250, "sell": 1850, "natural_margin": "32.4%"},
            "Aerofoil Louver Blade 150mm Anodized 6m":   {"buy": 480,  "sell": 680,  "natural_margin": "29.4%"},
            "Merino HPL 1mm Walnut 8×4ft":               {"buy": 1180, "sell": 1720, "natural_margin": "31.4%"},
        },
        "kpis": {
            "avg_discount_given_mtd": "5.8%",
            "acceptance_rate":        "52%",
            "quotes_this_month":      18,
            "avg_margin_held":        "21.4%",
        },
        "recent_accepted_quotes": [
            {"customer": "Prestige Façade Systems", "product": "Hindalco Z-Section Louver 75×25mm", "qty": 500,  "discount": "7%", "margin": "23.1%", "value": "Rs.2.26L"},
            {"customer": "Brigade Enterprises Ltd", "product": "Alucobond 4mm ACP Silver Metallic", "qty": 80,   "discount": "5%", "margin": "23.7%", "value": "Rs.2.43L"},
            {"customer": "Livspace Design Studio",  "product": "Greenlam HPL 1mm Teak 8×4ft",       "qty": 60,   "discount": "6%", "margin": "27.1%", "value": "Rs.1.04L"},
        ],
        "guardrail_examples": {
            "safe":   "Alucobond ACP × 40 sheets × Façade Contractor × 5% → margin 23.7% — above 12% floor",
            "warning":"Hindalco Z-Section × 300 pcs × Façade Contractor × 9% → margin 21.2% — watch margin floor",
            "danger": "Alucobond ACP × 100 × Developer × 12% → margin 16.8% — below 12% premium floor",
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
        # Payment status summary from orders
        delivered_unpaid = [o for o in orders if o.get("status") == "DELIVERED" and o.get("payment_status", "UNPAID") == "UNPAID"]
        partial_paid     = [o for o in orders if o.get("payment_status") == "PARTIAL"]
        unpaid_value     = sum(float(o.get("total_value", 0)) for o in delivered_unpaid)
        return {
            "summary": {
                "active_orders":          kpis.get("active_orders"),
                "order_revenue_mtd":      f"₹{kpis.get('order_revenue',0)/100000:.2f}L",
                "avg_margin":             f"{kpis.get('avg_margin_pct',0)}%",
                "pipeline_value":         f"₹{kpis.get('pipeline_value',0)/100000:.2f}L",
                "claims_pending":         f"₹{kpis.get('claims_pending',0)/100000:.2f}L",
                "rebate_liability":       f"₹{kpis.get('rebate_liability',0)/100000:.2f}L",
                "delivered_unpaid_count": len(delivered_unpaid),
                "delivered_unpaid_value": f"₹{unpaid_value/100000:.2f}L",
                "partial_payment_count":  len(partial_paid),
            },
            "top_orders": [{"#": o["order_number"], "customer": o["customer_name"],
                            "product": o["product_name"], "value": f"₹{o['total_value']/100000:.2f}L",
                            "status": o["status"], "payment_status": o.get("payment_status", "UNPAID")}
                           for o in orders[:5]],
            "delivered_unpaid_orders": [
                {"#": o["order_number"], "customer": o["customer_name"],
                 "value": f"₹{o['total_value']/100000:.2f}L", "delivery_date": o.get("delivery_date", ""),
                 "payment_status": o.get("payment_status", "UNPAID")}
                for o in delivered_unpaid[:5]
            ],
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
            {"name": "Hindalco Z-Section Louver Blade 150mm",     "qty": 18, "revenue": "₹22,680", "margin": "27.2%"},
            {"name": "Greenlam HPL Sheet 1mm Ivory Matt 8×4ft",   "qty":  6, "revenue": "₹18,900", "margin": "30.8%"},
            {"name": "Aerofoil Louver Blade 200mm Anodised",       "qty": 12, "revenue": "₹31,200", "margin": "28.5%"},
            {"name": "Merino HPL Sheet 0.8mm Concrete Grey 8×4ft","qty":  5, "revenue": "₹14,250", "margin": "31.4%"},
            {"name": "ACP Panel Fixing Rivets Box-500",            "qty": 24, "revenue": "₹6,720",  "margin": "38.2%"},
        ],
        "walk_in_trend": {
            "today": 18, "yesterday": 15, "week_avg": 16,
            "peak_hours": "9AM–11AM and 3PM–5PM",
            "busiest_day": "Saturday (avg 22 transactions — architects visit site after week review)",
        },
        "recent_transactions": [
            {"bill": "B-2048", "customer": "Walk-in",                       "amount": "₹22,680", "items": 2, "payment": "Cash",   "time": "11:42 AM"},
            {"bill": "B-2047", "customer": "Prestige Façade Systems",       "amount": "₹84,500", "items": 5, "payment": "UPI",    "time": "11:18 AM"},
            {"bill": "B-2046", "customer": "Walk-in",                       "amount": "₹14,250", "items": 1, "payment": "Cash",   "time": "10:55 AM"},
            {"bill": "B-2045", "customer": "Skyline ACP Contractors",       "amount": "₹1,24,800","items": 8, "payment": "Card",   "time": "10:22 AM"},
        ],
        "low_stock_alerts_at_counter": [
            {"sku": "Hindalco Z-Section Louver Blade 150mm",     "counter_stock": 8,  "reorder_flag": True},
            {"sku": "Aerofoil Louver Blade 200mm Anodised",       "counter_stock": 3,  "reorder_flag": True},
            {"sku": "ACP Panel Fixing Rivets Box-500",            "counter_stock": 12, "reorder_flag": False},
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

    # Mock fallback — 3 warehouses with louvers/ACP/HPL profile
    return {
        "warehouses": [
            {
                "name": "Main Godown — Peenya",
                "location": "Peenya Industrial Area, Bangalore",
                "capacity": 8000,
                "stock": 5920,
                "utilisation_pct": 74.0,
                "value": "₹46.2L",
                "manager": "Rajesh Kumar",
                "top_skus": ["Hindalco Z-Section Louver Blade 150mm", "Alucobond ACP 4mm Silver 8×4ft", "Greenlam HPL Sheet 1mm Ivory Matt"],
                "note": "Bulk aluminium profiles stored flat-racked; ACP panels in vertical cradles",
            },
            {
                "name": "Transit Hub — Koramangala",
                "location": "Koramangala 6th Block, Bangalore",
                "capacity": 1500,
                "stock": 480,
                "utilisation_pct": 32.0,
                "value": "₹7.4L",
                "manager": "Suresh Nair",
                "note": "Staging for city-site deliveries — flat-bed hold area, typical 1–2 day turnaround",
            },
            {
                "name": "Display Centre — HSR Layout",
                "location": "HSR Layout Sector 6, Bangalore",
                "capacity": 300,
                "stock": 214,
                "utilisation_pct": 71.3,
                "value": "₹5.8L",
                "manager": "Priya Iyer",
                "note": "Showroom display panels + counter stock; replenished from Main Godown weekly",
            },
        ],
        "summary": {
            "total_warehouses": 3,
            "total_capacity_sheets": 9800,
            "total_stock_sheets": 6614,
            "overall_utilisation": "67.5%",
            "available_capacity": "3186 sheets free",
            "near_capacity_alert": "Main Godown at 74% — inbound Alucobond shipment (PO-9124) will push to 82%; pre-arrange flat-rack space",
        },
        "grn_activity": {
            "this_week": 6,
            "mismatches": 2,
            "top_supplier_this_week": "Hindalco Extrusions (₹3.8L aluminium profiles received)",
        },
        "data_source": "mock",
    }


async def schemes_tool(query: Optional[str] = None) -> dict:
    """Scheme management: supplier promotions, sales targets, accruals, loyalty schemes."""
    return {
        "active_schemes": [
            {
                "scheme_id":   "SCH-Q1-2026",
                "name":        "Hindalco Extrusions Q1 FY26 Volume Bonus",
                "supplier":    "Hindalco Extrusions",
                "type":        "VOLUME_TARGET",
                "period":      "Q1 FY26 (Apr–Jun 2026)",
                "target":      "₹22L aluminium profile purchases",
                "achieved":    "₹16.4L (74.5%)",
                "reward":      "3% cash rebate + priority allocation in peak season",
                "est_payout":  "₹66,000 on full achievement",
                "status":      "ON_TRACK",
                "days_left":   49,
            },
            {
                "scheme_id":   "SCH-ANN-2026",
                "name":        "Alucobond Premier Dealer Annual FY26",
                "supplier":    "Alucobond (3A Composites)",
                "type":        "LOYALTY_ANNUAL",
                "period":      "FY26 (Apr 2025–Mar 2026)",
                "target":      "₹40L ACP purchases",
                "achieved":    "₹29.6L (74%)",
                "reward":      "2.5% accrual on all ACP panels + co-branding display support",
                "est_payout":  "₹1,00,000 accrual + ₹20,000 display material",
                "status":      "ON_TRACK",
            },
            {
                "scheme_id":   "SCH-PROMO-05",
                "name":        "Greenlam HPL Pre-Monsoon Push May 2026",
                "supplier":    "Greenlam Industries",
                "type":        "PROMO_MONTH",
                "period":      "May 2026",
                "target":      "80 sheets HPL 1mm across any finish",
                "achieved":    "36 sheets (45%)",
                "reward":      "₹120/sheet cash discount on full achievement",
                "est_payout":  "₹9,600",
                "status":      "AT_RISK",
                "days_left":   19,
            },
            {
                "scheme_id":   "SCH-VIVA-Q1",
                "name":        "Viva Composite Q1 Growth Bonus",
                "supplier":    "Viva Composite Panel",
                "type":        "VOLUME_TARGET",
                "period":      "Q1 FY26 (Apr–Jun 2026)",
                "target":      "₹12L ACP budget-grade purchases",
                "achieved":    "₹11.0L (91.7%)",
                "reward":      "4.5% credit note on full achievement",
                "est_payout":  "₹54,000 credit note",
                "status":      "ON_TRACK",
                "days_left":   49,
            },
        ],
        "target_summary": {
            "schemes_active":       4,
            "schemes_achieved":     0,
            "schemes_at_risk":      1,
            "total_payout_est":     "₹2.30L",
            "total_payout_secured": "₹1.68L (accruals + Viva near-complete)",
        },
        "accrual_ledger": [
            {"supplier": "Alucobond",          "month": "Apr 2026", "purchases": "₹8.4L",  "accrual_rate": "2.5%", "accrual_amt": "₹21,000"},
            {"supplier": "Alucobond",          "month": "Mar 2026", "purchases": "₹7.8L",  "accrual_rate": "2.5%", "accrual_amt": "₹19,500"},
            {"supplier": "Hindalco Extrusions","month": "Apr 2026", "purchases": "₹9.2L",  "accrual_rate": "3%",   "accrual_amt": "₹27,600"},
            {"supplier": "Viva Composite",     "month": "Apr 2026", "purchases": "₹5.6L",  "accrual_rate": "4.5%", "accrual_amt": "₹25,200"},
        ],
        "recommendations": [
            "Push ₹5.6L more Hindalco extrusions in 49 days to lock ₹66,000 Q1 bonus — focus Z-section and C-channel louver blades",
            "Greenlam May promo: need 44 more HPL sheets in 19 days — offer pre-monsoon interior design bundle to architect firms",
            "Viva Composite at 91.7% — place one ₹1.0L PO to secure ₹54,000 credit note before month-end",
            "Alucobond annual on track at 74% — maintain ₹8L+/month purchase velocity; secure Q2 priority allocation by hitting Q1 target",
        ],
        "data_source": "mock",
    }


async def sales_return_tool(query: Optional[str] = None) -> dict:
    """Sales returns with UOM conversion, credit notes, and accounting — open returns, credit balances, return reasons."""
    try:
        from app.api.sales_return import _mock_returns, _mock_credit_notes, _SESSION_RETURNS, _SESSION_CREDIT_NOTES
        returns  = _mock_returns()       + _SESSION_RETURNS
        cns      = _mock_credit_notes()  + _SESSION_CREDIT_NOTES
        total_credit  = sum(r["credit_amount"] for r in returns)
        open_cns      = [c for c in cns if c["status"] == "OPEN"]
        open_balance  = sum(c["balance"] for c in open_cns)
        return {
            "summary": {
                "total_returns":        len(returns),
                "total_credit_issued":  f"₹{total_credit:,.2f}",
                "open_credit_notes":    len(open_cns),
                "open_credit_balance":  f"₹{open_balance:,.2f}",
            },
            "recent_returns": [
                {
                    "return_id":        r["return_id"],
                    "customer":         r["customer_name"],
                    "product":          r["sku_name"],
                    "original":         f"{r['original_qty']} {r['original_uom']}",
                    "returned":         f"{r['return_qty']} {r['return_uom']}",
                    "conversion_ratio": r["conversion_ratio"],
                    "credit_amount":    f"₹{r['credit_amount']:,.2f}",
                    "reason":           r["return_reason"],
                    "status":           r["status"],
                }
                for r in returns[:5]
            ],
            "open_credit_notes": [
                {
                    "credit_note_id": c["credit_note_id"],
                    "customer":       c["customer_name"],
                    "balance":        f"₹{c['balance']:,.2f}",
                    "valid_until":    c["valid_until"],
                }
                for c in open_cns[:5]
            ],
            "common_return_reasons": ["Damaged on arrival", "Wrong specification", "Quality issue", "Excess order"],
            "uom_note": "Supports partial returns — e.g. 3 pcs returned from 1 box of 10 sold. Credit is auto-calculated at piece price.",
            "data_source": "mock",
        }
    except Exception as exc:
        logger.warning("sales_return_tool failed: %s", exc)
        return {
            "summary": {
                "total_returns":       2,
                "total_credit_issued": "₹2,059.69",
                "open_credit_notes":   1,
                "open_credit_balance": "₹171.69",
            },
            "common_return_reasons": ["Damaged on arrival", "Wrong specification", "Quality issue"],
            "data_source": "mock",
        }


async def damage_tool(query: Optional[str] = None) -> dict:
    """Damage incidents: GRN inward damage, transit SO damage, and sales return damage. Insurance claims, write-offs, accounting."""
    # Sales return damage mock (always available — no DB dependency)
    sr_damages_mock = [
        {
            "damage_id": "SR-2026-0004", "so_number": "SO-2026-0142",
            "invoice_number": "INV-20260510-001", "dc_number": "DC-20260510-001",
            "customer_name": "Prestige Developers", "damage_date": "2026-05-20",
            "sku_name": "Hafele Zinc D-Handle 128mm", "return_qty": 10,
            "damaged_qty": 6, "uom": "Pcs", "return_condition": "PARTIALLY_DAMAGED",
            "damage_value": 1440, "good_value": 960, "status": "CLAIM_RAISED",
        },
        {
            "damage_id": "SR-2026-0003", "so_number": "SO-2026-0131",
            "invoice_number": "INV-20260503-002", "dc_number": None,
            "customer_name": "Sharma Constructions", "damage_date": "2026-05-15",
            "sku_name": "Jaquar Lyric Basin Mixer Chrome", "return_qty": 1,
            "damaged_qty": 1, "uom": "Pcs", "return_condition": "FULLY_DAMAGED",
            "damage_value": 3200, "good_value": 0, "status": "RESOLVED",
        },
    ]
    try:
        from app.api.damage import _mock_grn_damages, _mock_transit_damages, _SESSION_GRN_DAMAGES, _SESSION_TRANSIT_DAMAGES
        grn_dmgs     = _mock_grn_damages()     + _SESSION_GRN_DAMAGES
        transit_dmgs = _mock_transit_damages() + _SESSION_TRANSIT_DAMAGES
        total_grn     = sum(d["damage_value"]      for d in grn_dmgs)
        total_transit = sum(d["damage_sell_value"] for d in transit_dmgs)
        total_sr      = sum(d["damage_value"]      for d in sr_damages_mock)
        total_insured = sum(
            (d.get("insurance_amount") or 0)
            for d in grn_dmgs + transit_dmgs
            if d.get("insurance_claimable")
        )
        open_claims = [d for d in grn_dmgs + transit_dmgs + sr_damages_mock
                       if d["status"] in ("CLAIM_RAISED", "PENDING")]
        return {
            "summary": {
                "grn_damage_incidents":          len(grn_dmgs),
                "transit_damage_incidents":      len(transit_dmgs),
                "sales_return_damage_incidents": len(sr_damages_mock),
                "total_grn_damage_value":        f"₹{total_grn:,.2f}",
                "total_transit_so_impact":       f"₹{total_transit:,.2f}",
                "total_sr_damage_value":         f"₹{total_sr:,.2f}",
                "total_insurance_claimable":     f"₹{total_insured:,.2f}",
                "open_insurance_claims":         len(open_claims),
            },
            "recent_grn_damages": [
                {
                    "id":       d["damage_id"],
                    "grn_id":   d["grn_id"],
                    "supplier": d["supplier_name"],
                    "product":  d["sku_name"],
                    "qty":      f"{d['damaged_qty']} {d['uom']} damaged of {d['received_qty']} received",
                    "value":    f"₹{d['damage_value']:,.2f}",
                    "type":     d["damage_type"],
                    "claim":    d.get("insurance_claim_id") or "No claim",
                    "status":   d["status"],
                }
                for d in grn_dmgs[:4]
            ],
            "recent_transit_damages": [
                {
                    "id":        d["damage_id"],
                    "so":        d["so_number"],
                    "customer":  d["customer_name"],
                    "product":   d["sku_name"],
                    "qty":       f"{d['damaged_qty']} {d['uom']} damaged of {d['dispatched_qty']} dispatched",
                    "so_impact": f"₹{d['damage_sell_value']:,.2f}",
                    "type":      d["damage_type"],
                    "carrier":   d.get("carrier_name", ""),
                    "adjustment":d["so_adjustment_type"],
                    "status":    d["status"],
                }
                for d in transit_dmgs[:4]
            ],
            "recent_sr_damages": [
                {
                    "id":        d["damage_id"],
                    "so":        d["so_number"],
                    "invoice":   d.get("invoice_number", ""),
                    "customer":  d["customer_name"],
                    "product":   d["sku_name"],
                    "return_qty": f"{d['return_qty']} {d['uom']}",
                    "damaged_qty": f"{d['damaged_qty']} {d['uom']}",
                    "condition": d["return_condition"],
                    "damage_value": f"₹{d['damage_value']:,.2f}",
                    "good_value":   f"₹{d['good_value']:,.2f}",
                    "status":    d["status"],
                }
                for d in sr_damages_mock[:4]
            ],
            "accounting_overview": {
                "grn_damage_entry":    "Damage Loss A/c Dr / Inventory A/c Cr (write-down at cost)",
                "insurance_entry":     "Insurance Claim Receivable A/c Dr / Damage Loss A/c Cr",
                "transit_entry":       "Transit Loss A/c Dr / Inventory A/c Cr + Credit Note to customer",
                "supplier_defect":     "Supplier Claim Receivable A/c Dr / Damage Loss A/c Cr",
                "sr_good_entry":       "Inventory A/c Dr / COGS A/c Cr (good items restocked)",
                "sr_damaged_entry":    "Damage Loss A/c Dr / COGS A/c Cr (damaged items written off)",
                "sr_credit_note":      "Customer A/c Dr / Sales Return A/c Cr (credit note at sell price)",
            },
            "data_source": "mock",
        }
    except Exception as exc:
        logger.warning("damage_tool failed: %s", exc)
        total_sr = sum(d["damage_value"] for d in sr_damages_mock)
        return {
            "summary": {
                "grn_damage_incidents":          3,
                "transit_damage_incidents":      2,
                "sales_return_damage_incidents": len(sr_damages_mock),
                "total_grn_damage_value":        "₹13,600",
                "total_transit_so_impact":       "₹7,410",
                "total_sr_damage_value":         f"₹{total_sr:,.2f}",
                "total_insurance_claimable":     "₹11,120",
                "open_insurance_claims":         3,
            },
            "data_source": "mock",
        }


async def landing_cost_tool(query: Optional[str] = None) -> dict:
    """Landing cost sheets: import operations, charge heads, per-unit true cost, margin impact."""
    return {
        "summary": {
            "active_sheets": 3,
            "total_landed_value": "₹18.4L",
            "avg_overhead_pct": 8.2,
            "margin_note": "True cost is 6-9% above invoice price for domestic, 14-20% for imports",
        },
        "recent_sheets": [
            {
                "sheet_id": "LC-2026-018", "supplier": "Hindalco Extrusions Ltd", "po_ref": "PO-9124",
                "operation_type": "DOMESTIC_ROAD", "invoice_value": "₹8,24,000",
                "charges": {"freight": 18400, "loading_unloading": 2800, "flat_rack_hire": 4200, "insurance": 824, "misc": 0},
                "total_landed_cost": "₹8,50,224",
                "per_unit_impact": "Hindalco Z-Blade 150mm: ₹1,042 true cost vs ₹980 invoice — margin 3.2% lower",
            },
            {
                "sheet_id": "LC-2026-015", "supplier": "Alucobond (3A Composites)", "po_ref": "PO-9118",
                "operation_type": "DOMESTIC_ROAD", "invoice_value": "₹12,60,000",
                "charges": {"freight": 48000, "loading_unloading": 4200, "flat_rack_hire": 6800, "insurance": 1260, "misc": 2000},
                "total_landed_cost": "₹13,22,260",
                "per_unit_impact": "Alucobond ACP 4mm Silver: ₹3,812 true cost vs ₹3,500 invoice — ACP transport overhead 4.9% (flat-rack mandatory)",
            },
        ],
        "charge_heads": {
            "DOMESTIC_ROAD":   ["freight", "loading_unloading", "insurance", "misc"],
            "IMPORT_SEA":      ["custom_duty", "freight_forwarding", "port_handling", "insurance", "clearing_agent", "loading_unloading"],
            "IMPORT_AIR":      ["custom_duty", "freight_forwarding", "port_handling", "insurance", "loading_unloading"],
            "LOCAL_PICKUP":    ["vehicle_hire", "loading_unloading"],
        },
        "operation_types": ["DOMESTIC_ROAD", "DOMESTIC_RAIL", "IMPORT_SEA", "IMPORT_AIR", "LOCAL_PICKUP", "INTER_STATE_ROAD"],
        "pricing_rule": "Always compute landed cost before setting MRP. Avg overhead: 8% domestic, 16-20% imports. Margin = (Sell – Landed Cost) / Sell.",
        "data_source": "mock",
    }


async def pr_tool(query: Optional[str] = None) -> dict:
    """Purchase requisition pipeline: pending approvals, approved-not-ordered, PO conversion tracking."""
    return {
        "summary": {
            "total_prs_mtd": 14, "pending_approval": 5, "approved_not_ordered": 3,
            "converted_to_po": 6, "rejected": 0,
            "avg_approval_time_days": 1.8, "pending_value": "₹4.2L",
        },
        "pending_prs": [
            {
                "pr_id": "PR-2026-014", "priority": "HIGH",
                "title": "Hindalco Z-Section Louver Blades — Pre-Monsoon Replenishment",
                "requested_by": "Rajesh Kumar (Store Manager)", "days_pending": 1,
                "estimated_value": "₹4,80,000", "required_by": "2026-05-27",
                "status": "PENDING_APPROVAL",
            },
            {
                "pr_id": "PR-2026-013", "priority": "URGENT",
                "title": "Alucobond ACP Silver 4mm — Critical Low Stock Emergency",
                "requested_by": "Priya Iyer (Sales)", "days_pending": 2,
                "estimated_value": "₹3,28,500", "required_by": "2026-05-23",
                "status": "PENDING_APPROVAL",
            },
            {
                "pr_id": "PR-2026-011", "priority": "MEDIUM",
                "title": "Greenlam HPL Ivory Matt + Concrete Grey — Project Batch",
                "requested_by": "Suresh Nair (Procurement)", "days_pending": 4,
                "estimated_value": "₹1,92,000", "required_by": "2026-05-31",
                "status": "PENDING_APPROVAL",
            },
        ],
        "approved_awaiting_po": [
            {
                "pr_id": "PR-2026-010", "title": "Aerofoil Louver Blades 200mm — Façade Season Pre-stock",
                "approved_by": "Admin", "approved_date": "2026-05-18",
                "estimated_value": "₹1,68,000", "days_since_approval": 3,
                "action": "Create PO now — required by May 30; book flat-rack truck for delivery",
            },
        ],
        "bottleneck_alert": "PR-2026-013 (URGENT) is 2 days in approval queue — Alucobond ACP Silver stock will hit zero in 8 days. Convert to PO immediately and arrange flat-rack transport.",
        "workflow": "PR → Dept Approval → Procurement → PO → GRN → QC → Invoice Match",
        "data_source": "mock",
    }


async def qc_tool(query: Optional[str] = None) -> dict:
    """QC inspection results: pass/reject rates, RTV decisions, supplier quality scorecard."""
    return {
        "summary": {
            "inspections_mtd": 18, "accepted_fully": 14, "accepted_conditionally": 2,
            "rejected_rtv": 2, "overall_pass_rate": "88.9%",
            "rejection_value_mtd": "₹32,400",
            "top_rejection_supplier": "Viva Composite Panel — 2 failures this month (thickness spec mismatch, 38.5% rejection rate)",
        },
        "recent_inspections": [
            {
                "qc_id": "QCI-2026-018", "supplier": "Hindalco Extrusions",
                "sku": "Hindalco Z-Section Louver Blade 150mm",
                "qty_inspected": 240, "qty_accepted": 240, "qty_rejected": 0,
                "result": "ACCEPTED",
                "checklist_summary": "All 7 parameters PASS — dimensions, alloy grade, anodising thickness, finish, packaging, quantity, labels",
            },
            {
                "qc_id": "QCI-2026-017", "supplier": "Viva Composite Panel",
                "sku": "Viva ACP 4mm Pure White 8×4ft",
                "qty_inspected": 36, "qty_accepted": 22, "qty_rejected": 14,
                "result": "CONDITIONAL",
                "rejection_reason": "8 sheets thickness 3.82mm (spec 4.0mm ±0.1mm); 6 sheets coating delamination at edges",
                "decision": "ACCEPT_PARTIAL — 22 to stores, 14 as RTV",
                "rtv_value": "₹34,720",
            },
            {
                "qc_id": "QCI-2026-016", "supplier": "Viva Composite Panel",
                "sku": "Viva ACP 4mm Silver Metallic 8×4ft",
                "qty_inspected": 18, "qty_accepted": 0, "qty_rejected": 18,
                "result": "REJECTED",
                "rejection_reason": "100% sheets — core delamination under peel test (manufacturing defect, non-FR batch mixed with FR order)",
                "decision": "FULL RTV", "rtv_value": "₹44,640",
            },
        ],
        "supplier_quality_scorecard": {
            "Hindalco Extrusions": {"pass_rate": "100%",  "rtv_value_mtd": "₹0",      "rating": "EXCELLENT"},
            "Greenlam Industries": {"pass_rate": "98.4%", "rtv_value_mtd": "₹0",      "rating": "EXCELLENT"},
            "Alucobond (3A)":      {"pass_rate": "96.2%", "rtv_value_mtd": "₹8,200",  "rating": "GOOD"},
            "Merino Industries":   {"pass_rate": "97.8%", "rtv_value_mtd": "₹0",      "rating": "GOOD"},
            "Viva Composite":      {"pass_rate": "61.5%", "rtv_value_mtd": "₹79,360", "rating": "REVIEW — URGENT"},
        },
        "common_failure_params": ["ACP thickness tolerance", "Coating delamination", "Anodising thickness (louvers)", "Alloy grade certification"],
        "insight": "Viva Composite rejection rate (38.5%) is 7.7× industry benchmark (5%). Issue quality improvement notice and pre-inspect all batches before GRN. Consider shifting volume to Alucobond budget line.",
        "data_source": "mock",
    }


async def invoice_matching_tool(query: Optional[str] = None) -> dict:
    """3-way match (PO + GRN + Invoice), AP approval queue, discrepancy analysis, payment queue."""
    return {
        "summary": {
            "invoices_received_mtd": 22, "auto_matched": 16, "manual_review_pending": 4,
            "approved_for_payment": 18, "blocked_discrepancy": 4,
            "auto_match_rate": "72.7%", "total_payable_mtd": "₹38.4L",
            "discrepancy_value_total": "₹1,24,800",
        },
        "pending_review": [
            {
                "invoice_id": "INV-2026-042", "supplier": "Viva Composite Panel",
                "po_ref": "PO-9124", "grn_ref": "GRN-9041",
                "invoice_amount": "₹3,60,000", "matched_amount": "₹3,17,640",
                "discrepancy": "₹42,360 — RTV deduction (14 rejected sheets) + freight surcharge not in PO",
                "status": "BLOCKED", "match_result": "PRICE_MISMATCH",
                "action": "Request revised invoice from Viva Composite with RTV credit note before releasing payment",
            },
            {
                "invoice_id": "INV-2026-038", "supplier": "Hindalco Extrusions",
                "po_ref": "PO-9118", "grn_ref": "GRN-9048",
                "invoice_amount": "₹8,26,800", "matched_amount": "₹8,24,000",
                "discrepancy": "₹2,800 (0.3% — within 1% tolerance, LME adjustment)",
                "status": "PENDING", "match_result": "WITHIN_TOLERANCE",
                "action": "Manager approval needed — high-value invoice manual review",
            },
        ],
        "payment_queue": {
            "due_this_week": "₹22.4L", "due_next_week": "₹12.8L",
            "blocked_invoices": 4, "oldest_pending_days": 18,
            "note": "₹42,360 blocked until Viva Composite reissues invoice with RTV deduction and removes unilateral freight surcharge",
        },
        "auto_match_rule": "< 1% variance on price + qty = auto-approve. > 1% = manual review. Qty mismatch always manual.",
        "insight": "72.7% auto-match rate is below 85% benchmark. Viva Composite invoice discrepancies are primary driver (unilateral freight surcharges, RTV deductions not applied). Enforce PO-aligned invoicing — no surcharges not pre-agreed in PO.",
        "data_source": "mock",
    }


TOOLS = {
    "stock":            stock_tool,
    "demand":           demand_tool,
    "supplier":         supplier_tool,
    "customer":         customer_tool,
    "finance":          finance_tool,
    "order":            order_tool,
    "freight":          freight_tool,
    "email":            email_tool,
    "po_grn":           po_grn_tool,
    "sales":            sales_tool,
    "inward":           inward_tool,
    "discount":         discount_tool,
    "louvers":          louvers_tool,
    "quotes":           quotes_tool,
    "projects":         projects_tool,
    "catalog":          catalog_tool,
    "credit":           credit_tool,
    "pos":              pos_tool,
    "schemes":          schemes_tool,
    "warehouse":        warehouse_tool,
    "sales_return":     sales_return_tool,
    "damage":           damage_tool,
    "landing_cost":     landing_cost_tool,
    "pr":               pr_tool,
    "qc":               qc_tool,
    "invoice_matching": invoice_matching_tool,
}
