Baseline Governance
===================


Capture and manage project baselines. Track changes against approved baselines and request baseline change approvals.

baselines
~~~~~~~~~


API router for Performance Measurement Baseline (PMB) governance.

This router provides endpoints for freezing baselines, comparing live
WBS state against frozen baselines, and managing Baseline Change Requests
(BCRs).

Endpoints
---------

POST   /api/v1/baselines/freeze          — Freeze a new baseline snapshot.
GET    /api/v1/baselines/compare          — Compare live state against a baseline.
GET    /api/v1/baselines/list             — List baselines for a project.
POST   /api/v1/baselines/bcr              — Create a new Baseline Change Request.
PUT    /api/v1/baselines/bcr/{id}         — Update BCR status (approve/reject).
GET    /api/v1/baselines/bcr/{id}         — Get BCR details.
GET    /api/v1/baselines/bcr              — List BCRs by status/tier.

Sub-Tree Locking
~~~~~~~~~~~~~~~~

The ``POST /freeze`` endpoint acquires a sub-tree lock before cloning
the live WBS sub-tree into baseline snapshot rows.  This prevents
concurrent mutations from changing the source tree during the snapshot.
If a lock is already held, HTTP 423 (Locked) is returned.

Security
~~~~~~~~

All endpoints require JWT authentication.  The authenticated user must
have sufficient clearance to access the portfolio nodes involved.

Usage
~~~~~

   # Freeze a new baseline
   POST /api/v1/baselines/freeze
   {
   "root_node_id": "<uuid>",
   "baseline_code": "B0_CONTRACT",
   "name": "Contract Baseline"
   }

   # Compare live state against a baseline
   GET /api/v1/baselines/compare?root_node_id=<uuid>&baseline_id=<uuid>

   # Create a BCR
   POST /api/v1/baselines/bcr
   {
   "bcr_number": "BCR-2024-001",
   "title": "Extend delivery schedule",
   "justification": "Supply chain delays...",
   "tier": "TIER_2_PROJECT_CCB",
   "schedule_finish_slip_days": 14
   }

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Compare live WBS state against a frozen baseline.
* **View**: List all baselines for a given portfolio project.
* **View**: List Baseline Change Requests, optionally filtered by status or tier.
* **View**: Get details of a specific Baseline Change Request.

**Creating New Items**

* **Create**: Freeze a new Performance Measurement Baseline.
* **Create**: Create a new Baseline Change Request.

**Updating Information**

* **Update**: Update the status of a Baseline Change Request.
