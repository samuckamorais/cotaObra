-- CreateTable: estado da conversa do fornecedor persistido em PostgreSQL
-- Substitui armazenamento exclusivo em Redis por write-through com fallback resiliente

CREATE TABLE "supplier_conversation_states" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "tenantId" TEXT,
    "quoteId" TEXT,
    "step" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_conversation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unicidade por fornecedor (um estado ativo por vez)
CREATE UNIQUE INDEX "supplier_conversation_states_supplierId_key"
    ON "supplier_conversation_states"("supplierId");

-- CreateIndex: busca por fornecedor + cotação
CREATE INDEX "supplier_conversation_states_supplierId_quoteId_idx"
    ON "supplier_conversation_states"("supplierId", "quoteId");

-- CreateIndex: limpeza de estados expirados (job diário)
CREATE INDEX "supplier_conversation_states_expiresAt_idx"
    ON "supplier_conversation_states"("expiresAt");

-- AddForeignKey
ALTER TABLE "supplier_conversation_states"
    ADD CONSTRAINT "supplier_conversation_states_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
