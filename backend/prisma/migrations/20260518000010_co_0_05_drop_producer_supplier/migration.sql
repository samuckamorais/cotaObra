-- CotaObra — CO-0-05: drop ProducerSupplier
--
-- Construtora não tem o conceito de "fornecedores preferidos por usuário" como
-- a fazenda agro tinha em ProducerSupplier (join Producer×Supplier×Tenant).
-- Na CotaObra, fornecedor pertence à construtora (tenant) via Supplier.tenantId
-- (1:N). A semântica de "MINE/NETWORK/ALL" é resolvida no nível tenant:
--   - MINE     → Supplier.tenantId = currentTenantId
--   - NETWORK  → Supplier.tenantId IS NULL AND isNetworkSupplier = true
--   - ALL      → união dos dois
--
-- Como o fork CotaObra inicia com banco vazio, simplesmente droppamos a tabela.

DROP TABLE IF EXISTS "producer_suppliers" CASCADE;
