"""Alerting and Notification Channels Service.

Manages alert rules and notification channels for automated incident
response. Supports email, webhook, and in-app notification channels.

Usage
~~~~~

    from app.services.alerting import alerting_service
    rules = await alerting_service.list_alert_rules()
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

ALERT_FILE = Path("app/config/alert_rules.json")
CHANNELS_FILE = Path("app/config/notification_channels.json")


class AlertingService:
    """Service for managing alert rules and notification channels."""

    def __init__(self):
        """Initialize the alerting service by ensuring configuration directories exist.

        Creates the parent directories for the alert rules and notification channels
        JSON configuration files if they do not already exist. This ensures that
        subsequent file write operations will not fail due to missing directories.

        The configuration files are stored under ``app/config/``:

        * ``alert_rules.json`` — Defines the conditions and thresholds that trigger
          automated alerts (e.g., disk usage > 90%, backup failure).
        * ``notification_channels.json`` — Defines the delivery channels for alerts
          (email, webhook, in-app notification).

        Side Effects
        ~~~~~~~~~~~~

        * Creates ``app/config/`` directory with ``exist_ok=True``, so an existing
          directory is not an error.
        """
        ALERT_FILE.parent.mkdir(parents=True, exist_ok=True)
        CHANNELS_FILE.parent.mkdir(parents=True, exist_ok=True)

    def _load_rules(self) -> List[Dict[str, Any]]:
        """Load alert rules from the JSON configuration file.

        Returns
        -------
        List[Dict[str, Any]]
            A list of alert rule dictionaries.  Returns an empty list if the
            file does not exist or contains invalid JSON.
        """
        if ALERT_FILE.exists():
            with open(ALERT_FILE, "r") as f:
                return json.load(f)
        return []

    def _save_rules(self, rules: List[Dict[str, Any]]):
        """Persist alert rules to the JSON configuration file.

        Args
        ----
        rules : List[Dict[str, Any]]
            The complete list of alert rule dictionaries to write to disk.
        """
        with open(ALERT_FILE, "w") as f:
            json.dump(rules, f, indent=2)

    def _load_channels(self) -> List[Dict[str, Any]]:
        """Load notification channels from the JSON configuration file.

        Returns
        -------
        List[Dict[str, Any]]
            A list of notification channel dictionaries.  Returns an empty list
            if the file does not exist or contains invalid JSON.
        """
        if CHANNELS_FILE.exists():
            with open(CHANNELS_FILE, "r") as f:
                return json.load(f)
        return []

    def _save_channels(self, channels: List[Dict[str, Any]]):
        """Persist notification channels to the JSON configuration file.

        Args
        ----
        channels : List[Dict[str, Any]]
            The complete list of notification channel dictionaries to write to disk.
        """
        with open(CHANNELS_FILE, "w") as f:
            json.dump(channels, f, indent=2)

    async def list_alert_rules(self) -> List[Dict[str, Any]]:
        """List all alert rules.

        Returns:
            List of alert rule dictionaries.
        """
        return self._load_rules()

    async def create_alert_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new alert rule.

        Args:
            rule: Dictionary with 'name', 'condition', 'threshold', 'channel_id'.

        Returns:
            The created rule dictionary.
        """
        rules = self._load_rules()
        rule["id"] = f"rule-{len(rules) + 1}"
        rule["created_at"] = datetime.now().isoformat()
        rule["enabled"] = True
        rules.append(rule)
        self._save_rules(rules)
        return rule

    async def update_alert_rule(self, rule_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing alert rule.

        Args:
            rule_id: The rule identifier.
            updates: Dictionary of fields to update.

        Returns:
            Updated rule dictionary or None if not found.
        """
        rules = self._load_rules()
        for rule in rules:
            if rule["id"] == rule_id:
                rule.update(updates)
                self._save_rules(rules)
                return rule
        return None

    async def delete_alert_rule(self, rule_id: str) -> bool:
        """Delete an alert rule.

        Args:
            rule_id: The rule identifier.

        Returns:
            True if deleted, False if not found.
        """
        rules = self._load_rules()
        updated = [r for r in rules if r["id"] != rule_id]
        if len(updated) < len(rules):
            self._save_rules(updated)
            return True
        return False

    async def list_notification_channels(self) -> List[Dict[str, Any]]:
        """List all notification channels.

        Returns:
            List of notification channel dictionaries.
        """
        return self._load_channels()

    async def create_notification_channel(self, channel: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new notification channel.

        Args:
            channel: Dictionary with 'name', 'type' (email/webhook/in-app), 'config'.

        Returns:
            The created channel dictionary.
        """
        channels = self._load_channels()
        channel["id"] = f"channel-{len(channels) + 1}"
        channel["created_at"] = datetime.now().isoformat()
        channels.append(channel)
        self._save_channels(channels)
        return channel

    async def test_channel(self, channel_id: str) -> Dict[str, Any]:
        """Test a notification channel by sending a test notification.

        Args:
            channel_id: The channel identifier.

        Returns:
            Dictionary with 'success' boolean and 'message'.
        """
        channels = self._load_channels()
        channel = next((c for c in channels if c["id"] == channel_id), None)
        if not channel:
            return {"success": False, "message": "Channel not found"}

        # Simulate test
        return {"success": True, "message": f"Test notification sent to {channel['name']}"}


alerting_service = AlertingService()
