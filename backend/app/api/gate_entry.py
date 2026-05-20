"""
Gate Entry API — Vehicle arrival logging and DC verification before GRN.
Supports the P2P cycle step: PO → Gate Entry → GRN.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Gate Entry"])

try:
    from app.db.connection import get_pool
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


# ── DB bootstrap ───────────────────────────────────────────────────────────────

async def _ensure_tables():
    if not _DB_AVAILABLE:
        return
    try:
        pool = await get_pool()
        if not pool:
            return
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS gate_entries (
                        entry_id        INT AUTO_INCREMENT PRIMARY KEY,
                        entry_number    VARCHAR(40)  NOT NULL UNIQUE,
                        vehicle_number  VARCHAR(30)  NOT NULL,
                        driver_name     VARCHAR(100),
                        driver_contact  VARCHAR(20),
                        supplier_name   VARCHAR(150) NOT NULL,
                        po_reference    VARCHAR(40),
                        dc_number       VARCHAR(80)  NOT NULL,
                        dc_date         DATE,
                        entry_time      DATETIME     NOT NULL,
                        exit_time       DATETIME,
                        security_guard  VARCHAR(100),
                        status          ENUM('ARRIVED','VERIFIED','FORWARDED_TO_STORE','REJECTED','DEPARTED')
                                        NOT NULL DEFAULT 'ARRIVED',
                        material_desc   TEXT,
                        seal_intact     TINYINT(1)   NOT NULL DEFAULT 1,
                        doc_verified    TINYINT(1)   NOT NULL DEFAULT 0,
                        rejection_reason TEXT,
                        forwarded_grn   VARCHAR(40),
                        notes           TEXT,
                        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
    except Exception as exc:
        logger.warning("Gate entry table bootstrap failed: %s", exc)


# ── DB helpers ─────────────────────────────────────────────────────────────────

async def _db_list(status: str, limit: int, offset: int):
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                if status:
                    await cur.execute("""
                        SELECT * FROM gate_entries WHERE status=%s
                        ORDER BY entry_time DESC LIMIT %s OFFSET %s
                    """, (status, limit, offset))
                else:
                    await cur.execute("""
                        SELECT * FROM gate_entries
                        ORDER BY entry_time DESC LIMIT %s OFFSET %s
                    """, (limit, offset))
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, r)) for r in rows]
    except Exception as exc:
        logger.warning("Gate entry list DB error: %s", exc)
        return None


# ── Mock data ──────────────────────────────────────────────────────────────────

_MOCK_ENTRIES = [
    {"entry_id": 1, "entry_number": "GE-20260518-001",
     "vehicle_number": "MH-04-AB-1234", "driver_name": "Ramu Yadav",
     "driver_contact": "9876543210", "supplier_name": "Ebco India Pvt Ltd",
     "po_reference": "PO-20260516-001", "dc_number": "EBCO/DC/2026/341",
     "dc_date": "2026-05-17", "entry_time": "2026-05-18 09:15:00",
     "exit_time": "2026-05-18 10:45:00", "security_guard": "Guard 1",
     "status": "FORWARDED_TO_STORE", "material_desc": "Soft-close hinges, handles, drawer systems",
     "seal_intact": 1, "doc_verified": 1, "rejection_reason": None,
     "forwarded_grn": "GRN-20260518-001", "notes": None,
     "created_at": "2026-05-18 09:15:00"},
    {"entry_id": 2, "entry_number": "GE-20260519-001",
     "vehicle_number": "GJ-01-ZX-5678", "driver_name": "Suresh Patel",
     "driver_contact": "9765432100", "supplier_name": "Jaquar India",
     "po_reference": "PO-20260516-002", "dc_number": "JAQ/DC/2026/1021",
     "dc_date": "2026-05-18", "entry_time": "2026-05-19 11:30:00",
     "exit_time": None, "security_guard": "Guard 2",
     "status": "VERIFIED", "material_desc": "Basin mixers, shower panels, CP fittings",
     "seal_intact": 1, "doc_verified": 1, "rejection_reason": None,
     "forwarded_grn": None, "notes": "Waiting for stores dept availability",
     "created_at": "2026-05-19 11:30:00"},
    {"entry_id": 3, "entry_number": "GE-20260520-001",
     "vehicle_number": "MH-12-CD-9090", "driver_name": "Manoj Kumar",
     "driver_contact": "9988776655", "supplier_name": "Unknown Vendor",
     "po_reference": None, "dc_number": "UV/DC/2026/55",
     "dc_date": "2026-05-20", "entry_time": "2026-05-20 08:00:00",
     "exit_time": "2026-05-20 08:30:00", "security_guard": "Guard 1",
     "status": "REJECTED", "material_desc": "Hardware items",
     "seal_intact": 0, "doc_verified": 0,
     "rejection_reason": "No valid PO reference. Seal broken. DC mismatch.",
     "forwarded_grn": None, "notes": "Sent back to vendor",
     "created_at": "2026-05-20 08:00:00"},
    {"entry_id": 4, "entry_number": "GE-20260520-002",
     "vehicle_number": "RJ-14-GH-3344", "driver_name": "Bharat Singh",
     "driver_contact": "9123456789", "supplier_name": "Hettich India",
     "po_reference": "PO-20260519-005", "dc_number": "HET/DC/2026/887",
     "dc_date": "2026-05-20", "entry_time": "2026-05-20 14:00:00",
     "exit_time": None, "security_guard": "Guard 3",
     "status": "ARRIVED", "material_desc": "InnoTech drawer systems, sliding fittings",
     "seal_intact": 1, "doc_verified": 0,
     "rejection_reason": None, "forwarded_grn": None,
     "notes": "Documents under verification", "created_at": "2026-05-20 14:00:00"},
]


# ── Models ─────────────────────────────────────────────────────────────────────

class GateEntryCreateIn(BaseModel):
    vehicle_number: str
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    supplier_name: str
    po_reference: Optional[str] = None
    dc_number: str
    dc_date: Optional[str] = None
    security_guard: Optional[str] = None
    material_desc: Optional[str] = None
    seal_intact: bool = True
    notes: Optional[str] = None


class GateEntryVerifyIn(BaseModel):
    doc_verified: bool
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None


class GateEntryForwardIn(BaseModel):
    grn_number: Optional[str] = None
    notes: Optional[str] = None


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/gate-entry", summary="List Gate Entries")
async def list_entries(
    status: str = Query("", description="Filter by status"),
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    await _ensure_tables()
    data = await _db_list(status.upper() if status else "", limit, offset)
    if data is not None:
        return {"data_source": "mysql", "entries": data, "total": len(data)}
    filtered = [e for e in _MOCK_ENTRIES if not status or e["status"] == status.upper()]
    return {"data_source": "demo", "entries": filtered[offset:offset+limit], "total": len(filtered)}


@router.get("/gate-entry/kpis", summary="Gate Entry KPI summary")
async def gate_kpis():
    await _ensure_tables()
    if not _DB_AVAILABLE:
        return {"data_source": "demo",
                "arrived": 1, "verified": 1, "forwarded_to_store": 1,
                "rejected": 1, "departed": 0, "total_today": 3}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                today = datetime.date.today().isoformat()
                await cur.execute("""
                    SELECT
                        SUM(CASE WHEN status='ARRIVED'             THEN 1 ELSE 0 END) AS arrived,
                        SUM(CASE WHEN status='VERIFIED'            THEN 1 ELSE 0 END) AS verified,
                        SUM(CASE WHEN status='FORWARDED_TO_STORE'  THEN 1 ELSE 0 END) AS forwarded_to_store,
                        SUM(CASE WHEN status='REJECTED'            THEN 1 ELSE 0 END) AS rejected,
                        SUM(CASE WHEN status='DEPARTED'            THEN 1 ELSE 0 END) AS departed,
                        SUM(CASE WHEN DATE(entry_time)=%s          THEN 1 ELSE 0 END) AS total_today
                    FROM gate_entries
                """, (today,))
                row = await cur.fetchone()
                cols = [d[0] for d in cur.description]
                result = dict(zip(cols, row)) if row else {}
                return {"data_source": "mysql", **{k: (v or 0) for k, v in result.items()}}
    except Exception as exc:
        logger.warning("Gate kpis DB error: %s", exc)
        return {"data_source": "demo",
                "arrived": 1, "verified": 1, "forwarded_to_store": 1,
                "rejected": 1, "departed": 0, "total_today": 3}


@router.post("/gate-entry", summary="Create Gate Entry", status_code=201)
async def create_entry(payload: GateEntryCreateIn):
    await _ensure_tables()
    now    = datetime.datetime.utcnow()
    today  = now.strftime("%Y%m%d")
    ts     = now.strftime("%H%M%S")
    entry_number = f"GE-{today}-{ts}"

    if not _DB_AVAILABLE:
        return {"data_source": "demo", "entry_number": entry_number, "status": "ARRIVED"}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO gate_entries
                        (entry_number, vehicle_number, driver_name, driver_contact,
                         supplier_name, po_reference, dc_number, dc_date, entry_time,
                         security_guard, status, material_desc, seal_intact, doc_verified, notes)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ARRIVED',%s,%s,0,%s)
                """, (entry_number, payload.vehicle_number, payload.driver_name,
                      payload.driver_contact, payload.supplier_name, payload.po_reference,
                      payload.dc_number, payload.dc_date, now.isoformat(),
                      payload.security_guard, payload.material_desc,
                      int(payload.seal_intact), payload.notes))
                entry_id = cur.lastrowid
                return {"data_source": "mysql", "entry_number": entry_number,
                        "entry_id": entry_id, "status": "ARRIVED"}
    except Exception as exc:
        logger.error("Gate entry create error: %s", exc)
        return {"data_source": "demo", "entry_number": entry_number, "status": "ARRIVED"}


@router.patch("/gate-entry/{entry_id}/verify", summary="Verify Gate Entry Documents")
async def verify_entry(entry_id: int, payload: GateEntryVerifyIn):
    status = "VERIFIED" if payload.doc_verified and not payload.rejection_reason else "REJECTED"

    if not _DB_AVAILABLE:
        return {"data_source": "demo", "entry_id": entry_id, "status": status}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    UPDATE gate_entries
                    SET status=%s, doc_verified=%s, rejection_reason=%s,
                        notes=COALESCE(%s, notes)
                    WHERE entry_id=%s AND status='ARRIVED'
                """, (status, int(payload.doc_verified), payload.rejection_reason,
                      payload.notes, entry_id))
                if cur.rowcount == 0:
                    raise HTTPException(422, "Entry not found or not in ARRIVED state")
                return {"data_source": "mysql", "entry_id": entry_id, "status": status}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Gate entry verify error: %s", exc)
        return {"data_source": "demo", "entry_id": entry_id, "status": status}


@router.patch("/gate-entry/{entry_id}/forward", summary="Forward to Store / initiate GRN")
async def forward_entry(entry_id: int, payload: GateEntryForwardIn):
    if not _DB_AVAILABLE:
        return {"data_source": "demo", "entry_id": entry_id, "status": "FORWARDED_TO_STORE"}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    UPDATE gate_entries
                    SET status='FORWARDED_TO_STORE', forwarded_grn=%s,
                        notes=COALESCE(%s, notes)
                    WHERE entry_id=%s AND status='VERIFIED'
                """, (payload.grn_number, payload.notes, entry_id))
                if cur.rowcount == 0:
                    raise HTTPException(422, "Entry not found or not in VERIFIED state")
                return {"data_source": "mysql", "entry_id": entry_id, "status": "FORWARDED_TO_STORE"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Gate entry forward error: %s", exc)
        return {"data_source": "demo", "entry_id": entry_id, "status": "FORWARDED_TO_STORE"}
