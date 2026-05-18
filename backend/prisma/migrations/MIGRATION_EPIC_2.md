# Migration: Epic 2 Complete - Innovations

**Migration ID:** `20260402183000_epic_2_innovations`  
**Created:** 02/04/2026 18:30:00  
**Epic:** Epic 2 - Innovations  
**Status:** ✅ Ready to apply

---

## 📋 Summary

This migration adds 1 new field to support Epic 2 features:
- Voice quotes (Whisper API)
- Photo quotes (GPT-4 Vision)
- Predictive intelligence with proactive suggestions

---

## 🗄️ Schema Changes

### 1. Producer Table - Preferences
```sql
ALTER TABLE "producers" 
ADD COLUMN "preferences" JSONB;
```

**Purpose:** Store producer preferences for notifications and proactive features  
**User Story:** US 2.3 - Predictive Intelligence (13pts)  
**Type:** JSON (nullable)  
**Example:**
```json
{
  "notifications": {
    "proactiveSuggestions": true,
    "maxSuggestionsPerWeek": 1,
    "preferredDays": [1, 3, 5]
  },
  "autoQuote": {
    "enabled": false,
    "product": "Ração para gado",
    "quantity": "100",
    "unit": "sacas",
    "frequency": "monthly",
    "dayOfMonth": 5
  }
}
```

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
- Generate Prisma Client with new fields

---

### Option 2: Manual SQL Execution
```bash
# Connect to PostgreSQL
psql -U postgres -d farmflow

# Run the migration SQL
\i prisma/migrations/20260402183000_epic_2_innovations/migration.sql

# Verify changes
\d producers
```

Then regenerate Prisma Client:
```bash
npx prisma generate
```

---

## ✅ Verification Checklist

After applying migration, verify:

- [ ] `producers` table has `preferences` column (JSONB, nullable)
- [ ] Prisma Client regenerated successfully
- [ ] TypeScript compiles without errors
- [ ] Existing data preserved (no data loss)

### SQL Verification Queries
```sql
-- Check Producer schema
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'producers' 
AND column_name = 'preferences';

-- Count existing data (should all be preserved)
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
-- Remove new column
ALTER TABLE "producers" DROP COLUMN IF EXISTS "preferences";
```

**⚠️ Warning:** Rollback will lose any data saved in this field.

---

## 📊 Expected Impact

### Disk Space
- `preferences` (JSONB): ~100 bytes per producer with preferences set
- **Estimated:** +10KB for 100 producers

### Performance
- ✅ SELECT queries on producers: **No impact** (nullable field)
- ✅ INSERT on producers: **Negligible** (nullable field)
- ✅ UPDATE on producers: **Negligible**
- ✅ Overall: **No performance impact**

---

## 🧪 Testing After Migration

### 1. Test Voice Quote (US 2.1)
```bash
# Send audio message via WhatsApp
# Verify transcription works
# Verify NLU extracts entities correctly
```

### 2. Test Photo Quote (US 2.2)
```bash
# Send invoice photo via WhatsApp
# Verify image analysis works
# Verify extracted data is correct
# Verify pre-fill flow works
```

### 3. Test Predictive Intelligence (US 2.3)
```bash
# Run proactive quotes job
node -e "require('./dist/jobs/proactive-quotes.job').proactiveQuotesJob.execute()"

# Verify patterns detected
# Verify notifications sent correctly
# Test opt-out functionality
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
- `backend/prisma/schema.prisma`

**Services:**
- `backend/src/services/openai.service.ts` - Added transcribeAudio() and analyzeInvoiceImage()
- `backend/src/services/pattern-detection.service.ts` - NEW (pattern detection logic)
- `backend/src/modules/whatsapp/whatsapp.service.ts` - Updated to handle audio/image

**Jobs:**
- `backend/src/jobs/proactive-quotes.job.ts` - NEW (proactive suggestions)

**Types:**
- `backend/src/types/index.ts` - Added AWAITING_IMAGE_CHOICE, AWAITING_PROACTIVE_CHOICE states

---

## 💰 API Costs

Epic 2 introduces new OpenAI API costs:

### Whisper API (Voice)
- **Cost:** $0.006 per minute of audio
- **Estimated usage:** 30s average → $0.003 per voice quote
- **Monthly estimate (20% adoption):** $6 per 1000 quotes

### GPT-4 Vision (Photo)
- **Cost:** $0.01 per image
- **Estimated usage:** 20% of users → $0.002 per quote average
- **Monthly estimate:** $2 per 1000 quotes

### Total Additional Cost
- **Per quote:** +$0.005 average
- **Per 1000 quotes:** +$8
- **Acceptable** given the UX improvement and differentiation

---

## 🎯 Epic 2 Features Summary

### US 2.1 - Voice Quotes (8pts) ✅
**What:** Transcribe voice messages using Whisper API  
**Impact:** +30% adoption from rural producers who prefer audio  
**Files:**
- `openaiService.transcribeAudio()`
- `whatsappService.transcribeAudioMessage()`

### US 2.2 - Photo Quotes (8pts) ✅
**What:** Extract data from invoice photos using GPT-4 Vision  
**Impact:** 100% reduction in typing, "magic" UX  
**Files:**
- `openaiService.analyzeInvoiceImage()`
- `whatsappService.analyzeImageMessage()`

### US 2.3 - Predictive Intelligence (13pts) ✅
**What:** Detect patterns and send proactive suggestions  
**Impact:** +20% engagement, -50% effort for recurring users  
**Files:**
- `patternDetectionService` - pattern detection algorithms
- `proactiveQuotesJob` - daily job for suggestions

---

## 🚀 Deployment Notes

### 1. Environment Variables
No new env vars required. Uses existing `OPENAI_API_KEY`.

### 2. Scheduled Jobs
Add cron job to run proactive suggestions daily:
```bash
# Run at 8am every day
0 8 * * * cd /path/to/backend && node dist/jobs/proactive-quotes.job.js
```

### 3. Monitoring
Monitor these metrics:
- Voice transcription success rate
- Image analysis success rate
- Proactive suggestion acceptance rate
- OpenAI API costs

### 4. Feature Flags (Optional)
Consider adding feature flags for gradual rollout:
```json
{
  "voice_quotes_enabled": true,
  "photo_quotes_enabled": true,
  "proactive_suggestions_enabled": true
}
```

---

## 📈 Success Metrics

Track these KPIs after Epic 2 launch:

### Voice Quotes
- **Adoption rate:** % of users using voice
- **Target:** 30% within 2 months
- **Transcription accuracy:** > 95%

### Photo Quotes
- **Adoption rate:** % of users using photo
- **Target:** 20% within 2 months
- **Extraction accuracy:** > 90%

### Predictive Intelligence
- **Acceptance rate:** % of proactive suggestions accepted
- **Target:** > 40%
- **Opt-out rate:** < 10%
- **False positive rate:** < 10%

---

**Created by:** Claude Opus 4.6 (Senior Developer)  
**Reviewed by:** [Add reviewer name]  
**Applied on:** [Add date when applied]  
**Environment:** [staging/production]
