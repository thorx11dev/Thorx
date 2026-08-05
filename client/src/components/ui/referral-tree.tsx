import * as React from "react";
import { useMemo } from "react";
import { Users } from "lucide-react";
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
 * Standardized rank badge — plain white/black, no per-rank color coding.
 * Mirrors the Dashboard hero's rank badge exactly (see UserPortal.tsx getRank)
 * so the network view never looks like a different, older product.
 */
function RankBadge({ rankTier, size = "md" }: { rankTier?: string; size?: "sm" | "md" }) {
    const title = (rankTier || "E-Rank").toUpperCase();
    return (
        <div
            className={cn(
                "absolute -bottom-1.5 -right-1.5 z-10 rounded-md border-2 border-black bg-white font-black uppercase tracking-widest text-black shadow-sm whitespace-nowrap",
                size === "md" ? "px-2.5 py-1 text-[9px] md:text-[10px]" : "px-1.5 py-0.5 text-[7px] md:text-[8px]"
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
        <div className="flex w-full flex-col items-center px-4 py-10 md:py-14" data-testid="referral-tree">
            {/* Root: You */}
            <div className="flex flex-col items-center">
                <TechnicalLabel text="YOU" className="mb-3 text-black/40" />
                <div className="relative">
                    <div className="h-24 w-24 overflow-hidden rounded-2xl border-2 border-black bg-black shadow-[0_12px_32px_rgba(0,0,0,0.12)] md:h-28 md:w-28">
                        <img
                            src={rootAvatar}
                            alt={getDisplayName(currentUser)}
                            className="h-full w-full object-cover"
                            onError={handleAvatarError}
                        />
                    </div>
                    <RankBadge rankTier={currentUser.userRankTier} size="md" />
                </div>
                <div className="mt-4 max-w-[220px] truncate text-center text-base font-black uppercase tracking-tighter text-black md:text-lg">
                    {getDisplayName(currentUser)}
                </div>
            </div>

            {directReferrals.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    {/* Connector from root down to the referral grid */}
                    <div className="h-10 w-px bg-black/15 md:h-12" aria-hidden="true" />

                    <div className="mb-8 flex items-center gap-3 md:mb-10">
                        <span className="h-px w-8 bg-black/15" />
                        <TechnicalLabel text={`DIRECT REFERRALS · ${directReferrals.length}`} className="text-black/40" />
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
                "group flex flex-col items-center rounded-2xl border border-black/15 bg-white px-3 py-5 transition-all duration-300",
                "hover:border-primary/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
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

            <div className="mt-3 w-full truncate text-center text-[11px] font-black uppercase tracking-tight text-black md:text-xs">
                {getDisplayName(user)}
            </div>

            {earnings > 0 && (
                <div className="mt-1 text-center text-[10px] font-bold leading-tight text-primary md:text-[11px]">
                    +{formatPoints(user.earningsFromUser)}
                </div>
            )}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex max-w-sm flex-col items-center py-12 text-center md:py-16" data-testid="referral-tree-empty">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-black/15 bg-black/[0.03]">
                <Users className="h-6 w-6 text-black/30" strokeWidth={1.75} />
            </div>
            <div className="mb-2 text-sm font-black uppercase tracking-tight text-black">
                No Direct Referrals Yet
            </div>
            <p className="text-xs leading-relaxed text-black/50">
                Share your referral code above — everyone who joins with it will appear here.
            </p>
        </div>
    );
}
