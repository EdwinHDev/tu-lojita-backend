-- Creación de enums para disputas (si no existen)
DO $$ BEGIN
    CREATE TYPE "order_disputes_type_enum" AS ENUM ('REFUND', 'QUALITY_ISSUE', 'NOT_DELIVERED', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "order_disputes_status_enum" AS ENUM ('OPEN', 'MERCHANT_RESPONDED', 'ADMIN_REVIEW', 'RESOLVED', 'REFUNDED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "order_disputes_resolution_enum" AS ENUM ('REFUND', 'KEEP', 'PARTIAL_REFUND');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabla order_disputes
CREATE TABLE IF NOT EXISTS "order_disputes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "orderId" uuid NOT NULL,
  "requestedById" uuid NOT NULL,
  "type" "order_disputes_type_enum" NOT NULL DEFAULT 'OTHER',
  "status" "order_disputes_status_enum" NOT NULL DEFAULT 'OPEN',
  "description" text NOT NULL,
  "merchantResponse" text,
  "adminNote" text,
  "resolution" "order_disputes_resolution_enum",
  "resolvedAt" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "PK_order_disputes_id" PRIMARY KEY ("id"),
  CONSTRAINT "FK_order_disputes_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_order_disputes_user" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Índices para optimización de consultas
CREATE INDEX IF NOT EXISTS "IDX_order_disputes_orderId" ON "order_disputes" ("orderId");
CREATE INDEX IF NOT EXISTS "IDX_order_disputes_requestedById" ON "order_disputes" ("requestedById");
CREATE INDEX IF NOT EXISTS "IDX_order_disputes_status" ON "order_disputes" ("status");
