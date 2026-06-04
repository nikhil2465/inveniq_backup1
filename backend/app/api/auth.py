"""
Authentication REST endpoints for InvenIQ.
  POST /api/auth/login    — validate credentials, issue JWT + refresh token
  GET  /api/auth/me       — verify token, return user info
  POST /api/auth/refresh  — rotate refresh token, issue new access + refresh token
  POST /api/auth/logout   — client-side logout (token invalidation is stateless)
"""
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Header, Request, status
from pydantic import BaseModel, field_validator
from typing import Optional

from app.core.limiter import limiter, RATE_LIMIT_AVAILABLE

from app.core.auth import (
    authenticate_user,
    create_access_token,
    decode_token,
    create_refresh_token,
    store_refresh_token,
    validate_refresh_token,
    rotate_refresh_token,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.core.config import get_settings

# Claims that are token metadata — excluded when extracting user identity from refresh token
_SKIP_CLAIMS = frozenset({"jti", "rjti", "iat", "nbf", "exp", "type", "iss", "aud"})

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Username cannot be blank")
        if len(v) > 128:
            raise ValueError("Username too long")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Password cannot be blank")
        if len(v) > 128:
            raise ValueError("Password too long")
        return v


class LoginResponse(BaseModel):
    access_token:  str
    refresh_token: Optional[str] = None
    token_type:    str = "bearer"
    expires_in:    int          # seconds
    user:          dict


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    username:     str
    display_name: str
    email:        str
    role:         str


# ── Endpoints ─────────────────────────────────────────────────────────────────

_rate_limit = (limiter.limit("5/minute") if (RATE_LIMIT_AVAILABLE and limiter) else lambda f: f)


@router.post("/login", response_model=LoginResponse)
@_rate_limit
async def login(request: Request, body: LoginRequest):
    user = await authenticate_user(body.username, body.password)
    if user is None:
        logger.warning("Auth: failed login attempt for username '%s'", body.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    cfg = get_settings()
    allowed_modules = user.get("allowed_modules", "all")

    token_payload: dict = {
        "sub":             user["username"],
        "display_name":    user["display_name"],
        "email":           user["email"],
        "role":            user["role"],
        "allowed_modules": allowed_modules,
    }
    if user.get("distributor_id") is not None:
        token_payload["distributor_id"] = user["distributor_id"]

    access_token = create_access_token(token_payload)

    # Decode immediately to get the jti for refresh token linking (same key, no I/O)
    try:
        token_jti = decode_token(access_token)["jti"]
    except Exception:
        token_jti = ""

    # Create refresh token (7-day TTL, embeds user claims for rotation)
    rt_str, rt_jti = create_refresh_token(token_jti, token_payload)

    # Persist refresh token in DB — non-blocking; demo mode works without it
    try:
        from app.db.connection import get_pool
        pool = await get_pool()
        if pool:
            now = datetime.now(timezone.utc)
            rt_expires = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
            await store_refresh_token(pool, token_jti, rt_jti, user["username"], rt_expires)
    except Exception as exc:
        logger.debug("Auth: refresh token persistence skipped (%s)", exc)

    logger.info(
        "Auth: login success for user '%s' (role=%s, modules=%s)",
        user["username"], user["role"],
        allowed_modules if allowed_modules != "all" else "all",
    )

    user_payload: dict = {
        "username":        user["username"],
        "display_name":    user["display_name"],
        "email":           user["email"],
        "role":            user["role"],
        "allowed_modules": allowed_modules,
    }
    if user.get("distributor_id") is not None:
        user_payload["distributor_id"] = user["distributor_id"]

    return LoginResponse(
        access_token=access_token,
        refresh_token=rt_str,
        expires_in=cfg.access_token_expire_hours * 3600,
        user=user_payload,
    )


@router.post("/refresh", response_model=LoginResponse)
async def refresh_token_endpoint(body: RefreshRequest):
    """
    Issue a new access token using a valid refresh token.
    The refresh token is rotated (old revoked, new issued) preventing replay attacks.
    Works in demo mode — DB revocation check is skipped; JWT expiry alone protects.
    """
    pool = None
    try:
        from app.db.connection import get_pool
        pool = await get_pool()
    except Exception:
        pass

    try:
        payload = await validate_refresh_token(pool, body.refresh_token)
    except ValueError as exc:
        logger.warning("Auth: refresh token validation failed — %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    username        = payload.get("sub", "")
    old_refresh_jti = payload.get("rjti", "")

    # Reconstruct user identity claims from the embedded refresh token payload
    user_claims = {k: v for k, v in payload.items() if k not in _SKIP_CLAIMS}

    # Issue new access token with the same user identity claims
    cfg = get_settings()
    new_access_token = create_access_token(user_claims)
    try:
        new_access_jti = decode_token(new_access_token)["jti"]
    except Exception:
        new_access_jti = ""

    # Rotate: atomically revoke old refresh token + issue new one
    new_rt_str, _ = await rotate_refresh_token(pool, old_refresh_jti, new_access_jti, user_claims)

    logger.info("Auth: token refreshed for user '%s'", username)

    allowed_modules = user_claims.get("allowed_modules", "all")
    user_payload = {
        "username":        username,
        "display_name":    user_claims.get("display_name", username),
        "email":           user_claims.get("email", ""),
        "role":            user_claims.get("role", "user"),
        "allowed_modules": allowed_modules,
    }
    if "distributor_id" in user_claims:
        user_payload["distributor_id"] = user_claims["distributor_id"]

    return LoginResponse(
        access_token=new_access_token,
        refresh_token=new_rt_str,
        expires_in=cfg.access_token_expire_hours * 3600,
        user=user_payload,
    )


@router.get("/me", response_model=UserResponse)
async def me(authorization: Optional[str] = Header(default=None)):
    """
    Verify the current token and return the authenticated user's profile.
    Used by the frontend to validate a stored token on page load.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")

    token = authorization[7:]
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    return UserResponse(
        username=payload.get("sub", ""),
        display_name=payload.get("display_name", payload.get("sub", "")),
        email=payload.get("email", ""),
        role=payload.get("role", "user"),
    )


@router.post("/logout")
async def logout():
    """
    Stateless logout — the client deletes its token.
    Endpoint exists for audit logging and future token blocklist support.
    """
    return {"message": "Logged out successfully"}


# ── User Management (admin-only) ───────────────────────────────────────────────

_USER_ACCOUNTS_DDL = """
CREATE TABLE IF NOT EXISTS user_accounts (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    display_name  VARCHAR(200) NOT NULL,
    email         VARCHAR(200) DEFAULT '',
    role          VARCHAR(50)  NOT NULL DEFAULT 'sales_manager',
    password_hash VARCHAR(255) NOT NULL,
    allowed_modules TEXT       DEFAULT 'all',
    is_active     TINYINT(1)   DEFAULT 1,
    last_login    DATETIME,
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

_demo_users: list = [
    {"id": 1, "username": "admin",       "display_name": "Admin User",       "email": "admin@inveniq.in",       "role": "admin",           "allowed_modules": "all",          "is_active": True,  "last_login": "2026-06-04"},
    {"id": 2, "username": "sales1",      "display_name": "Rajesh Kumar",     "email": "rajesh@inveniq.in",     "role": "sales_manager",   "allowed_modules": "all",          "is_active": True,  "last_login": "2026-06-03"},
    {"id": 3, "username": "warehouse1",  "display_name": "Suresh Patil",     "email": "suresh@inveniq.in",     "role": "warehouse_manager","allowed_modules": "all",         "is_active": True,  "last_login": "2026-06-03"},
    {"id": 4, "username": "cfo",         "display_name": "Priya Sharma",     "email": "priya@inveniq.in",      "role": "cfo",             "allowed_modules": "all",          "is_active": True,  "last_login": "2026-06-02"},
    {"id": 5, "username": "architect",   "display_name": "Arun Menon",       "email": "arun@inveniq.in",       "role": "architect",       "allowed_modules": "designquote,settings,about", "is_active": True, "last_login": "2026-06-01"},
]

def _require_admin(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = decode_token(authorization[7:])
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required for user management")
    return payload


async def _get_pool():
    try:
        from app.db.connection import get_pool
        return await get_pool()
    except Exception:
        return None


async def _ensure_user_table(pool):
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_USER_ACCOUNTS_DDL)
    except Exception as exc:
        logger.warning("user_accounts: DDL failed — %s", exc)


@router.get("/users")
async def list_users(authorization: Optional[str] = Header(default=None)):
    _require_admin(authorization)
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_user_table(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT id, username, display_name, email, role, allowed_modules, is_active, last_login, created_at FROM user_accounts ORDER BY id"
                    )
                    cols = [d[0] for d in cur.description]
                    rows = await cur.fetchall()
                    users = []
                    for r in rows:
                        u = dict(zip(cols, r))
                        u["is_active"] = bool(u.get("is_active", 1))
                        u["last_login"] = str(u["last_login"])[:10] if u.get("last_login") else ""
                        u["created_at"] = str(u["created_at"])[:10] if u.get("created_at") else ""
                        users.append(u)
                    return {"users": users, "data_source": "live"}
        except Exception as exc:
            logger.warning("list_users DB failed: %s", exc)

    return {"users": _demo_users, "data_source": "demo"}


@router.post("/users", status_code=201)
async def create_user(body: dict, authorization: Optional[str] = Header(default=None)):
    _require_admin(authorization)
    from app.core.auth import hash_password as _hp
    uname    = (body.get("username") or "").strip().lower()
    pwd      = (body.get("password") or "").strip()
    dname    = (body.get("display_name") or "").strip()
    email    = (body.get("email") or "").strip()
    role     = (body.get("role") or "sales_manager").strip()
    modules  = (body.get("allowed_modules") or "all").strip()

    if not uname or not pwd or not dname:
        raise HTTPException(status_code=422, detail="username, password, and display_name are required")
    if len(pwd) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    raw_hash = _hp(pwd)
    pwd_hash = raw_hash.decode("utf-8") if isinstance(raw_hash, bytes) else raw_hash
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_user_table(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "INSERT INTO user_accounts (username, display_name, email, role, password_hash, allowed_modules) VALUES (%s,%s,%s,%s,%s,%s)",
                        (uname, dname, email, role, pwd_hash, modules)
                    )
                    new_id = cur.lastrowid
                    await conn.commit()
            return {"id": new_id, "username": uname, "data_source": "live"}
        except Exception as exc:
            if "Duplicate" in str(exc):
                raise HTTPException(status_code=409, detail=f"Username '{uname}' already exists")
            logger.warning("create_user DB failed: %s", exc)

    # Demo fallback
    if any(u["username"] == uname for u in _demo_users):
        raise HTTPException(status_code=409, detail=f"Username '{uname}' already exists")
    new_id = max(u["id"] for u in _demo_users) + 1
    _demo_users.append({"id": new_id, "username": uname, "display_name": dname,
                         "email": email, "role": role, "allowed_modules": modules,
                         "is_active": True, "last_login": "", "created_at": ""})
    return {"id": new_id, "username": uname, "data_source": "demo"}


@router.put("/users/{user_id}")
async def update_user(user_id: int, body: dict, authorization: Optional[str] = Header(default=None)):
    _require_admin(authorization)
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_user_table(pool)
            sets, vals = [], []
            if "display_name" in body: sets.append("display_name=%s"); vals.append(body["display_name"])
            if "email"         in body: sets.append("email=%s");        vals.append(body["email"])
            if "role"          in body: sets.append("role=%s");          vals.append(body["role"])
            if "allowed_modules" in body: sets.append("allowed_modules=%s"); vals.append(body["allowed_modules"])
            if "is_active"     in body: sets.append("is_active=%s");    vals.append(int(body["is_active"]))
            if "password" in body and body["password"]:
                from app.core.auth import hash_password as _hp2
                raw = _hp2(body["password"])
                sets.append("password_hash=%s"); vals.append(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            if not sets:
                raise HTTPException(status_code=422, detail="No fields to update")
            vals.append(user_id)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(f"UPDATE user_accounts SET {', '.join(sets)} WHERE id=%s", vals)
                    await conn.commit()
            return {"success": True, "data_source": "live"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("update_user DB failed: %s", exc)

    # Demo fallback
    for u in _demo_users:
        if u["id"] == user_id:
            u.update({k: v for k, v in body.items() if k in ("display_name","email","role","allowed_modules","is_active")})
    return {"success": True, "data_source": "demo"}


@router.delete("/users/{user_id}")
async def deactivate_user(user_id: int, authorization: Optional[str] = Header(default=None)):
    """Soft-deactivate a user — does not delete the record."""
    _require_admin(authorization)
    pool = await _get_pool()
    if pool:
        try:
            await _ensure_user_table(pool)
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("UPDATE user_accounts SET is_active=0 WHERE id=%s", (user_id,))
                    await conn.commit()
            return {"success": True, "data_source": "live"}
        except Exception as exc:
            logger.warning("deactivate_user DB failed: %s", exc)

    for u in _demo_users:
        if u["id"] == user_id:
            u["is_active"] = False
    return {"success": True, "data_source": "demo"}
