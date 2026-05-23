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
