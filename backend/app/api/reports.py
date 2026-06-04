"""
Reports API — Aggregated management reports: Sales, Purchase, GST, Stock, AR Aging, AP Aging.
DB-first / demo-fallback. All reports support date range filtering.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reports"])

_FY_START = 4  # April


def _fy_bounds(year: Optional[int] = None) -> tuple:
    """Return (start_date, end_date) for current financial year (Apr–Mar)."""
    today = datetime.date.today()
    yr = year or (today.year if today.month >= _FY_START else today.year - 1)
    return datetime.date(yr, _FY_START, 1), datetime.date(yr + 1, 3, 31)


def _parse_dates(from_date: Optional[str], to_date: Optional[str]):
    start, end = _fy_bounds()
    try:
        if from_date:
            start = datetime.date.fromisoformat(from_date)
        if to_date:
            end = datetime.date.fromisoformat(to_date)
    except Exception:
        pass
    return start, end


async def _get_pool():
    try:
        from app.db.connection import get_pool
        return await get_pool()
    except Exception:
        return None


# ── DEMO DATA ──────────────────────────────────────────────────────────────────

def _demo_sales_report(start: datetime.date, end: datetime.date) -> dict:
    rows = [
        {"month": "Apr 2026", "revenue": 1250000, "cgst": 112500, "sgst": 112500, "igst": 0, "total_tax": 225000, "invoices": 8, "customers": 5},
        {"month": "May 2026", "revenue": 980000,  "cgst": 78400,  "sgst": 78400,  "igst": 18000, "total_tax": 174800, "invoices": 6, "customers": 4},
        {"month": "Jun 2026", "revenue": 320000,  "cgst": 24300,  "sgst": 24300,  "igst": 0, "total_tax": 48600, "invoices": 2, "customers": 2},
    ]
    top_customers = [
        {"name": "Vigilant Solutions Pvt. Ltd.", "revenue": 885000, "invoices": 3},
        {"name": "Prestige Developers",          "revenue": 590000, "invoices": 2},
        {"name": "John Holland High School",      "revenue": 318600, "invoices": 1},
    ]
    return {
        "by_month": rows,
        "top_customers": top_customers,
        "summary": {
            "total_revenue": sum(r["revenue"] for r in rows),
            "total_tax":     sum(r["total_tax"] for r in rows),
            "total_invoices": sum(r["invoices"] for r in rows),
        },
        "data_source": "demo",
    }


def _demo_gst_report(start: datetime.date, end: datetime.date) -> dict:
    output = [
        {"rate": "18%", "taxable": 1500000, "cgst": 135000, "sgst": 135000, "igst": 0, "total": 270000},
        {"rate": "18% (IGST)", "taxable": 500000, "cgst": 0, "sgst": 0, "igst": 90000, "total": 90000},
        {"rate": "12%",  "taxable": 50000, "cgst": 3000, "sgst": 3000, "igst": 0, "total": 6000},
    ]
    itc = [
        {"supplier": "Steel Authority of India", "inv": "SICI/2026/0041", "date": "2026-05-10", "igst": 54000, "cgst": 0, "sgst": 0, "total": 54000},
        {"supplier": "HPL Laminates Pvt. Ltd.",  "inv": "HPL/2026/089",   "date": "2026-05-15", "igst": 0, "cgst": 27000, "sgst": 27000, "total": 54000},
        {"supplier": "Ebco Pvt. Ltd.",            "inv": "EBCO/567",       "date": "2026-06-01", "igst": 0, "cgst": 9000,  "sgst": 9000,  "total": 18000},
    ]
    out_total  = sum(r["total"] for r in output)
    itc_total  = sum(r["total"] for r in itc)
    net_payable = max(0, out_total - itc_total)
    due = (datetime.date.today().replace(day=20))
    return {
        "period": f"{start.strftime('%d %b %Y')} – {end.strftime('%d %b %Y')}",
        "output_tax": output,
        "itc": itc,
        "summary": {
            "output_tax_total": out_total,
            "itc_available":    itc_total,
            "net_payable":      net_payable,
            "gstr3b_due_date":  due.isoformat(),
            "filing_status":    "Pending",
        },
        "data_source": "demo",
    }


def _demo_ar_aging(as_of: datetime.date) -> dict:
    rows = [
        {"customer": "Vigilant Solutions",    "total": 885000,  "current": 885000, "d30": 0, "d60": 0, "d90": 0, "d90plus": 0, "status": "Paid"},
        {"customer": "John Holland School",   "total": 318600,  "current": 0,      "d30": 0, "d60": 318600, "d90": 0, "d90plus": 0, "status": "Overdue"},
        {"customer": "Prestige Developers",   "total": 590000,  "current": 590000, "d30": 0, "d60": 0, "d90": 0, "d90plus": 0, "status": "Current"},
        {"customer": "ABC Interiors",         "total": 145000,  "current": 0,      "d30": 145000, "d60": 0, "d90": 0, "d90plus": 0, "status": "Due Soon"},
        {"customer": "Maharashtra Corp",      "total": 78000,   "current": 0,      "d30": 0, "d60": 0, "d90": 0, "d90plus": 78000, "status": "Critical"},
    ]
    return {
        "as_of": as_of.isoformat(),
        "rows": rows,
        "summary": {
            "total_outstanding": sum(r["total"] for r in rows if r["status"] != "Paid"),
            "current":   sum(r["current"] for r in rows),
            "overdue_30": sum(r["d30"] for r in rows),
            "overdue_60": sum(r["d60"] for r in rows),
            "overdue_90plus": sum(r["d90"] + r["d90plus"] for r in rows),
        },
        "data_source": "demo",
    }


def _demo_stock_report() -> dict:
    rows = [
        {"sku": "HPL-1MM-TEAK",   "name": "HPL Sheet 1mm Teak",       "category": "HPL",      "stock": 1200, "unit": "sheet", "rate": 850,   "value": 1020000, "dead_stock_days": 0},
        {"sku": "HPL-1MM-WHITE",  "name": "HPL Sheet 1mm White",       "category": "HPL",      "stock": 340,  "unit": "sheet", "rate": 820,   "value": 278800,  "dead_stock_days": 0},
        {"sku": "ACR-GL-WHITE",   "name": "Acrylic Sheet Gloss White",  "category": "Acrylic",  "stock": 210,  "unit": "sheet", "rate": 1100,  "value": 231000,  "dead_stock_days": 0},
        {"sku": "LOU-ALUM-100",   "name": "Aluminium Louvre 100mm",     "category": "Louvres",  "stock": 85,   "unit": "rft",   "rate": 620,   "value": 52700,   "dead_stock_days": 45},
        {"sku": "HNG-SC-35MM",    "name": "Soft-Close Hinge 35mm",      "category": "Hardware", "stock": 2400, "unit": "nos",   "rate": 180,   "value": 432000,  "dead_stock_days": 0},
        {"sku": "LOU-OPER-MOT",   "name": "Operable Louvre Motorised",  "category": "Louvres",  "stock": 3,    "unit": "nos",   "rate": 28000, "value": 84000,   "dead_stock_days": 92},
    ]
    return {
        "rows": rows,
        "summary": {
            "total_skus": len(rows),
            "total_value": sum(r["value"] for r in rows),
            "dead_stock_count": sum(1 for r in rows if r["dead_stock_days"] > 60),
            "dead_stock_value": sum(r["value"] for r in rows if r["dead_stock_days"] > 60),
        },
        "data_source": "demo",
    }


def _demo_purchase_report(start: datetime.date, end: datetime.date) -> dict:
    rows = [
        {"month": "Apr 2026", "purchases": 920000, "cgst": 82800, "sgst": 82800, "igst": 0, "total_tax": 165600, "pos": 6},
        {"month": "May 2026", "purchases": 740000, "cgst": 0,     "sgst": 0,     "igst": 133200, "total_tax": 133200, "pos": 5},
        {"month": "Jun 2026", "purchases": 310000, "cgst": 27900, "sgst": 27900, "igst": 0, "total_tax": 55800, "pos": 3},
    ]
    top_suppliers = [
        {"name": "Steel Authority of India",  "purchases": 600000, "pos": 4},
        {"name": "HPL Laminates Pvt. Ltd.",   "purchases": 450000, "pos": 3},
        {"name": "Ebco Pvt. Ltd.",             "purchases": 200000, "pos": 3},
    ]
    return {
        "by_month": rows,
        "top_suppliers": top_suppliers,
        "summary": {
            "total_purchases": sum(r["purchases"] for r in rows),
            "total_itc":       sum(r["total_tax"] for r in rows),
            "total_pos":       sum(r["pos"] for r in rows),
        },
        "data_source": "demo",
    }


# ── API Endpoints ──────────────────────────────────────────────────────────────

@router.get("/reports/sales")
async def sales_report(from_date: Optional[str] = None, to_date: Optional[str] = None):
    start, end = _parse_dates(from_date, to_date)
    pool = await _get_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT
                            DATE_FORMAT(invoice_date, '%b %Y') AS month,
                            SUM(subtotal) AS revenue,
                            SUM(cgst_amount) AS cgst,
                            SUM(sgst_amount) AS sgst,
                            SUM(igst_amount) AS igst,
                            SUM(total_tax)   AS total_tax,
                            COUNT(*) AS invoices,
                            COUNT(DISTINCT customer_name) AS customers
                        FROM sales_invoices
                        WHERE invoice_date BETWEEN %s AND %s
                          AND status NOT IN ('CANCELLED','DRAFT')
                        GROUP BY DATE_FORMAT(invoice_date, '%%Y-%%m'), month
                        ORDER BY MIN(invoice_date)
                    """, (start, end))
                    cols = [d[0] for d in cur.description]
                    rows = [dict(zip(cols, r)) for r in await cur.fetchall()]
                    for r in rows:
                        for k in ("revenue","cgst","sgst","igst","total_tax"):
                            r[k] = float(r.get(k, 0) or 0)

                    await cur.execute("""
                        SELECT customer_name, SUM(grand_total) AS revenue, COUNT(*) AS invoices
                        FROM sales_invoices
                        WHERE invoice_date BETWEEN %s AND %s AND status NOT IN ('CANCELLED','DRAFT')
                        GROUP BY customer_name ORDER BY revenue DESC LIMIT 10
                    """, (start, end))
                    top = [dict(zip([d[0] for d in cur.description], r)) for r in await cur.fetchall()]
                    for t in top:
                        t["revenue"] = float(t.get("revenue", 0) or 0)

                    return {
                        "by_month": rows, "top_customers": top,
                        "summary": {
                            "total_revenue": sum(r["revenue"] for r in rows),
                            "total_tax":     sum(r["total_tax"] for r in rows),
                            "total_invoices": sum(r["invoices"] for r in rows),
                        },
                        "data_source": "live",
                    }
        except Exception as exc:
            logger.warning("reports/sales DB failed: %s", exc)

    return _demo_sales_report(start, end)


@router.get("/reports/gst-summary")
async def gst_summary(from_date: Optional[str] = None, to_date: Optional[str] = None):
    start, end = _parse_dates(from_date, to_date)
    pool = await _get_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    # Output tax from sales invoices
                    await cur.execute("""
                        SELECT
                            CASE WHEN is_igst=1 THEN CONCAT(ROUND(igst_amount/NULLIF(taxable_amount,0)*100,0),'% IGST')
                                 ELSE CONCAT(ROUND((cgst_amount+sgst_amount)/NULLIF(taxable_amount,0)*100,0),'%') END AS rate,
                            SUM(taxable_amount) AS taxable,
                            SUM(cgst_amount) AS cgst, SUM(sgst_amount) AS sgst, SUM(igst_amount) AS igst,
                            SUM(total_tax) AS total
                        FROM sales_invoices
                        WHERE invoice_date BETWEEN %s AND %s AND status NOT IN ('CANCELLED','DRAFT')
                        GROUP BY rate
                    """, (start, end))
                    out_cols = [d[0] for d in cur.description]
                    output   = [dict(zip(out_cols, r)) for r in await cur.fetchall()]
                    for r in output:
                        for k in ("taxable","cgst","sgst","igst","total"):
                            r[k] = float(r.get(k, 0) or 0)

                    # ITC from purchase invoices
                    await cur.execute("""
                        SELECT vendor_name AS supplier, pi_number AS inv, invoice_date AS date,
                               gst_amount AS total
                        FROM purchase_invoices
                        WHERE invoice_date BETWEEN %s AND %s AND status='APPROVED'
                        ORDER BY invoice_date
                    """, (start, end))
                    itc_cols = [d[0] for d in cur.description]
                    itc = [dict(zip(itc_cols, r)) for r in await cur.fetchall()]
                    for r in itc:
                        r["total"] = float(r.get("total", 0) or 0)
                        r["igst"] = r["total"]; r["cgst"] = 0; r["sgst"] = 0

                    out_total  = sum(r["total"] for r in output)
                    itc_total  = sum(r["total"] for r in itc)
                    today = datetime.date.today()
                    due = today.replace(day=20)
                    if today.day > 20:
                        m = today.month + 1
                        y = today.year + (1 if m > 12 else 0)
                        due = today.replace(year=y, month=m % 12 or 12, day=20)

                    return {
                        "period": f"{start.strftime('%d %b %Y')} – {end.strftime('%d %b %Y')}",
                        "output_tax": output, "itc": itc,
                        "summary": {
                            "output_tax_total": out_total,
                            "itc_available":    itc_total,
                            "net_payable":      max(0, out_total - itc_total),
                            "gstr3b_due_date":  due.isoformat(),
                            "filing_status":    "Pending",
                        },
                        "data_source": "live",
                    }
        except Exception as exc:
            logger.warning("reports/gst DB failed: %s", exc)

    return _demo_gst_report(start, end)


@router.get("/reports/ar-aging")
async def ar_aging(as_of: Optional[str] = None):
    today = datetime.date.today()
    try:
        ref = datetime.date.fromisoformat(as_of) if as_of else today
    except Exception:
        ref = today

    pool = await _get_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT customer_name,
                            SUM(grand_total - paid_amount) AS outstanding,
                            SUM(CASE WHEN DATEDIFF(%s, due_date) <= 0 THEN grand_total - paid_amount ELSE 0 END) AS current_amt,
                            SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 1 AND 30 THEN grand_total - paid_amount ELSE 0 END) AS d30,
                            SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 31 AND 60 THEN grand_total - paid_amount ELSE 0 END) AS d60,
                            SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 61 AND 90 THEN grand_total - paid_amount ELSE 0 END) AS d90,
                            SUM(CASE WHEN DATEDIFF(%s, due_date) > 90 THEN grand_total - paid_amount ELSE 0 END) AS d90plus
                        FROM sales_invoices
                        WHERE status NOT IN ('PAID','CANCELLED')
                        GROUP BY customer_name
                        HAVING outstanding > 0
                        ORDER BY outstanding DESC
                    """, (ref, ref, ref, ref, ref))
                    cols = [d[0] for d in cur.description]
                    rows = [dict(zip(cols, r)) for r in await cur.fetchall()]
                    for r in rows:
                        for k in ("outstanding","current_amt","d30","d60","d90","d90plus"):
                            r[k] = float(r.get(k, 0) or 0)
                    return {
                        "as_of": ref.isoformat(),
                        "rows": rows,
                        "summary": {
                            "total_outstanding": sum(r["outstanding"] for r in rows),
                            "current":           sum(r["current_amt"] for r in rows),
                            "overdue_30":        sum(r["d30"] for r in rows),
                            "overdue_60":        sum(r["d60"] for r in rows),
                            "overdue_90plus":    sum(r["d90"] + r["d90plus"] for r in rows),
                        },
                        "data_source": "live",
                    }
        except Exception as exc:
            logger.warning("reports/ar-aging DB failed: %s", exc)

    return _demo_ar_aging(ref)


@router.get("/reports/stock")
async def stock_report():
    pool = await _get_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT
                            p.sku, p.name, p.category,
                            COALESCE(SUM(CASE WHEN sm.movement_type IN ('GRN_RECEIPT','QC_ACCEPT') THEN sm.qty_in ELSE 0 END)
                                   - SUM(CASE WHEN sm.movement_type IN ('SALE_DISPATCH','QC_REJECT') THEN sm.qty_out ELSE 0 END), 0) AS stock,
                            p.unit,
                            p.sell_price AS rate,
                            COALESCE(SUM(CASE WHEN sm.movement_type IN ('GRN_RECEIPT','QC_ACCEPT') THEN sm.qty_in ELSE 0 END)
                                   - SUM(CASE WHEN sm.movement_type IN ('SALE_DISPATCH','QC_REJECT') THEN sm.qty_out ELSE 0 END), 0) * p.sell_price AS value,
                            DATEDIFF(NOW(), MAX(sm.created_at)) AS dead_stock_days
                        FROM products p
                        LEFT JOIN stock_movements sm ON sm.product_id = p.product_id
                        GROUP BY p.sku, p.name, p.category, p.unit, p.sell_price
                        ORDER BY value DESC LIMIT 200
                    """)
                    cols = [d[0] for d in cur.description]
                    rows = [dict(zip(cols, r)) for r in await cur.fetchall()]
                    for r in rows:
                        r["stock"]          = float(r.get("stock", 0) or 0)
                        r["rate"]           = float(r.get("rate", 0) or 0)
                        r["value"]          = float(r.get("value", 0) or 0)
                        r["dead_stock_days"] = int(r.get("dead_stock_days", 0) or 0)
                    return {
                        "rows": rows,
                        "summary": {
                            "total_skus": len(rows),
                            "total_value": sum(r["value"] for r in rows),
                            "dead_stock_count": sum(1 for r in rows if r["dead_stock_days"] > 60),
                            "dead_stock_value": sum(r["value"] for r in rows if r["dead_stock_days"] > 60),
                        },
                        "data_source": "live",
                    }
        except Exception as exc:
            logger.warning("reports/stock DB failed: %s", exc)

    return _demo_stock_report()


@router.get("/reports/purchase")
async def purchase_report(from_date: Optional[str] = None, to_date: Optional[str] = None):
    start, end = _parse_dates(from_date, to_date)
    pool = await _get_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("""
                        SELECT DATE_FORMAT(created_at,'%b %Y') AS month,
                            SUM(total_amount) AS purchases, SUM(gst_amount) AS total_tax, COUNT(*) AS pos
                        FROM purchase_orders
                        WHERE created_at BETWEEN %s AND %s AND status NOT IN ('CANCELLED','DRAFT')
                        GROUP BY DATE_FORMAT(created_at,'%%Y-%%m'), month
                        ORDER BY MIN(created_at)
                    """, (start, end))
                    c = [d[0] for d in cur.description]
                    rows = [dict(zip(c, r)) for r in await cur.fetchall()]
                    for r in rows:
                        r["purchases"] = float(r.get("purchases", 0) or 0)
                        r["total_tax"] = float(r.get("total_tax", 0) or 0)
                        r["cgst"] = r["sgst"] = r["igst"] = 0

                    await cur.execute("""
                        SELECT supplier_name AS name, SUM(total_amount) AS purchases, COUNT(*) AS pos
                        FROM purchase_orders WHERE created_at BETWEEN %s AND %s
                          AND status NOT IN ('CANCELLED','DRAFT')
                        GROUP BY supplier_name ORDER BY purchases DESC LIMIT 10
                    """, (start, end))
                    tc = [d[0] for d in cur.description]
                    top = [dict(zip(tc, r)) for r in await cur.fetchall()]
                    for t in top:
                        t["purchases"] = float(t.get("purchases", 0) or 0)

                    return {
                        "by_month": rows, "top_suppliers": top,
                        "summary": {
                            "total_purchases": sum(r["purchases"] for r in rows),
                            "total_itc":       sum(r["total_tax"] for r in rows),
                            "total_pos":       sum(r["pos"] for r in rows),
                        },
                        "data_source": "live",
                    }
        except Exception as exc:
            logger.warning("reports/purchase DB failed: %s", exc)

    return _demo_purchase_report(start, end)
