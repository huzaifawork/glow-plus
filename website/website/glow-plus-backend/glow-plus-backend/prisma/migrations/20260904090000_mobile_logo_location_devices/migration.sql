-- M1 — everything the mobile app's spec needs that the schema could not express.
--
-- Three unrelated-looking additions, all driven by one document
-- (Glow-Plus-App-Requirements-Spec):
--
--   * salon LOGO  (W1-W5, and R3.11-R3.13 which depend on it)
--   * salon LOCATION  (R3.6-R3.10, whose stated dependency is "every salon has
--     a registered location on the platform")
--   * device push tokens  (R4.5, "notify the user when a booking's status
--     changes ... without requiring the user to manually check")
--
-- Every added column is NULLABLE and no default invents data. That is a
-- requirement, not caution: R3.9/R3.12 and the spec's own dependency note all
-- say the absence of a logo or a location must be a first-class, gracefully
-- handled state. A NOT NULL DEFAULT '' here would make "not provided" and
-- "provided as empty" indistinguishable to every reader.

-- ---------------------------------------------------------------------------
-- Salon branding  (W2, W5)
-- ---------------------------------------------------------------------------
-- Metadata only. The bytes go in "MerchantLogo" below, so that the public
-- directory -- which reads Merchant for up to 100 salons per unauthenticated
-- request -- never has an image on the same row it is scanning.
ALTER TABLE "Merchant" ADD COLUMN "logoMimeType" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Salon location  (R3.6-R3.10)
-- ---------------------------------------------------------------------------
-- ⚠️ These are the SALON's coordinates and are published on purpose. The
-- CUSTOMER's location is never sent to this server and gets no column here:
-- NF6 says it "must not be stored on the backend or shared with any salon",
-- so distance is computed on the device from these numbers. If a future change
-- proposes storing a user's position, it is this line it has to argue with.
ALTER TABLE "Merchant" ADD COLUMN "addressLine" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "city" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "region" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Merchant" ADD COLUMN "longitude" DOUBLE PRECISION;

-- Enforced in the database as well as in the DTO, for the same reason the
-- seats bound is (20260828120000): the API is not the only writer -- the
-- Supabase table editor is a supported path on this project and gets no
-- class-validator at all. A longitude of 5000 would sort the whole directory
-- wrongly and be very hard to see.
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_latitude_range"
  CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_longitude_range"
  CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));

-- A half-set coordinate is worse than none: it passes an `IS NOT NULL` check on
-- one axis and puts the salon at the equator or the prime meridian. Either both
-- or neither.
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_coordinates_paired"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

-- Distance sorting happens on the device, but "which salons even have a
-- location" and the city filter (R3.10) are directory queries.
CREATE INDEX "Merchant_city_idx" ON "Merchant"("city");

-- ---------------------------------------------------------------------------
-- Logo bytes  (W3)
-- ---------------------------------------------------------------------------
CREATE TABLE "MerchantLogo" (
    "merchantId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantLogo_pkey" PRIMARY KEY ("merchantId")
);

ALTER TABLE "MerchantLogo" ADD CONSTRAINT "MerchantLogo_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- W3 -- "within a sensible file size limit". 2 MiB, matching MAX_LOGO_BYTES in
-- common/limits.ts. Two enforcement points for one rule, again because the
-- table editor bypasses the first.
ALTER TABLE "MerchantLogo" ADD CONSTRAINT "MerchantLogo_size_sane"
  CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 2097152);

-- ---------------------------------------------------------------------------
-- Push tokens  (R4.5)
-- ---------------------------------------------------------------------------
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- UNIQUE on the token, not on (userId, token). A device that signs into a
-- second account must MOVE, not accumulate -- otherwise the previous account's
-- booking notifications keep arriving on a phone somebody else is now holding.
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Supabase Data API lockdown for the two NEW tables  (T52b)
-- ---------------------------------------------------------------------------
-- 20260826120000_lock_down_supabase_data_api revoked anon/authenticated and
-- enabled RLS on every table that existed THEN. Prisma-created tables inherit
-- Supabase's default grants, so a table added afterwards is open again unless
-- this runs -- and "DeviceToken" holds push addresses for real customers'
-- phones. Guarded on the roles existing, exactly as the original is, so this
-- stays a no-op on local Docker Postgres and in CI where `anon` is not a role.
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'Supabase roles absent -- skipping Data API lockdown for MerchantLogo/DeviceToken.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['MerchantLogo', 'DeviceToken'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
