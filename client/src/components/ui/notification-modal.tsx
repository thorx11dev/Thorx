import * as React from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { TrendingUp, User, Bell, Wallet, X, GripHorizontal, Trash2, ArrowUpRight } from "lucide-react";
import { format, isToday, subDays, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Commission {
    id: string;
    sourceUserId: string;
    amount: string;
    level: number;
    status: string;
    createdAt: string;
    sourceUser: {
        firstName: string;
        lastName: string;
        email: string;
    };
}

interface Notification {
    id: string;
    userId: string;
    title: string;
    message: string;
    type: string;
    adminName?: string;
    adminRole?: string;
    amount?: string;
    adjustmentType?: string;
    isRead: boolean;
    createdAt: string;
}

interface NotificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    commissions: Commission[];
    notifications: Notification[];
    isLoading: boolean;
}

type CombinedNotification =
    | { type: 'commission'; data: Commission; date: Date }
    | { type: 'financial'; data: Notification; date: Date };

export function NotificationModal({
    isOpen,
    onClose,
    commissions = [],
    notifications = [],
    isLoading
}: NotificationModalProps) {
    const isMobile = useIsMobile();
    const isDesktop = !isMobile;
    const dragControls = useDragControls();
    const constraintsRef = React.useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();

    const clearAllMutation = useMutation({
        mutationFn: async () => {
            await apiRequest("DELETE", "/api/notifications");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        },
    });

    const startDrag = (e: React.PointerEvent) => {
        if (!isDesktop) return;
        dragControls.start(e);
    };

    // Prevent scroll when modal is open
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    // Keyboard close
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, onClose]);

    const groupedItems = React.useMemo(() => {
        const combined: CombinedNotification[] = [
            ...commissions.map(c => ({ type: 'commission' as const, data: c, date: new Date(c.createdAt) })),
            ...notifications.map(n => ({ type: 'financial' as const, data: n, date: new Date(n.createdAt) }))
        ];
        combined.sort((a, b) => b.date.getTime() - a.date.getTime());

        const groups: { [key: string]: CombinedNotification[] } = {
            "Today": [],
            "This Week": [],
            "Earlier": []
        };
        const now = new Date();
        const oneWeekAgo = subDays(now, 7);

        combined.forEach(item => {
            if (isToday(item.date)) {
                groups["Today"].push(item);
            } else if (isAfter(item.date, oneWeekAgo)) {
                groups["This Week"].push(item);
            } else {
                groups["Earlier"].push(item);
            }
        });

        return Object.entries(groups).filter(([_, items]) => items.length > 0);
    }, [commissions, notifications]);

    const totalCount = commissions.length + notifications.length;

    const getRoleBadgeStyle = (role?: string) => {
        const r = role?.toUpperCase();
        if (r === 'FOUNDER/CEO' || r === 'FOUNDER')
            return "bg-primary text-white border-primary";
        if (r === 'ADMIN')
            return "bg-black text-white border-black";
        return "bg-transparent text-black/50 border-black/20";
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="fixed inset-0 z-notif bg-black/30"
                    />

                    {/* Full-viewport invisible bounds so the desktop panel can be dragged anywhere on screen without going off it */}
                    <div ref={constraintsRef} className="fixed inset-0 z-notif pointer-events-none" aria-hidden="true" />

                    {/* Panel — slides in from right on desktop (freely draggable once open), bottom on mobile */}
                    <motion.div
                        drag={isDesktop}
                        dragListener={false}
                        dragControls={dragControls}
                        dragConstraints={constraintsRef}
                        dragMomentum={false}
                        dragElastic={0}
                        initial={{ x: "100%", y: 0 }}
                        animate={{ x: 0, y: 0 }}
                        exit={{ x: "100%", y: 0 }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className={cn(
                            "fixed z-[810] bg-[#F2EDE4] flex flex-col",
                            // Desktop: floating, draggable window (no longer pinned to the right edge)
                            "md:top-6 md:right-6 md:bottom-auto md:left-auto md:w-[420px] md:h-[min(720px,calc(100vh-3rem))] md:rounded-2xl md:border-2 md:border-black md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:overflow-hidden",
                            // Mobile: full screen (longhand so it doesn't fight the desktop overrides above on specificity)
                            "top-0 right-0 bottom-0 left-0"
                        )}
                        aria-label="Notifications panel"
                        role="dialog"
                        aria-modal="true"
                    >
                        {/* ── Top Bar (drag handle on desktop) ── */}
                        <div
                            onPointerDown={startDrag}
                            className={cn(
                                "flex items-center justify-between px-6 py-5 border-b-2 border-black bg-white flex-shrink-0 md:rounded-t-2xl",
                                isDesktop && "cursor-grab active:cursor-grabbing touch-none select-none"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                {isDesktop && <GripHorizontal className="w-4 h-4 text-black/25" strokeWidth={2} />}
                            </div>
                            <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={onClose}
                                aria-label="Close notifications"
                                className="w-9 h-9 flex items-center justify-center bg-black/5 hover:bg-black hover:text-white text-black/50 transition-all duration-200 rounded-full"
                            >
                                <X className="w-4 h-4" strokeWidth={2} />
                            </button>
                        </div>

                        {/* ── Header ── */}
                        <div
                            onPointerDown={startDrag}
                            className={cn(
                                "px-6 pt-8 pb-6 flex-shrink-0 border-b border-black/10",
                                isDesktop && "cursor-grab active:cursor-grabbing touch-none select-none"
                            )}
                        >
                            <div className="flex items-end justify-between gap-4">
                                <div className="flex items-end gap-4">
                                    <h1 className="text-[40px] md:text-[48px] font-black tracking-tighter text-black uppercase leading-none">
                                        Activity
                                    </h1>
                                    {totalCount > 0 && (
                                        <div className="mb-1 flex h-7 min-w-[28px] items-center justify-center bg-primary text-white font-black text-xs px-2 border-2 border-black rounded-lg">
                                            {totalCount}
                                        </div>
                                    )}
                                </div>
                                {notifications.length > 0 && (
                                    <button
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() => clearAllMutation.mutate()}
                                        disabled={clearAllMutation.isPending}
                                        className="mb-1 flex items-center gap-1.5 px-3 h-7 border-2 border-black/20 hover:border-black hover:bg-black hover:text-white text-black/40 text-[10px] font-black uppercase tracking-wider transition-all duration-150 rounded-lg disabled:opacity-40"
                                        aria-label="Clear all notifications"
                                    >
                                        <Trash2 className="w-3 h-3" strokeWidth={2.5} />
                                        Clear All
                                    </button>
                                )}
                            </div>
                            <div className="h-[3px] w-12 bg-primary mt-3" />
                        </div>

                        {/* ── Content ── */}
                        <div className="flex-1 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-24">
                                    <div className="h-8 w-8 animate-spin rounded-full border-[2.5px] border-primary border-t-transparent" />
                                </div>
                            ) : totalCount === 0 ? (
                                <EmptyState />
                            ) : (
                                <div className="px-6 py-6 space-y-10 pb-16">
                                    {groupedItems.map(([groupName, items]) => (
                                        <div key={groupName}>
                                            {/* Group Label */}
                                            <div className="flex items-center gap-3 mb-4">
                                                <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/35 uppercase whitespace-nowrap">
                                                    {groupName}
                                                </span>
                                                <div className="h-px flex-1 bg-black/10" />
                                            </div>

                                            <div className="space-y-3">
                                                {items.map((item, idx) => {
                                                    if (item.type === 'commission') {
                                                        return (
                                                            <CommissionCard
                                                                key={item.data.id}
                                                                commission={item.data}
                                                                date={item.date}
                                                                idx={idx}
                                                            />
                                                        );
                                                    } else {
                                                        return (
                                                            <FinancialCard
                                                                key={item.data.id}
                                                                notification={item.data}
                                                                date={item.date}
                                                                idx={idx}
                                                                getRoleBadgeStyle={getRoleBadgeStyle}
                                                            />
                                                        );
                                                    }
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

/* ─────────────────────────────────────────
   Commission Card
───────────────────────────────────────── */
function CommissionCard({
    commission,
    date,
    idx,
}: {
    commission: Commission;
    date: Date;
    idx: number;
}) {
    const isL1 = commission.level === 1;
    const amount = Math.round(parseFloat(commission.amount)).toLocaleString();

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.25 }}
            className="group bg-white border-2 border-black rounded-xl p-4 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 cursor-default"
        >
            <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={cn(
                    "w-10 h-10 flex-shrink-0 flex items-center justify-center border-2 rounded-lg",
                    isL1
                        ? "bg-primary border-primary"
                        : "bg-black border-black"
                )}>
                    {isL1
                        ? <TrendingUp className="w-5 h-5 text-white" strokeWidth={2.5} />
                        : <User className="w-5 h-5 text-white" strokeWidth={2} />
                    }
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-black text-black tracking-tight leading-snug">
                            Received{" "}
                            <span className="text-primary">{amount} TX-PTS</span>
                            {" "}from {commission.sourceUser.firstName}
                        </p>
                        <ArrowUpRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase">
                            LVL {commission.level} REFERRAL
                        </span>
                        <span className="w-1 h-1 rounded-full bg-black/20" />
                        <span className="text-[9px] font-mono text-black/35">
                            {format(date, "HH:mm")}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

/* ─────────────────────────────────────────
   Financial / Admin Notification Card
───────────────────────────────────────── */
function FinancialCard({
    notification,
    date,
    idx,
    getRoleBadgeStyle,
}: {
    notification: Notification;
    date: Date;
    idx: number;
    getRoleBadgeStyle: (role?: string) => string;
}) {
    const isCredit = notification.adjustmentType === 'credit';
    const rawAmount = parseFloat(notification.amount || "0");
    // Only show TX-PTS badge when a real balance adjustment occurred (non-zero amount + type set)
    const hasAmount = notification.adjustmentType && rawAmount > 0;
    const amount = rawAmount.toFixed(0);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.25 }}
            className="group bg-white border-2 border-black p-4 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 cursor-default"
        >
            {/* Row 1: icon + title + time */}
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center border-2 bg-black border-black">
                    <Wallet className="w-5 h-5 text-white" strokeWidth={2} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-black text-black uppercase tracking-tight leading-snug">
                            {notification.title}
                        </h4>
                        <span className="text-[9px] font-mono text-black/35 whitespace-nowrap mt-0.5">
                            {format(date, "HH:mm")}
                        </span>
                    </div>

                    {/* Admin badge */}
                    {notification.adminName && (
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className={cn(
                                "px-1.5 py-px text-[8px] font-black border uppercase tracking-wider",
                                getRoleBadgeStyle(notification.adminRole)
                            )}>
                                {notification.adminRole || "SYSTEM"}
                            </span>
                            <span className="text-[9px] text-black/35 font-mono">
                                {notification.adminName}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Row 2: amount (only when real balance change) + message */}
            <div className="mt-3 pl-[52px]">
                {hasAmount && (
                    <p className={cn(
                        "text-2xl font-black tracking-tighter leading-none",
                        isCredit ? "text-emerald-600" : "text-black"
                    )}>
                        {isCredit ? "+" : "−"}{amount}
                        <span className="text-primary text-base font-black ml-1.5">TX-PTS</span>
                    </p>
                )}
                {notification.message && (
                    <p className={cn(
                        "text-[11px] text-black/45 font-medium leading-relaxed max-w-xs",
                        hasAmount ? "mt-1.5" : "mt-0"
                    )}>
                        {notification.message}
                    </p>
                )}
            </div>
        </motion.div>
    );
}

/* ─────────────────────────────────────────
   Empty State
───────────────────────────────────────── */
function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <div className="w-16 h-16 border-2 border-black/15 flex items-center justify-center mb-6 bg-white">
                <Bell className="w-7 h-7 text-black/20" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-black text-black uppercase tracking-tight">
                No Activity Yet
            </h3>
        </div>
    );
}
