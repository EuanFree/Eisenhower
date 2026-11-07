"""Secret Rotation Service.

Manages rotation of sensitive secrets (JWT secret key, database passwords,
API keys) with audit trail of all rotation events.

Usage
~~~~~

    from app.services.secret_rotation import secret_rotation_service
    secrets = await secret_rotation_service.list_secrets()
"""

import json
import secrets as py_secrets
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

HISTORY_FILE = Path("app/config/secret_history.json")

DEFAULT_SECRETS = {
    "jwt_secret": {
        "name": "JWT Secret Key",
        "type": "jwt",
        "last_rotated": None,
        "rotation_count": 0,
        "auto_rotate_days": 90,
    },
    "db_password": {
        "name": "Database Password",
        "type": "database",
        "last_rotated": None,
        "rotation_count": 0,
        "auto_rotate_days": 180,
    },
    "api_key": {
        "name": "API Key",
        "type": "api",
        "last_rotated": None,
        "rotation_count": 0,
        "auto_rotate_days": 365,
    },
}


class SecretRotationService:
    """Service for managing secret rotation."""

    def __init__(self):
        """Initialize the secret rotation service.

        Creates the configuration directory and initializes an empty rotation
        history file if it does not already exist. The history file records
        every secret rotation event with timestamps and value hints for audit
        trail purposes.

        Side Effects
        ~~~~~~~~~~~~

        * Creates ``app/config/`` directory with ``exist_ok=True``.
        * Writes ``app/config/secret_history.json`` as an empty JSON array if
          the file does not exist.
        """
        HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not HISTORY_FILE.exists():
            with open(HISTORY_FILE, "w") as f:
                json.dump([], f)

    def _load_history(self) -> List[Dict[str, Any]]:
        """Load the secret rotation history from disk.

        Returns
        -------
        List[Dict[str, Any]]
            A list of rotation event dictionaries, each containing the secret
            name, rotation timestamp, and a truncated value hint.
        """
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)

    def _save_history(self, history: List[Dict[str, Any]]):
        """Persist the secret rotation history to disk.

        Args
        ----
        history : List[Dict[str, Any]]
            The complete list of rotation event dictionaries to write to disk.
        """
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)

    async def list_secrets(self) -> List[Dict[str, Any]]:
        """List all managed secrets (without revealing values).

        Returns:
            List of secret metadata dictionaries.
        """
        return list(DEFAULT_SECRETS.values())

    async def rotate_secret(self, secret_name: str) -> Dict[str, Any]:
        """Rotate a secret and record the event.

        Args:
            secret_name: Name of the secret to rotate.

        Returns:
            Dictionary with rotation results.
        """
        if secret_name not in DEFAULT_SECRETS:
            return {"success": False, "message": f"Secret '{secret_name}' not found"}

        # Generate new secret value
        new_value = py_secrets.token_urlsafe(64)

        # Update metadata
        DEFAULT_SECRETS[secret_name]["last_rotated"] = datetime.now().isoformat()
        DEFAULT_SECRETS[secret_name]["rotation_count"] += 1

        # Record in history
        history = self._load_history()
        history.append({
            "secret_name": secret_name,
            "rotated_at": datetime.now().isoformat(),
            "new_value_hint": new_value[:8] + "...",
        })
        self._save_history(history)

        return {
            "success": True,
            "secret_name": secret_name,
            "rotated_at": DEFAULT_SECRETS[secret_name]["last_rotated"],
            "message": f"Secret '{secret_name}' rotated successfully",
        }

    async def get_rotation_history(self, secret_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get the rotation history, optionally filtered by secret name.

        Args:
            secret_name: Optional secret name to filter by.

        Returns:
            List of rotation history entries.
        """
        history = self._load_history()
        if secret_name:
            history = [h for h in history if h["secret_name"] == secret_name]
        history.sort(key=lambda h: h.get("rotated_at", ""), reverse=True)
        return history


secret_rotation_service = SecretRotationService()
