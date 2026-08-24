-- T25: points expiration [F8].
-- expirePoints.job.ts previously wrote `data: {}` — a literal no-op — because
-- there was no column to set. This adds it.
ALTER TABLE "Visit" ADD COLUMN "expired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Visit" ADD COLUMN "expiredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Visit_userId_merchantId_expired_idx" ON "Visit"("userId", "merchantId", "expired");

-- CreateIndex
CREATE INDEX "Visit_expired_visitDate_idx" ON "Visit"("expired", "visitDate");
