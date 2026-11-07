"""Log Rotation Service.

Manages log file rotation, compression, and retention policies.
Prevents log files from growing indefinitely.

Security
~~~~~~~~

All file paths derived from configuration or user input are resolved
through :func:`app.core.path_security.safe_resolve_path` to prevent
directory traversal attacks.  The log directory and config directory
are treated as trusted base directories.

Usage
~~~~~

    from app.services.log_rotation import log_rotation_service
    config = await log_rotation_service.get_rotation_config()
"""

import json
import gzip
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from app.core.path_security import safe_resolve_path, PathTraversalAttackException

# Base directories for log and config files
LOG_BASE_DIR = Path("deploy/logs")
CONFIG_BASE_DIR = Path("app/config")
CONFIG_FILE = CONFIG_BASE_DIR / "log_rotation.json"

DEFAULT_CONFIG = {
    "max_size_mb": 100,
    "max_files": 10,
    "compress": True,
    "rotate_on_startup": False,
}


class LogRotationService:
    """Service for managing log rotation."""

    def __init__(self):
        """Initialize the log rotation service with default configuration.

        Creates the configuration directory and writes a default rotation
        config file if one does not already exist. The default config sets
        a 100 MB max log size, retains 10 rotated files, enables gzip
        compression, and disables rotation on startup.

        Side Effects
        ~~~~~~~~~~~~

        * Creates ``app/config/`` directory with ``exist_ok=True``.
        * Writes ``app/config/log_rotation.json`` with default settings if
          the file does not exist.
        """
        CONFIG_BASE_DIR.mkdir(parents=True, exist_ok=True)
        safe_config_path = safe_resolve_path(CONFIG_BASE_DIR, "log_rotation.json")
        if not safe_config_path.exists():
            with open(safe_config_path, "w") as f:
                json.dump(DEFAULT_CONFIG, f, indent=2)

    def _load_config(self) -> Dict[str, Any]:
        safe_config_path = safe_resolve_path(CONFIG_BASE_DIR, "log_rotation.json")
        with open(safe_config_path, "r") as f:
            return json.load(f)

    def _save_config(self, config: Dict[str, Any]):
        safe_config_path = safe_resolve_path(CONFIG_BASE_DIR, "log_rotation.json")
        with open(safe_config_path, "w") as f:
            json.dump(config, f, indent=2)

    async def get_rotation_config(self) -> Dict[str, Any]:
        """Get the current log rotation configuration.

        Returns:
            Dictionary with rotation settings.
        """
        return self._load_config()

    async def update_rotation_config(self, config: Dict[str, Any]):
        """Update log rotation configuration.

        Args:
            config: Dictionary of config settings to update.
        """
        current = self._load_config()
        current.update(config)
        self._save_config(current)

    async def rotate_logs(self) -> Dict[str, Any]:
        """Manually trigger log rotation.

        Returns:
            Dictionary with rotation results.
        """
        LOG_BASE_DIR.mkdir(parents=True, exist_ok=True)
        rotated = []

        for log_file in LOG_BASE_DIR.glob("*.log"):
            size_mb = log_file.stat().st_size / (1024 * 1024)
            config = self._load_config()

            if size_mb > config.get("max_size_mb", 100):
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                rotated_name = f"{log_file.stem}-{timestamp}.log"
                rotated_path = safe_resolve_path(LOG_BASE_DIR, rotated_name)

                shutil.move(str(log_file), str(rotated_path))

                if config.get("compress", True):
                    gz_name = f"{rotated_name}.gz"
                    gz_path = safe_resolve_path(LOG_BASE_DIR, gz_name)
                    with open(rotated_path, "rb") as f_in:
                        with gzip.open(gz_path, "wb") as f_out:
                            shutil.copyfileobj(f_in, f_out)
                    rotated_path.unlink()
                    rotated.append(str(gz_path))
                else:
                    rotated.append(str(rotated_path))

        # Clean up old rotated logs
        await self._cleanup_old_logs()

        return {"rotated_files": rotated, "count": len(rotated)}

    async def _cleanup_old_logs(self):
        """Remove rotated logs beyond the retention count."""
        config = self._load_config()
        max_files = config.get("max_files", 10)

        rotated = sorted(LOG_BASE_DIR.glob("*.log.gz"), key=lambda p: p.stat().st_mtime)
        while len(rotated) > max_files:
            oldest = rotated.pop(0)
            oldest.unlink()

    async def list_rotated_logs(self) -> List[Dict[str, Any]]:
        """List all rotated log files.

        Returns:
            List of rotated log file metadata.
        """
        files = []

        for log_file in sorted(LOG_BASE_DIR.glob("*.log.gz"), key=lambda p: p.stat().st_mtime, reverse=True):
            files.append({
                "filename": log_file.name,
                "size_bytes": log_file.stat().st_size,
                "modified": datetime.fromtimestamp(log_file.stat().st_mtime).isoformat(),
            })

        return files


log_rotation_service = LogRotationService()
