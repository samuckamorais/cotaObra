-- FF-BE-011: mapeamento configurável produto → categoria.
-- Global (sem tenantId), com keyword única. Cache em memória no service.

CREATE TABLE "product_category_mappings" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_category_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_category_mappings_keyword_key" ON "product_category_mappings"("keyword");
CREATE INDEX "product_category_mappings_category_idx" ON "product_category_mappings"("category");
