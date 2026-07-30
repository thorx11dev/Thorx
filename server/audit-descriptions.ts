// Human-readable formatter for the Audit Logs system (Team Portal).
//
// Every action recorded via storage.createAuditLog() gets a plain-English
// sentence here instead of showing raw action codes / JSON to Team Portal
// users. Descriptions are computed on READ (not stored), so improving a
// template here retroactively improves how every historical row displays.
//
// Design rules:
//  - Never throw: an unmapped or malformed action must still render a sane
//    fallback sentence, never break the Audit Logs page.
//  - Pull specific, known fields out of `details` for richness (amounts,
//    old/new values); do not dump raw JSON into the sentence.
//  - Money values always render via Decimal.js, matching the rest of THORX.
import Decimal from "decimal.js";

export interface AuditLogForDescription {
  action: string;
  targetType: string;
  targetId: string;
  details: unknown;
  actorName: string;
}

function d(details: unknown): Record<string, any> {
  return details && typeof details === "object" ? (details as Record<string, any>) : {};
}

function shortId(id: string | null | undefined): string {
  if (!id) return "an unknown record";
  if (id === "bulk") return "a bulk selection";
  return id.length > 8 ? `#${id.slice(0, 8)}` : `#${id}`;
}

function pkr(value: unknown): string {
  if (value === null || value === undefined || value === "") return "an unspecified amount";
  try {
    return `Rs. ${new Decimal(String(value)).toFixed(2)}`;
  } catch {
    return String(value);
  }
}

function titleCase(value: unknown): string {
  const s = String(value ?? "").replace(/_/g, " ").trim();
  if (!s) return "unknown";
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function humanizeAction(action: string): string {
  return titleCase(action.toLowerCase());
}

function personOrId(email: unknown, id: string): string {
  return email ? String(email) : `user ${shortId(id)}`;
}

type Formatter = (log: AuditLogForDescription) => string;

// Exact-match templates for known static action codes.
const FORMATTERS: Record<string, Formatter> = {
  UPDATE_PROFILE: (log) => {
    const { fields, diff, profilePictureChanged } = d(log.details);
    if (diff && Object.keys(diff).length) {
      const parts = Object.entries(diff).map(([k, v]: [string, any]) => `${titleCase(k)}: "${v?.before ?? "—"}" → "${v?.after ?? "—"}"`);
      if (profilePictureChanged) parts.push("profile picture changed");
      return `${log.actorName} updated their profile (${parts.join(", ")}).`;
    }
    if (profilePictureChanged && !(Array.isArray(fields) && fields.length)) {
      return `${log.actorName} updated their profile picture.`;
    }
    const fieldList = Array.isArray(fields) && fields.length ? fields.map(titleCase).join(", ") : "profile details";
    return `${log.actorName} updated their ${fieldList}.`;
  },
  USER_SUSPENDED: (log) => `${log.actorName} suspended ${personOrId(d(log.details).email, log.targetId)}.`,
  USER_DEACTIVATED: (log) => `${log.actorName} deactivated ${personOrId(d(log.details).email, log.targetId)}.`,
  RANK_TIER_MANUALLY_SET: (log) => {
    const { oldTier, newTier, locked } = d(log.details);
    return `${log.actorName} manually changed a user's rank from ${oldTier ?? "unknown"} to ${newTier ?? "unknown"}${locked ? " and locked it" : ""}.`;
  },
  TRUST_STATUS_SET: (log) => {
    const { oldStatus, newStatus, reason } = d(log.details);
    const change = newStatus ? `set trust status to "${newStatus}"` : "cleared the trust status";
    return `${log.actorName} ${change} for a user (was "${oldStatus ?? "none"}")${reason ? ` — ${reason}` : ""}.`;
  },
  RISK_CASE_UPDATED: (log) => {
    const { statusChange, resolution, trustStatusOutcome } = d(log.details);
    const parts = [
      statusChange && `status → ${statusChange}`,
      resolution && `resolution: ${resolution}`,
      trustStatusOutcome && `trust outcome: ${trustStatusOutcome}`,
    ].filter(Boolean);
    return `${log.actorName} updated a risk case${parts.length ? ` (${parts.join(", ")})` : ""}.`;
  },
  RISK_SCAN_TRIGGERED: (log) => `${log.actorName} triggered a manual risk scan.`,
  TEAM_INVITATION_CREATED: (log) => `${log.actorName} invited ${d(log.details).email ?? "a new team member"} to join the Team Portal.`,
  TEAM_INVITATION_ACCEPTED: (log) => `${log.actorName} accepted a team invitation and joined the Team Portal.`,
  TEAM_MEMBER_ADDED: (log) => `${log.actorName} added ${d(log.details).email ?? "a new team member"} with role "${d(log.details).role ?? "unknown"}".`,
  TEAM_MEMBER_UPDATED: (log) => {
    const { email, oldRole, newRole, oldIsActive, newIsActive } = d(log.details);
    const bits: string[] = [];
    if (oldRole !== newRole) bits.push(`role ${oldRole ?? "?"} → ${newRole ?? "?"}`);
    if (oldIsActive !== newIsActive) bits.push(newIsActive ? "reactivated" : "deactivated");
    return `${log.actorName} updated team member ${email ?? shortId(log.targetId)}${bits.length ? ` (${bits.join(", ")})` : ""}.`;
  },
  TEAM_PERMISSIONS_UPDATED: (log) => `${log.actorName} changed permissions for ${d(log.details).email ?? "a team member"}.`,
  TEAM_KEY_REVOKED: (log) => `${log.actorName} revoked a team member's access key.`,
  ADMIN_AUTH_SUCCESS: (log) => `${log.actorName} signed in to the Team Portal.`,
  ENGINE_CONFIG_UPDATE: (log) => `${log.actorName} updated a platform engine configuration setting.`,
  SYSTEM_CONFIG_UPDATED: (log) => `${log.actorName} updated a system configuration value${d(log.details).key ? ` ("${d(log.details).key}")` : ""}.`,
  SYSTEM_CONFIG_CREATED: (log) => `${log.actorName} created a system configuration value${d(log.details).key ? ` ("${d(log.details).key}")` : ""}.`,
  SYSTEM_HEALTH_RECALCULATE: (log) => `${log.actorName} manually recalculated system health metrics.`,
  RECONCILIATION_VIEW: (log) => `${log.actorName} viewed the financial reconciliation report.`,
  LEDGER_SCAN: (log) => `${log.actorName} ran a ledger integrity scan.`,
  LEDGER_VALIDATE_USER: (log) => `${log.actorName} validated a user's points ledger.`,
  LEDGER_RECONCILE: (log) => `${log.actorName} reconciled the points ledger.`,
  LEDGER_EXPORTED: (log) => `${log.actorName} exported the ledger.`,
  GUILD_DIRECTORY_EXPORTED: (log) => `${log.actorName} exported the guild directory.`,
  GUILD_STRIKE_HISTORY_EXPORTED: (log) => `${log.actorName} exported guild strike history.`,
  GUILD_STATUS_CHANGED: (log) => {
    const { oldStatus, newStatus } = d(log.details);
    return `${log.actorName} changed a guild's status from "${oldStatus ?? "?"}" to "${newStatus ?? "?"}".`;
  },
  GUILD_STRIKE_ADDED: (log) => `${log.actorName} added a strike to a guild${d(log.details).reason ? ` — ${d(log.details).reason}` : ""}.`,
  GUILD_STRIKES_CLEARED: (log) => `${log.actorName} cleared all strikes for a guild.`,
  GUILD_CHAT_MESSAGE_DELETED: (log) => `${log.actorName} deleted a message from a guild chat.`,
  GUILD_CREATION_REQUEST_APPROVED: (log) => `${log.actorName} approved a guild creation request${d(log.details).guildName ? ` for "${d(log.details).guildName}"` : ""}.`,
  GUILD_CREATION_REQUEST_REJECTED: (log) => `${log.actorName} rejected a guild creation request${d(log.details).reason ? ` — ${d(log.details).reason}` : ""}.`,
  ADMIN_GUILD_BULK_STATUS_SET: (log) => `${log.actorName} bulk-updated status for ${d(log.details).count ?? "multiple"} guilds.`,
  ADMIN_GUILD_BULK_MESSAGE_SENT: (log) => `${log.actorName} sent a bulk announcement to ${d(log.details).count ?? "multiple"} guilds.`,
  ADMIN_GUILD_APPLICATION_ACCEPTED: (log) => `${log.actorName} accepted a guild join application.`,
  ADMIN_GUILD_APPLICATION_REJECTED: (log) => `${log.actorName} rejected a guild join application.`,
  ADMIN_PS_ADJUSTMENT: (log) => `${log.actorName} manually adjusted a user's Performance Score${d(log.details).delta !== undefined ? ` by ${d(log.details).delta}` : ""}.`,
  ADMIN_GPS_ADJUSTMENT: (log) => `${log.actorName} manually adjusted a guild's Guild Performance Score${d(log.details).delta !== undefined ? ` by ${d(log.details).delta}` : ""}.`,
  ADMIN_CAPTAIN_REASSIGNED: (log) => `${log.actorName} reassigned a guild's captain.`,
  ADMIN_WEEKLY_TARGET_SET: (log) => `${log.actorName} set a guild's weekly points target${d(log.details).target !== undefined ? ` to ${d(log.details).target}` : ""}.`,
  ADMIN_BULK_WEEKLY_TARGET_BY_RANK_SET: (log) => `${log.actorName} bulk-set weekly targets by rank for ${d(log.details).count ?? "multiple"} guilds.`,
  ADMIN_TARGET_DIFFICULTY_SET: (log) => `${log.actorName} changed a guild's target difficulty${d(log.details).difficulty ? ` to "${d(log.details).difficulty}"` : ""}.`,
  ADMIN_GUILD_MEMBER_KICKED: (log) => `${log.actorName} removed a member from a guild.`,
  RECLASSIFY_EARNING: (log) => `${log.actorName} reclassified an earning record${d(log.details).newType ? ` as "${d(log.details).newType}"` : ""}.`,

  // Guild self-service actions (Guilds Logs tab).
  GUILD_CREATED: (log) => `${log.actorName} created a new guild${d(log.details).name ? ` "${d(log.details).name}"` : ""}.`,
  GUILD_JOIN_REQUESTED: (log) => `${log.actorName} requested to join a guild.`,
  GUILD_JOINED: (log) => `${log.actorName} joined a guild.`,
  GUILD_LEFT: (log) => `${log.actorName} left a guild.`,
  GUILD_MEMBER_KICKED: (log) => `${log.actorName} removed a member from their guild.`,
  GUILD_SETTINGS_UPDATED: (log) => {
    const { diff, updatedFields } = d(log.details);
    if (diff && Object.keys(diff).length) {
      const parts = Object.entries(diff).map(([k, v]: [string, any]) => `${titleCase(k)} → ${v?.after ?? "?"}`);
      return `${log.actorName} updated guild settings (${parts.join(", ")}).`;
    }
    const fields = Array.isArray(updatedFields) && updatedFields.length ? updatedFields.map(titleCase).join(", ") : "settings";
    return `${log.actorName} updated guild ${fields}.`;
  },
  GUILD_ANNOUNCEMENT_POSTED: (log) => `${log.actorName} posted a guild announcement${d(log.details).preview ? `: "${d(log.details).preview}"` : ""}.`,
  GUILD_ANNOUNCEMENT_DELETED: (log) => `${log.actorName} deleted the guild announcement.`,
  GUILD_APPLICATION_SUBMITTED: (log) => `${log.actorName} applied to join a guild.`,
  GUILD_APPLICATION_DECIDED: (log) => {
    const decision = d(log.details).decision;
    const verb = decision === "approved" || decision === true ? "approved" : decision === "rejected" || decision === false ? "rejected" : "decided on";
    return `${log.actorName} ${verb} a guild join application.`;
  },
  GUILD_MVP_ASSIGNED: (log) => `${log.actorName} named a guild member MVP.`,
  GUILD_CREATION_REQUESTED: (log) => `${log.actorName} requested to create a new guild${d(log.details).name ? ` called "${d(log.details).name}"` : ""}.`,
  GUILD_WAR_CHALLENGED: (log) => `${log.actorName} challenged another guild to a war.`,
  GUILD_WAR_CANCELLED: (log) => `${log.actorName} cancelled a guild war.`,
  GUILD_ASSISTANT_CAPTAIN_ASSIGNED: (log) => `${log.actorName} assigned a member as assistant captain.`,
  GUILD_ASSISTANT_CAPTAIN_REMOVED: (log) => `${log.actorName} removed a member's assistant captain role.`,
  GUILD_ASSISTANT_CAPTAIN_PERMISSIONS_UPDATED: (log) => `${log.actorName} updated an assistant captain's permissions.`,
  GUILD_PROFILE_UPDATED: (log) => {
    const updatedFields = d(log.details).updatedFields;
    const fields = Array.isArray(updatedFields) && updatedFields.length ? updatedFields.map(titleCase).join(", ") : "profile";
    return `${log.actorName} updated their guild's ${fields}.`;
  },

  // User self-service financial action (Users Logs tab).
  WITHDRAWAL_REQUESTED: (log) => {
    const { amount, source } = d(log.details);
    return `${log.actorName} requested a withdrawal${amount !== undefined ? ` of ${pkr(amount)}` : ""}${source === "referral" ? " from referral earnings" : ""}.`;
  },

  // Team communication / notification actions.
  GLOBAL_NOTIFICATION_SENT: (log) => `${log.actorName} broadcast a notification to all users${d(log.details).title ? `: "${d(log.details).title}"` : ""}.`,
  USER_NOTIFICATION_SENT: (log) => `${log.actorName} sent a notification to a user${d(log.details).title ? `: "${d(log.details).title}"` : ""}.`,
  ADMIN_EMAIL_SENT: (log) => `${log.actorName} sent an email${d(log.details).subject ? `: "${d(log.details).subject}"` : ""}${d(log.details).to ? ` to ${d(log.details).to}` : ""}.`,
  TEAM_ROLE_UPDATED: (log) => {
    const { oldRole, newRole } = d(log.details);
    return `${log.actorName} changed a team member's role${oldRole && newRole ? ` from "${oldRole}" to "${newRole}"` : ""}.`;
  },
};

// Prefix-based templates for dynamically-suffixed action codes
// (e.g. `WITHDRAWAL_${status.toUpperCase()}`).
const PREFIX_FORMATTERS: Array<{ prefix: string; format: (suffix: string, log: AuditLogForDescription) => string }> = [
  {
    prefix: "BULK_WITHDRAWAL_",
    format: (suffix, log) => `${log.actorName} bulk-marked withdrawals as "${suffix.toLowerCase()}".`,
  },
  {
    prefix: "WITHDRAWAL_",
    format: (suffix, log) => {
      const { amount, beneficiary, transactionId, rejectionReason } = d(log.details);
      const who = beneficiary ? `for user ${shortId(beneficiary)}` : "";
      const amt = amount !== undefined ? pkr(amount) : "";
      const extra = suffix === "REJECTED" && rejectionReason ? ` — ${rejectionReason}` : (transactionId ? ` (txn ${transactionId})` : "");
      return `${log.actorName} marked a withdrawal ${who} ${amt ? `of ${amt} ` : ""}as "${suffix.toLowerCase()}"${extra}.`.replace(/\s+/g, " ").trim();
    },
  },
  {
    prefix: "BALANCE_ADJUST_",
    format: (suffix, log) => {
      const { previous_balance, new_balance, variance, reason } = d(log.details);
      const verb = suffix === "ADD" ? "credited" : "debited";
      return `${log.actorName} ${verb} a user's balance (${pkr(previous_balance)} → ${pkr(new_balance)}${variance ? `, ${variance}` : ""})${reason ? ` — ${reason}` : ""}.`;
    },
  },
];

/** Generic, always-safe fallback for actions with no specific template. */
function genericFallback(log: AuditLogForDescription): string {
  const readableAction = humanizeAction(log.action).toLowerCase();
  const readableTarget = titleCase(log.targetType).toLowerCase();
  return `${log.actorName} performed "${readableAction}" on ${readableTarget} ${shortId(log.targetId)}.`;
}

export function describeAuditLog(log: AuditLogForDescription): string {
  try {
    const exact = FORMATTERS[log.action];
    if (exact) return exact(log);

    for (const { prefix, format } of PREFIX_FORMATTERS) {
      if (log.action.startsWith(prefix)) {
        return format(log.action.slice(prefix.length), log);
      }
    }

    return genericFallback(log);
  } catch {
    // A template threw on an unexpected details shape — never break the page.
    return genericFallback(log);
  }
}
