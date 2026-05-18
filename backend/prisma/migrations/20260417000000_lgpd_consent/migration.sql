-- AlterTable: Add LGPD consent fields to producers
ALTER TABLE "producers" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "producers" ADD COLUMN "consentVersion" TEXT;

-- AlterTable: Add LGPD consent fields to suppliers
ALTER TABLE "suppliers" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "suppliers" ADD COLUMN "consentVersion" TEXT;
