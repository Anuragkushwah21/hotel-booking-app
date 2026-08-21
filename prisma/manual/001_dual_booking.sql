-- ============================================================
-- Dual-booking migration (online + walk-in)
-- Safe to re-run: every statement is guarded.
--
-- Additive except for one change: the UserRole enum loses 'USER'.
-- Existing USER rows are converted to GUEST as part of the swap, so no row is
-- ever left pointing at a value that no longer exists.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. New enums
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'WALK_IN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMode" AS ENUM ('ONLINE', 'CASH', 'CARD', 'UPI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ManagerActionType" AS ENUM (
    'CREATE_BOOKING', 'MODIFY_BOOKING', 'CANCEL_BOOKING',
    'CHECK_IN', 'CHECK_OUT', 'REFUND',
    'CREATE_ROOM', 'UPDATE_ROOM', 'DELETE_ROOM',
    'BLOCK_ROOM', 'UNBLOCK_ROOM',
    'CREATE_TABLE', 'UPDATE_TABLE', 'DELETE_TABLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2. UserRole: USER|ADMIN  ->  GUEST|HOTEL_MANAGER|ADMIN
--
-- Postgres cannot drop an enum value in place, so the type is swapped and the
-- column rewritten in one pass. USER maps to GUEST; ADMIN is preserved.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'USER'
  ) THEN
    ALTER TYPE "UserRole" RENAME TO "UserRole_old";
    CREATE TYPE "UserRole" AS ENUM ('GUEST', 'HOTEL_MANAGER', 'ADMIN');

    ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "User"
      ALTER COLUMN "role" TYPE "UserRole"
      USING (
        CASE WHEN "role"::text = 'USER' THEN 'GUEST' ELSE "role"::text END
      )::"UserRole";
    ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'GUEST';

    DROP TYPE "UserRole_old";
  END IF;
END $$;

-- Keep the legacy isAdmin flag consistent with role.
UPDATE "User" SET "isAdmin" = ("role" = 'ADMIN') WHERE "isAdmin" <> ("role" = 'ADMIN');

-- ------------------------------------------------------------
-- 3. User: contact + manager-invite columns
-- ------------------------------------------------------------
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phone"       TEXT,
  ADD COLUMN IF NOT EXISTS "invitedById" TEXT,
  ADD COLUMN IF NOT EXISTS "invitedAt"   TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key"  ON "User"("phone");
CREATE        INDEX IF NOT EXISTS "User_phone_idx"  ON "User"("phone");
CREATE        INDEX IF NOT EXISTS "User_role_idx"   ON "User"("role");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 4. Booking: dual-booking, money breakdown, lifecycle timestamps
-- ------------------------------------------------------------
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "source"        "BookingSource" NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN IF NOT EXISTS "bookedById"    TEXT,
  ADD COLUMN IF NOT EXISTS "paymentMode"   "PaymentMode"   NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN IF NOT EXISTS "addOns"        TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "baseAmount"    INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "addOnsAmount"  INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refundAmount"  INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "holdExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkedInAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkedOutAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelReason"  TEXT;

-- Existing rows predate the base/add-on split. Treat the whole amount as base
-- so revenue reports aren't zeroed out for historical bookings.
UPDATE "Booking" SET "baseAmount" = "totalPrice"
  WHERE "baseAmount" = 0 AND "totalPrice" > 0;

-- checkedInAt / checkedOutAt are left NULL for pre-existing rows: the real
-- timestamps were never recorded and inventing them would be worse than null.

DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookedById_fkey"
    FOREIGN KEY ("bookedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Booking_source_idx"        ON "Booking"("source");
CREATE INDEX IF NOT EXISTS "Booking_bookedById_idx"    ON "Booking"("bookedById");
CREATE INDEX IF NOT EXISTS "Booking_checkInDate_idx"   ON "Booking"("checkInDate");
CREATE INDEX IF NOT EXISTS "Booking_checkOutDate_idx"  ON "Booking"("checkOutDate");
CREATE INDEX IF NOT EXISTS "Booking_bookingDate_idx"   ON "Booking"("bookingDate");
CREATE INDEX IF NOT EXISTS "Booking_holdExpiresAt_idx" ON "Booking"("holdExpiresAt");
-- Drives the overlap scan in the availability engine.
CREATE INDEX IF NOT EXISTS "Booking_roomId_status_checkInDate_checkOutDate_idx"
  ON "Booking"("roomId", "status", "checkInDate", "checkOutDate");

-- ------------------------------------------------------------
-- 5. Room: index used by room-type filters/reports
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Room_type_idx" ON "Room"("type");

-- ------------------------------------------------------------
-- 6. RoomBlock — date-ranged maintenance windows
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "RoomBlock" (
  "id"        TEXT         NOT NULL,
  "roomId"    TEXT         NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate"   TIMESTAMP(3) NOT NULL,
  "reason"    TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RoomBlock_roomId_idx" ON "RoomBlock"("roomId");
CREATE INDEX IF NOT EXISTS "RoomBlock_startDate_endDate_idx"
  ON "RoomBlock"("startDate", "endDate");

DO $$ BEGIN
  ALTER TABLE "RoomBlock" ADD CONSTRAINT "RoomBlock_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 7. ManagerAction — append-only staff audit trail
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ManagerAction" (
  "id"        TEXT                NOT NULL,
  "managerId" TEXT                NOT NULL,
  "bookingId" TEXT,
  "action"    "ManagerActionType" NOT NULL,
  "notes"     TEXT,
  "metadata"  JSONB,
  "createdAt" TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagerAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ManagerAction_managerId_idx" ON "ManagerAction"("managerId");
CREATE INDEX IF NOT EXISTS "ManagerAction_bookingId_idx" ON "ManagerAction"("bookingId");
CREATE INDEX IF NOT EXISTS "ManagerAction_action_idx"    ON "ManagerAction"("action");
CREATE INDEX IF NOT EXISTS "ManagerAction_createdAt_idx" ON "ManagerAction"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ManagerAction" ADD CONSTRAINT "ManagerAction_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ManagerAction" ADD CONSTRAINT "ManagerAction_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
