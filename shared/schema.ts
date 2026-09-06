import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, boolean, index, jsonb, unique, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Legacy registrations table removed — these stubs are kept only for backward-compatible interface compliance.
// TODO: Remove once IStorage.createRegistration and getRegistrationByEmail stubs are deleted.
export const insertRegistrationSchema = z.object({
  phone: z.string(),
  email: z.string().email(),
});
export type InsertRegistration = z.infer<typeof insertRegistrationSchema>;
export type Registration = {
  id: string;
  phone: string;
  email: string;
  referralCode: string;
};

// Main users table with full authentication and profile data
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  identity: text("identity").notNull().unique(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: varchar("referred_by"),
  role: text("role").default("user"),
  totalEarnings: decimal("total_earnings", { precision: 10, scale: 2 }).default("0.00"),
  availableBalance: decimal("available_balance", { precision: 10, scale: 2 }).default("0.00"),
  pendingBalance: decimal("pending_balance", { precision: 10, scale: 2 }).default("0.00"),
  totalWithdrawn: decimal("total_withdrawn", { precision: 10, scale: 2 }).default("0.00"),
  isActive: boolean("is_active").default(true),
  isVerified: boolean("is_verified").default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpiresAt: timestamp("verification_token_expires_at"),
  loginStreak: integer("login_streak").default(0),
  lastLoginDate: timestamp("last_login_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  avatar: text("avatar").default("default"),
  // Trust Status: admin-assigned account trust classification, surfaced on the Leaderboard.
  // "Special" | "Trusted" | "Normal" | "Dangerous" — null means undeclared (shown as N/A).
  trustStatus: text("trust_status"),
  trustReason: text("trust_reason"),
  profilePicture: text("profile_picture"),
  permissions: jsonb("permissions").default('[]'),
  emailVerifiedAt: timestamp("email_verified_at"),
  // ── Guild System fields (Engine C) ──────────────────────────────────────
  // personalRank is the individual Guild-context tier, E (lowest) → S (highest).
  personalRank: text("personal_rank").default("E"),
  // Cumulative score driving personalRank progression; distinct from guild.guildScore.
  guildContributionScore: integer("guild_contribution_score").default(0),
  // Cumulative "TX-Points" ever earned (display/illusion counter, monotonically
  // increasing — never decremented by withdrawals, which spend availableBalance).
  txPointsBalance: integer("tx_points_balance").default(0),
  // ─── Security: TOTP two-factor auth ───────────────────────────────────────
  // Secrets are AES-256-GCM encrypted at rest (server/utils/credential-crypto).
  // totp_pending_secret holds an unconfirmed setup attempt; only after the user
  // verifies one live code does it promote to totp_secret + totp_enabled.
  totpSecret: text("totp_secret"),
  totpPendingSecret: text("totp_pending_secret"),
  totpEnabled: boolean("totp_enabled").default(false),
  // ── THORX v3: Performance Score (PS) rank system ────────────────────────
  // Sole input to checkAndUpdateRankTier(); totalEarnings does NOT affect rank.
  performanceScore: integer("performance_score").notNull().default(0),
  userRankTier: text("user_rank_tier").notNull().default("E-Rank"),
  // Valid: 'E-Rank' | 'D-Rank' | 'C-Rank' | 'B-Rank' | 'A-Rank' | 'S-Rank'
  // rankLocked=true freezes ALL automatic rank changes (ps-engine
  // checkAndUpdateRankTier bails early), so an admin-set rank survives the
  // user's next earn event. The DB column was originally added ad-hoc by
  // scripts/migrate-v3.ts while this definition was never updated — schema
  // drift that made the lock dead code (the column was never SELECTed, so
  // ps-engine's guard always saw undefined and manual ranks were silently
  // reverted on the next earn).
  rankLocked: boolean("rank_locked").notNull().default(false),
  // ── THORX v3: Guild membership (replaces implicit lookup via guild_members) ─
  guildRole: text("guild_role").notNull().default("simple"), // simple | member | captain
  guildId: varchar("guild_id").references((): any => guilds.id, { onDelete: "set null" }),
  // ── THORX v3: Activity tracking (inactivity penalty cron) ───────────────
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  streakDays: integer("streak_days").notNull().default(0),
  lastStreakDate: date("last_streak_date"), // PKT calendar date
  inactivityPenaltyAt: timestamp("inactivity_penalty_at"),
  // ── THORX v3: Referral cash wallet — separate from txPointsBalance ──────
  balanceCashPkr: decimal("balance_cash_pkr", { precision: 10, scale: 2 }).notNull().default("0.00"),
  // ── Beta trust infra: honesty-rules acknowledgment (anti-fraud Layer 1) ──
  // Set when the user accepts the survey-honesty / one-account / no-VPN rules
  // screen after registration. Null = not yet acknowledged → portal shows the
  // mandatory modal before any earning section is reachable.
  rulesAcknowledgedAt: timestamp("rules_acknowledged_at"),
}, (table) => [
  index("users_email_idx").on(table.email),
  index("users_referral_code_idx").on(table.referralCode),
  index("users_role_idx").on(table.role),
  index("users_is_active_idx").on(table.isActive),
  index("users_guild_id_idx").on(table.guildId),
  index("users_user_rank_tier_idx").on(table.userRankTier),
  // Leaderboard sort columns — missing indexes flagged by 2026-07-15 perf audit
  index("users_performance_score_idx").on(table.performanceScore),
  index("users_personal_rank_idx").on(table.personalRank),
  index("users_total_earnings_idx").on(table.totalEarnings),
  // Audit finding 2-D: referral commission lookups and inactivity scans filter
  // by referred_by on every run — missing index caused full users table scan.
  index("users_referred_by_idx").on(table.referredBy),
  // P-04/4.5: Composite index for leaderboard queries (isActive + role + performanceScore)
  index("users_active_role_score_idx").on(table.isActive, table.role, table.performanceScore),
  // Financial integrity constraints
  sql`CONSTRAINT check_positive_earnings CHECK (total_earnings >= 0)`,
  sql`CONSTRAINT check_positive_balance CHECK (available_balance >= 0)`,
  sql`CONSTRAINT check_positive_pending CHECK (pending_balance >= 0)`,
  // Prevent self-referral
  sql`CONSTRAINT check_no_self_referral CHECK (id != referred_by)`,
  sql`CONSTRAINT check_positive_balance_cash_pkr CHECK (balance_cash_pkr >= 0)`,
]);

// Team invitations table for secure onboarding
export const teamInvitations = pgTable("team_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  role: text("role").notNull().default("team"),
  permissions: jsonb("permissions").notNull().default('[]'),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("invitations_email_idx").on(table.email),
  index("invitations_token_idx").on(table.token),
  index("invitations_expires_at_idx").on(table.expiresAt),
]);

export const insertTeamInvitationSchema = createInsertSchema(teamInvitations);
export type TeamInvitation = typeof teamInvitations.$inferSelect;

// Device fingerprints table for multi-account abuse prevention
export const deviceFingerprints = pgTable("device_fingerprints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fingerprintHash: text("fingerprint_hash").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
}, (table) => [
  index("idx_device_fp_hash").on(table.fingerprintHash),
  index("idx_device_fp_user").on(table.userId),
  unique("uq_device_fp_user_hash").on(table.userId, table.fingerprintHash),
]);

export const insertDeviceFingerprintSchema = createInsertSchema(deviceFingerprints).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});
export type InsertDeviceFingerprint = z.infer<typeof insertDeviceFingerprintSchema>;
export type DeviceFingerprint = typeof deviceFingerprints.$inferSelect;
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;

// Global system configuration table
export const systemConfig = pgTable("system_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemConfigSchema = createInsertSchema(systemConfig);
export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;

// Earnings transactions table
export const earnings = pgTable("earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Finding 2-Q: financial audit records must survive user deletion (soft-delete pattern).
  // onDelete: "restrict" prevents accidental cascade wipe of earnings history.
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  type: text("type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  status: text("status").default("completed"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("earnings_user_id_idx").on(table.userId),
  index("earnings_type_idx").on(table.type),
  index("earnings_status_idx").on(table.status),
  index("earnings_created_at_idx").on(table.createdAt),
  // Audit finding 2-F: leaderboard analytics filter by userId + type together —
  // composite index replaces two separate single-column scans.
  index("earnings_user_id_type_idx").on(table.userId, table.type),
  index("earnings_user_id_created_at_idx").on(table.userId, table.createdAt),
]);

// Leaderboard cache for high-performance enterprise analytics
export const leaderboardCache = pgTable("leaderboard_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  globalRank: integer("global_rank").notNull(),
  performanceScore: decimal("performance_score", { precision: 10, scale: 2 }).notNull(),
  earningsScore: decimal("earnings_score", { precision: 10, scale: 2 }).notNull(),
  teamScore: decimal("team_score", { precision: 10, scale: 2 }).notNull(),
  activeScore: decimal("active_score", { precision: 10, scale: 2 }).notNull(),
  healthScore: decimal("health_score", { precision: 10, scale: 2 }).notNull(),
  level1Count: integer("level1_count").default(0),
  level2Count: integer("level2_count").default(0),
  userRankTier: varchar("user_rank_tier").default("E-Rank"),
  guildRole: varchar("guild_role").default("simple"),
  recordedAt: timestamp("recorded_at").defaultNow(),
}, (table) => [
  index("leaderboard_rank_idx").on(table.globalRank),
  index("leaderboard_user_id_idx").on(table.userId),
  index("leaderboard_recorded_at_idx").on(table.recordedAt),
  index("leaderboard_score_desc_idx").on(table.performanceScore), // H-10: ordered score reads
]);

// advertisements table removed — was never written to (orphaned).
// Ad management uses systemConfig AD_NETWORKS key instead.

// Ad views tracking table
export const adViews = pgTable("ad_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  adId: varchar("ad_id"), // Nullable; advertisements table removed
  adType: text("ad_type").notNull(),
  adNetwork: text("ad_network").default("internal"),
  duration: integer("duration"),
  completed: boolean("completed").default(false),
  earnedAmount: decimal("earned_amount", { precision: 10, scale: 2 }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ad_views_user_id_idx").on(table.userId),
  index("ad_views_ad_id_idx").on(table.adId),
  index("ad_views_completed_idx").on(table.completed),
  index("ad_views_network_idx").on(table.adNetwork),
  index("ad_views_created_at_idx").on(table.createdAt),
]);

// Referrals tracking table
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Finding 2-Q: referral linkage is financial — must survive user soft-delete.
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  referredId: varchar("referred_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").default("active"),
  tier: integer("tier").default(1),
  totalEarned: decimal("total_earned", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("referrals_referrer_id_idx").on(table.referrerId),
  index("referrals_referred_id_idx").on(table.referredId),
  index("referrals_status_idx").on(table.status),
  // Composite index for commission lookups that filter by referrer + status
  index("referrals_referrer_status_idx").on(table.referrerId, table.status),
]);



// MANUAL INDEX (re-apply after fresh imports):
// CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_one_pending_per_user ON withdrawals(user_id) WHERE status = 'pending';

// Withdrawals/Payouts table
export const withdrawals = pgTable("withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Finding 2-Q: withdrawal records are financial audit trail — must survive user soft-delete.
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  accountDetails: jsonb("account_details").notNull().default(sql`'{}'::jsonb`),
  status: text("status").default("pending"),
  transactionId: text("transaction_id"),
  processedAt: timestamp("processed_at"),
  rejectionReason: text("rejection_reason"),
  fee: decimal("fee", { precision: 10, scale: 2 }).default("0.00"),
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(),
  // Referral commission split tracking (Phase 18 — populated on withdrawal approval)
  thorxFeeShare: decimal("thorx_fee_share", { precision: 10, scale: 2 }).default("0.00"),
  referralCommissionPaid: decimal("referral_commission_paid", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("withdrawals_user_id_idx").on(table.userId),
  index("withdrawals_status_idx").on(table.status),
  index("withdrawals_method_idx").on(table.method),
  index("withdrawals_created_at_idx").on(table.createdAt),
  // Audit finding 2-E: "pending withdrawal?" FOR UPDATE check intersects userId
  // + status — composite index collapses two scans into one, shortening lock hold time.
  index("withdrawals_user_id_status_idx").on(table.userId, table.status),
  // Minimum withdrawal amount (e.g., 100 PKR minimum)
  sql`CONSTRAINT check_min_withdrawal CHECK (CAST(amount AS DECIMAL) >= 100)`,
  sql`CONSTRAINT check_positive_amount CHECK (CAST(amount AS DECIMAL) > 0)`,
]);




// Team emails for inbox functionality
export const teamEmails = pgTable("team_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").references(() => users.id, { onDelete: "set null" }),
  toEmail: text("to_email").notNull(),
  fromEmail: text("from_email").notNull(),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  status: text("status").default("sent"),
  type: text("type").default("outbound"),
  attachments: jsonb("attachments").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("team_emails_from_user_id_idx").on(table.fromUserId),
  index("team_emails_to_email_idx").on(table.toEmail),
  index("team_emails_type_idx").on(table.type),
  index("team_emails_created_at_idx").on(table.createdAt),
]);

// Team keys for managing team member access
export const teamKeys = pgTable("team_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyName: text("key_name").notNull(),
  accessLevel: text("access_level").default("member"),
  permissions: text("permissions").array(),
  isActive: boolean("is_active").default(true),
  lastUsed: timestamp("last_used"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // One team key per user — enforced at the DB level so concurrent
  // "add member" requests can't create duplicate keys for the same user.
  unique("team_keys_user_id_unique").on(table.userId),
  index("team_keys_access_level_idx").on(table.accessLevel),
  index("team_keys_is_active_idx").on(table.isActive),
]);

// User credentials storage for team data management
export const userCredentials = pgTable("user_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  username: text("username"),
  email: text("email"),
  encryptedPassword: text("encrypted_password"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("user_credentials_user_id_idx").on(table.userId),
  index("user_credentials_platform_idx").on(table.platform),
  index("user_credentials_email_idx").on(table.email),
]);

// ── Engine B — CPA Tasks (replaces daily_tasks for CPA offers) ────────────────
// Independent table so Engine B can evolve separately from legacy daily tasks.
export const engineBTasks = pgTable("engine_b_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("cpa_offer"), // 'cpa_offer'
  actionUrl: text("action_url"),
  secretCode: text("secret_code"),
  instructions: text("instructions"),
  targetRank: text("target_rank").default("C-Rank"), // minimum rank tier — Engine B requires C-Rank+
  difficulty: text("difficulty").default("Easy"),    // 'Easy' | 'Medium' | 'Hard' | 'Elite'
  isActive: boolean("is_active").default(true),
  grossPkrPerCompletion: decimal("gross_pkr_per_completion", { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("engine_b_tasks_is_active_idx").on(table.isActive),
  index("engine_b_tasks_target_rank_idx").on(table.targetRank),
  index("engine_b_tasks_difficulty_idx").on(table.difficulty),
]);
export type EngineBTask = typeof engineBTasks.$inferSelect;
export type InsertEngineBTask = typeof engineBTasks.$inferInsert;
export const insertEngineBTaskSchema = createInsertSchema(engineBTasks).omit({ id: true, createdAt: true, updatedAt: true });

// Completion records for Engine B tasks — one row per user-task pair
export const engineBRecords = pgTable("engine_b_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  taskId: varchar("task_id").notNull().references(() => engineBTasks.id, { onDelete: "cascade" }),
  status: text("status").default("pending"), // 'pending' | 'completed'
  clickedAt: timestamp("clicked_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("engine_b_records_user_id_idx").on(table.userId),
  index("engine_b_records_task_id_idx").on(table.taskId),
  unique("engine_b_records_unique_user_task").on(table.userId, table.taskId),
  index("engine_b_records_user_status_idx").on(table.userId, table.status),
]);
export type EngineBRecord = typeof engineBRecords.$inferSelect;
export type InsertEngineBRecord = typeof engineBRecords.$inferInsert;

// ── Engine B: Survey network completion records (CPX Research / BitLabs) ─────
// One row per user survey interaction with an external survey network.
// Credit path: network S2S callback → verify signature → guarded status flip
// (started→completed inside the advisory-locked transaction) → recordEarnEvent
// (Engine_B). The partial unique index uniq_survey_network_tx (migration 0011)
// makes a per-network transaction id impossible to credit twice even under a
// concurrent retry storm from the vendor's callback system.
export const surveyRecords = pgTable("survey_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  networkId: text("network_id").notNull(),   // 'cpx-research' | 'bitlabs' — see SURVEY_NETWORKS_JSON
  transactionId: text("transaction_id"),     // vendor TX id — dedup key per network (null while started)
  status: text("status").notNull().default("started"), // 'started' | 'completed'
  rewardUsd: decimal("reward_usd", { precision: 10, scale: 4 }), // publisher payout reported by the network
  grossPkr: decimal("gross_pkr", { precision: 10, scale: 4 }),   // PKR credited as the earn-event gross
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("survey_records_user_idx").on(table.userId),
  index("survey_records_user_created_idx").on(table.userId, table.createdAt),
]);
export type SurveyRecord = typeof surveyRecords.$inferSelect;
export type InsertSurveyRecord = typeof surveyRecords.$inferInsert;

export type LeaderboardCache = typeof leaderboardCache.$inferSelect;
export type InsertLeaderboardCache = typeof leaderboardCache.$inferInsert;

// Chat messages for support chatbot
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  sender: text("sender").notNull(),
  language: text("language").default("en"),
  intent: text("intent"),
  sentiment: text("sentiment"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("chat_messages_user_id_idx").on(table.userId),
  index("chat_messages_sender_idx").on(table.sender),
  index("chat_messages_created_at_idx").on(table.createdAt),
]);

// HilltopAds configuration table
export const hilltopAdsConfig = pgTable("hilltop_ads_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKey: text("api_key").notNull(),
  publisherId: text("publisher_id"),
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// HilltopAds zones table
export const hilltopAdsZones = pgTable("hilltop_ads_zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: text("zone_id").notNull().unique(),
  siteName: text("site_name").notNull(),
  zoneName: text("zone_name").notNull(),
  adFormat: text("ad_format").notNull(),
  status: text("status").default("active"),
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  totalImpressions: integer("total_impressions").default(0),
  totalClicks: integer("total_clicks").default(0),
  totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("hilltop_ads_zones_zone_id_idx").on(table.zoneId),
  index("hilltop_ads_zones_status_idx").on(table.status),
  index("hilltop_ads_zones_ad_format_idx").on(table.adFormat),
]);

// Deep activity ledger — despite the historical name/column ("admin_id"), this
// table records EVERY tracked action platform-wide: team/admin actions, guild
// activity, and regular users' own self-service changes. `adminId` is really
// "actorId" (the id of whoever performed the action, of any role) — kept as-is
// to avoid an invasive rename across ~60 existing call sites; `category` is the
// field that actually buckets a row for the Team/Guild/User Logs views below.
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  action: text("action").notNull(), // e.g., "APPROVE_WITHDRAWAL", "UPDATE_USER_BALANCE", "BAN_USER"
  targetType: text("target_type").notNull(), // e.g., "withdrawal", "user", "ad"
  targetId: varchar("target_id").notNull(),
  details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  ipAddress: text("ip_address"),
  // Revamp (2026-07-30): deep tracking fields for the Team Portal Audit Logs page.
  category: text("category").notNull().default("team"), // "team" | "guild" | "user"
  actorRole: text("actor_role"), // role snapshot at write time: "founder" | "admin" | "team" | "user"
  userAgent: text("user_agent"),
  deviceType: text("device_type"), // "desktop" | "mobile" | "tablet" | "unknown"
  browser: text("browser"),
  os: text("os"),
  country: text("country"),
  city: text("city"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("audit_logs_admin_id_idx").on(table.adminId),
  index("audit_logs_action_idx").on(table.action),
  index("audit_logs_target_type_idx").on(table.targetType),
  index("audit_logs_target_id_idx").on(table.targetId),
  index("audit_logs_created_at_idx").on(table.createdAt),
  // 2.2 — Composite for admin user-audit view: filters on target + time range
  index("audit_logs_target_user_created_idx").on(table.targetId, table.createdAt),
  index("audit_logs_category_created_idx").on(table.category, table.createdAt),
]);

// Internal notes for team collaboration
export const internalNotes = pgTable("internal_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  targetType: text("target_type").notNull(), // "user", "withdrawal"
  targetId: varchar("target_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("internal_notes_admin_id_idx").on(table.adminId),
  index("internal_notes_target_type_idx").on(table.targetType),
  index("internal_notes_target_id_idx").on(table.targetId),
  index("internal_notes_created_at_idx").on(table.createdAt),
]);

// HilltopAds statistics table
export const hilltopAdsStats = pgTable("hilltop_ads_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: varchar("zone_id").references(() => hilltopAdsZones.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  cpm: decimal("cpm", { precision: 10, scale: 4 }).default("0.0000"),
  revenue: decimal("revenue", { precision: 10, scale: 4 }).default("0.0000"),
  ctr: decimal("ctr", { precision: 5, scale: 2 }).default("0.00"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("hilltop_ads_stats_zone_id_idx").on(table.zoneId),
  index("hilltop_ads_stats_date_idx").on(table.date),
]);

// Commission Logs table for Multi-Level Referral System
export const commissionLogs = pgTable("commission_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Finding 2-Q: commission logs are financial audit trail — must survive user soft-delete.
  beneficiaryId: varchar("beneficiary_id").notNull().references(() => users.id, { onDelete: "restrict" }), // User receiving the commission
  sourceUserId: varchar("source_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), // User who requested payout
  triggerWithdrawalId: varchar("trigger_withdrawal_id").references(() => withdrawals.id, { onDelete: "set null" }), // Link to the payout request
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  rate: decimal("rate", { precision: 5, scale: 4 }).notNull(), // 0.1500 or 0.0750
  level: integer("level").notNull(), // 1 or 2
  status: text("status").default("pending"), // pending, paid, voided
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("commission_logs_beneficiary_idx").on(table.beneficiaryId),
  index("commission_logs_source_user_idx").on(table.sourceUserId),
  index("commission_logs_withdrawal_idx").on(table.triggerWithdrawalId),
  index("commission_logs_status_idx").on(table.status),
]);

// Rank Logs table for User Ranking System
export const rankLogs = pgTable("rank_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  oldRank: text("old_rank").notNull(),
  newRank: text("new_rank").notNull(),
  triggerSource: text("trigger_source").notNull(), // e.g., 'earning_update', 'payout', 'admin'
  createdAt: timestamp("created_at").defaultNow(),
  // ── THORX v3: also used to log guild (GPS) rank changes ─────────────────
  targetType: text("target_type").notNull().default("user"), // 'user' | 'guild'
  guildId: varchar("guild_id_ref"),
}, (table) => [
  index("rank_logs_user_idx").on(table.userId),
  index("rank_logs_target_type_idx").on(table.targetType),
]);

// Notifications table for system and administrative alerts
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").default("info"), // "financial", "system", "earning", "payout"
  adminName: text("admin_name"),
  adminRole: text("admin_role"),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  adjustmentType: text("adjustment_type"), // "credit" or "debit"
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_type_idx").on(table.type),
  index("notifications_created_at_idx").on(table.createdAt),
  index("notifications_user_id_is_read_idx").on(table.userId, table.isRead),
]);

// Risk cases — persistent case management for flagged accounts
export const riskCases = pgTable("risk_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  riskScore: decimal("risk_score", { precision: 5, scale: 2 }).notNull().default("0"),
  severity: text("severity").notNull().default("Low"), // Low | Medium | High | Critical
  status: text("status").notNull().default("Open"),    // Open | Investigating | Cleared | Actioned
  signals: jsonb("signals").notNull().default(sql`'[]'::jsonb`), // [{name, score, detail}]
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  notesBy: varchar("notes_by").references(() => users.id, { onDelete: "set null" }),
  notesUpdatedAt: timestamp("notes_updated_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("risk_cases_user_id_idx").on(table.userId),
  index("risk_cases_severity_idx").on(table.severity),
  index("risk_cases_status_idx").on(table.status),
  index("risk_cases_created_at_idx").on(table.createdAt),
  // 2.2 — Composite for risk watchlist: filters on user + status together
  index("risk_cases_user_id_status_idx").on(table.userId, table.status),
  sql`CONSTRAINT risk_cases_user_id_unique UNIQUE (user_id)`,
]);

export type RiskCase = typeof riskCases.$inferSelect;
export type InsertRiskCase = typeof riskCases.$inferInsert;

// Score history — snapshot on each leaderboard recompute for trend detection
export const scoreHistory = pgTable("score_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  performanceScore: decimal("performance_score", { precision: 10, scale: 2 }).notNull(),
  riskScore: decimal("risk_score", { precision: 5, scale: 2 }).notNull().default("0"),
  earningsScore: decimal("earnings_score", { precision: 10, scale: 2 }).notNull(),
  teamScore: decimal("team_score", { precision: 10, scale: 2 }).notNull(),
  activeScore: decimal("active_score", { precision: 10, scale: 2 }).notNull(),
  healthScore: decimal("health_score", { precision: 10, scale: 2 }).notNull(),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
  // ── THORX v3 ──────────────────────────────────────────────────────────────
  userRankTier: text("user_rank_tier"),
  guildRole: text("guild_role"),
  streakDays: integer("streak_days"),
}, (table) => [
  index("score_history_user_id_idx").on(table.userId),
  index("score_history_snapshot_at_idx").on(table.snapshotAt),
  // 2.2 — Composite for time-series lookups in leaderboard and PS engine
  index("score_history_user_recorded_idx").on(table.userId, table.snapshotAt),
]);

export type ScoreHistory = typeof scoreHistory.$inferSelect;
export type InsertScoreHistory = typeof scoreHistory.$inferInsert;

// Define relations
export const usersRelations = relations(users, ({ many, one }) => ({
  earnings: many(earnings),
  adViews: many(adViews),
  referralsMade: many(referrals, { relationName: "referrer" }),
  referralsReceived: many(referrals, { relationName: "referred" }),
  withdrawals: many(withdrawals),
  teamEmailsSent: many(teamEmails),
  teamKeys: many(teamKeys),
  userCredentials: many(userCredentials),
  chatMessages: many(chatMessages),
  deviceFingerprints: many(deviceFingerprints),
  referrer: one(users, {
    fields: [users.referredBy],
    references: [users.id],
  }),
  commissionsReceived: many(commissionLogs, { relationName: "beneficiary" }),
  commissionsGenerated: many(commissionLogs, { relationName: "sourceUser" }),
}));

export const deviceFingerprintsRelations = relations(deviceFingerprints, ({ one }) => ({
  user: one(users, {
    fields: [deviceFingerprints.userId],
    references: [users.id],
  }),
}));

export const earningsRelations = relations(earnings, ({ one }) => ({
  user: one(users, {
    fields: [earnings.userId],
    references: [users.id],
  }),
}));

export const adViewsRelations = relations(adViews, ({ one }) => ({
  user: one(users, {
    fields: [adViews.userId],
    references: [users.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
    relationName: "referrer",
  }),
  referred: one(users, {
    fields: [referrals.referredId],
    references: [users.id],
    relationName: "referred",
  }),
}));



export const withdrawalsRelations = relations(withdrawals, ({ one, many }) => ({
  user: one(users, {
    fields: [withdrawals.userId],
    references: [users.id],
  }),
  commissionLogs: many(commissionLogs),
}));



















export const teamEmailsRelations = relations(teamEmails, ({ one }) => ({
  fromUser: one(users, {
    fields: [teamEmails.fromUserId],
    references: [users.id],
  }),
}));

export const teamKeysRelations = relations(teamKeys, ({ one }) => ({
  user: one(users, {
    fields: [teamKeys.userId],
    references: [users.id],
  }),
}));

export const userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  user: one(users, {
    fields: [userCredentials.userId],
    references: [users.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
}));

export const hilltopAdsZonesRelations = relations(hilltopAdsZones, ({ many }) => ({
  stats: many(hilltopAdsStats),
}));

export const hilltopAdsStatsRelations = relations(hilltopAdsStats, ({ one }) => ({
  zone: one(hilltopAdsZones, {
    fields: [hilltopAdsStats.zoneId],
    references: [hilltopAdsZones.id],
  }),
}));

export const commissionLogsRelations = relations(commissionLogs, ({ one }) => ({
  beneficiary: one(users, {
    fields: [commissionLogs.beneficiaryId],
    references: [users.id],
    relationName: "beneficiary",
  }),
  sourceUser: one(users, {
    fields: [commissionLogs.sourceUserId],
    references: [users.id],
    relationName: "sourceUser",
  }),
  withdrawal: one(withdrawals, {
    fields: [commissionLogs.triggerWithdrawalId],
    references: [withdrawals.id],
  }),
}));
export const rankLogsRelations = relations(rankLogs, ({ one }) => ({
  user: one(users, {
    fields: [rankLogs.userId],
    references: [users.id],
  }),
}));

// Zod schemas for validation


export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  totalEarnings: true,
  availableBalance: true,
  pendingBalance: true,
  totalWithdrawn: true,
  isActive: true,
  isVerified: true,
  verificationToken: true,
  loginStreak: true,
  lastLoginDate: true,
  createdAt: true,
  updatedAt: true,
  personalRank: true,
  guildContributionScore: true,
  txPointsBalance: true,
}).extend({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(10),
  identity: z.string().min(1),
  referralCode: z.string().optional()
});

export const insertEarningSchema = createInsertSchema(earnings).omit({
  id: true,
  createdAt: true,
});



export const insertAdViewSchema = createInsertSchema(adViews).omit({
  id: true,
  createdAt: true,
});

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  totalEarned: true,
  createdAt: true,
});



export const insertWithdrawalSchema = createInsertSchema(withdrawals).omit({
  id: true,
  status: true,
  transactionId: true,
  processedAt: true,
  rejectionReason: true,
  fee: true,
  netAmount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTeamEmailSchema = createInsertSchema(teamEmails).omit({
  id: true,
  createdAt: true,
});

export const insertTeamKeySchema = createInsertSchema(teamKeys).omit({
  id: true,
  lastUsed: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserCredentialSchema = createInsertSchema(userCredentials).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertHilltopAdsConfigSchema = createInsertSchema(hilltopAdsConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHilltopAdsZoneSchema = createInsertSchema(hilltopAdsZones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHilltopAdsStatSchema = createInsertSchema(hilltopAdsStats).omit({
  id: true,
  createdAt: true,
});

// Type exports
// Legacy registration type
// export type InsertRegistration = z.infer<typeof insertRegistrationSchema>;
// export type Registration = typeof registrations.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertEarning = z.infer<typeof insertEarningSchema>;
export type Earning = typeof earnings.$inferSelect;



export type InsertAdView = z.infer<typeof insertAdViewSchema>;
export type AdView = typeof adViews.$inferSelect;

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;



export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type Withdrawal = typeof withdrawals.$inferSelect;



















export type InsertTeamEmail = z.infer<typeof insertTeamEmailSchema>;
export type TeamEmail = typeof teamEmails.$inferSelect;

export type InsertTeamKey = z.infer<typeof insertTeamKeySchema>;
export type TeamKey = typeof teamKeys.$inferSelect;

export type InsertUserCredential = z.infer<typeof insertUserCredentialSchema>;
export type UserCredential = typeof userCredentials.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertHilltopAdsConfig = z.infer<typeof insertHilltopAdsConfigSchema>;
export type HilltopAdsConfig = typeof hilltopAdsConfig.$inferSelect;

export type InsertHilltopAdsZone = z.infer<typeof insertHilltopAdsZoneSchema>;
export type HilltopAdsZone = typeof hilltopAdsZones.$inferSelect;

export type InsertHilltopAdsStat = z.infer<typeof insertHilltopAdsStatSchema>;
export type HilltopAdsStat = typeof hilltopAdsStats.$inferSelect;

export const insertCommissionLogSchema = createInsertSchema(commissionLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCommissionLog = z.infer<typeof insertCommissionLogSchema>;
export type CommissionLog = typeof commissionLogs.$inferSelect;

export const insertRankLogSchema = createInsertSchema(rankLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertRankLog = z.infer<typeof insertRankLogSchema>;
export type RankLog = typeof rankLogs.$inferSelect;

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export const insertInternalNoteSchema = createInsertSchema(internalNotes).omit({
  id: true,
  createdAt: true,
});

export type InsertInternalNote = z.infer<typeof insertInternalNoteSchema>;
export type InternalNote = typeof internalNotes.$inferSelect;

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// insertDailyTaskSchema and insertTaskRecordSchema removed — daily_tasks system retired.

// ── Feature 1: Founder Profit Ledger ──────────────────────────────────────────
// Tracks every time the founder transfers money from the THORX bank account to
// their personal account. Used to compute "Safe to Withdraw = fees collected − already withdrawn".
export const founderWithdrawals = pgTable("founder_withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  withdrawalDate: timestamp("withdrawal_date").notNull(),
  description: text("description"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("founder_withdrawals_created_at_idx").on(table.createdAt),
  index("founder_withdrawals_created_by_idx").on(table.createdBy),
]);

export type FounderWithdrawal = typeof founderWithdrawals.$inferSelect;
export type InsertFounderWithdrawal = typeof founderWithdrawals.$inferInsert;

// ── Feature 2: System Health Engine ───────────────────────────────────────────
// Stores hourly composite health snapshots computed from 5 dimensions.
// Stale if latest snapshot is > 90 minutes old.
export const healthSnapshots = pgTable("health_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  overallScore: decimal("overall_score", { precision: 5, scale: 2 }).notNull(),
  financialScore: decimal("financial_score", { precision: 5, scale: 2 }).notNull(),
  operationalScore: decimal("operational_score", { precision: 5, scale: 2 }).notNull(),
  userHealthScore: decimal("user_health_score", { precision: 5, scale: 2 }).notNull(),
  riskHealthScore: decimal("risk_health_score", { precision: 5, scale: 2 }).notNull(),
  integrityScore: decimal("integrity_score", { precision: 5, scale: 2 }).notNull(),
  signalsJson: jsonb("signals_json").notNull().default(sql`'{}'::jsonb`),
  topReason: text("top_reason").notNull(),
  delta1h: decimal("delta_1h", { precision: 5, scale: 2 }),
  delta24h: decimal("delta_24h", { precision: 5, scale: 2 }),
  recordedAt: timestamp("recorded_at").defaultNow(),
}, (table) => [
  index("health_snapshots_recorded_at_idx").on(table.recordedAt),
]);

export type HealthSnapshot = typeof healthSnapshots.$inferSelect;
export type InsertHealthSnapshot = typeof healthSnapshots.$inferInsert;

// Logs 5xx errors emitted by the API — read by the operational health signal.
export const errorEvents = pgTable("error_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  route: text("route").notNull(),
  status: integer("status").notNull(),
  message: text("message"),
  occurredAt: timestamp("occurred_at").defaultNow(),
}, (table) => [
  index("error_events_occurred_at_idx").on(table.occurredAt),
  index("error_events_status_idx").on(table.status),
]);

export type ErrorEvent = typeof errorEvents.$inferSelect;

// Logs every login attempt (success or failure) for ALL users — separate from
// `auditLogs`, which is scoped to admin/team actions (`adminId` is NOT NULL
// there, so it cannot record anonymous or regular-user login attempts).
// Health Report audit (2026-07-29): the Operational Health "failed auth rate"
// signal previously queried `auditLogs` for actions that were never written
// anywhere in the login route, so it silently always computed 0/0 and scored
// a fake 100 — this table gives it real data to read.
export const authEvents = pgTable("auth_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email"),
  success: boolean("success").notNull(),
  reason: text("reason"), // e.g. "invalid_credentials", "email_not_verified", "suspended"
  ipAddress: text("ip_address"),
  occurredAt: timestamp("occurred_at").defaultNow(),
}, (table) => [
  index("auth_events_occurred_at_idx").on(table.occurredAt),
  index("auth_events_success_idx").on(table.success),
]);

export type AuthEvent = typeof authEvents.$inferSelect;

// ── Feature 3: Guild, Escrow Vault & Points Ledger System ─────────────────────
// Implements thorx_master_plan.md Engine C (Guilds), the 15% Hold & Release
// Escrow Vault, and the bulletproof points-first valuation ledger.
//
// Design notes (read before modifying):
//  - `points_ledger` is an append-only audit trail. A row's `lockedPkrValue`
//    and `conversionRateUsed` must NEVER be mutated after insert — that is the
//    entire point of the "bulletproof" guarantee (admin rate changes must not
//    retroactively alter value already earned). Corrections are new rows.
//  - The legacy 15% guild-vault share of an earn event was recorded on the SAME
//    points_ledger row (via vaultShareLockedPkr + metadata breakdown) rather
//    than a second row, since it was one earn event / one Scratch Card reveal.
//    The v3 rebuild replaced this entire vault mechanism (including the
//    per-guild-per-member-per-week `guild_vault_ledger` table) with the
//    Guild Weekly Bonus Pool system — see server/modules/guild-reset.ts.
//  - Weekly boundaries are fixed UTC weeks: Monday 00:00:00 UTC through
//    Sunday 23:59:59 UTC. This is intentionally not configurable in v1.

// Guilds (Teams) — Engine C
export const guilds = pgTable("guilds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  captainId: varchar("captain_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  guildScore: integer("guild_score").notNull().default(0),
  strikes: integer("strikes").notNull().default(0),
  status: text("status").notNull().default("active"), // active | frozen | disbanded
  isPublic: boolean("is_public").notNull().default(true), // discoverable in guild search
  memberCount: integer("member_count").notNull().default(1), // denormalized, kept in sync in-transaction
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Engine C — Captain controls (Blueprint v2026)
  pinnedMemberId: varchar("pinned_member_id").references(() => users.id, { onDelete: "set null" }),
  minRankRequired: text("min_rank_required").notNull().default("E-Rank"),
  recruitmentOpen: boolean("recruitment_open").notNull().default(true),
  avatarUrl: text("avatar_url"),
  // ── THORX v3: GPS & rank ─────────────────────────────────────────────────
  guildPerformanceScore: integer("guild_performance_score").notNull().default(0),
  memberCapacity: integer("member_capacity").notNull().default(10),
  // ── THORX v3: Weekly mechanics (replaces vault-language columns) ────────
  // Internal name only — user-facing label is "Guild Weekly Bonus Pool"/"Sunday Bonus".
  weeklyBonusPool: decimal("weekly_bonus_pool", { precision: 12, scale: 4 }).notNull().default("0.0000"),
  currentWeeklyPoints: integer("current_weekly_points").notNull().default(0),
  weeklyTarget: integer("weekly_target").notNull().default(50000),
  targetDifficulty: text("target_difficulty").notNull().default("medium"), // low | medium | high
  // ── Announcements ─────────────────────────────────────────────────────────
  latestAnnouncement: text("latest_announcement"),
  announcementPostedAt: timestamp("announcement_posted_at"),
  // ── THORX v3: Weekly bonus pool — 80% main + 5% bonus tracked separately ─
  bonusPoolPkr: decimal("bonus_pool_pkr", { precision: 12, scale: 4 }).notNull().default("0.0000"),
  // ── THORX v3: Guild Wars — self-funded war chest (halal prize model) ──────
  // Funded ONLY while the guild is in an active war, from a small per-engine
  // % of gross (WAR_LEVY_ENGINE_{A,B,C}_PCT) routed from THORX's revenue cut
  // — never from member earnings. The war winner takes BOTH guilds' chests as
  // the prize (added to the winner's weekly bonus pool at resolution); on a
  // draw each guild gets its own chest back. Zeroed at resolution.
  warChestPkr: decimal("war_chest_pkr", { precision: 12, scale: 4 }).notNull().default("0.0000"),
  // ── THORX v3: Governance ─────────────────────────────────────────────────
  assistantCaptainId: varchar("assistant_captain_id").references((): any => users.id, { onDelete: "set null" }),
  // ── THORX v3: Assistant captain feature permissions (jsonb list of enabled features) ──
  assistantPermissions: jsonb("assistant_permissions").default('[]'),
}, (table) => [
  index("guilds_captain_id_idx").on(table.captainId),
  index("guilds_status_idx").on(table.status),
  index("guilds_is_public_idx").on(table.isPublic),
  sql`CONSTRAINT check_guild_strikes_range CHECK (strikes >= 0)`,
]);

export type Guild = typeof guilds.$inferSelect;
export type InsertGuild = typeof guilds.$inferInsert;

// Guild membership — one active guild per user, enforced by unique(userId) below.
export const guildMembers = pgTable("guild_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // captain | member
  status: text("status").notNull().default("pending"), // pending | active | left | rejected
  requestedAt: timestamp("requested_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  leftAt: timestamp("left_at"),
  // ── THORX v3 ──────────────────────────────────────────────────────────────
  weeklyPointsContributed: integer("weekly_points_contributed").notNull().default(0), // resets every Sunday
  isMvp: boolean("is_mvp").notNull().default(false),
  mvpSetAt: timestamp("mvp_set_at"),
  mvpSetWeek: varchar("mvp_set_week", { length: 10 }), // ISO week lock, e.g. "2026-W29"
  lastNudgedAt: timestamp("last_nudged_at"),
  coverLetter: text("cover_letter"),
}, (table) => [
  index("guild_members_guild_id_idx").on(table.guildId),
  index("guild_members_user_id_idx").on(table.userId),
  index("guild_members_status_idx").on(table.status),
  // Composite index for "get all active members of guild X" — the most common query
  index("idx_guild_members_active").on(table.guildId, table.userId, table.status),
  // 2.2 — Tighter composite for captain portal / GPS engine: (guild, status) only
  index("guild_members_guild_id_status_idx").on(table.guildId, table.status),
  // A user can only hold one non-terminal (pending/active) membership at a time;
  // enforced at the application layer inside the join transaction (see storage.ts) —
  // Postgres partial unique indexes are avoided here to keep Drizzle's push flow simple.
]);

export const insertGuildMemberSchema = createInsertSchema(guildMembers).omit({
  id: true,
  requestedAt: true,
  joinedAt: true,
  leftAt: true,
});
export type InsertGuildMember = z.infer<typeof insertGuildMemberSchema>;
export type GuildMember = typeof guildMembers.$inferSelect;

// Guild strike log — audit trail behind guilds.strikes; 3 active (uncleared) strikes freezes the guild.
export const guildStrikes = pgTable("guild_strikes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  source: text("source").notNull().default("admin"), // admin | system_inactivity | system_fraud
  addedBy: varchar("added_by").references(() => users.id, { onDelete: "set null" }),
  clearedBy: varchar("cleared_by").references(() => users.id, { onDelete: "set null" }),
  clearedAt: timestamp("cleared_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("guild_strikes_guild_id_idx").on(table.guildId),
  index("guild_strikes_cleared_at_idx").on(table.clearedAt),
]);

export const insertGuildStrikeSchema = createInsertSchema(guildStrikes).omit({
  id: true,
  clearedBy: true,
  clearedAt: true,
  createdAt: true,
});
export type InsertGuildStrike = z.infer<typeof insertGuildStrikeSchema>;
export type GuildStrike = typeof guildStrikes.$inferSelect;

// Weekly cycle per guild — tracks the target/actual/resolved state that makes
// the resolution job idempotent (unique guildId+weekStart below).
export const guildWeeklyCycles = pgTable("guild_weekly_cycles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start").notNull(), // Monday 00:00:00 UTC
  weekEnd: timestamp("week_end").notNull(),     // Sunday 23:59:59 UTC
  targetPoints: integer("target_points").notNull(), // snapshot of WEEKLY_GOAL_TARGETS_BY_RANK at cycle creation
  actualPoints: integer("actual_points"), // filled in at resolution time
  goalMet: boolean("goal_met"), // null until resolved
  multiplierApplied: decimal("multiplier_applied", { precision: 4, scale: 2 }), // e.g. 1.20, or 1.00 if goal failed
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  // ── THORX v3: Bonus pool disposition ─────────────────────────────────────
  bonusPoolPkr: decimal("bonus_pool_pkr", { precision: 12, scale: 4 }).notNull().default("0.0000"),
  poolDisposition: text("pool_disposition"), // 'distributed' | 'voided'
  captainSharePkr: decimal("captain_share_pkr", { precision: 10, scale: 2 }),
  membersSharePkr: decimal("members_share_pkr", { precision: 10, scale: 2 }),
}, (table) => [
  index("guild_weekly_cycles_guild_id_idx").on(table.guildId),
  index("guild_weekly_cycles_resolved_idx").on(table.resolved),
  index("guild_weekly_cycles_week_start_idx").on(table.weekStart),
  // Unique (guildId, weekStart) makes the resolution job idempotent and is the ON CONFLICT target
  // in recordEarnEvent. Must match the constraint created in the DB migration.
  unique("guild_weekly_cycles_guild_week_unique").on(table.guildId, table.weekStart),
]);

export const insertGuildWeeklyCycleSchema = createInsertSchema(guildWeeklyCycles).omit({
  id: true,
  actualPoints: true,
  goalMet: true,
  multiplierApplied: true,
  resolved: true,
  resolvedAt: true,
  createdAt: true,
});
export type InsertGuildWeeklyCycle = z.infer<typeof insertGuildWeeklyCycleSchema>;
export type GuildWeeklyCycle = typeof guildWeeklyCycles.$inferSelect;

// The bulletproof points/PKR valuation ledger — append-only, see design notes above.
export const pointsLedger = pgTable("points_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  guildId: varchar("guild_id").references(() => guilds.id, { onDelete: "set null" }), // guild active at earn time, if any
  sourceType: text("source_type").notNull(), // ad_view | cpa_offer | daily_task | referral | guild_release
  sourceRefId: varchar("source_ref_id"), // e.g. the adViews.id / taskRecords.id / guildWeeklyCycles.id this row is derived from
  pointsDisplayed: integer("points_displayed").notNull(), // total illusion points shown on the Scratch Card
  lockedPkrValue: decimal("locked_pkr_value", { precision: 12, scale: 4 }).notNull(), // IMMUTABLE once written
  conversionRateUsed: decimal("conversion_rate_used", { precision: 12, scale: 4 }).notNull(), // IMMUTABLE once written
  vaultShareLockedPkr: decimal("vault_share_locked_pkr", { precision: 12, scale: 4 }).notNull().default("0.0000"), // portion of lockedPkrValue held in the guild vault (0 if no guild)
  weekStart: timestamp("week_start"), // set only for guild_release rows, ties back to the resolved week
  isConverted: boolean("is_converted").notNull().default(true), // false only transiently for held-vault bookkeeping views
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`), // e.g. {basePoints, guildBonusPoints, cycleId, goalMet}
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("points_ledger_user_id_idx").on(table.userId),
  index("points_ledger_guild_id_idx").on(table.guildId),
  index("points_ledger_source_type_idx").on(table.sourceType),
  index("points_ledger_created_at_idx").on(table.createdAt),
  index("points_ledger_week_start_idx").on(table.weekStart),
  index("points_ledger_guild_week_user_idx").on(table.guildId, table.weekStart, table.userId), // H-10: GPS weekly aggregation
]);

export const insertPointsLedgerSchema = createInsertSchema(pointsLedger).omit({
  id: true,
  createdAt: true,
});
export type InsertPointsLedger = z.infer<typeof insertPointsLedgerSchema>;
export type PointsLedger = typeof pointsLedger.$inferSelect;

// Relations
export const guildsRelations = relations(guilds, ({ one, many }) => ({
  captain: one(users, {
    fields: [guilds.captainId],
    references: [users.id],
  }),
  members: many(guildMembers),
  strikeLog: many(guildStrikes),
  weeklyCycles: many(guildWeeklyCycles),
  pointsLedgerEntries: many(pointsLedger),
}));

export const guildMembersRelations = relations(guildMembers, ({ one }) => ({
  guild: one(guilds, {
    fields: [guildMembers.guildId],
    references: [guilds.id],
  }),
  user: one(users, {
    fields: [guildMembers.userId],
    references: [users.id],
  }),
}));

export const guildStrikesRelations = relations(guildStrikes, ({ one }) => ({
  guild: one(guilds, {
    fields: [guildStrikes.guildId],
    references: [guilds.id],
  }),
}));

export const guildWeeklyCyclesRelations = relations(guildWeeklyCycles, ({ one }) => ({
  guild: one(guilds, {
    fields: [guildWeeklyCycles.guildId],
    references: [guilds.id],
  }),
}));

export const pointsLedgerRelations = relations(pointsLedger, ({ one }) => ({
  user: one(users, {
    fields: [pointsLedger.userId],
    references: [users.id],
  }),
  guild: one(guilds, {
    fields: [pointsLedger.guildId],
    references: [guilds.id],
  }),
}));

// ── Engine C: Group Chat Messages ─────────────────────────────────────────────
export const engineCMessages = pgTable("engine_c_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("engine_c_messages_guild_id_idx").on(table.guildId),
  index("engine_c_messages_sender_id_idx").on(table.senderId),
  index("engine_c_messages_created_at_idx").on(table.createdAt),
]);
export type EngineCMessage = typeof engineCMessages.$inferSelect;
export type InsertEngineCMessage = typeof engineCMessages.$inferInsert;

// ── Engine C: Weekly Tasks (Guild-exclusive, admin-injected) ──────────────────
export const weeklyTasks = pgTable("weekly_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  pointReward: integer("point_reward").notNull(),
  weekStart: timestamp("week_start").notNull(),
  weekEnd: timestamp("week_end").notNull(),
  targetGuildRank: varchar("target_guild_rank", { length: 1 }).default("E"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  // ── THORX v3 ──────────────────────────────────────────────────────────────
  taskCategory: text("task_category").notNull().default("cpa_offer"), // cpa_offer | indirect | platform
  visibility: text("visibility").notNull().default("engine_c"), // engine_b | engine_c | both
  grossPkrPerCompletion: decimal("gross_pkr_per_completion", { precision: 10, scale: 4 }),
  actionUrl: text("action_url"), // for indirect tasks (YouTube, TikTok, etc.)
}, (table) => [
  index("weekly_tasks_week_start_idx").on(table.weekStart),
  index("weekly_tasks_is_active_idx").on(table.isActive),
]);
export type WeeklyTask = typeof weeklyTasks.$inferSelect;
export type InsertWeeklyTask = typeof weeklyTasks.$inferInsert;

// ── Engine C: Weekly Task Completion Records ──────────────────────────────────
export const weeklyTaskRecords = pgTable("weekly_task_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").notNull().references(() => weeklyTasks.id, { onDelete: "cascade" }),
  status: text("status").default("completed"),
  completedAt: timestamp("completed_at").defaultNow(),
}, (table) => [
  index("weekly_task_records_user_id_idx").on(table.userId),
  index("weekly_task_records_task_id_idx").on(table.taskId),
  unique("weekly_task_records_unique").on(table.userId, table.taskId),
]);
export type WeeklyTaskRecord = typeof weeklyTaskRecords.$inferSelect;
export type InsertWeeklyTaskRecord = typeof weeklyTaskRecords.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// THORX v3 — New tables (Part D.7–D.11 of the v3 spec)
// ═══════════════════════════════════════════════════════════════════════════

// D.7 — Immutable exact-PKR ledger. Source of truth for withdrawal math.
// INVARIANT: real_pkr_value is write-once; never UPDATE it after insert.
// ── REAL PKR ECONOMY v4: verification lifecycle ──────────────────────────────
// verificationStatus models the pending → available pipeline:
//   'pending'  — earned PKR held in users.pending_balance, awaiting network/
//                Thorx verification (auto-verified by the sweep job after
//                PENDING_VERIFICATION_HOURS).
//   'verified' — PKR confirmed; amount has moved pending → available.
//   'held'     — commission awaiting an external settlement event (referrer
//                fee-share waiting for its withdrawal to complete); the time
//                sweep must NEVER touch these.
//   'rejected' — network reversed the earning (survey clawback / admin
//                rejection); amount removed from balances.
// Legacy rows (pre-v4) are 'verified' by default — they were credited
// straight to available_balance under the old model.
export const userTransactions = pgTable("user_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Finding 2-Q: immutable PKR ledger must survive user soft-delete.
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  engineType: text("engine_type").notNull(), // Engine_A | Engine_B | Engine_C | Indirect | Referral_Commission | Referral_Fee_Commission
  pointsCredited: integer("points_credited").notNull(), // deterministic: realPkrValue × TX_POINTS_PER_PKR (gamification display)
  realPkrValue: decimal("real_pkr_value", { precision: 10, scale: 4 }).notNull(), // IMMUTABLE
  grossPkr: decimal("gross_pkr", { precision: 10, scale: 4 }),
  thorxProfitPkr: decimal("thorx_profit_pkr", { precision: 10, scale: 4 }),
  guildPoolPkr: decimal("guild_pool_pkr", { precision: 10, scale: 4 }),
  conversionRate: integer("conversion_rate").notNull(),
  cardVariance: decimal("card_variance", { precision: 5, scale: 4 }).notNull(),
  sourceId: varchar("source_id"),
  sourceType: text("source_type"), // ad_view | weekly_task | daily_task | engine_b_task | survey | referral_commission | referral_fee_commission
  withdrawn: boolean("withdrawn").notNull().default(false),
  withdrawalId: varchar("withdrawal_id"),
  verificationStatus: text("verification_status").notNull().default("verified"), // pending | verified | held | rejected
  verifiedAt: timestamp("verified_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_user_transactions_user_created").on(table.userId, table.createdAt),
  index("idx_user_transactions_user_withdrawn").on(table.userId, table.withdrawn),
  index("idx_user_transactions_withdrawal").on(table.withdrawalId),
  // C2-05: FIFO ledger query (userId + withdrawn=false ORDER BY createdAt) needs a composite
  // covering index — the two separate indexes above force a bitmap AND / merge scan.
  index("idx_user_transactions_fifo").on(table.userId, table.withdrawn, table.createdAt),
  // v4 verification sweep: pending rows older than the threshold, per user.
  index("idx_user_transactions_verification").on(table.verificationStatus, table.createdAt),
  index("idx_user_transactions_user_verification").on(table.userId, table.verificationStatus),
  // NOTE: a partial unique index also exists on the live DB but cannot be expressed
  // in Drizzle's table-definition DSL:
  //   CREATE UNIQUE INDEX uniq_user_transactions_source
  //   ON user_transactions (source_id, source_type) WHERE source_id IS NOT NULL;
  // Applied via raw SQL on 2026-07-15 (production-readiness audit idempotency fix).
  // Re-apply manually after any full DB rebuild.
]);
export type UserTransaction = typeof userTransactions.$inferSelect;
export type InsertUserTransaction = typeof userTransactions.$inferInsert;

// D.8 — 1-tier referral commissions, paid from the withdrawal fee.
export const referralCommissions = pgTable("referral_commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id),
  inviteeId: varchar("invitee_id").notNull().references(() => users.id),
  withdrawalId: varchar("withdrawal_id").notNull().references(() => withdrawals.id),
  commissionAmountPkr: decimal("commission_amount_pkr", { precision: 10, scale: 2 }).notNull(),
  inviteeNetPkr: decimal("invitee_net_pkr", { precision: 10, scale: 2 }).notNull(),
  platformFeePkr: decimal("platform_fee_pkr", { precision: 10, scale: 2 }).notNull(),
  feeRateUsed: decimal("fee_rate_used", { precision: 5, scale: 4 }).notNull(),
  refShareRateUsed: decimal("ref_share_rate_used", { precision: 5, scale: 4 }).notNull(),
  status: text("status").notNull().default("paid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_referral_commissions_referrer").on(table.referrerId, table.createdAt),
  index("idx_referral_commissions_withdrawal").on(table.withdrawalId),
]);
export type ReferralCommission = typeof referralCommissions.$inferSelect;
export type InsertReferralCommission = typeof referralCommissions.$inferInsert;

// D.9 — Captain <-> member direct message channel.
export const captainMessages = pgTable("captain_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  toUserId: varchar("to_user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_captain_messages_thread").on(table.guildId, table.fromUserId, table.toUserId, table.createdAt),
  index("idx_captain_messages_unread").on(table.toUserId, table.isRead),
]);
export type CaptainMessage = typeof captainMessages.$inferSelect;
export type InsertCaptainMessage = typeof captainMessages.$inferInsert;

// D.10 — One row per guild per week, written once by the Sunday reset job.
export const guildWeeklySnapshots = pgTable("guild_weekly_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id),
  weekStart: date("week_start").notNull(),
  targetPoints: integer("target_points").notNull(),
  achievedPoints: integer("achieved_points").notNull(),
  wasSuccessful: boolean("was_successful").notNull(),
  bonusPoolPkr: decimal("bonus_pool_pkr", { precision: 12, scale: 4 }).notNull(),
  poolDisposition: text("pool_disposition").notNull(), // distributed | voided
  captainShare: decimal("captain_share", { precision: 10, scale: 2 }).notNull().default("0"),
  membersShare: decimal("members_share", { precision: 10, scale: 2 }).notNull().default("0"),
  treasuryBonusPkr: decimal("treasury_bonus_pkr", { precision: 12, scale: 4 }).notNull().default("0.0000"),
  achievementPct: decimal("achievement_pct", { precision: 5, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("idx_guild_snapshots_unique").on(table.guildId, table.weekStart),
  // Sort index for weekly history query in Captain Portal (guildId + createdAt)
  index("idx_guild_weekly_snapshots_guild").on(table.guildId, table.createdAt),
]);
export type GuildWeeklySnapshot = typeof guildWeeklySnapshots.$inferSelect;
export type InsertGuildWeeklySnapshot = typeof guildWeeklySnapshots.$inferInsert;

// D.11 — Admin Live Activity Feed source table.
export const activityFeed = pgTable("activity_feed", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(), // earn | rank_up | guild_target | withdrawal | registration | guild_event | inactivity
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  guildId: varchar("guild_id").references(() => guilds.id, { onDelete: "set null" }),
  displayMessage: text("display_message").notNull(),
  data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_activity_feed_created").on(table.createdAt),
  index("idx_activity_feed_type").on(table.eventType, table.createdAt),
  // User-filtered feed queries in admin views — flagged by 2026-07-16 perf audit
  index("idx_activity_feed_user_id").on(table.userId, table.createdAt),
]);
export type ActivityFeed = typeof activityFeed.$inferSelect;
export type InsertActivityFeed = typeof activityFeed.$inferInsert;

// ── F-09 / S-07: Password reset tokens ────────────────────────────────────────
// Stores hashed tokens for the self-service email password-reset flow.
// tokenHash is SHA-256 of the random 32-byte token sent in the email link.
// Used (usedAt != null) tokens are treated as invalid; tokens expire after 1 hour.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt:    timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_prt_user_created").on(table.userId, table.createdAt),
  index("idx_prt_token_hash").on(table.tokenHash),
]);
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Referral earn commissions — 1% of gross credited to direct referrer on every earn event.
// Separate from referral_commissions (which tracks withdrawal-based referral fees).
export const referralEarnCommissions = pgTable("referral_earn_commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  earnerId: varchar("earner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  earnEventSourceId: varchar("earn_event_source_id").notNull(),
  earnEventSourceType: text("earn_event_source_type").notNull(), // ad_view | weekly_task | daily_task
  grossPkr: decimal("gross_pkr", { precision: 10, scale: 4 }).notNull(),
  commissionPkr: decimal("commission_pkr", { precision: 10, scale: 4 }).notNull(),
  commissionRatePct: decimal("commission_rate_pct", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_ref_earn_comm_referrer").on(table.referrerId, table.createdAt),
  index("idx_ref_earn_comm_earner").on(table.earnerId, table.createdAt),
  // Prevent double-commission for the same earn event
  unique("idx_ref_earn_comm_source").on(table.earnerId, table.earnEventSourceId, table.earnEventSourceType),
]);
export type ReferralEarnCommission = typeof referralEarnCommissions.$inferSelect;
export type InsertReferralEarnCommission = typeof referralEarnCommissions.$inferInsert;

// ── Economy State — daily multiplier cache ────────────────────────────────────
export const economyState = pgTable("economy_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull().unique(),
  autoMultiplier: decimal("auto_multiplier", { precision: 6, scale: 4 }).notNull().default("1.0000"),
  adminOverride: decimal("admin_override", { precision: 6, scale: 4 }),
  effectiveMultiplier: decimal("effective_multiplier", { precision: 6, scale: 4 }).notNull().default("1.0000"),
  revenueBaseline: decimal("revenue_baseline", { precision: 14, scale: 4 }),
  revenueActual: decimal("revenue_actual", { precision: 14, scale: 4 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_economy_state_date").on(table.date),
]);
export type EconomyState = typeof economyState.$inferSelect;

// ── Ad Network Performance — AI Router data store ────────────────────────────
export const adNetworkPerformance = pgTable("ad_network_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  networkId: varchar("network_id").notNull(),
  networkName: varchar("network_name").notNull(),
  date: date("date").notNull(),
  impressions: integer("impressions").notNull().default(0),
  completions: integer("completions").notNull().default(0),
  fillRatePct: decimal("fill_rate_pct", { precision: 5, scale: 2 }).notNull().default("0.00"),
  completionRatePct: decimal("completion_rate_pct", { precision: 5, scale: 2 }).notNull().default("0.00"),
  cpmPkr: decimal("cpm_pkr", { precision: 10, scale: 4 }).notNull().default("0.0000"),
  revenuePkr: decimal("revenue_pkr", { precision: 14, scale: 4 }).notNull().default("0.0000"),
  routerScore: decimal("router_score", { precision: 6, scale: 4 }).notNull().default("0.0000"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("idx_ad_network_perf_unique").on(table.networkId, table.date),
  index("idx_ad_network_perf_date").on(table.date),
]);
export type AdNetworkPerformance = typeof adNetworkPerformance.$inferSelect;

// ── Webhook Events — replay protection + audit log ───────────────────────────
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  networkId: varchar("network_id").notNull(),
  eventId: varchar("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  signature: text("signature"),
  verificationStatus: text("verification_status").notNull().default("pending"), // pending | verified | rejected
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  ipAddress: text("ip_address").notNull().default(""),
  rewardTriggered: boolean("reward_triggered").notNull().default(false),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("idx_webhook_events_unique").on(table.networkId, table.eventId),
  index("idx_webhook_events_status").on(table.verificationStatus, table.createdAt),
  index("idx_webhook_events_user").on(table.userId, table.createdAt),
]);
export type WebhookEvent = typeof webhookEvents.$inferSelect;

// ── Guild Wars — seasonal competition architecture ────────────────────────────
export const guildWarSeasons = pgTable("guild_war_seasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming | active | completed
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  prizePoolPkr: decimal("prize_pool_pkr", { precision: 14, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gws_status").on(table.status, table.startDate),
]);
export type GuildWarSeason = typeof guildWarSeasons.$inferSelect;

export const guildWars = pgTable("guild_wars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seasonId: varchar("season_id").references(() => guildWarSeasons.id, { onDelete: "set null" }),
  // challengerGuildId = the guild that initiated the challenge
  challengerGuildId: varchar("challenger_guild_id").notNull().references(() => guilds.id, { onDelete: "restrict" }),
  challengedGuildId: varchar("challenged_guild_id").notNull().references(() => guilds.id, { onDelete: "restrict" }),
  // status flow: pending_challenger_approval → pending_challenged_approval → active → completed | cancelled
  status: text("status").notNull().default("pending_challenger_approval"),
  challengerScore: integer("challenger_score").notNull().default(0),
  challengedScore: integer("challenged_score").notNull().default(0),
  winnerId: varchar("winner_id").references(() => guilds.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  // Pool snapshots at completion time (for prize distribution)
  challengerPoolAtEnd: decimal("challenger_pool_at_end", { precision: 14, scale: 4 }),
  challengedPoolAtEnd: decimal("challenged_pool_at_end", { precision: 14, scale: 4 }),
  // Prize locked at resolution (migration 0008): the winner takes BOTH guilds'
  // war chests, credited to the winner's weekly bonus pool. "0.0000" until
  // resolveWar writes the chest total at completion; on a draw it stays 0 and
  // each guild gets its own chest back.
  prizePkr: decimal("prize_pkr", { precision: 14, scale: 4 }).notNull().default("0.0000"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gw_status").on(table.status),
  index("idx_gw_season").on(table.seasonId),
  index("idx_gw_challenger").on(table.challengerGuildId),
  index("idx_gw_challenged").on(table.challengedGuildId),
]);
export type GuildWar = typeof guildWars.$inferSelect;

export const guildWarParticipants = pgTable("guild_war_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warId: varchar("war_id").notNull().references(() => guildWars.id, { onDelete: "cascade" }),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "restrict" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  pointsContributed: integer("points_contributed").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("idx_gwp_unique").on(table.warId, table.guildId, table.userId),
  index("idx_gwp_war").on(table.warId, table.guildId),
]);
export type GuildWarParticipant = typeof guildWarParticipants.$inferSelect;

export const guildHallOfFame = pgTable("guild_hall_of_fame", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "restrict" }),
  seasonId: varchar("season_id").notNull().references(() => guildWarSeasons.id, { onDelete: "restrict" }),
  placement: integer("placement").notNull(), // 1 = champion, 2 = runner-up, 3 = third
  warsWon: integer("wars_won").notNull().default(0),
  totalPointsScored: integer("total_points_scored").notNull().default(0),
  awardedAt: timestamp("awarded_at").notNull().defaultNow(),
}, (table) => [
  unique("idx_ghof_unique").on(table.guildId, table.seasonId),
  index("idx_ghof_season").on(table.seasonId, table.placement),
]);
export type GuildHallOfFame = typeof guildHallOfFame.$inferSelect;

export const guildBadges = pgTable("guild_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  badgeType: varchar("badge_type").notNull(), // war_winner | season_champion | runner_up | third_place
  badgeName: varchar("badge_name").notNull(),
  seasonId: varchar("season_id").references(() => guildWarSeasons.id, { onDelete: "set null" }),
  awardedAt: timestamp("awarded_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gb_guild").on(table.guildId, table.awardedAt),
]);
export type GuildBadge = typeof guildBadges.$inferSelect;

// ── Guild Wars: member approval votes ────────────────────────────────────────
// Each member votes to approve/reject their guild's participation in a war.
export const guildWarApprovals = pgTable("guild_war_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warId: varchar("war_id").notNull().references(() => guildWars.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  approved: boolean("approved").notNull(),
  approvedAt: timestamp("approved_at").notNull().defaultNow(),
}, (table) => [
  unique("guild_war_approvals_war_user_unique").on(table.warId, table.userId),
  index("idx_gwa_war_id").on(table.warId),
  index("idx_gwa_guild_id").on(table.guildId),
]);
export type GuildWarApproval = typeof guildWarApprovals.$inferSelect;

// ── Guild Profiles — per-member identity inside a guild ──────────────────────
// Each guild member can have a unique profile visible within their guild and on discovery.
// Pre-filled from users table on creation; can be customised independently.
export const guildProfiles = pgTable("guild_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  username: varchar("username", { length: 50 }),
  description: text("description"),
  links: jsonb("links").default('[]'), // [{label: string, url: string}]
  favoriteMemberId: varchar("favorite_member_id").references(() => users.id, { onDelete: "set null" }),
  profilePicture: text("profile_picture"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("guild_profiles_user_guild_unique").on(table.userId, table.guildId),
  index("guild_profiles_guild_id_idx").on(table.guildId),
  index("guild_profiles_user_id_idx").on(table.userId),
]);
export type GuildProfile = typeof guildProfiles.$inferSelect;
export type InsertGuildProfile = typeof guildProfiles.$inferInsert;
export const insertGuildProfileSchema = createInsertSchema(guildProfiles).omit({ id: true, createdAt: true, updatedAt: true });

export const insertUserTransactionSchema = createInsertSchema(userTransactions).omit({ id: true, createdAt: true });
export const insertReferralCommissionSchema = createInsertSchema(referralCommissions).omit({ id: true, createdAt: true });
export const insertCaptainMessageSchema = createInsertSchema(captainMessages).omit({ id: true, createdAt: true, isRead: true });
export const insertGuildWeeklySnapshotSchema = createInsertSchema(guildWeeklySnapshots).omit({ id: true, createdAt: true });
export const insertActivityFeedSchema = createInsertSchema(activityFeed).omit({ id: true, createdAt: true });

// ── Guild Creation Requests — admin approval flow ─────────────────────────────
// B-Rank+ users submit a request to create a guild. Admin approves/rejects.
// Upon approval, the guild is auto-created and user becomes captain.
export const guildCreationRequests = pgTable("guild_creation_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  guildName: text("guild_name").notNull(),
  description: text("description"),
  reason: text("reason").notNull(), // why they want a guild (min 50 chars)
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  adminNote: text("admin_note"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  createdGuildId: varchar("created_guild_id").references((): any => guilds.id, { onDelete: "set null" }), // set when approved
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gcr_user_id").on(table.userId, table.createdAt),
  index("idx_gcr_status").on(table.status, table.createdAt),
]);
export type GuildCreationRequest = typeof guildCreationRequests.$inferSelect;
export type InsertGuildCreationRequest = typeof guildCreationRequests.$inferInsert;
