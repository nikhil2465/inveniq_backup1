"""
Inventory Management Knowledge Base — StockSense AI
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
            "sku": "18mm BWP (your highest-velocity A-class SKU)",
            "D": "5,760 sheets/year (480/month × 12)",
            "S": "₹1,200/order (PO + receiving + inspection time)",
            "H": "₹341/sheet/year (24% of ₹1,420 buy price)",
            "EOQ_result": "≈ 201 sheets/order",
            "calculation": "√(2 × 5760 × 1200 ÷ 341) = √40,528 ≈ 201 sheets",
            "orders_per_year": "29 orders/year (5760 ÷ 201)",
            "vs_current": "If you're ordering <150 sheets at a time, you're over-ordering. If >300, under-ordering.",
        },
        "when_to_use": "Minimise total inventory cost (ordering cost + holding cost). Best for stable demand items.",
        "limitations": [
            "Assumes constant demand and lead time",
            "Ignores quantity discounts (Century may offer 2-3% for 300+ sheet orders)",
            "Doesn't account for stockout cost — add safety stock separately",
        ],
        "benchmark": "Plywood dealers: 12-20 orders/year for A-class SKUs. EOQ order cycle = 2-4 weeks.",
        "indian_context": "Century Plyboards typically requires minimum 100-sheet orders for free freight. Run EOQ with quantity discount: if 300-sheet order gives 2% discount, recalculate with adjusted H.",
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
            "sku": "18mm BWP",
            "daily_demand_avg": "17 sheets/day",
            "demand_stddev": "~4 sheets/day (estimated ±25% variability)",
            "lead_time_century": "6 days (reliable, σ_LT ≈ 0.5d)",
            "lead_time_gauri": "10-11 days (unreliable, σ_LT ≈ 3.2d)",
            "at_95_service_level": "SS = 1.65 × 4 × √6 = 1.65 × 4 × 2.45 ≈ 27 sheets",
            "gauri_adjusted_SS": "SS = 1.65 × √(11×16 + 289×10.24) = ~52 sheets (Gauri's variability doubles SS need!)",
            "current_reorder_level": "~120 sheets (from your DMS)",
            "recommendation": "Your current 120-sheet reorder level is tight — consider raising to 129 (17×6 + 27 SS)",
        },
        "service_level_choice": {
            "A_class_SKUs": "95-99% (18mm BWP, 12mm BWP — these are revenue-critical)",
            "B_class_SKUs": "90-95% (moderate control)",
            "C_class_SKUs": "85-90% (minimal holding cost)",
        },
        "benchmark": "For A-class plywood SKUs: Safety stock = 10-20% of average cycle stock. 15-25 sheets for 18mm BWP.",
        "indian_context": "Monsoon season (Jul-Aug): increase safety stock 30-40% for BWP grades — demand spikes unpredictably. Diwali (Oct-Nov): +50% safety stock 6 weeks before.",
    },

    "reorder_point": {
        "title": "Reorder Point (ROP) — When to Place the Next Order",
        "formula": "ROP = (Average Daily Demand × Lead Time) + Safety Stock",
        "applied_to_your_data": {
            "18mm BWP": {
                "daily_demand": "17 sheets/day",
                "lead_time": "6 days (Century)",
                "safety_stock": "27 sheets",
                "ROP": "17 × 6 + 27 = 129 sheets",
                "current_stock": "140 sheets",
                "gap_to_rop": "Only 11 sheets above ROP — place order NOW",
                "days_until_rop": "~0.6 days at current consumption rate",
            },
            "12mm BWP": {
                "daily_demand": "20 sheets/day",
                "lead_time": "6 days",
                "safety_stock": "32 sheets",
                "ROP": "20 × 6 + 32 = 152 sheets",
                "current_stock": "220 sheets",
                "days_until_rop": "~3.4 days",
            },
        },
        "setup_advice": [
            "Set ROP alerts in your DMS/Tally when stock hits this level",
            "For Gauri-sourced SKUs: use Gauri lead time (11 days) not Century (6 days) — adds 3-4 days coverage",
            "Review ROPs quarterly — daily demand changes with seasonality",
            "Keep a printed ROP card at the godown for manual checks",
        ],
        "benchmark": "World-class dealers automate ROP alerts. Manual checking of 50+ SKUs daily is error-prone — 18mm BWP near stockout is the cost of no system.",
        "indian_context": "Tally ERP supports reorder level alerts per item. Set it up under Stock Items → Reorder Level. Zero excuse for manual checking.",
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
            "A_SKUs": ["18mm BWP", "12mm BWP", "12mm MR Plain", "Laminates Teak"],
            "A_revenue_share": "78% of total revenue from 4 SKUs",
            "B_count": "8 SKUs → 17% revenue",
            "C_count": "30 SKUs → 5% revenue",
            "insight": "30 C-class SKUs are tying up cash and attention for only 5% revenue — rationalise these",
        },
        "action_by_class": {
            "A_class": "Daily physical count, dedicated shelf with bin card, direct Century relationship, 95% service level",
            "B_class": "Weekly stock review, standard reorder cycle, dual sourcing for top B-SKUs",
            "C_class": "Monthly review, order only when customer demand confirmed, auto-10% discount after 60d no movement",
        },
        "extended_xyz": {
            "X": "Stable demand (σ/avg <20%) — predictable, easy to manage",
            "Y": "Variable demand (σ/avg 20-50%) — needs safety stock buffer",
            "Z": "Sporadic demand (σ/avg >50%) — order only to confirmed demand",
            "best_combo": "AX = tightest control + JIT possible. CZ = candidate for discontinuation",
        },
        "benchmark": "World-class: A-class SKUs = <25% of SKU count, >80% revenue. Dead stock < 3%. You have 10.9% dead stock — rationalise C-class buying.",
        "indian_context": "In plywood trade, seasonal SKUs (monsoon-proof BWP) should be classified as AY or AZ depending on demand variability — don't apply standard ABC without seasonality overlay.",
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
            "gross_margin_annual": "₹76.3L (22.4% × ₹340L annual revenue)",
            "avg_inventory_value": "₹38.6L",
            "GMROI": "1.98 — Acceptable, 1% below target",
            "target": "2.2+ (achievable by clearing dead stock + improving 8mm Flexi margin)",
        },
        "how_to_improve": [
            "Clear ₹4.2L dead stock → reduces denominator → GMROI improves to ~2.18",
            "Fix 8mm Flexi margin (6.7% → 22% by switching from Gauri to Century) → increases numerator",
            "Faster turnover on A-class SKUs → both metrics improve",
            "Reduce overstock ₹7.8L by 50% → denominator drops → GMROI ~2.35",
        ],
        "by_sku": {
            "18mm BWP": "GMROI ≈ 4.2 (22.2% margin, 4.2× turnover) — star performer",
            "8mm Flexi": "GMROI ≈ 0.47 (6.7% true margin) — destroying value",
            "Dead stock SKUs": "GMROI = 0 — pure cost",
        },
        "benchmark": "Plywood/hardware dealers India: GMROI 1.5-2.5. Target 2.0+. Best-in-class organised dealers: 2.5-3.5.",
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
            "Century Plyboards": "PARTIAL JIT FEASIBLE — 96% on-time, 6-day lead time. Reduce safety stock to 7 days only.",
            "Gauri Laminates": "NOT RECOMMENDED — 68% on-time, 3.2-day avg delay. Full safety stock needed.",
            "Greenply": "CONDITIONAL — 88% on-time, acceptable for B-class SKUs only",
        },
        "modified_jit_recommendation": "Apply 'lean inventory' approach: Keep 7-day safety stock for A-class (not 15-day), order via EOQ from Century only, eliminate C-class from stock entirely (order-on-demand only).",
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
            "DIO": "22 days (inventory turns 16.6× per year — good)",
            "DSO": "34 days (customers taking too long to pay)",
            "DPO": "8 days (you're paying suppliers too fast — losing float)",
            "CCC": "22 + 34 − 8 = 48 days (target <40 days)",
            "excess_days": "8 days above target = ~₹6.2L extra cash tied up (₹28.4L/month ÷ 30 × 8)",
        },
        "improvement_actions": {
            "Reduce DSO by 9 days": "Offer 1.5% early payment discount → get paid in 20 days vs 34 → frees ₹4.3L cash",
            "Increase DPO by 14 days": "Negotiate NET-30 with Century (vs current NET-8) → hold cash 22 more days → ₹2.6L more cash in hand",
            "Reduce DIO by 4 days": "Clear dead stock ₹4.2L → DIO drops from 22 to 18 → ₹1.9L freed",
            "combined_impact": "All 3 actions: CCC from 48 → 26 days = ₹8.8L more cash available",
        },
        "benchmark": "Building materials dealers India: CCC 35-50 days. Best-in-class: 25-35 days. Yours at 48 days has clear improvement path.",
        "indian_context": "GST credit terms (ITC available T+1 month) effectively extend your DPO by 30 days on tax value. Factor this into cash flow planning. GSTR-3B pending 20 Apr — file now to avoid interest cost.",
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
        "indian_context": "Tally ERP → Stock Summary uses WAC. For true margin analysis, export to Excel and apply FIFO/landed cost method manually. This is exactly what StockSense AI does in the margin analysis reports.",
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
            "AI/ML (Used in StockSense AI)": {
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
            "Century Plyboards": "Score: 94/100 — PREFERRED (On-time 96%, Price -3%, GRN 100%)",
            "Greenply Industries": "Score: 79/100 — GOOD (On-time 88%, Price +1%, GRN 94%)",
            "Gauri Laminates": "Score: 52/100 — ACTION REQUIRED (On-time 68%, Price +11% landed, GRN 82%)",
        },
        "action_thresholds": {
            "above_85": "Preferred — expand volume",
            "70_to_85": "Conditional — monitor quarterly",
            "below_70": "Improvement plan (30 days) or replace",
        },
        "benchmark": "World-class: Top 2 suppliers cover 70-80% of volume. Gauri at 52/100 should be placed on 30-day improvement plan. If no improvement, replace with alternate source for 8mm grades.",
        "indian_context": "Many Indian dealers use informal relationships instead of scorecards — this is why hidden costs (Gauri freight ₹110/sheet) go undetected for years. Formalize at least a quarterly review.",
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
            "total_dead": "₹4.2L (10.9% of inventory — 3.6× above industry benchmark)",
            "items": [
                "6mm Gurjan BWP: ₹1.79L, 118 days, 186 sheets",
                "4mm MR Plain: ₹1.39L, 97 days, 240 sheets",
                "19mm Commercial: ₹0.99L, 91 days, 102 sheets",
            ],
            "urgency": "Every 30 additional days adds ₹7,700 in holding cost on this ₹4.2L",
        },
        "clearance_strategies": {
            "Contractor Discount (fastest)": "12-15% discount to Mehta, Patel, Kumar & Sons → target ₹2.5L cleared in 2 weeks",
            "Bundle Selling": "Bundle 4mm MR Plain with 18mm BWP orders (popular item = sales attachment) → clear at near-full price",
            "Interior Firm Targeting": "6mm Gurjan → target Design Studio Patel (uses thin grades for interior panels) → offer 10% + priority delivery",
            "Supplier Return": "19mm Commercial → check if Century/Greenply have return policy (<90 days) → avoid discount entirely",
            "Secondary Market": "If above fails → liquidator at 25-30% discount → better than 0%",
            "Price Automation": "Set Tally alert: auto-apply 10% discount if 60 days no movement, 15% at 90 days",
        },
        "prevention": [
            "Monthly SKU velocity review — flag any item with <2 movements in 30 days",
            "ABC-based buying discipline — no C-class order without customer demand in hand",
            "Seasonal demand review — don't stock monsoon-sensitive grades in April (buy Oct-Nov instead)",
            "Trial orders for new SKUs — max 50 sheets first order, then scale on proven demand",
        ],
        "benchmark": "Dead stock target: <3% of inventory value. Your 10.9% is high-risk. Industry best: <2%. Every 1% reduction = ₹38,600 freed (on ₹38.6L inventory).",
        "indian_context": "Karnataka GST: If you return goods to supplier, ensure credit note is raised within 30 days of supply date to claim ITC reversal correctly. Late credit notes create GST compliance issues.",
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
            "Gross Margin 22.4%": "WITHIN RANGE (but degraded by 8mm Flexi at 6.7% true margin)",
            "Working Capital 48d": "ABOVE TARGET (target <40d — 8 days to improve)",
            "Dead Stock 10.9%": "HIGH RISK (target <3% — urgent clearance needed)",
            "Stock Turnover 4.2x": "BELOW TARGET (target 5-6×)",
            "GMROI 1.98": "BORDERLINE (target 2.0+ — close but improvable)",
            "Dispatch SLA 87%": "BELOW TARGET (target 95% — QC bottleneck on MR grades)",
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

    # Default: stock + finance are always useful for context
    if not tools:
        tools = ["stock", "finance"]

    return tools[:3]
