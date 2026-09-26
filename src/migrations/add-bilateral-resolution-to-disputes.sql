-- Migración: Resolución bilateral de reclamos
-- Agrega campos para que tanto cliente como tienda voten explícitamente
-- que un reclamo fue resuelto. Cierre automático cuando ambos votos = true.

ALTER TABLE "order_disputes"
  ADD COLUMN IF NOT EXISTS "merchantMarkedResolved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "clientMarkedResolved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "merchantMarkedResolvedAt" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "clientMarkedResolvedAt" TIMESTAMP WITH TIME ZONE;

-- Agrega columnas de evidencia del mercante y timestamp de respuesta
-- si no existen (pueden no estar en instancias anteriores del schema)
ALTER TABLE "order_disputes"
  ADD COLUMN IF NOT EXISTS "merchantEvidenceUrls" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "merchantRespondedAt" TIMESTAMP WITH TIME ZONE;
