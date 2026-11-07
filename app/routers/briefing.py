"""Briefing Pack Export Router.

This module provides the API endpoint for generating executive briefing
decks in PowerPoint (.pptx) format.  The briefing generator produces
standardized presentations containing programme health metrics, schedule
visualizations, EVM S-Curves, risk tornado charts, and risk matrices.

Endpoint
~~~~~~~~

POST /api/v1/reports/briefing/generate-deck

Accepts a project ID, reporting cut-off date, and optional slide selection
flags.  Returns a downloadable .pptx briefing deck with defence classification
stamps on every slide.

Security
~~~~~~~~

All endpoints require JWT authentication.  The caller must have sufficient
clearance to access the programme data being briefed.  Classification
markings are automatically derived from the programme's highest-classified
node and stamped on every slide.

Slide Selection
~~~~~~~~~~~~~~~

The ``slide_selection`` parameter allows the caller to request specific
slides rather than the full 5-slide deck.  For example, ``[1, 3]`` generates
only the Programme Master Health and EVM S-Curve slides.

References
~~~~~~~~~~

- IPMR/CPR Formats 1–5 (ANSI/EIA-748B)
- DoD 5000.02-M: Defense Acquisition Program Management
"""
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, PortfolioNode, UniversalBreakdownNode
from app.schemas.briefing_schemas import (
    BriefingGenerateRequest,
    BriefingGenerateResponse,
    BriefingSlideInfo,
)
from app.services.briefing_generator import BriefingGenerator

router = APIRouter()


@router.post("/generate-deck")
def generate_briefing_deck(
    request: BriefingGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate an executive briefing deck for a programme.

    Produces a standardized PowerPoint (.pptx) presentation containing
    up to 5 slides:

    1. **Programme Master Health** — Executive summary with RAG status,
       CPI/SPI, and critical path summary.
    2. **Comparative Gantt Snapshot** — Top-level WBS with baseline
       comparison and status-date drop line.
    3. **Cumulative EVM S-Curve** — PV, EV, and AC curves through
       contract completion.
    4. **Top 5 Schedule Drivers** — Monte Carlo Criticality Index
       tornado chart.
    5. **5×5 Programme Risk Matrix** — Active risks by likelihood vs
       consequence.

    Every slide is stamped with the programme's classification marking
    at the top and bottom.  Export-control disclaimers appear on the
    title slide.

    Parameters
    ----------
    request : BriefingGenerateRequest
        The generation request containing project ID, status date,
        and optional slide selection.
    current_user : User
        The authenticated user requesting the briefing.
    db : Session
        Database session.

    Returns
    -------
    Response
        A downloadable .pptx file with appropriate headers.

    Raises
    ------
    HTTPException
        404 if the project is not found.
        403 if the user lacks clearance to access the programme.
        422 if the request parameters are invalid.
    """
    # Validate project_id
    try:
        project_uuid = UUID(request.project_id)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid project_id format: {request.project_id}",
        )

    # Parse status date
    try:
        status_date = date.fromisoformat(request.status_date)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status_date format: {request.status_date}",
        )

    # Load root node
    root_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == project_uuid
    ).first()

    if root_node is None:
        raise HTTPException(
            status_code=404,
            detail=f"PortfolioNode {request.project_id} not found",
        )

    # Basic clearance check — user must have at least OFFICIAL clearance
    # to request a briefing (ABAC is applied per-node in the generator)
    if current_user.clearance_level is None:
        raise HTTPException(
            status_code=403,
            detail="User does not have a security clearance level assigned",
        )

    # Generate the briefing deck
    generator = BriefingGenerator()

    try:
        pptx_bytes, metadata = generator.generate(
            db=db,
            project_id=project_uuid,
            status_date=status_date,
            slide_selection=request.slide_selection,
            title_override=request.title_override,
            classification_override=request.classification_override,
            include_export_disclaimer=request.include_export_disclaimer,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Briefing generation failed: {str(e)}",
        )

    # Build response metadata
    slide_info = [
        BriefingSlideInfo(
            slide_number=s["slide_number"],
            slide_title=s["slide_title"],
            data_points=s["data_points"],
        )
        for s in metadata["slides"]
    ]

    response_meta = BriefingGenerateResponse(
        deck_id=metadata["deck_id"],
        title=metadata["title"],
        slide_count=metadata["slide_count"],
        slides=slide_info,
        file_size_bytes=metadata["file_size_bytes"],
        classification=metadata["classification"],
        generated_at=metadata["generated_at"],
        message=metadata["message"],
    )

    # Return the .pptx file as a downloadable response
    filename = f"briefing_{metadata['deck_id'][:8]}.pptx"

    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Briefing-Deck-Id": metadata["deck_id"],
            "X-Briefing-Classification": metadata["classification"],
            "X-Briefing-Slide-Count": str(metadata["slide_count"]),
        },
    )
