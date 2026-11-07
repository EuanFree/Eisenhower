"""IPMR/CPR EVM Report Export Router.

This module provides the API endpoints for generating and exporting
statutory Earned Value Management (EVM) reports compliant with the
Integrated Program Management Report (IPMR) / Cost Performance Report
(CPR) Formats 1 through 5.

Endpoints
~~~~~~~~~

All endpoints are JWT-authenticated and require the caller to have
sufficient clearance to access the programme data.

- **GET /ipmr/format1**: Emits Format 1 WBS spreadsheet for the selected
  reporting month.  Returns BCWS (PV), BCWP (EV), and ACWP (AC) data
  for each WBS element with derived variances and indices.

- **GET /ipmr/format5**: Emits variance narrative report pre-populated
  with active blocker logs.  Auto-extracts tasks exceeding predefined
  variance thresholds and generates Problem/Cause, Impact, and
  Corrective Action Plan narratives.

Export Formats
~~~~~~~~~~~~~~

Reports can be exported in two formats:

- **XLSX** (default): OpenPyXL-formatted spreadsheet with defence table
  styling, locked header bands, and formula integrity.

- **PDF**: Hardened PDF export with embedded vector styles for
  executive submission.

Usage
~~~~~

    # Generate Format 1 report as Excel
    GET /api/v1/reports/evm/ipmr/format1?project_id={uuid}&reporting_period=2026-10&status_date=2026-10-24

    # Generate Format 5 report as PDF
    GET /api/v1/reports/evm/ipmr/format5?project_id={uuid}&reporting_period=2026-10&status_date=2026-10-24&export_format=pdf
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, PortfolioNode
from app.services.ipmr_generator import IPMRGenerator
from app.schemas.ipmr_schemas import IPMRExportResponse

router = APIRouter()


@router.get("/ipmr/format1")
def generate_format1(
    project_id: UUID = Query(..., description="UUID of the root PortfolioNode for the programme"),
    reporting_period: str = Query(..., description="Reporting month in YYYY-MM format (e.g., 2026-10)"),
    status_date: str = Query(..., description="Status date for the report in ISO format"),
    export_format: str = Query("xlsx", description="Export format: 'xlsx' or 'pdf'"),
    currency_code: str = Query("GBP", description="Currency code (e.g., GBP, USD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and export IPMR Format 1 WBS time-phased matrix report.

    Format 1 is the core EVM reporting table.  It presents time-phased
    cost data for each WBS element, showing Budgeted Cost for Work
    Scheduled (BCWS/PV), Budgeted Cost for Work Performed (BCWP/EV),
    and Actual Cost of Work Performed (ACWP/AC).

    The report derives Cost Variance (CV = EV - AC), Schedule Variance
    (SV = EV - PV), Variance at Completion (VAC = BAC - EAC), and
    percentage calculations (CPI, SPI).

    Parameters
    ----------
    project_id : UUID
        UUID of the root PortfolioNode for the programme.
    reporting_period : str
        Reporting month in 'YYYY-MM' format.
    status_date : str
        Status date for the report in ISO format.
    export_format : str
        Export format: 'xlsx' (default) or 'pdf'.
    currency_code : str
        Currency code (default 'GBP').
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    Response
        File download with appropriate MIME type and content disposition.

    Raises
    ------
    HTTPException
        404 if project not found, 500 on generation error.
    """
    try:
        generator = IPMRGenerator(db)
        report = generator.generate_format1(
            project_id=project_id,
            reporting_period=reporting_period,
            status_date=status_date,
            currency_code=currency_code,
        )

        if export_format.lower() == "pdf":
            file_content = generator.export_pdf(report, currency_code)
            media_type = "application/pdf"
            extension = "pdf"
        else:
            file_content = generator.export_xlsx(report, currency_code)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            extension = "xlsx"

        filename = f"IPMR_Format1_{reporting_period}_{project_id}.{extension}"

        return Response(
            content=file_content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Report-Format": "FORMAT1",
                "X-Row-Count": str(len(report.rows)),
            },
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@router.get("/ipmr/format5")
def generate_format5(
    project_id: UUID = Query(..., description="UUID of the root PortfolioNode for the programme"),
    reporting_period: str = Query(..., description="Reporting month in YYYY-MM format"),
    status_date: str = Query(..., description="Status date for the report in ISO format"),
    export_format: str = Query("xlsx", description="Export format: 'xlsx' or 'pdf'"),
    cost_variance_threshold: float = Query(25000.0, description="Cost variance threshold in absolute amount"),
    schedule_variance_threshold: float = Query(10.0, description="Schedule variance threshold in percentage"),
    currency_code: str = Query("GBP", description="Currency code"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and export IPMR Format 5 Variance Analysis Narrative report.

    Format 5 auto-extracts tasks exceeding predefined variance thresholds
    and pre-populates the standard defence variance reporting template
    with Problem/Cause, Impact, and Corrective Action Plan.

    Thresholds:
    - Cost Variance: Tasks with |CV| > cost_variance_threshold are flagged.
    - Schedule Variance: Tasks with |SV|/PV > schedule_variance_threshold%
      are flagged.

    Parameters
    ----------
    project_id : UUID
        UUID of the root PortfolioNode.
    reporting_period : str
        Reporting month in 'YYYY-MM' format.
    status_date : str
        Status date for the report.
    export_format : str
        Export format: 'xlsx' (default) or 'pdf'.
    cost_variance_threshold : float
        Cost variance threshold (default £25,000).
    schedule_variance_threshold : float
        Schedule variance threshold percentage (default 10%).
    currency_code : str
        Currency code (default 'GBP').
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    Response
        File download with appropriate MIME type.

    Raises
    ------
    HTTPException
        404 if project not found, 500 on generation error.
    """
    try:
        generator = IPMRGenerator(db)
        report = generator.generate_format5(
            project_id=project_id,
            reporting_period=reporting_period,
            status_date=status_date,
            cost_variance_threshold=cost_variance_threshold,
            schedule_variance_threshold=schedule_variance_threshold,
        )

        if export_format.lower() == "pdf":
            file_content = generator.export_pdf(report, currency_code)
            media_type = "application/pdf"
            extension = "pdf"
        else:
            file_content = generator.export_xlsx(report, currency_code)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            extension = "xlsx"

        filename = f"IPMR_Format5_{reporting_period}_{project_id}.{extension}"

        return Response(
            content=file_content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Report-Format": "FORMAT5",
                "X-Variance-Items": str(len(report.variance_items)),
            },
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")
