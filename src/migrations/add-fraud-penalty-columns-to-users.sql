ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS "consecutiveRejectedPaymentsCount" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastRejectedPaymentAt" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "consecutiveApprovedPaymentsCount" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "accountSuspendedUntil" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "accountSuspensionReason" text;
