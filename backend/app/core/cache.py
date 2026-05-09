"""Simple in-process TTL cache for InvenIQ API responses.

Usage:
    from app.core.cache import ttl_cache

    @ttl_cache(ttl=30)
    async def my_endpoint():
        ...
"""
import asyncio
import functools
import time
from typing import Any, Callable, Dict, Tuple

_store: Dict[str, Tuple[float, Any]] = {}


def ttl_cache(ttl: int = 30):
    """Decorator that caches the return value of an async function for `ttl` seconds.
    Cache key is built from the function name + all positional and keyword args.
    Cache is process-local and resets on server restart.
    """
    def decorator(fn: Callable):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            key = f"{fn.__module__}.{fn.__qualname__}:{args}:{sorted(kwargs.items())}"
            now = time.monotonic()
            if key in _store:
                expires, value = _store[key]
                if now < expires:
                    return value
            result = await fn(*args, **kwargs)
            _store[key] = (now + ttl, result)
            return result
        wrapper.cache_clear = lambda: _store.clear()
        return wrapper
    return decorator


def invalidate_all():
    _store.clear()
