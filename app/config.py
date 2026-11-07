"""Application configuration loaded from environment variables.

This module provides a centralised configuration object that reads settings
from environment variables or a ``.env`` file.  This follows the
12-factor app methodology: configuration is separated from code.

Configuration Categories
~~~~~~~~~~~~~~~~~~~~~~~~

- **Application** — Name, debug mode, JWT secret key, token expiry.
- **Database** — PostgreSQL connection string.
- **CORS** — Allowed origins for cross-origin requests.

Environment Variables
~~~~~~~~~~~~~~~~~~~~~

All settings can be overridden via environment variables or a ``.env``
file in the project root.  Example ``.env`` file::

    APP_NAME=Eisenhower Portfolio Manager
    DEBUG=false
    SECRET_KEY=your-very-secret-key-here
    ACCESS_TOKEN_EXPIRE_MINUTES=1440
    DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/eisenhower
    ALLOWED_ORIGINS=http://localhost:3000

Security Warning
~~~~~~~~~~~~~~~~

The default ``SECRET_KEY`` is **not secure for production**.  Always
set a strong, random secret key in production environments.  Use
``python -c "import secrets; print(secrets.token_urlsafe(32))"`` to
generate one.

In production mode (``ENVIRONMENT=production``), the application will
refuse to start if ``SECRET_KEY`` is a known default value or contains
less than 256 bits of entropy (minimum 44 characters of base64-safe text).
"""
import math
import string

from pydantic_settings import BaseSettings, SettingsConfigDict


# Well-known default or weak secret keys that must never be used in production
DEFAULT_SECRET_KEYS = {
    "change-me-in-production",
    "change-me-in-production-use-secrets-token-urlsafe-32",
    "your-very-secret-key-here",
    "CHANGE_ME_GENERATE_RANDOM_SECRET",
    "secret",
    "changeme",
    "default",
    "placeholder",
    "replace-me",
    "your-secret-key-here",
    "",
}

# Minimum character length for a production SECRET_KEY (≈256 bits of entropy
# when drawn from a urlsafe base64 alphabet maps to ~44 characters)
MIN_SECRET_KEY_LENGTH = 44


def _estimate_secret_entropy(secret: str) -> float:
    """Estimate the Shannon entropy (in bits) of a secret string.

    Uses the size of the character pool actually present in the secret
    multiplied by the string length.  This is a conservative upper bound;
    real entropy may be lower if the secret is not uniformly random.
    """
    if not secret:
        return 0.0
    pool = set(secret)
    pool_size = len(pool)
    if pool_size <= 1:
        return 0.0
    return math.log2(pool_size) * len(secret)


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    This class reads configuration from environment variables or a
    ``.env`` file.  It provides type-safe access to all application
    settings with sensible defaults for development.

    In production mode (``ENVIRONMENT=production``), the constructor will
    raise a ``RuntimeError`` if ``SECRET_KEY`` is a known default value
    or contains less than 256 bits of estimated entropy.

    Attributes
    ----------
    APP_NAME : str
        Human-readable application name used in API documentation.
    DEBUG : bool
        Enable debug mode.  Should be ``False`` in production.
    SECRET_KEY : str
        Cryptographic secret key used for JWT token signing.
        **Must be changed from the default in production.**
    ACCESS_TOKEN_EXPIRE_MINUTES : int
        JWT token lifetime in minutes (default: 1440 = 24 hours).
    DATABASE_URL : str
        PostgreSQL connection string (e.g.,
        ``postgresql+psycopg2://user:pass@host:5432/dbname``).
    DATABASE_SSL_MODE : str
        SSL mode for the database connection: ``require``, ``verify-ca``,
        ``verify-full``, or ``disable``.  Defaults to ``disable`` for local
        development.  In production, use ``verify-ca`` or ``verify-full``.
    ALLOWED_ORIGINS : str
        Comma-separated list of allowed CORS origins, or ``*`` for
        all origins.
    TLS_ENABLED : bool
        Enable TLS/SSL for the application.  Defaults to ``True``.
    TLS_CERT_PATH : str
        Path to the TLS certificate file.
    TLS_KEY_PATH : str
        Path to the TLS private key file.
    TLS_CA_PATH : str
        Path to the CA certificate file for certificate verification.
    REDIS_URL : str
        Redis connection URL.
    REDIS_SSL : bool
        Enable SSL for Redis connections.
    S3_ENDPOINT_URL : str
        MinIO / S3 endpoint URL.
    S3_USE_SSL : bool
        Enable SSL for S3 connections.
    HSM_ENABLED : bool
        Enable HSM-based cryptographic signing for forensic audit ledger.
        Defaults to ``False`` (software Ed25519 signing in development).
    HSM_PKCS11_LIB_PATH : str
        Path to the PKCS#11 shared library (e.g., ``/usr/lib/libykcs11.so``
        for YubiHSM2, ``/usr/lib/softhsm2/libsofthsm2.so`` for SoftHSM2).
    HSM_SLOT_ID : int
        The PKCS#11 slot index containing the HSM token.
    HSM_TOKEN_LABEL : str
        Human-readable label of the HSM token to use.
    HSM_PIN : str
        PIN for authenticating to the HSM token.
    HSM_KEY_LABEL : str
        Label of the RSA-4096 or ECDSA P-384 private signing key on the token.
    DIODE_ENABLED : bool
        Enable the data diode directory polling daemon for air-gapped
        environments.  Defaults to ``False``.
    DIODE_DROP_DIR : str
        Path to the diode dropzone spool directory where incoming
        ``.defpack`` or ``.merklepack`` archives are placed.
    DIODE_QUARANTINE_DIR : str
        Path to the quarantine staging directory.  Files are moved here
        for verification before ingestion.
    DIODE_POLL_INTERVAL_SECONDS : float
        Interval between directory polls in seconds (default: 5.0).
    DIODE_PUBLIC_KEY_DIR : str
        Directory containing public signing keys for verifying bundle
        signatures from originating sovereign sites.
    DIODE_MAX_ARCHIVE_SIZE_MB : int
        Maximum allowed archive size in megabytes (default: 500).
    DIODE_ZIP_BOMB_RATIO : float
        Maximum allowed compression ratio for zip-bomb detection
        (default: 100.0).  Archives exceeding this ratio are rejected.
    """

    # Application
    APP_NAME: str = "Eisenhower Portfolio Manager"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # JWT
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 480

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/eisenhower"
    DATABASE_SSL_MODE: str = "disable"  # require, verify-ca, verify-full, disable

    # CORS
    ALLOWED_ORIGINS: str = "*"

    # Environment (controls dev-only features like mock fixtures)
    ENVIRONMENT: str = "development"

    # TLS / SSL
    TLS_ENABLED: bool = True
    TLS_CERT_PATH: str = "/etc/ssl/certs/eisenhower.crt"
    TLS_KEY_PATH: str = "/etc/ssl/private/eisenhower.key"
    TLS_CA_PATH: str = "/etc/ssl/certs/ca.crt"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"
    REDIS_SSL: bool = False

    # MinIO / S3
    S3_ENDPOINT_URL: str = "http://minio:9000"
    S3_BUCKET_NAME: str = "eisenhower-artifacts"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_USE_SSL: bool = False

    # HSM / PKCS#11 — Hardware Security Module for forensic audit signing
    HSM_ENABLED: bool = False
    HSM_PKCS11_LIB_PATH: str = "/usr/lib/softhsm2/libsofthsm2.so"
    HSM_SLOT_ID: int = 0
    HSM_TOKEN_LABEL: str = "ForensicAuditToken"
    HSM_PIN: str = "change-me-in-production"
    HSM_KEY_LABEL: str = "audit-signing-key"

    # Data Diode — air-gapped unidirectional polling daemon
    DIODE_ENABLED: bool = False
    DIODE_DROP_DIR: str = "/var/spool/eisenhower/diode_drop"
    DIODE_QUARANTINE_DIR: str = "/var/spool/eisenhower/quarantine"
    DIODE_POLL_INTERVAL_SECONDS: float = 5.0
    DIODE_PUBLIC_KEY_DIR: str = "/etc/eisenhower/keys/public"
    DIODE_MAX_ARCHIVE_SIZE_MB: int = 500
    DIODE_ZIP_BOMB_RATIO: float = 100.0

    model_config = SettingsConfigDict(env_file=".env")

    def __init__(self, **data):
        """Initialise settings and validate production secrets.

        In production mode, this performs strict validation of the
        ``SECRET_KEY`` to ensure it is not a known default and has
        sufficient entropy (≥256 bits, which maps to ≥44 characters
        for urlsafe base64 tokens).

        Raises
        ------
        RuntimeError
            If running in production and ``SECRET_KEY`` is a known
            default value or has insufficient entropy.
        """
        super().__init__(**data)
        self._validate_production_secrets()

    def _validate_production_secrets(self) -> None:
        """Validate that production cryptographic secrets meet security requirements.

        Checks
        ------
        - ``SECRET_KEY`` must not equal any known default placeholder.
        - ``SECRET_KEY`` must be at least ``MIN_SECRET_KEY_LENGTH`` characters
          (≈256 bits of entropy for urlsafe base64).
        - ``SECRET_KEY`` must have an estimated Shannon entropy of at least
          256 bits.

        Raises
        ------
        RuntimeError
            If any check fails in production mode.
        """
        if self.ENVIRONMENT.lower() != "production":
            return

        secret = self.SECRET_KEY

        # Check against known defaults
        if secret.lower() in {d.lower() for d in DEFAULT_SECRET_KEYS}:
            raise RuntimeError(
                "FATAL: SECRET_KEY is set to a known default value. "
                "In production, SECRET_KEY must be a cryptographically "
                "random token. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )

        # Check minimum length (44 chars ≈ 256 bits for urlsafe base64)
        if len(secret) < MIN_SECRET_KEY_LENGTH:
            raise RuntimeError(
                f"FATAL: SECRET_KEY is too short for production "
                f"(minimum {MIN_SECRET_KEY_LENGTH} characters, "
                f"got {len(secret)}). "
                "In production, SECRET_KEY must contain at least 256 bits "
                "of entropy. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )

        # Check estimated entropy
        entropy = _estimate_secret_entropy(secret)
        if entropy < 256:
            raise RuntimeError(
                f"FATAL: SECRET_KEY has insufficient entropy for production "
                f"(estimated {entropy:.0f} bits, minimum 256 bits). "
                "Use a longer, more random secret. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )


settings = Settings()
"""Singleton application settings instance.

This is the central configuration object used throughout the application.
It is initialised once at import time from environment variables or a
``.env`` file.  All modules should import this instance rather than
creating their own ``Settings()`` object.

Example
~~~~~~~

.. code-block:: python

    from app.config import settings

    print(settings.APP_NAME)  # "Eisenhower Portfolio Manager"
"""
