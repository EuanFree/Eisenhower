"""Tests for the leases module.

Generated test suite covering 0 functions and 6 classes.
"""
import pytest

from app.schemas.leases import (CheckOutRequest, CheckOutResponse, HeartbeatResponse, CheckInResponse, ForceBreakResponse, LeaseInfoResponse)

class TestCheckOutRequest:
    """Test the CheckOutRequest class."""

    def test_checkoutrequest_exists(self):
        """Verify CheckOutRequest can be imported."""
        assert CheckOutRequest is not None


class TestCheckOutResponse:
    """Test the CheckOutResponse class."""

    def test_checkoutresponse_exists(self):
        """Verify CheckOutResponse can be imported."""
        assert CheckOutResponse is not None


class TestHeartbeatResponse:
    """Test the HeartbeatResponse class."""

    def test_heartbeatresponse_exists(self):
        """Verify HeartbeatResponse can be imported."""
        assert HeartbeatResponse is not None


class TestCheckInResponse:
    """Test the CheckInResponse class."""

    def test_checkinresponse_exists(self):
        """Verify CheckInResponse can be imported."""
        assert CheckInResponse is not None


class TestForceBreakResponse:
    """Test the ForceBreakResponse class."""

    def test_forcebreakresponse_exists(self):
        """Verify ForceBreakResponse can be imported."""
        assert ForceBreakResponse is not None


class TestLeaseInfoResponse:
    """Test the LeaseInfoResponse class."""

    def test_leaseinforesponse_exists(self):
        """Verify LeaseInfoResponse can be imported."""
        assert LeaseInfoResponse is not None

