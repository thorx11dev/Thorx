import React, { useState } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import Decimal from "decimal.js";
import { downloadFromUrl } from "@/lib/downloadFromUrl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, CheckCircle, XCircle, Clock, User, ExternalLink, MoreVertical, Search, Filter, ArrowRight, ShieldCheck, Ban, AlertCircle, Copy, Check, Smartphone, Info, Inbox, X, ChevronRight, AlertTriangle, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import TechnicalLabel from "@/components/ui/technical-label";
import { apiRequest } from "@/lib/queryClient";
import { apiAbsolutePath } from "@/lib/apiOrigin";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Withdrawal {
  id: string;
  userId: string;
  amount: string;
  method: string;
  accountName: string;
  accountNumber: string;
  status: 'pending' | 'approved' | 'completed' | 'rejected' | 'processing';
  fee?: string;
  netAmount?: string;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    userRankTier?: string;
  };
}

// Statuses an admin can still act on (complete or reject). Terminal statuses
// ('completed', 'rejected') get no action affordances.
const ACTIONABLE_STATUSES: Withdrawal['status'][] = ['pending', 'approved', 'processing'];

export function PayoutControl() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortType, setSortType] = useState<'latest' | 'rank' | 'deadtime'>('latest');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'view' | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Bulk approve/reject confirmation — replaces window.confirm() so the
  // action reads consistently with the rest of the app's UI and can't be
  // triggered accidentally by an admin holding down Enter.
  const [bulkConfirmAction, setBulkConfirmAction] = useState<'completed' | 'rejected' | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ withdrawals: Withdrawal[], totalCount: number, payoutSlaHours?: number }>({
    queryKey: ['/api/admin/withdrawals', { page: currentPage, status: filterStatus, search: debouncedSearch, sort: sortType }],
    queryFn: async ({ queryKey }) => {
      const [_url, params] = queryKey as [string, any];
      const statusParam = params.status !== 'all' ? `&status=${params.status}` : '';
      const searchParam = params.search ? `&search=${encodeURIComponent(params.search)}` : '';
      const sortParam = params.sort ? `&sort=${params.sort}` : '';
      const response = await apiRequest("GET", `/api/admin/withdrawals?page=${params.page}&limit=${itemsPerPage}${statusParam}${searchParam}${sortParam}`);
      return await response.json();
    },
    refetchInterval: 5000, 
  });

  // Sorting (latest/rank/deadtime) is now applied server-side across the full
  // filtered dataset, not just the current page — see the `sort` query param
  // above. The list is already in the right order; no client-side re-sort.
  const withdrawalsList = data?.withdrawals || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  // Driven by the PAYOUT_SLA_HOURS system setting (System Settings panel) — was
  // previously hardcoded to 48h here, so admins could only change the SLA with
  // a code change/redeploy. Falls back to 48h if the server hasn't sent it yet.
  const payoutSlaHours = data?.payoutSlaHours ?? 48;

  const getDeadtimeLeft = (createdAt: string) => {
    const deadline = new Date(createdAt).getTime() + payoutSlaHours * 60 * 60 * 1000;
    return deadline - Date.now();
  };

  const formattedTimeLeft = (ms: number) => {
    if (ms <= 0) return "EXPIRED";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, transactionId, rejectionReason }: { id: string; status: string; transactionId?: string; rejectionReason?: string }) => {
      return await apiRequest("PATCH", `/api/admin/withdrawals/${id}`, { status, transactionId, rejectionReason });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/withdrawals'] });
      // Invalidate ledger validation so stale mismatch alert clears after action
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ledger/validate', selectedWithdrawal?.userId] });
      // Invalidate audit trail so the new action appears immediately
      queryClient.invalidateQueries({ queryKey: ['/api/admin/withdrawals', variables.id, 'audit-trail'] });
      // Payout Operations audit: these panels derive live stats from the same
      // withdrawals table (pending liability, pending count, completed fees)
      // but weren't invalidated on payout actions, so they showed stale
      // numbers until their own timed refetch caught up.
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['/api/team/metrics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/founder/profit-summary'] });
      toast({ title: "Operation Successful", description: "Withdrawal queue synchronized with ledger." });
      closeModal();
    },
    onError: (error: Error) => {
      toast({ title: "System Error", description: error.message, variant: "destructive" });
    }
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const res = await apiRequest("POST", "/api/admin/withdrawals/bulk", { ids, status });
      return await res.json() as { message: string; succeeded: string[]; failed: Array<{ id: string; error: string }> };
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['/api/team/metrics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/founder/profit-summary'] });
      const failedCount = response?.failed?.length ?? 0;
      toast({
        title: failedCount > 0 ? "Batch Partially Complete" : "Atomic Batch Complete",
        description: response?.message ?? `Successfully processed ${selectedIds.length} withdrawals.`,
        variant: failedCount > 0 ? "destructive" : undefined,
      });
      setSelectedIds([]);
    },
    onError: (error: Error) => {
      toast({ title: "Bulk Conflict", description: error.message, variant: "destructive" });
    }
  });

  // Ledger validation — fires when a withdrawal is selected for approve/view
  const { data: ledgerCheck } = useQuery<{ isMismatch: boolean; pointsMismatch?: number; pkrMismatch?: number; severity?: string } | null>({
    queryKey: ['/api/admin/ledger/validate', selectedWithdrawal?.userId],
    queryFn: async () => {
      if (!selectedWithdrawal?.userId) return null;
      const r = await apiRequest("GET", `/api/admin/ledger/validate/${selectedWithdrawal.userId}`);
      return r.json();
    },
    enabled: !!selectedWithdrawal && (actionType === 'approve' || actionType === 'view'),
    staleTime: 30000,
  });

  // Audit trail — history of all admin actions on this withdrawal
  const { data: auditTrailData, isLoading: auditTrailLoading } = useQuery<{ trail: Array<{
    id: string; action: string; metadata: any; createdAt: string;
    adminFirstName: string; adminLastName: string; adminEmail: string;
  }> }>({
    queryKey: ['/api/admin/withdrawals', selectedWithdrawal?.id, 'audit-trail'],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/withdrawals/${selectedWithdrawal!.id}/audit-trail`);
      return r.json();
    },
    enabled: !!selectedWithdrawal?.id && actionType === 'view',
    staleTime: 15000,
  });

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeModal = () => {
    setSelectedWithdrawal(null);
    setActionType(null);
    setTransactionId("");
    setRejectionReason("");
  };

  const handleExport = () => {
    const statusParam = filterStatus !== 'all' ? `status=${filterStatus}` : '';
    const searchParam = debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : '';
    const idsParam = selectedIds.length > 0 ? `ids=${selectedIds.join(',')}` : '';
    const query = [statusParam, searchParam, idsParam].filter(Boolean).join('&');
    downloadFromUrl(apiAbsolutePath(`/api/admin/withdrawals/export${query ? `?${query}` : ""}`), "payouts-export.csv");
    toast({ 
      title: selectedIds.length > 0 ? "Selective Ledger Export" : "Full Ledger Export", 
      description: `Downloading ${selectedIds.length > 0 ? selectedIds.length : 'filtered'} payout nodes.` 
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Copied to Clipboard", description: "Value ready for transfer protocol." });
  };

  const handleCopyPaymentDetails = (w: Withdrawal) => {
    const formatted = `${w.accountNumber} — ${w.accountName} — ${w.method}`;
    navigator.clipboard.writeText(formatted);
    setCopiedId(w.id + '_payment');
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Payment Details Copied", description: formatted });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-primary/10 text-primary border-primary/20';
      // v4: 'approved' is legacy only (S-Rank fast-track removed — Spec §12 no
      // auto-approve). Kept for old rows; new payouts never enter this state.
      case 'approved': return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'completed': return 'bg-primary/20 text-primary border-primary/40';
      case 'rejected': return 'bg-red-50 text-red-600 border-red-200';
      case 'processing': return 'bg-blue-50 text-blue-600 border-blue-200';
      default: return 'bg-zinc-50 text-zinc-500 border-zinc-200';
    }
  };

  const allSelected = withdrawalsList.length > 0 && withdrawalsList.every(w => selectedIds.includes(w.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const idsToAdd = withdrawalsList.map(w => w.id).filter(id => !selectedIds.includes(id));
      setSelectedIds(prev => [...prev, ...idsToAdd]);
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-5xl font-black tracking-tighter uppercase text-[#141413]">Payout</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search beneficiary..."
              className="h-10 pl-11 pr-4 bg-white border-[1.5px] border-[#141413] rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-xs font-bold w-64 text-[#141413] placeholder:text-zinc-400"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <Button 
            className="h-10 bg-white border-[1.5px] border-[#141413] text-[#141413] font-black text-xs px-6 hover:bg-[#141413] hover:text-white rounded-full transition-all uppercase shadow-sm whitespace-nowrap"
            onClick={handleExport}
          >
            Export
          </Button>

          <select 
            className="h-10 px-4 bg-white border-[1.5px] border-[#141413] rounded-full font-black text-[10px] uppercase tracking-widest focus:outline-none cursor-pointer hover:bg-black/5 transition-colors"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="bg-background border-[1.5px] border-[#141413] rounded-[2rem] overflow-hidden shadow-sm">
        <div className="bg-white border-b-[1.5px] border-[#141413] px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-[#141413]/5 p-1 rounded-full">
            {(['latest', 'rank', 'deadtime'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setSortType(s); setCurrentPage(1); }}
                className={cn(
                  "py-1.5 px-4 rounded-full text-[9px] font-black uppercase tracking-widest transition-all min-w-[80px]",
                  sortType === s ? "bg-black text-white shadow-sm" : "hover:bg-black/10 text-zinc-400"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="bg-black text-white px-4 py-1.5 rounded-lg font-black text-xs min-w-[40px] text-center shadow-lg uppercase tracking-tight">
            {totalCount < 10 ? `0${totalCount}` : totalCount}
          </div>
        </div>
        
        {selectedIds.length > 0 && (
          <div className="bg-[#141413] px-8 py-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest italic">
              {selectedIds.length} {selectedIds.length === 1 ? 'item' : 'items'} selected
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={bulkUpdateMutation.isPending}
                className="h-8 px-4 rounded-full bg-white text-[#141413] font-black text-[9px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                onClick={() => setBulkConfirmAction('completed')}
              >
                Approve Selected
              </Button>
              <Button
                size="sm"
                disabled={bulkUpdateMutation.isPending}
                className="h-8 px-4 rounded-full bg-transparent border-[1.5px] border-red-500/60 text-red-400 font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white hover:border-red-500 transition-all disabled:opacity-50"
                onClick={() => setBulkConfirmAction('rejected')}
              >
                Reject Selected
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/50 border-b-[1.5px] border-[#141413]/10">
                <th className="p-6 w-12 text-center align-middle">
                  <Checkbox 
                    checked={allSelected}
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    className="border-[#141413] data-[state=checked]:bg-[#141413] data-[state=checked]:text-primary"
                  />
                </th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#141413] uppercase">Beneficiary</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#141413] uppercase text-center">Identity Rank</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#141413] uppercase">Transfer Protocol</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#141413] uppercase text-center">Amount (₨)</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#141413] uppercase text-center">Status</th>
                <th className="p-6 font-black text-[10px] tracking-widest text-[#141413] uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-[1.5px] divide-[#141413]/10">
              <AnimatePresence mode="popLayout">
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="border-b-[1.5px] border-[#141413]/5">
                      <td className="p-6"><Skeleton className="h-4 w-4 rounded" /></td>
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="space-y-2">
                             <Skeleton className="h-4 w-32" />
                             <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                      </td>
                      <td colSpan={4} className="p-6"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ))
                ) : withdrawalsList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-20 text-center">
                       <Inbox className="w-12 h-12 mx-auto mb-4 text-zinc-300" />
                       <TechnicalLabel text="Registry Empty" className="text-zinc-400 font-black italic uppercase tracking-widest" />
                       <p className="text-xs font-bold text-zinc-400 mt-2">No withdrawal nodes match the current filter.</p>
                    </td>
                  </tr>
                ) : (
                  withdrawalsList.map((withdrawal, idx) => (
                    <motion.tr 
                      key={withdrawal.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05, type: "spring", stiffness: 300, damping: 30 }}
                      className="hover:bg-black/5 transition-all group border-b-[1.5px] border-[#141413]/5"
                    >
                      <td className="p-6">
                        <Checkbox 
                          checked={selectedIds.includes(withdrawal.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedIds(prev => [...prev, withdrawal.id]);
                            else setSelectedIds(prev => prev.filter(id => id !== withdrawal.id));
                          }}
                          className="border-[#141413] data-[state=checked]:bg-[#141413] transition-colors"
                        />
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white border-[1.5px] border-[#141413] flex items-center justify-center text-[10px] font-black group-hover:bg-primary/20 transition-all">
                            {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                          </div>
                          <div>
                            <div className="font-black text-xs text-[#141413] uppercase tracking-tight">{withdrawal.user.firstName} {withdrawal.user.lastName}</div>
                            <div className="text-[10px] font-bold text-zinc-400">{withdrawal.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-6 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[8px] font-black text-black bg-zinc-500 border-2 border-black px-2 py-0.5 tracking-widest uppercase shadow-sm">
                            {(withdrawal.user.userRankTier ?? 'E-Rank')}
                          </span>
                          {sortType === 'deadtime' && (
                            <div className={cn(
                              "text-[10px] font-black tracking-tighter uppercase px-2 py-0.5 bg-black text-white rounded-sm min-w-[70px] shadow-sm",
                              getDeadtimeLeft(withdrawal.createdAt) < 7200000 && "bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]"
                            )}>
                              {formattedTimeLeft(getDeadtimeLeft(withdrawal.createdAt))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-6">
                         <div className="flex items-center gap-2">
                           <TechnicalLabel text={withdrawal.accountNumber} className="text-[#141413] !tracking-normal font-mono text-[11px]" />
                           <Button 
                             size="icon" 
                             variant="ghost" 
                             className="h-6 w-6 p-1 rounded-md hover:bg-black hover:text-white transition-all"
                             onClick={() => handleCopy(withdrawal.accountNumber)}
                           >
                             {copiedId === withdrawal.accountNumber ? <Check size={10} /> : <Copy size={10} />}
                           </Button>
                         </div>
                         <div className="text-[9px] font-bold text-zinc-400 mt-1 truncate max-w-[150px]">{withdrawal.accountName}</div>
                      </td>
                      <td className="p-6 text-center">
                        <div className="font-black text-sm text-[#141413]">₨ {new Decimal(withdrawal.amount || "0").toFixed(2)}</div>
                        <div className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mt-0.5">{withdrawal.method}</div>
                      </td>
                      <td className="p-6">
                        <div className={cn("px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border-[1.5px] inline-flex items-center gap-2 shadow-sm", getStatusStyle(withdrawal.status))}>
                           {withdrawal.status === 'pending' && <Clock size={10} />}
                           {withdrawal.status === 'approved' && <ShieldCheck size={10} />}
                           {withdrawal.status === 'completed' && <CheckCircle size={10} />}
                           {withdrawal.status === 'rejected' && <XCircle size={10} />}
                           {withdrawal.status === 'processing' && <ThorxSpinner size={10} />}
                           {withdrawal.status}
                        </div>
                      </td>
                      <td className="p-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {ACTIONABLE_STATUSES.includes(withdrawal.status) && (
                            <>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-10 w-10 p-0 rounded-full border-[1.5px] border-[#141413]/20 hover:border-primary hover:bg-primary/20 hover:text-primary transition-colors text-[#141413]"
                                onClick={() => { setSelectedWithdrawal(withdrawal); setActionType('approve'); }}
                              >
                                <CheckCircle size={16} />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-10 w-10 p-0 rounded-full border-[1.5px] border-[#141413]/20 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-500 transition-colors text-[#141413]"
                                onClick={() => { setSelectedWithdrawal(withdrawal); setActionType('reject'); }}
                              >
                                <XCircle size={16} />
                              </Button>
                            </>
                          )}
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-10 w-10 border-[1.5px] border-[#141413]/20 hover:bg-black hover:text-white rounded-full transition-all"
                            onClick={() => { setSelectedWithdrawal(withdrawal); setActionType('view'); }}
                          >
                            <ChevronRight size={14} />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-6 bg-white border-t-[1.5px] border-[#141413] flex items-center justify-between">
            <div className="text-[10px] font-black tracking-widest uppercase text-zinc-400">
              Showing <span className="text-[#141413]">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-[#141413]">{Math.min(currentPage * itemsPerPage, totalCount)}</span> of <span className="text-[#141413]">{totalCount}</span> nodes
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="h-10 px-6 border-[1.5px] border-[#141413] rounded-full font-black text-xs uppercase hover:bg-[#141413] hover:text-white transition-all disabled:opacity-30"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1 px-4">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handlePageChange(i + 1)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      currentPage === i + 1 ? "w-8 bg-[#141413]" : "bg-[#141413]/20 hover:bg-[#141413]/40"
                    )}
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="h-10 px-6 border-[1.5px] border-[#141413] rounded-full font-black text-xs uppercase hover:bg-[#141413] hover:text-white transition-all disabled:opacity-30"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedWithdrawal && actionType === 'view'} onOpenChange={(open) => !open && closeModal()}>
         <DialogContent className="border border-zinc-200 bg-white rounded-2xl p-0 max-w-lg overflow-hidden shadow-xl [&>button]:hidden">
            <DialogHeader className="px-7 py-5 border-b border-zinc-100 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl font-semibold text-zinc-900">Withdrawal Entry</DialogTitle>
                  <DialogDescription className="text-zinc-400 text-xs mt-0.5">ID: {selectedWithdrawal?.id}</DialogDescription>
                </div>
                <Button onClick={closeModal} variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-zinc-100 shrink-0">
                  <X size={16} className="text-zinc-500" />
                </Button>
              </div>
            </DialogHeader>
            <div className="px-7 py-6 space-y-5">
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <TechnicalLabel text="Beneficiary" className="mb-2" />
                    <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                      <div className="font-semibold text-zinc-900">{selectedWithdrawal?.user.firstName} {selectedWithdrawal?.user.lastName}</div>
                      <div className="text-xs text-zinc-400 mt-1">{selectedWithdrawal?.user.email}</div>
                      <div className="mt-2.5">
                        <span className="text-[9px] font-bold text-zinc-600 bg-zinc-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                          {selectedWithdrawal?.user.userRankTier ?? 'E-Rank'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <TechnicalLabel text="Payout Amount" className="mb-2" />
                    <div className="p-4 bg-zinc-900 border border-zinc-900 rounded-xl">
                      <div className="text-2xl font-bold text-primary">₨ {new Decimal(selectedWithdrawal?.amount || "0").toFixed(2)}</div>
                      <div className="text-[9px] font-semibold text-white/40 uppercase tracking-widest mt-1">Gross Request (held from Available Balance)</div>
                    </div>
                  </div>
               </div>
               <div>
                  <TechnicalLabel text="Account Details" className="mb-2" />
                  <div className="p-5 bg-white border border-zinc-200 rounded-xl space-y-3">
                     <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400 font-medium">Gateway</span>
                        <span className="text-sm font-semibold text-zinc-900">{selectedWithdrawal?.method}</span>
                     </div>
                     <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400 font-medium">Account Name</span>
                        <span className="text-sm font-semibold text-zinc-900">{selectedWithdrawal?.accountName}</span>
                     </div>
                     <div className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-100 rounded-lg">
                        <div className="flex flex-col gap-0.5">
                           <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">Account / IBAN</span>
                           <span className="text-sm font-mono font-semibold text-zinc-900">{selectedWithdrawal?.accountNumber}</span>
                        </div>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 rounded-lg border border-zinc-200 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-all"
                          onClick={() => handleCopy(selectedWithdrawal?.accountNumber || "")}
                        >
                          {copiedId === selectedWithdrawal?.accountNumber ? <Check size={12} /> : <Copy size={12} />}
                        </Button>
                     </div>
                  </div>
               </div>
            </div>
               {/* ── SYSTEM LEDGER CALCULATION ── */}
               {selectedWithdrawal?.netAmount && (
                 <div>
                   <TechnicalLabel text="System Ledger Calculation" className="mb-2" />
                   <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-xl font-mono text-xs space-y-1.5 text-white">
                     {(() => {
                       // R-09: Use Decimal.js for exact arithmetic — eliminates IEEE 754
                       // float drift between the displayed ledger value and the stored one.
                       const net   = new Decimal(selectedWithdrawal.netAmount  || "0");
                       const fee   = new Decimal(selectedWithdrawal.fee         || "0");
                       const gross = net.plus(fee);
                       return (
                         <>
                           <div className="flex justify-between"><span className="text-zinc-400">Real PKR (ledger):</span><span className="text-white font-black">Rs. {gross.toFixed(2)}</span></div>
                           <div className="flex justify-between"><span className="text-zinc-400">Platform Fee ({gross.isZero() ? "0" : fee.div(gross).times(100).toDecimalPlaces(1).toString()}%):</span><span className="text-red-400">− Rs. {fee.toFixed(2)}</span></div>
                           <div className="border-t border-zinc-700 pt-1.5 flex justify-between"><span className="text-zinc-300 font-black">USER RECEIVES:</span><span className="text-emerald-400 font-black">Rs. {net.toFixed(2)}</span></div>
                         </>
                       );
                     })()}
                   </div>
                 </div>
               )}
               {/* ── RED ALERT — LEDGER MISMATCH ── */}
               {ledgerCheck?.isMismatch && (
                 <div className="p-4 bg-red-600 border-2 border-red-800 rounded-xl animate-pulse">
                   <div className="flex items-center gap-2 mb-2">
                     <AlertTriangle className="w-5 h-5 text-white shrink-0" />
                     <span className="font-black text-white text-sm uppercase tracking-wide">RED ALERT — LEDGER MISMATCH DETECTED</span>
                   </div>
                   <div className="text-xs text-red-100 space-y-0.5 font-mono">
                     {ledgerCheck.pointsMismatch !== undefined && (
                       <div>Points mismatch: <span className="font-black">+{ledgerCheck.pointsMismatch} TX-Points</span> (possible exploit)</div>
                     )}
                     {ledgerCheck.pkrMismatch !== undefined && (
                       <div>PKR mismatch: <span className="font-black">Rs. {new Decimal(ledgerCheck.pkrMismatch ?? 0).toFixed(2)}</span></div>
                     )}
                     <div className="mt-2">Severity: <span className="font-black uppercase">{ledgerCheck.severity || "CRITICAL"}</span></div>
                   </div>
                   <div className="flex gap-2 mt-3">
                     <Button
                       size="sm"
                       className="h-7 text-[10px] font-black bg-white text-red-600 hover:bg-red-50 disabled:opacity-60"
                       disabled={updateStatusMutation.isPending}
                       onClick={() => selectedWithdrawal && updateStatusMutation.mutate({
                         id: selectedWithdrawal.id,
                         status: 'rejected',
                         rejectionReason: `Blocked by administrator — ledger mismatch detected (severity: ${ledgerCheck?.severity || 'CRITICAL'})`,
                       })}
                     >
                       {updateStatusMutation.isPending ? <ThorxSpinner size={12} className="mr-1" /> : <ShieldX size={12} className="mr-1" />} Block Withdrawal
                     </Button>
                   </div>
                 </div>
               )}
               {/* ── AUDIT TRAIL ── */}
               <div>
                 <TechnicalLabel text="Action History" className="mb-2" />
                 <div className="rounded-xl border border-zinc-200 overflow-hidden">
                   {auditTrailLoading ? (
                     <div className="divide-y divide-zinc-100">
                       {[0, 1].map(i => (
                         <div key={i} className="flex items-center gap-3 px-4 py-3">
                           <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                           <div className="flex-1 space-y-1.5">
                             <Skeleton className="h-3 w-40" />
                             <Skeleton className="h-2.5 w-28" />
                           </div>
                           <Skeleton className="h-2.5 w-20 shrink-0" />
                         </div>
                       ))}
                     </div>
                   ) : !auditTrailData?.trail?.length ? (
                     <div className="text-center py-5 text-zinc-400 text-xs">No admin actions recorded yet.</div>
                   ) : (
                     <div className="divide-y divide-zinc-50 max-h-40 overflow-y-auto">
                       {auditTrailData.trail.map(entry => {
                         const actionLabel: Record<string, string> = {
                           // Current backend action names (WITHDRAWAL_${status.toUpperCase()})
                           WITHDRAWAL_COMPLETED:      "Approved",
                           WITHDRAWAL_REJECTED:       "Rejected",
                           WITHDRAWAL_PENDING:        "Reset to Pending",
                           BULK_WITHDRAWAL_COMPLETED: "Bulk Approved",
                           BULK_WITHDRAWAL_REJECTED:  "Bulk Rejected",
                           BULK_WITHDRAWAL_PENDING:   "Bulk Reset to Pending",
                           // Legacy fallbacks
                           APPROVE_WITHDRAWAL:        "Approved",
                           REJECT_WITHDRAWAL:         "Rejected",
                           PROCESS_WITHDRAWAL:        "Processed",
                           BULK_APPROVE_WITHDRAWALS:  "Bulk Approved",
                           BULK_REJECT_WITHDRAWALS:   "Bulk Rejected",
                         };
                         const label = actionLabel[entry.action] ?? entry.action.replace(/_/g, " ");
                         const isApprove = entry.action.includes("APPROVE") || entry.action === "WITHDRAWAL_COMPLETED" || entry.action === "BULK_WITHDRAWAL_COMPLETED";
                         const isReject  = entry.action.includes("REJECT")  || entry.action === "WITHDRAWAL_REJECTED"  || entry.action === "BULK_WITHDRAWAL_REJECTED";
                         const txId = entry.metadata?.transactionId;
                         return (
                           <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                             <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isApprove ? "bg-emerald-50 text-emerald-600" : isReject ? "bg-red-50 text-red-500" : "bg-zinc-100 text-zinc-400"}`}>
                               {isApprove ? <CheckCircle size={12} /> : isReject ? <XCircle size={12} /> : <Clock size={12} />}
                             </div>
                             <div className="flex-1 min-w-0">
                               <div className="text-xs font-semibold text-zinc-800">{label}</div>
                               <div className="text-[10px] text-zinc-400 truncate">
                                 {entry.adminFirstName} {entry.adminLastName}
                                 {txId && <span className="ml-1.5 font-mono text-zinc-500">· {txId}</span>}
                               </div>
                             </div>
                             <div className="text-[10px] text-zinc-400 shrink-0 mt-0.5">
                               {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   )}
                 </div>
               </div>

               {/* ── PAYMENT COPY ── */}
               {selectedWithdrawal && (
                 <div>
                   <Button variant="outline" className="w-full h-9 border-[1.5px] border-[#141413] font-black text-xs hover:bg-[#141413] hover:text-white transition-all"
                     onClick={() => handleCopyPaymentDetails(selectedWithdrawal)}>
                     {copiedId === selectedWithdrawal.id + '_payment' ? <Check size={12} className="mr-2"/> : <Copy size={12} className="mr-2"/>}
                     Copy Payment Details
                   </Button>
                 </div>
               )}
            <DialogFooter className="px-7 py-5 bg-white border-t border-zinc-100 flex flex-col gap-2">
               {selectedWithdrawal && ACTIONABLE_STATUSES.includes(selectedWithdrawal.status) ? (
                 <div className="flex gap-3 w-full">
                   <Button variant="outline" className="flex-1 h-11 rounded-xl border border-red-200 text-red-500 font-medium text-sm hover:bg-red-50 hover:border-red-300 transition-all" onClick={() => setActionType('reject')}>Reject</Button>
                   <Button className="flex-1 h-11 rounded-xl bg-zinc-900 text-white font-semibold text-sm hover:bg-black transition-all" onClick={() => setActionType('approve')}>Approve Payout</Button>
                 </div>
               ) : (
                 <Button variant="outline" className="w-full h-11 rounded-xl border border-zinc-300 font-medium text-sm text-zinc-600 hover:bg-zinc-50 transition-all" onClick={closeModal}>Close Entry</Button>
               )}
            </DialogFooter>
         </DialogContent>
      </Dialog>

      <Dialog open={!!selectedWithdrawal && actionType === 'approve'} onOpenChange={(open) => !open && setActionType('view')}>
         <DialogContent className="border border-zinc-200 bg-white rounded-2xl p-0 max-w-md overflow-hidden shadow-xl">
            <DialogHeader className="px-7 py-5 border-b border-zinc-100 bg-white">
              <DialogTitle className="text-xl font-semibold text-zinc-900">Authorize Payout</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs mt-0.5">Enter the transaction reference ID</DialogDescription>
            </DialogHeader>
            <div className="px-7 py-6 space-y-5">
               <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-primary/80 leading-relaxed">Please ensure the transaction has been executed through the bank portal before recording the reference ID.</p>
               </div>
               <div className="space-y-1.5">
                 <Label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest ml-1">Ref ID / Transaction Number</Label>
                 <Input 
                   placeholder="e.g. TRX-99283-A" 
                   className="h-11 rounded-xl border border-zinc-300 focus:border-primary font-mono font-medium text-sm px-4 transition-all"
                   value={transactionId}
                   onChange={(e) => setTransactionId(e.target.value)}
                 />
               </div>
            </div>
            <DialogFooter className="px-7 py-5 bg-white border-t border-zinc-100 flex flex-col gap-2">
               <Button className="w-full h-11 bg-zinc-900 text-white font-semibold text-sm rounded-xl hover:bg-black transition-all"
                 onClick={() => updateStatusMutation.mutate({ id: selectedWithdrawal!.id, status: 'completed', transactionId })}
                 disabled={updateStatusMutation.isPending || !transactionId}
               >
                 {updateStatusMutation.isPending ? <span className="flex items-center gap-1.5"><ThorxSpinner size={14} />Processing…</span> : "Finalize Payout"}
               </Button>
               <button
                 type="button"
                 className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors py-1"
                 onClick={() => setActionType('view')}
               >
                 Cancel
               </button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      <Dialog open={!!selectedWithdrawal && actionType === 'reject'} onOpenChange={(open) => !open && setActionType('view')}>
         <DialogContent className="border border-zinc-200 bg-white rounded-2xl p-0 max-w-md overflow-hidden shadow-xl">
            <DialogHeader className="px-7 py-5 border-b border-zinc-100 bg-white">
              <DialogTitle className="text-xl font-semibold text-red-500">Reject Request</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs mt-0.5">Provide a reason for this rejection</DialogDescription>
            </DialogHeader>
            <div className="px-7 py-6 space-y-5">
               <div className="space-y-1.5">
                 <Label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest ml-1">Rejection Reason</Label>
                 <Input 
                   placeholder="e.g. Incorrect account details provided." 
                   className="h-11 rounded-xl border border-zinc-300 focus:border-red-400 font-medium text-sm px-4 transition-all"
                   value={rejectionReason}
                   onChange={(e) => setRejectionReason(e.target.value)}
                 />
               </div>
            </div>
            <DialogFooter className="px-7 py-5 bg-white border-t border-zinc-100 flex flex-col gap-2">
               <Button className="w-full h-11 bg-red-500 text-white font-semibold text-sm rounded-xl hover:bg-red-600 transition-all"
                 onClick={() => updateStatusMutation.mutate({ id: selectedWithdrawal!.id, status: 'rejected', rejectionReason })}
                 disabled={updateStatusMutation.isPending || !rejectionReason}
               >
                 {updateStatusMutation.isPending ? <span className="flex items-center gap-1.5"><ThorxSpinner size={14} />Processing…</span> : "Decline Entry"}
               </Button>
               <button
                 type="button"
                 className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors py-1"
                 onClick={() => setActionType('view')}
               >
                 Cancel
               </button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      <AlertDialog open={bulkConfirmAction !== null} onOpenChange={(open) => !open && setBulkConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirmAction === 'completed' ? `Approve ${selectedIds.length} withdrawal(s)?` : `Reject ${selectedIds.length} withdrawal(s)?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirmAction === 'completed'
                ? "This finalizes payout for every selected withdrawal and cannot be undone."
                : "Every selected withdrawal will be marked as rejected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={bulkConfirmAction === 'rejected' ? "bg-red-600 text-white hover:bg-red-700" : undefined}
              onClick={() => {
                if (bulkConfirmAction) {
                  bulkUpdateMutation.mutate({ ids: selectedIds, status: bulkConfirmAction });
                }
                setBulkConfirmAction(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
