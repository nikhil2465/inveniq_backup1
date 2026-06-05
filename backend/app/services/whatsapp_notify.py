"""
WhatsApp Business Notification Service — InvenIQ
Sends quotation notifications to customers via WhatsApp Business API (Meta Cloud API).
Configure WHATSAPP_TOKEN + WHATSAPP_PHONE_ID in backend/.env to go live.
Falls back to simulation mode when credentials are absent.
"""
import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# ── Read env at import time (lru_cache in get_settings handles updates) ────────
def _cfg():
    token    = os.getenv("WHATSAPP_TOKEN", "")
    phone_id = os.getenv("WHATSAPP_PHONE_ID", "")
    return token, phone_id


def _clean_phone(phone: str) -> str:
    """Normalise phone to E.164 format without leading +."""
    digits = "".join(c for c in (phone or "") if c.isdigit())
    if len(digits) == 10:           # Indian local number
        digits = "91" + digits
    if digits.startswith("0"):      # strip leading 0
        digits = digits[1:]
    return digits


def _format_inr(amount) -> str:
    try:
        return f"Rs.{float(amount):,.0f}"
    except Exception:
        return str(amount)


async def send_quotation_whatsapp(
    customer_phone: str,
    customer_name:  str,
    quote_number:   str,
    grand_total,
    items_count:    int,
    valid_till:     str,
    project_name:   str = "",
    extra_msg:      str = "",
) -> dict:
    """
    Send a WhatsApp message to the customer when a quotation is created or sent.
    Returns {"success": bool, "simulated": bool, "message": str}.
    """
    phone = _clean_phone(customer_phone)
    if not phone or len(phone) < 10:
        return {"success": False, "simulated": False, "message": "Invalid or missing customer phone number"}

    token, phone_id = _cfg()

    # Build the message body
    project_line = f"\nProject: {project_name}" if project_name else ""
    body = (
        f"Hello {customer_name},\n\n"
        f"Your quotation from InvenIQ is ready.\n\n"
        f"Quote No: {quote_number}"
        f"{project_line}\n"
        f"Items: {items_count}\n"
        f"Total: {_format_inr(grand_total)} (incl. GST)\n"
        f"Valid Till: {valid_till}\n\n"
        f"{extra_msg + chr(10) if extra_msg else ''}"
        f"Please review and confirm at your earliest convenience.\n\n"
        f"Regards,\nInvenIQ Sales Team"
    )

    if not token or not phone_id:
        # Simulate — log but do not send
        logger.info(
            "WhatsApp SIMULATED to +%s (%s): %s | %s | %s",
            phone, customer_name, quote_number, _format_inr(grand_total), valid_till,
        )
        return {
            "success":   True,
            "simulated": True,
            "phone":     "+" + phone,
            "message":   (
                f"WhatsApp simulated to +{phone}. "
                "Add WHATSAPP_TOKEN and WHATSAPP_PHONE_ID to backend/.env to send real messages."
            ),
        }

    # Send via Meta WhatsApp Business Cloud API
    url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to":                phone,
        "type":              "text",
        "text":              {"body": body},
    }

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code == 200:
            logger.info("WhatsApp sent to +%s for quote %s", phone, quote_number)
            return {"success": True, "simulated": False, "phone": "+" + phone, "message": f"WhatsApp sent to +{phone}"}
        else:
            error = resp.text[:200]
            logger.warning("WhatsApp API error %s: %s", resp.status_code, error)
            return {"success": False, "simulated": False, "message": f"WhatsApp API error {resp.status_code}: {error}"}
    except ImportError:
        # httpx not installed — fallback to urllib
        import json as _json, urllib.request, urllib.error
        req = urllib.request.Request(url, data=_json.dumps(payload).encode(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                logger.info("WhatsApp sent to +%s for quote %s", phone, quote_number)
                return {"success": True, "simulated": False, "phone": "+" + phone, "message": f"WhatsApp sent to +{phone}"}
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:200]
            logger.warning("WhatsApp API HTTPError: %s", err)
            return {"success": False, "simulated": False, "message": f"WhatsApp send failed: {err}"}
    except Exception as exc:
        logger.warning("WhatsApp send exception: %s", exc)
        return {"success": False, "simulated": False, "message": str(exc)}


async def send_bulk_quotation_whatsapp(quotes: list[dict]) -> list[dict]:
    """Send WhatsApp notifications for multiple quotes concurrently."""
    tasks = [
        send_quotation_whatsapp(
            customer_phone = q.get("contact_phone", ""),
            customer_name  = q.get("customer_name", "Customer"),
            quote_number   = q.get("quote_number", ""),
            grand_total    = q.get("grand_total", 0),
            items_count    = len(q.get("line_items", [])),
            valid_till     = q.get("valid_till", ""),
            project_name   = q.get("project_name", ""),
        )
        for q in quotes
    ]
    return await asyncio.gather(*tasks)
