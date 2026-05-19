-- CotaObra — CO-3-04: ProposalItem.available para indicar se fornecedor
-- consegue entregar aquele item. Pricing engine (Sprint 4) ignora itens
-- não-disponíveis ao calcular correctedTotal.

ALTER TABLE "proposal_items"
  ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true;
