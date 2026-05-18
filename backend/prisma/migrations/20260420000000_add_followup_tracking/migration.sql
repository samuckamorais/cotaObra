-- Adicionar campos de follow-up ao modelo QuoteSupplierNotification
ALTER TABLE "quote_supplier_notifications" ADD COLUMN "followUpCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quote_supplier_notifications" ADD COLUMN "lastFollowUpAt" TIMESTAMP(3);
