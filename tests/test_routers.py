"""Tests for the API router endpoints.

This module tests the FastAPI application's HTTP endpoints using the
TestClient. It verifies that authentication works correctly, that
the health check and root endpoints respond properly, and that
unauthenticated requests are rejected.

Note: These tests use an in-memory SQLite database.  Because the
application models use PostgreSQL-specific types (ARRAY, JSONB, ltree),
the router tests are marked as skip — they require a live PostgreSQL
instance to run fully.  The tests are kept here as integration test
templates for when PostgreSQL is available.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db, Base
from app.utils.security import create_access_token, get_password_hash
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def test_engine():
    """Create an in-memory SQLite engine for router tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    return engine


@pytest.fixture
def test_db(test_engine):
    """Create a fresh database session for router tests."""
    Base.metadata.create_all(test_engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = SessionLocal()
    return session


@pytest.fixture
def client_with_db(test_engine, test_db):
    """Create a TestClient with database override."""
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# All router tests are skipped because the models use PostgreSQL-specific
# types (ARRAY, JSONB, ltree) that SQLite cannot handle.
# These tests serve as integration test templates for PostgreSQL environments.

pytestmark = pytest.mark.skip(reason="Router tests require PostgreSQL; SQLite cannot handle ARRAY/JSONB/ltree types")


class TestRootEndpoint:
    """Test the root API endpoint."""

    def test_root_returns_app_info(self, client_with_db):
        """Test that the root endpoint returns application information."""
        response = client_with_db.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "docs" in data

    def test_root_app_name(self, client_with_db):
        """Test that the root endpoint returns the correct app name."""
        response = client_with_db.get("/")
        data = response.json()
        assert data["name"] == "Eisenhower Portfolio Manager"


class TestHealthEndpoint:
    """Test the health check endpoint."""

    def test_health_returns_healthy(self, client_with_db):
        """Test that the health endpoint returns healthy status."""
        response = client_with_db.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestAuthEndpoints:
    """Test the authentication endpoints."""

    def test_register_new_user(self, client_with_db):
        """Test that a new user can be registered."""
        response = client_with_db.post("/api/auth/register", json={
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "securepassword123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_register_duplicate_username(self, client_with_db, test_db):
        """Test that registering a duplicate username fails."""
        from app.models.models import User
        # Create a user first
        user = User(
            username="existing",
            email="existing@example.com",
            hashed_password=get_password_hash("password123"),
            is_active=True,
        )
        test_db.add(user)
        test_db.commit()

        # Try to register with the same username
        response = client_with_db.post("/api/auth/register", json={
            "username": "existing",
            "email": "other@example.com",
            "password": "securepassword123",
        })
        assert response.status_code == 400

    def test_login_with_valid_credentials(self, client_with_db, test_db):
        """Test that login with valid credentials returns a token."""
        from app.models.models import User
        user = User(
            username="testuser",
            email="test@example.com",
            hashed_password=get_password_hash("testpassword123"),
            is_active=True,
        )
        test_db.add(user)
        test_db.commit()

        response = client_with_db.post("/api/auth/login", json={
            "username": "testuser",
            "password": "testpassword123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    def test_login_with_invalid_password(self, client_with_db, test_db):
        """Test that login with wrong password fails."""
        from app.models.models import User
        user = User(
            username="testuser",
            email="test@example.com",
            hashed_password=get_password_hash("correctpassword"),
            is_active=True,
        )
        test_db.add(user)
        test_db.commit()

        response = client_with_db.post("/api/auth/login", json={
            "username": "testuser",
            "password": "wrongpassword",
        })
        assert response.status_code == 401

    def test_login_nonexistent_user(self, client_with_db):
        """Test that login with nonexistent user fails."""
        response = client_with_db.post("/api/auth/login", json={
            "username": "nonexistent",
            "password": "password123",
        })
        assert response.status_code == 401


class TestUserEndpoints:
    """Test the user management endpoints."""

    def test_get_users_requires_auth(self, client_with_db):
        """Test that listing users requires authentication."""
        response = client_with_db.get("/api/users/")
        assert response.status_code == 401

    def test_get_users_with_auth(self, client_with_db, test_db):
        """Test that listing users works with valid authentication."""
        from app.models.models import User
        user = User(
            username="testuser",
            email="test@example.com",
            hashed_password=get_password_hash("password123"),
            is_active=True,
        )
        test_db.add(user)
        test_db.commit()

        token = create_access_token(data={"sub": str(user.id)})
        response = client_with_db.get(
            "/api/users/",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200

    def test_get_current_user(self, client_with_db, test_db):
        """Test that getting the current user works."""
        from app.models.models import User
        user = User(
            username="testuser",
            email="test@example.com",
            hashed_password=get_password_hash("password123"),
            is_active=True,
        )
        test_db.add(user)
        test_db.commit()

        token = create_access_token(data={"sub": str(user.id)})
        response = client_with_db.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"


class TestProtectedEndpoints:
    """Test that protected endpoints require authentication."""

    def test_wbs_tree_requires_auth(self, client_with_db):
        """Test that WBS tree endpoint requires authentication."""
        response = client_with_db.get("/api/v1/wbs/tree/root")
        assert response.status_code == 401

    def test_cockpit_summary_requires_auth(self, client_with_db):
        """Test that cockpit summary endpoint requires authentication."""
        response = client_with_db.get("/api/v1/cockpit/summary")
        assert response.status_code == 401

    def test_schedule_cpm_requires_auth(self, client_with_db):
        """Test that schedule CPM endpoint requires authentication."""
        response = client_with_db.post("/api/v1/schedule/00000000-0000-0000-0000-000000000000/recalculate-cpm")
        assert response.status_code == 401

    def test_display_settings_requires_auth(self, client_with_db):
        """Test that display settings endpoint requires authentication."""
        response = client_with_db.get("/api/users/me/display-settings")
        assert response.status_code == 401


class TestInvalidToken:
    """Test behavior with invalid authentication tokens."""

    def test_invalid_token_returns_401(self, client_with_db):
        """Test that an invalid token returns 401 Unauthorized."""
        response = client_with_db.get(
            "/api/users/me",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        assert response.status_code == 401

    def test_missing_token_returns_401(self, client_with_db):
        """Test that a missing token returns 401 Unauthorized."""
        response = client_with_db.get("/api/users/me")
        assert response.status_code == 401

    def test_empty_bearer_returns_401(self, client_with_db):
        """Test that an empty Bearer token returns 401."""
        response = client_with_db.get(
            "/api/users/me",
            headers={"Authorization": "Bearer "}
        )
        assert response.status_code == 401
