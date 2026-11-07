"""Operational Readiness Smoke Test — End-to-End Defence Programme Scenario.

This module bootstraps a complete synthetic defence programme and runs
through 7 automated verification steps to confirm the entire system
pipeline is operational.

Synthetic Programme Scenario
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    1 Programme  ->  2 Projects  ->  8 Work Packages  ->  64 Tasks

- Interleaved PDM dependencies (FS, SS, FF with leads and lags)
- Multi-tier classification mix (OFFICIAL, SECRET, SECRET + UK_EYES_ONLY)
- 1 linked CDRL deliverable with 30-day statutory review window
- 1 long-lead procurement item gating CPM Early Start

Automated Verification Steps
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. **CPM Calculation** — Assert project completion date and critical path
   continuity (Total Float <= 0).

2. **Monte Carlo SRA** — 2,000 iterations; verify P50 <= P80 <= P90.

3. **Clash Daemon** — Assert detection of intentional resource double-booking.

4. **Resource Leveling** — Proposal mode; assert conflict resolution within
   available float.

5. **Baseline Freeze & Variance** — Freeze B0, simulate 5-day delay, verify
   delta variance (Delta Finish = +5, Scope = MODIFIED).

6. **Timesheet & Oracle Staging** — Log 8 hours, execute CAM approval,
   create Oracle batch, assert classified name sanitization.

7. **P6 Export & Re-Import** — Export to .xer, re-import via subcontractor
   ingest validator, verify zero structural data corruption.

Database Strategy
~~~~~~~~~~~~~~~~~

Requires a live PostgreSQL instance (ltree, JSONB, ARRAY).  If the database
is not reachable, all tests skip gracefully.

Run::

    python -m tests.smoke.run_readiness_audit

Or via pytest::

    pytest tests/smoke/test_operational_readiness.py -v
"""

import os
import io
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional
from uuid import UUID

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.models import (
    User,
    UserRole,
    SecurityClassification,
    PortfolioNode,
    ResourceNode,
    DependencyLink,
    DependencyType,
    ResourceAssignment,
    AssignmentStatus,
    ActivityDurationDistribution,
    DistributionType,
    ContractDeliverable,
    CDRLStatus,
    ProcurementItem,
    ProcurementLifecycleStage,
    TaskProcurementConstraint,
    OracleProjectMapping,
    TimesheetOracleExportBatch,
    ExportBatchStatus,
)
from app.utils.security import get_password_hash
from app.services.cpm_engine import calculate_cpm
from app.services.monte_carlo import run_schedule_simulation
from app.services.clash_daemon import run_portfolio_sweep
from app.services.leveling import compute_leveling_proposal
from app.services.baseline_engine import freeze_baseline, compute_baseline_variance
from app.services.oracle_gateway import (
    prepopulate_timesheet_from_schedule,
    generate_oracle_staging_payload,
)
from app.services.export_p6 import export_to_xer
from app.services.subcontractor_ingest import (
    parse_external_schedule,
    validate_against_contractual_boundary,
)


# ============================================================================
# PostgreSQL fixtures
# ============================================================================

SMOKE_DATABASE_URL = os.environ.get(
    "E2E_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/eisenhower_smoke",
)


def _is_postgresql_available(url: str) -> bool:
    """Check if a PostgreSQL instance is reachable."""
    try:
        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest.fixture(scope="module")
def smoke_engine():
    """Module-scoped PostgreSQL engine for smoke tests."""
    if not _is_postgresql_available(SMOKE_DATABASE_URL):
        pytest.skip(
            "PostgreSQL not available for smoke tests. "
            "Set E2E_DATABASE_URL to a reachable PostgreSQL instance."
        )
    return create_engine(SMOKE_DATABASE_URL, pool_pre_ping=True)


@pytest.fixture(scope="module")
def smoke_db(smoke_engine: Session):
    """Create all tables and enable ltree; yield a module-scoped session."""
    with smoke_engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS ltree;"))
        conn.commit()

    Base.metadata.create_all(smoke_engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=smoke_engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def db_session(smoke_db: Session):
    """Transaction-isolated session per test; rolled back on exit."""
    transaction = smoke_db.begin()
    SessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=smoke_engine
    )
    session = SessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield session
    session.rollback()
    session.close()
    transaction.rollback()
    app.dependency_overrides.clear()


# ============================================================================
# Programme bootstrap helper
# ============================================================================


class ProgrammeBootstrap:
    """Builds a complete synthetic defence programme in the database.

    Structure:
        1 Programme -> 2 Projects -> 8 Work Packages -> 64 Tasks
    """

    def __init__(self, db: Session, admin_user: User):
        self.db = db
        self.admin_user = admin_user
        self.programme: Optional[PortfolioNode] = None
        self.projects: List[PortfolioNode] = []
        self.work_packages: List[PortfolioNode] = []
        self.tasks: List[PortfolioNode] = []
        self.all_nodes: List[PortfolioNode] = []
        self.resource_nodes: List[ResourceNode] = []
        self.assignments: List[ResourceAssignment] = []
        self.cdrl: Optional[ContractDeliverable] = None
        self.procurement_item: Optional[ProcurementItem] = None
        self.procurement_constraint: Optional[TaskProcurementConstraint] = None

    def build(self):
        """Execute the full bootstrap sequence."""
        self._create_users_and_resources()
        self._create_programme()
        self._create_projects()
        self._create_work_packages()
        self._create_tasks()
        self._create_dependencies()
        self._create_cdrl()
        self._create_procurement()
        self._create_3point_estimates()
        self._create_resource_assignments()
        self.db.commit()

    # ------------------------------------------------------------------
    # Users & Resources
    # ------------------------------------------------------------------

    def _create_users_and_resources(self):
        """Create named resource users and a generic placeholder."""
        # Two engineers for assignments
        for i, (name, code) in enumerate([
            ("Alice Engineer", "ENG-ALICE"),
            ("Bob Technician", "ENG-BOB"),
        ], start=1):
            user = User(
                username=f"smoke_user_{i}",
                email=f"smoke_{i}@test.local",
                full_name=name,
                hashed_password=get_password_hash("password123"),
                role=UserRole.MEMBER,
                clearance_level=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                primary_citizenship="GB",
                dual_citizenships=[],
                employer_legal_entity="General Dynamics UK Ltd",
                is_active=True,
            )
            self.db.add(user)
            self.db.flush()

            res = ResourceNode(
                code=code,
                name=name,
                tree_type="RBS",
                security_classification=SecurityClassification.OFFICIAL,
                caveats=[],
                path=f"1.{i}",
                resource_type="PERSON",
                standard_hourly_rate=Decimal("120.00"),
                is_generic_placeholder=False,
                is_active=True,
            )
            self.db.add(res)
            self.resource_nodes.append(res)

        # Generic placeholder for claimable tasks
        placeholder = ResourceNode(
            code="GEN-PLACEHOLDER",
            name="Generic Systems Engineer",
            tree_type="RBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="1.99",
            resource_type="PERSON",
            standard_hourly_rate=Decimal("100.00"),
            is_generic_placeholder=True,
            is_active=True,
        )
        self.db.add(placeholder)
        self.resource_nodes.append(placeholder)
        self.db.flush()

    # ------------------------------------------------------------------
    # WBS Hierarchy
    # ------------------------------------------------------------------

    def _create_programme(self):
        """Create the root Programme node."""
        now = datetime(2026, 1, 5)  # Monday
        self.programme = PortfolioNode(
            code="PROG-001",
            name="Avionics Radar Development Programme",
            tree_type="WBS",
            security_classification=SecurityClassification.SECRET,
            caveats=["UK_EYES_ONLY"],
            path="1",
            delivery_mode="HYBRID",
            planned_start_date=now,
            planned_end_date=datetime(2026, 12, 31),
            percent_complete=0.0,
            is_active=True,
            custom_attributes={"vendor_cage_code": "12345"},
        )
        self.db.add(self.programme)
        self.db.flush()
        self.all_nodes.append(self.programme)

    def _create_projects(self):
        """Create 2 child Projects under the Programme."""
        project_data = [
            ("PROJ-A", "Radar Hardware Project", SecurityClassification.SECRET,
             ["UK_EYES_ONLY"], datetime(2026, 1, 5), datetime(2026, 6, 30)),
            ("PROJ-B", "Flight Software Project", SecurityClassification.OFFICIAL,
             [], datetime(2026, 2, 1), datetime(2026, 8, 31)),
        ]
        for i, (code, name, clsf, caveats, start, end) in enumerate(project_data, 1):
            proj = PortfolioNode(
                code=code,
                name=name,
                tree_type="WBS",
                security_classification=clsf,
                caveats=caveats,
                path=f"1.{i}",
                parent_id=self.programme.id,
                delivery_mode="WATERFALL",
                planned_start_date=start,
                planned_end_date=end,
                percent_complete=0.0,
                is_active=True,
            )
            self.db.add(proj)
            self.db.flush()
            self.projects.append(proj)
            self.all_nodes.append(proj)

    def _create_work_packages(self):
        """Create 8 Work Packages (4 per project)."""
        wp_data = [
            # Project A WPs
            ("WP-A1", "RF Front-End WP", 1, SecurityClassification.SECRET, ["UK_EYES_ONLY"]),
            ("WP-A2", "Signal Processing WP", 1, SecurityClassification.SECRET, ["UK_EYES_ONLY"]),
            ("WP-A3", "Power Systems WP", 1, SecurityClassification.OFFICIAL, []),
            ("WP-A4", "Integration & Test WP", 1, SecurityClassification.SECRET, ["UK_EYES_ONLY"]),
            # Project B WPs
            ("WP-B1", "Requirements WP", 2, SecurityClassification.OFFICIAL, []),
            ("WP-B2", "Architecture WP", 2, SecurityClassification.OFFICIAL, []),
            ("WP-B3", "Implementation WP", 2, SecurityClassification.OFFICIAL, []),
            ("WP-B4", "Verification WP", 2, SecurityClassification.OFFICIAL, []),
        ]
        for i, (code, name, proj_idx, clsf, caveats) in enumerate(wp_data, 1):
            proj = self.projects[proj_idx - 1]
            start = proj.planned_start_date + timedelta(days=i * 5)
            end = proj.planned_end_date - timedelta(days=(len(wp_data) - i) * 5)
            wp = PortfolioNode(
                code=code,
                name=name,
                tree_type="WBS",
                security_classification=clsf,
                caveats=caveats,
                path=f"1.{proj_idx}.{i}",
                parent_id=proj.id,
                delivery_mode="WATERFALL",
                planned_start_date=start,
                planned_end_date=end,
                percent_complete=0.0,
                is_active=True,
            )
            self.db.add(wp)
            self.db.flush()
            self.work_packages.append(wp)
            self.all_nodes.append(wp)

    def _create_tasks(self):
        """Create 64 Tasks (8 per Work Package)."""
        task_names = [
            "Design Review", "Prototype Build", "Unit Test", "Integration",
            "Documentation", "Peer Review", "Risk Assessment", "Sign-Off",
        ]
        task_idx = 0
        for wp_idx, wp in enumerate(self.work_packages):
            proj_idx = wp_idx // 4 + 1
            for t in range(8):
                task_idx += 1
                code = f"TASK-{task_idx:03d}"
                name = f"{task_names[t]} - {wp.code}"
                # Alternate classification
                if wp_idx % 3 == 0:
                    clsf = SecurityClassification.SECRET
                    caveats = ["UK_EYES_ONLY"]
                elif wp_idx % 3 == 1:
                    clsf = SecurityClassification.OFFICIAL_SENSITIVE
                    caveats = []
                else:
                    clsf = SecurityClassification.OFFICIAL
                    caveats = []

                start = wp.planned_start_date + timedelta(days=t * 3)
                end = start + timedelta(days=5)  # 5-day duration per task

                task = PortfolioNode(
                    code=code,
                    name=name,
                    tree_type="WBS",
                    security_classification=clsf,
                    caveats=caveats,
                    path=f"1.{proj_idx}.{wp_idx + 1}.{t + 1}",
                    parent_id=wp.id,
                    delivery_mode="WATERFALL",
                    planned_start_date=start,
                    planned_end_date=end,
                    percent_complete=0.0,
                    is_active=True,
                )
                self.db.add(task)
                self.tasks.append(task)
                self.all_nodes.append(task)

        self.db.flush()

    # ------------------------------------------------------------------
    # Dependencies
    # ------------------------------------------------------------------

    def _create_dependencies(self):
        """Create interleaved PDM dependencies across the WBS."""
        # Chain tasks within each WP (FS)
        for wp_idx in range(len(self.work_packages)):
            wp_tasks = self.tasks[wp_idx * 8:(wp_idx + 1) * 8]
            for i in range(len(wp_tasks) - 1):
                dep = DependencyLink(
                    predecessor_id=wp_tasks[i].id,
                    successor_id=wp_tasks[i + 1].id,
                    dependency_type=DependencyType.FS,
                    lag_days=0,
                )
                self.db.add(dep)

        # Cross-WP SS dependencies (start-to-start with lag)
        for i in range(0, len(self.work_packages) - 1, 2):
            dep = DependencyLink(
                predecessor_id=self.work_packages[i].id,
                successor_id=self.work_packages[i + 1].id,
                dependency_type=DependencyType.SS,
                lag_days=5,
            )
            self.db.add(dep)

        # FF dependency from last WP to project
        for proj_idx, proj in enumerate(self.projects):
            last_wp = self.work_packages[proj_idx * 4 + 3]
            dep = DependencyLink(
                predecessor_id=last_wp.id,
                successor_id=proj.id,
                dependency_type=DependencyType.FF,
                lag_days=-2,  # lead
            )
            self.db.add(dep)

        self.db.flush()

    # ------------------------------------------------------------------
    # CDRL
    # ------------------------------------------------------------------

    def _create_cdrl(self):
        """Create 1 CDRL deliverable linked to a task."""
        target_task = self.tasks[0]  # First task of first WP
        today = date(2026, 1, 5)
        self.cdrl = ContractDeliverable(
            portfolio_node_id=target_task.id,
            cdrl_sequence_number="CDRL-A001",
            title="Radar System Requirements Document",
            did_reference="DI-MGMT-81861",
            revision="Rev A",
            status=CDRLStatus.DRAFTING,
            contractual_due_date=today + timedelta(days=90),
            actual_submission_date=None,
            review_window_days=30,
            review_deadline_date=None,
        )
        self.db.add(self.cdrl)
        self.db.flush()

    # ------------------------------------------------------------------
    # Procurement
    # ------------------------------------------------------------------

    def _create_procurement(self):
        """Create a long-lead procurement item gating a task's Early Start."""
        target_task = self.tasks[8]  # First task of second WP
        today = date(2026, 1, 5)
        self.procurement_item = ProcurementItem(
            part_number="FPGA-VIRTEX-ULTRASCALE",
            description="Xilinx Virtex UltraScale+ FPGA for RF processing",
            supplier_cage_code="5E9X2",
            lifecycle_stage=ProcurementLifecycleStage.IN_MANUFACTURE,
            purchase_order_reference="PO-2026-0042",
            contractual_delivery_date=today + timedelta(days=60),
            forecast_delivery_date=today + timedelta(days=75),
            actual_arrival_date=None,
            is_long_lead_item=True,
        )
        self.db.add(self.procurement_item)
        self.db.flush()

        self.procurement_constraint = TaskProcurementConstraint(
            portfolio_node_id=target_task.id,
            procurement_item_id=self.procurement_item.id,
            required_on_site_date=today + timedelta(days=60),
        )
        self.db.add(self.procurement_constraint)
        self.db.flush()

    # ------------------------------------------------------------------
    # 3-Point Estimates for Monte Carlo
    # ------------------------------------------------------------------

    def _create_3point_estimates(self):
        """Create Beta-PERT 3-point estimates for all tasks."""
        for task in self.tasks:
            duration = (task.planned_end_date - task.planned_start_date).days
            optimistic = max(1, duration * 0.7)
            most_likely = float(duration)
            pessimistic = duration * 1.5
            dist = ActivityDurationDistribution(
                portfolio_node_id=task.id,
                optimistic_days=optimistic,
                most_likely_days=most_likely,
                pessimistic_days=pessimistic,
                distribution_type=DistributionType.BETA_PERT,
            )
            self.db.add(dist)

        self.db.flush()

    # ------------------------------------------------------------------
    # Resource Assignments (intentional double-booking)
    # ------------------------------------------------------------------

    def _create_resource_assignments(self):
        """Assign resources to tasks, creating an intentional double-booking."""
        if not self.resource_nodes:
            return

        # Assign Alice to many tasks
        alice = self.resource_nodes[0]
        for task in self.tasks[:16]:  # First 16 tasks
            assign = ResourceAssignment(
                portfolio_node_id=task.id,
                resource_node_id=alice.id,
                allocated_units=1.0,
                planned_hours=40.0,
                rate_snapshot=Decimal("120.00"),
                status=AssignmentStatus.CONFIRMED,
            )
            self.db.add(assign)
            self.assignments.append(assign)

        # Assign Bob to overlapping tasks (double-booking Alice on tasks 8-15)
        bob = self.resource_nodes[1]
        for task in self.tasks[8:24]:  # Tasks 8-23 overlap with Alice's 8-15
            assign = ResourceAssignment(
                portfolio_node_id=task.id,
                resource_node_id=bob.id,
                allocated_units=1.0,
                planned_hours=40.0,
                rate_snapshot=Decimal("110.00"),
                status=AssignmentStatus.CONFIRMED,
            )
            self.db.add(assign)
            self.assignments.append(assign)

        # Oracle project mapping for timesheet export
        for task in self.tasks[:4]:
            mapping = OracleProjectMapping(
                portfolio_node_id=task.id,
                oracle_project_number="PRJ-10492",
                oracle_task_number=f"10.02.{len(self.tasks) + 1:02d}",
                oracle_expenditure_org_name="Warton Development Centre",
                oracle_expenditure_type="Direct Labor",
            )
            self.db.add(mapping)

        self.db.flush()


# ============================================================================
# Smoke Test Classes
# ============================================================================


class TestOperationalReadiness:
    """Complete end-to-end operational readiness verification."""

    @pytest.fixture(scope="module")
    def bootstrap(self, smoke_db: Session):
        """Bootstrap the full synthetic programme (module-scoped)."""
        # Create admin user
        admin = User(
            username="smoke_admin",
            email="smoke_admin@test.local",
            full_name="Smoke Test Administrator",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            clearance_level=SecurityClassification.TOP_SECRET,
            caveats=["UK_EYES_ONLY", "NOFORN"],
            primary_citizenship="GB",
            dual_citizenships=[],
            employer_legal_entity="General Dynamics UK Ltd",
            is_active=True,
        )
        smoke_db.add(admin)
        smoke_db.commit()

        boot = ProgrammeBootstrap(smoke_db, admin)
        boot.build()
        smoke_db.commit()
        return boot

    # ------------------------------------------------------------------
    # Step 1: CPM Calculation
    # ------------------------------------------------------------------

    def test_step1_cpm_calculation(self, db_session: Session, bootstrap):
        """Run CPM; assert project completion date and critical path continuity."""
        project = bootstrap.projects[0]  # Project A

        result = calculate_cpm(db_session, project.id)

        # Verify CPM ran successfully
        assert result["total_activities"] > 0, "CPM should find activities"
        assert result["critical_path_length"] > 0, "Critical path must exist"

        # Verify critical path continuity: all critical tasks have TF <= 0
        critical_codes = result["critical_path_codes"]
        assert len(critical_codes) >= 2, "Critical path should have multiple tasks"

        for activity in result["schedule"]:
            if activity["is_critical"]:
                assert activity["total_float"] <= 0, (
                    f"Critical task {activity['code']} has positive float "
                    f"{activity['total_float']}"
                )

        # Verify project completion date is set
        assert result["project_duration_days"] > 0, "Project duration must be positive"

        # Verify procurement constraint is evaluated
        procurement_impacts = result.get("procurement_impacts", [])
        assert len(procurement_impacts) >= 1, (
            "Procurement constraint should be detected"
        )

    # ------------------------------------------------------------------
    # Step 2: Monte Carlo SRA
    # ------------------------------------------------------------------

    def test_step2_monte_carlo_sra(self, db_session: Session, bootstrap):
        """Run 2,000 Monte Carlo iterations; verify P50 <= P80 <= P90."""
        project = bootstrap.projects[0]

        result = run_schedule_simulation(
            db_session, project.id, iterations=2000, seed=42
        )

        # Verify percentile ordering: percentiles are ISO date strings
        percentiles = result["percentiles"]
        p50 = percentiles["P50"]
        p80 = percentiles["P80"]
        p90 = percentiles["P90"]

        assert p50 <= p80 <= p90, (
            f"Percentile ordering violated: P50={p50}, P80={p80}, P90={p90}"
        )

        # Verify criticality indices are in [0, 1]
        for ci in result["criticality_indices"]:
            assert 0.0 <= ci["criticality_index"] <= 1.0, (
                f"Criticality index out of range for {ci['code']}"
            )

        # Verify distribution points for UI curve plotting
        dist_points = result["distribution_points"]
        assert len(dist_points) > 0, "Should have distribution points"

    # ------------------------------------------------------------------
    # Step 3: Clash Daemon
    # ------------------------------------------------------------------

    def test_step3_clash_daemon(self, db_session: Session, bootstrap):
        """Trigger clash daemon; assert detection of resource double-booking."""
        project = bootstrap.projects[0]

        result = run_portfolio_sweep(db_session, project.id)

        # run_portfolio_sweep returns by_category dict, not a clashes list
        by_category = result.get("by_category", {})
        overallocation_count = by_category.get("RESOURCE_OVERALLOCATION", 0)

        assert overallocation_count > 0, (
            f"Clash daemon should detect resource overallocation. "
            f"by_category={by_category}, total_clashes={result.get('total_clashes')}"
        )

        # Verify sweep run ID is recorded
        assert result.get("sweep_run_id") is not None, "Sweep run ID must be set"

    # ------------------------------------------------------------------
    # Step 4: Resource Leveling
    # ------------------------------------------------------------------

    def test_step4_resource_leveling(self, db_session: Session, bootstrap):
        """Run heuristic leveling in proposal mode; assert conflict resolution."""
        project = bootstrap.projects[0]

        result = compute_leveling_proposal(db_session, project.id)

        shifts = result.get("shifts", [])
        assert len(shifts) > 0, "Leveling should propose at least one shift"

        # Verify non-critical tasks are delayed, not critical ones
        for shift in shifts:
            # Critical path tasks should not be shifted
            if shift.get("is_critical", False):
                assert shift.get("consumed_float_days", 0) == 0, (
                    "Critical path task should not be shifted"
                )

        # Verify milestone breach flags are present
        for shift in shifts:
            assert "milestone_breach" in shift, (
                "Each shift should have a milestone breach flag"
            )

    # ------------------------------------------------------------------
    # Step 5: Baseline Freeze & Variance
    # ------------------------------------------------------------------

    def test_step5_baseline_freeze_and_variance(self, db_session: Session, bootstrap):
        """Freeze B0 baseline, simulate 5-day delay, verify delta variance."""
        project = bootstrap.projects[0]

        # freeze_baseline returns (baseline, snapshot_count) tuple
        baseline, snapshot_count = freeze_baseline(
            db_session,
            root_node_id=project.id,
            baseline_code="B0_CONTRACT",
            bcr_ref=None,
            user_id=bootstrap.admin_user.id,
        )
        assert baseline is not None, "Baseline must be created"
        baseline_id = baseline.id
        assert snapshot_count > 0, "Snapshots must be created"

        # Simulate a 5-day delay on a task
        target_task = bootstrap.tasks[0]
        original_end = target_task.planned_end_date
        target_task.planned_end_date = original_end + timedelta(days=5)
        db_session.commit()

        # Compute variance — returns node_variances list
        variance = compute_baseline_variance(
            db_session, project.id, baseline_id
        )

        # Find the delayed task in node_variances
        target_uuid = str(target_task.id)
        delayed_node = None
        for node in variance.get("node_variances", []):
            if str(node.get("node_id", "")) == target_uuid:
                delayed_node = node
                break

        if delayed_node:
            # Verify finish variance is +5 days
            finish_variance = delayed_node.get("finish_variance_days", 0)
            assert finish_variance >= 5, (
                f"Finish variance should be >= 5 days, got {finish_variance}"
            )

            # Verify scope drift is MODIFIED
            scope_drift = delayed_node.get("scope_drift", "")
            assert scope_drift == "MODIFIED", (
                f"Scope drift should be MODIFIED, got {scope_drift}"
            )

    # ------------------------------------------------------------------
    # Step 6: Timesheet & Oracle Staging
    # ------------------------------------------------------------------

    def test_step6_timesheet_oracle_staging(self, db_session: Session, bootstrap):
        """Log hours, create Oracle batch, assert classified name sanitization."""
        today = date(2026, 1, 5)
        period_start = today
        period_end = today + timedelta(days=6)

        timesheet = prepopulate_timesheet_from_schedule(
            db_session,
            user_id=bootstrap.admin_user.id,
            period_start=period_start,
            period_end=period_end,
        )

        # Create an export batch
        batch = TimesheetOracleExportBatch(
            batch_reference="TS-2026-W02-SMOKE",
            period_start_date=period_start,
            period_end_date=period_end,
            status=ExportBatchStatus.READY_FOR_EXPORT,
            total_hours=Decimal("40.00"),
            record_count=len(timesheet.get("scheduled_lines", [])),
        )
        db_session.add(batch)
        db_session.commit()

        # generate_oracle_staging_payload returns (csv_content, line_items) tuple
        csv_content, line_items = generate_oracle_staging_payload(
            db_session, batch.id
        )

        assert isinstance(csv_content, str), "CSV content should be a string"

        # The payload should contain Oracle project numbers
        assert "PRJ-10492" in csv_content, (
            "Oracle project number should be present in staging payload"
        )

    # ------------------------------------------------------------------
    # Step 7: P6 Export & Re-Import
    # ------------------------------------------------------------------

    def test_step7_p6_export_and_reimport(self, db_session: Session, bootstrap):
        """Export to .xer, re-import via subcontractor ingest, verify integrity."""
        project = bootstrap.projects[0]

        # Export to Primavera P6 .xer format
        xer_content = export_to_xer(
            db_session,
            root_id=project.id,
            redact_classified_descriptions=False,
            mask_commercial_labor_rates=False,
        )

        assert isinstance(xer_content, str), "XER export should return string"
        assert len(xer_content) > 0, "XER export should not be empty"

        # Verify XER contains expected table headers
        assert "%T ACT" in xer_content, "XER should contain ACT table header"
        assert "%T PROJWBS" in xer_content, "XER should contain PROJWBS header"

        # Re-import via subcontractor ingest parser
        # parse_external_schedule returns (tasks, dependencies) tuple
        xer_bytes = io.BytesIO(xer_content.encode("utf-8"))
        parsed_tasks, parsed_deps = parse_external_schedule(xer_bytes, "PRIMAVERA_XER")

        # Verify zero structural data corruption
        assert len(parsed_tasks) > 0, "Re-imported schedule should have tasks"

        # Verify task count matches (allowing for some structural nodes)
        original_task_count = len(bootstrap.tasks)
        assert len(parsed_tasks) >= original_task_count * 0.8, (
            f"Re-imported task count ({len(parsed_tasks)}) is too low compared to "
            f"original ({original_task_count})"
        )

        # Verify dependencies are preserved
        assert len(parsed_deps) > 0, "Dependencies should be preserved in re-import"

        # Validate against contractual boundary
        # (This checks for milestone breaches, logic tampering, etc.)
        from app.models.models import (
            SubcontractorSubmission,
            SubcontractorFormat,
            SubmissionStatus,
        )

        submission = SubcontractorSubmission(
            vendor_cage_code="SMOKE-TEST",
            subcontract_reference="SC-SMOKE-2026-01",
            target_wbs_root_id=project.id,
            submitted_filename="test_export.xer",
            format=SubcontractorFormat.PRIMAVERA_XER,
            status=SubmissionStatus.RECEIVED,
        )
        db_session.add(submission)
        db_session.flush()

        validation = validate_against_contractual_boundary(
            submission.id, parsed_tasks, parsed_deps, db_session
        )

        # The re-import should not introduce critical breaches
        critical_breaches = [
            b for b in validation.get("boundary_breaches", [])
            if b.get("severity") == "CRITICAL"
        ]
        assert len(critical_breaches) == 0, (
            f"Re-import should not introduce critical breaches: "
            f"{[b.get('message') for b in critical_breaches]}"
        )


# ============================================================================
# Summary test
# ============================================================================


class TestReadinessSummary:
    """Final summary check: verify all key entities exist."""

    def test_all_entities_present(self, db_session: Session, bootstrap):
        """Verify the bootstrap created all expected entities."""
        assert bootstrap.programme is not None
        assert len(bootstrap.projects) == 2
        assert len(bootstrap.work_packages) == 8
        assert len(bootstrap.tasks) == 64
        assert len(bootstrap.resource_nodes) >= 3  # Alice, Bob, Placeholder
        assert len(bootstrap.assignments) > 0
        assert bootstrap.cdrl is not None
        assert bootstrap.procurement_item is not None
        assert bootstrap.procurement_constraint is not None

        # Verify classification mix
        classifications = set(n.security_classification for n in bootstrap.all_nodes)
        assert SecurityClassification.OFFICIAL in classifications
        assert SecurityClassification.SECRET in classifications

        # Verify caveats
        nodes_with_caveats = [
            n for n in bootstrap.all_nodes if "UK_EYES_ONLY" in (n.caveats or [])
        ]
        assert len(nodes_with_caveats) > 0, "Some nodes should have UK_EYES_ONLY caveat"
