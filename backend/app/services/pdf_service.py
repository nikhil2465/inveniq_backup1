"""
Quotation PDF generator using fpdf2.
Pure Python, no system dependencies, works on Windows.
Returns bytes ready for email attachment or file download.
"""
import io
import logging
from datetime import date

logger = logging.getLogger(__name__)


def generate_quote_pdf(quote: dict) -> bytes:
    """
    Generate a professional A4 PDF for a quotation.
    Accepts the same dict shape returned by get_quote_db() / mock_quotes().
    Returns PDF as bytes.
    """
    try:
        from fpdf import FPDF, XPos, YPos
    except ImportError:
        logger.error("fpdf2 not installed — run: pip install fpdf2")
        raise

    # ── text helpers ──────────────────────────────────────────────────────────

    def _s(text, fallback="-") -> str:
        """Sanitize for Helvetica (Latin-1): strip, replace Unicode glyphs."""
        raw = str(text or "").strip()
        if not raw:
            return fallback
        return (
            raw
            .replace("—", "-")   # em dash
            .replace("–", "-")   # en dash
            .replace("’", "'").replace("‘", "'")
            .replace("“", '"').replace("”", '"')
            .replace("₹", "Rs.") # rupee sign
            .replace("•", "*")   # bullet
            .encode("latin-1", errors="replace")
            .decode("latin-1")
        )

    def fmt_inr(v) -> str:
        try:
            n = float(v or 0)
            if n >= 100_000:
                return f"Rs.{n/100000:.2f}L"
            return f"Rs.{n:,.0f}"
        except Exception:
            return _s(v, "Rs.0")

    # ── extract quote fields ──────────────────────────────────────────────────

    quote_number = _s(quote.get("quote_number"), "DRAFT")
    customer     = _s(quote.get("customer_name"))
    contact      = _s(quote.get("contact_person"), "")
    phone        = _s(quote.get("contact_phone"), "")
    email_addr   = _s(quote.get("contact_email"), "")
    gst_no       = _s(quote.get("gst_number"), "")
    billing_addr = _s(quote.get("billing_address"), "")
    project      = _s(quote.get("project_name"), "")
    site         = _s(quote.get("site_location"), "")
    created_at   = _s(quote.get("created_at"), date.today().strftime("%Y-%m-%d"))
    valid_till   = _s(quote.get("valid_till"), "14 days from date")
    status       = _s(quote.get("status"), "DRAFT").upper()
    notes        = _s(quote.get("notes"), "")
    items        = quote.get("items") or quote.get("line_items") or []

    subtotal    = float(quote.get("subtotal") or quote.get("sub_total") or 0)
    gst_rate    = float(quote.get("gst_rate") or 18)
    gst_amount  = float(quote.get("gst_amount") or quote.get("gst") or 0)
    grand_total = float(quote.get("grand_total") or quote.get("total") or 0)

    # Recalculate totals when missing
    if subtotal == 0 and items:
        for it in items:
            try:
                qty  = float(it.get("quantity") or 1)
                up   = float(it.get("unit_price") or it.get("price") or 0)
                disc = float(it.get("discount_pct") or it.get("discount") or 0)
                subtotal += qty * up * (1 - disc / 100)
            except Exception:
                pass
    if gst_amount == 0 and subtotal > 0:
        gst_amount = subtotal * gst_rate / 100
    if grand_total == 0:
        grand_total = subtotal + gst_amount

    # ── PDF setup ─────────────────────────────────────────────────────────────

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    PAGE_W  = 210
    MARGIN  = 14
    CONTENT = PAGE_W - 2 * MARGIN   # 182 mm

    # ── HEADER BAND ───────────────────────────────────────────────────────────

    pdf.set_fill_color(15, 39, 68)           # dark navy
    pdf.rect(0, 0, PAGE_W, 28, style="F")

    # Green logo box
    pdf.set_fill_color(21, 128, 61)
    pdf.rect(MARGIN, 7, 14, 14, style="F")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(MARGIN, 11)
    pdf.cell(14, 6, "IQ", align="C")

    # Company name
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(MARGIN + 16, 8)
    pdf.cell(80, 7, "InvenIQ")

    # Company sub-line
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(180, 210, 180)
    pdf.set_xy(MARGIN + 16, 16)
    pdf.cell(80, 5, "Building Materials  |  GST: 29AAACI1234Z1Z5  |  +91-98765-43210")

    # QUOTATION label (right)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(110, 231, 183)
    pdf.set_xy(PAGE_W - MARGIN - 55, 6)
    pdf.cell(55, 10, "QUOTATION", align="R")

    # ── META TABLE (top-right) ────────────────────────────────────────────────

    pdf.set_y(32)
    for label, value in [
        ("Quote No.", quote_number),
        ("Date",      created_at),
        ("Valid Till", valid_till),
        ("Status",    status),
    ]:
        pdf.set_x(PAGE_W - MARGIN - 70)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(28, 5.5, label, align="R")
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(42, 5.5, value, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ── PARTIES ───────────────────────────────────────────────────────────────

    y_box = max(pdf.get_y() + 2, 32)

    # Bill To box
    pdf.set_fill_color(241, 245, 249)
    pdf.rect(MARGIN, y_box, 88, 30, style="F")
    pdf.set_xy(MARGIN + 3, y_box + 3)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(82, 5, "BILL TO")
    pdf.set_xy(MARGIN + 3, y_box + 8)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(82, 6, customer[:45])
    y_off = 14
    for line in filter(None, [contact, phone, email_addr, gst_no, billing_addr]):
        if y_off > 26:
            break
        pdf.set_xy(MARGIN + 3, y_box + y_off)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(82, 4.5, line[:50])
        y_off += 4.5

    # Project / Site box
    px = MARGIN + 92
    pdf.set_fill_color(241, 245, 249)
    pdf.rect(px, y_box, 90, 30, style="F")
    pdf.set_xy(px + 3, y_box + 3)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(84, 5, "PROJECT / SITE")
    if project:
        pdf.set_xy(px + 3, y_box + 8)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(84, 6, project[:40])
    if site:
        pdf.set_xy(px + 3, y_box + 15)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(84, 5, site[:50])

    pdf.set_y(y_box + 34)

    # ── LINE ITEMS TABLE ──────────────────────────────────────────────────────

    COL     = [8, 72, 12, 14, 22, 14, 22, 18]   # column widths mm
    HEADERS = ["#", "Product / Description", "Qty", "Unit", "Unit Price", "Disc%", "Net Price", "Amount"]
    ALIGNS  = ["C", "L", "C", "C", "R", "C", "R", "R"]

    # Header row
    pdf.set_fill_color(15, 39, 68)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 7)
    x = MARGIN
    for w, h, a in zip(COL, HEADERS, ALIGNS):
        pdf.set_xy(x, pdf.get_y())
        pdf.cell(w, 6.5, h, fill=True, align=a)
        x += w
    pdf.ln()

    # Data rows
    for row_no, it in enumerate(items, start=1):
        try:
            qty  = float(it.get("quantity") or 1)
            up   = float(it.get("unit_price") or it.get("price") or 0)
            disc = float(it.get("discount_pct") or it.get("discount") or 0)
            net  = up * (1 - disc / 100)
            amt  = net * qty
        except Exception:
            qty, up, disc, net, amt = 1, 0, 0, 0, 0

        unit  = _s(it.get("unit"), "Each")[:8]
        pname = _s(it.get("product_name") or it.get("name"), f"Item {row_no}")[:45]
        desc  = _s(it.get("description") or it.get("notes"), "")

        fill  = (255, 255, 255) if row_no % 2 == 0 else (248, 250, 252)
        pdf.set_fill_color(*fill)
        pdf.set_text_color(15, 23, 42)

        row_y = pdf.get_y()
        x = MARGIN
        for val, w, align in [
            (str(row_no),                    COL[0], "C"),
            (pname,                          COL[1], "L"),
            (f"{qty:g}",                     COL[2], "C"),
            (unit,                           COL[3], "C"),
            (f"Rs.{up:,.0f}",               COL[4], "R"),
            (f"{disc:.0f}%" if disc else "-", COL[5], "C"),
            (f"Rs.{net:,.0f}",              COL[6], "R"),
            (f"Rs.{amt:,.0f}",              COL[7], "R"),
        ]:
            pdf.set_xy(x, row_y)
            pdf.set_font("Helvetica", "", 7.5)
            pdf.cell(w, 6.5, val, fill=True, align=align)
            x += w
        pdf.ln()

        if desc:
            pdf.set_font("Helvetica", "I", 6.5)
            pdf.set_text_color(100, 116, 139)
            pdf.set_x(MARGIN + COL[0] + 1)
            pdf.cell(COL[1] - 2, 4.5, desc[:70])
            pdf.ln()

    pdf.ln(2)

    # ── TOTALS ────────────────────────────────────────────────────────────────

    tot_x = PAGE_W - MARGIN - 80
    for label, value, highlight in [
        ("Subtotal",              fmt_inr(subtotal),   False),
        (f"GST ({gst_rate:.0f}%)", fmt_inr(gst_amount), False),
        ("TOTAL",                  fmt_inr(grand_total), True),
    ]:
        if highlight:
            pdf.ln(1)
            pdf.set_fill_color(15, 39, 68)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_x(tot_x)
            pdf.cell(42, 7, label, fill=True, align="L")
            pdf.cell(38, 7, value, fill=True, align="R")
        else:
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(71, 85, 105)
            pdf.set_x(tot_x)
            pdf.cell(42, 6, label, align="L")
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(38, 6, value, align="R")
        pdf.ln()

    pdf.ln(6)

    # ── TERMS & CONDITIONS ────────────────────────────────────────────────────

    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(CONTENT, 5, "TERMS & CONDITIONS")
    pdf.ln(5)

    default_terms = [
        "Payment: 50% Advance + 50% on Delivery",
        "Delivery: Door Delivery - Bangalore",
        f"Validity: 14 days from date of quotation",
        f"GST: {gst_rate:.0f}% applicable as above",
        "Prices subject to change based on manufacturer price revisions.",
        "Order confirmation with PO / advance payment required to block production slot.",
    ]
    terms = ([notes] + default_terms[:4]) if notes else default_terms

    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(71, 85, 105)
    for term in terms:
        pdf.set_x(MARGIN)
        pdf.cell(3, 4.5, "*")
        pdf.cell(CONTENT - 3, 4.5, _s(term)[:110])
        pdf.ln()

    pdf.ln(8)

    # ── SIGNATURE ─────────────────────────────────────────────────────────────

    sig_y = pdf.get_y()
    sig_w = 70
    pdf.line(MARGIN, sig_y + 10, MARGIN + sig_w, sig_y + 10)
    pdf.set_xy(MARGIN, sig_y + 11)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(sig_w, 5, "For InvenIQ - Authorised Signatory")

    rx = PAGE_W - MARGIN - sig_w
    pdf.line(rx, sig_y + 10, rx + sig_w, sig_y + 10)
    pdf.set_xy(rx, sig_y + 11)
    pdf.cell(sig_w, 5, f"{customer[:30]} - Acceptance Signature")

    # ── FOOTER ────────────────────────────────────────────────────────────────

    pdf.set_y(-12)
    pdf.set_font("Helvetica", "", 6.5)
    pdf.set_text_color(148, 163, 184)
    pdf.set_x(MARGIN)
    pdf.cell(CONTENT // 2, 5, "Generated by InvenIQ Quotation Builder")
    pdf.set_x(MARGIN + CONTENT // 2)
    pdf.cell(CONTENT // 2, 5, f"Page 1  |  {date.today().strftime('%d %b %Y')}", align="R")

    # ── Return bytes ──────────────────────────────────────────────────────────

    buf = io.BytesIO()
    buf.write(pdf.output())
    return buf.getvalue()
