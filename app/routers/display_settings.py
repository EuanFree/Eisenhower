"""Display settings router for server-side profile persistence.

In SCIF environments, cookies and browser storage are prohibited.
Display preferences are persisted in PostgreSQL and hydrated on login.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User, UserDisplaySettings
from app.schemas.schemas import DisplaySettingsUpdate, DisplaySettingsResponse
from app.utils.auth import get_current_user

router = APIRouter(prefix="/users/me/display-settings", tags=["Display Settings"])


@router.get("", response_model=DisplaySettingsResponse)
def get_display_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve the active display profile for the current user.

    If no profile exists yet, creates a default one on the fly so the
    frontend always receives a valid settings object on login.
    """
    settings = db.query(UserDisplaySettings).filter(
        UserDisplaySettings.user_id == current_user.id
    ).first()

    if settings is None:
        # Auto-create a default profile on first access
        settings = UserDisplaySettings(user_id=current_user.id)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


@router.put("", response_model=DisplaySettingsResponse)
def update_display_settings(
    update_data: DisplaySettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upsert the current user's active display profile.

    If a profile already exists, merges the provided fields into it.
    If no profile exists, creates a new one with the supplied values.
    """
    settings = db.query(UserDisplaySettings).filter(
        UserDisplaySettings.user_id == current_user.id
    ).first()

    # Build a dict of the fields the client actually sent (exclude None)
    update_dict = update_data.model_dump(exclude_none=True)

    if settings is None:
        # Create a new profile, filling unsent fields with model defaults
        settings = UserDisplaySettings(
            user_id=current_user.id,
            **update_dict,
        )
        db.add(settings)
    else:
        # Merge partial update into the existing profile
        for field, value in update_dict.items():
            setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return settings
