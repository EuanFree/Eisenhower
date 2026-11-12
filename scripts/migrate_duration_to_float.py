"""Migration: Alter duration_days and lag_days from INTEGER to DOUBLE PRECISION.

This migration changes the data type of `duration_days` and `lag_days` in the
`portfolio_nodes` table from INTEGER to DOUBLE PRECISION (Float) to support
partial-day durations (e.g., 0.25 for a 2-hour task, 0.0625 for 15 minutes).

Existing integer values are preserved during the ALTER COLUMN operation.
"""
import sys
import os

# Add the project root to the Python path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import SessionLocal


def migrate():
    """Run the ALTER COLUMN migrations."""
    db = SessionLocal()
    try:
        with db.begin():
            # Change duration_days from INTEGER to DOUBLE PRECISION
            db.execute(text(
                "ALTER TABLE portfolio_nodes ALTER COLUMN duration_days TYPE DOUBLE PRECISION USING duration_days::DOUBLE PRECISION"
            ))
            print("✓ Altered duration_days to DOUBLE PRECISION")

            # Change lag_days from INTEGER to DOUBLE PRECISION
            db.execute(text(
                "ALTER TABLE portfolio_nodes ALTER COLUMN lag_days TYPE DOUBLE PRECISION USING lag_days::DOUBLE PRECISION"
            ))
            print("✓ Altered lag_days to DOUBLE PRECISION")

            # Update the default for lag_days from 0 to 0.0
            db.execute(text(
                "ALTER TABLE portfolio_nodes ALTER COLUMN lag_days SET DEFAULT 0.0"
            ))
            print("✓ Updated lag_days default to 0.0")

        print("Migration completed successfully.")
    except Exception as e:
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
