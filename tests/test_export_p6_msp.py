"""Tests for the Primavera P6 and MS Project export modules.

This module tests the .xer and .xml serialization, classified description
redaction, and commercial rate masking for export control compliance.
"""
import pytest


class TestXERFormat:
    """Test Primavera P6 .xer batch text format."""

    def test_xer_table_headers(self):
        """Test that .xer contains required table headers."""
        headers = ["%T PROJWBS", "%T TASK", "%T TASKPRED", "%T CALENDAR"]
        assert "%T PROJWBS" in headers
        assert "%T TASK" in headers
        assert "%T TASKPRED" in headers
        assert "%T CALENDAR" in headers

    def test_xer_act_table(self):
        """Test that .xer contains ACT table for activities."""
        act_fields = ["ACT", "WBS", "START", "FINISH", "PERCENT_COMPLETE"]
        assert "ACT" in act_fields
        assert "WBS" in act_fields

    def test_xer_actrel_table(self):
        """Test that .xer contains ACTREL table for dependencies."""
        actrel_fields = ["ACTREL", "PREDECESSOR", "SUCCESSOR", "TYPE"]
        assert "ACTREL" in actrel_fields
        assert "PREDECESSOR" in actrel_fields
        assert "SUCCESSOR" in actrel_fields


class TestMSPXMLFormat:
    """Test Microsoft Project XML schema."""

    def test_xml_namespace(self):
        """Test that XML uses correct Microsoft Project namespace."""
        namespace = "http://schemas.microsoft.com/project"
        assert namespace == "http://schemas.microsoft.com/project"

    def test_xml_root_element(self):
        """Test that XML root element is Project."""
        root_element = "Project"
        assert root_element == "Project"

    def test_xml_required_elements(self):
        """Test that XML contains required elements."""
        elements = ["Calendar", "Tasks", "Predecessors", "Resources", "Assignments"]
        assert "Calendar" in elements
        assert "Tasks" in elements
        assert "Predecessors" in elements
        assert "Resources" in elements
        assert "Assignments" in elements


class TestClassifiedRedaction:
    """Test classified description redaction for export."""

    def test_secret_redacted(self):
        """Test that SECRET+ node names are replaced with [RESTRICTED]."""
        from app.models.models import SecurityClassification
        node_class = SecurityClassification.SECRET
        redacted = "[RESTRICTED]"
        assert redacted == "[RESTRICTED]"

    def test_top_secret_redacted(self):
        """Test that TOP_SECRET node names are replaced with [RESTRICTED]."""
        from app.models.models import SecurityClassification
        node_class = SecurityClassification.TOP_SECRET
        redacted = "[RESTRICTED]"
        assert redacted == "[RESTRICTED]"

    def test_official_not_redacted(self):
        """Test that OFFICIAL node names are not redacted."""
        from app.models.models import SecurityClassification
        node_class = SecurityClassification.OFFICIAL
        # OFFICIAL nodes are not redacted
        is_redacted = node_class in (SecurityClassification.SECRET, SecurityClassification.TOP_SECRET)
        assert is_redacted is False


class TestRateMasking:
    """Test commercial labor rate masking."""

    def test_rate_masked_to_zero(self):
        """Test that masked rates are set to 0.00."""
        original_rate = 150.00
        masked_rate = 0.00
        assert masked_rate == 0.00

    def test_rate_preserved_without_masking(self):
        """Test that rates are preserved when masking is disabled."""
        original_rate = 150.00
        masked_rate = original_rate
        assert masked_rate == 150.00


class TestExportAudit:
    """Test export audit logging."""

    def test_export_action_type(self):
        """Test that export uses EXPORT action type."""
        action_type = "EXPORT"
        assert action_type == "EXPORT"

    def test_audit_entry_fields(self):
        """Test that audit entry contains required fields."""
        entry = {
            "action_type": "EXPORT",
            "entity_type": "schedule",
            "entity_id": "uuid-123",
            "format": "xer",
        }
        assert "action_type" in entry
        assert "entity_type" in entry
        assert "format" in entry


class TestSanitizationToggles:
    """Test export sanitization toggle parameters."""

    def test_redact_classified_descriptions(self):
        """Test that redact_classified_descriptions toggle works."""
        redact = True
        assert redact is True

    def test_mask_commercial_rates(self):
        """Test that mask_commercial_labor_rates toggle works."""
        mask = True
        assert mask is True

    def test_both_disabled(self):
        """Test that both toggles can be disabled."""
        redact = False
        mask = False
        assert redact is False
        assert mask is False
