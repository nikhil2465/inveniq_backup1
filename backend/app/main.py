"""InvenIQ — Inventory Intelligence Platform — FastAPI Application Entry Point."""
import logging
import time
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _RATE_LIMIT_AVAILABLE = True
    limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
except ImportError:
    _RATE_LIMIT_AVAILABLE = False
    limiter = None

from app.api.chat import router as chat_router
from app.api.po_grn import router as po_grn_router
from app.api.dashboard import router as dashboard_router
from app.api.discounts import router as discounts_router
from app.api.louvers_laminates import router as louvers_router
from app.api.customer_claims import router as claims_router
from app.api.analytics import router as analytics_router
from app.api.catalog import router as catalog_router
from app.api.projects import router as projects_router
from app.api.quotes import router as quotes_router
from app.api.credit import router as credit_router
from app.api.pos import router as pos_router
from app.api.schemes import router as schemes_router
from app.core.config import get_settings

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_settings()
    logger.info("=" * 52)
    logger.info("  InvenIQ v3.0 — AI Inventory Intelligence Platform")
    logger.info("=" * 52)
    if _DB_AVAILABLE and cfg.mysql_host:
        pool = await get_pool()
        db_ok = pool is not None
        logger.info("  MySQL   : %s  (%s / %s)", "CONNECTED" if db_ok else "FAILED", cfg.mysql_host, cfg.mysql_db)
    else:
        logger.info("  MySQL   : DEMO MODE  (set MYSQL_HOST in .env for live data)")
    logger.info("  OpenAI  : %s", "CONFIGURED" if cfg.openai_api_key else "NOT SET  (set OPENAI_API_KEY for AI features)")
    logger.info("  Routers : 13  |  Endpoints : 75+")
    logger.info("  Docs    : http://127.0.0.1:8000/docs")
    logger.info("=" * 52)
    yield
    if _DB_AVAILABLE:
        await close_pool()
    logger.info("InvenIQ API shut down.")


app = FastAPI(
    title="InvenIQ API",
    description="Inventory Intelligence Platform — AI-powered insights for dealers & distributors",
    version="3.0",
    lifespan=lifespan,
)

_cfg = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cfg.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

if _RATE_LIMIT_AVAILABLE and limiter:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log every request with timing and a unique request ID for tracing."""
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
    response.headers["X-Request-ID"]   = req_id
    response.headers["X-Response-Time"] = f"{elapsed:.1f}ms"
    return response


app.include_router(chat_router,      prefix="/api")
app.include_router(po_grn_router,    prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(discounts_router, prefix="/api")
app.include_router(louvers_router,   prefix="/api")
app.include_router(claims_router,    prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(catalog_router,   prefix="/api")
app.include_router(projects_router,  prefix="/api")
app.include_router(quotes_router,    prefix="/api")
app.include_router(credit_router,    prefix="/api")
app.include_router(pos_router,       prefix="/api")
app.include_router(schemes_router,   prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


@app.get("/", tags=["Health"])
def root():
    return {"service": "InvenIQ API", "version": "3.0", "docs": "/docs"}


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
        "version": "3.0.0",
        "build": "May 2026",
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
            "tools_count": 16,
            "knowledge_topics": 19,
            "insight_types": 10,
            "rca_templates": 14,
        },
        "modules": [
            "overview", "analytics", "demand", "inventory", "deadstock", "inward",
            "procurement", "pogrn", "catalog", "customers", "louvers", "orders",
            "freight", "sales", "claims", "discounts", "projects", "quotes",
            "finance", "credit", "pos", "schemes", "chatbot", "about", "settings",
        ],
        "api_routers": 11,
        "total_endpoints": 70,
    }
