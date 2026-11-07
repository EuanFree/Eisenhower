"""Dashboard API router.

This module provides CRUD endpoints for managing dashboards and their widgets
at ``/api/v1/dashboards``.  Dashboards are user-created collections of
draggable widgets that display performance indicators on a free-form canvas.

Endpoints
~~~~~~~~~

- ``GET /dashboards`` — List all dashboards accessible to the current user.
- ``POST /dashboards`` — Create a new dashboard.
- ``GET /dashboards/{id}`` — Get a dashboard with its widgets.
- ``PUT /dashboards/{id}`` — Update a dashboard (owner or admin only).
- ``DELETE /dashboards/{id}`` — Delete a dashboard (owner or admin only).
- ``POST /dashboards/{id}/widgets`` — Add a widget to a dashboard.
- ``PUT /dashboards/{id}/widgets/{widget_id}`` — Update a widget.
- ``DELETE /dashboards/{id}/widgets/{widget_id}`` — Delete a widget.
- ``GET /dashboards/{id}/data`` — Fetch data for all widgets in one call.
- ``GET /dashboards/sql-builder/allowed-tables`` — List allowed tables for SQL builder.
- ``POST /dashboards/sql-builder/execute`` — Execute a validated SQL query.

Access Control
~~~~~~~~~~~~~~

- **GET /dashboards** returns dashboards where:
  - ``owner_user_id == current_user.id`` (own dashboards), OR
  - ``sharing_scope IN ('PROJECT_SHARED', 'SYSTEM_GLOBAL')`` (shared dashboards).
- **PUT /dashboards/{id}** requires the user to be the dashboard owner or an admin.
- All endpoints enforce classification: the user's clearance must be >= the
  dashboard's classification level.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User
from app.models.dashboard import (
    Dashboard,
    DashboardWidget,
    WidgetType,
    DataSourceType,
)
from app.models.display import SharingScope, PresetClassification
from app.core.abac import has_sufficient_clearance, CLEARANCE_LEVELS
from app.schemas.dashboard import (
    DashboardCreate,
    DashboardUpdate,
    DashboardResponse,
    DashboardListResponse,
    DashboardWidgetCreate,
    DashboardWidgetUpdate,
    DashboardWidgetResponse,
    SqlQueryRequest,
    SqlQueryResponse,
    AllowedTable,
    AllowedColumn,
)
from app.services.sql_builder import (
    validate_query,
    execute_query,
    get_allowed_tables,
)

router = APIRouter(tags=["Dashboards"])


# ============================================================================
# Helper Functions
# ============================================================================


def _check_clearance(user: User, classification: PresetClassification) -> bool:
    """Check if user has sufficient clearance for a dashboard classification.

    Maps PresetClassification to the SecurityClassification levels used by
    the ABAC system.
    """
    # Map PresetClassification to numeric levels
    preset_levels = {
        PresetClassification.OFFICIAL: 0,
        PresetClassification.SECRET: 2,
        PresetClassification.TOP_SECRET: 3,
    }
    user_level = CLEARANCE_LEVELS.get(user.security_clearance, 0)
    required_level = preset_levels.get(classification, 0)
    return user_level >= required_level


async def _get_dashboard(
    dashboard_id: UUID,
    db: AsyncSession,
    current_user: User,
) -> Dashboard:
    """Fetch a dashboard and verify access permissions.

    Raises HTTPException if the dashboard doesn't exist or user lacks access.
    """
    result = await db.execute(
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .where(Dashboard.id == dashboard_id)
    )
    dashboard = result.scalar_one_or_none()

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check classification
    if not _check_clearance(current_user, dashboard.classification):
        raise HTTPException(status_code=403, detail="Insufficient clearance to access this dashboard")

    # Check ownership or sharing scope
    if dashboard.owner_user_id != str(current_user.id):
        if dashboard.sharing_scope == SharingScope.PRIVATE:
            raise HTTPException(status_code=403, detail="You do not have access to this dashboard")
        # For PROJECT_SHARED and SYSTEM_GLOBAL, allow access
        # (PROJECT_SHARED could additionally check project membership)

    return dashboard


async def _require_owner_or_admin(
    dashboard: Dashboard,
    current_user: User,
) -> None:
    """Verify the user is the dashboard owner or an admin.

    Raises HTTPException if the user is not authorized to modify the dashboard.
    """
    is_owner = dashboard.owner_user_id == str(current_user.id)
    is_admin = current_user.role in ("admin", "superadmin") if hasattr(current_user, 'role') else False

    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Only the dashboard owner or an admin can modify this dashboard")


def _dashboard_to_response(dashboard: Dashboard) -> DashboardResponse:
    """Convert a Dashboard model instance to a response schema."""
    widgets = [
        DashboardWidgetResponse(
            id=w.id,
            dashboard_id=w.dashboard_id,
            widget_type=w.widget_type,
            title=w.title,
            data_source_type=w.data_source_type,
            data_source_config=w.data_source_config,
            display_config=w.display_config,
            position=w.position,
            created_at=w.created_at,
            updated_at=w.updated_at,
        )
        for w in dashboard.widgets
    ]
    return DashboardResponse(
        id=dashboard.id,
        name=dashboard.name,
        description=dashboard.description,
        owner_user_id=dashboard.owner_user_id,
        project_id=dashboard.project_id,
        sharing_scope=dashboard.sharing_scope,
        classification=dashboard.classification,
        layout_config=dashboard.layout_config,
        widgets=widgets,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


# ============================================================================
# Dashboard CRUD Endpoints
# ============================================================================


@router.get(
    "/dashboards",
    response_model=DashboardListResponse,
    summary="List accessible dashboards",
    description=(
        "Returns all dashboards accessible to the current user.  A dashboard "
        "is accessible if the user is its owner, or if its sharing_scope is "
        "PROJECT_SHARED or SYSTEM_GLOBAL.  Dashboards with a classification "
        "above the user's clearance are excluded."
    ),
)
async def list_dashboards(
    sharing_scope: Optional[SharingScope] = Query(None, description="Filter by sharing scope"),
    project_id: Optional[UUID] = Query(None, description="Filter by project ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all dashboards accessible to the current user."""
    stmt = (
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .where(
            (Dashboard.owner_user_id == str(current_user.id))
            | (Dashboard.sharing_scope.in_([SharingScope.PROJECT_SHARED, SharingScope.SYSTEM_GLOBAL]))
        )
    )

    if sharing_scope:
        stmt = stmt.where(Dashboard.sharing_scope == sharing_scope)
    if project_id:
        stmt = stmt.where(Dashboard.project_id == project_id)

    result = await db.execute(stmt)
    dashboards = result.scalars().all()

    # Filter by classification
    accessible = [
        d for d in dashboards
        if _check_clearance(current_user, d.classification)
    ]

    items = [_dashboard_to_response(d) for d in accessible]

    return DashboardListResponse(items=items, total=len(items))


@router.post(
    "/dashboards",
    response_model=DashboardResponse,
    status_code=201,
    summary="Create a new dashboard",
)
async def create_dashboard(
    payload: DashboardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new dashboard."""
    # Check classification
    if not _check_clearance(current_user, payload.classification):
        raise HTTPException(status_code=403, detail="Insufficient clearance for this classification level")

    dashboard = Dashboard(
        name=payload.name,
        description=payload.description,
        owner_user_id=str(current_user.id),
        project_id=payload.project_id,
        sharing_scope=payload.sharing_scope,
        classification=payload.classification,
        layout_config={},
    )

    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)

    # Reload with widgets
    result = await db.execute(
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .where(Dashboard.id == dashboard.id)
    )
    dashboard = result.scalar_one()

    return _dashboard_to_response(dashboard)


@router.get(
    "/dashboards/{dashboard_id}",
    response_model=DashboardResponse,
    summary="Get dashboard with widgets",
)
async def get_dashboard(
    dashboard_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single dashboard with all its widgets."""
    dashboard = await _get_dashboard(dashboard_id, db, current_user)
    return _dashboard_to_response(dashboard)


@router.put(
    "/dashboards/{dashboard_id}",
    response_model=DashboardResponse,
    summary="Update a dashboard",
)
async def update_dashboard(
    dashboard_id: UUID,
    payload: DashboardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a dashboard's metadata or layout config."""
    dashboard = await _get_dashboard(dashboard_id, db, current_user)
    await _require_owner_or_admin(dashboard, current_user)

    if payload.classification and not _check_clearance(current_user, payload.classification):
        raise HTTPException(status_code=403, detail="Insufficient clearance for this classification level")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(dashboard, key, value)

    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)

    # Reload with widgets
    result = await db.execute(
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .where(Dashboard.id == dashboard.id)
    )
    dashboard = result.scalar_one()

    return _dashboard_to_response(dashboard)


@router.delete(
    "/dashboards/{dashboard_id}",
    status_code=204,
    summary="Delete a dashboard",
)
async def delete_dashboard(
    dashboard_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a dashboard and all its widgets (CASCADE)."""
    dashboard = await _get_dashboard(dashboard_id, db, current_user)
    await _require_owner_or_admin(dashboard, current_user)

    await db.execute(sa_delete(Dashboard).where(Dashboard.id == dashboard_id))
    await db.commit()


# ============================================================================
# Widget CRUD Endpoints
# ============================================================================


@router.post(
    "/dashboards/{dashboard_id}/widgets",
    response_model=DashboardWidgetResponse,
    status_code=201,
    summary="Add a widget to a dashboard",
)
async def create_widget(
    dashboard_id: UUID,
    payload: DashboardWidgetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new widget to an existing dashboard."""
    dashboard = await _get_dashboard(dashboard_id, db, current_user)
    await _require_owner_or_admin(dashboard, current_user)

    widget = DashboardWidget(
        dashboard_id=dashboard_id,
        widget_type=payload.widget_type,
        title=payload.title,
        data_source_type=payload.data_source_type,
        data_source_config=payload.data_source_config,
        display_config=payload.display_config,
        position=payload.position,
    )

    db.add(widget)
    await db.commit()
    await db.refresh(widget)

    return DashboardWidgetResponse(
        id=widget.id,
        dashboard_id=widget.dashboard_id,
        widget_type=widget.widget_type,
        title=widget.title,
        data_source_type=widget.data_source_type,
        data_source_config=widget.data_source_config,
        display_config=widget.display_config,
        position=widget.position,
        created_at=widget.created_at,
        updated_at=widget.updated_at,
    )


@router.put(
    "/dashboards/{dashboard_id}/widgets/{widget_id}",
    response_model=DashboardWidgetResponse,
    summary="Update a widget",
)
async def update_widget(
    dashboard_id: UUID,
    widget_id: UUID,
    payload: DashboardWidgetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a widget's configuration or position."""
    dashboard = await _get_dashboard(dashboard_id, db, current_user)
    await _require_owner_or_admin(dashboard, current_user)

    result = await db.execute(
        select(DashboardWidget).where(
            DashboardWidget.id == widget_id,
            DashboardWidget.dashboard_id == dashboard_id,
        )
    )
    widget = result.scalar_one_or_none()

    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(widget, key, value)

    db.add(widget)
    await db.commit()
    await db.refresh(widget)

    return DashboardWidgetResponse(
        id=widget.id,
        dashboard_id=widget.dashboard_id,
        widget_type=widget.widget_type,
        title=widget.title,
        data_source_type=widget.data_source_type,
        data_source_config=widget.data_source_config,
        display_config=widget.display_config,
        position=widget.position,
        created_at=widget.created_at,
        updated_at=widget.updated_at,
    )


@router.delete(
    "/dashboards/{dashboard_id}/widgets/{widget_id}",
    status_code=204,
    summary="Delete a widget",
)
async def delete_widget(
    dashboard_id: UUID,
    widget_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a widget from a dashboard."""
    dashboard = await _get_dashboard(dashboard_id, db, current_user)
    await _require_owner_or_admin(dashboard, current_user)

    result = await db.execute(
        select(DashboardWidget).where(
            DashboardWidget.id == widget_id,
            DashboardWidget.dashboard_id == dashboard_id,
        )
    )
    widget = result.scalar_one_or_none()

    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    await db.delete(widget)
    await db.commit()


# ============================================================================
# Data Fetch Endpoint
# ============================================================================


@router.get(
    "/dashboards/{dashboard_id}/data",
    summary="Fetch data for all widgets",
    description=(
        "Fetches data for all widgets in a dashboard in a single call. "
        "For ENDPOINT widgets, data is fetched from the configured API endpoint. "
        "For SQL_QUERY widgets, the query is executed via the SQL builder service."
    ),
)
async def fetch_dashboard_data(
    dashboard_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch data for all widgets in a dashboard."""
    dashboard = await _get_dashboard(dashboard_id, db, current_user)

    widget_data = {}
    for widget in dashboard.widgets:
        try:
            if widget.data_source_type == DataSourceType.SQL_QUERY:
                config = widget.data_source_config or {}
                sql = config.get("sql", "")
                params = config.get("params", {})
                if sql:
                    result = await execute_query(db, sql, params)
                    widget_data[str(widget.id)] = {
                        "success": True,
                        "data": result["rows"],
                        "columns": result["columns"],
                    }
                else:
                    widget_data[str(widget.id)] = {
                        "success": False,
                        "error": "No SQL query configured",
                        "data": [],
                    }
            elif widget.data_source_type == DataSourceType.ENDPOINT:
                # For endpoint-based widgets, the frontend fetches data directly
                # We return the config so the frontend knows where to fetch
                config = widget.data_source_config or {}
                widget_data[str(widget.id)] = {
                    "success": True,
                    "data": None,
                    "endpoint_config": config,
                }
            else:
                widget_data[str(widget.id)] = {
                    "success": False,
                    "error": "Unknown data source type",
                    "data": [],
                }
        except Exception as e:
            widget_data[str(widget.id)] = {
                "success": False,
                "error": str(e),
                "data": [],
            }

    return {"widget_data": widget_data}


# ============================================================================
# SQL Builder Endpoints
# ============================================================================


@router.get(
    "/dashboards/sql-builder/allowed-tables",
    response_model=dict,
    summary="List allowed tables for SQL builder",
)
async def get_sql_allowed_tables(
    current_user: User = Depends(get_current_user),
):
    """Return the list of allowed tables and columns for the SQL builder."""
    tables = get_allowed_tables()
    result = []
    for table_name, columns in tables.items():
        result.append(AllowedTable(
            name=table_name,
            columns=[AllowedColumn(name=col, type="VARCHAR") for col in columns],
        ))
    return {"tables": result}


@router.post(
    "/dashboards/sql-builder/execute",
    response_model=SqlQueryResponse,
    summary="Execute a validated SQL query",
)
async def execute_sql_query(
    payload: SqlQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute a validated SQL query and return results."""
    try:
        result = await execute_query(db, payload.sql, payload.params)
        return SqlQueryResponse(
            rows=result["rows"],
            row_count=result["row_count"],
            columns=result["columns"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query execution failed: {str(e)}")
