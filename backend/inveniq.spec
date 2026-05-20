# -*- mode: python ; coding: utf-8 -*-
"""
InvenIQ — PyInstaller build specification.

Run from the project root using deploy\windows\build_exe.bat
or manually:
    cd backend
    pyinstaller inveniq.spec --distpath ..\dist\exe --workpath ..\build\pyinstaller --noconfirm

Output: dist\exe\InvenIQ\
    InvenIQ.exe      <- compiled executable (no Python source visible)
    _internal\       <- Python runtime + compiled modules (required, do not delete)
"""
from pathlib import Path

block_cipher = None
BACKEND = Path(SPECPATH).resolve()  # absolute path to backend/

a = Analysis(
    [str(BACKEND / "inveniq_launcher.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=[
        # JSON persistence files — copied to _internal/data/ in the bundle
        (str(BACKEND / "data"), "data"),
    ],
    hiddenimports=[
        # ── uvicorn internals (not detected by static analysis) ───────────────
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        # ── FastAPI / Starlette ───────────────────────────────────────────────
        "fastapi",
        "starlette.routing",
        "starlette.staticfiles",
        "starlette.responses",
        "starlette.middleware.cors",
        "starlette.middleware.gzip",
        # ── JWT / Auth ────────────────────────────────────────────────────────
        "jose",
        "jose.jwt",
        "jose.algorithms",
        "jose.backends",
        "jose.backends.rsa_backend",
        "passlib",
        "passlib.handlers.bcrypt",
        "bcrypt",
        # ── Async MySQL ───────────────────────────────────────────────────────
        "aiomysql",
        "aiomysql.sa",
        # ── File processing ───────────────────────────────────────────────────
        "aiofiles",
        "fpdf",
        "fpdf2",
        "pypdf",
        "docx",
        "openpyxl",
        "openpyxl.cell._writer",
        # ── AI / HTTP ─────────────────────────────────────────────────────────
        "openai",
        "openai.resources",
        "httpx",
        "httpx._transports.default",
        "httpx._transports.asgi",
        # ── Form / multipart ─────────────────────────────────────────────────
        "multipart",
        "python_multipart",
        # ── Rate limiting ─────────────────────────────────────────────────────
        "slowapi",
        "limits",
        "limits.storage",
        "limits.strategies",
        # ── Pydantic v2 ───────────────────────────────────────────────────────
        "pydantic",
        "pydantic_settings",
        "pydantic.v1",
        # ── Cryptography ─────────────────────────────────────────────────────
        "cryptography",
        "cryptography.hazmat.primitives.ciphers",
        "cryptography.hazmat.backends.openssl",
        # ── tiktoken (used internally by openai SDK) ──────────────────────────
        "tiktoken",
        "tiktoken_ext",
        "tiktoken_ext.openai_public",
        # ── All application modules (ensure none are missed) ──────────────────
        "app.main",
        "app.core.auth",
        "app.core.config",
        "app.core.cache",
        "app.db.connection",
        "app.db.quote_queries",
        "app.db.sales_order_queries",
        "app.api.auth",
        "app.api.chat",
        "app.api.dashboard",
        "app.api.po_grn",
        "app.api.discounts",
        "app.api.louvers_laminates",
        "app.api.customer_claims",
        "app.api.analytics",
        "app.api.catalog",
        "app.api.projects",
        "app.api.quotes",
        "app.api.credit",
        "app.api.pos",
        "app.api.schemes",
        "app.api.warehouse",
        "app.api.tally_export",
        "app.services.orchestrator",
        "app.services.tools",
        "app.services.selector",
        "app.services.rca",
        "app.services.knowledge",
        "app.services.insights_engine",
        "app.services.email_service",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "scipy",
        "pandas",
        "PIL",
        "IPython",
        "jupyter",
        "notebook",
        "pytest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="InvenIQ",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # Shows the server console — clients see startup status
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="InvenIQ",
)
