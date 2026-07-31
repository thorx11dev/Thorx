/**
 * AuditLogViewer — THORX Team Portal audit log interface.
 *
 * Three tabs: Users / Guilds / Team (mapped to category "user"/"guild"/"team").
 * All filters are server-driven; no client-side filter-only-current-page bug.
 * Export respects active tab + filters + selected rows.
 */
import React, { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Shield,
  Terminal,
  Monitor,
  MapPin,
  ChevronRight,
  Download,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TechnicalLabel from "@/components/ui/technical-label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { apiAbsolutePath } from "@/lib/apiOrigin";
import { downloadFromUrl } from "@/lib/downloadFromUrl";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

import type { AuditLogRow, AuditLogsResponse, AuditCategory } from "./audit-log/types";
import { AuditFilterBar, type FilterState } from "./audit-log/AuditFilterBar";
import { AuditDetailDrawer } from "./audit-log/AuditDetailDrawer";
import {
  formatTimestamp,
  relativeTime,
  actorName,
  formatDevice,
  formatLocation,
  formatIp,
  buildFetchQueryString,
  buildExportQueryString,
} from "./audit-log/formatters";

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 15;

const TAB_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "user", label: "Users" },
  { id: "guild", label: "Guilds" },
  { id: "team", label: "Team" },
];

const DEFAULT_FILTERS: FilterState = {
  period: "all_time",
  dateFrom: "",
  dateTo: "",
  action: "ALL",
  actorId: "",
  ipAddress: "",
};

// ─── Main component ────────────────────────────────────────────────────────────

export function AuditLogViewer() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<AuditCategory>("user");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailLog, setDetailLog] = useState<AuditLogRow | null>(null);
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");

  const { toast } = useToast();

  // ── Helpers ────────────────────────────────────────────────────────────────

  const patchFilters = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setCurrentPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  }, []);

  const handleTabChange = useCallback((cat: string) => {
    setActiveCategory(cat as AuditCategory);
    setFilters(DEFAULT_FILTERS);
    setSearchTerm("");
    setCurrentPage(1);
    setSelectedIds([]);
  }, []);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Data fetching ──────────────────────────────────────────────────────────

  const queryString = buildFetchQueryString({
    page: currentPage,
    limit: ITEMS_PER_PAGE,
    search: debouncedSearch,
    period: filters.period,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    category: activeCategory,
    action: filters.action,
    actorId: filters.actorId,
    ipAddress: filters.ipAddress,
  });

  const { data, isLoading, isFetching } = useQuery<AuditLogsResponse>({
    queryKey: ["/api/admin/audit-logs", queryString],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/audit-logs?${queryString}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const logs = data?.logs ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  // ── Selection helpers ──────────────────────────────────────────────────────

  const allOnPageSelected =
    logs.length > 0 && logs.every((l) => selectedIds.includes(l.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const toAdd = logs.map((l) => l.id).filter((id) => !selectedIds.includes(id));
      setSelectedIds((prev) => [...prev, ...toAdd]);
    } else {
      const pageIds = new Set(logs.map((l) => l.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    }
  };

  const handleRowSelect = (id: string, checked: boolean) => {
    if (checked) setSelectedIds((prev) => [...prev, id]);
    else setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const qs = buildExportQueryString({
      format: exportFormat,
      category: activeCategory,
      search: debouncedSearch,
      period: filters.period,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      action: filters.action,
      actorId: filters.actorId,
      ipAddress: filters.ipAddress,
      selectedIds,
    });
    const filename = `thorx-audit-${activeCategory}-${Date.now()}.${exportFormat}`;
    downloadFromUrl(apiAbsolutePath(`/api/admin/audit-logs/export?${qs}`), filename);
    toast({
      title: "Export Queued",
      description:
        selectedIds.length > 0
          ? `Exporting ${selectedIds.length} selected entries as ${exportFormat.toUpperCase()}.`
          : `Exporting full filtered set as ${exportFormat.toUpperCase()}.`,
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-5xl font-black tracking-tighter uppercase text-[#111]">Audit Logs</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">
            Operational ledger — every action, every actor
          </p>
        </div>

        {/* Search + export controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search logs…"
              className="h-10 pl-11 pr-4 bg-white border-[1.5px] border-[#111] rounded-full focus:outline-none focus:ring-2 focus:ring-[#111]/20 transition-all text-xs font-bold w-56 text-[#111] placeholder:text-zinc-400"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Format toggle */}
          <div className="flex items-center border-[1.5px] border-[#111] rounded-full overflow-hidden">
            {(["csv", "pdf"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className={cn(
                  "h-10 px-4 font-black text-[10px] uppercase tracking-widest transition-all",
                  exportFormat === fmt
                    ? "bg-[#111] text-white"
                    : "bg-white text-[#111] hover:bg-black/5"
                )}
              >
                {fmt}
              </button>
            ))}
          </div>

          <Button
            className="h-10 bg-white border-[1.5px] border-[#111] text-[#111] font-black text-xs px-6 hover:bg-[#111] hover:text-white rounded-full transition-all uppercase shadow-sm flex items-center gap-2"
            onClick={handleExport}
          >
            <Download size={13} />
            Export
            {selectedIds.length > 0 && (
              <span className="ml-1 bg-[#111] text-white rounded-full w-4 h-4 text-[8px] font-black flex items-center justify-center group-hover:bg-white group-hover:text-[#111]">
                {selectedIds.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeCategory} onValueChange={handleTabChange}>
        <div className="flex flex-col gap-4">
          <TabsList className="bg-zinc-100 border-[1.5px] border-[#111]/10 rounded-full p-1 h-auto self-start">
            {TAB_CATEGORIES.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="rounded-full px-5 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-[#111] data-[state=active]:text-white transition-all"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_CATEGORIES.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-0 space-y-4">

              {/* Filter bar */}
              <AuditFilterBar
                category={activeCategory}
                filters={filters}
                onChange={patchFilters}
                onReset={resetFilters}
              />

              {/* Table container */}
              <div
                className={cn(
                  "bg-background border-[1.5px] border-[#111] rounded-[2rem] overflow-hidden shadow-sm transition-opacity duration-200",
                  isFetching && !isLoading && "opacity-70"
                )}
              >
                {/* Table header row */}
                <div className="bg-white px-8 py-5 flex items-center justify-between border-b-[1.5px] border-[#111]/10">
                  <TechnicalLabel
                    text={`${tab.label} Ledger`}
                    className="text-[#111] font-black uppercase"
                  />
                  <div className="flex items-center gap-3">
                    {isFetching && !isLoading && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 animate-pulse">
                        Refreshing…
                      </span>
                    )}
                    <div className="bg-black text-white px-4 py-1.5 rounded-lg font-black text-xs min-w-[40px] text-center shadow-lg">
                      {totalCount < 10 ? `0${totalCount}` : totalCount}
                    </div>
                  </div>
                </div>

                {/* Selection banner */}
                {selectedIds.length > 0 && (
                  <div className="bg-[#111] px-8 py-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      {selectedIds.length}{" "}
                      {selectedIds.length === 1 ? "entry" : "entries"} selected — ready for export
                    </div>
                    <button
                      onClick={() => setSelectedIds([])}
                      className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                    >
                      Clear selection
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/50 border-b-[1.5px] border-[#111]/10">
                        <th className="p-5 w-12 text-center align-middle">
                          <Checkbox
                            checked={allOnPageSelected}
                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            className="border-[#111] data-[state=checked]:bg-[#111] data-[state=checked]:text-white"
                          />
                        </th>
                        <th className="p-5 font-black text-[10px] tracking-widest text-[#111]/50 uppercase whitespace-nowrap">
                          Actor
                        </th>
                        <th className="p-5 font-black text-[10px] tracking-widest text-[#111]/50 uppercase whitespace-nowrap">
                          Event
                        </th>
                        <th className="p-5 font-black text-[10px] tracking-widest text-[#111]/50 uppercase whitespace-nowrap hidden lg:table-cell">
                          Target
                        </th>
                        <th className="p-5 font-black text-[10px] tracking-widest text-[#111]/50 uppercase whitespace-nowrap hidden xl:table-cell">
                          Context
                        </th>
                        <th className="p-5 font-black text-[10px] tracking-widest text-[#111]/50 uppercase whitespace-nowrap">
                          Time
                        </th>
                        <th className="p-5 w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y-[1.5px] divide-[#111]/5">
                      <AnimatePresence mode="popLayout">
                        {isLoading ? (
                          Array(ITEMS_PER_PAGE)
                            .fill(0)
                            .map((_, i) => (
                              <tr key={i} className="border-b-[1.5px] border-[#111]/5">
                                <td className="p-5">
                                  <Skeleton className="h-4 w-4 rounded" />
                                </td>
                                <td className="p-5">
                                  <Skeleton className="h-8 w-36" />
                                </td>
                                <td className="p-5">
                                  <Skeleton className="h-8 w-52" />
                                </td>
                                <td className="p-5 hidden lg:table-cell">
                                  <Skeleton className="h-6 w-28" />
                                </td>
                                <td className="p-5 hidden xl:table-cell">
                                  <Skeleton className="h-6 w-32" />
                                </td>
                                <td className="p-5">
                                  <Skeleton className="h-6 w-24" />
                                </td>
                                <td className="p-5">
                                  <Skeleton className="h-6 w-6 rounded-full" />
                                </td>
                              </tr>
                            ))
                        ) : logs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-20 text-center">
                              <Activity className="w-10 h-10 mx-auto mb-4 text-zinc-200" />
                              <TechnicalLabel
                                text="Silence In The Ledger"
                                className="text-zinc-400 font-black uppercase tracking-widest"
                              />
                              <p className="text-xs font-bold text-zinc-400 mt-2">
                                No records match the current filters.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          logs.map((log, idx) => (
                            <AuditLogRow
                              key={log.id}
                              log={log}
                              idx={idx}
                              selected={selectedIds.includes(log.id)}
                              onSelect={(checked) => handleRowSelect(log.id, checked)}
                              onDetail={() => setDetailLog(log)}
                            />
                          ))
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-6 border-t-[1.5px] border-[#111]/10 px-6 pb-6 bg-white">
                    <div className="text-[10px] font-black tracking-widest uppercase text-zinc-400">
                      Trace{" "}
                      <span className="text-[#111]">
                        {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                      </span>{" "}
                      to{" "}
                      <span className="text-[#111]">
                        {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}
                      </span>{" "}
                      of <span className="text-[#111]">{totalCount}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        disabled={currentPage === 1}
                        onClick={() => handlePageChange(currentPage - 1)}
                        className="h-10 px-5 border-[1.5px] border-[#111] rounded-full font-black text-xs uppercase hover:bg-[#111] hover:text-white transition-all disabled:opacity-30"
                      >
                        Retrace
                      </Button>
                      {/* Dot pagination — cap at 9 dots. Beyond 9 pages, each dot maps to a
                          sampled page rather than every page, so the current page rarely
                          lands exactly on a sampled value. Highlight the closest dot instead
                          of requiring an exact match, so a dot is always shown as active. */}
                      <div className="flex items-center gap-1.5 px-1">
                        {(() => {
                          const dotCount = Math.min(totalPages, 9);
                          const dotPages = Array.from({ length: dotCount }, (_, i) =>
                            totalPages <= 9 ? i + 1 : Math.round((i / 8) * (totalPages - 1)) + 1
                          );
                          const closestIdx = dotPages.reduce(
                            (best, p, i) => (Math.abs(p - currentPage) < Math.abs(dotPages[best] - currentPage) ? i : best),
                            0
                          );
                          return dotPages.map((page, i) => (
                            <button
                              key={i}
                              onClick={() => handlePageChange(page)}
                              className={cn(
                                "h-1.5 rounded-full transition-all",
                                i === closestIdx ? "w-6 bg-[#111]" : "w-1.5 bg-[#111]/20 hover:bg-[#111]/40"
                              )}
                              title={`Page ${page}`}
                            />
                          ));
                        })()}
                      </div>
                      <Button
                        variant="ghost"
                        disabled={currentPage === totalPages}
                        onClick={() => handlePageChange(currentPage + 1)}
                        className="h-10 px-5 border-[1.5px] border-[#111] rounded-full font-black text-xs uppercase hover:bg-[#111] hover:text-white transition-all disabled:opacity-30"
                      >
                        Forward
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </div>
      </Tabs>

      {/* Detail drawer */}
      <AuditDetailDrawer log={detailLog} onClose={() => setDetailLog(null)} />
    </div>
  );
}

// ─── Row sub-component ─────────────────────────────────────────────────────────

interface AuditLogRowProps {
  log: AuditLogRow;
  idx: number;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onDetail: () => void;
}

function AuditLogRow({ log, idx, selected, onSelect, onDetail }: AuditLogRowProps) {
  const actor = actorName(log);
  const device = formatDevice(log);
  const location = formatLocation(log);
  const ip = formatIp(log.ipAddress);

  return (
    <motion.tr
      key={log.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: idx * 0.025, type: "spring", stiffness: 320, damping: 28 }}
      className={cn(
        "hover:bg-black/[0.03] transition-colors group cursor-default",
        selected && "bg-zinc-50"
      )}
    >
      {/* Checkbox */}
      <td className="p-5 text-center align-middle">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(!!checked)}
          className="border-[#111] data-[state=checked]:bg-[#111] data-[state=checked]:text-white"
        />
      </td>

      {/* Actor */}
      <td className="p-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-white border-[1.5px] border-[#111]/20 flex items-center justify-center shrink-0">
            <Shield size={13} className="text-[#111]" />
          </div>
          <div className="min-w-0">
            <div
              className="text-[11px] font-black uppercase text-[#111] tracking-tight overflow-hidden text-ellipsis whitespace-nowrap max-w-[130px]"
              title={actor}
            >
              {actor}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Terminal size={9} className="text-zinc-400 shrink-0" />
              <span className="text-[9px] font-mono font-bold text-zinc-400">{ip}</span>
              {log.actorRole && (
                <span className="ml-1 text-[8px] font-black uppercase tracking-widest text-zinc-300">
                  · {log.actorRole}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Event: description (primary) + action code (secondary badge) */}
      <td className="p-5 max-w-[260px]">
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[#111] leading-snug line-clamp-2">
            {log.description}
          </p>
          <span className="inline-flex px-2 py-0.5 rounded-sm border border-[#111]/20 bg-zinc-100 text-[8px] font-black uppercase tracking-widest text-zinc-500">
            {log.action}
          </span>
        </div>
      </td>

      {/* Target */}
      <td className="p-5 hidden lg:table-cell">
        <div className="space-y-0.5">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#111]">
            {log.targetType || "—"}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[9px] font-mono font-bold text-zinc-400 hover:text-[#111] transition-colors bg-[#111]/5 px-1.5 py-0.5 rounded cursor-help">
                  {log.targetId ? `${log.targetId.substring(0, 8)}…` : "—"}
                </span>
              </TooltipTrigger>
              <TooltipContent className="bg-[#111] text-white border-[1.5px] border-[#111] font-mono text-[10px]">
                {log.targetId || "—"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </td>

      {/* Context: device + location */}
      <td className="p-5 hidden xl:table-cell">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-500">
            <Monitor size={10} className="text-zinc-400 shrink-0" />
            <span className="truncate max-w-[160px]" title={device}>{device}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-400">
            <MapPin size={10} className="text-zinc-400 shrink-0" />
            <span>{location}</span>
          </div>
        </div>
      </td>

      {/* Time */}
      <td className="p-5 whitespace-nowrap">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 cursor-help">
                {relativeTime(log.createdAt)}
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-[#111] text-white border-[1.5px] border-[#111] font-mono text-[10px]">
              {formatTimestamp(log.createdAt)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>

      {/* Detail button */}
      <td className="p-5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-black hover:text-white transition-all border-[1.5px] border-transparent hover:border-[#111] opacity-0 group-hover:opacity-100"
          onClick={onDetail}
          title="View details"
        >
          <ChevronRight size={14} />
        </Button>
      </td>
    </motion.tr>
  );
}
