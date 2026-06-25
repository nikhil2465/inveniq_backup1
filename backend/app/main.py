"""InvenIQ — Inventory Intelligence Platform — FastAPI Application Entry Point."""
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

_PROD = os.getenv("ENVIRONMENT", "").lower() in ("production", "prod")

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.limiter import limiter, RATE_LIMIT_AVAILABLE as _RATE_LIMIT_AVAILABLE, RateLimitExceeded, _rate_limit_exceeded_handler

from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.po_grn import router as po_grn_router
from app.api.dashboard import router as dashboard_router
from app.api.discounts import router as discounts_router
from app.api.louvers_laminates import router as louvers_router
from app.api.customer_claims import router as claims_router
from app.api.analytics import router as analytics_router
from app.api.catalog import router as catalog_router
from app.api.product_import import router as product_import_router
from app.api.projects import router as projects_router
from app.api.quotes import router as quotes_router
from app.api.credit import router as credit_router
from app.api.pos import router as pos_router
from app.api.schemes import router as schemes_router
from app.api.warehouse import router as warehouse_router
from app.api.tally_export import router as tally_router
from app.api.sales_return import router as sales_return_router
from app.api.landing_cost import router as landing_cost_router
from app.api.damage import router as damage_router
from app.api.distributor import router as distributor_router
from app.api.purchase_requisition import router as pr_router
from app.api.qc_inspection import router as qc_router
from app.api.invoice_matching import router as invoice_matching_router
from app.api.design_quotes import router as design_quotes_router
from app.api.invoices import router as invoices_router
from app.api.reports import router as reports_router
from app.api.company_profile import router as company_profile_router
from app.api.costing import router as costing_router
from app.core.config import get_settings

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

# ── JWT Auth Middleware ────────────────────────────────────────────────────────
# Pure ASGI middleware — zero impact on streaming responses (no BaseHTTPMiddleware buffering)
_AUTH_PUBLIC = frozenset({
    "/api/health", "/api/ready", "/api/db/status",
    "/", "/docs", "/openapi.json", "/redoc",
})

# ── Module Access Middleware — maps module IDs → API route prefixes ───────────
# API paths allowed for each module. Prefixes are matched with startswith().
_MODULE_API_PREFIXES: dict[str, tuple[str, ...]] = {
    "overview":    ("/api/overview", "/api/alerts", "/api/data-status", "/api/validate"),
    "analytics":   ("/api/analytics",),
    "inventory":   ("/api/inventory",),
    "catalog":     ("/api/catalog",),
    "demand":      ("/api/demand",),
    "deadstock":   ("/api/dead-stock",),
    "inward":      ("/api/inward",),
    "warehouse":   ("/api/warehouses", "/api/warehouse", "/api/stock-dispatch", "/api/distributors"),
    "salesreturn": ("/api/sales-returns",),
    "landingcost": ("/api/landing-cost",),
    "distributor": ("/api/distributor",),
    "damage":      ("/api/damage",),
    "procurement": ("/api/procurement",),
    "pogrn":       ("/api/po-grn", "/api/po", "/api/grn", "/api/quotations", "/api/purchase-returns"),
    "sales":       ("/api/sales",),
    "customers":   ("/api/customers",),
    "louvers":     ("/api/orders", "/api/sales-orders"),
    "orders":      ("/api/orders",),
    "freight":     ("/api/freight",),
    "pos":         ("/api/pos",),
    "quotes":      ("/api/quotes",),
    "discounts":   ("/api/discounts",),
    "schemes":     ("/api/schemes",),
    "claims":      ("/api/claims",),
    "finance":     ("/api/finance",),
    "credit":      ("/api/credit",),
    "projects":    ("/api/projects",),
    "chatbot":     ("/api/chat",),
    "settings":    ("/api/settings", "/api/company-profile", "/api/auth/users"),
    "about":       (),  # About has no API calls
    "tally":       ("/api/tally",),
    "pr":          ("/api/pr",),
    "qc":          ("/api/qc",),
    "invoicematch":("/api/invoice-matching",),
    "designquote": ("/api/design-quotes",),
    "invoices":    ("/api/invoices",),
    "reports":     ("/api/reports",),
    "costing":     ("/api/costing",),
}

# API paths always accessible regardless of module list (health + auth + settings + public token approval)
_MODULE_ALWAYS_ALLOWED: tuple[str, ...] = (
    "/api/auth/",
    "/api/health",
    "/api/ready",
    "/api/db/status",
    "/api/settings",
    "/api/version",
    "/api/design-quotes/token-review/",
    "/api/design-quotes/token-approve/",
)


class AuthMiddleware:
    """Validates JWT Bearer tokens on all /api/* requests except public paths."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Pass through non-HTTP scopes (WebSocket, lifespan, etc.)
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path   = scope.get("path", "")
        method = scope.get("method", "")

        # Always pass: OPTIONS (CORS preflight), non-API paths, auth endpoints, public paths
        if (
            method == "OPTIONS"
            or not path.startswith("/api/")
            or path.startswith("/api/auth/")
            or path in _AUTH_PUBLIC
            or path.startswith("/api/design-quotes/token-review/")
            or path.startswith("/api/design-quotes/token-approve/")
        ):
            await self.app(scope, receive, send)
            return

        # Extract Authorization header (headers are byte tuples, always lowercase in ASGI)
        headers_dict = {k: v for k, v in scope.get("headers", [])}
        auth_value   = headers_dict.get(b"authorization", b"").decode("utf-8", errors="ignore")

        if not auth_value.startswith("Bearer "):
            response = JSONResponse(
                {"error": "Authentication required. Please log in.", "code": "AUTH_REQUIRED"},
                status_code=401,
            )
            await response(scope, receive, send)
            return

        from app.core.auth import decode_token_safe  # late import avoids circular at module load
        payload = decode_token_safe(auth_value[7:])
        if payload is None:
            response = JSONResponse(
                {"error": "Session expired or token invalid. Please log in again.", "code": "AUTH_INVALID"},
                status_code=401,
            )
            await response(scope, receive, send)
            return

        # Attach decoded user to scope for downstream use
        scope["user"] = payload
        await self.app(scope, receive, send)


class ModuleAccessMiddleware:
    """
    Enforces module-level API access based on `allowed_modules` claim in the JWT.
    Runs AFTER AuthMiddleware (which sets scope["user"]).
    - role="admin" or allowed_modules="all" → unrestricted.
    - Otherwise → only API prefixes matching the allowed module list are permitted.
    Returns 403 for blocked paths; non-API paths always pass through.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path   = scope.get("path", "")
        method = scope.get("method", "")

        # Non-API paths (static files, docs) always pass
        if method == "OPTIONS" or not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        # Always-allowed API paths (health, auth, settings)
        if any(path.startswith(p) for p in _MODULE_ALWAYS_ALLOWED):
            await self.app(scope, receive, send)
            return

        # Read user from scope (set by AuthMiddleware)
        user = scope.get("user", {})
        role            = user.get("role", "")
        allowed_modules = user.get("allowed_modules", "all")

        # Admin role or "all" = unrestricted
        if role == "admin" or allowed_modules == "all":
            await self.app(scope, receive, send)
            return

        # Parse module list (stored as comma-separated string or list in JWT)
        if isinstance(allowed_modules, str):
            module_list = [m.strip() for m in allowed_modules.split(",") if m.strip()]
        else:
            module_list = list(allowed_modules)

        # Check if path matches any allowed module's API prefixes
        for module_id in module_list:
            prefixes = _MODULE_API_PREFIXES.get(module_id, ())
            if any(path.startswith(p) for p in prefixes):
                await self.app(scope, receive, send)
                return

        # Path not covered by any allowed module — deny
        response = JSONResponse(
            {
                "error": "Access denied. This feature is not available in your plan.",
                "code":  "MODULE_RESTRICTED",
            },
            status_code=403,
        )
        await response(scope, receive, send)


try:
    from app.db.connection import close_pool, get_pool, is_db_available
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False

    async def get_pool():
        return None

    async def close_pool():
        pass

    async def is_db_available():
        return False


_JWT_DEFAULT_KEY = "inveniq-dev-change-this-in-production-2026"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    cfg = get_settings()
    logger.info("=" * 52)
    logger.info("  InvenIQ v3.7 — AI Inventory Intelligence Platform")
    logger.info("=" * 52)

    # ── JWT secret validation ─────────────────────────────────────────────────
    if cfg.jwt_secret_key == _JWT_DEFAULT_KEY:
        logger.warning("  !! JWT_SECRET_KEY is the dev default — set a strong random key in .env before production !!")

    pool = None
    db_ok = False
    if _DB_AVAILABLE and cfg.mysql_host:
        pool = await get_pool()
        db_ok = pool is not None
        logger.info("  MySQL   : %s  (%s / %s)", "CONNECTED" if db_ok else "FAILED", cfg.mysql_host, cfg.mysql_db)
    else:
        logger.info("  MySQL   : DEMO MODE  (set MYSQL_HOST in .env for live data)")

    # ── Run startup DB migrations ─────────────────────────────────────────────
    if db_ok and pool:
        try:
            from app.services.startup_migrations import run_all as _run_migrations
            mig = await _run_migrations(pool)
            failed = mig.get("failed", [])
            created = mig.get("created", [])
            if failed:
                logger.warning("  Migrations: %d table(s) failed — %s", len(failed), [f["table"] for f in failed])
            else:
                logger.info("  Migrations: %d table(s) verified OK", len(created))
        except Exception as _mig_exc:
            logger.warning("  Migrations: startup migration runner failed — %s", _mig_exc)

    logger.info("  OpenAI  : %s", "CONFIGURED" if cfg.openai_api_key else "NOT SET  (set OPENAI_API_KEY for AI features)")
    logger.info("  Routers : 29  |  Endpoints : 175+")
    logger.info("  Docs    : http://127.0.0.1:8000/docs")
    logger.info("=" * 52)
    yield
    if _DB_AVAILABLE:
        await close_pool()
    logger.info("InvenIQ API shut down.")


app = FastAPI(
    title="InvenIQ API",
    description="Inventory Intelligence Platform — AI-powered insights for dealers & distributors",
    version="3.7.0",
    lifespan=lifespan,
    # Disable Swagger/ReDoc in production so API structure is not exposed to clients
    docs_url=None if _PROD else "/docs",
    redoc_url=None if _PROD else "/redoc",
    openapi_url=None if _PROD else "/openapi.json",
)

_cfg = get_settings()
# Middleware stack (last added = outermost = first to execute on requests)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cfg.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(ModuleAccessMiddleware)  # enforces module access (runs after AuthMiddleware sets scope["user"])
app.add_middleware(AuthMiddleware)  # outermost — validates JWT before any route executes

if _RATE_LIMIT_AVAILABLE and limiter:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log every request with timing, unique request ID for tracing, and security headers."""
    req_id = str(uuid.uuid4())[:8]
    start  = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    # Only log non-health-check calls to keep logs clean
    if request.url.path not in ("/api/health", "/api/db/status"):
        logger.info(
            "[%s] %s %s → %d  %.1fms",
            req_id, request.method, request.url.path, response.status_code, elapsed,
        )
    response.headers["X-Request-ID"]    = req_id
    response.headers["X-Response-Time"] = f"{elapsed:.1f}ms"
    # Security headers — applied to all responses
    response.headers["X-Content-Type-Options"]  = "nosniff"
    response.headers["X-Frame-Options"]         = "DENY"
    response.headers["X-XSS-Protection"]        = "1; mode=block"
    response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]      = "camera=(), microphone=(), geolocation=()"
    # Content-Security-Policy: applied to HTML responses only (SPA index.html).
    # Docs (/docs, /redoc) use external CDN assets and inline scripts — excluded to
    # keep the Swagger UI functional. API JSON responses don't need CSP.
    _ct = response.headers.get("content-type", "")
    if _ct.startswith("text/html") and request.url.path not in ("/docs", "/redoc", "/openapi.json"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "connect-src 'self'; "
            "font-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
    # Prevent browser from caching index.html — ensures the browser always loads
    # the latest main.xxx.js with correct chunk hashes after every new build.
    # Hashed JS/CSS assets (e.g. main.abc123.js) are immutable and can be cached forever.
    if request.url.path in ("/", "/index.html") or (
        response.status_code == 200
        and response.headers.get("content-type", "").startswith("text/html")
    ):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"]        = "no-cache"
        response.headers["Expires"]       = "0"
    return response


app.include_router(auth_router,      prefix="/api")
app.include_router(chat_router,      prefix="/api")
app.include_router(po_grn_router,    prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(discounts_router, prefix="/api")
app.include_router(louvers_router,   prefix="/api")
app.include_router(claims_router,    prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(catalog_router,        prefix="/api")
app.include_router(product_import_router,  prefix="/api")
app.include_router(projects_router,  prefix="/api")
app.include_router(quotes_router,    prefix="/api")
app.include_router(credit_router,    prefix="/api")
app.include_router(pos_router,       prefix="/api")
app.include_router(schemes_router,   prefix="/api")
app.include_router(warehouse_router,     prefix="/api")
app.include_router(tally_router,         prefix="/api")
app.include_router(sales_return_router,  prefix="/api")
app.include_router(landing_cost_router,  prefix="/api")
app.include_router(damage_router,        prefix="/api")
app.include_router(distributor_router,       prefix="/api")
app.include_router(pr_router,                prefix="/api")
app.include_router(qc_router,                prefix="/api")
app.include_router(invoice_matching_router,  prefix="/api")
app.include_router(design_quotes_router,     prefix="/api")
app.include_router(invoices_router,          prefix="/api")
app.include_router(reports_router,           prefix="/api")
app.include_router(company_profile_router,   prefix="/api")
app.include_router(costing_router,           prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


@app.get("/api/version", tags=["Health"])
def api_root():
    return {"service": "InvenIQ API", "version": "3.7.0", "docs": "/docs"}


@app.get("/api/health", tags=["Health"])
async def health():
    cfg = get_settings()
    db_ok = await is_db_available() if _DB_AVAILABLE else False
    return {
        "status": "healthy",
        "openai_configured": bool(cfg.openai_api_key),
        "mysql_connected": db_ok,
        "data_source": "mysql" if db_ok else "demo",
    }


@app.get("/api/ready", tags=["Health"])
async def readiness():
    """Readiness probe — returns 503 if critical services are not available."""
    cfg = get_settings()
    issues = []
    if not cfg.openai_api_key:
        issues.append("OPENAI_API_KEY not configured — AI chat will not work")
    if _DB_AVAILABLE and cfg.mysql_host:
        db_ok = await is_db_available()
        if not db_ok:
            issues.append(f"MySQL unreachable at {cfg.mysql_host} — running in demo mode")
    if issues:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "issues": issues, "ai_enabled": bool(cfg.openai_api_key)},
        )
    return {"status": "ready", "ai_enabled": True, "data_source": "mysql" if (_DB_AVAILABLE and cfg.mysql_host) else "demo"}


@app.get("/api/db/status", tags=["Health"])
async def db_status():
    if not _DB_AVAILABLE:
        return {"mysql_available": False, "reason": "aiomysql not installed", "data_source": "demo"}
    cfg = get_settings()
    if not cfg.mysql_host:
        return {"mysql_available": False, "reason": "MYSQL_HOST not configured", "data_source": "demo"}
    ok = await is_db_available()
    return {
        "mysql_available": ok,
        "host": cfg.mysql_host,
        "database": cfg.mysql_db,
        "data_source": "mysql" if ok else "demo",
        "reason": "Connected" if ok else "Connection failed — check credentials",
    }


@app.get("/api/settings", tags=["Health"])
async def get_settings_info():
    """System configuration summary — consumed by the Settings view."""
    cfg = get_settings()
    db_ok = await is_db_available() if _DB_AVAILABLE else False
    openai_ok = bool(cfg.openai_api_key)
    return {
        "version": "3.7.0",
        "build": "June 2026",
        "edition": "Enterprise",
        "database": {
            "connected": db_ok,
            "host": cfg.mysql_host or None,
            "db_name": cfg.mysql_db or None,
            "data_source": "mysql" if db_ok else "demo",
        },
        "ai": {
            "openai_configured": openai_ok,
            "chat_model": "gpt-4o",
            "analysis_model": "gpt-4o-mini",
            "scanner_model": "gpt-4o (vision)",
            "streaming": "SSE",
            "history_window": 16,
            "tools_count": 27,
            "knowledge_topics": 36,
            "insight_types": 26,
            "rca_templates": 14,
        },
        "modules": [
            "overview", "analytics", "demand", "inventory", "deadstock", "inward",
            "warehouse", "procurement", "pogrn", "catalog", "customers", "louvers", "orders",
            "freight", "sales", "claims", "discounts", "projects", "quotes",
            "finance", "credit", "pos", "schemes", "chatbot", "about", "settings", "tally",
            "salesreturn", "landingcost", "distributor", "damage",
            "pr", "qc", "invoicematch", "designquote", "invoices", "reports",
        ],
        "api_routers": 27,
        "total_endpoints": 175,
    }


# ── Production static file serving ─────────────────────────────────────────
# When the React build exists (npm run build was run), FastAPI serves the SPA
# on the same port as the API — no nginx needed for single-machine installs.
# Dev mode: React runs on :3000 with its own dev server (build dir absent).
# Docker mode: nginx serves static files; build dir is absent in the container.
_FRONTEND_BUILD = (
    Path(sys.executable).parent / "frontend" / "build"
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent.parent.parent / "frontend" / "build"
)
if _FRONTEND_BUILD.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_FRONTEND_BUILD), html=True), name="static")
    logger.info("  Static : React SPA served from %s", _FRONTEND_BUILD)


