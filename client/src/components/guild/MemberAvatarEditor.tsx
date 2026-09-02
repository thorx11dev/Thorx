/**
 * MemberAvatarEditor — Engine C "My Profile" picture editor.
 *
 * Avatar selector mirrors the account Profile modal: circular tiles with
 * ring-highlight selection, uploaded-photo support, monochrome actions.
 * Saves through PATCH /api/profile and invalidates the auth + roster queries
 * so the new picture shows up everywhere immediately.
 */
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
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
import { CTA_CLASS, OUTLINE_CLASS } from "./GuildPanelShell";
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
    <div className="rounded-2xl border-2 border-black/10 bg-white p-3.5 sm:p-4 md:p-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      {/* Live preview + upload actions — stacked & centered on mobile */}
      <div className="flex flex-col items-center gap-4 mb-5 sm:flex-row sm:items-center sm:justify-between">
        <div
          className={cn(
            "w-24 h-24 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full overflow-hidden transition-all duration-200 ring-2 ring-offset-2 ring-offset-white shrink-0",
            avatar === "custom" ? "ring-primary" : "ring-black"
          )}
        >
          {previewSrc ? (
            <img src={previewSrc} alt="Profile preview" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#EAE5DD]">
              <ImagePlus size={20} className="text-black/30" />
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <label
            className={cn(
              "inline-flex items-center justify-center gap-1.5 h-11 sm:h-9 px-4 sm:px-3.5 rounded-lg bg-black text-white text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-primary transition-colors",
              isUploading && "opacity-60 pointer-events-none"
            )}
          >
            {isUploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
            {avatar === "custom" ? "Change Photo" : "Upload Photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
          </label>
          {avatar === "custom" && (
            <button
              type="button"
              onClick={() => { setUploadedPhotoUrl(null); setAvatar(DEFAULT_AVATAR_ID); }}
              className="inline-flex items-center justify-center gap-1.5 h-11 sm:h-9 px-4 sm:px-3.5 rounded-lg border-2 border-black/15 text-[10px] font-black uppercase tracking-widest text-black/50 hover:border-destructive hover:text-destructive transition-colors"
            >
              <X size={12} strokeWidth={2.5} />
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Universal avatar grid — profile-modal selector style */}
      <div className="rounded-2xl bg-[#EAE5DD]/30 border-2 border-black/10 p-3.5 sm:p-4 md:p-5">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 sm:gap-3 md:gap-5 justify-items-center">
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
                    "relative block w-16 h-16 md:w-16 md:h-16 rounded-full overflow-hidden transition-all duration-200 ring-2 ring-offset-2 ring-offset-white",
                    isSelected
                      ? "ring-primary scale-[1.06]"
                      : "ring-black/10 group-hover:ring-black/40 group-hover:scale-[1.04]"
                  )}
                >
                  <img
                    src={av.url}
                    alt={av.label}
                    className="w-full h-full object-cover pointer-events-none"
                    draggable={false}
                  />
                </span>
                
              </button>
            );
          })}
        </div>
      </div>

      {isDirty && (
        <div className="flex gap-2.5 mt-4 pt-4 border-t-[3px] border-black/10">
          <Button
            className={cn(CTA_CLASS, "flex-1")}
            disabled={saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
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
