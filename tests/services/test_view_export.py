"""Tests for View Export Service.

This module tests the ViewExportService class, including view data handlers,
PNG and PowerPoint generation, classification handling, and metadata output.
Tests use an in-memory SQLite database to avoid requiring PostgreSQL.
"""
import io
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
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
from app.schemas.export_schemas import ViewType, ExportFormat
from app.services.view_export import ViewExportService, view_export_service, CLASSIFICATION_COLORS, RAG_COLORS


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
    """Provide a fresh ViewExportService instance."""
    return ViewExportService()


@pytest.fixture
def sample_project(db_session: Session):
    """Create a sample project node."""
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
def sample_completed_task(db_session: Session):
    """Create a completed task node."""
    task = PortfolioNode(
        id=uuid4(),
        tree_type=TreeType.WBS,
        code="TSK-002",
        name="Completed Task",
        path="1.2",
        security_classification=SecurityClassification.OFFICIAL,
        percent_complete=100.0,
        planned_start_date=datetime(2024, 1, 1),
        planned_end_date=datetime(2024, 2, 28),
    )
    db_session.add(task)
    db_session.commit()
    return task


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
# Color Constants Tests
# ============================================================================

class TestColorConstants:
    """Tests for classification and RAG color constants."""

    def test_classification_colors_count(self):
        """There are 4 classification color entries."""
        assert len(CLASSIFICATION_COLORS) == 4

    def test_classification_colors_keys(self):
        """All expected classification levels have colors."""
        expected = {"OFFICIAL", "OFFICIAL_SENSITIVE", "SECRET", "TOP_SECRET"}
        assert set(CLASSIFICATION_COLORS.keys()) == expected

    def test_classification_color_format(self):
        """Each color is a 3-tuple of integers (RGB)."""
        for color in CLASSIFICATION_COLORS.values():
            assert isinstance(color, tuple)
            assert len(color) == 3
            for component in color:
                assert isinstance(component, int)
                assert 0 <= component <= 255

    def test_rag_colors_count(self):
        """There are 3 RAG color entries."""
        assert len(RAG_COLORS) == 3

    def test_rag_colors_keys(self):
        """All expected RAG statuses have colors."""
        expected = {"green", "amber", "red"}
        assert set(RAG_COLORS.keys()) == expected

    def test_rag_color_format(self):
        """Each RAG color is a 3-tuple of integers (RGB)."""
        for color in RAG_COLORS.values():
            assert isinstance(color, tuple)
            assert len(color) == 3


# ============================================================================
# ViewExportService Initialization Tests
# ============================================================================

class TestViewExportServiceInit:
    """Tests for ViewExportService initialization."""

    def test_service_has_all_view_handlers(self, service):
        """Service registers handlers for all 23 view types."""
        assert len(service.view_handlers) == 23

    def test_service_has_dashboard_handler(self, service):
        """Dashboard view type has a handler."""
        assert ViewType.DASHBOARD in service.view_handlers

    def test_service_has_gantt_handler(self, service):
        """Gantt view type has a handler."""
        assert ViewType.GANTT in service.view_handlers

    def test_service_has_evm_handler(self, service):
        """EVM view type has a handler."""
        assert ViewType.EVM in service.view_handlers

    def test_service_has_risk_handler(self, service):
        """Risk view type has a handler."""
        assert ViewType.RISK in service.view_handlers

    def test_all_view_types_have_handlers(self, service):
        """Every ViewType enum value has a corresponding handler."""
        for vt in ViewType:
            assert vt in service.view_handlers, f"Missing handler for {vt}"

    def test_singleton_instance(self):
        """Module-level singleton is a ViewExportService."""
        assert isinstance(view_export_service, ViewExportService)


# ============================================================================
# View Data Handler Tests
# ============================================================================

class TestDashboardHandler:
    """Tests for _handle_dashboard data collection."""

    def test_empty_database(self, service, db_session):
        """Dashboard handler returns empty data with no nodes."""
        result = service._handle_dashboard(None, db_session)
        assert "metrics" in result
        assert "table_data" in result
        assert "data_points" in result
        assert result["data_points"] == 0
        assert result["metrics"]["Total Projects"] == 0

    def test_with_projects(self, service, db_session, sample_project, sample_task):
        """Dashboard handler collects project data."""
        result = service._handle_dashboard(None, db_session)
        assert result["data_points"] >= 1
        assert "Total Projects" in result["metrics"]
        assert "Active Tasks" in result["metrics"]
        assert "Completed Tasks" in result["metrics"]

    def test_table_data_has_header(self, service, db_session, sample_project):
        """Table data includes a header row."""
        result = service._handle_dashboard(None, db_session)
        if result["table_data"]:
            header = result["table_data"][0]
            assert "Project" in header
            assert "Status" in header


class TestGanttHandler:
    """Tests for _handle_gantt data collection."""

    def test_empty_database(self, service, db_session):
        """Gantt handler returns empty data with no nodes."""
        result = service._handle_gantt(None, db_session)
        assert result["data_points"] == 0
        assert result["metrics"]["Total Tasks"] == 0

    def test_with_tasks(self, service, db_session, sample_task):
        """Gantt handler collects task data."""
        result = service._handle_gantt(None, db_session)
        assert result["data_points"] >= 1
        assert "Total Tasks" in result["metrics"]
        assert "Delayed" in result["metrics"]

    def test_table_data_has_header(self, service, db_session, sample_task):
        """Table data includes a header row."""
        result = service._handle_gantt(None, db_session)
        if result["table_data"]:
            header = result["table_data"][0]
            assert "Task" in header
            assert "Start" in header
            assert "Finish" in header

    def test_with_project_filter(self, service, db_session, sample_project, sample_task):
        """Gantt handler filters by project_id."""
        result = service._handle_gantt(sample_project.id, db_session)
        # Should only return children of the project
        assert "metrics" in result


class TestCockpitHandler:
    """Tests for _handle_cockpit data collection."""

    def test_empty_database(self, service, db_session):
        """Cockpit handler returns empty data with no blockers."""
        result = service._handle_cockpit(None, db_session)
        assert result["data_points"] == 0
        assert result["metrics"]["Active Blockers"] == 0

    def test_with_blockers(self, service, db_session, sample_blocker):
        """Cockpit handler collects blocker data."""
        result = service._handle_cockpit(None, db_session)
        assert result["data_points"] >= 1
        assert "Active Blockers" in result["metrics"]
        assert "Critical Blockers" in result["metrics"]


class TestWBSHandler:
    """Tests for _handle_wbs data collection."""

    def test_empty_database(self, service, db_session):
        """WBS handler returns empty data with no nodes."""
        result = service._handle_wbs(None, db_session)
        assert result["data_points"] == 0

    def test_with_nodes(self, service, db_session, sample_task):
        """WBS handler collects node data."""
        result = service._handle_wbs(None, db_session)
        assert result["data_points"] >= 1
        assert "Total Nodes" in result["metrics"]


class TestRiskHandler:
    """Tests for _handle_risk data collection."""

    def test_empty_database(self, service, db_session):
        """Risk handler returns empty data with no risk nodes."""
        result = service._handle_risk(None, db_session)
        assert result["data_points"] == 0
        assert result["metrics"]["Total Risks"] == 0


class TestEVMHandler:
    """Tests for _handle_evm data collection."""

    def test_empty_database(self, service, db_session):
        """EVM handler returns empty data with no EVM nodes."""
        result = service._handle_evm(None, db_session)
        assert result["data_points"] == 0
        assert "BAC" in result["metrics"]
        assert "CPI" in result["metrics"]
        assert "SPI" in result["metrics"]

    def test_with_evm_data(self, service, db_session, sample_project):
        """EVM handler collects EVM metrics."""
        result = service._handle_evm(None, db_session)
        assert result["data_points"] >= 1
        # CPI and SPI should be calculated
        cpi = result["metrics"]["CPI"]
        spi = result["metrics"]["SPI"]
        assert cpi != "N/A"
        assert spi != "N/A"


class TestGenericHandler:
    """Tests for _generic_handler used by view types without specific handlers."""

    def test_generic_handler_returns_data(self, service, db_session, sample_task):
        """Generic handler returns properly structured data."""
        result = service._generic_handler("TASK", None, db_session)
        assert "metrics" in result
        assert "table_data" in result
        assert "data_points" in result
        assert "Total Items" in result["metrics"]
        assert "Active" in result["metrics"]
        assert "Completed" in result["metrics"]

    def test_generic_handler_empty(self, service, db_session):
        """Generic handler handles empty database."""
        result = service._generic_handler("PROCUREMENT", None, db_session)
        assert result["data_points"] == 0


# ============================================================================
# PNG Generation Tests
# ============================================================================

class TestPNGGeneration:
    """Tests for _generate_png method."""

    def test_generate_png_returns_bytes(self, service):
        """PNG generation returns bytes."""
        view_data = {
            "metrics": {"Total": 5},
            "table_data": [["Header"], ["Row 1"]],
            "data_points": 5,
        }
        result = service._generate_png(view_data, "Test Title", None, 1920, 1080)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_png_with_classification(self, service):
        """PNG generation with classification marking."""
        view_data = {
            "metrics": {"Total": 3},
            "table_data": [],
            "data_points": 3,
        }
        result = service._generate_png(view_data, "Classified View", "SECRET", 1920, 1080)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_png_empty_data(self, service):
        """PNG generation with empty data."""
        view_data = {
            "metrics": {},
            "table_data": [],
            "data_points": 0,
        }
        result = service._generate_png(view_data, "Empty View", None, 1920, 1080)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_png_custom_dimensions(self, service):
        """PNG generation with custom dimensions."""
        view_data = {
            "metrics": {},
            "table_data": [],
            "data_points": 0,
        }
        result = service._generate_png(view_data, "Custom Size", None, 1280, 720)
        assert isinstance(result, bytes)
        assert len(result) > 0


# ============================================================================
# PowerPoint Generation Tests
# ============================================================================

class TestPPTXGeneration:
    """Tests for _generate_pptx method."""

    def test_generate_pptx_returns_bytes(self, service):
        """PPTX generation returns bytes."""
        view_data = {
            "metrics": {"Total": 5},
            "table_data": [["Header"], ["Row 1"]],
            "data_points": 5,
        }
        result = service._generate_pptx(view_data, "Test Title", None)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_pptx_with_classification(self, service):
        """PPTX generation with classification marking."""
        view_data = {
            "metrics": {"Total": 3},
            "table_data": [],
            "data_points": 3,
        }
        result = service._generate_pptx(view_data, "Classified View", "SECRET")
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_pptx_empty_data(self, service):
        """PPTX generation with empty data."""
        view_data = {
            "metrics": {},
            "table_data": [],
            "data_points": 0,
        }
        result = service._generate_pptx(view_data, "Empty View", None)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_pptx_with_metrics(self, service):
        """PPTX generation renders metric cards."""
        view_data = {
            "metrics": {
                "Total Tasks": 10,
                "Completed": 5,
                "In Progress": 3,
                "Delayed": 2,
            },
            "table_data": [],
            "data_points": 10,
        }
        result = service._generate_pptx(view_data, "Metrics View", None)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_pptx_with_table(self, service):
        """PPTX generation renders data table."""
        view_data = {
            "metrics": {},
            "table_data": [
                ["Name", "Status", "Progress"],
                ["Task 1", "On Track", "50%"],
                ["Task 2", "Delayed", "25%"],
            ],
            "data_points": 2,
        }
        result = service._generate_pptx(view_data, "Table View", None)
        assert isinstance(result, bytes)
        assert len(result) > 0


# ============================================================================
# Export View Integration Tests
# ============================================================================

class TestExportView:
    """Tests for the main export_view method."""

    def test_export_dashboard_png(self, service, db_session, sample_project):
        """Export dashboard view to PNG."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
            project_id=sample_project.id,
            dashboard_id=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert len(file_bytes) > 0
        assert metadata["format"] == "png"
        assert metadata["title"] is not None
        assert metadata["export_id"] is not None
        assert metadata["generated_at"] is not None
        assert metadata["classification"] == "SECRET"

    def test_export_gantt_pptx(self, service, db_session, sample_task):
        """Export Gantt view to PowerPoint."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.GANTT,
            format=ExportFormat.PPTX,
            project_id=None,
            dashboard_id=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert len(file_bytes) > 0
        assert metadata["format"] == "pptx"

    def test_export_with_title_override(self, service, db_session):
        """Export uses custom title when provided."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
            project_id=None,
            dashboard_id=None,
            db=db_session,
            title_override="My Custom Title",
        )
        assert metadata["title"] == "My Custom Title"

    def test_export_without_classification(self, service, db_session):
        """Export without classification stamps."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
            project_id=None,
            dashboard_id=None,
            db=db_session,
            include_classification=False,
        )
        assert metadata["classification"] is None

    def test_export_with_project_classification(self, service, db_session, sample_project):
        """Export picks up project classification."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
            project_id=sample_project.id,
            dashboard_id=None,
            db=db_session,
            include_classification=True,
        )
        assert metadata["classification"] == "SECRET"

    def test_export_metadata_file_size(self, service, db_session):
        """Metadata file_size_bytes matches actual bytes length."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
            project_id=None,
            dashboard_id=None,
            db=db_session,
        )
        assert metadata["file_size_bytes"] == len(file_bytes)

    def test_export_metadata_message(self, service, db_session):
        """Metadata includes success message."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
            project_id=None,
            dashboard_id=None,
            db=db_session,
        )
        assert "successfully" in metadata["message"].lower()

    def test_export_evm_view(self, service, db_session, sample_project):
        """Export EVM view with cost data."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.EVM,
            format=ExportFormat.PPTX,
            project_id=sample_project.id,
            dashboard_id=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert len(file_bytes) > 0
        assert metadata["view_type"] == "evm"

    def test_export_cockpit_view(self, service, db_session, sample_blocker):
        """Export cockpit view with blockers."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.COCKPIT,
            format=ExportFormat.PNG,
            project_id=None,
            dashboard_id=None,
            db=db_session,
        )
        assert isinstance(file_bytes, bytes)
        assert metadata["view_type"] == "cockpit"

    def test_export_all_view_types(self, service, db_session):
        """All 23 view types can be exported without error."""
        for vt in ViewType:
            file_bytes, metadata = service.export_view(
                view_type=vt,
                format=ExportFormat.PNG,
                project_id=None,
                dashboard_id=None,
                db=db_session,
            )
            assert isinstance(file_bytes, bytes), f"Failed for view type: {vt}"
            assert metadata["view_type"] == vt.value

    def test_export_docx_format_raises(self, service, db_session):
        """Exporting view as DOCX raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported format"):
            service.export_view(
                view_type=ViewType.DASHBOARD,
                format=ExportFormat.DOCX,
                project_id=None,
                dashboard_id=None,
                db=db_session,
            )

    def test_export_title_includes_project_name(self, service, db_session, sample_project):
        """Export title includes project name when project_id provided."""
        file_bytes, metadata = service.export_view(
            view_type=ViewType.DASHBOARD,
            format=ExportFormat.PNG,
            project_id=sample_project.id,
            dashboard_id=None,
            db=db_session,
        )
        assert "Test Project" in metadata["title"]


# ============================================================================
# CRC32 Helper Tests
# ============================================================================

class TestCRC32:
    """Tests for the _crc32 helper method."""

    def test_crc32_empty_bytes(self, service):
        """CRC32 of empty bytes is zero."""
        assert service._crc32(b"") == 0

    def test_crc32_known_value(self, service):
        """CRC32 of known data matches expected value."""
        # zlib.crc32(b"test") & 0xFFFFFFFF == 0xD87F7E0C
        result = service._crc32(b"test")
        assert result == 0xD87F7E0C

    def test_crc32_returns_unsigned_int(self, service):
        """CRC32 returns an unsigned 32-bit integer."""
        result = service._crc32(b"some data")
        assert isinstance(result, int)
        assert 0 <= result <= 0xFFFFFFFF


# ============================================================================
# PNG Fallback Tests
# ============================================================================

class TestPNGFallback:
    """Tests for the PNG fallback when renderPM is unavailable."""

    def test_png_fallback_returns_valid_png(self, service):
        """PNG fallback produces a valid PNG signature."""
        view_data = {
            "metrics": {},
            "table_data": [],
            "data_points": 0,
        }
        # Force the fallback path by patching drawToString
        import unittest.mock
        with unittest.mock.patch(
            "reportlab.graphics.renderPM.drawToString",
            side_effect=Exception("rlPyCairo not available"),
        ):
            result = service._generate_png(view_data, "Fallback Test", None, 1920, 1080)
            # Should start with PNG signature
            assert result[:8] == b'\x89PNG\r\n\x1a\n'
            assert len(result) > 0

    def test_png_fallback_minimal_size(self, service):
        """PNG fallback produces a minimal PNG file."""
        view_data = {
            "metrics": {},
            "table_data": [],
            "data_points": 0,
        }
        import unittest.mock
        with unittest.mock.patch(
            "reportlab.graphics.renderPM.drawToString",
            side_effect=Exception("rlPyCairo not available"),
        ):
            result = service._generate_png(view_data, "Small", None, 100, 100)
            # A minimal 1x1 PNG is around 67 bytes
            assert len(result) >= 67


# ============================================================================
# Delegate Handler Tests
# ============================================================================

class TestDelegateHandlers:
    """Tests for view handlers that delegate to other handlers."""

    def test_schedule_delegates_to_gantt(self, service, db_session, sample_task):
        """Schedule handler delegates to Gantt handler."""
        schedule_result = service._handle_schedule(None, db_session)
        gantt_result = service._handle_gantt(None, db_session)
        # Both should have the same structure
        assert "metrics" in schedule_result
        assert "Total Tasks" in schedule_result["metrics"]
        assert schedule_result["metrics"]["Total Tasks"] == gantt_result["metrics"]["Total Tasks"]

    def test_costing_delegates_to_evm(self, service, db_session, sample_project):
        """Costing handler delegates to EVM handler."""
        costing_result = service._handle_costing(None, db_session)
        evm_result = service._handle_evm(None, db_session)
        # Both should have the same metrics
        assert "BAC" in costing_result["metrics"]
        assert "CPI" in costing_result["metrics"]
        assert costing_result["metrics"]["BAC"] == evm_result["metrics"]["BAC"]

    def test_schedule_with_project_filter(self, service, db_session, sample_project, sample_task):
        """Schedule handler respects project_id filter via Gantt."""
        result = service._handle_schedule(sample_project.id, db_session)
        assert "metrics" in result
        assert "Total Tasks" in result["metrics"]

    def test_costing_with_project_filter(self, service, db_session, sample_project):
        """Costing handler respects project_id filter via EVM."""
        result = service._handle_costing(sample_project.id, db_session)
        assert "metrics" in result
        assert "BAC" in result["metrics"]


# ============================================================================
# Unsupported View Type Tests
# ============================================================================

class TestUnsupportedViewType:
    """Tests for unsupported view type handling."""

    def test_export_view_raises_for_unknown_handler(self, service, db_session):
        """export_view raises ValueError if handler is removed."""
        import unittest.mock
        # Temporarily remove a handler
        original = service.view_handlers.pop(ViewType.DASHBOARD)
        try:
            with pytest.raises(ValueError, match="Unsupported view type"):
                service.export_view(
                    view_type=ViewType.DASHBOARD,
                    format=ExportFormat.PNG,
                    project_id=None,
                    dashboard_id=None,
                    db=db_session,
                )
        finally:
            # Restore the handler
            service.view_handlers[ViewType.DASHBOARD] = original


# ============================================================================
# PDF to PNG Tests
# ============================================================================

class TestPDFToPNG:
    """Tests for the _pdf_to_png placeholder method."""

    def test_pdf_to_png_returns_bytes(self, service):
        """_pdf_to_png returns bytes when renderPM backend is available."""
        import unittest.mock
        # Mock drawToFile since rlPyCairo is not available in the test env
        mock_buffer = unittest.mock.MagicMock()
        with unittest.mock.patch(
            "reportlab.graphics.renderPM.drawToFile",
            side_effect=lambda d, f, fmt: f.write(b"\x89PNG\r\n\x1a\n"),
        ):
            result = service._pdf_to_png(b"%PDF-1.4 fake pdf", 1920, 1080)
            assert isinstance(result, bytes)
            assert len(result) > 0
