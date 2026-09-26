-- Create Enums if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'division_enum') THEN
    CREATE TYPE division_enum AS ENUM (
      'HIERRO', 'BRONCE', 'PLATA', 'ORO', 'PLATINO', 'ESMERALDA', 'DIAMANTE', 'MAESTRO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ranking_event_type_enum') THEN
    CREATE TYPE ranking_event_type_enum AS ENUM (
      'ORDER_COMPLETED', 'ORDER_CANCELLED_BY_SELLER', 'REVIEW_5_STAR', 'REVIEW_4_STAR',
      'REVIEW_1_2_STAR', 'REVIEW_REPLY', 'DISPUTE_OPENED', 'DISPUTE_LOST', 'DISPUTE_WON',
      'STRIKE', 'SUBSCRIPTION_DEBT_WEEKLY', 'INACTIVITY_WEEKLY', 'PROFILE_COMPLETE',
      'STREAK_10_ORDERS', 'MONTHLY_NO_DISPUTES', 'ACHIEVEMENT_BONUS', 'MANUAL_ADJUSTMENT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'achievement_category_enum') THEN
    CREATE TYPE achievement_category_enum AS ENUM (
      'VELOCIDAD', 'REPUTACION', 'MILESTONES', 'CONFIABILIDAD', 'PROGRESION'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'achievement_trigger_type_enum') THEN
    CREATE TYPE achievement_trigger_type_enum AS ENUM (
      'ORDER_COUNT', 'REVIEW_COUNT', 'REVIEW_5_STAR_COUNT', 'NO_DISPUTES_DAYS',
      'STREAK_ORDERS', 'PROFILE_COMPLETE', 'DIVISION_REACHED'
    );
  END IF;

  -- Add new notification types to notifications_type_enum
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications_type_enum') THEN
    BEGIN
      ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'DIVISION_UP';
      ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'DIVISION_DOWN';
      ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'ACHIEVEMENT_UNLOCKED';
      ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'STORE_FLAGGED';
      ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'WEEKLY_RANKING_SUMMARY';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;
  END IF;
END$$;

-- 1. store_rankings
CREATE TABLE IF NOT EXISTS store_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storeId" uuid NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  "currentLP" int NOT NULL DEFAULT 0,
  division division_enum NOT NULL DEFAULT 'HIERRO',
  "isCalibrating" boolean NOT NULL DEFAULT true,
  "calibrationOrdersCompleted" int NOT NULL DEFAULT 0,
  "isFlagged" boolean NOT NULL DEFAULT false,
  "lastActivityDate" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_rankings_currentlp ON store_rankings("currentLP");
CREATE INDEX IF NOT EXISTS idx_store_rankings_division ON store_rankings(division);

-- 2. ranking_events
CREATE TABLE IF NOT EXISTS ranking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storeId" uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  "eventType" ranking_event_type_enum NOT NULL,
  "lpDelta" int NOT NULL,
  "referenceId" text,
  "buyerAccountId" uuid,
  "isVoided" boolean NOT NULL DEFAULT false,
  "antiCheatBlocked" boolean NOT NULL DEFAULT false,
  metadata jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ranking_events_store_id ON ranking_events("storeId");
CREATE INDEX IF NOT EXISTS idx_ranking_events_event_type ON ranking_events("eventType");
CREATE INDEX IF NOT EXISTS idx_ranking_events_buyer_account ON ranking_events("buyerAccountId");
CREATE INDEX IF NOT EXISTS idx_ranking_events_created_at ON ranking_events("createdAt");

-- 3. ranking_settings
CREATE TABLE IF NOT EXISTS ranking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lpValues" jsonb NOT NULL,
  "divisionThresholds" jsonb NOT NULL,
  calibration jsonb NOT NULL,
  "antiCheat" jsonb NOT NULL,
  inactivity jsonb NOT NULL,
  maestro jsonb NOT NULL,
  "divisionEmblems" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- 4. achievement_definitions
CREATE TABLE IF NOT EXISTS achievement_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  "imageUrl" text NOT NULL,
  "lpBonus" int NOT NULL DEFAULT 0,
  category achievement_category_enum NOT NULL DEFAULT 'MILESTONES',
  "triggerType" achievement_trigger_type_enum NOT NULL,
  "triggerThreshold" numeric NOT NULL DEFAULT 1,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- 5. store_achievement_unlocks
CREATE TABLE IF NOT EXISTS store_achievement_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storeId" uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  "achievementId" uuid NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
  "unlockedAt" timestamptz NOT NULL DEFAULT now(),
  "lpBonusGranted" int NOT NULL DEFAULT 0,
  CONSTRAINT uq_store_achievement UNIQUE ("storeId", "achievementId")
);

CREATE INDEX IF NOT EXISTS idx_store_achievement_unlocks_store ON store_achievement_unlocks("storeId");
CREATE INDEX IF NOT EXISTS idx_store_achievement_unlocks_achievement ON store_achievement_unlocks("achievementId");

-- 6. store_achievement_showcases
CREATE TABLE IF NOT EXISTS store_achievement_showcases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storeId" uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  "achievementId" uuid NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
  position int NOT NULL,
  CONSTRAINT uq_store_showcase_position UNIQUE ("storeId", position)
);

CREATE INDEX IF NOT EXISTS idx_store_showcase_store ON store_achievement_showcases("storeId");
