/**
 * MemberAvatarEditor — Engine C "My Profile" picture editor.
 *
 * Lets any guild member change the profile picture that appears across
 * Engine C (roster cards, DM lists, leaderboard, wars). Reuses the same
 * universal avatar set + custom-upload flow as the account Profile modal and
 * saves through PATCH /api/profile, then invalidates the auth + guild roster
 * queries so the new picture shows up everywhere immediately.
 */
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  resolveAvatarUrl,
  UNIVERSAL_AVATARS,
  DEFAULT_AVATAR_ID,
} from "@/lib/rankAvatars";
import { SectionChip, CTA_CLASS, OUTLINE_CLASS } from "./GuildPanelShell";
import { GiPortrait, GiSwordSpin, GiCrossedAxes } from "./guild-icons";
import { cn } from "@/lib/utils";

export function MemberAvatarEditor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const savedAvatar = user?.avatar;
  const isSavedUniversal =
    typeof savedAvatar === "string" &&
    UNIVERSAL_AVATARS.some((a) => a.id === savedAvatar);

  const [avatar, setAvatar] = useState<string>(
    savedAvatar === "custom" || isSavedUniversal ? (savedAvatar as string) : DEFAULT_AVATAR_ID
  );
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(
    user?.profilePicture || null
  );
  const [isUploading, setIsUploading] = useState(false);

  const isDirty =
    avatar !== (user?.avatar === "custom" || isSavedUniversal ? savedAvatar : DEFAULT_AVATAR_ID) ||
    (avatar === "custom" ? uploadedPhotoUrl !== (user?.profilePicture || null) : !!user?.profilePicture);

  const saveMutation = useMutation({
    mutationFn: async (payload: { avatar: string; profilePicture?: string | null }) => {
      const r = await apiRequest("PATCH", "/api/profile", payload);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Could not save profile picture");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Profile Picture Updated", description: "Your new picture is live across the guild." });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
      // Refresh every Engine C surface that renders member avatars.
      if (user?.guildId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.guildMembers(user.guildId) });
        queryClient.invalidateQueries({ queryKey: ["/api/guilds", user.guildId] });
      }
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err?.message || "Could not update picture.", variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Profile images must be 5MB or smaller.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedPhotoUrl(reader.result as string);
      setAvatar("custom");
      setIsUploading(false);
    };
    reader.onerror = () => {
      toast({ title: "Upload failed", description: "Could not read that image.", variant: "destructive" });
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const previewSrc =
    avatar === "custom" && uploadedPhotoUrl ? uploadedPhotoUrl : resolveAvatarUrl(avatar);

  const handleSave = () => {
    const payload: any = { avatar };
    if (avatar === "custom" && uploadedPhotoUrl) {
      payload.profilePicture = uploadedPhotoUrl;
    } else if (avatar !== "custom") {
      payload.profilePicture = null;
    }
    saveMutation.mutate(payload);
  };

  return (
    <div className="rounded-2xl border-2 border-black/10 bg-white p-4 md:p-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between gap-3 mb-4">
        <SectionChip>PROFILE PICTURE</SectionChip>
        <GiPortrait size={15} className="text-primary shrink-0" />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Live preview */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 border-black bg-[#EAE5DD] overflow-hidden flex items-center justify-center">
            {previewSrc ? (
              <img src={previewSrc} alt="Profile preview" className="w-full h-full object-cover" />
            ) : (
              <GiPortrait size={22} className="text-black/40" />
            )}
          </div>
          <div className="sm:hidden">
            <p className="text-[10px] font-black uppercase tracking-wider text-black/40">
              Shown across the whole guild
            </p>
          </div>
        </div>

        {/* Universal avatar grid */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mb-2.5">
            Choose a portrait
          </p>
          <div className="grid grid-cols-6 gap-2.5">
            {UNIVERSAL_AVATARS.map((av) => {
              const isSelected = avatar === av.id;
              return (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => { setAvatar(av.id); setUploadedPhotoUrl(null); }}
                  aria-pressed={isSelected}
                  aria-label={`Select avatar ${av.label}`}
                  title={av.label}
                  className={cn(
                    "relative w-full aspect-square rounded-lg overflow-hidden border-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "border-primary ring-2 ring-primary/30 scale-[1.06]"
                      : "border-black/10 hover:border-black hover:scale-[1.04]"
                  )}
                >
                  <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>

          {/* Custom upload / remove */}
          <div className="flex flex-wrap items-center gap-2 mt-3.5">
            <label
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-black text-white text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-primary transition-colors",
                isUploading && "opacity-60 pointer-events-none"
              )}
            >
              {isUploading ? (
                <GiSwordSpin size={12} className="animate-spin" />
              ) : (
                <GiPortrait size={12} />
              )}
              {avatar === "custom" ? "Change photo" : "Upload your own"}
              <input type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
            </label>
            {avatar === "custom" && (
              <button
                type="button"
                onClick={() => { setUploadedPhotoUrl(null); setAvatar(DEFAULT_AVATAR_ID); }}
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border-2 border-black/15 text-[10px] font-black uppercase tracking-wider text-black/50 hover:border-destructive hover:text-destructive transition-colors"
                )}
              >
                <GiCrossedAxes size={12} />
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {isDirty && (
        <div className="flex gap-2.5 mt-4 pt-4 border-t-[3px] border-black/10">
          <Button
            className={cn(CTA_CLASS, "flex-1")}
            disabled={saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? (
              <GiSwordSpin size={14} className="animate-spin" />
            ) : (
              <GiPortrait size={14} />
            )}
            Save Picture
          </Button>
          <Button
            className={cn(OUTLINE_CLASS, "flex-1")}
            disabled={saveMutation.isPending}
            onClick={() => {
              setAvatar(savedAvatar === "custom" || isSavedUniversal ? (savedAvatar as string) : DEFAULT_AVATAR_ID);
              setUploadedPhotoUrl(user?.profilePicture || null);
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default MemberAvatarEditor;
