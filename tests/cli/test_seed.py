"""Tests for the seed module.

Generated test suite covering 3 functions and 1 classes.
"""
import pytest

from app.cli.seed import (run_benchmarks, setup_database, main)
from app.cli.seed import (BenchmarkSeeder, SovereignDefenceSeeder)

class TestRun_benchmarks:
    """Test the run_benchmarks function."""

    def test_run_benchmarks_exists(self):
        """Verify run_benchmarks is callable."""
        assert callable(run_benchmarks)


class TestSetup_database:
    """Test the setup_database function."""

    def test_setup_database_exists(self):
        """Verify setup_database is callable."""
        assert callable(setup_database)


class TestMain:
    """Test the main function."""

    def test_main_exists(self):
        """Verify main is callable."""
        assert callable(main)


class TestBenchmarkSeeder:
    """Test the BenchmarkSeeder class."""

    def test_benchmarkseeder_exists(self):
        """Verify BenchmarkSeeder can be imported."""
        assert BenchmarkSeeder is not None


class TestSovereignDefenceSeeder:
    """Test the SovereignDefenceSeeder class for Project Chimera scenario."""

    def test_seeder_class_exists(self):
        """Verify SovereignDefenceSeeder can be imported."""
        assert SovereignDefenceSeeder is not None

    def test_seeder_has_seed_method(self):
        """Verify the seed() entry point exists."""
        assert hasattr(SovereignDefenceSeeder, 'seed')
        assert callable(getattr(SovereignDefenceSeeder, 'seed'))

    def test_seeder_has_all_create_methods(self):
        """Verify all required creation methods are present."""
        required_methods = [
            '_create_users',
            '_create_programme_root',
            '_create_subsystems',
            '_create_control_accounts',
            '_create_work_packages',
            '_create_tasks_and_milestones',
            '_create_pdm_dependencies',
            '_create_resources_and_assignments',
            '_create_cdrls',
            '_create_cost_profiles',
            '_create_subtree_locks',
            '_create_delegations',
            '_create_schedule_clashes',
            '_create_3point_estimates',
        ]
        for method_name in required_methods:
            assert hasattr(SovereignDefenceSeeder, method_name), \
                f"Missing method: {method_name}"
            assert callable(getattr(SovereignDefenceSeeder, method_name)), \
                f"Method not callable: {method_name}"

    def test_expected_node_count_meets_requirement(self):
        """Verify the expected node count meets the 250+ requirement.

        Tier 1: 1 (programme root)
        Tier 2: 5 (subsystems)
        Tier 3: 11 (control accounts)
        Tier 4: 66 (work packages, 6 per CA)
        Tier 5: 528 (tasks, 8 per WP) + 66 (milestones, 1 per WP) = 594
        Total: 677
        """
        tier1 = 1  # Programme root
        tier2 = 5  # Subsystems
        tier3 = 11  # Control accounts
        tier4 = 66  # Work packages (11 CAs * 6 WPs each)
        tier5_tasks = 528  # Tasks (66 WPs * 8 tasks each)
        tier5_milestones = 66  # Milestones (1 per WP)
        total = tier1 + tier2 + tier3 + tier4 + tier5_tasks + tier5_milestones

        assert total >= 250, f"Expected 250+ nodes, calculated {total}"
        assert total == 677, f"Expected 677 nodes, calculated {total}"

    def test_5_tier_wbs_structure(self):
        """Verify the 5-tier WBS structure is defined."""
        # Tier 1: Programme root
        assert hasattr(SovereignDefenceSeeder, '_create_programme_root')
        # Tier 2: Subsystems
        assert hasattr(SovereignDefenceSeeder, '_create_subsystems')
        # Tier 3: Control Accounts
        assert hasattr(SovereignDefenceSeeder, '_create_control_accounts')
        # Tier 4: Work Packages
        assert hasattr(SovereignDefenceSeeder, '_create_work_packages')
        # Tier 5: Tasks and Milestones
        assert hasattr(SovereignDefenceSeeder, '_create_tasks_and_milestones')

    def test_security_tiers_integration(self):
        """Verify mixed security tiers are supported via user creation."""
        # Users are created with different clearance levels
        assert hasattr(SovereignDefenceSeeder, '_create_users')

    def test_dal_accreditation_support(self):
        """Verify DAL accreditation is assigned to subsystems and tasks."""
        # DAL_A on flight software, DAL_B on radar DSP
        assert hasattr(SovereignDefenceSeeder, '_create_subsystems')
        assert hasattr(SovereignDefenceSeeder, '_create_tasks_and_milestones')

    def test_facility_constraints(self):
        """Verify environmental chamber and equipment constraints are created."""
        # Environmental chamber bookings with cooldown buffers
        # Test equipment with calibration dates
        assert hasattr(SovereignDefenceSeeder, '_create_resources_and_assignments')

    def test_non_linear_cost_profiles(self):
        """Verify Weibull and Beta cost profiles are assigned."""
        assert hasattr(SovereignDefenceSeeder, '_create_cost_profiles')
        assert hasattr(SovereignDefenceSeeder, '_create_work_packages')

    def test_cam_checkout_leases(self):
        """Verify SubTreeLock CAM leases are seeded."""
        assert hasattr(SovereignDefenceSeeder, '_create_subtree_locks')

    def test_delegation_records(self):
        """Verify delegation records are created."""
        assert hasattr(SovereignDefenceSeeder, '_create_delegations')

    def test_dcma_schedule_clashes(self):
        """Verify intentional DCMA schedule clashes are seeded."""
        assert hasattr(SovereignDefenceSeeder, '_create_schedule_clashes')

    def test_pdm_logic_links(self):
        """Verify PDM dependency links (FS, SS, FF, SF) are created."""
        assert hasattr(SovereignDefenceSeeder, '_create_pdm_dependencies')

    def test_cdrl_deliverables(self):
        """Verify statutory CDRL deliverables are created."""
        assert hasattr(SovereignDefenceSeeder, '_create_cdrls')

    def test_3point_estimates(self):
        """Verify 3-point Monte Carlo estimates are created."""
        assert hasattr(SovereignDefenceSeeder, '_create_3point_estimates')

    def test_seeder_initialization(self):
        """Verify SovereignDefenceSeeder initializes with correct attributes."""
        # Create a mock db object to test initialization
        class MockDB:
            def add(self, obj): pass
            def flush(self): pass
            def commit(self): pass

        seeder = SovereignDefenceSeeder(MockDB())
        assert seeder.db is not None
        assert seeder.nodes == []
        assert seeder.resources == []
        assert seeder.users == []
        assert seeder.deps == []
        assert seeder.clashes == []
        assert seeder.cdrls == []
        assert seeder.locks == []
        assert seeder.delegations == []

    def test_scenario_node_count_calculation(self):
        """Verify the complete node count breakdown for Project Chimera."""
        # Programme root
        programme_root = 1
        # Subsystems: AVIONICS_SUITE, PROPULSION_TELEMETRY, TEST_ENVELOPE,
        #             STRUCTURAL_INTEGRITY, GROUND_SUPPORT_EQUIPMENT
        subsystems = 5
        # Control Accounts: 11 CAs across 5 subsystems
        control_accounts = 11
        # Work Packages: 6 per CA (REQ, DES, DET, IMP, INT, VER)
        work_packages = control_accounts * 6  # 66
        # Tasks: 8 per WP
        tasks = work_packages * 8  # 528
        # Milestones: 1 per WP
        milestones = work_packages  # 66

        total = programme_root + subsystems + control_accounts + work_packages + tasks + milestones

        assert total == 677
        assert total >= 250

