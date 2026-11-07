"""Enterprise benchmark fixture generator for the Eisenhower Portfolio Manager.

This module populates a PostgreSQL database with realistic, high-density
defence programme data for load and stress testing.  It is designed to
exercise every part of the data model: the unified tree structure (WBS/RBS/LBS),
all secondary entities (dependencies, assignments, blockers, CDRLs, etc.),
and the security classification system.

Usage
~~~~~

Run from the project root::

    python -m app.cli.seed

Optional arguments control the scale of generated data::

    python -m app.cli.seed --programmes 3 --projects-per-programme 8 --nodes-per-project 300

After seeding, the script runs benchmark validation tests to measure query
performance against target thresholds:

- Recursive ltree sub-tree query for 1,000 nodes: **< 50 ms**
- NetworkX CPM recalculation across 1,000 nodes: **< 250 ms**
- 2,000-iteration Monte Carlo simulation: **< 1.5 s**
- Background clash daemon sweep across all assignments

Data Structure
~~~~~~~~~~~~~~

The generator creates a realistic defence programme hierarchy:

1. **WBS (Work Breakdown Structure)**: Deep recursive trees from Programme
   through Sub-Project, Control Account, Work Package, down to individual Tasks.
   Each node has correct ltree paths, security classifications, and EVM fields.

2. **Dependencies**: Interleaved PDM (Precedence Diagramming Method) links
   including Finish-to-Start, Start-to-Start, and Finish-to-Finish dependencies.
   Critical path chains are created alongside branches with intentional float.

3. **RBS (Resource Breakdown Structure)**: 50 named users across 5 functional
   departments with skill profiles, 10 generic placeholders, 5 test bays
   (SCIF-accredited), and 30 calibrated equipment rigs.

4. **LBS (Location Breakdown Structure)**: Nested physical hierarchy from
   Site through Building, Floor, RF Lab, Racks, down to Shelves.

5. **Operational Data**: Linked CDRL items, frozen B0 baseline snapshots,
   active blockers with cross-hatch flags, and 3-point duration estimates
   for Monte Carlo simulation.

6. **Security**: Varied classifications from OFFICIAL up to SECRET with
   ``UK_EYES_ONLY`` caveats distributed across the hierarchy.

Prerequisites
~~~~~~~~~~~~~

A running PostgreSQL instance must be accessible.  Set the database URL
via environment variable or the ``--db-url`` argument::

    set E2E_DATABASE_URL=postgresql://user:pass@localhost:5432/eisenhower
    python -m app.cli.seed
"""
import argparse
import hashlib
import json
import os
import random
import sys
import time
import uuid
from datetime import date, timezone, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

# Ensure the project root is on sys.path so `python -m app.cli.seed` works
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import Base
from app.models.models import (
    ActivityDurationDistribution,
    AssignmentStatus,
    BaselineChangeRequest,
    BaselineChangeRequestStatus,
    BaselineNodeSnapshot,
    BaselineTier,
    BlockerCategory,
    BlockerSeverity,
    CDRLStatus,
    ContractDeliverable,
    DependencyLink,
    DependencyType,
    DistributionType,
    ExportControlRegime,
    ForensicAuditLog,
    LocationNode,
    LocationTier,
    ManagementReservePool,
    ManagementReserveTransaction,
    NodeBlocker,
    PortfolioBaseline,
    PortfolioNode,
    ProcurementItem,
    ProcurementLifecycleStage,
    ProficiencyLevel,
    ResourceAssignment,
    ResourceCrewTemplate,
    ResourceCrewTemplateMember,
    ResourceNode,
    ResourceType,
    RequisitionStatus,
    ResourceRequisitionRequest,
    SecurityClassification,
    SkillCategory,
    SkillDefinition,
    StructuralTemplate,
    TaskProcurementConstraint,
    TemplateTier,
    TreeType,
    UniversalBreakdownNode,
    User,
    UserRole,
    UserSkillProfile,
    VerificationTestCase,
    VerificationTestCaseStatus,
    VerificationStatus,
    WorkingCalendar,
    CalendarException,
    CalendarExceptionType,
    CalendarJurisdiction,
    TransactionType,
    ClashCategory,
    ClashSeverity,
    ScheduleClashIssue,
    SkillCategory as SkillCategoryModel,
    CurrencyExchangeRate,
    ExchangeRateType,
    CostElement,
    CostElementCategory,
    IndirectRateStructure,
    TaskCostLedger,
    MilestoneWeightStep,
    EVMTechnique,
    SandboxScenario,
    SandboxScenarioStatus,
    TeamChannelWebhook,
    DocumentArtifact,
    OracleProjectMapping,
    TimesheetOracleExportBatch,
    ExportBatchStatus,
    AssetLocationLedger,
    SubTreeLock,
    LockOperationType,
    DelegationRecord,
)


# ============================================================================
# Constants
# ============================================================================

# Functional departments for resource generation
DEPARTMENTS = [
    "Avionics Systems",
    "Systems Safety",
    "RF Hardware",
    "Software Engineering",
    "Programme Management",
]

# First and last names for realistic user generation
FIRST_NAMES_MALE = [
    "James", "Oliver", "George", "Harry", "Jack", "Noah", "William", "Thomas",
    "Oscar", "Arthur", "Henry", "Albert", "Edward", "Charles", "Frederick",
    "Winston", "Bernard", "Reginald", "Percival", "Montgomery",
]
FIRST_NAMES_FEMALE = [
    "Emma", "Olivia", "Ava", "Isabella", "Sophia", "Amelia", "Mia", "Charlotte",
    "Poppy", "Isla", "Grace", "Lily", "Ella", "Harper", "Eleanor",
    "Catherine", "Margaret", "Beatrice", "Cecilia", "Penelope",
]
LAST_NAMES = [
    "Smith", "Jones", "Williams", "Brown", "Taylor", "Davies", "Evans", "Wilson",
    "Thomas", "Roberts", "Johnson", "Walker", "White", "Robinson", "Thompson",
    "Jackson", "Harris", "Martin", "Clark", "Lewis", "Lee", "Hill", "Green",
    "Hall", "Allen", "Wright", "King", "Scott", "Adams", "Baker",
]

# Programme names
PROGRAMME_NAMES = [
    "Next-Gen Avionics Radar Suite",
    "Defence Communications Modernisation",
    "Electronic Warfare Capability Upgrade",
    "Satellite Navigation Resilience Programme",
    "Cyber Defence Infrastructure",
    "Unmanned Systems Integration",
    "C4ISR Platform Modernisation",
    "Air Defence Sensor Network",
]

# Project names
PROJECT_NAMES = [
    "Signal Processing Subsystem",
    "Antenna Array Design",
    "Firmware Development",
    "Integration & Test",
    "Safety Assessment",
    "Configuration Management",
    "Quality Assurance",
    "Logistics Support",
    "Training Package",
    "Documentation & Handover",
]

# Task name templates
TASK_TEMPLATES = [
    "Requirements Analysis",
    "System Design Review",
    "Detailed Design",
    "Component Implementation",
    "Unit Testing",
    "Integration Testing",
    "System Verification",
    "Acceptance Testing",
    "Documentation",
    "Code Review",
    "Risk Assessment",
    "Safety Case Development",
    "Interface Control Document",
    "Test Procedure Development",
    "Test Execution",
    "Defect Resolution",
    "Performance Validation",
    "Environmental Testing",
    "EMC Testing",
    "Reliability Analysis",
]

# Location names
SITE_NAMES = ["MOD Abbey Wood", "QinetiQ Malvern", "BAE Systems Warton"]
BUILDING_NAMES = ["Building A", "Building B", "Building C"]
FLOOR_NAMES = ["Ground Floor", "First Floor", "Second Floor"]
LAB_NAMES = ["RF Lab", "EMC Lab", "Environmental Lab", "Safety Lab"]
RACK_NAMES = ["Rack A", "Rack B", "Rack C", "Rack D"]
SHELF_NAMES = ["Shelf 1", "Shelf 2", "Shelf 3"]

# Equipment types
EQUIPMENT_TYPES = [
    "Network Analyser", "Signal Generator", "Oscilloscope", "Spectrum Analyser",
    "Logic Analyser", "Power Supply", "Thermal Chamber", "Vibration Table",
    "EMC Receiver", "Antenna Test Range",
]

# CDRL types
CDRL_TYPES = [
    ("CDRL-A001", "Configuration Management Plan", "DI-MGMT-81861"),
    ("CDRL-B001", "Safety Case", "DI-SAF-81862"),
    ("CDRL-C001", "Test Report", "DI-TEST-81863"),
    ("CDRL-D001", "Quality Plan", "DI-QUAL-81864"),
    ("CDRL-E001", "Interface Control Document", "DI-ICD-81865"),
    ("CDRL-F001", "Risk Register", "DI-RISK-81866"),
    ("CDRL-G001", "Progress Report", "DI-PROG-81867"),
    ("CDRL-H001", "Deliverable Summary", "DI-SUMM-81868"),
]

# V&V test standards
VV_STANDARDS = [
    ("DO-178C Level A", "Software Considerations in Airborne Certification"),
    ("DO-254", "Design Assurance for Airborne Hardware"),
    ("Def Stan 00-56", "Safety of Military Airworthiness Items"),
    ("IEC 61508", "Functional Safety of Electrical/Electronic Systems"),
    ("MIL-STD-810", "Environmental Engineering Considerations"),
    ("RTCA DO-160", "Environmental Conditions and Test Procedures"),
]


# ============================================================================
# Helper Functions
# ============================================================================

def _random_uuid() -> UUID:
    """Generate a random UUID4."""
    return uuid4()


def _random_date(start: date, end: date) -> date:
    """Generate a random date within a range."""
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def _random_choice(seq):
    """Random choice from a sequence."""
    return random.choice(seq)


def _random_name() -> str:
    """Generate a realistic person's name."""
    first = _random_choice(FIRST_NAMES_MALE + FIRST_NAMES_FEMALE)
    last = _random_choice(LAST_NAMES)
    return f"{first} {last}"


def _random_initials(name: str) -> str:
    """Extract initials from a full name."""
    parts = name.split()
    return "".join(p[0] for p in parts).upper()


def _random_email(name: str) -> str:
    """Generate an email address from a name."""
    parts = name.lower().split()
    return f"{parts[0]}.{parts[1]}@defence.gov.uk"


def _random_code(prefix: str, number: int) -> str:
    """Generate a node code like 'WP-001'."""
    return f"{prefix}-{number:03d}"


def _random_classification(min_level: SecurityClassification = SecurityClassification.OFFICIAL,
                           max_level: SecurityClassification = SecurityClassification.SECRET) -> SecurityClassification:
    """Randomly select a security classification within a range."""
    levels = [SecurityClassification.OFFICIAL, SecurityClassification.OFFICIAL_SENSITIVE,
              SecurityClassification.SECRET, SecurityClassification.TOP_SECRET]
    min_idx = levels.index(min_level)
    max_idx = levels.index(max_level)
    return _random_choice(levels[min_idx:max_idx + 1])


def _random_caveats() -> List[str]:
    """Randomly select caveats."""
    all_caveats = ["UK_EYES_ONLY", "NOFORN", "REL TO USA", "REL TO NATO", "ORCON"]
    if random.random() < 0.3:
        return [_random_choice(all_caveats)]
    elif random.random() < 0.1:
        return [_random_choice(all_caveats), _random_choice(all_caveats)]
    return []


def _print_section(title: str):
    """Print a formatted section header."""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")


def _print_item(label: str, value: str):
    """Print a formatted key-value pair."""
    print(f"  {label:<35} {value}")


# ============================================================================
# Data Generators
# ============================================================================

class BenchmarkSeeder:
    """Generates realistic high-density defence programme data for benchmark testing.

    This class orchestrates the creation of all entities in the database,
    maintaining referential integrity across the complex web of relationships
    between WBS nodes, resources, locations, dependencies, and operational data.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    programmes : int
        Number of top-level programmes to create.
    projects_per_programme : int
        Number of projects under each programme.
    nodes_per_project : int
        Target number of leaf-level task nodes per project.
    seed : int or None
        Random seed for reproducible data generation.
    """

    def __init__(self, db: Session, programmes: int = 2, projects_per_programme: int = 5,
                 nodes_per_project: int = 200, seed: Optional[int] = None):
        """Initialise the seeder with configuration parameters.

        Parameters
        ----------
        db : Session
            Active database session.
        programmes : int
            Number of programmes.
        projects_per_programme : int
            Projects per programme.
        nodes_per_project : int
            Target nodes per project.
        seed : int or None
            Random seed for reproducibility.
        """
        self.db = db
        self.programmes = programmes
        self.projects_per_programme = projects_per_programme
        self.nodes_per_project = nodes_per_project
        self.start_date = date(2026, 1, 5)
        self.end_date = date(2028, 12, 31)

        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        # Track generated entities for cross-referencing
        self.programme_nodes: List[PortfolioNode] = []
        self.project_nodes: List[PortfolioNode] = []
        self.all_wbs_nodes: List[PortfolioNode] = []
        self.resource_nodes: List[ResourceNode] = []
        self.location_nodes: List[LocationNode] = []
        self.users: List[User] = []
        self.skill_categories: List[SkillCategory] = []
        self.skill_definitions: List[SkillDefinition] = []
        self.dependency_links: List[DependencyLink] = []
        self.assignments: List[ResourceAssignment] = []
        self.blockers: List[NodeBlocker] = []
        self.cdrls: List[ContractDeliverable] = []
        self.vv_tests: List[VerificationTestCase] = []
        self.distributions: List[ActivityDurationDistribution] = []
        self.baselines: List[PortfolioBaseline] = []
        self.procurement_items: List[ProcurementItem] = []
        self.calendars: List[WorkingCalendar] = []
        self.cost_elements: List[CostElement] = []
        self.indirect_rates: List[IndirectRateStructure] = []
        self.currency_rates: List[CurrencyExchangeRate] = []
        self.reserve_pools: List[ManagementReservePool] = []

    def seed_all(self):
        """Execute the complete seeding pipeline.

        Creates all entities in dependency order:
        1. Calendars and cost structures (foundational data)
        2. Users and skill matrix
        3. WBS hierarchy
        4. RBS resources
        5. LBS locations
        6. Dependencies and assignments
        7. Operational data (CDRLs, V&V, blockers, etc.)
        8. Baselines and procurement
        """
        _print_section("BENCHMARK SEEDER - Starting data generation")
        total_start = time.time()

        self._create_calendars()
        self._create_cost_structure()
        self._create_users_and_skills()
        self._create_wbs_hierarchy()
        self._create_rbs_resources()
        self._create_lbs_locations()
        self._create_dependencies()
        self._create_assignments()
        self._create_operational_data()
        self._create_procurement()
        self._create_baselines()
        self._create_reserve_pools()
        self._create_currency_rates()

        self.db.commit()

        total_elapsed = time.time() - total_start
        _print_section("SEEDING COMPLETE")
        _print_item("Total time", f"{total_elapsed:.1f}s")
        _print_item("Programmes", str(len(self.programme_nodes)))
        _print_item("Projects", str(len(self.project_nodes)))
        _print_item("WBS Nodes", str(len(self.all_wbs_nodes)))
        _print_item("Resources", str(len(self.resource_nodes)))
        _print_item("Locations", str(len(self.location_nodes)))
        _print_item("Users", str(len(self.users)))
        _print_item("Dependencies", str(len(self.dependency_links)))
        _print_item("Assignments", str(len(self.assignments)))
        _print_item("Blockers", str(len(self.blockers)))
        _print_item("CDRLs", str(len(self.cdrls)))
        _print_item("V&V Tests", str(len(self.vv_tests)))
        _print_item("3-Point Estimates", str(len(self.distributions)))

    # ------------------------------------------------------------------
    # Calendars
    # ------------------------------------------------------------------

    def _create_calendars(self):
        """Create working calendars with statutory holidays.

        Generates standard UK and US defence calendars with statutory
        holidays marked as non-working days.
        """
        _print_item("Creating calendars...", "")

        # UK Standard Calendar
        uk_cal = WorkingCalendar(
            id=_random_uuid(),
            code="CAL_UK_STANDARD",
            name="UK Standard Working Calendar",
            jurisdiction=CalendarJurisdiction.UK,
            standard_hours_per_day=Decimal("7.50"),
            working_days_mask=31,  # Mon-Fri
            is_default=True,
        )
        self.db.add(uk_cal)
        self.calendars.append(uk_cal)

        # UK Statutory holidays
        holidays_2026 = [
            (date(2026, 1, 1), "New Year's Day"),
            (date(2026, 4, 6), "Good Friday"),
            (date(2026, 4, 8), "Easter Monday"),
            (date(2026, 5, 4), "Early May Bank Holiday"),
            (date(2026, 5, 25), "Spring Bank Holiday"),
            (date(2026, 8, 31), "Summer Bank Holiday"),
            (date(2026, 12, 25), "Christmas Day"),
            (date(2026, 12, 28), "Boxing Day"),
            (date(2027, 1, 1), "New Year's Day 2027"),
            (date(2027, 4, 2), "Good Friday 2027"),
            (date(2027, 4, 5), "Easter Monday 2027"),
            (date(2027, 5, 3), "Early May Bank Holiday 2027"),
            (date(2027, 5, 31), "Spring Bank Holiday 2027"),
            (date(2027, 8, 30), "Summer Bank Holiday 2027"),
            (date(2027, 12, 25), "Christmas Day 2027"),
            (date(2027, 12, 27), "Boxing Day 2027"),
        ]

        for holiday_date, desc in holidays_2026:
            exc = CalendarException(
                id=_random_uuid(),
                calendar_id=uk_cal.id,
                exception_date=holiday_date,
                exception_type=CalendarExceptionType.STATUTORY_HOLIDAY,
                working_hours_override=Decimal("0.00"),
                description=desc,
            )
            self.db.add(exc)

        # US Defence Calendar
        us_cal = WorkingCalendar(
            id=_random_uuid(),
            code="CAL_US_DEFENCE",
            name="US Defence Working Calendar",
            jurisdiction=CalendarJurisdiction.US,
            standard_hours_per_day=Decimal("8.00"),
            working_days_mask=31,
            is_default=False,
        )
        self.db.add(us_cal)
        self.calendars.append(us_cal)

        # SCIF 4x4 Shift Calendar (24/7 operations)
        scif_cal = WorkingCalendar(
            id=_random_uuid(),
            code="CAL_SCIF_4X4",
            name="SCIF 4x4 Shift Calendar",
            jurisdiction=CalendarJurisdiction.CUSTOM,
            standard_hours_per_day=Decimal("8.00"),
            working_days_mask=127,  # All 7 days
            is_default=False,
        )
        self.db.add(scif_cal)
        self.calendars.append(scif_cal)

        self.db.flush()
        _print_item("  Calendars created", str(len(self.calendars)))

    # ------------------------------------------------------------------
    # Cost Structure
    # ------------------------------------------------------------------

    def _create_cost_structure(self):
        """Create cost elements and indirect rate structures.

        Sets up the standard cost element taxonomy (LABOR, MATERIAL,
        SUBCONTRACT, ODC) and a fiscal year indirect rate agreement
        (FPRA) for burden calculations.
        """
        _print_item("Creating cost structure...", "")

        # Cost elements
        elements = [
            ("LABOR_DIRECT", "Direct Labor", CostElementCategory.LABOR),
            ("LABOR_INDIRECT", "Indirect Labor", CostElementCategory.LABOR),
            ("SUBCONTRACT", "Subcontract Services", CostElementCategory.SUBCONTRACT),
            ("MATERIAL_RAW", "Raw Materials", CostElementCategory.MATERIAL),
            ("MATERIAL_COTS", "COTS Components", CostElementCategory.MATERIAL),
            ("ODC_TRAVEL", "Travel Expenses", CostElementCategory.ODC),
            ("ODC_TESTING", "Testing & Inspection", CostElementCategory.ODC),
            ("FACILITY_USAGE", "Facility Usage", CostElementCategory.ODC),
        ]

        for code, name, category in elements:
            el = CostElement(id=_random_uuid(), code=code, name=name, category=category)
            self.db.add(el)
            self.cost_elements.append(el)

        # Indirect rate structure for fiscal year 2026
        rate = IndirectRateStructure(
            id=_random_uuid(),
            fiscal_year=2026,
            currency_code="GBP",
            fringe_rate_percent=Decimal("35.000"),
            overhead_rate_percent=Decimal("50.000"),
            ga_rate_percent=Decimal("12.000"),
            fee_profit_percent=Decimal("10.000"),
        )
        self.db.add(rate)
        self.indirect_rates.append(rate)

        # Also create 2027 rates
        rate_2027 = IndirectRateStructure(
            id=_random_uuid(),
            fiscal_year=2027,
            currency_code="GBP",
            fringe_rate_percent=Decimal("36.000"),
            overhead_rate_percent=Decimal("52.000"),
            ga_rate_percent=Decimal("12.500"),
            fee_profit_percent=Decimal("10.000"),
        )
        self.db.add(rate_2027)
        self.indirect_rates.append(rate_2027)

        self.db.flush()
        _print_item("  Cost elements", str(len(self.cost_elements)))
        _print_item("  Indirect rate structures", str(len(self.indirect_rates)))

    # ------------------------------------------------------------------
    # Currency Exchange Rates
    # ------------------------------------------------------------------

    def _create_currency_rates(self):
        """Create currency exchange rate entries for international contracts.

        Sets up GBP→USD, GBP→EUR, and USD→GBP rates with different
        rate types (CONTRACTUAL_FIXED, FLOATING_SPOT, FORWARD_HEDGE).
        """
        _print_item("Creating currency rates...", "")

        rates_data = [
            ("GBP", "USD", ExchangeRateType.CONTRACTUAL_FIXED, Decimal("1.270000"), date(2026, 1, 1), date(2027, 12, 31)),
            ("GBP", "USD", ExchangeRateType.FLOATING_SPOT, Decimal("1.265000"), date(2026, 1, 1), None),
            ("GBP", "USD", ExchangeRateType.FORWARD_HEDGE, Decimal("1.275000"), date(2026, 1, 1), date(2026, 12, 31)),
            ("GBP", "EUR", ExchangeRateType.CONTRACTUAL_FIXED, Decimal("1.170000"), date(2026, 1, 1), date(2027, 12, 31)),
            ("USD", "GBP", ExchangeRateType.FLOATING_SPOT, Decimal("0.789000"), date(2026, 1, 1), None),
            ("EUR", "GBP", ExchangeRateType.FLOATING_SPOT, Decimal("0.854000"), date(2026, 1, 1), None),
        ]

        for base, target, rate_type, rate, start, end in rates_data:
            cr = CurrencyExchangeRate(
                id=_random_uuid(),
                base_currency=base,
                target_currency=target,
                rate_type=rate_type,
                exchange_rate=rate,
                effective_start_date=start,
                effective_end_date=end,
            )
            self.db.add(cr)
            self.currency_rates.append(cr)

        self.db.flush()
        _print_item("  Currency rates", str(len(self.currency_rates)))

    # ------------------------------------------------------------------
    # Users and Skills
    # ------------------------------------------------------------------

    def _create_users_and_skills(self):
        """Create 50 named users with skill profiles across 5 departments.

        Each user is assigned a random clearance level, department,
        and a set of skill proficiencies.  Skill categories and
        definitions are created first.
        """
        _print_item("Creating users and skills...", "")

        # Skill categories
        skill_cats = [
            ("AVIONICS", "Avionics Systems"),
            ("SYSTEMS_SAFETY", "Systems Safety"),
            ("RF_HARDWARE", "RF Hardware"),
            ("SOFTWARE", "Software Engineering"),
            ("PROGRAMME_MGMT", "Programme Management"),
            ("TEST_VERIFICATION", "Test & Verification"),
            ("CONFIG_MGMT", "Configuration Management"),
            ("QUALITY", "Quality Assurance"),
        ]

        for code, name in skill_cats:
            cat = SkillCategory(id=_random_uuid(), code=code, name=name)
            self.db.add(cat)
            self.skill_categories.append(cat)

        self.db.flush()

        # Skill definitions within each category
        skill_defs_by_cat: Dict[UUID, List[SkillDefinition]] = {}
        for cat in self.skill_categories:
            defs = []
            num_skills = random.randint(3, 6)
            for i in range(num_skills):
                sd = SkillDefinition(
                    id=_random_uuid(),
                    category_id=cat.id,
                    code=f"{cat.code}-SK{i+1:02d}",
                    name=f"{cat.name} Skill {i+1}",
                    description=f"Proficiency in {cat.name.lower()} area {i+1}",
                )
                self.db.add(sd)
                defs.append(sd)
            skill_defs_by_cat[cat.id] = defs

        self.skill_definitions = [sd for defs in skill_defs_by_cat.values() for sd in defs]

        # Create 50 users
        used_names = set()
        for i in range(50):
            # Generate unique name
            while True:
                name = _random_name()
                if name not in used_names:
                    used_names.add(name)
                    break

            email = _random_email(name)
            dept = DEPARTMENTS[i % len(DEPARTMENTS)]
            clearance = _random_classification(
                SecurityClassification.OFFICIAL,
                SecurityClassification.SECRET,
            )
            role = _random_choice([UserRole.MEMBER, UserRole.MEMBER, UserRole.MEMBER,
                                   UserRole.MANAGER, UserRole.VIEWER])

            user = User(
                id=_random_uuid(),
                username=email.split("@")[0],
                email=email,
                full_name=name,
                hashed_password="mock_hashed_password",
                is_active=True,
                role=role,
                clearance_level=clearance,
                caveats=_random_caveats(),
                primary_citizenship=_random_choice(["GB", "US", "AU", "CA"]),
                dual_citizenships=[] if random.random() > 0.2 else [_random_choice(["GB", "US"])],
                employer_legal_entity="General Dynamics UK Ltd",
            )
            self.db.add(user)
            self.users.append(user)

            # Assign 2-5 random skills
            num_skills = random.randint(2, 5)
            random_skills = random.sample(self.skill_definitions, min(num_skills, len(self.skill_definitions)))
            for skill in random_skills:
                usp = UserSkillProfile(
                    id=_random_uuid(),
                    user_id=user.id,
                    skill_id=skill.id,
                    proficiency_level=_random_choice(list(ProficiencyLevel)),
                    verification_status=_random_choice(list(VerificationStatus)),
                    certificate_expiry=_random_date(date(2026, 6, 1), date(2028, 12, 31)) if random.random() > 0.5 else None,
                )
                self.db.add(usp)

        self.db.flush()
        _print_item("  Users created", str(len(self.users)))
        _print_item("  Skill categories", str(len(self.skill_categories)))
        _print_item("  Skill definitions", str(len(self.skill_definitions)))

    # ------------------------------------------------------------------
    # WBS Hierarchy
    # ------------------------------------------------------------------

    def _create_wbs_hierarchy(self):
        """Create the full WBS tree: Programme → Project → Control Account → Work Package → Tasks.

        Builds a deep recursive hierarchy with correct ltree paths.
        Each level has appropriate security classifications, EVM fields,
        and delivery modes.  The number of nodes is controlled by
        ``nodes_per_project``.
        """
        _print_item("Creating WBS hierarchy...", "")

        node_counter = 0
        project_counter = 0

        for p_idx in range(self.programmes):
            # Programme root
            prog_id = _random_uuid()
            prog_code = _random_code("PGM", p_idx + 1)
            prog_name = PROGRAMME_NAMES[p_idx % len(PROGRAMME_NAMES)]
            prog_path = str(p_idx + 1)

            # Programme dates span the full programme period
            prog_start = self.start_date
            prog_end = self.end_date

            prog_node = PortfolioNode(
                id=prog_id,
                parent_id=None,
                tree_type=TreeType.WBS,
                code=prog_code,
                name=prog_name,
                path=prog_path,
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                odac_permissions={"owner": "MOD", "delegated_to": "Programme Office"},
                custom_attributes={"programme_type": "development"},
                is_active=True,
                delivery_mode=_random_choice(list(DeliveryMode)),
                planned_start_date=prog_start,
                planned_end_date=prog_end,
                actual_start_date=prog_start,
                actual_end_date=None,
                percent_complete=Decimal(str(random.uniform(5, 30))),
                pv=Decimal(str(random.uniform(1000000, 5000000))),
                ev=Decimal(str(random.uniform(500000, 2000000))),
                ac=Decimal(str(random.uniform(600000, 2500000))),
                requires_vv_signoff=False,
                export_control_regime=_random_choice([ExportControlRegime.UK_MILITARY_LIST,
                                                      ExportControlRegime.NOT_CONTROLLED]),
                eccn_or_usml_category="USML Cat XI" if random.random() > 0.5 else None,
                authorized_nationalities=["GB", "US"],
                currency_code="GBP",
                evm_technique=EVMTechnique.PERCENT_COMPLETE,
                bac_cost=Decimal(str(random.uniform(5000000, 20000000))),
                planned_value=Decimal(str(random.uniform(1000000, 5000000))),
                earned_value=Decimal(str(random.uniform(500000, 2000000))),
                actual_cost=Decimal(str(random.uniform(600000, 2500000))),
                calendar_id=self.calendars[0].id if self.calendars else None,
            )
            self.db.add(prog_node)
            self.programme_nodes.append(prog_node)
            self.all_wbs_nodes.append(prog_node)
            node_counter += 1

            # Projects under this programme
            for pr_idx in range(self.projects_per_programme):
                project_counter += 1
                proj_id = _random_uuid()
                proj_code = _random_code("PRJ", project_counter)
                proj_name = PROJECT_NAMES[pr_idx % len(PROJECT_NAMES)]
                proj_path = f"{prog_path}.{pr_idx + 1}"

                # Project dates are a subset of programme dates
                proj_duration_days = random.randint(300, 700)
                proj_start = prog_start + timedelta(days=random.randint(0, 100))
                proj_end = proj_start + timedelta(days=proj_duration_days)

                proj_class = _random_classification(
                    SecurityClassification.OFFICIAL_SENSITIVE,
                    SecurityClassification.SECRET,
                )

                proj_node = PortfolioNode(
                    id=proj_id,
                    parent_id=prog_id,
                    tree_type=TreeType.WBS,
                    code=proj_code,
                    name=proj_name,
                    path=proj_path,
                    security_classification=proj_class,
                    caveats=_random_caveats(),
                    odac_permissions={"owner": "Project Manager"},
                    custom_attributes={"project_type": "development"},
                    is_active=True,
                    delivery_mode=_random_choice(list(DeliveryMode)),
                    planned_start_date=proj_start,
                    planned_end_date=proj_end,
                    actual_start_date=proj_start if random.random() > 0.3 else None,
                    actual_end_date=None,
                    percent_complete=Decimal(str(random.uniform(0, 60))),
                    pv=Decimal(str(random.uniform(500000, 3000000))),
                    ev=Decimal(str(random.uniform(200000, 1500000))),
                    ac=Decimal(str(random.uniform(250000, 1800000))),
                    requires_vv_signoff=random.random() > 0.7,
                    export_control_regime=_random_choice(list(ExportControlRegime)),
                    authorized_nationalities=["GB", "US"] if random.random() > 0.3 else None,
                    currency_code=_random_choice(["GBP", "USD"]),
                    evm_technique=_random_choice(list(EVMTechnique)),
                    bac_cost=Decimal(str(random.uniform(1000000, 8000000))),
                    planned_value=Decimal(str(random.uniform(500000, 3000000))),
                    earned_value=Decimal(str(random.uniform(200000, 1500000))),
                    actual_cost=Decimal(str(random.uniform(250000, 1800000))),
                    calendar_id=self.calendars[0].id if self.calendars else None,
                )
                self.db.add(proj_node)
                self.project_nodes.append(proj_node)
                self.all_wbs_nodes.append(proj_node)
                node_counter += 1

                # Build sub-hierarchy under each project
                self._build_project_subtree(
                    proj_node, proj_path, proj_start, proj_end,
                    self.nodes_per_project, node_counter
                )

        self.db.flush()
        _print_item("  Total WBS nodes", str(len(self.all_wbs_nodes)))

    def _build_project_subtree(self, parent_node: PortfolioNode, parent_path: str,
                                start_date: date, end_date: date,
                                target_nodes: int, start_counter: int):
        """Recursively build the WBS sub-tree under a project.

        Creates Control Accounts → Work Packages → Tasks with
        decreasing date ranges and increasing granularity.

        Parameters
        ----------
        parent_node : PortfolioNode
            The parent node to attach children to.
        parent_path : str
            ltree path of the parent node.
        start_date : date
            Earliest planned start for children.
        end_date : date
            Latest planned end for children.
        target_nodes : int
            Target number of leaf nodes to create.
        start_counter : int
            Starting node counter for code generation.
        """
        depth = parent_path.count(".")
        if depth >= 4:  # Max depth: Programme(0) → Project(1) → CA(2) → WP(3) → Task(4)
            return

        # Determine number of children based on depth
        if depth == 1:  # Project level → Control Accounts
            num_children = random.randint(3, 6)
            child_prefix = "CA"
            child_name_template = "Control Account {}"
        elif depth == 2:  # CA level → Work Packages
            num_children = random.randint(3, 8)
            child_prefix = "WP"
            child_name_template = "Work Package {}"
        else:  # WP level → Tasks
            # Distribute remaining nodes across tasks
            num_children = max(3, target_nodes // max(1, (4 - depth) ** 2))
            child_prefix = "TSK"
            child_name_template = TASK_TEMPLATES

        children: List[PortfolioNode] = []
        child_counter = 0

        for c_idx in range(num_children):
            child_counter += 1
            child_id = _random_uuid()
            child_code = _random_code(child_prefix, child_counter)

            if depth < 3:
                child_name = child_name_template.format(c_idx + 1)
            else:
                child_name = _random_choice(TASK_TEMPLATES)

            child_path = f"{parent_path}.{c_idx + 1}"

            # Child dates are a subset of parent dates
            parent_duration = (end_date - start_date).days
            if depth == 1:
                # Control accounts span roughly equal portions of project
                segment = parent_duration // num_children
                child_start = start_date + timedelta(days=c_idx * segment)
                child_end = child_start + timedelta(days=segment - 5)
            elif depth == 2:
                # Work packages span portions of control account
                segment = parent_duration // (num_children * 3)
                child_start = start_date + timedelta(days=random.randint(0, parent_duration // 2))
                child_end = child_start + timedelta(days=max(14, segment))
            else:
                # Tasks are short-duration activities
                task_duration = random.randint(5, 30)
                child_start = start_date + timedelta(days=random.randint(0, max(0, parent_duration - task_duration)))
                child_end = child_start + timedelta(days=task_duration)

            if child_end > end_date:
                child_end = end_date

            # Classification tends to increase at deeper levels
            if depth <= 1:
                child_class = _random_classification(
                    SecurityClassification.OFFICIAL_SENSITIVE,
                    SecurityClassification.SECRET,
                )
            else:
                child_class = _random_classification(
                    SecurityClassification.OFFICIAL,
                    SecurityClassification.SECRET,
                )

            # EVM technique varies by depth
            if depth == 3:
                evm_tech = _random_choice(list(EVMTechnique))
                bac = Decimal(str(random.uniform(50000, 500000)))
            else:
                evm_tech = EVMTechnique.PERCENT_COMPLETE
                bac = Decimal(str(random.uniform(200000, 2000000)))

            child_node = PortfolioNode(
                id=child_id,
                parent_id=parent_node.id,
                tree_type=TreeType.WBS,
                code=child_code,
                name=child_name,
                path=child_path,
                security_classification=child_class,
                caveats=_random_caveats(),
                odac_permissions={"owner": "Work Package Lead"},
                custom_attributes={
                    "depth": depth + 1,
                    "schedule": {
                        "duration_days": (child_end - child_start).days,
                    },
                },
                is_active=True,
                delivery_mode=_random_choice(list(DeliveryMode)) if depth <= 1 else None,
                planned_start_date=child_start,
                planned_end_date=child_end,
                actual_start_date=child_start if random.random() > 0.5 else None,
                actual_end_date=None,
                percent_complete=Decimal(str(random.uniform(0, 80) if depth >= 2 else random.uniform(10, 60))),
                pv=Decimal(str(random.uniform(10000, bac))),
                ev=Decimal(str(random.uniform(5000, bac * 0.8))),
                ac=Decimal(str(random.uniform(8000, bac * 0.9))),
                requires_vv_signoff=(depth == 3 and random.random() > 0.7),
                export_control_regime=_random_choice(list(ExportControlRegime)),
                authorized_nationalities=["GB", "US"] if random.random() > 0.5 else None,
                currency_code=_random_choice(["GBP", "USD"]),
                evm_technique=evm_tech,
                bac_cost=bac,
                planned_value=Decimal(str(random.uniform(10000, bac))),
                earned_value=Decimal(str(random.uniform(5000, bac * 0.8))),
                actual_cost=Decimal(str(random.uniform(8000, bac * 0.9))),
                calendar_id=self.calendars[0].id if self.calendars and random.random() > 0.5 else None,
            )
            self.db.add(child_node)
            self.all_wbs_nodes.append(child_node)
            children.append(child_node)

            # Recurse for deeper levels
            if depth < 3:
                remaining = target_nodes // max(1, num_children)
                self._build_project_subtree(
                    child_node, child_path, child_start, child_end,
                    remaining, child_counter
                )

        # Create 3-point estimates for leaf tasks
        for node in children:
            if node.planned_start_date and node.planned_end_date:
                duration = (node.planned_end_date - node.planned_start_date).days
                if duration > 0:
                    # Beta-PERT three-point estimates
                    optimistic = max(1, int(duration * random.uniform(0.6, 0.9)))
                    most_likely = duration
                    pessimistic = int(duration * random.uniform(1.2, 2.0))

                    dist = ActivityDurationDistribution(
                        id=_random_uuid(),
                        portfolio_node_id=node.id,
                        optimistic_days=float(optimistic),
                        most_likely_days=float(most_likely),
                        pessimistic_days=float(pessimistic),
                        distribution_type=_random_choice(list(DistributionType)),
                    )
                    self.db.add(dist)
                    self.distributions.append(dist)

    # ------------------------------------------------------------------
    # RBS Resources
    # ------------------------------------------------------------------

    def _create_rbs_resources(self):
        """Create the Resource Breakdown Structure.

        Generates:
        - 50 named user resources (PERSON type)
        - 10 generic placeholder resources
        - 5 test bays (FACILITY type, SCIF-accredited)
        - 30 calibrated equipment rigs (ASSET type)
        """
        _print_item("Creating RBS resources...", "")

        # Named user resources
        for user in self.users:
            res = ResourceNode(
                id=_random_uuid(),
                parent_id=None,
                tree_type=TreeType.RBS,
                code=_random_initials(user.full_name),
                name=user.full_name,
                path=f"RBS.{_random_initials(user.full_name)}",
                security_classification=user.clearance_level or SecurityClassification.OFFICIAL,
                caveats=user.caveats or [],
                is_active=True,
                resource_type=ResourceType.PERSON,
                standard_hourly_rate=Decimal(str(random.uniform(150, 500))),
                is_generic_placeholder=False,
                current_location_id=None,
                calendar_id=self.calendars[0].id if self.calendars else None,
            )
            self.db.add(res)
            self.resource_nodes.append(res)

        # Generic placeholder resources
        placeholder_roles = [
            "Systems Safety Assessor", "RF Test Engineer", "Avionics Software Developer",
            "Configuration Manager", "Quality Engineer", "Test Technician",
            "Documentation Specialist", "Project Controller", "Risk Manager",
            "Integration Engineer",
        ]

        for i, role in enumerate(placeholder_roles):
            res = ResourceNode(
                id=_random_uuid(),
                parent_id=None,
                tree_type=TreeType.RBS,
                code=_random_code("GEN", i + 1),
                name=role,
                path=f"RBS.GEN-{i+1:02d}",
                security_classification=_random_classification(
                    SecurityClassification.OFFICIAL,
                    SecurityClassification.SECRET,
                ),
                caveats=_random_caveats(),
                is_active=True,
                resource_type=ResourceType.PERSON,
                standard_hourly_rate=Decimal(str(random.uniform(100, 300))),
                is_generic_placeholder=True,
                current_location_id=None,
            )
            self.db.add(res)
            self.resource_nodes.append(res)

        # Test bays (FACILITY type)
        test_bay_names = [
            "RF Anechoic Chamber", "EMC Test Facility", "Environmental Test Chamber",
            "Vibration Test Bay", "Thermal Vacuum Chamber",
        ]

        for i, name in enumerate(test_bay_names):
            res = ResourceNode(
                id=_random_uuid(),
                parent_id=None,
                tree_type=TreeType.RBS,
                code=_random_code("TB", i + 1),
                name=name,
                path=f"RBS.TB-{i+1:02d}",
                security_classification=_random_classification(
                    SecurityClassification.OFFICIAL_SENSITIVE,
                    SecurityClassification.SECRET,
                ),
                caveats=["UK_EYES_ONLY"] if random.random() > 0.5 else [],
                is_active=True,
                resource_type=ResourceType.FACILITY,
                standard_hourly_rate=Decimal(str(random.uniform(500, 2000))),
                is_generic_placeholder=False,
                current_location_id=None,
            )
            self.db.add(res)
            self.resource_nodes.append(res)

        # Equipment rigs (ASSET type)
        for i in range(30):
            equip_type = EQUIPMENT_TYPES[i % len(EQUIPMENT_TYPES)]
            res = ResourceNode(
                id=_random_uuid(),
                parent_id=None,
                tree_type=TreeType.RBS,
                code=_random_code("EQ", i + 1),
                name=f"{equip_type} #{i+1}",
                path=f"RBS.EQ-{i+1:02d}",
                security_classification=_random_classification(
                    SecurityClassification.OFFICIAL,
                    SecurityClassification.OFFICIAL_SENSITIVE,
                ),
                caveats=[],
                is_active=True,
                resource_type=ResourceType.ASSET,
                standard_hourly_rate=Decimal(str(random.uniform(50, 500))),
                is_generic_placeholder=False,
                current_location_id=None,
            )
            self.db.add(res)
            self.resource_nodes.append(res)

        self.db.flush()
        _print_item("  Total resources", str(len(self.resource_nodes)))

    # ------------------------------------------------------------------
    # LBS Locations
    # ------------------------------------------------------------------

    def _create_lbs_locations(self):
        """Create the Location Breakdown Structure.

        Builds a nested hierarchy: Site → Building → Floor → Lab → Rack → Shelf.
        Each location has a tier, security classification, and SCIF/TEMPEST flags.
        """
        _print_item("Creating LBS locations...", "")

        for site_idx, site_name in enumerate(SITE_NAMES):
            site_id = _random_uuid()
            site_path = f"LBS.{site_idx + 1}"

            site = LocationNode(
                id=site_id,
                parent_id=None,
                tree_type=TreeType.LBS,
                code=_random_code("SITE", site_idx + 1),
                name=site_name,
                path=site_path,
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                is_active=True,
                tier=LocationTier.SITE,
                is_scif_or_tempest=True,
                escort_required=True,
            )
            self.db.add(site)
            self.location_nodes.append(site)

            for b_idx, b_name in enumerate(BUILDING_NAMES):
                b_id = _random_uuid()
                b_path = f"{site_path}.{b_idx + 1}"

                building = LocationNode(
                    id=b_id,
                    parent_id=site_id,
                    tree_type=TreeType.LBS,
                    code=_random_code("BLD", b_idx + 1),
                    name=f"{site_name} - {b_name}",
                    path=b_path,
                    security_classification=_random_classification(
                        SecurityClassification.OFFICIAL_SENSITIVE,
                        SecurityClassification.SECRET,
                    ),
                    caveats=_random_caveats(),
                    is_active=True,
                    tier=LocationTier.FACILITY,
                    is_scif_or_tempest=random.random() > 0.5,
                    escort_required=random.random() > 0.5,
                )
                self.db.add(building)
                self.location_nodes.append(building)

                for f_idx, f_name in enumerate(FLOOR_NAMES):
                    f_id = _random_uuid()
                    f_path = f"{b_path}.{f_idx + 1}"

                    floor = LocationNode(
                        id=f_id,
                        parent_id=b_id,
                        tree_type=TreeType.LBS,
                        code=_random_code("FLR", f_idx + 1),
                        name=f"{b_name} - {f_name}",
                        path=f_path,
                        security_classification=_random_classification(
                            SecurityClassification.OFFICIAL,
                            SecurityClassification.SECRET,
                        ),
                        caveats=_random_caveats(),
                        is_active=True,
                        tier=LocationTier.ZONE,
                        is_scif_or_tempest=random.random() > 0.6,
                        escort_required=random.random() > 0.6,
                    )
                    self.db.add(floor)
                    self.location_nodes.append(floor)

                    for l_idx, l_name in enumerate(LAB_NAMES):
                        l_id = _random_uuid()
                        l_path = f"{f_path}.{l_idx + 1}"

                        lab = LocationNode(
                            id=l_id,
                            parent_id=f_id,
                            tree_type=TreeType.LBS,
                            code=_random_code("LAB", l_idx + 1),
                            name=f"{f_name} - {l_name}",
                            path=l_path,
                            security_classification=_random_classification(
                                SecurityClassification.OFFICIAL_SENSITIVE,
                                SecurityClassification.SECRET,
                            ),
                            caveats=_random_caveats(),
                            is_active=True,
                            tier=LocationTier.ROOM,
                            is_scif_or_tempest=random.random() > 0.4,
                            escort_required=random.random() > 0.4,
                        )
                        self.db.add(lab)
                        self.location_nodes.append(lab)

                        for r_idx, r_name in enumerate(RACK_NAMES):
                            r_id = _random_uuid()
                            r_path = f"{l_path}.{r_idx + 1}"

                            rack = LocationNode(
                                id=r_id,
                                parent_id=l_id,
                                tree_type=TreeType.LBS,
                                code=_random_code("RCK", r_idx + 1),
                                name=f"{l_name} - {r_name}",
                                path=r_path,
                                security_classification=_random_classification(
                                    SecurityClassification.OFFICIAL,
                                    SecurityClassification.SECRET,
                                ),
                                caveats=[],
                                is_active=True,
                                tier=LocationTier.CONTAINER,
                                is_scif_or_tempest=False,
                                escort_required=False,
                            )
                            self.db.add(rack)
                            self.location_nodes.append(rack)

                            for s_idx, s_name in enumerate(SHELF_NAMES):
                                s_id = _random_uuid()
                                s_path = f"{r_path}.{s_idx + 1}"

                                shelf = LocationNode(
                                    id=s_id,
                                    parent_id=r_id,
                                    tree_type=TreeType.LBS,
                                    code=_random_code("SHF", s_idx + 1),
                                    name=f"{r_name} - {s_name}",
                                    path=s_path,
                                    security_classification=SecurityClassification.OFFICIAL,
                                    caveats=[],
                                    is_active=True,
                                    tier=LocationTier.SUB_CONTAINER,
                                    is_scif_or_tempest=False,
                                    escort_required=False,
                                )
                                self.db.add(shelf)
                                self.location_nodes.append(shelf)

        self.db.flush()
        _print_item("  Total locations", str(len(self.location_nodes)))

    # ------------------------------------------------------------------
    # Dependencies
    # ------------------------------------------------------------------

    def _create_dependencies(self):
        """Create PDM dependency links between WBS nodes.

        Generates interleaved FS, SS, and FF dependencies with
        critical path chains and branches containing intentional float.
        Lag days are added for realistic scheduling constraints.
        """
        _print_item("Creating dependencies...", "")

        # Group nodes by project
        project_children: Dict[UUID, List[PortfolioNode]] = {}
        for node in self.all_wbs_nodes:
            if node.parent_id:
                project_children.setdefault(node.parent_id, []).append(node)

        dep_counter = 0
        for proj in self.project_nodes:
            # Get all nodes under this project
            proj_path = proj.path
            proj_nodes = [n for n in self.all_wbs_nodes if n.path.startswith(f"{proj_path}.") and n.id != proj.id]

            if not proj_nodes:
                continue

            # Sort by path to maintain hierarchy order
            proj_nodes.sort(key=lambda n: n.path)

            # Create critical path chain through the project
            # Link nodes in sequence with FS dependencies
            for i in range(min(len(proj_nodes) - 1, 50)):
                # Only link nodes at the same depth or adjacent depths
                pred = proj_nodes[i]
                succ = proj_nodes[i + 1]

                dep_type = _random_choice([DependencyType.FS, DependencyType.FS,
                                           DependencyType.FS, DependencyType.SS,
                                           DependencyType.FF])

                lag = random.choice([0, 0, 0, 1, 2, -1])

                dep = DependencyLink(
                    id=_random_uuid(),
                    predecessor_id=pred.id,
                    successor_id=succ.id,
                    dependency_type=dep_type,
                    lag_days=lag,
                )
                self.db.add(dep)
                self.dependency_links.append(dep)
                dep_counter += 1

            # Add cross-branch dependencies (creates float in non-critical paths)
            for _ in range(min(len(proj_nodes) // 3, 20)):
                pred_idx = random.randint(0, len(proj_nodes) - 2)
                succ_idx = random.randint(pred_idx + 2, len(proj_nodes) - 1)

                pred = proj_nodes[pred_idx]
                succ = proj_nodes[succ_idx]

                dep_type = _random_choice([DependencyType.FS, DependencyType.SS, DependencyType.FF])
                lag = random.choice([0, 0, 1, 2])

                dep = DependencyLink(
                    id=_random_uuid(),
                    predecessor_id=pred.id,
                    successor_id=succ.id,
                    dependency_type=dep_type,
                    lag_days=lag,
                )
                self.db.add(dep)
                self.dependency_links.append(dep)
                dep_counter += 1

        self.db.flush()
        _print_item("  Total dependencies", str(len(self.dependency_links)))

    # ------------------------------------------------------------------
    # Assignments
    # ------------------------------------------------------------------

    def _create_assignments(self):
        """Create resource assignments linking resources to WBS nodes.

        Assigns named users and generic placeholders to tasks,
        with allocated units, planned hours, and rate snapshots.
        """
        _print_item("Creating assignments...", "")

        # Get person resources
        person_resources = [r for r in self.resource_nodes if r.resource_type == ResourceType.PERSON]
        facility_resources = [r for r in self.resource_nodes if r.resource_type == ResourceType.FACILITY]
        asset_resources = [r for r in self.resource_nodes if r.resource_type == ResourceType.ASSET]

        # Assign resources to leaf-level tasks
        leaf_nodes = [n for n in self.all_wbs_nodes if n.path.count(".") >= 3]

        for node in leaf_nodes:
            # Assign 1-3 person resources
            num_assignments = random.randint(1, 3)
            assigned_resources = random.sample(
                person_resources, min(num_assignments, len(person_resources))
            )

            for res in assigned_resources:
                if node.planned_start_date and node.planned_end_date:
                    duration_days = (node.planned_end_date - node.planned_start_date).days
                    planned_hours = min(duration_days * 7.5, 200)  # Cap at 200 hours

                    alloc = ResourceAssignment(
                        id=_random_uuid(),
                        portfolio_node_id=node.id,
                        resource_node_id=res.id,
                        allocated_units=Decimal(str(random.choice([0.25, 0.5, 0.75, 1.0]))),
                        planned_hours=Decimal(str(planned_hours)),
                        rate_snapshot=res.standard_hourly_rate or Decimal("200.00"),
                        status=_random_choice(list(AssignmentStatus)),
                    )
                    self.db.add(alloc)
                    self.assignments.append(alloc)

            # Occasionally assign a facility
            if random.random() > 0.7 and facility_resources:
                fac = _random_choice(facility_resources)
                alloc = ResourceAssignment(
                    id=_random_uuid(),
                    portfolio_node_id=node.id,
                    resource_node_id=fac.id,
                    allocated_units=Decimal("1.0"),
                    planned_hours=Decimal(str(random.uniform(8, 40))),
                    rate_snapshot=fac.standard_hourly_rate or Decimal("500.00"),
                    status=AssignmentStatus.CONFIRMED,
                )
                self.db.add(alloc)
                self.assignments.append(alloc)

        self.db.flush()
        _print_item("  Total assignments", str(len(self.assignments)))

    # ------------------------------------------------------------------
    # Operational Data
    # ------------------------------------------------------------------

    def _create_operational_data(self):
        """Create CDRLs, V&V tests, blockers, and other operational data.

        Links contract deliverables to WBS nodes, creates verification
        test cases, and adds active blockers with cross-hatch flags.
        """
        _print_item("Creating operational data...", "")

        # CDRLs - attach to project and control account level nodes
        ca_nodes = [n for n in self.all_wbs_nodes if n.path.count(".") == 2]

        for node in ca_nodes[:20]:  # Limit CDRLs to first 20 CAs
            cdrl_seq, cdrl_title, did_ref = _random_choice(CDRL_TYPES)
            cdrl = ContractDeliverable(
                id=_random_uuid(),
                portfolio_node_id=node.id,
                cdrl_sequence_number=cdrl_seq,
                title=cdrl_title,
                did_reference=did_ref,
                revision=_random_choice(["Rev A", "Rev B", "Rev C"]),
                status=_random_choice(list(CDRLStatus)),
                contractual_due_date=_random_date(
                    node.planned_start_date or self.start_date,
                    node.planned_end_date or self.end_date,
                ),
                actual_submission_date=_random_date(
                    self.start_date, date.today()
                ) if random.random() > 0.5 else None,
                review_window_days=30,
            )
            self.db.add(cdrl)
            self.cdrls.append(cdrl)

        # V&V Test Cases
        vv_nodes = [n for n in self.all_wbs_nodes if n.requires_vv_signoff]
        if not vv_nodes:
            # Fallback: pick some leaf nodes
            vv_nodes = [n for n in self.all_wbs_nodes if n.path.count(".") >= 3][:10]

        for node in vv_nodes[:30]:  # Limit V&V tests
            std_ref, std_name = _random_choice(VV_STANDARDS)
            num_tests = random.randint(1, 4)

            for t_idx in range(num_tests):
                vvc = VerificationTestCase(
                    id=_random_uuid(),
                    portfolio_node_id=node.id,
                    test_identifier=f"VVC-{node.code}-{t_idx+1:02d}",
                    title=f"{std_name} - Test {t_idx+1}",
                    standard_reference=std_ref,
                    is_mandatory=random.random() > 0.3,
                    status=_random_choice(list(VerificationTestCaseStatus)),
                )
                self.db.add(vvc)
                self.vv_tests.append(vvc)

        # Blockers
        blocker_nodes = random.sample(
            [n for n in self.all_wbs_nodes if n.path.count(".") >= 2],
            min(50, len([n for n in self.all_wbs_nodes if n.path.count(".") >= 2])),
        )

        for node in blocker_nodes:
            blocker = NodeBlocker(
                id=_random_uuid(),
                portfolio_node_id=node.id,
                category=_random_choice(list(BlockerCategory)),
                severity=_random_choice(list(BlockerSeverity)),
                impacted_hours=Decimal(str(random.uniform(8, 160))),
                resolved_at=None if random.random() > 0.3 else datetime.now(timezone.utc),
            )
            self.db.add(blocker)
            self.blockers.append(blocker)

            # Update node custom_attributes with blocker flag
            if node.custom_attributes is None:
                node.custom_attributes = {}
            node.custom_attributes["blocked"] = True
            node.custom_attributes["blocker_category"] = blocker.category.value

        self.db.flush()
        _print_item("  CDRLs", str(len(self.cdrls)))
        _print_item("  V&V Tests", str(len(self.vv_tests)))
        _print_item("  Blockers", str(len(self.blockers)))

    # ------------------------------------------------------------------
    # Procurement
    # ------------------------------------------------------------------

    def _create_procurement(self):
        """Create procurement items and task procurement constraints.

        Generates long-lead procurement items linked to WBS assembly
        and integration tasks with forecast delivery dates.
        """
        _print_item("Creating procurement items...", "")

        part_numbers = [
            "FPGA-VIRTEX-ULTRASCALE", "AD9361-TRANSCEIVER", "STM32H7-MCU",
            "Xilinx-Kintex-ULTRA", "Analog-Devices-ADC", "Murata-Filter",
            "TE-Connector-Assembly", "Schaffner-EMI-Filter", "Vishay-Resistor-Array",
            "Infineon-Power-IC",
        ]

        supplier_cages = ["5A001", "6B002", "7C003", "8D004", "9E005"]

        # Create 20 procurement items
        for i in range(20):
            item = ProcurementItem(
                id=_random_uuid(),
                part_number=part_numbers[i % len(part_numbers)] if i < len(part_numbers) else f"PART-{i+1:04d}",
                description=f"Procurement item {i+1}: {_random_choice(EQUIPMENT_TYPES)}",
                supplier_cage_code=_random_choice(supplier_cages),
                lifecycle_stage=_random_choice(list(ProcurementLifecycleStage)),
                purchase_order_reference=f"PO-{2026}-{i+1:04d}" if random.random() > 0.3 else None,
                contractual_delivery_date=_random_date(date(2026, 3, 1), date(2027, 6, 30)),
                forecast_delivery_date=_random_date(date(2026, 3, 1), date(2027, 6, 30)),
                actual_arrival_date=None,
                is_long_lead_item=random.random() > 0.5,
            )
            self.db.add(item)
            self.procurement_items.append(item)

        # Link some procurement items to tasks
        leaf_nodes = [n for n in self.all_wbs_nodes if n.path.count(".") >= 3]
        for item in self.procurement_items[:10]:
            if leaf_nodes:
                target_node = _random_choice(leaf_nodes)
                constraint = TaskProcurementConstraint(
                    id=_random_uuid(),
                    portfolio_node_id=target_node.id,
                    procurement_item_id=item.id,
                    required_on_site_date=item.forecast_delivery_date - timedelta(days=14),
                )
                self.db.add(constraint)

        self.db.flush()
        _print_item("  Procurement items", str(len(self.procurement_items)))

    # ------------------------------------------------------------------
    # Baselines
    # ------------------------------------------------------------------

    def _create_baselines(self):
        """Create frozen B0 baseline snapshots for each project.

        Clones the current WBS state into BaselineNodeSnapshot rows
        for variance tracking.
        """
        _print_item("Creating baselines...", "")

        for proj in self.project_nodes[:10]:  # Baseline first 10 projects
            baseline = PortfolioBaseline(
                id=_random_uuid(),
                root_portfolio_node_id=proj.id,
                baseline_code="B0_CONTRACT",
                name=f"B0 Contract Baseline - {proj.name}",
                frozen_at=datetime.now(timezone.utc),
                frozen_by_user_id=self.users[0].id if self.users else None,
                bcr_reference=None,
                is_active_target=True,
            )
            self.db.add(baseline)
            self.baselines.append(baseline)

            # Snapshot all nodes under this project
            proj_path = proj.path
            proj_nodes = [n for n in self.all_wbs_nodes if n.path.startswith(f"{proj_path}.") or n.id == proj.id]

            for node in proj_nodes:
                snapshot = BaselineNodeSnapshot(
                    id=_random_uuid(),
                    baseline_id=baseline.id,
                    portfolio_node_id=node.id,
                    path=node.path,
                    code=node.code,
                    planned_start_date=node.planned_start_date,
                    planned_end_date=node.planned_end_date,
                    duration_days=(node.planned_end_date - node.planned_start_date).days if node.planned_start_date and node.planned_end_date else 0,
                    total_float=0,
                    budgeted_cost_bac=node.bac_cost or Decimal("0"),
                    custom_attributes=node.custom_attributes,
                )
                self.db.add(snapshot)

        self.db.flush()
        _print_item("  Baselines", str(len(self.baselines)))

    # ------------------------------------------------------------------
    # Reserve Pools
    # ------------------------------------------------------------------

    def _create_reserve_pools(self):
        """Create Management Reserve pools for projects.

        Sets up contingency budget pools with initial allocations.
        """
        _print_item("Creating reserve pools...", "")

        for proj in self.project_nodes[:5]:
            pool = ManagementReservePool(
                id=_random_uuid(),
                portfolio_node_id=proj.id,
                total_initial_budget=Decimal(str(random.uniform(500000, 2000000))),
                current_balance=Decimal(str(random.uniform(500000, 2000000))),
                currency_code="GBP",
            )
            self.db.add(pool)
            self.reserve_pools.append(pool)

            # Initial allocation transaction
            txn = ManagementReserveTransaction(
                id=_random_uuid(),
                pool_id=pool.id,
                bcr_id=None,
                transaction_type=TransactionType.INITIAL_ALLOCATION,
                amount=pool.total_initial_budget,
                target_portfolio_node_id=proj.id,
                justification="Initial management reserve allocation",
                authorized_by_user_id=self.users[0].id if self.users else None,
            )
            self.db.add(txn)

        self.db.flush()
        _print_item("  Reserve pools", str(len(self.reserve_pools)))


# ============================================================================
# Sovereign Defence Scenario — Project Chimera
# ============================================================================

class SovereignDefenceSeeder:
    """Seeds a complete 5-tier WBS for 'Project Chimera' (Next-Gen Avionics).

    Creates 250+ nodes spanning:
      Tier 1 – Programme root (PROG-CHIMERA)
      Tier 2 – Subsystems (AVIONICS_SUITE, PROPULSION_TELEMETRY, TEST_ENVELOPE,
                     STRUCTURAL_INTEGRITY, GROUND_SUPPORT_EQUIPMENT)
      Tier 3 – Control Accounts (owned by named CAMs)
      Tier 4 – Work Packages with PDM logic links (FS/SS/FF/SF) and lead/lag
      Tier 5 – Tasks, Milestones, and statutory CDRL deliverables

    Additionally seeds:
      - Mixed security tiers (OFFICIAL … TOP_SECRET // UK EYES ONLY)
      - Systems safety DAL accreditations (DAL_A, DAL_B) in custom_attributes
      - Environmental chamber bookings with 2-hour thermal cooldown buffers
      - Test equipment with active/expiring calibration dates
      - Non-linear cost profiles (Weibull, Beta) on research WPs
      - Active CAM check-out leases (SubTreeLock)
      - Delegation records
      - Intentional DCMA schedule clashes (out-of-sequence, negative float)
    """

    def __init__(self, db: Session):
        self.db = db
        self.nodes: List[PortfolioNode] = []
        self.resources: List[ResourceNode] = []
        self.users: List[User] = []
        self.deps: List[DependencyLink] = []
        self.clashes: List[ScheduleClashIssue] = []
        self.cdrls: List[ContractDeliverable] = []
        self.locks: List[SubTreeLock] = []
        self.delegations: List[DelegationRecord] = []

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def seed(self) -> Dict[str, Any]:
        """Run the full Chimera seed pipeline and return a summary."""
        t0 = time.time()
        _print_section("SOVEREIGN DEFENCE SEED — Project Chimera")

        self._create_users()
        self._create_programme_root()
        self._create_subsystems()
        self._create_control_accounts()
        self._create_work_packages()
        self._create_tasks_and_milestones()
        self._create_pdm_dependencies()
        self._create_resources_and_assignments()
        self._create_cdrls()
        self._create_cost_profiles()
        self._create_subtree_locks()
        self._create_delegations()
        self._create_schedule_clashes()
        self._create_3point_estimates()

        self.db.commit()
        elapsed = time.time() - t0

        summary = {
            "scenario": "sovereign-defence-full",
            "programme": "PROG-CHIMERA",
            "total_nodes": len(self.nodes),
            "total_dependencies": len(self.deps),
            "total_resources": len(self.resources),
            "total_users": len(self.users),
            "total_cdrls": len(self.cdrls),
            "total_clashes": len(self.clashes),
            "total_locks": len(self.locks),
            "total_delegations": len(self.delegations),
            "elapsed_seconds": round(elapsed, 2),
        }

        _print_section("CHIMERA SEED COMPLETE")
        for k, v in summary.items():
            _print_item(k, str(v))

        return summary

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------

    def _create_users(self):
        """Create named CAMs and team members for Chimera."""
        cam_data = [
            ("j.smith", "J. Smith", "CAM-AVIONICS", "SECRET", ["UK_EYES_ONLY"]),
            ("r.patel", "R. Patel", "CAM-PROPULSION", "SECRET", []),
            ("a.williams", "A. Williams", "CAM-TEST", "TOP_SECRET", ["UK_EYES_ONLY"]),
            ("m.chen", "M. Chen", "CAM-STRUCTURAL", "SECRET", []),
            ("s.johnson", "S. Johnson", "CAM-GSE", "OFFICIAL_SENSITIVE", []),
        ]
        team_data = [
            ("d.taylor", "D. Taylor", "SECRET", []),
            ("k.brown", "K. Brown", "SECRET", ["UK_EYES_ONLY"]),
            ("l.wilson", "L. Wilson", "OFFICIAL_SENSITIVE", []),
            ("p.davis", "P. Davis", "TOP_SECRET", ["UK_EYES_ONLY"]),
            ("n.evans", "N. Evans", "SECRET", []),
            ("t.moore", "T. Moore", "OFFICIAL_SENSITIVE", []),
            ("h.clark", "H. Clark", "SECRET", []),
            ("j.lewis", "J. Lewis", "SECRET", ["UK_EYES_ONLY"]),
            ("r.hall", "R. Hall", "OFFICIAL_SENSITIVE", []),
            ("c.wright", "C. Wright", "SECRET", []),
        ]
        for username, name, role, clearance, caveats in cam_data + team_data:
            u = User(
                id=_random_uuid(),
                username=username,
                email=f"{username}@defence.gov.uk",
                full_name=name,
                hashed_password="mock_hashed_password",
                is_active=True,
                role=UserRole.MANAGER if role.startswith("CAM") else UserRole.MEMBER,
                clearance_level=SecurityClassification(clearance),
                caveats=caveats,
                primary_citizenship="GB",
                employer_legal_entity="BAE Systems plc",
            )
            self.db.add(u)
            self.users.append(u)
        self.db.flush()
        _print_item("Users created", str(len(self.users)))

    # ------------------------------------------------------------------
    # Tier 1 – Programme Root
    # ------------------------------------------------------------------

    def _create_programme_root(self):
        root = PortfolioNode(
            id=_random_uuid(),
            parent_id=None,
            tree_type=TreeType.WBS,
            code="PROG-CHIMERA",
            name="Project Chimera — Next-Gen Avionics Programme",
            path="1",
            security_classification=SecurityClassification.TOP_SECRET,
            caveats=["UK_EYES_ONLY"],
            odac_permissions={"owner": "MOD Programme Director"},
            custom_attributes={"programme_type": "sovereign_defence",
                               "dal_accreditation": "DAL_A"},
            is_active=True,
            delivery_mode=DeliveryMode.WATERFALL,
            planned_start_date=date(2026, 4, 1),
            planned_end_date=date(2031, 3, 31),
            actual_start_date=date(2026, 4, 1),
            percent_complete=Decimal("8.5"),
            pv=Decimal("15000000"),
            ev=Decimal("12000000"),
            ac=Decimal("13500000"),
            requires_vv_signoff=True,
            export_control_regime=ExportControlRegime.UK_MILITARY_LIST,
            eccn_or_usml_category="USML Cat XI",
            authorized_nationalities=["GB"],
            currency_code="GBP",
            evm_technique=EVMTechnique.PERCENT_COMPLETE,
            bac_cost=Decimal("250000000"),
            planned_value=Decimal("15000000"),
            earned_value=Decimal("12000000"),
            actual_cost=Decimal("13500000"),
        )
        self.db.add(root)
        self.nodes.append(root)
        _print_item("Tier 1 — Programme root", "PROG-CHIMERA")

    # ------------------------------------------------------------------
    # Tier 2 – Subsystems
    # ------------------------------------------------------------------

    def _create_subsystems(self):
        root = self.nodes[0]
        subsystems = [
            ("AVIONICS_SUITE", "Avionics Integration Suite",
             SecurityClassification.SECRET, ["UK_EYES_ONLY"], "DAL_A"),
            ("PROPULSION_TELEMETRY", "Propulsion Telemetry Subsystem",
             SecurityClassification.SECRET, [], "DAL_B"),
            ("TEST_ENVELOPE", "Test & Evaluation Envelope",
             SecurityClassification.OFFICIAL_SENSITIVE, [], "DAL_B"),
            ("STRUCTURAL_INTEGRITY", "Structural Integrity Programme",
             SecurityClassification.SECRET, ["UK_EYES_ONLY"], "DAL_A"),
            ("GROUND_SUPPORT_EQUIPMENT", "Ground Support Equipment",
             SecurityClassification.OFFICIAL, [], None),
        ]
        for i, (code, name, sec, caveats, dal) in enumerate(subsystems, 1):
            start = date(2026, 4, 1) + timedelta(days=(i - 1) * 30)
            node = PortfolioNode(
                id=_random_uuid(),
                parent_id=root.id,
                tree_type=TreeType.WBS,
                code=code,
                name=name,
                path=f"1.{i}",
                security_classification=sec,
                caveats=caveats,
                odac_permissions={"owner": f"Subsystem Lead {code}"},
                custom_attributes={"dal_accreditation": dal} if dal else {},
                is_active=True,
                delivery_mode=DeliveryMode.WATERFALL,
                planned_start_date=start,
                planned_end_date=date(2030, 12, 31),
                percent_complete=Decimal(str(random.uniform(3, 15))),
                requires_vv_signoff=True,
                export_control_regime=ExportControlRegime.UK_MILITARY_LIST,
                authorized_nationalities=["GB"],
                currency_code="GBP",
                evm_technique=EVMTechnique.PERCENT_COMPLETE,
                bac_cost=Decimal(str(random.uniform(30000000, 80000000))),
            )
            self.db.add(node)
            self.nodes.append(node)
        _print_item("Tier 2 — Subsystems", str(len(subsystems)))

    # ------------------------------------------------------------------
    # Tier 3 – Control Accounts
    # ------------------------------------------------------------------

    def _create_control_accounts(self):
        # Map subsystems → CAMs
        ca_definitions = [
            # (parent_idx, code, name, cam_user_idx, classification)
            (1, "CA-NAV-COMPUTER", "Navigation Computer CA", 0, SecurityClassification.SECRET),
            (1, "CA-RADAR-DSP", "Radar Signal Processing CA", 1, SecurityClassification.SECRET),
            (1, "CA-FMS", "Flight Management System CA", 0, SecurityClassification.TOP_SECRET),
            (2, "CA-ENG-MONITOR", "Engine Monitoring CA", 1, SecurityClassification.SECRET),
            (2, "CA-FUEL-TELEM", "Fuel Telemetry CA", 3, SecurityClassification.SECRET),
            (3, "CA-ENV-TEST", "Environmental Test CA", 2, SecurityClassification.OFFICIAL_SENSITIVE),
            (3, "CA-RANGE-TRIALS", "Range Trials CA", 2, SecurityClassification.SECRET),
            (4, "CA-AIRFRAME", "Airframe Structural CA", 3, SecurityClassification.SECRET),
            (4, "CA-COMPOSITES", "Composite Materials CA", 4, SecurityClassification.OFFICIAL_SENSITIVE),
            (5, "CA-POWER-UNIT", "Power Supply Unit CA", 4, SecurityClassification.OFFICIAL),
            (5, "CA-DIAGNOSTIC", "Diagnostic Tooling CA", 0, SecurityClassification.OFFICIAL_SENSITIVE),
        ]
        for parent_idx, code, name, cam_idx, sec in ca_definitions:
            parent = self.nodes[parent_idx]
            start = parent.planned_start_date or date(2026, 6, 1)
            node = PortfolioNode(
                id=_random_uuid(),
                parent_id=parent.id,
                tree_type=TreeType.WBS,
                code=code,
                name=name,
                path=f"{parent.path}.{len([n for n in self.nodes if n.parent_id == parent.id]) + 1}",
                security_classification=sec,
                caveats=["UK_EYES_ONLY"] if sec == SecurityClassification.TOP_SECRET else [],
                odac_permissions={"owner": self.users[cam_idx].full_name if cam_idx < len(self.users) else "TBC"},
                custom_attributes={"cam_user_id": str(self.users[cam_idx].id) if cam_idx < len(self.users) else None},
                is_active=True,
                planned_start_date=start,
                planned_end_date=date(2030, 6, 30),
                percent_complete=Decimal(str(random.uniform(2, 20))),
                requires_vv_signoff=True,
                export_control_regime=ExportControlRegime.UK_MILITARY_LIST,
                authorized_nationalities=["GB"],
                currency_code="GBP",
                evm_technique=EVMTechnique.PERCENT_COMPLETE,
                bac_cost=Decimal(str(random.uniform(5000000, 20000000))),
            )
            self.db.add(node)
            self.nodes.append(node)
        _print_item("Tier 3 — Control Accounts", str(len(ca_definitions)))

    # ------------------------------------------------------------------
    # Tier 4 – Work Packages (with PDM logic)
    # ------------------------------------------------------------------

    def _create_work_packages(self):
        """Create work packages under each CA with PDM dependency metadata."""
        wp_templates = [
            ("REQ", "Requirements Analysis"),
            ("DES", "Preliminary Design"),
            ("DET", "Detailed Design"),
            ("IMP", "Implementation"),
            ("INT", "Integration"),
            ("VER", "Verification & Validation"),
        ]
        ca_nodes = [n for n in self.nodes if n.path.count(".") == 2]
        wp_count = 0
        for ca in ca_nodes:
            for j, (wcode, wname) in enumerate(wp_templates):
                wp_count += 1
                start = ca.planned_start_date or date(2026, 6, 1)
                start = start + timedelta(days=j * 60)
                dur = random.randint(60, 180)
                end = start + timedelta(days=dur)
                # Assign cost profile to research WPs
                profile = None
                shape_attrs = {}
                if wcode in ("REQ", "DES"):
                    profile = "WEIBULL_CURVE"
                    shape_attrs = {"cost_shape_factor": 1.5, "weibull_k": 2.0, "weibull_lambda": 100.0}
                elif wcode == "IMP":
                    profile = "BETA_DISTRIBUTION"
                    shape_attrs = {"cost_shape_factor": 2.0}

                node = PortfolioNode(
                    id=_random_uuid(),
                    parent_id=ca.id,
                    tree_type=TreeType.WBS,
                    code=f"{ca.code}.{wcode}",
                    name=f"{wname} — {ca.name}",
                    path=f"{ca.path}.{j + 1}",
                    security_classification=ca.security_classification,
                    caveats=ca.caveats or [],
                    custom_attributes={
                        **shape_attrs,
                        "pdm_link_type": random.choice(["FS", "SS", "FF", "SF"]),
                        "pdm_lag_days": random.choice([0, 0, 5, -3, 7]),
                    },
                    is_active=True,
                    planned_start_date=start,
                    planned_end_date=end,
                    percent_complete=Decimal(str(random.uniform(0, 40))),
                    requires_vv_signoff=wcode in ("VER", "INT"),
                    export_control_regime=ExportControlRegime.UK_MILITARY_LIST,
                    currency_code="GBP",
                    evm_technique=EVMTechnique.PERCENT_COMPLETE,
                    bac_cost=Decimal(str(random.uniform(500000, 3000000))),
                    cost_distribution_profile=profile,
                )
                self.db.add(node)
                self.nodes.append(node)
        _print_item("Tier 4 — Work Packages", str(wp_count * len(ca_nodes)))

    # ------------------------------------------------------------------
    # Tier 5 – Tasks, Milestones, CDRLs
    # ------------------------------------------------------------------

    def _create_tasks_and_milestones(self):
        """Create leaf-level tasks and milestones under each WP."""
        wp_nodes = [n for n in self.nodes if n.path.count(".") == 3]
        task_templates = [
            ("Analysis", 20), ("Design Review", 10), ("Prototyping", 30),
            ("Testing", 25), ("Documentation", 15), ("Code Review", 10),
            ("Safety Assessment", 20), ("Integration Build", 35),
        ]
        task_count = 0
        milestone_count = 0
        for wp in wp_nodes:
            # Tasks
            for k, (tname, tdur) in enumerate(task_templates):
                task_count += 1
                start = wp.planned_start_date or date(2026, 6, 1)
                start = start + timedelta(days=k * 15)
                end = start + timedelta(days=tdur)
                node = PortfolioNode(
                    id=_random_uuid(),
                    parent_id=wp.id,
                    tree_type=TreeType.WBS,
                    code=f"{wp.code}-T{k+1}",
                    name=f"{tname} — {wp.name}",
                    path=f"{wp.path}.{k + 1}",
                    security_classification=wp.security_classification,
                    caveats=wp.caveats or [],
                    custom_attributes={
                        "dal_accreditation": "DAL_A" if "Flight" in wp.name or "Navigation" in wp.name else
                                             "DAL_B" if "Radar" in wp.name else None,
                    },
                    is_active=True,
                    planned_start_date=start,
                    planned_end_date=end,
                    percent_complete=Decimal(str(random.uniform(0, 60))),
                    requires_vv_signoff=random.random() > 0.6,
                    export_control_regime=ExportControlRegime.UK_MILITARY_LIST,
                    currency_code="GBP",
                    evm_technique=EVMTechnique.PERCENT_COMPLETE,
                    bac_cost=Decimal(str(random.uniform(50000, 300000))),
                )
                self.db.add(node)
                self.nodes.append(node)

            # Milestone at end of WP
            milestone_count += 1
            ms = PortfolioNode(
                id=_random_uuid(),
                parent_id=wp.id,
                tree_type=TreeType.WBS,
                code=f"{wp.code}-MS",
                name=f"Milestone — {wp.name} Complete",
                path=f"{wp.path}.{len(task_templates) + 1}",
                security_classification=wp.security_classification,
                caveats=wp.caveats or [],
                custom_attributes={"node_type": "milestone"},
                is_active=True,
                planned_start_date=wp.planned_end_date,
                planned_end_date=wp.planned_end_date,
                percent_complete=Decimal("0"),
                requires_vv_signoff=True,
                export_control_regime=ExportControlRegime.UK_MILITARY_LIST,
                currency_code="GBP",
                evm_technique=EVMTechnique.MILESTONE_WEIGHTS,
                bac_cost=Decimal("0"),
            )
            self.db.add(ms)
            self.nodes.append(ms)

        _print_item("Tier 5 — Tasks", str(task_count))
        _print_item("Tier 5 — Milestones", str(milestone_count))

    # ------------------------------------------------------------------
    # PDM Dependencies
    # ------------------------------------------------------------------

    def _create_pdm_dependencies(self):
        """Create PDM links (FS/SS/FF/SF) with lead/lag between WPs and tasks."""
        wp_nodes = [n for n in self.nodes if n.path.count(".") == 3]
        # Sort by path for ordering
        wp_nodes.sort(key=lambda n: n.path)
        dep_count = 0

        # Sequential FS links between WPs under same CA
        ca_groups: Dict[UUID, List[PortfolioNode]] = {}
        for wp in wp_nodes:
            ca_groups.setdefault(wp.parent_id, []).append(wp)

        for ca_id, wps in ca_groups.items():
            for i in range(len(wps) - 1):
                dep_type = DependencyType.FS
                lag = random.choice([0, 0, 5, -3])
                dep = DependencyLink(
                    id=_random_uuid(),
                    predecessor_id=wps[i].id,
                    successor_id=wps[i + 1].id,
                    dependency_type=dep_type,
                    lag_days=lag,
                )
                self.db.add(dep)
                self.deps.append(dep)
                dep_count += 1

        # Cross-CA SS links (parallel start)
        all_cas = [n for n in self.nodes if n.path.count(".") == 2]
        for i in range(min(len(all_cas) - 1, 5)):
            dep = DependencyLink(
                id=_random_uuid(),
                predecessor_id=all_cas[i].id,
                successor_id=all_cas[i + 1].id,
                dependency_type=DependencyType.SS,
                lag_days=random.choice([0, 15, 30]),
            )
            self.db.add(dep)
            self.deps.append(dep)
            dep_count += 1

        # Task-level FF links within WPs
        task_nodes = [n for n in self.nodes if n.path.count(".") == 4]
        task_nodes.sort(key=lambda n: n.path)
        wp_task_groups: Dict[UUID, List[PortfolioNode]] = {}
        for t in task_nodes:
            wp_task_groups.setdefault(t.parent_id, []).append(t)

        for wp_id, tasks in wp_task_groups.items():
            for i in range(min(len(tasks) - 1, 6)):
                dep_type = random.choice([DependencyType.FS, DependencyType.FS,
                                          DependencyType.FF, DependencyType.SF])
                lag = random.choice([0, 0, 0, 2, -1, 3])
                dep = DependencyLink(
                    id=_random_uuid(),
                    predecessor_id=tasks[i].id,
                    successor_id=tasks[i + 1].id,
                    dependency_type=dep_type,
                    lag_days=lag,
                )
                self.db.add(dep)
                self.deps.append(dep)
                dep_count += 1

        _print_item("PDM Dependencies", str(dep_count))

    # ------------------------------------------------------------------
    # Resources & Assignments
    # ------------------------------------------------------------------

    def _create_resources_and_assignments(self):
        """Create RBS resources (people, facilities, equipment) and assignments."""
        # People resources
        for u in self.users:
            res = ResourceNode(
                id=_random_uuid(),
                parent_id=None,
                tree_type=TreeType.RBS,
                code=u.username.upper().replace(".", ""),
                name=u.full_name,
                path=f"RBS.{u.username.upper().replace('.', '')}",
                security_classification=u.clearance_level or SecurityClassification.OFFICIAL,
                caveats=u.caveats or [],
                is_active=True,
                resource_type=ResourceType.PERSON,
                standard_hourly_rate=Decimal(str(random.uniform(150, 400))),
                is_generic_placeholder=False,
            )
            self.db.add(res)
            self.resources.append(res)

        # Facility resources — Environmental chambers with cooldown buffers
        facilities = [
            ("ENV-CHAMBER-01", "Environmental Chamber 01", "Thermal cycle chamber — 2hr cooldown buffer"),
            ("ENV-CHAMBER-02", "Environmental Chamber 02", "Vibration test bay — 2hr cooldown buffer"),
            ("SCIF-LAB-01", "SCIF Laboratory Alpha", "Classified avionics integration lab"),
            ("RF-ANECHOIC", "RF Anechoic Chamber", "Antenna pattern measurement"),
        ]
        facility_ids = []
        for code, name, desc in facilities:
            res = ResourceNode(
                id=_random_uuid(),
                parent_id=None,
                tree_type=TreeType.RBS,
                code=code,
                name=name,
                path=f"RBS.{code}",
                security_classification=SecurityClassification.SECRET,
                caveats=["UK_EYES_ONLY"],
                is_active=True,
                resource_type=ResourceType.FACILITY,
                standard_hourly_rate=Decimal(str(random.uniform(500, 2000))),
                is_generic_placeholder=False,
                custom_attributes={"thermal_cooldown_buffer_hours": 2, "description": desc},
            )
            self.db.add(res)
            self.resources.append(res)
            facility_ids.append(res.id)

        # Equipment with calibration dates
        equip_data = [
            ("OSC-001", "Oscilloscope #1", date(2026, 1, 15), date(2027, 1, 15)),
            ("SPECTRUM-001", "Spectrum Analyser #1", date(2026, 3, 1), date(2027, 3, 1)),
            ("SIGGEN-001", "Signal Generator #1", date(2026, 6, 1), date(2026, 12, 1)),  # expiring soon
            ("THERMOCAM-001", "Thermal Camera #1", date(2026, 2, 1), date(2027, 2, 1)),
            ("VIBRO-001", "Vibration Table Controller", date(2025, 11, 1), date(2026, 11, 1)),  # expiring
        ]
        for code, name, cal_start, cal_end in equip_data:
            res = ResourceNode(
                id=_random_uuid(),
                parent_id=None,
                tree_type=TreeType.RBS,
                code=code,
                name=name,
                path=f"RBS.{code}",
                security_classification=SecurityClassification.OFFICIAL,
                caveats=[],
                is_active=True,
                resource_type=ResourceType.ASSET,
                standard_hourly_rate=Decimal(str(random.uniform(50, 300))),
                is_generic_placeholder=False,
                custom_attributes={
                    "calibration_start": str(cal_start),
                    "calibration_expiry": str(cal_end),
                    "calibration_status": "ACTIVE" if cal_end > date(2026, 10, 31) else "EXPIRING",
                },
            )
            self.db.add(res)
            self.resources.append(res)

        # Assign resources to leaf tasks
        leaf_nodes = [n for n in self.nodes if n.path.count(".") >= 4]
        person_res = [r for r in self.resources if r.resource_type == ResourceType.PERSON]
        assign_count = 0
        for node in leaf_nodes[:80]:  # Assign first 80 leaf nodes
            num_assign = random.randint(1, 3)
            chosen = random.sample(person_res, min(num_assign, len(person_res)))
            for res in chosen:
                dur = (node.planned_end_date - node.planned_start_date).days if node.planned_start_date and node.planned_end_date else 10
                alloc = ResourceAssignment(
                    id=_random_uuid(),
                    portfolio_node_id=node.id,
                    resource_node_id=res.id,
                    allocated_units=Decimal(str(random.choice([0.25, 0.5, 0.75, 1.0]))),
                    planned_hours=Decimal(str(min(dur * 7.5, 200))),
                    rate_snapshot=res.standard_hourly_rate or Decimal("200.00"),
                    status=random.choice(list(AssignmentStatus)),
                )
                self.db.add(alloc)
                assign_count += 1

        _print_item("Resources created", str(len(self.resources)))
        _print_item("Assignments created", str(assign_count))

    # ------------------------------------------------------------------
    # CDRLs
    # ------------------------------------------------------------------

    def _create_cdrls(self):
        """Create statutory CDRL deliverables at CA and WP level."""
        ca_nodes = [n for n in self.nodes if n.path.count(".") == 2]
        wp_nodes = [n for n in self.nodes if n.path.count(".") == 3]
        cdrl_types = [
            ("CDRL-A001", "Configuration Management Plan", "DI-MGMT-81861"),
            ("CDRL-B001", "Safety Case", "DI-SAF-81862"),
            ("CDRL-C001", "Test Report", "DI-TEST-81863"),
            ("CDRL-D001", "Quality Plan", "DI-QUAL-81864"),
            ("CDRL-E001", "Interface Control Document", "DI-ICD-81865"),
            ("CDRL-F001", "Risk Register", "DI-RISK-81866"),
            ("CDRL-G001", "Progress Report", "DI-PROG-81867"),
            ("CDRL-H001", "Deliverable Summary", "DI-SUMM-81868"),
        ]
        cdrl_count = 0
        for node in ca_nodes + wp_nodes[:20]:
            seq, title, did = random.choice(cdrl_types)
            cdrl = ContractDeliverable(
                id=_random_uuid(),
                portfolio_node_id=node.id,
                cdrl_sequence_number=seq,
                title=title,
                did_reference=did,
                revision=random.choice(["Rev A", "Rev B", "Rev C"]),
                status=random.choice(list(CDRLStatus)),
                contractual_due_date=node.planned_end_date or date(2027, 6, 30),
                review_window_days=30,
            )
            self.db.add(cdrl)
            self.cdrls.append(cdrl)
            cdrl_count += 1
        _print_item("CDRLs created", str(cdrl_count))

    # ------------------------------------------------------------------
    # Cost Profiles
    # ------------------------------------------------------------------

    def _create_cost_profiles(self):
        """Verify non-linear cost profiles are set on research WPs."""
        weibull_count = sum(1 for n in self.nodes if n.cost_distribution_profile == "WEIBULL_CURVE")
        beta_count = sum(1 for n in self.nodes if n.cost_distribution_profile == "BETA_DISTRIBUTION")
        _print_item("Weibull cost profiles", str(weibull_count))
        _print_item("Beta cost profiles", str(beta_count))

    # ------------------------------------------------------------------
    # SubTree Locks (CAM Check-out Leases)
    # ------------------------------------------------------------------

    def _create_subtree_locks(self):
        """Seed active CAM check-out leases on control account subtrees."""
        ca_nodes = [n for n in self.nodes if n.path.count(".") == 2]
        lock_count = 0
        for i, ca in enumerate(ca_nodes[:3]):
            lock = SubTreeLock(
                id=_random_uuid(),
                root_path=ca.path,
                operation_type=LockOperationType.CPM_RECALCULATION,
                locked_by_user_id=self.users[i % len(self.users)].id if self.users else 1,
                acquired_at=datetime.now(timezone.utc) - timedelta(minutes=5),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=25),
            )
            self.db.add(lock)
            self.locks.append(lock)
            lock_count += 1
        _print_item("SubTreeLocks (CAM leases)", str(lock_count))

    # ------------------------------------------------------------------
    # Delegations
    # ------------------------------------------------------------------

    def _create_delegations(self):
        """Seed delegation records for CAMs on leave."""
        if len(self.users) < 4:
            return
        delegations = [
            (0, 1, date(2026, 11, 1), date(2026, 11, 15), "Annual leave — J. Smith"),
            (2, 3, date(2026, 12, 20), date(2027, 1, 5), "Christmas leave — A. Williams"),
        ]
        for delegator_idx, delegatee_idx, start, end, reason in delegations:
            if delegator_idx >= len(self.users) or delegatee_idx >= len(self.users):
                continue
            d = DelegationRecord(
                delegator_user_id=self.users[delegator_idx].id,
                delegatee_user_id=self.users[delegatee_idx].id,
                start_date=start,
                end_date=end,
                reason=reason,
                revoked=False,
            )
            self.db.add(d)
            self.delegations.append(d)
        _print_item("Delegations", str(len(self.delegations)))

    # ------------------------------------------------------------------
    # Schedule Clashes (DCMA)
    # ------------------------------------------------------------------

    def _create_schedule_clashes(self):
        """Seed intentional DCMA schedule clashes."""
        sweep_id = str(_random_uuid())
        wp_nodes = [n for n in self.nodes if n.path.count(".") == 3]
        task_nodes = [n for n in self.nodes if n.path.count(".") == 4]
        person_res = [r for r in self.resources if r.resource_type == ResourceType.PERSON]

        clash_count = 0

        # 1. Out-of-sequence execution clash
        if len(wp_nodes) >= 2:
            clash = ScheduleClashIssue(
                id=_random_uuid(),
                sweep_run_id=sweep_id,
                category=ClashCategory.PREDECESSOR_UNMET,
                severity=ClashSeverity.CRITICAL,
                portfolio_node_id=wp_nodes[0].id,
                conflicting_node_id=wp_nodes[1].id,
                conflict_window_start=wp_nodes[0].planned_start_date or date(2026, 6, 1),
                conflict_window_end=wp_nodes[0].planned_end_date or date(2027, 6, 1),
                title="Out-of-sequence execution: Integration before Design complete",
                description="Integration WP started before Preliminary Design WP finished — out-of-sequence execution detected.",
                recommended_action="Delay Integration start or fast-track Design with additional resources.",
                is_resolved=False,
            )
            self.db.add(clash)
            self.clashes.append(clash)
            clash_count += 1

        # 2. Negative float path clash
        if len(task_nodes) >= 3:
            clash = ScheduleClashIssue(
                id=_random_uuid(),
                sweep_run_id=sweep_id,
                category=ClashCategory.NEGATIVE_FLOAT_SLIP,
                severity=ClashSeverity.MAJOR,
                portfolio_node_id=task_nodes[0].id,
                conflict_window_start=task_nodes[0].planned_start_date or date(2026, 6, 1),
                conflict_window_end=task_nodes[0].planned_end_date or date(2026, 7, 1),
                title="Negative float: Critical path slip on Navigation Computer",
                description="Task has -12 days total float; critical path is slipping beyond programme end date.",
                recommended_action="Crash the schedule by adding resources or fast-track parallel activities.",
                is_resolved=False,
            )
            self.db.add(clash)
            self.clashes.append(clash)
            clash_count += 1

        # 3. Resource overallocation clash
        if len(person_res) >= 1 and len(task_nodes) >= 2:
            clash = ScheduleClashIssue(
                id=_random_uuid(),
                sweep_run_id=sweep_id,
                category=ClashCategory.RESOURCE_OVERALLOCATION,
                severity=ClashSeverity.CRITICAL,
                portfolio_node_id=task_nodes[1].id,
                conflicting_node_id=task_nodes[2].id if len(task_nodes) > 2 else None,
                conflicting_resource_id=person_res[0].id,
                conflict_window_start=date(2026, 8, 1),
                conflict_window_end=date(2026, 9, 30),
                title="Resource overallocation: J. Smith at 180% capacity",
                description="CAM J. Smith is assigned to 3 overlapping tasks exceeding 100% capacity.",
                recommended_action="Reassign one task to delegate or delay by 15 working days.",
                is_resolved=False,
            )
            self.db.add(clash)
            self.clashes.append(clash)
            clash_count += 1

        # 4. Facility collision — environmental chamber
        if len(task_nodes) >= 4:
            clash = ScheduleClashIssue(
                id=_random_uuid(),
                sweep_run_id=sweep_id,
                category=ClashCategory.SPATIAL_LOCATION_COLLISION,
                severity=ClashSeverity.MAJOR,
                portfolio_node_id=task_nodes[3].id,
                conflict_window_start=date(2026, 10, 1),
                conflict_window_end=date(2026, 10, 30),
                title="Environmental Chamber double-booking",
                description="Two tasks scheduled in Environmental Chamber 01 simultaneously without cooldown buffer.",
                recommended_action="Stagger bookings by 2 hours (thermal cooldown) or use Chamber 02.",
                is_resolved=False,
            )
            self.db.add(clash)
            self.clashes.append(clash)
            clash_count += 1

        # 5. Credential lapse clash
        if len(self.users) >= 5 and len(task_nodes) >= 5:
            clash = ScheduleClashIssue(
                id=_random_uuid(),
                sweep_run_id=sweep_id,
                category=ClashCategory.CREDENTIAL_LAPSE,
                severity=ClashSeverity.MAJOR,
                portfolio_node_id=task_nodes[4].id,
                conflict_window_start=date(2026, 11, 1),
                conflict_window_end=date(2027, 3, 31),
                title="Clearance expiry: Team member clearance lapses mid-task",
                description="Assigned resource's security clearance expires before task completion date.",
                recommended_action="Initiate re-vetting process or reassign to cleared resource.",
                is_resolved=False,
            )
            self.db.add(clash)
            self.clashes.append(clash)
            clash_count += 1

        _print_item("Schedule Clashes (DCMA)", str(clash_count))

    # ------------------------------------------------------------------
    # 3-Point Estimates
    # ------------------------------------------------------------------

    def _create_3point_estimates(self):
        """Create Monte Carlo 3-point duration estimates for leaf tasks."""
        leaf_nodes = [n for n in self.nodes if n.path.count(".") >= 4]
        dist_count = 0
        for node in leaf_nodes:
            if node.planned_start_date and node.planned_end_date:
                duration = (node.planned_end_date - node.planned_start_date).days
                if duration > 0:
                    dist = ActivityDurationDistribution(
                        id=_random_uuid(),
                        portfolio_node_id=node.id,
                        optimistic_days=float(max(1, int(duration * 0.7))),
                        most_likely_days=float(duration),
                        pessimistic_days=float(int(duration * 1.5)),
                        distribution_type=DistributionType.BETA_PERT,
                    )
                    self.db.add(dist)
                    dist_count += 1
        _print_item("3-Point Estimates", str(dist_count))


# ============================================================================
# Benchmark Validation
# ============================================================================

def run_benchmarks(db: Session, seeder: BenchmarkSeeder):
    """Run performance benchmark tests against the seeded data.

    Measures query and computation times against target thresholds:

    - Recursive ltree sub-tree query for 1,000 nodes: **< 50 ms**
    - NetworkX CPM recalculation across 1,000 nodes: **< 250 ms**
    - 2,000-iteration Monte Carlo simulation: **< 1.5 s**
    - Background clash daemon sweep across all assignments

    Parameters
    ----------
    db : Session
        Active database session.
    seeder : BenchmarkSeeder
        The seeder instance with generated entity references.
    """
    _print_section("BENCHMARK VALIDATION")

    results: Dict[str, Dict[str, Any]] = {}

    # ------------------------------------------------------------------
    # Benchmark 1: ltree sub-tree query
    # ------------------------------------------------------------------
    if seeder.project_nodes:
        # Find a project with ~1000 nodes
        target_proj = max(seeder.project_nodes, key=lambda p: len(
            [n for n in seeder.all_wbs_nodes if n.path.startswith(f"{p.path}.")]
        ))

        # Query via ltree containment
        start = time.perf_counter()
        subtree = (
            db.query(UniversalBreakdownNode)
            .filter(UniversalBreakdownNode.path.like(f"{target_proj.path}.%"))
            .all()
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

        passed = elapsed_ms < 50
        results["ltree_subtree_query"] = {
            "nodes": len(subtree),
            "time_ms": round(elapsed_ms, 2),
            "threshold_ms": 50,
            "passed": passed,
        }
        status = "PASS" if passed else "FAIL"
        _print_item(f"ltree sub-tree query ({len(subtree)} nodes)",
                     f"{elapsed_ms:.1f}ms [{status}] (threshold: 50ms)")

    # ------------------------------------------------------------------
    # Benchmark 2: CPM recalculation
    # ------------------------------------------------------------------
    try:
        from app.services.cpm_engine import calculate_cpm

        if seeder.project_nodes:
            target_proj = seeder.project_nodes[0]

            start = time.perf_counter()
            result = calculate_cpm(db, target_proj.id)
            elapsed_ms = (time.perf_counter() - start) * 1000

            node_count = result.get("activities", {}).get("total", 0) if isinstance(result, dict) else 0
            passed = elapsed_ms < 250
            results["cpm_calculation"] = {
                "nodes": node_count,
                "time_ms": round(elapsed_ms, 2),
                "threshold_ms": 250,
                "passed": passed,
            }
            status = "PASS" if passed else "FAIL"
            _print_item(f"CPM recalculation ({node_count} nodes)",
                         f"{elapsed_ms:.1f}ms [{status}] (threshold: 250ms)")
    except Exception as e:
        _print_item("CPM recalculation", f"SKIPPED ({e})")
        results["cpm_calculation"] = {"error": str(e), "passed": False}

    # ------------------------------------------------------------------
    # Benchmark 3: Monte Carlo simulation
    # ------------------------------------------------------------------
    try:
        from app.services.monte_carlo import run_schedule_simulation

        if seeder.project_nodes:
            target_proj = seeder.project_nodes[0]

            start = time.perf_counter()
            mc_result = run_schedule_simulation(db, target_proj.id, iterations=2000)
            elapsed_ms = (time.perf_counter() - start) * 1000

            passed = elapsed_ms < 1500
            results["monte_carlo_2000"] = {
                "iterations": 2000,
                "time_ms": round(elapsed_ms, 2),
                "threshold_ms": 1500,
                "passed": passed,
            }
            status = "PASS" if passed else "FAIL"
            _print_item("Monte Carlo (2,000 iterations)",
                         f"{elapsed_ms:.1f}ms [{status}] (threshold: 1,500ms)")
    except Exception as e:
        _print_item("Monte Carlo simulation", f"SKIPPED ({e})")
        results["monte_carlo_2000"] = {"error": str(e), "passed": False}

    # ------------------------------------------------------------------
    # Benchmark 4: Clash daemon sweep
    # ------------------------------------------------------------------
    try:
        from app.services.clash_daemon import run_portfolio_sweep

        if seeder.project_nodes:
            target_proj = seeder.project_nodes[0]

            start = time.perf_counter()
            clash_result = run_portfolio_sweep(db, target_proj.id)
            elapsed_ms = (time.perf_counter() - start) * 1000

            clash_count = clash_result.get("clashes_found", 0) if isinstance(clash_result, dict) else 0
            results["clash_sweep"] = {
                "clashes_found": clash_count,
                "time_ms": round(elapsed_ms, 2),
                "passed": True,  # No strict threshold for clash sweep
            }
            _print_item(f"Clash daemon sweep ({clash_count} clashes)",
                         f"{elapsed_ms:.1f}ms [PASS]")
    except Exception as e:
        _print_item("Clash daemon sweep", f"SKIPPED ({e})")
        results["clash_sweep"] = {"error": str(e), "passed": False}

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    _print_section("BENCHMARK SUMMARY")

    passed_count = sum(1 for r in results.values() if r.get("passed"))
    total_count = len(results)

    for name, data in results.items():
        status = "PASS" if data.get("passed") else ("FAIL" if "error" not in data else "SKIP")
        time_val = data.get("time_ms", "N/A")
        _print_item(name, f"{time_val}ms [{status}]")

    _print_item("", "")
    _print_item("Overall", f"{passed_count}/{total_count} benchmarks passed")

    return results


# ============================================================================
# Database Setup
# ============================================================================

def setup_database(db_url: str) -> Tuple[Session, str]:
    """Set up the database connection and create all tables.

    Creates the engine, enables the ltree extension, and creates
    all tables defined in the models.

    Parameters
    ----------
    db_url : str
        PostgreSQL database URL.

    Returns
    -------
    tuple[Session, str]
        Active database session and the database URL used.
    """
    engine = create_engine(db_url, pool_pre_ping=True)
    Base.metadata.create_all(engine)

    # Enable ltree extension
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS ltree"))
        conn.commit()

    SessionFactory = sessionmaker(bind=engine)
    db = SessionFactory()
    return db, db_url


# ============================================================================
# CLI Entry Point
# ============================================================================

def main():
    """CLI entry point for the benchmark seeder.

    Parses command-line arguments, sets up the database connection,
    runs the seeder, and executes benchmark validation.
    """
    parser = argparse.ArgumentParser(
        description="Enterprise benchmark fixture generator for the Eisenhower Portfolio Manager.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m app.cli.seed
  python -m app.cli.seed --programmes 3 --projects-per-programme 8 --nodes-per-project 300
  python -m app.cli.seed --db-url postgresql://user:pass@localhost:5432/eisenhower
  python -m app.cli.seed --seed 42 --no-benchmarks
  python -m app.cli.seed --scenario=sovereign-defence-full --reset-db
        """,
    )

    parser.add_argument(
        "--programmes", type=int, default=2,
        help="Number of top-level programmes to create (default: 2)",
    )
    parser.add_argument(
        "--projects-per-programme", type=int, default=5,
        help="Number of projects under each programme (default: 5)",
    )
    parser.add_argument(
        "--nodes-per-project", type=int, default=200,
        help="Target number of leaf-level task nodes per project (default: 200)",
    )
    parser.add_argument(
        "--db-url", type=str, default=None,
        help="PostgreSQL database URL (default: $E2E_DATABASE_URL or localhost)",
    )
    parser.add_argument(
        "--seed", type=int, default=None,
        help="Random seed for reproducible data generation",
    )
    parser.add_argument(
        "--no-benchmarks", action="store_true",
        help="Skip benchmark validation after seeding",
    )
    parser.add_argument(
        "--clear-existing", action="store_true",
        help="Drop all existing tables before seeding",
    )
    parser.add_argument(
        "--scenario", type=str, default=None,
        choices=["sovereign-defence-full"],
        help="Run a predefined seed scenario (e.g., sovereign-defence-full for Project Chimera)",
    )
    parser.add_argument(
        "--reset-db", action="store_true",
        help="Drop and recreate all tables before seeding (implies --clear-existing)",
    )

    args = parser.parse_args()

    # Determine database URL
    db_url = args.db_url or os.environ.get(
        "E2E_DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/eisenhower"
    )

    # --reset-db implies --clear-existing
    if args.reset_db:
        args.clear_existing = True

    print(f"\n{'#'*70}")
    if args.scenario:
        print(f"  EISENHOWER PORTFOLIO MANAGER - SCENARIO SEEDER")
        print(f"  Scenario: {args.scenario}")
    else:
        print(f"  EISENHOWER PORTFOLIO MANAGER - BENCHMARK SEEDER")
    print(f"{'#'*70}")
    print(f"\n  Configuration:")
    if args.scenario:
        _print_item("Scenario", args.scenario)
        _print_item("Reset DB", str(args.reset_db))
    else:
        _print_item("Programmes", str(args.programmes))
        _print_item("Projects per programme", str(args.projects_per_programme))
        _print_item("Nodes per project", str(args.nodes_per_project))
    _print_item("Database URL", db_url.split("@")[-1] if "@" in db_url else db_url)
    _print_item("Random seed", str(args.seed) if args.seed else "None (random)")
    _print_item("Run benchmarks", str(not args.no_benchmarks))

    try:
        # Set up database
        _print_section("DATABASE SETUP")
        engine = create_engine(db_url, pool_pre_ping=True)

        if args.clear_existing:
            print("  Dropping all existing tables...")
            Base.metadata.drop_all(engine)

        print("  Creating tables...")
        Base.metadata.create_all(engine)

        # Enable ltree extension
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS ltree"))
            conn.commit()

        _print_item("Database connection", "OK")

        SessionFactory = sessionmaker(bind=engine)
        db = SessionFactory()

        # Run scenario or benchmark seeder
        if args.scenario == "sovereign-defence-full":
            chimera_seeder = SovereignDefenceSeeder(db=db)
            summary = chimera_seeder.seed()

            # Validate node count >= 250
            if summary["total_nodes"] < 250:
                print(f"\n  WARNING: Expected 250+ nodes, got {summary['total_nodes']}")
            else:
                print(f"\n  ✓ Node count validated: {summary['total_nodes']} nodes (>= 250)")

            # Validate timing < 8 seconds
            if summary["elapsed_seconds"] >= 8.0:
                print(f"  WARNING: Seeding took {summary['elapsed_seconds']}s (target: < 8s)")
            else:
                print(f"  ✓ Timing validated: {summary['elapsed_seconds']}s (< 8s)")

            db.close()

            _print_section("COMPLETE")
            print(f"\n  Scenario seeding complete.")
            print(f"  Total WBS nodes: {summary['total_nodes']}")
            print(f"  Total dependencies: {summary['total_dependencies']}")
            print(f"  Total resources: {summary['total_resources']}")
            print(f"  Total CDRLs: {summary['total_cdrls']}")
            print(f"  Total clashes: {summary['total_clashes']}")
            print()

        else:
            # Run benchmark seeder
            seeder = BenchmarkSeeder(
                db=db,
                programmes=args.programmes,
                projects_per_programme=args.projects_per_programme,
                nodes_per_project=args.nodes_per_project,
                seed=args.seed,
            )
            seeder.seed_all()

            # Run benchmarks
            if not args.no_benchmarks:
                results = run_benchmarks(db, seeder)
            else:
                results = {}

            db.close()

            _print_section("COMPLETE")
            print(f"\n  Seeding and benchmarking complete.")
            print(f"  Total WBS nodes: {len(seeder.all_wbs_nodes)}")
            print(f"  Total resources: {len(seeder.resource_nodes)}")
            print(f"  Total locations: {len(seeder.location_nodes)}")
            print()

    except Exception as e:
        print(f"\n  ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
