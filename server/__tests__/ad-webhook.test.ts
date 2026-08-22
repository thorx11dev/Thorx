/**
 * Engine A — real rewarded ads (Phase 2) regression suite.
 *
 * Covers the server-side verification layer that makes ad credits real:
 *   1. POST /api/ads/session issues a signed one-time session bound to a
 *      pending ad_view row — no credit happens at issuance.
 *   2. POST /api/ad-view with the sessionToken completes it exactly once:
 *      the second use of the same token is rejected (409 SESSION_CONFLICT)
 *      and only ONE ledger row exists.
 *   3. POST /api/webhooks/ad-complete/:networkId credits ONLY after HMAC
 *      signature verification (per-network secret from WEBHOOK_SECRETS_JSON):
 *      a wrong signature is rejected (401), a replayed eventId is rejected
 *      (409), and a verified event credits the session owner once.
 *
 * Run: npx vitest run server/__tests__/ad-webhook.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import crypto from "crypto";
import { db, pool } from "../db";
import { users, adViews, userTransactions, systemConfig, webhookEvents } from "@shared/schema";
import { eq, inArray, sql, and } from "drizzle-orm";

const TS = Date.now();
const PASSWORD = "TestPass123!";
const NETWORK = "hilltop-1";
const WEBHOOK_SECRET = "webhook_test_secret";
const CONFIG_KEYS = ["AD_INVENTORY_JSON", "MAX_ADS_PER_DAY", "WEBHOOK_SECRETS_JSON"];

let app: any;
const cfgSnapshot = new Map<string, any>();
const createdUserIds: string[] = [];
const createdEventIds: string[] = [];

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
  const email = `adw_${key}_${TS}_${suffix}@thorx-test.local`;
  const res = await h.post("/api/register", {
    firstName: key,
    lastName: "E2E",
    identity: `adw_${key}_${TS}_${suffix}`,
    phone: `032${Math.floor(10000000 + Math.random() * 89999999)}`,
    email,
    password: PASSWORD,
  });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id);
  return { h, user: res.body.user };
}

/** Sign a raw JSON string with the per-network HMAC secret (hex, prefixed). */
function signWebhook(rawBody: string, secret = WEBHOOK_SECRET): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** Create a session for a user and return the token + sessionId. */
async function createSession(h: any): Promise<{ token: string; sessionId: string }> {
  const res = await h.post("/api/ads/session", { adId: "qa_session_ad" });
  expect(res.status).toBe(201);
  expect(res.body.token).toBeTruthy();
  return { token: res.body.token, sessionId: res.body.sessionId };
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

  // Deterministic, cap-friendly inventory (duration 1 → timing gap never blocks).
  await db.insert(systemConfig).values({
    key: "AD_INVENTORY_JSON",
    value: [
      { id: "qa_session_ad", reward: "0.05", duration: 1, type: "network", label: "QA Session Ad" },
      { id: "hilltop_fallback", reward: "0.02", duration: 5, type: "network", label: "Network Fallback" },
    ],
  }).onConflictDoUpdate({
    target: systemConfig.key,
    set: {
      value: [
        { id: "qa_session_ad", reward: "0.05", duration: 1, type: "network", label: "QA Session Ad" },
        { id: "hilltop_fallback", reward: "0.02", duration: 5, type: "network", label: "Network Fallback" },
      ],
      updatedAt: new Date(),
    },
  });

  await db.insert(systemConfig).values({ key: "MAX_ADS_PER_DAY", value: 20 })
    .onConflictDoUpdate({ target: systemConfig.key, set: { value: 20, updatedAt: new Date() } });

  // Per-network webhook HMAC secrets (real networks configure this in admin).
  await db.insert(systemConfig).values({
    key: "WEBHOOK_SECRETS_JSON",
    value: { [NETWORK]: WEBHOOK_SECRET },
  }).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value: { [NETWORK]: WEBHOOK_SECRET }, updatedAt: new Date() },
  });
}, 120_000);

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(adViews).where(inArray(adViews.userId, createdUserIds)).catch(() => {});
    await db.delete(userTransactions).where(inArray(userTransactions.userId, createdUserIds)).catch(() => {});
    await db.delete(users).where(inArray(users.id, createdUserIds)).catch(() => {});
  }
  if (createdEventIds.length) {
    await db.delete(webhookEvents)
      .where(and(eq(webhookEvents.networkId, NETWORK), inArray(webhookEvents.eventId, createdEventIds)))
      .catch(() => {});
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

describe("Engine A — real rewarded ads (Phase 2)", () => {
  it("session is issued without crediting, then completes exactly once via /api/ad-view", async () => {
    const { h, user } = await registerUser("session");

    const { token } = await createSession(h);
    expect(await countCredits(user.id)).toBe(0);

    const done = await h.post("/api/ad-view", { sessionToken: token });
    expect(done.status).toBe(201);
    expect(done.body.success).toBe(true);
    expect(await countCredits(user.id)).toBe(1);

    // Replay: the same token must not credit a second time.
    const replay = await h.post("/api/ad-view", { sessionToken: token });
    expect(replay.status).toBe(409);
    expect(replay.body.error).toBe("SESSION_CONFLICT");
    expect(await countCredits(user.id)).toBe(1);
  });

  it("a session token cannot be used by another account", async () => {
    const { h: h1, user: u1 } = await registerUser("owner");
    const { h: h2 } = await registerUser("intruder");

    const { token } = await createSession(h1);

    const res = await h2.post("/api/ad-view", { sessionToken: token });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
    expect(await countCredits(u1.id)).toBe(0);
  });

  it("a valid HMAC webhook credits the session owner and records the event", async () => {
    const { h, user } = await registerUser("hookok");
    const { token } = await createSession(h);

    const eventId = `evt_ok_${TS}_${Math.random().toString(36).slice(2, 8)}`;
    createdEventIds.push(eventId);
    const rawBody = JSON.stringify({
      eventId,
      networkId: NETWORK,
      eventType: "ad_complete",
      timestamp: Date.now(),
      country: "PK",
      sessionToken: token,
    });

    const res = await request(app)
      .post(`/api/webhooks/ad-complete/${NETWORK}`)
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", signWebhook(rawBody))
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body.credited).toBe(true);
    expect(await countCredits(user.id)).toBe(1);

    const [evt] = await db
      .select({ rewardTriggered: webhookEvents.rewardTriggered, status: webhookEvents.verificationStatus })
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, eventId))
      .limit(1);
    expect(evt?.status).toBe("verified");
    expect(evt?.rewardTriggered).toBe(true);
  });

  it("a webhook with a wrong HMAC signature is rejected and credits nothing", async () => {
    const { h, user } = await registerUser("hookbad");
    const { token } = await createSession(h);

    const eventId = `evt_bad_${TS}_${Math.random().toString(36).slice(2, 8)}`;
    createdEventIds.push(eventId);
    const rawBody = JSON.stringify({
      eventId,
      networkId: NETWORK,
      eventType: "ad_complete",
      timestamp: Date.now(),
      country: "PK",
      sessionToken: token,
    });

    const res = await request(app)
      .post(`/api/webhooks/ad-complete/${NETWORK}`)
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", signWebhook(rawBody, "wrong_secret"))
      .send(rawBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("WEBHOOK_REJECTED");
    expect(await countCredits(user.id)).toBe(0);
  });

  it("a replayed eventId (same webhook twice) is rejected", async () => {
    const { h, user } = await registerUser("hookreplay");
    const { token } = await createSession(h);

    const eventId = `evt_rp_${TS}_${Math.random().toString(36).slice(2, 8)}`;
    createdEventIds.push(eventId);
    const rawBody = JSON.stringify({
      eventId,
      networkId: NETWORK,
      eventType: "ad_complete",
      timestamp: Date.now(),
      country: "PK",
      sessionToken: token,
    });
    const sig = signWebhook(rawBody);

    const first = await request(app)
      .post(`/api/webhooks/ad-complete/${NETWORK}`)
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(rawBody);
    expect(first.status).toBe(200);
    expect(first.body.credited).toBe(true);

    const second = await request(app)
      .post(`/api/webhooks/ad-complete/${NETWORK}`)
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(rawBody);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("WEBHOOK_REJECTED");
    expect(await countCredits(user.id)).toBe(1);
  });

  it("webhook with an already-completed session is rejected (one credit per session)", async () => {
    const { h, user } = await registerUser("hookdone");
    const { token } = await createSession(h);

    // Complete via the client path first.
    const done = await h.post("/api/ad-view", { sessionToken: token });
    expect(done.status).toBe(201);

    const eventId = `evt_dn_${TS}_${Math.random().toString(36).slice(2, 8)}`;
    createdEventIds.push(eventId);
    const rawBody = JSON.stringify({
      eventId,
      networkId: NETWORK,
      eventType: "ad_complete",
      timestamp: Date.now(),
      country: "PK",
      sessionToken: token,
    });

    const res = await request(app)
      .post(`/api/webhooks/ad-complete/${NETWORK}`)
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", signWebhook(rawBody))
      .send(rawBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SESSION_CONFLICT");
    expect(await countCredits(user.id)).toBe(1);
  });
});
