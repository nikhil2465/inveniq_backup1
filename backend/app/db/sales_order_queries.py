"""DB queries for sales orders — overdue detection."""
import datetime
import logging
import aiomysql

logger = logging.getLogger(__name__)

# Orders older than this many days with status=PENDING are considered overdue
OVERDUE_THRESHOLD_DAYS = 3


async def query_overdue_orders(pool) -> list:
    """
    Returns PENDING orders that have been waiting longer than OVERDUE_THRESHOLD_DAYS.
    Joins customer_orders → order_items → products → customers for a full picture.
    """
    sql = """
        SELECT
            co.order_id,
            co.order_number,
            c.customer_name,
            c.segment            AS customer_type,
            c.email              AS customer_email,
            c.phone              AS customer_phone,
            co.order_date,
            co.status,
            co.total_value,
            co.delayed_hrs,
            co.delay_reason,
            GROUP_CONCAT(
                DISTINCT p.sku_name
                ORDER BY oi.order_item_id
                SEPARATOR ', '
            )                    AS product_name,
            GROUP_CONCAT(
                DISTINCT p.category
                SEPARATOR ', '
            )                    AS category,
            SUM(oi.quantity)     AS quantity,
            MIN(p.unit)          AS unit,
            DATEDIFF(CURDATE(), co.order_date) AS days_since_order
        FROM customer_orders co
        JOIN customers  c  ON c.customer_id  = co.customer_id
        JOIN order_items oi ON oi.order_id   = co.order_id
        JOIN products   p  ON p.product_id   = oi.product_id
        WHERE co.status = 'PENDING'
          AND DATEDIFF(CURDATE(), co.order_date) > %s
        GROUP BY
            co.order_id, co.order_number,
            c.customer_name, c.segment, c.email, c.phone,
            co.order_date, co.status,
            co.total_value, co.delayed_hrs, co.delay_reason
        ORDER BY co.order_date ASC
    """
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, (OVERDUE_THRESHOLD_DAYS,))
                rows = await cur.fetchall()
    except Exception as exc:
        logger.error("query_overdue_orders failed: %s", exc)
        return []

    today = datetime.date.today()
    result = []
    for r in rows:
        order_date   = r["order_date"]   # date object from aiomysql
        days_since   = int(r["days_since_order"])
        days_overdue = days_since - OVERDUE_THRESHOLD_DAYS
        expected_del = (order_date + datetime.timedelta(days=OVERDUE_THRESHOLD_DAYS)).isoformat()

        result.append({
            "order_id":      r["order_id"],
            "order_number":  r["order_number"],
            "customer_name": r["customer_name"],
            "customer_type": r["customer_type"],
            "product_name":  r["product_name"],
            "category":      r["category"],
            "quantity":      int(r["quantity"]),
            "unit":          r["unit"],
            "total_value":   float(r["total_value"]),
            "supplier_name": r["delay_reason"] or "—",
            "site_location": "—",
            "status":        r["status"],
            "delivery_date": expected_del,   # order_date + 3d = expected promise
            "delay_reason":  r["delay_reason"],
            "delayed_hrs":   r["delayed_hrs"],
            "days_overdue":  days_overdue,
            "data_source":   "mysql",
        })
    return result


async def query_single_overdue_order(pool, order_id: int) -> dict | None:
    """Fetch one order by ID and normalise it into the same format as query_overdue_orders."""
    sql = """
        SELECT
            co.order_id,
            co.order_number,
            c.customer_name,
            c.segment            AS customer_type,
            co.order_date,
            co.status,
            co.total_value,
            co.delayed_hrs,
            co.delay_reason,
            GROUP_CONCAT(
                DISTINCT p.sku_name
                ORDER BY oi.order_item_id
                SEPARATOR ', '
            )                    AS product_name,
            GROUP_CONCAT(
                DISTINCT p.category
                SEPARATOR ', '
            )                    AS category,
            SUM(oi.quantity)     AS quantity,
            MIN(p.unit)          AS unit,
            DATEDIFF(CURDATE(), co.order_date) AS days_since_order
        FROM customer_orders co
        JOIN customers  c  ON c.customer_id  = co.customer_id
        JOIN order_items oi ON oi.order_id   = co.order_id
        JOIN products   p  ON p.product_id   = oi.product_id
        WHERE co.order_id = %s
        GROUP BY
            co.order_id, co.order_number,
            c.customer_name, c.segment,
            co.order_date, co.status,
            co.total_value, co.delayed_hrs, co.delay_reason
    """
    try:
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, (order_id,))
                r = await cur.fetchone()
    except Exception as exc:
        logger.error("query_single_overdue_order failed: %s", exc)
        return None

    if not r:
        return None

    order_date   = r["order_date"]
    days_since   = int(r["days_since_order"])
    days_overdue = max(0, days_since - OVERDUE_THRESHOLD_DAYS)
    expected_del = (order_date + datetime.timedelta(days=OVERDUE_THRESHOLD_DAYS)).isoformat()

    return {
        "order_id":      r["order_id"],
        "order_number":  r["order_number"],
        "customer_name": r["customer_name"],
        "customer_type": r["customer_type"],
        "product_name":  r["product_name"],
        "category":      r["category"],
        "quantity":      int(r["quantity"]),
        "unit":          r["unit"],
        "total_value":   float(r["total_value"]),
        "supplier_name": r["delay_reason"] or "—",
        "site_location": "—",
        "status":        r["status"],
        "delivery_date": expected_del,
        "delay_reason":  r["delay_reason"],
        "delayed_hrs":   r["delayed_hrs"],
        "days_overdue":  days_overdue,
        "data_source":   "mysql",
    }
