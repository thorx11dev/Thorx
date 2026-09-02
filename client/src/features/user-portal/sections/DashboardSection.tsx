import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DashboardCards } from "@/components/DashboardCards";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import TechnicalLabel from "@/components/ui/technical-label";
import { RefreshButton, useRefreshAction } from "@/components/ui/refresh-button";
import { resolveAvatarUrl } from "@/lib/rankAvatars";
import { Crown, Trophy, Medal, Shield, User } from "lucide-react";
import {
  AreaChart, Area, PieChart as RechartsPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import type { User as AuthUser } from "@/hooks/useAuth";

interface DashboardSectionProps {
  displayUser: AuthUser;
  isMobile: boolean;
  earningsChartData: Array<{ date: string; earnings: number; ads: number; tasks: number }>;
  earningTypesData: Array<{ name: string; value: number; color: string }>;
  hasEarningsBreakdownData: boolean;
  onRefresh?: () => void;
}

export function DashboardSection(props: DashboardSectionProps) {
  const { displayUser, isMobile, earningsChartData, earningTypesData, hasEarningsBreakdownData, onRefresh } = props;
  const { refreshing: isRefreshing, refresh: handleRefresh } = useRefreshAction(onRefresh ?? (() => {}));
    const getRank = (rankTier?: string) => {
      const title = (rankTier || "E-Rank").toUpperCase();
      // All ranks use the same Silver (Zinc-500) frame/badge style — the avatar
      // frame color is standardized across tiers, not rank-branded.
      const silver = { color: "text-zinc-500", border: "border-zinc-500", bg: "bg-zinc-500" };
      if (title === "S-RANK") return { title: "S-RANK", icon: Crown, ...silver };
      if (title === "A-RANK") return { title: "A-RANK", icon: Trophy, ...silver };
      if (title === "B-RANK") return { title: "B-RANK", icon: Trophy, ...silver };
      if (title === "C-RANK") return { title: "C-RANK", icon: Medal, ...silver };
      if (title === "D-RANK") return { title: "D-RANK", icon: Shield, ...silver };
      return { title: "E-RANK", icon: User, ...silver };
    };

    const rank = getRank(displayUser?.userRankTier);

    // Improved Avatar Logic:
    // Resolve avatar using rank-aware system
    const userAvatar = displayUser?.profilePicture
      ? displayUser.profilePicture
      : resolveAvatarUrl(displayUser?.avatar, displayUser?.rank);

    return (
      <motion.div
        initial="initial"
        animate="animate"
        variants={{
          animate: {
            transition: {
              staggerChildren: 0.05
            }
          }
        }}
        className="max-w-[1600px] mx-auto px-4 md:px-12 py-8 md:pt-4 md:pb-12 relative z-10 w-full"
      >
        {/* User Identity Hero Section */}
        <motion.div
          variants={{
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 }
          }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white border-2 md:border-[3px] border-black rounded-2xl p-6 md:p-12 mb-12 relative overflow-hidden group transition-all duration-500 hover:shadow-[6px_6px_0px_0px_rgba(20, 20, 19,1)]"
        >
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10">
            {/* Avatar */}
            <div className="relative">
              <div className={cn(
                "w-32 h-32 md:w-40 md:h-40 rounded-2xl border-2 border-black bg-black overflow-hidden",
              )}>
                <img
                  src={userAvatar}
                  alt="User Avatar"
                  className="w-full h-full object-cover will-change-transform"
                />
              </div>
              <div className={cn(
                "absolute -bottom-2 -right-2 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black bg-white rounded-md border-2 border-black",
              )}>
                {rank.title}
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1 text-center md:text-left pt-2">


              <h1 className="text-4xl md:text-6xl font-black text-foreground mb-2 tracking-tighter uppercase leading-none">
                {displayUser?.name || `${displayUser?.firstName} ${displayUser?.lastName}`}
              </h1>

            </div>
          </div>
        </motion.div>

        {/* THORX v3 (spec F.2): role-based dashboard card variants */}
        <DashboardCards />

        {/* Charts Section */}
        <div className="grid lg:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
          {/* Weekly Earnings Chart */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 }
            }}
            whileHover={{ scale: 1.01 }}
            className="group bg-white border-2 border-black rounded-2xl transition-all duration-300 hover:shadow-[6px_6px_0px_0px_rgba(20, 20, 19,1)] overflow-hidden"
          >
            <CardHeader className="border-b-2 border-black p-3 md:p-6 bg-white">
              <CardTitle className="flex items-center justify-between">
                <TechnicalLabel text="WEEKLY EARNINGS" className="text-foreground group-hover:text-primary transition-colors text-xs md:text-sm" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-4">
              <ResponsiveContainer width="100%" height={isMobile ? 200 : 280} minHeight={isMobile ? 180 : 250}>
                <AreaChart data={earningsChartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D97757" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#D97757" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--muted-foreground)" strokeOpacity={0.2} />
                  <XAxis
                    dataKey="date"
                    stroke="var(--muted-foreground)"
                    fontSize={isMobile ? 8 : 10}
                    fontFamily="var(--font-sans)"
                    tickLine={false}
                    axisLine={false}
                    hide={isMobile}
                    tick={{ fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={isMobile ? 8 : 10}
                    fontFamily="var(--font-sans)"
                    tickFormatter={(value) => isMobile ? `${value}` : `${value} pts`}
                    tickLine={false}
                    axisLine={false}
                    hide={isMobile}
                    tick={{ fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} pts`, 'TX-Points']}
                    labelFormatter={(label) => `Day: ${label}`}
                    contentStyle={{
                      backgroundColor: 'var(--background)',
                      border: '2px solid #D97757',
                      borderRadius: '4px',
                      color: '#D97757',
                      fontFamily: 'var(--font-sans)',
                      fontSize: isMobile ? '10px' : '12px',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 12px #D9775740'
                    }}
                    labelStyle={{ color: '#D97757' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="earnings"
                    stroke="#D97757"
                    strokeWidth={isMobile ? 2 : 3}
                    fill="url(#earningsGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </motion.div>

          {/* Earnings Breakdown */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 }
            }}
            whileHover={{ scale: 1.01 }}
            className="group bg-white border-2 border-black rounded-2xl transition-all duration-300 hover:shadow-[6px_6px_0px_0px_rgba(20, 20, 19,1)] overflow-hidden"
          >
            <CardHeader className="border-b-2 border-black p-3 md:p-6 bg-white">
              <CardTitle className="flex items-center justify-between">
                <TechnicalLabel text="EARNINGS BREAKDOWN" className="text-foreground group-hover:text-primary transition-colors text-xs md:text-sm" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-4">
              <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
                {/* Pie Chart */}
                <div className="flex-1 w-full flex justify-center">
                  <ResponsiveContainer width="100%" height={isMobile ? 180 : 280} minHeight={isMobile ? 160 : 250}>
                    <RechartsPieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <Pie
                        data={hasEarningsBreakdownData ? earningTypesData : [{ name: 'No earnings yet', value: 1, color: '#E8E5D8' }]}
                        cx="50%"
                        cy="50%"
                        outerRadius={isMobile ? 60 : 90}
                        innerRadius={0}
                        dataKey="value"
                        stroke="var(--card)"
                        strokeWidth={2}
                        label={false}
                      >
                        {(hasEarningsBreakdownData ? earningTypesData : [{ name: 'No earnings yet', value: 1, color: '#E8E5D8' }]).map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="var(--card)"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      {hasEarningsBreakdownData && (
                        <Tooltip
                          formatter={(value: number, _: string, props: any) => [`${value}%`, props?.payload?.name || _]}
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            border: '2px solid var(--primary)',
                            borderRadius: '8px',
                            padding: isMobile ? '8px' : '12px',
                            fontFamily: 'var(--font-sans)',
                            fontSize: isMobile ? '10px' : '13px',
                            fontWeight: '900',
                            boxShadow: '0 4px 12px rgba(20, 20, 19,0.25)'
                          }}
                          labelStyle={{
                            color: 'var(--foreground)',
                            fontWeight: '900',
                            marginBottom: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            fontSize: isMobile ? '9px' : '11px'
                          }}
                          itemStyle={{
                            color: 'var(--primary)',
                            fontWeight: '900',
                            fontSize: isMobile ? '9px' : '12px'
                          }}
                        />
                      )}
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="w-full md:w-auto grid grid-cols-2 md:flex md:flex-col gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 bg-background/60 border border-black/15 rounded-lg hover:bg-primary/5 transition-colors">
                  {earningTypesData.map((entry, index) => (
                    <div key={`legend-${index}`} className="flex items-center gap-1.5 md:gap-2">
                      <div
                        className="w-3 h-3 md:w-4 md:h-4 rounded-sm border border-black/20 flex-shrink-0"
                        style={{ backgroundColor: entry.color }}
                      />
                      <div className="text-xs font-black text-foreground whitespace-nowrap">
                        {entry.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </motion.div>
        </div>
      </motion.div>
    );
  }
