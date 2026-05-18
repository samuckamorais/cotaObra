-- AlterTable: adiciona coluna de rastreio de qual job processou a cotação
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "processedBy" TEXT;
