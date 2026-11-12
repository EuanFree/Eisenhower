"""Migration: Add baseline_effort_days and agile_actual_effort_days columns.

These columns support hybrid delivery tracking where a Waterfall task
becomes the parent of Agile subtasks.  The baseline preserves the original
estimate while the agile actual sums the child durations.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import SessionLocal


def migrate():
    """Run the ALTER TABLE migrations."""
    db = SessionLocal()
    try:
        with db.begin():
            db.execute(text(
                "ALTER TABLE portfolio_nodes ADD COLUMN IF NOT EXISTS baseline_effort_days DOUBLE PRECISION"
            ))
            print("✓ Added baseline_effort_days column")

            db.execute(text(
                "ALTER TABLE portfolio_nodes ADD COLUMN IF NOT EXISTS agile_actual_effort_days DOUBLE PRECISION"
            ))
            print("✓ Added agile_actual_effort_days column")

        print("Migration completed successfully.")
    except Exception as e:
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
