# InvenIQ — Project Overview for Interview
**Version 3.2 | Full-Stack AI-Powered ERP Platform**

---

## 1. PROJECT SUMMARY

**InvenIQ** is a production-ready, AI-powered inventory intelligence and ERP platform built for B2B manufacturing and distribution businesses. It is a single-page web application combining a React 18 frontend with a FastAPI Python backend, MySQL database, and GPT-4o AI integration — all designed to help businesses manage their entire Procure-to-Pay (P2P) workflow, sales operations, finance, and warehouse from one platform.

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Frontend | React 18 (SPA), lazy loading, Suspense, ErrorBoundary |
| Backend | FastAPI (Python 3.11), async, aiomysql |
| Database | MySQL 8 — `stocksense_inventory`, 16 tables, 4 views |
| AI | GPT-4o (OpenAI) — chat, tools, streaming SSE |
| Auth | JWT (access 8h + refresh 7d), bcrypt, RBAC |
| Charts | Chart.js with custom gradient helpers |
| Deployment | Windows (start.bat), Docker-ready |
| Dev Tools | VS Code, React DevTools, FastAPI auto-docs |

---

## 3. ARCHITECTURE OVERVIEW

```
Browser (React 18 SPA)
    │
    ├── Global Fetch Interceptor (JWT auto-attach + refresh)
    ├── React.lazy() per view + Suspense + ErrorBoundary
    ├── App.js — single activeView state (no React Router)
    └── Sidebar → sets activeView → renders correct view
              │
              ▼
    FastAPI Backend (localhost:8000)
    │
    ├── AuthMiddleware — JWT validation on all /api/* routes
    ├── ModuleAccessMiddleware — per-role module access enforcement
    ├── 24 API Routers (registered with /api prefix)
    ├── AI Orchestrator (4-path routing → GPT-4o)
    ├── MySQL connection pool (aiomysql) + mock fallback
    └── GZip middleware, structured logging
```

**Key architectural decision:** No React Router — navigation is controlled by a single `activeView` string in `App.js`. Every view is lazy-loaded and wrapped in its own `ErrorBoundary` — one view crashing never affects the rest of the app.

---

## 4. MODULES (35 Total)

### Dashboard & Analytics
- **Overview** — KPI cards, revenue trends, alerts
- **Analytics** — Sales analytics, charts, period-wise comparison
- **Finance** — P&L, cash flow, financial KPIs

### Inventory & Warehouse
- **Inventory** — Stock levels, SKU management, alerts
- **Inward** — Goods receipt tracking
- **Warehouse** — Bin management, stock movement
- **Dead Stock** — Aging analysis, disposal recommendations

### Procurement (P2P Enterprise)
- **Purchase Requisition (PR)** — Create, approve, convert to PO; partial conversion tracking
- **Purchase Orders (PO/GRN)** — Full PO lifecycle, multi-GRN per PO, gate entry integrated
- **QC Inspection** — 4-field decision (accepted/rejected/rework/hold), inventory ledger
- **Invoice Matching** — 2-way/3-way/4-way match with QC gate, debit note flag

### Sales
- **Sales** — Sales performance, trends
- **Orders** — Order management
- **Customers** — Customer profiles, credit history
- **Sales Return** — Return processing, credit notes
- **POS (Counter Sales)** — Point-of-sale interface
- **Louvers/Laminates** — Product-specific sales tracking
- **Discounts** — Distributor discount management
- **Schemes** — Promotional scheme management
- **Quotes** — Quote builder with PDF print
- **Credit Management** — Credit limits, exposure, overdue

### Operations
- **Damage Recording** — Damage capture with photo notes
- **Freight** — Freight cost tracking and analysis
- **Landing Cost** — Import cost sheet builder, DB-persisted
- **Demand Planning** — AI-assisted demand forecasting
- **Projects** — Project tracker with milestones

### Finance & Compliance
- **Tally Export** — Journal entries, export to Tally
- **Invoice Matching** — 3-way/4-way match with variance analysis

### Portals
- **Distributor Portal** — Read-only portal for distributors (own stock only)
- **Design Quote Studio** — Interior quotations + Architect fee proposals (architect role only)

### Utility
- **Product Catalog** — Full product catalog management
- **AI Chatbot** — GPT-4o powered assistant
- **About, Settings** — Platform info, user settings

---

## 5. SECURITY & AUTH SYSTEM

### JWT + RBAC
- **Access token** (8h) + **Refresh token** (7d, DB-backed, rotation on use)
- **7 roles**: admin, sales_manager, cfo, warehouse_manager, finance_manager, distributor, architect
- **ModuleAccessMiddleware** — every API request checks if the caller's role is allowed to access that module's API prefix
- **`allowed_modules` JWT claim** — comma-separated list embedded in token, verified on every request
- Frontend fetch interceptor: proactive refresh if token < 5 min remaining; 401 retry after refresh; concurrent refresh de-duped

### Role Access Examples
| Role | Can Access |
|---|---|
| admin | All 35 modules |
| sales_manager | Sales, customers, orders, quotes, discounts, POS, etc. |
| cfo | Finance, procurement, PO/GRN, tally, analytics, etc. |
| warehouse_manager | Inventory, warehouse, PR, QC, landing cost, etc. |
| distributor | Only their own allocated stock (distributor portal) |
| architect | Only Design Quote Studio |

---

## 6. AI CHATBOT — ARCHITECTURE

The AI chat system is the platform's most complex component, featuring 4 intelligent routing paths:

```
User message
     │
     ▼
orchestrator.py
     │
     ├─ is_generic_query()   → Greeting/general chat path
     ├─ is_knowledge_query() → 35-topic knowledge base + live DB data
     ├─ is_insights_query()  → 25 insight generators (all 25 data tools)
     └─ Normal path          → Tool selector → RCA analysis → GPT-4o streaming
```

### AI Tools (27 tools)
Each tool fetches real-time data from the DB (or mock fallback) and returns structured context to GPT-4o. Examples: `stock_tool`, `sales_tool`, `demand_tool`, `customer_tool`, `finance_tool`, `po_grn_tool`, `design_quote_tool`, etc.

### Knowledge Base (35 topics)
Covers: inventory management, demand forecasting, procurement best practices, credit management, tally integration, design quote workflows, and more.

### Insight Engine (25 insight generators)
Auto-detects: low stock, demand spikes, overdue credit, supplier delays, GRN mismatches, POS low stock, warehouse capacity, landing cost overhead, design quote pipeline alerts, etc.

### Streaming
All AI responses stream via **Server-Sent Events (SSE)** — `meta`, `token`, `action`, `done`, `error` event types. The frontend renders tokens as they arrive for real-time UX.

### GPT-4o Function Calling
The chatbot can create Purchase Orders directly from chat — GPT-4o returns a `create_po` function call, the frontend shows a `POConfirmCard`, and the user confirms.

---

## 7. P2P ENTERPRISE WORKFLOW

Full Procure-to-Pay cycle implemented end-to-end:

```
Purchase Requisition (PR)
     │ convert (partial conversion supported)
     ▼
Purchase Order (PO)
     │ receive goods
     ▼
Goods Receipt Note (GRN) ← Gate Entry fields integrated
     │ quality check
     ▼
QC Inspection (accepted/rejected/rework/hold)
     │ inventory ledger updated
     ▼
Invoice Matching (2-way / 3-way / 4-way)
     │ debit note if discrepancy
     ▼
Payment / Tally Export
```

### Business Rules Enforced
- GRN blocked against CLOSED/CANCELLED/FULLY_RECEIVED POs
- One DRAFT PO per supplier per PR (409 if duplicate)
- QC gate on invoice matching — cannot match invoice if QC pending
- Over-receive prevention (422 with OVER_RECEIVE code)
- Auto-journal entries on GRN (DR Stock / CR Accounts Payable)
- PR partial conversion: tracks `qty_converted` per line, status = PARTIAL_CONVERTED

---

## 8. DATABASE DESIGN

**Database:** `stocksense_inventory` (MySQL 8)
- **16 tables** including: inventory, purchase_orders, grn, grn_line_items, po_items, purchase_requisitions, pr_items, qc_inspections, purchase_invoices, stock_movements, audit_log, pr_conversion_ledger, refresh_tokens, landing_cost_sheets, journal_entries, design_quotes, architect_proposals
- **4 views** for aggregated reporting
- **Inventory Ledger Service**: `record_movement()` tracks every stock in/out with movement type (GRN_RECEIPT, QC_REJECT, SALE_DISPATCH, etc.)
- **Audit Logger Service**: `log_action()` tracks every create/update/status change
- **Auto-migration on startup**: `startup_migrations.py` creates all tables with `CREATE TABLE IF NOT EXISTS` — zero-downtime safe

---

## 9. FRONTEND PATTERNS

### DB-First / Mock-Fallback
Every data-fetching view tries the real DB first. If MySQL is unavailable, it falls back to rich static mock data. Zero white screens in demo mode — only `OPENAI_API_KEY` required to run.

### Key Shared Utilities
- `chartHelpers.js` — `gradientFill`, `PALETTE`, `baseOpts`, `createChart` (Chart.js wrappers)
- `exportUtils.js` — `exportToCsv`, `ExportButton` (wired in 14+ views)
- `printUtils.js` — `printCreditNote` (opens styled print window)
- `useAutoRefresh.js` — visibility + interval auto-refresh hook (silent, no loading flash)
- `DataSourceBadge.jsx` — shows "LIVE" or "DEMO" badge on every data view
- `SkeletonLoader.jsx` — `SkeletonView`, `SkeletonKpiGrid`, `SkeletonTable` for loading states
- `Pagination.jsx`, `ErrorBoundary.jsx`, `Toast.jsx`

### React Rules Strictly Enforced
- All hooks run **unconditionally before any early return** — no "Rendered more hooks" crashes
- `?.` optional chaining and `??` nullish coalescing on all API data access
- Period selector (`Today / MTD / QTD / YTD`) passed as prop to all data views and included in every fetch URL

---

## 10. DESIGN QUOTE STUDIO (Architect-Only Module)

A completely isolated module accessible **only to the `architect` role**:

### Interior Quotation Builder
- Room-by-room scoped quotes (Kitchen, Bedroom, Pooja Room, etc.)
- 9 room templates with item templates per room
- Inline dimension input (L×W, L×H, fixed qty) with auto-quantity calculation
- Product option selector with auto-fill rate
- AI Requirements Scanner — upload any file (JPG, PDF, DOCX) or paste text → GPT-4o extracts rooms and items
- GST calculation, validity days, terms & conditions
- Print-to-PDF via browser print

### Architect Fee Proposals
- Area calculator: site_area → builtup → carpet → super_builtup → floor_plate
- Fee models: % of construction cost | per sqft of builtup | lump sum
- Phase schedule (P1–P6): Concept/Schematic/Design Dev/Construction Docs/Approvals/Site Supervision
- BOQ auto-generation (Packages A–J): Earthwork, Foundation, RCC, Masonry, Roofing, Plastering/Flooring, Doors/Windows, Plumbing, Electrical, Painting
- AI brief parser — paste project brief → auto-extract area data, fee model suggestion, approval requirements

---

## 11. KEY ENGINEERING CHALLENGES SOLVED

| Challenge | Solution |
|---|---|
| React hooks crash when placed after early returns | Enforced strict rule: all hooks before any conditional return |
| AI context window overflow | 4-path routing — only load relevant data per query type |
| Multiple views breaking when DB is down | DB-first / mock-fallback pattern with `_try_db()` helper |
| JWT refresh race condition (concurrent requests) | Single `_refreshPromise` de-duplication in fetch interceptor |
| GRN over-receiving | 422 + `OVER_RECEIVE` error code; backend validates remaining qty |
| QC double-counting inventory | GRN_RECEIPT adds all; QC_REJECT removes rejected; no QC_ACCEPT movement |
| AI streaming disconnect cleanup | SSE loop checks `await request.is_disconnected()` every iteration |
| Module isolation for distributor/architect roles | `ModuleAccessMiddleware` + `_MODULE_API_PREFIXES` map blocks API calls too |

---

## 12. PROJECT METRICS

| Metric | Count |
|---|---|
| Frontend modules (views) | 35 |
| Backend API routers | 24 |
| API endpoints | 130+ |
| AI tools | 27 |
| Knowledge base topics | 35 |
| Insight generators | 25 |
| User roles | 7 |
| Database tables | 16 |
| Lines of CSS (App.css) | 3,700+ |
| Frontend shared utilities | 8 files |

---

## 13. DEMO CREDENTIALS

| Role | Username | Password |
|---|---|---|
| Owner (Admin) | admin | InvenIQ_Owner@2026 |
| Sales Manager | sales_mgr | sales@2024 |
| CFO | cfo_user | cfo@2024 |
| Warehouse Manager | warehouse_mgr | wh@2024 |
| Finance Manager | finance_mgr | fin@2024 |
| Distributor | dist_allied | dist@2024 |
| Architect | architect | arch@2026 |

---

## 14. HOW TO RUN

```bash
# Windows — one command starts everything
cd C:\InvenIQ
start.bat
# Kills ports 8000 and 3000, starts backend + frontend, opens browser

# Requirements
# - Node.js 18+, Python 3.11+
# - pip install -r backend/requirements.txt
# - cd frontend && npm install
# - .env file with OPENAI_API_KEY (MySQL optional — demo mode works without it)
```

---

## 15. WHAT MAKES THIS PROJECT STAND OUT

1. **Production-grade security** — JWT with refresh rotation, RBAC enforced at both API and module level, no secret exposure
2. **AI-first design** — Not bolted on; AI is core to the UX (streaming chat, function calling, tool routing, knowledge base, insight engine)
3. **Zero-downtime resilience** — Demo mode without DB, auto-migrations on startup, per-view error isolation
4. **Complete P2P cycle** — End-to-end from PR → PO → GRN → QC → Invoice Match with enforced business rules
5. **Role-based isolation** — Distributor sees only their stock; architect sees only design tools; enforced at JWT claim level
6. **Scale-ready patterns** — Async throughout (aiomysql, asyncio.gather), connection pool, GZip compression, efficient re-renders

---

*InvenIQ v3.2 — May 2026 | Built with React 18 + FastAPI + MySQL + GPT-4o*
