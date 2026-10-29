-- Migration: create-booking-and-preorder-tables.sql

-- 1. Create Enums if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'items_bookingtype_enum') THEN
    CREATE TYPE "items_bookingtype_enum" AS ENUM ('NONE', 'TIME_SLOT', 'PRE_ORDER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_preorder_configs_deposittype_enum') THEN
    CREATE TYPE "item_preorder_configs_deposittype_enum" AS ENUM ('FULL_PAYMENT', 'PERCENTAGE', 'FIXED_AMOUNT', 'FREE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_slot_bookings_status_enum') THEN
    CREATE TYPE "order_slot_bookings_status_enum" AS ENUM ('HOLD', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_preorderstatus_enum') THEN
    CREATE TYPE "orders_preorderstatus_enum" AS ENUM ('NONE', 'AWAITING_STOCK', 'STOCK_ARRIVED', 'READY_FOR_SETTLEMENT', 'FULFILLED', 'CANCELLED');
  END IF;
END $$;

-- 2. Alter items table
ALTER TABLE IF EXISTS items
ADD COLUMN IF NOT EXISTS "bookingType" "items_bookingtype_enum" NOT NULL DEFAULT 'NONE';

-- 3. Alter orders table
ALTER TABLE IF EXISTS orders
ADD COLUMN IF NOT EXISTS "preOrderStatus" "orders_preorderstatus_enum" NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "settlementDeadline" timestamptz NULL;

-- 4. Create item_slot_configs table
CREATE TABLE IF NOT EXISTS item_slot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "minNoticeHours" numeric NOT NULL DEFAULT 2,
  "serviceDurationMinutes" int NOT NULL DEFAULT 60,
  "allowSameDay" boolean NOT NULL DEFAULT true,
  "maxConcurrentBookings" int NOT NULL DEFAULT 1,
  "itemId" uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- 5. Create item_time_slots table
CREATE TABLE IF NOT EXISTS item_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dayOfWeek" int NULL,
  "specificDate" varchar(10) NULL,
  "startTime" varchar(5) NOT NULL,
  "endTime" varchar(5) NOT NULL,
  "label" varchar(100) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "slotConfigId" uuid NOT NULL REFERENCES item_slot_configs(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- 6. Create item_preorder_configs table
CREATE TABLE IF NOT EXISTS item_preorder_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "depositType" "item_preorder_configs_deposittype_enum" NOT NULL DEFAULT 'FULL_PAYMENT',
  "depositValue" numeric NOT NULL DEFAULT 0,
  "estimatedLeadDaysMin" int NOT NULL DEFAULT 7,
  "estimatedLeadDaysMax" int NOT NULL DEFAULT 15,
  "maxPreOrderUnits" int NOT NULL DEFAULT 50,
  "reservedPreOrderUnits" int NOT NULL DEFAULT 0,
  "settlementWindowHours" int NOT NULL DEFAULT 48,
  "itemId" uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- 7. Create order_slot_bookings table
CREATE TABLE IF NOT EXISTS order_slot_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingDate" varchar(10) NOT NULL,
  "slotStartTime" varchar(5) NOT NULL,
  "slotEndTime" varchar(5) NOT NULL,
  "slotLabel" varchar(100) NOT NULL,
  "lockedUntil" timestamptz NULL,
  "status" "order_slot_bookings_status_enum" NOT NULL DEFAULT 'HOLD',
  "orderId" uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
  "timeSlotId" uuid NOT NULL REFERENCES item_time_slots(id) ON DELETE CASCADE,
  "customerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "storeId" uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_slot_bookings_date_slot ON order_slot_bookings("bookingDate", "timeSlotId");
CREATE INDEX IF NOT EXISTS idx_order_slot_bookings_locked_until ON order_slot_bookings("lockedUntil");
CREATE INDEX IF NOT EXISTS idx_order_slot_bookings_status ON order_slot_bookings("status");
CREATE INDEX IF NOT EXISTS idx_orders_preorder_status ON orders("preOrderStatus");
CREATE INDEX IF NOT EXISTS idx_item_time_slots_config ON item_time_slots("slotConfigId");
