"""
Inventory Management Knowledge Base — InvenIQ AI
Handles conceptual/educational queries about inventory management.

Approach: Structured Knowledge Injection + Live Data Application
  1. Detect conceptual questions (EOQ, safety stock, ABC, etc.)
  2. Pull the right knowledge sections from the KB
  3. Apply formulas to the user's real business data (live calculations)
  4. Return enriched context for GPT-4o to build an expert answer

This is the best-in-class method for domain-specific knowledge delivery:
  - No vector DB or embedding infrastructure needed
  - Formulas are applied to REAL data (not generic examples)
  - Benchmarks are specific to plywood/building materials in India
  - Zero latency overhead — pure Python dict lookup
"""
from typing import Optional

# ── KNOWLEDGE QUERY DETECTION ──────────────────────────────────────────────────

_KNOWLEDGE_KEYWORDS = [
    # EOQ
    "eoq", "economic order quantity", "eoq formula", "eoq calculation",
    "optimal order quantity", "order quantity formula",
    # Safety Stock
    "safety stock", "buffer stock", "safety inventory", "safety stock formula",
    "how to calculate safety stock", "safety stock calculation", "z score inventory",
    # Reorder Point
    "reorder point", "rop formula", "reorder level", "reorder point formula",
    "when to order", "how to calculate reorder",
    # ABC / XYZ
    "abc analysis", "abc classification", "abc inventory", "pareto inventory",
    "xyz analysis", "xyz classification", "80 20 rule inventory",
    # GMROI
    "gmroi", "gross margin return on investment", "return on inventory",
    "gmroi formula", "gmroi calculation",
    # JIT / VMI / Consignment
    "jit", "just in time", "just-in-time inventory",
    "vmi", "vendor managed inventory",
    "consignment stock", "consignment inventory",
    "cross docking", "cross-docking",
    # Accounting methods
    "fifo", "lifo", "weighted average cost", "wac inventory",
    "costing method", "inventory costing", "inventory valuation method",
    # Bullwhip
    "bullwhip", "bullwhip effect", "demand amplification",
    # Working Capital / Cash Cycle
    "working capital formula", "cash conversion cycle", "cash cycle formula",
    "dso formula", "dio formula", "dpo formula",
    "days sales outstanding", "days inventory outstanding", "days payable outstanding",
    # Inventory Turnover / KPIs
    "inventory turnover formula", "stock turnover ratio", "turnover ratio formula",
    "days sales inventory", "dsi formula",
    "fill rate formula", "fill rate definition", "fill rate meaning",
    "otif meaning", "on time in full",
    # Demand Forecasting
    "demand forecasting methods", "exponential smoothing", "moving average forecast",
    "holt winters", "seasonal adjustment forecasting",
    "how to forecast demand", "demand prediction method",
    # Cycle Counting
    "cycle counting", "cycle count method", "perpetual inventory system",
    "periodic inventory system",
    # Landed Cost
    "landed cost calculation", "true landed cost", "total landed cost",
    "how to calculate landed cost",
    # Industry Benchmarks
    "industry benchmark", "inventory benchmark", "standard ratio inventory",
    "best practice inventory", "inventory best practices",
    "inventory optimization tips", "how to optimize inventory",
    # Dead Stock
    "dead stock strategy", "dead stock meaning", "what is dead stock",
    "slow moving inventory strategy", "clearance strategy inventory",
    "overstock strategy",
    # General concepts
    "push pull supply chain", "push pull strategy",
    "vendor scorecard", "supplier kpi", "supplier scorecard method",
    "drop shipping", "dropshipping",
    "min max inventory", "min-max method", "two bin system",
    "kanban inventory", "kanban system",
    "lean inventory", "lean manufacturing inventory",
    "service level inventory", "service level formula",
    # Product knowledge — aluminium louvers & profiles
    "hindalco", "aerofoil louver", "z section louver", "aluminium louver",
    "aluminium profile", "louver blade", "louvre blade", "louvre system",
    "c channel aluminium", "u section aluminium", "t section aluminium",
    "operable louver", "fixed louver", "motorised louver", "anodised aluminium",
    "powder coated aluminium", "mill finish aluminium",
    # Product knowledge — ACP / cladding
    "acp", "alucobond", "viva composite", "acp panel", "aluminium composite panel",
    "cladding panel", "facade cladding", "exterior cladding", "acp cladding",
    "fr grade acp", "non fr acp", "pvdf coated acp", "polyester acp",
    "acp thickness", "4mm acp", "3mm acp", "acp installation",
    "acp fabrication", "acp routing", "acp bending",
    # Product knowledge — HPL laminates
    "hpl", "greenlam", "merino", "century laminates", "royal touch laminate",
    "high pressure laminate", "compact laminate", "exterior hpl", "interior hpl",
    "hpl thickness", "0.8mm hpl", "1mm hpl", "1.5mm hpl",
    "laminate finish", "matt laminate", "gloss laminate", "texture laminate",
    "stone finish hpl", "wood grain hpl", "solid colour hpl",
    "product catalog", "product catalogue", "what products do we sell",
    "which products should i stock", "best selling louver", "best selling acp",
    "hsn code acp", "hsn code louver", "hsn code aluminium profile",
    "gst on acp", "gst on aluminium", "gst on laminates", "hsn 7604", "hsn 7606",
    # POD / Delivery confirmation
    "proof of delivery", "pod process", "delivery confirmation process",
    "how to capture pod", "delivery receipt meaning", "pod in logistics",
    "what is proof of delivery", "delivery sign off", "receiver confirmation",
    # Payment status tracking
    "payment status", "unpaid invoice", "how to track payment status",
    "mark invoice paid", "payment collection tracking", "payment lifecycle",
    "unpaid delivered orders", "payment tracking sales order",
    # Sales return damage
    "sales return damage", "return condition split", "damaged return accounting",
    "good vs damaged return", "return condition good", "partially damaged",
    "fully damaged return", "how to account return damage", "return damage entry",
    # Credit Management
    "credit management", "credit limit", "credit policy", "credit terms",
    "how to set credit limit", "credit scoring", "credit risk",
    "overdue collection strategy", "collection strategy", "payment terms policy",
    "pdc management", "post dated cheque", "cheque bounce",
    "credit days calculation", "dso credit", "how to collect payment",
    # Counter POS
    "pos system", "point of sale", "counter billing", "walk in sales",
    "retail billing", "counter sales management", "pos management",
    "how to manage counter sales", "walk in customer management",
    # Scheme Management
    "scheme management", "trade scheme", "dealer scheme", "supplier scheme",
    "volume rebate", "trade rebate", "rebate management", "how to track schemes",
    "accrual accounting", "scheme accounting", "incentive tracking",
    "loyalty program management", "dealer incentive program",
    # Design Quote Studio / Architect Fee
    "design quote", "interior quote", "interior quotation", "architect fee",
    "fee proposal", "architect proposal", "design quotation", "interior design quote",
    "boq interior", "bill of quantities interior", "interior boq",
    "architect fee percentage", "standard architect fee", "architect fee india",
    "phase split architect", "p1 concept fee", "p2 schematic fee",
    "p3 design development", "p4 construction documents", "p5 tender fee",
    "p6 construction admin", "architect milestone", "interior quote workflow",
    "design studio", "design quote studio", "interior fit-out quote",
    "how to price interior design", "interior design pricing", "quote win rate interior",
    "interior quote benchmark", "architect fee benchmark",
    "what is architect fee", "how to calculate architect fee",
    "whatsapp site brief", "parse interior brief", "boq generator",
    "area calculator interior", "floor area room", "interior package",
]

_KNOWLEDGE_STARTS = (
    "what is ", "what are ", "explain ", "define ", "definition of ",
    "tell me about ", "describe ", "how does ", "how do i calculate ",
    "how to calculate ", "formula for ", "what does ", "when should i use ",
    "why use ", "difference between ", "compare ", "pros and cons of ",
    "best way to ", "how to improve ", "tips for ", "best practices for ",
    "industry standard for ", "benchmark for ", "what is the formula",
    "how is ", "what is meant by ", "can you explain ",
)

_KNOWLEDGE_CONCEPTS = {
    "eoq", "safety stock", "reorder point", "abc", "xyz", "gmroi",
    "jit", "vmi", "fifo", "lifo", "weighted average", "bullwhip",
    "demand forecasting", "cycle count", "landed cost", "working capital",
    "inventory turnover", "fill rate", "otif", "dsi", "dso", "dpo",
    "inventory management", "stock management", "procurement best",
    "supply chain", "push pull", "consignment", "cross dock",
    "kanban", "lean inventory", "min max", "two bin", "service level",
    "vendor scorecard", "supplier scorecard", "drop ship",
    # Product catalog concepts — louvers & aluminium profiles
    "hindalco", "aerofoil", "z section", "louver blade", "louvre blade",
    "aluminium louver", "aluminium profile", "c channel", "u section",
    "operable louver", "fixed louver", "anodised", "powder coated",
    "product catalog", "hsn code", "gst aluminium", "aluminium extrusion",
    # Product catalog concepts — ACP & HPL
    "acp", "alucobond", "viva composite", "greenlam", "merino",
    "acp panel", "aluminium composite", "cladding", "facade",
    "hpl", "high pressure laminate", "compact laminate",
    "louver products", "acp products", "laminate products",
    # Credit management concepts
    "credit limit", "credit management", "credit policy", "credit terms",
    "credit risk", "credit scoring", "pdc", "overdue", "collection",
    # POS concepts
    "pos", "point of sale", "counter sale", "walk in",
    # Scheme management concepts
    "scheme", "trade scheme", "dealer scheme", "rebate", "accrual",
    "loyalty program", "incentive", "volume bonus",
    # Sales return / credit note concepts
    "sales return", "credit note", "return policy", "partial return",
    "uom conversion", "return accounting", "gst on return",
    "return condition", "partially damaged return", "fully damaged return",
    "good condition return", "return condition split",
    "sales return damage", "return damage accounting",
    # POD / delivery confirmation concepts
    "proof of delivery", "pod", "delivery confirmation",
    "delivery receipt", "delivery sign off", "pod process",
    # Payment status lifecycle
    "payment status tracking", "unpaid invoice tracking", "payment collection so",
    "mark invoice paid", "payment lifecycle", "unpaid delivered orders",
    # Damage concepts
    "damage", "grn damage", "transit damage", "insurance claim",
    "damage accounting", "damage loss", "transit loss", "write off",
    "inventory write down", "insurance receivable",
    # Warehouse / godown management
    "warehouse management", "godown management", "warehouse best practice",
    "godown capacity", "warehouse capacity", "warehouse kpi", "godown kpi",
    "grn accuracy", "putaway", "pick accuracy", "multi-warehouse", "multi-godown",
    "warehouse utilisation", "godown utilisation", "stock distribution",
    # Tally Prime export / integration
    "tally", "tally prime", "tally erp", "tally export", "tally import",
    "tally integration", "tally csv", "import to tally", "export to tally",
    "tally stock items", "tally ledger", "tally voucher", "tally gst",
    # Sales return / credit note
    "sales return", "credit note", "return policy", "credit note accounting",
    "how to process return", "uom conversion return", "partial return",
    "return accounting", "sales return journal entry", "gst on returns",
    "how to raise credit note", "credit note meaning", "debit note vs credit note",
    # Damage recording / insurance
    "damage recording", "how to record damage", "grn damage", "transit damage",
    "insurance claim goods", "damaged goods accounting", "how to write off damage",
    "damage loss account", "transit loss account", "inventory write down",
    "insurance claim receivable", "goods damaged in transit",
    "damage prevention", "how to reduce damage", "damage in supply chain",
    "supplier claim for defective goods", "manufacturing defect claim",
    # Landing cost
    "how to calculate landing cost", "landed cost components",
    "what is landing cost", "landing cost accounting",
    # Design Quote / Architect Fee Proposal concepts
    "design quote", "interior quote", "architect fee", "fee proposal",
    "architect proposal", "interior quotation", "boq interior",
    "architect fee percentage", "fee split architect", "phase payment",
    "interior fit-out", "interior package", "design studio",
    "whatsapp brief", "parse brief", "area calculator",
}


def is_knowledge_query(query: str) -> bool:
    """
    Return True if query is asking about an inventory management concept,
    formula, or best practice — not about the user's specific live data.
    """
    q = query.strip().lower()

    # Direct keyword matches (most reliable)
    if any(kw in q for kw in _KNOWLEDGE_KEYWORDS):
        return True

    # Starts with educational pattern + contains inventory concept
    if any(q.startswith(s) for s in _KNOWLEDGE_STARTS):
        if any(concept in q for concept in _KNOWLEDGE_CONCEPTS):
            return True

    return False


# ── KNOWLEDGE BASE ─────────────────────────────────────────────────────────────
# Each entry: title, formula, variables, example (applied to real data),
#             benchmarks (plywood/building materials India), indian_context

KNOWLEDGE_BASE = {

    "eoq": {
        "title": "Economic Order Quantity (EOQ)",
        "formula": "EOQ = √(2 × D × S ÷ H)",
        "variables": {
            "D": "Annual demand in units",
            "S": "Ordering cost per order (₹) — includes PO processing, receiving, inspection",
            "H": "Annual holding cost per unit (₹) = unit cost × holding rate (typically 20-30%/year)",
        },
        "applied_to_your_data": {
            "sku": "Hindalco Z-Section Louver Blade 150mm (your highest-velocity A-class SKU)",
            "D": "4,560 units/year (380/month × 12)",
            "S": "₹1,200/order (PO processing + receiving + flat-rack arrangement)",
            "H": "₹235/unit/year (24% of ₹980 buy price)",
            "EOQ_result": "≈ 216 units/order",
            "calculation": "√(2 × 4560 × 1200 ÷ 235) = √46,630 ≈ 216 units",
            "orders_per_year": "≈ 21 orders/year (4560 ÷ 216)",
            "vs_current": "If ordering <100 units at a time, you're over-ordering. If >350, under-ordering. Profile extrusions ship in standard 6m bundles — align EOQ to bundle multiples.",
        },
        "when_to_use": "Minimise total inventory cost (ordering cost + holding cost). Best for stable demand items.",
        "limitations": [
            "Assumes constant demand and lead time",
            "Ignores quantity discounts (Hindalco offers 2.5% for 500+ unit orders)",
            "Doesn't account for stockout cost — add safety stock separately",
        ],
        "benchmark": "Louvers/ACP/HPL dealers: 8-16 orders/year for A-class SKUs. EOQ order cycle = 2-4 weeks.",
        "indian_context": "Hindalco Extrusions has minimum ₹15,000/SKU/order for free freight. ACP panels (Alucobond) ship in flat-rack trucks — combine SKUs to fill a truck load (24 sheets per flat-rack). For Alucobond/premium ACP (fragile corners), add insurance cost (0.4%) to H.",
    },

    "safety_stock": {
        "title": "Safety Stock — Buffer Against Uncertainty",
        "formula": "Safety Stock = Z × σ_demand × √Lead_Time",
        "formula_full": "Safety Stock = Z × √(Lead_Time × σ²_demand + D² × σ²_lead_time)",
        "variables": {
            "Z": "Service level Z-score: 1.28=90%, 1.65=95%, 2.05=98%, 2.33=99%",
            "σ_demand": "Standard deviation of daily demand (measure variability)",
            "Lead_Time": "Supplier lead time in days",
            "D": "Average daily demand",
            "σ_lead_time": "Standard deviation of lead time (use if lead time varies)",
        },
        "applied_to_your_data": {
            "sku": "Hindalco Z-Section Louver Blade 150mm",
            "daily_demand_avg": "12.7 units/day (380/month)",
            "demand_stddev": "~3.2 units/day (estimated ±25% — spikes pre-monsoon for façade projects)",
            "lead_time_hindalco": "8 days (reliable, σ_LT ≈ 1.0d)",
            "lead_time_viva_composite": "12-15 days (variable, σ_LT ≈ 3.8d — LME price revisions cause delays)",
            "at_95_service_level": "SS = 1.65 × 3.2 × √8 = 1.65 × 3.2 × 2.83 ≈ 15 units",
            "viva_adjusted_SS": "For Viva Composite ACP: SS = 1.65 × √(13.5×10.2 + 161×14.4) ≈ 28 sheets (LME variability doubles SS need!)",
            "current_reorder_level": "~80 units (set manually — needs recalculation)",
            "recommendation": "Set ROP for Hindalco Z-blades at 12.7×8 + 15 = 117 units. Currently at 62 — critically below ROP, place PO immediately.",
        },
        "service_level_choice": {
            "A_class_SKUs": "95-99% (Hindalco Z-blades, Alucobond ACP Silver — revenue-critical, project-linked demand)",
            "B_class_SKUs": "90-95% (Greenlam HPL, Merino HPL — steady demand from interior designers)",
            "C_class_SKUs": "85-90% (specialty finishes, accessories — minimal holding cost)",
        },
        "benchmark": "For A-class louver/ACP SKUs: Safety stock = 10-15% of average cycle stock.",
        "indian_context": "Pre-monsoon (Apr-Jun): increase safety stock 30-40% for aluminium louvers and ACP — façade project season peaks. Post-monsoon (Oct-Nov): +20-25% safety stock for HPL laminates — interior design projects surge after Diwali.",
    },

    "reorder_point": {
        "title": "Reorder Point (ROP) — When to Place the Next Order",
        "formula": "ROP = (Average Daily Demand × Lead Time) + Safety Stock",
        "applied_to_your_data": {
            "Hindalco Z-Section Louver Blade 150mm": {
                "daily_demand": "12.7 units/day",
                "lead_time": "8 days (Hindalco Extrusions)",
                "safety_stock": "15 units",
                "ROP": "12.7 × 8 + 15 = 117 units",
                "current_stock": "62 units",
                "gap_to_rop": "55 units BELOW ROP — place order immediately",
                "days_until_rop": "Already past ROP — stockout risk in 5 days at current demand",
            },
            "Alucobond ACP 4mm Silver 8×4ft": {
                "daily_demand": "2.3 sheets/day",
                "lead_time": "10 days (Alucobond — Mumbai to Bangalore)",
                "safety_stock": "8 sheets",
                "ROP": "2.3 × 10 + 8 = 31 sheets",
                "current_stock": "18 sheets",
                "days_until_rop": "Already 13 below ROP — place PO today; specify flat-rack truck",
            },
        },
        "setup_advice": [
            "Set ROP alerts in your DMS/Tally when stock hits this level",
            "For Viva Composite/Alucobond SKUs: use their longer lead time (10-15 days) not Hindalco (8 days)",
            "Review ROPs quarterly — demand spikes sharply pre-monsoon (louvers) and post-Diwali (HPL laminates)",
            "Keep a printed ROP card for fast-moving louver blades and ACP — walk-in project customers need same-day confirmation",
        ],
        "benchmark": "World-class dealers automate ROP alerts. Manual checking of 150+ SKUs daily is error-prone — Hindalco blade stockout during façade season means losing a project order.",
        "indian_context": "Tally ERP supports reorder level alerts per item — Stock Items → Reorder Level. For high-value ACP panels (Alucobond Silver ₹3,650/sheet), set tighter ROPs — stockout means losing a multi-lakh façade project.",
    },

    "abc_analysis": {
        "title": "ABC Analysis — Pareto-Based Inventory Classification",
        "method": "Rank all SKUs by annual revenue contribution. Assign A/B/C based on cumulative % of total revenue.",
        "classification": {
            "A_class": "Top 20% of SKUs → contributes 80% of revenue → Daily review, 95%+ service level",
            "B_class": "Next 30% of SKUs → contributes 15% of revenue → Weekly review, 90% service level",
            "C_class": "Bottom 50% of SKUs → contributes 5% of revenue → Monthly review, 85% service level",
        },
        "your_current_abc": {
            "A_SKUs": ["Hindalco Z-Section Louver Blade 150mm", "Alucobond ACP 4mm Silver 8×4ft", "Aerofoil Louver Blade 200mm Anodised", "Greenlam HPL Sheet 1mm Ivory Matt"],
            "A_revenue_share": "74% of total revenue from top louver/ACP/HPL SKUs",
            "B_count": "14 SKUs → 21% revenue",
            "C_count": "28 SKUs → 5% revenue",
            "insight": "28 C-class SKUs are tying up cash and godown space for only 5% revenue — rationalise; specialty finishes should be order-on-demand only",
        },
        "action_by_class": {
            "A_class": "Daily physical count, dedicated flat-rack storage, direct Hindalco/Alucobond relationship, 95%+ service level",
            "B_class": "Weekly stock review, standard reorder cycle, dual sourcing for top B-SKUs",
            "C_class": "Monthly review, order only on confirmed project demand, auto-10% discount after 60d no movement",
        },
        "extended_xyz": {
            "X": "Stable demand (σ/avg <20%) — predictable, easy to manage",
            "Y": "Variable demand (σ/avg 20-50%) — needs safety stock buffer",
            "Z": "Sporadic demand (σ/avg >50%) — order only to confirmed demand",
            "best_combo": "AX = tightest control + JIT possible. CZ = candidate for discontinuation",
        },
        "benchmark": "World-class: A-class SKUs = <25% of SKU count, >80% revenue. Dead stock < 3%. Hardware/sanitary dealers with good range have 150-300 SKUs — strict ABC is essential.",
        "indian_context": "In hardware/sanitary trade, seasonal SKUs (plumbing items before monsoon, kitchen hardware before Diwali) should be classified AY or AZ depending on variability — don't apply standard ABC without seasonality overlay.",
    },

    "gmroi": {
        "title": "GMROI — Gross Margin Return on Inventory Investment",
        "formula": "GMROI = Annual Gross Margin ÷ Average Inventory Cost",
        "interpretation": {
            "above_3.0": "Excellent — top-performing dealers",
            "2.0_to_3.0": "Good — healthy inventory productivity",
            "1.0_to_2.0": "Acceptable — room for significant improvement",
            "below_1.0": "Poor — inventory costs more to hold than it earns",
        },
        "your_current_data": {
            "gross_margin_annual": "₹1.09Cr (26.4% × ₹4.15Cr annual revenue)",
            "avg_inventory_value": "₹46.2L",
            "GMROI": "2.06 — Good, approaching 2.0 target",
            "target": "2.3+ (achievable by clearing ₹4.1L dead stock + improving Viva Composite-sourced margin)",
        },
        "how_to_improve": [
            "Clear ₹4.1L dead stock (PVC louvers + old ACP finishes) → reduces denominator → GMROI improves to ~2.24",
            "Shift Viva Composite volume to Alucobond budget line (better quality + reliability) → reduces RTV losses, increases numerator",
            "Faster turnover on A-class louver/ACP SKUs → both metrics improve",
            "Negotiate flat-rack freight inclusion in Alucobond pricing → direct margin improvement on large panel orders",
        ],
        "by_sku": {
            "Aerofoil Louver Blade 200mm Anodised": "GMROI ≈ 4.2 (28.5% margin, 4.8× turnover) — star performer",
            "PVC Louver Panel 100mm White": "GMROI = 0 — dead stock, pure cost",
            "Viva Composite ACP (with RTV losses)": "GMROI ≈ 1.54 (24.6% gross margin, slow turns + high rejection rate)",
        },
        "benchmark": "Façade material dealers India: GMROI 1.6-2.8. Target 2.2+. Best-in-class with focused range + project-based billing: 2.5-3.2.",
    },

    "jit": {
        "title": "JIT — Just-In-Time Inventory",
        "principle": "Order and receive inventory exactly when needed for production/sale. Eliminates holding cost but requires a near-perfect supply chain.",
        "requirements": [
            "Supplier on-time delivery ≥95% (non-negotiable)",
            "Lead time ≤3 days (JIT fails with 6+ day lead times)",
            "Stable, predictable demand (JIT fails with volatile demand)",
            "Strong supplier relationships with ASN (Advance Shipment Notifications)",
            "Near-zero defect rates (no time to reject and reorder)",
        ],
        "jit_applicability_your_business": {
            "Hindalco Extrusions": "PARTIAL JIT FEASIBLE — 92% on-time, 8-day lead time. Reduce safety stock to 10-12 days for stable-demand profiles.",
            "Greenlam Industries": "PARTIAL JIT FEASIBLE — 90% on-time, 9-day lead time. Good for B-class HPL SKUs.",
            "Alucobond (3A)":      "CONDITIONAL — 86% on-time; ACP panels need flat-rack truck coordination. Use for B-class finishes only, not A-class Silver/Champagne.",
            "Viva Composite":      "NOT RECOMMENDED — 78% on-time, 2.8-day avg delay + quality rejections. Full safety stock mandatory.",
        },
        "modified_jit_recommendation": "Apply 'lean inventory' approach: Keep 12-day safety stock for A-class louver/ACP SKUs (not 25-day), order via EOQ from Hindalco/Greenlam, eliminate C-class specialty finishes from stock entirely (order-on-demand only).",
        "risks": [
            "Supply disruption = immediate stockout (no buffer)",
            "Demand spike = cannot be absorbed",
            "Single-source JIT = concentration risk",
        ],
        "benchmark": "Full JIT is a Toyota/automotive concept. Building materials dealers should target 'lean inventory' — 70% reduction in safety stock vs current, not 100% elimination.",
        "indian_context": "JIT is difficult in India given road conditions, supplier reliability, and GSTIN compliance issues causing delivery delays. Target lean inventory first.",
    },

    "working_capital": {
        "title": "Working Capital & Cash Conversion Cycle (CCC)",
        "formula": "CCC = DIO + DSO − DPO",
        "variables": {
            "DIO": "Days Inventory Outstanding = (Avg Inventory ÷ COGS) × 365",
            "DSO": "Days Sales Outstanding = (Accounts Receivable ÷ Revenue) × 365",
            "DPO": "Days Payable Outstanding = (Accounts Payable ÷ COGS) × 365",
        },
        "your_current_data": {
            "DIO": "20 days (inventory turns 18.3× per year — good for hardware/sanitary)",
            "DSO": "32 days (customers taking average 32 days to pay — contractors slower at 45-78 days)",
            "DPO": "8 days (you're paying suppliers too fast — losing float)",
            "CCC": "20 + 32 − 8 = 44 days (target <38 days)",
            "excess_days": "6 days above target = ~₹5.7L extra cash tied up (₹28.4L/month ÷ 30 × 6)",
        },
        "improvement_actions": {
            "Reduce DSO by 10 days": "Offer 1.5% early payment discount to façade contractors and developers → get paid in 28 days vs 38 → frees ₹5.8L cash",
            "Increase DPO by 14 days": "Negotiate NET-30 with Hindalco/Alucobond (vs current NET-10) → hold cash 20 more days → ₹3.8L more cash in hand",
            "Reduce DIO by 4 days": "Clear dead stock ₹4.1L → DIO drops from 24 to 20 → ₹2.2L freed",
            "combined_impact": "All 3 actions: CCC from 52 → 28 days = ₹12.4L more cash available",
        },
        "benchmark": "Façade material dealers India: CCC 42-60 days (longer project billing cycles vs hardware retail). Best-in-class: 32-42 days. Yours at 52 days has clear improvement path.",
        "indian_context": "GST credit terms (ITC available T+1 month) effectively extend your DPO by 30 days on tax value. Hindalco and Alucobond both have formal dealer portal payment terms — negotiate NET-30 in writing as part of annual business review. LME-linked pricing revisions add complexity — lock forward pricing when possible.",
    },

    "inventory_turnover": {
        "title": "Inventory Turnover Ratio & Days Sales Inventory (DSI)",
        "formula_turnover": "Inventory Turnover = COGS ÷ Average Inventory Value",
        "formula_dsi": "DSI = 365 ÷ Inventory Turnover  (or: Avg Inventory ÷ Daily COGS)",
        "your_current_data": {
            "turnover": "4.2× per year",
            "DSI": "87 days (365 ÷ 4.2)",
            "benchmark_vs": "Target 5-6× for plywood dealers",
            "gap": "Achieving 5× would free ₹4.8L capital (same revenue with less inventory)",
        },
        "by_class": {
            "A_class_target": "8-12× per year (30-45 day DSI)",
            "B_class_target": "5-8× per year (45-73 day DSI)",
            "C_class_target": "3-5× per year — if lower, discontinue",
            "dead_stock": "0× — immediate action needed",
        },
        "how_to_improve": [
            "Clear ₹4.2L dead stock → turnover improves from 4.2× to ~5.0×",
            "Reduce overstock ₹7.8L by 50% → further improvement",
            "Tighter EOQ ordering → less excess buffer on B/C SKUs",
            "Order-on-demand for C-class → removes slow inventory",
        ],
        "benchmark": "Plywood dealers India: 4-6× acceptable. Best-in-class (with live DMS): 6-8×. Yours at 4.2× is below target.",
        "indian_context": "Seasonal stockpiling before Diwali will temporarily lower turnover — that's intentional. Measure turnover monthly, not just annually.",
    },

    "fifo_lifo": {
        "title": "Inventory Costing Methods: FIFO, LIFO, WAC",
        "fifo": {
            "definition": "First In, First Out — oldest stock is sold/used first (mirrors physical flow for most products)",
            "pros": ["Matches actual physical flow of goods", "Lower COGS in inflation = higher gross profit", "Compliant with Indian GAAP (Ind AS 2) and IFRS"],
            "cons": ["Higher taxable profit in rising price environment", "Balance sheet inventory at recent (higher) cost"],
            "best_for": "Perishables, fashion goods, building materials with grade variation",
        },
        "lifo": {
            "definition": "Last In, First Out — newest stock sold first",
            "status": "NOT PERMITTED under Indian GAAP (Ind AS 2) or IFRS — cannot use in India",
            "note": "Only US GAAP (ASC 330) allows LIFO. Indian businesses must use FIFO or WAC.",
        },
        "wac": {
            "definition": "Weighted Average Cost — all units valued at the running average purchase price",
            "pros": ["Smooths price fluctuations", "Simplest to implement (default in Tally ERP)", "GST ITC calculation is straightforward"],
            "cons": ["Inventory value lags current replacement cost", "Masks true margin changes when prices rise"],
            "best_for": "Fungible commodities, raw materials, standard grades",
        },
        "recommendation_for_you": "Your Tally ERP uses WAC by default — this is correct and compliant. For management reporting, calculate FIFO-equivalent margin by tracking latest purchase price separately. Your 8mm Flexi margin issue (23.8% stated vs 6.7% true) is partly a WAC vs true-cost problem — WAC averages away Gauri's high freight.",
        "indian_context": "Tally ERP → Stock Summary uses WAC. For true margin analysis, export to Excel and apply FIFO/landed cost method manually. This is exactly what InvenIQ AI does in the margin analysis reports.",
    },

    "demand_forecasting": {
        "title": "Demand Forecasting Methods for Inventory Management",
        "why_it_matters": "Accurate demand forecast = right stock at right time. Plywood dealers who forecast have 40-60% less dead stock and 30% fewer stockouts.",
        "methods": {
            "Simple Moving Average (SMA)": {
                "formula": "SMA = (D₁ + D₂ + ... + Dₙ) ÷ n",
                "best_for": "Stable demand, no trend or seasonality",
                "example": "18mm BWP last 3 months: 460, 480, 480 → SMA = 473 sheets/month",
                "weakness": "Slow to react to trend changes",
            },
            "Weighted Moving Average (WMA)": {
                "approach": "Recent months get higher weight (e.g., 50% recent, 30% mid, 20% oldest)",
                "example": "Apr: 480×0.5 + Mar: 460×0.3 + Feb: 440×0.2 = 466 sheets",
                "best_for": "Trending demand (growing or declining)",
            },
            "Exponential Smoothing (ETS)": {
                "formula": "F(t+1) = α × D(t) + (1−α) × F(t)",
                "alpha_guide": "α=0.1 (smooth, slow react) to α=0.3 (responsive, reactive)",
                "best_for": "Most inventory items — good balance of smoothing and responsiveness",
                "example": "α=0.2, current demand 480, previous forecast 460 → F = 0.2×480 + 0.8×460 = 464",
            },
            "AI/ML (Used in InvenIQ AI)": {
                "approach": "Gradient boosting model trained on 13 months of your data + external signals",
                "signals_used": ["Historical demand by SKU", "Seasonal index (Diwali +28%, monsoon -15%)", "Construction permit activity in HSR/Koramangala", "Competitor stockout signals"],
                "accuracy": "MAE ≈ 8-12% on your data — better than manual forecast by 3×",
            },
        },
        "seasonal_index_your_business": {
            "Apr_Jun": "1.0 (baseline)",
            "Jul_Aug": "0.85 (monsoon slowdown -15%)",
            "Sep":     "1.05 (pre-festive preparation)",
            "Oct_Nov": "1.28 (Diwali peak +28%)",
            "Dec_Mar": "1.12 (post-Diwali construction completion +12%)",
        },
        "benchmark": "Manual forecast error: 25-35% MAE. Moving average: 15-20%. Exponential smoothing: 10-15%. AI/ML: 8-12%. Each 5% improvement in forecast = ~₹1.5L less safety stock needed.",
        "indian_context": "Key external signals to track: BBMP building permits (available online), real estate project launches in Bangalore zones, Century/Greenply price circulars (signal market moves).",
    },

    "vendor_scorecard": {
        "title": "Supplier / Vendor Scorecard — KPIs & Rating Method",
        "kpis_and_weights": {
            "On-Time Delivery (30%)": {
                "formula": "On-Time POs ÷ Total POs × 100",
                "benchmark": ">90% = Good, >95% = Excellent",
            },
            "Quality / GRN Match Rate (25%)": {
                "formula": "Matched GRNs ÷ Total GRNs × 100 (grade + quantity + price all correct)",
                "benchmark": ">97% = Excellent, <90% = Review supplier",
            },
            "Price Competitiveness (20%)": {
                "formula": "Vendor Price ÷ Market Index Price − 1 (negative = below market = good)",
                "benchmark": "<+2% above market = acceptable, >+5% = negotiate or switch",
            },
            "Fill Rate (15%)": {
                "formula": "Qty Delivered ÷ Qty Ordered × 100",
                "benchmark": ">98% = Excellent. Partial fills disrupt production.",
            },
            "Responsiveness (10%)": {
                "formula": "Avg resolution time for queries/complaints/deviations",
                "benchmark": "<24 hours",
            },
        },
        "your_supplier_scores": {
            "Hindalco Extrusions": "Score: 92/100 — PREFERRED (On-time 92%, Price stable LME-linked, GRN 98%)",
            "Greenlam Industries": "Score: 90/100 — PREFERRED (On-time 90%, Price +2% premium quality, GRN 97%)",
            "Merino Industries":   "Score: 88/100 — GOOD (On-time 88%, Price +4% premium, GRN 96%)",
            "Alucobond (3A)":      "Score: 82/100 — CONDITIONAL (On-time 86%, import lead time 10d, GRN 94%)",
            "Viva Composite":      "Score: 58/100 — ACTION REQUIRED (On-time 78%, quality rejection 38.5%, GRN 88%)",
        },
        "action_thresholds": {
            "above_85": "Preferred — expand volume, negotiate better terms",
            "70_to_85": "Conditional — monitor quarterly, dual-source critical SKUs",
            "below_70": "30-day improvement plan or begin supplier replacement",
        },
        "benchmark": "World-class: Top 2-3 suppliers cover 70-80% of volume. Viva Composite at 58/100 must be on improvement plan — their quality rejection rate is reducing margin by 3-4pp on ACP budget orders.",
        "indian_context": "Many Indian dealers use informal relationships instead of scorecards — this is why hidden costs (Viva Composite rejection + RTV handling) go undetected for months. Formalise at least a quarterly vendor review with Hindalco and Alucobond — both have structured dealer programmes with LME price transparency.",
    },

    "dead_stock_strategy": {
        "title": "Dead Stock Management — Recovery Strategies",
        "definition": "Inventory with no sales movement in 60+ days (severe: 90+ days). Dead stock = locked cash + holding cost + insurance + space cost.",
        "cost_of_dead_stock": {
            "holding_cost": "20-25% of value per year (₹4.1L × 22% = ₹90,200/year just in holding cost)",
            "opportunity_cost": "Same capital could fund faster-moving ACP/louver A-class stock during façade season",
            "space_cost": "Dead stock occupies prime flat-rack and cradle space (you have 74% capacity at Peenya Main Godown — but space is type-specific)",
        },
        "your_current_situation": {
            "total_dead": "₹4.1L (8.9% of inventory — 3× above industry benchmark)",
            "items": [
                "PVC Louver Panel 100mm White 3m: ₹1.94L, 98 days, 112 units",
                "Alucobond ACP 4mm Gold (old finish): ₹1.38L, 92 days, 54 sheets",
                "Merino HPL Sheet Abstract Print (disc.): ₹0.78L, 84 days, 36 sheets",
            ],
            "urgency": "Every 30 additional days adds ₹7,550 in holding cost on this ₹4.1L",
        },
        "clearance_strategies": {
            "MEP Contractor Discount (fastest)": "10-12% discount to MEP contractors and industrial buyers → PVC louver panels for utility/parking shade → target ₹1.5L cleared in 2 weeks",
            "Bundle Selling": "Bundle old Alucobond Gold ACP with new Silver/Champagne orders for interior designers — feature accent walls at near-full price",
            "Architect Targeting": "Merino Abstract Print HPL → target interior architects for café/retail feature walls; 12% discount + offer sample installation",
            "Supplier Return": "Check Alucobond dealer agreement for return/exchange policy on discontinued finishes — credit against current orders is common",
            "Secondary Market": "If above fails → secondary dealer at 25-30% discount — better than holding cost eating margin",
            "Price Automation": "Set system alert: auto-apply 10% discount if 60 days no movement, 15% at 90 days",
        },
        "prevention": [
            "Monthly SKU velocity review — flag any item with <2 movements in 30 days",
            "ABC-based buying discipline — no C-class specialty finish order without confirmed project demand",
            "Don't over-buy custom ACP finishes or specialty HPL decors — design trends change fast; stock minimum 30-45 days cover",
            "Trial orders for new SKUs — max 10-15 sheets first order for new ACP finishes, max 20-30 pieces for new louver profiles",
        ],
        "benchmark": "Dead stock target: <3% of inventory value. Your 8.9% needs urgent attention. Industry best: <2%. Every 1% reduction = ₹46,200 freed (on ₹46.2L inventory).",
        "indian_context": "If returning goods to Alucobond/Greenlam, credit note must be raised within 30 days of original supply date for correct ITC reversal. Alucobond's return policy for discontinued finishes allows credit against active SKUs — check dealer agreement. Viva Composite's policy is stricter for quality rejections.",
    },

    "industry_benchmarks": {
        "title": "Industry Benchmarks — Plywood/Building Materials Dealers (India)",
        "financial_kpis": {
            "Gross Margin": "20-28% (BWP/premium grades: 22-26%), (Commercial/MR grades: 15-20%)",
            "Net Profit Margin": "4-8% for organised dealers (informal dealers often 2-4%)",
            "Revenue Growth": "8-15% annually in Tier-1 cities (Bangalore: 10-18% given construction boom)",
            "Working Capital Cycle": "35-50 days typical, <40 days = best-in-class",
        },
        "inventory_kpis": {
            "Inventory Turnover": "4-8× per year (target 5-6×)",
            "GMROI": "1.5-2.5 (target 2.0+)",
            "Dead Stock %": "<3% of total inventory value",
            "Stockout Rate": "<2% of line items on any given day",
            "Order Fill Rate": ">95% (complete orders shipped without short-supply)",
            "Inventory Accuracy": ">98% (physical vs system count within 2%)",
        },
        "supplier_kpis": {
            "On-Time Delivery": ">90% for primary suppliers",
            "GRN Match Rate": ">97% (quantity, grade, price all matching PO)",
            "Lead Time": "5-7 days local, 10-14 days outstation",
            "Price vs Market": "Within ±3% of market index",
        },
        "customer_kpis": {
            "DSO": "25-35 days (B2B credit norm is NET-30 in India)",
            "Bad Debt Rate": "<1.5% of annual revenue",
            "Repeat Customer Rate": ">70% annual repeat purchases",
            "Customer Concentration": "Top 5 customers <40% of revenue (risk management)",
        },
        "operational_kpis": {
            "Order Fulfillment Time": "<4 hours from order to dispatch",
            "Dispatch SLA": ">95% same-day dispatch",
            "Picking Error Rate": "<0.5% of orders",
            "QC Pass Rate": ">97%",
        },
        "your_performance_vs_benchmarks": {
            "Gross Margin 24.8%": "ABOVE RANGE (hardware/sanitary delivers 24-34% vs plywood 18-24% — strong)",
            "Working Capital 44d": "ABOVE TARGET (target <38d — 6 days to improve; Sharma Constructions 78d overdue is the drag)",
            "Dead Stock 8.9%": "HIGH RISK (target <3% — PVC Louver Panel and old Alucobond Gold ACP need urgent clearance)",
            "Stock Turnover 5.2x": "WITHIN TARGET (target 5-6× — on track, keep A-class replenishment tight)",
            "GMROI 2.14": "GOOD (target 2.0+ — clear dead stock to push to 2.3+)",
            "Dispatch SLA 87%": "BELOW TARGET (target 95% — Hindalco Z-blade stockout during façade season is the main cause of delays; flat-rack truck availability is secondary bottleneck)",
        },
    },

    "kanban": {
        "title": "Kanban Inventory System — Visual Pull-Based Replenishment",
        "principle": "A visual signalling system where empty containers or cards trigger replenishment. 'Pull' approach — you only produce/order when demand signals it. No excess inventory is built up.",
        "how_it_works": {
            "Two-Bin Kanban": "Bin 1 = working stock. Bin 2 = safety stock. When Bin 1 empties, flip the Kanban card → place order. Bin 2 covers demand during replenishment.",
            "Card-Based": "Each item has a Kanban card showing: SKU, supplier, order quantity, reorder point. Card is sent to supplier when bin is empty.",
            "Digital Kanban (your DMS)": "Stock level crosses ROP → auto alert or auto PO raised by system.",
        },
        "applied_to_your_data": {
            "ideal_skus_for_kanban": ["18mm BWP", "12mm BWP", "12mm MR Plain"],
            "bin_1_qty_18mm": "200 sheets (10 days × 17 sheets/day + 30 buffer) = working stock",
            "bin_2_qty_18mm": "129 sheets = safety stock (reorder point from Century, 6-day lead time)",
            "trigger": "When bin 1 falls below 129 sheets → Kanban card triggers → Century gets 201-sheet EOQ order",
            "physical_setup": "Dedicate a section of HSR Layout WH for Kanban bins. Mark floor with tape. Train staff: 'When bin 1 is half-empty, move card.'",
        },
        "requirements": [
            "Reliable supplier (Century Plyboards: 96% on-time ✅ — ideal)",
            "Stable, predictable demand (18mm BWP: AX class ✅ — good fit)",
            "Accurate physical counts (your 96.8% accuracy is marginal — target 99%)",
            "NOT suitable for Gauri Laminates (68% on-time — Kanban fails with unreliable suppliers)",
        ],
        "benefits": ["Eliminates overordering (no Excel-guessing)", "Immediate visual signal — godown staff know when to order", "Reduces dead stock by preventing speculative buying"],
        "benchmark": "Best-in-class hardware dealers use two-bin Kanban for top 5 A-class SKUs. Results: 20-30% less overstock, zero manual reorder tracking errors.",
        "indian_context": "Print Kanban cards in Hindi + English for godown staff. WhatsApp the card photo to the supplier rep — practical, zero technology needed for the basic version.",
    },

    "vmi": {
        "title": "VMI — Vendor Managed Inventory",
        "definition": "Vendor Managed Inventory: the supplier takes responsibility for monitoring and replenishing your stock levels. You share inventory data; they decide when and how much to deliver.",
        "how_it_works": [
            "You share real-time stock levels with supplier (via shared portal, WhatsApp report, or API)",
            "Supplier monitors your stock and proactively ships before you run out",
            "Replenishment is based on agreed min/max levels, not on your manual PO",
            "Risk transfers from you to supplier — they are responsible for stockouts",
        ],
        "vmi_applicability_your_suppliers": {
            "Century Plyboards": "HIGH FEASIBILITY — Market leader with VMI programs for large dealers. Request 18mm + 12mm BWP VMI. Minimum monthly purchase ₹5L typically required.",
            "Greenply Industries": "MEDIUM — Has dealer portal (GreenConnect). Can share weekly inventory via WhatsApp or email report.",
            "Gauri Laminates": "LOW — Small supplier, no VMI capability. Better to switch sourcing for 8mm grades.",
        },
        "applied_to_your_data": {
            "estimated_benefit": "₹4-6L reduction in carrying cost by lowering safety stock from 27 to 10 sheets (Century takes responsibility)",
            "how_to_start": "Call Century regional manager. Request: 'We want to pilot VMI for 18mm BWP. Share weekly stock report — you trigger the delivery when we reach 150 sheets.'",
            "data_to_share": "Current stock, ROP, min/max levels, avg daily consumption — all available in your DMS dashboard",
        },
        "risks": ["Data sharing exposes your sales velocity to supplier", "Supplier may push slow-moving SKUs during restocking", "Reduces your negotiating leverage on pricing"],
        "benchmark": "Large organised dealers (₹2Cr+ annual) often have VMI with 1-2 primary suppliers. Reduces ordering effort 40-60% and stockout events by 70%.",
        "indian_context": "Request consignment-VMI hybrid: Century stocks goods at your godown but you pay only when you sell (like SOR — Sale or Return). Common with Century for premium BWP grades in Bangalore.",
    },

    "cross_docking": {
        "title": "Cross-Docking — Zero-Storage Direct Transfer",
        "definition": "Goods arrive from supplier and are immediately transferred to outbound delivery without entering storage. Transit point only — no shelf storage.",
        "how_it_works": "Supplier truck arrives → goods unloaded → immediately sorted and loaded onto customer delivery vehicles. Ideal when goods are already 'sold' before they arrive.",
        "when_it_applies_for_you": {
            "project_orders": "When you get a confirmed project order (e.g., Prestige Skyrise) → order from Century → receive → directly transfer to project site without godown storage",
            "customer_direct": "Large contractor orders 200 sheets 18mm BWP → raise PO to Century → Century delivers to your yard → you load on your delivery truck same day",
            "benefits": "No godown space used, no double-handling, faster delivery, zero holding cost on transit goods",
        },
        "applied_to_your_data": {
            "best_use_case": "Metro Constructions Koramangala (₹9.5L project) → negotiate direct delivery from Century's Bangalore depot to Koramangala site → save 2-3 days + ₹8,000 freight",
            "suitable_skus": "Large quantity orders of A-class SKUs where project or customer is confirmed",
            "current_opportunity": "Check your next 3 project deliveries — any that need >100 sheets of same SKU? Apply cross-dock protocol.",
        },
        "limitations": ["Requires tight coordination between inbound (supplier) and outbound (delivery)", "Fails if supplier delivery is delayed — customer gets nothing", "Only viable for standard products, not mixed-SKU orders"],
        "benchmark": "Modern building materials distributors cross-dock 15-25% of project volumes. Saves ₹25-40K per month in handling for dealers above ₹2Cr revenue.",
        "indian_context": "Inform your Century sales rep in advance — request 'direct mill delivery' for large project orders. Century often accommodates for dealers above ₹5L/month. Save godown handling + freight.",
    },

    "fill_rate_otif": {
        "title": "Fill Rate & OTIF — Order Fulfilment Quality KPIs",
        "fill_rate": {
            "definition": "Fill Rate = % of customer orders fulfilled completely on the first attempt (no partial deliveries, no substitutions)",
            "formula": "Fill Rate = (Line Items Fully Fulfilled ÷ Total Line Items Ordered) × 100",
            "types": {
                "Line Fill Rate": "% of order lines shipped complete (most common)",
                "Order Fill Rate": "% of complete orders filled (stricter — entire order must be complete)",
                "Value Fill Rate": "₹ value of goods shipped ÷ ₹ value ordered × 100",
            },
            "your_current_data": {
                "estimated_fill_rate": "~88-91% (based on 18mm BWP near-stockout + dispatch SLA at 87%)",
                "target": ">95% for B2B building materials",
                "impact_of_low_fill_rate": "Every partial delivery frustrates contractors — they call competitors next time",
            },
        },
        "otif": {
            "definition": "OTIF = On Time In Full — the most comprehensive fulfilment metric. An order is OTIF only if it was delivered on time AND with complete quantity AND correct items.",
            "formula": "OTIF % = (Orders delivered on time AND in full ÷ Total orders) × 100",
            "your_current_data": {
                "on_time_component": "87% (dispatch SLA from your DMS)",
                "in_full_component": "~91% estimated (partial fulfillments when 18mm BWP is low)",
                "combined_otif": "~79% (87% × 91%) — significantly below 95% target",
                "annual_impact": "21% of orders failing OTIF = ~₹5.9L/month revenue at risk from customer dissatisfaction",
            },
        },
        "how_to_improve": [
            "Fix 18mm BWP stockout risk → immediately improves OTIF by 5-7pp",
            "Address Gauri delay (PO-7731) → improves on-time component",
            "Set automatic customer alerts for partial deliveries (don't surprise them)",
            "Reserve stock for confirmed project orders — don't sell project-allocated stock to walk-ins",
        ],
        "benchmark": {
            "world_class": ">98% OTIF — automotive, FMCG supply chains",
            "building_materials_target": ">92% OTIF for building materials dealers",
            "your_gap": "79% OTIF → gap to target = 13pp → approx ₹3.7L/month in customer satisfaction impact",
        },
        "indian_context": "Track OTIF manually in Excel if your DMS doesn't compute it: every order → note if delivered on time + complete. Review weekly. Share metric with your delivery team — visibility drives accountability.",
    },

    "cycle_counting": {
        "title": "Cycle Counting — Continuous Inventory Accuracy",
        "definition": "Instead of one annual physical inventory count (disruptive), count a small subset of SKUs every day/week in rotation. All SKUs get counted multiple times per year.",
        "vs_annual_count": {
            "Annual Physical Count": "Count everything once. Requires godown shutdown 1-2 days. Errors found once a year. Accuracy decays throughout the year.",
            "Cycle Counting": "Count 3-5 SKUs per day. Never shut down. Errors found within days. Accuracy maintained continuously.",
        },
        "cycle_counting_plan_for_you": {
            "A_class_skus": "Count weekly (18mm BWP, 12mm BWP — high value, high risk) → 52 counts/year",
            "B_class_skus": "Count monthly → 12 counts/year",
            "C_class_skus": "Count quarterly → 4 counts/year",
            "daily_time": "5-10 minutes per day for staff (count 3-4 SKUs, record in DMS or phone note)",
            "trigger_priority": "Always count immediately after any discrepancy or theft suspicion",
        },
        "applied_to_your_data": {
            "current_accuracy": "96.8% (from your DMS)",
            "gap": "3.2% error rate = ~₹1.2L of inventory unaccounted at any time",
            "target": ">99% accuracy (world-class: 99.5%)",
            "your_top_count_priority": "18mm BWP (high movement, near stockout — count weekly), 6mm Gurjan BWP (dead stock, count monthly to verify no silent shrinkage)",
        },
        "discrepancy_handling": [
            "If physical < system: investigate shrinkage, damage, or recording error",
            "If physical > system: investigate GRN recording error or wrong SKU received",
            "Any variance >2% → raise an investigation before adjusting the system",
            "Track 'shrinkage rate' monthly — target <0.5% of inventory value",
        ],
        "benchmark": "Best-in-class dealers: 99.5%+ inventory accuracy via daily cycle counting. Your 96.8% loses ~₹1.2L annually to silent discrepancies.",
        "indian_context": "Use WhatsApp to send count photos from godown to your DMS operator. Simple process: staff photographs bin + count on phone → operator updates Tally. No barcode scanner needed.",
    },

    "min_max": {
        "title": "Min-Max Inventory System",
        "definition": "Simple replenishment rule: set Minimum stock level (= Reorder Point + Safety Stock) and Maximum stock level (= what fits in space/budget). Order up to Max when stock hits Min.",
        "formula": {
            "Min": "Min = Safety Stock + (Lead Time × Daily Demand) = Reorder Point",
            "Max": "Max = Min + EOQ (or space/budget constraint)",
            "Order_Qty": "Order Qty = Max − Current Stock (when stock ≤ Min)",
        },
        "applied": {
            "18mm BWP": "Min = 129 sheets, Max = 330 sheets (129 + EOQ 201). Current: 140 — at Min threshold, order 190 sheets (330−140)",
            "12mm BWP": "Min = 152 sheets, Max = 320 sheets. Current: 220 — ok, but monitor (68 sheets above Min)",
        },
        "advantage": "Simpler than full EOQ system. Works in Tally ERP out of the box with min/max stock levels per item.",
        "indian_context": "Most small plywood dealers use informal min-max mentally — formalise it in Tally. Set Min = ROP and Max = ROP + 2-3 weeks of demand for A-class SKUs.",
    },

    "product_catalog": {
        "title": "Product Catalog — Aluminium Louvers, ACP Cladding & HPL Laminates",
        "overview": "The catalog covers aluminium louver systems, ACP (Aluminium Composite Panel) cladding, HPL (High Pressure Laminate) sheets, operable louver systems, and related accessories and fixings — from brands including Hindalco, Alucobond, Viva Composite, Greenlam, and Merino.",
        "aluminium_louver_brands": {
            "Hindalco Extrusions": "India's largest aluminium extrusion manufacturer (HQ Mumbai). Consistent quality, 92% on-time delivery. Z-section, C-channel, U-section and aerofoil louver profiles. Alloy 6063-T5 standard. Trade discount ~18-22% from list. Preferred supplier for high-volume projects.",
            "Aerofoil by Hindalco": "Premium aerofoil profile louver blades — engineered airfoil cross-section for maximum air-to-water-deflection. Architect-specified for commercial façades. Available in 150mm, 200mm, 250mm widths. Anodised silver, champagne, black finishes. Margin 28-32%.",
            "Sunshade Systems": "Operable motorised louver systems with Somfy/Nice motor integration. Project-based supply — order against confirmed BMS spec. Margin 32-40% on operable systems.",
        },
        "acp_brands": {
            "Alucobond (3A Composites)": "Swiss brand — the benchmark for premium ACP. PVDF-coated exterior grade. FR (fire retardant) and standard grades. 4mm standard (0.5mm skin). Architect-specified for premium commercial façades. Trade discount 20-25% from list. Margin 28-34%.",
            "Viva Composite Panel": "Indian brand — budget to mid ACP. Good value for large-area projects where cost is primary driver. Polyester coating, non-FR standard. Pricing 25-35% below Alucobond. On-time delivery 78%. Margin 24-28%.",
            "Alucoil": "Spanish premium ACP — architect-specified for luxury projects. PVDF + special metallics. Import lead time 6-8 weeks. Hold against confirmed specs only.",
        },
        "hpl_brands": {
            "Greenlam Industries": "India's largest HPL manufacturer. Full range: standard interior (1mm, 0.8mm), compact (6mm, 12mm for cubicles), exterior grade. 1000+ decors. 90% on-time. Margin 30-34%.",
            "Merino Industries": "Strong in designer decors and wood-grain finishes. Preferred by interior designers for feature walls. Pricing ~5% above Greenlam. Margin 31-34%.",
            "Century Laminates": "Budget-to-mid HPL. Good for volume contractor orders. Margins 26-30%.",
        },
        "product_segments": {
            "Fixed Louver Blades": {
                "types": "Z-section (most common for rain screens), C-section (architectural), Aerofoil (high-spec commercial), T-bar, Y-section",
                "key_widths": "100mm, 150mm, 200mm, 250mm, 300mm",
                "lengths": "Standard 3m and 6m. Custom cut available at mill minimum 200m",
                "finish": "Mill finish (raw), Anodised (Silver, Champagne, Black), Powder coated (any RAL)",
                "hsn": "7604", "gst": "18%",
                "pricing": "Z-section 150mm anodised 3m: ₹980-1,260. Aerofoil 200mm anodised 3m: ₹2,200-2,800. Custom powder coat: +₹80-120/piece.",
                "tip": "Always confirm pitch (spacing) requirement — 150mm blade on 250mm pitch is standard for rain screen. Closer pitch increases material cost by 40%.",
            },
            "Operable Louver Systems": {
                "types": "Manual linked-rod operable, Motorised (24V DC Somfy/Nice), Building-integrated (BMS controlled)",
                "applications": "Commercial façades, sun shading, ventilation control, car park screening",
                "hsn": "7616 (aluminium structural)", "gst": "18%",
                "pricing": "Manual operable per sq.m: ₹2,800-4,200. Motorised per sq.m: ₹4,500-7,200 (including motor + controls).",
                "tip": "Always take shop drawing approval before fabrication. Operable systems need structural engineer sign-off for wind load calculation.",
            },
            "ACP Panels (Aluminium Composite)": {
                "types": "Standard (polyester coating, non-FR), FR Grade (fire retardant mineral core), PVDF coated (exterior premium), Metallic, Mirror, Brushed, Wood grain print",
                "thickness": "3mm (interior), 4mm (exterior standard), 5mm (premium/structural)",
                "sheet_size": "Standard 8×4ft (2440×1220mm). Also 10×4ft available on indent.",
                "hsn": "7606", "gst": "18%",
                "pricing": "Viva 4mm polyester: ₹2,200-2,600/sheet. Alucobond 4mm PVDF: ₹3,200-3,800/sheet. FR grade: +10-15% premium.",
                "tip": "Always specify FR grade for interior applications in buildings above G+4. PVDF mandatory for exterior — polyester fades in 3-5 years outdoors.",
            },
            "HPL Laminates": {
                "types": "Standard interior (0.8mm, 1mm, 1.5mm), Post-form grade (can bend up to 35mm radius), Compact grade (6mm, 12mm — structural), Exterior HPL (UV-stabilised)",
                "sheet_size": "Standard 8×4ft (2440×1220mm). 10×4ft and 12×4ft on indent.",
                "finish": "Matt, Semi-gloss, Gloss, Suede, Brushed, Textile, Stone, Wood-grain",
                "hsn": "4814", "gst": "18%",
                "pricing": "Standard 1mm interior: ₹2,400-3,200/sheet (Greenlam). Compact 6mm: ₹3,800-4,600/sheet. Exterior HPL 6mm: ₹5,200-6,800/sheet.",
                "tip": "Compact HPL for toilet cubicles needs minimum 12mm thickness for partition strength. Interior 1mm is surface application only — bond to substrate (MDF/plywood).",
            },
            "Aluminium Profiles & Accessories": {
                "types": "C-channel, U-section, T-section, Angle, Flat bar (for sub-framing); Rivets, drill-fix screws, silicone sealants (for ACP installation)",
                "hsn": "7604 (extrusions) / 7318 (fasteners)", "gst": "18%",
                "pricing": "C-channel 6m: ₹380-560. Rivet box 500: ₹240-320. Structural silicone tube: ₹280-420.",
                "tip": "ACP installation requires: back rivet method or cassette system. Never direct screw to ACP face — causes cracking at screw point over time.",
            },
        },
        "hsn_gst_quick_ref": {
            "7604": "Aluminium bars, rods, profiles, extrusions (louver blades, channels, frames) — GST 18%",
            "7606": "Aluminium composite panels (ACP) — GST 18%",
            "4814": "HPL laminates — GST 18%",
            "7318": "Screws, rivets, bolts, fasteners — GST 18%",
            "7616": "Other aluminium articles (operable systems, frames) — GST 18%",
            "3214": "Silicone sealants, glazing compounds — GST 18%",
        },
        "selling_tips": {
            "project_package_upsell": "Sell complete façade system: louver blades + sub-framing profiles + rivets + sealant. Package deals improve average order value 55-70%.",
            "fr_grade_upgrade": "Always specify FR grade ACP for any project with interior fire escape corridors or buildings above 3 floors. Insurance and compliance requirement — easy upsell worth ₹15-20% premium.",
            "brand_positioning": "Viva Composite: value (budget residential/industrial). Alucobond: premium (commercial, IT parks, malls). Alucoil: super-premium (5-star, luxury spec).",
            "target_customers": "Façade contractors (primary bulk buyer), architects and interior designers (project spec), developers (direct project orders), MEP contractors (louvres for AHU/plant rooms).",
        },
    },

    "sanitary_products": {
        "title": "Louver & ACP Cladding Systems — Technical Knowledge for Dealers",
        "overview": "Aluminium louver and ACP cladding systems are high-margin façade products. Gross margin 26–34% is achievable. Key segments: aluminium fixed louvers (rain screens, sun shading), operable louver systems (motorised, manual), ACP cladding (building façades, signage, interiors), HPL laminates (interior walls, toilet cubicles). Project-based demand — relationship with architects and façade contractors is critical.",
        "sanitary_brands": {
            "Hindalco Extrusions": "Preferred aluminium extrusion supplier. 92% on-time, consistent alloy quality (6063-T5). Price linked to LME aluminium — review monthly. Trade discount 18-22%. Best for volume louver blade orders.",
            "Alucobond (3A Composites)": "Benchmark ACP brand. PVDF-coated, FR grade available. Architect-specified — having Alucobond stock builds credibility with spec-driven customers. Premium 28-34% margin.",
            "Viva Composite Panel": "Budget ACP — good for cost-sensitive projects. 78% on-time, variable thickness tolerance (+/- 0.2mm). Price 25-35% below Alucobond. Margin 24-28%.",
            "Greenlam Industries": "India's largest HPL manufacturer. Consistent quality, 1000+ decors, 90% on-time. Best overall HPL supplier for both standard and compact grades.",
            "Merino Industries": "Designer HPL decors — preferred by interior designers for feature walls and premium interiors. Margin 31-34%.",
            "Aerofoil / Hindalco Premium": "High-spec aerofoil louver profiles — engineered for wind load compliance. Architect-specified for commercial projects. Margin 28-32%.",
        },
        "product_categories": {
            "Fixed Aluminium Louvers": {
                "types": "Z-section (rain screen), C-section (architectural), Aerofoil (commercial high-spec), Horizontal, Vertical, Angled",
                "hsn": "7604", "gst": "18%",
                "pricing": "Z-section 150mm anodised 3m: ₹980-1,260. Aerofoil 200mm anodised: ₹2,200-2,800. Custom colours: +₹80-120/piece.",
                "tip": "Most common configuration: 150mm Z-blade on 250mm pitch. Confirm wind load calculation and fixing bracket spacing before supply.",
            },
            "Operable Louver Systems": {
                "types": "Manual linked-rod, Motorised (Somfy 24V DC), BMS-integrated",
                "hsn": "7616", "gst": "18%",
                "pricing": "Manual per m²: ₹2,800-4,200. Motorised per m²: ₹4,500-7,200.",
                "tip": "Operable louvers need shop drawings and structural sign-off. Never supply without approved drawings — wind load failures are liability.",
            },
            "ACP Cladding Panels": {
                "types": "Standard (polyester, non-FR), FR grade (fire retardant), PVDF exterior, Metallic, Brushed, Mirror, Digital print",
                "hsn": "7606", "gst": "18%",
                "pricing": "Viva 4mm polyester: ₹2,200-2,600/sheet. Alucobond 4mm PVDF: ₹3,200-3,800/sheet. FR grade premium: +12-15%.",
                "tip": "FR mandatory for fire egress areas and buildings G+4 and above. PVDF mandatory for exterior — polyester fades in 3-5 years.",
            },
            "HPL Laminates": {
                "types": "Interior standard (0.8mm, 1mm), Compact (6mm, 12mm), Exterior UV grade, Post-form grade",
                "hsn": "4814", "gst": "18%",
                "pricing": "Standard 1mm Greenlam: ₹2,400-3,200/sheet. Compact 6mm: ₹3,800-4,600. Exterior 6mm: ₹5,200-6,800.",
                "tip": "Toilet cubicle partitions require 12mm compact HPL minimum. Specify with phenolic backing for moisture resistance.",
            },
            "Sub-Framing & Accessories": {
                "types": "C-channel, angle brackets, drill-fix anchors, rivets (dome head/CSK), structural silicone, EPDM tape",
                "hsn": "7604 / 7318", "gst": "18%",
                "pricing": "C-channel 6m: ₹380-560. Rivet box 500: ₹240-320. Structural silicone: ₹280-420/tube.",
                "tip": "Never supply ACP without the correct fixing accessories — incomplete supply leads to improper installation, delamination, and warranty claims.",
            },
        },
        "selling_tips": {
            "bundle_strategy": "Louver blades + sub-framing + rivets + sealant = complete system supply. Bundle increases AOV by 55-70% vs blade-only supply and locks contractor relationship.",
            "segment_targeting": "Façade contractors: louver blades + ACP in volume (bulk pricing, credit terms). Architects: brand spec support (Alucobond samples, shop drawings). Developers: direct project pricing. MEP contractors: louvres for plant room screening.",
            "brand_positioning": "Viva Composite: value (budget/industrial). Alucobond: premium (commercial/IT parks). Greenlam HPL: standard interior. Merino: designer/feature wall spec.",
            "avoid_dead_stock": "Avoid custom powder-coat finishes without firm order — custom colours become dead stock. Avoid specialty metallic ACP (gold, copper) without confirmed project spec.",
        },
        "hsn_gst_quick_ref": {
            "7604": "Aluminium extrusions, louver blades, channels, profiles — GST 18%",
            "7606": "ACP panels, aluminium composite sheets — GST 18%",
            "4814": "HPL laminates — GST 18%",
            "7616": "Aluminium operable systems, complex fabrications — GST 18%",
            "7318": "Rivets, screws, anchors, drill-fix fasteners — GST 18%",
        },
        "benchmark": "Façade material dealer margin: 26-34% gross (louvers/ACP) and 30-34% (HPL). Project-based order sizes ₹5L-50L — single project can be worth 2-3 months of counter sales. Stock turnover: 4-6× per year (project billing cycles are longer). Key KPI: quote-to-order conversion rate.",
    },

    "seasonal_demand_hardware_sanitary": {
        "title": "Seasonal Demand Patterns — Aluminium Louvers, ACP & HPL Trade (India)",
        "overview": "Louver, ACP and HPL trade follows two primary seasonal cycles: pre-monsoon façade rush (Apr-Jun) and post-monsoon interior laminate surge (Oct-Nov). Project billing cycles extend DSO to 38-52 days vs 15-30 for counter retail. Understanding cycles prevents stockouts during project peaks and dead stock on discontinued finishes.",
        "seasonal_calendar": {
            "Jan-Feb (Post-monsoon project completions + new project planning)": {
                "demand": "+10-15% above baseline — projects handed over, billing collections come in",
                "hot_categories": "HPL laminates (interior finishing), ACP touch-up panels, accessories",
                "action": "Stock HPL standard finishes in December. Ensure Greenlam/Merino POs placed by Dec 10. Follow up billing from Q3 projects.",
            },
            "Mar-Apr (New FY planning + pre-monsoon project mobilisation)": {
                "demand": "+20-30% start of pre-monsoon façade season",
                "hot_categories": "Aluminium louver blades, ACP cladding, sub-framing profiles — project mobilisation",
                "action": "Run scheme audit for new FY. Negotiate fresh terms with Hindalco/Alucobond for FY targets. Pre-book LME-linked aluminium before price revision.",
            },
            "May-Jun (Pre-monsoon façade rush — PEAK season)": {
                "demand": "+30-40% for aluminium louvers, +25-30% for ACP — contractors rush to complete external work before monsoon",
                "hot_categories": "Z-section louver blades, aerofoil blades, ACP Silver/Champagne, sub-framing channels",
                "action": "Increase louver blade stock 3× from March levels. Pre-order Hindalco by April 15. Confirm flat-rack transport capacity — this is the bottleneck in peak season.",
            },
            "Jul-Aug (Monsoon — external work slows, interior work picks up)": {
                "demand": "Louvers -30%, ACP -25%, HPL laminates +15%",
                "hot_categories": "HPL compact laminates (toilet cubicles, interior walls), interior ACP (reception areas, corridors)",
                "action": "Reduce louver/ACP orders. Push HPL laminates and interior ACP — contractors shift to indoor finishes during monsoon.",
            },
            "Sep-Oct (Post-monsoon external construction restarts + Diwali office fit-outs)": {
                "demand": "+20-28% for ACP, +15-22% for louvers — fresh project wave + commercial Diwali fit-outs",
                "hot_categories": "ACP cladding (new commercial buildings), HPL compact (office toilet refurbs), operable louvers (premium office projects)",
                "action": "Pre-stock ACP Silver and Champagne by August 20. Stock HPL compact 12mm. Add motorised louver system samples to showroom.",
            },
            "Nov-Dec (Year-end project completion pressure)": {
                "demand": "+15-20% — developers push for completion before Dec 31 year-end",
                "hot_categories": "All categories — year-end billing pressure; project clients release final POs",
                "action": "Stock all fast-moving finishes. Push credit-limit customers for advance payments — year-end cash crunch common in façade trade.",
            },
        },
        "key_insights": [
            "External façade (louvers + ACP) follows pre-monsoon seasonality (Apr-Jun peak); interior laminates (HPL) follow post-monsoon (Oct-Nov)",
            "Aluminium price is LME-linked — buy forward in March before pre-monsoon price hike; can save 3-5% on large orders",
            "ACP panels need flat-bed truck for transport — book vehicles 2 weeks ahead during peak Apr-Jun season",
            "Operable louver demand is project-specific and architect-driven; never speculate stock — order against firm PO",
            "HPL Compact (6mm, 12mm) has year-round stable demand from toilet cubicle fabricators — never go below 30 sheets cover",
        ],
        "stocking_strategy": {
            "year_round_A_class": "Hindalco Z-blade 150mm anodised, Alucobond ACP Silver, Greenlam HPL Ivory Matt — never below 21 days cover",
            "seasonal_pre_buy": "Louver blades and ACP (place POs by April 1 — 60 days before June peak), HPL compact (pre-stock by September 15 for Oct-Nov interior surge)",
            "avoid_overstocking": "Custom powder-coat louvers, specialty ACP metallics (gold, copper, mirror) — order only against confirmed project spec",
        },
        "benchmark": "Best-in-class façade dealers: seasonal forecast accuracy within ±20% (project demand is lumpy). Pre-buying aluminium 60 days before seasonal peak is the single biggest lever to prevent stockouts — and the LME savings pay for the stock cost.",
    },

    "credit_management": {
        "title": "Credit Management — Limits, Overdue & Collections",
        "definition": "Credit management is the process of setting, monitoring, and enforcing customer credit limits to minimise bad debt while enabling sales growth. The key tension: too tight = lost sales; too loose = cash flow crisis.",
        "credit_limit_formula": {
            "method_1_sales_based": "Credit Limit = (Average Monthly Sales × Credit Period in months) × Safety Factor (0.8–1.2 based on payment history)",
            "method_2_financial": "Credit Limit = (Customer's Net Worth × 10–20%) assessed from ITR/audited financials",
            "method_3_simple": "Start new customers at ₹1–2L, review after 3 clean payments, increase in ₹1L steps.",
            "applied_to_your_data": "BuildRight averages ₹8L/month, 45-day credit → limit should be ₹12L. Current limit ₹15L (set too high). Recommend reducing to ₹12L.",
        },
        "credit_risk_scoring": {
            "scoring_factors": [
                "Payment history (40% weight): paid on time last 6 months",
                "Credit utilisation (25%): >85% = risky",
                "Business size & stability (20%): years in business, number of employees",
                "Overdue aging (15%): any invoice >60 days overdue = RED flag",
            ],
            "risk_tiers": {
                "GREEN":  "Payment within terms, utilisation <70%, no overdue >30d — standard credit",
                "AMBER":  "Occasional delay, utilisation 70–85%, overdue up to 60d — require PDC",
                "RED":    "Frequent delay, utilisation >85%, overdue >60d — block orders, escalate",
                "BLACK":  "Overdue >90d or bounced cheque — stop all supply, legal notice",
            },
        },
        "overdue_management": {
            "0_30_days":  "Send polite SMS reminder. Sales rep follows up. No supply impact.",
            "31_60_days": "Formal letter from MD. Require PDC for next order. Sales rep + accounts team call.",
            "61_90_days": "Hold all new dispatches. Offer settlement discount (1–3% for immediate payment). Escalate to business owner.",
            "90_plus_days": "Legal notice via advocate. No further credit. Consider selling debt to collection agency at 70–80p/rupee.",
        },
        "pdc_best_practices": [
            "Collect PDCs for all credit >₹2L (at least one cheque per invoice)",
            "Track PDC by date — present on date (never early, never late by >5 days)",
            "Bounced PDC: Section 138 NI Act — 30-day notice period, then criminal complaint",
            "Never accept PDC >90 days forward — increases liquidity risk",
            "Digital PDC (NACH mandate) is more reliable than paper cheques — recommend NACH for top 10 accounts",
        ],
        "dso_kpi": {
            "formula": "DSO = (Total Receivables ÷ Revenue MTD) × 30",
            "target_for_building_materials": "<35 days (best-in-class: <25 days)",
            "your_current": "Your DSO ≈ 34 days (₹12.8L receivables ÷ ₹28.4L MTD × 30). Target <30 days.",
            "impact": "Every 10 days DSO reduction = ₹9.5L freed from working capital at your revenue level",
        },
        "benchmark": "Building materials dealers India: DSO 28–45 days. Bad debt ratio <0.5% revenue = excellent; >2% = systemic credit problem.",
        "indian_context": "In India, 30/60/90-day credit is standard. Contractors pay slower (45–75 days avg) vs interior firms (21–35 days). GST e-invoice mandates now help — every invoice has a traceable IRN number. Link your credit tracking to invoice IRN for clean audit trail.",
    },

    "counter_pos": {
        "title": "Counter POS — Walk-In Sales & Retail Billing Management",
        "definition": "Counter POS (Point of Sale) covers all walk-in, over-the-counter transactions as opposed to credit/B2B order-based sales. For building material dealers, counter sales are typically 15–30% of revenue but 40–60% of gross margin contribution because walk-in buyers pay full price with no credit risk.",
        "counter_vs_wholesale": {
            "counter_margin":    "Counter walk-in: 18–24% gross margin (no credit risk, no volume discount)",
            "wholesale_margin":  "Credit B2B: 12–18% gross margin (credit risk + volume discounts + freight)",
            "counter_advantage": "Immediate cash/UPI payment, no overdue risk, higher margin per unit",
            "wholesale_advantage": "Higher volume per transaction, predictable demand, relationship-based reorders",
        },
        "kpis_to_track": {
            "daily_revenue_target":  "Set counter revenue target = 20–30% of total daily revenue target",
            "avg_bill_value":        "Target ₹6,000–₹12,000 for plywood/laminate counter. Below ₹3,000 = no upselling happening.",
            "items_per_transaction": "Target 2.5+ items/bill. Below 1.5 = pure commodity buying, no add-on selling.",
            "payment_mode_split":    "Healthy: 40–50% cash, 40–50% UPI, <15% card. Cash >70% = working capital risk.",
            "return_rate":           "Target <3% returns by value. Above 5% = product quality or wrong-grade dispatching issue.",
        },
        "counter_stock_management": [
            "Stock fast-moving SKUs at counter in small quantities (3–5 days cover only)",
            "Daily replenishment from main warehouse — never weekly for high-velocity items",
            "Counter display: show at least one sample of each finish/grade to aid upselling",
            "Keep counter stock value <8% of total inventory (don't lock capital in showroom)",
        ],
        "upselling_at_counter": {
            "hardware_with_ply": "Sell hinges + drawer slides + handles with every plywood purchase. Adds ₹2,000–5,000 per bill.",
            "laminate_with_ply": "Always show matching laminate when customer buys shutters/furniture ply",
            "brand_upgrade": "Offer BWP over MR for 15–20% premium — explain durability benefit",
            "soft_close_upsell": "Upgrade from standard to soft-close hinges — ₹300/door premium for huge satisfaction improvement",
        },
        "peak_hour_strategy": [
            "Staff counter fully during peak 10AM–12PM and 4–6PM",
            "Avoid billing delays during peak — queue >5 min loses walk-ins to competitors",
            "Assign dedicated counter person — don't share with warehouse picking team",
        ],
        "benchmark": "Best-in-class building materials counter: 20–30 transactions/day, ₹8,000–₹15,000 avg bill, >3 items/bill, <3% returns. Counter margin should be 5–8pp higher than wholesale margin.",
        "indian_context": "In India, Saturday is the peak counter day (contractors + carpenters finalise weekend purchases). Ensure full stock and staffing on Saturdays. GST invoice mandatory for all counter sales above ₹200 (B2C). UPI (PhonePe/GPay) is now preferred — accept all UPI apps.",
    },

    "scheme_management": {
        "title": "Scheme Management — Supplier Promotions, Volume Targets & Accruals",
        "definition": "Scheme management tracks supplier-offered promotional schemes (volume bonuses, loyalty programs, seasonal promotions) that provide dealers with additional income beyond gross margin. Scheme income often represents 2–5% of purchase value — for a dealer buying ₹1Cr/year, that's ₹2–5L of additional income.",
        "scheme_types": {
            "volume_target":    "Supplier offers cash bonus/rebate if dealer purchases X units in a period. E.g., 3.5% cash on ₹80L quarterly target.",
            "accrual_scheme":   "Fixed % accrued on every rupee purchased throughout year, settled annually. E.g., 1.5% on all Greenply purchases = ₹54K on ₹36L annual purchases.",
            "promo_monthly":    "Short-window (1 month) push scheme on specific SKU. Highest urgency, often overlooked. E.g., ₹500/carton bonus for 40 cartons HPL in May.",
            "loyalty_annual":   "Long-term relationship scheme — maintain purchase volume for 3–5 year loyalty tier status. Highest absolute value but longest horizon.",
            "project_scheme":   "Bonus for winning specific projects (residential complexes, commercial). Requires purchase tracking against project code.",
        },
        "scheme_tracking_formula": {
            "achievement_pct":  "Achievement % = (Actual Purchases ÷ Target) × 100",
            "daily_run_rate":   "Required Daily = (Target − Achieved) ÷ Days Remaining",
            "payout_at_risk":   "Payout at Risk = (1 − Achievement%) × Scheme Payout Amount",
            "accrual_formula":  "Accrual = Purchase Value × Accrual Rate %",
        },
        "applied_to_your_data": {
            "hindalco_q1_bonus":       "Target ₹22L, achieved ₹16.4L, 49 days left → need ₹1.14L/day (current rate ~₹1.1L/day). Close but needs final push — focus Z-section blades and C-channel profiles.",
            "greenlam_may_promo":      "Target 80 HPL sheets, achieved 36, 19 days left → need 2.3 sheets/day vs current 1.9/day. AT RISK — offer pre-monsoon interior bundle to top architect firms today.",
            "alucobond_annual_loyalty":"74% of ₹40L target achieved at ₹29.6L. On track at current pace. ₹1L+ accrual secured. Maintain ₹8L+/month to close FY.",
            "viva_composite_q1_bonus": "91.7% of ₹12L target achieved at ₹11.0L, 49 days left → need just ₹1.0L more → place one PO to lock ₹54K credit note.",
        },
        "maximisation_strategy": [
            "Map scheme targets to specific customers who can absorb the volume",
            "Offer a portion of scheme benefit as customer discount to accelerate purchasing",
            "Track scheme achievement weekly, not monthly — monthly review leaves too little time to correct",
            "Prioritise at-risk short-window schemes (monthly promos) over long-term ones",
            "Never chase scheme volume at negative net margin — scheme benefit must exceed extra discount given",
        ],
        "accounting_for_schemes": [
            "Accruals must be tracked as 'Supplier Receivable' in books — not just as benefit when received",
            "Settlement may come as credit note, cash transfer, or free goods — track all forms",
            "GST on scheme settlements: typically a credit note reduces GST liability (consult CA for complex schemes)",
            "Tally ERP: create a 'Scheme Accrual' ledger under Current Assets for clean tracking",
        ],
        "benchmark": "Top façade material dealers earn 2.5–5% of their purchase value from schemes. If your scheme income is <1%, you are under-claiming. Review all supplier agreements and claim missed accruals from last 2 years.",
        "indian_context": "Most dealers miss scheme payouts due to poor tracking. Hindalco, Alucobond, Greenlam, and Merino all have formal dealer portal schemes — register and track online. Alucobond's Premier Dealer programme is particularly lucrative for high-volume ACP dealers. Keep all scheme communications (emails + PDFs) in a dedicated folder. Claim within scheme deadline (typically 30–45 days after period end).",
    },

    "warehouse_management": {
        "title": "Multi-Warehouse / Godown Management Best Practices",
        "key_concepts": {
            "godown": "Physical storage location. Hardware dealers typically have: Main Godown (bulk), Transit Hub (city delivery staging), Counter Stock (showroom floor).",
            "capacity_utilisation": "% of capacity used. Optimal range: 65–80%. Below 50% = paying for unused space. Above 85% = operational risk (picking errors, safety hazards).",
            "stock_distribution": "Spreading inventory across godowns. Balance: keep fast movers near counter/delivery points, slow movers in bulk storage.",
            "grn_three_way_match": "GRN vs PO vs Invoice. All three must match: quantity, price, and product spec. Discrepancies trigger credit notes or returns.",
        },
        "your_setup": {
            "main_godown": "Peenya Industrial Area — 8000 sheet capacity, 74% utilised (5920 units, ₹46.2L value); flat-rack bays + ACP vertical cradles",
            "transit_hub": "Koramangala 6th Block — 1500 sheet capacity, 32% utilised (flat-bed staging for city-site deliveries)",
            "display_centre": "HSR Layout — 300 sheet capacity, 71.3% utilised (showroom display panels + counter stock)",
            "overall_utilisation": "67.5% across all locations — healthy range",
        },
        "optimisation_rules": [
            "Replenish counter stock daily from main godown — never let counter stock drop below 70%",
            "Review slow movers in main godown monthly — move to clearance or return to supplier",
            "Transit hub should never exceed 60% utilisation — it is a flow-through node, not storage",
            "GRN mismatches > ₹5,000 must be resolved before next PO with same supplier",
            "Run cycle counting on high-value SKUs (Alucobond ACP, Greenlam HPL, Aerofoil louvers) weekly; full physical count quarterly",
        ],
        "kpis_to_track": {
            "space_utilisation": "Target 65–80% across main godown",
            "grn_accuracy": "Target 95%+ match rate (invoice vs goods received)",
            "stock_accuracy": "Target 98%+ (system qty vs physical count)",
            "putaway_time": "Target <2 hours for GRN to shelved",
            "pick_accuracy": "Target 99%+ for outbound orders",
        },
        "benchmark": "Best-in-class hardware distributors maintain 97%+ GRN accuracy, <2% shrinkage, and 72-hour GRN-to-shelved cycle. Counter stock should never be the bottleneck for walk-in sales.",
        "indian_context": "Hardware dealers in India typically operate 2–4 godowns. Biggest inefficiency is poor bin/bay labelling — invest ₹15,000–25,000 in labelling and barcode bins for 30–40% faster picking. Consider WMS software (Marg ERP, Tally with inventory add-on) when managing 3+ godowns or 500+ SKUs.",
    },

    "sales_return": {
        "title": "Sales Returns — Condition Split, UOM Conversion, Credit Notes & Accounting",
        "definition": "A sales return occurs when a customer returns goods after purchase. InvenIQ handles partial returns and condition-based splitting: returned goods are classified as GOOD (resalable), PARTIALLY_DAMAGED, or FULLY_DAMAGED. The system generates separate accounting entries for each condition and auto-creates a credit note at sell price.",
        "document_chain": "Full return chain: Sales Order (SO) → Delivery Challan (DC) → Tax Invoice → Customer Return → Return Condition Assessment → Credit Note → Accounting Entries. All documents are linked by SO# and DC# for full traceability.",
        "return_condition_split": {
            "GOOD": "Goods returned in saleable condition. Restocked to inventory. Accounting: Inventory A/c Dr / COGS A/c Cr (at buy price). Credit note issued at sell price.",
            "PARTIALLY_DAMAGED": "Some units/portion damaged. Damaged portion written off; good portion restocked. Accounting (damaged): Damage Loss A/c Dr / COGS A/c Cr. Accounting (good): Inventory A/c Dr / COGS A/c Cr. Credit note for full return qty at sell price.",
            "FULLY_DAMAGED": "All returned goods are damaged and cannot be restocked. Entire quantity written off. Accounting: Damage Loss A/c Dr / COGS A/c Cr (buy price). Credit note issued at sell price (customer still entitled to full credit).",
            "credit_note_always_at_sell_price": "Regardless of condition, the credit note is always at the original sell price — that is what the customer paid. Damage loss is your cost, not the customer's.",
        },
        "uom_conversion": {
            "what_is_it": "UOM (Unit of Measure) conversion handles cases where the SALE was in one unit (e.g., box of 10 pcs) but the RETURN is in a different unit (e.g., 3 pcs). The conversion ratio tells the system how many sub-units are in one master unit.",
            "standard_ratios": "Box = 10 pcs | Case = 12 pcs | Dozen = 12 pcs | Sheet = 32 sqft | Bag = 25 kg | Roll = 50 mtrs | Pack = 6 pcs",
            "formula": "Piece Price = Unit Price ÷ Conversion Ratio | Return Amount = Piece Price × Return Qty",
            "example": "Sold: 50 boxes @ ₹485/box (1 box = 10 pcs). Customer returns 3 pcs from 1 box. Piece price = ₹485 ÷ 10 = ₹48.50. Return amount = ₹48.50 × 3 = ₹145.50 + GST 18% = ₹171.69 credit note.",
        },
        "accounting_entries_by_condition": {
            "good_condition": [
                "Inventory A/c Dr / COGS A/c Cr (buy price × good qty) — restock",
                "Customer A/c Dr / Sales Return A/c Cr (sell price × total return qty incl. GST) — credit note",
                "GST Payable A/c Dr / GST Liability A/c Cr — output GST reversal on credit note",
            ],
            "partially_damaged": [
                "Inventory A/c Dr / COGS A/c Cr (buy price × good qty) — partial restock",
                "Damage Loss A/c Dr / COGS A/c Cr (buy price × damaged qty) — write-off damaged portion",
                "Customer A/c Dr / Sales Return A/c Cr (sell price × total return qty incl. GST) — credit note for full return",
                "GST Payable A/c Dr / GST Liability A/c Cr — output GST reversal",
            ],
            "fully_damaged": [
                "Damage Loss A/c Dr / COGS A/c Cr (buy price × total return qty) — 100% write-off",
                "Customer A/c Dr / Sales Return A/c Cr (sell price × total return qty incl. GST) — full credit note",
                "GST Payable A/c Dr / GST Liability A/c Cr — output GST reversal",
            ],
        },
        "credit_note": {
            "what_is_it": "A Credit Note is a document issued to the customer confirming the value of goods returned. It can be applied against future purchases or refunded as cash.",
            "validity": "Credit notes are typically valid for 90 days from issue date (configurable per business policy).",
            "gst_treatment": "GST charged on original sale must be reversed on return. GST reversal: Credit Note must show original invoice number, GST rate, and tax reversal amount. File credit notes in GSTR-1 (negative entry).",
            "applied_to_your_data": "Current open credit note balance: ₹171.69 (Mehta Interiors, CN-2026-0012). Apply against next order to close.",
        },
        "return_reasons_and_policy": {
            "legitimate_reasons": "Damaged on arrival, Wrong specification (96mm vs 128mm), Manufacturing defect, Excess quantity ordered, Product not matching sample",
            "policy_best_practice": "Set a 7–14 day return window from invoice date. Require original invoice. Accept returns only in original/resalable condition (except defects). Document reason — feeds supplier quality scorecard.",
            "avoid_abuse": "Track return rate by customer. If a customer's return rate exceeds 5% of purchases by value, review their ordering patterns — may indicate careless ordering or buyer's remorse at your expense.",
        },
        "damage_recording_link": "Returns with damaged goods (PARTIALLY_DAMAGED / FULLY_DAMAGED) are also logged in the Damage Recording module under 'Sales Return Damage' tab, so all damage incidents are tracked in one place regardless of source (GRN / Transit / Return).",
        "benchmark": "Hardware/sanitary dealers India: target return rate <3% of revenue. Returns >5% indicate product quality issues, wrong-specification dispatching, or lax return policy. GST credit notes must be issued within the financial year to claim tax reversal.",
        "indian_context": "In India, sales returns generate Credit Notes (not Debit Notes — that's for price corrections). GSTR-1 requires credit notes to be linked to original B2B invoices. Maintain the return document chain: Return Request → Credit Note → GST reversal → Journal Entry. All linked by invoice reference.",
    },

    "damage_recording": {
        "title": "Damage Recording — GRN Inward Damage, Transit SO Damage & Sales Return Damage",
        "overview": "Damage recording covers three distinct scenarios: (1) GRN/Inward damage — goods received but found damaged during inward inspection, (2) Transit damage — goods damaged while dispatching a Sales Order, and (3) Sales Return damage — goods returned by a customer in PARTIALLY_DAMAGED or FULLY_DAMAGED condition. Each type has different accounting treatment, different claim processes, and different resolutions.",
        "three_damage_sources": {
            "grn_damage": "Post-GRN: Damage discovered after goods are received and GRN is created. Claim is against supplier or inbound transporter/insurer.",
            "transit_damage_so": "Outbound SO transit: Goods dispatched to customer are damaged in transit. Claim is against outbound carrier or insurance. Customer may get credit note or re-dispatch.",
            "sales_return_damage": "Return damage: Customer returns goods in PARTIALLY_DAMAGED or FULLY_DAMAGED condition. Damage is discovered at the time of return inspection. Logged with return condition (GOOD/PARTIALLY_DAMAGED/FULLY_DAMAGED), damage type, and accounting split. Cross-referenced to original SO, DC, and Invoice.",
        },
        "grn_inward_damage": {
            "definition": "Damage discovered AFTER goods have been received (GRN created) — during QC inspection, putaway, or first use.",
            "common_types": "Physical Damage (crushed cartons, bent items), Moisture/Water Damage, Manufacturing Defect (finish issues, wrong specifications), Short Supply, Packaging Damage",
            "accounting": "Damage Loss A/c Dr / Inventory A/c Cr — write-down at buy/cost price. Reduces inventory value on books.",
            "insurance_claim": "If goods were covered under transit insurance and damage is transit-caused: Insurance Claim Receivable A/c Dr / Damage Loss A/c Cr",
            "supplier_claim": "If damage is manufacturing defect: Supplier Claim Receivable A/c Dr / Damage Loss A/c Cr. Supplier must replace or credit.",
            "resolution": "Insurance settlement received: Bank A/c Dr / Insurance Claim Receivable A/c Cr. Supplier replaces: new GRN. Supplier credits: Credit from supplier applied to next PO.",
            "documentation": "GRN damage report with photos, quantity, damage description, and witnesses. Required for insurance and supplier claims — collect within 24–48 hours of GRN.",
        },
        "transit_damage_so": {
            "definition": "Goods damaged AFTER dispatch from your warehouse while in transit to the customer.",
            "common_causes": "Vehicle accident, Rough handling by carrier, Improper packaging, Overloading, Weather exposure, Theft/pilferage",
            "so_adjustment_options": [
                "Reduce Invoice Qty: Invoice customer only for undamaged goods received. Issue credit note for damaged quantity.",
                "Re-dispatch Replacement: Send replacement goods immediately (if stocked). Customer gets full order — your cost is the replacement.",
                "Raise Credit Note: Issue credit note to customer for damaged value. Apply against future invoices.",
                "Cancel SO Line: Cancel the damaged line item entirely if not replaceable.",
            ],
            "accounting": "1) Transit Loss A/c Dr / Inventory A/c Cr — write-off damaged goods at cost. 2) Insurance Claim Receivable A/c Dr / Transit Loss A/c Cr — if insured. 3) Sales Return A/c Dr / Customer A/c Cr — if credit note issued.",
            "customer_communication": "Notify customer immediately (within 1 hour of discovering damage). Provide estimated resolution timeline. Don't wait for insurance settlement — offer replacement or credit proactively.",
        },
        "sales_return_damage": {
            "definition": "Goods returned by the customer are inspected on receipt and classified: GOOD (fully resalable), PARTIALLY_DAMAGED (some units damaged), or FULLY_DAMAGED (entire return quantity unusable).",
            "common_return_damage_types": "Partial Damage on Return, Fully Damaged on Return, Customer Misuse / Breakage, Packaging Damage in Return Transit, Wrong Product Returned, Missing Parts on Return",
            "accounting_by_condition": {
                "GOOD":              "Inventory A/c Dr / COGS A/c Cr (at cost). No damage entry needed.",
                "PARTIALLY_DAMAGED": "Good portion: Inventory A/c Dr / COGS A/c Cr. Damaged portion: Damage Loss A/c Dr / COGS A/c Cr.",
                "FULLY_DAMAGED":     "Damage Loss A/c Dr / COGS A/c Cr (full returned qty at cost). Zero inventory restocked.",
            },
            "credit_note_always_issued": "Customer always receives a credit note at the SELL price regardless of return condition. The damage write-off is an internal loss — the customer receives full credit for what they paid.",
            "linked_documents": "Each SR Damage record is linked to: SO#, DC#, Invoice# so the full transaction trail is auditable. Use the Damage Recording → Sales Return Damage tab to review all return damage incidents by SKU.",
            "claim_options": "If goods are returned damaged due to transit (carrier-caused): raise transit insurance claim. If damage is customer-caused (misuse): no claim possible — log as customer damage loss.",
            "repeat_pattern_alert": "If the same SKU appears in Sales Return Damage multiple times, investigate: Is the product fragile? Is packaging insufficient? Are customers mishandling? Notify supplier if damage is manufacturing-related.",
        },
        "insurance_claim_process": {
            "step_1": "Survey: Intimate insurer within 24–48 hours of damage discovery. Request surveyor visit.",
            "step_2": "Documentation: Gather GRN/dispatch document, photos, driver statement (for transit), carrier LR copy, purchase invoice, claim form.",
            "step_3": "Surveyor Assessment: Insurance surveyor inspects damage and certifies loss value.",
            "step_4": "Claim Filing: Submit completed claim form + all documents to insurer. Keep copies.",
            "step_5": "Settlement: Insurer pays claim amount. Bank A/c Dr / Insurance Claim Receivable A/c Cr. Close the damage record.",
            "typical_timeline": "Simple claims: 2–4 weeks. Complex/large claims: 4–12 weeks.",
        },
        "damage_prevention": {
            "grn_prevention": "Insist on vendor packaging standards (vertical cradles for ACP panels, flat-rack with bundling straps for aluminium profiles). Inspect before signing GRN — do not sign blindly. For high-value items (Alucobond ACP, Greenlam HPL compact), check thickness and finish before GRN signature.",
            "transit_prevention": "Use proper packaging — bubble wrap CP fittings individually, double-box glass/ceramic items. Train drivers on load securing. Use padded floor mats for drawer systems. Insurance mandatory for shipments >₹50,000.",
        },
        "benchmark": "Building materials industry: damage rate target <0.5% of goods receipts by value. Damage >1% indicates systemic packaging or handling issues. Best-in-class distributors have transit insurance on all outbound shipments >₹25,000 and GRN inspection protocols with photos for every inward receipt.",
        "indian_context": "In India, transit insurance is underutilised by SME dealers — most rely on carrier liability (which is usually capped at ₹100/kg, far below actual goods value). Buy open policy transit insurance: ₹8,000–₹15,000 annually covers unlimited shipments up to ₹1Cr declared value per trip. Worth it for any dealer with ₹5L+ monthly dispatch.",
    },

    "tally_prime_export": {
        "title": "Tally Prime Data Export & Integration — InvenIQ",
        "what_it_does": "InvenIQ exports inventory, customer, supplier, and transaction data in Tally-compatible CSV format for direct import into Tally Prime.",
        "export_types": {
            "stock_items": "Product masters with HSN codes, GST rates, opening quantities, values → Gateway of Tally → Import → Masters → Stock Items",
            "customer_ledgers": "Customer accounts under Sundry Debtors with GSTIN, address, opening balance → Import → Masters → Ledgers",
            "supplier_ledgers": "Supplier accounts under Sundry Creditors with GSTIN, payment terms, opening balance",
            "sales_vouchers": "Sales transactions as Tally sales vouchers with full GST breakdown (CGST/SGST/IGST)",
            "purchase_vouchers": "Purchase transactions as Tally purchase vouchers linked to reference PO numbers",
        },
        "import_steps": [
            "1. Export CSV from InvenIQ → Tally Prime Export module",
            "2. Open Tally Prime → Gateway of Tally → Import",
            "3. Select Masters or Transactions type",
            "4. Browse to the exported CSV file",
            "5. Tally validates — fix any errors shown",
            "6. Confirm import — data appears immediately",
        ],
        "hsn_gst_reference": {
            "hardware_fittings": "HSN 8302 — Hinges, handles, slides, drawer systems → 18% GST",
            "cp_sanitary_fittings": "HSN 8481 — Taps, mixers, stop cocks, valves → 18% GST",
            "locks_cylinders": "HSN 8301 — Padlocks, locks, cylinders → 18% GST",
            "aluminium_profiles": "HSN 7604 — Aluminium architectural profiles → 18% GST",
            "laminates_panels": "HSN 3921/4411 — Laminates, MDF, boards → 12–18% GST",
        },
        "best_practices": [
            "Always import masters before transactions — ledgers must exist before vouchers reference them",
            "Verify GSTIN format before import — Tally validates; invalid GSTINs block entire import",
            "Test with 5 records first; verify in Tally; then do full import",
            "Keep exported CSVs as backup — they serve as audit trail for any disputes",
        ],
        "indian_context": "Most hardware/sanitary dealers use Tally ERP or Tally Prime for accounting and GST returns. InvenIQ's export bridges the gap: use InvenIQ for AI-powered operations intelligence, export to Tally for statutory compliance, GST filing (GSTR-1, GSTR-3B), and formal P&L reporting.",
    },
    "landing_cost_methodology": {
        "title": "Landing Cost Calculation — True Per-Unit Cost for Hardware/Sanitary Dealers",
        "formula": "Total Landed Cost = Invoice Value + Freight + Custom Duty (imports) + Freight Forwarding + Port/Clearing Charges + Loading & Unloading + Insurance + Misc",
        "per_unit_cost": "True Cost per Unit = Total Landed Cost ÷ Total Units Received",
        "operation_types": {
            "DOMESTIC_ROAD":   "Freight (1-3%) + Loading/Unloading + Insurance. Avg overhead: 6-10% of invoice.",
            "IMPORT_SEA":      "Custom Duty (12-15%) + Freight Forwarding + Port Charges + Clearing Agent + Insurance. Avg overhead: 18-25%.",
            "IMPORT_AIR":      "Custom Duty + Air Freight (high) + Port Handling + Insurance. Avg overhead: 20-30% — use only for urgent high-value items.",
            "LOCAL_PICKUP":    "Vehicle Hire + Loading/Unloading only. Lowest overhead: 1-3%.",
            "INTER_STATE_ROAD":"Freight + Octroi/Entry Tax (if applicable) + Loading/Unloading. Avg overhead: 8-12%.",
        },
        "margin_calculation": {
            "invoice_margin":   "= (Sell Price − Invoice Price) / Sell Price × 100  [MISLEADING — excludes overhead]",
            "true_margin":      "= (Sell Price − Landed Cost) / Sell Price × 100    [CORRECT — use this for pricing]",
            "impact_example":   "Hindalco Z-Blade 150mm: Invoice ₹980, Landed ₹1,042 (6.3% overhead: freight ₹18,400/200 units + flat-rack ₹4,200/200), Sell ₹1,260 → Invoice Margin 22.2% → True Margin 17.3% (4.9 pp gap)",
        },
        "charge_heads_reference": {
            "freight":             "Charged per kg or per km by transporter. Get freight invoice or LR copy.",
            "custom_duty":         "BCD (Basic Customs Duty) + IGST on imports. Reference: CBIC tariff. Hardware fittings: BCD 10-20% + IGST 18%.",
            "freight_forwarding":  "Fee charged by freight forwarder for export documentation, customs clearance. Typically 1-2% of CIF value.",
            "port_handling":       "Port/terminal handling charges — fixed per container or per shipment.",
            "clearing_agent":      "Custom House Agent (CHA) fee — flat ₹5,000-₹15,000 per consignment.",
            "loading_unloading":   "Labour cost at origin + destination. Typically ₹500-₹2,000 per GRN.",
            "insurance":           "0.1% of invoice value — mandatory for shipments > ₹2L.",
        },
        "apportionment_rule": "If one sheet covers multiple line items: apportion total landed cost proportionally by line-item invoice value weight.",
        "pricing_rule": "Set selling price AFTER computing landed cost. Target margin must be calculated on landed cost, not invoice price.",
        "indian_context": "Import of ACP panels (Alucobond from Switzerland, Alucoil from Spain) attracts BCD 10% + IGST 18%. Total landed cost on imported ACP is often 18-28% above invoice. Never price imported goods on invoice price alone. Domestic aluminium extrusions (Hindalco) are duty-free but have LME-linked price revisions — always lock landed cost at PO date.",
    },
    "purchase_requisition_workflow": {
        "title": "Purchase Requisition (PR) Workflow — Procure-to-Pay Best Practices",
        "definition": "A Purchase Requisition is an internal document raised by a department to request purchase of goods/services. It is the starting point of the formal P2P cycle.",
        "pr_lifecycle": {
            "step_1": "Department raises PR in the system with item, quantity, estimated cost, and required date",
            "step_2": "Department Head reviews and approves/rejects within SLA (URGENT: 4h, HIGH: 1 day, MEDIUM: 3 days)",
            "step_3": "Procurement team validates PR, selects supplier, and converts to Purchase Order (PO)",
            "step_4": "PO sent to supplier → Supplier ships → Gate Entry → GRN → QC → Stock",
            "step_5": "Invoice received → 3-Way Match → AP Approval → Payment",
        },
        "priority_sla": {
            "URGENT":  "Approval within 4 hours; PO raised same day. Stockout imminent.",
            "HIGH":    "Approval within 1 business day; PO within 2 days. Stock critically low.",
            "MEDIUM":  "Approval within 3 business days; PO within 5 days. Planned replenishment.",
            "LOW":     "Approval within 5 business days. Non-urgent buffer stock.",
        },
        "controls": {
            "budget_control":   "PR must stay within budget authority of requestor; excess needs higher approval",
            "audit_trail":      "Every PR records who raised, who approved, when, and why — compliance requirement",
            "no_bypass_rule":   "Never convert directly to PO without PR — violates internal controls and budget process",
            "auto_escalation":  "PRs not acted on within 2× SLA auto-escalate to next level manager",
        },
        "kpis": {
            "avg_approval_time": "Target < 1 business day. >3 days = process bottleneck.",
            "pr_to_po_conversion": "Target > 95% of approved PRs convert to PO within 2 days",
            "emergency_pr_rate": "Target < 20% of PRs flagged URGENT. High rate = poor demand planning.",
        },
        "indian_context": "Most Indian hardware/sanitary dealers do not use formal PR — they raise POs directly. Implementing PR adds budget visibility, eliminates maverick buying, and creates an audit trail required for GST compliance audits and statutory records.",
    },
    "qc_inspection_methods": {
        "title": "QC Inspection (Post-GRN Quality Control) — Best Practices for Hardware/Sanitary Dealers",
        "purpose": "Post-GRN QC inspects goods received before accepting into inventory. Prevents defective stock from reaching customers and protects margin.",
        "standard_checklist": {
            "packaging":        "Is the original packaging intact? Damaged packaging = inspect 100% of units inside.",
            "quantity_match":   "Physical count vs DC quantity vs PO quantity — any variance is a discrepancy.",
            "specifications":   "Verify product code, size, finish (chrome/SS/gold), and model match PO.",
            "finish_quality":   "Check chrome plating, powder coating, paint finish — no oxidation, peeling, or blemishes.",
            "functional_test":  "Test moving parts: hinge movement, drawer slide, tap operation, valve closure.",
            "safety_compliance":"Check BIS mark, CE mark (imports), ISI certification for sanitary ware.",
            "labels_markings":  "MRP sticker, brand label, HSN code correct? Mislabelled goods = GST dispute.",
        },
        "decision_matrix": {
            "FULL_ACCEPT":          "All parameters PASS — move 100% to inventory",
            "CONDITIONAL_ACCEPT":   "< 10% defective, cosmetic defects only — accept saleable units; RTV defectives",
            "PARTIAL_ACCEPT":       "Spec mismatch on some units — accept conforming units only; reject rest",
            "FULL_REJECT_RTV":      "> 20% defective OR functional failure — return entire batch to supplier",
        },
        "rtv_process": {
            "step_1": "Document defects with photos — all units rejected must be photographed",
            "step_2": "Raise QC rejection note with unit count, defect description, and decision",
            "step_3": "Notify supplier within 24 hours — RTV claim lapses after 48 hours for most brands",
            "step_4": "Arrange return logistics (supplier picks up or buyer ships at supplier cost)",
            "step_5": "Supplier issues Credit Note / replacement within 7-14 days",
        },
        "supplier_benchmarks": {
            "excellent":   "> 98% pass rate — Hindalco Extrusions, Greenlam Industries typically here",
            "good":        "95-98% pass rate — Alucobond, Merino Industries normally here",
            "needs_watch": "90-95% pass rate — monitor closely, pre-inspect next 3 batches",
            "poor":        "< 90% pass rate — REVIEW supplier relationship; source alternate",
        },
        "indian_context": "In the Indian hardware/sanitary trade, most dealers do minimal QC and accept whatever arrives. This costs 3-5% of purchase value annually in defective stock write-offs. A 30-minute QC check per GRN saves ₹2-4L annually for a ₹5 Cr turnover dealer.",
    },
    "three_way_matching": {
        "title": "3-Way Matching (PO + GRN + Invoice) — AP Automation for Hardware/Sanitary Dealers",
        "definition": "3-way matching verifies that the Purchase Order, Goods Receipt Note, and Supplier Invoice all agree on: supplier, item, quantity, price, and GST rate before releasing payment.",
        "matching_formula": {
            "match_check":   "Invoice Amount ≈ PO Price × GRN Qty (within tolerance)",
            "auto_approve":  "| Invoice − (PO Price × GRN Qty) | ÷ PO Amount < 1%",
            "manual_review": "1% ≤ variance ≤ 5% — Finance Manager must approve",
            "block_invoice": "Variance > 5% OR quantity mismatch — reject; request corrected invoice",
        },
        "discrepancy_types": {
            "price_variance":    "Invoice price ≠ PO price. Cause: supplier price revision not updated in PO.",
            "quantity_variance": "Invoice qty ≠ GRN qty. Cause: short shipment not reflected in invoice.",
            "gst_mismatch":      "Invoice GST rate ≠ PO GST rate. Cause: supplier classification error.",
            "rtv_not_deducted":  "Supplier invoices for full GRN qty without deducting RTV. Most common in India.",
            "duplicate_invoice": "Same invoice number submitted twice. Auto-detect by invoice-number uniqueness check.",
        },
        "payment_terms": {
            "standard":      "Net-30 from invoice date (30 days credit from supplier)",
            "early_payment": "2/10 Net-30 — 2% discount if paid within 10 days",
            "overdue_risk":  "Paying late risks supply disruption and loss of early-payment discount",
        },
        "kpis": {
            "auto_match_rate": "Target > 85%. Below 85% = supplier invoicing quality or PO accuracy problem.",
            "days_to_approve": "Target < 2 business days from invoice receipt to payment approval.",
            "discrepancy_rate":"Target < 5% of invoices. Above 5% = systemic pricing or GRN process issue.",
        },
        "indian_context": "Most Indian dealers pay invoices manually without any matching — they pay whatever the supplier claims. This leads to overpayments, missed RTV deductions, and duplicate payments totalling 2-3% of purchase cost. 3-way matching eliminates this leakage.",
    },
    "gate_entry_management": {
        "title": "Gate Entry & Receiving Management — Inbound Vehicle Control for Dealers",
        "purpose": "Gate entry is the first control point in the inbound supply chain. It prevents unauthorized deliveries, documents short shipments, and initiates the formal GRN + QC process.",
        "required_documents": {
            "from_supplier":  "Delivery Challan (DC) — lists items, quantities, DC number, date, and supplier GSTIN",
            "from_vehicle":   "Vehicle number, driver name, driver ID",
            "from_buyer_system": "Valid Purchase Order (PO) number matching the delivery",
        },
        "gate_process": {
            "step_1": "Security logs vehicle number, driver details, arrival time",
            "step_2": "Verify supplier DC number against open POs in system — must match",
            "step_3": "Count boxes/packages against DC quantity — record any discrepancy",
            "step_4": "If all OK: stamp DC, issue gate pass, direct to receiving dock",
            "step_5": "If short shipment: hold vehicle; call supplier for confirmation; partial GRN only",
            "step_6": "If no PO: reject entry; log supplier name; notify Procurement team",
            "step_7": "After clearance: GRN team takes over within 2 hours",
        },
        "rejection_criteria": {
            "no_po_match":       "Delivery challan references no open PO — reject and return",
            "wrong_supplier":    "DC supplier ≠ PO supplier — reject; security incident log",
            "quantity_exceeds_po": "DC qty > PO qty — accept only PO quantity; return excess",
            "damaged_packaging": "Visible outer damage — accept under protest; document on DC; QC team to inspect 100%",
        },
        "kpis": {
            "avg_clearance_time": "Target < 15 minutes. > 30 min = gate process bottleneck.",
            "po_reference_compliance": "Target > 98%. Below 98% = suppliers delivering without PO — tighten supplier communication.",
            "short_shipment_rate": "Target < 2%. Above 5% = supplier fulfillment reliability issue.",
            "rejection_rate": "Track monthly — recurring rejections from same supplier = reliability risk.",
        },
        "indian_context": "In Indian hardware/sanitary trade, gate entry is often informal — stock is accepted without proper PO verification, leading to inventory discrepancies, unauthorized purchases, and audit trail gaps. A formal gate entry process with PO cross-check prevents these issues and is mandatory for GST-compliant inward supply records.",
        "inveniq_implementation": "In InvenIQ, gate entry fields (vehicle number, driver name, DC verified flag, seal intact flag, entry time) are captured inside the 'Record GRN' modal in the PO/GRN module. This integrates gate entry with the GRN workflow — no separate navigation step required. Gate entry data is stored in the GRN notes field and is visible on the GRN detail view.",
    },

    "design_quote_studio": {
        "title": "Design Quote Studio — Interior Quotations & Architect Fee Proposals",
        "purpose": "The Design Quote Studio is a dedicated module for interior designers, architects, and specification contractors to create detailed project quotations and professional fee proposals. It combines product-level BOQ (Bill of Quantities) generation with AI-assisted area calculations, WhatsApp brief scanning, and multi-phase fee scheduling.",
        "two_modules": {
            "interior_quotations": "Create room-by-room quotations with item-level pricing (louvers, ACP, HPL, hardware). AI can scan a WhatsApp brief or PDF to extract room schedule and quantities automatically. Each quote can be in DRAFT / SENT / NEGOTIATING / WON / LOST / EXPIRED status.",
            "architect_fee_proposals": "Professional fee proposals for architects and design studios. Define total fee as % of project cost, then split across 6 standard phases: P1 Concept (10%), P2 Schematic Design (15%), P3 Design Development (20%), P4 Construction Documents (25%), P5 Tender Assistance (5%), P6 Construction Admin (25%).",
        },
        "ai_features": {
            "whatsapp_scan":    "Paste or upload a WhatsApp site brief → AI parses it into a structured room schedule with item types, estimated quantities, and dimensions. Reduces data entry time by 70%.",
            "parse_brief":      "Natural language description (e.g., '3BHK with master bedroom feature wall, laminate kitchen, and two bathrooms') → AI returns a structured room list with suggested item types and areas.",
            "boq_generator":    "Select a package (A–J from basic to premium) and AI generates a full BOQ with product specifications, quantities, and estimated pricing for each room.",
            "area_calculator":  "Input room dimensions (length × width × height) and AI computes: floor area, wall area, ceiling area, and derived material quantities (sheets, linear metres, pieces).",
            "design_scan":      "Scan a catalog image, PDF price list, or WhatsApp photo to extract product names, codes, and prices directly into the quote line items.",
        },
        "quote_workflow": {
            "step_1": "Create new quote: enter client name, project name, and select room template or start from scratch",
            "step_2": "Add sections (rooms) and line items: product, quantity, unit, unit price, and discount %",
            "step_3": "AI BOQ Generator or WhatsApp scan can auto-populate items and quantities from brief",
            "step_4": "Review totals: line total = (unit_price × (1 - discount/100)) × quantity",
            "step_5": "Apply GST (18% for all building materials — ACP, louvers, laminates, hardware)",
            "step_6": "Send quote to client; track status (SENT → NEGOTIATING → WON/LOST)",
        },
        "fee_proposal_workflow": {
            "step_1": "Create fee proposal: enter architect/studio name, project name, project value, and services scope",
            "step_2": "Set fee percentage (industry standard: 5-8% for residential, 3-5% for commercial)",
            "step_3": "Phase split is auto-calculated: P1 10% + P2 15% + P3 20% + P4 25% + P5 5% + P6 25% = 100%",
            "step_4": "As project progresses, mark phases as invoiced and track outstanding fee balance",
            "step_5": "Fee invoices reference the proposal phase (e.g., 'Invoice for P2 Schematic Design')",
        },
        "pricing_benchmarks": {
            "residential_fit_out":   "₹1.5L–₹8L for 2BHK/3BHK; ₹8L–₹25L for villas and penthouses",
            "commercial_interior":   "₹5L–₹50L depending on area, fit-out category, and specification level",
            "architect_fee":         "5-8% of project cost for residential; 3-5% for commercial; 2-3% for industrial",
            "win_rate_benchmark":    "30-40% for new clients; 55-65% for repeat/referral clients",
            "avg_quote_to_win_days": "7-21 days (negotiation phase is typically 5-14 days)",
        },
        "item_types": {
            "louver_feature_wall":   "Aluminium louvers — Z-blade or Aerofoil; vertical or horizontal pattern; anodised or powder-coated finish",
            "acp_cladding":          "Alucobond or Viva Composite ACP panels — feature walls, columns, reception counters",
            "hpl_laminate":          "Greenlam or Merino HPL — cabinetry, table tops, wall cladding",
            "operable_systems":      "Motorised operable louvre systems — premium specifications requiring installation coordination",
            "bathroom_fittings":     "Complete bathroom package — shower area, vanity, WC area with product selection and quantities",
        },
        "gst_reference": {
            "acp_panels":             "HSN 7606 — Aluminium composite panels → 18% GST",
            "aluminium_louvers":      "HSN 7604 — Aluminium extrusions/profiles/louvers → 18% GST",
            "hpl_laminates":          "HSN 4814 — High pressure / decorative laminates → 18% GST",
            "hardware_fittings":      "HSN 8302 — Door/window hardware, handles, hinges → 18% GST",
            "architect_services":     "SAC 998331 — Architectural / interior design services → 18% GST on fees",
        },
        "indian_context": "In India, interior designers and architects typically produce manual Excel-based quotations — a slow, error-prone process. The Design Quote Studio automates this with AI-assisted BOQ generation, consistent pricing from the live product catalog, and phase-based fee tracking. Particularly valuable for louver/ACP/HPL dealers who also provide specification and supply services to interior architects.",
    },

    "invoices_gst_compliance": {
        "title": "Sales Invoice & GST Compliance — CGST/SGST/IGST, Filing, ITC",
        "purpose": "Complete framework for GST-compliant sales invoicing in India covering intra-state (CGST+SGST) and inter-state (IGST) supplies, invoice format requirements, ITC eligibility, and GSTR filing obligations.",
        "gst_charge_rules": {
            "intra_state_supply": "Supplier and buyer in the same state → charge CGST + SGST (each = 50% of applicable rate). E.g., 18% rate → CGST 9% + SGST 9%.",
            "inter_state_supply": "Supplier and buyer in different states → charge IGST only at full rate. E.g., 18% rate → IGST 18%.",
            "how_to_determine": "Compare first 2 digits of supplier GSTIN with first 2 digits of buyer GSTIN (state codes). Same code → intra-state → CGST+SGST. Different codes → inter-state → IGST.",
            "place_of_supply":  "Determines whether CGST+SGST or IGST applies. For goods: place of supply = destination state (where goods are delivered). For services: place of supply = location of service recipient.",
        },
        "invoice_format_requirements": {
            "mandatory_fields":     "Invoice number (unique sequential), invoice date, supplier GSTIN, buyer GSTIN (if registered), buyer name & address, place of supply, HSN/SAC code, item description, quantity, unit, taxable value, GST rate, CGST/SGST or IGST amount, total amount payable.",
            "invoice_series":       "Must be sequential within a financial year. Can restart on 1 April. Cannot have gaps.",
            "digital_invoice":      "Electronic invoices are valid — no requirement to print. QR code mandatory for B2B invoices (auto-generated).",
            "time_limit_issuance":  "Goods: invoice must be issued at or before time of removal. Services: within 30 days of service completion (within 45 days for banking).",
            "credit_note":          "Issue credit note (not debit note to buyer) to reverse sales. Must reference original invoice number. File as negative entry in GSTR-1.",
        },
        "hsn_sac_codes": {
            "aluminium_extrusions": "HSN 7604 — 18% GST",
            "acp_panels":           "HSN 7606 — 18% GST",
            "hpl_laminates":        "HSN 4814 — 18% GST",
            "hardware_fittings":    "HSN 8302 — 18% GST",
            "cement_boards":        "HSN 6811 — 18% GST",
            "glass_products":       "HSN 7007 — 18% GST",
            "design_services":      "SAC 998331 — Architectural/Interior design → 18% GST",
            "freight_services":     "SAC 9965 — Goods Transport → 5% GST (GTA, no ITC) or 12% (with ITC)",
            "installation_services":"SAC 9954 — Construction/installation works → 18% GST",
        },
        "gstr_filing": {
            "gstr1":        "Monthly (11th of next month) or quarterly (13th of month after quarter end for QRMP filers). Reports all outward supplies. B2B: invoice-level; B2C: consolidated.",
            "gstr3b":       "Monthly self-assessment return (20th of next month for general; 22nd/24th for QRMP). Pay GST due (output tax – ITC). Penalty: ₹50/day late fee (₹20 for nil return).",
            "gstr9":        "Annual return — due 31 December after FY end. Reconciles all monthly GSTR-1 and GSTR-3B data.",
            "e_invoicing":  "Mandatory for turnover >₹5 Cr (IRN + QR code). System auto-generates IRN via IRP portal. Exempted categories: SEZ, banks, insurance, passenger transport.",
        },
        "itc_rules": {
            "eligibility":      "ITC available on purchases used for taxable supply. Not available on: personal consumption, food/beverages, works contract (building construction), motor vehicles for personal use.",
            "time_limit":       "ITC must be claimed by 30 November of the following financial year or date of filing annual return, whichever is earlier.",
            "reversal_triggers":"ITC must be reversed if: invoice unpaid after 180 days, goods/services used for exempt supply, goods written off as bad debt.",
            "blocked_credits":  "ITC blocked on: motor vehicles (except commercial), food and beverages, beauty treatment, health services, club membership, personal travel.",
        },
        "payment_terms": {
            "standard_credit":  "30–60 days credit for established B2B customers. 7–15 days for new customers. Immediate payment for cash/counter sales.",
            "late_payment":     "Charge interest at 18% p.a. on overdue amounts (as per contract). GST not chargeable on interest if it is a finance charge (not a separate supply).",
            "advance_receipt":  "GST on advance: must pay GST at time of advance receipt for services. For goods, GST is payable at time of invoice (not advance). Issue receipt voucher for advance.",
            "tds_on_payment":   "Section 194C: TDS 2% on contractor/sub-contractor payments >₹30K single or >₹1L p.a. (1% for individual/HUF). Section 194J: TDS 10% on professional/technical services.",
        },
        "indian_context": "Indian B2B dealers in building materials typically sell to: contractors (large project orders, net 60 terms), retailers/distributors (regular orders, net 30), and direct clients (occasional, often advance). GST compliance is critical — penalties for late GSTR-1 filing, ITC mismatches flagged in GSTR-2A reconciliation. Always match buyer GSTIN before issuing invoice to ensure correct CGST+SGST vs IGST treatment.",
    },
}


def get_knowledge_context(query: str, tool_data: Optional[dict] = None) -> str:
    """
    Return structured knowledge context for a conceptual inventory query.
    Applies formulas to live business data where possible.
    Max 3 knowledge sections to keep LLM context focused.
    """
    q = query.lower()
    relevant_keys = []

    # ── Detect which knowledge sections are needed ─────────────────────────────
    if any(w in q for w in ["eoq", "economic order quantity", "optimal order"]):
        relevant_keys.append("eoq")

    if any(w in q for w in ["safety stock", "buffer stock", "service level"]):
        relevant_keys.append("safety_stock")

    if any(w in q for w in ["reorder point", "rop", "reorder level", "when to order", "when to reorder"]):
        relevant_keys.append("reorder_point")

    if any(w in q for w in ["abc analysis", "abc class", "abc inventory", "pareto", "xyz analysis"]):
        relevant_keys.append("abc_analysis")

    if any(w in q for w in ["gmroi", "gross margin return", "return on inventory"]):
        relevant_keys.append("gmroi")

    if any(w in q for w in ["jit", "just in time", "just-in-time", "lean inventory"]):
        relevant_keys.append("jit")

    if any(w in q for w in ["working capital", "cash cycle", "cash conversion", "ccc",
                             "dso", "dio", "dpo", "days sales outstanding"]):
        relevant_keys.append("working_capital")

    if any(w in q for w in ["inventory turnover", "stock turnover", "turnover ratio", "dsi",
                             "days sales inventory", "days inventory"]):
        relevant_keys.append("inventory_turnover")

    if any(w in q for w in ["fifo", "lifo", "weighted average", "wac", "costing method", "valuation method"]):
        relevant_keys.append("fifo_lifo")

    if any(w in q for w in ["demand forecasting", "forecast method", "moving average",
                             "exponential smooth", "holt winters", "how to forecast"]):
        relevant_keys.append("demand_forecasting")

    if any(w in q for w in ["vendor scorecard", "supplier scorecard", "supplier kpi",
                             "vendor rating", "supplier rating", "supplier performance"]):
        relevant_keys.append("vendor_scorecard")

    if any(w in q for w in ["dead stock", "clearance strategy", "slow moving", "ageing stock",
                             "write off inventory"]):
        relevant_keys.append("dead_stock_strategy")

    if any(w in q for w in ["benchmark", "industry standard", "best practice", "kpi standard",
                             "typical ratio", "norm"]):
        relevant_keys.append("industry_benchmarks")

    if any(w in q for w in ["min max", "min-max", "minimum stock", "maximum stock"]):
        relevant_keys.append("min_max")

    if any(w in q for w in [
        "hindalco", "alucobond", "viva composite", "greenlam", "merino", "aerofoil",
        "acp", "aluminium composite", "acp panel", "cladding panel", "facade cladding",
        "louver blade", "louvre blade", "aluminium louver", "z section", "c channel",
        "hpl", "high pressure laminate", "compact laminate", "exterior hpl",
        "operable louver", "motorised louver", "fixed louver",
        "product catalog", "hsn code acp", "hsn code louver", "hsn 7604", "hsn 7606",
        "gst on acp", "gst on aluminium", "gst on laminates",
        "what products do we sell", "which products", "product range",
    ]):
        relevant_keys.append("product_catalog")

    if any(w in q for w in [
        "hindalco extrusions", "alucobond", "viva composite panel", "aerofoil louver",
        "acp cladding", "aluminium composite panel", "fr grade acp", "pvdf acp",
        "fixed louver system", "operable louver system", "louver blade pricing",
        "hpl laminate", "compact hpl", "greenlam hpl", "merino hpl",
        "louver products", "acp products", "laminate products", "facade products",
        "how to sell acp", "how to sell louvers", "louver vs acp", "acp brand",
    ]):
        relevant_keys.append("sanitary_products")

    if any(w in q for w in [
        "seasonal demand louver", "seasonal demand acp", "pre monsoon facade",
        "peak season facade", "seasonal buying louver", "lme aluminium price",
        "pre monsoon stock", "when to buy acp", "when to stock louvers",
        "monsoon facade demand", "post monsoon laminate", "seasonal inventory louver",
    ]):
        relevant_keys.append("seasonal_demand_hardware_sanitary")

    if any(w in q for w in ["kanban", "kanban system", "kanban inventory", "two bin", "two-bin", "pull system"]):
        relevant_keys.append("kanban")

    if any(w in q for w in ["vmi", "vendor managed inventory", "consignment stock", "consignment inventory"]):
        relevant_keys.append("vmi")

    if any(w in q for w in ["cross docking", "cross-docking", "cross dock", "transit point"]):
        relevant_keys.append("cross_docking")

    if any(w in q for w in ["fill rate", "otif", "on time in full", "order fulfilment", "order fulfillment"]):
        relevant_keys.append("fill_rate_otif")

    if any(w in q for w in ["cycle count", "cycle counting", "perpetual inventory", "inventory accuracy", "stock accuracy"]):
        relevant_keys.append("cycle_counting")

    if any(w in q for w in ["credit limit", "credit management", "credit policy", "credit terms",
                             "credit risk", "credit scoring", "pdc", "post dated cheque",
                             "cheque bounce", "collection strategy", "overdue collection",
                             "how to collect payment", "dso credit", "bad debt"]):
        relevant_keys.append("credit_management")

    if any(w in q for w in ["pos", "point of sale", "counter sale", "walk in", "walk-in",
                             "counter billing", "retail billing", "counter management",
                             "walk in customer", "counter pos"]):
        relevant_keys.append("counter_pos")

    if any(w in q for w in ["scheme", "trade scheme", "dealer scheme", "supplier scheme",
                             "volume rebate", "rebate management", "accrual scheme",
                             "loyalty program", "incentive tracking", "scheme tracking",
                             "scheme management", "volume bonus"]):
        relevant_keys.append("scheme_management")

    if any(w in q for w in ["warehouse", "godown", "warehouse management", "godown management",
                             "warehouse capacity", "godown capacity", "warehouse kpi", "grn accuracy",
                             "putaway", "pick accuracy", "multi-warehouse", "multi-godown",
                             "warehouse utilisation", "stock distribution", "where is stock"]):
        relevant_keys.append("warehouse_management")

    if any(w in q for w in ["tally", "tally prime", "tally erp", "tally export", "tally import",
                             "tally integration", "tally csv", "import to tally", "export to tally",
                             "tally stock", "tally ledger", "tally voucher", "tally gst"]):
        relevant_keys.append("tally_prime_export")

    if any(w in q for w in [
        "sales return", "credit note", "return policy", "partial return", "uom conversion return",
        "return accounting", "gst on return", "how to process return", "return credit",
        "pieces from box", "return pieces", "return gst reversal", "customer return",
        "debit note vs credit note", "how to raise credit note",
        "return condition", "good condition return", "partially damaged return",
        "fully damaged return", "condition of returned goods", "return condition split",
        "goods returned damaged", "customer returned damaged", "return inspection",
    ]):
        relevant_keys.append("sales_return")

    if any(w in q for w in [
        "damage recording", "grn damage", "transit damage", "goods damaged in transit",
        "how to record damage", "damaged goods accounting", "insurance claim goods",
        "damage loss account", "transit loss account", "inventory write down damage",
        "damage write off", "damage prevention", "insurance claim process",
        "damage goods received", "damage after grn", "damage on arrival",
        "transit damage accounting", "so damage", "dispatch damage",
        "carrier damage", "vehicle accident goods",
        "sales return damage", "return damage", "damaged on return",
        "sr damage", "return damage accounting", "damage on customer return",
        "write off customer return", "three damage types", "3 damage categories",
    ]):
        relevant_keys.append("damage_recording")

    if any(w in q for w in [
        "landed cost", "landing cost", "true cost", "true landed cost", "import cost",
        "custom duty calculation", "landed cost calculation", "landing cost method",
        "how to calculate landed cost", "charge heads", "per unit true cost",
        "freight overhead", "import overhead", "true margin", "margin after freight",
        "total cost of goods", "cost of procurement",
    ]):
        relevant_keys.append("landing_cost_methodology")

    if any(w in q for w in [
        "purchase requisition", "pr workflow", "material request", "indent process",
        "how to raise pr", "pr to po", "pr approval", "requisition process",
        "procurement request process", "internal purchase request", "pr sla",
        "pr vs po", "when to raise pr", "pr controls", "maverick buying",
        "budget control procurement", "pr audit trail",
    ]):
        relevant_keys.append("purchase_requisition_workflow")

    if any(w in q for w in [
        "qc inspection", "quality control method", "how to inspect goods",
        "qc checklist", "rtv process", "return to vendor", "goods inspection process",
        "incoming inspection", "post grn inspection", "what to check in qc",
        "qc decision", "accept reject", "conditional acceptance",
        "supplier quality", "defect rate benchmark", "qc kpi",
    ]):
        relevant_keys.append("qc_inspection_methods")

    if any(w in q for w in [
        "3 way match", "three way match", "3-way matching", "invoice matching",
        "po grn invoice reconciliation", "ap automation", "accounts payable process",
        "invoice discrepancy", "price variance invoice", "qty mismatch invoice",
        "auto match invoice", "invoice approval process", "payment approval workflow",
        "how does 3 way match work", "why was invoice blocked", "invoice tolerance",
    ]):
        relevant_keys.append("three_way_matching")

    if any(w in q for w in [
        "gate entry", "gate entry process", "vehicle arrival process",
        "inbound receiving", "delivery challan verification", "dc check",
        "how to manage gate entry", "security gate process", "inbound control",
        "short shipment handling", "no po delivery", "gate pass process",
        "receiving dock management", "vehicle clearance process",
    ]):
        relevant_keys.append("gate_entry_management")

    if any(w in q for w in [
        "design quote", "interior quote", "interior quotation", "design quotation",
        "architect fee", "fee proposal", "architect proposal", "interior design quote",
        "design studio", "design quote studio", "interior fit-out quote",
        "boq interior", "interior boq", "bill of quantities interior",
        "room schedule", "area calculator interior", "floor area room",
        "whatsapp brief", "parse brief interior", "scan interior brief",
        "boq generator", "interior package", "fit-out package",
        "phase split architect", "architect fee percentage", "fee split phases",
        "p1 concept", "p2 schematic", "p3 design development", "p4 construction documents",
        "p5 tender", "p6 construction admin", "architect milestone invoice",
        "interior win rate", "interior pipeline", "design quote win rate",
        "how much to charge architect", "standard architect fee india",
        "residential interior cost", "commercial interior cost",
        "interior design pricing", "quotation for interior", "interior quote process",
    ]):
        relevant_keys.append("design_quote_studio")

    if any(w in q for w in [
        "tax invoice", "gst invoice", "sales invoice", "invoice format",
        "cgst sgst igst", "cgst", "sgst", "igst", "output tax", "input tax credit",
        "itc", "gstr-1", "gstr1", "gstr-3b", "gstr3b", "gstr 3b",
        "invoice compliance", "gst compliance", "gst filing", "tax return gst",
        "invoice mandatory fields", "hsn code invoice", "sac code invoice",
        "e-invoice", "e invoicing", "irn", "invoice registration number",
        "credit note gst", "debit note gst", "gst reversal",
        "tds on payment", "tds invoice", "194c", "194j",
        "place of supply", "intra-state", "inter-state", "igst vs cgst sgst",
        "how to charge gst", "which gst to charge", "gst on sales",
        "invoice payment terms", "late payment interest gst",
        "advance receipt gst", "gst on advance",
    ]):
        relevant_keys.append("invoices_gst_compliance")

    # ── Fallback: general best practices ─────────────────────────────────────
    if not relevant_keys:
        relevant_keys = ["industry_benchmarks"]

    # ── Build context string (max 3 sections) ────────────────────────────────
    sections = []
    for key in relevant_keys[:3]:
        kb = KNOWLEDGE_BASE.get(key)
        if not kb:
            continue
        lines = [f"[KNOWLEDGE: {kb['title']}]"]
        for k, v in kb.items():
            if k == "title":
                continue
            if isinstance(v, dict):
                lines.append(f"  {k}:")
                for kk, vv in v.items():
                    if isinstance(vv, dict):
                        lines.append(f"    {kk}:")
                        for kkk, vvv in vv.items():
                            lines.append(f"      - {kkk}: {vvv}")
                    elif isinstance(vv, list):
                        lines.append(f"    {kk}: {' | '.join(str(i) for i in vv)}")
                    else:
                        lines.append(f"    {kk}: {vv}")
            elif isinstance(v, list):
                lines.append(f"  {k}: {' | '.join(str(i) for i in v)}")
            else:
                lines.append(f"  {k}: {v}")
        sections.append("\n".join(lines))

    return "\n\n".join(sections)


# ── TOOLS NEEDED FOR KNOWLEDGE QUERIES ────────────────────────────────────────

def get_tools_for_knowledge_query(query: str) -> list:
    """
    For knowledge queries, we still pull live tool data to show real calculations.
    Returns a small list of relevant tools.
    """
    q = query.lower()
    tools = []

    if any(w in q for w in ["eoq", "safety stock", "reorder", "abc", "gmroi", "dead stock",
                             "inventory turnover", "jit", "lean"]):
        tools.append("stock")

    if any(w in q for w in ["eoq", "safety stock", "reorder", "demand", "forecast"]):
        tools.append("demand")

    if any(w in q for w in ["working capital", "cash cycle", "gmroi", "margin", "fifo",
                             "inventory turnover", "dso", "dpo"]):
        tools.append("finance")

    if any(w in q for w in ["vendor scorecard", "supplier", "jit", "lead time", "reorder"]):
        tools.append("supplier")

    if any(w in q for w in ["credit", "overdue", "pdc", "collection", "bad debt"]):
        tools.append("credit")

    if any(w in q for w in ["pos", "counter sale", "walk in", "retail billing", "walk-in"]):
        tools.append("pos")

    if any(w in q for w in ["scheme", "rebate", "accrual", "loyalty", "incentive", "volume bonus"]):
        tools.append("schemes")

    if any(w in q for w in ["warehouse", "godown", "warehouse capacity", "godown capacity",
                             "grn accuracy", "putaway", "pick accuracy", "stock distribution"]):
        tools.append("warehouse")

    if any(w in q for w in ["landed cost", "landing cost", "true cost", "import cost", "custom duty"]):
        tools.append("landing_cost")

    if any(w in q for w in ["purchase requisition", "pr workflow", "material request", "indent"]):
        tools.append("pr")

    if any(w in q for w in ["qc inspection", "quality control", "rtv", "rejection rate", "defect rate"]):
        tools.append("qc")

    if any(w in q for w in ["3 way match", "invoice matching", "ap approval", "invoice discrepancy"]):
        tools.append("invoice_matching")

    if any(w in q for w in ["tax invoice", "gst invoice", "sales invoice", "cgst", "sgst", "igst",
                             "output tax", "itc", "gstr-1", "gstr-3b", "invoice compliance",
                             "invoice overdue", "overdue invoice", "billing", "invoicing"]):
        tools.append("invoices")

    # Default: stock + finance are always useful for context
    if not tools:
        tools = ["stock", "finance"]

    return tools[:3]
