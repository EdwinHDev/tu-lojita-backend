-- Migración: create-company-collaborators-and-roles-tables.sql
-- Crea las tablas para el sistema dinámico de roles, permisos, colaboradores y asignación de sucursales.

-- 1. Tabla company_roles
CREATE TABLE IF NOT EXISTS "company_roles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "companyId" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "isSystemDefault" boolean NOT NULL DEFAULT false,
  CONSTRAINT "PK_company_roles_id" PRIMARY KEY ("id"),
  CONSTRAINT "FK_company_roles_company" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "UQ_company_roles_company_name" UNIQUE ("companyId", "name")
);

CREATE INDEX IF NOT EXISTS "IDX_company_roles_companyId" ON "company_roles" ("companyId");

-- 2. Tabla company_role_permissions
CREATE TABLE IF NOT EXISTS "company_role_permissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "roleId" uuid NOT NULL,
  "permission" text NOT NULL,
  CONSTRAINT "PK_company_role_permissions_id" PRIMARY KEY ("id"),
  CONSTRAINT "FK_company_role_permissions_role" FOREIGN KEY ("roleId") REFERENCES "company_roles"("id") ON DELETE CASCADE,
  CONSTRAINT "UQ_company_role_permissions_role_perm" UNIQUE ("roleId", "permission")
);

CREATE INDEX IF NOT EXISTS "IDX_company_role_permissions_roleId" ON "company_role_permissions" ("roleId");
CREATE INDEX IF NOT EXISTS "IDX_company_role_permissions_perm" ON "company_role_permissions" ("permission");

-- 3. Tabla company_collaborators
CREATE TABLE IF NOT EXISTS "company_collaborators" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "companyId" uuid NOT NULL,
  "roleId" uuid NOT NULL,
  "accessId" varchar(8) NOT NULL,
  "password" text NOT NULL,
  "firstName" text NOT NULL,
  "lastName" text NOT NULL,
  "identification" text,
  "phone" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "hasFullBranchAccess" boolean NOT NULL DEFAULT false,
  "tokenVersion" integer NOT NULL DEFAULT 1,
  CONSTRAINT "PK_company_collaborators_id" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_company_collaborators_accessId" UNIQUE ("accessId"),
  CONSTRAINT "FK_company_collaborators_company" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_company_collaborators_role" FOREIGN KEY ("roleId") REFERENCES "company_roles"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "IDX_company_collaborators_companyId" ON "company_collaborators" ("companyId");
CREATE INDEX IF NOT EXISTS "IDX_company_collaborators_roleId" ON "company_collaborators" ("roleId");
CREATE INDEX IF NOT EXISTS "IDX_company_collaborators_accessId" ON "company_collaborators" ("accessId");

-- 4. Tabla pivote collaborator_branches (relación muchos a muchos con stores)
CREATE TABLE IF NOT EXISTS "collaborator_branches" (
  "collaboratorId" uuid NOT NULL,
  "storeId" uuid NOT NULL,
  CONSTRAINT "PK_collaborator_branches" PRIMARY KEY ("collaboratorId", "storeId"),
  CONSTRAINT "FK_collaborator_branches_collab" FOREIGN KEY ("collaboratorId") REFERENCES "company_collaborators"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_collaborator_branches_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_collaborator_branches_collab" ON "collaborator_branches" ("collaboratorId");
CREATE INDEX IF NOT EXISTS "IDX_collaborator_branches_store" ON "collaborator_branches" ("storeId");

-- 5. Sembrar el rol base "Administrador" para todas las empresas existentes que aún no lo tengan
DO $$
DECLARE
  comp RECORD;
  new_role_id uuid;
  perm_key text;
  permissions_list text[] := ARRAY[
    'branches:view',
    'branches:manage',
    'orders:view',
    'orders:process',
    'orders:cancel',
    'orders:chat',
    'inventory:view',
    'inventory:manage_stock',
    'inventory:edit',
    'finances:view_summary',
    'finances:view_sensitive',
    'collaborators:manage'
  ];
BEGIN
  FOR comp IN SELECT id FROM "companies" LOOP
    -- Si la empresa no tiene el rol Administrador, crearlo
    IF NOT EXISTS (SELECT 1 FROM "company_roles" WHERE "companyId" = comp.id AND "name" = 'Administrador') THEN
      INSERT INTO "company_roles" ("companyId", "name", "description", "isSystemDefault")
      VALUES (comp.id, 'Administrador', 'Rol administrativo con acceso completo a las funciones operativas de la empresa.', true)
      RETURNING id INTO new_role_id;

      -- Asociar todos los permisos al rol
      FOREACH perm_key IN ARRAY permissions_list LOOP
        INSERT INTO "company_role_permissions" ("roleId", "permission")
        VALUES (new_role_id, perm_key)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;
