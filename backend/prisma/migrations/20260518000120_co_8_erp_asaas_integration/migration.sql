-- CotaObra — CO-8-01 + CO-8-04: ERP webhook + Asaas billing fields

-- =====================================================
-- TenantSettings: campos para webhook ERP
-- =====================================================
ALTER TABLE "tenant_settings"
  ADD COLUMN "erpWebhookUrl"    TEXT,
  ADD COLUMN "erpWebhookSecret" TEXT,
  ADD COLUMN "erpAdapter"       TEXT DEFAULT 'generic';

-- =====================================================
-- Subscription: campos Asaas
-- =====================================================
ALTER TABLE "subscriptions"
  ADD COLUMN "asaasCustomerId"     TEXT,
  ADD COLUMN "asaasSubscriptionId" TEXT,
  ADD COLUMN "asaasBillingType"    TEXT;

CREATE UNIQUE INDEX "subscriptions_asaasSubscriptionId_key"
  ON "subscriptions"("asaasSubscriptionId")
  WHERE "asaasSubscriptionId" IS NOT NULL;
