-- CotaObra — CO-3-07: tracking de delivery/read receipts WhatsApp.
--
-- Webhook do provider (Twilio/Evolution) emite eventos de status que
-- atualizam estes campos. Frontend (CO-3-09) consome para mostrar chip
-- colorido por fornecedor no QuoteDetail.

ALTER TABLE "quote_supplier_notifications"
  ADD COLUMN "deliveryStatus" TEXT DEFAULT 'SENT',
  ADD COLUMN "deliveredAt"    TIMESTAMP(3),
  ADD COLUMN "readAt"         TIMESTAMP(3),
  ADD COLUMN "errorMsg"       TEXT;

CREATE INDEX "quote_supplier_notifications_deliveryStatus_idx"
  ON "quote_supplier_notifications"("deliveryStatus");
