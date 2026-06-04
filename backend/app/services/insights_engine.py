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
    "procurement status", "p2p status", "purchase pipeline",
    "pr backlog", "pr status", "pending approvals",
    "qc status", "quality status", "rejection report",
    "invoice status", "ap status", "payment queue",
    "gate status", "receiving status", "inbound status",
    # Natural language pain-point triggers
    "pain points", "what's wrong", "whats wrong", "what is wrong",
    "what's broken", "whats broken", "problem areas", "trouble areas",
    "where am i losing", "where do i lose", "money leaks", "leakage",
    "biggest risks", "biggest problems", "what to fix", "fix first",
    "worst performers", "underperforming", "concerns", "red flags",
    "alerts today", "anything urgent", "urgent alerts",
    "opportunity analysis", "opportunities today",
    "give me the bad news", "bad news", "tell me everything",
    "complete picture", "full picture", "bird's eye", "birds eye",
    "collections status", "payment status overview", "unpaid overview",
    "damage summary", "return damage", "sr damage summary",
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
                "action": f"Place emergency PO for {item.get('daily_sale', 12) * 21} units/sheets from {item.get('supplier', 'Hindalco Extrusions')} — today. Confirm flat-rack truck availability.",
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
            "action": "Offer 10% discount to façade contractors and MEP contractors. Bundle PVC louver panels with ACP accessories for utility/parking-shade projects. Contact Greenlam for return/swap on discontinued HPL prints.",
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
                "action": "Review Viva Composite freight terms or switch volume to Alucobond (better spec + reliability). Reprice affected SKUs to reflect true landed cost including flat-rack transport.",
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
                f"Additionally ₹{_format_lakh(unclaimed)} ITC unclaimed (Viva Composite + Alucobond invoices not reconciled in GSTR-2B)."
            ),
            "impact": f"₹50/day late fee + 18% p.a. interest on ₹{_format_lakh(net_payable)} = ~₹1,500/month cost",
            "action": f"File GSTR-3B immediately. Reconcile Viva Composite and Alucobond invoices to claim ₹{_format_lakh(unclaimed)} ITC.",
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
                f"Viva Composite PO-9124 overdue +2 days (78% historical on-time = high delay risk). Alucobond PO-9118 +1 day (Mumbai–Bangalore transit delay)."
            ),
            "impact": "Stockout risk on delayed ACP SKUs + ₹22,000 GRN thickness mismatch from Viva Composite (3.8mm received vs 4mm ordered)",
            "action": "Call Viva Composite (PO-9124) for confirmed ETA on ACP panels. If >2 more days, source from Alucobond budget line as emergency substitute. Arrange flat-rack truck on standby.",
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
        extra_revenue = extra_sheets * 1260  # approx sell price for A-class louver blade (Hindalco Z-section 150mm)
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
            "action": f"Pre-order {extra_sheets} extra units from Hindalco Extrusions at current LME-linked price before pre-monsoon surge drives costs up. Confirm flat-rack capacity at Peenya godown.",
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

    # ── 14. PR Approval Bottleneck ────────────────────────────────────────────
    pr_data = tool_data.get("pr", {})
    pending_prs = pr_data.get("pending_prs", [])
    if pending_prs:
        urgent = [p for p in pending_prs if p.get("priority") in ("URGENT", "HIGH")]
        if urgent:
            top = urgent[0]
            pr_val = _parse_rupee(top.get("estimated_value", "Rs.96,000"))
            total_pending_val = sum(_parse_rupee(p.get("estimated_value", "0")) for p in urgent)
            insights.append({
                "id": "pr_approval_bottleneck",
                "category": "📋 Procurement",
                "severity": "HIGH",
                "title": f"PR Approval Bottleneck — {len(urgent)} Urgent PRs Stuck ({len(urgent[0].get('days_pending', 0))} days)",
                "finding": (
                    f"{len(urgent)} URGENT/HIGH priority purchase requisitions are awaiting approval. "
                    f"Top: '{top.get('title', 'Unknown')}' — ₹{_format_lakh(pr_val)}, pending {top.get('days_pending', '?')} day(s). "
                    f"Required by: {top.get('required_by', 'soon')}. Total pending value: ₹{_format_lakh(total_pending_val)}."
                ),
                "impact": f"₹{_format_lakh(total_pending_val)} in stock replenishment delayed — stockout risk if not acted on today",
                "action": (
                    f"Approve {top.get('pr_id', 'pending PR')} immediately and convert to PO today. "
                    f"Requested by: {top.get('requested_by', 'team')}."
                ),
                "urgency": "TODAY",
                "rupee_impact": total_pending_val,
            })

    # ── 15. QC Rejection Spike ────────────────────────────────────────────────
    qc_data = tool_data.get("qc", {})
    supplier_scorecard = qc_data.get("supplier_quality_scorecard", {})
    high_rejection_suppliers = {
        k: v for k, v in supplier_scorecard.items()
        if v.get("rating", "").startswith("REVIEW")
    }
    if high_rejection_suppliers:
        top_sup = next(iter(high_rejection_suppliers))
        rtv_val = _parse_rupee(qc_data.get("summary", {}).get("rejection_value_mtd", "Rs.32,400"))
        insights.append({
            "id": f"qc_rejection_spike_{top_sup[:20].replace(' ', '_')}",
            "category": "🔬 Quality",
            "severity": "HIGH",
            "title": f"QC Rejection Spike — {top_sup} Failing {high_rejection_suppliers[top_sup].get('pass_rate', '?')} Pass Rate",
            "finding": (
                f"{top_sup} has a pass rate of {high_rejection_suppliers[top_sup].get('pass_rate', '?')} "
                f"(industry benchmark: 95%). RTV value this month: ₹{_format_lakh(rtv_val)}. "
                f"Overall QC pass rate: {qc_data.get('summary', {}).get('overall_pass_rate', '?')}."
            ),
            "impact": f"₹{_format_lakh(rtv_val)} in rejected goods — procurement plan disrupted, stockout risk for affected SKUs",
            "action": (
                f"Issue quality improvement notice to {top_sup}. Pre-inspect 100% of next batch before GRN. "
                "Identify alternate supplier for affected SKUs as contingency."
            ),
            "urgency": "THIS WEEK",
            "rupee_impact": rtv_val,
        })

    # ── 16. Invoice Discrepancy Queue ─────────────────────────────────────────
    im_data = tool_data.get("invoice_matching", {})
    blocked_invoices = im_data.get("summary", {}).get("blocked_discrepancy", 0)
    discrepancy_val = _parse_rupee(im_data.get("summary", {}).get("discrepancy_value_total", "Rs.1,24,800"))
    if blocked_invoices > 0:
        due_week = im_data.get("payment_queue", {}).get("due_this_week", "₹0")
        insights.append({
            "id": "invoice_discrepancy_queue",
            "category": "🧮 AP / Finance",
            "severity": "MEDIUM",
            "title": f"{blocked_invoices} Invoices Blocked — ₹{_format_lakh(discrepancy_val)} in Discrepancies Unresolved",
            "finding": (
                f"{blocked_invoices} supplier invoices are blocked due to 3-way match failures. "
                f"Total discrepancy value: ₹{_format_lakh(discrepancy_val)}. "
                f"Payment due this week: {due_week}. "
                f"Auto-match rate: {im_data.get('summary', {}).get('auto_match_rate', '?')} (target: 85%)."
            ),
            "impact": f"₹{_format_lakh(discrepancy_val)} in supplier disputes risk relationship damage and delayed procurement",
            "action": (
                "Review each blocked invoice: request corrected invoices from suppliers with price/qty variance. "
                "Approve within-tolerance invoices manually to clear the payment queue."
            ),
            "urgency": "THIS WEEK",
            "rupee_impact": discrepancy_val,
        })

    # ── 17. Sales Revenue Acceleration / Deceleration ────────────────────────
    sales_data = tool_data.get("sales", {})
    monthly_revenue = sales_data.get("monthly_revenue", [])
    if len(monthly_revenue) >= 2:
        last = monthly_revenue[-1]
        prev = monthly_revenue[-2]
        try:
            last_val = float(last.get("revenue", 0)) * 100_000
            prev_val = float(prev.get("revenue", 0)) * 100_000
            if prev_val > 0:
                pct_change = (last_val - prev_val) / prev_val * 100
                if pct_change <= -10:
                    rev_drop = int(prev_val - last_val)
                    insights.append({
                        "id": "sales_revenue_deceleration",
                        "category": "📉 Sales Alert",
                        "severity": "HIGH",
                        "title": f"Revenue Drop: {last.get('month', 'This Month')} Down {abs(pct_change):.0f}% vs Prior Month",
                        "finding": (
                            f"Revenue this period: ₹{_format_lakh(int(last_val))} vs "
                            f"₹{_format_lakh(int(prev_val))} prior. "
                            f"Category split: {sales_data.get('category_split', {})}"
                        ),
                        "impact": f"₹{_format_lakh(rev_drop)} revenue shortfall vs prior month",
                        "action": (
                            "Review orders pipeline: check if top customer orders are delayed or cancelled. "
                            "Identify which category (louvers/ACP/HPL) declined most and investigate root cause."
                        ),
                        "urgency": "THIS WEEK",
                        "rupee_impact": rev_drop,
                    })
        except (ValueError, TypeError):
            pass

    # ── 18. Inward GRN Mismatches ─────────────────────────────────────────────
    inward_data = tool_data.get("inward", {})
    recent_grn = inward_data.get("recent_grn", [])
    grn_mismatches = [g for g in recent_grn if g.get("status") == "MISMATCH"]
    shrinkage_val = _parse_rupee(str(inward_data.get("shrinkage_mtd", "Rs.0")).replace("₹", "Rs."))
    if grn_mismatches or shrinkage_val > 5_000:
        top_mm = grn_mismatches[0] if grn_mismatches else {}
        impact_val = max(shrinkage_val, len(grn_mismatches) * 5_000)
        insights.append({
            "id": "inward_grn_mismatches",
            "category": "🚛 Inward / GRN",
            "severity": "MEDIUM",
            "title": f"{len(grn_mismatches)} GRN Mismatches This Period — ₹{_format_lakh(shrinkage_val)} Shrinkage MTD",
            "finding": (
                f"{len(grn_mismatches)} recent GRNs have STATUS=MISMATCH. "
                + (f"Latest: {top_mm.get('supplier', '')} — {top_mm.get('grn', '')}. " if top_mm else "")
                + f"QC pass rate: {inward_data.get('qc_pass_rate', '?')}. "
                f"Total shrinkage this month: ₹{_format_lakh(shrinkage_val)}."
            ),
            "impact": f"₹{_format_lakh(impact_val)} at risk from unresolved GRN discrepancies and shrinkage",
            "action": (
                "Resolve each MISMATCH GRN: raise credit note or return-to-vendor. "
                "Run cycle count on high-shrinkage SKUs. Investigate if shortages are at receiving or picking stage."
            ),
            "urgency": "THIS WEEK",
            "rupee_impact": impact_val,
        })

    # ── 19. Counter POS — Low Stock Alerts ────────────────────────────────────
    pos_data = tool_data.get("pos", {})
    low_stock_counter = [s for s in pos_data.get("low_stock_alerts_at_counter", [])
                         if s.get("reorder_flag")]
    if low_stock_counter:
        top_sku = low_stock_counter[0]
        daily_pos_rev = _parse_rupee(
            str(pos_data.get("today_summary", {}).get("gross_revenue", "₹0")).replace("₹", "Rs.")
        )
        insights.append({
            "id": "pos_counter_low_stock",
            "category": "🏪 Counter POS",
            "severity": "MEDIUM",
            "title": f"{len(low_stock_counter)} Counter SKUs Below Reorder — Walk-In Sales at Risk",
            "finding": (
                f"{len(low_stock_counter)} SKUs at the counter need immediate replenishment. "
                f"Critically low: {top_sku.get('sku', '?')} ({top_sku.get('counter_stock', 0)} units left). "
                f"Today's counter revenue: ₹{_format_lakh(daily_pos_rev)}."
            ),
            "impact": f"Walk-in lost sales risk on {len(low_stock_counter)} SKUs — counter revenue is ₹{_format_lakh(daily_pos_rev)}/day",
            "action": (
                f"Immediately replenish {top_sku.get('sku', 'counter SKUs')} from Main Godown. "
                "Set daily replenishment task: counter stock checked every morning before 10 AM."
            ),
            "urgency": "TODAY",
            "rupee_impact": daily_pos_rev,
        })

    # ── 20. Warehouse Capacity Alert ──────────────────────────────────────────
    warehouse_data = tool_data.get("warehouse", {})
    warehouses = warehouse_data.get("warehouses", [])
    near_capacity = [w for w in warehouses if w.get("utilisation_pct", 0) >= 80]
    if near_capacity:
        top_wh = near_capacity[0]
        cap_pct = top_wh.get("utilisation_pct", 0)
        wh_val = _parse_rupee(str(top_wh.get("value", "₹0")).replace("₹", "Rs."))
        insights.append({
            "id": f"warehouse_near_capacity_{top_wh.get('name', 'main')[:20].replace(' ', '_')}",
            "category": "🏗️ Warehouse",
            "severity": "MEDIUM" if cap_pct < 90 else "HIGH",
            "title": f"Warehouse Capacity Alert: {top_wh.get('name', 'Main Godown')} at {cap_pct}%",
            "finding": (
                f"{top_wh.get('name', 'Main Godown')} is at {cap_pct}% capacity "
                f"({top_wh.get('stock', 0)}/{top_wh.get('capacity', 0)} units, ₹{_format_lakh(wh_val)} value). "
                f"Inbound POs may not fit without clearing space. "
                f"{warehouse_data.get('summary', {}).get('near_capacity_alert', '')}"
            ),
            "impact": f"Inbound stock deliveries will be blocked if godown exceeds 90% — procurement plan at risk",
            "action": (
                "Expedite dispatch of pending orders to free capacity. "
                "Identify slow-moving SKUs to shift to Transit Hub or liquidate. "
                "Pre-arrange flat-rack space reorg before next inbound shipment."
            ),
            "urgency": "THIS WEEK",
            "rupee_impact": int(wh_val * 0.05),  # 5% capacity constraint risk estimate
        })

    # ── 21. Open Sales Return Credit Balance ─────────────────────────────────
    sr_data = tool_data.get("sales_return", {})
    open_credit_notes = sr_data.get("open_credit_notes", [])
    open_balance_str = sr_data.get("summary", {}).get("open_credit_balance", "₹0")
    open_balance = _parse_rupee(str(open_balance_str).replace("₹", "Rs."))
    if open_credit_notes and open_balance > 5_000:
        top_cn = open_credit_notes[0]
        insights.append({
            "id": "open_sales_return_credit",
            "category": "↩️ Sales Returns",
            "severity": "LOW",
            "title": f"{len(open_credit_notes)} Open Credit Notes — {open_balance_str} Pending Settlement",
            "finding": (
                f"{len(open_credit_notes)} sales return credit notes are open and unapplied. "
                f"Total open balance: {open_balance_str}. "
                f"Oldest open: {top_cn.get('customer', '?')} — ₹{top_cn.get('balance', '0')} "
                f"(valid until {top_cn.get('valid_until', '?')})."
            ),
            "impact": f"{open_balance_str} in credit notes that reduce customer receivables when applied — recover against next invoice",
            "action": (
                f"Contact {top_cn.get('customer', 'customers with open credit')} — apply credit note against their next purchase invoice. "
                "Closed credit notes reduce DSO and improve customer goodwill."
            ),
            "urgency": "THIS WEEK",
            "rupee_impact": open_balance,
        })

    # ── 22. Landing Cost Overhead Spike ───────────────────────────────────────
    lc_data = tool_data.get("landing_cost", {})
    recent_sheets = lc_data.get("recent_sheets", [])
    avg_overhead = lc_data.get("summary", {}).get("avg_overhead_pct", 0)
    try:
        avg_overhead_f = float(avg_overhead)
    except (ValueError, TypeError):
        avg_overhead_f = 0
    if recent_sheets and avg_overhead_f >= 10:
        top_sheet = recent_sheets[0]
        landed_val = _parse_rupee(
            str(top_sheet.get("total_landed_cost", "₹0")).replace("₹", "Rs.")
        )
        invoice_val = _parse_rupee(
            str(top_sheet.get("invoice_value", "₹0")).replace("₹", "Rs.")
        )
        overhead_gap = landed_val - invoice_val
        if overhead_gap > 5_000:
            insights.append({
                "id": "landing_cost_overhead_spike",
                "category": "💸 Landing Cost",
                "severity": "MEDIUM",
                "title": f"High Landed Cost Overhead: {avg_overhead_f:.0f}% Avg — Margin Being Eroded",
                "finding": (
                    f"Average overhead on landed cost sheets is {avg_overhead_f:.0f}% (target: 6-8% domestic). "
                    f"Latest sheet: {top_sheet.get('supplier', '?')} — "
                    f"Invoice {top_sheet.get('invoice_value', '?')} → Landed {top_sheet.get('total_landed_cost', '?')} "
                    f"(₹{_format_lakh(overhead_gap)} overhead). "
                    f"Impact: {top_sheet.get('per_unit_impact', '?')}."
                ),
                "impact": f"₹{_format_lakh(overhead_gap)} overhead on recent purchase — margin gap vs invoice-based pricing",
                "action": (
                    "Reprice affected SKUs using true landed cost (not invoice price). "
                    "Negotiate freight inclusion with supplier for next PO. "
                    "Review if Domestic Road can be substituted with Local Pickup for nearby suppliers."
                ),
                "urgency": "THIS WEEK",
                "rupee_impact": overhead_gap,
            })

    # ── 23. Delivered But Unpaid Sales Orders ────────────────────────────────
    louvers_data     = tool_data.get("louvers", {})
    delivered_unpaid = louvers_data.get("delivered_unpaid_orders", [])
    unpaid_val_str   = louvers_data.get("summary", {}).get("delivered_unpaid_value", "₹0")
    unpaid_val       = _parse_rupee(unpaid_val_str.replace("₹", "Rs."))
    if delivered_unpaid and unpaid_val > 50_000:
        top_u = delivered_unpaid[0]
        partial_count = louvers_data.get("summary", {}).get("partial_payment_count", 0)
        insights.append({
            "id": "delivered_unpaid_orders",
            "category": "💰 Collections",
            "severity": "HIGH",
            "title": (
                f"{len(delivered_unpaid)} Delivered Orders Unpaid"
                f" — {unpaid_val_str} Outstanding"
            ),
            "finding": (
                f"{len(delivered_unpaid)} sales orders are marked DELIVERED but payment_status"
                f" is UNPAID. Top outstanding: SO#{top_u.get('#', '?')} for"
                f" {top_u.get('customer', '?')} ({top_u.get('value', '?')})."
                + (f" Additionally {partial_count} orders are PARTIAL." if partial_count else "")
                + " Goods are delivered — cash collection is 100% in scope."
            ),
            "impact": (
                f"{unpaid_val_str} in receivables due now. These are invoiced, delivered, and"
                " zero-risk — no dispute basis exists once POD is captured."
            ),
            "action": (
                "Call each customer today to collect payment. Once received, click the 💳 badge"
                " on the Sales Orders screen to cycle to PAID. Update partial payments to PARTIAL"
                " and note reference in payment_ref."
            ),
            "urgency": "TODAY",
            "rupee_impact": unpaid_val,
        })

    # ── 24. Sales Return Damage Pattern ──────────────────────────────────────
    damage_data      = tool_data.get("damage", {})
    sr_incidents     = damage_data.get("summary", {}).get("sales_return_damage_incidents", 0)
    sr_val_str       = damage_data.get("summary", {}).get("total_sr_damage_value", "₹0")
    sr_val           = _parse_rupee(sr_val_str.replace("₹", "Rs."))
    recent_sr        = damage_data.get("recent_sr_damages", [])
    if sr_incidents > 0 and sr_val > 2_000:
        sku_counts: dict = {}
        for rec in recent_sr:
            sku = rec.get("product") or rec.get("sku") or rec.get("sku_name", "Unknown")
            sku_counts[sku] = sku_counts.get(sku, 0) + 1
        top_sku = max(sku_counts, key=lambda k: sku_counts[k]) if sku_counts else "Unknown"
        fully_dmg = sum(1 for r in recent_sr if r.get("condition") == "FULLY_DAMAGED")
        insights.append({
            "id": "sales_return_damage_pattern",
            "category": "📦 Returns & Damage",
            "severity": "MEDIUM" if sr_val < 50_000 else "HIGH",
            "title": (
                f"{sr_incidents} Sales Return Damage Incidents"
                f" — {sr_val_str} Written Off"
            ),
            "finding": (
                f"{sr_incidents} sales returns logged damage on return."
                + (f" {fully_dmg} items were FULLY_DAMAGED and written off entirely." if fully_dmg else "")
                + (f" Highest repeat SKU: {top_sku} ({sku_counts.get(top_sku, 1)} incidents)." if top_sku != "Unknown" else "")
                + f" Total damage loss: {sr_val_str}."
            ),
            "impact": (
                f"{sr_val_str} in write-off losses from sales returns."
                " Pattern indicates possible packaging, handling, or product quality issues."
            ),
            "action": (
                f"Review packaging for SKU {top_sku}. Raise vendor quality claim if damage"
                " is supplier-attributable. Investigate customer handling patterns."
                " Consider adding pre-dispatch quality photos to reduce dispute risk."
            ),
            "urgency": "THIS WEEK",
            "rupee_impact": sr_val,
        })

    # ── 25. Design Quote Pipeline — Negotiating & Follow-up Alerts ───────────
    dq_data = tool_data.get("design_quote", {})
    dq_quotes = dq_data.get("recent_quotes", [])
    action_items = dq_data.get("action_items", [])
    negotiating = [q for q in dq_quotes if q.get("status") == "NEGOTIATING"]
    sent_quotes  = [q for q in dq_quotes if q.get("status") == "SENT"]
    if (negotiating or sent_quotes) and action_items:
        neg_val = sum(q.get("total_value", 0) for q in negotiating)
        sent_val = sum(q.get("total_value", 0) for q in sent_quotes)
        pipeline_val = neg_val + sent_val
        dq_summary = dq_data.get("quote_summary", {})
        insights.append({
            "id": "design_quote_pipeline_alert",
            "category": "🎨 Design Quotes",
            "severity": "MEDIUM",
            "title": f"Design Quote Pipeline: ₹{_format_lakh(pipeline_val)} Needs Follow-up",
            "finding": (
                f"{len(negotiating)} quote(s) in NEGOTIATING + {len(sent_quotes)} SENT. "
                f"Win rate: {dq_summary.get('win_rate', '?')} (benchmark: 35-45%). "
                f"Pipeline: {dq_summary.get('total_pipeline_value', '?')} total. "
                + (f"Action: {action_items[0]}" if action_items else "")
            ),
            "impact": f"₹{_format_lakh(pipeline_val)} in active design quote pipeline — follow-up converts this to revenue",
            "action": (
                "Follow up on NEGOTIATING quotes immediately — protect margin floor (18% minimum). "
                "Call clients on SENT quotes aging >5 days. Re-issue any expired quotes with updated catalog pricing."
            ),
            "urgency": "THIS WEEK",
            "rupee_impact": pipeline_val,
        })

    # ── 26. Overdue Sales Invoice Collection Alert ────────────────────────────
    inv_data    = tool_data.get("invoices", {})
    inv_summary = inv_data.get("summary", {})
    overdue_inv = inv_data.get("overdue_invoices", [])
    inv_overdue_val = inv_summary.get("overdue", 0)
    if isinstance(inv_overdue_val, (int, float)) and inv_overdue_val > 0:
        oldest_days = max((i.get("overdue_days", 0) for i in overdue_inv), default=0)
        insights.append({
            "id": "invoice_overdue_collection",
            "category": "🧾 Invoice Collection",
            "severity": "HIGH" if inv_overdue_val > 200000 else "MEDIUM",
            "title": f"₹{_format_lakh(int(inv_overdue_val))} in Overdue Sales Invoices — {len(overdue_inv)} Invoice(s)",
            "finding": (
                f"{len(overdue_inv)} invoice(s) overdue totalling ₹{_format_lakh(int(inv_overdue_val))}. "
                f"Oldest overdue: {oldest_days} days. "
                + (f"Highest risk: {overdue_inv[0]['customer']} — ₹{_format_lakh(int(overdue_inv[0]['amount']))} ({overdue_inv[0]['overdue_days']}d overdue)." if overdue_inv else "")
            ),
            "impact": f"₹{_format_lakh(int(inv_overdue_val))} in receivables at collection risk — interest clock running at 18% p.a.",
            "action": (
                "1. Send formal payment reminder for all overdue invoices today. "
                "2. Call customers > 60 days overdue — escalate to MD if > 90 days. "
                "3. Put overdue accounts on cash-only terms for next order. "
                "4. Evaluate reversing ITC if invoices unpaid > 180 days (GST rule)."
            ),
            "urgency": "TODAY" if oldest_days > 60 else "THIS WEEK",
            "rupee_impact": int(inv_overdue_val),
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
