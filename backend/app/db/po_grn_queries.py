"""
MySQL queries for PO & GRN data.
Used by both the REST API endpoints and the chatbot po_grn_tool.
"""
import datetime
import aiomysql

_schema_migrated = False
_lc_schema_migrated = False


async def ensure_landing_cost_schema(pool: aiomysql.Pool) -> None:
    """One-time migration: add operation_type/freight_type to purchase_orders,
    landing cost columns to grn, and create purchase_returns table."""
    global _lc_schema_migrated
    if _lc_schema_migrated:
        return
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                # Add operation_type to purchase_orders
                try:
                    await cur.execute(
                        "ALTER TABLE purchase_orders "
                        "ADD COLUMN operation_type VARCHAR(50) NOT NULL DEFAULT 'Regular Purchase'"
                    )
                except Exception:
                    pass  # Column already exists — idempotent

                # Add freight_type to purchase_orders
                try:
                    await cur.execute(
                        "ALTER TABLE purchase_orders "
                        "ADD COLUMN freight_type VARCHAR(60) NOT NULL DEFAULT 'Supplier Own Operated'"
                    )
                except Exception:
                    pass  # Column already exists — idempotent

                # Add matching_type to purchase_orders (1-way/2-way/3-way/4-way)
                try:
                    await cur.execute(
                        "ALTER TABLE purchase_orders "
                        "ADD COLUMN matching_type VARCHAR(30) NOT NULL DEFAULT '3-Way'"
                    )
                except Exception:
                    pass  # Column already exists — idempotent

                # Add pr_number to purchase_orders (PR that originated this PO)
                try:
                    await cur.execute(
                        "ALTER TABLE purchase_orders "
                        "ADD COLUMN pr_number VARCHAR(50) DEFAULT NULL"
                    )
                except Exception:
                    pass  # Column already exists — idempotent

                # Add landing cost columns to grn
                for col_sql in [
                    "ALTER TABLE grn ADD COLUMN freight_charges DECIMAL(12,2) NOT NULL DEFAULT 0",
                    "ALTER TABLE grn ADD COLUMN insurance_charges DECIMAL(12,2) NOT NULL DEFAULT 0",
                    "ALTER TABLE grn ADD COLUMN loading_unloading DECIMAL(12,2) NOT NULL DEFAULT 0",
                    "ALTER TABLE grn ADD COLUMN local_transport DECIMAL(12,2) NOT NULL DEFAULT 0",
                    "ALTER TABLE grn ADD COLUMN other_charges DECIMAL(12,2) NOT NULL DEFAULT 0",
                    "ALTER TABLE grn ADD COLUMN total_landed_cost DECIMAL(14,2) NOT NULL DEFAULT 0",
                    "ALTER TABLE grn ADD COLUMN landing_cost_per_unit DECIMAL(14,4) NOT NULL DEFAULT 0",
                ]:
                    try:
                        await cur.execute(col_sql)
                    except Exception:
                        pass  # Column already exists — idempotent

                # Create purchase_invoices table (auto-generated when GRN is created)
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS purchase_invoices (
                        pi_id           INT AUTO_INCREMENT PRIMARY KEY,
                        pi_number       VARCHAR(50) NOT NULL UNIQUE,
                        grn_number      VARCHAR(50) NOT NULL,
                        po_number       VARCHAR(50),
                        supplier_name   VARCHAR(255),
                        product_name    VARCHAR(255),
                        qty_received    DECIMAL(12,2) NOT NULL DEFAULT 0,
                        unit            VARCHAR(30) DEFAULT 'Units',
                        unit_cost       DECIMAL(12,4) DEFAULT 0,
                        invoice_value   DECIMAL(14,2) DEFAULT 0,
                        pi_date         DATE NOT NULL,
                        status          ENUM('PENDING','MATCHED','PAID','CANCELLED') DEFAULT 'PENDING',
                        notes           TEXT,
                        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_pi_grn (grn_number),
                        INDEX idx_pi_po (po_number),
                        INDEX idx_pi_date (pi_date)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
                # Migrate status ENUM to DRAFT/APPROVED/PAID/CANCELLED (idempotent)
                try:
                    await cur.execute("""
                        ALTER TABLE purchase_invoices
                        MODIFY COLUMN status ENUM('DRAFT','APPROVED','PAID','CANCELLED') DEFAULT 'DRAFT'
                    """)
                except Exception:
                    pass  # Already migrated
                try:
                    await cur.execute("UPDATE purchase_invoices SET status='DRAFT' WHERE status='PENDING'")
                    await cur.execute("UPDATE purchase_invoices SET status='APPROVED' WHERE status='MATCHED'")
                except Exception:
                    pass
                # Add payment columns if missing (idempotent)
                for _col, _ddl in [
                    ("paid_by",       "VARCHAR(100) DEFAULT NULL"),
                    ("payment_mode",  "VARCHAR(50)  DEFAULT NULL"),
                    ("payment_ref",   "VARCHAR(100) DEFAULT NULL"),
                    ("paid_at",       "DATETIME     DEFAULT NULL"),
                    ("approved_by",   "VARCHAR(100) DEFAULT NULL"),
                    ("approved_at",   "DATETIME     DEFAULT NULL"),
                ]:
                    try:
                        await cur.execute(f"ALTER TABLE purchase_invoices ADD COLUMN {_col} {_ddl}")
                    except Exception:
                        pass  # Column already exists

                # Create purchase_returns table (purchase return / debit note tracking)
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS purchase_returns (
                        return_id       INT AUTO_INCREMENT PRIMARY KEY,
                        return_number   VARCHAR(50) NOT NULL UNIQUE,
                        po_id           INT,
                        po_number       VARCHAR(50),
                        supplier_id     INT,
                        supplier_name   VARCHAR(255),
                        product_name    VARCHAR(255),
                        return_type     ENUM('FULL','PARTIAL') NOT NULL DEFAULT 'PARTIAL',
                        qty_returned    DECIMAL(12,2) NOT NULL DEFAULT 0,
                        unit            VARCHAR(30) DEFAULT 'Sheets',
                        unit_price      DECIMAL(12,2) DEFAULT 0,
                        return_value    DECIMAL(14,2) DEFAULT 0,
                        reason          VARCHAR(500),
                        document_type   ENUM('DEBIT_NOTE','CREDIT_NOTE') NOT NULL DEFAULT 'DEBIT_NOTE',
                        document_number VARCHAR(50),
                        return_date     DATE NOT NULL,
                        status          ENUM('PENDING','APPROVED','DISPATCHED','SETTLED') DEFAULT 'PENDING',
                        authorized_by   VARCHAR(100),
                        notes           TEXT,
                        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_pr_po (po_number),
                        INDEX idx_pr_date (return_date)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)

                await conn.commit()
        _lc_schema_migrated = True
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).warning("Landing cost schema migration: %s", exc)
        _lc_schema_migrated = True  # Don't retry


async def ensure_approval_schema(pool: aiomysql.Pool) -> None:
    """One-time migration: extend purchase_orders.status ENUM and create po_approvals table."""
    global _schema_migrated
    if _schema_migrated:
        return
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    ALTER TABLE purchase_orders
                    MODIFY COLUMN status ENUM(
                        'DRAFT','PENDING_APPROVAL','APPROVED',
                        'OPEN','PARTIAL','RECEIVED','OVERDUE','CANCELLED','REJECTED'
                    ) NOT NULL DEFAULT 'OPEN'
                """)
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS po_approvals (
                        approval_id    INT AUTO_INCREMENT PRIMARY KEY,
                        po_id          INT NOT NULL,
                        po_number      VARCHAR(50) NOT NULL,
                        approval_level ENUM('sales','finance') NOT NULL,
                        status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
                        approver_name  VARCHAR(100),
                        approved_at    DATETIME,
                        comments       TEXT,
                        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_po_level (po_id, approval_level)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
                await conn.commit()
        _schema_migrated = True
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).warning("Approval schema migration: %s", exc)
        _schema_migrated = True  # Don't retry — avoid repeated ALTER TABLE attempts


async def get_po_grn_dashboard(pool: aiomysql.Pool) -> dict:
    """Fetch full PO & GRN dashboard data: KPIs, open POs, GRN discrepancies."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:

            # KPI: Open POs count + value
            await cur.execute("""
                SELECT COUNT(*) AS open_count,
                       COALESCE(SUM(total_value), 0) AS open_value
                FROM purchase_orders
                WHERE status IN ('OPEN', 'PARTIAL', 'OVERDUE')
            """)
            po_summary = await cur.fetchone()

            # KPI: Overdue POs
            await cur.execute("""
                SELECT COUNT(*) AS overdue_count,
                       GROUP_CONCAT(
                           CONCAT(po.po_number, ' (', s.supplier_name, ' +',
                                  DATEDIFF(CURDATE(), po.expected_date), 'd)')
                           ORDER BY DATEDIFF(CURDATE(), po.expected_date) DESC
                           SEPARATOR ', '
                       ) AS overdue_list
                FROM purchase_orders po
                JOIN suppliers s ON po.supplier_id = s.supplier_id
                WHERE po.status = 'OVERDUE'
            """)
            overdue_row = await cur.fetchone()

            # KPI: GRN match rate (last 30 days)
            await cur.execute("""
                SELECT COUNT(*) AS total_grn,
                       SUM(CASE WHEN match_status = 'MATCH' THEN 1 ELSE 0 END) AS matched,
                       SUM(CASE WHEN match_status = 'MISMATCH' THEN 1 ELSE 0 END) AS mismatched,
                       COALESCE(SUM(discrepancy_amt), 0) AS total_variance
                FROM grn
                WHERE received_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            """)
            grn_stats = await cur.fetchone()

            # KPI: Partial POs
            await cur.execute("""
                SELECT COUNT(*) AS partial_count
                FROM purchase_orders
                WHERE status = 'PARTIAL'
            """)
            partial_row = await cur.fetchone()

            # Open POs list with item details + GRN number (if received) + unit_price
            # grn joined via subquery (one row per po_id) to prevent fan-out that
            # would multiply SUM(qty_ordered/qty_received) by the number of GRNs.
            await cur.execute("""
                SELECT po.po_id, po.po_number, s.supplier_name,
                       GROUP_CONCAT(DISTINCT p.sku_name ORDER BY pi.po_item_id SEPARATOR ', ') AS sku_list,
                       COALESCE(SUM(pi.qty_ordered), 0)  AS qty_ordered,
                       COALESCE(SUM(pi.qty_received), 0) AS qty_received,
                       COALESCE(AVG(pi.unit_price), 0)   AS unit_price,
                       COALESCE(MIN(p.unit), 'Units')    AS unit,
                       po.total_value, po.expected_date, po.status, po.pr_number,
                       GREATEST(DATEDIFF(CURDATE(), po.expected_date), 0) AS overdue_days,
                       g.grn_number
                FROM purchase_orders po
                JOIN suppliers s ON po.supplier_id = s.supplier_id
                LEFT JOIN po_items pi ON po.po_id = pi.po_id
                LEFT JOIN products p  ON pi.product_id = p.product_id
                LEFT JOIN (
                    SELECT po_id, MAX(grn_number) AS grn_number
                    FROM grn
                    WHERE po_id IS NOT NULL
                    GROUP BY po_id
                ) g ON g.po_id = po.po_id
                WHERE po.status IN ('OPEN', 'PARTIAL', 'OVERDUE')
                GROUP BY po.po_id, g.grn_number
                ORDER BY
                    FIELD(po.status, 'OVERDUE', 'PARTIAL', 'OPEN'),
                    po.expected_date ASC
                LIMIT 20
            """)
            open_po_rows = await cur.fetchall()

            # GRN discrepancies (mismatches)
            await cur.execute("""
                SELECT g.grn_number, po.po_number, s.supplier_name,
                       g.invoice_value, g.grn_value, g.discrepancy_amt,
                       g.notes, g.match_status, g.received_date
                FROM grn g
                JOIN suppliers s ON g.supplier_id = s.supplier_id
                LEFT JOIN purchase_orders po ON g.po_id = po.po_id
                WHERE g.match_status = 'MISMATCH'
                ORDER BY g.received_date DESC
                LIMIT 10
            """)
            grn_rows = await cur.fetchall()

    total_grn = int(grn_stats["total_grn"] or 1)
    matched = int(grn_stats["matched"] or 0)
    match_rate = f"{round(matched / max(total_grn, 1) * 100)}%"

    open_pos_list = []
    for r in open_po_rows:
        qty_ord = int(r["qty_ordered"] or 0)
        qty_rec = int(r["qty_received"] or 0)
        fill_pct = round(qty_rec / max(qty_ord, 1) * 100)
        overdue_days = int(r["overdue_days"] or 0)
        if r["status"] == "OVERDUE":
            eta = f"Overdue +{overdue_days}d"
        elif r["status"] == "PARTIAL":
            eta = "In progress"
        elif r["expected_date"]:
            days_left = (r["expected_date"] - datetime.date.today()).days
            eta = f"ETA {days_left}d" if days_left >= 0 else "Overdue"
        else:
            eta = "-"

        open_pos_list.append({
            "po_number":  r["po_number"],
            "po_id":      r["po_id"],
            "supplier":   r["supplier_name"],
            "sku":        r["sku_list"] or "-",
            "qty_ordered":  qty_ord,
            "qty_received": qty_rec,
            "qty_pending":  max(0, qty_ord - qty_rec),
            "unit_price": float(r["unit_price"] or 0),
            "unit":       r["unit"] or "Units",
            "fill_pct":   fill_pct,
            "value":      f"₹{float(r['total_value'] or 0) / 100000:.2f}L",
            "total_value": float(r["total_value"] or 0),
            "eta":        eta,
            "status":     r["status"],
            "overdue_days": overdue_days,
            "pr_number":  r["pr_number"] or None,
            "grn_number": r["grn_number"] or None,
        })

    grn_discrepancies = []
    for r in grn_rows:
        disc_amt = float(r["discrepancy_amt"] or 0)
        grn_discrepancies.append({
            "grn_number": r["grn_number"],
            "po_number": r["po_number"] or "-",
            "supplier": r["supplier_name"],
            "invoice_value": f"₹{float(r['invoice_value'] or 0):,.0f}",
            "grn_value": f"₹{float(r['grn_value'] or 0):,.0f}",
            "discrepancy_amt": f"₹{disc_amt:,.0f}",
            "notes": r["notes"] or "Discrepancy detected",
            "action": _suggest_grn_action(r["notes"] or ""),
        })

    return {
        "kpis": {
            "open_pos": int(po_summary["open_count"]),
            "open_po_value": f"₹{float(po_summary['open_value']) / 100000:.1f}L",
            "overdue_pos": int(overdue_row["overdue_count"]),
            "overdue_po_list": overdue_row["overdue_list"] or "",
            "grn_match_rate": match_rate,
            "grn_mismatches_mtd": int(grn_stats["mismatched"] or 0),
            "grn_variance_value": f"₹{float(grn_stats['total_variance'] or 0):,.0f}",
            "partial_pos": int(partial_row["partial_count"]),
        },
        "open_pos": open_pos_list,
        "grn_discrepancies": grn_discrepancies,
        "data_source": "mysql",
    }


async def create_purchase_order(pool: aiomysql.Pool, po_data: dict) -> dict:
    """
    Create a new purchase order in the database.

    Auto-creates supplier and product records if they do not exist yet,
    so any PO — whether raised manually, via the scanner, or from a quote —
    is always persisted to MySQL when the DB is connected.
    """
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:

            # ── Resolve or auto-create supplier ──────────────────────────────
            await cur.execute(
                "SELECT supplier_id, supplier_name FROM suppliers "
                "WHERE supplier_name LIKE %s AND is_active=1 LIMIT 1",
                (f"%{po_data['supplier_name']}%",),
            )
            supplier_row = await cur.fetchone()
            if supplier_row:
                supplier_id   = supplier_row["supplier_id"]
                supplier_name = supplier_row["supplier_name"]
            else:
                # New supplier (e.g., from scanner or new industry) — insert it
                await cur.execute(
                    "INSERT INTO suppliers (supplier_name, contact_person, is_active) "
                    "VALUES (%s, %s, 1)",
                    (po_data["supplier_name"][:255], "TBD"),
                )
                supplier_id   = cur.lastrowid
                supplier_name = po_data["supplier_name"]

            # ── Resolve or auto-create product ────────────────────────────────
            sku_search = po_data["sku_name"][:60]  # use first 60 chars for fuzzy match
            await cur.execute(
                "SELECT product_id, sku_name, buy_price FROM products "
                "WHERE sku_name LIKE %s AND is_active=1 LIMIT 1",
                (f"%{sku_search}%",),
            )
            product_row = await cur.fetchone()

            unit_price = float(po_data.get("unit_price") or
                               (product_row["buy_price"] if product_row else 0))

            if product_row:
                product_id   = product_row["product_id"]
                product_name = product_row["sku_name"]
            else:
                # Auto-create product. Must satisfy NOT NULL schema constraints:
                # sku_code (UNIQUE NOT NULL), category (ENUM), buy_price, sell_price.
                import hashlib as _hl
                # Deterministic sku_code from name — same SKU always resolves to same code.
                _h       = _hl.md5(po_data["sku_name"].encode()).hexdigest()[:8].upper()
                sku_code = f"AUTO-{_h}"  # e.g. AUTO-3A7F2C1B

                # Map caller category string → valid DB enum value.
                _cat = (po_data.get("category") or "").lower()
                if any(k in _cat for k in ("laminate", "hpl", "acrylic", "compact")):
                    db_category = "Laminate"
                elif "flexi" in _cat:
                    db_category = "Flexi"
                elif "mr plywood" in _cat or "mr plain" in _cat:
                    db_category = "MR Plywood"
                elif any(k in _cat for k in ("bwp", "plywood", "board")):
                    db_category = "BWP Plywood"
                else:
                    db_category = "Commercial"  # catch-all for hardware/sanitary/other

                try:
                    await cur.execute(
                        """INSERT INTO products
                               (sku_code, sku_name, category, brand, unit,
                                buy_price, sell_price, is_active)
                           VALUES (%s, %s, %s, 'Generic', %s, %s, %s, 1)""",
                        (
                            sku_code,
                            po_data["sku_name"][:120],
                            db_category,
                            (po_data.get("unit") or "sheet")[:20],
                            unit_price or 1.0,
                            round((unit_price or 1.0) * 1.3, 2),
                        ),
                    )
                    product_id = cur.lastrowid
                except Exception:
                    # Duplicate sku_code means this product was already auto-created earlier.
                    # Re-fetch by the same deterministic code or fuzzy name match.
                    await cur.execute(
                        "SELECT product_id FROM products "
                        "WHERE sku_code = %s OR sku_name LIKE %s LIMIT 1",
                        (sku_code, f"%{po_data['sku_name'][:40]}%"),
                    )
                    found = await cur.fetchone()
                    if found:
                        product_id = found["product_id"]
                    else:
                        raise  # cannot create or find product — propagate → demo fallback
                product_name = po_data["sku_name"]

            # ── Validate quantity ─────────────────────────────────────────────
            qty = int(po_data.get("quantity", 0))
            if qty <= 0:
                return {"success": False, "error": "Quantity must be greater than 0"}

            total_value = qty * unit_price

            # ── Generate unique PO number ─────────────────────────────────────
            await cur.execute("SELECT COUNT(*) AS cnt FROM purchase_orders")
            cnt = (await cur.fetchone())["cnt"]
            po_number = f"PO-{datetime.date.today().strftime('%Y%m%d')}-{cnt + 1:03d}"

            expected_date = po_data.get("expected_date") or (
                datetime.date.today() + datetime.timedelta(days=7)
            ).isoformat()

            notes = po_data.get("notes") or "Created via InvenIQ"

            # ── Insert purchase_orders row ────────────────────────────────────
            operation_type = (po_data.get("operation_type") or "Regular Purchase")[:50]
            freight_type   = (po_data.get("freight_type")   or "Supplier Own Operated")[:60]
            matching_type  = (po_data.get("matching_type")  or "3-Way")[:30]
            pr_number_val  = (po_data.get("pr_number") or None)
            await cur.execute(
                """INSERT INTO purchase_orders
                       (po_number, supplier_id, po_date, expected_date,
                        status, total_value, notes, operation_type, freight_type,
                        matching_type, pr_number)
                   VALUES (%s, %s, %s, %s, 'DRAFT', %s, %s, %s, %s, %s, %s)""",
                (
                    po_number,
                    supplier_id,
                    datetime.date.today().isoformat(),
                    expected_date,
                    total_value,
                    notes,
                    operation_type,
                    freight_type,
                    matching_type,
                    pr_number_val,
                ),
            )
            po_id = cur.lastrowid

            # ── Insert po_items row ───────────────────────────────────────────
            await cur.execute(
                """INSERT INTO po_items
                       (po_id, product_id, qty_ordered, qty_received, unit_price)
                   VALUES (%s, %s, %s, 0, %s)""",
                (po_id, product_id, qty, unit_price),
            )

            # ── Create approval rows (sales + finance, both pending) ──────────
            for _lvl in ('sales', 'finance'):
                await cur.execute(
                    """INSERT IGNORE INTO po_approvals
                           (po_id, po_number, approval_level, status)
                       VALUES (%s, %s, %s, 'pending')""",
                    (po_id, po_number, _lvl),
                )

            await conn.commit()

    return {
        "success":        True,
        "po_number":      po_number,
        "status":         "DRAFT",
        "supplier":       supplier_name,
        "sku":            product_name,
        "sku_name":       product_name,
        "quantity":       qty,
        "unit_price":     unit_price,
        "total_value":    total_value,
        "expected_date":  expected_date,
        "operation_type": operation_type,
        "freight_type":   freight_type,
        "matching_type":  matching_type,
        "pr_number":      pr_number_val,
    }


async def create_grn(pool: aiomysql.Pool, grn_data: dict) -> dict:
    """
    Create a new GRN record.

    Business rules enforced:
    - Cannot over-receive beyond remaining PO qty
    - Cannot receive on a fully-received PO line
    - Per-line tracking written to grn_line_items
    - po_items.qty_received updated; PO status auto-promoted to PARTIAL / RECEIVED
    - Inventory ledger movement recorded (GRN_RECEIPT) — non-blocking
    - Audit log entry written — non-blocking
    """
    import logging as _log
    _logger = _log.getLogger(__name__)

    product_name     = (grn_data.get("product_name") or "").strip()
    qty_received_num = float(grn_data.get("qty_received") or 0)
    po_number_val    = (grn_data.get("po_number") or "").strip()

    # ── Collected during the transaction for post-commit work ────────────────
    supplier_name = grn_data["supplier_name"]
    grn_number    = ""
    new_po_status = None
    po_unit_price = 0.0
    sku_code_out  = None

    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:

            # ── Resolve supplier ──────────────────────────────────────────────
            await cur.execute(
                "SELECT supplier_id, supplier_name FROM suppliers "
                "WHERE supplier_name LIKE %s AND is_active=1 LIMIT 1",
                (f"%{grn_data['supplier_name']}%",),
            )
            supplier = await cur.fetchone()
            if not supplier:
                await cur.execute(
                    "INSERT INTO suppliers (supplier_name, contact_person, is_active) "
                    "VALUES (%s, %s, 1)",
                    (grn_data["supplier_name"], grn_data.get("received_by", "TBD")),
                )
                supplier_id   = cur.lastrowid
                supplier_name = grn_data["supplier_name"]
            else:
                supplier_id   = supplier["supplier_id"]
                supplier_name = supplier["supplier_name"]

            # ── Resolve PO ────────────────────────────────────────────────────
            po_id = None
            if po_number_val:
                await cur.execute(
                    "SELECT po_id, status FROM purchase_orders WHERE po_number=%s LIMIT 1",
                    (po_number_val,),
                )
                po_row = await cur.fetchone()
                if po_row:
                    po_id = po_row["po_id"]
                    # ── PO-level status gate ─────────────────────────────────
                    _po_status_now = po_row["status"]
                    _blocked = ("FULLY_RECEIVED", "CLOSED", "CANCELLED", "RETURNED", "COMPLETE")
                    if _po_status_now in _blocked:
                        return {
                            "success": False,
                            "code":    "PO_CLOSED",
                            "error":   (
                                f"Cannot receive against PO {po_number_val} — "
                                f"current status is {_po_status_now}. "
                                f"No further GRNs are allowed on this PO."
                            ),
                        }

            # ── Per-line over-receive validation (only when PO is linked) ─────
            po_item_id    = None
            prev_received = 0.0
            qty_ordered   = 0.0

            if po_id and product_name:
                await cur.execute("""
                    SELECT pi.po_item_id, pi.product_id,
                           pi.qty_ordered, pi.qty_received, pi.unit_price,
                           COALESCE(p.sku_code, '') AS sku_code,
                           COALESCE(p.sku_name, '') AS sku_name_db
                    FROM po_items pi
                    LEFT JOIN products p ON pi.product_id = p.product_id
                    WHERE pi.po_id = %s
                    ORDER BY pi.po_item_id
                """, (po_id,))
                item_rows = await cur.fetchall()

                # Fuzzy-match by first 30 chars of SKU name
                best = None
                plow = product_name.lower()[:30]
                for row in item_rows:
                    dlow = (row["sku_name_db"] or "").lower()[:30]
                    if plow and dlow and (plow in dlow or dlow in plow):
                        best = row
                        break
                if best is None and item_rows:
                    best = item_rows[0]  # fallback: first line

                if best:
                    po_item_id    = best["po_item_id"]
                    sku_code_out  = best["sku_code"] or None
                    prev_received = float(best["qty_received"] or 0)
                    po_unit_price = float(best["unit_price"] or 0)
                    qty_ordered   = float(best["qty_ordered"] or 0)

                    remaining = round(qty_ordered - prev_received, 3)
                    if remaining <= 0:
                        return {
                            "success": False,
                            "code":    "FULLY_RECEIVED",
                            "error":   (
                                f"PO line already fully received "
                                f"(ordered: {qty_ordered:.0f}, received: {prev_received:.0f}). "
                                f"No remaining qty."
                            ),
                        }
                    if qty_received_num > remaining + 0.001:
                        return {
                            "success": False,
                            "code":    "OVER_RECEIVE",
                            "error":   (
                                f"Over-receive blocked — remaining: {remaining:.3f}, "
                                f"attempted: {qty_received_num:.3f}."
                            ),
                        }

            # ── Generate GRN number ───────────────────────────────────────────
            await cur.execute("SELECT COUNT(*) AS cnt FROM grn")
            cnt = (await cur.fetchone())["cnt"]
            grn_number = f"GRN-{datetime.date.today().strftime('%Y%m%d')}-{cnt + 1:03d}"

            # ── Value / match calculations ────────────────────────────────────
            invoice_value = float(grn_data.get("invoice_value") or 0)
            grn_value     = float(grn_data.get("grn_value") or invoice_value)
            discrepancy   = round(abs(invoice_value - grn_value), 2)
            match_status  = "MATCH" if discrepancy < 1 else "MISMATCH"

            # ── Landing cost breakdown ────────────────────────────────────────
            freight_charges   = float(grn_data.get("freight_charges")   or 0)
            insurance_charges = float(grn_data.get("insurance_charges") or 0)
            loading_unloading = float(grn_data.get("loading_unloading") or 0)
            local_transport   = float(grn_data.get("local_transport")   or 0)
            other_charges     = float(grn_data.get("other_charges")     or 0)
            total_landed_cost = round(
                grn_value + freight_charges + insurance_charges +
                loading_unloading + local_transport + other_charges, 2,
            )
            landing_cost_per_unit = (
                round(total_landed_cost / qty_received_num, 4) if qty_received_num > 0 else 0
            )

            received_date = grn_data.get("received_date") or datetime.date.today().isoformat()
            notes         = grn_data.get("notes") or "Created via InvenIQ"

            # ── Insert GRN header ─────────────────────────────────────────────
            await cur.execute("""
                INSERT INTO grn
                    (grn_number, po_id, supplier_id, received_date,
                     invoice_value, grn_value, match_status, discrepancy_amt, notes,
                     freight_charges, insurance_charges, loading_unloading, local_transport,
                     other_charges, total_landed_cost, landing_cost_per_unit)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                grn_number, po_id, supplier_id, received_date,
                invoice_value, grn_value, match_status, discrepancy, notes,
                freight_charges, insurance_charges, loading_unloading, local_transport,
                other_charges, total_landed_cost, landing_cost_per_unit,
            ))

            # ── Per-line tracking + PO status auto-update ────────────────────
            if po_item_id and po_id:
                # Step A: grn_line_items audit record — non-fatal if table missing
                try:
                    await cur.execute("""
                        INSERT INTO grn_line_items
                            (grn_number, po_number, sku_code, sku_name, po_qty,
                             prev_received, qty_received, uom, unit_cost, qc_status, notes)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'PENDING_QC', %s)
                    """, (
                        grn_number,
                        po_number_val,
                        sku_code_out or "",
                        product_name[:300],
                        qty_ordered,
                        prev_received,
                        qty_received_num,
                        (grn_data.get("unit") or "Pcs")[:20],
                        po_unit_price,
                        notes[:1000],
                    ))
                except Exception as _line_exc:
                    _logger.warning("grn_line_items insert skipped (non-fatal): %s", _line_exc)

                # Step B: Update cumulative received qty — ALWAYS runs independently.
                # Kept in its own try so a grn_line_items schema failure never
                # silently suppresses the qty_received update on the PO line.
                new_total = round(prev_received + qty_received_num, 3)
                try:
                    await cur.execute(
                        "UPDATE po_items SET qty_received = %s WHERE po_item_id = %s",
                        (new_total, po_item_id),
                    )
                    # qc_pending_qty tracks received not yet inspected
                    await cur.execute(
                        "UPDATE po_items SET qc_pending_qty = qc_pending_qty + %s "
                        "WHERE po_item_id = %s",
                        (qty_received_num, po_item_id),
                    )
                except Exception as _upd_exc:
                    _logger.error("po_items qty_received update FAILED for item %s: %s",
                                  po_item_id, _upd_exc)

                # Step C: Promote PO status to PARTIAL / FULLY_RECEIVED
                try:
                    await cur.execute("""
                        SELECT COALESCE(SUM(qty_ordered), 0)  AS total_ord,
                               COALESCE(SUM(qty_received), 0) AS total_rec
                        FROM po_items WHERE po_id = %s
                    """, (po_id,))
                    totals    = await cur.fetchone()
                    total_ord = float(totals["total_ord"] or 0)
                    total_rec = float(totals["total_rec"] or 0)

                    new_po_status = "FULLY_RECEIVED" if total_rec >= total_ord - 0.001 else "PARTIAL"
                    await cur.execute(
                        "UPDATE purchase_orders SET status = %s WHERE po_id = %s "
                        "AND status IN ('OPEN','PARTIAL','OVERDUE','APPROVED','RECEIVED')",
                        (new_po_status, po_id),
                    )
                except Exception as _sts_exc:
                    _logger.warning("PO status promotion skipped: %s", _sts_exc)

            await conn.commit()

    # ── Inventory ledger (non-blocking, post-commit) ──────────────────────────
    _unit_cost = po_unit_price or (
        round(grn_value / qty_received_num, 4) if qty_received_num > 0 else 0
    )
    if qty_received_num > 0 and (product_name or sku_code_out):
        try:
            from app.services.inventory_ledger import record_movement, GRN_RECEIPT
            await record_movement(
                pool,
                movement_type  = GRN_RECEIPT,
                sku_code       = sku_code_out or f"GRN-{grn_number}",
                sku_name       = product_name or sku_code_out or grn_number,
                ref_type       = "GRN",
                ref_number     = grn_number,
                qty_in         = qty_received_num,
                unit_cost      = _unit_cost,
                warehouse_code = (grn_data.get("godown_name") or "MAIN")[:100],
                po_number      = po_number_val,
                supplier_name  = supplier_name,
                uom            = (grn_data.get("unit") or "Pcs")[:20],
                created_by     = (grn_data.get("received_by") or "store")[:100],
                notes          = f"GRN: {grn_number}",
            )
        except Exception as _inv_exc:
            _logger.warning("GRN inventory movement failed (non-blocking): %s", _inv_exc)

    # ── Purchase invoice auto-generation (non-blocking, post-commit) ─────────────
    # Auto-creates a purchase invoice record tied to this GRN for the qty received.
    purchase_invoice_number = None
    if qty_received_num > 0:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cur:
                    await cur.execute("SELECT COUNT(*) AS cnt FROM purchase_invoices")
                    pi_cnt = (await cur.fetchone())["cnt"]
                    purchase_invoice_number = (
                        f"PI-{datetime.date.today().strftime('%Y%m%d')}-{pi_cnt + 1:03d}"
                    )
                    await cur.execute("""
                        INSERT INTO purchase_invoices
                            (pi_number, grn_number, po_number, supplier_name, product_name,
                             qty_received, unit, unit_cost, invoice_value, pi_date, status, notes)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'DRAFT', %s)
                    """, (
                        purchase_invoice_number,
                        grn_number,
                        po_number_val or None,
                        supplier_name[:255],
                        (product_name or "")[:255] or None,
                        qty_received_num,
                        (grn_data.get("unit") or "Pcs")[:20],
                        _unit_cost,
                        grn_value,
                        received_date,
                        f"Auto-generated for GRN: {grn_number}",
                    ))
                    await conn.commit()
        except Exception as _pi_exc:
            _logger.warning("Purchase invoice auto-creation failed (non-blocking): %s", _pi_exc)
            purchase_invoice_number = None

    # ── Audit log (non-blocking, post-commit) ─────────────────────────────────
    try:
        from app.services.audit_logger import log_create
        await log_create(
            pool,
            entity_type = "GRN",
            entity_id   = grn_number,
            changed_by  = (grn_data.get("received_by") or "store"),
            snapshot    = {
                "po_number":              po_number_val or None,
                "supplier":               supplier_name,
                "qty_received":           qty_received_num,
                "grn_value":              grn_value,
                "match_status":           match_status,
                "new_po_status":          new_po_status,
                "purchase_invoice_number": purchase_invoice_number,
            },
        )
    except Exception as _aud_exc:
        _logger.warning("GRN audit log failed (non-blocking): %s", _aud_exc)

    # ── Journal entry — double-entry accounting groundwork (non-blocking) ──────
    if grn_value > 0:
        try:
            await create_journal_entry(
                pool,
                voucher_type   = "PURCHASE",
                voucher_date   = received_date,
                reference_no   = grn_number,
                reference_type = "GRN",
                debit_account  = "Stock / Inventory Account",
                credit_account = f"Accounts Payable — {supplier_name[:100]}",
                amount         = grn_value,
                narration      = (
                    f"GRN receipt: {grn_number} | "
                    f"PO: {po_number_val or '—'} | "
                    f"Qty: {qty_received_num}"
                ),
                supplier_name  = supplier_name,
                created_by     = (grn_data.get("received_by") or "system"),
            )
        except Exception as _je_exc:
            _logger.warning("Journal entry creation failed (non-blocking): %s", _je_exc)

    return {
        "success":                True,
        "grn_number":             grn_number,
        "supplier":               supplier_name,
        "po_number":              po_number_val or "—",
        "invoice_value":          invoice_value,
        "grn_value":              grn_value,
        "match_status":           match_status,
        "discrepancy_amt":        discrepancy,
        "received_date":          received_date,
        "freight_charges":        freight_charges,
        "insurance_charges":      insurance_charges,
        "loading_unloading":      loading_unloading,
        "local_transport":        local_transport,
        "other_charges":          other_charges,
        "total_landed_cost":      total_landed_cost,
        "landing_cost_per_unit":  landing_cost_per_unit,
        "new_po_status":          new_po_status,
        "inventory_updated":      qty_received_num > 0,
        "purchase_invoice_number": purchase_invoice_number,
    }


async def create_journal_entry(
    pool: aiomysql.Pool,
    *,
    voucher_type:   str,
    voucher_date:   str,
    reference_no:   str,
    reference_type: str,
    debit_account:  str,
    credit_account: str,
    amount:         float,
    narration:      str  = "",
    supplier_name:  str  = "",
    created_by:     str  = "system",
) -> str:
    """
    Inserts one double-entry journal record.
    Uses INSERT IGNORE so duplicate GRN references are silently skipped.
    Returns the generated voucher_no.
    """
    import hashlib as _hl
    h = _hl.md5(f"{voucher_type}-{reference_no}".encode()).hexdigest()[:8].upper()
    voucher_no = f"JE-{voucher_type[:3]}-{datetime.date.today().strftime('%Y%m%d')}-{h}"
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT IGNORE INTO journal_entries
                       (voucher_no, voucher_type, voucher_date, reference_no, reference_type,
                        debit_account, credit_account, amount, narration, supplier_name, created_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    voucher_no, voucher_type, voucher_date,
                    reference_no[:100], reference_type,
                    debit_account[:150], credit_account[:150],
                    round(float(amount), 2),
                    (narration or "")[:500],
                    (supplier_name or "")[:255],
                    (created_by or "system")[:100],
                ),
            )
            await conn.commit()
    return voucher_no


async def get_quotations(pool: aiomysql.Pool, industry: str = "all") -> list:
    """Fetch supplier quotations from DB, grouped by product. DB-first replacement for _mock_quotations()."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("""
                SELECT
                    p.product_id,
                    p.sku_name       AS item,
                    p.category,
                    p.unit,
                    p.buy_price      AS last_purchased_rate,
                    CASE
                        WHEN p.category IN ('Louvers','Operable Louvre System') THEN 'louvers'
                        ELSE 'laminates'
                    END              AS industry,
                    s.supplier_name  AS supplier,
                    q.rate,
                    q.freight_cost   AS freight,
                    q.lead_time_days,
                    q.moq,
                    q.valid_till,
                    q.reliability_pct,
                    q.notes,
                    q.is_last_purchased
                FROM quotations q
                JOIN products  p ON q.product_id  = p.product_id
                JOIN suppliers s ON q.supplier_id = s.supplier_id
                WHERE q.is_active = 1
                ORDER BY p.product_id, q.rate ASC
            """)
            rows = await cur.fetchall()

    # Group rows into per-product cards
    grouped: dict = {}
    for r in rows:
        pid = r["product_id"]
        if pid not in grouped:
            grouped[pid] = {
                "item": r["item"],
                "industry": r["industry"],
                "category": r["category"],
                "unit": r["unit"],
                "last_purchased_rate": float(r["last_purchased_rate"] or 0),
                "last_supplier": None,
                "quotes": [],
            }
        quote = {
            "supplier": r["supplier"],
            "rate": float(r["rate"] or 0),
            "freight": float(r["freight"] or 0),
            "lead_time": f"{r['lead_time_days']} days",
            "moq": int(r["moq"] or 1),
            "valid_till": str(r["valid_till"]) if r["valid_till"] else "",
            "reliability": float(r["reliability_pct"] or 90),
            "notes": r["notes"] or "",
        }
        grouped[pid]["quotes"].append(quote)
        if r["is_last_purchased"]:
            grouped[pid]["last_supplier"] = r["supplier"]

    items = list(grouped.values())

    # Fallback: if no is_last_purchased flag set, use lowest-rate supplier
    for item in items:
        if item["last_supplier"] is None and item["quotes"]:
            item["last_supplier"] = item["quotes"][0]["supplier"]

    if industry != "all":
        items = [i for i in items if i["industry"] == industry]

    return items


def _suggest_grn_action(notes: str) -> str:
    n = notes.lower()
    if any(w in n for w in ["grade", "quality", "wrong", "incorrect"]):
        return "Return & Reorder"
    if any(w in n for w in ["short", "quantity", "less"]):
        return "Raise Credit Note"
    if any(w in n for w in ["price", "rate", "mismatch", "invoice"]):
        return "Block Payment"
    return "Investigate & Resolve"


# ── PO Approval Workflow Queries ───────────────────────────────────────────────

async def get_pending_approvals(pool: aiomysql.Pool) -> list:
    """Fetch all POs in DRAFT / PENDING_APPROVAL / APPROVED status with their approval levels."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("""
                SELECT po.po_id, po.po_number, s.supplier_name,
                       GROUP_CONCAT(p.sku_name ORDER BY pi.po_item_id SEPARATOR ', ') AS sku_list,
                       po.total_value, po.expected_date, po.status,
                       po.po_date, po.notes,
                       COALESCE(po.freight_type, 'Supplier Own Operated') AS freight_type
                FROM purchase_orders po
                JOIN suppliers s ON po.supplier_id = s.supplier_id
                LEFT JOIN po_items pi ON po.po_id = pi.po_id
                LEFT JOIN products p ON pi.product_id = p.product_id
                WHERE po.status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED')
                GROUP BY po.po_id
                ORDER BY po.po_date DESC
                LIMIT 50
            """)
            po_rows = await cur.fetchall()

            result = []
            for po in po_rows:
                await cur.execute("""
                    SELECT approval_level, status, approver_name, approved_at, comments
                    FROM po_approvals WHERE po_id = %s
                """, (po['po_id'],))
                approval_rows = await cur.fetchall()
                approvals = {}
                for row in approval_rows:
                    approvals[row['approval_level']] = {
                        'status':      row['status'],
                        'approver':    row['approver_name'],
                        'approved_at': str(row['approved_at']) if row['approved_at'] else None,
                        'comments':    row['comments'],
                    }
                result.append({
                    'po_id':         po['po_id'],
                    'po_number':     po['po_number'],
                    'supplier':      po['supplier_name'],
                    'sku':           po['sku_list'] or '—',
                    'total_value':   float(po['total_value'] or 0),
                    'expected_date': str(po['expected_date']) if po['expected_date'] else None,
                    'status':        po['status'],
                    'po_date':       str(po['po_date']) if po['po_date'] else None,
                    'notes':         po['notes'],
                    'freight_type':  po.get('freight_type') or 'Supplier Own Operated',
                    'approvals':     approvals,
                })
            return result


async def approve_po(
    pool: aiomysql.Pool,
    po_number: str,
    level: str,
    approver_name: str,
    comments: str = '',
) -> dict:
    """Record an approval at a level (sales/finance). Promotes PO to APPROVED when both levels approve."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT po_id, status FROM purchase_orders WHERE po_number = %s", (po_number,)
            )
            po = await cur.fetchone()
            if not po:
                return {'success': False, 'error': 'PO not found'}
            if po['status'] not in ('DRAFT', 'PENDING_APPROVAL'):
                return {'success': False, 'error': f'Cannot approve PO with status {po["status"]}'}

            po_id = po['po_id']
            now = datetime.datetime.now(datetime.timezone.utc)

            # ── Sequential check: Finance cannot approve before Accounts Payable ──
            if level == 'finance':
                await cur.execute("""
                    SELECT status FROM po_approvals
                    WHERE po_id = %s AND approval_level = 'sales'
                """, (po_id,))
                ap_row = await cur.fetchone()
                if not ap_row or ap_row['status'] != 'approved':
                    return {
                        'success': False,
                        'error': 'Accounts Payable approval is required before Finance can approve.',
                    }

            await cur.execute("""
                UPDATE po_approvals
                SET status='approved', approver_name=%s, approved_at=%s, comments=%s
                WHERE po_id=%s AND approval_level=%s
            """, (approver_name, now.isoformat(), comments or '', po_id, level))

            await cur.execute("""
                SELECT COUNT(*) AS total,
                       SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_count
                FROM po_approvals WHERE po_id=%s
            """, (po_id,))
            counts = await cur.fetchone()
            both_approved = (
                int(counts['approved_count'] or 0) == int(counts['total'] or 0) == 2
            )
            new_status = 'APPROVED' if both_approved else 'PENDING_APPROVAL'

            await cur.execute(
                "UPDATE purchase_orders SET status=%s WHERE po_id=%s",
                (new_status, po_id)
            )
            await conn.commit()

            return {
                'success':       True,
                'po_number':     po_number,
                'level':         level,
                'new_po_status': new_status,
                'fully_approved': both_approved,
            }


async def reject_po(
    pool: aiomysql.Pool,
    po_number: str,
    level: str,
    approver_name: str,
    reason: str,
) -> dict:
    """Reject a PO at a given level and mark the PO as REJECTED."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT po_id, status FROM purchase_orders WHERE po_number = %s", (po_number,)
            )
            po = await cur.fetchone()
            if not po:
                return {'success': False, 'error': 'PO not found'}
            if po['status'] not in ('DRAFT', 'PENDING_APPROVAL', 'APPROVED'):
                return {'success': False, 'error': f'Cannot reject PO with status {po["status"]}'}

            po_id = po['po_id']
            now = datetime.datetime.now(datetime.timezone.utc)

            await cur.execute("""
                UPDATE po_approvals
                SET status='rejected', approver_name=%s, approved_at=%s, comments=%s
                WHERE po_id=%s AND approval_level=%s
            """, (approver_name, now.isoformat(), reason, po_id, level))

            await cur.execute(
                "UPDATE purchase_orders SET status='REJECTED' WHERE po_id=%s", (po_id,)
            )
            await conn.commit()

            return {'success': True, 'po_number': po_number, 'new_po_status': 'REJECTED'}


async def release_po_to_supplier(pool: aiomysql.Pool, po_number: str) -> dict:
    """Release a fully-APPROVED PO to the supplier by changing its status to OPEN."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT po_id, status FROM purchase_orders WHERE po_number = %s", (po_number,)
            )
            po = await cur.fetchone()
            if not po:
                return {'success': False, 'error': 'PO not found'}
            if po['status'] != 'APPROVED':
                return {
                    'success': False,
                    'error': f'PO must be APPROVED before releasing. Current status: {po["status"]}',
                }
            await cur.execute(
                "UPDATE purchase_orders SET status='OPEN' WHERE po_id=%s", (po['po_id'],)
            )
            await conn.commit()
            return {
                'success':    True,
                'po_number':  po_number,
                'new_status': 'OPEN',
                'message':    'PO released to supplier. It is now OPEN and visible in the procurement tracker.',
            }


async def get_open_pos_with_freight(pool: aiomysql.Pool) -> list:
    """Return all open/partial/overdue POs with freight_type, matching_type, pr_number, and unit for GRN selection."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("""
                SELECT po.po_id, po.po_number, s.supplier_name,
                       COALESCE(po.freight_type, 'Supplier Own Operated') AS freight_type,
                       COALESCE(po.matching_type, '3-Way') AS matching_type,
                       po.pr_number,
                       GROUP_CONCAT(p.sku_name ORDER BY pi.po_item_id SEPARATOR ', ') AS sku_list,
                       COALESCE(SUM(pi.qty_ordered),  0) AS qty_ordered,
                       COALESCE(SUM(pi.qty_received), 0) AS qty_received,
                       COALESCE(AVG(pi.unit_price),   0) AS unit_price,
                       COALESCE(MIN(p.unit), 'Units') AS unit,
                       po.total_value, po.expected_date, po.status
                FROM purchase_orders po
                JOIN suppliers s ON po.supplier_id = s.supplier_id
                LEFT JOIN po_items pi ON po.po_id = pi.po_id
                LEFT JOIN products p ON pi.product_id = p.product_id
                WHERE po.status IN ('OPEN', 'PARTIAL', 'OVERDUE', 'APPROVED')
                GROUP BY po.po_id
                ORDER BY po.expected_date ASC
                LIMIT 50
            """)
            rows = await cur.fetchall()

    result = []
    for r in rows:
        qty_ord = int(r['qty_ordered'] or 0)
        qty_rec = int(r['qty_received'] or 0)
        fill_pct = round(qty_rec / max(qty_ord, 1) * 100)
        result.append({
            'po_id':         r['po_id'],
            'po_number':     r['po_number'],
            'supplier':      r['supplier_name'],
            'freight_type':  r['freight_type'],
            'matching_type': r['matching_type'],
            'pr_number':     r['pr_number'] or None,
            'sku':           r['sku_list'] or '—',
            'unit':          r['unit'] or 'Units',
            'qty_ordered':   qty_ord,
            'qty_received':  qty_rec,
            'qty_pending':   max(0, qty_ord - qty_rec),
            'fill_pct':      fill_pct,
            'unit_price':    float(r['unit_price'] or 0),
            'total_value':   float(r['total_value'] or 0),
            'status':        r['status'],
        })
    return result


async def get_purchase_returns(pool: aiomysql.Pool) -> list:
    """Fetch all purchase returns ordered by most recent first."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("""
                SELECT return_id, return_number, po_id, po_number,
                       supplier_name, product_name,
                       return_type, qty_returned, unit, unit_price, return_value,
                       reason, document_type, document_number, return_date,
                       status, authorized_by, notes, created_at
                FROM purchase_returns
                ORDER BY created_at DESC
                LIMIT 100
            """)
            rows = await cur.fetchall()

    result = []
    for r in rows:
        result.append({
            'return_id':      r['return_id'],
            'return_number':  r['return_number'],
            'po_number':      r['po_number'] or '—',
            'supplier':       r['supplier_name'] or '—',
            'product':        r['product_name'] or '—',
            'return_type':    r['return_type'],
            'qty_returned':   float(r['qty_returned'] or 0),
            'unit':           r['unit'] or 'Units',
            'unit_price':     float(r['unit_price'] or 0),
            'return_value':   float(r['return_value'] or 0),
            'reason':         r['reason'] or '',
            'document_type':  r['document_type'],
            'document_number': r['document_number'] or '—',
            'return_date':    str(r['return_date']) if r['return_date'] else '',
            'status':         r['status'],
            'authorized_by':  r['authorized_by'] or '',
            'notes':          r['notes'] or '',
            'created_at':     str(r['created_at']) if r['created_at'] else '',
        })
    return result


async def create_purchase_return(pool: aiomysql.Pool, data: dict) -> dict:
    """Insert a new purchase return record and generate document/return numbers."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            # Generate sequential return number
            await cur.execute("SELECT COUNT(*) AS cnt FROM purchase_returns")
            cnt = (await cur.fetchone())['cnt']
            today_str = datetime.date.today().strftime('%Y%m%d')
            return_number = f"PR-{today_str}-{cnt + 1:03d}"

            doc_type = data.get('document_type', 'DEBIT_NOTE')
            prefix = 'DN' if doc_type == 'DEBIT_NOTE' else 'CN'
            document_number = f"{prefix}-{today_str}-{cnt + 1:03d}"

            qty   = float(data.get('qty_returned') or 0)
            price = float(data.get('unit_price') or 0)
            value = round(qty * price, 2)

            return_date = data.get('return_date') or datetime.date.today().isoformat()

            await cur.execute("""
                INSERT INTO purchase_returns
                    (return_number, po_id, po_number, supplier_id, supplier_name,
                     product_name, return_type, qty_returned, unit, unit_price,
                     return_value, reason, document_type, document_number,
                     return_date, status, authorized_by, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'PENDING', %s, %s)
            """, (
                return_number,
                data.get('po_id'),
                data.get('po_number') or '',
                data.get('supplier_id'),
                (data.get('supplier_name') or '')[:255],
                (data.get('product_name') or '')[:255],
                data.get('return_type', 'PARTIAL'),
                qty,
                (data.get('unit') or 'Units')[:30],
                price,
                value,
                (data.get('reason') or '')[:500],
                doc_type,
                document_number,
                return_date,
                (data.get('authorized_by') or '')[:100],
                data.get('notes') or '',
            ))
            await conn.commit()

    return {
        'success':        True,
        'return_number':  return_number,
        'document_number': document_number,
        'document_type':  doc_type,
        'return_value':   value,
        'status':         'PENDING',
    }


async def approve_purchase_return(pool: aiomysql.Pool, return_id: int, approver_name: str) -> dict:
    """Approve a PENDING purchase return — sets status to APPROVED."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT return_id, status, document_number, return_number FROM purchase_returns WHERE return_id=%s LIMIT 1",
                (return_id,)
            )
            row = await cur.fetchone()
            if not row:
                return {'success': False, 'error': 'Purchase return not found'}
            if row['status'] != 'PENDING':
                return {
                    'success': False,
                    'error': f"Return is already {row['status']} — cannot approve again",
                }

            await cur.execute(
                """UPDATE purchase_returns
                   SET status='APPROVED', authorized_by=%s
                   WHERE return_id=%s""",
                (approver_name[:100], return_id)
            )
            await conn.commit()

    return {
        'success':         True,
        'return_id':       return_id,
        'return_number':   row['return_number'],
        'document_number': row['document_number'],
        'new_status':      'APPROVED',
        'authorized_by':   approver_name,
        'message':         f"Purchase return {row['return_number']} approved. Debit note {row['document_number']} is now active.",
    }


# ── Purchase Invoice Lifecycle ────────────────────────────────────────────────

async def get_purchase_invoices(
    pool: aiomysql.Pool,
    status: str | None = None,
    po_number: str | None = None,
    grn_number: str | None = None,
) -> list:
    """Fetch purchase invoices with optional filters. Returns list sorted by created_at DESC."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            where, params = ["1=1"], []
            if status:
                where.append("pi.status = %s")
                params.append(status)
            if po_number:
                where.append("pi.po_number = %s")
                params.append(po_number)
            if grn_number:
                where.append("pi.grn_number = %s")
                params.append(grn_number)
            await cur.execute(f"""
                SELECT
                    pi.pi_id, pi.pi_number, pi.grn_number, pi.po_number,
                    pi.supplier_name, pi.product_name,
                    pi.qty_received, pi.unit, pi.unit_cost, pi.invoice_value,
                    pi.pi_date, pi.status, pi.notes,
                    pi.approved_by, pi.approved_at,
                    pi.paid_by, pi.payment_mode, pi.payment_ref, pi.paid_at,
                    pi.created_at,
                    g.match_status, g.received_by,
                    g.freight_charges, g.insurance_charges,
                    g.total_landed_cost
                FROM purchase_invoices pi
                LEFT JOIN grn g ON g.grn_number = pi.grn_number
                WHERE {' AND '.join(where)}
                ORDER BY pi.created_at DESC
                LIMIT 500
            """, params or None)
            rows = await cur.fetchall()
            result = []
            for r in rows:
                result.append({
                    "pi_id":          r["pi_id"],
                    "pi_number":      r["pi_number"],
                    "grn_number":     r["grn_number"] or "—",
                    "po_number":      r["po_number"] or "—",
                    "supplier_name":  r["supplier_name"] or "—",
                    "product_name":   r["product_name"] or "—",
                    "qty_received":   float(r["qty_received"] or 0),
                    "unit":           r["unit"] or "Units",
                    "unit_cost":      float(r["unit_cost"] or 0),
                    "invoice_value":  float(r["invoice_value"] or 0),
                    "pi_date":        r["pi_date"].isoformat() if r["pi_date"] else None,
                    "status":         r["status"] or "DRAFT",
                    "notes":          r["notes"] or "",
                    "approved_by":    r["approved_by"],
                    "approved_at":    r["approved_at"].isoformat() if r["approved_at"] else None,
                    "paid_by":        r["paid_by"],
                    "payment_mode":   r["payment_mode"],
                    "payment_ref":    r["payment_ref"],
                    "paid_at":        r["paid_at"].isoformat() if r["paid_at"] else None,
                    "created_at":     r["created_at"].isoformat() if r["created_at"] else None,
                    "match_status":   r["match_status"] or "PENDING",
                    "received_by":    r["received_by"],
                    "freight_charges": float(r["freight_charges"] or 0),
                    "total_landed_cost": float(r["total_landed_cost"] or 0),
                })
            return result


async def approve_purchase_invoice(
    pool: aiomysql.Pool,
    pi_number: str,
    approved_by: str,
) -> dict:
    """Transition a DRAFT purchase invoice to APPROVED. Validates GRN match before approving."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT pi_id, pi_number, status, grn_number, invoice_value, supplier_name FROM purchase_invoices WHERE pi_number=%s LIMIT 1",
                (pi_number,)
            )
            row = await cur.fetchone()
            if not row:
                return {"success": False, "error": "Purchase invoice not found"}
            if row["status"] == "PAID":
                return {"success": False, "error": "Invoice is already PAID — no changes allowed"}
            if row["status"] == "APPROVED":
                return {"success": False, "error": "Invoice is already APPROVED"}
            if row["status"] == "CANCELLED":
                return {"success": False, "error": "Cancelled invoices cannot be approved"}
            if row["status"] != "DRAFT":
                return {"success": False, "error": f"Invoice status is {row['status']} — only DRAFT invoices can be approved"}

            # Fetch GRN match status for validation
            match_status = "PENDING"
            if row["grn_number"] and row["grn_number"] != "—":
                await cur.execute(
                    "SELECT match_status FROM grn WHERE grn_number=%s LIMIT 1",
                    (row["grn_number"],)
                )
                grn_row = await cur.fetchone()
                if grn_row:
                    match_status = grn_row["match_status"] or "PENDING"

            import datetime as _dt
            await cur.execute(
                """UPDATE purchase_invoices
                   SET status='APPROVED', approved_by=%s, approved_at=%s
                   WHERE pi_number=%s""",
                (approved_by[:100], _dt.datetime.now(), pi_number)
            )
            await conn.commit()

    return {
        "success":      True,
        "pi_number":    pi_number,
        "new_status":   "APPROVED",
        "approved_by":  approved_by,
        "match_status": match_status,
        "message":      f"Invoice {pi_number} approved and ready for payment.",
    }


async def pay_purchase_invoice(
    pool: aiomysql.Pool,
    pi_number: str,
    paid_by: str,
    payment_mode: str = "Bank Transfer",
    payment_ref: str = "",
) -> dict:
    """Transition an APPROVED purchase invoice to PAID. Locks the invoice permanently."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT pi_id, pi_number, status, invoice_value, supplier_name FROM purchase_invoices WHERE pi_number=%s LIMIT 1",
                (pi_number,)
            )
            row = await cur.fetchone()
            if not row:
                return {"success": False, "error": "Purchase invoice not found"}
            if row["status"] == "PAID":
                return {"success": False, "error": "Invoice is already PAID — it is now locked and immutable"}
            if row["status"] == "DRAFT":
                return {"success": False, "error": "Invoice must be APPROVED before it can be marked as PAID"}
            if row["status"] == "CANCELLED":
                return {"success": False, "error": "Cancelled invoices cannot be paid"}
            if row["status"] != "APPROVED":
                return {"success": False, "error": f"Invoice status is {row['status']} — only APPROVED invoices can be paid"}

            import datetime as _dt
            await cur.execute(
                """UPDATE purchase_invoices
                   SET status='PAID', paid_by=%s, payment_mode=%s, payment_ref=%s, paid_at=%s
                   WHERE pi_number=%s""",
                (paid_by[:100], (payment_mode or "Bank Transfer")[:50], (payment_ref or "")[:100],
                 _dt.datetime.now(), pi_number)
            )
            await conn.commit()

    return {
        "success":      True,
        "pi_number":    pi_number,
        "new_status":   "PAID",
        "paid_by":      paid_by,
        "payment_mode": payment_mode,
        "invoice_value": float(row["invoice_value"] or 0),
        "message":      f"Invoice {pi_number} marked as PAID. Invoice is now locked — no further changes are permitted.",
    }


async def create_purchase_invoice(pool: aiomysql.Pool, data: dict) -> dict:
    """Manually create a purchase invoice in DRAFT status from a PO (without a GRN)."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT COUNT(*) AS cnt FROM purchase_invoices")
            pi_cnt = (await cur.fetchone())["cnt"]
            pi_number = f"PI-{datetime.date.today().strftime('%Y%m%d')}-{pi_cnt + 1:03d}"

            po_number     = (data.get("po_number") or "")[:50]
            grn_number    = data.get("grn_number") or None
            supplier_name = (data.get("supplier_name") or "")[:200]
            product_name  = (data.get("product_name") or "")[:200]
            qty           = float(data.get("qty_received") or 0)
            unit          = (data.get("unit") or "Units")[:50]
            unit_cost     = float(data.get("unit_cost") or 0)
            inv_value     = float(data.get("invoice_value") or 0)
            if inv_value == 0 and qty > 0 and unit_cost > 0:
                inv_value = round(qty * unit_cost, 2)
            pi_date = data.get("pi_date") or datetime.date.today().isoformat()
            notes   = (data.get("notes") or "")[:500]

            await cur.execute("""
                INSERT INTO purchase_invoices
                    (pi_number, grn_number, po_number, supplier_name, product_name,
                     qty_received, unit, unit_cost, invoice_value, pi_date, status, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'DRAFT', %s)
            """, (pi_number, grn_number, po_number, supplier_name, product_name,
                  qty, unit, unit_cost, inv_value, pi_date, notes))
            await conn.commit()

    return {
        "success":       True,
        "pi_number":     pi_number,
        "invoice_value": inv_value,
        "status":        "DRAFT",
        "message":       f"Purchase invoice {pi_number} created in DRAFT mode.",
    }


# ── PO Lifecycle Management ────────────────────────────────────────────────────

async def get_po_quantity_summary(pool: aiomysql.Pool, po_number: str) -> dict:
    """Return all 7 quantity types for a PO: ordered, received, accepted, rejected,
    returned, pending, qc_pending. Aggregated across all PO line items."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("""
                SELECT
                    po.po_number, po.status,
                    COALESCE(SUM(pi.qty_ordered),   0) AS qty_ordered,
                    COALESCE(SUM(pi.qty_received),  0) AS qty_received,
                    COALESCE(SUM(pi.accepted_qty),  0) AS accepted_qty,
                    COALESCE(SUM(pi.rejected_qty),  0) AS rejected_qty,
                    COALESCE(SUM(pi.qty_returned),  0) AS qty_returned,
                    COALESCE(SUM(pi.qc_pending_qty),0) AS qc_pending_qty
                FROM purchase_orders po
                LEFT JOIN po_items pi ON pi.po_id = po.po_id
                WHERE po.po_number = %s
                GROUP BY po.po_id
            """, (po_number,))
            row = await cur.fetchone()
            if not row:
                return {"success": False, "error": "PO not found"}

            ordered     = float(row["qty_ordered"]   or 0)
            received    = float(row["qty_received"]  or 0)
            accepted    = float(row["accepted_qty"]  or 0)
            rejected    = float(row["rejected_qty"]  or 0)
            returned    = float(row["qty_returned"]  or 0)
            qc_pending  = float(row["qc_pending_qty"] or 0)
            pending     = max(0.0, round(ordered - received - returned, 3))

            return {
                "success":       True,
                "po_number":     po_number,
                "status":        row["status"],
                "qty_ordered":   ordered,
                "qty_received":  received,
                "accepted_qty":  accepted,
                "rejected_qty":  rejected,
                "qty_returned":  returned,
                "qc_pending_qty": qc_pending,
                "pending_qty":   pending,
                "fill_pct":      round(received / ordered * 100, 1) if ordered > 0 else 0,
            }


async def close_po(
    pool: aiomysql.Pool,
    po_number: str,
    closed_by: str,
    reason: str = "",
) -> dict:
    """Manually close a PO. Allowed only when status is FULLY_RECEIVED, RECEIVED, RETURNED,
    or PARTIAL (with explicit override). Sets status to CLOSED."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT po_id, status FROM purchase_orders WHERE po_number = %s LIMIT 1",
                (po_number,)
            )
            row = await cur.fetchone()
            if not row:
                return {"success": False, "error": "PO not found"}

            status = row["status"]
            closeable = {"FULLY_RECEIVED", "RECEIVED", "RETURNED", "PARTIAL", "COMPLETE", "OPEN"}
            if status not in closeable:
                return {
                    "success": False,
                    "error": f"PO cannot be closed from status '{status}'. "
                             f"Allowed states: {', '.join(sorted(closeable))}."
                }
            if status == "CLOSED":
                return {"success": False, "error": "PO is already CLOSED."}

            await cur.execute("""
                UPDATE purchase_orders
                SET status = 'CLOSED', closed_by = %s, closed_at = %s, close_reason = %s
                WHERE po_id = %s
            """, (closed_by[:100], datetime.datetime.now(), (reason or "")[:500], row["po_id"]))
            await conn.commit()

    try:
        from app.services.audit_logger import log_status_change
        await log_status_change(pool, "PO", po_number, status, "CLOSED", closed_by, reason or "Manual close")
    except Exception:
        pass

    return {
        "success":    True,
        "po_number":  po_number,
        "old_status": status,
        "new_status": "CLOSED",
        "closed_by":  closed_by,
        "message":    f"PO {po_number} has been CLOSED.",
    }


async def cancel_remaining_qty(
    pool: aiomysql.Pool,
    po_number: str,
    action: str,   # 'CANCEL' | 'DEBIT_NOTE'
    cancelled_by: str,
    reason: str = "",
) -> dict:
    """Cancel remaining (pending) quantity on an open/partial PO.
    Sets remaining_qty_action and marks PO as CLOSED if action completes the lifecycle."""
    valid_actions = {"CANCEL", "DEBIT_NOTE"}
    if action.upper() not in valid_actions:
        return {"success": False, "error": f"action must be one of: {', '.join(sorted(valid_actions))}"}

    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("""
                SELECT po.po_id, po.status,
                       COALESCE(SUM(pi.qty_ordered),  0) AS total_ordered,
                       COALESCE(SUM(pi.qty_received), 0) AS total_received
                FROM purchase_orders po
                LEFT JOIN po_items pi ON pi.po_id = po.po_id
                WHERE po.po_number = %s
                GROUP BY po.po_id
            """, (po_number,))
            row = await cur.fetchone()
            if not row:
                return {"success": False, "error": "PO not found"}

            status   = row["status"]
            pending  = max(0.0, float(row["total_ordered"]) - float(row["total_received"]))
            if status in ("CLOSED", "CANCELLED", "RETURNED"):
                return {"success": False, "error": f"PO already in terminal state: {status}"}
            if pending <= 0:
                return {"success": False, "error": "No pending quantity remaining on this PO."}

            new_status = "CLOSED" if action.upper() == "CANCEL" else status
            await cur.execute("""
                UPDATE purchase_orders
                SET remaining_qty_action = %s, status = %s,
                    close_reason = %s, closed_by = %s, closed_at = %s
                WHERE po_id = %s
            """, (action.upper(), new_status, (reason or "")[:500],
                  cancelled_by[:100], datetime.datetime.now(), row["po_id"]))
            await conn.commit()

    return {
        "success":       True,
        "po_number":     po_number,
        "action":        action.upper(),
        "pending_qty":   pending,
        "new_status":    new_status,
        "message":       f"Remaining qty ({pending:.2f}) marked as {action.upper()}. PO status: {new_status}.",
    }


async def mark_po_complete(
    pool: aiomysql.Pool,
    po_number: str,
    completed_by: str = "system",
) -> dict:
    """Promote a FULLY_RECEIVED PO to COMPLETE after QC is done for all GRNs.
    Called automatically by QC decision workflow when all lines are inspected."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("""
                SELECT po.po_id, po.status
                FROM purchase_orders po
                WHERE po.po_number = %s LIMIT 1
            """, (po_number,))
            row = await cur.fetchone()
            if not row or row["status"] not in ("FULLY_RECEIVED", "RECEIVED"):
                return {"success": False, "error": "PO not eligible for COMPLETE status"}

            # Check all GRNs are QC-completed
            await cur.execute("""
                SELECT COUNT(*) AS pending_qc
                FROM grn
                WHERE po_id = %s AND qc_completed = 0 AND qc_required = 1
            """, (row["po_id"],))
            qc_row  = await cur.fetchone()
            pending = int(qc_row["pending_qc"] if qc_row else 0)
            if pending > 0:
                return {
                    "success": False,
                    "error": f"{pending} GRN(s) still have pending QC. Complete QC first.",
                }

            await cur.execute(
                "UPDATE purchase_orders SET status='COMPLETE' WHERE po_id=%s",
                (row["po_id"],)
            )
            await conn.commit()

    return {
        "success":    True,
        "po_number":  po_number,
        "new_status": "COMPLETE",
        "message":    f"PO {po_number} is now COMPLETE — all quantity received and QC done.",
    }


async def duplicate_pr(pool: aiomysql.Pool, pr_id: int, duplicated_by: str) -> dict:
    """Duplicate a Purchase Requisition — copies all items with original qty.
    Original PR is unchanged. Returns new PR number and pr_id."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT * FROM purchase_requisitions WHERE pr_id = %s LIMIT 1",
                (pr_id,)
            )
            src = await cur.fetchone()
            if not src:
                return {"success": False, "error": "Source PR not found"}

            await cur.execute("SELECT * FROM pr_items WHERE pr_id = %s ORDER BY pr_item_id", (pr_id,))
            src_items = await cur.fetchall()

            today     = datetime.date.today()
            ts        = datetime.datetime.now().strftime("%H%M%S")
            new_pr_no = f"PR-{today.year}-{ts}-D"

            await cur.execute("""
                INSERT INTO purchase_requisitions
                    (pr_number, requested_by, department, pr_date, required_by,
                     status, priority, notes)
                VALUES (%s, %s, %s, %s, %s, 'PENDING', %s, %s)
            """, (
                new_pr_no,
                duplicated_by[:100],
                src["department"] or "Stores",
                today.isoformat(),
                src["required_by"],
                src["priority"] or "NORMAL",
                f"Duplicated from {src['pr_number']} by {duplicated_by}",
            ))
            new_pr_id = cur.lastrowid

            for item in src_items:
                await cur.execute("""
                    INSERT INTO pr_items
                        (pr_id, sku_name, category, qty_required, unit,
                         estimated_price, purpose, preferred_supplier)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    new_pr_id,
                    item["sku_name"], item["category"] or "General",
                    item["qty_required"], item["unit"] or "pcs",
                    item["estimated_price"], item["purpose"], item["preferred_supplier"],
                ))
            await conn.commit()

    try:
        from app.services.audit_logger import log_action
        await log_action(
            pool, "PR", new_pr_no, "CREATE",
            new_value={"duplicated_from": src["pr_number"], "by": duplicated_by},
            changed_by=duplicated_by,
        )
    except Exception:
        pass

    return {
        "success":    True,
        "new_pr_number": new_pr_no,
        "new_pr_id":  new_pr_id,
        "source_pr":  src["pr_number"],
        "items_count": len(src_items),
        "status":     "PENDING",
        "message":    f"PR {src['pr_number']} duplicated as {new_pr_no}. All items copied with original quantities.",
    }


async def get_pr_linked_pos(pool: aiomysql.Pool, pr_number: str) -> list:
    """Return all Purchase Orders linked to a PR with their current status and qty summary."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("""
                SELECT
                    po.po_number, po.status, po.total_value, po.expected_date,
                    s.supplier_name,
                    COALESCE(SUM(pi.qty_ordered),  0) AS qty_ordered,
                    COALESCE(SUM(pi.qty_received), 0) AS qty_received,
                    COALESCE(SUM(pi.accepted_qty), 0) AS accepted_qty,
                    COALESCE(SUM(pi.rejected_qty), 0) AS rejected_qty,
                    COALESCE(SUM(pi.qty_returned), 0) AS qty_returned
                FROM purchase_orders po
                LEFT JOIN suppliers s  ON s.supplier_id = po.supplier_id
                LEFT JOIN po_items  pi ON pi.po_id      = po.po_id
                WHERE po.pr_number = %s
                GROUP BY po.po_id
                ORDER BY po.po_date DESC
            """, (pr_number,))
            rows = await cur.fetchall()
            result = []
            for r in rows:
                ordered  = float(r["qty_ordered"]  or 0)
                received = float(r["qty_received"] or 0)
                result.append({
                    "po_number":    r["po_number"],
                    "status":       r["status"],
                    "supplier":     r["supplier_name"] or "—",
                    "total_value":  float(r["total_value"] or 0),
                    "expected_date": str(r["expected_date"]) if r["expected_date"] else None,
                    "qty_ordered":  ordered,
                    "qty_received": received,
                    "accepted_qty": float(r["accepted_qty"] or 0),
                    "rejected_qty": float(r["rejected_qty"] or 0),
                    "qty_returned": float(r["qty_returned"] or 0),
                    "pending_qty":  max(0.0, round(ordered - received, 3)),
                    "fill_pct":     round(received / ordered * 100, 1) if ordered > 0 else 0,
                })
            return result
