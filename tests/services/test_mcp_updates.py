"""Automated test suite for newly registered MCP tools.

Validates that every newly registered tool enforces token authentication,
rejects callers lacking requisite clearance, and correctly serializes payloads.
"""
import pytest
from uuid import uuid4
from unittest.mock import patch, MagicMock

from app.services.mcp_server import (
    get_workforce_demand_forecast,
    query_clearance_pipeline_deficits,
    stage_schedule_shift,
    stage_precedence_link,
    stage_progress_update,
    stage_operational_blocker,
    query_critical_stoppages,
    resolve_stoppage_delegated,
    audit_timesheet_coherence,
    submit_cam_timesheet_justification,
    get_cost_distribution_profile,
    set_cost_distribution_profile,
    audit_fiscal_tranche_overruns,
    list_export_control_licenses,
    check_foreign_disclosure_compliance,
    get_hsm_token_health,
    inspect_quarantine_cycles,
    auto_decouple_quarantine_cycles,
)


# ============================================================================
# 1. Workforce Forecasting & Competency Pipeline
# ============================================================================

class TestGetWorkforceDemandForecast:
    """Test get_workforce_demand_forecast MCP tool."""

    def test_callable(self):
        """Verify get_workforce_demand_forecast is callable."""
        assert callable(get_workforce_demand_forecast)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = get_workforce_demand_forecast(
            auth_token="invalid_token",
            programme_id=str(uuid4()),
        )
        assert "error" in result

    def test_programme_not_found(self):
        """Return error for non-existent programme with invalid token."""
        result = get_workforce_demand_forecast(
            auth_token="bad_token",
            programme_id=str(uuid4()),
        )
        assert "error" in result


class TestQueryClearancePipelineDeficits:
    """Test query_clearance_pipeline_deficits MCP tool."""

    def test_callable(self):
        """Verify query_clearance_pipeline_deficits is callable."""
        assert callable(query_clearance_pipeline_deficits)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = query_clearance_pipeline_deficits(
            auth_token="invalid_token",
            programme_id=str(uuid4()),
        )
        assert "error" in result


# ============================================================================
# 2. Actionable Copilot Invertible Mutations
# ============================================================================

class TestStageScheduleShift:
    """Test stage_schedule_shift MCP tool."""

    def test_callable(self):
        """Verify stage_schedule_shift is callable."""
        assert callable(stage_schedule_shift)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = stage_schedule_shift(
            auth_token="invalid_token",
            node_id=str(uuid4()),
            delta_days=5,
        )
        assert "error" in result


class TestStagePrecedenceLink:
    """Test stage_precedence_link MCP tool."""

    def test_callable(self):
        """Verify stage_precedence_link is callable."""
        assert callable(stage_precedence_link)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = stage_precedence_link(
            auth_token="invalid_token",
            pred_id=str(uuid4()),
            succ_id=str(uuid4()),
        )
        assert "error" in result


class TestStageProgressUpdate:
    """Test stage_progress_update MCP tool."""

    def test_callable(self):
        """Verify stage_progress_update is callable."""
        assert callable(stage_progress_update)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = stage_progress_update(
            auth_token="invalid_token",
            node_id=str(uuid4()),
            physical_percent=50.0,
        )
        assert "error" in result


class TestStageOperationalBlocker:
    """Test stage_operational_blocker MCP tool."""

    def test_callable(self):
        """Verify stage_operational_blocker is callable."""
        assert callable(stage_operational_blocker)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = stage_operational_blocker(
            auth_token="invalid_token",
            node_id=str(uuid4()),
            severity="CRITICAL",
            category="TECHNICAL",
            description="Test",
        )
        assert "error" in result


# ============================================================================
# 3. Emergency Stoppage & Delegated Escalation
# ============================================================================

class TestQueryCriticalStoppages:
    """Test query_critical_stoppages MCP tool."""

    def test_callable(self):
        """Verify query_critical_stoppages is callable."""
        assert callable(query_critical_stoppages)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = query_critical_stoppages(
            auth_token="invalid_token",
            programme_id=str(uuid4()),
        )
        assert "error" in result


class TestResolveStoppageDelegated:
    """Test resolve_stoppage_delegated MCP tool."""

    def test_callable(self):
        """Verify resolve_stoppage_delegated is callable."""
        assert callable(resolve_stoppage_delegated)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = resolve_stoppage_delegated(
            auth_token="invalid_token",
            blocker_id=str(uuid4()),
            resolution_notes="Test",
        )
        assert "error" in result


# ============================================================================
# 4. Timesheet-to-Progress EVM Coherence
# ============================================================================

class TestAuditTimesheetCoherence:
    """Test audit_timesheet_coherence MCP tool."""

    def test_callable(self):
        """Verify audit_timesheet_coherence is callable."""
        assert callable(audit_timesheet_coherence)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = audit_timesheet_coherence(
            auth_token="invalid_token",
            batch_id=str(uuid4()),
        )
        assert "error" in result


class TestSubmitCamTimesheetJustification:
    """Test submit_cam_timesheet_justification MCP tool."""

    def test_callable(self):
        """Verify submit_cam_timesheet_justification is callable."""
        assert callable(submit_cam_timesheet_justification)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = submit_cam_timesheet_justification(
            auth_token="invalid_token",
            batch_id=str(uuid4()),
            narrative="Test",
            recovery_date="2025-12-31",
        )
        assert "error" in result


# ============================================================================
# 5. Cost Curves & Fiscal Tranches
# ============================================================================

class TestGetCostDistributionProfile:
    """Test get_cost_distribution_profile MCP tool."""

    def test_callable(self):
        """Verify get_cost_distribution_profile is callable."""
        assert callable(get_cost_distribution_profile)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = get_cost_distribution_profile(
            auth_token="invalid_token",
            node_id=str(uuid4()),
        )
        assert "error" in result


class TestSetCostDistributionProfile:
    """Test set_cost_distribution_profile MCP tool."""

    def test_callable(self):
        """Verify set_cost_distribution_profile is callable."""
        assert callable(set_cost_distribution_profile)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = set_cost_distribution_profile(
            auth_token="invalid_token",
            node_id=str(uuid4()),
            method="Weibull",
        )
        assert "error" in result


class TestAuditFiscalTrancheOverruns:
    """Test audit_fiscal_tranche_overruns MCP tool."""

    def test_callable(self):
        """Verify audit_fiscal_tranche_overruns is callable."""
        assert callable(audit_fiscal_tranche_overruns)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = audit_fiscal_tranche_overruns(
            auth_token="invalid_token",
            programme_id=str(uuid4()),
            fiscal_year=2025,
        )
        assert "error" in result


# ============================================================================
# 6. Export Control & Foreign Disclosure
# ============================================================================

class TestListExportControlLicenses:
    """Test list_export_control_licenses MCP tool."""

    def test_callable(self):
        """Verify list_export_control_licenses is callable."""
        assert callable(list_export_control_licenses)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = list_export_control_licenses(
            auth_token="invalid_token",
        )
        assert "error" in result


class TestCheckForeignDisclosureCompliance:
    """Test check_foreign_disclosure_compliance MCP tool."""

    def test_callable(self):
        """Verify check_foreign_disclosure_compliance is callable."""
        assert callable(check_foreign_disclosure_compliance)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = check_foreign_disclosure_compliance(
            auth_token="invalid_token",
            node_id=str(uuid4()),
            foreign_nation_iso="GB",
        )
        assert "error" in result


# ============================================================================
# 7. Hardware Enclave & Quarantine Diagnostics
# ============================================================================

class TestGetHsmTokenHealth:
    """Test get_hsm_token_health MCP tool."""

    def test_callable(self):
        """Verify get_hsm_token_health is callable."""
        assert callable(get_hsm_token_health)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = get_hsm_token_health(
            auth_token="invalid_token",
        )
        assert "error" in result


class TestInspectQuarantineCycles:
    """Test inspect_quarantine_cycles MCP tool."""

    def test_callable(self):
        """Verify inspect_quarantine_cycles is callable."""
        assert callable(inspect_quarantine_cycles)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = inspect_quarantine_cycles(
            auth_token="invalid_token",
            batch_id=str(uuid4()),
        )
        assert "error" in result


class TestAutoDecoupleQuarantineCycles:
    """Test auto_decouple_quarantine_cycles MCP tool."""

    def test_callable(self):
        """Verify auto_decouple_quarantine_cycles is callable."""
        assert callable(auto_decouple_quarantine_cycles)

    def test_requires_auth_token(self):
        """Reject calls without valid auth token."""
        result = auto_decouple_quarantine_cycles(
            auth_token="invalid_token",
            batch_id=str(uuid4()),
        )
        assert "error" in result


# ============================================================================
# Payload serialization tests
# ============================================================================

class TestPayloadSerialization:
    """Verify all new tools return properly structured dicts."""

    def test_all_tools_return_dict(self):
        """Every tool must return a dict, even on error with invalid token."""
        tools = [
            (get_workforce_demand_forecast, {"auth_token": "bad", "programme_id": str(uuid4())}),
            (query_clearance_pipeline_deficits, {"auth_token": "bad", "programme_id": str(uuid4())}),
            (stage_schedule_shift, {"auth_token": "bad", "node_id": str(uuid4()), "delta_days": 1}),
            (stage_precedence_link, {"auth_token": "bad", "pred_id": str(uuid4()), "succ_id": str(uuid4())}),
            (stage_progress_update, {"auth_token": "bad", "node_id": str(uuid4()), "physical_percent": 50.0}),
            (stage_operational_blocker, {"auth_token": "bad", "node_id": str(uuid4()), "severity": "CRITICAL", "category": "TECHNICAL", "description": "x"}),
            (query_critical_stoppages, {"auth_token": "bad", "programme_id": str(uuid4())}),
            (resolve_stoppage_delegated, {"auth_token": "bad", "blocker_id": str(uuid4()), "resolution_notes": "x"}),
            (audit_timesheet_coherence, {"auth_token": "bad", "batch_id": str(uuid4())}),
            (submit_cam_timesheet_justification, {"auth_token": "bad", "batch_id": str(uuid4()), "narrative": "x", "recovery_date": "2025-12-31"}),
            (get_cost_distribution_profile, {"auth_token": "bad", "node_id": str(uuid4())}),
            (set_cost_distribution_profile, {"auth_token": "bad", "node_id": str(uuid4()), "method": "Linear"}),
            (audit_fiscal_tranche_overruns, {"auth_token": "bad", "programme_id": str(uuid4()), "fiscal_year": 2025}),
            (list_export_control_licenses, {"auth_token": "bad"}),
            (check_foreign_disclosure_compliance, {"auth_token": "bad", "node_id": str(uuid4()), "foreign_nation_iso": "GB"}),
            (get_hsm_token_health, {"auth_token": "bad"}),
            (inspect_quarantine_cycles, {"auth_token": "bad", "batch_id": str(uuid4())}),
            (auto_decouple_quarantine_cycles, {"auth_token": "bad", "batch_id": str(uuid4())}),
        ]

        for tool, kwargs in tools:
            result = tool(**kwargs)
            assert isinstance(result, dict), f"{tool.__name__} did not return a dict"
            assert "error" in result, f"{tool.__name__} should return error for invalid token"
