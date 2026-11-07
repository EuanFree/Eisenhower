"""Admin Tools Router — Combined endpoints for all admin capabilities.

This single router consolidates all admin tool endpoints to keep
the router count manageable while providing full API coverage.

Endpoints
~~~~~~~~~

- /admin/logs/*           - Log management
- /admin/config/*         - System configuration
- /admin/health/*         - Service health
- /admin/alerting/*       - Alerting and notifications
- /admin/monitoring/*     - Monitoring and metrics
- /admin/password/*       - Password policy and 2FA
- /admin/data/*           - Data export/import
- /admin/log-rotation/*   - Log rotation
- /admin/security-scan/*  - Security scans
- /admin/secrets/*        - Secret rotation
- /admin/maintenance/*    - Maintenance mode
- /admin/feature-flags/*  - Feature flags
- /admin/users/*          - User management
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Any, Dict, List, Optional

from app.services.log_management import log_management_service
from app.services.system_config import system_config_service
from app.services.service_health import service_health_service
from app.services.alerting import alerting_service
from app.services.monitoring import monitoring_service
from app.services.password_policy import password_policy_service
from app.services.data_export import data_export_service
from app.services.log_rotation import log_rotation_service
from app.services.security_scan import security_scan_service
from app.services.secret_rotation import secret_rotation_service
from app.database import get_db
from sqlalchemy import select
from app.models.models import User

router = APIRouter(prefix="/admin", tags=["Admin Tools"])


# ---------------------------------------------------------------------------
# Log Management
# ---------------------------------------------------------------------------

@router.get("/logs")
async def get_logs(
    level: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 100,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Retrieve application logs with filtering."""
    return await log_management_service.get_logs(level=level, since=since, limit=limit, search=search)


@router.get("/logs/access")
async def get_access_logs(
    limit: int = 100,
    status_code: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Retrieve nginx access logs."""
    return await log_management_service.get_access_logs(limit=limit, status_code=status_code)


@router.get("/logs/levels")
async def get_log_levels() -> Dict[str, str]:
    """Get current log levels."""
    return await log_management_service.get_log_levels()


@router.put("/logs/level")
async def set_log_level(logger_name: str, level: str):
    """Set log level at runtime."""
    await log_management_service.set_log_level(logger_name, level)
    return {"updated": True}


@router.get("/logs/export")
async def export_logs(
    format: str = "json",
    level: Optional[str] = None,
    limit: int = 1000,
) -> Dict[str, str]:
    """Export logs in specified format."""
    content = await log_management_service.export_logs(format=format, level=level, limit=limit)
    return {"content": content}


@router.get("/logs/status")
async def get_log_status() -> Dict[str, Any]:
    """Get log management status."""
    return await log_management_service.get_status()


# ---------------------------------------------------------------------------
# System Configuration
# ---------------------------------------------------------------------------

@router.get("/config")
async def get_config() -> Dict[str, Any]:
    """Get system configuration."""
    return await system_config_service.get_config()


@router.put("/config/{key}")
async def update_config(key: str, value: str):
    """Update a configuration value."""
    await system_config_service.update_config(key, value)
    return {"updated": True}


# ---------------------------------------------------------------------------
# Feature Flags
# ---------------------------------------------------------------------------

@router.get("/feature-flags")
async def get_feature_flags() -> Dict[str, bool]:
    """Get all feature flags."""
    return await system_config_service.get_feature_flags()


@router.put("/feature-flags/{key}")
async def toggle_feature_flag(key: str, enabled: bool = True):
    """Toggle a feature flag."""
    await system_config_service.toggle_feature_flag(key, enabled)
    return {"updated": True}


# ---------------------------------------------------------------------------
# Maintenance Mode
# ---------------------------------------------------------------------------

@router.get("/maintenance")
async def get_maintenance_mode() -> Dict[str, Any]:
    """Get maintenance mode status."""
    return await system_config_service.get_maintenance_mode()


@router.put("/maintenance")
async def set_maintenance_mode(enabled: bool, message: Optional[str] = None):
    """Enable or disable maintenance mode."""
    await system_config_service.set_maintenance_mode(enabled, message)
    return {"updated": True}


# ---------------------------------------------------------------------------
# Service Health
# ---------------------------------------------------------------------------

@router.get("/health")
async def get_service_health() -> Dict[str, Any]:
    """Check all backend services."""
    return await service_health_service.check_all_services()


@router.get("/health/summary")
async def get_service_status() -> Dict[str, Any]:
    """Get service health summary."""
    return await service_health_service.get_service_status()


# ---------------------------------------------------------------------------
# Alerting & Notifications
# ---------------------------------------------------------------------------

@router.get("/alerting/rules")
async def list_alert_rules() -> List[Dict[str, Any]]:
    """List all alert rules."""
    return await alerting_service.list_alert_rules()


@router.post("/alerting/rules", status_code=201)
async def create_alert_rule(rule: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new alert rule."""
    return await alerting_service.create_alert_rule(rule)


@router.put("/alerting/rules/{rule_id}")
async def update_alert_rule(rule_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update an alert rule."""
    result = await alerting_service.update_alert_rule(rule_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found")
    return result


@router.delete("/alerting/rules/{rule_id}")
async def delete_alert_rule(rule_id: str) -> Dict[str, Any]:
    """Delete an alert rule."""
    deleted = await alerting_service.delete_alert_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"deleted": True}


@router.get("/alerting/channels")
async def list_channels() -> List[Dict[str, Any]]:
    """List notification channels."""
    return await alerting_service.list_notification_channels()


@router.post("/alerting/channels", status_code=201)
async def create_channel(channel: Dict[str, Any]) -> Dict[str, Any]:
    """Create a notification channel."""
    return await alerting_service.create_notification_channel(channel)


@router.post("/alerting/channels/{channel_id}/test")
async def test_channel(channel_id: str) -> Dict[str, Any]:
    """Test a notification channel."""
    return await alerting_service.test_channel(channel_id)


# ---------------------------------------------------------------------------
# Monitoring & Metrics
# ---------------------------------------------------------------------------

@router.get("/monitoring/metrics")
async def get_metrics() -> Dict[str, Any]:
    """Get all system metrics."""
    return await monitoring_service.get_metrics()


@router.get("/monitoring/cpu")
async def get_cpu_usage() -> Dict[str, Any]:
    """Get CPU usage metrics."""
    return await monitoring_service.get_cpu_usage()


@router.get("/monitoring/memory")
async def get_memory_usage() -> Dict[str, Any]:
    """Get memory usage metrics."""
    return await monitoring_service.get_memory_usage()


@router.get("/monitoring/disk")
async def get_disk_usage() -> Dict[str, Any]:
    """Get disk usage metrics."""
    return await monitoring_service.get_disk_usage()


@router.get("/monitoring/slow-queries")
async def get_slow_queries(limit: int = 10) -> List[Dict[str, Any]]:
    """Get slow database queries."""
    return await monitoring_service.get_slow_queries(limit)


@router.get("/monitoring/error-rate")
async def get_error_rate() -> Dict[str, Any]:
    """Get HTTP error rate."""
    return await monitoring_service.get_error_rate()


# ---------------------------------------------------------------------------
# Password Policy & 2FA
# ---------------------------------------------------------------------------

@router.get("/password/policy")
async def get_password_policy() -> Dict[str, Any]:
    """Get password policy."""
    return await password_policy_service.get_password_policy()


@router.put("/password/policy")
async def update_password_policy(policy: Dict[str, Any]):
    """Update password policy."""
    await password_policy_service.update_password_policy(policy)
    return {"updated": True}


@router.get("/password/2fa/{user_id}")
async def get_2fa_status(user_id: str) -> Dict[str, Any]:
    """Get 2FA status for a user."""
    return await password_policy_service.get_2fa_status(user_id)


@router.post("/password/2fa/{user_id}/enable")
async def enable_2fa(user_id: str) -> Dict[str, Any]:
    """Enable 2FA for a user."""
    return await password_policy_service.enable_2fa(user_id)


@router.post("/password/2fa/{user_id}/disable")
async def disable_2fa(user_id: str) -> Dict[str, Any]:
    """Disable 2FA for a user."""
    return {"disabled": await password_policy_service.disable_2fa(user_id)}


@router.post("/password/2fa/{user_id}/verify")
async def verify_2fa(user_id: str, code: str) -> Dict[str, Any]:
    """Verify a 2FA code."""
    return await password_policy_service.verify_2fa(user_id, code)


# ---------------------------------------------------------------------------
# Data Export/Import
# ---------------------------------------------------------------------------

@router.post("/data/export")
async def export_data(
    format: str = "csv",
    tables: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Start a data export job."""
    return await data_export_service.export_data(format=format, tables=tables)


@router.get("/data/export/{job_id}")
async def get_export_status(job_id: str) -> Dict[str, Any]:
    """Get export job status."""
    result = await data_export_service.get_export_status(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return result


@router.post("/data/import")
async def import_data(file_path: str, format: str = "csv") -> Dict[str, Any]:
    """Import data from a file."""
    return await data_export_service.import_data(file_path, format)


@router.get("/data/formats")
async def list_export_formats() -> List[str]:
    """List supported export formats."""
    return await data_export_service.list_export_formats()


# ---------------------------------------------------------------------------
# Log Rotation
# ---------------------------------------------------------------------------

@router.get("/log-rotation/config")
async def get_rotation_config() -> Dict[str, Any]:
    """Get log rotation configuration."""
    return await log_rotation_service.get_rotation_config()


@router.put("/log-rotation/config")
async def update_rotation_config(config: Dict[str, Any]):
    """Update log rotation configuration."""
    await log_rotation_service.update_rotation_config(config)
    return {"updated": True}


@router.post("/log-rotation/rotate")
async def rotate_logs() -> Dict[str, Any]:
    """Manually trigger log rotation."""
    return await log_rotation_service.rotate_logs()


@router.get("/log-rotation/files")
async def list_rotated_logs() -> List[Dict[str, Any]]:
    """List rotated log files."""
    return await log_rotation_service.list_rotated_logs()


# ---------------------------------------------------------------------------
# Security Scans
# ---------------------------------------------------------------------------

@router.get("/security-scan/results")
async def list_scan_results() -> List[Dict[str, Any]]:
    """List security scan results."""
    return await security_scan_service.list_scan_results()


@router.post("/security-scan/sast")
async def run_sast_scan() -> Dict[str, Any]:
    """Run a SAST scan."""
    return await security_scan_service.run_sast_scan()


@router.post("/security-scan/dast")
async def run_dast_scan() -> Dict[str, Any]:
    """Run a DAST scan."""
    return await security_scan_service.run_dast_scan()


@router.post("/security-scan/schedule")
async def schedule_scan(cron: str, scan_type: str = "sast") -> Dict[str, Any]:
    """Schedule a recurring scan."""
    return await security_scan_service.schedule_scan(cron, scan_type)


@router.get("/security-scan/{job_id}")
async def get_scan_status(job_id: str) -> Dict[str, Any]:
    """Get scan job status."""
    result = await security_scan_service.get_scan_status(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return result


# ---------------------------------------------------------------------------
# Secret Rotation
# ---------------------------------------------------------------------------

@router.get("/secrets")
async def list_secrets() -> List[Dict[str, Any]]:
    """List managed secrets."""
    return await secret_rotation_service.list_secrets()


@router.post("/secrets/{secret_name}/rotate")
async def rotate_secret(secret_name: str) -> Dict[str, Any]:
    """Rotate a secret."""
    return await secret_rotation_service.rotate_secret(secret_name)


@router.get("/secrets/history")
async def get_rotation_history(secret_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get secret rotation history."""
    return await secret_rotation_service.get_rotation_history(secret_name)


# ---------------------------------------------------------------------------
# User Management
# ---------------------------------------------------------------------------

@router.get("/users")
async def list_users(db=Query(None)) -> List[Dict[str, Any]]:
    """List all users."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        users = db.execute(select(User)).scalars().all()
        return [
            {
                "id": str(u.id),
                "username": u.username,
                "email": u.email,
                "role": u.role.value if hasattr(u.role, 'value') else str(u.role),
                "active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    finally:
        db.close()


@router.get("/users/{user_id}")
async def get_user(user_id: str) -> Dict[str, Any]:
    """Get a specific user."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
            "active": user.is_active,
        }
    finally:
        db.close()


@router.put("/users/{user_id}")
async def update_user(user_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update a user."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        for key, value in updates.items():
            if hasattr(user, key):
                setattr(user, key, value)
        db.commit()
        db.refresh(user)
        return {"updated": True, "user_id": user_id}
    finally:
        db.close()


@router.delete("/users/{user_id}")
async def delete_user(user_id: str) -> Dict[str, Any]:
    """Delete a user."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        db.delete(user)
        db.commit()
        return {"deleted": True}
    finally:
        db.close()
