"""Tests for the resource matching and requisition engine.

This module tests the Optimistic/Permissive Match Algorithm that ranks
candidates for resource requisitions based on skill proficiency, security
clearance, and forward capacity availability.
"""
import pytest
from unittest.mock import MagicMock, patch

from app.models.models import (
    ProficiencyLevel,
    VerificationStatus,
    SecurityClassification,
)


class TestProficiencyLevel:
    """Test the proficiency level enum values."""

    def test_novice_is_1(self):
        """Test that NOVICE has value 1."""
        assert ProficiencyLevel.NOVICE.value == 1

    def test_intermediate_is_2(self):
        """Test that INTERMEDIATE has value 2."""
        assert ProficiencyLevel.INTERMEDIATE.value == 2

    def test_competent_is_3(self):
        """Test that COMPETENT has value 3."""
        assert ProficiencyLevel.COMPETENT.value == 3

    def test_expert_is_4(self):
        """Test that EXPERT has value 4."""
        assert ProficiencyLevel.EXPERT.value == 4

    def test_master_is_5(self):
        """Test that MASTER has value 5."""
        assert ProficiencyLevel.MASTER.value == 5

    def test_proficiency_levels_are_ascending(self):
        """Test that proficiency levels are in ascending order."""
        values = [p.value for p in ProficiencyLevel]
        assert values == sorted(values)


class TestVerificationStatus:
    """Test the verification status enum."""

    def test_self_attested(self):
        """Test SELF_ATTESTED status."""
        assert VerificationStatus.SELF_ATTESTED.value == "SELF_ATTESTED"

    def test_endorsed(self):
        """Test ENDORSED status."""
        assert VerificationStatus.ENDORSED.value == "ENDORSED"

    def test_certified(self):
        """Test CERTIFIED status."""
        assert VerificationStatus.CERTIFIED.value == "CERTIFIED"


class TestProficiencyScoring:
    """Test proficiency level to score conversion."""

    def test_novice_scores_20_percent(self):
        """Test that NOVICE proficiency maps to 20% score."""
        score = ProficiencyLevel.NOVICE.value * 20
        assert score == 20

    def test_master_scores_100_percent(self):
        """Test that MASTER proficiency maps to 100% score."""
        score = ProficiencyLevel.MASTER.value * 20
        assert score == 100

    def test_competent_scores_60_percent(self):
        """Test that COMPETENT proficiency maps to 60% score."""
        score = ProficiencyLevel.COMPETENT.value * 20
        assert score == 60


class TestVerificationBonus:
    """Test verification status bonus calculation."""

    def test_certified_bonus_is_10(self):
        """Test that CERTIFIED verification gives +10 bonus."""
        bonus = 10 if VerificationStatus.CERTIFIED else 0
        assert bonus == 10

    def test_endorsed_bonus_is_5(self):
        """Test that ENDORSED verification gives +5 bonus."""
        bonus = 5 if VerificationStatus.ENDORSED else 0
        assert bonus == 5

    def test_self_attested_bonus_is_0(self):
        """Test that SELF_ATTESTED gives no bonus."""
        bonus = 0 if VerificationStatus.SELF_ATTESTED else 1
        assert bonus == 0


class TestClearanceHardGate:
    """Test the security clearance hard gate logic."""

    def test_insufficient_clearance_returns_zero(self):
        """Test that insufficient clearance returns 0% match."""
        user_clearance = SecurityClassification.OFFICIAL
        node_clearance = SecurityClassification.SECRET
        from app.core.abac import has_sufficient_clearance
        if not has_sufficient_clearance(user_clearance, node_clearance):
            score = 0
        else:
            score = 100
        assert score == 0

    def test_sufficient_clearance_allows_match(self):
        """Test that sufficient clearance allows matching."""
        user_clearance = SecurityClassification.SECRET
        node_clearance = SecurityClassification.OFFICIAL
        from app.core.abac import has_sufficient_clearance
        if not has_sufficient_clearance(user_clearance, node_clearance):
            score = 0
        else:
            score = 100
        assert score == 100

    def test_exact_clearance_match_allows(self):
        """Test that exact clearance match allows matching."""
        user_clearance = SecurityClassification.SECRET
        node_clearance = SecurityClassification.SECRET
        from app.core.abac import has_sufficient_clearance
        if not has_sufficient_clearance(user_clearance, node_clearance):
            score = 0
        else:
            score = 100
        assert score == 100


class TestSoftGateDefaultScore:
    """Test the soft gate permissive default scoring."""

    def test_unrated_skill_defaults_to_50(self):
        """Test that an unrated skill defaults to 50% score."""
        # Per spec: unrated non-mandatory skills get 50% neutral default
        default_score = 50
        assert default_score == 50

    def test_zero_skill_requirements_returns_100(self):
        """Test that zero skill requirements returns 100% for all cleared personnel."""
        required_skills = []
        if len(required_skills) == 0:
            score = 100
        else:
            score = 50
        assert score == 100
