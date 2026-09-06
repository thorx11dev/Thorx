/**
 * THORX — Rank ↔ Earnings deep E2E (Q6 rank multiplier, Thorx Card variance,
 * PS → rank transitions, rank gates, PS awards, streaks, inactivity penalty,
 * E-Rank floor, admin rank override + lock).
 *
 * Everything user-facing goes through the real HTTP API (CSRF double-submit
 * cookies, sessions, the full earn pipeline). Only rank/PS scaffolding and
 * timestamp back-dating are done directly in the DB — the same shortcuts the
 * rest of the suite already uses to avoid days of PS grinding / 10s waits.
 *
 * Determinism: Engine A variance is pinned to 0 via system_config and the
 * economy multiplier is pinned to 1.0 for the whole file, so the Thorx Card
 * draw is exact for E/D/C/B ranks (A/S get their configured wider band, which
 * is asserted as an exact range). All config keys are restored in afterAll.
 *
 * Run: npx vitest run server/__tests__/rank-earnings.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import bcrypt from "bcrypt";
import { db, pool } from "../db";
import {
  users,
  systemConfig,
  rankLogs,
  notifications,
  userTransactions,
  adViews,
  earnings,
  engineBTasks,
  engineBRecords,
  auditLogs,
} from "@shared/schema";
import { eq, and, inArray, notInArray } from "drizzle-orm";
import { drawThorxCard } from "../modules/thorx-card";
import { applyInactivityPenalties } from "../modules/ps-engine";

const TS = Date.now();
const PASSWORD = "TestPass123!";

const RANK_MULT: Record<string, number> = {
  "E-Rank": 1.0, "D-Rank": 1.1, "C-Rank": 1.2, "B-Rank": 1.35, "A-Rank": 1.5, "S-Rank": 1.75,
};
const TIER_MIN_PS: Record<string, number> = {
  "E-Rank": 0, "D-Rank": 1000, "C-Rank": 3000, "B-Rank": 6000, "A-Rank": 10000, "S-Rank": 20000,
};

let app: any;
const founder = { id: "", email: `rk_founder_${TS}@thorx-test.local` };
const usersState: Record<string, any> = {};
const harnesses: Record<string, any> = {};
const createdIds = { users: [] as string[], engineBTasks: [] as string[] };
const cfgSnapshot = new Map<string, any>();
const CONFIG_KEYS = [
  "TASK_SPLIT_THORX_PCT",
  "TX_POINTS_PER_PKR",
  "AD_INVENTORY_JSON",
  "PS_INACTIVITY_HOURS",
  "PS_INACTIVITY_PENALTY",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  h.get = (path: string) => h.agent.get(path);
  h.post = async (path: string, body: object) => {
    const r = await h.agent.post(path).set("x-csrf-token", h.csrf).send(body);
    const fresh = getCsrfToken(r);
    if (fresh) h.csrf = fresh;
    return r;
  };
  h.patch = async (path: string, body: object) => {
    const r = await h.agent.patch(path).set("x-csrf-token", h.csrf).send(body);
    const fresh = getCsrfToken(r);
    if (fresh) h.csrf = fresh;
    return r;
  };
  return h;
}

async function registerRealUser(key: string, overrides: Partial<{ firstName: string; userRankTier: string }> = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `rk_${key}_${TS}_${suffix}@thorx-test.local`;
  const res = await harnesses[key].post("/api/register", {
    firstName: overrides.firstName ?? key,
    lastName: "E2E",
    identity: `rk_${key}_${TS}_${suffix}`,
    phone: `034${Math.floor(10000000 + Math.random() * 89999999)}`,
    email,
    password: PASSWORD,
  });
  expect(res.status).toBe(201);
  const user = res.body.user;
  createdIds.users.push(user.id);
  usersState[key] = user;

  // Same convention as e2e-full-flow: PS is the sole rank input, so a bare
  // rank bump without matching PS is reverted on the next earn. Set both.
  if (overrides.userRankTier) {
    await db.update(users).set({
      userRankTier: overrides.userRankTier,
      performanceScore: TIER_MIN_PS[overrides.userRankTier] ?? 0,
    }).where(eq(users.id, user.id));
  }

  const login = await harnesses[key].post("/api/login", { email, password: PASSWORD });
  expect(login.status).toBe(200);
  return user;
}

async function readUser(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

async function readConfig(key: string): Promise<{ value: any; exists: boolean }> {
  const [row] = await db.select({ value: systemConfig.value }).from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  return row ? { value: row.value, exists: true } : { value: undefined, exists: false };
}

async function setConfig(key: string, value: any) {
  await db.insert(systemConfig).values({ key, value }).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value, updatedAt: new Date() },
  });
}

async function restoreConfig() {
  for (const key of CONFIG_KEYS) {
    if (cfgSnapshot.has(key)) {
      await db.update(systemConfig).set({ value: cfgSnapshot.get(key) }).where(eq(systemConfig.key, key));
    } else {
      await db.delete(systemConfig).where(eq(systemConfig.key, key)).catch(() => {});
    }
  }
}

async function oneAd(key: string): Promise<request.Response> {
  return harnesses[key].post("/api/ad-view", { adId: "qa_rank_ad" });
}

function pktToday(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysAgoPKT(n: number): string {
  const d = new Date(pktToday() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const expressModule = await import("express");
  app = expressModule.default();
  app.use(expressModule.default.json({ limit: "10mb" }));
  app.use(expressModule.default.urlencoded({ extended: false }));
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);

  // Snapshot every config key we touch so afterAll can restore exactly.
  for (const key of CONFIG_KEYS) {
    const { value, exists } = await readConfig(key);
    if (exists) cfgSnapshot.set(key, value);
  }

  // Deterministic draw environment for the multiplier test.
  await setConfig("ENGINE_A_ILLUSION_VARIANCE_PCT", 0);
  await setConfig("ENGINE_A_THORX_CUT_PCT", 40);
  await setConfig("ENGINE_A_PKR_TO_POINTS_RATIO", 1000);
  await setConfig("CONVERSION_RATE", 1000);
  await setConfig("ECONOMY_MULTIPLIER_OVERRIDE", 1);

  // Add a QA ad with a meaningful reward (default hilltop_fallback is 0.02 PKR
  // → 2 base points, too small to distinguish rank multipliers after flooring).
  const invRaw = (await readConfig("AD_INVENTORY_JSON")).value;
  let inventory: any[] = [];
  if (Array.isArray(invRaw)) inventory = invRaw;
  else if (typeof invRaw === "string" && invRaw.trim()) {
    try { inventory = JSON.parse(invRaw); } catch { inventory = []; }
  }
  inventory = inventory.filter((i: any) => i?.id !== "qa_rank_ad");
  inventory.push({ id: "qa_rank_ad", reward: "100", duration: 1, type: "network" });
  await setConfig("AD_INVENTORY_JSON", inventory);

  // Founder seeded directly (registration never issues founder roles).
  const [f] = await db.insert(users).values({
    firstName: "Rank", lastName: "Founder", identity: `rk_founder_${TS}`,
    phone: `035${Math.floor(10000000 + Math.random() * 89999999)}`,
    email: founder.email, passwordHash: await bcrypt.hash(PASSWORD, 10),
    referralCode: `RKEF-${TS}`, role: "founder",
  } as any).returning();
  founder.id = f.id;
  createdIds.users.push(f.id);

  const keys = [
    "founder",
    "eRank", "dRank", "cRank", "bRank", "aRank", "sRank",
    "transition", "gateLow", "gateHigh", "streak", "inact", "inactFloor", "lockUser",
  ];
  for (const k of keys) {
    harnesses[k] = makeHarness();
    await harnesses[k].seed();
  }
  await harnesses.founder.post("/api/login", { email: founder.email, password: PASSWORD });

  await registerRealUser("eRank",    { firstName: "ERank",    userRankTier: "E-Rank" });
  await registerRealUser("dRank",    { firstName: "DRank",    userRankTier: "D-Rank" });
  await registerRealUser("cRank",    { firstName: "CRank",    userRankTier: "C-Rank" });
  await registerRealUser("bRank",    { firstName: "BRank",    userRankTier: "B-Rank" });
  await registerRealUser("aRank",    { firstName: "ARank",    userRankTier: "A-Rank" });
  await registerRealUser("sRank",    { firstName: "SRank",    userRankTier: "S-Rank" });
  await registerRealUser("transition", { firstName: "Trans",  userRankTier: "E-Rank" });
  await registerRealUser("gateLow",  { firstName: "GateLow",  userRankTier: "E-Rank" });
  await registerRealUser("gateHigh", { firstName: "GateHigh", userRankTier: "C-Rank" });
  await registerRealUser("streak",   { firstName: "Streak",   userRankTier: "E-Rank" });
  await registerRealUser("inact",    { firstName: "Inact",    userRankTier: "D-Rank" });
  await registerRealUser("inactFloor", { firstName: "InactF", userRankTier: "E-Rank" });
  await registerRealUser("lockUser", { firstName: "LockU",    userRankTier: "E-Rank" });

  // transition user: park PS just below the D-Rank threshold.
  await db.update(users).set({ performanceScore: 998 }).where(eq(users.id, usersState.transition.id));
}, 120_000);

afterAll(async () => {
  const uIds = createdIds.users;
  if (uIds.length) {
    await db.delete(earnings).where(inArray(earnings.userId, uIds)).catch(() => {});
    await db.delete(adViews).where(inArray(adViews.userId, uIds)).catch(() => {});
    await db.delete(userTransactions).where(inArray(userTransactions.userId, uIds)).catch(() => {});
    await db.delete(engineBRecords).where(inArray(engineBRecords.userId, uIds)).catch(() => {});
    await db.delete(rankLogs).where(inArray(rankLogs.userId, uIds)).catch(() => {});
    await db.delete(notifications).where(inArray(notifications.userId, uIds)).catch(() => {});
    await db.delete(auditLogs).where(inArray(auditLogs.adminId, uIds)).catch(() => {});
    await db.delete(users).where(inArray(users.id, uIds)).catch(() => {});
  }
  if (createdIds.engineBTasks.length) {
    await db.delete(engineBRecords).where(inArray(engineBRecords.taskId, createdIds.engineBTasks)).catch(() => {});
    await db.delete(engineBTasks).where(inArray(engineBTasks.id, createdIds.engineBTasks)).catch(() => {});
  }
  await restoreConfig();
  await pool.end();
}, 60_000);

// ── Unit: Thorx Card rank variance bonus (A/S widen the draw band) ───────────

describe("drawThorxCard — rank variance bonus", () => {
  afterAll(() => vi.restoreAllMocks());

  it("A-Rank and S-Rank widen the variance band by their configured bonus", () => {
    const spy = vi.spyOn(Math, "random");
    // min bound (random=0): E stays at base min, A/S go wider.
    spy.mockReturnValue(0);
    const base = { userPkrShare: "60", conversionRate: 1000, varianceMin: 0.9, varianceMax: 1.1 };
    expect(drawThorxCard({ ...base, userRankTier: "E-Rank" }).cardVariance).toBe(0.9);
    expect(drawThorxCard({ ...base, userRankTier: "A-Rank", aRankBonusPct: 5 }).cardVariance).toBe(0.85);
    expect(drawThorxCard({ ...base, userRankTier: "S-Rank", sRankBonusPct: 10 }).cardVariance).toBe(0.8);
    // max bound (random=1): E stays at base max, A/S go wider.
    spy.mockReturnValue(1);
    expect(drawThorxCard({ ...base, userRankTier: "E-Rank" }).cardVariance).toBe(1.1);
    expect(drawThorxCard({ ...base, userRankTier: "A-Rank", aRankBonusPct: 5 }).cardVariance).toBe(1.15);
    expect(drawThorxCard({ ...base, userRankTier: "S-Rank", sRankBonusPct: 10 }).cardVariance).toBe(1.2);
  });
});

// ── Q6 rank reward multiplier: same gross PKR, rank-scaled TX-Points ────────

describe("Q6 rank reward multiplier (recordEarnEvent HTTP path)", () => {
  const EXPECTED: Record<string, number> = {
    "E-Rank": 6000, "D-Rank": 6600, "C-Rank": 7200, "B-Rank": 8100,
  };
  // A/S variance band with ENGINE_A_ILLUSION_VARIANCE_PCT=0:
  //   A: [0.95, 1.05] × 1.5 → [8550, 9450]
  //   S: [0.90, 1.10] × 1.75 → [9450, 11550]
  const RANGE: Record<string, [number, number]> = {
    "A-Rank": [8550, 9450],
    "S-Rank": [9450, 11550],
  };

  it("credits rank-scaled TX-Points for identical gross PKR, monotonic across ranks", async () => {
    // Cold-started Neon pools + ~32 system_config round-trips per ad-view make
    // this the slowest test in the file; give it headroom beyond the 30s default.
    const tierByKey: Record<string, string> = {
      eRank: "E-Rank", dRank: "D-Rank", cRank: "C-Rank", bRank: "B-Rank", aRank: "A-Rank", sRank: "S-Rank",
    };
    const got: Record<string, number> = {};
    for (const [key, tier] of Object.entries(tierByKey)) {
      const res = await oneAd(key);
      expect(res.status).toBe(201);
      const pts = res.body.thorxCard?.pointsCredited;
      expect(typeof pts).toBe("number");
      if (tier in EXPECTED) {
        expect(pts, `${tier} exact (variance pinned to 0)`).toBe(EXPECTED[tier]);
      } else {
        const [lo, hi] = RANGE[tier];
        expect(pts, `${tier} band (A/S variance bonus)`).toBeGreaterThanOrEqual(lo);
        expect(pts, `${tier} band (A/S variance bonus)`).toBeLessThanOrEqual(hi);
      }
      got[tier] = pts;
      const dbUser = await readUser(usersState[key].id);
      expect(dbUser.txPointsBalance, `${tier} txPointsBalance`).toBe(pts);
    }
    // Strict monotonicity: S > A > B > C > D > E even across random A/S draws.
    const order = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];
    for (let i = 1; i < order.length; i++) {
      expect(got[order[i]]).toBeGreaterThan(got[order[i - 1]]);
    }
  }, 90_000);

  it("keeps the real PKR share identical for every rank (financial integrity)", async () => {
    const tierByKey: Record<string, string> = {
      eRank: "E-Rank", dRank: "D-Rank", cRank: "C-Rank", bRank: "B-Rank", aRank: "A-Rank", sRank: "S-Rank",
    };
    for (const [key] of Object.entries(tierByKey)) {
      const [tx] = await db.select().from(userTransactions).where(eq(userTransactions.userId, usersState[key].id)).limit(1);
      expect(tx, `${tierByKey[key]} ledger row`).toBeDefined();
      expect(tx.realPkrValue, `${tierByKey[key]} realPkrValue`).toBe("60.0000");
      const u = await readUser(usersState[key].id);
      expect(u.availableBalance, `${tierByKey[key]} availableBalance`).toBe("60.00");
      expect(u.totalEarnings, `${tierByKey[key]} totalEarnings`).toBe("60.00");
    }
  });
});

// ── PS → rank transitions ────────────────────────────────────────────────────

describe("PS → rank tier transitions", () => {
  it("promotes E-Rank → D-Rank the moment PS crosses the threshold, with rank_logs + notification", async () => {
    await db.update(users).set({ performanceScore: 998, userRankTier: "E-Rank" }).where(eq(users.id, usersState.transition.id));
    const res = await oneAd("transition");
    expect(res.status).toBe(201);

    const u = await readUser(usersState.transition.id);
    expect(u.performanceScore).toBe(1008); // 998 + 5 (Engine A PS) + 5 (streak day 1)
    expect(u.userRankTier).toBe("D-Rank");

    const [log] = await db.select().from(rankLogs)
      .where(and(eq(rankLogs.userId, usersState.transition.id), eq(rankLogs.triggerSource, "ps_engine")))
      .orderBy(rankLogs.createdAt).limit(1);
    expect(log).toBeDefined();
    expect(log.oldRank).toBe("E-Rank");
    expect(log.newRank).toBe("D-Rank");
    expect(log.targetType).toBe("user");

    const [n] = await db.select().from(notifications)
      .where(and(eq(notifications.userId, usersState.transition.id), eq(notifications.title, "Rank Up!")))
      .limit(1);
    expect(n).toBeDefined();
  });

  it("promotes D-Rank → C-Rank on the next PS crossing (continuous progression)", async () => {
    await db.update(users).set({ performanceScore: 2995 }).where(eq(users.id, usersState.transition.id));
    const res = await oneAd("transition");
    expect(res.status).toBe(201);

    const u = await readUser(usersState.transition.id);
    expect(u.performanceScore).toBe(3000); // streak already awarded today → +5 task only
    expect(u.userRankTier).toBe("C-Rank");

    const logs = await db.select().from(rankLogs)
      .where(eq(rankLogs.userId, usersState.transition.id))
      .orderBy(rankLogs.createdAt);
    expect(logs.map((l) => `${l.oldRank}->${l.newRank}`)).toEqual(["E-Rank->D-Rank", "D-Rank->C-Rank"]);
  });
});

// ── Engine B rank gate ───────────────────────────────────────────────────────

describe("Engine B rank gate (C-Rank minimum)", () => {
  let taskId = "";

  it("founder creates an active CPA task", async () => {
    const res = await harnesses.founder.post("/api/admin/engine-b-tasks", {
      title: `RankGate CPA ${TS}`,
      description: "Rank gate verification",
      type: "cpa_offer",
      actionUrl: "https://example.com/rankgate",
      secretCode: "QAGATE",
      grossPkrPerCompletion: "10",
      isActive: true,
      difficulty: "Easy",
      targetRank: "C-Rank",
    });
    expect(res.status).toBe(201);
    taskId = res.body.id;
    createdIds.engineBTasks.push(taskId);
  });

  it("blocks an E-Rank user with 403 RANK_GATE", async () => {
    const click = await harnesses.gateLow.post(`/api/engine-b/tasks/${taskId}/click`, {});
    expect([200, 201]).toContain(click.status);
    const [rec] = await db.select().from(engineBRecords)
      .where(and(eq(engineBRecords.userId, usersState.gateLow.id), eq(engineBRecords.taskId, taskId))).limit(1);
    // Back-date past the 10s anti-cheat so we reach the rank gate.
    await db.update(engineBRecords).set({ clickedAt: new Date(Date.now() - 15_000) }).where(eq(engineBRecords.id, rec.id));

    const verify = await harnesses.gateLow.post(`/api/engine-b/tasks/${taskId}/verify`, { code: "QAGATE" });
    expect(verify.status).toBe(403);
    expect(verify.body.error).toBe("RANK_GATE");
    expect(verify.body.requiredRank).toBe("C-Rank");

    const u = await readUser(usersState.gateLow.id);
    expect(u.performanceScore).toBe(0); // nothing credited
  });

  it("lets a C-Rank user complete the same task and credits Engine B PS", async () => {
    const click = await harnesses.gateHigh.post(`/api/engine-b/tasks/${taskId}/click`, {});
    expect([200, 201]).toContain(click.status);
    const [rec] = await db.select().from(engineBRecords)
      .where(and(eq(engineBRecords.userId, usersState.gateHigh.id), eq(engineBRecords.taskId, taskId))).limit(1);
    await db.update(engineBRecords).set({ clickedAt: new Date(Date.now() - 15_000) }).where(eq(engineBRecords.id, rec.id));

    const verify = await harnesses.gateHigh.post(`/api/engine-b/tasks/${taskId}/verify`, { code: "QAGATE" });
    expect(verify.status).toBe(200);
    expect(verify.body.record.status).toBe("completed");

    const u = await readUser(usersState.gateHigh.id);
    // Engine B PS reward (25) + first streak of the day (5).
    expect(u.performanceScore).toBe(3000 + 30);
    expect(u.userRankTier).toBe("C-Rank");
  });
});

// ── PS awards & streak idempotency ───────────────────────────────────────────

describe("PS awards and daily streak", () => {
  it("awards Engine A PS (5) + streak day 1 (5), then stays idempotent the same day", async () => {
    const r1 = await oneAd("streak");
    expect(r1.status).toBe(201);
    let u = await readUser(usersState.streak.id);
    expect(u.performanceScore).toBe(10);
    expect(u.streakDays).toBe(1);

    const r2 = await oneAd("streak");
    expect(r2.status).toBe(201);
    u = await readUser(usersState.streak.id);
    expect(u.performanceScore).toBe(15); // task PS only — streak already processed today
    expect(u.streakDays).toBe(1);
  });

  it("escalates day 2 → day 3+ and resets when the streak breaks", async () => {
    // Day 2: previous calendar day → +10
    await db.update(users).set({ lastStreakDate: daysAgoPKT(1) }).where(eq(users.id, usersState.streak.id));
    await oneAd("streak");
    let u = await readUser(usersState.streak.id);
    expect(u.performanceScore).toBe(30); // 15 + 5 task + 10 streak
    expect(u.streakDays).toBe(2);

    // Day 3+ (still consecutive): +20
    await db.update(users).set({ lastStreakDate: daysAgoPKT(1) }).where(eq(users.id, usersState.streak.id));
    await oneAd("streak");
    u = await readUser(usersState.streak.id);
    expect(u.performanceScore).toBe(55); // 30 + 5 + 20
    expect(u.streakDays).toBe(3);

    // Broken streak (gap > 1 day): back to day 1 → +5 and counter resets.
    await db.update(users).set({ lastStreakDate: daysAgoPKT(3) }).where(eq(users.id, usersState.streak.id));
    await oneAd("streak");
    u = await readUser(usersState.streak.id);
    expect(u.performanceScore).toBe(65); // 55 + 5 + 5
    expect(u.streakDays).toBe(1);
  });
});

// ── Inactivity penalty, demotion, E-Rank floor ───────────────────────────────

describe("Inactivity penalty", () => {
  it("applies the penalty once, demotes below the threshold, and never drops below E-Rank", async () => {
    await setConfig("PS_INACTIVITY_HOURS", 1);
    await setConfig("PS_INACTIVITY_PENALTY", 10);

    // Scaffold: D-Rank at 1004 (10 PS above the D floor) and E-Rank at 50.
    await db.update(users).set({ performanceScore: 1004, userRankTier: "D-Rank" }).where(eq(users.id, usersState.inact.id));
    await db.update(users).set({ performanceScore: 50, userRankTier: "E-Rank" }).where(eq(users.id, usersState.inactFloor.id));
    const staleAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await db.update(users).set({ lastActiveAt: staleAt, inactivityPenaltyAt: null }).where(eq(users.id, usersState.inact.id));
    await db.update(users).set({ lastActiveAt: staleAt, inactivityPenaltyAt: null }).where(eq(users.id, usersState.inactFloor.id));

    // Prevent collateral damage to every other user: bump their lastActiveAt
    // to now, snapshot their rank state, and restore it after the batch runs.
    const all = await db.select({
      id: users.id, performanceScore: users.performanceScore, userRankTier: users.userRankTier,
      inactivityPenaltyAt: users.inactivityPenaltyAt, lastActiveAt: users.lastActiveAt,
    }).from(users);
    const untouched = all.filter((u) => u.id !== usersState.inact.id && u.id !== usersState.inactFloor.id);
    await db.update(users).set({ lastActiveAt: new Date() })
      .where(notInArray(users.id, [usersState.inact.id, usersState.inactFloor.id]));

    const processed = await applyInactivityPenalties();
    expect(processed).toBeGreaterThanOrEqual(2);

    const u1 = await readUser(usersState.inact.id);
    expect(u1.performanceScore).toBe(994);
    expect(u1.userRankTier).toBe("E-Rank"); // demoted D → E
    const u2 = await readUser(usersState.inactFloor.id);
    expect(u2.performanceScore).toBe(40);
    expect(u2.userRankTier).toBe("E-Rank"); // floor held

    const [log] = await db.select().from(rankLogs)
      .where(and(eq(rankLogs.userId, usersState.inact.id), eq(rankLogs.triggerSource, "ps_engine")))
      .orderBy(rankLogs.createdAt).limit(1);
    expect(log.oldRank).toBe("D-Rank");
    expect(log.newRank).toBe("E-Rank");

    // Idempotency: a second run must not double-penalize (stamp guard).
    await applyInactivityPenalties();
    const u1b = await readUser(usersState.inact.id);
    expect(u1b.performanceScore).toBe(994);

    // Restore every other user's exact rank state + activity timestamps in ONE
    // parameterized statement. The shared test DB accumulates users from runs
    // killed before afterAll cleanup; the old per-user UPDATE loop was O(N)
    // sequential Neon round-trips there (minutes → test timeout).
    if (untouched.length) {
      const params: any[] = [];
      const rowsSql = untouched.map((u, i) => {
        const b = i * 5;
        params.push(u.id, u.performanceScore, u.userRankTier, u.inactivityPenaltyAt, u.lastActiveAt);
        return `($${b + 1}::text, $${b + 2}::int, $${b + 3}::text, $${b + 4}::timestamptz, $${b + 5}::timestamptz)`;
      }).join(", ");
      await pool.query(
        `UPDATE users AS u SET
           performance_score = v.ps,
           user_rank_tier = v.tier,
           inactivity_penalty_at = v.stamp,
           last_active_at = v.last_active
         FROM (VALUES ${rowsSql}) AS v(id, ps, tier, stamp, last_active)
         WHERE u.id = v.id`,
        params,
      );
    }
  }, 90_000);
});

// ── Admin rank override + lock (previously dead code) ───────────────────────

describe("Admin rank override and rankLocked", () => {
  it("persists rankLocked=true (was accepted but silently dropped)", async () => {
    const res = await harnesses.founder.patch(`/api/admin/users/${usersState.lockUser.id}/rank`, {
      rank: "S-Rank", locked: true,
    });
    expect(res.status).toBe(200);

    const u = await readUser(usersState.lockUser.id);
    expect(u.userRankTier).toBe("S-Rank");
    expect(u.rankLocked).toBe(true); // THE fix — previously always false

    const [log] = await db.select().from(rankLogs)
      .where(and(eq(rankLogs.userId, usersState.lockUser.id), eq(rankLogs.triggerSource, "admin")))
      .orderBy(rankLogs.createdAt).limit(1);
    expect(log).toBeDefined();
    expect(log.oldRank).toBe("E-Rank");
    expect(log.newRank).toBe("S-Rank");
  });

  it("a locked rank survives the next earn event (lock actually honored now)", async () => {
    const res = await oneAd("lockUser");
    expect(res.status).toBe(201);
    const u = await readUser(usersState.lockUser.id);
    expect(u.performanceScore).toBe(10);
    expect(u.userRankTier).toBe("S-Rank"); // would have reverted to E-Rank when the lock was dead
  });

  it("unlock + earn recomputes rank from PS and reverts the manual rank", async () => {
    const res = await harnesses.founder.patch(`/api/admin/users/${usersState.lockUser.id}/rank`, {
      rank: "E-Rank", locked: false,
    });
    expect(res.status).toBe(200);
    let u = await readUser(usersState.lockUser.id);
    expect(u.userRankTier).toBe("E-Rank");
    expect(u.rankLocked).toBe(false);

    await oneAd("lockUser");
    u = await readUser(usersState.lockUser.id);
    // Same-day second ad: task PS (+5) only — the streak bonus is idempotent
    // per PKT day (see "PS awards and daily streak" suite), so 10 + 5 = 15.
    expect(u.performanceScore).toBe(15);
    expect(u.userRankTier).toBe("E-Rank");

    const adminLogs = await db.select().from(rankLogs)
      .where(eq(rankLogs.userId, usersState.lockUser.id))
      .orderBy(rankLogs.createdAt);
    expect(adminLogs.map((l) => `${l.oldRank}->${l.newRank}:${l.triggerSource}`))
      .toEqual(["E-Rank->S-Rank:admin", "S-Rank->E-Rank:admin"]);
  });
});
