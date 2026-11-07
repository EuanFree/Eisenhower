"""Eisenhower Portfolio Manager — Application entry point.

This module creates and configures the FastAPI application instance.
It is the main entry point for the web server and is responsible for:

- Creating the FastAPI app with metadata (title, version, description).
- Registering all API routers under the ``/api`` prefix.
- Configuring CORS middleware for cross-origin requests (restricted methods/headers).
- Configuring security headers middleware (HSTS, CSP, X-Frame-Options, etc.).
- Creating database tables on startup.
- Providing health check and root endpoints.

Running the Application
~~~~~~~~~~~~~~~~~~~~~~~

Start the server using Uvicorn::

    uvicorn app.main:app --reload

The ``--reload`` flag enables auto-reload on code changes (development only).

API Structure
~~~~~~~~~~~~~

All API endpoints are mounted under ``/api``:

- ``/api/auth/*`` — Authentication (login, register).
- ``/api/users/*`` — User management.
- ``/api/users/me/display-settings`` — Display profile persistence.
- ``/api/v1/wbs/*`` — Work Breakdown Structure queries with ABAC.
- ``/api/v1/schedule/*`` — CPM schedule recalculation.
- ``/api/v1/cockpit/*`` — Daily Cockpit dashboard endpoints.
- ``/api/v1/baselines/*`` — PMB baseline governance and BCR workflows.
- ``/api/v1/notifications/webhooks/*`` — Teams webhook management and dispatch.
- ``/api/v1/cdrl/*`` — Contract Deliverables and V&V test case management.
- ``/api/v1/procurement/*`` — Supply chain procurement tracking and constraints.
- ``/api/v1/reserves/*`` — Management Reserve budget tracking and drawdowns.
- ``/api/v1/mcp/*`` — MCP gateway for conversational AI integration.
- ``/api/v1/previews/*`` — Lightweight hover preview endpoints.
- ``/api/v1/subcontractors/*`` — Subcontractor schedule ingest pipeline.
- ``/api/v1/reports/evm/*`` — IPMR/CPR EVM report export (Format 1, 5).
- ``/api/v1/reports/briefing/*`` — Executive briefing deck export (.pptx).
- ``/api/v1/programmes/*`` — Programme closeout and WORM cold-storage sealing.
- ``/api/v1/admin/security/*`` — Admin security (heartbeat, spillage purge, audit, SBOM, vulnerability report).
- ``/api/v1/admin/db-health/*`` — Database health metrics and maintenance.
- ``/api/v1/supplier-portal/*`` — Isolated subcontractor supplier portal.
- ``/api/v1/facilities/*`` — Facility reservation and chamber telemetry.
- ``/api/v1/merkle-sync/*`` — Merkle tree sync for offline multi-site reconciliation.
- ``/api/v1/audit/*`` — Audit chain integrity verification and forensic investigation.
- ``/api/v1/equipment/*`` — Equipment calibration and maintenance management.
- ``/api/v1/engineering/*`` — Engineering governance (concessions, DAL gates).
- ``/api/v1/commercial/*`` — Commercial governance (contracts, fiscal caps, acceptance).
- ``/api/v1/materials/*`` — Perishable materials and clearance lifecycle.
- ``/api/v1/views/*`` — Gantt view preset storage, sharing, and import/export.
- ``/api/v1/presets/*`` — Multi-view preset storage, sharing, and import/export.
- ``/api/v1/resources/*`` — Resource creation with permission governance.
- ``/api/v1/schedule_quarantine/*`` — Schedule quarantine buffer and remediation.
- ``/api/v1/leases/*`` — Sub-tree check-out lease lifecycle management.
- ``/api/v1/copilot/*`` — CoPilot AI chat with MCP tool integration.

Interactive Documentation
~~~~~~~~~~~~~~~~~~~~~~~~~

FastAPI automatically generates interactive API documentation:

- **Swagger UI**: ``http://localhost:8000/docs``
- **ReDoc**: ``http://localhost:8000/redoc``

These are useful for testing endpoints and exploring the API schema.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm.exc import StaleDataError
from app.config import settings
from app.database import engine, Base
from app.core.exceptions import stale_data_exception_handler
from app.middleware.security import SecurityHeadersMiddleware
from app.routers import auth, users, display_settings, schedule, wbs, cockpit, requisitions, clashes, baselines, notifications, cdrl, oracle_timesheets, costing, templates, artifacts, airgap, sandboxes, evm, procurement, reserves, spatial, calendars, currency, mcp, previews, websocket, subcontractors, ipmr_reports, briefing, programmes, admin_security, db_health, supplier_portal, facilities, merkle_sync, audit, equipment, engineering, commercial, materials, views, presets, resources, schedule_quarantine, leases, db_backup, admin_tools, dashboard, export, copilot, line_management, delegation, agents
from app.routers.admin import custom_fields as custom_fields_router

# Import all model modules so they are registered with SQLAlchemy's declarative base
# This must happen before create_all is called
import app.models.models  # noqa: F401
import app.models.display  # noqa: F401
import app.models.custom_fields  # noqa: F401
import app.models.leases  # noqa: F401
import app.models.dashboard  # noqa: F401
import app.models.agent_staging  # noqa: F401

# Developer mock fixtures — only load in non-production environments
if settings.ENVIRONMENT != "production":
    from app.routers import mock_fixtures


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup and shutdown events.

    This replaces the deprecated ``@app.on_event("startup")`` pattern with
    the modern FastAPI lifespan context manager. It ensures that database
    tables are created before the application starts serving requests.

    Process Flow
    ~~~~~~~~~~~~

    1. On startup: Create all database tables defined in the SQLAlchemy models.
       In production, Alembic migrations should be used instead of ``create_all``.
    2. Yield control to FastAPI to start serving requests.
    3. On shutdown: Perform any cleanup tasks (currently none).

    Yields
    ------
    None
        Yields control to FastAPI to start serving requests.
    """
    # Startup: Skip table creation - use init_db.py or Alembic migrations instead
    # Base.metadata.create_all(bind=engine)  # Moved to init_db.py
    yield
    # Shutdown: Add cleanup tasks here if needed


app = FastAPI(
    title=settings.APP_NAME,
    description="Enterprise Portfolio Management System API",
    version="1.0.0",
    lifespan=lifespan,
)
"""The main FastAPI application instance.

This is the ASGI application that handles all incoming HTTP requests.
It is configured with automatic API documentation (Swagger UI and ReDoc)
and includes all API routers under the ``/api`` prefix.
"""

# Register exception handlers
app.add_exception_handler(StaleDataError, stale_data_exception_handler)

# Security Headers Middleware — adds HSTS, CSP, X-Frame-Options, etc.
app.add_middleware(SecurityHeadersMiddleware)

# CORS Middleware — restrict cross-origin requests
allowed_origins = settings.ALLOWED_ORIGINS.split(",") if settings.ALLOWED_ORIGINS != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["Link", "X-Total-Count"],
    max_age=600,
)

# Register routers
app.include_router(auth.router, prefix="/api")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api")
app.include_router(users.router, prefix="/api/v1")
app.include_router(display_settings.router, prefix="/api")
app.include_router(display_settings.router, prefix="/api/v1")
app.include_router(schedule.router, prefix="/api")
app.include_router(wbs.router, prefix="/api")
app.include_router(cockpit.router, prefix="/api")
app.include_router(requisitions.router, prefix="/api/v1/requisitions")
app.include_router(clashes.router, prefix="/api")
app.include_router(baselines.router, prefix="/api")
app.include_router(notifications.router, prefix="/api/v1/notifications")
app.include_router(cdrl.router, prefix="/api/v1/cdrl")
app.include_router(oracle_timesheets.router, prefix="/api/v1/timesheets/oracle")
app.include_router(costing.router, prefix="/api/v1/costing")
app.include_router(templates.router, prefix="/api")
app.include_router(artifacts.router, prefix="/api/v1/artifacts")
app.include_router(airgap.router, prefix="/api/v1/airgap")
app.include_router(sandboxes.router, prefix="/api")
app.include_router(evm.router, prefix="/api/v1/evm")
app.include_router(procurement.router, prefix="/api/v1/procurement")
app.include_router(reserves.router, prefix="/api/v1/reserves")
app.include_router(spatial.router, prefix="/api/v1/spatial")
app.include_router(calendars.router, prefix="/api/v1/calendars")
app.include_router(currency.router, prefix="/api/v1/currency")
app.include_router(mcp.router, prefix="/api/v1/mcp")
app.include_router(previews.router, prefix="/api/v1/previews")
app.include_router(subcontractors.router, prefix="/api/v1/subcontractors")
app.include_router(ipmr_reports.router, prefix="/api/v1/reports/evm")
app.include_router(briefing.router, prefix="/api/v1/reports/briefing")
app.include_router(programmes.router, prefix="/api/v1/programmes")
app.include_router(websocket.router)  # WebSocket endpoint at /ws/projects/{project_id}
app.include_router(admin_security.router, prefix="/api/v1/admin/security")
app.include_router(db_health.router, prefix="/api/v1/admin")
app.include_router(supplier_portal.router, prefix="/api/v1/supplier-portal")
app.include_router(facilities.router, prefix="/api/v1/facilities")
app.include_router(merkle_sync.router, prefix="/api/v1/merkle-sync")
app.include_router(audit.router, prefix="/api/v1/audit")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(copilot.router)  # CoPilot chat at /api/v1/copilot
app.include_router(equipment.router, prefix="/api/v1/equipment")
app.include_router(engineering.router, prefix="/api/v1/engineering")
app.include_router(commercial.router, prefix="/api/v1/commercial")
app.include_router(materials.router, prefix="/api/v1/materials")
app.include_router(views.router, prefix="/api/v1/views")
app.include_router(presets.router, prefix="/api/v1/presets")
app.include_router(resources.router, prefix="/api")
app.include_router(custom_fields_router.router, prefix="/api/v1/admin")
app.include_router(schedule_quarantine.router, prefix="/api/v1/schedule_quarantine")
app.include_router(leases.router, prefix="/api/v1/leases")
app.include_router(db_backup.router, prefix="/api/v1/admin/backups")
app.include_router(admin_tools.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1/export")
app.include_router(line_management.router, prefix="/api")
app.include_router(line_management.leave_router, prefix="/api")
app.include_router(line_management.downtime_router, prefix="/api")
app.include_router(line_management.skills_router, prefix="/api")
app.include_router(delegation.router, prefix="/api")
app.include_router(agents.router)  # Agent proposal sessions at /api/v1/agents

# Developer mock fixtures — only register in non-production environments
if settings.ENVIRONMENT != "production":
    app.include_router(mock_fixtures.router, prefix="/api/v1/dev")


@app.get("/")
def root():
    """Root endpoint returning API information.

    Returns the application name, version, and a link to the
    interactive API documentation.

    Returns
    -------
    dict
        A dictionary containing the API name, version, and docs URL.
    """
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    """Health check endpoint for load balancers and monitoring.

    Returns a simple status indicator that the application is running.
    Load balancers and monitoring systems use this endpoint to determine
    whether the service is healthy and should receive traffic.

    Returns
    -------
    dict
        A dictionary with ``{"status": "healthy"}``.
    """
    return {"status": "healthy"}
