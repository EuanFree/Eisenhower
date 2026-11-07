"""Tests for Export Schemas.

This module tests all Pydantic schemas used for view exports and report
template generation, including enum validation, required fields, defaults,
and serialization.
"""
import pytest
from uuid import uuid4

from app.schemas.export_schemas import (
    ExportFormat,
    ViewType,
    ReportTemplateType,
    ViewExportRequest,
    ViewExportResponse,
    ReportTemplateRequest,
    ReportSectionInfo,
    ReportTemplateResponse,
    TemplateCatalogEntry,
    TemplateCatalogResponse,
)


# ============================================================================
# Enum Tests
# ============================================================================

class TestExportFormat:
    """Tests for ExportFormat enum."""

    def test_png_value(self):
        """PNG format has correct string value."""
        assert ExportFormat.PNG.value == "png"

    def test_pptx_value(self):
        """PPTX format has correct string value."""
        assert ExportFormat.PPTX.value == "pptx"

    def test_docx_value(self):
        """DOCX format has correct string value."""
        assert ExportFormat.DOCX.value == "docx"

    def test_all_formats_count(self):
        """There are exactly 3 export formats."""
        assert len(ExportFormat) == 3

    def test_format_from_string(self):
        """Format can be constructed from string value."""
        assert ExportFormat("png") == ExportFormat.PNG
        assert ExportFormat("pptx") == ExportFormat.PPTX
        assert ExportFormat("docx") == ExportFormat.DOCX

    def test_format_invalid_string(self):
        """Invalid string raises ValueError."""
        with pytest.raises(ValueError):
            ExportFormat("invalid")


class TestViewType:
    """Tests for ViewType enum."""

    def test_dashboard_value(self):
        """Dashboard view type has correct value."""
        assert ViewType.DASHBOARD.value == "dashboard"

    def test_gantt_value(self):
        """Gantt view type has correct value."""
        assert ViewType.GANTT.value == "gantt"

    def test_all_view_types_count(self):
        """There are exactly 23 view types."""
        assert len(ViewType) == 23

    def test_all_view_type_values(self):
        """All expected view type values are present."""
        expected = {
            "dashboard", "gantt", "cockpit", "wbs", "risk", "evm",
            "procurement", "reserves", "facilities", "equipment",
            "engineering", "commercial", "materials", "schedule",
            "calendars", "costing", "cdrl", "subcontractors",
            "supplier", "audit", "merkle", "spatial", "currency",
        }
        actual = {vt.value for vt in ViewType}
        assert actual == expected

    def test_view_type_from_string(self):
        """ViewType can be constructed from string value."""
        assert ViewType("dashboard") == ViewType.DASHBOARD
        assert ViewType("evm") == ViewType.EVM

    def test_view_type_invalid_string(self):
        """Invalid string raises ValueError."""
        with pytest.raises(ValueError):
            ViewType("nonexistent")


class TestReportTemplateType:
    """Tests for ReportTemplateType enum."""

    def test_programme_status_value(self):
        """Programme status template has correct value."""
        assert ReportTemplateType.PROGRAMME_STATUS.value == "programme_status"

    def test_all_template_types_count(self):
        """There are exactly 10 report template types."""
        assert len(ReportTemplateType) == 10

    def test_all_template_type_values(self):
        """All expected template type values are present."""
        expected = {
            "programme_status", "project_health", "executive_summary",
            "risk_register", "evm_report", "procurement_status",
            "resource_utilization", "milestone_tracker", "change_control",
            "quality_assurance",
        }
        actual = {tt.value for tt in ReportTemplateType}
        assert actual == expected

    def test_template_type_from_string(self):
        """ReportTemplateType can be constructed from string value."""
        assert ReportTemplateType("evm_report") == ReportTemplateType.EVM_REPORT


# ============================================================================
# ViewExportRequest Tests
# ============================================================================

class TestViewExportRequest:
    """Tests for ViewExportRequest schema."""

    def test_minimal_valid_request(self):
        """A request with only required fields is valid."""
        req = ViewExportRequest(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
        )
        assert req.view_type == ViewType.DASHBOARD
        assert req.format == ExportFormat.PNG
        assert req.project_id is None
        assert req.dashboard_id is None
        assert req.include_classification is True
        assert req.title_override is None
        assert req.width == 1920
        assert req.height == 1080

    def test_request_with_all_fields(self):
        """A request with all fields populated is valid."""
        project_id = str(uuid4())
        dashboard_id = str(uuid4())
        req = ViewExportRequest(
            view_type=ViewType.GANTT,
            format=ExportFormat.PPTX,
            project_id=project_id,
            dashboard_id=dashboard_id,
            include_classification=False,
            title_override="Custom Title",
            width=1280,
            height=720,
        )
        assert req.view_type == ViewType.GANTT
        assert req.format == ExportFormat.PPTX
        assert req.project_id == project_id
        assert req.dashboard_id == dashboard_id
        assert req.include_classification is False
        assert req.title_override == "Custom Title"
        assert req.width == 1280
        assert req.height == 720

    def test_missing_view_type_raises(self):
        """Missing view_type raises validation error."""
        with pytest.raises(Exception):
            ViewExportRequest(format=ExportFormat.PNG)

    def test_missing_format_raises(self):
        """Missing format raises validation error."""
        with pytest.raises(Exception):
            ViewExportRequest(view_type=ViewType.DASHBOARD)

    def test_invalid_view_type_raises(self):
        """Invalid view_type string raises validation error."""
        with pytest.raises(Exception):
            ViewExportRequest(
                view_type="nonexistent_view",
                format=ExportFormat.PNG,
            )

    def test_invalid_format_raises(self):
        """Invalid format string raises validation error."""
        with pytest.raises(Exception):
            ViewExportRequest(
                view_type=ViewType.DASHBOARD,
                format="invalid_format",
            )

    def test_default_classification_is_true(self):
        """include_classification defaults to True."""
        req = ViewExportRequest(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
        )
        assert req.include_classification is True

    def test_default_dimensions(self):
        """Default width and height are 1920x1080."""
        req = ViewExportRequest(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
        )
        assert req.width == 1920
        assert req.height == 1080

    def test_from_dict_with_string_enums(self):
        """Request can be created from dict with string enum values."""
        req = ViewExportRequest(
            view_type="dashboard",
            format="png",
        )
        assert req.view_type == ViewType.DASHBOARD
        assert req.format == ExportFormat.PNG

    def test_serialization(self):
        """Request serializes to dict correctly."""
        req = ViewExportRequest(
            view_type=ViewType.EVM,
            format=ExportFormat.PPTX,
        )
        data = req.model_dump()
        assert data["view_type"] == "evm"
        assert data["format"] == "pptx"


# ============================================================================
# ViewExportResponse Tests
# ============================================================================

class TestViewExportResponse:
    """Tests for ViewExportResponse schema."""

    def test_valid_response(self):
        """A response with all required fields is valid."""
        resp = ViewExportResponse(
            export_id="test-export-123",
            format="png",
            file_size_bytes=1024,
            title="Dashboard View",
            generated_at="2024-01-01T00:00:00",
            message="View exported successfully",
        )
        assert resp.export_id == "test-export-123"
        assert resp.format == "png"
        assert resp.file_size_bytes == 1024
        assert resp.classification is None

    def test_response_with_classification(self):
        """Response can include classification."""
        resp = ViewExportResponse(
            export_id="test-export-123",
            format="pptx",
            file_size_bytes=2048,
            title="Gantt View",
            classification="SECRET",
            generated_at="2024-01-01T00:00:00",
            message="View exported successfully",
        )
        assert resp.classification == "SECRET"

    def test_missing_export_id_raises(self):
        """Missing export_id raises validation error."""
        with pytest.raises(Exception):
            ViewExportResponse(
                format="png",
                file_size_bytes=100,
                title="Test",
                generated_at="2024-01-01T00:00:00",
                message="OK",
            )

    def test_missing_format_raises(self):
        """Missing format raises validation error."""
        with pytest.raises(Exception):
            ViewExportResponse(
                export_id="test",
                file_size_bytes=100,
                title="Test",
                generated_at="2024-01-01T00:00:00",
                message="OK",
            )

    def test_file_size_zero(self):
        """File size can be zero."""
        resp = ViewExportResponse(
            export_id="test",
            format="png",
            file_size_bytes=0,
            title="Empty",
            generated_at="2024-01-01T00:00:00",
            message="OK",
        )
        assert resp.file_size_bytes == 0


# ============================================================================
# ReportTemplateRequest Tests
# ============================================================================

class TestReportTemplateRequest:
    """Tests for ReportTemplateRequest schema."""

    def test_minimal_valid_request(self):
        """A request with only required fields is valid."""
        req = ReportTemplateRequest(
            template_type=ReportTemplateType.PROGRAMME_STATUS,
            format=ExportFormat.DOCX,
        )
        assert req.template_type == ReportTemplateType.PROGRAMME_STATUS
        assert req.format == ExportFormat.DOCX
        assert req.project_id is None
        assert req.status_date is None
        assert req.title_override is None
        assert req.classification_override is None
        assert req.include_export_disclaimer is True
        assert req.sections is None

    def test_request_with_all_fields(self):
        """A request with all fields populated is valid."""
        req = ReportTemplateRequest(
            template_type=ReportTemplateType.EVM_REPORT,
            format=ExportFormat.PPTX,
            project_id=str(uuid4()),
            status_date="2024-06-30",
            title_override="Q2 EVM Report",
            classification_override="SECRET",
            include_export_disclaimer=False,
            sections=["evm_summary", "cpi_spi_analysis"],
        )
        assert req.template_type == ReportTemplateType.EVM_REPORT
        assert req.status_date == "2024-06-30"
        assert req.classification_override == "SECRET"
        assert req.include_export_disclaimer is False
        assert req.sections == ["evm_summary", "cpi_spi_analysis"]

    def test_missing_template_type_raises(self):
        """Missing template_type raises validation error."""
        with pytest.raises(Exception):
            ReportTemplateRequest(format=ExportFormat.DOCX)

    def test_missing_format_raises(self):
        """Missing format raises validation error."""
        with pytest.raises(Exception):
            ReportTemplateRequest(template_type=ReportTemplateType.EVM_REPORT)

    def test_invalid_template_type_raises(self):
        """Invalid template_type raises validation error."""
        with pytest.raises(Exception):
            ReportTemplateRequest(
                template_type="nonexistent",
                format=ExportFormat.DOCX,
            )

    def test_default_disclaimer_is_true(self):
        """include_export_disclaimer defaults to True."""
        req = ReportTemplateRequest(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
        )
        assert req.include_export_disclaimer is True

    def test_from_dict_with_string_enums(self):
        """Request can be created from dict with string enum values."""
        req = ReportTemplateRequest(
            template_type="risk_register",
            format="pptx",
        )
        assert req.template_type == ReportTemplateType.RISK_REGISTER
        assert req.format == ExportFormat.PPTX


# ============================================================================
# ReportSectionInfo Tests
# ============================================================================

class TestReportSectionInfo:
    """Tests for ReportSectionInfo schema."""

    def test_minimal_valid_section(self):
        """A section with only required fields is valid."""
        section = ReportSectionInfo(
            section_id="executive_summary",
            section_title="Executive Summary",
        )
        assert section.section_id == "executive_summary"
        assert section.section_title == "Executive Summary"
        assert section.page_count == 1
        assert section.data_points == 0

    def test_section_with_all_fields(self):
        """A section with all fields is valid."""
        section = ReportSectionInfo(
            section_id="risk_matrix",
            section_title="Risk Matrix",
            page_count=3,
            data_points=25,
        )
        assert section.page_count == 3
        assert section.data_points == 25

    def test_missing_section_id_raises(self):
        """Missing section_id raises validation error."""
        with pytest.raises(Exception):
            ReportSectionInfo(section_title="Test")


# ============================================================================
# ReportTemplateResponse Tests
# ============================================================================

class TestReportTemplateResponse:
    """Tests for ReportTemplateResponse schema."""

    def test_valid_response(self):
        """A response with all required fields is valid."""
        resp = ReportTemplateResponse(
            report_id="test-report-123",
            template_type="programme_status",
            format="docx",
            title="Programme Status Report",
            section_count=5,
            file_size_bytes=4096,
            classification="OFFICIAL",
            generated_at="2024-01-01T00:00:00",
            message="Report generated successfully",
        )
        assert resp.report_id == "test-report-123"
        assert resp.section_count == 5
        assert resp.sections == []

    def test_response_with_sections(self):
        """Response can include section info."""
        sections = [
            ReportSectionInfo(
                section_id="executive_summary",
                section_title="Executive Summary",
                page_count=1,
                data_points=10,
            ),
            ReportSectionInfo(
                section_id="risk_summary",
                section_title="Risk Summary",
                page_count=2,
                data_points=25,
            ),
        ]
        resp = ReportTemplateResponse(
            report_id="test-report-123",
            template_type="programme_status",
            format="docx",
            title="Programme Status Report",
            section_count=2,
            sections=sections,
            file_size_bytes=4096,
            classification="SECRET",
            generated_at="2024-01-01T00:00:00",
            message="Report generated successfully",
        )
        assert len(resp.sections) == 2
        assert resp.sections[0].section_id == "executive_summary"
        assert resp.sections[1].data_points == 25

    def test_missing_report_id_raises(self):
        """Missing report_id raises validation error."""
        with pytest.raises(Exception):
            ReportTemplateResponse(
                template_type="test",
                format="docx",
                title="Test",
                section_count=0,
                file_size_bytes=0,
                classification="OFFICIAL",
                generated_at="2024-01-01T00:00:00",
                message="OK",
            )


# ============================================================================
# Template Catalog Tests
# ============================================================================

class TestTemplateCatalogEntry:
    """Tests for TemplateCatalogEntry schema."""

    def test_valid_entry(self):
        """A catalog entry with all fields is valid."""
        entry = TemplateCatalogEntry(
            template_type="programme_status",
            name="Programme Status Report",
            description="Comprehensive programme status report",
            supported_formats=["docx", "pptx"],
            sections=["executive_summary", "schedule_health"],
        )
        assert entry.template_type == "programme_status"
        assert "docx" in entry.supported_formats
        assert "pptx" in entry.supported_formats
        assert len(entry.sections) == 2

    def test_missing_template_type_raises(self):
        """Missing template_type raises validation error."""
        with pytest.raises(Exception):
            TemplateCatalogEntry(
                name="Test",
                description="Test",
                supported_formats=["docx"],
                sections=[],
            )


class TestTemplateCatalogResponse:
    """Tests for TemplateCatalogResponse schema."""

    def test_valid_response(self):
        """A catalog response with entries is valid."""
        entries = [
            TemplateCatalogEntry(
                template_type="programme_status",
                name="Programme Status Report",
                description="Comprehensive programme status report",
                supported_formats=["docx", "pptx"],
                sections=["executive_summary"],
            ),
            TemplateCatalogEntry(
                template_type="evm_report",
                name="EVM Report",
                description="Earned Value Management report",
                supported_formats=["docx", "pptx"],
                sections=["evm_summary"],
            ),
        ]
        resp = TemplateCatalogResponse(templates=entries)
        assert len(resp.templates) == 2
        assert resp.templates[0].template_type == "programme_status"

    def test_empty_catalog(self):
        """A catalog response with no entries is valid."""
        resp = TemplateCatalogResponse(templates=[])
        assert len(resp.templates) == 0
