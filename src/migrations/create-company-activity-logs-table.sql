-- Migración: create-company-activity-logs-table.sql
-- Crea la tabla company_activity_logs para el registro de auditoría de actividades de la empresa.

CREATE TABLE IF NOT EXISTS "company_activity_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "companyId" uuid NOT NULL,
  "storeId" uuid,
  "actorType" varchar(20) NOT NULL,
  "actorId" uuid NOT NULL,
  "actorName" text NOT NULL,
  "actorRoleName" text NOT NULL,
  "module" varchar(30) NOT NULL,
  "action" varchar(50) NOT NULL,
  "description" text NOT NULL,
  "metadata" jsonb,
  CONSTRAINT "PK_company_activity_logs_id" PRIMARY KEY ("id"),
  CONSTRAINT "FK_company_activity_logs_company" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_company_activity_logs_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_company_activity_logs_company_created" ON "company_activity_logs" ("companyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IDX_company_activity_logs_store_created" ON "company_activity_logs" ("storeId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IDX_company_activity_logs_actor" ON "company_activity_logs" ("actorId");
CREATE INDEX IF NOT EXISTS "IDX_company_activity_logs_module" ON "company_activity_logs" ("module");

