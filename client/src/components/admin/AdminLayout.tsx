import React from "react";
import { AdminNavigation } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { MobileNavBar } from "@/components/ui/mobile-nav-bar";
import { Users, LayoutDashboard, CreditCard, Mail, FileText, Key, Home, LogOut, Shield, Settings, BarChart2, Ticket } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import ThorxLoadingScreen from "@/components/ui/thorx-loading-screen";

interface AdminLayoutProps {
  children: React.ReactNode;
  activeSection: string;
  onSectionChange: (section: string) => void;
  title: string;
}

export function AdminLayout({ children, activeSection, onSectionChange, title }: AdminLayoutProps) {
  const { user, logout, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/auth");
  };

  if (isLoading) {
    return <ThorxLoadingScreen />;
  }

  const adminNavItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Stats" },
    { id: "leaderboard", icon: Shield, label: "Leaderboard" },
    { id: "payouts", icon: CreditCard, label: "Payouts" },
    { id: "users", icon: Users, label: "Users" },
    { id: "inbox", icon: Mail, label: "Inbox" },
    { id: "audit", icon: FileText, label: "Audit" },
    { id: "beta-control", icon: Ticket, label: "Beta Control" },
    ...(user?.role === "founder" || user?.role === "admin" ? [{ id: "finance", icon: BarChart2, label: "Finance" }] : []),
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  // Team-role members only see what they've been granted (mirrors AdminSidebar's
  // desktop filtering). Without this, the mobile nav offered tabs a team member
  // had no permission for — TeamPortal's content gate still blocked the page
  // itself, but the dead nav entry was a confusing, ungranted-looking dead end.
  const visibleNavItems = adminNavItems.filter((item) => {
    if (!user) return false;
    if (user.role === "founder" || user.role === "admin") return true;
    if (user.role === "team") {
      if (item.id === "dashboard") return true;
      return (user.permissions || []).includes(item.id);
    }
    return false;
  });

  return (
    <div className="admin-portal flex flex-col min-h-screen bg-background font-sans text-foreground selection:bg-primary selection:text-white relative">
      
      {/* Industrial Grid Overlay */}

      {/* Main App Canvas */}
      <div className="flex-1 flex flex-col w-full relative z-10 overflow-x-hidden">

        {/* Desktop Top Navigation */}
        <div className="hidden lg:block mb-8 md:mb-12">
          <AdminNavigation
            activeSection={activeSection}
            onSectionChange={onSectionChange}
            onLogout={handleLogout}
          />
        </div>

        <AdminHeader 
          userName={`${user?.firstName} ${user?.lastName}`}
          role={user?.role || 'admin'}
        />

        <main className="flex-1 overflow-y-auto relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="w-full relative max-w-[1600px] mx-auto px-4 md:px-12 py-8 md:pt-4 md:pb-12"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile Navigation - matching User Portal */}
        <div className="lg:hidden">
          <MobileNavBar
            sections={visibleNavItems.map(item => ({
              id: item.id,
              icon: item.icon,
              name: item.label
            }))}
            currentSection={visibleNavItems.findIndex(i => i.id === activeSection)}
            onSectionChange={(index) => onSectionChange(visibleNavItems[index].id)}
          />
        </div>
      </div>
    </div>
  );
}
