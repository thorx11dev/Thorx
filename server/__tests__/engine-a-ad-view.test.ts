/**
 * Engine A — ad-view money hardening (2026-08).
 *
 * Regression suite for the Phase 1 Engine A hardening:
 *   1. POST /api/hilltopads/ad-completion no longer credits anything (the
 *      money-faucet endpoint — previously an unratelimited credit path). It is
 *      now a log-only stub: the ad_view row it writes is completed:false and
 *      no user_transactions row is created.
 *   2. POST /api/ad-view with an adId that is not in the configured inventory
 *      is rejected (400 INVALID_AD) and credits nothing — previously any
 *      unknown adId silently fell back to hilltop_fallback and paid the user
 *      from THORX's own pocket.
 *   3. MAX_ADS_PER_DAY is now enforced server-side inside the advisory-locked
 *      transaction: the (cap+1)-th completed view the same day returns
 *      429 DAILY_LIMIT and creates no row. It was previously UI-only.
 *   4. A valid configured ad still credits end-to-end (regression guard).
 *
 * Run: npx vitest run server/__tests__/engine-a-ad-view.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import { db, pool } from "../db";
import { users, adViews, userTransactions, systemConfig } from "@shared/schema";
import { eq, inArray, sql, and } from "drizzle-orm";

const TS = Date.now();
const PASSWORD = "TestPass123!";
const CONFIG_KEYS = ["AD_INVENTORY_JSON", "MAX_ADS_PER_DAY"];

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

async function countCredits(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(userTransactions)
    .where(and(eq(userTransactions.userId, userId), eq(userTransactions.sourceType, "ad_view")));
  return Number(row?.n ?? 0);
}

async function registerUser(key: string) {
  const h = makeHarness();
  await h.seed();
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `ea_${key}_${TS}_${suffix}@thorx-test.local`;
  const res = await h.post("/api/register", {
    firstName: key,
    lastName: "E2E",
    identity: `ea_${key}_${TS}_${suffix}`,
    phone: `032${Math.floor(10000000 + Math.random() * 89999999)}`,
    email,
    password: PASSWORD,
  });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id);
  return { h, user: res.body.user };
}

beforeAll(async () => {
  const expressModule = await import("express");
  app = expressModule.default();
  app.use(expressModule.default.json({ limit: "10mb" }));
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

  // Deterministic, cap-friendly inventory: qa_cap_ad uses duration 1 so the
  // timing gap (duration - 2 = -1) never blocks the rapid-fire cap test.
  await db.insert(systemConfig).values({
    key: "AD_INVENTORY_JSON",
    value: [
      { id: "qa_cap_ad", reward: "1", duration: 1, type: "network", label: "QA Cap Ad" },
      { id: "hilltop_fallback", reward: "0.02", duration: 5, type: "network", label: "Network Fallback" },
    ],
  }).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value: [
      { id: "qa_cap_ad", reward: "1", duration: 1, type: "network", label: "QA Cap Ad" },
      { id: "hilltop_fallback", reward: "0.02", duration: 5, type: "network", label: "Network Fallback" },
    ], updatedAt: new Date() },
  });

  await db.insert(systemConfig).values({ key: "MAX_ADS_PER_DAY", value: 2 })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: 2, updatedAt: new Date() },
    });
}, 120_000);

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(adViews).where(inArray(adViews.userId, createdUserIds)).catch(() => {});
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

describe("Engine A — ad-view money hardening", () => {
  it("faucet closed: /api/hilltopads/ad-completion no longer credits", async () => {
    const { h, user } = await registerUser("faucet");
    const before = await countCredits(user.id);
    expect(before).toBe(0);

    // Route still exists but is a log-only stub — returns success, credits nothing.
    const res = await h.post("/api/hilltopads/ad-completion", { zoneId: "zone-x", adType: "video", duration: 30 });
    expect(res.status).toBe(200);

    const after = await countCredits(user.id);
    expect(after).toBe(0);

    // The log row (if any) must be recorded as NOT completed.
    const [rows] = await db
      .select({ completed: adViews.completed, earned: adViews.earnedAmount })
      .from(adViews)
      .where(eq(adViews.userId, user.id));
    expect(rows?.completed).toBe(false);
  });

  it("unknown adId is rejected with 400 INVALID_AD and credits nothing", async () => {
    const { h, user } = await registerUser("unknown");
    const before = await countCredits(user.id);

    const res = await h.post("/api/ad-view", { adId: "totally_bogus_ad" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_AD");

    const after = await countCredits(user.id);
    expect(after).toBe(before);
  });

  it("MAX_ADS_PER_DAY is enforced server-side: (cap+1)-th view → 429 DAILY_LIMIT", async () => {
    const { h, user } = await registerUser("cap");

    const r1 = await h.post("/api/ad-view", { adId: "qa_cap_ad" });
    expect(r1.status).toBe(201);
    const r2 = await h.post("/api/ad-view", { adId: "qa_cap_ad" });
    expect(r2.status).toBe(201);

    const r3 = await h.post("/api/ad-view", { adId: "qa_cap_ad" });
    expect(r3.status).toBe(429);
    expect(r3.body.error).toBe("DAILY_LIMIT");

    // Exactly cap completed views — the rejected one created no row.
    const [views] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(adViews)
      .where(and(eq(adViews.userId, user.id), eq(adViews.completed, true)));
    expect(Number(views?.n ?? 0)).toBe(2);
    expect(await countCredits(user.id)).toBe(2);
  });

  it("a valid configured ad still credits end-to-end (regression)", async () => {
    const { h, user } = await registerUser("valid");

    const res = await h.post("/api/ad-view", { adId: "qa_cap_ad" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const [tx] = await db
      .select({ sourceType: userTransactions.sourceType, grossPkr: userTransactions.grossPkr })
      .from(userTransactions)
      .where(eq(userTransactions.userId, user.id))
      .limit(1);
    expect(tx?.sourceType).toBe("ad_view");
    expect(tx?.grossPkr).toBe("1.0000");
    expect(await countCredits(user.id)).toBe(1);
  });
});
