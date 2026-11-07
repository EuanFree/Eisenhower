"""Data models for the Eisenhower Portfolio Manager.

This module defines the complete database schema for the enterprise portfolio
management system.  It is the central piece of the application's data layer
and contains all SQLAlchemy ORM models that map to PostgreSQL tables.

Architecture Overview
---------------------

The system uses a **unified polymorphic tree structure** instead of separate
relational tables for portfolios, projects, tasks, and milestones.  This
design was chosen because defence programme management requires a single
hierarchical view that can represent:

- **Work Breakdown Structures (WBS)** — How work is organised into portfolios,
  programmes, projects, and work packages.
- **Resource Breakdown Structures (RBS)** — How people, facilities, and assets
  are organised and assigned.
- **Location Breakdown Structures (LBS)** — How physical locations (sites,
  facilities, rooms, SCIFs) are hierarchically arranged.

All three tree types share a common base model (:class:`UniversalBreakdownNode`)
and use PostgreSQL's ``ltree`` extension for efficient hierarchical queries.
This means a query can find all descendants of a node in a single database
operation, regardless of how deep the tree is.

Security Model
~~~~~~~~~~~~~~

Every node in the tree carries a **security classification** (OFFICIAL through
TOP_SECRET) and optional **caveats** (e.g., ``UK_EYES_ONLY``).  Access control
is enforced at query time via Attribute-Based Access Control (ABAC), ensuring
users can only see data they are cleared for.

Forensic Audit Trail
~~~~~~~~~~~~~~~~~~~~

Every mutation (insert, update, delete, reparent) to any breakdown node is
automatically logged in the :class:`ForensicAuditLog` table with a SHA-256
chained hash.  This creates an immutable, tamper-evident audit trail: if
anyone modifies a past audit entry, the hash chain breaks for all subsequent
entries, making the tampering immediately detectable.

Secondary Entities
~~~~~~~~~~~~~~~~~~

In addition to the core tree nodes, the system tracks:

- :class:`DependencyLink` — Precedence relationships between work packages
  (used by the CPM scheduling engine).
- :class:`ResourceAssignment` — Links resources to work packages with
  allocation details and rate snapshots.
- :class:`NodeBlocker` — Impediments that block progress on tasks.

Display Settings
~~~~~~~~~~~~~~~~

For SCIF (Sensitive Compartmented Information Facility) environments where
browser storage is prohibited, :class:`UserDisplaySettings` persists user
display preferences server-side in PostgreSQL.

Enum Reference
~~~~~~~~~~~~~~

The module defines numerous enumerations that constrain valid values:

- :class:`UserRole` — Application roles (Admin, Manager, Member, Viewer).
- :class:`TreeType` — Tree categories (WBS, RBS, LBS).
- :class:`SecurityClassification` — Clearance levels (OFFICIAL to TOP_SECRET).
- :class:`DeliveryMode` — Project delivery approaches (Waterfall, Agile, Hybrid).
- :class:`ResourceType` — Resource categories (Person, Facility, Asset).
- :class:`LocationTier` — Location hierarchy levels (Site to Sub-Container).
- :class:`DependencyType` — CPM dependency types (FS, SS, FF, SF).
- :class:`AssignmentStatus` — Resource assignment states.
- :class:`BlockerCategory` — Blocker type classifications.
- :class:`BlockerSeverity` — Blocker impact levels.
- :class:`AuditActionType` — Audit log action types.
- :class:`Density` — UI row density presets.
- :class:`Theme` — Visual themes for operational environments.
- :class:`ColorAccessibility` — Color vision deficiency palettes.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Date, Time,
    Enum as SAEnum, Float, Index, event, text, TypeDecorator, Numeric,
    UniqueConstraint, Uuid
)
from sqlalchemy.sql import column as col_expr
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import relationship
from datetime import datetime, date, timezone
from uuid import uuid4
from app.database import Base


def _utc_now():
    """Return the current UTC time as a timezone-aware datetime.

    Replaces the deprecated ``_utc_now()`` with the modern
    ``datetime.now(timezone.utc)`` pattern.  Used as the default
    callable for SQLAlchemy ``Column(DateTime, default=...)`` so that
    every INSERT automatically records the UTC timestamp without
    triggering the Python 3.12+ deprecation warning.
    """
    return datetime.now(timezone.utc)
import enum
import hashlib
import json


# ============================================================================
# Custom ltree type (SQLAlchemy has no built-in ltree support)
# ============================================================================

class Ltree(TypeDecorator):
    """PostgreSQL ltree type for hierarchical path storage.

    This custom SQLAlchemy type maps Python strings to PostgreSQL's native
    ``ltree`` data type, which is provided by the ``ltree`` extension.  The
    ltree type stores hierarchical paths as dotted strings (e.g. ``'1.2.3'``)
    and supports powerful operators for ancestor/descendant queries.

    Why ltree?
    ~~~~~~~~~~

    In a traditional relational database, finding all descendants of a node
    requires either recursive CTEs (slow on large trees) or storing materialised
    path strings with ``LIKE`` queries.  PostgreSQL's ltree extension provides
    native tree operations with GiST indexing, making descendant queries
    extremely fast even on trees with millions of nodes.

    The ``<@`` operator checks path containment (is A an ancestor of B?),
    the ``@>`` operator checks the reverse, and ``~`` supports pattern matching.

    Example
    ~~~~~~~

    If a node has path ``'1.2.3'``, its parent has path ``'1.2'`` and its
    grandparent has path ``'1'``.  A query using ``path <@ '1'`` will return
    all nodes under the root ``'1'``, regardless of depth.

    Attributes
    ----------
    impl : String
        The fallback SQL type for non-PostgreSQL databases.
    cache_ok : bool
        Allows SQLAlchemy to cache type information for performance.

    Methods
    -------
    load_dialect_impl(dialect)
        Returns a Text descriptor for PostgreSQL; String for other dialects.
    process_bind_param(value, dialect)
        Converts lists/tuples to dotted strings before inserting into the database.
    process_result_value(value, dialect)
        Converts the database value back to a Python string.
    """
    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):
        """Return the appropriate SQL type descriptor for the target dialect.

        For PostgreSQL, returns a Text descriptor that is later rewritten
        to 'ltree' by the :func:`compile_ltree_postgresql` compiler hook.
        For other dialects (e.g., SQLite), falls back to a String descriptor.

        Parameters
        ----------
        dialect : Dialect
            The SQLAlchemy dialect instance for the target database.

        Returns
        -------
        TypeEngine
            A Text descriptor for PostgreSQL, or a String descriptor
            for all other dialects.
        """
        if dialect.name == "postgresql":
            # Return a Text descriptor; the callback below rewrites the DDL name
            return dialect.type_descriptor(Text())
        return dialect.type_descriptor(String())

    def process_bind_param(self, value, dialect):
        """Convert a Python value to a dotted ltree string before database insert.

        If the value is a list or tuple (e.g., ``['prog', 'proj', 'wp']``),
        it is joined with dots to produce ``'prog.proj.wp'``.  A plain string
        is passed through unchanged.  ``None`` values are preserved as-is.

        Parameters
        ----------
        value : str, list, tuple, or None
            The Python value to convert.  Lists and tuples are joined with dots.
        dialect : Dialect
            The SQLAlchemy dialect instance (unused but required by the interface).

        Returns
        -------
        str or None
            A dotted ltree path string (e.g., ``'1.2.3'``) or ``None``.
        """
        if value is not None:
            if isinstance(value, (list, tuple)):
                return ".".join(str(v) for v in value)
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        """Convert a database ltree value back to a Python string.

        PostgreSQL returns ltree values as strings.  This method ensures
        the value is always a Python string, or ``None`` if the column
        is NULL.

        Parameters
        ----------
        value : any
            The raw value returned by the database driver.
        dialect : Dialect
            The SQLAlchemy dialect instance (unused but required by the interface).

        Returns
        -------
        str or None
            The ltree path as a Python string, or ``None`` if the value
            was NULL in the database.
        """
        if value is not None:
            return str(value)
        return value


# Patch the PostgreSQL compiler so that Ltree columns emit 'ltree' in DDL
from sqlalchemy.ext.compiler import compiles


@compiles(Ltree, "postgresql")
def compile_ltree_postgresql(type_, compiler, **kw):
    """SQLAlchemy compiler hook that emits the native 'ltree' DDL type.

    When SQLAlchemy generates DDL (CREATE TABLE statements) for a column
    using the :class:`Ltree` type on PostgreSQL, this function is called
    to determine the SQL type name.  It returns ``'ltree'`` so that the
    column is created with the native PostgreSQL ltree type rather than
    a generic text column.

    Parameters
    ----------
    type_ : Ltree
        The Ltree type instance being compiled.
    compiler : Compiler
        The SQLAlchemy SQL compiler instance for the current dialect.
    kw : dict
        Additional keyword arguments passed by the compiler.

    Returns
    -------
    str
        The SQL type name ``'ltree'`` for PostgreSQL DDL generation.
    """
    return "ltree"


@compiles(ARRAY, "sqlite")
def compile_array_sqlite(type_, compiler, **kw):
    """SQLAlchemy compiler hook that falls back to TEXT for ARRAY on SQLite.

    PostgreSQL ARRAY columns cannot be created in SQLite because SQLite
    has no native array type.  This compiler hook tells SQLAlchemy to
    emit ``TEXT`` instead, allowing in-memory SQLite databases to be
    used for unit testing.  The application code stores arrays as
    Python lists, and SQLAlchemy handles the conversion transparently.

    Parameters
    ----------
    type_ : ARRAY
        The ARRAY type instance being compiled.
    compiler : Compiler
        The SQLAlchemy SQL compiler instance for the current dialect.
    kw : dict
        Additional keyword arguments passed by the compiler.

    Returns
    -------
    str
        The SQL type name ``'TEXT'`` for SQLite DDL generation.
    """
    return "TEXT"


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    """SQLAlchemy compiler hook that falls back to TEXT for JSONB on SQLite.

    PostgreSQL JSONB columns cannot be created in SQLite.  This compiler
    hook tells SQLAlchemy to emit ``TEXT`` instead, allowing in-memory
    SQLite databases to be used for unit testing.

    Parameters
    ----------
    type_ : JSONB
        The JSONB type instance being compiled.
    compiler : Compiler
        The SQLAlchemy SQL compiler instance for the current dialect.
    kw : dict
        Additional keyword arguments passed by the compiler.

    Returns
    -------
    str
        The SQL type name ``'TEXT'`` for SQLite DDL generation.
    """
    return "TEXT"


class SQLiteArray(TypeDecorator):
    """TypeDecorator that serialises Python lists to JSON for SQLite storage.

    PostgreSQL ARRAY columns are stored as native arrays in production.
    For SQLite-based unit tests, this decorator serialises lists to JSON
    strings on insert and deserialises them back to lists on select,
    providing transparent cross-database compatibility.

    Attributes
    ----------
    impl : String
        The fallback SQL type for SQLite (TEXT stored as String).
    cache_ok : bool
        Allows SQLAlchemy to cache type information for performance.

    Methods
    -------
    process_bind_param(value, dialect)
        Serialises a Python list to a JSON string for SQLite inserts.
    process_result_value(value, dialect)
        Deserialises a JSON string back to a Python list for SQLite selects.
    """
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Serialise a Python list to JSON before inserting into SQLite.

        Parameters
        ----------
        value : list or None
            The Python list to serialise.
        dialect : Dialect
            The SQLAlchemy dialect instance.

        Returns
        -------
        str or None
            A JSON string representation of the list, or ``None``.
        """
        if dialect.name == "sqlite" and value is not None:
            return json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        """Deserialise a JSON string back to a Python list from SQLite.

        Parameters
        ----------
        value : str or None
            The JSON string from the database.
        dialect : Dialect
            The SQLAlchemy dialect instance.

        Returns
        -------
        list or None
            A Python list, or ``None`` if the value was NULL.
        """
        if dialect.name == "sqlite" and value is not None:
            return json.loads(value)
        return value


# ============================================================================
# Enums
# ============================================================================

class UserRole(str, enum.Enum):
    """Application roles that determine what actions a user can perform.

    Roles follow a hierarchy: Admin > Manager > Member > Viewer.
    An Admin can perform all actions.  A Manager can manage portfolios
    and assign tasks.  A Member can work on assigned tasks.  A Viewer
    has read-only access to data they are cleared for.

    Values
    ------
    ADMIN : str
        Full system administrator with unrestricted access to all features,
        including user management and system configuration.
    MANAGER : str
        Portfolio and project manager who can create and modify portfolios,
        assign resources, and manage team members.
    MEMBER : str
        Standard team member who can work on assigned tasks, update progress,
        and report blockers.
    VIEWER : str
        Read-only user who can view data they are cleared for but cannot
        modify any content.
    """
    ADMIN = "admin"
    MANAGER = "manager"
    MEMBER = "member"
    VIEWER = "viewer"


class TreeType(str, enum.Enum):
    """Categories of breakdown structures supported by the unified tree model.

    The system stores all three tree types in a single polymorphic hierarchy
    (UniversalBreakdownNode), allowing cross-referencing between work, resources,
    and locations.

    Values
    ------
    WBS : str
        Work Breakdown Structure — decomposes the total scope of work into
        manageable work packages.  Used for portfolios, programmes, projects,
        and tasks.
    RBS : str
        Resource Breakdown Structure — organises people, facilities, and assets
        into a hierarchical resource catalogue.
    LBS : str
        Location Breakdown Structure — represents the physical hierarchy of
        sites, facilities, zones, rooms, and containers (including SCIFs).
    """
    WBS = "WBS"
    RBS = "RBS"
    LBS = "LBS"


class SecurityClassification(str, enum.Enum):
    """UK security classification levels for data and user clearance.

    These levels follow the UK Official Secrets Act classification hierarchy.
    A user can access a node only if their clearance level is greater than
    or equal to the node's classification.

    The hierarchy (lowest to highest) is:
    OFFICIAL < OFFICIAL_SENSITIVE < SECRET < TOP_SECRET

    Values
    ------
    OFFICIAL : str
        The lowest classification level.  Information whose unauthorized
        disclosure could cause limited damage to official interests.
    OFFICIAL_SENSITIVE : str
        Also known as "OFFICIAL-SENSITIVE".  Information whose unauthorized
        disclosure could cause significant damage to national security.
    SECRET : str
        Information whose unauthorized disclosure could cause serious damage
        to national security or international relations.
    TOP_SECRET : str
        The highest classification level.  Information whose unauthorized
        disclosure could cause exceptionally grave damage to national security.
    """
    OFFICIAL = "OFFICIAL"
    OFFICIAL_SENSITIVE = "OFFICIAL_SENSITIVE"
    SECRET = "SECRET"
    TOP_SECRET = "TOP_SECRET"


class ClearanceType(str, enum.Enum):
    """Personnel security clearance types for UK defence and NATO programmes.

    These represent the vetting standards required to access classified
    information in the UK defence sector.  Each type involves progressively
    deeper background investigation and ongoing monitoring.

    Values
    ------

    BPSS
        Baseline Personnel Security Standard.  The minimum vetting level
        for all UK defence contractors.  Includes identity verification,
        right-to-work check, and 3-year employment history.  Sufficient
        for access to OFFICIAL data.

    SC
        Security Check.  Enhanced vetting for SECRET-level access.
        Includes 3-year life history check, financial standing review,
        foreign connection assessment, and local intelligence checks.
        Required for most defence programme work.

    DV
        Developed Vetting.  The highest UK vetting standard for
        TOP_SECRET access.  Includes full life examination, in-depth
        interviews with associates, credit bureau checks, and continuous
        monitoring with periodic re-vetting every 5 years.

    NATO_SECRET
        NATO-equivalent clearance for multinational defence programmes.
        Recognised across NATO member nations, allowing personnel to
        work on joint programmes without re-vetting in each nation.
    """
    BPSS = "BPSS"
    SC = "SC"
    DV = "DV"
    NATO_SECRET = "NATO_SECRET"


class DeliveryMode(str, enum.Enum):
    """Project delivery methodology for a portfolio node.

    This determines how the work package is planned, tracked, and executed.

    Values
    ------
    WATERFALL : str
        Traditional linear project management where phases are completed
        sequentially (requirements → design → implementation → testing →
        deployment).  Suitable for projects with well-defined, stable requirements.
    AGILE : str
        Iterative and incremental approach using sprints, daily standups,
        and continuous feedback.  Suitable for projects with evolving requirements.
    HYBRID : str
        Combines Waterfall planning for high-level milestones with Agile
        execution for individual work packages.  Common in defence programmes
        where overall milestones are fixed but implementation is flexible.
    """
    WATERFALL = "WATERFALL"
    AGILE = "AGILE"
    HYBRID = "HYBRID"


class ResourceType(str, enum.Enum):
    """Categories of resources in the Resource Breakdown Structure (RBS).

    Values
    ------
    PERSON : str
        A human resource — an individual who can be assigned to tasks.
        May have a standard hourly rate for cost estimation.
    FACILITY : str
        A physical facility or room that can be booked or allocated.
        Examples include meeting rooms, laboratories, and SCIFs.
    ASSET : str
        A piece of equipment or tooling that can be assigned to a task.
        Examples include test equipment, vehicles, and computing hardware.
    """
    PERSON = "PERSON"
    FACILITY = "FACILITY"
    ASSET = "ASSET"


class LocationTier(str, enum.Enum):
    """Hierarchy levels in the Location Breakdown Structure (LBS).

    Locations are organised from the broadest (SITE) to the most granular
    (SUB_CONTAINER), forming a physical containment hierarchy.

    Values
    ------
    SITE : str
        The top-level location — an entire base, campus, or installation.
    FACILITY : str
        A building or complex within a site.
    ZONE : str
        A designated area within a facility (e.g., a secure zone).
    ROOM : str
        An individual room within a zone.
    CONTAINER : str
        A physical container within a room (e.g., a server rack, safe).
    SUB_CONTAINER : str
        A sub-compartment within a container (e.g., a drawer, slot).
    """
    SITE = "SITE"
    FACILITY = "FACILITY"
    ZONE = "ZONE"
    ROOM = "ROOM"
    CONTAINER = "CONTAINER"
    SUB_CONTAINER = "SUB_CONTAINER"


class DependencyType(str, enum.Enum):
    """Precedence diagramming dependency types used in CPM scheduling.

    These define how the start and finish of one task relate to the start
    and finish of another task.  They are the standard dependency types
    used in project management software (MS Project, Primavera P6).

    Values
    ------
    FS : str
        Finish-to-Start — the successor cannot start until the predecessor
        finishes.  This is the most common dependency type.
    SS : str
        Start-to-Start — the successor cannot start until the predecessor
        starts.  Useful for tasks that should begin together.
    FF : str
        Finish-to-Finish — the successor cannot finish until the predecessor
        finishes.  Useful for tasks that should end together.
    SF : str
        Start-to-Finish — the successor cannot finish until the predecessor
        starts.  Rarely used; typically for shift handover scenarios.

    Notes
    ~~~~~

    Each dependency can have a ``lag_days`` value: positive for a delay
    (e.g., concrete must cure for 3 days before next phase) and negative
    for a lead (e.g., interior work can start 2 days before exterior
    is fully complete).
    """
    FS = "FS"   # Finish-to-Start
    SS = "SS"   # Start-to-Start
    FF = "FF"   # Finish-to-Finish
    SF = "SF"   # Start-to-Finish


class AssignmentStatus(str, enum.Enum):
    """Status of a resource assignment to a portfolio node.

    Values
    ------
    CONFIRMED : str
        The resource is confirmed and committed to the task.  The assignment
        is firm and the resource's time is reserved.
    CLAIMED : str
        The resource has been claimed by a user from a generic placeholder.
        The assignment is pending final confirmation.
    REQUISITIONED : str
        The resource has been requested but not yet approved.  The assignment
        is provisional and subject to resource manager approval.
    """
    CONFIRMED = "CONFIRMED"
    CLAIMED = "CLAIMED"
    REQUISITIONED = "REQUISITIONED"


class BlockerCategory(str, enum.Enum):
    """Categories of impediments that can block progress on a task.

    These categories help programme managers identify the root cause
    of delays and take appropriate corrective action.

    Values
    ------
    DEPENDENCY_OVERDUE : str
        A predecessor task has not completed by its scheduled finish date,
        blocking the dependent successor task.
    RESOURCE_UNAVAILABLE : str
        The assigned resource (person, facility, or asset) is not available
        when needed — due to conflict, leave, or maintenance.
    CLEARANCE_HOLD : str
        A team member's security clearance is pending review or has been
        temporarily suspended, preventing them from accessing classified work.
    FACILITY_MAINTENANCE : str
        The required physical facility (e.g., SCIF, laboratory) is unavailable
        due to scheduled or emergency maintenance.
    OPERATIONAL_IMPEDIMENT : str
        An operational constraint — such as a live exercise, deployment,
        or priority shift — is preventing work from proceeding.
    """
    DEPENDENCY_OVERDUE = "DEPENDENCY_OVERDUE"
    RESOURCE_UNAVAILABLE = "RESOURCE_UNAVAILABLE"
    CLEARANCE_HOLD = "CLEARANCE_HOLD"
    FACILITY_MAINTENANCE = "FACILITY_MAINTENANCE"
    OPERATIONAL_IMPEDIMENT = "OPERATIONAL_IMPEDIMENT"


class BlockerSeverity(str, enum.Enum):
    """Severity levels for task blockers.

    These determine the urgency of resolution and the escalation path.

    Values
    ------
    CRITICAL : str
        The blocker is on the critical path and will cause a programme-level
        delay if not resolved immediately.  Requires senior management attention.
    MAJOR : str
        The blocker will cause significant delay but has some float available.
        Requires project manager attention within 24 hours.
    MINOR : str
        The blocker has limited impact and can be resolved through normal
        team processes.  Should be tracked but does not require escalation.
    """
    CRITICAL = "CRITICAL"
    MAJOR = "MAJOR"
    MINOR = "MINOR"


class AuditActionType(str, enum.Enum):
    """Types of actions recorded in the forensic audit log.

    Every mutation to a breakdown node is automatically logged with one
    of these action types.

    Values
    ------
    INSERT : str
        A new node was created in the tree.
    UPDATE : str
        An existing node's attributes were modified.
    DELETE : str
        A node was removed from the tree (and all its descendants,
        due to cascading deletes).
    REPARENT : str
        A node was moved to a different parent in the tree hierarchy.
        This is a special case of UPDATE that is flagged separately
        because reparenting changes the tree structure.
    EXPORT_CONTROL_BREACH_ATTEMPT : str
        A user attempted to access export-controlled data without
        proper authorisation.  This is a security event that triggers
        an immediate alert and access denial.
    DIODE_INGEST_COMPLETED : str
        A data diode bundle was successfully ingested from an air-gapped
        dropzone.  The bundle has passed cryptographic verification,
        malicious payload inspection, and been staged for processing.
    """
    INSERT = "INSERT"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    REPARENT = "REPARENT"
    EXPORT_CONTROL_BREACH_ATTEMPT = "EXPORT_CONTROL_BREACH_ATTEMPT"
    DIODE_INGEST_COMPLETED = "DIODE_INGEST_COMPLETED"


class ExportControlRegime(str, enum.Enum):
    """International export control regimes that govern technical data access.

    Defence programmes often handle technology that is controlled under
    national export laws.  These laws restrict who can access technical
    data based on nationality, citizenship, and licensing agreements.

    The two most common regimes are:

    - **ITAR** (International Traffic in Arms Regulations, USA) — Controls
      defence articles and services listed on the US Munitions List (USML).
      Only US persons (citizens, permanent residents, protected individuals)
      may access ITAR-controlled data unless a specific licence is granted.

    - **EAR** (Export Administration Regulations, USA) — Controls dual-use
      items (civilian and military) listed by ECCN (Export Control Classification
      Number).  Some foreign nationals may access EAR-controlled data under
      deemed export rules.

    - **UK_MILITARY_LIST** — Controls military equipment and technology under
      UK export control law.  Similar to ITAR but governed by UK authorities.

    - **OPEN_GENERAL** — Items covered by a general licence or open export
      authorisation.  Minimal restrictions beyond standard security clearance.

    - **NOT_CONTROLLED** — Items not subject to export control restrictions.
      Access is governed solely by security clearance (ABAC).

    Values
    ------
    ITAR : str
        US International Traffic in Arms Regulations.  Strictest regime:
        only US persons may access unless specifically licensed.
    EAR_ECCN : str
        US Export Administration Regulations with a specific ECCN code.
        Dual-use items with controlled technology.
    UK_MILITARY_LIST : str
        UK military equipment and technology controls.
    OPEN_GENERAL : str
        Items covered by a general/open export licence.
    NOT_CONTROLLED : str
        No export control restrictions apply.
    """
    ITAR = "ITAR"
    EAR_ECCN = "EAR_ECCN"
    UK_MILITARY_LIST = "UK_MILITARY_LIST"
    OPEN_GENERAL = "OPEN_GENERAL"
    NOT_CONTROLLED = "NOT_CONTROLLED"


# ============================================================================
# Display Settings Enums
# ============================================================================

class Density(str, enum.Enum):
    """Row density presets for data grid views.

    These control how much information is visible on screen at once,
    catering to different monitor sizes and user preferences.

    Values
    ------
    ULTRA_DENSE : str
        28px row height — maximum information density for large monitors
        or users who prefer compact views.
    BALANCED : str
        36px row height — the default setting, balancing readability
        with information density.
    COMFORT : str
        44px row height — spacious rows for improved readability,
        suitable for smaller screens or users with visual impairments.
    """
    ULTRA_DENSE = "ULTRA_DENSE"       # 28px row height
    BALANCED = "BALANCED"             # 36px row height
    COMFORT = "COMFORT"               # 44px row height


class Theme(str, enum.Enum):
    """Visual themes for SCIF and operational environments.

    These themes are designed for the specific lighting and display
    conditions found in classified operational environments.

    Values
    ------
    SCIF_DARK : str
        Dark theme optimised for low-light SCIF environments where
        bright screens would compromise operational security.
    HIGH_CONTRAST_DARK : str
        Dark theme with maximum contrast for users who need enhanced
        visual distinction between UI elements.
    BALANCED_LIGHT : str
        Light theme for normal office environments with balanced
        contrast and readability.
    PROJECTOR : str
        High-contrast theme designed for projection in briefing rooms
        where ambient light reduces screen visibility.
    """
    SCIF_DARK = "SCIF_DARK"
    HIGH_CONTRAST_DARK = "HIGH_CONTRAST_DARK"
    BALANCED_LIGHT = "BALANCED_LIGHT"
    PROJECTOR = "PROJECTOR"


class ColorAccessibility(str, enum.Enum):
    """Color vision deficiency (CVD) palettes for status indicators.

    Approximately 8% of men and 0.5% of women have some form of color
    vision deficiency.  These palettes ensure that status indicators
    (RAG ratings: Red/Amber/Green) remain distinguishable for all users.

    Values
    ------
    STANDARD_RAG : str
        Standard Red/Amber/Green palette for users with normal color vision.
    DEUTERANOPIA : str
        Adjusted palette for deuteranopia (red-green color blindness,
        the most common form — affects ~6% of males).
    PROTANOPIA : str
        Adjusted palette for protanopia (red-blindness — affects ~1% of males).
    TRITANOPIA : str
        Adjusted palette for tritanopia (blue-yellow color blindness —
        very rare, affects ~0.001% of population).
    MONOCHROME_PATTERN : str
        Pattern-based palette for complete color blindness (achromatopsia).
        Uses textures and patterns instead of color to distinguish statuses.
    """
    STANDARD_RAG = "STANDARD_RAG"
    DEUTERANOPIA = "DEUTERANOPIA"
    PROTANOPIA = "PROTANOPIA"
    TRITANOPIA = "TRITANOPIA"
    MONOCHROME_PATTERN = "MONOCHROME_PATTERN"


class ProficiencyLevel(int, enum.Enum):
    """Skill proficiency levels for the skill matrix.

    These levels follow a 5-point scale from novice to master, allowing
    the system to match personnel against task requirements with granular
    precision.  Each level represents both technical competence and the
    ability to work independently at that skill.

    Values
    ------
    NOVICE : int
        Level 1 — Requires close supervision and detailed guidance.
        Has theoretical knowledge but limited practical experience.
    INTERMEDIATE : int
        Level 2 — Can perform routine tasks with occasional guidance.
        Building practical experience and growing confidence.
    COMPETENT : int
        Level 3 — Can work independently on standard tasks.
        The expected baseline for most operational roles.
    EXPERT : int
        Level 4 — Can handle complex, non-routine tasks and mentor
        others.  Deep practical experience in the skill area.
    MASTER : int
        Level 5 — Recognised authority in the field.  Can define
        best practices, train experts, and solve novel problems.
    """
    NOVICE = 1
    INTERMEDIATE = 2
    COMPETENT = 3
    EXPERT = 4
    MASTER = 5


class VerificationStatus(str, enum.Enum):
    """Verification status for a user's claimed skill proficiency.

    In a defence environment, self-attested skills are not sufficient
    for critical assignments.  This enum tracks the confidence level
    in a skill rating, from self-attested (lowest trust) to certified
    (formally assessed and validated).

    Values
    ------
    SELF_ATTESTED : str
        The user has claimed this skill level without external validation.
        Used as a starting point before formal assessment.
    ENDORSED : str
        A line manager or subject matter expert has endorsed the claimed
        proficiency level based on observed performance.
    CERTIFIED : str
        The skill has been formally assessed via a recognised certification
        process, examination, or formal evaluation board.
    """
    SELF_ATTESTED = "SELF_ATTESTED"
    ENDORSED = "ENDORSED"
    CERTIFIED = "CERTIFIED"


class RequisitionStatus(str, enum.Enum):
    """Lifecycle status of a resource requisition request.

    A requisition moves through a workflow from submission to final
    disposition.  This enum tracks the current state of that workflow.

    Values
    ------
    PENDING_REVIEW : str
        The requisition has been submitted and awaits review by a
        functional lead or resource manager.
    APPROVED : str
        The requisition has been approved; a ResourceAssignment will
        be created to formalise the allocation.
    REJECTED : str
        The requisition has been rejected, typically due to resource
        unavailability, clearance mismatch, or budget constraints.
    COUNTER_OFFERED : str
        The reviewer has proposed alternative terms (different resource,
        reduced hours, or adjusted dates) instead of outright approval.
    CANCELLED : str
        The requisitioner or approver has cancelled the request
        before final disposition.
    """
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COUNTER_OFFERED = "COUNTER_OFFERED"
    CANCELLED = "CANCELLED"


class ClashCategory(str, enum.Enum):
    """Categories of schedule clashes detected by the audit engine.

    The clash daemon periodically sweeps the schedule to identify
    conflicts that would prevent smooth execution.  Each category
    represents a distinct type of scheduling problem requiring
    different resolution strategies.

    Values
    ------
    RESOURCE_OVERALLOCATION : str
        A resource is assigned more than 100% capacity across
        overlapping tasks.  The resource cannot physically work
        more than their available hours.
    FACILITY_CONTRAVENTION : str
        A task is scheduled in a facility that does not meet the
        security or environmental requirements for the work.
        For example, SECRET work scheduled in an OFFICIAL room.
    NEGATIVE_FLOAT_SLIP : str
        A task's schedule has slipped such that its total float
        is negative — the project is already behind schedule.
    CALENDAR_EXCEPTION : str
        A task is scheduled on a non-working day (e.g., a
        recognised holiday or shutdown period).
    CREDENTIAL_LAPSE : str
        A resource's security clearance or professional
        certification expires before the task's planned end date.
    PREDECESSOR_UNMET : str
        A task's predecessor has not finished by the time the
        task is scheduled to start, violating the dependency.
    SPATIAL_LOCATION_COLLISION : str
        Multiple tasks are scheduled in the same physical location
        (especially a SCIF) exceeding the location's capacity.
        For example, two teams booked in the same SCIF room
        at the same time.
    """
    RESOURCE_OVERALLOCATION = "RESOURCE_OVERALLOCATION"
    FACILITY_CONTRAVENTION = "FACILITY_CONTRAVENTION"
    NEGATIVE_FLOAT_SLIP = "NEGATIVE_FLOAT_SLIP"
    CALENDAR_EXCEPTION = "CALENDAR_EXCEPTION"
    CREDENTIAL_LAPSE = "CREDENTIAL_LAPSE"
    PREDECESSOR_UNMET = "PREDECESSOR_UNMET"
    SPATIAL_LOCATION_COLLISION = "SPATIAL_LOCATION_COLLISION"


class ClashSeverity(str, enum.Enum):
    """Severity levels for schedule clashes.

    Severity determines the urgency of resolution and the level
    of management attention required.

    Values
    ------
    CRITICAL : str
        The clash will definitely prevent task execution and
        requires immediate senior management intervention.
        Examples: resource double-booked at 200%, SCIF capacity
        exceeded, clearance expired.
    MAJOR : str
        The clash will cause significant delay or risk if not
        resolved soon.  Project manager attention required within
        the current sprint.
    ADVISORY : str
        The clash is a potential future issue.  It should be
        monitored and may require action as the schedule progresses.
    """
    CRITICAL = "CRITICAL"
    MAJOR = "MAJOR"
    ADVISORY = "ADVISORY"


# ============================================================================
# Skill Matrix Models
# ============================================================================

class SkillCategory(Base):
    """Top-level category for grouping related skills.

    Skills are organised into categories to provide a structured taxonomy
    for the skill matrix.  For example, the 'AVIONICS' category might
    contain skills like 'Radar Systems Design', 'Flight Control Software',
    and 'Communications Protocols'.

    This categorisation enables:

    - **Skill gap analysis** — Identify which categories lack coverage.
    - **Reporting** — Summarise workforce capability by domain.
    - **Requisition matching** — Find candidates within a skill domain.

    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    code : str
        Short alphanumeric code (e.g., 'AVIONICS', 'SYSTEMS_SAFETY')
        used as a human-readable identifier in reports.
    name : str
        Human-readable name of the category (e.g., 'Avionics Systems').
    description : str or None
        Optional description of the category's scope and purpose.
    """
    __tablename__ = "skill_categories"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    # Relationships
    skills = relationship("SkillDefinition", back_populates="category")


class SkillDefinition(Base):
    """A specific skill within a category.

    Each skill definition represents a discrete capability that can be
    assessed, matched, and tracked.  For example, within the 'AVIONICS'
    category, there might be a skill 'RF Hardware Design' with code
    'RF-HW-001'.

    Users record their proficiency in each skill via UserSkillProfile,
    and requisitions reference skills to specify requirements.

    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    category_id : int
        Foreign key to :class:`SkillCategory.id` — the parent category.
    code : str
        Short alphanumeric code (e.g., 'RF-HW-001') for this skill.
    name : str
        Human-readable name of the skill.
    description : str or None
        Detailed description of what this skill entails, including
        the knowledge, tools, and experience it covers.
    """
    __tablename__ = "skill_definitions"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(
        Integer,
        ForeignKey("skill_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    # Relationships
    category = relationship("SkillCategory", back_populates="skills")
    user_profiles = relationship("UserSkillProfile", back_populates="skill")


class UserSkillProfile(Base):
    """Records a user's proficiency in a specific skill.

    This is the junction between User and SkillDefinition that captures
    not just *which* skills a user has, but *how proficient* they are
    and *how verified* that proficiency claim is.

    The matching engine uses these profiles to rank candidates against
    requisition requirements.  A user with CERTIFIED expertise will
    rank higher than a user with SELF_ATTESTED competence.

    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    user_id : int
        Foreign key to :class:`User.id` — the skill holder.
    skill_id : int
        Foreign key to :class:`SkillDefinition.id` — the skill assessed.
    proficiency_level : ProficiencyLevel
        The user's self-reported or assessed proficiency (1-5 scale).
    verification_status : VerificationStatus
        How the proficiency claim has been validated.
    certificate_expiry : date or None
        If the skill requires periodic recertification, this tracks
        when the current certification expires.
    created_at : datetime
        Timestamp when this profile was created.
    updated_at : datetime
        Timestamp when this profile was last modified.
    """
    __tablename__ = "user_skill_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_id = Column(
        Integer,
        ForeignKey("skill_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    proficiency_level = Column(
        SAEnum(ProficiencyLevel),
        default=ProficiencyLevel.NOVICE,
        nullable=False,
    )
    verification_status = Column(
        SAEnum(VerificationStatus),
        default=VerificationStatus.SELF_ATTESTED,
        nullable=False,
    )
    certificate_expiry = Column(Date, nullable=True)
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    user = relationship("User", backref="skill_profiles")
    skill = relationship("SkillDefinition", back_populates="user_profiles")

    __table_args__ = (
        Index("ix_user_skill_unique", "user_id", "skill_id", unique=True),
    )


class ResourceRequisitionRequest(Base):
    """A formal request to allocate a resource to a portfolio node.

    When a project manager needs additional personnel or a specific
    skill for a task, they submit a requisition.  The requisition
    specifies what is needed (skills, hours, dates) and optionally
    targets a specific resource.

    The workflow is:

    1. **Submit** — Project manager creates a requisition.
    2. **Review** — Functional lead reviews the inbox and evaluates
       candidates using the matching engine.
    3. **Approve/Reject** — The lead approves (creating a ResourceAssignment)
       or rejects with a reason.

    Attributes
    ----------
    id : UUID
        Universally unique identifier for the requisition.
    portfolio_node_id : UUID
        Foreign key to :class:`UniversalBreakdownNode` — the task or
        work package that needs the resource.
    requested_by_user_id : int
        Foreign key to :class:`User` — who submitted the requisition.
    target_resource_id : UUID or None
        Foreign key to :class:`ResourceNode` — a specific resource being
        requested (nullable if requesting a generic role).
    required_skill_id : int or None
        Foreign key to :class:`SkillDefinition` — the primary skill
        required for this requisition (nullable if no specific skill).
    min_proficiency : ProficiencyLevel
        The minimum proficiency level required.
    requested_hours : float
        Total hours of resource time being requested.
    start_date : date
        When the resource is needed from.
    end_date : date
        When the resource is needed until.
    status : RequisitionStatus
        Current workflow status of the requisition.
    approver_user_id : int or None
        Foreign key to :class:`User` — who approved or rejected the
        requisition (set after PENDING_REVIEW).
    rejection_reason : str or None
        If rejected, explains why the requisition was not approved.
    notes : str or None
        Additional context or justification for the requisition.
    created_at : datetime
        Timestamp when the requisition was created.
    updated_at : datetime
        Timestamp when the requisition was last modified.
    """
    __tablename__ = "resource_requisition_requests"

    id = Column(Uuid, primary_key=True, default=uuid4)
    portfolio_node_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    target_resource_id = Column(
        Uuid,
        ForeignKey("resource_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    required_skill_id = Column(
        Integer,
        ForeignKey("skill_definitions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    min_proficiency = Column(
        SAEnum(ProficiencyLevel),
        default=ProficiencyLevel.NOVICE,
        nullable=False,
    )
    requested_hours = Column(Float, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(
        SAEnum(RequisitionStatus),
        default=RequisitionStatus.PENDING_REVIEW,
        nullable=False,
    )
    approver_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    rejection_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship("UniversalBreakdownNode")
    requested_by = relationship("User", foreign_keys=[requested_by_user_id], backref="requisitions_requested")
    target_resource = relationship(
        "ResourceNode",
        foreign_keys=[target_resource_id],
        backref="requisitions",
    )
    required_skill = relationship("SkillDefinition", backref="requisitions")
    approver = relationship("User", foreign_keys=[approver_user_id])


# ============================================================================
# User model with ABAC clearance fields
# ============================================================================

class User(Base):
    """Application user account with authentication and security clearance.

    This model represents a human user of the system.  Each user has a role
    that determines their administrative permissions (RBAC) and a security
    clearance level that determines what classified data they can access (ABAC).

    Authentication
    ~~~~~~~~~~~~~~

    Users authenticate via username and password.  Passwords are hashed using
    bcrypt and never stored in plaintext.  Upon successful authentication, a
    JWT (JSON Web Token) is issued that the client includes with subsequent
    API requests.

    Role-Based Access Control (RBAC)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    The ``role`` field determines what actions a user can perform:

    - **Admin** — Full system access, including user management.
    - **Manager** — Can create and manage portfolios and projects.
    - **Member** — Can work on assigned tasks and update progress.
    - **Viewer** — Read-only access to cleared data.

    Attribute-Based Access Control (ABAC)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    The ``clearance_level`` and ``caveats`` fields determine what data a user
    can see.  A user can access a node only if:

    1. Their clearance level >= the node's security classification.
    2. All of the node's caveats are present in the user's caveats list.

    For example, a user with SECRET clearance and ``['UK_EYES_ONLY']`` caveat
    can access a SECRET node with caveat ``['UK_EYES_ONLY']``, but cannot
    access a TOP_SECRET node or a SECRET node with caveat ``['NOFORN']``.

    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    username : str
        Unique login name (3-50 characters).
    email : str
        Unique email address used for identification.
    hashed_password : str
        Bcrypt-hashed password — never stored in plaintext.
    full_name : str or None
        Human-readable full name for display purposes.
    role : UserRole
        The user's application role (Admin, Manager, Member, Viewer).
    is_active : bool
        Whether the user account is active.  Inactive accounts cannot log in.
    clearance_level : SecurityClassification
        The user's security clearance level for ABAC data access.
    caveats : list of str or None
        Security caveats (e.g., ``['UK_EYES_ONLY', 'NOFORN']``) required
        to access compartmented data.
    created_at : datetime
        Timestamp when the user account was created.
    updated_at : datetime
        Timestamp when the user account was last modified.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(SAEnum(UserRole), default=UserRole.MEMBER, nullable=False)
    is_active = Column(Boolean, default=True)

    # ABAC clearance fields
    clearance_level = Column(
        SAEnum(SecurityClassification),
        default=SecurityClassification.OFFICIAL,
        nullable=False,
    )
    caveats = Column(SQLiteArray, nullable=True)

    # Export control — citizenship and legal entity
    primary_citizenship = Column(String(2), nullable=True)
    dual_citizenships = Column(SQLiteArray, nullable=True)
    employer_legal_entity = Column(String(200), nullable=True)

    # Boundary tenant scoping — subcontractor isolation
    is_subcontractor_user = Column(Boolean, default=False, nullable=False)
    """Whether this user is an external tier-1/tier-2 subcontractor.

    Subcontractor users are strictly constrained: they can only view and
    mutate tasks where the node matches an explicitly delegated boundary
    node or where the vendor CAGE code matches their assigned organisation.
    All parent programme hierarchies, sibling work packages, and prime EVM
    cost rates are masked.
    """
    assigned_vendor_cage = Column(String(32), nullable=True)
    """NATO/CAGE code of the vendor organisation this user belongs to.

    Used by the supplier portal ABAC filter to restrict visible tasks
    to only those assigned to the user's vendor CAGE code.
    """

    # PKI / X.509 certificate binding
    pki_dn = Column(String(512), nullable=True)
    """X.509 Distinguished Name of the user's PKI smart-card certificate.

    Used for certificate-based authentication and audit trail linkage.
    Example: ``CN=James Smith/O=Ministry of Defence/C=GB``.
    """

    # Personnel clearance lifecycle tracking
    clearance_type = Column(
        SAEnum(ClearanceType),
        nullable=True,
    )
    """The type of personnel security clearance held by this user.

    In UK defence, clearance types represent progressively deeper vetting:

    - **BPSS** (Baseline Personnel Security Standard) — Basic identity and
      employment history check.  Sufficient for OFFICIAL data.
    - **SC** (Security Check) — Enhanced vetting including 3-year history,
      financial standing, and foreign connections.  Required for SECRET data.
    - **DV** (Developed Vetting) — Full life examination, interviews, and
      ongoing monitoring.  Required for TOP_SECRET data.
    - **NATO_SECRET** — NATO-equivalent clearance for multinational programmes.

    The clearance type is distinct from clearance_level: a user may hold
    SC clearance type but be assigned to work at OFFICIAL classification
    on a particular programme.
    """
    clearance_expiry_date = Column(
        Date,
        nullable=True,
        index=True,
    )
    """The date when this user's personnel clearance expires.

    Personnel clearances are not perpetual — they require periodic
    re-vetting.  If a user's clearance expires while they are assigned
    to a classified task, the clash daemon flags a CLEARANCE_EXPIRY_COLLISION
    and the user can no longer access classified data until re-vetted.

    The clash daemon cross-references this field against task forecast
    finish dates to proactively identify clearance lapses before they
    occur.
    """

    # Line management — direct reporting relationship
    line_manager_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    """Foreign key to this user's direct line manager (another User).
    
    Forms a tree structure where traversing upward yields the chain of
    command and traversing downward yields direct and indirect reports.
    Root-level users (programme directors, senior leadership) have NULL.
    
    Note: This is a convenience denormalisation of LineManagementLink.
    The canonical source of truth is the LineManagementLink table, but
    this column enables fast single-query lookups for the direct manager.
    """

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)


# ============================================================================
# User Display Settings — Server-side profile persistence
# ============================================================================

class UserDisplaySettings(Base):
    """Server-side display profile for SCIF hot-desking environments.

    Why server-side persistence?
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    In classified operational environments (SCIFs), workstations are wiped
    after each use to prevent data leakage.  This means browser storage
    (localStorage, sessionStorage, cookies) cannot be used to persist user
    preferences.  Instead, display settings are stored in PostgreSQL and
    fetched via the API on each login.

    This supports "hot-desking" — where any user can sit at any terminal
    and immediately have their personalised display settings applied.

    What is stored?
    ~~~~~~~~~~~~~~~

    - **Density** — How compact or spacious the data grid rows are.
    - **Scale factor** — Overall UI zoom level (0.80x to 1.50x).
    - **Row height** — Explicit pixel height for grid rows.
    - **Theme** — Visual theme (dark, light, high-contrast, projector).
    - **Color accessibility** — Palette adjusted for color vision deficiency.
    - **View state overrides** — Arbitrary JSON for column widths, hidden
      columns, split-pane ratios, and other UI state.

    Usage
    ~~~~~

    On login, the frontend calls ``GET /api/users/me/display-settings``.
    If no profile exists, a default one is auto-created.  The user can
    update their profile at any time via ``PUT`` with a partial payload
    (only the fields they want to change).

    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    user_id : int
        Foreign key to :class:`User.id` — one profile per user.
    profile_name : str
        Human-readable name for the profile (e.g., 'DEFAULT', 'LAPTOP_1080P').
    is_active_default : bool
        Whether this is the user's active default profile.
    density : Density
        Row density preset (ULTRA_DENSE, BALANCED, COMFORT).
    scale_factor : float
        Overall UI zoom factor (0.80 to 1.50).
    row_height_px : int
        Explicit row height in pixels (20 to 100).
    theme : Theme
        Visual theme (SCIF_DARK, HIGH_CONTRAST_DARK, BALANCED_LIGHT, PROJECTOR).
    color_accessibility : ColorAccessibility
        Color palette for color vision deficiency.
    view_state_overrides : dict or None
        Arbitrary JSON for custom UI state (column widths, hidden columns, etc.).
    created_at : datetime
        Timestamp when the profile was created.
    updated_at : datetime
        Timestamp when the profile was last modified.
    """
    __tablename__ = "user_display_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    profile_name = Column(String(50), default="DEFAULT", nullable=False)
    is_active_default = Column(Boolean, default=True, nullable=False)

    # Density & scaling
    density = Column(SAEnum(Density), default=Density.BALANCED, nullable=False)
    scale_factor = Column(Float, default=1.0, nullable=False)
    row_height_px = Column(Integer, default=36, nullable=False)

    # Visual theme
    theme = Column(SAEnum(Theme), default=Theme.SCIF_DARK, nullable=False)
    color_accessibility = Column(
        SAEnum(ColorAccessibility),
        default=ColorAccessibility.STANDARD_RAG,
        nullable=False,
    )

    # Custom view state
    view_state_overrides = Column(JSONB, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    user = relationship("User", backref="display_settings")

    __table_args__ = (
        Index("ix_display_settings_user", "user_id"),
    )


# ============================================================================
# Universal Breakdown Structure — Abstract Base
# ============================================================================


class DALSILLevel(str, enum.Enum):
    """Design Assurance Level (DAL) and Safety Integrity Level (SIL) ratings.

    These levels define the safety criticality of a software/hardware
    component in defence systems.  DAL levels follow DO-178C (aviation)
    and SIL levels follow ISO 26262 (automotive/embedded).

    Why track DAL/SIL?
    ~~~~~~~~~~~~~~~~~~

    In defence programme management, the safety criticality of each
    work package determines:

    - **Verification rigor** — Higher DAL/SIL requires more extensive
      testing, code coverage, and independent verification.
    - **Signoff authority** — DAL_A and DAL_B items require two-man
      rule: the person completing the task cannot be the same as the
      primary author.
    - **Concession handling** — Open engineering concessions on high-DAL
      items block task completion until resolved.
    - **Safety vector analysis** — Schedule slippage on high-DAL items
      cascades risk to downstream contractual milestones.

    Values
    ------

    DAL_A
        Catastrophic failure condition.  Results in loss of aircraft
        and/or multiple fatalities.  Requires the highest level of
        verification and independent assurance.

    DAL_B
        Hazardous failure condition.  Results in severe injuries or
        serious damage to the system.  Requires extensive verification.

    DAL_C
        Major failure condition.  Results in reduced crew ability to
        deal with unusual operating conditions.

    DAL_D
        Minor failure condition.  Results in reduced crew efficiency
        but no safety hazard.

    DAL_E
        No safety impact.  Failure does not affect flight safety.

    SIL_1
        Lowest automotive safety integrity level.  Minimal safety
        requirements.

    SIL_2
        Moderate safety integrity level.  Standard safety requirements.

    SIL_3
        High safety integrity level.  Extensive verification required.
        Treated as high-DAL for signoff gate purposes.

    SIL_4
        Highest automotive safety integrity level.  Maximum safety
        requirements.  Treated as high-DAL for signoff gate purposes.

    NON_SAFETY
        Not a safety-critical item.  Standard engineering processes
        apply without additional safety gates.
    """
    DAL_A = "DAL_A"
    DAL_B = "DAL_B"
    DAL_C = "DAL_C"
    DAL_D = "DAL_D"
    DAL_E = "DAL_E"
    SIL_1 = "SIL_1"
    SIL_2 = "SIL_2"
    SIL_3 = "SIL_3"
    SIL_4 = "SIL_4"
    NON_SAFETY = "NON_SAFETY"


class EngineeringBaselineTier(str, enum.Enum):
    """Engineering baseline milestone tiers for configuration control.

    Defence programmes progress through formal baseline milestones
    that lock the requirements, design, and product configuration.
    Changes to baselined items require formal Configuration Control
    Board (CCB) approval.

    Values
    ------

    NONE
        Not yet baselined.  Requirements and design are still evolving.

    FBL_SRR
        Functional Baseline / System Requirements Review.  The initial
        baseline established after system requirements are frozen.
        Defines the system's functional performance parameters.

    ABL_PDR
        Allocated Baseline / Preliminary Design Review.  Costs and
        schedules are allocated to lower-level WBS elements.  The
        preliminary design is reviewed and approved.

    PBL_CDR
        Product Baseline / Critical Design Review.  The final baseline
        before production.  All design details are frozen and any
        further changes require formal CCB approval.
    """
    NONE = "NONE"
    FBL_SRR = "FBL_SRR"
    ABL_PDR = "ABL_PDR"
    PBL_CDR = "PBL_CDR"


class UniversalBreakdownNode(Base):
    """Abstract base for the unified polymorphic tree (WBS / RBS / LBS).

    This is the core data structure of the entire application.  Instead of
    maintaining separate tables for portfolios, projects, tasks, milestones,
    resources, and locations, all hierarchical data is stored in a single
    polymorphic tree using SQLAlchemy's joined-table inheritance.

    Why a unified tree?
    ~~~~~~~~~~~~~~~~~~~

    Defence programme management requires viewing work, resources, and
    locations as interconnected hierarchies.  A unified tree allows:

    - **Cross-referencing** — A task (WBS) can reference a resource (RBS)
      and a location (LBS) without complex join tables.
    - **Consistent security** — Every node, regardless of type, carries
      the same security classification and caveat fields.
    - **Efficient queries** — PostgreSQL's ltree extension enables finding
      all descendants of any node in a single indexed query.
    - **Simplified frontend** — The UI renders all three tree types using
      the same tree-view component, reducing code duplication.

    How ltree works
    ~~~~~~~~~~~~~~~

    Each node stores its full path from the root as a dotted string in the
    ``path`` column.  For example::

        Root portfolio:       path = '1'
        Child project:        path = '1.2'
        Grandchild task:      path = '1.2.3'

    A query using ``path <@ '1'`` returns all nodes under root '1',
    regardless of depth.  The GiST index on the path column makes this
    extremely fast even for trees with millions of nodes.

    Security model
    ~~~~~~~~~~~~~~

    Every node carries:

    - ``security_classification`` — The classification level (OFFICIAL to
      TOP_SECRET).  Users must have equal or higher clearance to access.
    - ``caveats`` — Additional compartmentalisation markers (e.g.,
      ``['UK_EYES_ONLY']``).  Users must have all of a node's caveats.
    - ``odac_permissions`` — Owner-Delivered Access Control dictionary
      for fine-grained permissions beyond clearance.

    Audit trail
    ~~~~~~~~~~~

    Every mutation (insert, update, delete, reparent) is automatically
    logged in the :class:`ForensicAuditLog` table with SHA-256 chained
    hashing, creating a tamper-evident audit trail.

    Subclasses
    ~~~~~~~~~~

    Three concrete subclasses inherit from this base:

    - :class:`PortfolioNode` — WBS nodes for work packages and projects.
    - :class:`ResourceNode` — RBS nodes for people, facilities, assets.
    - :class:`LocationNode` — LBS nodes for physical locations.

    Attributes
    ----------
    id : UUID
        Universally unique identifier (primary key).
    parent_id : UUID or None
        Self-referencing foreign key to the parent node.  Root nodes
        have ``parent_id = None``.
    node_class : str
        Discriminator column for SQLAlchemy polymorphic mapping.
        Stores the concrete subclass name (e.g., 'PortfolioNode').
    tree_type : TreeType
        The breakdown structure type: WBS, RBS, or LBS.
    code : str
        Short alphanumeric code (e.g., 'WP-101', 'LAB-RF1') used as a
        human-readable identifier in reports and schedules.
    name : str
        Human-readable name of the node.
    path : str (ltree)
        Hierarchical path string (e.g., '1.2.3') used for fast
        ancestor/descendant queries via PostgreSQL ltree operators.
    security_classification : SecurityClassification
        The node's security classification level.
    caveats : list of str or None
        Security caveats (e.g., ``['UK_EYES_ONLY', 'NOFORN']``).
    odac_permissions : dict or None
        JSONB dictionary for Owner-Delivered Access Control permissions.
    custom_attributes : dict or None
        JSONB dictionary for arbitrary extension data (e.g., CPM schedule
        metrics, hour logs, or frontend-specific state).
    is_active : bool
        Whether the node is active.  Inactive nodes are hidden from queries.
    created_at : datetime
        Timestamp when the node was created.
    updated_at : datetime
        Timestamp when the node was last modified.
    parent : UniversalBreakdownNode or None
        Relationship to the parent node.
    children : list of UniversalBreakdownNode
        Relationship to child nodes (cascade delete enabled).
    """
    __tablename__ = "universal_breakdown_nodes"

    __mapper_args__ = {
        "polymorphic_on": "node_class",
        "with_polymorphic": "*",
        "version_id_col": col_expr("version_id"),
    }

    # --- Core identity ---
    id = Column(Uuid, primary_key=True, default=uuid4)
    version_id = Column(Integer, default=1, nullable=False)
    """Optimistic concurrency version counter.
    
    SQLAlchemy automatically increments this column on every UPDATE.
    If two sessions modify the same row concurrently, the session that
    commits second will receive a StaleDataError because its expected
    version_id no longer matches the database value.
    """
    parent_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="CASCADE"),
        nullable=True,
    )
    node_class = Column(String(50), nullable=False)

    # --- Tree metadata ---
    tree_type = Column(SAEnum(TreeType), nullable=False)
    code = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)

    # --- ltree path column with GiST index ---
    path = Column(Ltree, nullable=False)

    # --- Security & access control ---
    security_classification = Column(
        SAEnum(SecurityClassification),
        default=SecurityClassification.OFFICIAL,
        nullable=False,
    )
    caveats = Column(SQLiteArray, nullable=True)
    odac_permissions = Column(JSONB, nullable=True)

    # --- Export control attributes ---
    export_control_regime = Column(
        SAEnum(ExportControlRegime),
        default=ExportControlRegime.NOT_CONTROLLED,
        nullable=False,
    )
    eccn_or_usml_category = Column(String(100), nullable=True)
    authorized_nationalities = Column(SQLiteArray, nullable=True)
    taa_mla_reference = Column(String(200), nullable=True)

    # --- Sandbox branching ---
    is_sandbox_branch = Column(Boolean, default=False, nullable=False, index=True)
    sandbox_scenario_id = Column(
        Uuid,
        nullable=True,
    )
    origin_node_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Extensibility ---
    custom_attributes = Column(JSONB, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # --- Systems Engineering Safety Governance ---
    dal_sil_level = Column(
        SAEnum(DALSILLevel),
        default=DALSILLevel.NON_SAFETY,
        nullable=False,
    )
    """Design Assurance Level (DAL) or Safety Integrity Level (SIL) for this node.

    DAL levels (A through E) apply to aviation software per DO-178C, where
    DAL_A represents the highest safety criticality (catastrophic failure)
    and DAL_E represents no safety impact. SIL levels (1 through 4) apply
    to automotive/embedded systems per ISO 26262, where SIL_4 is the
    highest safety integrity requirement.

    High-DAL nodes (DAL_A, DAL_B, SIL_3, SIL_4) trigger additional
    signoff gates, two-man rule enforcement, and safety vector analysis.
    """

    engineering_baseline_tier = Column(
        SAEnum(EngineeringBaselineTier),
        default=EngineeringBaselineTier.NONE,
        nullable=False,
    )
    """The engineering baseline tier this node belongs to.

    Defence programmes progress through formal baseline milestones:

    - **FBL/SRR** — Functional Baseline / System Requirements Review.
      The initial baseline established after requirements are frozen.
    - **ABL/PDR** — Allocated Baseline / Preliminary Design Review.
      Costs and schedules are allocated to lower-level WBS elements.
    - **PBL/CDR** — Product Baseline / Critical Design Review.
      The final baseline before production; changes require formal
      Configuration Control Board (CCB) approval.

    Changes to baselined nodes trigger Baseline Change Request (BCR)
    workflows and are tracked in the audit trail.
    """

    linked_requirements_manifest = Column(JSONB, nullable=True)
    """Array of external requirements management identifiers.

    Links this node to traceability items in tools like DOORS, DOORS
    Next, or SysML-based requirements management systems.  Each entry
    is a dictionary containing the tool identifier and a human-readable
    reference, e.g.:

    .. code-block:: json

        [
            {"tool": "DOORS", "id": "REQ-AVIONICS-042", "title": "RF Interference Detection"},
            {"tool": "SysML", "id": "SYS-001.003", "title": "Thermal Management"}
        ]

    This enables bidirectional traceability from requirements through
    design, implementation, and verification test cases.
    """

    # --- Timestamps ---
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # --- Relationships ---
    parent = relationship(
        "UniversalBreakdownNode",
        remote_side=[id],
        back_populates="children",
        foreign_keys=[parent_id],
    )
    children = relationship(
        "UniversalBreakdownNode",
        back_populates="parent",
        cascade="all, delete-orphan",
        foreign_keys=[parent_id],
    )
    origin_node = relationship(
        "UniversalBreakdownNode",
        remote_side=[id],
        foreign_keys=[origin_node_id],
        overlaps="sandbox_origin",
    )
    sandbox_scenario = relationship(
        "SandboxScenario",
        back_populates="sandbox_nodes",
        overlaps="root_portfolio_node",
    )

    # --- GiST index on ltree path (created at DDL time) ---
    __table_args__ = (
        Index("ix_ubn_path_gist", "path", postgresql_using="gist"),
        Index("ix_ubn_sandbox_scenario", "sandbox_scenario_id"),
    )


# ============================================================================
# Joined-Table Subclasses
# ============================================================================

class EVMTechnique(str, enum.Enum):
    """ANSI/EIA-748 Earned Value Measurement Techniques.

    These techniques define how Earned Value (EV) is objectively calculated
    for a work package, replacing unverified percentage estimates with
    formal measurement rules recognised by defence contracting standards.

    Each technique is appropriate for different types of work:

    - **PERCENT_COMPLETE** — General purpose; EV = BAC × (percent_complete / 100).
      Suitable for design, engineering, and management tasks where progress
      can be reasonably estimated.

    - **ZERO_100** — All-or-nothing; EV = 0 until the task is verified
      complete, then EV = BAC.  Suitable for discrete deliverables like
      reports, drawings, or test certificates.

    - **FIFTY_FIFTY** — Two-point; EV = 50% of BAC when work starts,
      EV = 100% of BAC when work finishes.  Suitable for short-duration
      tasks where detailed progress tracking is not cost-effective.

    - **MILESTONE_WEIGHTS** — Multi-point; EV = BAC × sum of verified
      milestone weight fractions.  Each milestone step has a weight that
      sums to 1.0.  Suitable for complex tasks with clearly defined
      intermediate checkpoints (PDR, CDR, TRR, etc.).

    - **LEVEL_OF_EFFORT** — Supportive; EV automatically equals PV,
      enforcing zero schedule variance.  Suitable for ongoing support
      activities (security, facility maintenance, programme management)
      that span the entire project duration.

    References
    ~~~~~~~~~~

    - ANSI/EIA-748B: Earned Value Management Systems
    - DoD 5000.02-M: Defense Acquisition Program Management
    """
    PERCENT_COMPLETE = "PERCENT_COMPLETE"
    ZERO_100 = "ZERO_100"
    FIFTY_FIFTY = "FIFTY_FIFTY"
    MILESTONE_WEIGHTS = "MILESTONE_WEIGHTS"
    LEVEL_OF_EFFORT = "LEVEL_OF_EFFORT"


class PortfolioNode(UniversalBreakdownNode):
    """WBS node representing a portfolio, programme, or project work package.

    This is the most commonly used node type.  It represents any element
    in the Work Breakdown Structure — from the top-level portfolio down
    to individual tasks and milestones.

    Scheduling
    ~~~~~~~~~~

    Each PortfolioNode can have planned and actual dates, allowing the
    system to track schedule performance.  The CPM (Critical Path Method)
    engine uses these dates along with :class:`DependencyLink` records
    to compute early/late start/finish times and identify the critical path.

    Earned Value Management (EVM)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Formal ANSI/EIA-748 EVM fields support objective cost-performance
    tracking.  The ``evm_technique`` field determines how Earned Value
    is calculated — replacing unverified percentage estimates with
    formal measurement rules.

    Core EVM fields:

    - **BAC (Budget at Completion)** — The total planned budget for this
      work package.  This is the baseline against which performance is
      measured.

    - **PV (Planned Value)** — The budgeted cost of scheduled work at
      the current reporting date.  Represents how much work *should*
      have been completed by now.

    - **EV (Earned Value)** — The budgeted cost of work *actually*
      performed.  Calculated objectively using the assigned EVM technique
      rather than relying on subjective percentage estimates.

    - **AC (Actual Cost)** — The actual cost incurred to perform the
      work.  Captured from timesheets, invoices, and cost ledgers.

    Derived variances and indices:

    - **CV (Cost Variance)** = EV - AC  (positive = under budget)
    - **SV (Schedule Variance)** = EV - PV  (positive = ahead of schedule)
    - **CPI (Cost Performance Index)** = EV / AC  (>1.0 = under budget)
    - **SPI (Schedule Performance Index)** = EV / PV  (>1.0 = ahead of schedule)
    - **EAC (Estimate at Completion)** = BAC / CPI  (forecasted total cost)

    EVM Rollup
    ~~~~~~~~~~

    PV, EV, and AC values roll up recursively through the ltree hierarchy
    to derive Control Account, Project, and Programme earned value metrics.
    This enables S-Curve charting at any level of the WBS.

    Milestone Weights
    ~~~~~~~~~~~~~~~~~

    When ``evm_technique`` is ``MILESTONE_WEIGHTS``, the node's EV is
    calculated from :class:`MilestoneWeightStep` records.  Each step
    represents a verified checkpoint (e.g., 'PDR Complete') with an
    associated weight fraction.  The sum of all weights must equal 1.000.

    Dependencies
    ~~~~~~~~~~~~

    PortfolioNodes are linked by :class:`DependencyLink` records that define
    precedence relationships (FS, SS, FF, SF) with optional lag/lead days.
    These dependencies form the basis of the CPM schedule calculation.

    Resource Assignments
    ~~~~~~~~~~~~~~~~~~~~

    Resources are assigned to PortfolioNodes via :class:`ResourceAssignment`
    records, which capture the allocation percentage, planned hours, and
    a snapshot of the resource's rate at assignment time.

    Blockers
    ~~~~~~~~

    Progress impediments are tracked via :class:`NodeBlocker` records,
    which categorise the blocker type, severity, and estimated impact.

    Attributes
    ----------
    delivery_mode : DeliveryMode or None
        The project delivery methodology (WATERFALL, AGILE, HYBRID).
    planned_start_date : datetime or None
        Scheduled start date for this work package.
    planned_end_date : datetime or None
        Scheduled end date for this work package.
    actual_start_date : datetime or None
        Date when work actually began.
    actual_end_date : datetime or None
        Date when work was actually completed.
    percent_complete : float
        Progress percentage (0.0 to 100.0).  Used for burn-down charts
        and as input to PERCENT_COMPLETE EVM technique.
    evm_technique : EVMTechnique
        The ANSI/EIA-748 technique used to calculate Earned Value
        objectively for this work package.
    bac_cost : Decimal or None
        Budget at Completion — the total planned budget for this node.
    planned_value : Decimal or None
        Planned Value (PV) — budgeted cost of scheduled work.
    earned_value : Decimal or None
        Earned Value (EV) — budgeted cost of work performed, calculated
        using the assigned EVM technique.
    actual_cost : Decimal or None
        Actual Cost (AC) — actual cost of work performed.
    pv : float or None
        Legacy Planned Value field (retained for backward compatibility).
    ev : float or None
        Legacy Earned Value field (retained for backward compatibility).
    ac : float or None
        Legacy Actual Cost field (retained for backward compatibility).
    requires_vv_signoff : bool
        If True, the node cannot reach 100% complete until all mandatory
        VerificationTestCase items are PASSED or WAIVED.
    calendar_id : UUID or None
        Foreign key to :class:`WorkingCalendar` — the working calendar
        governing this node's schedule.  Determines which holidays and
        non-working days the CPM engine respects when calculating dates.
        If None, the system falls back to the default calendar.
    currency_code : str
        The base currency for this node's financial data (3-letter ISO
        code, e.g., 'GBP', 'USD', 'EUR').  Used for multi-currency
        programmes where different work packages are priced in different
        currencies.
    contract_exchange_rate_id : UUID or None
        Foreign key to :class:`CurrencyExchangeRate` — the exchange rate
        record used to convert this node's currency into the project's
        base currency.  For fixed-peg contracts, this locks the rate
        at contract signing so financial reporting is deterministic.
    is_relative_t0_mode : bool
        If True, this node's schedule is expressed as integer working-day
        offsets from a T0 anchor rather than absolute calendar dates.
        Used for pre-contract planning when the ATP date is unknown.
    relative_start_day_offset : int or None
        Working-day offset from T0 for the planned start date.
        E.g., 0 means the node starts on T0, 45 means 45 working days
        after T0.
    relative_finish_day_offset : int or None
        Working-day offset from T0 for the planned finish date.
    atp_anchor_date : date or None
        Authority to Proceed anchor calendar date.  When this is set,
        all relative offsets are converted to absolute calendar dates
        using the project's assigned working calendar.
    """
    __tablename__ = "portfolio_nodes"

    id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )

    delivery_mode = Column(SAEnum(DeliveryMode), nullable=True)
    planned_start_date = Column(DateTime, nullable=True)
    planned_end_date = Column(DateTime, nullable=True)
    actual_start_date = Column(DateTime, nullable=True)
    actual_end_date = Column(DateTime, nullable=True)
    percent_complete = Column(Float, default=0.0, nullable=False)

    # Legacy Earned Value Management fields (retained for backward compatibility)
    pv = Column(Float, nullable=True)   # Planned Value
    ev = Column(Float, nullable=True)   # Earned Value
    ac = Column(Float, nullable=True)   # Actual Cost

    # V&V completion gate — if True, the node cannot reach 100% complete
    # until all mandatory VerificationTestCase items are PASSED or WAIVED.
    requires_vv_signoff = Column(Boolean, default=False, nullable=False)

    # --- ANSI/EIA-748 Formal EVM fields ---
    evm_technique = Column(
        SAEnum(EVMTechnique),
        default=EVMTechnique.PERCENT_COMPLETE,
        nullable=False,
    )
    bac_cost = Column(Numeric(14, 2), nullable=True)
    planned_value = Column(Numeric(14, 2), nullable=True)
    earned_value = Column(Numeric(14, 2), nullable=True)
    actual_cost = Column(Numeric(14, 2), nullable=True)

    # --- Calendar binding ---
    calendar_id = Column(
        Uuid,
        ForeignKey("working_calendars.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Currency & Exchange Rate binding ---
    currency_code = Column(
        String(3),
        nullable=False,
        default="GBP",
    )
    contract_exchange_rate_id = Column(
        Uuid,
        ForeignKey("currency_exchange_rates.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Relative T0 Scheduling ---
    # When is_relative_t0_mode is True, the node's schedule is expressed
    # as integer working-day offsets from a T0 anchor rather than absolute
    # calendar dates.  This is useful for pre-contract planning when the
    # Authority to Proceed (ATP) date is not yet known.
    is_relative_t0_mode = Column(
        Boolean,
        default=False,
        nullable=False,
    )
    """If True, schedule uses integer day offsets from T0 anchor."""

    relative_start_day_offset = Column(
        Integer,
        nullable=True,
    )
    """Working-day offset from T0 for planned start (e.g. 0, 45)."""

    relative_finish_day_offset = Column(
        Integer,
        nullable=True,
    )
    """Working-day offset from T0 for planned finish."""

    atp_anchor_date = Column(
        Date,
        nullable=True,
    )
    """Authority to Proceed anchor calendar date.  When set, relative
    offsets are converted to absolute dates using the project calendar."""

    # --- Cost distribution profile ---
    cost_distribution_profile = Column(
        String(30),
        nullable=True,
    )
    """Non-linear cost distribution method for time-phased spending.

    When set, the node's BAC is spread across its planned duration using
    the specified statistical curve instead of flat linear allocation.
    Valid values correspond to :class:`app.services.costing.CostSpreadMethod`:

    - ``LINEAR`` — Flat rate per day (default when column is NULL).
    - ``BETA_DISTRIBUTION`` — NASA/DoD S-curve.
    - ``WEIBULL_CURVE`` — Ramp-up with rapid tail-off.
    - ``RAYLEIGH`` — Early-peaked for high-concurrency phases.

    The ``shape_factor`` parameter defaults to ``2.0`` and can be stored
    in ``custom_attributes`` as ``cost_shape_factor``.
    """

    # Relationships
    milestone_weight_steps = relationship(
        "MilestoneWeightStep",
        back_populates="portfolio_node",
        cascade="all, delete-orphan",
    )

    __mapper_args__ = {
        "polymorphic_identity": "PortfolioNode",
    }


class ResourceNode(UniversalBreakdownNode):
    """RBS node representing a person, facility, or asset resource.

    This model represents any resource that can be assigned to a work package.
    Resources are organised in a Resource Breakdown Structure (RBS) hierarchy
    that mirrors how the organisation manages its resource pool.

    Resource Types
    ~~~~~~~~~~~~~~

    - **PERSON** — A human resource with a standard hourly rate.  Can be
      assigned to tasks with a specific allocation percentage.
    - **FACILITY** — A physical space (meeting room, laboratory, SCIF)
      that can be booked for a task.
    - **ASSET** — Equipment or tooling (test bench, vehicle, server)
      that can be allocated to a task.

    Generic Placeholders
    ~~~~~~~~~~~~~~~~~~~~

    A ResourceNode can be marked as a "generic placeholder" — a temporary
    resource used when the specific assignee is not yet known.  For example,
    a task might be assigned to "Test Engineer (TBC)" as a placeholder.
    Users can then "claim" these tasks from their Daily Cockpit, replacing
    the placeholder with their own resource.

    Location Tracking
    ~~~~~~~~~~~~~~~~~

    Resources can be associated with a physical location via
    ``current_location_id``, which points to a :class:`LocationNode`.
    This is useful for tracking where personnel or equipment are stationed.

    Attributes
    ----------
    resource_type : ResourceType
        The category of resource (PERSON, FACILITY, ASSET).
    standard_hourly_rate : float or None
        The resource's standard cost rate per hour, used for budget
        estimation when creating assignments.
    is_generic_placeholder : bool
        Whether this is a placeholder resource that can be claimed by
        users.  When True, tasks assigned to this resource appear in
        the "claimable tasks" list on the Daily Cockpit.
    current_location_id : UUID or None
        Foreign key to a :class:`LocationNode` indicating where this
        resource is currently stationed.
    calendar_id : UUID or None
        Foreign key to :class:`WorkingCalendar` — the working calendar
        governing this resource's availability.  Determines which days
        and hours the resource is available for assignment.
        If None, the system falls back to the default calendar.
    """
    __tablename__ = "resource_nodes"

    id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )

    resource_type = Column(SAEnum(ResourceType), nullable=False)
    standard_hourly_rate = Column(Float, nullable=True)
    is_generic_placeholder = Column(Boolean, default=False, nullable=False)
    current_location_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Calendar binding ---
    calendar_id = Column(
        Uuid,
        ForeignKey("working_calendars.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Hardware calibration tracking ---
    serial_number = Column(String(64), nullable=True, index=True)
    """Unique serial number for physical equipment assets.

    Indexed for fast lookup when verifying calibration status.
    Nullable because PERSON and FACILITY resources typically don't
    have serial numbers.
    """

    calibration_interval_days = Column(Integer, nullable=True)
    """Number of days between required calibration events.

    For example, 180 for semi-annual calibration or 365 for annual
    calibration.  Used to automatically calculate ``next_calibration_due``
    after each calibration event.
    """

    last_calibration_date = Column(Date, nullable=True)
    """The date when the equipment was last calibrated.

    Updated when a new calibration event is recorded via the
    recalibrate endpoint.  Used together with ``calibration_interval_days``
    to determine if the equipment is currently within its valid
    calibration window.
    """

    next_calibration_due = Column(Date, nullable=True)
    """The date by which the next calibration must be completed.

    Calculated as ``last_calibration_date + calibration_interval_days``.
    If a task's planned end date extends beyond this date, the CPM engine
    flags a calibration expiry clash.
    """

    calibration_certificate_vault_id = Column(
        Uuid,
        ForeignKey("document_artifacts.id", ondelete="SET NULL"),
        nullable=True,
    )
    """Foreign key to the latest calibration certificate in the artifact vault.

    Links to a :class:`DocumentArtifact` record containing the signed
    calibration report.  Allows auditors to trace the calibration
    chain of custody.
    """

    is_out_of_service = Column(Boolean, default=False, nullable=False)
    """Whether the resource is currently out of service for maintenance.

    When True, the resource cannot be assigned to new tasks and existing
    assignments are flagged.  Typically set automatically when a
    :class:`MaintenanceDowntimeWindow` is active.
    """

    __mapper_args__ = {
        "polymorphic_identity": "ResourceNode",
        "inherit_condition": id == UniversalBreakdownNode.id,
    }


class LocationNode(UniversalBreakdownNode):
    """LBS node representing a physical location in the hierarchy.

    This model represents physical locations organised in a Location
    Breakdown Structure (LBS).  Locations are hierarchical: a SITE
    contains FACILITIES, which contain ZONES, which contain ROOMS, etc.

    Why track locations?
    ~~~~~~~~~~~~~~~~~~~~

    In defence programme management, knowing where work takes place is
    critical for:

    - **Security** — SCIFs and TEMPEST-rated rooms have specific access
      controls and equipment restrictions.
    - **Resource planning** — Personnel must be assigned to locations
      that match their clearance level.
    - **Compliance** — Certain types of work can only be performed in
      accredited facilities.

    SCIF/TEMPEST Classification
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~

    A location can be flagged as a SCIF (Sensitive Compartmented Information
    Facility) or TEMPEST-rated room.  This affects:

    - What classified work can be performed there.
    - What equipment can be brought into the space.
    - Whether an escort is required for visitors.

    Attributes
    ----------
    tier : LocationTier
        The level in the location hierarchy (SITE, FACILITY, ZONE, ROOM,
        CONTAINER, SUB_CONTAINER).
    is_scif_or_tempest : bool
        Whether this location is a SCIF or TEMPEST-rated facility with
        special security requirements.
    escort_required : bool
        Whether visitors to this location require an escort.  Typically
        True for SCIFs and other high-security areas.
    """
    __tablename__ = "location_nodes"

    id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )

    tier = Column(SAEnum(LocationTier), nullable=False)
    is_scif_or_tempest = Column(Boolean, default=False, nullable=False)
    escort_required = Column(Boolean, default=False, nullable=False)

    # Chamber capabilities for high-demand physical resources (EMC chambers,
    # thermal vacuum rigs, etc.)
    chamber_capabilities = Column(
        JSONB,
        nullable=True,
    )
    """Environmental envelope of this chamber as a JSONB dictionary.

    Example payload for an EMC Anechoic Chamber:

    .. code-block:: json

        {
            "temp_min_c": -55,
            "temp_max_c": 125,
            "rf_shielding_db": 100,
            "max_power_kw": 45
        }

    Used by :func:`app.services.facility_telemetry.validate_chamber_feasibility`
    to gate reservations against task environmental requirements.
    """

    requires_warmup_cooldown_hours = Column(
        Float,
        default=2.0,
        nullable=False,
    )
    """Hours of thermal/RF buffer required before and after a test run.

    When a chamber reservation is created, this value is used to automatically
    insert buffer windows around the test run.  If two project reservations
    overlap within the cooldown window, a FACILITY_CONTRAVENTION clash is
    raised by the periodic sweep daemon.
    """

    calibration_expiry_date = Column(
        Date,
        nullable=True,
    )
    """Date when the chamber's calibration expires.

    If a reservation's ``reserved_end`` exceeds this date, the reservation
    is rejected by the calibration gate in
    :func:`app.services.facility_telemetry.validate_chamber_feasibility`.
    """

    __mapper_args__ = {
        "polymorphic_identity": "LocationNode",
    }


# ============================================================================
# ltree extension bootstrap
# ============================================================================

def _ensure_ltree_extension(target, connection, **kw):
    """Ensure the PostgreSQL ltree extension is available before creating the table.

    This listener fires when the ``universal_breakdown_nodes`` table is being
    created, ensuring the ``ltree`` extension is enabled first.

    The listener is registered lazily (inside a try/except) so that Sphinx
    autodoc can import this module without a database connection.

    On non-PostgreSQL dialects (e.g., SQLite for testing), the extension
    creation is silently skipped because ``CREATE EXTENSION`` is a
    PostgreSQL-only command.
    """
    # Skip on non-PostgreSQL dialects (e.g., SQLite for unit tests)
    if connection.dialect.name != "postgresql":
        return
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS ltree;"))


# Register the event listener only when the table is available (i.e., when
# a database connection exists).  During Sphinx autodoc, __table__ may not
# be bound yet, so we silently skip registration.
try:
    event.listens_for(
        UniversalBreakdownNode.__table__, "before_create", propagate=True
    )(_ensure_ltree_extension)
except AttributeError:
    # __table__ not yet available — happens during Sphinx autodoc
    # when no database connection is present.  The extension will be
    # created by init_db.py instead.
    pass


# ============================================================================
# Secondary Relational Entities
# ============================================================================

class DependencyLink(Base):
    """Precedence diagramming between PortfolioNode items.

    This model defines the scheduling dependencies between work packages
    in the Critical Path Method (CPM) schedule.  Each dependency link
    connects two PortfolioNodes: a predecessor that must reach a certain
    point before a successor can proceed.

    Dependency Types
    ~~~~~~~~~~~~~~~~

    Four standard dependency types are supported (same as MS Project and
    Primavera P6):

    - **FS (Finish-to-Start)** — Successor cannot start until predecessor
      finishes.  The most common type.
    - **SS (Start-to-Start)** — Successor cannot start until predecessor
      starts.  For tasks that should begin together.
    - **FF (Finish-to-Finish)** — Successor cannot finish until predecessor
      finishes.  For tasks that should end together.
    - **SF (Start-to-Finish)** — Successor cannot finish until predecessor
      starts.  Rarely used; for shift handover scenarios.

    Lag and Lead
    ~~~~~~~~~~~~

    The ``lag_days`` field allows fine-tuning the dependency:

    - **Positive lag** — A delay between predecessor and successor.
      Example: concrete must cure for 3 days before next phase (lag = 3).
    - **Negative lag (lead)** — The successor can start before the
      predecessor finishes.  Example: interior work can start 2 days
      before exterior is complete (lag = -2).

    Usage in CPM
    ~~~~~~~~~~~~

    The CPM engine (:mod:`app.services.cpm_engine`) builds a Directed
    Acyclic Graph (DAG) from PortfolioNodes and DependencyLinks, then
    performs forward and backward passes to compute schedule metrics.

    Attributes
    ----------
    id : UUID
        Unique identifier for this dependency link.
    predecessor_id : UUID
        Foreign key to the predecessor :class:`PortfolioNode`.
    successor_id : UUID
        Foreign key to the successor :class:`PortfolioNode`.
    dependency_type : DependencyType
        The type of dependency relationship (FS, SS, FF, SF).
    lag_days : int
        Number of days of lag (positive) or lead (negative) between
        the predecessor and successor.
    predecessor : PortfolioNode
        Relationship to the predecessor node.
    successor : PortfolioNode
        Relationship to the successor node.
    created_at : datetime
        Timestamp when this dependency was created.
    """
    __tablename__ = "dependency_links"

    __mapper_args__ = {
        "version_id_col": col_expr("version_id"),
    }

    id = Column(Uuid, primary_key=True, default=uuid4)
    version_id = Column(Integer, default=1, nullable=False)
    """Optimistic concurrency version counter for dependency links."""

    predecessor_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    successor_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    dependency_type = Column(SAEnum(DependencyType), nullable=False)
    lag_days = Column(Integer, default=0, nullable=False)

    # Relationships
    predecessor = relationship(
        "PortfolioNode",
        foreign_keys=[predecessor_id],
        backref="outgoing_dependencies",
    )
    successor = relationship(
        "PortfolioNode",
        foreign_keys=[successor_id],
        backref="incoming_dependencies",
    )

    created_at = Column(DateTime, default=_utc_now)

    __table_args__ = (
        Index("ix_dependency_predecessor", "predecessor_id"),
        Index("ix_dependency_successor", "successor_id"),
    )


class ResourceAssignment(Base):
    """Links a ResourceNode to a PortfolioNode with allocation details.

    This model represents the assignment of a resource (person, facility,
    or asset) to a work package.  It captures not only who is assigned
    to what, but also how much of their time is allocated and at what
    cost rate.

    Rate Snapshot
    ~~~~~~~~~~~~~

    The ``rate_snapshot`` field records the resource's hourly rate at the
    time of assignment.  This is critical for accurate cost tracking:
    if a resource's standard rate changes after an assignment is made,
    the historical cost of that assignment remains accurate because it
    uses the rate that was in effect at assignment time.

    Allocation Units
    ~~~~~~~~~~~~~~~~

    The ``allocated_units`` field represents the percentage of the
    resource's capacity assigned to this task:

    - **1.0** — Full-time equivalent (100% FTE).
    - **0.5** — Half-time (50% FTE).
    - **0.25** — Quarter-time (25% FTE).

    A resource can be assigned to multiple tasks simultaneously, as long
    as the total allocated units across all assignments does not exceed
    1.0 (though the system does not enforce this constraint automatically).

    Assignment Status
    ~~~~~~~~~~~~~~~~~

    - **CONFIRMED** — The assignment is firm and the resource's time is
      reserved.
    - **CLAIMED** — The resource was claimed from a generic placeholder
      and is pending final confirmation.
    - **REQUISITIONED** — The resource has been requested but not yet
      approved by the resource manager.

    Attributes
    ----------
    id : UUID
        Unique identifier for this assignment.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` (work package) this
        resource is assigned to.
    resource_node_id : UUID
        Foreign key to the :class:`ResourceNode` being assigned.
    allocated_units : float
        Fraction of the resource's capacity allocated (e.g., 1.0 = 100% FTE).
    planned_hours : float
        Total number of hours planned for this assignment.
    rate_snapshot : decimal
        The resource's hourly rate frozen at assignment time for accurate
        historical cost tracking.
    status : AssignmentStatus
        Current status of the assignment (CONFIRMED, CLAIMED, REQUISITIONED).
    portfolio_node : PortfolioNode
        Relationship to the assigned work package.
    resource_node : ResourceNode
        Relationship to the assigned resource.
    created_at : datetime
        Timestamp when this assignment was created.
    updated_at : datetime
        Timestamp when this assignment was last modified.
    """
    __tablename__ = "resource_assignments"

    __mapper_args__ = {
        "version_id_col": col_expr("version_id"),
    }

    id = Column(Uuid, primary_key=True, default=uuid4)
    version_id = Column(Integer, default=1, nullable=False)
    """Optimistic concurrency version counter for resource assignments."""

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    resource_node_id = Column(
        Uuid,
        ForeignKey("resource_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    allocated_units = Column(Float, nullable=False)
    planned_hours = Column(Float, nullable=False)
    rate_snapshot = Column(Numeric(12, 4), nullable=False)
    status = Column(SAEnum(AssignmentStatus), default=AssignmentStatus.CONFIRMED, nullable=False)

    # Relationships
    portfolio_node = relationship("PortfolioNode")
    resource_node = relationship("ResourceNode")

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    __table_args__ = (
        Index("ix_resource_assignment_portfolio", "portfolio_node_id"),
        Index("ix_resource_assignment_resource", "resource_node_id"),
    )


class NodeBlocker(Base):
    """Tracks impediments blocking progress on a PortfolioNode.

    This model records anything that is preventing a task from progressing.
    Blockers are a key input to programme health reporting: they help
    managers understand why tasks are delayed and what action is needed.

    Blocker Lifecycle
    ~~~~~~~~~~~~~~~~~

    1. **Created** — A team member reports a blocker via the Daily Cockpit
       or the WBS API.  The blocker is immediately visible to managers.
    2. **Tracked** — The blocker remains open (``resolved_at = None``) until
       the impediment is removed.
    3. **Resolved** — When the impediment is cleared, ``resolved_at`` is
       set to the current timestamp.  The blocker record is retained for
       historical analysis.

    Categories
    ~~~~~~~~~~

    Blockers are categorised to help identify systemic issues:

    - **DEPENDENCY_OVERDUE** — A predecessor task is late.
    - **RESOURCE_UNAVAILABLE** — The assigned resource is not available.
    - **CLEARANCE_HOLD** — A security clearance issue is blocking access.
    - **FACILITY_MAINTENANCE** — The required facility is unavailable.
    - **OPERATIONAL_IMPEDIMENT** — An operational constraint is in place.

    Severity Levels
    ~~~~~~~~~~~~~~~

    - **CRITICAL** — On the critical path; requires immediate senior
      management attention.
    - **MAJOR** — Significant delay; requires project manager attention.
    - **MINOR** — Limited impact; can be resolved through normal processes.

    Integration with Cockpit
    ~~~~~~~~~~~~~~~~~~~~~~~~

    The Daily Cockpit endpoint (``POST /cockpit/tasks/{id}/blocker``)
    atomically creates a NodeBlocker, updates the task's status, and
    records a ForensicAuditLog entry — all in a single transaction.

    Attributes
    ----------
    id : UUID
        Unique identifier for this blocker.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` that is blocked.
    category : BlockerCategory
        The type of impediment (DEPENDENCY_OVERDUE, RESOURCE_UNAVAILABLE,
        CLEARANCE_HOLD, FACILITY_MAINTENANCE, OPERATIONAL_IMPEDIMENT).
    severity : BlockerSeverity
        The impact level (CRITICAL, MAJOR, MINOR).
    impacted_hours : float
        Estimated number of hours of delay caused by this blocker.
    resolved_at : datetime or None
        Timestamp when the blocker was resolved.  None means the blocker
        is still active.
    portfolio_node : PortfolioNode
        Relationship to the blocked work package.
    created_at : datetime
        Timestamp when this blocker was reported.
    updated_at : datetime
        Timestamp when this blocker was last modified.
    """
    __tablename__ = "node_blockers"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    category = Column(SAEnum(BlockerCategory), nullable=False)
    severity = Column(SAEnum(BlockerSeverity), nullable=False)
    impacted_hours = Column(Float, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    # Relationships
    portfolio_node = relationship("PortfolioNode", backref="blockers")

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    __table_args__ = (
        Index("ix_node_blocker_portfolio", "portfolio_node_id"),
        Index("ix_node_blocker_resolved", "resolved_at"),
    )


# ============================================================================
# EVM Milestone Weight Steps
# ============================================================================

class MilestoneWeightStep(Base):
    """A weighted milestone checkpoint for MILESTONE_WEIGHTS EVM technique.

    When a PortfolioNode uses the ``MILESTONE_WEIGHTS`` EVM technique, its
    Earned Value is calculated from the sum of verified milestone weight
    fractions rather than from a subjective percentage complete estimate.

    How it works
    ~~~~~~~~~~~~

    1. The programme manager defines milestone steps for a task, each with
       a weight fraction (e.g., 'PDR Complete' = 0.300, 'CDR Complete' =
       0.400, 'TRR Complete' = 0.300).  The sum of all weights must equal
       1.000.

    2. As each milestone is reached, an authorised user verifies the step
       by setting ``is_verified_passed = True``.  The system records the
       verification timestamp and the verifying user.

    3. The EVM calculator computes:
       ``EV = BAC × Σ(weight_fraction of verified steps)``

    Example
    ~~~~~~~

    For a task with BAC = £100,000 and three milestone steps:

    .. code-block:: text

        Step              Weight  Verified  Earned
        PDR Complete      0.300   Yes       £30,000
        CDR Complete      0.400   No        £0
        TRR Complete      0.300   No        £0
        Total EV          1.000             £30,000

    This provides an objective, auditable measure of progress that cannot
    be manipulated by simply entering a higher percentage complete.

    Weight Validation
    ~~~~~~~~~~~~~~~~~

    The sum of all ``weight_fraction`` values for a given PortfolioNode
    must equal 1.000.  The EVM calculator validates this constraint before
    computing EV.

    Attributes
    ----------
    id : UUID
        Unique identifier for this milestone step.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` this step belongs to.
    step_name : str
        Human-readable name of the milestone (e.g., 'PDR Complete').
    weight_fraction : Decimal
        The weight of this step as a fraction of the total (0.000 to 1.000).
        All steps for a node must sum to 1.000.
    target_date : date or None
        Planned target date for this milestone checkpoint.
    is_verified_passed : bool
        Whether this milestone has been verified as complete.  Default False.
    verified_at : datetime or None
        Timestamp when the milestone was verified.
    verified_by_user_id : int or None
        Foreign key to :class:`User` — who verified this milestone.
    portfolio_node : PortfolioNode
        Relationship to the parent work package.
    verified_by : User
        Relationship to the verifying user.
    created_at : datetime
        Timestamp when this milestone step was created.
    updated_at : datetime
        Timestamp when this milestone step was last modified.
    """
    __tablename__ = "milestone_weight_steps"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_name = Column(String(200), nullable=False)
    weight_fraction = Column(Numeric(4, 3), nullable=False)
    target_date = Column(Date, nullable=True)
    is_verified_passed = Column(Boolean, default=False, nullable=False)
    verified_at = Column(DateTime, nullable=True)
    verified_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        back_populates="milestone_weight_steps",
    )
    verified_by = relationship(
        "User",
        foreign_keys=[verified_by_user_id],
    )

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    __table_args__ = (
        Index("ix_mws_portfolio_node", "portfolio_node_id"),
        Index("ix_mws_verified", "is_verified_passed"),
    )


# ============================================================================
# Supply Chain Procurement Tracking
# ============================================================================

class ProcurementLifecycleStage(str, enum.Enum):
    """Procurement lifecycle stages tracking a component from requisition to acceptance.

    These stages represent the typical defence procurement pipeline, from initial
    requirement identification through manufacturing, customs clearance, and final
    inspection acceptance.  Each stage transition triggers schedule re-evaluation
    since forecast delivery dates directly constrain CPM early-start gates.

    Stages
    ~~~~~~

    - **REQUISITION** — Initial requirement identified; sourcing strategy being
      developed.  No supplier engagement yet.

    - **RFQ_ISSUED** — Request for Quotation has been issued to potential
      suppliers.  Awaiting commercial proposals.

    - **PO_PLACED** — Purchase Order has been placed with the selected supplier.
      Manufacturing or procurement has commenced.

    - **IN_MANUFACTURE** — The supplier is actively manufacturing or assembling
      the component.  Progress updates may be available.

    - **CUSTOMS_TRANSIT** — The item has left the supplier and is in transit,
      potentially including customs clearance for controlled items.

    - **DELIVERED_STORES** — The item has arrived at the receiving facility and
      been logged into stores inventory.

    - **ACCEPTED_INSPECTED** — The item has passed incoming quality inspection
      and is available for use on the production line.

    Long-Lead Items
    ~~~~~~~~~~~~~~~

    Items flagged as ``is_long_lead_item`` are tracked separately in programme
    risk registers.  These are typically components with 6+ month lead times
    that can become critical path drivers if delivery is delayed.
    """
    REQUISITION = "REQUISITION"
    RFQ_ISSUED = "RFQ_ISSUED"
    PO_PLACED = "PO_PLACED"
    IN_MANUFACTURE = "IN_MANUFACTURE"
    CUSTOMS_TRANSIT = "CUSTOMS_TRANSIT"
    DELIVERED_STORES = "DELIVERED_STORES"
    ACCEPTED_INSPECTED = "ACCEPTED_INSPECTED"


class ProcurementItem(Base):
    """A procurement line item tracking a component through the supply chain.

    This model represents a single procured component — from an FPGA chip to
    a complete subsystem — tracked through the defence procurement lifecycle.
    Each item is linked to a NATO/CAGE supplier code and carries both contractual
    and forecast delivery dates.

    Why this matters for scheduling
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    In defence programmes, component delivery dates are hard constraints on
    the CPM schedule.  If an FPGA required for assembly doesn't arrive until
    March, the assembly task cannot start before March regardless of predecessor
    task completion.  The CPM forward pass evaluates all active
    :class:`TaskProcurementConstraint` records and raises the Early Start (ES)
    to the later of:

    1. The predecessor-driven ES from the normal CPM calculation.
    2. The forecast delivery date of any constrained parts.

    This ensures the schedule reflects real-world supply chain dependencies
    rather than assuming infinite component availability.

    Long-Lead Item Tracking
    ~~~~~~~~~~~~~~~~~~~~~~~

    Items flagged as ``is_long_lead_item`` (default True) are automatically
    included in programme risk registers.  These typically have 6+ month
    lead times and can become critical path drivers if delivery slips.

    Attributes
    ----------
    id : UUID
        Unique identifier for this procurement item.
    part_number : str
        Manufacturer or internal part number (e.g., 'FPGA-VIRTEX-ULTRASCALE').
    description : str
        Human-readable description of the component.
    supplier_cage_code : str
        NATO Commercial and Government Entity (CAGE) code identifying the
        supplier organisation.
    lifecycle_stage : ProcurementLifecycleStage
        Current stage in the procurement pipeline (REQUISITION through
        ACCEPTED_INSPECTED).
    purchase_order_reference : str or None
        External purchase order number for tracking with the supplier.
    contractual_delivery_date : date or None
        Contractually agreed delivery date.  Missing this date may trigger
        contractual penalties.
    forecast_delivery_date : date or None
        Current best-estimate delivery date, updated as the procurement
        progresses.  This is the date used by the CPM engine as a hard
        early-start constraint.
    actual_arrival_date : date or None
        The date the item actually arrived at the receiving facility.
    is_long_lead_item : bool
        Whether this item has a long lead time (6+ months) requiring
        special programme risk tracking.
    portfolio_node : PortfolioNode
        Relationship to the parent work package that ordered this item.
    constraints : list[TaskProcurementConstraint]
        Downstream tasks constrained by this procurement item's delivery.
    created_at : datetime
        Timestamp when this procurement item was registered.
    updated_at : datetime
        Timestamp when this item was last modified.
    """
    __tablename__ = "procurement_items"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    part_number = Column(String(100), nullable=False, index=True)
    description = Column(String(500), nullable=True)
    supplier_cage_code = Column(String(20), nullable=False)
    lifecycle_stage = Column(
        SAEnum(ProcurementLifecycleStage),
        default=ProcurementLifecycleStage.REQUISITION,
        nullable=False,
        index=True,
    )
    purchase_order_reference = Column(String(100), nullable=True)
    contractual_delivery_date = Column(Date, nullable=True)
    forecast_delivery_date = Column(Date, nullable=True, index=True)
    actual_arrival_date = Column(Date, nullable=True)
    is_long_lead_item = Column(Boolean, default=True, nullable=False)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )
    constraints = relationship(
        "TaskProcurementConstraint",
        back_populates="procurement_item",
        cascade="all, delete-orphan",
    )

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    __table_args__ = (
        Index("ix_procurement_part_number", "part_number"),
        Index("ix_procurement_stage", "lifecycle_stage"),
        Index("ix_procurement_forecast", "forecast_delivery_date"),
        Index("ix_procurement_long_lead", "is_long_lead_item"),
    )


class TaskProcurementConstraint(Base):
    """A hard constraint linking a procurement item to a WBS task.

    This model creates a dependency between a :class:`ProcurementItem` and a
    :class:`PortfolioNode` task.  The task cannot start before the procurement
    item's ``forecast_delivery_date`` — this is enforced during the CPM forward
    pass as a hard early-start constraint gate.

    How it works in the CPM engine
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    During the forward pass, for each task the engine queries all active
    ``TaskProcurementConstraint`` records.  For each constraint, it compares
    the procurement item's ``forecast_delivery_date`` against the predecessor-
    driven Early Start (ES).  The final ES is:

    .. math::

        ES = \\max\\left(\\max_{p \\in \\text{Pred}} (EF_p + \\text{Lag}_p),\\
        \\text{Forecast Delivery Date of Constrained Parts}\\right)

    If the procurement item's forecast delivery date slips beyond the
    predecessor finish date, the task is flagged as procurement-constrained
    and the consumed float is reported.

    Required-On-Site Date
    ~~~~~~~~~~~~~~~~~~~~~

    The ``required_on_site_date`` represents the latest date the component
    must arrive to avoid delaying the task.  If the procurement item's
    forecast delivery date exceeds this date, the schedule will show a
    delay and the consumed float will indicate how much schedule margin
    has been consumed.

    Attributes
    ----------
    id : UUID
        Unique identifier for this constraint.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` task constrained by this
        procurement item.
    procurement_item_id : UUID
        Foreign key to the :class:`ProcurementItem` that must arrive before
        this task can start.
    required_on_site_date : date
        The latest date the component must be on-site to avoid delaying
        the task.  Used for early warning when forecast dates slip.
    portfolio_node : PortfolioNode
        Relationship to the constrained task.
    procurement_item : ProcurementItem
        Relationship to the procurement item creating the constraint.
    created_at : datetime
        Timestamp when this constraint was created.
    """
    __tablename__ = "task_procurement_constraints"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    procurement_item_id = Column(
        Uuid,
        ForeignKey("procurement_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    required_on_site_date = Column(Date, nullable=False)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )
    procurement_item = relationship(
        "ProcurementItem",
        foreign_keys=[procurement_item_id],
    )

    created_at = Column(DateTime, default=_utc_now)

    __table_args__ = (
        Index("ix_tpc_portfolio_node", "portfolio_node_id"),
        Index("ix_tpc_procurement_item", "procurement_item_id"),
        Index("ix_tpc_required_date", "required_on_site_date"),
        UniqueConstraint("portfolio_node_id", "procurement_item_id",
                         name="uq_tpc_node_item"),
    )


# ============================================================================
# Export Control Licensing
# ============================================================================

class ExportControlLicenseType(str, enum.Enum):
    """Types of export control licences and agreements.

    Defence programmes require specific licences to share controlled
    technical data with foreign nationals or entities.  Each licence
    type governs a different class of disclosure:

    - **DSP_5** — Department of State licence for ITAR-controlled defence
      articles and services.  Required for exporting, re-exporting, or
      temporarily exporting defence articles/services.

    - **DSP_73** — Department of State licence for defence services,
      including technical data, defence services, and training.

    - **TAA** — Technical Assistance Agreement governing the exchange of
      technical data between government entities.  Commonly used for
      bilateral defence cooperation programmes.

    - **MLA** — Manufacturing Licence Authorisation allowing a foreign
      entity to manufacture defence articles under licence.

    - **UK_SIEL** — UK Strategic Export Licence covering multiple exports
      of controlled dual-use or military goods to specified destinations.

    - **UK_OGEL** — UK Open General Export Licence for lower-risk exports
      that meet specified conditions without individual licensing.
    """
    DSP_5 = "DSP_5"
    DSP_73 = "DSP_73"
    TAA = "TAA"
    MLA = "MLA"
    UK_SIEL = "UK_SIEL"
    UK_OGEL = "UK_OGEL"


class IssuingAuthority(str, enum.Enum):
    """Government authorities that issue export control licences.

    Values
    ------
    US_DDTC : str
        US Department of State, Directorate of Defence Trade Controls.
        Issues ITAR licences (DSP-5, DSP-73).
    US_BIS : str
        US Department of Commerce, Bureau of Industry and Security.
        Issues EAR licences and exceptions.
    UK_ECJU : str
        UK Export Control Joint Unit (FCDO + BEIS).
        Issues UK military and dual-use export licences.
    """
    US_DDTC = "US_DDTC"
    US_BIS = "US_BIS"
    UK_ECJU = "UK_ECJU"


class ExportControlLicense(Base):
    """Export control licence record for gating foreign disclosure.

    This model tracks active export control licences and agreements that
    authorise sharing controlled technical data with foreign nationals
    or entities.  Each licence defines:

    1. **What** — The licence type (TAA, DSP-5, MLA, etc.) and reference.
    2. **Who** — The authorised foreign nations and contractor CAGE codes.
    3. **How much** — The monetary ceiling and current drawn value.
    4. **When** — The effective and expiration dates.

    Export Control Gating
    ~~~~~~~~~~~~~~~~~~~~~

    Before a user can access an export-controlled work package or commit
    a procurement order, the system verifies:

    1. The user's nationality is authorised by an active licence.
    2. The user's employer CAGE code is authorised by the licence.
    3. The licence has not expired.
    4. For procurement: the transaction value does not exceed the
       remaining monetary ceiling.

    If any check fails, access is immediately denied with an
    ``EXPORT_CONTROL_BREACH_ATTEMPT`` audit event.

    Monetary Drawdown
    ~~~~~~~~~~~~~~~~~

    When a procurement purchase order or supplier milestone is committed,
    the transaction value is added to ``current_drawn_value``.  If the
    new total would exceed ``monetary_ceiling``, the transaction is
    rejected and the user must either reduce the order value or obtain
    an amended licence.

    Attributes
    ----------
    id : UUID
        Unique identifier for this licence record.
    license_type : ExportControlLicenseType
        Type of licence (TAA, DSP-5, MLA, etc.).
    license_reference : str
        Unique reference number (e.g., 'TAA-2026-UK-004').
    issuing_authority : IssuingAuthority
        Government authority that issued the licence.
    authorized_foreign_nations : list[str]
        ISO 3166-1 alpha-2 country codes authorised under this licence.
    authorized_contractor_cages : list[str]
        NATO/CAGE codes of contractors authorised under this licence.
    monetary_ceiling : Decimal or None
        Maximum total value that can be drawn under this licence.
        Nullable for non-monetary licences (e.g., data-only TAA).
    current_drawn_value : Decimal
        Cumulative value already drawn against this licence.
    effective_date : date
        Date when the licence becomes effective.
    expiration_date : date
        Date when the licence expires.  Access is denied after this date.
    portfolio_node_id : UUID or None
        Optional link to the work package this licence covers.
    created_at : datetime
        Timestamp when this licence record was created.
    updated_at : datetime
        Timestamp when this licence was last modified.
    """
    __tablename__ = "export_control_licenses"

    id = Column(Uuid, primary_key=True, default=uuid4)

    license_type = Column(
        SAEnum(ExportControlLicenseType),
        nullable=False,
        index=True,
    )
    license_reference = Column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )
    issuing_authority = Column(
        SAEnum(IssuingAuthority),
        nullable=False,
    )

    authorized_foreign_nations = Column(
        SQLiteArray,
        nullable=False,
    )
    """List of ISO 3166-1 alpha-2 country codes authorised under this licence.

    E.g., ``['GBR', 'AUS', 'USA']`` authorises citizens of the UK,
    Australia, and the United States.
    """

    authorized_contractor_cages = Column(
        SQLiteArray,
        nullable=False,
    )
    """List of NATO/CAGE codes of contractors authorised under this licence.

    E.g., ``['7Q3K4', 'F0970']`` authorises specific contractor entities.
    """

    monetary_ceiling = Column(
        Numeric(15, 2),
        nullable=True,
    )
    """Maximum total monetary value that can be drawn under this licence.

    Nullable for licences that do not have a monetary component
    (e.g., technical data-only TAA agreements).
    """

    current_drawn_value = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )
    """Cumulative value already drawn against this licence.

    Incremented when procurement orders or milestones are committed.
    Must not exceed ``monetary_ceiling`` when the ceiling is set.
    """

    effective_date = Column(Date, nullable=False)
    expiration_date = Column(Date, nullable=False, index=True)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    __table_args__ = (
        Index("ix_ecl_reference", "license_reference"),
        Index("ix_ecl_expiration", "expiration_date"),
        Index("ix_ecl_portfolio_node", "portfolio_node_id"),
    )


# ============================================================================
# Forensic Audit Engine
# ============================================================================

def _compute_row_hash(data: dict, prev_hash: str = "") -> str:
    """Compute a SHA-256 hash for a dictionary of serializable values.

    This function creates a deterministic hash by:

    1. Serialising the dictionary to JSON with sorted keys (ensuring
       the same data always produces the same JSON string).
    2. Concatenating the previous hash with the JSON string.
    3. Computing the SHA-256 digest of the combined string.

    The chaining mechanism (prev_hash → current_hash) ensures that if
    any past audit entry is modified, all subsequent entries' hashes
    will no longer match, making tampering immediately detectable.

    Parameters
    ----------
    data : dict
        A dictionary of serializable values representing the audit entry.
    prev_hash : str
        The SHA-256 hash of the previous audit entry.  For the first
        entry in the chain, this is an empty string.

    Returns
    -------
    str
        A 64-character hexadecimal SHA-256 hash string.
    """
    content = json.dumps(data, sort_keys=True, default=str)
    combined = f"{prev_hash}{content}"
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


class ForensicAuditLog(Base):
    """Immutable forensic audit log with SHA-256 chained hashing.

    This model provides a tamper-evident audit trail for all mutations
    to the breakdown tree.  Every time a node is inserted, updated,
    deleted, or reparented, an audit entry is automatically created
    by SQLAlchemy event listeners.

    How the Hash Chain Works
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Each audit entry contains two hash fields:

    - **prev_hash** — The ``current_hash`` of the previous audit entry.
    - **current_hash** — A SHA-256 hash computed from this entry's data
      combined with ``prev_hash``.

    This creates a chain similar to a blockchain:

    .. code-block:: text

        Entry 1: prev_hash = ""           → current_hash = SHA256("" + data_1)
        Entry 2: prev_hash = hash_1       → current_hash = SHA256(hash_1 + data_2)
        Entry 3: prev_hash = hash_2       → current_hash = SHA256(hash_2 + data_3)

    If an attacker modifies Entry 2's data, the hash chain breaks:
    Entry 3's ``prev_hash`` no longer matches Entry 2's ``current_hash``.

    What is Logged
    ~~~~~~~~~~~~~~

    Every audit entry records:

    - **Who** — The user's UPN (User Principal Name).
    - **Where** — The client IP address.
    - **What** — The action type (INSERT, UPDATE, DELETE, REPARENT).
    - **Which entity** — The entity type and ID.
    - **What changed** — A JSON diff of the old and new values.
    - **Security marking** — The classification and caveats of the node.

    Automatic Logging
    ~~~~~~~~~~~~~~~~~

    SQLAlchemy event listeners on :class:`UniversalBreakdownNode` automatically
    create audit entries for every mutation.  In production, middleware should
    set the ``user_upn`` and ``client_ip`` from the request context; currently
    these default to "system" and ``None``.

    Attributes
    ----------
    id : UUID
        Unique identifier for this audit entry.
    transaction_id : UUID
        Transaction identifier grouping related audit entries.
    user_upn : str
        User Principal Name of the user who performed the action.
    client_ip : str or None
        IP address of the client that performed the action.
    action_type : str
        The type of action (INSERT, UPDATE, DELETE, REPARENT).
    entity_type : str
        The class name of the entity that was modified.
    entity_id : UUID
        The UUID of the entity that was modified.
    json_diff : dict or None
        JSON object containing the before/after values of the change.
    security_marking : str or None
        The security classification and caveats of the affected node.
    prev_hash : str
        SHA-256 hash of the previous audit entry (chain linkage).
    current_hash : str
        SHA-256 hash of this entry's data + prev_hash (chain integrity).
    created_at : datetime
        Timestamp when this audit entry was created.

    Methods
    -------
    create_entry(...)
        Factory method that automatically computes the chained hash.
    """
    __tablename__ = "forensic_audit_logs"

    id = Column(Uuid, primary_key=True, default=uuid4)

    transaction_id = Column(Uuid, nullable=False)
    user_upn = Column(String(255), nullable=False)
    client_ip = Column(String(45), nullable=True)

    action_type = Column(String(20), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Uuid, nullable=False)

    json_diff = Column(JSONB, nullable=True)
    security_marking = Column(String(100), nullable=True)

    prev_hash = Column(String(64), nullable=False)
    current_hash = Column(String(64), nullable=False)

    # HSM cryptographic signature for hardware-backed non-repudiation
    hsm_signature = Column(String(512), nullable=True)
    """Base64-encoded cryptographic signature produced by the HSM private key.

    Populated when ``HSM_ENABLED=True``.  In development mode this remains
    ``None`` and the software Ed25519 fallback signature is stored instead.
    """

    hsm_key_identifier = Column(String(128), nullable=True)
    """Stable identifier for the HSM signing key used for this block.

    Derived from the public key SHA-256 fingerprint (e.g., ``hsm:abc123``).
    Allows verifiers to locate the correct public certificate.
    """

    # Spillage remediation — cryptographic tombstone marker
    is_purged = Column(
        Boolean,
        default=False,
        nullable=False,
    )
    """Whether this audit entry has been purged under classified spillage protocol.

    When ``True``, the ``json_diff`` field has been replaced with a
    cryptographically hashed redaction marker.  The entry itself is never
    deleted to preserve chain continuity.
    """

    # AI agent provenance fields — cryptographic provenance for agent actions

    is_agent_action = Column(
        Boolean,
        default=False,
        nullable=False,
    )
    """Whether this audit entry was created as part of an AI agent action.

    When ``True``, the agent-related fields below are populated to provide
    full cryptographic provenance of the agent execution.
    """

    agent_session_id = Column(
        Uuid,
        ForeignKey("agent_proposal_sessions.id"),
        nullable=True,
    )
    """Reference to the agent proposal session that produced this audit entry.

    Links the forensic ledger entry back to the staging session record.
    """

    agent_model_identifier = Column(String(128), nullable=True)
    """Composite identifier of the AI model that generated the action.

    Format: ``model_name:weights_hash`` (e.g., ``llama3-70b:abc123...``).
    Stored for non-repudiation of the model provenance.
    """

    model_weights_sha256 = Column(String(64), nullable=True)
    """SHA-256 hex digest of the loaded model weights at execution time.

    Allows verifiers to confirm the exact model version that produced
    the staged mutations.
    """

    prompt_context_sha256 = Column(String(64), nullable=True)
    """SHA-256 hex digest of the triggering user/system prompt.

    Provides reproducibility: the same prompt with the same weights
    should produce the same mutations.
    """

    human_reviewer_upn = Column(String(128), nullable=True)
    """User Principal Name of the human who reviewed and committed the agent action.

    Dual-attribution field: pairs with the agent identifier to show
    both the AI actor and the human approver.
    """

    reverted_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )
    """Timestamp when this audit entry was superseded by a human rollback.

    When a committed agent session is reverted, the original commit
    audit record is flagged with this timestamp rather than deleted,
    preserving chain continuity.
    """

    reversion_audit_block_id = Column(
        Uuid,
        nullable=True,
    )
    """Reference to the new audit block written when this entry was reverted.

    Points from the original commit entry to the
    ``AGENT_TRANSACTION_REVERTED`` block that undid it, forming a
    permanent rollback audit linkage.
    """

    created_at = Column(DateTime, default=_utc_now, nullable=False)

    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_transaction", "transaction_id"),
        Index("ix_audit_created", "created_at"),
    )

    @classmethod
    def create_entry(
        cls,
        transaction_id: uuid4,
        user_upn: str,
        client_ip: str,
        action_type: str,
        entity_type: str,
        entity_id: uuid4,
        json_diff: dict,
        security_marking: str = "",
        prev_hash: str = "",
        is_agent_action: bool = False,
        agent_session_id = None,
        agent_model_identifier: str = None,
        model_weights_sha256: str = None,
        prompt_context_sha256: str = None,
        human_reviewer_upn: str = None,
    ) -> "ForensicAuditLog":
        """Factory method that creates an audit entry with chained SHA-256 hash.

        This is the primary way to create audit log entries.  It automatically
        computes the ``current_hash`` by combining all entry data with the
        previous hash, ensuring the tamper-evident chain remains intact.

        When ``HSM_ENABLED=True``, the entry is additionally signed with the
        on-premise HSM private key and the signature is persisted in
        ``hsm_signature`` alongside the ``hsm_key_identifier``.

        For AI agent actions, the agent provenance fields are incorporated
        into the hash, making the model identity and weights part of the
        tamper-evident chain.

        Parameters
        ----------
        transaction_id : uuid4
            Unique identifier for this transaction.
        user_upn : str
            User Principal Name of the actor.
        client_ip : str
            IP address of the client.
        action_type : str
            Type of action (INSERT, UPDATE, DELETE, REPARENT).
        entity_type : str
            Class name of the modified entity.
        entity_id : uuid4
            UUID of the modified entity.
        json_diff : dict
            Dictionary containing the before/after values.
        security_marking : str, optional
            Security classification and caveats string.
        prev_hash : str, optional
            The ``current_hash`` of the previous audit entry.  If omitted,
            defaults to an empty string (start of chain).
        is_agent_action : bool, optional
            Whether this entry records an AI agent action.
        agent_session_id : UUID or None, optional
            Reference to the agent proposal session.
        agent_model_identifier : str or None, optional
            Composite model identifier string.
        model_weights_sha256 : str or None, optional
            SHA-256 digest of model weights.
        prompt_context_sha256 : str or None, optional
            SHA-256 digest of the triggering prompt.
        human_reviewer_upn : str or None, optional
            UPN of the human reviewer who approved the action.

        Returns
        -------
        ForensicAuditLog
            A new audit log entry with ``current_hash`` pre-computed and,
            when HSM is enabled, ``hsm_signature`` and ``hsm_key_identifier``
            populated.
        """
        # Build a plain dict for hashing — avoids SQLAlchemy descriptor issues
        data = {
            "transaction_id": str(transaction_id),
            "user_upn": user_upn,
            "client_ip": client_ip,
            "action_type": action_type,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "json_diff": json_diff,
            "security_marking": security_marking,
            "prev_hash": prev_hash,
        }

        # Incorporate agent provenance fields into the hash for agent actions
        if is_agent_action:
            data["agent_model_identifier"] = agent_model_identifier or ""
            data["model_weights_sha256"] = model_weights_sha256 or ""
            data["prompt_context_sha256"] = prompt_context_sha256 or ""
            data["human_reviewer_upn"] = human_reviewer_upn or ""

        current_hash = _compute_row_hash(data, prev_hash)

        # HSM / software cryptographic signature
        hsm_signature = None
        hsm_key_identifier = None
        try:
            from app.core.hsm_driver import HSMDriver
            driver = HSMDriver()
            sig_hex, key_id = driver.sign_data(current_hash.encode("utf-8"))
            hsm_signature = sig_hex
            hsm_key_identifier = key_id
        except Exception as _exc:
            # Log but do not fail — signature is supplementary
            import logging
            logging.getLogger(__name__).warning(
                "Failed to sign audit entry with HSM: %s", _exc
            )

        return cls(
            transaction_id=transaction_id,
            user_upn=user_upn,
            client_ip=client_ip,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=entity_id,
            json_diff=json_diff,
            security_marking=security_marking,
            prev_hash=prev_hash,
            current_hash=current_hash,
            hsm_signature=hsm_signature,
            hsm_key_identifier=hsm_key_identifier,
            is_agent_action=is_agent_action,
            agent_session_id=agent_session_id,
            agent_model_identifier=agent_model_identifier,
            model_weights_sha256=model_weights_sha256,
            prompt_context_sha256=prompt_context_sha256,
            human_reviewer_upn=human_reviewer_upn,
        )


# ============================================================================
# Schedule Clash Issue Model
# ============================================================================

class ScheduleClashIssue(Base):
    """A detected scheduling conflict requiring resolution.

    The clash daemon periodically sweeps the schedule to find conflicts
    that would prevent smooth execution.  Each clash is persisted as a
    ``ScheduleClashIssue`` record so that programme managers can triage,
    assign, and track resolution.

    Clash Categories
    ~~~~~~~~~~~~~~~~

    Seven categories cover the main types of scheduling problems:

    - **RESOURCE_OVERALLOCATION** — A resource is assigned more than
      100% capacity across overlapping tasks.
    - **FACILITY_CONTRAVENTION** — A task is scheduled in a facility
      that does not meet security requirements.
    - **NEGATIVE_FLOAT_SLIP** — A task's total float is negative;
      the project is behind schedule.
    - **CALENDAR_EXCEPTION** — A task is scheduled on a non-working day.
    - **CREDENTIAL_LAPSE** — A resource's clearance or certification
      expires before the task ends.
    - **PREDECESSOR_UNMET** — A predecessor has not finished by the
      time the successor is scheduled to start.
    - **SPATIAL_LOCATION_COLLISION** — Multiple tasks exceed the
      capacity of a shared physical location (e.g., a SCIF room).

    Sweep Runs
    ~~~~~~~~~~

    Each clash belongs to a ``sweep_run_id`` (UUID) that groups all
    clashes discovered in a single audit pass.  This allows managers
    to view clashes by sweep and to compare sweeps over time.

    Resolution
    ~~~~~~~~~~

    When a clash is resolved (e.g., dates are shifted via the leveling
    engine), ``is_resolved`` is set to ``True``.  The record is retained
    for historical analysis.

    Attributes
    ----------
    id : UUID
        Unique identifier for this clash issue.
    sweep_run_id : UUID
        Groups clashes discovered in a single audit sweep.
    category : ClashCategory
        The type of scheduling conflict.
    severity : ClashSeverity
        How urgent the clash is (CRITICAL, MAJOR, ADVISORY).
    portfolio_node_id : UUID
        The primary portfolio node affected by this clash.
    conflicting_node_id : UUID or None
        A second portfolio node involved in the clash (e.g., the
        other task sharing a resource or location).
    conflicting_resource_id : UUID or None
        The resource node involved in the clash (e.g., the
        overallocated person).
    conflict_window_start : date
        When the conflict window begins.
    conflict_window_end : date
        When the conflict window ends.
    title : str
        Short human-readable summary of the clash.
    description : str
        Detailed explanation of the clash and its impact.
    recommended_action : str
        Suggested resolution strategy for the programme manager.
    is_resolved : bool
        Whether this clash has been resolved.
    created_at : datetime
        Timestamp when this clash was detected.
    updated_at : datetime
        Timestamp when this clash was last modified.
    """
    __tablename__ = "schedule_clash_issues"

    id = Column(Uuid, primary_key=True, default=uuid4)
    sweep_run_id = Column(Uuid, nullable=False, index=True)

    category = Column(SAEnum(ClashCategory), nullable=False)
    severity = Column(SAEnum(ClashSeverity), nullable=False)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    conflicting_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    conflicting_resource_id = Column(
        Uuid,
        ForeignKey("resource_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    conflict_window_start = Column(Date, nullable=False)
    conflict_window_end = Column(Date, nullable=False)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=False)

    is_resolved = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship("PortfolioNode", foreign_keys=[portfolio_node_id])
    conflicting_node = relationship("PortfolioNode", foreign_keys=[conflicting_node_id])
    conflicting_resource = relationship("ResourceNode")

    __table_args__ = (
        Index("ix_clash_sweep", "sweep_run_id"),
        Index("ix_clash_severity", "severity"),
        Index("ix_clash_resolved", "is_resolved"),
    )


# ============================================================================
# Performance Measurement Baseline (PMB) Models
# ============================================================================

class BaselineTier(str, enum.Enum):
    """Approval tiers for Baseline Change Requests.

    In defence programme management, changes to an approved baseline
    cannot be made unilaterally.  The tier determines which governance
    body must review and approve the change.

    Values
    ------
    TIER_1_LOCAL_CAM : str
        Local Change Approval by the Contract Administrator or
        Project Manager.  Used for minor changes that stay within
        the project's management reserve (typically < 5% cost impact).
    TIER_2_PROJECT_CCB : str
        Project Change Control Board review.  Required for moderate
        changes that exceed management reserve but do not affect the
        programme-level objectives.
    TIER_3_PROGRAMME_BOARD : str
        Programme-level governance board review.  Required for major
        changes that affect programme objectives, contract value,
        or strategic deliverables.
    """
    TIER_1_LOCAL_CAM = "TIER_1_LOCAL_CAM"
    TIER_2_PROJECT_CCB = "TIER_2_PROJECT_CCB"
    TIER_3_PROGRAMME_BOARD = "TIER_3_PROGRAMME_BOARD"


class BaselineChangeRequestStatus(str, enum.Enum):
    """Lifecycle status of a Baseline Change Request.

    A BCR moves through these statuses as it progresses through the
    governance approval workflow.

    Values
    ------
    DRAFT : str
        The BCR is being prepared and has not yet been submitted
        for review.
    UNDER_REVIEW : str
        The BCR has been submitted and is awaiting a decision from
        the appropriate governance body.
    APPROVED : str
        The BCR has been approved.  The baseline may now be updated
        to reflect the approved change.
    REJECTED : str
        The BCR was rejected.  The baseline remains unchanged and
        the justification for rejection is recorded.
    """
    DRAFT = "DRAFT"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class PortfolioBaseline(Base):
    """A frozen snapshot of a portfolio's Performance Measurement Baseline.

    In Earned Value Management (EVM), the Performance Measurement Baseline
    (PMB) is the approved plan against which performance is measured.  Once
    frozen, the baseline serves as the reference point for calculating
    schedule variance, cost variance, and scope drift.

    Freezing a baseline
    ~~~~~~~~~~~~~~~~~~~

    When a baseline is frozen, the entire sub-tree rooted at
    ``root_portfolio_node_id`` is cloned into :class:`BaselineNodeSnapshot`
    rows.  Each snapshot captures the node's schedule dates, cost figures,
    float values, and custom attributes at the point in time of the freeze.

    Baseline codes
    ~~~~~~~~~~~~~~

    Common baseline codes include:

    - **B0_CONTRACT** — The original contract baseline.
    - **B1_REV_APPROVED** — The first revised baseline after approval.
    - **B2_MANAGEMENT_CHANGE** — A management-directed baseline reset.

    Active target
    ~~~~~~~~~~~~~

    Only one baseline per portfolio should have ``is_active_target = True``
    at any time.  This is the baseline currently used for EVM variance
    calculations.

    Attributes
    ----------
    id : UUID
        Unique identifier for this baseline.
    root_portfolio_node_id : UUID
        The root PortfolioNode whose sub-tree was frozen.
    baseline_code : str
        A short code identifying this baseline (e.g., 'B0_CONTRACT').
    name : str
        Human-readable name for the baseline.
    frozen_at : datetime
        Timestamp when the baseline was frozen.
    frozen_by_user_id : UUID
        The user who initiated the freeze.
    bcr_reference : str or None
        Reference to the BCR that led to this baseline (if any).
    is_active_target : bool
        Whether this is the current active baseline for variance tracking.
    created_at : datetime
        Timestamp when this baseline record was created.
    updated_at : datetime
        Timestamp when this baseline was last modified.
    """
    __tablename__ = "portfolio_baselines"

    id = Column(Uuid, primary_key=True, default=uuid4)
    root_portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    baseline_code = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)

    frozen_at = Column(DateTime, nullable=False, default=_utc_now)
    frozen_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    bcr_reference = Column(String(100), nullable=True)
    is_active_target = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    root_portfolio_node = relationship(
        "PortfolioNode", foreign_keys=[root_portfolio_node_id],
    )
    frozen_by_user = relationship("User", foreign_keys=[frozen_by_user_id])
    snapshots = relationship(
        "BaselineNodeSnapshot", back_populates="baseline", cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_baseline_root", "root_portfolio_node_id"),
        Index("ix_baseline_code", "baseline_code"),
        Index("ix_baseline_active", "is_active_target"),
    )


class BaselineNodeSnapshot(Base):
    """A deep-copied snapshot of a single PortfolioNode at baseline freeze time.

    When a baseline is frozen, every PortfolioNode in the sub-tree is
    cloned into a BaselineNodeSnapshot.  This preserves the exact state
    of the node — including schedule dates, cost figures, and float
    values — so that variance can be calculated later by comparing
    live nodes against their snapshots.

    Snapshot fields
    ~~~~~~~~~~~~~~~

    The snapshot stores key fields from the PortfolioNode at freeze time:

    - **path** — The ltree path within the tree.
    - **code** — The node's WBS code (e.g., 'WP-101').
    - **planned_start_date** — The node's planned start at freeze time.
    - **planned_end_date** — The node's planned end at freeze time.
    - **duration_days** — The node's duration in days.
    - **total_float** — The node's total float from the last CPM run.
    - **budgeted_cost_bac** — The Budget at Completion for this node.
    - **custom_attributes** — Full JSONB custom attributes snapshot.

    Variance calculation
    ~~~~~~~~~~~~~~~~~~~~

    To compute variance, the baseline engine compares each live node
    against its corresponding snapshot and calculates:

    - **start_variance_days** — How many days the start date has shifted.
    - **finish_variance_days** — How many days the finish date has shifted.
    - **bac_variance** — The difference in budgeted cost.
    - **critical_path_migrated** — Whether the node's criticality changed.
    - **scope_drift** — Whether the node is UNCHANGED, MODIFIED, ADDED_SCOPE,
      or DELETED_SCOPE.

    Attributes
    ----------
    id : UUID
        Unique identifier for this snapshot.
    baseline_id : UUID
        The baseline this snapshot belongs to.
    portfolio_node_id : UUID
        The live PortfolioNode that was snapshotted.
    path : str
        The ltree path at freeze time.
    code : str
        The WBS code at freeze time.
    planned_start_date : date or None
        The planned start date at freeze time.
    planned_end_date : date or None
        The planned end date at freeze time.
    duration_days : int or None
        The duration in days at freeze time.
    total_float : int or None
        The total float from CPM at freeze time.
    budgeted_cost_bac : float or None
        The Budget at Completion at freeze time.
    custom_attributes : dict or None
        Full custom attributes JSONB snapshot.
    created_at : datetime
        Timestamp when this snapshot was created.
    """
    __tablename__ = "baseline_node_snapshots"

    id = Column(Uuid, primary_key=True, default=uuid4)
    baseline_id = Column(
        Uuid,
        ForeignKey("portfolio_baselines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Deep-copied snapshot fields
    path = Column(String(500), nullable=True)
    code = Column(String(100), nullable=True)
    planned_start_date = Column(Date, nullable=True)
    planned_end_date = Column(Date, nullable=True)
    duration_days = Column(Integer, nullable=True)
    total_float = Column(Integer, nullable=True)
    budgeted_cost_bac = Column(Numeric, nullable=True)
    custom_attributes = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=_utc_now)

    # Relationships
    baseline = relationship("PortfolioBaseline", back_populates="snapshots")
    portfolio_node = relationship("PortfolioNode")

    __table_args__ = (
        Index("ix_snapshot_baseline", "baseline_id"),
        Index("ix_snapshot_node", "portfolio_node_id"),
    )


class BaselineChangeRequest(Base):
    """A formal request to change an approved Performance Measurement Baseline.

    In defence programme management, once a baseline is approved, changes
    to it cannot be made without going through a formal governance process.
    The Baseline Change Request (BCR) is the vehicle for that process.

    BCR workflow
    ~~~~~~~~~~~~

    1. **DRAFT** — The BCR is created and prepared by the project team.
    2. **UNDER_REVIEW** — The BCR is submitted to the appropriate
       governance body based on its tier.
    3. **APPROVED** or **REJECTED** — The governance body makes a decision.

    Tiers
    ~~~~~

    The tier determines which governance body reviews the BCR:

    - **TIER_1** — Local Contract Administrator / Project Manager.
    - **TIER_2** — Project Change Control Board.
    - **TIER_3** — Programme-level governance board.

    Impact assessment
    ~~~~~~~~~~~~~~~~~

    The BCR records the estimated impact of the proposed change:

    - **cost_delta_amount** — The change in total cost.
    - **schedule_finish_slip_days** — The number of days the finish date
      would slip.
    - **contingency_reserve_requested** — Additional contingency reserve
      needed to cover the change.

    Attributes
    ----------
    id : UUID
        Unique identifier for this BCR.
    bcr_number : str
        A unique, human-readable BCR number (e.g., 'BCR-2024-001').
    title : str
        Short title describing the proposed change.
    justification : str
        Detailed justification for why the change is needed.
    tier : BaselineTier
        The governance tier required for this BCR.
    status : BaselineChangeRequestStatus
        Current lifecycle status of the BCR.
    cost_delta_amount : float or None
        Estimated change in total cost.
    schedule_finish_slip_days : int or None
        Estimated slip in finish date (days).
    contingency_reserve_requested : float or None
        Additional contingency reserve requested.
    created_by_user_id : UUID
        The user who created this BCR.
    approver_user_id : UUID or None
        The user who approved or rejected this BCR.
    rejection_reason : str or None
        If rejected, the reason for rejection.
    created_at : datetime
        Timestamp when this BCR was created.
    updated_at : datetime
        Timestamp when this BCR was last modified.
    """
    __tablename__ = "baseline_change_requests"

    id = Column(Uuid, primary_key=True, default=uuid4)
    bcr_number = Column(String(50), unique=True, nullable=False, index=True)

    title = Column(String(255), nullable=False)
    justification = Column(Text, nullable=False)

    tier = Column(SAEnum(BaselineTier), nullable=False)
    status = Column(
        SAEnum(BaselineChangeRequestStatus),
        default=BaselineChangeRequestStatus.DRAFT,
        nullable=False,
    )

    # Impact assessment
    cost_delta_amount = Column(Numeric, nullable=True)
    schedule_finish_slip_days = Column(Integer, nullable=True)
    contingency_reserve_requested = Column(Numeric, nullable=True)

    # Governance
    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approver_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    rejection_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    approver_user = relationship("User", foreign_keys=[approver_user_id])

    __table_args__ = (
        Index("ix_bcr_status", "status"),
        Index("ix_bcr_tier", "tier"),
    )


# ============================================================================
# Contract Deliverables & Verification/Validation Models
# ============================================================================

class CDRLStatus(str, enum.Enum):
    """Lifecycle status of a Contract Deliverable (CDRL/SDRL).

    In defence contracting, deliverables are formal documents or items
    that must be produced and submitted as part of a contract.  Each
    deliverable follows a review workflow from drafting through final
    acceptance.

    Values
    ------
    DRAFTING : str
        The deliverable is being prepared and has not yet been submitted.
    SUBMITTED : str
        The deliverable has been submitted to the contracting authority
        for review.
    UNDER_REVIEW : str
        The contracting authority is actively reviewing the deliverable.
    ACCEPTED : str
        The deliverable has been accepted without comments.
    ACCEPTED_WITH_COMMENTS : str
        The deliverable was accepted but with non-blocking comments
        that should be noted for future revisions.
    REJECTED : str
        The deliverable was rejected and must be revised and resubmitted.
    """
    DRAFTING = "DRAFTING"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    ACCEPTED = "ACCEPTED"
    ACCEPTED_WITH_COMMENTS = "ACCEPTED_WITH_COMMENTS"
    REJECTED = "REJECTED"


class VerificationTestCaseStatus(str, enum.Enum):
    """Status of a Verification & Validation test case.

    V&V test cases are objective, physical completion gates that must
    be satisfied before a work package can be marked as complete.
    They ensure that deliverables meet specified standards and requirements.

    Values
    ------
    NOT_RUN : str
        The test has not yet been executed.
    PASSED : str
        The test was executed and the deliverable met all criteria.
    FAILED : str
        The test was executed and the deliverable did not meet criteria.
        The work package cannot be completed until this is resolved.
    WAIVED : str
        The test was formally waived by the appropriate authority.
        A waiver is treated as equivalent to PASSED for completion
        gate purposes, but the waiver decision is auditable.
    """
    NOT_RUN = "NOT_RUN"
    PASSED = "PASSED"
    FAILED = "FAILED"
    WAIVED = "WAIVED"


class ContractDeliverable(Base):
    """A Contract Deliverable (CDRL) or Supplier Deliverable (SDRL) linked to a portfolio node.

    In defence programme management, every contract specifies a set of
    formal deliverables that must be produced, submitted, reviewed, and
    accepted.  Each deliverable is identified by a sequence number
    (e.g., 'CDRL-A004') and linked to a Data Item Description (DID)
    standard (e.g., 'DI-MGMT-81861').

    Review Window
    ~~~~~~~~~~~~~

    Once submitted, the contracting authority has a defined number of
    days (``review_window_days``, default 30) to review the deliverable.
    The ``review_deadline_date`` is automatically calculated as
    ``actual_submission_date + review_window_days``.

    Billing Interlock
    ~~~~~~~~~~~~~~~~~

    Billing milestones linked to CDRLs cannot transition to complete
    while the CDRL status is REJECTED or UNDER_REVIEW.  This prevents
    payment for deliverables that have not been formally accepted.

    Attributes
    ----------
    id : UUID
        Unique identifier for this deliverable.
    portfolio_node_id : UUID
        The portfolio node this deliverable is associated with.
    cdrl_sequence_number : str
        The deliverable sequence number (e.g., 'CDRL-A004', 'SDRL-B001').
    title : str
        Human-readable title of the deliverable.
    did_reference : str
        The Data Item Description standard reference (e.g., 'DI-MGMT-81861').
    revision : str
        The current revision of the deliverable (e.g., 'Rev A', 'Rev B').
    status : CDRLStatus
        Current lifecycle status of the deliverable.
    contractual_due_date : date
        The date by which the deliverable must be submitted per contract.
    actual_submission_date : date or None
        The date the deliverable was actually submitted.
    review_window_days : int
        Number of days the contracting authority has to review (default 30).
    review_deadline_date : date or None
        Calculated deadline for review (submission_date + review_window_days).
    created_at : datetime
        Timestamp when this deliverable was created.
    updated_at : datetime
        Timestamp when this deliverable was last modified.
    """
    __tablename__ = "contract_deliverables"

    id = Column(Uuid, primary_key=True, default=uuid4)
    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    cdrl_sequence_number = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    did_reference = Column(String(100), nullable=False)

    revision = Column(String(20), default="Rev A", nullable=False)

    status = Column(
        SAEnum(CDRLStatus),
        default=CDRLStatus.DRAFTING,
        nullable=False,
    )

    contractual_due_date = Column(Date, nullable=False)
    actual_submission_date = Column(Date, nullable=True)
    review_window_days = Column(Integer, default=30, nullable=False)
    review_deadline_date = Column(Date, nullable=True)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode", foreign_keys=[portfolio_node_id],
    )

    __table_args__ = (
        Index("ix_cdrl_node", "portfolio_node_id"),
        Index("ix_cdrl_status", "status"),
        Index("ix_cdrl_sequence", "cdrl_sequence_number"),
    )


class VerificationTestCase(Base):
    """A Verification & Validation (V&V) test case linked to a portfolio node.

    V&V test cases provide objective, physical completion gates.  Before
    a work package can be marked as 100% complete, all mandatory test
    cases must be in either PASSED or WAIVED status.

    Standards References
    ~~~~~~~~~~~~~~~~~~~~

    Each test case references an applicable standard, such as:

    - **DO-178C Level A** — Software Considerations in Airborne Certification
    - **Def Stan 00-056** — UK Defence Standard for Software Engineering
    - **MIL-STD-810** — Environmental Engineering Considerations

    Completion Gate Interlock
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    If a PortfolioNode has ``requires_vv_signoff = True``, the system
    will reject any attempt to set ``percent_complete = 100.0`` unless
    all mandatory VerificationTestCase items are PASSED or WAIVED.

    Attributes
    ----------
    id : UUID
        Unique identifier for this test case.
    portfolio_node_id : UUID
        The portfolio node this test case is associated with.
    test_identifier : str
        Unique test case identifier (e.g., 'ATP-AVIONICS-09').
    title : str
        Human-readable title of the test case.
    standard_reference : str
        The standard or specification this test validates against.
    is_mandatory : bool
        Whether this test case must pass for completion (default True).
    status : VerificationTestCaseStatus
        Current status of the test case.
    created_at : datetime
        Timestamp when this test case was created.
    updated_at : datetime
        Timestamp when this test case was last modified.
    """
    __tablename__ = "verification_test_cases"

    id = Column(Uuid, primary_key=True, default=uuid4)
    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    test_identifier = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    standard_reference = Column(String(255), nullable=False)

    is_mandatory = Column(Boolean, default=True, nullable=False)

    status = Column(
        SAEnum(VerificationTestCaseStatus),
        default=VerificationTestCaseStatus.NOT_RUN,
        nullable=False,
    )

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode", foreign_keys=[portfolio_node_id],
    )

    __table_args__ = (
        Index("ix_vvc_node", "portfolio_node_id"),
        Index("ix_vvc_status", "status"),
        Index("ix_vvc_identifier", "test_identifier"),
    )


# ============================================================================
# Notification & Teams Integration Models
# ============================================================================

class TeamChannelWebhook(Base):
    """A Microsoft Teams channel webhook configuration for notification dispatch.

    In defence programme management, teams use Microsoft Teams for operational
    communication.  This model stores the webhook URLs that connect portfolio
    nodes to specific Teams channels, enabling automated notifications when
    events occur (e.g., a task is blocked, a handoff is ready).

    Data-Spillage Protection
    ~~~~~~~~~~~~~~~~~~~~~~~~

    Because Teams channels may operate at different classification levels than
    the portfolio data they receive notifications about, each webhook records
    its ``max_permitted_classification``.  The notification engine enforces
    this limit: if a node's security classification exceeds the channel's
    maximum, the notification body is redacted to prevent data spillage.

    For example, if a SECRET-classified task triggers a notification to an
    OFFICIAL-level Teams channel, the user will see only:

        **Restricted Program Update**
        *Classified work package has been updated. Details suppressed.*

    Webhook Security
    ~~~~~~~~~~~~~~~~

    The ``webhook_url`` field stores the full webhook URL.  In production,
    this should be encrypted at rest using a field-level encryption library
    or a secrets manager.  The API masks the URL in responses, showing only
    the last 4 characters.

    Attributes
    ----------
    id : UUID
        Unique identifier for this webhook configuration.
    portfolio_node_id : UUID
        The portfolio node this webhook is associated with.  Notifications
        for this node and its descendants will be dispatched to this channel.
    channel_name : str
        Human-readable name of the Teams channel (e.g., 'Project Alpha Ops').
    webhook_url : str
        The full Microsoft Teams incoming webhook URL.
    max_permitted_classification : SecurityClassification
        The highest classification level this channel may receive.
        Notifications from higher-classified nodes will be redacted.
    is_active : bool
        Whether this webhook is currently active for dispatch.
    created_at : datetime
        Timestamp when this webhook was created.
    updated_at : datetime
        Timestamp when this webhook was last modified.
    """
    __tablename__ = "team_channel_webhooks"

    id = Column(Uuid, primary_key=True, default=uuid4)
    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    channel_name = Column(String(255), nullable=False)
    webhook_url = Column(String(2048), nullable=False)

    max_permitted_classification = Column(
        SAEnum(SecurityClassification),
        nullable=False,
        default=SecurityClassification.OFFICIAL,
    )

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode", foreign_keys=[portfolio_node_id],
    )

    __table_args__ = (
        Index("ix_webhook_node", "portfolio_node_id"),
        Index("ix_webhook_active", "is_active"),
    )


# ============================================================================
# Audit event listeners — auto-log mutations on UniversalBreakdownNode
# ============================================================================

@event.listens_for(UniversalBreakdownNode, "before_insert")
def _audit_node_insert(mapper, connection, target):
    """Automatically log INSERT operations on any breakdown node.

    This SQLAlchemy event listener fires before a new node is inserted
    into the database.  It creates a :class:`ForensicAuditLog` entry
    that records the new node's data, forming part of the tamper-evident
    audit trail.

    In production, the ``user_upn`` and ``client_ip`` should be overridden
    via request context/middleware to capture the actual user performing
    the action.
    """
    from app.database import SessionLocal

    # Get the latest chain hash
    session = SessionLocal()
    try:
        last = session.query(ForensicAuditLog).order_by(
            ForensicAuditLog.created_at.desc()
        ).first()
        prev_hash = last.current_hash if last else ""
    finally:
        session.close()

    entry = ForensicAuditLog.create_entry(
        transaction_id=uuid4(),
        user_upn="system",  # Override via middleware/context in production
        client_ip=None,
        action_type="INSERT",
        entity_type=target.__class__.__name__,
        entity_id=target.id,
        json_diff={"new_values": _serialize_node(target)},
        security_marking=_security_marking(target),
        prev_hash=prev_hash,
    )
    connection.execute(entry.__table__.insert(), vars(entry))


@event.listens_for(UniversalBreakdownNode, "before_update")
def _audit_node_update(mapper, connection, target):
    """Automatically log UPDATE operations on any breakdown node.

    This SQLAlchemy event listener fires before an existing node is
    updated.  It detects whether the update is a reparenting operation
    (parent_id changed) and logs it as a REPARENT action, which is
    flagged separately because reparenting changes the tree structure.

    In production, the ``user_upn`` and ``client_ip`` should be overridden
    via request context/middleware to capture the actual user performing
    the action.
    """
    from app.database import SessionLocal

    # Detect reparenting (parent_id change)
    action = "REPARENT" if hasattr(target, "_old_parent_id") and \
        target._old_parent_id is not None and \
        target._old_parent_id != target.parent_id else "UPDATE"

    session = SessionLocal()
    try:
        last = session.query(ForensicAuditLog).order_by(
            ForensicAuditLog.created_at.desc()
        ).first()
        prev_hash = last.current_hash if last else ""
    finally:
        session.close()

    entry = ForensicAuditLog.create_entry(
        transaction_id=uuid4(),
        user_upn="system",
        client_ip=None,
        action_type=action,
        entity_type=target.__class__.__name__,
        entity_id=target.id,
        json_diff={"changed_fields": _serialize_node(target)},
        security_marking=_security_marking(target),
        prev_hash=prev_hash,
    )
    connection.execute(entry.__table__.insert(), vars(entry))


@event.listens_for(UniversalBreakdownNode, "before_delete")
def _audit_node_delete(mapper, connection, target):
    """Automatically log DELETE operations on any breakdown node.

    This SQLAlchemy event listener fires before a node is deleted from
    the database.  It captures the node's data before deletion so that
    the audit trail preserves a record of what was removed.

    Note: Due to cascading deletes, deleting a parent node will also
    delete all its descendants.  Each descendant generates its own
    audit entry.

    In production, the ``user_upn`` and ``client_ip`` should be overridden
    via request context/middleware to capture the actual user performing
    the action.
    """
    from app.database import SessionLocal

    session = SessionLocal()
    try:
        last = session.query(ForensicAuditLog).order_by(
            ForensicAuditLog.created_at.desc()
        ).first()
        prev_hash = last.current_hash if last else ""
    finally:
        session.close()

    entry = ForensicAuditLog.create_entry(
        transaction_id=uuid4(),
        user_upn="system",
        client_ip=None,
        action_type="DELETE",
        entity_type=target.__class__.__name__,
        entity_id=target.id,
        json_diff={"deleted_values": _serialize_node(target)},
        security_marking=_security_marking(target),
        prev_hash=prev_hash,
    )
    connection.execute(entry.__table__.insert(), vars(entry))


# ============================================================================
# Audit helper functions
# ============================================================================

def _serialize_node(node) -> dict:
    """Serialize a UniversalBreakdownNode to a flat dictionary for audit diffs.

    Converts all column values of a node into a plain dictionary that can
    be JSON-serialised for storage in the audit log's ``json_diff`` field.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node instance to serialize.

    Returns
    -------
    dict
        A flat dictionary mapping column names to their values.
        Datetimes are converted to ISO format strings, UUIDs to strings,
        and enums to their string values.
    """
    data = {}
    # Use mapper.columns which is always available on ORM-mapped instances,
    # even when __table__ is not yet bound (e.g., during Sphinx autodoc).
    try:
        columns = node.__table__.columns
    except AttributeError:
        # Fallback: use the mapper's column collection
        from sqlalchemy import inspect
        columns = inspect(node.__class__).columns
    for col in columns:
        val = getattr(node, col.name, None)
        if val is None:
            data[col.name] = None
        elif isinstance(val, datetime):
            data[col.name] = val.isoformat()
        elif isinstance(val, uuid4.__class__):
            data[col.name] = str(val)
        elif isinstance(val, enum.Enum):
            data[col.name] = val.value
        else:
            data[col.name] = val
    return data


def _security_marking(node) -> str:
    """Derive a security marking string from a node's classification and caveats.

    The security marking is a compact string that combines the node's
    security classification with its caveats, separated by ``://``.
    For example: ``"SECRET://UK_EYES_ONLY,NOFORN"``.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node whose security marking to derive.

    Returns
    -------
    str
        The security marking string.  If the node has no caveats,
        returns only the classification (e.g., ``"SECRET"``).
    """
    marking = node.security_classification.value if node.security_classification else ""
    if node.caveats:
        marking = f"{marking}://{','.join(node.caveats)}"
    return marking


# ============================================================================
# Schedule Risk Analysis (SRA) Models
# ============================================================================

class DistributionType(str, enum.Enum):
    """Probability distribution type for activity duration uncertainty.

    In Schedule Risk Analysis, each activity's duration is modelled as a
    probability distribution rather than a single deterministic value.
    The two most common distribution types are Beta-PERT (which weights
    the most-likely estimate more heavily) and Triangular (which treats
    all three estimates symmetrically).

    Values
    ------
    BETA_PERT : str
        Beta distribution parameterised by optimistic, most-likely, and
        pessimistic estimates.  The mode (most-likely value) receives
        higher probability density than a triangular distribution.
        This is the standard distribution used in defence programme SRA.
    TRIANGULAR : str
        Simple triangular distribution defined by the three-point
        estimates.  Useful when there is insufficient historical data
        to justify the shape assumptions of a Beta distribution.
    """
    BETA_PERT = "BETA_PERT"
    TRIANGULAR = "TRIANGULAR"


class ActivityDurationDistribution(Base):
    """Three-point duration estimates for a PortfolioNode used in Monte Carlo SRA.

    Schedule Risk Analysis replaces the single deterministic duration of
    each activity with a probability distribution.  This model stores the
    three-point estimates (optimistic, most-likely, pessimistic) alongside
    the chosen distribution type.

    Beta-PERT Distribution
    ~~~~~~~~~~~~~~~~~~~~~~

    When ``distribution_type`` is BETA_PERT, the simulation samples from a
    Beta distribution scaled to the [optimistic, pessimistic] range:

        α = 1 + 4 × (most_likely - optimistic) / (pessimistic - optimistic)
        β = 1 + 4 × (pessimistic - most_likely) / (pessimistic - optimistic)
        d = optimistic + Beta(α, β) × (pessimistic - optimistic)

    This gives the most-likely estimate four times the weight of the
    extremes, following the standard PERT convention.

    Criticality Index
    ~~~~~~~~~~~~~~~~~

    After a Monte Carlo simulation, the ``criticality_index`` field is
    updated to record the percentage of iterations (0.0–1.0) in which
    this activity appeared on the critical path.  A high criticality
    index (e.g., > 0.8) means the activity is almost always critical,
    even if its deterministic Total Float is positive.

    Attributes
    ----------
    id : UUID
        Unique identifier for this distribution record.
    portfolio_node_id : UUID
        The portfolio node this distribution belongs to (unique FK).
    optimistic_days : float
        Best-case duration estimate (everything goes right).
    most_likely_days : float
        Most probable duration estimate (mode of the distribution).
    pessimistic_days : float
        Worst-case duration estimate (everything goes wrong).
    distribution_type : DistributionType
        The probability distribution used for sampling.
    criticality_index : float or None
        Persisted simulation result: fraction of iterations where this
        activity was on the critical path (0.0–1.0).
    created_at : datetime
        Timestamp when this record was created.
    updated_at : datetime
        Timestamp when this record was last modified.
    """
    __tablename__ = "activity_duration_distributions"

    id = Column(Uuid, primary_key=True, default=uuid4)
    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    optimistic_days = Column(Float, nullable=False)
    most_likely_days = Column(Float, nullable=False)
    pessimistic_days = Column(Float, nullable=False)

    distribution_type = Column(
        SAEnum(DistributionType),
        default=DistributionType.BETA_PERT,
        nullable=False,
    )

    criticality_index = Column(Float, nullable=True)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode", foreign_keys=[portfolio_node_id],
    )

    __table_args__ = (
        Index("ix_add_node", "portfolio_node_id"),
    )


# ============================================================================
# Oracle ERP Integration Models
# ============================================================================

class ExportBatchStatus(str, enum.Enum):
    """Lifecycle status of an Oracle ERP export batch.

    An export batch moves through a linear workflow from creation
    through export to final confirmation or rejection by the finance
    team.

    Values
    ------
    READY_FOR_EXPORT : str
        The batch has been assembled and is ready to be exported.
        The staging payload can be downloaded but has not yet been
        transferred to Oracle EBS.
    EXPORTED : str
        The staging payload has been successfully transferred to
        Oracle EBS (e.g., via SFTP, API, or manual upload).
    CONFIRMED : str
        Oracle EBS has processed the batch and confirmed the
        transactions.  Hours are now reflected in the ERP system.
    REJECTED : str
        Oracle EBS rejected one or more records in the batch
        (e.g., invalid cost code, missing project number).
        The batch requires investigation and possible re-export.
    """
    READY_FOR_EXPORT = "READY_FOR_EXPORT"
    EXPORTED = "EXPORTED"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"


class OracleProjectMapping(Base):
    """Maps a PortfolioNode to Oracle EBS project/task identifiers.

    In defence programmes, the internal WBS (Work Breakdown Structure)
    used for planning and scheduling is separate from the Oracle EBS
    (Enterprise Business Suite) cost accounting structure.  This model
    bridges the two systems by recording the Oracle project number,
    task number, expenditure organisation, and expenditure type for
    each portfolio node.

    Why is this needed?
    ~~~~~~~~~~~~~~~~~~~

    When timesheets are exported to Oracle EBS for billing, each hour
    logged must be charged to a valid Oracle cost code.  The mapping
    ensures that hours logged against a portfolio node are correctly
    attributed to the corresponding Oracle project/task combination.

    Oracle EBS Structure
    ~~~~~~~~~~~~~~~~~~~~

    Oracle EBS organises costs hierarchically:

    1. **Project** — The top-level billing entity (e.g., 'PRJ-10492').
    2. **Task** — A sub-element within the project (e.g., '10.02.01').
    3. **Expenditure Organisation** — The organisational unit responsible
       for the cost (e.g., 'AVIONICS_DIVISION').
    4. **Expenditure Type** — How the cost is categorised
       (e.g., 'Direct Labor', 'Travel', 'Materials').

    Attributes
    ----------
    id : UUID
        Unique identifier for this mapping record.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` being mapped.
        Each node can have only one active Oracle mapping.
    oracle_project_number : str
        The Oracle EBS project number (e.g., 'PRJ-10492').
    oracle_task_number : str
        The Oracle EBS task number within the project
        (e.g., '10.02.01').
    oracle_expenditure_org_name : str
        The Oracle expenditure organisation name
        (e.g., 'AVIONICS_DIVISION').
    oracle_expenditure_type : str
        The Oracle expenditure type for cost categorisation
        (default 'Direct Labor').
    created_at : datetime
        Timestamp when this mapping was created.
    updated_at : datetime
        Timestamp when this mapping was last modified.
    portfolio_node : PortfolioNode
        Relationship to the mapped portfolio node.
    """
    __tablename__ = "oracle_project_mappings"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    oracle_project_number = Column(String(50), nullable=False)
    oracle_task_number = Column(String(50), nullable=False)
    oracle_expenditure_org_name = Column(String(100), nullable=False)
    oracle_expenditure_type = Column(String(100), default="Direct Labor", nullable=False)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode", foreign_keys=[portfolio_node_id],
    )

    __table_args__ = (
        Index("ix_oppm_project_task", "oracle_project_number", "oracle_task_number"),
    )


class TimesheetOracleExportBatch(Base):
    """A batch of approved timesheet lines ready for Oracle EBS export.

    When a weekly timesheet period is closed, all approved timesheet
    lines for that period are grouped into an export batch.  The batch
    is then formatted into Oracle EBS staging format (PA_TRANSACTION_INTERFACE_ALL
    schema or OTL CSV) and transferred to the ERP system.

    Batch Lifecycle
    ~~~~~~~~~~~~~~~

    1. **READY_FOR_EXPORT** — Batch created; payload can be downloaded.
    2. **EXPORTED** — Payload transferred to Oracle EBS.
    3. **CONFIRMED** — Oracle EBS processed and confirmed the transactions.
    4. **REJECTED** — Oracle EBS rejected the batch; investigation needed.

    Data Sanitization
    ~~~~~~~~~~~~~~~~~

    When generating the staging payload, classified task names are
    automatically replaced with sanitised cost-code identifiers to
    prevent classified information from leaking into the ERP system.

    Attributes
    ----------
    id : UUID
        Unique identifier for this export batch.
    batch_reference : str
        Human-readable batch reference (e.g., 'TS-2024-W42-001').
        Unique across all batches for audit trail purposes.
    period_start_date : date
        Start date of the timesheet period covered by this batch.
    period_end_date : date
        End date of the timesheet period covered by this batch.
    status : ExportBatchStatus
        Current lifecycle status of the batch.
    total_hours : decimal
        Sum of all hours in the batch for quick reference.
    record_count : int
        Number of individual timesheet lines in the batch.
    created_at : datetime
        Timestamp when this batch was created.
    updated_at : datetime
        Timestamp when this batch was last modified.
    """
    __tablename__ = "timesheet_oracle_export_batches"

    id = Column(Uuid, primary_key=True, default=uuid4)

    batch_reference = Column(String(50), unique=True, nullable=False, index=True)

    period_start_date = Column(Date, nullable=False)
    period_end_date = Column(Date, nullable=False)

    status = Column(
        SAEnum(ExportBatchStatus),
        default=ExportBatchStatus.READY_FOR_EXPORT,
        nullable=False,
    )

    total_hours = Column(Numeric(12, 2), nullable=False, default=0)
    record_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    __table_args__ = (
        Index("ix_toeb_period", "period_start_date", "period_end_date"),
    )


# ============================================================================
# Cost Breakdown Structure (CBS) Models
# ============================================================================

class CostElementCategory(str, enum.Enum):
    """Top-level category for a cost element in the CBS taxonomy.

    In defence contracting, costs are grouped into four broad categories
    that determine how they are treated in the burdening process and
    how they appear on the Forward Pricing Rate Agreement (FPRA).

    Values
    ------
    LABOR : str
        Direct and indirect labour costs.  This is the only category
        that receives the full burdening cascade (fringe → overhead →
        G&A → fee).
    MATERIAL : str
        Physical materials consumed during programme execution
        (e.g., raw components, consumables).
    SUBCONTRACT : str
        Costs charged by subcontractors for work performed on behalf
        of the prime contractor.
    ODC : str
        Other Direct Costs — expenses that are directly attributable
        to the programme but do not fall into the above categories
        (e.g., travel, testing fees, software licences).
    """
    LABOR = "LABOR"
    MATERIAL = "MATERIAL"
    SUBCONTRACT = "SUBCONTRACT"
    ODC = "ODC"


class CostElement(Base):
    """A single line-item type within the Cost Breakdown Structure.

    The CBS mirrors the WBS but from a financial perspective.  While the
    WBS answers "what work is being done?", the CBS answers "where is the
    money going?".  Each CostElement represents a distinct cost type, such
    as direct labour, subcontractor fees, raw materials, or travel.

    Why is this needed?
    ~~~~~~~~~~~~~~~~~~~

    When the costing engine computes the fully-burdened cost of a task,
    it groups the raw cost data (hours × rates) by CostElement so that
    the burdening formula is applied correctly.  Only LABOR elements
    receive the full FPRA burdening cascade; MATERIAL, SUBCONTRACT, and
    ODC elements are typically passed through at their direct value.

    Examples
    --------

    Typical cost elements in a defence programme::

        LABOR_DIRECT       — Direct engineering labour
        SUBCONTRACT        — Subcontractor work packages
        MATERIAL_RAW       — Raw materials and components
        ODC_TRAVEL         — Travel and accommodation
        FACILITY_USAGE     — Facility overhead allocation

    Attributes
    ----------
    id : UUID
        Unique identifier for this cost element.
    code : str
        Short machine-readable code (e.g., 'LABOR_DIRECT', 'ODC_TRAVEL').
        Used as the primary key in cost ledger entries.
    name : str
        Human-readable name displayed in reports and UI.
    category : CostElementCategory
        The top-level category (LABOR, MATERIAL, SUBCONTRACT, ODC).
    created_at : datetime
        Timestamp when this element was created.
    """
    __tablename__ = "cost_elements"

    id = Column(Uuid, primary_key=True, default=uuid4)

    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    category = Column(SAEnum(CostElementCategory), nullable=False)

    created_at = Column(DateTime, default=_utc_now)


class IndirectRateStructure(Base):
    """Forward Pricing Rate Agreement (FPRA) indirect rate structure.

    In defence contracting, the government negotiates indirect rates with
    the contractor before the contract is awarded.  These rates are recorded
    in a Forward Pricing Rate Agreement (FPRA) and are used to convert
    direct labour costs into fully-burdened costs.

    The Burdening Formula
    ~~~~~~~~~~~~~~~~~~~~~

    The standard burdening cascade applied to direct labour is::

        Labor_Burdened = Direct × (1 + Fringe) × (1 + Overhead) × (1 + G&A) × (1 + Fee)

    Each layer builds on the previous one:

    1. **Direct Labour** — The raw cost (hours × hourly rate).
    2. **Fringe Benefits** — Employer-paid benefits (pension, health insurance,
       holiday pay).  Applied first to direct labour.
    3. **Overhead** — Department-level indirect costs (management, HR, IT
       support).  Applied to (Direct + Fringe).
    4. **General & Administrative (G&A)** — Corporate-level indirect costs
       (executive salaries, corporate facilities).  Applied to the subtotal.
    5. **Fee / Profit** — The contractor's negotiated profit margin.
       Applied last to produce the fully-burdened rate.

    Example
    -------

    If direct labour is £100,000 and the FPRA rates are:

    - Fringe: 35%
    - Overhead: 50%
    - G&A: 12%
    - Fee: 10%

    Then::

        Step 1: 100,000 × 1.35 = 135,000  (after fringe)
        Step 2: 135,000 × 1.50 = 202,500  (after overhead)
        Step 3: 202,500 × 1.12 = 226,800  (after G&A)
        Step 4: 226,800 × 1.10 = 249,480  (fully burdened)

    Fiscal Year Scoping
    -------------------

    Each IndirectRateStructure is tied to a single fiscal year.  When the
    costing engine calculates burdened costs, it looks up the active FPRA
    for the relevant fiscal year.

    Attributes
    ----------
    id : UUID
        Unique identifier for this rate structure.
    fiscal_year : int
        The fiscal year these rates apply to (e.g., 2026).
    currency_code : str
        Three-letter ISO 4217 currency code (default 'GBP').
    fringe_rate_percent : decimal
        Fringe benefit rate as a percentage (e.g., 35.000 for 35%).
    overhead_rate_percent : decimal
        Overhead rate as a percentage (e.g., 50.000 for 50%).
    ga_rate_percent : decimal
        General & Administrative rate as a percentage (e.g., 12.000 for 12%).
    fee_profit_percent : decimal
        Fee / profit margin as a percentage (e.g., 10.000 for 10%).
    created_at : datetime
        Timestamp when this rate structure was created.
    """
    __tablename__ = "indirect_rate_structures"

    id = Column(Uuid, primary_key=True, default=uuid4)

    fiscal_year = Column(Integer, nullable=False)
    currency_code = Column(String(3), default="GBP", nullable=False)

    fringe_rate_percent = Column(Numeric(6, 3), nullable=False, default=0)
    overhead_rate_percent = Column(Numeric(6, 3), nullable=False, default=0)
    ga_rate_percent = Column(Numeric(6, 3), nullable=False, default=0)
    fee_profit_percent = Column(Numeric(6, 3), nullable=False, default=0)

    created_at = Column(DateTime, default=_utc_now)

    __table_args__ = (
        Index("ix_irs_fiscal_year", "fiscal_year"),
    )


class TaskCostLedger(Base):
    """A single cost ledger entry linking a task to a cost element.

    This is the transactional record of the costing engine.  Each row
    represents one cost element's contribution to one task's total cost
    for a given fiscal year.

    Two Amounts
    ~~~~~~~~~~~

    - **direct_unburdened_amount** — The raw cost before any indirect
      rates are applied (e.g., hours × hourly rate for labour).
    - **fully_burdened_amount** — The cost after the complete FPRA
      burdening cascade has been applied.

    For non-labour cost elements (MATERIAL, SUBCONTRACT, ODC), the
    fully_burdened_amount typically equals the direct_unburdened_amount,
    as indirect rates are not applied.

    Rollup
    ~~~~~~

    The costing engine uses ltree parent-path containment queries (<@)
    to recursively roll up TaskCostLedger entries from the leaf-level
    tasks to Work Package, Project, and Programme levels.

    Attributes
    ----------
    id : UUID
        Unique identifier for this ledger entry.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` this cost belongs to.
    cost_element_id : UUID
        Foreign key to the :class:`CostElement` type.
    fiscal_year : int
        The fiscal year this cost record applies to.
    direct_unburdened_amount : decimal
        The raw cost before indirect rates (14 digits, 2 decimal places).
    fully_burdened_amount : decimal
        The cost after the full FPRA burdening cascade (14 digits, 2 decimal places).
    created_at : datetime
        Timestamp when this ledger entry was created.
    updated_at : datetime
        Timestamp when this ledger entry was last modified.
    portfolio_node : PortfolioNode
        Relationship to the portfolio node.
    cost_element : CostElement
        Relationship to the cost element type.
    """
    __tablename__ = "task_cost_ledgers"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )
    cost_element_id = Column(
        Uuid,
        ForeignKey("cost_elements.id", ondelete="RESTRICT"),
        nullable=False,
    )
    fiscal_year = Column(Integer, nullable=False)

    direct_unburdened_amount = Column(Numeric(14, 2), nullable=False, default=0)
    fully_burdened_amount = Column(Numeric(14, 2), nullable=False, default=0)

    # Relationships
    portfolio_node = relationship("PortfolioNode", foreign_keys=[portfolio_node_id])
    cost_element = relationship("CostElement")

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    __table_args__ = (
        Index("ix_tcl_node_fiscal", "portfolio_node_id", "fiscal_year"),
        Index("ix_tcl_element_fiscal", "cost_element_id", "fiscal_year"),
    )


# ============================================================================
# Template Catalog Enums
# ============================================================================

class TemplateTier(str, enum.Enum):
    """Hierarchy tier for structural templates.

    Templates can be created at different levels of granularity, from
    entire programmes down to reusable task collections.  The tier
    indicates the expected scope of the template when instantiated.

    Values
    ------
    PROGRAMME : str
        A full programme-level template encompassing multiple projects
        and work packages.  Used for replicating entire programme
        structures across similar contracts.
    PROJECT : str
        A single-project template containing the complete WBS for one
        project, including all work packages and tasks.
    WORK_PACKAGE : str
        A work package template that can be stamped into multiple
        projects.  For example, a standard 'Systems Safety Assessment'
        work package reused across several projects.
    TASK_COLLECTION : str
        A small group of related tasks that form a repeatable pattern,
        such as a V&V test sequence or a handover checklist.
    """
    PROGRAMME = "PROGRAMME"
    PROJECT = "PROJECT"
    WORK_PACKAGE = "WORK_PACKAGE"
    TASK_COLLECTION = "TASK_COLLECTION"


# ============================================================================
# Template Catalog Models
# ============================================================================

class StructuralTemplate(Base):
    """A reusable structural template for WBS sub-trees.

    Structural templates capture an entire WBS sub-tree — including nodes,
    their relative scheduling (as day offsets from an anchor date), PDM
    dependency edges, deliverable placeholders, and custom attributes —
    and store it as a serialised JSON graph.  This enables programme
    managers to snapshot a proven project structure and later instantiate
    it into a new schedule with a single operation.

    Template Graph Payload
    ~~~~~~~~~~~~~~~~~~~~~~

    The ``template_graph_payload`` JSONB field contains the complete
    serialised graph.  The structure is::

        {
            "nodes": [
                {
                    "id": "original-uuid",
                    "parent_id": "parent-uuid" | null,
                    "code": "WP-101",
                    "name": "Work Package 1",
                    "tree_type": "WBS",
                    "security_classification": "OFFICIAL",
                    "caveats": [],
                    "delivery_mode": "WATERFALL",
                    "relative_start_offset_days": 0,
                    "relative_finish_offset_days": 30,
                    "duration_days": 22,
                    "custom_attributes": { ... },
                    "export_control_regime": "NOT_CONTROLLED",
                    "eccn_or_usml_category": null,
                    "authorized_nationalities": null,
                    "taa_mla_reference": null,
                    "requires_vv_signoff": false
                }
            ],
            "dependencies": [
                {
                    "predecessor_id": "uuid-1",
                    "successor_id": "uuid-2",
                    "dependency_type": "FS",
                    "lag_days": 0
                }
            ],
            "deliverables": [
                {
                    "node_id": "uuid-1",
                    "cdrl_sequence_number": "CDRL-A004",
                    "title": "Safety Report",
                    "did_reference": "DI-MGMT-81861"
                }
            ],
            "metadata": {
                "tier": "PROJECT",
                "snapshot_date": "2026-01-15",
                "snapshot_by": "user@example.com"
            }
        }

    Key Design Decisions
    ~~~~~~~~~~~~~~~~~~~~

    1. **Relative Day Offsets** — Instead of absolute calendar dates,
       all scheduling information is stored as day offsets from an
       anchor date (T₀).  This allows the template to be instantiated
       at any point in the future calendar.

    2. **Generic Placeholders** — Named individuals are translated into
       generic role definitions during snapshot, so the template can be
       instantiated with different personnel.

    3. **Versioning** — The ``revision_version`` field tracks template
       revisions, enabling audit trails for template changes.

    Attributes
    ----------
    id : UUID
        Unique identifier for this template.
    code : str
        Short unique code (e.g., 'TMPL-SAFETY-WP-001') used as a
        human-readable identifier.
    name : str
        Human-readable name of the template.
    description : str or None
        Detailed description of the template's purpose and scope.
    tier : TemplateTier
        The hierarchy level this template is designed for.
    revision_version : int
        Revision number, incremented each time the template is updated.
    template_graph_payload : dict
        The complete serialised graph as JSONB.
    is_active : bool
        Whether this template is available for instantiation.
    created_at : datetime
        Timestamp when this template was created.
    updated_at : datetime
        Timestamp when this template was last modified.
    """
    __tablename__ = "structural_templates"

    id = Column(Uuid, primary_key=True, default=uuid4)

    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    tier = Column(SAEnum(TemplateTier), nullable=False)
    revision_version = Column(Integer, nullable=False, default=1)

    template_graph_payload = Column(JSONB, nullable=False)

    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)


class ResourceCrewTemplate(Base):
    """A reusable template for resource crew compositions.

    Resource crew templates define a standard set of roles required
    for a type of work.  For example, a 'Flight Test Team' crew template
    might include roles like 'Test Pilot', 'Flight Safety Officer',
    'Data Analyst', and 'Ground Support Engineer', each with their
    required skills, clearance levels, and allocation fractions.

    When a structural template is instantiated, the associated crew
    template generates generic placeholder resources that can later
    be filled by the requisition engine.

    Attributes
    ----------
    id : UUID
        Unique identifier for this crew template.
    code : str
        Short unique code (e.g., 'CREW-FLT-TEST-001').
    name : str
        Human-readable name of the crew template.
    description : str or None
        Detailed description of the crew's purpose.
    is_active : bool
        Whether this crew template is available for use.
    created_at : datetime
        Timestamp when this crew template was created.
    updated_at : datetime
        Timestamp when this crew template was last modified.
    members : list[ResourceCrewTemplateMember]
        The roles that make up this crew.
    """
    __tablename__ = "resource_crew_templates"

    id = Column(Uuid, primary_key=True, default=uuid4)

    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    members = relationship(
        "ResourceCrewTemplateMember",
        back_populates="crew_template",
        cascade="all, delete-orphan",
    )


class ResourceCrewTemplateMember(Base):
    """A single role within a resource crew template.

    Each member defines a generic role (not a specific person) that
    must be filled when the crew template is instantiated.  The role
    specifies the required skills, minimum proficiency, minimum
    clearance level, and default allocation fraction.

    During instantiation, the system creates generic placeholder
    ResourceNode records matching these role definitions, which can
    then be filled through the normal requisition process.

    Attributes
    ----------
    id : UUID
        Unique identifier for this crew member role.
    crew_template_id : UUID
        Foreign key to :class:`ResourceCrewTemplate.id`.
    role_name : str
        Human-readable role name (e.g., 'Lead Systems Safety Assessor').
    resource_type : ResourceType
        The type of resource required (PERSON, FACILITY, EQUIPMENT).
    required_skill_id : UUID or None
        Foreign key to :class:`SkillDefinition.id` — the primary skill
        required for this role.  Nullable if the role does not have
        a specific skill requirement.
    min_proficiency : ProficiencyLevel
        Minimum proficiency level required for this role.
    min_clearance : SecurityClassification
        Minimum security clearance required for this role.
    default_allocation_fraction : decimal
        Default allocation as a fraction of full-time (e.g., 0.5 for
        50% allocation).
    created_at : datetime
        Timestamp when this crew member was created.
    updated_at : datetime
        Timestamp when this crew member was last modified.
    crew_template : ResourceCrewTemplate
        Relationship to the parent crew template.
    """
    __tablename__ = "resource_crew_template_members"

    id = Column(Uuid, primary_key=True, default=uuid4)

    crew_template_id = Column(
        Uuid,
        ForeignKey("resource_crew_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role_name = Column(String(200), nullable=False)
    resource_type = Column(SAEnum(ResourceType), nullable=False)

    required_skill_id = Column(
        Integer,
        ForeignKey("skill_definitions.id", ondelete="SET NULL"),
        nullable=True,
    )

    min_proficiency = Column(
        SAEnum(ProficiencyLevel),
        nullable=False,
        default=ProficiencyLevel.NOVICE,
    )
    min_clearance = Column(
        SAEnum(SecurityClassification),
        nullable=False,
        default=SecurityClassification.OFFICIAL,
    )
    default_allocation_fraction = Column(
        Numeric(4, 2),
        nullable=False,
        default=1.0,
    )

    # Relationships
    crew_template = relationship("ResourceCrewTemplate", back_populates="members")

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)


# ============================================================================
# Document Artifact Vault
# ============================================================================

class DocumentArtifact(Base):
    """A classified document stored in a sovereign S3-compatible object store.

    The document vault provides secure, auditable storage for evidence files,
    contract deliverables, and programme artefacts.  Each document carries
    its own security classification and export control marking, independent
    of the parent portfolio node's classification — a document attached to
    an OFFICIAL task may itself be SECRET if it contains classified annexes.

    Storage Architecture
    ~~~~~~~~~~~~~~~~~~~~

    Files are stored in an S3-compatible object store (MinIO or sovereign
    cloud provider) using UUID-based object keys.  The database row records
    the metadata and S3 object key, while the actual binary payload lives
    in the object store.  This separation allows the database to remain
    lightweight while supporting large file attachments.

    Security Model
    ~~~~~~~~~~~~~~

    Every upload and download is governed by two independent checks:

    1. **ABAC Clearance** — The requesting user's clearance level must meet
       or exceed the document's ``security_classification``, and the user's
       caveats must include all of the document's caveats.

    2. **Export Control** — If the document is ITAR or EAR-controlled, the
       user's citizenship and employer licence are verified before a
       download URL is issued.

    Pre-signed URLs
    ~~~~~~~~~~~~~~~

    Rather than streaming file content through the API server, the system
    generates time-limited pre-signed URLs that allow the client to upload
    directly to S3 (for uploads) or download directly from S3 (for downloads).
    Download URLs are valid for a maximum of 60 seconds to minimise the
    window of opportunity for data exfiltration.

    Forensic Audit
    ~~~~~~~~~~~~~~

    Every download URL generation is logged in the :class:`ForensicAuditLog`
    with the requesting user's identity, the artifact's classification,
    and the SHA-256 checksum of the stored object.

    Attributes
    ----------
    id : UUID
        Unique identifier for this artifact.
    portfolio_node_id : UUID or None
        Foreign key to :class:`UniversalBreakdownNode.id` — the task or
        work package this document is attached to.  Nullable for standalone
        documents not tied to a specific node.
    cdrl_id : UUID or None
        Foreign key to :class:`ContractDeliverable.id` — the CDRL this
        document fulfils.  Nullable for non-CDRL attachments.
    file_name : str
        Original filename provided by the uploader.
    file_size_bytes : int
        Size of the stored file in bytes.
    mime_type : str
        MIME type of the file (e.g., 'application/pdf', 'image/png').
    s3_object_key : str
        UUID-based storage path in the S3 bucket.
    sha256_checksum : str
        Cryptographic SHA-256 digest of the file payload, computed at
        upload confirmation time to verify data integrity.
    security_classification : SecurityClassification
        Security marking of this document.
    caveats : list[str] or None
        Additional caveat markings (e.g., ['UK_EYES_ONLY']).
    export_control_regime : ExportControlRegime
        Export control regime applicable to this document.
    uploaded_by_user_id : UUID
        Foreign key to :class:`User.id` — the user who uploaded this file.
    is_active : bool
        Whether this artifact is available for download.  Set to False
        if the upload was never confirmed or the file was quarantined.
    created_at : datetime
        Timestamp when this artifact record was created.
    updated_at : datetime
        Timestamp when this artifact was last modified.
    """
    __tablename__ = "document_artifacts"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    cdrl_id = Column(
        Uuid,
        ForeignKey("contract_deliverables.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    file_name = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    mime_type = Column(String(200), nullable=False)

    s3_object_key = Column(String(500), nullable=False, unique=True)
    sha256_checksum = Column(String(64), nullable=False)

    security_classification = Column(
        SAEnum(SecurityClassification),
        nullable=False,
        index=True,
    )
    caveats = Column(SQLiteArray, nullable=True)

    export_control_regime = Column(
        SAEnum(ExportControlRegime),
        nullable=False,
        default=ExportControlRegime.NOT_CONTROLLED,
    )

    uploaded_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    is_active = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship("UniversalBreakdownNode")
    cdrl = relationship("ContractDeliverable")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])

    __table_args__ = (
        Index("ix_da_classification", "security_classification"),
        Index("ix_da_uploaded_by", "uploaded_by_user_id"),
    )


# ============================================================================
# Sandbox Scenario Models
# ============================================================================

class SandboxScenarioStatus(str, enum.Enum):
    """Lifecycle status of a sandbox scenario.

    A sandbox scenario moves through a workflow from creation to final
    disposition.  This enum tracks the current state of that workflow.

    Values
    ------
    ACTIVE : str
        The sandbox is currently active and can be modified.  Planners
        can adjust dates, dependencies, and resources within the sandbox
        without affecting the live operational schedule.
    COMMITTED : str
        The sandbox has been merged back into the live schedule.  No
        further modifications are allowed.  The scenario serves as a
        historical record of the changes that were applied.
    DISCARDED : str
        The sandbox was abandoned without being merged.  All sandbox
        branches remain in the database for reference but are no longer
        editable.
    """
    ACTIVE = "ACTIVE"
    COMMITTED = "COMMITTED"
    DISCARDED = "DISCARDED"


class SandboxScenario(Base):
    """An isolated What-If scenario branch for schedule planning.

    Sandbox scenarios allow planners to explore "What-If" questions
    without affecting the live operational schedule.  For example:

    - "What happens if the subcontractor is delayed by 3 weeks?"
    - "Can we recover the schedule by adding more resources?"
    - "What is the impact of moving a milestone by 2 months?"

    How it works
    ~~~~~~~~~~~~

    1. **Fork** — The live WBS sub-tree is cloned into sandbox branch
       nodes with ``is_sandbox_branch = True``.  The ltree path is
       rewritten with a sandbox namespace prefix (e.g.,
       ``sandbox_<scenario_id>.1.2.3``).

    2. **Plan** — Planners can freely adjust dates, dependencies, and
       resources within the sandbox.  CPM recalculations run against
       the sandbox branch, isolated from the live schedule.

    3. **Diff** — A three-way comparison is computed between the sandbox
       branch, the current live schedule, and the frozen baseline
       snapshot.  Nodes are categorised as ADDED, MODIFIED_DATES,
       MODIFIED_LOGIC, DELETED, or CONFLICT_LIVE_MUTATED.

    4. **Merge** — Approved changes from the sandbox are applied to the
       live PortfolioNode records in a single atomic transaction.  A
       live CPM forward/backward recalculation is triggered, and a
       ``SANDBOX_MERGE`` entry is recorded in the ForensicAuditLog.

    Sandbox isolation
    ~~~~~~~~~~~~~~~~~

    Sandbox nodes are completely isolated from live nodes:

    - CPM calculations on live nodes ignore sandbox branches.
    - Resource assignments on sandbox nodes do not affect live capacity.
    - ABAC clearance checks apply normally to sandbox nodes.

    Attributes
    ----------
    id : UUID
        Unique identifier for the sandbox scenario.
    root_portfolio_node_id : UUID
        Foreign key to :class:`UniversalBreakdownNode` — the live node
        that was forked to create this sandbox.
    name : str
        Human-readable name of the scenario (e.g., 'Subcontractor 3-Week
        Delay Recovery').
    description : str or None
        Detailed description of the scenario's purpose and assumptions.
    created_by_user_id : int
        Foreign key to :class:`User` — who created the sandbox.
    status : SandboxScenarioStatus
        Current lifecycle status (ACTIVE, COMMITTED, DISCARDED).
    created_at : datetime
        Timestamp when the sandbox was created.
    updated_at : datetime
        Timestamp when the sandbox was last modified.
    """
    __tablename__ = "sandbox_scenarios"

    id = Column(Uuid, primary_key=True, default=uuid4)
    root_portfolio_node_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status = Column(
        SAEnum(SandboxScenarioStatus),
        default=SandboxScenarioStatus.ACTIVE,
        nullable=False,
    )
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    root_portfolio_node = relationship(
        "UniversalBreakdownNode",
        foreign_keys=[root_portfolio_node_id],
        overlaps="sandbox_nodes",
    )
    created_by = relationship(
        "User",
        foreign_keys=[created_by_user_id],
        backref="sandbox_scenarios",
    )
    sandbox_nodes = relationship(
        "UniversalBreakdownNode",
        back_populates="sandbox_scenario",
        overlaps="root_portfolio_node",
    )

    __table_args__ = (
        Index("ix_sandbox_status", "status"),
    )


# ============================================================================
# Management Reserve Models
# ============================================================================

class TransactionType(str, enum.Enum):
    """Types of Management Reserve transactions.

    Management Reserve (MR) is a budget pool held outside the Performance
    Measurement Baseline (PMB) to fund unknown-unknowns — risks that have
    not yet been identified.  When a risk materialises, budget is drawn
    down from the MR and allocated to a specific work package via a
    formal drawdown transaction.

    Transaction types track the lifecycle of MR funds:

    - **INITIAL_ALLOCATION** — The reserve pool is created or topped up.
    - **DRAWDOWN_TO_WBS** — Funds are transferred from the reserve to a
      specific work package in the WBS, increasing its BAC.
    - **RETURN_TO_RESERVE** — Funds are returned from a work package back
      to the reserve (e.g., a risk did not fully materialise).
    - **CUSTOMER_DE_OBLIGATION** — The customer formally releases the
      organisation from an obligation, freeing the associated reserve.

    Values
    ------
    INITIAL_ALLOCATION : str
        Initial or supplementary funding added to the reserve pool.
    DRAWDOWN_TO_WBS : str
        Budget drawn from the reserve and allocated to a WBS work package.
    RETURN_TO_RESERVE : str
        Budget returned from a WBS work package back to the reserve.
    CUSTOMER_DE_OBLIGATION : str
        Customer formally de-obligates the reserve, removing the funding.
    """
    INITIAL_ALLOCATION = "INITIAL_ALLOCATION"
    DRAWDOWN_TO_WBS = "DRAWDOWN_TO_WBS"
    RETURN_TO_RESERVE = "RETURN_TO_RESERVE"
    CUSTOMER_DE_OBLIGATION = "CUSTOMER_DE_OBLIGATION"


class ManagementReservePool(Base):
    """A budget pool held outside the PMB for contingency funding.

    In defence programme management, the Performance Measurement Baseline
    (PMB) contains the budget for known, planned work.  Management Reserve
    (MR) is a separate pool of funds held at the project or programme level
    to address unknown-unknowns — risks that cannot be quantified at the
    time of baseline creation.

    When a risk materialises, a formal drawdown process transfers funds
    from the MR into the PMB by increasing the BAC of the affected work
    package.  This process requires authorisation via an approved
    BaselineChangeRequest (BCR) of Tier 2 or higher.

    The pool tracks:

    - **total_initial_budget** — The total amount originally allocated to
      the reserve (sum of all INITIAL_ALLOCATION transactions).
    - **current_balance** — The remaining available funds after all
      drawdowns, returns, and de-obligations.

    Attributes
    ----------
    id : UUID
        Unique identifier for the reserve pool.
    portfolio_node_id : UUID
        Foreign key to :class:`UniversalBreakdownNode` — the root Project
        or Programme node that owns this reserve pool.
    total_initial_budget : Decimal(14, 2)
        The total initial budget allocated to this reserve pool.
    current_balance : Decimal(14, 2)
        The current available balance after all transactions.
    currency_code : str
        3-letter ISO currency code (default 'GBP').
    created_at : datetime
        Timestamp when the pool was created.
    updated_at : datetime
        Timestamp when the pool was last modified.
    """
    __tablename__ = "management_reserve_pools"

    id = Column(Uuid, primary_key=True, default=uuid4)
    portfolio_node_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    total_initial_budget = Column(Numeric(14, 2), nullable=False, default=0)
    current_balance = Column(Numeric(14, 2), nullable=False, default=0)
    currency_code = Column(String(3), nullable=False, default="GBP")
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "UniversalBreakdownNode",
        foreign_keys=[portfolio_node_id],
        backref="management_reserve_pools",
    )
    transactions = relationship(
        "ManagementReserveTransaction",
        back_populates="pool",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_mr_pool_node", "portfolio_node_id"),
    )


class ManagementReserveTransaction(Base):
    """A ledger entry recording a single Management Reserve transaction.

    Every change to the reserve pool balance is recorded as an immutable
    transaction.  This creates a complete audit trail of how MR funds
    were allocated, drawn down, returned, or de-obligated.

    A drawdown transaction (DRAWDOWN_TO_WBS) requires:

    1. **Sufficient balance** — The pool must have enough current_balance
       to cover the drawdown amount.
    2. **Authorised BCR** — An approved BaselineChangeRequest (Tier 2 or
       Tier 3) must authorise the budget transfer.
    3. **Target work package** — The funds are allocated to a specific
       PortfolioNode, increasing its BAC.

    The transaction atomically:

    - Decrements the pool's current_balance.
    - Increments the target node's bac_cost.
    - Records this ledger entry.
    - Logs the event in ForensicAuditLog.

    Attributes
    ----------
    id : UUID
        Unique identifier for the transaction.
    pool_id : UUID
        Foreign key to :class:`ManagementReservePool` — the pool this
        transaction affects.
    bcr_id : UUID or None
        Foreign key to :class:`BaselineChangeRequest` — the BCR authorising
        this transaction (required for drawdowns).
    risk_item_id : UUID or None
        Optional reference to a risk item that triggered this drawdown.
    transaction_type : TransactionType
        The type of transaction (allocation, drawdown, return, de-obligation).
    amount : Decimal(14, 2)
        The monetary amount of this transaction.
    target_portfolio_node_id : UUID
        Foreign key to :class:`PortfolioNode` — the work package receiving
        or returning funds.
    justification : str
        Human-readable explanation of why this transaction was executed.
    authorized_by_user_id : int
        Foreign key to :class:`User` — who authorised this transaction.
    transaction_timestamp : datetime
        Timestamp when the transaction was executed.
    """
    __tablename__ = "management_reserve_transactions"

    id = Column(Uuid, primary_key=True, default=uuid4)
    pool_id = Column(
        Uuid,
        ForeignKey("management_reserve_pools.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    bcr_id = Column(
        Uuid,
        ForeignKey("baseline_change_requests.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    risk_item_id = Column(
        Uuid,
        nullable=True,
        index=True,
    )
    transaction_type = Column(
        SAEnum(TransactionType),
        nullable=False,
        index=True,
    )
    amount = Column(Numeric(14, 2), nullable=False)
    target_portfolio_node_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    justification = Column(Text, nullable=False)
    authorized_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    transaction_timestamp = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )

    # Relationships
    pool = relationship("ManagementReservePool", back_populates="transactions")
    target_node = relationship(
        "UniversalBreakdownNode",
        foreign_keys=[target_portfolio_node_id],
    )
    authorized_by = relationship(
        "User",
        foreign_keys=[authorized_by_user_id],
        backref="mr_transactions",
    )
    bcr = relationship("BaselineChangeRequest")

    __table_args__ = (
        Index("ix_mr_tx_pool", "pool_id"),
        Index("ix_mr_tx_type", "transaction_type"),
        Index("ix_mr_tx_timestamp", "transaction_timestamp"),
    )


# ============================================================================
# Spatial Location Tracking & Asset Custody
# ============================================================================


# ============================================================================
# Project & Resource Calendar Engines
# ============================================================================


class CalendarJurisdiction(str, enum.Enum):
    """Jurisdiction for statutory holiday calendars.

    Defence programmes often span multiple countries, each with its own
    set of national holidays.  The jurisdiction field determines which
    statutory holiday set applies to a calendar.

    Values
    ------
    UK : str
        United Kingdom — includes bank holidays for England, Wales, Scotland,
        and Northern Ireland (handled via CalendarException records).
    US : str
        United States — includes federal holidays (New Year's Day, Memorial
        Day, Independence Day, etc.).
    CA : str
        Canada — includes statutory holidays by province (handled via
        CalendarException records).
    CUSTOM : str
        Custom calendar not tied to a specific jurisdiction.  Used for
        organisation-specific working patterns (e.g., a 24/7 operations
        centre with rotating shifts).
    """
    UK = "UK"
    US = "US"
    CA = "CA"
    CUSTOM = "CUSTOM"


class CalendarExceptionType(str, enum.Enum):
    """Type of calendar exception that overrides the standard working pattern.

    A standard calendar defines the normal working pattern (e.g., Mon–Fri,
    7.5 hours/day).  Calendar exceptions modify this pattern for specific
    dates.

    Values
    ------
    STATUTORY_HOLIDAY : str
        A national or regional public holiday on which normal work does
        not occur.  Example: "UK Spring Bank Holiday".
    PLANNED_MAINTENANCE : str
        A scheduled facility shutdown or maintenance window during which
        work cannot proceed.  Example: "Anechoic Chamber Recalibration".
    OVERTIME_SURGE : str
        A designated overtime period where additional working hours are
        available beyond the standard pattern.  Example: "Crunch period
        before PDR review".
    """
    STATUTORY_HOLIDAY = "STATUTORY_HOLIDAY"
    PLANNED_MAINTENANCE = "PLANNED_MAINTENANCE"
    OVERTIME_SURGE = "OVERTIME_SURGE"


class WorkingCalendar(Base):
    """A named working calendar defining standard hours, days, and jurisdiction.

    In defence programme management, different projects and resources operate
    under different working calendars.  A UK-based project team may follow
    UK bank holidays, while a US subcontractor follows US federal holidays.
    A 24/7 operations centre may use a completely custom shift pattern.

    Why separate calendars?
    ~~~~~~~~~~~~~~~~~~~~~~~

    - **Multi-national programmes** — Team members in different countries
      observe different statutory holidays.  A single "Mon–Fri" calendar
      is insufficient.

    - **Shift rotas** — Some facilities operate 24/7 with rotating shifts.
      The ``standard_hours_per_day`` and ``working_days_mask`` fields allow
      flexible definition of shift patterns.

    - **Facility-specific constraints** — A SCIF may only be staffed
      Mon–Thu, while the adjacent office operates Mon–Fri.

    - **Calendar exceptions** — Statutory holidays, planned maintenance
      windows, and overtime surge periods are recorded as
      :class:`CalendarException` records linked to the parent calendar.

    Working Days Mask
    ~~~~~~~~~~~~~~~~~

    The ``working_days_mask`` is an integer bitmask where each bit represents
    a day of the week:

    - Bit 0 (value 1) = Monday
    - Bit 1 (value 2) = Tuesday
    - Bit 2 (value 4) = Wednesday
    - Bit 3 (value 8) = Thursday
    - Bit 4 (value 16) = Friday
    - Bit 5 (value 32) = Saturday
    - Bit 6 (value 64) = Sunday

    A standard Mon–Fri calendar has a mask of 31 (binary 0011111).
    A Mon–Thu calendar has a mask of 15 (binary 0001111).
    A 24/7 calendar has a mask of 127 (binary 1111111).

    Binding to Entities
    ~~~~~~~~~~~~~~~~~~~

    Calendars are bound to entities via foreign keys:

    - **PortfolioNode.calendar_id** — The working calendar for a project
      or work package.  Determines which holidays and non-working days
      the CPM engine skips when calculating schedule dates.

    - **ResourceNode.calendar_id** — The working calendar for an individual
      resource.  Determines the resource's availability window for capacity
      planning and assignment validation.

    Attributes
    ----------
    id : UUID
        Unique identifier for this calendar.
    code : str
        Unique code for the calendar (e.g., 'CAL_UK_STANDARD',
        'CAL_US_DEFENCE', 'CAL_SCIF_4X4').
    name : str
        Human-readable name (e.g., 'UK Standard Working Calendar').
    jurisdiction : CalendarJurisdiction
        The jurisdiction governing statutory holidays.
    standard_hours_per_day : Decimal(4, 2)
        Number of working hours per standard working day (default 7.50).
    working_days_mask : int
        Bitmask of working days (Mon=1, Tue=2, Wed=4, Thu=8, Fri=16,
        Sat=32, Sun=64).  Standard Mon–Fri = 31.
    is_default : bool
        Whether this is the default calendar used when no specific
        calendar is assigned to a node or resource.
    created_at : datetime
        Timestamp when the calendar was created.
    updated_at : datetime
        Timestamp when the calendar was last modified.
    """
    __tablename__ = "working_calendars"

    id = Column(Uuid, primary_key=True, default=uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    jurisdiction = Column(SAEnum(CalendarJurisdiction), nullable=False)
    standard_hours_per_day = Column(Numeric(4, 2), nullable=False, default=7.50)
    working_days_mask = Column(Integer, nullable=False, default=31)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    exceptions = relationship(
        "CalendarException",
        back_populates="calendar",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_calendar_default", "is_default"),
    )


class CalendarException(Base):
    """A date-specific override to a WorkingCalendar's standard pattern.

    While :class:`WorkingCalendar` defines the normal working pattern
    (e.g., Mon–Fri, 7.5 hours/day), real-world schedules are disrupted
    by statutory holidays, planned maintenance windows, and occasional
    overtime surge periods.  CalendarException records capture these
    deviations.

    Types of Exceptions
    ~~~~~~~~~~~~~~~~~~~

    1. **STATUTORY_HOLIDAY** — A national or regional public holiday.
       The ``working_hours_override`` is typically 0.00, meaning no
       work occurs on this date.

       Example: "UK Spring Bank Holiday" on 2026-05-04 with 0.00 hours.

    2. **PLANNED_MAINTENANCE** — A scheduled facility shutdown.
       The ``working_hours_override`` may be 0.00 (full shutdown)
       or a reduced number of hours (partial availability).

       Example: "Anechoic Chamber Recalibration" on 2026-07-15
       with 0.00 hours.

    3. **OVERTIME_SURGE** — A designated overtime period where additional
       hours are available.  The ``working_hours_override`` exceeds the
       calendar's standard hours.

       Example: "Crunch period before PDR" on 2026-09-20
       with 12.00 hours.

    Impact on CPM Scheduling
    ~~~~~~~~~~~~~~~~~~~~~~~~

    When the CPM engine advances dates using ``add_working_days()``, it
    consults the calendar's exception records to skip non-working days
    and respect reduced/extended hours.  This replaces the naive
    "skip weekends" logic with full calendar-aware scheduling.

    For example, if a task's Early Finish falls on a statutory holiday,
    the CPM engine will push the successor's Early Start to the next
    available working day.

    Attributes
    ----------
    id : UUID
        Unique identifier for this exception.
    calendar_id : UUID
        Foreign key to :class:`WorkingCalendar` — the parent calendar
        this exception belongs to.
    exception_date : date
        The specific date this exception applies to.
    exception_type : CalendarExceptionType
        The type of exception (holiday, maintenance, overtime).
    working_hours_override : Decimal(4, 2)
        The number of working hours on this date.  0.00 means a
        non-working day.  Values above the calendar's standard
        hours indicate an overtime surge.
    description : str
        Human-readable description of the exception.
    """
    __tablename__ = "calendar_exceptions"

    id = Column(Uuid, primary_key=True, default=uuid4)
    calendar_id = Column(
        Uuid,
        ForeignKey("working_calendars.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exception_date = Column(Date, nullable=False, index=True)
    exception_type = Column(SAEnum(CalendarExceptionType), nullable=False)
    working_hours_override = Column(Numeric(4, 2), nullable=False, default=0.00)
    description = Column(String(500), nullable=False)

    # Relationships
    calendar = relationship("WorkingCalendar", back_populates="exceptions")

    __table_args__ = (
        Index("ix_cal_exc_calendar_date", "calendar_id", "exception_date"),
        UniqueConstraint("calendar_id", "exception_date"),
    )


# ============================================================================
# Spatial Location Tracking & Asset Custody
# ============================================================================


class AssetLocationLedger(Base):
    """Immutable audit record of a physical asset/equipment location change.

    In defence programme management, tracking the physical custody chain of
    classified equipment is critical for security compliance.  Every time an
    asset (e.g., a test bench, classified laptop, or RF measurement device)
    is moved from one location to another, this model records the transition
    as an immutable ledger entry.

    Why track asset movements?
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    - **Chain of Custody** — Regulators require a complete audit trail
      showing where classified equipment has been at all times.
    - **Security Compliance** — A SECRET-classified asset cannot be placed
      in an OFFICIAL-rated storage bay.  The system enforces this at move
      time via clearance interlocks.
    - **Operational Awareness** — Programme managers need to know where
      critical test equipment is located to plan integration activities.
    - **Loss Prevention** — If an asset goes missing, the ledger provides
      the last known location and the user who moved it.

    Clearance Interlocks
    ~~~~~~~~~~~~~~~~~~~~

    Before a move is permitted, the system checks:

    1. **User Clearance** — The moving user must have clearance at or above
       the target location's security classification.
    2. **Asset Classification** — The asset's own classification must not
       exceed the target location's rating.  For example, a SECRET asset
       cannot be placed in an OFFICIAL storage container.

    If either check fails, the move is rejected with a 403 error.

    Integration with ForensicAuditLog
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Every move is also recorded in the :class:`ForensicAuditLog` with a
    SHA-256 chained hash, providing tamper-evident audit capability.

    Attributes
    ----------
    id : UUID
        Unique identifier for this ledger entry.
    resource_node_id : UUID
        Foreign key to :class:`ResourceNode` — the asset or equipment being
        moved (resource_type must be ASSET or EQUIPMENT).
    from_location_id : UUID or None
        Foreign key to :class:`LocationNode` — the location the asset is
        moving from.  Nullable for initial commissioning (first recorded
        location of a new asset).
    to_location_id : UUID
        Foreign key to :class:`LocationNode` — the location the asset is
        being moved to.
    moved_by_user_id : int
        Foreign key to :class:`User` — the user who physically moved the
        asset.
    authorized_by_user_id : int or None
        Foreign key to :class:`User` — a supervisor who authorised the move
        (required for high-value or classified assets).
    associated_task_id : UUID or None
        Foreign key to :class:`PortfolioNode` — the work package or task
        associated with this move (e.g., "Move test bench to integration
        bay for Phase 2 testing").
    movement_timestamp : datetime
        Timestamp when the move occurred.
    movement_reason : str
        Human-readable explanation of why the asset was moved.
    notes : str or None
        Additional free-text notes about the move.
    """
    __tablename__ = "asset_location_ledger"

    id = Column(Uuid, primary_key=True, default=uuid4)

    resource_node_id = Column(
        Uuid,
        ForeignKey("resource_nodes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    from_location_id = Column(
        Uuid,
        ForeignKey("location_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    to_location_id = Column(
        Uuid,
        ForeignKey("location_nodes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    moved_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    authorized_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    associated_task_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    movement_timestamp = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
        index=True,
    )

    movement_reason = Column(String(500), nullable=False)
    notes = Column(Text, nullable=True)

    # Relationships
    resource_node = relationship(
        "ResourceNode",
        foreign_keys=[resource_node_id],
    )
    from_location = relationship(
        "LocationNode",
        foreign_keys=[from_location_id],
    )
    to_location = relationship(
        "LocationNode",
        foreign_keys=[to_location_id],
    )
    moved_by = relationship(
        "User",
        foreign_keys=[moved_by_user_id],
    )
    authorized_by = relationship(
        "User",
        foreign_keys=[authorized_by_user_id],
    )
    associated_task = relationship(
        "UniversalBreakdownNode",
        foreign_keys=[associated_task_id],
    )

    __table_args__ = (
        Index("ix_asset_ledger_resource", "resource_node_id"),
        Index("ix_asset_ledger_to_location", "to_location_id"),
        Index("ix_asset_ledger_timestamp", "movement_timestamp"),
    )


# ============================================================================
# Foreign Currency Exchange Rates & Financial Hedging
# ============================================================================


class ExchangeRateType(str, enum.Enum):
    """Type of exchange rate record for currency conversion.

    In international defence supply chains, components and sub-assemblies
    are often sourced from foreign suppliers priced in their local currency.
    The exchange rate type determines how the conversion rate is determined
    and whether it can fluctuate over time.

    Why different rate types?
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    - **CONTRACTUAL_FIXED** — The exchange rate is locked at contract
      signing.  This eliminates currency risk for both parties and is
      common in long-term defence contracts where budget certainty is
      paramount.  The rate never changes regardless of market movements.

    - **FLOATING_SPOT** — The exchange rate floats with the current
      market spot rate on the valuation date.  This exposes the project
      to currency fluctuation risk but may be required when no fixed
      rate agreement exists.

    - **FORWARD_HEDGE** — A forward contract rate that locks in a future
      exchange rate.  Financial hedging is used to mitigate currency
      risk without fully fixing the rate at contract signing.  The
      forward rate may differ from the spot rate due to interest rate
      differentials between currencies.

    Values
    ------
    CONTRACTUAL_FIXED : str
        A fixed exchange rate agreed at contract signing.  The rate
        remains constant for the life of the contract regardless of
        market movements.
    FLOATING_SPOT : str
        The current market spot rate on the valuation date.  The rate
        fluctuates with foreign exchange markets.
    FORWARD_HEDGE : str
        A forward contract rate that locks in a future exchange rate.
        Used for financial hedging to mitigate currency risk.
    """
    CONTRACTUAL_FIXED = "CONTRACTUAL_FIXED"
    FLOATING_SPOT = "FLOATING_SPOT"
    FORWARD_HEDGE = "FORWARD_HEDGE"


class CurrencyExchangeRate(Base):
    """A foreign currency exchange rate record for financial conversion.

    International defence programmes frequently involve multi-currency
    procurement: a UK-based programme may source avionics from the US
    (priced in USD), radar components from France (priced in EUR), and
    software from Canada (priced in CAD).  The CurrencyExchangeRate table
    provides the conversion rates needed to consolidate all costs into
    a single base currency (typically GBP for UK defence programmes).

    Rate Types
    ~~~~~~~~~~

    1. **CONTRACTUAL_FIXED** — The rate is locked at contract signing.
       This is the most common type for defence contracts where budget
       certainty is required.  The rate does not change over time.

       Example: A contract signed on 2026-01-15 fixes GBP/USD at 1.270000.
       All USD costs under this contract are converted at 1.27 regardless
       of market movements.

    2. **FLOATING_SPOT** — The rate follows the current market spot rate.
       Multiple records may exist for the same currency pair, each with
       a different effective date range.  The system selects the rate
       whose effective_start_date <= valuation_date <= effective_end_date.

       Example: Daily spot rates for GBP/USD are loaded from a financial
       data feed, each with a one-day effective period.

    3. **FORWARD_HEDGE** — A forward contract rate that locks in a future
       exchange rate.  This is used when the organisation has entered a
       financial hedge to mitigate currency risk.

       Example: A forward contract locks in GBP/USD at 1.250000 for
       delivery in Q3 2026, protecting against USD appreciation.

    Effective Date Ranges
    ~~~~~~~~~~~~~~~~~~~~~

    Each rate record has an ``effective_start_date`` and an optional
    ``effective_end_date``.  When resolving the applicable rate for a
    valuation date, the system finds the record where:

    - ``effective_start_date <= valuation_date``
    - ``effective_end_date >= valuation_date`` (or ``effective_end_date IS NULL``)

    This allows maintaining a history of rate changes while always
    knowing which rate applied at any point in time.

    Currency Variance Analysis
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    The system separates standard Cost Variance (CV) from currency
    fluctuation impact (FX Variance):

    - **CV (Cost Variance)** = EV - AC  (standard EVM cost performance)
    - **FX Variance** = (Rate_actual - Rate_baseline) × Direct

    This allows programme managers to distinguish between genuine
    cost overruns and currency-driven variances.

    Integration with CBS Rollup
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~

    When the CBS (Cost Breakdown Structure) rollup aggregates costs
    across the WBS hierarchy, it converts foreign-currency items into
    the project's base currency using the contractually agreed rate.
    This ensures the financial rollup is expressed in a single currency.

    Attributes
    ----------
    id : UUID
        Unique identifier for this exchange rate record.
    base_currency : str
        The base currency code (3-letter ISO, e.g., 'GBP').  This is
        the currency the target currency is being converted FROM.
    target_currency : str
        The target currency code (3-letter ISO, e.g., 'USD', 'EUR').
        This is the currency being converted TO.
    rate_type : ExchangeRateType
        The type of rate (CONTRACTUAL_FIXED, FLOATING_SPOT, FORWARD_HEDGE).
    exchange_rate : Decimal(12, 6)
        The exchange rate value.  For example, if base_currency is 'GBP'
        and target_currency is 'USD', a rate of 1.270000 means
        1 GBP = 1.27 USD.
    effective_start_date : date
        The date from which this rate is valid.
    effective_end_date : date or None
        The date until which this rate is valid.  If NULL, the rate
        remains valid indefinitely (common for CONTRACTUAL_FIXED rates).
    created_at : datetime
        Timestamp when the rate record was created.
    updated_at : datetime
        Timestamp when the rate record was last modified.
    """
    __tablename__ = "currency_exchange_rates"

    id = Column(Uuid, primary_key=True, default=uuid4)

    base_currency = Column(
        String(3),
        nullable=False,
        index=True,
    )
    target_currency = Column(
        String(3),
        nullable=False,
        index=True,
    )
    rate_type = Column(
        SAEnum(ExchangeRateType),
        nullable=False,
    )
    exchange_rate = Column(
        Numeric(12, 6),
        nullable=False,
    )
    effective_start_date = Column(
        Date,
        nullable=False,
        index=True,
    )
    effective_end_date = Column(
        Date,
        nullable=True,
    )
    created_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        default=_utc_now,
        onupdate=_utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("ix_currency_rate_pair_dates", "base_currency", "target_currency", "effective_start_date"),
    )


# ============================================================================
# Sub-Tree Lock Manager
# ============================================================================


class LockOperationType(str, enum.Enum):
    """Types of long-running operations that acquire sub-tree locks.

    When a long-running schedule operation (CPM recalculation, resource
    leveling, baseline freeze, or airgap import) begins, it acquires a
    lock on the affected ltree sub-tree to prevent concurrent mutations
    that could corrupt the calculation or produce inconsistent results.

    The lock is held for the duration of the operation and automatically
    expires after a configurable TTL (default 30 seconds) to prevent
    permanent deadlocks if a worker crashes without releasing the lock.

    Values
    ------
    CPM_RECALCULATION : str
        Critical Path Method forward and backward pass across the entire
        project sub-tree.  During this time, no node dates, dependencies,
        or resource assignments should change.
    RESOURCE_LEVELING : str
        Burgess-Killebrew heuristic leveling that proposes and applies
        date shifts to resolve resource overallocations.
    BASELINE_FREEZE : str
        Cloning the live WBS sub-tree into BaselineNodeSnapshot rows.
        The source tree must not change during the snapshot.
    AIRGAP_IMPORT : str
        Ingesting a .defpack bundle and merging imported nodes into the
        target air-gapped PostgreSQL instance via ltree reparenting.
    """
    CPM_RECALCULATION = "CPM_RECALCULATION"
    RESOURCE_LEVELING = "RESOURCE_LEVELING"
    BASELINE_FREEZE = "BASELINE_FREEZE"
    AIRGAP_IMPORT = "AIRGAP_IMPORT"


class SubTreeLock(Base):
    """A database-level lock on an ltree sub-tree during long-running operations.

    This model prevents concurrent mutations while schedule operations
    (CPM recalculation, heuristic leveling, baseline freeze, airgap import)
    are running on an ltree sub-tree.  Without these locks, two simultaneous
    CPM recalculations could read inconsistent state, or a user editing a
    node's dates mid-recalculation could produce corrupted schedule metrics.

    How it works
    ~~~~~~~~~~~~

    1. Before a long-running operation begins, the service layer calls
       ``acquire_subtree_lock()`` with the root ltree path being operated
       on, the operation type, and the user ID.

    2. The lock manager checks for overlapping locks using ltree operators:

       - **Child lock**: ``existing_lock.root_path <@ new_path`` — an
         ancestor of the requested path is already locked.
       - **Ancestor lock**: ``existing_lock.root_path @> new_path`` — a
         descendant of the requested path is already locked.

    3. If an active, non-expired lock exists, HTTP 423 (Locked) is raised
       with details about the blocking operation.

    4. If no conflict, a new ``SubTreeLock`` record is inserted with a
       TTL-based ``expires_at`` timestamp (default 30 seconds).

    5. The operation executes within the context manager's ``with`` block.

    6. On exit (success or exception), the lock record is removed in a
       ``finally`` block, guaranteeing cleanup even if the operation fails.

    TTL Safety Cutoff
    ~~~~~~~~~~~~~~~~~

    Every lock has an ``expires_at`` timestamp.  If a worker crashes or
    the application restarts before the lock is released, the lock
    automatically expires.  The default TTL is 30 seconds, which is
    sufficient for most CPM recalculations but prevents permanent deadlocks.

    Normal Entity Updates
    ~~~~~~~~~~~~~~~~~~~~~

    In addition to the long-running operation locks, every normal entity
    update (e.g., ``PATCH /api/v1/wbs/{id}``) must check whether the
    node's path falls under an active ``SubTreeLock``.  If locked, the
    request is rejected with HTTP 423 and a clear message:

    "Schedule recalculation in progress by [User]..."

    Attributes
    ----------
    id : UUID
        Unique identifier for this lock record.
    root_path : str
        The ltree path being locked.  This is the path of the root node
        of the sub-tree being operated on (e.g., ``'1.2'`` for a project
        and all its descendants).
    operation_type : LockOperationType
        The type of operation holding the lock (CPM_RECALCULATION,
        RESOURCE_LEVELING, BASELINE_FREEZE, AIRGAP_IMPORT).
    locked_by_user_id : int
        Foreign key to :class:`User` — the user who initiated the
        operation that acquired this lock.
    acquired_at : datetime
        Timestamp when the lock was acquired.
    expires_at : datetime
        TTL safety cutoff.  If the lock is not released by this time,
        it is considered expired and can be safely ignored.
    """
    __tablename__ = "sub_tree_locks"

    id = Column(Uuid, primary_key=True, default=uuid4)

    root_path = Column(
        String(500),
        nullable=False,
        index=True,
    )
    """The ltree path being locked (e.g., '1.2' for a project sub-tree)."""

    operation_type = Column(
        SAEnum(LockOperationType),
        nullable=False,
    )
    """The type of long-running operation holding this lock."""

    locked_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The user who initiated the operation that acquired this lock."""

    acquired_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """Timestamp when the lock was acquired."""

    expires_at = Column(
        DateTime,
        nullable=False,
    )
    """TTL safety cutoff — lock is considered expired after this time."""

    # Relationships
    locked_by = relationship(
        "User",
        foreign_keys=[locked_by_user_id],
    )

    __table_args__ = (
        Index("ix_subtree_lock_path", "root_path"),
        Index("ix_subtree_lock_expires", "expires_at"),
    )


# ============================================================================
# Subcontractor Schedule Ingest
# ============================================================================


class SubcontractorFormat(str, enum.Enum):
    """File formats accepted for subcontractor schedule submissions.

    Defence subcontractors typically use Oracle Primavera P6 or Microsoft
    Project to manage their local schedules.  When a subcontractor submits
    a schedule update for integration into the prime contractor's master
    programme, the file is ingested through this pipeline.

    Values
    ------
    PRIMAVERA_XER : str
        Oracle Primavera P6 .xer batch text format.  This is the most
        common format in defence programmes, as P6 is the industry-standard
        scheduling tool for large-scale engineering projects.
    MS_PROJECT_XML : str
        Microsoft Project XML format (.xml).  Used by subcontractors who
        manage their schedules in MS Project rather than P6.
    """
    PRIMAVERA_XER = "PRIMAVERA_XER"
    MS_PROJECT_XML = "MS_PROJECT_XML"


class SubmissionStatus(str, enum.Enum):
    """Lifecycle status of a subcontractor schedule submission.

    A submission progresses through these states as it is validated,
    reviewed, and ultimately merged (or rejected) into the live WBS.

    Values
    ------
    RECEIVED : str
        The file has been uploaded but not yet validated.  This is the
        initial state when a submission is first created.
    VALIDATING : str
        Automated validation checks are running against the contractual
        boundary gates.  The system is performing DCMA integrity checks
        and milestone compliance verification.
    REJECTED_BREACH : str
        Validation has completed and found one or more critical breaches
        (e.g., milestone slippage beyond contractual tolerance, logic
        tampering).  The submission cannot be merged until the vendor
        corrects the issues.
    STAGED_READY : str
        Validation has passed.  The submission is staged and ready for
        a human reviewer to approve the merge.  The staging diff shows
        the impact on the prime contractual delivery dates.
    ACCEPTED_MERGED : str
        The submission has been approved and its tasks have been merged
        into the live WBS.  A ForensicAuditLog entry records the merge.
    """
    RECEIVED = "RECEIVED"
    VALIDATING = "VALIDATING"
    REJECTED_BREACH = "REJECTED_BREACH"
    STAGED_READY = "STAGED_READY"
    ACCEPTED_MERGED = "ACCEPTED_MERGED"


class SubcontractorSubmission(Base):
    """A subcontractor schedule submission for integration into the prime WBS.

    When a defence subcontractor completes a phase of work or needs to
    update their portion of the master schedule, they submit their local
    schedule file (Primavera P6 .xer or MS Project .xml).  This model
    tracks the submission through the ingest pipeline:

    1. **Upload** — The file is received and a ``SubcontractorSubmission``
       record is created with status ``RECEIVED``.

    2. **Validation** — The system parses the file, extracts tasks and
       dependencies, and runs automated DCMA checks against the contractual
       boundary gates.  Key checks include:

       - **Milestone Integrity**: Contractual handover milestones must not
         slip beyond the subcontract agreement boundary.
       - **Logic Tampering**: The subcontractor must not have deleted
         existing contractual predecessor constraints or introduced
         dangling logic.
       - **Negative Float Inflation**: The subcontractor must not have
         inserted artificial constraints to force positive total float.

    3. **Staging** — If validation passes, the system ephemerally injects
       the proposed DAG into a cloned sandbox branch and runs CPM to
       calculate the impact on prime contractual delivery dates.

    4. **Approval & Merge** — A human reviewer examines the staging diff
       and either approves the merge (committing tasks into the live WBS)
       or rejects the submission.

    Contractual Boundary
    ~~~~~~~~~~~~~~~~~~~~

    Each submission targets a specific WBS node (``target_wbs_root_id``)
    that represents the integration boundary work package.  This is the
    node where the subcontractor's scope of work connects to the prime
    contractor's master schedule.  The validation checks ensure the
    subcontractor's proposed dates and logic are compatible with the
    prime's contractual obligations.

    Submission Report
    ~~~~~~~~~~~~~~~~~

    The ``submission_report`` JSONB field stores the full validation and
    delta analytics report, including:

    - Compliance score (0–100%)
    - List of boundary breaches with severity
    - Staging diff: unchanged, shifted, and newly-critical tasks
    - Float variance on prime contractual delivery dates

    Attributes
    ----------
    id : UUID
        Unique identifier for this submission.
    vendor_cage_code : str
        NATO/CAGE code of the submitting vendor (e.g., '4Y9K2').
    subcontract_reference : str
        Subcontract reference number (e.g., 'SC-RADAR-2026-09').
    target_wbs_root_id : UUID
        Foreign key to :class:`PortfolioNode` — the integration boundary
        work package where the subcontractor's scope connects.
    submitted_filename : str
        Original filename of the uploaded schedule file.
    format : SubcontractorFormat
        File format (PRIMAVERA_XER or MS_PROJECT_XML).
    status : SubmissionStatus
        Current lifecycle status of the submission.
    submitted_at : datetime
        Timestamp when the submission was received.
    submission_report : dict or None
        JSONB field storing validation results, compliance score,
        boundary breach list, and staging diff analytics.
    """
    __tablename__ = "subcontractor_submissions"

    id = Column(Uuid, primary_key=True, default=uuid4)

    vendor_cage_code = Column(
        String(20),
        nullable=False,
        index=True,
    )
    """NATO/CAGE code of the submitting vendor."""

    subcontract_reference = Column(
        String(100),
        nullable=False,
        index=True,
    )
    """Subcontract reference number (e.g., 'SC-RADAR-2026-09')."""

    target_wbs_root_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The integration boundary work package in the prime WBS."""

    submitted_filename = Column(
        String(500),
        nullable=False,
    )
    """Original filename of the uploaded schedule file."""

    format = Column(
        SAEnum(SubcontractorFormat),
        nullable=False,
    )
    """File format of the submitted schedule."""

    status = Column(
        SAEnum(SubmissionStatus),
        nullable=False,
        default=SubmissionStatus.RECEIVED,
        index=True,
    )
    """Current lifecycle status of the submission."""

    submitted_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """Timestamp when the submission was received."""

    submission_report = Column(
        JSONB,
        nullable=True,
    )
    """JSONB field storing validation results and staging diff analytics."""

    # Relationships
    target_wbs_root = relationship(
        "PortfolioNode",
        foreign_keys=[target_wbs_root_id],
    )

    __table_args__ = (
        Index("ix_subcontractor_submission_status", "status"),
        Index("ix_subcontractor_submission_vendor", "vendor_cage_code"),
    )


# ============================================================================
# Programme Archive Seal — WORM Cold Storage
# ============================================================================


class ProgrammeArchiveSeal(Base):
    """Tamper-evident seal record for a programme closed out to cold storage.

    When a defence programme reaches its end of life, it is formally closed
    out and sealed for long-term archival.  This model records the
    cryptographic state of the programme at the moment of sealing, creating
    a Write-Once-Read-Many (WORM) seal that can be verified at any future
    date to prove the programme data has not been tampered with.

    The sealing process:

    1. **Deactivate** — All nodes in the programme's ltree sub-tree are set
       to ``is_active = False``, placing the programme into a permanent
       read-only state.

    2. **Export** — All relational tables, dependency graphs, baseline
       snapshots, and artifact attachments are exported into a self-contained
       archive package.

    3. **Checksum** — An exhaustive SHA-256 manifest is generated, recording
       the hash of every archived entity and file.

    4. **Sign** — The manifest is cryptographically signed using the server's
       private key or local HSM certificate.

    5. **Seal** — This ``ProgrammeArchiveSeal`` record is created, linking
       the cryptographic head of the audit ledger to the archive manifest
       hash and the cold-storage vault URI.

    Integrity Verification
    ~~~~~~~~~~~~~~~~~~~~~~

    At any future date, ``verify_archive_integrity()`` re-computes hashes
    across the archived dataset, validates the embedded signature, and
    confirms that the audit log chain links directly to
    ``final_sha256_audit_head``.  If any link in the chain is broken, the
    archive is flagged as tampered.

    Attributes
    ----------
    id : UUID
        Unique identifier for this seal record.
    portfolio_node_id : UUID
        Foreign key to the Programme root :class:`PortfolioNode` that was
        sealed.  Only one seal record may exist per programme root.
    sealed_at : datetime
        Timestamp when the seal was created (UTC).
    sealed_by_user_id : UUID
        Foreign key to the :class:`User` who initiated the closeout.
    final_sha256_audit_head : str
        The SHA-256 hash of the last :class:`ForensicAuditLog` entry at
        the moment of sealing.  This anchors the audit chain.
    archive_manifest_hash : str
        SHA-256 hash of the complete exported programme dataset manifest.
    storage_vault_uri : str
        Path or URI to the offline cold-storage volume where the archive
        package is stored (e.g., ``/vault/programmes/PROG-001/``).
    is_verified_intact : bool
        Flag indicating whether the archive has been verified as intact
        since sealing.  Set to ``True`` after a successful
        ``verify_archive_integrity()`` run.
    """
    __tablename__ = "programme_archive_seals"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    """The Programme root node that was sealed for cold storage."""

    sealed_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """Timestamp when the seal was created."""

    sealed_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    """The user who initiated the programme closeout."""

    final_sha256_audit_head = Column(
        String(64),
        nullable=False,
    )
    """SHA-256 hash of the last ForensicAuditLog entry at sealing."""

    archive_manifest_hash = Column(
        String(64),
        nullable=False,
    )
    """SHA-256 hash of the complete exported programme dataset."""

    storage_vault_uri = Column(
        String(500),
        nullable=False,
    )
    """Path or URI to the offline cold-storage volume."""

    is_verified_intact = Column(
        Boolean,
        default=False,
        nullable=False,
    )
    """Whether the archive has been verified as intact since sealing."""

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )
    sealed_by_user = relationship(
        "User",
        foreign_keys=[sealed_by_user_id],
    )

    __table_args__ = (
        Index("ix_programme_archive_seal_node", "portfolio_node_id"),
        Index("ix_programme_archive_seal_at", "sealed_at"),
    )


# ============================================================================
# Spillage Purge Signature — Multi-signature authorization
# ============================================================================


class SpillagePurgeSignature(Base):
    """Multi-signature authorization record for classified spillage purges.

    Under UK MOD JSP 440 / JSP 604 and US DoD IL5/IL6 guidelines, any
    emergency spillage purge requires authorization from at least two
    Superusers with clearance at or above SECRET.  This model records
    each authorizing signature so that the multi-sig requirement can be
    verified before the purge executes.

    Workflow
    ~~~~~~~~

    1. An incident ticket is created referencing the spillage event.
    2. The first Superuser signs the purge request, creating a signature
       record with status ``PENDING_SECOND_SIGNATURE``.
    3. A second Superuser signs the same request, creating another
       signature record.
    4. Once two valid signatures exist, the purge engine executes the
       emergency scrub.

    Attributes
    ----------
    id : UUID
        Unique identifier for this signature record.
    incident_ticket_ref : str
        Reference to the security incident ticket authorizing the purge.
    purging_user_id : int
        Foreign key to the :class:`User` who provided this signature.
    signed_at : datetime
        Timestamp when the signature was recorded (UTC).
    signature_hash : str
        SHA-256 hash of the purge request parameters signed by this user.
    certificate_serial : str or None
        Smartcard certificate serial number used for the signature
        (if PKI authentication was used).
    """
    __tablename__ = "spillage_purge_signatures"

    id = Column(Uuid, primary_key=True, default=uuid4)

    incident_ticket_ref = Column(
        String(100),
        nullable=False,
        index=True,
    )
    """Security incident ticket reference."""

    purging_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    """The Superuser who provided this signature."""

    signed_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """Timestamp when the signature was recorded."""

    signature_hash = Column(
        String(64),
        nullable=False,
    )
    """SHA-256 hash of the purge request parameters."""

    certificate_serial = Column(
        String(100),
        nullable=True,
    )
    """Smartcard certificate serial number (if PKI auth was used)."""

    # Relationships
    purging_user = relationship(
        "User",
        foreign_keys=[purging_user_id],
    )

    __table_args__ = (
        Index("ix_spillage_purge_ticket", "incident_ticket_ref"),
        Index("ix_spillage_purge_signed_at", "signed_at"),
    )


# ============================================================================
# Chamber Reservation — Facility booking and environmental envelope tracking
# ============================================================================


class ChamberReservation(Base):
    """Reservation record for high-demand physical resources.

    This model manages bookings for facilities like EMC Anechoic Chambers,
    Thermal Vacuum Chambers, and Hardware-in-the-Loop (HIL) rigs.  Each
    reservation links a testing activity (PortfolioNode) to a physical
    location (LocationNode) with a time window, power profile, and
    designated test operator.

    Reservation Validation
    ~~~~~~~~~~~~~~~~~~~~~~

    Before a reservation is committed, :func:`app.services.facility_telemetry.validate_chamber_feasibility`
    performs three gates:

    1. **Capability Gate** — The task's required environmental envelope
       (e.g., operating temperature range) must fall within the chamber's
       ``chamber_capabilities``.

    2. **Calibration Gate** — The reservation's end time must not exceed
       the chamber's ``calibration_expiry_date``.

    3. **Buffer Enforcement** — Automatic warmup/cooldown buffer windows
       (``requires_warmup_cooldown_hours``) are inserted around the test
       run.  If two reservations overlap within a buffer window, a
       FACILITY_CONTRAVENTION clash is raised.

    Attributes
    ----------
    id : UUID
        Unique identifier for this reservation.
    location_node_id : UUID
        Foreign key to the :class:`LocationNode` being reserved.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` representing the testing
        activity.
    reserved_start : datetime
        Timezone-aware start of the reserved window (UTC).
    reserved_end : datetime
        Timezone-aware end of the reserved window (UTC).
    setup_teardown_hours : float
        Additional hours for setup and teardown around the test run
        (default 1.0).
    power_profile_kw : float or None
        Expected power draw in kilowatts during the test run.  Used to
        validate against the chamber's ``max_power_kw`` capability.
    test_operator_user_id : UUID
        Foreign key to the :class:`User` designated as the test operator.
    """
    __tablename__ = "chamber_reservations"

    id = Column(Uuid, primary_key=True, default=uuid4)

    location_node_id = Column(
        Uuid,
        ForeignKey("location_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The physical location (chamber, rig, etc.) being reserved."""

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The testing activity that requires this facility."""

    reserved_start = Column(
        DateTime,
        nullable=False,
    )
    """Timezone-aware start of the reservation window (UTC)."""

    reserved_end = Column(
        DateTime,
        nullable=False,
    )
    """Timezone-aware end of the reservation window (UTC)."""

    setup_teardown_hours = Column(
        Float,
        default=1.0,
        nullable=False,
    )
    """Additional hours for setup and teardown around the test run."""

    power_profile_kw = Column(
        Float,
        nullable=True,
    )
    """Expected power draw in kilowatts during the test run."""

    test_operator_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    """The user designated as the test operator."""

    # Relationships
    location_node = relationship(
        "LocationNode",
        foreign_keys=[location_node_id],
    )
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )
    test_operator = relationship(
        "User",
        foreign_keys=[test_operator_user_id],
    )

    __table_args__ = (
        Index("ix_chamber_reservation_location", "location_node_id"),
        Index("ix_chamber_reservation_portfolio", "portfolio_node_id"),
        Index("ix_chamber_reservation_start", "reserved_start"),
        Index("ix_chamber_reservation_end", "reserved_end"),
        Index("ix_chamber_reservation_operator", "test_operator_user_id"),
    )


class MaintenanceType(enum.Enum):
    """Types of maintenance downtime windows for physical equipment.

    These categories distinguish between planned recalibration events,
    unscheduled repairs, and comprehensive annual overhauls.  Each type
    carries different implications for schedule planning and compliance
    reporting.

    Values
    -------

    SCHEDULED_RECALIBRATION
        Planned recalibration event to maintain measurement accuracy.
        Typically occurs at regular intervals (e.g., every 180 or 365 days)
        as defined by the equipment's calibration certificate.

    UNSCHEDULED_REPAIR
        Unexpected repair due to equipment failure, damage, or drift
        detected during routine use.  May require root cause analysis
        and extended downtime.

    ANNUAL_OVERHAUL
        Comprehensive annual inspection and refurbishment.  Includes
        full calibration, component replacement, and performance
        verification against manufacturer specifications.
    """
    SCHEDULED_RECALIBRATION = "SCHEDULED_RECALIBRATION"
    UNSCHEDULED_REPAIR = "UNSCHEDULED_REPAIR"
    ANNUAL_OVERHAUL = "ANNUAL_OVERHAUL"


class MaintenanceDowntimeWindow(Base):
    """Scheduled maintenance window for physical test equipment.

    This model records periods when a :class:`ResourceNode` (typically
    an ASSET-type resource) is unavailable for assignment due to
    maintenance activities.  The CPM engine treats these windows as
    non-working calendar exceptions for the affected resource,
    automatically pushing dependent task start dates forward.

    Why track maintenance windows?
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    In defence programme management, test equipment must undergo regular
    calibration and maintenance to maintain measurement accuracy and
    compliance with quality standards (e.g., ISO 17025).  Failing to
    account for these downtime periods in the schedule leads to:

    - **Over-allocated resources** — Tasks scheduled during maintenance
      windows cannot be executed.
    - **Compliance violations** — Using equipment outside its valid
      calibration window invalidates test results.
    - **Schedule slippage** — Unplanned maintenance delays cascade
      through the dependency chain.

    CPM Integration
    ~~~~~~~~~~~~~~~

    The CPM forward pass in :func:`app.services.cpm_engine.forward_pass`
    checks for active maintenance windows on assigned equipment resources.
    If a task's planned start falls within a maintenance window, the
    Early Start (ES) is pushed to the first available working day after
    the window closes.

    Attributes
    ----------
    id : UUID
        Unique identifier for this maintenance window.
    resource_node_id : UUID
        Foreign key to the :class:`ResourceNode` undergoing maintenance.
    downtime_start : datetime
        Timezone-aware start of the maintenance window (UTC).
    downtime_end : datetime
        Timezone-aware end of the maintenance window (UTC).
    maintenance_type : MaintenanceType
        Category of maintenance (recalibration, repair, or overhaul).
    work_order_reference : str
        Reference number for the work order or maintenance ticket.
    technician_name : str
        Name of the technician or contractor performing the maintenance.
    """
    __tablename__ = "maintenance_downtime_windows"

    id = Column(Uuid, primary_key=True, default=uuid4)

    resource_node_id = Column(
        Uuid,
        ForeignKey("resource_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The equipment resource undergoing maintenance."""

    downtime_start = Column(
        DateTime,
        nullable=False,
    )
    """Timezone-aware start of the maintenance window (UTC)."""

    downtime_end = Column(
        DateTime,
        nullable=False,
    )
    """Timezone-aware end of the maintenance window (UTC)."""

    maintenance_type = Column(
        SAEnum(MaintenanceType),
        nullable=False,
    )
    """Category of maintenance activity."""

    work_order_reference = Column(String(64), nullable=False)
    """Work order or maintenance ticket reference number."""

    technician_name = Column(String(128), nullable=False)
    """Name of the technician or contractor performing the work."""

    # Relationships
    resource_node = relationship(
        "ResourceNode",
        foreign_keys=[resource_node_id],
    )

    __table_args__ = (
        Index("ix_maintenance_downtime_resource", "resource_node_id"),
        Index("ix_maintenance_downtime_start", "downtime_start"),
        Index("ix_maintenance_downtime_end", "downtime_end"),
    )


# ============================================================================
# Systems Engineering Safety Governance
# ============================================================================


class ConcessionType(str, enum.Enum):
    """Types of engineering concessions in the technical ledger.

    Engineering concessions are formal requests to deviate from the
    approved design, requirements, or manufacturing specifications.
    They are tracked through a formal disposition process to ensure
    traceability and accountability.

    Values
    ------

    REQUEST_FOR_DEVIATION
        A formal request to permanently deviate from an approved
        design specification.  Requires engineering justification
        and customer approval.

    REQUEST_FOR_CONCESSION
        A formal request to accept a non-conforming item without
        rework.  The item does not meet the specification but is
        deemed acceptable for its intended use.
    """
    REQUEST_FOR_DEVIATION = "REQUEST_FOR_DEVIATION"
    REQUEST_FOR_CONCESSION = "REQUEST_FOR_CONCESSION"


class ConcessionDisposition(str, enum.Enum):
    """Disposition outcomes for engineering concessions.

    When an engineering concession is reviewed, it is assigned one
    of these disposition outcomes.  The disposition determines
    whether the affected item can proceed to the next phase.

    Values
    ------

    SUBMITTED
        Concession has been submitted for review but not yet
        evaluated by the engineering team.

    UNDER_REVIEW
        The concession is currently under active review by the
        Lead Systems Engineer and/or customer Quality Assurance.

    REWORK_REQUIRED
        The non-conforming item must be reworked to meet the
        original specification before proceeding.

    SCRAP
        The non-conforming item cannot be reworked and must be
        discarded and replaced.

    USE_AS_IS_APPROVED
        The item is accepted in its current state despite not
        meeting the original specification.  Requires formal
        engineering justification and customer signoff.

    REJECTED
        The concession request has been rejected.  The item must
        be reworked or scrapped.
    """
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    REWORK_REQUIRED = "REWORK_REQUIRED"
    SCRAP = "SCRAP"
    USE_AS_IS_APPROVED = "USE_AS_IS_APPROVED"
    REJECTED = "REJECTED"


class SafetySignificance(str, enum.Enum):
    """Safety significance rating for engineering concessions.

    This rating determines the urgency and review depth required
    for an engineering concession.  Critical concessions may block
    programme milestones until resolved.

    Values
    ------

    CRITICAL
        The concession affects a safety-critical function.  Requires
        immediate review and may block programme milestones.

    MAJOR
        The concession affects a significant non-safety function.
        Requires thorough review but does not block milestones.

    MINOR
        The concession affects a minor function with negligible
        safety impact.  Standard review process applies.
    """
    CRITICAL = "CRITICAL"
    MAJOR = "MAJOR"
    MINOR = "MINOR"


class EngineeringConcession(Base):
    """Technical concession ledger entry for engineering governance.

    This model tracks formal engineering concessions — requests to
    deviate from approved design specifications or to accept
    non-conforming items.  Each concession follows a formal review
    and disposition process to ensure traceability and accountability.

    Why track engineering concessions?
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    In defence programme management, any deviation from the approved
    design baseline must be formally documented and approved.  This
    ensures:

    - **Safety compliance** — High-DAL items cannot proceed with
      open, unapproved concessions.
    - **Traceability** — Every concession is linked to the affected
      work package, serial number, and reviewing engineer.
    - **Customer oversight** — Critical concessions require customer
      Quality Assurance (QAC) signoff before disposition.
    - **Audit trail** — The complete concession history is available
      for external accreditation and safety reviews.

    Safety Gate Integration
    ~~~~~~~~~~~~~~~~~~~~~~~

    The :func:`app.services.engineering_governance.evaluate_dal_signoff_gate`
    function checks for open, unapproved EngineeringConcession records
    before allowing task completion on high-DAL nodes.  If an open
    concession exists, completion is rejected with HTTP 422.

    Attributes
    ----------
    id : UUID
        Unique identifier for this concession record.
    concession_number : str
        Unique concession tracking number (e.g., 'RFC-2026-AVIONICS-042').
    concession_type : ConcessionType
        Whether this is a Request for Deviation or Request for Concession.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` affected by this concession.
    serial_number_affected : str or None
        Serial number of the specific hardware unit affected (if applicable).
    disposition : ConcessionDisposition
        Current disposition status of the concession.
    safety_significance : SafetySignificance
        Safety impact rating (CRITICAL, MAJOR, or MINOR).
    lead_systems_engineer_user_id : UUID
        Foreign key to the :class:`User` responsible for reviewing this concession.
    customer_qac_signoff_ref : str or None
        Reference number for customer Quality Assurance signoff.
    approved_at : datetime or None
        Timestamp when the concession was formally approved.
    """
    __tablename__ = "engineering_concessions"

    id = Column(Uuid, primary_key=True, default=uuid4)

    concession_number = Column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )
    """Unique concession tracking number (e.g., 'RFC-2026-AVIONICS-042')."""

    concession_type = Column(
        SAEnum(ConcessionType),
        nullable=False,
    )
    """Type of concession request."""

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The portfolio node (work package) affected by this concession."""

    serial_number_affected = Column(
        String(128),
        nullable=True,
    )
    """Serial number of the specific hardware unit affected."""

    disposition = Column(
        SAEnum(ConcessionDisposition),
        default=ConcessionDisposition.SUBMITTED,
        nullable=False,
    )
    """Current disposition status of the concession."""

    safety_significance = Column(
        SAEnum(SafetySignificance),
        nullable=False,
    )
    """Safety impact rating of this concession."""

    lead_systems_engineer_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    """The Lead Systems Engineer reviewing this concession."""

    customer_qac_signoff_ref = Column(
        String(128),
        nullable=True,
    )
    """Customer Quality Assurance signoff reference number."""

    approved_at = Column(
        DateTime,
        nullable=True,
    )
    """Timestamp when the concession was formally approved."""

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )
    lead_systems_engineer = relationship(
        "User",
        foreign_keys=[lead_systems_engineer_user_id],
    )

    __table_args__ = (
        Index("ix_engineering_concession_node", "portfolio_node_id"),
        Index("ix_engineering_concession_disposition", "disposition"),
        Index("ix_engineering_concession_safety", "safety_significance"),
        Index("ix_engineering_concession_engineer", "lead_systems_engineer_user_id"),
    )


# ============================================================================
# Commercial Governance Enums
# ============================================================================


class ContractPricingType(str, enum.Enum):
    """Contractual pricing mechanism types for defence procurement.

    The pricing type determines how costs, fees, and incentives are
    calculated between the government customer and the prime contractor.
    Each type has different risk allocation and incentive structures.

    Values
    ------

    FIRM_FIXED_PRICE
        The contractor bears all cost risk.  The price is fixed at
        contract award and does not change regardless of actual costs.
        Best suited for well-defined, low-risk work packages.

    COST_PLUS_FIXED_FEE
        The government reimburses all allowable costs plus a fixed fee
        that does not vary with performance.  The contractor has no
        financial incentive to control costs, but the government bears
        the cost risk.

    TARGET_COST_INCENTIVE_FEE
        A negotiated target cost and target fee form the baseline.
        If actual costs differ from the target, the fee is adjusted
        using pre-agreed shareline ratios (e.g., 70/30 contractor/customer).
        The total price is capped by a ceiling price to protect the
        government from unlimited cost growth.
    """
    FIRM_FIXED_PRICE = "FIRM_FIXED_PRICE"
    COST_PLUS_FIXED_FEE = "COST_PLUS_FIXED_FEE"
    TARGET_COST_INCENTIVE_FEE = "TARGET_COST_INCENTIVE_FEE"


class AcceptanceDocumentType(str, enum.Enum):
    """Types of formal government acceptance documentation.

    In defence procurement, physical delivery of equipment or completion
    of a major milestone requires formal inspection and documentation
    before the government accepts the deliverable.  These documents
    serve as the legal basis for payment and title transfer.

    Values
    ------

    MOD_FORM_640
        UK Ministry of Defence Form 640 — Quality Acceptance Certificate.
        Used for acceptance of defence equipment and materials against
        contract specifications.

    DD_250
        US Department of Defense Form 250 — Material Inspection and
        Receiving Report.  Used for acceptance of defence material
        under US government contracts.

    CERTIFICATE_OF_CONFORMITY
        A generic certificate confirming that the delivered item
        conforms to the contract specifications.  Used when a
        specific form is not mandated by the contracting authority.
    """
    MOD_FORM_640 = "MOD_FORM_640"
    DD_250 = "DD_250"
    CERTIFICATE_OF_CONFORMITY = "CERTIFICATE_OF_CONFORMITY"


class AcceptanceStatus(str, enum.Enum):
    """Status of a government acceptance milestone.

    This tracks the lifecycle of a formal inspection and acceptance
    process, from initial submission through final disposition.

    Values
    ------

    PENDING_INSPECTION
        The deliverable has been submitted and is awaiting formal
        quality inspection by the government inspector.

    ACCEPTED
        The deliverable has passed inspection and been formally
        accepted by the government.  Payment can proceed.

    REJECTED
        The deliverable failed inspection.  The contractor must
        rework or replace the item before resubmission.
    """
    PENDING_INSPECTION = "PENDING_INSPECTION"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


# ============================================================================
# Commercial Governance Models
# ============================================================================


class ProjectContractStructure(Base):
    """Contractual pricing structure for a project-level work package.

    This model captures the commercial terms of a defence contract,
    including the pricing mechanism, target costs, incentive fee
    structure, and shareline ratios.  It is the foundation for
    Target Cost Incentive Fee (TCIF) calculations and fiscal year
    spending cap enforcement.

    Why track contract structure?
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    In defence programme management, the contract type determines
    how financial risk is allocated between the government and
    the contractor.  This model enables:

    - **TCIF fee adjustment** — When actual costs differ from the
      target, the fee is adjusted using the shareline ratios.
      This incentivises the contractor to control costs.

    - **Ceiling price protection** — The total price (cost + fee)
      is capped at the ceiling price, protecting the government
      from unlimited cost growth.

    - **Fiscal year compliance** — Spending caps ensure that
      programme expenditure stays within the allocated funding
      for each fiscal year tranche.

    Attributes
    ----------
    id : UUID
        Unique identifier for this contract structure record.
    portfolio_node_id : UUID
        Foreign key to the root :class:`PortfolioNode` (Project level)
        that this contract structure governs.
    contract_pricing_type : ContractPricingType
        The contractual pricing mechanism (FFP, CPFF, or TCIF).
    target_cost : Numeric(14, 2)
        The negotiated target cost for the work scope.
    target_fee : Numeric(14, 2)
        The negotiated target fee (profit) for the contractor.
    ceiling_price : Numeric(14, 2)
        The maximum total price the government will pay (cost + fee).
    contractor_share_ratio : Numeric(4, 3)
        The contractor's share of cost overruns/underruns (e.g., 0.700).
    customer_share_ratio : Numeric(4, 3)
        The customer's share of cost overruns/underruns (e.g., 0.300).
    """
    __tablename__ = "project_contract_structures"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    """The root project node governed by this contract structure."""

    contract_pricing_type = Column(
        SAEnum(ContractPricingType),
        nullable=False,
    )
    """The contractual pricing mechanism."""

    target_cost = Column(
        Numeric(14, 2),
        nullable=True,
    )
    """Negotiated target cost (TCIF only)."""

    target_fee = Column(
        Numeric(14, 2),
        nullable=True,
    )
    """Negotiated target fee (TCIF only)."""

    ceiling_price = Column(
        Numeric(14, 2),
        nullable=True,
    )
    """Maximum total price the government will pay."""

    contractor_share_ratio = Column(
        Numeric(4, 3),
        nullable=True,
    )
    """Contractor's share of cost variance (e.g., 0.700 for 70%)."""

    customer_share_ratio = Column(
        Numeric(4, 3),
        nullable=True,
    )
    """Customer's share of cost variance (e.g., 0.300 for 30%)."""

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )

    __table_args__ = (
        Index("ix_contract_structure_node", "portfolio_node_id"),
        Index("ix_contract_structure_pricing", "contract_pricing_type"),
    )


class FiscalYearSpendingCap(Base):
    """Fiscal year spending cap for a control account.

    In defence programme management, funding is allocated in annual
    tranches tied to the government's fiscal year.  This model tracks
    the spending cap for each fiscal year at the control account level,
    ensuring that programme expenditure stays within allocated funding.

    Why track fiscal year caps?
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Government funding is appropriated on a fiscal year basis.  If a
    programme's planned spend exceeds the allocated cap for a given
    fiscal year, it triggers a funding gap that must be resolved
    through supplemental appropriations or schedule rescheduling.

    The :func:`app.services.commercial_governance.validate_fiscal_year_spend_profile`
    function checks time-phased cost rollups against these caps and
    flags ``FISCAL_TRANCHE_OVERRUN`` clashes when slips cause in-year
    planned spend to exceed the allocated funding.

    Attributes
    ----------
    id : UUID
        Unique identifier for this spending cap record.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` (Control Account level)
        that this spending cap applies to.
    fiscal_year : str
        Fiscal year identifier (e.g., 'FY26/27').
    fy_start_date : date
        Start date of the fiscal year tranche.
    fy_end_date : date
        End date of the fiscal year tranche.
    allocated_funding_cap : Numeric(14, 2)
        Maximum amount that can be spent in this fiscal year.
    """
    __tablename__ = "fiscal_year_spending_caps"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The control account node governed by this spending cap."""

    fiscal_year = Column(
        String(16),
        nullable=False,
        index=True,
    )
    """Fiscal year identifier (e.g., 'FY26/27')."""

    fy_start_date = Column(
        Date,
        nullable=False,
    )
    """Start date of the fiscal year tranche."""

    fy_end_date = Column(
        Date,
        nullable=False,
    )
    """End date of the fiscal year tranche."""

    allocated_funding_cap = Column(
        Numeric(14, 2),
        nullable=False,
    )
    """Maximum spend allowed in this fiscal year."""

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )

    __table_args__ = (
        Index("ix_fy_cap_node", "portfolio_node_id"),
        Index("ix_fy_cap_year", "fiscal_year"),
        Index("ix_fy_cap_dates", "fy_start_date", "fy_end_date"),
        UniqueConstraint("portfolio_node_id", "fiscal_year",
                         name="uq_fy_cap_node_year"),
    )


class GovernmentAcceptanceMilestone(Base):
    """Formal government acceptance milestone for a deliverable.

    In defence procurement, physical delivery of equipment or completion
    of a major milestone requires formal inspection and signoff by the
    government quality assurance representative.  This model tracks the
    acceptance process from submission through final disposition.

    Why track acceptance milestones?
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Government acceptance is the legal trigger for payment and title
    transfer.  Without formal acceptance, the contractor cannot invoice
    for the deliverable, and the programme cannot recognise the earned
    value for that milestone.

    Acceptance milestones are linked to :class:`PortfolioNode` records
    (typically billing milestones or deliverable work packages) and
    track the type of acceptance document, inspector details, and
    signoff status.

    Attributes
    ----------
    id : UUID
        Unique identifier for this acceptance milestone.
    portfolio_node_id : UUID
        Foreign key to the :class:`PortfolioNode` that this acceptance
        milestone is linked to.
    acceptance_document_type : AcceptanceDocumentType
        The type of formal acceptance document (MOD Form 640, DD-250,
        or Certificate of Conformity).
    receipt_reference_number : str or None
        Reference number for the receipt or delivery note.
    qar_inspector_name : str or None
        Name of the Quality Assurance Representative inspector.
    status : AcceptanceStatus
        Current status (PENDING_INSPECTION, ACCEPTED, or REJECTED).
    signed_off_at : datetime or None
        Timestamp when the acceptance was formally signed off.
    """
    __tablename__ = "government_acceptance_milestones"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The portfolio node (deliverable) linked to this acceptance milestone."""

    acceptance_document_type = Column(
        SAEnum(AcceptanceDocumentType),
        nullable=False,
    )
    """Type of formal acceptance document."""

    receipt_reference_number = Column(
        String(128),
        nullable=True,
    )
    """Reference number for the receipt or delivery note."""

    qar_inspector_name = Column(
        String(256),
        nullable=True,
    )
    """Name of the Quality Assurance Representative inspector."""

    status = Column(
        SAEnum(AcceptanceStatus),
        default=AcceptanceStatus.PENDING_INSPECTION,
        nullable=False,
    )
    """Current acceptance status."""

    signed_off_at = Column(
        DateTime,
        nullable=True,
    )
    """Timestamp when the acceptance was formally signed off."""

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        foreign_keys=[portfolio_node_id],
    )

    __table_args__ = (
        Index("ix_gov_acceptance_node", "portfolio_node_id"),
        Index("ix_gov_acceptance_status", "status"),
        Index("ix_gov_acceptance_doc_type", "acceptance_document_type"),
    )


# ============================================================================
# Perishable Material Enums
# ============================================================================


class MaterialType(str, enum.Enum):
    """Types of perishable materials used in defence manufacturing and testing.

    In aerospace and defence assembly, certain materials have strict
    shelf-life requirements.  Once removed from cold storage, they must
    be used within a defined out-time window or they degrade and become
    unusable, potentially compromising structural integrity.

    Values
    ------

    PREPREG_COMPOSITE
        Pre-impregnated composite materials (e.g., carbon fibre prepreg).
        Stored frozen at -18°C or below.  Once thawed, typically have
        8-24 hours out-time before the resin begins to cure.

    STRUCTURAL_ADHESIVE
        Structural bonding agents (e.g., epoxy adhesives).  Shelf-life
        depends on the specific formulation; some require cold storage
        and have limited out-time once opened.

    CHEMICAL_SEALANT
        Chemical sealants for environmental protection (e.g., potting
        compounds, conformal coatings).  May have limited pot-life
        after mixing.

    PYROTECHNIC
        Pyrotechnic materials (e.g., squibs, initiators, explosive bolts).
        Strictly controlled with expiry dates and storage requirements.
        Require special handling and storage conditions.
    """
    PREPREG_COMPOSITE = "PREPREG_COMPOSITE"
    STRUCTURAL_ADHESIVE = "STRUCTURAL_ADHESIVE"
    CHEMICAL_SEALANT = "CHEMICAL_SEALANT"
    PYROTECHNIC = "PYROTECHNIC"


class LotStatus(str, enum.Enum):
    """Lifecycle status of a perishable material lot.

    Tracks the state of a material lot from receipt through consumption
    or expiry.  The status transitions are:

    IN_COLD_STORAGE -> THAWED_IN_USE -> CONSUMED
                                    -> EXPIRED_SCRAP

    Once a lot is EXPIRED_SCRAP or CONSUMED, it cannot be reused.

    Values
    ------

    IN_COLD_STORAGE
        The material lot is stored in cold storage and has not yet been
        thawed for use.  Shelf-life is measured from the cold_storage_expiry
        date.

    THAWED_IN_USE
        The material has been removed from cold storage and is actively
        being used.  The out-time clock is running, measured by
        accumulated_out_time_hours against maximum_out_time_hours.

    EXPIRED_SCRAP
        The material has exceeded its shelf-life (either cold storage
        expiry or out-time limit) and must be scrapped.  Cannot be
        used for production.

    CONSUMED
        The material lot has been fully consumed in production.  The
        lot is closed and no further usage is possible.
    """
    IN_COLD_STORAGE = "IN_COLD_STORAGE"
    THAWED_IN_USE = "THAWED_IN_USE"
    EXPIRED_SCRAP = "EXPIRED_SCRAP"
    CONSUMED = "CONSUMED"


# ============================================================================
# Perishable Material Lot Model
# ============================================================================


class PerishableMaterialLot(Base):
    """Perishable material lot with cold storage and out-time tracking.

    In defence manufacturing, certain materials (prepreg composites,
    structural adhesives, chemical sealants, pyrotechnics) have strict
    shelf-life requirements.  This model tracks each material lot from
    receipt through consumption or expiry, ensuring that expired materials
    are not used in production.

    Why track perishable materials?
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    Using expired prepreg or adhesive can compromise structural integrity,
    leading to test failures, rework, or in worst cases, in-flight failures.
    The system enforces:

    1. **Cold storage expiry** — Materials must be used before the cold
       storage expiry date, even if never thawed.

    2. **Out-time tracking** — Once thawed, materials have a limited
       window (maximum_out_time_hours) before they degrade.  The clash
       daemon automatically marks lots as EXPIRED_SCRAP when out-time
       is exceeded.

    3. **Task allocation** — Each lot can be allocated to a specific
       assembly task.  If the task is delayed past the lot's expiry,
       an active blocker is generated on the work package.

    Attributes
    ----------
    id : UUID
        Unique identifier for this material lot.
    lot_number : str
        Unique lot/batch number from the manufacturer.
    part_number : str
        Part number or material specification identifier.
    material_type : MaterialType
        The type of perishable material (PREPREG, ADHESIVE, SEALANT, PYRO).
    allocated_task_id : UUID or None
        Foreign key to the :class:`PortfolioNode` (assembly task) that
        this lot is allocated to.
    cold_storage_expiry : date
        The date by which the material must be used, even if stored
        in cold storage.
    thawed_timestamp : datetime or None
        When the material was first removed from cold storage.  Triggers
        the out-time clock.
    maximum_out_time_hours : Numeric(6, 2)
        Maximum hours the material can be out of cold storage before
        it degrades (e.g., 12.00 for 12 hours).
    accumulated_out_time_hours : Numeric(6, 2)
        Total hours the material has been out of cold storage.  Updated
        by telemetry logging when the material is returned to storage
        and retrieved again.
    lot_status : LotStatus
        Current lifecycle status (IN_COLD_STORAGE, THAWED_IN_USE,
        EXPIRED_SCRAP, CONSUMED).
    """
    __tablename__ = "perishable_material_lots"

    id = Column(Uuid, primary_key=True, default=uuid4)

    lot_number = Column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )
    """Unique lot/batch number from the manufacturer."""

    part_number = Column(
        String(64),
        nullable=False,
        index=True,
    )
    """Part number or material specification identifier."""

    material_type = Column(
        SAEnum(MaterialType),
        nullable=False,
    )
    """Type of perishable material."""

    allocated_task_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    """Assembly task this lot is allocated to (nullable if not yet assigned)."""

    cold_storage_expiry = Column(
        Date,
        nullable=False,
        index=True,
    )
    """Date by which the material must be used, even in cold storage."""

    thawed_timestamp = Column(
        DateTime,
        nullable=True,
    )
    """When the material was first removed from cold storage."""

    maximum_out_time_hours = Column(
        Numeric(6, 2),
        nullable=False,
    )
    """Maximum hours the material can be out of cold storage."""

    accumulated_out_time_hours = Column(
        Numeric(6, 2),
        default=0.0,
        nullable=False,
    )
    """Total hours the material has been out of cold storage."""

    lot_status = Column(
        SAEnum(LotStatus),
        default=LotStatus.IN_COLD_STORAGE,
        nullable=False,
    )
    """Current lifecycle status of this material lot."""

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    allocated_task = relationship(
        "PortfolioNode",
        foreign_keys=[allocated_task_id],
    )

    __table_args__ = (
        Index("ix_perishable_lot_status", "lot_status"),
        Index("ix_perishable_lot_expiry", "cold_storage_expiry"),
        Index("ix_perishable_lot_task", "allocated_task_id"),
        Index("ix_perishable_lot_part", "part_number"),
    )


# ============================================================================
# Schedule Quarantine Models
# ============================================================================

class QuarantineFileFormat(enum.Enum):
    """File format of the uploaded schedule file.

    These are the two primary schedule formats used in defence programme
    management that may be submitted by external subcontractors or
    imported from legacy systems.
    """
    PRIMAVERA_P6_XER = "PRIMAVERA_P6_XER"
    """Oracle Primavera P6 .xer batch text format."""
    MS_PROJECT_XML = "MS_PROJECT_XML"
    """Microsoft Project .xml format."""


class QuarantineValidationStatus(enum.Enum):
    """Lifecycle status of a quarantine batch.

    A batch progresses through these states as issues are detected,
    remediated, and ultimately committed or rejected:

    1. **PENDING** — Initial state; file uploaded, awaiting validation.
    2. **QUARANTINED_HAS_ISSUES** — Validation found cycles, dangling
       nodes, or calendar discrepancies; batch is held for review.
    3. **REMEDIATED** — All issues have been resolved via the remediation
       patch; batch is ready for commit.
    4. **COMMITTED** — Batch has been merged into the active master
       schedule.
    5. **REJECTED** — Batch was rejected and will not be committed.
    """
    PENDING = "PENDING"
    """Initial state; file uploaded, awaiting validation."""
    QUARANTINED_HAS_ISSUES = "QUARANTINED_HAS_ISSUES"
    """Validation found issues; batch is held for review."""
    REMEDIATED = "REMEDIATED"
    """All issues resolved; batch is ready for commit."""
    COMMITTED = "COMMITTED"
    """Batch has been merged into the active master schedule."""
    REJECTED = "REJECTED"
    """Batch was rejected and will not be committed."""


class CPMCalculationMode(enum.Enum):
    """CPM calculation mode for out-of-sequence execution.

    When a task has partial progress (0 < percent_complete < 100) but
    has incomplete predecessors, the CPM engine can handle this in two
    ways:

    1. **RETAINED_LOGIC** (default): The remaining duration cannot start
       until incomplete predecessors finish. This is the standard CPM
       behavior that respects all predecessor logic.

    2. **PROGRESS_OVERRIDE**: Disregard unfinished predecessor logic for
       remaining work. The remaining work can start from the status date
       regardless of predecessor completion. This is used when the
       project team has decided to proceed out-of-sequence.

    The mode is stored in the PortfolioNode's ``custom_attributes`` as
    ``cpm_calculation_mode`` and defaults to 'RETAINED_LOGIC'.
    """
    RETAINED_LOGIC = "RETAINED_LOGIC"
    """Remaining work waits for incomplete predecessors to finish."""
    PROGRESS_OVERRIDE = "PROGRESS_OVERRIDE"
    """Remaining work starts from status date, ignoring unfinished preds."""


# ============================================================================
# Line Management, Leave, & Resource Downtime Models
# ============================================================================

class LeaveType(str, enum.Enum):
    """Types of leave that can be requested.
    
    Values
    ------
    ANNUAL : str
        Standard annual leave entitlement.
    SICK : str
        Sick leave for illness or injury.
    MATERNITY : str
        Maternity leave for childbirth and recovery.
    PATERNITY : str
        Paternity leave for new fathers.
    JURY : str
        Jury duty leave.
    UNPAID : str
        Unpaid leave when other entitlements are exhausted.
    TRAINING : str
        Time off for approved training or certification.
    OTHER : str
        Other leave types not covered by standard categories.
    """
    ANNUAL = "ANNUAL"
    SICK = "SICK"
    MATERNITY = "MATERNITY"
    PATERNITY = "PATERNITY"
    JURY = "JURY"
    UNPAID = "UNPAID"
    TRAINING = "TRAINING"
    OTHER = "OTHER"


class LeaveStatus(str, enum.Enum):
    """Lifecycle status of a leave request.
    
    A leave request progresses through these states:
    
    1. **PENDING** — Submitted and awaiting line manager approval.
    2. **APPROVED** — Line manager has approved the leave.
    3. **REJECTED** — Line manager has rejected the leave with a reason.
    4. **CANCELLED** — Requester cancelled before approval decision.
    
    Values
    ------
    PENDING : str
        Awaiting line manager review and decision.
    APPROVED : str
        Approved by line manager; leave is confirmed.
    REJECTED : str
        Rejected by line manager with optional reason.
    CANCELLED : str
        Cancelled by the requester.
    """
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class DowntimeType(str, enum.Enum):
    """Reasons for taking a physical resource offline.
    
    Values
    ------
    MAINTENANCE : str
        Scheduled or unscheduled maintenance.
    CALIBRATION : str
        Calibration cycle for test equipment.
    REPAIR : str
        Repair after fault or damage.
    INSPECTION : str
        Regulatory or internal inspection.
    MODIFICATION : str
        Hardware or software modification work.
    OTHER : str
        Other reason for taking the resource offline.
    """
    MAINTENANCE = "MAINTENANCE"
    CALIBRATION = "CALIBRATION"
    REPAIR = "REPAIR"
    INSPECTION = "INSPECTION"
    MODIFICATION = "MODIFICATION"
    OTHER = "OTHER"


class LineManagementLink(Base):
    """Defines the reporting relationship between two users.
    
    Each user has at most one direct line manager. The relationship
    forms a tree rooted at users who have no manager (typically
    programme directors or senior leadership).
    
    Traversing this tree upward yields the chain of command.
    Traversing downward yields direct and indirect reports.
    
    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    report_user_id : int
        Foreign key to :class:`User.id` — the person reporting to the manager.
    manager_user_id : int
        Foreign key to :class:`User.id` — the direct line manager.
    created_at : datetime
        When this reporting relationship was established.
    """
    __tablename__ = "line_management_links"

    id = Column(Integer, primary_key=True, index=True)
    report_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    """The user who reports to their line manager. Unique so each user has at most one direct manager."""
    
    manager_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    """The direct line manager. Nullable for root-level users with no manager."""
    
    created_at = Column(DateTime, default=_utc_now)

    # Relationships
    report_user = relationship(
        "User",
        foreign_keys=[report_user_id],
        backref="line_management_link",
    )
    manager_user = relationship(
        "User",
        foreign_keys=[manager_user_id],
        backref="direct_reports",
    )

    __table_args__ = (
        UniqueConstraint("report_user_id", name="uq_line_mgmt_report"),
        Index("ix_line_mgmt_manager", "manager_user_id"),
    )


class LeaveRequest(Base):
    """A leave request submitted by a user and approved by their line manager.
    
    Workflow
    --------
    
    1. **Submit** — User creates a leave request with dates, type, and reason.
       Status is set to PENDING.
    2. **Review** — Line manager reviews the request, assessing impact on
       team delivery capacity.
    3. **Decision** — Line manager approves or rejects the request.
       If rejected, a reason is recorded.
    4. **Notification** — The requester is notified of the decision.
    
    Overlap Detection
    ------------------
    
    When a line manager reviews a pending request, the system checks for
    overlapping approved leave among direct reports. If too many team
    members are off simultaneously, a delivery risk warning is raised.
    
    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    user_id : int
        Foreign key to :class:`User.id` — the person requesting leave.
    leave_type : LeaveType
        Category of leave (annual, sick, maternity, etc.).
    start_date : date
        First day of leave (inclusive).
    end_date : date
        Last day of leave (inclusive).
    reason : str or None
        Optional explanation for the leave request.
    status : LeaveStatus
        Current lifecycle status (PENDING, APPROVED, REJECTED, CANCELLED).
    manager_comment : str or None
        Optional comment from the line manager when approving/rejecting.
    approved_by_user_id : int or None
        Foreign key to :class:`User.id` — the manager who made the decision.
    approved_at : datetime or None
        When the approval/rejection decision was made.
    created_at : datetime
        When the leave request was submitted.
    updated_at : datetime
        When the leave request was last modified.
    """
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_type = Column(SAEnum(LeaveType), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(
        SAEnum(LeaveStatus),
        default=LeaveStatus.PENDING,
        nullable=False,
        index=True,
    )
    manager_comment = Column(Text, nullable=True)
    approved_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="leave_requests")
    approved_by = relationship(
        "User",
        foreign_keys=[approved_by_user_id],
        backref="approved_leave_requests",
    )

    __table_args__ = (
        Index("ix_leave_requests_user_status", "user_id", "status"),
        Index("ix_leave_requests_dates", "start_date", "end_date"),
    )


class ResourceDowntime(Base):
    """Records a period when a physical resource is taken offline.
    
    Physical resources (equipment, facilities, test rigs) must sometimes
    be taken offline for maintenance, calibration, repair, or inspection.
    This model tracks those periods so the scheduling engine can avoid
    assigning tasks to unavailable resources.
    
    When a ResourceDowntime record exists that covers a task's planned
    dates, the clash daemon flags a RESOURCE_UNAVAILABLE collision.
    
    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    resource_node_id : UUID
        Foreign key to :class:`ResourceNode.id` — the resource being taken offline.
    downtime_type : DowntimeType
        Reason for the downtime (maintenance, calibration, repair, etc.).
    start_date : date
        Date the resource goes offline.
    end_date : date
        Expected date the resource returns to service.
    reason : str or None
        Detailed description of the downtime reason.
    scheduled_by_user_id : int or None
        Foreign key to :class:`User.id` — who scheduled this downtime.
    actual_return_date : date or None
        The actual date the resource returned to service (may differ from end_date).
    created_at : datetime
        When the downtime record was created.
    updated_at : datetime
        When the downtime record was last modified.
    """
    __tablename__ = "resource_downtime"

    id = Column(Integer, primary_key=True, index=True)
    resource_node_id = Column(
        Uuid,
        ForeignKey("resource_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    downtime_type = Column(SAEnum(DowntimeType), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    scheduled_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actual_return_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    resource_node = relationship("ResourceNode", backref="downtime_records")
    scheduled_by = relationship("User", foreign_keys=[scheduled_by_user_id])

    __table_args__ = (
        Index("ix_resource_downtime_dates", "start_date", "end_date"),
        Index("ix_resource_downtime_resource", "resource_node_id"),
    )


class DelegationRecord(Base):
    """Records a temporary delegation of sign-off authority from one user to another.

    When a line manager is about to go on leave, attend a training course,
    or otherwise be unavailable, they can delegate their sign-off authority
    to a colleague for a defined period. During this period, the delegate
    can approve leave requests, sign off BCRs, and perform other governance
    actions on behalf of the delegator.

    Delegation Workflow
    -------------------

    1. **Create** — The delegator (line manager) creates a delegation record,
       specifying the delegatee, the start and end dates, and an optional reason.
    2. **Active Period** — Between start_date and end_date, the system treats
       the delegatee as having the delegator's sign-off authority. Leave requests
       that would normally route to the delegator are routed to the delegatee.
    3. **Revoke** — The delegator can revoke the delegation at any time before
       the end_date if plans change (e.g., leave is cancelled).
    4. **Expiry** — After end_date, the delegation automatically expires and
       authority reverts to the original delegator.

    Overlapping Delegations
    ------------------------

    A user can only have one active delegation at a time. Attempting to create
    a new delegation while one is still active will raise an error. This prevents
    ambiguity about who holds sign-off authority.

    Notification Integration
    -------------------------

    When a line manager's leave request is approved, the system checks whether
    they have an active delegation covering the leave period. If not, a
    DELEGATION_REQUIRED notification is sent to remind them to set one up.

    Attributes
    ----------
    id : int
        Unique integer identifier (auto-incremented primary key).
    delegator_user_id : int
        Foreign key to :class:`User.id` — the person delegating their authority.
    delegatee_user_id : int
        Foreign key to :class:`User.id` — the person receiving delegated authority.
    start_date : date
        The date from which the delegation becomes active (inclusive).
    end_date : date
        The date on which the delegation expires (inclusive).
    reason : str or None
        Optional explanation for the delegation (e.g., "Annual leave", "Training").
    revoked : bool
        Whether the delegation has been manually revoked before its end_date.
    revoked_at : datetime or None
        When the delegation was revoked, if applicable.
    created_at : datetime
        When the delegation record was created.
    updated_at : datetime
        When the delegation record was last modified.
    """
    __tablename__ = "delegation_records"

    id = Column(Integer, primary_key=True, index=True)
    delegator_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """The user who is delegating their sign-off authority."""

    delegatee_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )
    """The user who receives delegated sign-off authority."""

    start_date = Column(Date, nullable=False)
    """Delegation becomes active from this date (inclusive)."""

    end_date = Column(Date, nullable=False)
    """Delegation expires on this date (inclusive)."""

    reason = Column(Text, nullable=True)
    """Optional explanation for the delegation."""

    revoked = Column(Boolean, default=False, nullable=False, index=True)
    """Whether the delegation has been manually revoked."""

    revoked_at = Column(DateTime, nullable=True)
    """When the delegation was revoked, if applicable."""

    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    delegator = relationship(
        "User",
        foreign_keys=[delegator_user_id],
        backref="outgoing_delegations",
    )
    delegatee = relationship(
        "User",
        foreign_keys=[delegatee_user_id],
        backref="incoming_delegations",
    )

    __table_args__ = (
        Index("ix_delegation_dates", "start_date", "end_date"),
        Index("ix_delegation_delegator_active", "delegator_user_id", "revoked"),
    )


class QuarantineBatch(Base):
    """Isolated quarantine buffer for incoming schedule files.

    When a subcontractor uploads a schedule file (.xer or .xml), it is
    **never** merged directly into the active master schedule. Instead,
    it is staged in this quarantine buffer where automated integrity
    checks run:

    1. **Cycle Detection** — Finds circular dependencies that would
       break the CPM forward/backward pass.
    2. **Dangling Node Detection** — Identifies activities with no
       predecessor or successor (missing links).
    3. **Calendar Discrepancy Check** — Compares imported calendar
       definitions against sovereign working calendars.

    The user reviews the detected issues, applies remediation actions
    (edge deletions, calendar remaps, milestone anchors), and only
    then commits the sanitized batch to the master schedule.

    This prevents corrupt or malicious schedule data from polluting
    the active programme baseline.

    Attributes
    ----------
    id : UUID
        Unique identifier for this quarantine batch.
    uploaded_by_user_id : UUID
        Foreign key to the :class:`User` who uploaded the file.
    source_filename : str
        Original filename of the uploaded schedule file.
    file_format : QuarantineFileFormat
        Format of the uploaded file (Primavera P6 .xer or MS Project .xml).
    target_project_id : UUID
        Foreign key to the :class:`PortfolioNode` (root project) into
        which this batch will be merged.
    validation_status : QuarantineValidationStatus
        Current lifecycle status of the batch.
    cycle_count : int
        Number of circular dependency cycles detected.
    dangling_node_count : int
        Number of dangling nodes (no predecessor or successor).
    out_of_sequence_count : int
        Number of out-of-sequence activities detected.
    quarantine_payload : JSONB
        Raw extracted data: task nodes, dependencies, calendars,
        and resources parsed from the uploaded file.
    remediation_patch : JSONB
        Staged remediation actions: edge deletions, calendar remaps,
        and milestone anchors selected by the user.
    created_at : datetime
        When the batch was created.
    """
    __tablename__ = "quarantine_batches"

    id = Column(Uuid, primary_key=True, default=uuid4)

    uploaded_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    """User who uploaded the schedule file."""

    source_filename = Column(
        String(255),
        nullable=False,
    )
    """Original filename of the uploaded schedule file."""

    file_format = Column(
        SAEnum(QuarantineFileFormat),
        nullable=False,
    )
    """Format of the uploaded file (Primavera P6 .xer or MS Project .xml)."""

    target_project_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """Target project root into which this batch will be merged."""

    validation_status = Column(
        SAEnum(QuarantineValidationStatus),
        default=QuarantineValidationStatus.PENDING,
        nullable=False,
        index=True,
    )
    """Current lifecycle status of the quarantine batch."""

    cycle_count = Column(
        Integer,
        default=0,
        nullable=False,
    )
    """Number of circular dependency cycles detected."""

    dangling_node_count = Column(
        Integer,
        default=0,
        nullable=False,
    )
    """Number of dangling nodes (no predecessor or successor)."""

    out_of_sequence_count = Column(
        Integer,
        default=0,
        nullable=False,
    )
    """Number of out-of-sequence activities detected."""

    quarantine_payload = Column(
        JSONB,
        nullable=False,
        default=dict,
    )
    """Raw extracted task nodes, dependencies, calendars, and resources."""

    remediation_patch = Column(
        JSONB,
        nullable=True,
        default=None,
    )
    """Staged edge deletions, calendar remaps, and milestone anchors."""

    created_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """When the batch was created."""

    # Relationships
    uploaded_by_user = relationship(
        "User",
        foreign_keys=[uploaded_by_user_id],
    )
    target_project = relationship(
        "PortfolioNode",
        foreign_keys=[target_project_id],
    )

    __table_args__ = (
        Index("ix_quarantine_status", "validation_status"),
        Index("ix_quarantine_target", "target_project_id"),
        Index("ix_quarantine_uploaded_by", "uploaded_by_user_id"),
        Index("ix_quarantine_payload_gin", "quarantine_payload", postgresql_using="gin"),
    )


# ============================================================================
# Work Pattern Templates
# ============================================================================


class WorkPatternCategory(str, enum.Enum):
    """Category that classifies a work pattern template.

    Work patterns are grouped by category so administrators can quickly
    find the right template when assigning a working pattern to a resource.

    Values
    ------
    STANDARD : str
        Typical full-time office hours (e.g., Mon–Fri, 9–5).
    SHIFT : str
        Rotating shift patterns for 24/7 operations (e.g., 4-on-4-off).
    PART_TIME : str
        Reduced-hour patterns for part-time resources.
    OVERTIME : str
        Extended-hour patterns for surge or crunch periods.
    CUSTOM : str
        User-defined patterns that don't fit the standard categories.
    """
    STANDARD = "STANDARD"
    SHIFT = "SHIFT"
    PART_TIME = "PART_TIME"
    OVERTIME = "OVERTIME"
    CUSTOM = "CUSTOM"


class WorkPatternTemplate(Base):
    """A reusable, named work pattern template that can be applied to resources.

    In defence programme management, different resource types follow
    different working patterns.  A standard office worker may work Mon–Fri,
    9:00–17:00, while a facility operator follows a rotating shift pattern.
    Rather than defining these patterns individually for each resource,
    WorkPatternTemplate provides a reusable definition that can be applied
    to any number of resources.

    How Work Patterns Work
    ~~~~~~~~~~~~~~~~~~~~~~

    1. **Template Creation** — An administrator creates a work pattern
       template with a name, category, and per-day-of-week hours.
       For example, "Standard Office Hours" might define:

       - Monday: 8.0 hours (09:00–17:00)
       - Tuesday: 8.0 hours
       - Wednesday: 8.0 hours
       - Thursday: 8.0 hours
       - Friday: 7.5 hours (09:00–16:30)
       - Saturday: 0.0 hours
       - Sunday: 0.0 hours

    2. **Template Application** — When a resource is created or edited,
       the administrator selects a work pattern template.  The system
       creates a ResourceWorkPattern record linking the resource to the
       template, with an effective date range.

    3. **Default Templates** — A template can be marked as the default
       for its category.  When a new resource is created without an
       explicit pattern, the system assigns the default template for
       the resource's type.

    4. **Per-Resource Overrides** — A resource's work pattern can be
       overridden for a specific period (e.g., reduced hours during
       training).  The ResourceWorkPattern record stores the override
       hours, which take precedence over the template.

    5. **Calendar Integration** — Work patterns are independent of
       calendar exceptions (holidays, maintenance).  When calculating
       available hours, the system combines the work pattern (per-day
       hours) with the calendar exceptions (holiday overrides).

    Per-Day Hours
    ~~~~~~~~~~~~~

    Each WorkPatternTemplate has seven WorkPatternDay records, one for
    each day of the week.  The ``hours`` field defines the number of
    working hours on that day.  A day with 0.0 hours is a non-working
    day.

    The ``start_time`` and ``end_time`` fields define the working window
    within the day.  For example, 09:00–17:00 with 8.0 hours implies
    a 1-hour lunch break.

    Template Versioning
    ~~~~~~~~~~~~~~~~~~~

    Templates are immutable once applied to resources.  To change a
    template, create a new version (``version`` field increments).
    Resources linked to the old version continue using it until
    explicitly reassigned.

    Attributes
    ----------
    id : UUID
        Unique identifier for this template.
    code : str
        Unique machine-readable code (e.g., 'WP_STANDARD', 'WP_SHIFT_A').
    name : str
        Human-readable name (e.g., 'Standard Office Hours').
    description : str
        Detailed description of the pattern and its intended use.
    category : WorkPatternCategory
        Classification of the pattern (STANDARD, SHIFT, PART_TIME, etc.).
    version : int
        Version number, incremented when the template is updated.
    is_default : bool
        Whether this is the default template for its category.
    is_active : bool
        Whether this template can be applied to new resources.
    created_by_user_id : int
        User who created the template.
    created_at : datetime
        Timestamp when the template was created.
    updated_at : datetime
        Timestamp when the template was last modified.
    """
    __tablename__ = "work_pattern_templates"

    id = Column(Uuid, primary_key=True, default=uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(String(1000), nullable=True)
    category = Column(SAEnum(WorkPatternCategory), nullable=False, default=WorkPatternCategory.CUSTOM)
    version = Column(Integer, nullable=False, default=1)
    is_default = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    # Relationships
    days = relationship(
        "WorkPatternDay",
        back_populates="template",
        cascade="all, delete-orphan",
    )
    resource_assignments = relationship(
        "ResourceWorkPattern",
        back_populates="template",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_work_pattern_category_default", "category", "is_default"),
        Index("ix_work_pattern_active", "is_active"),
    )


class WorkPatternDay(Base):
    """Per-day-of-week definition within a WorkPatternTemplate.

    Each WorkPatternTemplate has exactly seven WorkPatternDay records,
    one for each day of the week (Monday through Sunday).  This model
    defines the working hours, start time, and end time for that day.

    Day of Week Mapping
    ~~~~~~~~~~~~~~~~~~~

    The ``day_of_week`` field uses Python's ``datetime.weekday()`` convention:

    - 0 = Monday
    - 1 = Tuesday
    - 2 = Wednesday
    - 3 = Thursday
    - 4 = Friday
    - 5 = Saturday
    - 6 = Sunday

    Hours Calculation
    ~~~~~~~~~~~~~~~~~

    The ``hours`` field defines the total working hours for the day.
    If ``start_time`` and ``end_time`` are provided, the system validates
    that the difference between them (minus any break) equals the hours.

    For example:
    - start_time: 09:00, end_time: 17:00, hours: 8.0 (1-hour break implied)
    - start_time: 06:00, end_time: 14:00, hours: 8.0 (continuous shift)
    - start_time: None, end_time: None, hours: 0.0 (non-working day)

    Attributes
    ----------
    id : UUID
        Unique identifier for this day definition.
    template_id : UUID
        Foreign key to :class:`WorkPatternTemplate`.
    day_of_week : int
        Day of the week (0=Monday, 6=Sunday).
    hours : Decimal(4, 2)
        Number of working hours on this day (0.0 = non-working).
    start_time : time or None
        Start of the working window (e.g., 09:00).
    end_time : time or None
        End of the working window (e.g., 17:00).
    """
    __tablename__ = "work_pattern_days"

    id = Column(Uuid, primary_key=True, default=uuid4)
    template_id = Column(
        Uuid,
        ForeignKey("work_pattern_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    day_of_week = Column(Integer, nullable=False)
    hours = Column(Numeric(4, 2), nullable=False, default=0.00)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)

    # Relationships
    template = relationship("WorkPatternTemplate", back_populates="days")

    __table_args__ = (
        UniqueConstraint("template_id", "day_of_week"),
        Index("ix_work_pattern_day_template", "template_id"),
    )


class ResourceWorkPattern(Base):
    """Assignment of a work pattern template to a specific resource.

    This model links a :class:`ResourceNode` to a :class:`WorkPatternTemplate`,
    defining when the pattern applies and whether it has been overridden.

    Effective Date Range
    ~~~~~~~~~~~~~~~~~~~~

    Each assignment has an ``effective_from`` date and an optional
    ``effective_to`` date.  This allows temporary patterns (e.g., reduced
    hours during training) and historical tracking of pattern changes.

    When querying a resource's current pattern, the system finds the
    assignment where ``effective_from <= today <= effective_to`` (or
    ``effective_to IS NULL``).

    Override Hours
    ~~~~~~~~~~~~~~

    If ``override_hours_json`` is set, it contains a JSON object that
    overrides the template's per-day hours for this specific resource.
    For example::

        {
            "0": 6.0,   # Monday: 6 hours instead of 8
            "1": 6.0,   # Tuesday: 6 hours
            "2": 6.0,   # Wednesday: 6 hours
            "3": 6.0,   # Thursday: 6 hours
            "4": 4.0    # Friday: 4 hours
        }

    This is useful for part-time resources that follow the same day
    structure as a full-time template but with reduced hours.

    Priority
    ~~~~~~~~

    If multiple assignments overlap for a resource, the one with the
    highest ``priority`` value takes precedence.  This allows temporary
    overrides to sit alongside the base pattern.

    Attributes
    ----------
    id : UUID
        Unique identifier for this assignment.
    resource_node_id : UUID
        Foreign key to :class:`ResourceNode` — the resource this pattern
        applies to.
    template_id : UUID
        Foreign key to :class:`WorkPatternTemplate` — the pattern template.
    effective_from : date
        Start date when this pattern becomes active.
    effective_to : date or None
        End date when this pattern expires.  NULL means ongoing.
    override_hours_json : JSONB or None
        Per-day hour overrides that replace the template's hours.
    priority : int
        Priority for resolving overlapping assignments (higher wins).
    notes : str or None
        Free-text notes explaining why this pattern was assigned.
    assigned_by_user_id : int
        User who created this assignment.
    created_at : datetime
        Timestamp when the assignment was created.
    """
    __tablename__ = "resource_work_patterns"

    id = Column(Uuid, primary_key=True, default=uuid4)
    resource_node_id = Column(
        Uuid,
        ForeignKey("resource_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id = Column(
        Uuid,
        ForeignKey("work_pattern_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    override_hours_json = Column(JSONB, nullable=True)
    priority = Column(Integer, nullable=False, default=0)
    notes = Column(String(1000), nullable=True)
    assigned_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, default=_utc_now)

    # Relationships
    resource_node = relationship("ResourceNode")
    template = relationship("WorkPatternTemplate", back_populates="resource_assignments", foreign_keys=[template_id])
    assigned_by_user = relationship("User", foreign_keys=[assigned_by_user_id])

    __table_args__ = (
        Index("ix_resource_pattern_resource", "resource_node_id"),
        Index("ix_resource_pattern_effective", "effective_from", "effective_to"),
        Index("ix_resource_pattern_priority", "resource_node_id", "priority"),
    )


# ============================================================================
# Data Diode — Air-Gapped Ingestion Staging
# ============================================================================


class DiodeBundleType(str, enum.Enum):
    """Type of data diode bundle being ingested.

    Values
    ------
    DEF_PACK : str
        Subcontractor schedule package (``.defpack``).  Staged into
        :class:`QuarantineBatch` for integrity checks before merge.
    MERKLE_PACK : str
        Baseline sync package (``.merklepack``).  Staged into
        :class:`MerkleMergeStaging` for tree reconciliation.
    """
    DEF_PACK = "DEF_PACK"
    MERKLE_PACK = "MERKLE_PACK"


class DiodeIngestionStatus(str, enum.Enum):
    """Lifecycle status of a diode ingestion record.

    Values
    ------
    PENDING : str
        Bundle has been moved to quarantine and is awaiting verification.
    VERIFIED : str
        Cryptographic signature and checksums have been verified.
    STAGED : str
        Bundle contents have been deserialized and staged for processing.
    REJECTED : str
        Bundle failed verification or malicious payload inspection.
    """
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    STAGED = "STAGED"
    REJECTED = "REJECTED"


class MerkleMergeStaging(Base):
    """Staging table for baseline sync packs arriving via data diode.

    When a ``.merklepack`` baseline sync bundle is ingested through the
    air-gapped diode pipeline, its contents are first staged here before
    being merged into the active Merkle tree.  This allows the operator
    to review the incoming changes, verify the cryptographic attestation,
    and approve or reject the merge.

    Each record corresponds to one ingested bundle.  The ``staging_payload``
    column holds the deserialized Merkle tree delta (added, modified, and
    removed nodes) as JSON.  Once the operator approves the merge, the
    staging record is consumed and the active tree is updated.

    Attributes
    ----------
    id : UUID
        Unique identifier for this staging record.
    bundle_type : DiodeBundleType
        Type of the ingested bundle (DEF_PACK or MERKLE_PACK).
    source_filename : str
        Original filename of the ingested archive.
    originating_site : str
        Identifier of the sovereign site that produced the bundle.
    signature_verified : bool
        Whether the cryptographic signature was successfully verified.
    staging_payload : JSONB
        Deserialized bundle contents ready for merge.
    ingestion_status : DiodeIngestionStatus
        Current lifecycle status of this staging record.
    rejection_reason : str or None
        If rejected, the reason for rejection.
    created_at : datetime
        Timestamp when the staging record was created.
    """
    __tablename__ = "merkle_merge_staging"

    id = Column(Uuid, primary_key=True, default=uuid4)

    bundle_type = Column(
        SAEnum(DiodeBundleType),
        nullable=False,
        index=True,
    )
    """Type of the ingested bundle."""

    source_filename = Column(
        String(255),
        nullable=False,
    )
    """Original filename of the ingested archive."""

    originating_site = Column(
        String(128),
        nullable=False,
        index=True,
    )
    """Identifier of the sovereign site that produced the bundle."""

    signature_verified = Column(
        Boolean,
        nullable=False,
        default=False,
    )
    """Whether the cryptographic signature was verified."""

    staging_payload = Column(
        JSONB,
        nullable=False,
        default=dict,
    )
    """Deserialized bundle contents ready for merge."""

    ingestion_status = Column(
        SAEnum(DiodeIngestionStatus),
        default=DiodeIngestionStatus.PENDING,
        nullable=False,
        index=True,
    )
    """Current lifecycle status of this staging record."""

    rejection_reason = Column(
        String(1000),
        nullable=True,
    )
    """If rejected, the reason for rejection."""

    created_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """Timestamp when the staging record was created."""

    __table_args__ = (
        Index("ix_merkle_staging_status", "ingestion_status"),
        Index("ix_merkle_staging_site", "originating_site"),
        Index("ix_merkle_staging_payload_gin", "staging_payload", postgresql_using="gin"),
    )


# ============================================================================
# External Repository Artifact Linking
# ============================================================================

class ExternalRepositoryType(str, enum.Enum):
    """Type of external repository system."""
    WINDCHILL = "WINDCHILL"
    GIT = "GIT"
    DOORS = "DOORS"


class ArtifactLifecycleState(str, enum.Enum):
    """Lifecycle state of an external repository artifact."""
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    RELEASED = "RELEASED"
    APPROVED = "APPROVED"
    OBSOLETE = "OBSOLETE"


class ExternalRepositoryArtifact(Base):
    """A link to an external repository artifact (Windchill, Git, DOORS).

    This model records the relationship between a WBS node and an external
    artifact stored in a PLM system, version control, or requirements
    management tool.  When the external artifact transitions to a terminal
    state (RELEASED or APPROVED) and ``drives_progress`` is True, the
    system automatically advances the parent task's physical progress
    by the configured milestone weight step.

    How it works
    ~~~~~~~~~~~~

    1. An artifact is linked to a WBS node via webhook ingestion or manual
       entry, recording the external identifier, title, version, and
       current lifecycle state.

    2. When a webhook event arrives (e.g., Windchill LifeCycle change),
       the lifecycle state is updated.  If the new state is RELEASED or
       APPROVED and ``drives_progress`` is True, the linked node's
       ``percent_complete`` is advanced by the associated milestone
       weight fraction.

    3. Every automated progress update is recorded in the
       :class:`ForensicAuditLog` with the artifact's SHA-256 hash as
       forensic evidence.

    Attributes
    ----------
    id : UUID
        Unique identifier for this artifact link.
    portfolio_node_id : UUID
        Foreign key to :class:`PortfolioNode` — the WBS node this
        artifact is linked to.
    repository_type : ExternalRepositoryType
        The type of external repository (WINDCHILL, GIT, DOORS).
    external_identifier : str
        The unique identifier in the external system (e.g., part number,
        commit hash, document ID).
    title : str
        Human-readable title of the artifact.
    version_revision : str or None
        Version or revision string (e.g., 'A', '1.0', 'v2.3.0').
    lifecycle_state : ArtifactLifecycleState
        Current lifecycle state of the external artifact.
    verification_hash : str or None
        SHA-256 hash of the external artifact content for integrity
        verification.
    drives_progress : bool
        If True, transitioning to RELEASED or APPROVED automatically
        advances the parent task's physical progress.
    milestone_weight_step_id : UUID or None
        Foreign key to :class:`MilestoneWeightStep` — the milestone step
        whose weight fraction is applied when this artifact drives progress.
    external_url : str or None
        Deep link to the external repository viewer (Windchill, GitLab, etc.).
    extra_metadata : dict or None
        Additional JSON metadata from the external system (e.g., Windchill
        object type, Git branch name, DOORS module path).  Named
        ``extra_metadata`` to avoid colliding with SQLAlchemy's reserved
        ``metadata`` attribute on Declarative classes.
    created_at : datetime
        Timestamp when this artifact link was created.
    updated_at : datetime
        Timestamp when this artifact link was last modified.
    """
    __tablename__ = "external_repository_artifacts"

    id = Column(Uuid, primary_key=True, default=uuid4)

    portfolio_node_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    repository_type = Column(
        SAEnum(ExternalRepositoryType),
        nullable=False,
        index=True,
    )
    external_identifier = Column(String(500), nullable=False)
    title = Column(String(500), nullable=False)
    version_revision = Column(String(100), nullable=True)
    lifecycle_state = Column(
        SAEnum(ArtifactLifecycleState),
        default=ArtifactLifecycleState.DRAFT,
        nullable=False,
        index=True,
    )
    verification_hash = Column(String(64), nullable=True)
    drives_progress = Column(Boolean, default=False, nullable=False)
    milestone_weight_step_id = Column(
        Uuid,
        ForeignKey("milestone_weight_steps.id", ondelete="SET NULL"),
        nullable=True,
    )
    external_url = Column(String(1000), nullable=True)
    extra_metadata = Column(JSONB, nullable=True)

    # Relationships
    portfolio_node = relationship(
        "PortfolioNode",
        backref="external_repository_artifacts",
    )
    milestone_weight_step = relationship(
        "MilestoneWeightStep",
    )

    created_at = Column(DateTime, default=_utc_now, nullable=False)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    __table_args__ = (
        Index("ix_era_node_type", "portfolio_node_id", "repository_type"),
        Index("ix_era_external_id", "repository_type", "external_identifier"),
    )
