"""Conftest for export router tests.

Sets DATABASE_URL to SQLite before any app imports so the tests run
without requiring PostgreSQL.
"""
import os
import sys

# Must set DATABASE_URL before importing any app modules that read it
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

from app.database import Base, get_db
from app.main import app
from app.models.models import (
    PortfolioNode,
    SecurityClassification,
    TreeType,
)
from app.utils import auth as auth_module


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture(scope="module")
def test_engine():
    """Create a shared in-memory SQLite engine for the module."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def db_session(test_engine):
    """Create a database session bound to the shared in-memory engine."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client(db_session: Session):
    """Create a TestClient with overridden dependencies.

    Uses the main FastAPI app with mocked auth and DB dependencies.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_get_current_user():
        mock_user = MagicMock()
        mock_user.id = uuid4()
        mock_user.username = "test_user"
        mock_user.email = "test@example.com"
        mock_user.is_active = True
        return mock_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[auth_module.get_current_user] = override_get_current_user

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def sample_project(db_session: Session):
    """Create a sample project node."""
    project = PortfolioNode(
        id=uuid4(),
        tree_type=TreeType.WBS,
        code="PRJ-001",
        name="Test Project",
        path="1",
        security_classification=SecurityClassification.SECRET,
        percent_complete=50.0,
        planned_start_date=datetime(2024, 1, 1),
        planned_end_date=datetime(2024, 12, 31),
        bac_cost=Decimal("1000000"),
        planned_value=Decimal("500000"),
        earned_value=Decimal("450000"),
        actual_cost=Decimal("480000"),
    )
    db_session.add(project)
    db_session.commit()
    return project
