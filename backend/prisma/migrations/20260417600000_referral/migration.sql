CREATE TABLE "referrals" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referredEmail" TEXT NOT NULL,
  "referredId" TEXT,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "rewardClaimed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "referrals_code_key" ON "referrals"("code");
CREATE INDEX "referrals_referrerId_idx" ON "referrals"("referrerId");
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "producers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
