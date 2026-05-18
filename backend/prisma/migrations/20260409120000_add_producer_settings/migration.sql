-- Migration: add_producer_settings
-- Cria tabela de configurações por produtor com valores padrão

CREATE TABLE "producer_settings" (
  "id"                      TEXT NOT NULL,
  "producerId"              TEXT NOT NULL,
  "proposalLinkExpiryHours" INTEGER NOT NULL DEFAULT 24,
  "quoteDeadlineDays"       INTEGER NOT NULL DEFAULT 3,
  "defaultSupplierScope"    TEXT NOT NULL DEFAULT 'ALL',
  "maxItemsPerQuote"        INTEGER NOT NULL DEFAULT 10,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL,

  CONSTRAINT "producer_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "producer_settings_producerId_key" UNIQUE ("producerId"),
  CONSTRAINT "producer_settings_producerId_fkey" FOREIGN KEY ("producerId")
    REFERENCES "producers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
