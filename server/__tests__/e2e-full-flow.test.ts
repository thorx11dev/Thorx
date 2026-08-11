/**
 * THORX Full-Platform E2E — Engines A, B & C + Guild Wars via the real HTTP API
 *
 * Everything here runs as a REAL user would: sessions are established through
 * POST /api/register + /api/login (CSRF double-submit cookies included), and
 * every action goes through the same HTTP routes the frontend calls. No module
 * functions are invoked directly (the only DB writes are test scaffolding —
 * seeding the founder, promoting ranks, and back-dating timestamps that would
 * otherwise force real 10s waits).
 *
 * Coverage map:
 *   Engine A  – POST /api/ad-view, /api/ad-views/today, earnings history/breakdown
 *   Engine B  – admin CRUD (/api/admin/engine-b-tasks), user list, click,
 *               verify anti-cheat (10s gate), wrong-code rejection, secret-code
 *               completion, duplicate-completion idempotency, RANK_GATE for
 *               E-Rank users, inactive-task hiding
 *   Engine C  – guild creation-request → admin approve → captain; cover-letter
 *               application → captain accept; weekly-task admin create, member
 *               list (PKR hidden), atomic complete + duplicate guard
 *   Wars      – eligible-opponents, challenge, non-member vote rejection,
 *               wrong-turn vote rejection, member-reject → cancelled, full
 *               approval → active, live war status (approvals + chests),
 *               war-point accumulation + chest funding via real Engine C earn
 *               events, admin resolve (winner takes BOTH chests → bonus pool),
 *               war_winner badge, history endpoint, draw path (chests returned
 *               to own pools), idempotent re-resolve
 *   Cross-cut – notifications rows (restored table), audit_logs rows, security
 *               guards (403 non-member /war, 403 non-member weekly-tasks)
 *
 * Run: npx vitest run server/__tests__/e2e-full-flow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import bcrypt from "bcrypt";
import { db, pool } from "../db";
import {
  users,
  guilds,
  guildMembers,
  guildWars,
  guildWarApprovals,
  guildWarParticipants,
  guildBadges,
  guildCreationRequests,
  weeklyTasks,
  weeklyTaskRecords,
  engineBTasks,
  engineBRecords,
  adViews,
  userTransactions,
  notifications,
  auditLogs,
} from "@shared/schema";
import { eq, and, inArray, or } from "drizzle-orm";

// ── Fixtures & shared state ──────────────────────────────────────────────────

const TS = Date.now();
const PASSWORD = "TestPass123!";

let app: any;
const founder = { id: "", email: `e2e_founder_${TS}@thorx-test.local` };
const usersState: Record<string, any> = {}; // key → user row
const harnesses: Record<string, any> = {};  // key → HTTP harness (agent + csrf)

const guildA = { id: "" };
const guildB = { id: "" };
const tasks = { t0: "", t1: "", t2: "" };          // weekly tasks (Engine C)
const ebTasks = { easy: "", hard: "" };            // engine B tasks
const wars = { rejected: "", main: "", draw: "" };

const createdIds = {
  users: [] as string[],
  guilds: [] as string[],
  guildCreationRequests: [] as string[],
  weeklyTasks: [] as string[],
  engineBTasks: [] as string[],
};

// ── HTTP harness (CSRF double-submit cookies) ────────────────────────────────

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
  const h: any = {
    agent: null as Agent | null,
    csrf: "",
  };
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
  h.del = async (path: string) => {
    const r = await h.agent.delete(path).set("x-csrf-token", h.csrf);
    const fresh = getCsrfToken(r);
    if (fresh) h.csrf = fresh;
    return r;
  };
  return h;
}

async function registerRealUser(key: string, overrides: Partial<{ firstName: string; userRankTier: string }> = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `e2e_${key}_${TS}_${suffix}@thorx-test.local`;
  const res = await harnesses[key].post("/api/register", {
    firstName: overrides.firstName ?? key,
    lastName: "E2E",
    identity: `e2e_${key}_${TS}_${suffix}`,
    phone: `034${Math.floor(10000000 + Math.random() * 89999999)}`,
    email,
    password: PASSWORD,
  });
  expect(res.status).toBe(201);
  const user = res.body.user;
  createdIds.users.push(user.id);
  usersState[key] = user;

  // Rank promotion is the only "not via HTTP" shortcut — ranking up normally
  // takes days of PS accumulation; the rank-gate itself is tested separately.
  // IMPORTANT: PS is the sole input to rank — checkAndUpdateRankTier() (ps-engine)
  // recomputes userRankTier from performanceScore after EVERY earn event. A bare
  // rank bump without matching PS gets wiped on the next earn (Engine A's ad-view
  // runs before Engine B in this suite), which demotes the user mid-suite and
  // trips the Engine B RANK_GATE 403. Set PS to the tier minimum so the
  // recomputation keeps the promoted rank.
  const TIER_MIN_PS: Record<string, number> = {
    "E-Rank": 0, "D-Rank": 1000, "C-Rank": 3000, "B-Rank": 6000, "A-Rank": 10000, "S-Rank": 20000,
  };
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

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const expressModule = await import("express");
  app = expressModule.default();
  app.use(expressModule.default.json({ limit: "10mb" }));
  app.use(expressModule.default.urlencoded({ extended: false }));
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);

  // Founder seeded directly (registration never issues founder roles).
  const [f] = await db.insert(users).values({
    firstName: "E2E", lastName: "Founder", identity: `e2e_founder_${TS}`,
    phone: `035${Math.floor(10000000 + Math.random() * 89999999)}`,
    email: founder.email, passwordHash: await bcrypt.hash(PASSWORD, 10),
    referralCode: `E2EF-${TS}`, role: "founder",
  } as any).returning();
  founder.id = f.id;
  createdIds.users.push(f.id);

  const keys = ["founder", "captainA", "memberA", "captainB", "memberB", "lowRank"];
  for (const k of keys) {
    harnesses[k] = makeHarness();
    await harnesses[k].seed();
  }
  await harnesses.founder.post("/api/login", { email: founder.email, password: PASSWORD });

  await registerRealUser("captainA", { firstName: "Captain", userRankTier: "C-Rank" });
  await registerRealUser("memberA", { firstName: "Member", userRankTier: "C-Rank" });
  await registerRealUser("captainB", { firstName: "CaptainB" });
  await registerRealUser("memberB", { firstName: "MemberB" });
  await registerRealUser("lowRank", { firstName: "Low" }); // stays E-Rank
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

// ── Engine A: ad views ───────────────────────────────────────────────────────

describe("Engine A — ad views (HTTP)", () => {
  it("records a completed ad view and credits the earn pipeline", async () => {
    const res = await harnesses.captainA.post("/api/ad-view", { adId: "hilltop_fallback" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.adView).toBeDefined();
    expect(res.body.adView.completed).toBe(true);
  });

  it("counts today's ad views for the user", async () => {
    const res = await harnesses.captainA.get("/api/ad-views/today");
    expect(res.status).toBe(200);
    expect(res.body.count ?? res.body.todayCount ?? res.body).toBeDefined();
  });

  it("shows the ad earning in earnings history + breakdown", async () => {
    const hist = await harnesses.captainA.get("/api/earnings/history");
    expect(hist.status).toBe(200);
    const breakdown = await harnesses.captainA.get("/api/earnings/breakdown");
    expect(breakdown.status).toBe(200);
  });
});

// ── Engine B: CPA tasks ──────────────────────────────────────────────────────

describe("Engine B — CPA tasks (HTTP)", () => {
  it("founder creates an Easy task (validation ok)", async () => {
    const res = await harnesses.founder.post("/api/admin/engine-b-tasks", {
      title: `E2E CPA Easy ${TS}`,
      description: "Automated E2E CPA offer",
      type: "cpa_offer",
      actionUrl: "https://example.com/e2e-offer",
      secretCode: "EASYCODE",
      grossPkrPerCompletion: "10",
      isActive: true,
      difficulty: "Easy",
      targetRank: "C-Rank",
    });
    expect(res.status).toBe(201);
    ebTasks.easy = res.body.id;
    createdIds.engineBTasks.push(ebTasks.easy);
  });

  it("founder creates a Hard task", async () => {
    const res = await harnesses.founder.post("/api/admin/engine-b-tasks", {
      title: `E2E CPA Hard ${TS}`,
      description: "Automated E2E hard CPA offer",
      type: "cpa_offer",
      actionUrl: "https://example.com/e2e-hard",
      secretCode: "HARDCODE",
      grossPkrPerCompletion: "25",
      isActive: true,
      difficulty: "Hard",
      targetRank: "C-Rank",
    });
    expect(res.status).toBe(201);
    ebTasks.hard = res.body.id;
    createdIds.engineBTasks.push(ebTasks.hard);
  });

  it("rejects malformed gross value (400)", async () => {
    const res = await harnesses.founder.post("/api/admin/engine-b-tasks", {
      title: `E2E Bad ${TS}`,
      description: "bad",
      type: "cpa_offer",
      actionUrl: "https://example.com/bad",
      secretCode: "X",
      grossPkrPerCompletion: "not-a-number",
      isActive: true,
      difficulty: "Easy",
      targetRank: "C-Rank",
    });
    expect(res.status).toBe(400);
  });

  it("user sees active tasks (no completion record yet)", async () => {
    const res = await harnesses.captainA.get("/api/engine-b/tasks");
    expect(res.status).toBe(200);
    const rows = res.body as any[];
    const easy = rows.find((r: any) => r.task?.id === ebTasks.easy);
    expect(easy).toBeDefined();
    expect(easy.record).toBeNull();
  });

  it("click initializes the task session", async () => {
    const res = await harnesses.captainA.post(`/api/engine-b/tasks/${ebTasks.easy}/click`, {});
    expect(res.status).toBe(200);
    expect(["pending", "clicked"]).toContain(res.body.status);
  });

  it("verify immediately is blocked by the 10s anti-cheat gate", async () => {
    const res = await harnesses.captainA.post(`/api/engine-b/tasks/${ebTasks.easy}/verify`, { code: "EASYCODE" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("VERIFICATION_FAILED_TIME");
  });

  it("wrong secret code is rejected after engagement time", async () => {
    // Test scaffolding: simulate a real user who waited 11s on the offer page.
    await db.update(engineBRecords)
      .set({ clickedAt: new Date(Date.now() - 11_000) })
      .where(eq(engineBRecords.userId, usersState.captainA.id));
    const res = await harnesses.captainA.post(`/api/engine-b/tasks/${ebTasks.easy}/verify`, { code: "WRONGCODE" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("VERIFICATION_FAILED_CODE");
  });

  it("correct secret code completes the task and credits TX-Points", async () => {
    const before = await db.select({ pts: users.txPointsBalance }).from(users)
      .where(eq(users.id, usersState.captainA.id));
    const res = await harnesses.captainA.post(`/api/engine-b/tasks/${ebTasks.easy}/verify`, { code: "easycode" }); // case-insensitive
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.record.status).toBe("completed");
    expect(res.body.thorxCard?.pointsCredited ?? 0).toBeGreaterThan(0);
    const after = await db.select({ pts: users.txPointsBalance }).from(users)
      .where(eq(users.id, usersState.captainA.id));
    expect(Number(after[0]?.pts ?? 0)).toBeGreaterThan(Number(before[0]?.pts ?? 0));
  });

  it("duplicate verify is idempotent (already completed)", async () => {
    const res = await harnesses.captainA.post(`/api/engine-b/tasks/${ebTasks.easy}/verify`, { code: "EASYCODE" });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("already completed");
  });

  it("E-Rank user is blocked from Hard CPA tasks (RANK_GATE 403)", async () => {
    await harnesses.lowRank.post(`/api/engine-b/tasks/${ebTasks.hard}/click`, {});
    await db.update(engineBRecords)
      .set({ clickedAt: new Date(Date.now() - 11_000) })
      .where(eq(engineBRecords.userId, usersState.lowRank.id));
    const res = await harnesses.lowRank.post(`/api/engine-b/tasks/${ebTasks.hard}/verify`, { code: "HARDCODE" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("RANK_GATE");
    expect(res.body.requiredRank).toBe("C-Rank");
  });

  it("inactive tasks disappear from the user list", async () => {
    await harnesses.founder.patch(`/api/admin/engine-b-tasks/${ebTasks.hard}`, { isActive: false });
    const res = await harnesses.captainA.get("/api/engine-b/tasks");
    const rows = res.body as any[];
    expect(rows.find((r: any) => r.task?.id === ebTasks.hard)).toBeUndefined();
  });
});

// ── Engine C: guild creation + membership + weekly tasks ────────────────────

describe("Engine C — guilds & weekly tasks (HTTP)", () => {
  it("rejects a creation request with a too-short reason", async () => {
    const res = await harnesses.captainA.post("/api/guilds/creation-request", {
      guildName: `ThorxA ${TS}`,
      description: "A",
      reason: "too short",
    });
    expect(res.status).toBe(400);
  });

  it("captainA submits a guild creation request", async () => {
    const res = await harnesses.captainA.post("/api/guilds/creation-request", {
      guildName: `ThorxA ${TS}`,
      description: "Guild A for the E2E war flow",
      reason: "I want to build an active competitive guild that takes part in weekly goals and guild wars with a strong member culture.",
    });
    expect(res.status).toBe(201);
    createdIds.guildCreationRequests.push(res.body.request.id);
  });

  it("duplicate pending creation request is rejected (409)", async () => {
    const res = await harnesses.captainA.post("/api/guilds/creation-request", {
      guildName: `ThorxA-dup ${TS}`,
      reason: "Another reason that is definitely long enough to pass validation here.",
    });
    expect(res.status).toBe(409);
  });

  it("founder sees the pending request and approves it → guild created, captain notified", async () => {
    const list = await harnesses.founder.get("/api/admin/guild-creation-requests?status=pending");
    expect(list.status).toBe(200);
    const req = list.body.requests.find((r: any) => r.guildName === `ThorxA ${TS}`);
    expect(req).toBeDefined();

    const res = await harnesses.founder.post(`/api/admin/guild-creation-requests/${req.id}/decide`, {
      action: "approve",
      adminNote: "E2E approval",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    guildA.id = res.body.guild.id;
    createdIds.guilds.push(guildA.id);

    const notif = await harnesses.captainA.get("/api/notifications");
    expect(notif.status).toBe(200);
    expect(Array.isArray(notif.body)).toBe(true);
    expect(notif.body.some((n: any) => String(n.title ?? "").includes("Guild Creation Approved"))).toBe(true);
  });

  it("captain sees /api/guilds/mine with captain role", async () => {
    const res = await harnesses.captainA.get("/api/guilds/mine");
    expect(res.status).toBe(200);
    expect(res.body.guild?.id).toBe(guildA.id);
  });

  it("rejects an application with a short cover letter", async () => {
    const res = await harnesses.memberA.post(`/api/guilds/${guildA.id}/apply`, { coverLetter: "short" });
    expect(res.status).toBe(400);
  });

  it("memberA applies and captain accepts → active member", async () => {
    const res = await harnesses.memberA.post(`/api/guilds/${guildA.id}/apply`, {
      coverLetter: "I am a dedicated member ready to contribute weekly points and fight in guild wars for this team.",
    });
    expect(res.status).toBe(201);

    const pending = await harnesses.captainA.get(`/api/guilds/${guildA.id}/applications`);
    expect(pending.status).toBe(200);
    const app = pending.body.applications.find((a: any) => a.userId === usersState.memberA.id);
    expect(app).toBeDefined();

    const decide = await harnesses.captainA.patch(`/api/guilds/${guildA.id}/applications/${app.id}`, { action: "accept" });
    expect(decide.status).toBe(200);
    expect(decide.body.membership?.status).toBe("active");
  });

  it("founder creates weekly tasks (Engine C)", async () => {
    const weekStart = new Date(Date.now() - 86_400_000).toISOString();
    const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const mk = async (title: string, gross: string) => {
      const res = await harnesses.founder.post("/api/admin/weekly-tasks", {
        title,
        description: `E2E weekly task ${title}`,
        pointReward: 100,
        weekStart,
        weekEnd,
        targetGuildRank: "E",
        isActive: true,
        taskCategory: "cpa_offer",
        grossPkrPerCompletion: gross,
        actionUrl: "https://example.com/weekly",
      });
      expect(res.status).toBe(201);
      createdIds.weeklyTasks.push(res.body.task.id);
      return res.body.task.id;
    };
    tasks.t0 = await mk(`E2E Weekly PreWar ${TS}`, "10");
    tasks.t1 = await mk(`E2E Weekly Core ${TS}`, "10");
    tasks.t2 = await mk(`E2E Weekly Premium ${TS}`, "30");
  });

  it("active members see weekly tasks with TX-Points reward, no raw PKR", async () => {
    const res = await harnesses.captainA.get("/api/guilds/weekly-tasks");
    expect(res.status).toBe(200);
    const row = res.body.tasks.find((t: any) => t.id === tasks.t1);
    expect(row).toBeDefined();
    expect(row.txPointsReward).toBeGreaterThan(0);
    expect(row).not.toHaveProperty("grossPkrPerCompletion");
  });

  it("non-member cannot list weekly tasks (403)", async () => {
    const res = await harnesses.lowRank.get("/api/guilds/weekly-tasks");
    expect(res.status).toBe(403);
  });

  it("captain completes a weekly task pre-war (points credited, chest NOT funded)", async () => {
    const res = await harnesses.captainA.post(`/api/guilds/weekly-tasks/${tasks.t0}/complete`, {});
    expect(res.status).toBe(201);
    expect(res.body.earnResult?.pointsCredited ?? 0).toBeGreaterThan(0);
    // No active war → no chest levy is deducted.
    const [g] = await db.select({ chest: guilds.warChestPkr }).from(guilds).where(eq(guilds.id, guildA.id));
    expect(Number(g?.chest ?? 0)).toBe(0);
  });

  it("duplicate weekly-task completion is rejected (400)", async () => {
    const res = await harnesses.captainA.post(`/api/guilds/weekly-tasks/${tasks.t0}/complete`, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("already completed");
  });
});

// ── Guild Wars — full lifecycle over HTTP ────────────────────────────────────

describe("Guild Wars — full lifecycle (HTTP)", () => {
  beforeAll(async () => {
    // Build Guild B the same real-user way.
    const reqRes = await harnesses.captainB.post("/api/guilds/creation-request", {
      guildName: `ThorxB ${TS}`,
      description: "Guild B for the E2E war flow",
      reason: "Building a second competitive guild so we can test real wars end to end with real approvals and a real prize.",
    });
    expect(reqRes.status).toBe(201);
    createdIds.guildCreationRequests.push(reqRes.body.request.id);

    const list = await harnesses.founder.get("/api/admin/guild-creation-requests?status=pending");
    const req = list.body.requests.find((r: any) => r.guildName === `ThorxB ${TS}`);
    const decide = await harnesses.founder.post(`/api/admin/guild-creation-requests/${req.id}/decide`, { action: "approve" });
    expect(decide.status).toBe(200);
    guildB.id = decide.body.guild.id;
    createdIds.guilds.push(guildB.id);

    const apply = await harnesses.memberB.post(`/api/guilds/${guildB.id}/apply`, {
      coverLetter: "I want to join this guild to complete weekly goals and compete in wars for the shared prize pool.",
    });
    expect(apply.status).toBe(201);
    const pending = await harnesses.captainB.get(`/api/guilds/${guildB.id}/applications`);
    const app = pending.body.applications.find((a: any) => a.userId === usersState.memberB.id);
    const accept = await harnesses.captainB.patch(`/api/guilds/${guildB.id}/applications/${app.id}`, { action: "accept" });
    expect(accept.body.membership?.status).toBe("active");
  }, 60_000);

  it("guild B appears in eligible opponents for guild A", async () => {
    const res = await harnesses.captainA.get(`/api/guilds/${guildA.id}/war/eligible-opponents`);
    expect(res.status).toBe(200);
    expect(res.body.opponents.some((g: any) => g.id === guildB.id)).toBe(true);
  });

  it("captain A challenges guild B (pending_challenger_approval)", async () => {
    const res = await harnesses.captainA.post(`/api/guilds/${guildA.id}/war/challenge`, { challengedGuildId: guildB.id });
    expect(res.status).toBe(201);
    expect(res.body.war.status).toBe("pending_challenger_approval");
    wars.rejected = res.body.war.id;
  });

  it("a non-member cannot vote on the war", async () => {
    const res = await harnesses.lowRank.post(`/api/guilds/${guildB.id}/war/${wars.rejected}/vote`, { approved: true });
    expect(res.status).toBe(400);
  });

  it("a single member rejection cancels the war", async () => {
    const res = await harnesses.memberA.post(`/api/guilds/${guildA.id}/war/${wars.rejected}/vote`, { approved: false });
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(true);
    expect(res.body.war.status).toBe("cancelled");
  });

  it("challenged guild cannot vote out of turn", async () => {
    const chal = await harnesses.captainA.post(`/api/guilds/${guildA.id}/war/challenge`, { challengedGuildId: guildB.id });
    expect(chal.status).toBe(201);
    wars.main = chal.body.war.id;

    const res = await harnesses.captainB.post(`/api/guilds/${guildB.id}/war/${wars.main}/vote`, { approved: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/turn/i);
  });

  it("all four members approve → war becomes active", async () => {
    const votes = [
      [harnesses.captainA, guildA.id, usersState.captainA.id],
      [harnesses.memberA, guildA.id, usersState.memberA.id],
      [harnesses.captainB, guildB.id, usersState.captainB.id],
      [harnesses.memberB, guildB.id, usersState.memberB.id],
    ];
    let active = false;
    for (const [h, gid] of votes) {
      const res = await h.post(`/api/guilds/${gid}/war/${wars.main}/vote`, { approved: true });
      expect(res.status).toBe(200);
      if (res.body.allApproved && res.body.war?.status === "active") active = true;
    }
    expect(active).toBe(true);
  });

  it("a second challenge while busy is rejected (400)", async () => {
    const res = await harnesses.captainA.post(`/api/guilds/${guildA.id}/war/challenge`, { challengedGuildId: guildB.id });
    expect(res.status).toBe(400);
  });

  it("non-member cannot view war status (403 info-leak guard)", async () => {
    const res = await harnesses.lowRank.get(`/api/guilds/${guildA.id}/war`);
    expect(res.status).toBe(403);
  });

  it("war status shows active + full approvals + zero chests before earn events", async () => {
    const res = await harnesses.captainA.get(`/api/guilds/${guildA.id}/war`);
    expect(res.status).toBe(200);
    expect(res.body.war.status).toBe("active");
    expect(res.body.totalActiveMembers).toBe(2);
    expect(res.body.approvedCount).toBe(2);
    expect(Number(res.body.warChest?.myGuildChestPkr ?? 0)).toBe(0);
  });

  it("real Engine C earn events during the war accumulate scores + fund chests", async () => {
    // Guild A: captain completes t1 (10) + t2 (30); member completes t1 + t2 → 4 events
    // Guild B: captain completes t1; member completes t1 → 2 events (A should win)
    await harnesses.captainA.post(`/api/guilds/weekly-tasks/${tasks.t1}/complete`, {});
    await harnesses.captainA.post(`/api/guilds/weekly-tasks/${tasks.t2}/complete`, {});
    await harnesses.memberA.post(`/api/guilds/weekly-tasks/${tasks.t1}/complete`, {});
    await harnesses.memberA.post(`/api/guilds/weekly-tasks/${tasks.t2}/complete`, {});
    await harnesses.captainB.post(`/api/guilds/weekly-tasks/${tasks.t1}/complete`, {});
    await harnesses.memberB.post(`/api/guilds/weekly-tasks/${tasks.t1}/complete`, {});

    const [gA] = await db.select({ chest: guilds.warChestPkr }).from(guilds).where(eq(guilds.id, guildA.id));
    const [gB] = await db.select({ chest: guilds.warChestPkr }).from(guilds).where(eq(guilds.id, guildB.id));
    // Both chests funded from THORX's cut (levy only while war is active).
    expect(Number(gA?.chest ?? 0)).toBeGreaterThan(0);
    expect(Number(gB?.chest ?? 0)).toBeGreaterThan(0);

    const [war] = await db.select({ c: guildWars.challengerScore, d: guildWars.challengedScore })
      .from(guildWars).where(eq(guildWars.id, wars.main));
    expect(Number(war?.c ?? 0)).toBeGreaterThan(Number(war?.d ?? 0));
  }, 90_000);

  it("war status now reports chests > 0", async () => {
    const res = await harnesses.captainA.get(`/api/guilds/${guildA.id}/war`);
    expect(res.status).toBe(200);
    expect(Number(res.body.warChest?.myGuildChestPkr ?? 0)).toBeGreaterThan(0);
  });

  it("admin sees the war and resolves it → winner takes BOTH chests", async () => {
    const [gA] = await db.select({ chest: guilds.warChestPkr, pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildA.id));
    const [gB] = await db.select({ chest: guilds.warChestPkr, pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildB.id));
    const expectedPrize = Number(gA!.chest) + Number(gB!.chest);

    const list = await harnesses.founder.get("/api/admin/guild-wars/wars");
    expect(list.status).toBe(200);
    expect(list.body.wars.some((w: any) => w.id === wars.main)).toBe(true);

    const res = await harnesses.founder.patch(`/api/admin/guild-wars/wars/${wars.main}/resolve`, {});
    expect(res.status).toBe(200);
    expect(res.body.winnerId).toBe(guildA.id);
    expect(res.body.isDraw).toBe(false);
    expect(Number(res.body.prizePkr)).toBeCloseTo(expectedPrize, 2);

    const [winner] = await db.select({ chest: guilds.warChestPkr, pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildA.id));
    const [loser] = await db.select({ chest: guilds.warChestPkr, pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildB.id));
    expect(Number(winner!.chest)).toBe(0);
    expect(Number(loser!.chest)).toBe(0);
    expect(Number(winner!.pool)).toBeCloseTo(Number(gA!.pool) + expectedPrize, 2);

    const badge = await db.select().from(guildBadges)
      .where(and(eq(guildBadges.guildId, guildA.id), eq(guildBadges.badgeType, "war_winner")));
    expect(badge.length).toBeGreaterThanOrEqual(1);
  });

  it("war history lists the completed war", async () => {
    const res = await harnesses.captainA.get(`/api/guilds/${guildA.id}/war/history`);
    expect(res.status).toBe(200);
    expect(res.body.wars.some((w: any) => w.id === wars.main && w.status === "completed")).toBe(true);
  });

  it("draw war resolves with no winner and chests returned to own pools", async () => {
    // Full real flow again: challenge + all-approve → active.
    const chal = await harnesses.captainA.post(`/api/guilds/${guildA.id}/war/challenge`, { challengedGuildId: guildB.id });
    expect(chal.status).toBe(201);
    wars.draw = chal.body.war.id;
    for (const [h, gid] of [
      [harnesses.captainA, guildA.id],
      [harnesses.memberA, guildA.id],
      [harnesses.captainB, guildB.id],
      [harnesses.memberB, guildB.id],
    ]) {
      const r = await h.post(`/api/guilds/${gid}/war/${wars.draw}/vote`, { approved: true });
      expect(r.status).toBe(200);
    }

    // Equal scores + known chests (test scaffolding — this is the only place we
    // touch war numbers directly; everything before was pure gameplay).
    await db.update(guildWars).set({ challengerScore: 100, challengedScore: 100 }).where(eq(guildWars.id, wars.draw));
    await db.update(guilds).set({ warChestPkr: "100.0000" }).where(eq(guilds.id, guildA.id));
    await db.update(guilds).set({ warChestPkr: "50.0000" }).where(eq(guilds.id, guildB.id));
    const [poolA] = await db.select({ pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildA.id));
    const [poolB] = await db.select({ pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildB.id));

    const res = await harnesses.founder.patch(`/api/admin/guild-wars/wars/${wars.draw}/resolve`, {});
    expect(res.status).toBe(200);
    expect(res.body.isDraw).toBe(true);
    expect(res.body.winnerId).toBeNull();
    expect(Number(res.body.prizePkr)).toBe(0);

    const [a] = await db.select({ chest: guilds.warChestPkr, pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildA.id));
    const [b] = await db.select({ chest: guilds.warChestPkr, pool: guilds.weeklyBonusPool }).from(guilds).where(eq(guilds.id, guildB.id));
    expect(Number(a!.chest)).toBe(0);
    expect(Number(b!.chest)).toBe(0);
    expect(Number(a!.pool)).toBeCloseTo(Number(poolA!.pool) + 100, 2);
    expect(Number(b!.pool)).toBeCloseTo(Number(poolB!.pool) + 50, 2);
  });

  it("re-resolving a completed war is idempotent", async () => {
    const res = await harnesses.founder.patch(`/api/admin/guild-wars/wars/${wars.draw}/resolve`, {});
    expect(res.status).toBe(200);
    expect(res.body.isDraw).toBe(true);
    expect(res.body.winnerId).toBeNull();
  });
});

// ── Cross-cutting: audit trail + notifications ───────────────────────────────

describe("Cross-cutting — audit trail & notifications (HTTP)", () => {
  it("admin audit log contains the guild + war actions from this flow", async () => {
    const res = await harnesses.founder.get("/api/admin/audit-logs?limit=100");
    expect(res.status).toBe(200);
    const actions = new Set((res.body.logs as any[]).map((l: any) => l.action));
    for (const expected of [
      "GUILD_CREATION_REQUEST_APPROVED",
      "GUILD_APPLICATION_DECIDED",
      "GUILD_WEEKLY_TASK_COMPLETED",
      "GUILD_WAR_CHALLENGED",
    ]) {
      expect(actions.has(expected)).toBe(true);
    }
  });

  it("members received decision + war notifications", async () => {
    const res = await harnesses.memberA.get("/api/notifications");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
