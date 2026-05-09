"""Async MySQL connection pool for InvenIQ."""
import asyncio
import logging
from typing import Optional
import aiomysql
from app.core.config import get_settings

logger = logging.getLogger(__name__)
_pool: Optional[aiomysql.Pool] = None


async def get_pool() -> Optional[aiomysql.Pool]:
    global _pool
    # Reset if the pool was closed (e.g. MySQL restarted)
    if _pool is not None and _pool.closed:
        logger.warning("Pool is closed — resetting for reconnection")
        _pool = None
    if _pool is not None:
        return _pool
    cfg = get_settings()
    if not cfg.mysql_host:
        return None
    try:
        _pool = await aiomysql.create_pool(
            host=cfg.mysql_host,
            port=cfg.mysql_port,
            user=cfg.mysql_user,
            password=cfg.mysql_password,
            db=cfg.mysql_db,
            charset="utf8mb4",
            minsize=1,
            maxsize=10,
            autocommit=True,
            connect_timeout=10,
        )
        logger.info("MySQL pool created: %s/%s", cfg.mysql_host, cfg.mysql_db)
        return _pool
    except Exception as exc:
        logger.warning("MySQL connection failed: %s", exc)
        return None


async def close_pool() -> None:
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


async def is_db_available() -> bool:
    global _pool
    pool = await get_pool()
    if not pool:
        return False
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
        return True
    except Exception:
        # Mark pool for recreation on next get_pool() call
        _pool = None
        return False
