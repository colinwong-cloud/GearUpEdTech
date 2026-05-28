-- Supabase explicit GRANT migration for public schema tables/sequences.
-- Purpose:
-- 1) Make table access explicit (instead of relying on legacy defaults)
-- 2) Keep service_role fully functional for server/admin routes
-- 3) Preserve required frontend reads for anon/authenticated
-- 4) Set default privileges for future tables created in public schema
--
-- Run in Supabase SQL Editor as a privileged role (typically postgres).
-- Safe to re-run.

BEGIN;

-- Ensure API roles can resolve objects in public schema.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Do not allow API roles to create objects in public schema.
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

-- Baseline: server-side admin client must keep full table/sequence access.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Required direct frontend reads (anon/authenticated via supabase-js).
-- Note: RLS policies still apply. GRANT only enables table-level permission.
GRANT SELECT ON TABLE public.questions TO anon, authenticated;
GRANT SELECT ON TABLE public.parent_weights TO anon, authenticated;
GRANT SELECT ON TABLE public.student_balances TO anon, authenticated;

-- Future-proof defaults for new public schema objects created by current_user.
-- This avoids permission errors in environments where changing another role's
-- default privileges (e.g. FOR ROLE supabase_admin) is not allowed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

COMMIT;

-- For each newly created table that must be readable by frontend clients,
-- explicitly add, in the same migration as CREATE TABLE:
--   GRANT SELECT ON TABLE public.<table_name> TO anon, authenticated;
