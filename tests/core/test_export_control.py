"""Comprehensive tests for export control gating, TAA balance tracking,
and foreign disclosure verification.

Validates blocking of foreign subcontractors attempting to view
ITAR-controlled work package specifications without matching TAA licensing,
monetary drawdown interlock, and audit breach logging.
"""
import pytest
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.models import (
    User, UserRole, SecurityClassification,
    PortfolioNode, TreeType,
    ExportControlLicense, ExportControlLicenseType, IssuingAuthority,
    ExportControlRegime,
    ForensicAuditLog, AuditActionType,
)
from app.core.export_control import (
    verify_export_control_compliance,
    check_monetary_drawdown,
    draw_down_license,
    get_license_remaining,
    ExportControlViolationException,
    _get_user_nationalities,
    _get_active_licenses_for_node,
)


# ============================================================================
# Helpers
# ============================================================================

def _make_db():
    """Create an in-memory SQLite database session."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def _make_user(db, citizenship="US", dual=None, cage=None):
    user = User(
        username=f"user_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:8]}@test.com",
        hashed_password="hashed",
        role=UserRole.MEMBER,
        clearance_level=SecurityClassification.SECRET,
        primary_citizenship=citizenship,
        dual_citizenships=dual or [],
        assigned_vendor_cage=cage,
        is_active=True,
    )
    db.add(user)
    db.commit()
    return user


def _make_node(db, regime=ExportControlRegime.NOT_CONTROLLED,
               authorized_nationalities=None, parent_id=None):
    node = PortfolioNode(
        id=uuid4(),
        tree_type=TreeType.WBS,
        code=f"WP-{uuid4().hex[:6]}",
        name="Test Work Package",
        path="1",
        security_classification=SecurityClassification.SECRET,
        export_control_regime=regime,
        authorized_nationalities=authorized_nationalities,
    )
    if parent_id:
        node.parent_id = parent_id
    db.add(node)
    db.commit()
    return node


def _make_license(db, node_id, license_type=ExportControlLicenseType.TAA,
                  nations=None, cages=None, ceiling=None, drawn=Decimal("0"),
                  effective=None, expiration=None):
    if effective is None:
        effective = date.today() - timedelta(days=10)
    if expiration is None:
        expiration = date.today() + timedelta(days=365)
    lic = ExportControlLicense(
        id=uuid4(),
        license_type=license_type,
        license_reference=f"TAA-{uuid4().hex[:8]}",
        issuing_authority=IssuingAuthority.US_DDTC,
        authorized_foreign_nations=nations or ["GB", "DE"],
        authorized_contractor_cages=cages or ["CAGE001"],
        monetary_ceiling=ceiling,
        current_drawn_value=drawn,
        effective_date=effective,
        expiration_date=expiration,
        portfolio_node_id=node_id,
    )
    db.add(lic)
    db.commit()
    return lic


# ============================================================================
# Nationality extraction
# ============================================================================

class TestGetUserNationalities:
    """Test _get_user_nationalities helper."""

    def test_primary_only(self):
        user = User(primary_citizenship="US", dual_citizenships=None)
        assert _get_user_nationalities(user) == ["US"]

    def test_primary_and_dual(self):
        user = User(primary_citizenship="US", dual_citizenships=["GB", "DE"])
        result = _get_user_nationalities(user)
        assert "US" in result
        assert "GB" in result
        assert "DE" in result

    def test_empty_user(self):
        user = User(primary_citizenship=None, dual_citizenships=None)
        assert _get_user_nationalities(user) == []


# ============================================================================
# Export control compliance — uncontrolled nodes
# ============================================================================

class TestUncontrolledNodes:
    """NOT_CONTROLLED and OPEN_GENERAL regimes grant access."""

    def test_not_controlled_grants_access(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.NOT_CONTROLLED)
        user = _make_user(db, citizenship="CN")
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True

    def test_open_general_grants_access(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.OPEN_GENERAL)
        user = _make_user(db, citizenship="RU")
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True


# ============================================================================
# ITAR regime — US person access
# ============================================================================

class TestITARUSPerson:
    """US citizens can access ITAR nodes without a licence."""

    def test_us_citizen_access_itar(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="US")
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True


# ============================================================================
# ITAR regime — foreign national blocking
# ============================================================================

class TestITARForeignNationalBlocked:
    """Foreign nationals are blocked from ITAR nodes without a licence."""

    def test_uk_citizen_blocked_itar_no_license(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="GB")
        with pytest.raises(ExportControlViolationException) as exc_info:
            verify_export_control_compliance(db, node.id, user)
        assert "ITAR" in str(exc_info.value)

    def test_chinese_citizen_blocked_itar(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="CN")
        with pytest.raises(ExportControlViolationException) as exc_info:
            verify_export_control_compliance(db, node.id, user)
        assert "ITAR" in str(exc_info.value)

    def test_breach_audit_logged(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="GB")
        with pytest.raises(ExportControlViolationException):
            verify_export_control_compliance(db, node.id, user)
        db.commit()
        breach = db.query(ForensicAuditLog).filter_by(
            action_type=AuditActionType.EXPORT_CONTROL_BREACH_ATTEMPT,
        ).first()
        assert breach is not None
        assert breach.entity_id == node.id


# ============================================================================
# ITAR regime — TAA licence authorisation
# ============================================================================

class TestITARWithTAALicense:
    """Foreign nationals with active TAA licence can access ITAR nodes."""

    def test_taa_licenses_uk_citizen_access_itar(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="GB")
        _make_license(db, node.id, nations=["GB", "DE"])
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True

    def test_taa_with_cage_match(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="GB", cage="CAGE001")
        _make_license(db, node.id, nations=["GB"], cages=["CAGE001"])
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True

    def test_taa_cage_mismatch_blocked(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="GB", cage="CAGE999")
        _make_license(db, node.id, nations=["GB"], cages=["CAGE001"])
        with pytest.raises(ExportControlViolationException):
            verify_export_control_compliance(db, node.id, user)

    def test_expired_license_blocks_access(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="GB")
        _make_license(
            db, node.id, nations=["GB"],
            expiration=date.today() - timedelta(days=1),
        )
        with pytest.raises(ExportControlViolationException):
            verify_export_control_compliance(db, node.id, user)

    def test_not_yet_effective_license_blocks(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="GB")
        _make_license(
            db, node.id, nations=["GB"],
            effective=date.today() + timedelta(days=30),
        )
        with pytest.raises(ExportControlViolationException):
            verify_export_control_compliance(db, node.id, user)


# ============================================================================
# UK Military List regime
# ============================================================================

class TestUKMilitaryList:
    """UK military list nodes require UK nationality or active licence."""

    def test_uk_citizen_access(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.UK_MILITARY_LIST)
        user = _make_user(db, citizenship="GB")
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True

    def test_non_uk_blocked_without_license(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.UK_MILITARY_LIST)
        user = _make_user(db, citizenship="US")
        with pytest.raises(ExportControlViolationException):
            verify_export_control_compliance(db, node.id, user)

    def test_license_authorizes_us_citizen(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.UK_MILITARY_LIST)
        user = _make_user(db, citizenship="US")
        _make_license(db, node.id, nations=["US"], cages=["CAGE001"])
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True


# ============================================================================
# Node-level authorized_nationalities
# ============================================================================

class TestNodeAuthorizedNationalities:
    """Node-level nationality list acts as an additional gate."""

    def test_matching_nationality_granted(self, db_session=None):
        db = _make_db()
        node = _make_node(
            db, regime=ExportControlRegime.EAR_ECCN,
            authorized_nationalities=["US", "GB"],
        )
        user = _make_user(db, citizenship="US")
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True

    def test_non_matching_nationality_blocked(self, db_session=None):
        db = _make_db()
        node = _make_node(
            db, regime=ExportControlRegime.EAR_ECCN,
            authorized_nationalities=["US"],
        )
        user = _make_user(db, citizenship="CN")
        with pytest.raises(ExportControlViolationException):
            verify_export_control_compliance(db, node.id, user)


# ============================================================================
# Dual citizenship handling
# ============================================================================

class TestDualCitizenship:
    """Users with dual citizenship are checked against all nationalities."""

    def test_dual_citizen_with_matching_nationality(self, db_session=None):
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="GB", dual=["US"])
        result = verify_export_control_compliance(db, node.id, user)
        assert result is True


# ============================================================================
# Monetary drawdown interlock
# ============================================================================

class TestMonetaryDrawdown:
    """Prevent procurement exceeding licence monetary ceiling."""

    def test_check_within_ceiling(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        lic = _make_license(db, node.id, ceiling=Decimal("100000"), drawn=Decimal("20000"))
        result = check_monetary_drawdown(db, lic.id, Decimal("50000"))
        assert result is True

    def test_check_exceeds_ceiling(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        lic = _make_license(db, node.id, ceiling=Decimal("100000"), drawn=Decimal("90000"))
        with pytest.raises(ValueError, match="exceeds remaining"):
            check_monetary_drawdown(db, lic.id, Decimal("20000"))

    def test_draw_down_increments_value(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        lic = _make_license(db, node.id, ceiling=Decimal("100000"), drawn=Decimal("0"))
        new_value = draw_down_license(db, lic.id, Decimal("25000"))
        assert new_value == Decimal("25000")
        db.refresh(lic)
        assert lic.current_drawn_value == Decimal("25000")

    def test_draw_down_rejects_over_ceiling(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        lic = _make_license(db, node.id, ceiling=Decimal("100000"), drawn=Decimal("95000"))
        with pytest.raises(ValueError):
            draw_down_license(db, lic.id, Decimal("10000"))

    def test_no_ceiling_allows_any_value(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        lic = _make_license(db, node.id, ceiling=None, drawn=Decimal("0"))
        result = check_monetary_drawdown(db, lic.id, Decimal("999999999"))
        assert result is True

    def test_get_remaining_amount(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        lic = _make_license(db, node.id, ceiling=Decimal("100000"), drawn=Decimal("30000"))
        remaining = get_license_remaining(db, lic.id)
        assert remaining == Decimal("70000")

    def test_get_remaining_no_ceiling(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        lic = _make_license(db, node.id, ceiling=None)
        remaining = get_license_remaining(db, lic.id)
        assert remaining is None

    def test_get_remaining_missing_license(self, db_session=None):
        db = _make_db()
        remaining = get_license_remaining(db, uuid4())
        assert remaining is None


# ============================================================================
# Active licence queries
# ============================================================================

class TestActiveLicenses:
    """Test _get_active_licenses_for_node date filtering."""

    def test_active_license_found(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        _make_license(db, node.id)
        licenses = _get_active_licenses_for_node(db, node.id)
        assert len(licenses) == 1

    def test_expired_license_not_found(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        _make_license(db, node.id, expiration=date.today() - timedelta(days=1))
        licenses = _get_active_licenses_for_node(db, node.id)
        assert len(licenses) == 0

    def test_future_license_not_found(self, db_session=None):
        db = _make_db()
        node = _make_node(db)
        _make_license(db, node.id, effective=date.today() + timedelta(days=30))
        licenses = _get_active_licenses_for_node(db, node.id)
        assert len(licenses) == 0


# ============================================================================
# ExportControlViolationException
# ============================================================================

class TestExportControlViolationException:
    """Test the exception class attributes."""

    def test_exception_attributes(self):
        exc = ExportControlViolationException("Test violation")
        assert exc.status_code == 403
        assert "Test violation" in str(exc)
        assert exc.detail == "Test violation"

    def test_exception_message_format(self):
        exc = ExportControlViolationException("Unauthorized access")
        assert "Unauthorized access" in str(exc)
        assert exc.reason == "Unauthorized access"


# ============================================================================
# Foreign subcontractor ITAR blocking (key scenario)
# ============================================================================

class TestForeignSubcontractorITARBlocking:
    """Validate blocking of foreign subcontractors viewing ITAR work packages."""

    def test_foreign_subcontractor_blocked_itar_work_package(self, db_session=None):
        """A foreign subcontractor without TAA cannot view ITAR-controlled specs."""
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="DE", cage="CAGE_FOREIGN")
        with pytest.raises(ExportControlViolationException) as exc_info:
            verify_export_control_compliance(db, node.id, user, action_type="VIEW")
        assert "ITAR" in str(exc_info.value)

    def test_taa_licensed_subcontractor_can_view_itar(self, db_session=None):
        """A TAA-licensed subcontractor with matching CAGE can access ITAR data."""
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="DE", cage="CAGE_TAA")
        _make_license(db, node.id, nations=["DE"], cages=["CAGE_TAA"])
        result = verify_export_control_compliance(db, node.id, user, action_type="VIEW")
        assert result is True

    def test_taa_wrong_cage_blocks_subcontractor(self, db_session=None):
        """TAA with wrong CAGE blocks the subcontractor even if nationality matches."""
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="DE", cage="CAGE_WRONG")
        _make_license(db, node.id, nations=["DE"], cages=["CAGE_TAA"])
        with pytest.raises(ExportControlViolationException):
            verify_export_control_compliance(db, node.id, user, action_type="VIEW")

    def test_breach_audit_records_action_type(self, db_session=None):
        """Breach audit log records the attempted action type."""
        db = _make_db()
        node = _make_node(db, regime=ExportControlRegime.ITAR)
        user = _make_user(db, citizenship="CN")
        with pytest.raises(ExportControlViolationException):
            verify_export_control_compliance(db, node.id, user, action_type="VIEW")
        db.commit()
        breach = db.query(ForensicAuditLog).filter_by(
            action_type=AuditActionType.EXPORT_CONTROL_BREACH_ATTEMPT,
        ).first()
        assert breach is not None
        assert breach.json_diff["attempted_action"] == "VIEW"

