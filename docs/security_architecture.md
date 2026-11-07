# Eisenhower Portfolio Manager — Security Architecture

This document describes the security measures applied to all communication channels between the GUI layer (React frontend), the API layer (FastAPI backend), and the database layer (PostgreSQL, Redis, MinIO).

## Communication Channels

```
┌──────────────┐     HTTPS/TLS 1.3      ┌──────────────┐     SSL/TLS      ┌──────────────┐
│   Browser    │ ──────────────────────► │    Nginx     │ ────────────────► │  FastAPI     │
│   (React)    │ ◄────────────────────── │   Gateway    │ ◄──────────────── │  Backend     │
└──────────────┘                         └──────────────┘                    └──────────────┘
                                                                                   │
                                                                    ┌──────────────┼──────────────┐
                                                          SSL/TLS  │          SSL/TLS           │
                                                          ┌────────▼──┐    ┌─────────▼──────┐   │
                                                          │PostgreSQL │    │     Redis       │   │
                                                          │  (5432)   │    │   (6379/TLS)    │   │
                                                          └───────────┘    └────────────────┘   │
                                                                                               │
                                                                                  HTTP (internal)│
                                                                                  ┌────────────▼──┐
                                                                                  │    MinIO      │
                                                                                  │   (9000)      │
                                                                                  └───────────────┘
```

## 1. Frontend → Backend (HTTPS/TLS 1.3)

**Transport**: HTTPS with TLS 1.2/1.3, terminated at Nginx reverse proxy.

**Security measures**:
- **TLS 1.2/1.3 only** — Older protocols (SSLv3, TLS 1.0, TLS 1.1) are disabled.
- **AEAD cipher suites** — Only strong, authenticated encryption ciphers (AES-256-GCM, ChaCha20-Poly1305).
- **HSTS** — `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` forces browsers to always use HTTPS.
- **HTTP→HTTPS redirect** — Port 80 returns 301 to HTTPS on port 8080.
- **OCSP Stapling** — Certificate revocation status is stapled by the server.
- **Server cipher preference** — Server chooses the cipher suite, not the client.

**Configuration files**:
- `deploy/docker/nginx.conf` — TLS settings, cipher suites, HSTS
- `frontend/src/services/api.ts` — Axios client with HTTPS enforcement

## 2. Backend → Database (SSL/TLS)

**Transport**: PostgreSQL with SSL mode `require` (configurable to `verify-ca` or `verify-full`).

**Security measures**:
- **SSL mode** — Database connections are encrypted in transit via `sslmode=require`.
- **TLS 1.2 minimum** — PostgreSQL is configured with `ssl_min_protocol_version = 'TLSv1.2'`.
- **Certificate-based authentication** — Server certificate is verified by the client.

**Configuration files**:
- `app/config.py` — `DATABASE_SSL_MODE` setting
- `app/database.py` — SQLAlchemy engine with `connect_args={"sslmode": ...}`
- `deploy/docker/init-db.sql` — PostgreSQL SSL configuration
- `deploy/docker-compose.yml` — SSL certificate volume mounts

## 3. Backend → Redis (TLS)

**Transport**: Redis with TLS (`rediss://` scheme).

**Security measures**:
- **TLS-only mode** — Redis listens on TLS port only (`--port 0 --tls-port 6379`).
- **Certificate verification** — Redis server certificate is verified by the client.

**Configuration files**:
- `deploy/docker-compose.yml` — Redis TLS configuration
- `app/config.py` — `REDIS_URL` and `REDIS_SSL` settings

## 4. Backend → MinIO (Internal Network)

**Transport**: HTTP over isolated Docker network (no external exposure).

**Security measures**:
- **Network isolation** — MinIO is only accessible via the `eisenhower-net` Docker network.
- **No external port exposure** — MinIO ports are not exposed to the host.
- **S3 authentication** — Access key and secret key are required for all operations.
- **Server-side encryption** — MinIO uses SSE-S3 by default.

**Configuration files**:
- `deploy/docker-compose.yml` — MinIO network isolation and encryption

## 5. WebSocket (WSS)

**Transport**: Secure WebSocket (WSS) over TLS, terminated at Nginx.

**Security measures**:
- **WSS only** — WebSocket connections use WSS (WebSocket over TLS).
- **JWT authentication** — Every WebSocket connection requires a valid JWT token.
- **Rate limiting** — 5 connections/second per client IP via Nginx.

**Configuration files**:
- `app/routers/websocket.py` — WebSocket endpoint with JWT auth
- `deploy/docker/nginx.conf` — WSS proxy configuration

## 6. Security Headers

All HTTP responses include the following security headers (via `SecurityHeadersMiddleware`):

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Browser XSS filtering |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer info |
| `Permissions-Policy` | `camera=(), microphone=(), ...` | Restrict browser features |
| `Content-Security-Policy` | `default-src 'self'; ...` | Restrict resource loading |
| `Cache-Control` | `no-store` (API only) | Prevent API response caching |

**Configuration files**:
- `app/middleware/security.py` — Security headers middleware
- `app/main.py` — Middleware registration

## 7. CORS Configuration

Cross-Origin Resource Sharing is restricted to:
- **Allowed methods**: GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Allowed headers**: Authorization, Content-Type, Accept
- **Exposed headers**: Link, X-Total-Count
- **Preflight cache**: 600 seconds

**Configuration files**:
- `app/config.py` — `ALLOWED_ORIGINS` setting
- `app/main.py` — CORS middleware configuration

## 8. Authentication

- **JWT tokens** — HS256 algorithm with configurable expiration (default: 480 minutes).
- **Password hashing** — bcrypt with automatic salt generation.
- **PKI/mTLS** — Smartcard authentication via client certificates (UK MOD JSP 440 / JSP 604 compliant).
- **CRL/OCSP revocation** — Certificate revocation checking for PKI authentication.

**Configuration files**:
- `app/utils/security.py` — JWT and password utilities
- `app/utils/auth.py` — Authentication dependencies

## 9. Rate Limiting

- **API requests**: 20/second per client IP (burst: 40)
- **WebSocket connections**: 5/second per client IP (burst: 10)

**Configuration files**:
- `deploy/docker/nginx.conf` — Rate limiting zones

## Setup Instructions

### Generate TLS Certificates

For development and internal use, generate self-signed certificates:

```bash
cd scripts
bash generate-tls-certs.sh
```

This creates certificates in `deploy/tls/`:
- `ca.crt` / `ca.key` — Certificate Authority
- `server.crt` / `server.key` — Server certificate (Nginx, PostgreSQL)
- `redis.crt` / `redis.key` — Redis TLS certificate

### Production Deployment

In production:
1. Replace self-signed certificates with certificates from a trusted CA.
2. Set `DATABASE_SSL_MODE` to `verify-ca` or `verify-full`.
3. Set `ALLOWED_ORIGINS` to your specific domain(s).
4. Set a strong `APP_SECRET_KEY` via environment variables.
5. Configure MinIO with HTTPS if accessible externally.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_SSL_MODE` | PostgreSQL SSL mode | `require` |
| `TLS_ENABLED` | Enable TLS | `true` |
| `TLS_CERT_PATH` | TLS certificate path | `/etc/ssl/certs/eisenhower.crt` |
| `TLS_KEY_PATH` | TLS private key path | `/etc/ssl/private/eisenhower.key` |
| `REDIS_URL` | Redis connection URL | `rediss://redis:6379/0` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `*` |
| `APP_SECRET_KEY` | JWT signing secret | `CHANGE_ME_IN_PRODUCTION` |
