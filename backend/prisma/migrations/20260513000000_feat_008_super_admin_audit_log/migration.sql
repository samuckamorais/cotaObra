-- FEAT-008 (FF-BE-027) — Super Admin Global + Cadastro Direto
--
-- Schema changes:
--   1) UserRole ganha SUPER_ADMIN (operador cross-tenant).
--   2) User ganha campos para "força troca de senha" (criada/resetada
--      pelo super admin):
--        - mustChangePassword  (default false: preserva users existentes)
--        - passwordChangedAt   (nullable)
--        - passwordCreatedById (nullable, FK → users.id, SetNull no delete)
--   3) Nova tabela audit_logs — imutável, sem delete físico, registra
--      ações sensíveis (especialmente do SUPER_ADMIN).
--
-- Migration aplicada com PostgreSQL >= 12. Campos novos têm default
-- nullable/false para evitar table-rewrite — `ALTER TABLE ... ADD COLUMN`
-- com default constante é metadata-only no Postgres recente.

-- 1) Estende enum UserRole
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN' BEFORE 'ADMIN';

-- 2) Novas colunas em users
ALTER TABLE "users"
  ADD COLUMN "mustChangePassword"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "passwordChangedAt"   TIMESTAMP(3),
  ADD COLUMN "passwordCreatedById" TEXT;

-- FK auto-referencial: quem (super admin) criou/resetou a senha.
-- SetNull preserva a referência histórica em AuditLog mesmo se o
-- super admin for inativado/removido depois.
ALTER TABLE "users"
  ADD CONSTRAINT "users_passwordCreatedById_fkey"
  FOREIGN KEY ("passwordCreatedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_passwordCreatedById_idx"
  ON "users"("passwordCreatedById");

-- 3) Tabela audit_logs
CREATE TABLE "audit_logs" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "targetType"  TEXT,
    "targetId"    TEXT,
    "tenantId"    TEXT,
    "reason"      TEXT,
    "payload"     JSONB,
    "ip"          TEXT,
    "userAgent"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "audit_logs_userId_createdAt_idx"
  ON "audit_logs"("userId", "createdAt");
CREATE INDEX "audit_logs_targetType_targetId_idx"
  ON "audit_logs"("targetType", "targetId");
CREATE INDEX "audit_logs_tenantId_createdAt_idx"
  ON "audit_logs"("tenantId", "createdAt");
