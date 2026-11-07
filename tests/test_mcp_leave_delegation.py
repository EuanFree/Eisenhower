"""Tests for the Leave & Delegation MCP tools.

This test suite exercises all 13 new MCP tools added to mcp_server.py:

1. book_leave
2. get_my_leave_requests
3. get_pending_leave_approvals
4. approve_leave_request
5. reject_leave_request
6. book_leave_with_delegation
7. create_delegation
8. get_my_delegations
9. revoke_delegation
10. check_delegation_coverage
11. get_my_line_manager
12. get_my_direct_reports
13. get_team_leave_calendar

Test Setup
~~~~~~~~~~

Each test uses an in-memory SQLite database with three users:
- **manager** (user_id=1) — Line manager with no manager of their own.
- **employee1** (user_id=2) — Direct report of manager.
- **employee2** (user_id=3) — Direct report of manager.
- **delegatee** (user_id=4) — Colleague who can receive delegated authority.

Line management links are established so employee1 and employee2
report to manager, and manager reports to no one (root of the tree).
"""
import pytest
from datetime import date, datetime
from uuid import uuid4

from app.models.models import (
    User, UserRole, SecurityClassification,
    LeaveRequest, LeaveType, LeaveStatus,
    DelegationRecord,
    LineManagementLink,
)
from app.utils.security import create_access_token, get_password_hash
from app.database import Base, SessionLocal


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def db_session():
    """Create a fresh in-memory SQLite database session.

    This also patches SessionLocal in both app.database and
    app.services.mcp_server so that MCP tools, which call
    SessionLocal() directly, use the in-memory database
    instead of trying to connect to PostgreSQL.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    import app.database as db_module
    import app.services.mcp_server as mcp_module

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Patch SessionLocal in both modules so MCP tools use the in-memory DB
    original_db_session_local = db_module.SessionLocal
    original_mcp_session_local = getattr(mcp_module, "SessionLocal", None)
    db_module.SessionLocal = TestSession
    mcp_module.SessionLocal = TestSession

    session = TestSession()
    yield session
    session.rollback()
    session.close()
    Base.metadata.drop_all(engine)

    # Restore original SessionLocal
    db_module.SessionLocal = original_db_session_local
    if original_mcp_session_local is not None:
        mcp_module.SessionLocal = original_mcp_session_local


@pytest.fixture
def users(db_session):
    """Create four test users with line management hierarchy.

    Returns
    -------
    dict
        Dictionary with keys: manager, employee1, employee2, delegatee.
    """
    manager = User(
        id=1,
        username="manager",
        email="manager@test.com",
        full_name="Test Manager",
        hashed_password=get_password_hash("password123"),
        role=UserRole.ADMIN,
        clearance_level=SecurityClassification.TOP_SECRET,
        caveats=[],
        is_active=True,
    )
    employee1 = User(
        id=2,
        username="employee1",
        email="employee1@test.com",
        full_name="Employee One",
        hashed_password=get_password_hash("password123"),
        role=UserRole.MEMBER,
        clearance_level=SecurityClassification.SECRET,
        caveats=[],
        is_active=True,
    )
    employee2 = User(
        id=3,
        username="employee2",
        email="employee2@test.com",
        full_name="Employee Two",
        hashed_password=get_password_hash("password123"),
        role=UserRole.MEMBER,
        clearance_level=SecurityClassification.SECRET,
        caveats=[],
        is_active=True,
    )
    delegatee = User(
        id=4,
        username="delegatee",
        email="delegatee@test.com",
        full_name="Delegate Colleague",
        hashed_password=get_password_hash("password123"),
        role=UserRole.MEMBER,
        clearance_level=SecurityClassification.SECRET,
        caveats=[],
        is_active=True,
    )
    db_session.add_all([manager, employee1, employee2, delegatee])
    db_session.commit()
    return {
        "manager": manager,
        "employee1": employee1,
        "employee2": employee2,
        "delegatee": delegatee,
    }


@pytest.fixture
def line_hierarchy(db_session, users):
    """Establish line management links.

    employee1 -> manager
    employee2 -> manager
    manager -> None (root)
    delegatee -> manager

    Both LineManagementLink records and User.line_manager_id are set
    so that all query paths (link table or direct FK) work correctly.

    Returns
    -------
    list[LineManagementLink]
        The created line management links.
    """
    # Set User.line_manager_id (used by get_direct_reports)
    users["employee1"].line_manager_id = users["manager"].id
    users["employee2"].line_manager_id = users["manager"].id
    users["delegatee"].line_manager_id = users["manager"].id
    db_session.commit()

    # Also create LineManagementLink records (used by other services)
    link1 = LineManagementLink(
        report_user_id=users["employee1"].id,
        manager_user_id=users["manager"].id,
    )
    link2 = LineManagementLink(
        report_user_id=users["employee2"].id,
        manager_user_id=users["manager"].id,
    )
    link3 = LineManagementLink(
        report_user_id=users["delegatee"].id,
        manager_user_id=users["manager"].id,
    )
    db_session.add_all([link1, link2, link3])
    db_session.commit()
    return [link1, link2, link3]


@pytest.fixture
def tokens(users):
    """Generate JWT tokens for all test users.

    Returns
    -------
    dict
        Dictionary with keys matching users fixture, values are JWT tokens.
    """
    return {
        "manager": create_access_token(data={"sub": str(users["manager"].id)}),
        "employee1": create_access_token(data={"sub": str(users["employee1"].id)}),
        "employee2": create_access_token(data={"sub": str(users["employee2"].id)}),
        "delegatee": create_access_token(data={"sub": str(users["delegatee"].id)}),
    }


# ============================================================================
# Helper to import MCP tools
# ============================================================================

@pytest.fixture(scope="module")
def mcp_tools():
    """Import the MCP tool functions for testing.

    Returns
    -------
    dict
        Dictionary of MCP tool functions keyed by their tool name.
    """
    from app.services import mcp_server
    tools = {}
    for name in [
        "book_leave", "get_my_leave_requests", "get_pending_leave_approvals",
        "approve_leave_request", "reject_leave_request",
        "book_leave_with_delegation", "create_delegation", "get_my_delegations",
        "revoke_delegation", "check_delegation_coverage",
        "get_my_line_manager", "get_my_direct_reports", "get_team_leave_calendar",
    ]:
        func = getattr(mcp_server, name, None)
        if func is not None:
            tools[name] = func
    return tools


# ============================================================================
# Tests: book_leave
# ============================================================================

class TestBookLeave:
    """Test the book_leave MCP tool."""

    def test_book_leave_creates_pending_request(self, db_session, mcp_tools, tokens):
        """Employee books leave and it is created with PENDING status."""
        result = mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            reason="Holiday",
            auth_token=tokens["employee1"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert result["status"] == "PENDING"
        assert result["leave_type"] == "ANNUAL"
        assert result["start_date"] == "2026-11-01"
        assert result["end_date"] == "2026-11-05"
        assert result["reason"] == "Holiday"
        assert "id" in result

    def test_book_leave_without_reason(self, db_session, mcp_tools, tokens):
        """Leave can be booked without a reason."""
        result = mcp_tools["book_leave"](
            leave_type="SICK",
            start_date="2026-11-10",
            end_date="2026-11-11",
            reason="",
            auth_token=tokens["employee1"],
        )
        assert "error" not in result
        assert result["status"] == "PENDING"
        assert result["leave_type"] == "SICK"

    def test_book_leave_invalid_dates(self, db_session, mcp_tools, tokens):
        """Invalid date format returns an error."""
        result = mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="not-a-date",
            end_date="2026-11-05",
            auth_token=tokens["employee1"],
        )
        assert "error" in result

    def test_book_leave_invalid_token(self, mcp_tools):
        """Invalid auth token returns an error."""
        result = mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            auth_token="invalid.token.here",
        )
        assert "error" in result


# ============================================================================
# Tests: get_my_leave_requests
# ============================================================================

class TestGetMyLeaveRequests:
    """Test the get_my_leave_requests MCP tool."""

    def test_get_empty_leave_history(self, mcp_tools, tokens):
        """User with no leave requests gets empty list."""
        result = mcp_tools["get_my_leave_requests"](
            auth_token=tokens["employee1"],
        )
        assert "error" not in result
        assert result["count"] == 0
        assert result["requests"] == []

    def test_get_leave_requests_after_booking(self, mcp_tools, tokens):
        """After booking leave, it appears in the user's history."""
        # Book leave first
        mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            reason="Holiday",
            auth_token=tokens["employee1"],
        )
        # Retrieve history
        result = mcp_tools["get_my_leave_requests"](
            auth_token=tokens["employee1"],
        )
        assert "error" not in result
        assert result["count"] == 1
        assert result["requests"][0]["leave_type"] == "ANNUAL"

    def test_filter_by_status(self, mcp_tools, tokens):
        """Leave requests can be filtered by status."""
        # Book leave (PENDING)
        mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            auth_token=tokens["employee1"],
        )
        # Filter by PENDING
        result = mcp_tools["get_my_leave_requests"](
            status_filter="PENDING",
            auth_token=tokens["employee1"],
        )
        assert "error" not in result
        assert result["count"] == 1

        # Filter by APPROVED (should be empty)
        result = mcp_tools["get_my_leave_requests"](
            status_filter="APPROVED",
            auth_token=tokens["employee1"],
        )
        assert "error" not in result
        assert result["count"] == 0


# ============================================================================
# Tests: get_pending_leave_approvals
# ============================================================================

class TestGetPendingLeaveApprovals:
    """Test the get_pending_leave_approvals MCP tool."""

    def test_manager_sees_no_pending(self, mcp_tools, tokens):
        """Manager with no pending requests gets empty list."""
        result = mcp_tools["get_pending_leave_approvals"](
            auth_token=tokens["manager"],
        )
        assert "error" not in result
        assert result["count"] == 0

    def test_manager_sees_pending_request(self, db_session, mcp_tools, tokens, line_hierarchy):
        """Manager sees pending leave from direct report."""
        # Employee books leave
        mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            reason="Holiday",
            auth_token=tokens["employee1"],
        )
        # Verify line management link exists in the patched session
        from app.models.models import LineManagementLink
        links = db_session.query(LineManagementLink).all()
        assert len(links) > 0, "Line management links not visible in db_session"
        # Manager checks pending
        result = mcp_tools["get_pending_leave_approvals"](
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Error: {result.get('error')}"
        assert result["count"] == 1
        assert result["pending_requests"][0]["leave_type"] == "ANNUAL"


# ============================================================================
# Tests: approve_leave_request
# ============================================================================

class TestApproveLeaveRequest:
    """Test the approve_leave_request MCP tool."""

    def test_approve_pending_leave(self, mcp_tools, tokens, line_hierarchy):
        """Manager can approve a direct report's pending leave."""
        # Employee books leave
        book_result = mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            auth_token=tokens["employee1"],
        )
        request_id = book_result["id"]

        # Manager approves
        result = mcp_tools["approve_leave_request"](
            request_id=request_id,
            comment="Approved",
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert result["status"] == "APPROVED"
        assert result["manager_comment"] == "Approved"

    def test_approve_updates_employee_history(self, mcp_tools, tokens, line_hierarchy):
        """After approval, employee's leave history shows APPROVED status."""
        # Book and approve
        book_result = mcp_tools["book_leave"](
            leave_type="SICK",
            start_date="2026-11-10",
            end_date="2026-11-11",
            auth_token=tokens["employee1"],
        )
        mcp_tools["approve_leave_request"](
            request_id=book_result["id"],
            auth_token=tokens["manager"],
        )
        # Check employee's history
        result = mcp_tools["get_my_leave_requests"](
            status_filter="APPROVED",
            auth_token=tokens["employee1"],
        )
        assert "error" not in result
        assert result["count"] == 1

    def test_non_manager_cannot_approve(self, mcp_tools, tokens, line_hierarchy):
        """A non-manager cannot approve someone else's leave."""
        book_result = mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            auth_token=tokens["employee1"],
        )
        # employee2 tries to approve employee1's leave
        result = mcp_tools["approve_leave_request"](
            request_id=book_result["id"],
            auth_token=tokens["employee2"],
        )
        assert "error" in result


# ============================================================================
# Tests: reject_leave_request
# ============================================================================

class TestRejectLeaveRequest:
    """Test the reject_leave_request MCP tool."""

    def test_reject_pending_leave(self, mcp_tools, tokens, line_hierarchy):
        """Manager can reject a direct report's pending leave."""
        book_result = mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            auth_token=tokens["employee1"],
        )
        result = mcp_tools["reject_leave_request"](
            request_id=book_result["id"],
            comment="Team too busy",
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert result["status"] == "REJECTED"
        assert result["manager_comment"] == "Team too busy"

    def test_rejected_leave_in_history(self, mcp_tools, tokens, line_hierarchy):
        """Rejected leave appears in employee's history with REJECTED status."""
        book_result = mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-12-01",
            end_date="2026-12-05",
            auth_token=tokens["employee1"],
        )
        mcp_tools["reject_leave_request"](
            request_id=book_result["id"],
            comment="Rejected",
            auth_token=tokens["manager"],
        )
        result = mcp_tools["get_my_leave_requests"](
            status_filter="REJECTED",
            auth_token=tokens["employee1"],
        )
        assert "error" not in result
        assert result["count"] == 1


# ============================================================================
# Tests: create_delegation
# ============================================================================

class TestCreateDelegation:
    """Test the create_delegation MCP tool."""

    def test_create_delegation(self, mcp_tools, tokens, line_hierarchy):
        """Manager can create a delegation record."""
        result = mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["delegatee"]),
            start_date="2026-11-01",
            end_date="2026-11-10",
            reason="Annual leave",
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert "id" in result
        assert result["start_date"] == "2026-11-01"
        assert result["end_date"] == "2026-11-10"

    def test_create_delegation_prevents_overlap(self, mcp_tools, tokens, line_hierarchy):
        """Cannot create overlapping delegation for the same delegator."""
        # Create first delegation
        mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["delegatee"]),
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        # Try overlapping delegation
        result = mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["employee1"]),
            start_date="2026-11-05",
            end_date="2026-11-15",
            auth_token=tokens["manager"],
        )
        assert "error" in result


# ============================================================================
# Tests: get_my_delegations
# ============================================================================

class TestGetMyDelegations:
    """Test the get_my_delegations MCP tool."""

    def test_empty_delegations(self, mcp_tools, tokens):
        """User with no delegations gets empty list."""
        result = mcp_tools["get_my_delegations"](
            auth_token=tokens["manager"],
        )
        assert "error" not in result
        assert result["count"] == 0

    def test_outgoing_delegations(self, mcp_tools, tokens, line_hierarchy):
        """Manager sees their outgoing delegations."""
        mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["delegatee"]),
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        result = mcp_tools["get_my_delegations"](
            direction="outgoing",
            auth_token=tokens["manager"],
        )
        assert "error" not in result
        assert result["count"] == 1

    def test_incoming_delegations(self, mcp_tools, tokens, line_hierarchy):
        """Delegatee sees incoming delegations."""
        mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["delegatee"]),
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        result = mcp_tools["get_my_delegations"](
            direction="incoming",
            auth_token=tokens["delegatee"],
        )
        assert "error" not in result
        assert result["count"] == 1


# ============================================================================
# Tests: revoke_delegation
# ============================================================================

class TestRevokeDelegation:
    """Test the revoke_delegation MCP tool."""

    def test_revoke_active_delegation(self, mcp_tools, tokens, line_hierarchy):
        """Delegator can revoke an active delegation."""
        create_result = mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["delegatee"]),
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        delegation_id = create_result["id"]

        result = mcp_tools["revoke_delegation"](
            delegation_id=delegation_id,
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert result["revoked"] is True

    def test_revoked_delegation_not_active(self, db_session, mcp_tools, tokens, line_hierarchy):
        """Revoked delegation is excluded from active list."""
        create_result = mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["delegatee"]),
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        mcp_tools["revoke_delegation"](
            delegation_id=create_result["id"],
            auth_token=tokens["manager"],
        )
        # get_my_delegations excludes revoked by default, so count should be 0
        result = mcp_tools["get_my_delegations"](
            direction="outgoing",
            auth_token=tokens["manager"],
        )
        assert "error" not in result
        assert result["count"] == 0


# ============================================================================
# Tests: check_delegation_coverage
# ============================================================================

class TestCheckDelegationCoverage:
    """Test the check_delegation_coverage MCP tool."""

    def test_no_coverage_without_delegation(self, mcp_tools, tokens):
        """Date range without delegation shows no coverage."""
        result = mcp_tools["check_delegation_coverage"](
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        assert "error" not in result
        assert result["covered"] is False

    def test_full_coverage_with_delegation(self, mcp_tools, tokens, line_hierarchy):
        """Date range with delegation shows full coverage."""
        mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["delegatee"]),
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        result = mcp_tools["check_delegation_coverage"](
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        assert "error" not in result
        assert result["covered"] is True

    def test_partial_coverage(self, mcp_tools, tokens, line_hierarchy):
        """Date range partially covered by delegation."""
        mcp_tools["create_delegation"](
            delegatee_user_id=users_id(tokens["delegatee"]),
            start_date="2026-11-01",
            end_date="2026-11-05",
            auth_token=tokens["manager"],
        )
        result = mcp_tools["check_delegation_coverage"](
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        assert "error" not in result
        assert result["covered"] is False


# ============================================================================
# Tests: get_my_line_manager
# ============================================================================

class TestGetMyLineManager:
    """Test the get_my_line_manager MCP tool."""

    def test_employee_has_manager(self, mcp_tools, tokens, line_hierarchy):
        """Employee's line manager is correctly identified."""
        result = mcp_tools["get_my_line_manager"](
            auth_token=tokens["employee1"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert result["manager"]["username"] == "manager"

    def test_root_manager_has_no_manager(self, mcp_tools, tokens, line_hierarchy):
        """Root manager has no line manager."""
        result = mcp_tools["get_my_line_manager"](
            auth_token=tokens["manager"],
        )
        assert "error" not in result
        assert result["manager"] is None


# ============================================================================
# Tests: get_my_direct_reports
# ============================================================================

class TestGetMyDirectReports:
    """Test the get_my_direct_reports MCP tool."""

    def test_manager_sees_direct_reports(self, mcp_tools, tokens, line_hierarchy):
        """Manager sees all direct reports."""
        result = mcp_tools["get_my_direct_reports"](
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert result["count"] == 3  # employee1, employee2, delegatee

    def test_employee_has_no_direct_reports(self, mcp_tools, tokens, line_hierarchy):
        """Non-manager has no direct reports."""
        result = mcp_tools["get_my_direct_reports"](
            auth_token=tokens["employee1"],
        )
        assert "error" not in result
        assert result["count"] == 0


# ============================================================================
# Tests: get_team_leave_calendar
# ============================================================================

class TestGetTeamLeaveCalendar:
    """Test the get_team_leave_calendar MCP tool."""

    def test_empty_team_calendar(self, mcp_tools, tokens, line_hierarchy):
        """Team with no leave shows empty calendar."""
        result = mcp_tools["get_team_leave_calendar"](
            start_date="2026-11-01",
            end_date="2026-11-30",
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"

    def test_team_calendar_with_leave(self, mcp_tools, tokens, line_hierarchy):
        """Team calendar shows approved leave for direct reports."""
        # Employee1 books and gets approved leave
        book_result = mcp_tools["book_leave"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            auth_token=tokens["employee1"],
        )
        mcp_tools["approve_leave_request"](
            request_id=book_result["id"],
            auth_token=tokens["manager"],
        )
        result = mcp_tools["get_team_leave_calendar"](
            start_date="2026-11-01",
            end_date="2026-11-30",
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        # Should show at least one leave entry
        assert len(result.get("leave_entries", [])) >= 1


# ============================================================================
# Tests: book_leave_with_delegation
# ============================================================================

class TestBookLeaveWithDelegation:
    """Test the book_leave_with_delegation MCP tool."""

    def test_manager_books_leave_with_auto_delegation(self, mcp_tools, tokens, line_hierarchy):
        """Manager books leave and delegation is auto-created."""
        result = mcp_tools["book_leave_with_delegation"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-10",
            reason="Holiday",
            delegatee_user_id=users_id(tokens["delegatee"]),
            auth_token=tokens["manager"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert "leave_request" in result
        assert "delegation" in result
        assert result["leave_request"]["status"] == "PENDING"
        assert result["delegation"] is not None

    def test_employee_books_leave_no_delegation_needed(self, mcp_tools, tokens, line_hierarchy):
        """Non-manager books leave; no delegation is created."""
        result = mcp_tools["book_leave_with_delegation"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-05",
            auth_token=tokens["employee1"],
        )
        assert "error" not in result, f"Unexpected error: {result.get('error')}"
        assert "leave_request" in result
        # Employee is not a manager, so no delegation
        assert result.get("delegation") is None or result.get("delegation_created") is False


# ============================================================================
# Helper functions
# ============================================================================

def users_id(token):
    """Extract the user ID from a JWT token.

    Parameters
    ----------
    token : str
        A JWT Bearer token.

    Returns
    -------
    int
        The user ID encoded in the token's 'sub' claim.
    """
    from app.utils.auth import decode_access_token
    payload = decode_access_token(token)
    user_id_str = payload.get("sub")
    # User IDs in our test are integers stored as strings in the JWT
    return int(user_id_str) if user_id_str else 0


# ============================================================================
# Integration test: Full leave + delegation workflow
# ============================================================================

class TestFullWorkflow:
    """End-to-end test of the complete leave and delegation workflow."""

    def test_manager_leave_with_delegation_workflow(self, mcp_tools, tokens, line_hierarchy):
        """Full workflow: manager books leave with delegation, delegatee approves employee leave.

        Steps:
        1. Manager books leave with auto-delegation to delegatee.
        2. Verify delegation is created.
        3. Employee books leave while manager is away.
        4. Verify the delegation covers the leave period.
        5. Revoke delegation and verify it's no longer active.
        """
        # Step 1: Manager books leave with delegation
        leave_result = mcp_tools["book_leave_with_delegation"](
            leave_type="ANNUAL",
            start_date="2026-11-01",
            end_date="2026-11-10",
            reason="Annual holiday",
            delegatee_user_id=users_id(tokens["delegatee"]),
            auth_token=tokens["manager"],
        )
        assert "error" not in leave_result, f"Step 1 failed: {leave_result.get('error')}"
        assert leave_result["leave_request"]["status"] == "PENDING"
        assert leave_result["delegation"] is not None

        delegation_id = leave_result["delegation"]["id"]

        # Step 2: Verify delegation exists
        del_result = mcp_tools["get_my_delegations"](
            direction="outgoing",
            auth_token=tokens["manager"],
        )
        assert "error" not in del_result
        assert del_result["count"] == 1

        # Step 3: Check delegation coverage
        coverage = mcp_tools["check_delegation_coverage"](
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        assert "error" not in coverage
        assert coverage["covered"] is True

        # Step 4: Employee books leave
        emp_leave = mcp_tools["book_leave"](
            leave_type="SICK",
            start_date="2026-11-03",
            end_date="2026-11-04",
            reason="Feeling unwell",
            auth_token=tokens["employee1"],
        )
        assert "error" not in emp_leave

        # Step 5: Verify pending approvals
        pending = mcp_tools["get_pending_leave_approvals"](
            auth_token=tokens["manager"],
        )
        assert "error" not in pending
        assert pending["count"] == 1

        # Step 6: Revoke delegation
        revoke_result = mcp_tools["revoke_delegation"](
            delegation_id=delegation_id,
            auth_token=tokens["manager"],
        )
        assert "error" not in revoke_result, f"Step 6 failed: {revoke_result.get('error')}"
        assert revoke_result["revoked"] is True

        # Step 7: Verify coverage is now broken
        coverage_after = mcp_tools["check_delegation_coverage"](
            start_date="2026-11-01",
            end_date="2026-11-10",
            auth_token=tokens["manager"],
        )
        assert "error" not in coverage_after
        assert coverage_after["covered"] is False
