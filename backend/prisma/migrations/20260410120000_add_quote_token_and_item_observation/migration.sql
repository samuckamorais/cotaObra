-- Add observation column to quote_items
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "observation" TEXT;

-- Create quote_tokens table
CREATE TABLE IF NOT EXISTS "quote_tokens" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "producerId" TEXT NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quote_tokens_token_key" ON "quote_tokens"("token");
CREATE INDEX IF NOT EXISTS "quote_tokens_token_idx" ON "quote_tokens"("token");
CREATE INDEX IF NOT EXISTS "quote_tokens_producerId_idx" ON "quote_tokens"("producerId");

ALTER TABLE "quote_tokens"
  ADD CONSTRAINT "quote_tokens_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_tokens"
  ADD CONSTRAINT "quote_tokens_producerId_fkey"
  FOREIGN KEY ("producerId") REFERENCES "producers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
