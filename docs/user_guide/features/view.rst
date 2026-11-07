Views & Presets
===============


Save and share custom views of your project data. Import and export view configurations.

Multi-View Presets
~~~~~~~~~~~~~~~~~~


Multi-view preset API router.

This module provides CRUD endpoints for managing multi-view layout presets
at ``/api/v1/presets``.  Unlike the Gantt-specific view presets at
``/api/v1/views``, these presets cover all primary application views:
WBS_GANTT, DAILY_COCKPIT, SRA_RISK, FACILITY_CHAMBER, and EVM_REPORTING.

Endpoints
~~~~~~~~~

- ``GET /presets`` — List all presets accessible to the current user.
- ``POST /presets`` — Create a new preset.
- ``PUT /presets/{id}`` — Update an existing preset (author or admin only).
- ``POST /presets/import-file`` — Import a .ppmview.json file upload.
- ``GET /presets/{id}/export-file`` — Download a validated .ppmview.json file.

Access Control
~~~~~~~~~~~~~~

- **GET /presets** returns presets where:
  - ``author_user_id == current_user.id`` (own presets), OR
  - ``sharing_scope IN ('PROJECT_SHARED', 'SYSTEM_GLOBAL')`` (shared presets).
- **PUT /presets/{id}** requires the user to be the preset author or an admin.
- All endpoints enforce ABAC clearance: the user's clearance must be >= the
  preset's classification level.

File Import/Export
~~~~~~~~~~~~~~~~~~

The ``.ppmview.json`` format is a validated JSON representation of a preset's
config_payload, wrapped with metadata headers (version, view type, preset name,
classification, export timestamp).  This format enables offline transport
of view configurations between air-gapped systems.

Import validates the uploaded file against the Pydantic schema before
creating the preset.  Export produces a clean, classification-stamped JSON
file suitable for optical media or USB diode transfer.

Gantt View Presets
~~~~~~~~~~~~~~~~~~


Gantt view preset API router.

This module provides CRUD endpoints for managing customised Gantt grid view
presets.  Presets allow users to save, share, and export complete view
configurations including column layout, filter tokens, density tier, split-pane
ratio, and Gantt-specific settings.

Endpoints
~~~~~~~~~

- ``GET /presets`` — List all presets accessible to the current user.
- ``POST /presets`` — Create a new preset.
- ``PUT /presets/{id}`` — Update an existing preset (owner or admin only).
- ``DELETE /presets/{id}`` — Delete a preset (owner or admin only).
- ``GET /presets/{id}`` — Get a single preset by ID.
- ``POST /presets/import-file`` — Import a .ppmview.json file upload.
- ``GET /presets/{id}/export-file`` — Download a validated .ppmview.json file.

Access Control
~~~~~~~~~~~~~~

- **GET /presets** returns presets where:
  - ``owner_user_id == current_user.id`` (own presets), OR
  - ``sharing_scope IN ('PROJECT_SHARED', 'SYSTEM_GLOBAL')`` (shared presets).
- **PUT /presets/{id}** requires the user to be the preset owner or an admin.
- **DELETE /presets/{id}** requires the user to be the preset owner or an admin.
- All endpoints enforce ABAC clearance: the user's clearance must be >= the
  preset's classification level.

File Import/Export
~~~~~~~~~~~~~~~~~~

The ``.ppmview.json`` format is a validated JSON representation of a preset's
config_payload, wrapped with metadata headers (version, preset name,
classification, export timestamp).  This format enables offline transport
of view configurations between air-gapped systems.

Import validates the uploaded file against the full Pydantic schema before
creating the preset.  Export produces a clean, classification-stamped JSON
file suitable for optical media or USB diode transfer.
