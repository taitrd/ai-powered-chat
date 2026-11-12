-- ==============================================================================
-- Aurora PostgreSQL: Initialize Application User with AWS IAM Authentication
-- ==============================================================================
-- Run this script while connected to the 'chat' database as 'postgres'.
--
-- Example psql command:
--   psql -h <CLUSTER_ENDPOINT> -p 5432 -U postgres -d chat -f init-user.sql
--
-- Or run inside pgAdmin, DBeaver, or AWS RDS Query Editor.
-- ==============================================================================

-- 1. Create the application user 'app' if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app') THEN
    CREATE USER app WITH LOGIN;
  END IF;
END
$$;

-- 2. Configure authentication for 'app'
-- For AWS IAM database authentication (default for Lambda in prod):
GRANT rds_iam TO app;
-- Note: DO NOT grant rds_iam to 'postgres', as that replaces password auth with PAM.

-- 3. Grant database-level and schema-level permissions to 'app'
GRANT ALL PRIVILEGES ON DATABASE chat TO app;
GRANT ALL ON SCHEMA public TO app;

-- 4. Configure default privileges for future tables and sequences created by postgres
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app;

-- 5. Grant permissions on any existing tables and sequences created by migrations
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app;

-- Verify setup
SELECT rolname, rolcanlogin, rolsuper
FROM pg_roles
WHERE rolname IN ('postgres', 'app');
