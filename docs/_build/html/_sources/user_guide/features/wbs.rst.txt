Work Breakdown Structure
========================


Organise work hierarchically using the Work Breakdown Structure. Create programmes, projects, and tasks in a tree view that reflects how work is broken down.

WBS - Work Breakdown Structure
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


WBS (Work Breakdown Structure) router with ABAC filtering.

Provides endpoints for querying and managing the portfolio/project tree
using ltree hierarchical queries. All tree retrieval queries apply
Attribute-Based Access Control (ABAC) filtering with ghost-node masking
to preserve tree structure when users lack clearance for certain nodes.

Batch Rollback / Undo
~~~~~~~~~~~~~~~~~~~~~

The ``POST /batch-rollback`` endpoint supports client-side Undo/Redo by
atomically reverting a set of field-level mutations in a single database
transaction.  Each revert operation is checked against the node's
``version_id`` for optimistic concurrency.  A ForensicAuditLog entry is
written with SHA-256 chained hashing, linking the rollback to the original
mutation's transaction ID.  If a project ID is provided, CPM recalculation
is triggered after the rollback completes.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Retrieve the WBS tree rooted at the specified node, with ABAC filtering.
* **View**: List WBS nodes with optional filtering, applying ABAC rules.
* **View**: Retrieve a single WBS node, checking ABAC access.
* **View**: Get all descendants of a node with ABAC filtering.

**Creating New Items**

* **Create**: Create a new WBS node in the tree.
* **Create**: Atomically revert a batch of field-level mutations (Undo operation).

**Updating Information**

* **Update**: Update an existing WBS node with optimistic concurrency control.

**Removing Items**

* **Delete**: Delete a WBS node and all its descendants.
