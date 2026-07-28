// ADMIN_PKR_DISPLAY: intentional — admin team portal shows raw PKR values for
// business accounting (₨ balances, PKR labels). Excluded from Points-Only
// Mandate which applies only to user-facing screens. Do not convert to TX-Points.
import React, { useState, useEffect } from "react";
import Decimal from "decimal.js";
import { downloadFromUrl } from "@/lib/downloadFromUrl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Users, 
  Search, 
  Filter, 
  MoreVertical, 
  User, 
  Mail, 
  Phone, 
  Shield, 
  Ban, 
  CheckCircle, 
  DollarSign, 
  Network,
  ArrowRight,
  ExternalLink,
  Edit3,
  Calendar,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  X,
  StickyNote,
  Send,
  Plus,
  Check,
  Lock,
  TrendingUp,
  Crown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import TechnicalLabel from "@/components/ui/technical-label";
import { apiRequest } from "@/lib/queryClient";
import { apiAbsolutePath } from "@/lib/apiOrigin";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferralTree } from "@/components/ui/referral-tree";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { resolveAvatarUrl, resolveAvatarUrlByTier, getRankDef } from "@/lib/rankAvatars";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { TRUST_STATUSES } from "@shared/constants";

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  identity: string;
  role: string;
  rank: string;
  userRankTier?: string;
  rankLocked?: boolean;
  trustStatus?: string | null;
  trustReason?: string | null;
  availableBalance: string;
  totalEarnings: string;
  referralCode: string;
  createdAt: string;
  avatar?: string;
  profilePicture?: string;
  guildRole?: string;
  guildId?: string;
  lastActiveAt?: string;
  balanceCashPkr?: string;
  performanceScore?: number;
  isActive?: boolean;
  isVerified?: boolean;
}

interface InternalNote {
  id: string;
  adminId: string;
  admin?: {
    firstName: string;
    lastName: string;
  };
  content: string;
  createdAt: string;
}

export function UserManager({ initialSearch = "" }: { initialSearch?: string }) {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; // Optimized for admin view
  
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [modalType, setModalType] = useState<'details' | 'balance' | 'network' | 'notes' | 'delete' | 'trust' | 'ps' | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
  const [creditIntent, setCreditIntent] = useState<'verified_deposit' | 'admin_credit' | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentTxPoints, setAdjustmentTxPoints] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  // THORX v3: PS override
  const [psDelta, setPsDelta] = useState("");
  const [psReason, setPsReason] = useState("");
  const [psConfirming, setPsConfirming] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [networkZoom, setNetworkZoom] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTrustStatus, setSelectedTrustStatus] = useState<string | null>(null);
  const [trustReason, setTrustReason] = useState("");

  const TRUST_STATUS_OPTIONS = TRUST_STATUSES;

  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // When initialSearch changes (e.g. navigated from leaderboard), update the search term
  useEffect(() => {
    if (initialSearch) setSearchTerm(initialSearch);
  }, [initialSearch]);

  const { data, isLoading } = useQuery<{ users: UserProfile[], totalCount: number }>({
    queryKey: ['/api/team/users', { page: currentPage, search: debouncedSearch }],
    queryFn: async ({ queryKey }) => {
      const [_url, params] = queryKey as [string, { page: number; search: string }];
      const searchParam = params.search ? `&search=${encodeURIComponent(params.search)}` : '';
      const response = await apiRequest("GET", `/api/team/users?page=${params.page}&limit=${itemsPerPage}${searchParam}`);
      return await response.json();
    }
  });


  const { data: networkData } = useQuery<any>({
    queryKey: [`/api/admin/users/${selectedUser?.id}/network`],
    enabled: !!selectedUser && (modalType === 'network' || modalType === 'details'),
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/users/${selectedUser?.id}/network`);
      return await response.json();
    }
  });

  const { data: notesData } = useQuery<{ notes: InternalNote[] }>({
    queryKey: [`/api/admin/notes/user/${selectedUser?.id}`],
    enabled: !!selectedUser && modalType === 'notes',
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/notes/user/${selectedUser?.id}`);
      return await response.json();
    }
  });

  const adjustBalanceMutation = useMutation({
    mutationFn: async ({ userId, realPkrDelta, txPointsDelta, type, reason, creditIntent }: { userId: string, realPkrDelta: number, txPointsDelta: number, type: string, reason: string, creditIntent?: string }) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/adjust-balance`, { realPkrDelta, txPointsDelta, type, reason, creditIntent });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/users'] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${variables.userId}/network`] });
      toast({ title: "Balance Adjusted", description: "User's financial ledger has been updated." });
      closeModal();
    },
    onError: (err: any) => toast({ title: "Balance Adjustment Failed", description: err?.message ?? "An unexpected error occurred. Please try again.", variant: "destructive" }),
  });

  // THORX v3: PS override mutation (PATCH /api/admin/users/:userId/ps)
  const psAdjustMutation = useMutation({
    mutationFn: async ({ userId, delta, reason }: { userId: string; delta: number; reason: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/ps`, { delta, reason });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/users'] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${variables.userId}/network`] });
      toast({ title: "PS Adjusted", description: "Performance score updated." });
      setPsDelta(""); setPsReason("");
      closeModal();
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  const setTrustStatusMutation = useMutation({
    mutationFn: async ({ userId, status, reason }: { userId: string, status: string | null, reason: string }) => {
      return await apiRequest("PATCH", `/api/admin/users/${userId}/trust-status`, { status, reason });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/users'] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${variables.userId}/network`] });
      toast({ title: "Trust Status Updated", description: "User's trust status has been saved." });
      closeModal();
    },
    onError: (err: any) => toast({ title: "Trust Status Failed", description: err?.message ?? "An unexpected error occurred. Please try again.", variant: "destructive" }),
  });

  const createNoteMutation = useMutation({
    mutationFn: async ({ targetType, targetId, content }: { targetType: string, targetId: string, content: string }) => {
      return await apiRequest("POST", "/api/admin/notes", { targetType, targetId, content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/notes/user/${selectedUser?.id}`] });
      setNewNote("");
      toast({ title: "Note Recorded", description: "Internal observation saved to user registry." });
    }
  });

  const usersList = data?.users || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const handleExport = () => {
    const searchParam = debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : '';
    const idsParam = selectedIds.length > 0 ? `ids=${selectedIds.join(',')}` : '';
    const query = [searchParam, idsParam].filter(Boolean).join('&');
    downloadFromUrl(apiAbsolutePath(`/api/admin/users/export${query ? `?${query}` : ""}`), "users-export.csv");
    toast({ 
      title: selectedIds.length > 0 ? "Selective Data Export" : "Directory Export", 
      description: `Downloading ${selectedIds.length > 0 ? selectedIds.length : 'filtered'} user nodes.` 
    });
  };

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/team/users'] });
      queryClient.removeQueries({ queryKey: [`/api/admin/users/${userId}/network`] });
      queryClient.removeQueries({ queryKey: [`/api/admin/notes/user/${userId}`] });
      toast({ title: "Node Terminated", description: "User has been permanently removed from the directory." });
      closeModal();
    }
  });

  const closeModal = () => {
    setSelectedUser(null);
    setModalType(null);
    setAdjustmentAmount("");
    setAdjustmentTxPoints("");
    setAdjustmentReason("");
    setCreditIntent(null);
    setNewNote("");
    setConfirmText("");
    setNetworkZoom(1);
    setSelectedTrustStatus(null);
    setTrustReason("");
    setPsDelta("");
    setPsReason("");
    setPsConfirming(false);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const allSelected = usersList.length > 0 && usersList.every(u => selectedIds.includes(u.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const idsToAdd = usersList.map(u => u.id).filter(id => !selectedIds.includes(id));
      setSelectedIds(prev => [...prev, ...idsToAdd]);
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-5xl font-black tracking-tighter uppercase text-[#111]">User CRM</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search directory..."
              className="h-10 pl-11 pr-4 bg-white border-[1.5px] border-[#111] rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-xs font-bold w-64 text-[#111] placeholder:text-zinc-400"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <Button 
            className="h-10 bg-white border-[1.5px] border-[#111] text-[#111] font-black text-xs px-6 hover:bg-[#111] hover:text-white rounded-full transition-all uppercase shadow-sm whitespace-nowrap"
            onClick={handleExport}
          >
            Export
          </Button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-background border-[1.5px] border-[#111] rounded-[2rem] overflow-hidden shadow-sm">
        <div className="bg-white border-b-[1.5px] border-[#111] px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <TechnicalLabel text="Operational Registry" className="text-[#111] font-black uppercase" />
          </div>
          <div className="bg-black text-white px-4 py-1.5 rounded-lg font-black text-xs min-w-[40px] text-center shadow-lg uppercase tracking-tight">
            {totalCount < 10 ? `0${totalCount}` : totalCount}
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="bg-[#111] px-8 py-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest italic">
              {selectedIds.length} {selectedIds.length === 1 ? 'item' : 'items'} ready for export...
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/50 border-b border-zinc-100">
                <th className="p-6 w-12 text-center align-middle">
                  <Checkbox 
                    checked={allSelected}
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    className="border-[#111] data-[state=checked]:bg-[#111] data-[state=checked]:text-primary"
                  />
                </th>
                <th className="px-4 lg:px-6 py-6 font-black text-[10px] tracking-widest text-[#111] uppercase whitespace-nowrap">Profile</th>
                <th className="px-4 lg:px-6 py-6 font-black text-[10px] tracking-widest text-[#111] uppercase whitespace-nowrap">Contact Protocol</th>
                <th className="px-4 lg:px-6 py-6 font-black text-[10px] tracking-widest text-[#111] uppercase whitespace-nowrap text-center">Rank</th>
                <th className="px-4 lg:px-6 py-6 font-black text-[10px] tracking-widest text-[#111] uppercase whitespace-nowrap text-center">Guild Role</th>
                <th className="px-4 lg:px-6 py-6 font-black text-[10px] tracking-widest text-[#111] uppercase whitespace-nowrap">Last Active</th>
                <th className="px-4 lg:px-6 py-6 font-black text-[10px] tracking-widest text-[#111] uppercase whitespace-nowrap">Financials (₨)</th>
                <th className="px-4 lg:px-6 py-6 font-black text-[10px] tracking-widest text-[#111] uppercase whitespace-nowrap">Ref Cash</th>
                <th className="px-4 lg:px-6 py-6 font-black text-[10px] tracking-widest text-[#111] uppercase text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-[1.5px] divide-[#111]/10">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <Skeleton className="w-12 h-12 min-w-[3rem] shrink-0 rounded-[1rem] bg-zinc-200" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32 bg-zinc-200" />
                          <Skeleton className="h-3 w-24 bg-zinc-200" />
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-40 bg-zinc-200" />
                        <Skeleton className="h-3 w-32 bg-zinc-200" />
                      </div>
                    </td>
                    <td className="p-6 space-y-2">
                      <Skeleton className="h-5 w-24 rounded-sm bg-zinc-200" />
                    </td>
                    <td className="p-6 space-y-2">
                      <Skeleton className="h-5 w-24 bg-zinc-200" />
                      <Skeleton className="h-3 w-20 bg-zinc-200" />
                    </td>
                    {/* Skeleton: Guild Role */}
                    <td className="p-6"><Skeleton className="h-5 w-16 rounded-full bg-zinc-200 mx-auto" /></td>
                    {/* Skeleton: Last Active */}
                    <td className="p-6"><Skeleton className="h-4 w-16 bg-zinc-200" /></td>
                    {/* Skeleton: Ref Cash */}
                    <td className="p-6"><Skeleton className="h-4 w-20 bg-zinc-200" /></td>
                    <td className="p-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Skeleton className="h-10 w-10 rounded-full bg-zinc-200" />
                        <Skeleton className="h-10 w-10 rounded-full bg-zinc-200" />
                        <Skeleton className="h-10 w-10 rounded-full bg-zinc-200" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : usersList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="w-12 h-12 text-zinc-200" />
                      <div className="text-sm font-black tracking-widest uppercase text-zinc-400">No users found</div>
                      {debouncedSearch && <div className="text-xs text-zinc-400">No results for &ldquo;{debouncedSearch}&rdquo;</div>}
                    </div>
                  </td>
                </tr>
              ) : (
                usersList.map((user, idx) => (
                  <motion.tr 
                    key={user.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, type: "spring", stiffness: 300, damping: 30 }}
                    className="hover:bg-black/5 transition-all group border-b-[1.5px] border-[#111]/5"
                  >
                    <td className="p-6">
                      <Checkbox 
                        checked={selectedIds.includes(user.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedIds(prev => [...prev, user.id]);
                          else setSelectedIds(prev => prev.filter(id => id !== user.id));
                        }}
                        className="border-[#111] data-[state=checked]:bg-[#111] transition-colors"
                      />
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 min-w-[3rem] shrink-0 bg-white border-[1.5px] border-[#111] rounded-[1rem] overflow-hidden group-hover:border-primary transition-all">
                          <img
                            src={user.profilePicture || resolveAvatarUrlByTier(user.avatar, user.userRankTier)}
                            alt={`${user.firstName} ${user.lastName}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="font-black text-sm tracking-tight text-[#111] uppercase">{user.firstName} {user.lastName}</div>
                          <div className="text-[10px] text-zinc-400 font-bold mt-1 tracking-widest uppercase">TX-ID: {user.identity || 'Pending'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-600 uppercase">
                          <Mail size={12} className="text-[#111]/30" />
                          {user.email}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase">
                          <Phone size={12} className="text-[#111]/30" />
                          {user.phone || "(N/A)"}
                        </div>
                      </div>
                    </td>
                    <td className="p-6 text-center">
                        <div className="flex flex-col gap-2 items-center">
                           <span className="inline-flex items-center gap-1 text-[9px] font-black text-black bg-zinc-500 border-2 border-black px-2 py-0.5 tracking-widest uppercase shadow-sm">
                             {(user.userRankTier ?? 'E-Rank')}
                             {user.rankLocked && <Lock size={10} className="text-black" />}
                           </span>
                           {user.isActive === false && (
                             <span className="text-[8px] font-black px-1.5 py-0.5 bg-red-100 text-red-600 border border-red-300 rounded-full uppercase tracking-widest">Suspended</span>
                           )}
                        </div>
                    </td>
                    {/* Guild Role */}
                    <td className="p-6 text-center">
                      {(() => {
                        const role = user.guildRole || 'simple';
                        const clr: Record<string,string> = { captain:'bg-amber-100 text-amber-800 border-amber-300', member:'bg-blue-100 text-blue-800 border-blue-200', simple:'bg-zinc-100 text-zinc-400 border-zinc-200' };
                        return <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 border rounded-full uppercase tracking-widest ${clr[role]||clr.simple}`}>{role==='captain'&&<Crown size={9}/>}{role}</span>;
                      })()}
                    </td>
                    {/* Last Active */}
                    <td className="p-6">
                      {(() => {
                        if(!user.lastActiveAt) return <span className="text-[10px] text-zinc-400 font-bold">—</span>;
                        const hrs = (Date.now()-new Date(user.lastActiveAt).getTime())/3600000;
                        if(isNaN(hrs)) return <span className="text-[10px] text-zinc-400 font-bold">—</span>;
                        const label = hrs<1?'Just now':hrs<24?`${Math.floor(hrs)}h ago`:`${Math.floor(hrs/24)}d ago`;
                        return <span className={`text-[10px] font-black ${hrs>48?'text-red-500':'text-zinc-500'}`}>{label}</span>;
                      })()}
                    </td>
                    <td className="p-6">
                      <div className="font-black text-base text-[#111] mb-1 leading-none">{new Decimal(user.availableBalance || "0").toNumber().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="flex items-center gap-1.5">
                         <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">Total:</span>
                         <span className="text-[10px] font-black text-[#111]/50">{new Decimal(user.totalEarnings || "0").toNumber().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 p-0 rounded-full border-[1.5px] border-[#111]/20 hover:border-[#111] hover:bg-[#111] hover:text-white transition-colors"
                          onClick={() => { setSelectedUser(user); setModalType('notes'); }}
                          title="Notes"
                        >
                          <StickyNote size={16} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 p-0 rounded-full border-[1.5px] border-[#111]/20 hover:border-primary hover:bg-primary/20 hover:text-primary transition-colors text-[#111]"
                          onClick={() => { setSelectedUser(user); setModalType('network'); }}
                          title="Network"
                        >
                          <Network size={16} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 p-0 rounded-full border-[1.5px] border-[#111]/20 hover:border-[#111] hover:bg-[#111] hover:text-white transition-colors"
                          onClick={() => { setSelectedUser(user); setModalType('balance'); }}
                          title="Balance"
                        >
                          <DollarSign size={16} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 p-0 rounded-full border-[1.5px] border-purple-200 hover:border-purple-500 hover:bg-purple-50 text-purple-500 transition-colors"
                          onClick={() => { setSelectedUser(user); setPsDelta(""); setPsReason(""); setModalType('ps'); }}
                          title="Adjust PS"
                        >
                          <TrendingUp size={16} />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-10 w-10 p-0 rounded-full border-[1.5px] border-red-500/20 hover:bg-red-500 hover:text-white hover:border-red-600 transition-all text-red-500"
                          onClick={() => {
                            setSelectedUser(user);
                            setModalType('delete');
                          }}
                          title="Terminate Node"
                        >
                          <Ban size={16} />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-10 w-10 border-[1.5px] border-[#111]/20 hover:bg-black hover:text-white rounded-full transition-all"
                          onClick={() => {
                            setSelectedUser(user);
                            setModalType('details');
                          }}
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Global Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-8 border-t border-zinc-100">
            <div className="text-[10px] font-black tracking-widest uppercase text-zinc-400">
              Showing <span className="text-[#111]">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-[#111]">{Math.min(currentPage * itemsPerPage, totalCount)}</span> of <span className="text-[#111]">{totalCount}</span> nodes
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="h-10 px-6 border-[1.5px] border-[#111] rounded-full font-black text-xs uppercase hover:bg-[#111] hover:text-white transition-all disabled:opacity-30"
              >
                Previous Protocol
              </Button>
              <div className="flex items-center gap-1 px-4">
                {(() => {
                  // Cap visible dots to avoid overflow on large page counts
                  const window = 2;
                  const pages: (number | 'gap')[] = [];
                  for (let p = 1; p <= totalPages; p++) {
                    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= window) {
                      pages.push(p);
                    } else if (pages[pages.length - 1] !== 'gap') {
                      pages.push('gap');
                    }
                  }
                  return pages.map((p, i) =>
                    p === 'gap' ? (
                      <span key={`gap-${i}`} className="text-[10px] text-zinc-300 font-black leading-none px-0.5">·</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => handlePageChange(p)}
                        className={cn(
                          "w-2 h-2 rounded-full transition-all",
                          currentPage === p ? "w-8 bg-[#111]" : "bg-[#111]/20 hover:bg-[#111]/40"
                        )}
                      />
                    )
                  );
                })()}
              </div>
              <Button
                variant="ghost"
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="h-10 px-6 border-[1.5px] border-[#111] rounded-full font-black text-xs uppercase hover:bg-[#111] hover:text-white transition-all disabled:opacity-30"
              >
                Next Protocol
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Internal Notes Dialog */}
      <Dialog open={!!selectedUser && modalType === 'notes'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="border border-black/5 bg-white rounded-[2rem] p-0 max-w-lg flex flex-col overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] h-[600px] max-h-[85vh] *:!rounded-none [&>button]:hidden">
          <DialogHeader className="p-8 border-b border-zinc-100 bg-white shrink-0">
             <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tighter text-[#111] uppercase">
                    Admin Notes
                  </DialogTitle>
                  <DialogDescription className="text-zinc-500 font-bold text-[10px] tracking-widest mt-1 uppercase">
                    Subject: {selectedUser?.firstName} {selectedUser?.lastName}
                  </DialogDescription>
                </div>
                <Button onClick={closeModal} variant="ghost" className="h-10 w-10 p-0 rounded-full hover:bg-black/5">
                  <X size={20} className="text-[#111]" />
                </Button>
             </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 p-8 bg-transparent">
               <div className="space-y-4">
                  {notesData?.notes.length === 0 && (
                    <div className="p-10 text-center text-zinc-400 font-black italic text-[11px] uppercase tracking-widest">
                       <StickyNote className="w-10 h-10 mx-auto mb-4 opacity-10" />
                       No notes recorded yet
                    </div>
                  )}
                  {notesData?.notes.map((note) => (
                    <div key={note.id} className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3 relative hover:border-[#111]/50 transition-colors">
                       <div className="flex items-center justify-between border-b border-zinc-100/5 pb-3">
                          <TechnicalLabel 
                            text={`Author: ${note.admin ? `${note.admin.firstName} ${note.admin.lastName}` : (note.adminId || "").substring(0, 8)}`} 
                            className="text-zinc-400 text-[9px] uppercase tracking-wider font-black" 
                          />
                          <TechnicalLabel text={new Date(note.createdAt).toLocaleString()} className="text-zinc-400 text-[9px] tracking-wider" />
                       </div>
                       <p className="text-xs font-bold leading-relaxed text-[#111]">{note.content}</p>
                    </div>
                  ))}
               </div>
            </ScrollArea>
           
            <div className="p-6 bg-white border-t border-zinc-100 shrink-0">
               <div className="flex gap-3">
                  <Input 
                    placeholder="Type a new note..." 
                    className="flex-1 rounded-full border border-zinc-200 h-12 px-6 font-bold text-xs focus:ring-0 focus:border-[#111] transition-colors"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newNote && selectedUser) {
                        createNoteMutation.mutate({ targetType: 'user', targetId: selectedUser.id, content: newNote });
                      }
                    }}
                  />
                  <Button 
                    className="h-12 w-12 rounded-full bg-[#111] text-white hover:bg-primary hover:text-white border border-zinc-200 transition-colors p-0 flex items-center justify-center shrink-0 shadow-sm"
                    onClick={() => {
                      if (!newNote || !selectedUser) return;
                      createNoteMutation.mutate({ targetType: 'user', targetId: selectedUser.id, content: newNote });
                    }}
                    disabled={createNoteMutation.isPending}
                  >
                    <Send size={16} />
                  </Button>
               </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Network View Dialog */}
      <Dialog open={!!selectedUser && modalType === 'network'} onOpenChange={(open) => { if (!open) { closeModal(); setNetworkZoom(1); } }}>
        <DialogContent className="border border-black/5 bg-white rounded-[2rem] p-0 max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] *:!rounded-none [&>button]:hidden">
          <DialogHeader className="p-8 border-b border-zinc-100 bg-white">
             <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tighter text-[#111] uppercase">
                    Referral Network
                  </DialogTitle>
                  <DialogDescription className="text-zinc-500 font-bold text-[10px] tracking-widest mt-1 uppercase">
                    Topology map for: {selectedUser?.firstName} {selectedUser?.lastName}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Zoom Controls */}
                  <button
                    onClick={() => setNetworkZoom(z => Math.max(0.4, parseFloat((z - 0.15).toFixed(2))))}
                    className="h-9 w-9 rounded-full border border-zinc-200 hover:border-[#111] hover:bg-[#111] hover:text-white transition-colors flex items-center justify-center text-[#111] font-black text-lg"
                    title="Zoom Out"
                  >−</button>
                  <span className="text-[10px] font-black text-zinc-400 tracking-widest uppercase w-10 text-center">{Math.round(networkZoom * 100)}%</span>
                  <button
                    onClick={() => setNetworkZoom(z => Math.min(2.5, parseFloat((z + 0.15).toFixed(2))))}
                    className="h-9 w-9 rounded-full border border-zinc-200 hover:border-[#111] hover:bg-[#111] hover:text-white transition-colors flex items-center justify-center text-[#111] font-black text-lg"
                    title="Zoom In"
                  >+</button>
                  <button
                    onClick={() => setNetworkZoom(1)}
                    className="h-8 px-3 rounded-full border border-zinc-200 hover:border-[#111] hover:bg-[#111] hover:text-white transition-colors text-[#111] font-black text-[9px] tracking-widest uppercase"
                    title="Fit to View"
                  >Fit</button>
                  <Button onClick={() => { closeModal(); setNetworkZoom(1); }} variant="ghost" className="h-10 w-10 p-0 rounded-full hover:bg-black/5 ml-1">
                    <X size={20} className="text-[#111]" />
                  </Button>
                </div>
             </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-[#fdfbf7] relative">
            {networkData ? (
               <div
                 className="w-full h-full flex justify-center items-start overflow-auto scrollbar-hide pt-12"
               >
                 <div
                   style={{ 
                     transform: `scale(${networkZoom})`, 
                     transformOrigin: 'top center', 
                     transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' 
                   }}
                 >
                   <ReferralTree 
                      currentUser={{
                        id: selectedUser!.id,
                        firstName: selectedUser!.firstName,
                        lastName: selectedUser!.lastName,
                        userRankTier: selectedUser!.userRankTier,
                        avatar: selectedUser!.avatar,
                        profilePicture: selectedUser!.profilePicture
                      }} 
                      referrals={networkData.referrals || []} 
                   />
                 </div>
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center h-64 grayscale opacity-40">
                  <div className="w-12 h-12 border-4 border-[#111] border-t-transparent animate-spin rounded-full mb-6"></div>
                  <TechnicalLabel text="Mapping network..." className="font-black text-xs text-[#111] uppercase tracking-widest border border-[#111] rounded-full px-4 py-1" />
               </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Balance Adjustment Dialog */}
      <Dialog open={!!selectedUser && modalType === 'balance'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="border border-black/5 bg-white rounded-[2rem] p-0 max-w-md overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] *:!rounded-none [&>button]:hidden">
          <DialogHeader className="p-8 border-b border-zinc-100 bg-white">
            <DialogTitle className="text-2xl font-black tracking-tighter text-[#111] uppercase">
              Financial Operation
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-bold text-[10px] tracking-widest mt-1 uppercase">
               Account: {selectedUser?.firstName} {selectedUser?.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="p-8 space-y-8 bg-transparent">
             <div className="flex gap-4">
                <button 
                  onClick={() => setAdjustmentType('add')}
                  className={cn("flex-1 h-14 rounded-[1.5rem] border border-zinc-200 font-black text-[10px] tracking-widest uppercase transition-colors flex items-center justify-center gap-2", adjustmentType === 'add' ? "bg-[#111] text-white" : "bg-white hover:bg-black/5 text-[#111]")}
                >
                  <ArrowUpRight size={16} />
                  Credit
                </button>
                <button 
                  onClick={() => setAdjustmentType('subtract')}
                  className={cn("flex-1 h-14 rounded-[1.5rem] border border-zinc-200 font-black text-[10px] tracking-widest uppercase transition-colors flex items-center justify-center gap-2", adjustmentType === 'subtract' ? "bg-red-500 text-white border-red-500" : "bg-white hover:bg-black/5 text-[#111]")}
                >
                  <ArrowDownRight size={16} />
                  Debit
                </button>
             </div>

             <div className="space-y-6">
                {/* Credit Intent — required when adding credit */}
                {adjustmentType === 'add' && (
                  <div className="space-y-3">
                    <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500 ml-2">Credit Reason</Label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setCreditIntent('verified_deposit')}
                        className={cn("flex-1 h-12 rounded-2xl border-2 font-black text-[10px] tracking-widest uppercase transition-colors", creditIntent === 'verified_deposit' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-400")}
                      >
                        ✓ Verified Bank Deposit
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreditIntent('admin_credit')}
                        className={cn("flex-1 h-12 rounded-2xl border-2 font-black text-[10px] tracking-widest uppercase transition-colors", creditIntent === 'admin_credit' ? "bg-amber-500 text-white border-amber-500" : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-400")}
                      >
                        ⚠ Manual Adjustment
                      </button>
                    </div>
                    {!creditIntent && (
                      <p className="text-[9px] font-black uppercase tracking-widest text-red-500 ml-2">Select credit reason before confirming</p>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500 ml-2">Amount (₨ PKR)</Label>
                  <Input 
                    type="number"
                    placeholder="0.00" 
                    className="rounded-[1.5rem] border border-zinc-200 focus:border-[#111] focus:ring-0 font-mono text-xl font-black h-16 px-6 bg-white transition-colors"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500 ml-2">TX-Points Credit / Debit</Label>
                  <Input 
                    type="number"
                    placeholder="0"
                    className="rounded-[1.5rem] border border-zinc-200 focus:border-[#111] focus:ring-0 font-mono text-xl font-black h-16 px-6 bg-white transition-colors"
                    value={adjustmentTxPoints}
                    onChange={(e) => setAdjustmentTxPoints(e.target.value)}
                  />
                  <p className="text-[9px] text-zinc-400 font-medium ml-2">Visible points balance updated in TX ledger (separate from PKR)</p>
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500 ml-2">Operation Reason</Label>
                  <Input 
                    placeholder="Enter short description..." 
                    className="rounded-full border border-zinc-200 focus:border-[#111] focus:ring-0 font-bold text-sm h-14 px-6 bg-white transition-colors"
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                  />
                </div>
             </div>
          </div>

          <DialogFooter className="p-8 pt-2 bg-white border-t border-zinc-100 flex-col gap-3 sm:flex-col sm:space-x-0">
            <Button 
               className="w-full h-14 rounded-2xl bg-[#111] text-white hover:bg-black font-black uppercase tracking-widest text-[11px] transition-colors shadow-sm"
               onClick={() => {
                 if (!adjustmentAmount || isNaN(parseFloat(adjustmentAmount))) return;
                 if (adjustmentType === 'add' && !creditIntent) return;
                 if (!selectedUser) return;
                 adjustBalanceMutation.mutate({
                   userId: selectedUser.id,
                   realPkrDelta: parseFloat(adjustmentAmount),
                   txPointsDelta: parseInt(adjustmentTxPoints) || 0,
                   type: adjustmentType === 'subtract' ? 'deduct' : 'add',
                   reason: adjustmentReason || "No reason provided",
                   creditIntent: adjustmentType === 'add' ? (creditIntent ?? 'admin_credit') : undefined,
                 });
               }}
               disabled={adjustBalanceMutation.isPending || (adjustmentType === 'add' && !creditIntent)}
            >
              {adjustBalanceMutation.isPending ? "Processing..." : "Confirm Action"}
            </Button>
            <button
              onClick={closeModal}
              className="w-full text-center text-xs font-bold text-zinc-400 hover:text-[#111] transition-colors py-1"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser && modalType === 'details'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="border border-zinc-200 bg-white rounded-2xl p-0 max-w-2xl overflow-hidden shadow-xl [&>button]:hidden">
          <DialogHeader className="px-7 py-5 border-b border-zinc-100 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-semibold text-zinc-900">
                  User Bio Data
                </DialogTitle>
              </div>
              <Button onClick={closeModal} variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-zinc-100 shrink-0" aria-label="Close">
                <X size={16} className="text-zinc-500" />
              </Button>
            </div>
          </DialogHeader>

          <div className="px-7 py-6 grid grid-cols-2 gap-5">
             <div className="space-y-5">
                <div>
                  <TechnicalLabel text="Identity" className="mb-2" />
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                    <div className="font-semibold text-zinc-900">{selectedUser?.firstName} {selectedUser?.lastName}</div>
                    <div className="text-xs text-zinc-400 mt-1">TX-ID: {selectedUser?.identity}</div>
                  </div>
                </div>
                <div>
                  <TechnicalLabel text="Contact" className="mb-2" />
                  <div className="p-4 bg-white border border-zinc-200 rounded-xl space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail size={14} className="text-primary" />
                      <span className="text-xs font-semibold text-zinc-900">{selectedUser?.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone size={14} className="text-primary" />
                      <span className="text-xs font-semibold text-zinc-900">{selectedUser?.phone || "(N/A)"}</span>
                    </div>
                  </div>
                </div>
             </div>

             <div className="space-y-5">
                <div>
                  <div className="p-4 bg-zinc-900 border border-zinc-900 rounded-xl space-y-3">
                    <div>
                      <div className="text-[9px] font-semibold text-white/40 uppercase tracking-widest">Available Balance</div>
                      <div className="text-2xl font-bold text-white">₨ {new Decimal(selectedUser?.availableBalance || "0").toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold text-white/40 uppercase tracking-widest">Lifetime Earnings</div>
                      <div className="text-lg font-bold text-primary">₨ {new Decimal(selectedUser?.totalEarnings || "0").toFixed(2)}</div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="p-4 bg-white border border-zinc-200 rounded-xl grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Rank</div>
                      <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold text-white px-2 py-0.5 rounded-full tracking-wide uppercase", getRankDef(selectedUser?.rank).bgColor)}>
                        {(selectedUser?.userRankTier ?? 'E-Rank')}
                        {selectedUser?.rankLocked && <Lock size={10} />}
                      </span>
                    </div>
                    <div>
                      <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wide">Joined</div>
                      <div className="text-xs font-semibold text-zinc-900">{selectedUser ? new Date(selectedUser.createdAt).toLocaleDateString() : ''}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="p-4 bg-white border border-zinc-200 rounded-xl">
                    <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Direct Referrals</div>
                    <div className="text-xl font-bold text-zinc-900">
                      {networkData?.referrals?.filter((r: any) => r.level === 1).length ?? 0}
                      <span className="text-[10px] ml-1 text-zinc-400 font-medium">Users</span>
                    </div>
                  </div>
                </div>
             </div>
          </div>

          <DialogFooter className="px-7 py-5 bg-white border-t border-zinc-100 flex gap-3">
            <Button 
                variant="outline"
                className="flex-1 h-11 rounded-xl border border-zinc-300 font-medium text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-all"
                onClick={() => setModalType('notes')}
            >
              Notes
            </Button>
            <Button 
                variant="outline"
                className="flex-1 h-11 rounded-xl border border-zinc-300 font-medium text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-all"
                onClick={() => setModalType('network')}
            >
              Referral Tree
            </Button>
            <Button 
                variant="outline"
                className="flex-1 h-11 rounded-xl border border-zinc-300 font-medium text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-all"
                onClick={() => {
                  setSelectedTrustStatus(selectedUser?.trustStatus || null);
                  setTrustReason(selectedUser?.trustReason || "");
                  setModalType('trust');
                }}
            >
              Trust Status
            </Button>
            <Button 
                className="flex-1 h-11 rounded-xl bg-zinc-900 text-white font-semibold text-sm hover:bg-black transition-all"
                onClick={() => setModalType('balance')}
            >
              Adjust Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PS Adjust Dialog — THORX v3 */}
      <Dialog open={!!selectedUser && modalType === 'ps'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="border border-black/5 bg-white rounded-[2rem] p-0 max-w-sm overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] *:!rounded-none [&>button]:hidden">
          <DialogHeader className="p-8 border-b border-zinc-100 bg-white">
            <DialogTitle className="text-xl font-black tracking-tighter text-[#111] uppercase flex items-center gap-2">
              <TrendingUp size={18} className="text-purple-500" />
              Adjust PS
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-bold text-[10px] tracking-widest mt-1 uppercase">
              {selectedUser?.firstName} {selectedUser?.lastName} · Current PS: {selectedUser?.performanceScore ?? "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div>
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">PS Delta (positive = add, negative = subtract)</div>
              <input
                type="number"
                placeholder="e.g. +50 or -100"
                value={psDelta}
                onChange={e => setPsDelta(e.target.value)}
                className="w-full border-2 border-black rounded-xl px-4 py-3 text-lg font-black text-[#111] focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <div>
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Reason (min 5 chars)</div>
              <input
                type="text"
                placeholder="Reason for PS adjustment..."
                value={psReason}
                onChange={e => setPsReason(e.target.value)}
                className="w-full border-2 border-black rounded-xl px-4 py-3 font-bold text-[#111] focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            {psConfirming ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-purple-50 border border-purple-200 px-4 py-3 text-sm font-semibold text-purple-800 text-center">
                  Apply <span className="font-black">{Number(psDelta) > 0 ? "+" : ""}{psDelta} PS</span> to <span className="font-black">{selectedUser?.firstName}</span>?
                </div>
                <button
                  className="w-full bg-purple-600 text-white font-black text-sm tracking-widest uppercase py-4 rounded-2xl hover:bg-purple-700 transition-colors disabled:opacity-40"
                  disabled={psAdjustMutation.isPending}
                  onClick={() => {
                    const parsedDelta = parseFloat(psDelta);
                    if (!selectedUser || isNaN(parsedDelta)) return;
                    psAdjustMutation.mutate({ userId: selectedUser.id, delta: parsedDelta, reason: psReason });
                  }}
                >
                  {psAdjustMutation.isPending ? "Applying…" : "Confirm"}
                </button>
                <button onClick={() => setPsConfirming(false)} className="w-full text-center text-xs font-bold text-zinc-400 hover:text-[#111] transition-colors py-1">← Go back</button>
              </div>
            ) : (
              <>
                <button
                  className="w-full bg-purple-600 text-white font-black text-sm tracking-widest uppercase py-4 rounded-2xl hover:bg-purple-700 transition-colors disabled:opacity-40"
                  disabled={!psDelta || isNaN(parseFloat(psDelta)) || psReason.length < 5}
                  onClick={() => setPsConfirming(true)}
                >
                  Review PS Adjustment
                </button>
                <button onClick={closeModal} className="w-full text-center text-xs font-bold text-zinc-400 hover:text-[#111] transition-colors py-1">Cancel</button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Trust Status Dialog */}
      <Dialog open={!!selectedUser && modalType === 'trust'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="border border-black/5 bg-white rounded-[2rem] p-0 max-w-md overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] *:!rounded-none [&>button]:hidden">
          <DialogHeader className="p-8 border-b border-zinc-100 bg-white">
            <DialogTitle className="text-2xl font-black tracking-tighter text-[#111] uppercase">
              Trust Status
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-bold text-[10px] tracking-widest mt-1 uppercase">
              Account: {selectedUser?.firstName} {selectedUser?.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="p-8 space-y-6 bg-transparent">
            <div className="space-y-1">
              <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500 ml-2 mb-2 block">Select status</Label>
              <div className="space-y-1">
                {TRUST_STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedTrustStatus(s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 transition-colors text-left"
                  >
                    <Checkbox checked={selectedTrustStatus === s} className="border-zinc-300 data-[state=checked]:bg-[#111] data-[state=checked]:border-[#111]" />
                    <span className="text-sm font-semibold text-[#111]">{s}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black tracking-widest uppercase text-zinc-500 ml-2">
                Reason {selectedTrustStatus ? "(required)" : ""}
              </Label>
              <Input
                placeholder="Why is this status being set?"
                className="rounded-full border border-zinc-200 focus:border-[#111] focus:ring-0 font-bold text-sm h-14 px-6 bg-white transition-colors"
                value={trustReason}
                onChange={(e) => setTrustReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="p-8 pt-2 bg-white border-t border-zinc-100 flex-col gap-3 sm:flex-col sm:space-x-0">
            <Button
              className="w-full h-14 rounded-2xl bg-[#111] text-white hover:bg-black font-black uppercase tracking-widest text-[11px] transition-colors shadow-sm"
              onClick={() => {
                if (!selectedUser || !selectedTrustStatus || !trustReason.trim()) return;
                setTrustStatusMutation.mutate({ userId: selectedUser.id, status: selectedTrustStatus, reason: trustReason.trim() });
              }}
              disabled={setTrustStatusMutation.isPending || !selectedTrustStatus || !trustReason.trim()}
            >
              {setTrustStatusMutation.isPending ? "Applying..." : "Apply Status"}
            </Button>
            <button
              onClick={closeModal}
              className="w-full text-center text-xs font-bold text-zinc-400 hover:text-[#111] transition-colors py-1"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete/Ban Dialog */}
      <Dialog open={!!selectedUser && modalType === 'delete'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="border border-black/5 bg-white rounded-[2rem] p-0 max-w-md overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] *:!rounded-none [&>button]:hidden">
          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-red-500 border border-zinc-200 rounded-full flex items-center justify-center mx-auto shadow-[0_8px_20px_rgba(239,68,68,0.3)] animate-bounce">
              <Ban size={32} className="text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-[#111] uppercase tracking-tighter">Terminate Node?</h3>
              <p className="text-zinc-500 font-bold text-xs mt-2 leading-relaxed px-4">
                You are about to permanently remove <span className="text-[#111]">{selectedUser?.firstName} {selectedUser?.lastName}</span> from the system. This action is irreversible.
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Input 
                  placeholder="Type 'TERMINATE' to confirm" 
                  className="rounded-full border border-zinc-200 h-14 text-center font-black uppercase text-xs focus:ring-red-500 focus:border-red-500 transition-all"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1 h-14 rounded-full border border-zinc-200 font-black text-[10px] uppercase tracking-widest hover:bg-black/5"
                  onClick={closeModal}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 h-14 bg-red-500 text-white border border-zinc-200 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-red-600 disabled:opacity-50"
                  disabled={confirmText !== 'TERMINATE' || deleteUserMutation.isPending}
                  onClick={() => { if (selectedUser) deleteUserMutation.mutate(selectedUser.id); }}
                >
                  {deleteUserMutation.isPending ? "Executing..." : "Confirm"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
