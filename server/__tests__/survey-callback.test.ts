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
 *   5. A CPX Research callback (MD5 of trans_id+user_id+currency_amount+hash)
 *      also credits exactly once, on a second user, proving both adapters.
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

/** CPX-style signature: MD5(trans_id + user_id + currency_amount + api_hash). */
function signCpx(transId: string, userId: string, amount: string, hashKey = CPX_HASH): string {
  return crypto.createHash("md5").update(`${transId}${userId}${amount}${hashKey}`, "utf8").digest("hex");
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
});
