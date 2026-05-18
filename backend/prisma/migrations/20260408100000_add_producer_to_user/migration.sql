-- AlterTable: vincula User a Producer (nullable, unique)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "producerId" TEXT;

-- Unique constraint: um producer pode ter no máximo um user vinculado
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_producerId_key";
ALTER TABLE "users" ADD CONSTRAINT "users_producerId_key" UNIQUE ("producerId");

-- Foreign key para producers
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_producerId_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_producerId_fkey"
  FOREIGN KEY ("producerId") REFERENCES "producers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index
CREATE INDEX IF NOT EXISTS "users_producerId_idx" ON "users"("producerId");
