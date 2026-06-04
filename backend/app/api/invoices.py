"""
Sales Invoice API — GST-compliant invoicing with IGST/CGST/SGST split.
DB-first / demo-fallback. Tables auto-created on first call.
"""
import datetime
import json
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Invoices"])

# ── GST State Code Map ─────────────────────────────────────────────────────────
_STATE_CODES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
    "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman & Diu", "26": "Dadra & Nagar Haveli", "27": "Maharashtra",
    "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa",
    "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
    "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana",
    "37": "Andhra Pradesh (New)", "38": "Ladakh", "97": "Other Territory",
    "99": "Centre Jurisdiction",
}

_INV_STATUS = ("DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED")

_DDL_INVOICES = """
CREATE TABLE IF NOT EXISTS sales_invoices (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_number  VARCHAR(50)  UNIQUE NOT NULL,
    invoice_date    DATE         NOT NULL,
    due_date        DATE         NOT NULL,
    customer_name   VARCHAR(255) NOT NULL,
    customer_gstin  VARCHAR(20)  DEFAULT '',
    billing_address TEXT,
    shipping_address TEXT,
    place_of_supply VARCHAR(100) DEFAULT '',
    is_igst         TINYINT(1)   DEFAULT 0,
    subtotal        DECIMAL(14,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    taxable_amount  DECIMAL(14,2) DEFAULT 0,
    cgst_amount     DECIMAL(12,2) DEFAULT 0,
    sgst_amount     DECIMAL(12,2) DEFAULT 0,
    igst_amount     DECIMAL(12,2) DEFAULT 0,
    total_tax       DECIMAL(12,2) DEFAULT 0,
    grand_total     DECIMAL(14,2) DEFAULT 0,
    paid_amount     DECIMAL(14,2) DEFAULT 0,
    status          ENUM('DRAFT','SENT','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED') DEFAULT 'DRAFT',
    notes           TEXT,
    terms           TEXT,
    reference_so_number VARCHAR(50) DEFAULT '',
    created_by      VARCHAR(100) DEFAULT '',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status  (status),
    INDEX idx_customer (customer_name(50)),
    INDEX idx_inv_number (invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

_DDL_ITEMS = """
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id    BIGINT UNSIGNED NOT NULL,
    sl            INT DEFAULT 1,
    description   VARCHAR(500) NOT NULL,
    hsn_sac       VARCHAR(20)  DEFAULT '',
    qty           DECIMAL(12,3) DEFAULT 0,
    unit          VARCHAR(20)  DEFAULT '',
    rate          DECIMAL(12,2) DEFAULT 0,
    discount_pct  DECIMAL(5,2)  DEFAULT 0,
    taxable_amount DECIMAL(14,2) DEFAULT 0,
    cgst_rate     DECIMAL(5,2)  DEFAULT 0,
    sgst_rate     DECIMAL(5,2)  DEFAULT 0,
    igst_rate     DECIMAL(5,2)  DEFAULT 0,
    tax_amount    DECIMAL(12,2) DEFAULT 0,
    line_total    DECIMAL(14,2) DEFAULT 0,
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
    INDEX idx_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

_DDL_PAYMENTS = """
CREATE TABLE IF NOT EXISTS invoice_payments (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id   BIGINT UNSIGNED NOT NULL,
    amount       DECIMAL(14,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_mode ENUM('NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','OTHER') DEFAULT 'NEFT',
    reference    VARCHAR(100) DEFAULT '',
    notes        TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# ── Demo in-memory store ───────────────────────────────────────────────────────
_demo_invoices: dict = {}
_demo_items:    dict = {}
_demo_payments: dict = {}
_demo_counter  = [0]

def _init_demo():
    if _demo_invoices:
        return
    today = datetime.date.today()
    _demo_counter[0] = 3
    # INV 001 — Paid
    _demo_invoices[1] = {
        "id": 1, "invoice_number": f"INV/{today.year}-{str(today.year+1)[-2:]}/0001",
        "invoice_date": (today - datetime.timedelta(days=45)).isoformat(),
        "due_date":     (today - datetime.timedelta(days=15)).isoformat(),
        "customer_name": "Vigilant Solutions Pvt. Ltd.",
        "customer_gstin": "29AABCV1234Z1ZB",
        "billing_address": "14, MG Road, Bangalore - 560001",
        "shipping_address": "14, MG Road, Bangalore - 560001",
        "place_of_supply": "Karnataka", "is_igst": 0,
        "subtotal": 750000, "discount_amount": 0, "taxable_amount": 750000,
        "cgst_amount": 67500, "sgst_amount": 67500, "igst_amount": 0,
        "total_tax": 135000, "grand_total": 885000, "paid_amount": 885000,
        "status": "PAID", "notes": "", "terms": "Payment within 30 days.",
        "reference_so_number": "SO-2026-0033", "created_by": "admin",
        "created_at": (today - datetime.timedelta(days=45)).isoformat(),
    }
    _demo_items[1] = [
        {"id": 1, "invoice_id": 1, "sl": 1, "description": "HPL Sheet 1mm Teak",
         "hsn_sac": "4411", "qty": 500, "unit": "sheet", "rate": 1200,
         "discount_pct": 0, "taxable_amount": 600000,
         "cgst_rate": 9, "sgst_rate": 9, "igst_rate": 0, "tax_amount": 108000, "line_total": 708000},
        {"id": 2, "invoice_id": 1, "sl": 2, "description": "Operable Louvre System – Motorised",
         "hsn_sac": "8302", "qty": 5, "unit": "nos", "rate": 30000,
         "discount_pct": 0, "taxable_amount": 150000,
         "cgst_rate": 9, "sgst_rate": 9, "igst_rate": 0, "tax_amount": 27000, "line_total": 177000},
    ]
    _demo_payments[1] = [
        {"id": 1, "invoice_id": 1, "amount": 885000,
         "payment_date": (today - datetime.timedelta(days=10)).isoformat(),
         "payment_mode": "NEFT", "reference": "TXN20260524001", "notes": "Full payment received"},
    ]
    # INV 002 — Overdue
    _demo_invoices[2] = {
        "id": 2, "invoice_number": f"INV/{today.year}-{str(today.year+1)[-2:]}/0002",
        "invoice_date": (today - datetime.timedelta(days=40)).isoformat(),
        "due_date":     (today - datetime.timedelta(days=10)).isoformat(),
        "customer_name": "John Holland High School",
        "customer_gstin": "",
        "billing_address": "22, Whitefield Road, Bangalore - 560066",
        "shipping_address": "22, Whitefield Road, Bangalore - 560066",
        "place_of_supply": "Karnataka", "is_igst": 0,
        "subtotal": 270000, "discount_amount": 0, "taxable_amount": 270000,
        "cgst_amount": 24300, "sgst_amount": 24300, "igst_amount": 0,
        "total_tax": 48600, "grand_total": 318600, "paid_amount": 0,
        "status": "OVERDUE", "notes": "School project supply",
        "terms": "Payment within 30 days.",
        "reference_so_number": "SO-2026-0032", "created_by": "admin",
        "created_at": (today - datetime.timedelta(days=40)).isoformat(),
    }
    _demo_items[2] = [
        {"id": 3, "invoice_id": 2, "sl": 1, "description": "Aluminium Louvre Blades – 100mm",
         "hsn_sac": "7610", "qty": 300, "unit": "rft", "rate": 900,
         "discount_pct": 0, "taxable_amount": 270000,
         "cgst_rate": 9, "sgst_rate": 9, "igst_rate": 0, "tax_amount": 48600, "line_total": 318600},
    ]
    _demo_payments[2] = []
    # INV 003 — Draft
    _demo_invoices[3] = {
        "id": 3, "invoice_number": f"INV/{today.year}-{str(today.year+1)[-2:]}/0003",
        "invoice_date": today.isoformat(),
        "due_date":     (today + datetime.timedelta(days=30)).isoformat(),
        "customer_name": "Prestige Developers",
        "customer_gstin": "27AABCP1234Z1ZD",
        "billing_address": "Prestige Tower, Nariman Point, Mumbai - 400021",
        "shipping_address": "Site: Prestige Residency, Wakad, Pune - 411057",
        "place_of_supply": "Maharashtra", "is_igst": 1,
        "subtotal": 500000, "discount_amount": 0, "taxable_amount": 500000,
        "cgst_amount": 0, "sgst_amount": 0, "igst_amount": 90000,
        "total_tax": 90000, "grand_total": 590000, "paid_amount": 0,
        "status": "DRAFT", "notes": "Interstate supply — IGST applicable (KA→MH)",
        "terms": "Payment within 30 days of invoice.",
        "reference_so_number": "", "created_by": "admin",
        "created_at": today.isoformat(),
    }
    _demo_items[3] = [
        {"id": 4, "invoice_id": 3, "sl": 1, "description": "Acrylic Laminates – High Gloss White 1mm",
         "hsn_sac": "3921", "qty": 500, "unit": "sheet", "rate": 1000,
         "discount_pct": 0, "taxable_amount": 500000,
         "cgst_rate": 0, "sgst_rate": 0, "igst_rate": 18, "tax_amount": 90000, "line_total": 590000},
    ]
    _demo_payments[3] = []


async def _get_pool():
    try:
        from app.db.connection import get_pool
        return await get_pool()
    except Exception:
        return None


async def _ensure_tables(pool):
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_DDL_INVOICES)
                await cur.execute(_DDL_ITEMS)
                await cur.execute(_DDL_PAYMENTS)
    except Exception as exc:
        logger.warning("invoices: DDL failed — %s", exc)


def _next_inv_number(year: int, counter: int) -> str:
    short_next = str(year + 1)[-2:]
    return f"INV/{year}-{short_next}/{counter:04d}"


def _compute_kpis(invs: list, today: datetime.date) -> dict:
    mtd_start = today.replace(day=1)
    mtd = [i for i in invs if i.get("invoice_date", "")[:10] >= mtd_start.isoformat()]
    total_invoiced = sum(float(i.get("grand_total", 0)) for i in mtd)
    collected      = sum(float(i.get("paid_amount", 0)) for i in invs)
    overdue_count  = sum(1 for i in invs if i.get("status") == "OVERDUE")
    overdue_value  = sum(float(i.get("grand_total", 0)) - float(i.get("paid_amount", 0))
                         for i in invs if i.get("status") == "OVERDUE")
    # DSO: avg days from invoice to payment for PAID invoices
    paid_invs = [i for i in invs if i.get("status") == "PAID"]
    dso = 0
    if paid_invs:
        days_list = []
        for i in paid_invs:
            try:
                d0 = datetime.date.fromisoformat(str(i["invoice_date"])[:10])
                d1 = datetime.date.fromisoformat(str(i.get("updated_at", today))[:10])
                days_list.append((d1 - d0).days)
            except Exception:
                pass
        dso = round(sum(days_list) / len(days_list)) if days_list else 0
    return {
        "total_invoiced_mtd": total_invoiced,
        "collected": collected,
        "overdue_count": overdue_count,
        "overdue_value": overdue_value,
        "dso_days": dso,
        "total_outstanding": sum(float(i.get("grand_total", 0)) - float(i.get("paid_amount", 0))
                                  for i in invs if i.get("status") not in ("PAID", "CANCELLED")),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/invoices")
async def list_invoices(status: Optional[str] = None, search: Optional[str] = None):
    _init_demo()
    today = datetime.date.today()
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_tables(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    # Auto-mark overdue
                    await cur.execute(
                        "UPDATE sales_invoices SET status='OVERDUE' WHERE status='SENT' AND due_date < %s",
                        (today,)
                    )
                    await conn.commit()
                    q = "SELECT * FROM sales_invoices"
                    params = []
                    wheres = []
                    if status:
                        wheres.append("status=%s"); params.append(status)
                    if search:
                        wheres.append("(customer_name LIKE %s OR invoice_number LIKE %s)")
                        like = f"%{search}%"; params += [like, like]
                    if wheres:
                        q += " WHERE " + " AND ".join(wheres)
                    q += " ORDER BY created_at DESC LIMIT 300"
                    await cur.execute(q, params)
                    cols = [d[0] for d in cur.description]
                    rows = await cur.fetchall()
                    invs = [dict(zip(cols, r)) for r in rows]
                    for inv in invs:
                        inv["invoice_date"] = str(inv["invoice_date"])[:10] if inv.get("invoice_date") else ""
                        inv["due_date"]     = str(inv["due_date"])[:10]     if inv.get("due_date")     else ""
                        inv["created_at"]   = str(inv["created_at"])[:10]   if inv.get("created_at")   else ""
                        inv["is_igst"]      = bool(inv.get("is_igst", 0))
                        for f in ("subtotal","discount_amount","taxable_amount","cgst_amount",
                                  "sgst_amount","igst_amount","total_tax","grand_total","paid_amount"):
                            inv[f] = float(inv.get(f, 0) or 0)
                    return {"invoices": invs, "kpis": _compute_kpis(invs, today), "data_source": "live"}
        except Exception as exc:
            logger.warning("invoices: list failed — %s", exc)

    invs = list(_demo_invoices.values())
    if status:
        invs = [i for i in invs if i["status"] == status]
    if search:
        t = search.lower()
        invs = [i for i in invs if t in i["customer_name"].lower() or t in i["invoice_number"].lower()]
    return {"invoices": invs, "kpis": _compute_kpis(invs, today), "data_source": "demo"}


@router.get("/invoices/{inv_id}")
async def get_invoice(inv_id: int):
    _init_demo()
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_tables(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT * FROM sales_invoices WHERE id=%s", (inv_id,))
                    cols = [d[0] for d in cur.description]
                    row  = await cur.fetchone()
                    if not row:
                        raise HTTPException(status_code=404, detail="Invoice not found")
                    inv = dict(zip(cols, row))
                    inv["is_igst"] = bool(inv.get("is_igst"))
                    await cur.execute("SELECT * FROM invoice_line_items WHERE invoice_id=%s ORDER BY sl", (inv_id,))
                    ic = [d[0] for d in cur.description]
                    inv["line_items"] = [dict(zip(ic, r)) for r in await cur.fetchall()]
                    await cur.execute("SELECT * FROM invoice_payments WHERE invoice_id=%s ORDER BY payment_date", (inv_id,))
                    pc = [d[0] for d in cur.description]
                    inv["payments"] = [dict(zip(pc, r)) for r in await cur.fetchall()]
                    return {**inv, "data_source": "live"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("invoices: get failed — %s", exc)

    inv = _demo_invoices.get(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {**inv, "line_items": _demo_items.get(inv_id, []),
            "payments": _demo_payments.get(inv_id, []), "data_source": "demo"}


@router.post("/invoices", status_code=201)
async def create_invoice(body: dict):
    _init_demo()
    today   = datetime.date.today()
    is_igst = bool(body.get("is_igst", False))
    lines   = body.get("line_items", [])
    # Recalculate totals server-side
    subtotal = sum(float(li.get("qty", 0)) * float(li.get("rate", 0)) *
                   (1 - float(li.get("discount_pct", 0)) / 100) for li in lines)
    cgst = sgst = igst = 0.0
    for li in lines:
        tax_base = float(li.get("qty", 0)) * float(li.get("rate", 0)) * \
                   (1 - float(li.get("discount_pct", 0)) / 100)
        if is_igst:
            igst += tax_base * float(li.get("igst_rate", 0)) / 100
        else:
            cgst += tax_base * float(li.get("cgst_rate", 0)) / 100
            sgst += tax_base * float(li.get("sgst_rate", 0)) / 100

    grand_total = subtotal + cgst + sgst + igst

    pool = await _get_pool()
    if pool:
        try:
            await _ensure_tables(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT COUNT(*)+1 FROM sales_invoices")
                    seq = (await cur.fetchone())[0]
                    inv_num = body.get("invoice_number") or _next_inv_number(today.year, seq)
                    await cur.execute("""
                        INSERT INTO sales_invoices
                        (invoice_number, invoice_date, due_date, customer_name, customer_gstin,
                         billing_address, shipping_address, place_of_supply, is_igst,
                         subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount,
                         total_tax, grand_total, paid_amount, status, notes, terms,
                         reference_so_number, created_by)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,%s,%s,%s,%s,%s)
                    """, (
                        inv_num,
                        body.get("invoice_date", today.isoformat()),
                        body.get("due_date", (today + datetime.timedelta(days=30)).isoformat()),
                        body.get("customer_name", ""),
                        body.get("customer_gstin", ""),
                        body.get("billing_address", ""),
                        body.get("shipping_address", ""),
                        body.get("place_of_supply", ""),
                        1 if is_igst else 0,
                        round(subtotal, 2), round(subtotal, 2),
                        round(cgst, 2), round(sgst, 2), round(igst, 2),
                        round(cgst + sgst + igst, 2), round(grand_total, 2),
                        body.get("status", "DRAFT"),
                        body.get("notes", ""), body.get("terms", ""),
                        body.get("reference_so_number", ""),
                        body.get("created_by", ""),
                    ))
                    new_id = cur.lastrowid
                    for sl, li in enumerate(lines, 1):
                        tax_base = float(li.get("qty", 0)) * float(li.get("rate", 0)) * \
                                   (1 - float(li.get("discount_pct", 0)) / 100)
                        lt = tax_base + (
                            tax_base * float(li.get("igst_rate", 0)) / 100 if is_igst
                            else tax_base * (float(li.get("cgst_rate", 0)) + float(li.get("sgst_rate", 0))) / 100
                        )
                        await cur.execute("""
                            INSERT INTO invoice_line_items
                            (invoice_id, sl, description, hsn_sac, qty, unit, rate, discount_pct,
                             taxable_amount, cgst_rate, sgst_rate, igst_rate, tax_amount, line_total)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        """, (
                            new_id, sl,
                            li.get("description", ""), li.get("hsn_sac", ""),
                            float(li.get("qty", 0)), li.get("unit", ""),
                            float(li.get("rate", 0)), float(li.get("discount_pct", 0)),
                            round(tax_base, 2),
                            float(li.get("cgst_rate", 0)), float(li.get("sgst_rate", 0)),
                            float(li.get("igst_rate", 0)),
                            round(lt - tax_base, 2), round(lt, 2),
                        ))
                    await conn.commit()
            return {"id": new_id, "invoice_number": inv_num, "data_source": "live"}
        except Exception as exc:
            logger.warning("invoices: create failed — %s", exc)

    # Demo fallback
    _demo_counter[0] += 1
    nid = _demo_counter[0]
    inv_num = body.get("invoice_number") or _next_inv_number(today.year, nid)
    inv = {
        "id": nid, "invoice_number": inv_num,
        "invoice_date": body.get("invoice_date", today.isoformat()),
        "due_date":     body.get("due_date", (today + datetime.timedelta(days=30)).isoformat()),
        "customer_name": body.get("customer_name", ""),
        "customer_gstin": body.get("customer_gstin", ""),
        "billing_address": body.get("billing_address", ""),
        "shipping_address": body.get("shipping_address", ""),
        "place_of_supply": body.get("place_of_supply", ""),
        "is_igst": is_igst,
        "subtotal": round(subtotal, 2), "discount_amount": 0,
        "taxable_amount": round(subtotal, 2),
        "cgst_amount": round(cgst, 2), "sgst_amount": round(sgst, 2),
        "igst_amount": round(igst, 2),
        "total_tax": round(cgst + sgst + igst, 2),
        "grand_total": round(grand_total, 2), "paid_amount": 0,
        "status": body.get("status", "DRAFT"),
        "notes": body.get("notes", ""), "terms": body.get("terms", ""),
        "reference_so_number": body.get("reference_so_number", ""),
        "created_by": body.get("created_by", ""),
        "created_at": today.isoformat(),
    }
    _demo_invoices[nid] = inv
    _demo_items[nid]    = lines
    _demo_payments[nid] = []
    return {"id": nid, "invoice_number": inv_num, "data_source": "demo"}


@router.put("/invoices/{inv_id}/status")
async def update_status(inv_id: int, body: dict):
    _init_demo()
    new_status = body.get("status", "")
    if new_status not in _INV_STATUS:
        raise HTTPException(status_code=422, detail=f"Invalid status: {new_status}")
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_tables(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("UPDATE sales_invoices SET status=%s WHERE id=%s", (new_status, inv_id))
                    await conn.commit()
            return {"success": True, "data_source": "live"}
        except Exception as exc:
            logger.warning("invoices: status update failed — %s", exc)

    if inv_id in _demo_invoices:
        _demo_invoices[inv_id]["status"] = new_status
    return {"success": True, "data_source": "demo"}


@router.post("/invoices/{inv_id}/payment")
async def record_payment(inv_id: int, body: dict):
    """Record a full or partial payment against an invoice."""
    _init_demo()
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=422, detail="Payment amount must be > 0")
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_tables(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT grand_total, paid_amount FROM sales_invoices WHERE id=%s", (inv_id,))
                    row = await cur.fetchone()
                    if not row:
                        raise HTTPException(status_code=404, detail="Invoice not found")
                    grand_total, paid = float(row[0]), float(row[1])
                    new_paid = min(paid + amount, grand_total)
                    new_status = "PAID" if new_paid >= grand_total else "PARTIALLY_PAID"
                    await cur.execute(
                        "UPDATE sales_invoices SET paid_amount=%s, status=%s WHERE id=%s",
                        (new_paid, new_status, inv_id)
                    )
                    await cur.execute("""
                        INSERT INTO invoice_payments
                        (invoice_id, amount, payment_date, payment_mode, reference, notes)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, (
                        inv_id, amount,
                        body.get("payment_date", datetime.date.today().isoformat()),
                        body.get("payment_mode", "NEFT"),
                        body.get("reference", ""), body.get("notes", ""),
                    ))
                    await conn.commit()
            return {"success": True, "new_status": new_status, "data_source": "live"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("invoices: payment failed — %s", exc)

    inv = _demo_invoices.get(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    new_paid   = min(float(inv["paid_amount"]) + amount, float(inv["grand_total"]))
    new_status = "PAID" if new_paid >= float(inv["grand_total"]) else "PARTIALLY_PAID"
    inv["paid_amount"] = new_paid
    inv["status"]      = new_status
    _demo_payments.setdefault(inv_id, []).append({
        "id": len(_demo_payments.get(inv_id, [])) + 1,
        "invoice_id": inv_id, "amount": amount,
        "payment_date": body.get("payment_date", datetime.date.today().isoformat()),
        "payment_mode": body.get("payment_mode", "NEFT"),
        "reference": body.get("reference", ""), "notes": body.get("notes", ""),
    })
    return {"success": True, "new_status": new_status, "data_source": "demo"}


@router.delete("/invoices/{inv_id}")
async def delete_invoice(inv_id: int):
    _init_demo()
    pool = await _get_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("DELETE FROM sales_invoices WHERE id=%s AND status='DRAFT'", (inv_id,))
                    if cur.rowcount == 0:
                        raise HTTPException(status_code=422, detail="Only DRAFT invoices can be deleted")
                    await conn.commit()
            return {"success": True, "data_source": "live"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("invoices: delete failed — %s", exc)

    if inv_id in _demo_invoices and _demo_invoices[inv_id]["status"] == "DRAFT":
        del _demo_invoices[inv_id]
        _demo_items.pop(inv_id, None)
        _demo_payments.pop(inv_id, None)
    return {"success": True, "data_source": "demo"}


@router.get("/invoices/utils/state-codes")
async def get_state_codes():
    return {"state_codes": _STATE_CODES}


@router.post("/invoices/{inv_id}/send-email")
async def send_invoice_email(inv_id: int, body: dict):
    recipient = (body.get("recipient_email") or "").strip()
    if not recipient:
        raise HTTPException(status_code=422, detail="recipient_email required")

    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASSWORD", "")

    if not smtp_host or not smtp_user:
        return {"success": True, "simulated": True,
                "message": f"Email to {recipient} simulated — configure SMTP_USER/SMTP_PASSWORD in backend/.env to send real emails."}

    try:
        _init_demo()
        inv = _demo_invoices.get(inv_id, {})
        msg = MIMEMultipart("alternative")
        msg["Subject"] = body.get("subject", f"Invoice {inv.get('invoice_number','')}")
        msg["From"]    = smtp_user
        msg["To"]      = recipient
        html = f"<p>Dear {body.get('recipient_name','Customer')},</p><p>{body.get('message','Please find your invoice attached.')}</p><p>Invoice No: <strong>{inv.get('invoice_number','')}</strong><br/>Amount: ₹{inv.get('grand_total',0):,.2f}</p><p>Regards,<br/>InvenIQ</p>"
        msg.attach(MIMEText(html, "html"))
        def _send():
            with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as s:
                s.ehlo(); s.starttls(); s.ehlo(); s.login(smtp_user, smtp_pass)
                s.sendmail(smtp_user, recipient, msg.as_string())
        import asyncio
        await asyncio.get_event_loop().run_in_executor(None, _send)
        # Mark as SENT if still DRAFT
        await update_status(inv_id, {"status": "SENT"})
        return {"success": True, "message": f"Invoice emailed to {recipient}"}
    except Exception as e:
        return {"success": False, "message": str(e)}
