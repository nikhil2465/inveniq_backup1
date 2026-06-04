"""
Intelligent Tool Selector for InvenIQ AI
Routes natural language queries to the appropriate MCP tools.
Mode-aware: explain/act modes pull broader context automatically.
"""
from typing import List
import re

# ── GENERIC QUERY DETECTION ────────────────────────────────────────────────────
_GENERIC_EXACT = {
    "hi", "hey", "hello", "hii", "helo", "heya", "howdy", "yo",
    "good morning", "good afternoon", "good evening", "good night",
    "thanks", "thank you", "thank u", "ty", "thx", "thnx",
    "bye", "goodbye", "see you", "see ya", "cya", "take care",
    "ok", "okay", "ok cool", "got it", "understood", "noted",
    "sure", "cool", "great", "nice", "wow", "awesome", "perfect",
    "help", "need help", "i need help", "can you help", "can you help me",
    "who are you", "what are you", "what is this", "what can you do",
    "how does this work", "how do i use this", "how can you help me",
    "what do you do", "tell me about yourself",
    "how are you", "how r u", "how r you", "how are u", "you there",
    "are you there", "are you working", "test", "testing",
    "start", "begin", "get started", "what should i ask",
    # Conversational follow-ups
    "sounds good", "that makes sense", "makes sense", "that's helpful",
    "that is helpful", "very helpful", "so helpful", "helpful", "useful",
    "good to know", "interesting", "tell me more", "good point",
    "i see", "i understand", "i get it", "what else", "anything else",
    "go on", "continue", "please continue", "ok what else", "more",
    "nice one", "good advice", "great tip", "that's clear", "clear",
    "okay great", "okay thanks", "alright", "alright thanks",
    "thanks a lot", "many thanks", "much appreciated", "appreciated",
}

_GENERIC_STARTS = (
    "hi ", "hey ", "hello ", "please help", "i need help with",
    "can you help me", "can u help", "i want to know", "tell me",
    "show me what", "what can", "how can", "where do i",
    "that's ", "that is ", "sounds ", "thanks for ", "good to ",
    "i appreciate", "love that", "very helpful", "so helpful",
    "great, ", "nice, ", "ok, ", "okay, ",
)

_GENERIC_PATTERNS = [
    r"^(hi|hey|hello|hii)+[!.,?\s]*$",
    r"^(good\s+(morning|afternoon|evening|night))[!.,?\s]*$",
    r"^(thank(s| you| u)|ty|thx)[!.,?\s]*$",
    r"^(bye|goodbye|cya|see\s+ya?)[!.,?\s]*$",
    r"^(ok|okay|cool|great|nice|got\s+it)[!.,?\s]*$",
    r"^(how\s+are\s+(you|u))[!.,?\s?]*$",
    r"^(what\s+(can|do)\s+you\s+do)[?!.,\s]*$",
    r"^(who|what)\s+are\s+you[?!.,\s]*$",
    r"^(test(ing)?)[!.,?\s]*$",
    r"^(help|need\s+help|i\s+need\s+help)[!.,?\s]*$",
    r"^are\s+you\s+(there|working|online)[?!.,\s]*$",
    r"^(get\s+started|start|begin)[!.,?\s]*$",
]

_COMPILED = [re.compile(p, re.IGNORECASE) for p in _GENERIC_PATTERNS]


def is_generic_query(query: str) -> bool:
    """Return True if query is conversational/generic (no inventory intent)."""
    q = query.strip().lower().rstrip("!?.,")
    if q in _GENERIC_EXACT:
        return True
    if any(q.startswith(s) for s in _GENERIC_STARTS) and len(q) < 50:
        return True
    if any(p.match(query.strip()) for p in _COMPILED):
        return True
    # Very short single-word or two-word responses with no inventory keywords
    _INVENTORY_WORDS = {
        "stock", "sku", "inventory", "order", "supplier", "customer",
        "invoice", "freight", "demand", "margin", "purchase", "grn",
        "finance", "profit", "revenue", "sales", "reorder",
        "eoq", "safety", "abc", "gmroi", "jit", "vmi", "fifo", "lifo",
        "forecast", "turnover", "insight", "benchmark",
        # Finance / working-capital concepts
        "capital", "working", "cash", "credit", "overdue", "payment",
        # Supplier / vendor concepts
        "vendor", "scorecard", "kpi", "kpis", "benchmark", "benchmarks",
        # Analytical intent words — prevent short concept questions going to generic
        "formula", "calculate", "analysis", "method", "strategy",
        "explain", "define", "how", "what", "why",
        # Additional domain terms
        "lead", "time", "cycle", "conversion", "days", "rate",
        "landed", "cost", "holding", "ordering", "carrying",
    }
    words = q.split()
    if len(words) <= 3 and not any(w in _INVENTORY_WORDS for w in words):
        # Short responses without any business keywords are conversational
        if len(q) < 30:
            return True
    return False

KEYWORD_MAP = {
    "stock": [
        "stock", "inventory", "sku", "sheets", "reorder", "stockout",
        "low stock", "dead stock", "overstock", "ageing", "aging",
        "batch", "godown", "warehouse", "on hand", "valuation",
        "landed cost", "margin per sku", "abc", "critical", "cover",
        "how many", "quantity", "units", "18mm", "12mm", "8mm",
    ],
    "demand": [
        "demand", "forecast", "sell", "selling", "sales trend",
        "season", "monsoon", "diwali", "festive", "slow mover",
        "fast mover", "moving", "velocity", "next month", "predict",
        "will sell", "how much", "popular",
    ],
    "supplier": [
        "supplier", "vendor", "purchase", "po", "grn", "procurement",
        "delivery", "lead time", "gauri", "century", "greenply",
        "buy from", "order from", "source", "3 way match", "gst itc",
        "overdue po", "pending po", "price hike",
    ],
    "customer": [
        "customer", "client", "account", "who owes", "receivable",
        "credit", "at risk", "churn", "silent", "no order",
        "contractor", "interior firm", "retailer", "carpenter",
        "outstanding", "payment", "mehta", "sharma",
        "patel", "kumar", "city interiors", "overdue", "dso",
        "new customer", "acquire", "upsell", "cross sell", "cross-sell",
        "which customer", "target customer", "grow customer", "customer base",
        "collections", "collect payment", "recovery", "follow up",
    ],
    "louvers": [
        "louver", "louvre", "louvers", "louvres",
        "aluminium profile", "aluminum profile", "z-profile",
        "hpl", "high pressure laminate", "compact laminate", "acrylic laminate",
        "operable louvre", "motorised louvre", "facade", "sun shading",
        "distributor claim", "claim", "rebate", "customer rebate",
        "sales order louvers", "facade order",
        "powder coated", "anodized", "pvc blade",
        "greenlam", "merino laminates", "formica", "stylam",
        "alufit", "jindal aluminium", "technal", "ykk",
        # POD / delivery confirmation
        "proof of delivery", "pod", "delivery confirmation", "delivery received",
        "receiver name", "who received", "delivery signature", "delivered confirmed",
        "delivery timestamp", "delivery time", "when was delivered",
        # Payment status on sales orders
        "payment status", "unpaid orders", "unpaid sales", "collect payment so",
        "sales order payment", "so payment", "delivered unpaid", "pending payment so",
        "partial payment so", "payment received so", "mark paid", "paid order",
        "outstanding payment sales", "collect balance", "payment collection sales",
        "are unpaid", "orders unpaid", "delivered not paid", "collected payment",
        "how many unpaid", "which orders unpaid", "payment pending so",
        "as paid", "mark as paid", "update payment", "payment update so",
    ],
    "discount": [
        "discount", "discounts", "discount rate", "discount policy",
        "discount rules", "discount matrix", "discount schedule",
        "pricing", "offer price", "quote price", "distributor price",
        "how much discount", "what discount", "can i give",
        "margin guardrail", "margin floor", "minimum margin",
        "volume discount", "bulk discount", "slab pricing",
        "contractor discount", "retailer discount", "carpenter discount",
        "interior firm discount", "quote", "quotation", "price quote",
        "selling price", "net price", "final price",
    ],
    "finance": [
        "margin", "profit", "revenue", "cash", "gst", "tax",
        "discount leakage", "working capital", "receivable", "payable",
        "finance", "cash flow", "return", "gmroi", "true cost",
        "actual margin", "earning", "income", "gstr", "tds",
    ],
    "order": [
        "order", "dispatch", "fulfil", "pending", "shipment", "ship",
        "sla", "delayed order", "pick", "pack", "deliver today",
        "pending dispatch", "how many orders", "ORD-",
    ],
    "freight": [
        "freight", "transport", "logistics", "truck", "lane",
        "whitefield", "electronic city", "koramangala", "btm",
        "delivery cost", "per sheet cost", "vehicle", "consolidate",
        "route", "inbound cost", "outbound cost",
    ],
    "email": [
        "send", "email", "message", "contact", "draft",
        "notify", "alert", "whatsapp", "remind", "write to",
        "communicate",
    ],
    "po_grn": [
        "purchase order", "po number", "po-", "create po", "raise po",
        "new po", "place order", "place a po", "generate po",
        "grn", "goods receipt", "goods received", "3 way match", "three way match",
        "discrepancy", "grn mismatch", "invoice mismatch", "overdue po",
        "pending po", "po status", "grn status", "open po", "partial po",
        "po value", "po list", "procurement status", "receipt note",
    ],
    "sales": [
        "revenue trend", "sales trend", "monthly revenue", "sales performance",
        "best selling day", "day of week", "top selling", "sales history",
        "orders this month", "orders mtd", "category revenue", "product mix",
        "how much did i sell", "total sales", "revenue by sku", "which day",
        "highest revenue", "avg order value", "sales growth", "revenue growth",
        "grow", "growth", "expand", "increase sales", "more revenue", "scale",
        "double revenue", "business growth", "grow my business", "grow sales",
        "next quarter", "annual target", "beat last year",
    ],
    "inward": [
        "inward", "outward", "stock movement", "goods received today",
        "putaway", "pick pack", "shrinkage", "qc pass", "qc fail",
        "received today", "how much came in", "stock in", "stock out",
        "dispatch velocity", "picking error", "grn today", "movement today",
    ],
    "quotes": [
        "quote", "quotation", "quotations", "quote builder", "proposal",
        "rfq", "win rate", "pipeline value", "quote status", "draft quote",
        "send quote", "quote won", "quote lost", "negotiating quote",
        "quote number", "qt-", "create quotation", "new quote", "quote history",
        "whatsapp scan", "scan requirement", "scan boq", "boq quote",
        "quote analysis", "win probability", "quote margin", "expiring quote",
        "quotation builder", "build quote",
    ],
    "projects": [
        "project", "projects", "inquiry", "inquiries", "site visit", "boq",
        "bill of quantities", "project stage", "inquiry to invoice",
        "project pipeline", "project tracker", "project status", "site",
        "tower", "phase", "block", "conversion", "project value",
        "prj-", "project number", "architect", "project close", "project win",
        "in production", "project delivery", "project invoice", "project milestone",
    ],
    "catalog": [
        "product catalog", "catalog", "catalogue", "product list",
        "what products", "what do you sell", "product range", "specifications",
        "aluminium z", "louver blade", "hpl thickness", "compact laminate",
        "product code", "product id", "sku price", "sell price", "buy price",
        "product spec", "available products", "product categories",
        "acp panel", "toilet cubicle", "kitchen laminate",
    ],
    "credit": [
        "credit", "credit limit", "credit management", "credit exposure",
        "credit utilisation", "credit utilization", "credit block",
        "overdue account", "pdc", "post dated cheque", "post-dated cheque",
        "bounced cheque", "high risk account", "credit risk",
        "customer credit", "credit days", "credit terms",
        "collection", "collections", "recover payment", "block customer",
        "credit outstanding", "payment overdue", "overdue customer",
    ],
    "pos": [
        "pos", "counter pos", "counter sale", "walk in", "walk-in",
        "walk in customer", "retail sale", "cash sale", "billing counter",
        "bill", "receipt", "invoice counter", "today sales",
        "counter billing", "fast billing", "over counter",
        "daily transactions", "till", "cash register",
    ],
    "schemes": [
        "scheme", "schemes", "supplier scheme", "promo scheme",
        "promotion scheme", "volume bonus", "loyalty scheme",
        "annual target", "target achievement", "scheme reward",
        "accrual scheme", "scheme accrual", "quarterly bonus",
        "scheme payout", "scheme target", "scheme tracker",
        "incentive scheme", "dealer incentive", "distributor scheme",
        "century scheme", "greenply scheme", "gauri scheme",
        "scheme management", "scheme status",
    ],
    "warehouse": [
        "warehouse", "warehouses", "godown", "godowns",
        "warehouse capacity", "godown capacity", "warehouse utilisation",
        "warehouse stock", "warehouse management", "stock distribution",
        "which godown", "where is my stock", "godown stock",
        "warehouse utilization", "capacity used", "space available",
        "main warehouse", "transit hub", "counter stock replenish",
        "warehouse performance", "stock location", "multi-warehouse",
        "grn activity warehouse", "warehouse grn", "receiving area",
    ],
    "sales_return": [
        "sales return", "sales returns", "return", "returns",
        "credit note", "credit notes", "return credit", "customer return",
        "uom conversion", "unit of measure return", "partial return",
        "box to pieces", "return pieces from box", "return pcs",
        "open credit", "credit balance", "apply credit", "credit applied",
        "refund", "reverse sale", "return invoice", "return reason",
        "return policy", "how to process return", "return accounting",
        "return gst", "gst reversal on return", "sr-", "cn-",
        # Return condition-specific keywords
        "good condition return", "damaged return", "condition of returned goods",
        "return condition", "partially damaged return", "fully damaged return",
        "goods returned good", "goods returned damaged",
        "return linked so", "return linked invoice", "return dc number",
    ],
    "damage": [
        "damage", "damaged", "damages",
        "grn damage", "inward damage", "goods damaged", "received damaged",
        "damage after receipt", "damage after grn", "damage on arrival",
        "transit damage", "transport damage", "damage in transit",
        "vehicle accident damage", "cargo damage", "freight damage",
        "insurance claim", "insurance damage", "raise insurance claim",
        "damage write off", "write down inventory", "inventory write down",
        "damage loss account", "damage accounting",
        "damaged goods", "broken stock", "cracked goods",
        "supplier damage claim", "manufacturing defect return",
        "insurance recoverable", "transit loss", "damage value",
        "physical damage", "moisture damage", "packaging damage",
        "damage prevention", "damage report", "damage recording",
        "sales return damage", "return damage", "damaged returns",
        "customer returned damaged", "goods returned damaged",
        "partially damaged return", "fully damaged return",
        "return condition", "return inspection", "sr damage",
        "gd-", "td-", "sr-", "ins-",
    ],
    "landing_cost": [
        "landed cost", "landing cost", "true cost", "total landed", "import cost",
        "custom duty", "customs duty", "freight forwarding", "port charges",
        "clearing agent", "import charges", "import duty", "cif", "fob",
        "charge heads", "landing cost sheet", "per unit cost", "true landed cost",
        "import overhead", "landing cost calculation", "domestic freight cost",
        "inter state road", "loading unloading cost", "insurance cost shipment",
        "lc-", "landed margin", "actual cost per unit", "true margin",
    ],
    "pr": [
        "purchase requisition", "pr", "pr-", "material request", "indent",
        "purchase request", "approval pending", "pending approval pr",
        "requisition status", "who approved", "pr approval", "approve pr",
        "convert pr to po", "pr to po", "pr pipeline", "pending requisition",
        "raise requisition", "create pr", "new pr", "requisition list",
        "material indent", "dept requisition", "department request", "procurement request",
        "procurement approval", "pr workflow", "pr bottleneck", "pr backlog",
    ],
    "qc": [
        "qc", "quality control", "quality check", "qc inspection", "inspection",
        "inspection result", "qc pass", "qc fail", "qc rejection", "rejection rate",
        "rtv", "return to vendor", "vendor return", "batch rejection",
        "qci-", "acceptance rate", "reject goods", "failed inspection",
        "quality issue supplier", "supplier quality", "defect rate",
        "checklist inspection", "incoming inspection", "goods inspection",
        "product quality", "qc checklist", "inspection checklist", "accept to inventory",
        "quality scorecard", "reject batch", "conditional acceptance",
    ],
    "invoice_matching": [
        "invoice matching", "3 way match", "three way match", "3-way match",
        "po grn invoice", "ap approval", "accounts payable approval",
        "invoice discrepancy", "invoice mismatch", "invoice blocked",
        "invoice pending approval", "invoice variance", "price mismatch invoice",
        "qty mismatch invoice", "invoice auto match", "match rate",
        "payment blocked", "invoice queue", "ap queue", "invoice reconciliation",
        "invoice reconcile", "payment approval", "invoice to pay",
        "im-", "inv-", "matching status", "3-way reconciliation",
    ],
    "invoices": [
        "invoice", "invoices", "sales invoice", "billing", "bill to",
        "tax invoice", "gst invoice", "proforma", "gst billing",
        "cgst sgst igst", "output tax", "invoice outstanding", "invoice overdue",
        "payment due", "invoice payment", "send invoice", "invoice status",
        "invoice total", "invoice draft", "how much is owed", "invoice paid",
        "invoice collection", "invoice aging", "receivable invoice",
        "invoice number", "inv-", "gstr-1", "gstr1 filing", "tax collected",
        "who owes us", "invoice list", "pending invoices", "invoicing",
    ],
    "design_quote": [
        "design quote", "design quotation", "interior quote", "interior quotation",
        "architect fee", "architect proposal", "fee proposal", "architect invoice",
        "design studio", "design quote studio", "interior design quote",
        "room schedule", "boq interior", "bill of quantities interior",
        "site brief", "parse brief", "scan boq interior", "interior boq",
        "area calculator", "room area", "floor area calculation",
        "interior package", "fit-out quote", "fit out quotation",
        "interior fit-out", "interior fitout", "residential interior",
        "dq-", "fp-", "fee percentage architect", "phase payment architect",
        "milestone invoice architect", "p1 concept fee", "p2 schematic",
        "p4 construction document", "p6 construction admin",
        "interior win rate", "interior pipeline", "interior quote status",
        "architect fee percentage", "how much to charge architect",
        "standard architect fee", "fee split architect",
        "boq generator", "generate boq interior", "interior boq generator",
        "design scan", "interior materials quote",
    ],
}

# ── Additional keyword expansions (merged into KEYWORD_MAP on import) ──────────
_EXTRA_KEYWORDS = {
    # Make demand keywords richer for forecasting / seasonal questions
    "demand": [
        "demand", "forecast", "sell", "selling", "sales trend",
        "season", "monsoon", "diwali", "festive", "slow mover",
        "fast mover", "moving", "velocity", "next month", "predict",
        "will sell", "how much", "popular", "top selling sku",
        "which sku sells most", "best selling", "surge", "growing sku",
    ],
    # Finance: add working capital, cash cycle terms
    "finance": [
        "margin", "profit", "revenue", "cash", "gst", "tax",
        "discount leakage", "working capital", "receivable", "payable",
        "finance", "cash flow", "return", "gmroi", "true cost",
        "actual margin", "earning", "income", "gstr", "tds",
        "cash cycle", "cash conversion", "working capital days",
        "net profit", "gross profit", "ebitda",
    ],
    # Discount: extend with calculation-intent phrases
    "discount": [
        "discount", "discounts", "discount rate", "discount policy",
        "discount rules", "discount matrix", "discount schedule",
        "pricing", "offer price", "quote price", "distributor price",
        "how much discount", "what discount", "can i give",
        "margin guardrail", "margin floor", "minimum margin",
        "volume discount", "bulk discount", "slab pricing",
        "contractor discount", "retailer discount", "carpenter discount",
        "interior firm discount", "quote", "quotation", "price quote",
        "selling price", "net price", "final price", "discount calculator",
        "distributor discount", "calculate discount", "pricing schedule",
    ],
    # Stock: add conceptual terms that map to stock tool
    "stock": [
        "stock", "inventory", "sku", "sheets", "reorder", "stockout",
        "low stock", "dead stock", "overstock", "ageing", "aging",
        "batch", "godown", "warehouse", "on hand", "valuation",
        "landed cost", "margin per sku", "abc", "critical", "cover",
        "how many", "quantity", "units", "18mm", "12mm", "8mm",
        "true landed cost", "stock health", "stock value", "stock level",
    ],
}

# Merge extra keywords into KEYWORD_MAP deduplicating
for _tool, _extra in _EXTRA_KEYWORDS.items():
    if _tool in KEYWORD_MAP:
        _existing = set(KEYWORD_MAP[_tool])
        KEYWORD_MAP[_tool] = list(_existing | set(_extra))

# Tools always included for explain/why queries
EXPLAIN_TOOLS = ["stock", "supplier", "finance"]
# Tools always included for act mode
ACT_BASE_TOOLS = ["stock", "order", "po_grn"]
# Discount tool added to _EXTRA_KEYWORDS below to keep KEYWORD_MAP DRY


def select_tools(query: str, mode: str = "ask") -> List[str]:
    """Select the most relevant tools for a query, respecting mode context."""
    q = query.lower()
    tools: List[str] = []

    for tool, keywords in KEYWORD_MAP.items():
        if any(kw in q for kw in keywords):
            tools.append(tool)

    # Mode-based augmentation
    if mode == "explain" or any(w in q for w in ["why", "cause", "reason", "explain", "problem", "issue", "dropped", "fell", "low", "stuck"]):
        for t in EXPLAIN_TOOLS:
            if t not in tools:
                tools.append(t)

    if mode == "act":
        for t in ACT_BASE_TOOLS:
            if t not in tools:
                tools.append(t)

    # Growth queries need sales + customer + finance together for a complete answer
    _GROWTH_WORDS = ["grow", "growth", "expand", "increase sales", "more revenue", "scale", "new customer", "upsell", "collections", "recover", "target customer"]
    if any(w in q for w in _GROWTH_WORDS):
        for t in ["sales", "customer", "finance", "quotes"]:
            if t not in tools:
                tools.append(t)

    # Quote/project pipeline queries also pull finance for margin context
    if any(w in q for w in ["quote", "quotation", "win rate", "pipeline", "project"]):
        if "finance" not in tools:
            tools.append("finance")

    # P2P workflow queries pull related tools for full procurement context
    if any(t in tools for t in ["pr", "qc", "invoice_matching"]):
        if "po_grn" not in tools:
            tools.append("po_grn")
        if "supplier" not in tools:
            tools.append("supplier")

    # Landing cost queries also pull stock for margin impact context
    if "landing_cost" in tools and "stock" not in tools:
        tools.append("stock")

    # Design quote queries pull catalog + quotes for product/pricing context
    if "design_quote" in tools:
        if "catalog" not in tools:
            tools.append("catalog")
        if "quotes" not in tools:
            tools.append("quotes")

    # Default fallback — stock + demand + finance covers 85% of dealer questions
    if not tools:
        tools = ["stock", "demand", "finance"]

    # Cap at 6 tools to keep LLM context focused
    return tools[:6]
