-- Migración idempotente: Gobernanza global de IA, bóveda por tienda y permisos de colaboradores por sucursal

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Claves globales en platform_settings
INSERT INTO platform_settings (key, value, "updatedAt")
VALUES
  ('ai_image_enhancement_enabled', 'true', NOW()),
  ('ai_gemini_model', 'gemini-2.5-flash-image', NOW())
ON CONFLICT (key) DO NOTHING;

-- 2. Tabla de presets oficiales gestionados desde el Admin Web
CREATE TABLE IF NOT EXISTS ai_prompt_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(80) NOT NULL,
  prompt TEXT NOT NULL,
  description TEXT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IDX_ai_prompt_presets_active_order"
  ON ai_prompt_presets ("isActive", "sortOrder");

-- 3. Bóveda de configuración de IA aislada 1:1 por tienda
CREATE TABLE IF NOT EXISTS store_ai_settings (
  "storeId" UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  "isEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "encryptedApiKey" TEXT NULL,
  "apiKeyHint" VARCHAR(32) NULL,
  "customPrompts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "dailyLimit" INTEGER NOT NULL DEFAULT 50,
  "usageCountToday" INTEGER NOT NULL DEFAULT 0,
  "usageDate" VARCHAR(10) NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabla pivote de sucursales donde un colaborador con edición de inventario puede usar IA
CREATE TABLE IF NOT EXISTS collaborator_ai_branches (
  "collaboratorId" UUID NOT NULL REFERENCES company_collaborators(id) ON DELETE CASCADE,
  "storeId" UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY ("collaboratorId", "storeId")
);

CREATE INDEX IF NOT EXISTS "IDX_collaborator_ai_branches_collaboratorId"
  ON collaborator_ai_branches ("collaboratorId");

CREATE INDEX IF NOT EXISTS "IDX_collaborator_ai_branches_storeId"
  ON collaborator_ai_branches ("storeId");
