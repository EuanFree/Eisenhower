"""Unit tests for permission-governed creation authorization.

Tests cover the three authorization gates (Baseline Lock, Role Hierarchy,
Clearance Ceiling), the legacy role mapping, and resource creation authority.
"""

import pytest
from unittest.mock import MagicMock, PropertyMock
from uuid import uuid4
from decimal import Decimal
from datetime import date

from app.core.permissions import (
    _get_effective_roles,
    _has_role,
    _user_clearance_rank,
    check_role_hierarchy_gate,
    check_clearance_ceiling_gate,
    verify_resource_creation_authority,
    TIER_ROLE_REQUIREMENTS,
    LEGACY_ROLE_MAP,
    ROLE_SYSTEM_ADMIN,
    ROLE_PROGRAMME_DIRECTOR,
    ROLE_CAM,
    ROLE_ENGINEER,
    ROLE_RESOURCE_MANAGER,
    ROLE_DEPT_HEAD,
)
from app.models.models import UserRole, SecurityClassification
from app.schemas.authoring import (
    WorkItemCreate,
    ResourceCreate,
    WorkItemCreatedResponse,
    ResourceCreatedResponse,
)


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_user_admin():
    """Mock user with ADMIN role and TOP_SECRET clearance."""
    user = MagicMock()
    user.role = UserRole.ADMIN
    user.clearance_level = SecurityClassification.TOP_SECRET
    user.caveats = ["UK_EYES_ONLY"]
    user.custom_attributes = {}
    return user


@pytest.fixture
def mock_user_manager():
    """Mock user with MANAGER role and SECRET clearance."""
    user = MagicMock()
    user.role = UserRole.MANAGER
    user.clearance_level = SecurityClassification.SECRET
    user.caveats = ["UK_EYES_ONLY"]
    user.custom_attributes = {}
    return user


@pytest.fixture
def mock_user_member():
    """Mock user with MEMBER role and OFFICIAL clearance."""
    user = MagicMock()
    user.role = UserRole.MEMBER
    user.clearance_level = SecurityClassification.OFFICIAL
    user.caveats = None
    user.custom_attributes = {}
    return user


@pytest.fixture
def mock_user_viewer():
    """Mock user with VIEWER role and OFFICIAL clearance."""
    user = MagicMock()
    user.role = UserRole.VIEWER
    user.clearance_level = SecurityClassification.OFFICIAL
    user.caveats = None
    user.custom_attributes = {}
    return user


@pytest.fixture
def mock_user_delegated_cam():
    """Mock user with MEMBER role but delegated CAM role."""
    user = MagicMock()
    user.role = UserRole.MEMBER
    user.clearance_level = SecurityClassification.SECRET
    user.caveats = ["UK_EYES_ONLY"]
    user.custom_attributes = {"delegated_roles": ["CAM"]}
    return user


# ============================================================================
# Legacy Role Mapping Tests
# ============================================================================

class TestLegacyRoleMapping:
    """Test the legacy role to fine-grained role mapping."""

    def test_admin_has_all_roles(self, mock_user_admin):
        """ADMIN should map to all fine-grained roles."""
        roles = _get_effective_roles(mock_user_admin)
        assert ROLE_SYSTEM_ADMIN in roles
        assert ROLE_PROGRAMME_DIRECTOR in roles
        assert ROLE_CAM in roles
        assert ROLE_ENGINEER in roles
        assert ROLE_RESOURCE_MANAGER in roles
        assert ROLE_DEPT_HEAD in roles

    def test_manager_has_director_and_cam(self, mock_user_manager):
        """MANAGER should map to PROGRAMME_DIRECTOR, CAM, ENGINEER."""
        roles = _get_effective_roles(mock_user_manager)
        assert ROLE_PROGRAMME_DIRECTOR in roles
        assert ROLE_CAM in roles
        assert ROLE_ENGINEER in roles
        assert ROLE_SYSTEM_ADMIN not in roles
        assert ROLE_RESOURCE_MANAGER not in roles

    def test_member_has_engineer(self, mock_user_member):
        """MEMBER should map to ENGINEER only."""
        roles = _get_effective_roles(mock_user_member)
        assert ROLE_ENGINEER in roles
        assert ROLE_CAM not in roles
        assert ROLE_PROGRAMME_DIRECTOR not in roles

    def test_viewer_has_no_roles(self, mock_user_viewer):
        """VIEWER should have no creation authority."""
        roles = _get_effective_roles(mock_user_viewer)
        assert len(roles) == 0

    def test_delegated_roles_are_added(self, mock_user_delegated_cam):
        """Delegated roles in custom_attributes should be added."""
        roles = _get_effective_roles(mock_user_delegated_cam)
        assert ROLE_ENGINEER in roles  # from MEMBER mapping
        assert ROLE_CAM in roles  # from delegation

    def test_has_role_helper(self, mock_user_admin):
        """_has_role should return True for admin's roles."""
        assert _has_role(mock_user_admin, ROLE_SYSTEM_ADMIN) is True
        assert _has_role(mock_user_admin, ROLE_CAM) is True
        assert _has_role(mock_user_admin, "NONEXISTENT") is False


# ============================================================================
# Clearance Rank Tests
# ============================================================================

class TestClearanceRank:
    """Test clearance level ranking."""

    def test_official_rank(self, mock_user_member):
        """OFFICIAL clearance should have lowest rank."""
        rank = _user_clearance_rank(mock_user_member)
        assert rank == 0  # OFFICIAL is rank 0 (0-based indexing)

    def test_secret_rank(self, mock_user_manager):
        """SECRET clearance should have higher rank."""
        rank = _user_clearance_rank(mock_user_manager)
        assert rank == 2  # SECRET is rank 2 (0-based indexing)

    def test_top_secret_rank(self, mock_user_admin):
        """TOP_SECRET clearance should have highest rank."""
        rank = _user_clearance_rank(mock_user_admin)
        assert rank == 3  # TOP_SECRET is rank 3 (0-based indexing)


# ============================================================================
# Role Hierarchy Gate Tests
# ============================================================================

class TestRoleHierarchyGate:
    """Test the role hierarchy authorization gate."""

    def test_admin_can_create_prog(self, mock_user_admin):
        """ADMIN should be able to create Programmes."""
        check_role_hierarchy_gate("PROG", mock_user_admin)  # Should not raise

    def test_manager_can_create_proj(self, mock_user_manager):
        """MANAGER should be able to create Projects."""
        check_role_hierarchy_gate("PROJ", mock_user_manager)  # Should not raise

    def test_member_can_create_task(self, mock_user_member):
        """MEMBER (ENGINEER) should be able to create Tasks."""
        check_role_hierarchy_gate("TASK", mock_user_member)  # Should not raise

    def test_member_cannot_create_prog(self, mock_user_member):
        """MEMBER should NOT be able to create Programmes."""
        with pytest.raises(Exception) as exc_info:
            check_role_hierarchy_gate("PROG", mock_user_member)
        assert "403" in str(exc_info.value) or "403" in str(
            getattr(exc_info.value, "status_code", "")
        )

    def test_viewer_cannot_create_anything(self, mock_user_viewer):
        """VIEWER should NOT be able to create any tier."""
        with pytest.raises(Exception):
            check_role_hierarchy_gate("TASK", mock_user_viewer)

    def test_delegated_cam_can_create_ca(self, mock_user_delegated_cam):
        """User with delegated CAM role should create Control Accounts."""
        check_role_hierarchy_gate("CA", mock_user_delegated_cam)

    def test_unknown_tier_rejected(self, mock_user_admin):
        """Unknown tier should be rejected."""
        with pytest.raises(Exception):
            check_role_hierarchy_gate("UNKNOWN_TIER", mock_user_admin)

    def test_tier_role_requirements_complete(self):
        """All tiers should have role requirements defined."""
        expected_tiers = {"PROG", "PROJ", "CA", "WP", "TASK", "MILESTONE"}
        assert set(TIER_ROLE_REQUIREMENTS.keys()) == expected_tiers


# ============================================================================
# Clearance Ceiling Gate Tests
# ============================================================================

class TestClearanceCeilingGate:
    """Test the clearance ceiling authorization gate."""

    def test_official_can_create_official(self, mock_user_member):
        """OFFICIAL user can create OFFICIAL nodes."""
        check_clearance_ceiling_gate(
            SecurityClassification.OFFICIAL, mock_user_member
        )

    def test_official_cannot_create_secret(self, mock_user_member):
        """OFFICIAL user cannot create SECRET nodes."""
        with pytest.raises(Exception):
            check_clearance_ceiling_gate(
                SecurityClassification.SECRET, mock_user_member
            )

    def test_secret_can_create_official(self, mock_user_manager):
        """SECRET user can create OFFICIAL nodes."""
        check_clearance_ceiling_gate(
            SecurityClassification.OFFICIAL, mock_user_manager
        )

    def test_secret_can_create_secret(self, mock_user_manager):
        """SECRET user can create SECRET nodes."""
        check_clearance_ceiling_gate(
            SecurityClassification.SECRET, mock_user_manager
        )

    def test_top_secret_can_create_anything(self, mock_user_admin):
        """TOP_SECRET user can create any classification."""
        check_clearance_ceiling_gate(
            SecurityClassification.TOP_SECRET, mock_user_admin
        )
        check_clearance_ceiling_gate(
            SecurityClassification.SECRET, mock_user_admin
        )
        check_clearance_ceiling_gate(
            SecurityClassification.OFFICIAL, mock_user_admin
        )


# ============================================================================
# Resource Creation Authority Tests
# ============================================================================

class TestResourceCreationAuthority:
    """Test resource creation authorization."""

    def test_admin_can_create_resources(self, mock_user_admin):
        """ADMIN should be able to create resources."""
        verify_resource_creation_authority(mock_user_admin)  # Should not raise

    def test_member_cannot_create_resources(self, mock_user_member):
        """MEMBER should NOT be able to create resources."""
        with pytest.raises(Exception):
            verify_resource_creation_authority(mock_user_member)

    def test_viewer_cannot_create_resources(self, mock_user_viewer):
        """VIEWER should NOT be able to create resources."""
        with pytest.raises(Exception):
            verify_resource_creation_authority(mock_user_viewer)


# ============================================================================
# WorkItemCreate Schema Tests
# ============================================================================

class TestWorkItemCreateSchema:
    """Test the WorkItemCreate Pydantic schema."""

    def test_minimal_valid_work_item(self):
        """Minimal valid work item should pass."""
        data = WorkItemCreate(
            code="WP-001",
            name="Test Work Package",
            tier="WP",
        )
        assert data.code == "WP-001"
        assert data.tier == "WP"
        assert data.duration_days == 0.0
        assert data.security_classification == SecurityClassification.OFFICIAL

    def test_full_work_item(self):
        """Full work item with all fields should pass."""
        data = WorkItemCreate(
            code="PROJ-ALPHA",
            name="Alpha Project",
            tier="PROJ",
            delivery_mode="WATERFALL",
            duration_days=100.0,
            security_classification=SecurityClassification.SECRET,
            caveats=["UK_EYES_ONLY"],
            custom_attributes={"vendor_cage_code": "12345"},
        )
        assert data.tier == "PROJ"
        assert data.duration_days == 100.0
        assert data.caveats == ["UK_EYES_ONLY"]

    def test_invalid_tier_rejected(self):
        """Invalid tier should be rejected."""
        with pytest.raises(Exception):
            WorkItemCreate(
                code="TEST",
                name="Test",
                tier="INVALID_TIER",
            )

    def test_invalid_code_rejected(self):
        """Code with special characters should be rejected."""
        with pytest.raises(Exception):
            WorkItemCreate(
                code="WP/001",  # Slash not allowed
                name="Test",
                tier="TASK",
            )

    def test_negative_duration_rejected(self):
        """Negative duration should be rejected."""
        with pytest.raises(Exception):
            WorkItemCreate(
                code="WP-001",
                name="Test",
                tier="TASK",
                duration_days=-5.0,
            )

    def test_parent_id_optional(self):
        """parent_id should be optional (None for root creation)."""
        data = WorkItemCreate(
            code="PROG-001",
            name="Root Programme",
            tier="PROG",
            parent_id=None,
        )
        assert data.parent_id is None

    def test_all_tiers_valid(self):
        """All six tiers should be accepted."""
        for tier in ["PROG", "PROJ", "CA", "WP", "TASK", "MILESTONE"]:
            data = WorkItemCreate(
                code="TEST",
                name="Test",
                tier=tier,
            )
            assert data.tier == tier


# ============================================================================
# ResourceCreate Schema Tests
# ============================================================================

class TestResourceCreateSchema:
    """Test the ResourceCreate Pydantic schema."""

    def test_human_labor_resource(self):
        """HUMAN_LABOR resource should pass without calibration date."""
        data = ResourceCreate(
            code="ENG-001",
            name="John Smith",
            resource_type="HUMAN_LABOR",
            department="Avionics",
            burdened_hourly_rate=Decimal("150.00"),
            nationality="GB",
        )
        assert data.resource_type == "HUMAN_LABOR"
        assert data.nationality == "GB"

    def test_equipment_requires_calibration(self):
        """EQUIPMENT resource must have calibration_expiry_date."""
        data = ResourceCreate(
            code="EQUIP-001",
            name="Test Rig",
            resource_type="EQUIPMENT",
            department="Testing",
            calibration_expiry_date=date(2026, 12, 31),
            serial_number="SN-12345",
            calibration_interval_days=365,
        )
        assert data.calibration_expiry_date == date(2026, 12, 31)

    def test_equipment_without_calibration_rejected(self):
        """EQUIPMENT without calibration date should be rejected."""
        with pytest.raises(Exception):
            ResourceCreate(
                code="EQUIP-001",
                name="Test Rig",
                resource_type="EQUIPMENT",
                department="Testing",
            )

    def test_facility_resource(self):
        """FACILITY resource should pass."""
        data = ResourceCreate(
            code="FAC-001",
            name="SCIF Lab 1",
            resource_type="FACILITY",
            department="Testing",
        )
        assert data.resource_type == "FACILITY"

    def test_invalid_resource_type_rejected(self):
        """Invalid resource type should be rejected."""
        with pytest.raises(Exception):
            ResourceCreate(
                code="TEST",
                name="Test",
                resource_type="INVALID_TYPE",
                department="Test",
            )

    def test_invalid_nationality_rejected(self):
        """Nationality must be 2-letter ISO code."""
        with pytest.raises(Exception):
            ResourceCreate(
                code="ENG-001",
                name="John Smith",
                resource_type="HUMAN_LABOR",
                department="Avionics",
                nationality="UNITED_KINGDOM",
            )

    def test_generic_placeholder_default(self):
        """is_generic_placeholder should default to False."""
        data = ResourceCreate(
            code="ENG-001",
            name="John Smith",
            resource_type="HUMAN_LABOR",
            department="Avionics",
        )
        assert data.is_generic_placeholder is False

    def test_negative_rate_rejected(self):
        """Negative burdened_hourly_rate should be rejected."""
        with pytest.raises(Exception):
            ResourceCreate(
                code="ENG-001",
                name="John Smith",
                resource_type="HUMAN_LABOR",
                department="Avionics",
                burdened_hourly_rate=Decimal("-50.00"),
            )


# ============================================================================
# Response Schema Tests
# ============================================================================

class TestResponseSchemas:
    """Test the response Pydantic schemas."""

    def test_work_item_response(self):
        """WorkItemCreatedResponse should accept valid data."""
        response = WorkItemCreatedResponse(
            id=uuid4(),
            code="WP-001",
            name="Test WP",
            path="1.wp_001",
            tier="WP",
            security_classification="OFFICIAL",
            created_at="2026-01-01T00:00:00",
        )
        assert response.code == "WP-001"

    def test_resource_response(self):
        """ResourceCreatedResponse should accept valid data."""
        response = ResourceCreatedResponse(
            id=uuid4(),
            code="ENG-001",
            name="John Smith",
            resource_type="HUMAN_LABOR",
            department="Avionics",
            clearance_level="OFFICIAL",
            created_at="2026-01-01T00:00:00",
        )
        assert response.resource_type == "HUMAN_LABOR"
