-- CreateTable
-- Add Tenant model for multi-tenant support
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- WhatsApp configuration per tenant
CREATE TABLE "whatsapp_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastHealthCheck" TIMESTAMP(3),
    "connectionError" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "messagesSentToday" INTEGER NOT NULL DEFAULT 0,
    "messagesReceivedToday" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "configuredBy" TEXT,
    "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Audit log for WhatsApp config changes
CREATE TABLE "whatsapp_config_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "performedBy" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_config_logs_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Add tenantId to User
ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");
CREATE INDEX "tenants_active_idx" ON "tenants"("active");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_tenantId_key" ON "whatsapp_configs"("tenantId");
CREATE INDEX "whatsapp_configs_tenantId_idx" ON "whatsapp_configs"("tenantId");
CREATE INDEX "whatsapp_configs_provider_idx" ON "whatsapp_configs"("provider");
CREATE INDEX "whatsapp_configs_isConnected_idx" ON "whatsapp_configs"("isConnected");

-- CreateIndex
CREATE INDEX "whatsapp_config_logs_tenantId_idx" ON "whatsapp_config_logs"("tenantId");
CREATE INDEX "whatsapp_config_logs_createdAt_idx" ON "whatsapp_config_logs"("createdAt");
CREATE INDEX "whatsapp_config_logs_performedBy_idx" ON "whatsapp_config_logs"("performedBy");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
