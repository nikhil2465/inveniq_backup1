"""
MySQL queries for PO & GRN data.
Used by both the REST API endpoints and the chatbot po_grn_tool.
"""
import datetime
import aiomysql

_schema_migrated = False
_lc_schema_migrated = False


async def ensure_landing_cost_schema(pool: aiomysql.Pool) -> None:
    """One-time migration: add operation_type to purchase_orders and landing cost columns to grn."""
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

            # Open POs list with item details
            await cur.execute("""
                SELECT po.po_id, po.po_number, s.supplier_name,
                       GROUP_CONCAT(p.sku_name ORDER BY pi.po_item_id SEPARATOR ', ') AS sku_list,
                       COALESCE(SUM(pi.qty_ordered), 0) AS qty_ordered,
                       COALESCE(SUM(pi.qty_received), 0) AS qty_received,
                       po.total_value, po.expected_date, po.status,
                       GREATEST(DATEDIFF(CURDATE(), po.expected_date), 0) AS overdue_days
                FROM purchase_orders po
                JOIN suppliers s ON po.supplier_id = s.supplier_id
                LEFT JOIN po_items pi ON po.po_id = pi.po_id
                LEFT JOIN products p ON pi.product_id = p.product_id
                WHERE po.status IN ('OPEN', 'PARTIAL', 'OVERDUE')
                GROUP BY po.po_id
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
            "po_number": r["po_number"],
            "supplier": r["supplier_name"],
            "sku": r["sku_list"] or "-",
            "qty_ordered": qty_ord,
            "qty_received": qty_rec,
            "fill_pct": fill_pct,
            "value": f"₹{float(r['total_value'] or 0) / 100000:.2f}L",
            "eta": eta,
            "status": r["status"],
            "overdue_days": overdue_days,
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
            await cur.execute(
                """INSERT INTO purchase_orders
                       (po_number, supplier_id, po_date, expected_date,
                        status, total_value, notes, operation_type)
                   VALUES (%s, %s, %s, %s, 'DRAFT', %s, %s, %s)""",
                (
                    po_number,
                    supplier_id,
                    datetime.date.today().isoformat(),
                    expected_date,
                    total_value,
                    notes,
                    operation_type,
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
    }


async def create_grn(pool: aiomysql.Pool, grn_data: dict) -> dict:
    """Create a new GRN record in the database."""
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:

            # Resolve supplier
            await cur.execute(
                "SELECT supplier_id, supplier_name FROM suppliers "
                "WHERE supplier_name LIKE %s AND is_active=1 LIMIT 1",
                (f"%{grn_data['supplier_name']}%",),
            )
            supplier = await cur.fetchone()
            if not supplier:
                # Insert as a new supplier for demo/new-industry flow
                await cur.execute(
                    "INSERT INTO suppliers (supplier_name, contact_person, is_active) VALUES (%s, %s, 1)",
                    (grn_data['supplier_name'], grn_data.get('received_by', 'TBD')),
                )
                supplier_id = cur.lastrowid
                supplier_name = grn_data['supplier_name']
            else:
                supplier_id = supplier["supplier_id"]
                supplier_name = supplier["supplier_name"]

            # Optionally resolve PO
            po_id = None
            if grn_data.get("po_number"):
                await cur.execute(
                    "SELECT po_id FROM purchase_orders WHERE po_number=%s LIMIT 1",
                    (grn_data["po_number"],),
                )
                po_row = await cur.fetchone()
                if po_row:
                    po_id = po_row["po_id"]

            # Generate unique GRN number
            await cur.execute("SELECT COUNT(*) AS cnt FROM grn")
            cnt = (await cur.fetchone())["cnt"]
            grn_number = f"GRN-{datetime.date.today().strftime('%Y%m%d')}-{cnt + 1:03d}"

            invoice_value = float(grn_data.get("invoice_value") or 0)
            grn_value = float(grn_data.get("grn_value") or invoice_value)
            discrepancy = round(abs(invoice_value - grn_value), 2)
            match_status = (
                "MATCH" if discrepancy < 1
                else "MISMATCH" if discrepancy > 0
                else "PENDING"
            )

            # ── Landing cost breakdown ────────────────────────────────────────
            freight_charges   = float(grn_data.get("freight_charges")   or 0)
            insurance_charges = float(grn_data.get("insurance_charges") or 0)
            loading_unloading = float(grn_data.get("loading_unloading") or 0)
            local_transport   = float(grn_data.get("local_transport")   or 0)
            other_charges     = float(grn_data.get("other_charges")     or 0)
            total_landed_cost = round(
                grn_value + freight_charges + insurance_charges +
                loading_unloading + local_transport + other_charges, 2
            )
            qty_received_num = float(grn_data.get("qty_received") or 0)
            landing_cost_per_unit = (
                round(total_landed_cost / qty_received_num, 4) if qty_received_num > 0 else 0
            )

            received_date = grn_data.get("received_date") or datetime.date.today().isoformat()
            notes = grn_data.get("notes") or "Created via InvenIQ"

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
            await conn.commit()

    return {
        "success":               True,
        "grn_number":            grn_number,
        "supplier":              supplier_name,
        "po_number":             grn_data.get("po_number") or "—",
        "invoice_value":         invoice_value,
        "grn_value":             grn_value,
        "match_status":          match_status,
        "discrepancy_amt":       discrepancy,
        "received_date":         received_date,
        "freight_charges":       freight_charges,
        "insurance_charges":     insurance_charges,
        "loading_unloading":     loading_unloading,
        "local_transport":       local_transport,
        "other_charges":         other_charges,
        "total_landed_cost":     total_landed_cost,
        "landing_cost_per_unit": landing_cost_per_unit,
    }


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
                       po.po_date, po.notes
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
