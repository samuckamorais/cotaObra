-- Adiciona coluna de princípio ativo nos itens de cotação (apenas para categoria Defensivos)
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "activeIngredient" TEXT;
