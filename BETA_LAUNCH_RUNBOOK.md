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

- [ ] `CPX_RESEARCH_CONFIG_JSON` = `{"apiId":"…","hash":"…"}` — publisher dashboard → postback URL:
      `https://<your-domain>/api/webhooks/survey/cpx-research`
- [ ] `BITLABS_CONFIG_JSON` = `{"appToken":"…","secret":"…"}` — callback URL:
      `https://<your-domain>/api/webhooks/survey/bitlabs`
- [ ] `HILLTOPADS_API_KEY` (env secret) — unlocks Engine A zone inventory sync
- [ ] `WEBHOOK_SECRETS_JSON` — per-network HMAC secrets for ad-complete callbacks
- [ ] Confirm CPX's exact postback MD5 concatenation order in their dashboard and
      align `verifySurveyCallback` (isolated one-line expression, marked TODO(activation))

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
