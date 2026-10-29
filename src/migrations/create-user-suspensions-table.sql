-- 1. Crear tipos ENUM requeridos si no existen
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_suspensions_type_enum') THEN
        CREATE TYPE "user_suspensions_type_enum" AS ENUM ('TEMPORARY', 'PERMANENT');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_suspensions_status_enum') THEN
        CREATE TYPE "user_suspensions_status_enum" AS ENUM ('ACTIVE', 'LIFTED', 'EXPIRED');
    END IF;
END $$;

-- 2. Extender el enum de estado de apelación con MORE_INFO_REQUESTED si aún no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumtypid = 'suspension_appeals_status_enum'::regtype 
          AND enumlabel = 'MORE_INFO_REQUESTED'
    ) THEN
        ALTER TYPE "suspension_appeals_status_enum" ADD VALUE 'MORE_INFO_REQUESTED';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Crear tabla user_suspensions
CREATE TABLE IF NOT EXISTS user_suspensions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type "user_suspensions_type_enum" DEFAULT 'TEMPORARY' NOT NULL,
    reason text NOT NULL,
    "suspendedUntil" timestamp with time zone,
    status "user_suspensions_status_enum" DEFAULT 'ACTIVE' NOT NULL,
    "createdById" uuid REFERENCES users(id) ON DELETE SET NULL,
    "liftedAt" timestamp with time zone,
    "liftedById" uuid REFERENCES users(id) ON DELETE SET NULL,
    "liftedReason" text
);

-- 4. Agregar currentSuspensionId a la tabla users
ALTER TABLE IF EXISTS users
ADD COLUMN IF NOT EXISTS "currentSuspensionId" uuid REFERENCES user_suspensions(id) ON DELETE SET NULL;

-- 5. Agregar suspensionId y columnas de soporte extendido a suspension_appeals
ALTER TABLE IF EXISTS suspension_appeals
ADD COLUMN IF NOT EXISTS "suspensionId" uuid REFERENCES user_suspensions(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS "requestedInfo" text,
ADD COLUMN IF NOT EXISTS "additionalInfo" text,
ADD COLUMN IF NOT EXISTS "additionalEvidenceUrls" text[] DEFAULT '{}' NOT NULL,
ADD COLUMN IF NOT EXISTS "allowReappeal" boolean DEFAULT false NOT NULL;

-- 6. Índices para rendimiento
CREATE INDEX IF NOT EXISTS "IDX_user_suspensions_userId" ON user_suspensions("userId");
CREATE INDEX IF NOT EXISTS "IDX_user_suspensions_status" ON user_suspensions(status);
CREATE INDEX IF NOT EXISTS "IDX_suspension_appeals_suspensionId" ON suspension_appeals("suspensionId");

-- 7. Backfill: Crear casos de suspensión para usuarios actualmente suspendidos
DO $$
DECLARE
    u RECORD;
    new_susp_id uuid;
BEGIN
    FOR u IN 
        SELECT id, "currentSuspensionId", "accountSuspendedUntil", "accountSuspensionReason", "isActive"
        FROM users
        WHERE ("accountSuspendedUntil" IS NOT NULL AND "accountSuspendedUntil" > now())
           OR ("isActive" = false AND "accountSuspensionReason" IS NOT NULL)
    LOOP
        IF u."currentSuspensionId" IS NULL THEN
            INSERT INTO user_suspensions (
                "userId",
                type,
                reason,
                "suspendedUntil",
                status
            ) VALUES (
                u.id,
                CASE WHEN u."accountSuspendedUntil" IS NOT NULL THEN 'TEMPORARY'::"user_suspensions_type_enum" ELSE 'PERMANENT'::"user_suspensions_type_enum" END,
                COALESCE(u."accountSuspensionReason", 'Suspensión disciplinaria previa'),
                u."accountSuspendedUntil",
                'ACTIVE'::"user_suspensions_status_enum"
            ) RETURNING id INTO new_susp_id;

            UPDATE users
            SET "currentSuspensionId" = new_susp_id
            WHERE id = u.id;
        END IF;
    END LOOP;
END $$;

-- 8. Backfill para apelaciones huérfanas: vincular a la suspensión activa del usuario si existe
UPDATE suspension_appeals sa
SET "suspensionId" = u."currentSuspensionId"
FROM users u
WHERE sa."userId" = u.id 
  AND sa."suspensionId" IS NULL 
  AND u."currentSuspensionId" IS NOT NULL;
