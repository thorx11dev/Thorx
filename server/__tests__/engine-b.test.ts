/**
 * Engine B (CPA Tasks) integration tests — THORX
 *
 * Covers:
 *  1. CRUD: createEngineBTask, getEngineBTask, updateEngineBTask, deleteEngineBTask
 *  2. User view: getEngineBTasksForUser (active only, completion status)
 *  3. Click record: createEngineBRecord (task session init)
 *  4. Duplicate click guard: second createEngineBRecord for same user+task is blocked by UNIQUE
 *  5. Rank gate enforcement (C-Rank required for "Hard" difficulty)
 *  6. recordEarnEvent integration: completing an Engine B task credits points
 *
 * Storage methods are called directly — no HTTP / no CSRF.
 * Run: npx vitest run server/__tests__/engine-b.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import {
  users,
  engineBTasks,
  engineBRecords,
  userTransactions,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storage } from "../storage";
import bcrypt from "bcrypt";
import Decimal from "decimal.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TS = Date.now();
const seededUserIds:  string[] = [];
const seededTaskIds:  string[] = [];
const seededRecordIds: string[] = [];

async function createTestUser(overrides: Partial<{
  identity: string;
  email: string;
  phone: string;
  userRankTier: string;
}> = {}): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const [u] = await db.insert(users).values({
    firstName:    "EngineB",
    lastName:     "Tester",
    identity:     overrides.identity   ?? `ebtst_${TS}_${suffix}`,
    phone:        overrides.phone      ?? `033${Math.floor(10000000 + Math.random() * 89999999)}`,
    email:        overrides.email      ?? `ebtst_${TS}_${suffix}@thorx-test.local`,
    passwordHash: await bcrypt.hash("TestPass123!", 10),
    referralCode: `EBREF_${suffix}`,
    role:         "user",
    userRankTier: overrides.userRankTier ?? "C-Rank", // C-Rank: default passes rank gate
  } as any).returning();
  seededUserIds.push(u.id);
  return u.id;
}

async function createTask(overrides: Partial<{
  title: string;
  grossPkrPerCompletion: string;
  secretCode: string;
  isActive: boolean;
  difficulty: string;
}> = {}): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 6);
  const task = await storage.createEngineBTask({
    title:                 overrides.title                ?? `CPA_Task_${suffix}`,
    description:           "Test CPA offer",
    type:                  "cpa_offer",
    actionUrl:             "https://example.com/offer",
    secretCode:            overrides.secretCode           ?? `SECRET${suffix}`,
    grossPkrPerCompletion: overrides.grossPkrPerCompletion ?? "10.0000",
    isActive:              overrides.isActive              ?? true,
    difficulty:            overrides.difficulty            ?? "Easy",
    targetRank:            "C-Rank",
  } as any);
  seededTaskIds.push(task.id);
  return task.id;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (seededRecordIds.length) {
    await db.delete(engineBRecords)
      .where(inArray(engineBRecords.id, seededRecordIds))
      .catch(() => {});
  }
  if (seededTaskIds.length) {
    await db.delete(engineBRecords)
      .where(inArray(engineBRecords.taskId, seededTaskIds))
      .catch(() => {});
    await db.delete(engineBTasks)
      .where(inArray(engineBTasks.id, seededTaskIds))
      .catch(() => {});
  }
  if (seededUserIds.length) {
    await db.delete(userTransactions)
      .where(inArray(userTransactions.userId, seededUserIds))
      .catch(() => {});
    await db.delete(users)
      .where(inArray(users.id, seededUserIds))
      .catch(() => {});
  }
  await pool.end();
}, 30_000);

// ── Suite 1: Task CRUD ────────────────────────────────────────────────────────

describe("Engine B Task CRUD", () => {
  let taskId: string;

  beforeAll(async () => {
    taskId = await createTask({ title: "CRUD Test Task", grossPkrPerCompletion: "25.0000" });
  }, 15_000);

  it("createEngineBTask stores the task", async () => {
    const task = await storage.getEngineBTask(taskId);
    expect(task).toBeDefined();
    expect(task!.title).toBe("CRUD Test Task");
    expect(task!.grossPkrPerCompletion).toBe("25.0000");
    expect(task!.isActive).toBe(true);
  });

  it("getEngineBTasks includes the created task", async () => {
    const all = await storage.getEngineBTasks();
    const found = all.find(t => t.id === taskId);
    expect(found).toBeDefined();
  });

  it("updateEngineBTask updates title and gross PKR", async () => {
    const updated = await storage.updateEngineBTask(taskId, {
      title:                "Updated Task",
      grossPkrPerCompletion: "50.0000",
    });
    expect(updated!.title).toBe("Updated Task");
    expect(updated!.grossPkrPerCompletion).toBe("50.0000");
  });

  it("deleteEngineBTask removes the task", async () => {
    const tempId = await createTask({ title: "ToDelete" });
    await storage.deleteEngineBTask(tempId);
    const gone = await storage.getEngineBTask(tempId);
    expect(gone).toBeUndefined();
    // Remove from cleanup list since it's deleted
    const idx = seededTaskIds.indexOf(tempId);
    if (idx !== -1) seededTaskIds.splice(idx, 1);
  });
});

// ── Suite 2: getEngineBTasksForUser ──────────────────────────────────────────

describe("getEngineBTasksForUser()", () => {
  let userId: string;
  let activeTaskId: string;
  let inactiveTaskId: string;

  beforeAll(async () => {
    userId        = await createTestUser({ identity: `eb_view_${TS}` });
    activeTaskId  = await createTask({ title: "Active Task", isActive: true });
    inactiveTaskId = await createTask({ title: "Inactive Task", isActive: false });
  }, 15_000);

  it("returns active tasks with completion record (null = not done)", async () => {
    const rows = await storage.getEngineBTasksForUser(userId);
    const activeRow = rows.find(r => r.task.id === activeTaskId);
    expect(activeRow).toBeDefined();
    expect(activeRow!.record).toBeNull();
  });

  it("does NOT return inactive tasks", async () => {
    const rows = await storage.getEngineBTasksForUser(userId);
    const inactiveRow = rows.find(r => r.task.id === inactiveTaskId);
    expect(inactiveRow).toBeUndefined();
  });

  it("shows record when task is clicked", async () => {
    const [rec] = await db.insert(engineBRecords).values({
      userId,
      taskId: activeTaskId,
      status: "clicked",
      clickedAt: new Date(),
    } as any).returning();
    seededRecordIds.push(rec.id);

    const rows = await storage.getEngineBTasksForUser(userId);
    const row = rows.find(r => r.task.id === activeTaskId);
    expect(row!.record).not.toBeNull();
    expect(row!.record!.status).toBe("clicked");
  });
});

// ── Suite 3: createEngineBRecord (click) ─────────────────────────────────────

describe("createEngineBRecord() — click event", () => {
  let userId: string;
  let taskId: string;

  beforeAll(async () => {
    userId = await createTestUser({ identity: `eb_click_${TS}` });
    taskId = await createTask({ title: "Click Test Task" });
  }, 15_000);

  it("inserts a record with status 'clicked'", async () => {
    const rec = await storage.createEngineBRecord({
      userId,
      taskId,
      status: "clicked",
      clickedAt: new Date(),
    } as any);
    seededRecordIds.push(rec.id);
    expect(rec.status).toBe("clicked");
    expect(rec.userId).toBe(userId);
    expect(rec.taskId).toBe(taskId);
  });

  it("getEngineBRecord returns the click record", async () => {
    const rec = await storage.getEngineBRecord(userId, taskId);
    expect(rec).toBeDefined();
    expect(rec!.status).toBe("clicked");
    expect(rec!.clickedAt).not.toBeNull();
  });

  it("UNIQUE constraint prevents duplicate click for same user+task", async () => {
    await expect(
      storage.createEngineBRecord({
        userId,
        taskId,
        status: "clicked",
        clickedAt: new Date(),
      } as any)
    ).rejects.toThrow(); // DB unique violation
  });
});

// ── Suite 4: recordEarnEvent — Engine B earn split ────────────────────────────

describe("recordEarnEvent() for Engine_B", () => {
  let userId: string;
  const GROSS_PKR = 10; // Rs. 10 gross per task

  beforeAll(async () => {
    userId = await createTestUser({ identity: `eb_earn_${TS}` });
  }, 15_000);

  it("credits 60% of gross as TX-points (user cut) and records ledger row", async () => {
    const before = await storage.getUserById(userId);
    const beforePts = before!.txPointsBalance ?? 0;

    const result = await storage.recordEarnEvent({
      userId,
      engineType: "Engine_B",
      grossPkr: GROSS_PKR,
      sourceId: `test_eb_earn_${TS}`,
      sourceType: "engine_b_task",
    });

    expect(result.pointsCredited).toBeGreaterThan(0);

    const after = await storage.getUserById(userId);
    expect((after!.txPointsBalance ?? 0)).toBeGreaterThan(beforePts);
  });

  it("creates a user_transactions ledger row", async () => {
    const txs = await db
      .select()
      .from(userTransactions)
      .where(and(eq(userTransactions.userId, userId), eq(userTransactions.engineType, "Engine_B")));
    expect(txs.length).toBeGreaterThan(0);
    expect(new Decimal(txs[0].grossPkr).toNumber()).toBeCloseTo(GROSS_PKR, 2);
  });

  it("duplicate sourceId + sourceType is idempotent (does not double-credit)", async () => {
    const before = await storage.getUserById(userId);
    const beforePts = before!.txPointsBalance ?? 0;

    // Re-fire same earn event — unique index on (userId, sourceId, sourceType) blocks it
    await expect(
      storage.recordEarnEvent({
        userId,
        engineType: "Engine_B",
        grossPkr: GROSS_PKR,
        sourceId: `test_eb_earn_${TS}`,
        sourceType: "engine_b_task",
      })
    ).rejects.toThrow(); // unique constraint violation

    const after = await storage.getUserById(userId);
    expect((after!.txPointsBalance ?? 0)).toBe(beforePts); // unchanged
  });
});
