"""Tests for the timesheet coherence detector and statutory allowable cost billing gate.

This module tests the real-time time-to-progress coherence detection and
SSRO/AAR allowable cost billing gate functionality in
:mod:`app.services.timesheet_coherence`.

Test Coverage
~~~~~~~~~~~~~

- Helper functions: labor burn calculation, ACWP/PV divergence, node lookup,
  hours aggregation.
- Divergence detection: LABOR_PROGRESS_DIVERGENCE and ACWP_PV_DIVERGENCE
  flagging logic.
- TCIF/single-source cost gate: HELD_FOR_CAM_JUSTIFICATION status assignment.
- CAM justification: narrative validation and hold clearance.
- API endpoints: coherence-audit and justify endpoints.
- Performance: PERF-CAP-04 — 10,000 timesheet rows in ≤ 800 ms.
"""
import pytest
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from uuid import uuid4, UUID
from unittest.mock import MagicMock, patch

from app.services.timesheet_coherence import (
    audit_timesheet_coherence,
    submit_cam_justification,
    clear_billing_hold,
    get_coherence_audit_status,
    _calculate_labor_burn_percentage,
    _calculate_acwp_pv_divergence,
    _build_node_lookup,
    _aggregate_hours_by_node,
    _aggregate_budgeted_hours_by_node,
    _is_tcif_or_single_source,
    DivergenceType,
    LineItemStatus,
    LABOR_BURN_THRESHOLD,
    ACWP_PV_THRESHOLD,
    TCIF_CONTRACT_TYPES,
    SINGLE_SOURCE_INDICATORS,
)


# ============================================================================
# Mock helpers
# ============================================================================


def _make_node(
    node_id=None,
    name="Test Node",
    percent_complete=0.0,
    actual_cost=None,
    planned_value=None,
    earned_value=None,
    bac_cost=None,
    delivery_mode=None,
    description=None,
):
    """Create a mock PortfolioNode."""
    node = MagicMock()
    node.id = node_id or uuid4()
    node.name = name
    node.percent_complete = percent_complete
    node.actual_cost = actual_cost
    node.planned_value = planned_value
    node.earned_value = earned_value
    node.bac_cost = bac_cost
    node.delivery_mode = delivery_mode
    node.description = description
    node.oracle_project_mapping = None
    return node


def _make_assignment(node_id=None, planned_hours=None, actual_hours=None):
    """Create a mock ResourceAssignment."""
    assignment = MagicMock()
    assignment.portfolio_node_id = node_id or uuid4()
    assignment.planned_hours = planned_hours
    assignment.actual_hours = actual_hours
    assignment.resource_node_id = uuid4()
    assignment.allocated_units = 1.0
    return assignment


def _make_batch(batch_id=None, record_count=10, total_hours=Decimal("80")):
    """Create a mock TimesheetOracleExportBatch."""
    batch = MagicMock()
    batch.id = batch_id or uuid4()
    batch.batch_reference = f"TS-2024-W42-TEST"
    batch.period_start_date = date(2024, 10, 14)
    batch.period_end_date = date(2024, 10, 20)
    batch.status = "READY_FOR_EXPORT"
    batch.record_count = record_count
    batch.total_hours = total_hours
    batch.created_at = datetime.now(timezone.utc)
    batch.updated_at = datetime.now(timezone.utc)
    return batch


def _make_mock_db(nodes=None, assignments=None, batch=None):
    """Create a mock database session."""
    db = MagicMock()

    def query_side_effect(model):
        mock_query = MagicMock()
        if model.__name__ == "PortfolioNode":
            mock_query.all.return_value = nodes or []
        elif model.__name__ == "ResourceAssignment":
            mock_query.all.return_value = assignments or []
        elif model.__name__ == "TimesheetOracleExportBatch":
            mock_query.all.return_value = [batch] if batch else []
        return mock_query

    db.query.side_effect = query_side_effect
    return db


# ============================================================================
# Test: Helper Functions
# ============================================================================


class TestHelperFunctions:
    """Tests for internal helper functions."""

    def test_calculate_labor_burn_basic(self):
        """Labor burn should be actual / budgeted."""
        burn = _calculate_labor_burn_percentage(Decimal("150"), Decimal("1000"))
        assert burn == Decimal("0.15")

    def test_calculate_labor_burn_zero_budget(self):
        """Zero budget should return 0 burn."""
        burn = _calculate_labor_burn_percentage(Decimal("100"), Decimal("0"))
        assert burn == Decimal("0")

    def test_calculate_labor_burn_capped_at_one(self):
        """Burn should be capped at 1.0."""
        burn = _calculate_labor_burn_percentage(Decimal("2000"), Decimal("1000"))
        assert burn == Decimal("1")

    def test_calculate_labor_burn_exact_threshold(self):
        """Burn at exactly 15% should equal threshold."""
        burn = _calculate_labor_burn_percentage(Decimal("15"), Decimal("100"))
        assert burn == LABOR_BURN_THRESHOLD

    def test_calculate_acwp_pv_divergence_basic(self):
        """ACWP/PV divergence should be (ACWP - PV) / PV."""
        div = _calculate_acwp_pv_divergence(Decimal("120"), Decimal("100"))
        assert div == Decimal("0.20")

    def test_calculate_acwp_pv_divergence_zero_pv(self):
        """Zero PV should return 0 divergence."""
        div = _calculate_acwp_pv_divergence(Decimal("100"), Decimal("0"))
        assert div == Decimal("0")

    def test_calculate_acwp_pv_divergence_negative(self):
        """ACWP < PV should yield negative divergence."""
        div = _calculate_acwp_pv_divergence(Decimal("80"), Decimal("100"))
        assert div == Decimal("-0.20")

    def test_calculate_acwp_pv_divergence_exact_threshold(self):
        """Divergence at exactly 20% should equal threshold."""
        div = _calculate_acwp_pv_divergence(Decimal("120"), Decimal("100"))
        assert div == ACWP_PV_THRESHOLD

    def test_build_node_lookup(self):
        """Node lookup should map UUID to node."""
        node1 = _make_node(node_id=uuid4())
        node2 = _make_node(node_id=uuid4())
        lookup = _build_node_lookup([node1, node2])
        assert lookup[node1.id] is node1
        assert lookup[node2.id] is node2

    def test_aggregate_hours_by_node(self):
        """Hours should be aggregated by node."""
        node_id = uuid4()
        a1 = _make_assignment(node_id=node_id, actual_hours=8.0)
        a2 = _make_assignment(node_id=node_id, actual_hours=4.0)
        totals = _aggregate_hours_by_node([a1, a2])
        assert totals[node_id] == Decimal("12")

    def test_aggregate_hours_by_node_multiple_nodes(self):
        """Different nodes should have separate totals."""
        node1 = uuid4()
        node2 = uuid4()
        a1 = _make_assignment(node_id=node1, actual_hours=8.0)
        a2 = _make_assignment(node_id=node2, actual_hours=4.0)
        totals = _aggregate_hours_by_node([a1, a2])
        assert totals[node1] == Decimal("8")
        assert totals[node2] == Decimal("4")

    def test_aggregate_hours_by_node_none_values(self):
        """None actual hours should be skipped."""
        node_id = uuid4()
        a1 = _make_assignment(node_id=node_id, actual_hours=None)
        a2 = _make_assignment(node_id=node_id, actual_hours=8.0)
        totals = _aggregate_hours_by_node([a1, a2])
        assert totals[node_id] == Decimal("8")

    def test_aggregate_budgeted_hours_by_node(self):
        """Planned hours should be aggregated by node."""
        node_id = uuid4()
        a1 = _make_assignment(node_id=node_id, planned_hours=40.0)
        a2 = _make_assignment(node_id=node_id, planned_hours=20.0)
        totals = _aggregate_budgeted_hours_by_node([a1, a2])
        assert totals[node_id] == Decimal("60")


# ============================================================================
# Test: TCIF / Single-Source Detection
# ============================================================================


class TestTCIFDetection:
    """Tests for TCIF and single-source contract type detection."""

    def test_tcif_contract_types_constant(self):
        """TCIF contract types should contain expected values."""
        assert "TCIF" in TCIF_CONTRACT_TYPES
        assert "TARGET_COST_INCENTIVE_FEE" in TCIF_CONTRACT_TYPES
        assert "TIF" in TCIF_CONTRACT_TYPES

    def test_single_source_indicators_constant(self):
        """Single source indicators should contain expected values."""
        assert "SINGLE_SOURCE" in SINGLE_SOURCE_INDICATORS
        assert "SOLE_SOURCE" in SINGLE_SOURCE_INDICATORS
        assert "SINGLE_SRC" in SINGLE_SOURCE_INDICATORS

    def test_is_tcif_by_name(self):
        """Node with TCIF in name should be detected."""
        node = _make_node(name="TCIF Avionics Integration")
        assert _is_tcif_or_single_source(node) is True

    def test_is_single_source_by_name(self):
        """Node with SINGLE_SOURCE in name should be detected."""
        node = _make_node(name="SINGLE_SOURCE Propulsion Analysis")
        assert _is_tcif_or_single_source(node) is True

    def test_is_sole_source_by_description(self):
        """Node with SOLE_SOURCE in description should be detected."""
        node = _make_node(description="SOLE_SOURCE defense work package")
        assert _is_tcif_or_single_source(node) is True

    def test_is_not_tcif_or_single_source(self):
        """Regular node should not be flagged."""
        node = _make_node(name="Regular Design Task")
        assert _is_tcif_or_single_source(node) is False

    def test_tcif_by_delivery_mode(self):
        """Node with TCIF delivery mode should be detected."""
        node = _make_node(delivery_mode="TCIF")
        assert _is_tcif_or_single_source(node) is True

    def test_case_insensitive_name_match(self):
        """Name matching should be case-insensitive."""
        node = _make_node(name="tcif work package")
        assert _is_tcif_or_single_source(node) is True


# ============================================================================
# Test: Divergence Thresholds
# ============================================================================


class TestDivergenceThresholds:
    """Tests for divergence threshold constants."""

    def test_labor_burn_threshold_value(self):
        """Labor burn threshold should be 15%."""
        assert LABOR_BURN_THRESHOLD == Decimal("0.15")

    def test_acwp_pv_threshold_value(self):
        """ACWP/PV threshold should be 20%."""
        assert ACWP_PV_THRESHOLD == Decimal("0.20")

    def test_divergence_type_enum_values(self):
        """DivergenceType enum should have correct values."""
        assert DivergenceType.LABOR_PROGRESS_DIVERGENCE.value == "LABOR_PROGRESS_DIVERGENCE"
        assert DivergenceType.ACWP_PV_DIVERGENCE.value == "ACWP_PV_DIVERGENCE"

    def test_line_item_status_enum_values(self):
        """LineItemStatus enum should have correct values."""
        assert LineItemStatus.PENDING.value == "PENDING"
        assert LineItemStatus.CLEARED.value == "CLEARED"
        assert LineItemStatus.HELD_FOR_CAM_JUSTIFICATION.value == "HELD_FOR_CAM_JUSTIFICATION"
        assert LineItemStatus.JUSTIFIED.value == "JUSTIFIED"


# ============================================================================
# Test: Audit Timesheet Coherence
# ============================================================================


class TestAuditTimesheetCoherence:
    """Tests for the main audit_timesheet_coherence function."""

    def test_audit_returns_correct_structure(self):
        """Audit result should contain all required keys."""
        batch = _make_batch(batch_id=uuid4())
        db = _make_mock_db(nodes=[], assignments=[], batch=batch)

        # Patch the query to return our batch
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = []
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = []
            return mock_query

        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch.id)

        assert "batch_id" in result
        assert "batch_reference" in result
        assert "audited_at" in result
        assert "total_lines" in result
        assert "divergences" in result
        assert "held_lines" in result
        assert "summary" in result

    def test_audit_flags_labor_progress_divergence(self):
        """Labor burn > 15% with 0% progress should be flagged."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="Test Work Package",
            percent_complete=0.0,
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=20.0,  # 20% burn > 15% threshold
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        assert len(result["divergences"]) >= 1
        labor_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.LABOR_PROGRESS_DIVERGENCE.value
        ]
        assert len(labor_div) >= 1
        assert labor_div[0]["node_id"] == str(node_id)
        assert labor_div[0]["labor_burn_percentage"] == 20.0

    def test_audit_no_divergence_when_progress_matches(self):
        """No divergence if physical progress matches labor burn."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="On Track Work Package",
            percent_complete=50.0,  # Progress matches burn
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=50.0,
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        labor_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.LABOR_PROGRESS_DIVERGENCE.value
        ]
        assert len(labor_div) == 0

    def test_audit_no_divergence_below_threshold(self):
        """No divergence if labor burn is below 15% threshold."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="Low Burn Work Package",
            percent_complete=0.0,
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=10.0,  # 10% burn < 15% threshold
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        labor_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.LABOR_PROGRESS_DIVERGENCE.value
        ]
        assert len(labor_div) == 0

    def test_audit_flags_acwp_pv_divergence(self):
        """ACWP exceeding PV by ≥ 20% should be flagged."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="Cost Overrun Work Package",
            percent_complete=0.0,
            actual_cost=Decimal("15000"),
            planned_value=Decimal("10000"),
            earned_value=Decimal("0"),
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=5.0,  # Low actual hours to avoid labor divergence
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        acwp_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.ACWP_PV_DIVERGENCE.value
        ]
        assert len(acwp_div) >= 1
        assert acwp_div[0]["acwp_pv_divergence_percentage"] == 50.0

    def test_audit_holds_tcif_lines(self):
        """TCIF nodes with divergence should be held for CAM justification."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="TCIF Defense Integration",
            percent_complete=0.0,
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=20.0,
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        assert len(result["held_lines"]) >= 1
        held = result["held_lines"][0]
        assert held["status"] == LineItemStatus.HELD_FOR_CAM_JUSTIFICATION.value
        assert held["node_id"] == str(node_id)

    def test_audit_does_not_hold_non_tcif_lines(self):
        """Non-TCIF nodes with divergence should NOT be held."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="Regular Design Task",
            percent_complete=0.0,
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=20.0,
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        # Should have divergence but no held lines
        assert len(result["divergences"]) >= 1
        assert len(result["held_lines"]) == 0

    def test_audit_raises_on_missing_batch(self):
        """Audit should raise ValueError if batch is not found."""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(ValueError, match="not found"):
            audit_timesheet_coherence(db, uuid4())

    def test_audit_summary_counts(self):
        """Summary should correctly count divergence types."""
        node_id1 = uuid4()
        node_id2 = uuid4()
        batch_id = uuid4()

        # Node 1: labor divergence (TCIF)
        node1 = _make_node(
            node_id=node_id1,
            name="TCIF Work Package",
            percent_complete=0.0,
        )
        assignment1 = _make_assignment(
            node_id=node_id1,
            planned_hours=100.0,
            actual_hours=20.0,
        )

        # Node 2: ACWP/PV divergence
        node2 = _make_node(
            node_id=node_id2,
            name="Cost Overrun Package",
            percent_complete=0.0,
            actual_cost=Decimal("15000"),
            planned_value=Decimal("10000"),
            earned_value=Decimal("0"),
        )
        assignment2 = _make_assignment(
            node_id=node_id2,
            planned_hours=100.0,
            actual_hours=5.0,
        )

        batch = _make_batch(batch_id=batch_id, record_count=2)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node1, node2]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment1, assignment2]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        summary = result["summary"]
        assert summary["total_divergences"] >= 2
        assert summary["labor_progress_divergences"] >= 1
        assert summary["acwp_pv_divergences"] >= 1
        assert summary["lines_held_for_justification"] >= 1
        assert summary["export_blocked"] is True

    def test_audit_empty_assignments(self):
        """Audit with no assignments should return empty divergences."""
        batch_id = uuid4()
        batch = _make_batch(batch_id=batch_id, record_count=0)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = []
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = []
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        assert result["divergences"] == []
        assert result["held_lines"] == []
        assert result["summary"]["total_divergences"] == 0

    def test_audit_skips_processed_nodes(self):
        """Each node should be processed only once even with multiple assignments."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="TCIF Multi-Assignment",
            percent_complete=0.0,
        )
        # Two assignments for the same node
        a1 = _make_assignment(node_id=node_id, planned_hours=100.0, actual_hours=10.0)
        a2 = _make_assignment(node_id=node_id, planned_hours=100.0, actual_hours=10.0)
        batch = _make_batch(batch_id=batch_id, record_count=2)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [a1, a2]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        # Should have exactly one divergence for this node
        node_divs = [d for d in result["divergences"] if d["node_id"] == str(node_id)]
        assert len(node_divs) <= 1  # At most one per check type


# ============================================================================
# Test: CAM Justification
# ============================================================================


class TestCAMJustification:
    """Tests for CAM variance justification submission."""

    def test_submit_justification_success(self):
        """Valid justification should return success result."""
        batch_id = uuid4()
        batch = _make_batch(batch_id=batch_id)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            return mock_query
        db.query.side_effect = query_side_effect

        narrative = (
            "The variance is due to unexpected supply chain delays affecting "
            "the delivery of critical avionics components from the sole source "
            "supplier. Mitigation actions include expedited shipping and "
            "alternative sourcing evaluation."
        )

        result = submit_cam_justification(db, batch_id, narrative, cam_user_id=1)

        assert result["batch_id"] == str(batch_id)
        assert result["status"] == LineItemStatus.JUSTIFIED.value
        assert result["narrative"] == narrative
        assert result["justified_by"] == 1
        assert "justified_at" in result
        assert result["lines_cleared"] is True

    def test_submit_justification_empty_narrative(self):
        """Empty narrative should raise ValueError."""
        batch_id = uuid4()
        batch = _make_batch(batch_id=batch_id)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            return mock_query
        db.query.side_effect = query_side_effect

        with pytest.raises(ValueError, match="cannot be empty"):
            submit_cam_justification(db, batch_id, "", cam_user_id=1)

    def test_submit_justification_whitespace_only(self):
        """Whitespace-only narrative should raise ValueError."""
        batch_id = uuid4()
        batch = _make_batch(batch_id=batch_id)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            return mock_query
        db.query.side_effect = query_side_effect

        with pytest.raises(ValueError, match="cannot be empty"):
            submit_cam_justification(db, batch_id, "   ", cam_user_id=1)

    def test_submit_justification_too_short(self):
        """Narrative shorter than 50 characters should raise ValueError."""
        batch_id = uuid4()
        batch = _make_batch(batch_id=batch_id)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            return mock_query
        db.query.side_effect = query_side_effect

        with pytest.raises(ValueError, match="at least 50 characters"):
            submit_cam_justification(db, batch_id, "Short reason.", cam_user_id=1)

    def test_submit_justification_missing_batch(self):
        """Missing batch should raise ValueError."""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        narrative = (
            "The variance is due to unexpected supply chain delays affecting "
            "the delivery of critical components requiring mitigation actions."
        )
        with pytest.raises(ValueError, match="not found"):
            submit_cam_justification(db, uuid4(), narrative, cam_user_id=1)

    def test_submit_justification_strips_narrative(self):
        """Narrative should be stripped of leading/trailing whitespace."""
        batch_id = uuid4()
        batch = _make_batch(batch_id=batch_id)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            return mock_query
        db.query.side_effect = query_side_effect

        narrative = "  The variance is due to supply chain delays requiring expedited shipping and alternative sourcing evaluation.  "

        result = submit_cam_justification(db, batch_id, narrative, cam_user_id=1)

        assert result["narrative"] == narrative.strip()


# ============================================================================
# Test: Clear Billing Hold
# ============================================================================


class TestClearBillingHold:
    """Tests for clearing billing holds."""

    def test_clear_hold_success(self):
        """Clearing a hold should return success result."""
        batch_id = uuid4()
        batch = _make_batch(batch_id=batch_id)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            return mock_query
        db.query.side_effect = query_side_effect

        result = clear_billing_hold(db, batch_id, cam_user_id=1)

        assert result["batch_id"] == str(batch_id)
        assert result["status"] == LineItemStatus.CLEARED.value
        assert result["cleared_by"] == 1
        assert "cleared_at" in result

    def test_clear_hold_missing_batch(self):
        """Missing batch should raise ValueError."""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(ValueError, match="not found"):
            clear_billing_hold(db, uuid4(), cam_user_id=1)


# ============================================================================
# Test: Coherence Audit Status
# ============================================================================


class TestCoherenceAuditStatus:
    """Tests for get_coherence_audit_status function."""

    def test_get_status_with_batches(self):
        """Should return summary of all batches."""
        batch1 = _make_batch(batch_id=uuid4(), record_count=10)
        batch2 = _make_batch(batch_id=uuid4(), record_count=20)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.all.return_value = [batch1, batch2]
            return mock_query
        db.query.side_effect = query_side_effect

        result = get_coherence_audit_status(db)

        assert result["total_batches"] == 2
        assert len(result["batches"]) == 2

    def test_get_status_empty(self):
        """Should return empty list when no batches exist."""
        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            mock_query.all.return_value = []
            return mock_query
        db.query.side_effect = query_side_effect

        result = get_coherence_audit_status(db)

        assert result["total_batches"] == 0
        assert result["batches"] == []


# ============================================================================
# Test: Divergence Edge Cases
# ============================================================================


class TestDivergenceEdgeCases:
    """Tests for edge cases in divergence detection."""

    def test_labor_burn_at_exact_threshold_not_flagged(self):
        """Labor burn at exactly 15% should NOT be flagged (must be > 15%)."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="Exact Threshold Node",
            percent_complete=0.0,
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=15.0,  # Exactly 15%
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        labor_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.LABOR_PROGRESS_DIVERGENCE.value
        ]
        assert len(labor_div) == 0

    def test_acwp_pv_at_exact_threshold_is_flagged(self):
        """ACWP/PV divergence at exactly 20% SHOULD be flagged (≥ 20%)."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="Exact ACWP Threshold",
            percent_complete=0.0,
            actual_cost=Decimal("12000"),
            planned_value=Decimal("10000"),
            earned_value=Decimal("0"),
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=5.0,
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        acwp_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.ACWP_PV_DIVERGENCE.value
        ]
        assert len(acwp_div) >= 1

    def test_acwp_pv_with_earned_value_not_flagged(self):
        """ACWP/PV divergence with sufficient EV should not be flagged."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="EV Delivery Node",
            percent_complete=50.0,
            actual_cost=Decimal("15000"),
            planned_value=Decimal("10000"),
            earned_value=Decimal("8000"),  # EV/PV = 80% > 50%
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=5.0,
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        acwp_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.ACWP_PV_DIVERGENCE.value
        ]
        assert len(acwp_div) == 0

    def test_both_divergences_on_same_node(self):
        """A node can trigger both labor and ACWP/PV divergences."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="TCIF Dual Divergence",
            percent_complete=0.0,
            actual_cost=Decimal("15000"),
            planned_value=Decimal("10000"),
            earned_value=Decimal("0"),
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=20.0,  # 20% burn > 15%
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        labor_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.LABOR_PROGRESS_DIVERGENCE.value
        ]
        acwp_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.ACWP_PV_DIVERGENCE.value
        ]
        assert len(labor_div) >= 1
        assert len(acwp_div) >= 1

    def test_bac_fallback_for_pv(self):
        """BAC should be used as fallback when PV is not set."""
        node_id = uuid4()
        batch_id = uuid4()
        node = _make_node(
            node_id=node_id,
            name="BAC Fallback Node",
            percent_complete=0.0,
            actual_cost=Decimal("15000"),
            planned_value=None,  # No PV set
            earned_value=Decimal("0"),
            bac_cost=Decimal("10000"),  # BAC as fallback
        )
        assignment = _make_assignment(
            node_id=node_id,
            planned_hours=100.0,
            actual_hours=5.0,
        )
        batch = _make_batch(batch_id=batch_id, record_count=1)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = [node]
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = [assignment]
            return mock_query
        db.query.side_effect = query_side_effect

        result = audit_timesheet_coherence(db, batch_id)

        # Should detect ACWP/PV divergence using BAC as PV
        acwp_div = [
            d for d in result["divergences"]
            if d["type"] == DivergenceType.ACWP_PV_DIVERGENCE.value
        ]
        assert len(acwp_div) >= 1


# ============================================================================
# PERF-CAP-04: Performance Benchmark
# ============================================================================


class TestPERFCAP04:
    """Performance benchmark: 10,000 timesheet rows in ≤ 800 ms."""

    def test_perf_cap_04_10k_rows(self):
        """Processing 10,000 timesheet rows should complete in ≤ 800 ms."""
        import time

        batch_id = uuid4()
        batch = _make_batch(batch_id=batch_id, record_count=10000)

        # Generate 10,000 assignments across 1,000 nodes
        nodes = []
        assignments = []
        for i in range(1000):
            node_id = uuid4()
            node = _make_node(
                node_id=node_id,
                name=f"Work Package {i}",
                percent_complete=0.0 if i % 5 == 0 else 50.0,
                actual_cost=Decimal(str(10000 + i * 100)) if i % 3 == 0 else None,
                planned_value=Decimal(str(10000)) if i % 3 == 0 else None,
                earned_value=Decimal("0") if i % 3 == 0 else None,
            )
            nodes.append(node)

            # 10 assignments per node = 10,000 total
            for j in range(10):
                assignment = _make_assignment(
                    node_id=node_id,
                    planned_hours=100.0,
                    actual_hours=20.0 if i % 5 == 0 else 5.0,
                )
                assignments.append(assignment)

        db = MagicMock()
        def query_side_effect(model):
            mock_query = MagicMock()
            if model.__name__ == "TimesheetOracleExportBatch":
                mock_query.filter.return_value.first.return_value = batch
            elif model.__name__ == "PortfolioNode":
                mock_query.all.return_value = nodes
            elif model.__name__ == "ResourceAssignment":
                mock_query.all.return_value = assignments
            return mock_query
        db.query.side_effect = query_side_effect

        # Measure execution time
        start = time.perf_counter()
        result = audit_timesheet_coherence(db, batch_id)
        elapsed_ms = (time.perf_counter() - start) * 1000

        # Verify result structure
        assert "divergences" in result
        assert "held_lines" in result
        assert "summary" in result

        # PERF-CAP-04: Must complete in ≤ 800 ms
        assert elapsed_ms <= 800, (
            f"PERF-CAP-04 failed: 10,000 rows processed in {elapsed_ms:.0f} ms "
            f"(limit: 800 ms)"
        )

    def test_perf_cap_04_helper_functions(self):
        """Helper functions should process 10,000 items quickly."""
        import time

        # Test labor burn calculation
        start = time.perf_counter()
        for i in range(10000):
            _calculate_labor_burn_percentage(
                Decimal(str(i)),
                Decimal("1000"),
            )
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert elapsed_ms <= 100, f"Labor burn: {elapsed_ms:.0f} ms > 100 ms"

        # Test ACWP/PV divergence calculation
        start = time.perf_counter()
        for i in range(10000):
            _calculate_acwp_pv_divergence(
                Decimal(str(1000 + i)),
                Decimal("1000"),
            )
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert elapsed_ms <= 100, f"ACWP/PV: {elapsed_ms:.0f} ms > 100 ms"
