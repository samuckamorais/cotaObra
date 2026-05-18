-- Migration: add tenantId to all tables that require multi-tenant support
-- Strategy: add nullable, create default tenant, backfill, then enforce NOT NULL where required

-- ============================================================
-- 1. Criar tenant padrão para dados legados
-- ============================================================
INSERT INTO "tenants" ("id", "name", "slug", "email", "active", "createdAt", "updatedAt")
VALUES (
  'default-tenant-id',
  'Tenant Padrão',
  'default',
  NULL,
  true,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. producers — adicionar tenantId
-- ============================================================
ALTER TABLE "producers" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "producers" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "producers" ALTER COLUMN "tenantId" SET NOT NULL;

-- Remover unique constraints antigas baseadas só em phone/cpfCnpj
DROP INDEX IF EXISTS "producers_cpfCnpj_key";
DROP INDEX IF EXISTS "producers_phone_key";

-- Criar novas unique constraints incluindo tenantId
CREATE UNIQUE INDEX IF NOT EXISTS "producers_tenantId_cpfCnpj_key" ON "producers"("tenantId", "cpfCnpj");
CREATE UNIQUE INDEX IF NOT EXISTS "producers_tenantId_phone_key" ON "producers"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "producers_tenantId_idx" ON "producers"("tenantId");

-- AddForeignKey
ALTER TABLE "producers" ADD CONSTRAINT "producers_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 3. suppliers — adicionar tenantId (nullable no schema)
-- ============================================================
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "suppliers" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL AND "isNetworkSupplier" = false;

-- Remover unique constraint antiga
DROP INDEX IF EXISTS "suppliers_phone_key";

-- Criar nova unique constraint incluindo tenantId
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_tenantId_phone_key" ON "suppliers"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "suppliers_tenantId_idx" ON "suppliers"("tenantId");
CREATE INDEX IF NOT EXISTS "suppliers_rating_idx" ON "suppliers"("rating") WHERE "rating" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "suppliers_isNetworkSupplier_idx" ON "suppliers"("isNetworkSupplier");

-- AddForeignKey (nullable, onDelete Cascade)
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 4. producer_suppliers — adicionar tenantId
-- ============================================================
ALTER TABLE "producer_suppliers" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "producer_suppliers" ps
SET "tenantId" = p."tenantId"
FROM "producers" p
WHERE ps."producerId" = p."id" AND ps."tenantId" IS NULL;
UPDATE "producer_suppliers" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "producer_suppliers" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "producer_suppliers_tenantId_idx" ON "producer_suppliers"("tenantId");

ALTER TABLE "producer_suppliers" ADD CONSTRAINT "producer_suppliers_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 5. quotes — adicionar tenantId
-- ============================================================
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "quotes" q
SET "tenantId" = p."tenantId"
FROM "producers" p
WHERE q."producerId" = p."id" AND q."tenantId" IS NULL;
UPDATE "quotes" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "quotes" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "quotes_tenantId_idx" ON "quotes"("tenantId");
CREATE INDEX IF NOT EXISTS "quotes_tenantId_status_idx" ON "quotes"("tenantId", "status");

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 6. proposals — adicionar tenantId
-- ============================================================
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "proposals" pr
SET "tenantId" = q."tenantId"
FROM "quotes" q
WHERE pr."quoteId" = q."id" AND pr."tenantId" IS NULL;
UPDATE "proposals" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "proposals" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "proposals_tenantId_idx" ON "proposals"("tenantId");

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 7. subscriptions — adicionar tenantId
-- ============================================================
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "subscriptions" s
SET "tenantId" = p."tenantId"
FROM "producers" p
WHERE s."producerId" = p."id" AND s."tenantId" IS NULL;
UPDATE "subscriptions" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "subscriptions" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 8. conversation_states — adicionar tenantId
-- ============================================================
ALTER TABLE "conversation_states" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "conversation_states" cs
SET "tenantId" = p."tenantId"
FROM "producers" p
WHERE cs."producerId" = p."id" AND cs."tenantId" IS NULL;
UPDATE "conversation_states" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "conversation_states" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "conversation_states_tenantId_idx" ON "conversation_states"("tenantId");

ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 9. conversation_metrics — adicionar tenantId
-- ============================================================
ALTER TABLE "conversation_metrics" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "conversation_metrics" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "conversation_metrics" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "conversation_metrics_tenantId_idx" ON "conversation_metrics"("tenantId");

ALTER TABLE "conversation_metrics" ADD CONSTRAINT "conversation_metrics_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 10. experiments — adicionar tenantId, trocar unique constraint
-- ============================================================
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "experiments" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "experiments" ALTER COLUMN "tenantId" SET NOT NULL;

-- Remover unique antiga (só name) e criar composta (tenantId, name)
DROP INDEX IF EXISTS "experiments_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "experiments_tenantId_name_key" ON "experiments"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "experiments_tenantId_idx" ON "experiments"("tenantId");

ALTER TABLE "experiments" ADD CONSTRAINT "experiments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 11. experiment_assignments — adicionar tenantId
-- ============================================================
ALTER TABLE "experiment_assignments" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "experiment_assignments" ea
SET "tenantId" = e."tenantId"
FROM "experiments" e
WHERE ea."experimentId" = e."id" AND ea."tenantId" IS NULL;
UPDATE "experiment_assignments" SET "tenantId" = 'default-tenant-id' WHERE "tenantId" IS NULL;
ALTER TABLE "experiment_assignments" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "experiment_assignments_tenantId_idx" ON "experiment_assignments"("tenantId");

ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
