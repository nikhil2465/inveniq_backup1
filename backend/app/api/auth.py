"""
Authentication REST endpoints for InvenIQ.
  POST /api/auth/login   — validate credentials, issue JWT
  GET  /api/auth/me      — verify token, return user info
  POST /api/auth/logout  — client-side logout (token invalidation is stateless)
"""
import logging
from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel, field_validator
from typing import Optional

from app.core.auth import authenticate_user, create_access_token, decode_token
from app.core.config import get_settings

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
    access_token: str
    token_type:   str = "bearer"
    expires_in:   int          # seconds
    user: dict


class UserResponse(BaseModel):
    username:     str
    display_name: str
    email:        str
    role:         str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    """
    Authenticate with username + password.
    Returns a JWT access token on success (8-hour TTL by default).
    Rate-limited to prevent brute-force (via existing slowapi global limit).
    """
    user = await authenticate_user(body.username, body.password)
    if user is None:
        # Log failure with username (not password) for security audit trails
        logger.warning("Auth: failed login attempt for username '%s'", body.username)
        # Generic message — don't reveal whether username or password was wrong
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
    # Include distributor_id claim for distributor accounts so backend can filter stock
    if user.get("distributor_id") is not None:
        token_payload["distributor_id"] = user["distributor_id"]

    token = create_access_token(token_payload)

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
        access_token=token,
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
