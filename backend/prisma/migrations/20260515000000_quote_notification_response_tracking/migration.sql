-- FEAT-EARLY-CLOSE — Rastrear quando/como cada fornecedor convidado
-- respondeu a uma cotação, para permitir consolidação antecipada quando
-- todos já responderam (sem esperar o expiresAt).
--
-- responseType: 'PROPOSAL' quando enviou proposta; 'DECLINED' quando
-- recusou formalmente. NULL quando ainda não respondeu.
-- respondedAt: timestamp da resposta. NULL quando ainda não respondeu.
--
-- Ambos nullable + sem default => ALTER TABLE ADD COLUMN é metadata-only
-- no Postgres recente. Sem table-rewrite.

ALTER TABLE "quote_supplier_notifications"
  ADD COLUMN "respondedAt"  TIMESTAMP(3),
  ADD COLUMN "responseType" TEXT;

-- Índice por respondedAt acelera as queries de "todos respondidos?".
-- Não muito grande (tabela cresce ~5-15 rows por cotação).
CREATE INDEX "quote_supplier_notifications_quoteId_respondedAt_idx"
  ON "quote_supplier_notifications"("quoteId", "respondedAt");
