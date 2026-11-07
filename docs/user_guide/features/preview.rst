Quick Previews
==============


Hover over items to see quick previews without navigating away from your current view.

previews
~~~~~~~~


Preview endpoints for hover summary cards.

This module provides lightweight, high-speed API endpoints that return
just enough data for the hover inspector modals to display contextual
summary cards.  Unlike the full WBS/resource/location endpoints, these
endpoints avoid loading deep relationship graphs, large JSONB attributes,
or sub-tree payloads.

Each endpoint enforces ABAC (Attribute-Based Access Control) clearance
checks.  If the requesting user lacks the required security clearance
for a node, the sensitive fields are masked as ``'[RESTRICTED]'`` and
``is_masked`` is set to ``True`` — preserving the existence of the node
without exposing classified details.

Endpoints
~~~~~~~~~

- ``GET /api/v1/previews/tasks/{id}`` — Task hover preview with dates,
  progress, float, blockers, CDRL, and V&V summary.

- ``GET /api/v1/previews/resources/{id}`` — Resource hover preview with
  type, location, allocation, and top skills.

- ``GET /api/v1/previews/locations/{id}`` — Location hover preview with
  tier, SCIF status, and contained asset count.

Performance
~~~~~~~~~~~

These endpoints use targeted ``select()`` queries that fetch only the
columns needed for each preview type.  No eager loading of relationships
or cascade joins — each secondary query (assignments, blockers, CDRLs,
V&V tests) is a simple indexed lookup by foreign key.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Return a lightweight preview of a PortfolioNode for hover cards.
* **View**: Return a lightweight preview of a ResourceNode for hover cards.
* **View**: Return a lightweight preview of a LocationNode for hover cards.
