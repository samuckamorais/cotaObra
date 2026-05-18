-- Adiciona configuração de notificação automática ao fornecedor vencedor
ALTER TABLE "producer_settings" ADD COLUMN IF NOT EXISTS "winnerNotificationType" TEXT NOT NULL DEFAULT 'NONE';
