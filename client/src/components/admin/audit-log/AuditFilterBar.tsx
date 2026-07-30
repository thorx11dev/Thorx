/**
 * AuditFilterBar — advanced filters panel for the Audit Log Viewer.
 * All filters drive server-side fetches (no client-side filtering).
 */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import type { AuditCategory, AuditActionsResponse } from "./types";

export interface FilterState {
  period: string;
  dateFrom: string;
  dateTo: string;
  action: string;
  actorId: string;
  ipAddress: string;
}

interface AuditFilterBarProps {
  category: AuditCategory;
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
}

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "this_year", label: "This Year" },
  { id: "all_time", label: "All-time" },
] as const;

export function AuditFilterBar({ category, filters, onChange, onReset }: AuditFilterBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data: actionsData } = useQuery<AuditActionsResponse>({
    queryKey: ["/api/admin/audit-logs/actions", category],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/audit-logs/actions?category=${encodeURIComponent(category)}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const actionOptions = actionsData?.actions ?? [];

  // Whether any filter beyond "all_time" period is active
  const dateRangeActive = !!(filters.dateFrom && filters.dateTo);
  const hasAdvancedFilter =
    (filters.action && filters.action !== "ALL") ||
    filters.actorId ||
    filters.ipAddress ||
    dateRangeActive;

  return (
    <div className="space-y-3">
      {/* Period pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide flex-wrap">
        {PERIODS.map((p) => {
          const isActive = !dateRangeActive && filters.period === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onChange({ period: p.id, dateFrom: "", dateTo: "" })}
              className={cn(
                "px-5 py-2 rounded-full border-[1.5px] font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap shadow-sm",
                isActive
                  ? "bg-[#111] text-white border-[#111]"
                  : "bg-white text-[#111] border-[#111]/10 hover:border-[#111]"
              )}
            >
              {p.label}
            </button>
          );
        })}

        {/* Advanced filter toggle */}
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className={cn(
            "ml-auto flex items-center gap-1.5 px-5 py-2 rounded-full border-[1.5px] font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap shadow-sm",
            hasAdvancedFilter || advancedOpen
              ? "bg-[#111] text-white border-[#111]"
              : "bg-white text-[#111] border-[#111]/10 hover:border-[#111]"
          )}
        >
          <Filter size={11} />
          Filters
          {hasAdvancedFilter && (
            <span className="ml-1 w-4 h-4 rounded-full bg-white text-[#111] text-[8px] font-black flex items-center justify-center">
              {[filters.action !== "ALL" && filters.action, filters.actorId, filters.ipAddress, dateRangeActive].filter(Boolean).length}
            </span>
          )}
          {advancedOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>

        {hasAdvancedFilter && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-4 py-2 rounded-full border-[1.5px] border-red-300 text-red-600 bg-white font-black text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all whitespace-nowrap shadow-sm"
          >
            <X size={10} />
            Clear
          </button>
        )}
      </div>

      {/* Advanced panel */}
      {advancedOpen && (
        <div className="bg-white border-[1.5px] border-[#111] rounded-[1.5rem] p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Date range from */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Date From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onChange({ dateFrom: e.target.value })}
                className="w-full h-9 px-3 bg-white border-[1.5px] border-[#111]/20 rounded-lg font-bold text-xs focus:outline-none focus:border-[#111] transition-colors text-[#111]"
              />
            </div>

            {/* Date range to */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Date To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onChange({ dateTo: e.target.value })}
                className="w-full h-9 px-3 bg-white border-[1.5px] border-[#111]/20 rounded-lg font-bold text-xs focus:outline-none focus:border-[#111] transition-colors text-[#111]"
              />
            </div>

            {/* Action dropdown */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Action Code</label>
              <select
                value={filters.action}
                onChange={(e) => onChange({ action: e.target.value })}
                className="w-full h-9 px-3 bg-white border-[1.5px] border-[#111]/20 rounded-lg font-bold text-xs focus:outline-none focus:border-[#111] transition-colors cursor-pointer text-[#111]"
              >
                <option value="ALL">All Actions</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            {/* Actor ID */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Actor ID</label>
              <input
                type="text"
                value={filters.actorId}
                onChange={(e) => onChange({ actorId: e.target.value })}
                placeholder="User ID…"
                className="w-full h-9 px-3 bg-white border-[1.5px] border-[#111]/20 rounded-lg font-bold text-xs focus:outline-none focus:border-[#111] transition-colors text-[#111] placeholder:text-zinc-300"
              />
            </div>

            {/* IP address */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400">IP Address</label>
              <input
                type="text"
                value={filters.ipAddress}
                onChange={(e) => onChange({ ipAddress: e.target.value })}
                placeholder="e.g. 192.168.1.1"
                className="w-full h-9 px-3 bg-white border-[1.5px] border-[#111]/20 rounded-lg font-bold text-xs focus:outline-none focus:border-[#111] transition-colors text-[#111] placeholder:text-zinc-300 font-mono"
              />
            </div>

          </div>

          {dateRangeActive && (
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
              Date range active — period pills are overridden
            </div>
          )}
        </div>
      )}
    </div>
  );
}
