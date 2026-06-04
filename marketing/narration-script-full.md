# InvenIQ — Complete Word-for-Word Narration Script
## Full Main YouTube Demo Video | ~14–16 minutes

---

## BEFORE YOU PRESS RECORD — SETUP CHECKLIST

- [ ] Run `start.bat` — wait for "Backend ready on :8000" and "Compiled successfully" in terminals
- [ ] Open Chrome → `http://localhost:3000`
- [ ] Press `Ctrl+–` twice — set browser to 90% zoom
- [ ] Press `Ctrl+Shift+B` — hide the bookmarks bar
- [ ] Close all other apps — silence phone, turn off desktop notifications
- [ ] Have these credentials written on a sticky note (not memorized — so you type them naturally on camera):
  - Admin: `admin` / `InvenIQ_Owner@2026`
  - Architect: `architect` / `arch@2026`
  - Distributor: `dist_allied` / `dist@2024`
- [ ] Mic test done, screen capture running, correct monitor selected
- [ ] You are on the Login screen, NOT already logged in

---

## SEGMENT 1 — OPENING (0:00 – 0:50)

**[Hold on the Login screen. Do not type yet. Let viewers read the page for 2 seconds.]**

> "This is InvenIQ.
>
> It's a complete, AI-powered ERP platform — 35 modules, 7 role-based portals, and an AI
> assistant powered by GPT-4o that can answer any question about your business in plain English.
>
> It runs on React 18 on the frontend, FastAPI on the backend, MySQL for the database, and
> GPT-4o for the AI. And it works right now — without a database. All you need is an
> OpenAI API key and you have a fully functional system running on demo data."

**[Type the admin username slowly: `admin`]**

> "I'm going to log in as the owner — the admin role. Full access to all 35 modules."

**[Type the password: `InvenIQ_Owner@2026` — type it slowly, don't rush]**

**[Click Login — wait for the dashboard to fully load]**

**[Pause 3 full seconds on the Overview dashboard before speaking]**

> "This is the Business Overview dashboard. This is what the owner sees the moment they log in."

---

## SEGMENT 2 — BUSINESS OVERVIEW DASHBOARD (0:50 – 2:15)

**[Pan slowly left to right across the top KPI row — move the mouse slowly under each card as you mention it]**

> "Across the top — the four most important numbers in the business right now.
>
> Revenue Month-to-Date. Active Orders. Dead Stock Value — the rupee value of inventory
> that hasn't moved in 90-plus days. And the open Design Quote pipeline — the total value
> of interior design quotations currently being negotiated.
>
> Every number is live from your MySQL database in production, or from rich demo data if
> you're evaluating the platform."

**[Click the YTD period button in the topbar]**

> "I'll set the period to Year-to-Date. Every module across the entire platform — inventory,
> sales, finance, procurement — now updates to the YTD window. One selector, every view."

**[Scroll down slowly to the revenue chart]**

> "Below the KPIs — the full-year revenue trend. Month over month bars with a gradient fill.
> The period selector at the top controls this chart as well."

**[Point slowly to the left sidebar]**

> "On the left — the full module list. 35 modules organized by business function.
>
> At the top: Dashboard. Then Inventory and Warehouse. Then the full Procurement and
> Purchase-to-Pay workflow. Then Sales and CRM. Then Finance. Then Projects, Quotes, and
> the Design Studio. Then Operations — POS, schemes, distributor portal.
>
> And at the very bottom — the AI Assistant. I'll come back to that. It's the most
> powerful part of the platform."

---

## SEGMENT 3 — INVENTORY & WAREHOUSE (2:15 – 4:45)

**[Click "Stock Intelligence" in the sidebar]**

> "Stock Intelligence — every SKU currently in the system. Current quantity on hand, the
> reorder level, days of cover, and for near-stockout items — the rupee revenue at risk."

**[Scroll down to the SKU table — move the cursor slowly across the column headers]**

> "The amber badge on the sidebar badge counter — that's a live alert count. The system
> has already identified critical low-stock items before you've even asked. No configuration.
> No threshold setup. The AI scans the data every time the page loads."

**[Click "Dead Stock & Ageing" in the sidebar]**

> "Dead Stock and Ageing. Items that haven't moved in 90 or more days, their total rupee
> value locked in the warehouse, and an AI-generated recovery recommendation for each one.
>
> This module alone typically frees up 8 to 15 percent of a business's working capital
> once they act on it."

**[Click "Warehouse Management" in the sidebar]**

> "Warehouse Management — bin-level capacity, GRN activity, and stock distribution across
> warehouse locations."

**[Click "Inward & Outward" in the sidebar]**

> "Inward and Outward — every stock movement in the ledger. When did material come in,
> against which Purchase Order, from which supplier."

**[Click "Damage Recording" in the sidebar]**

> "Damage Recording — log damage at GRN inward, during transit, or at sales order dispatch.
> Each damage entry creates a full insurance claim trail with auto-generated accounting entries.
> Rejected units come off the inventory balance automatically."

---

## SEGMENT 4 — FULL PURCHASE-TO-PAY WORKFLOW (4:45 – 7:15)

**[Click "Purchase Requisition" in the sidebar]**

> "Now the complete Purchase-to-Pay workflow. This is one of InvenIQ's most technically
> rigorous sections — every step is gated. You can't skip ahead.
>
> It starts here — Purchase Requisition. Any team member can raise a material request.
> They fill in the item, the quantity needed, the required-by date, the priority, and
> the department. The PR goes for manager approval before anything can be ordered."

**[Point to the status columns — show PENDING, APPROVED, PARTIAL_CONVERTED]**

> "The status tracks the full lifecycle — Pending approval, Approved, Partially Converted
> to Purchase Order, Fully Converted.
>
> Partially Converted means some line items have already been converted into a PO, but
> others are still waiting. The system tracks this at the line-item level — it stores
> the converted quantity per item so you never order what's already been ordered."

**[Click "PO & GRN" in the sidebar]**

> "PO and GRN — Purchase Orders and Goods Receipt Notes.
>
> A Purchase Order can only be created against an approved PR — no free-form ordering.
> One rule that prevents a huge class of procurement fraud.
>
> And there's another rule: only one draft PO per supplier per PR. If you've already
> started a PO for Hindalco from this PR, the system blocks a second one from being
> created. You either finish the first or cancel it."

**[Click "Record GRN" button on any PO — show the modal for 3-4 seconds]**

> "When goods arrive, the GRN modal captures everything.
>
> The vehicle number. The driver's name. Whether the delivery challan was verified. The
> seal number. The gate entry time. All the gate-entry data that used to require a
> separate module — it's all right here in the GRN, linked to the Purchase Order."

**[Close the modal]**

> "And there's a hard gate on this too: if the PO is already Fully Received, Closed,
> Cancelled, or Returned — you cannot record another GRN against it. The system returns
> a PO_CLOSED error. No accidental double-receiving."

**[Click "QC Inspection" in the sidebar]**

> "After GRN, goods go to QC Inspection.
>
> The QC team records four quantities per item: Accepted, Rejected, Sent for Rework,
> and Put on Hold. The inventory ledger updates automatically when QC is completed —
> rejected units are deducted from the balance. Accepted units are confirmed.
>
> And importantly: until QC is marked complete on a GRN, that GRN cannot be used
> for invoice matching. The system enforces this gate."

**[Click "Invoice Matching" in the sidebar]**

> "Invoice Matching — the 3-way match between the Purchase Order, the Goods Receipt Note,
> and the supplier's invoice.
>
> The system fetches per-line quantities: how many were ordered on the PO, how many were
> accepted by QC on the GRN, and how many the supplier is billing for. Where there are
> discrepancies, it flags the line and recommends a Debit Note.
>
> QC has to be complete. The GRN has to exist. The PO has to be valid. All three gates
> before the invoice can be matched."

**[Click "Landing Cost" in the sidebar]**

> "And Landing Cost — add custom duty, freight, labour, insurance, and any other charge
> heads on top of the base PO value to calculate the true landed cost per unit.
> Important for accurate margin calculations."

---

## SEGMENT 5 — SALES & CRM (7:15 – 8:45)

**[Click "Sales Performance" in the sidebar]**

> "Sales Performance — revenue by product category, top-performing products, gross margin
> analysis, and the month-over-month trend for the selected period."

**[Click "Customer Intelligence" in the sidebar]**

> "Customer Intelligence — every account in the system. Their current credit limit, their
> overdue balance, their full payment history. Click any customer row to open a deep
> analysis with their order history and outstanding invoices."

**[Click "Counter POS" in the sidebar]**

> "Counter POS — for walk-in customers and fast billing. Scan the product, enter the
> quantity, the GST calculation is automatic. A print-ready GST invoice is generated instantly."

**[Click "Quotation Builder" in the sidebar]**

> "Quotation Builder — create professional quotes for B2B customers. Add line items,
> apply discounts, set GST rates, and export a print-ready PDF. The AI assistant can
> pull up similar past quotes to speed up the process."

**[Click "Sales Return" in the sidebar]**

> "Sales Return — handle customer returns with automatic UOM conversions and credit note
> generation. All accounting entries are Tally-compatible."

---

## SEGMENT 6 — FINANCE (8:45 – 9:45)

**[Click "Profitability & Cash" in the sidebar]**

> "Finance — the CFO's view. Gross margin, net profit, cash position, and the full
> receivables ageing breakdown. Everything a finance head needs on a single screen."

**[Click "Credit Management" in the sidebar]**

> "Credit Management — customer credit limits, post-dated cheque tracking, and overdue
> alerts. The system flags any account approaching or exceeding their credit limit
> before you process their next order."

**[Click "Tally Prime Export" in the sidebar]**

> "Tally Export — export sales, purchases, credit notes, and journal entries as
> Tally-compatible CSV files. Import directly into Tally Prime. One click — no manual
> data entry."

**[Pause — let the screen settle]**

> "And here's something that runs in the background that most ERPs don't do:
> every time a GRN is recorded and QC is completed, InvenIQ automatically creates
> a journal entry — Debit Stock, Credit Accounts Payable. Your books update in real time.
> You don't have to manually post anything."

---

## SEGMENT 7 — AI ASSISTANT (9:45 – 11:30)

**[Click "AI Assistant" in the sidebar — wait for it to load fully]**

**[Pause 2 seconds before speaking]**

> "This is the AI Assistant. And this is what makes InvenIQ genuinely different from
> every other inventory and ERP platform.
>
> It's not a Q&A chatbot that searches a help document. It's connected to 27 live data
> tools — stock, finance, sales, procurement, customers, design quotes, damage records,
> landing costs, purchase requisitions, QC data, invoice matching, everything.
>
> Ask it anything. It decides which tools to use, fetches live data, and responds in
> plain English with rupee-quantified answers."

**[Type this question: `Give me today's business insights`]**
**[Press Enter — let the response stream in — do NOT speak while it streams, just point at the screen]**

> "Watch this — it's streaming in real time. It's run all 25 insight generators
> across the entire business — stock levels, finance, sales velocity, customer overdue,
> procurement gaps, design quote pipeline — and it's ranking the top priorities by
> rupee impact.
>
> Every insight has a number. Every number has a recommended action."

**[After the response finishes — read out 1-2 of the specific insights that appeared]**

**[Now type: `Which customers have overdue payments above 30 days?`]**
**[Press Enter — wait for response]**

> "Customer names. Overdue amounts. Days overdue. And a recommended collection action
> for each one. Instant."

**[Now type: `What is my dead stock value and what should I do about it?`]**
**[Press Enter — wait for response]**

> "It fetches the dead stock tool, gets the actual SKU list, calculates the total value,
> and gives a recovery recommendation.
>
> It can also do root cause analysis — ask it 'Why is my gross margin falling?' and it
> generates a structured PDCA analysis, a 5-Why breakdown, or a Fishbone diagram. It
> has 14 root cause analysis templates built in."

**[Now type: `Create a PO for 500 sheets of Hindalco 1.5mm from Hindalco Extrusions`]**
**[Press Enter — wait for the PO Confirm card to appear]**

> "It doesn't just answer — it acts. The AI generated a complete Purchase Order draft —
> supplier, item, quantity, specifications — and it's showing me a confirmation card.
> One click and the PO is created in the system.
>
> 27 live data tools. 35 knowledge base topics. 25 proactive insight generators. No
> configuration. No queries to write. Just ask."

---

## SEGMENT 8 — ARCHITECT PORTAL & DESIGN QUOTE STUDIO (11:30 – 13:30)

**[Click the profile icon or Settings — Log Out]**

**[Wait for the Login screen to appear]**

> "Now I want to show you something completely unique to InvenIQ — the Design Quote Studio.
>
> But to show it properly, I'm going to log in as a different user — an architect."

**[Type username: `architect`]**
**[Type password: `arch@2026`]**

**[Click Login — wait for the dashboard to load]**

**[Let the screen sit for 3 seconds — make sure viewers notice that the sidebar has changed]**

> "Look at the sidebar.
>
> The architect logs in and sees exactly three things: the Design Quote Studio, Settings,
> and About. No inventory. No procurement. No finance. No customer data. No sales figures.
>
> This is role-based access in practice — not just a permission flag, a completely
> different experience. The platform reshapes itself based on who logged in."

**[Click around the sidebar to show only those 3 items — do this slowly]**

> "The architect credential is `architect` / `arch@2026`. It's configured in the backend
> roles system — the allowed modules list for the architect role is literally just
> `designquote`, `settings`, and `about`. The rest of the platform is inaccessible — not
> hidden behind a button, structurally not rendered."

**[Click "Design Quote Studio"]**

> "The Design Quote Studio.
>
> Interior designers and architects work completely differently from a warehouse or finance
> team. They create room-by-room BOQs — Bill of Quantities — for client projects. They
> negotiate fees. They track which quotes are in which stage.
>
> This module handles all of that."

**[Point to the feature tags / quote pipeline stages]**

> "The quote pipeline has five stages: Draft, Sent, Negotiating, Won, and Lost or Expired.
> Every quote is tracked from first draft to close.
>
> Quote numbers are prefixed with DQ-dash — Design Quote. Architect fee proposals are
> prefixed with FP-dash. You can tell what you're looking at just from the number.
>
> Architect fee proposals follow the industry standard: 5 to 8 percent of total project
> value, billed across 6 milestone phases — P1 through P6. Concept to handover.
>
> And GST on design services is 18 percent under SAC code 998331. The system calculates
> this automatically on every proposal.
>
> The AI assistant here understands interior design specifically. Ask it 'What's a
> reasonable fee for a 3000 square foot villa?' — it knows the benchmark. Ask it to
> scan a WhatsApp brief from a client and extract the rooms and dimensions — it does that
> too, using GPT-4o vision."

---

## SEGMENT 9 — DISTRIBUTOR PORTAL (13:30 – 14:00)

**[Log out — return to Login screen]**

**[Type username: `dist_allied`]**
**[Type password: `dist@2024`]**
**[Click Login]**

**[Let it load — again, let viewers notice the change in sidebar]**

> "One more role — the Distributor Portal. This is for your channel partners and dealers.
>
> The distributor `dist_allied` logs in and sees only their own allocated stock. Not the
> full warehouse. Not other distributors' stock. Their inventory, live, on their screen.
>
> No spreadsheets. No WhatsApp forwards. No waiting for your team to send a stock report.
> The distributor logs in and the data is there."

---

## SEGMENT 10 — CLOSING (14:00 – 14:45)

**[Log out — log back in as admin: `admin` / `InvenIQ_Owner@2026`]**

**[Navigate to About in the sidebar]**

**[Let the About page load fully — pause 3 seconds]**

> "Let me leave you with the numbers.
>
> 35 active modules.
> 27 AI data tools connected to the chatbot.
> 35 knowledge base topics — so the AI understands your business domain, not just your data.
> 25 proactive insight generators — running every time you ask for insights.
> 14 root cause analysis templates — PDCA, 5-Why, Fishbone.
> 7 role-based portals — Admin, Sales Manager, CFO, Warehouse Manager, Finance Manager,
> Distributor, and Architect.
> 130-plus API endpoints.
>
> Built on React 18, FastAPI, MySQL, and GPT-4o.
> JWT authentication with role-based access control.
> Docker-ready for deployment.
>
> Works in demo mode without a database — right now, with just an API key.
> Works in full production mode with your own MySQL database — same day setup."

**[Hold on the About page — let viewers read it]**

> "If you want to see InvenIQ running with your actual data — your products, your customers,
> your suppliers — reach out. I can set it up in less than a day.
>
> Email is in the description. Link to this demo video as well.
>
> Thank you for watching."

**[Fade out or cut to black]**

---

## FULL CREDENTIALS REFERENCE (for your sticky note)

| Role | Username | Password |
|------|----------|----------|
| Admin / Owner (all 35 modules) | `admin` | `InvenIQ_Owner@2026` |
| Architect (Design Quote Studio only) | `architect` | `arch@2026` |
| Distributor | `dist_allied` | `dist@2024` |
| Sales Manager | `salesmanager` | `sales@2026` |
| CFO | `cfo_user` | `cfo@2026` |
| Warehouse Manager | `warehouse_mgr` | `wh@2026` |
| Finance Manager | `finance_mgr` | `fin@2026` |

---

## NUMBERS TO HAVE MEMORIZED BEFORE RECORDING

| What | Number |
|------|--------|
| Total modules | **35** |
| AI data tools | **27** |
| Knowledge base topics | **35** |
| Proactive insight generators | **25** |
| RCA templates (PDCA + 5-Why + Fishbone) | **14** |
| Role-based portals | **7** |
| API endpoints | **130+** |
| API routers | **24** |
| Architect fee range | **5–8%** |
| Architect fee phases | **P1–P6 (6 phases)** |
| GST on design services | **18% (SAC 998331)** |
| Dead stock threshold | **90 days** |

---

## MODULE NAMES AS THEY APPEAR IN THE SIDEBAR (exact UI text)

**Dashboard**
- Business Overview

**Inventory & Warehouse**
- Stock Intelligence
- Dead Stock & Ageing
- Warehouse Management
- Inward & Outward
- Damage Recording

**Procurement (Purchase-to-Pay)**
- Purchase Requisition
- PO & GRN
- QC Inspection
- Invoice Matching
- Landing Cost

**Sales & CRM**
- Sales Performance
- Customer Intelligence
- Counter POS
- Quotation Builder
- Sales Return

**Finance**
- Profitability & Cash
- Credit Management
- Tally Prime Export

**Projects & Design**
- Project Tracker
- Quote Builder *(B2B sales quotes — different from Design Quote Studio)*
- Design Quote Studio *(architect portal only)*

**Operations**
- Distributor Portal
- Scheme Management
- Analytics

**AI**
- AI Assistant

**Settings / Info**
- Settings
- About

---

## WORKFLOW GATES TO MENTION (exact rules as implemented)

**GRN Gate:** Cannot record a GRN against a PO that is `FULLY_RECEIVED`, `CLOSED`,
`CANCELLED`, `RETURNED`, or `COMPLETE`. System returns `PO_CLOSED` error code (HTTP 422).

**QC Gate:** Cannot match an invoice against a GRN where `qc_completed = 0`. System
blocks matching and shows a gate error.

**PR Conversion Gate:** Only one `DRAFT` PO allowed per supplier per PR. Attempting to
create a second returns HTTP 409 Conflict.

**Invoice 3-Way Match:** Compares Purchase Order quantities → GRN accepted quantities →
supplier invoice quantities. Flags line-level discrepancies. Recommends Debit Notes where
invoice quantity exceeds GRN accepted quantity.

**Auto Journal Entries:** On successful GRN creation: `DR Stock / CR Accounts Payable`
journal entry auto-created via `INSERT IGNORE`. Non-blocking — GRN succeeds even if the
journal insert fails.

---

## TIPS FOR RECORDING THIS SCRIPT

- Read at **70–75% of your natural speaking pace** — it always sounds faster on playback
- Before each segment, take one breath and release — don't start speaking immediately after clicking
- For AI chat responses: type the question, press enter, then **stop talking** while it streams.
  Point at the screen. Let the streaming response speak for itself. Resume speaking only after it finishes.
- If you stumble on a word — pause, breathe, repeat the sentence from the start. Don't patch mid-sentence.
  These pauses are trivial to cut in editing.
- The best takes sound like you're **discovering** something you built — not reading a document.
  Look at the screen, react to what appears, then describe it.
- You don't need to get it all in one take. Record each segment separately if needed, then splice.
- The AI responses will vary slightly each recording (GPT-4o is non-deterministic). That's fine —
  the structure will be the same. Describe what you see, not what you expected.

---

## WHAT TO DO WITH THIS VIDEO AFTER RECORDING

1. **Edit in DaVinci Resolve (free)** — cut mistakes, add segment titles as text overlays
2. **Add background music** — search "lofi background music no copyright" on YouTube Audio Library
3. **Export:** 1080p, H.264, ~500 MB max for YouTube
4. **Upload to YouTube** — use the title, description, and tags from `platform-copy.md`
5. **Create thumbnail in Canva** — use the spec in `platform-copy.md`
6. **Post the LinkedIn video natively** — do NOT post the YouTube link; upload the video file directly
7. **Share in r/SaaS on Reddit** — use the Reddit post from `platform-copy.md`
