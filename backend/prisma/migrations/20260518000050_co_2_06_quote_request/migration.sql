-- CotaObra — CO-2-06: novo modelo QuoteRequest.
--
-- Pré-Quote criada pelo solicitante (REQUESTER) via WhatsApp ou form web.
-- Fica em fila de revisão (PENDING_REVIEW) até comprador promover/rejeitar.
--
-- Separar QuoteRequest vs Quote permite:
--   (a) rejeitar solicitação sem poluir histórico de Quote
--   (b) métrica "taxa de conversão de solicitação → cotação"
--   (c) manter o rawText para auditoria de NLU (Sprint 2 com GPT-4o)

CREATE TYPE "QuoteRequestStatus" AS ENUM ('PENDING_REVIEW', 'PROMOTED', 'REJECTED', 'EXPIRED');

CREATE TABLE "quote_requests" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "siteId"           TEXT NOT NULL,
    "requesterId"      TEXT NOT NULL,

    -- items: JSON array — { description, qty?, unit?, spec?, materialId? }
    "items"            JSONB NOT NULL,
    "deadlineAt"       TIMESTAMP(3),
    "observation"      TEXT,
    "source"           TEXT NOT NULL DEFAULT 'whatsapp',
    "rawText"          TEXT,

    "status"           "QuoteRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason"  TEXT,
    "promotedQuoteId"  TEXT,
    "promotedAt"       TIMESTAMP(3),
    "reviewedById"     TEXT,

    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_requests_tenantId_status_idx" ON "quote_requests"("tenantId", "status");
CREATE INDEX "quote_requests_siteId_idx"          ON "quote_requests"("siteId");
CREATE INDEX "quote_requests_requesterId_idx"     ON "quote_requests"("requesterId");
CREATE INDEX "quote_requests_createdAt_idx"       ON "quote_requests"("createdAt");

ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
