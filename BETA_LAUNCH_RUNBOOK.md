# THORX Beta v0.9 — Launch Runbook

Everything shipped in this repo is production-ready. This checklist is the
remaining path from "code complete" to "first beta user earns".

## 1. What is live in the product

| Engine | Flow | Status |
|---|---|---|
| **A — Rewarded Ads** | Session-token ad watch → network webhook/HMAC verify → credit | ✅ Code-ready (needs network keys) |
| **B — Paid Surveys** | Survey Wall (CPX Research + BitLabs waterfall) → signed S2S callback → credit | ✅ Code-ready (needs network keys) |
| **C — Guilds & Wars** | Weekly targets, Sunday pool, war chests funded from THORX cut only | ✅ Live |
| **Referral** | Direct-only: 1% of referral earns + 50% of withdrawal fee share | ✅ Live |
| **Trust layer** | Honesty-rules gate, feedback inbox, invite codes, geo guard | ✅ Live |
| **PWA** | Installable Android/iPhone app shell (manifest + SW + icons) | ✅ Live in prod builds |

## 2. Activate earning networks (blocks real earnings)

All keys go to **Settings → System Config** (or env for secrets):

- [ ] `CPX_RESEARCH_CONFIG_JSON` = `{"apiId":"…","hash":"…"}` — one command:
      `CPX_APP_ID=<id> CPX_SECURE_HASH=<hash> npm run setup:cpx`
      CPX dashboard → Postback URL (paste exactly):
      `https://<your-domain>/api/webhooks/survey/cpx-research?status={status}&trans_id={trans_id}&user_id={user_id}&amount_usd={amount_usd}&amount_local={amount_local}&type={type}&hash={secure_hash}`
      **Required dashboard fixes before launch:**
      - Currency Factor → set `1 $ is 278.00` (currently 2780 — 10× mismatch with
        `SURVEY_USD_TO_PKR_RATE`; users would see inflated wall rewards)
      - Redirect URL → leave empty or `https://<your-domain>/` (currently points
        back at the CPX wall itself — pointless loop)
      - Security Check → enabled (secure_hash MD5 verification)
      - Test Mode → ON + your Test Mode ExtUserIds while validating; OFF at launch
- [ ] `BITLABS_CONFIG_JSON` = `{"appToken":"…","secret":"…"}` — callback URL:
      `https://<your-domain>/api/webhooks/survey/bitlabs`
- [ ] `TIMEWALL_CONFIG_JSON` = `{"siteId":"…","secret":"…"}` — callback URL:
      `https://<your-domain>/api/webhooks/survey/timewall`
- [ ] `PRIMESURVEYS_CONFIG_JSON` = `{"appId":"…","apiKey":"…"}` — callback URL:
      `https://<your-domain>/api/webhooks/survey/primesurveys`
- [ ] `THEOREMREACH_CONFIG_JSON` = `{"companyId":"…","secretKey":"…"}` — redirect URL:
      `https://<your-domain>/api/webhooks/survey/theoremreach`
- [ ] `LOOTABLY_CONFIG_JSON` = `{"placementId":"…","postbackSecret":"…"}` — postback URL:
      `https://<your-domain>/api/webhooks/survey/lootably`
- [ ] `SURVEY_NETWORKS_JSON` — enable each network:
      `[{"id":"cpx-research","name":"CPX Research","priority":1,"isActive":true},
       {"id":"timewall","name":"TimeWall","priority":2,"isActive":true},
       {"id":"lootably","name":"Lootably","priority":3,"isActive":true},
       {"id":"primesurveys","name":"PrimeSurveys","priority":4,"isActive":true},
       {"id":"theoremreach","name":"TheoremReach","priority":5,"isActive":true},
       {"id":"bitlabs","name":"BitLabs","priority":6,"isActive":true}]`
- [ ] `HILLTOPADS_API_KEY` (env secret) — unlocks Engine A zone inventory sync
- [ ] `WEBHOOK_SECRETS_JSON` — per-network HMAC secrets for ad-complete callbacks

Until a network is configured it is hidden from the wall and its callbacks are
rejected — no stub can mint credit.

## 3. Close the gates (controlled 1000-user beta)

- [ ] Settings → System Config → `BETA_INVITE_REQUIRED` = `true`
- [ ] Team Portal → **Beta Control → Invites** → mint batch codes (e.g. 20 codes × 50 uses)
- [ ] Share codes via WhatsApp/community channels; registration form shows the
      invite field automatically ("X invites left")

## 4. Tune the economy before day 1

- [ ] `SURVEY_USD_TO_PKR_RATE` (default 278) — sanity-check against live rates
- [ ] `SURVEY_MAX_PER_DAY` (default 20) and `MAX_ADS_PER_DAY` (default 20)
- [ ] `ENGINE_B_THORX_CUT_PCT` / `ENGINE_A_THORX_CUT_PCT` (default 40% platform cut)
- [ ] `MIN_PAYOUT` (default Rs.100)

## 5. Beta operations loop

- **User reports** land in Team Portal → Beta Control → Feedback Inbox; replying
  notifies the user automatically. Triage daily during week 1.
- **Quality signals:** survey honesty rules are acknowledged on-record at first
  login; geo/VPN guard runs on register; duplicate-credit is impossible by
  partial unique indexes (`uniq_survey_network_tx`, `uniq_user_transactions_source`).
- **Deploy:** `freebuff-deploy check` → fix reported issues → deploy. Prod env
  vars are separate from sandbox `.env` — set secrets via deploy env.

## 6. Known non-blockers

- Survey wall shows "coming online soon" until §2 keys exist — expected.
- Ad panel falls back to the legacy simulated timer when no ad network has an
  active zone — replace as soon as HilltopAds key lands.
- Test suites insert throwaway CPA-style tasks into the dev DB when run; never
  run `npm test` against production.

## 7. CPX Research — go-live validation (after §2 CPX step)

1. Provision credentials → `npm run setup:cpx` (see §2).
2. Set the CPX dashboard postback URL + fix Currency Factor (§2 checklist).
3. CPX Test Mode ON → add your account id to Test Mode ExtUserIds.
4. Log in → Work tab → the embedded CPX widget should render surveys; use the
   wall's test buttons to simulate: complete, screen-out (with/without bonus),
   and cancel. Each fires a signed postback to `/api/webhooks/survey/cpx-research`.
5. Verify per scenario in Team Portal → Users → (user) → transactions:
   - complete → `survey` ledger row, balance up, `survey_records.status = completed`
   - screen-out (`type=out`) → ack 200, NO ledger row
   - bonus (`type=bonus`) → ledger row, `survey_records.status = bonus`, does NOT
     consume the daily cap
   - cancel (`status=2`) → original credit reversed, `survey_records.status = reconciled`
6. Flip CPX Test Mode OFF → real earnings begin.
