"""System Configuration Service.

Provides runtime configuration management, feature flags, and maintenance
mode control. Changes are persisted to a JSON file and take effect
immediately without requiring a server restart.

Usage
~~~~~

    from app.services.system_config import system_config_service
    config = await system_config_service.get_config()
    await system_config_service.update_config("APP_NAME", "New Name")
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

CONFIG_FILE = Path("app/config/system_config.json")

DEFAULT_CONFIG = {
    "APP_NAME": "Eisenhower Portfolio Manager",
    "MAINTENANCE_MODE": False,
    "MAINTENANCE_MESSAGE": "System under maintenance",
    "FEATURE_FLAGS": {
        "costing_module": True,
        "procurement_module": True,
        "monte_carlo": True,
        "supplier_portal": True,
    },
    "SESSION_TIMEOUT_MINUTES": 30,
    "MAX_LOGIN_ATTEMPTS": 5,
    "LOCKOUT_DURATION_MINUTES": 15,
}


class SystemConfigService:
    """Service for managing runtime system configuration."""

    def __init__(self):
        """Initialize the system configuration service with default settings.

        Creates the configuration directory and writes a default system config
        file if one does not already exist. The default config includes the
        application name, maintenance mode disabled, feature flags for all
        modules enabled, a 30-minute session timeout, 5 max login attempts,
        and a 15-minute lockout duration.

        Side Effects
        ~~~~~~~~~~~~

        * Creates ``app/config/`` directory with ``exist_ok=True``.
        * Writes ``app/config/system_config.json`` with default settings if
          the file does not exist.
        """
        self.config_file = CONFIG_FILE
        self.config_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.config_file.exists():
            self._save_config(DEFAULT_CONFIG)

    def _load_config(self) -> Dict[str, Any]:
        """Load the system configuration from disk.

        Returns
        -------
        Dict[str, Any]
            A dictionary containing all configuration keys and their current
            values, including feature flags, maintenance mode, and session
            settings.
        """
        with open(self.config_file, "r") as f:
            return json.load(f)

    def _save_config(self, config: Dict[str, Any]):
        """Persist the system configuration to disk.

        Args
        ----
        config : Dict[str, Any]
            The complete configuration dictionary to write to disk.
        """
        with open(self.config_file, "w") as f:
            json.dump(config, f, indent=2)

    async def get_config(self) -> Dict[str, Any]:
        """Get the current system configuration.

        Returns:
            Dictionary containing all configuration keys and values.
        """
        return self._load_config()

    async def update_config(self, key: str, value: Any):
        """Update a single configuration value.

        Args:
            key: Configuration key to update.
            value: New value for the configuration key.
        """
        config = self._load_config()
        config[key] = value
        self._save_config(config)

    async def get_feature_flags(self) -> Dict[str, bool]:
        """Get all feature flags.

        Returns:
            Dictionary mapping feature flag names to their enabled status.
        """
        config = self._load_config()
        return config.get("FEATURE_FLAGS", {})

    async def toggle_feature_flag(self, key: str, enabled: bool):
        """Toggle a feature flag on or off.

        Args:
            key: Feature flag name.
            enabled: Whether to enable or disable the flag.
        """
        config = self._load_config()
        if "FEATURE_FLAGS" not in config:
            config["FEATURE_FLAGS"] = {}
        config["FEATURE_FLAGS"][key] = enabled
        self._save_config(config)

    async def get_maintenance_mode(self) -> Dict[str, Any]:
        """Get the current maintenance mode status.

        Returns:
            Dictionary with 'enabled' boolean and 'message' string.
        """
        config = self._load_config()
        return {
            "enabled": config.get("MAINTENANCE_MODE", False),
            "message": config.get("MAINTENANCE_MESSAGE", ""),
        }

    async def set_maintenance_mode(self, enabled: bool, message: Optional[str] = None):
        """Enable or disable maintenance mode.

        Args:
            enabled: Whether to enable maintenance mode.
            message: Optional custom maintenance message.
        """
        config = self._load_config()
        config["MAINTENANCE_MODE"] = enabled
        if message is not None:
            config["MAINTENANCE_MESSAGE"] = message
        self._save_config(config)


system_config_service = SystemConfigService()
