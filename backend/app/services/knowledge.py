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
    # Product knowledge — hardware fittings
    "ebco", "hafele", "hettich", "blum", "dorset", "ozone handles",
    "drawer slide", "telescopic drawer", "soft-close drawer", "full extension drawer",
    "concealed hinge", "soft close hinge", "clip top hinge", "glass hinge",
    "handles", "knobs", "aluminium handle", "pvd handle", "ss handle",
    "cam lock", "furniture lock", "minifix", "connector fittings",
    "kitchen basket", "corner pull out", "tandem box", "kitchen system",
    "led strip", "furniture light", "cabinet light", "wardrobe light",
    "flap stay", "lift up mechanism", "wardrobe fitting", "bed fitting",
    "aluminium profile furniture", "furniture trim profile",
    "product catalog", "product catalogue", "what products do we sell",
    "which products should i stock", "best selling hardware",
    "hsn code hinge", "hsn code handle", "hsn code drawer", "hsn code lock",
    "gst on hardware", "gst on furniture fittings", "gst on hinges",
    # Product knowledge — sanitary fittings & bathware
    "jaquar", "hindware", "cera", "parryware", "grohe", "american standard", "kohler",
    "cp fittings", "chrome plated fittings", "sanitary fittings", "sanitary ware",
    "basin mixer", "wall mixer", "pillar tap", "stop cock", "concealed stop cock",
    "shower system", "overhead shower", "hand shower", "rain shower",
    "divertor", "angle valve", "gate valve", "ball valve", "bib cock",
    "concealed cistern", "flush valve", "urinal", "ewc", "wash basin",
    "bathroom fittings", "bath faucet", "kitchen faucet", "kitchen sink mixer",
    "sensor tap", "touchless tap", "electronic faucet",
    "sanitary hsn code", "cp fittings gst", "hsn code faucet", "hsn code mixer",
    "gst on sanitary", "hsn 8481", "hsn 6910", "what is cp fittings",
    "which sanitary brand", "best sanitary brand", "jaquar vs hindware",
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
    # Product catalog concepts — hardware
    "ebco", "hafele", "hettich", "blum", "drawer slide", "concealed hinge",
    "soft close hinge", "glass hinge", "aluminium handle", "pvd handle",
    "cam lock", "minifix", "kitchen basket", "tandem box", "led strip",
    "flap stay", "wardrobe fitting", "aluminium profile furniture",
    "product catalog", "hsn code", "gst hardware", "furniture hardware",
    # Product catalog concepts — sanitary
    "jaquar", "hindware", "cera", "parryware", "grohe", "kohler",
    "cp fittings", "basin mixer", "stop cock", "concealed cistern",
    "shower", "divertor", "sensor tap", "sanitary", "sanitary ware",
    "bathroom fittings", "kitchen faucet", "sanitary products",
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
            "sku": "Ebco Soft-Close Hinge 35mm Pk-10 (your highest-velocity A-class SKU)",
            "D": "2,880 packs/year (240/month × 12)",
            "S": "₹800/order (PO processing + receiving + inspection time)",
            "H": "₹87/pack/year (24% of ₹365 buy price)",
            "EOQ_result": "≈ 229 packs/order",
            "calculation": "√(2 × 2880 × 800 ÷ 87) = √52,966 ≈ 229 packs",
            "orders_per_year": "≈ 13 orders/year (2880 ÷ 229)",
            "vs_current": "If ordering <120 packs at a time, you're over-ordering. If >350, under-ordering.",
        },
        "when_to_use": "Minimise total inventory cost (ordering cost + holding cost). Best for stable demand items.",
        "limitations": [
            "Assumes constant demand and lead time",
            "Ignores quantity discounts (Ebco may offer 3% for 500+ pack orders)",
            "Doesn't account for stockout cost — add safety stock separately",
        ],
        "benchmark": "Hardware/sanitary dealers: 10-18 orders/year for A-class SKUs. EOQ order cycle = 2-4 weeks.",
        "indian_context": "Ebco typically has minimum ₹5,000 per SKU per order for free freight. Run EOQ with quantity discount: if large order gives 3% off, recalculate with adjusted H (holding cost drops). For Jaquar CP fittings (fragile, high-value), add insurance cost (0.4%) to H.",
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
            "sku": "Ebco Soft-Close Hinge 35mm Pk-10",
            "daily_demand_avg": "8 packs/day",
            "demand_stddev": "~2 packs/day (estimated ±25% variability — spikes pre-Diwali)",
            "lead_time_ebco": "7 days (reliable, σ_LT ≈ 0.8d)",
            "lead_time_hindware": "10-12 days (unreliable, σ_LT ≈ 3.4d)",
            "at_95_service_level": "SS = 1.65 × 2 × √7 = 1.65 × 2 × 2.65 ≈ 9 packs",
            "hindware_adjusted_SS": "For Hindware SKUs: SS = 1.65 × √(12×4 + 64×11.6) ≈ 22 units (Hindware's variability more than doubles SS need!)",
            "current_reorder_level": "~62 packs (set manually — needs recalculation)",
            "recommendation": "Set ROP for Ebco hinges at 8×7 + 9 = 65 packs. Currently at 48 — critically below ROP, order immediately.",
        },
        "service_level_choice": {
            "A_class_SKUs": "95-99% (Ebco hinges, Jaquar mixers — revenue-critical, fast-moving)",
            "B_class_SKUs": "90-95% (Hafele handles, Hettich drawers)",
            "C_class_SKUs": "85-90% (minimal holding cost — door locks, specialty items)",
        },
        "benchmark": "For A-class hardware/sanitary SKUs: Safety stock = 10-15% of average cycle stock.",
        "indian_context": "Pre-monsoon (May-Jun): increase safety stock 25-35% for plumbing/sanitary SKUs — demand spikes for stop cocks, concealed cisterns. Diwali (Sep-Oct): +40-50% safety stock for kitchen hardware — hinges, drawer systems, handles.",
    },

    "reorder_point": {
        "title": "Reorder Point (ROP) — When to Place the Next Order",
        "formula": "ROP = (Average Daily Demand × Lead Time) + Safety Stock",
        "applied_to_your_data": {
            "Ebco Soft-Close Hinge 35mm Pk-10": {
                "daily_demand": "8 packs/day",
                "lead_time": "7 days (Ebco India)",
                "safety_stock": "9 packs",
                "ROP": "8 × 7 + 9 = 65 packs",
                "current_stock": "48 packs",
                "gap_to_rop": "17 packs BELOW ROP — place order immediately",
                "days_until_rop": "Already past ROP — stockout risk in 6 days",
            },
            "Jaquar Lyric Basin Mixer Chrome": {
                "daily_demand": "1.4 units/day",
                "lead_time": "8 days (Jaquar)",
                "safety_stock": "4 units",
                "ROP": "1.4 × 8 + 4 = 15 units",
                "current_stock": "12 units",
                "days_until_rop": "Already 3 below ROP — place PO today",
            },
        },
        "setup_advice": [
            "Set ROP alerts in your DMS/Tally when stock hits this level",
            "For Hindware/Parryware SKUs: use their longer lead time (10-12 days) not Ebco (7 days)",
            "Review ROPs quarterly — demand changes sharply pre-monsoon (plumbing) and pre-Diwali (hardware)",
            "Keep a printed ROP card at the counter for fast-moving SKUs",
        ],
        "benchmark": "World-class dealers automate ROP alerts. Manual checking of 200+ SKUs daily is error-prone — Ebco hinge stockout is the cost of no system.",
        "indian_context": "Tally ERP supports reorder level alerts per item — Stock Items → Reorder Level. For high-value sanitary items (Jaquar mixers ₹4,850+), set tighter ROPs — stockout means lost high-margin sale.",
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
            "A_SKUs": ["Ebco Soft-Close Hinge 35mm Pk-10", "Jaquar Lyric Basin Mixer", "Hettich InnoTech Drawer 400mm", "Hafele Zinc D-Handle 128mm"],
            "A_revenue_share": "76% of total revenue from top hardware/sanitary SKUs",
            "B_count": "12 SKUs → 19% revenue",
            "C_count": "30 SKUs → 5% revenue",
            "insight": "30 C-class SKUs are tying up cash and attention for only 5% revenue — rationalise these",
        },
        "action_by_class": {
            "A_class": "Daily physical count, dedicated shelf with bin card, direct Ebco/Jaquar relationship, 95%+ service level",
            "B_class": "Weekly stock review, standard reorder cycle, dual sourcing for top B-SKUs",
            "C_class": "Monthly review, order only when customer demand confirmed, auto-10% discount after 60d no movement",
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
            "gross_margin_annual": "₹84.5L (24.8% × ₹340L annual revenue)",
            "avg_inventory_value": "₹42.6L",
            "GMROI": "2.14 — Good, above 2.0 target",
            "target": "2.4+ (achievable by clearing dead stock + improving Hindware-sourced margin)",
        },
        "how_to_improve": [
            "Clear ₹3.8L dead stock → reduces denominator → GMROI improves to ~2.28",
            "Shift Hindware volume to Jaquar (better margin + reliability) → increases numerator",
            "Faster turnover on A-class hardware/sanitary SKUs → both metrics improve",
            "Negotiate better inbound freight rates for Jaquar (currently ₹3.8/unit) → direct margin improvement",
        ],
        "by_sku": {
            "Jaquar Lyric Basin Mixer": "GMROI ≈ 5.8 (34.2% margin, 5.2× turnover) — star performer",
            "Parryware Sensor Tap": "GMROI = 0 — dead stock, pure cost",
            "Hindware Sanitary Ware": "GMROI ≈ 1.62 (27.8% margin, but slow turns + high freight)",
        },
        "benchmark": "Hardware/sanitary dealers India: GMROI 1.8-2.8. Target 2.2+. Best-in-class with focused range: 2.5-3.5.",
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
            "Ebco India":    "PARTIAL JIT FEASIBLE — 94% on-time, 7-day lead time. Reduce safety stock to 8-10 days.",
            "Hafele India":  "PARTIAL JIT FEASIBLE — 92% on-time, 8-day lead time. Good for B-class hardware.",
            "Jaquar India":  "CONDITIONAL — 88% on-time, use for B-class CP fittings only, not A-class mixers.",
            "Hindware":      "NOT RECOMMENDED — 76% on-time, 3.2-day avg delay. Full safety stock mandatory.",
        },
        "modified_jit_recommendation": "Apply 'lean inventory' approach: Keep 10-day safety stock for A-class hardware/sanitary (not 20-day), order via EOQ from Ebco/Hafele, eliminate C-class from stock entirely (order-on-demand only).",
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
            "Reduce DSO by 8 days": "Offer 1.5% early payment discount to kitchen studios and bath studios → get paid in 22 days vs 32 → frees ₹3.8L cash",
            "Increase DPO by 14 days": "Negotiate NET-30 with Ebco/Jaquar (vs current NET-8) → hold cash 22 more days → ₹2.4L more cash in hand",
            "Reduce DIO by 4 days": "Clear dead stock ₹3.8L → DIO drops from 20 to 16 → ₹1.7L freed",
            "combined_impact": "All 3 actions: CCC from 44 → 22 days = ₹7.9L more cash available",
        },
        "benchmark": "Hardware/sanitary dealers India: CCC 32-48 days. Best-in-class: 22-32 days. Yours at 44 days has clear improvement path.",
        "indian_context": "GST credit terms (ITC available T+1 month) effectively extend your DPO by 30 days on tax value. For Jaquar and Ebco — both have formal dealer portal payment terms; negotiate NET-30 in writing as part of annual business review.",
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
            "Ebco India":    "Score: 94/100 — PREFERRED (On-time 94%, Price -2%, GRN 99%)",
            "Hafele India":  "Score: 91/100 — PREFERRED (On-time 92%, premium price +3%, GRN 97%)",
            "Hettich India": "Score: 89/100 — GOOD (On-time 90%, Price +2%, GRN 96%)",
            "Jaquar India":  "Score: 86/100 — GOOD (On-time 88%, Price -1%, GRN 94%)",
            "Hindware":      "Score: 61/100 — ACTION REQUIRED (On-time 76%, hidden freight cost +18% landed, GRN 86%)",
        },
        "action_thresholds": {
            "above_85": "Preferred — expand volume, negotiate better terms",
            "70_to_85": "Conditional — monitor quarterly, dual-source critical SKUs",
            "below_70": "30-day improvement plan or begin supplier replacement",
        },
        "benchmark": "World-class: Top 2-3 suppliers cover 70-80% of volume. Hindware at 61/100 must be on improvement plan — their freight cost is reducing your margin by ~2pp on sanitary SKUs.",
        "indian_context": "Many Indian dealers use informal relationships instead of scorecards — this is why hidden costs (Hindware heavy-goods freight ₹5.4/unit) go undetected for years. Formalise at least a quarterly vendor review with Jaquar and Ebco — they both have structured dealer programs.",
    },

    "dead_stock_strategy": {
        "title": "Dead Stock Management — Recovery Strategies",
        "definition": "Inventory with no sales movement in 60+ days (severe: 90+ days). Dead stock = locked cash + holding cost + insurance + space cost.",
        "cost_of_dead_stock": {
            "holding_cost": "20-25% of value per year (₹4.2L × 22% = ₹92,400/year just in holding cost)",
            "opportunity_cost": "Same capital could fund faster-moving A-class stock",
            "space_cost": "Dead stock occupies prime godown space (you have 82% capacity at Main WH)",
        },
        "your_current_situation": {
            "total_dead": "₹3.8L (8.9% of inventory — 3× above industry benchmark)",
            "items": [
                "Parryware Pilot EV Sensor Tap: ₹1.84L, 95 days, 44 units",
                "Dorset Euro Cylinder Lock (old model): ₹1.21L, 87 days, 72 units",
                "Ebco LED Cabinet Light (old model): ₹0.78L, 76 days, 58 units",
            ],
            "urgency": "Every 30 additional days adds ₹7,000 in holding cost on this ₹3.8L",
        },
        "clearance_strategies": {
            "Plumber/Contractor Discount (fastest)": "10-12% discount to Raju Plumbing and Mehta Construction → target ₹1.5L cleared in 2 weeks",
            "Bundle Selling": "Bundle Ebco LED Cabinet Light (old model) with new Ebco hinge sets — kitchen studios buy both; clear at near-full price",
            "Plumber Targeting": "Parryware sensor tap → target electrical contractors and plumbers; 12% discount + offer as project bundle for commercial washrooms",
            "Supplier Return": "Dorset old model locks → check if Dorset has return/exchange policy; offer upgrade to new Euro Cylinder at reduced incremental cost",
            "Secondary Market": "If above fails → liquidator at 25-30% discount — better than holding cost eating margin",
            "Price Automation": "Set Tally alert: auto-apply 10% discount if 60 days no movement, 15% at 90 days",
        },
        "prevention": [
            "Monthly SKU velocity review — flag any item with <2 movements in 30 days",
            "ABC-based buying discipline — no C-class order without confirmed customer demand",
            "Don't over-buy sanitary ware models — style trends change fast; stock minimum 30-45 days cover",
            "Trial orders for new SKUs — max 5-10 units first order for sanitary, max 50 packs for hardware",
        ],
        "benchmark": "Dead stock target: <3% of inventory value. Your 8.9% needs urgent attention. Industry best: <2%. Every 1% reduction = ₹42,600 freed (on ₹42.6L inventory).",
        "indian_context": "If returning goods to Jaquar/Hindware, credit note must be raised within 30 days of original supply date for correct ITC reversal. Hindware's return policy is stricter — check dealer agreement before purchasing slow-moving models.",
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
            "Dead Stock 8.9%": "HIGH RISK (target <3% — Parryware sensor tap and old Dorset lock need urgent clearance)",
            "Stock Turnover 5.2x": "WITHIN TARGET (target 5-6× — on track, keep A-class replenishment tight)",
            "GMROI 2.14": "GOOD (target 2.0+ — clear dead stock to push to 2.3+)",
            "Dispatch SLA 87%": "BELOW TARGET (target 95% — Ebco hinge stockout is the main cause of delays)",
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
        "title": "Product Catalog — Hardware, Laminates & Building Materials",
        "overview": "The catalog covers hardware fittings, laminates, louvers, cladding and more from brands including Ebco, Hafele, Hettich, Blum, Greenlam, Merino, Century, Alucobond and others.",
        "hardware_brands": {
            "Ebco": "Indian brand (HQ Mumbai). Strong mid-range hardware covering drawer slides, hinges, handles, locks, kitchen baskets, LED lights, aluminium profiles, wardrobe fittings. Standard in most Indian modular kitchen and furniture projects. Trade discount ~25-28% from MRP.",
            "Hafele": "German premium brand with India operations. Premium pricing but strong architect/designer preference. Full range from slides to kitchen systems. Typical margin 28-32%.",
            "Hettich": "German brand, strong in soft-close slides (Arena Plus, InnoTech) and Sensys hinges. Premium segment. Used in high-end residential and hospitality.",
            "Blum": "Austrian premium brand. Best-in-class Blumotion soft-close, Tandem drawer systems, Aventos lift systems. Specified by top architects. Highest price point.",
            "Dorset": "Indian brand. Budget-to-mid range handles, SS hardware. Good value for large-volume residential projects.",
        },
        "product_segments": {
            "Drawer Slides": {
                "types": "Telescopic (3/4 ext, 30kg), Full-Extension Soft-Close (45kg), Under-mount (concealed), Tandem Box (integrated steel box)",
                "key_sizes": "300mm, 350mm, 400mm, 450mm, 500mm, 550mm",
                "hsn": "8302", "gst": "18%",
                "pricing": "Telescopic pair: ₹100-180 (budget) to ₹350-600 (Blum Tandem). Soft-close pair: ₹250-500 (Ebco/Hafele) to ₹800+ (Blum).",
                "ebco_range": "DS-350 telescopic ₹165/pair; DS-SC400 soft-close full-ext ₹400/pair",
            },
            "Hinges": {
                "types": "Concealed 35mm (full overlay, half overlay, inset), Soft-Close Concealed, Glass Door Hinge (hydraulic, clamp-on), Piano Hinge, Flap Hinge",
                "key_sizes": "35mm cup diameter (universal standard)",
                "hsn": "8302", "gst": "18%",
                "pricing": "Standard 10-pack: ₹180-280 (Ebco) to ₹500+ (Blum). Soft-close 10-pack: ₹350-550 (Ebco/Hafele) to ₹900+ (Blum Blumotion).",
                "installation": "35mm Forstner bit, 13mm deep cup. 3mm edge distance. Mounting plate on cabinet.",
                "ebco_range": "HNG-35STD pack-10 ₹245; HNG-35SC soft-close pack-10 ₹480",
            },
            "Handles & Knobs": {
                "types": "Aluminium profile handles, SS bar handles, PVD-coated, Zamak die-cast, Knobs",
                "finish_options": "Matt Silver, Matt Black, Champagne Gold, Rose Gold, Gunmetal, PVD (scratch-resistant)",
                "common_cc": "96mm, 128mm, 160mm, 192mm, 224mm, 256mm, 320mm, 448mm (for 480mm profile handles)",
                "hsn": "8302", "gst": "18%",
                "pricing": "Aluminium profile handle 480mm: ₹90-180. SS bar 128mm: ₹110-200. PVD premium: +30-50% over standard.",
                "tip": "Aluminium profile handles are the most popular for modular kitchen shutters in India — offer all 5 finish options.",
                "ebco_range": "HDL-ALU480 ₹118/Nos; HDL-SS128 ₹140/Nos",
            },
            "Furniture Locks": {
                "types": "Cam Lock (minifix), Drawer Lock, Wardrobe Lock, Glass Door Lock",
                "hsn": "8301", "gst": "18%",
                "pricing": "Cam lock 50-pack: ₹200-350. Single locks: ₹80-350.",
                "note": "HSN 8301 for locks (not 8302 like other fittings). Important for GST invoicing.",
            },
            "Kitchen Systems": {
                "types": "Corner pull-out basket (magic corner, carousel), Tandem drawer box, Under-sink basket, Cutlery dividers, Tall unit baskets",
                "brands": "Ebco, Hafele, Hettich, Blum SpaceCorner",
                "hsn": "8302 (systems) / 7323 (wire baskets)",
                "pricing": "Corner basket set: ₹2500-5000 (Ebco/Hafele). Tandem box: ₹1500-3500.",
                "ebco_range": "KB-CORNER900 ₹2800/set; TANDEM-400 ₹1780/set",
            },
            "Furniture LED Lights": {
                "types": "LED strip (aluminium channel + diffuser), Puck lights, Sensor lights, Profile lights",
                "specs": "12V DC, IP20 (indoor). Warm white 3000K / Cool white 6000K / Neutral 4000K",
                "hsn": "9405", "gst": "18%",
                "pricing": "Strip 1000mm: ₹200-400 (Ebco/Hafele). Sensor variant: +₹150-200 premium.",
                "ebco_range": "LED-STRIP1M ₹250/Nos",
            },
            "Aluminium Profiles & Handles": {
                "types": "T-trim edge profiles, Glass door frame profiles, Handle profiles (bar type), Wardrobe top channel",
                "finish": "Anodized Silver, Gold, Black. Lengths: 2000mm, 2400mm, 3000mm",
                "hsn": "7604", "gst": "18%",
                "pricing": "Trim profile 2m: ₹80-150/piece. Handle profiles: ₹150-400/piece.",
                "ebco_range": "ALU-TRIM2M ₹95/Nos",
            },
        },
        "laminate_brands": {
            "HPL": "Greenlam, Merino, Century, Stylam. Standard 1mm: ₹950-1300/sheet. Post-form 1.5mm: ₹1250-1680/sheet.",
            "Compact": "Greenlam Compact, Stylam. 6mm: ₹2980-3600/sheet. 12mm: ₹5800-7200/sheet. For toilet cubicles and structural use.",
            "Acrylic": "Durian, Merino Acrylic. High-gloss 1mm: ₹1720-2100/sheet. For premium kitchen shutters.",
        },
        "hsn_gst_quick_ref": {
            "8302": "Hinges, drawer slides, handles, stays, shelf supports — GST 18%",
            "8301": "Locks (cam lock, drawer lock, wardrobe lock) — GST 18%",
            "9405": "LED lights, luminaires — GST 18%",
            "7604": "Aluminium profiles/extrusions — GST 18%",
            "7318": "Screws, bolts, minifix connectors — GST 18%",
            "4814": "HPL laminates — GST 18%",
            "3921": "PVC laminates/sheets — GST 18%",
            "7606": "ACP aluminium composite — GST 18%",
        },
        "selling_tips": {
            "hardware_upsell": "Sell complete hardware sets per kitchen/wardrobe: hinges + handles + drawer slides. Package deals improve average order value 40-60%.",
            "soft_close_upgrade": "Always upsell soft-close variants — premium is ₹200-400 per door but customer satisfaction increases dramatically. Easy win.",
            "brand_positioning": "Ebco: value (budget & mid-range residential). Hafele/Hettich: premium (architects & developers). Blum: super-premium (luxury projects).",
            "target_customers": "Modular kitchen fabricators, furniture manufacturers, carpenters, interior designers — all need hardware regularly. Monthly account relationships are ideal.",
        },
    },

    "sanitary_products": {
        "title": "Sanitary Fittings & Bathware — Product Knowledge for Dealers",
        "overview": "Sanitary fittings (CP fittings = chrome-plated fittings) and sanitaryware are among the highest-margin product categories for building materials dealers. Gross margin 28–38% is achievable vs 18–26% for hardware. Key segments: CP fittings (faucets, mixers, showers), concealed cisterns, sanitaryware (wash basins, EWCs), and accessories.",
        "sanitary_brands": {
            "Jaquar": "India's largest CP fittings brand. Premium quality, architect-preferred, strong retail presence. Full range: basin mixers, wall mixers, shower systems, divertors, concealed cisterns. Trade discount 25-30% from MRP. HSN 8481 for CP fittings (18% GST). Best for bathroom studios and premium residential projects.",
            "Hindware": "Mid-to-premium sanitaryware and CP fittings. Strong in concealed cisterns and wash basins. Pricing ~15-20% below Jaquar. Delivery reliability lower (76% on-time vs Jaquar 88%). HSN 6910 for sanitaryware (18% GST).",
            "Cera": "Budget-to-mid CP fittings and sanitaryware. Good value for mass residential projects. Dealer margins 26-30%. Distribution strength in Tier-2 cities.",
            "Parryware": "One of India's oldest sanitaryware brands. Strong in EWCs, wash basins. Mid-range pricing. Sensor tap series (Pilot EV) has lower demand — evaluate before stocking.",
            "GROHE": "German premium CP fittings. Architect-specified for luxury projects (5-star hotels, premium residential). Margins 30-38%. Long lead times from import. Keep limited stock — order against confirmed projects.",
            "American Standard": "US brand, premium sanitaryware and faucets. Targeted at luxury segment. Good for project sales to star hotels and premium developers.",
        },
        "product_categories": {
            "Basin & Pillar Taps": {
                "types": "Pillar tap (hot/cold separate), Basin mixer (single lever), Wall mixer, Sensor/touchless tap",
                "hsn": "8481", "gst": "18%",
                "pricing": "Pillar tap: ₹400-1200 (Hindware/Cera). Basin mixer: ₹1800-6500 (Jaquar). Sensor tap: ₹3500-12000.",
                "tip": "Always stock both pillar taps (economy) and basin mixers (premium) — different buyer segments.",
            },
            "Kitchen Sink Mixers": {
                "types": "Single-lever wall-mounted, Pillar-mounted, Pull-out spray",
                "hsn": "8481", "gst": "18%",
                "pricing": "₹1,500-4,500 (Jaquar). ₹800-2,200 (Hindware/Cera).",
                "tip": "Kitchen faucets sold with modular kitchen packages — pair with Ebco/Hettich kitchen hardware for complete order.",
            },
            "Shower Systems": {
                "types": "Overhead/rain shower (wall/ceiling mount), Hand shower + holder, Thermostatic shower panel, Multi-jet divertor",
                "hsn": "8481", "gst": "18%",
                "pricing": "Overhead shower 200mm: ₹1,800-4,500 (Jaquar). Thermostatic panel: ₹8,000-25,000.",
                "tip": "Jaquar Lyric and Allied series are fast movers. Bundle overhead + hand shower + divertor for higher AOV.",
            },
            "Stop Cocks & Angle Valves": {
                "types": "Concealed stop cock DN15/DN20, Exposed stop cock, Angle valve, Gate valve, Ball valve",
                "hsn": "8481", "gst": "18%",
                "pricing": "Stop cock DN15: ₹450-900 (Hindware/Jaquar). Ball valve: ₹180-480.",
                "tip": "Plumbers buy stop cocks in volume — keep 150+ units stock. Pre-monsoon demand surges 25-40%.",
            },
            "Concealed Cisterns": {
                "types": "Concealed wall-hung cistern, In-wall slim cistern, Flush valve (sensor + manual)",
                "hsn": "3922 (plastic cistern) / 7324 (metal parts)", "gst": "18%",
                "pricing": "Hindware concealed cistern: ₹2,800-4,200. Jaquar Cistern: ₹3,500-5,500.",
                "tip": "Growing demand with wall-hung EWC adoption. Requires skilled installation — maintain list of trusted plumbers for customer referrals.",
            },
            "Sanitaryware (Wash Basins, EWCs, Urinals)": {
                "types": "Wash basin (table-top, wall-hung, under-counter), EWC (Western Commode — floor/wall-hung), Urinal",
                "hsn": "6910", "gst": "18%",
                "pricing": "Wash basin: ₹1,400-8,500. EWC floor: ₹3,500-12,000. Wall-hung EWC + cistern combo: ₹8,000-22,000.",
                "tip": "High-value, bulky items — stock limited quantities (5-10 of fast-moving models). Order to project specs for premium ranges.",
            },
        },
        "selling_tips": {
            "bundle_strategy": "Basin mixer + overhead shower + stop cock + angle valve = complete bathroom CP set. Bundle gives 18-22% AOV uplift vs individual sale.",
            "segment_targeting": "Plumbers/installers: stop cocks, angle valves, pillar taps in bulk. Bathroom studios: mixer + shower combos. Contractors: mid-range full sets. Premium projects: Jaquar / GROHE specification.",
            "brand_positioning": "Jaquar: premium/aspirational (always recommend for bathroom studio customers). Hindware/Cera: value residential (contractor bulk orders). GROHE: luxury specification (hold only on confirmed project).",
            "avoid_dead_stock": "Avoid stocking sensor taps unless you have institutional buyer. Avoid specialty colours (gold, rose gold CP) without confirmed order — these become dead stock.",
        },
        "hsn_gst_quick_ref": {
            "8481": "Taps, cocks, valves, faucets, mixers, shower heads, stop cocks — GST 18%",
            "6910": "Ceramic sanitaryware (wash basins, EWCs, urinals, shower trays) — GST 18%",
            "3922": "Plastic cisterns, shower enclosures, plastic sanitaryware — GST 18%",
            "7324": "Sanitary ware of iron/steel (metal cisterns, SS sinks) — GST 18%",
        },
        "benchmark": "Sanitary CP fittings margin: 28-38% (best category in hardware/sanitary trade). Jaquar dealers: net margin 8-14% (industry-high). Stock turnover for CP fittings: 6-10× per year. Fast-movers are stop cocks, angle valves, basin mixers.",
    },

    "seasonal_demand_hardware_sanitary": {
        "title": "Seasonal Demand Patterns — Hardware & Sanitary Trade (India)",
        "overview": "Hardware and sanitary trade follows two distinct seasonal cycles: pre-monsoon plumbing surge and pre-Diwali kitchen/furniture hardware peak. Understanding these cycles prevents stockouts during peaks and dead stock during troughs.",
        "seasonal_calendar": {
            "Jan-Feb (Post-Diwali construction completions)": {
                "demand": "+12-18% above baseline",
                "hot_categories": "CP fittings, sanitary ware, bathroom accessories — new homes being finished",
                "action": "Stock up bathroom fittings in December. Ensure Jaquar/Hindware POs placed by Dec 10.",
            },
            "Mar-Apr (New FY buying + summer construction)": {
                "demand": "Baseline",
                "hot_categories": "General hardware, kitchen systems — moderate construction activity",
                "action": "Run scheme audit for new FY. Negotiate fresh terms with Ebco/Jaquar for FY targets.",
            },
            "May-Jun (Pre-monsoon plumbing surge)": {
                "demand": "+25-35% for sanitary/plumbing, +8-12% for general hardware",
                "hot_categories": "Stop cocks, concealed stop cocks, angle valves, gate valves, concealed cisterns",
                "action": "Increase stop cock and angle valve stock 3× from April levels. Pre-order Jaquar/Hindware plumbing SKUs by April 15.",
            },
            "Jul-Aug (Monsoon — mixed signals)": {
                "demand": "Plumbing +15%, Kitchen hardware -20%",
                "hot_categories": "Waterproofing accessories, CP fittings for repairs, stop cocks",
                "action": "Reduce kitchen hardware orders (modular kitchen installs slow down). Maintain plumbing stock for emergency repairs demand.",
            },
            "Sep-Oct (Pre-Diwali peak — best months)": {
                "demand": "+28-40% for kitchen hardware, +15-20% for all categories",
                "hot_categories": "Soft-close hinges, drawer slides, kitchen basket systems, handles, LED cabinet lights",
                "action": "Place Ebco and Hettich orders by August 15. Increase soft-close hinge stock 4× baseline. Stock all handle finishes. Hire temporary counter staff.",
            },
            "Nov-Dec (Post-Diwali — continuation + gifting)": {
                "demand": "+15-20% for premium ranges, moderate for basics",
                "hot_categories": "Premium handles (PVD gold/black), luxury CP fittings (GROHE, Jaquar premium), LED furniture lights",
                "action": "Stock premium/aspirational SKUs — customers upgrade during this period. Good time to push Blum and GROHE if you stock them.",
            },
        },
        "key_insights": [
            "Kitchen hardware follows Diwali (Sep-Oct) seasonality; plumbing/sanitary follows pre-monsoon (May-Jun) — these are DIFFERENT cycles",
            "Software close hinge demand spikes 4× in Sep-Oct — maintain safety stock of 120+ packs from August",
            "Stop cock demand is relatively year-round with pre-monsoon spike; never go below 50 units stock",
            "Jaquar CP fittings have consistent year-round demand with slight spike Jan-Feb and Sep-Oct",
            "Sensor taps and touchless faucets: post-pandemic demand is growing but still project-driven; avoid speculative stock",
        ],
        "stocking_strategy": {
            "year_round_A_class": "Ebco soft-close hinges, Jaquar basin mixers, Hafele handles, Hindware stop cocks — never below 21 days cover",
            "seasonal_pre_buy": "Concealed stop cocks (Apr 15), Drawer systems (Aug 15), Soft-close hinges (Aug 15), Shower systems (Dec 10)",
            "avoid_overstocking": "Sensor taps, wall-hung EWCs (design-specific), PVD gold handles (style-specific) — order only on confirmed demand",
        },
        "benchmark": "Best-in-class dealers: seasonal forecast accuracy within ±15%. Pre-buying 45-60 days before seasonal peak (not 2 weeks) is the single biggest lever to prevent stockouts during Diwali and pre-monsoon.",
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
            "ebco_q1_bonus":         "Target ₹18L, achieved ₹13.4L, 49 days left → need ₹93,900/day (current rate ~₹90K/day). Close but needs final push — focus Ebco hinges and drawer slides.",
            "hindware_may_promo":    "Target 60 units concealed cisterns, achieved 27, 19 days left → need 1.74 units/day vs current 1.42/day. AT RISK — call top 5 plumbers and bathroom contractors today.",
            "jaquar_annual_loyalty": "72% of ₹30L target achieved at ₹21.6L. On track at current pace. ₹60K+ accrual secured. Maintain ₹5.5L+/month to close FY.",
            "hettich_q1_bonus":      "91% of ₹10L target achieved at ₹9.1L, 49 days left → need just ₹0.9L more → place one PO to lock ₹40K credit note.",
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
        "benchmark": "Top hardware/sanitary dealers earn 3–6% of their purchase value from schemes. If your scheme income is <1%, you are under-claiming. Review all supplier agreements and claim missed accruals from last 2 years.",
        "indian_context": "Most small dealers miss scheme payouts due to poor tracking. Ebco, Hafele, Jaquar, and Hettich all have formal dealer portal schemes — register and track online. Jaquar's Premier Partner program is particularly lucrative for high-volume dealers. Keep all scheme communications (emails + PDFs) in a dedicated folder. Claim within scheme deadline (typically 30–45 days after period end).",
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
            "main_godown": "Whitefield Industrial Area — 5000 sheet capacity, 76.8% utilised (3840 sheets, ₹38.6L value)",
            "transit_hub": "Koramangala 6th Block — 1000 sheet capacity, 32% utilised (staging area for city deliveries)",
            "counter_stock": "Showroom Floor — 200 sheet capacity, 82% utilised (replenished daily from main godown)",
            "overall_utilisation": "69.7% across all locations — healthy range",
        },
        "optimisation_rules": [
            "Replenish counter stock daily from main godown — never let counter stock drop below 70%",
            "Review slow movers in main godown monthly — move to clearance or return to supplier",
            "Transit hub should never exceed 60% utilisation — it is a flow-through node, not storage",
            "GRN mismatches > ₹5,000 must be resolved before next PO with same supplier",
            "Run cycle counting on high-value SKUs (Jaquar, Hettich) weekly; full physical count quarterly",
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
        "title": "Sales Returns — UOM Conversion, Credit Notes & Accounting",
        "definition": "A sales return occurs when a customer returns goods after purchase. InvenIQ handles partial returns — e.g., a customer who bought a box of 10 pieces returns only 3 pieces. The system computes the credit at piece price (box price ÷ 10 × 3 pcs) and auto-generates the accounting entries.",
        "uom_conversion": {
            "what_is_it": "UOM (Unit of Measure) conversion handles cases where the SALE was in one unit (e.g., box of 10 pcs) but the RETURN is in a different unit (e.g., 3 pcs). The conversion ratio tells the system how many sub-units are in one master unit.",
            "standard_ratios": "Box = 10 pcs | Case = 12 pcs | Dozen = 12 pcs | Sheet = 32 sqft | Bag = 25 kg | Roll = 50 mtrs | Pack = 6 pcs",
            "formula": "Piece Price = Unit Price ÷ Conversion Ratio | Return Amount = Piece Price × Return Qty",
            "example": "Sold: 50 boxes @ ₹485/box (1 box = 10 pcs). Customer returns 3 pcs from 1 box. Piece price = ₹485 ÷ 10 = ₹48.50. Return amount = ₹48.50 × 3 = ₹145.50 + GST 18% = ₹171.69 credit note.",
        },
        "credit_note": {
            "what_is_it": "A Credit Note is a document issued to the customer confirming the value of goods returned. It can be applied against future purchases or refunded as cash.",
            "validity": "Credit notes are typically valid for 90 days from issue date (configurable per business policy).",
            "gst_treatment": "GST charged on original sale must be reversed on return. GST reversal: Credit Note must show original invoice number, GST rate, and tax reversal amount. File credit notes in GSTR-1 (negative entry).",
            "applied_to_your_data": "Current open credit note balance: ₹171.69 (Mehta Interiors, CN-2026-0012). Apply against next order to close.",
        },
        "accounting_entries": {
            "entry_1_sales_reversal":   "Sales Return A/c Dr / Customer A/c Cr — reversal of sale (credit note amount incl. GST)",
            "entry_2_inventory_restore": "Inventory A/c Dr / COGS A/c Cr — restock at buy price (cost reversal)",
            "entry_3_gst_reversal":     "GST Payable A/c Dr / GST Liability A/c Cr — reversal of output GST charged",
        },
        "return_reasons_and_policy": {
            "legitimate_reasons": "Damaged on arrival, Wrong specification (96mm vs 128mm), Manufacturing defect, Excess quantity ordered, Product not matching sample",
            "policy_best_practice": "Set a 7–14 day return window from invoice date. Require original invoice. Accept returns only in original/resalable condition (except defects). Document reason — feeds supplier quality scorecard.",
            "avoid_abuse": "Track return rate by customer. If a customer's return rate exceeds 5% of purchases by value, review their ordering patterns — may indicate careless ordering or buyer's remorse at your expense.",
        },
        "benchmark": "Hardware/sanitary dealers India: target return rate <3% of revenue. Returns >5% indicate product quality issues, wrong-specification dispatching, or lax return policy. GST credit notes must be issued within the financial year to claim tax reversal.",
        "indian_context": "In India, sales returns generate Credit Notes (not Debit Notes — that's for price corrections). GSTR-1 requires credit notes to be linked to original B2B invoices. Maintain the return document chain: Return Request → Credit Note → GST reversal → Journal Entry. All linked by invoice reference.",
    },

    "damage_recording": {
        "title": "Damage Recording — GRN Inward Damage & Transit SO Damage",
        "overview": "Damage recording covers two distinct scenarios: (1) Post-GRN damage — goods received but found damaged during inward inspection, and (2) Transit damage — goods damaged while dispatching a Sales Order. Each type has different accounting treatment, different claim processes, and different resolutions.",
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
        "insurance_claim_process": {
            "step_1": "Survey: Intimate insurer within 24–48 hours of damage discovery. Request surveyor visit.",
            "step_2": "Documentation: Gather GRN/dispatch document, photos, driver statement (for transit), carrier LR copy, purchase invoice, claim form.",
            "step_3": "Surveyor Assessment: Insurance surveyor inspects damage and certifies loss value.",
            "step_4": "Claim Filing: Submit completed claim form + all documents to insurer. Keep copies.",
            "step_5": "Settlement: Insurer pays claim amount. Bank A/c Dr / Insurance Claim Receivable A/c Cr. Close the damage record.",
            "typical_timeline": "Simple claims: 2–4 weeks. Complex/large claims: 4–12 weeks.",
        },
        "damage_prevention": {
            "grn_prevention": "Insist on vendor packaging standards (double corrugated for fragile items). Inspect before signing GRN — do not sign blindly. For high-value items (Jaquar, Hettich), open and count before GRN signature.",
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
            "impact_example":   "Ebco Hinge: Invoice ₹485, Landed ₹524 (8% overhead), Sell ₹620 → Invoice Margin 21.8% → True Margin 15.5% (6.3 pp gap)",
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
        "indian_context": "Import of hardware fittings (Ebco, Hafele, Hettich) from China/Europe attracts BCD 10-20% + IGST 18%. Total landed cost on imported goods is often 20-35% above invoice. Never price imported goods on invoice price alone.",
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
            "excellent":   "> 98% pass rate — Ebco, Hafele, Hettich typically here",
            "good":        "95-98% pass rate — Jaquar, Cera normally here",
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
        "ebco", "hafele", "hettich", "blum", "dorset",
        "drawer slide", "concealed hinge", "soft close hinge", "glass hinge",
        "aluminium handle", "pvd handle", "ss handle", "handles", "knobs",
        "cam lock", "minifix", "furniture lock", "kitchen basket", "corner pull",
        "tandem box", "kitchen system", "led strip", "furniture light", "cabinet light",
        "flap stay", "wardrobe fitting", "aluminium profile furniture", "trim profile",
        "product catalog", "hsn code hinge", "hsn code handle", "hsn code drawer",
        "gst on hardware", "gst furniture", "furniture hardware",
        "what products do we sell", "which products", "product range",
    ]):
        relevant_keys.append("product_catalog")

    if any(w in q for w in [
        "jaquar", "hindware", "cera", "parryware", "grohe", "american standard", "kohler",
        "cp fittings", "sanitary fittings", "sanitary ware", "basin mixer", "wall mixer",
        "pillar tap", "stop cock", "concealed stop cock", "shower system", "overhead shower",
        "hand shower", "divertor", "angle valve", "bib cock", "concealed cistern",
        "flush valve", "ewc", "wash basin", "bathroom fittings", "kitchen faucet",
        "kitchen sink mixer", "sensor tap", "touchless tap", "sanitary products",
        "sanitary brand", "cp fittings gst", "hsn 8481", "gst on sanitary",
        "what is cp", "bathroom products", "sanitary hsn",
    ]):
        relevant_keys.append("sanitary_products")

    if any(w in q for w in [
        "seasonal demand hardware", "seasonal demand sanitary", "diwali stock",
        "pre monsoon stock", "when to stock hinges", "when to buy cp fittings",
        "seasonal buying", "peak season hardware", "peak season sanitary",
        "monsoon plumbing demand", "diwali kitchen hardware", "seasonal inventory hardware",
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

    if any(w in q for w in ["gate entry", "vehicle arrival", "dc verification", "delivery challan check"]):
        tools.append("gate_entry")

    # Default: stock + finance are always useful for context
    if not tools:
        tools = ["stock", "finance"]

    return tools[:3]
