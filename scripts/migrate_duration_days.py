"""Migration: Add duration_days column to portfolio_nodes table.

Duration was previously stored in custom_attributes.duration_days as a
JSONB field.  This migration promotes it to a first-class INTEGER column
on the portfolio_nodes table so every work item has a proper duration
attribute, just like planned_start_date and planned_end_date.

The migration also back-fills existing values from custom_attributes so
no data is lost.
"""
import sys
import os

# Add project root to path so we can import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine, text
from app.config import settings

def migrate():
    engine = create_engine(str(settings.DATABASE_URL), echo=True)
    with engine.connect() as conn:
        # 1. Add the column if it doesn't exist
        try:
            conn.execute(text("""
                ALTER TABLE portfolio_nodes
                ADD COLUMN duration_days INTEGER
            """))
            print("✓ Added duration_days column to portfolio_nodes")
        except Exception as e:
            if 'already exists' in str(e).lower():
                print("ℹ duration_days column already exists — skipping")
            else:
                raise

        # 2. Back-fill from custom_attributes.duration_days
        result = conn.execute(text("""
            UPDATE portfolio_nodes
            SET duration_days = (custom_attributes->>'duration_days')::INTEGER
            WHERE custom_attributes->>'duration_days' IS NOT NULL
              AND duration_days IS NULL
        """))
        updated = result.rowcount
        print(f"✓ Back-filled {updated} rows from custom_attributes.duration_days")

        conn.commit()

    print("Migration complete.")

if __name__ == '__main__':
    migrate()
