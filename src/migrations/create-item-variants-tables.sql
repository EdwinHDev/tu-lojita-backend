-- Migración: Tablas y columnas para gestión de variantes de artículos y stock
-- 1. Columna hasVariants en items
ALTER TABLE "items"
  ADD COLUMN IF NOT EXISTS "hasVariants" BOOLEAN NOT NULL DEFAULT false;

-- 2. Tabla variant_axes
CREATE TABLE IF NOT EXISTS "variant_axes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "values" TEXT[] NOT NULL DEFAULT '{}',
  "position" INTEGER NOT NULL DEFAULT 0,
  "itemId" UUID NOT NULL REFERENCES "items"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_variant_axes_itemId" ON "variant_axes" ("itemId");

-- 3. Tabla item_variants
CREATE TABLE IF NOT EXISTS "item_variants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku" TEXT,
  "price" NUMERIC,
  "discountPrice" NUMERIC,
  "stockQuantity" NUMERIC NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "axisValues" JSONB NOT NULL DEFAULT '{}',
  "itemId" UUID NOT NULL REFERENCES "items"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_item_variants_itemId" ON "item_variants" ("itemId");
CREATE INDEX IF NOT EXISTS "IDX_item_variants_isActive" ON "item_variants" ("isActive");

-- 4. Columnas en order_items
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "variantId" UUID REFERENCES "item_variants"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "variantLabel" TEXT;

CREATE INDEX IF NOT EXISTS "IDX_order_items_variantId" ON "order_items" ("variantId");
