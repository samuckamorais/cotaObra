-- CotaObra — CO-4-01: campos do pricing-engine no Proposal.
--
-- correctedTotal: preço corrigido pelo pricing engine (base + frete +
--                 custo financeiro + ajuste de prazo).
-- breakdown: JSON com os 4 componentes do correctedTotal (tooltip UI).
-- rank: posição no ranking corrigido (1 = vencedor).
-- freightMode/freightValue: armazenam CIF/FOB e valor de frete para o engine.

ALTER TABLE "proposals"
  ADD COLUMN "freightMode"    TEXT,
  ADD COLUMN "freightValue"   DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN "correctedTotal" DECIMAL(14, 2),
  ADD COLUMN "breakdown"      JSONB,
  ADD COLUMN "rank"           INTEGER;

CREATE INDEX "proposals_quoteId_rank_idx" ON "proposals"("quoteId", "rank");
