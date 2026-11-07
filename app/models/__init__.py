"""Database models package.

Contains all SQLAlchemy ORM models that define the database schema:
the unified tree structure (UBN), secondary entities, the forensic
audit engine, display-related models (Gantt view presets), and
check-out lease models for exclusive sub-tree reservations.
"""

# Import all model modules so SQLAlchemy Base.metadata registers all tables.
# The order matters: models.py must be imported first because display.py
# and leases.py reference PortfolioNode and User from models.py.
from app.models import models  # noqa: F401
from app.models import display  # noqa: F401
from app.models import custom_fields  # noqa: F401
from app.models import leases  # noqa: F401
from app.models import agent_staging  # noqa: F401