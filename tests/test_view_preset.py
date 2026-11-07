"""Unit tests for Gantt view preset schemas and validation.

This module tests the Pydantic schemas in ``app/schemas/view_preset.py``
and the Master Column Catalogue validation logic.  All tests run against
in-memory SQLite using the shared conftest fixtures.

Test Coverage
~~~~~~~~~~~~~

- **Master Column Catalogue**: Field validation, unknown field rejection,
  catalogue size verification.
- **ColumnConfig**: Valid column creation, width bounds, label length.
- **SortConfig**: Valid sort field, direction validation.
- **GanttSettings**: Zoom level validation, boolean defaults.
- **ConfigPayload**: Split ratio bounds, density validation, filter mode,
  minimum visible columns, full payload creation.
- **GanttViewPresetCreate**: Full creation payload, classification levels,
  sharing scope options.
- **GanttViewPresetUpdate**: Partial updates, empty update.
- **PPMViewExport**: Export format structure.
- **SharingScope & PresetClassification**: Enum values and string conversion.
"""

import pytest
from uuid import uuid4
from pydantic import ValidationError

from app.models.display import (
    MASTER_COLUMN_CATALOGUE,
    SharingScope,
    PresetClassification,
)
from app.schemas.view_preset import (
    ColumnConfig,
    SortConfig,
    GanttSettings,
    ConfigPayload,
    GanttViewPresetCreate,
    GanttViewPresetUpdate,
    GanttViewPresetResponse,
    GanttViewPresetListResponse,
    GanttViewPresetImportResponse,
    PPMViewExport,
)


# ============================================================================
# Master Column Catalogue Tests
# ============================================================================


class TestMasterColumnCatalogue:
    """Tests for the Master Column Catalogue constant."""

    def test_catalogue_is_not_empty(self):
        """The catalogue must contain at least one field."""
        assert len(MASTER_COLUMN_CATALOGUE) > 0

    def test_catalogue_has_expected_fields(self):
        """Verify key fields are present in the catalogue."""
        expected = ["code", "name", "planned_start_date", "total_float",
                     "percent_complete", "bac_cost", "earned_value",
                     "dal_sil_level", "active_blockers"]
        for field in expected:
            assert field in MASTER_COLUMN_CATALOGUE, f"Missing field: {field}"

    def test_catalogue_fields_are_strings(self):
        """All catalogue entries must be strings."""
        for field in MASTER_COLUMN_CATALOGUE:
            assert isinstance(field, str)

    def test_catalogue_has_no_duplicates(self):
        """The catalogue must not contain duplicate field names."""
        assert len(MASTER_COLUMN_CATALOGUE) == len(set(MASTER_COLUMN_CATALOGUE))


# ============================================================================
# ColumnConfig Tests
# ============================================================================


class TestColumnConfig:
    """Tests for the ColumnConfig schema."""

    def test_valid_column(self):
        """A valid column config should be created successfully."""
        col = ColumnConfig(field="code", label="Task Code", width=120)
        assert col.field == "code"
        assert col.label == "Task Code"
        assert col.width == 120
        assert col.visible is True
        assert col.frozen is False

    def test_custom_width_and_frozen(self):
        """Custom width and frozen flag should be preserved."""
        col = ColumnConfig(
            field="name",
            label="Name & Title",
            width=300,
            visible=True,
            frozen=True
        )
        assert col.width == 300
        assert col.frozen is True

    def test_unknown_field_rejected(self):
        """A field not in the Master Column Catalogue must be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ColumnConfig(field="nonexistent_field", label="Bad")
        assert "nonexistent_field" in str(exc_info.value)
        assert "Master Column Catalogue" in str(exc_info.value)

    def test_width_below_minimum(self):
        """Width below 50 pixels must be rejected."""
        with pytest.raises(ValidationError):
            ColumnConfig(field="code", label="Code", width=10)

    def test_width_above_maximum(self):
        """Width above 800 pixels must be rejected."""
        with pytest.raises(ValidationError):
            ColumnConfig(field="code", label="Code", width=900)

    def test_empty_label_rejected(self):
        """An empty label must be rejected."""
        with pytest.raises(ValidationError):
            ColumnConfig(field="code", label="")

    def test_label_too_long(self):
        """A label exceeding 100 characters must be rejected."""
        with pytest.raises(ValidationError):
            ColumnConfig(field="code", label="A" * 101)

    def test_all_catalogue_fields_accepted(self):
        """Every field in the catalogue must be accepted as a valid column."""
        for field in MASTER_COLUMN_CATALOGUE:
            col = ColumnConfig(field=field, label=field)
            assert col.field == field


# ============================================================================
# SortConfig Tests
# ============================================================================


class TestSortConfig:
    """Tests for the SortConfig schema."""

    def test_default_sort(self):
        """Default sort should be planned_start_date ascending."""
        sort = SortConfig()
        assert sort.field == "planned_start_date"
        assert sort.direction == "asc"

    def test_descending_sort(self):
        """Descending sort direction should be accepted."""
        sort = SortConfig(field="total_float", direction="desc")
        assert sort.field == "total_float"
        assert sort.direction == "desc"

    def test_invalid_direction(self):
        """Invalid sort direction must be rejected."""
        with pytest.raises(ValidationError):
            SortConfig(field="code", direction="invalid")

    def test_unknown_sort_field(self):
        """Unknown sort field must be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            SortConfig(field="unknown_field", direction="asc")
        assert "unknown_field" in str(exc_info.value)


# ============================================================================
# GanttSettings Tests
# ============================================================================


class TestGanttSettings:
    """Tests for the GanttSettings schema."""

    def test_default_settings(self):
        """Default Gantt settings should have reasonable values."""
        gs = GanttSettings()
        assert gs.zoom_level == "WEEKS"
        assert gs.show_baselines is True
        assert gs.show_drop_line is True
        assert gs.show_dependencies is True
        assert gs.show_presence is True

    def test_zoom_levels(self):
        """All three zoom levels should be accepted."""
        for level in ["DAYS", "WEEKS", "MONTHS"]:
            gs = GanttSettings(zoom_level=level)
            assert gs.zoom_level == level

    def test_invalid_zoom_level(self):
        """Invalid zoom level must be rejected."""
        with pytest.raises(ValidationError):
            GanttSettings(zoom_level="HOURS")

    def test_disable_features(self):
        """All boolean features can be disabled."""
        gs = GanttSettings(
            show_baselines=False,
            show_drop_line=False,
            show_dependencies=False,
            show_presence=False
        )
        assert gs.show_baselines is False
        assert gs.show_drop_line is False


# ============================================================================
# ConfigPayload Tests
# ============================================================================


class TestConfigPayload:
    """Tests for the ConfigPayload schema (.ppmview.json specification)."""

    def _minimal_columns(self):
        """Return a minimal valid columns list."""
        return [
            {"field": "code", "label": "Code", "width": 120},
            {"field": "name", "label": "Name", "width": 200},
        ]

    def test_minimal_valid_payload(self):
        """A minimal valid payload should be accepted."""
        cp = ConfigPayload(columns=self._minimal_columns())
        assert len(cp.columns) == 2
        assert cp.density == "BALANCED"
        assert cp.split_ratio == 0.6
        assert cp.filter_tokens == ""
        assert cp.filter_mode == "FILTER"

    def test_full_payload(self):
        """A full payload with all fields should be accepted."""
        cp = ConfigPayload(
            columns=self._minimal_columns(),
            sort={"field": "planned_start_date", "direction": "asc"},
            density="ULTRA_DENSE",
            split_ratio=0.5,
            filter_tokens="is:critical float:<5d",
            filter_mode="DIM",
            gantt={
                "zoom_level": "DAYS",
                "show_baselines": True,
                "show_drop_line": True,
                "show_dependencies": True,
                "show_presence": True,
            }
        )
        assert cp.density == "ULTRA_DENSE"
        assert cp.split_ratio == 0.5
        assert cp.filter_mode == "DIM"

    def test_split_ratio_below_minimum(self):
        """Split ratio below 0.1 must be rejected."""
        with pytest.raises(ValidationError):
            ConfigPayload(
                columns=self._minimal_columns(),
                split_ratio=0.05
            )

    def test_split_ratio_above_maximum(self):
        """Split ratio above 0.9 must be rejected."""
        with pytest.raises(ValidationError):
            ConfigPayload(
                columns=self._minimal_columns(),
                split_ratio=0.95
            )

    def test_split_ratio_boundary_low(self):
        """Split ratio of exactly 0.1 must be accepted."""
        cp = ConfigPayload(
            columns=self._minimal_columns(),
            split_ratio=0.1
        )
        assert cp.split_ratio == 0.1

    def test_split_ratio_boundary_high(self):
        """Split ratio of exactly 0.9 must be accepted."""
        cp = ConfigPayload(
            columns=self._minimal_columns(),
            split_ratio=0.9
        )
        assert cp.split_ratio == 0.9

    def test_invalid_density(self):
        """Invalid density value must be rejected."""
        with pytest.raises(ValidationError):
            ConfigPayload(
                columns=self._minimal_columns(),
                density="INVALID"
            )

    def test_all_density_values(self):
        """All three density values must be accepted."""
        for density in ["ULTRA_DENSE", "BALANCED", "COMFORT"]:
            cp = ConfigPayload(
                columns=self._minimal_columns(),
                density=density
            )
            assert cp.density == density

    def test_invalid_filter_mode(self):
        """Invalid filter mode must be rejected."""
        with pytest.raises(ValidationError):
            ConfigPayload(
                columns=self._minimal_columns(),
                filter_mode="INVALID"
            )

    def test_filter_tokens_max_length(self):
        """Filter tokens exceeding 500 characters must be rejected."""
        with pytest.raises(ValidationError):
            ConfigPayload(
                columns=self._minimal_columns(),
                filter_tokens="A" * 501
            )

    def test_filter_tokens_max_length_boundary(self):
        """Filter tokens of exactly 500 characters must be accepted."""
        cp = ConfigPayload(
            columns=self._minimal_columns(),
            filter_tokens="A" * 500
        )
        assert len(cp.filter_tokens) == 500

    def test_empty_columns_rejected(self):
        """An empty columns list must be rejected."""
        with pytest.raises(ValidationError):
            ConfigPayload(columns=[])

    def test_all_columns_hidden_rejected(self):
        """If all columns are hidden, the payload must be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ConfigPayload(
                columns=[
                    {"field": "code", "label": "Code", "visible": False},
                    {"field": "name", "label": "Name", "visible": False},
                ]
            )
        assert "visible" in str(exc_info.value).lower()

    def test_unknown_column_field_in_payload(self):
        """Unknown column field in payload must be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ConfigPayload(
                columns=[
                    {"field": "code", "label": "Code"},
                    {"field": "fake_field", "label": "Fake"},
                ]
            )
        assert "fake_field" in str(exc_info.value)

    def test_model_dump_produces_dict(self):
        """model_dump() should produce a plain dictionary for JSONB storage."""
        cp = ConfigPayload(columns=self._minimal_columns())
        dump = cp.model_dump()
        assert isinstance(dump, dict)
        assert "columns" in dump
        assert "density" in dump
        assert "split_ratio" in dump


# ============================================================================
# GanttViewPresetCreate Tests
# ============================================================================


class TestGanttViewPresetCreate:
    """Tests for the GanttViewPresetCreate schema."""

    def _minimal_config(self):
        """Return a minimal valid config payload."""
        return {
            "columns": [
                {"field": "code", "label": "Code"},
                {"field": "name", "label": "Name"},
            ]
        }

    def test_minimal_create(self):
        """A minimal create request should use sensible defaults."""
        data = GanttViewPresetCreate(
            name="Test Preset",
            config_payload=self._minimal_config()
        )
        assert data.name == "Test Preset"
        assert data.description is None
        assert data.project_id is None
        assert data.sharing_scope == SharingScope.PRIVATE
        assert data.classification == PresetClassification.OFFICIAL

    def test_full_create(self):
        """A full create request with all fields should be accepted."""
        project_id = uuid4()
        data = GanttViewPresetCreate(
            name="CAM Cost Audit",
            description="EVM-focused view for contract management",
            project_id=project_id,
            sharing_scope=SharingScope.PROJECT_SHARED,
            classification=PresetClassification.SECRET,
            config_payload=self._minimal_config()
        )
        assert data.name == "CAM Cost Audit"
        assert data.project_id == project_id
        assert data.sharing_scope == SharingScope.PROJECT_SHARED
        assert data.classification == PresetClassification.SECRET

    def test_name_too_long(self):
        """A name exceeding 100 characters must be rejected."""
        with pytest.raises(ValidationError):
            GanttViewPresetCreate(
                name="A" * 101,
                config_payload=self._minimal_config()
            )

    def test_empty_name_rejected(self):
        """An empty name must be rejected."""
        with pytest.raises(ValidationError):
            GanttViewPresetCreate(
                name="",
                config_payload=self._minimal_config()
            )

    def test_missing_config_payload(self):
        """Missing config_payload must be rejected."""
        with pytest.raises(ValidationError):
            GanttViewPresetCreate(name="Test")

    def test_all_sharing_scopes(self):
        """All sharing scope values must be accepted."""
        for scope in SharingScope:
            data = GanttViewPresetCreate(
                name="Test",
                sharing_scope=scope,
                config_payload=self._minimal_config()
            )
            assert data.sharing_scope == scope

    def test_all_classifications(self):
        """All classification values must be accepted."""
        for cls in PresetClassification:
            data = GanttViewPresetCreate(
                name="Test",
                classification=cls,
                config_payload=self._minimal_config()
            )
            assert data.classification == cls


# ============================================================================
# GanttViewPresetUpdate Tests
# ============================================================================


class TestGanttViewPresetUpdate:
    """Tests for the GanttViewPresetUpdate schema."""

    def test_empty_update(self):
        """An empty update (no fields) should be accepted."""
        data = GanttViewPresetUpdate()
        assert data.name is None
        assert data.description is None
        assert data.sharing_scope is None
        assert data.classification is None
        assert data.config_payload is None

    def test_partial_name_update(self):
        """Updating only the name should work."""
        data = GanttViewPresetUpdate(name="Renamed Preset")
        assert data.name == "Renamed Preset"
        assert data.sharing_scope is None

    def test_partial_config_update(self):
        """Updating only the config_payload should work."""
        config = {
            "columns": [
                {"field": "code", "label": "Code"},
                {"field": "name", "label": "Name"},
            ]
        }
        data = GanttViewPresetUpdate(config_payload=config)
        assert data.config_payload is not None
        assert data.config_payload.density == "BALANCED"

    def test_exclude_unset(self):
        """model_dump(exclude_unset=True) should only include set fields."""
        data = GanttViewPresetUpdate(name="New Name")
        dump = data.model_dump(exclude_unset=True)
        assert "name" in dump
        assert "description" not in dump
        assert "sharing_scope" not in dump


# ============================================================================
# PPMViewExport Tests
# ============================================================================


class TestPPMViewExport:
    """Tests for the PPMViewExport schema."""

    def test_export_structure(self):
        """Export should have all required metadata fields."""
        export = PPMViewExport(
            preset_name="Test Preset",
            classification="OFFICIAL",
            export_timestamp="2026-10-24T12:00:00",
            config={"columns": [], "density": "BALANCED"}
        )
        assert export.version == "1.0"
        assert export.preset_name == "Test Preset"
        assert export.classification == "OFFICIAL"

    def test_export_model_dump(self):
        """model_dump() should produce a serializable dictionary."""
        export = PPMViewExport(
            preset_name="Test",
            classification="OFFICIAL",
            export_timestamp="2026-10-24T12:00:00",
            config={"columns": [], "density": "BALANCED"}
        )
        dump = export.model_dump()
        assert isinstance(dump, dict)
        assert "version" in dump
        assert "preset_name" in dump
        assert "classification" in dump
        assert "export_timestamp" in dump
        assert "config" in dump


# ============================================================================
# Enum Tests
# ============================================================================


class TestEnums:
    """Tests for SharingScope and PresetClassification enums."""

    def test_sharing_scope_values(self):
        """SharingScope must have exactly 3 values."""
        assert len(SharingScope) == 3
        assert SharingScope.PRIVATE.value == "PRIVATE"
        assert SharingScope.PROJECT_SHARED.value == "PROJECT_SHARED"
        assert SharingScope.SYSTEM_GLOBAL.value == "SYSTEM_GLOBAL"

    def test_preset_classification_values(self):
        """PresetClassification must have exactly 3 values."""
        assert len(PresetClassification) == 3
        assert PresetClassification.OFFICIAL.value == "OFFICIAL"
        assert PresetClassification.SECRET.value == "SECRET"
        assert PresetClassification.TOP_SECRET.value == "TOP_SECRET"

    def test_sharing_scope_string_conversion(self):
        """SharingScope should convert to string correctly."""
        assert str(SharingScope.PRIVATE) == "SharingScope.PRIVATE"
        assert SharingScope.PRIVATE.value == "PRIVATE"

    def test_preset_classification_string_conversion(self):
        """PresetClassification should convert to string correctly."""
        assert str(PresetClassification.SECRET) == "PresetClassification.SECRET"
        assert PresetClassification.SECRET.value == "SECRET"


# ============================================================================
# Import/Export Response Tests
# ============================================================================


class TestImportExportResponses:
    """Tests for import/export response schemas."""

    def test_successful_import_response(self):
        """A successful import response should have preset_id."""
        preset_id = uuid4()
        resp = GanttViewPresetImportResponse(
            success=True,
            preset_id=preset_id,
            message="Imported successfully."
        )
        assert resp.success is True
        assert resp.preset_id == preset_id
        assert resp.errors == []

    def test_failed_import_response(self):
        """A failed import response should have errors."""
        resp = GanttViewPresetImportResponse(
            success=False,
            errors=["Invalid JSON", "Missing config key"],
            message="Import failed."
        )
        assert resp.success is False
        assert resp.preset_id is None
        assert len(resp.errors) == 2

    def test_list_response(self):
        """List response should contain presets and total count."""
        resp = GanttViewPresetListResponse(presets=[], total=0)
        assert resp.presets == []
        assert resp.total == 0
