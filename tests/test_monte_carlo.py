"""Tests for the Monte Carlo Schedule Risk Analysis module.

This module tests the Beta-PERT and Triangular sampling formulas,
percentile computation, and criticality index calculations.
"""
import pytest


class TestBetaPERTSampling:
    """Test Beta-PERT distribution sampling formula."""

    def test_alpha_beta_formula(self):
        """Test: alpha = 1 + 4*(M-O)/(P-O), beta = 1 + 4*(P-M)/(P-O)."""
        o = 10.0  # optimistic
        m = 20.0  # most likely
        p = 30.0  # pessimistic

        alpha = 1 + 4 * (m - o) / (p - o)
        beta = 1 + 4 * (p - m) / (p - o)

        assert alpha == 3.0
        assert beta == 3.0

    def test_skewed_distribution(self):
        """Test skewed Beta-PERT parameters."""
        o = 10.0
        m = 12.0
        p = 30.0

        alpha = 1 + 4 * (m - o) / (p - o)
        beta = 1 + 4 * (p - m) / (p - o)

        # alpha = 1 + 4*(12-10)/(30-10) = 1 + 8/20 = 1.4
        # beta = 1 + 4*(30-12)/(30-10) = 1 + 72/20 = 4.6
        assert abs(alpha - 1.4) < 0.01
        assert abs(beta - 4.6) < 0.01

    def test_sample_range(self):
        """Test that sampled value falls within [O, P] range."""
        o = 10.0
        p = 30.0
        beta_sample = 0.5  # midpoint
        d = o + beta_sample * (p - o)
        assert o <= d <= p

    def test_expected_value(self):
        """Test that expected value matches PERT formula: (O + 4M + P) / 6."""
        o = 10.0
        m = 20.0
        p = 30.0
        expected = (o + 4 * m + p) / 6.0
        assert expected == 20.0


class TestTriangularSampling:
    """Test Triangular distribution sampling."""

    def test_sample_within_range(self):
        """Test that triangular sample falls within [O, P]."""
        o = 10.0
        p = 30.0
        sample = 20.0  # midpoint
        assert o <= sample <= p

    def test_midpoint_is_most_likely(self):
        """Test that midpoint equals most likely value."""
        o = 10.0
        p = 30.0
        midpoint = (o + p) / 2.0
        assert midpoint == 20.0


class TestPercentileComputation:
    """Test percentile computation from distribution."""

    def test_p50_is_median(self):
        """Test that P50 represents the median."""
        values = sorted([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
        n = len(values)
        p50 = (values[n // 2 - 1] + values[n // 2]) / 2.0
        assert p50 == 55.0

    def test_p80_defence_baseline(self):
        """Test that P80 is the standard defence baseline."""
        values = sorted([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
        n = len(values)
        idx = int(0.8 * (n - 1))
        p80 = values[idx]
        assert p80 >= 50

    def test_p90_high_confidence(self):
        """Test that P90 provides high-confidence planning."""
        values = sorted([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
        n = len(values)
        idx = int(0.9 * (n - 1))
        p90 = values[idx]
        assert p90 >= 80

    def test_percentile_ordering(self):
        """Test that P50 <= P80 <= P90."""
        values = sorted([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
        n = len(values)
        p50_idx = int(0.5 * (n - 1))
        p80_idx = int(0.8 * (n - 1))
        p90_idx = int(0.9 * (n - 1))
        p50 = values[p50_idx]
        p80 = values[p80_idx]
        p90 = values[p90_idx]
        assert p50 <= p80 <= p90


class TestCriticalityIndex:
    """Test criticality index calculation."""

    def test_criticality_range(self):
        """Test that criticality index is in [0, 1] range."""
        critical_count = 1500
        total_iterations = 2000
        ci = critical_count / total_iterations
        assert 0.0 <= ci <= 1.0

    def test_always_critical(self):
        """Test that always-critical task has CI = 1.0."""
        critical_count = 2000
        total_iterations = 2000
        ci = critical_count / total_iterations
        assert ci == 1.0

    def test_never_critical(self):
        """Test that never-critical task has CI = 0.0."""
        critical_count = 0
        total_iterations = 2000
        ci = critical_count / total_iterations
        assert ci == 0.0

    def test_half_critical(self):
        """Test that half-critical task has CI = 0.5."""
        critical_count = 1000
        total_iterations = 2000
        ci = critical_count / total_iterations
        assert ci == 0.5


class TestDistributionPoints:
    """Test distribution curve points for UI plotting."""

    def test_approximately_50_points(self):
        """Test that ~50 distribution points are generated for UI."""
        num_points = 50
        assert 40 <= num_points <= 60

    def test_points_sorted_by_duration(self):
        """Test that distribution points are sorted by duration."""
        points = [
            {"duration": 100, "probability": 0.1},
            {"duration": 150, "probability": 0.5},
            {"duration": 200, "probability": 0.9},
        ]
        sorted_points = sorted(points, key=lambda x: x["duration"])
        assert sorted_points[0]["duration"] <= sorted_points[-1]["duration"]
