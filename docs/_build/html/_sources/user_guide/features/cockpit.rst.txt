Daily Cockpit
=============


Your personal landing page shows today's tasks, priorities, and blockers at a glance. Use it to track progress and quickly update task status.

Cockpit - Daily Landing Page
~~~~~~~~~~~~~~~~~~~~~~~~~~~~


My Daily Cockpit — personal landing page API endpoints.

Provides quick-access endpoints for the authenticated user's daily workflow:
summary metrics, focus queue ordered by CPM priority, claimable placeholder
tasks, quick progress updates, and atomic blocker creation.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Return key metrics for the user's Daily Cockpit landing page.
* **View**: Return the user's active, in-progress, and upcoming assigned tasks.
* **View**: Return tasks assigned to generic placeholder resources.

**Creating New Items**

* **Create**: Claim a task currently assigned to a generic placeholder resource.
* **Create**: Allow quick updates: +5%, +10%, or completion, with optional hour logs.
* **Create**: Atomically create a NodeBlocker entry, update task status, and record ForensicAuditLog.
