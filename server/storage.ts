import Decimal from "decimal.js";
import { logger } from "./lib/logger";
import { Sentry } from "./lib/sentry";
import {
  users,
  earnings,
  adViews,
  referrals,
  teamEmails,
  teamKeys,
  userCredentials,
  chatMessages,
  hilltopAdsConfig,
  hilltopAdsZones,
  hilltopAdsStats,
  commissionLogs,
  withdrawals,
  founderWithdrawals,
  type FounderWithdrawal,
  type InsertFounderWithdrawal,
  healthSnapshots,
  type HealthSnapshot,
  errorEvents,
  authEvents,
  type Registration,
  type InsertRegistration,
  type User,
  type InsertUser,
  type Earning,
  type InsertEarning,
  type AdView,
  type InsertAdView,
  type Referral,
  type InsertReferral,
  type TeamEmail,
  type InsertTeamEmail,
  type TeamKey,
  type InsertTeamKey,
  type UserCredential,
  type InsertUserCredential,
  type ChatMessage,
  type InsertChatMessage,
  type HilltopAdsConfig,
  type InsertHilltopAdsConfig,
  type HilltopAdsZone,
  type InsertHilltopAdsZone,
  type HilltopAdsStat,
  type InsertHilltopAdsStat,
  type CommissionLog,
  type InsertCommissionLog,
  type Withdrawal,
  type InsertWithdrawal,
  type RankLog,
  type InsertRankLog,
  rankLogs,
  type AuditLog,
  type InsertAuditLog,
  auditLogs,
  internalNotes,
  type InternalNote,
  type InsertInternalNote,
  teamInvitations,
  type TeamInvitation,
  type InsertTeamInvitation,
  systemConfig,
  type SystemConfig,
  type InsertSystemConfig,
  notifications,
  type Notification,
  type InsertNotification,
  leaderboardCache,
  type LeaderboardCache,
  type InsertLeaderboardCache,
  deviceFingerprints,
  type DeviceFingerprint,
  type InsertDeviceFingerprint,
  riskCases,
  type RiskCase,
  type InsertRiskCase,
  scoreHistory,
  type ScoreHistory,
  type InsertScoreHistory,
  guilds,
  type Guild,
  type InsertGuild,
  guildMembers,
  type GuildMember,
  type InsertGuildMember,
  guildStrikes,
  type GuildStrike,
  type InsertGuildStrike,
  guildWeeklyCycles,
  type GuildWeeklyCycle,
  guildWeeklySnapshots,
  type GuildWeeklySnapshot,
  pointsLedger,
  type PointsLedger,
  type InsertPointsLedger,
  engineCMessages,
  type EngineCMessage,
  type InsertEngineCMessage,
  weeklyTasks,
  type WeeklyTask,
  type InsertWeeklyTask,
  weeklyTaskRecords,
  type WeeklyTaskRecord,
  type InsertWeeklyTaskRecord,
  userTransactions,
  type UserTransaction,
  type InsertUserTransaction,
  referralCommissions,
  type ReferralCommission,
  type InsertReferralCommission,
  referralEarnCommissions,
  type ReferralEarnCommission,
  captainMessages,
  type CaptainMessage,
  type InsertCaptainMessage,
  activityFeed,
  type ActivityFeed,
  economyState,
  engineBTasks,
  type EngineBTask,
  type InsertEngineBTask,
  engineBRecords,
  type EngineBRecord,
  type InsertEngineBRecord,
  guildWars,
} from "@shared/schema";
import { pickAvatarIdForName } from "@shared/constants";
import { drawThorxCard, RANK_REWARD_MULTIPLIERS } from "./modules/thorx-card";
import { awardTaskPS, processStreak } from "./modules/ps-engine";
import { checkAndUpdateRankTier } from "./modules/ps-engine";
import { awardMemberGPS, awardMVPGPS, checkAndUpdateGuildRankTier, computeGuildRankTier, fetchGpsConfig, GUILD_RANK_TIERS, type GuildRankTier } from "./modules/gps-engine";
import { contributeWarPoints } from "./modules/guild-wars";
import { emitFeedEvent } from "./modules/live-feed";
import { db } from "./db";
import { eq, desc, asc, and, or, sql, inArray, ilike, gte, lte, lt, ne, isNotNull, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import { encryptCredential, decryptCredential, isEncrypted } from "./utils/credential-crypto";
import { inferAuditCategory, type RequestContext } from "./request-context";
import { describeAuditLog } from "./audit-descriptions";

// ── Points Ledger config defaults ────────────────────────────────────────────
// Real values are read via getSystemConfigValue() from system_config at runtime
// (team/admin editable); these are only the fallback if a key was never set.
// TX-Points per Rs.10 earned (not per Rs.1). The thorx-card formula is
// `pkrDecimal.div(10).times(conversionRate)`, so effective rate = value/10.
// Default 1000 → 100 TX-Points per Rs.1 PKR — matches spec §1.1 ("default 100").
const DEFAULT_CONVERSION_RATE = 1000;

// Rank reward multipliers — applied to TX-Points (gamification display) per earn event.
// Config Q6: E=1.00x, D=1.10x, C=1.20x, B=1.35x, A=1.50x, S=1.75x.
// Canonical definition lives in ./modules/thorx-card (imported above) so the
// real earn flow and the admin Thorx Card Sandbox simulation can never drift.

// Fixed UTC week boundary: Monday 00:00:00 UTC through Sunday 23:59:59.999 UTC.
// Not user-configurable in v1 (see design notes in shared/schema.ts).
function getUtcWeekBounds(reference: Date): { weekStart: Date; weekEnd: Date } {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() + diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

// ── Ledger Validator (admin tool) shared result shape ───────────────────────
// Consumed by two different admin surfaces:
//   • LedgerValidator.tsx  — full per-user + platform-wide integrity report
//   • PayoutControl.tsx    — pre-approval "RED ALERT" ledger-mismatch banner
// Both read the exact same endpoint response, so every field either surface
// needs must live here.
export interface LedgerValidationResult {
  userId: string;
  email?: string;
  isBalanced: boolean;
  computedBalance: string;
  storedBalance: string;
  discrepancy: string;
  totalEarned: string;
  totalWithdrawn: string;
  totalFees: string;
  transactionCount: number;
  errors: string[];
  warnings: string[];
  // PayoutControl-only fields (pre-approval mismatch banner):
  isMismatch: boolean;
  pointsMismatch?: number;
  pkrMismatch?: number;
  severity?: string;
  // Ledger-audit addition (2026-07-29): referral cash-commission wallet
  // (users.balanceCashPkr) was previously completely outside ledger
  // validation — an admin could not detect drift/corruption in referral
  // commissions the way they could for the main earnings balance. Computed
  // as SUM(referral_earn_commissions.commissionPkr) +
  // SUM(referral_commissions.commissionAmountPkr) − SUM(amount) of that
  // user's non-rejected referral:* withdrawals.
  computedCashBalance: string;
  storedCashBalance: string;
  cashDiscrepancy: string;
}

interface LedgerUserFields {
  id: string;
  email: string;
  availableBalance: string | null;
  totalEarnings: string | null;
  totalWithdrawn: string | null;
  txPointsBalance: number | null;
  balanceCashPkr?: string | null;
}

const LEDGER_PKR_TOLERANCE = new Decimal("0.01");

// Pure function: turns raw aggregates into the validation verdict. Shared by
// the single-user lookup and the bulk scan so both apply identical rules.
function buildLedgerValidationResult(
  user: LedgerUserFields,
  unwithdrawnPkr: string | number,
  unwithdrawnPoints: string | number,
  transactionCount: number,
  totalFees: string | number,
  // Ledger-audit addition (2026-07-29): referral cash-commission aggregates —
  // see the computedCashBalance doc comment on LedgerValidationResult.
  referralCommissionsEarned: string | number = 0,
  referralWithdrawnCash: string | number = 0,
): LedgerValidationResult {
  // R-Audit (2026-07-29, CRITICAL): processWithdrawal debits availableBalance by
  // the NET payout (post-fee) but marks the FULL gross ledger value as withdrawn
  // (see processWithdrawal's explicit "defined in terms of net amount" comment).
  // That gap is intentional — the fee is platform revenue, not user balance — but
  // it means availableBalance is permanently "ahead of" the unwithdrawn-ledger sum
  // by exactly the user's lifetime completed-withdrawal fees. Previously totalFees
  // was queried and returned for display but never folded into computedBalanceD,
  // so every user who ever paid a withdrawal fee was flagged as a CRITICAL
  // mismatch for the fee amount — and clicking "Reconcile" would have wrongly
  // subtracted that same fee from the user's balance a second time. Adding it
  // back here makes computedBalanceD represent what availableBalance should
  // actually equal.
  const computedBalanceD = new Decimal(unwithdrawnPkr || 0).plus(new Decimal(totalFees || 0));
  const storedBalanceD = new Decimal(user.availableBalance || "0");
  // users.availableBalance is DECIMAL(10,2) — every write to it is rounded to 2dp
  // by Postgres, while the ledger (user_transactions.realPkrValue) carries 4dp of
  // internal precision. Diffing the raw 4dp sum against the always-2dp stored
  // balance manufactures sub-paisa "drift" from the scale mismatch alone, not a
  // real bug. Round the computed side to the balance column's real precision
  // before comparing so only genuine discrepancies are flagged (audit 2026-07-29).
  const discrepancyD = storedBalanceD.minus(computedBalanceD.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  const ledgerUnwithdrawnPoints = Math.round(Number(unwithdrawnPoints) || 0);
  const txPointsBalance = user.txPointsBalance ?? 0;

  const errors: string[] = [];
  const warnings: string[] = [];
  let pointsMismatch: number | undefined;
  let pkrMismatch: number | undefined;

  if (discrepancyD.abs().gt(LEDGER_PKR_TOLERANCE)) {
    errors.push(
      `Available balance (Rs.${storedBalanceD.toFixed(2)}) does not match the unwithdrawn ledger total (Rs.${computedBalanceD.toFixed(2)}).`
    );
    pkrMismatch = Number(discrepancyD.toFixed(4));
  } else if (discrepancyD.abs().gt(0)) {
    warnings.push(`Rounding drift of Rs.${discrepancyD.abs().toFixed(4)} between balance and ledger.`);
  }

  if (txPointsBalance !== ledgerUnwithdrawnPoints) {
    errors.push(
      `TX-Points counter (${txPointsBalance}) does not match the unwithdrawn points ledger (${ledgerUnwithdrawnPoints}).`
    );
    pointsMismatch = txPointsBalance - ledgerUnwithdrawnPoints;
  }

  if (storedBalanceD.lt(0)) {
    errors.push(`Available balance is negative (Rs.${storedBalanceD.toFixed(2)}).`);
  }

  if (transactionCount === 0 && storedBalanceD.gt(0)) {
    warnings.push(`User holds a positive balance with no ledger transactions on record (likely a manual balance adjustment).`);
  }

  // Referral cash wallet check (2026-07-29 audit addition) — balanceCashPkr was
  // previously never cross-checked against anything, so drift or corruption in
  // an admin's or user's referral commissions was invisible. Rejected referral
  // withdrawals are excluded from referralWithdrawnCash by the caller's query
  // (only non-rejected withdrawals actually remove cash from the wallet).
  const computedCashBalanceD = new Decimal(referralCommissionsEarned || 0).minus(new Decimal(referralWithdrawnCash || 0));
  const storedCashBalanceD = new Decimal(user.balanceCashPkr ?? "0");
  const cashDiscrepancyD = storedCashBalanceD.minus(computedCashBalanceD.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  if (cashDiscrepancyD.abs().gt(LEDGER_PKR_TOLERANCE)) {
    errors.push(
      `Referral cash balance (Rs.${storedCashBalanceD.toFixed(2)}) does not match lifetime commissions minus withdrawals (Rs.${computedCashBalanceD.toFixed(2)}).`
    );
  } else if (cashDiscrepancyD.abs().gt(0)) {
    warnings.push(`Rounding drift of Rs.${cashDiscrepancyD.abs().toFixed(4)} in the referral cash wallet.`);
  }

  return {
    userId: user.id,
    email: user.email,
    isBalanced: errors.length === 0,
    computedBalance: computedBalanceD.toFixed(2),
    storedBalance: storedBalanceD.toFixed(2),
    discrepancy: discrepancyD.toFixed(4),
    totalEarned: new Decimal(user.totalEarnings || "0").toFixed(2),
    totalWithdrawn: new Decimal(user.totalWithdrawn || "0").toFixed(2),
    totalFees: new Decimal(totalFees || 0).toFixed(2),
    transactionCount,
    errors,
    warnings,
    isMismatch: errors.length > 0,
    pointsMismatch,
    pkrMismatch,
    severity: errors.length > 0 ? "CRITICAL" : warnings.length > 0 ? "WARNING" : undefined,
    computedCashBalance: computedCashBalanceD.toFixed(2),
    storedCashBalance: storedCashBalanceD.toFixed(2),
    cashDiscrepancy: cashDiscrepancyD.toFixed(4),
  };
}

export interface EarnEventBreakdown {
  basePoints: number;
  guildBonusPoints: number;
  totalPoints: number;
  vaultPkr: string;
  walletPkr: string;
  guildId: string | null;
}

export interface IStorage {
  // Legacy registration methods (keeping for backward compatibility)
  createRegistration(registration: InsertRegistration): Promise<Registration>;
  getRegistrationByEmail(email: string): Promise<Registration | undefined>;

  // User management methods
  createUser(user: InsertUser & { id?: string }): Promise<User>; // Allow external ID (from Supabase)
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByReferralCode(referralCode: string): Promise<User | undefined>;
  validateUserPassword(email: string, password: string): Promise<User | undefined>;
  updateUser(userId: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  updateUserEarnings(userId: string, amount: string, toPending?: boolean, tx?: any): Promise<void>;
  generatePasswordResetToken(email: string): Promise<string | undefined>;
  resetPasswordWithToken(token: string, newPassword: string): Promise<boolean>;

  // System config helper
  getSystemConfigValue<T>(key: string, defaultValue: T): Promise<T>;
  setSystemConfigValue(key: string, value: any): Promise<void>;

  // Earnings methods
  createEarning(earning: InsertEarning): Promise<Earning>;
  getUserEarnings(userId: string, limit?: number): Promise<Earning[]>;
  getUserTotalEarnings(userId: string): Promise<string>;
  getEarningsBreakdown(userId: string): Promise<{ engineA: string; engineB: string; guildPool: string }>;

  // Ad views methods
  createAdView(adView: InsertAdView): Promise<AdView & { pointsBreakdown?: EarnEventBreakdown }>;
  getUserAdViews(userId: string, limit?: number): Promise<AdView[]>;
  getTodayAdViews(userId: string): Promise<number>;

  // Referrals methods
  createReferral(referral: InsertReferral): Promise<Referral>;
  getUserReferrals(userId: string): Promise<Array<Referral & { referred: User }>>;
  getReferralStats(userId: string): Promise<{ count: number; totalEarned: string }>;
  getReferralStatsDetailed(userId: string): Promise<{
    totalReferrals: number;
    level1Count: number;
    totalCommissionEarnings: string;
    level1Earnings: string;
    pendingCommissions: string;
    paidCommissions: string;
  }>;


  // Team functionality methods
  // Team emails for inbox functionality
  createTeamEmail(teamEmail: InsertTeamEmail): Promise<TeamEmail>;
  updateTeamEmail(id: string, updates: Partial<TeamEmail>): Promise<TeamEmail | undefined>;
  getTeamEmails(type?: 'inbound' | 'outbound', limit?: number): Promise<TeamEmail[]>;
  getTeamEmailsByUser(userId: string, limit?: number): Promise<TeamEmail[]>;
  deleteTeamEmail(id: string): Promise<boolean>;

  // Team keys for managing team member access
  createTeamKey(teamKey: InsertTeamKey, tx?: any): Promise<TeamKey>;
  getTeamKeysByUser(userId: string, tx?: any): Promise<TeamKey[]>;
  updateTeamKey(keyId: string, updates: Partial<InsertTeamKey>): Promise<TeamKey | undefined>;
  getTeamMembers(): Promise<Array<User & { teamKey: TeamKey | null }>>;
  
  // Team Invitations
  createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation>;
  getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined>;
  consumeTeamInvitation(invitationId: string): Promise<void>;
  updateUserPermissions(userId: string, permissions: string[]): Promise<User | undefined>;

  // User credentials storage for team data management
  createUserCredential(credential: InsertUserCredential): Promise<UserCredential>;
  getUserCredentials(userId: string): Promise<UserCredential[]>;
  getAllUserCredentials(): Promise<Array<UserCredential & { user: User }>>;
  updateUserCredential(credentialId: string, updates: Partial<InsertUserCredential>): Promise<UserCredential | undefined>;
  deleteUserCredential(credentialId: string): Promise<void>;

  // Team-specific user methods
  getUsersByRole(role: 'user' | 'team' | 'founder'): Promise<User[]>;
  getAllUsers(limit?: number, offset?: number): Promise<User[]>; // Added method to fetch all users
  getUsersCountInRange(since: Date): Promise<number>;
  getEarningsSumInRange(since: Date): Promise<string>;
  getAnalyticsData(since: Date): Promise<any[]>;
  getEngineRevenue(since: Date): Promise<{ Engine_A: string; Engine_B: string; Engine_C: string; Indirect: string }>;

  // Scalable Data Architecture methods
  getUsersPaginated(params: { page: number, limit: number, search?: string, sort?: string, sortOrder?: 'asc' | 'desc', ids?: string[] }): Promise<{ users: User[], totalCount: number }>;
  getWithdrawalsPaginated(params: { page: number, limit: number, search?: string, status?: string, ids?: string[], sort?: string }): Promise<{ withdrawals: Array<Withdrawal & { user: User }>, totalCount: number }>;
  bulkUpdateWithdrawalStatus(ids: string[], status: string, adminId: string): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }>;
  
  // System Config
  getSystemConfig(key: string): Promise<SystemConfig | undefined>;
  getAllSystemConfigs(): Promise<SystemConfig[]>;
  updateSystemConfig(key: string, value: any, adminId: string): Promise<SystemConfig | undefined>;
  createSystemConfig(config: InsertSystemConfig): Promise<SystemConfig>;

  // Chat messages methods
  createChatMessage(chatMessage: InsertChatMessage): Promise<ChatMessage>;
  getUserChatHistory(userId: string, limit?: number): Promise<ChatMessage[]>;

  // Engine B — CPA Tasks
  getEngineBTasks(): Promise<EngineBTask[]>;
  getEngineBTask(id: string): Promise<EngineBTask | undefined>;
  createEngineBTask(task: InsertEngineBTask): Promise<EngineBTask>;
  updateEngineBTask(id: string, updates: Partial<InsertEngineBTask>): Promise<EngineBTask | undefined>;
  deleteEngineBTask(id: string): Promise<void>;
  getEngineBTasksForUser(userId: string): Promise<Array<{ task: EngineBTask; record: EngineBRecord | null }>>;
  getEngineBRecord(userId: string, taskId: string): Promise<EngineBRecord | undefined>;
  createEngineBRecord(record: InsertEngineBRecord): Promise<EngineBRecord>;
  updateEngineBRecord(id: string, updates: Partial<InsertEngineBRecord>): Promise<EngineBRecord | undefined>;

  // HilltopAds configuration methods
  createHilltopAdsConfig(config: InsertHilltopAdsConfig): Promise<HilltopAdsConfig>;
  getHilltopAdsConfig(): Promise<HilltopAdsConfig | undefined>;
  updateHilltopAdsConfig(configId: string, updates: Partial<InsertHilltopAdsConfig>): Promise<HilltopAdsConfig | undefined>;

  // HilltopAds zones methods
  createHilltopAdsZone(zone: InsertHilltopAdsZone): Promise<HilltopAdsZone>;
  getHilltopAdsZones(): Promise<HilltopAdsZone[]>;
  getHilltopAdsZoneById(zoneId: string): Promise<HilltopAdsZone | undefined>;
  updateHilltopAdsZone(id: string, updates: Partial<InsertHilltopAdsZone>): Promise<HilltopAdsZone | undefined>;

  // HilltopAds statistics methods
  createHilltopAdsStat(stat: InsertHilltopAdsStat): Promise<HilltopAdsStat>;
  getHilltopAdsStats(zoneId?: string, startDate?: Date, endDate?: Date): Promise<HilltopAdsStat[]>;
  getTotalHilltopAdsRevenue(): Promise<string>;

  // Commission Logs (Referral System)
  createCommissionLog(log: InsertCommissionLog): Promise<CommissionLog>;
  getCommissionLogsByTriggerWithdrawal(withdrawalId: string): Promise<CommissionLog[]>;
  getCommissionLogsByBeneficiary(userId: string): Promise<CommissionLog[]>;

  // Withdrawals
  createWithdrawal(withdrawal: InsertWithdrawal): Promise<Withdrawal>;
  getWithdrawalsByUserId(userId: string, limit?: number, offset?: number): Promise<Withdrawal[]>;
  getCheckPendingWithdrawal(userId: string): Promise<Withdrawal | undefined>;
  processWithdrawal(withdrawalId: string, adminId: string, transactionId?: string): Promise<Withdrawal>;
  rejectWithdrawal(withdrawalId: string, adminId: string, reason: string): Promise<Withdrawal>;

  // Ranking System — legacy rank (Urdu names) removed; only userRankTier (E→S) remains
  setUserTrustStatus(userId: string, status: string, reason: string, adminId: string): Promise<User>;
  getRankHistory(userId: string): Promise<RankLog[]>;

  // Real-time Dashboard & Analytics
  getDashboardStats(userId: string): Promise<{
    totalEarnings: string;
    availableBalance: string;
    pendingBalance: string;
    todayEarnings: string;
    weeklyEarnings: string;
    monthlyEarnings: string;
    referralCount: number;
    referralEarnings: string;
    adsWatchedToday: number;
    adsWatchedTotal: number;
    dailyGoal: number;
    dailyGoalProgress: number;
  }>;
  getEarningsHistory(userId: string, period: 'week' | 'month' | 'year'): Promise<Array<{ date: string; amount: string }>>;
  getReferralLeaderboard(userId: string): Promise<Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    userRankTier: string;
    createdAt: Date | null;
    referredBy: string;
    totalEarnings: string | null;
    profilePicture: string | null;
    earningsFromUser: string;
    level: number;
  }>>;
  getTransactionHistory(userId: string, limit?: number): Promise<Array<{
    id: string;
    type: 'earning' | 'withdrawal' | 'commission';
    amount: string;
    status: string;
    date: Date;
    description: string;
  }>>;

  // Admin Features (Platinum Suite)
  getLeaderboardInsights(limit?: number, offset?: number, search?: string): Promise<{
    globalRanking: any[];
    topReferrers: any[];
    anomalies: any[];
    totalCount: number;
    lastUpdated: Date;
  }>;
  refreshLeaderboardCache(): Promise<void>;
  updateWithdrawalStatus(id: string, status: string, adminId: string, transactionId?: string, rejectionReason?: string): Promise<Withdrawal>;
  createAuditLog(log: InsertAuditLog, context?: RequestContext, tx?: any): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  getAuditLogsPaginated(params: {
    page: number;
    limit: number;
    search?: string;
    ids?: string[];
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    targetType?: string;
    targetId?: string;
    category?: string;
    action?: string;
    actorId?: string;
    ipAddress?: string;
  }): Promise<{ logs: any[]; totalCount: number }>;
  getDistinctAuditActions(category?: string): Promise<string[]>;
  createInternalNote(note: InsertInternalNote): Promise<InternalNote>;
  getInternalNotes(targetType: string, targetId: string): Promise<Array<InternalNote & { admin: { firstName: string, lastName: string } }>>;
  adjustUserBalance(userId: string, amount: string, type: 'add' | 'subtract', adminId: string, reason: string, creditIntent?: 'verified_deposit' | 'admin_credit', txPointsDelta?: number, context?: RequestContext): Promise<User>;
  getWithdrawalTimeframeBreakdowns(userId: string): Promise<{ today: any; thisWeek: any; thisMonth: any; last3Months: any; allTime: any }>;
  getProfitLedger(): Promise<any>;
  deleteUser(userId: string): Promise<void>;

  // Founder Profit Ledger
  createFounderWithdrawal(data: { amount: string; withdrawalDate: Date; description?: string; createdBy: string }): Promise<FounderWithdrawal>;
  getFounderWithdrawals(limit?: number, offset?: number): Promise<{ withdrawals: FounderWithdrawal[]; total: number }>;
  getFounderProfitSummary(): Promise<{
    totalProfitEarned: string;
    thisMonthProfitEarned: string;
    totalWithdrawnToPersonal: string;
    thisMonthWithdrawn: string;
    safeToWithdrawNow: string;
    monthlyBalance: string;
    isOverWithdrawn: boolean;
    overWithdrawnAmount: string;
    currentFeeRate: string | null;
    lastWithdrawalDate: string | null;
    daysSinceLastWithdrawal: number | null;
  }>;

  // System Health
  saveHealthSnapshot(data: Omit<HealthSnapshot, 'id' | 'recordedAt'>): Promise<HealthSnapshot>;
  getLatestHealthSnapshot(): Promise<HealthSnapshot | null>;
  getHealthHistory(hours?: number): Promise<HealthSnapshot[]>;

  // Financial Reconciliation
  getReconciliationData(params?: { limit?: number; offset?: number }): Promise<{
    totalUserBalances: string;
    activeUserBalances: string;
    frozenAccountLiability: string;
    realEarningsBacking: string;
    unverifiedCreditExposure: string;
    pendingWithdrawalLiability: string;
    withdrawalLiabilityBreakdown: { pending: string; approved: string; processing: string };
    netPlatformLiquidity: string;
    adminCreditDetails: Array<{
      id: string; userId: string; userName: string; adminName: string;
      amount: string; description: string; createdAt: string;
    }>;
    adminCreditTotalCount: number;
  }>;

  // Reclassify an admin_credit earning as a verified_deposit, or vice-versa (founder only).
  // Throws if the earning's current type does not match the expected source type for the toggle.
  reclassifyEarning(earningId: string, newType: 'verified_deposit' | 'admin_credit', adminId: string): Promise<{ userId: string }>;

  // Error event logging for health engine
  logErrorEvent(route: string, status: number, message?: string): Promise<void>;

  // Auth event logging for health engine (failed_auth_rate signal)
  logAuthEvent(email: string | undefined, success: boolean, reason?: string, ipAddress?: string | null): Promise<void>;

  // Extended metrics for dashboard cards
  getExtendedMetrics(): Promise<{
    pendingWithdrawalTotal: string;
    pendingWithdrawalCount: number;
    oldestPendingDays: number | null;
    unverifiedCreditTotal: string;
    unverifiedCreditCount: number;
    userGrowthThisWeek: number;
    userGrowthLastWeek: number;
    userGrowthRate: number;
    networkL1Total: number;
    totalReferrals: number;
    totalCommissionsPaid: string;
    teamActivity24h: number;
    teamActivityAvg7d: number;
    mostActiveTeamMember: string | null;
    totalUsers: number;
  }>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  clearAllNotifications(userId: string): Promise<void>;

  // Device Fingerprinting & Email Verification
  createDeviceFingerprint(data: InsertDeviceFingerprint): Promise<DeviceFingerprint>;
  getAccountCountByFingerprint(fingerprintHash: string): Promise<number>;
  updateDeviceFingerprintLastSeen(userId: string, fingerprintHash: string): Promise<void>;
  markUserEmailVerified(userId: string): Promise<void>;

  // Risk Case Management
  listRiskCases(filters?: {
    severity?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ cases: Array<RiskCase & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'avatar' | 'userRankTier' | 'profilePicture'> }>; total: number; severityCounts: { Critical: number; High: number; Medium: number; Low: number } }>;
  getRiskCase(id: string): Promise<(RiskCase & { user: User }) | undefined>;
  updateRiskCase(id: string, updates: {
    status?: string;
    assignedTo?: string | null;
    notes?: string;
    notesBy?: string | null;
    notesUpdatedAt?: Date;
    resolvedBy?: string;
    resolvedAt?: Date;
    resolution?: string;
  }): Promise<RiskCase>;

  // Score History
  saveScoreHistory(entry: InsertScoreHistory): Promise<ScoreHistory>;
  getScoreHistory(userId: string, limit?: number): Promise<ScoreHistory[]>;

  // Risk signal feedback loop — which signals actually predict confirmed fraud
  getRiskSignalStats(): Promise<Array<{
    signal: string;
    timesTriggered: number;
    actioned: number;
    cleared: number;
    precision: number | null;
  }>>;

  // ── THORX v3 (spec E.9): Guild discovery, applications, captain DM, roster ──
  getGuildDiscoveryList(): Promise<any[]>;
  getGuildApplicationStatus(userId: string): Promise<any>;
  applyToGuildWithCoverLetter(guildId: string, userId: string, coverLetter: string): Promise<any>;
  decideGuildApplication(guildId: string, applicationId: string, captainId: string, action: 'accept' | 'reject', rejectionReason?: string): Promise<any>;
  getGuildWeeklyHistory(guildId: string): Promise<any[]>;
  getGuildRosterForCaptain(guildId: string): Promise<any[]>;
  nudgeGuildMember(guildId: string, captainId: string, memberUserId: string): Promise<void>;
  setGuildMemberMvp(guildId: string, captainId: string, memberUserId: string): Promise<void>;
  getCaptainMessageThread(guildId: string, userId1: string, userId2: string): Promise<any[]>;
  sendCaptainMessage(guildId: string, fromUserId: string, toUserId: string, message: string): Promise<any>;
  prepareWeeklyTaskCompletion(userId: string, guildId: string, taskId: string): Promise<{ record: any; task: any }>;
  completeWeeklyTaskAtomic(userId: string, guildId: string, taskId: string): Promise<{ record: any; task: any; earnResult: any }>;
  getActivityFeedEvents(limit: number, eventType?: string): Promise<any[]>;

  // ── THORX v3 (spec E.9): Withdrawal preview & referral cash ──────────────
  previewWithdrawal(userId: string, points: number): Promise<any>;
  getReferralCashBalance(userId: string): Promise<{ balanceCashPkr: string; totalEarnedAllTime: string; referralCount: number }>;
  createReferralCashWithdrawal(userId: string, amount: number, method: string, accountName: string, accountNumber: string, accountDetails: any): Promise<any>;

  // ── THORX v3 (spec E.9): Admin ops ────────────────────────────────────────
  adminValidateLedger(userIdOrEmail: string): Promise<LedgerValidationResult>;
  adminValidateLedgerScan(limit?: number, offset?: number): Promise<{
    scanned: number; flagged: number; critical: LedgerValidationResult[]; warnings: LedgerValidationResult[]; checkedAt: string;
  }>;
  adminAdjustUserPS(userId: string, delta: number, reason: string, adminId: string): Promise<User>;
  adminAdjustGuildGPS(guildId: string, delta: number, reason: string, adminId: string): Promise<any>;
  adminReassignCaptain(guildId: string, newCaptainUserId: string, adminId: string): Promise<any>;
  adminAddGuildMember(guildId: string, targetUserId: string, adminId: string): Promise<void>;
  adminSetAssistantCaptain(guildId: string, memberId: string, adminId: string): Promise<any>;
  adminRemoveAssistantCaptain(guildId: string, adminId: string): Promise<any>;
  adminSetGuildWeeklyTarget(guildId: string, weeklyTarget: number, adminId: string): Promise<any>;
  adminBulkSetWeeklyTargetsByRank(targets: Partial<Record<GuildRankTier, number>>, adminId: string): Promise<Record<string, number>>;
  // ── Bulk guild admin operations ──────────────────────────────────────────
  adminBulkSetGuildStatus(guildIds: string[], status: "active" | "frozen" | "disbanded", adminId: string): Promise<{ updated: number; failed: Array<{ guildId: string; reason: string }> }>;
  adminBulkMessageGuilds(guildIds: string[], message: string, adminId: string): Promise<string[]>;
  // ── Guild target difficulty ───────────────────────────────────────────────
  adminSetGuildTargetDifficulty(guildId: string, difficulty: "low" | "medium" | "high", adminId: string): Promise<any>;
  // ── Ecosystem-wide KPI stats ─────────────────────────────────────────────
  getGuildEcosystemStats(): Promise<{ totalGuilds: number; active: number; frozen: number; disbanded: number; totalWeeklyBonusPoolPkr: string; avgGps: number }>;
  updateGuildSettings(guildId: string, captainId: string, settings: { name?: string; description?: string; minRankRequired?: string; recruitmentOpen?: boolean; isPublic?: boolean; pinnedMemberId?: string | null; avatarUrl?: string; }): Promise<any>;
  postGuildAnnouncement(guildId: string, captainId: string, text: string): Promise<any>;
  clearGuildAnnouncement(guildId: string, captainId: string): Promise<any>;
  adminGetInactiveCaptains(inactiveDays?: number): Promise<any[]>;
  adminGetDormantGuilds(inactiveDays?: number): Promise<any[]>;
  adminGetReferralStats(): Promise<any>;
  adminGetReferralLeaderboard(limit?: number): Promise<any[]>;
}

// Legacy rank names kept as a frozen list for audit log compatibility only.
// The legacy Urdu-named rank system (Nawa Aya → Chacha Supreme) has been removed.
// Only userRankTier (E-Rank → S-Rank, PS-based) is used going forward.
export const RANK_NAMES: string[] = [];

// Canonical system_config seed list — single source of truth for both the
// boot-time seeder (below) and the admin PATCH route's known-key check
// (routes.ts `/api/admin/config/:key`). Ranks & Engine Config audit
// (2026-07-29): several admin panels previously edited key names that did
// not match any of these entries, so saves silently created orphan rows
// that no engine ever read. Any admin UI must use one of these exact keys.
export const SYSTEM_CONFIG_DEFAULTS = [
      { key: "MIN_PAYOUT", value: 100, description: "Minimum PKR required for withdrawal" },
      { key: "WITHDRAWAL_FEE_PCT", value: 15, description: "Total percentage fee deducted from every payout" },
      { key: "PAYOUT_SLA_HOURS", value: 48, description: "Hours an admin has to action a pending withdrawal before Payout Control's deadtime countdown shows EXPIRED" },
      { key: "REFERRAL_FEE_SHARE_PCT", value: 50, description: "Share of the withdrawal fee (above) carved out to the withdrawing user's direct referrer; the rest stays with the platform" },
      { key: "CONVERSION_RATE", value: 1000, description: "TX-Points per Rs.10 earned (formula: pkr÷10×rate → effective 100 pts per Rs.1 at default 1000; global fallback — per-engine keys take precedence)" },
      { key: "DAILY_EARNINGS_GOAL_PKR", value: 50, description: "Lifetime-earnings progress bar target shown in User Portal (PKR). Adjust to set the milestone threshold." },
      // ── Per-Engine TX-Points illusion ratios (Spec §1.1) ─────────────────
      { key: "ENGINE_A_PKR_TO_POINTS_RATIO", value: 1000, description: "Engine A (Ad Slots): TX-Points credited per 1.00 PKR of user share" },
      { key: "ENGINE_A_ILLUSION_VARIANCE_PCT", value: 10, description: "Engine A: ±variance % applied to Thorx Card draw (10 = ±10%)" },
      { key: "ENGINE_B_PKR_TO_POINTS_RATIO", value: 1000, description: "Engine B (CPA/Tasks): TX-Points per 1.00 PKR" },
      { key: "ENGINE_B_ILLUSION_VARIANCE_PCT", value: 10, description: "Engine B: ±variance %" },
      { key: "ENGINE_C_PKR_TO_POINTS_RATIO", value: 1000, description: "Engine C (Guild): TX-Points per 1.00 PKR" },
      { key: "ENGINE_C_ILLUSION_VARIANCE_PCT", value: 10, description: "Engine C: ±variance %" },
      // ── Per-Ad-Player overrides (ENGINE_A only) ────────────────────────────
      { key: "ENGINE_A_PLAYERS_JSON", value: "[]", description: "JSON array of {id,name,pkrToPointsRatio,variancePct} for Engine A ad players; overrides ENGINE_A_PKR_TO_POINTS_RATIO when matched" },
      { 
        key: "AD_NETWORKS", 
        value: [
          { id: "hilltop-1", name: "HilltopAds", zoneId: "default", type: "video", priority: 1, isActive: true },
          { id: "adsterra-1", name: "Adsterra", zoneId: "default", type: "video", priority: 2, isActive: true }
        ], 
        description: "Waterfall priority list for Video Ad Providers" 
      },
      { 
        key: "CPA_NETWORKS", 
        value: [
          { id: "cpalead-1", name: "CPALead", apiKey: "default", type: "cpa", priority: 1, isActive: true }
        ], 
        description: "Waterfall priority list for CPA Task Providers" 
      },
      // ── THORX v3 — Engine Splits (Part J) ────────────────────────────────
      // Note: Engine C never pays the user an immediate PKR share (100% of the
      // gross is split between Thorx cut / guild pool / bonus pool below), so
      // there is no "ENGINE_C_USER_CUT_PCT" — deliberately omitted (Ranks &
      // Engine Config audit, 2026-07-29: a prior seeded copy of that key, plus
      // ENGINE_A/B_USER_CUT_PCT, were dead — never read by recordEarnEvent,
      // which derives the user cut as 100 - thorxCutPct instead).
      { key: "ENGINE_A_THORX_CUT_PCT", value: 40, description: "Engine A (video ads): Thorx profit cut % (user keeps 100 - this)" },
      { key: "ENGINE_B_THORX_CUT_PCT", value: 40, description: "Engine B (CPA offers): Thorx profit cut % (user keeps 100 - this)" },
      { key: "ENGINE_C_THORX_CUT_PCT", value: 15, description: "Engine C (guild tasks): Thorx direct profit cut %" },
      { key: "ENGINE_C_GUILD_POOL_PCT", value: 80, description: "Engine C: % locked in the guild weekly bonus pool (distributed Sunday)" },
      { key: "ENGINE_C_BONUS_PCT", value: 5, description: "Engine C: % added to bonus pool — paid to guild on target hit, otherwise goes to treasury" },
      // ── Thorx Card ────────────────────────────────────────────────────────
      // Base variance bounds are derived per-engine from ENGINE_{A,B,C}_ILLUSION_VARIANCE_PCT
      // above (min = 1 - pct/100, max = 1 + pct/100) — there is no separate global
      // CARD_VARIANCE_MIN/MAX; a previously-seeded pair of those keys was dead
      // (never read by drawThorxCard's caller) and has been removed.
      { key: "A_RANK_CARD_BONUS_PCT", value: 5, description: "A-Rank: expand card variance bounds by ±N%" },
      { key: "S_RANK_CARD_BONUS_PCT", value: 10, description: "S-Rank: expand card variance bounds by ±N%" },
      // ── PS System ─────────────────────────────────────────────────────────
      { key: "PS_ENGINE_A_REWARD", value: 5, description: "PS awarded per Engine A task" },
      { key: "PS_ENGINE_B_REWARD", value: 25, description: "PS awarded per Engine B task" },
      { key: "PS_ENGINE_C_REWARD", value: 15, description: "PS awarded per Engine C task" },
      { key: "PS_STREAK_DAY1", value: 5, description: "PS streak bonus, day 1" },
      { key: "PS_STREAK_DAY2", value: 10, description: "PS streak bonus, day 2" },
      { key: "PS_STREAK_DAY3_PLUS", value: 20, description: "PS streak bonus, day 3+" },
      { key: "PS_INACTIVITY_PENALTY", value: 10, description: "Daily PS deduction when a user is inactive" },
      { key: "PS_INACTIVITY_HOURS", value: 48, description: "Hours of inactivity before the penalty starts" },
      { key: "PS_RANK_E_MAX", value: 999, description: "PS upper bound for E-Rank" },
      { key: "PS_RANK_D_MIN", value: 1000, description: "PS lower bound for D-Rank" },
      { key: "PS_RANK_D_MAX", value: 2999, description: "PS upper bound for D-Rank" },
      { key: "PS_RANK_C_MIN", value: 3000, description: "PS lower bound for C-Rank" },
      { key: "PS_RANK_C_MAX", value: 5999, description: "PS upper bound for C-Rank" },
      { key: "PS_RANK_B_MIN", value: 6000, description: "PS lower bound for B-Rank" },
      { key: "PS_RANK_B_MAX", value: 9999, description: "PS upper bound for B-Rank" },
      { key: "PS_RANK_A_MIN", value: 10000, description: "PS lower bound for A-Rank" },
      { key: "PS_RANK_A_MAX", value: 19999, description: "PS upper bound for A-Rank" },
      { key: "PS_RANK_S_MIN", value: 20000, description: "PS lower bound for S-Rank" },
      // ── GPS System ────────────────────────────────────────────────────────
      { key: "GPS_MEMBER_POINTS_PCT", value: 10, description: "% of a member's earned points that also count toward guild GPS" },
      { key: "GPS_MILESTONE_BONUS", value: 1000, description: "GPS bonus on a successful weekly target" },
      { key: "GPS_MVP_BONUS", value: 200, description: "GPS bonus when a captain sets a weekly MVP" },
      { key: "GPS_RANK_E_MAX", value: 9999, description: "GPS upper bound for E-Rank guilds" },
      { key: "GPS_RANK_D_MIN", value: 10000, description: "GPS lower bound for D-Rank guilds" },
      { key: "GPS_RANK_D_MAX", value: 29999, description: "GPS upper bound for D-Rank guilds" },
      { key: "GPS_RANK_C_MIN", value: 30000, description: "GPS lower bound for C-Rank guilds" },
      { key: "GPS_RANK_C_MAX", value: 69999, description: "GPS upper bound for C-Rank guilds" },
      { key: "GPS_RANK_B_MIN", value: 70000, description: "GPS lower bound for B-Rank guilds" },
      { key: "GPS_RANK_B_MAX", value: 149999, description: "GPS upper bound for B-Rank guilds" },
      { key: "GPS_RANK_A_MIN", value: 150000, description: "GPS lower bound for A-Rank guilds" },
      { key: "GPS_RANK_A_MAX", value: 299999, description: "GPS upper bound for A-Rank guilds" },
      { key: "GPS_RANK_S_MIN", value: 300000, description: "GPS lower bound for S-Rank guilds" },
      // ── Guild Weekly Targets (by rank) ───────────────────────────────────
      { key: "WEEKLY_TARGET_E_RANK", value: 20000, description: "Default weekly points target, E-Rank guilds" },
      { key: "WEEKLY_TARGET_D_RANK", value: 50000, description: "Default weekly points target, D-Rank guilds" },
      { key: "WEEKLY_TARGET_C_RANK", value: 100000, description: "Default weekly points target, C-Rank guilds" },
      { key: "WEEKLY_TARGET_B_RANK", value: 200000, description: "Default weekly points target, B-Rank guilds" },
      { key: "WEEKLY_TARGET_A_RANK", value: 350000, description: "Default weekly points target, A-Rank guilds" },
      { key: "WEEKLY_TARGET_S_RANK", value: 500000, description: "Default weekly points target, S-Rank guilds" },
      // ── Guild Reset ───────────────────────────────────────────────────────
      { key: "GUILD_CAPTAIN_POOL_SHARE", value: 30, description: "% of the Sunday bonus pool paid to the captain" },
      { key: "GUILD_MEMBER_POOL_SHARE", value: 70, description: "% of the Sunday bonus pool split among members proportionally" },
      { key: "GUILD_TREASURY_BONUS_PCT", value: 20, description: "Treasury bonus added on top of the pool when guild hits 100% target (e.g. 20 = +20% bonus from THORX treasury)" },
      // ── Referral Earn Commission ─────────────────────────────────────────
      { key: "REFERRAL_EARN_PCT", value: 1, description: "% of gross PKR credited to direct referrer on every earn event (Engine A/B/C). Separate from the withdrawal-based referral fee." },
      // ── Dynamic Economy Multiplier ────────────────────────────────────────
      { key: "ECONOMY_MULTIPLIER_ENABLED", value: true, description: "Enable auto-computed economy multiplier based on platform revenue trends" },
      { key: "ECONOMY_MULTIPLIER_MIN", value: 0.7, description: "Minimum economy multiplier (floor)" },
      { key: "ECONOMY_MULTIPLIER_MAX", value: 1.5, description: "Maximum economy multiplier (ceiling)" },
      // ── Activity Feed ─────────────────────────────────────────────────────
      { key: "FEED_RETENTION_DAYS", value: 30, description: "Days to retain activity_feed rows" },
      // ── Ad Engine ─────────────────────────────────────────────────────────────
      { key: "MAX_ADS_PER_DAY", value: 20, description: "Maximum ad views a user can earn from per day" },
      // ── Risk Engine ───────────────────────────────────────────────────────────
      { key: "RISK_CASHOUT_WINDOW_HOURS", value: 1, description: "Cash-out velocity signal: withdrawals within this many hours of earning trigger risk points" },
      // System Settings audit (2026-07-29): these keys are genuinely read by
      // refreshLeaderboardCache() (SCORE_WEIGHT_*/SCORE_COHORT_DISCOUNT_DAYS)
      // and risk-engine.ts (RISK_VELOCITY_THRESHOLD/RISK_BOT_EARNINGS_PER_REF)
      // with getSystemConfigValue() fallbacks, and the "Performance & Risk
      // Scoring" admin panel writes them — but they were never added here, so
      // KNOWN_SYSTEM_CONFIG_KEYS (derived from this list) incorrectly flagged
      // every save from that panel as "unknown key" and they were never
      // bootstrap-seeded into system_config. Defaults below must match the
      // fallback literals at the read sites exactly.
      { key: "SCORE_WEIGHT_EARNINGS", value: 0.40, description: "Performance Score weight: earnings component (0-1, should sum to 1 with the other 3 weights)" },
      { key: "SCORE_WEIGHT_TEAM", value: 0.30, description: "Performance Score weight: team/referral component" },
      { key: "SCORE_WEIGHT_ACTIVE", value: 0.15, description: "Performance Score weight: activity component" },
      { key: "SCORE_WEIGHT_HEALTH", value: 0.15, description: "Performance Score weight: account health component" },
      { key: "SCORE_COHORT_DISCOUNT_DAYS", value: 14, description: "Accounts younger than this many days get a 30% Health Score discount to prevent day-1 gaming" },
      { key: "RISK_VELOCITY_THRESHOLD", value: 5000, description: "Risk Engine: PKR earned within 24h above this triggers an earnings-velocity risk signal" },
      { key: "RISK_BOT_EARNINGS_PER_REF", value: 100, description: "Risk Engine: PKR earned per referral above this triggers a bot-network risk signal" },
      // Audit finding (Risk Watchlist, 2026-07-30): RISK_TASK_SPEED_SECONDS
      // removed — it configured a "Task Completion Speed" risk signal that was
      // permanently retired (always 0) once the daily_tasks system was removed.
      // The admin control and risk-engine.ts read site are both gone; any
      // pre-existing row was deleted directly from system_config (one-time,
      // no schema change — this is a plain key/value data row, not a table).
      {
        key: "AD_INVENTORY_JSON",
        value: JSON.stringify([
          { id: "video_standard",   reward: "0.25", duration: 30, type: "video",     label: "Standard Video" },
          { id: "video_premium",    reward: "0.50", duration: 60, type: "video",     label: "Premium Video" },
          { id: "banner_standard",  reward: "0.05", duration:  5, type: "banner",    label: "Banner" },
          { id: "ad_004",           reward: "0.10", duration: 10, type: "pop_under", label: "Pop-Under" },
          { id: "hilltop_fallback", reward: "0.02", duration:  5, type: "network",   label: "Network Fallback" },
        ]),
        description: "JSON array of ad inventory items {id,reward,duration,type,label}; admin-editable at runtime",
      },
    ] as const;

/** Fast lookup set built once from {@link SYSTEM_CONFIG_DEFAULTS} — used by the
 * admin config PATCH route to flag keys that don't match any known setting. */
export const KNOWN_SYSTEM_CONFIG_KEYS: ReadonlySet<string> = new Set(SYSTEM_CONFIG_DEFAULTS.map(d => d.key));

export class DatabaseStorage implements IStorage {
  /** Epoch-ms timestamp of the last successful leaderboard cache refresh. */
  private _leaderboardLastRefreshedMs = 0;

  constructor() {
    this.bootstrapConfig().catch(err => {
      logger.error({ err }, "Critical: Failed to bootstrap system configuration");
    });
  }

  private async bootstrapConfig() {
    const defaults = SYSTEM_CONFIG_DEFAULTS;

    // R-18: Single bulk upsert — only inserts keys that don't already exist.
    // Replaces 57 sequential read+insert pairs (114 round-trips) with one query.
    // onConflictDoNothing relies on the unique constraint on system_config.key.
    await db.insert(systemConfig)
      .values(defaults.map(def => ({
        key: def.key,
        value: def.value,
        description: def.description,
        updatedAt: new Date(),
      })))
      .onConflictDoNothing();
    logger.info({ count: defaults.length }, '[Bootstrap] system_config batch-seeded (skipped existing keys)');
  }

  // System config helper implementation
  async getSystemConfigValue<T>(key: string, defaultValue: T): Promise<T> {
    const config = await this.getSystemConfig(key);
    if (!config) return defaultValue;
    return config.value as T;
  }

  async setSystemConfigValue(key: string, value: any): Promise<void> {
    await db.update(systemConfig)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemConfig.key, key));
  }

  // Thorx Card Sandbox audit fix: resolves the SAME live System Settings keys
  // that recordEarnEvent() reads for the per-engine ratio/variance/split, so
  // the admin simulation tool always mirrors production unless an admin
  // explicitly supplies an override for "what-if" testing. Before this fix,
  // the sandbox route hardcoded conversionRate=1000 / variance 0.80-1.20 /
  // thorxCut 40-60 as request defaults that the client never overrode — so
  // changing any of these in System Settings silently had zero effect on the
  // sandbox's preview, defeating its stated purpose. Deliberately duplicated
  // (not shared) from recordEarnEvent's inline resolution to avoid touching
  // that financial-critical code path.
  async getThorxCardEngineConfig(engineType: "A" | "B" | "C"): Promise<{
    conversionRate: number;
    varianceMin: number;
    varianceMax: number;
    aRankBonusPct: number;
    sRankBonusPct: number;
    thorxCutPct: number;
    userCutPct: number;
    guildPoolPct: number;
    bonusPct: number;
  }> {
    const engineKey = `ENGINE_${engineType}`;
    const [
      globalConversionRate,
      perEngineRatio,
      illusionVariancePct,
      aRankBonusPct,
      sRankBonusPct,
      thorxCutPct,
      guildPoolPct,
      bonusPct,
    ] = await Promise.all([
      this.getSystemConfigValue<number>("CONVERSION_RATE", 1000),
      this.getSystemConfigValue<number | null>(`${engineKey}_PKR_TO_POINTS_RATIO`, null),
      this.getSystemConfigValue<number>(`${engineKey}_ILLUSION_VARIANCE_PCT`, 10),
      this.getSystemConfigValue<number>("A_RANK_CARD_BONUS_PCT", 5),
      this.getSystemConfigValue<number>("S_RANK_CARD_BONUS_PCT", 10),
      engineType === "C"
        ? this.getSystemConfigValue<number>("ENGINE_C_THORX_CUT_PCT", 15)
        : this.getSystemConfigValue<number>(`${engineKey}_THORX_CUT_PCT`, 40),
      engineType === "C" ? this.getSystemConfigValue<number>("ENGINE_C_GUILD_POOL_PCT", 80) : Promise.resolve(0),
      engineType === "C" ? this.getSystemConfigValue<number>("ENGINE_C_BONUS_PCT", 5) : Promise.resolve(0),
    ]);
    const conversionRate = perEngineRatio ?? globalConversionRate;
    const varianceMin = Math.max(0.01, 1 - illusionVariancePct / 100);
    const varianceMax = Math.max(varianceMin, 1 + illusionVariancePct / 100);
    // Engine C routes 0% to the user's immediate balance (pool-based, Sunday payout).
    const userCutPct = engineType === "C" ? 0 : 100 - thorxCutPct;
    return { conversionRate, varianceMin, varianceMax, aRankBonusPct, sRankBonusPct, thorxCutPct, userCutPct, guildPoolPct, bonusPct };
  }

  // Legacy registration methods
  async createRegistration(insertRegistration: InsertRegistration): Promise<Registration> {
    // This method is kept for backward compatibility but not used in new system
    const id = randomUUID();
    const referralCode = this.generateReferralCode();
    const registration: Registration = {
      ...insertRegistration,
      id,
      referralCode
    };
    return registration;
  }

  async getRegistrationByEmail(email: string): Promise<Registration | undefined> {
    // This method is kept for backward compatibility but not used in new system
    return undefined;
  }

  // User management methods
  async createUser(insertUser: InsertUser & { id?: string }): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.passwordHash, 10);
    const referralCode = this.generateReferralCode();
    const { name, ...safeUserFields } = insertUser as any;
    const userData: any = { ...safeUserFields, passwordHash: hashedPassword, referralCode };
    if (insertUser.id) { userData.id = insertUser.id; }
    // Give every fresh account a name-appropriate avatar from the very first
    // render instead of the schema default ("default" -> always avatar-1).
    if (!userData.avatar || userData.avatar === "default") {
      const nameForAvatar = name || `${safeUserFields.firstName || ""} ${safeUserFields.lastName || ""}`.trim();
      userData.avatar = pickAvatarIdForName(nameForAvatar);
    }

    const user = await db.transaction(async (tx) => {
      if (insertUser.referredBy) {
        const [referrer] = await tx.select().from(users).where(eq(users.id, insertUser.referredBy)).for("update");
        if (!referrer) throw new Error("Invalid referral code: referrer does not exist");
        if (insertUser.id && referrer.referredBy === insertUser.id) throw new Error("Circular referral detected");
      }
      const [newUser] = await tx.insert(users).values(userData).returning();
      if (insertUser.referredBy) {
        await tx.insert(referrals).values({
          referrerId: insertUser.referredBy,
          referredId: newUser.id,
          status: "active",
          tier: 1,
          totalEarned: "0.00",
        });
      }
      return newUser;
    });
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.getUserById(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, referralCode));
    return user;
  }

  async validateUserPassword(email: string, password: string): Promise<User | undefined> {
    const user = await this.getUserByEmail(email);
    if (!user) return undefined;

    try {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      return isValid ? user : undefined;
    } catch (error) {
      logger.error({ err: error, email }, "Bcrypt comparison failed");
      return undefined;
    }
  }

  async updateUser(userId: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }

  async generatePasswordResetToken(email: string): Promise<string | undefined> {
    const user = await this.getUserByEmail(email);
    if (!user) return undefined;

    const token = randomUUID();

    await db
      .update(users)
      .set({
        verificationToken: token,
        verificationTokenExpiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour TTL
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id));

    return token;
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.verificationToken, token),
          // Only accept tokens that haven't expired (or have no expiry for legacy rows)
          or(
            sql`verification_token_expires_at IS NULL`,
            sql`verification_token_expires_at > NOW()`
          )
        )
      );

    if (!user) return false;

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({
        passwordHash: hashedPassword,
        verificationToken: null, // clear token after use
        verificationTokenExpiresAt: null, // clear expiry
        updatedAt: new Date()
      })
      .where(eq(users.id, user.id));

    return true;
  }

  async updateUserEarnings(userId: string, amount: string, toPending: boolean = false, tx?: any): Promise<void> {
    // 1.3a: Accept an optional outer transaction so callers that already hold
    // a db.transaction() can thread it through — keeping the balance mutation
    // and any surrounding reads fully atomic.
    const dbc = tx ?? db;
    const updateObj: Record<string, any> = {
      totalEarnings: sql`${users.totalEarnings} + ${amount}`,
      updatedAt: new Date(),
    };

    if (toPending) {
      updateObj.pendingBalance = sql`${users.pendingBalance} + ${amount}`;
    } else {
      updateObj.availableBalance = sql`${users.availableBalance} + ${amount}`;
    }

    await dbc
      .update(users)
      .set(updateObj)
      .where(eq(users.id, userId));

  }

  async releasePendingBalance(userId: string, amount: string): Promise<void> {
    await db
      .update(users)
      .set({
        pendingBalance: sql`${users.pendingBalance} - ${amount}`,
        availableBalance: sql`${users.availableBalance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // Earnings methods
  async createEarning(insertEarning: InsertEarning): Promise<Earning> {
    return await db.transaction(async (tx) => {
      const [earning] = await tx.insert(earnings).values(insertEarning).returning();

      const toPending = insertEarning.status === 'pending';
      const updateObj: Record<string, any> = {
        totalEarnings: sql`${users.totalEarnings} + ${insertEarning.amount}`,
        updatedAt: new Date(),
      };

      if (toPending) {
        updateObj.pendingBalance = sql`${users.pendingBalance} + ${insertEarning.amount}`;
      } else {
        updateObj.availableBalance = sql`${users.availableBalance} + ${insertEarning.amount}`;
      }

      await tx.update(users).set(updateObj).where(eq(users.id, insertEarning.userId));

      return earning;
    });
  }

  async getUserEarnings(userId: string, limit = 50): Promise<Earning[]> {
    return await db
      .select()
      .from(earnings)
      .where(eq(earnings.userId, userId))
      .orderBy(desc(earnings.createdAt))
      .limit(limit);
  }

  async getUserTotalEarnings(userId: string): Promise<string> {
    const [result] = await db
      .select({ total: sql<string>`COALESCE(SUM(${earnings.amount}), '0.00')` })
      .from(earnings)
      .where(eq(earnings.userId, userId));

    return result?.total || "0.00";
  }

  // Real (non-synthetic) earnings breakdown by engine, sourced directly from
  // the immutable user_transactions ledger — used by the User Portal's
  // "Earnings Breakdown" pie chart so it never shows fabricated splits.
  // Engine A / Engine B: sum the user's actual PKR share (realPkrValue).
  // Engine C (Guild Pool): realPkrValue is always 0 for these rows (no
  // immediate payout — see recordEarnEvent), so the real contribution lives
  // in guildPoolPkr instead.
  async getEarningsBreakdown(userId: string): Promise<{ engineA: string; engineB: string; guildPool: string }> {
    const [rows] = await db
      .select({
        engineA: sql<string>`COALESCE(SUM(${userTransactions.realPkrValue}) FILTER (WHERE ${userTransactions.engineType} = 'Engine_A'), 0)`,
        engineB: sql<string>`COALESCE(SUM(${userTransactions.realPkrValue}) FILTER (WHERE ${userTransactions.engineType} = 'Engine_B'), 0)`,
        guildPool: sql<string>`COALESCE(SUM(${userTransactions.guildPoolPkr}) FILTER (WHERE ${userTransactions.engineType} = 'Engine_C'), 0)`,
      })
      .from(userTransactions)
      .where(eq(userTransactions.userId, userId));

    return {
      engineA: new Decimal(rows?.engineA ?? 0).toFixed(4),
      engineB: new Decimal(rows?.engineB ?? 0).toFixed(4),
      guildPool: new Decimal(rows?.guildPool ?? 0).toFixed(4),
    };
  }

  // ── Guild Vault & Points Ledger: shared earn-event pipeline ────────────────
  // Every PKR-earning action (ad views today; CPA/daily-task payouts if they
  // ever pay PKR directly in future) must flow through here rather than
  // calling createEarning() directly, so the points ledger and guild vault
  // split stay in sync with the user's spendable balance. See design notes
  // in shared/schema.ts above the guilds/pointsLedger tables.
  private async getActiveGuildMembershipTx(
    tx: any,
    userId: string
  ): Promise<{ membership: GuildMember; guild: Guild } | undefined> {
    const [row] = await tx
      .select({ membership: guildMembers, guild: guilds })
      .from(guildMembers)
      .innerJoin(guilds, eq(guildMembers.guildId, guilds.id))
      .where(and(eq(guildMembers.userId, userId), eq(guildMembers.status, "active")))
      .limit(1);
    return row;
  }

  // THORX v3 (spec Part E.6) — complete rewrite. Engine-specific PKR split,
  // Thorx Card randomized display draw, immutable user_transactions ledger
  // entry (the sole basis for withdrawal math — Appendix A invariants #1/#2),
  // PS award + streak + rank-tier check, and a live feed event. Replaces the
  // old points_ledger / guild_vault_ledger split entirely for new earn events.
  async recordEarnEvent(params: {
    userId: string;
    engineType: "Engine_A" | "Engine_B" | "Engine_C" | "Indirect";
    grossPkr: string | number; // from network/task config — string preferred (Decimal-safe)
    sourceId: string; // ad_view.id or task_record.id
    sourceType: "ad_view" | "weekly_task" | "daily_task" | "engine_b_task";
    guildId?: string; // required for Engine_C
    tx?: any; // optional outer transaction — when provided, no inner db.transaction() is opened
  }): Promise<{ success: boolean; pointsCredited: number; realPkrValue: string; earning?: Earning }> {
    const [
      engineAThorxCutPct,
      engineBThorxCutPct,
      engineCThorxCutPct,
      engineCGuildPoolPct,
      engineCBonusPct,
      globalConversionRate,
      engineAPlayersJson,
      referralEarnPct,
      economyEnabled,
      economyOverrideRaw,
    ] = await Promise.all([
      this.getSystemConfigValue<number>("ENGINE_A_THORX_CUT_PCT", 40),
      this.getSystemConfigValue<number>("ENGINE_B_THORX_CUT_PCT", 40),
      this.getSystemConfigValue<number>("ENGINE_C_THORX_CUT_PCT", 15),  // 15% Thorx (was 20)
      this.getSystemConfigValue<number>("ENGINE_C_GUILD_POOL_PCT", 80), // 80% main pool (was 35)
      this.getSystemConfigValue<number>("ENGINE_C_BONUS_PCT", 5),       // 5% bonus pool (new)
      this.getSystemConfigValue<number>("CONVERSION_RATE", DEFAULT_CONVERSION_RATE),
      this.getSystemConfigValue<string>("ENGINE_A_PLAYERS_JSON", "[]"),
      this.getSystemConfigValue<number>("REFERRAL_EARN_PCT", 1),
      this.getSystemConfigValue<boolean>("ECONOMY_MULTIPLIER_ENABLED", true),
      this.getSystemConfigValue<number | null>("ECONOMY_MULTIPLIER_OVERRIDE", null),
    ]);

    // Resolve per-engine ratio + variance (Spec §1.1 / §16.2).
    // Priority: per-ad-player override → per-engine key → global CONVERSION_RATE fallback.
    let conversionRate = globalConversionRate;
    let illusioncVariancePct = 10; // default ±10%
    const engineKey = params.engineType.replace("Engine_", "ENGINE_");
    if (params.engineType === "Engine_A" && (params as any).adNetworkId) {
      try {
        const players = JSON.parse(engineAPlayersJson) as Array<{ id: string; pkrToPointsRatio: number; variancePct: number }>;
        const matched = players.find(p => p.id === (params as any).adNetworkId);
        if (matched) { conversionRate = matched.pkrToPointsRatio; illusioncVariancePct = matched.variancePct; }
      } catch { /* malformed JSON — fall through to per-engine key */ }
    }
    if (conversionRate === globalConversionRate) {
      // No per-player match; try per-engine key
      const [perEngineRatio, perEngineVariance] = await Promise.all([
        this.getSystemConfigValue<number>(`${engineKey}_PKR_TO_POINTS_RATIO`, globalConversionRate),
        this.getSystemConfigValue<number>(`${engineKey}_ILLUSION_VARIANCE_PCT`, 10),
      ]);
      conversionRate = perEngineRatio;
      illusioncVariancePct = perEngineVariance;
    }

    // Convert illusion variance % (e.g. 10) to min/max multiplier bounds (e.g. 0.90 / 1.10).
    // A-Rank and S-Rank users get an additional bonus to their bounds.
    const baseVarianceMin = 1 - illusioncVariancePct / 100;
    const baseVarianceMax = 1 + illusioncVariancePct / 100;
    const [aRankBonusPct, sRankBonusPct] = await Promise.all([
      this.getSystemConfigValue<number>("A_RANK_CARD_BONUS_PCT", 5),
      this.getSystemConfigValue<number>("S_RANK_CARD_BONUS_PCT", 10),
    ]);

    const user = await this.getUserById(params.userId);
    if (!user) throw new Error("User not found");

    // ── Dynamic Economy Multiplier (Q9) ────────────────────────────────────
    // Admin override wins; otherwise read today's cached multiplier from economy_state
    // (computed daily by economy-engine.ts). Falls back to 1.0 if no state row yet.
    let economyMult = new Decimal(1);
    if (economyOverrideRaw !== null && economyOverrideRaw !== undefined) {
      const [eMin, eMax] = await Promise.all([
        this.getSystemConfigValue<number>("ECONOMY_MULTIPLIER_MIN", 0.7),
        this.getSystemConfigValue<number>("ECONOMY_MULTIPLIER_MAX", 1.5),
      ]);
      economyMult = new Decimal(economyOverrideRaw).clamp(eMin, eMax);
    } else if (economyEnabled && params.engineType !== "Indirect") {
      const todayStr = new Date().toISOString().slice(0, 10);
      const [stateRow] = await db
        .select({ effectiveMultiplier: economyState.effectiveMultiplier })
        .from(economyState)
        .where(eq(economyState.date, todayStr as any))
        .limit(1);
      if (stateRow?.effectiveMultiplier) {
        economyMult = new Decimal(stateRow.effectiveMultiplier);
      }
    }

    // ── Rank Reward Multiplier (Q6) ─────────────────────────────────────────
    // Applied to TX-Points (gamification display) — not to real PKR — to
    // preserve financial integrity while rewarding higher-rank users more.
    const rankMult = RANK_REWARD_MULTIPLIERS[user.userRankTier] ?? 1.00;

    // Step 1: Engine split. Decimal (not native float */) — Critical finding
    // #3 of the 2026-07-15 production-readiness audit.
    // Apply economy multiplier to grossPkr before splits so all cuts scale proportionally.
    const baseGrossPkrD = new Decimal(params.grossPkr);
    const grossPkrD = params.engineType !== "Indirect"
      ? baseGrossPkrD.mul(economyMult).toDecimalPlaces(4, Decimal.ROUND_DOWN)
      : baseGrossPkrD;
    let userPkrShareD = new Decimal(0);
    let thorxProfitPkrD = new Decimal(0);
    let guildPoolPkrD = new Decimal(0);
    let bonusPoolPkrD = new Decimal(0); // Engine C only: 5% bonus pool (Sunday gift on target hit)

    if (params.engineType === "Engine_A" || params.engineType === "Engine_B") {
      const thorxCut = params.engineType === "Engine_A" ? engineAThorxCutPct : engineBThorxCutPct;
      const userCut = 100 - thorxCut;
      thorxProfitPkrD = grossPkrD.times(thorxCut).div(100);
      userPkrShareD = grossPkrD.times(userCut).div(100);
    } else if (params.engineType === "Engine_C") {
      if (!params.guildId) throw new Error("guildId is required for Engine_C earn events");
      // New Engine C split (Master Plan Phase 4.5):
      //   15% → Thorx direct profit
      //   80% → Guild weekly bonus pool (locked until Sunday distribution)
      //    5% → Bonus pool (added to Sunday payout only if target is hit)
      //    0% → User immediate balance (pool is the reward; distributed Sunday)
      thorxProfitPkrD = grossPkrD.times(engineCThorxCutPct).div(100);  // 15%
      guildPoolPkrD   = grossPkrD.times(engineCGuildPoolPct).div(100);  // 80%
      bonusPoolPkrD   = grossPkrD.times(engineCBonusPct).div(100);      // 5%
      userPkrShareD   = new Decimal(0); // no immediate PKR — pool unlocks Sunday
    }
    // 'Indirect' — no PKR payout, only PS (userPkrShare/thorxProfitPkr stay 0).

    // Step 2: Thorx Card draw.
    // For Engine A/B: base TX-Points on user's direct PKR share.
    // For Engine C: base TX-Points on the 80% pool contribution so members see
    //   their work counted even though the balance is locked until Sunday.
    // drawThorxCard owns rank-tier variance. Pass bounds once (F-02 audit fix).
    const txPointsBaseD = params.engineType === "Engine_C" ? guildPoolPkrD : userPkrShareD;
    let cardResult = { pointsCredited: 0, realPkrValue: "0.0000", cardVariance: 1.0, targetPoints: 0 };
    if (txPointsBaseD.gt(0)) {
      cardResult = drawThorxCard({
        userPkrShare: txPointsBaseD.toFixed(4),
        conversionRate,
        userRankTier: user.userRankTier,
        varianceMin: baseVarianceMin,
        varianceMax: baseVarianceMax,
        aRankBonusPct,
        sRankBonusPct,
      });
    }

    // Apply rank multiplier to TX-Points display value (Q6).
    // Rounding down to keep integer point counts clean.
    const rankedPointsCredited = cardResult.pointsCredited > 0
      ? Math.floor(cardResult.pointsCredited * rankMult)
      : 0;

    // Steps 3-6 are wrapped in a single transaction — Critical finding #2 of
    // the 2026-07-15 production-readiness audit: recordEarnEvent previously
    // made independent, unguarded db calls for the ledger row, balance
    // update, PS award, and rank check, so a mid-sequence crash could leave
    // points credited with an inconsistent ledger/rank state. Notification /
    // websocket / feed side-effects intentionally stay outside the
    // transaction (Step 7) — they're not part of the financial-consistency
    // contract and shouldn't hold a DB transaction open.
    //
    // When params.tx is provided (e.g. from the task-verify route that wraps
    // both updateTaskRecord + recordEarnEvent in a single outer transaction),
    // we skip our own db.transaction() wrapper and use the caller's tx so
    // both the task-completion write and the earn event are fully atomic.
    let earning: Earning | undefined;

    const runEarnTx = async (tx: any) => {
      // Step 3: Persist user_transactions — the immutable source of truth for
      // withdrawal math (Appendix A #1/#2). real_pkr_value is write-once.
      // uniq_user_transactions_source (sourceId, sourceType) rejects a
      // duplicate ledger row outright if this same ad_view/task completion
      // is ever submitted twice — defense-in-depth for Critical finding #4
      // of the 2026-07-15 production-readiness audit.
      // Audit fix 1-F: use userPkrShareD (Decimal) directly for all DB writes
      // instead of cardResult.realPkrValue (which is userPkrShareD.toNumber() —
      // a float). This eliminates IEEE 754 drift at the ledger write boundary.
      await tx.insert(userTransactions).values({
        userId: params.userId,
        engineType: params.engineType,
        pointsCredited: rankedPointsCredited,
        realPkrValue: userPkrShareD.toFixed(4),
        grossPkr: grossPkrD.toFixed(4), // effective grossPkr after economy multiplier
        thorxProfitPkr: thorxProfitPkrD.toFixed(4),
        guildPoolPkr: guildPoolPkrD.toFixed(4),
        conversionRate: Math.round(conversionRate),
        cardVariance: cardResult.cardVariance.toFixed(4),
        sourceId: params.sourceId,
        sourceType: params.sourceType,
      });

      if (params.engineType === "Engine_C" && params.guildId) {
        await tx
          .update(guilds)
          .set({
            weeklyBonusPool: sql`${guilds.weeklyBonusPool} + ${guildPoolPkrD.toFixed(4)}`,
            bonusPoolPkr: sql`${guilds.bonusPoolPkr} + ${bonusPoolPkrD.toFixed(4)}`,
            currentWeeklyPoints: sql`${guilds.currentWeeklyPoints} + ${grossPkrD.times(100).toDecimalPlaces(0).toString()}`,
          })
          .where(eq(guilds.id, params.guildId));
      }

      // Step 4: Update user-facing balances + earnings history.
      if (rankedPointsCredited > 0 || userPkrShareD.gt(0)) {
        await tx
          .update(users)
          .set({
            txPointsBalance: sql`${users.txPointsBalance} + ${rankedPointsCredited}`,
            totalEarnings:   sql`${users.totalEarnings}   + ${userPkrShareD.toFixed(2)}`,
            // Credit the exact historical user share. The withdrawal fee is
            // charged at approval, so the user's cash balance is debited by
            // the documented net amount there.
            availableBalance: sql`${users.availableBalance} + ${userPkrShareD.toFixed(4)}`,
            lastActiveAt: new Date(),
          })
          .where(eq(users.id, params.userId));

        [earning] = await tx
          .insert(earnings)
          .values({
            userId: params.userId,
            type: params.engineType,
            amount: userPkrShareD.toFixed(2),
            description: params.engineType === "Engine_C"
              ? `Engine C pool contribution — Rs.${guildPoolPkrD.toFixed(2)} locked in guild pool (Sunday distribution)`
              : `${params.engineType} task completion`,
            status: "completed",
          })
          .returning();
      }

      // Step 4b: Referral earn commission (Q1) — 1% of effective grossPkr to direct referrer.
      // Only fires for revenue-generating engines (not Indirect). Duplicate-protected by
      // unique index on (earnerId, earnEventSourceId, earnEventSourceType).
      if (
        user.referredBy &&
        params.engineType !== "Indirect" &&
        referralEarnPct > 0 &&
        grossPkrD.gt(0)
      ) {
        const commissionD = grossPkrD
          .times(referralEarnPct)
          .div(100)
          .toDecimalPlaces(4, Decimal.ROUND_DOWN);
        if (commissionD.gt(0)) {
          await tx
            .update(users)
            .set({ balanceCashPkr: sql`${users.balanceCashPkr} + ${commissionD.toFixed(4)}` })
            .where(eq(users.id, user.referredBy));
          await tx.insert(referralEarnCommissions).values({
            referrerId: user.referredBy,
            earnerId: params.userId,
            earnEventSourceId: params.sourceId,
            earnEventSourceType: params.sourceType,
            grossPkr: grossPkrD.toFixed(4),
            commissionPkr: commissionD.toFixed(4),
            commissionRatePct: String(referralEarnPct),
          });
        }
      }

      // Step 5: Guild member contribution tracking (Engine C only).
      if (params.engineType === "Engine_C" && params.guildId) {
        await tx
          .update(guildMembers)
          .set({ weeklyPointsContributed: sql`${guildMembers.weeklyPointsContributed} + ${rankedPointsCredited}` })
          .where(and(eq(guildMembers.userId, params.userId), eq(guildMembers.guildId, params.guildId)));
        await awardMemberGPS(params.guildId, rankedPointsCredited, tx);
        // Critical fix: this was the missing link — contributeWarPoints() was fully
        // implemented but never called from anywhere, so active guild wars never
        // accumulated points from real member earnings. Wired in here, alongside
        // the GPS award, using the same outer transaction for consistency.
        await contributeWarPoints(params.userId, params.guildId, rankedPointsCredited, tx);
      }

      // Step 6: PS award + streak + rank-tier check (PS is the sole rank input — Appendix A #6).
      if (params.engineType !== "Indirect") {
        await awardTaskPS(params.userId, params.engineType.replace("Engine_", "") as "A" | "B" | "C", tx);
      }
      await processStreak(params.userId, tx);
      await checkAndUpdateRankTier(params.userId, tx);
    };

    try {
      if (params.tx) {
        await runEarnTx(params.tx);
      } else {
        await db.transaction(runEarnTx);
      }
    } catch (err: any) {
      if (err?.code === "23505") {
        throw new Error("This earn event has already been recorded (duplicate submission).");
      }
      // O-03: Capture financial failures in Sentry for observability
      Sentry.captureException(err, {
        tags: { domain: "financial", operation: "recordEarnEvent" },
        extra: { userId: params.userId, engineType: params.engineType, grossPkr: String(params.grossPkr), sourceType: params.sourceType },
      });
      throw err;
    }

    // Step 7: Live feed event (after commit — see note above).
    await emitFeedEvent({
      type: "earn",
      userId: params.userId,
      guildId: params.guildId,
      displayMessage: params.engineType === "Engine_C"
        ? `User '${user.identity}' – Engine C | Pool: Rs.${guildPoolPkrD.toFixed(2)} | Bonus: Rs.${bonusPoolPkrD.toFixed(2)} | Points: ${rankedPointsCredited} | Thorx: Rs.${thorxProfitPkrD.toFixed(2)}`
        : `User '${user.identity}' – ${params.engineType} | Real: Rs.${userPkrShareD.toFixed(2)} | Points: ${rankedPointsCredited} | Thorx: Rs.${thorxProfitPkrD.toFixed(2)} | EconMult: ${economyMult.toFixed(2)} | RankMult: ${rankMult.toFixed(2)}`,
      data: { engineType: params.engineType, grossPkr: grossPkrD.toFixed(4), baseGrossPkr: baseGrossPkrD.toFixed(4), economyMult: economyMult.toFixed(4), rankMult, rankedPointsCredited, cardResult, thorxProfitPkr: thorxProfitPkrD.toFixed(4), guildPoolPkr: guildPoolPkrD.toFixed(4), bonusPoolPkr: bonusPoolPkrD.toFixed(4) },
    });

    return { success: true, pointsCredited: rankedPointsCredited, realPkrValue: userPkrShareD.toFixed(4), earning };
  }

  // Ad views methods
  async createAdView(insertAdView: InsertAdView): Promise<AdView & { pointsBreakdown?: EarnEventBreakdown }> {
    // When the ad view carries an earned amount, wrap the insert + earn event
    // in a single DB transaction — replaces the fragile manual rollback that
    // could leave an orphaned ad_view row if the process crashed between the
    // insert and the delete (audit finding J).
    if (insertAdView.completed && insertAdView.earnedAmount) {
      return await db.transaction(async (tx) => {
        const [adView] = await tx.insert(adViews).values(insertAdView).returning();
        const result = await this.recordEarnEvent({
          userId: insertAdView.userId,
          engineType: "Engine_A",
          grossPkr: insertAdView.earnedAmount, // string preferred — grossPkr accepts string|number (H-04)
          sourceId: adView.id,
          sourceType: "ad_view",
          tx,
        });
        const breakdown: EarnEventBreakdown = {
          basePoints: result.pointsCredited,
          guildBonusPoints: 0,
          totalPoints: result.pointsCredited,
          vaultPkr: "0.00",
          walletPkr: new Decimal(result.realPkrValue).toFixed(2),
          guildId: null,
        };
        return { ...adView, pointsBreakdown: breakdown };
      });
    }

    const [adView] = await db.insert(adViews).values(insertAdView).returning();
    return adView;
  }

  async getUserAdViews(userId: string, limit = 50): Promise<AdView[]> {
    return await db
      .select()
      .from(adViews)
      .where(eq(adViews.userId, userId))
      .orderBy(desc(adViews.createdAt))
      .limit(limit);
  }

  async getTodayAdViews(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(adViews)
      .where(
        and(
          eq(adViews.userId, userId),
          sql`${adViews.createdAt} >= ${today}`,
          eq(adViews.completed, true)
        )
      );

    return result?.count || 0;
  }

  // Referrals methods
  async createReferral(insertReferral: InsertReferral): Promise<Referral> {
    const [referral] = await db.insert(referrals).values(insertReferral).returning();
    return referral;
  }

  async getUserReferrals(userId: string): Promise<Array<Referral & { referred: User }>> {
    return await db
      .select({
        id: referrals.id,
        referrerId: referrals.referrerId,
        referredId: referrals.referredId,
        status: referrals.status,
        tier: referrals.tier,
        totalEarned: referrals.totalEarned,
        createdAt: referrals.createdAt,
        referred: users,
      })
      .from(referrals)
      .innerJoin(users, eq(referrals.referredId, users.id))
      .where(eq(referrals.referrerId, userId))
      .orderBy(desc(referrals.createdAt))
      // Audit finding 1-L: unbounded query — cap at 100 to avoid loading full
      // join into Node.js heap for high-referral users.
      .limit(100);
  }

  async getReferralStats(userId: string): Promise<{ count: number; totalEarned: string }> {
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(referrals)
      .where(eq(referrals.referrerId, userId));

    // Same fix as R-01 (getDashboardStats): referrals.totalEarned is never
    // incremented by processWithdrawal or awardEarning, so it is permanently
    // stale. The current single-tier system credits commissions through two
    // live tables — referral_commissions (withdrawal fee share) and
    // referral_earn_commissions (1% of referred users' earn events) — so the
    // lifetime total must be summed from both, never from commission_logs
    // (frozen/dead) or referrals.totalEarned.
    const [withdrawalTotal] = await db
      .select({ total: sql<string>`COALESCE(SUM(${referralCommissions.commissionAmountPkr}), '0.00')` })
      .from(referralCommissions)
      .where(eq(referralCommissions.referrerId, userId));

    const [earnTotal] = await db
      .select({ total: sql<string>`COALESCE(SUM(${referralEarnCommissions.commissionPkr}), '0.00')` })
      .from(referralEarnCommissions)
      .where(eq(referralEarnCommissions.referrerId, userId));

    const totalEarned = new Decimal(withdrawalTotal?.total || '0')
      .plus(earnTotal?.total || '0')
      .toFixed(2);

    return {
      count: countResult?.count || 0,
      totalEarned,
    };
  }

  // Referral stats — L1 direct referrals only (Blueprint v2026: single-tier)
  async getReferralStatsDetailed(userId: string): Promise<{
    totalReferrals: number;
    level1Count: number;
    totalCommissionEarnings: string;
    level1Earnings: string;
    pendingCommissions: string;
    paidCommissions: string;
  }> {
    const [l1Result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(referrals)
      .where(and(eq(referrals.referrerId, userId), eq(referrals.tier, 1)));

    const [l1Earnings] = await db
      .select({ total: sql<string>`COALESCE(SUM(${commissionLogs.amount}), '0.00')` })
      .from(commissionLogs)
      .where(and(eq(commissionLogs.beneficiaryId, userId), eq(commissionLogs.level, 1)));

    const [pendingResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${commissionLogs.amount}), '0.00')` })
      .from(commissionLogs)
      .where(and(eq(commissionLogs.beneficiaryId, userId), eq(commissionLogs.status, "pending")));

    const [paidResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${commissionLogs.amount}), '0.00')` })
      .from(commissionLogs)
      .where(and(eq(commissionLogs.beneficiaryId, userId), eq(commissionLogs.status, "paid")));

    const level1Count = Number(l1Result?.count || 0);
    const level1EarningsAmount = l1Earnings?.total || "0.00";

    return {
      totalReferrals: level1Count,
      level1Count,
      totalCommissionEarnings: level1EarningsAmount,
      level1Earnings: level1EarningsAmount,
      pendingCommissions: pendingResult?.total || "0.00",
      paidCommissions: paidResult?.total || "0.00",
    };
  }


  // Team functionality methods
  // Team emails for inbox functionality
  async createTeamEmail(insertTeamEmail: InsertTeamEmail): Promise<TeamEmail> {
    const [teamEmail] = await db.insert(teamEmails).values(insertTeamEmail).returning();

    // Cross-Portal Notification Sync: If this is an outbound reply to a user, create a notification
    if (insertTeamEmail.type === 'outbound') {
      try {
        const user = await this.getUserByEmail(insertTeamEmail.toEmail);
        if (user) {
          await this.createNotification({
            userId: user.id,
            title: "Support Response",
            message: `A team member has replied to your inquiry: "${insertTeamEmail.subject.substring(0, 50)}${insertTeamEmail.subject.length > 50 ? '...' : ''}"`,
            type: "system",
            isRead: false
          });
        }
      } catch (notifyError) {
        logger.warn({ err: notifyError }, "Non-fatal: Failed to sync notification for outbound email");
      }
    }

    return teamEmail;
  }

  async updateTeamEmail(id: string, updates: Partial<TeamEmail>): Promise<TeamEmail | undefined> {
    const [updatedEmail] = await db
      .update(teamEmails)
      .set(updates)
      .where(eq(teamEmails.id, id))
      .returning();
    return updatedEmail;
  }

  async deleteTeamEmail(id: string): Promise<boolean> {
    const result = await db.delete(teamEmails).where(eq(teamEmails.id, id));
    return true; // Drizzle return count for delete is driver-dependent
  }

  async getTeamEmails(type?: 'inbound' | 'outbound', limit = 50): Promise<TeamEmail[]> {
    let query = db
      .select({
        id: teamEmails.id,
        fromUserId: teamEmails.fromUserId,
        toEmail: teamEmails.toEmail,
        fromEmail: teamEmails.fromEmail,
        subject: teamEmails.subject,
        content: teamEmails.content,
        status: teamEmails.status,
        type: teamEmails.type,
        attachments: teamEmails.attachments,
        createdAt: teamEmails.createdAt,
      })
      .from(teamEmails)
      .leftJoin(users, sql`LOWER(${teamEmails.fromEmail}) = LOWER(${users.email})`);

    if (type) {
      query = query.where(eq(teamEmails.type, type)) as any;
    }

    return await query.orderBy(desc(teamEmails.createdAt)).limit(limit);
  }

  async getTeamEmailsByUser(userId: string, limit = 50): Promise<TeamEmail[]> {
    return await db
      .select()
      .from(teamEmails)
      .where(eq(teamEmails.fromUserId, userId))
      .orderBy(desc(teamEmails.createdAt))
      .limit(limit);
  }

  // Team keys for managing team member access
  async createTeamKey(insertTeamKey: InsertTeamKey, tx?: any): Promise<TeamKey> {
    // Upsert on userId: team_keys.user_id is unique, so concurrent "add
    // member" requests for the same user resolve to a single row instead of
    // racing to create duplicates. Accepts an optional outer transaction so
    // callers can keep the users.role/permissions write and this key write atomic.
    const { userId, ...rest } = insertTeamKey;
    const client = tx || db;
    const [teamKey] = await client
      .insert(teamKeys)
      .values(insertTeamKey)
      .onConflictDoUpdate({
        target: teamKeys.userId,
        set: { ...rest, updatedAt: new Date() },
      })
      .returning();
    return teamKey;
  }

  async getTeamKeysByUser(userId: string, tx?: any): Promise<TeamKey[]> {
    const client = tx || db;
    return await client
      .select()
      .from(teamKeys)
      .where(eq(teamKeys.userId, userId))
      .orderBy(desc(teamKeys.createdAt));
  }

  async updateTeamKey(keyId: string, updates: Partial<InsertTeamKey>): Promise<TeamKey | undefined> {
    const [updatedKey] = await db
      .update(teamKeys)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(teamKeys.id, keyId))
      .returning();
    return updatedKey;
  }

  async getTeamMembers(): Promise<Array<User & { teamKey: TeamKey | null }>> {
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        identity: users.identity,
        phone: users.phone,
        email: users.email,
        passwordHash: users.passwordHash,
        referralCode: users.referralCode,
        referredBy: users.referredBy,
        role: users.role,
        totalEarnings: users.totalEarnings,
        availableBalance: users.availableBalance,
        pendingBalance: users.pendingBalance,
        totalWithdrawn: users.totalWithdrawn,
        isActive: users.isActive,
        isVerified: users.isVerified,
        emailVerifiedAt: users.emailVerifiedAt,
        verificationToken: users.verificationToken,
        verificationTokenExpiresAt: users.verificationTokenExpiresAt,
        loginStreak: users.loginStreak,
        lastLoginDate: users.lastLoginDate,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        avatar: users.avatar,
        trustStatus: users.trustStatus,
        trustReason: users.trustReason,
        profilePicture: users.profilePicture,
        permissions: users.permissions,
        personalRank: users.personalRank,
        guildContributionScore: users.guildContributionScore,
        txPointsBalance: users.txPointsBalance,
        performanceScore: users.performanceScore,
        userRankTier: users.userRankTier,
        guildRole: users.guildRole,
        guildId: users.guildId,
        lastActiveAt: users.lastActiveAt,
        streakDays: users.streakDays,
        lastStreakDate: users.lastStreakDate,
        inactivityPenaltyAt: users.inactivityPenaltyAt,
        balanceCashPkr: users.balanceCashPkr,
        teamKey: teamKeys,
      })
      .from(users)
      .leftJoin(teamKeys, eq(users.id, teamKeys.userId))
      .where(inArray(users.role, ['team', 'admin', 'founder']))
      .orderBy(desc(users.createdAt));
    // LEFT JOIN on teamKeys produces one row per key — deduplicate to one row per user
    // keeping the first occurrence (latest teamKey by join order).
    const seen = new Set<string>();
    return rows.filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }

  // User credentials storage for team data management
  async createUserCredential(insertCredential: InsertUserCredential): Promise<UserCredential> {
    // Encrypt password at rest
    const toInsert = { ...insertCredential };
    if (toInsert.encryptedPassword) {
      toInsert.encryptedPassword = encryptCredential(toInsert.encryptedPassword);
    }
    const [credential] = await db.insert(userCredentials).values(toInsert).returning();
    return credential;
  }

  async getUserCredentials(userId: string): Promise<UserCredential[]> {
    return await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .orderBy(desc(userCredentials.createdAt))
      .limit(100); // C2-06: prevent unbounded scan
  }

  async getAllUserCredentials(): Promise<Array<UserCredential & { user: User }>> {
    try {
      const result = await db
        .select({
          id: userCredentials.id,
          userId: userCredentials.userId,
          platform: userCredentials.platform,
          username: userCredentials.username,
          email: userCredentials.email,
          encryptedPassword: userCredentials.encryptedPassword,
          notes: userCredentials.notes,
          isActive: userCredentials.isActive,
          lastUpdated: userCredentials.lastUpdated,
          createdAt: userCredentials.createdAt,
          // Include user information
          user: users
        })
        .from(userCredentials)
        .leftJoin(users, eq(userCredentials.userId, users.id))
        .orderBy(desc(userCredentials.createdAt));

      return result as Array<UserCredential & { user: User }>;
    } catch (error) {
      logger.error({ err: error }, "Error fetching user credentials");
      throw error;
    }
  }

  // Get all users for team data management — paginated to prevent full-table
  // memory bomb at scale (audit finding R). Sensitive fields (passwordHash,
  // verificationToken) are projected out so they never reach the admin UI.
  async getAllUsers(limit = 100, offset = 0): Promise<User[]> {
    // R-25: getAllUsers is a legacy bulk-fetch. Prefer getUsersPaginated() for
    // any new caller. Cap at 200 rows and warn so callers can be migrated.
    if (limit > 200) {
      logger.warn({ limit }, "[getAllUsers] limit exceeds 200 — capped. Migrate caller to getUsersPaginated().");
      limit = 200;
    }
    try {
      const result = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          identity: users.identity,
          phone: users.phone,
          referralCode: users.referralCode,
          referredBy: users.referredBy,
          totalEarnings: users.totalEarnings,
          availableBalance: users.availableBalance,
          pendingBalance: users.pendingBalance,
          totalWithdrawn: users.totalWithdrawn,
          isActive: users.isActive,
          isVerified: users.isVerified,
          emailVerifiedAt: users.emailVerifiedAt,
          loginStreak: users.loginStreak,
          lastLoginDate: users.lastLoginDate,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          avatar: users.avatar,
          trustStatus: users.trustStatus,
          trustReason: users.trustReason,
          profilePicture: users.profilePicture,
          permissions: users.permissions,
          personalRank: users.personalRank,
          guildContributionScore: users.guildContributionScore,
          txPointsBalance: users.txPointsBalance,
          performanceScore: users.performanceScore,
          userRankTier: users.userRankTier,
          guildRole: users.guildRole,
          guildId: users.guildId,
          lastActiveAt: users.lastActiveAt,
          streakDays: users.streakDays,
          lastStreakDate: users.lastStreakDate,
          inactivityPenaltyAt: users.inactivityPenaltyAt,
          balanceCashPkr: users.balanceCashPkr,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      return result as any;
    } catch (error) {
      logger.error({ err: error }, "Error fetching all users");
      throw error;
    }
  }


  async updateUserCredential(credentialId: string, updates: Partial<InsertUserCredential>): Promise<UserCredential | undefined> {
    const toUpdate = { ...updates };
    // Encrypt new password if provided
    if (toUpdate.encryptedPassword) {
      toUpdate.encryptedPassword = encryptCredential(toUpdate.encryptedPassword);
    }
    const [updatedCredential] = await db
      .update(userCredentials)
      .set({ ...toUpdate, lastUpdated: new Date() })
      .where(eq(userCredentials.id, credentialId))
      .returning();
    return updatedCredential;
  }

  async deleteUserCredential(credentialId: string): Promise<void> {
    await db
      .update(userCredentials)
      .set({ isActive: false, lastUpdated: new Date() })
      .where(eq(userCredentials.id, credentialId));
  }

  // Team-specific user methods
  async getUsersByRole(role: 'user' | 'team' | 'founder'): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.role, role))
      .orderBy(desc(users.createdAt));
  }

  async getUsersCountInRange(since: Date): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(
        since.getTime() === 0
          ? eq(users.role, 'user')
          : and(eq(users.role, 'user'), gte(users.createdAt, since))
      );

    return result?.count || 0;
  }

  async getEarningsSumInRange(since: Date): Promise<string> {
    const [result] = await db
      .select({ total: sql<string>`COALESCE(SUM(${earnings.amount}), '0.00')` })
      .from(earnings)
      .where(
        since.getTime() === 0
          ? eq(earnings.status, 'completed')
          : and(eq(earnings.status, 'completed'), gte(earnings.createdAt, since))
      );

    return result?.total || "0.00";
  }

  async getAnalyticsData(since: Date): Promise<any[]> {
    const isToday = (Date.now() - since.getTime()) < 24 * 60 * 60 * 1000 + 1000;
    const format = isToday ? 'YYYY-MM-DD HH24:00' : 'YYYY-MM-DD';

    const formatStr = sql.raw(`'${format}'`);

    const registrations = await db
      .select({ 
        date: sql<string>`TO_CHAR(${users.createdAt}, ${formatStr})`, 
        count: sql<number>`COUNT(*)` 
      })
      .from(users)
      .where(
        since.getTime() === 0
          ? eq(users.role, 'user')
          : and(eq(users.role, 'user'), gte(users.createdAt, since))
      )
      .groupBy(sql`TO_CHAR(${users.createdAt}, ${formatStr})`)
      .orderBy(sql`TO_CHAR(${users.createdAt}, ${formatStr})`);

    const revenue = await db
      .select({ 
        date: sql<string>`TO_CHAR(${earnings.createdAt}, ${formatStr})`, 
        amount: sql<string>`SUM(${earnings.amount})` 
      })
      .from(earnings)
      .where(
        since.getTime() === 0
          ? eq(earnings.status, 'completed')
          : and(eq(earnings.status, 'completed'), gte(earnings.createdAt, since))
      )
      .groupBy(sql`TO_CHAR(${earnings.createdAt}, ${formatStr})`)
      .orderBy(sql`TO_CHAR(${earnings.createdAt}, ${formatStr})`);

    // Merge datasets into a unified timeline
    const mergedMap = new Map<string, any>();
    registrations.forEach(r => {
      mergedMap.set(r.date, { date: r.date, count: Number(r.count), amount: "0.0000" });
    });
    
    // H-04/H-05: keep PKR revenue as a Decimal-serialized string end-to-end —
    // never .toNumber()/Number() a financial value on the server. The
    // frontend already Decimal-wraps this field before display.
    revenue.forEach(rev => {
      const amountStr = new Decimal(rev.amount ?? "0").toFixed(4);
      if (mergedMap.has(rev.date)) {
        mergedMap.get(rev.date).amount = amountStr;
      } else {
        mergedMap.set(rev.date, { date: rev.date, count: 0, amount: amountStr });
      }
    });

    return Array.from(mergedMap.values()).sort((a,b) => a.date.localeCompare(b.date));
  }

  async getEngineRevenue(since: Date): Promise<{ Engine_A: string; Engine_B: string; Engine_C: string; Indirect: string }> {
    // user_transactions are all credits; filter by date window only
    const condition = since.getTime() > 0
      ? gte(userTransactions.createdAt, since)
      : undefined;
    const rows = await db
      .select({
        engineType: userTransactions.engineType,
        total: sql<string>`COALESCE(SUM(${userTransactions.realPkrValue}), '0')`,
      })
      .from(userTransactions)
      .where(condition)
      .groupBy(userTransactions.engineType);
    // H-04/H-05: serialize as Decimal-fixed strings — never .toNumber() a
    // financial value on the server. The frontend does the sum/share math
    // via Decimal.js too, using the same safePkr-style guarded pattern
    // already established for the other dashboard cards.
    const result: Record<string, string> = { Engine_A: "0.0000", Engine_B: "0.0000", Engine_C: "0.0000", Indirect: "0.0000" };
    for (const row of rows) {
      const key = row.engineType;
      if (key && key in result) result[key] = new Decimal(row.total ?? "0").toFixed(4);
    }
    return result as { Engine_A: string; Engine_B: string; Engine_C: string; Indirect: string };
  }

  async createChatMessage(insertChatMessage: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db
      .insert(chatMessages)
      .values(insertChatMessage)
      .returning();
    return message;
  }

  async getUserChatHistory(userId: string, limit: number = 50): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.userId, userId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
  }

  // ── Engine B — CPA Tasks ─────────────────────────────────────────────────────
  async getEngineBTasks(): Promise<EngineBTask[]> {
    return await db.select().from(engineBTasks).orderBy(desc(engineBTasks.createdAt)).limit(500);
  }

  async getEngineBTask(id: string): Promise<EngineBTask | undefined> {
    const [task] = await db.select().from(engineBTasks).where(eq(engineBTasks.id, id));
    return task;
  }

  async createEngineBTask(insertTask: InsertEngineBTask): Promise<EngineBTask> {
    const [task] = await db.insert(engineBTasks).values(insertTask).returning();
    return task;
  }

  async updateEngineBTask(id: string, updates: Partial<InsertEngineBTask>): Promise<EngineBTask | undefined> {
    const [task] = await db.update(engineBTasks).set({ ...updates, updatedAt: new Date() }).where(eq(engineBTasks.id, id)).returning();
    return task;
  }

  async deleteEngineBTask(id: string): Promise<void> {
    await db.delete(engineBTasks).where(eq(engineBTasks.id, id));
  }

  async getEngineBTasksForUser(userId: string): Promise<{ task: EngineBTask; record: EngineBRecord | null }[]> {
    const results = await db
      .select({ task: engineBTasks, record: engineBRecords })
      .from(engineBTasks)
      .where(eq(engineBTasks.isActive, true))
      .leftJoin(engineBRecords, and(eq(engineBRecords.taskId, engineBTasks.id), eq(engineBRecords.userId, userId)));
    return results;
  }

  async getEngineBRecord(userId: string, taskId: string): Promise<EngineBRecord | undefined> {
    const [record] = await db
      .select()
      .from(engineBRecords)
      .where(and(eq(engineBRecords.userId, userId), eq(engineBRecords.taskId, taskId)));
    return record;
  }

  async createEngineBRecord(insertRecord: InsertEngineBRecord): Promise<EngineBRecord> {
    const [record] = await db.insert(engineBRecords).values(insertRecord).returning();
    return record;
  }

  async updateEngineBRecord(id: string, updates: Partial<InsertEngineBRecord>): Promise<EngineBRecord | undefined> {
    const [record] = await db.update(engineBRecords).set(updates).where(eq(engineBRecords.id, id)).returning();
    return record;
  }

  // LEGACY stub — daily_tasks retired. Always returns 0.
  async getTodayCompletedTasksByType(_userId: string, _type: string): Promise<number> {
    return 0;
  }


  async createHilltopAdsConfig(insertConfig: InsertHilltopAdsConfig): Promise<HilltopAdsConfig> {
    const [config] = await db.insert(hilltopAdsConfig).values(insertConfig).returning();
    return config;
  }

  async getHilltopAdsConfig(): Promise<HilltopAdsConfig | undefined> {
    const configs = await db.select().from(hilltopAdsConfig).limit(1);
    return configs[0];
  }

  async updateHilltopAdsConfig(configId: string, updates: Partial<InsertHilltopAdsConfig>): Promise<HilltopAdsConfig | undefined> {
    const [updated] = await db
      .update(hilltopAdsConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(hilltopAdsConfig.id, configId))
      .returning();
    return updated;
  }

  async createHilltopAdsZone(insertZone: InsertHilltopAdsZone): Promise<HilltopAdsZone> {
    const [zone] = await db.insert(hilltopAdsZones).values(insertZone).returning();
    return zone;
  }

  async getHilltopAdsZones(): Promise<HilltopAdsZone[]> {
    // Limit to 100 active zones — full table scan grows unbounded otherwise.
    return await db.select().from(hilltopAdsZones).orderBy(desc(hilltopAdsZones.createdAt)).limit(100);
  }

  async getHilltopAdsZoneById(zoneId: string): Promise<HilltopAdsZone | undefined> {
    const [zone] = await db.select().from(hilltopAdsZones).where(eq(hilltopAdsZones.zoneId, zoneId)).limit(1);
    return zone;
  }

  async updateHilltopAdsZone(id: string, updates: Partial<InsertHilltopAdsZone>): Promise<HilltopAdsZone | undefined> {
    const [updated] = await db
      .update(hilltopAdsZones)
      .set({ status: updates.status, updatedAt: new Date() })
      .where(eq(hilltopAdsZones.id, id))
      .returning();
    return updated;
  }

  async createHilltopAdsStat(insertStat: InsertHilltopAdsStat): Promise<HilltopAdsStat> {
    const [stat] = await db.insert(hilltopAdsStats).values(insertStat).returning();
    return stat;
  }

  async getHilltopAdsStats(zoneId?: string, startDate?: Date, endDate?: Date): Promise<HilltopAdsStat[]> {
    let conditions: any[] = [];

    if (zoneId) {
      conditions.push(eq(hilltopAdsStats.zoneId, zoneId));
    }

    if (startDate && endDate) {
      conditions.push(sql`${hilltopAdsStats.date} >= ${startDate}`);
      conditions.push(sql`${hilltopAdsStats.date} <= ${endDate}`);
    }

    if (conditions.length > 0) {
      return await db
        .select()
        .from(hilltopAdsStats)
        .where(and(...conditions))
        .orderBy(desc(hilltopAdsStats.date));
    }

    return await db
      .select()
      .from(hilltopAdsStats)
      .orderBy(desc(hilltopAdsStats.date));
  }

  async getTotalHilltopAdsRevenue(): Promise<string> {
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${hilltopAdsStats.revenue}), 0)` })
      .from(hilltopAdsStats);
    return result[0]?.total || "0";
  }

  // Commission Logs
  async createCommissionLog(log: InsertCommissionLog): Promise<CommissionLog> {
    const [entry] = await db.insert(commissionLogs).values(log).returning();
    return entry;
  }

  async getCommissionLogsByTriggerWithdrawal(withdrawalId: string): Promise<CommissionLog[]> {
    return await db
      .select()
      .from(commissionLogs)
      .where(eq(commissionLogs.triggerWithdrawalId, withdrawalId));
  }

  async getCommissionLogsByBeneficiary(userId: string): Promise<any[]> {
    const results = await db
      .select({
        id: commissionLogs.id,
        beneficiaryId: commissionLogs.beneficiaryId,
        sourceUserId: commissionLogs.sourceUserId,
        triggerWithdrawalId: commissionLogs.triggerWithdrawalId,
        amount: commissionLogs.amount,
        rate: commissionLogs.rate,
        level: commissionLogs.level,
        status: commissionLogs.status,
        metadata: commissionLogs.metadata,
        createdAt: commissionLogs.createdAt,
        updatedAt: commissionLogs.updatedAt,
        sourceUser: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email
        }
      })
      .from(commissionLogs)
      .innerJoin(users, eq(commissionLogs.sourceUserId, users.id))
      .where(eq(commissionLogs.beneficiaryId, userId))
      .orderBy(desc(commissionLogs.createdAt))
      .limit(500); // C2-06: prevent unbounded scan

    return results;
  }

  // Withdrawals with Commission Logic
  //
  // Fee model (single-level referral, per thorx_master_plan.md): every withdrawal
  // pays a single total fee of WITHDRAWAL_FEE_PCT (default 15%) of the requested
  // amount. REFERRAL_FEE_SHARE_PCT (default 50%) carves a portion of THAT fee out
  // to the withdrawing user's direct (L1) referrer — the platform keeps the rest.
  // The user's total deduction is always exactly WITHDRAWAL_FEE_PCT; the referral
  // share does not add on top of it. There is no Level-2 referral commission —
  // that code path was retired (see thorx_master_plan.md and memory topic
  // "referral-simplification"); any pending L2 rows were settled once via a
  // one-time migration at that time.
  // THORX v3 (spec Part E.7) — FIFO-consumes un-withdrawn user_transactions
  // rows until pointsCredited covers pointsRequested, and sums their exact
  // historical realPkrValue as the PKR base. This is Appendix A invariant
  // #1/#2: withdrawal math is NEVER recomputed from points × conversion rate.
  //
  // Pro-rata last-row fix (2026-07-23): the previous implementation consumed
  // the full realPkrValue of the last FIFO row even when only a fraction of
  // its pointsCredited was needed, causing the user to receive PKR for more
  // points than they withdrew while the surplus points were permanently
  // burned. The new logic computes a Decimal fraction of the last row's PKR
  // precisely proportional to the points actually consumed, and returns a
  // `partialLastRow` descriptor so processWithdrawal can insert a
  // split_remainder row atomically for the unused portion.
  //
  // Fallback chain for zero realPkrValue (legacy / data-quality edge cases):
  //   1. realPkrValue > 0  → use it directly (normal path)
  //   2. grossPkr > 0      → apply engine-specific user-cut percentage
  //   3. conversionRate > 0 → derive gross from points ÷ rate; apply 60% cut
  //   Any row that is genuinely valueless (Indirect engine, 0 points) stays 0.
  //
  // `dbc` lets callers pass a transaction client so the FIFO read is inside
  // the same transaction as the withdrawal-row lock (see processWithdrawal).
  // All PKR arithmetic uses Decimal throughout — never native float — to
  // prevent IEEE-754 sub-paisa drift (audit finding #3, 2026-07-15).
  private async calculateWithdrawalBreakdown(
    userId: string,
    pointsRequested: number,
    dbc: any = db
  ): Promise<{
    exactPkr: string;
    platformFee: string;
    referralCommission: string;
    referrerId: string | null;
    referrerName: string | null;
    userNetPkr: string;
    consumedTransactionIds: string[];
    /** Non-null when the last consumed FIFO row was only partially used.
     *  processWithdrawal must insert a split_remainder row for the unused
     *  portion inside the same transaction before marking rows withdrawn. */
    partialLastRow: {
      originalId: string;
      pointsUsed: number;
      pointsRemainder: number;
      pkrUsed: string;
      pkrRemainder: string;
      engineType: string;
      conversionRate: number;
      grossPkr: string;
      thorxProfitPkr: string | null;
      guildPoolPkr: string | null;
      cardVariance: string;
    } | null;
  }> {
    // Fetch all FIFO fields needed for the fallback chain and for constructing
    // the split_remainder row — one query, no extra round-trips.
    const rows = await dbc
      .select({
        id:             userTransactions.id,
        pointsCredited: userTransactions.pointsCredited,
        realPkrValue:   userTransactions.realPkrValue,
        grossPkr:       userTransactions.grossPkr,
        thorxProfitPkr: userTransactions.thorxProfitPkr,
        guildPoolPkr:   userTransactions.guildPoolPkr,
        conversionRate: userTransactions.conversionRate,
        cardVariance:   userTransactions.cardVariance,
        engineType:     userTransactions.engineType,
      })
      .from(userTransactions)
      .where(and(eq(userTransactions.userId, userId), eq(userTransactions.withdrawn, false)))
      .orderBy(asc(userTransactions.createdAt))
      .limit(5000); // C1-05: safety cap — no realistic user accumulates >5 000 un-withdrawn rows

    /** Resolve a row's true PKR value with a three-tier fallback for legacy
     *  records where realPkrValue was not captured at earn time.
     *
     *  Ledger-audit fix (2026-07-29, CRITICAL): the fallback used to trigger
     *  for ANY row with realPkrValue <= 0, but Engine_C rows are 0 by design
     *  (their PKR share is locked in the guild's weekly pool, not paid to the
     *  user immediately — see recordEarnEvent), Indirect rows never pay PKR
     *  at all, and Manual admin/reconciliation rows (engineType 'Manual')
     *  can be legitimately zero or negative. Falling back to a gross-based
     *  estimate for these rows previously leaked guild-pool money (or
     *  mis-estimated correction rows) into individual withdrawals. Only
     *  Engine_A/Engine_B rows — which should always carry a real positive
     *  share — are eligible for the legacy fallback. */
    const resolveRowPkr = (row: typeof rows[number]): Decimal => {
      const realD = new Decimal(row.realPkrValue ?? "0");
      if (row.engineType !== "Engine_A" && row.engineType !== "Engine_B") return realD;
      if (realD.gt(0)) return realD;

      // Fallback 1 — use stored grossPkr × engine-appropriate user cut.
      const grossD = new Decimal(row.grossPkr ?? "0");
      if (grossD.gt(0)) {
        // Engine A and B are both 60% user cut.
        const userCutPct = new Decimal("0.60");
        return grossD.times(userCutPct);
      }

      // Fallback 2 — derive gross from historical conversion rate, then apply
      // the default 60 % user cut (Engine A / B) as a conservative estimate.
      if (row.conversionRate > 0 && row.pointsCredited > 0) {
        logger.warn(
          { rowId: row.id, engineType: row.engineType },
          "[calculateWithdrawalBreakdown] realPkrValue and grossPkr both zero; " +
          "computing PKR from historical conversionRate — manual review advised."
        );
        return new Decimal(row.pointsCredited)
          .div(new Decimal(row.conversionRate))
          .times(new Decimal("0.60"));
      }

      return new Decimal(0);
    };

    const pointsRequestedD  = new Decimal(pointsRequested);
    let   pointsAccumulatedD = new Decimal(0);
    let   exactPkr           = new Decimal(0);
    const consumedTransactionIds: string[] = [];
    let   partialLastRow: Awaited<ReturnType<typeof this.calculateWithdrawalBreakdown>>["partialLastRow"] = null;

    for (const row of rows) {
      // Stop as soon as we have enough points accumulated.
      if (pointsAccumulatedD.gte(pointsRequestedD)) break;

      const rowPointsD       = new Decimal(row.pointsCredited.toString());
      const pointsStillNeeded = pointsRequestedD.minus(pointsAccumulatedD);
      const effectivePkr     = resolveRowPkr(row);

      if (rowPointsD.lte(pointsStillNeeded)) {
        // ── Full row consumed — no overshoot ─────────────────────────────────
        pointsAccumulatedD = pointsAccumulatedD.plus(rowPointsD);
        exactPkr           = exactPkr.plus(effectivePkr);
        consumedTransactionIds.push(row.id);
      } else {
        // ── Partial last row — pro-rata split ────────────────────────────────
        // Only the fraction of this row's points that we still need is taken.
        // PKR is split proportionally so the user is paid for exactly the
        // points they withdrew — no more, no less.
        const fraction      = pointsStillNeeded.div(rowPointsD);
        const pkrUsedD      = effectivePkr.times(fraction);
        const pkrRemainderD = effectivePkr.minus(pkrUsedD);

        // pointsRemainder must be a whole integer — use CEIL so no points vanish.
        const pointsRemainderD = rowPointsD.minus(pointsStillNeeded)
                                           .toDecimalPlaces(0, Decimal.ROUND_CEIL);

        exactPkr           = exactPkr.plus(pkrUsedD);
        pointsAccumulatedD = pointsAccumulatedD.plus(pointsStillNeeded);
        consumedTransactionIds.push(row.id);

        // Proportionally scale auxiliary PKR fields for the split_remainder row.
        const scaleRemainder = (stored: string | null): string | null => {
          if (!stored) return null;
          const d = new Decimal(stored);
          return d.gt(0)
            ? d.times(new Decimal(1).minus(fraction)).toFixed(4)
            : null;
        };

        partialLastRow = {
          originalId:     row.id,
          pointsUsed:     pointsStillNeeded.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber(),
          pointsRemainder: pointsRemainderD.toNumber(),
          pkrUsed:        pkrUsedD.toFixed(4),
          pkrRemainder:   pkrRemainderD.toFixed(4),
          engineType:     row.engineType,
          conversionRate: row.conversionRate,
          grossPkr:       scaleRemainder(row.grossPkr) ?? "0.0000",
          thorxProfitPkr: scaleRemainder(row.thorxProfitPkr),
          guildPoolPkr:   scaleRemainder(row.guildPoolPkr),
          cardVariance:   new Decimal(row.cardVariance ?? "1").toFixed(4),
        };

        // Row is fully consumed from our perspective (the remainder is
        // materialised as a new split row in processWithdrawal); stop here.
        break;
      }
    }

    if (pointsAccumulatedD.lt(pointsRequestedD)) {
      throw new Error(
        `Insufficient balance. Available: ${pointsAccumulatedD.toNumber()} points, ` +
        `requested: ${pointsRequested} points.`
      );
    }

    const feeRate = new Decimal(await this.getSystemConfigValue<number>("WITHDRAWAL_FEE_PCT", 15)).div(100);
    const platformFee = exactPkr.times(feeRate);

    const user = await this.getUserById(userId);
    const referrer = user?.referredBy ? await this.getUserById(user.referredBy) : undefined;
    let referralCommission = new Decimal(0);
    if (referrer) {
      const refSharePct = new Decimal(await this.getSystemConfigValue<number>("REFERRAL_FEE_SHARE_PCT", 50)).div(100);
      referralCommission = platformFee.times(refSharePct);
    }

    const userNetPkr = exactPkr.minus(platformFee);

    // H-04: Return as fixed-precision strings — never .toNumber() — so IEEE-754
    // rounding cannot corrupt financial values in transit to the client.
    return {
      exactPkr:               exactPkr.toFixed(4),
      platformFee:            platformFee.toFixed(4),
      referralCommission:     referralCommission.toFixed(4),
      referrerId:             referrer?.id ?? null,
      referrerName:           referrer?.identity ?? null,
      userNetPkr:             userNetPkr.toFixed(4),
      consumedTransactionIds,
      partialLastRow,
    };
  }

  // THORX v3 (spec Part E.7) — a withdrawal request is denominated in
  // TX-Points (insertWithdrawal.amount). The PKR breakdown is computed
  // up-front (fail fast on insufficient ledger balance / below minimum) but
  // is NOT persisted as a deduction yet — points are only marked withdrawn
  // once an admin approves via processWithdrawal, which recomputes the
  // breakdown fresh against the ledger as of approval time.
  async createWithdrawal(insertWithdrawal: InsertWithdrawal): Promise<Withdrawal> {
    const _amtD = new Decimal(insertWithdrawal.amount);
    if (_amtD.isNaN() || !_amtD.isFinite() || _amtD.lte(0)) {
      throw new Error("INVALID_AMOUNT: withdrawal amount must be a positive number");
    }
    const pointsRequested = _amtD.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber();

    // ALL pre-flight checks (balance, minimum payout, S-Rank status) and the
    // INSERT are now inside a single transaction with a SELECT FOR UPDATE on the
    // user row — eliminates the TOCTOU race where two concurrent requests both
    // pass the balance check before either INSERT commits (audit finding D).
    try {
      return await db.transaction(async (tx) => {
        // Lock the user row — any concurrent withdrawal for the same user
        // will block here until this transaction commits or rolls back.
        const [lockedUser] = await tx
          .select({ userRankTier: users.userRankTier })
          .from(users)
          .where(eq(users.id, insertWithdrawal.userId))
          .for('update');

        if (!lockedUser) throw new Error("User not found");

        // Balance / breakdown check with row locked — safe from concurrent writes.
        const breakdown = await this.calculateWithdrawalBreakdown(insertWithdrawal.userId, pointsRequested);
        const minPayout = await this.getSystemConfigValue<number>("MIN_PAYOUT", 100);
        if (new Decimal(breakdown.exactPkr).lessThan(minPayout)) {
          throw new Error(`Minimum payout requirement not met. Threshold: Rs.${minPayout}.`);
        }

        // S-Rank status from the locked row — no second DB trip needed.
        const initialStatus: string = lockedUser.userRankTier === 'S-Rank' ? 'approved' : 'pending';

        // Block duplicate withdrawals for both 'pending' (normal) and 'approved'
        // (S-Rank fast-track). Without checking 'approved', two concurrent S-Rank
        // requests could both pass this check (since neither is 'pending') and
        // both insert, creating duplicate approved withdrawals. The DB partial
        // indexes uniq_withdrawals_one_pending_per_user and
        // uniq_withdrawals_one_approved_per_user are the backstop, but the
        // application-level check gives a user-friendly error first.
        const [pending] = await tx
          .select({ id: withdrawals.id })
          .from(withdrawals)
          .where(and(
            eq(withdrawals.userId, insertWithdrawal.userId),
            sql`${withdrawals.status} IN ('pending', 'approved')`,
          ))
          .limit(1);
        if (pending) {
          throw new Error("A pending payout request already exists for this account.");
        }

        const [withdrawal] = await tx
          .insert(withdrawals)
          .values({
            ...insertWithdrawal,
            amount: pointsRequested.toString(),
            fee: new Decimal(breakdown.platformFee).toFixed(2),
            netAmount: new Decimal(breakdown.userNetPkr).toFixed(2),
            status: initialStatus,
          })
          .returning();

        return withdrawal;
      });
    } catch (err: any) {
      // Postgres unique_violation on uniq_withdrawals_one_pending_per_user —
      // translate the DB-level guarantee into the same friendly error whether
      // it arrives from the in-transaction check or the index.
      if (err?.code === "23505" || err?.message?.includes("pending payout")) {
        throw new Error("A pending payout request already exists for this account.");
      }
      throw err;
    }
  }

  async getWithdrawalsByUserId(userId: string, limit = 50, offset = 0): Promise<Withdrawal[]> {
    return await db.select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getCheckPendingWithdrawal(userId: string): Promise<Withdrawal | undefined> {
    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(and(eq(withdrawals.userId, userId), eq(withdrawals.status, "pending")))
      .limit(1);
    return withdrawal;
  }

  // THORX v3 (spec Part E.7) — finalizes a payout against the immutable
  // ledger: marks the consumed user_transactions rows withdrawn, deducts the
  // points from the user's TX-Points balance, pays the 1-tier referral
  // commission (Appendix A #4) into the referrer's separate cash wallet
  // (Appendix A #5 — never mixed with txPointsBalance), audit-logs the
  // action (Appendix A #10), and emits a live feed event + notification.
  // Critical finding #1 of the 2026-07-15 production-readiness audit: the
  // pending-status check used to happen BEFORE the transaction opened, with
  // no row lock, so two concurrent approvals of the same withdrawal could
  // both pass the check and both execute the payout. Fix: lock the
  // withdrawal row with SELECT ... FOR UPDATE as the very first statement
  // inside the transaction, and re-check status only after the lock is held.
  // A second concurrent call blocks on the lock, then sees status !=
  // 'pending' once it acquires it, and throws instead of double-paying.
  async processWithdrawal(withdrawalId: string, adminId: string, transactionId?: string): Promise<Withdrawal> {
    let breakdown!: Awaited<ReturnType<DatabaseStorage["calculateWithdrawalBreakdown"]>>;
    let withdrawalUserId!: string;

    const updated = await db.transaction(async (tx) => {
      const [withdrawal] = await tx
        .select()
        .from(withdrawals)
        .where(eq(withdrawals.id, withdrawalId))
        .for("update");

      if (!withdrawal) throw new Error("Withdrawal not found");
      // Accept 'pending' (normal flow), 'approved' (S-Rank fast-track —
      // createWithdrawal sets status='approved' for S-Rank users to skip the admin
      // approval queue, but the financial settlement — FIFO ledger consumption,
      // balance debit, referral commission — still happens here at processing time),
      // and 'processing' (admin-set non-terminal marker, no ledger effect yet —
      // must still be completable or it becomes a dead end).
      if (withdrawal.status !== "pending" && withdrawal.status !== "approved" && withdrawal.status !== "processing") {
        throw new Error("Withdrawal is not in a processable state");
      }

      withdrawalUserId = withdrawal.userId;
      // F-02: Use Decimal to parse the stored amount — parseInt silently truncates
      // decimals and can produce wrong point counts. Decimal.ROUND_FLOOR matches
      // the behaviour of createWithdrawal so the two call sites are consistent.
      const _amtD = new Decimal(withdrawal.amount);
      if (_amtD.isNaN() || !_amtD.isFinite() || _amtD.lte(0)) {
        throw new Error(`Withdrawal amount is invalid: "${withdrawal.amount}"`);
      }
      const pointsRequested = _amtD.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber();
      breakdown = await this.calculateWithdrawalBreakdown(withdrawal.userId, pointsRequested, tx);

      // C1-04: Wrap breakdown numbers in Decimal immediately — native float arithmetic
      // on DECIMAL columns accumulates sub-paisa drift; all subsequent math uses Decimal.
      const exactPkrD = new Decimal(breakdown.exactPkr.toString());
      const platformFeeD = new Decimal(breakdown.platformFee.toString());
      const referralCommissionD = new Decimal(breakdown.referralCommission.toString());
      const userNetPkrD = new Decimal(breakdown.userNetPkr.toString());
      // thorxFeeShare = platformFee - referralCommission (Spec §18.2)
      const thorxShareD = platformFeeD.minus(referralCommissionD);
      const [updatedWithdrawal] = await tx
        .update(withdrawals)
        .set({
          status: "completed",
          transactionId: transactionId || null,
          fee: platformFeeD.toFixed(4),
          netAmount: userNetPkrD.toFixed(4),
          thorxFeeShare: thorxShareD.toFixed(4),
          referralCommissionPaid: referralCommissionD.toFixed(4),
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(withdrawals.id, withdrawalId))
        .returning();

      await tx
        .update(users)
        .set({
          txPointsBalance:  sql`${users.txPointsBalance}  - ${pointsRequested}`,
          // The specification defines both lifetime withdrawn and available
          // balance in terms of the net amount paid to the user. The platform
          // fee is recorded separately on the withdrawal row.
          totalWithdrawn:   sql`${users.totalWithdrawn}   + ${userNetPkrD.toFixed(4)}`,
          availableBalance: sql`${users.availableBalance} - ${userNetPkrD.toFixed(4)}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, withdrawal.userId));

      // ── Split-remainder: insert the unused portion of the partial last row ──
      // If the FIFO loop partially consumed the last ledger row (i.e. only a
      // fraction of its pointsCredited was needed), we insert a new
      // split_remainder row for the leftover portion BEFORE marking the
      // original row withdrawn. This preserves full ledger integrity:
      //   • original row → marked withdrawn (consumed fraction only, PKR exact)
      //   • new split row → unwithdrawn, carries the remainder for future use
      // Both the INSERT and the UPDATE below are inside the same transaction,
      // so there is no window where the remainder points can be double-counted
      // or lost.
      if (breakdown.partialLastRow && breakdown.partialLastRow.pointsRemainder > 0) {
        const plr = breakdown.partialLastRow;
        await tx.insert(userTransactions).values({
          userId:         withdrawal.userId,
          engineType:     plr.engineType,
          pointsCredited: plr.pointsRemainder,
          realPkrValue:   plr.pkrRemainder,
          grossPkr:       plr.grossPkr,
          thorxProfitPkr: plr.thorxProfitPkr ?? null,
          guildPoolPkr:   plr.guildPoolPkr   ?? null,
          conversionRate: plr.conversionRate,
          cardVariance:   plr.cardVariance,
          // Tie back to the original row so audit queries can reconstruct the
          // full earn event; the partial-unique index on (source_id, source_type)
          // guarantees at most one split_remainder per original row.
          sourceId:       `split:${plr.originalId}`,
          sourceType:     "split_remainder",
          withdrawn:      false,
          withdrawalId:   null,
        });
        logger.info(
          {
            originalId:      plr.originalId,
            pointsRemainder: plr.pointsRemainder,
            pkrRemainder:    plr.pkrRemainder,
            withdrawalId,
          },
          "[processWithdrawal] Inserted split_remainder row for partial last FIFO row."
        );
      }

      if (breakdown.consumedTransactionIds.length > 0) {
        await tx
          .update(userTransactions)
          .set({ withdrawn: true, withdrawalId })
          .where(inArray(userTransactions.id, breakdown.consumedTransactionIds));
      }

      // 1-tier referral commission only (Appendix A #4) — paid from the
      // platform fee into the referrer's balanceCashPkr, never txPointsBalance.
      if (breakdown.referrerId && referralCommissionD.gt(0)) {
        const feeRateUsed = new Decimal(await this.getSystemConfigValue<number>("WITHDRAWAL_FEE_PCT", 15)).div(100);
        const refShareRateUsed = new Decimal(await this.getSystemConfigValue<number>("REFERRAL_FEE_SHARE_PCT", 50)).div(100);

        await tx
          .update(users)
          .set({
            balanceCashPkr: sql`${users.balanceCashPkr} + ${referralCommissionD.toFixed(4)}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, breakdown.referrerId));

        await tx.insert(referralCommissions).values({
          referrerId: breakdown.referrerId,
          inviteeId: withdrawalUserId,
          withdrawalId,
          commissionAmountPkr: referralCommissionD.toFixed(4),
          inviteeNetPkr: userNetPkrD.toFixed(4),
          platformFeePkr: platformFeeD.toFixed(4),
          feeRateUsed: feeRateUsed.toFixed(4),
          refShareRateUsed: refShareRateUsed.toFixed(4),
        });
        // Note: commission_logs is frozen/deprecated (Appendix A #4) — do not write to it.
      }

      await tx.insert(auditLogs).values({
        adminId,
        action: "WITHDRAWAL_COMPLETED",
        targetType: "withdrawal",
        targetId: withdrawalId,
        details: { ...breakdown, reason: `Approved payout of Rs.${userNetPkrD.toFixed(2)}` } as any,
      });

      return updatedWithdrawal;
    });

    const user = await this.getUserById(withdrawalUserId);
    await emitFeedEvent({
      type: "withdrawal",
      userId: withdrawalUserId,
      displayMessage: `Payout approved: '${user?.identity ?? withdrawalUserId}' → Rs.${new Decimal(breakdown.userNetPkr.toString()).toFixed(2)} | Fee: Rs.${new Decimal(breakdown.platformFee.toString()).toFixed(2)}${new Decimal(breakdown.referralCommission.toString()).gt(0) ? ` | Ref: Rs.${new Decimal(breakdown.referralCommission.toString()).toFixed(2)}` : ""}`,
      data: breakdown,
    });

    await this.createNotification({
      userId: withdrawalUserId,
      title: "Payout Processed",
      message: `Rs.${new Decimal(breakdown.userNetPkr.toString()).toFixed(2)} sent to your account.${transactionId ? ` Transaction: ${transactionId}` : ""}`,
      type: "system",
    });

    return updated;
  }

  // Reject withdrawal — no balance refund needed since createWithdrawal
  // never deducts points/PKR up front under the v3 ledger model.
  async rejectWithdrawal(withdrawalId: string, adminId: string, reason: string): Promise<Withdrawal> {
    // Same row-lock discipline as processWithdrawal — prevents a reject
    // racing an in-flight approval of the same withdrawal.
    return await db.transaction(async (tx) => {
      const [withdrawal] = await tx
        .select()
        .from(withdrawals)
        .where(eq(withdrawals.id, withdrawalId))
        .for("update");

      if (!withdrawal) throw new Error("Withdrawal not found");
      // Accept 'pending', 'approved' (S-Rank fast-track — admins must still be able
      // to block a fast-tracked payout flagged by the ledger-mismatch check), and
      // 'processing'. Mirrors the guard in processWithdrawal so neither terminal
      // action ever dead-ends on a non-pending, non-terminal status.
      if (withdrawal.status !== "pending" && withdrawal.status !== "approved" && withdrawal.status !== "processing") {
        throw new Error("Withdrawal is not in a rejectable state");
      }

      const [updatedWithdrawal] = await tx
        .update(withdrawals)
        .set({
          status: "rejected",
          rejectionReason: reason,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(withdrawals.id, withdrawalId))
        .returning();

      // Ledger-audit fix (2026-07-29, CRITICAL): createReferralCashWithdrawal
      // debits balanceCashPkr immediately when the request is created (unlike
      // normal earnings withdrawals, whose balance is only touched later in
      // processWithdrawal) — see spec E.9. Rejecting a referral:* withdrawal
      // previously never refunded that pre-deducted amount, so every rejected
      // referral cash-out permanently destroyed real user money with no
      // corresponding ledger entry or recovery path.
      if (updatedWithdrawal.method?.startsWith("referral:")) {
        await tx.update(users)
          .set({ balanceCashPkr: sql`${users.balanceCashPkr} + ${updatedWithdrawal.amount}` })
          .where(eq(users.id, updatedWithdrawal.userId));
      }

      // Audit log written inside the transaction — atomically consistent with the
      // status update. The route handler writes a second log for belt-and-suspenders
      // visibility, but this one is the authoritative record even if the route fails.
      await tx.insert(auditLogs).values({
        adminId,
        action: "WITHDRAWAL_REJECTED",
        targetType: "withdrawal",
        targetId: withdrawalId,
        details: {
          status: "rejected",
          amount: updatedWithdrawal.amount,
          beneficiary: updatedWithdrawal.userId,
          rejectionReason: reason,
          referralCashRefunded: updatedWithdrawal.method?.startsWith("referral:") ? updatedWithdrawal.amount : undefined,
        },
      });

      return updatedWithdrawal;
    });
  }

  // ── Guilds: CRUD, join/approve flow, vault & ledger reads ────────────────────
  // Join flow is request-then-captain-approval (not instant) per master plan.
  async createGuild(params: { name: string; description?: string; captainId: string }): Promise<Guild> {
    return await db.transaction(async (tx) => {
      const existing = await this.getActiveGuildMembershipTx(tx, params.captainId);
      if (existing) {
        throw new Error("You are already in a guild. Leave your current guild before creating a new one.");
      }
      const [guild] = await tx.insert(guilds).values({
        name: params.name,
        description: params.description,
        captainId: params.captainId,
      }).returning();

      await tx.insert(guildMembers).values({
        guildId: guild.id,
        userId: params.captainId,
        role: "captain",
        status: "active",
        joinedAt: new Date(),
      });

      // Keep users.guildId / users.guildRole in sync with guild_members
      await tx.update(users).set({
        guildId: guild.id,
        guildRole: "captain",
      }).where(eq(users.id, params.captainId));

      return guild;
    });
  }

  async listGuilds(filters?: { search?: string; limit?: number; offset?: number }): Promise<{ guilds: Guild[]; total: number }> {
    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;
    const conditions = [eq(guilds.isPublic, true), sql`${guilds.status} != 'disbanded'`];
    if (filters?.search) {
      conditions.push(sql`${guilds.name} ILIKE ${'%' + filters.search + '%'}`);
    }
    const rows = await db.select().from(guilds).where(and(...conditions)).orderBy(desc(guilds.guildScore)).limit(limit).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(guilds).where(and(...conditions));
    return { guilds: rows, total: Number(total) };
  }

  async getGuildById(guildId: string): Promise<Guild | undefined> {
    const [guild] = await db.select().from(guilds).where(eq(guilds.id, guildId));
    return guild;
  }

  async getGuildMembers(guildId: string): Promise<Array<GuildMember & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatar' | 'userRankTier' | 'profilePicture'> }>> {
    return await db
      .select({
        id: guildMembers.id,
        guildId: guildMembers.guildId,
        userId: guildMembers.userId,
        role: guildMembers.role,
        status: guildMembers.status,
        requestedAt: guildMembers.requestedAt,
        joinedAt: guildMembers.joinedAt,
        leftAt: guildMembers.leftAt,
        weeklyPointsContributed: guildMembers.weeklyPointsContributed,
        isMvp: guildMembers.isMvp,
        mvpSetAt: guildMembers.mvpSetAt,
        mvpSetWeek: guildMembers.mvpSetWeek,
        lastNudgedAt: guildMembers.lastNudgedAt,
        coverLetter: guildMembers.coverLetter,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
          userRankTier: users.userRankTier,
          profilePicture: users.profilePicture,
        },
      })
      .from(guildMembers)
      .innerJoin(users, eq(users.id, guildMembers.userId))
      .where(eq(guildMembers.guildId, guildId))
      .orderBy(desc(guildMembers.status), guildMembers.requestedAt);
  }

  async getUserGuildMembership(userId: string): Promise<(GuildMember & { guild: Guild }) | undefined> {
    const [row] = await db
      .select({ membership: guildMembers, guild: guilds })
      .from(guildMembers)
      .innerJoin(guilds, eq(guildMembers.guildId, guilds.id))
      .where(and(eq(guildMembers.userId, userId), sql`${guildMembers.status} IN ('pending', 'active')`))
      .orderBy(desc(guildMembers.requestedAt))
      .limit(1);
    if (!row) return undefined;
    return { ...row.membership, guild: row.guild };
  }

  async requestToJoinGuild(guildId: string, userId: string): Promise<GuildMember> {
    return await db.transaction(async (tx) => {
      const existing = await this.getActiveGuildMembershipTx(tx, userId);
      if (existing) {
        throw new Error("You are already in a guild.");
      }
      const [pendingExisting] = await tx
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.userId, userId), eq(guildMembers.status, "pending")))
        .limit(1);
      if (pendingExisting) {
        throw new Error("You already have a pending join request.");
      }
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.status !== "active") throw new Error("This guild is not accepting new members right now.");

      const [membership] = await tx.insert(guildMembers).values({
        guildId,
        userId,
        role: "member",
        status: "pending",
      }).returning();
      return membership;
    });
  }

  async decideGuildJoinRequest(guildId: string, memberUserId: string, captainId: string, approve: boolean): Promise<GuildMember> {
    return await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.captainId !== captainId) throw new Error("Only the guild captain can decide join requests.");

      const [membership] = await tx
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, memberUserId), eq(guildMembers.status, "pending")))
        .limit(1);
      if (!membership) throw new Error("No pending join request found for this user.");

      const [updated] = await tx
        .update(guildMembers)
        .set({
          status: approve ? "active" : "rejected",
          joinedAt: approve ? new Date() : null,
        })
        .where(eq(guildMembers.id, membership.id))
        .returning();

      if (approve) {
        await tx.update(guilds).set({
          memberCount: sql`${guilds.memberCount} + 1`,
          updatedAt: new Date(),
        }).where(eq(guilds.id, guildId));

        // Keep users.guildId / users.guildRole in sync with guild_members
        await tx.update(users).set({
          guildId,
          guildRole: "member",
        }).where(eq(users.id, memberUserId));
      }

      return updated;
    });
  }

  async leaveGuild(guildId: string, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.captainId === userId) {
        throw new Error("The captain cannot leave the guild. Transfer captaincy or disband the guild instead.");
      }
      const result = await tx
        .update(guildMembers)
        .set({ status: "left", leftAt: new Date() })
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId), eq(guildMembers.status, "active")))
        .returning();
      if (result.length === 0) throw new Error("You are not an active member of this guild.");

      await tx.update(guilds).set({
        memberCount: sql`GREATEST(${guilds.memberCount} - 1, 0)`,
        updatedAt: new Date(),
      }).where(eq(guilds.id, guildId));

      // Clear guild association from the user's record
      await tx.update(users).set({
        guildId: null,
        guildRole: "simple",
      }).where(eq(users.id, userId));
    });
  }

  async removeGuildMember(guildId: string, targetUserId: string, captainId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.captainId !== captainId) throw new Error("Only the guild captain can remove members.");
      if (targetUserId === captainId) throw new Error("The captain cannot remove themselves.");

      const result = await tx
        .update(guildMembers)
        .set({ status: "left", leftAt: new Date() })
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, targetUserId), eq(guildMembers.status, "active")))
        .returning();
      if (result.length === 0) throw new Error("This user is not an active member of this guild.");

      await tx.update(guilds).set({
        memberCount: sql`GREATEST(${guilds.memberCount} - 1, 0)`,
        updatedAt: new Date(),
      }).where(eq(guilds.id, guildId));

      // Clear guild association from the removed user's record
      await tx.update(users).set({
        guildId: null,
        guildRole: "simple",
      }).where(eq(users.id, targetUserId));
    });
  }

  async getPointsLedgerForUser(userId: string, limit = 50, offset = 0): Promise<{ entries: PointsLedger[]; total: number }> {
    const entries = await db
      .select()
      .from(pointsLedger)
      .where(eq(pointsLedger.userId, userId))
      .orderBy(desc(pointsLedger.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(pointsLedger).where(eq(pointsLedger.userId, userId));
    return { entries, total: Number(total) };
  }

  // ── Admin/team guild moderation ──────────────────────────────────────────────
  async listGuildsAdmin(filters?: { status?: string; search?: string; limit?: number; offset?: number }): Promise<{ guilds: (Guild & { guildRank: GuildRankTier; nextRankMinGps: number | null })[]; total: number }> {
    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;
    const conditions = [];
    if (filters?.status) conditions.push(eq(guilds.status, filters.status));
    if (filters?.search) conditions.push(sql`${guilds.name} ILIKE ${'%' + filters.search + '%'}`);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select().from(guilds).where(where).orderBy(desc(guilds.createdAt)).limit(limit).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(guilds).where(where);

    // guildRank has no backing column (GPS-derived only — see gps-engine.ts).
    // Compute it here so the admin UI never has to guess/re-derive thresholds.
    const config = await fetchGpsConfig();
    const rankOrder = GUILD_RANK_TIERS;
    const guildsWithRank = rows.map(g => {
      const guildRank = computeGuildRankTier(g.guildPerformanceScore, config.rankMins);
      const nextTier = rankOrder[rankOrder.indexOf(guildRank) + 1];
      const nextRankMinGps = nextTier ? config.rankMins[`GPS_RANK_${nextTier[0]}_MIN`] : null;
      return { ...g, guildRank, nextRankMinGps: nextRankMinGps ?? null };
    });

    return { guilds: guildsWithRank, total: Number(total) };
  }

  async setGuildStatus(guildId: string, status: "active" | "frozen" | "disbanded", adminId: string): Promise<Guild> {
    return await db.transaction(async (tx) => {
      const before = await tx.select({ status: guilds.status }).from(guilds).where(eq(guilds.id, guildId)).limit(1);
      const [guild] = await tx.update(guilds).set({ status, updatedAt: new Date() }).where(eq(guilds.id, guildId)).returning();
      if (!guild) throw new Error("Guild not found");

      // When disbanding, clear all active members' guild associations atomically
      if (status === "disbanded") {
        const activeMembers = await tx
          .select({ userId: guildMembers.userId })
          .from(guildMembers)
          .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.status, "active")));

        if (activeMembers.length > 0) {
          for (const m of activeMembers) {
            await tx.update(users).set({ guildId: null, guildRole: "simple" }).where(eq(users.id, m.userId));
          }
        }

        await tx.update(guildMembers)
          .set({ status: "left", leftAt: new Date() })
          .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.status, "active")));
      }

      await tx.insert(auditLogs).values({
        adminId,
        action: "GUILD_STATUS_CHANGED",
        targetType: "guild",
        targetId: guildId,
        details: { from: before[0]?.status ?? null, to: status, guildName: guild.name },
      });

      return guild;
    });
  }

  async addManualGuildStrike(guildId: string, reason: string, addedBy: string): Promise<{ guild: Guild; strike: GuildStrike }> {
    return await db.transaction(async (tx) => {
      const [strike] = await tx.insert(guildStrikes).values({ guildId, reason, source: "admin", addedBy }).returning();
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(guildStrikes)
        .where(and(eq(guildStrikes.guildId, guildId), sql`${guildStrikes.clearedAt} IS NULL`));
      const strikeCount = Number(count) || 0;
      const updates: Record<string, any> = { strikes: strikeCount, updatedAt: new Date() };
      if (strikeCount >= 3) updates.status = "frozen";
      const [guild] = await tx.update(guilds).set(updates).where(eq(guilds.id, guildId)).returning();

      await tx.insert(auditLogs).values({
        adminId: addedBy,
        action: "GUILD_STRIKE_ADDED",
        targetType: "guild",
        targetId: guildId,
        details: { reason, strikeCount, autoFrozen: strikeCount >= 3, guildName: guild.name },
      });

      return { guild, strike };
    });
  }

  async clearGuildStrikes(guildId: string, clearedBy: string): Promise<Guild> {
    return await db.transaction(async (tx) => {
      const cleared = await tx
        .update(guildStrikes)
        .set({ clearedAt: new Date(), clearedBy })
        .where(and(eq(guildStrikes.guildId, guildId), sql`${guildStrikes.clearedAt} IS NULL`))
        .returning({ id: guildStrikes.id });
      const [guild] = await tx.update(guilds).set({ strikes: 0, updatedAt: new Date() }).where(eq(guilds.id, guildId)).returning();

      await tx.insert(auditLogs).values({
        adminId: clearedBy,
        action: "GUILD_STRIKES_CLEARED",
        targetType: "guild",
        targetId: guildId,
        details: { clearedCount: cleared.length, guildName: guild?.name },
      });

      return guild;
    });
  }

  // Get rank history for a user (kept for audit trail)
  async getRankHistory(userId: string): Promise<RankLog[]> {
    return await db
      .select()
      .from(rankLogs)
      .where(eq(rankLogs.userId, userId))
      .orderBy(desc(rankLogs.createdAt));
  }

  // Real-time Dashboard & Analytics Methods
  async getDashboardStats(userId: string) {
    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");

    // R-16: Use PKT (UTC+5) for day/week/month boundaries so that "today"
    // matches the user's local midnight rather than the server's UTC midnight.
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const nowPkt = new Date(Date.now() + PKT_OFFSET_MS);
    // Truncate to midnight PKT, then convert back to UTC for DB comparisons
    const todayPktMidnight = new Date(
      Math.floor(nowPkt.getTime() / 86_400_000) * 86_400_000 - PKT_OFFSET_MS
    );
    const today = todayPktMidnight;
    const tomorrow = new Date(today.getTime() + 86_400_000);

    // Get this week's date range (week starts on Sunday in PKT)
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getUTCDay());

    // Get this month's date range (1st of month in PKT)
    const nowUtcForMonth = new Date(today);
    const monthStart = new Date(Date.UTC(nowPkt.getUTCFullYear(), nowPkt.getUTCMonth(), 1) - PKT_OFFSET_MS);

    // Today's earnings
    const [todayEarningsResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${earnings.amount}), '0.00')` })
      .from(earnings)
      .where(and(
        eq(earnings.userId, userId),
        sql`${earnings.createdAt} >= ${today}`,
        sql`${earnings.createdAt} < ${tomorrow}`
      ));

    // Weekly earnings
    const [weeklyEarningsResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${earnings.amount}), '0.00')` })
      .from(earnings)
      .where(and(
        eq(earnings.userId, userId),
        sql`${earnings.createdAt} >= ${weekStart}`
      ));

    // Monthly earnings
    const [monthlyEarningsResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${earnings.amount}), '0.00')` })
      .from(earnings)
      .where(and(
        eq(earnings.userId, userId),
        sql`${earnings.createdAt} >= ${monthStart}`
      ));

    // Referral stats
    const referralStats = await this.getReferralStats(userId);

    // R-01: Read referral earnings from the live referral_commissions table.
    // commission_logs is write-frozen; all new commissions flow through
    // processWithdrawal → referral_commissions. Reading commissionLogs here
    // always returned 0.00 for every user who earned referral commissions.
    const [referralEarningsResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${referralCommissions.commissionAmountPkr}), '0.00')` })
      .from(referralCommissions)
      .where(eq(referralCommissions.referrerId, userId));

    // Today's ad views
    const adsWatchedToday = await this.getTodayAdViews(userId);

    // Total ad views
    const [totalAdViewsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(adViews)
      .where(eq(adViews.userId, userId));

    // R-08: Read the daily ad goal from systemConfig so admin changes take
    // effect on the progress bar without requiring a code deployment.
    const dailyGoal = await this.getSystemConfigValue<number>("MAX_ADS_PER_DAY", 20);
    const dailyGoalProgress = Math.min((adsWatchedToday / dailyGoal) * 100, 100);

    return {
      totalEarnings: user.totalEarnings || "0.00",
      availableBalance: user.availableBalance || "0.00",
      pendingBalance: user.pendingBalance || "0.00",
      todayEarnings: todayEarningsResult?.total || "0.00",
      weeklyEarnings: weeklyEarningsResult?.total || "0.00",
      monthlyEarnings: monthlyEarningsResult?.total || "0.00",
      referralCount: referralStats.count,
      referralEarnings: referralEarningsResult?.total || "0.00",
      adsWatchedToday,
      adsWatchedTotal: totalAdViewsResult?.count || 0,
      dailyGoal,
      dailyGoalProgress,
      // THORX v3 fields (spec B.2, F.2)
      txPointsBalance: user.txPointsBalance ?? 0,
      performanceScore: user.performanceScore ?? 0,
      userRankTier: user.userRankTier || 'E-Rank',
      guildRole: user.guildRole || 'simple',
      guildId: user.guildId || null,
      streakDays: user.streakDays ?? 0,
      balanceCashPkr: user.balanceCashPkr ?? '0.00',
      lastActiveAt: user.lastActiveAt,
    };
  }

  async getEarningsHistory(userId: string, period: 'week' | 'month' | 'year') {
    const now = new Date();
    let startDate: Date;
    let groupByFormat: string;

    switch (period) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        groupByFormat = 'YYYY-MM-DD';
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        groupByFormat = 'YYYY-MM-DD';
        break;
      case 'year':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 12);
        groupByFormat = 'YYYY-MM';
        break;
      default:
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        groupByFormat = 'YYYY-MM-DD';
        break;
    }

    const sqlFormat = sql.raw(`'${groupByFormat}'`);

    const results = await db
      .select({
        date: sql<string>`TO_CHAR(${earnings.createdAt}, ${sqlFormat})`,
        amount: sql<string>`COALESCE(SUM(${earnings.amount}), '0.00')`
      })
      .from(earnings)
      .where(and(
        eq(earnings.userId, userId),
        sql`${earnings.createdAt} >= ${startDate}`
      ))
      .groupBy(sql`TO_CHAR(${earnings.createdAt}, ${sqlFormat})`)
      .orderBy(sql`TO_CHAR(${earnings.createdAt}, ${sqlFormat})`);

    return results;
  }

  async getReferralLeaderboard(userId: string) {
    try {
      logger.info({ userId }, '[ReferralTree] Fetching direct referrals for user');

      // Single-tier system: the tree only ever shows direct referrals. A
      // referral's own downstream signups belong to them, not to userId, and
      // generate no commission for userId — there is no Level-2 to display.
      // Only real, active members count — team/admin/founder accounts and
      // deactivated users must never appear here.
      const directReferrals = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avatar: users.avatar,
          userRankTier: users.userRankTier,
          createdAt: users.createdAt,
          referredBy: users.referredBy,
          totalEarnings: users.totalEarnings,
          profilePicture: users.profilePicture
        })
        .from(users)
        .where(and(
          eq(users.referredBy, userId),
          eq(users.role, "user"),
          eq(users.isActive, true)
        ))
        .orderBy(desc(users.createdAt))
        .limit(100);

      logger.info({ count: directReferrals.length }, '[ReferralTree] Found direct referrals (capped at 100)');

      if (directReferrals.length === 0) {
        return [];
      }

      // Pull real per-referral commission totals in one batch instead of
      // hardcoding "0.00" — this is how much userId actually earned from each
      // direct referral. The current single-tier system pays the direct
      // referrer from two live tables: a share of the referred user's
      // withdrawal fee (referral_commissions) and 1% of their earn events
      // (referral_earn_commissions). commission_logs is frozen/dead (see
      // processWithdrawal) and must never be read for current totals.
      const referredIds = directReferrals.map(u => u.id);

      const [withdrawalRows, earnRows] = await Promise.all([
        db
          .select({
            inviteeId: referralCommissions.inviteeId,
            total: sql<string>`COALESCE(SUM(${referralCommissions.commissionAmountPkr}), '0.00')`
          })
          .from(referralCommissions)
          .where(and(
            eq(referralCommissions.referrerId, userId),
            inArray(referralCommissions.inviteeId, referredIds)
          ))
          .groupBy(referralCommissions.inviteeId),
        db
          .select({
            earnerId: referralEarnCommissions.earnerId,
            total: sql<string>`COALESCE(SUM(${referralEarnCommissions.commissionPkr}), '0.00')`
          })
          .from(referralEarnCommissions)
          .where(and(
            eq(referralEarnCommissions.referrerId, userId),
            inArray(referralEarnCommissions.earnerId, referredIds)
          ))
          .groupBy(referralEarnCommissions.earnerId)
      ]);

      const earningsByUser = new Map<string, Decimal>();
      for (const row of withdrawalRows) {
        earningsByUser.set(row.inviteeId, new Decimal(row.total || '0'));
      }
      for (const row of earnRows) {
        const existing = earningsByUser.get(row.earnerId) ?? new Decimal(0);
        earningsByUser.set(row.earnerId, existing.plus(row.total || '0'));
      }

      // Rank by how much each referral has actually earned userId — the most
      // valuable relationships surface first, ties keep newest-first order.
      const combined = directReferrals
        .map((u) => ({
          ...u,
          earningsFromUser: (earningsByUser.get(u.id) ?? new Decimal(0)).toFixed(2),
          level: 1,
          referredBy: userId
        }))
        .sort((a, b) => parseFloat(b.earningsFromUser) - parseFloat(a.earningsFromUser));

      return combined;
    } catch (error) {
      logger.error({ err: error }, "[ReferralTree] Error fetching leaderboard");
      // Return empty array instead of throwing to prevent loading loop
      return [];
    }
  }

  async getTransactionHistory(userId: string, limit: number = 50) {
    // Get earnings
    const earningsData = await db
      .select()
      .from(earnings)
      .where(eq(earnings.userId, userId))
      .orderBy(desc(earnings.createdAt))
      .limit(limit);

    // Get withdrawals
    const withdrawalsData = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(limit);

    // Get commissions
    const commissionsData = await db
      .select()
      .from(commissionLogs)
      .where(eq(commissionLogs.beneficiaryId, userId))
      .orderBy(desc(commissionLogs.createdAt))
      .limit(limit);

    // Combine and format — null-coalesce all dates to satisfy IStorage interface
    const transactions = [
      ...earningsData.map(e => ({
        id: e.id,
        type: 'earning' as const,
        amount: e.amount,
        status: e.status ?? 'completed',
        date: e.createdAt ?? new Date(),
        description: e.description || 'Ad viewing'
      })),
      ...withdrawalsData.map(w => ({
        id: w.id,
        type: 'withdrawal' as const,
        amount: w.amount,
        status: w.status ?? 'pending',
        date: w.createdAt ?? new Date(),
        description: `Withdrawal via ${w.method}`
      })),
      ...commissionsData.map(c => ({
        id: c.id,
        type: 'commission' as const,
        amount: c.amount,
        status: c.status ?? 'pending',
        date: c.createdAt ?? new Date(),
        description: `Level ${c.level} referral commission`
      }))
    ];

    // Sort by date and limit
    return transactions
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);
  }

  // Admin Features Implementation
  async getLeaderboardInsights(limit: number = 50, offset: number = 0, search?: string): Promise<{ 
    globalRanking: any[]; 
    topReferrers: any[]; 
    anomalies: any[]; 
    totalCount: number;
    totalActiveUsers: number;
    lastUpdated: Date;
    isStale: boolean;
  }> {
    // Check for existing cache to determine if refresh is needed
    const lastCacheEntry = await db.select({ recordedAt: leaderboardCache.recordedAt })
      .from(leaderboardCache)
      .orderBy(desc(leaderboardCache.recordedAt))
      .limit(1);
    
    const now = new Date();
    // Q4 architectural decision (2026-07-17): leaderboard refresh is now driven
    // exclusively by the 15-minute cron in server/jobs/leaderboard-refresh.ts
    // (interval raised from 5 -> 15 min per Q6 decision — see that file).
    // Triggering refresh on every getLeaderboard() call (or earn event) caused
    // full-table heap allocation at scale — a memory bomb. The cron approach
    // gives a bounded staleness window with zero per-request overhead.
    // Audit fix: threshold was a stale 1-hour magic number left over from
    // before the Q6 interval change. Now 2x the real cron interval (30 min),
    // matching the same convention already used by the leaderboardRefresh
    // health check in routes.ts (LEADERBOARD_INTERVAL_MS * 2) — keep both in
    // sync if the cron interval ever changes again.
    const LEADERBOARD_STALE_THRESHOLD_MS = 15 * 60 * 1000 * 2;
    const isStale = !lastCacheEntry.length || (now.getTime() - new Date(lastCacheEntry[0].recordedAt!).getTime() > LEADERBOARD_STALE_THRESHOLD_MS);
    if (isStale) {
      logger.warn("[Leaderboard] Cache is stale — cron may be behind schedule or has not run yet.");
    }

    // Search filters at the DB level so it applies across the *entire*
    // leaderboard, not just whatever page happens to be loaded client-side.
    const trimmedSearch = search?.trim();
    const searchCondition = trimmedSearch
      ? sql`(${users.firstName} ILIKE ${'%' + trimmedSearch + '%'} OR ${users.lastName} ILIKE ${'%' + trimmedSearch + '%'} OR ${users.email} ILIKE ${'%' + trimmedSearch + '%'} OR (${users.firstName} || ' ' || ${users.lastName}) ILIKE ${'%' + trimmedSearch + '%'})`
      : undefined;

    // 1. Get Global Ranking (with pagination)
    const globalRankingQuery = db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      userRankTier: users.userRankTier,
      totalEarnings: users.totalEarnings,
      availableBalance: users.availableBalance,
      isVerified: users.isVerified,
      trustStatus: users.trustStatus,
      avatar: users.avatar,
      globalRank: leaderboardCache.globalRank,
      performanceScore: leaderboardCache.performanceScore,
      earningsScore: leaderboardCache.earningsScore,
      teamScore: leaderboardCache.teamScore,
      activeScore: leaderboardCache.activeScore,
      healthScore: leaderboardCache.healthScore,
      level1Count: leaderboardCache.level1Count,
      level2Count: leaderboardCache.level2Count,
      profilePicture: users.profilePicture,
    })
    .from(leaderboardCache)
    .innerJoin(users, eq(leaderboardCache.userId, users.id));

    const globalRanking = await (searchCondition ? globalRankingQuery.where(searchCondition) : globalRankingQuery)
      .orderBy(leaderboardCache.globalRank)
      .limit(limit)
      .offset(offset);

    // 2. Get Top Referrers (from users table directly for real-time leader switch if needed, or from cache)
    // For Enterprise, we'll use a slightly different aggregation for referrers here
    const topReferrers = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      userRankTier: users.userRankTier,
      avatar: users.avatar,
      totalEarnings: users.totalEarnings,
      trustStatus: users.trustStatus,
      level1Count: leaderboardCache.level1Count,
      level2Count: leaderboardCache.level2Count,
      referralCount: leaderboardCache.level1Count,
      profilePicture: users.profilePicture,
    })
    .from(users)
    .innerJoin(leaderboardCache, eq(leaderboardCache.userId, users.id))
    .orderBy(desc(leaderboardCache.level1Count))
    .limit(limit);

    // 3. Watchlist (Risk Triage) — sourced from the persistent risk_cases table
    //    (populated by the multi-signal risk engine), not ad-hoc thresholds.
    //    This is what actually remembers "we looked at this, it's fine" —
    //    Cleared/Actioned cases are excluded so the list only shows work
    //    still needing admin attention.
    const openCases = await db
      .select({
        caseId: riskCases.id,
        riskScore: riskCases.riskScore,
        severity: riskCases.severity,
        status: riskCases.status,
        signals: riskCases.signals,
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        userRankTier: users.userRankTier,
        avatar: users.avatar,
        totalEarnings: users.totalEarnings,
        createdAt: users.createdAt,
      })
      .from(riskCases)
      .innerJoin(users, eq(riskCases.userId, users.id))
      .where(and(eq(users.role, "user"), inArray(riskCases.status, ["Open", "Investigating"])))
      .orderBy(desc(riskCases.riskScore))
      .limit(50);

    const mappedAnomalies = openCases.map((c) => {
      const userCreatedDate = c.createdAt ? new Date(c.createdAt).getTime() : now.getTime();
      const daysActive = Math.max(1, (now.getTime() - userCreatedDate) / (1000 * 60 * 60 * 24));
      const topSignals = (Array.isArray(c.signals) ? (c.signals as any[]) : [])
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((s) => s.name);
      const reason = topSignals.length
        ? `${c.severity} Risk — ${topSignals.join(", ")}`
        : `${c.severity} Risk`;

      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        userRankTier: c.userRankTier,
        avatar: c.avatar,
        totalEarnings: c.totalEarnings,
        riskScore: c.riskScore,
        severity: c.severity,
        caseStatus: c.status,
        daysActive: Math.round(daysActive),
        reason,
      };
    });

    // Count must reflect the same search filter as globalRanking, otherwise
    // pagination controls would imply more pages of results exist than the
    // filtered query can actually return. Scoped to leaderboardCache (capped
    // at TOP_N=10,000 — see refreshLeaderboardCache) since that's what's
    // actually paginated here.
    const totalCountQuery = db.select({ count: sql<number>`count(*)` })
      .from(leaderboardCache)
      .innerJoin(users, eq(leaderboardCache.userId, users.id));

    // Audit fix: true platform-wide member count, deliberately NOT scoped to
    // leaderboardCache. The "Total Members" stat card was silently reading
    // totalCount above, which plateaus at 10,000 once the userbase exceeds
    // the cache cap — misrepresenting real scale to admins.
    const totalActiveUsersQuery = db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.role, "user")));

    const [totalCountResult, totalActiveUsersResult] = await Promise.all([
      searchCondition ? totalCountQuery.where(searchCondition) : totalCountQuery,
      totalActiveUsersQuery,
    ]);

    return { 
      globalRanking, 
      topReferrers, 
      anomalies: mappedAnomalies, 
      totalCount: Number(totalCountResult[0]?.count) || 0,
      totalActiveUsers: Number(totalActiveUsersResult[0]?.count) || 0,
      // Audit fix: always report the TRUE last-recorded timestamp. This used
      // to substitute "now" whenever isStale was true, which hid the exact
      // condition (a broken/delayed cron) the timestamp exists to reveal.
      lastUpdated: lastCacheEntry[0]?.recordedAt || now,
      isStale,
    };
  }

  async refreshLeaderboardCache(): Promise<void> {
    // 60-second debounce: skip if a refresh already ran recently.
    // Prevents runaway triggers (e.g. force-sync hammering) from spawning
    // concurrent full-table scans at the DB level.
    const nowMs = Date.now();
    if (nowMs - this._leaderboardLastRefreshedMs < 60_000) {
      logger.debug("refreshLeaderboardCache: skipped — refreshed within last 60 s");
      return;
    }
    this._leaderboardLastRefreshedMs = nowMs;

    const now = new Date();

    // Load admin-tunable weights from system config (defaults match original formula)
    const wEarnings = await this.getSystemConfigValue<number>("SCORE_WEIGHT_EARNINGS", 0.40);
    const wTeam     = await this.getSystemConfigValue<number>("SCORE_WEIGHT_TEAM",     0.30);
    const wActive   = await this.getSystemConfigValue<number>("SCORE_WEIGHT_ACTIVE",   0.15);
    const wHealth   = await this.getSystemConfigValue<number>("SCORE_WEIGHT_HEALTH",   0.15);
    const cohortDiscountDays = await this.getSystemConfigValue<number>("SCORE_COHORT_DISCOUNT_DAYS", 14);

    // C-07: leaderboard cache DELETE + INSERT are performed atomically AFTER
    // computation so a crash never leaves the table empty. Fetch users first.

    // Fetch qualified users + L1 referral counts in parallel.
    // Previous version used two per-row correlated subqueries (O(2N) DB round-trips);
    // replaced with a single GROUP BY aggregate run in parallel with the main query.
    // Note: level2Count is hardcoded 0 below per spec H.5 (L2 writes frozen) — so no
    // L2 aggregate is needed here.
    // Task 2 / Finding 1-E: cap in-memory allocation at TOP_N users.
    // Pre-sort by the already-stored performanceScore so we load only the
    // competitive range into Node heap. At 100k users this keeps peak
    // heap cost to ~5 MB instead of ~50 MB per refresh cycle.
    const TOP_N = 10_000;

    const [allQualifiedUsers, l1Rows] = await Promise.all([
      db.select({
        id: users.id,
        totalEarnings: users.totalEarnings,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        lastLoginDate: users.lastLoginDate,
        userRankTier: users.userRankTier,
        guildRole: users.guildRole,
      })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.role, "user")))
      .orderBy(desc(users.performanceScore))
      .limit(TOP_N),

      // One aggregate query for all L1 counts (replaces per-row correlated subquery)
      db.select({
        referrerId: users.referredBy,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(users)
      .where(and(isNotNull(users.referredBy), eq(users.role, "user"), eq(users.isActive, true)))
      .groupBy(users.referredBy),
    ]);

    if (!allQualifiedUsers.length) return;

    const l1Map = new Map<string, number>(
      l1Rows.map(r => [r.referrerId as string, r.count])
    );

    // Pre-sort arrays for percentile normalization (O(n log n) once each)
    const earningsSorted = [...allQualifiedUsers]
      .map(u => new Decimal(u.totalEarnings || "0").toNumber()) // float intentional — sort/percentile only, never stored
      .sort((a, b) => a - b);
    const referralsSorted = [...allQualifiedUsers]
      .map(u => l1Map.get(u.id) ?? 0)
      .sort((a, b) => a - b);

    // O(log n) binary search — replaces the prior O(n) linear scan.
    // For 10 k users called twice per user = 20 k calls: linear was ~10 k ops
    // each → 100 M total; binary search is ~14 ops each → 280 k total.
    function percentileRank(sortedArr: number[], value: number): number {
      if (!sortedArr.length) return 0;
      let lo = 0;
      let hi = sortedArr.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sortedArr[mid] <= value) lo = mid + 1;
        else hi = mid;
      }
      // lo = count of elements ≤ value
      return (lo / sortedArr.length) * 100;
    }

    const scoredUsers = allQualifiedUsers.map(u => {
      const accountAgeDays = Math.max(1, (now.getTime() - new Date(u.createdAt!).getTime()) / 86400000);
      const earned = new Decimal(u.totalEarnings || "0").toNumber(); // float intentional — percentile comparison only

      // 1. Earnings Score (0-100) — percentile rank among all qualified users
      const earningsScore = percentileRank(earningsSorted, earned);

      // 2. Team Score (0-100) — percentile rank by referral count
      const teamScore = percentileRank(referralsSorted, l1Map.get(u.id) ?? 0);

      // 3. Active Score (0-100) — decay by days since last login
      const daysSinceLogin = Math.max(0, (now.getTime() - new Date(u.lastLoginDate || u.createdAt!).getTime()) / 86400000);
      const activeScore = Math.max(0, 100 - (daysSinceLogin * 5));

      // 4. Health Score (0-100) — identity + account age
      //    New accounts (< cohortDiscountDays) get a 30% discount to avoid
      //    inflated scores from day-1 gamers
      const baseHealth = (u.isVerified ? 60 : 20) + (accountAgeDays > 30 ? 40 : (accountAgeDays / 30) * 40);
      const cohortDiscount = accountAgeDays < cohortDiscountDays ? 0.70 : 1.0;
      const healthScore = baseHealth * cohortDiscount;

      // Composite (admin-tunable weights)
      const performanceScore =
        (earningsScore * wEarnings) +
        (teamScore * wTeam) +
        (activeScore * wActive) +
        (healthScore * wHealth);

      return {
        userId: u.id,
        performanceScore: performanceScore.toFixed(2),
        earningsScore: earningsScore.toFixed(2),
        teamScore: teamScore.toFixed(2),
        activeScore: activeScore.toFixed(2),
        healthScore: healthScore.toFixed(2),
        level1Count: l1Map.get(u.id) ?? 0,
        level2Count: 0, // L2 removed per spec H.5
        userRankTier: u.userRankTier ?? 'E-Rank',
        guildRole: u.guildRole ?? 'simple',
      };
    });

    // Sort by performance and assign global rank.
    // Audit finding 1-H: use Decimal comparison instead of float subtraction —
    // float subtraction below 1e-12 produces 0 → unstable sort → wrong ranks.
    scoredUsers.sort((a, b) => {
      const da = new Decimal(b.performanceScore ?? '0');
      const db_ = new Decimal(a.performanceScore ?? '0');
      return da.comparedTo(db_);
    });

    const cacheEntries = scoredUsers.map((u, index) => ({
      ...u,
      globalRank: index + 1,
      recordedAt: now
    }));

    // Batch insert into leaderboard cache (top 10,000 for enterprise performance)
    // C-07: Wrap DELETE + all cache INSERTs in one transaction — old data stays
    // live until the new set is fully written; a crash rolls back to the previous
    // cache instead of leaving an empty table.
    const topEntries = cacheEntries.slice(0, 10000);
    await db.transaction(async (tx) => {
      await tx.delete(leaderboardCache);
      for (let i = 0; i < topEntries.length; i += 500) {
        const chunk = topEntries.slice(i, i + 500);
        await tx.insert(leaderboardCache).values(chunk);
      }
    });

    // Persist score history snapshot (batch of 500 to keep DB writes cheap)
    for (let i = 0; i < topEntries.length; i += 500) {
      const chunk = topEntries.slice(i, i + 500).map(u => ({
        userId: u.userId,
        performanceScore: u.performanceScore,
        riskScore: "0",
        earningsScore: u.earningsScore,
        teamScore: u.teamScore,
        activeScore: u.activeScore,
        healthScore: u.healthScore,
        snapshotAt: now,
      }));
      await db.insert(scoreHistory).values(chunk);
    }
  }

  async getActiveUsersCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.isActive, true));
    return Number(result[0]?.count || 0);
  }

  async updateWithdrawalStatus(
    id: string,
    status: string,
    adminId: string,
    transactionId?: string,
    rejectionReason?: string
  ): Promise<Withdrawal> {
    if (status === 'completed') {
      return await this.processWithdrawal(id, adminId, transactionId);
    } else if (status === 'rejected') {
      return await this.rejectWithdrawal(id, adminId, rejectionReason || 'Rejected by administrator');
    }

    // Default status update if not process/reject (e.g., 'processing')
    const [updated] = await db
      .update(withdrawals)
      .set({
        status: status as any,
        transactionId: transactionId || null,
        rejectionReason: rejectionReason || null,
        processedAt: status === 'completed' ? new Date() : null,
        updatedAt: new Date()
      })
      .where(eq(withdrawals.id, id))
      .returning();

    if (!updated) throw new Error("Withdrawal not found");
    return updated;
  }

  async createAuditLog(log: InsertAuditLog, context?: RequestContext, tx?: any): Promise<AuditLog> {
    const category = log.category ?? inferAuditCategory({
      targetType: log.targetType,
      actorId: log.adminId,
      targetId: log.targetId,
      actorRole: log.actorRole,
    });
    const client = tx || db;
    const [newLog] = await client
      .insert(auditLogs)
      .values({
        ...log,
        category,
        // Explicit fields on `log` win over auto-captured context (callers
        // occasionally already resolve one of these themselves).
        ipAddress: log.ipAddress ?? context?.ipAddress ?? undefined,
        userAgent: log.userAgent ?? context?.userAgent ?? undefined,
        deviceType: log.deviceType ?? context?.deviceType ?? undefined,
        browser: log.browser ?? context?.browser ?? undefined,
        os: log.os ?? context?.os ?? undefined,
        country: log.country ?? context?.country ?? undefined,
        city: log.city ?? context?.city ?? undefined,
      })
      .returning();
    return newLog;
  }

  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  // Team Invitations
  async createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation> {
    const [newInvitation] = await db
      .insert(teamInvitations)
      .values(invitation)
      .returning();
    return newInvitation;
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(and(
        eq(teamInvitations.token, token),
        sql`${teamInvitations.expiresAt} > now()`,
        sql`${teamInvitations.consumedAt} IS NULL`
      ));
    return invitation;
  }

  async consumeTeamInvitation(invitationId: string): Promise<void> {
    await db
      .update(teamInvitations)
      .set({ consumedAt: new Date() })
      .where(eq(teamInvitations.id, invitationId));
  }

  async updateUserPermissions(userId: string, permissions: string[]): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ permissions })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async createInternalNote(note: InsertInternalNote): Promise<InternalNote> {
    const [newNote] = await db
      .insert(internalNotes)
      .values(note)
      .returning();
    return newNote;
  }

  async getInternalNotes(targetType: string, targetId: string): Promise<Array<InternalNote & { admin: { firstName: string, lastName: string } }>> {
    const results = await db
      .select({
        note: internalNotes,
        admin: {
          firstName: users.firstName,
          lastName: users.lastName
        }
      })
      .from(internalNotes)
      .innerJoin(users, eq(internalNotes.adminId, users.id))
      .where(and(
        eq(internalNotes.targetType, targetType),
        eq(internalNotes.targetId, targetId)
      ))
      .orderBy(desc(internalNotes.createdAt));

    return results.map(r => ({
      ...r.note,
      admin: r.admin
    }));
  }

  async getWithdrawalTimeframeBreakdowns(userId: string): Promise<{
    today: { points: number; exactPkr: string; platformFee: string; netPkr: string };
    thisWeek: { points: number; exactPkr: string; platformFee: string; netPkr: string };
    thisMonth: { points: number; exactPkr: string; platformFee: string; netPkr: string };
    last3Months: { points: number; exactPkr: string; platformFee: string; netPkr: string };
    allTime: { points: number; exactPkr: string; platformFee: string; netPkr: string };
  }> {
    const feePct = await this.getSystemConfigValue<number>("WITHDRAWAL_FEE_PCT", 15);
    const now = new Date();

    const cutoffs = {
      today: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      thisWeek: (() => { const d = new Date(now); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); d.setUTCHours(0,0,0,0); return d; })(),
      thisMonth: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      last3Months: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    };

    const calc = (points: number, pkr: string) => {
      const pkrD = new Decimal(pkr);
      const feeD = pkrD.times(feePct).dividedBy(100);
      // H-04: Return as fixed-precision strings to preserve Decimal accuracy.
      return {
        points,
        exactPkr: pkrD.toFixed(4),
        platformFee: feeD.toDecimalPlaces(2).toFixed(2),
        netPkr: pkrD.minus(feeD).toDecimalPlaces(2).toFixed(2),
      };
    };

    const query = async (since?: Date) => {
      const [row] = await db
        .select({
          points: sql<number>`COALESCE(SUM(${userTransactions.pointsCredited}), 0)::int`,
          pkr: sql<string>`COALESCE(SUM(${userTransactions.realPkrValue}::numeric), 0)::text`,
        })
        .from(userTransactions)
        .where(and(
          eq(userTransactions.userId, userId),
          eq(userTransactions.withdrawn, false),
          since ? gte(userTransactions.createdAt, since) : undefined as any
        ) as any);
      return { points: Number(row.points), pkr: String(row.pkr ?? "0") };
    };

    const [today, thisWeek, thisMonth, last3, allTime] = await Promise.all([
      query(cutoffs.today),
      query(cutoffs.thisWeek),
      query(cutoffs.thisMonth),
      query(cutoffs.last3Months),
      query(),
    ]);

    return {
      today: calc(today.points, today.pkr),
      thisWeek: calc(thisWeek.points, thisWeek.pkr),
      thisMonth: calc(thisMonth.points, thisMonth.pkr),
      last3Months: calc(last3.points, last3.pkr),
      allTime: calc(allTime.points, allTime.pkr),
    };
  }

  async getProfitLedger(): Promise<{
    engineCuts: Record<string, string>;
    withdrawalFeeRevenue: string;
    referralCommissionsPaid: string;
    netWithdrawalFeeShare: string;
    totalProfit: string;
    daily30Days: { date: string; engineCut: string; feeShare: string; total: string }[];
  }> {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [cutRows, wdRow, daily, dailyFee] = await Promise.all([
      db.select({
        engine: userTransactions.engineType,
        cut: sql<number>`COALESCE(SUM(${userTransactions.thorxProfitPkr}::numeric), 0)`,
      }).from(userTransactions).groupBy(userTransactions.engineType),

      db.execute(sql`
        SELECT
          COALESCE(SUM((thorx_fee_share)::numeric), 0) AS fee_revenue,
          COALESCE(SUM((referral_commission_paid)::numeric), 0) AS ref_paid
        FROM withdrawals WHERE status IN ('approved', 'completed')
      `),

      db.execute(sql`
        SELECT
          date_trunc('day', created_at)::date AS day,
          COALESCE(SUM(thorx_profit_pkr::numeric), 0) AS engine_cut
        FROM user_transactions
        WHERE created_at >= ${since30}
        GROUP BY 1
        ORDER BY 1
      `),

      // Per-day withdrawal fee share, keyed by the same processedAt date axis
      // used for the monthly founder-profit figures — previously hardcoded to
      // "0.0000" below with a TODO-style comment; this closes that gap.
      db.execute(sql`
        SELECT
          date_trunc('day', processed_at)::date AS day,
          COALESCE(SUM((thorx_fee_share)::numeric), 0) AS fee_share
        FROM withdrawals
        WHERE status IN ('approved', 'completed') AND processed_at >= ${since30}
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    // H-05: Use Decimal throughout to prevent float accumulation errors on
    // large financial aggregates in the profit ledger.
    const engineCutsD: Record<string, Decimal> = {
      A: new Decimal(0), B: new Decimal(0), C: new Decimal(0),
      Referral: new Decimal(0), Manual: new Decimal(0), Indirect: new Decimal(0),
    };
    for (const r of cutRows) {
      const key = r.engine === 'Engine_A' ? 'A' : r.engine === 'Engine_B' ? 'B' : r.engine === 'Engine_C' ? 'C' : r.engine ?? 'Indirect';
      engineCutsD[key] = (engineCutsD[key] ?? new Decimal(0)).plus(new Decimal(r.cut ?? 0));
    }
    const totalEngineCutsD = Object.values(engineCutsD).reduce((a, b) => a.plus(b), new Decimal(0));
    // Serialize as fixed strings for JSON — never .toNumber() on financial values.
    const engineCuts = Object.fromEntries(
      Object.entries(engineCutsD).map(([k, v]) => [k, v.toFixed(4)])
    );

    const wdData = (wdRow as any).rows?.[0] ?? (wdRow as any)[0] ?? {};
    const feeRevenueD = new Decimal(wdData.fee_revenue ?? 0);
    const refPaidD    = new Decimal(wdData.ref_paid ?? 0);
    const withdrawalFeeRevenue    = feeRevenueD.plus(refPaidD).toFixed(4);
    const referralCommissionsPaid = refPaidD.toFixed(4);
    const netWithdrawalFeeShare   = feeRevenueD.toFixed(4);

    const dailyRows = ((daily as unknown) as { rows: any[] }).rows ?? [];
    const dailyFeeRows = ((dailyFee as unknown) as { rows: any[] }).rows ?? [];
    const feeShareByDay = new Map<string, string>(
      dailyFeeRows.map((r: any) => [String(r.day).slice(0, 10), String(r.fee_share ?? 0)])
    );
    const daily30Days = dailyRows.map((r: any) => {
      const date = String(r.day).slice(0, 10);
      const engineCutD = new Decimal(r.engine_cut ?? 0);
      const feeShareD = new Decimal(feeShareByDay.get(date) ?? 0);
      return {
        date,
        engineCut: engineCutD.toFixed(4),
        feeShare: feeShareD.toFixed(4),
        total: engineCutD.plus(feeShareD).toFixed(4),
      };
    });

    return {
      engineCuts,
      withdrawalFeeRevenue,
      referralCommissionsPaid,
      netWithdrawalFeeShare,
      totalProfit: totalEngineCutsD.plus(feeRevenueD).toFixed(4),
      daily30Days,
    };
  }

  async adjustUserBalance(userId: string, amount: string, type: 'add' | 'subtract', adminId: string, reason: string, creditIntent: 'verified_deposit' | 'admin_credit' = 'admin_credit', txPointsDelta?: number, context?: RequestContext): Promise<User> {
    return await db.transaction(async (tx) => {
      // Lock the target user row before reading balance — prevents two concurrent
      // admin adjustments from reading the same stale value and applying double
      // credits (audit finding E).
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user) throw new Error("User not found");

      const [admin] = await tx.select().from(users).where(eq(users.id, adminId));
      if (!admin) throw new Error("Admin not found");

      const adjustment = type === 'add' ? amount : `-${amount}`;
      const [updatedUser] = await tx
        .update(users)
        .set({
          availableBalance: sql`${users.availableBalance} + ${adjustment}`,
          // totalEarnings is a lifetime gross figure — only credits increase it.
          // Admin debits only reduce availableBalance, not the historical record.
          totalEarnings: type === 'add'
            ? sql`${users.totalEarnings} + ${amount}`
            : users.totalEarnings,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId))
        .returning();

      // When crediting, insert an earnings record so the risk engine's
      // signalEarningsVelocity (which queries the earnings table directly)
      // correctly picks up large admin credits as potential risk signals.
      if (type === 'add') {
        await tx.insert(earnings).values({
          userId,
          type: creditIntent,
          amount,
          description: reason || 'Admin balance adjustment',
          status: 'completed',
          metadata: { source: 'admin_adjustment', adminId, creditIntent },
        });
      }

      // Ledger-audit fix (2026-07-29, CRITICAL): always insert a signed
      // user_transactions row for ANY non-zero PKR and/or points delta —
      // not only when txPointsDelta was provided. Two bugs previously lived
      // here:
      //  1. Sign bug — realPkrValue/pointsCredited were unconditionally
      //     `.abs()`'d, so a 'subtract' adjustment (the common case when an
      //     admin reconciles a "stored balance too high" mismatch) inserted
      //     a POSITIVE ledger row. That inflated the computed (SUM-based)
      //     balance in the wrong direction, so "reconciling" an account
      //     actually flipped the discrepancy to the opposite sign instead
      //     of clearing it.
      //  2. Missing row — a pure PKR-only adjustment (no txPointsDelta) did
      //     not write any ledger row at all, so the SUM-based ledger
      //     validator never reflected the admin's change and would flag the
      //     account as a fresh "critical mismatch" on the very next scan,
      //     even though the balance itself was correct.
      // pointsCredited/realPkrValue now carry the true signed delta so the
      // ledger SUM this row contributes exactly matches the balance change
      // applied above, keeping computed vs. stored balance in sync.
      const pkrDeltaD = type === 'add' ? new Decimal(amount) : new Decimal(amount).neg();
      const hasPointsDelta = txPointsDelta !== undefined && txPointsDelta !== 0;
      if (!pkrDeltaD.isZero() || hasPointsDelta) {
        await tx.insert(userTransactions).values({
          userId,
          engineType: 'Manual' as any,
          pointsCredited: hasPointsDelta ? txPointsDelta! : 0,
          realPkrValue: pkrDeltaD.toFixed(4),
          grossPkr: pkrDeltaD.abs().toFixed(4),
          thorxProfitPkr: '0.0000',
          guildPoolPkr: '0.0000',
          conversionRate: 1000,
          cardVariance: '1.0000',
          sourceId: `manual_${adminId}_${Date.now()}`,
          sourceType: 'manual_adjustment' as any,
          withdrawn: false,
        });
        // Keep txPointsBalance in sync — use SQL arithmetic to avoid race conditions.
        if (hasPointsDelta) {
          await tx.update(users)
            .set({ txPointsBalance: sql`${users.txPointsBalance} + ${txPointsDelta}` })
            .where(eq(users.id, userId));
        }
      }

      // Route through createAuditLog (not a raw insert) so this entry gets the
      // same IP/device/location enrichment as every other audit event — the
      // `tx` handle keeps it atomic with the balance change above.
      await this.createAuditLog({
        adminId,
        actorRole: admin.role,
        action: `BALANCE_ADJUST_${type.toUpperCase()}`,
        targetType: "user",
        targetId: userId,
        details: {
          previous_balance: user.availableBalance,
          new_balance: updatedUser.availableBalance,
          variance: type === 'add' ? `+${amount}` : `-${amount}`,
          reason: reason
        }
      }, context, tx);

      // Role formatting logic
      let roleTag = admin.role?.toUpperCase() || "REGULAR";
      if (roleTag === "FOUNDER") roleTag = "FOUNDER/CEO";
      if (roleTag === "TEAM") roleTag = "REGULAR";

      // Create Automated Notification
      await tx.insert(notifications).values({
        userId,
        title: `Ledger ${type === 'add' ? 'Credit' : 'Debit'} Success`,
        message: reason,
        type: "financial",
        adminName: `${admin.firstName} ${admin.lastName}`,
        adminRole: roleTag,
        amount: amount,
        adjustmentType: type === 'add' ? 'credit' : 'debit'
      });

      return updatedUser;
    });
  }

  // ── Founder Profit Ledger ───────────────────────────────────────────────────

  async createFounderWithdrawal(data: { amount: string; withdrawalDate: Date; description?: string; createdBy: string }): Promise<FounderWithdrawal> {
    // C-03: Wrapped in a transaction with a SELECT … FOR UPDATE lock on the
    // creator's user row. The founder withdrawal is an accounting log entry
    // (it does not debit a user balance directly), but the FOR UPDATE lock
    // serialises concurrent requests from the same founder session, preventing
    // duplicate accounting rows if two requests race.
    return await db.transaction(async (tx) => {
      // Acquire a row-level lock on the creator before inserting.
      await tx.execute(sql`SELECT id FROM users WHERE id = ${data.createdBy} FOR UPDATE`);
      const [fw] = await tx.insert(founderWithdrawals).values({
        amount: data.amount,
        withdrawalDate: data.withdrawalDate,
        description: data.description,
        createdBy: data.createdBy,
      }).returning();
      return fw;
    });
  }

  async getFounderWithdrawals(limit = 50, offset = 0): Promise<{ withdrawals: FounderWithdrawal[]; total: number }> {
    const rows = await db.select().from(founderWithdrawals).orderBy(desc(founderWithdrawals.createdAt)).limit(limit).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` }).from(founderWithdrawals);
    return { withdrawals: rows, total: Number(total) };
  }

  async getFounderProfitSummary() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // F-5 fix: processWithdrawal sets status='completed', not 'processed'.
    // Querying 'processed' always returned 0, making the profit summary blank.
    const [totalProfitRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(fee AS DECIMAL)), 0)::text` }).from(withdrawals).where(eq(withdrawals.status, 'completed'));
    const [monthProfitRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(fee AS DECIMAL)), 0)::text` }).from(withdrawals).where(and(eq(withdrawals.status, 'completed'), gte(withdrawals.processedAt, monthStart)));
    const [totalOutRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)::text` }).from(founderWithdrawals);
    const [monthOutRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)::text` }).from(founderWithdrawals).where(gte(founderWithdrawals.createdAt, monthStart));
    const [lastWd] = await db.select().from(founderWithdrawals).orderBy(desc(founderWithdrawals.createdAt)).limit(1);
    const feeConfigs = await db.select().from(systemConfig).where(eq(systemConfig.key, 'WITHDRAWAL_FEE_PCT'));
    // Do not fabricate a plausible-looking fee rate when config is missing —
    // a guessed default here would misrepresent the real platform fee to the
    // founder. Leave it undefined so the response reports it as unavailable.
    const feeRate = feeConfigs[0]?.value;

    // Audit finding 1-G: replace parseFloat with Decimal arithmetic to prevent
    // IEEE 754 drift in PKR aggregations shown in the founder reconciliation panel.
    const totalInD = new Decimal(totalProfitRow?.total ?? '0');
    const monthInD = new Decimal(monthProfitRow?.total ?? '0');
    const totalOutD = new Decimal(totalOutRow?.total ?? '0');
    const monthOutD = new Decimal(monthOutRow?.total ?? '0');
    // H-04: Eliminate .toNumber() intermediaries — call .toFixed() directly on Decimal
    // to preserve full precision through to the JSON response boundary.
    const safeD = totalInD.minus(totalOutD);
    const monthBalanceD = monthInD.minus(monthOutD);
    const daysSinceLast = lastWd?.createdAt ? Math.floor((Date.now() - new Date(lastWd.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : null;

    return {
      totalProfitEarned: totalInD.toFixed(2),
      thisMonthProfitEarned: monthInD.toFixed(2),
      totalWithdrawnToPersonal: totalOutD.toFixed(2),
      thisMonthWithdrawn: monthOutD.toFixed(2),
      safeToWithdrawNow: safeD.isNegative() ? "0.00" : safeD.toFixed(2),
      monthlyBalance: monthBalanceD.toFixed(2),
      isOverWithdrawn: safeD.isNegative(),
      overWithdrawnAmount: safeD.isNegative() ? safeD.abs().toFixed(2) : "0",
      currentFeeRate: (feeRate === undefined || feeRate === null) ? null : String(feeRate),
      lastWithdrawalDate: lastWd?.withdrawalDate?.toISOString() ?? null,
      daysSinceLastWithdrawal: daysSinceLast,
    };
  }

  // ── System Health Snapshots ─────────────────────────────────────────────────

  async saveHealthSnapshot(data: Omit<HealthSnapshot, 'id' | 'recordedAt'>): Promise<HealthSnapshot> {
    const [snap] = await db.insert(healthSnapshots).values(data as any).returning();
    return snap;
  }

  async getLatestHealthSnapshot(): Promise<HealthSnapshot | null> {
    const [snap] = await db.select().from(healthSnapshots).orderBy(desc(healthSnapshots.recordedAt)).limit(1);
    return snap ?? null;
  }

  async getHealthHistory(hours = 24): Promise<HealthSnapshot[]> {
    // Snapshots are recorded roughly hourly. The row limit must scale with
    // the requested window — it was previously hardcoded to 48 regardless of
    // `hours`, silently truncating any request for more than 48h of history.
    // Clamp the window itself to a sane maximum (30 days) to bound the query.
    const clampedHours = Math.min(Math.max(hours, 1), 24 * 30);
    const since = new Date(Date.now() - clampedHours * 60 * 60 * 1000);
    return db.select().from(healthSnapshots).where(gte(healthSnapshots.recordedAt, since)).orderBy(desc(healthSnapshots.recordedAt)).limit(clampedHours + 24);
  }

  // ── Financial Reconciliation ────────────────────────────────────────────────

  async getReconciliationData(params?: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const offset = Math.max(params?.offset ?? 0, 0);

    // Active-only and frozen (isActive=false) balances are broken out separately so the
    // panel can show exactly how much of the platform's liability sits in suspended /
    // soft-deleted accounts (their availableBalance is never zeroed — see storage.deleteUser).
    // totalUserBalances is the true sum the platform owes across every user row.
    const [activeBalRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(available_balance AS DECIMAL)), 0)::text` }).from(users).where(eq(users.isActive, true));
    const [frozenBalRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(available_balance AS DECIMAL)), 0)::text` }).from(users).where(eq(users.isActive, false));

    // Only 'completed' earnings count as real/backing or exposure — matches the
    // status filter convention used elsewhere (e.g. getExtendedMetrics growth stats).
    const [realRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)::text` }).from(earnings).where(and(sql`type != 'admin_credit'`, eq(earnings.status, 'completed')));
    const [unverRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)::text` }).from(earnings).where(and(eq(earnings.type, 'admin_credit'), eq(earnings.status, 'completed')));

    // Withdrawal liability: 'pending', 'approved' (S-Rank fast-track), and 'processing'
    // are all non-terminal states where the platform still owes the payout — only
    // 'completed'/'rejected' are terminal (see processWithdrawal's own status guard).
    // netAmount (not the gross `amount`) is what actually leaves the platform's funds,
    // and is populated at request time in createWithdrawal, so it's safe to sum here.
    const [liabilityByStatus] = await db.select({
      pending: sql<string>`COALESCE(SUM(CAST(net_amount AS DECIMAL)) FILTER (WHERE status = 'pending'), 0)::text`,
      approved: sql<string>`COALESCE(SUM(CAST(net_amount AS DECIMAL)) FILTER (WHERE status = 'approved'), 0)::text`,
      processing: sql<string>`COALESCE(SUM(CAST(net_amount AS DECIMAL)) FILTER (WHERE status = 'processing'), 0)::text`,
    }).from(withdrawals).where(sql`${withdrawals.status} IN ('pending', 'approved', 'processing')`);

    const pendingD = new Decimal(liabilityByStatus?.pending ?? '0');
    const approvedD = new Decimal(liabilityByStatus?.approved ?? '0');
    const processingD = new Decimal(liabilityByStatus?.processing ?? '0');
    const totalWithdrawalLiability = pendingD.plus(approvedD).plus(processingD);

    const realBacking = new Decimal(realRow?.total ?? '0');
    const netLiquidity = realBacking.minus(totalWithdrawalLiability);
    const activeBalances = new Decimal(activeBalRow?.total ?? '0');
    const frozenBalances = new Decimal(frozenBalRow?.total ?? '0');

    // Fetch admin credit earnings with recipient user info (paginated)
    const [adminCreditRows, [countRow]] = await Promise.all([
      db
        .select({
          id: earnings.id,
          userId: earnings.userId,
          amount: earnings.amount,
          description: earnings.description,
          metadata: earnings.metadata,
          createdAt: earnings.createdAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
        })
        .from(earnings)
        .leftJoin(users, eq(earnings.userId, users.id))
        .where(eq(earnings.type, 'admin_credit'))
        .orderBy(desc(earnings.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(earnings).where(eq(earnings.type, 'admin_credit')),
    ]);

    // Resolve admin names from metadata.adminId — batch fetch to avoid N+1 queries
    const adminIds = Array.from(new Set(
      adminCreditRows
        .map(c => (c.metadata as any)?.adminId as string | undefined)
        .filter(Boolean) as string[]
    ));
    const adminMap = new Map<string, string>();
    if (adminIds.length > 0) {
      const adminUsers = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(inArray(users.id, adminIds));
      adminUsers.forEach(a => adminMap.set(a.id, `${a.firstName} ${a.lastName}`.trim() || 'Team Member'));
    }

    return {
      totalUserBalances: activeBalances.plus(frozenBalances).toFixed(2),
      activeUserBalances: activeBalRow?.total ?? '0',
      frozenAccountLiability: frozenBalRow?.total ?? '0',
      realEarningsBacking: realRow?.total ?? '0',
      unverifiedCreditExposure: unverRow?.total ?? '0',
      pendingWithdrawalLiability: totalWithdrawalLiability.toFixed(2),
      withdrawalLiabilityBreakdown: {
        pending: pendingD.toFixed(2),
        approved: approvedD.toFixed(2),
        processing: processingD.toFixed(2),
      },
      netPlatformLiquidity: netLiquidity.toFixed(2),
      adminCreditDetails: adminCreditRows.map(c => {
        const grantedById = (c.metadata as any)?.adminId as string | undefined;
        const adminName = grantedById ? (adminMap.get(grantedById) ?? 'Team Member') : 'Team Member';
        return {
          id: c.id,
          userId: c.userId ?? '',
          userName: `${c.userFirstName ?? ''} ${c.userLastName ?? ''}`.trim() || 'Unknown',
          adminName,
          amount: c.amount,
          description: c.description ?? '',
          createdAt: c.createdAt?.toISOString() ?? '',
        };
      }),
      adminCreditTotalCount: Number(countRow?.count ?? 0),
    };
  }

  async reclassifyEarning(earningId: string, newType: 'verified_deposit' | 'admin_credit', adminId: string): Promise<{ userId: string }> {
    // The only valid reclassifications are admin_credit <-> verified_deposit. Guarding on the
    // earning's CURRENT type (fetched with a row lock) prevents this endpoint from being misused
    // to silently retype an unrelated earning (e.g. a real task_completion payout) into
    // admin_credit/verified_deposit, which would corrupt the reconciliation totals above.
    return await db.transaction(async (tx) => {
      const [earning] = await tx.select({ type: earnings.type, userId: earnings.userId }).from(earnings).where(eq(earnings.id, earningId)).for('update');
      if (!earning) {
        throw new Error("Earning not found");
      }
      const expectedCurrentType = newType === 'verified_deposit' ? 'admin_credit' : 'verified_deposit';
      if (earning.type !== expectedCurrentType) {
        throw new Error(`Cannot reclassify: earning is currently "${earning.type}", expected "${expectedCurrentType}"`);
      }

      // C-02: Both statements must succeed atomically — if the audit log insert
      // fails after the update, the reclassification must roll back entirely.
      await tx.update(earnings).set({ type: newType }).where(eq(earnings.id, earningId));
      await tx.insert(auditLogs).values({
        adminId,
        action: "RECLASSIFY_EARNING",
        targetType: "earning",
        targetId: earningId,
        details: { newType, previousType: earning.type, reclassifiedBy: adminId },
      });
      return { userId: earning.userId };
    });
  }

  // ── Error Event Logging ─────────────────────────────────────────────────────

  async logErrorEvent(route: string, status: number, message?: string): Promise<void> {
    await db.insert(errorEvents).values({ route, status, message }).catch(() => {/* silent */});
  }

  // ── Auth Event Logging ──────────────────────────────────────────────────────

  async logAuthEvent(email: string | undefined, success: boolean, reason?: string, ipAddress?: string | null): Promise<void> {
    await db.insert(authEvents).values({ email: email ?? null, success, reason: reason ?? null, ipAddress: ipAddress ?? null }).catch(() => {/* silent — logging must never block login */});
  }

  // ── Extended Metrics for Dashboard Cards ────────────────────────────────────

  async getExtendedMetrics() {
    const now = new Date();
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const ago14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Pending withdrawals — aggregated directly in SQL (previously fetched up
    // to 1000 raw rows and summed in JS, silently under-reporting the true
    // total/count/oldest-age once more than 1000 pending withdrawals exist).
    const [pendingAgg] = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${withdrawals.amount} AS DECIMAL)), 0)::text`,
      cnt: sql<number>`COUNT(*)`,
      oldest: sql<string | null>`MIN(${withdrawals.createdAt})`,
    }).from(withdrawals).where(eq(withdrawals.status, 'pending'));
    const pendingTotal = new Decimal(pendingAgg?.total ?? '0');
    const pendingCount = Number(pendingAgg?.cnt ?? 0);
    const oldestPendingDays = pendingAgg?.oldest ? Math.floor((now.getTime() - new Date(pendingAgg.oldest).getTime()) / (1000 * 60 * 60 * 24)) : null;

    // Unverified credits
    const [unverRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)::text`, cnt: sql<number>`COUNT(*)` }).from(earnings).where(eq(earnings.type, 'admin_credit'));

    // User growth — filter to role='user' only (exclude team/admin/founder accounts)
    const [thisWeekRow] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(users).where(and(eq(users.role, 'user'), gte(users.createdAt, ago7d)));
    const [lastWeekRow] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(users).where(and(eq(users.role, 'user'), gte(users.createdAt, ago14d), lt(users.createdAt, ago7d)));
    const thisWeek = Number(thisWeekRow?.cnt ?? 0);
    const lastWeek = Number(lastWeekRow?.cnt ?? 0);
    const growthRate = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10 : (thisWeek > 0 ? 100 : 0);

    // Referral network depth — L1 only. THORX v3 froze the referral system at
    // a single level, so an L2/depth-ratio metric here would surface a legacy
    // multilevel-referral concept that is no longer part of the product; it
    // has been removed (it was computed but never rendered anywhere).
    // L1: number of platform users who have earned at least one direct referral commission
    // totalReferrals: total user accounts that were referred by someone (referredBy IS NOT NULL)
    const [l1Row] = await db.select({ cnt: sql<number>`COUNT(DISTINCT ${commissionLogs.beneficiaryId})` }).from(commissionLogs).where(and(eq(commissionLogs.level, 1), eq(commissionLogs.status, 'paid')));
    const [referralRow] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(users).where(and(eq(users.role, 'user'), sql`${users.referredBy} IS NOT NULL`));
    const [commPaidRow] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(${commissionLogs.amount} AS DECIMAL)), 0)::text` }).from(commissionLogs).where(eq(commissionLogs.status, 'paid'));
    const l1Total = Number(l1Row?.cnt ?? 0);

    // Team activity
    const [day1Row] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(auditLogs).where(gte(auditLogs.createdAt, ago24h));
    const [week7Row] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(auditLogs).where(gte(auditLogs.createdAt, ago7d));
    const activity24h = Number(day1Row?.cnt ?? 0);
    const avg7d = Number(week7Row?.cnt ?? 0) / 7;

    // Most active team member last 24h
    const topMembers = await db
      .select({ adminId: auditLogs.adminId, cnt: sql<number>`COUNT(*) as cnt` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, ago24h))
      .groupBy(auditLogs.adminId)
      .orderBy(sql`cnt DESC`)
      .limit(1);
    let mostActiveTeamMember: string | null = null;
    if (topMembers[0]?.adminId) {
      const [m] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, topMembers[0].adminId));
      mostActiveTeamMember = m ? `${m.firstName} ${m.lastName}` : null;
    }

    // Total registered platform users (role='user' only, active accounts)
    const [totalUsersRow] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(users).where(and(eq(users.role, 'user'), eq(users.isActive, true)));

    return {
      pendingWithdrawalTotal: pendingTotal.toFixed(2),
      pendingWithdrawalCount: pendingCount,
      oldestPendingDays,
      unverifiedCreditTotal: unverRow?.total ?? '0',
      unverifiedCreditCount: Number(unverRow?.cnt ?? 0),
      userGrowthThisWeek: thisWeek,
      userGrowthLastWeek: lastWeek,
      userGrowthRate: growthRate,
      networkL1Total: l1Total,
      totalReferrals: Number(referralRow?.cnt ?? 0),
      totalCommissionsPaid: commPaidRow?.total ?? '0',
      teamActivity24h: activity24h,
      teamActivityAvg7d: Math.round(avg7d * 10) / 10,
      mostActiveTeamMember,
      totalUsers: Number(totalUsersRow?.cnt ?? 0),
    };
  }

  // Manually set a user's account trust status (Special/Trusted/Normal/Dangerous)
  // with a mandatory reason, surfaced on the Leaderboard. Independent of rank.
  async setUserTrustStatus(userId: string, status: string, reason: string, adminId: string): Promise<User> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error("User not found");

    const [updatedUser] = await db
      .update(users)
      .set({ trustStatus: status, trustReason: reason, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }


  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(insertNotification).returning();
    return notification;
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db.select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async clearAllNotifications(userId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }

  async deleteUser(userId: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error("User not found.");
    if (user.role === 'founder') {
      throw new Error("Protected Node Error: Founder accounts cannot be terminated from the directory.");
    }
    // Q1 business decision (2026-07-20): SOFT-DELETE ONLY. Hard-deletes are permanently
    // prohibited — the users row must never be removed from the database. Financial records
    // (earnings, withdrawals, commissions, audit logs) are retained for compliance and
    // FK integrity. Only PII is anonymized; isActive=false prevents all access.
    // Financial records (earnings, withdrawals, commissions) are RETAINED in the
    // database for financial auditing and tax law compliance (minimum 7 years).
    // Only personal identifying information is erased; the user row stays intact
    // with isActive=false so FK references remain valid.
    await db.update(users)
      .set({
        isActive: false,
        email: `deleted_${userId}@thorx.void`,
        firstName: "Deleted",
        lastName: "Account",
        // `identity` and `phone` are both NOT NULL on the schema — null
        // crashes this update with a constraint violation. Anonymize with
        // unique placeholders instead, same pattern as email/referralCode.
        phone: "0000000000",
        identity: `deleted_${userId}`,
        profilePicture: null,
        referralCode: `DELETED_${userId.slice(0, 8)}`,
      } as any)
      .where(eq(users.id, userId));
  }

  async getUsersPaginated(params: { page: number, limit: number, search?: string, sort?: string, sortOrder?: 'asc' | 'desc', role?: string, ids?: string[] }): Promise<{ users: User[], totalCount: number }> {
    const offset = (params.page - 1) * params.limit;
    const conditions = [];
    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(or(
        ilike(users.firstName, searchPattern),
        ilike(users.lastName, searchPattern),
        ilike(users.email, searchPattern)
      ));
    }
    if (params.role) {
      conditions.push(eq(users.role, params.role));
    }
    if (params.ids && params.ids.length > 0) {
      conditions.push(inArray(users.id, params.ids));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(users).where(whereClause);

    // Whitelist sortable columns to prevent SQL injection
    const SORTABLE: Record<string, typeof users[keyof typeof users]> = {
      createdAt: users.createdAt,
      availableBalance: users.availableBalance,
      totalEarnings: users.totalEarnings,
      performanceScore: users.performanceScore,
      firstName: users.firstName,
      lastName: users.lastName,
    };
    const sortCol = (params.sort && SORTABLE[params.sort]) ? SORTABLE[params.sort] : users.createdAt;
    const orderExpr = params.sortOrder === 'asc' ? asc(sortCol as any) : desc(sortCol as any);

    const results = await db.select().from(users).where(whereClause).limit(params.limit).offset(offset).orderBy(orderExpr);
    return { users: results, totalCount: Number(countResult?.count || 0) };
  }

  async getAuditLogsPaginated(params: { page: number, limit: number, search?: string, ids?: string[], period?: string, dateFrom?: string, dateTo?: string, targetType?: string, targetId?: string, category?: string, action?: string, actorId?: string, ipAddress?: string }): Promise<{ logs: any[], totalCount: number }> {
    const offset = (params.page - 1) * params.limit;
    const conditions = [];

    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(or(
        ilike(auditLogs.action, searchPattern),
        ilike(users.firstName, searchPattern),
        ilike(users.lastName, searchPattern),
        ilike(users.email, searchPattern)
      ));
    }

    if (params.ids && params.ids.length > 0) {
      conditions.push(inArray(auditLogs.id, params.ids));
    }

    if (params.targetType) {
      conditions.push(eq(auditLogs.targetType, params.targetType));
    }

    if (params.targetId) {
      conditions.push(eq(auditLogs.targetId, params.targetId));
    }

    if (params.category && params.category !== 'all') {
      conditions.push(eq(auditLogs.category, params.category));
    }

    if (params.action && params.action !== 'ALL') {
      conditions.push(eq(auditLogs.action, params.action));
    }

    if (params.actorId) {
      conditions.push(eq(auditLogs.adminId, params.actorId));
    }

    if (params.ipAddress) {
      conditions.push(ilike(auditLogs.ipAddress, `%${params.ipAddress}%`));
    }

    // An explicit date range takes priority over the `period` preset — the
    // frontend never sends both, but if it did, an exact range is the more
    // specific ask.
    if (params.dateFrom || params.dateTo) {
      if (params.dateFrom) {
        const from = new Date(params.dateFrom);
        if (!isNaN(from.getTime())) conditions.push(gte(auditLogs.createdAt, from));
      }
      if (params.dateTo) {
        const to = new Date(params.dateTo);
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          conditions.push(lte(auditLogs.createdAt, to));
        }
      }
    } else if (params.period && params.period !== 'all_time') {
      const startDate = new Date();
      switch (params.period) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          conditions.push(gte(auditLogs.createdAt, startDate));
          break;
        case 'yesterday':
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          conditions.push(and(gte(auditLogs.createdAt, startDate), lte(auditLogs.createdAt, endDate)));
          break;
        case 'this_week':
          startDate.setDate(startDate.getDate() - 7);
          conditions.push(gte(auditLogs.createdAt, startDate));
          break;
        case 'this_month':
          startDate.setMonth(startDate.getMonth() - 1);
          conditions.push(gte(auditLogs.createdAt, startDate));
          break;
        case 'this_year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          conditions.push(gte(auditLogs.createdAt, startDate));
          break;
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.adminId, users.id))
      .where(whereClause);
    
    const results = await db.select({
      log: auditLogs,
      admin: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
      }
    })
    .from(auditLogs)
    .innerJoin(users, eq(auditLogs.adminId, users.id))
    .where(whereClause)
    .limit(params.limit)
    .offset(offset)
    .orderBy(desc(auditLogs.createdAt));

    return { 
      logs: results.map(r => {
        const actorName = [r.admin.firstName, r.admin.lastName].filter(Boolean).join(" ").trim() || r.admin.email || "Someone";
        return {
          ...r.log,
          admin: r.admin,
          description: describeAuditLog({
            action: r.log.action,
            targetType: r.log.targetType,
            targetId: r.log.targetId,
            details: r.log.details,
            actorName,
          }),
        };
      }), 
      totalCount: Number(countResult?.count || 0) 
    };
  }

  async getDistinctAuditActions(category?: string): Promise<string[]> {
    const whereClause = category && category !== 'all' ? eq(auditLogs.category, category) : undefined;
    const rows = await db.selectDistinct({ action: auditLogs.action })
      .from(auditLogs)
      .where(whereClause)
      .orderBy(asc(auditLogs.action));
    return rows.map(r => r.action);
  }

  async getWithdrawalsPaginated(params: { page: number, limit: number, search?: string, status?: string, ids?: string[], sort?: string }): Promise<{ withdrawals: Array<Withdrawal & { user: User }>, totalCount: number }> {
    const offset = (params.page - 1) * params.limit;
    const conditions = [];
    
    if (params.status && params.status !== 'all') {
      conditions.push(eq(withdrawals.status, params.status as any));
    }

    if (params.ids && params.ids.length > 0) {
      conditions.push(inArray(withdrawals.id, params.ids));
    }
    
    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(or(
        ilike(users.firstName, searchPattern),
        ilike(users.lastName, searchPattern),
        ilike(users.email, searchPattern),
        ilike(withdrawals.accountNumber, searchPattern)
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(withdrawals)
      .innerJoin(users, eq(withdrawals.userId, users.id))
      .where(whereClause);

    // Payout Operations audit: sorting used to happen client-side on the current
    // page only, so "prioritize S-Rank withdrawals" only ever reordered the 8
    // rows already fetched. Sort is now a server-side param applied across the
    // full filtered dataset, before pagination.
    const orderByClauses = params.sort === 'rank'
      ? [asc(sql`CASE ${users.userRankTier}
          WHEN 'S-Rank' THEN 1
          WHEN 'A-Rank' THEN 2
          WHEN 'B-Rank' THEN 3
          WHEN 'C-Rank' THEN 4
          WHEN 'D-Rank' THEN 5
          WHEN 'E-Rank' THEN 6
          ELSE 7 END`), desc(withdrawals.createdAt)]
      : params.sort === 'deadtime'
      ? [asc(withdrawals.createdAt)]
      : [desc(withdrawals.createdAt)];

    const results = await db
      .select({
        withdrawal: withdrawals,
        user: users
      })
      .from(withdrawals)
      .innerJoin(users, eq(withdrawals.userId, users.id))
      .where(whereClause)
      .limit(params.limit)
      .offset(offset)
      .orderBy(...orderByClauses);

    return {
      withdrawals: results.map(r => ({ ...r.withdrawal, user: r.user })),
      totalCount: Number(countResult?.count || 0)
    };
  }

  async bulkUpdateWithdrawalStatus(ids: string[], status: string, adminId: string): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    // 'completed'/'rejected' must go through updateWithdrawalStatus so they hit
    // processWithdrawal/rejectWithdrawal — the sole code paths that consume the
    // user_transactions FIFO ledger, mark rows withdrawn, deduct txPointsBalance,
    // and credit referral_commissions (spec Part E.7, Appendix A invariants #1/#2/#4).
    // A raw UPDATE here (the old behavior) flipped status without touching the
    // ledger at all — a real double-spend risk. Non-terminal statuses (e.g.
    // 'processing') still use a plain update since there's no ledger effect yet.
    //
    // Each item is isolated in its own try/catch (Payout Operations audit finding):
    // previously one bad id (e.g. already completed/rejected by a race, or a stale
    // selection spanning pages) threw and silently aborted every remaining id in
    // the batch with no indication of which ones had already succeeded.
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    if (status === 'completed' || status === 'rejected') {
      for (const id of ids) {
        try {
          await this.updateWithdrawalStatus(id, status, adminId, undefined, status === 'rejected' ? 'Bulk rejection by administrator' : undefined);
          await db.insert(auditLogs).values({
            adminId,
            action: `BULK_WITHDRAWAL_${status.toUpperCase()}`,
            targetType: "withdrawal",
            targetId: id,
            details: { action: 'bulk_status_update', status, bulkOperation: true }
          });
          succeeded.push(id);
        } catch (error) {
          failed.push({ id, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return { succeeded, failed };
    }

    for (const id of ids) {
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(withdrawals)
            .set({ 
              status: status as any, 
              processedAt: null,
              updatedAt: new Date()
            })
            .where(eq(withdrawals.id, id));

          await tx.insert(auditLogs).values({
            adminId,
            action: `BULK_WITHDRAWAL_${status.toUpperCase()}`,
            targetType: "withdrawal",
            targetId: id,
            details: { action: 'bulk_status_update', status, bulkOperation: true }
          });
        });
        succeeded.push(id);
      } catch (error) {
        failed.push({ id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { succeeded, failed };
  }

  // System Config
  async getSystemConfig(key: string): Promise<SystemConfig | undefined> {
    const [config] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, key));
    return config;
  }

  async getAllSystemConfigs(): Promise<SystemConfig[]> {
    return await db.select().from(systemConfig);
  }

  async updateSystemConfig(key: string, value: any, adminId: string): Promise<SystemConfig | undefined> {
    // System Settings audit (2026-07-29): the old update-then-insert pattern
    // raced under concurrent writes to the same key — two simultaneous PATCHes
    // could both miss the UPDATE (row not committed yet) and both attempt the
    // INSERT, throwing an unhandled unique-constraint violation. A single
    // atomic upsert removes that window entirely. This also now captures the
    // pre-change value in the audit log (previously only the new value was
    // recorded, making a future rollback/history feature impossible).
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, key));

      const [result] = await tx
        .insert(systemConfig)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemConfig.key,
          set: { value, updatedAt: new Date() },
        })
        .returning();

      await tx.insert(auditLogs).values({
        adminId,
        action: existing ? "SYSTEM_CONFIG_UPDATED" : "SYSTEM_CONFIG_CREATED",
        targetType: "system",
        targetId: key,
        details: existing ? { key, oldValue: existing.value, newValue: value } : { key, newValue: value },
      });

      return result;
    });
  }

  async createSystemConfig(config: InsertSystemConfig): Promise<SystemConfig> {
    const [newConfig] = await db.insert(systemConfig).values(config).returning();
    return newConfig;
  }

  private generateReferralCode(): string {
    const prefix = "THORX";
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${suffix}`;
  }

  // ── Device Fingerprinting & Email Verification ──

  async createDeviceFingerprint(data: InsertDeviceFingerprint): Promise<DeviceFingerprint> {
    const [fp] = await db
      .insert(deviceFingerprints)
      .values(data)
      .onConflictDoUpdate({
        target: [deviceFingerprints.userId, deviceFingerprints.fingerprintHash],
        set: { lastSeenAt: new Date(), userAgent: data.userAgent, ipAddress: data.ipAddress },
      })
      .returning();
    return fp;
  }

  // Counts only role='user' accounts bound to this device fingerprint. team/founder/admin
  // accounts on the same device are deliberately excluded so that the "max 1 personal
  // account per device" cap doesn't get consumed by a team/founder/admin account sharing
  // the same device — a person is allowed exactly one personal (role='user') account plus
  // one team/founder/admin account on the same device.
  async getAccountCountByFingerprint(fingerprintHash: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${deviceFingerprints.userId})` })
      .from(deviceFingerprints)
      .innerJoin(users, eq(users.id, deviceFingerprints.userId))
      .where(and(eq(deviceFingerprints.fingerprintHash, fingerprintHash), eq(users.role, 'user')));
    return Number(result[0]?.count ?? 0);
  }

  async updateDeviceFingerprintLastSeen(userId: string, fingerprintHash: string): Promise<void> {
    await db
      .update(deviceFingerprints)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(deviceFingerprints.userId, userId),
          eq(deviceFingerprints.fingerprintHash, fingerprintHash)
        )
      );
  }

  async markUserEmailVerified(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ isVerified: true, emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));
  }

  // ─── Risk Case Management ──────────────────────────────────────────────────

  async listRiskCases(filters?: {
    severity?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
    sortDir?: "asc" | "desc";
  }): Promise<{
    cases: Array<RiskCase & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'avatar' | 'userRankTier' | 'profilePicture'> }>;
    total: number;
    severityCounts: { Critical: number; High: number; Medium: number; Low: number };
  }> {
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    // Base filter: only surface cases that represent genuine risk.
    // A case qualifies when it has triggered at least one signal (riskScore > 0)
    // OR a team member has already started working on it (status != Open).
    // Zero-score / untouched cases from clean users are excluded from the watchlist.
    const meaningfulCondition = or(
      sql`CAST(${riskCases.riskScore} AS NUMERIC) > 0`,
      ne(riskCases.status, 'Open')
    );

    const conditions: any[] = [meaningfulCondition];
    if (filters?.severity) conditions.push(eq(riskCases.severity, filters.severity));
    if (filters?.status) conditions.push(eq(riskCases.status, filters.status));
    if (filters?.search) {
      conditions.push(
        or(
          ilike(users.firstName, `%${filters.search}%`),
          ilike(users.lastName, `%${filters.search}%`),
          ilike(users.email, `%${filters.search}%`)
        )
      );
    }

    const where = and(...conditions);

    // Sort by risk score (highest risk first by default), then by most recently updated for ties
    const sortDir = filters?.sortDir ?? "desc";
    const scoreOrder = sortDir === "asc"
      ? asc(sql<number>`CAST(${riskCases.riskScore} AS NUMERIC)`)
      : desc(sql<number>`CAST(${riskCases.riskScore} AS NUMERIC)`);
    const rows = await db
      .select({
        riskCase: riskCases,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avatar: users.avatar,
          userRankTier: users.userRankTier,
          profilePicture: users.profilePicture,
        },
      })
      .from(riskCases)
      .innerJoin(users, eq(riskCases.userId, users.id))
      .where(where)
      .orderBy(scoreOrder, desc(riskCases.updatedAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(riskCases)
      .innerJoin(users, eq(riskCases.userId, users.id))
      .where(where);

    // Severity counts across meaningful cases for summary dashboard cards
    const sevRows = await db
      .select({
        severity: riskCases.severity,
        cnt: sql<number>`COUNT(*)::int`,
      })
      .from(riskCases)
      .where(meaningfulCondition)
      .groupBy(riskCases.severity);

    const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const row of sevRows) {
      const key = row.severity as keyof typeof severityCounts;
      if (key in severityCounts) severityCounts[key] = Number(row.cnt);
    }

    return {
      cases: rows.map((r) => ({ ...r.riskCase, user: r.user as any })),
      total: Number(countRow?.cnt ?? 0),
      severityCounts,
    };
  }

  async getRiskCase(id: string): Promise<(RiskCase & { user: User }) | undefined> {
    const [row] = await db
      .select({ riskCase: riskCases, user: users })
      .from(riskCases)
      .innerJoin(users, eq(riskCases.userId, users.id))
      .where(eq(riskCases.id, id))
      .limit(1);
    if (!row) return undefined;
    return { ...row.riskCase, user: row.user };
  }

  async updateRiskCase(id: string, updates: {
    status?: string;
    assignedTo?: string | null;
    notes?: string;
    notesBy?: string | null;
    notesUpdatedAt?: Date;
    resolvedBy?: string;
    resolvedAt?: Date;
    resolution?: string;
  }): Promise<RiskCase> {
    const [updated] = await db
      .update(riskCases)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(riskCases.id, id))
      .returning();
    // Guard: if ID doesn't exist, returning() yields an empty array and `updated`
    // is undefined. Accessing updated.userId in the route would throw a cryptic
    // "Cannot read properties of undefined" 500 instead of a clean 404.
    if (!updated) throw new Error("Risk case not found");
    return updated;
  }

  // ─── Score History ─────────────────────────────────────────────────────────

  async saveScoreHistory(entry: InsertScoreHistory): Promise<ScoreHistory> {
    const [saved] = await db.insert(scoreHistory).values(entry).returning();
    return saved;
  }

  async getScoreHistory(userId: string, limit: number = 30): Promise<ScoreHistory[]> {
    return db
      .select()
      .from(scoreHistory)
      .where(eq(scoreHistory.userId, userId))
      .orderBy(desc(scoreHistory.snapshotAt))
      .limit(limit);
  }

  // ─── Risk Signal Feedback Loop ──────────────────────────────────────────────
  // Aggregates resolved cases (Cleared = false positive, Actioned = confirmed
  // fraud) to show which signals actually predict real fraud vs. noise.
  async getRiskSignalStats(): Promise<Array<{
    signal: string;
    timesTriggered: number;
    actioned: number;
    cleared: number;
    precision: number | null;
  }>> {
    const resolved = await db
      .select({ status: riskCases.status, signals: riskCases.signals })
      .from(riskCases)
      .where(inArray(riskCases.status, ["Cleared", "Actioned"]));

    const stats = new Map<string, { timesTriggered: number; actioned: number; cleared: number }>();

    for (const row of resolved) {
      const signals = Array.isArray(row.signals) ? (row.signals as any[]) : [];
      for (const sig of signals) {
        if (!sig?.name || !(sig.score > 0)) continue;
        const entry = stats.get(sig.name) ?? { timesTriggered: 0, actioned: 0, cleared: 0 };
        entry.timesTriggered++;
        if (row.status === "Actioned") entry.actioned++;
        if (row.status === "Cleared") entry.cleared++;
        stats.set(sig.name, entry);
      }
    }

    return Array.from(stats.entries())
      .map(([signal, s]) => ({
        signal,
        ...s,
        precision: s.timesTriggered > 0 ? Math.round((s.actioned / s.timesTriggered) * 1000) / 10 : null,
      }))
      .sort((a, b) => (b.precision ?? 0) - (a.precision ?? 0));
  }

  // ── Engine C: Group Chat ─────────────────────────────────────────────────────

  async createEngineCMessage(data: { guildId: string; senderId: string; message: string }): Promise<any> {
    const [msg] = await db
      .insert(engineCMessages)
      .values({ guildId: data.guildId, senderId: data.senderId, message: data.message })
      .returning();
    const sender = await this.getUserById(data.senderId);
    return {
      ...msg,
      sender: sender ? {
        id: sender.id, firstName: sender.firstName, lastName: sender.lastName,
        avatar: sender.avatar, userRankTier: sender.userRankTier, personalRank: sender.personalRank,
      } : null,
    };
  }

  async getEngineCMessages(guildId: string, limit = 50, before?: string): Promise<any[]> {
    const rows = await db
      .select({
        id: engineCMessages.id,
        guildId: engineCMessages.guildId,
        senderId: engineCMessages.senderId,
        message: engineCMessages.message,
        createdAt: engineCMessages.createdAt,
        firstName: users.firstName,
        lastName: users.lastName,
        avatar: users.avatar,
        userRankTier: users.userRankTier,
        personalRank: users.personalRank,
      })
      .from(engineCMessages)
      .innerJoin(users, eq(engineCMessages.senderId, users.id))
      .where(
        before
          ? and(eq(engineCMessages.guildId, guildId), sql`${engineCMessages.createdAt} < ${before}::timestamptz`)
          : eq(engineCMessages.guildId, guildId)
      )
      .orderBy(sql`${engineCMessages.createdAt} DESC`)
      .limit(limit);
    return rows.reverse();
  }

  async deleteEngineCMessage(messageId: string, guildId: string, adminId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [message] = await tx.select().from(engineCMessages).where(eq(engineCMessages.id, messageId)).limit(1);
      if (!message) throw new Error("Message not found — it may have already been deleted.");
      await tx.delete(engineCMessages).where(eq(engineCMessages.id, messageId));
      await tx.insert(auditLogs).values({
        adminId,
        action: "GUILD_CHAT_MESSAGE_DELETED",
        targetType: "guild",
        targetId: guildId,
        details: { messageId, senderId: message.senderId, messagePreview: message.message?.slice(0, 200) ?? null },
      });
    });
  }

  // ── Engine C: Weekly Tasks ───────────────────────────────────────────────────

  async getActiveWeeklyTasks(userId: string, guildId: string): Promise<any[]> {
    const now = new Date();
    const tasks = await db
      .select()
      .from(weeklyTasks)
      .where(
        and(
          eq(weeklyTasks.isActive, true),
          sql`${weeklyTasks.weekStart} <= ${now}`,
          sql`${weeklyTasks.weekEnd} >= ${now}`
        )
      )
      .orderBy(weeklyTasks.weekStart);

    // Audit finding (Task & Ad Management, 2026-07-28): targetGuildRank is labeled
    // "minimum rank required" in the admin UI (TaskManager.tsx) but was never
    // enforced here — every guild member saw every weekly task regardless of their
    // guild's GPS-derived rank tier. Gate visibility the same way Engine B gates
    // its own targetRank against the completing user's rank.
    const [guild] = await db.select().from(guilds).where(eq(guilds.id, guildId));
    const gpsConfig = await fetchGpsConfig();
    const guildRankTier = guild ? computeGuildRankTier(guild.guildPerformanceScore, gpsConfig.rankMins) : "E-Rank";
    const RANK_LETTERS = ["E", "D", "C", "B", "A", "S"];
    const guildRankIdx = RANK_LETTERS.indexOf(guildRankTier[0]);
    const eligibleTasks = tasks.filter(t => guildRankIdx >= RANK_LETTERS.indexOf(t.targetGuildRank ?? "E"));

    const records = await db
      .select()
      .from(weeklyTaskRecords)
      .where(and(eq(weeklyTaskRecords.userId, userId), eq(weeklyTaskRecords.guildId, guildId)));

    const recordMap = new Map(records.map(r => [r.taskId, r]));
    return eligibleTasks.map(t => ({
      ...t,
      completedByUser: recordMap.has(t.id),
      completionRecord: recordMap.get(t.id) ?? null,
    }));
  }

  async getAllWeeklyTasks(): Promise<any[]> {
    return db.select().from(weeklyTasks).orderBy(sql`${weeklyTasks.weekStart} DESC`);
  }

  async createWeeklyTask(data: Omit<InsertWeeklyTask, "id" | "createdAt">): Promise<any> {
    const [task] = await db.insert(weeklyTasks).values(data as any).returning();
    return task;
  }

  async updateWeeklyTask(taskId: string, updates: Partial<InsertWeeklyTask>): Promise<any> {
    const [task] = await db.update(weeklyTasks).set(updates as any).where(eq(weeklyTasks.id, taskId)).returning();
    return task;
  }

  async deleteWeeklyTask(taskId: string): Promise<void> {
    await db.delete(weeklyTasks).where(eq(weeklyTasks.id, taskId));
  }

  // completeWeeklyTask() was removed — it directly updated txPointsBalance bypassing
  // the recordEarnEvent pipeline. Use completeWeeklyTaskAtomic() instead.

  // ── Engine C: Guild Settings (Captain only) ──────────────────────────────────

  // Points per difficulty tier, keyed by guild rank tier.
  // When a captain selects a difficulty, this table determines the weeklyTarget
  // that gets written to the DB. Admins can still override weeklyTarget directly.
  // Spec difficulty tiers: low (Easy) | medium (Medium) | high (Hard) | elite (Elite).
  // Elite is a 4th challenge tier — approximately 2× high, intended for S-Rank guilds.
  static readonly DIFFICULTY_TARGETS: Record<string, Record<string, number>> = {
    "E-Rank": { low: 10_000,  medium: 25_000,   high:  50_000,  elite:  100_000 },
    "D-Rank": { low: 25_000,  medium: 50_000,   high: 100_000,  elite:  200_000 },
    "C-Rank": { low: 50_000,  medium: 100_000,  high: 200_000,  elite:  400_000 },
    "B-Rank": { low: 100_000, medium: 200_000,  high: 400_000,  elite:  800_000 },
    "A-Rank": { low: 200_000, medium: 400_000,  high: 800_000,  elite: 1_600_000 },
    "S-Rank": { low: 400_000, medium: 800_000,  high: 1_600_000, elite: 3_200_000 },
  };

  async updateGuildSettings(guildId: string, captainId: string, settings: {
    name?: string; description?: string; minRankRequired?: string;
    recruitmentOpen?: boolean; isPublic?: boolean; pinnedMemberId?: string | null; avatarUrl?: string;
  }): Promise<any> {
    const membership = await this.getUserGuildMembership(captainId);
    if (!membership || membership.guildId !== guildId || membership.role !== "captain") {
      throw new Error("Only the guild captain can update guild settings.");
    }
    const updates: any = {};
    if (settings.name !== undefined) updates.name = settings.name.trim();
    if (settings.description !== undefined) updates.description = settings.description;
    if (settings.minRankRequired !== undefined) updates.minRankRequired = settings.minRankRequired;
    if (settings.recruitmentOpen !== undefined) updates.recruitmentOpen = settings.recruitmentOpen;
    if (settings.isPublic !== undefined) updates.isPublic = settings.isPublic; // R-26
    if ("pinnedMemberId" in settings) updates.pinnedMemberId = settings.pinnedMemberId;
    if (settings.avatarUrl !== undefined) updates.avatarUrl = settings.avatarUrl;
    // Note: targetDifficulty is admin-only (Plan Phase 4, §5.6). Captains cannot change it.

    const [guild] = await db.update(guilds).set(updates).where(eq(guilds.id, guildId)).returning();
    return guild;
  }

  // Post or update the guild's pinned announcement (captain only).
  async postGuildAnnouncement(guildId: string, captainId: string, text: string): Promise<any> {
    const membership = await this.getUserGuildMembership(captainId);
    if (!membership || membership.guildId !== guildId || membership.role !== "captain") {
      throw new Error("Only the guild captain can post announcements.");
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) throw new Error("Announcement text cannot be empty.");
    if (trimmed.length > 500) throw new Error("Announcement must be 500 characters or fewer.");

    const [guild] = await db.update(guilds)
      .set({ latestAnnouncement: trimmed, announcementPostedAt: new Date() })
      .where(eq(guilds.id, guildId))
      .returning();
    return guild;
  }

  // Clear (dismiss) the guild's current announcement (captain only).
  async clearGuildAnnouncement(guildId: string, captainId: string): Promise<any> {
    const membership = await this.getUserGuildMembership(captainId);
    if (!membership || membership.guildId !== guildId || membership.role !== "captain") {
      throw new Error("Only the guild captain can clear announcements.");
    }
    const [guild] = await db.update(guilds)
      .set({ latestAnnouncement: null, announcementPostedAt: null })
      .where(eq(guilds.id, guildId))
      .returning();
    return guild;
  }

  // ── THORX v3 (spec E.9): Guild discovery, applications, captain DM, roster/nudge ──

  async getGuildDiscoveryList(): Promise<any[]> {
    // Spec F.6: include successfulWeeks + active war status (Phase 6 "War mein" badge).
    const [rows, successCounts, activeWars] = await Promise.all([
      db.select()
        .from(guilds)
        .where(and(eq(guilds.status, "active"), eq(guilds.isPublic, true)))
        .orderBy(desc(guilds.guildPerformanceScore)),
      db.select({
        guildId: guildWeeklySnapshots.guildId,
        count: sql<number>`COUNT(*)::int`,
      })
        .from(guildWeeklySnapshots)
        .where(eq(guildWeeklySnapshots.wasSuccessful, true))
        .groupBy(guildWeeklySnapshots.guildId),
      db.select({
        challengerGuildId: guildWars.challengerGuildId,
        challengedGuildId: guildWars.challengedGuildId,
      })
        .from(guildWars)
        .where(eq(guildWars.status, "active")),
    ]);
    const countMap = new Map(successCounts.map(r => [r.guildId, r.count]));
    const warGuildIds = new Set<string>();
    activeWars.forEach(w => { warGuildIds.add(w.challengerGuildId); warGuildIds.add(w.challengedGuildId); });
    return rows.map(g => ({
      ...g,
      successfulWeeks: countMap.get(g.id) ?? 0,
      inActiveWar: warGuildIds.has(g.id),
    }));
  }

  async getGuildApplicationStatus(userId: string): Promise<GuildMember | undefined> {
    const [membership] = await db
      .select()
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, userId), eq(guildMembers.status, "pending")))
      .orderBy(desc(guildMembers.requestedAt))
      .limit(1);
    return membership;
  }

  // Spec E.9: join application with a required cover letter + rank gate.
  async applyToGuildWithCoverLetter(guildId: string, userId: string, coverLetter: string): Promise<GuildMember> {
    return await db.transaction(async (tx) => {
      const existing = await this.getActiveGuildMembershipTx(tx, userId);
      if (existing) throw new Error("You are already in a guild.");

      const [pendingExisting] = await tx
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.userId, userId), eq(guildMembers.status, "pending")))
        .limit(1);
      if (pendingExisting) throw new Error("You already have a pending join request.");

      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.status !== "active" || !guild.recruitmentOpen) {
        throw new Error("This guild is not accepting new members right now.");
      }
      // No hard member cap — a guild's captain may accept as many members as they
      // choose; recruitmentOpen is the only gate on new applications.

      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];
      const userTierIdx = RANK_ORDER.indexOf(user?.userRankTier || "E-Rank");
      const minTierIdx = RANK_ORDER.indexOf(guild.minRankRequired || "E-Rank");
      if (userTierIdx < minTierIdx) {
        throw new Error(`This guild requires ${guild.minRankRequired} or higher.`);
      }

      const [membership] = await tx.insert(guildMembers).values({
        guildId,
        userId,
        role: "member",
        status: "pending",
        coverLetter,
      }).returning();
      return membership;
    });
  }

  // Spec E.9: PATCH /api/guilds/:id/applications/:applicationId — captain decides.
  async decideGuildApplication(
    guildId: string,
    applicationId: string,
    captainId: string,
    action: "accept" | "reject",
    rejectionReason?: string,
  ): Promise<GuildMember> {
    return await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.captainId !== captainId) throw new Error("Only the guild captain can decide applications.");

      const [membership] = await tx
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.id, applicationId), eq(guildMembers.guildId, guildId), eq(guildMembers.status, "pending")))
        .limit(1);
      if (!membership) throw new Error("No pending application found.");

      if (action === "accept") {
        const [updated] = await tx.update(guildMembers).set({
          status: "active",
          joinedAt: new Date(),
        }).where(eq(guildMembers.id, membership.id)).returning();

        await tx.update(guilds).set({
          memberCount: sql`${guilds.memberCount} + 1`,
          updatedAt: new Date(),
        }).where(eq(guilds.id, guildId));

        await tx.update(users).set({
          guildId,
          guildRole: "member",
        }).where(eq(users.id, membership.userId));

        await this.createNotification({
          userId: membership.userId,
          title: "Guild Application Accepted!",
          message: `You've joined ${guild.name}.`,
          type: "system",
        });

        return updated;
      } else {
        if (!rejectionReason || rejectionReason.trim().length < 10) {
          throw new Error("A rejection reason of at least 10 characters is required.");
        }
        const [updated] = await tx.update(guildMembers).set({
          status: "rejected",
        }).where(eq(guildMembers.id, membership.id)).returning();

        await this.createNotification({
          userId: membership.userId,
          title: "Guild Application Declined",
          message: rejectionReason.trim(),
          type: "system",
        });

        return updated;
      }
    });
  }

  // Admin: cross-guild queue of every pending join request/application, regardless
  // of which flow created it (requestToJoinGuild vs applyToGuildWithCoverLetter both
  // land in guild_members with status="pending" — there is no separate table to query).
  // Admin: bulk freeze/unfreeze/disband across a selected set of guilds in one action.
  // Reuses setGuildStatus per guild (same disband cleanup + per-guild audit log entry)
  // rather than duplicating that logic, then adds one roll-up audit entry for the batch.
  async adminBulkSetGuildStatus(guildIds: string[], status: "active" | "frozen" | "disbanded", adminId: string): Promise<{ updated: number; failed: Array<{ guildId: string; reason: string }> }> {
    let updated = 0;
    const failed: Array<{ guildId: string; reason: string }> = [];
    for (const guildId of guildIds) {
      try {
        await this.setGuildStatus(guildId, status, adminId);
        updated++;
      } catch (err) {
        // Don't fail the whole batch on one bad id — but surface which ones
        // failed and why so the admin isn't left guessing which guilds didn't update.
        failed.push({ guildId, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }
    await db.insert(auditLogs).values({
      adminId, action: "ADMIN_GUILD_BULK_STATUS_SET", targetType: "guild", targetId: "bulk",
      details: { guildIds, status, updatedCount: updated, failed },
    });
    return { updated, failed };
  }

  // Admin: broadcast a message to every active member of a selected set of guilds.
  // Reuses the same notifications table + broadcastToUser delivery path as every
  // other in-app notification — no new mechanism required.
  async adminBulkMessageGuilds(guildIds: string[], message: string, adminId: string): Promise<string[]> {
    const members = await db
      .select({ userId: guildMembers.userId, guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(inArray(guildMembers.guildId, guildIds), eq(guildMembers.status, "active")));

    for (const m of members) {
      await this.createNotification({
        userId: m.userId,
        title: "Message from Guild Admin",
        message,
        type: "system",
      });
    }

    const notifiedUserIds = members.map(m => m.userId);
    await db.insert(auditLogs).values({
      adminId, action: "ADMIN_GUILD_BULK_MESSAGE_SENT", targetType: "guild", targetId: "bulk",
      // Keep the actual recipient list in the audit trail (not just the count) so a
      // disputed "who got this message" question can be answered without guesswork.
      details: { guildIds, message, recipientCount: members.length, notifiedUserIds },
    });

    return notifiedUserIds;
  }

  async getGuildWeeklyHistory(guildId: string): Promise<GuildWeeklySnapshot[]> {
    return await db
      .select()
      .from(guildWeeklySnapshots)
      .where(eq(guildWeeklySnapshots.guildId, guildId))
      .orderBy(desc(guildWeeklySnapshots.weekStart))
      .limit(8);
  }

  // Used to gate the player-facing roster/history routes (see server/routes.ts
  // assertGuildRosterVisible): distinct from getActiveGuildMembershipTx, which
  // is transaction-scoped and private to the earn-event pipeline.
  async isActiveGuildMember(guildId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: guildMembers.id })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId), eq(guildMembers.status, "active")))
      .limit(1);
    return !!row;
  }

  async getGuildRosterForCaptain(guildId: string): Promise<any[]> {
    return await db
      .select({
        id: guildMembers.id,
        userId: guildMembers.userId,
        role: guildMembers.role,
        status: guildMembers.status,
        joinedAt: guildMembers.joinedAt,
        weeklyPointsContributed: guildMembers.weeklyPointsContributed,
        isMvp: guildMembers.isMvp,
        name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        userRankTier: users.userRankTier,
        lastActiveAt: users.lastActiveAt,
        profilePicture: users.profilePicture,
      })
      .from(guildMembers)
      .innerJoin(users, eq(users.id, guildMembers.userId))
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.status, "active")))
      .orderBy(desc(guildMembers.weeklyPointsContributed));
  }

  // Rate-limited to once per member per 24h — spec E.9 "nudge" action.
  async nudgeGuildMember(guildId: string, captainId: string, memberUserId: string): Promise<void> {
    // Atomic: cooldown check + update + notification must all commit or all roll back.
    await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.captainId !== captainId) throw new Error("Only the guild captain can nudge members.");

      const [membership] = await tx
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, memberUserId), eq(guildMembers.status, "active")))
        .limit(1);
      if (!membership) throw new Error("This user is not an active member of your guild.");

      if (membership.lastNudgedAt && Date.now() - membership.lastNudgedAt.getTime() < 24 * 60 * 60 * 1000) {
        throw new Error("You already nudged this member in the last 24 hours.");
      }

      await tx.update(guildMembers).set({ lastNudgedAt: new Date() }).where(eq(guildMembers.id, membership.id));
      await tx.insert(notifications).values({
        userId: memberUserId,
        title: "Your captain is nudging you!",
        message: `${guild.name} needs your help to hit this week's target.`,
        type: "system",
      });
    });
  }

  async setGuildMemberMvp(guildId: string, captainId: string, memberUserId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.captainId !== captainId) throw new Error("Only the guild captain can set the MVP.");

      const [membership] = await tx
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, memberUserId), eq(guildMembers.status, "active")))
        .limit(1);
      if (!membership) throw new Error("This user is not an active member of your guild.");
      if (membership.isMvp) throw new Error("This member is already this week's MVP.");

      // Week-lock: once any member in this guild has been assigned MVP for the
      // current ISO week, no reassignment is possible until Sunday's reset.
      const now = new Date();
      const isoYear = now.getUTCFullYear();
      // ISO week number: days since nearest Monday, adjusted for ISO year start
      const dayOfWeek = now.getUTCDay() === 0 ? 7 : now.getUTCDay(); // Mon=1…Sun=7
      const nearestMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (dayOfWeek - 1)));
      const jan4 = new Date(Date.UTC(isoYear, 0, 4));
      const jan4DayOfWeek = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
      const week1Monday = new Date(jan4.getTime() - (jan4DayOfWeek - 1) * 86400000);
      const isoWeek = Math.round((nearestMonday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
      const currentWeek = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;

      const [existingMvpThisWeek] = await tx
        .select({ id: guildMembers.id })
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.mvpSetWeek as any, currentWeek)))
        .limit(1);
      if (existingMvpThisWeek) throw new Error("MVP already set this week. Cannot reassign until Sunday's reset.");

      await tx.update(guildMembers).set({ isMvp: false, mvpSetWeek: null as any }).where(eq(guildMembers.guildId, guildId));
      await tx.update(guildMembers).set({ isMvp: true, mvpSetAt: new Date(), mvpSetWeek: currentWeek as any }).where(eq(guildMembers.id, membership.id));
    });
    await awardMVPGPS(guildId);
  }

  // ── THORX v3 (spec E.9): Withdrawal preview & referral cash withdrawal ─────

  async previewWithdrawal(userId: string, points: number): Promise<{
    exactPkr: string; platformFee: string; feePercent: number; referralCommission: string;
    referrerName: string | null; userNetPkr: string; sRankFastTrack: boolean;
  }> {
    const breakdown = await this.calculateWithdrawalBreakdown(userId, points);
    const feePercent = await this.getSystemConfigValue<number>("WITHDRAWAL_FEE_PCT", 15);
    const user = await this.getUserById(userId);
    return {
      exactPkr: breakdown.exactPkr,
      platformFee: breakdown.platformFee,
      feePercent,
      referralCommission: breakdown.referralCommission,
      referrerName: breakdown.referrerName,
      userNetPkr: breakdown.userNetPkr,
      sRankFastTrack: user?.userRankTier === "S-Rank",
    };
  }

  async getReferralCashBalance(userId: string): Promise<{ balanceCashPkr: string; totalEarnedAllTime: string; referralCount: number }> {
    const user = await this.getUserById(userId);
    const [totals] = await db
      .select({ total: sql<string>`COALESCE(SUM(${referralCommissions.commissionAmountPkr}), 0)` })
      .from(referralCommissions)
      .where(eq(referralCommissions.referrerId, userId));
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.referredBy, userId));
    return {
      balanceCashPkr: new Decimal(user?.balanceCashPkr ?? "0").toFixed(2),
      totalEarnedAllTime: new Decimal(totals?.total ?? "0").toFixed(2),
      referralCount: Number(count) || 0,
    };
  }

  // Spec E.9: no platform fee, minimum Rs. 50, same withdrawal method/account fields.
  async createReferralCashWithdrawal(userId: string, amount: number, method: string, accountName: string, accountNumber: string, accountDetails: any): Promise<Withdrawal> {
    if (!Number.isFinite(amount) || amount < 50) {
      throw new Error("Minimum referral cash withdrawal is Rs. 50.");
    }
    return await db.transaction(async (tx) => {
      // 1.2a: Row-level lock prevents two concurrent referral withdrawals from
      // both reading the same balance and both succeeding (overdraw race condition).
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!user) throw new Error("User not found");
      const balanceD = new Decimal(user.balanceCashPkr ?? "0");
      if (balanceD.lt(new Decimal(amount))) throw new Error(`Insufficient referral balance. Available: Rs.${balanceD.toFixed(2)}.`);

      const [pending] = await tx
        .select()
        .from(withdrawals)
        .where(and(eq(withdrawals.userId, userId), eq(withdrawals.status, "pending"), eq(withdrawals.method, `referral:${method}`)))
        .limit(1);
      if (pending) throw new Error("A pending referral cash withdrawal already exists.");

      await tx.update(users).set({
        balanceCashPkr: sql`${users.balanceCashPkr} - ${amount.toFixed(2)}`,
      }).where(eq(users.id, userId));

      const [withdrawal] = await tx.insert(withdrawals).values({
        userId,
        amount: amount.toFixed(2),
        method: `referral:${method}`,
        accountName,
        accountNumber,
        accountDetails: accountDetails ?? {},
        fee: "0.00",
        netAmount: amount.toFixed(2),
        status: "pending",
      }).returning();

      return withdrawal;
    });
  }

  // ── THORX v3 (spec E.9): Admin ops — ledger validator, PS/GPS overrides, ──
  // ── captain reassignment, weekly-target overrides, inactive-captain alert ──

  async adminValidateLedger(userIdOrEmail: string): Promise<LedgerValidationResult> {
    // The UI invites admins to paste either a raw user ID or an email — honor both.
    // Emails are normalized (trim + lowercase) before lookup, matching the
    // convention used elsewhere (e.g. getUserByEmail(email.toLowerCase())) —
    // otherwise a different-case paste produces a false "User not found".
    const trimmed = userIdOrEmail.trim();
    const user = trimmed.includes("@")
      ? await this.getUserByEmail(trimmed.toLowerCase())
      : await this.getUserById(trimmed);
    if (!user) throw new Error("User not found");

    const [ledgerAggRows, txStatsRows, feeStatsRows, referralEarnRows, referralCommissionRows, referralWithdrawnRows] = await Promise.all([
      db.select({
          pkrTotal: sql<string>`COALESCE(SUM(${userTransactions.realPkrValue}), 0)`,
          pointsTotal: sql<string>`COALESCE(SUM(${userTransactions.pointsCredited}), 0)`,
        })
        .from(userTransactions)
        .where(and(eq(userTransactions.userId, user.id), eq(userTransactions.withdrawn, false))),
      db.select({ count: sql<string>`COUNT(*)` })
        .from(userTransactions)
        .where(eq(userTransactions.userId, user.id)),
      db.select({ total: sql<string>`COALESCE(SUM(${withdrawals.fee}), 0)` })
        .from(withdrawals)
        .where(and(eq(withdrawals.userId, user.id), eq(withdrawals.status, "completed"))),
      // Referral cash wallet aggregates (2026-07-29 audit addition).
      db.select({ total: sql<string>`COALESCE(SUM(${referralEarnCommissions.commissionPkr}), 0)` })
        .from(referralEarnCommissions)
        .where(eq(referralEarnCommissions.referrerId, user.id)),
      db.select({ total: sql<string>`COALESCE(SUM(${referralCommissions.commissionAmountPkr}), 0)` })
        .from(referralCommissions)
        .where(eq(referralCommissions.referrerId, user.id)),
      // Money leaves balanceCashPkr the instant a referral:* withdrawal is
      // created (see createReferralCashWithdrawal) and is refunded on
      // rejection — so every non-rejected referral withdrawal (pending,
      // approved, processing, completed) counts as "withdrawn cash".
      db.select({ total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)` })
        .from(withdrawals)
        .where(and(
          eq(withdrawals.userId, user.id),
          sql`${withdrawals.method} LIKE 'referral:%'`,
          sql`${withdrawals.status} != 'rejected'`,
        )),
    ]);

    return buildLedgerValidationResult(
      user,
      ledgerAggRows[0]?.pkrTotal ?? "0",
      ledgerAggRows[0]?.pointsTotal ?? "0",
      Number(txStatsRows[0]?.count ?? 0),
      feeStatsRows[0]?.total ?? "0",
      new Decimal(referralEarnRows[0]?.total ?? "0").plus(referralCommissionRows[0]?.total ?? "0").toFixed(4),
      referralWithdrawnRows[0]?.total ?? "0",
    );
  }

  async adminValidateLedgerScan(limit = 1000, offset = 0): Promise<{
    scanned: number; totalEligible: number; flagged: number; critical: LedgerValidationResult[]; warnings: LedgerValidationResult[]; checkedAt: string;
  }> {
    // Scope matches the UI copy ("active user balances"): role='user' AND isActive.
    // Deactivated/banned accounts are excluded — their balances are frozen and
    // reviewed separately, not part of the routine integrity scan.
    const scanFilter = and(eq(users.role, "user"), eq(users.isActive, true));

    const [rows, [{ count: totalEligibleRaw }]] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          availableBalance: users.availableBalance,
          totalEarnings: users.totalEarnings,
          totalWithdrawn: users.totalWithdrawn,
          txPointsBalance: users.txPointsBalance,
          balanceCashPkr: users.balanceCashPkr,
        })
        .from(users)
        .where(scanFilter)
        // createdAt alone isn't guaranteed unique (seeded/bulk-imported rows can
        // share a timestamp) — add id as a stable tiebreaker so "Load next batch"
        // paging can't skip or re-scan a user at a page boundary.
        .orderBy(asc(users.createdAt), asc(users.id))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<string>`COUNT(*)` }).from(users).where(scanFilter),
    ]);
    const totalEligible = Number(totalEligibleRaw) || 0;

    const checkedAt = new Date().toISOString();
    if (rows.length === 0) {
      return { scanned: 0, totalEligible, flagged: 0, critical: [], warnings: [], checkedAt };
    }

    const userIds = rows.map(r => r.id);

    const [ledgerRows, txCountRows, feeRows, referralEarnRows, referralCommissionRows, referralWithdrawnRows] = await Promise.all([
      db.select({
          userId: userTransactions.userId,
          pkrTotal: sql<string>`COALESCE(SUM(${userTransactions.realPkrValue}), 0)`,
          pointsTotal: sql<string>`COALESCE(SUM(${userTransactions.pointsCredited}), 0)`,
        })
        .from(userTransactions)
        .where(and(inArray(userTransactions.userId, userIds), eq(userTransactions.withdrawn, false)))
        .groupBy(userTransactions.userId),
      db.select({ userId: userTransactions.userId, count: sql<string>`COUNT(*)` })
        .from(userTransactions)
        .where(inArray(userTransactions.userId, userIds))
        .groupBy(userTransactions.userId),
      db.select({ userId: withdrawals.userId, total: sql<string>`COALESCE(SUM(${withdrawals.fee}), 0)` })
        .from(withdrawals)
        .where(and(inArray(withdrawals.userId, userIds), eq(withdrawals.status, "completed")))
        .groupBy(withdrawals.userId),
      // Referral cash wallet aggregates (2026-07-29 audit addition) — see
      // buildLedgerValidationResult's computedCashBalance doc comment.
      db.select({ userId: referralEarnCommissions.referrerId, total: sql<string>`COALESCE(SUM(${referralEarnCommissions.commissionPkr}), 0)` })
        .from(referralEarnCommissions)
        .where(inArray(referralEarnCommissions.referrerId, userIds))
        .groupBy(referralEarnCommissions.referrerId),
      db.select({ userId: referralCommissions.referrerId, total: sql<string>`COALESCE(SUM(${referralCommissions.commissionAmountPkr}), 0)` })
        .from(referralCommissions)
        .where(inArray(referralCommissions.referrerId, userIds))
        .groupBy(referralCommissions.referrerId),
      db.select({ userId: withdrawals.userId, total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)` })
        .from(withdrawals)
        .where(and(
          inArray(withdrawals.userId, userIds),
          sql`${withdrawals.method} LIKE 'referral:%'`,
          sql`${withdrawals.status} != 'rejected'`,
        ))
        .groupBy(withdrawals.userId),
    ]);

    const ledgerByUser = new Map(ledgerRows.map(r => [r.userId, r]));
    const txCountByUser = new Map(txCountRows.map(r => [r.userId, Number(r.count) || 0]));
    const feeByUser = new Map(feeRows.map(r => [r.userId, r.total]));
    const referralEarnByUser = new Map(referralEarnRows.map(r => [r.userId, r.total]));
    const referralCommissionByUser = new Map(referralCommissionRows.map(r => [r.userId, r.total]));
    const referralWithdrawnByUser = new Map(referralWithdrawnRows.map(r => [r.userId, r.total]));

    const critical: LedgerValidationResult[] = [];
    const flaggedWarnings: LedgerValidationResult[] = [];

    for (const row of rows) {
      const ledger = ledgerByUser.get(row.id);
      const referralEarned = new Decimal(referralEarnByUser.get(row.id) ?? "0")
        .plus(referralCommissionByUser.get(row.id) ?? "0")
        .toFixed(4);
      const result = buildLedgerValidationResult(
        row,
        ledger?.pkrTotal ?? "0",
        ledger?.pointsTotal ?? "0",
        txCountByUser.get(row.id) ?? 0,
        feeByUser.get(row.id) ?? "0",
        referralEarned,
        referralWithdrawnByUser.get(row.id) ?? "0",
      );
      if (result.errors.length > 0) critical.push(result);
      else if (result.warnings.length > 0) flaggedWarnings.push(result);
    }

    // Surface the worst offenders first — admins triaging a long flagged list
    // need the largest Rs. mismatches at the top, not buried on a later
    // "Load next batch" page just because that account was created earlier
    // (audit 2026-07-29: was previously left in createdAt/id scan order).
    const byDiscrepancyDesc = (a: LedgerValidationResult, b: LedgerValidationResult) =>
      Math.abs(Number(b.discrepancy) || 0) - Math.abs(Number(a.discrepancy) || 0);
    critical.sort(byDiscrepancyDesc);
    flaggedWarnings.sort(byDiscrepancyDesc);

    return {
      scanned: rows.length,
      totalEligible,
      flagged: critical.length + flaggedWarnings.length,
      critical,
      warnings: flaggedWarnings,
      checkedAt,
    };
  }

  async adminAdjustUserPS(userId: string, delta: number, reason: string, adminId: string): Promise<User> {
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(users).set({
        performanceScore: sql`GREATEST(0, ${users.performanceScore} + ${delta})`,
      }).where(eq(users.id, userId)).returning();
      if (!updated) throw new Error("User not found");

      await tx.insert(auditLogs).values({
        adminId,
        action: "ADMIN_PS_ADJUSTMENT",
        targetType: "user",
        targetId: userId,
        details: { delta, reason },
      });
      return updated;
    }).then(async (updated) => {
      await checkAndUpdateRankTier(userId);
      return updated;
    });
  }

  async adminAdjustGuildGPS(guildId: string, delta: number, reason: string, adminId: string): Promise<Guild> {
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(guilds).set({
        guildPerformanceScore: sql`GREATEST(0, ${guilds.guildPerformanceScore} + ${delta})`,
        updatedAt: new Date(),
      }).where(eq(guilds.id, guildId)).returning();
      if (!updated) throw new Error("Guild not found");

      await tx.insert(auditLogs).values({
        adminId,
        action: "ADMIN_GPS_ADJUSTMENT",
        targetType: "guild",
        targetId: guildId,
        details: { delta, reason },
      });
      return updated;
    }).then(async (updated) => {
      await checkAndUpdateGuildRankTier(guildId);
      return updated;
    });
  }

  async adminReassignCaptain(guildId: string, newCaptainUserId: string, adminId: string): Promise<Guild> {
    return await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");

      const [newCaptainMembership] = await tx
        .select()
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, newCaptainUserId), eq(guildMembers.status, "active")))
        .limit(1);
      if (!newCaptainMembership) throw new Error("The new captain must be an active member of this guild.");

      const oldCaptainId = guild.captainId;
      await tx.update(guildMembers).set({ role: "member" })
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, oldCaptainId)));
      await tx.update(guildMembers).set({ role: "captain" })
        .where(eq(guildMembers.id, newCaptainMembership.id));
      await tx.update(users).set({ guildRole: "member" }).where(eq(users.id, oldCaptainId));
      await tx.update(users).set({ guildRole: "captain" }).where(eq(users.id, newCaptainUserId));

      const [updated] = await tx.update(guilds).set({ captainId: newCaptainUserId, updatedAt: new Date() })
        .where(eq(guilds.id, guildId)).returning();

      await tx.insert(auditLogs).values({
        adminId,
        action: "ADMIN_CAPTAIN_REASSIGNED",
        targetType: "guild",
        targetId: guildId,
        details: { oldCaptainId, newCaptainId: newCaptainUserId },
      });

      return updated;
    });
  }

  async adminSetGuildWeeklyTarget(guildId: string, weeklyTarget: number, adminId: string): Promise<Guild> {
    if (!Number.isFinite(weeklyTarget) || weeklyTarget <= 0) {
      throw new Error("Weekly target must be a positive number.");
    }
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(guilds).set({ weeklyTarget, updatedAt: new Date() })
        .where(eq(guilds.id, guildId)).returning();
      if (!updated) throw new Error("Guild not found");
      await tx.insert(auditLogs).values({
        adminId, action: "ADMIN_WEEKLY_TARGET_SET", targetType: "guild", targetId: guildId,
        details: { weeklyTarget },
      });
      return updated;
    });
  }

  // Bulk-assigns a weekly target to every ACTIVE guild currently at a given GPS
  // rank tier. Rank has no backing column, so this computes each guild's tier
  // in-process (same thresholds as gps-engine.ts) and batches one UPDATE per
  // rank rather than filtering on the unrelated `targetDifficulty` column
  // (which only ever holds low|medium|high — a documented bug: that filter
  // matched zero rows for every "by rank" request). Returns a per-rank count
  // so the admin UI can report exactly what changed instead of a blind toast.
  async adminBulkSetWeeklyTargetsByRank(targets: Partial<Record<GuildRankTier, number>>, adminId: string): Promise<Record<string, number>> {
    const entries = (Object.entries(targets) as [GuildRankTier, number][])
      .filter(([rank, val]) => GUILD_RANK_TIERS.includes(rank) && Number.isFinite(val) && val > 0);
    if (entries.length === 0) {
      throw new Error("At least one rank must have a valid positive weekly target.");
    }

    return await db.transaction(async (tx) => {
      const activeGuilds = await tx.select({ id: guilds.id, gps: guilds.guildPerformanceScore })
        .from(guilds).where(eq(guilds.status, "active"));
      const config = await fetchGpsConfig();

      const idsByRank = new Map<GuildRankTier, string[]>();
      for (const g of activeGuilds) {
        const tier = computeGuildRankTier(g.gps, config.rankMins);
        const list = idsByRank.get(tier);
        if (list) list.push(g.id); else idsByRank.set(tier, [g.id]);
      }

      const updatedCounts: Record<string, number> = {};
      const guildIdsByRank: Record<string, string[]> = {};
      for (const [rank, target] of entries) {
        const ids = idsByRank.get(rank) ?? [];
        updatedCounts[rank] = ids.length;
        guildIdsByRank[rank] = ids;
        if (ids.length === 0) continue;
        await tx.update(guilds).set({ weeklyTarget: target, updatedAt: new Date() })
          .where(inArray(guilds.id, ids));
      }

      // Record the actual affected guild IDs, not just per-rank counts, so the
      // audit trail can answer "which guilds exactly" after the fact.
      await tx.insert(auditLogs).values({
        adminId, action: "ADMIN_BULK_WEEKLY_TARGET_BY_RANK_SET", targetType: "guild", targetId: "bulk",
        details: { targets, updatedCounts, guildIdsByRank },
      });
      return updatedCounts;
    });
  }

  // Admin: add a user directly to a guild roster as an active member,
  // bypassing the application/approval flow (which is the only path a
  // regular user has). Mirrors the acceptance side-effects of
  // applyToGuildWithCoverLetter/decideGuildApplication (member row, denormalized
  // memberCount + users.guildId/guildRole, notification) without ever creating
  // a pending application row.
  async adminAddGuildMember(guildId: string, targetUserId: string, adminId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.status === "disbanded") throw new Error("This guild has been disbanded.");
      // No hard member cap — captains (and admins on their behalf) may add as many
      // active members as they choose.

      const [targetUser] = await tx.select().from(users).where(eq(users.id, targetUserId));
      if (!targetUser) throw new Error("User not found");

      const existing = await this.getActiveGuildMembershipTx(tx, targetUserId);
      if (existing) throw new Error("This user is already in a guild.");

      // A prior pending row for this guild+user should not block re-adding
      // them — clear it before inserting the fresh active membership.
      const [stalePending] = await tx.select().from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, targetUserId), eq(guildMembers.status, "pending")))
        .limit(1);
      if (stalePending) {
        await tx.update(guildMembers).set({ status: "rejected" }).where(eq(guildMembers.id, stalePending.id));
      }

      await tx.insert(guildMembers).values({
        guildId,
        userId: targetUserId,
        role: "member",
        status: "active",
        joinedAt: new Date(),
      });

      await tx.update(guilds).set({
        memberCount: sql`${guilds.memberCount} + 1`,
        updatedAt: new Date(),
      }).where(eq(guilds.id, guildId));

      await tx.update(users).set({ guildId, guildRole: "member" }).where(eq(users.id, targetUserId));

      await tx.insert(auditLogs).values({
        adminId, action: "ADMIN_GUILD_MEMBER_ADDED", targetType: "guild", targetId: guildId,
        details: { addedUserId: targetUserId },
      });

      await tx.insert(notifications).values({
        userId: targetUserId,
        title: "Added to a Guild",
        message: `An administrator added you to ${guild.name}.`,
        type: "system",
      });
    });
  }

  // Admin version of the captain-only POST /api/guilds/:id/assistant-captain —
  // same effects, but callable by team/admin accounts on any guild.
  async adminSetAssistantCaptain(guildId: string, memberId: string, adminId: string): Promise<Guild> {
    return await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (memberId === guild.captainId) throw new Error("The captain cannot also be the assistant captain.");

      const [membership] = await tx.select().from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, memberId), eq(guildMembers.status, "active")))
        .limit(1);
      if (!membership) throw new Error("This user is not an active member of this guild.");

      const [updated] = await tx.update(guilds)
        .set({ assistantCaptainId: memberId, updatedAt: new Date() })
        .where(eq(guilds.id, guildId)).returning();

      await tx.insert(auditLogs).values({
        adminId, action: "ADMIN_ASSISTANT_CAPTAIN_ASSIGNED", targetType: "guild", targetId: guildId,
        details: { assistantUserId: memberId },
      });

      await tx.insert(notifications).values({
        userId: memberId,
        title: "⚔️ You are now Assistant Captain!",
        message: `An administrator appointed you as Assistant Captain of ${guild.name}.`,
        type: "info",
      });

      return updated;
    });
  }

  // Admin version of DELETE /api/guilds/:id/assistant-captain.
  async adminRemoveAssistantCaptain(guildId: string, adminId: string): Promise<Guild> {
    return await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      const removedAssistantUserId = guild.assistantCaptainId;

      const [updated] = await tx.update(guilds)
        .set({ assistantCaptainId: null, assistantPermissions: [], updatedAt: new Date() })
        .where(eq(guilds.id, guildId)).returning();

      await tx.insert(auditLogs).values({
        adminId, action: "ADMIN_ASSISTANT_CAPTAIN_REMOVED", targetType: "guild", targetId: guildId,
        details: { removedAssistantUserId },
      });

      return updated;
    });
  }

  // Documented in the schema as "admin-only" (captains cannot change it — see
  // targetDifficulty comment below) but no route ever implemented it until now.
  async adminSetGuildTargetDifficulty(guildId: string, difficulty: "low" | "medium" | "high", adminId: string): Promise<Guild> {
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(guilds).set({ targetDifficulty: difficulty, updatedAt: new Date() })
        .where(eq(guilds.id, guildId)).returning();
      if (!updated) throw new Error("Guild not found");
      await tx.insert(auditLogs).values({
        adminId, action: "ADMIN_TARGET_DIFFICULTY_SET", targetType: "guild", targetId: guildId,
        details: { difficulty },
      });
      return updated;
    });
  }

  // Admin-scoped member removal — mirrors removeGuildMember but is invoked by
  // a team/admin account rather than the guild's own captain, and refuses to
  // remove the captain (admins must reassign the captain first so the guild
  // is never left without one).
  async adminRemoveGuildMember(guildId: string, targetUserId: string, adminId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [guild] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      if (!guild) throw new Error("Guild not found");
      if (guild.captainId === targetUserId) {
        throw new Error("Cannot kick the guild captain — reassign the captain first.");
      }

      const result = await tx
        .update(guildMembers)
        .set({ status: "left", leftAt: new Date() })
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, targetUserId), eq(guildMembers.status, "active")))
        .returning();
      if (result.length === 0) throw new Error("This user is not an active member of this guild.");

      await tx.update(guilds).set({
        memberCount: sql`GREATEST(${guilds.memberCount} - 1, 0)`,
        updatedAt: new Date(),
      }).where(eq(guilds.id, guildId));

      await tx.update(users).set({ guildId: null, guildRole: "simple" }).where(eq(users.id, targetUserId));

      await tx.insert(auditLogs).values({
        adminId, action: "ADMIN_GUILD_MEMBER_KICKED", targetType: "guild", targetId: guildId,
        details: { removedUserId: targetUserId },
      });

      await tx.insert(notifications).values({
        userId: targetUserId,
        title: "Removed from Guild",
        message: `You have been removed from ${guild.name} by an administrator.`,
        type: "system",
      });
    });
  }

  // Full audit trail behind a guild's strike count — who added each strike,
  // why, and whether/when it was cleared. The admin UI previously only ever
  // showed the live aggregate count with no way to see history.
  async getGuildStrikeHistory(guildId: string): Promise<Array<GuildStrike & { addedByName: string | null; clearedByName: string | null }>> {
    const strikeRows = await db.select().from(guildStrikes)
      .where(eq(guildStrikes.guildId, guildId)).orderBy(desc(guildStrikes.createdAt));

    const adminIds = Array.from(new Set(
      strikeRows.flatMap(s => [s.addedBy, s.clearedBy]).filter((id): id is string => !!id)
    ));
    const admins = adminIds.length
      ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, adminIds))
      : [];
    const nameMap = new Map(admins.map(a => [a.id, `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || "Unknown"]));

    return strikeRows.map(s => ({
      ...s,
      addedByName: s.addedBy ? nameMap.get(s.addedBy) ?? "Unknown" : null,
      clearedByName: s.clearedBy ? nameMap.get(s.clearedBy) ?? "Unknown" : null,
    }));
  }

  // Ecosystem-wide KPIs for the admin Guild Manager header — aggregated in SQL
  // rather than pulled client-side, so the numbers stay correct regardless of
  // the paginated guild list's current page/filter.
  async getGuildEcosystemStats(): Promise<{
    totalGuilds: number; active: number; frozen: number; disbanded: number;
    totalWeeklyBonusPoolPkr: string; avgGps: number;
  }> {
    const [row] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) FILTER (WHERE ${guilds.status} = 'active')`,
      frozen: sql<number>`count(*) FILTER (WHERE ${guilds.status} = 'frozen')`,
      disbanded: sql<number>`count(*) FILTER (WHERE ${guilds.status} = 'disbanded')`,
      totalPool: sql<string>`COALESCE(SUM(${guilds.weeklyBonusPool}) FILTER (WHERE ${guilds.status} = 'active'), 0)`,
      avgGps: sql<string>`COALESCE(AVG(${guilds.guildPerformanceScore}) FILTER (WHERE ${guilds.status} = 'active'), 0)`,
    }).from(guilds);

    return {
      totalGuilds: Number(row.total),
      active: Number(row.active),
      frozen: Number(row.frozen),
      disbanded: Number(row.disbanded),
      totalWeeklyBonusPoolPkr: new Decimal(row.totalPool || 0).toFixed(2),
      avgGps: Math.round(Number(row.avgGps) || 0),
    };
  }

  async adminGetInactiveCaptains(inactiveDays = 3): Promise<any[]> {
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
    return await db
      .select({
        guildId: guilds.id,
        guildName: guilds.name,
        captainId: guilds.captainId,
        captainName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        lastActiveAt: users.lastActiveAt,
      })
      .from(guilds)
      .innerJoin(users, eq(users.id, guilds.captainId))
      // A captain who has never been active (lastActiveAt IS NULL) is at least as
      // stale as one who was last seen before the cutoff — treat both as inactive
      // instead of silently excluding never-logged-in captains from this alert.
      .where(and(eq(guilds.status, "active"), or(lt(users.lastActiveAt, cutoff), isNull(users.lastActiveAt))))
      .orderBy(asc(users.lastActiveAt));
  }

  /**
   * Guild-wide dormancy watchlist — distinct from adminGetInactiveCaptains
   * (which only looks at the captain). A guild can have an active captain but
   * a fully checked-out roster, or vice versa, so this looks at every active
   * member's lastActiveAt and flags guilds where NOT ONE of them has been
   * seen since the cutoff (or the guild has no recorded activity at all).
   */
  async adminGetDormantGuilds(inactiveDays = 7): Promise<(Guild & {
    guildRank: GuildRankTier;
    nextRankMinGps: number | null;
    captainName: string;
    lastActivityAt: Date | null;
    activeMemberCount: number;
  })[]> {
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

    const activity = await db
      .select({
        guildId: guildMembers.guildId,
        lastActivityAt: sql<Date | null>`MAX(${users.lastActiveAt})`,
        activeMemberCount: sql<number>`COUNT(*)`,
      })
      .from(guildMembers)
      .innerJoin(users, eq(users.id, guildMembers.userId))
      .where(eq(guildMembers.status, "active"))
      .groupBy(guildMembers.guildId);

    const activityByGuildId = new Map(activity.map((a) => [a.guildId, a]));
    const dormantGuildIds = activity
      .filter((a) => a.lastActivityAt == null || new Date(a.lastActivityAt) < cutoff)
      .map((a) => a.guildId);
    if (dormantGuildIds.length === 0) return [];

    const rows = await db
      .select({ guild: guilds, captainFirstName: users.firstName, captainLastName: users.lastName })
      .from(guilds)
      .leftJoin(users, eq(users.id, guilds.captainId))
      .where(and(eq(guilds.status, "active"), inArray(guilds.id, dormantGuildIds)));

    const config = await fetchGpsConfig();
    const rankOrder = GUILD_RANK_TIERS;

    return rows
      .map(({ guild, captainFirstName, captainLastName }) => {
        const guildRank = computeGuildRankTier(guild.guildPerformanceScore, config.rankMins);
        const nextTier = rankOrder[rankOrder.indexOf(guildRank) + 1];
        const nextRankMinGps = nextTier ? (config.rankMins[`GPS_RANK_${nextTier[0]}_MIN`] ?? null) : null;
        const a = activityByGuildId.get(guild.id);
        return {
          ...guild,
          guildRank,
          nextRankMinGps,
          captainName: `${captainFirstName ?? ""} ${captainLastName ?? ""}`.trim() || "Unknown",
          lastActivityAt: a?.lastActivityAt ?? null,
          activeMemberCount: Number(a?.activeMemberCount ?? 0),
        };
      })
      .sort((x, y) => {
        // Guilds with zero recorded activity float to the top (most urgent).
        const ax = x.lastActivityAt ? new Date(x.lastActivityAt).getTime() : -1;
        const ay = y.lastActivityAt ? new Date(y.lastActivityAt).getTime() : -1;
        return ax - ay;
      });
  }

  async adminGetReferralStats(): Promise<{
    totalReferrals: number;
    activeReferrals: number;
    totalCommissionPaid: string;
    pendingCommission: string;
    thisWeekCommission: string;
    lastWeekCommission: string;
    thisMonthCommission: string;
    avgCommissionPerReferral: string;
    withdrawalFeeCommission: string;
    earnEventCommission: string;
  }> {
    const now = new Date();
    const weekAgo     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const monthAgo    = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Real referral relationships (users.referredBy) are the source of truth for
    // "how many people has X referred" — NOT referral_commissions, which only has a
    // row once a referred user's activity has actually generated a paid commission.
    // Using the commission tables here undercounts referrers whose invitees haven't
    // withdrawn / earned yet.
    const [referralCountRow] = await db
      .select({
        total:  sql<number>`COUNT(*)`,
        active: sql<number>`COUNT(*) FILTER (WHERE ${users.isActive})`,
      })
      .from(users)
      .where(isNotNull(users.referredBy));

    // Two commission channels feed referral earnings and both must be counted:
    //  1) referral_commissions      — 1-tier share of the withdrawal fee (D.8)
    //  2) referral_earn_commissions — 1% of gross on every earn event (Q1)
    // Omitting either one under-reports real commission paid out.
    const sumRange = async (from?: Date) => {
      const [wd] = await db
        .select({ total: sql<string>`COALESCE(SUM(${referralCommissions.commissionAmountPkr}), 0)` })
        .from(referralCommissions)
        .where(from ? gte(referralCommissions.createdAt, from) : sql`true`);
      const [earn] = await db
        .select({ total: sql<string>`COALESCE(SUM(${referralEarnCommissions.commissionPkr}), 0)` })
        .from(referralEarnCommissions)
        .where(from ? gte(referralEarnCommissions.createdAt, from) : sql`true`);
      return { withdrawal: new Decimal(wd?.total ?? "0"), earn: new Decimal(earn?.total ?? "0") };
    };
    const rangeBetween = async (from: Date, to: Date) => {
      const [wd] = await db
        .select({ total: sql<string>`COALESCE(SUM(${referralCommissions.commissionAmountPkr}), 0)` })
        .from(referralCommissions)
        .where(and(gte(referralCommissions.createdAt, from), lt(referralCommissions.createdAt, to)));
      const [earn] = await db
        .select({ total: sql<string>`COALESCE(SUM(${referralEarnCommissions.commissionPkr}), 0)` })
        .from(referralEarnCommissions)
        .where(and(gte(referralEarnCommissions.createdAt, from), lt(referralEarnCommissions.createdAt, to)));
      return new Decimal(wd?.total ?? "0").plus(new Decimal(earn?.total ?? "0"));
    };

    const [allTime, thisWeek, thisMonth, lastWeek] = await Promise.all([
      sumRange(undefined),
      sumRange(weekAgo),
      sumRange(monthAgo),
      rangeBetween(twoWeeksAgo, weekAgo),
    ]);

    const totalPaid   = allTime.withdrawal.plus(allTime.earn);
    const totalReferrals = Number(referralCountRow?.total) || 0;
    const avgPerRef   = totalReferrals > 0 ? totalPaid.div(totalReferrals).toFixed(2) : "0.00";

    return {
      totalReferrals,
      activeReferrals:       Number(referralCountRow?.active) || 0,
      totalCommissionPaid:   totalPaid.toFixed(2),
      // Commissions are credited synchronously (withdrawal approval / earn event) —
      // there is no queued/pending state in the current architecture, so this is
      // always "0.00" by design, not a bug. Kept for API-shape stability.
      pendingCommission:     "0.00",
      thisWeekCommission:    thisWeek.withdrawal.plus(thisWeek.earn).toFixed(2),
      lastWeekCommission:    lastWeek.toFixed(2),
      thisMonthCommission:   thisMonth.withdrawal.plus(thisMonth.earn).toFixed(2),
      avgCommissionPerReferral: avgPerRef,
      withdrawalFeeCommission: allTime.withdrawal.toFixed(2),
      earnEventCommission:     allTime.earn.toFixed(2),
    };
  }

  async adminGetReferralLeaderboard(limit = 20): Promise<any[]> {
    try {
    // Referral relationships (who actually referred whom) come from users.referredBy —
    // this is the real "X referred, Y active" count, independent of whether any of
    // those invitees have generated a commission yet (referral_commissions only has
    // rows for invitees whose activity already paid out, which previously caused this
    // leaderboard to under-report referralCount/activeCount for newer referrers).
    const referralRows = await db
      .select({
        referrerId:    users.referredBy,
        referralCount: sql<number>`COUNT(*)`,
        activeCount:   sql<number>`COUNT(*) FILTER (WHERE ${users.isActive})`,
      })
      .from(users)
      .where(isNotNull(users.referredBy))
      .groupBy(users.referredBy);

    if (referralRows.length === 0) return [];

    // Both commission channels must be combined — withdrawal-fee share (D.8) and
    // per-earn-event commission (Q1) — or total commission understates real payouts.
    const [withdrawalRows, earnRows] = await Promise.all([
      db.select({
          referrerId: referralCommissions.referrerId,
          total:      sql<string>`SUM(${referralCommissions.commissionAmountPkr})`,
          lastAt:     sql<string>`MAX(${referralCommissions.createdAt})`,
        })
        .from(referralCommissions)
        .groupBy(referralCommissions.referrerId),
      db.select({
          referrerId: referralEarnCommissions.referrerId,
          total:      sql<string>`SUM(${referralEarnCommissions.commissionPkr})`,
          lastAt:     sql<string>`MAX(${referralEarnCommissions.createdAt})`,
        })
        .from(referralEarnCommissions)
        .groupBy(referralEarnCommissions.referrerId),
    ]);

    const withdrawalMap = new Map(withdrawalRows.map(r => [r.referrerId, r]));
    const earnMap = new Map(earnRows.map(r => [r.referrerId, r]));

    const merged = referralRows.map(r => {
      const wd = withdrawalMap.get(r.referrerId as string);
      const earn = earnMap.get(r.referrerId as string);
      const totalCommission = new Decimal(wd?.total ?? "0").plus(new Decimal(earn?.total ?? "0"));
      const lastAts = [wd?.lastAt, earn?.lastAt].filter(Boolean) as string[];
      const lastReferralAt = lastAts.length
        ? lastAts.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
        : null;
      return {
        userId: r.referrerId as string,
        referralCount: Number(r.referralCount) || 0,
        activeCount: Number(r.activeCount) || 0,
        totalCommission,
        lastReferralAt,
      };
    });

    // Sort by total commission earned (the stated sort order), then by referral
    // count so unmonetized-but-active referrers still surface in a sensible order.
    merged.sort((a, b) => {
      const byCommission = b.totalCommission.comparedTo(a.totalCommission);
      return byCommission !== 0 ? byCommission : b.referralCount - a.referralCount;
    });

    const top = merged.slice(0, limit);
    if (top.length === 0) return [];

    const referrerUsers = await db
      .select({ id: users.id, email: users.email, firstName: users.firstName, userRankTier: users.userRankTier })
      .from(users)
      .where(inArray(users.id, top.map(r => r.userId)));
    const userMap = new Map(referrerUsers.map(u => [u.id, u]));

    return top.map(r => {
      const u = userMap.get(r.userId);
      return {
        userId: r.userId,
        email: u?.email ?? "",
        firstName: u?.firstName ?? "",
        userRankTier: u?.userRankTier ?? "E-Rank",
        totalCommission: r.totalCommission.toFixed(2),
        referralCount: r.referralCount,
        activeCount: r.activeCount,
        lastReferralAt: r.lastReferralAt,
      };
    });
    } catch (err) {
      logger.error({ err }, "adminGetReferralLeaderboard error");
      return [];
    }
  }

  // ── THORX v3 (spec E.9): Captain DM, weekly task preparation, activity feed ──

  async getCaptainMessageThread(guildId: string, userId1: string, userId2: string): Promise<any[]> {
    return await db
      .select()
      .from(captainMessages)
      .where(
        and(
          eq(captainMessages.guildId, guildId),
          or(
            and(eq(captainMessages.fromUserId, userId1), eq(captainMessages.toUserId, userId2)),
            and(eq(captainMessages.fromUserId, userId2), eq(captainMessages.toUserId, userId1)),
          )
        )
      )
      .orderBy(asc(captainMessages.createdAt))
      .limit(100);
  }

  async sendCaptainMessage(guildId: string, fromUserId: string, toUserId: string, message: string): Promise<any> {
    // Atomic: insert + read-status update must commit together.
    return await db.transaction(async (tx) => {
      const [msg] = await tx.insert(captainMessages).values({
        guildId,
        fromUserId,
        toUserId,
        message,
      }).returning();
      // Mark incoming messages from the recipient as read now that we're in thread.
      await tx.update(captainMessages)
        .set({ isRead: true })
        .where(
          and(
            eq(captainMessages.guildId, guildId),
            eq(captainMessages.fromUserId, toUserId),
            eq(captainMessages.toUserId, fromUserId),
            eq(captainMessages.isRead, false),
          )
        );
      return msg;
    });
  }

  // Creates the weekly task record WITHOUT updating txPointsBalance —
  // the caller (route) is responsible for calling recordEarnEvent afterward.
  async prepareWeeklyTaskCompletion(userId: string, guildId: string, taskId: string): Promise<{ record: any; task: any }> {
    const [task] = await db.select().from(weeklyTasks).where(eq(weeklyTasks.id, taskId));
    if (!task || !task.isActive) throw new Error("Task not found or inactive.");
    const now = new Date();
    if (now < task.weekStart || now > task.weekEnd) throw new Error("Task is not available this week.");

    return db.transaction(async (tx) => {
      const [lockedUser] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      if (!lockedUser) throw new Error("User not found.");
      const [existing] = await tx.select().from(weeklyTaskRecords)
        .where(and(eq(weeklyTaskRecords.userId, userId), eq(weeklyTaskRecords.taskId, taskId)));
      if (existing) throw new Error("Task already completed.");
      const [record] = await tx.insert(weeklyTaskRecords).values({ userId, guildId, taskId }).returning();
      return { record, task };
    });
  }

  /**
   * THORX v3 Audit Fix (finding 1-D):
   * Wraps the duplicate-check, record insert, and recordEarnEvent into a single
   * db.transaction() with a FOR UPDATE lock on the user row. This eliminates the
   * double-point race that existed when prepareWeeklyTaskCompletion() and
   * recordEarnEvent() were called as two separate unguarded DB operations from
   * the route handler. All points route through recordEarnEvent (Q3 decision).
   */
  async completeWeeklyTaskAtomic(
    userId: string,
    guildId: string,
    taskId: string,
  ): Promise<{ record: any; task: any; earnResult: any }> {
    return await db.transaction(async (tx) => {
      // Lock the user row — serialises concurrent completion attempts for the
      // same user. The second concurrent request will block here until the first
      // transaction commits, then see `existing` and throw "Task already completed."
      const [lockedUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!lockedUser) throw new Error("User not found.");

      const [task] = await tx.select().from(weeklyTasks).where(eq(weeklyTasks.id, taskId));
      if (!task || !task.isActive) throw new Error("Task not found or inactive.");
      const now = new Date();
      if (now < task.weekStart || now > task.weekEnd) throw new Error("Task not available this week.");

      // Audit finding (Task & Ad Management, 2026-07-28): getActiveWeeklyTasks only
      // controls what the UI shows — without re-checking here, a client could still
      // POST /complete directly on a taskId its guild doesn't qualify for.
      const [guildRow] = await tx.select().from(guilds).where(eq(guilds.id, guildId));
      const gpsConfig = await fetchGpsConfig();
      const guildRankTier = guildRow ? computeGuildRankTier(guildRow.guildPerformanceScore, gpsConfig.rankMins) : "E-Rank";
      const RANK_LETTERS = ["E", "D", "C", "B", "A", "S"];
      const guildRankIdx = RANK_LETTERS.indexOf(guildRankTier[0]);
      if (guildRankIdx < RANK_LETTERS.indexOf(task.targetGuildRank ?? "E")) {
        throw new Error("Your guild's rank does not meet this task's requirement.");
      }

      // Duplicate check INSIDE the lock — both concurrent requests can no longer
      // both pass this; the second will see the row committed by the first.
      const [existing] = await tx
        .select({ id: weeklyTaskRecords.id })
        .from(weeklyTaskRecords)
        .where(and(eq(weeklyTaskRecords.userId, userId), eq(weeklyTaskRecords.taskId, taskId)))
        .limit(1);
      if (existing) throw new Error("Task already completed.");

      const [record] = await tx
        .insert(weeklyTaskRecords)
        .values({ userId, guildId, taskId })
        .returning();

      // Q3 decision: route ALL points through recordEarnEvent so every earn
      // event goes through the Thorx Card draw + ledger pipeline.
      // H-04: Pass as string — grossPkr accepts string|number; avoid IEEE-754 float conversion.
      const grossPkrStr = task.taskCategory === "indirect" ? "0" : (task.grossPkrPerCompletion ?? "0");
      const grossPkr: string | number = task.taskCategory === "indirect" ? 0 : grossPkrStr;
      const engineType: "Engine_C" | "Indirect" = new Decimal(grossPkrStr).greaterThan(0) ? "Engine_C" : "Indirect";
      const earnResult = await this.recordEarnEvent({
        userId,
        engineType,
        grossPkr,
        sourceId: record.id,
        sourceType: "weekly_task",
        guildId,
        tx,
      });

      return { record, task, earnResult };
    });
  }

  async getActivityFeedEvents(limit = 50, eventType?: string): Promise<any[]> {
    const safeLimit = Math.min(limit, 200);
    const query = db
      .select({
        id:            activityFeed.id,
        eventType:     activityFeed.eventType,
        userId:        activityFeed.userId,
        guildId:       activityFeed.guildId,
        displayMessage: activityFeed.displayMessage,
        data:          activityFeed.data,
        createdAt:     activityFeed.createdAt,
        // Joined enrichment
        userEmail:     users.email,
        userRankTier:  users.userRankTier,
        guildName:     guilds.name,
        // Extracted from data JSONB
        engineType:    sql<string | null>`(${activityFeed.data}->>'engineType')`,
        pkrAmount:     sql<string | null>`(${activityFeed.data}->>'grossPkr')`,
        pointsAmount:  sql<number | null>`(${activityFeed.data}->>'rankedPointsCredited')::int`,
      })
      .from(activityFeed)
      .leftJoin(users,  eq(users.id,  activityFeed.userId))
      .leftJoin(guilds, eq(guilds.id, activityFeed.guildId))
      .orderBy(desc(activityFeed.createdAt))
      .limit(safeLimit);

    if (eventType) {
      return await query.where(eq(activityFeed.eventType, eventType));
    }
    return await query;
  }
}

/**
 * THORX domain data uses Drizzle + PostgreSQL (`DATABASE_URL`).
 */
export const storage = new DatabaseStorage();