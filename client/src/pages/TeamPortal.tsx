import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { PayoutControl } from "@/components/admin/PayoutControl";
import { UserManager } from "@/components/admin/UserManager";
import { AdminInbox } from "@/components/admin/AdminInbox";
import { AuditLogViewer } from "@/components/admin/AuditLogViewer";
import { TeamKeysManager } from "@/components/admin/TeamKeysManager";
import { TaskManager } from "@/components/admin/TaskManager";
import { SystemSettingsManager } from "@/components/admin/SystemSettingsManager";
import { LeaderboardInsights } from "@/components/admin/LeaderboardInsights";
import { ReconciliationPanel } from "@/components/admin/ReconciliationPanel";
import { GuildManager } from "@/components/admin/GuildManager";
import { GuildWarsAdmin } from "@/components/admin/GuildWarsAdmin";
import { LiveActivityFeed } from "@/components/admin/LiveActivityFeed";
import { ThorxCardSandbox } from "@/components/admin/ThorxCardSandbox";
import { LedgerValidator } from "@/components/admin/LedgerValidator";
import { RanksCustomizer } from "@/components/admin/RanksCustomizer";
import { ReferralAnalytics } from "@/components/admin/ReferralAnalytics";
import { Shield, Lock } from "lucide-react";

export default function TeamPortal() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [crmSearchTerm, setCrmSearchTerm] = useState("");
  const [, setLocation] = useLocation();

  const handleViewUserInCRM = (email: string) => {
    setCrmSearchTerm(email);
    setActiveSection("users");
  };

  // Access Control: Only allow 'admin' or 'founder' roles
  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/auth");
    } else if (!authLoading && user && user.role !== 'admin' && user.role !== 'founder' && user.role !== 'team') {
       // Note: 'team' role is also allowed but might have less perms (handled in components)
       setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading) {
    // Audit finding 3-G: replaced text spinner with skeleton that matches the
    // AdminLayout content shape — prevents jarring layout shift on load.
    return (
      <div className="flex min-h-screen bg-zinc-950">
        {/* Sidebar skeleton */}
        <div className="hidden lg:block w-64 shrink-0 border-r border-zinc-800 p-6 space-y-4">
          <div className="h-8 w-32 bg-zinc-800 rounded-lg animate-pulse" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 bg-zinc-800 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 p-8 space-y-6">
          <div className="h-10 w-56 bg-zinc-800 rounded-lg animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-zinc-800 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-zinc-800 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  // Double check role to prevent flash of content
  if (user && user.role === 'user') {
    return null;
  }

  const renderContent = () => {
    // Check permissions for 'team' role
    if (user?.role === 'team') {
      if (activeSection === 'dashboard') return <AdminDashboard />;
      
      const perms = user.permissions || [];
      if (!perms.includes(activeSection)) {
        return (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center bg-black/5 rounded-3xl border-4 border-dashed border-[#111]/10">
            <div className="w-20 h-20 bg-black border-4 border-primary rounded-full flex items-center justify-center mb-6 animate-pulse">
              <Lock className="text-primary w-10 h-10" />
            </div>
            <h2 className="text-xl sm:text-3xl font-black uppercase text-[#111] mb-4 tracking-tighter">Secure Matrix Blocked</h2>
            <p className="max-w-md text-sm font-bold text-zinc-500 uppercase tracking-widest leading-relaxed mb-8">
              Structural integrity check failed. Your current administrative node does not possess the cryptographic clearance required to synchronize with the <span className="text-[#111] font-black">{activeSection.toUpperCase()}</span> protocol.
            </p>
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 border-2 border-[#111] rounded-xl font-black text-[10px] tracking-widest uppercase bg-white">
                Error Code: E-MATRIX-UNAUTH
              </div>
              <div className="px-4 py-2 bg-[#111] text-primary rounded-xl font-black text-[10px] tracking-widest uppercase">
                Contact Founder Nodes
              </div>
            </div>
          </div>
        );
      }
    }

    switch (activeSection) {
      case "dashboard":
        return <AdminDashboard />;
      case "leaderboard":
        return <LeaderboardInsights onViewUserInCRM={handleViewUserInCRM} />;
      case "tasks":
        return <TaskManager />;
      case "payouts":
        return <PayoutControl />;
      case "users":
        return <UserManager initialSearch={crmSearchTerm} />;
      case "inbox":
        return <AdminInbox />;
      case "audit":
        return <AuditLogViewer />;
      case "team":
        return <TeamKeysManager />;
      case "guilds":
        return <GuildManager />;
      case "guild-wars":
        return <GuildWarsAdmin />;
      case "settings":
        return <SystemSettingsManager />;
      case "finance":
        return <ReconciliationPanel />;
      case "live-feed":
        return <LiveActivityFeed />;
      case "card-sandbox":
        return <ThorxCardSandbox />;
      case "ledger":
        return <LedgerValidator />;
      case "ranks":
        return <RanksCustomizer />;
      case "referrals":
        return <ReferralAnalytics />;
      default:
        return <AdminDashboard />;
    }
  };

  const getTitle = () => {
    switch (activeSection) {
      case "dashboard": return "Command Center";
      case "leaderboard": return "Leaderboard & Risk Insights";
      case "tasks": return "Task & Ad Management";
      case "payouts": return "Payout Operations";
      case "users": return "User Registry";
      case "inbox": return "Communications";
      case "audit": return "Security Audit";
      case "team": return "Team Access";
      case "guilds":       return "Guild Manager";
      case "guild-wars":   return "Guild Wars";
      case "live-feed":    return "Live Activity Feed";
      case "card-sandbox": return "Thorx Card Sandbox";
      case "ledger":       return "Ledger Validator";
      case "ranks":        return "Ranks & Engine Config";
      case "referrals":    return "Referral Analytics";
      case "settings":     return "Financial Control Center";
      case "finance":      return "Financial Reconciliation";
      default: return "Command Center";
    }
  };

  return (
    <AdminLayout
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      title={getTitle()}
    >
      {renderContent()}
    </AdminLayout>
  );
}