-- Add phone and description columns to companies if not exists
ALTER TABLE "companies" 
ADD COLUMN IF NOT EXISTS "phone" text,
ADD COLUMN IF NOT EXISTS "description" text;

-- Add instagram and tiktok columns to stores if not exists
ALTER TABLE "stores" 
ADD COLUMN IF NOT EXISTS "instagram" text,
ADD COLUMN IF NOT EXISTS "tiktok" text;
