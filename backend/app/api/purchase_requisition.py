"""
Purchase Requisition API — PR creation, approval workflow, PO conversion.
Supports the P2P cycle step: PR → Approval → PO (partial or full conversion).
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
        duplicate_pr as _db_duplicate_pr,
        get_pr_linked_pos as _db_get_pr_linked_pos,
    )
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False
    _ensure_po_approval_schema = None
    _ensure_lc_schema = None
    _db_duplicate_pr = None
    _db_get_pr_linked_pos = None


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
                        status          ENUM('PENDING','APPROVED','REJECTED','CONVERTED',
                                             'PARTIAL_CONVERTED','CANCELLED')
                                        NOT NULL DEFAULT 'PENDING',
                        priority        ENUM('LOW','NORMAL','HIGH','URGENT')
                                        NOT NULL DEFAULT 'NORMAL',
                        notes           TEXT,
                        approved_by     VARCHAR(100),
                        approved_at     DATETIME,
                        rejection_reason TEXT,
                        converted_po_number  VARCHAR(40),
                        converted_po_numbers TEXT DEFAULT '',
                        total_converted_qty  DECIMAL(12,3) DEFAULT 0,
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
                        qty_converted    DECIMAL(12,3) DEFAULT 0,
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
                items = []
                for irow in irows:
                    item = dict(zip(icols, irow))
                    qty_req = float(item.get("qty_required") or 0)
                    qty_conv = float(item.get("qty_converted") or 0)
                    item["remaining_qty"] = max(0.0, round(qty_req - qty_conv, 3))
                    item["fully_converted"] = qty_conv >= qty_req and qty_req > 0
                    items.append(item)
                pr["items"] = items
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
     "converted_po_number": None, "converted_po_numbers": "", "total_converted_qty": 0,
     "item_count": 3, "estimated_value": 42500.00,
     "created_at": "2026-05-18 09:30:00"},
    {"pr_id": 2, "pr_number": "PR-2026-002", "requested_by": "Production Head",
     "department": "Production", "pr_date": "2026-05-19", "required_by": "2026-05-28",
     "status": "APPROVED", "priority": "NORMAL", "notes": "Raw material for May batch",
     "approved_by": "Admin", "approved_at": "2026-05-19 14:00:00", "rejection_reason": None,
     "converted_po_number": None, "converted_po_numbers": "", "total_converted_qty": 0,
     "item_count": 5, "estimated_value": 87200.00,
     "created_at": "2026-05-19 10:00:00"},
    {"pr_id": 3, "pr_number": "PR-2026-003", "requested_by": "Purchase Dept",
     "department": "Purchase", "pr_date": "2026-05-20", "required_by": "2026-05-30",
     "status": "CONVERTED", "priority": "URGENT", "notes": "Converted to PO-20260520-011",
     "approved_by": "Admin", "approved_at": "2026-05-20 08:00:00", "rejection_reason": None,
     "converted_po_number": "PO-20260520-011", "converted_po_numbers": "PO-20260520-011",
     "total_converted_qty": 2.0,
     "item_count": 2, "estimated_value": 31000.00,
     "created_at": "2026-05-20 07:30:00"},
    {"pr_id": 4, "pr_number": "PR-2026-004", "requested_by": "PPC Team",
     "department": "PPC", "pr_date": "2026-05-20", "required_by": "2026-06-01",
     "status": "REJECTED", "priority": "LOW", "notes": "Deferred to next quarter",
     "approved_by": "Admin", "approved_at": None, "rejection_reason": "Budget freeze",
     "converted_po_number": None, "converted_po_numbers": "", "total_converted_qty": 0,
     "item_count": 1, "estimated_value": 9800.00,
     "created_at": "2026-05-20 11:00:00"},
]

_MOCK_PR_ITEMS = {
    1: [
        {"pr_item_id": 1, "sku_name": "Ebco Soft-Close Hinge 35mm Pk-10", "category": "Hardware Fittings",
         "qty_required": 50, "qty_converted": 0, "remaining_qty": 50, "fully_converted": False,
         "unit": "pcs", "estimated_price": 485.00, "purpose": "Cabinet production", "preferred_supplier": "Ebco India"},
        {"pr_item_id": 2, "sku_name": "Jaquar Lyric Basin Mixer Chrome", "category": "Sanitary CP Fittings",
         "qty_required": 20, "qty_converted": 0, "remaining_qty": 20, "fully_converted": False,
         "unit": "pcs", "estimated_price": 4850.00, "purpose": "Showroom display", "preferred_supplier": "Jaquar India"},
        {"pr_item_id": 3, "sku_name": "Hafele Zinc D-Handle 128mm", "category": "Hardware Fittings",
         "qty_required": 100, "qty_converted": 0, "remaining_qty": 100, "fully_converted": False,
         "unit": "pcs", "estimated_price": 320.00, "purpose": "Kitchen systems", "preferred_supplier": "Hafele India"},
    ],
    2: [
        {"pr_item_id": 4, "sku_name": "Hettich InnoTech Drawer 400mm", "category": "Kitchen Systems",
         "qty_required": 30, "qty_converted": 0, "remaining_qty": 30, "fully_converted": False,
         "unit": "pcs", "estimated_price": 1280.00, "purpose": "Production batch Q2", "preferred_supplier": "Hettich India"},
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
    # Optional per-line qty override: {sku_name → qty_to_convert}
    # If a line is not listed, full remaining_qty is converted.
    item_qty_overrides: Optional[dict] = None
    converted_by: Optional[str] = "system"


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
        return {"data_source": "demo", "pending": 1, "approved": 1, "converted": 1,
                "partial_converted": 0, "rejected": 1, "total_value": 170500.00}
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
                result = {"pending": 0, "approved": 0, "converted": 0,
                          "partial_converted": 0, "rejected": 0, "total_value": 0}
                for row in rows:
                    k = str(row[0]).lower()
                    if k in result:
                        result[k] = int(row[1])
                    result["total_value"] += float(row[2] or 0)
                return {"data_source": "mysql", **result}
    except Exception as exc:
        logger.warning("PR kpis DB error: %s", exc)
        return {"data_source": "demo", "pending": 1, "approved": 1, "converted": 1,
                "partial_converted": 0, "rejected": 1, "total_value": 170500.00}


@router.get("/pr/products", summary="List catalog products for PR SKU auto-populate")
async def list_pr_products():
    """Return active products (sku_name, category, unit) for the PR line-item datalist."""
    await _ensure_tables()
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            SELECT sku_name, category, unit
                            FROM products
                            WHERE is_active = 1
                            ORDER BY sku_name
                            LIMIT 500
                        """)
                        rows = await cur.fetchall()
                        return {
                            "data_source": "mysql",
                            "products": [
                                {"sku_name": r[0], "category": r[1] or "", "unit": r[2] or "pcs"}
                                for r in rows
                            ],
                        }
        except Exception as exc:
            logger.warning("PR products DB error: %s", exc)

    return {
        "data_source": "demo",
        "products": [
            {"sku_name": "18mm BWP Plywood (8×4 ft)", "category": "BWP Plywood", "unit": "Sheet"},
            {"sku_name": "12mm MR Plain (8×4 ft)", "category": "MR Plywood", "unit": "Sheet"},
            {"sku_name": "HPL 1mm Matte (8×4 ft)", "category": "High Pressure Laminate", "unit": "Sheet"},
            {"sku_name": "HPL Compact 6mm (8×4 ft)", "category": "Compact Laminate", "unit": "Sheet"},
            {"sku_name": "Acrylic Laminate (8×4 ft)", "category": "Acrylic / High Gloss", "unit": "Sheet"},
            {"sku_name": "Ebco Soft-Close Hinge 35mm Pk-10", "category": "Hardware Fittings", "unit": "Pkt"},
            {"sku_name": "Hettich InnoTech Drawer 400mm", "category": "Kitchen Systems", "unit": "Set"},
            {"sku_name": "Hafele Zinc D-Handle 128mm", "category": "Hardware Fittings", "unit": "Pcs"},
            {"sku_name": "Jaquar Lyric Basin Mixer Chrome", "category": "Sanitary CP Fittings", "unit": "Pcs"},
            {"sku_name": "Aluminium Z-Profile 100mm Anodized", "category": "Aluminium Louvers", "unit": "RM"},
            {"sku_name": "PVC Louver Blades 100mm", "category": "PVC Louvers", "unit": "RM"},
            {"sku_name": "8mm Flexi Sheet (8×4 ft)", "category": "Flexi", "unit": "Sheet"},
        ],
    }


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
                            (pr_id, sku_name, category, qty_required, unit,
                             estimated_price, purpose, preferred_supplier)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (pr_id, it.sku_name, it.category, it.qty_required,
                          it.unit, it.estimated_price, it.purpose, it.preferred_supplier))
            await conn.commit()
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
            await conn.commit()
            return {"data_source": "mysql", "pr_id": pr_id, "status": status}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("PR status update error: %s", exc)
        return {"data_source": "demo", "pr_id": pr_id, "status": status}


@router.post("/pr/{pr_id}/to-po", summary="Convert Approved PR to Draft Purchase Order")
async def convert_pr_to_po(pr_id: int, payload: PRToPOIn):
    """
    Convert an APPROVED (or PARTIAL_CONVERTED) PR into a DRAFT Purchase Order.

    Conversion tracking:
    - Supports per-line qty overrides via `item_qty_overrides` {sku_name: qty}.
      If a line is not listed, full remaining qty (qty_required - qty_converted) is used.
    - Writes one `pr_conversion_ledger` row per converted line.
    - Updates `pr_items.qty_converted` per line.
    - Sets PR status to CONVERTED (all lines done) or PARTIAL_CONVERTED (some remain).
    - Appends PO number to `purchase_requisitions.converted_po_numbers`.
    - Stores PR number in `purchase_orders.pr_number` (bidirectional link).
    """
    today = datetime.date.today()
    ts    = datetime.datetime.now(datetime.timezone.utc).strftime("%H%M%S")
    po_number = f"PR-PO-{today.strftime('%Y%m%d')}-{ts}"

    if not _DB_AVAILABLE:
        return {
            "data_source":    "demo",
            "po_number":      po_number,
            "status":         "DRAFT",
            "operation_type": payload.operation_type or "Project Purchase",
            "message":        "Draft PO created from PR. Pending Sales & Finance approval before issuing to supplier.",
        }
    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")

        if _ensure_po_approval_schema:
            await _ensure_po_approval_schema(pool)
        if _ensure_lc_schema:
            await _ensure_lc_schema(pool)

        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                # ── Validate PR status ─────────────────────────────────────────
                await cur.execute(
                    "SELECT status, pr_number FROM purchase_requisitions WHERE pr_id=%s",
                    (pr_id,)
                )
                row = await cur.fetchone()
                if not row:
                    raise HTTPException(404, "PR not found")
                pr_status, source_pr_number = row[0], row[1]
                if pr_status not in ("APPROVED", "PARTIAL_CONVERTED"):
                    raise HTTPException(
                        422,
                        f"Cannot convert PR with status '{pr_status}'. "
                        "Only APPROVED or PARTIAL_CONVERTED PRs can be converted to PO."
                    )

                # ── Fetch PR line items with conversion state ─────────────────
                # qty_converted may be absent on older installs — use COALESCE as safety net
                await cur.execute("""
                    SELECT pr_item_id, sku_name, qty_required,
                           COALESCE(qty_converted, 0) AS qty_converted,
                           estimated_price, unit
                    FROM pr_items WHERE pr_id=%s
                """, (pr_id,))
                item_rows = await cur.fetchall()

                if not item_rows:
                    raise HTTPException(422, "PR has no line items")

                # ── Compute qty to convert per line (apply overrides) ─────────
                # Each entry: (pr_item_id, sku_name, qty_req, qty_already_conv, est_price, unit, convert_qty)
                lines_to_convert = []
                overrides = payload.item_qty_overrides or {}
                has_any_qty = False

                for pr_item_id, sku_name, qty_req, qty_conv, est_price, unit in item_rows:
                    qty_remaining = max(0.0, float(qty_req or 0) - float(qty_conv or 0))
                    if sku_name in overrides:
                        convert_qty = max(0.0, min(float(overrides[sku_name]), qty_remaining))
                    else:
                        convert_qty = qty_remaining
                    lines_to_convert.append(
                        (pr_item_id, sku_name, float(qty_req or 0),
                         float(qty_conv or 0), float(est_price or 0), unit or "pcs", convert_qty)
                    )
                    if convert_qty > 0:
                        has_any_qty = True

                if not has_any_qty:
                    raise HTTPException(422, "All PR lines are already fully converted — no remaining qty to convert")

                # ── Resolve or create supplier ─────────────────────────────────
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

                # ── One DRAFT PO per supplier per PR rule ──────────────────────
                await cur.execute(
                    """SELECT po_number FROM purchase_orders
                       WHERE pr_number = %s AND supplier_id = %s AND status = 'DRAFT'
                       LIMIT 1""",
                    (source_pr_number, supplier_id),
                )
                existing_draft = await cur.fetchone()
                if existing_draft:
                    existing_po_num = existing_draft[0] if not isinstance(existing_draft, dict) else existing_draft["po_number"]
                    raise HTTPException(
                        409,
                        f"A DRAFT PO ({existing_po_num}) already exists for this PR and supplier. "
                        "Approve or cancel that PO before creating a new one.",
                    )

                # ── Calculate total PO value ───────────────────────────────────
                total_value = sum(line[4] * line[6] for line in lines_to_convert if line[6] > 0)
                expected_date = payload.expected_date or (
                    today + datetime.timedelta(days=7)
                ).isoformat()

                # ── Create DRAFT purchase order ────────────────────────────────
                operation_type = (payload.operation_type or "Project Purchase")[:50]
                pr_notes = payload.notes or f"Converted from {source_pr_number or f'PR #{pr_id}'}"
                await cur.execute(
                    """INSERT INTO purchase_orders
                           (po_number, supplier_id, po_date, expected_date, status,
                            total_value, notes, operation_type, pr_number)
                       VALUES (%s, %s, %s, %s, 'DRAFT', %s, %s, %s, %s)""",
                    (po_number, supplier_id, today.isoformat(), expected_date,
                     total_value, pr_notes, operation_type, source_pr_number)
                )
                po_id = cur.lastrowid

                # ── Create po_items + update pr_items + write conversion ledger ──
                import hashlib as _hl
                converted_by = (payload.converted_by or "system")[:100]

                for pr_item_id, sku_name, qty_req, qty_conv, est_price, unit, convert_qty in lines_to_convert:
                    if convert_qty <= 0:
                        continue  # Skip lines with zero qty to convert

                    # Resolve product
                    await cur.execute(
                        "SELECT product_id, sku_code FROM products WHERE sku_name LIKE %s AND is_active=1 LIMIT 1",
                        (f"%{str(sku_name)[:40]}%",)
                    )
                    prod = await cur.fetchone()
                    if prod:
                        product_id, sku_code = prod[0], prod[1]
                    else:
                        _h       = _hl.md5(str(sku_name).encode()).hexdigest()[:8].upper()
                        sku_code = f"AUTO-{_h}"
                        price    = est_price or 1.0
                        try:
                            await cur.execute(
                                """INSERT INTO products
                                       (sku_code, sku_name, category, brand, unit,
                                        buy_price, sell_price, is_active)
                                   VALUES (%s,%s,'Commercial','Generic',%s,%s,%s,1)""",
                                (sku_code, str(sku_name)[:120], unit,
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
                            if not product_id:
                                sku_code = f"AUTO-{_hl.md5(str(sku_name).encode()).hexdigest()[:8].upper()}"

                    if product_id:
                        # Create PO line
                        await cur.execute(
                            """INSERT INTO po_items
                                   (po_id, product_id, qty_ordered, qty_received, unit_price, pr_number)
                               VALUES (%s,%s,%s,0,%s,%s)""",
                            (po_id, product_id, convert_qty, est_price, source_pr_number)
                        )

                    # Update pr_items.qty_converted (cap at qty_required via LEAST)
                    await cur.execute(
                        """UPDATE pr_items
                           SET qty_converted = LEAST(qty_required, qty_converted + %s)
                           WHERE pr_item_id = %s""",
                        (convert_qty, pr_item_id)
                    )

                    # Write conversion ledger entry
                    await cur.execute(
                        """INSERT INTO pr_conversion_ledger
                               (pr_number, pr_item_id, sku_code, pr_qty,
                                converted_qty, po_number, converted_by)
                           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                        (source_pr_number or "", pr_item_id, sku_code or "",
                         qty_req, convert_qty, po_number, converted_by)
                    )

                # ── Determine new PR status ────────────────────────────────────
                # Re-read all lines to check if every line is now fully converted
                await cur.execute(
                    "SELECT SUM(qty_required), SUM(COALESCE(qty_converted,0)) FROM pr_items WHERE pr_id=%s",
                    (pr_id,)
                )
                totals = await cur.fetchone()
                total_req  = float(totals[0] or 0)
                total_conv = float(totals[1] or 0)
                new_pr_status = "CONVERTED" if total_conv >= total_req else "PARTIAL_CONVERTED"

                # ── Create approval rows (sales + finance) ─────────────────────
                for lvl in ('sales', 'finance'):
                    await cur.execute(
                        "INSERT IGNORE INTO po_approvals (po_id, po_number, approval_level, status) "
                        "VALUES (%s,%s,%s,'pending')",
                        (po_id, po_number, lvl)
                    )

                # ── Update PR record with conversion result ────────────────────
                await cur.execute(
                    """UPDATE purchase_requisitions
                       SET status              = %s,
                           converted_po_number = %s,
                           converted_po_numbers = IF(
                               converted_po_numbers IS NULL OR converted_po_numbers = '',
                               %s,
                               CONCAT(converted_po_numbers, ',', %s)
                           ),
                           total_converted_qty = COALESCE(total_converted_qty, 0) + %s
                       WHERE pr_id = %s""",
                    (new_pr_status, po_number, po_number, po_number,
                     sum(line[6] for line in lines_to_convert), pr_id)
                )

            await conn.commit()

            return {
                "data_source":     "mysql",
                "po_number":       po_number,
                "po_id":           po_id,
                "status":          "DRAFT",
                "pr_status":       new_pr_status,
                "operation_type":  operation_type,
                "pr_number":       source_pr_number,
                "lines_converted": sum(1 for line in lines_to_convert if line[6] > 0),
                "qty_converted":   round(sum(line[6] for line in lines_to_convert), 3),
                "message": (
                    "All PR lines fully converted. Draft PO created — pending Sales & Finance approval."
                    if new_pr_status == "CONVERTED"
                    else "Partial PR conversion. Draft PO created for selected lines — remaining lines still outstanding."
                ),
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


# ── POST /api/pr/{pr_id}/duplicate  ──────────────────────────────────────────

class PRDuplicateIn(BaseModel):
    duplicated_by: str


@router.post("/pr/{pr_id}/duplicate", summary="Duplicate a Purchase Requisition", status_code=201)
async def duplicate_pr(pr_id: int, payload: PRDuplicateIn):
    """
    Duplicate a PR — copies all line items (sku, qty, spec, estimated price).
    New PR starts as PENDING. Original PR is unchanged.
    """
    await _ensure_tables()
    if not payload.duplicated_by or not payload.duplicated_by.strip():
        raise HTTPException(status_code=422, detail="duplicated_by is required")

    if _DB_AVAILABLE and _db_duplicate_pr:
        try:
            pool = await get_pool()
            if pool:
                result = await _db_duplicate_pr(pool, pr_id, payload.duplicated_by.strip())
                if not result.get("success"):
                    raise HTTPException(status_code=400, detail=result.get("error", "Duplication failed"))
                return {"data_source": "mysql", **result}
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("PR duplicate error: %s", exc)

    # Demo fallback
    today     = datetime.date.today()
    ts        = datetime.datetime.now().strftime("%H%M%S")
    new_pr_no = f"PR-{today.year}-{ts}-D"
    return {
        "data_source":    "demo",
        "success":        True,
        "new_pr_number":  new_pr_no,
        "new_pr_id":      pr_id + 100,
        "source_pr":      f"PR-DEMO-{pr_id:03d}",
        "items_count":    3,
        "status":         "PENDING",
        "message":        f"[DEMO] PR duplicated as {new_pr_no}.",
    }


# ── PATCH /api/pr/{pr_id}  ────────────────────────────────────────────────────

class PREditIn(BaseModel):
    requested_by:  Optional[str] = None
    department:    Optional[str] = None
    required_by:   Optional[str] = None
    priority:      Optional[str] = None
    notes:         Optional[str] = None


@router.patch("/pr/{pr_id}", summary="Edit a PENDING Purchase Requisition")
async def edit_pr(pr_id: int, payload: PREditIn):
    """Update editable fields on a PR. Only allowed while status is PENDING."""
    await _ensure_tables()
    if not _DB_AVAILABLE:
        return {"data_source": "demo", "pr_id": pr_id, "updated": True}

    try:
        pool = await get_pool()
        if not pool:
            raise Exception("no pool")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT status FROM purchase_requisitions WHERE pr_id=%s", (pr_id,)
                )
                row = await cur.fetchone()
                if not row:
                    raise HTTPException(404, "PR not found")
                if row[0] != "PENDING":
                    raise HTTPException(
                        422, f"PR cannot be edited in status '{row[0]}'. Only PENDING PRs are editable."
                    )

                fields, vals = [], []
                if payload.requested_by  is not None: fields.append("requested_by=%s");  vals.append(payload.requested_by[:100])
                if payload.department    is not None: fields.append("department=%s");     vals.append(payload.department[:80])
                if payload.required_by   is not None: fields.append("required_by=%s");   vals.append(payload.required_by)
                if payload.priority      is not None:
                    if payload.priority.upper() not in ("LOW","NORMAL","HIGH","URGENT"):
                        raise HTTPException(422, "priority must be LOW, NORMAL, HIGH, or URGENT")
                    fields.append("priority=%s"); vals.append(payload.priority.upper())
                if payload.notes         is not None: fields.append("notes=%s");         vals.append(payload.notes)

                if not fields:
                    raise HTTPException(422, "No fields to update")

                vals.append(pr_id)
                await cur.execute(
                    f"UPDATE purchase_requisitions SET {', '.join(fields)} WHERE pr_id=%s", vals
                )
            await conn.commit()
        return {"data_source": "mysql", "pr_id": pr_id, "updated": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("PR edit error: %s", exc)
        return {"data_source": "demo", "pr_id": pr_id, "updated": True}


# ── GET /api/pr/{pr_id}/linked-pos  ──────────────────────────────────────────

@router.get("/pr/{pr_id}/linked-pos", summary="Get POs linked to a PR")
async def get_pr_linked_pos(pr_id: int):
    """Return all Purchase Orders created from this PR with status and qty summary."""
    await _ensure_tables()
    if _DB_AVAILABLE and _db_get_pr_linked_pos:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            "SELECT pr_number FROM purchase_requisitions WHERE pr_id=%s", (pr_id,)
                        )
                        row = await cur.fetchone()
                        if not row:
                            raise HTTPException(404, "PR not found")
                        pr_number = row[0]
                pos = await _db_get_pr_linked_pos(pool, pr_number)
                return {"data_source": "mysql", "pr_id": pr_id, "linked_pos": pos}
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("get_pr_linked_pos DB error: %s", exc)

    return {
        "data_source": "demo", "pr_id": pr_id,
        "linked_pos": [
            {"po_number": "PR-PO-20260520-DEMO", "status": "OPEN", "supplier": "Demo Supplier",
             "qty_ordered": 50, "qty_received": 30, "accepted_qty": 28, "rejected_qty": 2,
             "qty_returned": 0, "pending_qty": 20, "fill_pct": 60.0},
        ],
    }
