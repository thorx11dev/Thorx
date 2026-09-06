/**
 * THORX Ultra-Advanced Hardening E2E â€” concurrency races, security & rate limiting
 *
 * This suite exists to PROVE the platform's hardening under conditions real
 * traffic produces but happy-path tests never see:
 *
 *   1. CONCURRENCY / RACE CONDITIONS (the crown jewels)
 *      - Two parallel Engine B verify calls for the same task â†’ exactly ONE
 *        credit, one ledger row, exact balance delta, no 500s.
 *      - Two parallel weekly-task completes â†’ exactly one credit, one ledger
 *        row, and the guild pool grows by exactly ONE event's contribution.
 *      - Two parallel withdrawal submissions â†’ exactly one pending withdrawal
 *        (FOR UPDATE + partial unique index).
 *      - Same X-Idempotency-Key retried â†’ deduped to one withdrawal (H-01).
 *      - Two parallel admin war resolves â†’ the prize is credited to the winner
 *        EXACTLY ONCE (regression test for the double-prize race fixed by
 *        adding FOR UPDATE in resolveWar()).
 *
 *   2. ABUSE / SECURITY HARDENING
 *      - CSRF double-submit enforced (missing token 403, mismatched token 403).
 *      - Unauthenticated earn routes 401.
 *      - Non-admin cannot resolve wars (403).
 *      - Mass-assignment smuggling on /api/withdrawals (status/fee/transactionId)
 *        is stripped â€” the row is created pending with server-computed fee.
 *
 *   3. RATE LIMITERS (real middleware, HTTP level)
 *      - authRateLimiter (10/15min), withdrawalRateLimiter (5/15min),
 *        contactRateLimiter (5/15min), contactEmailRateLimiter (3/hour per
 *        email), bootstrapRateLimiter (3/hr) all return 429 at max+1.
 *      - earnRateLimiter (15/min) enforced in the REAL app and keyed per-USER,
 *        not per-IP (two users behind the same NAT share nothing).
 *      - Config probes for the remaining limiters (admin 30, admin-bulk 10,
 *        profile 30, guild 20/min, chatbot 20/min, public-api 30/min).
 *
 * Run: npx vitest run server/__tests__/e2e-hardening-race.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import express from "express";
import bcrypt from "bcrypt";
import { db, pool } from "../db";
import {
  users, guilds, guildMembers, guildWars, guildWarApprovals,
  guildWarParticipants, guildBadges, guildCreationRequests,
  weeklyTasks, weeklyTaskRecords, engineBTasks, engineBRecords,
  adViews, userTransactions, withdrawals, notifications, auditLogs,
} from "@shared/schema";
import { eq, and, inArray, or } from "drizzle-orm";
import {
  authRateLimiter, earnRateLimiter, withdrawalRateLimiter,
  contactRateLimiter, contactEmailRateLimiter, bootstrapRateLimiter,
  adminActionRateLimiter, adminBulkActionRateLimiter, profileRateLimiter,
  guildInteractionRateLimiter, chatbotRateLimiter, publicApiRateLimiter,
} from "../middleware/auth-rate-limit";

// â”€â”€ Fixtures & shared state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TS = Date.now();
const PASSWORD = "TestPass123!";
const TIER_MIN_PS: Record<string, number> = {
  "E-Rank": 0, "D-Rank": 1000, "C-Rank": 3000, "B-Rank": 6000, "A-Rank": 10000, "S-Rank": 20000,
};

let app: any;
const founder = { id: "", email: `hr_founder_${TS}@thorx-test.local` };
const usersState: Record<string, any> = {};
const harnesses: Record<string, any> = {};

const guildA = { id: "" };
const guildB = { id: "" };
const tasks = { t1: "", t2: "" };
const ebTask = { easy: "" };
const war = { id: "" };

const createdIds = {
  users: [] as string[],
  guilds: [] as string[],
  guildCreationRequests: [] as string[],
  weeklyTasks: [] as string[],
  engineBTasks: [] as string[],
};

// â”€â”€ HTTP harness (CSRF double-submit cookies) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  h.seed = async () => { const r = await h.agent.get("/api/health"); h.csrf = getCsrfToken(r); };
  h.get = (path: string) => h.agent.get(path);
  h.post = async (path: string, body: object, headers?: Record<string, string>) => {
    let req = h.agent.post(path).set("x-csrf-token", h.csrf);
    if (headers) req = req.set(headers);
    const r = await req.send(body);
    const fresh = getCsrfToken(r);
    if (fresh) h.csrf = fresh;
    return r;
  };
  h.postXff = async (path: string, body: object, xff: string) => {
    const r = await h.agent.post(path).set("x-csrf-token", h.csrf).set("x-forwarded-for", xff).send(body);
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
  const email = `hr_${key}_${TS}_${suffix}@thorx-test.local`;
  const res = await harnesses[key].post("/api/register", {
    firstName: overrides.firstName ?? key,
    lastName: "H",
    identity: `hr_${key}_${TS}_${suffix}`,
    phone: `033${Math.floor(10000000 + Math.random() * 89999999)}`,
    email,
    password: PASSWORD,
  });
  expect(res.status).toBe(201);
  const user = res.body.user;
  createdIds.users.push(user.id);
  usersState[key] = user;

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

/** Seed a withdrawable verified balance: FIFO ledger rows + reflected balance
 *  columns. v4: rows are VERIFIED (back payouts) and available_balance is set
 *  to the full PKR sum — the hold path debits from the live balance. */
async function seedWithdrawableBalance(userId: string, rows: number, ptsEach: number, pkrEach: string) {
  for (let i = 0; i < rows; i++) {
    await db.insert(userTransactions).values({
      userId,
      engineType: "Engine_A",
      pointsCredited: ptsEach,
      realPkrValue: pkrEach,
      grossPkr: (parseFloat(pkrEach) / 0.6).toFixed(4),
      thorxProfitPkr: (parseFloat(pkrEach) / 0.6 * 0.4).toFixed(4),
      conversionRate: 10,
      cardVariance: "1.0000",
      sourceId: `hr_seed_${TS}_${userId}_${i}_${Math.random().toString(36).slice(2)}`,
      sourceType: "ad_view",
      withdrawn: false,
      verificationStatus: "verified",
      verifiedAt: new Date(),
    } as any);
  }
  const totalPkr = rows * parseFloat(pkrEach);
  await db.update(users)
    .set({
      availableBalance: totalPkr.toFixed(2),
      txPointsBalance: rows * ptsEach as any,
    })
    .where(eq(users.id, userId));
}

// â”€â”€ Rate-limiter scaffolding (standalone express apps) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeLimitedApp(limiter: any, path = "/x") {
  const limApp = express();
  limApp.set("trust proxy", true);
  limApp.use(express.json());
  limApp.use(path, limiter, (req: any, res: any) => {
    const rl = req.rateLimit;
    res.json({ ok: true, limit: rl?.limit ?? null, remaining: rl?.remaining ?? null });
  });
  return limApp;
}

/** Fire `n` requests against a limiter app from one spoofed IP; returns statuses. */
async function burst(limApp: any, n: number, ip: string, method: "get" | "post" = "get", body?: object) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    let r = request(limApp)[method]("/x");
    if (body) r = r.send(body);
    const res = await r.set("x-forwarded-for", ip);
    statuses.push(res.status);
  }
  return statuses;
}

// â”€â”€ Setup / teardown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));

  // Mirror server/index.ts: cookie-parser + CSRF double-submit protection are
  // mounted at the app level, NOT inside registerRoutes(). Without this the
  // manual test app would silently skip CSRF entirely and the CSRF tests below
  // would pass vacuously.
  const cookieParser = (await import("cookie-parser")).default;
  app.use(cookieParser());
  const { csrfProtection } = await import("../middleware/csrf");
  app.use("/api", csrfProtection);

  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);

  // registerRoutes sets 'trust proxy' 1; with a single X-Forwarded-For value
  // that leaves req.ip = socket (127.0.0.1) â†’ skipLocalhost() skips the rate
  // limiters. Trust-all lets the spoofed XFF become req.ip so the earn-limiter
  // HTTP tests actually exercise the real middleware.
  app.set("trust proxy", true);

  const [f] = await db.insert(users).values({
    firstName: "H", lastName: "Founder", identity: `hr_founder_${TS}`,
    phone: `035${Math.floor(10000000 + Math.random() * 89999999)}`,
    email: founder.email, passwordHash: await bcrypt.hash(PASSWORD, 10),
    referralCode: `HRF-${TS}`, role: "founder",
  } as any).returning();
  founder.id = f.id;
  createdIds.users.push(f.id);

  const keys = ["founder", "captainA", "memberA", "captainB", "memberB", "racer", "wallet"];
  for (const k of keys) {
    harnesses[k] = makeHarness();
    await harnesses[k].seed();
  }
  await harnesses.founder.post("/api/login", { email: founder.email, password: PASSWORD });

  // Captains seeded at B-Rank â€” guild creation now requires it (beta policy).
  await registerRealUser("captainA", { firstName: "CapA", userRankTier: "B-Rank" });
  await registerRealUser("memberA", { firstName: "MemA", userRankTier: "C-Rank" });
  await registerRealUser("captainB", { firstName: "CapB", userRankTier: "B-Rank" });
  await registerRealUser("memberB", { firstName: "MemB", userRankTier: "C-Rank" });
  await registerRealUser("racer", { firstName: "Racer", userRankTier: "C-Rank" });
  await registerRealUser("wallet", { firstName: "Wallet", userRankTier: "C-Rank" });
}, 90_000);

afterAll(async () => {
  const gIds = createdIds.guilds;
  const uIds = createdIds.users;
  if (gIds.length) {
    await db.delete(guildWarApprovals).where(inArray(guildWarApprovals.guildId, gIds)).catch(() => {});
    await db.delete(guildWarParticipants).where(inArray(guildWarParticipants.guildId, gIds)).catch(() => {});
    await db.delete(guildBadges).where(inArray(guildBadges.guildId, gIds)).catch(() => {});
    await db.delete(guildWars).where(
      or(inArray(guildWars.challengerGuildId, gIds), inArray(guildWars.challengedGuildId, gIds)),
    ).catch(() => {});
    await db.delete(guildMembers).where(inArray(guildMembers.guildId, gIds)).catch(() => {});
    await db.delete(guilds).where(inArray(guilds.id, gIds)).catch(() => {});
  }
  if (uIds.length) {
    await db.delete(guildCreationRequests).where(inArray(guildCreationRequests.userId, uIds)).catch(() => {});
    await db.delete(weeklyTaskRecords).where(inArray(weeklyTaskRecords.userId, uIds)).catch(() => {});
    await db.delete(engineBRecords).where(inArray(engineBRecords.userId, uIds)).catch(() => {});
    await db.delete(adViews).where(inArray(adViews.userId, uIds)).catch(() => {});
    await db.delete(userTransactions).where(inArray(userTransactions.userId, uIds)).catch(() => {});
    await db.delete(withdrawals).where(inArray(withdrawals.userId, uIds)).catch(() => {});
    await db.delete(notifications).where(inArray(notifications.userId, uIds)).catch(() => {});
    await db.delete(auditLogs).where(inArray(auditLogs.adminId, uIds)).catch(() => {});
  }
  if (createdIds.weeklyTasks.length) {
    await db.delete(weeklyTaskRecords).where(inArray(weeklyTaskRecords.taskId, createdIds.weeklyTasks)).catch(() => {});
    await db.delete(weeklyTasks).where(inArray(weeklyTasks.id, createdIds.weeklyTasks)).catch(() => {});
  }
  if (createdIds.engineBTasks.length) {
    await db.delete(engineBRecords).where(inArray(engineBRecords.taskId, createdIds.engineBTasks)).catch(() => {});
    await db.delete(engineBTasks).where(inArray(engineBTasks.id, createdIds.engineBTasks)).catch(() => {});
  }
  await pool.end();
}, 30_000);

// â”€â”€ Concurrency & race conditions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Concurrency & race conditions", () => {
  beforeAll(async () => {
    // Guild A (captainA + memberA) and Guild B via the real admin-approval flow.
    const mkGuild = async (hKey: string, name: string) => {
      const h = harnesses[hKey];
      const reqRes = await h.post("/api/guilds/creation-request", {
        guildName: name,
        description: `Hardening test guild ${name}`,
        reason: "A competitive guild built for the hardening suite to prove concurrency safety on real wars and weekly tasks.",
      });
      expect(reqRes.status).toBe(201);
      createdIds.guildCreationRequests.push(reqRes.body.request.id);
      const list = await harnesses.founder.get("/api/admin/guild-creation-requests?status=pending");
      const req = list.body.requests.find((r: any) => r.guildName === name);
      const decide = await harnesses.founder.post(`/api/admin/guild-creation-requests/${req.id}/decide`, { action: "approve" });
      expect(decide.status).toBe(200);
      createdIds.guilds.push(decide.body.guild.id);
      return decide.body.guild.id;
    };
    guildA.id = await mkGuild("captainA", `HR-GuildA ${TS}`);
    guildB.id = await mkGuild("captainB", `HR-GuildB ${TS}`);

    // memberA â†’ guildA, memberB â†’ guildB. Applications are listed and decided
    // by the CAPTAIN (the endpoint is captain-scoped), not the applicant.
    for (const [hKey, gid] of [["memberA", guildA.id], ["memberB", guildB.id]] as const) {
      const apply = await harnesses[hKey].post(`/api/guilds/${gid}/apply`, {
        coverLetter: "I contribute weekly points and fight in wars; accept me so we can win the shared prize pool.",
      });
      expect(apply.status).toBe(201);
      const capKey = hKey === "memberA" ? "captainA" : "captainB";
      const pending = await harnesses[capKey].get(`/api/guilds/${gid}/applications`);
      expect(pending.status).toBe(200);
      const appRow = (pending.body.applications ?? []).find((a: any) => a.userId === usersState[hKey].id);
      expect(appRow).toBeDefined();
      const accept = await harnesses[capKey].patch(`/api/guilds/${gid}/applications/${appRow.id}`, { action: "accept" });
      expect(accept.status).toBe(200);
      expect(accept.body.membership?.status).toBe("active");
    }

    // Founder creates weekly tasks (Engine C).
    const weekStart = new Date(Date.now() - 86_400_000).toISOString();
    const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString();
    for (const [key, gross] of [["t1", "10"], ["t2", "30"]] as const) {
      const res = await harnesses.founder.post("/api/admin/weekly-tasks", {
        title: `HR Weekly ${key} ${TS}`,
        description: `Hardening weekly task ${key}`,
        pointReward: 100,
        weekStart, weekEnd,
        targetGuildRank: "E",
        isActive: true,
        taskCategory: "cpa_offer",
        grossPkrPerCompletion: gross,
        actionUrl: "https://example.com/hr-weekly",
      });
      expect(res.status).toBe(201);
      tasks[key] = res.body.task.id;
      createdIds.weeklyTasks.push(tasks[key]);
    }

    // Founder creates an Engine B Easy task.
    const eb = await harnesses.founder.post("/api/admin/engine-b-tasks", {
      title: `HR CPA Easy ${TS}`,
      description: "Hardening CPA offer",
      type: "cpa_offer",
      actionUrl: "https://example.com/hr-offer",
      secretCode: "HREASY",
      grossPkrPerCompletion: "10",
      isActive: true,
      difficulty: "Easy",
      targetRank: "C-Rank",
    });
    expect(eb.status).toBe(201);
    ebTask.easy = eb.body.id;
    createdIds.engineBTasks.push(ebTask.easy);
  }, 120_000);

  it("parallel Engine B verifies credit EXACTLY once (no double-credit, no 500)", async () => {
    const click = await harnesses.racer.post(`/api/engine-b/tasks/${ebTask.easy}/click`, {});
    expect(click.status).toBe(200);

    const [rec] = await db.select({ id: engineBRecords.id }).from(engineBRecords)
      .where(and(eq(engineBRecords.userId, usersState.racer.id), eq(engineBRecords.taskId, ebTask.easy)));
    // Simulate a real user who waited 11s on the offer page.
    await db.update(engineBRecords).set({ clickedAt: new Date(Date.now() - 11_000) }).where(eq(engineBRecords.id, rec.id));

    const before = await db.select({ pts: users.txPointsBalance }).from(users).where(eq(users.id, usersState.racer.id));

    const [r1, r2] = await Promise.all([
      harnesses.racer.post(`/api/engine-b/tasks/${ebTask.easy}/verify`, { code: "HREASY" }),
      harnesses.racer.post(`/api/engine-b/tasks/${ebTask.easy}/verify`, { code: "HREASY" }),
    ]);

    // Both must succeed gracefully â€” no 500 "Verification failed" from a lost
    // unique-index race (regression test for the WHERE status='pending' guard).
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const winners = [r1, r2].filter((r) => r.body.success === true);
    expect(winners.length).toBe(1);

    const after = await db.select({ pts: users.txPointsBalance }).from(users).where(eq(users.id, usersState.racer.id));
    const credited = winners[0].body.thorxCard?.pointsCredited ?? 0;
    expect(credited).toBeGreaterThan(0);
    expect(Number(after[0]!.pts) - Number(before[0]!.pts)).toBe(credited);

    // Immutable ledger: exactly one row for this source.
    const ledger = await db.select({ id: userTransactions.id }).from(userTransactions)
      .where(and(eq(userTransactions.sourceId, rec.id), eq(userTransactions.sourceType, "engine_b_task")));
    expect(ledger.length).toBe(1);
  }, 60_000);

  it("parallel weekly-task completes credit EXACTLY once and fund the pool once", async () => {
    const [poolBefore] = await db.select({ pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildA.id));
    const [ptsBefore] = await db.select({ pts: users.txPointsBalance }).from(users).where(eq(users.id, usersState.memberA.id));

    const [r1, r2] = await Promise.all([
      harnesses.memberA.post(`/api/guilds/weekly-tasks/${tasks.t1}/complete`, {}),
      harnesses.memberA.post(`/api/guilds/weekly-tasks/${tasks.t1}/complete`, {}),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 400]);
    const winner = r1.status === 201 ? r1 : r2;
    expect(winner.body.earnResult?.pointsCredited ?? 0).toBeGreaterThan(0);

    // Exactly one completion record.
    const records = await db.select({ id: weeklyTaskRecords.id }).from(weeklyTaskRecords)
      .where(and(eq(weeklyTaskRecords.userId, usersState.memberA.id), eq(weeklyTaskRecords.taskId, tasks.t1)));
    expect(records.length).toBe(1);

    // Exactly one ledger row, and the guild pool grew by EXACTLY that row's
    // contribution â€” the losing request must not have double-funded anything.
    const ledger = await db.select({ guildPool: userTransactions.guildPoolPkr }).from(userTransactions)
      .where(and(eq(userTransactions.sourceId, records[0].id), eq(userTransactions.sourceType, "weekly_task")));
    expect(ledger.length).toBe(1);
    const [poolAfter] = await db.select({ pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildA.id));
    expect(Number(poolAfter!.pool) - Number(poolBefore!.pool)).toBeCloseTo(Number(ledger[0].guildPool), 4);

    const [ptsAfter] = await db.select({ pts: users.txPointsBalance }).from(users).where(eq(users.id, usersState.memberA.id));
    expect(Number(ptsAfter!.pts) - Number(ptsBefore!.pts)).toBe(winner.body.earnResult?.pointsCredited ?? 0);
  }, 60_000);

  it("parallel withdrawal submissions create EXACTLY one pending withdrawal", async () => {
    await seedWithdrawableBalance(usersState.wallet.id, 20, 1_000, "10.0000"); // 200 PKR (MIN_PAYOUT forced below in-test)

    const payload = {
      amount: "10000", method: "bank",
      accountName: "HR Wallet", accountNumber: "1234567890",
      accountDetails: { bankName: "HBL" },
    };
    const [r1, r2] = await Promise.all([
      harnesses.wallet.post("/api/withdrawals", payload),
      harnesses.wallet.post("/api/withdrawals", payload),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 400]);
    const loser = r1.status === 400 ? r1 : r2;
    expect(loser.body.message).toContain("pending payout");

    const rows = await db.select({ id: withdrawals.id }).from(withdrawals).where(eq(withdrawals.userId, usersState.wallet.id));
    expect(rows.length).toBe(1);
  }, 60_000);

  it("X-Idempotency-Key deduplicates retried withdrawal submissions (H-01)", async () => {
    await seedWithdrawableBalance(usersState.captainB.id, 20, 1_000, "10.0000");
    const key = `hr-key-${TS}`;
    const payload = {
      amount: "10000", method: "bank",
      accountName: "HR CapB", accountNumber: "0987654321",
      accountDetails: { bankName: "Meezan" },
    };
    const r1 = await harnesses.captainB.post("/api/withdrawals", payload, { "x-idempotency-key": key });
    const r2 = await harnesses.captainB.post("/api/withdrawals", payload, { "x-idempotency-key": key });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.withdrawal.id).toBe(r1.body.withdrawal.id);

    const rows = await db.select({ id: withdrawals.id }).from(withdrawals).where(eq(withdrawals.userId, usersState.captainB.id));
    expect(rows.length).toBe(1);
  }, 60_000);

  it("parallel war resolves pay the prize EXACTLY once (double-prize race regression)", async () => {
    // Full real war flow: challenge + all four approvals â†’ active.
    const chal = await harnesses.captainA.post(`/api/guilds/${guildA.id}/war/challenge`, { challengedGuildId: guildB.id });
    expect(chal.status).toBe(201);
    war.id = chal.body.war.id;
    for (const [hKey, gid] of [
      ["captainA", guildA.id], ["memberA", guildA.id],
      ["captainB", guildB.id], ["memberB", guildB.id],
    ] as const) {
      const r = await harnesses[hKey].post(`/api/guilds/${gid}/war/${war.id}/vote`, { approved: true });
      expect(r.status).toBe(200);
    }

    // Known chests + known score gap (test scaffolding â€” gameplay already proven).
    await db.update(guilds).set({ warChestPkr: "100.0000" }).where(eq(guilds.id, guildA.id));
    await db.update(guilds).set({ warChestPkr: "50.0000" }).where(eq(guilds.id, guildB.id));
    await db.update(guildWars).set({ challengerScore: 500, challengedScore: 200 }).where(eq(guildWars.id, war.id));
    const [poolBefore] = await db.select({ pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildA.id));

    // Two admins (or admin + Sunday cron) resolving at the same instant.
    const [r1, r2] = await Promise.all([
      harnesses.founder.patch(`/api/admin/guild-wars/wars/${war.id}/resolve`, {}),
      harnesses.founder.patch(`/api/admin/guild-wars/wars/${war.id}/resolve`, {}),
    ]);

    expect([r1.status, r2.status]).toEqual([200, 200]);
    const resolved = [r1, r2].filter((r) => typeof r.body.prizePkr !== "undefined");
    expect(resolved.length).toBe(1);
    expect(resolved[0].body.winnerId).toBe(guildA.id);
    expect(Number(resolved[0].body.prizePkr)).toBeCloseTo(150, 2);

    const [poolAfter] = await db.select({ pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildA.id));
    // CRITICAL: the winner's pool grows by the prize EXACTLY once â€” before the
    // FOR UPDATE fix, two concurrent resolves both read the war as active and
    // each credited 150 â†’ 300.
    expect(Number(poolAfter!.pool) - Number(poolBefore!.pool)).toBeCloseTo(150, 4);

    const [a] = await db.select({ chest: guilds.warChestPkr }).from(guilds).where(eq(guilds.id, guildA.id));
    const [b] = await db.select({ chest: guilds.warChestPkr }).from(guilds).where(eq(guilds.id, guildB.id));
    expect(Number(a!.chest)).toBe(0);
    expect(Number(b!.chest)).toBe(0);
  }, 120_000);
});

// â”€â”€ Abuse & security hardening â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Abuse & security hardening", () => {
  it("rejects state-changing requests without the CSRF token (403)", async () => {
    const raw = request.agent(app);
    await raw.get("/api/health"); // seeds the double-submit cookie
    const res = await raw.post("/api/ad-view").send({ adId: "hilltop_fallback" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("CSRF_ERROR");
  });

  it("rejects a mismatched CSRF token (403)", async () => {
    const raw = request.agent(app);
    await raw.get("/api/health");
    const res = await raw.post("/api/ad-view").set("x-csrf-token", "forged-token").send({ adId: "hilltop_fallback" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("CSRF_ERROR");
  });

  it("rejects unauthenticated earn attempts (401 after valid CSRF)", async () => {
    // Production order: CSRF runs first (no cookie â†’ 403), so prove the AUTH
    // guard separately with a valid double-submit token but no session.
    const raw = request.agent(app);
    const health = await raw.get("/api/health");
    const token = getCsrfToken(health);
    const res = await raw.post("/api/ad-view").set("x-csrf-token", token).send({ adId: "hilltop_fallback" });
    expect(res.status).toBe(401);
  });

  it("blocks a non-admin (guild captain) from resolving wars (403)", async () => {
    const res = await harnesses.captainA.patch(`/api/admin/guild-wars/wars/${war.id}/resolve`, {});
    expect(res.status).toBe(403);
    expect(res.body.error ?? "").toMatch(/INSUFFICIENT_PERMISSIONS|FORBIDDEN/);
  });

  it("strips mass-assigned fields from withdrawal payloads (status/fee/transactionId)", async () => {
    await seedWithdrawableBalance(usersState.memberB.id, 20, 1_000, "10.0000");
    const res = await harnesses.memberB.post("/api/withdrawals", {
      amount: "10000",
      method: "bank",
      accountName: "Smuggle Test",
      accountNumber: "5555555555",
      accountDetails: {},
      // Attacker attempts:
      status: "approved",
      fee: "0",
      netAmount: "0.01",
      transactionId: "HACKED-999",
      processedAt: new Date(0).toISOString(),
    });
    expect(res.status).toBe(201);
    const w = res.body.withdrawal;
    // Non-S-Rank user â†’ must stay pending (status was NOT smuggled to approved).
    expect(w.status).toBe("pending");
    // Server-computed 15% fee + net â€” NOT the attacker's zero values.
    expect(Number(w.fee)).toBe(15);
    expect(Number(w.netAmount)).toBeCloseTo(85, 2);
    expect(w.transactionId).toBeNull();
    expect(w.processedAt).toBeNull();
  }, 60_000);
});

// â”€â”€ Rate limiters (real middleware, HTTP level) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Rate limiters", () => {
  it("authRateLimiter: 10 attempts allowed, 11th â†’ 429", async () => {
    const limApp = makeLimitedApp(authRateLimiter);
    const statuses = await burst(limApp, 11, "203.0.113.10");
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("withdrawalRateLimiter: 5 allowed, 6th â†’ 429", async () => {
    const limApp = makeLimitedApp(withdrawalRateLimiter);
    const statuses = await burst(limApp, 6, "203.0.113.11");
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("contactRateLimiter: 5 allowed, 6th â†’ 429", async () => {
    const limApp = makeLimitedApp(contactRateLimiter);
    const statuses = await burst(limApp, 6, "203.0.113.12");
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("contactEmailRateLimiter: 3 per email, 4th â†’ 429 (fresh quota per email)", async () => {
    const limApp = makeLimitedApp(contactEmailRateLimiter);
    for (let i = 0; i < 4; i++) {
      const r = await request(limApp).post("/x").set("x-forwarded-for", "203.0.113.13")
        .send({ email: "spam@example.com" });
      expect(r.status).toBe(i < 3 ? 200 : 429);
    }
    // A different email from the SAME IP still has a fresh quota.
    const other = await request(limApp).post("/x").set("x-forwarded-for", "203.0.113.13")
      .send({ email: "legit@example.com" });
    expect(other.status).toBe(200);
  });

  it("bootstrapRateLimiter: 3 allowed, 4th â†’ 429", async () => {
    const limApp = makeLimitedApp(bootstrapRateLimiter);
    const statuses = await burst(limApp, 4, "203.0.113.14");
    expect(statuses.slice(0, 3).every((s) => s === 200)).toBe(true);
    expect(statuses[3]).toBe(429);
  });

  it("earnRateLimiter is keyed per-USER not per-IP (shared NAT is safe)", async () => {
    // (a) REAL app: a spoofed non-localhost XFF must NOT skip the limiter.
    //     One ad-view consumes 1 of the 15/min quota â†’ RateLimit-Remaining 14.
    //     (If skipLocalhost() had matched, the header would be absent.)
    //     Only a single request here: each /api/ad-view fires ~30 system_config
    //     DB round-trips (~4-6s on Neon), so 16 HTTP calls take >60s and slide
    //     past the 1-minute window â€” the middleware-level test below is the
    //     deterministic quota check.
    const probe = await harnesses.racer.postXff("/api/ad-view", { adId: "hilltop_fallback" }, "203.0.113.50");
    expect([200, 201]).toContain(probe.status);
    expect(Number(probe.headers["ratelimit-remaining"])).toBe(14);

    // (b) Precise per-user keying against the REAL middleware, fast: two stub
    //     sessions behind the same spoofed IP each get an independent quota.
    const limApp = express();
    limApp.set("trust proxy", true);
    limApp.use(express.json());
    limApp.use((req: any, _res: any, next: any) => {
      req.session = { userId: req.headers["x-user"] };
      next();
    });
    limApp.use("/x", earnRateLimiter, (_req: any, res: any) => res.json({ ok: true }));
    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) {
      const r = await request(limApp).post("/x").set("x-forwarded-for", "203.0.113.60").set("x-user", "user-a");
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 15).every((s) => s === 200)).toBe(true);
    expect(statuses[15]).toBe(429);

    // ...while user-b behind the SAME IP has a completely fresh quota.
    const fresh = await request(limApp).post("/x").set("x-forwarded-for", "203.0.113.60").set("x-user", "user-b");
    expect(fresh.status).toBe(200);
  }, 60_000);

  it("remaining limiters are configured with the documented maxima", async () => {
    const probes: Array<[any, number]> = [
      [adminActionRateLimiter, 30],
      [adminBulkActionRateLimiter, 10],
      [profileRateLimiter, 30],
      [guildInteractionRateLimiter, 20],
      [chatbotRateLimiter, 20],
      [publicApiRateLimiter, 30],
    ];
    for (let i = 0; i < probes.length; i++) {
      const [limiter, expected] = probes[i];
      const limApp = makeLimitedApp(limiter);
      const res = await request(limApp).get("/x").set("x-forwarded-for", `203.0.113.${20 + i}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(expected);
    }
  });
});
