-- CreateTable
CREATE TABLE "quote_supplier_notifications" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_supplier_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_supplier_notifications_quoteId_supplierId_key" ON "quote_supplier_notifications"("quoteId", "supplierId");

-- CreateIndex
CREATE INDEX "quote_supplier_notifications_quoteId_idx" ON "quote_supplier_notifications"("quoteId");

-- AddForeignKey
ALTER TABLE "quote_supplier_notifications" ADD CONSTRAINT "quote_supplier_notifications_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_supplier_notifications" ADD CONSTRAINT "quote_supplier_notifications_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
