# THORX — Attention & Ad Engines: Deep Codebase Report
**Date:** 2026-07-24 | **Method:** Direct line-by-line codebase investigation  
**Scope:** Systems 2.1 through 2.7 — Attention & Ad Engines  
**Source:** Real production code only — no assumptions, no placeholders

---

## Table of Contents

1. [Engine A — Video/Display Ads](#engine-a--videodisplay-ads)
2. [Engine B — CPA / Task Completion](#engine-b--cpa--task-completion)
3. [Engine C — Guild Tasks / Bonus Pool](#engine-c--guild-tasks--bonus-pool)
4. [Engine Indirect — Referral Passive Earnings](#engine-indirect--referral-passive-earnings)
5. [HilltopAds Integration Service](#hilltopads-integration-service)
6. [HilltopAds Admin Control Panel](#hilltopads-admin-control-panel)
7. [HilltopAds Ad Completion Tracker](#hilltopads-ad-completion-tracker)
8. [Shared Core: recordEarnEvent Function](#shared-core-recordearnevent-function)

---

## Engine A — Video/Display Ads

### Yeh Kya Hai?
Engine A THORX ka **primary earning mechanism** hai — user ek ad dekhta hai aur usse TX-Points + real PKR balance milta hai. Yeh pura process automated, secure, aur cheat-proof hai.

### Files & Database
- **Server:** `server/routes.ts` (line ~1631) — `POST /api/ad-view`
- **Storage:** `server/storage.ts` — `recordEarnEvent()`
- **Database Tables:** `ad_views`, `user_transactions`, `earnings`, `users`
- **Config Source:** `system_config` key `AD_INVENTORY_JSON` (60 second cache)

### Shuru Se Akhir Tak Kaise Kaam Karta Hai?

**Step 1 — User Ad Dekhta Hai (Frontend)**
- User apne portal mein "Watch Ad" button dabata hai
- `WaterfallAdPlayer` component (`client/src/components/ads/HilltopAdsPlayer.tsx`) load hota hai
- Component pehle `/api/config/AD_NETWORKS` se active ad networks fetch karta hai, priority order mein sort karta hai
- Phir pehle network ka anti-adblock script `/api/hilltopads/anti-adblock/:zoneId` se laata hai
- Agar woh fail hojaye, agla network try karta hai (waterfall fallback)
- 3 second baad ad "complete" consider hota hai aur `/api/hilltopads/ad-completion` call hoti hai

**Step 2 — Server Ad View Record Karta Hai**
- `POST /api/ad-view` hit hoti hai `{ adId, duration }` ke saath
- **Auth Check:** `requireSessionAuth` — sirf logged-in, active users access kar sakte hain
- **Rate Limit:** `earnRateLimiter` — 15 requests per minute per user
- **Ad Config Lookup:** Server `AD_INVENTORY_JSON` (system_config) se ad details laata hai (60s cache). Agar `adId` match na hoe, `hilltop_fallback` use hota hai (0.02 PKR gross, 5 sec duration)

**Step 3 — Race Condition Protection (Critical)**
```
db.transaction(async (tx) => {
  SELECT pg_advisory_xact_lock(hashtext(userId))  ← User-level DB lock
  
  // Timing check: kya user ne pura ad dekha?
  SELECT last ad_view timestamp
  if (timeSinceLastAd < adConfig.duration - 2 seconds) → REJECT 429
  
  // Ad view row insert karo
  INSERT INTO ad_views (userId, adId, adType, duration, completed, earnedAmount)
  
  // Earning event fire karo (same transaction mein)
  recordEarnEvent({ engineType: 'Engine_A', grossPkr: adConfig.reward, ... })
})
```
- **`pg_advisory_xact_lock`** ensure karta hai ke ek hi user do concurrent ad views nahi de sakta
- Timing check aur insert ek hi transaction mein hain — beech mein crash bhi ho toh koi inconsistency nahi

**Step 4 — Money Calculation (`recordEarnEvent`)**
- `grossPkr = adConfig.reward` (e.g., 0.02 PKR)
- **Thorx ka cut:** `ENGINE_A_THORX_CUT_PCT` = 40% (default)
- **User ka share:** `ENGINE_A_USER_CUT_PCT` = 60%
  - `userPkrShare = grossPkr × 0.60`
- **TX-Points (display value):** Thorx Card draw se calculate hota hai
  - `targetPoints = (userPkrShare / 10) × conversionRate`
  - Phir ±10% variance apply hoti hai (rank ke hisaab se thoda zyada A/S rank ko)
  - Yeh sirf **display value** hai — real PKR kisi variance se affect nahi hota

**Step 5 — Database Update (Atomic Transaction mein)**
1. `user_transactions` mein row insert — `real_pkr_value`, `points_credited`, `source_id` = ad_view ID
2. `earnings` table mein secondary log row
3. `users.txPointsBalance += pointsCredited`
4. `users.totalEarnings += userPkrShare`
5. `users.availableBalance += userPkrShare`
6. PS award: **+5 PS** (default `PS_ENGINE_A_REWARD` config value — seeded as 5 in `storage.ts` line 581; configurable via admin)
7. Streak update, rank tier check

**Step 6 — Response**
```json
{
  "success": true,
  "adView": { "id": "...", "userId": "...", "completed": true },
  "thorxCard": { "pointsCredited": 245, "engineType": "Engine_A" },
  "message": "Ad viewed — 245 TX-Points credited"
}
```

### User Ko Kya Milta Hai?
- **TX-Points** (display, gamification ke liye)
- **Real PKR** balance (`availableBalance`) — withdrawal ke waqt use hota hai
- **+5 PS** (default `PS_ENGINE_A_REWARD`) — rank progression ke liye
- **Streak update** — agar pehla daily action hai toh streak PS bhi milta hai (Day 1: +5, Day 2: +10, Day 3+: +20)

### Idempotency (Double-credit Protection)
- `ad_views` table pe unique index + `uniq_user_transactions_source` on `(source_id, source_type)` — same ad view ID dusri baar submit hoe toh DB automatically reject kar deta hai

### Ad Inventory Kahan Configure Hota Hai?
- Admin panel se `AD_INVENTORY_JSON` system_config key update karein
- 60 second cache — update immediately effective nahi hota, max 60s baad lagta hai
- `hilltop_fallback` hamesha automatically inject hota hai — agar client ka `adId` kisi entry se match na hoe

**Database mein seeded default values (`storage.ts` lines 630–636):**
| ID | Reward (grossPkr) | Duration | Type |
|----|------------------|----------|------|
| `video_standard` | 0.25 PKR | 30s | video |
| `video_premium` | 0.50 PKR | 60s | video |
| `banner_standard` | 0.05 PKR | 5s | banner |
| `ad_004` | 0.10 PKR | 10s | pop_under |
| `hilltop_fallback` | 0.02 PKR | 5s | network (runtime fallback) |

---

## Engine B — CPA / Task Completion

### Yeh Kya Hai?
Engine B **CPA (Cost Per Action) offers** handle karta hai — user kisi advertiser ka link visit karta hai, wahan kuch time spend karta hai, secret code enter karta hai, aur PKR earn karta hai. Yeh highest per-task earning wala engine hai.

### Files & Database
- **Server:** `server/routes.ts`
  - `POST /api/tasks/:id/click`
  - `POST /api/tasks/:id/verify`
  - `GET /api/tasks`
- **Database Tables:** `daily_tasks`, `task_records`, `user_transactions`

### Shuru Se Akhir Tak Kaise Kaam Karta Hai?

**Step 1 — Tasks Dekho**
- `GET /api/tasks` → active tasks list milti hai
- Task mein: title, description, actionUrl (advertiser link), secretCode, grossPkrPerCompletion, taskCategory
- **Important:** `grossPkrPerCompletion` user ko nahi dikhai deta — sirf TX-Points range show hoti hai (audit protection)

**Step 2 — Task Click Karo**
```
POST /api/tasks/:id/click
```
- `task_records` table mein row banta hai `{ userId, taskId, status: 'pending', clickedAt: now() }`
- Agar record pehle se ho aur completed na ho → `clickedAt` update hota hai
- Agar completed ho → simply return kar deta hai (already done)

**Step 3 — Advertiser Link Pe Jao**
- User task ka `actionUrl` open karta hai (advertiser ki website)
- Wahan minimum **10 seconds** guzarne chahiye
- Kuch tasks mein secret code bhi diya hota hai jo page pe visible hota hai

**Step 4 — Task Verify Karo**
```
POST /api/tasks/:id/verify  { code: "SECRET123" }
```
Server 4 cheezein check karta hai (order mein):

1. **Task exists?** — 404 agar nahi mila
2. **Click session exists?** — 400 agar `clickedAt` nahi (task click pehle nahi kiya)
3. **Already completed?** — return with existing record
4. **Timing check:** `now - clickedAt >= 10 seconds` — agar kam hoe toh 400 error
5. **Secret code match** (case-insensitive) — agar galat hoe toh 400 error
6. **Rank Gate (CPA tasks only):** `task.taskCategory === 'cpa_offer'` wale tasks ke liye **C-Rank ya usse upar** zaroor hona chahiye
   - E-Rank ya D-Rank user ko `403 RANK_GATE` error milti hai

**Step 5 — Atomic Completion**
```
db.transaction(async (tx) => {
  // Task record update karo
  UPDATE task_records SET status='completed', completedAt=now()
  
  // Earn event fire karo
  recordEarnEvent({
    engineType: isCpaTask ? 'Engine_B' : 'Indirect',
    grossPkr: task.grossPkrPerCompletion,
    sourceType: 'daily_task',
    tx  ← same transaction
  })
})
```
- Agar task `cpa_offer` category ka hai aur `grossPkrPerCompletion > 0` → Engine B (user PKR milta hai)
- Warna → Engine `Indirect` (sirf PS milta hai, PKR nahi)

**Step 6 — Money Split**
- `userPkrShare = grossPkr × 60%` (`ENGINE_B_USER_CUT_PCT`)
- `thorxProfit = grossPkr × 40%`
- **PS award: +25 PS** per CPA completion

### Idempotency
- `task_records_user_task_idx` — UNIQUE index on `(user_id, task_id)` — ek user ek task sirf ek baar complete kar sakta hai

### User Ko Kya Milta Hai?
- **CPA Task:** TX-Points + Real PKR balance + 25 PS
- **Non-CPA Task:** Sirf PS (no PKR)
- Rank advancement towards next tier

---

## Engine C — Guild Tasks / Bonus Pool

### Yeh Kya Hai?
Engine C **guild (group) ka earning system** hai. Yeh ek 3-way money split system hai jahan user, guild pool, aur THORX platform teeno mein paise jaate hain. Guild members weekly tasks complete karke collectively earn karte hain.

### Files & Database
- **Server:** `server/routes.ts` (lines ~1207–1314), `server/modules/gps-engine.ts`
- **Storage:** `server/storage.ts` — `completeWeeklyTaskAtomic()`
- **Database Tables:** `guilds`, `guild_members`, `weekly_tasks`, `weekly_task_records`, `engine_c_messages`, `user_transactions`

### 3-Way Money Split (Engine C Ka Core)
```
grossPkr (total task reward)
├── 45% → User's wallet (ENGINE_C_USER_CUT_PCT)
├── 35% → Guild Weekly Bonus Pool (ENGINE_C_GUILD_POOL_PCT)  
└── 20% → THORX Platform profit (ENGINE_C_THORX_CUT_PCT)
```

### Shuru Se Akhir Tak Kaise Kaam Karta Hai?

**Step 1 — Weekly Tasks Dekho**
```
GET /api/guilds/weekly-tasks
```
- Sirf active guild members access kar sakte hain
- Tasks guild-scoped hain — har guild ke liye alag
- **Privacy Protection:** Response mein `grossPkrPerCompletion` nahi hota — sirf `txPointsReward` aur `txPointsRewardMax` range show hoti hai
  - `txPointsReward = grossPkr × 45% × conversionRate`
  - `txPointsRewardMax = txPointsReward × 1.2` (variance ceiling)

**Step 2 — Task Complete Karo**
```
POST /api/guilds/weekly-tasks/:taskId/complete
```
- `requireSessionAuth` + `earnRateLimiter` (15/min)
- Role check: sirf `member` ya `captain` complete kar sakte hain
- `completeWeeklyTaskAtomic()` call hoti hai — ek single DB transaction mein:
  1. Duplicate check (kya pehle complete ho chuka?)
  2. `weekly_task_records` mein new row insert
  3. `recordEarnEvent({ engineType: 'Engine_C', ... })`

**Step 3 — recordEarnEvent ke andar (Engine C specific)**
```
db.transaction(async (tx) => {
  // 1. user_transactions row insert
  INSERT user_transactions (real_pkr_value = 45%, guild_pool_pkr = 35%, thorx_profit_pkr = 20%)
  
  // 2. Guild weekly pool update
  UPDATE guilds SET weeklyBonusPool += 35%_share,
                    currentWeeklyPoints += grossPkr × 100
  
  // 3. User balance update
  UPDATE users SET txPointsBalance += pointsCredited,
                   availableBalance += 45%_share,
                   totalEarnings += 45%_share
  
  // 4. earnings table log row
  
  // 5. Guild member contribution tracking
  UPDATE guild_members SET weeklyPointsContributed += pointsCredited
  
  // 6. GPS (Guild Performance Score) award
  awardMemberGPS(guildId, pointsCredited, tx)
  
  // 7. PS award (+15), streak update, rank tier check
})
```

**Step 4 — Real-Time Broadcast**
```javascript
broadcastGuildEvent(guildId, 'guild.weekly_points', {
  userId, guildId, pointsCredited: earnResult.pointsCredited
})
```
- Sab guild members ko real-time WebSocket notification jaati hai

### Engine C Chat (guild_messages vs engine_c_messages)
- `GET/POST /api/guilds/:id/chat` → `engine_c_messages` table
- Yeh Engine C **task discussion chat** hai — general guild chat se alag
- Membership validation zaroor hoti hai (sirf active members)
- Rate limit: `guildInteractionRateLimiter`
- Message length: 1–500 characters
- WebSocket broadcast: `broadcastGuildMessage(guildId, payload)`

### Weekly Bonus Pool Distribution
Guild reset job (`server/modules/guild-reset.ts`) idempotent periodic sweep karta hai — har guild ka previous UTC week (Mon–Sun) exactly ek baar resolve karta hai.

**Condition (`wasSuccessful`):**
```javascript
const wasSuccessful = guild.currentWeeklyPoints >= guild.weeklyTarget && poolD.greaterThan(0)
```

**Agar target ACHIEVE hua:**
- `captainShare = pool × 30%` → captain ke `balanceCashPkr` mein credit
- `memberPool = pool − captainShare` → members mein proportional distribution (unka `weeklyPointsContributed` ke ratio se), `balanceCashPkr` mein credit
- Rounding dust (paisa) THORX treasury mein jata hai
- `guild_weekly_snapshots` row: `poolDisposition = 'distributed'`

**Agar target MISS hua:**
- Pool **VOID** ho jata hai — kisi ko kuch nahi milta
- `guild_weekly_snapshots` row: `poolDisposition = 'voided'`
- Live feed event: `"Guild missed target. Pool of Rs.X voided."`

**Har case mein reset:**
- `guilds.weeklyBonusPool = '0.0000'`
- `guilds.currentWeeklyPoints = 0`
- `guild_members.weeklyPointsContributed = 0`, `isMvp = false`

### Admin Weekly Task Management
- `GET /api/admin/weekly-tasks` — list (requireTeamRole)
- `POST /api/admin/weekly-tasks` — create (requirePermission("MANAGE_TASKS"))
- `PATCH /api/admin/weekly-tasks/:id` — update (requireTeamRole)

### User Ko Kya Milta Hai?
- **45% of grossPkr** real PKR balance mein
- **TX-Points** (display, variance ke saath)
- **+15 PS** per completion
- Guild ka GPS score barhta hai (better ranking)
- Weekly bonus pool mein contribution

---

## Engine Indirect — Referral Passive Earnings

### Yeh Kya Hai?
Engine Indirect woh system hai jismein **referrer user (jo doosre ko refer karta hai) ko commission milti hai** — lekin instantly nahi, **referred user ke withdrawal approval ke waqt** milti hai.

### Files & Database
- **Server:** `server/storage.ts` — `processWithdrawal()`
- **Database Tables:** `referral_commissions`, `users.balanceCashPkr`, `referrals`

### Earn Phase (Engine Indirect ke liye kuch nahi hota)
```javascript
// recordEarnEvent mein (storage.ts lines 991, 1098–1101):
// 'Indirect' — userPkrShare = 0, thorxProfit = 0
// awardTaskPS NOT called (guarded by: if (engineType !== "Indirect"))
// processStreak IS called (runs for all engines)
```
- Jab koi indirect task complete hota hai → user ko **0 PKR** milta hai
- **Task PS bhi nahi milta** — `awardTaskPS()` sirf Engine A/B/C ke liye call hoti hai
- Lekin **streak PS zaroor milta hai** — `processStreak()` sab engines ke liye run hoti hai (Day 1: +5, Day 2: +10, Day 3+: +20 PS)
- Referral commission immediately credit nahi hoti

### Commission Trigger (Withdrawal Approval Pe)
Jab referred user ka withdrawal **approve** hota hai:

```
platformFee = withdrawalAmount × 15%
referralCut = platformFee × 50%      ← referrer ko milta hai
thorxProfit = platformFee - referralCut
```

```javascript
// processWithdrawal mein:
if (user.referredBy) {
  // Referrer ko credit karo
  UPDATE users SET balanceCashPkr += referralCut WHERE id = referredBy
  
  // Commission log karo
  INSERT referral_commissions (referrerId, referredId, amount, withdrawalId)
}
```

### User Ko Kya Milta Hai?
- **Referrer:** Passive income — referred user ke har withdrawal ka 7.5% (15% fee ka 50%)
  - Yeh `balanceCashPkr` field mein credit hota hai (alag se trackable)
  - Withdrawal pe available
- **Referred User:** Normal withdrawal process hota hai (unhe koi extra cut nahi dena)

### L2 Referral Retired
- Pehle 2-tier referral tha (referrer ka referrer bhi commission paata tha)
- Ab sirf **L1 referral** active hai — direct referrer ko commission milti hai

---

## HilltopAds Integration Service

### Yeh Kya Hai?
`server/hilltopads-service.ts` ek **wrapper service** hai jo HilltopAds publisher REST API se baat karta hai. Yeh THORX ko ad network ka data (inventory, revenue stats, anti-adblock codes) laane deta hai.

### Files
- **Service:** `server/hilltopads-service.ts` (226 lines)
- **Scheduler:** `server/hilltopads-scheduler.ts` (54 lines)
- **Database Tables:** `hilltop_ads_config`, `hilltop_ads_zones`, `hilltop_ads_stats`

### Service Architecture

**Class:** `HilltopAdsService`  
**Singleton:** `export const hilltopAdsService = new HilltopAdsService()`  
**API Base URL:** `https://api.hilltopads.com`  
**Auth:** `Authorization: Bearer {apiKey}` header

### Initialization
```javascript
async initialize(): Promise<void> {
  const config = await storage.getHilltopAdsConfig()  // DB se config lo
  if (config && config.isActive) {
    this.apiKey = config.apiKey  // DB mein stored API key use karo
  }
}
```
- API key environment variable se nahi, **database se** aati hai
- Admin panel se save ki gayi key `hilltop_ads_config` table mein hoti hai

### makeRequest — Exponential Backoff Retry
```javascript
private async makeRequest<T>(endpoint, params, { maxRetries=3, baseDelayMs=500 }) {
  // API key nahi? Initialize karo; phir bhi nahi? Error throw
  if (!this.apiKey) {
    await this.initialize()
    if (!this.apiKey) throw new Error("HilltopAds API key not configured")
  }
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Exponential backoff with full jitter (random delay up to base * 2^attempt)
    // 10 second timeout per request (AbortSignal.timeout(10_000))
    
    // 429 ya 5xx → retry
    // 4xx (except 429) → immediately throw
  }
}
```

### 4 API Calls
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `getBalance()` | `GET /publisher/balance` | Publisher account balance |
| `getInventory()` | `GET /publisher/inventory` | Sites + zones list |
| `getAntiAdBlockCode(zoneId)` | `GET /publisher/antiAdBlock?zone_id=X` | Ad-block bypass script |
| `getStats(start, end, zoneId?)` | `GET /publisher/listStats` | Revenue/impression data |

### syncInventory() — Zone Sync
```javascript
async syncInventory() {
  const inventory = await this.getInventory()  // API call
  
  for (const site of inventory.sites) {
    for (const zone of site.zones) {
      const existing = await storage.getHilltopAdsZoneById(zone.id)
      
      if (!existing) {
        // Naya zone create karo DB mein
        storage.createHilltopAdsZone({ zoneId, siteName, zoneName, adFormat, status })
      } else if (existing.status !== zone.status) {
        // Status update karo agar change hua
        storage.updateHilltopAdsZone(existing.id, { status: zone.status })
      }
    }
  }
}
```

### syncStats() — Revenue Data Sync
```javascript
async syncStats(startDate?, endDate?) {
  const stats = await this.getStats(startDate, endDate)  // API call
  
  for (const stat of stats.data) {
    const zone = await storage.getHilltopAdsZoneById(stat.zone_id)
    if (zone) {
      // Daily stat row insert karo
      storage.createHilltopAdsStat({ zoneId, date, impressions, clicks, cpm, revenue, ctr })
      
      // Zone ke cumulative totals update karo
      storage.updateHilltopAdsZone(zone.id, {
        totalImpressions: zone.totalImpressions + stat.impressions,
        totalRevenue: (existing + stat.revenue).toFixed(2)
      })
    }
  }
  
  // lastSyncedAt update karo
  storage.updateHilltopAdsConfig(config.id, { lastSyncedAt: new Date() })
}
```

### syncDailyStats() — Yesterday Ka Data
```javascript
async syncDailyStats() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().split('T')[0]  // "2026-07-23"
  await this.syncStats(dateStr, dateStr)
}
```

### HilltopAds Scheduler
```javascript
class HilltopAdsScheduler {
  start() {
    // Har 24 ghante syncDailyStats() run karo
    setInterval(async () => {
      await hilltopAdsService.syncDailyStats()
    }, 24 * 60 * 60 * 1000)
    
    // Immediately bhi inventory sync karo (server start pe)
    this.runImmediateSync()  → syncInventory()
  }
}
```
- Server start hone pe immediately `syncInventory()` run hoti hai
- Phir har 24 ghante `syncDailyStats()` automated run hoti hai

### Current Status
⚠️ **Partial** — Logic 100% complete hai. THORX ke database mein API key save nahi hogi toh:
- Startup pe `"HilltopAds API key not configured"` error log hoga
- Gracefully fail hoga — baaki sab features kaam karenge

---

## HilltopAds Admin Control Panel

### Yeh Kya Hai?
Admin aur team members ke liye ek dedicated dashboard (`client/src/pages/HilltopAdsAdmin.tsx`) + backend API endpoints jo HilltopAds integration ko manually control karne dete hain.

### Files
- **Frontend Page:** `client/src/pages/HilltopAdsAdmin.tsx` (339 lines)
- **Backend Routes:** `server/routes.ts` (lines ~3659–4161)
- **Auth:** `requireTeamRole` on all admin endpoints

### Dashboard UI (3 Summary Cards)
| Card | Data Source | Field |
|------|------------|-------|
| Total Revenue | `GET /api/hilltopads/revenue` | Sum of all `hilltop_ads_stats.revenue` |
| Current Balance | `GET /api/hilltopads/balance` | Live HilltopAds API balance |
| Active Zones | `GET /api/hilltopads/zones` | Count where `status === 'active'` |

### Configuration Setup (First Time)
Agar koi config nahi hai → setup form dikhta hai:
```
API Key (required, password field)
Publisher ID (optional)
→ POST /api/hilltopads/config
```
Backend Zod validation:
```javascript
z.object({
  apiKey: z.string().min(1).max(500),
  publisherId: z.string().max(200).optional(),
  settings: z.record(z.unknown()).optional().default({})
})
```
- Config save hone ke baad `hilltopAdsService` is API key use karna shuru karta hai

### Configuration Status (Config Hai Toh)
```
Status: Active / Inactive
Last Synced: [datetime]
[Sync Inventory Button]  → POST /api/hilltopads/sync/inventory
[Sync Stats Button]      → POST /api/hilltopads/sync/stats (yesterday's date)
```

### Ad Zones List
- Har zone ka naam, site, format, total impressions, total revenue show hota hai
- Agar zones nahi hain → "Click Sync Inventory to load your zones" message

### Backend API Endpoints (Sab `requireTeamRole`)
| Endpoint | Method | Kya Karta Hai |
|----------|--------|--------------|
| `/api/hilltopads/config` | POST | Naya config create (Zod validated) |
| `/api/hilltopads/config` | GET | Existing config fetch |
| `/api/hilltopads/config/:id` | PATCH | Config update (Zod partial validated) |
| `/api/hilltopads/zones` | POST | Manually zone add karo |
| `/api/hilltopads/zones` | GET | Sab zones list |
| `/api/hilltopads/zones/:zoneId` | GET | Single zone details |
| `/api/hilltopads/zones/:id` | PATCH | Zone update |
| `/api/hilltopads/stats` | GET | Stats history |
| `/api/hilltopads/revenue` | GET | Total revenue |
| `/api/hilltopads/sync/inventory` | POST | Manual inventory sync trigger |
| `/api/hilltopads/sync/stats` | POST | Manual stats sync (custom date range) |
| `/api/hilltopads/balance` | GET | Live balance from HilltopAds API |
| `/api/hilltopads/anti-adblock/:zoneId` | GET | **Public** — Anti-adblock script |

**Note:** `anti-adblock/:zoneId` PUBLIC endpoint hai — koi auth nahi (frontend ad player use karta hai)

### Error States
- Koi bhi query fail hoe → full-screen error message dikhta hai (`AlertCircle` icon + message)
- Mutations (sync, config save) fail hone pe `toast` error dikhta hai
- Config save hone ke baad form fields clear hote hain

---

## HilltopAds Ad Completion Tracker

### Yeh Kya Hai?
Yeh ek dedicated endpoint hai (`POST /api/hilltopads/ad-completion`) jo **HilltopAds SDK se client-side ad completion events** track karta hai. Yeh Engine A ke `/api/ad-view` se alag hai.

### Files
- **Backend:** `server/routes.ts` (line ~4079)
- **Frontend Caller:** `client/src/components/ads/HilltopAdsPlayer.tsx` (line ~111)
- **Database:** `ad_views` table

### Engine A vs Ad Completion Tracker — Farq

| Feature | Engine A (`/api/ad-view`) | HilltopAds Tracker (`/api/hilltopads/ad-completion`) |
|---------|--------------------------|------------------------------------------------------|
| **Purpose** | THORX earning credit | HilltopAds zone-level completion log |
| **PKR Credit** | ✅ User ko PKR milta hai | ❌ PKR credit nahi hota |
| **Auth** | requireSessionAuth | requireSessionAuth |
| **DB Table** | `ad_views` + `user_transactions` + `users` balance | Sirf `ad_views` |
| **Trigger** | User "ad view" submit karta hai | HilltopAds SDK ad complete karta hai |
| **Race Protection** | pg_advisory_xact_lock + timing check | Nahi (simple insert) |

### Backend Implementation
```javascript
POST /api/hilltopads/ad-completion  { zoneId, adType, duration }

// requireSessionAuth
// Fields required: zoneId, adType

// Reward amount determine karo
let rewardAmount = "0.10"  // Default fallback
const config = await storage.getHilltopAdsConfig()
if (config?.settings?.rewardPerAd) {
  rewardAmount = config.settings.rewardPerAd  // DB config se override
}

// Sirf ad_view row insert karo (no earn event, no balance update)
const adView = await storage.createAdView({
  userId,
  adType,
  adNetwork: "hilltopads",
  duration: duration || 0,
  completed: true,
  earnedAmount: rewardAmount
})

return { success: true, adView, message: "Ad completion recorded" }
```

### Frontend — WaterfallAdPlayer mein Integration
```javascript
// Ad inject hone ke 3 second baad:
const timer = setTimeout(() => {
  handleAdComplete()
}, 3000)

async function handleAdComplete() {
  await apiRequest("POST", "/api/hilltopads/ad-completion", {
    zoneId: networks[currentIndex].zoneId,
    adType: adFormat,     // "video" ya "banner"
    duration: 30
  })
  
  toast({ title: "System Rewarded", description: "Economic cycle completed. Points synchronized." })
  onComplete?.()  // Parent component ko notify karo
}
```

### User Experience
- Ad load hone ke 3 second baad automatically fire hoti hai
- User ko "System Rewarded — Economic cycle completed" toast dikhta hai
- Error hone pe silently ignore karta hai (non-critical)
- `onComplete` callback se parent component ko pata chalta hai ke earn cycle done

### Current Status
✅ **Fully Functional** — yeh API key ke bina bhi kaam karta hai kiunke yeh sirf client-side completion log karta hai, HilltopAds API se baat nahi karta

---

## Shared Core: recordEarnEvent Function

**Yeh function sab engines ka backbone hai.** Engines A, B, C sab isko call karte hain.

### Location
`server/storage.ts` — line 912 se 1133 tak

### Signature
```typescript
async recordEarnEvent(params: {
  userId: string
  engineType: "Engine_A" | "Engine_B" | "Engine_C" | "Indirect"
  grossPkr: string | number   // String preferred (Decimal-safe)
  sourceId: string            // ad_view.id ya task_record.id
  sourceType: "ad_view" | "weekly_task" | "daily_task"
  guildId?: string            // Engine_C ke liye zaruri
  tx?: any                    // Outer transaction (agar caller ne wrap kiya hoa ho)
})
```

### 7 Steps (Sab Ek Transaction Mein)

```
Step 1: System config se cut percentages + conversion rate fetch karo (parallel Promise.all)
Step 2: Engine split calculate karo (Decimal library — float nahi)
  Engine A: user=60%, thorx=40%
  Engine B: user=60%, thorx=40%
  Engine C: user=45%, guild=35%, thorx=20%
  Indirect: user=0%  (sab zero)
Step 3: Thorx Card draw — TX-Points calculate karo (variance + rank adjustment)
Step 4: user_transactions row INSERT (immutable ledger)
  - Engine C: guilds.weeklyBonusPool bhi update
Step 5: users balances update (txPointsBalance, totalEarnings, availableBalance)
  - earnings table mein secondary log
Step 6: Engine C: guild_members.weeklyPointsContributed update + GPS award
Step 7: PS award + streak update + rank tier check
```

**Transaction Outside:**
- `emitFeedEvent()` — live admin feed (DB commit ke baad, transaction ke andar nahi)

### Outer Transaction Support
- Caller apna transaction pass kar sakta hai `tx` param se
- Yeh ensure karta hai ke calling code ka write aur earn event ek hi atomic unit mein hain
- Engine A aur Engine B dono yeh karte hain

### Duplicate Protection
- `uniq_user_transactions_source` unique index on `(source_id, source_type)`
- Agar same `sourceId` dobara submit hoe → `23505` error code → clean error message throw

---

## Summary Table

| Engine | Trigger | User PKR % | Thorx % | Guild % | PS Award | Key Files |
|--------|---------|------------|---------|---------|----------|-----------|
| **Engine A** | Ad Watch | 60% | 40% | — | +5 task PS (default `PS_ENGINE_A_REWARD`) | routes.ts:1631, HilltopAdsPlayer.tsx |
| **Engine B** | CPA Task Verify | 60% | 40% | — | +25 task PS (default `PS_ENGINE_B_REWARD`) | routes.ts:3854 |
| **Engine C** | Weekly Guild Task | 45% | 20% | 35% | +15 task PS (default `PS_ENGINE_C_REWARD`) | routes.ts:1289 |
| **Indirect** | Referral (on withdrawal) | 0% PKR; referrer gets ~7.5% of referred user's withdrawal | — | — | No task PS; streak PS only | storage.ts:processWithdrawal |
| **HilltopAds Service** | Scheduler (24h) + Manual | N/A | N/A | N/A | N/A | hilltopads-service.ts |
| **HilltopAds Admin** | Admin action | N/A | N/A | N/A | N/A | HilltopAdsAdmin.tsx |
| **Ad Completion Tracker** | Client SDK (3s) | 0% (log only) | — | — | — | routes.ts:4079 |

---

## THORX Mein Implementation Locations

```
server/
├── routes.ts
│   ├── Line ~41     → AD_INVENTORY runtime cache (60s TTL)
│   ├── Line ~1631   → POST /api/ad-view (Engine A)
│   ├── Line ~1735   → GET /api/ad-views/today
│   ├── Line ~1207   → GET/POST /api/guilds/:id/chat (Engine C chat)
│   ├── Line ~1245   → GET/POST /api/guilds/weekly-tasks (Engine C)
│   ├── Line ~3825   → POST /api/tasks/:id/click (Engine B)
│   ├── Line ~3854   → POST /api/tasks/:id/verify (Engine B)
│   ├── Line ~3659   → POST /api/hilltopads/config (Admin)
│   ├── Line ~4079   → POST /api/hilltopads/ad-completion (Tracker)
│   ├── Line ~4121   → POST /api/hilltopads/sync/inventory (Admin)
│   ├── Line ~4131   → POST /api/hilltopads/sync/stats (Admin)
│   └── Line ~4152   → GET /api/hilltopads/anti-adblock/:zoneId (Public)
├── storage.ts
│   ├── Line ~912    → recordEarnEvent() [all engines]
│   └── Line ~1136   → createAdView()
├── hilltopads-service.ts → HilltopAdsService class
└── hilltopads-scheduler.ts → 24h automated sync

client/src/
├── components/ads/HilltopAdsPlayer.tsx → WaterfallAdPlayer (Engine A UI)
├── pages/AdLanding.tsx → Brand landing pages (Binance, Daraz, Foodpanda etc.)
└── pages/HilltopAdsAdmin.tsx → Admin control panel UI
```

---

*Report generated from real production codebase — July 24, 2026*
