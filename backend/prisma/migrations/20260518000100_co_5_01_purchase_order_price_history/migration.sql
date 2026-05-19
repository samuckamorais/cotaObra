-- CotaObra — CO-5-01: PurchaseOrder + PurchaseOrderItem + PriceHistoryRaw

CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'EMITTED', 'CANCELLED');

-- ===================================================================
-- PurchaseOrder (ordem de compra)
-- ===================================================================
CREATE TABLE "purchase_orders" (
    "id"                    TEXT NOT NULL,
    "tenantId"              TEXT NOT NULL,
    "number"                INTEGER NOT NULL,
    "quoteId"               TEXT NOT NULL,
    "supplierId"            TEXT NOT NULL,
    "totalValue"            DECIMAL(14, 2) NOT NULL,
    "paymentTerms"          TEXT NOT NULL,
    "deliveryDays"          INTEGER NOT NULL,
    "freightMode"           TEXT,
    "freightValue"          DECIMAL(14, 2),
    "observations"          TEXT,
    "status"                "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfUrl"                TEXT,
    "pdfPath"               TEXT,
    "pdfGeneratedAt"        TIMESTAMP(3),
    "parentPurchaseOrderId" TEXT,
    "createdById"           TEXT,
    "approvedById"          TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_orders_tenantId_number_key" ON "purchase_orders"("tenantId", "number");
CREATE INDEX "purchase_orders_tenantId_status_idx" ON "purchase_orders"("tenantId", "status");
CREATE INDEX "purchase_orders_quoteId_idx" ON "purchase_orders"("quoteId");
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_parentPurchaseOrderId_fkey"
    FOREIGN KEY ("parentPurchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===================================================================
-- PurchaseOrderItem
-- ===================================================================
CREATE TABLE "purchase_order_items" (
    "id"              TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "quoteItemId"     TEXT,
    "description"     TEXT NOT NULL,
    "qty"             DECIMAL(14, 4) NOT NULL,
    "unit"            TEXT NOT NULL,
    "unitPrice"       DECIMAL(14, 2) NOT NULL,
    "totalPrice"      DECIMAL(14, 2) NOT NULL,
    "spec"            TEXT,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_order_items_purchaseOrderId_idx" ON "purchase_order_items"("purchaseOrderId");

ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===================================================================
-- PriceHistoryRaw — alimenta relatórios de evolução de preços (Sprint 7)
-- ===================================================================
CREATE TABLE "price_history_raw" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "materialId"   TEXT,
    "supplierId"   TEXT NOT NULL,
    "siteId"       TEXT,
    "description"  TEXT NOT NULL,
    "region"       TEXT NOT NULL,
    "unit"         TEXT NOT NULL,
    "unitPrice"    DECIMAL(14, 2) NOT NULL,
    "qty"          DECIMAL(14, 4) NOT NULL,
    "paymentTerms" TEXT,
    "wasWinner"    BOOLEAN NOT NULL DEFAULT false,
    "observedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quoteId"      TEXT NOT NULL,
    "proposalId"   TEXT,

    CONSTRAINT "price_history_raw_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "price_history_raw_tenantId_materialId_observedAt_idx"
    ON "price_history_raw"("tenantId", "materialId", "observedAt");
CREATE INDEX "price_history_raw_tenantId_region_observedAt_idx"
    ON "price_history_raw"("tenantId", "region", "observedAt");
CREATE INDEX "price_history_raw_supplierId_idx" ON "price_history_raw"("supplierId");

ALTER TABLE "price_history_raw" ADD CONSTRAINT "price_history_raw_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_history_raw" ADD CONSTRAINT "price_history_raw_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "price_history_raw" ADD CONSTRAINT "price_history_raw_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_history_raw" ADD CONSTRAINT "price_history_raw_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
