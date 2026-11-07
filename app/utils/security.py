"""Security utilities for password hashing and JWT token management.

This module provides the cryptographic functions used for user
authentication:

- **Password hashing** — Using bcrypt via Passlib.  Passwords are
  never stored in plaintext; only the bcrypt hash is stored.
- **JWT token creation** — Creates signed JSON Web Tokens that encode
  the user's identity and an expiration time.
- **JWT token validation** — Verifies the token's signature and
  expiration, returning the decoded payload or ``None`` if invalid.

Why bcrypt?
~~~~~~~~~~~

bcrypt is a password hashing function designed to be slow, making
brute-force attacks computationally expensive.  It automatically
includes a salt, so identical passwords produce different hashes.

Why JWT?
~~~~~~~~

JSON Web Tokens (JWT) provide stateless authentication.  The server
signs a token with a secret key; the client stores and returns the
token with each request.  The server verifies the signature without
needing to query a session store.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from app.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its bcrypt hash.

    Parameters
    ----------
    plain_password : str
        The password entered by the user during login.
    hashed_password : str
        The bcrypt hash stored in the database.

    Returns
    -------
    bool
        ``True`` if the password matches, ``False`` otherwise.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, AttributeError):
        return False


def get_password_hash(password: str) -> str:
    """Hash a plain-text password using bcrypt.

    Parameters
    ----------
    password : str
        The plain-text password to hash.

    Returns
    -------
    str
        The bcrypt hash string, safe for storage in the database.
    """
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token.

    The token contains the provided payload data plus an expiration
    timestamp.  It is signed using HS256 with the application's
    secret key.

    Parameters
    ----------
    data : dict
        The payload to encode in the token (e.g., ``{"sub": "1"}``
        where "sub" is the user's ID).
    expires_delta : timedelta, optional
        How long the token should remain valid.  Defaults to the
        value configured in :data:`app.config.settings.ACCESS_TOKEN_EXPIRE_MINUTES`.

    Returns
    -------
    str
        The encoded JWT token string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token.

    Verifies the token's signature using the application's secret key
    and checks that the token has not expired.

    Parameters
    ----------
    token : str
        The JWT token string received from the client.

    Returns
    -------
    dict or None
        The decoded payload dictionary if the token is valid,
        or ``None`` if the token is invalid, expired, or tampered with.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        return None
