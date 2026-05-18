-- Adiciona configuração de tempo de expiração da cotação (em horas)
ALTER TABLE "producer_settings" ADD COLUMN IF NOT EXISTS "quoteExpiryHours" INTEGER NOT NULL DEFAULT 2;
