Database Backup
===============


Manage database backups and restore operations.

Backup Manager
~~~~~~~~~~~~~~


Database Backup Router.

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
