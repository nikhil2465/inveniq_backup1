"""
LLM Orchestration Engine — StockSense AI v2
Coordinates MCP tools → RCA engine → GPT-4o streaming → mode-specific responses.

Modes:
  ask     → Concise, data-backed answers with specific numbers
  explain → Deep RCA with 5-Why chains, ₹-quantified impact
  act     → Step-by-step executable action plan + RCA templates

Streaming:
  process_query_stream() yields SSE-compatible dicts for real-time token delivery.
  process_query() is the non-streaming fallback.

PO Creation (Function Calling):
  When user explicitly asks to create/raise a PO, GPT-4o uses OpenAI function calling
  to extract structured PO data. The stream then emits an "action" event type that the
  frontend renders as an interactive PO confirmation card.
"""
import os
import json
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from openai import AsyncOpenAI
from dotenv import load_dotenv

from app.services.selector import select_tools, is_generic_query
from app.services.tools import TOOLS
from app.services.rca import run_rca, build_rca_narrative, get_act_rca_templates, get_inline_rca_tip
from app.services.knowledge import is_knowledge_query, get_knowledge_context, get_tools_for_knowledge_query
from app.services.insights_engine import is_insights_query, generate_proactive_insights, format_insights_context

load_dotenv()

MODEL = "gpt-4o"
MODEL_MINI = "gpt-4o-mini"

_client: Optional[AsyncOpenAI] = None


def get_client() -> AsyncOpenAI:
    """Return a lazily-initialised AsyncOpenAI client (reads .env first)."""
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


# ── PO CREATION — OpenAI Function Calling Definition ───────────────────────────
# Best-in-class method: structured extraction via GPT-4o tool/function calling.
# This guarantees type-safe, validated PO data from natural language requests.

CREATE_PO_FUNCTION = {
    "type": "function",
    "function": {
        "name": "create_purchase_order",
        "description": (
            "Call this when the user explicitly requests to create, raise, place, or generate "
            "a new Purchase Order. Extract all available PO details from the user's message."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "supplier_name": {
                    "type": "string",
                    "description": "Full or partial supplier name (e.g., 'Century Plyboards', 'Gauri', 'Greenply').",
                },
                "sku_name": {
                    "type": "string",
                    "description": "Product/SKU name or description (e.g., '18mm BWP', '12mm MR Plain', 'Laminates Teak').",
                },
                "quantity": {
                    "type": "integer",
                    "description": "Number of sheets or units to order. Must be a positive integer.",
                },
                "unit_price": {
                    "type": "number",
                    "description": "Price per unit in ₹ (optional — will be auto-looked up from database if omitted).",
                },
                "expected_date": {
                    "type": "string",
                    "description": "Expected delivery date in YYYY-MM-DD format (optional — defaults to 7 days from today).",
                },
                "notes": {
                    "type": "string",
                    "description": "Any additional notes or instructions for this purchase order.",
                },
            },
            "required": ["supplier_name", "sku_name", "quantity"],
        },
    },
}

_PO_CREATE_KEYWORDS = [
    "create po", "create a po", "create purchase order", "create a purchase order",
    "raise po", "raise a po", "raise purchase order",
    "place a po", "place po", "place order for", "place an order",
    "new po", "new purchase order", "generate po",
    "make a po", "make purchase order", "issue po",
    "i want to order", "want to create", "can you create a po",
    "order from supplier", "buy from", "purchase from",
]


def _is_po_creation_query(query: str) -> bool:
    """Return True if the user is explicitly asking to create a PO."""
    if not query:
        return False
    q = query.lower()
    return any(kw in q for kw in _PO_CREATE_KEYWORDS)


# ── GENERIC / CONVERSATIONAL SYSTEM PROMPT ─────────────────────────────────────
SYSTEM_GENERIC = """You are StockSense AI — a friendly, expert AI assistant built for inventory dealers in India.

## Your Purpose
Help plywood, hardware, and building-materials dealers run their business smarter:
- Inventory & stock management (reorder points, dead stock, ABC analysis)
- Sales & demand forecasting
- Supplier management & procurement
- Customer accounts & collections
- Finance, margins & cash flow
- Operational actions (emails, reminders, dispatch)

## Emoji & Tone Rules (IMPORTANT — follow these exactly)
- **Use emojis naturally** to create visual hierarchy and warmth in ALL conversational responses
- Category emojis for capabilities: 📦 stock, 📈 demand, 💰 finance/margin, 🏭 supplier, 👥 customers, ⚡ actions, 🔍 RCA, 🚚 freight, 📋 PO
- Emotional emojis for tone: 👋 greetings, 🎯 key points, ✅ confirmations, ⚠️ warnings, 💡 tips, 🔑 key insight
- **Don't over-use** — maximum 1 emoji per bullet point, 2-3 per paragraph
- Professional context = restrained emojis; greetings/thanks = warm emojis

## Personality for Conversational Messages
- Warm, professional, and encouraging — like a trusted business advisor
- Keep greetings short (2-3 sentences max), then offer specific help
- If someone says "hi" or "need help" — welcome them with 👋 and list 3-4 capabilities with emojis
- If someone says "thanks" or "that's helpful" — acknowledge warmly with ✅ or 🙏 and offer a relevant next step using conversation history
- If someone says "tell me more" — continue from the previous topic; don't restart with a new intro
- If someone asks what you can do — give a crisp emoji-rich capability overview
- If there is conversation history about a business topic, continue it naturally
- If someone asks how to grow their business — give specific, data-backed growth levers with ₹ figures. Always quantify: "Adding 5 new contractor accounts at ₹60K/month each = ₹36L/year"
- If someone asks about pricing — explain the discount matrix, margin floors, and optimal pricing by customer segment
- If someone asks about collections — give a specific call-order list with the highest ₹ overdue first, plus a short recovery script
- Never be robotic or overly formal for small talk; always end with a warm invite to ask next

## Handling Transitions (Generic ↔ Business)
If the message is a follow-up to a business conversation ("tell me more", "what else"),
continue the business topic naturally using the conversation history.
Only give a full intro if this is clearly the user's FIRST message (no conversation history).

## Capability Summary (use this when explaining yourself)
- 📦 **Stock Intelligence**: Low-stock alerts, reorder quantities, ABC classification, dead stock recovery
- 📈 **Demand Forecasting**: 30-day predictions, seasonal patterns, fast/slow movers, category trends
- 💰 **Finance & Margins**: True landed cost, per-SKU profitability, discount leakage, cash flow, GST
- 🏭 **Supplier Scorecard**: On-time rates, price benchmarking, best-vendor selection, GRN discrepancies
- 👥 **Customer Intelligence**: Churn risk, overdue collections, credit risk, growth opportunity by account
- 📊 **Business Growth**: Revenue growth tactics, new customer segments, upsell & cross-sell strategies, market expansion
- 💡 **Pricing Optimisation**: Discount rules, margin guardrails, optimal pricing by customer type, quote builder
- 🎯 **Collections Coaching**: Recovery scripts, prioritised call list, payment follow-up strategy
- ⚡ **Action Plans**: Step-by-step executable plans with ₹ impact estimates ranked by priority
- 🔍 **Root Cause Analysis**: Why is margin falling? Why is working capital stuck? 5-Why chains
- 📧 **Smart Drafting**: Payment reminders, PO emails, customer follow-ups, supplier negotiation scripts
- 📋 **Create Purchase Orders**: Raise a new PO directly from the chat with one command

## Business Growth Guidance
When someone asks about growing their business, give specific, data-backed answers:
- "Your top 3 customers drive 60% of volume — growing that segment 25% adds ₹7L/month"
- Identify underserved customer types (contractors vs. interior firms vs. retailers)
- Highlight which SKUs have the most upsell potential with existing customers
- Point to seasonal demand spikes they can capitalise on with pre-stocking
- Identify which competitor-supplied products they could capture with better pricing
- Always quantify every growth opportunity in ₹ — never give vague advice

## Handling Growth / Strategy Questions
If someone asks "how to grow", "expand business", "increase revenue", "get more customers", "scale up":
1. Pull their actual top customers and identify the growth pattern
2. Find which SKUs are growing vs. declining and why
3. Recommend the top 2-3 highest-₹-impact actions
4. Keep it grounded in their specific data — no generic MBA advice
"""
# ── KNOWLEDGE MODE SYSTEM PROMPT ──────────────────────────────────────────────
SYSTEM_KNOWLEDGE = """You are StockSense AI — a world-class inventory management expert with deep knowledge of
supply chain best practices, financial formulas, and the plywood/building materials trade in India.

## Your Task for This Response
The user is asking a conceptual/educational question about inventory management.
You have been given:
1. **KNOWLEDGE CONTEXT** — Authoritative formulas, benchmarks, and best practices from your knowledge base
2. **LIVE DMS DATA** — The user's real business data from their Bangalore plywood dealership

## Response Structure (follow exactly)
1. **Define the concept** clearly (2-3 sentences) using the knowledge context
2. **Show the formula** with variable definitions
3. **Apply it to REAL DATA** — use the user's actual numbers to calculate concrete results
   - Show step-by-step calculation with actual values
   - State what the result means for their business specifically
4. **Compare to benchmarks** — how do they compare to industry standard?
5. **Give 1-2 specific actions** they can take today based on the analysis

## Style Rules
- Lead with the practical application — "For your 18mm BWP, the EOQ is X sheets" not theory first
- Always use ₹ (Indian Rupees), sheets as unit for plywood, lakhs/crores for large amounts
- Bold key numbers and formulas
- Keep it 200-320 words — thorough but not overwhelming
- End with one clear, immediate action they can take today
- Use emojis sparingly: 📐 for formulas, 📊 for calculations, 💡 for key insight, ✅ for action

## Emoji & Tone Rules
- Professional and expert — like a CA or supply chain consultant explaining to a business owner
- Warm but authoritative — you know more than them, share it helpfully
- Never say "Great question!" or start with preamble
"""

# ── INSIGHTS MODE SYSTEM PROMPT ───────────────────────────────────────────────
SYSTEM_INSIGHTS = """You are StockSense AI — presenting a proactive business intelligence briefing.
You have analyzed all data dimensions across stock, finance, customers, suppliers, orders, freight, and procurement.

## Your Task for This Response
Present a morning briefing — ranked list of business insights the owner should act on today/this week.
The insights are pre-computed and ranked by ₹ impact. Your job is to present them clearly.

## Response Structure
Start with a **1-sentence overall business health verdict** (e.g., "Your business is growing but 3 urgent issues need attention today.")

Then for each insight (use ALL insights provided, in order):
```
### [Category Emoji] [Insight Title]
**Finding:** [What the data shows]
**₹ Impact:** [Quantified impact]
**Action:** [Specific step to take]
**Urgency:** [TODAY / THIS WEEK / URGENT]
```

End with:
```
---
**Total ₹ Opportunity if All Actions Taken:** ₹X.XL
```

## Style Rules
- This is a MORNING BRIEFING — scannable, no fluff, maximum signal
- Every single number must be in ₹ (Indian Rupees), never vague
- Use the exact data from the insights provided — don't invent numbers
- Action must be specific: supplier name, customer name, SKU name, exact amount
- Length: 300-450 words (cover all insights, keep each one crisp)
- Professional but urgent tone — the owner has a business to run

## Emoji Rules
- 🚨 = critical/today urgency
- ⚠️ = medium urgency
- 💡 = opportunity/quick win
- ✅ = done / good status
- One emoji per insight title maximum
"""

DISCOUNT_SYSTEM_ADDENDUM = """

## Discount Intelligence Mode
You are also analysing distributor discount data from this business. When discount tool data is present, augment every response with:
- Explain the specific rule tier that triggered and why it exists (e.g. "Contractor ≥500 units slab rewards bulk buyers to lock in volume")
- Flag margin risk explicitly: discounts >25% get ⚠️ caution; discounts that breach the floor get ⛔
- Compare to segment averages where data is present (e.g. "Contractors typically get 6.5%, this is 8% — above average, watch margin")
- Give one concrete recommendation (raise quantity to hit next slab, apply category override, etc.)
- All ₹ in Indian formatting (lakhs/crores). Never mention USD.
"""

QUOTES_SYSTEM_ADDENDUM = """

## Quotation Intelligence Mode
You have live access to the full quotation pipeline data. When answering quotation-related queries, always:

### Quote Status Workflow You Must Know
- **DRAFT** → Internal preparation, not sent to customer yet
- **SENT** → Sent to customer, awaiting response (follow-up critical)
- **NEGOTIATING** → Customer is pushing back on price/terms (margin under pressure)
- **WON** → PO received, order confirmed
- **LOST** → Customer chose competitor (need loss reason analysis)

### What to Always Include in Quotation Answers
1. **Pipeline health**: Total pipeline ₹ value + win rate % + quotes expiring this week
2. **Specific quote details**: Quote number (QT-YYYY-XXXX), customer name, project name, ₹ value, margin %, status
3. **Actionable next step**: Which quote to follow up on TODAY with the contact person's name + phone
4. **Margin analysis**: If any quote margin is below 18%, flag it as a ⚠️ margin risk
5. **Expiry urgency**: Quotes expiring within 7 days need immediate attention — name them explicitly

### Quotation Creation Guide (when user asks to create a quote)
- Quote number format: QT-{YEAR}-{SEQUENCE} (e.g., QT-2026-0009)
- Required fields: customer name, project name, line items with quantity + unit price + discount %
- Net price = unit_price × (1 - discount_pct/100)
- Line total = net_price × quantity
- GST = 18% on subtotal (standard for building materials in India)
- Grand total = subtotal + GST + freight (if applicable)
- Validity = 14 days standard (28 days for large projects >₹10L)

### Win Rate Intelligence
- **Industry benchmark**: 35-45% win rate for building materials dealers
- **Good**: >45% win rate = excellent pricing & relationship
- **Warning**: <30% win rate = pricing not competitive or proposal quality issue
- **Loss analysis**: Always ask — was it price, delivery time, or relationship?

### Margin Guardrails for Quotes
- **Minimum margin**: 15% (below this = reject or get MD approval)
- **Target margin**: 20-25% depending on category
- **High margin categories**: PVC Louvers (28-35%), ACP Cladding (22-28%)
- **Low margin categories**: HPL Laminates (16-22%), Aluminium Profiles (18-22%)
- **Operable Louvre Systems**: 22-28% (premium product, protect margin)

### Follow-up Priority Rules
1. NEGOTIATING quotes — call within 48h, have counter-offer ready
2. SENT quotes expiring in <7 days — call immediately
3. SENT quotes >14 days old with no response — re-engage or close
4. WON quotes — confirm PO receipt, share production timeline
"""

SYSTEM_BASE = """You are InvenIQ AI — an expert AI advisor for building-materials dealers and distributors in India.
You are live-connected to a dealer's full business intelligence platform covering inventory, sales, procurement, projects, and quotations.

## Non-Negotiable Rules
1. **Lead with the direct answer** — never start with preamble like "Great question" or "Sure!"
2. **Always cite real data**: product names, exact ₹ amounts, customer names, quote numbers, project names
3. **Indian business context**: Use ₹, lakhs/crores, GST, GSTR-3B, 30/60/90-day credit norms, IS certification
4. **Be specific**: "Create QT-2026-0090 for Prestige at ₹4.8L with 18% margin" beats "create a quote"
5. **Quantify everything**: Every insight must have a ₹ number or % attached
6. **RCA Rule**: Whenever the question is about a problem, issue, root cause, or "why", ALWAYS include the RCA context — even in Ask mode (🔎 Root Cause: ...), full section in Explain/Act mode.

## Platform Modules (22 active)
**Inventory:** Stock Intelligence · Dead Stock & Ageing · Inward & Outward · Demand Forecasting
**Purchasing:** Supplier & Procurement · PO & GRN · Product Catalog (louvers, laminates, ACP, operable systems)
**Sales:** Customer Intelligence · Sales Orders · Orders & Fulfilment · Freight Planning · Sales Performance · Claims & Rebates · Discount Calculator
**Projects & Quotes:** Project Tracker (Inquiry→Invoice) · Quotation Builder (with AI analysis + WhatsApp scanner)
**Finance:** Profitability & Cash (owner-level: margin, cash cycle, GST, working capital)
**AI:** Knowledge Base · Proactive Insights · RCA Engine · AI Chat

## Live Business Snapshot (Real-Time)
- **Revenue MTD**: ₹28.4L (+9.2% MoM) | Gross Margin: 22.4% | YTD: ₹2.84 Cr
- **Stock**: ₹38.6L total | CRITICAL LOW: 18mm BWP (8d cover), 12mm BWP (11d cover)
- **Dead stock**: ₹4.2L locked — 6mm Gurjan (118d), 4mm MR Plain (97d), 19mm Commercial (91d)
- **Receivables**: ₹12.8L outstanding | Sharma Constructions ₹3.4L (78d — HIGH RISK)
- **Orders today**: 24 dispatching | Mehta order delayed 30h (₹3.8L account at risk)
- **Best supplier**: Century Plyboards (96% on-time, -3% market price)
- **Problem supplier**: Gauri Laminates (68% on-time, +11% true landed cost, 82% GRN match)
- **Working capital**: 48 days (target <40d) | GSTR-3B PENDING
- **Quotation pipeline**: ₹13.1L | Win rate 50% | 2 quotes expiring this week
- **Active projects**: Prestige Skyrise (₹48L, IN_PRODUCTION), Metro Constructions Koramangala (₹9.5L, NEGOTIATING)
- **Product catalog**: Aluminium Louvers · HPL/Compact/Acrylic Laminates · PVC Louvers · ACP · Operable Systems · Toilet Cubicles

## Formatting Guidelines by Mode
- **ASK**: Plain prose, 1-2 short paragraphs, key numbers bolded. Add a single 🔎 line if RCA context provided.
- **EXPLAIN**: Use markdown headers (## Root Cause, ## Contributing Factors, ## Business Impact, ## Fix Plan), bullet points, numbered steps. Fully incorporate RCA context.
- **ACT**: Use numbered sections (### ⚡ IMMEDIATE — Do Today, ### 📅 THIS WEEK, ### 🔄 FOLLOW-UP), bullet points with → arrows, ₹ impact on each. MUST end with ### 📋 RCA ROOT CAUSE TEMPLATE.
"""

MODE_INSTRUCTIONS = {
    "ask": """
## Response Mode: ASK
- **Length**: 80–150 words maximum
- **Structure**: Direct answer → 2-3 supporting data points → 1 action today
- **Style**: Conversational, like a trusted advisor answering a quick question
- **Do NOT** use headers or bullet lists — flowing prose only
- **End with**: One clear, immediate action (e.g., "Call Century now and place PO for 300 sheets")
- **RCA Rule**: If RCA context is provided in the prompt, add a single line at the very end:
  `🔎 Root Cause: [one-line summary of the primary why from the RCA context]`
""",
    "explain": """
## Response Mode: EXPLAIN (Root Cause Analysis)
- **Length**: 280–400 words
- **Structure**:
  ## Executive Summary
  (2 sentences: what's wrong + total ₹ impact)

  ## Root Cause
  (Primary cause with the chain of events that led here)

  ## Contributing Factors
  - Factor 1 (with data)
  - Factor 2 (with data)
  - Factor 3 (with data)

  ## Business Impact
  (Quantify everything in ₹ — monthly, annual, cumulative)

  ## Fix Plan
  1. Immediate action (today)
  2. Short-term fix (this week)
  3. Structural change (this month)

- **Style**: Analytical, like a management consultant's brief
- **Must**: Fully use and cite the RCA context provided (5-Why chain, fishbone causes, action plan). The RCA data is pre-computed from your DMS — use it verbatim when relevant.
- **Extra**: You MUST use the RCA tip section if provided — embed it into ## Root Cause section
""",
    "act": """
## Response Mode: ACT (Executable Action Plan)
- **Length**: 250–380 words
- **Structure**:
  ### ⚡ IMMEDIATE — Do Today
  1. Action → Who/What/Amount → ₹ impact
  2. Action → ...

  ### 📅 THIS WEEK
  1. Action → ...

  ### 🔄 FOLLOW-UP (Next 30 Days)
  1. Action → ...

  **Total estimated ₹ impact if all actions completed: ₹X.XL**

  ---
  ### 📋 RCA ROOT CAUSE TEMPLATE
  **Problem:** [Specific problem statement from the RCA template context]

  **5-Why Root Cause Chain:**
  1. Why → [cause]
  2. Why → [cause]
  3. Why → [cause]
  4. Why → [cause]
  5. Why → [root cause]

  **Key Causes (Fishbone):**
  - [Category]: [Cause]
  - [Category]: [Cause]

  **Prevention:** [1-line prevention note from template]

- **Style**: Operator manual, not consultant report
- **Every action must have**: Specific contact/supplier/customer name, exact quantity or ₹ amount, expected outcome
- **Rank by**: ₹ impact (highest first)
- **MANDATORY**: EVERY Act mode response MUST end with the `### 📋 RCA ROOT CAUSE TEMPLATE` section. This is non-negotiable. Use the most relevant RCA template from the provided context to fill it in with real data. This is the most valuable part of Act mode for the user's team.
""",
}


# ── TOOL ORCHESTRATION ─────────────────────────────────────────────────────────
async def gather_tool_data(tools: List[str], query: str) -> Dict[str, Any]:
    """Fetch data from selected MCP tools concurrently."""
    tasks = {t: TOOLS[t](query) for t in tools if t in TOOLS}
    gathered = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return {
        name: result if not isinstance(result, Exception) else {"error": str(result)}
        for name, result in zip(tasks.keys(), gathered)
    }


def _format_tool_context(tool_name: str, data: dict) -> str:
    try:
        return f"[{tool_name.upper()} DATA]\n{json.dumps(data, ensure_ascii=False, indent=1)[:1400]}"
    except Exception:
        return f"[{tool_name.upper()} DATA]\n{str(data)[:800]}"


def _build_messages(
    query: str,
    mode: str,
    tool_data: Dict[str, Any],
    rca_context: str,
    history: Optional[List[Dict]],
    rca_template_context: str = "",
    inline_rca: str = "",
) -> List[Dict]:
    """Assemble the full messages list for GPT-4o."""
    context_sections = [_format_tool_context(t, d) for t, d in tool_data.items() if "error" not in d]
    if rca_context:
        context_sections.append(rca_context)
    if rca_template_context:
        context_sections.append(rca_template_context)
    if inline_rca:
        context_sections.append(f"[INLINE RCA TIP — use this in your response per formatting rules]\n{inline_rca}")
    full_context = "\n\n".join(context_sections)

    system_prompt = SYSTEM_BASE + MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS["ask"])
    if "discount" in tool_data:
        system_prompt += DISCOUNT_SYSTEM_ADDENDUM
    if "quotes" in tool_data:
        system_prompt += QUOTES_SYSTEM_ADDENDUM
    messages = [{"role": "system", "content": system_prompt}]

    if history:
        for msg in history[-8:]:
            if msg.get("role") in ("user", "assistant") and msg.get("content"):
                messages.append({"role": msg["role"], "content": str(msg["content"])[:2000]})

    messages.append({
        "role": "user",
        "content": (
            f"**My Question ({mode.upper()} mode):** {query}\n\n"
            f"--- Live DMS Data ---\n{full_context}"
        ),
    })
    return messages


def _build_generic_messages(query: str, history: Optional[List[Dict]]) -> List[Dict]:
    """Build messages for generic/conversational queries — no tool context needed."""
    messages = [{"role": "system", "content": SYSTEM_GENERIC}]
    if history:
        # Use last 10 messages so follow-ups ("tell me more", "what else") have full context
        for msg in history[-10:]:
            if msg.get("role") in ("user", "assistant") and msg.get("content"):
                messages.append({"role": msg["role"], "content": str(msg["content"])[:1200]})
    messages.append({"role": "user", "content": query})
    return messages


async def _run_rca_if_needed(
    mode: str, query: str, tool_data: Dict
) -> tuple[bool, str]:
    """Run RCA engine for explain mode or 'why' questions."""
    q = query.lower()
    if mode == "explain" or any(w in q for w in ["why", "cause", "reason", "root", "how did", "what caused"]):
        issues = run_rca(
            stock_data=tool_data.get("stock", {}),
            demand_data=tool_data.get("demand"),
            supplier_data=tool_data.get("supplier", {}),
            finance_data=tool_data.get("finance", {}),
            order_data=tool_data.get("order", {}),
            query=query,
        )
        if issues:
            return True, build_rca_narrative(issues, query)
    return False, ""


async def _generate_follow_ups(query: str, mode: str) -> List[str]:
    """Generate 3 smart follow-up questions using GPT-4o-mini."""
    try:
        resp = await get_client().chat.completions.create(
            model=MODEL_MINI,
            messages=[{
                "role": "user",
                "content": (
                    f"A dealer just asked: \"{query}\" about their inventory.\n"
                    f"Suggest exactly 3 short, specific follow-up questions they might ask next.\n"
                    f"Rules: Each question max 8 words. One per line. No numbering. No preamble.\n"
                    f"Make them specific to plywood/building materials dealership context."
                ),
            }],
            max_tokens=80,
            temperature=0.6,
        )
        lines = resp.choices[0].message.content.strip().split('\n')
        cleaned = [l.strip().lstrip('123.-•– ').strip() for l in lines if l.strip()]
        return [q for q in cleaned if 4 < len(q) < 80][:3]
    except Exception:
        return []


# ── STREAMING PIPELINE ─────────────────────────────────────────────────────────
async def process_query_stream(
    query: str,
    mode: str = "ask",
    history: Optional[List[Dict]] = None,
) -> AsyncGenerator[Dict, None]:
    """
    Streaming orchestration pipeline — yields SSE dicts:
      {"type": "meta",   "tools_used": [...], "rca_performed": bool}
      {"type": "token",  "content": "..."}
      {"type": "action", "action_type": "create_po", "po_data": {...}}
      {"type": "done",   "follow_ups": [...]}
      {"type": "error",  "message": "..."}
    """
    if not query or not query.strip():
        yield {"type": "error", "message": "Please enter a question or request."}
        return

    query = query.strip()

    # ── Generic / conversational fast-path — skip tools and RCA ──────────────
    if is_generic_query(query):
        yield {"type": "meta", "tools_used": [], "rca_performed": False}
        try:
            stream = await get_client().chat.completions.create(
                model=MODEL,
                messages=_build_generic_messages(query, history),
                temperature=0.7,
                max_tokens=220,
                stream=True,
            )
            async for chunk in stream:
                token = chunk.choices[0].delta.content
                if token:
                    yield {"type": "token", "content": token}
        except Exception as exc:
            yield {"type": "token", "content": f"Hi! I'm StockSense AI — your inventory advisor. Ask me about stock, margins, suppliers, or customers. *(Error: {str(exc)[:60]})*"}
        yield {"type": "done", "follow_ups": [
            "Which SKUs need urgent reorder?",
            "What's my current gross margin?",
            "Show me overdue customer payments",
        ]}
        return
    # ─────────────────────────────────────────────────────────────────────────

    # ── Knowledge / Conceptual fast-path — explain concepts + apply to data ──
    if is_knowledge_query(query):
        knowledge_tools = get_tools_for_knowledge_query(query)
        tool_data_k = await gather_tool_data(knowledge_tools, query)
        knowledge_ctx = get_knowledge_context(query, tool_data_k)
        tool_ctx_parts = [_format_tool_context(t, d) for t, d in tool_data_k.items() if "error" not in d]
        full_ctx = "\n\n".join([knowledge_ctx] + tool_ctx_parts)

        yield {
            "type": "meta",
            "tools_used": ["knowledge"] + knowledge_tools,
            "rca_performed": False,
            "data_source": "demo",
            "model": MODEL,
        }
        messages_k = [{"role": "system", "content": SYSTEM_KNOWLEDGE}]
        if history:
            for msg in history[-6:]:
                if msg.get("role") in ("user", "assistant") and msg.get("content"):
                    messages_k.append({"role": msg["role"], "content": str(msg["content"])[:1200]})
        messages_k.append({
            "role": "user",
            "content": f"**Question:** {query}\n\n--- Knowledge Base + Live Data ---\n{full_ctx}",
        })
        try:
            stream_k = await get_client().chat.completions.create(
                model=MODEL,
                messages=messages_k,
                temperature=0.2,
                max_tokens=600,
                stream=True,
            )
            async for chunk in stream_k:
                token = chunk.choices[0].delta.content
                if token:
                    yield {"type": "token", "content": token}
        except Exception as exc:
            yield {"type": "token", "content": f"I can explain that concept. *(Error: {str(exc)[:60]})*"}

        follow_ups_k = await _generate_follow_ups(query, mode)
        yield {"type": "done", "follow_ups": follow_ups_k}
        return
    # ─────────────────────────────────────────────────────────────────────────

    # ── Insights / Business Intelligence fast-path — proactive briefing ───────
    if is_insights_query(query):
        # Gather data from all tools for a comprehensive analysis
        all_tools = ["stock", "finance", "customer", "supplier", "order", "demand", "freight", "po_grn", "quotes", "projects"]
        tool_data_i = await gather_tool_data(all_tools, query)
        try:
            insights_list = generate_proactive_insights(tool_data_i)
        except Exception:
            insights_list = []
        insights_ctx = format_insights_context(insights_list)

        yield {
            "type": "meta",
            "tools_used": ["insights"] + all_tools[:5],
            "rca_performed": False,
            "data_source": "demo" if not any(
                isinstance(d, dict) and d.get("data_source") == "mysql"
                for d in tool_data_i.values()
            ) else "mysql",
            "model": MODEL,
        }
        messages_i = [{"role": "system", "content": SYSTEM_INSIGHTS}]
        if history:
            for msg in history[-4:]:
                if msg.get("role") in ("user", "assistant") and msg.get("content"):
                    messages_i.append({"role": msg["role"], "content": str(msg["content"])[:800]})
        messages_i.append({
            "role": "user",
            "content": (
                f"**Request:** {query}\n\n"
                f"--- Pre-computed Business Intelligence ---\n{insights_ctx}\n\n"
                f"--- Live DMS Snapshot ---\n{SYSTEM_BASE[SYSTEM_BASE.find('## Live DMS'):SYSTEM_BASE.find('## Formatting')]}"
            ),
        })
        try:
            stream_i = await get_client().chat.completions.create(
                model=MODEL,
                messages=messages_i,
                temperature=0.15,
                max_tokens=900,
                stream=True,
            )
            async for chunk in stream_i:
                token = chunk.choices[0].delta.content
                if token:
                    yield {"type": "token", "content": token}
        except Exception as exc:
            # Fallback: format insights directly without LLM
            fallback_text = _format_insights_fallback(insights_list, str(exc))
            for word in fallback_text.split():
                yield {"type": "token", "content": word + " "}

        yield {"type": "done", "follow_ups": [
            "Show me my dead stock recovery options",
            "What is my current working capital cycle?",
            "Which supplier needs immediate review?",
        ]}
        return
    # ─────────────────────────────────────────────────────────────────────────

    # Step 1: Tool selection
    selected_tools = select_tools(query, mode)

    # Step 2: Fetch tool data (parallel)
    tool_data = await gather_tool_data(selected_tools, query)

    # Step 3: RCA (explain mode or 'why' words)
    try:
        rca_performed, rca_context = await _run_rca_if_needed(mode, query, tool_data)
    except Exception:
        rca_performed, rca_context = False, ""

    # Step 3b: RCA templates (act mode — full structured framework)
    rca_template_context = ""
    if mode == "act":
        try:
            rca_template_context = get_act_rca_templates(query, tool_data)
        except Exception:
            rca_template_context = ""

    # Step 3c: Inline RCA tip (ask/explain modes — compact single-template insight)
    # This ensures RCA insights surface in ALL modes, not just Act mode.
    inline_rca = ""
    if mode in ("ask", "explain") and not rca_context:
        try:
            inline_rca = get_inline_rca_tip(query, tool_data, mode)
        except Exception:
            inline_rca = ""
    if inline_rca:
        rca_performed = True  # flag frontend to show the RCA chip

    # Determine data source — "mysql" if any tool returned live DB data
    data_source = "mysql" if any(
        isinstance(d, dict) and d.get("data_source") == "mysql"
        for d in tool_data.values()
    ) else "demo"

    # Yield metadata so frontend can show tools/RCA chips immediately
    yield {
        "type": "meta",
        "tools_used": selected_tools,
        "rca_performed": rca_performed,
        "data_source": data_source,
        "model": MODEL,
    }

    # Step 4: Build messages
    messages = _build_messages(query, mode, tool_data, rca_context, history, rca_template_context, inline_rca)

    # Step 5: Determine if PO creation is requested — use function calling
    po_creation_mode = _is_po_creation_query(query)
    tools_param = [CREATE_PO_FUNCTION] if po_creation_mode else []

    # Step 6: Stream GPT-4o tokens (with optional function calling)
    max_tokens = {"ask": 500, "explain": 1000, "act": 1000}.get(mode, 700)
    try:
        kwargs = {
            "model": MODEL,
            "messages": messages,
            "temperature": 0.15,
            "max_tokens": max_tokens,
            "stream": True,
            "presence_penalty": 0.05,
            "frequency_penalty": 0.1,
        }
        if tools_param:
            kwargs["tools"] = tools_param
            # Force GPT-4o to call the function — never let it write text steps instead
            kwargs["tool_choice"] = {"type": "function", "function": {"name": "create_purchase_order"}}
            # Inject DMS context so GPT-4o can infer missing fields from live data
            from datetime import date as _date, timedelta as _td
            _today = _date.today().isoformat()
            _delivery = (_date.today() + _td(days=7)).isoformat()
            messages[-1]["content"] += (
                f"\n\n[PO CREATION INSTRUCTION: You MUST call the create_purchase_order function immediately. "
                f"If the user did not specify supplier/SKU/quantity, infer from the DMS snapshot: "
                f"Most critical item = 18mm BWP (8×4), 8 days cover → order 300 sheets from Century Plyboards Ltd. "
                f"Set expected_date = {_delivery} (7 days from today {_today}). "
                f"Add notes explaining the urgency from DMS data. "
                f"DO NOT write any text response — only call the function with populated arguments.]"
            )

        stream = await get_client().chat.completions.create(**kwargs)

        tool_calls_buffer: Dict[int, Dict] = {}

        async for chunk in stream:
            choice = chunk.choices[0]

            # Collect function/tool call chunks
            if choice.delta.tool_calls:
                for tc in choice.delta.tool_calls:
                    if tc.index not in tool_calls_buffer:
                        tool_calls_buffer[tc.index] = {"name": "", "arguments": ""}
                    if tc.function and tc.function.name:
                        tool_calls_buffer[tc.index]["name"] += tc.function.name
                    if tc.function and tc.function.arguments:
                        tool_calls_buffer[tc.index]["arguments"] += tc.function.arguments

            # Stream text tokens (only emitted when not in forced-function-call mode)
            elif choice.delta.content:
                token = choice.delta.content
                if token:
                    yield {"type": "token", "content": token}

        # After stream — handle any PO creation function calls
        for idx, tc in tool_calls_buffer.items():
            if tc["name"] == "create_purchase_order":
                try:
                    po_data = json.loads(tc["arguments"])
                    # Emit a brief professional intro (since GPT-4o won't produce text in forced mode)
                    confirm_text = (
                        f"I've drafted a **Purchase Order** for **{po_data.get('quantity')} sheets** "
                        f"of **{po_data.get('sku_name')}** from **{po_data.get('supplier_name')}** "
                        f"based on your live DMS data. Please review the PO document below and approve to issue it:"
                    )
                    yield {"type": "token", "content": confirm_text}
                    # Emit action event — frontend renders the professional PO confirmation card
                    yield {
                        "type": "action",
                        "action_type": "create_po",
                        "po_data": po_data,
                    }
                except (json.JSONDecodeError, KeyError):
                    yield {"type": "token", "content": "I need more details to create the PO. Please specify: supplier name, product/SKU, and quantity."}

    except Exception as exc:
        fallback = _fallback_response(query, tool_data, mode, str(exc))
        for word in fallback.split():
            yield {"type": "token", "content": word + " "}
        yield {"type": "done", "follow_ups": []}
        return

    # Step 7: Generate follow-up questions (non-blocking, runs after stream)
    follow_ups = await _generate_follow_ups(query, mode)
    yield {"type": "done", "follow_ups": follow_ups}


# ── NON-STREAMING FALLBACK ─────────────────────────────────────────────────────
async def process_query(
    query: str,
    mode: str = "ask",
    history: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """Non-streaming version — collects the full stream into a single response."""
    if not query:
        return {"response": "Please ask a question.", "mode": mode, "tools_used": [], "rca_performed": False}

    # ── Generic / conversational fast-path ───────────────────────────────────
    if is_generic_query(query):
        try:
            resp = await get_client().chat.completions.create(
                model=MODEL,
                messages=_build_generic_messages(query, history),
                temperature=0.7,
                max_tokens=220,
            )
            return {
                "response": resp.choices[0].message.content.strip(),
                "mode": mode,
                "tools_used": [],
                "rca_performed": False,
            }
        except Exception as exc:
            return {
                "response": f"Hi! I'm StockSense AI — your inventory intelligence advisor. How can I help you today? *(Error: {str(exc)[:60]})*",
                "mode": mode,
                "tools_used": [],
                "rca_performed": False,
            }
    # ─────────────────────────────────────────────────────────────────────────

    # ── Knowledge fast-path ───────────────────────────────────────────────────
    if is_knowledge_query(query):
        knowledge_tools = get_tools_for_knowledge_query(query)
        tool_data_k = await gather_tool_data(knowledge_tools, query)
        knowledge_ctx = get_knowledge_context(query, tool_data_k)
        tool_ctx_parts = [_format_tool_context(t, d) for t, d in tool_data_k.items() if "error" not in d]
        full_ctx = "\n\n".join([knowledge_ctx] + tool_ctx_parts)
        messages_k = [{"role": "system", "content": SYSTEM_KNOWLEDGE}]
        if history:
            for msg in history[-6:]:
                if msg.get("role") in ("user", "assistant") and msg.get("content"):
                    messages_k.append({"role": msg["role"], "content": str(msg["content"])[:1200]})
        messages_k.append({"role": "user", "content": f"**Question:** {query}\n\n--- Knowledge Base + Live Data ---\n{full_ctx}"})
        try:
            resp_k = await get_client().chat.completions.create(
                model=MODEL, messages=messages_k, temperature=0.2, max_tokens=600,
            )
            return {
                "response": resp_k.choices[0].message.content.strip(),
                "mode": mode,
                "tools_used": ["knowledge"] + knowledge_tools,
                "rca_performed": False,
            }
        except Exception as exc:
            return {"response": f"Knowledge error: {str(exc)[:80]}", "mode": mode, "tools_used": ["knowledge"], "rca_performed": False}
    # ─────────────────────────────────────────────────────────────────────────

    # ── Insights fast-path ────────────────────────────────────────────────────
    if is_insights_query(query):
        all_tools = ["stock", "finance", "customer", "supplier", "order", "demand", "freight", "po_grn", "quotes", "projects"]
        tool_data_i = await gather_tool_data(all_tools, query)
        try:
            insights_list = generate_proactive_insights(tool_data_i)
        except Exception:
            insights_list = []
        insights_ctx = format_insights_context(insights_list)
        messages_i = [{"role": "system", "content": SYSTEM_INSIGHTS}]
        messages_i.append({"role": "user", "content": f"**Request:** {query}\n\n--- Pre-computed Insights ---\n{insights_ctx}"})
        try:
            resp_i = await get_client().chat.completions.create(
                model=MODEL, messages=messages_i, temperature=0.15, max_tokens=900,
            )
            return {
                "response": resp_i.choices[0].message.content.strip(),
                "mode": mode,
                "tools_used": ["insights"] + all_tools[:5],
                "rca_performed": False,
            }
        except Exception as exc:
            return {"response": _format_insights_fallback(insights_list, str(exc)), "mode": mode, "tools_used": ["insights"], "rca_performed": False}
    # ─────────────────────────────────────────────────────────────────────────

    selected_tools = select_tools(query, mode)
    tool_data = await gather_tool_data(selected_tools, query)
    try:
        rca_performed, rca_context = await _run_rca_if_needed(mode, query, tool_data)
    except Exception:
        rca_performed, rca_context = False, ""
    try:
        rca_template_context = get_act_rca_templates(query, tool_data) if mode == "act" else ""
    except Exception:
        rca_template_context = ""
    messages = _build_messages(query, mode, tool_data, rca_context, history, rca_template_context)

    max_tokens = {"ask": 500, "explain": 1000, "act": 1000}.get(mode, 700)
    try:
        resp = await get_client().chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.15,
            max_tokens=max_tokens,
            presence_penalty=0.05,
            frequency_penalty=0.1,
        )
        answer = resp.choices[0].message.content.strip()
    except Exception as exc:
        answer = _fallback_response(query, tool_data, mode, str(exc))

    return {
        "response": answer,
        "mode": mode,
        "tools_used": selected_tools,
        "rca_performed": rca_performed,
    }


def _format_insights_fallback(insights: list, error: str) -> str:
    """Rule-based insights presentation when OpenAI is unavailable."""
    if not insights:
        return "✅ Business metrics look healthy — no critical issues detected right now."
    lines = ["**📊 Business Intelligence Briefing** *(OpenAI unavailable — showing key alerts)*\n"]
    total_impact = 0
    for ins in insights[:5]:
        lines.append(f"**{ins.get('category', '🔔')} {ins.get('title', 'Issue')}**")
        lines.append(f"> {ins.get('finding', '')}")
        lines.append(f"**Action:** {ins.get('action', '')} | **Urgency:** {ins.get('urgency', '')}\n")
        total_impact += ins.get("rupee_impact", 0)
    if total_impact:
        from app.services.insights_engine import _format_lakh
        lines.append(f"---\n**Total ₹ Opportunity: ₹{_format_lakh(total_impact)}**")
    lines.append(f"\n*[OpenAI unavailable. Error: {error[:60]}]*")
    return "\n".join(lines)


def _fallback_response(query: str, tool_data: dict, mode: str, error: str) -> str:
    """Rule-based fallback when OpenAI is unavailable."""
    q = query.lower()
    stock = tool_data.get("stock", {})
    finance = tool_data.get("finance", {})

    if is_generic_query(query):
        return (
            "👋 Hi! I'm **StockSense AI** — your inventory intelligence advisor.\n\n"
            "I can help you with:\n"
            "- 📦 Stock levels, reorder alerts, dead stock recovery\n"
            "- 💰 Margin analysis and cash flow\n"
            "- 🏭 Supplier scorecards and procurement\n"
            "- 👥 Customer collections and churn risk\n"
            "- 📋 Create purchase orders directly from chat\n\n"
            "What would you like to explore today?"
        )

    if any(w in q for w in ["reorder", "order", "low stock", "stockout"]):
        critical = stock.get("critical_low", [])
        if critical:
            items = ", ".join(f"{s['sku']} ({s['days_cover']}d left)" for s in critical)
            return (
                f"⚠️ **Critical reorder needed**: {items}.\n\n"
                f"Place PO with Century Plyboards immediately (96% on-time, ₹8.4/sheet freight).\n\n"
                f"*[OpenAI unavailable — check OPENAI_API_KEY in backend/.env. Error: {error[:80]}]*"
            )

    if any(w in q for w in ["dead stock", "ageing", "aging"]):
        dead = stock.get("dead_stock", [])
        items = ", ".join(f"{s['sku']} ({s['value']})" for s in dead) if dead else "₹4.2L total"
        return (
            f"**Dead stock**: {items}.\n\n"
            f"Action: 12% discount to top contractors + bundle with 18mm BWP orders.\n\n"
            f"*[OpenAI unavailable. Error: {error[:60]}]*"
        )

    if any(w in q for w in ["margin", "profit", "revenue"]):
        return (
            f"**Revenue MTD**: {finance.get('revenue_mtd', '₹28.4L')} | "
            f"**Gross margin**: {finance.get('gross_margin', '22.4%')}\n\n"
            f"⚠️ 8mm Flexi true margin is only 6.7% after Gauri freight costs.\n\n"
            f"*[OpenAI unavailable. Error: {error[:60]}]*"
        )

    return (
        f"**Key metrics**: Stock ₹38.6L | Revenue MTD ₹28.4L (+9.2%) | "
        f"⚠️ 18mm BWP only 8 days cover — order from Century now.\n\n"
        f"*[OpenAI unavailable — add OPENAI_API_KEY to backend/.env. Error: {error[:80]}]*"
    )
