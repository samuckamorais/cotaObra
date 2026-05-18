-- CotaObra — CO-1-10: adiciona Quote.siteId (nullable inicialmente).
--
-- Estratégia em 2 fases:
--   Fase 1 (esta migration): adiciona como NULLABLE com FK Restrict.
--     - Permite que jobs e FSM existentes continuem funcionando.
--     - Novo código (Site CRUD + Sprint 2 FSM) preenche siteId obrigatoriamente.
--
--   Fase 2 (Sprint 2, após FSM AWAITING_SITE_SELECTION estar em produção):
--     - Backfill: para cotações sem siteId, atrelar a "obra default" do tenant
--       (criada no onboarding) ou rejeitar via job se ambíguo.
--     - ALTER TABLE quotes ALTER COLUMN "siteId" SET NOT NULL.
--
-- FK Restrict: impede DELETE de Site com cotações associadas — preserva
-- histórico operacional.

ALTER TABLE "quotes" ADD COLUMN "siteId" TEXT;

ALTER TABLE "quotes"
    ADD CONSTRAINT "quotes_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "sites"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "quotes_siteId_idx" ON "quotes"("siteId");
