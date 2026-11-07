# ============================================================
# Eisenhower Portfolio Manager — Backend Dockerfile
# ============================================================
#
# Multi-stage build for air-gapped, hardened deployment.
# Based on python:3.11-slim (Debian Bookworm) with minimal
# surface area. Drops privileges to non-root user (appuser:10001).
#
# Stage 1: builder — Compiles native extensions (libpq, OpenBLAS)
# Stage 2: runtime — Minimal image with pre-compiled wheels
#
# SECURITY:
# - Non-root user (UID 10001)
# - No shell access for the runtime user
# - Read-only filesystem where possible
# - No outbound internet required at runtime
#
# PREREQUISITES (on build host with internet):
#   docker build -f deploy/docker/backend.Dockerfile -t eisenhower-backend:latest .
#
# AIR-GAP DEPLOYMENT:
#   docker save eisenhower-backend:latest | gzip > eisenhower-backend.tar.gz
#   # Transfer via optical media or USB diode
#   docker load < eisenhower-backend.tar.gz
# ============================================================

# -----------------------------------------------------------
# Stage 1: Builder — Install native deps & compile wheels
# -----------------------------------------------------------
FROM python:3.11-slim-bookworm AS builder

# Prevent interactive prompts during apt
ENV DEBIAN_FRONTEND=noninteractive

# Native dependencies for:
# - PostgreSQL client (libpq-dev)
# - Scientific computing (gcc, g++, libopenblas-dev)
# - PDF generation (libfreetype, libfontconfig)
# - General build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    libopenblas-dev \
    libfreetype6-dev \
    libfontconfig1-dev \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment for wheel building
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements first for layer caching
COPY requirements.txt /build/requirements.txt

# Install all dependencies with their sub-dependencies
RUN pip install --no-cache-dir \
    -r /build/requirements.txt \
    && pip freeze > /build/frozen.txt

# -----------------------------------------------------------
# Stage 2: Runtime — Minimal hardened image
# -----------------------------------------------------------
FROM python:3.11-slim-bookworm

LABEL org.opencontainers.image.title="Eisenhower Portfolio Manager Backend"
LABEL org.opencontainers.image.description="Enterprise defence portfolio management API"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Eisenhower Systems"
LABEL org.opencontainers.image.licenses="UNLICENSED"

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Runtime-only native dependencies (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libopenblas0 \
    libfreetype6 \
    libfontconfig1 \
    libjpeg62-turbo \
    zlib1g \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge -y --auto-remove \
    && apt-get clean

# Create non-root user with specific UID
RUN groupadd -g 10001 appgroup \
    && useradd -u 10001 -g appgroup -s /sbin/nologin -m appuser

# Copy the virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy application code
COPY app/ /app/app/
COPY init_db.py /app/init_db.py
COPY scripts/ /app/scripts/

# Create directories for runtime data
RUN mkdir -p /app/tmp /app/logs \
    && chown -R appuser:appgroup /app \
    && chmod -R 750 /app

# Environment defaults
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=production \
    APP_ENVIRONMENT=production \
    SECRET_KEY=CHANGE_ME_IN_PRODUCTION \
    APP_SECRET_KEY=CHANGE_ME_IN_PRODUCTION \
    DATABASE_URL=postgresql://eisenhower:eisenhower@postgres:5432/eisenhower \
    REDIS_URL=redis://redis:6379/0 \
    S3_ENDPOINT_URL=http://minio:9000 \
    S3_BUCKET_NAME=eisenhower-artifacts \
    S3_ACCESS_KEY=minioadmin \
    S3_SECRET_KEY=minioadmin \
    JWT_ALGORITHM=HS256 \
    JWT_EXPIRATION_MINUTES=480

# Expose the API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Switch to non-root user
USER appuser

# Run with Gunicorn + Uvicorn workers
CMD ["gunicorn", "app.main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--graceful-timeout", "30", \
     "--access-logfile", "/app/logs/access.log", \
     "--error-logfile", "/app/logs/error.log"]
