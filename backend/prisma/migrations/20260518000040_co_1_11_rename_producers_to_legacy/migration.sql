-- CotaObra — CO-1-11: renomeia tabela "producers" para "_legacy_producers".
--
-- Sinaliza que o model Producer está deprecated e prepara remoção definitiva
-- na Sprint 3 (após FSM Sprint 2 migrar para User + REQUESTER + Site).
--
-- Foreign keys de Quote e demais tabelas que referenciam producers seguem
-- válidas — apenas a tabela física muda de nome. Postgres atualiza as
-- referências automaticamente em FKs já criadas; este script é apenas
-- RENAME TABLE.

ALTER TABLE "producers" RENAME TO "_legacy_producers";
