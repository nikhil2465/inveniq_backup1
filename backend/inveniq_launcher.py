"""
InvenIQ — PyInstaller entry point.
Compiles to InvenIQ.exe. This is the ONLY file the launcher needs.
All app code (backend/app/) is compiled into the executable automatically.
"""
import multiprocessing
import os
import sys
from pathlib import Path


def _setup_frozen_env() -> None:
    """
    When running as a compiled .exe, set the working directory to the folder
    containing the executable. This ensures:
      - .env is loaded from the install directory (not PyInstaller's temp dir)
      - data/ files are read/written from the install directory
      - frontend/build/ is found relative to the install directory
    """
    exe_dir = Path(sys.executable).parent
    os.chdir(exe_dir)


if __name__ == "__main__":
    multiprocessing.freeze_support()

    if getattr(sys, "frozen", False):
        _setup_frozen_env()

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        workers=1,              # Must be 1 — multiprocessing spawn is incompatible with frozen exe
        timeout_keep_alive=75,  # Keep AI streaming (SSE) connections alive
        timeout_graceful_shutdown=10,
        log_level="warning",
    )
