import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { retryLazy } from "@/lib/retryLazy";
const PayoutSection = retryLazy(() =>
  import("@/features/user-portal/sections/PayoutSection").then((m) => ({ default: m.PayoutSection }))
);
const ReferralsSection = retryLazy(() =>
  import("@/features/user-portal/sections/ReferralsSection").then((m) => ({ default: m.ReferralsSection }))
);
const WorkSection = retryLazy(() =>
  import("@/features/user-portal/sections/WorkSection").then((m) => ({ default: m.WorkSection }))
);
const DashboardSection = retryLazy(() =>
  import("@/features/user-portal/sections/DashboardSection").then((m) => ({ default: m.DashboardSection }))
);
const HelpSection = retryLazy(() =>
import("@/features/user-portal/sections/HelpSection").then((m) => ({ default: m.HelpSection }))
);
const LeaderboardSection = retryLazy(() =>
import("@/features/user-portal/sections/LeaderboardSection").then((m) => ({ default: m.default }))
);
const GuildSection = retryLazy(() =>
  import("@/features/user-portal/sections/GuildSection").then((m) => ({ default: m.GuildSection }))
);

const ShareModal = retryLazy(() =>
  import("@/features/user-portal/ShareModal").then((m) => ({ default: m.ShareModal }))
);
import Decimal from "decimal.js";
import { z } from "zod";
import BetaTrustLayer from "@/components/beta/BetaTrustLayer";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuth, type User as AuthUser } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient, getCsrfToken } from "@/lib/queryClient";
import { useDragToPan } from "@/hooks/useDragToPan";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
const ProfileModal = retryLazy(() =>
  import("@/components/ui/profile-modal").then((m) => ({ default: m.ProfileModal }))
);
import { MobileNavBar } from "@/components/ui/mobile-nav-bar";
import { DesktopNavTabs } from "@/components/ui/desktop-nav-tabs";
const AdWebPanel = retryLazy(() =>
  import("@/components/ui/ad-web-panel").then((m) => ({ default: m.AdWebPanel }))
);
const NotificationModal = retryLazy(() =>
  import("@/components/ui/notification-modal").then((m) => ({ default: m.NotificationModal }))
);
import { apiAbsolutePath } from "@/lib/apiOrigin";
import type { ScratchCardBreakdown } from "@/components/guild/ScratchCardModal";
const ScratchCardModal = retryLazy(() =>
  import("@/components/guild/ScratchCardModal").then((m) => ({ default: m.ScratchCardModal }))
);
import { DEV_UNLOCK_PAYOUT } from "@/lib/previewAccess";

// ─── Module prefetch (dev-proxy resilience) ──────────────────────────────────
// The dev proxy occasionally drops a dynamically imported module request
// ("Failed to fetch dynamically imported module: …"). A browser's module map
// caches every module once loaded, so pre-warming all lazy chunks right after
// the portal boots means React.lazy later resolves from memory — zero network
// fetches when a section or modal is opened. Proxy hiccups then can't break
// navigation. Best-effort: prefetch failures are ignored; retryLazy still
// guards the actual lazy() call if it ever genuinely needs the network.
const PORTAL_LAZY_MODULES = [
  () => import("@/features/user-portal/sections/PayoutSection"),
  () => import("@/features/user-portal/sections/ReferralsSection"),
  () => import("@/features/user-portal/sections/WorkSection"),
  () => import("@/features/user-portal/sections/DashboardSection"),
  () => import("@/features/user-portal/sections/HelpSection"),
  () => import("@/features/user-portal/sections/GuildSection"),
  () => import("@/features/user-portal/ShareModal"),
  () => import("@/components/ui/profile-modal"),
  () => import("@/components/ui/ad-web-panel"),
  () => import("@/components/ui/notification-modal"),
  () => import("@/components/guild/ScratchCardModal"),
];

function prefetchPortalModules() {
  // Staggered so the proxy never sees a burst of simultaneous requests.
  PORTAL_LAZY_MODULES.forEach((load, i) => {
    window.setTimeout(() => {
      load().catch(() => {
        /* best-effort — retryLazy covers real usage */
      });
    }, i * 120);
  });
}

// Fire as soon as the browser is idle (or ~400ms as fallback) so the warm-up
// never competes with the initial render.
if (typeof window !== "undefined") {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(prefetchPortalModules, { timeout: 2500 });
  } else {
    window.setTimeout(prefetchPortalModules, 400);
  }
}

// Dev-mode mock preview used when DEV_UNLOCK_PAYOUT is true and the real
// server preview is unavailable (e.g. account has zero TX-Points balance).
const DEV_MOCK_PREVIEW = {
  exactPkr: 500.00,
  platformFee: 75.00,
  feePercent: 15,
  referralCommission: 0,
  referrerName: null,
  userNetPkr: 425.00,
  sRankFastTrack: false,
};
import { formatPoints } from "@/lib/formatPoints";
import { useLocation } from "wouter";
import { LogOut, ArrowRight, ArrowLeft, PieChart, Copy, Download, Home, Briefcase, User, Shield, Settings, Network, Landmark, Headphones, Bell, Trophy } from "lucide-react";


const GUEST_USER: AuthUser = {
  id: "guest",
  firstName: "Guest",
  lastName: "User",
  name: "Guest User",
  avatar: "default",
  email: "guest@thorx.com",
  identity: "GUEST_USER",
  phone: "",
  referralCode: "GUEST-CODE",
  totalEarnings: "0.00",
  availableBalance: "0.00",
  isActive: true,
  createdAt: "1970-01-01T00:00:00.000Z",
  rank: "Nawa Aya",
  userRankTier: "E-Rank",
};

// Interactive Divider Component
;

// Share Modal Component - Loading Screen Design Standard



// Animated Placeholder Component for Contact Form


// Interfaces
interface Earning {
  id: string;
  type: string;
  amount: string;
  description: string;
  status: string;
  createdAt: string;
}

interface ReferralUser {
  id: string;
  referrerId: string;
  referredId: string;
  status: string;
  totalEarned: string;
  createdAt: string;
  referred: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    createdAt: string;
  };
}

interface AdItem {
  id: string;
  title: string;
  type: "video" | "banner" | "interactive";
  duration: number;
  reward: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  thumbnail?: string;
}

// Sample data
const availableAds: AdItem[] = [
  {
    id: "ad_001",
    title: "CRYPTO TRADING PLATFORM",
    type: "video",
    duration: 30,
    reward: "2.50",
    description: "Watch this crypto trading platform advertisement",
    difficulty: "easy",
    category: "Finance",
  },
  {
    id: "ad_002",
    title: "MOBILE GAME DOWNLOAD",
    type: "video",
    duration: 15,
    reward: "1.25",
    description: "Download and try this exciting mobile game",
    difficulty: "easy",
    category: "Gaming",
  },
  {
    id: "ad_003",
    title: "E-COMMERCE DEAL",
    type: "interactive",
    duration: 45,
    reward: "3.75",
    description: "Interactive advertisement for latest e-commerce deals",
    difficulty: "medium",
    category: "Shopping",
  },
  {
    id: "ad_004",
    title: "FITNESS APP PROMOTION",
    type: "video",
    duration: 20,
    reward: "1.75",
    description: "Learn about this revolutionary fitness application",
    difficulty: "easy",
    category: "Health",
  },
];

const sections = [
  { id: "dashboard", name: "Dashboard", icon: Home },
  { id: "work", name: "Work", icon: Briefcase },
  { id: "referrals", name: "Referrals", icon: Network },
  { id: "guild", name: "Engine C", icon: Shield },
  { id: "payout", name: "Payout", icon: Landmark },
  { id: "help", name: "Help", icon: Headphones },
  { id: "ranks", name: "Ranks", icon: Trophy },
];

export default function UserPortal() {
  const { user, logout, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReferralLink, setShowReferralLink] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const getDefaultReferralZoom = () =>
    typeof window !== "undefined" && window.innerWidth < 768 ? 0.8 : 1;
  const [referralZoom, setReferralZoom] = useState(getDefaultReferralZoom);
  const resetZoom = () => setReferralZoom(getDefaultReferralZoom());
  const { containerRef: referralPanRef, isDragging: isReferralDragging, onMouseDown: onReferralMouseDown } = useDragToPan<HTMLDivElement>();

  // Current section state
  const [currentSection, setCurrentSection] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Work section states
  const [selectedAd, setSelectedAd] = useState<AdItem | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [watchProgress, setWatchProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Enhanced work section states
  const [activeWorkTab, setActiveWorkTab] = useState<string>("player1");
  const [activeWorkEngine, setActiveWorkEngine] = useState<1 | 2>(1);
  const [completedVideos, setCompletedVideos] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);

  // Mobile detection
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Enhanced work section configuration complete

  const [completedAds, setCompletedAds] = useState<Set<string>>(new Set());

  // Web Panel State
  const [isWebPanelOpen, setIsWebPanelOpen] = useState(false);
  const [webPanelData, setWebPanelData] = useState({
    productUrl: "",
    adId: "",
    reward: "0.00"
  });

  // Phase 2 (real rewarded ads): a server-issued session binds this ad watch
  // to a pending ad_view row, so completion cannot mint arbitrary rewards.
  // The WaterfallAdPlayer inside the panel renders the REAL network ad; the
  // session token is what /api/ad-view verifies before crediting.
  const [adSession, setAdSession] = useState<{ token: string; reward: string; duration: number } | null>(null);

  useEffect(() => {
    if (!isWebPanelOpen || !user) {
      setAdSession(null);
      return;
    }
    let cancelled = false;
    setAdSession(null);
    apiRequest("POST", "/api/ads/session", { adId: webPanelData.adId })
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (data?.token) {
          setAdSession({ token: data.token, reward: data.reward, duration: data.duration });
        }
      })
      .catch(() => { /* fall back to the legacy adId path */ });
    return () => { cancelled = true; };
  }, [isWebPanelOpen, webPanelData.adId, user]);

  const handleWebPanelComplete = () => {
    // Finalize the ad completion
    setCompletedVideos(prev => new Set(Array.from(prev).concat(webPanelData.adId)));

    if (adSession?.token) {
      // Phase 2: complete the server-issued session (one-time, idempotent).
      recordAdViewMutation.mutate({
        sessionToken: adSession.token,
        adId: webPanelData.adId,
        adType: 'video_panel',
        duration: adSession.duration,
        completed: true,
        earnedAmount: adSession.reward
      });
    } else {
      // Legacy fallback when the session endpoint is unavailable.
      recordAdViewMutation.mutate({
        adId: webPanelData.adId,
        adType: 'video_panel',
        duration: 30, // 30s video + 30s panel
        completed: true,
        earnedAmount: webPanelData.reward
      });
    }

    setIsWebPanelOpen(false);
  };


  // Fetch user data
  const { data: earningsData } = useQuery({
    queryKey: QUERY_KEYS.earnings,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/earnings?limit=10");
      return await response.json() as { earnings: Earning[]; total: string };
    },
    enabled: !!user,
  });

  const { data: referralsData } = useQuery({
    queryKey: QUERY_KEYS.referrals,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/referrals");
      return await response.json() as {
        referrals: ReferralUser[];
        stats: { count: number; totalEarned: string }
      };
    },
    enabled: !!user,
  });

  // Real (non-synthetic) engine breakdown for the Earnings Breakdown pie
  // chart — sourced from the immutable user_transactions ledger server-side.
  const { data: earningsBreakdownData } = useQuery({
    queryKey: QUERY_KEYS.earningsBreakdown,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/earnings/breakdown");
      return await response.json() as { engineA: string; engineB: string; guildPool: string };
    },
    enabled: !!user,
  });

  const { data: commissionsData, isLoading: isLoadingCommissions } = useQuery({
    queryKey: QUERY_KEYS.commissions,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/commissions");
      return await response.json();
    },
    enabled: !!user,
  });

  // Dynamic System Configurations (Bulk Fetch)
  const { data: sysConfig, isLoading: isConfigLoading } = useQuery({
    queryKey: ["/api/config/bulk"],
    queryFn: async () => {
      const keys = ["MIN_PAYOUT", "WITHDRAWAL_FEE_PCT", "REFERRAL_FEE_SHARE_PCT", "CONVERSION_RATE"];
      const results = await Promise.all(
        keys.map(k => apiRequest("GET", `/api/config/${k}`).then(r => r.json()))
      );
      return Object.fromEntries(results.map(r => [r.key, r.value]));
    },
  });

  const MIN_PAYOUT = parseFloat(sysConfig?.["MIN_PAYOUT"] ?? "100");
  const WITHDRAWAL_FEE_PERCENT = parseFloat(sysConfig?.["WITHDRAWAL_FEE_PCT"] ?? "15");
  const REFERRAL_FEE_SHARE_PERCENT = parseFloat(sysConfig?.["REFERRAL_FEE_SHARE_PCT"] ?? "50");
  // F-10 / Q1: Commission amounts are stored as PKR in commission_logs.
  // Convert to TX-Points for display to honour the Points-Only Mandate.
  const CONVERSION_RATE = parseFloat(sysConfig?.["CONVERSION_RATE"] ?? "100");

  const commissions = commissionsData?.commissions || [];

  const { data: notificationsData, isLoading: isLoadingNotifications } = useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/notifications");
      return await response.json() as any[];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const notifications = notificationsData || [];

  const { data: todayAdViews, isLoading: todayAdViewsLoading } = useQuery({
    queryKey: ["ad-views", "today"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/ad-views/today");
      return await response.json() as { count: number };
    },
    enabled: !!user,
  });

  // ============================================
  // REAL-TIME ANALYTICS DATA QUERIES
  // ============================================

  // Public platform config — conversionRate, fee pct, daily earnings goal (configurable via admin)
  const { data: publicConfig } = useQuery({
    queryKey: QUERY_KEYS.publicConfig,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/config/public");
      return res.json() as Promise<{ conversionRate: number; platformName: string; withdrawalFeePct: number; dailyEarningsGoalPkr: number }>;
    },
    staleTime: 5 * 60 * 1000, // Re-fetch every 5 min — changes are rare
  });

  // Dashboard statistics - comprehensive real-time data
  const { data: dashboardStats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/dashboard/stats");
      return await response.json();
    },
    enabled: !!user,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // PS-based rank tier is updated automatically by the server on each earn event.
  // No client-initiated refresh needed.

  const activeRefsCount = dashboardStats?.referralCount || referralsData?.stats.count || 0;

  // Earnings history for charts
  const { data: earningsHistory } = useQuery({
    queryKey: ["earnings", "history", "week"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/earnings/history?period=week");
      return await response.json() as Array<{ date: string; amount: string }>;
    },
    enabled: !!user,
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });

  // Referral leaderboard - ranked referrals
  const {
    data: referralLeaderboard,
    isLoading: isReferralLoading,
    isError: isReferralError,
    error: referralError
  } = useQuery({
    queryKey: ["referrals", "leaderboard"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/referrals/leaderboard");
      if (!response.ok) {
        throw new Error("Failed to fetch referral tree");
      }
      return await response.json();
    },
    enabled: !!user,
    retry: 2,
    refetchInterval: 60000,
  });

  const directReferralsCount = useMemo(
    () => ((referralLeaderboard as any[]) || []).filter((r) => r.level === 1).length,
    [referralLeaderboard]
  );

  const userRank = (user?.userRankTier || "E-Rank").toLowerCase();

  // Payout is always open — no task gate (Blueprint v2026)
  const adsWatchedTodayCount = todayAdViews?.count || 0;

  const { data: withdrawalsHistory, error: withdrawalsError } = useQuery<any>({
    queryKey: ["/api/withdrawals"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/withdrawals");
      if (!response.ok) {
        const err = await response.json();
        throw err;
      }
      return await response.json();
    },
    enabled: currentSection === 4 && !!user && user.id !== 'guest',
    retry: false,
  });

  // Transaction history - combined earnings/withdrawals/commissions
  const { data: transactionHistory } = useQuery({
    queryKey: ["transactions", "history"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/transactions/history?limit=50");
      return await response.json();
    },
    enabled: !!user,
  });

  // Scratch card reveal state — shown after an ad-view earn event resolves
  const [scratchCardBreakdown, setScratchCardBreakdown] = useState<ScratchCardBreakdown | null>(null);
  const [showScratchCard, setShowScratchCard] = useState(false);

  // Record ad view mutation
  const recordAdViewMutation = useMutation({
    mutationFn: async (data: {
      adId: string;
      adType: string;
      duration: number;
      completed: boolean;
      earnedAmount: string;
      sessionToken?: string;
    }) => {
      const response = await apiRequest("POST", "/api/ad-view", data);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adViews });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
      const breakdown = data?.adView?.pointsBreakdown;
      if (breakdown) {
        setScratchCardBreakdown(breakdown);
        setShowScratchCard(true);
      } else {
        // Fallback toast when scratch card breakdown is absent
        toast({
          title: "Points Earned",
          description: "Your ad view has been recorded and points credited.",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Ad View Not Recorded",
        description: err?.message || "Could not record your ad completion. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Chat and Help Section state
  const [activeHelpTab, setActiveHelpTab] = useState('guide');
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      text: "Hello! Welcome to THORX Support. I'm your AI assistant, here to explain our Halal earning model where you convert attention into currency. How can I assist you today?",
      sender: "support",
      timestamp: new Date(Date.now() - 5000).toISOString(),
      avatar: "TS"
    }
  ]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    description: ""
  });
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);

  // Handle contact form submission
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contactForm.name || !contactForm.email || !contactForm.description) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields before submitting.",
        variant: "destructive"
      });
      return;
    }

    setIsContactSubmitting(true);

    try {
      const response = await apiRequest("POST", "/api/contact", {
        name: contactForm.name,
        email: contactForm.email,
        description: contactForm.description
      });

      if (response.ok) {
        toast({
          title: "Message Sent!",
          description: "We'll get back to you within 24 hours."
        });
        setContactForm({ name: "", email: "", description: "" });
      } else {
        throw new Error("Failed to send message");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsContactSubmitting(false);
    }
  };

  // Payout section states
  const [currentStep, setCurrentStep] = useState(1);
  const [withdrawalKey, setWithdrawalKey] = useState(() => crypto.randomUUID());
  const [withdrawAmount, setWithdrawAmount] = useState(""); // TX-Points requested (not PKR)
  const [selectedTimeframe, setSelectedTimeframe] = useState<string | null>(null); // Phase 9.1
  const [selectedMethod, setSelectedMethod] = useState("");
  const [paymentDetails, setPaymentDetails] = useState({
    name: "",
    number: "",
    email: "",
    iban: ""
  });
  // Audit finding 1-J: field-level validation errors — shown on blur so the
  // user gets immediate inline hints instead of a server-side round-trip error.
  const [paymentErrors, setPaymentErrors] = useState<{ name?: string; number?: string; email?: string }>({});

  const validatePaymentField = (field: "name" | "number" | "email", value: string): string => {
    if (field === "name") {
      if (!value.trim()) return "Full name is required";
      if (value.trim().length < 3) return "Name must be at least 3 characters";
      if (!/^[a-zA-Z\s'-]+$/.test(value.trim())) return "Name can only contain letters, spaces, hyphens, or apostrophes";
      return "";
    }
    if (field === "number") {
      if (!value.trim()) return "Phone number is required";
      const normalized = value.replace(/\s/g, "");
      if (!/^03\d{9}$/.test(normalized)) return "Enter a valid Pakistani number (e.g. 03001234567)";
      return "";
    }
    if (field === "email") {
      if (!value.trim()) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Enter a valid email address";
      return "";
    }
    return "";
  };

  const handlePaymentBlur = (field: "name" | "number" | "email") => {
    const err = validatePaymentField(field, paymentDetails[field]);
    setPaymentErrors(prev => ({ ...prev, [field]: err }));
  };
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // THORX v3 (spec F.11): the withdrawal confirm button must stay disabled for a
  // minimum 2 seconds after the preview screen (step 3) is reached, so the user
  // has time to actually read the fee breakdown before confirming.
  const [step3MinDisplayElapsed, setStep3MinDisplayElapsed] = useState(false);
  useEffect(() => {
    if (currentStep !== 3) {
      setStep3MinDisplayElapsed(false);
      return;
    }
    setStep3MinDisplayElapsed(false);
    const t = setTimeout(() => setStep3MinDisplayElapsed(true), 2000);
    return () => clearTimeout(t);
  }, [currentStep]);

  // Phase 9.1: Timeframe breakdown — shows how many TX-Points the user has
  // in each window without revealing PKR until step 3.
  const { data: timeframeBreakdown } = useQuery<{
    today: { points: number; exactPkr: number; platformFee: number; netPkr: number };
    thisWeek: { points: number; exactPkr: number; platformFee: number; netPkr: number };
    thisMonth: { points: number; exactPkr: number; platformFee: number; netPkr: number };
    last3Months: { points: number; exactPkr: number; platformFee: number; netPkr: number };
    allTime: { points: number; exactPkr: number; platformFee: number; netPkr: number };
  }>({
    queryKey: ["/api/withdrawals/timeframe-breakdown"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/withdrawals/timeframe-breakdown");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
    staleTime: 60000,
  });

  const TIMEFRAME_OPTIONS = [
    { key: "today", label: "Today" },
    { key: "thisWeek", label: "This Week" },
    { key: "thisMonth", label: "This Month" },
    { key: "last3Months", label: "Last 3 Months" },
    { key: "allTime", label: "All Time" },
  ];

  // THORX v3: live withdrawal preview — the amount the user types is a count
  // of TX-Points; the real PKR value is computed server-side from the FIFO
  // ledger walk (never guessed/converted client-side), so we fetch the exact
  // breakdown before letting the user confirm.
  const withdrawPointsRequested = parseInt(withdrawAmount || "0", 10);
  const { data: withdrawalPreview, isLoading: isPreviewLoading, error: withdrawalPreviewError } = useQuery<{
    exactPkr: number; platformFee: number; feePercent: number; referralCommission: number;
    referrerName: string | null; userNetPkr: number; sRankFastTrack: boolean;
  }>({
    queryKey: QUERY_KEYS.withdrawalPreview(withdrawPointsRequested),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/withdrawals/preview?points=${withdrawPointsRequested}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to preview withdrawal");
      }
      return res.json();
    },
    enabled: currentStep >= 2 && Number.isFinite(withdrawPointsRequested) && withdrawPointsRequested > 0,
    retry: false,
  });

  // Hero section interactive states (30s toggle)
  const [isWorkHeroToggled, setIsWorkHeroToggled] = useState(false);
  const [isReferralsHeroToggled, setIsReferralsHeroToggled] = useState(false);
  const [isPayoutHeroToggled, setIsPayoutHeroToggled] = useState(false);
  const [isHelpHeroToggled, setIsHelpHeroToggled] = useState(false);
  const [isGuildHeroToggled, setIsGuildHeroToggled] = useState(false);

  const handleHeroToggle = (setter: any) => {
    setter((prev: boolean) => !prev);
  };

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // CSRF token for cookie-based sessions
      const csrf = getCsrfToken();
      if (csrf) headers['x-csrf-token'] = csrf;

      const response = await fetch(apiAbsolutePath("/api/chat"), {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ message: message.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }
      return await response.json();
    },
    onSuccess: (data) => {
      const supportMessage = {
        id: chatMessages.length + 2,
        text: data.response,
        sender: "support",
        timestamp: new Date().toISOString(),
        avatar: "TS"
      };
      setChatMessages(prev => [...prev, supportMessage]);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.chatHistory });
    },
    onError: (_error) => {
      const errorMessage = {
        id: chatMessages.length + 2,
        text: "Sorry, I'm having trouble connecting right now. Please try again or use the Contact section to reach our team.",
        sender: "support",
        timestamp: new Date().toISOString(),
        avatar: "TS"
      };
      setChatMessages(prev => [...prev, errorMessage]);
      toast({
        title: "Message Failed",
        description: "Could not reach support. Check your connection and try again.",
        variant: "destructive",
      });
    }
  });

  // Fetch chat history
  const { data: chatHistoryData, isLoading: isChatHistoryLoading } = useQuery<{ messages: Array<{ id: number; text: string; sender: string; timestamp: string; avatar: string }> }>({
    queryKey: ["chat-history"],
    queryFn: async () => {
      const headers: Record<string, string> = {};

      const response = await fetch(apiAbsolutePath("/api/chat/history?limit=50"), {
        headers,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch chat history");
      }
      return await response.json() as { messages: Array<{ id: number; text: string; sender: string; timestamp: string; avatar: string }> };
    },
    enabled: !!user, // Only fetch if user exists
  });

  // Handle chat history data with useEffect
  useEffect(() => {
    if (chatHistoryData?.messages) {
      setChatMessages([{
        id: 1,
        text: "Hello! Welcome to THORX Support. I'm your AI assistant, here to explain our Halal earning model where you convert attention into currency. How can I assist you today?",
        sender: "support",
        timestamp: new Date(Date.now() - 5000).toISOString(),
        avatar: "TS"
      }, ...chatHistoryData.messages.map((msg: { id: number; text: string; sender: string; timestamp: string; avatar: string }) => ({ ...msg, id: Date.now() + Math.random() }))]); // Append fetched messages
    }
  }, [chatHistoryData]);

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!newMessage || typeof newMessage !== 'string' || !newMessage.trim()) return;

    const userMessage = {
      id: Date.now(), // Simple unique ID
      text: newMessage,
      sender: "user",
      timestamp: new Date().toISOString(),
      avatar: user?.firstName?.charAt(0).toUpperCase() || "U"
    };

    setChatMessages(prev => [...prev, userMessage]);
    const messageToSend = newMessage;
    setNewMessage('');

    try {
      await chatMutation.mutateAsync(messageToSend);
    } catch (_error) {
      // Add an error message to the chat
      const errorMessage = {
        id: Date.now() + 1,
        text: "Message failed to send. Please try again.",
        sender: "support",
        timestamp: new Date().toISOString(),
        avatar: "TS"
      };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  };

  // Navigation handlers
  // Scroll to top on section change
  useEffect(() => {
    const activeSection = document.querySelector('.cinematic-section.active');
    if (activeSection) {
      activeSection.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [currentSection]);

  const navigateToSection = useCallback((index: number) => {
    if (index >= 0 && index < sections.length && index !== currentSection) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentSection(index);
        setIsTransitioning(false);
      }, 150);
    }
  }, [currentSection]);

  const nextSection = useCallback(() => {
    navigateToSection((currentSection + 1) % sections.length);
  }, [currentSection, navigateToSection]);

  const prevSection = useCallback(() => {
    navigateToSection((currentSection - 1 + sections.length) % sections.length);
  }, [currentSection, navigateToSection]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          if (showProfileModal) return;
          e.preventDefault();
          prevSection();
          break;
        case "ArrowRight":
          if (showProfileModal) return;
          e.preventDefault();
          nextSection();
          break;
        case "Escape":
          e.preventDefault();
          setLocation("/");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSection, prevSection, setLocation, showProfileModal]);

  // Ad watching timer
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isWatching && selectedAd && watchProgress < 100) {
      interval = setInterval(() => {
        setWatchProgress(prev => {
          const newProgress = prev + (100 / selectedAd.duration);
          if (newProgress >= 100) {
            setIsWatching(false);
            setIsCompleted(true);

            recordAdViewMutation.mutate({
              adId: selectedAd.id,
              adType: selectedAd.type,
              duration: selectedAd.duration,
              completed: true,
              earnedAmount: selectedAd.reward,
            });

            setCompletedAds(prev => new Set(Array.from(prev).concat(selectedAd.id)));

            return 100;
          }
          return newProgress;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isWatching, selectedAd, watchProgress, recordAdViewMutation, toast]);

  const displayUser: AuthUser = user ?? GUEST_USER;

  // Single source of truth for the referral code/link — every copy/share/display
  // path below reads from these two so none of them can independently regress
  // into showing a literal "undefined" (e.g. THORX-2311/audit finding).
  const referralCode = displayUser?.referralCode || "";
  const referralLink = referralCode ? `${window.location.origin}/?ref=${referralCode}` : "";
  const referralReady = !isLoading && !!referralCode;
  // Replit's dev preview domain is a long UUID-based host. The host is rendered
  // in its own flex-truncated span so it's the part that shrinks with an
  // ellipsis on narrow screens, while "/?ref=CODE" (the part the user actually
  // needs to trust/copy) is marked shrink-0 and always stays fully visible.
  const referralLinkHost = window.location.origin.replace(/^https?:\/\//, "");

  // THORX v3 (spec F.10): Engine B locked-state inputs — mirrors PSProgressCard's
  // PS_THRESHOLDS (C-Rank requires 3000 PS).
  const engineBUserRankTier = (displayUser as any)?.userRankTier || "E-Rank";
  const engineBPerformanceScore = Number((displayUser as any)?.performanceScore || 0);
  const engineBPsToUnlock = Math.max(0, 3000 - engineBPerformanceScore);
  const engineBUnlockPct = Math.min(100, (engineBPerformanceScore / 3000) * 100);

  // Utility functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // formatPoints now lives in @/lib/formatPoints so DashboardCards.tsx can
  // share the exact same TX-Points display logic for referral/earnings
  // figures. Keep formatCurrency as alias so all existing calls continue to
  // show TX-Points.
  const formatCurrency = formatPoints;

  const copyReferralCode = () => {
    navigator.clipboard.writeText(displayUser?.referralCode || 'GUEST-CODE').then(() => {
      toast({
        title: "Copied!",
        description: "Referral code copied to clipboard",
      });
    }).catch(() => {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAdTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return '🎥';
      case 'banner': return '📰';
      case 'interactive': return '🎮';
      default: return '📺';
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'medium': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'hard': return 'bg-rose-100 text-rose-800 border-rose-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getDifficultyColorDark = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-emerald-900/30 text-emerald-300 border-emerald-600';
      case 'medium': return 'bg-amber-900/30 text-amber-300 border-amber-600';
      case 'hard': return 'bg-rose-900/30 text-rose-300 border-rose-600';
      default: return 'bg-slate-800 text-slate-300 border-slate-600';
    }
  };

  const startWatching = (ad: AdItem) => {
    setSelectedAd(ad);
    setWatchProgress(0);
    setIsCompleted(false);
    setIsWatching(true);
  };

  // Real earnings chart data from API
  const earningsChartData = earningsHistory && earningsHistory.length > 0
    ? earningsHistory.map(item => ({
      date: new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' }),
      earnings: parseFloat(item.amount),
      ads: 0, // Can be enhanced later
      tasks: 0 // Can be enhanced later
    }))
    : [
      { date: 'Mon', earnings: 0, ads: 0, tasks: 0 },
      { date: 'Tue', earnings: 0, ads: 0, tasks: 0 },
      { date: 'Wed', earnings: 0, ads: 0, tasks: 0 },
      { date: 'Thu', earnings: 0, ads: 0, tasks: 0 },
      { date: 'Fri', earnings: 0, ads: 0, tasks: 0 },
      { date: 'Sat', earnings: 0, ads: 0, tasks: 0 },
      { date: 'Sun', earnings: 0, ads: 0, tasks: 0 }
    ];

  // Real earnings breakdown — every slice is a real, ledger-backed PKR amount,
  // never an estimated or synthetically-split figure (Engine A / Engine B /
  // Guild Pool come straight from the immutable user_transactions ledger via
  // /api/earnings/breakdown; Referrals is the same real source used by the
  // Referral Earnings card elsewhere in this portal).
  const calculateEarningsBreakdown = () => {
    const engineAEarnings = parseFloat(earningsBreakdownData?.engineA || '0');
    const engineBEarnings = parseFloat(earningsBreakdownData?.engineB || '0');
    const guildPoolEarnings = parseFloat(earningsBreakdownData?.guildPool || '0');
    const referralEarnings = parseFloat(referralsData?.stats?.totalEarned || '0');

    const total = new Decimal(engineAEarnings)
      .plus(engineBEarnings)
      .plus(guildPoolEarnings)
      .plus(referralEarnings)
      .toNumber();

    // Theme-consistent color palette: Primary orange, black, beige accents, white
    const chartColors = {
      primary: '#FF6B35',      // Primary orange
      secondary: '#000000',    // Black
      tertiary: '#E8DCC4',     // Beige
      quaternary: '#FFFFFF'    // White (with black border for visibility)
    };

    const categories = [
      { name: 'Engine A Tasks', amount: engineAEarnings, color: chartColors.primary },
      { name: 'Referrals', amount: referralEarnings, color: chartColors.secondary },
      { name: 'Guild Pool', amount: guildPoolEarnings, color: chartColors.tertiary },
      { name: 'Engine B Surveys', amount: engineBEarnings, color: chartColors.quaternary },
    ];

    // No real earnings yet — show an honest empty state instead of a
    // fabricated distribution.
    if (total <= 0) {
      return categories.map(c => ({ name: c.name, value: 0, color: c.color }));
    }

    return categories.map(c => ({
      name: c.name,
      value: Math.round((c.amount / total) * 100),
      color: c.color,
    }));
  };

  const earningTypesData = calculateEarningsBreakdown();
  const hasEarningsBreakdownData = earningTypesData.some(entry => entry.value > 0);

  // PKR earnings target — fetched from system_config (DAILY_EARNINGS_GOAL_PKR),
  // admin-configurable. Falls back to 50 while the config loads.
  const dailyEarningsGoalPkr = publicConfig?.dailyEarningsGoalPkr ?? 50;
  const currentProgress = parseFloat(displayUser?.totalEarnings || '0.00');
  const progressPercentage = Math.min((currentProgress / dailyEarningsGoalPkr) * 100, 100);

  // Ad daily limit — reads from dashboardStats which pulls MAX_ADS_PER_DAY
  // from system_config, so admin changes propagate to the UI within 30 s.
  const adsDailyLimit = dashboardStats?.dailyGoal || 20;
  const remainingAds = Math.max(0, adsDailyLimit - adsWatchedTodayCount);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Industrial Grid Overlay */}

      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b-2 md:border-b-[3px] border-black" role="navigation" aria-label="Main navigation">
        <div className="max-w-[1600px] mx-auto px-4 md:px-12 h-20 md:h-24 flex items-center justify-between">
          {/* Brand/Logo Area */}
          <div className="flex items-center h-full">
            <div className="flex flex-col cursor-pointer" onClick={() => navigateToSection(0)}>
              <span className="text-2xl md:text-4xl font-black tracking-tighter text-black leading-none">THORX.</span>
            </div>

          </div>

          <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <DesktopNavTabs
              activeTab={currentSection <= 1 ? currentSection : currentSection + 1}
              onChange={(index) => {
                if (index !== null) {
                  const targetIndex = index <= 1 ? index : index - 1;
                  navigateToSection(targetIndex);
                }
              }}
              tabs={[
                { title: sections[0].name, icon: sections[0].icon },
                { title: sections[1].name, icon: sections[1].icon },
                { type: "separator" },
                { title: sections[2].name, icon: sections[2].icon },
                { title: sections[3].name, icon: sections[3].icon },
                { title: sections[4].name, icon: sections[4].icon },
                { title: sections[5].name, icon: sections[5].icon },
                { title: sections[6].name, icon: sections[6].icon },
              ]}
            />
          </div>

          <div className="flex items-center space-x-3">
            <Button
              onClick={() => setShowNotificationModal(true)}
              variant="outline"
              size="sm"
              className="relative border-2 border-black rounded-lg text-black bg-white hover:bg-black hover:text-white hover:border-black transition-all duration-300 transform hover:scale-105"
              aria-label="Open notifications"
            >
              <Bell className="w-4 h-4" strokeWidth={2} />
              {(commissions?.length > 0 || notifications?.length > 0) && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-white text-[9px] font-black border border-white px-1 leading-none">
                  {(commissions?.length ?? 0) + (notifications?.length ?? 0)}
                </span>
              )}
            </Button>
            <Button
              onClick={() => setShowProfileModal(true)}
              variant="outline"
              size="sm"
              className="border-2 border-black rounded-lg text-black bg-white hover:bg-primary hover:text-white hover:border-primary transition-all duration-300 transform hover:scale-105"
              data-testid="button-profile"
            >
              <Settings className="w-5 h-5 stroke-[2px]" />
            </Button>
            <Button
              onClick={() => logout()}
              variant="outline"
              size="sm"
              className="border-2 border-black rounded-lg text-black bg-white hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all duration-300 transform hover:scale-105"
              data-testid="button-logout"
            >
              <LogOut className="w-5 h-5 stroke-[2px]" />
            </Button>
          </div>
        </div>
      </nav >

      {/* Desktop Navigation Controls - Landing Page Style (Hidden on Mobile for User Portal, and while the profile modal is open) */}
      {!showProfileModal && (
        < div className="arrow-keys-guide hidden md:flex" >
          <div className="flex items-center gap-3">
            <button
              onClick={prevSection}
              className="arrow-key"
              disabled={currentSection === 0}
              data-testid="button-prev-section"
            >
              ←
            </button>
            <button
              onClick={nextSection}
              className="arrow-key"
              disabled={currentSection === sections.length - 1}
              data-testid="button-next-section"
            >
              →
            </button>
          </div>
        </div >
      )}

      {/* Mobile Bottom Tab Bar */}
      {/* Mobile Bottom Tab Bar - REBUILT */}
      <MobileNavBar
        sections={sections}
        currentSection={currentSection}
        onSectionChange={navigateToSection}
      />

      {/* Section Content */}
      <div className="pt-24 md:pt-24 pb-24 md:pb-12">
        <AnimatePresence>
          {currentSection === 0 && (
            <motion.section
              key="section-dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="cinematic-section active"
              data-testid="section-dashboard"
            >
              <Suspense fallback={null}><DashboardSection displayUser={displayUser} isMobile={isMobile} earningsChartData={earningsChartData} earningTypesData={earningTypesData} hasEarningsBreakdownData={hasEarningsBreakdownData} /></Suspense>
            </motion.section>
          )}
          {currentSection === 1 && (
            <motion.section
              key="section-work"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="cinematic-section active"
              data-testid="section-work"
            >
              <Suspense fallback={null}><WorkSection isWorkHeroToggled={isWorkHeroToggled} setIsWorkHeroToggled={setIsWorkHeroToggled} handleHeroToggle={handleHeroToggle} activeWorkTab={activeWorkTab} setActiveWorkTab={setActiveWorkTab} activeWorkEngine={activeWorkEngine} setActiveWorkEngine={setActiveWorkEngine} isMobile={isMobile} engineBUserRankTier={engineBUserRankTier} engineBPerformanceScore={engineBPerformanceScore} engineBPsToUnlock={engineBPsToUnlock} engineBUnlockPct={engineBUnlockPct} setWebPanelData={setWebPanelData} setIsWebPanelOpen={setIsWebPanelOpen} /></Suspense>
            </motion.section>
          )}
          {currentSection === 2 && (
            <motion.section
              key="section-referrals"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="cinematic-section active"
              data-testid="section-referrals"
            >
              <Suspense fallback={null}><ReferralsSection isReferralsHeroToggled={isReferralsHeroToggled} setIsReferralsHeroToggled={setIsReferralsHeroToggled} handleHeroToggle={handleHeroToggle} referralsData={referralsData} formatCurrency={formatCurrency} showReferralLink={showReferralLink} setShowReferralLink={setShowReferralLink} referralReady={referralReady} referralLink={referralLink} referralLinkHost={referralLinkHost} referralCode={referralCode} toast={toast} referralZoom={referralZoom} setReferralZoom={setReferralZoom} referralPanRef={referralPanRef} onReferralMouseDown={onReferralMouseDown} isReferralDragging={isReferralDragging} directReferralsCount={directReferralsCount} isReferralError={isReferralError} isReferralLoading={isReferralLoading} referralError={referralError} displayUser={displayUser} referralLeaderboard={referralLeaderboard} commissionsData={commissionsData} CONVERSION_RATE={CONVERSION_RATE} /></Suspense>
            </motion.section>
          )}
          {currentSection === 3 && (
            <motion.section
              key="section-guild"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="cinematic-section active"
              data-testid="section-guild"
            >
              <Suspense fallback={null}><GuildSection isGuildHeroToggled={isGuildHeroToggled} setIsGuildHeroToggled={setIsGuildHeroToggled} handleHeroToggle={handleHeroToggle} user={user} /></Suspense>
            </motion.section>
          )}
          {currentSection === 4 && (
            <motion.section
              key="section-payout"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="cinematic-section active"
              data-testid="section-payout"
            >
              <Suspense fallback={null}><PayoutSection isPayoutHeroToggled={isPayoutHeroToggled} setIsPayoutHeroToggled={setIsPayoutHeroToggled} handleHeroToggle={handleHeroToggle} toast={toast} withdrawalsHistory={withdrawalsHistory} currentStep={currentStep} setCurrentStep={setCurrentStep} withdrawalKey={withdrawalKey} setWithdrawalKey={setWithdrawalKey} withdrawAmount={withdrawAmount} setWithdrawAmount={setWithdrawAmount} selectedTimeframe={selectedTimeframe} setSelectedTimeframe={setSelectedTimeframe} selectedMethod={selectedMethod} setSelectedMethod={setSelectedMethod} paymentDetails={paymentDetails} setPaymentDetails={setPaymentDetails} isProcessing={isProcessing} setIsProcessing={setIsProcessing} showHistory={showHistory} setShowHistory={setShowHistory} step3MinDisplayElapsed={step3MinDisplayElapsed} timeframeBreakdown={timeframeBreakdown} withdrawalPreview={withdrawalPreview} isPreviewLoading={isPreviewLoading} withdrawalPreviewError={withdrawalPreviewError} WITHDRAWAL_FEE_PERCENT={WITHDRAWAL_FEE_PERCENT} isConfigLoading={isConfigLoading} navigateToSection={navigateToSection} TIMEFRAME_OPTIONS={TIMEFRAME_OPTIONS} DEV_MOCK_PREVIEW={DEV_MOCK_PREVIEW} queryClient={queryClient} formatDate={formatDate} formatCurrency={formatCurrency} /></Suspense>
            </motion.section>
          )}
          {currentSection === 5 && (
            <motion.section
              key="section-help"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="cinematic-section active"
              data-testid="section-help"
            >
              <Suspense fallback={null}><HelpSection isHelpHeroToggled={isHelpHeroToggled} setIsHelpHeroToggled={setIsHelpHeroToggled} handleHeroToggle={handleHeroToggle} activeHelpTab={activeHelpTab} setActiveHelpTab={setActiveHelpTab} chatMessages={chatMessages} isChatHistoryLoading={isChatHistoryLoading} newMessage={newMessage} setNewMessage={setNewMessage} handleSendMessage={handleSendMessage} chatMutation={chatMutation} contactForm={contactForm} setContactForm={setContactForm} handleContactSubmit={handleContactSubmit} isContactSubmitting={isContactSubmitting} isMobile={isMobile} /></Suspense>
            </motion.section>
          )}
          {currentSection === 6 && (
            <motion.section
              key="section-ranks"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="cinematic-section active"
              data-testid="section-ranks"
            >
              <Suspense fallback={null}><LeaderboardSection /></Suspense>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <Suspense fallback={null}>
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={displayUser}
        activeRefsCount={activeRefsCount}
      />
      </Suspense>

      <Suspense fallback={null}>
      <NotificationModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        commissions={commissions}
        notifications={notifications}
        isLoading={isLoadingCommissions || isLoadingNotifications}
      />
      </Suspense>

      <Suspense fallback={null}>
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          referralCode={displayUser?.referralCode || ""}
          userName={displayUser?.firstName || ""}
          toast={toast}
        />
      </Suspense>

      <Suspense fallback={null}>
      <AdWebPanel
        isOpen={isWebPanelOpen}
        productUrl={webPanelData.productUrl}
        adId={webPanelData.adId}
        reward={webPanelData.reward}
        onComplete={handleWebPanelComplete}
        onClose={() => setIsWebPanelOpen(false)}
      />
      </Suspense>

      {/* Beta trust layer: mandatory honesty-rules acknowledgment + floating feedback */}
      <BetaTrustLayer user={displayUser as any} />

      <Suspense fallback={null}>
      <ScratchCardModal
        open={showScratchCard}
        breakdown={scratchCardBreakdown}
        onClose={() => setShowScratchCard(false)}
      />
      </Suspense>
    </div >
  );

}