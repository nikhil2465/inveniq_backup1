"""
Startup Migration Runner — InvenIQ ERP
========================================
Runs all idempotent DDL on app boot.
Every statement uses CREATE TABLE IF NOT EXISTS or ALTER TABLE … IF NOT EXISTS
so it is safe to run on every restart — no state tracking needed.
"""
import logging
from app.services.inventory_ledger import STOCK_MOVEMENTS_DDL
from app.services.audit_logger import AUDIT_LOG_DDL

logger = logging.getLogger(__name__)

# ── Additional DDL for P2P enterprise tables ──────────────────────────────────

# Per-line-item GRN receipt tracking (links PO line → GRN line)
GRN_LINE_ITEMS_DDL = """
CREATE TABLE IF NOT EXISTS grn_line_items (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    grn_number      VARCHAR(100)    NOT NULL,
    po_number       VARCHAR(100)    NOT NULL,
    sku_code        VARCHAR(100)    NOT NULL,
    sku_name        VARCHAR(300)    NOT NULL,
    po_qty          DECIMAL(12,3)   NOT NULL,
    prev_received   DECIMAL(12,3)   DEFAULT 0,
    qty_received    DECIMAL(12,3)   NOT NULL,
    uom             VARCHAR(20)     DEFAULT 'Pcs',
    unit_cost       DECIMAL(12,4)   DEFAULT 0,
    batch_number    VARCHAR(100)    DEFAULT '',
    qc_status       VARCHAR(30)     DEFAULT 'PENDING_QC',
    accepted_qty    DECIMAL(12,3)   DEFAULT 0,
    rejected_qty    DECIMAL(12,3)   DEFAULT 0,
    notes           TEXT            DEFAULT '',
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_grn   (grn_number),
    INDEX idx_po    (po_number),
    INDEX idx_sku   (sku_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# PR to PO conversion ledger — tracks partial/full conversion per PR line
PR_CONVERSION_LEDGER_DDL = """
CREATE TABLE IF NOT EXISTS pr_conversion_ledger (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pr_number       VARCHAR(100)    NOT NULL,
    pr_item_id      INT             DEFAULT 0,
    sku_code        VARCHAR(100)    NOT NULL,
    pr_qty          DECIMAL(12,3)   NOT NULL,
    converted_qty   DECIMAL(12,3)   NOT NULL,
    po_number       VARCHAR(100)    NOT NULL,
    converted_by    VARCHAR(100)    DEFAULT 'system',
    converted_at    DATETIME        DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pr    (pr_number),
    INDEX idx_po    (po_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# Refresh token table for JWT token rotation
REFRESH_TOKENS_DDL = """
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    jti             VARCHAR(36)     NOT NULL UNIQUE,  -- parent access token jti
    refresh_jti     VARCHAR(36)     NOT NULL UNIQUE,  -- this refresh token's id
    username        VARCHAR(100)    NOT NULL,
    issued_at       DATETIME        DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME        NOT NULL,
    revoked         TINYINT(1)      DEFAULT 0,
    INDEX idx_rjti  (refresh_jti),
    INDEX idx_user  (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# Landing cost sheets — persistent (replaces session memory)
LANDING_COST_SHEETS_DDL = """
CREATE TABLE IF NOT EXISTS landing_cost_sheets (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sheet_id        VARCHAR(50)     NOT NULL UNIQUE,
    ref_type        VARCHAR(10)     NOT NULL,   -- PO / GRN / SO
    ref_number      VARCHAR(100)    NOT NULL,
    operation_type  VARCHAR(50)     DEFAULT '',
    sku_code        VARCHAR(100)    DEFAULT '',
    sku_name        VARCHAR(300)    DEFAULT '',
    qty             DECIMAL(12,3)   DEFAULT 0,
    unit            VARCHAR(20)     DEFAULT 'Pcs',
    base_price      DECIMAL(12,4)   DEFAULT 0,
    charges_json    TEXT            DEFAULT '{}',   -- JSON of all charge heads
    total_landed    DECIMAL(14,2)   DEFAULT 0,
    per_unit_cost   DECIMAL(12,4)   DEFAULT 0,
    margin_impact   DECIMAL(8,4)    DEFAULT 0,
    created_by      VARCHAR(100)    DEFAULT 'system',
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ref   (ref_type, ref_number),
    INDEX idx_sku   (sku_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# Alter existing tables to add new columns safely (IF NOT EXISTS workaround via SHOW COLUMNS)
PO_GRN_SCHEMA_ADDITIONS = [
    # po_items: per-line received qty tracking
    "ALTER TABLE po_items ADD COLUMN IF NOT EXISTS qty_received    DECIMAL(12,3) DEFAULT 0",
    "ALTER TABLE po_items ADD COLUMN IF NOT EXISTS qty_returned    DECIMAL(12,3) DEFAULT 0",
    "ALTER TABLE po_items ADD COLUMN IF NOT EXISTS pr_number       VARCHAR(100)  DEFAULT ''",
    # po_items: extended QC quantity tracking
    "ALTER TABLE po_items ADD COLUMN IF NOT EXISTS accepted_qty    DECIMAL(12,3) DEFAULT 0",
    "ALTER TABLE po_items ADD COLUMN IF NOT EXISTS rejected_qty    DECIMAL(12,3) DEFAULT 0",
    "ALTER TABLE po_items ADD COLUMN IF NOT EXISTS qc_pending_qty  DECIMAL(12,3) DEFAULT 0",
    # purchase_requisitions: conversion tracking
    "ALTER TABLE purchase_requisitions ADD COLUMN IF NOT EXISTS total_converted_qty DECIMAL(12,3) DEFAULT 0",
    "ALTER TABLE purchase_requisitions ADD COLUMN IF NOT EXISTS converted_po_numbers TEXT DEFAULT ''",
    # purchase_orders: back-reference to PR
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pr_number VARCHAR(100) DEFAULT ''",
    # purchase_orders: extended status lifecycle
    "ALTER TABLE purchase_orders MODIFY COLUMN status "
    "ENUM('DRAFT','PENDING_APPROVAL','APPROVED','OPEN','PARTIAL','RECEIVED',"
    "'FULLY_RECEIVED','COMPLETE','CLOSED','RETURNED','OVERDUE','CANCELLED','REJECTED') "
    "NOT NULL DEFAULT 'DRAFT'",
    # purchase_orders: manual close tracking
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS closed_by      VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS closed_at      DATETIME     DEFAULT NULL",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS close_reason   TEXT         DEFAULT NULL",
    # purchase_orders: remaining qty disposition
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS remaining_qty_action VARCHAR(50) DEFAULT NULL",
    # grn: QC mandatory flag
    "ALTER TABLE grn ADD COLUMN IF NOT EXISTS qc_required   TINYINT(1)   DEFAULT 1",
    "ALTER TABLE grn ADD COLUMN IF NOT EXISTS qc_completed  TINYINT(1)   DEFAULT 0",
    "ALTER TABLE grn ADD COLUMN IF NOT EXISTS qc_reference  VARCHAR(100) DEFAULT ''",
    # grn: remaining qty disposition when partial
    "ALTER TABLE grn ADD COLUMN IF NOT EXISTS remaining_qty_action VARCHAR(50) DEFAULT NULL",
    # pr_items: per-line conversion qty tracking
    "ALTER TABLE pr_items ADD COLUMN IF NOT EXISTS qty_converted DECIMAL(12,3) DEFAULT 0",
    # purchase_requisitions: status with PARTIAL_CONVERTED
    "ALTER TABLE purchase_requisitions MODIFY COLUMN status "
    "ENUM('PENDING','APPROVED','REJECTED','CONVERTED','PARTIAL_CONVERTED','CANCELLED') "
    "NOT NULL DEFAULT 'PENDING'",
    # qc_inspections: extended qty types (rework + hold)
    "ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS rework_qty DECIMAL(10,2) DEFAULT 0",
    "ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS hold_qty   DECIMAL(10,2) DEFAULT 0",
    # purchase_invoices: partial + multi-GRN support
    "ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS is_partial       TINYINT(1)    DEFAULT 0",
    "ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS grn_numbers      TEXT          DEFAULT ''",
    "ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS grn_qty_covered  DECIMAL(12,3) DEFAULT 0",
]

# Double-entry journal entries — accounting groundwork
JOURNAL_ENTRIES_DDL = """
CREATE TABLE IF NOT EXISTS journal_entries (
    entry_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    voucher_no      VARCHAR(60)     NOT NULL UNIQUE,
    voucher_type    ENUM('PURCHASE','PAYMENT','JOURNAL','CREDIT_NOTE','DEBIT_NOTE')
                    NOT NULL DEFAULT 'PURCHASE',
    voucher_date    DATE            NOT NULL,
    reference_no    VARCHAR(100)    DEFAULT NULL,
    reference_type  ENUM('GRN','PO','PI','PURCHASE_RETURN','PR') DEFAULT NULL,
    debit_account   VARCHAR(150)    NOT NULL,
    credit_account  VARCHAR(150)    NOT NULL,
    amount          DECIMAL(15,2)   NOT NULL DEFAULT 0,
    narration       TEXT            DEFAULT NULL,
    supplier_name   VARCHAR(255)    DEFAULT NULL,
    created_by      VARCHAR(100)    DEFAULT 'system',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_date      (voucher_date),
    INDEX idx_ref       (reference_type, reference_no),
    INDEX idx_voucher   (voucher_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

ALL_MIGRATIONS = [
    ("stock_movements",        STOCK_MOVEMENTS_DDL),
    ("audit_log",              AUDIT_LOG_DDL),
    ("grn_line_items",         GRN_LINE_ITEMS_DDL),
    ("pr_conversion_ledger",   PR_CONVERSION_LEDGER_DDL),
    ("refresh_tokens",         REFRESH_TOKENS_DDL),
    ("landing_cost_sheets",    LANDING_COST_SHEETS_DDL),
    ("journal_entries",        JOURNAL_ENTRIES_DDL),
    # v3.3 — production readiness
    ("sales_invoices",         """CREATE TABLE IF NOT EXISTS sales_invoices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL, due_date DATE NOT NULL, customer_name VARCHAR(255) NOT NULL,
    customer_gstin VARCHAR(20) DEFAULT '', billing_address TEXT, shipping_address TEXT,
    place_of_supply VARCHAR(100) DEFAULT '', is_igst TINYINT(1) DEFAULT 0,
    subtotal DECIMAL(14,2) DEFAULT 0, discount_amount DECIMAL(12,2) DEFAULT 0,
    taxable_amount DECIMAL(14,2) DEFAULT 0, cgst_amount DECIMAL(12,2) DEFAULT 0,
    sgst_amount DECIMAL(12,2) DEFAULT 0, igst_amount DECIMAL(12,2) DEFAULT 0,
    total_tax DECIMAL(12,2) DEFAULT 0, grand_total DECIMAL(14,2) DEFAULT 0,
    paid_amount DECIMAL(14,2) DEFAULT 0,
    status ENUM('DRAFT','SENT','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED') DEFAULT 'DRAFT',
    notes TEXT, terms TEXT, reference_so_number VARCHAR(50) DEFAULT '',
    created_by VARCHAR(100) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status), INDEX idx_customer (customer_name(50)),
    INDEX idx_inv_number (invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"""),
    ("invoice_line_items",     """CREATE TABLE IF NOT EXISTS invoice_line_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, invoice_id BIGINT UNSIGNED NOT NULL,
    sl INT DEFAULT 1, description VARCHAR(500) NOT NULL, hsn_sac VARCHAR(20) DEFAULT '',
    qty DECIMAL(12,3) DEFAULT 0, unit VARCHAR(20) DEFAULT '',
    rate DECIMAL(12,2) DEFAULT 0, discount_pct DECIMAL(5,2) DEFAULT 0,
    taxable_amount DECIMAL(14,2) DEFAULT 0, cgst_rate DECIMAL(5,2) DEFAULT 0,
    sgst_rate DECIMAL(5,2) DEFAULT 0, igst_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0, line_total DECIMAL(14,2) DEFAULT 0,
    INDEX idx_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"""),
    ("invoice_payments",       """CREATE TABLE IF NOT EXISTS invoice_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, invoice_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(14,2) NOT NULL, payment_date DATE NOT NULL,
    payment_mode ENUM('NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','OTHER') DEFAULT 'NEFT',
    reference VARCHAR(100) DEFAULT '', notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_inv (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"""),
    ("company_profile",        """CREATE TABLE IF NOT EXISTS company_profile (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(255) DEFAULT '', trade_name VARCHAR(255) DEFAULT '',
    gstin VARCHAR(20) DEFAULT '', pan VARCHAR(15) DEFAULT '',
    address TEXT DEFAULT '', state VARCHAR(100) DEFAULT '',
    state_code VARCHAR(5) DEFAULT '', pin_code VARCHAR(10) DEFAULT '',
    phone VARCHAR(30) DEFAULT '', email VARCHAR(150) DEFAULT '',
    website VARCHAR(255) DEFAULT '', bank_name VARCHAR(200) DEFAULT '',
    bank_account VARCHAR(50) DEFAULT '', ifsc_code VARCHAR(20) DEFAULT '',
    account_holder VARCHAR(255) DEFAULT '', logo_url TEXT DEFAULT '',
    fy_start VARCHAR(10) DEFAULT 'April', default_gst_rate DECIMAL(5,2) DEFAULT 18,
    tax_regime VARCHAR(30) DEFAULT 'Regular', signature_name VARCHAR(255) DEFAULT '',
    smtp_host VARCHAR(255) DEFAULT '', smtp_port INT DEFAULT 587,
    smtp_user VARCHAR(255) DEFAULT '', smtp_password VARCHAR(255) DEFAULT '',
    tds_rate_professional DECIMAL(5,2) DEFAULT 10, tds_rate_contract DECIMAL(5,2) DEFAULT 2,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"""),
    ("user_accounts",          """CREATE TABLE IF NOT EXISTS user_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL, display_name VARCHAR(200) NOT NULL,
    email VARCHAR(200) DEFAULT '', role VARCHAR(50) NOT NULL DEFAULT 'sales_manager',
    password_hash VARCHAR(255) NOT NULL, allowed_modules TEXT DEFAULT 'all',
    is_active TINYINT(1) DEFAULT 1, last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"""),
]


async def run_all(pool) -> dict:
    """
    Execute all migrations. Called once at app startup.
    Returns a summary of what ran / what failed.
    """
    if pool is None:
        logger.info("startup_migrations: no DB pool — skipping (demo mode)")
        return {"status": "skipped", "reason": "demo_mode"}

    results = {"created": [], "altered": [], "failed": []}

    # 1. CREATE TABLE IF NOT EXISTS
    for table_name, ddl in ALL_MIGRATIONS:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(ddl)
            results["created"].append(table_name)
            logger.info("startup_migrations: ✓ %s", table_name)
        except Exception as exc:
            results["failed"].append({"table": table_name, "error": str(exc)})
            logger.error("startup_migrations: ✗ %s — %s", table_name, exc)

    # 2. ALTER TABLE additions (best-effort — some DBs may not support IF NOT EXISTS)
    for stmt in PO_GRN_SCHEMA_ADDITIONS:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(stmt)
            results["altered"].append(stmt.split("ADD COLUMN")[1].strip().split()[0] if "ADD COLUMN" in stmt else stmt[:60])
        except Exception as exc:
            # Column may already exist — log debug only
            logger.debug("startup_migrations ALTER: %s — %s", stmt[:80], exc)

    logger.info(
        "startup_migrations complete: %d tables created, %d failed",
        len(results["created"]), len(results["failed"]),
    )

    # 3. Reconcile po_items.qty_received from grn_line_items for any rows where
    #    the silent-exception bug left qty_received at 0 despite existing GRN records.
    await _reconcile_po_qty_received(pool, results)

    return results


async def _reconcile_po_qty_received(pool, results: dict) -> None:
    """
    One-time repair: re-sum qty_received from grn_line_items into po_items
    for any PO line whose qty_received is still 0 but GRN records exist.
    Safe to run on every startup — only touches rows where qty_received = 0.
    """
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    UPDATE po_items pi
                    JOIN purchase_orders po ON pi.po_id = po.po_id
                    JOIN (
                        SELECT po_number, SUM(qty_received) AS total_received
                        FROM grn_line_items
                        GROUP BY po_number
                    ) agg ON agg.po_number = po.po_number
                    SET pi.qty_received = GREATEST(pi.qty_received, agg.total_received)
                    WHERE pi.qty_received = 0 AND agg.total_received > 0
                """)
                affected = cur.rowcount
                if affected > 0:
                    await conn.commit()
                    logger.info(
                        "startup_migrations: reconciled qty_received for %d po_items rows",
                        affected,
                    )
    except Exception as exc:
        logger.debug("startup_migrations: po_items reconciliation skipped — %s", exc)
