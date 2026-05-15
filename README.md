# InvenIQ — AI Inventory Intelligence Platform

> **A complete AI intelligence layer for dealers and distributors.**
> 26 modules · GPT-4o AI chat · JWT authentication · MySQL + Demo mode. Zero setup required.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react)](https://reactjs.org)
[![OpenAI](https://img.shields.io/badge/GPT--4o-Powered-10a37f?style=flat&logo=openai)](https://openai.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat&logo=mysql&logoColor=white)](https://mysql.com)

---

## What Is InvenIQ?

InvenIQ v3.0 is a full-stack AI intelligence platform for **building materials dealers and distributors** (plywood, laminates, louvers, hardware, etc.). It turns raw inventory, sales, procurement, and finance data into clear decisions — delivered through **26 specialised modules** and a **GPT-4o-powered AI assistant**.

**Works 100% without a database.** All 26 modules display rich demo data with zero configuration — only add your OpenAI API key to unlock AI features.

---

## Key Capabilities

| Category | Features |
|---|---|
| **AI Chat** | GPT-4o streaming · 4 routing paths · 19 MCP tools · 14 RCA templates · 23 KB topics |
| **Inventory** | Stock intelligence · Dead stock recovery · Demand forecasting · Inward/outward tracking |
| **Sales & CRM** | Sales performance · Customer intelligence · Orders · Claims & rebates · Freight |
| **Procurement** | PO & GRN lifecycle · Supplier management · Warehouse management |
| **Finance** | Profitability · Cash flow · Credit management · Counter POS |
| **Pricing** | Quotation builder · Discount calculator · Scheme management |
| **Projects** | Project tracker · Pipeline management |
| **Platform** | JWT auth · Module-level access control · PWA-ready · Dark mode · Keyboard nav |

---

## All 26 Modules

`overview` `analytics` `inventory` `catalog` `demand` `deadstock` `inward` `warehouse`
`procurement` `pogrn` `sales` `customers` `louvers` `orders` `freight` `claims`
`discounts` `projects` `quotes` `finance` `credit` `pos` `schemes` `chatbot` `about` `settings`

---

## Quick Start

### Option A — Demo Mode (Zero Setup)

```bash
# 1. Clone
git clone https://github.com/nikhil2465/InvenIQ.git
cd InvenIQ

# 2. Backend
cd backend
cp .env.example .env
# (optional) add OPENAI_API_KEY to .env for AI features
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 3. Frontend (new terminal)
cd ../frontend
npm install
npm start
# Opens at http://localhost:3000
```

**Login:** `admin` / `inveniq@2024`

### Option B — Windows One-Click

```bat
start.bat          # dev mode  (React :3000 + FastAPI :8000, hot-reload)
start_prod.bat     # prod mode (FastAPI serves the React build on :8000)
```

### Option C — Docker

```bash
# Demo mode (no MySQL)
docker compose up -d

# Full stack with MySQL
docker compose --profile mysql up -d
# Open http://localhost
```

---

## Environment Variables

Copy `backend/.env.example` → `backend/.env` and configure:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | For AI | GPT-4o key from platform.openai.com |
| `MYSQL_HOST` | Optional | Leave blank for demo mode |
| `MYSQL_USER` | Optional | Database username |
| `MYSQL_PASSWORD` | Optional | Database password |
| `MYSQL_DB` | Optional | Database name (default: `stocksense_inventory`) |
| `JWT_SECRET_KEY` | **Change in prod** | Random 32+ char string |
| `AUTH_USERNAME` | Optional | Login username (default: `admin`) |
| `AUTH_PASSWORD` | Optional | Login password (default: `inveniq@2024`) |

---

## Client Deployment

To deploy for a client with restricted module access:

1. Copy `deploy/client.env.example` → `backend/.env`
2. Fill in `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_ALLOWED_MODULES`
3. Set `OWNER_USERNAME` / `OWNER_PASSWORD` for your private admin backdoor
4. Run `deploy/windows/install.bat` (first time) then `start_prod.bat`

**Or use Docker:**
```bash
docker compose up -d
```

---

## Architecture

```
InvenIQ/
├── backend/              # FastAPI + Python
│   ├── app/
│   │   ├── api/          # 15 API routers (auth, chat, dashboard, catalog, …)
│   │   ├── core/         # Config, JWT auth, TTL cache
│   │   ├── db/           # aiomysql pool, query modules
│   │   └── services/     # AI orchestrator, RCA engine, tools, knowledge base
│   └── requirements.txt
├── frontend/             # React 18 SPA
│   ├── src/
│   │   ├── views/        # 26 lazy-loaded view components
│   │   ├── components/   # Sidebar, Topbar, ErrorBoundary, Skeleton, Toast…
│   │   └── utils/        # chartHelpers, exportUtils, useAutoRefresh, authUtils
│   └── package.json
├── database/             # MySQL schema + seed data
├── deploy/               # Windows install/start/stop/update scripts
├── scripts/              # Utility scripts (Ebco catalog builder, importer)
├── docs/                 # Reference documents and quotation templates
├── docker-compose.yml
├── Dockerfile
└── start.bat             # Windows one-click dev startup
```

**AI Chat Pipeline (4-path routing in `orchestrator.py`):**
1. `is_generic_query()` → greeting / small talk path
2. `is_knowledge_query()` → 23-topic KB + live data (inventory concepts, best practices)
3. `is_insights_query()` → 13 rule-based insight types + all 19 MCP tools
4. Normal → tool selector → RCA engine → GPT-4o streaming

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Chart.js 4, DOMPurify 3, PWA service worker |
| Backend | FastAPI 0.115, Python 3.11+, uvicorn |
| AI | OpenAI GPT-4o (chat + vision), GPT-4o-mini (analysis) |
| Database | MySQL 8.0 via aiomysql (async pool with reconnection) |
| Auth | JWT (python-jose), bcrypt, per-module access control |
| Rate limiting | slowapi (200 req/min global) |
| Compression | GZip middleware (automatic) |
| Deployment | Docker + nginx, or Windows bat scripts |

---

## Database Setup (Optional)

```sql
-- Run in your MySQL instance:
SOURCE database/schema.sql;
SOURCE database/seed_complete.sql;
```

Point `MYSQL_HOST` to your MySQL server in `backend/.env`. The backend auto-detects connection and switches from demo → live data with no restart needed for the frontend.

---

## Security Notes

- Change `JWT_SECRET_KEY` before production deployment
- Change default credentials (`AUTH_USERNAME` / `AUTH_PASSWORD`) before client delivery
- The `AUTH_ROLE=client` setting enforces module-level API access at the middleware layer
- HTTPS termination should be handled by nginx or a reverse proxy in front of the app

---

## License

MIT — see [LICENSE](LICENSE) for details.
