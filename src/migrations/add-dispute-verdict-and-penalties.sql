-- Migration: Add verdict, buyerPenalty, merchantPenalty and resolvedByUserId to order_disputes
ALTER TABLE IF EXISTS order_disputes
ADD COLUMN IF NOT EXISTS "verdict" varchar(32) NULL,
ADD COLUMN IF NOT EXISTS "buyerPenalty" varchar(32) DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "merchantPenalty" varchar(32) DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "resolvedByUserId" uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_disputes_resolved_by_user'
  ) THEN
    ALTER TABLE order_disputes
    ADD CONSTRAINT fk_order_disputes_resolved_by_user
    FOREIGN KEY ("resolvedByUserId")
    REFERENCES users(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_disputes_verdict ON order_disputes("verdict");
