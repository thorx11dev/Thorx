// ── THORX Beta Trust Module ──────────────────────────────────────────────────
// Owns the three trust primitives added for the controlled beta:
//   • Honesty-rules acknowledgment (anti-fraud Layer 1)
//   • Invite-code gate for the 1000-user beta cap
//   • User feedback inbox feeding the Team Portal
//
// Lives outside storage.ts deliberately: storage.ts is a 7k-line core ledger
// file where every earn-path change demands full regression; these flows are
// isolated here so they can evolve independently during beta.

import { db } from "../db";
import { logger } from "../lib/logger";
import { users, notifications, systemConfig } from "@shared/schema";
import { betaInvites, feedbackMessages, FEEDBACK_CATEGORIES } from "@shared/beta-schema";
import { eq, sql, desc, and } from "drizzle-orm";

export { FEEDBACK_CATEGORIES };

// ── Rules acknowledgment ────────────────────────────────────────────────────

export async function acknowledgeRules(userId: string): Promise<Date> {
  const now = new Date();
  await db.update(users).set({ rulesAcknowledgedAt: now, updatedAt: now }).where(eq(users.id, userId));
  return now;
}

export async function getRulesAcknowledgedAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ rulesAcknowledgedAt: users.rulesAcknowledgedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.rulesAcknowledgedAt ?? null;
}

// ── Beta invite gate ────────────────────────────────────────────────────────

/**
 * Validate an invite code WITHOUT consuming it (registration can still fail
 * later). Throws user-facing Error messages.
 */
export async function validateBetaInvite(code: string): Promise<any> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error("Invite code required.");
  const [invite] = await db.select().from(betaInvites).where(eq(betaInvites.code, normalized)).limit(1);
  if (!invite || !invite.isActive) throw new Error("Invalid invite code.");
  if (invite.useCount >= invite.maxUses) throw new Error("This invite code has already been fully used.");
  return invite;
}

/** Atomically bump use-count once the account is actually created. */
export async function finalizeBetaInviteUse(code: string, userId: string): Promise<void> {
  try {
    const normalized = code.trim().toUpperCase();
    const [invite] = await db.select().from(betaInvites).where(eq(betaInvites.code, normalized)).limit(1);
    if (!invite) return;
    const fullyUsed = invite.useCount + 1 >= invite.maxUses;
    await db
      .update(betaInvites)
      .set({
        useCount: sql`${betaInvites.useCount} + 1`,
        consumedByUserId: fullyUsed ? userId : null,
        consumedAt: fullyUsed ? new Date() : null,
      })
      .where(and(eq(betaInvites.id, invite.id), eq(betaInvites.isActive, true)));
  } catch (err) {
    // Never fail a completed registration over bookkeeping — log loudly instead.
    logger.error({ err, code }, "[beta-trust] finalizeBetaInviteUse failed");
  }
}

/** Public shape for GET /api/beta/status — lets the client show/hide the field. */
export async function getBetaStatus(): Promise<{
  inviteRequired: boolean;
  slotsRemainingLabel: string | null;
}> {
  const [cfgRow] = await db.select().from(systemConfig).where(eq(systemConfig.key, "BETA_INVITE_REQUIRED")).limit(1);
  const inviteRequired = cfgRow?.value === true || cfgRow?.value === "true";
  if (!inviteRequired) return { inviteRequired: false, slotsRemainingLabel: null };
  const [row] = await db
    .select({
      remaining: sql<number>`COALESCE(SUM(${betaInvites.maxUses} - ${betaInvites.useCount}), 0)`,
    })
    .from(betaInvites)
    .where(eq(betaInvites.isActive, true));
  return { inviteRequired: true, slotsRemainingLabel: `${Number(row?.remaining ?? 0)} invites left` };
}

// ── Feedback inbox ──────────────────────────────────────────────────────────

const MAX_FEEDBACK_LEN = 2000;

export async function submitFeedback(userId: string, category: string, message: string): Promise<any> {
  const cleanCategory = FEEDBACK_CATEGORIES.includes(category as any) ? category : "general";
  const cleanMessage = message.trim();
  if (cleanMessage.length < 5) throw new Error("Please describe your feedback (at least 5 characters).");
  if (cleanMessage.length > MAX_FEEDBACK_LEN) throw new Error(`Feedback too long (max ${MAX_FEEDBACK_LEN} characters).`);
  const [row] = await db
    .insert(feedbackMessages)
    .values({ userId, category: cleanCategory, message: cleanMessage })
    .returning();
  return row;
}

export async function listMyFeedback(userId: string, limit = 20): Promise<any[]> {
  return await db
    .select()
    .from(feedbackMessages)
    .where(eq(feedbackMessages.userId, userId))
    .orderBy(desc(feedbackMessages.createdAt))
    .limit(Math.min(limit, 100));
}

const TEAM_SELECT = {
  id: feedbackMessages.id,
  userId: feedbackMessages.userId,
  category: feedbackMessages.category,
  message: feedbackMessages.message,
  status: feedbackMessages.status,
  adminResponse: feedbackMessages.adminResponse,
  handledBy: feedbackMessages.handledBy,
  handledAt: feedbackMessages.handledAt,
  createdAt: feedbackMessages.createdAt,
  userEmail: users.email,
  userName: sql<string>`TRIM(COALESCE(${users.firstName}, '') || ' ' || COALESCE(${users.lastName}, ''))`,
  userRankTier: users.userRankTier,
};

export async function listFeedbackForTeam(status: string | undefined, limit = 100): Promise<any[]> {
  const capped = Math.min(limit, 200);
  if (status && status !== "all") {
    return await db
      .select(TEAM_SELECT)
      .from(feedbackMessages)
      .leftJoin(users, eq(users.id, feedbackMessages.userId))
      .where(eq(feedbackMessages.status, status))
      .orderBy(desc(feedbackMessages.createdAt))
      .limit(capped);
  }
  return await db
    .select(TEAM_SELECT)
    .from(feedbackMessages)
    .leftJoin(users, eq(users.id, feedbackMessages.userId))
    .orderBy(desc(feedbackMessages.createdAt))
    .limit(capped);
}

export async function changeFeedbackStatus(
  id: string,
  status: string,
  adminResponse: string | undefined,
  adminId: string
): Promise<any> {
  if (!["open", "triaged", "resolved"].includes(status)) throw new Error("Invalid status.");
  const [row] = await db
    .update(feedbackMessages)
    .set({ status, adminResponse: adminResponse ?? null, handledBy: adminId, handledAt: new Date() })
    .where(eq(feedbackMessages.id, id))
    .returning();
  if (!row) throw new Error("Feedback not found.");

  // Close the loop: notify the user their report was handled (+ response text).
  try {
    await db.insert(notifications).values({
      userId: row.userId,
      title: status === "resolved" ? "✅ Aapka feedback resolve ho gaya" : "👁️ Aapke feedback par nazar rakhi ja rahi hai",
      message: adminResponse?.trim()
        ? adminResponse.trim().slice(0, 500)
        : "THORX team ne aapki report review kar li hai. Shukriya platform behtar banane ke liye!",
      type: "info",
      adminRole: "team",
    });
  } catch (err) {
    logger.warn({ err }, "[beta-trust] feedback notification insert failed (non-blocking)");
  }
  return row;
}

// ── Team-side invite management ─────────────────────────────────────────────

function generateInviteCode(): string {
  // THORX-XXXX-XXXX — human-shareable, unambiguous alphabet (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `THORX-${block()}-${block()}`;
}

export async function createBetaInvite(opts: {
  maxUses: number;
  note?: string | undefined;
  createdByEmail?: string | undefined;
}): Promise<any> {
  const maxUses = Math.max(1, Math.min(1000, Math.floor(opts.maxUses || 1)));
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    try {
      const [row] = await db
        .insert(betaInvites)
        .values({ code, maxUses, note: opts.note ?? null, createdByEmail: opts.createdByEmail ?? null })
        .returning();
      return row;
    } catch (err: any) {
      if (err?.code === "23505") continue; // unique collision → retry new code
      throw err;
    }
  }
  throw new Error("Could not generate a unique invite code — please retry.");
}

export async function listBetaInvites(limit = 100): Promise<any[]> {
  return await db.select().from(betaInvites).orderBy(desc(betaInvites.createdAt)).limit(Math.min(limit, 200));
}

export async function deactivateBetaInvite(id: string): Promise<any> {
  const [row] = await db.update(betaInvites).set({ isActive: false }).where(eq(betaInvites.id, id)).returning();
  if (!row) throw new Error("Invite not found.");
  return row;
}
