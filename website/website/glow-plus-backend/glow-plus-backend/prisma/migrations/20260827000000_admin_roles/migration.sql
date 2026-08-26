-- T77 — admin roles.
--
-- Adds a two-tier role to Admin so the platform owner can create further
-- admins from the panel instead of needing database access, without every
-- admin being able to mint more of themselves.

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN');

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN "role" "AdminRole" NOT NULL DEFAULT 'ADMIN';

-- Promote every pre-existing admin to OWNER.
--
-- This line is load-bearing. Before this migration the only way to obtain an
-- admin account was `scripts/create-admin.ts` or a direct INSERT — both of
-- which require database access, so every existing row is by definition a
-- founder account. If they defaulted to ADMIN like everyone else, a deployment
-- would come out of this migration with ZERO owners, and since creating an
-- owner requires being one, the platform could never grant admin access again
-- without dropping back to raw SQL. That is precisely what T77 exists to end.
UPDATE "Admin" SET "role" = 'OWNER';
