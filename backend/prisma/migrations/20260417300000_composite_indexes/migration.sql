-- Quote composite indexes for common dashboard queries
CREATE INDEX IF NOT EXISTS "quotes_tenantId_status_idx" ON "quotes"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "quotes_producerId_createdAt_idx" ON "quotes"("producerId", "createdAt");

-- Proposal indexes
CREATE INDEX IF NOT EXISTS "proposals_createdAt_idx" ON "proposals"("createdAt");
CREATE INDEX IF NOT EXISTS "proposals_quoteId_createdAt_idx" ON "proposals"("quoteId", "createdAt");

-- ConversationMetric indexes (if table exists, use IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "conversation_metrics_tenantId_timestamp_idx" ON "conversation_metrics"("tenantId", "timestamp");
