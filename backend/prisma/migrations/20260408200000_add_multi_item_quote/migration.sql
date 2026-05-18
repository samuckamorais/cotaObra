-- Migration: add_multi_item_quote
-- Adiciona suporte a cotações com múltiplos itens por cotação

-- 1. Tornar campos legados do Quote opcionais (nullable)
ALTER TABLE "quotes" ALTER COLUMN "product" DROP NOT NULL;
ALTER TABLE "quotes" ALTER COLUMN "quantity" DROP NOT NULL;
ALTER TABLE "quotes" ALTER COLUMN "unit" DROP NOT NULL;

-- 2. Criar tabela quote_items
CREATE TABLE "quote_items" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid(),
  "quoteId"           TEXT NOT NULL,
  "product"           TEXT NOT NULL,
  "quantity"          DOUBLE PRECISION NOT NULL,
  "unit"              TEXT NOT NULL,
  "winningSupplierId" TEXT,

  CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId")
    REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");

-- 3. Migrar dados existentes: criar 1 QuoteItem por Quote legada
INSERT INTO "quote_items" ("id", "quoteId", "product", "quantity", "unit")
SELECT
  gen_random_uuid(),
  id,
  product,
  CASE
    WHEN quantity ~ '^[0-9]+(\.[0-9]+)?$' THEN quantity::DOUBLE PRECISION
    ELSE 1.0
  END,
  unit
FROM "quotes"
WHERE product IS NOT NULL AND quantity IS NOT NULL AND unit IS NOT NULL;

-- 4. Adicionar coluna isPartial na Proposal
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "isPartial" BOOLEAN NOT NULL DEFAULT false;

-- 5. Criar tabela proposal_items
CREATE TABLE "proposal_items" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "proposalId"  TEXT NOT NULL,
  "quoteItemId" TEXT NOT NULL,
  "unitPrice"   DOUBLE PRECISION NOT NULL,
  "totalPrice"  DOUBLE PRECISION NOT NULL,

  CONSTRAINT "proposal_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "proposal_items_proposalId_quoteItemId_key" UNIQUE ("proposalId", "quoteItemId"),
  CONSTRAINT "proposal_items_proposalId_fkey" FOREIGN KEY ("proposalId")
    REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "proposal_items_quoteItemId_fkey" FOREIGN KEY ("quoteItemId")
    REFERENCES "quote_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "proposal_items_proposalId_idx" ON "proposal_items"("proposalId");
CREATE INDEX "proposal_items_quoteItemId_idx" ON "proposal_items"("quoteItemId");

-- 6. Criar tabela proposal_tokens
CREATE TABLE "proposal_tokens" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
  "token"      TEXT NOT NULL,
  "quoteId"    TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "used"       BOOLEAN NOT NULL DEFAULT false,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "proposal_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "proposal_tokens_token_key" UNIQUE ("token"),
  CONSTRAINT "proposal_tokens_quoteId_fkey" FOREIGN KEY ("quoteId")
    REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "proposal_tokens_supplierId_fkey" FOREIGN KEY ("supplierId")
    REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "proposal_tokens_token_idx" ON "proposal_tokens"("token");
CREATE INDEX "proposal_tokens_quoteId_supplierId_idx" ON "proposal_tokens"("quoteId", "supplierId");
