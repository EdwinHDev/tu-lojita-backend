-- Migration: Add Item-Level Commission Fields and Recalculate Existing Items
-- 1. Alter items table
ALTER TABLE "items"
  ADD COLUMN IF NOT EXISTS "basePrice" numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionRate" numeric(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionAmount" numeric(12, 2) DEFAULT 0;

-- 2. Alter item_variants table
ALTER TABLE "item_variants"
  ADD COLUMN IF NOT EXISTS "basePrice" numeric NULL,
  ADD COLUMN IF NOT EXISTS "commissionRate" numeric(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionAmount" numeric(12, 2) DEFAULT 0;

-- 3. Alter order_items table
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "basePrice" numeric(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionRate" numeric(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionAmount" numeric(12, 2) DEFAULT 0;

-- 4. Backfill items:
-- Set basePrice = price if basePrice is 0 and price > 0
UPDATE "items"
SET "basePrice" = "price"
WHERE ("basePrice" IS NULL OR "basePrice" = 0) AND "price" > 0;

-- Recalculate commission and public price for items using active single payment rates
WITH item_rates AS (
  SELECT 
    i.id,
    COALESCE(r."singlePaymentRate", 0) as rate
  FROM "items" i
  JOIN "stores" s ON s.id = i."storeId"
  LEFT JOIN LATERAL (
    SELECT cr."singlePaymentRate"
    FROM "commission_config_ranges" cr
    WHERE cr."isActive" = true
      AND i."basePrice" >= cr."minAmount"
      AND (cr."maxAmount" IS NULL OR i."basePrice" <= cr."maxAmount")
    ORDER BY cr."minAmount" ASC
    LIMIT 1
  ) r ON true
  WHERE s."isCommissionExempt" = false
    AND i."basePrice" > 0
)
UPDATE "items" i
SET 
  "commissionRate" = ir.rate,
  "commissionAmount" = ROUND((i."basePrice" * ir.rate) / 100, 2),
  "price" = i."basePrice" + ROUND((i."basePrice" * ir.rate) / 100, 2)
FROM item_rates ir
WHERE i.id = ir.id;

-- 5. Backfill item_variants:
UPDATE "item_variants" v
SET "basePrice" = "price"
WHERE ("basePrice" IS NULL OR "basePrice" = 0) AND "price" IS NOT NULL AND "price" > 0;

WITH variant_rates AS (
  SELECT 
    v.id,
    COALESCE(r."singlePaymentRate", 0) as rate
  FROM "item_variants" v
  JOIN "items" i ON i.id = v."itemId"
  JOIN "stores" s ON s.id = i."storeId"
  LEFT JOIN LATERAL (
    SELECT cr."singlePaymentRate"
    FROM "commission_config_ranges" cr
    WHERE cr."isActive" = true
      AND v."basePrice" >= cr."minAmount"
      AND (cr."maxAmount" IS NULL OR v."basePrice" <= cr."maxAmount")
    ORDER BY cr."minAmount" ASC
    LIMIT 1
  ) r ON true
  WHERE s."isCommissionExempt" = false
    AND v."basePrice" IS NOT NULL
    AND v."basePrice" > 0
)
UPDATE "item_variants" v
SET 
  "commissionRate" = vr.rate,
  "commissionAmount" = ROUND((v."basePrice" * vr.rate) / 100, 2),
  "price" = v."basePrice" + ROUND((v."basePrice" * vr.rate) / 100, 2)
FROM variant_rates vr
WHERE v.id = vr.id;

-- 6. Backfill existing order_items:
UPDATE "order_items"
SET "basePrice" = "price"
WHERE ("basePrice" IS NULL OR "basePrice" = 0) AND "price" > 0;

