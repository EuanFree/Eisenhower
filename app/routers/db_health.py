"""Database health and maintenance API router.

This module exposes the ``/api/v1/admin/db-health`` endpoint for querying
database health metrics and triggering maintenance tasks. It provides
administrators with visibility into replication lag, index fragmentation,
table bloat, and WAL archiving status.

Endpoints
~~~~~~~~~

- **GET /api/v1/admin/db-health** — Returns current database health metrics
  without running maintenance.
- **POST /api/v1/admin/db-health/run-maintenance** — Triggers a full
  maintenance run (VACUUM ANALYZE, re-index) and returns the results.

Security
~~~~~~~~

All endpoints require JWT authentication. In production, these endpoints
should be accessible only to administrators with clearance ≥ SECRET.

The maintenance tasks require superuser privileges on the PostgreSQL
database. In a Patroni HA cluster, maintenance should be run only on
the primary node.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.utils.auth import get_current_user
from app.models.models import User
from app.services.db_maintenance import (
    DatabaseHealthMetrics,
    IndexHealth,
    ReplicationStatus,
    TableHealth,
    get_health_metrics,
    run_maintenance,
)

logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


# ============================================================================
# Response Schemas
# ============================================================================


class IndexHealthResponse(BaseModel):
    """Response schema for index health metrics.

    Attributes
    ----------
    index_name : str
        Name of the index.
    table_name : str
        Name of the table the index belongs to.
    index_size_bytes : int
        Current size of the index on disk.
    index_scans : int
        Number of index scans since last statistics reset.
    seq_scans : int
        Number of sequential scans on the table.
    idx_scan_ratio : float
        Ratio of index scans to total scans.
    bloat_estimate_percent : float
        Estimated index bloat percentage.
    """

    index_name: str
    table_name: str
    index_size_bytes: int = 0
    index_scans: int = 0
    seq_scans: int = 0
    idx_scan_ratio: float = 0.0
    bloat_estimate_percent: float = 0.0


class ReplicationStatusResponse(BaseModel):
    """Response schema for replication status.

    Attributes
    ----------
    standby_name : str
        Name of the standby node.
    state : str
        Current replication state.
    lag_bytes : int
        Replication lag in bytes.
    replay_lag_seconds : float or None
        Time difference between primary commit and standby replay.
    is_synchronous : bool
        True if this is a synchronous replica.
    """

    standby_name: str
    state: str = "unknown"
    lag_bytes: int = 0
    replay_lag_seconds: float | None = None
    is_synchronous: bool = False


class TableHealthResponse(BaseModel):
    """Response schema for table health metrics.

    Attributes
    ----------
    table_name : str
        Name of the table.
    row_count : int
        Estimated number of live rows.
    dead_tuple_count : int
        Number of dead tuples awaiting VACUUM.
    dead_tuple_ratio : float
        Ratio of dead tuples to live rows.
    table_size_bytes : int
        Size of the table on disk.
    index_size_bytes : int
        Total size of all indexes on the table.
    """

    table_name: str
    row_count: int = 0
    dead_tuple_count: int = 0
    dead_tuple_ratio: float = 0.0
    table_size_bytes: int = 0
    index_size_bytes: int = 0


class DatabaseHealthResponse(BaseModel):
    """Response schema for comprehensive database health metrics.

    This is the primary response returned by the ``GET /db-health``
    endpoint. It provides a complete snapshot of database health
    including replication status, table bloat, index fragmentation,
    and WAL archiving status.

    Attributes
    ----------
    is_primary : bool
        True if this node is the primary (read/write) node.
    uptime_seconds : float
        How long the PostgreSQL instance has been running.
    total_connections : int
        Current number of active client connections.
    max_connections : int
        Maximum allowed connections.
    replication_statuses : list of ReplicationStatusResponse
        Replication status for each connected standby.
    table_health : list of TableHealthResponse
        Health metrics for high-churn tables.
    index_health : list of IndexHealthResponse
        Health metrics for critical indexes.
    wal_archive_status : dict
        WAL archiving configuration and status.
    maintenance_errors : list of str
        Errors from the last maintenance run.
    """

    is_primary: bool = True
    uptime_seconds: float = 0.0
    total_connections: int = 0
    max_connections: int = 100
    replication_statuses: list[ReplicationStatusResponse] = []
    table_health: list[TableHealthResponse] = []
    index_health: list[IndexHealthResponse] = []
    wal_archive_status: Dict[str, Any] = {}
    maintenance_errors: list[str] = []


class MaintenanceResponse(BaseModel):
    """Response schema for maintenance run results.

    Returned by the ``POST /db-health/run-maintenance`` endpoint after
    completing VACUUM ANALYZE and re-index operations.

    Attributes
    ----------
    success : bool
        True if maintenance completed without critical errors.
    health : DatabaseHealthResponse
        Health metrics collected after maintenance.
    message : str
        Human-readable summary of the maintenance run.
    """

    success: bool
    health: DatabaseHealthResponse
    message: str


def _metrics_to_response(metrics: DatabaseHealthMetrics) -> DatabaseHealthResponse:
    """Convert DatabaseHealthMetrics dataclass to Pydantic response.

    Parameters
    ----------
    metrics : DatabaseHealthMetrics
        The dataclass containing raw health metrics.

    Returns
    -------
    DatabaseHealthResponse
        Pydantic model suitable for JSON serialisation.
    """
    return DatabaseHealthResponse(
        is_primary=metrics.is_primary,
        uptime_seconds=metrics.uptime_seconds,
        total_connections=metrics.total_connections,
        max_connections=metrics.max_connections,
        replication_statuses=[
            ReplicationStatusResponse(
                standby_name=r.standby_name,
                state=r.state,
                lag_bytes=r.lag_bytes,
                replay_lag_seconds=r.replay_lag_seconds,
                is_synchronous=r.is_synchronous,
            )
            for r in metrics.replication_statuses
        ],
        table_health=[
            TableHealthResponse(
                table_name=t.table_name,
                row_count=t.row_count,
                dead_tuple_count=t.dead_tuple_count,
                dead_tuple_ratio=t.dead_tuple_ratio,
                table_size_bytes=t.table_size_bytes,
                index_size_bytes=t.index_size_bytes,
            )
            for t in metrics.table_health
        ],
        index_health=[
            IndexHealthResponse(
                index_name=i.index_name,
                table_name=i.table_name,
                index_size_bytes=i.index_size_bytes,
                index_scans=i.index_scans,
                seq_scans=i.seq_scans,
                idx_scan_ratio=i.idx_scan_ratio,
                bloat_estimate_percent=i.bloat_estimate_percent,
            )
            for i in metrics.index_health
        ],
        wal_archive_status=metrics.wal_archive_status,
        maintenance_errors=metrics.maintenance_errors,
    )


# ============================================================================
# Endpoints
# ============================================================================


@router.get(
    "/db-health",
    response_model=DatabaseHealthResponse,
    summary="Get database health metrics",
    description=(
        "Returns comprehensive database health metrics including replication "
        "lag, table bloat, index fragmentation, and WAL archiving status. "
        "This endpoint queries system catalogs but does not run maintenance."
    ),
)
async def get_db_health(
    current_user: User = Depends(get_current_user),
) -> DatabaseHealthResponse:
    """Get current database health metrics.

    Returns a snapshot of database health without running any maintenance
    tasks. This is a read-only operation that queries PostgreSQL system
    catalogs (``pg_stat_activity``, ``pg_stat_replication``,
    ``pg_stat_user_tables``, ``pg_stat_user_indexes``, ``pg_stat_archiver``).

    Parameters
    ----------
    current_user : User
        The authenticated user (required for access control).

    Returns
    -------
    DatabaseHealthResponse
        Complete health metrics snapshot.

    Raises
    ------
    HTTPException
        500 if the database is unreachable or health collection fails.
    """
    try:
        metrics = get_health_metrics()
        return _metrics_to_response(metrics)
    except Exception as e:
        logger.error("Failed to collect health metrics: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to collect database health metrics: {e}",
        )


@router.post(
    "/db-health/run-maintenance",
    response_model=MaintenanceResponse,
    summary="Run database maintenance",
    description=(
        "Triggers a full database maintenance run including VACUUM ANALYZE "
        "on high-churn tables and re-indexing of the ltree GiST path index. "
        "Returns health metrics collected after maintenance completes."
    ),
)
async def run_db_maintenance(
    current_user: User = Depends(get_current_user),
) -> MaintenanceResponse:
    """Run database maintenance and return health metrics.

    Executes the following maintenance tasks in order:

    1. **VACUUM ANALYZE** on all high-churn tables (``universal_breakdown_nodes``,
       ``forensic_audit_logs``, ``node_blockers``, etc.).
    2. **Re-index** the ltree GiST path index (``ix_ubn_path_gist``) using
       ``REINDEX CONCURRENTLY`` to avoid locking the table.
    3. **Collect** comprehensive health metrics after maintenance.

    This operation requires superuser privileges on the PostgreSQL database.
    In a Patroni HA cluster, maintenance should be run only on the primary node.

    Parameters
    ----------
    current_user : User
        The authenticated user (required for access control).

    Returns
    -------
    MaintenanceResponse
        Maintenance results with post-maintenance health metrics.

    Raises
    ------
    HTTPException
        500 if maintenance fails critically.
    """
    try:
        metrics = run_maintenance()
        response = _metrics_to_response(metrics)

        success = len(metrics.maintenance_errors) == 0
        if success:
            message = "Database maintenance completed successfully."
        else:
            message = (
                f"Database maintenance completed with {len(metrics.maintenance_errors)} "
                f"error(s). Check maintenance_errors for details."
            )

        return MaintenanceResponse(
            success=success,
            health=response,
            message=message,
        )
    except Exception as e:
        logger.error("Database maintenance failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database maintenance failed: {e}",
        )
