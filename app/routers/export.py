"""Export API Router.

This module provides API endpoints for exporting GUI views to PNG images
and PowerPoint slides, and for generating template-based reports in
Word and PowerPoint formats.

Endpoints
~~~~~~~~~

- ``POST /api/v1/export/view`` — Export a GUI view to PNG or PowerPoint.
- ``POST /api/v1/export/report`` — Generate a template-based report.
- ``GET /api/v1/export/templates`` — List available report templates.
- ``GET /api/v1/export/view-types`` — List supported view types.

Security
~~~~~~~~

All endpoints require JWT authentication.  The caller must have sufficient
clearance to access the data being exported.  Classification markings are
automatically applied to exported documents.

Usage
~~~~~

    # Export a view to PNG
    POST /api/v1/export/view
    {
        "view_type": "dashboard",
        "format": "png",
        "project_id": "uuid"
    }

    # Generate a Word report
    POST /api/v1/export/report
    {
        "template_type": "programme_status",
        "format": "docx",
        "project_id": "uuid"
    }
"""
from datetime import date
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, PortfolioNode
from app.schemas.export_schemas import (
    ViewExportRequest,
    ViewExportResponse,
    ReportTemplateRequest,
    ReportTemplateResponse,
    ReportSectionInfo,
    TemplateCatalogEntry,
    TemplateCatalogResponse,
    ViewType,
    ExportFormat,
)
from app.services.view_export import view_export_service
from app.services.report_template import report_template_service, TEMPLATE_DEFINITIONS

router = APIRouter()


@router.post("/view")
def export_view(
    request: ViewExportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export a GUI view to PNG or PowerPoint format.

    Captures the current state of a GUI view and exports it as a PNG image
    or PowerPoint slide. The export includes classification stamps and
    follows defence formatting conventions.

    Parameters
    ----------
    request : ViewExportRequest
        The export request containing view type, format, and options.
    current_user : User
        The authenticated user requesting the export.
    db : Session
        Database session.

    Returns
    -------
    Response
        A downloadable file (PNG or PPTX) with appropriate headers.

    Raises
    ------
    HTTPException
        400 if the format is not supported for view export.
        404 if the project is not found.
        403 if the user lacks clearance.
        422 if the request parameters are invalid.
    """
    # Validate format
    if request.format not in (ExportFormat.PNG, ExportFormat.PPTX):
        raise HTTPException(
            status_code=400,
            detail=f"Format {request.format.value} is not supported for view export. Use 'png' or 'pptx'.",
        )

    # Parse project ID if provided
    project_uuid = None
    if request.project_id:
        try:
            project_uuid = UUID(request.project_id)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid project_id format: {request.project_id}",
            )

        # Verify project exists
        project = db.query(PortfolioNode).filter(
            PortfolioNode.id == project_uuid
        ).first()
        if project is None:
            raise HTTPException(
                status_code=404,
                detail=f"Project {request.project_id} not found",
            )

    # Parse dashboard ID if provided
    dashboard_uuid = None
    if request.dashboard_id:
        try:
            dashboard_uuid = UUID(request.dashboard_id)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid dashboard_id format: {request.dashboard_id}",
            )

    # Generate export
    try:
        file_bytes, metadata = view_export_service.export_view(
            view_type=request.view_type,
            format=request.format,
            project_id=project_uuid,
            dashboard_id=dashboard_uuid,
            db=db,
            title_override=request.title_override,
            include_classification=request.include_classification,
            width=request.width or 1920,
            height=request.height or 1080,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"View export failed: {str(e)}",
        )

    # Determine filename and media type
    if request.format == ExportFormat.PNG:
        filename = f"{metadata['title'].replace(' ', '_')[:50]}.png"
        media_type = "image/png"
    else:
        filename = f"{metadata['title'].replace(' ', '_')[:50]}.pptx"
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Export-Id": metadata["export_id"],
            "X-Export-Format": metadata["format"],
        },
    )


@router.post("/report")
def generate_report(
    request: ReportTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a template-based report in Word or PowerPoint format.

    Produces a structured report using predefined templates. Reports include
    classification stamps, export-control disclaimers, and follow defence
    formatting conventions.

    Parameters
    ----------
    request : ReportTemplateRequest
        The report generation request containing template type, format,
        and options.
    current_user : User
        The authenticated user requesting the report.
    db : Session
        Database session.

    Returns
    -------
    Response
        A downloadable file (DOCX or PPTX) with appropriate headers.

    Raises
    ------
    HTTPException
        400 if the format is not supported for reports.
        404 if the project is not found.
        422 if the request parameters are invalid.
    """
    # Validate format
    if request.format not in (ExportFormat.DOCX, ExportFormat.PPTX):
        raise HTTPException(
            status_code=400,
            detail=f"Format {request.format.value} is not supported for reports. Use 'docx' or 'pptx'.",
        )

    # Parse project ID if provided
    project_uuid = None
    if request.project_id:
        try:
            project_uuid = UUID(request.project_id)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid project_id format: {request.project_id}",
            )

        # Verify project exists
        project = db.query(PortfolioNode).filter(
            PortfolioNode.id == project_uuid
        ).first()
        if project is None:
            raise HTTPException(
                status_code=404,
                detail=f"Project {request.project_id} not found",
            )

    # Parse status date if provided
    status_date = None
    if request.status_date:
        try:
            status_date = date.fromisoformat(request.status_date)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid status_date format: {request.status_date}",
            )

    # Generate report
    try:
        file_bytes, metadata = report_template_service.generate_report(
            template_type=request.template_type,
            format=request.format,
            project_id=project_uuid,
            status_date=status_date,
            db=db,
            title_override=request.title_override,
            classification_override=request.classification_override,
            include_export_disclaimer=request.include_export_disclaimer,
            sections=request.sections,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {str(e)}",
        )

    # Determine filename and media type
    if request.format == ExportFormat.DOCX:
        filename = f"{metadata['title'].replace(' ', '_')[:50]}.docx"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        filename = f"{metadata['title'].replace(' ', '_')[:50]}.pptx"
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Report-Id": metadata["report_id"],
            "X-Report-Format": metadata["format"],
            "X-Report-Classification": metadata["classification"],
        },
    )


@router.get("/templates")
def list_templates(
    current_user: User = Depends(get_current_user),
):
    """List available report templates.

    Returns the catalog of available report templates with their
    descriptions, supported formats, and sections.

    Parameters
    ----------
    current_user : User
        The authenticated user.

    Returns
    -------
    TemplateCatalogResponse
        List of available report templates.
    """
    templates = []
    for template_type, definition in TEMPLATE_DEFINITIONS.items():
        templates.append(TemplateCatalogEntry(
            template_type=template_type.value,
            name=definition["name"],
            description=definition["description"],
            supported_formats=["docx", "pptx"],
            sections=definition["sections"],
        ))

    return TemplateCatalogResponse(templates=templates)


@router.get("/view-types")
def list_view_types(
    current_user: User = Depends(get_current_user),
):
    """List supported view types for export.

    Returns the list of all supported GUI view types that can be exported.

    Parameters
    ----------
    current_user : User
        The authenticated user.

    Returns
    -------
    dict
        Dictionary with list of view types.
    """
    view_types = [vt.value for vt in ViewType]
    return {"view_types": view_types}
