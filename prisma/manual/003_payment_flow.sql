-- 003: payment ledger, pricing configuration, notification log, refund tracking.
-- Generated with: prisma migrate diff (schema before -> after). Additive only:
-- new enum values, new nullable/defaulted columns, new tables. Safe on live data.
-- Run BEFORE 004_payment_backfill.sql (new enum values must be committed first).


-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'REFUND_PENDING', 'REFUND_PROCESSED', 'REFUND_REJECTED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ADVANCE', 'BALANCE', 'FULL', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('CREATED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PremiumPaymentRule" AS ENUM ('FULL', 'FIRST_NIGHT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "BookingType" ADD VALUE 'ROOM_TABLE';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_PAID';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ManagerActionType" ADD VALUE 'RECORD_PAYMENT';
ALTER TYPE "ManagerActionType" ADD VALUE 'UPDATE_PAYMENT';
ALTER TYPE "ManagerActionType" ADD VALUE 'PROCESS_REFUND';
ALTER TYPE "ManagerActionType" ADD VALUE 'UPDATE_SETTINGS';

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "eventPrice" INTEGER,
ADD COLUMN     "peakPrice" INTEGER,
ADD COLUMN     "weekendPrice" INTEGER;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "advanceAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "assignedRoomNo" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "paidAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentRule" TEXT,
ADD COLUMN     "refundNote" TEXT,
ADD COLUMN     "refundProcessedAt" TIMESTAMP(3),
ADD COLUMN     "refundRequestedAt" TIMESTAMP(3),
ADD COLUMN     "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "remainingAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "roomAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tableAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tableGuestCount" INTEGER,
ADD COLUMN     "taxAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'CREATED',
    "mode" "PaymentMode" NOT NULL,
    "amount" INTEGER NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "recordedById" TEXT,
    "notes" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "advancePercent" INTEGER NOT NULL DEFAULT 50,
    "weekendDays" INTEGER[] DEFAULT ARRAY[5, 6]::INTEGER[],
    "premiumPaymentRule" "PremiumPaymentRule" NOT NULL DEFAULT 'FULL',
    "sameDayFullPayment" BOOLEAN NOT NULL DEFAULT true,
    "longStayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "longStayMinNights" INTEGER NOT NULL DEFAULT 3,
    "gstPercent" INTEGER NOT NULL DEFAULT 0,
    "tablePricePerGuest" INTEGER NOT NULL DEFAULT 500,
    "earlyCancelHours" INTEGER NOT NULL DEFAULT 48,
    "earlyRefundPercent" INTEGER NOT NULL DEFAULT 50,
    "lateCancelHours" INTEGER NOT NULL DEFAULT 24,
    "lateRefundPercent" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "HotelSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeakSeason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeakSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialDate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "event" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayOrderId_key" ON "Payment"("gatewayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "Payment"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_kind_idx" ON "Payment"("kind");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "PeakSeason_startDate_endDate_idx" ON "PeakSeason"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialDate_date_key" ON "SpecialDate"("date");

-- CreateIndex
CREATE INDEX "NotificationLog_bookingId_idx" ON "NotificationLog"("bookingId");

-- CreateIndex
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");

-- CreateIndex
CREATE INDEX "NotificationLog_channel_idx" ON "NotificationLog"("channel");

-- CreateIndex
CREATE INDEX "Booking_refundStatus_idx" ON "Booking"("refundStatus");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE INDEX "Booking_tableId_status_bookingDate_idx" ON "Booking"("tableId", "status", "bookingDate");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

