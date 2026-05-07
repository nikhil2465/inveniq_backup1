"""
Root Cause Analysis (RCA) Engine for StockSense AI
Multi-level, 5-Why and Ishikawa-inspired RCA for inventory and business issues.

Also provides structured RCA templates for the Act mode chatbot responses.
Templates follow PDCA (Plan-Do-Check-Act) + 5-Why methodology — industry gold standard.
"""
from typing import List, Dict, Any, Optional


# =============================================================================
# RCA TEMPLATES — Structured problem-solving frameworks for Act mode
# Format: category → {problem, symptom_keywords, 5_why, fishbone, action_plan}
# =============================================================================

_RCA_TEMPLATES = {
    "grn_mismatch_wrong_grade": {
        "title": "GRN Discrepancy — Wrong Grade Received",
        "symptom_triggers": ["wrong grade", "incorrect grade", "grn mismatch", "grade mismatch", "grn issue", "wrong item", "wrong product", "grn problem", "grn discrepancy"],
        "problem_statement": "Supplier shipped wrong product grade — quality/specification deviation.",
        "5_why": [
            "Why wrong grade? → Supplier picked incorrect SKU from their warehouse",
            "Why wrong pick? → Our PO SKU code not matched to supplier's internal code",
            "Why no code map? → No formal supplier SKU mapping document shared",
            "Why no check? → Pre-shipment quality inspection not contracted",
            "Why no inspection? → Cost seen as unnecessary; supplier 'trusted'",
        ],
        "fishbone_causes": {
            "Supplier Process": "No pre-dispatch QC gate; incorrect warehouse picking",
            "Documentation": "PO lacks supplier-specific SKU codes; ambiguous spec sheet",
            "Communication": "No grade confirmation email/WhatsApp before dispatch",
            "Systems": "No 3-way match alert in place before GRN acceptance",
            "Measurement": "Grade not visually verified at gate by store keeper",
        },
        "action_plan": [
            "IMMEDIATE: Reject shipment / raise Return Memo citing PO vs GRN grade variance",
            "IMMEDIATE: Document with photos — attach to GRN; block supplier invoice",
            "THIS WEEK: Share formal SKU mapping table with supplier (your code ↔ their code)",
            "THIS WEEK: Issue updated PO with supplier's own product code added to description",
            "THIS MONTH: Add mandatory gate-level grade check to GRN SOP",
            "THIS MONTH: Include penalty clause for wrong-grade shipments in vendor contract",
        ],
        "prevention": "Supplier SKU mapping + pre-dispatch photo confirmation eliminates 90% of grade errors",
    },

    "grn_mismatch_short_delivery": {
        "title": "GRN Discrepancy — Short Delivery",
        "symptom_triggers": ["short delivery", "short by", "shortage", "less quantity", "partial delivery", "short shipment", "less received", "quantity mismatch"],
        "problem_statement": "Supplier delivered fewer units than ordered — quantity shortfall.",
        "5_why": [
            "Why short delivery? → Supplier partially fulfilled order from available stock",
            "Why partial stock? → Supplier didn't check inventory before accepting our PO",
            "Why no inventory check? → No acknowledgement/commitment process before dispatch",
            "Why no commitment? → Purchase process informal; only phone/WhatsApp confirmation",
            "Why informal? → No formal PO acknowledgement requirement in supplier contract",
        ],
        "fishbone_causes": {
            "Supplier Process": "No stock check before dispatch; partial shipment without notice",
            "Communication": "Shortfall not communicated before delivery; no advance shipping notice",
            "Documentation": "No delivery note / advance shipping advice (ASA) process",
            "Contract": "No minimum fill-rate clause in vendor agreement",
            "Measurement": "No inbound count verification at unloading",
        },
        "action_plan": [
            "IMMEDIATE: Count & document the shortfall; raise Credit Note for missing quantity",
            "IMMEDIATE: Call supplier — demand remaining quantity dispatch within 2 days",
            "THIS WEEK: Require Advance Shipping Notice (ASN) 24 hrs before all deliveries",
            "THIS WEEK: Add fill-rate KPI tracking to supplier scorecard",
            "THIS MONTH: Insert 'minimum 95% fill rate per shipment' clause in vendor contract",
            "THIS MONTH: Auto-flag PO as PARTIAL if GRN qty < 90% of ordered qty",
        ],
        "prevention": "ASN + gate counting + fill-rate SLA eliminates short delivery disputes",
    },

    "grn_mismatch_price_variance": {
        "title": "GRN Discrepancy — Invoice Price Mismatch",
        "symptom_triggers": ["price mismatch", "invoice mismatch", "rate mismatch", "price variance", "wrong rate", "invoice dispute", "rate dispute", "price issue", "payment dispute"],
        "problem_statement": "Supplier invoiced at different rate than agreed PO price.",
        "5_why": [
            "Why price mismatch? → Supplier applied updated price list without formal amendment",
            "Why no amendment? → No price lock clause in PO or vendor agreement",
            "Why no price lock? → PO raised without formal rate confirmation from supplier",
            "Why no confirmation? → Price negotiated verbally; not captured in writing",
            "Why verbal only? → Informal procurement process; no digital price master",
        ],
        "fishbone_causes": {
            "Process": "PO price not formally confirmed by supplier before dispatch",
            "Documentation": "No signed price agreement for the period; verbal deal only",
            "Systems": "No automatic 3-way match between PO rate, GRN, and invoice",
            "Communication": "Price hike not formally communicated before shipment",
            "Control": "No invoice approval gate before payment release",
        },
        "action_plan": [
            "IMMEDIATE: Block payment on this invoice — raise formal price dispute",
            "IMMEDIATE: Send written notice citing PO rate vs invoice rate discrepancy",
            "THIS WEEK: Require supplier to send corrected invoice at PO rate OR credit note",
            "THIS WEEK: Implement 3-way match: PO rate = GRN rate = Invoice rate before approval",
            "THIS MONTH: Create a quarterly price master sheet signed by all suppliers",
            "THIS MONTH: Add payment block rule: invoice >2% above PO rate needs MD approval",
        ],
        "prevention": "Signed quarterly price master + 3-way match eliminates all price disputes",
    },

    "overdue_po_supplier": {
        "title": "Overdue Purchase Order — Supplier Delay",
        "symptom_triggers": ["overdue po", "delayed po", "late delivery", "supplier delay", "po overdue", "overdue", "late po", "po delay", "po not received", "delivery delay", "supplier late", "pending po"],
        "problem_statement": "Purchase order past expected delivery date — supply chain disruption risk.",
        "5_why": [
            "Why overdue? → Supplier didn't dispatch by the expected date",
            "Why no dispatch? → Supplier has production/stock constraints not communicated",
            "Why not communicated? → No proactive delay notification process with supplier",
            "Why no notification? → No SLA with penalty for late communication",
            "Why no SLA? → Vendor agreement doesn't include delivery performance clauses",
        ],
        "fishbone_causes": {
            "Supplier Capacity": "Supplier over-committed across multiple buyers",
            "Communication": "No proactive delay notification; follow-up burden on buyer",
            "Planning": "Order placed with insufficient lead time buffer",
            "Contract": "No delivery penalty / escalation clause in vendor agreement",
            "Monitoring": "No automated PO tracking or overdue alert system",
        },
        "action_plan": [
            "IMMEDIATE: Call supplier operations head — get firm revised ETA in writing",
            "IMMEDIATE: Assess stock cover days — if <7 days, emergency source from Century/Greenply",
            "TODAY: Put overdue PO on daily tracking; escalate after 24 hrs of no response",
            "THIS WEEK: Formal written notice to supplier — delay impacts SLA score",
            "THIS WEEK: Qualify alternate supplier for same SKU (dual-source strategy)",
            "THIS MONTH: Add 0.5% price reduction per day delay clause to vendor contract",
        ],
        "prevention": "Early warning system (T-2 days reminder) + alternate supplier means zero stockout risk",
    },

    "stockout_prevention": {
        "title": "Stockout Prevention — Critical SKU Reorder",
        "symptom_triggers": ["stockout", "out of stock", "critical low", "low stock", "reorder", "running low", "stock running out", "critical stock", "stock shortage", "no stock", "stock action", "urgent order"],
        "problem_statement": "SKU approaching zero stock — lost sales and customer dissatisfaction risk.",
        "5_why": [
            "Why low stock? → Reorder point reached but PO not placed in time",
            "Why PO not placed? → Manual reorder check missed; no automated alert",
            "Why no automation? → Reorder points set but not linked to alert system",
            "Why no link? → Stock monitoring still manual (daily physical count or Tally)",
            "Why manual? → No real-time stock tracking or DMS reorder module configured",
        ],
        "fishbone_causes": {
            "Process": "Manual stock checking; reorder trigger missed by staff",
            "Systems": "No automated reorder alert when stock hits threshold",
            "Supplier Lead Time": "6-7 day lead time not factored into safety stock calculation",
            "Demand": "Demand spike not anticipated; faster-than-forecast consumption",
            "Planning": "Safety stock not recalculated after demand velocity increased",
        },
        "action_plan": [
            "IMMEDIATE: Place emergency PO with Century Plyboards (96% on-time, fastest lead time)",
            "IMMEDIATE: Check substitute SKU availability to partially fulfil pending orders",
            "TODAY: Call top 3 customers with pending orders — set revised delivery expectations",
            "THIS WEEK: Recalculate safety stock = (Max daily demand × Max lead time) for all A-SKUs",
            "THIS WEEK: Set automated reorder alerts for all A-class SKUs at 15-day cover",
            "THIS MONTH: Implement min-max inventory policy: min = reorder point, max = 30d cover",
        ],
        "prevention": "Automated reorder at 15-day cover + Century as backup source = zero stockouts",
    },

    "dead_stock_clearance": {
        "title": "Dead Stock Clearance — Cash Recovery Plan",
        "symptom_triggers": ["dead stock", "non-moving", "aged stock", "slow mover", "old stock", "slow moving", "excess stock", "overstock", "stuck stock", "no sales", "clearance", "not selling", "idle stock"],
        "problem_statement": "Inventory with no movement for 90+ days — capital locked, carrying cost rising.",
        "5_why": [
            "Why dead stock? → Product demand shifted; over-purchased based on old patterns",
            "Why over-purchased? → Order quantities based on historical sales, not current demand",
            "Why no demand update? → No demand forecasting tool or monthly SKU velocity review",
            "Why no review? → Category management process not defined; purchase is reactive",
            "Why reactive? → No ABC-based purchasing discipline for C-class SKUs",
        ],
        "fishbone_causes": {
            "Purchasing": "Bulk buying without demand signal for slow-moving SKUs",
            "Forecasting": "No SKU-level demand review before placing replenishment orders",
            "Pricing": "No automatic discount trigger for 60-day non-movers",
            "Market": "Customer preference shifted (e.g., from 6mm to 8mm grade)",
            "Process": "No monthly dead stock review meeting with purchase team",
        },
        "action_plan": [
            "IMMEDIATE: List all dead SKUs with value, age, and buyer contact",
            "TODAY: Call top 5 contractors — offer 12-15% discount for dead stock clearance",
            "THIS WEEK: Bundle dead SKUs with fast-moving A-SKU orders (e.g., free 4mm with 18mm BWP)",
            "THIS WEEK: Check supplier return policy — return slow-movers if within 90-day window",
            "THIS MONTH: Set automatic 10% discount trigger for any SKU with 60+ days no movement",
            "THIS MONTH: Add 'dead stock review' as standing agenda item in weekly ops meeting",
        ],
        "prevention": "Monthly SKU velocity review + automatic discount trigger = dead stock under 2% of inventory",
    },

    "working_capital_high": {
        "title": "Working Capital Optimisation",
        "symptom_triggers": ["working capital", "cash cycle", "cash flow", "dso", "dio", "dpo", "cash stuck", "cash locked", "collections", "receivables", "outstanding", "credit period", "payment terms"],
        "problem_statement": "Cash cycle exceeding 40-day target — money working for customers, not the business.",
        "5_why": [
            "Why high cash cycle? → DSO 34d + DIO 22d > DPO 8d = 48d total",
            "Why high DSO? → Customers paying at end of credit period; no early payment incentive",
            "Why high DIO? → Dead stock inflating average inventory days",
            "Why low DPO? → Paying suppliers in 8 days when 30-day terms available",
            "Why not using terms? → Team wants to maintain 'good relationship'; terms not negotiated",
        ],
        "fishbone_causes": {
            "Receivables (DSO)": "No early payment discount; collections team lacks escalation authority",
            "Inventory (DIO)": "₹7.8L dead stock adding ~4 days to DIO",
            "Payables (DPO)": "Paying Century/Greenply in 8 days vs available 30-day terms",
            "Process": "No cash flow dashboard; WC impact not measured weekly",
            "Pricing": "No dynamic discount for fast-paying customers",
        },
        "action_plan": [
            "IMMEDIATE: Offer 1.5% early payment discount to customers paying within 10 days",
            "TODAY: Call Century Plyboards — negotiate NET-30 payment terms (they want your volume)",
            "THIS WEEK: Prioritise dead stock clearance (₹7.8L) to reduce DIO by 3-4 days",
            "THIS WEEK: Send overdue collection notices to Sharma Constructions (₹3.4L, 78d)",
            "THIS MONTH: Target: DSO 28d, DIO 18d, DPO 22d → Cash cycle <40 days",
            "THIS MONTH: Review credit limits for all HIGH-risk customers; reduce or block",
        ],
        "prevention": "Early payment discount + NET-30 with suppliers + dead stock clearance = cash cycle under 40 days",
    },

    "supplier_reliability": {
        "title": "Supplier Reliability Improvement",
        "symptom_triggers": ["supplier reliability", "on-time", "delivery performance", "supplier score", "supplier problem", "bad supplier", "vendor issue", "supplier issue", "poor supplier", "supplier performance", "vendor performance", "supplier rating"],
        "problem_statement": "Supplier below 80% on-time delivery — unpredictable supply chain.",
        "5_why": [
            "Why low on-time rate? → Supplier capacity constrained; multiple buyer commitments",
            "Why over-committed? → No visibility into their production schedule shared with us",
            "Why no visibility? → No formal vendor performance review meeting scheduled",
            "Why no meeting? → Relationship managed informally via sales rep only",
            "Why informal? → No supplier development programme or vendor rating system",
        ],
        "fishbone_causes": {
            "Supplier Capacity": "Supplier production constrained; other buyers taking priority",
            "Relationships": "No formal business review; no penalty/incentive structure",
            "Alternative Sourcing": "No qualified alternate supplier for this product category",
            "Contract": "No delivery performance clause; supplier faces no consequence",
            "Communication": "Delay communicated only when it's already too late to act",
        },
        "action_plan": [
            "IMMEDIATE: Put supplier on formal probation — minimum orders only until score improves",
            "IMMEDIATE: Source 30% of volume from alternate supplier to reduce dependency",
            "THIS WEEK: Schedule formal supplier review meeting — share their scorecard data",
            "THIS WEEK: Add penalty clause: 0.5% credit note per day delay beyond ETA",
            "THIS MONTH: Qualify secondary supplier for same product category (dual-source)",
            "THIS MONTH: Monthly supplier performance dashboard — share with supplier monthly",
        ],
        "prevention": "Dual-source policy + formal monthly review + penalty clause = 95%+ on-time delivery",
    },

    "customer_payment_dispute": {
        "title": "Customer Payment Dispute & Bad Debt Recovery",
        "symptom_triggers": ["payment dispute", "bad debt", "customer not paying", "overdue payment", "customer dispute", "collections", "overdue receivable", "customer owes", "outstanding payment", "pending payment", "not paid", "not clearing dues", "stuck payment"],
        "problem_statement": "Customer refusing or delaying payment — overdue account threatening to become bad debt.",
        "5_why": [
            "Why not paid? → Customer disputes quality/quantity of goods received",
            "Why dispute? → No signed delivery acknowledgement captured at time of delivery",
            "Why no acknowledgement? → Delivery team skips sign-off step to save time",
            "Why no enforcement? → No SOP requiring POD (Proof of Delivery) before invoicing",
            "Why no POD policy? → Informal credit sales process; no digital documentation discipline",
        ],
        "fishbone_causes": {
            "Documentation": "No signed POD or delivery receipt — dispute cannot be resolved with evidence",
            "Credit Process": "Credit extended without signed agreement or credit limit form",
            "Communication": "Invoice disputes not escalated to owner within 7 days — delays recovery",
            "Legal": "No promissory note or PDC cheque collected for high-value credits",
            "Relationship": "Over-reliance on relationship — hesitation to escalate with valued customer",
        },
        "action_plan": [
            "IMMEDIATE: Call customer within 24h — determine exact dispute reason without confrontation",
            "IMMEDIATE: Pull delivery receipt, POD photo, WhatsApp confirmation as evidence",
            "TODAY: Send formal written demand letter with invoice copy and delivery proof",
            "THIS WEEK: Offer 1% settlement discount for immediate payment (cheaper than legal cost)",
            "THIS WEEK: If dispute genuine — raise credit note for agreed amount; get balance paid",
            "THIS MONTH: Collect PDC cheque or signed promissory note for outstanding HIGH-risk accounts",
            "THIS MONTH: Mandate digital POD (delivery photo + customer signature) for all credit sales",
        ],
        "prevention": "Signed POD + PDC cheque for credit >₹1L + 45-day credit limit enforcement = bad debt <1%",
    },

    "dispatch_picking_error": {
        "title": "Dispatch Error — Wrong Item / Wrong Quantity Shipped",
        "symptom_triggers": ["wrong item", "wrong quantity", "wrong shipment", "incorrect delivery", "dispatch error", "picking error", "wrong grade delivered", "customer received wrong", "wrong product delivered", "delivery mistake", "incorrect item"],
        "problem_statement": "Customer received wrong item or wrong quantity — return, replacement, and relationship damage.",
        "5_why": [
            "Why wrong item? → Picker selected incorrect SKU from similar-looking shelf location",
            "Why similar location? → Storage layout groups similar grades together without clear bin labels",
            "Why no labels? → Physical bin marking not maintained — labels faded or missing",
            "Why not checked? → No second-person verification (double-check) before loading",
            "Why no verification? → Urgency to dispatch quickly — quality check skipped under pressure",
        ],
        "fishbone_causes": {
            "Warehouse Layout": "Similar SKUs stored adjacently — high confusion risk for pickers",
            "Process": "No dual-check (pick + verify) before truck loading",
            "Documentation": "Picking list not matched against delivery challan before dispatch",
            "Training": "Staff not trained to verify SKU code vs description vs physical appearance",
            "Systems": "No barcode scan or digital pick-list confirmation in the dispatch process",
        },
        "action_plan": [
            "IMMEDIATE: Call customer — arrange pickup + correct replacement delivery within 24h",
            "IMMEDIATE: Inspect returned goods — determine if reusable or damaged",
            "TODAY: Document error with photos — update dispatch SOP to include this failure mode",
            "THIS WEEK: Implement double-check rule: picker packs, supervisor checks before truck loads",
            "THIS WEEK: Colour-code bin locations for each grade family (BWP=green, MR=blue, Commercial=red)",
            "THIS MONTH: Add delivery challan cross-check step to loading SOP — no truck leaves without sign-off",
        ],
        "prevention": "Colour-coded bins + double-check loading + digital pick-list verification = <0.2% dispatch errors",
    },

    "margin_erosion": {
        "title": "Margin Erosion — Competitor Price Pressure",
        "symptom_triggers": ["margin falling", "margin erosion", "margin dropping", "losing customers to competitor", "competitor undercutting", "price war", "margin squeeze", "profitability falling", "gross margin declining", "discount pressure", "price pressure", "competitor pricing"],
        "problem_statement": "Gross margin declining due to competitor price pressure or uncontrolled discount leakage.",
        "5_why": [
            "Why margin falling? → Sales team giving excessive discounts to retain price-sensitive customers",
            "Why excessive discounts? → No discount approval matrix — any rep can offer up to 20%",
            "Why no matrix? → Discount policy not documented; informal decisions made deal-by-deal",
            "Why no documentation? → No margin floor or min-price rule enforced at invoice level",
            "Why no enforcement? → Owner not reviewing per-SKU margin monthly — only total revenue visible",
        ],
        "fishbone_causes": {
            "Pricing Policy": "No formal discount matrix by customer segment and quantity tier",
            "Measurement": "Per-SKU margin not tracked — hidden leakage undetected for months",
            "Sales Process": "Sales team rewarded on revenue, not on margin — wrong incentive",
            "Competitive Intel": "No tracking of competitor price moves — reactive discounting",
            "Product Mix": "Shift toward lower-margin commercial grades diluting overall portfolio margin",
        },
        "action_plan": [
            "IMMEDIATE: Pull per-SKU margin report — identify top 3 margin-destroying products/customers",
            "TODAY: Set minimum price per SKU in Tally — no invoice below floor price without MD approval",
            "THIS WEEK: Implement discount matrix: Contractor ≤8%, Retailer ≤6%, Interior Firm ≤5%",
            "THIS WEEK: Switch sales incentive to 'margin ₹' not 'revenue ₹' — aligns rep behaviour",
            "THIS MONTH: Monthly margin review meeting: which SKUs, reps, and customers eroding margin",
            "THIS MONTH: Run true landed cost analysis — fix 8mm Flexi (6.7% true margin) pricing now",
        ],
        "prevention": "Margin floor in Tally + discount approval matrix + monthly per-SKU review = margin stable at 22%+",
    },

    "demand_forecast_miss": {
        "title": "Demand Forecast Miss — Over/Under Purchasing",
        "symptom_triggers": ["over purchased", "under purchased", "forecast wrong", "demand miss", "wrong forecast", "excess stock", "stocked too much", "didn't forecast", "wrong demand", "poor forecast", "forecast accuracy", "bought too much", "bought too little"],
        "problem_statement": "Significant gap between forecasted and actual demand — excess stock or stockout due to planning failure.",
        "5_why": [
            "Why forecast miss? → Purchase order based on last month's sales, not forward demand signal",
            "Why no forward signal? → No demand forecasting process — purely historical reactive ordering",
            "Why no forecasting? → No tool or template for monthly SKU-level demand planning",
            "Why no tool? → Demand planning seen as complex; team relies on 'gut feel' and experience",
            "Why gut feel? → No accountability for forecast accuracy — miss has no consequence",
        ],
        "fishbone_causes": {
            "Process": "Reactive purchasing — order when empty, not before empty based on forecast",
            "Data": "No historical demand trend analysis per SKU per season",
            "External Signals": "No tracking of construction permits, project pipeline, competitor activity",
            "Team": "Purchaser not involved in sales review — buying decisions made in isolation",
            "Measurement": "Forecast accuracy never measured — no MAE or bias tracking",
        },
        "action_plan": [
            "IMMEDIATE: Identify over-purchased SKUs → start clearance at 10-15% discount",
            "IMMEDIATE: Identify under-purchased SKUs → emergency PO from alternate source",
            "THIS WEEK: Pull 12-month demand history by SKU — calculate seasonal index",
            "THIS WEEK: Set monthly demand review meeting: sales + purchase head together",
            "THIS MONTH: Implement 3-month rolling forecast for all A-class SKUs (Excel is sufficient to start)",
            "THIS MONTH: Track forecast accuracy monthly — target MAE <15% per SKU",
        ],
        "prevention": "3-month rolling forecast + monthly S&OP meeting + seasonal index = forecast error <15%",
    },

    "cash_flow_crisis": {
        "title": "Cash Flow Crisis — Immediate Liquidity Crunch",
        "symptom_triggers": ["cash flow problem", "cash crisis", "no cash", "cash crunch", "liquidity problem", "can't pay supplier", "running out of cash", "cash stuck", "cash shortage", "overdraft", "working capital crisis", "need cash urgently", "cash flow issue"],
        "problem_statement": "Immediate cash shortage — unable to pay suppliers or operating expenses on time.",
        "5_why": [
            "Why cash shortage? → Collections not matching purchase commitments for the month",
            "Why mismatch? → Credit extended to customers (DSO 34d) but paying suppliers in 8d",
            "Why paying early? → No payment terms negotiated with suppliers — defaulting to immediate",
            "Why high receivables? → Large outstanding from 2-3 customers with 60+ day overdue",
            "Why no escalation? → No weekly collections review or escalation protocol for >30d overdue",
        ],
        "fishbone_causes": {
            "Receivables": "₹12.8L outstanding — top 3 accounts each >₹1L overdue >45 days",
            "Payables": "Paying suppliers NET-8 while standard is NET-30 — losing 22 days of float",
            "Stock": "₹7.8L locked in dead/slow stock — cannot convert to cash quickly",
            "Planning": "No 13-week rolling cash flow forecast — crisis discovered too late",
            "Collections": "No escalation process — sales team reluctant to press valued customers",
        },
        "action_plan": [
            "IMMEDIATE: Call top 3 overdue customers TODAY — offer 1.5% settlement discount for payment this week",
            "IMMEDIATE: Call Century/Greenply — request 30-day payment extension on next PO",
            "TODAY: List all dead stock — offer to liquidators at 25% discount for immediate cash",
            "TODAY: Review all upcoming POs — defer non-critical orders by 2 weeks",
            "THIS WEEK: Apply for CC (Cash Credit) limit from bank against stock value as collateral",
            "THIS WEEK: Implement weekly collections tracker — review every Monday with owner",
            "THIS MONTH: Build 13-week rolling cash flow forecast — update every Friday",
        ],
        "prevention": "Weekly collections review + NET-30 with suppliers + 13-week cash forecast = no surprise cash crisis",
    },
}


def get_act_rca_templates(query: str, tool_data: dict) -> str:
    """
    Return relevant RCA templates for Act mode based on the user query.
    Injects structured PDCA + 5-Why templates as context for the LLM.
    """
    q = query.lower()
    matched = []

    for key, tmpl in _RCA_TEMPLATES.items():
        if any(trigger in q for trigger in tmpl["symptom_triggers"]):
            matched.append(tmpl)

    # Also check tool data context (po_grn data signals)
    po_data = tool_data.get("po_grn", {})
    supplier_data = tool_data.get("supplier", {})
    stock_data = tool_data.get("stock", {})

    if not matched:
        # Infer from context
        if po_data.get("grn_discrepancies"):
            matched.append(_RCA_TEMPLATES["grn_mismatch_price_variance"])
        if any(s.get("on_time_pct", 100) < 80 for s in supplier_data.get("suppliers", [])):
            if _RCA_TEMPLATES["supplier_reliability"] not in matched:
                matched.append(_RCA_TEMPLATES["supplier_reliability"])
        if stock_data.get("critical_low"):
            if _RCA_TEMPLATES["stockout_prevention"] not in matched:
                matched.append(_RCA_TEMPLATES["stockout_prevention"])
        if stock_data.get("dead_stock"):
            if _RCA_TEMPLATES["dead_stock_clearance"] not in matched:
                matched.append(_RCA_TEMPLATES["dead_stock_clearance"])

    if not matched:
        # Default fallback: always return the most business-relevant templates.
        # This ensures Act mode ALWAYS has structured RCA context.
        # Priority order mirrors the live DMS snapshot (overdue POs + low stock are known issues).
        matched = [
            _RCA_TEMPLATES["overdue_po_supplier"],
            _RCA_TEMPLATES["stockout_prevention"],
        ]

    lines = ["=== ACT MODE — RCA TEMPLATES (Use these structured frameworks) ===\n"]
    for tmpl in matched[:2]:  # Max 2 templates to keep context lean
        lines.append(f"## {tmpl['title']}")
        lines.append(f"Problem: {tmpl['problem_statement']}")
        lines.append("\n5-Why Root Cause Chain:")
        for w in tmpl["5_why"]:
            lines.append(f"  {w}")
        lines.append("\nKey Causes (Fishbone):")
        for cat, cause in tmpl["fishbone_causes"].items():
            lines.append(f"  [{cat}] {cause}")
        lines.append("\nRecommended Action Plan:")
        for action in tmpl["action_plan"]:
            lines.append(f"  → {action}")
        lines.append(f"\nPrevention Note: {tmpl['prevention']}\n")

    return "\n".join(lines)


def get_inline_rca_tip(query: str, tool_data: dict, mode: str = "ask") -> str:
    """
    Returns a compact RCA insight injected into Ask/Explain mode responses.
    Finds the most relevant template and extracts a focused 3-Why summary + top action.
    Returns empty string if no template matches (caller should handle gracefully).
    """
    q = query.lower()

    # Try direct keyword match first
    best = None
    for tmpl in _RCA_TEMPLATES.values():
        if any(trigger in q for trigger in tmpl["symptom_triggers"]):
            best = tmpl
            break

    # Fall back to context inference from tool data
    if not best:
        stock_data    = tool_data.get("stock", {})
        supplier_data = tool_data.get("supplier", {})
        po_data       = tool_data.get("po_grn", {})
        finance_data  = tool_data.get("finance", {})

        if po_data.get("grn_discrepancies") or "grn" in q:
            best = _RCA_TEMPLATES["grn_mismatch_price_variance"]
        elif any(s.get("on_time_pct", 100) < 80 for s in supplier_data.get("suppliers", [])):
            best = _RCA_TEMPLATES["supplier_reliability"]
        elif stock_data.get("critical_low") or any(w in q for w in ["low stock", "stockout", "reorder", "critical"]):
            best = _RCA_TEMPLATES["stockout_prevention"]
        elif stock_data.get("dead_stock") or any(w in q for w in ["dead stock", "slow mover", "ageing", "aging"]):
            best = _RCA_TEMPLATES["dead_stock_clearance"]
        elif any(w in q for w in ["working capital", "cash", "receivable", "overdue invoice", "dso"]):
            best = _RCA_TEMPLATES["working_capital_high"]
        elif any(w in q for w in ["margin", "profit", "landed cost", "freight cost"]):
            best = _RCA_TEMPLATES["grn_mismatch_price_variance"]

    if not best:
        return ""  # No relevant template — don't inject noise

    # Build compact tip (3 Whys + top 2 actions)
    why_lines = "\n".join(f"  {i+1}. {w}" for i, w in enumerate(best["5_why"][:3]))
    action_lines = "\n".join(f"  → {a}" for a in best["action_plan"][:2])

    prefix = "📋 **RCA Insight**" if mode == "explain" else "🔎 **Root Cause**"
    return (
        f"\n\n---\n{prefix} — {best['title']}\n"
        f"**Problem**: {best['problem_statement']}\n"
        f"**Why Chain (Top 3)**:\n{why_lines}\n"
        f"**Immediate Actions**:\n{action_lines}\n"
        f"**Prevention**: {best['prevention']}"
    )


def _safe_rupee(value) -> int:
    """Parse rupee strings like 'Rs.1.79L', '₹4.2L' safely into integer rupees."""
    try:
        s = str(value).replace('Rs.', '').replace('₹', '').replace(',', '').strip()
        if s.endswith(('L', 'l')):
            return int(float(s[:-1]) * 100_000)
        if s.endswith(('Cr', 'cr')):
            return int(float(s[:-2]) * 10_000_000)
        if s.endswith(('K', 'k')):
            return int(float(s[:-1]) * 1_000)
        return int(float(s))
    except (ValueError, IndexError, TypeError):
        return 0


def run_rca(
    stock_data: dict,
    demand_data: Any = None,
    supplier_data: dict = None,
    finance_data: dict = None,
    order_data: dict = None,
    query: str = "",
) -> List[Dict]:
    """Run full RCA across all available data dimensions."""
    issues = []

    # ── STOCK RCA ────────────────────────────────────────────────
    if isinstance(stock_data, dict):
        for item in stock_data.get("critical_low", []):
            issues.append({
                "type": "Critical Stockout Risk",
                "severity": "HIGH",
                "affected": item.get("sku"),
                "root_cause": (
                    f"Current stock of {item.get('stock')} sheets provides only "
                    f"{item.get('days_cover')} days cover at {item.get('daily_sale')} sheets/day demand"
                ),
                "why_chain": [
                    f"Why low? — Reorder trigger at {item.get('reorder_level')} sheets was not actioned in time",
                    "Why missed? — No automated reorder alert configured; manual checking delayed",
                    f"Why no buffer? — Supplier lead time {item.get('lead_time')} not factored into safety stock",
                ],
                "contributing_factors": [
                    f"Demand velocity: {item.get('daily_sale')} sheets/day (higher than forecast)",
                    f"Lead time risk: {item.get('lead_time')} from supplier, no local backup",
                    "Safety stock not calibrated to current demand levels",
                ],
                "business_impact": item.get("revenue_at_risk", "₹1L+") + " revenue at risk if stockout occurs",
                "fix": f"Place PO for 200+ sheets with Century Plyboards TODAY",
                "immediate_action": "Call Century Plyboards sales rep now — they have 96% on-time delivery",
            })

        for item in stock_data.get("dead_stock", []):
            issues.append({
                "type": "Dead Stock — Cash Locked",
                "severity": "MEDIUM",
                "affected": item.get("sku"),
                "root_cause": f"No sales movement for {item.get('days_old')} days — product-market mismatch",
                "why_chain": [
                    "Why not selling? — Demand shifted to alternate grades; this product over-ordered",
                    "Why over-ordered? — Purchase based on old demand patterns, not AI forecast",
                    "Why no clearance action? — No systematic ageing alert or discount trigger in place",
                ],
                "contributing_factors": [
                    "Over-purchasing relative to actual SKU velocity",
                    "No clearance pricing policy for 60-day non-movers",
                    f"Value locked: {item.get('value')} — opportunity cost growing daily",
                ],
                "business_impact": f"{item.get('value')} locked, earning zero return. At 10% cost of capital = ₹{round(_safe_rupee(item.get('value', 0)) * 10 / 100 / 12):,} per month wasted.",
                "fix": item.get("action", "Discount 12% + bundle with fast-moving SKU orders"),
                "immediate_action": "Call top 3 contractors today with clearance offer",
            })

    # ── SUPPLIER RCA ──────────────────────────────────────────────
    if isinstance(supplier_data, dict):
        for s in supplier_data.get("suppliers", []):
            if s.get("on_time_pct", 100) < 80:
                issues.append({
                    "type": "Supplier Reliability Failure",
                    "severity": "HIGH",
                    "affected": s.get("name"),
                    "root_cause": f"Only {s.get('on_time_pct')}% on-time delivery — structural supply chain risk",
                    "why_chain": [
                        f"Why delayed? — {s.get('avg_delay_days')} avg delay days; supplier capacity constrained",
                        f"Why still ordering? — No alternate supplier qualified for this SKU",
                        f"Why high cost? — {s.get('price_vs_market')} + {s.get('freight_cost')} freight",
                    ],
                    "contributing_factors": [
                        f"Price premium: {s.get('price_vs_market')}",
                        f"GRN match failures: {s.get('grn_match_rate')}",
                        f"{s.get('delivery_failures_month', 0)} delivery failures this month",
                        "No penalty clause in supplier contract for delays",
                    ],
                    "business_impact": "Customer stockouts, lost sales, ITC claims blocked on mismatched GRNs",
                    "fix": "Dual-source: qualify Century or Greenply for same SKUs",
                    "immediate_action": f"Put {s.get('name')} on probation. Minimum orders only until reliability improves.",
                })

    # ── FINANCE RCA ───────────────────────────────────────────────
    if isinstance(finance_data, dict):
        wc_days = finance_data.get("working_capital_days", 0)
        if isinstance(wc_days, int) and wc_days > 40:
            issues.append({
                "type": "Working Capital Inefficiency",
                "severity": "MEDIUM",
                "affected": "Cash Cycle",
                "root_cause": f"Cash tied up {wc_days} days vs 40-day target — money working harder for your customers than for you",
                "why_chain": [
                    "Why high DSO (34 days)? — No early payment incentive; customers delay within credit terms",
                    "Why low DPO (8 days)? — Paying suppliers faster than needed; no terms negotiated",
                    "Why high DIO (22 days)? — Dead stock inflating average days inventory outstanding",
                ],
                "contributing_factors": [
                    "₹7.8L locked in slow/dead stock (inflates DIO)",
                    "₹12.8L outstanding receivables (inflates DSO)",
                    "Paying suppliers on NET-8 while collecting on NET-34",
                    "No early payment discount programme for customers",
                ],
                "business_impact": f"~₹8–10L of working capital unnecessarily consumed. At 12% p.a. cost = ₹1L/year wasted in interest.",
                "fix": "1) Negotiate NET-15 with Century  2) Offer 1.5% discount for customers paying in <15 days  3) Clear dead stock to cut DIO",
                "immediate_action": "Call Century Plyboards today — propose NET-15 payment terms (they want your volume)",
            })

    return issues


def build_rca_narrative(issues: List[Dict], query: str = "") -> str:
    """Convert RCA issues into a structured, readable narrative for the LLM."""
    if not issues:
        return "No critical issues detected. Business metrics are within normal operating range."

    high = [i for i in issues if i.get("severity") == "HIGH"]
    medium = [i for i in issues if i.get("severity") == "MEDIUM"]

    lines = ["=== RCA ENGINE OUTPUT ===\n"]

    if high:
        lines.append(f"HIGH SEVERITY ({len(high)} issue{'s' if len(high) > 1 else ''}):\n")
        for issue in high:
            lines.append(f"ISSUE: {issue['type']} — {issue['affected']}")
            lines.append(f"ROOT CAUSE: {issue['root_cause']}")
            lines.append("5-WHY CHAIN: " + " → ".join(issue.get("why_chain", [])))
            lines.append("CONTRIBUTING FACTORS: " + "; ".join(issue.get("contributing_factors", [])))
            lines.append(f"BUSINESS IMPACT: {issue['business_impact']}")
            lines.append(f"FIX: {issue['fix']}")
            lines.append(f"IMMEDIATE ACTION: {issue['immediate_action']}\n")

    if medium:
        lines.append(f"MEDIUM SEVERITY ({len(medium)} issue{'s' if len(medium) > 1 else ''}):\n")
        for issue in medium:
            lines.append(f"ISSUE: {issue['type']} — {issue['affected']}")
            lines.append(f"ROOT CAUSE: {issue['root_cause']}")
            lines.append(f"FIX: {issue['fix']}\n")

    return "\n".join(lines)
