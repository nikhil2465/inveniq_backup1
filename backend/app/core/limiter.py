"""
Shared rate-limiter instance for InvenIQ.
Imported by main.py (to attach to app.state) and by individual routers
(to apply per-endpoint limits) without creating circular imports.
"""
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    from slowapi import _rate_limit_exceeded_handler

    limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
    RATE_LIMIT_AVAILABLE = True
except ImportError:
    limiter = None
    RateLimitExceeded = None
    _rate_limit_exceeded_handler = None
    RATE_LIMIT_AVAILABLE = False
