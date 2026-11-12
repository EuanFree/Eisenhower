"""Add lag_days column to portfolio_nodes table.

Usage:
    python scripts/migrate_lag_days.py

This script adds the lag_days column to the portfolio_nodes table.
It is idempotent — safe to run multiple times.
"""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine, text
from app.config import settings

def main():
    engine = create_engine(str(settings.DATABASE_URL))
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'portfolio_nodes' AND column_name = 'lag_days'
        """))
        if result.fetchone():
            print("lag_days column already exists, skipping.")
            return

        print("Adding lag_days column to portfolio_nodes...")
        conn.execute(text("""
            ALTER TABLE portfolio_nodes
            ADD COLUMN lag_days INTEGER DEFAULT 0
        """))
        conn.commit()
        print("Migration complete: lag_days column added.")

if __name__ == '__main__':
    main()
