-- CotaObra — CO-0-04: Migra ProducerSettings → TenantSettings + adiciona Tenant.cnpj
--
-- Estratégia: como o fork CotaObra inicia com banco vazio (sem dados de produção
-- migrados do cotaAgro), simplesmente:
--   1. DROPamos a tabela legacy `producer_settings`.
--   2. CRIAMOS a nova `tenant_settings`, vinculada a `tenants.id` com `@@unique`.
--   3. Adicionamos `tenants.cnpj` como NULLABLE (compatibilidade com seed).
--
-- Em ambiente real com dados migrados, este passo precisaria de um job
-- ETL para consolidar settings por tenant (escolhendo regras de merge quando
-- houver mais de um producer por tenant). Como o MVP CotaObra ainda não tem
-- dados, evitamos a complexidade.

-- 1. Adiciona Tenant.cnpj (nullable; pode ser preenchido depois)
ALTER TABLE "tenants" ADD COLUMN "cnpj" TEXT;

-- 2. Drop FK + tabela legacy
DROP TABLE IF EXISTS "producer_settings" CASCADE;

-- 3. Cria nova TenantSettings
CREATE TABLE "tenant_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    -- Campos herdados (compat com services existentes)
    "proposalLinkExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "quoteDeadlineDays" INTEGER NOT NULL DEFAULT 3,
    "defaultSupplierScope" "SupplierScope" NOT NULL DEFAULT 'ALL',
    "maxItemsPerQuote" INTEGER NOT NULL DEFAULT 10,
    "winnerNotificationType" TEXT NOT NULL DEFAULT 'NONE',
    "quoteExpiryHours" INTEGER NOT NULL DEFAULT 2,

    -- Campos novos CotaObra
    "defaultExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "defaultDeadlineDays" INTEGER NOT NULL DEFAULT 5,
    "approvalThreshold" DECIMAL(14, 2),
    "paymentPolicy" JSONB,
    "autoNotifyWinner" BOOLEAN NOT NULL DEFAULT true,
    "whatsappProvider" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_settings_tenantId_key" ON "tenant_settings"("tenantId");

ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
