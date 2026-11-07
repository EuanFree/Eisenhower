"""Shared test fixtures and configuration for the test suite.

This module provides pytest fixtures that are shared across all test files.
It sets up an in-memory SQLite database for test isolation, creates mock
users and nodes, and provides a test HTTP client for API endpoint testing.

Test Database Strategy
~~~~~~~~~~~~~~~~~~~~~~

Tests use an in-memory SQLite database instead of PostgreSQL.  This provides:

- **Isolation** — Each test starts with a fresh, empty database.
- **Speed** — No network overhead or database server startup.
- **Portability** — Tests run without requiring a PostgreSQL instance.

Note: Some PostgreSQL-specific features (ltree, JSONB) are not available
in SQLite.  Tests that require these features use mocks or skip gracefully.

Fixtures Summary
~~~~~~~~~~~~~~~~

- ``db_session`` — A fresh database session with all tables created.
- ``test_user`` — A mock User record with ADMIN role and TOP_SECRET clearance.
- ``test_user_secret`` — A mock User with SECRET clearance.
- ``test_user_official`` — A mock User with OFFICIAL clearance.
- ``test_token`` — A valid JWT token for the test user.
- ``client`` — An httpx AsyncClient for testing API endpoints.
"""
import os
import pytest

# CRITICAL: Set DATABASE_URL to SQLite BEFORE importing any app modules.
# The app.config and app.database modules read this env var at import time
# to create the SQLAlchemy engine. If we don't set it here, the engine will
# be created with the PostgreSQL URL and SSL settings, causing connection
# errors when no PostgreSQL server is available.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DATABASE_SSL_MODE"] = "disable"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import datetime, timedelta
from uuid import uuid4

from app.database import Base, get_db
from app.models.models import (
    User, UserRole, SecurityClassification,
    UniversalBreakdownNode, PortfolioNode, ResourceNode, LocationNode,
    DependencyLink, DependencyType, ResourceAssignment, AssignmentStatus,
    NodeBlocker, BlockerCategory, BlockerSeverity, ForensicAuditLog,
    UserDisplaySettings, Density, Theme,
)
from app.utils.security import create_access_token, get_password_hash
from app.config import settings
from fastapi.testclient import TestClient
from app.main import app


# ============================================================================
# Database fixtures
# ============================================================================

@pytest.fixture
def engine():
    """Create an in-memory SQLite engine for testing.

    Returns
    -------
    Engine
        A SQLAlchemy engine connected to an in-memory SQLite database.
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    return test_engine


@pytest.fixture
def db_session(engine):
    """Create a fresh database session with all tables created.

    This fixture creates all database tables, yields a session for the
    test to use, and then rolls back and drops all tables after the test.

    Yields
    ------
    Session
        A SQLAlchemy session bound to the in-memory test database.
    """
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield session
    session.rollback()
    session.close()
    Base.metadata.drop_all(engine)
    app.dependency_overrides.clear()


# ============================================================================
# User fixtures
# ============================================================================

@pytest.fixture
def test_user(db_session):
    """Create a mock User with ADMIN role and TOP_SECRET clearance.

    Returns
    -------
    User
        A user record inserted into the test database.
    """
    user = User(
        username="test_admin",
        email="admin@test.com",
        full_name="Test Administrator",
        hashed_password=get_password_hash("testpassword123"),
        role=UserRole.ADMIN,
        clearance_level=SecurityClassification.TOP_SECRET,
        caveats=["UK_EYES_ONLY", "NOFORN"],
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_user_secret(db_session):
    """Create a mock User with SECRET clearance.

    Returns
    -------
    User
        A user record with SECRET clearance and UK_EYES_ONLY caveat.
    """
    user = User(
        username="test_secret",
        email="secret@test.com",
        full_name="Test Secret User",
        hashed_password=get_password_hash("testpassword123"),
        role=UserRole.MEMBER,
        clearance_level=SecurityClassification.SECRET,
        caveats=["UK_EYES_ONLY"],
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_user_official(db_session):
    """Create a mock User with OFFICIAL clearance (lowest level).

    Returns
    -------
    User
        A user record with OFFICIAL clearance and no caveats.
    """
    user = User(
        username="test_official",
        email="official@test.com",
        full_name="Test Official User",
        hashed_password=get_password_hash("testpassword123"),
        role=UserRole.VIEWER,
        clearance_level=SecurityClassification.OFFICIAL,
        caveats=[],
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


# ============================================================================
# Token fixtures
# ============================================================================

@pytest.fixture
def test_token(test_user):
    """Generate a valid JWT token for the test admin user.

    Returns
    -------
    str
        A signed JWT token encoding the test user's ID.
    """
    return create_access_token(data={"sub": str(test_user.id)})


# ============================================================================
# HTTP client fixture
# ============================================================================

@pytest.fixture
def client(db_session, test_user):
    """Create a TestClient for the FastAPI application.

    The client is pre-authenticated with the test admin user's token.
    Use ``client.headers`` to access the Authorization header.

    Yields
    ------
    TestClient
        A Starlette TestClient bound to the FastAPI app.
    """
    token = create_access_token(data={"sub": str(test_user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    with TestClient(app) as test_client:
        test_client.headers = headers
        yield test_client


# ============================================================================
# Node fixtures
# ============================================================================

@pytest.fixture
def test_portfolio_node(db_session):
    """Create a test PortfolioNode (WBS root).

    Returns
    -------
    PortfolioNode
        A root-level portfolio node with OFFICIAL classification.
    """
    node = PortfolioNode(
        code="PORT-001",
        name="Test Portfolio",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1",
        delivery_mode="WATERFALL",
        planned_start_date=datetime(2026, 1, 1),
        planned_end_date=datetime(2026, 12, 31),
        percent_complete=0.0,
        is_active=True,
    )
    db_session.add(node)
    db_session.commit()
    return node


@pytest.fixture
def test_resource_node(db_session):
    """Create a test ResourceNode (RBS).

    Returns
    -------
    ResourceNode
        A resource node representing a person.
    """
    node = ResourceNode(
        code="RES-001",
        name="Test Engineer",
        tree_type="RBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1",
        resource_type="PERSON",
        standard_hourly_rate=100.0,
        is_generic_placeholder=False,
        is_active=True,
    )
    db_session.add(node)
    db_session.commit()
    return node


@pytest.fixture
def test_location_node(db_session):
    """Create a test LocationNode (LBS).

    Returns
    -------
    LocationNode
        A location node representing a SCIF facility.
    """
    node = LocationNode(
        code="LOC-001",
        name="Test SCIF",
        tree_type="LBS",
        security_classification=SecurityClassification.SECRET,
        caveats=["UK_EYES_ONLY"],
        path="1",
        tier="FACILITY",
        is_scif_or_tempest=True,
        escort_required=True,
        is_active=True,
    )
    db_session.add(node)
    db_session.commit()
    return node


# ============================================================================
# Dependency/Assignment/Blocker fixtures
# ============================================================================

@pytest.fixture
def test_dependency_link(db_session, test_portfolio_node):
    """Create a test DependencyLink between two PortfolioNodes.

    Returns
    -------
    DependencyLink
        A finish-to-start dependency link.
    """
    child_node = PortfolioNode(
        code="PORT-001-001",
        name="Child Task",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1.1",
        delivery_mode="WATERFALL",
        planned_start_date=datetime(2026, 2, 1),
        planned_end_date=datetime(2026, 3, 1),
        percent_complete=0.0,
        is_active=True,
    )
    db_session.add(child_node)
    db_session.commit()

    dep = DependencyLink(
        predecessor_id=test_portfolio_node.id,
        successor_id=child_node.id,
        dependency_type=DependencyType.FS,
        lag_days=0,
    )
    db_session.add(dep)
    db_session.commit()
    return dep


@pytest.fixture
def test_resource_assignment(db_session, test_portfolio_node, test_resource_node):
    """Create a test ResourceAssignment.

    Returns
    -------
    ResourceAssignment
        A confirmed resource assignment at 100% allocation.
    """
    assignment = ResourceAssignment(
        portfolio_node_id=test_portfolio_node.id,
        resource_node_id=test_resource_node.id,
        allocated_units=1.0,
        planned_hours=200.0,
        rate_snapshot=100.0,
        status=AssignmentStatus.CONFIRMED,
    )
    db_session.add(assignment)
    db_session.commit()
    return assignment


@pytest.fixture
def test_node_blocker(db_session, test_portfolio_node):
    """Create a test NodeBlocker.

    Returns
    -------
    NodeBlocker
        A critical blocker on the test portfolio node.
    """
    blocker = NodeBlocker(
        portfolio_node_id=test_portfolio_node.id,
        category=BlockerCategory.RESOURCE_UNAVAILABLE,
        severity=BlockerSeverity.CRITICAL,
        impacted_hours=40.0,
        resolved_at=None,
    )
    db_session.add(blocker)
    db_session.commit()
    return blocker


# ============================================================================
# Display settings fixture
# ============================================================================

@pytest.fixture
def test_display_settings(db_session, test_user):
    """Create test UserDisplaySettings.

    Returns
    -------
    UserDisplaySettings
        A display profile with SCIF_DARK theme.
    """
    ds = UserDisplaySettings(
        user_id=test_user.id,
        profile_name="DEFAULT",
        is_active_default=True,
        density=Density.BALANCED,
        scale_factor=1.0,
        row_height_px=36,
        theme=Theme.SCIF_DARK,
        color_accessibility="STANDARD_RAG",
        view_state_overrides={"column_widths": {"name": 200}},
    )
    db_session.add(ds)
    db_session.commit()
    return ds
