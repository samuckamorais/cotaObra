-- AlterTable
-- Add preferences field to Producer for notification settings and proactive features (US 2.3)
ALTER TABLE "producers" ADD COLUMN "preferences" JSONB;
