"""Tests for the Attribute-Based Access Control (ABAC) module.

This module tests the authorization logic that determines whether a user
can access a classified node based on their clearance level and caveats.
It also tests the ghost-node masking feature that preserves tree hierarchy
when intermediate nodes are classified above the user's clearance.
"""
import pytest
from unittest.mock import MagicMock
from app.core.abac import (
    has_sufficient_clearance,
    has_required_caveats,
    is_node_visible,
    create_ghost_node,
    apply_abac_filtering,
    CLEARANCE_LEVELS,
)
from app.models.models import SecurityClassification


class TestClearanceLevelHierarchy:
    """Test the clearance level hierarchy mapping."""

    def test_official_level_is_zero(self):
        """Test that OFFICIAL has the lowest clearance level (0)."""
        assert CLEARANCE_LEVELS[SecurityClassification.OFFICIAL] == 0

    def test_official_sensitive_level_is_one(self):
        """Test that OFFICIAL_SENSITIVE has level 1."""
        assert CLEARANCE_LEVELS[SecurityClassification.OFFICIAL_SENSITIVE] == 1

    def test_secret_level_is_two(self):
        """Test that SECRET has level 2."""
        assert CLEARANCE_LEVELS[SecurityClassification.SECRET] == 2

    def test_top_secret_level_is_three(self):
        """Test that TOP_SECRET has the highest clearance level (3)."""
        assert CLEARANCE_LEVELS[SecurityClassification.TOP_SECRET] == 3

    def test_hierarchy_is_ascending(self):
        """Test that clearance levels are in ascending order."""
        levels = list(CLEARANCE_LEVELS.values())
        assert levels == sorted(levels)


class TestHasSufficientClearance:
    """Test clearance level comparison logic."""

    def test_official_can_access_official(self):
        """Test that OFFICIAL clearance can access OFFICIAL nodes."""
        assert has_sufficient_clearance(
            SecurityClassification.OFFICIAL,
            SecurityClassification.OFFICIAL
        ) is True

    def test_secret_can_access_official(self):
        """Test that SECRET clearance can access OFFICIAL nodes."""
        assert has_sufficient_clearance(
            SecurityClassification.SECRET,
            SecurityClassification.OFFICIAL
        ) is True

    def test_top_secret_can_access_all(self):
        """Test that TOP_SECRET clearance can access all classification levels."""
        for classification in SecurityClassification:
            assert has_sufficient_clearance(
                SecurityClassification.TOP_SECRET,
                classification
            ) is True

    def test_official_cannot_access_secret(self):
        """Test that OFFICIAL clearance cannot access SECRET nodes."""
        assert has_sufficient_clearance(
            SecurityClassification.OFFICIAL,
            SecurityClassification.SECRET
        ) is False

    def test_official_cannot_access_top_secret(self):
        """Test that OFFICIAL clearance cannot access TOP_SECRET nodes."""
        assert has_sufficient_clearance(
            SecurityClassification.OFFICIAL,
            SecurityClassification.TOP_SECRET
        ) is False

    def test_secret_cannot_access_top_secret(self):
        """Test that SECRET clearance cannot access TOP_SECRET nodes."""
        assert has_sufficient_clearance(
            SecurityClassification.SECRET,
            SecurityClassification.TOP_SECRET
        ) is False

    def test_official_sensitive_can_access_official_sensitive(self):
        """Test that OFFICIAL_SENSITIVE can access OFFICIAL_SENSITIVE nodes."""
        assert has_sufficient_clearance(
            SecurityClassification.OFFICIAL_SENSITIVE,
            SecurityClassification.OFFICIAL_SENSITIVE
        ) is True

    def test_official_sensitive_cannot_access_secret(self):
        """Test that OFFICIAL_SENSITIVE cannot access SECRET nodes."""
        assert has_sufficient_clearance(
            SecurityClassification.OFFICIAL_SENSITIVE,
            SecurityClassification.SECRET
        ) is False


class TestHasRequiredCaveats:
    """Test caveat subset checking logic."""

    def test_no_node_caveats_always_passes(self):
        """Test that a node with no caveats is accessible by anyone with clearance."""
        assert has_required_caveats(["UK_EYES_ONLY"], []) is True
        assert has_required_caveats([], None) is True
        assert has_required_caveats(None, []) is True

    def test_user_has_all_required_caveats(self):
        """Test that access is granted when user has all node caveats."""
        assert has_required_caveats(
            ["UK_EYES_ONLY", "NOFORN"],
            ["UK_EYES_ONLY"]
        ) is True

    def test_user_missing_required_caveat(self):
        """Test that access is denied when user is missing a required caveat."""
        assert has_required_caveats(
            ["UK_EYES_ONLY"],
            ["UK_EYES_ONLY", "NOFORN"]
        ) is False

    def test_user_has_no_caveats_but_node_requires_some(self):
        """Test that access is denied when user has no caveats but node requires them."""
        assert has_required_caveats([], ["UK_EYES_ONLY"]) is False
        assert has_required_caveats(None, ["UK_EYES_ONLY"]) is False

    def test_both_empty_caveats_pass(self):
        """Test that both empty caveat lists pass the check."""
        assert has_required_caveats([], []) is True

    def test_user_has_extra_caveats_is_ok(self):
        """Test that having extra caveats beyond what's required is fine."""
        assert has_required_caveats(
            ["UK_EYES_ONLY", "NOFORN", "REL_TO"],
            ["UK_EYES_ONLY"]
        ) is True


class TestIsNodeVisible:
    """Test combined clearance and caveat visibility check."""

    def test_visible_with_sufficient_clearance_and_caveats(self):
        """Test that a node is visible when both clearance and caveats match."""
        node = MagicMock()
        node.security_classification = SecurityClassification.OFFICIAL
        node.caveats = []
        assert is_node_visible(
            SecurityClassification.SECRET,
            ["UK_EYES_ONLY"],
            node
        ) is True

    def test_not_visible_insufficient_clearance(self):
        """Test that a node is not visible when clearance is insufficient."""
        node = MagicMock()
        node.security_classification = SecurityClassification.TOP_SECRET
        node.caveats = []
        assert is_node_visible(
            SecurityClassification.OFFICIAL,
            ["UK_EYES_ONLY", "NOFORN"],
            node
        ) is False

    def test_not_visible_missing_caveat(self):
        """Test that a node is not visible when a required caveat is missing."""
        node = MagicMock()
        node.security_classification = SecurityClassification.OFFICIAL
        node.caveats = ["UK_EYES_ONLY", "NOFORN"]
        assert is_node_visible(
            SecurityClassification.TOP_SECRET,
            ["UK_EYES_ONLY"],
            node
        ) is False

    def test_visible_with_exact_clearance_match(self):
        """Test that a node is visible when clearance exactly matches."""
        node = MagicMock()
        node.security_classification = SecurityClassification.SECRET
        node.caveats = ["UK_EYES_ONLY"]
        assert is_node_visible(
            SecurityClassification.SECRET,
            ["UK_EYES_ONLY"],
            node
        ) is True


class TestCreateGhostNode:
    """Test ghost-node masking for hierarchy preservation."""

    def _make_mock_node(self, node_id="12345", name="Classified Project",
                        code="SECRET-001", custom_attrs=None, path="1.2"):
        """Helper to create a mock node with all required attributes."""
        node = MagicMock()
        node.id = node_id
        node.parent_id = None
        node.tree_type = MagicMock()
        type(node.tree_type).value = property(lambda s: "WBS")
        node.code = code
        node.name = name
        node.path = path
        node.security_classification = SecurityClassification.SECRET
        node.caveats = ["UK_EYES_ONLY"]
        node.odac_permissions = None
        node.custom_attributes = custom_attrs or {"key": "value"}
        node.is_active = True
        node.created_at = None
        node.updated_at = None
        return node

    def test_ghost_node_has_masked_name(self):
        """Test that a ghost node's name is replaced with '[RESTRICTED]'."""
        node = self._make_mock_node()
        ghost = create_ghost_node(node)
        assert ghost["name"] == "[RESTRICTED]"
        assert ghost["is_masked"] is True

    def test_ghost_node_has_masked_code(self):
        """Test that a ghost node's code is replaced with '[RESTRICTED]'."""
        node = self._make_mock_node()
        ghost = create_ghost_node(node)
        assert ghost["code"] == "[RESTRICTED]"

    def test_ghost_node_has_masked_custom_attributes(self):
        """Test that a ghost node's custom_attributes are replaced with '[RESTRICTED]'."""
        node = self._make_mock_node()
        ghost = create_ghost_node(node)
        assert ghost["custom_attributes"] == "[RESTRICTED]"

    def test_ghost_node_preserves_id(self):
        """Test that a ghost node preserves its ID for tree rendering."""
        node = self._make_mock_node(node_id="unique-id-123")
        ghost = create_ghost_node(node)
        assert ghost["id"] == "unique-id-123"

    def test_ghost_node_preserves_path(self):
        """Test that a ghost node preserves its path for tree rendering."""
        node = self._make_mock_node(path="1.2.3")
        ghost = create_ghost_node(node)
        assert ghost["path"] == "1.2.3"


class TestApplyAbacFiltering:
    """Test subtree filtering with ghost-node masking."""

    def _make_mock_node(self, node_id, security_class, caveats, name, code, parent_id=None):
        """Helper to create a mock node with all required attributes."""
        node = MagicMock()
        node.id = node_id
        node.parent_id = parent_id
        node.tree_type = MagicMock()
        type(node.tree_type).value = property(lambda s: "WBS")
        node.code = code
        node.name = name
        node.path = f"1.{node_id}"
        node.security_classification = security_class
        node.caveats = caveats
        node.odac_permissions = None
        node.custom_attributes = {}
        node.is_active = True
        node.created_at = None
        node.updated_at = None
        return node

    def test_filter_returns_visible_nodes(self):
        """Test that visible nodes are returned normally."""
        visible_node = self._make_mock_node(
            "visible-1", SecurityClassification.OFFICIAL, [],
            "Visible Node", "VIS-001"
        )

        result = apply_abac_filtering(
            [visible_node],
            SecurityClassification.SECRET,
            ["UK_EYES_ONLY"]
        )
        assert len(result) == 1
        assert result[0]["id"] == "visible-1"
        assert result[0]["name"] == "Visible Node"
        assert result[0]["is_masked"] is False

    def test_filter_masks_restricted_nodes_with_visible_children(self):
        """Test that restricted parent nodes are masked when children are visible."""
        parent = self._make_mock_node(
            "parent-1", SecurityClassification.TOP_SECRET, ["NOFORN"],
            "Restricted Parent", "SEC-001"
        )
        child = self._make_mock_node(
            "child-1", SecurityClassification.OFFICIAL, [],
            "Visible Child", "VIS-001", parent_id="parent-1"
        )

        result = apply_abac_filtering(
            [parent, child],
            SecurityClassification.SECRET,
            ["UK_EYES_ONLY"]
        )
        # Parent should be masked (ghost), child should be visible
        assert len(result) == 2
        assert result[0]["is_masked"] is True
        assert result[0]["name"] == "[RESTRICTED]"
        assert result[1]["is_masked"] is False
        assert result[1]["name"] == "Visible Child"

    def test_filter_excludes_fully_restricted_nodes(self):
        """Test that fully restricted nodes with no visible children are excluded."""
        restricted = self._make_mock_node(
            "sec-1", SecurityClassification.TOP_SECRET, ["NOFORN"],
            "Restricted", "SEC-001"
        )

        result = apply_abac_filtering(
            [restricted],
            SecurityClassification.SECRET,
            ["UK_EYES_ONLY"]
        )
        # Node is restricted and has no visible children, so it's excluded
        assert len(result) == 0

    def test_filter_mixed_visibility(self):
        """Test that a mix of visible and restricted nodes is correctly filtered."""
        visible = self._make_mock_node(
            "vis-1", SecurityClassification.OFFICIAL, [],
            "Visible", "VIS-001"
        )
        # Restricted node with no children — excluded
        restricted = self._make_mock_node(
            "sec-1", SecurityClassification.TOP_SECRET, [],
            "Restricted", "SEC-001"
        )

        result = apply_abac_filtering(
            [visible, restricted],
            SecurityClassification.SECRET,
            []
        )
        assert len(result) == 1
        assert result[0]["name"] == "Visible"
        assert result[0]["is_masked"] is False
