# MCA Project Synopsis

## Project Title
**InvenIQ — AI-Integrated Inventory Intelligence Platform**

---

## Abstract

Traditional inventory management systems suffer from reactive decision-making, fragmented
data flows, and lack of predictive capability. This project presents **InvenIQ**, an
enterprise-grade, AI-augmented inventory intelligence platform built on a modern full-stack
architecture (React 18 + FastAPI + MySQL + GPT-4o). The system replaces spreadsheet-driven
workflows with real-time dashboards, automated procurement pipelines, intelligent demand
forecasting, and a conversational AI business assistant — enabling businesses to make
data-driven decisions with minimal manual intervention.

---

## Problem Statement

Small to mid-scale businesses operating in product distribution, manufacturing, and retail
face the following recurring operational challenges:

- No centralized real-time visibility into stock levels, inward movements, or outward dispatch
- Purchase orders tracked manually in spreadsheets — prone to errors and delays
- Sales data and customer records siloed across tools with no unified view
- Zero forecasting capability leading to overstocking or stockouts
- No actionable insight layer — management reports generated manually, often days late

---

## Objectives

1. Design a scalable full-stack web platform for end-to-end inventory lifecycle management
2. Implement an automated procurement workflow (Purchase Requisition → Purchase Order → GRN)
3. Build a sales and customer management system with order tracking and credit monitoring
4. Integrate a large language model (GPT-4o) as a conversational business intelligence engine
5. Deliver a production-grade, role-based, JWT-authenticated multi-user system

---

## Technology Stack

| Layer       | Technology                                          |
|-------------|-----------------------------------------------------|
| Frontend    | React 18, Chart.js, CSS3 (token-based design system)|
| Backend     | FastAPI (Python 3.11), asyncio, aiomysql            |
| Database    | MySQL 8.0                                           |
| AI Engine   | OpenAI GPT-4o via Async REST API                    |
| Auth        | JWT (access + refresh tokens), bcrypt               |
| Deployment  | Localhost / VPS — environment-variable driven       |
| Dev Tools   | VS Code, Postman, Git                               |

---

## Scope — 4 Modules

---

### Module 1 — Inventory Management & Stock Tracking

**Purpose:**
Real-time visibility into current stock, inward receipts, movement history, and
dead-stock identification.

**Key Features:**
- SKU-level stock ledger with movement type classification
  (GRN Receipt, Sale Dispatch, Purchase Return, Damage Write-off)
- Inward register — records every goods receipt against a supplier
  with quantity, batch, and date
- Dead-stock detection engine — flags SKUs with zero movement
  beyond a configurable threshold (default: 90 days)
- KPI cards: Total SKUs · Total Stock Value · Items Below Reorder · Dead-Stock Count
- Period-based filtering: Today / MTD / QTD / YTD
- CSV export for external reconciliation

**Technical Highlights:**
- Async FastAPI endpoint with `asyncio.gather()` for parallel DB queries
- DB-first / demo-fallback pattern — system remains functional without MySQL
- Chart.js area chart for stock movement trend over rolling periods

**Academic Relevance:**
Covers database normalization, indexed query optimization, state management in React,
and REST API design patterns (resource-based, status codes, pagination).

---

### Module 2 — Procurement Management (PR → PO → GRN)

**Purpose:**
End-to-end procure-to-pay workflow — from internal material requests through vendor
ordering to goods receipt and quality verification.

**Key Features:**

**Purchase Requisition (PR):**
- Department-wise material requests with priority levels (CRITICAL / HIGH / MEDIUM / LOW)
- Status lifecycle: PENDING → APPROVED → CONVERTED
- Inline edit for PENDING PRs; duplicate PR capability for repeat orders
- PR partial conversion tracking: `qty_converted` per line item

**Purchase Order (PO):**
- PR-to-PO conversion with supplier selection and line-item pricing
- Conflict prevention: one DRAFT PO per supplier per PR (returns 409)
- PO status auto-progression: DRAFT → PARTIAL → RECEIVED → FULLY_RECEIVED
- Closed/Cancelled PO gate — blocks GRN creation against resolved orders

**Goods Receipt Note (GRN):**
- Quantity verification against PO line items with over-receiving prevention
- GRN blocked on closed/cancelled POs (returns 422 with OVER_RECEIVE code)
- Journal entry auto-generated on GRN creation (DR Stock / CR Accounts Payable)

**Quality Control (QC):**
- 4-quantity decision form per GRN line: Accepted / Rejected / Rework / Hold
- QC completion gate enforced before invoice matching proceeds
- Inventory ledger auto-updated on each QC decision

**Technical Highlights:**
- Multi-table transactional writes with rollback safety (aiomysql)
- Status machine validation at API layer — business rules enforced server-side
- Audit log service records every status change with user identity and timestamp
- Idempotent schema migrations on boot via `startup_migrations.py`

**Academic Relevance:**
Demonstrates enterprise workflow state machines, transactional database integrity,
service-layer architecture, and audit trail design patterns.

---

### Module 3 — Sales & Customer Management

**Purpose:**
Centralized tracking of customer accounts, sales orders, and outstanding
credit positions across the business.

**Key Features:**
- Customer master with contact details, GST number, city, and account status
- Sales order register — line-item level with product, quantity, rate, dispatch status
- Outstanding order dashboard — pending vs. dispatched vs. invoiced breakdown
- Customer-level credit exposure view: credit limit, utilized amount, overdue flag
- Sales trend chart — monthly revenue over rolling 12 months
- Customer search with server-side pagination for large datasets
- Period selector (Today / MTD / QTD / YTD) propagated to all data views

**Technical Highlights:**
- Paginated API endpoint (limit / offset) for scalable table rendering
- React state management coordinating search filter and pagination simultaneously
- Chart.js gradient-fill line chart with dark tooltip design system
- Silent background auto-refresh on window focus (no loading spinner disruption)

**Academic Relevance:**
Demonstrates pagination design trade-offs (client-side vs. server-side), component-level
state isolation in React, and relational data modeling for CRM-adjacent systems.

---

### Module 4 — AI-Powered Business Intelligence Assistant

**Purpose:**
A conversational GPT-4o assistant embedded in the platform that answers operational
queries, generates proactive insights, and surfaces actionable intelligence from live
business data — replacing manual report generation.

**Key Features:**
- Natural language query interface with streaming token output (SSE)
- **4-path intelligent routing:**
  1. Generic / greeting queries → direct response
  2. Knowledge queries → structured knowledge base
     (inventory processes, GST rules, procurement policies)
  3. Insight queries → full-platform data aggregation → proactive KPI analysis
  4. Operational queries → tool selector → live DB fetch → GPT-4o contextual response
- Live data tools: stock levels, demand trends, supplier performance,
  customer outstanding, sales patterns, procurement status
- Proactive anomaly detection: stockouts, demand spikes, overdue payments,
  GRN mismatches — surfaced without explicit user prompting
- Root-cause analysis templates (PDCA / 5-Why / Fishbone) auto-applied
  to operational issues
- Create Purchase Order via chat (GPT-4o function calling → confirmation card → DB write)

**Technical Highlights:**
- OpenAI AsyncOpenAI client with 60-second timeout and graceful degradation
- SSE (Server-Sent Events) streaming — token-by-token output for perceived performance
- Client disconnect detection stops LLM generation on tab close (no wasted API spend)
- Keyword scoring routes queries to the correct data tool before LLM call
- `asyncio.gather()` runs all data tools in parallel during insight generation

**Academic Relevance:**
Covers LLM integration architecture, SSE streaming protocols, tool-use / function calling,
AI system design with multi-path routing, and safety-first fallback patterns.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React 18 SPA                      │
│   Inventory | Procurement | Sales | AI Assistant    │
│            JWT Auth + Silent Token Refresh          │
└──────────────────────┬──────────────────────────────┘
                       │  HTTP / SSE  (/api/*)
┌──────────────────────▼──────────────────────────────┐
│                  FastAPI Backend                     │
│  GZip Middleware → Auth Middleware → Role Middleware │
│       dashboard | po_grn | analytics | chat          │
└────────────┬────────────────────────┬───────────────┘
             │                        │
      ┌──────▼──────┐          ┌──────▼──────┐
      │  MySQL 8.0  │          │  GPT-4o API │
      │  (aiomysql) │          │  (OpenAI)   │
      └─────────────┘          └─────────────┘
```

---

## Authentication & Role-Based Access Control

| Feature                  | Detail                                              |
|--------------------------|-----------------------------------------------------|
| Access Token             | JWT, 8-hour expiry, signed with HS256               |
| Refresh Token            | 7-day expiry, DB-backed, rotated on each use        |
| Password Hashing         | bcrypt with salt rounds                             |
| Role Hierarchy           | Admin → Sales Manager → Warehouse Manager → CFO     |
| Module Access            | Enforced at API middleware layer per JWT claim      |
| Public Routes            | `/api/health` and `/api/auth/*` only                |

---

## Expected Outcomes

| Outcome                  | Target Metric                                       |
|--------------------------|-----------------------------------------------------|
| Stock visibility         | Real-time SKU-level ledger with movement history    |
| Procurement automation   | PR → PO → GRN in under 3 screen interactions        |
| Sales tracking           | Order-level dispatch and outstanding visibility     |
| AI first token latency   | < 1.5 seconds (streaming SSE)                       |
| Offline demo mode        | Fully functional without any database connection    |

---

## Limitations (Academic Scope)

- Multi-warehouse distributed inventory is not in scope
- Payment gateway integration is not included
- Mobile application is out of scope (responsive web only)
- ERP integration (SAP, Tally) is not covered in this phase

---

## References

1. FastAPI Official Documentation — https://fastapi.tiangolo.com
2. React 18 Documentation — https://react.dev
3. OpenAI API Reference — https://platform.openai.com/docs
4. MySQL 8.0 Reference Manual — https://dev.mysql.com/doc
5. OWASP Top 10 Web Application Security Risks — https://owasp.org
6. JSON Web Tokens RFC 7519 — https://tools.ietf.org/html/rfc7519
7. Chart.js Documentation — https://www.chartjs.org/docs
8. aiomysql Documentation — https://aiomysql.readthedocs.io

---

*Prepared for MCA Academic Submission — 2026*
