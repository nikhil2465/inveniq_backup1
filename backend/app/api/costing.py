"""
Costing Intelligence API — Product & Project Cost Analysis.
Accessible to 'costing_manager' role (module: costing).
DB-first / demo-fallback pattern. Tables auto-created on first DB call.
"""
import logging
from datetime import datetime
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Costing"])

# ── DB pool ────────────────────────────────────────────────────────────────────

async def _get_db_pool():
    from app.db.connection import get_pool
    return await get_pool()

# ── Table DDL ──────────────────────────────────────────────────────────────────

_COST_SHEETS_DDL = """
CREATE TABLE IF NOT EXISTS cost_sheets (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_name      VARCHAR(255)   NOT NULL,
    category          VARCHAR(100)   NOT NULL DEFAULT '',
    brand             VARCHAR(100)   DEFAULT '',
    sku_code          VARCHAR(100)   DEFAULT '',
    mat_cost          DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
    labor_cost        DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
    overhead_cost     DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
    sell_price        DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
    target_margin_pct DECIMAL(5,2)   NOT NULL DEFAULT 20.00,
    status            VARCHAR(20)    NOT NULL DEFAULT 'Active',
    notes             TEXT           DEFAULT NULL,
    created_by        VARCHAR(100)   DEFAULT '',
    approved_by       VARCHAR(100)   DEFAULT '',
    created_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_PROJECT_BUDGETS_DDL = """
CREATE TABLE IF NOT EXISTS project_budgets (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_name    VARCHAR(255)   NOT NULL,
    client_name     VARCHAR(255)   DEFAULT '',
    project_ref     VARCHAR(100)   DEFAULT '',
    budgeted_cost   DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
    actual_cost     DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
    progress_pct    TINYINT UNSIGNED DEFAULT 0,
    status          VARCHAR(30)    NOT NULL DEFAULT 'On Track',
    notes           TEXT           DEFAULT NULL,
    start_date      DATE           DEFAULT NULL,
    target_date     DATE           DEFAULT NULL,
    created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_tables_ready = False

async def _init_tables(pool) -> None:
    global _tables_ready
    if _tables_ready or not pool:
        return
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_COST_SHEETS_DDL)
                await cur.execute(_PROJECT_BUDGETS_DDL)
                await conn.commit()
        _tables_ready = True
    except Exception as exc:
        logger.warning("costing: table init failed — %s", exc)

# ── Demo data ──────────────────────────────────────────────────────────────────

_DEMO_COST_SHEETS = [
    {"id": 1,  "product_name": "Jaquar Kubix Shower Set",        "category": "CP Fittings",   "brand": "Jaquar",       "sku_code": "JAQ-KUB-001", "mat_cost": 2400,  "labor_cost": 240,  "overhead_cost": 480,  "sell_price": 3750,  "target_margin_pct": 20.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "sales_mgr", "created_at": "2026-05-01", "updated_at": "2026-06-01"},
    {"id": 2,  "product_name": "Hettich Quadro Drawer System",   "category": "Hardware",       "brand": "Hettich",      "sku_code": "HET-QDR-450", "mat_cost": 850,   "labor_cost": 120,  "overhead_cost": 170,  "sell_price": 1320,  "target_margin_pct": 18.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "",          "created_at": "2026-05-02", "updated_at": "2026-06-02"},
    {"id": 3,  "product_name": "Hindware Sanitaryware EWC",      "category": "Sanitary Ware",  "brand": "Hindware",     "sku_code": "HIN-EWC-CS",  "mat_cost": 3200,  "labor_cost": 300,  "overhead_cost": 640,  "sell_price": 4900,  "target_margin_pct": 18.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "",          "created_at": "2026-05-03", "updated_at": "2026-06-03"},
    {"id": 4,  "product_name": "Sunmica Galaxy Laminate 8x4",    "category": "Laminates",      "brand": "Sunmica",      "sku_code": "SUN-GAL-8X4", "mat_cost": 580,   "labor_cost": 60,   "overhead_cost": 116,  "sell_price": 950,   "target_margin_pct": 22.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "",          "created_at": "2026-05-04", "updated_at": "2026-06-04"},
    {"id": 5,  "product_name": "Merino Exterior HPL",            "category": "Laminates",      "brand": "Merino",       "sku_code": "MER-EXT-HPL", "mat_cost": 1200,  "labor_cost": 90,   "overhead_cost": 240,  "sell_price": 2000,  "target_margin_pct": 28.0, "status": "Pending Review", "notes": "Review margin target — market rate changed", "created_by": "cost_mgr", "approved_by": "",          "created_at": "2026-05-10", "updated_at": "2026-06-10"},
    {"id": 6,  "product_name": "Duravit D-Code Basin",           "category": "Sanitary Ware",  "brand": "Duravit",      "sku_code": "DUR-DCO-BAS", "mat_cost": 5800,  "labor_cost": 450,  "overhead_cost": 1160, "sell_price": 9200,  "target_margin_pct": 22.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "cfo",       "created_at": "2026-04-01", "updated_at": "2026-06-01"},
    {"id": 7,  "product_name": "Dorma Glass Door Fitting",       "category": "Hardware",       "brand": "Dorma",        "sku_code": "DOR-GDF-SET", "mat_cost": 4200,  "labor_cost": 380,  "overhead_cost": 840,  "sell_price": 6850,  "target_margin_pct": 25.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "",          "created_at": "2026-04-05", "updated_at": "2026-06-05"},
    {"id": 8,  "product_name": "Grohe Eurosmart Basin Mixer",    "category": "CP Fittings",    "brand": "Grohe",        "sku_code": "GRO-EUR-BAS", "mat_cost": 6500,  "labor_cost": 520,  "overhead_cost": 1300, "sell_price": 10750, "target_margin_pct": 25.0, "status": "Pending Review", "notes": "Grohe revised MRP — review pricing",     "created_by": "cost_mgr", "approved_by": "",          "created_at": "2026-05-15", "updated_at": "2026-06-15"},
    {"id": 9,  "product_name": "Hafele Stainless Handle 160mm",  "category": "Hardware",       "brand": "Hafele",       "sku_code": "HAF-SH-160",  "mat_cost": 280,   "labor_cost": 30,   "overhead_cost": 56,   "sell_price": 440,   "target_margin_pct": 18.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "",          "created_at": "2026-04-10", "updated_at": "2026-06-10"},
    {"id": 10, "product_name": "Asian Paints Royale Shyne 4L",   "category": "Paints",         "brand": "Asian Paints", "sku_code": "AP-ROY-4L",   "mat_cost": 680,   "labor_cost": 0,    "overhead_cost": 136,  "sell_price": 940,   "target_margin_pct": 14.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "",          "created_at": "2026-04-12", "updated_at": "2026-06-12"},
    {"id": 11, "product_name": "Jaquar Florentine Basin Mixer",  "category": "CP Fittings",    "brand": "Jaquar",       "sku_code": "JAQ-FLO-BAS", "mat_cost": 4800,  "labor_cost": 360,  "overhead_cost": 960,  "sell_price": 7680,  "target_margin_pct": 20.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "",          "created_at": "2026-04-15", "updated_at": "2026-06-15"},
    {"id": 12, "product_name": "Century Ply Prelam 18mm",        "category": "Laminates",      "brand": "Century Ply", "sku_code": "CPL-PRE-18",  "mat_cost": 1650,  "labor_cost": 80,   "overhead_cost": 330,  "sell_price": 2560,  "target_margin_pct": 22.0, "status": "Active",         "notes": "",                                       "created_by": "admin",    "approved_by": "",          "created_at": "2026-04-20", "updated_at": "2026-06-20"},
]

_DEMO_PROJECT_BUDGETS = [
    {"id": 1, "project_name": "Brigade Lakefront — 24 Units", "client_name": "Brigade Enterprises", "project_ref": "BL-2026-001", "budgeted_cost": 8400000, "actual_cost": 8750000, "progress_pct": 72,  "status": "Over Budget",   "notes": "CP fitting cost exceeded due to brand change", "start_date": "2026-01-15", "target_date": "2026-08-30", "created_at": "2026-01-15", "updated_at": "2026-06-10"},
    {"id": 2, "project_name": "Sobha Crystal — Master Bath",   "client_name": "Sobha Ltd",           "project_ref": "SC-2026-002", "budgeted_cost": 1200000, "actual_cost": 1080000, "progress_pct": 100, "status": "Under Budget",  "notes": "Completed within budget — hardware savings",   "start_date": "2026-02-01", "target_date": "2026-05-31", "created_at": "2026-02-01", "updated_at": "2026-06-01"},
    {"id": 3, "project_name": "Embassy Springs Villa Row",     "client_name": "Embassy Group",        "project_ref": "ES-2026-003", "budgeted_cost": 3600000, "actual_cost": 3420000, "progress_pct": 88,  "status": "Under Budget",  "notes": "Laminates discount from supplier",            "start_date": "2026-01-20", "target_date": "2026-07-31", "created_at": "2026-01-20", "updated_at": "2026-06-15"},
    {"id": 4, "project_name": "Purva Panorama 3BHK Fit-out",  "client_name": "Puravankara",          "project_ref": "PP-2026-004", "budgeted_cost": 950000,  "actual_cost": 960000,  "progress_pct": 45,  "status": "On Track",      "notes": "",                                            "start_date": "2026-03-01", "target_date": "2026-09-30", "created_at": "2026-03-01", "updated_at": "2026-06-20"},
    {"id": 5, "project_name": "Prestige Exora — Commercial",  "client_name": "Prestige Group",       "project_ref": "PE-2026-005", "budgeted_cost": 5200000, "actual_cost": 5180000, "progress_pct": 61,  "status": "On Track",      "notes": "On schedule",                                 "start_date": "2026-02-15", "target_date": "2026-09-15", "created_at": "2026-02-15", "updated_at": "2026-06-20"},
    {"id": 6, "project_name": "Salarpuria Sattva Penthouse",  "client_name": "Salarpuria",           "project_ref": "SS-2026-006", "budgeted_cost": 2800000, "actual_cost": 3100000, "progress_pct": 90,  "status": "Over Budget",   "notes": "Luxury sanitary upgrade requested by client", "start_date": "2026-01-10", "target_date": "2026-07-10", "created_at": "2026-01-10", "updated_at": "2026-06-18"},
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def _enrich_sheet(s: dict) -> dict:
    mat   = float(s.get("mat_cost",      0) or 0)
    lab   = float(s.get("labor_cost",    0) or 0)
    ovh   = float(s.get("overhead_cost", 0) or 0)
    sp    = float(s.get("sell_price",    0) or 0)
    total = mat + lab + ovh
    margin = ((sp - total) / sp * 100) if sp > 0 else 0
    return {**s, "total_cost": round(total, 2), "actual_margin_pct": round(margin, 2)}

def _project_auto_status(bud: float, act: float) -> str:
    if act <= 0 or bud <= 0:
        return "On Track"
    if act > bud * 1.02:
        return "Over Budget"
    if act < bud * 0.98:
        return "Under Budget"
    return "On Track"

def _serialize_dates(d: dict) -> dict:
    for k in ("created_at", "updated_at", "start_date", "target_date"):
        v = d.get(k)
        if v is not None and hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d

# ── Summary ────────────────────────────────────────────────────────────────────

@router.get("/costing/summary")
async def get_costing_summary():
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            import asyncio
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT
                            COUNT(*)                                        AS total_sheets,
                            COALESCE(SUM(mat_cost+labor_cost+overhead_cost),0) AS total_landed_cost,
                            COALESCE(AVG(CASE WHEN sell_price>0
                                THEN (sell_price - mat_cost - labor_cost - overhead_cost)/sell_price*100
                                ELSE 0 END), 0)                             AS avg_margin_pct,
                            SUM(CASE WHEN status='Pending Review' THEN 1 ELSE 0 END) AS pending_reviews
                        FROM cost_sheets WHERE status != 'Archived'
                    """)
                    r = await cur.fetchone()
                    sheets = {
                        "total_sheets": int(r[0] or 0),
                        "total_landed_cost": round(float(r[1] or 0), 2),
                        "avg_margin_pct": round(float(r[2] or 0), 2),
                        "pending_reviews": int(r[3] or 0),
                    }
                    await cur.execute("""
                        SELECT COUNT(*),
                               COALESCE(SUM(budgeted_cost),0),
                               COALESCE(SUM(actual_cost),0),
                               SUM(CASE WHEN actual_cost > budgeted_cost*1.02 THEN 1 ELSE 0 END)
                        FROM project_budgets WHERE status NOT IN ('Cancelled')
                    """)
                    r = await cur.fetchone()
                    tb = float(r[1] or 0); ta = float(r[2] or 0)
                    bv = round((ta - tb) / tb * 100, 2) if tb > 0 else 0
                    projects = {
                        "total_projects": int(r[0] or 0),
                        "total_budgeted": tb,
                        "total_actual": ta,
                        "budget_variance_pct": bv,
                        "over_budget_projects": int(r[3] or 0),
                    }
                    return {**sheets, **projects, "data_source": "live"}
        except Exception as exc:
            logger.warning("costing: summary DB failed — %s", exc)

    # Demo fallback
    active = [_enrich_sheet(dict(s)) for s in _DEMO_COST_SHEETS if s["status"] != "Archived"]
    tlc  = sum(s["total_cost"] for s in active)
    avgm = sum(s["actual_margin_pct"] for s in active) / len(active) if active else 0
    pend = sum(1 for s in _DEMO_COST_SHEETS if s["status"] == "Pending Review")
    tb   = sum(p["budgeted_cost"] for p in _DEMO_PROJECT_BUDGETS)
    ta   = sum(p["actual_cost"]   for p in _DEMO_PROJECT_BUDGETS)
    bv   = round((ta - tb) / tb * 100, 2) if tb > 0 else 0
    return {
        "total_sheets": len(active),
        "total_landed_cost": round(tlc, 2),
        "avg_margin_pct": round(avgm, 2),
        "pending_reviews": pend,
        "total_projects": len(_DEMO_PROJECT_BUDGETS),
        "total_budgeted": tb,
        "total_actual": ta,
        "budget_variance_pct": bv,
        "over_budget_projects": sum(1 for p in _DEMO_PROJECT_BUDGETS if p["status"] == "Over Budget"),
        "data_source": "demo",
    }

# ── Cost Sheets ────────────────────────────────────────────────────────────────

@router.get("/costing/cost-sheets")
async def list_cost_sheets(search: Optional[str] = None,
                            category: Optional[str] = None,
                            status: Optional[str] = None):
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    where, params = ["1=1"], []
                    if search:
                        q = f"%{search}%"
                        where.append("(product_name LIKE %s OR brand LIKE %s OR sku_code LIKE %s)")
                        params.extend([q, q, q])
                    if category and category != "All":
                        where.append("category=%s"); params.append(category)
                    if status and status != "All":
                        where.append("status=%s"); params.append(status)
                    else:
                        where.append("status!='Archived'")
                    await cur.execute(
                        f"SELECT * FROM cost_sheets WHERE {' AND '.join(where)} ORDER BY updated_at DESC LIMIT 300",
                        params
                    )
                    cols = [d[0] for d in cur.description]
                    rows = [_enrich_sheet(_serialize_dates(dict(zip(cols, r)))) for r in await cur.fetchall()]
                    await cur.execute(
                        "SELECT DISTINCT category FROM cost_sheets WHERE status!='Archived' ORDER BY category"
                    )
                    cats = [r[0] for r in await cur.fetchall()]
                    return {"cost_sheets": rows, "total": len(rows), "categories": cats, "data_source": "live"}
        except Exception as exc:
            logger.warning("costing: list_cost_sheets DB failed — %s", exc)

    sheets = [_enrich_sheet(dict(s)) for s in _DEMO_COST_SHEETS]
    if search:
        q = search.lower()
        sheets = [s for s in sheets if q in s["product_name"].lower() or q in (s.get("brand","")).lower()]
    if category and category != "All":
        sheets = [s for s in sheets if s["category"] == category]
    sheets = [s for s in sheets if s["status"] != "Archived"]
    if status and status != "All":
        sheets = [s for s in sheets if s["status"] == status]
    cats = sorted(set(s["category"] for s in _DEMO_COST_SHEETS if s["status"] != "Archived"))
    return {"cost_sheets": sheets, "total": len(sheets), "categories": cats, "data_source": "demo"}


@router.post("/costing/cost-sheets")
async def create_cost_sheet(body: dict):
    if not (body.get("product_name") or "").strip():
        raise HTTPException(status_code=422, detail="'product_name' is required")
    payload = {
        "product_name":      body.get("product_name","").strip(),
        "category":          body.get("category","").strip(),
        "brand":             body.get("brand","").strip(),
        "sku_code":          body.get("sku_code","").strip(),
        "mat_cost":          float(body.get("mat_cost",0) or 0),
        "labor_cost":        float(body.get("labor_cost",0) or 0),
        "overhead_cost":     float(body.get("overhead_cost",0) or 0),
        "sell_price":        float(body.get("sell_price",0) or 0),
        "target_margin_pct": float(body.get("target_margin_pct",20) or 20),
        "status":            body.get("status","Active"),
        "notes":             body.get("notes",""),
        "created_by":        body.get("created_by",""),
        "approved_by":       "",
    }
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        INSERT INTO cost_sheets
                            (product_name,category,brand,sku_code,mat_cost,labor_cost,
                             overhead_cost,sell_price,target_margin_pct,status,notes,created_by)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (payload["product_name"],payload["category"],payload["brand"],
                          payload["sku_code"],payload["mat_cost"],payload["labor_cost"],
                          payload["overhead_cost"],payload["sell_price"],
                          payload["target_margin_pct"],payload["status"],
                          payload["notes"],payload["created_by"]))
                    await conn.commit()
                    return {**_enrich_sheet(payload), "id": cur.lastrowid, "data_source": "live"}
        except Exception as exc:
            logger.error("costing: create_cost_sheet DB failed — %s", exc)
            raise HTTPException(status_code=500, detail="Database error creating cost sheet")
    new_id = max(s["id"] for s in _DEMO_COST_SHEETS) + 1
    row = {**payload, "id": new_id, "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()}
    _DEMO_COST_SHEETS.append(row)
    return {**_enrich_sheet(row), "data_source": "demo"}


@router.put("/costing/cost-sheets/{sheet_id}")
async def update_cost_sheet(sheet_id: int, body: dict):
    payload = {
        "product_name":      body.get("product_name","").strip(),
        "category":          body.get("category","").strip(),
        "brand":             body.get("brand","").strip(),
        "sku_code":          body.get("sku_code","").strip(),
        "mat_cost":          float(body.get("mat_cost",0) or 0),
        "labor_cost":        float(body.get("labor_cost",0) or 0),
        "overhead_cost":     float(body.get("overhead_cost",0) or 0),
        "sell_price":        float(body.get("sell_price",0) or 0),
        "target_margin_pct": float(body.get("target_margin_pct",20) or 20),
        "status":            body.get("status","Active"),
        "notes":             body.get("notes",""),
        "approved_by":       body.get("approved_by",""),
    }
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        UPDATE cost_sheets SET
                            product_name=%s,category=%s,brand=%s,sku_code=%s,
                            mat_cost=%s,labor_cost=%s,overhead_cost=%s,sell_price=%s,
                            target_margin_pct=%s,status=%s,notes=%s,approved_by=%s
                        WHERE id=%s
                    """, (payload["product_name"],payload["category"],payload["brand"],
                          payload["sku_code"],payload["mat_cost"],payload["labor_cost"],
                          payload["overhead_cost"],payload["sell_price"],
                          payload["target_margin_pct"],payload["status"],
                          payload["notes"],payload["approved_by"],sheet_id))
                    await conn.commit()
                    if cur.rowcount == 0:
                        raise HTTPException(status_code=404, detail="Cost sheet not found")
                    return {**_enrich_sheet(payload), "id": sheet_id, "data_source": "live"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("costing: update_cost_sheet DB failed — %s", exc)
            raise HTTPException(status_code=500, detail="Database error")
    for i, s in enumerate(_DEMO_COST_SHEETS):
        if s["id"] == sheet_id:
            _DEMO_COST_SHEETS[i] = {**s, **payload, "id": sheet_id, "updated_at": datetime.utcnow().isoformat()}
            return {**_enrich_sheet(_DEMO_COST_SHEETS[i]), "data_source": "demo"}
    raise HTTPException(status_code=404, detail="Cost sheet not found")


@router.delete("/costing/cost-sheets/{sheet_id}")
async def archive_cost_sheet(sheet_id: int):
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("UPDATE cost_sheets SET status='Archived' WHERE id=%s", (sheet_id,))
                    await conn.commit()
                    if cur.rowcount == 0:
                        raise HTTPException(status_code=404, detail="Cost sheet not found")
                    return {"success": True, "id": sheet_id}
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("costing: archive DB failed — %s", exc)
    for s in _DEMO_COST_SHEETS:
        if s["id"] == sheet_id:
            s["status"] = "Archived"
            return {"success": True, "id": sheet_id}
    raise HTTPException(status_code=404, detail="Cost sheet not found")

# ── Project Budgets ────────────────────────────────────────────────────────────

@router.get("/costing/project-budgets")
async def list_project_budgets(status: Optional[str] = None):
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    where, params = ["1=1"], []
                    if status and status != "All":
                        where.append("status=%s"); params.append(status)
                    await cur.execute(
                        f"SELECT * FROM project_budgets WHERE {' AND '.join(where)} ORDER BY updated_at DESC",
                        params
                    )
                    cols = [d[0] for d in cur.description]
                    rows = []
                    for r in await cur.fetchall():
                        d = _serialize_dates(dict(zip(cols, r)))
                        d["variance"]       = round(float(d.get("actual_cost",0) or 0) - float(d.get("budgeted_cost",0) or 0), 2)
                        d["budgeted_cost"]  = float(d.get("budgeted_cost",0) or 0)
                        d["actual_cost"]    = float(d.get("actual_cost",0) or 0)
                        rows.append(d)
                    return {"project_budgets": rows, "total": len(rows), "data_source": "live"}
        except Exception as exc:
            logger.warning("costing: list_project_budgets DB failed — %s", exc)
    blist = []
    for p in _DEMO_PROJECT_BUDGETS:
        d = dict(p); d["variance"] = d["actual_cost"] - d["budgeted_cost"]
        if status and status != "All" and d["status"] != status:
            continue
        blist.append(d)
    return {"project_budgets": blist, "total": len(blist), "data_source": "demo"}


@router.post("/costing/project-budgets")
async def create_project_budget(body: dict):
    if not (body.get("project_name") or "").strip():
        raise HTTPException(status_code=422, detail="'project_name' is required")
    bud = float(body.get("budgeted_cost",0) or 0)
    act = float(body.get("actual_cost",0) or 0)
    payload = {
        "project_name":  body.get("project_name","").strip(),
        "client_name":   body.get("client_name","").strip(),
        "project_ref":   body.get("project_ref","").strip(),
        "budgeted_cost": bud, "actual_cost": act,
        "progress_pct":  min(100, max(0, int(body.get("progress_pct",0) or 0))),
        "status":        body.get("status") or _project_auto_status(bud, act),
        "notes":         body.get("notes",""),
        "start_date":    body.get("start_date") or None,
        "target_date":   body.get("target_date") or None,
    }
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        INSERT INTO project_budgets
                            (project_name,client_name,project_ref,budgeted_cost,actual_cost,
                             progress_pct,status,notes,start_date,target_date)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (payload["project_name"],payload["client_name"],payload["project_ref"],
                          payload["budgeted_cost"],payload["actual_cost"],payload["progress_pct"],
                          payload["status"],payload["notes"],payload["start_date"],payload["target_date"]))
                    await conn.commit()
                    return {**payload, "id": cur.lastrowid, "variance": act-bud, "data_source": "live"}
        except Exception as exc:
            logger.error("costing: create_project_budget DB failed — %s", exc)
            raise HTTPException(status_code=500, detail="Database error")
    new_id = max(p["id"] for p in _DEMO_PROJECT_BUDGETS) + 1
    row = {**payload, "id": new_id, "variance": act-bud,
           "created_at": datetime.utcnow().isoformat(), "updated_at": datetime.utcnow().isoformat()}
    _DEMO_PROJECT_BUDGETS.append(row)
    return {**row, "data_source": "demo"}


@router.put("/costing/project-budgets/{budget_id}")
async def update_project_budget(budget_id: int, body: dict):
    bud = float(body.get("budgeted_cost",0) or 0)
    act = float(body.get("actual_cost",0) or 0)
    payload = {
        "project_name":  body.get("project_name","").strip(),
        "client_name":   body.get("client_name","").strip(),
        "project_ref":   body.get("project_ref","").strip(),
        "budgeted_cost": bud, "actual_cost": act,
        "progress_pct":  min(100, max(0, int(body.get("progress_pct",0) or 0))),
        "status":        body.get("status") or _project_auto_status(bud, act),
        "notes":         body.get("notes",""),
        "start_date":    body.get("start_date") or None,
        "target_date":   body.get("target_date") or None,
    }
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        UPDATE project_budgets SET
                            project_name=%s,client_name=%s,project_ref=%s,budgeted_cost=%s,
                            actual_cost=%s,progress_pct=%s,status=%s,notes=%s,
                            start_date=%s,target_date=%s
                        WHERE id=%s
                    """, (payload["project_name"],payload["client_name"],payload["project_ref"],
                          payload["budgeted_cost"],payload["actual_cost"],payload["progress_pct"],
                          payload["status"],payload["notes"],payload["start_date"],
                          payload["target_date"],budget_id))
                    await conn.commit()
                    if cur.rowcount == 0:
                        raise HTTPException(status_code=404, detail="Project budget not found")
                    return {**payload, "id": budget_id, "variance": act-bud, "data_source": "live"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("costing: update_project_budget DB failed — %s", exc)
            raise HTTPException(status_code=500, detail="Database error")
    for i, p in enumerate(_DEMO_PROJECT_BUDGETS):
        if p["id"] == budget_id:
            _DEMO_PROJECT_BUDGETS[i] = {**p, **payload, "id": budget_id, "variance": act-bud,
                                          "updated_at": datetime.utcnow().isoformat()}
            return {**_DEMO_PROJECT_BUDGETS[i], "data_source": "demo"}
    raise HTTPException(status_code=404, detail="Project budget not found")

# ── Variance Analysis ──────────────────────────────────────────────────────────

@router.get("/costing/variance")
async def get_variance():
    """
    Per-category variance: compares actual total cost vs implied target cost
    (what cost should be to achieve target_margin_pct at current sell_price).
    Positive variance = cost is higher than target → margin is being squeezed.
    """
    pool = await _get_db_pool()
    if pool:
        await _init_tables(pool)
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT category,
                               SUM(sell_price*(1-target_margin_pct/100)) AS target_cost,
                               SUM(mat_cost+labor_cost+overhead_cost)    AS actual_cost,
                               COUNT(*)                                   AS sheet_count
                        FROM cost_sheets WHERE status!='Archived'
                        GROUP BY category ORDER BY category
                    """)
                    result = []
                    for r in await cur.fetchall():
                        tc = float(r[1] or 0); ac = float(r[2] or 0)
                        var = round(ac - tc, 2)
                        vpct = round((ac-tc)/tc*100, 1) if tc > 0 else 0
                        result.append({"category": r[0], "budgeted": round(tc,2), "actual": round(ac,2),
                                        "variance": var, "variance_pct": vpct, "sheet_count": int(r[3])})
                    return {"variances": result, "data_source": "live"}
        except Exception as exc:
            logger.warning("costing: variance DB failed — %s", exc)

    # Demo fallback
    cat_data = defaultdict(lambda: {"tc": 0.0, "ac": 0.0, "cnt": 0})
    for s in _DEMO_COST_SHEETS:
        if s["status"] == "Archived":
            continue
        sp  = float(s["sell_price"])
        tc  = sp * (1 - float(s["target_margin_pct"]) / 100)
        ac  = float(s["mat_cost"]) + float(s["labor_cost"]) + float(s["overhead_cost"])
        cat_data[s["category"]]["tc"] += tc
        cat_data[s["category"]]["ac"] += ac
        cat_data[s["category"]]["cnt"] += 1
    result = []
    for cat, d in sorted(cat_data.items()):
        tc = d["tc"]; ac = d["ac"]
        var = round(ac - tc, 2)
        vpct = round((ac-tc)/tc*100, 1) if tc > 0 else 0
        result.append({"category": cat, "budgeted": round(tc,2), "actual": round(ac,2),
                        "variance": var, "variance_pct": vpct, "sheet_count": d["cnt"]})
    return {"variances": result, "data_source": "demo"}
