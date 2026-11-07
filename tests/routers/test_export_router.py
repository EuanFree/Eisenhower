"""Tests for Export API Router.

This module tests all API endpoints in the export router, including view export,
report generation, template listing, and view type listing. Tests use FastAPI's
TestClient with mocked services and an in-memory SQLite database so they run
without requiring PostgreSQL.

Fixtures are defined in conftest.py which sets DATABASE_URL to SQLite before
any app imports.
"""
from datetime import date

import pytest

from app.schemas.export_schemas import ViewType, ExportFormat, ReportTemplateType


# ============================================================================
# View Export Endpoint Tests
# ============================================================================

class TestExportViewEndpoint:
    """Tests for POST /api/v1/export/view endpoint."""

    def test_export_dashboard_png(self, client, sample_project):
        """Export dashboard view to PNG returns 200."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "project_id": str(sample_project.id),
            },
        )
        assert response.status_code == 200
        assert len(response.content) > 0
        assert "attachment" in response.headers.get("content-disposition", "")
        assert response.headers.get("x-export-id") is not None

    def test_export_gantt_pptx(self, client):
        """Export Gantt view to PPTX returns 200."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "gantt",
                "format": "pptx",
            },
        )
        assert response.status_code == 200
        assert len(response.content) > 0
        assert response.headers.get("x-export-format") == "pptx"

    def test_export_with_title_override(self, client):
        """Export with custom title returns 200."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "title_override": "My Custom Export",
            },
        )
        assert response.status_code == 200

    def test_export_without_classification(self, client):
        """Export without classification stamps returns 200."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "include_classification": False,
            },
        )
        assert response.status_code == 200

    def test_export_with_custom_dimensions(self, client):
        """Export with custom dimensions returns 200."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "width": 1280,
                "height": 720,
            },
        )
        assert response.status_code == 200

    def test_export_with_valid_dashboard_id(self, client):
        """Export with valid dashboard_id returns 200."""
        import uuid
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "dashboard_id": str(uuid.uuid4()),
            },
        )
        assert response.status_code == 200

    def test_export_with_invalid_dashboard_id_format(self, client):
        """Export with invalid dashboard_id format returns 422."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "dashboard_id": "not-a-uuid",
            },
        )
        assert response.status_code == 422

    def test_export_with_both_project_and_dashboard_id(self, client, sample_project):
        """Export with both project_id and dashboard_id returns 200."""
        import uuid
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "project_id": str(sample_project.id),
                "dashboard_id": str(uuid.uuid4()),
            },
        )
        assert response.status_code == 200

    def test_export_invalid_format_returns_400(self, client):
        """Export with DOCX format returns 400."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "docx",
            },
        )
        assert response.status_code == 400

    def test_export_invalid_project_id_returns_404(self, client):
        """Export with non-existent project returns 404."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "project_id": "00000000-0000-0000-0000-000000000000",
            },
        )
        assert response.status_code == 404

    def test_export_invalid_project_id_format_returns_422(self, client):
        """Export with invalid project_id format returns 422."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "project_id": "not-a-uuid",
            },
        )
        assert response.status_code == 422

    def test_export_missing_view_type_returns_422(self, client):
        """Export without view_type returns 422."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "format": "png",
            },
        )
        assert response.status_code == 422

    def test_export_missing_format_returns_422(self, client):
        """Export without format returns 422."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
            },
        )
        assert response.status_code == 422

    def test_export_all_view_types(self, client):
        """All 23 view types can be exported via API."""
        view_types = [
            "dashboard", "gantt", "cockpit", "wbs", "risk", "evm",
            "procurement", "reserves", "facilities", "equipment",
            "engineering", "commercial", "materials", "schedule",
            "calendars", "costing", "cdrl", "subcontractors",
            "supplier", "audit", "merkle", "spatial", "currency",
        ]
        for vt in view_types:
            response = client.post(
                "/api/v1/export/view",
                json={
                    "view_type": vt,
                    "format": "png",
                },
            )
            assert response.status_code == 200, f"Failed for view type: {vt}"

    def test_export_png_content_type(self, client):
        """PNG export has correct content type."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
            },
        )
        assert response.status_code == 200
        assert "image/png" in response.headers.get("content-type", "")

    def test_export_pptx_content_type(self, client):
        """PPTX export has correct content type."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "pptx",
            },
        )
        assert response.status_code == 200
        assert "presentationml" in response.headers.get("content-type", "")

    def test_export_filename_header(self, client):
        """Export response includes filename in Content-Disposition."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
            },
        )
        assert response.status_code == 200
        disposition = response.headers.get("content-disposition", "")
        assert "filename=" in disposition


# ============================================================================
# Report Generation Endpoint Tests
# ============================================================================

class TestGenerateReportEndpoint:
    """Tests for POST /api/v1/export/report endpoint."""

    def test_generate_programme_status_docx(self, client, sample_project):
        """Generate programme status report as DOCX returns 200."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "programme_status",
                "format": "docx",
                "project_id": str(sample_project.id),
            },
        )
        assert response.status_code == 200
        assert len(response.content) > 0
        assert "attachment" in response.headers.get("content-disposition", "")
        assert response.headers.get("x-report-id") is not None

    def test_generate_executive_summary_pptx(self, client):
        """Generate executive summary as PPTX returns 200."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "pptx",
            },
        )
        assert response.status_code == 200
        assert response.headers.get("x-report-format") == "pptx"

    def test_generate_with_title_override(self, client):
        """Report with custom title returns 200."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
                "title_override": "Custom Report",
            },
        )
        assert response.status_code == 200

    def test_generate_with_classification_override(self, client):
        """Report with classification override returns 200."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
                "classification_override": "TOP_SECRET",
            },
        )
        assert response.status_code == 200

    def test_generate_with_status_date(self, client):
        """Report with status date returns 200."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
                "status_date": "2024-06-30",
            },
        )
        assert response.status_code == 200

    def test_generate_with_selected_sections(self, client):
        """Report with selected sections returns 200."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "programme_status",
                "format": "docx",
                "sections": ["executive_summary", "risk_summary"],
            },
        )
        assert response.status_code == 200

    def test_generate_without_disclaimer(self, client):
        """Report without disclaimer returns 200."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
                "include_export_disclaimer": False,
            },
        )
        assert response.status_code == 200

    def test_generate_invalid_format_returns_400(self, client):
        """Report with PNG format returns 400."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "png",
            },
        )
        assert response.status_code == 400

    def test_generate_invalid_project_id_returns_404(self, client):
        """Report with non-existent project returns 404."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
                "project_id": "00000000-0000-0000-0000-000000000000",
            },
        )
        assert response.status_code == 404

    def test_generate_invalid_project_id_format_returns_422(self, client):
        """Report with invalid project_id format returns 422."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
                "project_id": "not-a-uuid",
            },
        )
        assert response.status_code == 422

    def test_generate_invalid_status_date_returns_422(self, client):
        """Report with invalid status_date returns 422."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
                "status_date": "not-a-date",
            },
        )
        assert response.status_code == 422

    def test_generate_missing_template_type_returns_422(self, client):
        """Report without template_type returns 422."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "format": "docx",
            },
        )
        assert response.status_code == 422

    def test_generate_missing_format_returns_422(self, client):
        """Report without format returns 422."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
            },
        )
        assert response.status_code == 422

    def test_generate_all_templates_docx(self, client):
        """All 10 templates can be generated as DOCX via API."""
        templates = [
            "programme_status", "project_health", "executive_summary",
            "risk_register", "evm_report", "procurement_status",
            "resource_utilization", "milestone_tracker", "change_control",
            "quality_assurance",
        ]
        for tt in templates:
            response = client.post(
                "/api/v1/export/report",
                json={
                    "template_type": tt,
                    "format": "docx",
                },
            )
            assert response.status_code == 200, f"Failed for template: {tt}"

    def test_generate_all_templates_pptx(self, client):
        """All 10 templates can be generated as PPTX via API."""
        templates = [
            "programme_status", "project_health", "executive_summary",
            "risk_register", "evm_report", "procurement_status",
            "resource_utilization", "milestone_tracker", "change_control",
            "quality_assurance",
        ]
        for tt in templates:
            response = client.post(
                "/api/v1/export/report",
                json={
                    "template_type": tt,
                    "format": "pptx",
                },
            )
            assert response.status_code == 200, f"Failed for template: {tt}"

    def test_generate_docx_content_type(self, client):
        """DOCX report has correct content type."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
            },
        )
        assert response.status_code == 200
        assert "wordprocessingml" in response.headers.get("content-type", "")

    def test_generate_pptx_content_type(self, client):
        """PPTX report has correct content type."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "pptx",
            },
        )
        assert response.status_code == 200
        assert "presentationml" in response.headers.get("content-type", "")

    def test_generate_classification_header(self, client, sample_project):
        """Report response includes classification header."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
                "project_id": str(sample_project.id),
            },
        )
        assert response.status_code == 200
        assert response.headers.get("x-report-classification") is not None

    def test_generate_filename_header(self, client):
        """Report response includes filename in Content-Disposition."""
        response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "executive_summary",
                "format": "docx",
            },
        )
        assert response.status_code == 200
        disposition = response.headers.get("content-disposition", "")
        assert "filename=" in disposition


# ============================================================================
# Template Listing Endpoint Tests
# ============================================================================

class TestListTemplatesEndpoint:
    """Tests for GET /api/v1/export/templates endpoint."""

    def test_list_templates_returns_200(self, client):
        """List templates returns 200."""
        response = client.get("/api/v1/export/templates")
        assert response.status_code == 200

    def test_list_templates_returns_all_templates(self, client):
        """List templates returns all 10 templates."""
        response = client.get("/api/v1/export/templates")
        data = response.json()
        assert "templates" in data
        assert len(data["templates"]) == 10

    def test_list_templates_has_required_fields(self, client):
        """Each template entry has required fields."""
        response = client.get("/api/v1/export/templates")
        data = response.json()
        for template in data["templates"]:
            assert "template_type" in template
            assert "name" in template
            assert "description" in template
            assert "supported_formats" in template
            assert "sections" in template

    def test_list_templates_supported_formats(self, client):
        """Each template supports docx and pptx."""
        response = client.get("/api/v1/export/templates")
        data = response.json()
        for template in data["templates"]:
            assert "docx" in template["supported_formats"]
            assert "pptx" in template["supported_formats"]

    def test_list_templates_has_sections(self, client):
        """Each template has at least one section."""
        response = client.get("/api/v1/export/templates")
        data = response.json()
        for template in data["templates"]:
            assert len(template["sections"]) >= 1


# ============================================================================
# View Types Listing Endpoint Tests
# ============================================================================

class TestListViewTypesEndpoint:
    """Tests for GET /api/v1/export/view-types endpoint."""

    def test_list_view_types_returns_200(self, client):
        """List view types returns 200."""
        response = client.get("/api/v1/export/view-types")
        assert response.status_code == 200

    def test_list_view_types_returns_all_types(self, client):
        """List view types returns all 23 view types."""
        response = client.get("/api/v1/export/view-types")
        data = response.json()
        assert "view_types" in data
        assert len(data["view_types"]) == 23

    def test_list_view_types_contains_dashboard(self, client):
        """View types list contains dashboard."""
        response = client.get("/api/v1/export/view-types")
        data = response.json()
        assert "dashboard" in data["view_types"]

    def test_list_view_types_contains_gantt(self, client):
        """View types list contains gantt."""
        response = client.get("/api/v1/export/view-types")
        data = response.json()
        assert "gantt" in data["view_types"]

    def test_list_view_types_contains_evm(self, client):
        """View types list contains evm."""
        response = client.get("/api/v1/export/view-types")
        data = response.json()
        assert "evm" in data["view_types"]

    def test_list_view_types_all_strings(self, client):
        """All view types are strings."""
        response = client.get("/api/v1/export/view-types")
        data = response.json()
        for vt in data["view_types"]:
            assert isinstance(vt, str)


# ============================================================================
# Integration Tests
# ============================================================================

class TestExportIntegration:
    """Integration tests for export endpoints."""

    def test_export_and_report_workflow(self, client, sample_project):
        """Full workflow: export view then generate report."""
        # Export a view
        view_response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "project_id": str(sample_project.id),
            },
        )
        assert view_response.status_code == 200

        # Generate a report
        report_response = client.post(
            "/api/v1/export/report",
            json={
                "template_type": "programme_status",
                "format": "docx",
                "project_id": str(sample_project.id),
            },
        )
        assert report_response.status_code == 200

    def test_list_then_export_workflow(self, client):
        """List view types then export one."""
        # List view types
        list_response = client.get("/api/v1/export/view-types")
        assert list_response.status_code == 200
        view_types = list_response.json()["view_types"]

        # Export the first view type
        if view_types:
            export_response = client.post(
                "/api/v1/export/view",
                json={
                    "view_type": view_types[0],
                    "format": "png",
                },
            )
            assert export_response.status_code == 200

    def test_list_templates_then_generate_workflow(self, client):
        """List templates then generate one."""
        # List templates
        list_response = client.get("/api/v1/export/templates")
        assert list_response.status_code == 200
        templates = list_response.json()["templates"]

        # Generate the first template
        if templates:
            template = templates[0]
            generate_response = client.post(
                "/api/v1/export/report",
                json={
                    "template_type": template["template_type"],
                    "format": "docx",
                },
            )
            assert generate_response.status_code == 200

    def test_export_with_project_classification(self, client, sample_project):
        """Export picks up project classification from database."""
        response = client.post(
            "/api/v1/export/view",
            json={
                "view_type": "dashboard",
                "format": "png",
                "project_id": str(sample_project.id),
                "include_classification": True,
            },
        )
        assert response.status_code == 200
        # The export should succeed with the SECRET classification
        assert len(response.content) > 0
