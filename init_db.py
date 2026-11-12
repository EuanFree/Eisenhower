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
    """Seed 4 realistic synthetic WBS programmes and project schedules."""
    db = SessionLocal()
    try:
        def dt(date_str: str) -> datetime:
            return datetime.fromisoformat(f"{date_str}T08:00:00+00:00")

        programmes = [
            # -----------------------------------------------------------------
            # 1. Next-Gen Avionics Radar Suite
            # -----------------------------------------------------------------
            {
                "code": "WBS-1.0",
                "name": "Next-Gen Avionics Radar Suite",
                "path": "wbs_1",
                "classification": SecurityClassification.SECRET,
                "caveats": ["UK_EYES_ONLY"],
                "delivery_mode": DeliveryMode.HYBRID,
                "start": "2026-10-01",
                "end": "2027-02-15",
                "progress": 42.0,
                "cost": 4500000.0,
                "nodes": [
                    {
                        "code": "WBS-1.1",
                        "name": "Phase 1: System Requirements & Architecture (SRR)",
                        "path": "wbs_1.p1",
                        "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                        "caveats": [],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2026-10-01",
                        "end": "2026-11-10",
                        "progress": 85.0,
                        "cost": 950000.0,
                        "children": [
                            {
                                "code": "WBS-1.1.1",
                                "name": "Operational Threat & RF Environment Analysis",
                                "path": "wbs_1.p1.t1",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2026-10-01",
                                "end": "2026-10-20",
                                "progress": 100.0,
                                "cost": 450000.0,
                            },
                            {
                                "code": "WBS-1.1.2",
                                "name": "AESA Antenna Array Architecture & ICD Freeze",
                                "path": "wbs_1.p1.t2",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2026-10-21",
                                "end": "2026-11-10",
                                "progress": 70.0,
                                "cost": 500000.0,
                            },
                        ],
                    },
                    {
                        "code": "WBS-1.2",
                        "name": "Phase 2: Subsystem Hardware & FPGA Development (PDR/CDR)",
                        "path": "wbs_1.p2",
                        "classification": SecurityClassification.SECRET,
                        "caveats": ["UK_EYES_ONLY"],
                        "delivery_mode": DeliveryMode.AGILE,
                        "start": "2026-11-11",
                        "end": "2027-01-10",
                        "progress": 35.0,
                        "cost": 2200000.0,
                        "children": [
                            {
                                "code": "WBS-1.2.1",
                                "name": "GaN Transmit/Receive Module (TRM) Fabrication",
                                "path": "wbs_1.p2.t1",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-11-11",
                                "end": "2026-12-15",
                                "progress": 50.0,
                                "cost": 900000.0,
                                "custom": {"backlog_name": "RF Hardware Sprint"},
                                "children": [
                                    {
                                        "code": "WBS-1.2.1.1",
                                        "name": "GaN MMIC Die Attachment & Thermal Inspection",
                                        "path": "wbs_1.p2.t1.c1",
                                        "classification": SecurityClassification.SECRET,
                                        "caveats": ["UK_EYES_ONLY"],
                                        "delivery_mode": DeliveryMode.AGILE,
                                        "start": "2026-11-11",
                                        "end": "2026-11-20",
                                        "progress": 100.0,
                                        "cost": 200000.0,
                                        "custom": {"kanban_status": "COMPLETED", "story_points": 5, "backlog_name": "RF Hardware Sprint"},
                                    },
                                    {
                                        "code": "WBS-1.2.1.2",
                                        "name": "Wire-bonding & Substrate Packaging Assembly",
                                        "path": "wbs_1.p2.t1.c2",
                                        "classification": SecurityClassification.SECRET,
                                        "caveats": ["UK_EYES_ONLY"],
                                        "delivery_mode": DeliveryMode.AGILE,
                                        "start": "2026-11-21",
                                        "end": "2026-12-05",
                                        "progress": 60.0,
                                        "cost": 350000.0,
                                        "custom": {"kanban_status": "IN_PROGRESS", "story_points": 8, "backlog_name": "RF Hardware Sprint"},
                                    },
                                    {
                                        "code": "WBS-1.2.1.3",
                                        "name": "High-Frequency Thermal Submount Stress Test",
                                        "path": "wbs_1.p2.t1.c3",
                                        "classification": SecurityClassification.SECRET,
                                        "caveats": ["UK_EYES_ONLY"],
                                        "delivery_mode": DeliveryMode.AGILE,
                                        "start": "2026-12-06",
                                        "end": "2026-12-12",
                                        "progress": 0.0,
                                        "cost": 200000.0,
                                        "blocker": {
                                            "category": BlockerCategory.FACILITY_MAINTENANCE,
                                            "severity": BlockerSeverity.CRITICAL,
                                            "hours": 36.0,
                                            "desc": "Thermal test rig vacuum fitting unavailable due to calibration overhaul",
                                        },
                                        "custom": {"kanban_status": "BLOCKED", "is_blocked": True, "story_points": 5, "backlog_name": "RF Hardware Sprint"},
                                    },
                                    {
                                        "code": "WBS-1.2.1.4",
                                        "name": "Multi-channel RF Phase Calibration Baseline",
                                        "path": "wbs_1.p2.t1.c4",
                                        "classification": SecurityClassification.SECRET,
                                        "caveats": ["UK_EYES_ONLY"],
                                        "delivery_mode": DeliveryMode.AGILE,
                                        "start": "2026-12-13",
                                        "end": "2026-12-15",
                                        "progress": 0.0,
                                        "cost": 150000.0,
                                        "custom": {"kanban_status": "BACKLOG", "story_points": 3, "backlog_name": "RF Hardware Sprint"},
                                    },
                                ],
                            },
                            {
                                "code": "WBS-1.2.2",
                                "name": "Digital Receiver / Exciter (DREX) FPGA Core",
                                "path": "wbs_1.p2.t2",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-11-15",
                                "end": "2026-12-22",
                                "progress": 40.0,
                                "cost": 750000.0,
                                "custom": {"backlog_name": "DSP Algorithm Sprints"},
                            },
                            {
                                "code": "WBS-1.2.3",
                                "name": "Electronic Counter-Countermeasures (ECCM) Processing",
                                "path": "wbs_1.p2.t3",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-12-16",
                                "end": "2027-01-10",
                                "progress": 10.0,
                                "cost": 550000.0,
                            },
                        ],
                    },
                    {
                        "code": "WBS-1.3",
                        "name": "Phase 3: Anechoic Chamber Integration & Flight Trials",
                        "path": "wbs_1.p3",
                        "classification": SecurityClassification.OFFICIAL,
                        "caveats": [],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2027-01-11",
                        "end": "2027-02-15",
                        "progress": 0.0,
                        "cost": 1350000.0,
                        "children": [
                            {
                                "code": "WBS-1.3.1",
                                "name": "EMC / TEMPEST Anechoic Chamber Qualification",
                                "path": "wbs_1.p3.t1",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-01-11",
                                "end": "2027-01-28",
                                "progress": 0.0,
                                "cost": 650000.0,
                            },
                            {
                                "code": "WBS-1.3.2",
                                "name": "Airborne Testbed Integration & Acceptance Signoff",
                                "path": "wbs_1.p3.t2",
                                "classification": SecurityClassification.OFFICIAL,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-01-29",
                                "end": "2027-02-15",
                                "progress": 0.0,
                                "cost": 700000.0,
                            },
                        ],
                    },
                ],
                "links": [
                    ("WBS-1.1.1", "WBS-1.1.2", DependencyType.FS, 0),
                    ("WBS-1.1.2", "WBS-1.2.1", DependencyType.FS, 0),
                    ("WBS-1.1.2", "WBS-1.2.2", DependencyType.FS, 2),
                    ("WBS-1.2.1", "WBS-1.2.3", DependencyType.FS, 0),
                    ("WBS-1.2.3", "WBS-1.3.1", DependencyType.FS, 0),
                    ("WBS-1.3.1", "WBS-1.3.2", DependencyType.FS, 0),
                ],
            },

            # -----------------------------------------------------------------
            # 2. Autonomous Maritime Patrol Drone (AMPD)
            # -----------------------------------------------------------------
            {
                "code": "WBS-2.0",
                "name": "Autonomous Maritime Patrol Drone (AMPD)",
                "path": "wbs_2",
                "classification": SecurityClassification.SECRET,
                "caveats": ["UK_EYES_ONLY", "NOFORN"],
                "delivery_mode": DeliveryMode.AGILE,
                "start": "2026-09-15",
                "end": "2027-04-30",
                "progress": 48.0,
                "cost": 6200000.0,
                "nodes": [
                    {
                        "code": "WBS-2.1",
                        "name": "Phase 1: Hull Hydrodynamics & Hybrid Propulsion",
                        "path": "wbs_2.p1",
                        "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                        "caveats": [],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2026-09-15",
                        "end": "2026-11-15",
                        "progress": 100.0,
                        "cost": 1800000.0,
                        "children": [
                            {
                                "code": "WBS-2.1.1",
                                "name": "Carbon-Composite Hull Vacuum Infusion & Curing",
                                "path": "wbs_2.p1.t1",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2026-09-15",
                                "end": "2026-10-20",
                                "progress": 100.0,
                                "cost": 950000.0,
                            },
                            {
                                "code": "WBS-2.1.2",
                                "name": "Hybrid Diesel-Electric Power Train Testing",
                                "path": "wbs_2.p1.t2",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2026-10-21",
                                "end": "2026-11-15",
                                "progress": 100.0,
                                "cost": 850000.0,
                            },
                        ],
                    },
                    {
                        "code": "WBS-2.2",
                        "name": "Phase 2: Autonomous Navigation & Obstacle Avoidance AI",
                        "path": "wbs_2.p2",
                        "classification": SecurityClassification.SECRET,
                        "caveats": ["UK_EYES_ONLY"],
                        "delivery_mode": DeliveryMode.AGILE,
                        "start": "2026-11-16",
                        "end": "2027-02-15",
                        "progress": 55.0,
                        "cost": 2400000.0,
                        "custom": {"backlog_name": "AutoNav AI Sprints"},
                        "children": [
                            {
                                "code": "WBS-2.2.1",
                                "name": "Multi-Beam LiDAR & Radar Fusion Pipeline",
                                "path": "wbs_2.p2.t1",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-11-16",
                                "end": "2026-12-10",
                                "progress": 100.0,
                                "cost": 600000.0,
                                "custom": {"kanban_status": "COMPLETED", "story_points": 8, "backlog_name": "AutoNav AI Sprints"},
                            },
                            {
                                "code": "WBS-2.2.2",
                                "name": "COLREGS Anti-Collision Path Planner Engine",
                                "path": "wbs_2.p2.t2",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-12-11",
                                "end": "2027-01-15",
                                "progress": 60.0,
                                "cost": 750000.0,
                                "custom": {"kanban_status": "IN_PROGRESS", "story_points": 13, "backlog_name": "AutoNav AI Sprints"},
                            },
                            {
                                "code": "WBS-2.2.3",
                                "name": "Side-Scan Sonar Acoustic Target Classifier",
                                "path": "wbs_2.p2.t3",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2027-01-16",
                                "end": "2027-02-05",
                                "progress": 0.0,
                                "cost": 650000.0,
                                "blocker": {
                                    "category": BlockerCategory.FACILITY_MAINTENANCE,
                                    "severity": BlockerSeverity.CRITICAL,
                                    "hours": 48.0,
                                    "desc": "Acoustic hydrophone calibration tank scheduled for emergency valve maintenance",
                                },
                                "custom": {"kanban_status": "BLOCKED", "is_blocked": True, "story_points": 8, "backlog_name": "AutoNav AI Sprints"},
                            },
                            {
                                "code": "WBS-2.2.4",
                                "name": "Swarm Coordinated Patrol Mesh Protocol",
                                "path": "wbs_2.p2.t4",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2027-02-06",
                                "end": "2027-02-15",
                                "progress": 0.0,
                                "cost": 400000.0,
                                "custom": {"kanban_status": "BACKLOG", "story_points": 5, "backlog_name": "AutoNav AI Sprints"},
                            },
                        ],
                    },
                    {
                        "code": "WBS-2.3",
                        "name": "Phase 3: Satellite Uplink & Encrypted Telemetry",
                        "path": "wbs_2.p3",
                        "classification": SecurityClassification.SECRET,
                        "caveats": ["UK_EYES_ONLY", "NOFORN"],
                        "delivery_mode": DeliveryMode.HYBRID,
                        "start": "2027-01-10",
                        "end": "2027-03-10",
                        "progress": 30.0,
                        "cost": 1100000.0,
                        "children": [
                            {
                                "code": "WBS-2.3.1",
                                "name": "MilSatCom Phased-Array Antenna Integration",
                                "path": "wbs_2.p3.t1",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-01-10",
                                "end": "2027-02-10",
                                "progress": 60.0,
                                "cost": 600000.0,
                            },
                            {
                                "code": "WBS-2.3.2",
                                "name": "Type-1 High-Grade Encryption Firmware",
                                "path": "wbs_2.p3.t2",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY", "NOFORN"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2027-02-11",
                                "end": "2027-03-10",
                                "progress": 10.0,
                                "cost": 500000.0,
                                "blocker": {
                                    "category": BlockerCategory.CLEARANCE_HOLD,
                                    "severity": BlockerSeverity.MAJOR,
                                    "hours": 60.0,
                                    "desc": "National Crypto Authority certification security clearance audit in progress",
                                },
                                "custom": {"kanban_status": "BLOCKED", "is_blocked": True},
                            },
                        ],
                    },
                    {
                        "code": "WBS-2.4",
                        "name": "Phase 4: Sea Acceptance Trials & Extreme Weather Testing",
                        "path": "wbs_2.p4",
                        "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                        "caveats": [],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2027-03-11",
                        "end": "2027-04-30",
                        "progress": 0.0,
                        "cost": 900000.0,
                        "children": [
                            {
                                "code": "WBS-2.4.1",
                                "name": "Coastal Sea Acceptance Trials (SAT)",
                                "path": "wbs_2.p4.t1",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-03-11",
                                "end": "2027-04-05",
                                "progress": 0.0,
                                "cost": 450000.0,
                            },
                            {
                                "code": "WBS-2.4.2",
                                "name": "Sea State 6 Heavy Weather Endurance Test",
                                "path": "wbs_2.p4.t2",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-04-06",
                                "end": "2027-04-30",
                                "progress": 0.0,
                                "cost": 450000.0,
                            },
                        ],
                    },
                ],
                "links": [
                    ("WBS-2.1.1", "WBS-2.1.2", DependencyType.FS, 0),
                    ("WBS-2.1.2", "WBS-2.2.1", DependencyType.FS, 0),
                    ("WBS-2.2.1", "WBS-2.2.2", DependencyType.FS, 0),
                    ("WBS-2.2.2", "WBS-2.3.1", DependencyType.FS, 0),
                    ("WBS-2.3.1", "WBS-2.3.2", DependencyType.FS, 0),
                    ("WBS-2.3.2", "WBS-2.4.1", DependencyType.FS, 0),
                    ("WBS-2.4.1", "WBS-2.4.2", DependencyType.FS, 0),
                ],
            },

            # -----------------------------------------------------------------
            # 3. Quantum-Resilient Tactical Network (QRTN)
            # -----------------------------------------------------------------
            {
                "code": "WBS-3.0",
                "name": "Quantum-Resilient Tactical Network (QRTN)",
                "path": "wbs_3",
                "classification": SecurityClassification.TOP_SECRET,
                "caveats": ["UK_EYES_ONLY"],
                "delivery_mode": DeliveryMode.HYBRID,
                "start": "2026-08-01",
                "end": "2027-05-30",
                "progress": 52.0,
                "cost": 8900000.0,
                "nodes": [
                    {
                        "code": "WBS-3.1",
                        "name": "Phase 1: Post-Quantum Cryptographic Protocol Design",
                        "path": "wbs_3.p1",
                        "classification": SecurityClassification.TOP_SECRET,
                        "caveats": ["UK_EYES_ONLY"],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2026-08-01",
                        "end": "2026-10-31",
                        "progress": 100.0,
                        "cost": 2100000.0,
                        "children": [
                            {
                                "code": "WBS-3.1.1",
                                "name": "Lattice-Based Key Encapsulation (ML-KEM) Specification",
                                "path": "wbs_3.p1.t1",
                                "classification": SecurityClassification.TOP_SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2026-08-01",
                                "end": "2026-09-20",
                                "progress": 100.0,
                                "cost": 1100000.0,
                            },
                            {
                                "code": "WBS-3.1.2",
                                "name": "Side-Channel Attack Resilience Cryptanalysis",
                                "path": "wbs_3.p1.t2",
                                "classification": SecurityClassification.TOP_SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2026-09-21",
                                "end": "2026-10-31",
                                "progress": 100.0,
                                "cost": 1000000.0,
                            },
                        ],
                    },
                    {
                        "code": "WBS-3.2",
                        "name": "Phase 2: Secure Enclave Hardware & HSM Fabrication",
                        "path": "wbs_3.p2",
                        "classification": SecurityClassification.TOP_SECRET,
                        "caveats": ["UK_EYES_ONLY"],
                        "delivery_mode": DeliveryMode.AGILE,
                        "start": "2026-11-01",
                        "end": "2027-02-28",
                        "progress": 45.0,
                        "cost": 3400000.0,
                        "custom": {"backlog_name": "HSM Firmware Backlog"},
                        "children": [
                            {
                                "code": "WBS-3.2.1",
                                "name": "Tamper-Proof Cryptographic Boundary ASIC",
                                "path": "wbs_3.p2.t1",
                                "classification": SecurityClassification.TOP_SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-11-01",
                                "end": "2026-12-15",
                                "progress": 80.0,
                                "cost": 1200000.0,
                                "custom": {"kanban_status": "IN_PROGRESS", "story_points": 13, "backlog_name": "HSM Firmware Backlog"},
                            },
                            {
                                "code": "WBS-3.2.2",
                                "name": "True Random Number Generator (TRNG) Microcode",
                                "path": "wbs_3.p2.t2",
                                "classification": SecurityClassification.TOP_SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-12-16",
                                "end": "2027-01-10",
                                "progress": 100.0,
                                "cost": 800000.0,
                                "custom": {"kanban_status": "COMPLETED", "story_points": 5, "backlog_name": "HSM Firmware Backlog"},
                            },
                            {
                                "code": "WBS-3.2.3",
                                "name": "Zero-Knowledge Key Zeroization Mesh Circuit",
                                "path": "wbs_3.p2.t3",
                                "classification": SecurityClassification.TOP_SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2027-01-11",
                                "end": "2027-02-10",
                                "progress": 0.0,
                                "cost": 900000.0,
                                "blocker": {
                                    "category": BlockerCategory.RESOURCE_UNAVAILABLE,
                                    "severity": BlockerSeverity.CRITICAL,
                                    "hours": 72.0,
                                    "desc": "Component batch QA failure in cleanroom die fabrication for key zeroization ASICs",
                                },
                                "custom": {"kanban_status": "BLOCKED", "is_blocked": True, "story_points": 8, "backlog_name": "HSM Firmware Backlog"},
                            },
                            {
                                "code": "WBS-3.2.4",
                                "name": "Hardware Root of Trust Key Injection Station",
                                "path": "wbs_3.p2.t4",
                                "classification": SecurityClassification.TOP_SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2027-02-11",
                                "end": "2027-02-28",
                                "progress": 0.0,
                                "cost": 500000.0,
                                "custom": {"kanban_status": "BACKLOG", "story_points": 5, "backlog_name": "HSM Firmware Backlog"},
                            },
                        ],
                    },
                    {
                        "code": "WBS-3.3",
                        "name": "Phase 3: Tactical Mesh Radio & TEMPEST Integration",
                        "path": "wbs_3.p3",
                        "classification": SecurityClassification.SECRET,
                        "caveats": ["UK_EYES_ONLY"],
                        "delivery_mode": DeliveryMode.HYBRID,
                        "start": "2027-01-15",
                        "end": "2027-04-15",
                        "progress": 20.0,
                        "cost": 1900000.0,
                        "children": [
                            {
                                "code": "WBS-3.3.1",
                                "name": "Software-Defined Radio (SDR) Waveform Porting",
                                "path": "wbs_3.p3.t1",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-01-15",
                                "end": "2027-02-28",
                                "progress": 40.0,
                                "cost": 950000.0,
                            },
                            {
                                "code": "WBS-3.3.2",
                                "name": "TEMPEST Level A Radiation Shielding Verification",
                                "path": "wbs_3.p3.t2",
                                "classification": SecurityClassification.TOP_SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-03-01",
                                "end": "2027-04-15",
                                "progress": 0.0,
                                "cost": 950000.0,
                                "blocker": {
                                    "category": BlockerCategory.OPERATIONAL_IMPEDIMENT,
                                    "severity": BlockerSeverity.MAJOR,
                                    "hours": 40.0,
                                    "desc": "RF gasket seal leakage detected during pre-compliance chamber emission scan",
                                },
                                "custom": {"kanban_status": "BLOCKED", "is_blocked": True},
                            },
                        ],
                    },
                    {
                        "code": "WBS-3.4",
                        "name": "Phase 4: Multi-Domain Command & Control Integration",
                        "path": "wbs_3.p4",
                        "classification": SecurityClassification.TOP_SECRET,
                        "caveats": ["UK_EYES_ONLY"],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2027-04-16",
                        "end": "2027-05-30",
                        "progress": 0.0,
                        "cost": 1500000.0,
                        "children": [
                            {
                                "code": "WBS-3.4.1",
                                "name": "NATO Tactical Data Link 16/22 Gateway Bridge",
                                "path": "wbs_3.p4.t1",
                                "classification": SecurityClassification.SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-04-16",
                                "end": "2027-05-10",
                                "progress": 0.0,
                                "cost": 750000.0,
                            },
                            {
                                "code": "WBS-3.4.2",
                                "name": "Joint All-Domain Command & Control (JADC2) Air-Gap",
                                "path": "wbs_3.p4.t2",
                                "classification": SecurityClassification.TOP_SECRET,
                                "caveats": ["UK_EYES_ONLY"],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-05-11",
                                "end": "2027-05-30",
                                "progress": 0.0,
                                "cost": 750000.0,
                            },
                        ],
                    },
                ],
                "links": [
                    ("WBS-3.1.1", "WBS-3.1.2", DependencyType.FS, 0),
                    ("WBS-3.1.2", "WBS-3.2.1", DependencyType.FS, 0),
                    ("WBS-3.2.1", "WBS-3.2.2", DependencyType.FS, 0),
                    ("WBS-3.2.2", "WBS-3.3.1", DependencyType.FS, 0),
                    ("WBS-3.3.1", "WBS-3.3.2", DependencyType.FS, 0),
                    ("WBS-3.3.2", "WBS-3.4.1", DependencyType.FS, 0),
                    ("WBS-3.4.1", "WBS-3.4.2", DependencyType.FS, 0),
                ],
            },

            # -----------------------------------------------------------------
            # 4. Orbital Reconnaissance Satellite Payload (ORSP-3)
            # -----------------------------------------------------------------
            {
                "code": "WBS-4.0",
                "name": "Orbital Reconnaissance Satellite Payload (ORSP-3)",
                "path": "wbs_4",
                "classification": SecurityClassification.SECRET,
                "caveats": [],
                "delivery_mode": DeliveryMode.WATERFALL,
                "start": "2026-07-01",
                "end": "2027-06-30",
                "progress": 38.0,
                "cost": 11500000.0,
                "nodes": [
                    {
                        "code": "WBS-4.1",
                        "name": "Phase 1: Optical Assembly & Primary Mirror Polishing",
                        "path": "wbs_4.p1",
                        "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                        "caveats": [],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2026-07-01",
                        "end": "2026-10-31",
                        "progress": 100.0,
                        "cost": 3200000.0,
                        "children": [
                            {
                                "code": "WBS-4.1.1",
                                "name": "Beryllium Substrate Ultra-Precision Diamond Turning",
                                "path": "wbs_4.p1.t1",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2026-07-01",
                                "end": "2026-08-31",
                                "progress": 100.0,
                                "cost": 1600000.0,
                            },
                            {
                                "code": "WBS-4.1.2",
                                "name": "Ion-Beam Figuring & Optical Dielectric Coating",
                                "path": "wbs_4.p1.t2",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2026-09-01",
                                "end": "2026-10-31",
                                "progress": 100.0,
                                "cost": 1600000.0,
                            },
                        ],
                    },
                    {
                        "code": "WBS-4.2",
                        "name": "Phase 2: Cryogenic Focal Plane Array Assembly",
                        "path": "wbs_4.p2",
                        "classification": SecurityClassification.SECRET,
                        "caveats": [],
                        "delivery_mode": DeliveryMode.AGILE,
                        "start": "2026-11-01",
                        "end": "2027-02-28",
                        "progress": 35.0,
                        "cost": 3800000.0,
                        "custom": {"backlog_name": "Cryo Sensor Integration"},
                        "children": [
                            {
                                "code": "WBS-4.2.1",
                                "name": "Short-Wave Infrared (SWIR) Detector Packaging",
                                "path": "wbs_4.p2.t1",
                                "classification": SecurityClassification.SECRET,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-11-01",
                                "end": "2026-12-10",
                                "progress": 100.0,
                                "cost": 1100000.0,
                                "custom": {"kanban_status": "COMPLETED", "story_points": 8, "backlog_name": "Cryo Sensor Integration"},
                            },
                            {
                                "code": "WBS-4.2.2",
                                "name": "Stirling Cryocooler Thermal Link Vacuum Braze",
                                "path": "wbs_4.p2.t2",
                                "classification": SecurityClassification.SECRET,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2026-12-11",
                                "end": "2027-01-20",
                                "progress": 50.0,
                                "cost": 1200000.0,
                                "custom": {"kanban_status": "IN_PROGRESS", "story_points": 5, "backlog_name": "Cryo Sensor Integration"},
                            },
                            {
                                "code": "WBS-4.2.3",
                                "name": "Cryo-vacuum Focal Plane Alignment Qualification",
                                "path": "wbs_4.p2.t3",
                                "classification": SecurityClassification.SECRET,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2027-01-21",
                                "end": "2027-02-15",
                                "progress": 0.0,
                                "cost": 1000000.0,
                                "blocker": {
                                    "category": BlockerCategory.FACILITY_MAINTENANCE,
                                    "severity": BlockerSeverity.CRITICAL,
                                    "hours": 50.0,
                                    "desc": "Helium compressor pressure drop in thermal vacuum chamber cleanroom",
                                },
                                "custom": {"kanban_status": "BLOCKED", "is_blocked": True, "story_points": 8, "backlog_name": "Cryo Sensor Integration"},
                            },
                            {
                                "code": "WBS-4.2.4",
                                "name": "Multi-spectral Optical Filter Wheel Actuator",
                                "path": "wbs_4.p2.t4",
                                "classification": SecurityClassification.SECRET,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.AGILE,
                                "start": "2027-02-16",
                                "end": "2027-02-28",
                                "progress": 0.0,
                                "cost": 500000.0,
                                "custom": {"kanban_status": "BACKLOG", "story_points": 3, "backlog_name": "Cryo Sensor Integration"},
                            },
                        ],
                    },
                    {
                        "code": "WBS-4.3",
                        "name": "Phase 3: Space-Qualified Edge AI Processing Unit",
                        "path": "wbs_4.p3",
                        "classification": SecurityClassification.SECRET,
                        "caveats": [],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2027-01-15",
                        "end": "2027-04-15",
                        "progress": 15.0,
                        "cost": 2500000.0,
                        "children": [
                            {
                                "code": "WBS-4.3.1",
                                "name": "Radiation-Hardened Neural Compute Array",
                                "path": "wbs_4.p3.t1",
                                "classification": SecurityClassification.SECRET,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-01-15",
                                "end": "2027-03-10",
                                "progress": 30.0,
                                "cost": 1500000.0,
                            },
                            {
                                "code": "WBS-4.3.2",
                                "name": "Autonomous Real-time Cloud Detection Engine",
                                "path": "wbs_4.p3.t2",
                                "classification": SecurityClassification.OFFICIAL_SENSITIVE,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-03-11",
                                "end": "2027-04-15",
                                "progress": 0.0,
                                "cost": 1000000.0,
                            },
                        ],
                    },
                    {
                        "code": "WBS-4.4",
                        "name": "Phase 4: Launch Vehicle Qualification & TVAC",
                        "path": "wbs_4.p4",
                        "classification": SecurityClassification.OFFICIAL,
                        "caveats": [],
                        "delivery_mode": DeliveryMode.WATERFALL,
                        "start": "2027-04-16",
                        "end": "2027-06-30",
                        "progress": 0.0,
                        "cost": 2000000.0,
                        "children": [
                            {
                                "code": "WBS-4.4.1",
                                "name": "Acoustic Noise & Random Vibration Shaker Testing",
                                "path": "wbs_4.p4.t1",
                                "classification": SecurityClassification.OFFICIAL,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-04-16",
                                "end": "2027-05-20",
                                "progress": 0.0,
                                "cost": 1000000.0,
                            },
                            {
                                "code": "WBS-4.4.2",
                                "name": "Thermal Vacuum Solar Simulation Qualification",
                                "path": "wbs_4.p4.t2",
                                "classification": SecurityClassification.OFFICIAL,
                                "caveats": [],
                                "delivery_mode": DeliveryMode.WATERFALL,
                                "start": "2027-05-21",
                                "end": "2027-06-30",
                                "progress": 0.0,
                                "cost": 1000000.0,
                            },
                        ],
                    },
                ],
                "links": [
                    ("WBS-4.1.1", "WBS-4.1.2", DependencyType.FS, 0),
                    ("WBS-4.1.2", "WBS-4.2.1", DependencyType.FS, 0),
                    ("WBS-4.2.1", "WBS-4.2.2", DependencyType.FS, 0),
                    ("WBS-4.2.2", "WBS-4.3.1", DependencyType.FS, 0),
                    ("WBS-4.3.1", "WBS-4.3.2", DependencyType.FS, 0),
                    ("WBS-4.3.2", "WBS-4.4.1", DependencyType.FS, 0),
                    ("WBS-4.4.1", "WBS-4.4.2", DependencyType.FS, 0),
                ],
            },
        ]

        total_nodes_created = 0
        total_links_created = 0
        total_blockers_created = 0

        for prog in programmes:
            existing = (
                db.query(PortfolioNode)
                .filter(
                    PortfolioNode.tree_type == TreeType.WBS,
                    PortfolioNode.code == prog["code"],
                )
                .first()
            )
            if existing:
                print(f"Programme {prog['code']} ('{prog['name']}') already exists. Skipping.")
                continue

            print(f"Seeding synthetic programme {prog['code']}: {prog['name']}...")
            root_id = uuid4()
            code_to_uuid = {prog["code"]: root_id}

            root_node = PortfolioNode(
                id=root_id,
                parent_id=None,
                tree_type=TreeType.WBS,
                code=prog["code"],
                name=prog["name"],
                path=prog["path"],
                security_classification=prog["classification"],
                caveats=prog["caveats"],
                delivery_mode=prog["delivery_mode"],
                planned_start_date=dt(prog["start"]),
                planned_end_date=dt(prog["end"]),
                actual_start_date=dt(prog["start"]),
                percent_complete=prog["progress"],
                bac_cost=prog["cost"],
                planned_value=prog["cost"] * (prog["progress"] / 100.0),
                earned_value=prog["cost"] * (prog["progress"] / 100.0) * 0.95,
                actual_cost=prog["cost"] * (prog["progress"] / 100.0) * 1.02,
                custom_attributes={
                    "schedule": {
                        "early_start": prog["start"],
                        "early_finish": prog["end"],
                        "total_float": 0,
                        "free_float": 0,
                        "is_critical": True,
                    }
                },
            )
            db.add(root_node)
            total_nodes_created += 1

            def insert_subnodes(subnodes_list, parent_uuid):
                nonlocal total_nodes_created, total_blockers_created
                for s in subnodes_list:
                    nid = uuid4()
                    code_to_uuid[s["code"]] = nid
                    node = PortfolioNode(
                        id=nid,
                        parent_id=parent_uuid,
                        tree_type=TreeType.WBS,
                        code=s["code"],
                        name=s["name"],
                        path=s["path"],
                        security_classification=s["classification"],
                        caveats=s["caveats"],
                        delivery_mode=s["delivery_mode"],
                        planned_start_date=dt(s["start"]),
                        planned_end_date=dt(s["end"]),
                        actual_start_date=dt(s["start"]) if s["progress"] > 0 else None,
                        actual_end_date=dt(s["end"]) if s["progress"] == 100.0 else None,
                        percent_complete=s["progress"],
                        bac_cost=s["cost"],
                        custom_attributes={
                            "schedule": {
                                "early_start": s["start"],
                                "early_finish": s["end"],
                                "total_float": 0 if s["progress"] < 100 else 5,
                                "free_float": 0,
                                "is_critical": s["progress"] < 100,
                            },
                            **(s.get("custom") or {}),
                        },
                    )
                    db.add(node)
                    total_nodes_created += 1

                    if "blocker" in s:
                        b_info = s["blocker"]
                        blocker = NodeBlocker(
                            portfolio_node_id=nid,
                            category=b_info["category"],
                            severity=b_info["severity"],
                            impacted_hours=b_info["hours"],
                            resolved_at=None,
                        )
                        db.add(blocker)
                        total_blockers_created += 1

                    if "children" in s and s["children"]:
                        insert_subnodes(s["children"], nid)

            insert_subnodes(prog["nodes"], root_id)
            db.flush()

            for pred_code, succ_code, dep_type, lag in prog.get("links", []):
                if pred_code in code_to_uuid and succ_code in code_to_uuid:
                    link = DependencyLink(
                        predecessor_id=code_to_uuid[pred_code],
                        successor_id=code_to_uuid[succ_code],
                        dependency_type=dep_type,
                        lag_days=lag,
                    )
                    db.add(link)
                    total_links_created += 1

        db.commit()
        print(f"Seeding complete: {total_nodes_created} WBS nodes, {total_links_created} dependency links, {total_blockers_created} active blockers created.")
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
