-- AlterTable: Add encrypted CPF/CNPJ fields to producers
ALTER TABLE "producers" ADD COLUMN "cpfCnpjHash" TEXT;
ALTER TABLE "producers" ADD COLUMN "cpfCnpjEncrypted" TEXT;

-- CreateIndex: Hash index for fast lookups
CREATE INDEX "producers_cpfCnpjHash_idx" ON "producers"("cpfCnpjHash");

-- AlterTable: Add encrypted CPF/CNPJ fields to suppliers
ALTER TABLE "suppliers" ADD COLUMN "cpfCnpjHash" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "cpfCnpjEncrypted" TEXT;

-- CreateIndex: Hash index for fast lookups
CREATE INDEX "suppliers_cpfCnpjHash_idx" ON "suppliers"("cpfCnpjHash");
