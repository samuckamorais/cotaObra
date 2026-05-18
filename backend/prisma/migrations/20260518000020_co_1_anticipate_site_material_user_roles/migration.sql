-- CotaObra — Antecipa do Sprint 1: Site, Material, User.siteIds/phone, roles novos.
--
-- Por que antecipar:
--   1. seed.ts do dev-bootstrap referencia estes modelos; sem eles `pnpm seed`
--      quebra na primeira chamada de prisma.material.upsert.
--   2. Custo marginal de adicionar agora é baixo (sem dados de produção).
--   3. Sprint 1 vai construir o CRUD em cima, mas o schema já estará pronto.
--
-- Refs: PLANO_DE_FORK.md §3, ARQUITETURA §5, dev-bootstrap/seed.ts.

-- ====================================================================
-- 1) Enum SiteStatus (novo)
-- ====================================================================
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- ====================================================================
-- 2) Enum UserRole — adicionar BUYER, REQUESTER, APPROVER
--    (mantém SUPER_ADMIN, ADMIN, USER existentes)
-- ====================================================================
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BUYER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'REQUESTER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'APPROVER';

-- ====================================================================
-- 3) Enum Resource — adicionar SITES, MATERIALS, APPROVALS, PURCHASE_ORDERS
-- ====================================================================
ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS 'SITES';
ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS 'MATERIALS';
ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS 'APPROVALS';
ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDERS';

-- ====================================================================
-- 4) User — adicionar phone e siteIds (default array vazio)
-- ====================================================================
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "siteIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ====================================================================
-- 5) Site
-- ====================================================================
CREATE TABLE "sites" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "cno"          TEXT,
    "address"      TEXT,
    "city"         TEXT NOT NULL,
    "state"        TEXT NOT NULL,
    "zip"          TEXT,
    "region"       TEXT NOT NULL,
    "manager"      TEXT,
    "managerPhone" TEXT,
    "budget"       DECIMAL(14, 2),
    "status"       "SiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "startAt"      TIMESTAMP(3),
    "endAt"        TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sites_tenantId_idx"           ON "sites"("tenantId");
CREATE INDEX "sites_tenantId_status_idx"    ON "sites"("tenantId", "status");
CREATE INDEX "sites_city_state_idx"         ON "sites"("city", "state");

ALTER TABLE "sites" ADD CONSTRAINT "sites_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ====================================================================
-- 6) Material
-- ====================================================================
CREATE TABLE "materials" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT,            -- nullable: rede compartilhada quando null
    "sku"         TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "category"    TEXT NOT NULL,
    "defaultUnit" TEXT NOT NULL,
    "spec"        TEXT,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- Unique composta (tenantId, sku) — Postgres trata NULL como distinto por padrão,
-- então catálogo da rede (tenantId=null) tem que ser garantido em código.
-- Para garantir unicidade do SKU global compartilhado quando tenantId IS NULL,
-- usamos um índice parcial.
CREATE UNIQUE INDEX "materials_tenantId_sku_key" ON "materials"("tenantId", "sku");
CREATE UNIQUE INDEX "materials_global_sku_key"
    ON "materials"("sku")
    WHERE "tenantId" IS NULL;

CREATE INDEX "materials_tenantId_idx" ON "materials"("tenantId");
CREATE INDEX "materials_category_idx" ON "materials"("category");

ALTER TABLE "materials" ADD CONSTRAINT "materials_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
