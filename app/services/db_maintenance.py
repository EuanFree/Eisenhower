"""Database maintenance and health monitoring service.

This module provides periodic maintenance tasks for the PostgreSQL database,
including VACUUM ANALYZE on high-churn tables, ltree GiST index re-indexing,
and replication lag monitoring. It also exposes health metrics through the
``/api/v1/admin/db-health`` endpoint.

Maintenance Tasks
~~~~~~~~~~~~~~~~~

The following maintenance tasks are performed on a scheduled basis:

1. **VACUUM ANALYZE** — Updates table statistics and reclaims dead tuple space
   on high-churn tables (``universal_breakdown_nodes``, ``forensic_audit_logs``,
   ``node_blockers``, ``resource_assignments``).

2. **GiST Index Re-indexing** — Rebuilds the ltree GiST path index
   (``ix_ubn_path_gist``) to reduce index bloat and improve containment
   query performance.

3. **Replication Lag Monitoring** — Queries ``pg_stat_replication`` to
   measure the replication lag in bytes for each synchronous standby.

4. **Index Fragmentation Analysis** — Queries ``pg_stat_user_indexes`` to
   compute the ratio of index scans to sequential scans, identifying indexes
   that may need rebuilding.

Usage
~~~~~

The maintenance daemon can be run as a standalone script or invoked via the
``/api/v1/admin/db-health`` endpoint:

.. code-block:: bash

    # Run maintenance manually
    python -m app.services.db_maintenance

    # Query health metrics via API
    curl http://localhost:8000/api/v1/admin/db-health

Security Considerations
~~~~~~~~~~~~~~~~~~~~~~~

The maintenance tasks require superuser privileges on the PostgreSQL database.
In a Patroni HA cluster, maintenance should be run only on the primary node
to avoid conflicts with replication.

The ``/api/v1/admin/db-health`` endpoint is protected by JWT authentication
and should be accessible only to administrators with clearance ≥ SECRET.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal

logger = logging.getLogger(__name__)


# ============================================================================
# Data Models
# ============================================================================


@dataclass
class IndexHealth:
    """Health metrics for a single database index.

    Attributes
    ----------
    index_name : str
        Name of the index (e.g., ``'ix_ubn_path_gist'``).
    table_name : str
        Name of the table the index belongs to.
    index_size_bytes : int
        Current size of the index on disk in bytes.
    index_scans : int
        Number of index scans since last statistics reset.
    seq_scans : int
        Number of sequential scans on the table (high values may indicate
        the index is not being used effectively).
    idx_scan_ratio : float
        Ratio of index scans to total scans (higher is better).
    bloat_estimate_percent : float
        Estimated index bloat percentage (0.0–100.0).
    last_vacuum : Optional[datetime]
        Timestamp of the last VACUUM operation on the table.
    last_analyze : Optional[datetime]
        Timestamp of the last ANALYZE operation on the table.
    """

    index_name: str
    table_name: str
    index_size_bytes: int = 0
    index_scans: int = 0
    seq_scans: int = 0
    idx_scan_ratio: float = 0.0
    bloat_estimate_percent: float = 0.0
    last_vacuum: Optional[datetime] = None
    last_analyze: Optional[datetime] = None


@dataclass
class ReplicationStatus:
    """Replication status for a single standby node.

    Attributes
    ----------
    standby_name : str
        Name of the standby node (e.g., ``'patroni-2'``).
    state : str
        Current replication state (streaming, catchup, etc.).
    sent_lsn : str
        Last sent LSN (Log Sequence Number) to this standby.
    write_lsn : str
        Last write LSN acknowledged by this standby.
    flush_lsn : str
        Last flush LSN acknowledged by this standby.
    replay_lsn : str
        Last replay LSN on this standby.
    write_lag_seconds : Optional[float]
        Time difference between primary commit and standby write.
    flush_lag_seconds : Optional[float]
        Time difference between primary commit and standby flush.
    replay_lag_seconds : Optional[float]
        Time difference between primary commit and standby replay.
    lag_bytes : int
        Replication lag in bytes (primary LSN - standby replay LSN).
    is_synchronous : bool
        True if this standby is a synchronous replica.
    """

    standby_name: str
    state: str = "unknown"
    sent_lsn: str = "0/0"
    write_lsn: str = "0/0"
    flush_lsn: str = "0/0"
    replay_lsn: str = "0/0"
    write_lag_seconds: Optional[float] = None
    flush_lag_seconds: Optional[float] = None
    replay_lag_seconds: Optional[float] = None
    lag_bytes: int = 0
    is_synchronous: bool = False


@dataclass
class TableHealth:
    """Health metrics for a single database table.

    Attributes
    ----------
    table_name : str
        Name of the table.
    row_count : int
        Estimated number of live rows.
    dead_tuple_count : int
        Number of dead tuples awaiting VACUUM.
    dead_tuple_ratio : float
        Ratio of dead tuples to live rows (0.0–1.0).
    table_size_bytes : int
        Size of the table on disk in bytes.
    index_size_bytes : int
        Total size of all indexes on the table.
    last_vacuum : Optional[datetime]
        Timestamp of the last VACUUM operation.
    last_autovacuum : Optional[datetime]
        Timestamp of the last autovacuum operation.
    last_analyze : Optional[datetime]
        Timestamp of the last ANALYZE operation.
    last_autoanalyze : Optional[datetime]
        Timestamp of the last autoanalyze operation.
    """

    table_name: str
    row_count: int = 0
    dead_tuple_count: int = 0
    dead_tuple_ratio: float = 0.0
    table_size_bytes: int = 0
    index_size_bytes: int = 0
    last_vacuum: Optional[datetime] = None
    last_autovacuum: Optional[datetime] = None
    last_analyze: Optional[datetime] = None
    last_autoanalyze: Optional[datetime] = None


@dataclass
class DatabaseHealthMetrics:
    """Comprehensive database health metrics.

    This dataclass aggregates all health metrics collected by the
    maintenance daemon. It is serialised to JSON and returned by the
    ``/api/v1/admin/db-health`` endpoint.

    Attributes
    ----------
    timestamp : datetime
        When the metrics were collected (UTC).
    is_primary : bool
        True if this node is the primary (read/write) node in the Patroni
        cluster. False if it is a read-only standby.
    uptime_seconds : float
        How long the PostgreSQL instance has been running.
    total_connections : int
        Current number of active client connections.
    max_connections : int
        Maximum allowed connections (from ``max_connections`` setting).
    replication_statuses : list of ReplicationStatus
        Replication status for each connected standby.
    table_health : list of TableHealth
        Health metrics for high-churn tables.
    index_health : list of IndexHealth
        Health metrics for critical indexes (especially ltree GiST).
    last_maintenance : Optional[datetime]
        When the last maintenance run completed.
    maintenance_errors : list of str
        List of errors encountered during the last maintenance run.
    wal_archive_status : dict
        WAL archiving status (archive_mode, last archived file, etc.).
    """

    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    is_primary: bool = True
    uptime_seconds: float = 0.0
    total_connections: int = 0
    max_connections: int = 100
    replication_statuses: List[ReplicationStatus] = field(default_factory=list)
    table_health: List[TableHealth] = field(default_factory=list)
    index_health: List[IndexHealth] = field(default_factory=list)
    last_maintenance: Optional[datetime] = None
    maintenance_errors: List[str] = field(default_factory=list)
    wal_archive_status: Dict[str, Any] = field(default_factory=dict)


# ============================================================================
# High-Churn Tables
# ============================================================================

# Tables that benefit from regular VACUUM ANALYZE due to high write frequency
HIGH_CHURN_TABLES = [
    "universal_breakdown_nodes",
    "forensic_audit_logs",
    "node_blockers",
    "resource_assignments",
    "schedule_clash_issues",
    "management_reserve_transactions",
]

# Critical indexes that should be monitored for bloat
CRITICAL_INDEXES = [
    "ix_ubn_path_gist",  # ltree GiST index on path column
    "ix_ubn_tree_type",
    "ix_ubn_security_classification",
    "ix_forensic_audit_log_entity",
    "ix_node_blocker_portfolio_node",
]


# ============================================================================
# Database Maintenance Engine
# ============================================================================


class DatabaseMaintenance:
    """Periodic database maintenance engine.

    This class provides methods for running VACUUM ANALYZE, re-indexing
    ltree GiST indexes, and collecting health metrics. It is designed
    to be called from a background task or the ``/api/v1/admin/db-health``
    endpoint.

    Examples
    --------
    Run all maintenance tasks:

    >>> maintenance = DatabaseMaintenance()
    >>> await maintenance.run_all_maintenance()

    Collect health metrics only:

    >>> metrics = await maintenance.collect_health_metrics()
    """

    def __init__(self) -> None:
        """Initialise the maintenance engine."""
        self._last_maintenance: Optional[datetime] = None
        self._maintenance_errors: List[str] = []

    def run_all_maintenance(self) -> DatabaseHealthMetrics:
        """Run all maintenance tasks and collect health metrics.

        This method executes the following tasks in order:

        1. VACUUM ANALYZE on all high-churn tables.
        2. Re-index the ltree GiST path index.
        3. Collect comprehensive health metrics.

        Returns
        -------
        DatabaseHealthMetrics
            Complete health metrics after maintenance.

        Raises
        ------
        Exception
            If a critical maintenance task fails, the error is logged
            and included in the metrics, but the method continues.
        """
        logger.info("Starting database maintenance run...")
        self._maintenance_errors.clear()

        try:
            self._vacuum_analyze_tables()
        except Exception as e:
            error_msg = f"VACUUM ANALYZE failed: {e}"
            logger.error(error_msg)
            self._maintenance_errors.append(error_msg)

        try:
            self._reindex_ltree_gist()
        except Exception as e:
            error_msg = f"Re-index failed: {e}"
            logger.error(error_msg)
            self._maintenance_errors.append(error_msg)

        self._last_maintenance = datetime.now(timezone.utc)

        # Collect health metrics
        metrics = self.collect_health_metrics()
        metrics.last_maintenance = self._last_maintenance
        metrics.maintenance_errors = self._maintenance_errors

        logger.info(
            "Database maintenance completed. Errors: %d",
            len(self._maintenance_errors),
        )
        return metrics

    def _vacuum_analyze_tables(self) -> None:
        """Run VACUUM ANALYZE on all high-churn tables.

        VACUUM reclaims dead tuple space and updates table statistics
        for the query planner. ANALYZE collects statistics about the
        contents of tables for the query optimiser.

        This operation is run on each table individually to avoid
        locking the entire database.
        """
        session = SessionLocal()
        try:
            for table in HIGH_CHURN_TABLES:
                try:
                    logger.info("VACUUM ANALYZE on %s...", table)
                    session.execute(text(f"VACUUM ANALYZE {table}"))
                    session.commit()
                    logger.info("VACUUM ANALYZE on %s completed.", table)
                except Exception as e:
                    logger.warning("VACUUM ANALYZE on %s failed: %s", table, e)
                    # Continue with other tables
        finally:
            session.close()

    def _reindex_ltree_gist(self) -> None:
        """Re-index the ltree GiST path index.

        The ltree GiST index (``ix_ubn_path_gist``) is critical for
        containment queries (``@>``) and ancestor/descendant lookups
        (``<@``). Over time, the index can become bloated due to
        frequent INSERT/UPDATE operations on the path column.

        This method uses ``REINDEX CONCURRENTLY`` to rebuild the index
        without locking the table for writes.
        """
        session = SessionLocal()
        try:
            try:
                logger.info("Re-indexing ltree GiST index...")
                # CONCURRENTLY avoids locking the table
                session.execute(
                    text("REINDEX INDEX CONCURRENTLY ix_ubn_path_gist")
                )
                session.commit()
                logger.info("Re-indexing ltree GiST index completed.")
            except Exception as e:
                logger.warning("Re-index failed: %s", e)
                # Fallback to non-concurrent reindex if CONCURRENTLY fails
                try:
                    logger.info("Falling back to non-concurrent re-index...")
                    session.execute(
                        text("REINDEX INDEX ix_ubn_path_gist")
                    )
                    session.commit()
                    logger.info("Non-concurrent re-index completed.")
                except Exception as fallback_e:
                    logger.error("Non-concurrent re-index also failed: %s", fallback_e)
                    raise
        finally:
            session.close()

    def collect_health_metrics(self) -> DatabaseHealthMetrics:
        """Collect comprehensive database health metrics.

        This method queries system catalogs and statistics views to
        gather information about:

        - Primary/standby status
        - Uptime and connection count
        - Replication lag for each standby
        - Table health (dead tuples, size, last vacuum)
        - Index health (scans, bloat estimate)
        - WAL archiving status

        Returns
        -------
        DatabaseHealthMetrics
            Complete health metrics snapshot.
        """
        metrics = DatabaseHealthMetrics()

        session = SessionLocal()
        try:
            try:
                metrics.is_primary = self._check_is_primary(session)
                metrics.uptime_seconds = self._get_uptime(session)
                (
                    metrics.total_connections,
                    metrics.max_connections,
                ) = self._get_connection_stats(session)
                metrics.replication_statuses = self._get_replication_status(
                    session
                )
                metrics.table_health = self._get_table_health(session)
                metrics.index_health = self._get_index_health(session)
                metrics.wal_archive_status = self._get_wal_archive_status(session)
            except Exception as e:
                logger.error("Failed to collect health metrics: %s", e)
                self._maintenance_errors.append(f"Health collection failed: {e}")
        finally:
            session.close()

        return metrics

    # -----------------------------------------------------------------------
    # Individual metric collectors
    # -----------------------------------------------------------------------

    def _check_is_primary(self, session: Session) -> bool:
        """Check if this node is the primary (read/write) node.

        Returns
        -------
        bool
            True if this is the primary node, False if it is a standby.
        """
        result = session.execute(
            text("SELECT NOT pg_is_in_recovery()")
        )
        return result.scalar()

    def _get_uptime(self, session: Session) -> float:
        """Get PostgreSQL instance uptime in seconds.

        Returns
        -------
        float
            Number of seconds since the instance started.
        """
        result = session.execute(
            text(
                "SELECT EXTRACT(EPOCH FROM NOW() - pg_postmaster_start_time())"
            )
        )
        return float(result.scalar() or 0.0)

    def _get_connection_stats(
        self, session: Session
    ) -> tuple[int, int]:
        """Get current and maximum connection counts.

        Returns
        -------
        tuple[int, int]
            (total_connections, max_connections)
        """
        # Current connections
        conn_result = session.execute(
            text("SELECT count(*) FROM pg_stat_activity")
        )
        total_connections = conn_result.scalar()

        # Max connections
        max_result = session.execute(
            text("SHOW max_connections")
        )
        max_connections = int(max_result.scalar() or 100)

        return total_connections, max_connections

    def _get_replication_status(
        self, session: Session
    ) -> List[ReplicationStatus]:
        """Get replication status for all connected standbys.

        Queries ``pg_stat_replication`` to measure the replication lag
        for each synchronous and asynchronous standby.

        Returns
        -------
        list of ReplicationStatus
            Replication status for each connected standby.
        """
        result = session.execute(
            text(
                """
                SELECT
                    usename AS standby_name,
                    state,
                    sent_lsn::text,
                    write_lsn::text,
                    flush_lsn::text,
                    replay_lsn::text,
                    write_lag,
                    flush_lag,
                    replay_lag,
                    pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes,
                    sync_priority > 0 AND sync_state = 'sync' AS is_synchronous
                FROM pg_stat_replication
                ORDER BY sync_priority DESC, usename
                """
            )
        )
        rows = result.fetchall()

        statuses = []
        for row in rows:
            status = ReplicationStatus(
                standby_name=row[0] or "unknown",
                state=row[1] or "unknown",
                sent_lsn=row[2] or "0/0",
                write_lsn=row[3] or "0/0",
                flush_lsn=row[4] or "0/0",
                replay_lsn=row[5] or "0/0",
                write_lag_seconds=float(row[6].total_seconds()) if row[6] else None,
                flush_lag_seconds=float(row[7].total_seconds()) if row[7] else None,
                replay_lag_seconds=float(row[8].total_seconds()) if row[8] else None,
                lag_bytes=int(row[9] or 0),
                is_synchronous=bool(row[10]),
            )
            statuses.append(status)

        return statuses

    def _get_table_health(self, session: Session) -> List[TableHealth]:
        """Get health metrics for high-churn tables.

        Returns
        -------
        list of TableHealth
            Health metrics for each high-churn table.
        """
        result = session.execute(
            text(
                """
                SELECT
                    relname AS table_name,
                    n_live_tup AS row_count,
                    n_dead_tup AS dead_tuple_count,
                    CASE WHEN n_live_tup > 0
                        THEN n_dead_tup::float / n_live_tup
                        ELSE 0.0
                    END AS dead_tuple_ratio,
                    pg_table_size(quote_ident(relname)::regclass) AS table_size_bytes,
                    pg_indexes_size(quote_ident(relname)::regclass) AS index_size_bytes,
                    last_vacuum,
                    last_autovacuum,
                    last_analyze,
                    last_autoanalyze
                FROM pg_stat_user_tables
                WHERE relname = ANY(:tables)
                ORDER BY relname
                """
            ),
            {"tables": HIGH_CHURN_TABLES},
        )
        rows = result.fetchall()

        health = []
        for row in rows:
            table = TableHealth(
                table_name=row[0],
                row_count=int(row[1] or 0),
                dead_tuple_count=int(row[2] or 0),
                dead_tuple_ratio=float(row[3] or 0.0),
                table_size_bytes=int(row[4] or 0),
                index_size_bytes=int(row[5] or 0),
                last_vacuum=row[6],
                last_autovacuum=row[7],
                last_analyze=row[8],
                last_autoanalyze=row[9],
            )
            health.append(table)

        return health

    def _get_index_health(self, session: Session) -> List[IndexHealth]:
        """Get health metrics for critical indexes.

        Returns
        -------
        list of IndexHealth
            Health metrics for each critical index.
        """
        result = session.execute(
            text(
                """
                SELECT
                    si.indexrelname AS index_name,
                    si.relname AS table_name,
                    pg_relation_size(si.indexrelid) AS index_size_bytes,
                    si.idx_scan AS index_scans,
                    st.n_seq_scan AS seq_scans,
                    CASE WHEN (si.idx_scan + st.n_seq_scan) > 0
                        THEN si.idx_scan::float / (si.idx_scan + st.n_seq_scan)
                        ELSE 0.0
                    END AS idx_scan_ratio,
                    st.last_vacuum,
                    st.last_analyze
                FROM pg_stat_user_indexes si
                LEFT JOIN pg_stat_user_tables st
                    ON si.relid = st.relid
                WHERE si.indexrelname = ANY(:indexes)
                ORDER BY si.indexrelname
                """
            ),
            {"indexes": CRITICAL_INDEXES},
        )
        rows = result.fetchall()

        health = []
        for row in rows:
            idx = IndexHealth(
                index_name=row[0],
                table_name=row[1],
                index_size_bytes=int(row[2] or 0),
                index_scans=int(row[3] or 0),
                seq_scans=int(row[4] or 0),
                idx_scan_ratio=float(row[5] or 0.0),
                last_vacuum=row[6],
                last_analyze=row[7],
            )
            health.append(idx)

        return health

    def _get_wal_archive_status(
        self, session: Session
    ) -> Dict[str, Any]:
        """Get WAL archiving status.

        Returns
        -------
        dict
            Dictionary containing WAL archiving configuration and status.
        """
        result = session.execute(
            text(
                """
                SELECT
                    name,
                    setting
                FROM pg_settings
                WHERE name IN (
                    'archive_mode',
                    'archive_command',
                    'archive_timeout',
                    'wal_level',
                    'max_wal_senders'
                )
                """
            )
        )
        rows = result.fetchall()

        status = {row[0]: row[1] for row in rows}

        # Add archive stats if available
        try:
            stats_result = session.execute(
                text(
                    """
                    SELECT
                        archived_count,
                        failed_count,
                        last_archived_wal,
                        last_archived_time
                    FROM pg_stat_archiver
                    """
                )
            )
            stats_row = stats_result.fetchone()
            if stats_row:
                status["archived_count"] = stats_row[0]
                status["failed_count"] = stats_row[1]
                status["last_archived_wal"] = stats_row[2]
                status["last_archived_time"] = str(stats_row[3])
        except Exception:
            # pg_stat_archiver may not be available on all versions
            pass

        return status


# ============================================================================
# Module-level convenience functions
# ============================================================================

# Singleton instance for use by the router
_maintenance_instance: Optional[DatabaseMaintenance] = None


def get_maintenance_engine() -> DatabaseMaintenance:
    """Get the singleton database maintenance engine.

    Returns
    -------
    DatabaseMaintenance
        The shared maintenance engine instance.
    """
    global _maintenance_instance
    if _maintenance_instance is None:
        _maintenance_instance = DatabaseMaintenance()
    return _maintenance_instance


def run_maintenance() -> DatabaseHealthMetrics:
    """Run all maintenance tasks and return health metrics.

    This is a convenience function that calls the singleton engine's
    ``run_all_maintenance`` method.

    Returns
    -------
    DatabaseHealthMetrics
        Complete health metrics after maintenance.
    """
    engine = get_maintenance_engine()
    return engine.run_all_maintenance()


def get_health_metrics() -> DatabaseHealthMetrics:
    """Collect health metrics without running maintenance.

    This is a convenience function that calls the singleton engine's
    ``collect_health_metrics`` method.

    Returns
    -------
    DatabaseHealthMetrics
        Current health metrics snapshot.
    """
    engine = get_maintenance_engine()
    return engine.collect_health_metrics()
