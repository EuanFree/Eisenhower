Application Modules
===================

This section contains the auto-generated API reference for all modules
in the Eisenhower Portfolio Manager application.

Each module is documented with verbose, clear descriptions that explain
**what** the component does, **why** it exists, and **how** it fits into
the overall system â€” making the documentation accessible to both
developers and non-technical stakeholders.

.. automodule:: app
   :members:

Core Security
=============

Attribute-Based Access Control (ABAC)
-------------------------------------

.. automodule:: app.core.abac
   :members:

Export Control Governance
-------------------------

.. automodule:: app.core.export_control
   :members:
   
Supplier Portal ABAC Filter
---------------------------

.. automodule:: app.core.supplier_abac
   :members:
   
Session Lifecycle Management
----------------------------

.. automodule:: app.core.session
   :members:
   
Concurrency Control & Locking Exceptions
----------------------------------------

.. automodule:: app.core.exceptions
   :members:
   
Data Models
===========

.. automodule:: app.models.models
   :members:
   
Pydantic Schemas
================

Core Schemas
------------

.. automodule:: app.schemas.schemas
   :members:
   
Preview Schemas
---------------

.. automodule:: app.schemas.preview
   :members:
   
Supplier Portal Schemas
-----------------------

.. automodule:: app.schemas.supplier_schemas
   :members:
   
HMI Catalog Schemas
-------------------

.. automodule:: app.schemas.hmi_catalog
   :members:
   
IPMR Report Schemas
-------------------

.. automodule:: app.schemas.ipmr_schemas
   :members:
   
Briefing Schemas
----------------

.. automodule:: app.schemas.briefing_schemas
   :members:
   
API Routers
===========

Authentication
--------------

.. automodule:: app.routers.auth
   :members:
   
Users
-----

.. automodule:: app.routers.users
   :members:
   
Display Settings
----------------

.. automodule:: app.routers.display_settings
   :members:
   
Work Breakdown Structure (WBS)
------------------------------

.. automodule:: app.routers.wbs
   :members:
   
Schedule (CPM & Monte Carlo)
----------------------------

.. automodule:: app.routers.schedule
   :members:
   
Daily Cockpit
-------------

.. automodule:: app.routers.cockpit
   :members:
   
Schedule Clashes & Leveling
---------------------------

.. automodule:: app.routers.clashes
   :members:
   
Baseline Governance
-------------------

.. automodule:: app.routers.baselines
   :members:
   
Resource Requisitions
---------------------

.. automodule:: app.routers.requisitions
   :members:
   
Notifications & Webhooks
------------------------

.. automodule:: app.routers.notifications
   :members:
   
Contract Deliverables (CDRL) & V&V
----------------------------------

.. automodule:: app.routers.cdrl
   :members:
   
Earned Value Management (EVM)
-----------------------------

.. automodule:: app.routers.evm
   :members:
   
Procurement Tracking
--------------------

.. automodule:: app.routers.procurement
   :members:
   
Costing & CBS Rollup
--------------------

.. automodule:: app.routers.costing
   :members:
   
Currency Exchange
-----------------

.. automodule:: app.routers.currency
   :members:
   
Working Calendars
-----------------

.. automodule:: app.routers.calendars
   :members:
   
Templates & Instantiation
-------------------------

.. automodule:: app.routers.templates
   :members:
   
Sandbox Scenarios
-----------------

.. automodule:: app.routers.sandboxes
   :members:
   
Airgap Data Exchange
--------------------

.. automodule:: app.routers.airgap
   :members:
   
Document Artifacts & Vault
--------------------------

.. automodule:: app.routers.artifacts
   :members:
   
Spatial Location Tracking
-------------------------

.. automodule:: app.routers.spatial
   :members:
   
Facility Reservations
---------------------

.. automodule:: app.routers.facilities
   :members:
   
Oracle Timesheets
-----------------

.. automodule:: app.routers.oracle_timesheets
   :members:
   
Management Reserves
-------------------

.. automodule:: app.routers.reserves
   :members:
   
IPMR Reports
------------

.. automodule:: app.routers.ipmr_reports
   :members:
   
Executive Briefing Decks
------------------------

.. automodule:: app.routers.briefing
   :members:
   
Subcontractor Submissions
-------------------------

.. automodule:: app.routers.subcontractors
   :members:
   
Supplier Portal
---------------

.. automodule:: app.routers.supplier_portal
   :members:
   
Merkle Sync
-----------

.. automodule:: app.routers.merkle_sync
   :members:
   
WebSocket Presence
------------------

.. automodule:: app.routers.websocket
   :members:
   
MCP Gateway
-----------

.. automodule:: app.routers.mcp
   :members:
   
Preview Endpoints
-----------------

.. automodule:: app.routers.previews
   :members:
   
Programme Archive & Seal
------------------------

.. automodule:: app.routers.programmes
   :members:
   
Admin Security
--------------

.. automodule:: app.routers.admin_security
   :members:
   
Database Health
---------------

.. automodule:: app.routers.db_health
   :members:
   
Mock Fixtures (Development Only)
--------------------------------

.. automodule:: app.routers.mock_fixtures
   :members:
   
Legacy Routers (Reference Only)
-------------------------------

The following routers use the legacy relational data model and are not
imported by the main application.  They are documented here for reference
only.  Due to their reliance on deleted models, they cannot be processed
by Sphinx autodoc.

- ``app.routers.comments`` â€” Task-level discussion threads.
- ``app.routers.dashboard`` â€” Portfolio overview statistics.
- ``app.routers.milestones`` â€” Project milestone tracking.
- ``app.routers.portfolios`` â€” Top-level programme container management.
- ``app.routers.projects`` â€” Mid-level project container management.
- ``app.routers.tasks`` â€” Work item management within projects.

Services
========

Critical Path Method Engine
---------------------------

.. automodule:: app.services.cpm_engine
   :members:
   
Monte Carlo Schedule Risk Analysis
----------------------------------

.. automodule:: app.services.monte_carlo
   :members:
   
Resource Leveling
-----------------

.. automodule:: app.services.leveling
   :members:
   
Clash Daemon
------------

.. automodule:: app.services.clash_daemon
   :members:
   
Baseline Engine
---------------

.. automodule:: app.services.baseline_engine
   :members:
   
EVM Calculator
--------------

.. automodule:: app.services.evm_calculator
   :members:
   
Costing Engine
--------------

.. automodule:: app.services.costing
   :members:
   
Currency Exchange
-----------------

.. automodule:: app.services.currency
   :members:
   
Resource Matching
-----------------

.. automodule:: app.services.matching
   :members:
   
Notifications Dispatch
----------------------

.. automodule:: app.services.notifications
   :members:
   
Artifact Vault
--------------

.. automodule:: app.services.artifact_vault
   :members:
   
Airgap Data Exchange
--------------------

.. automodule:: app.services.airgap
   :members:
   
Spatial Tracking
----------------

.. automodule:: app.services.spatial
   :members:
   
Facility Telemetry
------------------

.. automodule:: app.services.facility_telemetry
   :members:
   
Oracle ERP Gateway
------------------

.. automodule:: app.services.oracle_gateway
   :members:
   
Management Reserve Governance
-----------------------------

.. automodule:: app.services.reserve_governance
   :members:
   
Template Engine
---------------

.. automodule:: app.services.templating
   :members:
   
Sandbox Scenarios
-----------------

.. automodule:: app.services.sandboxing
   :members:
   
Spillage Remediation
--------------------

.. automodule:: app.services.spillage_remediation
   :members:
   
Subcontractor Ingest
--------------------

.. automodule:: app.services.subcontractor_ingest
   :members:
   
IPMR Generator
--------------

.. automodule:: app.services.ipmr_generator
   :members:
   
Briefing Generator
------------------

.. automodule:: app.services.briefing_generator
   :members:
   
Primavera P6 Export
-------------------

.. automodule:: app.services.export_p6
   :members:
   
Microsoft Project Export
------------------------

.. automodule:: app.services.export_msp
   :members:
   
Merkle Sync
-----------

.. automodule:: app.services.merkle_sync
   :members:
   
WebSocket Presence
------------------

.. automodule:: app.services.ws_presence
   :members:
   
Lock Manager
------------

.. automodule:: app.services.lock_manager
   :members:
   
Database Maintenance
--------------------

.. automodule:: app.services.db_maintenance
   :members:
   
MCP Server
----------

.. automodule:: app.services.mcp_server
   :members:
   
Programme Archival
------------------

.. automodule:: app.services.archival
   :members:
   
Utilities
=========

Authentication Utilities
------------------------

.. automodule:: app.utils.auth
   :members:
   
Security Utilities
------------------

.. automodule:: app.utils.security
   :members:
   
Configuration
=============

.. automodule:: app.config
   :members:
   
Database
========

.. automodule:: app.database
   :members:
   
Application Entry Point
=======================

.. automodule:: app.main
   :members:
   
Database Initialization
=======================

.. automodule:: init_db
   :members:
   
CLI Seeder
==========

.. automodule:: app.cli.seed
   :members:
   