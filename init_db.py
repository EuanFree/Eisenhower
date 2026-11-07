"""Database initialization script for the Eisenhower Portfolio Manager.

This script prepares the PostgreSQL database for the application by:

1. Enabling required PostgreSQL extensions (``ltree`` for hierarchical queries).
2. Creating all database tables defined in the SQLAlchemy models.
3. Optionally seeding a default admin user for initial access.

Usage
~~~~~

Run from the project root directory::

    # Create tables and enable extensions only
    python init_db.py

    # Also create a default admin user
    python init_db.py --seed

Default Admin Credentials
~~~~~~~~~~~~~~~~~~~~~~~~~

When using the ``--seed`` flag, the script creates an admin user with:

- **Username**: ``admin``
- **Password**: ``admin123``

**Security Warning**: Change this password immediately after first login.

Prerequisites
~~~~~~~~~~~~~

- PostgreSQL must be running and accessible.
- The database specified in ``DATABASE_URL`` must exist.
- The PostgreSQL user must have permission to create extensions.

What Gets Created
~~~~~~~~~~~~~~~~~

- **ltree extension** — Enables hierarchical path queries on the
  ``universal_breakdown_nodes`` table.
- **10 database tables**:

  - ``users`` — User accounts with clearance levels.
  - ``user_display_settings`` — Server-side display profiles.
  - ``universal_breakdown_nodes`` — Base table for the unified tree.
  - ``portfolio_nodes`` — WBS-specific data (scheduling, EVM).
  - ``resource_nodes`` — RBS-specific data (type, rate, location).
  - ``location_nodes`` — LBS-specific data (tier, SCIF flags).
  - ``dependency_links`` — Precedence relationships between tasks.
  - ``resource_assignments`` — Resource-to-task allocations.
  - ``node_blockers`` — Task impediment tracking.
  - ``forensic_audit_logs`` — Tamper-evident audit trail.
"""
import sys
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import text
from app.database import engine, Base, SessionLocal
from app.models.models import (
    User,
    UserRole,
    SecurityClassification,
    PortfolioNode,
    ResourceNode,
    LocationNode,
    ResourceType,
    LocationTier,
    ResourceAssignment,
    AssignmentStatus,
    NodeBlocker,
    BlockerCategory,
    BlockerSeverity,
    TreeType,
    DeliveryMode,
    DependencyLink,
    DependencyType,
)
from app.utils.security import get_password_hash


def enable_extensions():
    """Enable required PostgreSQL extensions.

    Specifically enables the ``ltree`` extension, which provides native
    support for hierarchical path storage and querying.  Without this
    extension, the ``path`` column on ``universal_breakdown_nodes``
    cannot use ltree operators (``<@``, ``@>``, ``~``) for efficient
    ancestor/descendant queries.
    """
    print("Enabling PostgreSQL extensions...")
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS ltree;"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))
        conn.commit()
    print("Extensions enabled successfully.")


def create_tables():
    """Create all database tables defined in the SQLAlchemy models.

    Uses ``Base.metadata.create_all()`` to create all tables that don't
    already exist.  This is safe to run multiple times — it will not
    drop or modify existing tables.

    Note: In production, use Alembic migrations instead of ``create_all``
    to manage schema changes between versions.
    """
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully.")


def seed_admin_user():
    """Create a default admin user if none exists.

    Checks whether an admin user already exists.  If not, creates one
    with the username ``admin`` and password ``admin123``.

    Security Warning
    ~~~~~~~~~~~~~~~~

    The default password is intentionally simple for development.
    **Change it immediately** in production environments.
    """
    db = SessionLocal()
    try:
        # Check if admin already exists
        admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        if admin:
            if admin.clearance_level != SecurityClassification.TOP_SECRET:
                admin.clearance_level = SecurityClassification.TOP_SECRET
                admin.caveats = ["UK_EYES_ONLY", "NOFORN"]
                db.commit()
            print(f"Admin user already exists: {admin.username}")
            return

        admin_user = User(
            username="admin",
            email="admin@eisenhower.local",
            hashed_password=get_password_hash("admin123"),
            full_name="System Administrator",
            role=UserRole.ADMIN,
            clearance_level=SecurityClassification.TOP_SECRET,
            caveats=["UK_EYES_ONLY", "NOFORN"],
            is_active=True,
        )
        db.add(admin_user)
        db.commit()
        print("Admin user created: admin / admin123")
        print("⚠️  Please change the default password immediately!")
    finally:
        db.close()


def seed_sample_wbs():
    """Seed a sample WBS programme and project schedule if none exists."""
    db = SessionLocal()
    try:
        existing_wbs = (
            db.query(PortfolioNode)
            .filter(PortfolioNode.tree_type == TreeType.WBS)
            .first()
        )
        if existing_wbs:
            print(f"WBS sample data already exists (root: {existing_wbs.code} - {existing_wbs.name})")
            return

        print("Seeding sample WBS schedule for 'Next-Gen Avionics Radar Suite'...")

        def dt(date_str: str) -> datetime:
            return datetime.fromisoformat(f"{date_str}T08:00:00+00:00")

        root_id = uuid4()
        phase1_id = uuid4()
        task1_1_id = uuid4()
        task1_2_id = uuid4()
        phase2_id = uuid4()
        task2_1_id = uuid4()
        task2_2_id = uuid4()
        task2_3_id = uuid4()
        phase3_id = uuid4()
        task3_1_id = uuid4()
        task3_2_id = uuid4()

        nodes = [
            PortfolioNode(
                id=root_id,
                parent_id=None,
                tree_type=TreeType.WBS,
                code="WBS-1.0",
                name="Next-Gen Avionics Radar Suite",
                path="wbs_1",
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                delivery_mode=DeliveryMode.HYBRID,
                planned_start_date=dt("2026-10-01"),
                planned_end_date=dt("2027-02-15"),
                actual_start_date=dt("2026-10-01"),
                percent_complete=42.0,
                bac_cost=4500000.0,
                planned_value=2100000.0,
                earned_value=1890000.0,
                actual_cost=1950000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2026-10-01",
                        "early_finish": "2027-02-15",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=phase1_id,
                parent_id=root_id,
                tree_type=TreeType.WBS,
                code="WBS-1.1",
                name="Phase 1: System Requirements & Architecture (SRR)",
                path="wbs_1.p1",
                security_classification=SecurityClassification.OFFICIAL_SENSITIVE,
                caveats=[],
                delivery_mode=DeliveryMode.WATERFALL,
                planned_start_date=dt("2026-10-01"),
                planned_end_date=dt("2026-11-10"),
                actual_start_date=dt("2026-10-01"),
                percent_complete=85.0,
                bac_cost=950000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2026-10-01",
                        "early_finish": "2026-11-10",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=task1_1_id,
                parent_id=phase1_id,
                tree_type=TreeType.WBS,
                code="WBS-1.1.1",
                name="Operational Threat & RF Environment Analysis",
                path="wbs_1.p1.t1",
                security_classification=SecurityClassification.OFFICIAL_SENSITIVE,
                caveats=[],
                delivery_mode=DeliveryMode.WATERFALL,
                planned_start_date=dt("2026-10-01"),
                planned_end_date=dt("2026-10-20"),
                actual_start_date=dt("2026-10-01"),
                actual_end_date=dt("2026-10-20"),
                percent_complete=100.0,
                bac_cost=450000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2026-10-01",
                        "early_finish": "2026-10-20",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=task1_2_id,
                parent_id=phase1_id,
                tree_type=TreeType.WBS,
                code="WBS-1.1.2",
                name="AESA Antenna Array Architecture & ICD Freeze",
                path="wbs_1.p1.t2",
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                delivery_mode=DeliveryMode.WATERFALL,
                planned_start_date=dt("2026-10-21"),
                planned_end_date=dt("2026-11-10"),
                actual_start_date=dt("2026-10-21"),
                percent_complete=70.0,
                bac_cost=500000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2026-10-21",
                        "early_finish": "2026-11-10",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=phase2_id,
                parent_id=root_id,
                tree_type=TreeType.WBS,
                code="WBS-1.2",
                name="Phase 2: Subsystem Hardware & FPGA Development (PDR/CDR)",
                path="wbs_1.p2",
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                delivery_mode=DeliveryMode.AGILE,
                planned_start_date=dt("2026-11-11"),
                planned_end_date=dt("2027-01-10"),
                actual_start_date=dt("2026-11-11"),
                percent_complete=35.0,
                bac_cost=2200000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2026-11-11",
                        "early_finish": "2027-01-10",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=task2_1_id,
                parent_id=phase2_id,
                tree_type=TreeType.WBS,
                code="WBS-1.2.1",
                name="GaN Transmit/Receive Module (TRM) Fabrication",
                path="wbs_1.p2.t1",
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                delivery_mode=DeliveryMode.WATERFALL,
                planned_start_date=dt("2026-11-11"),
                planned_end_date=dt("2026-12-15"),
                actual_start_date=dt("2026-11-11"),
                percent_complete=50.0,
                bac_cost=900000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2026-11-11",
                        "early_finish": "2026-12-15",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=task2_2_id,
                parent_id=phase2_id,
                tree_type=TreeType.WBS,
                code="WBS-1.2.2",
                name="Digital Receiver / Exciter (DREX) FPGA Core",
                path="wbs_1.p2.t2",
                security_classification=SecurityClassification.OFFICIAL_SENSITIVE,
                caveats=[],
                delivery_mode=DeliveryMode.AGILE,
                planned_start_date=dt("2026-11-15"),
                planned_end_date=dt("2026-12-22"),
                actual_start_date=dt("2026-11-15"),
                percent_complete=40.0,
                bac_cost=750000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2026-11-15",
                        "early_finish": "2026-12-22",
                        "total_float": 6,
                        "free_float": 4,
                        "is_critical": False,
                    }
                },
            ),
            PortfolioNode(
                id=task2_3_id,
                parent_id=phase2_id,
                tree_type=TreeType.WBS,
                code="WBS-1.2.3",
                name="Electronic Counter-Countermeasures (ECCM) Signal Processing",
                path="wbs_1.p2.t3",
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                delivery_mode=DeliveryMode.AGILE,
                planned_start_date=dt("2026-12-16"),
                planned_end_date=dt("2027-01-10"),
                percent_complete=10.0,
                bac_cost=550000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2026-12-16",
                        "early_finish": "2027-01-10",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=phase3_id,
                parent_id=root_id,
                tree_type=TreeType.WBS,
                code="WBS-1.3",
                name="Phase 3: Anechoic Chamber Integration & Flight Trials",
                path="wbs_1.p3",
                security_classification=SecurityClassification.OFFICIAL,
                caveats=[],
                delivery_mode=DeliveryMode.WATERFALL,
                planned_start_date=dt("2027-01-11"),
                planned_end_date=dt("2027-02-15"),
                percent_complete=0.0,
                bac_cost=1350000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2027-01-11",
                        "early_finish": "2027-02-15",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=task3_1_id,
                parent_id=phase3_id,
                tree_type=TreeType.WBS,
                code="WBS-1.3.1",
                name="EMC / TEMPEST Anechoic Chamber Qualification",
                path="wbs_1.p3.t1",
                security_classification=SecurityClassification.OFFICIAL_SENSITIVE,
                caveats=[],
                delivery_mode=DeliveryMode.WATERFALL,
                planned_start_date=dt("2027-01-11"),
                planned_end_date=dt("2027-01-28"),
                percent_complete=0.0,
                bac_cost=650000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2027-01-11",
                        "early_finish": "2027-01-28",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
            PortfolioNode(
                id=task3_2_id,
                parent_id=phase3_id,
                tree_type=TreeType.WBS,
                code="WBS-1.3.2",
                name="Airborne Testbed Integration & Acceptance Signoff",
                path="wbs_1.p3.t2",
                security_classification=SecurityClassification.OFFICIAL,
                caveats=[],
                delivery_mode=DeliveryMode.WATERFALL,
                planned_start_date=dt("2027-01-29"),
                planned_end_date=dt("2027-02-15"),
                percent_complete=0.0,
                bac_cost=700000.0,
                custom_attributes={
                    "schedule": {
                        "early_start": "2027-01-29",
                        "early_finish": "2027-02-15",
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            ),
        ]

        for node in nodes:
            db.add(node)
        db.flush()

        links = [
            DependencyLink(predecessor_id=task1_1_id, successor_id=task1_2_id, dependency_type=DependencyType.FS, lag_days=0),
            DependencyLink(predecessor_id=task1_2_id, successor_id=task2_1_id, dependency_type=DependencyType.FS, lag_days=0),
            DependencyLink(predecessor_id=task1_2_id, successor_id=task2_2_id, dependency_type=DependencyType.FS, lag_days=2),
            DependencyLink(predecessor_id=task2_1_id, successor_id=task2_3_id, dependency_type=DependencyType.FS, lag_days=0),
            DependencyLink(predecessor_id=task2_3_id, successor_id=task3_1_id, dependency_type=DependencyType.FS, lag_days=0),
            DependencyLink(predecessor_id=task3_1_id, successor_id=task3_2_id, dependency_type=DependencyType.FS, lag_days=0),
        ]
        for link in links:
            db.add(link)

        db.commit()
        print(f"Seeded {len(nodes)} sample WBS nodes and {len(links)} dependency links.")
    finally:
        db.close()


def seed_sample_resources_and_locations():
    """Seed sample RBS resources, LBS locations, assignments, and blockers if none exist."""
    db = SessionLocal()
    try:
        existing_rbs = (
            db.query(ResourceNode)
            .filter(ResourceNode.tree_type == TreeType.RBS)
            .first()
        )
        if existing_rbs:
            print(f"RBS/LBS sample data already exists (resource: {existing_rbs.code})")
            return

        print("Seeding sample RBS resources, LBS locations, and Daily Cockpit assignments...")

        site_id = uuid4()
        chamber_id = uuid4()
        scif_id = uuid4()

        locations = [
            LocationNode(
                id=site_id,
                parent_id=None,
                tree_type=TreeType.LBS,
                code="SITE-FARNBOROUGH",
                name="Farnborough Aerospace & Defence Campus",
                path="lbs_farnborough",
                tier=LocationTier.SITE,
                security_classification=SecurityClassification.OFFICIAL,
                is_scif_or_tempest=False,
                escort_required=False,
            ),
            LocationNode(
                id=chamber_id,
                parent_id=site_id,
                tree_type=TreeType.LBS,
                code="CHAMBER-RF-BAY2",
                name="EMC / RF Anechoic Chamber Bay 2",
                path="lbs_farnborough.rf_bay2",
                tier=LocationTier.FACILITY,
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                is_scif_or_tempest=True,
                escort_required=True,
                chamber_capabilities={
                    "frequency_range_ghz": "0.5 - 40.0",
                    "quiet_zone_m": 4.5,
                    "tempest_level": "SDIP-27 Level A",
                },
            ),
            LocationNode(
                id=scif_id,
                parent_id=site_id,
                tree_type=TreeType.LBS,
                code="SCIF-AVIONICS-LAB1",
                name="Secure Avionics Integration Lab 1 (SCIF)",
                path="lbs_farnborough.scif_lab1",
                tier=LocationTier.ROOM,
                security_classification=SecurityClassification.TOP_SECRET,
                caveats=["UK_EYES_ONLY"],
                is_scif_or_tempest=True,
                escort_required=True,
            ),
        ]
        for loc in locations:
            db.add(loc)
        db.flush()

        rbs_root_id = uuid4()
        admin_res_id = uuid4()
        placeholder_res_id = uuid4()
        chamber_res_id = uuid4()

        resources = [
            ResourceNode(
                id=rbs_root_id,
                parent_id=None,
                tree_type=TreeType.RBS,
                code="RBS-ENG",
                name="Avionics & Radar Engineering Directorate",
                path="rbs_eng",
                resource_type=ResourceType.PERSON,
                standard_hourly_rate=145.0,
                is_generic_placeholder=False,
                security_classification=SecurityClassification.SECRET,
                current_location_id=site_id,
            ),
            ResourceNode(
                id=admin_res_id,
                parent_id=rbs_root_id,
                tree_type=TreeType.RBS,
                code="admin",
                name="System Administrator",
                path="rbs_eng.admin",
                resource_type=ResourceType.PERSON,
                standard_hourly_rate=165.0,
                is_generic_placeholder=False,
                security_classification=SecurityClassification.TOP_SECRET,
                caveats=["UK_EYES_ONLY"],
                current_location_id=scif_id,
            ),
            ResourceNode(
                id=placeholder_res_id,
                parent_id=rbs_root_id,
                tree_type=TreeType.RBS,
                code="ROLE-FPGA-LEAD",
                name="Senior FPGA / DREX Specialist (TBC)",
                path="rbs_eng.fpga_tbc",
                resource_type=ResourceType.PERSON,
                standard_hourly_rate=155.0,
                is_generic_placeholder=True,
                security_classification=SecurityClassification.SECRET,
                current_location_id=scif_id,
            ),
            ResourceNode(
                id=chamber_res_id,
                parent_id=rbs_root_id,
                tree_type=TreeType.RBS,
                code="ASSET-VNA-40G",
                name="40GHz Vector Network Analyzer Rig",
                path="rbs_eng.vna_40g",
                resource_type=ResourceType.ASSET,
                standard_hourly_rate=250.0,
                is_generic_placeholder=False,
                security_classification=SecurityClassification.SECRET,
                serial_number="SN-VNA-2026-009",
                current_location_id=chamber_id,
            ),
        ]
        for res in resources:
            db.add(res)
        db.flush()

        # Link to existing WBS tasks for Daily Cockpit
        wbs_tasks = (
            db.query(PortfolioNode)
            .filter(PortfolioNode.tree_type == TreeType.WBS)
            .order_by(PortfolioNode.path.asc())
            .all()
        )
        by_code = {t.code: t for t in wbs_tasks}

        if "WBS-1.1.2" in by_code:
            db.add(
                ResourceAssignment(
                    portfolio_node_id=by_code["WBS-1.1.2"].id,
                    resource_node_id=admin_res_id,
                    allocated_units=1.0,
                    planned_hours=120.0,
                    rate_snapshot=165.0,
                    status=AssignmentStatus.CONFIRMED,
                )
            )
        if "WBS-1.2.1" in by_code:
            db.add(
                ResourceAssignment(
                    portfolio_node_id=by_code["WBS-1.2.1"].id,
                    resource_node_id=admin_res_id,
                    allocated_units=0.75,
                    planned_hours=160.0,
                    rate_snapshot=165.0,
                    status=AssignmentStatus.CONFIRMED,
                )
            )
            db.add(
                NodeBlocker(
                    portfolio_node_id=by_code["WBS-1.2.1"].id,
                    category=BlockerCategory.RESOURCE_UNAVAILABLE,
                    severity=BlockerSeverity.MAJOR,
                    impacted_hours=24.0,
                )
            )
        if "WBS-1.2.2" in by_code:
            db.add(
                ResourceAssignment(
                    portfolio_node_id=by_code["WBS-1.2.2"].id,
                    resource_node_id=placeholder_res_id,
                    allocated_units=1.0,
                    planned_hours=140.0,
                    rate_snapshot=155.0,
                    status=AssignmentStatus.CONFIRMED,
                )
            )

        db.commit()
        print("Seeded sample RBS resources, LBS locations, and Daily Cockpit assignments.")
    finally:
        db.close()


def ensure_minio_bucket():
    """Ensure the default S3 / MinIO artifact bucket exists."""
    import os
    try:
        import boto3
        endpoint = os.environ.get("S3_ENDPOINT_URL")
        bucket = os.environ.get("S3_BUCKET_NAME", "eisenhower-artifacts")
        access_key = os.environ.get("S3_ACCESS_KEY", "minioadmin")
        secret_key = os.environ.get("S3_SECRET_KEY", "minioadmin")
        if not endpoint:
            return
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        existing = [b["Name"] for b in s3.list_buckets().get("Buckets", [])]
        if bucket not in existing:
            s3.create_bucket(Bucket=bucket)
            print(f"Created MinIO bucket: {bucket}")
        else:
            print(f"MinIO bucket already exists: {bucket}")
    except Exception as exc:
        print(f"Note: Could not initialize MinIO bucket ({exc})")


if __name__ == "__main__":
    enable_extensions()
    create_tables()
    ensure_minio_bucket()

    if "--seed" in sys.argv:
        seed_admin_user()
        seed_sample_wbs()
        seed_sample_resources_and_locations()
    else:
        print("Use --seed flag to create a default admin user and sample WBS data.")
