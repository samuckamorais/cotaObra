-- Migration: add_quote_payment_terms
-- Adiciona campo paymentTerms (opcional) na tabela quotes

ALTER TABLE "quotes" ADD COLUMN "paymentTerms" TEXT;
