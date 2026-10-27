-- Audit fixes (see AUDIT.md).
--
-- Clears three credential tables whose format changed:
--   OTPCode            codes are now stored as an HMAC, with a purpose
--   PasswordResetToken tokens are now stored as a SHA-256 of the link value
--   Session            session tokens are now stored as a SHA-256 of the cookie
-- Every signed-in user has to log in once more; pending OTPs must be re-sent.
DELETE FROM "OTPCode";
DELETE FROM "PasswordResetToken";
DELETE FROM "Session";

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('EMAIL_VERIFY', 'BOOKING_LOOKUP');

-- CreateEnum
CREATE TYPE "HousekeepingStatus" AS ENUM ('CLEAN', 'DIRTY', 'IN_PROGRESS', 'INSPECTED');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('FLAT', 'INDIA_SLABS');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ManagerActionType" ADD VALUE 'TRANSFER_ROOM';
ALTER TYPE "ManagerActionType" ADD VALUE 'MARK_NO_SHOW';
ALTER TYPE "ManagerActionType" ADD VALUE 'UPDATE_HOUSEKEEPING';
ALTER TYPE "ManagerActionType" ADD VALUE 'UPDATE_TRANSFER';
ALTER TYPE "ManagerActionType" ADD VALUE 'INVITE_STAFF';
ALTER TYPE "ManagerActionType" ADD VALUE 'UPDATE_STAFF';

-- DropForeignKey
ALTER TABLE "OTPCode" DROP CONSTRAINT "OTPCode_email_fkey";

-- DropIndex
DROP INDEX "OTPCode_code_key";

-- DropIndex
DROP INDEX "OTPCode_email_idx";

-- DropIndex
DROP INDEX "OTPCode_code_idx";

-- DropIndex
DROP INDEX "PasswordResetToken_token_idx";

-- AlterTable
ALTER TABLE "OTPCode" DROP COLUMN "code",
DROP COLUMN "email",
ADD COLUMN     "codeHash" TEXT NOT NULL,
ADD COLUMN     "destination" TEXT NOT NULL,
ADD COLUMN     "purpose" "OtpPurpose" NOT NULL DEFAULT 'EMAIL_VERIFY',
ADD COLUMN     "subject" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "usedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "housekeepingStatus" "HousekeepingStatus" NOT NULL DEFAULT 'CLEAN';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "invoiceNo" TEXT,
ADD COLUMN     "invoicedAt" TIMESTAMP(3),
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "transferDetails" JSONB;

-- AlterTable
ALTER TABLE "HotelSettings" ADD COLUMN     "addOnGstPercent" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "restaurantLastSeating" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "restaurantOpenTime" TEXT NOT NULL DEFAULT '12:00',
ADD COLUMN     "roomGstHighPercent" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "roomGstLowPercent" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "roomGstThreshold" INTEGER NOT NULL DEFAULT 7500,
ADD COLUMN     "tableGstPercent" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "taxMode" "TaxMode" NOT NULL DEFAULT 'FLAT';

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "fiscalYear" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("fiscalYear")
);

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
CREATE INDEX "OTPCode_purpose_subject_idx" ON "OTPCode"("purpose", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_invoiceNo_key" ON "Booking"("invoiceNo");


-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "taxBreakdown" JSONB;
