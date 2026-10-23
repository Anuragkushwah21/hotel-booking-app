-- 004: backfill the money / refund columns added by 003 for bookings that
-- already exist, so old rows read correctly on the new screens.
--
-- Idempotent: every statement only touches rows still at the column defaults,
-- so running it twice changes nothing the second time.

BEGIN;

-- Split the old single charge into the room / table legs.
UPDATE "Booking" SET "roomAmount" = "baseAmount"
WHERE "type" = 'ROOM' AND "roomAmount" = 0 AND "baseAmount" > 0;

UPDATE "Booking" SET "tableAmount" = "baseAmount"
WHERE "type" = 'TABLE' AND "tableAmount" = 0 AND "baseAmount" > 0;

-- Paid bookings were always paid in full under the old flow.
UPDATE "Booking"
SET "paidAmount" = "totalPrice", "advanceAmount" = "totalPrice", "paymentRule" = 'LEGACY'
WHERE "paymentStatus" IN ('PAID', 'REFUNDED') AND "paidAmount" = 0;

-- Everything still live owes whatever hasn't been paid.
UPDATE "Booking"
SET "remainingAmount" = GREATEST("totalPrice" - "paidAmount", 0)
WHERE "status" <> 'CANCELLED' AND "remainingAmount" = 0;

-- Refunds the old flow recorded were already settled.
UPDATE "Booking"
SET "refundStatus" = 'REFUND_PROCESSED', "refundProcessedAt" = COALESCE("cancelledAt", "updatedAt")
WHERE "paymentStatus" = 'REFUNDED' AND "refundStatus" = 'NONE';

-- Confirmed stays get the room number snapshot and a confirmation time.
UPDATE "Booking" b
SET "assignedRoomNo" = r."roomNo"
FROM "Room" r
WHERE b."roomId" = r."id"
  AND b."status" IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')
  AND b."assignedRoomNo" IS NULL;

UPDATE "Booking" SET "confirmedAt" = "updatedAt"
WHERE "status" IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT') AND "confirmedAt" IS NULL;

-- One ledger row per historical payment, so payment history isn't empty.
INSERT INTO "Payment" ("id", "bookingId", "kind", "status", "mode", "amount", "gateway",
                       "notes", "paidAt", "createdAt", "updatedAt")
SELECT 'legacy_' || b."id", b."id", 'FULL', 'SUCCEEDED', b."paymentMode", b."totalPrice",
       CASE WHEN b."source" = 'WALK_IN' THEN 'DESK' ELSE 'LEGACY' END,
       'Backfilled from pre-ledger booking', b."updatedAt", b."createdAt", NOW()
FROM "Booking" b
WHERE b."paymentStatus" IN ('PAID', 'REFUNDED') AND b."totalPrice" > 0
ON CONFLICT ("id") DO NOTHING;

-- Default pricing / policy row.
INSERT INTO "HotelSettings" ("id", "updatedAt") VALUES (1, NOW())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
