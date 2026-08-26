-- T52b — Close the Supabase Data API against the app's tables.
--
-- WHY THIS EXISTS
-- Supabase fronts every project with PostgREST at
-- https://<ref>.supabase.co/rest/v1/, and by default the `public` schema is
-- exposed through it. On a fresh project the `anon` and `authenticated` roles
-- are granted ALL privileges on every table in `public`, and Prisma-created
-- tables inherit that grant. Row Level Security is the only thing standing in
-- the way -- and Prisma never enables it, because Prisma has no concept of it.
--
-- Measured on this project 2026-08-26, before this migration:
--   * RLS OFF on all 16 tables, 0 policies
--   * anon held SELECT/INSERT/UPDATE/DELETE on all 16
--   * GET /rest/v1/User returned 401 (missing key), i.e. the route is LIVE
--
-- The anon key is public by design -- Supabase ships it in browser bundles.
-- So anyone holding it could read "User" (password hashes, AES-GCM phone
-- ciphertext), read "RefreshToken" and "PasswordReset", and INSERT themselves
-- a row in "Admin". This app never ships that key (it talks to Postgres
-- through Prisma over the pooler, not supabase-js), so nothing is known to be
-- leaked -- but "not currently leaked" is not a security control.
--
-- WHY IT IS SAFE FOR THE BACKEND
-- Prisma connects as `postgres`, which has rolbypassrls = true (verified), and
-- `postgres` also OWNS every table. Enabling RLS is therefore invisible to the
-- application. Note the deliberate absence of FORCE ROW LEVEL SECURITY: FORCE
-- would subject the owner to policies too, and with zero policies defined that
-- would lock the backend out of its own database.
--
-- WHY IT IS A NO-OP OUTSIDE SUPABASE
-- `anon` / `authenticated` are Supabase-managed roles. They do not exist on
-- the local Docker Postgres or on a CI service container, where an unguarded
-- REVOKE would abort the migration with "role does not exist" -- breaking
-- T58 (migrations from CI) in the one place it is most expensive to discover.
-- The whole body is therefore guarded on the roles being present. Local dev
-- gains nothing from RLS anyway: there is no Data API in front of it.

DO $$
DECLARE
  t record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'Supabase roles absent -- skipping Data API lockdown (not a Supabase database).';
    RETURN;
  END IF;

  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    -- Lock 1: no privilege at all. PostgREST fails before RLS is consulted.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.relname);

    -- Lock 2: RLS on with zero policies == deny-all for any role that does not
    -- bypass it. Independent of the grants above, so re-granting by accident
    -- (or a future Supabase default) still does not open the table.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;

  -- Tables created by LATER migrations would otherwise pick the grant straight
  -- back up from the default ACL. Prisma runs migrations as `postgres`, so it
  -- is postgres's defaults that apply to anything it creates.
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
END
$$;
