// Shared types for the Audit Log Viewer and its sub-components.
// Full field set matches the backend contract for GET /api/admin/audit-logs.

export type AuditCategory = "team" | "guild" | "user";
export type ActorRole = "founder" | "admin" | "team" | "user";
export type ExportFormat = "csv" | "pdf";

export interface AuditLogRow {
  id: string;
  /** Historical naming — this is the actor's user id. */
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  category: AuditCategory;
  actorRole: ActorRole | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  createdAt: string;
  /** The actor's current profile info. */
  admin: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  } | null;
  /** Plain-English sentence computed server-side. Primary human-readable summary. */
  description: string;
}

export interface AuditLogsResponse {
  logs: AuditLogRow[];
  totalCount: number;
}

export interface AuditActionsResponse {
  actions: string[];
}

export interface AuditLogFilters {
  search: string;
  period: string;
  dateFrom: string;
  dateTo: string;
  category: AuditCategory;
  action: string;
  actorId: string;
  ipAddress: string;
}
