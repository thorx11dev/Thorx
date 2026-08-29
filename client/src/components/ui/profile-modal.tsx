import { useState, useEffect, useRef } from "react";
import { X, User, Camera, Star, Check, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useLocation } from "wouter";
import TechnicalLabel from "@/components/ui/technical-label";
import TwoFactorCard from "@/components/ui/two-factor-card";
import { Progress } from "@/components/ui/progress";
import { PS_THRESHOLDS } from "@/components/PSProgressCard";
import {
  getRankDef,
  resolveAvatarUrl,
  UNIVERSAL_AVATARS,
  DEFAULT_AVATAR_ID,
} from "@/lib/rankAvatars";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  activeRefsCount?: number;
}

export function ProfileModal({ isOpen, onClose, user, activeRefsCount = 0 }: ProfileModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [showValidation, setShowValidation] = useState(false);
  const [avatar, setAvatar] = useState(user?.avatar || DEFAULT_AVATAR_ID);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(user?.profilePicture || null);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarOverlayVisible, setAvatarOverlayVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // THORX v3 (spec F.9): guild context — name + MVP badge for guild members/captains.
  const guildId = user?.guildId ?? null;
  const { data: guildInfo } = useQuery<any>({
    queryKey: ["/api/guilds", guildId, "profile-modal"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/guilds/${guildId}`);
      const d = await r.json();
      return d;
    },
    enabled: isOpen && !!guildId,
  });
  const guildName = guildInfo?.guild?.name ?? null;
  const isGuildMvp = !!guildInfo?.members?.find((m: any) => m.userId === user?.id)?.isMvp;

  // Current rank config (badge color/label only — avatars are rank-independent)
  const rankDef = getRankDef(user?.rank);

  // Field-level validation — both names are required to save
  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();
  const isFirstNameValid = trimmedFirstName.length >= 2;
  const isLastNameValid = trimmedLastName.length >= 2;

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setFirstName(user?.firstName || "");
      setLastName(user?.lastName || "");
      setShowValidation(false);

      // Keep a valid saved avatar (universal set or custom upload); otherwise use the default
      const savedAvatar = user?.avatar;
      const isUniversal = savedAvatar && UNIVERSAL_AVATARS.some((a) => a.id === savedAvatar);
      setAvatar(savedAvatar === "custom" || isUniversal ? savedAvatar : DEFAULT_AVATAR_ID);

      setUploadedPhotoUrl(user?.profilePicture || null);
      document.body.style.overflow = "hidden";
    } else {
      setIsVisible(false);
      document.body.style.overflow = "auto";
    }
  }, [isOpen, user]);

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 5MB.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setUploadedPhotoUrl(base64);
      setAvatar("custom");
      setIsUploading(false);
    };
    reader.onerror = () => {
      toast({ title: "Upload failed", description: "Could not read the image.", variant: "destructive" });
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; avatar: string; profilePicture?: string | null }) => {
      const res = await apiRequest("PATCH", "/api/profile", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save profile");
      }
      return res.json(); // { message, user }
    },
    onMutate: async (newData) => {
      // QUERY_KEYS.sessionAuth is the canonical key used by useAuth
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.sessionAuth });
      const previousUser = queryClient.getQueryData(QUERY_KEYS.sessionAuth);

      queryClient.setQueryData(QUERY_KEYS.sessionAuth, (old: any) => ({
        ...old,
        name: `${newData.firstName} ${newData.lastName}`.trim(),
        firstName: newData.firstName,
        lastName: newData.lastName,
        avatar: newData.avatar,
        // Use Object.prototype.hasOwnProperty to distinguish explicit null (clear)
        // from undefined (not provided) — ?? would treat null as "not set"
        profilePicture: Object.prototype.hasOwnProperty.call(newData, "profilePicture")
          ? newData.profilePicture
          : old?.profilePicture,
      }));
      onClose();
      return { previousUser };
    },
    onSuccess: (response) => {
      // Server returns { message, user } — write the user object into the cache
      const updatedUser = response?.user ?? response;
      if (updatedUser) queryClient.setQueryData(QUERY_KEYS.sessionAuth, updatedUser);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.referrals });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.referralsLeaderboard });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardStats });
      toast({ title: "Profile Updated", description: "Your changes have been saved." });
    },
    onError: (_err, _newData, context: any) => {
      if (context?.previousUser) queryClient.setQueryData(QUERY_KEYS.sessionAuth, context.previousUser);
      toast({ title: "Error", description: "Could not save changes.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!isFirstNameValid || !isLastNameValid) {
      setShowValidation(true);
      return;
    }
    const payload: any = { firstName: trimmedFirstName, lastName: trimmedLastName, avatar };
    if (avatar === "custom" && uploadedPhotoUrl) {
      payload.profilePicture = uploadedPhotoUrl;
    } else if (avatar !== "custom") {
      payload.profilePicture = null;
    }
    updateProfileMutation.mutate(payload);
  };

  // Resolve what to show in the avatar preview
  const previewSrc =
    avatar === "custom" && uploadedPhotoUrl
      ? uploadedPhotoUrl
      : resolveAvatarUrl(avatar);

  const isAdmin = user?.role === "admin" || user?.role === "founder" || user?.role === "team";

  const getRankDetails = (rankTier?: string) => {
    if (isAdmin) {
      let displayTitle = "REGULAR";
      if (user?.role === "founder") displayTitle = "FOUNDER";
      if (user?.role === "admin") displayTitle = "ADMIN";
      return { title: displayTitle };
    }
    return { title: rankTier?.toUpperCase() || "E-RANK" };
  };

  const rank = getRankDetails(user?.userRankTier);

  // Performance Score progress toward the next rank (mirrors PSProgressCard's thresholds).
  const performanceScore = Number(user?.performanceScore || 0);
  const psTier = PS_THRESHOLDS[user?.userRankTier as string] ?? PS_THRESHOLDS["E-Rank"];
  let psPct = 100;
  let psRemaining: number | null = null;
  if (psTier.max !== null) {
    const range = psTier.max - psTier.min + 1;
    const progress = Math.max(0, performanceScore - psTier.min);
    psPct = Math.min(100, (progress / range) * 100);
    psRemaining = psTier.max + 1 - performanceScore;
  }

  const displayName = `${firstName} ${lastName}`.trim();

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-profile bg-black text-white transition-opacity duration-300 ease-out overflow-y-auto",
        isVisible ? "opacity-100" : "opacity-0"
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Profile settings"
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Close Button */}
      <button
        onClick={onClose}
        aria-label="Close profile settings"
        className="fixed top-4 right-4 md:top-6 md:right-6 z-50 w-10 h-10 md:w-11 md:h-11 flex items-center justify-center bg-white/10 hover:bg-white hover:text-black text-white/70 transition-all duration-200 rounded-full"
      >
        <X className="w-5 h-5" strokeWidth={2} />
      </button>

      {/* Page layout */}
      <div className="min-h-full flex flex-col justify-center px-5 py-16 md:px-12 md:py-12 max-w-5xl mx-auto">

        {/* Header */}
        <div className={cn(
          "mb-8 md:mb-10 transition-all duration-500 delay-100",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        )}>
          <TechnicalLabel text="Account Settings" className="text-white/35 mb-3" />
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase leading-none">Profile</h1>
          <div className="h-[3px] w-14 bg-primary mt-4 rounded-full" />
        </div>

        {/* Two-column content */}
        <div className={cn(
          "grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 transition-all duration-500 delay-200",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
        )}>

          {/* ── Left: Preview + Rank Card ── */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-6 md:p-8 relative overflow-hidden transition-colors duration-300 hover:bg-white/[0.06] h-full shadow-[0_25px_60px_-25px_rgba(0,0,0,0.8)]">

              {/* Avatar + name row */}
              <div className="flex items-center gap-5">
                {/* Clickable avatar preview */}
                <div
                  className="relative group/avatar flex-shrink-0"
                  onTouchStart={() => setAvatarOverlayVisible(true)}
                  onTouchEnd={() => setAvatarOverlayVisible(false)}
                  onTouchCancel={() => setAvatarOverlayVisible(false)}
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] overflow-hidden">
                    {previewSrc ? (
                      <img src={previewSrc} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-10 h-10 text-white/20" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className={cn(
                      "absolute inset-0 rounded-full bg-black/70 transition-opacity duration-200 flex items-center justify-center cursor-pointer touch-manipulation",
                      "group-hover/avatar:opacity-100 group-active/avatar:opacity-100 focus-visible:opacity-100 active:opacity-100",
                      avatarOverlayVisible ? "opacity-100" : "opacity-0"
                    )}
                    title="Upload photo"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5 text-white" />
                    )}
                  </button>
                </div>

                {/* Name + rank badge */}
                <div className="min-w-0">
                  <p className="text-white/35 text-[10px] font-black uppercase tracking-widest mb-1.5">Current Profile</p>
                  <p className="text-white font-black text-lg md:text-xl uppercase tracking-tighter leading-tight truncate">
                    {displayName || "—"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    <div className={cn(
                      "inline-block text-[11px] font-black text-white px-3 py-1 uppercase tracking-widest rounded-full ring-1 ring-white/10",
                      rankDef.bgColor
                    )}>
                      {rank.title}
                    </div>
                    {isGuildMvp && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black text-black bg-amber-400 px-2.5 py-1 uppercase tracking-widest rounded-full">
                        <Star className="w-2.5 h-2.5" /> MVP
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Performance Score progress toward next rank */}
              {!isAdmin && (
                <div className="mt-6 pt-6 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-widest text-white/40 uppercase">
                      Performance Score
                    </span>
                    <span className="text-sm font-black text-white" data-testid="text-performance-score">
                      {performanceScore.toLocaleString()} PS
                    </span>
                  </div>
                  <Progress value={psPct} className="h-2.5 bg-white/10" />
                  <div className="flex items-center justify-between text-[11px] text-white/40">
                    <span>{psTier.min.toLocaleString()} PS</span>
                    <span>{psTier.max !== null ? `${(psTier.max + 1).toLocaleString()} PS` : "MAX"}</span>
                  </div>
                  {psRemaining !== null && psTier.next ? (
                    <p className="text-xs text-white/60">
                      <span className="font-bold text-white">{psRemaining.toLocaleString()} more PS</span> to reach {psTier.next}
                    </p>
                  ) : (
                    <p className="text-xs text-white/60">Top rank reached — all features unlocked.</p>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* ── Right: Edit form ── */}
          <div className="lg:col-span-7 flex flex-col gap-6 md:gap-8">

            {/* First / Last name */}
            <div className="space-y-3">
              <span className="text-[10px] font-black tracking-widest text-white/40 uppercase">Name</span>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    aria-label="First name"
                    aria-invalid={showValidation && !isFirstNameValid}
                    className={cn(
                      "bg-white/[0.04] border hover:border-white/20 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-xl px-4 py-5 md:py-6 text-base md:text-xl font-black h-auto text-white transition-all placeholder:text-white/20",
                      showValidation && !isFirstNameValid
                        ? "border-red-500/60 focus-visible:border-red-500"
                        : "border-white/10 focus-visible:border-primary"
                    )}
                    placeholder="FIRST NAME"
                    maxLength={50}
                  />
                  {showValidation && !isFirstNameValid && (
                    <p className="mt-1.5 px-1 text-[11px] font-semibold text-red-400">First name is required</p>
                  )}
                </div>
                <div>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-label="Last name"
                    aria-invalid={showValidation && !isLastNameValid}
                    className={cn(
                      "bg-white/[0.04] border hover:border-white/20 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-xl px-4 py-5 md:py-6 text-base md:text-xl font-black h-auto text-white transition-all placeholder:text-white/20",
                      showValidation && !isLastNameValid
                        ? "border-red-500/60 focus-visible:border-red-500"
                        : "border-white/10 focus-visible:border-primary"
                    )}
                    placeholder="LAST NAME"
                    maxLength={50}
                  />
                  {showValidation && !isLastNameValid && (
                    <p className="mt-1.5 px-1 text-[11px] font-semibold text-red-400">Last name is required</p>
                  )}
                </div>
              </div>
            </div>

            {/* Avatar selector */}
            <div className="space-y-2">
              <span className="text-[10px] font-black tracking-widest text-white/40 uppercase">
                Choose an Avatar
              </span>
              <div className="rounded-3xl bg-white/[0.03] border border-white/10 p-4 md:p-5">
                <div className="grid grid-cols-3 gap-4 sm:gap-5">
                  {UNIVERSAL_AVATARS.map((av) => {
                    const isSelected = avatar === av.id;
                    return (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => { setAvatar(av.id); setUploadedPhotoUrl(null); }}
                        aria-pressed={isSelected}
                        aria-label={`Select avatar ${av.label}`}
                        className="group flex flex-col items-center gap-2 focus:outline-none"
                      >
                        <span
                          className={cn(
                            "relative block w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden transition-all duration-200 ring-2 ring-offset-2 ring-offset-black",
                            isSelected
                              ? "ring-primary scale-[1.06]"
                              : "ring-white/10 group-hover:ring-white/30 group-hover:scale-[1.04]"
                          )}
                        >
                          <img
                            src={av.url}
                            alt={av.label}
                            className="w-full h-full object-cover pointer-events-none"
                            draggable={false}
                          />
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wider transition-colors",
                            isSelected ? "text-white" : "text-white/40 group-hover:text-white/70"
                          )}
                        >
                          {av.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Two-factor authentication */}
            <TwoFactorCard />

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mt-auto">
              <Button
                onClick={handleSave}
                disabled={updateProfileMutation.isPending || isUploading}
                className="h-12 md:h-14 px-8 bg-primary text-white hover:bg-primary/90 font-black uppercase tracking-tighter rounded-xl active:scale-[0.98] transition-all flex-1 text-sm md:text-base"
              >
                {updateProfileMutation.isPending ? "SAVING..." : "SAVE CHANGES"}
              </Button>
              <Button
                variant="ghost"
                onClick={onClose}
                className="h-12 md:h-14 px-8 text-white/40 hover:text-white hover:bg-white/10 font-black uppercase tracking-tighter rounded-xl border border-white/10 transition-all sm:flex-none text-sm md:text-base"
              >
                CANCEL
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
