================================================
Eisenhower Portfolio Manager — API Documentation
================================================

Overview
========

The **Eisenhower Portfolio Manager** is an enterprise-grade web application
designed for defence programme management.  It provides a complete backend
API for managing portfolios, projects, tasks, resources, and locations
through a unified hierarchical data model.

The system is built for use in **classified operational environments**
(SCIFs — Sensitive Compartmented Information Facilities) where standard
browser storage is prohibited and all user preferences must be persisted
server-side.

Key Capabilities
================

- **Unified Tree Data Model** — Portfolios, resources, and locations are
  stored in a single polymorphic hierarchy using PostgreSQL's ``ltree``
  extension, enabling efficient ancestor/descendant queries.

- **Critical Path Method (CPM) Scheduling** — Automatic schedule calculation
  using forward and backward passes, with support for all four dependency
  types (FS, SS, FF, SF), lag/lead days, and a working calendar that skips
  weekends.  Includes DCMA 14-Point integrity checks.

- **Attribute-Based Access Control (ABAC)** — Fine-grained security that
  restricts data access based on user clearance levels and security caveats.
  When a user lacks clearance for an intermediate node but has clearance
  for its children, the parent is shown as a "ghost node" with redacted
  data, preserving the tree structure for the frontend.

- **Forensic Audit Logging** — Every mutation to the data hierarchy is
  recorded in an immutable audit trail with SHA-256 chained hashing,
  making tampering detectable.

- **Server-Side Display Profiles** — User display preferences (theme,
  density, color accessibility) are stored in PostgreSQL and hydrated
  on login, supporting hot-desking in terminal environments.

- **Daily Cockpit Dashboard** — Personal landing page endpoints that provide
  each user with their active tasks, focus queue ordered by critical path
  priority, claimable placeholder tasks, and quick progress/blocker updates.

Security Architecture
=====================

The system implements multiple layers of security:

1. **Authentication** — JWT-based authentication with bcrypt password hashing.
2. **Role-Based Access Control (RBAC)** — Users have roles (Admin, Manager,
   Member, Viewer) that control administrative actions.
3. **Attribute-Based Access Control (ABAC)** — Each data node carries a
   security classification (OFFICIAL through TOP_SECRET) and optional caveats
   (e.g., ``UK_EYES_ONLY``).  Users must have matching clearance to access data.
4. **Forensic Audit Trail** — All data mutations are logged with chained
   SHA-256 hashes, creating a tamper-evident record.

Data Model
==========

The core data model revolves around the **Universal Breakdown Node** (UBN),
an abstract base that supports three specialised sub-types:

- **PortfolioNode** (WBS) — Represents work packages, projects, and programmes
  with scheduling and Earned Value Management (EVM) fields.
- **ResourceNode** (RBS) — Represents people, facilities, and assets with
  rate and availability information.
- **LocationNode** (LBS) — Represents physical locations in a hierarchical
  structure, with SCIF/TEMPEST classification flags.

Secondary entities include:

- **DependencyLink** — Precedence relationships between portfolio nodes.
- **ResourceAssignment** — Links resources to portfolio nodes with allocation details.
- **NodeBlocker** — Tracks impediments blocking progress on tasks.
- **ForensicAuditLog** — Immutable audit trail with SHA-256 chained hashing.

API Endpoints
=============

The API is organised into the following groups:

- **Authentication** — User registration, login, and session management.
- **Users** — User management and clearance administration.
- **Display Settings** — Server-side display profile persistence.
- **WBS (Work Breakdown Structure)** — Tree queries with ABAC filtering.
- **Schedule** — CPM recalculation and schedule analysis.
- **Cockpit** — Personal daily landing page endpoints.

System Requirements
===================

- **Python** 3.10+
- **PostgreSQL** 12+ with the ``ltree`` extension enabled
- **FastAPI** web framework with **Uvicorn** ASGI server

Getting Started
===============

1. Install dependencies::

     pip install -r requirements.txt

2. Configure the database connection in ``.env``::

     DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/eisenhower

3. Initialise the database::

     python init_db.py --seed

4. Start the server::

     uvicorn app.main:app --reload

Documentation Navigation
========================

.. toctree::
  :maxdepth: 2
  :caption: User Documentation

  user_guide/index

.. toctree::
  :maxdepth: 2
  :caption: Developer Documentation

  modules

Indices and Tables
==================

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
