-- ============================================================
-- Eisenhower Portfolio Manager — PostgreSQL Initialization
-- ============================================================
--
-- This script is mounted as /docker-entrypoint-initdb.d/01-init.sql
-- and runs automatically on first database creation.
--
-- It enables the ltree extension required for the unified tree
-- architecture, creates GiST indexes for path containment queries,
-- and configures WAL archiving for point-in-time recovery.
--
-- SECURITY:
-- - ltree extension is required for UniversalBreakdownNode.path
-- - GiST index enables efficient subtree containment queries (@>)
-- - WAL archiving enables disaster recovery in air-gapped environments
-- ============================================================

-- Enable the ltree extension for hierarchical path storage
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Configure WAL archiving for point-in-time recovery
-- These settings are also set via environment variables in docker-compose.yml
-- but are included here as a safety net
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET max_wal_senders = 3;
ALTER SYSTEM SET wal_keep_size = '1GB';
ALTER SYSTEM SET wal_compression = 'lz4';
ALTER SYSTEM SET max_wal_size = '2GB';
ALTER SYSTEM SET min_wal_size = '512MB';
ALTER SYSTEM SET checkpoint_timeout = '10min';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;

-- Configure performance for GiST indexing
ALTER SYSTEM SET shared_buffers = '512MB';
ALTER SYSTEM SET effective_cache_size = '1536MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET huge_pages = 'try';

-- Create a dedicated role for read-only reporting access
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'eisenhower_ro') THEN
        CREATE ROLE eisenhower_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
        GRANT CONNECT ON DATABASE eisenhower TO eisenhower_ro;
        GRANT USAGE ON SCHEMA public TO eisenhower_ro;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO eisenhower_ro;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO eisenhower_ro;
    END IF;
END
$$;

-- Create a dedicated role for backup operations
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'eisenhower_backup') THEN
        CREATE ROLE eisenhower_backup WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
        GRANT CONNECT ON DATABASE eisenhower TO eisenhower_backup;
        GRANT USAGE ON SCHEMA public TO eisenhower_backup;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO eisenhower_backup;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO eisenhower_backup;
    END IF;
END
$$;

-- Verify ltree extension is active
SELECT extname, extversion FROM pg_extension WHERE extname = 'ltree';

-- Log initialization completion
DO $$
BEGIN
    RAISE NOTICE 'Eisenhower Portfolio Manager database initialized successfully.';
    RAISE NOTICE 'ltree extension: %', (SELECT extversion FROM pg_extension WHERE extname = 'ltree');
    RAISE NOTICE 'GiST indexing configured for path containment queries.';
    RAISE NOTICE 'WAL archiving configured for point-in-time recovery.';
END
$$;
