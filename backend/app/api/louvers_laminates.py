"""
Louvers & Laminates — Sales Orders, Distributor Claims, Customer Rebates API
Covers HPL, Compact Laminate, Acrylic, Aluminium/PVC Louvers, Operable Louvre Systems.
DB-first / mock-fallback pattern.
"""
import datetime
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.email_service import send_delay_notification, send_test_email, get_ai_analysis

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Louvers & Laminates"])

try:
    from app.db.connection import get_pool, is_db_available
    from app.db.sales_order_queries import query_overdue_orders, query_single_overdue_order
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────────────────
# GET /api/louvers  — full dashboard
# ─────────────────────────────────────────────────────────────────────────────

def _compute_kpis(orders: list, claims: list, rebates: list) -> dict:
    """Derive KPI summary from live or mock order/claim/rebate lists."""
    import datetime
    current_month = datetime.date.today().strftime("%Y-%m")
    mtd = [o for o in orders if str(o.get("order_date") or o.get("created_at", "")).startswith(current_month)]
    pipeline = [o for o in orders if o.get("status") in ("DRAFT", "CONFIRMED", "IN_PRODUCTION")]
    active   = [o for o in orders if o.get("status") not in ("DELIVERED", "CANCELLED")]
    all_margins = [float(o.get("margin_pct") or 0) for o in orders if o.get("margin_pct") is not None]
    return {
        "orders_this_month": len(mtd) if mtd else len(orders),
        "active_orders":     len(active),
        "order_revenue":     sum(float(o.get("total_value") or 0) for o in (mtd or orders)),
        "avg_margin_pct":    round(sum(all_margins) / len(all_margins), 1) if all_margins else 0,
        "pipeline_value":    sum(float(o.get("total_value") or 0) for o in pipeline),
        "claims_pending":    sum(o.get("amount_claimed", 0) or 0 for o in claims if o.get("status") in ("SUBMITTED", "UNDER_REVIEW", "DRAFT")),
        "claims_approved":   sum((o.get("amount_approved") or 0) for o in claims if o.get("status") in ("APPROVED", "PARTIAL")),
        "rebate_liability":  sum(r.get("rebate_value", 0) or 0 for r in rebates if r.get("status") in ("ACTIVE", "PENDING_APPROVAL", "ACHIEVED")),
        "rebate_paid":       sum(r.get("rebate_value", 0) or 0 for r in rebates if r.get("status") == "PAID"),
    }


@router.get("/louvers")
async def get_louvers_dashboard():
    from app.core.demo_state import get_all_status_overrides
    base = _mock_dashboard()

    # ── DB path: pull live orders from sales_orders table ────────────────────
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute("""
                            SELECT id AS order_id, order_number, customer_name, customer_type,
                                   product_name, category, quantity, unit,
                                   sell_price, buy_price,
                                   ROUND(sell_price * quantity, 2) AS total_value,
                                   ROUND((sell_price - COALESCE(buy_price, sell_price * 0.78))
                                         / NULLIF(sell_price, 0) * 100, 2) AS margin_pct,
                                   status, delivery_date,
                                   DATE(created_at) AS order_date,
                                   COALESCE(supplier_name, '') AS supplier_name,
                                   COALESCE(notes, '') AS notes,
                                   COALESCE(quote_number, '') AS quote_number,
                                   COALESCE(invoice_number, '') AS invoice_number,
                                   invoiced_at,
                                   COALESCE(site_location, '') AS site_location,
                                   COALESCE(payment_status, 'UNPAID') AS payment_status,
                                   COALESCE(pod_note, '') AS pod_note
                            FROM sales_orders
                            ORDER BY created_at DESC
                            LIMIT 200
                        """)
                        rows = await cur.fetchall()
                        if rows:
                            cols = [d[0] for d in cur.description]
                            db_orders = []
                            for r in rows:
                                o = dict(zip(cols, r))
                                if o.get("delivery_date") and not isinstance(o["delivery_date"], str):
                                    o["delivery_date"] = o["delivery_date"].isoformat()
                                if o.get("order_date") and not isinstance(o["order_date"], str):
                                    o["order_date"] = str(o["order_date"])
                                db_orders.append(o)
                            base["orders"] = db_orders
                            base["kpis"] = _compute_kpis(db_orders, base["claims"], base["rebates"])
                            base["data_source"] = "mysql"
                            return base
        except Exception as exc:
            logger.warning("GET /api/louvers DB fetch failed: %s", exc)

    # ── Demo mode: apply in-session status overrides ──────────────────────────
    overrides = get_all_status_overrides()
    if overrides:
        for o in base["orders"]:
            if o["order_id"] in overrides:
                o["status"] = overrides[o["order_id"]]
        base["kpis"] = _compute_kpis(base["orders"], base["claims"], base["rebates"])

    return base

# ─────────────────────────────────────────────────────────────────────────────
# SALES ORDERS
# ─────────────────────────────────────────────────────────────────────────────

VALID_ORDER_STATUSES = {"DRAFT","CONFIRMED","IN_PRODUCTION","DISPATCHED","DELIVERED","CANCELLED"}

class CreateOrderRequest(BaseModel):
    customer_name:  str
    customer_type:  str
    product_id:     int
    product_name:   str
    category:       str
    quantity:       float = Field(gt=0)
    unit:           str
    sell_price:     float
    buy_price:      float
    supplier_id:    Optional[int]  = None
    supplier_name:  Optional[str]  = None
    delivery_date:  Optional[str]  = None
    site_location:  Optional[str]  = None
    notes:          Optional[str]  = None
    status:         Optional[str]  = "CONFIRMED"

class OrderStatusUpdate(BaseModel):
    status:         str
    pod_note:       Optional[str] = None
    payment_status: Optional[str] = None

class RaiseInvoiceRequest(BaseModel):
    invoice_number: Optional[str] = None

class PaymentStatusUpdate(BaseModel):
    payment_status: str                    # UNPAID | PARTIAL | PAID
    payment_ref:    Optional[str] = None


async def _ensure_sales_orders_schema(pool):
    """Ensure sales_orders + inventory_reservations tables exist — idempotent."""
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS sales_orders (
                        id            INT AUTO_INCREMENT PRIMARY KEY,
                        order_number  VARCHAR(50)  NOT NULL,
                        customer_name VARCHAR(200) NOT NULL,
                        customer_type VARCHAR(100),
                        product_id    INT,
                        product_name  VARCHAR(300),
                        category      VARCHAR(200),
                        quantity      DECIMAL(12,3),
                        unit          VARCHAR(50),
                        sell_price    DECIMAL(12,2),
                        buy_price     DECIMAL(12,2),
                        total_value   DECIMAL(14,2),
                        status        VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
                        delivery_date DATE,
                        site_location VARCHAR(300),
                        supplier_name VARCHAR(200),
                        notes         TEXT,
                        quote_number  VARCHAR(50),
                        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
                for _col in [
                    "ALTER TABLE sales_orders ADD COLUMN quote_number VARCHAR(50)",
                    "ALTER TABLE sales_orders ADD COLUMN invoice_number VARCHAR(50)",
                    "ALTER TABLE sales_orders ADD COLUMN invoiced_at DATETIME",
                    "ALTER TABLE sales_orders ADD COLUMN pod_note TEXT",
                    "ALTER TABLE sales_orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'UNPAID'",
                    "ALTER TABLE sales_orders ADD COLUMN payment_ref VARCHAR(100)",
                    "ALTER TABLE sales_orders ADD COLUMN site_location VARCHAR(300)",
                ]:
                    try:
                        await cur.execute(_col)
                    except Exception:
                        pass
                # Inventory reservations — tracks qty reserved against confirmed sales orders
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS inventory_reservations (
                        reservation_id  INT AUTO_INCREMENT PRIMARY KEY,
                        sales_order_id  VARCHAR(50)  NOT NULL,
                        product_name    VARCHAR(300) NOT NULL,
                        reserved_qty    DECIMAL(12,3) NOT NULL DEFAULT 0,
                        unit            VARCHAR(50) DEFAULT 'Units',
                        status          ENUM('ACTIVE','RELEASED','CANCELLED')
                                        NOT NULL DEFAULT 'ACTIVE',
                        reserved_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        released_at     DATETIME DEFAULT NULL,
                        INDEX idx_ir_so     (sales_order_id),
                        INDEX idx_ir_status (status),
                        INDEX idx_ir_prod   (product_name(60))
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
            await conn.commit()
    except Exception as exc:
        logger.warning("_ensure_sales_orders_schema: %s", exc)


async def _create_reservation(pool, order_number: str, product_name: str,
                               quantity: float, unit: str) -> None:
    """Insert an ACTIVE inventory reservation for a confirmed sales order."""
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO inventory_reservations
                           (sales_order_id, product_name, reserved_qty, unit, status)
                       VALUES (%s, %s, %s, %s, 'ACTIVE')
                       ON DUPLICATE KEY UPDATE
                           reserved_qty = VALUES(reserved_qty),
                           status = 'ACTIVE', released_at = NULL""",
                    (order_number, product_name, quantity, unit),
                )
            await conn.commit()
    except Exception as exc:
        logger.warning("_create_reservation failed for %s: %s", order_number, exc)


async def _release_reservation(pool, order_number: str) -> None:
    """Mark all ACTIVE reservations for this SO as RELEASED."""
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """UPDATE inventory_reservations
                       SET status = 'RELEASED', released_at = NOW()
                       WHERE sales_order_id = %s AND status = 'ACTIVE'""",
                    (order_number,),
                )
            await conn.commit()
    except Exception as exc:
        logger.warning("_release_reservation failed for %s: %s", order_number, exc)


@router.post("/louvers/orders")
async def create_order(req: CreateOrderRequest):
    today  = datetime.date.today()
    num    = f"SO-{today.strftime('%Y%m%d')}-{datetime.datetime.now().strftime('%H%M%S')}"
    gross  = round(req.sell_price * req.quantity, 2)
    cost   = round(req.buy_price  * req.quantity, 2)
    margin = round((gross - cost) / gross * 100, 2) if gross else 0
    status = (req.status or "CONFIRMED").upper()
    if status not in VALID_ORDER_STATUSES:
        status = "CONFIRMED"

    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                await _ensure_sales_orders_schema(pool)
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            """INSERT INTO sales_orders
                                   (order_number, customer_name, customer_type,
                                    product_id, product_name, category,
                                    quantity, unit, sell_price, buy_price, total_value,
                                    status, delivery_date, site_location,
                                    supplier_name, notes)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                            (
                                num,
                                req.customer_name, req.customer_type,
                                req.product_id, req.product_name, req.category,
                                req.quantity, req.unit,
                                req.sell_price, req.buy_price, gross,
                                status,
                                req.delivery_date or None,
                                req.site_location or None,
                                req.supplier_name or None,
                                req.notes or None,
                            ),
                        )
                        order_id = cur.lastrowid
                    await conn.commit()
                # Reserve inventory immediately when order is CONFIRMED
                if status == "CONFIRMED":
                    await _create_reservation(
                        pool, num, req.product_name, req.quantity, req.unit
                    )
                return {
                    "success": True, "order_id": order_id, "order_number": num,
                    "total_value": gross, "margin_pct": margin, "status": status,
                    "valid_till": (today + datetime.timedelta(days=14)).isoformat(),
                    "reserved": status == "CONFIRMED",
                    "demo_mode": False,
                }
        except Exception as exc:
            logger.warning("create_order DB insert failed: %s", exc)

    return {
        "success": True, "order_number": num,
        "total_value": gross, "margin_pct": margin, "status": status,
        "valid_till": (today + datetime.timedelta(days=14)).isoformat(),
        "demo_mode": True,
    }

@router.put("/louvers/orders/{order_id}/status")
async def update_order_status(order_id: int, req: OrderStatusUpdate):
    if req.status not in VALID_ORDER_STATUSES:
        raise HTTPException(422, f"Status must be one of {VALID_ORDER_STATUSES}")

    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        # Fetch order_number + product details before update (needed for reservation logic)
                        await cur.execute(
                            "SELECT order_number, product_name, quantity, unit, status AS old_status "
                            "FROM sales_orders WHERE id = %s",
                            (order_id,),
                        )
                        row = await cur.fetchone()
                        order_number = row[0] if row else None
                        product_name = row[1] if row else None
                        quantity     = float(row[2]) if row and row[2] else 0
                        unit         = row[3] if row else "Units"
                        old_status   = row[4] if row else None

                        await cur.execute(
                            "UPDATE sales_orders SET status = %s WHERE id = %s",
                            (req.status, order_id),
                        )
                        if req.pod_note:
                            await cur.execute(
                                "UPDATE sales_orders SET pod_note = %s WHERE id = %s",
                                (req.pod_note, order_id),
                            )
                        if req.payment_status and req.payment_status in ("UNPAID", "PARTIAL", "PAID"):
                            await cur.execute(
                                "UPDATE sales_orders SET payment_status = %s WHERE id = %s",
                                (req.payment_status, order_id),
                            )
                    await conn.commit()

                # Reservation lifecycle management
                if order_number:
                    new_status = req.status.upper()
                    if new_status == "CONFIRMED" and old_status != "CONFIRMED":
                        # Newly confirmed — reserve inventory
                        await _create_reservation(pool, order_number, product_name, quantity, unit)
                    elif new_status in ("DELIVERED", "CANCELLED"):
                        # Order closed — release reservation
                        await _release_reservation(pool, order_number)

                return {"success": True, "order_id": order_id, "status": req.status, "demo_mode": False}
        except Exception as exc:
            logger.warning("Status update DB failed: %s", exc)

    # Demo mode: persist in-session cache so GET /api/louvers reflects the change
    from app.core.demo_state import set_order_status
    set_order_status(order_id, req.status)
    return {"success": True, "order_id": order_id, "status": req.status, "demo_mode": True}


@router.post("/louvers/orders/{order_id}/invoice")
async def raise_invoice(order_id: int, req: RaiseInvoiceRequest):
    """Raise a tax invoice against a sales order — saves invoice_number + invoiced_at to DB."""
    today   = datetime.date.today()
    now     = datetime.datetime.now()
    inv_num = req.invoice_number or f"INV-{today.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}"

    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                await _ensure_sales_orders_schema(pool)
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            "UPDATE sales_orders SET invoice_number=%s, invoiced_at=%s WHERE id=%s",
                            (inv_num, now, order_id),
                        )
                    await conn.commit()
                return {"success": True, "order_id": order_id, "invoice_number": inv_num, "demo_mode": False}
        except Exception as exc:
            logger.warning("raise_invoice DB failed: %s", exc)

    return {"success": True, "order_id": order_id, "invoice_number": inv_num, "demo_mode": True}


@router.put("/louvers/orders/{order_id}/payment")
async def update_payment_status(order_id: int, req: PaymentStatusUpdate):
    """Update payment status (UNPAID / PARTIAL / PAID) on a sales order."""
    if req.payment_status not in ("UNPAID", "PARTIAL", "PAID"):
        raise HTTPException(422, "payment_status must be UNPAID, PARTIAL, or PAID")

    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            "UPDATE sales_orders SET payment_status=%s, payment_ref=%s WHERE id=%s",
                            (req.payment_status, req.payment_ref or None, order_id),
                        )
                    await conn.commit()
                return {"success": True, "order_id": order_id, "payment_status": req.payment_status, "demo_mode": False}
        except Exception as exc:
            logger.warning("update_payment_status DB failed: %s", exc)

    return {"success": True, "order_id": order_id, "payment_status": req.payment_status, "demo_mode": True}


@router.get("/louvers/reservations")
async def get_reservations():
    """Return active inventory reservations with ATP summary per product."""
    if _DB_AVAILABLE:
        try:
            pool = await get_pool()
            if pool:
                await _ensure_sales_orders_schema(pool)
                async with pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        # Active reservations with order details
                        await cur.execute("""
                            SELECT ir.reservation_id, ir.sales_order_id, ir.product_name,
                                   ir.reserved_qty, ir.unit, ir.status, ir.reserved_at,
                                   so.customer_name, so.delivery_date, so.status AS order_status
                            FROM inventory_reservations ir
                            LEFT JOIN sales_orders so ON so.order_number = ir.sales_order_id
                            WHERE ir.status = 'ACTIVE'
                            ORDER BY ir.reserved_at DESC
                            LIMIT 200
                        """)
                        rows = await cur.fetchall()
                        cols = [d[0] for d in cur.description]
                        reservations = [dict(zip(cols, r)) for r in rows]

                        # ATP summary: total reserved per product
                        await cur.execute("""
                            SELECT product_name,
                                   SUM(reserved_qty) AS total_reserved,
                                   COUNT(*) AS reservation_count
                            FROM inventory_reservations
                            WHERE status = 'ACTIVE'
                            GROUP BY product_name
                            ORDER BY total_reserved DESC
                        """)
                        atp_rows = await cur.fetchall()
                        atp_by_product = [
                            {
                                "product_name": r[0],
                                "total_reserved": float(r[1] or 0),
                                "reservation_count": int(r[2] or 0),
                            }
                            for r in atp_rows
                        ]

                        for r in reservations:
                            if r.get("reserved_at") and not isinstance(r["reserved_at"], str):
                                r["reserved_at"] = str(r["reserved_at"])
                            if r.get("delivery_date") and not isinstance(r["delivery_date"], str):
                                r["delivery_date"] = r["delivery_date"].isoformat()

                        return {
                            "data_source": "mysql",
                            "reservations": reservations,
                            "atp_by_product": atp_by_product,
                            "total_active": len(reservations),
                        }
        except Exception as exc:
            logger.warning("GET /louvers/reservations failed: %s", exc)

    # Demo fallback
    return {
        "data_source": "demo",
        "reservations": [],
        "atp_by_product": [],
        "total_active": 0,
    }


@router.post("/louvers/test-email")
async def test_email_config():
    """Send a test email to verify SMTP configuration is working."""
    settings = get_settings()
    result   = await send_test_email(settings)
    return result


@router.get("/louvers/orders/overdue")
async def get_overdue_orders():
    """Return all overdue orders (DB-first, mock fallback) without sending any emails."""
    today = datetime.date.today()

    if _DB_AVAILABLE and await is_db_available():
        pool    = await get_pool()
        orders  = await query_overdue_orders(pool)
        source  = "mysql"
    else:
        all_orders = _mock_dashboard()["orders"]
        orders = [
            {**o, "days_overdue": (today - datetime.date.fromisoformat(o["delivery_date"])).days,
             "delay_reason": o.get("notes", ""), "data_source": "mock"}
            for o in all_orders
            if o.get("delivery_date")
            and o["status"] not in ("DELIVERED", "CANCELLED")
            and datetime.date.fromisoformat(o["delivery_date"]) < today
        ]
        source = "mock"

    total_value = sum(o.get("total_value", 0) for o in orders)
    return {
        "orders":      orders,
        "count":       len(orders),
        "total_value": total_value,
        "data_source": source,
    }


@router.get("/louvers/orders/{order_id}/ai-analysis")
async def get_order_ai_analysis(order_id: int):
    """Return GPT-4o delay analysis for a single order (DB-first, mock fallback)."""
    settings = get_settings()
    today    = datetime.date.today()
    order    = None

    if _DB_AVAILABLE and await is_db_available():
        pool  = await get_pool()
        order = await query_single_overdue_order(pool, order_id)

    if not order:
        mock = next((o for o in _mock_dashboard()["orders"] if o["order_id"] == order_id), None)
        if mock and mock.get("delivery_date"):
            delivery  = datetime.date.fromisoformat(mock["delivery_date"])
            days_late = max(0, (today - delivery).days)
            order     = {**mock, "days_overdue": days_late, "delay_reason": mock.get("notes", "")}

    if not order:
        raise HTTPException(404, f"Order {order_id} not found")

    days_overdue = order.get("days_overdue", 0)
    ai = await get_ai_analysis(order, days_overdue, settings.openai_api_key)

    if not ai:
        raise HTTPException(503, "AI analysis unavailable — check OPENAI_API_KEY in backend/.env")

    return {
        "order_id":     order_id,
        "order_number": order.get("order_number"),
        "days_overdue": days_overdue,
        **ai,
    }


@router.post("/louvers/orders/check-delays")
async def check_and_notify_delays():
    """Scan all orders for overdue deliveries and send email alerts. DB-first, mock fallback."""
    settings = get_settings()
    today    = datetime.date.today()

    # ── DB path ───────────────────────────────────────────────────────────────
    if _DB_AVAILABLE and await is_db_available():
        pool    = await get_pool()
        overdue = await query_overdue_orders(pool)
        source  = "mysql"
    else:
        # ── Mock fallback ─────────────────────────────────────────────────────
        all_orders = _mock_dashboard()["orders"]
        overdue = [
            {**o, "days_overdue": (today - datetime.date.fromisoformat(o["delivery_date"])).days}
            for o in all_orders
            if o.get("delivery_date")
            and o["status"] not in ("DELIVERED", "CANCELLED")
            and datetime.date.fromisoformat(o["delivery_date"]) < today
        ]
        source = "mock"

    if not overdue:
        return {"success": True, "overdue_count": 0, "notified": [],
                "data_source": source, "message": "No overdue orders found."}

    results = []
    for order in overdue:
        days_late = order.get("days_overdue", 0)
        result    = await send_delay_notification(order, days_late, settings)
        results.append({
            **result,
            "days_overdue": days_late,
            "customer":     order.get("customer_name"),
            "order_number": order.get("order_number"),
        })

    sent_count = sum(1 for r in results if r.get("sent"))
    demo_count = sum(1 for r in results if r.get("demo_mode"))
    return {
        "success":          True,
        "data_source":      source,
        "overdue_count":    len(overdue),
        "emails_sent":      sent_count,
        "demo_mode_count":  demo_count,
        "notified":         results,
    }


@router.post("/louvers/orders/{order_id}/notify-delay")
async def notify_single_order_delay(order_id: int):
    """Send a delay notification email for one specific order. DB-first, mock fallback."""
    settings = get_settings()
    today    = datetime.date.today()
    order    = None
    source   = "mock"

    # ── DB path ───────────────────────────────────────────────────────────────
    if _DB_AVAILABLE and await is_db_available():
        pool  = await get_pool()
        order = await query_single_overdue_order(pool, order_id)
        if order:
            source = "mysql"

    # ── Mock fallback ─────────────────────────────────────────────────────────
    if not order:
        mock = next((o for o in _mock_dashboard()["orders"] if o["order_id"] == order_id), None)
        if mock:
            if mock["status"] in ("DELIVERED", "CANCELLED"):
                raise HTTPException(400, f"Order {order_id} is already {mock['status']} — no alert needed")
            if not mock.get("delivery_date"):
                raise HTTPException(400, f"Order {order_id} has no delivery date set")
            delivery  = datetime.date.fromisoformat(mock["delivery_date"])
            days_late = max(0, (today - delivery).days)
            order     = {**mock, "days_overdue": days_late}

    if not order:
        raise HTTPException(404, f"Order {order_id} not found in DB or mock data")

    days_late = order.get("days_overdue", 0)
    result    = await send_delay_notification(order, days_late, settings)
    return {**result, "days_overdue": days_late, "order_id": order_id, "data_source": source}


# ─────────────────────────────────────────────────────────────────────────────
# DISTRIBUTOR CLAIMS
# ─────────────────────────────────────────────────────────────────────────────

VALID_CLAIM_STATUSES = {"DRAFT","SUBMITTED","UNDER_REVIEW","APPROVED","PARTIAL","REJECTED"}

class CreateClaimRequest(BaseModel):
    distributor_name: str
    claim_type:       str   # PRICE_DIFF | DAMAGE | FREIGHT_EXCESS | PROMO_SUPPORT | SHORTAGE
    product_name:     str
    invoice_ref:      str
    invoice_date:     str
    quantity:         float = Field(gt=0)
    unit:             str
    claimed_rate:     float
    approved_rate:    Optional[float] = None
    amount_claimed:   float
    notes:            Optional[str]  = None

class ClaimStatusUpdate(BaseModel):
    status:          str
    approved_amount: Optional[float] = None
    remarks:         Optional[str]   = None

@router.post("/louvers/claims")
async def create_claim(req: CreateClaimRequest):
    today = datetime.date.today()
    num   = f"DC-{today.strftime('%Y%m%d')}-{datetime.datetime.now().strftime('%H%M%S')}"
    return {"success": True, "claim_number": num, "status": "SUBMITTED", "demo_mode": True}

@router.put("/louvers/claims/{claim_id}/status")
async def update_claim_status(claim_id: int, req: ClaimStatusUpdate):
    if req.status not in VALID_CLAIM_STATUSES:
        raise HTTPException(422, f"Status must be one of {VALID_CLAIM_STATUSES}")
    return {"success": True, "claim_id": claim_id, "status": req.status,
            "approved_amount": req.approved_amount, "demo_mode": True}

# ─────────────────────────────────────────────────────────────────────────────
# CUSTOMER REBATES
# ─────────────────────────────────────────────────────────────────────────────

VALID_REBATE_STATUSES = {"ACTIVE","ACHIEVED","PENDING_APPROVAL","PAID","LAPSED"}

class CreateRebateRequest(BaseModel):
    customer_name:  str
    customer_type:  str
    rebate_type:    str     # VOLUME | LOYALTY | PROJECT | ANNUAL_TARGET
    category:       Optional[str] = None
    target_amount:  float
    rebate_pct:     float
    period_start:   str
    period_end:     str
    notes:          Optional[str] = None

class RebateStatusUpdate(BaseModel):
    status:         str
    actual_amount:  Optional[float] = None

@router.post("/louvers/rebates")
async def create_rebate(req: CreateRebateRequest):
    today = datetime.date.today()
    num   = f"RB-{today.strftime('%Y%m%d')}-{datetime.datetime.now().strftime('%H%M%S')}"
    rebate_value = round(req.target_amount * req.rebate_pct / 100, 2)
    return {"success": True, "rebate_number": num, "status": "ACTIVE",
            "rebate_value": rebate_value, "demo_mode": True}

@router.put("/louvers/rebates/{rebate_id}/status")
async def update_rebate_status(rebate_id: int, req: RebateStatusUpdate):
    if req.status not in VALID_REBATE_STATUSES:
        raise HTTPException(422, f"Status must be one of {VALID_REBATE_STATUSES}")
    return {"success": True, "rebate_id": rebate_id, "status": req.status, "demo_mode": True}

# ─────────────────────────────────────────────────────────────────────────────
# MOCK DATA
# ─────────────────────────────────────────────────────────────────────────────

def _mock_dashboard() -> dict:
    today = datetime.date.today()

    # ── Products ──────────────────────────────────────────────────────────────
    products = [
        {"product_id": 19, "sku_code": "HPL-1MM-MATTE",
         "sku_name": "HPL 1mm Matte (8×4)", "brand": "Greenlam",
         "category": "High Pressure Laminate", "unit": "sheet",
         "buy_price": 1080.0, "sell_price": 1300.0,
         "margin_pct": round((1300-1080)/1300*100,1),
         "applications": "Kitchen cabinets, wardrobes, office furniture",
         "certifications": "IS 2046, FR grade available"},
        {"product_id": 20, "sku_code": "HPL-COMPACT-6MM",
         "sku_name": "HPL Compact 6mm (8×4)", "brand": "Greenlam",
         "category": "Compact Laminate", "unit": "sheet",
         "buy_price": 2980.0, "sell_price": 3600.0,
         "margin_pct": round((3600-2980)/3600*100,1),
         "applications": "Toilet cubicles, exterior cladding, wet areas",
         "certifications": "Moisture resistant, fungal resistant"},
        {"product_id": 21, "sku_code": "ACRYLIC-LAM-84",
         "sku_name": "Acrylic Laminate (8×4)", "brand": "Generic",
         "category": "Acrylic", "unit": "sheet",
         "buy_price": 1720.0, "sell_price": 2100.0,
         "margin_pct": round((2100-1720)/2100*100,1),
         "applications": "High-gloss shutters, modular kitchens, retail displays",
         "certifications": "Anti-scratch, UV resistant"},
        {"product_id": 22, "sku_code": "LOUV-ALU-Z100-ANOD",
         "sku_name": "Aluminium Z-Profile 100mm Anodized", "brand": "Generic",
         "category": "Louvers", "unit": "RM",
         "buy_price": 1720.0, "sell_price": 2100.0,
         "margin_pct": round((2100-1720)/2100*100,1),
         "applications": "Facade louvres, sun-shading, ventilation screens",
         "certifications": "AA-25 anodizing, QUALICOAT certified"},
        {"product_id": 23, "sku_code": "LOUV-ALU-Z80-PC",
         "sku_name": "Aluminium Z-Profile 80mm Powder Coated", "brand": "Generic",
         "category": "Louvers", "unit": "RM",
         "buy_price": 1350.0, "sell_price": 1680.0,
         "margin_pct": round((1680-1350)/1680*100,1),
         "applications": "Interior partitions, commercial facades, car park screens",
         "certifications": "PVDF coating, RAL colour range"},
        {"product_id": 24, "sku_code": "LOUV-PVC-100",
         "sku_name": "PVC Louver Blades 100mm", "brand": "Generic",
         "category": "Louvers", "unit": "RM",
         "buy_price": 390.0, "sell_price": 580.0,
         "margin_pct": round((580-390)/580*100,1),
         "applications": "Window blinds, residential facades, light screening",
         "certifications": "UV stabilised, 10-yr warranty"},
        {"product_id": 25, "sku_code": "LOUV-OPS-MTR",
         "sku_name": "Operable Louvre System (Motorised)", "brand": "Generic",
         "category": "Operable Louvre System", "unit": "SQM",
         "buy_price": 9200.0, "sell_price": 12000.0,
         "margin_pct": round((12000-9200)/12000*100,1),
         "applications": "Rooftop pergolas, commercial atriums, architectural features",
         "certifications": "Somfy motor, IP54, 5-yr system warranty"},
    ]

    # ── Supplier Quotes keyed by product_id ───────────────────────────────────
    quotations = {
        19: [
            {"supplier_id":4,  "name":"Century Plyboards",     "city":"Kolkata",   "rate":1080,"freight":18,"moq":50, "lead":6, "rel":91,"rec":"PREFERRED","is_best":True},
            {"supplier_id":7,  "name":"Merino Industries",      "city":"Kolkata",   "rate":1150,"freight":22,"moq":50, "lead":7, "rel":94,"rec":"GOOD",     "is_best":False},
            {"supplier_id":8,  "name":"Action Tesa",            "city":"Ahmedabad", "rate": 990,"freight":25,"moq":100,"lead":8, "rel":82,"rec":"GOOD",     "is_best":False},
            {"supplier_id":9,  "name":"Formica India",          "city":"Mumbai",    "rate":1225,"freight":20,"moq":30, "lead":5, "rel":97,"rec":"PREFERRED","is_best":False},
        ],
        20: [
            {"supplier_id":4,  "name":"Century Plyboards",     "city":"Kolkata",   "rate":2980,"freight":28,"moq":25, "lead":6, "rel":91,"rec":"PREFERRED","is_best":True},
            {"supplier_id":7,  "name":"Merino Industries",      "city":"Kolkata",   "rate":3200,"freight":35,"moq":20, "lead":7, "rel":94,"rec":"GOOD",     "is_best":False},
            {"supplier_id":10, "name":"Stylam Industries",      "city":"Panchkula", "rate":2750,"freight":40,"moq":30, "lead":10,"rel":79,"rec":"REVIEW",   "is_best":False},
        ],
        21: [
            {"supplier_id":11, "name":"Durian Industries",      "city":"Mumbai",    "rate":1720,"freight":22,"moq":20, "lead":7, "rel":88,"rec":"GOOD",     "is_best":True},
            {"supplier_id":8,  "name":"Action Tesa",            "city":"Ahmedabad", "rate":1850,"freight":28,"moq":25, "lead":8, "rel":82,"rec":"GOOD",     "is_best":False},
            {"supplier_id":7,  "name":"Merino Industries",      "city":"Kolkata",   "rate":1960,"freight":24,"moq":30, "lead":6, "rel":94,"rec":"GOOD",     "is_best":False},
        ],
        22: [
            {"supplier_id":13, "name":"Supreme Profile India",  "city":"Bangalore", "rate":1720,"freight":38,"moq":75, "lead":8, "rel":85,"rec":"GOOD",     "is_best":True},
            {"supplier_id":12, "name":"Alufit Systems",         "city":"Ahmedabad", "rate":1850,"freight":45,"moq":50, "lead":10,"rel":92,"rec":"GOOD",     "is_best":False},
            {"supplier_id":15, "name":"Jindal Aluminium",       "city":"Delhi",     "rate":1790,"freight":35,"moq":60, "lead":9, "rel":95,"rec":"PREFERRED","is_best":False},
            {"supplier_id":14, "name":"Alumax Profiles",        "city":"Surat",     "rate":1680,"freight":52,"moq":100,"lead":12,"rel":78,"rec":"REVIEW",   "is_best":False},
        ],
        23: [
            {"supplier_id":16, "name":"Aluline India",          "city":"Pune",      "rate":1350,"freight":35,"moq":80, "lead":9, "rel":83,"rec":"GOOD",     "is_best":True},
            {"supplier_id":12, "name":"Alufit Systems",         "city":"Ahmedabad", "rate":1480,"freight":40,"moq":50, "lead":12,"rel":92,"rec":"GOOD",     "is_best":False},
            {"supplier_id":13, "name":"Supreme Profile India",  "city":"Bangalore", "rate":1290,"freight":42,"moq":100,"lead":10,"rel":85,"rec":"GOOD",     "is_best":False},
        ],
        24: [
            {"supplier_id":13, "name":"Supreme Profile India",  "city":"Bangalore", "rate": 390,"freight":15,"moq":150,"lead":5, "rel":85,"rec":"GOOD",     "is_best":True},
            {"supplier_id":17, "name":"Coltors India",          "city":"Chennai",   "rate": 420,"freight":18,"moq":100,"lead":6, "rel":80,"rec":"GOOD",     "is_best":False},
            {"supplier_id":18, "name":"Polycab India",          "city":"Halol",     "rate": 445,"freight":12,"moq":100,"lead":4, "rel":90,"rec":"PREFERRED","is_best":False},
        ],
        25: [
            {"supplier_id":19, "name":"Technal India",          "city":"Mumbai",    "rate":9200,"freight":180,"moq":8, "lead":18,"rel":96,"rec":"PREFERRED","is_best":True},
            {"supplier_id":12, "name":"Alufit Systems",         "city":"Ahmedabad", "rate":8500,"freight":200,"moq":10,"lead":21,"rel":92,"rec":"GOOD",     "is_best":False},
            {"supplier_id":20, "name":"YKK AP India",           "city":"Bangalore", "rate":10500,"freight":150,"moq":5,"lead":25,"rel":98,"rec":"PREFERRED","is_best":False},
        ],
    }

    # ── Sales Orders ──────────────────────────────────────────────────────────
    orders = [
        {"order_id":1,"order_number":"LO-20260408-001","customer_name":"Skyline Architects",
         "customer_type":"Architect","product_name":"Aluminium Z-Profile 100mm Anodized",
         "category":"Louvers","quantity":280,"unit":"RM","sell_price":2100,"buy_price":1720,
         "total_value":588000,"margin_pct":18.1,"supplier_name":"Supreme Profile India",
         "delivery_date":(today+datetime.timedelta(days=4)).isoformat(),
         "site_location":"Whitefield, Bangalore","status":"IN_PRODUCTION",
         "notes":"Anodized silver — facade elevation project","created_at":"2026-04-08T09:15:00"},
        {"order_id":2,"order_number":"LO-20260410-001","customer_name":"Metro Constructions",
         "customer_type":"Contractor","product_name":"HPL Compact 6mm (8×4)",
         "category":"Compact Laminate","quantity":45,"unit":"sheet","sell_price":3600,"buy_price":2980,
         "total_value":162000,"margin_pct":17.2,"supplier_name":"Century Plyboards",
         "delivery_date":(today+datetime.timedelta(days=2)).isoformat(),
         "site_location":"Koramangala, Bangalore","status":"CONFIRMED",
         "notes":"Toilet cubicle installation — 12 units","created_at":"2026-04-10T11:30:00"},
        {"order_id":3,"order_number":"LO-20260412-001","customer_name":"Urban Living Interiors",
         "customer_type":"Interior Firm","product_name":"HPL 1mm Matte (8×4)",
         "category":"High Pressure Laminate","quantity":120,"unit":"sheet","sell_price":1300,"buy_price":1080,
         "total_value":156000,"margin_pct":16.9,"supplier_name":"Century Plyboards",
         "delivery_date":(today+datetime.timedelta(days=6)).isoformat(),
         "site_location":"Indiranagar, Bangalore","status":"DISPATCHED",
         "notes":"Matte grey + white tones for apartment fitout","created_at":"2026-04-12T14:00:00"},
        {"order_id":4,"order_number":"LO-20260414-001","customer_name":"Prestige Developers",
         "customer_type":"Developer","product_name":"Operable Louvre System (Motorised)",
         "category":"Operable Louvre System","quantity":48,"unit":"SQM","sell_price":12000,"buy_price":9200,
         "total_value":576000,"margin_pct":23.3,"supplier_name":"Technal India",
         "delivery_date":(today+datetime.timedelta(days=16)).isoformat(),
         "site_location":"Hebbal, Bangalore","status":"CONFIRMED",
         "notes":"Rooftop pergola — Somfy motorised, RAL 7016","created_at":"2026-04-14T10:00:00"},
        {"order_id":5,"order_number":"LO-20260416-001","customer_name":"Gloss Studio",
         "customer_type":"Interior Firm","product_name":"Acrylic Laminate (8×4)",
         "category":"Acrylic","quantity":35,"unit":"sheet","sell_price":2100,"buy_price":1720,
         "total_value":73500,"margin_pct":18.1,"supplier_name":"Durian Industries",
         "delivery_date":(today+datetime.timedelta(days=1)).isoformat(),
         "site_location":"JP Nagar, Bangalore","status":"DELIVERED",
         "notes":"High-gloss white for modular kitchen","created_at":"2026-04-16T16:45:00"},
        {"order_id":6,"order_number":"LO-20260418-001","customer_name":"TechPark Infra",
         "customer_type":"Developer","product_name":"PVC Louver Blades 100mm",
         "category":"Louvers","quantity":450,"unit":"RM","sell_price":580,"buy_price":390,
         "total_value":261000,"margin_pct":32.8,"supplier_name":"Supreme Profile India",
         "delivery_date":(today+datetime.timedelta(days=3)).isoformat(),
         "site_location":"Electronic City, Bangalore","status":"DRAFT",
         "notes":"Car park screening — 3 levels","created_at":"2026-04-18T09:00:00"},
        {"order_id":7,"order_number":"LO-20260420-001","customer_name":"Decor Workspace",
         "customer_type":"Interior Firm","product_name":"Aluminium Z-Profile 80mm Powder Coated",
         "category":"Louvers","quantity":160,"unit":"RM","sell_price":1680,"buy_price":1350,
         "total_value":268800,"margin_pct":19.6,"supplier_name":"Aluline India",
         "delivery_date":(today+datetime.timedelta(days=7)).isoformat(),
         "site_location":"MG Road, Bangalore","status":"CONFIRMED",
         "notes":"RAL 9005 jet black — office partition screens","created_at":"2026-04-20T13:30:00"},
        {"order_id":8,"order_number":"LO-20260422-001","customer_name":"Horizon Hotels",
         "customer_type":"Developer","product_name":"HPL Compact 6mm (8×4)",
         "category":"Compact Laminate","quantity":80,"unit":"sheet","sell_price":3600,"buy_price":2980,
         "total_value":288000,"margin_pct":17.2,"supplier_name":"Century Plyboards",
         "delivery_date":(today+datetime.timedelta(days=9)).isoformat(),
         "site_location":"Marathahalli, Bangalore","status":"DRAFT",
         "notes":"Hotel washroom cubicles — 40 units","created_at":"2026-04-22T10:00:00"},

        # ── OVERDUE TEST ORDERS (delivery date in the past) ───────────────────
        {"order_id":9,"order_number":"LO-20260418-DEL-001","customer_name":"Crystal Interiors",
         "customer_type":"Interior Firm","product_name":"HPL 1mm Matte (8×4)",
         "category":"High Pressure Laminate","quantity":90,"unit":"sheet","sell_price":1300,"buy_price":1080,
         "total_value":117000,"margin_pct":16.9,"supplier_name":"Century Plyboards",
         "delivery_date":(today-datetime.timedelta(days=5)).isoformat(),
         "site_location":"Koramangala, Bangalore","status":"IN_PRODUCTION",
         "notes":"Matte finish for residential apartment fitout — OVERDUE","created_at":"2026-04-10T10:00:00"},
        {"order_id":10,"order_number":"LO-20260420-DEL-001","customer_name":"BuildRight Construction",
         "customer_type":"Contractor","product_name":"HPL Compact 6mm (8×4)",
         "category":"Compact Laminate","quantity":60,"unit":"sheet","sell_price":3600,"buy_price":2980,
         "total_value":216000,"margin_pct":17.2,"supplier_name":"Stylam Industries",
         "delivery_date":(today-datetime.timedelta(days=3)).isoformat(),
         "site_location":"HSR Layout, Bangalore","status":"CONFIRMED",
         "notes":"Toilet partitions for commercial complex — OVERDUE","created_at":"2026-04-12T09:00:00"},
        {"order_id":11,"order_number":"LO-20260415-DEL-001","customer_name":"NovaBuild Developers",
         "customer_type":"Developer","product_name":"PVC Louver Blades 100mm",
         "category":"Louvers","quantity":320,"unit":"RM","sell_price":580,"buy_price":390,
         "total_value":185600,"margin_pct":32.8,"supplier_name":"Polycab India",
         "delivery_date":(today-datetime.timedelta(days=8)).isoformat(),
         "site_location":"Electronic City Phase 2, Bangalore","status":"DISPATCHED",
         "notes":"Car park screening — dispatched but not delivered — OVERDUE","created_at":"2026-04-08T11:00:00"},
    ]

    # ── Distributor Claims ────────────────────────────────────────────────────
    claims = [
        {"claim_id":1,"claim_number":"DC-20260401-001","distributor_name":"Bangalore Building Supplies",
         "claim_type":"PRICE_DIFF","product_name":"HPL 1mm Matte (8×4)","invoice_ref":"INV-2026-0312",
         "invoice_date":"2026-03-12","quantity":80,"unit":"sheet",
         "claimed_rate":220.0,"approved_rate":180.0,
         "amount_claimed":17600,"amount_approved":14400,
         "status":"APPROVED","remarks":"Approved at ₹180/sheet price diff (market movement)",
         "created_at":"2026-04-01T10:00:00"},
        {"claim_id":2,"claim_number":"DC-20260405-001","distributor_name":"South India Facades",
         "claim_type":"DAMAGE","product_name":"Aluminium Z-Profile 100mm Anodized","invoice_ref":"INV-2026-0380",
         "invoice_date":"2026-03-28","quantity":40,"unit":"RM",
         "claimed_rate":2100.0,"approved_rate":None,
         "amount_claimed":84000,"amount_approved":None,
         "status":"UNDER_REVIEW","remarks":"Transit damage — insurance survey pending",
         "created_at":"2026-04-05T14:30:00"},
        {"claim_id":3,"claim_number":"DC-20260408-001","distributor_name":"Karnataka Laminates",
         "claim_type":"FREIGHT_EXCESS","product_name":"HPL Compact 6mm (8×4)","invoice_ref":"INV-2026-0390",
         "invoice_date":"2026-04-01","quantity":30,"unit":"sheet",
         "claimed_rate":420.0,"approved_rate":350.0,
         "amount_claimed":12600,"amount_approved":10500,
         "status":"PARTIAL","remarks":"Approved at standard freight rate ₹350/sheet",
         "created_at":"2026-04-08T09:15:00"},
        {"claim_id":4,"claim_number":"DC-20260410-001","distributor_name":"Deccan Profile House",
         "claim_type":"PROMO_SUPPORT","product_name":"Operable Louvre System (Motorised)","invoice_ref":"INV-2026-0401",
         "invoice_date":"2026-04-05","quantity":12,"unit":"SQM",
         "claimed_rate":1500.0,"approved_rate":1500.0,
         "amount_claimed":18000,"amount_approved":18000,
         "status":"APPROVED","remarks":"Q1 promotional display support — approved in full",
         "created_at":"2026-04-10T11:00:00"},
        {"claim_id":5,"claim_number":"DC-20260415-001","distributor_name":"Bangalore Building Supplies",
         "claim_type":"SHORTAGE","product_name":"Acrylic Laminate (8×4)","invoice_ref":"INV-2026-0425",
         "invoice_date":"2026-04-10","quantity":5,"unit":"sheet",
         "claimed_rate":2100.0,"approved_rate":None,
         "amount_claimed":10500,"amount_approved":None,
         "status":"SUBMITTED","remarks":"5 sheets short in 40-sheet delivery — count verified",
         "created_at":"2026-04-15T16:00:00"},
        {"claim_id":6,"claim_number":"DC-20260418-001","distributor_name":"South India Facades",
         "claim_type":"PRICE_DIFF","product_name":"Aluminium Z-Profile 80mm Powder Coated","invoice_ref":"INV-2026-0441",
         "invoice_date":"2026-04-12","quantity":120,"unit":"RM",
         "claimed_rate":180.0,"approved_rate":None,
         "amount_claimed":21600,"amount_approved":None,
         "status":"DRAFT","remarks":"Price revision not reflected in last invoice",
         "created_at":"2026-04-18T10:30:00"},
    ]

    # ── Customer Rebates ──────────────────────────────────────────────────────
    rebates = [
        {"rebate_id":1,"rebate_number":"RB-20260101-001","customer_name":"Prestige Developers",
         "customer_type":"Developer","rebate_type":"ANNUAL_TARGET","category":"All Louvers",
         "target_amount":2000000,"actual_amount":2340000,"rebate_pct":3.0,
         "rebate_value":70200,"period_start":"2026-01-01","period_end":"2026-03-31",
         "status":"ACHIEVED","notes":"Exceeded Q1 target by 17% — full rebate triggered",
         "created_at":"2026-01-01T00:00:00"},
        {"rebate_id":2,"rebate_number":"RB-20260101-002","customer_name":"Urban Living Interiors",
         "customer_type":"Interior Firm","rebate_type":"VOLUME","category":"High Pressure Laminate",
         "target_amount":500000,"actual_amount":423000,"rebate_pct":2.0,
         "rebate_value":8460,"period_start":"2026-01-01","period_end":"2026-06-30",
         "status":"ACTIVE","notes":"On track — ₹77K remaining to hit target",
         "created_at":"2026-01-01T00:00:00"},
        {"rebate_id":3,"rebate_number":"RB-20260101-003","customer_name":"Metro Constructions",
         "customer_type":"Contractor","rebate_type":"PROJECT","category":"Compact Laminate",
         "target_amount":400000,"actual_amount":450000,"rebate_pct":2.5,
         "rebate_value":11250,"period_start":"2026-02-01","period_end":"2026-04-30",
         "status":"PENDING_APPROVAL","notes":"Project completed — rebate pending finance sign-off",
         "created_at":"2026-02-01T00:00:00"},
        {"rebate_id":4,"rebate_number":"RB-20260101-004","customer_name":"Skyline Architects",
         "customer_type":"Architect","rebate_type":"LOYALTY","category":"All Products",
         "target_amount":1000000,"actual_amount":870000,"rebate_pct":1.5,
         "rebate_value":13050,"period_start":"2026-01-01","period_end":"2026-12-31",
         "status":"ACTIVE","notes":"Loyalty rebate for 3rd year partner — ₹130K to target",
         "created_at":"2026-01-01T00:00:00"},
        {"rebate_id":5,"rebate_number":"RB-20260101-005","customer_name":"Horizon Hotels",
         "customer_type":"Developer","rebate_type":"VOLUME","category":"Louvers",
         "target_amount":800000,"actual_amount":576000,"rebate_pct":2.0,
         "rebate_value":11520,"period_start":"2026-04-01","period_end":"2026-09-30",
         "status":"ACTIVE","notes":"H1 volume rebate — 72% of target achieved",
         "created_at":"2026-04-01T00:00:00"},
        {"rebate_id":6,"rebate_number":"RB-20250401-001","customer_name":"TechPark Infra",
         "customer_type":"Developer","rebate_type":"ANNUAL_TARGET","category":"All Products",
         "target_amount":3000000,"actual_amount":2650000,"rebate_pct":2.5,
         "rebate_value":66250,"period_start":"2025-04-01","period_end":"2026-03-31",
         "status":"LAPSED","notes":"Missed annual target by ₹3.5L — rebate lapsed",
         "created_at":"2025-04-01T00:00:00"},
    ]

    # ── KPIs ──────────────────────────────────────────────────────────────────
    order_revenue  = sum(o["total_value"] for o in orders)
    active_orders  = sum(1 for o in orders if o["status"] not in ("DELIVERED","CANCELLED"))
    avg_margin     = round(sum(o["margin_pct"] for o in orders)/len(orders), 1)
    pipeline_val   = sum(o["total_value"] for o in orders if o["status"] in ("DRAFT","CONFIRMED","IN_PRODUCTION"))
    claims_pending = sum(o["amount_claimed"] for o in claims if o["status"] in ("SUBMITTED","UNDER_REVIEW","DRAFT"))
    claims_approved= sum((o["amount_approved"] or 0) for o in claims if o["status"] in ("APPROVED","PARTIAL"))
    rebate_liability=sum(r["rebate_value"] for r in rebates if r["status"] in ("ACTIVE","PENDING_APPROVAL","ACHIEVED"))
    rebate_paid    = sum(r["rebate_value"] for r in rebates if r["status"] == "PAID")

    return {
        "kpis": {
            "orders_this_month": len(orders),
            "active_orders":     active_orders,
            "order_revenue":     order_revenue,
            "avg_margin_pct":    avg_margin,
            "pipeline_value":    pipeline_val,
            "claims_pending":    claims_pending,
            "claims_approved":   claims_approved,
            "rebate_liability":  rebate_liability,
            "rebate_paid":       rebate_paid,
        },
        "products":   products,
        "quotations": {str(k): v for k, v in quotations.items()},
        "orders":     orders,
        "claims":     claims,
        "rebates":    rebates,
        "data_source": "mock",
    }
