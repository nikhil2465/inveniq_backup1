"""Email notification service — delivery delay alerts with AI-generated content."""
import asyncio
import json
import smtplib
import logging
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import date

logger = logging.getLogger(__name__)

# Simple in-process cache so the same order doesn't call GPT twice per server run
_ai_cache: dict[str, dict] = {}


# ── AI content generation ─────────────────────────────────────────────────────

async def generate_ai_email_content(order: dict, days_overdue: int, openai_api_key: str) -> dict | None:
    """Call GPT-4o-mini to build personalised delay analysis. Returns None on any failure."""
    if not openai_api_key:
        return None

    cache_key = f"{order.get('order_number')}:{days_overdue}"
    if cache_key in _ai_cache:
        return _ai_cache[cache_key]

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=openai_api_key)

        delay_reason = order.get("delay_reason") or order.get("supplier_name") or "Not specified"
        value_str    = f"₹{int(order.get('total_value', 0)):,}"

        prompt = f"""You are an operations manager at a PVC laminates and plywood distribution company in India.

Analyse this delayed sales order and respond ONLY with valid JSON (no markdown fences):

Order Number : {order.get('order_number')}
Customer     : {order.get('customer_name')} ({order.get('customer_type')})
Product      : {order.get('product_name')} ({order.get('category')})
Quantity     : {order.get('quantity')} {order.get('unit')}
Order Value  : {value_str}
Days Overdue : {days_overdue}
Status       : {order.get('status')}
Delay Reason : {delay_reason}

Return exactly this JSON shape:
{{
  "executive_summary": "one sentence, max 35 words, urgent tone",
  "root_cause": "1-2 sentences on the specific cause and operational impact",
  "financial_risk": "one sentence: risk level (LOW/MEDIUM/HIGH/CRITICAL), rupees at stake, customer relationship impact",
  "actions": ["action 1 max 12 words", "action 2 max 12 words", "action 3 max 12 words", "action 4 max 12 words"],
  "resolution": "one sentence with specific timeline and resolution path"
}}"""

        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=420,
            temperature=0.25,
        )
        raw = resp.choices[0].message.content.strip()
        # Strip accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
        _ai_cache[cache_key] = result
        return result
    except Exception as exc:
        logger.warning("AI email content generation failed: %s", exc)
        return None


# ── HTML templates ────────────────────────────────────────────────────────────

def _color(days: int) -> str:
    return "#dc2626" if days >= 7 else "#d97706" if days >= 3 else "#f59e0b"

def _label(days: int) -> str:
    return "CRITICAL" if days >= 7 else "HIGH" if days >= 3 else "MODERATE"

def _actions_html(actions: list[str], fallback_order: dict) -> str:
    if actions:
        items = "".join(
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;vertical-align:top">'
            f'<span style="display:inline-flex;align-items:center;justify-content:center;'
            f'width:22px;height:22px;background:#6b21a8;color:#fff;border-radius:50%;'
            f'font-size:10px;font-weight:800;flex-shrink:0;margin-right:10px">{i+1}</span>'
            f'<span style="font-size:12px;color:#1e293b;line-height:1.55">{a}</span>'
            f'</td></tr>'
            for i, a in enumerate(actions)
        )
    else:
        supplier = fallback_order.get("supplier_name", "supplier")
        customer = fallback_order.get("customer_name", "customer")
        default_actions = [
            f"Contact supplier <strong>{supplier}</strong> immediately for updated ETA",
            f"Notify customer <strong>{customer}</strong> with revised delivery date",
            "Escalate to operations if order has been in production > 3 days",
            "Update order status in InvenIQ once revised date is confirmed",
        ]
        items = "".join(
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;vertical-align:top">'
            f'<span style="display:inline-flex;align-items:center;justify-content:center;'
            f'width:22px;height:22px;background:#6b21a8;color:#fff;border-radius:50%;'
            f'font-size:10px;font-weight:800;flex-shrink:0;margin-right:10px">{i+1}</span>'
            f'<span style="font-size:12px;color:#1e293b;line-height:1.55">{a}</span>'
            f'</td></tr>'
            for i, a in enumerate(default_actions)
        )
    return f'<table width="100%" cellpadding="0" cellspacing="0">{items}</table>'


def _build_ai_delay_html(order: dict, days_overdue: int, ai: dict | None) -> str:
    uc       = _color(days_overdue)
    ul       = _label(days_overdue)
    today_str = date.today().strftime("%d %b %Y")
    day_word  = "day" if days_overdue == 1 else "days"
    qty_str   = f"{order.get('quantity', '—')} {order.get('unit', '')}".strip()
    value_str = f"₹{int(order.get('total_value', 0)):,}"
    order_num = order.get('order_number', '—')
    delay_rsn = order.get("delay_reason") or "—"

    # AI section — shown only when AI content is available
    if ai:
        ai_section = f"""
<div style="background:linear-gradient(135deg,#faf5ff 0%,#f5f3ff 100%);
            border:1.5px solid #e9d5ff;border-radius:10px;padding:22px;margin-bottom:24px">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
    <span style="background:#6b21a8;color:#fff;border-radius:5px;
                 padding:3px 10px;font-size:9px;font-weight:800;letter-spacing:.8px">✨ GPT-4o ANALYSIS</span>
    <span style="font-size:10px;color:#9333ea;font-weight:600">Personalised for this order</span>
  </div>
  <p style="font-size:14px;font-weight:700;color:#1e293b;line-height:1.6;margin:0 0 16px">{ai.get('executive_summary','')}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>
      <td width="50%" style="padding-right:10px;vertical-align:top">
        <div style="background:#fff;border:1px solid #e9d5ff;border-radius:8px;padding:14px">
          <div style="font-size:9px;font-weight:800;color:#6b21a8;text-transform:uppercase;
                      letter-spacing:.8px;margin-bottom:6px">Root Cause</div>
          <p style="font-size:12px;color:#334155;line-height:1.6;margin:0">{ai.get('root_cause','')}</p>
        </div>
      </td>
      <td width="50%" style="padding-left:10px;vertical-align:top">
        <div style="background:#fff;border:1px solid #e9d5ff;border-radius:8px;padding:14px">
          <div style="font-size:9px;font-weight:800;color:#6b21a8;text-transform:uppercase;
                      letter-spacing:.8px;margin-bottom:6px">Risk Assessment</div>
          <p style="font-size:12px;color:#334155;line-height:1.6;margin:0">{ai.get('financial_risk','')}</p>
        </div>
      </td>
    </tr>
  </table>
  <div style="background:#fff;border:1px solid #e9d5ff;border-radius:8px;padding:14px;margin-top:12px">
    <div style="font-size:9px;font-weight:800;color:#6b21a8;text-transform:uppercase;
                letter-spacing:.8px;margin-bottom:10px">Resolution Timeline</div>
    <p style="font-size:12px;color:#334155;line-height:1.6;margin:0">🎯 {ai.get('resolution','')}</p>
  </div>
</div>"""
        actions_list = ai.get("actions", [])
    else:
        ai_section   = ""
        actions_list = []

    actions_html = _actions_html(actions_list, order)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delivery Delay Alert — {order_num}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:32px 16px">
<table width="640" cellpadding="0" cellspacing="0"
       style="max-width:640px;width:100%;border-radius:14px;overflow:hidden;
              box-shadow:0 8px 32px rgba(0,0,0,.12)">

  <!-- ── HEADER ─────────────────────────────────────────────────── -->
  <tr><td style="background:#0f172a;padding:0">
    <!-- urgency strip -->
    <div style="background:{uc};height:5px"></div>
    <!-- brand row -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:22px 32px 10px">
          <div style="color:#fff;font-size:20px;font-weight:900;letter-spacing:-.4px">InvenIQ</div>
          <div style="color:#475569;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;
                      margin-top:2px;font-weight:600">Inventory Intelligence Platform</div>
        </td>
        <td style="padding:22px 32px 10px;text-align:right;vertical-align:top">
          <span style="background:{uc};color:#fff;border-radius:7px;
                       padding:6px 14px;font-size:10px;font-weight:800;letter-spacing:.8px">
            ⚠&nbsp; {ul} PRIORITY
          </span>
        </td>
      </tr>
    </table>
    <!-- title row -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:4px 32px 24px">
          <div style="color:#fff;font-size:24px;font-weight:900;letter-spacing:-.6px;
                      line-height:1.2">Delivery Delay Alert</div>
          <div style="color:#64748b;font-size:12px;margin-top:5px;font-family:monospace">
            {order_num} &nbsp;·&nbsp; {days_overdue} {day_word} overdue &nbsp;·&nbsp; {today_str}
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ── BODY ───────────────────────────────────────────────────── -->
  <tr><td style="background:#fff;padding:28px 32px">

    {ai_section}

    <!-- Order details card -->
    <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;
                letter-spacing:.1em;margin-bottom:12px">Order Details</div>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;
                  margin-bottom:24px;border-collapse:separate;border-spacing:0">
      <tr>
        <td colspan="2" style="padding:18px 20px 14px;border-bottom:1px solid #e2e8f0">
          <div style="font-size:20px;font-weight:900;color:#0f172a;
                      font-family:monospace;letter-spacing:-.3px">{order_num}</div>
          <div style="font-size:12px;color:#64748b;margin-top:3px">
            {order.get('product_name','—')} &nbsp;·&nbsp; {order.get('category','')}
          </div>
          <span style="display:inline-block;background:{uc};color:#fff;border-radius:5px;
                        padding:3px 10px;font-size:10px;font-weight:800;margin-top:8px">
            ⚠ {days_overdue} {day_word} overdue
          </span>
        </td>
      </tr>
      <tr>
        <td width="50%" style="padding:14px 20px;border-right:1px solid #e2e8f0;vertical-align:top">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;
                      text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Customer</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a">{order.get('customer_name','—')}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">{order.get('customer_type','—')}</div>
        </td>
        <td width="50%" style="padding:14px 20px;vertical-align:top">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;
                      text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Quantity</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a">{qty_str}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">{order.get('category','—')}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;border-top:1px solid #e2e8f0;
                   border-right:1px solid #e2e8f0;vertical-align:top">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;
                      text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Order Value</div>
          <div style="font-size:16px;font-weight:900;color:#0f172a;
                      font-family:monospace">{value_str}</div>
        </td>
        <td style="padding:14px 20px;border-top:1px solid #e2e8f0;vertical-align:top">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;
                      text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Expected By</div>
          <div style="font-size:13px;font-weight:700;color:{uc}">{order.get('delivery_date','—')}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">Original commitment</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:14px 20px;border-top:1px solid #e2e8f0">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;
                      text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Delay Reason on Record</div>
          <div style="font-size:12px;color:#d97706;font-weight:600">{delay_rsn}</div>
        </td>
      </tr>
    </table>

    <!-- Immediate actions -->
    <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;
                letter-spacing:.1em;margin-bottom:12px">Immediate Actions</div>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;
                  padding:16px 20px;margin-bottom:24px;border-collapse:separate;border-spacing:0">
      <tr><td style="padding:0 0 10px">
        <div style="font-size:12px;font-weight:700;color:#92400e">
          Action required within 24 hours
        </div>
      </td></tr>
      <tr><td>
        {actions_html}
      </td></tr>
    </table>

    <!-- Note -->
    <p style="font-size:11px;color:#94a3b8;margin:0;line-height:1.7">
      Generated automatically by <strong style="color:#64748b">InvenIQ</strong> on {today_str}.<br>
      Log in to <strong>InvenIQ → Sales Orders</strong> to update status and take action on this order.
    </p>

  </td></tr>

  <!-- ── FOOTER ─────────────────────────────────────────────────── -->
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                 padding:16px 32px;border-radius:0 0 14px 14px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="font-size:11px;font-weight:800;color:#64748b">InvenIQ</span>
          <span style="font-size:10px;color:#94a3b8">
            &nbsp;·&nbsp; Inventory Intelligence Platform
            &nbsp;·&nbsp; Delivery Delay Notification
            {"&nbsp;·&nbsp; ✨ Powered by GPT-4o" if ai else ""}
          </span>
        </td>
        <td style="text-align:right">
          <span style="font-size:10px;color:#94a3b8">Sent to: Operations Manager / Admin</span>
        </td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


def _build_test_html(recipient: str) -> str:
    today_str = date.today().strftime("%d %b %Y")
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<title>InvenIQ Email Test</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 16px">
<table width="520" cellpadding="0" cellspacing="0"
       style="max-width:520px;width:100%;border-radius:14px;overflow:hidden;
              box-shadow:0 8px 32px rgba(0,0,0,.10)">
  <tr><td style="background:#15803d;padding:0">
    <div style="background:#16a34a;height:4px"></div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:22px 32px 18px">
          <div style="color:#fff;font-size:18px;font-weight:900;letter-spacing:-.3px">InvenIQ</div>
          <div style="color:rgba(255,255,255,.6);font-size:10px;letter-spacing:1.2px;
                      text-transform:uppercase;margin-top:2px">Email Configuration Test</div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 32px;text-align:center">
    <div style="font-size:52px;margin-bottom:16px">✅</div>
    <div style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:8px">
      Email is working correctly!
    </div>
    <div style="font-size:13px;color:#64748b;line-height:1.7;margin-bottom:24px">
      Your InvenIQ email notification system is configured and ready.<br>
      Delay alerts will be sent to <strong>{recipient}</strong>.
    </div>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;
           background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 24px;
           text-align:left">
      <tr><td>
        <div style="font-size:12px;color:#15803d;font-weight:600;line-height:2">
          <div>📅 Sent on: <strong>{today_str}</strong></div>
          <div>📬 Recipient: <strong>{recipient}</strong></div>
          <div>🔧 SMTP: Gmail TLS (port 587)</div>
          <div>✨ AI: GPT-4o delay analysis ready</div>
        </div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;
                 border-radius:0 0 14px 14px">
    <p style="font-size:10px;color:#94a3b8;margin:0;text-align:center">
      <strong>InvenIQ</strong> · Inventory Intelligence Platform · Test notification
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


# ── SMTP core (synchronous — runs in thread pool) ─────────────────────────────

def _smtp_send(
    host: str, port: int, user: str, password: str,
    recipient: str, subject: str, html_body: str,
    attachment: bytes | None = None,
    attachment_filename: str | None = None,
) -> None:
    """Send an HTML email with an optional binary attachment (e.g. PDF)."""
    if attachment:
        msg = MIMEMultipart("mixed")
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(html_body, "html", "utf-8"))
        msg.attach(alt)
        part = MIMEApplication(attachment, _subtype="pdf")
        part.add_header(
            "Content-Disposition", "attachment",
            filename=attachment_filename or "quotation.pdf",
        )
        msg.attach(part)
    else:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(html_body, "html", "utf-8"))

    msg["Subject"] = subject
    msg["From"]    = f"InvenIQ <{user}>"
    msg["To"]      = recipient

    with smtplib.SMTP(host, port, timeout=15) as srv:
        srv.ehlo()
        srv.starttls()
        srv.login(user, password)
        srv.sendmail(user, [recipient], msg.as_string())


# ── Public async API ──────────────────────────────────────────────────────────

async def send_delay_notification(order: dict, days_overdue: int, settings) -> dict:
    """Send an AI-enhanced delay alert. Falls back gracefully when SMTP not configured."""
    order_num = order.get("order_number", "UNKNOWN")

    # Generate AI content (best-effort, non-blocking)
    ai = await generate_ai_email_content(order, days_overdue, settings.openai_api_key)

    if not settings.smtp_user or not settings.smtp_password:
        logger.info("SMTP not configured — demo mode for order %s (AI: %s)", order_num, bool(ai))
        return {
            "sent":          False,
            "demo_mode":     True,
            "ai_generated":  bool(ai),
            "message":       "SMTP not configured. Add SMTP_USER + SMTP_PASSWORD to backend/.env.",
            "order_number":  order_num,
            "would_notify":  settings.notification_email,
        }

    recipient = settings.notification_email or settings.smtp_user
    day_word  = "day" if days_overdue == 1 else "days"
    subject   = f"⚠️ Delivery Delay Alert — {order_num} ({days_overdue} {day_word} overdue)"
    html_body = _build_ai_delay_html(order, days_overdue, ai)

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, _smtp_send,
            settings.smtp_host, settings.smtp_port,
            settings.smtp_user, settings.smtp_password,
            recipient, subject, html_body,
        )
        logger.info("Delay email sent — %s → %s (AI: %s)", order_num, recipient, bool(ai))
        return {
            "sent":          True,
            "demo_mode":     False,
            "ai_generated":  bool(ai),
            "recipient":     recipient,
            "order_number":  order_num,
            "subject":       subject,
        }
    except Exception as exc:
        logger.error("Failed to send delay email for %s: %s", order_num, exc)
        return {
            "sent":          False,
            "demo_mode":     False,
            "ai_generated":  bool(ai),
            "error":         str(exc),
            "order_number":  order_num,
        }


async def get_ai_analysis(order: dict, days_overdue: int, openai_api_key: str) -> dict | None:
    """Public helper — returns AI analysis dict (cached)."""
    return await generate_ai_email_content(order, days_overdue, openai_api_key)


async def send_test_email(settings) -> dict:
    if not settings.smtp_user or not settings.smtp_password:
        return {
            "sent":        False,
            "demo_mode":   True,
            "message":     "SMTP not configured. Add SMTP_USER + SMTP_PASSWORD to backend/.env.",
            "would_notify": settings.notification_email,
        }
    recipient = settings.notification_email or settings.smtp_user
    html_body = _build_test_html(recipient)
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, _smtp_send,
            settings.smtp_host, settings.smtp_port,
            settings.smtp_user, settings.smtp_password,
            recipient, "✅ InvenIQ — Email Test Successful", html_body,
        )
        return {"sent": True, "recipient": recipient, "message": "Test email delivered successfully."}
    except Exception as exc:
        return {"sent": False, "error": str(exc), "hint": _smtp_hint(str(exc))}


def _smtp_hint(error: str) -> str:
    e = error.lower()
    if "authentication" in e or "535" in e:
        return "Gmail rejected the login. Use an App Password at myaccount.google.com/apppasswords"
    if "connection" in e or "timeout" in e:
        return "Could not reach smtp.gmail.com:587 — check firewall/internet."
    return "Check SMTP settings in backend/.env."


# ── GRN MISMATCH / CREDIT NOTE ALERT ─────────────────────────────────────────

async def generate_ai_credit_note_content(grn: dict, openai_api_key: str) -> dict | None:
    """Call GPT-4o-mini to build AI-powered credit note guidance. Returns None on failure."""
    if not openai_api_key:
        return None

    cache_key = f"cn:{grn.get('grn_number')}:{grn.get('discrepancy_amt')}"
    if cache_key in _ai_cache:
        return _ai_cache[cache_key]

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=openai_api_key)

        disc_str   = f"₹{int(grn.get('discrepancy_amt', 0)):,}"
        inv_str    = f"₹{int(grn.get('invoice_value', 0)):,}"
        grn_str    = f"₹{int(grn.get('grn_value', 0)):,}"
        qty_diff   = (grn.get('qty_ordered') or 0) - (grn.get('qty_received') or 0)

        prompt = f"""You are a procurement manager at a hardware and sanitary fittings distribution company in India.

A GRN mismatch has been detected. Analyse and respond ONLY with valid JSON (no markdown fences):

GRN Number    : {grn.get('grn_number')}
Supplier      : {grn.get('supplier')}
Product       : {grn.get('product_name')}
PO Reference  : {grn.get('po_number', 'N/A')}
Qty Ordered   : {grn.get('qty_ordered', 'N/A')} {grn.get('unit', '')}
Qty Received  : {grn.get('qty_received', 'N/A')} {grn.get('unit', '')}
Qty Shortfall : {qty_diff} {grn.get('unit', '')}
Invoice Value : {inv_str}
GRN Value     : {grn_str}
Discrepancy   : {disc_str}

Return exactly this JSON shape:
{{
  "summary": "one sentence, max 35 words, urgent tone about the credit note requirement",
  "discrepancy_type": "SHORT_DELIVERY or PRICE_VARIANCE or BOTH",
  "financial_risk": "one sentence: risk level and rupees at stake",
  "credit_note_amount": "exact rupee amount supplier must credit",
  "actions": ["action 1 max 12 words", "action 2 max 12 words", "action 3 max 12 words", "action 4 max 12 words"],
  "resolution": "one sentence: expected timeline and resolution path with supplier"
}}"""

        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=380,
            temperature=0.2,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
        _ai_cache[cache_key] = result
        return result
    except Exception as exc:
        logger.warning("AI credit note content generation failed: %s", exc)
        return None


def _build_credit_note_html(grn: dict, ai: dict | None) -> str:
    today_str  = date.today().strftime("%d %b %Y")
    disc_amt   = grn.get("discrepancy_amt", 0)
    inv_val    = grn.get("invoice_value", 0)
    grn_val    = grn.get("grn_value", 0)
    qty_diff   = (grn.get("qty_ordered") or 0) - (grn.get("qty_received") or 0)
    disc_str   = f"₹{int(disc_amt):,}"
    inv_str    = f"₹{int(inv_val):,}"
    grn_str    = f"₹{int(grn_val):,}"
    grn_num    = grn.get("grn_number", "—")
    supplier   = grn.get("supplier", "—")
    product    = grn.get("product_name", "—")
    po_num     = grn.get("po_number", "—")

    uc = "#dc2626"  # always red for credit note alerts
    ul = "ACTION REQUIRED"

    if ai:
        ai_section = f"""
<div style="background:linear-gradient(135deg,#fff1f2 0%,#fef2f2 100%);
            border:1.5px solid #fecdd3;border-radius:10px;padding:22px;margin-bottom:24px">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
    <span style="background:#dc2626;color:#fff;border-radius:5px;
                 padding:3px 10px;font-size:9px;font-weight:800;letter-spacing:.8px">✨ AI ANALYSIS</span>
    <span style="font-size:10px;color:#dc2626;font-weight:600">GPT-4o powered guidance</span>
  </div>
  <p style="font-size:14px;font-weight:700;color:#1e293b;line-height:1.6;margin:0 0 16px">{ai.get('summary','')}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>
      <td width="50%" style="padding-right:10px;vertical-align:top">
        <div style="background:#fff;border:1px solid #fecdd3;border-radius:8px;padding:14px">
          <div style="font-size:9px;font-weight:800;color:#dc2626;text-transform:uppercase;
                      letter-spacing:.8px;margin-bottom:6px">Discrepancy Type</div>
          <p style="font-size:12px;color:#334155;line-height:1.6;margin:0;font-weight:700">{ai.get('discrepancy_type','—')}</p>
        </div>
      </td>
      <td width="50%" style="padding-left:10px;vertical-align:top">
        <div style="background:#fff;border:1px solid #fecdd3;border-radius:8px;padding:14px">
          <div style="font-size:9px;font-weight:800;color:#dc2626;text-transform:uppercase;
                      letter-spacing:.8px;margin-bottom:6px">Credit Note Amount</div>
          <p style="font-size:14px;color:#dc2626;line-height:1.6;margin:0;font-weight:900;font-family:monospace">{ai.get('credit_note_amount', disc_str)}</p>
        </div>
      </td>
    </tr>
  </table>
  <div style="background:#fff;border:1px solid #fecdd3;border-radius:8px;padding:14px;margin-top:12px">
    <div style="font-size:9px;font-weight:800;color:#dc2626;text-transform:uppercase;
                letter-spacing:.8px;margin-bottom:10px">Resolution Path</div>
    <p style="font-size:12px;color:#334155;line-height:1.6;margin:0">🎯 {ai.get('resolution','')}</p>
  </div>
</div>"""
        actions_list = ai.get("actions", [])
    else:
        ai_section   = ""
        actions_list = []

    if actions_list:
        act_items = "".join(
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;vertical-align:top">'
            f'<span style="display:inline-flex;align-items:center;justify-content:center;'
            f'width:22px;height:22px;background:#dc2626;color:#fff;border-radius:50%;'
            f'font-size:10px;font-weight:800;flex-shrink:0;margin-right:10px">{i+1}</span>'
            f'<span style="font-size:12px;color:#1e293b;line-height:1.55">{a}</span>'
            f'</td></tr>'
            for i, a in enumerate(actions_list)
        )
    else:
        defaults = [
            f"Contact <strong>{supplier}</strong> immediately to raise credit note",
            f"Send formal debit note for {disc_str} against PO {po_num}",
            "Block further invoice payments until credit note is received",
            f"Update GRN record in InvenIQ with resolution status",
        ]
        act_items = "".join(
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;vertical-align:top">'
            f'<span style="display:inline-flex;align-items:center;justify-content:center;'
            f'width:22px;height:22px;background:#dc2626;color:#fff;border-radius:50%;'
            f'font-size:10px;font-weight:800;flex-shrink:0;margin-right:10px">{i+1}</span>'
            f'<span style="font-size:12px;color:#1e293b;line-height:1.55">{a}</span>'
            f'</td></tr>'
            for i, a in enumerate(defaults)
        )
    actions_html = f'<table width="100%" cellpadding="0" cellspacing="0">{act_items}</table>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GRN Mismatch — Credit Note Alert — {grn_num}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:32px 16px">
<table width="640" cellpadding="0" cellspacing="0"
       style="max-width:640px;width:100%;border-radius:14px;overflow:hidden;
              box-shadow:0 8px 32px rgba(0,0,0,.12)">

  <!-- HEADER -->
  <tr><td style="background:#0f172a;padding:0">
    <div style="background:{uc};height:5px"></div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:22px 32px 10px">
          <div style="color:#fff;font-size:20px;font-weight:900;letter-spacing:-.4px">InvenIQ</div>
          <div style="color:#475569;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;font-weight:600">Procurement Intelligence Platform</div>
        </td>
        <td style="padding:22px 32px 10px;text-align:right;vertical-align:top">
          <span style="background:{uc};color:#fff;border-radius:7px;
                       padding:6px 14px;font-size:10px;font-weight:800;letter-spacing:.8px">
            🧾 {ul}
          </span>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:4px 32px 24px">
          <div style="color:#fff;font-size:24px;font-weight:900;letter-spacing:-.6px;line-height:1.2">GRN Mismatch — Raise Credit Note</div>
          <div style="color:#64748b;font-size:12px;margin-top:5px;font-family:monospace">
            {grn_num} &nbsp;·&nbsp; Discrepancy: {disc_str} &nbsp;·&nbsp; {today_str}
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#fff;padding:28px 32px">

    {ai_section}

    <!-- GRN Details card -->
    <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;
                letter-spacing:.1em;margin-bottom:12px">GRN Mismatch Details</div>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;
                  margin-bottom:24px;border-collapse:separate;border-spacing:0">
      <tr>
        <td colspan="2" style="padding:18px 20px 14px;border-bottom:1px solid #e2e8f0">
          <div style="font-size:20px;font-weight:900;color:#0f172a;font-family:monospace;letter-spacing:-.3px">{grn_num}</div>
          <div style="font-size:12px;color:#64748b;margin-top:3px">{product} &nbsp;·&nbsp; PO: {po_num}</div>
          <span style="display:inline-block;background:{uc};color:#fff;border-radius:5px;
                        padding:3px 10px;font-size:10px;font-weight:800;margin-top:8px">
            ⚠ INVOICE / GRN MISMATCH — {disc_str} discrepancy
          </span>
        </td>
      </tr>
      <tr>
        <td width="50%" style="padding:14px 20px;border-right:1px solid #e2e8f0;vertical-align:top">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Supplier</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a">{supplier}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">PO Ref: {po_num}</div>
        </td>
        <td width="50%" style="padding:14px 20px;vertical-align:top">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Product Received</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a">{product}</div>
          {f'<div style="font-size:11px;color:#dc2626;margin-top:2px;font-weight:600">Short by {qty_diff} {grn.get("unit","units")}</div>' if qty_diff > 0 else ''}
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;vertical-align:top">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Invoice Value</div>
          <div style="font-size:16px;font-weight:900;color:#0f172a;font-family:monospace">{inv_str}</div>
        </td>
        <td style="padding:14px 20px;border-top:1px solid #e2e8f0;vertical-align:top">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">GRN Accepted Value</div>
          <div style="font-size:16px;font-weight:900;color:#0f172a;font-family:monospace">{grn_str}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:14px 20px;border-top:2px solid #fecdd3;background:#fff1f2;border-radius:0 0 10px 10px">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Credit Note Required from Supplier</div>
          <div style="font-size:22px;font-weight:900;color:#dc2626;font-family:monospace">{disc_str}</div>
        </td>
      </tr>
    </table>

    <!-- Actions -->
    <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">Immediate Actions Required</div>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#fff1f2;border:1.5px solid #fecdd3;border-radius:10px;
                  padding:16px 20px;margin-bottom:24px;border-collapse:separate;border-spacing:0">
      <tr><td style="padding:0 0 10px">
        <div style="font-size:12px;font-weight:700;color:#7f1d1d">Raise credit note within 48 hours</div>
      </td></tr>
      <tr><td>{actions_html}</td></tr>
    </table>

    <p style="font-size:11px;color:#94a3b8;margin:0;line-height:1.7">
      Generated automatically by <strong style="color:#64748b">InvenIQ</strong> on {today_str}.<br>
      Log in to <strong>InvenIQ → POGRN / Inward</strong> to view full GRN details and track resolution.
    </p>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;border-radius:0 0 14px 14px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="font-size:11px;font-weight:800;color:#64748b">InvenIQ</span>
          <span style="font-size:10px;color:#94a3b8">&nbsp;·&nbsp; Procurement Intelligence &nbsp;·&nbsp; GRN Mismatch Alert{"&nbsp;·&nbsp; ✨ GPT-4o" if ai else ""}</span>
        </td>
        <td style="text-align:right">
          <span style="font-size:10px;color:#94a3b8">Sent to: Procurement Manager / Admin</span>
        </td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


async def send_grn_mismatch_alert(grn: dict, settings) -> dict:
    """Send an AI-enhanced credit note alert when a GRN mismatch is detected.
    Falls back gracefully when SMTP is not configured (demo / dev mode).
    """
    grn_num = grn.get("grn_number", "UNKNOWN")

    ai = await generate_ai_credit_note_content(grn, settings.openai_api_key)

    if not settings.smtp_user or not settings.smtp_password:
        logger.info("SMTP not configured — demo mode for GRN mismatch alert %s (AI: %s)", grn_num, bool(ai))
        return {
            "sent":         False,
            "demo_mode":    True,
            "ai_generated": bool(ai),
            "message":      "SMTP not configured. Add SMTP_USER + SMTP_PASSWORD to backend/.env.",
            "grn_number":   grn_num,
            "would_notify": settings.notification_email,
        }

    recipient  = settings.notification_email or settings.smtp_user
    disc_str   = f"₹{int(grn.get('discrepancy_amt', 0)):,}"
    subject    = f"🧾 GRN Mismatch Alert — {grn_num} — Credit Note {disc_str} Required from {grn.get('supplier','Supplier')}"
    html_body  = _build_credit_note_html(grn, ai)

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, _smtp_send,
            settings.smtp_host, settings.smtp_port,
            settings.smtp_user, settings.smtp_password,
            recipient, subject, html_body,
        )
        logger.info("GRN mismatch email sent — %s → %s (AI: %s)", grn_num, recipient, bool(ai))
        return {
            "sent":         True,
            "demo_mode":    False,
            "ai_generated": bool(ai),
            "recipient":    recipient,
            "grn_number":   grn_num,
            "subject":      subject,
        }
    except Exception as exc:
        logger.error("Failed to send GRN mismatch email for %s: %s", grn_num, exc)
        return {
            "sent":         False,
            "demo_mode":    False,
            "ai_generated": bool(ai),
            "error":        str(exc),
            "grn_number":   grn_num,
        }
