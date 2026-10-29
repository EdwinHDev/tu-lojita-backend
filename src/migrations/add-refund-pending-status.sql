DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payments_status_enum') THEN
    ALTER TYPE payments_status_enum ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications_type_enum') THEN
    ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'REFUND_REPORTED';
    ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'REFUND_CONFIRMED';
  END IF;
END$$;
