/**
 * Team invitation flow integration tests — THORX
 *
 * Exercises the full "onboard someone with no THORX account yet" path added
 * to Team Keys: create invitation → verify token → accept (creates the real
 * account + grants role/permissions) → session established. Also covers the
 * guard rails: inviting an email that already has an account (409), and
 * re-using a consumed/invalid token (404).
 *
 * Same CSRF/cookie-agent harness as auth.test.ts.
 *
 * Run: npx vitest run server/__tests__/team-invitations.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import bcrypt from "bcrypt";
import { db, pool } from "../db";
import { users, teamKeys, teamInvitations } from "@shared/schema";
import { eq } from "drizzle-orm";

const TS = Date.now();
const FOUNDER_EMAIL = `test_inviter_${TS}@thorx-test.local`;
const FOUNDER_PASSWORD = "TestPass123!";
const INVITEE_EMAIL = `test_invitee_${TS}@thorx-test.local`;
const EXISTING_EMAIL = `test_existing_${TS}@thorx-test.local`;

let app: any;
let agent: Agent;
let founderId: string;
let existingUserId: string;
let inviteeUserId: string | null = null;
let inviteToken = "";

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

let csrfToken = "";

async function post(path: string, body: object): Promise<request.Response> {
  const res = await agent.post(path).set("x-csrf-token", csrfToken).send(body);
  const fresh = getCsrfToken(res);
  if (fresh) csrfToken = fresh;
  return res;
}

beforeAll(async () => {
  const expressModule = await import("express");
  app = expressModule.default();
  app.use(expressModule.default.json({ limit: "10mb" }));
  app.use(expressModule.default.urlencoded({ extended: false }));
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);

  // Seed a founder directly (bypasses the registration endpoint, which never
  // issues founder roles) and an "already has an account" user for the 409 case.
  const passwordHash = await bcrypt.hash(FOUNDER_PASSWORD, 10);
  const [founder] = await db.insert(users).values({
    firstName: "Test", lastName: "Inviter", identity: `tfound_${TS}`,
    phone: `031${Math.floor(10000000 + Math.random() * 89999999)}`,
    email: FOUNDER_EMAIL, passwordHash, referralCode: `TFI-${TS}`, role: "founder",
  } as any).returning();
  founderId = founder.id;

  const [existing] = await db.insert(users).values({
    firstName: "Already", lastName: "Exists", identity: `texist_${TS}`,
    phone: `032${Math.floor(10000000 + Math.random() * 89999999)}`,
    email: EXISTING_EMAIL, passwordHash: await bcrypt.hash("Whatever123!", 10),
    referralCode: `TEX-${TS}`, role: "user",
  } as any).returning();
  existingUserId = existing.id;

  agent = request.agent(app);
  const seedRes = await agent.get("/api/health");
  csrfToken = getCsrfToken(seedRes);

  const loginRes = await post("/api/login", { email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD });
  expect(loginRes.status).toBe(200);
}, 60_000);

afterAll(async () => {
  if (inviteeUserId) await db.delete(teamKeys).where(eq(teamKeys.userId, inviteeUserId)).catch(() => {});
  if (inviteeUserId) await db.delete(users).where(eq(users.id, inviteeUserId)).catch(() => {});
  await db.delete(teamInvitations).where(eq(teamInvitations.email, INVITEE_EMAIL)).catch(() => {});
  await db.delete(teamKeys).where(eq(teamKeys.userId, founderId)).catch(() => {});
  await db.delete(users).where(eq(users.id, founderId)).catch(() => {});
  await db.delete(users).where(eq(users.id, existingUserId)).catch(() => {});
  await pool.end();
}, 30_000);

describe("Team invitation flow", () => {
  it("rejects an invitation to an email that already has an account (409)", async () => {
    const res = await post("/api/team/invitations", { email: EXISTING_EMAIL, role: "team", permissions: [] });
    expect(res.status).toBe(409);
  });

  it("creates an invitation for a brand-new email, granting the 'tasks' permission", async () => {
    const res = await post("/api/team/invitations", {
      email: INVITEE_EMAIL, role: "team", permissions: ["tasks", "payouts"],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("inviteUrl");
    expect(typeof res.body.emailSent).toBe("boolean");

    const url = new URL(res.body.inviteUrl);
    inviteToken = url.searchParams.get("invite") || "";
    expect(inviteToken.length).toBeGreaterThan(10);
  });

  it("verifies the invitation token and returns the invited email + role", async () => {
    const res = await agent.get(`/api/team/invitations/verify/${inviteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(INVITEE_EMAIL);
    expect(res.body.role).toBe("team");
  });

  it("rejects verification of a bogus token (404)", async () => {
    const res = await agent.get(`/api/team/invitations/verify/not-a-real-token`);
    expect(res.status).toBe(404);
  });

  it("accepts the invitation, creating a real logged-in account with the granted permissions", async () => {
    // Accept runs as a fresh, unauthenticated agent — the invitee has no
    // session yet; only possession of the token gates this endpoint.
    const freshAgent = request.agent(app);
    const seedRes = await freshAgent.get("/api/health");
    const freshCsrf = getCsrfToken(seedRes);

    const res = await freshAgent
      .post("/api/team/invitations/accept")
      .set("x-csrf-token", freshCsrf)
      .send({ token: inviteToken, firstName: "Invitee", lastName: "Person", password: "InviteePass123!" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(INVITEE_EMAIL);
    expect(res.body.user.role).toBe("team");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    inviteeUserId = res.body.user.id;

    // Session was established server-side as part of accept — confirm the
    // same agent is now authenticated as the new user, not just handed a body.
    const meRes = await freshAgent.get("/api/user");
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(INVITEE_EMAIL);
  });

  it("persisted the granted permissions on both users.permissions and team_keys", async () => {
    const [dbUser] = await db.select().from(users).where(eq(users.id, inviteeUserId!));
    expect(dbUser.permissions).toEqual(expect.arrayContaining(["tasks", "payouts"]));

    const keys = await db.select().from(teamKeys).where(eq(teamKeys.userId, inviteeUserId!));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys[0].permissions).toEqual(expect.arrayContaining(["tasks", "payouts"]));
    expect(keys[0].accessLevel).toBe("team");
  });

  it("rejects re-using the same (now consumed) token", async () => {
    const res = await agent.get(`/api/team/invitations/verify/${inviteToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects accepting the same token twice", async () => {
    const res = await post("/api/team/invitations/accept", {
      token: inviteToken, firstName: "Second", lastName: "Attempt", password: "Whatever123!",
    });
    expect(res.status).toBe(404);
  });

  it("blocks a non-founder from inviting someone as admin", async () => {
    // The invitee we just created has role='team' — log in as them and confirm
    // they cannot escalate a new invite to admin even if MANAGE_TEAM were granted.
    const teamAgent = request.agent(app);
    const seedRes = await teamAgent.get("/api/health");
    let teamCsrf = getCsrfToken(seedRes);

    const loginRes = await teamAgent
      .post("/api/login")
      .set("x-csrf-token", teamCsrf)
      .send({ email: INVITEE_EMAIL, password: "InviteePass123!" });
    expect(loginRes.status).toBe(200);
    const fresh = getCsrfToken(loginRes);
    if (fresh) teamCsrf = fresh;

    const res = await teamAgent
      .post("/api/team/invitations")
      .set("x-csrf-token", teamCsrf)
      .send({ email: `blocked_${TS}@thorx-test.local`, role: "admin", permissions: [] });

    // Either 403 (blocked from admin escalation) or 403 (lacks MANAGE_TEAM
    // entirely, since we only granted 'tasks'/'payouts') — both are correct
    // "not allowed" outcomes; the important thing is it's never a 2xx.
    expect(res.status).toBe(403);
  });
});
