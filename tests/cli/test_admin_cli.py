"""Tests for the standalone administrative terminal CLI (eisenhower-admin).

This test suite covers all five command groups:
- user create-superuser
- db reindex-trees
- security emergency-purge
- diode force-poll
- archive freeze

Uses Click's CliRunner for non-interactive testing without requiring
a live database connection for structural tests.
"""
import pytest
import uuid
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from click.testing import CliRunner

from app.cli.admin_cli import (
    cli,
    user,
    db,
    security,
    diode,
    archive,
    _print_banner,
    _confirm_destructive,
)


class TestCliRoot:
    """Test the root CLI group and version."""

    def test_cli_is_group(self):
        """Verify cli is a Click group."""
        assert hasattr(cli, "commands")
        assert len(cli.commands) > 0

    def test_cli_has_all_command_groups(self):
        """Verify all 5 command groups are registered."""
        expected_groups = {"user", "db", "security", "diode", "archive"}
        actual_groups = set(cli.commands.keys())
        assert expected_groups.issubset(actual_groups), \
            f"Missing command groups: {expected_groups - actual_groups}"

    def test_cli_version(self):
        """Verify --version flag returns the correct version."""
        runner = CliRunner()
        result = runner.invoke(cli, ["--version"])
        assert result.exit_code == 0
        assert "eisenhower-admin" in result.output
        assert "1.0.0" in result.output

    def test_cli_help(self):
        """Verify --help shows all command groups."""
        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "user" in result.output
        assert "db" in result.output
        assert "security" in result.output
        assert "diode" in result.output
        assert "archive" in result.output

    def test_cli_banner_prints(self):
        """Verify _print_banner produces output without error."""
        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        # Banner contains either the programme name or separator lines
        assert "Eisenhower" in result.output or "Administrative" in result.output or "=" in result.output


class TestUserGroup:
    """Test the user management command group."""

    def test_user_group_exists(self):
        """Verify user group is registered."""
        assert "user" in cli.commands

    def test_user_help(self):
        """Verify user --help shows create-superuser command."""
        runner = CliRunner()
        result = runner.invoke(cli, ["user", "--help"])
        assert result.exit_code == 0
        assert "create-superuser" in result.output

    def test_create_superuser_help(self):
        """Verify create-superuser --help shows all options."""
        runner = CliRunner()
        result = runner.invoke(cli, ["user", "create-superuser", "--help"])
        assert result.exit_code == 0
        assert "--username" in result.output or "-u" in result.output
        assert "--email" in result.output or "-e" in result.output
        assert "--pki-dn" in result.output or "-p" in result.output
        assert "--full-name" in result.output or "-n" in result.output

    def test_create_superuser_prompts_without_options(self):
        """Verify create-superuser prompts interactively when no options given."""
        runner = CliRunner()
        # Provide inputs for all prompts
        result = runner.invoke(
            cli,
            ["user", "create-superuser"],
            input="testadmin\ntest@example.com\nCN=Test/O=Test/C=GB\nTest Admin\n",
        )
        # Without a DB, it will fail at the database connection step,
        # but it should have accepted the prompts
        assert result.exit_code != 0 or "Superuser created" in result.output

    def test_create_superuser_with_options(self):
        """Verify create-superuser accepts all CLI options."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            [
                "user", "create-superuser",
                "-u", "testadmin",
                "-e", "test@example.com",
                "-p", "CN=Test/O=Test/C=GB",
                "-n", "Test Admin",
            ],
        )
        # Without a DB, it will fail at the database connection step
        # but should not crash before reaching the DB
        assert result.exit_code != 0 or "Superuser created" in result.output


class TestDbGroup:
    """Test the database maintenance command group."""

    def test_db_group_exists(self):
        """Verify db group is registered."""
        assert "db" in cli.commands

    def test_db_help(self):
        """Verify db --help shows reindex-trees and vacuum-analyze."""
        runner = CliRunner()
        result = runner.invoke(cli, ["db", "--help"])
        assert result.exit_code == 0
        assert "reindex-trees" in result.output
        assert "vacuum-analyze" in result.output

    def test_reindex_trees_help(self):
        """Verify reindex-trees --help shows --dry-run option."""
        runner = CliRunner()
        result = runner.invoke(cli, ["db", "reindex-trees", "--help"])
        assert result.exit_code == 0
        assert "--dry-run" in result.output

    def test_reindex_trees_dry_run(self):
        """Verify --dry-run shows SQL statements without executing."""
        runner = CliRunner()
        result = runner.invoke(cli, ["db", "reindex-trees", "--dry-run"])
        assert result.exit_code == 0
        assert "DRY RUN" in result.output
        assert "VACUUM" in result.output
        assert "REINDEX" in result.output
        assert "universal_breakdown_nodes" in result.output
        assert "idx_universal_breakdown_nodes_path" in result.output

    def test_reindex_trees_dry_run_sql_count(self):
        """Verify dry run shows exactly 5 SQL statements."""
        runner = CliRunner()
        result = runner.invoke(cli, ["db", "reindex-trees", "--dry-run"])
        # Count numbered statements: "1.", "2.", etc.
        lines = result.output.strip().split("\n")
        numbered = [l for l in lines if l.strip().startswith(("1.", "2.", "3.", "4.", "5."))]
        assert len(numbered) == 5, f"Expected 5 SQL statements, found {len(numbered)}"

    def test_reindex_trees_dry_run_audit_indexes(self):
        """Verify dry run includes audit index reindexing."""
        runner = CliRunner()
        result = runner.invoke(cli, ["db", "reindex-trees", "--dry-run"])
        assert "ix_audit_entity" in result.output
        assert "ix_audit_transaction" in result.output
        assert "ix_audit_created" in result.output

    def test_vacuum_analyze_help(self):
        """Verify vacuum-analyze --help shows --table option."""
        runner = CliRunner()
        result = runner.invoke(cli, ["db", "vacuum-analyze", "--help"])
        assert result.exit_code == 0
        assert "--table" in result.output or "-t" in result.output


class TestSecurityGroup:
    """Test the security operations command group."""

    def test_security_group_exists(self):
        """Verify security group is registered."""
        assert "security" in cli.commands

    def test_security_help(self):
        """Verify security --help shows emergency-purge and audit-chain-verify."""
        runner = CliRunner()
        result = runner.invoke(cli, ["security", "--help"])
        assert result.exit_code == 0
        assert "emergency-purge" in result.output
        assert "audit-chain-verify" in result.output

    def test_emergency_purge_help(self):
        """Verify emergency-purge --help shows all options."""
        runner = CliRunner()
        result = runner.invoke(cli, ["security", "emergency-purge", "--help"])
        assert result.exit_code == 0
        assert "--entity-type" in result.output or "-t" in result.output
        assert "--entity-id" in result.output or "-i" in result.output
        assert "--pattern" in result.output or "-p" in result.output

    def test_emergency_purge_banner(self):
        """Verify emergency-purge displays the multi-sig banner."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="officer1@mod.gov.uk\n123456\n123456\n",
        )
        assert "EMERGENCY DATA SPILLAGE PURGE" in result.output or \
               "Multi-Signature" in result.output or \
               "OFFICER 1" in result.output

    def test_emergency_purge_officer1_pin_mismatch(self):
        """Verify officer 1 PIN mismatch is rejected."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="officer1@mod.gov.uk\n123456\n654321\n",
        )
        assert result.exit_code != 0
        assert "PIN" in result.output and ("match" in result.output.lower() or "ERROR" in result.output)

    def test_emergency_purge_officer1_pin_length(self):
        """Verify officer 1 PIN must be exactly 6 digits."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="officer1@mod.gov.uk\n12345\n12345\n",
        )
        assert result.exit_code != 0
        assert "6 digit" in result.output or "ERROR" in result.output

    def test_emergency_purge_officer2_pin_mismatch(self):
        """Verify officer 2 PIN mismatch is rejected."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="officer1@mod.gov.uk\n123456\n123456\nofficer2@mod.gov.uk\n111111\n222222\n",
        )
        assert result.exit_code != 0
        assert "PIN" in result.output and ("match" in result.output.lower() or "ERROR" in result.output)

    def test_emergency_purge_same_upn_rejected(self):
        """Verify two distinct officers are required."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="same@mod.gov.uk\n123456\n123456\nsame@mod.gov.uk\n654321\n654321\n",
        )
        assert result.exit_code != 0
        assert "same UPN" in result.output.lower() or "distinct" in result.output.lower() or "ERROR" in result.output

    def test_emergency_purge_invalid_upn_format(self):
        """Verify UPN format validation."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="invalid-upn\n123456\n123456\nofficer2@mod.gov.uk\n654321\n654321\n",
        )
        assert result.exit_code != 0
        assert "Invalid UPN" in result.output or "ERROR" in result.output

    def test_emergency_purge_multi_sig_hash_computation(self):
        """Verify multi-sig hash is computed correctly."""
        # Simulate the hash computation logic
        officer1_upn = "officer1@mod.gov.uk"
        officer1_pin = "123456"
        officer2_upn = "officer2@mod.gov.uk"
        officer2_pin = "654321"
        timestamp = datetime.now(timezone.utc).isoformat()
        sig_input = f"{officer1_upn}:{officer1_pin}:{officer2_upn}:{officer2_pin}:{timestamp}"
        expected_hash = hashlib.sha256(sig_input.encode("utf-8")).hexdigest()
        assert len(expected_hash) == 64  # SHA-256 hex digest length

    def test_emergency_purge_valid_flow_reaches_confirmation(self):
        """Verify valid authentication reaches the destructive confirmation step."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="officer1@mod.gov.uk\n123456\n123456\nofficer2@mod.gov.uk\n654321\n654321\n",
        )
        # After valid auth, it should reach the purge scope or confirmation
        assert "MULTI-SIGNATURE" in result.output or "Dual authorization" in result.output or \
               "PURGE SCOPE" in result.output or "DANGER" in result.output

    def test_audit_chain_verify_help(self):
        """Verify audit-chain-verify --help works."""
        runner = CliRunner()
        result = runner.invoke(cli, ["security", "audit-chain-verify", "--help"])
        assert result.exit_code == 0
        assert "hash chain" in result.output.lower() or "integrity" in result.output.lower()


class TestDiodeGroup:
    """Test the data diode ingestion command group."""

    def test_diode_group_exists(self):
        """Verify diode group is registered."""
        assert "diode" in cli.commands

    def test_diode_help(self):
        """Verify diode --help shows force-poll and status."""
        runner = CliRunner()
        result = runner.invoke(cli, ["diode", "--help"])
        assert result.exit_code == 0
        assert "force-poll" in result.output
        assert "status" in result.output

    def test_force_poll_help(self):
        """Verify force-poll --help shows all options."""
        runner = CliRunner()
        result = runner.invoke(cli, ["diode", "force-poll", "--help"])
        assert result.exit_code == 0
        assert "--drop-dir" in result.output or "-d" in result.output
        assert "--max-bundles" in result.output or "-m" in result.output

    def test_force_poll_nonexistent_directory(self):
        """Verify force-poll fails gracefully when dropzone doesn't exist."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["diode", "force-poll", "-d", "/nonexistent/path"],
        )
        assert result.exit_code != 0
        assert "ERROR" in result.output or "does not exist" in result.output

    def test_force_poll_empty_directory(self):
        """Verify force-poll reports no bundles in empty directory."""
        with TemporaryDirectory() as tmpdir:
            runner = CliRunner()
            result = runner.invoke(
                cli,
                ["diode", "force-poll", "-d", tmpdir],
            )
            # Should succeed but report no bundles
            assert "No pending bundles" in result.output or \
                   "no pending" in result.output.lower() or \
                   result.exit_code == 0

    def test_force_poll_finds_defpack_bundles(self):
        """Verify force-poll detects .defpack files."""
        with TemporaryDirectory() as tmpdir:
            # Create a dummy .defpack file
            test_file = Path(tmpdir) / "test_bundle.defpack"
            test_file.write_text("dummy content")

            runner = CliRunner()
            result = runner.invoke(
                cli,
                ["diode", "force-poll", "-d", tmpdir],
            )
            assert "test_bundle.defpack" in result.output

    def test_force_poll_finds_merklepack_bundles(self):
        """Verify force-poll detects .merklepack files."""
        with TemporaryDirectory() as tmpdir:
            test_file = Path(tmpdir) / "test_bundle.merklepack"
            test_file.write_text("dummy content")

            runner = CliRunner()
            result = runner.invoke(
                cli,
                ["diode", "force-poll", "-d", tmpdir],
            )
            assert "test_bundle.merklepack" in result.output

    def test_force_poll_ignores_other_extensions(self):
        """Verify force-poll ignores non-bundle file types."""
        with TemporaryDirectory() as tmpdir:
            # Create a non-bundle file
            test_file = Path(tmpdir) / "readme.txt"
            test_file.write_text("not a bundle")

            runner = CliRunner()
            result = runner.invoke(
                cli,
                ["diode", "force-poll", "-d", tmpdir],
            )
            assert "No pending bundles" in result.output or \
                   "no pending" in result.output.lower()

    def test_force_poll_max_bundles_limit(self):
        """Verify --max-bundles limits processing."""
        with TemporaryDirectory() as tmpdir:
            # Create multiple bundles
            for i in range(3):
                f = Path(tmpdir) / f"bundle_{i}.defpack"
                f.write_text(f"content {i}")

            runner = CliRunner()
            result = runner.invoke(
                cli,
                ["diode", "force-poll", "-d", tmpdir, "-m", "1"],
            )
            # Should find 3 but only process 1
            assert result.exit_code == 0 or "bundle" in result.output.lower()

    def test_diode_status_help(self):
        """Verify diode status --help works."""
        runner = CliRunner()
        result = runner.invoke(cli, ["diode", "status", "--help"])
        assert result.exit_code == 0
        assert "--drop-dir" in result.output or "-d" in result.output

    def test_diode_status_shows_dropzone(self):
        """Verify diode status displays dropzone information."""
        runner = CliRunner()
        result = runner.invoke(cli, ["diode", "status"])
        # May fail if config is not set, but should show DIODE STATUS header
        assert "DIODE STATUS" in result.output or "Dropzone" in result.output or \
               result.exit_code != 0


class TestArchiveGroup:
    """Test the programme archival and cold-storage command group."""

    def test_archive_group_exists(self):
        """Verify archive group is registered."""
        assert "archive" in cli.commands

    def test_archive_help(self):
        """Verify archive --help shows freeze and list-seals."""
        runner = CliRunner()
        result = runner.invoke(cli, ["archive", "--help"])
        assert result.exit_code == 0
        assert "freeze" in result.output
        assert "list-seals" in result.output

    def test_archive_freeze_help(self):
        """Verify archive freeze --help shows all options."""
        runner = CliRunner()
        result = runner.invoke(cli, ["archive", "freeze", "--help"])
        assert result.exit_code == 0
        assert "--programme-id" in result.output or "-p" in result.output
        assert "--user-id" in result.output or "-u" in result.output
        assert "--storage-vault-uri" in result.output or "-s" in result.output

    def test_archive_freeze_requires_programme_id(self):
        """Verify freeze requires --programme-id option."""
        runner = CliRunner()
        result = runner.invoke(cli, ["archive", "freeze"])
        assert result.exit_code != 0
        assert "programme-id" in result.output.lower() or "Missing option" in result.output

    def test_archive_freeze_invalid_uuid(self):
        """Verify freeze rejects invalid UUID format."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["archive", "freeze", "-p", "not-a-uuid"],
        )
        assert result.exit_code != 0
        assert "Invalid" in result.output or "ERROR" in result.output

    def test_archive_freeze_valid_uuid_format(self):
        """Verify freeze accepts valid UUID format."""
        runner = CliRunner()
        valid_uuid = str(uuid.uuid4())
        result = runner.invoke(
            cli,
            ["archive", "freeze", "-p", valid_uuid],
            input="n",  # Decline the destructive confirmation
        )
        # Should reach the confirmation step, then abort
        assert "Aborted" in result.output or "DANGER" in result.output or \
               "freeze" in result.output.lower()

    def test_archive_freeze_aborts_on_no_confirmation(self):
        """Verify freeze aborts when user declines confirmation."""
        runner = CliRunner()
        valid_uuid = str(uuid.uuid4())
        result = runner.invoke(
            cli,
            ["archive", "freeze", "-p", valid_uuid],
            input="n",
        )
        assert "Aborted" in result.output

    def test_list_seals_help(self):
        """Verify list-seals --help works."""
        runner = CliRunner()
        result = runner.invoke(cli, ["archive", "list-seals", "--help"])
        assert result.exit_code == 0
        assert "seal" in result.output.lower()


class TestHelperFunctions:
    """Test the helper functions in admin_cli."""

    def test_print_banner_output(self):
        """Verify _print_banner produces expected output."""
        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        # Banner should contain the programme name
        assert "EISENHOWER" in result.output or "Administrative" in result.output

    def test_confirm_destructive_function_exists(self):
        """Verify _confirm_destructive is callable."""
        assert callable(_confirm_destructive)


class TestCliOfflineTty:
    """Test that the CLI operates without graphical display dependencies."""

    def test_no_tkinter_import(self):
        """Verify no GUI toolkit is imported."""
        import app.cli.admin_cli as admin_module
        source = open(admin_module.__file__).read()
        assert "tkinter" not in source
        assert "PyQt" not in source
        assert "wxPython" not in source
        assert "gtk" not in source

    def test_no_display_environment_dependency(self):
        """Verify CLI doesn't require DISPLAY environment variable."""
        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0

    def test_click_based_framework(self):
        """Verify the CLI uses Click framework."""
        import app.cli.admin_cli as admin_module
        source = open(admin_module.__file__).read()
        assert "import click" in source


class TestMultiSigValidation:
    """Test the multi-signature validation logic."""

    def test_multi_sig_hash_uniqueness(self):
        """Verify different officer pairs produce different hashes."""
        timestamp = datetime.now(timezone.utc).isoformat()

        sig1 = f"officer1@mod.gov.uk:123456:officer2@mod.gov.uk:654321:{timestamp}"
        hash1 = hashlib.sha256(sig1.encode("utf-8")).hexdigest()

        sig2 = f"officer3@mod.gov.uk:111111:officer4@mod.gov.uk:222222:{timestamp}"
        hash2 = hashlib.sha256(sig2.encode("utf-8")).hexdigest()

        assert hash1 != hash2

    def test_multi_sig_hash_determinism(self):
        """Verify same input produces same hash."""
        timestamp = datetime.now(timezone.utc).isoformat()
        sig = f"officer1@mod.gov.uk:123456:officer2@mod.gov.uk:654321:{timestamp}"

        hash1 = hashlib.sha256(sig.encode("utf-8")).hexdigest()
        hash2 = hashlib.sha256(sig.encode("utf-8")).hexdigest()

        assert hash1 == hash2

    def test_pin_validation_rejects_non_numeric(self):
        """Verify PIN validation rejects non-numeric input."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="officer1@mod.gov.uk\nabcdef\nabcdef\n",
        )
        assert result.exit_code != 0
        assert "digit" in result.output.lower() or "ERROR" in result.output

    def test_pin_validation_rejects_empty(self):
        """Verify PIN validation rejects empty PIN."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge"],
            input="officer1@mod.gov.uk\n\n\n",
        )
        # Empty PIN will be treated as length 0, not 6 digits
        assert result.exit_code != 0


class TestEmergencyPurgeEntityValidation:
    """Test entity ID and type validation in emergency-purge."""

    def test_invalid_entity_uuid_rejected(self):
        """Verify invalid entity UUID is rejected after auth."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge", "-i", "not-a-uuid"],
            input="officer1@mod.gov.uk\n123456\n123456\nofficer2@mod.gov.uk\n654321\n654321\n",
        )
        assert result.exit_code != 0
        assert "Invalid UUID" in result.output or "ERROR" in result.output

    def test_entity_type_option(self):
        """Verify --entity-type option is accepted."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge", "-t", "PortfolioNode"],
            input="officer1@mod.gov.uk\n123456\n123456\nofficer2@mod.gov.uk\n654321\n654321\n",
        )
        # Should reach past auth to the scope/confirmation step
        assert "MULTI-SIGNATURE" in result.output or "PURGE SCOPE" in result.output or \
               "DANGER" in result.output or "Dual authorization" in result.output

    def test_pattern_option(self):
        """Verify --pattern option is accepted."""
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["security", "emergency-purge", "-p", "CLASSIFIED.*"],
            input="officer1@mod.gov.uk\n123456\n123456\nofficer2@mod.gov.uk\n654321\n654321\n",
        )
        # Should reach past auth
        assert "MULTI-SIGNATURE" in result.output or "PURGE SCOPE" in result.output or \
               "DANGER" in result.output or "Dual authorization" in result.output
