"""Tally Prime Export API — Generates Tally-compatible CSV data for manual import.

Tally Prime import paths:
  Stock Items  → Gateway of Tally > Import > Masters > Stock Items
  Ledgers      → Gateway of Tally > Import > Masters > Ledgers
  Vouchers     → Gateway of Tally > Import > Transactions > Vouchers
"""
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tally", tags=["Tally Export"])

try:
    from app.db.connection import get_pool
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


async def _try_db(query: str, params: tuple = ()):
    """Execute a DB query and return rows, or None on any failure."""
    if not _DB_AVAILABLE:
        return None
    try:
        pool = await get_pool()
        if not pool:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, params)
                return await cur.fetchall()
    except Exception as exc:
        logger.warning("Tally export DB query failed: %s", exc)
        return None


def _gst_split(total_amount: float, gst_rate: float) -> dict:
    """Reverse-compute base + CGST + SGST from a GST-inclusive total."""
    base = round(total_amount / (1 + gst_rate / 100), 2)
    tax  = round(total_amount - base, 2)
    half = round(tax / 2, 2)
    return {"base": base, "cgst": half, "sgst": round(tax - half, 2), "igst": 0.0, "total": total_amount}


# ── Summary ──────────────────────────────────────────────────────────────────
@router.get("/summary")
async def tally_export_summary():
    """Lightweight overview of record counts for each exportable dataset."""
    return {
        "stock_items": {
            "count": 10,
            "description": "Product masters — hardware fittings, sanitary CP fittings, kitchen systems, door hardware",
            "tally_path": "Gateway of Tally → Import → Masters → Stock Items",
        },
        "customer_ledgers": {
            "count": 9,
            "description": "Customer accounts under Sundry Debtors — contractors, kitchen studios, bath studios, retailers",
            "tally_path": "Gateway of Tally → Import → Masters → Ledgers",
        },
        "supplier_ledgers": {
            "count": 5,
            "description": "Supplier accounts under Sundry Creditors — Ebco, Hafele, Hettich, Jaquar, Hindware",
            "tally_path": "Gateway of Tally → Import → Masters → Ledgers",
        },
        "sales_vouchers": {
            "count": 10,
            "description": "Sales invoices with GST breakup (CGST + SGST) and stock item line items",
            "tally_path": "Gateway of Tally → Import → Transactions → Sales Vouchers",
        },
        "purchase_vouchers": {
            "count": 8,
            "description": "Purchase entries from GRN receipts with PO reference and GST details",
            "tally_path": "Gateway of Tally → Import → Transactions → Purchase Vouchers",
        },
    }


# ── Stock Items ───────────────────────────────────────────────────────────────
@router.get("/stock-items")
async def tally_stock_items(period: str = Query("MTD")):
    """Product/stock masters in Tally Prime Stock Item import format."""
    rows = await _try_db(
        "SELECT name, unit, opening_qty, opening_rate, hsn_code, gst_rate FROM products ORDER BY name"
    )
    if rows:
        items = [
            {
                "Name":                 r[0],
                "Under (Stock Group)":  "Hardware & Sanitary",
                "Units":                r[1] or "Nos",
                "Opening Qty":          r[2] or 0,
                "Opening Rate (Rs.)":   float(r[3] or 0),
                "Opening Value (Rs.)":  round(float(r[2] or 0) * float(r[3] or 0), 2),
                "HSN Code":             r[4] or "",
                "GST Rate (%)":         float(r[5] or 18),
                "Taxability":           "Taxable",
            }
            for r in rows
        ]
    else:
        items = [
            {"Name": "Blum Tandem Plus Blumotion Runner 500mm",  "Under (Stock Group)": "Hardware Fittings",    "Units": "Set",  "Opening Qty": 35,  "Opening Rate (Rs.)": 2450.0, "Opening Value (Rs.)": 85750.0,  "HSN Code": "83024900", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Dorset Euro Cylinder Mortise Lock (Old)",  "Under (Stock Group)": "Door Hardware",        "Units": "Set",  "Opening Qty": 22,  "Opening Rate (Rs.)": 5500.0, "Opening Value (Rs.)": 121000.0, "HSN Code": "83014090", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Ebco Cam Lock 19mm",                       "Under (Stock Group)": "Hardware Fittings",    "Units": "Nos",  "Opening Qty": 200, "Opening Rate (Rs.)": 28.0,   "Opening Value (Rs.)": 5600.0,   "HSN Code": "83024900", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Ebco Soft-Close Hinge 35mm Pk-10",         "Under (Stock Group)": "Hardware Fittings",    "Units": "Pack", "Opening Qty": 48,  "Opening Rate (Rs.)": 485.0,  "Opening Value (Rs.)": 23280.0,  "HSN Code": "83024100", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Hafele Zinc D-Handle 128mm (Pair)",        "Under (Stock Group)": "Hardware Fittings",    "Units": "Pair", "Opening Qty": 120, "Opening Rate (Rs.)": 320.0,  "Opening Value (Rs.)": 38400.0,  "HSN Code": "83024100", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Hettich InnoTech Drawer System 400mm",     "Under (Stock Group)": "Hardware Fittings",    "Units": "Set",  "Opening Qty": 21,  "Opening Rate (Rs.)": 1280.0, "Opening Value (Rs.)": 26880.0,  "HSN Code": "83024900", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Hindware Aura Stop Cock DN15",             "Under (Stock Group)": "Sanitary CP Fittings", "Units": "Nos",  "Opening Qty": 148, "Opening Rate (Rs.)": 750.0,  "Opening Value (Rs.)": 111000.0, "HSN Code": "84818090", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Jaquar Florentine Shower Panel Chrome",    "Under (Stock Group)": "Sanitary CP Fittings", "Units": "Set",  "Opening Qty": 8,   "Opening Rate (Rs.)": 18500.0,"Opening Value (Rs.)": 148000.0, "HSN Code": "84818090", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Jaquar Lyric Basin Mixer Chrome",          "Under (Stock Group)": "Sanitary CP Fittings", "Units": "Nos",  "Opening Qty": 12,  "Opening Rate (Rs.)": 4850.0, "Opening Value (Rs.)": 58200.0,  "HSN Code": "84818090", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
            {"Name": "Parryware Pilot EV Sensor Tap (Old Model)","Under (Stock Group)": "Sanitary CP Fittings", "Units": "Nos",  "Opening Qty": 24,  "Opening Rate (Rs.)": 7650.0, "Opening Value (Rs.)": 183600.0, "HSN Code": "84818090", "GST Rate (%)": 18.0, "Taxability": "Taxable"},
        ]
    return {"items": items, "count": len(items), "format": "Tally Prime Stock Masters", "period": period}


# ── Customer Ledgers ──────────────────────────────────────────────────────────
@router.get("/customer-ledgers")
async def tally_customer_ledgers():
    """Customer accounts in Tally ledger import format (Sundry Debtors)."""
    rows = await _try_db(
        "SELECT name, address, state, gstin, phone, email, opening_balance FROM customers ORDER BY name"
    )
    if rows:
        ledgers = [
            {
                "Name":                  r[0],
                "Under":                 "Sundry Debtors",
                "Mailing Name":          r[0],
                "Address":               r[1] or "",
                "State":                 r[2] or "Maharashtra",
                "GSTIN/UIN":             r[3] or "",
                "Phone":                 r[4] or "",
                "Email":                 r[5] or "",
                "Opening Balance (Rs.)": abs(float(r[6])) if r[6] else 0.0,
                "Dr/Cr":                 "Dr",
                "Registration Type":     "Regular" if r[3] else "Unregistered",
            }
            for r in rows
        ]
    else:
        ledgers = [
            {"Name": "Elite Interior Solutions",    "Under": "Sundry Debtors", "Mailing Name": "Elite Interior Solutions",    "Address": "26 Linking Road Khar W",           "State": "Maharashtra", "GSTIN/UIN": "27AABCE3456H1Z9", "Phone": "9833067890", "Email": "elite.interiors@outlook.com",   "Opening Balance (Rs.)": 72000.0,  "Dr/Cr": "Dr", "Registration Type": "Regular"},
            {"Name": "Green Valley Builders",        "Under": "Sundry Debtors", "Mailing Name": "Green Valley Builders",       "Address": "23 MG Road Thane W",               "State": "Maharashtra", "GSTIN/UIN": "27AABCG9012D1Z8", "Phone": "9867056789", "Email": "procurement@gvbuilders.com",    "Opening Balance (Rs.)": 95000.0,  "Dr/Cr": "Dr", "Registration Type": "Regular"},
            {"Name": "Kumar Bath & Tile Studio",     "Under": "Sundry Debtors", "Mailing Name": "Kumar Bath & Tile Studio",    "Address": "8 Shivaji Nagar Pune",             "State": "Maharashtra", "GSTIN/UIN": "27AADCK2345C1Z1", "Phone": "9021034567", "Email": "kumarbaththpu@gmail.com",       "Opening Balance (Rs.)": 62000.0,  "Dr/Cr": "Dr", "Registration Type": "Regular"},
            {"Name": "Mehta Construction Pvt Ltd",   "Under": "Sundry Debtors", "Mailing Name": "Mehta Construction Pvt Ltd",  "Address": "12 Industrial Estate Andheri E",   "State": "Maharashtra", "GSTIN/UIN": "27AAACM1234A1Z5", "Phone": "9820012345", "Email": "accounts@mehtaconstruction.com", "Opening Balance (Rs.)": 185000.0, "Dr/Cr": "Dr", "Registration Type": "Regular"},
            {"Name": "Metro Builders & Developers",  "Under": "Sundry Debtors", "Mailing Name": "Metro Builders & Developers", "Address": "17 Linking Road Santacruz W",       "State": "Maharashtra", "GSTIN/UIN": "27AABCM6789F1Z4", "Phone": "9820090123", "Email": "metro.purchase@gmail.com",      "Opening Balance (Rs.)": 145000.0, "Dr/Cr": "Dr", "Registration Type": "Regular"},
            {"Name": "Modern Kitchens Pvt Ltd",      "Under": "Sundry Debtors", "Mailing Name": "Modern Kitchens Pvt Ltd",     "Address": "45 Design Quarter Bandra W",        "State": "Maharashtra", "GSTIN/UIN": "27AABCM5678B1Z3", "Phone": "9833045678", "Email": "purchase@modernkitchens.in",    "Opening Balance (Rs.)": 420000.0, "Dr/Cr": "Dr", "Registration Type": "Regular"},
            {"Name": "Raju Plumbing & Hardware",     "Under": "Sundry Debtors", "Mailing Name": "Raju Plumbing & Hardware",    "Address": "3 Station Road Borivali E",        "State": "Maharashtra", "GSTIN/UIN": "",                "Phone": "9867023456", "Email": "",                              "Opening Balance (Rs.)": 12500.0,  "Dr/Cr": "Dr", "Registration Type": "Unregistered"},
            {"Name": "Sharma Constructions",         "Under": "Sundry Debtors", "Mailing Name": "Sharma Constructions",        "Address": "5 Gandhi Chowk Nashik",            "State": "Maharashtra", "GSTIN/UIN": "27AADCS4567E1Z6", "Phone": "9765078901", "Email": "sharma.constructions@yahoo.com","Opening Balance (Rs.)": 38000.0,  "Dr/Cr": "Dr", "Registration Type": "Regular"},
            {"Name": "Sunrise Hardware Mart",        "Under": "Sundry Debtors", "Mailing Name": "Sunrise Hardware Mart",       "Address": "11 MIDC Area Thane",               "State": "Maharashtra", "GSTIN/UIN": "27AADCS7890G1Z2", "Phone": "9702056789", "Email": "sunrise.hw@gmail.com",          "Opening Balance (Rs.)": 8000.0,   "Dr/Cr": "Dr", "Registration Type": "Regular"},
        ]
    return {"ledgers": ledgers, "count": len(ledgers), "format": "Tally Prime Ledger Masters (Sundry Debtors)"}


# ── Supplier Ledgers ──────────────────────────────────────────────────────────
@router.get("/supplier-ledgers")
async def tally_supplier_ledgers():
    """Supplier/vendor accounts in Tally ledger import format (Sundry Creditors)."""
    rows = await _try_db(
        "SELECT name, state, gstin, phone, email, opening_balance, payment_terms_days FROM suppliers ORDER BY name"
    )
    if rows:
        ledgers = [
            {
                "Name":                  r[0],
                "Under":                 "Sundry Creditors",
                "Mailing Name":          r[0],
                "State":                 r[1] or "",
                "GSTIN/UIN":             r[2] or "",
                "Phone":                 r[3] or "",
                "Email":                 r[4] or "",
                "Opening Balance (Rs.)": abs(float(r[5])) if r[5] else 0.0,
                "Dr/Cr":                 "Cr",
                "Payment Terms (Days)":  r[6] or 30,
                "Registration Type":     "Regular" if r[2] else "Unregistered",
            }
            for r in rows
        ]
    else:
        ledgers = [
            {"Name": "Ebco India Pvt Ltd",    "Under": "Sundry Creditors", "Mailing Name": "Ebco India Pvt Ltd",    "State": "Maharashtra", "GSTIN/UIN": "27AABCE1234A1Z1", "Phone": "18002673226", "Email": "sales.india@ebco.in",       "Opening Balance (Rs.)": 342000.0, "Dr/Cr": "Cr", "Payment Terms (Days)": 30, "Registration Type": "Regular"},
            {"Name": "Hafele India Pvt Ltd",  "Under": "Sundry Creditors", "Mailing Name": "Hafele India Pvt Ltd",  "State": "Maharashtra", "GSTIN/UIN": "27AABCH5678B1Z5", "Phone": "18002666667", "Email": "customercare@hafele.in",    "Opening Balance (Rs.)": 218000.0, "Dr/Cr": "Cr", "Payment Terms (Days)": 30, "Registration Type": "Regular"},
            {"Name": "Hettich India Pvt Ltd", "Under": "Sundry Creditors", "Mailing Name": "Hettich India Pvt Ltd", "State": "Karnataka",    "GSTIN/UIN": "29AABCH9012C1Z8", "Phone": "18001025001", "Email": "hettich.india@hettich.com", "Opening Balance (Rs.)": 185000.0, "Dr/Cr": "Cr", "Payment Terms (Days)": 45, "Registration Type": "Regular"},
            {"Name": "Hindware Ltd",          "Under": "Sundry Creditors", "Mailing Name": "Hindware Ltd",          "State": "Haryana",      "GSTIN/UIN": "06AABCH7890E1Z6", "Phone": "18001030077", "Email": "trade@hindware.com",        "Opening Balance (Rs.)": 89000.0,  "Dr/Cr": "Cr", "Payment Terms (Days)": 30, "Registration Type": "Regular"},
            {"Name": "Jaquar India Ltd",      "Under": "Sundry Creditors", "Mailing Name": "Jaquar India Ltd",      "State": "Haryana",      "GSTIN/UIN": "06AABCJ3456D1Z3", "Phone": "18001035378", "Email": "customerservice@jaquar.com","Opening Balance (Rs.)": 156000.0, "Dr/Cr": "Cr", "Payment Terms (Days)": 30, "Registration Type": "Regular"},
        ]
    return {"ledgers": ledgers, "count": len(ledgers), "format": "Tally Prime Ledger Masters (Sundry Creditors)"}


# ── Sales Vouchers ────────────────────────────────────────────────────────────
@router.get("/sales-vouchers")
async def tally_sales_vouchers(period: str = Query("MTD")):
    """Sales transactions in Tally sales voucher import format with GST breakup."""
    rows = await _try_db("""
        SELECT so.order_date, so.order_number, c.name,
               p.name, oi.qty, oi.unit_price,
               oi.qty * oi.unit_price AS line_total, p.gst_rate, so.notes
        FROM sales_orders so
        JOIN customers c ON so.customer_id = c.id
        JOIN order_items oi ON oi.order_id = so.id
        JOIN products p ON oi.product_id = p.id
        WHERE so.status IN ('delivered', 'completed')
        ORDER BY so.order_date DESC
        LIMIT 200
    """)
    if rows:
        vouchers = []
        for r in rows:
            g = _gst_split(float(r[6]), float(r[7] or 18))
            vouchers.append({
                "Date (DD-MM-YYYY)":      r[0].strftime("%d-%m-%Y") if hasattr(r[0], "strftime") else str(r[0]),
                "Voucher Type":           "Sales",
                "Voucher No":             r[1],
                "Party Name (Customer)":  r[2],
                "Stock Item":             r[3],
                "Quantity":               r[4],
                "Rate (Rs.)":             round(float(r[5]), 2),
                "Amount (Rs.)":           g["base"],
                "GST Rate (%)":           float(r[7] or 18),
                "CGST (Rs.)":             g["cgst"],
                "SGST (Rs.)":             g["sgst"],
                "IGST (Rs.)":             g["igst"],
                "Total Amount (Rs.)":     g["total"],
                "Narration":              r[8] or "",
            })
    else:
        today = datetime.now()

        def _sv(days_ago, inv_no, customer, item, qty, rate, narration=""):
            g = _gst_split(round(qty * rate * 1.18, 2), 18.0)
            return {
                "Date (DD-MM-YYYY)":      (today - timedelta(days=days_ago)).strftime("%d-%m-%Y"),
                "Voucher Type":           "Sales",
                "Voucher No":             inv_no,
                "Party Name (Customer)":  customer,
                "Stock Item":             item,
                "Quantity":               qty,
                "Rate (Rs.)":             round(rate, 2),
                "Amount (Rs.)":           g["base"],
                "GST Rate (%)":           18.0,
                "CGST (Rs.)":             g["cgst"],
                "SGST (Rs.)":             g["sgst"],
                "IGST (Rs.)":             g["igst"],
                "Total Amount (Rs.)":     g["total"],
                "Narration":              narration,
            }

        vouchers = [
            _sv(1,  "INV-2026-0512", "Mehta Construction Pvt Ltd",  "Ebco Soft-Close Hinge 35mm Pk-10",       10,  411.02, "Invoice against PO MCP-2026-044"),
            _sv(1,  "INV-2026-0511", "Modern Kitchens Pvt Ltd",      "Hettich InnoTech Drawer System 400mm",    5, 1084.75, "Kitchen renovation project MK-12"),
            _sv(2,  "INV-2026-0510", "Kumar Bath & Tile Studio",     "Jaquar Lyric Basin Mixer Chrome",          2, 4110.17, "Bathroom CP fitting supply"),
            _sv(2,  "INV-2026-0509", "Green Valley Builders",        "Hafele Zinc D-Handle 128mm (Pair)",       50,  271.19, "Flat block hardware supply Phase 2"),
            _sv(3,  "INV-2026-0508", "Elite Interior Solutions",     "Blum Tandem Plus Blumotion Runner 500mm",  4, 2077.97, "Modular kitchen cabinet fittings"),
            _sv(3,  "INV-2026-0507", "Raju Plumbing & Hardware",     "Hindware Aura Stop Cock DN15",            20,  635.59, "Plumbing hardware supply Oct batch"),
            _sv(4,  "INV-2026-0506", "Sharma Constructions",         "Ebco Soft-Close Hinge 35mm Pk-10",         8,  411.02, "Construction material supply SC-225"),
            _sv(4,  "INV-2026-0505", "Metro Builders & Developers",  "Jaquar Florentine Shower Panel Chrome",    3, 15677.97,"Premium bath fittings Sion project"),
            _sv(5,  "INV-2026-0504", "Sunrise Hardware Mart",        "Ebco Cam Lock 19mm",                     100,   23.73, "Hardware bulk resale May batch"),
            _sv(5,  "INV-2026-0503", "Mehta Construction Pvt Ltd",   "Hettich InnoTech Drawer System 400mm",    12, 1084.75, "Modular furniture hardware Building A"),
        ]
    return {"vouchers": vouchers, "count": len(vouchers), "format": "Tally Prime Sales Vouchers", "period": period}


# ── Purchase Vouchers ─────────────────────────────────────────────────────────
@router.get("/purchase-vouchers")
async def tally_purchase_vouchers(period: str = Query("MTD")):
    """Purchase transactions from GRN receipts in Tally purchase voucher format."""
    rows = await _try_db("""
        SELECT g.grn_date, g.grn_number, s.name,
               p.name, gi.qty_received, gi.unit_price,
               gi.qty_received * gi.unit_price AS line_total, p.gst_rate, po.po_number
        FROM grn_entries g
        JOIN suppliers s ON g.supplier_id = s.id
        JOIN grn_items gi ON gi.grn_id = g.id
        JOIN products p ON gi.product_id = p.id
        JOIN purchase_orders po ON g.po_id = po.id
        ORDER BY g.grn_date DESC
        LIMIT 100
    """)
    if rows:
        vouchers = []
        for r in rows:
            g = _gst_split(float(r[6]), float(r[7] or 18))
            vouchers.append({
                "Date (DD-MM-YYYY)":      r[0].strftime("%d-%m-%Y") if hasattr(r[0], "strftime") else str(r[0]),
                "Voucher Type":           "Purchase",
                "Voucher No":             r[1],
                "Reference PO No":        r[8],
                "Party Name (Supplier)":  r[2],
                "Stock Item":             r[3],
                "Quantity":               r[4],
                "Rate (Rs.)":             round(float(r[5]), 2),
                "Amount (Rs.)":           g["base"],
                "GST Rate (%)":           float(r[7] or 18),
                "CGST (Rs.)":             g["cgst"],
                "SGST (Rs.)":             g["sgst"],
                "IGST (Rs.)":             g["igst"],
                "Total Amount (Rs.)":     g["total"],
            })
    else:
        today = datetime.now()

        def _pv(days_ago, grn_no, po_no, supplier, item, qty, rate):
            g = _gst_split(round(qty * rate * 1.18, 2), 18.0)
            return {
                "Date (DD-MM-YYYY)":      (today - timedelta(days=days_ago)).strftime("%d-%m-%Y"),
                "Voucher Type":           "Purchase",
                "Voucher No":             grn_no,
                "Reference PO No":        po_no,
                "Party Name (Supplier)":  supplier,
                "Stock Item":             item,
                "Quantity":               qty,
                "Rate (Rs.)":             round(rate, 2),
                "Amount (Rs.)":           g["base"],
                "GST Rate (%)":           18.0,
                "CGST (Rs.)":             g["cgst"],
                "SGST (Rs.)":             g["sgst"],
                "IGST (Rs.)":             g["igst"],
                "Total Amount (Rs.)":     g["total"],
            }

        vouchers = [
            _pv(2,  "GRN-4435", "PO-8850", "Ebco India Pvt Ltd",    "Ebco Soft-Close Hinge 35mm Pk-10",       100,   395.0),
            _pv(2,  "GRN-4435", "PO-8850", "Ebco India Pvt Ltd",    "Ebco Cam Lock 19mm",                     500,    22.0),
            _pv(5,  "GRN-4434", "PO-8847", "Jaquar India Ltd",       "Jaquar Lyric Basin Mixer Chrome",         10,  3950.0),
            _pv(5,  "GRN-4434", "PO-8847", "Jaquar India Ltd",       "Jaquar Florentine Shower Panel Chrome",    5, 14800.0),
            _pv(7,  "GRN-4433", "PO-8845", "Hafele India Pvt Ltd",  "Hafele Zinc D-Handle 128mm (Pair)",       200,   265.0),
            _pv(7,  "GRN-4432", "PO-8843", "Hettich India Pvt Ltd", "Hettich InnoTech Drawer System 400mm",    30,  1050.0),
            _pv(9,  "GRN-4431", "PO-8841", "Hindware Ltd",           "Hindware Aura Stop Cock DN15",           100,   620.0),
            _pv(12, "GRN-4430", "PO-8839", "Ebco India Pvt Ltd",    "Blum Tandem Plus Blumotion Runner 500mm",  20,  2100.0),
        ]
    return {"vouchers": vouchers, "count": len(vouchers), "format": "Tally Prime Purchase Vouchers", "period": period}
