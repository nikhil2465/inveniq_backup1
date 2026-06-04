"""
Company Profile API — Store and retrieve company details used across all documents.
DB-first / localStorage-fallback pattern. Single-row config table.
"""
import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Company Profile"])

_DDL = """
CREATE TABLE IF NOT EXISTS company_profile (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_name  VARCHAR(255)  NOT NULL DEFAULT '',
    trade_name    VARCHAR(255)  DEFAULT '',
    gstin         VARCHAR(20)   DEFAULT '',
    pan           VARCHAR(15)   DEFAULT '',
    address       TEXT          DEFAULT '',
    state         VARCHAR(100)  DEFAULT '',
    state_code    VARCHAR(5)    DEFAULT '',
    pin_code      VARCHAR(10)   DEFAULT '',
    phone         VARCHAR(30)   DEFAULT '',
    email         VARCHAR(150)  DEFAULT '',
    website       VARCHAR(255)  DEFAULT '',
    bank_name     VARCHAR(200)  DEFAULT '',
    bank_account  VARCHAR(50)   DEFAULT '',
    ifsc_code     VARCHAR(20)   DEFAULT '',
    account_holder VARCHAR(255) DEFAULT '',
    logo_url      TEXT          DEFAULT '',
    fy_start      VARCHAR(10)   DEFAULT 'April',
    default_gst_rate DECIMAL(5,2) DEFAULT 18,
    tax_regime    VARCHAR(30)   DEFAULT 'Regular',
    signature_name VARCHAR(255) DEFAULT '',
    smtp_host     VARCHAR(255)  DEFAULT '',
    smtp_port     INT           DEFAULT 587,
    smtp_user     VARCHAR(255)  DEFAULT '',
    smtp_password VARCHAR(255)  DEFAULT '',
    tds_rate_professional DECIMAL(5,2) DEFAULT 10,
    tds_rate_contract     DECIMAL(5,2) DEFAULT 2,
    updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

# Demo in-memory fallback
_DEMO_PROFILE: dict = {
    "company_name": "InvenIQ Building Materials Pvt. Ltd.",
    "trade_name": "InvenIQ",
    "gstin": "29AABCI1234Z1ZA",
    "pan": "AABCI1234Z",
    "address": "123, Industrial Area, Peenya, Bangalore – 560058",
    "state": "Karnataka",
    "state_code": "29",
    "pin_code": "560058",
    "phone": "+91-80-12345678",
    "email": "accounts@inveniq.in",
    "website": "https://inveniq.in",
    "bank_name": "HDFC Bank",
    "bank_account": "50200012345678",
    "ifsc_code": "HDFC0001234",
    "account_holder": "InvenIQ Building Materials Pvt. Ltd.",
    "logo_url": "",
    "fy_start": "April",
    "default_gst_rate": 18,
    "tax_regime": "Regular",
    "signature_name": "Authorised Signatory",
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_password": "",
    "tds_rate_professional": 10,
    "tds_rate_contract": 2,
}


async def _get_pool():
    try:
        from app.db.connection import get_pool
        return await get_pool()
    except Exception:
        return None


async def _ensure_table(pool):
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_DDL)
    except Exception as exc:
        logger.warning("company_profile: DDL failed — %s", exc)


@router.get("/company-profile")
async def get_profile():
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_table(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT * FROM company_profile ORDER BY id LIMIT 1")
                    cols = [d[0] for d in cur.description]
                    row = await cur.fetchone()
                    if row:
                        return {"profile": dict(zip(cols, row)), "data_source": "live"}
        except Exception as exc:
            logger.warning("company_profile: get failed — %s", exc)

    return {"profile": _DEMO_PROFILE, "data_source": "demo"}


@router.post("/company-profile")
async def save_profile(body: dict):
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_table(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT id FROM company_profile LIMIT 1")
                    existing = await cur.fetchone()
                    fields = [
                        "company_name", "trade_name", "gstin", "pan",
                        "address", "state", "state_code", "pin_code",
                        "phone", "email", "website",
                        "bank_name", "bank_account", "ifsc_code", "account_holder",
                        "logo_url", "fy_start", "default_gst_rate", "tax_regime",
                        "signature_name", "smtp_host", "smtp_port",
                        "smtp_user", "smtp_password",
                        "tds_rate_professional", "tds_rate_contract",
                    ]
                    vals = [body.get(f, _DEMO_PROFILE.get(f, "")) for f in fields]
                    if existing:
                        sets = ", ".join(f"{f}=%s" for f in fields)
                        await cur.execute(f"UPDATE company_profile SET {sets} WHERE id=%s", vals + [existing[0]])
                    else:
                        cols_str = ", ".join(fields)
                        phs = ", ".join(["%s"] * len(fields))
                        await cur.execute(f"INSERT INTO company_profile ({cols_str}) VALUES ({phs})", vals)
                    await conn.commit()
            _DEMO_PROFILE.update(body)
            return {"success": True, "data_source": "live"}
        except Exception as exc:
            logger.warning("company_profile: save failed — %s", exc)

    # Demo fallback
    _DEMO_PROFILE.update(body)
    return {"success": True, "data_source": "demo"}


@router.post("/company-profile/test-smtp")
async def test_smtp():
    """Test the saved SMTP configuration by attempting a connection."""
    host = _DEMO_PROFILE.get("smtp_host", "")
    port = int(_DEMO_PROFILE.get("smtp_port", 587))
    user = _DEMO_PROFILE.get("smtp_user", "")
    pwd  = _DEMO_PROFILE.get("smtp_password", "")

    # Try from DB first
    pool = await _get_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT smtp_host, smtp_port, smtp_user, smtp_password FROM company_profile LIMIT 1")
                    row = await cur.fetchone()
                    if row:
                        host, port, user, pwd = row[0] or host, int(row[1] or port), row[2] or user, row[3] or pwd
        except Exception:
            pass

    if not host or not user:
        return {"success": False, "message": "SMTP not configured. Enter host, user and password first."}

    import smtplib
    try:
        with smtplib.SMTP(host, port, timeout=10) as s:
            s.ehlo()
            if port in (587, 2587):
                s.starttls()
                s.ehlo()
            s.login(user, pwd)
        return {"success": True, "message": f"SMTP connection to {host}:{port} successful."}
    except Exception as e:
        return {"success": False, "message": str(e)}
