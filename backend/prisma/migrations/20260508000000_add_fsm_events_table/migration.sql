-- FF-BE-009: tabela de eventos do funil conversacional.
-- Fonte de verdade para dashboard /reports/funnel e detecção de abandono.

CREATE TABLE "fsm_events" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fsm_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fsm_events_producerId_timestamp_idx" ON "fsm_events"("producerId", "timestamp");
CREATE INDEX "fsm_events_eventType_timestamp_idx" ON "fsm_events"("eventType", "timestamp");
CREATE INDEX "fsm_events_toState_timestamp_idx" ON "fsm_events"("toState", "timestamp");
