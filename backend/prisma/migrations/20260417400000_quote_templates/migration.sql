CREATE TABLE "quote_templates" (
  "id" TEXT NOT NULL,
  "producerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "region" TEXT,
  "freight" TEXT,
  "paymentTerms" TEXT,
  "supplierScope" TEXT DEFAULT 'ALL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_templates_producerId_idx" ON "quote_templates"("producerId");

ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "producers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
