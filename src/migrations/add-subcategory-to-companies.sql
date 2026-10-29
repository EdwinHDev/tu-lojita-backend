-- Add subcategoryId column to companies if not exists
ALTER TABLE "companies" 
ADD COLUMN IF NOT EXISTS "subcategoryId" uuid REFERENCES "subcategories"("id") ON DELETE SET NULL;

-- Backfill subcategoryId from existing stores belonging to the company
UPDATE "companies" c
SET "subcategoryId" = (
  SELECT s."subcategoryId"
  FROM "stores" s
  WHERE s."companyId" = c.id
    AND s."subcategoryId" IS NOT NULL
  LIMIT 1
)
WHERE c."subcategoryId" IS NULL;
