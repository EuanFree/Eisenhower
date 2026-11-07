"""HTTP security headers middleware.

This module adds security headers to every HTTP response to protect
against common web vulnerabilities:

- **Strict-Transport-Security (HSTS)** — Forces browsers to use HTTPS
  only, preventing protocol downgrade attacks.
- **X-Content-Type-Options** — Prevents MIME-type sniffing.
- **X-Frame-Options** — Prevents clickjacking by disallowing framing.
- **X-XSS-Protection** — Enables browser-side XSS filtering.
- **Referrer-Policy** — Controls how much referrer information is sent.
- **Permissions-Policy** — Restricts access to browser features.
- **Content-Security-Policy** — Restricts resource loading to trusted
  origins.

The middleware is applied globally in ``app/main.py`` and runs after
all other middleware, ensuring headers are present on every response.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every HTTP response.

    This middleware intercepts every response and adds a set of
    security headers to protect against common web vulnerabilities.
    It runs after all other middleware and routers, so it applies
    to all endpoints uniformly.

    Headers Added
    -------------
    - Strict-Transport-Security: max-age=31536000; includeSubDomains
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - X-XSS-Protection: 1; mode=block
    - Referrer-Policy: strict-origin-when-cross-origin
    - Permissions-Policy: camera=(), microphone=(), geolocation=()
    - Content-Security-Policy: default-src 'self'; ...
    - Cache-Control: no-store (for API responses)
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process the request and add security headers to the response.

        Parameters
        ----------
        request : Request
            The incoming HTTP request.
        call_next : callable
            The downstream handler (router or middleware).

        Returns
        -------
        Response
            The response with security headers added.
        """
        response = await call_next(request)

        # HSTS — Force HTTPS for 1 year, include subdomains
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Enable browser XSS filtering
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restrict browser features
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), "
            "payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
        )

        # Content Security Policy — restrict resource loading
        # Relax CSP on interactive API documentation routes (/docs, /redoc) which load Swagger/ReDoc assets from CDN
        if request.url.path in ("/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
                "img-src 'self' data: blob: https://fastapi.tiangolo.com https://cdn.jsdelivr.net; "
                "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
                "connect-src 'self' ws: wss:;"
            )
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "font-src 'self'; "
                "connect-src 'self' ws: wss:; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )

        # Prevent caching of sensitive API responses
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"

        return response
