DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications_type_enum') THEN
    ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'COMMISSION_DEBT_REMINDER';
    ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'COMMISSION_PAYMENT_REVIEWED';
  END IF;
END$$;
