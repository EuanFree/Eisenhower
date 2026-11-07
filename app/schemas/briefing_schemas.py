"""Briefing Pack Export Schemas.

This module defines Pydantic schemas for the automated executive briefing
deck generator.  The briefing service produces standardized PowerPoint
(.pptx) presentations containing programme health metrics, schedule
visualizations, EVM S-Curves, risk tornado charts, and risk matrices.

Briefing Deck Structure
~~~~~~~~~~~~~~~~~~~~~~~

Each briefing deck follows a fixed 5-slide template aligned with defence
programme reporting conventions:

1. **Programme Master Health** — Executive summary with RAG status dials,
   overall CPI/SPI indices, and active critical path summary.

2. **Comparative Gantt Snapshot** — Top-level WBS nodes with live forecast
   bars, B₀ contract baseline tracks, and jagged status-date drop line.

3. **Cumulative EVM S-Curve** — Historical and projected PV, EV, and AC
   curves through contract completion.

4. **Top 5 Schedule Drivers** — Tornado chart of Monte Carlo Criticality
   Index (CI) ranking the primary risk drivers.

5. **5×5 Programme Risk Matrix** — Active risks plotted by likelihood vs
   consequence with mitigation owners.

Security
~~~~~~~~

Every slide is automatically stamped with the programme's classification
marking (e.g., "OFFICIAL-SENSITIVE // UK EYES ONLY") at the top and bottom.
Export-control disclaimers appear on the title slide.
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class BriefingGenerateRequest(BaseModel):
    """Request schema for generating an executive briefing deck.

    Attributes
    ----------
    project_id : str
        UUID of the root PortfolioNode for the programme being briefed.
    status_date : str
        Reporting cut-off date in ISO format (e.g., '2026-10-24').
        All metrics are calculated as of this date.
    slide_selection : list[int] or None
        Optional list of slide numbers to include (1–5).
        If None, all 5 slides are generated.
        Example: [1, 3, 5] generates only slides 1, 3, and 5.
    title_override : str or None
        Optional custom title for the briefing deck.
        If None, the programme name is used automatically.
    classification_override : str or None
        Optional override for the classification marking.
        If None, the programme's highest classification is used.
    include_export_disclaimer : bool
        Whether to include export-control disclaimer on the title slide.
        Default is True.
    """

    project_id: str = Field(
        ..., description="UUID of the root PortfolioNode for the programme"
    )
    status_date: str = Field(
        ..., description="Reporting cut-off date (ISO format, e.g. '2026-10-24')"
    )
    slide_selection: Optional[List[int]] = Field(
        default=None,
        description="Slide numbers to include (1-5). None = all slides.",
    )
    title_override: Optional[str] = Field(
        default=None,
        description="Custom title for the briefing deck",
    )
    classification_override: Optional[str] = Field(
        default=None,
        description="Override classification marking",
    )
    include_export_disclaimer: bool = Field(
        default=True,
        description="Include export-control disclaimer on title slide",
    )


class BriefingSlideInfo(BaseModel):
    """Metadata about a single generated slide.

    Attributes
    ----------
    slide_number : int
        The slide number (1–5).
    slide_title : str
        Title of the slide.
    data_points : int
        Number of data points rendered on this slide.
    """

    slide_number: int
    slide_title: str
    data_points: int = 0


class BriefingGenerateResponse(BaseModel):
    """Response schema for briefing deck generation.

    Attributes
    ----------
    deck_id : str
        Unique identifier for the generated briefing deck.
    title : str
        Title of the briefing deck.
    slide_count : int
        Number of slides in the deck.
    slides : list[BriefingSlideInfo]
        Metadata for each generated slide.
    file_size_bytes : int
        Size of the generated .pptx file in bytes.
    classification : str
        Classification marking applied to all slides.
    generated_at : str
        Timestamp when the deck was generated.
    message : str
        Human-readable summary of the generation result.
    """

    deck_id: str
    title: str
    slide_count: int
    slides: List[BriefingSlideInfo] = []
    file_size_bytes: int
    classification: str
    generated_at: str
    message: str
