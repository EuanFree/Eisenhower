# ============================================================
# Eisenhower Portfolio Manager — Frontend Dockerfile
# ============================================================
#
# Multi-stage build for air-gapped, hardened deployment.
# Stage 1: builder — Compiles Vite/React TypeScript assets
# Stage 2: runtime — Serves static assets via hardened Nginx
#
# SECURITY:
# - Content-Security-Policy (CSP) headers
# - X-Frame-Options: DENY (clickjacking protection)
# - X-Content-Type-Options: nosniff (MIME sniffing protection)
# - Strict-Transport-Security (HSTS)
# - Non-root Nginx user
# - No build tools in runtime image
#
# PREREQUISITES (on build host with internet):
#   docker build -f deploy/docker/frontend.Dockerfile -t eisenhower-frontend:latest .
#
# AIR-GAP DEPLOYMENT:
#   docker save eisenhower-frontend:latest | gzip > eisenhower-frontend.tar.gz
#   # Transfer via optical media or USB diode
#   docker load < eisenhower-frontend.tar.gz
# ============================================================

# -----------------------------------------------------------
# Stage 1: Builder — Compile Vite/React assets
# -----------------------------------------------------------
FROM node:20-slim AS builder

LABEL org.opencontainers.image.title="Eisenhower Frontend Builder"

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /build

# Copy package files first for layer caching
COPY frontend/package.json frontend/package-lock.json* /build/

# Install all npm dependencies (including devDependencies for build)
RUN npm ci --no-audit --no-fund --loglevel=error \
    || npm install --no-audit --no-fund --loglevel=error

# Copy the full frontend source
COPY frontend/ /build/

# Build the production bundle
# Vite outputs to /build/dist/
RUN npm run build

# -----------------------------------------------------------
# Stage 2: Runtime — Hardened Nginx
# -----------------------------------------------------------
FROM nginx:1.25-alpine

LABEL org.opencontainers.image.title="Eisenhower Portfolio Manager Frontend"
LABEL org.opencontainers.image.description="Hardened Nginx serving compiled React assets"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Eisenhower Systems"
LABEL org.opencontainers.image.licenses="UNLICENSED"

# Copy compiled assets from builder
COPY --from=builder /build/dist/ /usr/share/nginx/html/

# Copy hardened Nginx configuration
COPY deploy/docker/nginx.conf /etc/nginx/nginx.conf

# Remove default Nginx config
RUN rm -f /etc/nginx/conf.d/default.conf

# Create unprivileged system user and group for runtime
# nginx:1.25-alpine includes a built-in 'nginx' user (UID 101), but we
# create an explicit unprivileged user to match the backend Dockerfile
# convention and enforce defense-in-depth.
RUN addgroup -g 10001 -S appgroup \
    && adduser -u 10001 -G appgroup -S -s /sbin/nologin appuser

# Create cache directories and set permissions
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/run \
    && chown -R appuser:appgroup /var/cache/nginx /var/log/nginx /var/run \
    && chown -R appuser:appgroup /usr/share/nginx/html \
    && chmod 777 /var/run

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/ || exit 1

# Expose the frontend port
EXPOSE 8080

# Switch to unprivileged user for runtime
# Note: nginx.conf 'user' directive is set to 'appuser' to match
USER 10001:10001

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
