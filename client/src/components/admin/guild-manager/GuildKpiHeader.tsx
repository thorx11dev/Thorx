import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Users2, ShieldCheck, Snowflake, Trash2, Wallet, TrendingUp, ClipboardList, type LucideIcon } from "lucide-react";
import { formatPkr } from "./guild-format";

interface GuildStats {
  totalGuilds: number;
  active: number;
  frozen: number;
  disbanded: number;
  totalWeeklyBonusPoolPkr: string;
  avgGps: number;
  pendingCreationRequests: number;
}

const CARDS: Array<{ key: keyof GuildStats; label: string; icon: LucideIcon; format?: (s: GuildStats) => string }> = [
  { key: "totalGuilds", label: "Total Guilds", icon: Users2 },
  { key: "active", label: "Active", icon: ShieldCheck },
  { key: "frozen", label: "Frozen", icon: Snowflake },
  { key: "disbanded", label: "Disbanded", icon: Trash2 },
  { key: "totalWeeklyBonusPoolPkr", label: "Weekly Bonus Pool", icon: Wallet, format: (s) => `Rs ${formatPkr(s.totalWeeklyBonusPoolPkr)}` },
  { key: "avgGps", label: "Avg GPS", icon: TrendingUp },
  { key: "pendingCreationRequests", label: "Pending Requests", icon: ClipboardList },
];

// Ecosystem-wide KPI strip for the admin Guild Manager — aggregated server-side
// in getGuildEcosystemStats() so the numbers stay correct regardless of the
// guild list's current page/search/status filter.
export function GuildKpiHeader() {
  const { data, isLoading } = useQuery<GuildStats>({
    queryKey: ["/api/admin/guilds/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/guilds/stats")).json(),
    refetchInterval: 30000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {CARDS.map(({ key, label, icon: Icon, format }) => (
        <div key={key} className="rounded-xl border-[1.5px] border-[#111] bg-white p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Icon size={12} />
            <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
          </div>
          <div className="text-xl font-black text-[#111] tabular-nums truncate">
            {format ? format(data) : data[key]}
          </div>
        </div>
      ))}
    </div>
  );
}
