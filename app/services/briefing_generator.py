"""Executive Briefing Pack Generator Service.

This module generates standardized operational briefing decks in PowerPoint
(.pptx) format using python-pptx.  Each deck contains up to 5 slides
covering programme health, schedule visualization, EVM S-Curves, risk
tornado charts, and risk matrices.

Slide Templates
~~~~~~~~~~~~~~~

1. **Programme Master Health** — Executive summary with RAG status dials,
   overall CPI/SPI indices, active critical path task count, and key metrics.

2. **Comparative Gantt Snapshot** — Top-level WBS nodes rendered as horizontal
   bars showing live forecast dates alongside B₀ contract baseline tracks.
   A jagged status-date drop line indicates ahead/behind schedule status.

3. **Cumulative EVM S-Curve** — Line chart plotting historical and projected
   Planned Value (PV), Earned Value (EV), and Actual Cost (AC) curves through
   contract completion.

4. **Top 5 Schedule Drivers & Tornado Chart** — Horizontal bar chart ranking
   activities by Monte Carlo Criticality Index (CI), identifying the primary
   drivers of programme schedule risk.

5. **5×5 Programme Risk Matrix** — Grid plotting active risks by likelihood
   (1–5) vs. consequence (1–5) with assigned mitigation owners.

Defence Classification & Formatting
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Every slide is automatically stamped with the programme's classification
marking at the top and bottom (e.g., "OFFICIAL-SENSITIVE // UK EYES ONLY").
Export-control disclaimers are placed on the title slide.

Color Coding
~~~~~~~~~~~~

RAG (Red-Amber-Green) status is determined by CPI and SPI thresholds:

- **Green**: CPI/SPI ≥ 0.95 — On track
- **Amber**: 0.90 ≤ CPI/SPI < 0.95 — At risk
- **Red**: CPI/SPI < 0.90 — Off track

Classification colors follow the Defence Design Token System:

- OFFICIAL: Sky blue (#38BDF8)
- OFFICIAL_SENSITIVE: Cyan (#22D3EE)
- SECRET: Red (#F87171)
- TOP_SECRET: Purple (#C084FC)

Data Sources
~~~~~~~~~~~~

The generator queries live database state from:

- PortfolioNode: EVM fields (BAC, PV, EV, AC), dates, percent_complete
- NodeBlocker: Active blockers for RAG status
- ResourceAssignment: Resource allocation data
- ActivityDurationDistribution: Monte Carlo criticality indices
- PortfolioBaseline: B₀ baseline comparison data
- ForensicAuditLog: Recent activity for context

References
~~~~~~~~~~

- IPMR/CPR Formats 1–5 (ANSI/EIA-748B)
- DoD 5000.02-M: Defense Acquisition Program Management
- UK Defence Standard 00-056: Defence Project Management
"""
import io
import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.chart.data import CategoryChartData
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc

from app.models.models import (
    UniversalBreakdownNode,
    PortfolioNode,
    NodeBlocker,
    BlockerSeverity,
    ResourceAssignment,
    DependencyLink,
    ActivityDurationDistribution,
    PortfolioBaseline,
    BaselineNodeSnapshot,
    SecurityClassification,
)


# ============================================================================
# Color Constants
# ============================================================================

# Classification colors
CLASSIFICATION_COLORS = {
    "OFFICIAL": RGBColor(0x38, 0xBD, 0xF8),
    "OFFICIAL_SENSITIVE": RGBColor(0x22, 0xD3, 0xEE),
    "SECRET": RGBColor(0xF8, 0x71, 0x71),
    "TOP_SECRET": RGBColor(0xC0, 0x84, 0xFC),
}

# RAG status colors
RAG_GREEN = RGBColor(0x34, 0xD3, 0x99)
RAG_AMBER = RGBColor(0xFB, 0xBF, 0x24)
RAG_RED = RGBColor(0xF8, 0x71, 0x71)

# Theme colors
COLOR_BG_DARK = RGBColor(0x1E, 0x29, 0x3B)
COLOR_BG_SURFACE = RGBColor(0x0F, 0x17, 0x2A)
COLOR_TEXT_PRIMARY = RGBColor(0xF8, 0xFA, 0xFC)
COLOR_TEXT_MUTED = RGBColor(0x94, 0xA3, 0xB8)
COLOR_BORDER = RGBColor(0x47, 0x55, 0x69)

# Baseline colors
BASELINE_B0_GREEN = RGBColor(0x34, 0xD3, 0x99)
BASELINE_BCURR_AMBER = RGBColor(0xFB, 0xBF, 0x24)


# ============================================================================
# Helper Functions
# ============================================================================

def _get_rag_color(value: float) -> RGBColor:
    """Return RAG color based on CPI/SPI value.

    Parameters
    ----------
    value : float
        CPI or SPI value.

    Returns
    -------
    RGBColor
        Green (≥0.95), Amber (0.90–0.95), or Red (<0.90).
    """
    if value >= 0.95:
        return RAG_GREEN
    elif value >= 0.90:
        return RAG_AMBER
    else:
        return RAG_RED


def _get_rag_label(value: float) -> str:
    """Return RAG status label based on CPI/SPI value."""
    if value >= 0.95:
        return "GREEN"
    elif value >= 0.90:
        return "AMBER"
    else:
        return "RED"


def _classification_marking(node: PortfolioNode) -> str:
    """Build the full classification marking string for a node.

    Parameters
    ----------
    node : PortfolioNode
        The node to extract classification from.

    Returns
    -------
    str
        Classification marking string (e.g., 'SECRET // UK EYES ONLY').
    """
    classification = node.security_classification or "OFFICIAL"
    caveats = node.caveats or []
    marking = str(classification)
    if caveats:
        caveat_str = " // ".join(caveats)
        marking = f"{marking} // {caveat_str}"
    return marking


def _highest_classification(nodes: List[PortfolioNode]) -> str:
    """Determine the highest classification among a list of nodes.

    Parameters
    ----------
    nodes : list[PortfolioNode]
        List of nodes to check.

    Returns
    -------
    str
        The highest classification level found.
    """
    hierarchy = ["OFFICIAL", "OFFICIAL_SENSITIVE", "SECRET", "TOP_SECRET"]
    highest = "OFFICIAL"
    for node in nodes:
        cls = str(node.security_classification or "OFFICIAL")
        if cls in hierarchy and hierarchy.index(cls) > hierarchy.index(highest):
            highest = cls
    return highest


def _collect_caveats(nodes: List[PortfolioNode]) -> List[str]:
    """Collect all unique caveats from a list of nodes."""
    caveats = set()
    for node in nodes:
        if node.caveats:
            caveats.update(node.caveats)
    return sorted(caveats)


def _format_currency(amount, currency: str = "GBP") -> str:
    """Format a monetary amount with currency symbol.

    Parameters
    ----------
    amount : Decimal or float or None
        The amount to format.
    currency : str
        Currency code (default 'GBP').

    Returns
    -------
    str
        Formatted currency string.
    """
    if amount is None:
        return "N/A"
    symbols = {"GBP": "£", "USD": "$", "EUR": "€"}
    symbol = symbols.get(currency, currency + " ")
    try:
        val = float(Decimal(str(amount)))
    except (ValueError, TypeError):
        return "N/A"
    if val >= 1_000_000:
        return f"{symbol}{val / 1_000_000:.1f}M"
    elif val >= 1_000:
        return f"{symbol}{val / 1_000:.1f}K"
    else:
        return f"{symbol}{val:,.2f}"


def _add_classification_bands(slide, classification: str, caveats: List[str]):
    """Add top and bottom classification bands to a slide.

    Every slide in a classified briefing must display the security
    classification at the top and bottom edges.

    Parameters
    ----------
    slide : pptx.slide.Slide
        The slide to add bands to.
    classification : str
        Classification level string.
    caveats : list[str]
        List of caveat strings (e.g., ['UK EYES ONLY']).
    """
    marking = classification
    if caveats:
        marking = f"{classification} // {' // '.join(caveats)}"

    color = CLASSIFICATION_COLORS.get(classification, CLASSIFICATION_COLORS["OFFICIAL"])

    # Top band
    top_box = slide.shapes.add_textbox(
        Inches(0), Inches(0), Inches(13.33), Inches(0.3)
    )
    top_tf = top_box.text_frame
    top_tf.word_wrap = True
    top_para = top_tf.paragraphs[0]
    top_para.alignment = PP_ALIGN.CENTER
    top_run = top_para.add_run()
    top_run.text = marking.upper()
    top_run.font.size = Pt(10)
    top_run.font.bold = True
    top_run.font.color.rgb = COLOR_BG_DARK
    top_box.fill.solid()
    top_box.fill.fore_color.rgb = color

    # Bottom band
    bottom_box = slide.shapes.add_textbox(
        Inches(0), Inches(7.0), Inches(13.33), Inches(0.3)
    )
    bottom_tf = bottom_box.text_frame
    bottom_tf.word_wrap = True
    bottom_para = bottom_tf.paragraphs[0]
    bottom_para.alignment = PP_ALIGN.CENTER
    bottom_run = bottom_para.add_run()
    bottom_run.text = marking.upper()
    bottom_run.font.size = Pt(10)
    bottom_run.font.bold = True
    bottom_run.font.color.rgb = COLOR_BG_DARK
    bottom_box.fill.solid()
    bottom_box.fill.fore_color.rgb = color


def _set_slide_background(slide):
    """Set the dark operational background color on a slide.

    Applies the SCIF dark theme background color to the entire slide
    background, ensuring consistent visual appearance across all slides
    in the briefing deck.

    Parameters
    ----------
    slide : pptx.slide.Slide
        The slide whose background is being set.
    """
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = COLOR_BG_SURFACE


def _add_slide_title(slide, title: str, subtitle: str = ""):
    """Add a styled title to a slide.

    Parameters
    ----------
    slide : pptx.slide.Slide
        The slide to add the title to.
    title : str
        Main title text.
    subtitle : str
        Optional subtitle text.
    """
    _set_slide_background(slide)

    title_box = slide.shapes.add_textbox(
        Inches(0.5), Inches(0.4), Inches(12.33), Inches(0.6)
    )
    title_tf = title_box.text_frame
    title_tf.word_wrap = True
    title_para = title_tf.paragraphs[0]
    title_run = title_para.add_run()
    title_run.text = title
    title_run.font.size = Pt(24)
    title_run.font.bold = True
    title_run.font.color.rgb = COLOR_TEXT_PRIMARY

    if subtitle:
        sub_box = slide.shapes.add_textbox(
            Inches(0.5), Inches(1.0), Inches(12.33), Inches(0.4)
        )
        sub_tf = sub_box.text_frame
        sub_tf.word_wrap = True
        sub_para = sub_tf.paragraphs[0]
        sub_run = sub_para.add_run()
        sub_run.text = subtitle
        sub_run.font.size = Pt(14)
        sub_run.font.color.rgb = COLOR_TEXT_MUTED


# ============================================================================
# Slide 1: Programme Master Health
# ============================================================================

def _build_slide1_health(slide, db: Session, root_node: PortfolioNode,
                         all_nodes: List[PortfolioNode], status_date: date,
                         classification: str, caveats: List[str]):
    """Build Slide 1: Programme Master Health.

    Displays executive summary metrics, RAG status dials, overall CPI/SPI,
    and active Critical Path summary.

    Parameters
    ----------
    slide : pptx.slide.Slide
        The slide to populate.
    db : Session
        Database session.
    root_node : PortfolioNode
        Root portfolio node.
    all_nodes : list[PortfolioNode]
        All descendant nodes.
    status_date : date
        Reporting status date.
    classification : str
        Classification marking.
    caveats : list[str]
        Caveat list.
    """
    _add_slide_title(
        slide,
        "Programme Master Health",
        f"Status as of {status_date.strftime('%d %B %Y')}"
    )
    _add_classification_bands(slide, classification, caveats)

    # Calculate aggregate EVM metrics
    total_bac = Decimal("0")
    total_pv = Decimal("0")
    total_ev = Decimal("0")
    total_ac = Decimal("0")

    for node in all_nodes:
        total_bac += Decimal(str(node.bac_cost or 0))
        total_pv += Decimal(str(node.planned_value or 0))
        total_ev += Decimal(str(node.earned_value or 0))
        total_ac += Decimal(str(node.actual_cost or 0))

    cpi = float(total_ev / total_ac) if total_ac > 0 else 1.0
    spi = float(total_ev / total_pv) if total_pv > 0 else 1.0
    eac = float(total_bac / cpi) if cpi > 0 else float(total_bac)
    vac = float(total_bac - eac)

    # Count active blockers
    active_blockers = db.query(NodeBlocker).filter(
        NodeBlocker.resolved_at.is_(None)
    ).all()
    critical_blockers = [b for b in active_blockers if b.severity == BlockerSeverity.CRITICAL]

    # Count critical path tasks (TF <= 0)
    critical_count = 0
    for node in all_nodes:
        schedule = node.custom_attributes.get("schedule", {}) if node.custom_attributes else {}
        tf = schedule.get("total_float", 999)
        if tf is not None and tf <= 0:
            critical_count += 1

    # Overall percent complete (weighted by BAC)
    if total_bac > 0:
        weighted_complete = Decimal("0")
        for node in all_nodes:
            node_bac = Decimal(str(node.bac_cost or 0))
            if node_bac > 0:
                weighted_complete += node_bac * Decimal(str(node.percent_complete or 0)) / Decimal("100")
        overall_pct = float(weighted_complete / total_bac)
    else:
        overall_pct = 0.0

    # Currency
    currency = root_node.currency_code or "GBP"

    # Metrics grid — 2×3 layout
    metrics = [
        ("Overall Progress", f"{overall_pct:.1f}%", _get_rag_color(overall_pct / 100.0 if overall_pct > 0 else 1.0)),
        ("Cost Performance (CPI)", f"{cpi:.2f}", _get_rag_color(cpi)),
        ("Schedule Performance (SPI)", f"{spi:.2f}", _get_rag_color(spi)),
        ("Budget at Completion", _format_currency(total_bac, currency), COLOR_TEXT_PRIMARY),
        ("Estimate at Completion", _format_currency(eac, currency), _get_rag_color(cpi)),
        ("Variance at Completion", _format_currency(vac, currency), RAG_GREEN if vac >= 0 else RAG_RED),
    ]

    # Additional metrics row
    extra_metrics = [
        ("Critical Path Tasks", str(critical_count), RAG_RED if critical_count > 0 else RAG_GREEN),
        ("Active Blockers", str(len(active_blockers)), RAG_RED if len(active_blockers) > 0 else RAG_GREEN),
        ("Critical Blockers", str(len(critical_blockers)), RAG_RED if len(critical_blockers) > 0 else RAG_GREEN),
    ]

    # Render metrics as cards
    card_width = Inches(3.8)
    card_height = Inches(1.2)
    x_start = Inches(0.5)
    y_start = Inches(1.6)
    gap = Inches(0.2)

    for idx, (label, value, color) in enumerate(metrics):
        col = idx % 3
        row = idx // 3
        x = x_start + col * (card_width + gap)
        y = y_start + row * (card_height + gap)

        card = slide.shapes.add_shape(
            1, x, y, card_width, card_height  # msoShapeRectangle
        )
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_BG_DARK
        card.line.color.rgb = color
        card.line.width = Pt(2)

        # Label
        label_box = slide.shapes.add_textbox(
            x + Inches(0.15), y + Inches(0.1), card_width - Inches(0.3), Inches(0.35)
        )
        label_tf = label_box.text_frame
        label_tf.word_wrap = True
        label_para = label_tf.paragraphs[0]
        label_run = label_para.add_run()
        label_run.text = label
        label_run.font.size = Pt(10)
        label_run.font.color.rgb = COLOR_TEXT_MUTED

        # Value
        val_box = slide.shapes.add_textbox(
            x + Inches(0.15), y + Inches(0.45), card_width - Inches(0.3), Inches(0.6)
        )
        val_tf = val_box.text_frame
        val_tf.word_wrap = True
        val_para = val_tf.paragraphs[0]
        val_run = val_para.add_run()
        val_run.text = value
        val_run.font.size = Pt(20)
        val_run.font.bold = True
        val_run.font.color.rgb = color

    # Extra metrics row
    y_extra = y_start + 2 * (card_height + gap)
    for idx, (label, value, color) in enumerate(extra_metrics):
        x = x_start + idx * (card_width + gap)
        card = slide.shapes.add_shape(
            1, x, y_extra, card_width, Inches(0.8)
        )
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_BG_DARK
        card.line.color.rgb = color
        card.line.width = Pt(2)

        label_box = slide.shapes.add_textbox(
            x + Inches(0.15), y_extra + Inches(0.05), card_width - Inches(0.3), Inches(0.3)
        )
        label_tf = label_box.text_frame
        label_tf.word_wrap = True
        label_para = label_tf.paragraphs[0]
        label_run = label_para.add_run()
        label_run.text = label
        label_run.font.size = Pt(10)
        label_run.font.color.rgb = COLOR_TEXT_MUTED

        val_box = slide.shapes.add_textbox(
            x + Inches(0.15), y_extra + Inches(0.35), card_width - Inches(0.3), Inches(0.4)
        )
        val_tf = val_box.text_frame
        val_tf.word_wrap = True
        val_para = val_tf.paragraphs[0]
        val_run = val_para.add_run()
        val_run.text = value
        val_run.font.size = Pt(18)
        val_run.font.bold = True
        val_run.font.color.rgb = color

    # RAG status summary
    rag_status = _get_rag_label(min(cpi, spi))
    rag_color = _get_rag_color(min(cpi, spi))
    status_box = slide.shapes.add_textbox(
        Inches(0.5), Inches(5.8), Inches(12.33), Inches(0.5)
    )
    status_tf = status_box.text_frame
    status_tf.word_wrap = True
    status_para = status_tf.paragraphs[0]
    status_para.alignment = PP_ALIGN.CENTER
    status_run = status_para.add_run()
    status_run.text = f"OVERALL PROGRAMME STATUS: {rag_status}"
    status_run.font.size = Pt(16)
    status_run.font.bold = True
    status_run.font.color.rgb = rag_color


# ============================================================================
# Slide 2: Comparative Gantt Snapshot
# ============================================================================

def _build_slide2_gantt(slide, db: Session, root_node: PortfolioNode,
                        all_nodes: List[PortfolioNode], status_date: date,
                        classification: str, caveats: List[str]):
    """Build Slide 2: Comparative Gantt Snapshot.

    Renders top-level WBS nodes with live forecast bars, B₀ baseline tracks,
    and a jagged status-date drop line indicator.

    Parameters
    ----------
    slide : pptx.slide.Slide
        The slide to populate.
    db : Session
        Database session.
    root_node : PortfolioNode
        Root portfolio node.
    all_nodes : list[PortfolioNode]
        All descendant nodes.
    status_date : date
        Reporting status date.
    classification : str
        Classification marking.
    caveats : list[str]
        Caveat list.
    """
    _add_slide_title(
        slide,
        "Comparative Gantt Snapshot",
        "Top-level WBS with baseline comparison"
    )
    _add_classification_bands(slide, classification, caveats)

    # Filter to top-level nodes (depth 1-2 from root)
    root_path = root_node.path or ""
    top_nodes = []
    for node in all_nodes:
        if node.path and node.path.startswith(root_path):
            depth = len(node.path.split(".")) - len(root_path.split("."))
            if depth <= 2:
                top_nodes.append(node)

    # Sort by planned start date
    top_nodes.sort(key=lambda n: n.planned_start_date or datetime.max)

    # Calculate date range
    dates = []
    for node in top_nodes:
        if node.planned_start_date:
            dates.append(node.planned_start_date.date() if isinstance(node.planned_start_date, datetime) else node.planned_start_date)
        if node.planned_end_date:
            dates.append(node.planned_end_date.date() if isinstance(node.planned_end_date, datetime) else node.planned_end_date)

    if not dates:
        dates = [status_date, status_date + timedelta(days=30)]

    min_date = min(dates)
    max_date = max(dates)
    total_days = (max_date - min_date).days or 1

    # Chart area
    chart_left = Inches(0.5)
    chart_top = Inches(1.6)
    chart_width = Inches(12.33)
    row_height = Inches(0.35)

    # Render Gantt bars as shapes
    for idx, node in enumerate(top_nodes[:20]):  # Limit to 20 rows
        y = chart_top + idx * (row_height + Inches(0.05))

        # Node label
        label_box = slide.shapes.add_textbox(
            chart_left, y, Inches(2.5), row_height
        )
        label_tf = label_box.text_frame
        label_tf.word_wrap = True
        label_para = label_tf.paragraphs[0]
        label_run = label_para.add_run()
        label_run.text = f"{node.code or ''} {node.name or ''}"[:30]
        label_run.font.size = Pt(9)
        label_run.font.color.rgb = COLOR_TEXT_PRIMARY

        # Bar area
        bar_left = chart_left + Inches(2.6)
        bar_width = chart_width - Inches(2.7)

        # Planned bar (background)
        start_date = node.planned_start_date
        end_date = node.planned_end_date
        if start_date and end_date:
            if isinstance(start_date, datetime):
                start_date = start_date.date()
            if isinstance(end_date, datetime):
                end_date = end_date.date()
            start_frac = max(0, (start_date - min_date).days) / total_days
            end_frac = min(1, (end_date - min_date).days) / total_days
            bar_start = bar_left + int(Emu.from_inches(bar_width.inches) * start_frac)
            bar_len = int(Emu.from_inches(bar_width.inches) * (end_frac - start_frac))

            if bar_len > 0:
                planned_bar = slide.shapes.add_shape(
                    1, bar_start, y + int(Emu.from_inches(0.05)),
                    bar_len, int(Emu.from_inches(0.12))
                )
                planned_bar.fill.solid()
                planned_bar.fill.fore_color.rgb = COLOR_BORDER
                planned_bar.line.fill.background()

            # Actual progress bar
            pct = node.percent_complete or 0
            progress_len = int(bar_len * pct / 100)
            if progress_len > 0:
                prog_bar = slide.shapes.add_shape(
                    1, bar_start, y + int(Emu.from_inches(0.05)),
                    progress_len, int(Emu.from_inches(0.12))
                )
                prog_bar.fill.solid()
                prog_bar.fill.fore_color.rgb = RAG_GREEN
                prog_bar.line.fill.background()

            # B₀ baseline bar (if available)
            baseline = db.query(PortfolioBaseline).filter(
                PortfolioBaseline.root_portfolio_node_id == root_node.id,
                PortfolioBaseline.is_active_target == True
            ).first()
            if baseline:
                snapshot = db.query(BaselineNodeSnapshot).filter(
                    BaselineNodeSnapshot.baseline_id == baseline.id,
                    BaselineNodeSnapshot.portfolio_node_id == node.id
                ).first()
                if snapshot and snapshot.planned_start and snapshot.planned_end:
                    b0_start = max(0, (snapshot.planned_start - min_date).days) / total_days
                    b0_end = min(1, (snapshot.planned_end - min_date).days) / total_days
                    b0_start_x = bar_left + int(Emu.from_inches(bar_width.inches) * b0_start)
                    b0_len = int(Emu.from_inches(bar_width.inches) * (b0_end - b0_start))
                    if b0_len > 0:
                        b0_bar = slide.shapes.add_shape(
                            1, b0_start_x, y + int(Emu.from_inches(0.18)),
                            b0_len, int(Emu.from_inches(0.06))
                        )
                        b0_bar.fill.solid()
                        b0_bar.fill.fore_color.rgb = BASELINE_B0_GREEN
                        b0_bar.line.fill.background()

        # Status date marker
        status_frac = (status_date - min_date).days / total_days
        status_x = bar_left + int(Emu.from_inches(bar_width.inches) * status_frac)
        status_marker = slide.shapes.add_shape(
            1, status_x, chart_top,
            int(Emu.from_inches(0.02)),
            int(Emu.from_inches(4.5))
        )
        status_marker.fill.solid()
        status_marker.fill.fore_color.rgb = RAG_AMBER
        status_marker.line.fill.background()

    # Legend
    legend_y = chart_top + len(top_nodes[:20]) * (row_height + Inches(0.05)) + Inches(0.2)
    legend_items = [
        ("Live Forecast", COLOR_BORDER),
        ("Physical Progress", RAG_GREEN),
        ("B₀ Baseline", BASELINE_B0_GREEN),
        ("Status Date", RAG_AMBER),
    ]
    for i, (label, color) in enumerate(legend_items):
        x = chart_left + i * Inches(3.0)
        swatch = slide.shapes.add_shape(
            1, x, legend_y, Inches(0.3), Inches(0.2)
        )
        swatch.fill.solid()
        swatch.fill.fore_color.rgb = color
        swatch.line.fill.background()

        lbl = slide.shapes.add_textbox(x + Inches(0.35), legend_y, Inches(2.0), Inches(0.2))
        lbl_tf = lbl.text_frame
        lbl_para = lbl_tf.paragraphs[0]
        lbl_run = lbl_para.add_run()
        lbl_run.text = label
        lbl_run.font.size = Pt(9)
        lbl_run.font.color.rgb = COLOR_TEXT_MUTED


# ============================================================================
# Slide 3: Cumulative EVM S-Curve
# ============================================================================

def _build_slide3_scurve(slide, db: Session, root_node: PortfolioNode,
                         all_nodes: List[PortfolioNode], status_date: date,
                         classification: str, caveats: List[str]):
    """Build Slide 3: Cumulative EVM S-Curve.

    Plots historical and projected PV, EV, and AC curves through
    contract completion.

    Parameters
    ----------
    slide : pptx.slide.Slide
        The slide to populate.
    db : Session
        Database session.
    root_node : PortfolioNode
        Root portfolio node.
    all_nodes : list[PortfolioNode]
        All descendant nodes.
    status_date : date
        Reporting status date.
    classification : str
        Classification marking.
    caveats : list[str]
        Caveat list.
    """
    _add_slide_title(
        slide,
        "Cumulative EVM S-Curve",
        "Planned Value, Earned Value, and Actual Cost"
    )
    _add_classification_bands(slide, classification, caveats)

    # Aggregate EVM data
    total_bac = Decimal("0")
    total_pv = Decimal("0")
    total_ev = Decimal("0")
    total_ac = Decimal("0")

    for node in all_nodes:
        total_bac += Decimal(str(node.bac_cost or 0))
        total_pv += Decimal(str(node.planned_value or 0))
        total_ev += Decimal(str(node.earned_value or 0))
        total_ac += Decimal(str(node.actual_cost or 0))

    # Generate time-phased S-Curve points
    project_start = None
    project_end = None
    for node in all_nodes:
        if node.planned_start_date:
            d = node.planned_start_date.date() if isinstance(node.planned_start_date, datetime) else node.planned_start_date
            if project_start is None or d < project_start:
                project_start = d
        if node.planned_end_date:
            d = node.planned_end_date.date() if isinstance(node.planned_end_date, datetime) else node.planned_end_date
            if project_end is None or d > project_end:
                project_end = d

    if project_start is None or project_end is None:
        project_start = status_date
        project_end = status_date + timedelta(days=90)

    total_duration = (project_end - project_start).days or 1

    # Generate monthly data points
    categories = []
    pv_data = []
    ev_data = []
    ac_data = []

    current = project_start
    while current <= project_end:
        categories.append(current.strftime("%Y-%m"))
        elapsed = (current - project_start).days
        fraction = min(elapsed / total_duration, 1.0)
        pv_data.append(float(total_bac * fraction))
        # EV and AC are current state (not time-phased in this implementation)
        ev_data.append(float(total_ev))
        ac_data.append(float(total_ac))
        current += timedelta(days=30)

    # Limit to 24 months max
    if len(categories) > 24:
        categories = categories[:24]
        pv_data = pv_data[:24]
        ev_data = ev_data[:24]
        ac_data = ac_data[:24]

    # Create line chart
    chart_data = CategoryChartData()
    chart_data.categories = categories
    chart_data.add_series("Planned Value (PV)", pv_data)
    chart_data.add_series("Earned Value (EV)", ev_data)
    chart_data.add_series("Actual Cost (AC)", ac_data)

    chart_frame = slide.shapes.add_chart(
        XL_CHART_TYPE.LINE_MARKERS,
        Inches(0.5), Inches(1.6), Inches(12.33), Inches(4.5),
        chart_data
    )
    chart = chart_frame.chart
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.BOTTOM
    chart.legend.include_in_layout = False

    # Style chart series
    colors = [COLOR_BORDER, RAG_GREEN, RAG_RED]
    for i, series in enumerate(chart.series):
        series.format.line.color.rgb = colors[i % len(colors)]
        series.format.line.width = Pt(2)
        series.smooth = False

    # Summary metrics
    cpi = float(total_ev / total_ac) if total_ac > 0 else 1.0
    spi = float(total_ev / total_pv) if total_pv > 0 else 1.0
    eac = float(total_bac / cpi) if cpi > 0 else float(total_bac)
    vac = float(total_bac - eac)
    currency = root_node.currency_code or "GBP"

    summary_text = (
        f"BAC: {_format_currency(total_bac, currency)} | "
        f"CPI: {cpi:.2f} | SPI: {spi:.2f} | "
        f"EAC: {_format_currency(eac, currency)} | "
        f"VAC: {_format_currency(vac, currency)}"
    )
    summary_box = slide.shapes.add_textbox(
        Inches(0.5), Inches(6.2), Inches(12.33), Inches(0.4)
    )
    summary_tf = summary_box.text_frame
    summary_tf.word_wrap = True
    summary_para = summary_tf.paragraphs[0]
    summary_para.alignment = PP_ALIGN.CENTER
    summary_run = summary_para.add_run()
    summary_run.text = summary_text
    summary_run.font.size = Pt(12)
    summary_run.font.color.rgb = COLOR_TEXT_MUTED


# ============================================================================
# Slide 4: Top 5 Schedule Drivers & Tornado Chart
# ============================================================================

def _build_slide4_tornado(slide, db: Session, root_node: PortfolioNode,
                          all_nodes: List[PortfolioNode], status_date: date,
                          classification: str, caveats: List[str]):
    """Build Slide 4: Top 5 Schedule Drivers & Tornado Chart.

    Horizontal bar chart ranking activities by Monte Carlo Criticality Index.

    Parameters
    ----------
    slide : pptx.slide.Slide
        The slide to populate.
    db : Session
        Database session.
    root_node : PortfolioNode
        Root portfolio node.
    all_nodes : list[PortfolioNode]
        All descendant nodes.
    status_date : date
        Reporting status date.
    classification : str
        Classification marking.
    caveats : list[str]
        Caveat list.
    """
    _add_slide_title(
        slide,
        "Top 5 Schedule Drivers",
        "Monte Carlo Criticality Index (CI) — Primary Risk Drivers"
    )
    _add_classification_bands(slide, classification, caveats)

    # Query activities with criticality indices
    distributions = db.query(ActivityDurationDistribution).all()

    # Build list of (node, criticality_index) tuples
    drivers = []
    for dist in distributions:
        node = db.query(PortfolioNode).filter(
            PortfolioNode.id == dist.portfolio_node_id
        ).first()
        if node and dist.criticality_index is not None:
            drivers.append((node, dist.criticality_index))

    # Sort by criticality index descending
    drivers.sort(key=lambda x: x[1] or 0, reverse=True)
    top_5 = drivers[:5]

    if not top_5:
        # No Monte Carlo data — show placeholder
        placeholder = slide.shapes.add_textbox(
            Inches(1), Inches(3), Inches(11.33), Inches(2)
        )
        placeholder_tf = placeholder.text_frame
        placeholder_tf.word_wrap = True
        placeholder_para = placeholder_tf.paragraphs[0]
        placeholder_para.alignment = PP_ALIGN.CENTER
        placeholder_run = placeholder_para.add_run()
        placeholder_run.text = (
            "No Monte Carlo simulation data available.\n"
            "Run POST /api/v1/schedule/{project_id}/monte-carlo first."
        )
        placeholder_run.font.size = Pt(14)
        placeholder_run.font.color.rgb = COLOR_TEXT_MUTED
        return

    # Create horizontal bar chart
    chart_data = CategoryChartData()
    categories = []
    ci_values = []

    for node, ci in top_5:
        label = f"{node.code or ''} {node.name or ''}"[:40]
        categories.append(label)
        ci_values.append(ci * 100)  # Convert to percentage

    chart_data.categories = categories
    chart_data.add_series("Criticality Index (%)", ci_values)

    chart_frame = slide.shapes.add_chart(
        XL_CHART_TYPE.BAR_CLUSTERED,
        Inches(0.5), Inches(1.6), Inches(12.33), Inches(4.0),
        chart_data
    )
    chart = chart_frame.chart
    chart.has_legend = False

    # Color bars by criticality
    for i, point in enumerate(chart.series[0].points):
        ci_pct = ci_values[i]
        if ci_pct >= 80:
            point.format.fill.solid()
            point.format.fill.fore_color.rgb = RAG_RED
        elif ci_pct >= 50:
            point.format.fill.solid()
            point.format.fill.fore_color.rgb = RAG_AMBER
        else:
            point.format.fill.solid()
            point.format.fill.fore_color.rgb = RAG_GREEN

    # Data labels
    chart.series[0].has_data_labels = True
    chart.series[0].data_labels.font.size = Pt(10)
    chart.series[0].data_labels.font.color.rgb = COLOR_TEXT_PRIMARY
    chart.series[0].data_labels.number_format = "0.0"
    chart.series[0].data_labels.show_value = True

    # Interpretation text
    interp_box = slide.shapes.add_textbox(
        Inches(0.5), Inches(5.8), Inches(12.33), Inches(1.0)
    )
    interp_tf = interp_box.text_frame
    interp_tf.word_wrap = True
    interp_para = interp_tf.paragraphs[0]
    interp_run = interp_para.add_run()
    interp_run.text = (
        "Criticality Index represents the percentage of Monte Carlo simulation "
        "runs where each activity appeared on the critical path. "
        "Activities with CI ≥ 80% are primary risk drivers requiring close monitoring."
    )
    interp_run.font.size = Pt(10)
    interp_run.font.color.rgb = COLOR_TEXT_MUTED


# ============================================================================
# Slide 5: 5×5 Programme Risk Matrix
# ============================================================================

def _build_slide5_risk_matrix(slide, db: Session, root_node: PortfolioNode,
                              all_nodes: List[PortfolioNode], status_date: date,
                              classification: str, caveats: List[str]):
    """Build Slide 5: 5×5 Programme Risk Matrix.

    Grid plotting active risks by likelihood vs. consequence with
    assigned mitigation owners.

    Parameters
    ----------
    slide : pptx.slide.Slide
        The slide to populate.
    db : Session
        Database session.
    root_node : PortfolioNode
        Root portfolio node.
    all_nodes : list[PortfolioNode]
        All descendant nodes.
    status_date : date
        Reporting status date.
    classification : str
        Classification marking.
    caveats : list[str]
        Caveat list.
    """
    _add_slide_title(
        slide,
        "5×5 Programme Risk Matrix",
        "Active Risks by Likelihood vs. Consequence"
    )
    _add_classification_bands(slide, classification, caveats)

    # Risk matrix colors (likelihood rows × consequence columns)
    # Low (green), Medium (amber), High (red), Extreme (dark red)
    matrix_colors = [
        [RAG_GREEN, RAG_GREEN, RAG_AMBER, RAG_AMBER, RAG_RED],       # Likelihood 1
        [RAG_GREEN, RAG_AMBER, RAG_AMBER, RAG_RED, RAG_RED],          # Likelihood 2
        [RAG_AMBER, RAG_AMBER, RAG_RED, RAG_RED, RGBColor(0x99, 0x1B, 0x1B)],  # Likelihood 3
        [RAG_AMBER, RAG_RED, RAG_RED, RGBColor(0x99, 0x1B, 0x1B), RGBColor(0x99, 0x1B, 0x1B)],  # Likelihood 4
        [RAG_RED, RAG_RED, RGBColor(0x99, 0x1B, 0x1B), RGBColor(0x99, 0x1B, 0x1B), RGBColor(0x99, 0x1B, 0x1B)],  # Likelihood 5
    ]

    # Draw the 5×5 grid
    grid_left = Inches(2.5)
    grid_top = Inches(2.0)
    cell_size = Inches(1.5)

    # Axis labels
    y_label = slide.shapes.add_textbox(
        Inches(0.3), grid_top + Inches(1.5), Inches(2.0), Inches(0.3)
    )
    y_tf = y_label.text_frame
    y_para = y_tf.paragraphs[0]
    y_para.alignment = PP_ALIGN.CENTER
    y_run = y_para.add_run()
    y_run.text = "LIKELIHOOD →"
    y_run.font.size = Pt(12)
    y_run.font.bold = True
    y_run.font.color.rgb = COLOR_TEXT_PRIMARY

    x_label = slide.shapes.add_textbox(
        grid_left + Inches(5.0), grid_top + Inches(5.5), Inches(6.0), Inches(0.3)
    )
    x_tf = x_label.text_frame
    x_para = x_tf.paragraphs[0]
    x_para.alignment = PP_ALIGN.CENTER
    x_run = x_para.add_run()
    x_run.text = "CONSEQUENCE →"
    x_run.font.size = Pt(12)
    x_run.font.bold = True
    x_run.font.color.rgb = COLOR_TEXT_PRIMARY

    # Draw cells
    for row in range(5):  # Likelihood (5=top, 1=bottom)
        for col in range(5):  # Consequence (1=left, 5=right)
            likelihood = 5 - row  # 5 at top, 1 at bottom
            consequence = col + 1

            x = grid_left + col * cell_size
            y = grid_top + row * cell_size

            cell = slide.shapes.add_shape(
                1, x, y, cell_size, cell_size
            )
            cell.fill.solid()
            cell.fill.fore_color.rgb = matrix_colors[row][col]
            cell.line.color.rgb = COLOR_BG_SURFACE
            cell.line.width = Pt(1)

            # Cell text: likelihood × consequence
            cell_tf = cell.text_frame
            cell_tf.word_wrap = True
            cell_para = cell_tf.paragraphs[0]
            cell_para.alignment = PP_ALIGN.CENTER
            cell_run = cell_para.add_run()
            cell_run.text = f"{likelihood}×{consequence}"
            cell_run.font.size = Pt(10)
            cell_run.font.color.rgb = COLOR_BG_SURFACE
            cell_run.font.bold = True

    # Count active blockers as proxy for risk items
    active_blockers = db.query(NodeBlocker).filter(
        NodeBlocker.resolved_at.is_(None)
    ).all()

    # Plot risk points on the matrix
    for blocker in active_blockers:
        # Map severity to likelihood/consequence
        if blocker.severity == BlockerSeverity.CRITICAL:
            likelihood = 5
            consequence = 5
        elif blocker.severity == BlockerSeverity.MAJOR:
            likelihood = 3
            consequence = 4
        else:
            likelihood = 2
            consequence = 2

        # Position on grid
        row = 5 - likelihood
        col = consequence - 1
        cx = grid_left + col * cell_size + int(Emu.from_inches(cell_size.inches / 2))
        cy = grid_top + row * cell_size + int(Emu.from_inches(cell_size.inches / 2))

        # Draw dot
        dot = slide.shapes.add_shape(
            5, cx - int(Emu.from_inches(0.1)), cy - int(Emu.from_inches(0.1)),
            int(Emu.from_inches(0.2)), int(Emu.from_inches(0.2))
        )  # msoShapeOval
        dot.fill.solid()
        dot.fill.fore_color.rgb = COLOR_TEXT_PRIMARY
        dot.line.fill.background()

    # Risk summary
    risk_summary = slide.shapes.add_textbox(
        Inches(0.5), Inches(5.8), Inches(12.33), Inches(1.0)
    )
    risk_tf = risk_summary.text_frame
    risk_tf.word_wrap = True
    risk_para = risk_tf.paragraphs[0]
    risk_run = risk_para.add_run()
    risk_run.text = (
        f"Active Risks: {len(active_blockers)} | "
        f"Critical: {len([b for b in active_blockers if b.severity == BlockerSeverity.CRITICAL])} | "
        f"Major: {len([b for b in active_blockers if b.severity == BlockerSeverity.MAJOR])} | "
        f"Minor: {len([b for b in active_blockers if b.severity == BlockerSeverity.MINOR])}"
    )
    risk_run.font.size = Pt(12)
    risk_run.font.color.rgb = COLOR_TEXT_PRIMARY


# ============================================================================
# Main Generator
# ============================================================================

class BriefingGenerator:
    """Generates standardized executive briefing decks in .pptx format.

    This class orchestrates the creation of a 5-slide briefing presentation
    containing programme health metrics, schedule visualization, EVM S-Curves,
    risk tornado charts, and risk matrices.

    Usage
    -----
    >>> generator = BriefingGenerator()
    >>> deck_bytes = generator.generate(
    ...     db=session,
    ...     project_id=project_uuid,
    ...     status_date=date(2026, 10, 24),
    ... )
    """

    SLIDE_TITLES = {
        1: "Programme Master Health",
        2: "Comparative Gantt Snapshot",
        3: "Cumulative EVM S-Curve",
        4: "Top 5 Schedule Drivers",
        5: "5×5 Programme Risk Matrix",
    }

    def generate(self, db: Session, project_id: UUID, status_date: date,
                 slide_selection: Optional[List[int]] = None,
                 title_override: Optional[str] = None,
                 classification_override: Optional[str] = None,
                 include_export_disclaimer: bool = True) -> Tuple[bytes, Dict]:
        """Generate a complete briefing deck.

        Parameters
        ----------
        db : Session
            Database session.
        project_id : UUID
            UUID of the root PortfolioNode.
        status_date : date
            Reporting cut-off date.
        slide_selection : list[int] or None
            Optional list of slide numbers (1–5) to include.
            If None, all 5 slides are generated.
        title_override : str or None
            Custom title for the deck.
        classification_override : str or None
            Override classification marking.
        include_export_disclaimer : bool
            Whether to include export-control disclaimer.

        Returns
        -------
        tuple[bytes, dict]
            (pptx_bytes, metadata) — The generated .pptx file as bytes
            and a metadata dictionary with slide info.
        """
        # Load root node
        root_node = db.query(PortfolioNode).filter(
            PortfolioNode.id == project_id
        ).first()

        if root_node is None:
            raise ValueError(f"PortfolioNode {project_id} not found")

        # Collect all descendant nodes using path prefix matching
        root_path = root_node.path or ""
        descendants = db.query(PortfolioNode).filter(
            UniversalBreakdownNode.path.like(f"{root_path}%")
        ).all()

        # Determine classification
        if classification_override:
            classification = classification_override
        else:
            classification = _highest_classification(descendants)

        caveats = _collect_caveats(descendants)

        # Title
        title = title_override or f"{root_node.name or 'Programme'} — Executive Briefing"

        # Determine which slides to generate
        if slide_selection:
            slides_to_generate = [s for s in slide_selection if 1 <= s <= 5]
        else:
            slides_to_generate = [1, 2, 3, 4, 5]

        # Create presentation
        prs = Presentation()
        prs.slide_width = Inches(13.33)
        prs.slide_height = Inches(7.5)

        slide_info = []

        for slide_num in slides_to_generate:
            slide = prs.slides.add_slide(prs.slide_layouts[6])  # Blank layout

            if slide_num == 1:
                _build_slide1_health(slide, db, root_node, descendants,
                                     status_date, classification, caveats)
                data_points = len(descendants)
            elif slide_num == 2:
                _build_slide2_gantt(slide, db, root_node, descendants,
                                    status_date, classification, caveats)
                data_points = len([n for n in descendants if n.planned_start_date])
            elif slide_num == 3:
                _build_slide3_scurve(slide, db, root_node, descendants,
                                     status_date, classification, caveats)
                data_points = len(descendants)
            elif slide_num == 4:
                _build_slide4_tornado(slide, db, root_node, descendants,
                                      status_date, classification, caveats)
                dists = db.query(ActivityDurationDistribution).all()
                data_points = len([d for d in dists if d.criticality_index is not None])
            elif slide_num == 5:
                _build_slide5_risk_matrix(slide, db, root_node, descendants,
                                          status_date, classification, caveats)
                data_points = db.query(NodeBlocker).filter(
                    NodeBlocker.resolved_at.is_(None)
                ).count()

            slide_info.append({
                "slide_number": slide_num,
                "slide_title": self.SLIDE_TITLES.get(slide_num, f"Slide {slide_num}"),
                "data_points": data_points,
            })

        # Add export-control disclaimer as notes on first slide
        if include_export_disclaimer and len(prs.slides) > 0:
            notes_slide = prs.slides[0]
            notes_slide.notes_slide.notes_text_frame.text = (
                f"CLASSIFICATION: {classification.upper()}\n"
                f"CAVEATS: {'; '.join(caveats) if caveats else 'NONE'}\n\n"
                "EXPORT CONTROL DISCLAIMER:\n"
                "This document contains controlled technical data subject to\n"
                "export control regulations. Distribution is restricted to\n"
                "authorized personnel with appropriate security clearance\n"
                "and need-to-know. Unauthorized disclosure is prohibited."
            )

        # Save to bytes
        output = io.BytesIO()
        prs.save(output)
        output.seek(0)
        pptx_bytes = output.getvalue()

        metadata = {
            "deck_id": str(uuid.uuid4()),
            "title": title,
            "slide_count": len(slides_to_generate),
            "slides": slide_info,
            "file_size_bytes": len(pptx_bytes),
            "classification": classification,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "message": f"Generated {len(slides_to_generate)}-slide briefing deck for '{title}'",
        }

        return pptx_bytes, metadata
