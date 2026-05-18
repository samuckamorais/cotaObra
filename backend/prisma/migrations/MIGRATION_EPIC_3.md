# Migration: Epic 3 Complete - Instrumentação e Analytics

**Migration ID:** `20260402190000_epic_3_analytics`  
**Created:** 02/04/2026 19:00:00  
**Epic:** Epic 3 - Instrumentação e Analytics  
**Status:** ✅ Ready to apply

---

## 📋 Summary

This migration adds 3 new tables to support Epic 3 features:
- Conversation metrics tracking (analytics)
- A/B testing experiments
- User-to-variant assignments

---

## 🗄️ Schema Changes

### 1. ConversationMetric Table
```sql
CREATE TABLE "conversation_metrics" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "state" TEXT,
    "previousState" TEXT,
    "errorType" TEXT,
    "metadata" JSONB,
    "durationMs" INTEGER,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose:** Track all conversation events for analytics  
**User Story:** US 3.1 - Métricas de Conversação (5pts)  
**Event Types:**
- `message_sent` - Bot sent message
- `message_received` - User sent message
- `state_changed` - FSM transition
- `error` - Validation/processing error
- `quote_completed` - Quote successfully created
- `quote_abandoned` - User abandoned quote

**Indexes:**
- `userId` - filter by user
- `userType` - filter producer/supplier
- `eventType` - filter by event type
- `timestamp` - time-series queries
- `state` - analyze by FSM state

---

### 2. Experiment Table
```sql
CREATE TABLE "experiments" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT UNIQUE NOT NULL,
    "description" TEXT,
    "variants" JSONB NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "startDate" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP
);
```

**Purpose:** Define A/B test experiments  
**User Story:** US 3.2 - Testes A/B (8pts)  
**Variants JSON Example:**
```json
[
  { "name": "control", "weight": 50 },
  { "name": "treatment", "weight": 50 }
]
```

**Indexes:**
- `name` (unique) - lookup by feature flag name
- `active` - filter active experiments

---

### 3. ExperimentAssignment Table
```sql
CREATE TABLE "experiment_assignments" (
    "id" TEXT PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "assignedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(experimentId, userId, userType),
    FOREIGN KEY (experimentId) REFERENCES experiments(id) ON DELETE CASCADE
);
```

**Purpose:** Track which variant each user is assigned to  
**User Story:** US 3.2 - Testes A/B (8pts)  
**Behavior:**
- Deterministic assignment (hash-based)
- One user = one variant per experiment
- Cascade delete when experiment is removed

**Indexes:**
- `userId` - lookup user's assignments
- `experimentId` - all users in experiment
- Unique constraint on (experimentId, userId, userType)

---

## 🚀 How to Apply

### Option 1: Using Prisma Migrate (Recommended)
```bash
cd backend
npx prisma migrate deploy
```

This will:
- Apply the migration to the database
- Update `_prisma_migrations` table
- Generate Prisma Client with new models

---

### Option 2: Manual SQL Execution
```bash
# Connect to PostgreSQL
psql -U postgres -d farmflow

# Run the migration SQL
\i prisma/migrations/20260402190000_epic_3_analytics/migration.sql

# Verify changes
\d conversation_metrics
\d experiments
\d experiment_assignments
```

Then regenerate Prisma Client:
```bash
npx prisma generate
```

---

## ✅ Verification Checklist

After applying migration, verify:

- [ ] `conversation_metrics` table exists with all columns and indexes
- [ ] `experiments` table exists with all columns and indexes
- [ ] `experiment_assignments` table exists with foreign key constraint
- [ ] Prisma Client regenerated successfully
- [ ] TypeScript compiles without errors
- [ ] Existing data preserved (no data loss)

### SQL Verification Queries
```sql
-- Check tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
AND tablename IN ('conversation_metrics', 'experiments', 'experiment_assignments');

-- Check indexes on conversation_metrics
SELECT indexname FROM pg_indexes 
WHERE tablename = 'conversation_metrics';

-- Check foreign key constraint
SELECT conname, contype FROM pg_constraint 
WHERE conrelid = 'experiment_assignments'::regclass;

-- Verify no data loss
SELECT 
  (SELECT COUNT(*) FROM producers) as total_producers,
  (SELECT COUNT(*) FROM suppliers) as total_suppliers,
  (SELECT COUNT(*) FROM quotes) as total_quotes,
  (SELECT COUNT(*) FROM proposals) as total_proposals;
```

---

## 🔄 Rollback (If Needed)

If something goes wrong, rollback with:

```sql
-- Remove tables in reverse order (FK dependencies)
DROP TABLE IF EXISTS "experiment_assignments" CASCADE;
DROP TABLE IF EXISTS "experiments" CASCADE;
DROP TABLE IF EXISTS "conversation_metrics" CASCADE;
```

**⚠️ Warning:** Rollback will lose all metrics and experiment data.

---

## 📊 Expected Impact

### Disk Space
- `conversation_metrics`: ~200 bytes per event
  - Estimated: 100 events/day * 100 users * 30 days = 300k events = ~60MB/month
- `experiments`: ~500 bytes per experiment (typically < 10 active)
- `experiment_assignments`: ~100 bytes per assignment
  - Estimated: 100 users * 3 experiments = 300 assignments = ~30KB

**Total:** ~65MB per month for metrics (consider retention policy)

### Performance
- ✅ INSERT on metrics: **Fast** (async, non-blocking)
- ✅ SELECT on metrics: **Indexed** (fast time-series queries)
- ✅ JOIN experiments + assignments: **Small tables** (< 1ms)
- ⚠️ Large time-range queries: Consider pagination

### Maintenance
Recommend auto-cleanup job:
```sql
-- Run weekly: delete metrics older than 90 days
DELETE FROM conversation_metrics 
WHERE timestamp < NOW() - INTERVAL '90 days';
```

---

## 🧪 Testing After Migration

### 1. Test Metrics Tracking (US 3.1)
```bash
# Trigger some events
curl -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"from": "+5564999999999", "body": "oi"}'

# Check metrics were recorded
psql -U postgres -d farmflow -c "SELECT * FROM conversation_metrics ORDER BY timestamp DESC LIMIT 10;"

# Test analytics endpoints
curl "http://localhost:3000/api/analytics/overview?startDate=2026-04-01&endDate=2026-04-03"
curl "http://localhost:3000/api/analytics/conversion-rate?startDate=2026-04-01&endDate=2026-04-03"
curl "http://localhost:3000/api/analytics/funnel?startDate=2026-04-01&endDate=2026-04-03"
```

### 2. Test A/B Testing (US 3.2)
```bash
# Create experiment
curl -X POST http://localhost:3000/api/analytics/experiments \
  -H "Content-Type: application/json" \
  -d '{
    "name": "voice_quotes_enabled",
    "description": "Test voice quote feature",
    "variants": [
      {"name": "control", "weight": 50},
      {"name": "treatment", "weight": 50}
    ]
  }'

# Check assignment
psql -U postgres -d farmflow -c "SELECT * FROM experiments;"

# Assign users (done automatically in code)
# Verify distribution
curl "http://localhost:3000/api/analytics/experiments/voice_quotes_enabled/stats"

# Compare metrics between variants
curl "http://localhost:3000/api/analytics/experiments/voice_quotes_enabled/compare?metricName=conversion_rate&startDate=2026-04-01&endDate=2026-04-03"
```

### 3. Test FSM Integration
Check that state transitions are tracked:
```sql
-- Should show state_changed events
SELECT eventType, state, previousState, durationMs 
FROM conversation_metrics 
WHERE eventType = 'state_changed' 
ORDER BY timestamp DESC 
LIMIT 20;
```

---

## 🐛 Known Issues

None at migration creation time.

If issues arise, document here:
- Issue description
- Date discovered
- Fix applied
- Related commit

---

## 📚 Related Files

**Schema:**
- `backend/prisma/schema.prisma` - added 3 models

**Services:**
- `backend/src/services/metrics.service.ts` - NEW (365 lines)
- `backend/src/services/feature-flags.service.ts` - NEW (332 lines)
- `backend/src/flows/fsm.ts` - Updated with tracking methods

**Controllers:**
- `backend/src/modules/analytics/analytics.controller.ts` - NEW (API endpoints)
- `backend/src/modules/analytics/analytics.routes.ts` - NEW (routes)

**Types:**
- No new types needed (uses existing Prisma models)

---

## 📊 Dashboard Queries

Example queries for Grafana/Metabase dashboards:

### 1. Conversion Funnel
```sql
SELECT 
  state,
  COUNT(*) as users,
  ROUND(100.0 * COUNT(*) / LAG(COUNT(*)) OVER (ORDER BY MIN(timestamp)), 2) as retention_rate
FROM conversation_metrics
WHERE eventType = 'state_changed' 
  AND timestamp >= NOW() - INTERVAL '7 days'
  AND userType = 'producer'
GROUP BY state
ORDER BY MIN(timestamp);
```

### 2. Error Rate Over Time
```sql
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) FILTER (WHERE eventType = 'error') as errors,
  COUNT(*) as total_events,
  ROUND(100.0 * COUNT(*) FILTER (WHERE eventType = 'error') / COUNT(*), 2) as error_rate
FROM conversation_metrics
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

### 3. Average Time Per State
```sql
SELECT 
  state,
  AVG(durationMs) / 1000 as avg_seconds,
  COUNT(*) as samples
FROM conversation_metrics
WHERE eventType = 'state_changed'
  AND durationMs IS NOT NULL
  AND timestamp >= NOW() - INTERVAL '7 days'
GROUP BY state
ORDER BY avg_seconds DESC;
```

### 4. First Response Rate
```sql
WITH welcomed AS (
  SELECT DATE(timestamp) as date, COUNT(DISTINCT userId) as count
  FROM conversation_metrics
  WHERE eventType = 'message_sent' AND state = 'IDLE'
    AND timestamp >= NOW() - INTERVAL '30 days'
  GROUP BY date
),
responded AS (
  SELECT DATE(timestamp) as date, COUNT(DISTINCT userId) as count
  FROM conversation_metrics
  WHERE eventType = 'message_received'
    AND timestamp >= NOW() - INTERVAL '30 days'
  GROUP BY date
)
SELECT 
  w.date,
  w.count as welcomed,
  COALESCE(r.count, 0) as responded,
  ROUND(100.0 * COALESCE(r.count, 0) / w.count, 2) as response_rate
FROM welcomed w
LEFT JOIN responded r ON w.date = r.date
ORDER BY w.date;
```

### 5. A/B Test Results
```sql
SELECT 
  ea.variant,
  COUNT(DISTINCT cm.userId) as users,
  COUNT(*) FILTER (WHERE cm.eventType = 'quote_completed') as conversions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cm.eventType = 'quote_completed') / COUNT(DISTINCT cm.userId), 2) as conversion_rate
FROM experiment_assignments ea
JOIN conversation_metrics cm ON ea.userId = cm.userId
WHERE ea.experimentId = (SELECT id FROM experiments WHERE name = 'voice_quotes_enabled')
  AND cm.timestamp >= (SELECT startDate FROM experiments WHERE name = 'voice_quotes_enabled')
GROUP BY ea.variant;
```

---

## 🎯 Epic 3 Features Summary

### US 3.1 - Conversation Metrics (5pts) ✅
**What:** Track all conversation events for analytics dashboards  
**Impact:** Data-driven decisions, identify bottlenecks, measure improvements  
**Files:**
- `metricsService` - 9 methods for analytics
- `conversation_metrics` table - time-series event storage
- FSM integration - auto-tracking of state transitions

**Tracked Events:**
- Message sent/received
- State transitions (with duration)
- Errors (with error type)
- Quote completed/abandoned
- Proposal sent/accepted/rejected

**Dashboard Metrics:**
- Conversion rate (started → completed)
- Conversion funnel (dropoff per state)
- Average time per state
- Error distribution
- First response rate

### US 3.2 - A/B Testing (8pts) ✅
**What:** Feature flags and A/B testing framework  
**Impact:** Safe experimentation, validate hypotheses, gradual rollouts  
**Files:**
- `featureFlagsService` - experiment management
- `experiments` + `experiment_assignments` tables
- Analytics API - compare variant performance

**Capabilities:**
- Create experiments with weighted variants
- Deterministic hash-based assignment (consistent per user)
- Track variant distribution
- Compare metrics (conversion_rate, avg_messages, completion_time)
- Deactivate experiments

**Example Experiment:**
```json
{
  "name": "voice_quotes_enabled",
  "variants": [
    {"name": "control", "weight": 50},
    {"name": "treatment", "weight": 50}
  ]
}
```

---

## 📈 Success Metrics

Track these KPIs after Epic 3 launch:

### Analytics Usage
- **Dashboard views:** > 10/day by team
- **Alerting:** Email when error rate > 5%
- **Data retention:** 90 days

### A/B Testing
- **Active experiments:** 2-3 concurrent
- **Decision speed:** Results in 2 weeks (min 100 users/variant)
- **Statistical significance:** p-value < 0.05

### Performance Impact
- **Metrics INSERT latency:** < 5ms (async, non-blocking)
- **Dashboard query latency:** < 500ms
- **Storage growth:** ~65MB/month

---

## 🚀 Deployment Notes

### 1. Environment Variables
No new env vars required.

### 2. Monitoring
Set up alerts:
```sql
-- Alert if error rate > 5%
SELECT COUNT(*) as errors 
FROM conversation_metrics 
WHERE eventType = 'error' 
  AND timestamp >= NOW() - INTERVAL '1 hour';
```

### 3. Dashboards
Recommended dashboards:
- **Overview:** Total messages, conversations, error rate
- **Funnel:** State-by-state conversion
- **Performance:** Time per state, message velocity
- **Experiments:** Active tests, variant distribution

### 4. Data Retention
Add cron job for cleanup:
```bash
# Run daily at 2am
0 2 * * * cd /path/to/backend && node -e "require('./dist/services/metrics.service').metricsService.cleanOldMetrics(90)"
```

---

**Created by:** Claude Opus 4.6 (Senior Developer)  
**Reviewed by:** [Add reviewer name]  
**Applied on:** [Add date when applied]  
**Environment:** [staging/production]
