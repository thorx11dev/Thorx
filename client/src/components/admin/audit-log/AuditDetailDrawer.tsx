/**
 * AuditDetailDrawer — right-side sheet showing full details for a single audit log entry.
 * Shows:
 *  - description (primary)
 *  - actor + role
 *  - action code badge
 *  - device / location / IP context
 *  - diff table when details.diff exists, else key/value pairs
 */
import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Terminal, Monitor, MapPin, Clock, User, Shield, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditLogRow } from "./types";
import {
  formatTimestamp,
  actorName,
  formatDevice,
  formatLocation,
  formatIp,
  formatRole,
  humanizeKey,
  renderDetailValue,
  parseDetails,
} from "./formatters";

interface AuditDetailDrawerProps {
  log: AuditLogRow | null;
  onClose: () => void;
}

function MetaRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg border-[1.5px] border-[#141413]/10 bg-zinc-50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-zinc-400" />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">{label}</div>
        <div className={cn("text-xs font-bold text-[#141413] break-all", mono && "font-mono")}>{value}</div>
      </div>
    </div>
  );
}

export function AuditDetailDrawer({ log, onClose }: AuditDetailDrawerProps) {
  if (!log) return null;

  const { diff, extras } = parseDetails(log.details);
  const hasDiff = Object.keys(diff).length > 0;
  const hasExtras = Object.keys(extras).length > 0;

  return (
    <Sheet open={!!log} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col gap-0 overflow-hidden">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b-[1.5px] border-[#141413]/10 text-left space-y-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex px-3 pt-1.5 pb-1 rounded-sm border-2 border-black text-[9px] font-black uppercase tracking-widest bg-zinc-100 text-black">
              {log.action}
            </span>
            {log.actorRole && (
              <span className="inline-flex px-2 py-1 rounded-full border-[1.5px] border-[#141413]/20 bg-white text-[9px] font-black uppercase tracking-widest text-zinc-500">
                {formatRole(log.actorRole)}
              </span>
            )}
          </div>
          <SheetTitle className="font-black text-base uppercase tracking-tight text-[#141413] leading-snug">
            {log.description}
          </SheetTitle>
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            {formatTimestamp(log.createdAt)}
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Actor + Context */}
          <section className="space-y-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">Actor</div>
            <MetaRow icon={User} label="Name" value={actorName(log)} />
            {log.admin?.email && (
              <MetaRow icon={Shield} label="Email" value={log.admin.email} />
            )}
            <MetaRow icon={Shield} label="Role" value={log.admin?.role ? log.admin.role.toUpperCase() : formatRole(log.actorRole)} />
            <MetaRow icon={Terminal} label="IP Address" value={formatIp(log.ipAddress)} mono />
          </section>

          <div className="border-t-[1.5px] border-[#141413]/5" />

          {/* Device / Location */}
          <section className="space-y-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">Session Context</div>
            <MetaRow icon={Monitor} label="Device" value={formatDevice(log)} />
            <MetaRow icon={MapPin} label="Location" value={formatLocation(log)} />
            <MetaRow icon={Clock} label="Timestamp" value={formatTimestamp(log.createdAt)} />
          </section>

          <div className="border-t-[1.5px] border-[#141413]/5" />

          {/* Target */}
          <section className="space-y-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">Target</div>
            <div className="rounded-xl border-[1.5px] border-[#141413]/10 bg-zinc-50 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Type</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#141413]">{log.targetType || "—"}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">ID</span>
                <span className="text-[10px] font-mono font-bold text-zinc-600 break-all text-right max-w-[240px]">
                  {log.targetId || "—"}
                </span>
              </div>
            </div>
          </section>

          {/* Details: diff view */}
          {hasDiff && (
            <>
              <div className="border-t-[1.5px] border-[#141413]/5" />
              <section className="space-y-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Change Diff</div>
                <div className="rounded-xl border-[1.5px] border-[#141413] overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b-[1.5px] border-[#141413]/10 bg-zinc-50">
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">Field</th>
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">Before</th>
                        <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-[1px] divide-[#141413]/5">
                      {Object.entries(diff).map(([field, { before, after }]) => (
                        <tr key={field} className="hover:bg-zinc-50/50">
                          <td className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#141413] whitespace-nowrap">
                            {humanizeKey(field)}
                          </td>
                          <td className="px-3 py-2 text-[10px] font-mono text-zinc-500 break-all max-w-[110px]">
                            {renderDetailValue(before)}
                          </td>
                          <td className="px-3 py-2 text-[10px] font-mono font-bold text-[#141413] break-all max-w-[110px]">
                            {renderDetailValue(after)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* Details: extra key/value pairs */}
          {hasExtras && (
            <>
              <div className="border-t-[1.5px] border-[#141413]/5" />
              <section className="space-y-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Details</div>
                <div className="rounded-xl border-[1.5px] border-[#141413]/10 bg-zinc-50 divide-y-[1px] divide-[#141413]/5 overflow-hidden">
                  {Object.entries(extras).map(([key, value]) => (
                    <div key={key} className="px-3 py-2 flex items-start justify-between gap-3">
                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 shrink-0">
                        {humanizeKey(key)}
                      </span>
                      <span className="text-[10px] font-bold text-[#141413] break-all text-right">
                        {renderDetailValue(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {!hasDiff && !hasExtras && (
            <>
              <div className="border-t-[1.5px] border-[#141413]/5" />
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center py-4">
                No additional details recorded
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
