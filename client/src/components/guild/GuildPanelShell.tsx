/**
 * GuildPanelShell — shared landing-grade shell for the Engine C role panels.
 *
 * One design system across Captain / Member / Assistant panels:
 *   • GuildIdentityHeader — nav-plate signature (`border-2 md:border-[3px] border-black`),
 *     ivory avatar stamp, guild name, role chip, GPS, weekly-target mini progress.
 *   • GuildTabBar — segmented control (`bg-white border-2/3 border-black p-1.5`),
 *     active tab = black fill, orange badge counts. Icons + labels; mobile scrolls.
 *   • RoleChip / SectionChip — black technical chips (landing label-chip style).
 *
 * Mirrors the THORX landing page radius/border/chip/CTA tokens exactly.
 */
import { useEffect } from "react";
import { GiSpartanHelmet, GiArrowhead, GiBowArrow } from "./guild-icons";
import { Progress } from "@/components/ui/progress";
import TechnicalLabel from "@/components/ui/technical-label";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────
 * Shared THORX panel primitives — one design system across Captain /
 * Member / Assistant / nested panels. Mirrors the landing page exactly:
 * hard black borders, orange CTAs, ivory wells, 3px hairlines.
 * ───────────────────────────────────────────────────────────────────────── */

/** Primary landing CTA — orange fill, hard black border, hover → black + scale. */
export const CTA_CLASS =
  "inline-flex items-center justify-center gap-2 bg-primary text-white border-2 border-black rounded-lg font-black uppercase tracking-wider text-xs h-11 px-5 min-h-[40px] transition-all duration-200 hover:bg-black hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none";

/** Secondary outline CTA — white fill, hairline black border, hover → black. */
export const OUTLINE_CLASS =
  "inline-flex items-center justify-center gap-2 bg-white text-black border-2 border-black/20 rounded-lg font-black uppercase tracking-wider text-xs h-11 px-5 min-h-[40px] transition-all duration-200 hover:border-black hover:bg-black/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none";

/** Destructive CTA — red fill, hard black border. */
export const DESTRUCTIVE_CLASS =
  "inline-flex items-center justify-center gap-2 bg-destructive text-white border-2 border-black rounded-lg font-black uppercase tracking-wider text-xs h-11 px-5 min-h-[40px] transition-all duration-200 hover:bg-black active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none";

/** Compact ghost icon button (40×40 touch target). */
export const ICON_BTN_CLASS =
  "inline-flex items-center justify-center w-10 h-10 rounded-lg border-2 border-black/15 bg-white text-black/55 transition-all duration-150 hover:border-black hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:pointer-events-none";

/** Field input — h-11, rounded-lg, hairline black border, orange focus. */
export const FIELD_CLASS =
  "w-full h-11 rounded-lg border-2 border-black/15 bg-white px-3 text-sm font-medium text-black placeholder:text-black/35 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors";

/** Field textarea — same border system, generous min height. */
export const FIELD_AREA_CLASS =
  "w-full min-h-[110px] rounded-lg border-2 border-black/15 bg-white px-3 py-2.5 text-sm font-medium text-black placeholder:text-black/35 resize-none focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors leading-relaxed";

/** Uppercase field label with optional orange hint. */
export function FieldLabel({ children, hint, className }: { children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 mb-1.5", className)}>
      <span className="text-[10px] font-black uppercase tracking-wider text-black/45">{children}</span>
      {hint && <span className="text-[10px] font-black uppercase tracking-wider text-primary">{hint}</span>}
    </div>
  );
}

/** Shared focus ring for custom interactive elements (links, rows, chips). */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Shaped skeleton block — landing-grade loading placeholder matching card geometry. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-black/[0.07] rounded-2xl", className)} />;
}

/** Card-shaped skeleton — mirrors DataCard shell for loading states. */
export function PanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-black/10 p-4 md:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="w-9 h-9 rounded-lg" />
        <SkeletonBlock className="h-3 w-40 max-w-[60%]" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} className="h-3 w-full" />
      ))}
      <div className="flex items-center justify-between pt-1">
        <SkeletonBlock className="h-8 w-24 rounded-lg" />
        <SkeletonBlock className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}

/** Destructive outline CTA — red ink, hairline red border, red fill on hover. */
export const DESTRUCTIVE_OUTLINE =
  "inline-flex items-center justify-center gap-2 bg-white text-destructive border-2 border-destructive/40 rounded-lg font-black uppercase tracking-wider text-xs h-11 px-5 min-h-[40px] transition-all duration-200 hover:border-destructive hover:bg-destructive/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none";

/** Ivory avatar stamp — brand mark: rounded-lg, black border, ivory fill, letter + image fallback. */
export function AvatarStamp({ name, avatarUrl, size = "md", className }: { name?: string; avatarUrl?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const cls = size === "sm" ? "w-9 h-9 text-sm" : size === "lg" ? "w-14 h-14 text-xl" : "w-12 h-12 text-lg";
  return (
    <div className={cn("relative border-2 border-black bg-[#E8E5D8] text-black flex items-center justify-center font-black shrink-0 overflow-hidden rounded-lg", cls, className)}>
      <span className="absolute inset-0 flex items-center justify-center">{(name || "M")[0].toUpperCase()}</span>
      {avatarUrl && (
        <img src={avatarUrl} alt={name} onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 w-full h-full object-cover" />
      )}
    </div>
  );
}

/** Landing-grade empty state — ivory well + icon + chip + caption. */
export function EmptyState({ icon, chip, title, caption }: { icon: React.ReactNode; chip?: string; title: string; caption?: string }) {
  return (
    <div className="bg-white rounded-2xl border-2 md:border-[3px] border-black text-center py-14 px-6">
      <div className="p-3 bg-[#E8E5D8] border-2 border-black/10 rounded-xl w-fit mx-auto mb-4">{icon}</div>
      {chip && <SectionChip className="mb-3">{chip}</SectionChip>}
      <p className="font-bold text-black">{title}</p>
      {caption && <p className="text-sm text-black/50 mt-1 font-medium">{caption}</p>}
    </div>
  );
}

/** Select field — FIELD_CLASS shell + custom chevron (replaces native arrow). */
export function SelectField({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(FIELD_CLASS, "appearance-none pr-9 cursor-pointer", className)}
      >
        {children}
      </select>
      <GiArrowhead size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/45" />
    </div>
  );
}

/** Segmented toggle — black/white pill pair (replaces native radios). */
export function SegmentedToggle({ options, value, onChange }: { options: { value: boolean; label: string }[]; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex bg-white border-2 border-black rounded-lg p-0.5 gap-0.5">
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-4 h-9 rounded-md text-[10px] font-black uppercase tracking-wider transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active ? "bg-black text-white" : "bg-transparent text-black/55 hover:text-black"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Chat composer — FIELD_CLASS input + orange send CTA + Enter handling. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  maxLength = 500,
  isPending,
  ariaLabel = "Send message",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  isPending?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="px-4 py-3 border-t-2 border-black/10 flex gap-2">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(FIELD_CLASS, "flex-1")}
        maxLength={maxLength}
        onKeyDown={e => { if (e.key === "Enter" && value.trim() && value.length <= maxLength) onSend(value.trim()); }}
      />
      <button
        className={cn(CTA_CLASS, "w-11 px-0 shrink-0")}
        aria-label={ariaLabel}
        disabled={!value.trim() || value.length > maxLength || isPending}
        onClick={() => onSend(value.trim())}
      >
        <GiBowArrow size={14} />
      </button>
    </div>
  );
}

/** Data card — white surface, hairline border, black border on hover (no hard shadow). */
export function DataCard({ children, className, onClick, interactive = true }: { children: React.ReactNode; className?: string; onClick?: () => void; interactive?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl border-2 border-black/10 p-4 md:p-5 transition-all duration-200",
        interactive && "hover:border-black",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Landing-grade inline error/retry. */
export function QueryError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center py-8">
      <div className="p-3 bg-[#E8E5D8] border-2 border-black/10 rounded-xl">
        <GiSpartanHelmet className="w-5 h-5 text-black/50" />
      </div>
      <p className="text-sm font-medium text-black/55">{message ?? "Failed to load."}</p>
      <button
        onClick={onRetry}
        className={CTA_CLASS + " h-10 px-4 text-[10px]"}
      >
        Retry
      </button>
    </div>
  );
}

/** Close a modal/sheet on the Escape key. Call at the top of the component. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Shared modal shell — centered card (desktop) / bottom sheet (mobile). */
export function ModalShell({
  onClose,
  children,
  footer,
  maxWidth = "sm:max-w-md",
  zIndex = "z-[60]",
}: {
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  zIndex?: string;
}) {
  useEscape(onClose);
  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-in fade-in duration-200`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white w-full ${maxWidth} rounded-t-2xl sm:rounded-2xl border-t-[3px] sm:border-[3px] border-black flex flex-col max-h-[92vh] animate-in duration-300 ease-out slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95`}
      >
        <div className="overflow-y-auto px-5 md:px-6 py-5 md:py-6">{children}</div>
        {footer && <div className="px-5 md:px-6 py-4 border-t-2 border-black/10">{footer}</div>}
      </div>
    </div>
  );
}

/** GPS → display tier — mirrors the server's live GPS config (rankMins) so a
 *  client-side fallback never disagrees with the backend's rank chips. */
export function gpsTier(gps: number): string {
  if (gps >= 300000) return "S-Rank";
  if (gps >= 150000) return "A-Rank";
  if (gps >= 70000)  return "B-Rank";
  if (gps >= 30000)  return "C-Rank";
  if (gps >= 10000)  return "D-Rank";
  return "E-Rank";
}

/** Black technical role chip — CAPTAIN / ASSISTANT / MEMBER. */
export function RoleChip({ role }: { role: "CAPTAIN" | "ASSISTANT" | "MEMBER" }) {
  return (
    <span className="inline-flex items-center bg-black text-white px-3 py-1 rounded-md font-black uppercase tracking-[0.2em] text-[10px]">
      {role}
    </span>
  );
}

/** Black technical section chip — e.g. `PENDING REQUESTS · 3`. */
export function SectionChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center bg-black text-white px-3 py-1.5 rounded-md font-black uppercase tracking-[0.2em] text-[10px]", className)}>
      {children}
    </span>
  );
}

interface GuildIdentityHeaderProps {
  guild: any;
  role: "CAPTAIN" | "ASSISTANT" | "MEMBER";
  memberCount?: number;
  avatarUrl?: string | null;
  /** Weekly progress (0–100). If undefined it is derived from guild fields. */
  weeklyPct?: number;
}

/** Guild identity header — nav-plate signature with avatar stamp + GPS + weekly mini-progress. */
export function GuildIdentityHeader({ guild, role, memberCount = 0, avatarUrl, weeklyPct }: GuildIdentityHeaderProps) {
  const gps = guild?.guildPerformanceScore ?? 0;
  const target = guild?.weeklyTarget ?? 0;
  const current = guild?.currentWeeklyPoints ?? 0;
  const pct = weeklyPct ?? (target > 0 ? Math.min(100, (current / target) * 100) : 0);

  return (
    <div className="bg-white rounded-2xl border-2 md:border-[3px] border-black p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          {/* Ivory avatar stamp with letter fallback */}
          <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-lg border-2 border-black bg-[#E8E5D8] text-black flex items-center justify-center font-black text-lg md:text-xl shrink-0 overflow-hidden">
            <span className="absolute inset-0 flex items-center justify-center">{(guild?.name || "G")[0].toUpperCase()}</span>
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt={guild?.name}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-lg md:text-2xl tracking-tight truncate">{guild?.name || "Guild"}</h2>
              <RoleChip role={role} />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-black/45 flex-wrap">
              <span className="text-primary">{gps.toLocaleString()} GPS</span>
              <span className="w-1 h-1 rounded-full bg-black/20" />
              <span>{memberCount} MEMBERS</span>
              {target > 0 && (
                <>
                  <span className="w-1 h-1 rounded-full bg-black/20" />
                  <span>{current.toLocaleString()} / {target.toLocaleString()} PS</span>
                </>
              )}
            </div>
          </div>
        </div>

        {target > 0 && (
          <div className="sm:w-52 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <TechnicalLabel text="WEEKLY TARGET" className="text-black/40 text-[10px]" />
              <span className="text-[10px] font-black tabular-nums text-black/60">{pct.toFixed(0)}%</span>
            </div>
            <Progress value={pct} className="h-1 bg-black/10 [&>div]:bg-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

interface GuildTabBarProps<T extends string> {
  tabs: { id: T; label: string; icon: React.ReactNode; badge?: number }[];
  value: T;
  onChange: (id: T) => void;
}

/** Segmented tab bar — landing-grade plate, black active fill, orange badges. */
export function GuildTabBar<T extends string>({ tabs, value, onChange }: GuildTabBarProps<T>) {
  return (
    <div className="flex gap-1 bg-white border-2 md:border-[3px] border-black rounded-2xl p-1.5 overflow-x-auto scrollbar-hide">
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative flex-1 min-w-[44px] h-11 flex items-center justify-center gap-1.5 px-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all duration-200",
              active
                ? "bg-black text-white"
                : "text-black/55 hover:text-black hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            {t.icon}
            <span className="hidden sm:inline whitespace-nowrap">{t.label}</span>
            {(t.badge ?? 0) > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center border-2 border-black/10">
                {(t.badge ?? 0) > 9 ? "9+" : t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
