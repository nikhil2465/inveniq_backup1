# ─────────────────────────────────────────────────────────────────────────────
# InvenIQ — FastAPI Backend Production Container
# Python 3.12-slim · uvicorn 4-worker · non-root · health-checked
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

# System deps: curl for health-check probe only
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first — separate layer so code changes don't bust cache
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# 4 workers, proxy-headers so nginx's X-Forwarded-* are trusted
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--proxy-headers", \
     "--forwarded-allow-ips=*", \
     "--access-log"]
