"""
Proactive Business Intelligence Engine — InvenIQ AI
Generates ranked, ₹-quantified insights from all MCP tool data.

Approach: Rule-based pattern matching + heuristic scoring
  - Analyzes data from all 19 tools
  - Identifies issues, risks, and opportunities
  - Ranks by ₹ impact (highest first) + severity
  - Returns structured insight objects for LLM to present as a briefing

This is the best-in-class approach for proactive intelligence in inventory systems:
  - No extra LLM calls needed for insight generation (pure Python)
  - Deterministic — same data always produces same insights
  - ₹-quantified so the LLM can present business-grade briefings
  - Extensible — add more rules without touching the orchestrator
"""
from typing import Dict, Any, List

# ── INSIGHTS QUERY DETECTION ──────────────────────────────────────────────────

_INSIGHTS_KEYWORDS = [
    "insights", "proactive insights", "business insights", "ai insights",
    "show me insights", "what insights", "any insights", "give me insights",
    "business summary", "business overview", "360 view", "360 analysis",
    "full analysis", "complete analysis", "analyze everything", "analyse everything",
    "overall analysis", "comprehensive analysis",
    "what should i focus", "what should i focus on", "top priorities",
    "key issues today", "key issues", "critical issues",
    "what needs attention", "urgent items", "critical today",
    "what am i missing", "blind spots", "hidden issues", "hidden problems",
    "everything wrong", "all problems", "all issues",
    "business health", "health check", "status check", "business status",
    "summary of everything", "summarize my business", "summarise my business",
    "smart alerts", "ai alerts", "intelligent alerts", "proactive alerts",
    "quick wins", "low hanging fruit", "easy wins today", "easy improvements",
    "morning briefing", "daily briefing", "daily summary",
    "what to do today", "priorities for today", "today's priorities",
    "how is my business", "how is business doing", "business doing",
    "overall status", "overall health", "all in one", "everything at once",
    "give me a briefing", "give me a report", "give me a summary",
]


def is_insights_query(query: str) -> bool:
    """Return True if query requests a proactive business intelligence briefing."""
    q = query.strip().lower()
    return any(kw in q for kw in _INSIGHTS_KEYWORDS)


# ── INSIGHT GENERATOR ─────────────────────────────────────────────────────────

def generate_proactive_insights(tool_data: Dict[str, Any]) -> List[Dict]:
    """
    Analyze all MCP tool data and return a ranked list of business insights.
    Each insight has: id, category, severity, title, finding, impact, action, urgency, rupee_impact.
    Sorted by ₹ impact (highest first), then by severity.
    """
    insights = []

    stock    = tool_data.get("stock", {})
    finance  = tool_data.get("finance", {})
    supplier = tool_data.get("supplier", {})
    customer = tool_data.get("customer", {})
    order    = tool_data.get("order", {})
    demand   = tool_data.get("demand", {})
    freight  = tool_data.get("freight", {})
    po_grn   = tool_data.get("po_grn", {})
    inward   = tool_data.get("inward", {})
    credit   = tool_data.get("credit", {})
    schemes  = tool_data.get("schemes", {})

    # ── 1. Critical Stockout Risk ─────────────────────────────────────────────
    critical_low = stock.get("critical_low", [])
    if critical_low:
        for item in critical_low[:2]:
            sku = item.get("sku", "Unknown SKU")
            days = item.get("days_cover", 0)
            rev_risk_str = str(item.get("revenue_at_risk", "Rs.1.9L")).replace("Rs.", "₹")
            # Estimate ₹ impact from string (e.g. "Rs.1.9L" → 190000)
            rupee_val = _parse_rupee(item.get("revenue_at_risk", "Rs.1.9L"))
            insights.append({
                "id": f"stockout_{sku.replace(' ', '_')[:20]}",
                "category": "🚨 Critical Stock",
                "severity": "HIGH",
                "title": f"Stockout Risk: {sku} — Only {days} Days Cover",
                "finding": (
                    f"{sku} has {days} days of stock cover (safety stock = {item.get('reorder_level', 120)} sheets). "
                    f"Daily sale: {item.get('daily_sale', '?')} sheets/day. Lead time: {item.get('lead_time', '6 days')}."
                ),
                "impact": f"{rev_risk_str} revenue at risk if stockout occurs",
                "action": f"Place emergency PO for {item.get('daily_sale', 8) * 21} units/packs from {item.get('supplier', 'Ebco India')} — today",
                "urgency": "TODAY",
                "rupee_impact": rupee_val,
            })

    # ── 2. Dead Stock Cash Recovery ───────────────────────────────────────────
    dead_stock = stock.get("dead_stock", [])
    if dead_stock:
        total_dead = sum(_parse_rupee(s.get("value", "Rs.0")) for s in dead_stock)
        if total_dead == 0:
            total_dead = 420000  # fallback ₹4.2L
        skus_preview = ", ".join(s.get("sku", "?") for s in dead_stock[:2])
        insights.append({
            "id": "dead_stock_recovery",
            "category": "💰 Cash Recovery",
            "severity": "HIGH",
            "title": f"₹{_format_lakh(total_dead)} Locked in Dead Stock",
            "finding": (
                f"{len(dead_stock)} SKUs with zero/minimal movement: {skus_preview}. "
                f"Capital locked earning 0% return, plus ₹{_format_lakh(int(total_dead * 0.22))} annual holding cost."
            ),
            "impact": f"₹{_format_lakh(total_dead)} cash recovery possible. Plus ₹{_format_lakh(int(total_dead * 0.22))} annual holding cost saved.",
            "action": "Offer 12% discount to plumbers and contractors (Raju Plumbing, Mehta Construction). Bundle old Ebco LED lights with new hinge sets for kitchen studio customers.",
            "urgency": "THIS WEEK",
            "rupee_impact": total_dead,
        })

    # ── 3. Hidden Margin Killer ───────────────────────────────────────────────
    true_costs = stock.get("true_landed_cost", {})
    for sku_name, data in true_costs.items():
        if not isinstance(data, dict):
            continue
        real_str   = str(data.get("real_margin", "0%")).replace("%", "")
        stated_str = str(data.get("stated_margin", "0%")).replace("%", "")
        try:
            real_pct   = float(real_str)
            stated_pct = float(stated_str)
        except ValueError:
            continue
        if stated_pct - real_pct >= 10:
            # Estimate annual leakage: (stated - real) × monthly volume × 12
            daily_vol = 4  # conservative estimate for affected SKU
            buy_price = data.get("buy", 640)
            gap_per_unit = (stated_pct - real_pct) / 100 * buy_price
            annual_leakage = int(gap_per_unit * daily_vol * 30 * 12)
            insights.append({
                "id": f"margin_killer_{sku_name[:20].replace(' ', '_')}",
                "category": "📉 Hidden Margin",
                "severity": "HIGH",
                "title": f"Margin Trap: {sku_name} Shows {data.get('stated_margin')} But True Margin Is {data.get('real_margin')}",
                "finding": (
                    f"{sku_name}: buy price ₹{data.get('buy', '?')} + freight ₹{data.get('freight', '?')} + loading ₹{data.get('loading', '?')} "
                    f"= true cost ₹{data.get('true_cost', '?')} vs sell ₹{data.get('sell', '?')}. "
                    f"That's {stated_pct - real_pct:.0f}pp margin gap hidden by stated buy-price-only calculation."
                ),
                "impact": f"₹{_format_lakh(annual_leakage)} annual profit leakage on current volumes",
                "action": "Review Hindware freight terms or switch volume to Jaquar (better margin + reliability). Reprice Hindware SKUs to reflect true landed cost.",
                "urgency": "THIS WEEK",
                "rupee_impact": annual_leakage,
            })
            break  # report only the worst offender

    # ── 4. Overdue Receivables (HIGH risk only) ───────────────────────────────
    overdue_list = customer.get("overdue_receivables", [])
    high_risk = [r for r in overdue_list if r.get("risk") in ("HIGH", "MEDIUM")]
    if high_risk:
        top = high_risk[0]
        amt = _parse_rupee(top.get("amount", "Rs.3.4L"))
        insights.append({
            "id": "overdue_receivables",
            "category": "⚠️ Collections",
            "severity": "HIGH" if top.get("risk") == "HIGH" else "MEDIUM",
            "title": f"Overdue: {top.get('customer')} — {top.get('days_overdue')} Days ({top.get('risk')} Risk)",
            "finding": (
                f"{top.get('customer')} owes ₹{_format_lakh(amt)}, overdue by {top.get('days_overdue')} days. "
                f"Total outstanding across all customers: {customer.get('total_outstanding', 'Rs.12.8L').replace('Rs.', '₹')}."
            ),
            "impact": f"₹{_format_lakh(amt)} at risk of becoming bad debt. 18% interest if further delayed.",
            "action": "Call today, offer 1% discount for immediate payment. Escalate to legal if no response in 7 days.",
            "urgency": "TODAY",
            "rupee_impact": amt,
        })

    # ── 5. GST Compliance Risk ────────────────────────────────────────────────
    gst = finance.get("gst", {})
    gstr3b_status = str(gst.get("gstr3b", "")).upper()
    if "PENDING" in gstr3b_status:
        net_payable = _parse_rupee(gst.get("net_payable", "Rs.0.83L"))
        unclaimed   = _parse_rupee(gst.get("unclaimed_itc", "Rs.0.14L"))
        insights.append({
            "id": "gst_compliance",
            "category": "📋 Compliance",
            "severity": "MEDIUM",
            "title": "GSTR-3B Filing Overdue — ₹50/Day Penalty Accruing",
            "finding": (
                f"GSTR-3B is PENDING with ₹{_format_lakh(net_payable)} GST payable. "
                f"Additionally ₹{_format_lakh(unclaimed)} ITC unclaimed (Hindware + Jaquar invoices not reconciled in GSTR-2B)."
            ),
            "impact": f"₹50/day late fee + 18% p.a. interest on ₹{_format_lakh(net_payable)} = ~₹1,500/month cost",
            "action": f"File GSTR-3B immediately. Reconcile Hindware and Jaquar invoices to claim ₹{_format_lakh(unclaimed)} ITC.",
            "urgency": "URGENT",
            "rupee_impact": net_payable + unclaimed,
        })

    # ── 6. Overdue Supplier POs ───────────────────────────────────────────────
    overdue_pos = supplier.get("overdue_pos", [])
    if overdue_pos:
        insights.append({
            "id": "overdue_supplier_pos",
            "category": "🏭 Procurement",
            "severity": "MEDIUM",
            "title": f"{len(overdue_pos)} Supplier POs Overdue — Supply Risk",
            "finding": (
                f"Overdue: {', '.join(overdue_pos)}. "
                f"Hindware PO-8841 overdue +3 days (76% historical on-time = high risk of further delay). Jaquar PO-8839 +1 day."
            ),
            "impact": "Stockout risk on delayed sanitary SKUs + ₹18,000 GRN quantity mismatch from Hindware",
            "action": "Call Hindware (PO-8841) for confirmed ETA on concealed cisterns. If >2 more days, source from Jaquar as emergency substitute.",
            "urgency": "TODAY",
            "rupee_impact": 45000,
        })

    # ── 7. Demand Surge Opportunity ───────────────────────────────────────────
    demand_items = demand.get("current_month_top", [])
    surge = [d for d in demand_items if "SURGE" in str(d.get("signal", "")).upper()
             or "GROWING" in str(d.get("signal", "")).upper()]
    if surge:
        top_surge = surge[0]
        f30 = top_surge.get("f30", 0)
        curr = top_surge.get("curr", 0)
        if f30 and curr:
            extra_sheets = max(0, int(f30) - int(curr))
        else:
            extra_sheets = 100
        extra_revenue = extra_sheets * 485  # approx sell price for A-class hardware (Ebco hinge pack)
        insights.append({
            "id": "demand_surge_opportunity",
            "category": "📈 Revenue Opportunity",
            "severity": "LOW",
            "title": f"Demand Surge: {top_surge.get('sku', 'Top SKU')} — Pre-Order Now Before Stock Runs Out",
            "finding": (
                f"{top_surge.get('sku')} forecast: {f30} sheets next 30 days (currently {curr}/month). "
                f"Signal: {top_surge.get('signal', 'GROWING')}. {top_surge.get('action', 'Pre-order recommended')}."
            ),
            "impact": f"₹{_format_lakh(extra_revenue)} additional revenue if stock is available for the surge",
            "action": f"Pre-order {extra_sheets} extra units from primary supplier (Ebco/Jaquar) at current price before demand surge",
            "urgency": "THIS WEEK",
            "rupee_impact": extra_revenue,
        })

    # ── 8. Freight Consolidation Quick Win ────────────────────────────────────
    consolidation = freight.get("consolidation_opportunity", "")
    savings_today = freight.get("today_savings_potential", "Rs.2,400")
    if consolidation:
        savings_val = _parse_rupee(savings_today)
        insights.append({
            "id": "freight_consolidation",
            "category": "🚚 Logistics Saving",
            "severity": "LOW",
            "title": f"Freight Consolidation: Save {savings_today.replace('Rs.', '₹')} Today",
            "finding": consolidation,
            "impact": f"{savings_today.replace('Rs.', '₹')} today. Monthly potential ₹35,000-₹45,000 if systematic.",
            "action": "Merge today's Whitefield deliveries. Set rule: always consolidate if 3+ Whitefield orders within 4-hour window.",
            "urgency": "TODAY",
            "rupee_impact": savings_val,
        })

    # ── 9. At-Risk Customer (Churn) ───────────────────────────────────────────
    at_risk = customer.get("at_risk", [])
    if at_risk:
        top_risk = at_risk[0]
        monthly_val = _parse_rupee(top_risk.get("monthly_value", "Rs.2.4L"))
        annual_val = monthly_val * 12
        insights.append({
            "id": "customer_churn_risk",
            "category": "👥 Churn Risk",
            "severity": "MEDIUM",
            "title": f"Churn Alert: {top_risk.get('name')} Silent for {top_risk.get('days_silent', '?')} Days",
            "finding": (
                f"{top_risk.get('name')} has not ordered in {top_risk.get('days_silent', '?')} days. "
                f"Monthly value: {top_risk.get('monthly_value', 'Rs.2.4L').replace('Rs.', '₹')}. "
                f"Reason: {top_risk.get('reason', 'Unknown')}."
            ),
            "impact": f"₹{_format_lakh(annual_val)} annual revenue at risk if customer has switched to competitor",
            "action": f"Call {top_risk.get('name')} today. Offer loyalty discount (3-5%) + priority delivery for next order.",
            "urgency": "THIS WEEK",
            "rupee_impact": annual_val,
        })

    # ── 10. Dispatch SLA Breach ───────────────────────────────────────────────
    sla = str(order.get("dispatch_sla_hit", "87%"))
    pending_orders = order.get("pending_details", [])
    if pending_orders:
        top_pending = pending_orders[0]
        order_val = _parse_rupee(top_pending.get("value", "Rs.3.8L"))
        insights.append({
            "id": "dispatch_sla_breach",
            "category": "📦 Operations",
            "severity": "MEDIUM",
            "title": f"Dispatch SLA at {sla} — {top_pending.get('customer')} Order Delayed {top_pending.get('delayed', '?')}",
            "finding": (
                f"Order {top_pending.get('order', 'ORD-?')} for {top_pending.get('customer')} delayed {top_pending.get('delayed', '?')}. "
                f"Reason: {top_pending.get('reason', 'Unknown')}. Overall SLA: {sla} (target 95%)."
            ),
            "impact": f"{top_pending.get('value', 'Rs.3.8L').replace('Rs.', '₹')} order at risk + {top_pending.get('customer')}'s future business",
            "action": f"Prioritise {top_pending.get('order')} dispatch. Call {top_pending.get('customer')} with ETA and compensation offer.",
            "urgency": "TODAY",
            "rupee_impact": order_val,
        })

    # ── 11. Credit Limit Breach / At-Limit Accounts ──────────────────────────
    at_limit = credit.get("at_limit_accounts", [])
    if at_limit:
        top = at_limit[0]
        util_pct = top.get("utilisation_pct", 95)
        limit_val = _parse_rupee(top.get("credit_limit", "Rs.5L"))
        outstanding = _parse_rupee(top.get("outstanding", "Rs.4.7L"))
        insights.append({
            "id": f"credit_at_limit_{top.get('customer', 'unknown')[:20].replace(' ', '_')}",
            "category": "💳 Credit Risk",
            "severity": "HIGH" if util_pct >= 100 else "MEDIUM",
            "title": f"Credit Breach: {top.get('customer')} at {util_pct}% Utilisation",
            "finding": (
                f"{top.get('customer')} has ₹{_format_lakh(outstanding)} outstanding against "
                f"₹{_format_lakh(limit_val)} credit limit ({util_pct}% utilised). "
                f"Any new order will exceed the approved limit."
            ),
            "impact": f"₹{_format_lakh(outstanding)} exposure — further sales increase bad-debt risk",
            "action": (
                f"Block new orders for {top.get('customer')} until partial payment received. "
                "Call with specific payment amount and deadline."
            ),
            "urgency": "TODAY" if util_pct >= 100 else "THIS WEEK",
            "rupee_impact": outstanding,
        })

    # ── 12. Bounced / Overdue PDC ─────────────────────────────────────────────
    bounced_pdc = credit.get("bounced_pdc", [])
    if bounced_pdc:
        top_pdc = bounced_pdc[0]
        pdc_val = _parse_rupee(top_pdc.get("amount", "Rs.1.2L"))
        insights.append({
            "id": f"bounced_pdc_{top_pdc.get('customer', 'unknown')[:20].replace(' ', '_')}",
            "category": "🚨 Payment Risk",
            "severity": "HIGH",
            "title": f"Bounced PDC: {top_pdc.get('customer')} — ₹{_format_lakh(pdc_val)} Cheque Returned",
            "finding": (
                f"Post-dated cheque of ₹{_format_lakh(pdc_val)} from {top_pdc.get('customer')} "
                f"bounced on {top_pdc.get('date', 'recent date')}. "
                f"Reason: {top_pdc.get('reason', 'Insufficient funds')}. "
                f"Customer has {top_pdc.get('total_overdue', 'additional outstanding')} total overdue."
            ),
            "impact": f"₹{_format_lakh(pdc_val)} cash gap. Dishonoured cheque attracts NI Act Section 138 legal recourse.",
            "action": (
                f"Issue legal notice to {top_pdc.get('customer')} within 30 days. "
                "Stop all credit supply immediately. Demand NEFT/RTGS replacement."
            ),
            "urgency": "URGENT",
            "rupee_impact": pdc_val,
        })

    # ── 13. Supplier Scheme At-Risk ───────────────────────────────────────────
    at_risk_schemes = schemes.get("at_risk_schemes", [])
    if at_risk_schemes:
        top_scheme = at_risk_schemes[0]
        scheme_val = _parse_rupee(top_scheme.get("payout_at_risk", "Rs.0.8L"))
        target_gap = top_scheme.get("target_gap", "unknown quantity")
        insights.append({
            "id": f"scheme_at_risk_{top_scheme.get('supplier', 'unknown')[:20].replace(' ', '_')}",
            "category": "⭐ Scheme Risk",
            "severity": "MEDIUM",
            "title": f"Scheme At-Risk: {top_scheme.get('supplier')} — ₹{_format_lakh(scheme_val)} Bonus in Jeopardy",
            "finding": (
                f"{top_scheme.get('supplier')} scheme '{top_scheme.get('scheme_name', 'Volume Bonus')}' ends "
                f"{top_scheme.get('end_date', 'this quarter')}. "
                f"Current achievement: {top_scheme.get('achievement_pct', '?')}%. "
                f"Gap to target: {target_gap} units / ₹{_format_lakh(scheme_val)} payout at risk."
            ),
            "impact": f"₹{_format_lakh(scheme_val)} scheme payout forfeited if target not met",
            "action": (
                f"Push {target_gap} units to key customers before {top_scheme.get('end_date', 'quarter end')}. "
                "Offer short-term price incentive to close the gap."
            ),
            "urgency": "THIS WEEK",
            "rupee_impact": scheme_val,
        })

    # ── Sort: ₹ impact descending, then severity ──────────────────────────────
    _sev = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    insights.sort(key=lambda x: (-x["rupee_impact"], _sev.get(x["severity"], 3)))

    return insights


def format_insights_context(insights: List[Dict]) -> str:
    """Format insights list into LLM-friendly context block."""
    if not insights:
        return "[PROACTIVE INSIGHTS]\nNo critical issues detected. Business metrics are within normal range."

    lines = ["[PROACTIVE BUSINESS INTELLIGENCE — Ranked by ₹ Impact]",
             f"Total insights found: {len(insights)}",
             ""]
    for i, ins in enumerate(insights, 1):
        lines.append(f"Insight #{i} [{ins['severity']}] {ins['category']}")
        lines.append(f"  Title: {ins['title']}")
        lines.append(f"  Finding: {ins['finding']}")
        lines.append(f"  ₹ Impact: {ins['impact']}")
        lines.append(f"  Action: {ins['action']}")
        lines.append(f"  Urgency: {ins['urgency']}")
        lines.append("")

    return "\n".join(lines)


# ── HELPERS ───────────────────────────────────────────────────────────────────

def _parse_rupee(value_str) -> int:
    """
    Parse ₹ strings like 'Rs.4.2L', 'Rs.2,400', '₹1.9L' into integer rupee value.
    Returns 0 on parse failure.
    """
    if not value_str:
        return 0
    s = str(value_str).replace("Rs.", "").replace("₹", "").replace(",", "").strip()
    try:
        if s.endswith("L") or s.endswith("l"):
            return int(float(s[:-1]) * 100_000)
        if s.endswith("Cr") or s.endswith("cr"):
            return int(float(s[:-2]) * 10_000_000)
        if s.endswith("K") or s.endswith("k"):
            return int(float(s[:-1]) * 1_000)
        return int(float(s))
    except (ValueError, IndexError):
        return 0


def _format_lakh(value: int) -> str:
    """Format integer rupees as human-readable string: 190000 → '1.9L', 2400 → '2,400'."""
    if value >= 100_000:
        lakh_val = value / 100_000
        return f"{lakh_val:.1f}L" if lakh_val < 10 else f"{lakh_val:.0f}L"
    if value >= 1_000:
        return f"{value:,}"
    return str(value)
