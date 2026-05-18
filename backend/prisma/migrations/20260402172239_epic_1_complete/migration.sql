-- AlterTable
-- Add lastQuotePreferences to Producer for repeat quote functionality (US 1.1)
ALTER TABLE "producers" ADD COLUMN "lastQuotePreferences" JSONB;

-- AlterTable
-- Add rating and proposal counters to Supplier for feedback loop (US 1.3 + 1.5)
ALTER TABLE "suppliers" ADD COLUMN "rating" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "suppliers" ADD COLUMN "totalProposals" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "suppliers" ADD COLUMN "acceptedProposals" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
-- Add index on rating for sorting suppliers by rating
CREATE INDEX "suppliers_rating_idx" ON "suppliers"("rating");
