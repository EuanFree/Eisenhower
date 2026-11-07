System Administration
=====================


System-wide administration tasks including security configuration, database health, and maintenance.

admin_security
~~~~~~~~~~~~~~


Admin security router for session management and spillage remediation.

This module provides the administrative security endpoints required by
UK MOD JSP 440 / JSP 604 and US DoD IL5/IL6 guidelines:

1. **Heartbeat** — Client-side session keep-alive to prevent inactivity
   timeout (``POST /api/v1/auth/heartbeat``).

2. **Spillage Purge** — Multi-signature emergency data redaction for
   classified spillage events (``POST /api/v1/admin/security/spillage/purge``).

3. **Audit Certificates** — Historic spillage redaction certificates for
   external security accreditation boards
   (``GET /api/v1/admin/security/spillage/audit-certificates``).

Session Heartbeat
~~~~~~~~~~~~~~~~~

In a SCIF environment, an unattended terminal is a security risk.  The
client sends periodic heartbeat pings to keep the session alive.  If
the elapsed time since the last heartbeat exceeds 900 seconds (15
minutes), the session is invalidated and the client receives HTTP 401
with header ``X-Session-Terminated: INACTIVITY_TIMEOUT``.

Spillage Purge
~~~~~~~~~~~~~~

When classified data is accidentally disclosed to an unauthorized system
or personnel, the contaminated content must be surgically redacted.
This endpoint requires multi-signature authorization from two Superusers
with clearance at or above SECRET.

Usage
~~~~~

.. code-block:: python

   # Heartbeat — keep session alive
   POST /api/v1/auth/heartbeat

   # Execute spillage purge
   POST /api/v1/admin/security/spillage/purge
   {
   "incident_ticket_ref": "INC-2026-0042",
   "search_terms": ["CLASSIFIED_PROGRAM_NAME"],
   "purging_user_ids": [1, 2]
   }

   # Retrieve audit certificates
   GET /api/v1/admin/security/spillage/audit-certificates

Admin Tools
~~~~~~~~~~~


Admin Tools Router — Combined endpoints for all admin capabilities.

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

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Retrieve historic spillage redaction certificates.

**Creating New Items**

* **Create**: Session heartbeat — keep session alive.
* **Create**: Execute emergency classified spillage purge.
