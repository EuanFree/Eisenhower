"""Tests for the international export control governance module.

This module tests the foreign disclosure compliance verification engine
that enforces ITAR, EAR, and UK military list regulations. It validates
that user citizenships match authorized nationalities and that employer
licences match TAA/MLA references for controlled technical data.
"""
import pytest
from unittest.mock import MagicMock

from app.core.export_control import (
    ExportControlViolationException,
    verify_nationality_compliance,
    verify_employer_licence,
    verify_foreign_disclosure_compliance,
)
from app.models.models import ExportControlRegime, SecurityClassification


class TestExportControlViolationException:
    """Test the export control violation exception."""

    def test_http_status_is_403(self):
        """Test that the exception raises HTTP 403 Forbidden."""
        exc = ExportControlViolationException("Test violation")
        assert exc.status_code == 403

    def test_error_code_is_export_control_violation(self):
        """Test that the exception has correct HTTP headers."""
        exc = ExportControlViolationException("Test violation")
        assert exc.status_code == 403
        assert "X-Export-Control-Violation" in exc.headers
        assert exc.headers["X-Export-Control-Violation"] == "true"

    def test_detail_contains_message(self):
        """Test that the detail message is preserved."""
        msg = "Nationality not authorized"
        exc = ExportControlViolationException(msg)
        assert msg in str(exc.detail)


class TestVerifyNationalityCompliance:
    """Test nationality compliance checking."""

    def test_not_controlled_regime_always_passes(self):
        """Test that NOT_CONTROLLED regime bypasses nationality checks."""
        user = MagicMock()
        user.primary_citizenship = "GB"
        user.dual_citizenships = []

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.NOT_CONTROLLED
        node.authorized_nationalities = ["GB", "US"]

        result = verify_nationality_compliance(user, node)
        assert result is None

    def test_primary_citizenship_matches(self):
        """Test that matching primary citizenship passes."""
        user = MagicMock()
        user.primary_citizenship = "GB"
        user.dual_citizenships = []

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.ITAR
        node.authorized_nationalities = ["GB", "US", "AU"]

        result = verify_nationality_compliance(user, node)
        assert result is None

    def test_dual_citizenship_matches(self):
        """Test that matching dual citizenship passes."""
        user = MagicMock()
        user.primary_citizenship = "GB"
        user.dual_citizenships = ["US"]

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.EAR_ECCN
        node.authorized_nationalities = ["GB", "US"]

        result = verify_nationality_compliance(user, node)
        assert result is None

    def test_no_citizenship_match_fails(self):
        """Test that no matching citizenship returns denial reason."""
        user = MagicMock()
        user.primary_citizenship = "CN"
        user.dual_citizenships = ["RU"]

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.ITAR
        node.authorized_nationalities = ["GB", "US"]

        result = verify_nationality_compliance(user, node)
        assert result is not None

    def test_null_authorized_nationalities_passes(self):
        """Test that null authorized_nationalities defaults to open access."""
        user = MagicMock()
        user.primary_citizenship = "CN"
        user.dual_citizenships = []

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.OPEN_GENERAL
        node.authorized_nationalities = None

        result = verify_nationality_compliance(user, node)
        assert result is None

    def test_empty_authorized_nationalities_passes(self):
        """Test that empty authorized_nationalities defaults to open access."""
        user = MagicMock()
        user.primary_citizenship = "CN"
        user.dual_citizenships = []

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.OPEN_GENERAL
        node.authorized_nationalities = []

        result = verify_nationality_compliance(user, node)
        assert result is None


class TestVerifyEmployerLicence:
    """Test employer licence verification for ITAR/EAR."""

    def test_not_controlled_regime_skips_check(self):
        """Test that NOT_CONTROLLED regime skips employer check."""
        user = MagicMock()
        user.employer_legal_entity = "Acme Corp"

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.NOT_CONTROLLED
        node.taa_mla_reference = None

        result = verify_employer_licence(user, node)
        assert result is None

    def test_itar_employer_matches(self):
        """Test that ITAR employer match passes."""
        user = MagicMock()
        user.employer_legal_entity = "General Dynamics UK Ltd"

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.ITAR
        node.taa_mla_reference = "TAA-2026-001: General Dynamics UK Ltd, BAE Systems"

        result = verify_employer_licence(user, node)
        assert result is None

    def test_ear_employer_matches(self):
        """Test that EAR employer match passes."""
        user = MagicMock()
        user.employer_legal_entity = "BAE Systems"

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.EAR_ECCN
        node.taa_mla_reference = "MLA-2025-042: BAE Systems, Rolls-Royce"

        result = verify_employer_licence(user, node)
        assert result is None

    def test_itar_employer_mismatch_returns_reason(self):
        """Test that ITAR employer mismatch returns denial reason."""
        user = MagicMock()
        user.employer_legal_entity = "Unauthorized Corp"

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.ITAR
        node.taa_mla_reference = "TAA-2026-001: General Dynamics UK Ltd, BAE Systems"

        result = verify_employer_licence(user, node)
        assert result is not None
        assert "not an authorised licensee" in result

    def test_null_taa_mla_reference_returns_reason(self):
        """Test that null TAA/MLA reference returns denial reason."""
        user = MagicMock()
        user.employer_legal_entity = "Acme Corp"

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.ITAR
        node.taa_mla_reference = None

        result = verify_employer_licence(user, node)
        assert result is not None

    def test_open_general_skips_employer_check(self):
        """Test that OPEN_GENERAL regime skips employer check."""
        user = MagicMock()
        user.employer_legal_entity = "Acme Corp"

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.OPEN_GENERAL
        node.taa_mla_reference = None

        result = verify_employer_licence(user, node)
        assert result is None


class TestVerifyForeignDisclosureCompliance:
    """Test the full foreign disclosure compliance orchestration."""

    def test_full_compliance_passes(self):
        """Test that fully compliant user passes all checks."""
        user = MagicMock()
        user.primary_citizenship = "GB"
        user.dual_citizenships = []
        user.employer_legal_entity = "General Dynamics UK Ltd"
        user.clearance_level = SecurityClassification.SECRET
        user.caveats = ["UK_EYES_ONLY"]

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.ITAR
        node.authorized_nationalities = ["GB", "US"]
        node.taa_mla_reference = "TAA-2026-001: General Dynamics UK Ltd"
        node.security_classification = SecurityClassification.SECRET
        node.caveats = ["UK_EYES_ONLY"]

        # Should not raise
        verify_foreign_disclosure_compliance(user, node)

    def test_nationality_mismatch_raises(self):
        """Test that nationality mismatch raises ExportControlViolationException."""
        user = MagicMock()
        user.primary_citizenship = "CN"
        user.dual_citizenships = []
        user.employer_legal_entity = "General Dynamics UK Ltd"
        user.clearance_level = SecurityClassification.SECRET
        user.caveats = ["UK_EYES_ONLY"]

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.ITAR
        node.authorized_nationalities = ["GB", "US"]
        node.taa_mla_reference = "TAA-2026-001: General Dynamics UK Ltd"
        node.security_classification = SecurityClassification.SECRET
        node.caveats = ["UK_EYES_ONLY"]

        with pytest.raises(ExportControlViolationException):
            verify_foreign_disclosure_compliance(user, node)

    def test_not_controlled_bypasses_all(self):
        """Test that NOT_CONTROLLED regime bypasses all checks."""
        user = MagicMock()
        user.primary_citizenship = "CN"
        user.dual_citizenships = []
        user.employer_legal_entity = "Acme Corp"
        user.clearance_level = SecurityClassification.OFFICIAL
        user.caveats = []

        node = MagicMock()
        node.export_control_regime = ExportControlRegime.NOT_CONTROLLED
        node.authorized_nationalities = None
        node.taa_mla_reference = None
        node.security_classification = SecurityClassification.OFFICIAL
        node.caveats = []

        verify_foreign_disclosure_compliance(user, node)
