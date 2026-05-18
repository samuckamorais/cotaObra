-- CreateTable
-- Add ConversationMetric table for tracking conversation analytics
CREATE TABLE "conversation_metrics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "state" TEXT,
    "previousState" TEXT,
    "errorType" TEXT,
    "metadata" JSONB,
    "durationMs" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Add Experiment table for A/B testing
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "variants" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Add ExperimentAssignment table for tracking user assignments
CREATE TABLE "experiment_assignments" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_metrics_userId_idx" ON "conversation_metrics"("userId");

-- CreateIndex
CREATE INDEX "conversation_metrics_userType_idx" ON "conversation_metrics"("userType");

-- CreateIndex
CREATE INDEX "conversation_metrics_eventType_idx" ON "conversation_metrics"("eventType");

-- CreateIndex
CREATE INDEX "conversation_metrics_timestamp_idx" ON "conversation_metrics"("timestamp");

-- CreateIndex
CREATE INDEX "conversation_metrics_state_idx" ON "conversation_metrics"("state");

-- CreateIndex
CREATE UNIQUE INDEX "experiments_name_key" ON "experiments"("name");

-- CreateIndex
CREATE INDEX "experiments_name_idx" ON "experiments"("name");

-- CreateIndex
CREATE INDEX "experiments_active_idx" ON "experiments"("active");

-- CreateIndex
CREATE INDEX "experiment_assignments_userId_idx" ON "experiment_assignments"("userId");

-- CreateIndex
CREATE INDEX "experiment_assignments_experimentId_idx" ON "experiment_assignments"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_assignments_experimentId_userId_userType_key" ON "experiment_assignments"("experimentId", "userId", "userType");

-- AddForeignKey
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
