"""Database connection and session management.

This module establishes the connection to the PostgreSQL database and
provides the SQLAlchemy engine, session factory, and declarative base
used by all ORM models.

Connection Configuration
~~~~~~~~~~~~~~~~~~~~~~~~

- **pool_pre_ping=True** — Tests connections before use to detect stale
  connections (e.g., after a database restart) and automatically replace
  them.
- **pool_recycle=300** — Recycles connections after 5 minutes to prevent
  issues with long-lived connections that may be dropped by the database
  server or network infrastructure.
- **SSL/TLS** — Database connections are encrypted using SSL.  The SSL
  mode is configurable via ``DATABASE_SSL_MODE`` (default: ``require``).
  In production, use ``verify-ca`` or ``verify-full`` for certificate
  validation to prevent man-in-the-middle attacks.

Security
~~~~~~~~

All database connections are encrypted in transit.  The SSL mode can be
set to:

- ``require`` — Encrypt the connection (default).  Does not validate the
  server certificate.  Protects against eavesdropping but not MITM.
- ``verify-ca`` — Encrypt and validate the server certificate against a
  trusted CA.  Protects against eavesdropping and MITM.
- ``verify-full`` — Encrypt, validate the certificate, and verify the
  server hostname matches the certificate.  Highest security.

Usage
~~~~~

The :func:`get_db` function is used as a FastAPI dependency.  Each request
receives a fresh database session that is automatically closed when the
request completes, even if an error occurs.

Example
~~~~~~~

.. code-block:: python

    @router.get("/items")
    def list_items(db: Session = Depends(get_db)):
        return db.query(Item).all()
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

# Build connection arguments based on database type
_connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
elif settings.DATABASE_SSL_MODE != "disable":
    _connect_args["sslmode"] = settings.DATABASE_SSL_MODE

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=_connect_args,
)
"""SQLAlchemy engine for the PostgreSQL database.

This engine manages the connection pool and is shared across the
application.  It is configured with connection health checking
(pool_pre_ping), automatic recycling (pool_recycle=300), and
SSL/TLS encryption (sslmode from settings).
"""

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
"""Factory for creating database sessions.

Each call to ``SessionLocal()`` creates a new session bound to the
engine's connection pool.  Sessions are not thread-safe and should
be used for a single request or operation.
"""

Base = declarative_base()
"""SQLAlchemy declarative base for all ORM models.

All database models inherit from this base class, which provides
the ``__tablename__`` and ``__table__`` attributes required by
SQLAlchemy's ORM.
"""


def get_db():
    """FastAPI dependency that provides a database session.

    Creates a new database session for each request and ensures it is
    properly closed when the request completes, even if an error occurs.

    Yields
    ------
    Session
        A SQLAlchemy database session bound to the connection pool.

    Example
    ~~~~~~~

    .. code-block:: python

        @router.get("/items")
        def list_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
