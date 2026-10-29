-- Migration: Collaborator Permission-Scoped Notifications Support
-- 1. Drop Foreign Key constraint on user_devices.userId -> users.id so both Users and CompanyCollaborators can register FCM tokens
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'user_devices'
      AND kcu.column_name = 'userId'
  ) LOOP
    EXECUTE 'ALTER TABLE "user_devices" DROP CONSTRAINT IF EXISTS "' || r.constraint_name || '"';
  END LOOP;
END $$;

-- 2. Add storeId and channelType columns to notifications
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "storeId" uuid NULL,
  ADD COLUMN IF NOT EXISTS "channelType" varchar(32) NULL;

CREATE INDEX IF NOT EXISTS "IDX_notifications_storeId_createdAt"
  ON "notifications" ("storeId", "createdAt" DESC);

-- 3. Backfill storeId from orders where targetId is an order UUID AND the notification recipient is the store/company owner
UPDATE "notifications" n
SET "storeId" = o."storeId"
FROM "orders" o
INNER JOIN "stores" s ON s.id = o."storeId"
LEFT JOIN "companies" c ON c.id = s."companyId"
WHERE n."storeId" IS NULL
  AND n."targetId" IS NOT NULL
  AND n."targetId" = o.id::text
  AND (n."userId" = s."ownerId" OR (c."ownerId" IS NOT NULL AND n."userId" = c."ownerId"));

-- 4. Backfill storeId where targetId is directly a store UUID AND the notification recipient is the store/company owner
UPDATE "notifications" n
SET "storeId" = s.id
FROM "stores" s
LEFT JOIN "companies" c ON c.id = s."companyId"
WHERE n."storeId" IS NULL
  AND n."targetId" IS NOT NULL
  AND n."targetId" = s.id::text
  AND (n."userId" = s."ownerId" OR (c."ownerId" IS NOT NULL AND n."userId" = c."ownerId"));
