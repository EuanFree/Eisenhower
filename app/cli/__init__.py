"""CLI package for the Eisenhower Portfolio Manager.

This package provides command-line tools for managing the portfolio
management system, including database seeding, benchmark testing,
and administrative utilities.

Available Commands
~~~~~~~~~~~~~~~~~~

- ``python -m app.cli.seed`` — Generate realistic high-density defence
  programme data for load and stress testing.  Supports configurable
  scale via CLI arguments and includes benchmark validation with
  timing measurements.

- ``eisenhower-admin`` (``python -m app.cli.admin_cli``) — Standalone
  administrative terminal for offline TTY environments.  Provides
  superuser provisioning, database maintenance, emergency data
  spillage purge with multi-sig authorization, diode force-poll,
  and WORM cold-storage programme freeze.

  Sub-commands:

  - ``user create-superuser`` — Interactive superuser provisioning.
  - ``db reindex-trees`` — Concurrent VACUUM and REINDEX on ltree GiST.
  - ``security emergency-purge`` — Multi-sig data spillage purge.
  - ``diode force-poll`` — Process spooled .defpack bundles.
  - ``archive freeze`` — WORM cold-storage freeze on programmes.
"""
