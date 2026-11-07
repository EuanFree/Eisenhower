"""Database Backup Router.

API endpoints for database backup management.

Endpoints
~~~~~~~~~

- GET    /backups              - List all backups
- GET    /backups/status       - Get backup status
- POST   /backups              - Create a new backup
- GET    /backups/{id}         - Get backup details
- DELETE /backups/{id}         - Delete a backup
- POST   /backups/{id}/verify  - Verify backup integrity
- POST   /backups/{id}/restore - Restore from backup
"""

from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List

from app.services.db_backup import db_backup_service

router = APIRouter(tags=["Backup Manager"])


@router.get("/status")
async def get_backup_status() -> Dict[str, Any]:
    """Get the current backup status."""
    return await db_backup_service.get_status()


@router.get("/")
async def list_backups() -> List[Dict[str, Any]]:
    """List all backups."""
    return await db_backup_service.list_backups()


@router.post("/", status_code=201)
async def create_backup(
    backup_type: str = "full",
    encrypt: bool = True,
) -> Dict[str, Any]:
    """Create a new database backup."""
    result = await db_backup_service.create_backup(backup_type=backup_type, encrypt=encrypt)
    if not result:
        raise HTTPException(status_code=500, detail="Backup failed")
    return result.to_dict()


@router.get("/{backup_id}")
async def get_backup(backup_id: str) -> Dict[str, Any]:
    """Get metadata for a specific backup."""
    result = await db_backup_service.get_backup(backup_id)
    if not result:
        raise HTTPException(status_code=404, detail="Backup not found")
    return result


@router.delete("/{backup_id}")
async def delete_backup(backup_id: str) -> Dict[str, Any]:
    """Delete a backup."""
    deleted = await db_backup_service.delete_backup(backup_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Backup not found")
    return {"deleted": True}


@router.post("/{backup_id}/verify")
async def verify_backup(backup_id: str) -> Dict[str, Any]:
    """Verify a backup's integrity."""
    return await db_backup_service.verify_backup(backup_id)


@router.post("/{backup_id}/restore")
async def restore_backup(backup_id: str, target_db: str = None) -> Dict[str, Any]:
    """Restore a database from a backup."""
    return await db_backup_service.restore_backup(backup_id, target_db)
