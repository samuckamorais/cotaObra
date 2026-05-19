-- CotaObra — CO-6-01 + CO-6-06: Approval workflow + PriceHistoryAggregate

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- =====================================================
-- Approval
-- =====================================================
CREATE TABLE "approvals" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "quoteId"           TEXT NOT NULL,
    "requestedById"     TEXT NOT NULL,
    "approverId"        TEXT,
    "status"            "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "thresholdAmount"   DECIMAL(14, 2) NOT NULL,
    "totalAmount"       DECIMAL(14, 2) NOT NULL,
    "closeQuotePayload" JSONB NOT NULL,
    "reason"            TEXT,
    "decidedAt"         TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "approvals_quoteId_key" ON "approvals"("quoteId");
CREATE INDEX "approvals_tenantId_status_idx" ON "approvals"("tenantId", "status");
CREATE INDEX "approvals_approverId_idx" ON "approvals"("approverId");

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approverId_fkey"
    FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================
-- PriceHistoryAggregate
-- =====================================================
CREATE TABLE "price_history_aggregate" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "materialId"  TEXT,
    "description" TEXT NOT NULL,
    "region"      TEXT NOT NULL,
    "period"      TEXT NOT NULL,
    "minPrice"    DECIMAL(14, 2) NOT NULL,
    "maxPrice"    DECIMAL(14, 2) NOT NULL,
    "avgPrice"    DECIMAL(14, 2) NOT NULL,
    "medianPrice" DECIMAL(14, 2) NOT NULL,
    "samples"     INTEGER NOT NULL,
    "paymentTermsBreakdown" JSONB,
    "computedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_aggregate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "price_history_aggregate_tenantId_materialId_description_region_period_key"
    ON "price_history_aggregate"("tenantId", "materialId", "description", "region", "period");
CREATE INDEX "price_history_aggregate_tenantId_materialId_period_idx"
    ON "price_history_aggregate"("tenantId", "materialId", "period");
CREATE INDEX "price_history_aggregate_tenantId_region_period_idx"
    ON "price_history_aggregate"("tenantId", "region", "period");

ALTER TABLE "price_history_aggregate" ADD CONSTRAINT "price_history_aggregate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
