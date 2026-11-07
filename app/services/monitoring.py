"""Monitoring and Metrics Service.

Collects system metrics (CPU, memory, disk) and application metrics
(slow queries, error rates) for the monitoring dashboard.

Usage
~~~~~

    from app.services.monitoring import monitoring_service
    metrics = await monitoring_service.get_metrics()
"""

import os
import platform
from datetime import datetime
from typing import Any, Dict, List

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False


class MonitoringService:
    """Service for collecting system and application metrics."""

    async def get_cpu_usage(self) -> Dict[str, Any]:
        """Get CPU usage metrics.

        Returns:
            Dictionary with CPU percentage and core count.
        """
        if HAS_PSUTIL:
            percent = psutil.cpu_percent(interval=1)
            cores = psutil.cpu_count()
            return {"percent": percent, "cores": cores}
        return {"percent": 0, "cores": os.cpu_count() or 1}

    async def get_memory_usage(self) -> Dict[str, Any]:
        """Get memory usage metrics.

        Returns:
            Dictionary with total, used, available memory in bytes and percent.
        """
        if HAS_PSUTIL:
            mem = psutil.virtual_memory()
            return {
                "total": mem.total,
                "used": mem.used,
                "available": mem.available,
                "percent": mem.percent,
            }
        return {"total": 0, "used": 0, "available": 0, "percent": 0}

    async def get_disk_usage(self) -> Dict[str, Any]:
        """Get disk usage metrics.

        Returns:
            Dictionary with total, used, free disk space in bytes and percent.
        """
        if HAS_PSUTIL:
            disk = psutil.disk_usage("/")
            return {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": disk.percent,
            }
        # Fallback
        stat = os.statvfs("/")
        total = stat.f_frsize * stat.f_blocks
        free = stat.f_frsize * stat.f_bavail
        used = total - free
        return {
            "total": total,
            "used": used,
            "free": free,
            "percent": (used / total * 100) if total else 0,
        }

    async def get_slow_queries(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get slow database queries.

        In production, this would query pg_stat_statements.
        For now, returns placeholder data.

        Args:
            limit: Maximum number of slow queries to return.

        Returns:
            List of slow query dictionaries.
        """
        # Placeholder - in production, query pg_stat_statements
        return []

    async def get_error_rate(self) -> Dict[str, Any]:
        """Get HTTP error rate metrics.

        Returns:
            Dictionary with 4xx and 5xx error counts and rates.
        """
        # Placeholder - in production, track from middleware
        return {
            "4xx_count": 0,
            "5xx_count": 0,
            "total_requests": 0,
            "error_rate": 0.0,
        }

    async def get_metrics(self) -> Dict[str, Any]:
        """Get all metrics in a single call.

        Returns:
            Dictionary containing all metric categories.
        """
        cpu, memory, disk, slow_queries, error_rate = await asyncio.gather(
            self.get_cpu_usage(),
            self.get_memory_usage(),
            self.get_disk_usage(),
            self.get_slow_queries(),
            self.get_error_rate(),
        )

        return {
            "timestamp": datetime.now().isoformat(),
            "hostname": platform.node(),
            "cpu": cpu,
            "memory": memory,
            "disk": disk,
            "slow_queries": slow_queries,
            "error_rate": error_rate,
        }


import asyncio
monitoring_service = MonitoringService()
