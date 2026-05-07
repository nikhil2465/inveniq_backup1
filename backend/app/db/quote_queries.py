"""
MySQL queries for the Quotation Builder.
Tables are created automatically on first use (CREATE TABLE IF NOT EXISTS).
"""
import datetime
import json
import logging
from typing import Optional

import aiomysql

logger = logging.getLogger(__name__)

# ── DDL ────────────────────────────────────────────────────────────────────────

_DDL_QUOTATIONS = """
CREATE TABLE IF NOT EXISTS quotations (
    quote_id        INT AUTO_INCREMENT PRIMARY KEY,
    quote_number    VARCHAR(30)   NOT NULL UNIQUE,
    created_at      DATE          NOT NULL,
    valid_till      DATE          NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    customer_name   VARCHAR(200)  NOT NULL,
    customer_type   VARCHAR(50)   DEFAULT 'Developer',
    contact_person  VARCHAR(200)  DEFAULT '',
    contact_phone   VARCHAR(50)   DEFAULT '',
    contact_email   VARCHAR(200)  DEFAULT '',
    gst_number      VARCHAR(50)   DEFAULT '',
    billing_address TEXT,
    site_location   VARCHAR(500)  DEFAULT '',
    project_name    VARCHAR(500)  DEFAULT '',
    payment_terms   VARCHAR(200)  DEFAULT '',
    delivery_terms  VARCHAR(200)  DEFAULT '',
    validity_days   INT           DEFAULT 14,
    notes           TEXT,
    gst_rate        DECIMAL(5,2)  DEFAULT 18.00,
    include_freight TINYINT(1)    DEFAULT 0,
    freight_amount  DECIMAL(12,2) DEFAULT 0.00,
    subtotal        DECIMAL(12,2) DEFAULT 0.00,
    gst_amount      DECIMAL(12,2) DEFAULT 0.00,
    grand_total     DECIMAL(12,2) DEFAULT 0.00,
    avg_margin_pct  DECIMAL(5,2)  DEFAULT 0.00,
    remarks         TEXT,
    updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status  (status),
    INDEX idx_customer(customer_name(50)),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_DDL_ITEMS = """
CREATE TABLE IF NOT EXISTS quotation_items (
    item_id        INT AUTO_INCREMENT PRIMARY KEY,
    quote_id       INT           NOT NULL,
    sl             INT           DEFAULT 1,
    product_id     VARCHAR(50)   DEFAULT '',
    product_name   VARCHAR(300)  NOT NULL,
    category       VARCHAR(100)  DEFAULT '',
    quantity       DECIMAL(10,3) DEFAULT 0,
    unit           VARCHAR(30)   DEFAULT 'sheet',
    unit_price     DECIMAL(12,2) DEFAULT 0,
    discount_pct   DECIMAL(5,2)  DEFAULT 0,
    buy_price      DECIMAL(12,2) DEFAULT 0,
    net_price      DECIMAL(12,2) DEFAULT 0,
    line_total     DECIMAL(14,2) DEFAULT 0,
    specifications TEXT,
    FOREIGN KEY (quote_id) REFERENCES quotations(quote_id) ON DELETE CASCADE,
    INDEX idx_quote (quote_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


async def ensure_tables(pool: aiomysql.Pool) -> None:
    """Create quotations + quotation_items tables if they don't exist."""
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_DDL_QUOTATIONS)
            await cur.execute(_DDL_ITEMS)


# ── Quote number generator ─────────────────────────────────────────────────────

async def next_quote_number(pool: aiomysql.Pool) -> str:
    year = datetime.date.today().year
    sql = """
        SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(quote_number, '-', -1) AS UNSIGNED)), 0) + 1
        FROM quotations
        WHERE quote_number LIKE %s
    """
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (f"QT-{year}-%",))
            row = await cur.fetchone()
            seq = int(row[0]) if row and row[0] is not None else 1
    return f"QT-{year}-{seq:04d}"


# ── INSERT ─────────────────────────────────────────────────────────────────────

async def insert_quote(pool: aiomysql.Pool, quote: dict) -> int:
    """Insert a quote + its line items. Returns the new quote_id."""
    sql_q = """
        INSERT INTO quotations
            (quote_number, created_at, valid_till, status,
             customer_name, customer_type, contact_person, contact_phone, contact_email,
             gst_number, billing_address, site_location, project_name,
             payment_terms, delivery_terms, validity_days, notes,
             gst_rate, include_freight, freight_amount,
             subtotal, gst_amount, grand_total, avg_margin_pct)
        VALUES
            (%s, %s, %s, %s,
             %s, %s, %s, %s, %s,
             %s, %s, %s, %s,
             %s, %s, %s, %s,
             %s, %s, %s,
             %s, %s, %s, %s)
    """
    sql_i = """
        INSERT INTO quotation_items
            (quote_id, sl, product_id, product_name, category,
             quantity, unit, unit_price, discount_pct, buy_price,
             net_price, line_total, specifications)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql_q, (
                quote["quote_number"], quote["created_at"], quote["valid_till"], quote.get("status", "DRAFT"),
                quote["customer_name"], quote.get("customer_type", "Developer"),
                quote.get("contact_person", ""), quote.get("contact_phone", ""), quote.get("contact_email", ""),
                quote.get("gst_number", ""), quote.get("billing_address", ""),
                quote.get("site_location", ""), quote.get("project_name", ""),
                quote.get("payment_terms", ""), quote.get("delivery_terms", ""),
                quote.get("validity_days", 14), quote.get("notes", ""),
                quote.get("gst_rate", 18), int(quote.get("include_freight", False)),
                quote.get("freight_amount", 0),
                quote.get("subtotal", 0), quote.get("gst_amount", 0),
                quote.get("grand_total", 0), quote.get("avg_margin_pct", 0),
            ))
            new_id = cur.lastrowid
            for item in quote.get("line_items", []):
                await cur.execute(sql_i, (
                    new_id, item.get("sl", 1), item.get("product_id", ""),
                    item.get("product_name", ""), item.get("category", ""),
                    item.get("quantity", 0), item.get("unit", "sheet"),
                    item.get("unit_price", 0), item.get("discount_pct", 0), item.get("buy_price", 0),
                    item.get("net_price", 0), item.get("line_total", 0),
                    item.get("specifications", ""),
                ))
    return new_id


# ── SELECT ─────────────────────────────────────────────────────────────────────

async def list_quotes_db(
    pool: aiomysql.Pool,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> list:
    where = ["1=1"]
    params = []
    if status and status.upper() != "ALL":
        where.append("q.status = %s")
        params.append(status.upper())
    if search:
        where.append("(q.customer_name LIKE %s OR q.quote_number LIKE %s OR q.project_name LIKE %s)")
        like = f"%{search}%"
        params.extend([like, like, like])

    sql = f"""
        SELECT
            q.quote_id, q.quote_number, q.created_at, q.valid_till, q.status,
            q.customer_name, q.customer_type, q.contact_person, q.contact_phone,
            q.contact_email, q.gst_number, q.billing_address, q.site_location,
            q.project_name, q.payment_terms, q.delivery_terms, q.validity_days,
            q.notes, q.gst_rate, q.include_freight, q.freight_amount,
            q.subtotal, q.gst_amount, q.grand_total, q.avg_margin_pct, q.updated_at
        FROM quotations q
        WHERE {' AND '.join(where)}
        ORDER BY q.created_at DESC, q.quote_id DESC
        LIMIT 200
    """
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, params)
            rows = await cur.fetchall()

    quotes = []
    for r in rows:
        q = dict(r)
        q["created_at"]  = str(q["created_at"])
        q["valid_till"]  = str(q["valid_till"])
        q["updated_at"]  = str(q.get("updated_at", ""))
        q["include_freight"] = bool(q.get("include_freight"))
        # Alias for frontend compatibility
        q["total"]           = float(q.get("grand_total", 0))
        q["margin_pct"]      = float(q.get("avg_margin_pct", 0))
        q["line_items"]      = await _fetch_items(pool, q["quote_id"])
        quotes.append(q)
    return quotes


async def get_quote_db(pool: aiomysql.Pool, quote_id: int) -> Optional[dict]:
    sql = """
        SELECT * FROM quotations WHERE quote_id = %s
    """
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, (quote_id,))
            row = await cur.fetchone()
    if not row:
        return None
    q = dict(row)
    q["created_at"]      = str(q["created_at"])
    q["valid_till"]      = str(q["valid_till"])
    q["updated_at"]      = str(q.get("updated_at", ""))
    q["include_freight"] = bool(q.get("include_freight"))
    q["total"]           = float(q.get("grand_total", 0))
    q["margin_pct"]      = float(q.get("avg_margin_pct", 0))
    q["line_items"]      = await _fetch_items(pool, quote_id)
    return q


async def _fetch_items(pool: aiomysql.Pool, quote_id: int) -> list:
    sql = """
        SELECT item_id, sl, product_id, product_name, category,
               quantity, unit, unit_price, discount_pct, buy_price,
               net_price, line_total, specifications
        FROM quotation_items
        WHERE quote_id = %s
        ORDER BY sl
    """
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, (quote_id,))
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ── UPDATE ─────────────────────────────────────────────────────────────────────

async def update_status_db(
    pool: aiomysql.Pool, quote_id: int, status: str, remarks: Optional[str] = None
) -> bool:
    sql = "UPDATE quotations SET status = %s, remarks = %s WHERE quote_id = %s"
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (status.upper(), remarks or "", quote_id))
            return cur.rowcount > 0


async def update_quote_db(pool: aiomysql.Pool, quote_id: int, data: dict) -> Optional[dict]:
    """Full quote update — replaces header fields and all line items."""
    sql_q = """
        UPDATE quotations SET
            valid_till = %s,
            customer_name = %s, customer_type = %s, contact_person = %s,
            contact_phone = %s, contact_email = %s, gst_number = %s,
            billing_address = %s, site_location = %s, project_name = %s,
            payment_terms = %s, delivery_terms = %s, validity_days = %s,
            notes = %s, gst_rate = %s, include_freight = %s, freight_amount = %s,
            subtotal = %s, gst_amount = %s, grand_total = %s, avg_margin_pct = %s
        WHERE quote_id = %s
    """
    sql_del = "DELETE FROM quotation_items WHERE quote_id = %s"
    sql_i = """
        INSERT INTO quotation_items
            (quote_id, sl, product_id, product_name, category,
             quantity, unit, unit_price, discount_pct, buy_price,
             net_price, line_total, specifications)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql_q, (
                data.get("valid_till"),
                data.get("customer_name"), data.get("customer_type", "Developer"),
                data.get("contact_person", ""), data.get("contact_phone", ""),
                data.get("contact_email", ""), data.get("gst_number", ""),
                data.get("billing_address", ""), data.get("site_location", ""),
                data.get("project_name", ""),
                data.get("payment_terms", ""), data.get("delivery_terms", ""),
                data.get("validity_days", 14), data.get("notes", ""),
                data.get("gst_rate", 18), int(data.get("include_freight", False)),
                data.get("freight_amount", 0),
                data.get("subtotal", 0), data.get("gst_amount", 0),
                data.get("grand_total", 0), data.get("avg_margin_pct", 0),
                quote_id,
            ))
            if cur.rowcount == 0:
                return None
            await cur.execute(sql_del, (quote_id,))
            for item in data.get("line_items", []):
                await cur.execute(sql_i, (
                    quote_id, item.get("sl", 1), item.get("product_id", ""),
                    item.get("product_name", ""), item.get("category", ""),
                    item.get("quantity", 0), item.get("unit", "sheet"),
                    item.get("unit_price", 0), item.get("discount_pct", 0), item.get("buy_price", 0),
                    item.get("net_price", 0), item.get("line_total", 0),
                    item.get("specifications", ""),
                ))
    return await get_quote_db(pool, quote_id)


# ── KPI helpers ────────────────────────────────────────────────────────────────

async def kpis_db(pool: aiomysql.Pool) -> dict:
    sql = """
        SELECT
            status,
            COUNT(*)                   AS cnt,
            COALESCE(SUM(grand_total), 0) AS total_val,
            COALESCE(AVG(avg_margin_pct), 0) AS avg_margin
        FROM quotations
        GROUP BY status
    """
    today = datetime.date.today()
    expiring_sql = """
        SELECT COUNT(*) AS n FROM quotations
        WHERE status IN ('SENT','NEGOTIATING')
          AND valid_till BETWEEN %s AND %s
    """
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql)
            rows = await cur.fetchall()
            await cur.execute(expiring_sql, (today.isoformat(), (today + datetime.timedelta(days=7)).isoformat()))
            exp_row = await cur.fetchone()

    by_status = {r["status"]: r for r in rows}
    pipeline  = sum(r["total_val"] for s, r in by_status.items() if s in ("SENT", "NEGOTIATING", "DRAFT"))
    won_val   = float(by_status.get("WON",  {}).get("total_val", 0))
    lost_val  = float(by_status.get("LOST", {}).get("total_val", 0))
    won_cnt   = int(by_status.get("WON",  {}).get("cnt", 0))
    lost_cnt  = int(by_status.get("LOST", {}).get("cnt", 0))
    closed    = won_cnt + lost_cnt
    margins   = [float(r["avg_margin"]) for r in by_status.values() if r["avg_margin"]]
    return {
        "pipeline_value":  float(pipeline),
        "won_value":       won_val,
        "lost_value":      lost_val,
        "win_rate_pct":    round(won_cnt / closed * 100, 1) if closed else 0.0,
        "avg_margin_pct":  round(sum(margins) / len(margins), 1) if margins else 0.0,
        "quotes_expiring": int(exp_row["n"]) if exp_row else 0,
        "total_quotes":    sum(int(r["cnt"]) for r in by_status.values()),
    }
