-- T77 — one dropdown grants or removes admin access.
--
-- WHY THIS IS A TRIGGER AND NOT APPLICATION CODE.
--
-- The client needs to be able to make someone an admin without a developer.
-- Writing an INSERT with a bcrypt hash by hand is not a thing to ask of a
-- business owner: it is four fields, two of which (a generated id and a
-- crypt() call) are easy to get wrong, and getting them wrong produces an
-- account that logs in and then fails everything with no useful error. That
-- already happened once on this database — a row was inserted with an empty
-- string id, which every guard reads as "no account context".
--
-- So the supported gesture is now: open the User table, change `role` from
-- CONSUMER to ADMIN. Two clicks, no password handling, and it works the same
-- from the Supabase table editor as it does from the admin panel — because
-- both do nothing but set this one column, and these triggers do the rest.
--
-- Putting the sync in the database rather than in NestJS is what makes that
-- true. If it lived in application code, a change made in the Supabase table
-- editor would set a column and nothing else would happen, which is precisely
-- the silent half-configured state this is meant to prevent.
--
-- ⚠️ Anyone reading admin.service.ts will NOT see this behaviour. It is
-- referenced from schema.prisma's comment on User.role for that reason.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CONSUMER', 'ADMIN', 'OWNER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'CONSUMER';

-- Backfill: anyone who is ALREADY an admin and also has a customer account
-- should show the truth in this column, or the table would say CONSUMER for a
-- sitting administrator and flipping them later would look like a no-op.
UPDATE "User" u
SET "role" = a."role"::text::"UserRole"
FROM "Admin" a
WHERE a.email = u.email;

-- ---------------------------------------------------------------------------
-- The sync function. Handles every path in one place so the cases cannot drift.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_admin_from_user() RETURNS TRIGGER AS $$
BEGIN
  -- The customer account is gone; the admin account must not outlive it.
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM "Admin" WHERE email = OLD.email;
    RETURN OLD;
  END IF;

  IF (NEW."role" = 'CONSUMER') THEN
    -- Demoted. Removing the row is what actually revokes access: a guard that
    -- finds no Admin row fails closed, so this bites immediately rather than
    -- when their token expires.
    DELETE FROM "Admin" WHERE email = NEW.email;
  ELSE
    -- Promoted, or their password changed while they are an admin.
    --
    -- The hash is COPIED, never generated — the person signs in to the panel
    -- with the password they already use, so no credential is invented here
    -- and none has to be sent to them.
    --
    -- ON CONFLICT is what keeps the copy fresh. Without it, a customer who
    -- reset their password after being promoted would keep signing in to the
    -- panel with their OLD password, with nothing to explain why.
    --
    -- The cast is safe: this branch is unreachable for CONSUMER, and the other
    -- two UserRole values exist in AdminRole by construction.
    INSERT INTO "Admin" (id, email, "passwordHash", "role", "createdAt")
    VALUES (
      replace(gen_random_uuid()::text, '-', ''),
      NEW.email,
      NEW."passwordHash",
      NEW."role"::text::"AdminRole",
      now()
    )
    ON CONFLICT (email) DO UPDATE
      SET "role" = EXCLUDED."role",
          "passwordHash" = EXCLUDED."passwordHash";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Promotion and demotion.
CREATE TRIGGER user_role_sync_admin
AFTER UPDATE OF "role" ON "User"
FOR EACH ROW
WHEN (OLD."role" IS DISTINCT FROM NEW."role")
EXECUTE FUNCTION sync_admin_from_user();

-- A row inserted straight into User as an admin (seeding, or a hand-written
-- INSERT) gets the same treatment as one promoted later.
CREATE TRIGGER user_insert_sync_admin
AFTER INSERT ON "User"
FOR EACH ROW
WHEN (NEW."role" <> 'CONSUMER')
EXECUTE FUNCTION sync_admin_from_user();

-- Keep the copied hash current. This is the trigger that closes the stale
-- password bug: password reset writes User.passwordHash and knows nothing
-- about the Admin table.
CREATE TRIGGER user_password_sync_admin
AFTER UPDATE OF "passwordHash" ON "User"
FOR EACH ROW
WHEN (OLD."passwordHash" IS DISTINCT FROM NEW."passwordHash" AND NEW."role" <> 'CONSUMER')
EXECUTE FUNCTION sync_admin_from_user();

-- Deleting the customer removes the admin.
CREATE TRIGGER user_delete_sync_admin
AFTER DELETE ON "User"
FOR EACH ROW
EXECUTE FUNCTION sync_admin_from_user();

-- ---------------------------------------------------------------------------
-- Admin.role default: ADMIN -> OWNER.
--
-- The only path that reaches this default is a hand-written INSERT straight
-- into Admin, since the triggers above and the API both set it explicitly.
-- Anyone able to run that INSERT can equally run `UPDATE "Admin" SET
-- role='OWNER'`, so defaulting to the weaker role protected against nobody
-- while adding a step an operator can forget — and forgetting it yields an
-- admin who cannot promote anyone.
-- ---------------------------------------------------------------------------
ALTER TABLE "Admin" ALTER COLUMN "role" SET DEFAULT 'OWNER';
