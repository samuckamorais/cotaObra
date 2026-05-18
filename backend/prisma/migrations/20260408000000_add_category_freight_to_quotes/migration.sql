-- AlterTable: adiciona campos category e freight à tabela quotes
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "freight" TEXT;
