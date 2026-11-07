"""Tests for Report Template Service.

This module tests the ReportTemplateService class, including all 10 report
templates, section data handlers, DOCX and PPTX generation, classification
handling, and metadata output. Tests use an in-memory SQLite database.
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models.models import (
    PortfolioNode,
    NodeBlocker,
    ResourceAssignment,
    SecurityClassification,
    BlockerSeverity,
    BlockerCategory,
    TreeType,
)
from app.schemas.export_schemas import ReportTemplateType, ExportFormat
from app.services.report_template import (
    ReportTemplateService,
    report_template_service,
    TEMPLATE_DEFINITIONS,
    CLASSIFICATION_COLORS,
    RAG_COLORS,
)


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def db_session():
    """Create an in-memory SQLite database session for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def service():
    """Provide a fresh ReportTemplateService instance."""
    return ReportTemplateService()


@pytest.fixture
def sample_project(db_session: Session):
    """Create a sample project node with EVM data."""
    project = PortfolioNode(
        id=uuid4(),
        tree_type=TreeType.WBS,
        code="PRJ-001",
        name="Test Project",
        path="1",
        security_classification=SecurityClassification.SECRET,
        percent_complete=50.0,
        planned_start_date=datetime(2024, 1, 1),
        planned_end_date=datetime(2024, 12, 31),
        bac_cost=Decimal("1000000"),
        planned_value=Decimal("500000"),
        earned_value=Decimal("450000"),
        actual_cost=Decimal("480000"),
    )
    db_session.add(project)
    db_session.commit()
    return project


@pytest.fixture
def sample_task(db_session: Session):
    """Create a sample task node."""
    task = PortfolioNode(
        id=uuid4(),
        tree_type=TreeType.WBS,
        code="TSK-001",
        name="Test Task",
        path="1.1",
        security_classification=SecurityClassification.OFFICIAL,
        percent_complete=75.0,
        planned_start_date=datetime(2024, 3, 1),
        planned_end_date=datetime(2024, 6, 30),
    )
    db_session.add(task)
    db_session.commit()
    return task


@pytest.fixture
def sample_milestone(db_session: Session):
    """Create a sample milestone node."""
    milestone = PortfolioNode(
        id=uuid4(),
        tree_type=TreeType.WBS,
        code="MS-001",
        name="Test Milestone",
        path="1.1.1",
        security_classification=SecurityClassification.OFFICIAL,
        percent_complete=100.0,
        planned_end_date=datetime(2024, 6, 30),
    )
    db_session.add(milestone)
    db_session.commit()
    return milestone


@pytest.fixture
def sample_blocker(db_session: Session):
    """Create a sample blocker."""
    blocker = NodeBlocker(
        id=uuid4(),
        portfolio_node_id=uuid4(),
        category=BlockerCategory.DEPENDENCY_OVERDUE,
        severity=BlockerSeverity.CRITICAL,
        impacted_hours=8.0,
    )
    db_session.add(blocker)
    db_session.commit()
    return blocker


# ============================================================================
# Template Definitions Tests
# ============================================================================

class TestTemplateDefinitions:
    """Tests for TEMPLATE_DEFINITIONS constant."""

    def test_all_template_types_defined(self):
        """All 10 ReportTemplateType values have definitions."""
        for tt in ReportTemplateType:
            assert tt in TEMPLATE_DEFINITIONS, f"Missing definition for {tt}"

    def test_template_count(self):
        """There are exactly 10 template definitions."""
        assert len(TEMPLATE_DEFINITIONS) == 10

    def test_programme_status_sections(self):
        """Programme status has expected sections."""
        sections = TEMPLATE_DEFINITIONS[ReportTemplateType.PROGRAMME_STATUS]["sections"]
        assert "executive_summary" in sections
        assert "schedule_health" in sections
        assert "cost_performance" in sections
        assert "risk_summary" in sections
        assert "milestone_status" in sections
        assert "resource_utilization" in sections

    def test_executive_summary_sections(self):
        """Executive summary has expected sections."""
        sections = TEMPLATE_DEFINITIONS[ReportTemplateType.EXECUTIVE_SUMMARY]["sections"]
        assert "executive_overview" in sections
        assert "key_metrics" in sections
        assert "rag_status" in sections
        assert "critical_issues" in sections

    def test_evm_report_sections(self):
        """EVM report has expected sections."""
        sections = TEMPLATE_DEFINITIONS[ReportTemplateType.EVM_REPORT]["sections"]
        assert "evm_summary" in sections
        assert "cpi_spi_analysis" in sections
        assert "forecast_data" in sections
        assert "variance_analysis" in sections

    def test_risk_register_sections(self):
        """Risk register has expected sections."""
        sections = TEMPLATE_DEFINITIONS[ReportTemplateType.RISK_REGISTER]["sections"]
        assert "risk_summary" in sections
        assert "risk_matrix" in sections
        assert "top_risks" in sections
        assert "mitigation_plans" in sections

    def test_template_has_name(self):
        """Each template definition has a name."""
        for tt, defn in TEMPLATE_DEFINITIONS.items():
            assert "name" in defn
            assert len(defn["name"]) > 0

    def test_template_has_description(self):
        """Each template definition has a description."""
        for tt, defn in TEMPLATE_DEFINITIONS.items():
            assert "description" in defn
            assert len(defn["description"]) > 0

    def test_template_has_sections(self):
        """Each template definition has at least one section."""
        for tt, defn in TEMPLATE_DEFINITIONS.items():
            assert "sections" in defn
            assert len(defn["sections"]) >= 1


# ============================================================================
# Color Constants Tests
# ============================================================================

class TestColorConstants:
    """Tests for classification and RAG color constants."""

    def test_classification_colors_count(self):
        """There are 4 classification color entries."""
        assert len(CLASSIFICATION_COLORS) == 4

    def test_rag_colors_count(self):
        """There are 3 RAG color entries."""
        assert len(RAG_COLORS) == 3


# ============================================================================
# Service Initialization Tests
# ============================================================================

class TestReportTemplateServiceInit:
    """Tests for ReportTemplateService initialization."""

    def test_service_has_section_handlers(self, service):
        """Service registers section handlers."""
        assert len(service.section_handlers) > 0

    def test_service_has_executive_summary_handler(self, service):
        """Executive summary section has a handler."""
        assert "executive_summary" in service.section_handlers

    def test_service_has_risk_summary_handler(self, service):
        """Risk summary section has a handler."""
        assert "risk_summary" in service.section_handlers

    def test_service_has_evm_handlers(self, service):
        """EVM-related sections have handlers."""
        assert "evm_summary" in service.section_handlers
        assert "cpi_spi_analysis" in service.section_handlers

    def test_all_template_sections_have_handlers(self, service):
        """Every section in every template has a handler."""
        for tt, defn in TEMPLATE_DEFINITIONS.items():
            for section_id in defn["sections"]:
                assert section_id in service.section_handlers, (
                    f"Missing handler for section '{section_id}' in template {tt}"
                )

    def test_singleton_instance(self):
        """Module-level singleton is a ReportTemplateService."""
        assert isinstance(report_template_service, ReportTemplateService)


# ============================================================================
# Section Handler Tests
# ============================================================================

class TestSectionHandlers:
    """Tests for individual section data handlers."""

    def test_executive_summary_empty(self, service, db_session):
        """Executive summary with empty database."""
        result = service._handle_executive_summary(None, db_session)
        assert "title" in result
        assert "metrics" in result
        assert result["metrics"]["Total Items"] == 0

    def test_executive_summary_with_data(self, service, db_session, sample_task):
        """Executive summary with task data."""
        result = service._handle_executive_summary(None, db_session)
        assert result["data_points"] >= 1
        assert "Completion Rate" in result["metrics"]

    def test_schedule_health_empty(self, service, db_session):
        """Schedule health with empty database."""
        result = service._handle_schedule_health(None, db_session)
        assert "title" in result
        assert "On Track" in result["metrics"]
        assert "Delayed" in result["metrics"]

    def test_schedule_health_with_data(self, service, db_session, sample_task):
        """Schedule health with task data."""
        result = service._handle_schedule_health(None, db_session)
        assert "table_data" in result
        # Header row should be present
        if result["table_data"]:
            assert "Task" in result["table_data"][0]

    def test_cost_performance_empty(self, service, db_session):
        """Cost performance with no EVM data."""
        result = service._handle_cost_performance(None, db_session)
        assert "title" in result
        assert "BAC" in result["metrics"]
        assert "CPI" in result["metrics"]

    def test_cost_performance_with_data(self, service, db_session, sample_project):
        """Cost performance with EVM data."""
        result = service._handle_cost_performance(None, db_session)
        assert result["data_points"] >= 1
        cpi = result["metrics"]["CPI"]
        assert cpi != "N/A"

    def test_risk_summary_empty(self, service, db_session):
        """Risk summary with no blockers."""
        result = service._handle_risk_summary(None, db_session)
        assert result["metrics"]["Total Risks"] == 0

    def test_risk_summary_with_blockers(self, service, db_session, sample_blocker):
        """Risk summary with blockers."""
        result = service._handle_risk_summary(None, db_session)
        assert result["data_points"] >= 1
        assert "Critical" in result["metrics"]

    def test_milestone_status_empty(self, service, db_session):
        """Milestone status with no milestones."""
        result = service._handle_milestone_status(None, db_session)
        assert result["metrics"]["Total Milestones"] == 0

    def test_milestone_status_with_data(self, service, db_session, sample_milestone):
        """Milestone status with milestone data."""
        result = service._handle_milestone_status(None, db_session)
        assert result["data_points"] >= 1
        assert "Completed" in result["metrics"]

    def test_resource_utilization_empty(self, service, db_session):
        """Resource utilization with no assignments."""
        result = service._handle_resource_utilization(None, db_session)
        assert result["metrics"]["Total Assignments"] == 0

    def test_alias_handlers_delegate(self, service, db_session):
        """Alias handlers delegate to primary handlers."""
        # project_overview -> executive_summary
        result1 = service._handle_project_overview(None, db_session)
        result2 = service._handle_executive_summary(None, db_session)
        assert result1["title"] == result2["title"]

    def test_all_section_handlers_callable(self, service, db_session):
        """All section handlers can be called without error."""
        for section_id, handler in service.section_handlers.items():
            result = handler(None, db_session)
            assert isinstance(result, dict), f"Handler {section_id} did not return dict"
            assert "title" in result, f"Handler {section_id} missing 'title'"


# ============================================================================
# DOCX Generation Tests
# ============================================================================

class TestDOCXGeneration:
    """Tests for _generate_docx method."""

    def test_generate_docx_returns_bytes(self, service):
        """DOCX generation returns bytes."""
        section_data = {
            "executive_summary": {
                "title": "Executive Summary",
                "summary": "Test summary",
                "metrics": {"Total": 5},
                "data_points": 5,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["executive_summary"],
        }
        result = service._generate_docx(
            "Test Report", section_data, None, True, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_docx_with_classification(self, service):
        """DOCX generation with classification marking."""
        section_data = {
            "executive_summary": {
                "title": "Executive Summary",
                "metrics": {},
                "data_points": 0,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["executive_summary"],
        }
        result = service._generate_docx(
            "Classified Report", section_data, "SECRET", True, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_docx_without_disclaimer(self, service):
        """DOCX generation without export disclaimer."""
        section_data = {
            "executive_summary": {
                "title": "Executive Summary",
                "metrics": {},
                "data_points": 0,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["executive_summary"],
        }
        result = service._generate_docx(
            "Test Report", section_data, None, False, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_docx_with_table(self, service):
        """DOCX generation with table data."""
        section_data = {
            "schedule_health": {
                "title": "Schedule Health",
                "metrics": {"On Track": 5},
                "table_data": [
                    ["Task", "Status"],
                    ["Task 1", "On Track"],
                    ["Task 2", "Delayed"],
                ],
                "data_points": 2,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["schedule_health"],
        }
        result = service._generate_docx(
            "Test Report", section_data, None, True, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_docx_multiple_sections(self, service):
        """DOCX generation with multiple sections."""
        section_data = {
            "executive_summary": {
                "title": "Executive Summary",
                "metrics": {"Total": 10},
                "data_points": 10,
            },
            "risk_summary": {
                "title": "Risk Summary",
                "metrics": {"Critical": 2},
                "data_points": 5,
            },
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["executive_summary", "risk_summary"],
        }
        result = service._generate_docx(
            "Multi-Section Report", section_data, None, True, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0


# ============================================================================
# PPTX Generation Tests
# ============================================================================

class TestPPTXGeneration:
    """Tests for _generate_pptx method."""

    def test_generate_pptx_returns_bytes(self, service):
        """PPTX generation returns bytes."""
        section_data = {
            "executive_summary": {
                "title": "Executive Summary",
                "summary": "Test summary",
                "metrics": {"Total": 5},
                "data_points": 5,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["executive_summary"],
        }
        result = service._generate_pptx(
            "Test Report", section_data, None, True, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_pptx_with_classification(self, service):
        """PPTX generation with classification marking."""
        section_data = {
            "executive_summary": {
                "title": "Executive Summary",
                "metrics": {},
                "data_points": 0,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["executive_summary"],
        }
        result = service._generate_pptx(
            "Classified Report", section_data, "SECRET", True, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_pptx_without_disclaimer(self, service):
        """PPTX generation without export disclaimer."""
        section_data = {
            "executive_summary": {
                "title": "Executive Summary",
                "metrics": {},
                "data_points": 0,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["executive_summary"],
        }
        result = service._generate_pptx(
            "Test Report", section_data, None, False, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_pptx_with_table(self, service):
        """PPTX generation with table data."""
        section_data = {
            "schedule_health": {
                "title": "Schedule Health",
                "metrics": {},
                "table_data": [
                    ["Task", "Status"],
                    ["Task 1", "On Track"],
                ],
                "data_points": 1,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["schedule_health"],
        }
        result = service._generate_pptx(
            "Test Report", section_data, None, True, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_pptx_with_metrics(self, service):
        """PPTX generation renders metric cards."""
        section_data = {
            "key_metrics": {
                "title": "Key Metrics",
                "metrics": {
                    "Total Tasks": 10,
                    "Completed": 5,
                    "In Progress": 3,
                    "Delayed": 2,
                },
                "data_points": 10,
            }
        }
        template_def = {
            "name": "Test Report",
            "description": "Test",
            "sections": ["key_metrics"],
        }
        result = service._generate_pptx(
            "Metrics Report", section_data, None, True, template_def
        )
        assert isinstance(result, bytes)
        assert len(result) > 0


# ============================================================================
# Generate Report Integration Tests
# ============================================================================

class TestGenerateReport:
    """Tests for the main generate_report method."""

    def test_generate_programme_status_docx(self, service, db_session, sample_project):
        """Generate programme status report as DOCX."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.PROGRAMME_STATUS,
            format=ExportFormat.DOCX,
            project_id=sample_project.id,
            status_date=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert len(file_bytes) > 0
        assert metadata["format"] == "docx"
        assert metadata["template_type"] == "programme_status"
        assert metadata["classification"] == "SECRET"

    def test_generate_executive_summary_pptx(self, service, db_session):
        """Generate executive summary as PPTX."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.PPTX,
            project_id=None,
            status_date=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert len(file_bytes) > 0
        assert metadata["format"] == "pptx"

    def test_generate_with_title_override(self, service, db_session):
        """Report uses custom title when provided."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
            title_override="Custom Report Title",
        )
        assert metadata["title"] == "Custom Report Title"

    def test_generate_with_classification_override(self, service, db_session):
        """Report uses classification override."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
            classification_override="TOP_SECRET",
        )
        assert metadata["classification"] == "TOP_SECRET"

    def test_generate_with_selected_sections(self, service, db_session):
        """Report includes only selected sections."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.PROGRAMME_STATUS,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
            sections=["executive_summary", "risk_summary"],
        )
        assert metadata["section_count"] == 2
        section_ids = [s["section_id"] for s in metadata["sections"]]
        assert "executive_summary" in section_ids
        assert "risk_summary" in section_ids

    def test_generate_without_disclaimer(self, service, db_session):
        """Report can be generated without disclaimer."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
            include_export_disclaimer=False,
        )
        assert isinstance(file_bytes, bytes)
        assert len(file_bytes) > 0

    def test_generate_metadata_file_size(self, service, db_session):
        """Metadata file_size_bytes matches actual bytes length."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
        )
        assert metadata["file_size_bytes"] == len(file_bytes)

    def test_generate_metadata_message(self, service, db_session):
        """Metadata includes success message."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
        )
        assert "successfully" in metadata["message"].lower()

    def test_generate_all_templates_docx(self, service, db_session):
        """All 10 templates can be generated as DOCX."""
        for tt in ReportTemplateType:
            file_bytes, metadata = service.generate_report(
                template_type=tt,
                format=ExportFormat.DOCX,
                project_id=None,
                status_date=None,
                db=db_session,
            )
            assert isinstance(file_bytes, bytes), f"Failed for template: {tt}"
            assert metadata["template_type"] == tt.value

    def test_generate_all_templates_pptx(self, service, db_session):
        """All 10 templates can be generated as PPTX."""
        for tt in ReportTemplateType:
            file_bytes, metadata = service.generate_report(
                template_type=tt,
                format=ExportFormat.PPTX,
                project_id=None,
                status_date=None,
                db=db_session,
            )
            assert isinstance(file_bytes, bytes), f"Failed for template: {tt}"
            assert metadata["template_type"] == tt.value

    def test_generate_png_format_raises(self, service, db_session):
        """Generating report as PNG raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported format"):
            service.generate_report(
                template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
                format=ExportFormat.PNG,
                project_id=None,
                status_date=None,
                db=db_session,
            )

    def test_generate_title_includes_project_name(self, service, db_session, sample_project):
        """Report title includes project name when project_id provided."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=sample_project.id,
            status_date=None,
            db=db_session,
        )
        assert "Test Project" in metadata["title"]

    def test_generate_with_project_classification(self, service, db_session, sample_project):
        """Report picks up project classification."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=sample_project.id,
            status_date=None,
            db=db_session,
        )
        assert metadata["classification"] == "SECRET"

    def test_generate_default_classification(self, service, db_session):
        """Report defaults to OFFICIAL when no classification available."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
        )
        assert metadata["classification"] == "OFFICIAL"

    def test_generate_evm_report(self, service, db_session, sample_project):
        """Generate EVM report with cost data."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EVM_REPORT,
            format=ExportFormat.PPTX,
            project_id=sample_project.id,
            status_date=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert len(file_bytes) > 0
        assert metadata["template_type"] == "evm_report"

    def test_generate_risk_register(self, service, db_session, sample_blocker):
        """Generate risk register with blocker data."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.RISK_REGISTER,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert metadata["template_type"] == "risk_register"

    def test_generate_milestone_tracker(self, service, db_session, sample_milestone):
        """Generate milestone tracker with milestone data."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.MILESTONE_TRACKER,
            format=ExportFormat.PPTX,
            project_id=None,
            status_date=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert metadata["template_type"] == "milestone_tracker"

    def test_generate_report_id_is_uuid(self, service, db_session):
        """Report ID is a valid UUID string."""
        file_bytes, metadata = service.generate_report(
            template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
            format=ExportFormat.DOCX,
            project_id=None,
            status_date=None,
            db=db_session,
        )
        # Should be a valid UUID format
        report_id = metadata["report_id"]
        parts = report_id.split("-")
        assert len(parts) == 5  # UUID format: 8-4-4-4-12


# ============================================================================
# Unsupported Template Type Tests
# ============================================================================

class TestUnsupportedTemplateType:
    """Tests for unsupported template type handling."""

    def test_generate_report_raises_for_unknown_template(self, service, db_session):
        """generate_report raises ValueError for unknown template."""
        import unittest.mock
        # Temporarily remove a template definition
        from app.services.report_template import TEMPLATE_DEFINITIONS
        original = TEMPLATE_DEFINITIONS.pop(ReportTemplateType.EXECUTIVE_SUMMARY)
        try:
            with pytest.raises(ValueError, match="Unknown template type"):
                service.generate_report(
                    template_type=ReportTemplateType.EXECUTIVE_SUMMARY,
                    format=ExportFormat.DOCX,
                    project_id=None,
                    status_date=None,
                    db=db_session,
                )
        finally:
            # Restore the definition
            TEMPLATE_DEFINITIONS[ReportTemplateType.EXECUTIVE_SUMMARY] = original


# ============================================================================
# Additional Alias Handler Tests
# ============================================================================

class TestAdditionalAliasHandlers:
    """Tests for additional section handler aliases not covered elsewhere."""

    def test_health_metrics_delegates_to_schedule_health(self, service, db_session, sample_task):
        """health_metrics delegates to schedule_health."""
        result = service._handle_health_metrics(None, db_session)
        assert "On Track" in result["metrics"]
        assert "Delayed" in result["metrics"]

    def test_milestone_progress_delegates_to_milestone_status(self, service, db_session, sample_milestone):
        """milestone_progress delegates to milestone_status."""
        result = service._handle_milestone_progress(None, db_session)
        assert "Total Milestones" in result["metrics"]
        assert "Completed" in result["metrics"]

    def test_resource_allocation_delegates_to_resource_utilization(self, service, db_session):
        """resource_allocation delegates to resource_utilization."""
        result = service._handle_resource_allocation(None, db_session)
        assert "Total Assignments" in result["metrics"]

    def test_executive_overview_delegates_to_executive_summary(self, service, db_session, sample_task):
        """executive_overview delegates to executive_summary."""
        result = service._handle_executive_overview(None, db_session)
        assert "Total Items" in result["metrics"]
        assert "Completion Rate" in result["metrics"]

    def test_key_metrics_delegates_to_executive_summary(self, service, db_session, sample_task):
        """key_metrics delegates to executive_summary."""
        result = service._handle_key_metrics(None, db_session)
        assert "Total Items" in result["metrics"]

    def test_rag_status_delegates_to_schedule_health(self, service, db_session, sample_task):
        """rag_status delegates to schedule_health."""
        result = service._handle_rag_status(None, db_session)
        assert "On Track" in result["metrics"]
        assert "Schedule Health" in result["metrics"]

    def test_critical_issues_delegates_to_risk_summary(self, service, db_session, sample_blocker):
        """critical_issues delegates to risk_summary."""
        result = service._handle_critical_issues(None, db_session)
        assert "Total Risks" in result["metrics"]
        assert "Critical" in result["metrics"]

    def test_risk_matrix_delegates_to_risk_summary(self, service, db_session, sample_blocker):
        """risk_matrix delegates to risk_summary."""
        result = service._handle_risk_matrix(None, db_session)
        assert "Total Risks" in result["metrics"]

    def test_top_risks_delegates_to_risk_summary(self, service, db_session, sample_blocker):
        """top_risks delegates to risk_summary."""
        result = service._handle_top_risks(None, db_session)
        assert "Total Risks" in result["metrics"]

    def test_mitigation_plans_delegates_to_risk_summary(self, service, db_session, sample_blocker):
        """mitigation_plans delegates to risk_summary."""
        result = service._handle_mitigation_plans(None, db_session)
        assert "Total Risks" in result["metrics"]

    def test_evm_summary_delegates_to_cost_performance(self, service, db_session, sample_project):
        """evm_summary delegates to cost_performance."""
        result = service._handle_evm_summary(None, db_session)
        assert "BAC" in result["metrics"]
        assert "CPI" in result["metrics"]

    def test_cpi_spi_analysis_delegates_to_cost_performance(self, service, db_session, sample_project):
        """cpi_spi_analysis delegates to cost_performance."""
        result = service._handle_cpi_spi_analysis(None, db_session)
        assert "BAC" in result["metrics"]

    def test_forecast_data_delegates_to_cost_performance(self, service, db_session, sample_project):
        """forecast_data delegates to cost_performance."""
        result = service._handle_forecast_data(None, db_session)
        assert "EAC" in result["metrics"]

    def test_variance_analysis_delegates_to_cost_performance(self, service, db_session, sample_project):
        """variance_analysis delegates to cost_performance."""
        result = service._handle_variance_analysis(None, db_session)
        assert "Variance" in result["metrics"]

    def test_procurement_summary_delegates_to_executive_summary(self, service, db_session, sample_task):
        """procurement_summary delegates to executive_summary."""
        result = service._handle_procurement_summary(None, db_session)
        assert "Total Items" in result["metrics"]

    def test_active_orders_delegates_to_executive_summary(self, service, db_session, sample_task):
        """active_orders delegates to executive_summary."""
        result = service._handle_active_orders(None, db_session)
        assert "Total Items" in result["metrics"]

    def test_supplier_performance_delegates_to_executive_summary(self, service, db_session, sample_task):
        """supplier_performance delegates to executive_summary."""
        result = service._handle_supplier_performance(None, db_session)
        assert "Total Items" in result["metrics"]

    def test_delivery_status_delegates_to_milestone_status(self, service, db_session, sample_milestone):
        """delivery_status delegates to milestone_status."""
        result = service._handle_delivery_status(None, db_session)
        assert "Total Milestones" in result["metrics"]

    def test_allocation_matrix_delegates_to_resource_utilization(self, service, db_session):
        """allocation_matrix delegates to resource_utilization."""
        result = service._handle_allocation_matrix(None, db_session)
        assert "Total Assignments" in result["metrics"]

    def test_utilization_metrics_delegates_to_resource_utilization(self, service, db_session):
        """utilization_metrics delegates to resource_utilization."""
        result = service._handle_utilization_metrics(None, db_session)
        assert "Total Assignments" in result["metrics"]

    def test_capacity_planning_delegates_to_resource_utilization(self, service, db_session):
        """capacity_planning delegates to resource_utilization."""
        result = service._handle_capacity_planning(None, db_session)
        assert "Total Assignments" in result["metrics"]

    def test_upcoming_milestones_delegates_to_milestone_status(self, service, db_session, sample_milestone):
        """upcoming_milestones delegates to milestone_status."""
        result = service._handle_upcoming_milestones(None, db_session)
        assert "Total Milestones" in result["metrics"]

    def test_risk_to_milestones_delegates_to_risk_summary(self, service, db_session, sample_blocker):
        """risk_to_milestones delegates to risk_summary."""
        result = service._handle_risk_to_milestones(None, db_session)
        assert "Total Risks" in result["metrics"]

    def test_pending_changes_delegates_to_executive_summary(self, service, db_session, sample_task):
        """pending_changes delegates to executive_summary."""
        result = service._handle_pending_changes(None, db_session)
        assert "Total Items" in result["metrics"]

    def test_approved_changes_delegates_to_executive_summary(self, service, db_session, sample_task):
        """approved_changes delegates to executive_summary."""
        result = service._handle_approved_changes(None, db_session)
        assert "Total Items" in result["metrics"]

    def test_impact_analysis_delegates_to_cost_performance(self, service, db_session, sample_project):
        """impact_analysis delegates to cost_performance."""
        result = service._handle_impact_analysis(None, db_session)
        assert "BAC" in result["metrics"]

    def test_quality_summary_delegates_to_executive_summary(self, service, db_session, sample_task):
        """quality_summary delegates to executive_summary."""
        result = service._handle_quality_summary(None, db_session)
        assert "Total Items" in result["metrics"]

    def test_test_results_delegates_to_executive_summary(self, service, db_session, sample_task):
        """test_results delegates to executive_summary."""
        result = service._handle_test_results(None, db_session)
        assert "Total Items" in result["metrics"]

    def test_defect_analysis_delegates_to_risk_summary(self, service, db_session, sample_blocker):
        """defect_analysis delegates to risk_summary."""
        result = service._handle_defect_analysis(None, db_session)
        assert "Total Risks" in result["metrics"]

    def test_compliance_status_delegates_to_milestone_status(self, service, db_session, sample_milestone):
        """compliance_status delegates to milestone_status."""
        result = service._handle_compliance_status(None, db_session)
        assert "Total Milestones" in result["metrics"]
