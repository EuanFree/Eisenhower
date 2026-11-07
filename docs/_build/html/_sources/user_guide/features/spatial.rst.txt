Location Tracking
=================


Track resource locations and manage facility assignments.

spatial
~~~~~~~


Spatial location tracking and asset custody API router.

This module provides the REST API endpoints for managing physical asset
locations, querying location inventories, and retrieving custody history.

It is the web-facing layer for the spatial tracking system, sitting on top
of :mod:`app.services.spatial`.  All endpoints require JWT authentication.

Endpoints
~~~~~~~~~

- **POST /relocate** — Execute an asset relocation with clearance validation.
- **GET /locations/{id}/inventory** — Query all assets in a location and
  its sub-locations.
- **GET /assets/{id}/custody-history** — Retrieve the complete movement
  trail for an asset.

Security
~~~~~~~~

All endpoints require:

1. **JWT Authentication** — The user must provide a valid JWT token.
2. **Clearance Validation** — The ``relocate`` endpoint enforces that the
   user has sufficient clearance for the target location and that the asset's
   classification does not exceed the location's rating.

Usage Examples
~~~~~~~~~~~~~~

Relocate an asset::

   POST /api/v1/spatial/relocate
   {
   "resource_id": "asset-uuid",
   "target_location_id": "room-uuid",
   "reason": "Move test bench to integration bay"
   }

Query location inventory::

   GET /api/v1/spatial/locations/{location_id}/inventory

Get custody history::

   GET /api/v1/spatial/assets/{asset_id}/custody-history
