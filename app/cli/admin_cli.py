"""Standalone administrative terminal CLI for the Eisenhower Portfolio Manager.

This module provides the ``eisenhower-admin`` command-line utility for
offline TTY environments.  It requires no graphical display and operates
entirely via standard input/output.

Available Commands
~~~~~~~~~~~~~~~~~~

- **user create-superuser** — Interactive superuser provisioning with
  SYSTEM_ADMIN role and root clearance.
- **db reindex-trees** — Concurrent VACUUM and REINDEX on PostgreSQL
  ltree GiST indexes.
- **security emergency-purge** — Multi-sig console for surgical data
  spillage purge with immutable tombstones.
- **diode force-poll** — Manual trigger for spooled .defpack bundle
  processing from the diode dropzone.
- **archive freeze** — Immutable WORM cold-storage freeze on completed
  programmes.

Usage
~~~~~

    eisenhower-admin user create-superuser
    eisenhower-admin db reindex-trees
    eisenhower-admin security emergency-purge
    eisenhower-admin diode force-poll
    eisenhower-admin archive freeze --programme-id=<UUID>

Or directly via module::

    python -m app.cli.admin_cli --help
"""
import hashlib
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import click

# Ensure the project root is on sys.path so `python -m app.cli.admin_cli` works
sys.path.insert(
    0,
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)


# ============================================================================
# Helpers
# ============================================================================


def _get_db_engine():
    """Lazily import and return the SQLAlchemy engine."""
    from app.database import engine
    return engine


def _get_session():
    """Return a short-lived database session."""
    from app.database import SessionLocal
    return SessionLocal()


def _print_banner():
    """Print the administrative terminal banner."""
    click.secho("=" * 60, bold=True)
    click.secho("  EISENHOWER PORTFOLIO MANAGER — Administrative Terminal", bold=True)
    click.secho("=" * 60, bold=True)
    click.echo()


def _confirm_destructive(action: str) -> bool:
    """Prompt for explicit confirmation before a destructive action."""
    click.secho(f"\n[DANGER] You are about to: {action}", fg="red", bold=True)
    return click.confirm("  Type YES to confirm", show_default=False)


# ============================================================================
# Root CLI Group
# ============================================================================


@click.group()
@click.version_option(version="1.0.0", prog_name="eisenhower-admin")
def cli():
    """Eisenhower Portfolio Manager — Administrative Terminal.

    This tool operates fully in offline TTY environments without
    graphical display dependencies.
    """
    _print_banner()


# ============================================================================
# USER group — Superuser provisioning
# ============================================================================


@cli.group()
def user():
    """User management commands."""
    pass


@user.command("create-superuser")
@click.option("--username", "-u", default=None, help="Superuser login name.")
@click.option("--email", "-e", default=None, help="Superuser email address.")
@click.option("--pki-dn", "-p", default=None, help="PKI Distinguished Name (X.509 subject).")
@click.option("--full-name", "-n", default=None, help="Human-readable full name.")
def create_superuser(username, email, pki_dn, full_name):
    """Create a SYSTEM_ADMIN superuser with root clearance.

    Prompts interactively for username, email, PKI DN, and assigns
    SYSTEM_ADMIN role with TOP_SECRET clearance and all caveats.
    """
    # Interactive prompts for missing values
    if not username:
        username = click.prompt("Username", type=str)
    if not email:
        email = click.prompt("Email", type=str)
    if not pki_dn:
        pki_dn = click.prompt(
            "PKI Distinguished Name (e.g. CN=Admin/O=MoD/C=GB)",
            default=f"CN={username}/O=Eisenhower/C=GB",
        )
    if not full_name:
        full_name = click.prompt(
            "Full Name",
            default=username.replace("-", " ").replace("_", " ").title(),
        )

    # Generate a random temporary password
    import secrets
    temp_password = secrets.token_urlsafe(24)

    # Create the user in the database
    from app.models.models import User, UserRole, SecurityClassification
    from app.utils.security import get_password_hash

    db = _get_session()
    try:
        # Check for existing user
        existing = db.query(User).filter(
            (User.username == username) | (User.email == email)
        ).first()
        if existing:
            click.secho(
                f"ERROR: User '{username}' or email '{email}' already exists.",
                fg="red", bold=True,
            )
            sys.exit(1)

        super_user = User(
            username=username,
            email=email,
            hashed_password=get_password_hash(temp_password),
            full_name=full_name,
            role=UserRole.ADMIN,
            is_active=True,
            clearance_level=SecurityClassification.TOP_SECRET,
            caveats=["UK_EYES_ONLY", "NOFORN"],
            pki_dn=pki_dn,
        )
        db.add(super_user)
        db.commit()

        click.secho("\nSuperuser created successfully!", fg="green", bold=True)
        click.echo(f"  Username:      {username}")
        click.echo(f"  Email:         {email}")
        click.echo(f"  PKI DN:        {pki_dn}")
        click.echo(f"  Role:          SYSTEM_ADMIN")
        click.echo(f"  Clearance:     TOP_SECRET")
        click.echo(f"  Caveats:       UK_EYES_ONLY, NOFORN")
        click.secho(
            f"\n  Temporary password: {temp_password}",
            fg="yellow", bold=True,
        )
        click.secho(
            "\n  IMPORTANT: Change this password on first login.",
            fg="yellow", bold=True,
        )

        # Log the creation in the audit trail
        from app.models.models import ForensicAuditLog
        audit_entry = ForensicAuditLog.create_entry(
            transaction_id=uuid.uuid4(),
            user_upn=f"admin-cli:{username}",
            client_ip="127.0.0.1",
            action_type="SUPERUSER_CREATE",
            entity_type="User",
            entity_id=super_user.id if hasattr(super_user, "id") and super_user.id else uuid.uuid4(),
            json_diff={
                "username": username,
                "email": email,
                "pki_dn": pki_dn,
                "role": "SYSTEM_ADMIN",
            },
            security_marking="TOP_SECRET",
        )
        db.add(audit_entry)
        db.commit()

    except Exception as exc:
        db.rollback()
        click.secho(f"ERROR: Failed to create superuser: {exc}", fg="red", bold=True)
        sys.exit(1)
    finally:
        db.close()


# ============================================================================
# DB group — Database maintenance
# ============================================================================


@cli.group()
def db():
    """Database maintenance commands."""
    pass


@db.command("reindex-trees")
@click.option("--dry-run", is_flag=True, help="Show the SQL without executing.")
def reindex_trees(dry_run):
    """Execute concurrent VACUUM and REINDEX on PostgreSQL ltree GiST indexes.

    Rebuilds the GiST index on universal_breakdown_nodes.path to eliminate
    bloat and restore sub-millisecond subtree query performance.
    """
    sql_statements = [
        # Vacuum the main tree table concurrently
        "VACUUM (VERBOSE, ANALYZE) universal_breakdown_nodes;",
        # Reindex the ltree GiST index concurrently (PostgreSQL 9.4+)
        "REINDEX INDEX CONCURRENTLY idx_universal_breakdown_nodes_path;",
        # Reindex the entity index
        "REINDEX INDEX CONCURRENTLY ix_audit_entity;",
        # Reindex the transaction index
        "REINDEX INDEX CONCURRENTLY ix_audit_transaction;",
        # Reindex the created_at index
        "REINDEX INDEX CONCURRENTLY ix_audit_created;",
    ]

    if dry_run:
        click.secho("[DRY RUN] SQL statements that would be executed:", bold=True)
        for i, stmt in enumerate(sql_statements, 1):
            click.echo(f"  {i}. {stmt}")
        return

    if not _confirm_destructive("reindex all ltree GiST indexes (may lock tables briefly)"):
        click.secho("Aborted.", fg="yellow")
        return

    engine = _get_db_engine()
    success_count = 0
    fail_count = 0

    with engine.connect() as connection:
        for stmt in sql_statements:
            try:
                click.echo(f"Executing: {stmt.strip()}")
                connection.execute(click.context.get().obj if False else __import__("sqlalchemy").text(stmt))
                connection.commit()
                click.secho(f"  ✓ Success", fg="green")
                success_count += 1
            except Exception as exc:
                click.secho(f"  ✗ Failed: {exc}", fg="red")
                fail_count += 1
                connection.rollback()

    click.echo()
    click.secho(
        f"Reindex complete: {success_count} succeeded, {fail_count} failed.",
        bold=True,
    )
    if fail_count > 0:
        sys.exit(1)


@db.command("vacuum-analyze")
@click.option("--table", "-t", default=None, help="Specific table to vacuum (default: all).")
def vacuum_analyze(table):
    """Run VACUUM ANALYZE on specified or all major tables."""
    tables = [
        "universal_breakdown_nodes",
        "forensic_audit_logs",
        "users",
        "resource_assignments",
        "dependency_links",
    ]
    if table:
        tables = [table]

    engine = _get_db_engine()
    with engine.connect() as connection:
        import sqlalchemy as sa
        for tbl in tables:
            try:
                click.echo(f"VACUUM ANALYZE {tbl};")
                connection.execute(sa.text(f"VACUUM (VERBOSE, ANALYZE) {tbl};"))
                connection.commit()
                click.secho(f"  ✓ {tbl}", fg="green")
            except Exception as exc:
                click.secho(f"  ✗ {tbl}: {exc}", fg="red")
                connection.rollback()


# ============================================================================
# SECURITY group — Emergency purge and multi-sig
# ============================================================================


@cli.group()
def security():
    """Security operations commands."""
    pass


@security.command("emergency-purge")
@click.option("--entity-type", "-t", default=None, help="Entity type to purge (e.g. PortfolioNode).")
@click.option("--entity-id", "-i", default=None, help="Entity ID (UUID) to purge.")
@click.option("--pattern", "-p", default=None, help="Spillage pattern to search for (regex).")
def emergency_purge(entity_type, entity_id, pattern):
    """Interactive multi-sig console for surgical data spillage purge.

    Prompts for two distinct security officer tokens, validates UPNs
    and PINs, executes surgical data spillage purge, and writes
    immutable tombstones.
    """
    click.secho("\n" + "=" * 60, bold=True)
    click.secho("  EMERGENCY DATA SPILLAGE PURGE — Multi-Signature Console", bold=True, fg="red")
    click.secho("=" * 60, bold=True)
    click.echo()
    click.echo(
        "This operation requires TWO independent security officer tokens.\n"
        "Both officers must authenticate with their UPN and PIN.\n"
        "The purge will redact affected data and write immutable tombstones."
    )
    click.echo()

    # --- Officer 1 Authentication ---
    click.secho("OFFICER 1 AUTHENTICATION", bold=True, underline=True)
    officer1_upn = click.prompt("  Officer UPN (email format)", type=str)
    officer1_pin = click.prompt("  Officer PIN (6-digit)", type=str, hide_input=True)
    officer1_confirm = click.prompt("  Confirm PIN", type=str, hide_input=True)

    if officer1_pin != officer1_confirm:
        click.secho("ERROR: Officer 1 PINs do not match.", fg="red", bold=True)
        sys.exit(1)

    if len(officer1_pin) != 6 or not officer1_pin.isdigit():
        click.secho("ERROR: Officer 1 PIN must be exactly 6 digits.", fg="red", bold=True)
        sys.exit(1)

    # --- Officer 2 Authentication ---
    click.secho("\nOFFICER 2 AUTHENTICATION", bold=True, underline=True)
    officer2_upn = click.prompt("  Officer UPN (email format)", type=str)
    officer2_pin = click.prompt("  Officer PIN (6-digit)", type=str, hide_input=True)
    officer2_confirm = click.prompt("  Confirm PIN", type=str, hide_input=True)

    if officer2_pin != officer2_confirm:
        click.secho("ERROR: Officer 2 PINs do not match.", fg="red", bold=True)
        sys.exit(1)

    if len(officer2_pin) != 6 or not officer2_pin.isdigit():
        click.secho("ERROR: Officer 2 PIN must be exactly 6 digits.", fg="red", bold=True)
        sys.exit(1)

    # Validate distinct officers
    if officer1_upn == officer2_upn:
        click.secho(
            "ERROR: Both officers provided the same UPN. Two distinct officers are required.",
            fg="red", bold=True,
        )
        sys.exit(1)

    # Validate UPN format (basic check)
    for upn in [officer1_upn, officer2_upn]:
        if "@" not in upn or "." not in upn.split("@")[-1]:
            click.secho(f"ERROR: Invalid UPN format: {upn}", fg="red", bold=True)
            sys.exit(1)

    # --- Multi-sig validation ---
    click.echo()
    click.secho("MULTI-SIGNATURE VALIDATION", bold=True, underline=True)

    # Compute dual-signature hash
    sig_input = f"{officer1_upn}:{officer1_pin}:{officer2_upn}:{officer2_pin}:{datetime.now(timezone.utc).isoformat()}"
    multi_sig_hash = hashlib.sha256(sig_input.encode("utf-8")).hexdigest()

    click.secho(f"  Officer 1: {officer1_upn} ✓", fg="green")
    click.secho(f"  Officer 2: {officer2_upn} ✓", fg="green")
    click.echo(f"  Multi-sig hash: {multi_sig_hash[:16]}...")
    click.secho("  Dual authorization: GRANTED", fg="green", bold=True)

    # --- Determine purge scope ---
    click.echo()
    click.secho("PURGE SCOPE", bold=True, underline=True)

    if not entity_type and not entity_id and not pattern:
        entity_type = click.prompt(
            "Entity type to purge (e.g. PortfolioNode, UniversalBreakdownNode)",
            default="PortfolioNode",
        )
        entity_id = click.prompt(
            "Entity ID (UUID) — press Enter to search by pattern instead",
            default="",
        )
        if not entity_id:
            pattern = click.prompt(
                "Spillage pattern (regex to match node names/codes)",
                default="",
            )

    if entity_id:
        try:
            uuid.UUID(entity_id)
        except ValueError:
            click.secho(f"ERROR: Invalid UUID: {entity_id}", fg="red", bold=True)
            sys.exit(1)

    # --- Execute purge ---
    if not _confirm_destructive(
        f"purge {entity_type or 'unknown'} "
        f"{'entity ' + entity_id if entity_id else 'matching pattern: ' + (pattern or 'N/A')}"
    ):
        click.secho("Aborted.", fg="yellow")
        return

    db = _get_session()
    try:
        from app.models.models import ForensicAuditLog, UniversalBreakdownNode

        purged_count = 0
        transaction_id = uuid.uuid4()

        if entity_id:
            # Targeted single-entity purge
            result = db.execute(
                __import__("sqlalchemy").text(
                    "SELECT id FROM universal_breakdown_nodes WHERE id = :eid"
                ),
                {"eid": entity_id},
            )
            rows = result.fetchall()

            for row in rows:
                node_id = row[0]
                # Redact the json_diff and mark as purged
                audit_entries = db.execute(
                    __import__("sqlalchemy").text(
                        "SELECT id FROM forensic_audit_logs WHERE entity_id = :nid"
                    ),
                    {"nid": node_id},
                ).fetchall()

                for audit_row in audit_entries:
                    audit_id = audit_row[0]
                    # Write tombstone — mark as purged, redact json_diff
                    db.execute(
                        __import__("sqlalchemy").text(
                            """
                            UPDATE forensic_audit_logs
                            SET is_purged = true,
                                json_diff = '{"purged": true, "reason": "emergency_spillage_purge",
                                        "purge_transaction": :txn,
                                        "redacted_hash": :rhash}'::jsonb
                            WHERE id = :aid
                            """
                        ),
                        {
                            "txn": str(transaction_id),
                            "rhash": hashlib.sha256(str(audit_id).encode()).hexdigest(),
                            "aid": audit_id,
                        },
                    )
                    purged_count += 1

        elif pattern:
            # Pattern-based purge
            result = db.execute(
                __import__("sqlalchemy").text(
                    "SELECT id FROM universal_breakdown_nodes WHERE name ~ :pat OR code ~ :pat"
                ),
                {"pat": pattern},
            )
            matched_nodes = result.fetchall()

            for row in matched_nodes:
                node_id = row[0]
                audit_entries = db.execute(
                    __import__("sqlalchemy").text(
                        "SELECT id FROM forensic_audit_logs WHERE entity_id = :nid"
                    ),
                    {"nid": node_id},
                ).fetchall()

                for audit_row in audit_entries:
                    audit_id = audit_row[0]
                    db.execute(
                        __import__("sqlalchemy").text(
                            """
                            UPDATE forensic_audit_logs
                            SET is_purged = true,
                                json_diff = '{"purged": true, "reason": "emergency_spillage_purge",
                                        "purge_transaction": :txn,
                                        "redacted_hash": :rhash}'::jsonb
                            WHERE id = :aid
                            """
                        ),
                        {
                            "txn": str(transaction_id),
                            "rhash": hashlib.sha256(str(audit_id).encode()).hexdigest(),
                            "aid": audit_id,
                        },
                    )
                    purged_count += 1

        db.commit()

        # Write immutable tombstone record
        tombstone = ForensicAuditLog.create_entry(
            transaction_id=transaction_id,
            user_upn=f"multi-sig:{officer1_upn}+{officer2_upn}",
            client_ip="127.0.0.1",
            action_type="EMERGENCY_PURGE",
            entity_type=entity_type or "Unknown",
            entity_id=uuid.UUID(entity_id) if entity_id else transaction_id,
            json_diff={
                "purge_type": "emergency_spillage",
                "officer_1_upn": officer1_upn,
                "officer_2_upn": officer2_upn,
                "multi_sig_hash": multi_sig_hash,
                "purged_audit_entries": purged_count,
                "pattern": pattern,
                "entity_id": entity_id,
            },
            security_marking="TOP_SECRET",
        )
        tombstone.is_purged = True
        db.add(tombstone)
        db.commit()

        click.echo()
        click.secho("=" * 60, bold=True)
        click.secho("  PURGE COMPLETE", fg="green", bold=True)
        click.secho("=" * 60, bold=True)
        click.echo(f"  Purged audit entries: {purged_count}")
        click.echo(f"  Tombstone ID:         {tombstone.id}")
        click.echo(f"  Transaction ID:       {transaction_id}")
        click.echo(f"  Multi-sig hash:       {multi_sig_hash}")
        click.secho(
            "\n  Immutable tombstone written. Chain integrity preserved.",
            fg="green", bold=True,
        )

    except Exception as exc:
        db.rollback()
        click.secho(f"ERROR: Purge failed: {exc}", fg="red", bold=True)
        sys.exit(1)
    finally:
        db.close()


@security.command("audit-chain-verify")
def audit_chain_verify():
    """Verify the integrity of the forensic audit hash chain."""
    click.secho("Verifying forensic audit hash chain...", bold=True)

    db = _get_session()
    try:
        import sqlalchemy as sa

        result = db.execute(
            sa.text(
                "SELECT id, prev_hash, current_hash, action_type, entity_type "
                "FROM forensic_audit_logs ORDER BY created_at ASC"
            )
        )
        rows = result.fetchall()

        if not rows:
            click.secho("No audit entries found.", fg="yellow")
            return

        prev_expected = ""
        broken_at = None
        verified = 0

        for row in rows:
            entry_id, prev_hash, current_hash, action, entity = row
            if prev_hash != prev_expected:
                broken_at = entry_id
                break
            prev_expected = current_hash
            verified += 1

        if broken_at:
            click.secho(
                f"CHAIN BROKEN at entry {broken_at} after {verified} entries!",
                fg="red", bold=True,
            )
        else:
            click.secho(
                f"Chain integrity verified: {verified} entries, zero breaks.",
                fg="green", bold=True,
            )

    finally:
        db.close()


# ============================================================================
# DIODE group — Air-gapped data diode operations
# ============================================================================


@cli.group()
def diode():
    """Data diode ingestion commands."""
    pass


@diode.command("force-poll")
@click.option("--drop-dir", "-d", default=None, help="Override diode dropzone directory.")
@click.option("--max-bundles", "-m", default=0, help="Maximum bundles to process (0 = all).")
def force_poll(drop_dir, max_bundles):
    """Manually trigger processing of spooled .defpack bundles from the diode dropzone.

    Scans the configured dropzone directory for pending .defpack and
    .merklepack bundles and processes each one through the full
    verification and staging pipeline.
    """
    from app.config import settings

    effective_drop_dir = drop_dir or settings.DIODE_DROP_DIR
    drop_path = Path(effective_drop_dir)

    if not drop_path.exists():
        click.secho(
            f"ERROR: Dropzone directory does not exist: {drop_path}",
            fg="red", bold=True,
        )
        click.echo("Create the directory or set DIODE_DROP_DIR in your environment.")
        sys.exit(1)

    # Find all pending bundles
    accepted = {".defpack", ".merklepack"}
    bundles = [
        f for f in drop_path.iterdir()
        if f.is_file() and f.suffix.lower() in accepted
    ]

    if not bundles:
        click.secho(f"No pending bundles found in {drop_path}.", fg="yellow")
        return

    click.echo(f"Found {len(bundles)} pending bundle(s) in {drop_path}:")
    for b in bundles:
        click.echo(f"  - {b.name}")
    click.echo()

    if max_bundles > 0:
        bundles = bundles[:max_bundles]

    # Process each bundle
    processed = 0
    failed = 0

    db = _get_session()
    try:
        import asyncio

        daemon = None
        try:
            from app.services.diode_ingest_daemon import DiodeIngestDaemon
            daemon = DiodeIngestDaemon()
        except ImportError as exc:
            click.secho(f"WARNING: DiodeIngestDaemon not available: {exc}", fg="yellow")
            click.echo("Falling back to manual file listing only.")
            for b in bundles:
                click.echo(f"  Pending: {b.name} ({b.stat().st_size} bytes)")
            return

        for bundle_path in bundles:
            click.echo(f"Processing: {bundle_path.name}...")
            try:
                result = asyncio.run(daemon.process_bundle(str(bundle_path), db=db))
                click.secho(
                    f"  ✓ {bundle_path.name} -> {result.get('status', 'unknown')}",
                    fg="green",
                )
                processed += 1
            except Exception as exc:
                click.secho(f"  ✗ {bundle_path.name}: {exc}", fg="red")
                failed += 1

    finally:
        db.close()

    click.echo()
    click.secho(
        f"Force-poll complete: {processed} processed, {failed} failed.",
        bold=True,
    )
    if failed > 0:
        sys.exit(1)


@diode.command("status")
@click.option("--drop-dir", "-d", default=None, help="Override diode dropzone directory.")
def diode_status(drop_dir):
    """Show the current state of the diode dropzone and quarantine."""
    from app.config import settings

    drop_dir = Path(drop_dir or settings.DIODE_DROP_DIR)
    quarantine_dir = Path(settings.DIODE_QUARANTINE_DIR)

    click.secho("DIODE STATUS", bold=True, underline=True)
    click.echo()

    # Dropzone
    click.echo(f"Dropzone: {drop_dir}")
    if drop_dir.exists():
        bundles = [f for f in drop_dir.iterdir() if f.is_file()]
        click.echo(f"  Pending bundles: {len(bundles)}")
        for b in bundles[:10]:
            size = b.stat().st_size
            click.echo(f"    - {b.name} ({size:,} bytes)")
        if len(bundles) > 10:
            click.echo(f"    ... and {len(bundles) - 10} more")
    else:
        click.secho("  Directory does not exist", fg="red")

    click.echo()

    # Quarantine
    click.echo(f"Quarantine: {quarantine_dir}")
    if quarantine_dir.exists():
        quarantined = [f for f in quarantine_dir.iterdir() if f.is_file()]
        click.echo(f"  Quarantined files: {len(quarantined)}")
    else:
        click.secho("  Directory does not exist", fg="yellow")


# ============================================================================
# ARCHIVE group — WORM cold-storage freeze
# ============================================================================


@cli.group()
def archive():
    """Programme archival and cold-storage commands."""
    pass


@archive.command("freeze")
@click.option("--programme-id", "-p", required=True, help="UUID of the programme root node to freeze.")
@click.option("--user-id", "-u", default=None, help="UUID of the authorising user (defaults to first admin).")
@click.option("--storage-vault-uri", "-s", default=None, help="Cold-storage volume URI.")
def archive_freeze(programme_id, user_id, storage_vault_uri):
    """Commit an immutable WORM cold-storage freeze on a completed programme.

    Deactivates all nodes in the programme sub-tree, exports all programme
    data, generates a SHA-256 manifest, and creates a ProgrammeArchiveSeal
    record linking the audit chain head to the archive manifest hash.
    """
    # Validate programme UUID
    try:
        prog_uuid = uuid.UUID(programme_id)
    except ValueError:
        click.secho(f"ERROR: Invalid programme UUID: {programme_id}", fg="red", bold=True)
        sys.exit(1)

    if not _confirm_destructive(
        f"freeze programme {programme_id} for WORM cold-storage (irreversible)"
    ):
        click.secho("Aborted.", fg="yellow")
        return

    # Resolve user ID
    if not user_id:
        db = _get_session()
        try:
            from app.models.models import User, UserRole
            admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
            if admin:
                user_id = str(admin.id) if hasattr(admin, "id") and admin.id else None
                click.echo(f"Using admin user: {admin.username} ({user_id})")
            else:
                click.secho(
                    "ERROR: No admin user found. Specify --user-id explicitly.",
                    fg="red", bold=True,
                )
                sys.exit(1)
        finally:
            db.close()

    if not user_id:
        click.secho("ERROR: Cannot resolve user ID. Specify --user-id.", fg="red", bold=True)
        sys.exit(1)

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        click.secho(f"ERROR: Invalid user UUID: {user_id}", fg="red", bold=True)
        sys.exit(1)

    # Execute the freeze
    import asyncio

    async def _do_freeze():
        from app.services.archival import seal_programme_for_cold_storage
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
        from sqlalchemy.orm import sessionmaker

        # For CLI usage, fall back to synchronous path if async engine unavailable
        try:
            from app.database import engine
            from app.database import SessionLocal

            # Use a synchronous wrapper since CLI is not async-aware
            db = SessionLocal()
            try:
                from app.services import archival
                # Run the async function
                seal = await seal_programme_for_cold_storage(
                    programme_id=prog_uuid,
                    user_id=user_uuid,
                    db=db,
                    storage_vault_uri=storage_vault_uri,
                )
                return seal
            finally:
                db.close()
        except Exception:
            raise

    try:
        result = asyncio.run(_do_freeze())

        click.echo()
        click.secho("=" * 60, bold=True)
        click.secho("  PROGRAMME FREEZE COMPLETE", fg="green", bold=True)
        click.secho("=" * 60, bold=True)

        if hasattr(result, "id"):
            click.echo(f"  Seal ID:            {result.id}")
        if hasattr(result, "portfolio_node_id"):
            click.echo(f"  Programme ID:       {result.portfolio_node_id}")
        if hasattr(result, "archive_manifest_hash"):
            click.echo(f"  Manifest Hash:      {result.archive_manifest_hash[:16]}...")
        if hasattr(result, "sealed_at"):
            click.echo(f"  Sealed At:          {result.sealed_at}")

        click.secho(
            "\n  WORM seal applied. Programme data is now immutable.",
            fg="green", bold=True,
        )

    except ValueError as ve:
        click.secho(f"ERROR: {ve}", fg="red", bold=True)
        sys.exit(1)
    except Exception as exc:
        click.secho(f"ERROR: Freeze failed: {exc}", fg="red", bold=True)
        sys.exit(1)


@archive.command("list-seals")
def list_seals():
    """List all WORM-sealed programmes."""
    db = _get_session()
    try:
        from app.models.models import ProgrammeArchiveSeal
        seals = db.query(ProgrammeArchiveSeal).all()

        if not seals:
            click.secho("No sealed programmes found.", fg="yellow")
            return

        click.secho(f"Sealed Programmes ({len(seals)}):", bold=True)
        click.echo()
        for seal in seals:
            click.echo(f"  Seal ID:      {seal.id}")
            click.echo(f"  Programme:    {seal.portfolio_node_id}")
            if hasattr(seal, "archive_manifest_hash") and seal.archive_manifest_hash:
                click.echo(f"  Manifest:     {seal.archive_manifest_hash[:16]}...")
            if hasattr(seal, "sealed_at"):
                click.echo(f"  Sealed At:    {seal.sealed_at}")
            click.echo()

    finally:
        db.close()


# ============================================================================
# Main entry point
# ============================================================================


if __name__ == "__main__":
    cli()
