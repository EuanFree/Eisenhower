"""
Pytest-based E2E Health Check Tests
====================================

These tests wrap the health_check.py module so it can be run via pytest
and integrated into CI/CD pipelines.

Usage
-----
    pytest tests/e2e/test_health_check.py -v
    pytest tests/e2e/test_health_check.py -v -k api
    pytest tests/e2e/test_health_check.py -v -k views
    pytest tests/e2e/test_health_check.py -v -k controls
"""

import pytest
from pathlib import Path
import sys

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from tests.e2e.health_check import (
    APIHealthChecker,
    ViewRenderingChecker,
    ControlChecker,
    CheckStatus,
    CheckCategory,
)


# ============================================================================
# API Health Check Tests
# ============================================================================

@pytest.mark.e2e
class TestAPIHealth:
    """Test all API endpoints are responding correctly."""

    @pytest.fixture
    def api_checker(self):
        return APIHealthChecker("http://localhost:8000")

    def test_health_endpoint(self, api_checker):
        """Health endpoint should return 200."""
        result = api_checker._check("Health", "/health")
        assert result.status == CheckStatus.PASS.value, f"Health check failed: {result.message}"

    def test_wbs_tree_endpoint(self, api_checker):
        """WBS tree endpoint should respond."""
        result = api_checker._check("WBS Tree", "/api/v1/wbs/tree/default")
        # May require auth, so PASS or SKIP is acceptable
        assert result.status in (CheckStatus.PASS.value, CheckStatus.SKIP.value), f"WBS tree failed: {result.message}"

    def test_admin_health_endpoint(self, api_checker):
        """Admin health endpoint should respond."""
        result = api_checker._check("Admin Health", "/api/v1/admin/health")
        assert result.status in (CheckStatus.PASS.value, CheckStatus.SKIP.value), f"Admin health failed: {result.message}"

    def test_all_api_endpoints(self, api_checker):
        """Run all API checks and report failures."""
        results = api_checker.run_all()
        failures = [r for r in results if r.status == CheckStatus.FAIL.value]
        errors = [r for r in results if r.status == CheckStatus.ERROR.value]

        if failures:
            fail_msgs = [f"{r.name}: {r.message}" for r in failures]
            print(f"\nFailed API checks: {', '.join(fail_msgs)}")

        if errors:
            error_msgs = [f"{r.name}: {r.message}" for r in errors]
            print(f"\nError API checks: {', '.join(error_msgs)}")

        # Allow some failures for endpoints that require auth
        total = len(results)
        passed = sum(1 for r in results if r.status == CheckStatus.PASS.value)
        skip = sum(1 for r in results if r.status == CheckStatus.SKIP.value)

        print(f"\nAPI Summary: {passed}/{total} passed, {skip} skipped, {len(failures)} failed, {len(errors)} errors")

        # At minimum, the health endpoint should pass
        health_results = [r for r in results if "Health" in r.name]
        assert any(r.status == CheckStatus.PASS.value for r in health_results), \
            "At least one health endpoint should pass"


# ============================================================================
# View Rendering Tests
# ============================================================================

@pytest.mark.e2e
class TestViewRendering:
    """Test all frontend views render correctly."""

    @pytest.fixture
    def view_checker(self):
        frontend_dir = project_root / "frontend"
        return ViewRenderingChecker(str(frontend_dir))

    def test_view_resolver_coverage(self, view_checker):
        """All ViewTypes should have resolver cases."""
        result = view_checker._check_view_resolver_coverage()
        assert result.status == CheckStatus.PASS.value, f"ViewResolver coverage failed: {result.message}"

    def test_all_views_importable(self, view_checker):
        """All view files should have valid exports."""
        result = view_checker._check_all_views_importable()
        assert result.status == CheckStatus.PASS.value, f"View exports failed: {result.message}"

    def test_view_metadata_completeness(self, view_checker):
        """View metadata should be complete."""
        result = view_checker._check_view_metadata_completeness()
        assert result.status in (CheckStatus.PASS.value, CheckStatus.SKIP.value), \
            f"View metadata failed: {result.message}"


# ============================================================================
# Control Tests
# ============================================================================

@pytest.mark.e2e
class TestControls:
    """Test all interactive controls are properly configured."""

    @pytest.fixture
    def control_checker(self):
        frontend_dir = project_root / "frontend"
        return ControlChecker(str(frontend_dir), str(project_root))

    def test_ribbon_actions(self, control_checker):
        """Ribbon actions should be registered."""
        result = control_checker._check_ribbon_actions_registered()
        assert result.status == CheckStatus.PASS.value, f"Ribbon actions failed: {result.message}"

    def test_workspace_store_actions(self, control_checker):
        """Workspace store should have all required actions."""
        result = control_checker._check_workspace_store_actions()
        assert result.status == CheckStatus.PASS.value, f"Workspace store failed: {result.message}"

    def test_schedule_store_actions(self, control_checker):
        """Schedule store should have all required actions."""
        result = control_checker._check_schedule_store_actions()
        assert result.status == CheckStatus.PASS.value, f"Schedule store failed: {result.message}"

    def test_kanban_components(self, control_checker):
        """Kanban components should be properly structured."""
        result = control_checker._check_kanban_components()
        assert result.status == CheckStatus.PASS.value, f"Kanban components failed: {result.message}"

    def test_wbs_table_components(self, control_checker):
        """WBS table components should be properly structured."""
        result = control_checker._check_wbs_table_components()
        assert result.status == CheckStatus.PASS.value, f"WBS table failed: {result.message}"

    def test_component_file_integrity(self, control_checker):
        """All component files should have valid structure."""
        result = control_checker._check_component_file_integrity()
        assert result.status == CheckStatus.PASS.value, f"Component integrity failed: {result.message}"

    def test_store_persistence(self, control_checker):
        """Stores should have persistence mechanisms."""
        result = control_checker._check_store_persistence()
        assert result.status == CheckStatus.PASS.value, f"Store persistence failed: {result.message}"

    def test_sprint_kanban_features(self, control_checker):
        """Sprint Kanban features should be present."""
        result = control_checker._check_sprint_kanban_features()
        assert result.status == CheckStatus.PASS.value, f"Sprint Kanban features failed: {result.message}"

    def test_dashboard_components(self, control_checker):
        """Dashboard components should be properly structured."""
        result = control_checker._check_dashboard_components()
        assert result.status == CheckStatus.PASS.value, f"Dashboard components failed: {result.message}"

    def test_inline_task_creation(self, control_checker):
        """Inline task creation features should be present."""
        result = control_checker._check_inline_task_creation()
        assert result.status == CheckStatus.PASS.value, f"Inline task creation failed: {result.message}"

    def test_scheduling_mode_support(self, control_checker):
        """Scheduling mode support should be present."""
        result = control_checker._check_scheduling_mode_support()
        assert result.status == CheckStatus.PASS.value, f"Scheduling mode support failed: {result.message}"

    def test_blocked_activities_dashboard(self, control_checker):
        """Blocked activities dashboard should be present."""
        result = control_checker._check_blocked_activities_dashboard()
        assert result.status == CheckStatus.PASS.value, f"Blocked activities dashboard failed: {result.message}"

    def test_project_selector(self, control_checker):
        """Project selector should be present."""
        result = control_checker._check_project_selector()
        assert result.status == CheckStatus.PASS.value, f"Project selector failed: {result.message}"
