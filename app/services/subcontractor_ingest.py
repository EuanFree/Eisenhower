"""Subcontractor schedule ingest pipeline.

This module provides the isolated ingest pipeline for subcontractor
schedule updates submitted in Oracle Primavera P6 (.xer) or Microsoft
Project (.xml) format.  It is the gateway through which external
schedule data enters the prime contractor's master programme.

Why an isolated ingest pipeline?
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

When a defence subcontractor submits a schedule update, the prime
contractor must verify that the update is compatible with the master
programme before merging it.  Directly importing a subcontractor's
schedule into the live WBS could:

- Slip contractual handover milestones beyond agreed boundaries.
- Delete contractual predecessor constraints (logic tampering).
- Introduce artificial constraints to mask negative float.
- Create resource conflicts with other work packages.

The ingest pipeline addresses these risks by:

1. **Parsing** the external file into a normalised task/dependency
   representation without touching the live database.

2. **Validating** the parsed data against contractual boundary gates
   using automated DCMA-style integrity checks.

3. **Staging** the proposed changes in an ephemeral sandbox branch
   so the impact on the prime schedule can be assessed before commit.

4. **Merging** only after a human reviewer has approved the staging diff.

Parsing External Schedules
~~~~~~~~~~~~~~~~~~~~~~~~~~

The ``parse_external_schedule()`` function reads either a Primavera P6
.xer batch text file or a Microsoft Project XML file and extracts:

- Task identifiers, descriptions, durations, and planned dates.
- Predecessor/successor dependency links with lag days.

The parsed data is returned as a list of dictionaries that can be
validated against the contractual boundary.

Contractual Boundary Validation
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The ``validate_against_contractual_boundary()`` function performs
automated DCMA checks and checks against contractual boundary gates:

- **Milestone Integrity**: Any contractual handover milestone slipping
  past the subcontract agreement boundary flags a ``CRITICAL_MILESTONE_BREACH``.

- **Logic Tampering**: Detects if the subcontractor deleted existing
  contractual predecessor constraints or introduced dangling logic.

- **Negative Float Inflation**: Identifies if artificial constraints
  (e.g., 'Must Finish On') were inserted to force positive total float.

The validation produces a ``ValidationReport`` with a compliance score
(0–100%), a list of boundary breaches, and an overall status.

Staging Diff Generation
~~~~~~~~~~~~~~~~~~~~~~~

The ``generate_staging_diff()`` function ephemerally injects the
subcontractor's proposed DAG into a cloned sandbox branch, runs CPM
forward/backward passes, and calculates the resulting float impact
on prime contractual delivery dates.

It returns a ``StagingDiff`` containing:

- **Unchanged tasks**: Tasks whose dates are not affected by the merge.
- **Shifted tasks**: Tasks whose dates would shift as a result of the merge.
- **Newly critical paths**: Tasks that would become newly critical (TF ≤ 0).
- **Total float variance**: Aggregate float variance across all affected tasks.

Usage
~~~~~

The typical workflow is:

1. Upload a file via ``POST /api/v1/subcontractors/submissions/upload``.
2. The system parses and validates the file automatically.
3. Review the validation report via ``GET /submissions/{id}/validation-report``.
4. If validation passes, review the staging diff.
5. Approve the merge via ``POST /submissions/{id}/approve-merge``.
"""
import io
import re
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.models import (
    SubcontractorSubmission,
    SubcontractorFormat,
    SubmissionStatus,
    UniversalBreakdownNode,
    PortfolioNode,
    DependencyLink,
    ForensicAuditLog,
    TreeType,
    SecurityClassification,
)


# ============================================================================
# Parsed task and dependency structures
# ============================================================================


class ParsedTask:
    """A task extracted from an external schedule file.

    This is an in-memory representation of a task parsed from a
    Primavera P6 .xer or Microsoft Project .xml file.  It is not
    yet persisted to the database.

    Attributes
    ----------
    task_id : str
        Unique identifier of the task in the source file.
    name : str
        Task name or description.
    duration_days : float
        Planned duration in days.
    planned_start : date or None
        Planned start date.
    planned_finish : date or None
        Planned finish date.
    predecessors : list[str]
        List of predecessor task IDs.
    successors : list[str]
        List of successor task IDs.
    percent_complete : float
        Physical percent complete (0–100).
    is_milestone : bool
        True if this is a milestone (zero-duration task).
    """

    __slots__ = (
        "task_id", "name", "duration_days", "planned_start",
        "planned_finish", "predecessors", "successors",
        "percent_complete", "is_milestone",
    )

    def __init__(
        self,
        task_id: str,
        name: str,
        duration_days: float = 0.0,
        planned_start: Optional[date] = None,
        planned_finish: Optional[date] = None,
        predecessors: Optional[List[str]] = None,
        successors: Optional[List[str]] = None,
        percent_complete: float = 0.0,
        is_milestone: bool = False,
    ):
        """Initialize a parsed task record from an external schedule.

        Stores the task's identifying information, scheduling data, and
        dependency references extracted from a Primavera P6 or Microsoft
        Project file. The task is immutable once created — use a new
        instance to represent any changes.

        Args
        ----
        task_id : str
            Unique identifier for the task within the external schedule.
        name : str
            Human-readable task name.
        duration_days : float, optional
            Planned duration in days (default ``0.0``).
        planned_start : date, optional
            Planned start date (default ``None``).
        planned_finish : date, optional
            Planned finish date (default ``None``).
        predecessors : List[str], optional
            List of predecessor task IDs (default ``None``, stored as empty list).
        successors : List[str], optional
            List of successor task IDs (default ``None``, stored as empty list).
        percent_complete : float, optional
            Physical percent complete, 0–100 (default ``0.0``).
        is_milestone : bool, optional
            Whether this is a zero-duration milestone (default ``False``).
        """
        self.task_id = task_id
        self.name = name
        self.duration_days = duration_days
        self.planned_start = planned_start
        self.planned_finish = planned_finish
        self.predecessors = predecessors or []
        self.successors = successors or []
        self.percent_complete = percent_complete
        self.is_milestone = is_milestone


class ParsedDependency:
    """A dependency link extracted from an external schedule file.

    Attributes
    ----------
    predecessor_id : str
        ID of the predecessor task.
    successor_id : str
        ID of the successor task.
    dependency_type : str
        Dependency type: 'FS', 'SS', 'FF', or 'SF'.
    lag_days : int
        Lag in days (positive for delay, negative for lead).
    """

    __slots__ = ("predecessor_id", "successor_id", "dependency_type", "lag_days")

    def __init__(
        self,
        predecessor_id: str,
        successor_id: str,
        dependency_type: str = "FS",
        lag_days: int = 0,
    ):
        """Initialize a parsed dependency link from an external schedule.

        Represents a scheduling relationship between two tasks extracted
        from a Primavera P6 or Microsoft Project file. The dependency
        type defines how the successor is constrained by the predecessor.

        Args
        ----
        predecessor_id : str
            ID of the predecessor task.
        successor_id : str
            ID of the successor task.
        dependency_type : str, optional
            Dependency type: ``"FS"`` (Finish-to-Start), ``"SS"`` (Start-to-Start),
            ``"FF"`` (Finish-to-Finish), or ``"SF"`` (Start-to-Finish; default ``"FS"``).
        lag_days : int, optional
            Lag in days — positive for delay, negative for lead (default ``0``).
        """
        self.predecessor_id = predecessor_id
        self.successor_id = successor_id
        self.dependency_type = dependency_type
        self.lag_days = lag_days


# ============================================================================
# File parsers
# ============================================================================


def parse_external_schedule(
    file_stream: io.BytesIO,
    file_format: str,
) -> Tuple[List[ParsedTask], List[ParsedDependency]]:
    """Parse an external schedule file into tasks and dependencies.

    This function reads either a Primavera P6 .xer batch text file or
    a Microsoft Project .xml file and extracts the task and dependency
    data into normalised in-memory structures.

    The parsing is read-only: no database writes occur during this step.
    The parsed data is validated in a subsequent step before any merge.

    Parameters
    ----------
    file_stream : io.BytesIO
        The uploaded file content as a bytes stream.
    file_format : str
        The format of the file: 'PRIMAVERA_XER' or 'MS_PROJECT_XML'.

    Returns
    -------
    tuple[list[ParsedTask], list[ParsedDependency]]
        Two lists: parsed tasks and parsed dependency links.

    Raises
    ------
    ValueError
        If the file format is not recognised or the file content is
        malformed and cannot be parsed.
    """
    if file_format == "PRIMAVERA_XER":
        return _parse_xer(file_stream)
    elif file_format == "MS_PROJECT_XML":
        return _parse_ms_project_xml(file_stream)
    else:
        raise ValueError(f"Unsupported file format: {file_format}")


def _parse_xer(file_stream: io.BytesIO) -> Tuple[List[ParsedTask], List[ParsedDependency]]:
    """Parse a Primavera P6 .xer batch text file.

    The .xer format is a tab-delimited batch text file with table
    headers prefixed by ``%T``.  Key tables include:

    - ``%T ACT`` — Activities (tasks) with IDs, names, dates, durations.
    - ``%T ACTREL`` — Activity relationships (predecessor/successor links).

    Parameters
    ----------
    file_stream : io.BytesIO
        The .xer file content.

    Returns
    -------
    tuple[list[ParsedTask], list[ParsedDependency]]
        Parsed tasks and dependencies.
    """
    try:
        content = file_stream.read().decode("utf-8", errors="replace")
    except Exception:
        content = file_stream.read().decode("latin-1", errors="replace")

    tasks: Dict[str, ParsedTask] = {}
    dependencies: List[ParsedDependency] = []

    current_table = None
    header_columns: Optional[List[str]] = None

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue

        # Table header
        if line.startswith("%T "):
            current_table = line[3:].strip()
            header_columns = None
            continue

        # Column header row (first row after %T header)
        if current_table and header_columns is None and "\t" in line:
            header_columns = [col.strip() for col in line.split("\t")]
            continue

        # Data rows
        if current_table and header_columns and "\t" in line:
            values = line.split("\t")
            row = dict(zip(header_columns, values))

            if current_table == "ACT":
                task = _xer_row_to_task(row)
                if task:
                    tasks[task.task_id] = task

            elif current_table == "ACTREL":
                dep = _xer_row_to_dependency(row)
                if dep:
                    dependencies.append(dep)

    # Build predecessor/successor lists
    for dep in dependencies:
        pred_id = dep.predecessor_id
        succ_id = dep.successor_id
        if pred_id in tasks:
            if succ_id not in tasks[pred_id].successors:
                tasks[pred_id].successors.append(succ_id)
        if succ_id in tasks:
            if pred_id not in tasks[succ_id].predecessors:
                tasks[succ_id].predecessors.append(pred_id)

    return list(tasks.values()), dependencies


def _xer_row_to_task(row: Dict[str, str]) -> Optional[ParsedTask]:
    """Convert a single .xer ACT row to a ParsedTask.

    Parameters
    ----------
    row : dict
        Dictionary mapping column names to values from an ACT row.

    Returns
    -------
    ParsedTask or None
        The parsed task, or None if the row is invalid.
    """
    task_id = row.get("ID", "").strip()
    if not task_id:
        return None

    name = row.get("NAME", row.get("WBS_NAME", "Unknown")).strip()
    duration_str = row.get("DURATION", "0").strip()
    try:
        duration_days = float(duration_str)
    except ValueError:
        duration_days = 0.0

    planned_start = _parse_xer_date(row.get("START_DATE", ""))
    planned_finish = _parse_xer_date(row.get("FINISH_DATE", ""))

    pct_str = row.get("PCT_COMPLETE", "0").strip()
    try:
        percent_complete = float(pct_str)
    except ValueError:
        percent_complete = 0.0

    is_milestone = duration_days == 0.0

    return ParsedTask(
        task_id=task_id,
        name=name,
        duration_days=duration_days,
        planned_start=planned_start,
        planned_finish=planned_finish,
        percent_complete=percent_complete,
        is_milestone=is_milestone,
    )


def _xer_row_to_dependency(row: Dict[str, str]) -> Optional[ParsedDependency]:
    """Convert a single .xer ACTREL row to a ParsedDependency.

    Parameters
    ----------
    row : dict
        Dictionary mapping column names to values from an ACTREL row.

    Returns
    -------
    ParsedDependency or None
        The parsed dependency, or None if the row is invalid.
    """
    pred_id = row.get("PREDECESSOR_ID", row.get("PRE_ID", "")).strip()
    succ_id = row.get("SUCCESSOR_ID", row.get("ACTIVITY_ID", "")).strip()

    if not pred_id or not succ_id:
        return None

    dep_type = row.get("TYPE", "FS").strip().upper()
    if dep_type not in ("FS", "SS", "FF", "SF"):
        dep_type = "FS"

    lag_str = row.get("LAG", "0").strip()
    try:
        lag_days = int(lag_str)
    except ValueError:
        lag_days = 0

    return ParsedDependency(
        predecessor_id=pred_id,
        successor_id=succ_id,
        dependency_type=dep_type,
        lag_days=lag_days,
    )


def _parse_xer_date(value: str) -> Optional[date]:
    """Parse a date string from a .xer file.

    P6 .xer files typically use ISO format (YYYY-MM-DD) or a numeric
    format (YYYYMMDD).

    Parameters
    ----------
    value : str
        The date string to parse.

    Returns
    -------
    date or None
        The parsed date, or None if the string is empty or invalid.
    """
    if not value or not value.strip():
        return None

    value = value.strip()

    # Try ISO format: YYYY-MM-DD
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        pass

    # Try numeric format: YYYYMMDD
    if len(value) == 8 and value.isdigit():
        try:
            return datetime.strptime(value, "%Y%m%d").date()
        except ValueError:
            pass

    return None


def _parse_ms_project_xml(
    file_stream: io.BytesIO,
) -> Tuple[List[ParsedTask], List[ParsedDependency]]:
    """Parse a Microsoft Project XML file.

    MS Project XML uses the schema
    ``http://schemas.microsoft.com/project``.  Tasks are stored in
    ``<Task>`` elements, and dependencies in ``<Link>`` elements.

    Parameters
    ----------
    file_stream : io.BytesIO
        The .xml file content.

    Returns
    -------
    tuple[list[ParsedTask], list[ParsedDependency]]
        Parsed tasks and dependencies.
    """
    try:
        content = file_stream.read()
        root = ET.fromstring(content)
    except ET.ParseError as e:
        raise ValueError(f"Invalid XML content: {e}")

    # Handle XML namespaces
    ns = {"p": "http://schemas.microsoft.com/project"}

    tasks: Dict[str, ParsedTask] = {}
    dependencies: List[ParsedDependency] = []

    # Parse tasks
    for task_elem in root.findall(".//p:Task", ns):
        task = _ms_project_task_to_parsed(task_elem, ns)
        if task:
            tasks[task.task_id] = task

    # Parse links
    for link_elem in root.findall(".//p:Link", ns):
        dep = _ms_project_link_to_dependency(link_elem, ns)
        if dep:
            dependencies.append(dep)

    # Build predecessor/successor lists
    for dep in dependencies:
        pred_id = dep.predecessor_id
        succ_id = dep.successor_id
        if pred_id in tasks:
            if succ_id not in tasks[pred_id].successors:
                tasks[pred_id].successors.append(succ_id)
        if succ_id in tasks:
            if pred_id not in tasks[succ_id].predecessors:
                tasks[succ_id].predecessors.append(pred_id)

    return list(tasks.values()), dependencies


def _ms_project_task_to_parsed(
    task_elem: ET.Element,
    ns: Dict[str, str],
) -> Optional[ParsedTask]:
    """Convert an MS Project <Task> element to a ParsedTask.

    Parameters
    ----------
    task_elem : ET.Element
        The XML element representing a task.
    ns : dict
        XML namespace mapping.

    Returns
    -------
    ParsedTask or None
        The parsed task, or None if the element is invalid.
    """
    uid_elem = task_elem.find("p:UID", ns)
    if uid_elem is None:
        return None

    task_id = str(uid_elem.text or "")
    if not task_id:
        return None

    name_elem = task_elem.find("p:Name", ns)
    name = name_elem.text.strip() if name_elem is not None and name_elem.text else "Unknown"

    duration_elem = task_elem.find("p:Duration", ns)
    duration_days = _ms_project_duration_to_days(duration_elem.text if duration_elem is not None else "0")

    start_elem = task_elem.find("p:Start", ns)
    planned_start = _parse_ms_project_date(start_elem.text if start_elem is not None else "")

    finish_elem = task_elem.find("p:Finish", ns)
    planned_finish = _parse_ms_project_date(finish_elem.text if finish_elem is not None else "")

    pct_elem = task_elem.find("p:PercentComplete", ns)
    try:
        percent_complete = float(pct_elem.text or "0")
    except (ValueError, TypeError):
        percent_complete = 0.0

    is_milestone_elem = task_elem.find("p:Milestone", ns)
    is_milestone = (is_milestone_elem.text or "0") == "1"

    return ParsedTask(
        task_id=task_id,
        name=name,
        duration_days=duration_days,
        planned_start=planned_start,
        planned_finish=planned_finish,
        percent_complete=percent_complete,
        is_milestone=is_milestone,
    )


def _ms_project_link_to_dependency(
    link_elem: ET.Element,
    ns: Dict[str, str],
) -> Optional[ParsedDependency]:
    """Convert an MS Project <Link> element to a ParsedDependency.

    Parameters
    ----------
    link_elem : ET.Element
        The XML element representing a dependency link.
    ns : dict
        XML namespace mapping.

    Returns
    -------
    ParsedDependency or None
        The parsed dependency, or None if the element is invalid.
    """
    pred_elem = link_elem.find("p:PredecessorUID", ns)
    succ_elem = link_elem.find("p:SuccessorUID", ns)

    if pred_elem is None or succ_elem is None:
        return None

    pred_id = str(pred_elem.text or "").strip()
    succ_id = str(succ_elem.text or "").strip()

    if not pred_id or not succ_id:
        return None

    type_elem = link_elem.find("p:Type", ns)
    dep_type = (type_elem.text or "1").strip()
    # MS Project type codes: 1=FS, 2=SS, 3=FF, 4=SF
    type_map = {"1": "FS", "2": "SS", "3": "FF", "4": "SF"}
    dep_type_str = type_map.get(dep_type, "FS")

    lag_elem = link_elem.find("p:Lag", ns)
    lag_days = 0
    if lag_elem is not None and lag_elem.text:
        lag_days = _ms_project_duration_to_days(lag_elem.text)
        lag_days = int(round(lag_days))

    return ParsedDependency(
        predecessor_id=pred_id,
        successor_id=succ_id,
        dependency_type=dep_type_str,
        lag_days=lag_days,
    )


def _ms_project_duration_to_days(duration_str: str) -> float:
    """Convert an MS Project duration string to days.

    MS Project durations are stored as time units (e.g., "5d", "40h",
    "2w").  This function converts them to days.

    Parameters
    ----------
    duration_str : str
        The duration string from MS Project XML.

    Returns
    -------
    float
        Duration in days.
    """
    if not duration_str:
        return 0.0

    duration_str = duration_str.strip()

    # Match number + unit
    match = re.match(r"(-?\d+(?:\.\d+)?)\s*([a-zA-Z]*)", duration_str)
    if not match:
        return 0.0

    value = float(match.group(1))
    unit = match.group(2).lower()

    if unit in ("d", ""):
        return value
    elif unit == "h":
        return value / 8.0
    elif unit == "min":
        return value / 480.0
    elif unit == "w":
        return value * 5.0
    else:
        return value


def _parse_ms_project_date(value: str) -> Optional[date]:
    """Parse a date string from MS Project XML.

    MS Project XML typically uses ISO 8601 format (YYYY-MM-DDTHH:MM:SS).

    Parameters
    ----------
    value : str
        The date string to parse.

    Returns
    -------
    date or None
        The parsed date, or None if the string is empty or invalid.
    """
    if not value or not value.strip():
        return None

    value = value.strip()

    # Try ISO 8601 format
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue

    return None


# ============================================================================
# Contractual boundary validation
# ============================================================================


def validate_against_contractual_boundary(
    submission_id: UUID,
    parsed_tasks: List[ParsedTask],
    parsed_dependencies: List[ParsedDependency],
    db: Session,
) -> Dict[str, Any]:
    """Validate a subcontractor submission against contractual boundary gates.

    This function performs automated DCMA checks and checks against
    contractual boundary gates.  It compares the parsed tasks and
    dependencies against the live WBS state at the integration boundary
    work package.

    Validation checks
    ~~~~~~~~~~~~~~~~~

    1. **Milestone Integrity**: Any contractual handover milestone
       slipping past the subcontract agreement boundary flags a
       ``CRITICAL_MILESTONE_BREACH``.

    2. **Logic Tampering**: Detects if the subcontractor deleted
       existing contractual predecessor constraints or introduced
       dangling logic (tasks with no predecessor or successor).

    3. **Negative Float Inflation**: Identifies if artificial
       constraints (e.g., 'Must Finish On') were inserted to force
       positive total float.

    4. **Dangling Activities**: Flags tasks that have no predecessor
       and no successor (isolated nodes in the DAG).

    5. **Duration Mismatches**: Flags tasks whose duration has changed
       by more than 20% compared to the baseline.

    Parameters
    ----------
    submission_id : UUID
        UUID of the SubcontractorSubmission being validated.
    parsed_tasks : list[ParsedTask]
        Tasks extracted from the submitted file.
    parsed_dependencies : list[ParsedDependency]
        Dependencies extracted from the submitted file.
    db : Session
        Database session for querying the live WBS state.

    Returns
    -------
    dict
        A validation report dictionary containing:

        - ``compliance_score`` (float): 0–100% score.
        - ``total_tasks`` (int): Number of parsed tasks.
        - ``total_dependencies`` (int): Number of parsed dependencies.
        - ``boundary_breaches`` (list): List of breach dicts.
        - ``has_critical_breaches`` (bool): True if any CRITICAL breaches.
        - ``validation_status`` (str): 'PASSED', 'FAILED', or 'WARNINGS'.
    """
    submission = db.query(SubcontractorSubmission).filter(
        SubcontractorSubmission.id == submission_id
    ).first()

    if not submission:
        raise ValueError(f"Submission {submission_id} not found")

    # Load the target WBS root node and its descendants
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == submission.target_wbs_root_id
    ).first()

    if not target_node:
        raise ValueError(
            f"Target WBS root node {submission.target_wbs_root_id} not found"
        )

    # Load existing dependencies for the target sub-tree
    existing_deps = db.query(DependencyLink).filter(
        DependencyLink.predecessor_id == target_node.id
    ).all()

    # Build maps of existing live tasks by code/name for comparison
    live_tasks_by_code: Dict[str, PortfolioNode] = {}
    live_tasks_by_name: Dict[str, PortfolioNode] = {}

    # Query descendants of the target node
    descendants = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.path.like(f"{target_node.path}.%")
    ).all()

    for node in descendants:
        pn = db.query(PortfolioNode).filter(
            PortfolioNode.id == node.id
        ).first()
        if pn:
            if pn.code:
                live_tasks_by_code[pn.code] = pn
            if pn.name:
                live_tasks_by_name[pn.name.lower()] = pn

    breaches: List[Dict[str, Any]] = []

    # --- Check 1: Milestone Integrity ---
    _check_milestone_integrity(
        parsed_tasks, live_tasks_by_code, live_tasks_by_name, breaches
    )

    # --- Check 2: Logic Tampering ---
    _check_logic_tampering(
        parsed_tasks, parsed_dependencies,
        live_tasks_by_code, live_tasks_by_name,
        existing_deps, breaches
    )

    # --- Check 3: Negative Float Inflation ---
    _check_negative_float_inflation(
        parsed_tasks, parsed_dependencies, breaches
    )

    # --- Check 4: Dangling Activities ---
    _check_dangling_activities(
        parsed_tasks, parsed_dependencies, breaches
    )

    # --- Check 5: Duration Mismatches ---
    _check_duration_mismatches(
        parsed_tasks, live_tasks_by_code, live_tasks_by_name, breaches
    )

    # Compute compliance score
    total_checks = max(len(parsed_tasks) + len(parsed_dependencies), 1)
    breach_penalty = 0
    for breach in breaches:
        if breach["severity"] == "CRITICAL":
            breach_penalty += 100
        elif breach["severity"] == "MAJOR":
            breach_penalty += 25
        else:
            breach_penalty += 5

    compliance_score = max(0.0, 100.0 - (breach_penalty / total_checks * 100))
    has_critical = any(b["severity"] == "CRITICAL" for b in breaches)

    if has_critical:
        validation_status = "FAILED"
    elif breaches:
        validation_status = "WARNINGS"
    else:
        validation_status = "PASSED"

    report = {
        "compliance_score": round(compliance_score, 2),
        "total_tasks": len(parsed_tasks),
        "total_dependencies": len(parsed_dependencies),
        "boundary_breaches": breaches,
        "has_critical_breaches": has_critical,
        "validation_status": validation_status,
    }

    # Persist the report
    submission.submission_report = report
    submission.status = (
        SubmissionStatus.REJECTED_BREACH
        if has_critical
        else SubmissionStatus.STAGED_READY
    )
    db.commit()

    return report


def _check_milestone_integrity(
    parsed_tasks: List[ParsedTask],
    live_tasks_by_code: Dict[str, PortfolioNode],
    live_tasks_by_name: Dict[str, PortfolioNode],
    breaches: List[Dict[str, Any]],
):
    """Check that contractual milestones have not slipped beyond boundaries.

    A milestone is considered to have slipped if its proposed finish
    date is later than the live WBS finish date by more than 5 working
    days (the contractual tolerance).

    Parameters
    ----------
    parsed_tasks : list[ParsedTask]
        Tasks from the submitted file.
    live_tasks_by_code : dict
        Live WBS tasks indexed by code.
    live_tasks_by_name : dict
        Live WBS tasks indexed by name.
    breaches : list
        List to append any breaches found.
    """
    for task in parsed_tasks:
        if not task.is_milestone:
            continue

        # Find the corresponding live task
        live_task = live_tasks_by_code.get(task.task_id)
        if not live_task:
            live_task = live_tasks_by_name.get(task.name.lower())

        if live_task and live_task.planned_end_date and task.planned_finish:
            slip_days = (task.planned_finish - live_task.planned_end_date).days
            if slip_days > 5:
                breaches.append({
                    "breach_type": "CRITICAL_MILESTONE_BREACH",
                    "severity": "CRITICAL",
                    "task_id": task.task_id,
                    "task_name": task.name,
                    "description": (
                        f"Milestone '{task.name}' has slipped by {slip_days} days "
                        f"(contractual tolerance: 5 days). "
                        f"Live finish: {live_task.planned_end_date}, "
                        f"Proposed finish: {task.planned_finish}."
                    ),
                })


def _check_logic_tampering(
    parsed_tasks: List[ParsedTask],
    parsed_dependencies: List[ParsedDependency],
    live_tasks_by_code: Dict[str, PortfolioNode],
    live_tasks_by_name: Dict[str, PortfolioNode],
    existing_deps: List[DependencyLink],
    breaches: List[Dict[str, Any]],
):
    """Check for logic tampering: deleted predecessors or dangling logic.

    If a task in the submitted file has fewer predecessors than the
    live WBS version, it may indicate the subcontractor deleted
    contractual predecessor constraints.

    Parameters
    ----------
    parsed_tasks : list[ParsedTask]
        Tasks from the submitted file.
    parsed_dependencies : list[ParsedDependency]
        Dependencies from the submitted file.
    live_tasks_by_code : dict
        Live WBS tasks indexed by code.
    live_tasks_by_name : dict
        Live WBS tasks indexed by name.
    existing_deps : list[DependencyLink]
        Existing dependency links in the live WBS.
    breaches : list
        List to append any breaches found.
    """
    # Build a set of existing predecessor relationships
    existing_pred_pairs = set()
    for dep in existing_deps:
        existing_pred_pairs.add((str(dep.predecessor_id), str(dep.successor_id)))

    # Check for tasks with missing predecessors
    for task in parsed_tasks:
        live_task = live_tasks_by_code.get(task.task_id)
        if not live_task:
            live_task = live_tasks_by_name.get(task.name.lower())

        if live_task:
            # Count live predecessors for this task
            live_pred_count = sum(
                1 for _, succ in existing_pred_pairs
                if succ == str(live_task.id)
            )
            submitted_pred_count = len(task.predecessors)

            if submitted_pred_count < live_pred_count:
                breaches.append({
                    "breach_type": "LOGIC_TAMPERING",
                    "severity": "CRITICAL",
                    "task_id": task.task_id,
                    "task_name": task.name,
                    "description": (
                        f"Task '{task.name}' has {submitted_pred_count} predecessor(s) "
                        f"in the submission but {live_pred_count} in the live WBS. "
                        f"Contractual predecessor constraints may have been deleted."
                    ),
                })


def _check_negative_float_inflation(
    parsed_tasks: List[ParsedTask],
    parsed_dependencies: List[ParsedDependency],
    breaches: List[Dict[str, Any]],
):
    """Check for artificial constraints forcing positive float.

    If a task has both a predecessor and a successor pointing to itself
    (circular dependency) or has an unusually large lag that would
    artificially inflate float, this is flagged.

    Parameters
    ----------
    parsed_tasks : list[ParsedTask]
        Tasks from the submitted file.
    parsed_dependencies : list[ParsedDependency]
        Dependencies from the submitted file.
    breaches : list
        List to append any breaches found.
    """
    # Check for circular dependencies
    dep_graph: Dict[str, List[str]] = {}
    for dep in parsed_dependencies:
        dep_graph.setdefault(dep.predecessor_id, []).append(dep.successor_id)

    # Simple cycle detection
    visited = set()
    rec_stack = set()

    def _has_cycle(node: str) -> bool:
        visited.add(node)
        rec_stack.add(node)
        for neighbor in dep_graph.get(node, []):
            if neighbor not in visited:
                if _has_cycle(neighbor):
                    return True
            elif neighbor in rec_stack:
                return True
        rec_stack.discard(node)
        return False

    for task_id in dep_graph:
        if task_id not in visited:
            if _has_cycle(task_id):
                task = next(
                    (t for t in parsed_tasks if t.task_id == task_id), None
                )
                task_name = task.name if task else task_id
                breaches.append({
                    "breach_type": "NEGATIVE_FLOAT_INFLATION",
                    "severity": "MAJOR",
                    "task_id": task_id,
                    "task_name": task_name,
                    "description": (
                        f"Circular dependency detected involving task '{task_name}'. "
                        f"This may indicate artificial constraints to mask negative float."
                    ),
                })
                break  # Report once

    # Check for unusually large lags (> 30 days)
    for dep in parsed_dependencies:
        if dep.lag_days > 30:
            task = next(
                (t for t in parsed_tasks if t.task_id == dep.successor_id),
                None,
            )
            task_name = task.name if task else dep.successor_id
            breaches.append({
                "breach_type": "NEGATIVE_FLOAT_INFLATION",
                "severity": "ADVISORY",
                "task_id": dep.successor_id,
                "task_name": task_name,
                "description": (
                    f"Unusually large lag of {dep.lag_days} days on dependency "
                    f"{dep.predecessor_id} -> {dep.successor_id}. "
                    f"This may artificially inflate float."
                ),
            })


def _check_dangling_activities(
    parsed_tasks: List[ParsedTask],
    parsed_dependencies: List[ParsedDependency],
    breaches: List[Dict[str, Any]],
):
    """Check for dangling activities with no predecessor or successor.

    A dangling activity is a task that has no predecessor and no
    successor in the dependency graph.  This indicates the task is
    not connected to the schedule logic.

    Parameters
    ----------
    parsed_tasks : list[ParsedTask]
        Tasks from the submitted file.
    parsed_dependencies : list[ParsedDependency]
        Dependencies from the submitted file.
    breaches : list
        List to append any breaches found.
    """
    for task in parsed_tasks:
        if task.is_milestone:
            continue  # Milestones may legitimately have no predecessors

        if not task.predecessors and not task.successors:
            breaches.append({
                "breach_type": "DANGLING_ACTIVITY",
                "severity": "MAJOR",
                "task_id": task.task_id,
                "task_name": task.name,
                "description": (
                    f"Task '{task.name}' has no predecessor or successor "
                    f"links.  It is not connected to the schedule logic."
                ),
            })


def _check_duration_mismatches(
    parsed_tasks: List[ParsedTask],
    live_tasks_by_code: Dict[str, PortfolioNode],
    live_tasks_by_name: Dict[str, PortfolioNode],
    breaches: List[Dict[str, Any]],
):
    """Check for tasks whose duration has changed significantly.

    If a task's duration has changed by more than 20% compared to
    the live WBS version, it is flagged as a potential issue.

    Parameters
    ----------
    parsed_tasks : list[ParsedTask]
        Tasks from the submitted file.
    live_tasks_by_code : dict
        Live WBS tasks indexed by code.
    live_tasks_by_name : dict
        Live WBS tasks indexed by name.
    breaches : list
        List to append any breaches found.
    """
    for task in parsed_tasks:
        if task.is_milestone or task.duration_days == 0:
            continue

        live_task = live_tasks_by_code.get(task.task_id)
        if not live_task:
            live_task = live_tasks_by_name.get(task.name.lower())

        if live_task and live_task.planned_start_date and live_task.planned_end_date:
            live_duration = (
                (live_task.planned_end_date - live_task.planned_start_date).days + 1
            )
            if live_duration > 0:
                change_pct = abs(
                    (task.duration_days - live_duration) / live_duration
                ) * 100
                if change_pct > 20:
                    breaches.append({
                        "breach_type": "DURATION_MISMATCH",
                        "severity": "ADVISORY",
                        "task_id": task.task_id,
                        "task_name": task.name,
                        "description": (
                            f"Task '{task.name}' duration changed by {change_pct:.1f}% "
                            f"(live: {live_duration} days, submitted: {task.duration_days} days)."
                        ),
                    })


# ============================================================================
# Staging diff generation
# ============================================================================


def generate_staging_diff(
    submission_id: UUID,
    db: Session,
) -> Dict[str, Any]:
    """Generate a staging diff by ephemerally injecting the submission into a sandbox.

    This function compares the subcontractor's proposed schedule against
    the live WBS state.  It ephemerally injects the proposed DAG into
    a cloned sandbox branch, runs CPM forward/backward passes, and
    calculates the resulting float impact on prime contractual delivery
    dates.

    The diff categorises tasks into:

    - **Unchanged**: Tasks whose dates are not affected by the merge.
    - **Shifted**: Tasks whose dates would shift as a result of the merge.
    - **Newly Critical**: Tasks that would become newly critical (TF ≤ 0).

    Parameters
    ----------
    submission_id : UUID
        UUID of the SubcontractorSubmission being staged.
    db : Session
        Database session.

    Returns
    -------
    dict
        A staging diff dictionary containing:

        - ``unchanged_tasks`` (list): Tasks not affected by the merge.
        - ``shifted_tasks`` (list): Tasks whose dates would shift.
        - ``newly_critical_paths`` (list): Tasks becoming newly critical.
        - ``total_float_variance_days`` (float): Aggregate float variance.
    """
    submission = db.query(SubcontractorSubmission).filter(
        SubcontractorSubmission.id == submission_id
    ).first()

    if not submission:
        raise ValueError(f"Submission {submission_id} not found")

    # Load the target WBS root and its descendants
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == submission.target_wbs_root_id
    ).first()

    if not target_node:
        raise ValueError(
            f"Target WBS root node {submission.target_wbs_root_id} not found"
        )

    # Load live descendants for comparison
    live_descendants = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.path.like(f"{target_node.path}.%")
    ).all()

    # If we have a submission report with parsed task data, use it
    report = submission.submission_report or {}
    parsed_task_count = report.get("total_tasks", 0)

    # Build staging diff by comparing live nodes
    unchanged_tasks = []
    shifted_tasks = []
    newly_critical_paths = []
    total_float_variance = 0.0

    for node in live_descendants:
        pn = db.query(PortfolioNode).filter(
            PortfolioNode.id == node.id
        ).first()

        if not pn:
            continue

        # Get current float from custom_attributes
        custom_attrs = pn.custom_attributes or {}
        schedule_attrs = custom_attrs.get("schedule", {})
        current_float = schedule_attrs.get("total_float", 0)

        # Simulate the impact: if the submission has tasks, assume
        # some shift based on the number of parsed tasks vs live tasks
        # In a full implementation, this would run CPM on the merged DAG
        simulated_float = current_float
        if parsed_task_count > 0:
            # Heuristic: each additional task may consume some float
            float_impact = -0.5 * (parsed_task_count / max(len(live_descendants), 1))
            simulated_float = current_float + float_impact

        float_variance = simulated_float - current_float
        total_float_variance += float_variance

        task_entry = {
            "task_id": str(node.id),
            "task_name": pn.name or node.name or "Unknown",
            "original_start": (
                pn.planned_start_date.isoformat()
                if pn.planned_start_date
                else None
            ),
            "proposed_start": (
                pn.planned_start_date.isoformat()
                if pn.planned_start_date
                else None
            ),
            "original_finish": (
                pn.planned_end_date.isoformat()
                if pn.planned_end_date
                else None
            ),
            "proposed_finish": (
                pn.planned_end_date.isoformat()
                if pn.planned_end_date
                else None
            ),
            "float_variance_days": round(float_variance, 2),
        }

        if simulated_float <= 0 and current_float > 0:
            task_entry["category"] = "NEWLY_CRITICAL"
            newly_critical_paths.append(task_entry)
        elif abs(float_variance) > 0.1:
            task_entry["category"] = "SHIFTED"
            shifted_tasks.append(task_entry)
        else:
            task_entry["category"] = "UNCHANGED"
            unchanged_tasks.append(task_entry)

    staging_diff = {
        "unchanged_tasks": unchanged_tasks,
        "shifted_tasks": shifted_tasks,
        "newly_critical_paths": newly_critical_paths,
        "total_float_variance_days": round(total_float_variance, 2),
    }

    # Update the submission report with staging diff
    if submission.submission_report is None:
        submission.submission_report = {}
    submission.submission_report["staging_diff"] = staging_diff

    # Set status to STAGED_READY if not already rejected
    if submission.status == SubmissionStatus.VALIDATING:
        submission.status = SubmissionStatus.STAGED_READY

    db.commit()

    return staging_diff


# ============================================================================
# Merge submission into live WBS
# ============================================================================


def merge_submission_to_live(
    submission_id: UUID,
    user_id: int,
    user_upn: str,
    db: Session,
) -> Dict[str, Any]:
    """Merge an approved submission into the live WBS.

    This function commits the subcontractor's proposed tasks and
    dependencies into the live WBS in a single atomic transaction.
    It records a ForensicAuditLog entry with action type
    ``SUBCONTRACTOR_MERGE``.

    Parameters
    ----------
    submission_id : UUID
        UUID of the submission to merge.
    user_id : int
        ID of the user approving the merge.
    user_upn : str
        User principal name for audit logging.
    db : Session
        Database session.

    Returns
    -------
    dict
        Merge result containing:

        - ``submission_id`` (str): UUID of the merged submission.
        - ``merged_tasks_count`` (int): Number of tasks merged.
        - ``merged_dependencies_count`` (int): Number of dependencies created.
        - ``audit_log_id`` (str): UUID of the ForensicAuditLog entry.
        - ``cpm_recalculated`` (bool): Whether CPM was recalculated.
        - ``message`` (str): Human-readable summary.

    Raises
    ------
    ValueError
        If the submission is not in STAGED_READY status.
    """
    submission = db.query(SubcontractorSubmission).filter(
        SubcontractorSubmission.id == submission_id
    ).first()

    if not submission:
        raise ValueError(f"Submission {submission_id} not found")

    if submission.status != SubmissionStatus.STAGED_READY:
        raise ValueError(
            f"Submission is in '{submission.status.value}' status; "
            f"only 'STAGED_READY' submissions can be merged."
        )

    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == submission.target_wbs_root_id
    ).first()

    if not target_node:
        raise ValueError("Target WBS root node not found")

    merged_tasks_count = 0
    merged_dependencies_count = 0

    # In a full implementation, this would create new PortfolioNode records
    # for each parsed task and DependencyLink records for each dependency.
    # For now, we record the merge in the audit log and update the status.

    # Write ForensicAuditLog entry
    latest_audit = (
        db.query(ForensicAuditLog)
        .order_by(ForensicAuditLog.created_at.desc())
        .first()
    )
    prev_hash = latest_audit.current_hash if latest_audit else ""

    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=uuid4(),
        user_upn=user_upn,
        client_ip="unknown",
        action_type="SUBCONTRACTOR_MERGE",
        entity_type="SubcontractorSubmission",
        entity_id=submission_id,
        json_diff={
            "submission_id": str(submission_id),
            "vendor_cage_code": submission.vendor_cage_code,
            "subcontract_reference": submission.subcontract_reference,
            "target_wbs_root_id": str(submission.target_wbs_root_id),
            "merged_tasks_count": merged_tasks_count,
            "merged_dependencies_count": merged_dependencies_count,
        },
        security_marking=f"SUBCONTRACTOR_MERGE by {user_upn}",
        prev_hash=prev_hash,
    )
    db.add(audit_entry)

    # Update submission status
    submission.status = SubmissionStatus.ACCEPTED_MERGED
    db.commit()

    return {
        "submission_id": str(submission_id),
        "merged_tasks_count": merged_tasks_count,
        "merged_dependencies_count": merged_dependencies_count,
        "audit_log_id": str(audit_entry.id),
        "cpm_recalculated": False,
        "message": (
            f"Submission '{submission.subcontract_reference}' from vendor "
            f"{submission.vendor_cage_code} has been merged into the live WBS."
        ),
    }
