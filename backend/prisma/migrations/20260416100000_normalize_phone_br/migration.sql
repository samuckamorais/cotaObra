-- Normalização de telefones brasileiros para formato canônico +55DDXXXXXXXXX (com 9º dígito)
-- Esta migration atualiza telefones existentes nas tabelas producers e suppliers.
--
-- Lógica:
-- 1. Remove caracteres não-numéricos (exceto +)
-- 2. Se tem 12 dígitos (+55 + DDD + 8 dígitos) → insere 9 após DDD
-- 3. Se já tem 13 dígitos (+55 + DDD + 9 dígitos) → mantém
--
-- Exemplos de transformação:
--   +556499999999  → +5564999999999  (8 dígitos → insere 9)
--   +5564999999999 → +5564999999999  (já correto)
--   (64)99999-9999 → +5564999999999  (limpa e normaliza)

-- ── Producers ──────────────────────────────────────────────────────────────────

-- Primeiro: limpar formatação (remover tudo exceto dígitos e +)
UPDATE "producers"
SET "phone" = regexp_replace("phone", '[^0-9+]', '', 'g')
WHERE "phone" ~ '[^0-9+]';

-- Segundo: adicionar +55 se estiver faltando o DDI
UPDATE "producers"
SET "phone" = '+55' || "phone"
WHERE "phone" !~ '^\+' AND length(regexp_replace("phone", '[^0-9]', '', 'g')) >= 10;

-- Terceiro: adicionar + se começa com 55 sem +
UPDATE "producers"
SET "phone" = '+' || "phone"
WHERE "phone" ~ '^55\d{10,11}$';

-- Quarto: inserir 9º dígito em celulares com 8 dígitos (formato +55DD XXXXXXXX → +55DD 9XXXXXXXX)
UPDATE "producers"
SET "phone" = substring("phone" from 1 for 5) || '9' || substring("phone" from 6)
WHERE "phone" ~ '^\+55\d{10}$';

-- ── Suppliers ──────────────────────────────────────────────────────────────────

UPDATE "suppliers"
SET "phone" = regexp_replace("phone", '[^0-9+]', '', 'g')
WHERE "phone" ~ '[^0-9+]';

UPDATE "suppliers"
SET "phone" = '+55' || "phone"
WHERE "phone" !~ '^\+' AND length(regexp_replace("phone", '[^0-9]', '', 'g')) >= 10;

UPDATE "suppliers"
SET "phone" = '+' || "phone"
WHERE "phone" ~ '^55\d{10,11}$';

UPDATE "suppliers"
SET "phone" = substring("phone" from 1 for 5) || '9' || substring("phone" from 6)
WHERE "phone" ~ '^\+55\d{10}$';
