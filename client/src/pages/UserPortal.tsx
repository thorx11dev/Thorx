import { useState, useEffect, useCallback, useMemo } from "react";
import Decimal from "decimal.js";
import { z } from "zod";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuth, type User as AuthUser } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient, getCsrfToken } from "@/lib/queryClient";
import { ReferralTree } from "@/components/ui/referral-tree";
import { useToast } from "@/hooks/use-toast";
import TechnicalLabel from "@/components/ui/technical-label";
import Barcode from "@/components/ui/barcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import EnhancedVideoPlayer from "@/components/ui/enhanced-video-player";
import IndustrialTabs, { WORK_TABS } from "@/components/ui/industrial-tabs";
import MetricsCards from "@/components/ui/metrics-cards";
import { ProfileModal } from "@/components/ui/profile-modal";
import { resolveAvatarUrl } from "@/lib/rankAvatars";
import { MobileNavBar } from "@/components/ui/mobile-nav-bar";
import TextMarquee from "@/components/ui/text-marquee";
import { DesktopNavTabs } from "@/components/ui/desktop-nav-tabs";
import { AdWebPanel } from "@/components/ui/ad-web-panel";
import { WaterfallAdPlayer } from "@/components/ads/HilltopAdsPlayer";
import { NotificationModal } from "@/components/ui/notification-modal";
import { CommissionCalculator } from "@/components/ui/commission-calculator";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAbsolutePath } from "@/lib/apiOrigin";
import { JazzCashLogo, EasyPaisaLogo, BankTransferLogo } from "@/components/ui/payment-icons";
import { DashboardCards } from "@/components/DashboardCards";
import { GuildDiscoveryPanel } from "@/components/guild/GuildDiscoveryPanel";
import { GuildMemberPanel } from "@/components/guild/GuildMemberPanel";
import { CaptainPortal } from "@/components/guild/CaptainPortal";
import { ScratchCardModal, type ScratchCardBreakdown } from "@/components/guild/ScratchCardModal";
import { DEV_UNLOCK_RANK_GATES } from "@/lib/previewAccess";
import { formatPoints } from "@/lib/formatPoints";
import { useLocation } from "wouter";
import {
  LogOut,
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
  Clock,
  ChevronRight,
  ChevronLeft,
  Eye,
  Target,
  Award,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  PieChart,
  Zap,
  Copy,
  CheckCircle2,
  Wallet,
  Activity,
  Gift,
  Play as PlayIcon,
  Pause,
  Timer,
  PlayCircle,
  PauseCircle,
  StopCircle,
  Filter,
  Flame,
  HelpCircle,
  MessageCircle,
  Book,

  RotateCcw,
  RotateCw,
  Phone,
  Mail,
  CreditCard,
  History,
  Download,
  Home,
  Briefcase,
  UserCheck,
  HandHeart,
  LifeBuoy,
  Crown,
  Trophy,
  Medal,
  Zap as ZapIcon,
  TrendingDown,
  RefreshCw,
  Share2,
  Link2,
  ExternalLink,
  User,
  Shield,
  Edit2,
  Settings,
  Network,
  LayoutDashboard,
  MonitorPlay,
  Landmark,
  Headphones,
  X,
  Send,
  Bell,
  Plus,
  Minus,
  Maximize,
  Lock
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { SiWhatsapp, SiTelegram, SiMessenger, SiInstagram, SiTiktok, SiFacebook, SiGmail } from 'react-icons/si';


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
const InteractiveDivider = ({ orientation = "horizontal", className = "" }: { orientation?: "horizontal" | "vertical", className?: string }) => {
  const [isOrange, setIsOrange] = useState(false);

  const handleClick = () => {
    setIsOrange(true);
    setTimeout(() => {
      setIsOrange(false);
    }, 3000); // 3 seconds for the progress bar animation
  };

  if (orientation === "vertical") {
    return (
      <div
        onClick={handleClick}
        className={cn(
          "w-[2px] self-stretch bg-black cursor-pointer overflow-hidden relative",
          className
        )}
      >
        <AnimatePresence>
          {isOrange && (
            <motion.div
              initial={{ scaleY: 0, opacity: 1 }}
              animate={{ scaleY: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3, ease: "linear" }}
              style={{ transformOrigin: "top" }}
              className="absolute inset-0 bg-primary"
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "w-screen relative left-1/2 -translate-x-1/2 h-[2px] bg-black cursor-pointer overflow-hidden",
        className
      )}
    >
      <AnimatePresence>
        {isOrange && (
          <motion.div
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, ease: "linear" }}
            style={{ transformOrigin: "left" }}
            className="absolute inset-0 bg-primary"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// Share Modal Component - Loading Screen Design Standard
function ShareModal({ isOpen, onClose, referralCode, userName, toast }: { isOpen: boolean; onClose: () => void; referralCode: string; userName: string; toast: any }) {
  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/?ref=${referralCode}`;
  const shareMessage = `Hey ${userName}! Check out THORX and start earning. Use my code: ${referralCode}`;
  const [copied, setCopied] = useState(false);

  const handleShare = async (platform: string) => {
    try {
      if (platform === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareMessage} ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'telegram') {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${shareMessage}`)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'messenger') {
        window.open(`fb-messenger://share?link=${encodeURIComponent(shareUrl)}&app_id=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'instagram') {
        window.open(`https://www.instagram.com/create/?text=${encodeURIComponent(`${shareMessage}`)}&url=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'tiktok') {
        window.open(`https://www.tiktok.com/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${shareMessage}`)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener,noreferrer');
      } else if (platform === 'gmail') {
        window.open(`mailto:?subject=${encodeURIComponent('Invitation to Join THORX!')}&body=${encodeURIComponent(`${shareMessage}\n\nClick here to join: ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      toast({ title: "Sharing Failed", description: "Could not share via this platform. Please try again." });
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link Copied!", description: "Referral link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({ title: "Copy Failed", description: "Could not copy link. Please try again." });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black animate-in fade-in duration-300 share-modal-wrapper" onClick={onClose}>
      <div className="h-screen flex flex-col items-center justify-center relative px-4 md:px-8" onClick={(e) => e.stopPropagation()}>

        {/* Close Button - Upper Right Corner */}
        <button
          onClick={onClose}
          className="absolute top-6 md:top-8 right-6 md:right-8 p-2 md:p-3 text-white hover:scale-125 hover:opacity-70 active:scale-110 transition-all duration-200 animate-in fade-in slide-in-from-top-4 duration-500 delay-200 z-10"
          data-testid="button-close-modal"
          aria-label="Close modal"
        >
          <X className="w-6 h-6 md:w-7 md:h-7" />
        </button>

        {/* Center Content - Referral Link & Share Icons */}
        <div className="w-full max-w-2xl animate-in fade-in zoom-in duration-500">

          {/* Referral Link Display - Input Container Style */}
          <div className="text-center mb-12 md:mb-16">
            <div className="bg-white/5 border border-white/20 rounded-lg p-6 md:p-8 backdrop-blur-sm animate-in fade-in duration-500 delay-100 hover:border-white/40 transition-colors duration-300" onClick={handleCopyLink}>
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="w-full bg-transparent text-white text-center text-lg md:text-xl lg:text-2xl font-black break-all outline-none select-all placeholder-white/40"
                data-testid="input-referral-link"
              />
            </div>
          </div>

          {/* Social Share Icons - Below Referral Link */}
          <div className="flex justify-center items-center gap-6 md:gap-8 mb-16 md:mb-20 flex-wrap">
            {/* WhatsApp */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('whatsapp');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(37,211,102,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 transform origin-center"
              data-testid="share-whatsapp"
              aria-label="Share on WhatsApp"
              title="Share on WhatsApp"
            >
              <SiWhatsapp className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Telegram */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('telegram');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(0,136,204,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 transform origin-center"
              data-testid="share-telegram"
              aria-label="Share on Telegram"
              title="Share on Telegram"
            >
              <SiTelegram className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Messenger */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('messenger');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(0,132,250,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 transform origin-center"
              data-testid="share-messenger"
              aria-label="Share on Messenger"
              title="Share on Messenger"
            >
              <SiMessenger className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Instagram */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('instagram');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(224,33,103,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-250 transform origin-center"
              data-testid="share-instagram"
              aria-label="Share on Instagram"
              title="Share on Instagram"
            >
              <SiInstagram className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* TikTok */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('tiktok');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(0,0,0,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 transform origin-center"
              data-testid="share-tiktok"
              aria-label="Share on TikTok"
              title="Share on TikTok"
            >
              <SiTiktok className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Facebook */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('facebook');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(59,89,152,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-350 transform origin-center"
              data-testid="share-facebook"
              aria-label="Share on Facebook"
              title="Share on Facebook"
            >
              <SiFacebook className="w-8 h-8 md:w-10 md:h-10" />
            </button>
            {/* Gmail */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare('gmail');
              }}
              className="text-white hover:scale-125 hover:drop-shadow-[0_0_12px_rgba(221,75,57,0.6)] active:scale-95 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400 transform origin-center"
              data-testid="share-gmail"
              aria-label="Share via Gmail"
              title="Share via Gmail"
            >
              <SiGmail className="w-8 h-8 md:w-10 md:h-10" />
            </button>
          </div>
        </div>

        {/* Footer - Bottom with Copy Button on Right */}
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500">
          <p className="text-white text-base md:text-lg lg:text-xl font-black tracking-widest">REFERRAL SYSTEM</p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyLink();
            }}
            className={`p-2 md:p-3 text-white transition-all duration-300 hover:scale-125 active:scale-95 transform ${copied
              ? 'scale-110 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
              : ''
              }`}
            data-testid="button-copy-referral-link"
            aria-label="Copy referral link"
            title="Copy referral link"
          >
            <Copy className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}


// Animated Placeholder Component for Contact Form
function AnimatedPlaceholder({ examples }: { examples: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const example = examples[currentIndex];
    let timeout: NodeJS.Timeout;

    if (isTyping) {
      if (currentText.length < example.length) {
        timeout = setTimeout(() => {
          setCurrentText(example.slice(0, currentText.length + 1));
        }, 100);
      } else {
        timeout = setTimeout(() => setIsTyping(false), 1000);
      }
    } else {
      if (currentText.length > 0) {
        timeout = setTimeout(() => {
          setCurrentText(currentText.slice(0, -1));
        }, 50);
      } else {
        setCurrentIndex((prev) => (prev + 1) % examples.length);
        setIsTyping(true);
      }
    }

    return () => clearTimeout(timeout);
  }, [currentText, currentIndex, examples, isTyping]);

  return (
    <span className="text-muted-foreground">
      {currentText}<span className="animate-pulse">|</span>
    </span>
  );
}

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
  const [referralZoom, setReferralZoom] = useState(1);
  const resetZoom = () => setReferralZoom(1);

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

  // Engine B state
  const [engineBActiveTask, setEngineBActiveTask] = useState<any | null>(null);
  const [engineBPhase, setEngineBPhase] = useState<"idle" | "timer" | "verify" | "done">("idle");
  const [engineBTimer, setEngineBTimer] = useState(10);
  const [engineBCode, setEngineBCode] = useState("");
  const [engineBCodeError, setEngineBCodeError] = useState("");

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

  const handleWebPanelComplete = () => {
    // Finalize the ad completion
    setCompletedVideos(prev => new Set(Array.from(prev).concat(webPanelData.adId)));

    // Record ad view if needed (User might want this connected to backend)
    recordAdViewMutation.mutate({
      adId: webPanelData.adId,
      adType: 'video_panel',
      duration: 30, // 30s video + 30s panel
      completed: true,
      earnedAmount: webPanelData.reward
    });

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


  const { data: payoutRules } = useQuery({
    queryKey: ['/api/system-config/rank_payout_requirements'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/system-config/rank_payout_requirements");
      return res.json();
    },
    enabled: !!user,
  });


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

  const { data: todayAdViews } = useQuery({
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

  const { data: tasksWithRecords } = useQuery<any[]>({
    queryKey: QUERY_KEYS.tasks,
    enabled: !!user && user.id !== 'guest',
  });

  // Referral LVL 1 / LVL 2 counts — derived directly from the referral
  // leaderboard entries (by level), never from the aggregate total-referrals
  // stat, which conflates L1 and L2 into a single number.
  const referralLevel1Count = (referralLeaderboard || []).filter((r: any) => r.level === 1).length;
  const referralLevel2Count = (referralLeaderboard || []).filter((r: any) => r.level === 2).length;

  const userRank = (user?.userRankTier || "E-Rank").toLowerCase();

  // Payout is always open — no task gate (Blueprint v2026)
  const adsWatchedTodayCount = todayAdViews?.count || 0;
  const cpaCompletedCount = (tasksWithRecords || []).filter((t: any) => t.record?.status === 'completed').length;

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

  // Engine B mutations
  const engineBClickMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("POST", `/api/engine-b/tasks/${taskId}/click`);
      return await res.json();
    },
    onSuccess: (_, taskId) => {
      setEngineBPhase("timer");
      setEngineBTimer(10);
      setEngineBCode("");
      setEngineBCodeError("");
      const interval = setInterval(() => {
        setEngineBTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setEngineBPhase("verify");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Could not start task.", variant: "destructive" });
    },
  });

  const engineBVerifyMutation = useMutation({
    mutationFn: async ({ taskId, code }: { taskId: string; code: string }) => {
      const res = await apiRequest("POST", `/api/engine-b/tasks/${taskId}/verify`, { code });
      if (!res.ok) {
        const err = await res.json();
        throw err;
      }
      return await res.json();
    },
    onSuccess: (data) => {
      setEngineBPhase("done");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
      toast({
        title: "Task Completed!",
        description: `+25 PS credited. PKR earned has been added to your balance.`,
      });
    },
    onError: (err: any) => {
      if (err?.message === "VERIFICATION_FAILED_CODE") {
        setEngineBCodeError("Incorrect secret code. Please check and try again.");
      } else if (err?.message === "VERIFICATION_FAILED_TIME") {
        setEngineBCodeError(err?.details || "Wait longer before verifying.");
      } else {
        setEngineBCodeError(err?.message || "Verification failed. Please try again.");
      }
    },
  });

  // Chat and Help Section state
  const [activeHelpTab, setActiveHelpTab] = useState("guide");
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
          e.preventDefault();
          prevSection();
          break;
        case "ArrowRight":
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
  }, [nextSection, prevSection, setLocation]);

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

  // Calculate real-time earnings breakdown from actual data
  const calculateEarningsBreakdown = () => {
    // Check if we are inside a hook or functional component context
    // These values are used for the chart, we should ensure they are stable
    const adViewsEarnings = (todayAdViews?.count || 0) * 2.5;
    const referralEarnings = parseFloat(referralsData?.stats?.totalEarned || '0');
    const totalEarnings = parseFloat(displayUser?.totalEarnings || '0');

    // Calculate remaining from other sources — use Decimal to avoid float drift
    const otherEarnings = new Decimal(totalEarnings).minus(adViewsEarnings).minus(referralEarnings).toNumber();
    const guildBonusEarnings = Math.max(0, otherEarnings * 0.7);
    const bonusesEarnings = Math.max(0, otherEarnings * 0.3);

    const total = adViewsEarnings + referralEarnings + guildBonusEarnings + bonusesEarnings;

    // Theme-consistent color palette: Primary orange, black, beige accents, white
    const chartColors = {
      primary: '#FF6B35',      // Primary orange
      secondary: '#000000',    // Black
      tertiary: '#E8DCC4',     // Beige
      quaternary: '#FFFFFF'    // White (with black border for visibility)
    };

    // Calculate percentages
    if (total === 0) {
      return [
        { name: 'Ad Views', value: 65, color: chartColors.primary },
        { name: 'Referrals', value: 25, color: chartColors.secondary },
        { name: 'Guild Bonus', value: 7, color: chartColors.tertiary },
        { name: 'Bonuses', value: 3, color: chartColors.quaternary }
      ];
    }

    return [
      {
        name: 'Ad Views',
        value: Math.round((adViewsEarnings / total) * 100),
        color: chartColors.primary
      },
      {
        name: 'Referrals',
        value: Math.round((referralEarnings / total) * 100),
        color: chartColors.secondary
      },
      {
        name: 'Guild Bonus',
        value: Math.round((guildBonusEarnings / total) * 100),
        color: chartColors.tertiary
      },
      {
        name: 'Bonuses',
        value: Math.round((bonusesEarnings / total) * 100),
        color: chartColors.quaternary
      }
    ];
  };

  const earningTypesData = calculateEarningsBreakdown();

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
      <div className="industrial-grid fixed inset-0 z-0" />

      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white" role="navigation" aria-label="Main navigation">
        <div className="max-w-[1600px] mx-auto px-4 md:px-12 h-20 md:h-24 flex items-center justify-between">
          {/* Brand/Logo Area */}
          <div className="flex items-center h-full">
            <div className="flex flex-col cursor-pointer" onClick={() => navigateToSection(0)}>
              <span className="text-2xl md:text-4xl font-black tracking-tighter text-black leading-none">THORX</span>
            </div>

            <InteractiveDivider orientation="vertical" className="mx-4 md:mx-8" />

            {/* Desktop Navigation Link Indicators - Reference Design Match */}
            <div className="hidden lg:flex items-center ml-6">
              {/* Tabs moved to center */}
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
              ]}
            />
          </div>

          <div className="flex items-center space-x-3">
            <Button
              onClick={() => setShowNotificationModal(true)}
              variant="outline"
              size="sm"
              className="relative border-3 border-black text-black bg-white hover:bg-orange-500 hover:text-white shadow-[3px_3px_0px_#000] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
              style={{ borderRadius: '0' }}
            >
              <Bell className="w-5 h-5 stroke-[2px]" />
              {commissions?.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </Button>
            <Button
              onClick={() => setShowProfileModal(true)}
              variant="outline"
              size="sm"
              className="border-3 border-black text-black bg-white hover:bg-primary shadow-[3px_3px_0px_#000] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
              style={{ borderRadius: '0' }}
              data-testid="button-profile"
            >
              <Settings className="w-5 h-5 stroke-[2px]" />
            </Button>
            <Button
              onClick={() => logout()}
              variant="outline"
              size="sm"
              className="border-3 border-black text-black bg-white hover:bg-rose-500 hover:text-white shadow-[3px_3px_0px_#000] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
              style={{ borderRadius: '0' }}
              data-testid="button-logout"
            >
              <LogOut className="w-5 h-5 stroke-[2px]" />
            </Button>
          </div>
        </div>
        <InteractiveDivider />
      </nav >

      {/* Desktop Navigation Controls - Landing Page Style (Hidden on Mobile for User Portal) */}
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
              {renderDashboardSection()}
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
              {renderWorkSection()}
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
              {renderReferralsSection()}
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
              {renderGuildSection()}
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
              {renderPayoutSection()}
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
              {renderHelpSection()}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={displayUser}
        activeRefsCount={activeRefsCount}
      />

      <NotificationModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        commissions={commissions}
        notifications={notifications}
        isLoading={isLoadingCommissions || isLoadingNotifications}
      />

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        referralCode={displayUser?.referralCode || ""}
        userName={displayUser?.firstName || ""}
        toast={toast}
      />


      <AdWebPanel
        isOpen={isWebPanelOpen}
        productUrl={webPanelData.productUrl}
        adId={webPanelData.adId}
        reward={webPanelData.reward}
        onComplete={handleWebPanelComplete}
        onClose={() => setIsWebPanelOpen(false)}
      />

      <ScratchCardModal
        open={showScratchCard}
        breakdown={scratchCardBreakdown}
        onClose={() => setShowScratchCard(false)}
      />
    </div >
  );

  // Dashboard Section
  function renderDashboardSection() {
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
          className="wireframe-border p-6 md:p-12 mb-12 relative overflow-hidden group shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-shadow duration-500"
        >
          {/* Animated Background Element */}
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />

          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10">
            {/* Avatar with Premium Comic Border */}
            <div className="relative">
              <div className={cn(
                "w-32 h-32 md:w-40 md:h-40 border-4 bg-black overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.1)]",
                rank.border
              )}>
                <img
                  src={userAvatar}
                  alt="User Avatar"
                  className="w-full h-full object-cover will-change-transform"
                />
              </div>
              <div className={cn(
                "absolute -bottom-2 -right-2 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black border-2 border-black shadow-[0_4px_8px_rgba(0,0,0,0.15)]",
                rank.bg.replace('bg-', 'bg-')
              )}>
                {rank.title}
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1 text-center md:text-left pt-2">


              <h1 className="text-4xl md:text-6xl font-black text-black mb-2 tracking-tighter uppercase leading-none">
                {displayUser?.name || `${displayUser?.firstName} ${displayUser?.lastName}`}
              </h1>

            </div>

            {/* Utility Barcode - Hidden on mobile */}

          </div>
        </motion.div>

        <InteractiveDivider className="mb-12" />

        {/* THORX v3 (spec F.2): role-based dashboard card variants */}
        <DashboardCards />

        <InteractiveDivider className="my-12" />

        {/* Charts Section */}
        <div className="grid lg:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
          {/* Weekly Earnings Chart */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 }
            }}
            whileHover={{ scale: 1.01 }}
            className="group bg-card border-2 border-muted-foreground/20 hover:border-primary/30 transition-all duration-300 shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:shadow-primary/10 overflow-hidden"
          >
            <CardHeader className="border-b border-muted-foreground/20 group-hover:border-primary/30 transition-colors p-3 md:p-6 bg-white">
              <CardTitle className="flex items-center justify-between">
                <TechnicalLabel text="WEEKLY EARNINGS" className="text-foreground group-hover:text-primary/90 transition-colors text-xs md:text-sm" />
                <div className="p-1 md:p-2 bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-all duration-300">
                  <BarChart3 className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-4">
              <ResponsiveContainer width="100%" height={isMobile ? 200 : 280} minHeight={isMobile ? 180 : 250}>
                <AreaChart data={earningsChartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.2} />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={isMobile ? 8 : 10}
                    fontFamily="var(--font-sans)"
                    tickLine={false}
                    axisLine={false}
                    hide={isMobile}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={isMobile ? 8 : 10}
                    fontFamily="var(--font-sans)"
                    tickFormatter={(value) => isMobile ? `${value}` : `${value} pts`}
                    tickLine={false}
                    axisLine={false}
                    hide={isMobile}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} pts`, 'TX-Points']}
                    labelFormatter={(label) => `Day: ${label}`}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '2px solid hsl(var(--primary))',
                      borderRadius: '4px',
                      color: 'hsl(var(--primary))',
                      fontFamily: 'var(--font-sans)',
                      fontSize: isMobile ? '10px' : '12px',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 12px hsl(var(--primary)/0.25)'
                    }}
                    labelStyle={{ color: 'hsl(var(--primary))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="earnings"
                    stroke="hsl(var(--primary))"
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
            className="group bg-card border-2 border-black hover:border-primary transition-all duration-300 shadow-[8px_8px_0px_#000] hover:shadow-[12px_12px_0px_#000] hover:shadow-primary/10 overflow-hidden"
          >
            <CardHeader className="border-b-2 border-black group-hover:border-primary transition-colors p-3 md:p-6 bg-white">
              <CardTitle className="flex items-center justify-between">
                <TechnicalLabel text="EARNINGS BREAKDOWN" className="text-foreground group-hover:text-primary/90 transition-colors text-xs md:text-sm" />
                <div className="p-1 md:p-2 bg-primary/10 border-2 border-black group-hover:bg-primary/20 transition-all duration-300">
                  <PieChart className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-4">
              <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
                {/* Pie Chart */}
                <div className="flex-1 w-full flex justify-center">
                  <ResponsiveContainer width="100%" height={isMobile ? 180 : 280} minHeight={isMobile ? 160 : 250}>
                    <RechartsPieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <Pie
                        data={earningTypesData}
                        cx="50%"
                        cy="50%"
                        outerRadius={isMobile ? 60 : 90}
                        innerRadius={0}
                        dataKey="value"
                        stroke="#000000"
                        strokeWidth={3}
                        label={false}
                      >
                        {earningTypesData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="#000000"
                            strokeWidth={3}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value}%`, name]}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          border: '3px solid #000000',
                          borderRadius: '0px',
                          padding: isMobile ? '8px' : '12px',
                          fontFamily: 'var(--font-sans)',
                          fontSize: isMobile ? '10px' : '13px',
                          fontWeight: '900',
                          boxShadow: '4px 4px 0px #000000'
                        }}
                        labelStyle={{
                          color: '#000000',
                          fontWeight: '900',
                          marginBottom: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          fontSize: isMobile ? '9px' : '11px'
                        }}
                        itemStyle={{
                          color: 'hsl(var(--primary))',
                          fontWeight: '900',
                          fontSize: isMobile ? '9px' : '12px'
                        }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="w-full md:w-auto grid grid-cols-2 md:flex md:flex-col gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 bg-background border border-black md:border-2 hover:bg-primary/5 transition-colors">
                  {earningTypesData.map((entry, index) => (
                    <div key={`legend-${index}`} className="flex items-center gap-1.5 md:gap-2">
                      <div
                        className="w-3 h-3 md:w-4 md:h-4 border border-black md:border-2 flex-shrink-0"
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

  // Enhanced Work Section
  function renderWorkSection() {
    // Handle video completion
    const handleVideoComplete = (tabId: string, earnings: string) => {
      // Instead of completing immediately, open the Web Panel
      const activeTabData = WORK_TABS.find(tab => tab.id === activeWorkTab);

      setWebPanelData({
        productUrl: activeTabData?.productUrl || "https://www.google.com", // Fallback if undefined
        adId: tabId,
        reward: earnings
      });

      setIsWebPanelOpen(true);

      // Removed immediate toast
    };

    // Get current video tab data for player
    const activeTabData = WORK_TABS.find(tab => tab.id === activeWorkTab);
    const currentVideoTab = {
      id: activeWorkTab,
      title: activeTabData?.title || "PLAYER 1",
      icon: "play",
      color: "primary",
      videoUrl: `#${activeWorkTab}-video`,
      reward: "2.50",
      description: activeTabData?.description || "Watch video ads to earn rewards"
    };

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
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isWorkHeroToggled ? "#ffffff" : "#000000",
            borderColor: isWorkHeroToggled ? "#000000" : "#ffffff",
            boxShadow: isWorkHeroToggled
              ? "0 4px 20px rgba(0,0,0,0.06)"
              : "0 8px 30px rgba(0,0,0,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
          }}
          onClick={() => handleHeroToggle(setIsWorkHeroToggled)}
          className={cn(
            "wireframe-border rounded-lg p-6 md:p-12 mb-0 relative overflow-hidden group border-4 cursor-pointer",
            "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isWorkHeroToggled ? (
                <motion.h1
                  key="work-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-8xl md:text-9xl text-black"
                >
                  WORK
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="work-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-8xl md:text-9xl text-white"
                >
                  WORK
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <InteractiveDivider className="my-12" />

        {/* ── Engine Selector ── */}
        <div className="grid grid-cols-2 gap-4 mb-0">
          {([1, 2] as const).map((engine) => {
            const active = activeWorkEngine === engine;
            return (
              <button
                key={engine}
                onClick={() => setActiveWorkEngine(engine)}
                className={cn(
                  "relative overflow-hidden wireframe-border border-4 rounded-lg p-5 md:p-7 text-left transition-all duration-300 group",
                  active
                    ? "bg-black border-black"
                    : "bg-card border-muted-foreground/30 hover:border-black/60"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  {engine === 2 && (
                    <span className="text-[10px] font-black tracking-widest uppercase bg-black text-white px-2 py-0.5 rounded-sm border border-white/20">
                      SOON
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-2xl md:text-3xl font-black tracking-tighter uppercase transition-colors",
                  active ? "text-white" : "text-foreground group-hover:text-black"
                )}>
                  {engine === 1 ? "ENGINE A" : "ENGINE B"}
                </p>
                {active && (
                  <motion.div
                    layoutId="engine-active-bar"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-white"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Engine Pages (slide below selector) ── */}
        <div className="overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {activeWorkEngine === 1 ? (
              <motion.div
                key="engine-1"
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, x: -60 }}
                variants={{
                  hidden: { opacity: 0, x: -60 },
                  show: {
                    opacity: 1,
                    x: 0,
                    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.06 }
                  }
                }}
              >
                {/* Key Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 mb-12 mt-12">
                  <motion.div
                    variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                    whileHover={{ scale: 1.02, translateY: -4 }}
                    whileTap={{ scale: 0.98 }}
                    className="group split-card bg-gradient-to-br from-card to-card/80 hover:from-primary/5 hover:to-primary/10 border-2 border-muted-foreground/20 hover:border-primary/30 p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:shadow-primary/10"
                    data-testid="card-work-ads-watched"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Eye className="w-8 h-8 text-primary group-hover:text-primary/80 transition-colors" />
                      <TechnicalLabel text="ADS WATCHED" className="text-muted-foreground text-xs" />
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-foreground mb-2 group-hover:text-primary/90 transition-colors" data-testid="text-work-ads-watched">
                      {dashboardStats?.adsWatchedToday || todayAdViews?.count || 0}
                    </p>
                  </motion.div>

                  <motion.div
                    variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                    whileHover={{ scale: 1.02, translateY: -4 }}
                    whileTap={{ scale: 0.98 }}
                    className="group split-card bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 border-2 border-primary/20 hover:border-primary/40 p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:shadow-primary/20"
                    data-testid="card-work-remaining-ads"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Target className="w-8 h-8 text-primary group-hover:text-primary/80 transition-colors" />
                      <TechnicalLabel text="REMAINING ADS" className="text-muted-foreground text-xs" />
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-primary mb-2 group-hover:text-primary/90 transition-colors" data-testid="text-work-remaining-ads">
                      {remainingAds}
                    </p>
                  </motion.div>

                  <motion.div
                    variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                    whileHover={{ scale: 1.02, translateY: -4 }}
                    whileTap={{ scale: 0.98 }}
                    className="group split-card bg-gradient-to-br from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border-2 border-muted-foreground/20 hover:border-muted-foreground/40 p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:shadow-muted-foreground/10"
                    data-testid="card-work-today-earnings"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <DollarSign className="w-8 h-8 text-foreground/80 group-hover:text-foreground transition-colors" />
                      <TechnicalLabel text="TODAY'S EARNINGS" className="text-muted-foreground text-xs" />
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-foreground mb-2 group-hover:text-foreground/90 transition-colors" data-testid="text-work-today-earnings">
                      {formatCurrency(dashboardStats?.todayEarnings || (completedAds.size * 2.5))}
                    </p>
                  </motion.div>

                  <motion.div
                    variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                    whileHover={{ scale: 1.02, translateY: -4 }}
                    whileTap={{ scale: 0.98 }}
                    className="group split-card bg-gradient-to-br from-card to-card/80 hover:from-card/90 hover:to-card/70 border-2 border-muted-foreground/20 hover:border-muted-foreground/40 p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:shadow-muted-foreground/10"
                    data-testid="card-work-daily-goal"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Award className="w-8 h-8 text-primary group-hover:text-primary/80 transition-colors" />
                      <TechnicalLabel text="DAILY GOAL" className="text-muted-foreground text-xs" />
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-primary mb-3 group-hover:text-primary/90 transition-colors" data-testid="text-work-daily-goal">
                      {Math.round((adsWatchedTodayCount / adsDailyLimit) * 100)}%
                    </p>
                    <Progress value={Math.round((adsWatchedTodayCount / adsDailyLimit) * 100)} className="progress-enhanced h-2 mb-3" />
                  </motion.div>
                </div>

                <InteractiveDivider className="my-12" />

                {/* Video Player */}
                <motion.div
                  variants={{ hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                  className="w-full"
                >
                  <Tabs value={activeWorkTab} onValueChange={setActiveWorkTab} className="w-full">
                    {WORK_TABS.map(tab => (
                      <TabsContent key={tab.id} value={tab.id} className="mt-0">
                        <div className="space-y-4">
                          {tab.id === activeWorkTab && (
                            <EnhancedVideoPlayer
                              tab={currentVideoTab}
                              isActive={true}
                              onComplete={handleVideoComplete}
                              autoplay={false}
                              isMobile={isMobile}
                            />
                          )}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </motion.div>
              </motion.div>
            ) : !DEV_UNLOCK_RANK_GATES && (engineBUserRankTier === "E-Rank" || engineBUserRankTier === "D-Rank") ? (
              // THORX v3 (spec F.10): Engine B locked-state UI for below C-Rank.
              <motion.div
                key="engine-2-locked"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="mt-12 max-w-xl mx-auto py-12 px-6 text-center"
                data-testid="panel-engine-b-locked"
              >
                <Lock className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
                <TechnicalLabel text="ENGINE B — UNLOCKS AT C-RANK" className="text-muted-foreground text-xs mb-3" />
                <p className="text-sm text-muted-foreground mb-6">
                  Premium CPA offers with higher payouts (+25 PS per completion).
                  You are {engineBUserRankTier} ({engineBPerformanceScore.toLocaleString()} PS).
                  Need {engineBPsToUnlock.toLocaleString()} more PS to unlock.
                </p>
                <Progress value={engineBUnlockPct} className="h-2 mb-6" />
                <Button
                  onClick={() => setActiveWorkEngine(1)}
                  className="bg-primary text-black hover:bg-primary/90 font-black uppercase tracking-tighter"
                  data-testid="button-engine-b-locked-cta"
                >
                  Keep earning with Engine A to reach C-Rank
                </Button>
              </motion.div>
            ) : (
              /* ── Engine B — CPA Tasks Dashboard ─────────────────────────── */
              <motion.div
                key="engine-2"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="mt-8 space-y-6"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <TechnicalLabel text="ENGINE B — CPA TASKS" className="text-xs mb-1" />
                    <p className="text-sm text-muted-foreground">Complete offers &amp; earn PKR + <span className="font-bold text-foreground">+25 PS</span> per task</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-2xl font-black tracking-tighter">{cpaCompletedCount}</p>
                  </div>
                </div>

                {/* Active Task Modal */}
                <AnimatePresence>
                  {engineBActiveTask && engineBPhase !== "idle" && (
                    <motion.div
                      initial={{ opacity: 0, y: -16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -16 }}
                      className="wireframe-border rounded-lg p-6 border-4 border-foreground bg-background space-y-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <TechnicalLabel text={`ACTIVE TASK — ${engineBActiveTask.difficulty?.toUpperCase() || "STANDARD"}`} className="text-xs mb-1" />
                          <h3 className="font-black text-lg tracking-tight">{engineBActiveTask.title}</h3>
                          {engineBActiveTask.instructions && (
                            <p className="text-sm text-muted-foreground mt-1">{engineBActiveTask.instructions}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEngineBActiveTask(null); setEngineBPhase("idle"); setEngineBCodeError(""); }}
                          className="shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      {engineBPhase === "timer" && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full border-4 border-primary flex items-center justify-center shrink-0">
                              <span className="font-black text-xl text-primary">{engineBTimer}</span>
                            </div>
                            <div>
                              <p className="font-bold text-sm">Complete the task on the opened page</p>
                              <p className="text-xs text-muted-foreground">Verification unlocks in {engineBTimer} second{engineBTimer !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                          <Progress value={((10 - engineBTimer) / 10) * 100} className="h-2" />
                        </div>
                      )}

                      {engineBPhase === "verify" && (
                        <div className="space-y-3">
                           <p className="text-sm font-medium">
                             {engineBActiveTask.secretCode
                               ? "Enter the secret code from the task page to verify completion:"
                               : "This task has no secret code. Confirm when you are ready to finish:"}
                           </p>
                          <div className="flex gap-2">
                            <Input
                               placeholder={engineBActiveTask.secretCode ? "Enter secret code…" : "No code required"}
                              value={engineBCode}
                              onChange={e => { setEngineBCode(e.target.value); setEngineBCodeError(""); }}
                               className="font-mono uppercase tracking-widest"
                               disabled={!engineBActiveTask.secretCode}
                               onKeyDown={e => {
                                 const codeRequired = Boolean(engineBActiveTask.secretCode);
                                 if (e.key === "Enter" && (!codeRequired || engineBCode.trim())) {
                                   engineBVerifyMutation.mutate({ taskId: engineBActiveTask.id, code: engineBCode.trim() });
                                 }
                               }}
                            />
                            <Button
                              onClick={() => engineBVerifyMutation.mutate({ taskId: engineBActiveTask.id, code: engineBCode.trim() })}
                               disabled={
                                 (Boolean(engineBActiveTask.secretCode) && !engineBCode.trim()) ||
                                 engineBVerifyMutation.isPending
                               }
                              className="bg-primary text-black font-black shrink-0"
                            >
                              {engineBVerifyMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            </Button>
                          </div>
                          {engineBCodeError && <p className="text-xs text-destructive">{engineBCodeError}</p>}
                           {!engineBActiveTask.secretCode && (
                             <p className="text-xs text-muted-foreground">No code required — click the check button to submit.</p>
                           )}
                        </div>
                      )}

                      {engineBPhase === "done" && (
                        <div className="flex items-center gap-3 py-2">
                          <CheckCircle2 className="w-8 h-8 text-primary shrink-0" />
                          <div>
                            <p className="font-black text-primary">Task Verified!</p>
                            <p className="text-xs text-muted-foreground">+25 PS &amp; PKR added to your balance.</p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Task List */}
                {!tasksWithRecords ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
                  </div>
                ) : tasksWithRecords.length === 0 ? (
                  <div className="wireframe-border rounded-lg p-12 text-center border-2 border-dashed">
                    <Briefcase className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <TechnicalLabel text="NO TASKS AVAILABLE" className="text-muted-foreground text-xs mb-2" />
                    <p className="text-sm text-muted-foreground">New CPA tasks will appear here when the admin publishes them.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasksWithRecords.map((task: any) => {
                      const isCompleted = task.record?.status === "completed";
                      const isActive = engineBActiveTask?.id === task.id && engineBPhase !== "idle";
                      const pkrReward = parseFloat(task.grossPkrPerCompletion || "0") * 0.60;
                      return (
                        <motion.div
                          key={task.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "wireframe-border rounded-lg p-5 border-2 flex items-start gap-4 transition-all",
                            isCompleted && "opacity-50",
                            isActive && "border-primary"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-foreground text-background rounded">
                                {task.difficulty || "Standard"}
                              </span>
                              {isCompleted && (
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-primary text-black rounded">
                                  ✓ Done
                                </span>
                              )}
                            </div>
                            <h4 className="font-black tracking-tight text-base leading-tight">{task.title}</h4>
                            {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-xs font-bold">
                                ~{pkrReward.toFixed(2)} PKR
                              </span>
                              <span className="text-xs text-muted-foreground">+25 PS</span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {isCompleted ? (
                              <CheckCircle2 className="w-6 h-6 text-primary" />
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEngineBActiveTask(task);
                                  setEngineBPhase("idle");
                                  setEngineBCodeError("");
                                  if (task.actionUrl) window.open(task.actionUrl, "_blank");
                                  engineBClickMutation.mutate(task.id);
                                }}
                                disabled={engineBClickMutation.isPending && engineBActiveTask?.id === task.id}
                                className="bg-primary text-black font-black text-xs uppercase tracking-wider"
                              >
                                {engineBClickMutation.isPending && engineBActiveTask?.id === task.id
                                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                                  : "Start"}
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  // Enhanced Referrals Section - Dashboard Style
  function renderReferralsSection() {
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
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isReferralsHeroToggled ? "#ffffff" : "#000000",
            borderColor: isReferralsHeroToggled ? "#000000" : "#ffffff",
            boxShadow: isReferralsHeroToggled
              ? "0 4px 20px rgba(0,0,0,0.06)"
              : "0 8px 30px rgba(0,0,0,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
          }}
          onClick={() => handleHeroToggle(setIsReferralsHeroToggled)}
          className={cn(
            "wireframe-border rounded-lg p-6 md:p-12 mb-0 relative overflow-hidden group border-4 cursor-pointer",
            "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isReferralsHeroToggled ? (
                <motion.h1
                  key="referrals-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-5xl md:text-8xl text-black"
                >
                  REFERRALS
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="referrals-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-5xl md:text-8xl text-white"
                >
                  REFERRALS
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <InteractiveDivider className="my-12" />

        {/* Key Metrics Cards - Dashboard Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 mb-12">
          {/* Total Referrals */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 15 },
              animate: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.02, translateY: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group split-card bg-gradient-to-br from-card to-card/80 hover:from-primary/5 hover:to-primary/10 border-2 border-muted-foreground/20 hover:border-primary/30 p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:shadow-primary/10"
            data-testid="card-total-referrals"
          >
            <div className="flex items-start justify-between mb-3">
              <Users className="w-8 h-8 text-primary group-hover:text-primary/80 transition-colors" />
              <TechnicalLabel text="TOTAL REFERRALS" className="text-muted-foreground text-xs" />
            </div>
            <p className="text-2xl md:text-3xl font-black text-foreground mb-2 group-hover:text-primary/90 transition-colors" data-testid="text-referrals-count">{referralsData?.stats.count || 0}</p>
          </motion.div>

          {/* Referral Earnings */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 15 },
              animate: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.02, translateY: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group split-card bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 border-2 border-primary/20 hover:border-primary/40 p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:shadow-primary/20"
            data-testid="card-referral-earnings"
          >
            <div className="flex items-start justify-between mb-3">
              <DollarSign className="w-8 h-8 text-primary group-hover:text-primary/80 transition-colors" />
              <TechnicalLabel text="REFERRAL EARNINGS" className="text-muted-foreground text-xs" />
            </div>
            <p className="text-2xl md:text-3xl font-black text-primary mb-2 group-hover:text-primary/90 transition-colors" data-testid="text-referral-earnings">{formatCurrency(referralsData?.stats.totalEarned || '0.00')}</p>
          </motion.div>

          {/* Direct Referrals */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 15 },
              animate: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.02, translateY: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group split-card bg-gradient-to-br from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border-2 border-muted-foreground/20 hover:border-muted-foreground/40 p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:shadow-muted-foreground/10"
            data-testid="card-commission-rate"
          >
            <div className="flex items-start justify-between mb-3">
              <UserCheck className="w-8 h-8 text-foreground/80 group-hover:text-foreground transition-colors" />
              <TechnicalLabel text="Direct Referrals" className="text-muted-foreground text-xs" />
            </div>
            <p className="text-2xl md:text-3xl font-black text-foreground mb-2 group-hover:text-foreground/90 transition-colors" data-testid="text-commission-rate">{referralLevel1Count}</p>
          </motion.div>

          {/* Commission Rate */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 15 },
              animate: { opacity: 1, y: 0 }
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.02, translateY: -4 }}
            whileTap={{ scale: 0.98 }}
            className="group split-card bg-gradient-to-br from-card to-card/80 hover:from-card/90 hover:to-card/70 border-2 border-muted-foreground/20 hover:border-muted-foreground/40 p-6 text-left transition-all duration-300 cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:shadow-muted-foreground/10"
            data-testid="card-network-potential"
          >
            <div className="flex items-start justify-between mb-3">
              <Network className="w-8 h-8 text-primary group-hover:text-primary/80 transition-colors" />
              <TechnicalLabel text="Your Commission Rate" className="text-muted-foreground text-xs" />
            </div>
            <p className="text-2xl md:text-3xl font-black text-primary mb-2 group-hover:text-primary/90 transition-colors" data-testid="text-network-potential">
              {((WITHDRAWAL_FEE_PERCENT * REFERRAL_FEE_SHARE_PERCENT) / 100).toFixed(1)}%
            </p>
          </motion.div>
        </div>

        <InteractiveDivider className="my-12" />

        {/* Middle Section - Invitation Area */}
        <motion.div
          variants={{
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 }
          }}
          className="grid grid-cols-1 gap-4 md:gap-8 mb-6 md:mb-8"
        >
          {/* Invitation Area */}
          <div className="wireframe-section p-0 bg-transparent border-none shadow-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-stretch pt-2">
              {/* Left Column: Referral Code */}
              <div className="flex flex-col">
                <div className="bg-white border-4 border-black p-5 md:p-10 relative overflow-hidden group h-full flex flex-col justify-center transition-all duration-300">
                  <div className="relative z-10 w-full">
                    <div className="flex flex-col gap-6 md:gap-8">
                      <div className="text-center md:text-left">
                        <p className="text-[10px] md:text-[11px] font-black uppercase text-black/40 mb-2 tracking-[0.2em]">
                          {showReferralLink ? "YOUR NETWORK LINK" : "YOUR REFERRAL CODE"}
                        </p>
                        <div className="text-xl md:text-3xl font-black text-black tracking-tight break-all font-mono leading-none">
                          {showReferralLink
                            ? `${window.location.origin}/?ref=${displayUser?.referralCode}`
                            : displayUser?.referralCode
                          }
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <Button
                          onClick={async () => {
                            const textToCopy = showReferralLink
                              ? `${window.location.origin}/?ref=${displayUser?.referralCode}`
                              : displayUser?.referralCode;
                            try {
                              await navigator.clipboard.writeText(textToCopy);
                              toast({ title: "Copied!", description: showReferralLink ? "Referral link copied to clipboard." : "Referral code copied to clipboard." });
                            } catch (error) {
                              toast({ title: "Copy Failed", description: "Could not copy. Please try again.", variant: "destructive" });
                            }
                          }}
                          className="w-full bg-primary hover:bg-black hover:text-white text-black h-12 md:h-14 text-sm font-black border-4 border-black transition-all shadow-[4px_4px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1"
                          data-testid="button-copy-referral"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          COPY
                        </Button>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            onClick={() => setShowReferralLink(!showReferralLink)}
                            className="w-full border-4 border-black text-black bg-white hover:bg-black hover:text-white h-12 md:h-14 font-black text-[10px] transition-all shadow-[4px_4px_0px_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                          >
                            <Link2 className="w-4 h-4 mr-1" />
                            {showReferralLink ? "CODE" : "LINK"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const shareUrl = `${window.location.origin}/?ref=${displayUser?.referralCode}`;
                              const message = `I’m earning real money by watching video ads and building a team on THORX.\n\nUse my referral link below to join and start earning:\n${shareUrl}`;
                              window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="w-full border-4 border-black text-black bg-white hover:bg-black hover:text-white h-12 md:h-14 font-black text-[10px] transition-all shadow-[4px_4px_0px_#000] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            SHARE
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Referral Commission */}
              <div className="flex flex-col">
                <div className="bg-white border-4 border-black p-5 md:p-10 relative overflow-hidden group h-full flex flex-col justify-center transition-all duration-300">
                  <div className="space-y-6 md:space-y-8 relative z-10 w-full px-1">
                    {/* Withdrawal fee breakdown */}
                    <div className="flex justify-between items-end border-b-4 border-black pb-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] md:text-[11px] font-black uppercase text-black tracking-[0.2em] mb-1">Withdrawal Fee</span>
                        <span className="text-base md:text-lg font-black text-black uppercase leading-tight">Paid by<br />Your Referral</span>
                      </div>
                      <span className="text-4xl md:text-5xl font-black text-black italic tracking-tighter leading-none">15%</span>
                    </div>

                    {/* Your commission share */}
                    <div className="flex justify-between items-end pb-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] md:text-[11px] font-black uppercase text-black tracking-[0.2em] mb-1">Your Share</span>
                        <span className="text-base md:text-lg font-black text-black uppercase leading-tight">Referral<br />Commission</span>
                      </div>
                      <span className="text-4xl md:text-5xl font-black text-black italic tracking-tighter leading-none">~50%</span>
                    </div>
                  </div>

                  <div className="mt-8 md:mt-10 pt-4 border-t-2 border-black/10 relative z-10">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em] text-center">
                      CREDITED UPON YOUR REFERRAL'S PAYOUT
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Divider Line instead of Header */}
        <div className="mt-20 px-4 md:px-0 mb-12">
          <InteractiveDivider className="mb-12" />

          {/* HIERARCHICAL TREE LAYOUT */}
          <div className="w-full">
            {isReferralError ? (
              <div className="bg-red-50 border-2 border-red-500 p-8 rounded-lg text-center">
                <p className="font-bold text-red-600 mb-2">Failed to load network data</p>
                <p className="text-sm text-red-500">{(referralError as Error)?.message || "Unknown error"}</p>
              </div>
            ) : isReferralLoading ? (
              <div className="flex justify-center items-center py-12 p-8 rounded-lg">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-8 h-8 border-4 border-black border-t-transparent rounded-full"
                />
              </div>
            ) : (displayUser ? (
              <div className="bg-white border-2 border-black rounded-xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.05)] relative min-h-[600px]">
                {/* Zoom Controls Overlay */}
                <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2">
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="w-10 h-10 bg-white border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-black font-black"
                    onClick={() => setReferralZoom(prev => Math.min(prev + 0.1, 2))}
                    title="Zoom In"
                  >
                    <Plus size={18} />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="w-10 h-10 bg-white border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-black font-black"
                    onClick={() => setReferralZoom(prev => Math.max(prev - 0.1, 0.3))}
                    title="Zoom Out"
                  >
                    <Minus size={18} />
                  </Button>
                </div>

                <div className="w-full h-full overflow-auto scrollbar-hide p-8 cursor-grab active:cursor-grabbing">
                  <div 
                    style={{ 
                      transform: `scale(${referralZoom})`,
                      transformOrigin: 'top center',
                      transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    className="w-full h-full min-w-max min-h-[500px]"
                  >
                    <ReferralTree
                      currentUser={{
                        id: displayUser.id,
                        firstName: displayUser.firstName,
                        lastName: displayUser.lastName,
                        name: displayUser.name,
                        userRankTier: displayUser.userRankTier,
                        avatar: displayUser.avatar,
                        profilePicture: displayUser.profilePicture
                      }}
                      referrals={referralLeaderboard || []}
                    />
                  </div>
                </div>
              </div>
            ) : null)}
          </div>
        </div>

        {/* Commission History Section */}
        {
          commissionsData?.commissions && commissionsData.commissions.length > 0 && (
            <motion.div
              variants={{
                initial: { opacity: 0, scale: 0.98 },
                animate: { opacity: 1, scale: 1 }
              }}
              className="mt-6 md:mt-8 wireframe-section p-4 md:p-6"
            >
              <div className="border-b-2 border-black pb-3 md:pb-4 mb-4 md:mb-6">
                <TechnicalLabel text="COMMISSION HISTORY" className="text-foreground text-sm md:text-lg font-black" />
              </div>

              <div className="grid gap-3 md:gap-4">
                {commissionsData.commissions.map((commission: any, index: number) => (
                  <motion.div
                    key={commission.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="wireframe-section p-3 md:p-4 bg-white/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-black text-sm md:text-base">LEVEL {commission.level} COMMISSION</div>
                        <div className="text-xs text-muted-foreground">{new Date(commission.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-lg text-primary">
                          +{Math.round(parseFloat(commission.amount) * CONVERSION_RATE).toLocaleString()} TX-Points
                        </div>
                        <div className="text-[10px] text-muted-foreground">≈ Rs.{parseFloat(commission.amount).toFixed(4)} PKR</div>
                        <div className={`text-[10px] font-black uppercase px-2 py-0.5 border inline-block mt-1 ${commission.status === 'paid' ? 'bg-green-100 border-green-500 text-green-700' :
                          commission.status === 'pending' ? 'bg-yellow-100 border-yellow-500 text-yellow-700' :
                            'bg-red-100 border-red-500 text-red-700'
                          }`}>
                          {commission.status}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )
        }
      </motion.div >
    );
  }

  // Progressive Payout Section - Dashboard Style
  function renderPayoutSection() {
    // Static transaction history data
    const historyItems = withdrawalsHistory || [];

    // Numeric keypad input handling
    const handleNumberInput = (num: string) => {
      if (withdrawAmount.length < 8) {
        setWithdrawAmount(prev => prev + num);
      }
    };

    const handleClear = () => {
      setWithdrawAmount("");
    };

    const handleBackspace = () => {
      setWithdrawAmount(prev => prev.slice(0, -1));
    };

    // Navigation handlers
    const handleNext = () => {
      if (canProceed()) {
        if (currentStep < 3) setCurrentStep(prev => prev + 1);
        else handleSubmit();
      }
    };

    const handleBack = () => {
      if (currentStep > 1) {
        setCurrentStep(currentStep - 1);
      }
    };

    // Audit finding 1-J: Zod schema for payment details — inline validation
    // before the network call gives the user immediate field-level feedback.
    const paymentDetailsSchema = z.object({
      name: z.string().min(2, "Account name must be at least 2 characters").max(100, "Name too long"),
      number: z.string()
        .min(10, "Account/mobile number must be at least 10 digits")
        .max(20, "Number too long")
        .regex(/^[0-9+\-\s]+$/, "Only digits, spaces, + and - are allowed"),
      email: z.string().email("Enter a valid email address"),
      iban: z.string().optional(),
    });

    const handleSubmit = async () => {
      // Validate payment details before hitting the network
      const validation = paymentDetailsSchema.safeParse(paymentDetails);
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast({
          title: "Invalid Payment Details",
          description: firstError?.message || "Please check your payment details.",
          variant: "destructive",
        });
        return;
      }

      setIsProcessing(true);
      try {
        const payload = {
          amount: withdrawAmount,
          method: selectedMethod,
          accountName: paymentDetails.name,
          accountNumber: paymentDetails.number,
          accountDetails: {
            email: paymentDetails.email,
            iban: paymentDetails.iban
          }
        };

        const response = await apiRequest("POST", "/api/withdrawals", payload, { "x-idempotency-key": withdrawalKey });

        if (response.ok) {
          toast({
            title: "Payout Request Submitted!",
            description: withdrawalPreview
              ? `Your withdrawal of ${formatCurrency(withdrawAmount)} PTS (Est. Rs. ${withdrawalPreview.userNetPkr.toFixed(2)} net) has been submitted for processing.`
              : `Your withdrawal of ${formatCurrency(withdrawAmount)} PTS has been submitted for processing.`,
          });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.user });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.withdrawals });
          queryClient.invalidateQueries({ queryKey: ["/api/withdrawals/preview"] });
          // Reset form
          setCurrentStep(1);
          setWithdrawAmount("");
          setSelectedMethod("");
          setPaymentDetails({ name: "", number: "", email: "", iban: "" });
          setWithdrawalKey(crypto.randomUUID()); // rotate idempotency key after success
        } else {
          const error = await response.json();
          toast({
            title: "Submission Failed",
            description: error.message || "Could not process withdrawal request.",
            variant: "destructive"
          });
        }
      } catch (_error) {
        toast({
          title: "Error",
          description: "An unexpected error occurred.",
          variant: "destructive"
        });
      } finally {
        setIsProcessing(false);
      }
    };

    // Payment method data
    const paymentMethods = [
      {
        id: 'jazzcash',
        name: 'JAZZ CASH',
        LogoComponent: JazzCashLogo,
        description: 'Mobile Wallet Transfer',
        color: 'bg-gradient-to-r from-red-600 to-red-700',
        processing: '2-4 hours'
      },
      {
        id: 'easypaisa',
        name: 'EASY PAISA',
        LogoComponent: EasyPaisaLogo,
        description: 'Digital Wallet Service',
        color: 'bg-gradient-to-r from-green-600 to-green-700',
        processing: '2-4 hours'
      },
    ];

    // Get current step button states
    const canProceed = () => {
      if (isConfigLoading) return false;
      if (currentStep === 1) return withdrawAmount && parseInt(withdrawAmount, 10) > 0;
      if (currentStep === 2) return selectedMethod && !!withdrawalPreview && !withdrawalPreviewError;
      if (currentStep === 3) {
        return paymentDetails.name.trim() && paymentDetails.number.trim() && paymentDetails.email.trim() && !!withdrawalPreview && step3MinDisplayElapsed;
      }
      return false;
    };

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
        {/* Hero Section - Dashboard Style */}
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isPayoutHeroToggled ? "#ffffff" : "#000000",
            borderColor: isPayoutHeroToggled ? "#000000" : "#ffffff",
            boxShadow: isPayoutHeroToggled
              ? "0 4px 20px rgba(0,0,0,0.06)"
              : "0 8px 30px rgba(0,0,0,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
          }}
          onClick={() => handleHeroToggle(setIsPayoutHeroToggled)}
          className={cn(
            "wireframe-border rounded-lg p-6 md:p-12 mb-0 relative overflow-hidden group border-4 cursor-pointer",
            "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isPayoutHeroToggled ? (
                <motion.h1
                  key="payout-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-7xl md:text-9xl text-black"
                >
                  PAYOUT
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="payout-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-7xl md:text-9xl text-white"
                >
                  PAYOUT
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <InteractiveDivider className="my-12" />

        {/* Main Content Area - Single Column Layout for Mobile, Two Column for Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
          {/* Main Payout Interface - Full Width on Mobile, 2/3 width on Desktop */}
          <motion.div
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 }
            }}
            className="lg:col-span-2"
          >
            <div className="wireframe-border bg-gradient-to-br from-background to-muted/20 p-6 md:p-12 relative shadow-[12px_12px_0px_#000]">
              {/* Current Balance Display */}
              <div className="text-center mb-4 md:mb-6 lg:mb-8">
              </div>

              {/* Step Content Container - Mobile Optimized */}
              <div className="min-h-[300px] md:min-h-[400px] flex flex-col justify-center overflow-hidden">
                <AnimatePresence mode="wait">
                  {/* Step 1: Timeframe Selector (Phase 9.1) — replaced keypad */}
                  {currentStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="w-full max-w-sm md:max-w-lg mx-auto px-2 md:px-0"
                    >
                      <div className="text-center mb-4 md:mb-6">
                        <div className="text-[10px] md:text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">
                          Select Earning Period
                        </div>
                        <div className="text-xs text-muted-foreground/60 font-medium">
                          Choose which period's TX-Points to withdraw
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        {TIMEFRAME_OPTIONS.map(({ key, label }) => {
                          const data = timeframeBreakdown?.[key as keyof typeof timeframeBreakdown];
                          const pts = data?.points ?? 0;
                          const isSelected = selectedTimeframe === key;
                          const isEmpty = pts === 0;
                          return (
                            <motion.button
                              key={key}
                              whileHover={isEmpty ? {} : { scale: 1.01, x: 4 }}
                              whileTap={isEmpty ? {} : { scale: 0.99 }}
                              disabled={isEmpty}
                              onClick={() => {
                                if (!isEmpty) {
                                  setSelectedTimeframe(key);
                                  setWithdrawAmount(String(pts));
                                }
                              }}
                              className={`w-full flex items-center justify-between p-3 md:p-4 border-2 rounded-xl transition-all duration-200 ${
                                isSelected
                                  ? "border-foreground bg-foreground text-background"
                                  : isEmpty
                                  ? "border-muted-foreground/20 bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50"
                                  : "border-black bg-background hover:shadow-[4px_4px_0px_#000]"
                              }`}
                            >
                              <div className="text-left">
                                <div className={`text-xs font-black uppercase tracking-widest ${isSelected ? "text-background" : "text-foreground"}`}>{label}</div>
                                <div className={`text-[10px] font-bold mt-0.5 ${isSelected ? "text-background/70" : "text-muted-foreground"}`}>
                                  {pts > 0 ? `${pts.toLocaleString()} TX-Points` : "No points in this period"}
                                </div>
                              </div>
                              {isSelected && <span className="text-lg">✓</span>}
                              {!isSelected && pts > 0 && (
                                <span className="text-xs font-black text-muted-foreground">→</span>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>

                      {selectedTimeframe && withdrawAmount && (
                        <div className="p-3 bg-muted/30 rounded-xl text-center border border-muted">
                          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Selected</div>
                          <div className="text-2xl font-black text-foreground">{parseInt(withdrawAmount).toLocaleString()} <span className="text-base text-muted-foreground">PTS</span></div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Step 2: Payment Method Selection - Mobile Optimized */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="w-full max-w-lg md:max-w-2xl mx-auto px-2 md:px-0"
                    >
                      <div className="text-center mb-4 md:mb-8">
                        <div className="text-lg md:text-xl lg:text-2xl font-black text-primary mb-2">
                          Withdrawing {formatCurrency(withdrawAmount)} PTS
                        </div>
                        {isPreviewLoading && (
                          <div className="flex justify-center"><Skeleton className="h-3 w-48 rounded mt-1" /></div>
                        )}
                        {withdrawalPreviewError && (
                          <div className="text-xs font-bold text-red-500 uppercase tracking-widest">
                            {(withdrawalPreviewError as Error).message}
                          </div>
                        )}
                        {withdrawalPreview && (
                          <div className="text-sm md:text-base font-bold text-foreground/70">
                            Estimated Final Payout: ≈ Rs. {withdrawalPreview.exactPkr.toFixed(2)} gross · Rs. {withdrawalPreview.userNetPkr.toFixed(2)} net (after {withdrawalPreview.feePercent ?? 15}% fee)
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 md:gap-4 mb-4 md:mb-6">
                        {paymentMethods.map((method) => {
                          const LogoComponent = method.LogoComponent;
                          const isSelected = selectedMethod === method.id;

                          return (
                            <motion.button
                              key={method.id}
                              whileHover={{ scale: 1.01, x: 5 }}
                              whileTap={{ scale: 0.99 }}
                              initial={false}
                              animate={{
                                backgroundColor: isSelected ? 'var(--primary)' : 'var(--background)',
                                borderColor: isSelected ? 'var(--primary)' : 'rgb(0, 0, 0)',
                                boxShadow: isSelected ? '4px 4px 0px #000' : '0px 0px 0px #000'
                              }}
                              transition={{ duration: 0.25, ease: "easeInOut" }}
                              onClick={() => setSelectedMethod(method.id)}
                              className={`payment-method-selection-card flex items-center p-3 md:p-4 lg:p-6 border-2 w-full transition-shadow duration-300 ${isSelected ? 'selected' : 'hover:shadow-[4px_4px_0px_#000]'}`}
                            >
                              <div className="mr-3 md:mr-4 lg:mr-6">
                                <LogoComponent className="w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20" />
                              </div>
                              <div className="flex-1 text-left">
                                <TechnicalLabel
                                  text={method.name}
                                  className={`font-black text-xs md:text-sm ${isSelected ? 'text-black' : 'text-foreground'
                                    }`}
                                />
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Payment Details Input - Mobile Optimized */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="w-full max-w-sm md:max-w-lg mx-auto px-2 md:px-0"
                    >
                      <div className="text-center mb-4 md:mb-8">
                        {/* Header Removed */}
                      </div>

                      <div className="space-y-4 md:space-y-6">
                        <div className="space-y-4">
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                          >
                            <TechnicalLabel text="Full Name" className="text-foreground mb-2 md:mb-3 text-xs md:text-sm font-black" />
                            <div className="relative">
                              <Input
                                type="text"
                                value={paymentDetails.name}
                                onChange={(e) => setPaymentDetails(prev => ({ ...prev, name: e.target.value }))}
                                className="industrial-input h-12 md:h-14 text-sm md:text-base border-2 border-black focus:border-primary transition-colors"
                              />
                              {!paymentDetails.name && (
                                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                  <AnimatedPlaceholder examples={['John Doe', 'Ahmed Khan', 'Sarah Wilson']} />
                                </div>
                              )}
                            </div>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                          >
                            <TechnicalLabel text="Phone/WhatsApp" className="text-foreground mb-2 md:mb-3 text-xs md:text-sm font-black" />
                            <div className="relative">
                              <Input
                                type="text"
                                value={paymentDetails.number}
                                onChange={(e) => setPaymentDetails(prev => ({ ...prev, number: e.target.value }))}
                                className="industrial-input h-12 md:h-14 text-sm md:text-base border-2 border-black focus:border-primary transition-colors"
                              />
                              {!paymentDetails.number && (
                                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                  <AnimatedPlaceholder examples={['03001234567', '03217654321', '03450000000']} />
                                </div>
                              )}
                            </div>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                          >
                            <TechnicalLabel text="Email" className="text-foreground mb-2 md:mb-3 text-xs md:text-sm font-black" />
                            <div className="relative">
                              <Input
                                type="email"
                                value={paymentDetails.email}
                                onChange={(e) => setPaymentDetails(prev => ({ ...prev, email: e.target.value }))}
                                className="industrial-input h-12 md:h-14 text-sm md:text-base border-2 border-black focus:border-primary transition-colors"
                              />
                              {!paymentDetails.email && (
                                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                  <AnimatedPlaceholder examples={['user@example.com', 'support@thorx.site', 'payout@thorx.site']} />
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </div>
                      </div>

                      {/* Payment Summary Area */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="mt-6 md:mt-8 pt-6 border-t-2 border-black/10"
                      >
                        <TechnicalLabel text="PAYOUT SUMMARY" className="mb-4 font-black text-xs md:text-sm" />
                        <div className="bg-muted/10 border-2 border-black p-4 md:p-6 space-y-3">
                          <div className="flex justify-between items-center text-sm md:text-base">
                            <span className="font-bold text-muted-foreground">Requested</span>
                            <span className="font-black text-foreground">{formatCurrency(withdrawAmount || "0")} PTS</span>
                          </div>

                          <div className="flex justify-between items-center text-sm md:text-base">
                            <span className="font-bold text-muted-foreground">Exact PKR Value</span>
                            <span className="font-black text-foreground">
                              {isPreviewLoading ? <Skeleton className="h-5 w-24 rounded inline-block" /> : withdrawalPreview ? `Rs. ${withdrawalPreview.exactPkr.toFixed(2)}` : "—"}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-sm md:text-base">
                            <span className="font-bold text-muted-foreground flex items-center gap-2">
                              Withdrawal Fee
                              <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded-sm">{withdrawalPreview?.feePercent ?? WITHDRAWAL_FEE_PERCENT}%</span>
                            </span>
                            <span className="font-black text-red-500">
                              {isPreviewLoading ? <Skeleton className="h-5 w-20 rounded inline-block" /> : withdrawalPreview ? `-Rs. ${withdrawalPreview.platformFee.toFixed(2)}` : "—"}
                            </span>
                          </div>

                          {withdrawalPreview?.referrerName && (
                            <>
                              <div className="my-2 border-t border-dashed border-black/20" />
                              <div className="flex justify-between items-center text-xs md:text-sm">
                                <span className="text-white font-bold opacity-60">Referrer Share (of fee above)</span>
                                <span className="text-white font-black">Rs. {withdrawalPreview.referralCommission.toFixed(2)}</span>
                              </div>
                            </>
                          )}

                          {withdrawalPreview?.sRankFastTrack && (
                            <div className="flex justify-between items-center text-xs md:text-sm">
                              <span className="text-amber-500 font-bold uppercase tracking-widest">S-Rank Fast Track</span>
                              <span className="text-amber-500 font-black">Instant Approval</span>
                            </div>
                          )}

                          {selectedMethod && paymentDetails.number && (
                            <div className="flex justify-between items-center text-xs md:text-sm">
                              <span className="font-bold text-muted-foreground">Payment Method</span>
                              <span className="font-black text-foreground">
                                {paymentMethods.find(m => m.id === selectedMethod)?.name || selectedMethod}
                                {" "}●●●● {paymentDetails.number.slice(-4)}
                              </span>
                            </div>
                          )}

                          <div className="my-2 border-t-2 border-black" />

                          <div className="flex justify-between items-center text-base md:text-lg lg:text-xl">
                            <span className="font-black text-amber-500 uppercase tracking-tighter">Net to Receive</span>
                            <span className="font-black text-primary bg-black px-3 py-2 text-2xl">
                              {withdrawalPreview ? `Rs. ${withdrawalPreview.userNetPkr.toFixed(2)}` : "—"}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Navigation Buttons - Mobile Optimized */}
              <div className="border-t-2 border-black pt-4 md:pt-6 mt-4 md:mt-8">
                <div className="flex justify-end items-center gap-3">
                  {currentStep === 1 && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleClear}
                      className="flex items-center justify-center px-6 md:px-10 py-3 md:py-4 border-4 border-black bg-background font-black text-sm md:text-base hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_#000] active:shadow-none"
                    >
                      CLEAR ALL
                    </motion.button>
                  )}

                  {currentStep > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setCurrentStep(prev => prev - 1)}
                      className="flex items-center justify-center gap-2 px-6 md:px-10 py-3 md:py-4 border-4 border-black font-black text-sm md:text-base hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_#000] active:shadow-none"
                    >
                      <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
                      BACK
                    </motion.button>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={!canProceed() || (currentStep === 3 && isProcessing)}
                    onClick={handleNext}
                    className={`flex items-center gap-2 px-6 md:px-10 py-3 md:py-4 border-4 border-black font-black text-sm md:text-base transition-all ${canProceed() && !(currentStep === 3 && isProcessing)
                      ? "bg-primary text-black shadow-[4px_4px_0px_#000] hover:translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0px_#000]"
                      : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                      }`}
                  >
                    {isProcessing && currentStep === 3 ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        PROCESSING...
                      </>
                    ) : (
                      <>
                        {currentStep === 3 ? "SUBMIT WITHDRAWAL" : "CONTINUE"}
                        <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Side Panel - Hidden on Mobile, Visible on Desktop */}
          <div className="hidden lg:block lg:col-span-1 space-y-8">
            {/* Professional History Button */}
            <motion.div
              variants={{
                initial: { opacity: 0, x: 20 },
                animate: { opacity: 1, x: 0 }
              }
              }
              className="wireframe-border p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] bg-white"
            >
              <TechnicalLabel text="TRANSACTION HISTORY" className="text-foreground font-black text-sm mb-4" />
              <Button
                onClick={() => setShowHistory(!showHistory)}
                variant="outline"
                className="w-full border-2 border-black text-foreground hover:bg-black hover:text-white py-3 font-black shadow-[0_4px_12px_rgba(0,0,0,0.05)] active:shadow-none transition-all"
              >
                <History className="w-4 h-4 mr-2" />
                {showHistory ? 'HIDE HISTORY' : 'VIEW HISTORY'}
              </Button>

              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 overflow-hidden border-t-2 border-black pt-4"
                  >
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {withdrawalsHistory && withdrawalsHistory.length > 0 ? (
                        withdrawalsHistory.slice(0, 5).map((item: any, idx: number) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="bg-muted/5 border border-black/5 p-3 group hover:border-black/20 transition-all border-l-4 border-l-black"
                          >
                            <div className="flex justify-between items-start mb-1">
                              <TechnicalLabel text={item.method} className="text-foreground font-black text-xs" />
                              <div className={cn(
                                "text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-tighter whitespace-nowrap",
                                item.status === 'pending' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" :
                                  item.status === 'completed' ? "bg-green-500/10 text-green-600 border border-green-500/20" :
                                    "bg-red-500/10 text-red-600 border border-red-500/20"
                              )}>
                                {item.status === 'pending' ? 'PENDING' : item.status === 'completed' ? 'TRANSFERRED' : 'REJECTED'}
                              </div>
                            </div>
                            <div className="text-sm font-black text-primary mb-0.5">{formatCurrency(item.amount)} PTS</div>
                            <div className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="text-center py-6">
                          <div className="text-xs text-muted-foreground italic">No payout history yet.</div>
                        </div>
                      )}
                    </div>
                    {withdrawalsHistory && withdrawalsHistory.length > 5 && (
                      <div className="text-center mt-3">
                        <TechnicalLabel text={`+${withdrawalsHistory.length - 5} MORE TRANSACTIONS`} className="text-muted-foreground text-xs" />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Advanced Commission Calculator */}
            <div className="hidden lg:block">
              <CommissionCalculator />
            </div>

            {/* Help & Support */}
            <motion.div
              variants={{
                initial: { opacity: 0, x: 20 },
                animate: { opacity: 1, x: 0 }
              }
              }
              whileHover={{ scale: 1.02 }}
              className="wireframe-border p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] bg-white transition-all duration-300"
            >
              <TechnicalLabel text="NEED HELP?" className="text-foreground font-black text-sm mb-4" />
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground leading-relaxed font-bold">
                  • Processing time: 2-48 hours<br />
                  • Processing fee: 10%<br />
                  • 24/7 customer support
                </div>
                <Button
                  variant="outline"
                  className="w-full border-2 border-black text-foreground hover:bg-black hover:text-white py-2 font-black text-xs shadow-[2px_2px_0px_#000] active:shadow-none transition-all"
                  onClick={() => navigateToSection(4)} // Navigate to help section
                >
                  <HelpCircle className="w-3 h-3 mr-2" />
                  GET SUPPORT
                </Button>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Mobile Transaction History - Show Below Main Interface */}
        <motion.div
          variants={{
            initial: { opacity: 0, y: 30 },
            animate: { opacity: 1, y: 0 }
          }}
          className="lg:hidden mt-6"
        >
          <div className="wireframe-border p-3 md:p-4 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
            <TechnicalLabel text="TRANSACTION HISTORY" className="text-foreground font-black text-sm mb-4" />
            <Button
              onClick={() => setShowHistory(!showHistory)}
              variant="outline"
              className="w-full border-2 border-black text-foreground hover:bg-black hover:text-white py-2 md:py-3 font-black text-sm shadow-[0_4px_12px_rgba(0,0,0,0.05)] active:shadow-none transition-all"
            >
              <History className="w-3 h-3 md:w-4 md:h-4 mr-2" />
              {showHistory ? 'HIDE HISTORY' : 'VIEW HISTORY'}
            </Button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 overflow-hidden border-t-2 border-black pt-4"
                >
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {withdrawalsHistory && withdrawalsHistory.length > 0 ? (
                      withdrawalsHistory.slice(0, 5).map((item: any, idx: number) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          whileHover={{ scale: 1.02 }}
                          className="p-3 border border-muted-foreground/20 bg-muted/10 hover:bg-white transition-all"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <TechnicalLabel text={item.method} className="text-foreground font-black text-xs" />
                            <div className={cn(
                              "text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-tighter whitespace-nowrap",
                              item.status === 'pending' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" :
                                item.status === 'completed' ? "bg-green-500/10 text-green-600 border border-green-500/20" :
                                  "bg-red-500/10 text-red-600 border border-red-500/20"
                            )}>
                              {item.status === 'pending' ? 'PENDING' : item.status === 'completed' ? 'TRANSFERRED' : 'REJECTED'}
                            </div>
                          </div>
                          <div className="text-sm font-black text-primary mb-0.5">{formatCurrency(item.amount)} PTS</div>
                          <div className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="text-center py-6">
                        <div className="text-xs text-muted-foreground italic">No payout history yet.</div>
                      </div>
                    )}
                  </div>
                  {withdrawalsHistory && withdrawalsHistory.length > 5 && (
                    <div className="text-center mt-3">
                      <TechnicalLabel text={`+${withdrawalsHistory.length - 5} MORE TRANSACTIONS`} className="text-muted-foreground text-xs" />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

      </motion.div>
    );
  }

  // Guild Section
  function renderGuildSection() {
    return (
      <motion.div
        key="guild-section"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="min-h-screen px-4 md:px-8 py-8"
      >
        {/* Section header */}
        <div className="mb-8">
          <TechnicalLabel text="ENGINE C — GUILD SYSTEM" className="text-xs text-muted-foreground mb-2" />
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Engine C</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            The Social Gaming Hub. Create or join a Guild, complete weekly tasks exclusive to members,
            coordinate via real-time team chat, and earn a share of the Guild Weekly Bonus Pool every week.
          </p>
        </div>

        {/* THORX v3 (spec F.6–F.8): 3-context routing by guildRole. */}
        {user && (() => {
          const role = (user as any).guildRole ?? 'simple';
          if (role === 'captain') return <CaptainPortal />;
          if (role === 'member')  return <GuildMemberPanel />;
          return <GuildDiscoveryPanel />;
        })()}
      </motion.div>
    );
  }

  // Help Section
  function renderHelpSection() {
    const formatTime = (timestamp: string) => {
      return new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // Help section options for dropdown
    const helpSectionOptions = [
      { id: "guide", label: "AREA GUIDE", icon: Book },
      { id: "help", label: "AREA HELP", icon: MessageCircle },
      { id: "contact", label: "AREA CONTACT", icon: Phone }
    ];

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
        {/* Hero Section - Dashboard Style */}
        <motion.div
          initial={false}
          animate={{
            backgroundColor: isHelpHeroToggled ? "#ffffff" : "#000000",
            borderColor: isHelpHeroToggled ? "#000000" : "#ffffff",
            boxShadow: isHelpHeroToggled
              ? "0 4px 20px rgba(0,0,0,0.06)"
              : "0 8px 30px rgba(0,0,0,0.12)"
          }}
          transition={{
            backgroundColor: { duration: 0.4 },
            borderColor: { duration: 0.4 }
          }}
          onClick={() => handleHeroToggle(setIsHelpHeroToggled)}
          className={cn(
            "wireframe-border rounded-lg p-6 md:p-12 mb-0 relative overflow-hidden group border-4 cursor-pointer",
            "h-[160px] md:h-[260px] flex items-center justify-center md:justify-start"
          )}
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative z-10 w-full text-center md:text-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {isHelpHeroToggled ? (
                <motion.h1
                  key="help-expanded"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-8xl md:text-9xl text-black"
                >
                  HELP
                </motion.h1>
              ) : (
                <motion.h1
                  layout
                  key="help-collapsed"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="font-black tracking-tighter uppercase leading-none text-8xl md:text-9xl text-white"
                >
                  HELP
                </motion.h1>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <InteractiveDivider className="my-12" />

        {/* Navigation and Content */}
        <motion.div
          variants={{
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 }
          }}
          className="max-w-[1600px] mx-auto mb-12"
        >
          <div className="split-card bg-white border-3 border-black p-6 md:p-12 help-section-content shadow-[0_12px_40px_rgba(0,0,0,0.1)]">
            {/* Desktop: Tabs, Mobile: Dropdown */}
            <div className="w-full">
              {/* Desktop Navigation */}
              <div className="hidden md:block">
                <Tabs value={activeHelpTab} onValueChange={setActiveHelpTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4 md:mb-6 bg-muted border-2 border-black h-10 md:h-12">
                    {helpSectionOptions.map((option) => (
                      <TabsTrigger
                        key={option.id}
                        value={option.id}
                        className="help-tab-button data-[state=active]:bg-black data-[state=active]:text-white font-black text-xs md:text-base h-full flex items-center justify-center px-1 md:px-2 transition-all duration-300"
                      >
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {/* Mobile Navigation Dropdown - Industrial Theme */}
              <div className="md:hidden mb-4 help-dropdown-container">
                <div className="help-dropdown-wrapper">
                  <select
                    value={activeHelpTab}
                    onChange={(e) => setActiveHelpTab(e.target.value)}
                    className="help-dropdown-industrial"
                  >
                    {helpSectionOptions.map((option) => (
                      <option key={option.id} value={option.id} className="font-black bg-white text-black">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tab Content */}
              <div className="mt-4 md:mt-6 help-main-content">
                <AnimatePresence mode="wait">
                  {/* Area Guide - FAQ Section Style */}
                  {activeHelpTab === "guide" && (
                    <motion.div
                      key="guide"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="mt-0"
                    >
                      {/* Section Heading - Minimal and Clean */}
                      <div className="text-center mb-8 md:mb-12">
                        <div className="inline-block px-4 md:px-6 lg:px-8 py-6 md:py-8 mx-4">
                          <h3 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-3 text-foreground">
                            Frequently Asked
                            <br />
                            <span className="text-primary">Questions</span>
                          </h3>

                          <div className="h-1 w-16 bg-primary mx-auto mb-4"></div>

                          <TechnicalLabel text="INSTANT ANSWERS TO YOUR THORX QUERIES" className="text-muted-foreground text-xs md:text-sm" />
                        </div>
                      </div>

                      {/* FAQ Items - Landing Page Style */}
                      <div className="space-y-4 md:space-y-6">
                        {[
                          {
                            id: "001",
                            protocol: "PLATFORM-OVERVIEW",
                            question: "What is THORX?",
                            answer: "THORX is an AI-powered digital engagement platform that connects businesses with verified human attention while enabling users to earn real money through meaningful online activities. We operate Engine A (Attention Marketplace), Engine B (AI-Driven CPA Offers), and Engine C (Guild System & Referral Commissions) — all backed by multi-layer AI fraud prevention."
                          },
                          {
                            id: "002",
                            protocol: "EARNING-MODEL",
                            question: "How do I earn on THORX?",
                            answer: "Three earning streams: 1) Engine A — Watch 15–25 second video ads, then actively explore the advertiser's page for 15 seconds inside our secure AI sandbox. 2) Engine B — Complete curated CPA tasks (app downloads, reviews, registrations) and submit proof for AI-verified payout. 3) Engine C — Join a Guild to earn weekly bonus TX-Points plus a share of your Guild's Weekly Bonus Pool, plus earn a passive referral commission whenever your direct referral withdraws their earnings."
                          },
                          {
                            id: "003",
                            protocol: "WALLET-DEDUCTIONS",
                            question: "What fees are deducted at withdrawal?",
                            answer: "THORX uses a Net-First UI — your wallet always shows exactly what you can withdraw, with all fees already calculated in the background. A flat 15% withdrawal fee is deducted from every payout request — this is the same whether you were referred or not. If you joined via a referral link, a portion of that 15% is shared with your referrer at no extra cost to you. What you see in your wallet balance is exactly what you receive."
                          },
                          {
                            id: "004",
                            protocol: "REFERRAL-SYSTEM",
                            question: "How does the referral commission system work?",
                            answer: "When your direct referral requests a payout, a 15% withdrawal fee is deducted from their earnings. A share of that fee is credited to you as a lifetime referral commission — automatically, at no extra cost to the withdrawing user. You earn this passive income for every payout your referral makes, forever."
                          },
                          {
                            id: "005",
                            protocol: "RANKING-SYSTEM",
                            question: "What are the user ranks?",
                            answer: "Your rank is driven entirely by your Performance Score (PS), earned from completing tasks and maintaining a daily streak. Ranks: E-Rank → D-Rank → C-Rank (unlocks Engine B) → B-Rank (unlocks guild creation) → A-Rank (wider Thorx Card variance) → S-Rank (instant-approved withdrawals). Totals earned or referred don't affect your rank directly — only PS does."
                          },
                          {
                            id: "006",
                            protocol: "PAYOUT-METHODS",
                            question: "How do I withdraw my earnings?",
                            answer: "Withdrawals are sent directly to JazzCash or EasyPaisa. Access is always open — no daily task completion required. S-Rank users have their withdrawals auto-approved instantly. A flat 15% withdrawal fee is deducted from every payout; the preview screen shows the exact breakdown before you confirm."
                          },
                          {
                            id: "007",
                            protocol: "AI-ATTENTION-DETECTOR",
                            question: "How does the AI Attention Detector work?",
                            answer: "When you complete an ad task, a hidden AI system tracks three behavioral signals simultaneously: Tab Visibility API (pauses your timer if you switch tabs or minimize the window), Micro-Movement Delta (detects cursor coordinates or touch input to confirm the device is being actively used), and Scroll Vector (verifies you scrolled at least 10–20% of the page). All three must pass for a payout to be issued."
                          },
                          {
                            id: "008",
                            protocol: "ENGINE-B-PROOF",
                            question: "How does Engine B offer verification work?",
                            answer: "After completing a CPA task, upload your screenshot or video proof. Our AI Agent runs a 3-tier check: Tier 1 — Metadata & hash extraction to catch duplicate or recycled proofs. Tier 2 — Advanced OCR + LLM analysis to verify target handles, comment text, and UI structures from your screenshot. Tier 3 — Approved tasks enter 'Pending' escrow before the admin panel releases to your wallet."
                          }
                        ].map((faq, idx) => (
                          <motion.div
                            key={faq.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            whileHover={{ scale: 1.01, translateY: -2 }}
                            className="split-card bg-background relative group transition-all duration-300 hover:shadow-[8px_8px_0px_#000]"
                          >
                            {/* Protocol Header */}
                            <div className="px-4 md:px-8 py-3 md:py-4 bg-primary text-primary-foreground border-b-[3px] border-black">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 md:gap-4">
                                  <TechnicalLabel text={`FAQ-${faq.id}`} className="text-white text-xs md:text-sm" />
                                  <TechnicalLabel text={faq.protocol} className="text-white opacity-80 text-xs" />
                                </div>
                                <div className="w-12 md:w-16 h-3 md:h-4 opacity-60">
                                  <Barcode />
                                </div>
                              </div>
                            </div>

                            {/* Protocol Content */}
                            <div className="bg-background p-4 md:p-6">
                              <div className="mb-3 md:mb-4">
                                <h4 className="text-base md:text-xl lg:text-2xl font-bold text-foreground leading-tight">
                                  {faq.question}
                                </h4>
                              </div>
                              <div className="text-foreground text-sm md:text-base leading-relaxed bg-muted p-3 md:p-6 border-l-4 border-primary">
                                {faq.answer}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t-2 border-black text-center">
                        <TechnicalLabel text="NEED MORE HELP? USE AREA HELP FOR LIVE CHAT OR AREA CONTACT FOR DIRECT SUPPORT" className="text-muted-foreground text-xs md:text-sm" />
                      </div>
                    </motion.div>
                  )}

                  {/* Area Help - Telegram/WhatsApp Style Chat */}
                  {activeHelpTab === "help" && (
                    <motion.div
                      key="help"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="mt-0 chat-section-wrapper"
                    >
                      <div className="bg-white border-2 border-black overflow-hidden shadow-[12px_12px_0px_#000] rounded-lg">
                        {/* Chat Header - Professional Branding */}
                        <div className="bg-black text-white p-3 md:p-4 flex items-center justify-between border-b-2 border-black">
                          <div className="flex items-center gap-3">
                          </div>
                          <div className="hidden md:block">
                            <Barcode className="h-4 opacity-50 grayscale invert" />
                          </div>
                        </div>

                        {/* Chat Messages Area */}
                        <div className="chat-container bg-muted/30 h-[450px] md:h-[600px] p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto custom-scrollbar relative">
                          <div className="absolute inset-0 industrial-grid opacity-[0.03] pointer-events-none"></div>

                          {isChatHistoryLoading ? (
                            <div className="space-y-4">
                              {[...Array(3)].map((_, i) => (
                                <div key={i} className={`flex items-start gap-3 ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                                  <Skeleton className={`h-16 rounded-2xl border-2 border-black/10 ${i % 2 === 0 ? "w-64" : "w-48"}`} />
                                </div>
                              ))}
                            </div>
                          ) : chatMessages.map((message, idx) => (
                            <motion.div
                              key={message.id}
                              initial={{ opacity: 0, y: 15, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`flex items-start gap-2 md:gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`chat-message max-w-[85%] md:max-w-[75%] px-4 md:px-5 py-3 md:py-4 border-2 border-black relative ${message.sender === 'user'
                                  ? 'bg-primary text-black rounded-l-2xl rounded-tr-2xl shadow-[4px_4px_0px_#000]'
                                  : 'bg-white text-black rounded-r-2xl rounded-tl-2xl shadow-[4px_4px_0px_#000]'
                                  }`}
                              >
                                <p className="text-sm md:text-base font-bold leading-relaxed break-words">{message.text}</p>
                                <div className={`flex items-center justify-end gap-1 mt-2 text-[10px] md:text-xs font-black ${message.sender === 'user' ? 'text-black/60' : 'text-muted-foreground'}`}>
                                  {formatTime(message.timestamp)}
                                </div>
                              </div>
                            </motion.div>
                          ))
                          }
                        </div>

                        {/* Chat Input Area */}
                        <div className="chat-input-wrapper bg-white border-t-2 border-black p-4 md:p-6">
                          <div className="flex flex-row items-stretch gap-2 md:gap-3">
                            <div className="relative flex-1 group">
                              <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Type your message here..."
                                className="chat-input w-full bg-muted/20 border-2 border-black text-black px-4 md:px-6 py-3 md:py-4 rounded font-bold text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50 transition-all"
                                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                              />
                            </div>
                            <div className="flex">
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleSendMessage}
                                disabled={!newMessage.trim() || chatMutation.isPending}
                                className="flex items-center justify-center bg-primary text-black px-4 md:px-8 py-3 md:py-4 border-4 border-black font-black text-sm md:text-base shadow-[4px_4px_0px_#000] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-all aspect-square md:aspect-auto"
                              >
                                {chatMutation.isPending ? (
                                  <RefreshCw className="w-5 h-5 animate-spin" />
                                ) : (
                                  <Send className="w-5 h-5 md:w-6 md:h-6" />
                                )}
                              </motion.button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Area Contact - Registration Form Style */}
                  {activeHelpTab === "contact" && (
                    <motion.div
                      key="contact"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="mt-0"
                    >
                      <div className="text-center mb-6">
                        <TechnicalLabel text="DIRECT TEAM CONTACT" className="mb-2" />
                        <h3 className="text-2xl md:text-3xl font-black text-black">SEND US A MESSAGE</h3>
                      </div>

                      <div className="contact-form-container max-w-2xl mx-auto">
                        <form onSubmit={handleContactSubmit} className="space-y-6">
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                          >
                            <TechnicalLabel text="FULL NAME" className="mb-3 font-black" />
                            <div className="relative">
                              <Input
                                type="text"
                                required
                                value={contactForm.name}
                                onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                                className="contact-form-input border-2 border-black text-base md:text-lg py-3 md:py-3 min-h-[44px] rounded focus:border-primary transition-colors"
                              />
                              {!contactForm.name && (
                                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                  <AnimatedPlaceholder examples={['John Doe', 'Ahmed Khan', 'Sarah Wilson']} />
                                </div>
                              )}
                            </div>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                          >
                            <TechnicalLabel text="EMAIL ADDRESS" className="mb-3 font-black" />
                            <div className="relative">
                              <Input
                                type="email"
                                required
                                value={contactForm.email}
                                onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                                className="contact-form-input border-2 border-black text-base md:text-lg py-3 md:py-3 min-h-[44px] rounded focus:border-primary transition-colors"
                              />
                              {!contactForm.email && (
                                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                  <AnimatedPlaceholder examples={['your.email@gmail.com', 'contact@thorx.com', 'support@example.com']} />
                                </div>
                              )}
                            </div>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                          >
                            <TechnicalLabel text="PROBLEM / DESCRIPTION" className="mb-3 font-black" />
                            <div className="relative">
                              <textarea
                                required
                                rows={isMobile ? 5 : 6}
                                value={contactForm.description}
                                onChange={(e) => setContactForm(prev => ({ ...prev, description: e.target.value }))}
                                className="contact-form-textarea flex w-full border-2 border-black bg-background px-3 py-3 text-base md:text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus:border-primary focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-vertical rounded min-h-[140px] line-height-relaxed transition-colors"
                                placeholder=""
                              />
                              {!contactForm.description && (
                                <div className="absolute top-3 left-3 pointer-events-none text-muted-foreground">
                                  <AnimatedPlaceholder examples={['Describe your issue in detail...', 'Tell us what happened...', 'How can we help you today?']} />
                                </div>
                              )}
                            </div>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                          >
                            <Button
                              type="submit"
                              disabled={isContactSubmitting}
                              className="contact-form-submit w-full bg-black text-white text-base md:text-xl font-black py-4 hover:bg-primary hover:text-black transition-all border-2 border-black disabled:opacity-50 min-h-[50px] flex items-center justify-center rounded shadow-[8px_8px_0px_#000] active:shadow-none"
                            >
                              {isContactSubmitting ? (
                                <span className="flex items-center justify-center">
                                  <RefreshCw className="w-4 h-4 md:w-5 md:h-5 mr-2 md:mr-3 animate-spin" />
                                  <span className="text-sm md:text-base">SENDING MESSAGE...</span>
                                </span>
                              ) : (
                                <span className="text-sm md:text-base">SEND MESSAGE TO TEAM →</span>
                              )}
                            </Button>
                          </motion.div>
                        </form>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }
}