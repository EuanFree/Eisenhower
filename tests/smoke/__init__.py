"""Smoke test package for operational readiness verification.

This package contains end-to-end smoke tests that verify the complete
Eisenhower Defence PPM system pipeline using a live PostgreSQL database.
Unlike the unit tests (which use in-memory SQLite), these tests exercise
the full stack including ltree containment queries, JSONB fields, and
all service engines (CPM, Monte Carlo, clash daemon, leveling, baselines,
Oracle staging, P6 export, and subcontractor ingest).

Run the full readiness audit from the command line::

    python -m tests.smoke.run_readiness_audit

Or run individual test classes via pytest::

    pytest tests/smoke/test_operational_readiness.py -v

Prerequisites
~~~~~~~~~~~~~

A live PostgreSQL instance must be reachable. Set the environment variable::

    set E2E_DATABASE_URL=postgresql://user:pass@localhost:5432/eisenhower_smoke

If no database is available, all tests skip gracefully.
"""
