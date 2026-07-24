---
name: Final QA Certification 2026-07-24
description: 4 QA findings verified and fixed; final production certification issued.
---

# THORX Final QA Certification — 2026-07-24

## 4 QA Findings (all fixed)

### 1. uniq_user_transactions_source — MISSING
**Fix:** `CREATE UNIQUE INDEX uniq_user_transactions_source ON user_transactions (source_id, source_type) WHERE source_id IS NOT NULL;`
Schema comment in shared/schema.ts line ~1362 documents it as manually applied (Drizzle DSL cannot express partial unique indexes).

### 2. task_records_user_task_idx — NOT UNIQUE
**Fix:** Dropped the non-unique index, recreated as `CREATE UNIQUE INDEX task_records_user_task_idx ON task_records (user_id, task_id);`

### 3. Rank-up notifications not persisted
**Fix:** Added `tx.insert(notifications)` inside the rank-change branch of `checkAndUpdateRank` (server/storage.ts ~line 2840). Title "Rank Up! 🎉", type "system", message names old and new rank.

### 4. HilltopAds anti-adblock → 500 without API key
**Fix:** Route handler (`/api/hilltopads/anti-adblock/:zoneId` in server/routes.ts) now catches errors containing "not configured" and returns `{ code: "" }` (HTTP 200) so the frontend waterfall continues to next network.

**Why:** A 500 from the anti-adblock endpoint was causing the ad player to fail instead of gracefully switching networks.

## Final Status
- TypeScript: 0 errors
- Tests: 46/46 PASS
- All 4 QA findings resolved
- Both missing DB indexes verified in pg_indexes
