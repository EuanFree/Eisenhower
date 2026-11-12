"""
Add font customization and work item defaults to user display settings.

This migration adds columns for font family, font size, and default values
for new work items (duration, delivery mode, scheduling mode).
"""

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # Font customization
    op.add_column('user_display_settings', sa.Column('font_family', sa.String(50), nullable=True))
    op.add_column('user_display_settings', sa.Column('font_size', sa.Integer(), nullable=True))
    
    # Work item defaults
    op.add_column('user_display_settings', sa.Column('default_duration_days', sa.Integer(), nullable=True))
    op.add_column('user_display_settings', sa.Column('default_delivery_mode', sa.String(20), nullable=True))
    op.add_column('user_display_settings', sa.Column('default_scheduling_mode', sa.String(10), nullable=True))
    
    # Set default values for existing users
    op.execute("""
        UPDATE user_display_settings 
        SET font_family = 'Inter', font_size = 16 
        WHERE font_family IS NULL OR font_size IS NULL
    """)


def downgrade() -> None:
    op.drop_column('user_display_settings', 'default_scheduling_mode')
    op.drop_column('user_display_settings', 'default_delivery_mode')
    op.drop_column('user_display_settings', 'default_duration_days')
    op.drop_column('user_display_settings', 'font_size')
    op.drop_column('user_display_settings', 'font_family')
