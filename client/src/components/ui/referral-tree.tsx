import * as React from "react";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAvatarUrl } from "@/lib/rankAvatars";
import { formatPoints } from "@/lib/formatPoints";
import TechnicalLabel from "@/components/ui/technical-label";

interface NetworkUser {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    userRankTier?: string;
    avatar?: string;
    profilePicture?: string;
    level: number;
    referredBy: string;
    earningsFromUser: string;
    /** True only while this referral currently has THORX open (live WebSocket connection). */
    isOnline?: boolean;
}

interface ReferralTreeProps {
    currentUser: {
        id: string;
        firstName?: string;
        lastName?: string;
        name?: string;
        userRankTier?: string;
        avatar?: string;
        profilePicture?: string;
    };
    referrals: NetworkUser[];
}

// Avatar resolution delegated to the central rankAvatars registry.
// This handles all rank IDs including -2 / -3 variants, legacy IDs, and custom URLs.
function getAvatarUrl(avatar?: string, rank?: string): string {
    return resolveAvatarUrl(avatar, rank);
}

function getDisplayName(user: { name?: string; firstName?: string; lastName?: string }): string {
    return user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Member";
}

function handleAvatarError(e: React.SyntheticEvent<HTMLImageElement>) {
    (e.target as HTMLImageElement).src = "/avatars/avatar-1.png";
}

/**
 * Standardized rank badge — matches the badge used under the profile photo
 * in the dashboard hero exactly: white chip, black border, bottom-right
 * corner tag.
 */
function RankBadge({ rankTier, size = "md" }: { rankTier?: string; size?: "sm" | "md" }) {
    const title = (rankTier || "E-Rank").toUpperCase();
    return (
        <div
            className={cn(
                "absolute z-10 whitespace-nowrap rounded-md border-2 border-black bg-white font-black uppercase tracking-widest text-black",
                size === "md" ? "-bottom-2 -right-2 px-3 py-1 text-[10px]" : "-bottom-1.5 -right-1.5 px-2 py-0.5 text-[8px]"
            )}
        >
            {title}
        </div>
    );
}

/**
 * Single-tier network view: one root "You" card connected to a responsive
 * grid of direct referrals. The old build supported infinite-depth recursion
 * for a multilevel program; that program was retired in favor of a flat,
 * direct-only referral system, so the tree is intentionally fixed at one
 * level — there is no Level 2 to render.
 */
export function ReferralTree({ currentUser, referrals }: ReferralTreeProps) {
    const directReferrals = useMemo(() => {
        return [...referrals]
            .filter((r) => r.level === 1)
            .sort((a, b) => parseFloat(b.earningsFromUser || "0") - parseFloat(a.earningsFromUser || "0"));
    }, [referrals]);

    const rootAvatar = currentUser.profilePicture || getAvatarUrl(currentUser.avatar, currentUser.userRankTier);

    return (
        <div
            className="relative flex w-full flex-col items-center px-4 py-12 md:py-16"
            style={{
                backgroundImage: "radial-gradient(rgba(20, 20, 19,0.08) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
            }}
            data-testid="referral-tree"
        >
            {/* Root: You */}
            <div className="relative flex flex-col items-center">
                <div className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl md:h-48 md:w-48" aria-hidden="true" />
                <TechnicalLabel text="YOU" className="relative mb-4 text-black/40" />
                <div className="relative">
                    <div className="h-24 w-24 overflow-hidden rounded-2xl border-2 border-black bg-black shadow-[0_16px_36px_rgba(20, 20, 19,0.18)] md:h-28 md:w-28">
                        <img
                            src={rootAvatar}
                            alt={getDisplayName(currentUser)}
                            className="h-full w-full object-cover"
                            onError={handleAvatarError}
                        />
                    </div>
                    <RankBadge rankTier={currentUser.userRankTier} size="md" />
                </div>
                <div className="mt-5 max-w-[220px] truncate text-center text-base font-black uppercase tracking-tighter text-black md:text-lg">
                    {getDisplayName(currentUser)}
                </div>
            </div>

            {/* Connector: root trunk down to the referral row */}
            <div className="relative flex flex-col items-center" aria-hidden="true">
                <span className="h-1.5 w-1.5 rounded-full bg-black/20" />
                <div className="h-8 w-px bg-black/15 md:h-10" />
            </div>

            {directReferrals.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <div className="mb-8 flex items-center gap-3 md:mb-10">
                        <span className="h-px w-8 bg-black/15" />
                        <div className="technical-label text-black/40">
                            REFERRALS · <span className="font-bold text-black/70">{directReferrals.length}</span>
                        </div>
                        <span className="h-px w-8 bg-black/15" />
                    </div>

                    <div className="grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-5 lg:grid-cols-5">
                        {directReferrals.map((referral) => (
                            <ReferralCard key={referral.id} user={referral} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function ReferralCard({ user }: { user: NetworkUser }) {
    const avatarUrl = user.profilePicture || getAvatarUrl(user.avatar, user.userRankTier);
    const earnings = parseFloat(user.earningsFromUser || "0");

    return (
        <div
            className={cn(
                "group relative flex flex-col items-center rounded-2xl border border-black/15 bg-white px-3 pb-5 pt-6 shadow-[0_2px_10px_rgba(20, 20, 19,0.03)] transition-all duration-300",
                "hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_12px_28px_rgba(20, 20, 19,0.1)]"
            )}
            data-testid={`referral-card-${user.id}`}
        >
            <div className="relative">
                <div className="h-14 w-14 overflow-hidden rounded-xl border-2 border-black bg-black shadow-sm md:h-16 md:w-16">
                    <img
                        src={avatarUrl}
                        alt={getDisplayName(user)}
                        className="h-full w-full object-cover"
                        onError={handleAvatarError}
                    />
                </div>
                <RankBadge rankTier={user.userRankTier} size="sm" />
            </div>

            <div className="mt-4 w-full truncate text-center text-[11px] font-black uppercase tracking-tight text-black md:text-xs">
                {getDisplayName(user)}
            </div>

            {earnings > 0 ? (
                <div className="mt-2 rounded-full bg-primary/10 px-2.5 py-1 text-center text-[10px] font-black leading-none text-primary md:text-[11px]">
                    +{formatPoints(user.earningsFromUser)}
                </div>
            ) : (
                <div
                    className={cn(
                        "mt-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide leading-none md:text-[10px]",
                        user.isOnline ? "bg-emerald-500/10 text-emerald-600" : "bg-black/[0.04] text-black/30"
                    )}
                    data-testid={`status-${user.isOnline ? "online" : "offline"}-${user.id}`}
                >
                    <span
                        className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            user.isOnline ? "bg-emerald-500" : "bg-black/20"
                        )}
                        aria-hidden="true"
                    />
                    {user.isOnline ? "Active" : "Not Active"}
                </div>
            )}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex w-full max-w-xs flex-col items-center" data-testid="referral-tree-empty">
            {/* Ghost slot — same shape language as a populated ReferralCard so the
                empty state reads as "your first referral will appear here", not
                as an unrelated error/empty block. */}
            <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-black/15 bg-black/[0.015] px-8 pb-6 pt-7">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-black/20 md:h-16 md:w-16">
                    <Plus className="h-5 w-5 text-black/25" strokeWidth={2.25} />
                </div>
                <div className="mt-4 whitespace-nowrap text-[10px] font-black uppercase tracking-tight text-black/30 md:text-[11px]">
                    Open Slot
                </div>
            </div>
        </div>
    );
}
