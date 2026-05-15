"""
JWT authentication utilities for InvenIQ.
Uses python-jose for JWT encoding/decoding and bcrypt (direct) for password hashing.
passlib is NOT used — bcrypt 4.x+ broke passlib 1.7.4 compatibility; direct bcrypt is cleaner.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.roles import ROLE_DEMO_ACCOUNTS, ROLE_MODULES, modules_to_claim

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"

# Lazily hashed passwords — computed once on first login attempt
_hashed_demo_password:  Optional[bytes] = None
_hashed_owner_password: Optional[bytes] = None
# Keyed by username — populated on first authenticate_user() call for that account
_hashed_role_passwords: dict[str, bytes] = {}


def _get_secret() -> str:
    key = get_settings().jwt_secret_key
    if key == "inveniq-dev-change-this-in-production-2026":
        logger.warning(
            "JWT_SECRET_KEY is using the default dev value. "
            "Set a strong random key in .env before deploying to production."
        )
    return key


def hash_password(plain: str) -> bytes:
    """Return a bcrypt hash of plain (as bytes)."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12))


def verify_password(plain: str, hashed) -> bool:
    """Verify plain against a bcrypt hash (str or bytes accepted)."""
    try:
        h = hashed if isinstance(hashed, bytes) else hashed.encode("utf-8")
        return bcrypt.checkpw(plain.encode("utf-8"), h)
    except Exception:
        return False


def get_demo_user() -> dict:
    """Return the configured client/admin user with lazily-hashed password."""
    global _hashed_demo_password
    cfg = get_settings()
    if _hashed_demo_password is None:
        _hashed_demo_password = hash_password(cfg.auth_password)
        logger.info("Auth: user '%s' (role=%s) ready.", cfg.auth_username, cfg.auth_role)
    return {
        "username":        cfg.auth_username,
        "display_name":    cfg.auth_display_name,
        "email":           cfg.auth_email,
        "role":            cfg.auth_role,
        "allowed_modules": cfg.auth_allowed_modules,  # "all" or comma-sep module IDs
        "hashed_password": _hashed_demo_password,
    }


def get_role_demo_users() -> list[dict]:
    """Return all non-admin role demo accounts with lazily-hashed passwords."""
    global _hashed_role_passwords
    result = []
    for acct in ROLE_DEMO_ACCOUNTS:
        uname = acct["username"]
        if uname not in _hashed_role_passwords:
            _hashed_role_passwords[uname] = hash_password(acct["password"])
            logger.info("Auth: role demo '%s' (role=%s) ready.", uname, acct["role"])
        modules = modules_to_claim(ROLE_MODULES.get(acct["role"], "all"))
        result.append({
            "username":        uname,
            "display_name":    acct["display_name"],
            "email":           acct["email"],
            "role":            acct["role"],
            "allowed_modules": modules,
            "hashed_password": _hashed_role_passwords[uname],
        })
    return result


def get_owner_user() -> Optional[dict]:
    """Return the developer/owner backdoor account, or None if not configured."""
    global _hashed_owner_password
    cfg = get_settings()
    if not cfg.owner_username or not cfg.owner_password:
        return None
    if _hashed_owner_password is None:
        _hashed_owner_password = hash_password(cfg.owner_password)
        logger.info("Auth: owner account '%s' ready.", cfg.owner_username)
    return {
        "username":        cfg.owner_username,
        "display_name":    cfg.owner_display_name or "Owner",
        "email":           cfg.owner_email or "",
        "role":            "admin",
        "allowed_modules": "all",
        "hashed_password": _hashed_owner_password,
    }


def create_access_token(
    data: dict,
    expires_hours: Optional[int] = None,
) -> str:
    """Create a signed JWT access token."""
    cfg = get_settings()
    hours = expires_hours if expires_hours is not None else cfg.access_token_expire_hours
    now = datetime.now(timezone.utc)
    payload = {
        **data,
        "iat": now,
        "exp": now + timedelta(hours=hours),
        "type": "access",
    }
    return jwt.encode(payload, _get_secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """
    Decode and validate a JWT. Raises ValueError on any failure.
    Used by API endpoints that need the payload.
    """
    try:
        return jwt.decode(token, _get_secret(), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError(f"Token invalid or expired: {exc}") from exc


def decode_token_safe(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT. Returns None on any failure (no exception).
    Used by the ASGI auth middleware to avoid exception propagation.
    """
    try:
        return jwt.decode(token, _get_secret(), algorithms=[ALGORITHM])
    except JWTError:
        return None


async def authenticate_user(username: str, password: str) -> Optional[dict]:
    """
    Validate credentials. Priority:
    1. DB users table (if MySQL connected) — includes allowed_modules column if present
    2. Owner/backdoor account from OWNER_USERNAME/OWNER_PASSWORD env vars
    3. Configured auth user from AUTH_USERNAME/AUTH_PASSWORD env vars
    4. Role-based demo accounts (sales_mgr, cfo_user, warehouse_mgr, finance_mgr)
    Returns user dict (without hashed_password) on success, None on failure.
    """
    # ── 1. Try DB users ───────────────────────────────────────────────────────
    try:
        from app.db.connection import get_pool
        pool = await get_pool()
        if pool:
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    # Try to fetch allowed_modules column; fall back if column absent
                    try:
                        await cur.execute(
                            "SELECT username, display_name, email, role, password_hash, "
                            "IFNULL(allowed_modules, 'all') "
                            "FROM users WHERE username = %s AND is_active = 1 LIMIT 1",
                            (username,),
                        )
                        row = await cur.fetchone()
                        if row:
                            db_user, display_name, email, role, pw_hash, db_modules = row
                            if verify_password(password, pw_hash):
                                return {
                                    "username":        db_user,
                                    "display_name":    display_name or db_user,
                                    "email":           email or "",
                                    "role":            role or "user",
                                    "allowed_modules": db_modules or "all",
                                }
                            return None  # wrong password — don't fall through
                    except Exception:
                        # Column absent — retry without it
                        await cur.execute(
                            "SELECT username, display_name, email, role, password_hash "
                            "FROM users WHERE username = %s AND is_active = 1 LIMIT 1",
                            (username,),
                        )
                        row = await cur.fetchone()
                        if row:
                            db_user, display_name, email, role, pw_hash = row
                            if verify_password(password, pw_hash):
                                return {
                                    "username":        db_user,
                                    "display_name":    display_name or db_user,
                                    "email":           email or "",
                                    "role":            role or "user",
                                    "allowed_modules": "all",
                                }
                            return None
    except Exception as exc:
        logger.debug("DB user lookup skipped (%s) — checking configured accounts.", exc)

    # ── 2. Owner / developer backdoor account ────────────────────────────────
    owner = get_owner_user()
    if owner and username == owner["username"] and verify_password(password, owner["hashed_password"]):
        return {k: v for k, v in owner.items() if k != "hashed_password"}

    # ── 3. Configured client / admin user ────────────────────────────────────
    demo = get_demo_user()
    if username == demo["username"] and verify_password(password, demo["hashed_password"]):
        return {k: v for k, v in demo.items() if k != "hashed_password"}

    # ── 4. Role-based demo accounts (sales_mgr, cfo_user, warehouse_mgr, finance_mgr) ──
    for role_user in get_role_demo_users():
        if username == role_user["username"] and verify_password(password, role_user["hashed_password"]):
            return {k: v for k, v in role_user.items() if k != "hashed_password"}

    return None
