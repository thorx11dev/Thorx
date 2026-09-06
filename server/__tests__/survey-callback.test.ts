/**
 * Engine B — survey network callbacks (CPX Research / BitLabs) regression.
 *
 * Mirrors ad-webhook.test.ts for the survey waterfall. Locks in the security
 * contract that makes survey credits real:
 *   1. A correctly-signed BitLabs callback (SHA-1 HMAC of URI minus hash,
 *      keyed with the App Secret) credits the user EXACTLY once — ledger row
 *      with sourceType "survey" + a completed survey_records row.
 *   2. The same callback replayed (vendor retry after our 200) is an
 *      idempotent no-credit duplicate.
 *   3. A wrong signature is rejected (401) and credits nothing.
 *   4. An unknown network id is rejected (401) — stubs can never mint credit.
 *   5. A CPX Research callback (MD5 of trans_id+app_secure_hash per CPX dashboard docs)
 *      also credits exactly once, on a second user, proving both adapters.
 *   6. CPX dashboard contract: amount_usd param, type=complete/out/bonus
 *      semantics (bonus skips the daily cap), status=2 fraud reversal claws
 *      back the stored gross PKR idempotently, amount_local never treated as
 *      USD, and the Script Tag config in /api/surveys never leaks the secret.
 *   7. BitLabs RECONCILIATION (negative usd + ref tx) reverses the original
 *      credit instead of surfacing as INVALID_PARAMS.
 *
 * Run: npx vitest run server/__tests__/survey-callback.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import crypto from "crypto";
import { db, pool } from "../db";
import { users, surveyRecords, userTransactions, systemConfig } from "@shared/schema";
import { eq, inArray, sql, and } from "drizzle-orm";

const TS = Date.now();
const PASSWORD = "TestPass123!";
const BITLABS_SECRET = "bitlabs_test_secret";
const BITLABS_TOKEN = "bitlabs_test_token";
const CPX_API_ID = "cpx_test_app_id";
const CPX_HASH = "cpx_test_hash";

const CONFIG_KEYS = [
  "SURVEY_NETWORKS_JSON",
  "BITLABS_CONFIG_JSON",
  "CPX_RESEARCH_CONFIG_JSON",
  "SURVEY_USD_TO_PKR_RATE",
  "SURVEY_MAX_PER_DAY",
  "SURVEY_MIN_RANK",
];

let app: any;
const cfgSnapshot = new Map<string, any>();
const createdUserIds: string[] = [];

function getCsrfToken(res: request.Response): string {
  const cookies: string[] = Array.isArray(res.headers["set-cookie"])
    ? res.headers["set-cookie"]
    : res.headers["set-cookie"] ? [res.headers["set-cookie"]] : [];
  for (const c of cookies) {
    const m = c.match(/thorx\.csrf\.v2=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return "";
}

function makeHarness() {
  const h: any = { agent: null as Agent | null, csrf: "" };
  h.agent = request.agent(app);
  h.seed = async () => {
    const r = await h.agent.get("/api/health");
    h.csrf = getCsrfToken(r);
  };
  h.post = async (path: string, body: object) => {
    const r = await h.agent.post(path).set("x-csrf-token", h.csrf).send(body);
    const fresh = getCsrfToken(r);
    if (fresh) h.csrf = fresh;
    return r;
  };
  return h;
}

async function countSurveyCredits(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(userTransactions)
    .where(and(eq(userTransactions.userId, userId), eq(userTransactions.sourceType, "survey")));
  return Number(row?.n ?? 0);
}

async function registerUser(key: string) {
  const h = makeHarness();
  await h.seed();
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `svy_${key}_${TS}_${suffix}@thorx-test.local`;
  const res = await h.post("/api/register", {
    firstName: key,
    lastName: "E2E",
    identity: `svy_${key}_${TS}_${suffix}`,
    phone: `033${Math.floor(10000000 + Math.random() * 89999999)}`,
    email,
    password: PASSWORD,
  });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id);
  return { h, user: res.body.user };
}

/** BitLabs-style signature: SHA-1 HMAC (hex) over path+query without the hash param. */
function signBitLabs(pathWithQuery: string, secret = BITLABS_SECRET): string {
  return crypto.createHmac("sha1", secret).update(pathWithQuery, "utf8").digest("hex");
}

/** CPX-style signature: MD5(trans_id + app_secure_hash) per CPX dashboard docs. */
function signCpx(transId: string, _userId: string, _amount: string, hashKey = CPX_HASH): string {
  return crypto.createHash("md5").update(`${transId}${hashKey}`, "utf8").digest("hex");
}

async function getWall(h: any) {
  return h.agent.get("/api/surveys");
}

beforeAll(async () => {
  const expressModule = await import("express");
  app = expressModule.default();
  app.use(expressModule.default.json({
    limit: "10mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }));
  app.use(expressModule.default.urlencoded({ extended: false }));
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);

  for (const key of CONFIG_KEYS) {
    const [row] = await db
      .select({ value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    if (row) cfgSnapshot.set(key, row.value);
  }

  const upsert = (key: string, value: any) =>
    db.insert(systemConfig).values({ key, value }).onConflictDoUpdate({
      target: systemConfig.key,
      set: { value, updatedAt: new Date() },
    });

  await upsert("SURVEY_NETWORKS_JSON", [
    { id: "cpx-research", name: "CPX Research", priority: 1, isActive: true },
    { id: "bitlabs", name: "BitLabs", priority: 2, isActive: true },
  ]);
  await upsert("BITLABS_CONFIG_JSON", { appToken: BITLABS_TOKEN, secret: BITLABS_SECRET });
  await upsert("CPX_RESEARCH_CONFIG_JSON", { apiId: CPX_API_ID, hash: CPX_HASH });
  await upsert("SURVEY_USD_TO_PKR_RATE", 278);
  await upsert("SURVEY_MAX_PER_DAY", 20);
  await upsert("SURVEY_MIN_RANK", "E-Rank");
}, 120_000);

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(surveyRecords).where(inArray(surveyRecords.userId, createdUserIds)).catch(() => {});
    await db.delete(userTransactions).where(inArray(userTransactions.userId, createdUserIds)).catch(() => {});
    await db.delete(users).where(inArray(users.id, createdUserIds)).catch(() => {});
  }
  for (const key of CONFIG_KEYS) {
    if (cfgSnapshot.has(key)) {
      await db.update(systemConfig).set({ value: cfgSnapshot.get(key) }).where(eq(systemConfig.key, key));
    } else {
      await db.delete(systemConfig).where(eq(systemConfig.key, key)).catch(() => {});
    }
  }
  await pool.end();
}, 60_000);

describe("Engine B — survey callbacks (BitLabs + CPX Research)", () => {
  it("wall returns configured networks with wall URLs embedding the user id", async () => {
    const { h, user } = await registerUser("wall");

    const res = await getWall(h);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.dailyCap).toBe(20);

    const bitlabs = res.body.networks.find((n: any) => n.networkId === "bitlabs");
    expect(bitlabs.available).toBe(true);
    expect(bitlabs.wallUrl).toContain(BITLABS_TOKEN);
    expect(decodeURIComponent(bitlabs.wallUrl)).toContain(user.id);
  });

  it("a signed BitLabs callback credits exactly once (ledger + record)", async () => {
    const { h, user } = await registerUser("bl_ok");

    // No credit just from opening the wall.
    expect((await getWall(h)).status).toBe(200);
    expect(await countSurveyCredits(user.id)).toBe(0);

    const txId = `tx_ok_${TS}`;
    const base = `/api/webhooks/survey/bitlabs?uid=${user.id}&usd=0.75&tx=${txId}`;
    const sig = signBitLabs(base);

    const res = await request(app).get(`${base}&hash=${sig}`);
    expect(res.status).toBe(200);
    expect(res.body.credited).toBe(true);

    expect(await countSurveyCredits(user.id)).toBe(1);

    const [record] = await db
      .select({ status: surveyRecords.status, grossPkr: surveyRecords.grossPkr, rewardUsd: surveyRecords.rewardUsd })
      .from(surveyRecords)
      .where(eq(surveyRecords.transactionId, txId))
      .limit(1);
    expect(record?.status).toBe("completed");
    expect(Number(record?.rewardUsd ?? 0)).toBeCloseTo(0.75, 3);
    // 0.75 USD × 278 PKR/USD = 208.50 gross → split happens inside recordEarnEvent.
    expect(Number(record?.grossPkr ?? 0)).toBeCloseTo(208.5, 2);
  });

  it("a replayed BitLabs callback (vendor retry) is an idempotent no-credit duplicate", async () => {
    const { user } = await registerUser("bl_rp");

    const txId = `tx_rp_${TS}`;
    const base = `/api/webhooks/survey/bitlabs?uid=${user.id}&usd=0.50&tx=${txId}`;
    const url = `${base}&hash=${signBitLabs(base)}`;

    const first = await request(app).get(url);
    expect(first.status).toBe(200);
    expect(first.body.credited).toBe(true);

    const second = await request(app).get(url);
    expect(second.status).toBe(200);
    expect(second.body.credited).toBe(false);

    expect(await countSurveyCredits(user.id)).toBe(1);
    const [countRow] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(surveyRecords)
      .where(eq(surveyRecords.transactionId, txId));
    expect(Number(countRow?.n ?? 0)).toBe(1);
  });

  it("a wrong BitLabs hash is rejected (401) and credits nothing", async () => {
    const { user } = await registerUser("bl_bad");

    const txId = `tx_bad_${TS}`;
    const base = `/api/webhooks/survey/bitlabs?uid=${user.id}&usd=1.00&tx=${txId}`;

    const res = await request(app).get(`${base}&hash=${signBitLabs(base, "attacker_secret")}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("CALLBACK_REJECTED");
    expect(await countSurveyCredits(user.id)).toBe(0);
  });

  it("an unknown network id is rejected (401) even with plausible params", async () => {
    const { user } = await registerUser("unk");

    const res = await request(app).get(
      `/api/webhooks/survey/fake-network?uid=${user.id}&usd=5.00&tx=tx_unk&hash=deadbeef`,
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("CALLBACK_REJECTED");
    expect(await countSurveyCredits(user.id)).toBe(0);
  });

  it("a CPX Research callback (MD5 scheme) credits exactly once", async () => {
    const { user } = await registerUser("cpx_ok");

    const transId = `cpx_tx_${TS}`;
    const amount = "1.25";
    const sig = signCpx(transId, user.id, amount);
    const res = await request(app).get(
      `/api/webhooks/survey/cpx-research?user_id=${user.id}&trans_id=${transId}&currency_amount=${amount}&hash=${sig}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.credited).toBe(true);
    expect(await countSurveyCredits(user.id)).toBe(1);
  });

  // ── Deep integration: CPX Research end-to-end ─────────────────────────────
  describe("CPX Research — deep integration", () => {
    it("wall link uses offers.cpx-research.com (not walls.cpx-research.com)", async () => {
      const { h, user } = await registerUser("cpx_wall");
      const res = await getWall(h);
      const cpx = res.body.networks.find((n: any) => n.networkId === "cpx-research");
      expect(cpx?.available).toBe(true);
      expect(cpx.wallUrl).toContain("offers.cpx-research.com");
      expect(cpx.wallUrl).not.toContain("walls.cpx-research.com");
    });

    it("wall link embeds app_id, real user UUID (not a placeholder), and secure_hash", async () => {
      const { h, user } = await registerUser("cpx_hash");
      const res = await getWall(h);
      const cpx = res.body.networks.find((n: any) => n.networkId === "cpx-research");
      const url = new URL(cpx.wallUrl);
      expect(url.searchParams.get("app_id")).toBe(CPX_API_ID);
      // Must be the real user UUID, not a placeholder like {THORX_USER_ID} or __UID__
      const extUid = url.searchParams.get("ext_user_id");
      expect(extUid).toBe(user.id);
      expect(extUid).not.toContain("__UID__");
      expect(extUid).not.toContain("{");
      // secure_hash = md5(userId + "-" + hash)
      const secureHash = url.searchParams.get("secure_hash");
      expect(secureHash).toBeTruthy();
      const expectedHash = crypto.createHash("md5").update(`${user.id}-${CPX_HASH}`, "utf8").digest("hex");
      expect(secureHash).toBe(expectedHash);
    });

    it("CPX credit updates user balance, total_earnings, and TX points", async () => {
      const { user } = await registerUser("cpx_bal");

      // Snapshot balances before credit
      const [before] = await db
        .select({ pending: users.pendingBalance, earnings: users.totalEarnings })
        .from(users).where(eq(users.id, user.id)).limit(1);
      const pendingBefore = Number(before.pending ?? 0);
      const earnBefore = Number(before.earnings ?? 0);

      const transId = `cpx_bal_${TS}`;
      const amount = "2.00"; // 2.00 USD × 278 = 556.00 PKR gross; 60% user = 333.60 PKR
      const sig = signCpx(transId, user.id, amount);
      const res = await request(app).get(
        `/api/webhooks/survey/cpx-research?user_id=${user.id}&trans_id=${transId}&currency_amount=${amount}&hash=${sig}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.credited).toBe(true);

      // v4: credited PKR lands in PENDING (verification lifecycle) — never
      // straight to available.
      const [after] = await db
        .select({ pending: users.pendingBalance, available: users.availableBalance, earnings: users.totalEarnings, points: users.txPointsBalance })
        .from(users).where(eq(users.id, user.id)).limit(1);
      expect(Number(after.pending)).toBeGreaterThan(pendingBefore);
      expect(Number(after.available)).toBe(0);
      expect(Number(after.earnings)).toBeGreaterThan(earnBefore);
      expect(Number(after.points)).toBeGreaterThan(0);

      // Verify survey record exists with correct PKR calculation
      const [record] = await db
        .select({ grossPkr: surveyRecords.grossPkr, rewardUsd: surveyRecords.rewardUsd })
        .from(surveyRecords).where(eq(surveyRecords.transactionId, transId)).limit(1);
      expect(Number(record?.rewardUsd)).toBeCloseTo(2.00, 2);
      expect(Number(record?.grossPkr)).toBeCloseTo(556.0, 0); // 2 × 278
    });

    it("daily cap enforcement — 21st survey in a day is rejected", async () => {
      const { user } = await registerUser("cpx_cap");

      // Seed 20 completed survey records today (at the cap)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      for (let i = 0; i < 20; i++) {
        await db.insert(surveyRecords).values({
          userId: user.id,
          networkId: "cpx-research",
          transactionId: `cap_seed_${TS}_${i}`,
          status: "completed",
          rewardUsd: "1.00",
          grossPkr: "278.0000",
          completedAt: todayStart,
        });
      }

      // 21st survey should be rejected as daily_cap
      const transId = `cpx_cap_21st_${TS}`;
      const sig = signCpx(transId, user.id, "0.50");
      const res = await request(app).get(
        `/api/webhooks/survey/cpx-research?user_id=${user.id}&trans_id=${transId}&currency_amount=0.50&hash=${sig}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.credited).toBe(false);
      expect(res.body.reason).toBe("DAILY_CAP");
    });

    it("CPX callback via POST body (not just GET query)", async () => {
      const { user } = await registerUser("cpx_post");

      const transId = `cpx_post_${TS}`;
      const amount = "0.75";
      const sig = signCpx(transId, user.id, amount);

      const res = await request(app)
        .post("/api/webhooks/survey/cpx-research")
        .send({
          user_id: user.id,
          trans_id: transId,
          currency_amount: amount,
          hash: sig,
        });
      expect(res.status).toBe(200);
      expect(res.body.credited).toBe(true);
      expect(await countSurveyCredits(user.id)).toBe(1);
    });

    it("wall shows 0/N progress when cap already exhausted", async () => {
      const { h, user } = await registerUser("cpx_wall_cap");

      // Exhaust cap
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      for (let i = 0; i < 20; i++) {
        await db.insert(surveyRecords).values({
          userId: user.id,
          networkId: "bitlabs",
          transactionId: `wall_cap_${TS}_${i}`,
          status: "completed",
          rewardUsd: "1.00",
          grossPkr: "278.0000",
          completedAt: todayStart,
        });
      }

      const res = await getWall(h);
      expect(res.body.completedToday).toBe(20);
      expect(res.body.dailyCap).toBe(20);
      // When cap is hit, network list should be empty (client hides buttons)
      expect(res.body.networks).toHaveLength(0);
    });

    it("CPX dash-separated hash also accepted (fallback formula)", async () => {
      const { user } = await registerUser("cpx_dash");

      const transId = `cpx_dash_${TS}`;
      const amount = "0.50";
      // Try dash-separated formula: MD5(trans_id + "-" + hash)
      const dashSig = crypto.createHash("md5").update(`${transId}-${CPX_HASH}`, "utf8").digest("hex");

      const res = await request(app).get(
        `/api/webhooks/survey/cpx-research?user_id=${user.id}&trans_id=${transId}&currency_amount=${amount}&hash=${dashSig}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.credited).toBe(true);
      expect(await countSurveyCredits(user.id)).toBe(1);
    });

    it("CPX missing hash param is rejected (401)", async () => {
      const { user } = await registerUser("cpx_nohash");

      const res = await request(app).get(
        `/api/webhooks/survey/cpx-research?user_id=${user.id}&trans_id=tx_no_hash&currency_amount=1.00`,
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("CALLBACK_REJECTED");
      expect(await countSurveyCredits(user.id)).toBe(0);
    });

    it("CPX unknown user id is rejected (400)", async () => {
      const transId = `cpx_unknown_${TS}`;
      const fakeUserId = "00000000-0000-0000-0000-000000000000";
      const sig = signCpx(transId, fakeUserId, "1.00");

      const res = await request(app).get(
        `/api/webhooks/survey/cpx-research?user_id=${fakeUserId}&trans_id=${transId}&currency_amount=1.00&hash=${sig}`,
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("UNKNOWN_USER");
    });

    it("wall returns the CPX Script Tag config (appId, extUserId, secure_hash)", async () => {
      const { h, user } = await registerUser("cpx_scriptcfg");
      const res = await getWall(h);
      expect(res.body.cpx).toBeTruthy();
      expect(res.body.cpx.appId).toBe(CPX_API_ID);
      expect(res.body.cpx.extUserId).toBe(user.id);
      const expectedHash = crypto.createHash("md5").update(`${user.id}-${CPX_HASH}`, "utf8").digest("hex");
      expect(res.body.cpx.secureHash).toBe(expectedHash);
      // Raw app hash secret must NEVER leak to the client.
      expect(JSON.stringify(res.body)).not.toContain(CPX_HASH);
    });

    it("CPX postback with amount_usd (dashboard placeholder) credits correctly", async () => {
      const { user } = await registerUser("cpx_usd");

      const transId = `cpx_usd_${TS}`;
      const sig = signCpx(transId, user.id, "0.40");
      const res = await request(app).get(
        `/api/webhooks/survey/cpx-research?status=1&type=complete&user_id=${user.id}&trans_id=${transId}&amount_usd=0.40&amount_local=111.20&hash=${sig}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.credited).toBe(true);

      // amount_local (111.20 = 0.40 × 278 display PKR) must NOT be used as USD.
      const [record] = await db
        .select({ rewardUsd: surveyRecords.rewardUsd, grossPkr: surveyRecords.grossPkr })
        .from(surveyRecords).where(eq(surveyRecords.transactionId, transId)).limit(1);
      expect(Number(record?.rewardUsd)).toBeCloseTo(0.40, 3);
      expect(Number(record?.grossPkr)).toBeCloseTo(0.40 * 278, 1);
    });

    it("CPX type=out (screen-out) is acknowledged with no credit", async () => {
      const { user } = await registerUser("cpx_out");

      const transId = `cpx_out_${TS}`;
      const sig = signCpx(transId, user.id, "0");
      const res = await request(app).get(
        `/api/webhooks/survey/cpx-research?status=1&type=out&user_id=${user.id}&trans_id=${transId}&amount_usd=0&hash=${sig}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.credited).toBe(false);
      expect(res.body.ignored).toBe("CPX_SCREENOUT");
      expect(await countSurveyCredits(user.id)).toBe(0);
    });

    it("CPX type=bonus credits WITHOUT charging the daily cap", async () => {
      const { user } = await registerUser("cpx_bonus");

      // Seed the cap with 20 completions.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      for (let i = 0; i < 20; i++) {
        await db.insert(surveyRecords).values({
          userId: user.id,
          networkId: "cpx-research",
          transactionId: `bonus_seed_${TS}_${i}`,
          status: "completed",
          rewardUsd: "1.00",
          grossPkr: "278.0000",
          completedAt: todayStart,
        });
      }

      const transId = `cpx_bonus_${TS}`;
      const sig = signCpx(transId, user.id, "0.01");
      const res = await request(app).get(
        `/api/webhooks/survey/cpx-research?status=1&type=bonus&user_id=${user.id}&trans_id=${transId}&amount_usd=0.01&hash=${sig}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.credited).toBe(true);

      // Stored as a bonus record, credited, and NOT counted as a completion.
      const [record] = await db
        .select({ status: surveyRecords.status })
        .from(surveyRecords).where(eq(surveyRecords.transactionId, transId)).limit(1);
      expect(record?.status).toBe("bonus");
      expect(await countSurveyCredits(user.id)).toBe(1);

      const [cnt] = await db
        .select({ n: sql<number>`COUNT(*)` })
        .from(surveyRecords)
        .where(sql`${surveyRecords.userId} = ${user.id} AND ${surveyRecords.status} = 'completed'`);
      expect(Number(cnt?.n ?? 0)).toBe(20);
    });

    it("CPX status=2 reverses the original credit (stored gross PKR, idempotent)", async () => {
      const { user } = await registerUser("cpx_rev");

      const [before] = await db
        .select({ pending: users.pendingBalance })
        .from(users).where(eq(users.id, user.id)).limit(1);
      const pendingBefore = Number(before.pending ?? 0);

      // 1 — Original complete: 1.00 USD → 278 PKR gross → 60% user = 166.80 (pending).
      const transId = `cpx_rev_${TS}`;
      const sig = signCpx(transId, user.id, "1.00");
      const credit = await request(app).get(
        `/api/webhooks/survey/cpx-research?status=1&type=complete&user_id=${user.id}&trans_id=${transId}&amount_usd=1.00&hash=${sig}`,
      );
      expect(credit.status).toBe(200);
      expect(credit.body.credited).toBe(true);

      const [afterCredit] = await db
        .select({ pending: users.pendingBalance })
        .from(users).where(eq(users.id, user.id)).limit(1);
      expect(Number(afterCredit.pending)).toBeGreaterThan(pendingBefore);

      // 2 — Reversal: same trans_id, status=2 (fraud cancellation).
      const sig2 = signCpx(transId, user.id, "1.00");
      const reversal = await request(app).get(
        `/api/webhooks/survey/cpx-research?status=2&type=complete&user_id=${user.id}&trans_id=${transId}&amount_usd=1.00&hash=${sig2}`,
      );
      expect(reversal.status).toBe(200);
      expect(reversal.body.credited).toBe(false);
      expect(reversal.body.ignored).toBe("CPX_REVERSAL");
      expect(reversal.body.outcome).toBe("reversed");

      const [afterReversal] = await db
        .select({ pending: users.pendingBalance })
        .from(users).where(eq(users.id, user.id)).limit(1);
      expect(Number(afterReversal.pending)).toBeCloseTo(pendingBefore, 2);

      const [record] = await db
        .select({ status: surveyRecords.status })
        .from(surveyRecords).where(eq(surveyRecords.transactionId, transId)).limit(1);
      expect(record?.status).toBe("reconciled");

      // 3 — Retried reversal (vendor retry) is an idempotent no-op.
      const retry = await request(app).get(
        `/api/webhooks/survey/cpx-research?status=2&type=complete&user_id=${user.id}&trans_id=${transId}&amount_usd=1.00&hash=${sig2}`,
      );
      expect(retry.status).toBe(200);
      expect(retry.body.outcome).toBe("already_reversed");
      expect(Number((await db.select({ pending: users.pendingBalance }).from(users).where(eq(users.id, user.id)).limit(1))[0].pending)).toBeCloseTo(pendingBefore, 2);
    });

    it("BitLabs RECONCILIATION (negative usd, ref tx) reverses the original credit", async () => {
      const { user } = await registerUser("bl_rev");

      const origTx = `bl_rev_orig_${TS}`;
      const origBase = `/api/webhooks/survey/bitlabs?uid=${user.id}&usd=0.80&tx=${origTx}`;
      const orig = await request(app).get(`${origBase}&hash=${signBitLabs(origBase)}`);
      expect(orig.status).toBe(200);
      expect(orig.body.credited).toBe(true);

      const [beforeRev] = await db
        .select({ pending: users.pendingBalance })
        .from(users).where(eq(users.id, user.id)).limit(1);

      // Reconciliation references the original tx via `ref` and carries a negative usd.
      const reconTx = `bl_rev_recon_${TS}`;
      const reconBase = `/api/webhooks/survey/bitlabs?type=RECONCILIATION&uid=${user.id}&usd=-0.80&tx=${reconTx}&ref=${origTx}`;
      const recon = await request(app).get(`${reconBase}&hash=${signBitLabs(reconBase)}`);
      expect(recon.status).toBe(200);
      expect(recon.body.ignored).toBe("RECONCILIATION");
      expect(recon.body.outcome).toBe("reversed");

      const [record] = await db
        .select({ status: surveyRecords.status })
        .from(surveyRecords).where(eq(surveyRecords.transactionId, origTx)).limit(1);
      expect(record?.status).toBe("reconciled");

      const [afterRev] = await db
        .select({ pending: users.pendingBalance })
        .from(users).where(eq(users.id, user.id)).limit(1);
      expect(Number(afterRev.pending)).toBeLessThan(Number(beforeRev.pending));
    });
  });
});
