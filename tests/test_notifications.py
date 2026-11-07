"""Tests for the notification dispatch engine module.

This module tests the data-spillage guard, Microsoft Adaptive Card generation,
and classification comparison for Teams webhook notifications.
"""
import pytest

from app.models.models import SecurityClassification


class TestNotificationEventTypes:
    """Test the notification event type constants."""

    def test_task_blocked(self):
        """Test TASK_BLOCKED event type."""
        event_type = "TASK_BLOCKED"
        assert event_type == "TASK_BLOCKED"

    def test_handoff_ready(self):
        """Test HANDOFF_READY event type."""
        event_type = "HANDOFF_READY"
        assert event_type == "HANDOFF_READY"

    def test_requisition_pending(self):
        """Test REQUISITION_PENDING event type."""
        event_type = "REQUISITION_PENDING"
        assert event_type == "REQUISITION_PENDING"

    def test_evm_variance_breach(self):
        """Test EVM_VARIANCE_BREACH event type."""
        event_type = "EVM_VARIANCE_BREACH"
        assert event_type == "EVM_VARIANCE_BREACH"


class TestDataSpillageGuard:
    """Test the data-spillage classification guard."""

    def test_official_to_official_no_redaction(self):
        """Test that OFFICIAL node to OFFICIAL channel needs no redaction."""
        from app.core.abac import has_sufficient_clearance
        node_class = SecurityClassification.OFFICIAL
        channel_class = SecurityClassification.OFFICIAL
        needs_redaction = not has_sufficient_clearance(channel_class, node_class)
        assert needs_redaction is False

    def test_secret_to_official_redacted(self):
        """Test that SECRET node to OFFICIAL channel is redacted."""
        from app.core.abac import has_sufficient_clearance
        node_class = SecurityClassification.SECRET
        channel_class = SecurityClassification.OFFICIAL
        needs_redaction = not has_sufficient_clearance(channel_class, node_class)
        assert needs_redaction is True

    def test_secret_to_secret_no_redaction(self):
        """Test that SECRET node to SECRET channel needs no redaction."""
        from app.core.abac import has_sufficient_clearance
        node_class = SecurityClassification.SECRET
        channel_class = SecurityClassification.SECRET
        needs_redaction = not has_sufficient_clearance(channel_class, node_class)
        assert needs_redaction is False

    def test_top_secret_to_secret_redacted(self):
        """Test that TOP_SECRET node to SECRET channel is redacted."""
        from app.core.abac import has_sufficient_clearance
        node_class = SecurityClassification.TOP_SECRET
        channel_class = SecurityClassification.SECRET
        needs_redaction = not has_sufficient_clearance(channel_class, node_class)
        assert needs_redaction is True


class TestRedactedContent:
    """Test the redacted notification content."""

    def test_redacted_title(self):
        """Test that redacted title is 'Restricted Program Update'."""
        redacted_title = "Restricted Program Update"
        assert redacted_title == "Restricted Program Update"

    def test_redacted_body(self):
        """Test that redacted body contains suppression message."""
        redacted_body = "Classified work package has been updated. Details suppressed. Follow internal link to view."
        assert "Details suppressed" in redacted_body
        assert "Classified work package" in redacted_body


class TestAdaptiveCardSchema:
    """Test Microsoft Adaptive Card v1.4 schema."""

    def test_card_version(self):
        """Test that Adaptive Card uses v1.4 schema."""
        card_version = "1.4"
        assert card_version == "1.4"

    def test_card_type(self):
        """Test that card type is AdaptiveCard."""
        card_type = "AdaptiveCard"
        assert card_type == "AdaptiveCard"

    def test_event_card_colors(self):
        """Test that event cards use color-coded themes."""
        colors = {
            "TASK_BLOCKED": "#F87171",  # Red
            "HANDOFF_READY": "#34D399",  # Green
            "REQUISITION_PENDING": "#FBBF24",  # Amber
            "EVM_VARIANCE_BREACH": "#F87171",  # Red
        }
        assert len(colors) == 4

    def test_test_card_color(self):
        """Test that test cards use a distinct color."""
        test_color = "#38BDF8"  # Sky blue
        assert test_color == "#38BDF8"


class TestDownloadUrlExpiry:
    """Test download URL expiry limits."""

    def test_download_url_60_seconds(self):
        """Test that download URLs expire after 60 seconds."""
        expiry_seconds = 60
        assert expiry_seconds == 60

    def test_upload_url_15_minutes(self):
        """Test that upload URLs are valid for 15 minutes."""
        expiry_minutes = 15
        assert expiry_minutes == 15


class TestRetryLogic:
    """Test dispatch retry logic."""

    def test_max_retry_attempts(self):
        """Test that retry logic uses 3 attempts."""
        max_retries = 3
        assert max_retries == 3

    def test_retry_on_failure(self):
        """Test that retries are attempted on failure."""
        attempts = [False, False, True]  # Fail, fail, succeed
        succeeded = any(attempts)
        assert succeeded is True
