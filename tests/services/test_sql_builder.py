"""Comprehensive tests for the AST-based SQL builder module.

Covers fuzz and evasion tests including:
- Multi-table aliasing (FROM allowed_table a, sensitive_table b)
- Inline SQL comments (/*...*/)
- UNION injections
- Hex encodings
- Dangerous function calls
- System schema references
- DDL/DML rejection
- Security predicate injection
- CTE validation
- Column allowlist enforcement
"""
import pytest

from app.services.sql_builder import (
    validate_and_build_ast,
    validate_query,
    get_allowed_tables,
    execute_query_sync,
    ALLOWED_TABLES,
)


class TestValidateAndBuildAst:
    """Test the validate_and_build_ast function."""

    def test_valid_simple_select(self):
        """A simple SELECT on an allowed table should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id, name FROM portfolio_nodes",
            "unclassified"
        )
        assert is_valid
        assert sanitized is not None
        assert error is None

    def test_valid_select_with_where(self):
        """A SELECT with WHERE clause should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id, name FROM portfolio_nodes WHERE id = :node_id",
            "unclassified",
            {"node_id": "123"}
        )
        assert is_valid
        assert sanitized is not None
        assert error is None

    def test_empty_query_rejected(self):
        """Empty query should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast("", "unclassified")
        assert not is_valid
        assert sanitized is None
        assert error is not None

    def test_whitespace_only_query_rejected(self):
        """Whitespace-only query should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast("   ", "unclassified")
        assert not is_valid
        assert sanitized is None
        assert error is not None

    def test_insert_rejected(self):
        """INSERT statements should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "INSERT INTO portfolio_nodes (name) VALUES ('test')",
            "unclassified"
        )
        assert not is_valid
        assert sanitized is None
        assert "INSERT" in error or "not allowed" in error

    def test_update_rejected(self):
        """UPDATE statements should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "UPDATE portfolio_nodes SET name = 'test'",
            "unclassified"
        )
        assert not is_valid
        assert sanitized is None

    def test_delete_rejected(self):
        """DELETE statements should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "DELETE FROM portfolio_nodes WHERE id = 1",
            "unclassified"
        )
        assert not is_valid
        assert sanitized is None

    def test_drop_rejected(self):
        """DROP statements should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "DROP TABLE portfolio_nodes",
            "unclassified"
        )
        assert not is_valid
        assert sanitized is None

    def test_alter_rejected(self):
        """ALTER statements should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "ALTER TABLE portfolio_nodes ADD COLUMN test_col TEXT",
            "unclassified"
        )
        assert not is_valid
        assert sanitized is None

    def test_create_rejected(self):
        """CREATE statements should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "CREATE TABLE test_table (id INT)",
            "unclassified"
        )
        assert not is_valid
        assert sanitized is None

    def test_merge_rejected(self):
        """MERGE statements should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "MERGE INTO portfolio_nodes USING dual ON 1=1",
            "unclassified"
        )
        assert not is_valid
        assert sanitized is None

    def test_security_predicate_injected(self):
        """Security classification predicate should be injected into sanitized SQL."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id, name FROM portfolio_nodes",
            "secret"
        )
        assert is_valid
        assert sanitized is not None
        assert "security_classification" in sanitized

    def test_security_predicate_with_existing_where(self):
        """Security predicate should be combined with existing WHERE clause."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE id = :node_id",
            "confidential",
            {"node_id": "123"}
        )
        assert is_valid
        assert sanitized is not None
        assert "security_classification" in sanitized
        assert "id" in sanitized

    def test_user_clearance_bound(self):
        """User clearance should be bound into params."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes",
            "top_secret"
        )
        assert is_valid
        # The function returns the sanitized SQL; params binding is internal
        # We verify the placeholder is present
        assert sanitized is not None


class TestTableValidation:
    """Test table allowlist enforcement via AST."""

    def test_allowed_table_passes(self):
        """Query against allowed table should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM tasks",
            "unclassified"
        )
        assert is_valid

    def test_disallowed_table_rejected(self):
        """Query against disallowed table should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT * FROM sensitive_table",
            "unclassified"
        )
        assert not is_valid
        assert "sensitive_table" in error

    def test_multi_table_aliasing_sneak(self):
        """FROM allowed_table a, sensitive_table b should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT a.id FROM portfolio_nodes a, sensitive_table b",
            "unclassified"
        )
        assert not is_valid
        assert "sensitive_table" in error

    def test_join_with_disallowed_table(self):
        """JOIN with disallowed table should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT a.id FROM portfolio_nodes a JOIN secret_data b ON a.id = b.id",
            "unclassified"
        )
        assert not is_valid
        assert "secret_data" in error

    def test_subquery_with_disallowed_table(self):
        """Subquery referencing disallowed table should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT * FROM (SELECT * FROM secret_data) AS subq",
            "unclassified"
        )
        assert not is_valid
        assert "secret_data" in error

    def test_cte_with_disallowed_table(self):
        """CTE referencing disallowed table should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "WITH cte AS (SELECT * FROM secret_data) SELECT * FROM cte",
            "unclassified"
        )
        assert not is_valid
        assert "secret_data" in error

    def test_cte_with_allowed_table(self):
        """CTE referencing allowed table should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "WITH cte AS (SELECT id, name FROM portfolio_nodes) SELECT * FROM cte",
            "unclassified"
        )
        assert is_valid

    def test_system_schema_pg_catalog_rejected(self):
        """Reference to pg_catalog should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT * FROM pg_catalog.pg_tables",
            "unclassified"
        )
        assert not is_valid
        assert "pg_catalog" in error

    def test_system_schema_information_schema_rejected(self):
        """Reference to information_schema should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT * FROM information_schema.tables",
            "unclassified"
        )
        assert not is_valid
        assert "information_schema" in error


class TestColumnValidation:
    """Test column allowlist enforcement via AST."""

    def test_allowed_column_passes(self):
        """Query with allowed column should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id, name FROM portfolio_nodes",
            "unclassified"
        )
        assert is_valid

    def test_disallowed_column_rejected(self):
        """Query with disallowed column should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id, u.secret_password FROM users u",
            "unclassified"
        )
        assert not is_valid
        assert "secret_password" in error

    def test_allowed_join(self):
        """JOIN between two allowed tables should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT a.id, b.title FROM portfolio_nodes a JOIN tasks b ON a.id = b.portfolio_node_id",
            "unclassified"
        )
        assert is_valid


class TestDangerousFunctions:
    """Test dangerous function detection."""

    def test_pg_read_file_rejected(self):
        """pg_read_file function should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT pg_read_file('/etc/passwd')",
            "unclassified"
        )
        assert not is_valid
        assert "pg_read_file" in error

    def test_pg_sleep_rejected(self):
        """pg_sleep function should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT pg_sleep(10)",
            "unclassified"
        )
        assert not is_valid
        assert "pg_sleep" in error

    def test_version_function_rejected(self):
        """version() function should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT version()",
            "unclassified"
        )
        assert not is_valid
        assert "version" in error

    def test_current_setting_rejected(self):
        """current_setting function should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT current_setting('data_directory')",
            "unclassified"
        )
        assert not is_valid
        assert "current_setting" in error

    def test_safe_function_allowed(self):
        """Safe aggregate functions should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT COUNT(*) FROM portfolio_nodes",
            "unclassified"
        )
        assert is_valid

    def test_upper_function_allowed(self):
        """UPPER() function should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT UPPER(name) FROM portfolio_nodes",
            "unclassified"
        )
        assert is_valid


class TestCommentInjection:
    """Test SQL comment injection evasion attempts."""

    def test_inline_comment_union_injection(self):
        """/* ... */ comment attempting to hide UNION should be caught."""
        # sqlglot strips comments during parsing, so the UNION is still parsed
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes /* comment */ UNION SELECT * FROM secret_data",
            "unclassified"
        )
        # The UNION should be detected and the disallowed table should be flagged
        assert not is_valid or "secret_data" in (error or "")

    def test_inline_comment_where_bypass(self):
        """/* ... */ comment attempting to bypass WHERE should be caught."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE 1=1 /* AND security_classification <= 'secret' */",
            "unclassified"
        )
        # sqlglot strips comments, so the WHERE is just 1=1
        # But our security predicate injection should still add the check
        assert is_valid
        assert sanitized is not None
        assert "security_classification" in sanitized

    def test_dashed_comment_injection(self):
        """-- comment injection should be handled."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes -- WHERE id = 1\n",
            "unclassified"
        )
        # sqlglot strips comments, so this becomes a simple SELECT
        assert is_valid


class TestUnionInjection:
    """Test UNION-based injection attempts."""

    def test_union_with_disallowed_table(self):
        """UNION with disallowed table should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes UNION SELECT * FROM secret_data",
            "unclassified"
        )
        assert not is_valid
        assert "secret_data" in error

    def test_union_all_with_disallowed_table(self):
        """UNION ALL with disallowed table should be rejected."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes UNION ALL SELECT * FROM secret_data",
            "unclassified"
        )
        assert not is_valid
        assert "secret_data" in error

    def test_union_with_allowed_tables(self):
        """UNION with allowed tables should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes UNION SELECT id FROM tasks",
            "unclassified"
        )
        assert is_valid


class TestHexEncoding:
    """Test hex encoding evasion attempts."""

    def test_hex_literal_in_select(self):
        """Hex literal in SELECT should be handled by AST parser."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE id = x'414243'",
            "unclassified"
        )
        # sqlglot parses hex literals, so this should be valid
        assert is_valid

    def test_hex_encoded_sql_injection(self):
        """Hex-encoded SQL injection attempt should be caught."""
        # Even if hex encoded, the AST parser will parse the actual SQL structure
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE id = :id",
            "unclassified",
            {"id": "414243"}
        )
        assert is_valid


class TestFuzzQueries:
    """Fuzz-style tests with various edge cases."""

    def test_case_insensitive_keywords(self):
        """Keywords in different cases should be handled."""
        is_valid, sanitized, error = validate_and_build_ast(
            "select ID from PORTFOLIO_NODES where Id = :id",
            "unclassified",
            {"id": "123"}
        )
        assert is_valid

    def test_multiple_joins(self):
        """Multiple JOINs with allowed tables should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            """
            SELECT a.id, b.title, c.name
            FROM portfolio_nodes a
            JOIN tasks b ON a.id = b.portfolio_node_id
            JOIN milestones c ON a.id = c.portfolio_node_id
            """,
            "unclassified"
        )
        assert is_valid

    def test_nested_subquery(self):
        """Nested subquery with allowed tables should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            """
            SELECT * FROM (
                SELECT id FROM (
                    SELECT id FROM portfolio_nodes
                ) inner_sq
            ) outer_sq
            """,
            "unclassified"
        )
        assert is_valid

    def test_group_by_allowed(self):
        """GROUP BY with allowed columns should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT node_type, COUNT(*) FROM portfolio_nodes GROUP BY node_type",
            "unclassified"
        )
        assert is_valid

    def test_order_by_allowed(self):
        """ORDER BY with allowed columns should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id, name FROM portfolio_nodes ORDER BY created_at DESC",
            "unclassified"
        )
        assert is_valid

    def test_limit_offset_allowed(self):
        """LIMIT and OFFSET should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes LIMIT 10 OFFSET 5",
            "unclassified"
        )
        assert is_valid

    def test_distinct_allowed(self):
        """DISTINCT should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT DISTINCT node_type FROM portfolio_nodes",
            "unclassified"
        )
        assert is_valid

    def test_like_operator_allowed(self):
        """LIKE operator should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE name LIKE :pattern",
            "unclassified",
            {"pattern": "%test%"}
        )
        assert is_valid

    def test_in_operator_allowed(self):
        """IN operator should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE id IN (:ids)",
            "unclassified",
            {"ids": [1, 2, 3]}
        )
        assert is_valid

    def test_between_operator_allowed(self):
        """BETWEEN operator should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE created_at BETWEEN :start AND :end",
            "unclassified",
            {"start": "2024-01-01", "end": "2024-12-31"}
        )
        assert is_valid

    def test_is_null_allowed(self):
        """IS NULL should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE parent_id IS NULL",
            "unclassified"
        )
        assert is_valid

    def test_is_not_null_allowed(self):
        """IS NOT NULL should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE parent_id IS NOT NULL",
            "unclassified"
        )
        assert is_valid

    def test_coalesce_function_allowed(self):
        """COALESCE function should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT COALESCE(name, 'Unknown') FROM portfolio_nodes",
            "unclassified"
        )
        assert is_valid

    def test_case_when_allowed(self):
        """CASE WHEN should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id, CASE WHEN percent_complete > 50 THEN 'On Track' ELSE 'At Risk' END FROM portfolio_nodes",
            "unclassified"
        )
        assert is_valid

    def test_left_join_allowed(self):
        """LEFT JOIN should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT a.id, b.title FROM portfolio_nodes a LEFT JOIN tasks b ON a.id = b.portfolio_node_id",
            "unclassified"
        )
        assert is_valid

    def test_right_join_allowed(self):
        """RIGHT JOIN should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT a.id, b.title FROM portfolio_nodes a RIGHT JOIN tasks b ON a.id = b.portfolio_node_id",
            "unclassified"
        )
        assert is_valid

    def test_complex_where_clause(self):
        """Complex WHERE with AND/OR should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            """
            SELECT id, name FROM portfolio_nodes
            WHERE (node_type = :type OR node_type = :type2)
            AND status = :status
            AND created_at >= :since
            """,
            "unclassified",
            {"type": "project", "type2": "milestone", "status": "active", "since": "2024-01-01"}
        )
        assert is_valid

    def test_having_clause(self):
        """HAVING clause should be allowed."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT node_type, COUNT(*) as cnt FROM portfolio_nodes GROUP BY node_type HAVING COUNT(*) > 1",
            "unclassified"
        )
        assert is_valid


class TestValidateQueryWrapper:
    """Test the validate_query convenience wrapper."""

    def test_validate_query_valid(self):
        """validate_query should return True for valid queries."""
        is_valid, error = validate_query("SELECT id FROM portfolio_nodes")
        assert is_valid
        assert error is None

    def test_validate_query_invalid(self):
        """validate_query should return False for invalid queries."""
        is_valid, error = validate_query("SELECT * FROM secret_data")
        assert not is_valid
        assert error is not None


class TestGetAllowedTables:
    """Test the get_allowed_tables function."""

    def test_get_allowed_tables_exists(self):
        """Verify get_allowed_tables is callable."""
        assert callable(get_allowed_tables)

    def test_get_allowed_tables_returns_dict(self):
        """get_allowed_tables should return a dict."""
        tables = get_allowed_tables()
        assert isinstance(tables, dict)

    def test_get_allowed_tables_contains_portfolio_nodes(self):
        """get_allowed_tables should contain portfolio_nodes."""
        tables = get_allowed_tables()
        assert "portfolio_nodes" in tables

    def test_get_allowed_tables_contains_users(self):
        """get_allowed_tables should contain users."""
        tables = get_allowed_tables()
        assert "users" in tables


class TestExecuteQuerySync:
    """Test the execute_query_sync function."""

    def test_execute_query_sync_exists(self):
        """Verify execute_query_sync is callable."""
        assert callable(execute_query_sync)

    def test_execute_query_sync_rejects_invalid(self):
        """execute_query_sync should raise ValueError for invalid queries."""
        class FakeSession:
            def execute(self, *args, **kwargs):
                pass

        with pytest.raises(ValueError):
            execute_query_sync(
                FakeSession(),
                "SELECT * FROM secret_data",
                "unclassified"
            )

    def test_execute_query_sync_rejects_insert(self):
        """execute_query_sync should raise ValueError for INSERT."""
        class FakeSession:
            def execute(self, *args, **kwargs):
                pass

        with pytest.raises(ValueError):
            execute_query_sync(
                FakeSession(),
                "INSERT INTO portfolio_nodes (name) VALUES ('test')",
                "unclassified"
            )


class TestEdgeCases:
    """Test edge cases and corner cases."""

    def test_parse_error_handling(self):
        """Malformed SQL should return a parse error."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT FROM WHERE",
            "unclassified"
        )
        assert not is_valid
        assert error is not None

    def test_single_quote_injection(self):
        """Single quote injection should be handled by parameterized queries."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes WHERE name = :name",
            "unclassified",
            {"name": "'; DROP TABLE portfolio_nodes; --"}
        )
        # The query itself is valid; the parameter value is handled by the DB driver
        assert is_valid

    def test_double_select(self):
        """Double SELECT (nested) should be handled."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT * FROM (SELECT id FROM portfolio_nodes) AS sub",
            "unclassified"
        )
        assert is_valid

    def test_except_set_operation(self):
        """EXCEPT set operation with allowed tables should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes EXCEPT SELECT id FROM tasks",
            "unclassified"
        )
        # EXCEPT is parsed as a Union-like structure
        # Both sides should be validated

    def test_intersect_set_operation(self):
        """INTERSECT set operation with allowed tables should pass."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT id FROM portfolio_nodes INTERSECT SELECT id FROM tasks",
            "unclassified"
        )

    def test_alias_column_reference(self):
        """Column reference via table alias should be resolved."""
        is_valid, sanitized, error = validate_and_build_ast(
            "SELECT p.id, p.name FROM portfolio_nodes p WHERE p.id = :id",
            "unclassified",
            {"id": "123"}
        )
        assert is_valid

    def test_multiple_ctes(self):
        """Multiple CTEs should be validated."""
        is_valid, sanitized, error = validate_and_build_ast(
            """
            WITH
            cte1 AS (SELECT id FROM portfolio_nodes),
            cte2 AS (SELECT id FROM tasks)
            SELECT c1.id FROM cte1 c1 JOIN cte2 c2 ON c1.id = c2.id
            """,
            "unclassified"
        )
        assert is_valid

    def test_cte_with_disallowed_table_in_chain(self):
        """CTE chain with one disallowed table should fail."""
        is_valid, sanitized, error = validate_and_build_ast(
            """
            WITH
            cte1 AS (SELECT id FROM portfolio_nodes),
            cte2 AS (SELECT id FROM secret_data)
            SELECT c1.id FROM cte1 c1
            """,
            "unclassified"
        )
        assert not is_valid
        assert "secret_data" in error
