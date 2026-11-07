"""Report Template Service.

This module provides services for generating template-based reports in
Word (.docx) and PowerPoint (.pptx) formats. It supports predefined
report templates for common defence programme management scenarios.

Report Templates
~~~~~~~~~~~~~~~~

1. **Programme Status** — Comprehensive programme status report with
   executive summary, schedule health, cost performance, and risks.

2. **Project Health** — Detailed project health report with metrics,
   milestones, and resource utilization.

3. **Executive Summary** — High-level executive summary with key metrics
   and RAG status indicators.

4. **Risk Register** — Complete risk register with likelihood/impact
   analysis and mitigation plans.

5. **EVM Report** — Earned Value Management report with CPI/SPI analysis,
   S-curves, and forecast data.

6. **Procurement Status** — Procurement tracking report with orders,
   deliveries, and supplier performance.

7. **Resource Utilization** — Resource allocation and utilization report.

8. **Milestone Tracker** — Milestone progress and variance report.

9. **Change Control** — Change request tracking and approval report.

10. **Quality Assurance** — Quality metrics and test results report.

Usage
~~~~~

    from app.services.report_template import report_template_service

    # Generate a Word report
    docx_bytes, metadata = report_template_service.generate_report(
        template_type="programme_status",
        format="docx",
        project_id="uuid",
        db=db_session,
    )

    # Generate a PowerPoint report
    pptx_bytes, metadata = report_template_service.generate_report(
        template_type="executive_summary",
        format="pptx",
        project_id="uuid",
        db=db_session,
    )
"""
import io
import uuid
from datetime import datetime, date
from typing import Dict, Any, Optional, Tuple, List
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import (
    PortfolioNode,
    NodeBlocker,
    ResourceAssignment,
    SecurityClassification,
)
from app.schemas.export_schemas import ReportTemplateType, ExportFormat


# ============================================================================
# Template Definitions
# ============================================================================

TEMPLATE_DEFINITIONS = {
    ReportTemplateType.PROGRAMME_STATUS: {
        "name": "Programme Status Report",
        "description": "Comprehensive programme status with executive summary, schedule, cost, and risks.",
        "sections": [
            "executive_summary",
            "schedule_health",
            "cost_performance",
            "risk_summary",
            "milestone_status",
            "resource_utilization",
        ],
    },
    ReportTemplateType.PROJECT_HEALTH: {
        "name": "Project Health Report",
        "description": "Detailed project health metrics, milestones, and resource utilization.",
        "sections": [
            "project_overview",
            "health_metrics",
            "milestone_progress",
            "resource_allocation",
            "issues_and_blockers",
        ],
        },
    ReportTemplateType.EXECUTIVE_SUMMARY: {
        "name": "Executive Summary",
        "description": "High-level executive summary with key metrics and RAG status.",
        "sections": [
            "executive_overview",
            "key_metrics",
            "rag_status",
            "critical_issues",
        ],
    },
    ReportTemplateType.RISK_REGISTER: {
        "name": "Risk Register",
        "description": "Complete risk register with likelihood/impact analysis.",
        "sections": [
            "risk_summary",
            "risk_matrix",
            "top_risks",
            "mitigation_plans",
        ],
    },
    ReportTemplateType.EVM_REPORT: {
        "name": "EVM Report",
        "description": "Earned Value Management report with CPI/SPI analysis.",
        "sections": [
            "evm_summary",
            "cpi_spi_analysis",
            "forecast_data",
            "variance_analysis",
        ],
    },
    ReportTemplateType.PROCUREMENT_STATUS: {
        "name": "Procurement Status",
        "description": "Procurement tracking with orders and supplier performance.",
        "sections": [
            "procurement_summary",
            "active_orders",
            "supplier_performance",
            "delivery_status",
        ],
    },
    ReportTemplateType.RESOURCE_UTILIZATION: {
        "name": "Resource Utilization",
        "description": "Resource allocation and utilization report.",
        "sections": [
            "resource_summary",
            "allocation_matrix",
            "utilization_metrics",
            "capacity_planning",
        ],
    },
    ReportTemplateType.MILESTONE_TRACKER: {
        "name": "Milestone Tracker",
        "description": "Milestone progress and variance report.",
        "sections": [
            "milestone_summary",
            "upcoming_milestones",
            "variance_analysis",
            "risk_to_milestones",
        ],
    },
    ReportTemplateType.CHANGE_CONTROL: {
        "name": "Change Control",
        "description": "Change request tracking and approval report.",
        "sections": [
            "change_summary",
            "pending_changes",
            "approved_changes",
            "impact_analysis",
        ],
    },
    ReportTemplateType.QUALITY_ASSURANCE: {
        "name": "Quality Assurance",
        "description": "Quality metrics and test results report.",
        "sections": [
            "quality_summary",
            "test_results",
            "defect_analysis",
            "compliance_status",
        ],
    },
}


# ============================================================================
# Color Constants
# ============================================================================

CLASSIFICATION_COLORS = {
    "OFFICIAL": (0x38, 0xBD, 0xF8),
    "OFFICIAL_SENSITIVE": (0x22, 0xD3, 0xEE),
    "SECRET": (0xF8, 0x71, 0x71),
    "TOP_SECRET": (0xC0, 0x84, 0xFC),
}

RAG_COLORS = {
    "green": (0x22, 0xC5, 0x5E),
    "amber": (0xF5, 0x9E, 0x0B),
    "red": (0xEF, 0x44, 0x44),
}


class ReportTemplateService:
    """Service for generating template-based reports."""

    def __init__(self):
        """Initialize the report template service."""
        self.section_handlers = {
            "executive_summary": self._handle_executive_summary,
            "schedule_health": self._handle_schedule_health,
            "cost_performance": self._handle_cost_performance,
            "risk_summary": self._handle_risk_summary,
            "milestone_status": self._handle_milestone_status,
            "resource_utilization": self._handle_resource_utilization,
            "resource_summary": self._handle_resource_utilization,
            "project_overview": self._handle_project_overview,
            "health_metrics": self._handle_health_metrics,
            "milestone_progress": self._handle_milestone_progress,
            "milestone_summary": self._handle_milestone_status,
            "change_summary": self._handle_issues_and_blockers,
            "resource_allocation": self._handle_resource_allocation,
            "issues_and_blockers": self._handle_issues_and_blockers,
            "executive_overview": self._handle_executive_overview,
            "key_metrics": self._handle_key_metrics,
            "rag_status": self._handle_rag_status,
            "critical_issues": self._handle_critical_issues,
            "risk_matrix": self._handle_risk_matrix,
            "top_risks": self._handle_top_risks,
            "mitigation_plans": self._handle_mitigation_plans,
            "evm_summary": self._handle_evm_summary,
            "cpi_spi_analysis": self._handle_cpi_spi_analysis,
            "forecast_data": self._handle_forecast_data,
            "variance_analysis": self._handle_variance_analysis,
            "procurement_summary": self._handle_procurement_summary,
            "active_orders": self._handle_active_orders,
            "supplier_performance": self._handle_supplier_performance,
            "delivery_status": self._handle_delivery_status,
            "allocation_matrix": self._handle_allocation_matrix,
            "utilization_metrics": self._handle_utilization_metrics,
            "capacity_planning": self._handle_capacity_planning,
            "upcoming_milestones": self._handle_upcoming_milestones,
            "risk_to_milestones": self._handle_risk_to_milestones,
            "pending_changes": self._handle_pending_changes,
            "approved_changes": self._handle_approved_changes,
            "impact_analysis": self._handle_impact_analysis,
            "quality_summary": self._handle_quality_summary,
            "test_results": self._handle_test_results,
            "defect_analysis": self._handle_defect_analysis,
            "compliance_status": self._handle_compliance_status,
        }

    def generate_report(
        self,
        template_type: ReportTemplateType,
        format: ExportFormat,
        project_id: Optional[UUID],
        status_date: Optional[date],
        db: Session,
        title_override: Optional[str] = None,
        classification_override: Optional[str] = None,
        include_export_disclaimer: bool = True,
        sections: Optional[List[str]] = None,
    ) -> Tuple[bytes, Dict[str, Any]]:
        """Generate a template-based report.

        Args:
            template_type: Type of report template.
            format: Output format (DOCX or PPTX).
            project_id: Optional project UUID.
            status_date: Optional reporting cut-off date.
            db: Database session.
            title_override: Optional custom title.
            classification_override: Optional classification override.
            include_export_disclaimer: Whether to include export disclaimer.
            sections: Optional list of section IDs to include.

        Returns:
            Tuple of (file_bytes, metadata_dict).

        Raises:
            ValueError: If the template type is not supported.
        """
        template_def = TEMPLATE_DEFINITIONS.get(template_type)
        if template_def is None:
            raise ValueError(f"Unknown template type: {template_type}")

        # Determine sections to include
        section_ids = sections or template_def["sections"]

        # Collect section data
        section_data = {}
        for section_id in section_ids:
            handler = self.section_handlers.get(section_id)
            if handler:
                section_data[section_id] = handler(project_id, db)

        # Determine title
        title = title_override or template_def["name"]
        if project_id:
            project = db.query(PortfolioNode).filter(
                PortfolioNode.id == project_id
            ).first()
            if project and project.name:
                title = f"{project.name} - {template_def['name']}"

        # Determine classification
        classification = classification_override
        if not classification and project_id:
            project = db.query(PortfolioNode).filter(
                PortfolioNode.id == project_id
            ).first()
            if project and project.security_classification:
                classification = project.security_classification.value

        # Generate report
        if format == ExportFormat.DOCX:
            file_bytes = self._generate_docx(
                title, section_data, classification,
                include_export_disclaimer, template_def
            )
        elif format == ExportFormat.PPTX:
            file_bytes = self._generate_pptx(
                title, section_data, classification,
                include_export_disclaimer, template_def
            )
        else:
            raise ValueError(f"Unsupported format for report: {format}")

        # Build metadata
        report_id = str(uuid.uuid4())
        section_info = []
        for section_id, data in section_data.items():
            section_info.append({
                "section_id": section_id,
                "section_title": data.get("title", section_id.replace("_", " ").title()),
                "page_count": data.get("page_count", 1),
                "data_points": data.get("data_points", 0),
            })

        metadata = {
            "report_id": report_id,
            "template_type": template_type.value,
            "format": format.value,
            "title": title,
            "section_count": len(section_data),
            "sections": section_info,
            "file_size_bytes": len(file_bytes),
            "classification": classification or "OFFICIAL",
            "generated_at": datetime.now().isoformat(),
            "message": f"Report generated successfully as {format.value.upper()}",
        }

        return file_bytes, metadata

    def _generate_docx(
        self,
        title: str,
        section_data: Dict[str, Dict[str, Any]],
        classification: Optional[str],
        include_disclaimer: bool,
        template_def: Dict[str, Any],
    ) -> bytes:
        """Generate a Word document report.

        Args:
            title: Report title.
            section_data: Dictionary of section data.
            classification: Classification marking.
            include_disclaimer: Whether to include export disclaimer.
            template_def: Template definition.

        Returns:
            Word document bytes.
        """
        from docx import Document
        from docx.shared import Inches, Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.enum.table import WD_TABLE_ALIGNMENT

        doc = Document()

        # Classification header
        if classification:
            header_para = doc.add_paragraph()
            header_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = header_para.add_run(f"// {classification} //")
            run.bold = True
            run.font.color.rgb = RGBColor(*CLASSIFICATION_COLORS.get(
                classification, (0x38, 0xBD, 0xF8)
            ))
            run.font.size = Pt(10)

        # Title
        title_para = doc.add_heading(title, level=0)
        title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Date and metadata
        meta_para = doc.add_paragraph()
        meta_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        meta_para.add_run(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        meta_para.add_run(f"Template: {template_def['name']}")

        doc.add_paragraph()  # Spacer

        # Sections
        for section_id, data in section_data.items():
            section_title = data.get("title", section_id.replace("_", " ").title())
            doc.add_heading(section_title, level=1)

            # Summary text
            summary = data.get("summary", "")
            if summary:
                doc.add_paragraph(summary)

            # Metrics
            metrics = data.get("metrics", {})
            if metrics:
                doc.add_heading("Key Metrics", level=2)
                for key, value in metrics.items():
                    doc.add_paragraph(
                        f"{key.replace('_', ' ').title()}: {value}",
                        style='List Bullet'
                    )

            # Table data
            table_data = data.get("table_data", [])
            if table_data and len(table_data) > 1:
                num_cols = len(table_data[0])
                num_rows = len(table_data)
                table = doc.add_table(rows=num_rows, cols=num_cols)
                table.style = 'Light Grid Accent 1'

                for i, row_data in enumerate(table_data):
                    for j, cell_value in enumerate(row_data):
                        cell = table.cell(i, j)
                        cell.text = str(cell_value)
                        if i == 0:
                            for paragraph in cell.paragraphs:
                                for run in paragraph.runs:
                                    run.bold = True

                doc.add_paragraph()  # Spacer

            doc.add_paragraph()  # Section spacer

        # Export disclaimer
        if include_disclaimer:
            doc.add_page_break()
            disclaimer = doc.add_paragraph()
            disclaimer.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = disclaimer.add_run(
                "EXPORT CONTROL DISCLAIMER\n\n"
                "This document contains export-controlled information. "
                "Unauthorized disclosure or transfer is prohibited.\n"
                "Distribution is limited to authorized personnel only."
            )
            run.bold = True
            run.font.size = Pt(10)

        # Classification footer
        if classification:
            doc.add_paragraph()
            footer_para = doc.add_paragraph()
            footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = footer_para.add_run(f"// {classification} //")
            run.bold = True
            run.font.color.rgb = RGBColor(*CLASSIFICATION_COLORS.get(
                classification, (0x38, 0xBD, 0xF8)
            ))
            run.font.size = Pt(10)

        # Save to bytes
        buffer = io.BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        return buffer.read()

    def _generate_pptx(
        self,
        title: str,
        section_data: Dict[str, Dict[str, Any]],
        classification: Optional[str],
        include_disclaimer: bool,
        template_def: Dict[str, Any],
    ) -> bytes:
        """Generate a PowerPoint presentation report.

        Args:
            title: Report title.
            section_data: Dictionary of section data.
            classification: Classification marking.
            include_disclaimer: Whether to include export disclaimer.
            template_def: Template definition.

        Returns:
            PowerPoint file bytes.
        """
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.dml.color import RGBColor
        from pptx.enum.text import PP_ALIGN

        prs = Presentation()
        prs.slide_width = Inches(13.33)
        prs.slide_height = Inches(7.5)

        # Title slide
        slide_layout = prs.slide_layouts[6]  # Blank
        slide = prs.slides.add_slide(slide_layout)

        # Classification header
        if classification:
            header_box = slide.shapes.add_textbox(
                Inches(0), Inches(0), Inches(13.33), Inches(0.3)
            )
            header_tf = header_box.text_frame
            header_p = header_tf.paragraphs[0]
            header_p.text = f"// {classification} //"
            header_p.font.color.rgb = RGBColor(*CLASSIFICATION_COLORS.get(
                classification, (0x38, 0xBD, 0xF8)
            ))
            header_p.font.size = Pt(10)
            header_p.font.bold = True
            header_p.alignment = PP_ALIGN.CENTER

        # Title
        title_box = slide.shapes.add_textbox(
            Inches(1), Inches(2), Inches(11.33), Inches(2)
        )
        title_tf = title_box.text_frame
        title_tf.word_wrap = True
        title_p = title_tf.paragraphs[0]
        title_p.text = title
        title_p.font.size = Pt(36)
        title_p.font.bold = True
        title_p.font.color.rgb = RGBColor(0x1E, 0x3A, 0x5F)
        title_p.alignment = PP_ALIGN.CENTER

        # Subtitle
        subtitle_box = slide.shapes.add_textbox(
            Inches(1), Inches(4.5), Inches(11.33), Inches(1)
        )
        subtitle_tf = subtitle_box.text_frame
        subtitle_tf.word_wrap = True
        subtitle_p = subtitle_tf.paragraphs[0]
        subtitle_p.text = f"{template_def['name']}\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        subtitle_p.font.size = Pt(18)
        subtitle_p.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
        subtitle_p.alignment = PP_ALIGN.CENTER

        # Classification footer
        if classification:
            footer_box = slide.shapes.add_textbox(
                Inches(0), Inches(7.2), Inches(13.33), Inches(0.3)
            )
            footer_tf = footer_box.text_frame
            footer_p = footer_tf.paragraphs[0]
            footer_p.text = f"// {classification} //"
            footer_p.font.color.rgb = RGBColor(*CLASSIFICATION_COLORS.get(
                classification, (0x38, 0xBD, 0xF8)
            ))
            footer_p.font.size = Pt(10)
            footer_p.font.bold = True
            footer_p.alignment = PP_ALIGN.CENTER

        # Section slides
        for section_id, data in section_data.items():
            slide = prs.slides.add_slide(slide_layout)

            # Classification header
            if classification:
                header_box = slide.shapes.add_textbox(
                    Inches(0), Inches(0), Inches(13.33), Inches(0.3)
                )
                header_tf = header_box.text_frame
                header_p = header_tf.paragraphs[0]
                header_p.text = f"// {classification} //"
                header_p.font.color.rgb = RGBColor(*CLASSIFICATION_COLORS.get(
                    classification, (0x38, 0xBD, 0xF8)
                ))
                header_p.font.size = Pt(10)
                header_p.font.bold = True
                header_p.alignment = PP_ALIGN.CENTER

            # Section title
            section_title = data.get("title", section_id.replace("_", " ").title())
            title_box = slide.shapes.add_textbox(
                Inches(0.5), Inches(0.5), Inches(12.33), Inches(0.8)
            )
            title_tf = title_box.text_frame
            title_tf.word_wrap = True
            title_p = title_tf.paragraphs[0]
            title_p.text = section_title
            title_p.font.size = Pt(28)
            title_p.font.bold = True
            title_p.font.color.rgb = RGBColor(0x1E, 0x3A, 0x5F)

            # Summary
            summary = data.get("summary", "")
            if summary:
                summary_box = slide.shapes.add_textbox(
                    Inches(0.5), Inches(1.5), Inches(12.33), Inches(1)
                )
                summary_tf = summary_box.text_frame
                summary_tf.word_wrap = True
                summary_p = summary_tf.paragraphs[0]
                summary_p.text = summary
                summary_p.font.size = Pt(14)
                summary_p.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

            # Metrics
            metrics = data.get("metrics", {})
            if metrics:
                y_pos = 2.5 if summary else 1.5
                card_width = 2.8
                card_height = 1.0
                gap = 0.2

                for i, (key, value) in enumerate(metrics.items()):
                    col = i % 4
                    row = i // 4
                    x = 0.5 + col * (card_width + gap)
                    y = y_pos + row * (card_height + gap)

                    # Card background
                    from pptx.enum.shapes import MSO_SHAPE
                    card = slide.shapes.add_shape(
                        MSO_SHAPE.ROUNDED_RECTANGLE,
                        Inches(x), Inches(y),
                        Inches(card_width), Inches(card_height)
                    )
                    card.fill.solid()
                    card.fill.fore_color.rgb = RGBColor(0xF8, 0xFA, 0xFC)
                    card.line.color.rgb = RGBColor(0xE2, 0xE8, 0xF0)

                    # Metric name
                    name_box = slide.shapes.add_textbox(
                        Inches(x + 0.1), Inches(y + 0.15),
                        Inches(card_width - 0.2), Inches(0.3)
                    )
                    name_tf = name_box.text_frame
                    name_tf.word_wrap = True
                    name_p = name_tf.paragraphs[0]
                    name_p.text = key.replace('_', ' ').title()
                    name_p.font.size = Pt(9)
                    name_p.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

                    # Metric value
                    value_box = slide.shapes.add_textbox(
                        Inches(x + 0.1), Inches(y + 0.5),
                        Inches(card_width - 0.2), Inches(0.3)
                    )
                    value_tf = value_box.text_frame
                    value_tf.word_wrap = True
                    value_p = value_tf.paragraphs[0]
                    value_p.text = str(value)
                    value_p.font.size = Pt(16)
                    value_p.font.bold = True
                    value_p.font.color.rgb = RGBColor(0x1E, 0x3A, 0x5F)

            # Table data
            table_data = data.get("table_data", [])
            if table_data:
                num_rows = len(table_data)
                num_cols = len(table_data[0]) if table_data else 1

                table_top = 4.0 if metrics else 2.5
                table_height = min(3.0, num_rows * 0.3 + 0.4)

                table_shape = slide.shapes.add_table(
                    num_rows, num_cols,
                    Inches(0.5), Inches(table_top),
                    Inches(12.33), Inches(table_height)
                )
                table = table_shape.table

                # Style header row
                for j, header in enumerate(table_data[0]):
                    cell = table.cell(0, j)
                    cell.text = str(header)
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = RGBColor(0x1E, 0x3A, 0x5F)
                    for paragraph in cell.text_frame.paragraphs:
                        paragraph.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                        paragraph.font.size = Pt(9)
                        paragraph.font.bold = True
                        paragraph.alignment = PP_ALIGN.CENTER

                # Style data rows
                for i in range(1, num_rows):
                    for j in range(num_cols):
                        cell = table.cell(i, j)
                        cell.text = str(table_data[i][j])
                        cell.fill.solid()
                        cell.fill.fore_color.rgb = RGBColor(0xF8, 0xFA, 0xFC)
                        for paragraph in cell.text_frame.paragraphs:
                            paragraph.font.size = Pt(8)
                            paragraph.alignment = PP_ALIGN.CENTER

            # Classification footer
            if classification:
                footer_box = slide.shapes.add_textbox(
                    Inches(0), Inches(7.2), Inches(13.33), Inches(0.3)
                )
                footer_tf = footer_box.text_frame
                footer_p = footer_tf.paragraphs[0]
                footer_p.text = f"// {classification} //"
                footer_p.font.color.rgb = RGBColor(*CLASSIFICATION_COLORS.get(
                    classification, (0x38, 0xBD, 0xF8)
                ))
                footer_p.font.size = Pt(10)
                footer_p.font.bold = True
                footer_p.alignment = PP_ALIGN.CENTER

        # Export disclaimer slide
        if include_disclaimer:
            slide = prs.slides.add_slide(slide_layout)

            disclaimer_box = slide.shapes.add_textbox(
                Inches(1), Inches(2), Inches(11.33), Inches(3)
            )
            disclaimer_tf = disclaimer_box.text_frame
            disclaimer_tf.word_wrap = True
            disclaimer_p = disclaimer_tf.paragraphs[0]
            disclaimer_p.text = "EXPORT CONTROL DISCLAIMER"
            disclaimer_p.font.size = Pt(24)
            disclaimer_p.font.bold = True
            disclaimer_p.font.color.rgb = RGBColor(0x1E, 0x3A, 0x5F)
            disclaimer_p.alignment = PP_ALIGN.CENTER

            detail_box = slide.shapes.add_textbox(
                Inches(2), Inches(4), Inches(9.33), Inches(2)
            )
            detail_tf = detail_box.text_frame
            detail_tf.word_wrap = True
            detail_p = detail_tf.paragraphs[0]
            detail_p.text = (
                "This document contains export-controlled information. "
                "Unauthorized disclosure or transfer is prohibited.\n\n"
                "Distribution is limited to authorized personnel only."
            )
            detail_p.font.size = Pt(14)
            detail_p.alignment = PP_ALIGN.CENTER

        # Save to bytes
        buffer = io.BytesIO()
        prs.save(buffer)
        buffer.seek(0)
        return buffer.read()

    # =========================================================================
    # Section Data Handlers
    # =========================================================================

    def _handle_executive_summary(
        self, project_id: Optional[UUID], db: Session
    ) -> Dict[str, Any]:
        """Generate executive summary section data."""
        nodes = db.query(PortfolioNode).limit(50).all()

        total = len(nodes)
        completed = sum(1 for n in nodes if n.percent_complete == 100)
        in_progress = total - completed

        metrics = {
            "Total Items": total,
            "Completed": completed,
            "In Progress": in_progress,
            "Completion Rate": f"{completed / total * 100:.1f}%" if total > 0 else "N/A",
        }

        return {
            "title": "Executive Summary",
            "summary": f"Overview of {total} portfolio items with {completed} completed.",
            "metrics": metrics,
            "data_points": total,
        }

    def _handle_schedule_health(
        self, project_id: Optional[UUID], db: Session
    ) -> Dict[str, Any]:
        """Generate schedule health section data."""
        nodes = db.query(PortfolioNode).limit(50).all()

        delayed = sum(
            1 for n in nodes
            if n.planned_end_date and n.planned_end_date.date() < date.today() and n.percent_complete < 100
        )
        on_track = len(nodes) - delayed

        metrics = {
            "On Track": on_track,
            "Delayed": delayed,
            "Schedule Health": "Green" if delayed == 0 else "Amber" if delayed < 5 else "Red",
        }

        table_data = [
            ["Task", "Start", "Finish", "Status"],
        ]
        for node in nodes[:10]:
            status = "Delayed" if (
                node.planned_end_date and node.planned_end_date.date() < date.today()
                and node.percent_complete < 100
            ) else "On Track"
            table_data.append([
                node.name or "Unnamed",
                str(node.planned_start_date) if node.planned_start_date else "N/A",
                str(node.planned_end_date) if node.planned_end_date else "N/A",
                status,
            ])

        return {
            "title": "Schedule Health",
            "summary": f"Schedule analysis showing {delayed} delayed items.",
            "metrics": metrics,
            "table_data": table_data,
            "data_points": len(nodes),
        }

    def _handle_cost_performance(
        self, project_id: Optional[UUID], db: Session
    ) -> Dict[str, Any]:
        """Generate cost performance section data."""
        nodes = db.query(PortfolioNode).filter(
            PortfolioNode.bac_cost.isnot(None)
        ).limit(20).all()

        total_bac = sum(n.bac_cost or 0 for n in nodes)
        total_ev = sum(n.earned_value or 0 for n in nodes)
        total_ac = sum(n.actual_cost or 0 for n in nodes)

        cpi = float(total_ev) / float(total_ac) if total_ac and float(total_ac) > 0 else 0

        metrics = {
            "BAC": f"£{float(total_bac):,.0f}",
            "EAC": f"£{float(total_bac) / cpi:,.0f}" if cpi > 0 else "N/A",
            "CPI": f"{cpi:.2f}",
            "Variance": f"£{float(total_ev - total_ac):,.0f}",
        }

        return {
            "title": "Cost Performance",
            "summary": f"Cost performance index (CPI) is {cpi:.2f}.",
            "metrics": metrics,
            "data_points": len(nodes),
        }

    def _handle_risk_summary(
        self, project_id: Optional[UUID], db: Session
    ) -> Dict[str, Any]:
        """Generate risk summary section data."""
        blockers = db.query(NodeBlocker).limit(20).all()

        critical = sum(1 for b in blockers if b.severity and b.severity.value == "CRITICAL")
        high = sum(1 for b in blockers if b.severity and b.severity.value == "HIGH")

        metrics = {
            "Total Risks": len(blockers),
            "Critical": critical,
            "High": high,
            "Risk Level": "High" if critical > 0 else "Medium" if high > 0 else "Low",
        }

        return {
            "title": "Risk Summary",
            "summary": f"{len(blockers)} active risks with {critical} critical.",
            "metrics": metrics,
            "data_points": len(blockers),
        }

    def _handle_milestone_status(
        self, project_id: Optional[UUID], db: Session
    ) -> Dict[str, Any]:
        """Generate milestone status section data."""
        milestones = db.query(PortfolioNode).limit(20).all()

        completed = sum(1 for m in milestones if m.percent_complete == 100)

        metrics = {
            "Total Milestones": len(milestones),
            "Completed": completed,
            "Pending": len(milestones) - completed,
        }

        table_data = [
            ["Milestone", "Target Date", "Status"],
        ]
        for m in milestones:
            table_data.append([
                m.name or "Unnamed",
                str(m.planned_end_date) if m.planned_end_date else "N/A",
                "Complete" if m.percent_complete == 100 else "Pending",
            ])

        return {
            "title": "Milestone Status",
            "summary": f"{completed} of {len(milestones)} milestones completed.",
            "metrics": metrics,
            "table_data": table_data,
            "data_points": len(milestones),
        }

    def _handle_resource_utilization(
        self, project_id: Optional[UUID], db: Session
    ) -> Dict[str, Any]:
        """Generate resource utilization section data."""
        assignments = db.query(ResourceAssignment).limit(50).all()

        metrics = {
            "Total Assignments": len(assignments),
        }

        return {
            "title": "Resource Utilization",
            "summary": f"{len(assignments)} resource assignments tracked.",
            "metrics": metrics,
            "data_points": len(assignments),
        }

    # Generic handlers for other sections
    def _handle_project_overview(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_health_metrics(self, project_id, db):
        return self._handle_schedule_health(project_id, db)

    def _handle_milestone_progress(self, project_id, db):
        return self._handle_milestone_status(project_id, db)

    def _handle_resource_allocation(self, project_id, db):
        return self._handle_resource_utilization(project_id, db)

    def _handle_issues_and_blockers(self, project_id, db):
        return self._handle_risk_summary(project_id, db)

    def _handle_executive_overview(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_key_metrics(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_rag_status(self, project_id, db):
        return self._handle_schedule_health(project_id, db)

    def _handle_critical_issues(self, project_id, db):
        return self._handle_risk_summary(project_id, db)

    def _handle_risk_matrix(self, project_id, db):
        return self._handle_risk_summary(project_id, db)

    def _handle_top_risks(self, project_id, db):
        return self._handle_risk_summary(project_id, db)

    def _handle_mitigation_plans(self, project_id, db):
        return self._handle_risk_summary(project_id, db)

    def _handle_evm_summary(self, project_id, db):
        return self._handle_cost_performance(project_id, db)

    def _handle_cpi_spi_analysis(self, project_id, db):
        return self._handle_cost_performance(project_id, db)

    def _handle_forecast_data(self, project_id, db):
        return self._handle_cost_performance(project_id, db)

    def _handle_variance_analysis(self, project_id, db):
        return self._handle_cost_performance(project_id, db)

    def _handle_procurement_summary(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_active_orders(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_supplier_performance(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_delivery_status(self, project_id, db):
        return self._handle_milestone_status(project_id, db)

    def _handle_allocation_matrix(self, project_id, db):
        return self._handle_resource_utilization(project_id, db)

    def _handle_utilization_metrics(self, project_id, db):
        return self._handle_resource_utilization(project_id, db)

    def _handle_capacity_planning(self, project_id, db):
        return self._handle_resource_utilization(project_id, db)

    def _handle_upcoming_milestones(self, project_id, db):
        return self._handle_milestone_status(project_id, db)

    def _handle_risk_to_milestones(self, project_id, db):
        return self._handle_risk_summary(project_id, db)

    def _handle_pending_changes(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_approved_changes(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_impact_analysis(self, project_id, db):
        return self._handle_cost_performance(project_id, db)

    def _handle_quality_summary(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_test_results(self, project_id, db):
        return self._handle_executive_summary(project_id, db)

    def _handle_defect_analysis(self, project_id, db):
        return self._handle_risk_summary(project_id, db)

    def _handle_compliance_status(self, project_id, db):
        return self._handle_milestone_status(project_id, db)


report_template_service = ReportTemplateService()
