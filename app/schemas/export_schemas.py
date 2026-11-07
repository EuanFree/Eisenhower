"""Export Schemas for View and Report Exports.

This module defines Pydantic schemas for exporting GUI views to PNG images,
PowerPoint slides, and template reports in both Word and PowerPoint formats.

Export Types
~~~~~~~~~~~~

1. **View to PNG** — Captures any GUI view (dashboard, Gantt, cockpit, etc.)
   as a PNG image snapshot.

2. **View to PowerPoint** — Exports any GUI view as a PowerPoint slide with
   the view's data rendered as charts, tables, and text.

3. **Word Template Report** — Generates a structured Word document report
   using predefined templates (programme status, project health, etc.).

4. **PowerPoint Template Report** — Generates a structured PowerPoint
   presentation using predefined templates.

Security
~~~~~~~~

All exports require JWT authentication and ABAC clearance checks.
Classification markings are automatically applied to exported documents.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ExportFormat(str, Enum):
    """Supported export formats."""
    PNG = "png"
    PPTX = "pptx"
    DOCX = "docx"


class ViewType(str, Enum):
    """Supported GUI view types for export."""
    DASHBOARD = "dashboard"
    GANTT = "gantt"
    COCKPIT = "cockpit"
    WBS = "wbs"
    RISK = "risk"
    EVM = "evm"
    PROCUREMENT = "procurement"
    RESERVES = "reserves"
    FACILITIES = "facilities"
    EQUIPMENT = "equipment"
    ENGINEERING = "engineering"
    COMMERCIAL = "commercial"
    MATERIALS = "materials"
    SCHEDULE = "schedule"
    CALENDARS = "calendars"
    COSTING = "costing"
    CDRL = "cdrl"
    SUBCONTRACTORS = "subcontractors"
    SUPPLIER = "supplier"
    AUDIT = "audit"
    MERKLE = "merkle"
    SPATIAL = "spatial"
    CURRENCY = "currency"


class ReportTemplateType(str, Enum):
    """Predefined report template types."""
    PROGRAMME_STATUS = "programme_status"
    PROJECT_HEALTH = "project_health"
    EXECUTIVE_SUMMARY = "executive_summary"
    RISK_REGISTER = "risk_register"
    EVM_REPORT = "evm_report"
    PROCUREMENT_STATUS = "procurement_status"
    RESOURCE_UTILIZATION = "resource_utilization"
    MILESTONE_TRACKER = "milestone_tracker"
    CHANGE_CONTROL = "change_control"
    QUALITY_ASSURANCE = "quality_assurance"


# ---------------------------------------------------------------------------
# View Export Schemas
# ---------------------------------------------------------------------------

class ViewExportRequest(BaseModel):
    """Request schema for exporting a GUI view to PNG or PowerPoint.

    Attributes
    ----------
    view_type : ViewType
        The type of GUI view to export.
    format : ExportFormat
        The export format ("png" or "pptx").
    project_id : str or None
        Optional UUID of the project/programme context for the view.
    dashboard_id : str or None
        Optional UUID of a specific dashboard to export.
    include_classification : bool
        Whether to include classification stamps on the export.
        Default is True.
    title_override : str or None
        Optional custom title for the exported view.
    width : int or None
        Optional width in pixels for PNG exports (default: 1920).
    height : int or None
        Optional height in pixels for PNG exports (default: 1080).
    """

    view_type: ViewType = Field(
        ..., description="Type of GUI view to export"
    )
    format: ExportFormat = Field(
        ..., description="Export format: 'png' or 'pptx'"
    )
    project_id: Optional[str] = Field(
        default=None,
        description="UUID of the project/programme context",
    )
    dashboard_id: Optional[str] = Field(
        default=None,
        description="UUID of a specific dashboard to export",
    )
    include_classification: bool = Field(
        default=True,
        description="Include classification stamps on export",
    )
    title_override: Optional[str] = Field(
        default=None,
        description="Custom title for the exported view",
    )
    width: Optional[int] = Field(
        default=1920,
        description="Width in pixels for PNG exports",
    )
    height: Optional[int] = Field(
        default=1080,
        description="Height in pixels for PNG exports",
    )


class ViewExportResponse(BaseModel):
    """Response schema for view export.

    Attributes
    ----------
    export_id : str
        Unique identifier for the export operation.
    format : str
        The export format used.
    file_size_bytes : int
        Size of the exported file in bytes.
    title : str
        Title of the exported view.
    classification : str or None
        Classification marking applied to the export.
    generated_at : str
        Timestamp when the export was generated.
    message : str
        Human-readable summary of the export result.
    """

    export_id: str
    format: str
    file_size_bytes: int
    title: str
    classification: Optional[str] = None
    generated_at: str
    message: str


# ---------------------------------------------------------------------------
# Report Template Schemas
# ---------------------------------------------------------------------------

class ReportTemplateRequest(BaseModel):
    """Request schema for generating a template report.

    Attributes
    ----------
    template_type : ReportTemplateType
        The type of report template to use.
    format : ExportFormat
        The output format ("docx" or "pptx").
    project_id : str or None
        Optional UUID of the project/programme for the report.
    status_date : str or None
        Optional reporting cut-off date (ISO format).
    title_override : str or None
        Optional custom title for the report.
    classification_override : str or None
        Optional override for the classification marking.
    include_export_disclaimer : bool
        Whether to include export-control disclaimer.
        Default is True.
    sections : list[str] or None
        Optional list of section identifiers to include.
        If None, all sections are included.
    """

    template_type: ReportTemplateType = Field(
        ..., description="Type of report template"
    )
    format: ExportFormat = Field(
        ..., description="Output format: 'docx' or 'pptx'"
    )
    project_id: Optional[str] = Field(
        default=None,
        description="UUID of the project/programme",
    )
    status_date: Optional[str] = Field(
        default=None,
        description="Reporting cut-off date (ISO format)",
    )
    title_override: Optional[str] = Field(
        default=None,
        description="Custom title for the report",
    )
    classification_override: Optional[str] = Field(
        default=None,
        description="Override classification marking",
    )
    include_export_disclaimer: bool = Field(
        default=True,
        description="Include export-control disclaimer",
    )
    sections: Optional[List[str]] = Field(
        default=None,
        description="Section identifiers to include. None = all sections.",
    )


class ReportSectionInfo(BaseModel):
    """Metadata about a single report section.

    Attributes
    ----------
    section_id : str
        Identifier for the section.
    section_title : str
        Title of the section.
    page_count : int
        Number of pages/slides in this section.
    data_points : int
        Number of data points included.
    """

    section_id: str
    section_title: str
    page_count: int = 1
    data_points: int = 0


class ReportTemplateResponse(BaseModel):
    """Response schema for template report generation.

    Attributes
    ----------
    report_id : str
        Unique identifier for the generated report.
    template_type : str
        Type of template used.
    format : str
        Output format used.
    title : str
        Title of the report.
    section_count : int
        Number of sections in the report.
    sections : list[ReportSectionInfo]
        Metadata for each section.
    file_size_bytes : int
        Size of the generated file in bytes.
    classification : str
        Classification marking applied.
    generated_at : str
        Timestamp when the report was generated.
    message : str
        Human-readable summary of the generation result.
    """

    report_id: str
    template_type: str
    format: str
    title: str
    section_count: int
    sections: List[ReportSectionInfo] = []
    file_size_bytes: int
    classification: str
    generated_at: str
    message: str


# ---------------------------------------------------------------------------
# Template Catalog Schemas
# ---------------------------------------------------------------------------

class TemplateCatalogEntry(BaseModel):
    """Entry in the template catalog.

    Attributes
    ----------
    template_type : str
        Template type identifier.
    name : str
        Human-readable name of the template.
    description : str
        Description of what the template produces.
    supported_formats : list[str]
        List of supported output formats.
    sections : list[str]
        List of section identifiers available in the template.
    """

    template_type: str
    name: str
    description: str
    supported_formats: List[str]
    sections: List[str]


class TemplateCatalogResponse(BaseModel):
    """Response schema for listing available templates.

    Attributes
    ----------
    templates : list[TemplateCatalogEntry]
        List of available report templates.
    """

    templates: List[TemplateCatalogEntry]
