DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications_type_enum') THEN
    ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'DISPUTE_ESCALATED';
  END IF;
END$$;
