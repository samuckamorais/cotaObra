CREATE TABLE "report_schedules" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "frequency" TEXT NOT NULL DEFAULT 'weekly',
  "format" TEXT NOT NULL DEFAULT 'json',
  "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "report_schedules_userId_idx" ON "report_schedules"("userId");
CREATE INDEX "report_schedules_nextRunAt_idx" ON "report_schedules"("nextRunAt");
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
