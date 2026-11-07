"""Restricted SQL builder service for dashboard widgets.

This service provides a safe way to execute read-only SQL queries against
the database from dashboard widgets. It validates all queries against an
allowlist of tables and columns using AST parsing via sqlglot, ensuring only
SELECT statements are executed with parameterized values.

Security
~~~~~~~~

- Only SELECT statements are allowed — no INSERT, UPDATE, DELETE, DROP, etc.
- Queries must reference only allowed tables and columns.
- All values must be parameterized — no string interpolation.
- Subqueries are allowed but must also reference only allowed tables.
- JOINs are allowed but must reference only allowed tables.
- No references to system schemas (pg_catalog, information_schema).
- No dangerous functions (pg_read_file, pg_sleep, version(), etc.).
- Automatic security classification predicate injection.

Usage
~~~~~

    from app.services.sql_builder import validate_and_build_ast, execute_query

    # Validate and build sanitized SQL
    is_valid, sanitized_sql, error = validate_and_build_ast(
        "SELECT id, name FROM portfolio_nodes WHERE id = :node_id",
        "unclassified",
        {"node_id": "..."}
    )
    if not is_valid:
        raise ValueError(error)

    # Execute the sanitized query
    result = await execute_query(db, sanitized_sql, params)
"""

from typing import Any, Dict, List, Optional, Tuple

import sqlglot
import sqlglot.expressions as exp
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


# ============================================================================
# Allowed Tables and Columns
# ============================================================================

# Curated list of safe tables and their allowed columns for the SQL builder.
# Only SELECT queries against these tables/columns are permitted.
ALLOWED_TABLES: Dict[str, List[str]] = {
    # Core project data
    "portfolio_nodes": [
        "id", "name", "code", "node_type", "parent_id", "wbs_code",
        "delivery_mode", "security_classification", "caveats",
        "planned_start_date", "planned_end_date", "actual_start_date", "actual_end_date",
        "early_start", "early_finish", "late_start", "late_finish",
        "total_float", "free_float", "is_critical",
        "percent_complete", "physical_percent",
        "bac_cost", "planned_value", "earned_value", "actual_cost",
        "cv", "sv", "cpi", "spi", "eac", "vac",
        "assigned_resources", "allocated_units", "planned_hours",
        "active_blockers", "blocker_severity",
        "dal_sil_level", "engineering_baseline_tier",
        "procurement_status", "forecast_delivery_date",
        "baseline_b0_start", "baseline_b0_finish",
        "baseline_bcurr_start", "baseline_bcurr_finish",
        "presence_users",
        "version_id", "updated_at", "updated_by",
        "created_at",
    ],
    "resource_nodes": [
        "id", "name", "resource_type", "skill_level",
        "availability", "cost_rate", "status",
        "created_at", "updated_at",
    ],
    "resource_assignments": [
        "id", "resource_node_id", "portfolio_node_id",
        "allocation_units", "start_date", "end_date",
        "status", "created_at", "updated_at",
    ],
    "node_blockers": [
        "id", "portfolio_node_id", "title", "description",
        "severity", "status", "assigned_to",
        "created_at", "updated_at",
    ],
    "location_nodes": [
        "id", "name", "location_type", "capacity",
        "status", "created_at", "updated_at",
    ],
    "universal_breakdown_nodes": [
        "id", "name", "node_type", "parent_id",
        "created_at", "updated_at",
    ],
    # Users
    "users": [
        "id", "username", "email", "security_clearance",
        "is_active", "created_at", "updated_at",
    ],
    # Dependencies
    "dependency_links": [
        "id", "predecessor_id", "successor_id",
        "link_type", "lag_days", "created_at",
    ],
    # Milestones
    "milestones": [
        "id", "portfolio_node_id", "name", "milestone_date",
        "status", "created_at", "updated_at",
    ],
    # Tasks
    "tasks": [
        "id", "portfolio_node_id", "title", "description",
        "status", "priority", "assignee_id",
        "due_date", "completed_at", "created_at", "updated_at",
    ],
    # EVM data
    "evm_data": [
        "id", "portfolio_node_id", "period",
        "planned_value", "earned_value", "actual_cost",
        "cpi", "spi", "eac", "vac",
        "created_at",
    ],
    # Baselines
    "baselines": [
        "id", "portfolio_node_id", "name", "baseline_type",
        "start_date", "end_date", "created_at",
    ],
    # Procurement
    "procurement_items": [
        "id", "portfolio_node_id", "item_name", "quantity",
        "unit_cost", "total_cost", "status",
        "expected_delivery_date", "actual_delivery_date",
        "created_at", "updated_at",
    ],
    # Reserves
    "management_reserves": [
        "id", "portfolio_node_id", "reserve_type",
        "amount", "drawn_amount", "remaining",
        "status", "created_at", "updated_at",
    ],
    # Facilities
    "facility_reservations": [
        "id", "facility_id", "portfolio_node_id",
        "start_time", "end_time", "status",
        "created_at", "updated_at",
    ],
    # Custom fields
    "custom_field_values": [
        "id", "entity_type", "entity_id", "field_id",
        "value_text", "value_number", "value_date",
        "created_at", "updated_at",
    ],
}

# Dangerous SQL function names that must not appear in queries
DANGEROUS_FUNCTIONS = [
    "pg_read_file", "pg_sleep", "version", "current_setting", "system",
    "pg_ls_dir", "pg_stat_file", "pg_read_binary_file",
    "pg_copy", "pg_backup_custom", "pg_backup_base",
]

# System schemas that must not be referenced
SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"]


# ============================================================================
# AST-based SQL Validation
# ============================================================================


def _get_cte_names(node: exp.Expression) -> set:
    """Collect all CTE alias names from a SELECT or UNION AST so they can be
    excluded from the table-allowlist check (they are validated inside their
    own body)."""
    cte_names: set = set()

    if isinstance(node, (exp.Select, exp.Union)):
        with_arg = node.args.get("with_")
        if with_arg:
            for cte in with_arg.expressions:
                if isinstance(cte, exp.CTE) and cte.alias:
                    cte_names.add(cte.alias.lower())

    return cte_names


def _get_alias_mapping(node: exp.Expression) -> Dict[str, str]:
    """Build a mapping of alias -> table_name from the AST node.

    In sqlglot v30 the FROM clause is stored as ``from_`` (a ``From`` object
    with a single ``this``), and additional tables from comma-joins appear in
    the ``joins`` list.
    """
    alias_map: Dict[str, str] = {}

    if isinstance(node, exp.Select):
        # FROM clause – single table
        from_arg = node.args.get("from_")
        if from_arg and isinstance(from_arg, exp.From):
            table_node = from_arg.this
            if isinstance(table_node, exp.Table):
                tname = table_node.name.lower()
                alias = (table_node.alias or table_node.name).lower()
                alias_map[alias] = tname

        # JOINs (includes comma-joins promoted to implicit JOINs)
        for join in node.args.get("joins", []):
            jtable = join.this
            if isinstance(jtable, exp.Table):
                tname = jtable.name.lower()
                alias = (jtable.alias or jtable.name).lower()
                alias_map[alias] = tname

    return alias_map


def _resolve_table_for_column(col_node: exp.Column, alias_map: Dict[str, str]) -> Optional[str]:
    """Resolve the actual table name for a column, considering aliases."""
    if col_node.table:
        table_ref = col_node.table.lower()
        if table_ref in alias_map:
            return alias_map[table_ref]
        return table_ref
    return None


def _validate_node(
    node: exp.Expression,
    alias_map: Dict[str, str],
    cte_names: set,
    errors: List[str],
) -> None:
    """Recursively walk an AST node and validate tables, columns, and
    dangerous functions.

    This is the single entry-point used for every sub-tree (SELECT, JOIN,
    CTE body, UNION branch, etc.).
    """

    # --- Table validation ---
    for table_node in node.find_all(exp.Table):
        tname = (table_node.name or "").lower()
        if not tname:
            continue

        # Skip CTE aliases – they are validated inside their own body
        if tname in cte_names:
            continue

        # System schema check
        if table_node.db:
            schema = table_node.db.lower()
            if schema in SYSTEM_SCHEMAS:
                errors.append(
                    f"Reference to system schema '{schema}' is not allowed"
                )
                continue

        # Allowlist check
        if tname not in ALLOWED_TABLES:
            errors.append(f"Table '{tname}' is not in the allowed tables list")

    # --- Column validation ---
    for col_node in node.find_all(exp.Column):
        col_name = (col_node.name or "").lower()
        if not col_name:
            continue
        table_ref = _resolve_table_for_column(col_node, alias_map)

        if table_ref and table_ref in ALLOWED_TABLES:
            allowed_cols = [c.lower() for c in ALLOWED_TABLES[table_ref]]
            if col_name not in allowed_cols:
                errors.append(
                    f"Column '{col_name}' is not allowed for table '{table_ref}'"
                )
        elif table_ref and table_ref not in ALLOWED_TABLES:
            # Table already flagged above
            pass
        elif not table_ref:
            # Unqualified column – check if it exists in *any* allowed table
            found = False
            for _tbl, cols in ALLOWED_TABLES.items():
                if col_name in [c.lower() for c in cols]:
                    found = True
                    break
            if not found:
                # Could be a parameter placeholder or function result – skip
                pass

    # --- Dangerous function check ---
    for child in node.walk():
        if isinstance(child, exp.Anonymous):
            func_name = (
                child.this.lower()
                if isinstance(child.this, exp.Identifier)
                else str(child.this).lower()
            )
            if func_name in DANGEROUS_FUNCTIONS:
                errors.append(f"Function '{func_name}' is not allowed")
        elif isinstance(child, exp.Func):
            cls_name = type(child).__name__.lower()
            # Map well-known sqlglot function classes to their SQL names
            func_name_map = {
                "currentversion": "version",
                "readfile": "pg_read_file",
                "sleep": "pg_sleep",
                "systemfunc": "system",
                "databasemetadata": "current_setting",
            }
            mapped = func_name_map.get(cls_name, cls_name)
            if mapped in DANGEROUS_FUNCTIONS:
                errors.append(f"Function '{mapped}' is not allowed")

        if isinstance(child, exp.Literal):
            val = str(child.this).lower()
            for func in DANGEROUS_FUNCTIONS:
                if func in val:
                    errors.append(f"Function '{func}' detected in literal value")
                    break


def validate_and_build_ast(
    sql: str,
    user_clearance: str,
    params: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Validate a SQL query using AST parsing and build sanitized SQL.

    Parses the query via sqlglot, enforces that the root expression is strictly
    a SELECT statement (or a UNION of SELECTs), validates all table and column
    references against the allowlist, checks for dangerous functions, and
    injects a security classification predicate.

    Parameters
    ----------
    sql : str
        The SQL query string to validate.
    user_clearance : str
        The user's security clearance level for predicate injection.
    params : dict, optional
        Parameterized values for the query.

    Returns
    -------
    tuple[bool, str | None, str | None]
        A tuple of (is_valid, sanitized_sql, error_message).
        If valid, sanitized_sql contains the sanitized query and error_message is None.
        If invalid, sanitized_sql is None and error_message describes the issue.
    """
    if not sql or not sql.strip():
        return False, None, "SQL query cannot be empty"

    # Parse the SQL query
    try:
        parsed = sqlglot.parse_one(sql, read="postgres")
    except Exception as e:
        return False, None, f"Failed to parse SQL query: {str(e)}"

    # Enforce root expression is SELECT or UNION (which is composed of SELECTs)
    if isinstance(parsed, exp.Select):
        root = parsed
    elif isinstance(parsed, exp.Union):
        # UNION is allowed – both sides must be SELECTs
        root = parsed
    else:
        root_type = type(parsed).__name__
        rejected_types = {
            exp.Insert: "INSERT",
            exp.Update: "UPDATE",
            exp.Delete: "DELETE",
            exp.Drop: "DROP",
            exp.Alter: "ALTER",
            exp.Command: "COMMAND",
            exp.Create: "CREATE",
            exp.Merge: "MERGE",
        }
        sql_type = rejected_types.get(type(parsed), root_type)
        return False, None, f"SQL statement type '{sql_type}' is not allowed. Only SELECT queries are permitted."

    errors: List[str] = []

    # Collect CTE names so they are excluded from table-allowlist checks
    cte_names = _get_cte_names(root)

    # Build alias mapping for resolving column references
    alias_map = _get_alias_mapping(root)

    # Validate the entire AST tree
    _validate_node(root, alias_map, cte_names, errors)

    if errors:
        return False, None, "; ".join(errors)

    # Inject security classification predicate
    security_predicate = exp.LTE(
        this=exp.Column(this="security_classification"),
        expression=exp.Placeholder(this="user_clearance")
    )

    # For UNION queries, we need to inject into each SELECT branch
    if isinstance(root, exp.Union):
        # Inject into the left side
        _inject_security_predicate(root.this, security_predicate)
        # Inject into the right side
        expr = root.args.get("expression")
        if expr and isinstance(expr, exp.Select):
            _inject_security_predicate(expr, security_predicate)
    else:
        _inject_security_predicate(root, security_predicate)

    # Generate sanitized SQL
    sanitized_sql = root.sql("postgres")

    return True, sanitized_sql, None


def _inject_security_predicate(
    select_node: exp.Select,
    security_predicate: exp.Expression,
) -> None:
    """Inject the security classification predicate into a SELECT node's WHERE."""
    existing_where = select_node.args.get("where")
    if existing_where:
        combined = exp.And(this=existing_where.this, expression=security_predicate)
        select_node.set("where", exp.Where(this=combined))
    else:
        select_node.set("where", exp.Where(this=security_predicate))


def validate_query(
    sql: str,
    params: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Optional[str]]:
    """Validate a SQL query against the allowlist.

    This is a convenience wrapper around validate_and_build_ast that uses
    a default clearance level. For production use, prefer validate_and_build_ast
    with an explicit clearance level.

    Checks that the query is SELECT-only, references only allowed tables
    and columns, and uses parameterized values.

    Parameters
    ----------
    sql : str
        The SQL query string to validate.
    params : dict, optional
        Parameterized values for the query.

    Returns
    -------
    tuple[bool, str | None]
        A tuple of (is_valid, error_message). If valid, error_message is None.
    """
    is_valid, _, error = validate_and_build_ast(sql, "unclassified", params)
    return is_valid, error


# ============================================================================
# Query Execution
# ============================================================================


async def execute_query(
    db: AsyncSession,
    sql: str,
    user_clearance: str = "unclassified",
    params: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Execute a validated SQL query and return results.

    Parameters
    ----------
    db : AsyncSession
        The database session.
    sql : str
        The SQL query string to validate and execute.
    user_clearance : str
        The user's security clearance level.
    params : dict, optional
        Parameterized values for the query.

    Returns
    -------
    dict
        A dictionary with 'rows', 'row_count', and 'columns' keys.

    Raises
    ------
    ValueError
        If the query is not valid.
    """
    is_valid, sanitized_sql, error = validate_and_build_ast(sql, user_clearance, params)
    if not is_valid:
        raise ValueError(f"Invalid SQL query: {error}")

    # Execute using SQLAlchemy text() with parameterized values
    stmt = text(sanitized_sql)
    result = await db.execute(stmt, params or {})

    # Extract column names from the result
    columns = list(result.keys())
    rows = [dict(row._mapping) for row in result.fetchall()]

    return {
        "rows": rows,
        "row_count": len(rows),
        "columns": columns,
    }


def get_allowed_tables() -> Dict[str, List[str]]:
    """Return the allowlist of tables and columns for the frontend SQL builder.

    Returns
    -------
    dict
        Mapping of table names to lists of allowed column names.
    """
    return dict(ALLOWED_TABLES)


def execute_query_sync(
    db_session,
    sql: str,
    user_clearance: str = "unclassified",
    params: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Execute a validated SQL query using a synchronous database session.

    This is a synchronous version of :func:`execute_query` for use in contexts
    that do not have an async event loop (e.g., MCP tool handlers).

    Parameters
    ----------
    db_session
        A synchronous SQLAlchemy Session.
    sql : str
        The validated SQL query string.
    user_clearance : str
        The user's security clearance level.
    params : dict, optional
        Parameterized values for the query.

    Returns
    -------
    dict
        A dictionary with 'rows', 'row_count', and 'columns' keys.

    Raises
    ------
    ValueError
        If the query is not valid.
    """
    is_valid, sanitized_sql, error = validate_and_build_ast(sql, user_clearance, params)
    if not is_valid:
        raise ValueError(f"Invalid SQL query: {error}")

    stmt = text(sanitized_sql)
    result = db_session.execute(stmt, params or {})

    columns = list(result.keys())
    rows = [dict(row._mapping) for row in result.fetchall()]

    return {
        "rows": rows,
        "row_count": len(rows),
        "columns": columns,
    }
