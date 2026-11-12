"""Quick migration to add display settings columns."""
import sys
sys.path.insert(0, '/app')

from app.database import SessionLocal
import sqlalchemy as sa

db = SessionLocal()
try:
    # Add columns if they don't exist
    cols = [
        ("font_family", "VARCHAR(50)"),
        ("font_size", "INTEGER"),
        ("default_duration_days", "INTEGER"),
        ("default_delivery_mode", "VARCHAR(20)"),
        ("default_scheduling_mode", "VARCHAR(10)"),
    ]
    for col_name, col_type in cols:
        try:
            db.execute(sa.text(f"ALTER TABLE user_display_settings ADD COLUMN {col_name} {col_type}"))
            db.commit()
            print(f"Added column: {col_name}")
        except Exception as e:
            db.rollback()
            if "already exists" in str(e).lower():
                print(f"Column already exists: {col_name}")
            else:
                raise
    
    # Set defaults for existing rows
    try:
        db.execute(sa.text("""
            UPDATE user_display_settings 
            SET font_family = 'Inter', font_size = 16
            WHERE font_family IS NULL OR font_size IS NULL
        """))
        db.commit()
        print("Defaults set successfully")
    except Exception as e:
        db.rollback()
        print(f"Warning setting defaults: {e}")
except Exception as e:
    print(f"Error: {e}")
    db.rollback()
finally:
    db.close()
