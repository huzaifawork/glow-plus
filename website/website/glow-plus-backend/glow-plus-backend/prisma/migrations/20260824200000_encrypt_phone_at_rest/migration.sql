-- DropIndex
DROP INDEX "User_phone_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneFingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneFingerprint_key" ON "User"("phoneFingerprint");

