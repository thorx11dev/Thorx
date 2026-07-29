/**
 * Admin System Config — known-key safety net (Ranks & Engine Config audit, 2026-07-29).
 *
 * PATCH /api/admin/config/:key accepts any key (system_config is intentionally
 * a flexible key-value store — AD_NETWORKS, CPA_NETWORKS, ENGINE_A_PLAYERS_JSON
 * etc. are legitimately admin-authored). But before this fix, several admin
 * panels (RanksCustomizer, SystemSettingsManager) saved keys that matched
 * nothing any engine reads (e.g. PS_THRESHOLD_E, ENGINE_A_USER_SPLIT), and the
 * route returned a plain success with no way to tell. This test locks in the
 * `isKnownKey` response flag so that regression is caught immediately instead
 * of silently reappearing.
 *
 * Run: npx vitest run server/__tests__/admin-config-known-keys.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Agent } from "supertest";
import { db, pool } from "../db";
import { users, systemConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { KNOWN_SYSTEM_CONFIG_KEYS } from "../storage";

const TS = Date.now();
const TEST_EMAIL = `test_admincfg_${TS}@thorx-test.local`;
const TEST_PHONE = `031${Math.floor(10000000 + Math.random() * 89999999)}`;
const TEST_PASSWORD = "TestPass123!";
const PROBE_KEY = `__TEST_UNKNOWN_KEY_${TS}__`;

let app: any;
let agent: Agent;
let createdUserId: string | null = null;
let csrfToken = "";

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

async function post(path: string, body: object): Promise<request.Response> {
  const res = await agent.post(path).set("x-csrf-token", csrfToken).send(body);
  const fresh = getCsrfToken(res);
  if (fresh) csrfToken = fresh;
  return res;
}

async function patch(path: string, body: object): Promise<request.Response> {
  const res = await agent.patch(path).set("x-csrf-token", csrfToken).send(body);
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

  agent = request.agent(app);
  const seedRes = await agent.get("/api/health");
  csrfToken = getCsrfToken(seedRes);

  // Register + promote a throwaway user to founder so MANAGE_SYSTEM passes.
  const reg = await post("/api/register", {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    firstName: "Admin",
    lastName: "CfgTest",
    phone: TEST_PHONE,
    identity: `admincfg_${TS}`,
  });
  createdUserId = reg.body?.user?.id ?? null;
  if (createdUserId) {
    await db.update(users).set({ role: "founder" }).where(eq(users.id, createdUserId));
  }
  // Re-login so the session reflects the founder role.
  await post("/api/login", { email: TEST_EMAIL, password: TEST_PASSWORD });
}, 60_000);

afterAll(async () => {
  await db.delete(systemConfig).where(eq(systemConfig.key, PROBE_KEY)).catch(() => {});
  if (createdUserId) {
    await db.delete(users).where(eq(users.id, createdUserId)).catch(() => {});
  }
  await pool.end();
}, 30_000);

describe("Admin system_config — known-key flag", () => {
  it("flags a real engine key (PS_RANK_D_MIN) as known", async () => {
    const res = await patch("/api/admin/config/PS_RANK_D_MIN", { value: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.isKnownKey).toBe(true);
  });

  it("flags a key nothing reads as NOT known (regression guard)", async () => {
    const res = await patch(`/api/admin/config/${PROBE_KEY}`, { value: 1 });
    expect(res.status).toBe(200);
    expect(res.body.isKnownKey).toBe(false);
  });

  it("the legacy buggy RanksCustomizer keys are correctly classified as unknown", async () => {
    // These were the exact keys the admin UI used to write before the audit —
    // they must never match a real engine key again.
    for (const legacyKey of ["PS_THRESHOLD_E", "ENGINE_A_USER_SPLIT", "CARD_VARIANCE_PCT", "PS_PER_ENGINE_A_EVENT"]) {
      expect(KNOWN_SYSTEM_CONFIG_KEYS.has(legacyKey)).toBe(false);
    }
  });

  it("the real keys RanksCustomizer now uses are all known", async () => {
    const realKeys = [
      "PS_RANK_D_MIN", "PS_RANK_C_MIN", "PS_RANK_B_MIN", "PS_RANK_A_MIN", "PS_RANK_S_MIN",
      "ENGINE_A_THORX_CUT_PCT", "ENGINE_B_THORX_CUT_PCT", "ENGINE_C_THORX_CUT_PCT",
      "ENGINE_C_GUILD_POOL_PCT", "ENGINE_C_BONUS_PCT",
      "ENGINE_A_ILLUSION_VARIANCE_PCT", "ENGINE_B_ILLUSION_VARIANCE_PCT", "ENGINE_C_ILLUSION_VARIANCE_PCT",
      "A_RANK_CARD_BONUS_PCT", "S_RANK_CARD_BONUS_PCT",
      "PS_ENGINE_A_REWARD", "PS_ENGINE_B_REWARD", "PS_ENGINE_C_REWARD",
      "PS_STREAK_DAY1", "PS_STREAK_DAY2", "PS_STREAK_DAY3_PLUS",
      "PS_INACTIVITY_PENALTY", "PS_INACTIVITY_HOURS",
    ];
    for (const k of realKeys) {
      expect(KNOWN_SYSTEM_CONFIG_KEYS.has(k)).toBe(true);
    }
  });
});
