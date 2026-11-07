"""Tests for the SecurityHeadersMiddleware.

Verifies that every HTTP response includes the expected security headers
and that API responses include additional cache-control headers.

Uses a minimal FastAPI app with only the middleware attached, so tests
run quickly without requiring a database connection.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.security import SecurityHeadersMiddleware


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def app():
    """Create a minimal FastAPI app with only the security middleware."""
    test_app = FastAPI()
    test_app.add_middleware(SecurityHeadersMiddleware)

    @test_app.get("/docs")
    def docs():
        return {"message": "docs"}

    @test_app.get("/api/data")
    def api_data():
        return {"data": "test"}

    @test_app.post("/api/data")
    def api_post_data():
        return {"created": True}

    @test_app.put("/api/data")
    def api_put_data():
        return {"updated": True}

    @test_app.delete("/api/data")
    def api_delete_data():
        return {"deleted": True}

    return test_app


@pytest.fixture
def client(app):
    """Create a TestClient wrapped around the minimal app."""
    return TestClient(app)


# ============================================================================
# Tests
# ============================================================================

class TestSecurityHeadersUniversal:
    """Security headers must be present on every response, regardless of endpoint."""

    def test_hsts_header_present(self, client):
        """Strict-Transport-Security header should be on every response."""
        resp = client.get("/docs")
        hsts = resp.headers.get("strict-transport-security", "")
        assert "max-age=31536000" in hsts
        assert "includeSubDomains" in hsts

    def test_x_content_type_options(self, client):
        """X-Content-Type-Options should prevent MIME sniffing."""
        resp = client.get("/docs")
        assert resp.headers.get("x-content-type-options") == "nosniff"

    def test_x_frame_options(self, client):
        """X-Frame-Options should deny framing to prevent clickjacking."""
        resp = client.get("/docs")
        assert resp.headers.get("x-frame-options") == "DENY"

    def test_x_xss_protection(self, client):
        """X-XSS-Protection should enable browser XSS filtering."""
        resp = client.get("/docs")
        assert resp.headers.get("x-xss-protection") == "1; mode=block"

    def test_referrer_policy(self, client):
        """Referrer-Policy should control referrer information leakage."""
        resp = client.get("/docs")
        assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client):
        """Permissions-Policy should restrict browser feature access."""
        resp = client.get("/docs")
        policy = resp.headers.get("permissions-policy", "")
        assert "camera=()" in policy
        assert "microphone=()" in policy
        assert "geolocation=()" in policy
        assert "payment=()" in policy
        assert "usb=()" in policy
        assert "magnetometer=()" in policy
        assert "gyroscope=()" in policy
        assert "accelerometer=()" in policy

    def test_content_security_policy(self, client):
        """Content-Security-Policy should restrict resource loading."""
        resp = client.get("/docs")
        csp = resp.headers.get("content-security-policy", "")
        assert "default-src 'self'" in csp
        assert "script-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        assert "upgrade-insecure-requests" in csp


class TestSecurityHeadersAPIEndpoints:
    """API endpoints (/api/*) should include additional cache-control headers."""

    def test_cache_control_on_api_response(self, client):
        """API responses must include Cache-Control: no-store."""
        resp = client.get("/api/data")
        cache_control = resp.headers.get("cache-control", "")
        assert "no-store" in cache_control
        assert "no-cache" in cache_control
        assert "must-revalidate" in cache_control

    def test_pragma_on_api_response(self, client):
        """API responses must include Pragma: no-cache for HTTP/1.0 compat."""
        resp = client.get("/api/data")
        assert resp.headers.get("pragma") == "no-cache"

    def test_expires_on_api_response(self, client):
        """API responses must include Expires: 0."""
        resp = client.get("/api/data")
        assert resp.headers.get("expires") == "0"


class TestSecurityHeadersNonAPIEndpoints:
    """Non-API endpoints should NOT include cache-control headers."""

    def test_no_cache_control_on_non_api(self, client):
        """Non-API responses should not have Cache-Control header from middleware."""
        resp = client.get("/docs")
        # The middleware only adds cache headers for /api paths
        # Check that no-store is NOT present (it could have other cache headers from FastAPI)
        cache_control = resp.headers.get("cache-control", "")
        assert "no-store" not in cache_control

    def test_no_pragma_on_non_api(self, client):
        """Non-API responses should not have Pragma header from middleware."""
        resp = client.get("/docs")
        assert resp.headers.get("pragma") is None

    def test_no_expires_on_non_api(self, client):
        """Non-API responses should not have Expires header from middleware."""
        resp = client.get("/docs")
        assert resp.headers.get("expires") is None


class TestSecurityHeadersAllMethods:
    """Security headers should be added regardless of HTTP method."""

    def test_security_headers_on_post(self, client):
        """POST responses should include all security headers."""
        resp = client.post("/api/data", json={"test": True})
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"

    def test_security_headers_on_put(self, client):
        """PUT responses should include all security headers."""
        resp = client.put("/api/data", json={"test": True})
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"

    def test_security_headers_on_delete(self, client):
        """DELETE responses should include all security headers."""
        resp = client.delete("/api/data")
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"


class TestSecurityHeadersCSPDetails:
    """Verify Content-Security-Policy directive details."""

    def test_csp_style_src_allows_inline(self, client):
        """CSP style-src should allow 'unsafe-inline' for inline styles."""
        resp = client.get("/docs")
        csp = resp.headers.get("content-security-policy", "")
        assert "style-src 'self' 'unsafe-inline'" in csp

    def test_csp_img_src_allows_data_and_blob(self, client):
        """CSP img-src should allow data: and blob: URIs."""
        resp = client.get("/docs")
        csp = resp.headers.get("content-security-policy", "")
        assert "img-src 'self' data: blob:" in csp

    def test_csp_connect_src_allows_websockets(self, client):
        """CSP connect-src should allow ws: and wss: for WebSockets."""
        resp = client.get("/docs")
        csp = resp.headers.get("content-security-policy", "")
        assert "connect-src 'self' ws: wss:" in csp

    def test_csp_base_uri_restricted(self, client):
        """CSP base-uri should be restricted to 'self'."""
        resp = client.get("/docs")
        csp = resp.headers.get("content-security-policy", "")
        assert "base-uri 'self'" in csp

    def test_csp_form_action_restricted(self, client):
        """CSP form-action should be restricted to 'self'."""
        resp = client.get("/docs")
        csp = resp.headers.get("content-security-policy", "")
        assert "form-action 'self'" in csp
