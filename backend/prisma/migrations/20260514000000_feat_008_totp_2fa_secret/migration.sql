-- FEAT-008 (FF-BE-031) — Coluna twoFactorSecret para TOTP.
--
-- Armazena o secret em base32 do TOTP (Google Authenticator/Authy/1Password).
-- A coluna fica vazia até o user concluir o /auth/2fa/setup-confirm, momento
-- em que: secret é persistido + twoFactorEnabled vira true.
--
-- Default null preserva users existentes — eles continuam sem 2FA (a menos
-- que sejam SUPER_ADMIN, caso em que o middleware require2FAEnrolledForSuperAdmin
-- vai bloqueá-los até o enrollment).

ALTER TABLE "users"
  ADD COLUMN "twoFactorSecret" TEXT;
