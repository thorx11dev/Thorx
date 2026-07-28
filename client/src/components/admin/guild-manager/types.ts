// Shared types for the admin Guild Manager + its detail drawer.
// Kept in one place so the list view and the drawer never drift apart on field names.

export interface AdminGuild {
  id: string;
  name: string;
  description: string | null;
  captainId: string;
  guildScore: number;
  strikes: number;
  status: string; // active | frozen | disbanded
  isPublic: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  minRankRequired: string;
  recruitmentOpen: boolean;
  avatarUrl: string | null;
  guildPerformanceScore: number;
  memberCapacity: number;
  weeklyBonusPool: string;
  currentWeeklyPoints: number;
  weeklyTarget: number;
  targetDifficulty: string; // low | medium | high
  latestAnnouncement: string | null;
  announcementPostedAt: string | null;
  bonusPoolPkr: string;
  assistantCaptainId: string | null;
  // GPS-derived, computed server-side — there is no backing column for either.
  guildRank: string;
  nextRankMinGps: number | null;
}

export interface GuildMemberRow {
  id: string;
  userId: string;
  role: string; // captain | member
  status: string;
  joinedAt: string | null;
  weeklyPointsContributed: number;
  isMvp: boolean;
  name: string | null;
  userRankTier: string | null;
  lastActiveAt: string | null;
  profilePicture: string | null;
}

export interface GuildStrikeRow {
  id: string;
  guildId: string;
  reason: string;
  source: string; // admin | system_inactivity | system_fraud
  addedBy: string | null;
  addedByName: string | null;
  clearedBy: string | null;
  clearedByName: string | null;
  clearedAt: string | null;
  createdAt: string;
}

export interface GuildWeeklySnapshotRow {
  id: string;
  guildId: string;
  weekStart: string;
  targetPoints: number;
  achievedPoints: number;
  wasSuccessful: boolean;
  bonusPoolPkr: string;
  poolDisposition: string; // distributed | voided
  captainShare: string;
  membersShare: string;
  treasuryBonusPkr: string;
  achievementPct: string;
  createdAt: string;
}

export interface GuildChatMessageRow {
  id: string;
  guildId: string;
  senderId: string;
  message: string;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  userRankTier: string | null;
  personalRank: number | null;
}

// Guild-scoped slice of the system-wide audit_logs table — same shape the
// system Audit Log Viewer consumes, just pre-filtered server-side by guild.
export interface GuildAuditLogRow {
  id: string;
  adminId: string;
  admin?: { firstName: string; lastName: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

// A request to found a brand-new guild, awaiting admin approval — distinct
// from GuildApplicationRow, which is a request to join an *existing* guild.
export interface GuildCreationRequestRow {
  id: string;
  guildName: string;
  description: string | null;
  reason: string;
  status: string; // pending | approved | rejected
  userId: string;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string | null;
  userRankTier: string | null;
  adminNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

// A pending join request against an existing guild (guild_members row with
// status="pending") — distinct from GuildCreationRequest, which is a request
// to found a brand-new guild.
export interface GuildApplicationRow {
  id: string;
  guildId: string;
  guildName: string;
  userId: string;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string | null;
  userRankTier: string | null;
  coverLetter: string | null;
  requestedAt: string | null;
}
