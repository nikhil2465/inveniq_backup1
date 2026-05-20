"""
Purchase Requisition API — PR creation, approval workflow, PO conversion.
Supports the P2P cycle step: PR → Approval → PO.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Purchase Requisition"])

try:
    from app.db.connection import get_pool
    from app.db.po_grn_queries import (
        ensure_approval_schema as _ensure_po_approval_schema,
        ensure_landing_cost_schema as _ensure_lc_schema,
    )
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False
    _ensure_po_approval_schema = None
    _ensure_lc_schema = None


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
                    CREATE TABLE IF NOT EXISTS purchase_requisitions (
                        pr_id           INT AUTO_INCREMENT PRIMARY KEY,
                        pr_number       VARCHAR(40)  NOT NULL UNIQUE,
                        requested_by    VARCHAR(100) NOT NULL,
                        department      VARCHAR(80)  NOT NULL DEFAULT 'Stores',
                        pr_date         DATE         NOT NULL,
                        required_by     DATE,
                        status          ENUM('PENDING','APPROVED','REJECTED','CONVERTED','CANCELLED')
                                        NOT NULL DEFAULT 'PENDING',
                        priority        ENUM('LOW','NORMAL','HIGH','URGENT')
                                        NOT NULL DEFAULT 'NORMAL',
                        notes           TEXT,
                        approved_by     VARCHAR(100),
                        approved_at     DATETIME,
                        rejection_reason TEXT,
                        converted_po_number VARCHAR(40),
                        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS pr_items (
                        pr_item_id       INT AUTO_INCREMENT PRIMARY KEY,
                        pr_id            INT          NOT NULL,
                        sku_name         VARCHAR(200) NOT NULL,
                        category         VARCHAR(80),
                        qty_required     DECIMAL(10,2) NOT NULL,
                        unit             VARCHAR(20)  NOT NULL DEFAULT 'pcs',
                        estimated_price  DECIMAL(12,2),
                        purpose          TEXT,
                        preferred_supplier VARCHAR(100),
                        FOREIGN KEY (pr_id) REFERENCES purchase_requisitions(pr_id)
                            ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
    except Exception as exc:
        logger.warning("PR table bootstrap failed: %s", exc)


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
                        SELECT pr.*, COUNT(pi.pr_item_id) AS item_count,
                               COALESCE(SUM(pi.qty_required * COALESCE(pi.estimated_price,0)),0) AS estimated_value
                        FROM purchase_requisitions pr
                        LEFT JOIN pr_items pi ON pi.pr_id = pr.pr_id
                        WHERE pr.status = %s
                        GROUP BY pr.pr_id ORDER BY pr.created_at DESC
                        LIMIT %s OFFSET %s
                    """, (status, limit, offset))
                else:
                    await cur.execute("""
                        SELECT pr.*, COUNT(pi.pr_item_id) AS item_count,
                               COALESCE(SUM(pi.qty_required * COALESCE(pi.estimated_price,0)),0) AS estimated_value
                        FROM purchase_requisitions pr
                        LEFT JOIN pr_items pi ON pi.pr_id = pr.pr_id
                        GROUP BY pr.pr_id ORDER BY pr.created_at DESC
                        LIMIT %s OFFSET %s
                    """, (limit, offset))
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, r)) for r in rows]
    except Exception as exc:
        logger.warning("PR list DB error: %s", exc)
        return None


async def _db_get(pr_id: int):
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT * FROM purchase_requisitions WHERE pr_id=%s", (pr_id,))
                row = await cur.fetchone()
                if not row:
                    return {}
                cols = [d[0] for d in cur.description]
                pr = dict(zip(cols, row))
                await cur.execute("SELECT * FROM pr_items WHERE pr_id=%s ORDER BY pr_item_id", (pr_id,))
                irows = await cur.fetchall()
                icols = [d[0] for d in cur.description]
                pr["items"] = [dict(zip(icols, r)) for r in irows]
                return pr
    except Exception as exc:
        logger.warning("PR get DB error: %s", exc)
        return None


# ── Mock data ──────────────────────────────────────────────────────────────────

_MOCK_PRS = [
    {"pr_id": 1, "pr_number": "PR-2026-001", "requested_by": "Stores Manager",
     "department": "Stores", "pr_date": "2026-05-18", "required_by": "2026-05-25",
     "status": "PENDING", "priority": "HIGH", "notes": "Urgent reorder for festive season",
     "approved_by": None, "approved_at": None, "rejection_reason": None,
     "converted_po_number": None, "item_count": 3, "estimated_value": 42500.00,
     "created_at": "2026-05-18 09:30:00"},
    {"pr_id": 2, "pr_number": "PR-2026-002", "requested_by": "Production Head",
     "department": "Production", "pr_date": "2026-05-19", "required_by": "2026-05-28",
     "status": "APPROVED", "priority": "NORMAL", "notes": "Raw material for May batch",
     "approved_by": "Admin", "approved_at": "2026-05-19 14:00:00", "rejection_reason": None,
     "converted_po_number": None, "item_count": 5, "estimated_value": 87200.00,
     "created_at": "2026-05-19 10:00:00"},
    {"pr_id": 3, "pr_number": "PR-2026-003", "requested_by": "Purchase Dept",
     "department": "Purchase", "pr_date": "2026-05-20", "required_by": "2026-05-30",
     "status": "CONVERTED", "priority": "URGENT", "notes": "Converted to PO-20260520-011",
     "approved_by": "Admin", "approved_at": "2026-05-20 08:00:00", "rejection_reason": None,
     "converted_po_number": "PO-20260520-011", "item_count": 2, "estimated_value": 31000.00,
     "created_at": "2026-05-20 07:30:00"},
    {"pr_id": 4, "pr_number": "PR-2026-004", "requested_by": "PPC Team",
     "department": "PPC", "pr_date": "2026-05-20", "required_by": "2026-06-01",
     "status": "REJECTED", "priority": "LOW", "notes": "Deferred to next quarter",
     "approved_by": "Admin", "approved_at": None, "rejection_reason": "Budget freeze",
     "converted_po_number": None, "item_count": 1, "estimated_value": 9800.00,
     "created_at": "2026-05-20 11:00:00"},
]

_MOCK_PR_ITEMS = {
    1: [
        {"pr_item_id": 1, "sku_name": "Ebco Soft-Close Hinge 35mm Pk-10", "category": "Hardware Fittings", "qty_required": 50, "unit": "pcs", "estimated_price": 485.00, "purpose": "Cabinet production", "preferred_supplier": "Ebco India"},
        {"pr_item_id": 2, "sku_name": "Jaquar Lyric Basin Mixer Chrome", "category": "Sanitary CP Fittings", "qty_required": 20, "unit": "pcs", "estimated_price": 4850.00, "purpose": "Showroom display", "preferred_supplier": "Jaquar India"},
        {"pr_item_id": 3, "sku_name": "Hafele Zinc D-Handle 128mm", "category": "Hardware Fittings", "qty_required": 100, "unit": "pcs", "estimated_price": 320.00, "purpose": "Kitchen systems", "preferred_supplier": "Hafele India"},
    ],
    2: [
        {"pr_item_id": 4, "sku_name": "Hettich InnoTech Drawer 400mm", "category": "Kitchen Systems", "qty_required": 30, "unit": "pcs", "estimated_price": 1280.00, "purpose": "Production batch Q2", "preferred_supplier": "Hettich India"},
    ],
}


# ── Models ─────────────────────────────────────────────────────────────────────

class PRItemIn(BaseModel):
    sku_name: str
    category: Optional[str] = "General"
    qty_required: float
    unit: str = "pcs"
    estimated_price: Optional[float] = None
    purpose: Optional[str] = None
    preferred_supplier: Optional[str] = None


class PRCreateIn(BaseModel):
    requested_by: str
    department: str = "Stores"
    required_by: Optional[str] = None
    priority: str = "NORMAL"
    notes: Optional[str] = None
    items: list[PRItemIn]


class PRStatusIn(BaseModel):
    status: str
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None


class PRToPOIn(BaseModel):
    supplier_name: str
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    operation_type: Optional[str] = "Project Purchase"


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/pr", summary="List Purchase Requisitions")
async def list_prs(
    status: str = Query("", description="Filter by status"),
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    await _ensure_tables()
    data = await _db_list(status.upper() if status else "", limit, offset)
    if data is not None:
        return {"data_source": "mysql", "prs": data, "total": len(data)}
    filtered = [p for p in _MOCK_PRS if not status or p["status"] == status.upper()]
    return {"data_source": "demo", "prs": filtered[offset:offset+limit], "total": len(filtered)}


@router.get("/pr/kpis", summary="PR KPI summary")
async def pr_kpis():
    await _ensure_tables()
    if not _DB_AVAILABLE:
        return {"data_source": "demo", "pending": 1, "approved": 1, "converted": 1, "rejected": 1,
                "total_value": 170500.00}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    SELECT status, COUNT(*) AS cnt,
                           COALESCE(SUM(pi.qty_required * COALESCE(pi.estimated_price,0)),0) AS val
                    FROM purchase_requisitions pr
                    LEFT JOIN pr_items pi ON pi.pr_id = pr.pr_id
                    GROUP BY status
                """)
                rows = await cur.fetchall()
                result = {"pending": 0, "approved": 0, "converted": 0, "rejected": 0, "total_value": 0}
                for row in rows:
                    k = str(row[0]).lower()
                    if k in result:
                        result[k] = int(row[1])
                    result["total_value"] += float(row[2] or 0)
                return {"data_source": "mysql", **result}
    except Exception as exc:
        logger.warning("PR kpis DB error: %s", exc)
        return {"data_source": "demo", "pending": 1, "approved": 1, "converted": 1, "rejected": 1,
                "total_value": 170500.00}


@router.get("/pr/{pr_id}", summary="Get Purchase Requisition Detail")
async def get_pr(pr_id: int):
    await _ensure_tables()
    data = await _db_get(pr_id)
    if data is not None:
        if not data:
            raise HTTPException(404, "PR not found")
        return {"data_source": "mysql", "pr": data}
    pr = next((p for p in _MOCK_PRS if p["pr_id"] == pr_id), None)
    if not pr:
        raise HTTPException(404, "PR not found")
    return {"data_source": "demo", "pr": {**pr, "items": _MOCK_PR_ITEMS.get(pr_id, [])}}


@router.post("/pr", summary="Create Purchase Requisition", status_code=201)
async def create_pr(payload: PRCreateIn):
    await _ensure_tables()
    today = datetime.date.today()
    ts    = datetime.datetime.utcnow().strftime("%m%d%H%M%S")
    pr_number = f"PR-{today.year}-{ts}"

    if not _DB_AVAILABLE:
        return {"data_source": "demo", "pr_number": pr_number, "status": "PENDING"}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT INTO purchase_requisitions
                        (pr_number, requested_by, department, pr_date, required_by, priority, notes, status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,'PENDING')
                """, (pr_number, payload.requested_by, payload.department,
                      today.isoformat(), payload.required_by, payload.priority, payload.notes))
                pr_id = cur.lastrowid
                for it in payload.items:
                    await cur.execute("""
                        INSERT INTO pr_items
                            (pr_id, sku_name, category, qty_required, unit, estimated_price, purpose, preferred_supplier)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (pr_id, it.sku_name, it.category, it.qty_required,
                          it.unit, it.estimated_price, it.purpose, it.preferred_supplier))
                return {"data_source": "mysql", "pr_number": pr_number, "pr_id": pr_id, "status": "PENDING"}
    except Exception as exc:
        logger.error("PR create error: %s", exc)
        return {"data_source": "demo", "pr_number": pr_number, "status": "PENDING"}


@router.patch("/pr/{pr_id}/status", summary="Approve or Reject PR")
async def update_pr_status(pr_id: int, payload: PRStatusIn):
    valid = {"APPROVED", "REJECTED", "CANCELLED"}
    status = payload.status.upper()
    if status not in valid:
        raise HTTPException(422, f"status must be one of: {', '.join(sorted(valid))}")

    if not _DB_AVAILABLE:
        return {"data_source": "demo", "pr_id": pr_id, "status": status}
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    UPDATE purchase_requisitions
                    SET status=%s, approved_by=%s,
                        approved_at=%s,
                        rejection_reason=%s
                    WHERE pr_id=%s
                """, (
                    status, payload.approved_by,
                    datetime.datetime.utcnow().isoformat() if status == "APPROVED" else None,
                    payload.rejection_reason, pr_id,
                ))
                if cur.rowcount == 0:
                    raise HTTPException(404, "PR not found")
                return {"data_source": "mysql", "pr_id": pr_id, "status": status}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("PR status update error: %s", exc)
        return {"data_source": "demo", "pr_id": pr_id, "status": status}


@router.post("/pr/{pr_id}/to-po", summary="Convert Approved PR to Draft Purchase Order")
async def convert_pr_to_po(pr_id: int, payload: PRToPOIn):
    """
    Convert an APPROVED PR into a DRAFT Purchase Order.
    The PO starts in DRAFT status and requires Sales + Finance approval
    before it can be released to the supplier.
    """
    today = datetime.date.today()
    ts    = datetime.datetime.now(datetime.timezone.utc).strftime("%H%M%S")
    po_number = f"PR-PO-{today.strftime('%Y%m%d')}-{ts}"

    if not _DB_AVAILABLE:
        return {
            "data_source":   "demo",
            "po_number":     po_number,
            "status":        "DRAFT",
            "operation_type": payload.operation_type or "Project Purchase",
            "message":       "Draft PO created from PR. Pending Sales & Finance approval before issuing to supplier.",
        }
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")

        # Ensure schema tables exist before creating the PO
        if _ensure_po_approval_schema:
            await _ensure_po_approval_schema(pool)
        if _ensure_lc_schema:
            await _ensure_lc_schema(pool)

        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                # ── Validate PR status ─────────────────────────────────────
                await cur.execute(
                    "SELECT status FROM purchase_requisitions WHERE pr_id=%s", (pr_id,)
                )
                row = await cur.fetchone()
                if not row:
                    raise HTTPException(404, "PR not found")
                if row[0] != "APPROVED":
                    raise HTTPException(422, "Only APPROVED PRs can be converted to PO")

                # ── Fetch PR items ─────────────────────────────────────────
                await cur.execute(
                    "SELECT sku_name, qty_required, estimated_price, unit FROM pr_items WHERE pr_id=%s",
                    (pr_id,)
                )
                item_rows = await cur.fetchall()

                # ── Resolve or create supplier ─────────────────────────────
                await cur.execute(
                    "SELECT supplier_id FROM suppliers WHERE supplier_name LIKE %s AND is_active=1 LIMIT 1",
                    (f"%{payload.supplier_name}%",)
                )
                sup = await cur.fetchone()
                if sup:
                    supplier_id = sup[0]
                else:
                    await cur.execute(
                        "INSERT INTO suppliers (supplier_name, contact_person, is_active) VALUES (%s,'TBD',1)",
                        (payload.supplier_name[:255],)
                    )
                    supplier_id = cur.lastrowid

                # ── Calculate total value ──────────────────────────────────
                total_value = sum(
                    float(r[1] or 0) * float(r[2] or 0) for r in item_rows
                )
                expected_date = payload.expected_date or (
                    today + datetime.timedelta(days=7)
                ).isoformat()

                # ── Create DRAFT purchase order ────────────────────────────
                operation_type = (payload.operation_type or "Project Purchase")[:50]
                await cur.execute(
                    """INSERT INTO purchase_orders
                           (po_number, supplier_id, po_date, expected_date, status,
                            total_value, notes, operation_type)
                       VALUES (%s, %s, %s, %s, 'DRAFT', %s, %s, %s)""",
                    (po_number, supplier_id, today.isoformat(), expected_date,
                     total_value, payload.notes or f"Converted from PR #{pr_id}",
                     operation_type)
                )
                po_id = cur.lastrowid

                # ── Create po_items for each PR line ───────────────────────
                import hashlib as _hl
                for sku_name, qty_req, est_price, unit in item_rows:
                    await cur.execute(
                        "SELECT product_id FROM products WHERE sku_name LIKE %s AND is_active=1 LIMIT 1",
                        (f"%{str(sku_name)[:40]}%",)
                    )
                    prod = await cur.fetchone()
                    if prod:
                        product_id = prod[0]
                    else:
                        _h       = _hl.md5(str(sku_name).encode()).hexdigest()[:8].upper()
                        sku_code = f"AUTO-{_h}"
                        price    = float(est_price or 0) or 1.0
                        try:
                            await cur.execute(
                                """INSERT INTO products
                                       (sku_code, sku_name, category, brand, unit,
                                        buy_price, sell_price, is_active)
                                   VALUES (%s,%s,'Commercial','Generic',%s,%s,%s,1)""",
                                (sku_code, str(sku_name)[:120], unit or 'pcs',
                                 price, round(price * 1.3, 2))
                            )
                            product_id = cur.lastrowid
                        except Exception:
                            await cur.execute(
                                "SELECT product_id FROM products WHERE sku_code=%s LIMIT 1",
                                (sku_code,)
                            )
                            found = await cur.fetchone()
                            product_id = found[0] if found else None

                    if product_id:
                        await cur.execute(
                            "INSERT INTO po_items (po_id, product_id, qty_ordered, qty_received, unit_price) VALUES (%s,%s,%s,0,%s)",
                            (po_id, product_id, float(qty_req or 0), float(est_price or 0))
                        )

                # ── Create approval rows (sales + finance, both pending) ───
                for lvl in ('sales', 'finance'):
                    await cur.execute(
                        "INSERT IGNORE INTO po_approvals (po_id, po_number, approval_level, status) VALUES (%s,%s,%s,'pending')",
                        (po_id, po_number, lvl)
                    )

                # ── Mark PR as CONVERTED ───────────────────────────────────
                await cur.execute(
                    "UPDATE purchase_requisitions SET status='CONVERTED', converted_po_number=%s WHERE pr_id=%s",
                    (po_number, pr_id)
                )
                await conn.commit()

                return {
                    "data_source":   "mysql",
                    "po_number":     po_number,
                    "po_id":         po_id,
                    "status":        "DRAFT",
                    "operation_type": operation_type,
                    "message":       "Draft PO created from PR. Pending Sales & Finance approval before issuing to supplier.",
                }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("PR to PO conversion error: %s", exc)
        return {
            "data_source": "demo",
            "po_number":   po_number,
            "status":      "DRAFT",
            "message":     "Draft PO created from PR. Pending Sales & Finance approval.",
        }
