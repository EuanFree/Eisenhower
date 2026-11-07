"""Application Log Management Service.

Provides access to application logs, nginx access logs, and log level
configuration. Designed for SCIF environments where logs must be
viewable through the application UI rather than shell access.

Key Features
~~~~~~~~~~~~

- **Application log reading** from Python logging handlers.
- **Nginx access log parsing** for HTTP request tracking.
- **Log level configuration** at runtime without restart.
- **Log export** in multiple formats (JSON, CSV, plain text).
- **Search and filtering** by level, time range, and keyword.

Usage
~~~~~

    from app.services.log_management import log_management_service
    logs = await log_management_service.get_logs(level="ERROR", limit=100)
"""

import asyncio
import csv
import io
import json
import re
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings


class LogEntry:
    """A single log entry."""

    def __init__(
        self,
        timestamp: str,
        level: str,
        message: str,
        source: str = "app",
        extra: Optional[Dict[str, Any]] = None,
    ):
        """Initialize a single log entry record.

        Represents one line from the application or nginx access log, parsed
        into structured fields. The ``extra`` dictionary holds any additional
        context (e.g., request ID, user ID, correlation ID) that was attached
        to the log line.

        Args
        ----
        timestamp : str
            ISO-8601 timestamp when the log entry was created.
        level : str
            Log severity level: ``DEBUG``, ``INFO``, ``WARNING``, ``ERROR``, or ``CRITICAL``.
        message : str
            The human-readable log message text.
        source : str, optional
            Origin of the log entry: ``"app"`` for Python application logs,
            ``"nginx"`` for nginx access logs (default ``"app"``).
        extra : Dict[str, Any], optional
            Additional key-value pairs attached to the log entry (default ``None``).
        """
        self.timestamp = timestamp
        self.level = level
        self.message = message
        self.source = source
        self.extra = extra or {}

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the log entry to a dictionary.

        Returns
        -------
        Dict[str, Any]
            A dictionary containing all log entry fields plus any extra
            key-value pairs merged at the top level, suitable for JSON
            serialization or API response.
        """
        return {
            "timestamp": self.timestamp,
            "level": self.level,
            "message": self.message,
            "source": self.source,
            **self.extra,
        }


class LogManagementService:
    """Service for managing application logs.

    Provides log reading, filtering, export, and runtime log level
    configuration.
    """

    # Nginx access log pattern
    NGINX_PATTERN = re.compile(
        r'(?P<ip>\S+) - - \[(?P<time>[^\]]+)\] '
        r'"(?P<method>\S+) (?P<path>\S+) (?P<protocol>[^"]+)" '
        r'(?P<status>\d+) (?P<size>\d+) '
        r'"(?P<referer>[^"]*)" "(?P<user_agent>[^"]*)"'
    )

    def __init__(self):
        """Initialize the log management service.

        Creates the log directory if it does not exist and sets references
        to the application log and nginx access log file paths.

        Side Effects
        ~~~~~~~~~~~~

        * Creates ``deploy/logs/`` directory with ``exist_ok=True``.
        """
        self.log_dir = Path("deploy/logs")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.app_log = self.log_dir / "app.log"
        self.access_log = self.log_dir / "access.log"

    async def get_logs(
        self,
        level: Optional[str] = None,
        since: Optional[str] = None,
        limit: int = 100,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve application logs with optional filtering.

        Args:
            level: Filter by log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
            since: ISO timestamp to filter logs after this time.
            limit: Maximum number of log entries to return.
            search: Keyword to search for in log messages.

        Returns:
            List of log entry dictionaries, newest first.
        """
        if not self.app_log.exists():
            return []

        since_dt = None
        if since:
            since_dt = datetime.fromisoformat(since)

        entries = []
        with open(self.app_log, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                # Parse log line: "2026-10-25 16:00:00,123 INFO message"
                match = re.match(
                    r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+) (\w+) (.*)",
                    line,
                )
                if not match:
                    continue

                timestamp, log_level, message = match.groups()

                # Apply filters
                if level and log_level != level:
                    continue
                if since_dt and datetime.fromisoformat(timestamp) < since_dt:
                    continue
                if search and search.lower() not in message.lower():
                    continue

                entries.append(
                    LogEntry(
                        timestamp=timestamp,
                        level=log_level,
                        message=message,
                        source="app",
                    ).to_dict()
                )

        # Return newest first, limited
        entries.reverse()
        return entries[:limit]

    async def get_access_logs(
        self,
        limit: int = 100,
        status_code: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve nginx access logs.

        Args:
            limit: Maximum number of entries.
            status_code: Filter by HTTP status code.

        Returns:
            List of access log entry dictionaries.
        """
        if not self.access_log.exists():
            return []

        entries = []
        with open(self.access_log, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                match = self.NGINX_PATTERN.match(line.strip())
                if not match:
                    continue

                data = match.groupdict()
                if status_code and int(data["status"]) != status_code:
                    continue

                entries.append(
                    {
                        "timestamp": data["time"],
                        "ip": data["ip"],
                        "method": data["method"],
                        "path": data["path"],
                        "status": int(data["status"]),
                        "size": int(data["size"]),
                        "user_agent": data["user_agent"],
                        "source": "nginx",
                    }
                )

        entries.reverse()
        return entries[:limit]

    async def get_log_levels(self) -> Dict[str, str]:
        """Get current log levels for all loggers.

        Returns:
            Dictionary mapping logger names to their current level.
        """
        levels = {}
        for name, logger in logging.Logger.manager.loggerDict.items():
            if isinstance(logger, logging.Logger):
                level = logging.getLevelName(logger.level)
                levels[name] = level
        return levels

    async def set_log_level(self, logger_name: str, level: str):
        """Set the log level for a specific logger at runtime.

        Args:
            logger_name: Name of the logger (e.g., "uvicorn", "app").
            level: Log level string (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        """
        logger = logging.getLogger(logger_name)
        numeric_level = getattr(logging, level.upper(), logging.INFO)
        logger.setLevel(numeric_level)

    async def export_logs(
        self,
        format: str = "json",
        level: Optional[str] = None,
        limit: int = 1000,
    ) -> str:
        """Export logs in the specified format.

        Args:
            format: Export format ("json", "csv", or "text").
            level: Optional level filter.
            limit: Maximum entries to export.

        Returns:
            The exported log content as a string.
        """
        logs = await self.get_logs(level=level, limit=limit)

        if format == "json":
            return json.dumps(logs, indent=2)
        elif format == "csv":
            output = io.StringIO()
            if not logs:
                return ""
            writer = csv.DictWriter(output, fieldnames=logs[0].keys())
            writer.writeheader()
            writer.writerows(logs)
            return output.getvalue()
        else:
            lines = []
            for entry in logs:
                lines.append(
                    f"{entry['timestamp']} [{entry['level']}] {entry['message']}"
                )
            return "\n".join(lines)

    async def get_status(self) -> Dict[str, Any]:
        """Get log management status.

        Returns:
            Dictionary with log file sizes and entry counts.
        """
        app_size = self.app_log.stat().st_size if self.app_log.exists() else 0
        access_size = self.access_log.stat().st_size if self.access_log.exists() else 0

        return {
            "app_log_size_bytes": app_size,
            "access_log_size_bytes": access_size,
            "log_dir": str(self.log_dir),
        }


log_management_service = LogManagementService()
