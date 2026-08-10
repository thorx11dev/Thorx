/**
 * GuildProfileWizard — THORX v3 (Phase 5, Phase 3 premium redesign)
 * First-time setup wizard for guild profile.
 * Also used as an edit form for existing profiles.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PremiumCard } from "@/components/ui/premium-card";
import { SectionChip, CTA_CLASS, OUTLINE_CLASS, FIELD_CLASS, FIELD_AREA_CLASS, FieldLabel, SelectField } from "./GuildPanelShell";
import { MemberAvatarEditor } from "./MemberAvatarEditor";
import { GiPortrait, GiLinkedRings, GiLaurelsTrophy, GiRoundShield, GiCrossedSwords, GiCrossedAxes, GiSwordSpin, GiSpartanHelmet } from "./guild-icons";
import { cn } from "@/lib/utils";

interface GuildProfileWizardProps {
  guildId: string;
  guildName: string;
  onDone?: () => void;
  mode?: "wizard" | "edit";
}

export function GuildProfileWizard({ guildId, guildName, onDone, mode = "wizard" }: GuildProfileWizardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: profileData,
    isLoading,
    isError,
    refetch,
  } = useQuery<any>({
    queryKey: ["/api/guilds", guildId, "profile", "me"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/guilds/${guildId}/profile/me`);
      return r.json();
    },
  });

  const { data: membersData } = useQuery<any>({
    queryKey: ["/api/guilds", guildId, "members"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/guilds/${guildId}/members`);
      return r.json();
    },
  });

  const [form, setForm] = useState({
    username: "",
    description: "",
    links: [] as { label: string; url: string }[],
    favoriteMemberId: null as string | null,
  });
  const [newGiLinkedRings, setNewGiLinkedRings] = useState({ label: "", url: "" });
  const [showGiLinkedRingsForm, setShowGiLinkedRingsForm] = useState(false);

  useEffect(() => {
    if (profileData?.profile) {
      setForm({
        username: profileData.profile.username || "",
        description: profileData.profile.description || "",
        links: profileData.profile.links || [],
        favoriteMemberId: profileData.profile.favoriteMemberId || null,
      });
    } else if (user) {
      setForm(f => ({
        ...f,
        username: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.identity || "",
      }));
    }
  }, [profileData, user]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/guilds/${guildId}/profile`, form);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: mode === "wizard" ? "Guild Profile Created! 🎉" : "Profile Updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "profile", "me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "profiles"] });
      onDone?.();
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const activeMembers = (membersData?.members ?? []).filter((m: any) => m.status === "active" && m.userId !== user?.id);

  const addGiLinkedRings = () => {
    if (!newGiLinkedRings.label.trim() || !newGiLinkedRings.url.trim()) return;
    try { new URL(newGiLinkedRings.url); } catch { toast({ title: "Invalid URL", variant: "destructive" }); return; }
    setForm(f => ({ ...f, links: [...f.links, { label: newGiLinkedRings.label.trim(), url: newGiLinkedRings.url.trim() }] }));
    setNewGiLinkedRings({ label: "", url: "" });
    setShowGiLinkedRingsForm(false);
  };

  const removeGiLinkedRings = (idx: number) => {
    setForm(f => ({ ...f, links: f.links.filter((_, i) => i !== idx) }));
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8">
        <GiSwordSpin size={16} className="animate-spin text-primary" />
        <span className="text-sm font-medium text-black/55">Loading profile…</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="border-2 border-black/10 bg-white rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
        <div className="p-3 bg-[#EAE5DD] border-2 border-black/10 rounded-xl">
          <GiSpartanHelmet className="w-5 h-5 text-black/50" />
        </div>
        <div>
          <p className="font-bold text-sm text-black">Could not load your profile</p>
          <p className="text-xs font-medium text-black/50 mt-0.5">There was a problem reaching the server.</p>
        </div>
        <button onClick={() => refetch()} className={cn(CTA_CLASS, "h-10 px-4 text-[10px]")}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      {mode === "wizard" ? (
        <div className="text-center space-y-2 pb-1">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-[#EAE5DD] border-2 border-black/10 flex items-center justify-center mx-auto">
            <GiPortrait size={24} className="text-primary" />
          </div>
          <div>
            <h3 className="font-black text-lg md:text-xl tracking-tight text-black">Your Guild Profile</h3>
            <p className="text-xs font-medium text-black/50 mt-1">
              How you appear to your teammates in <strong className="text-black">{guildName}</strong>.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <SectionChip>MY GUILD PROFILE</SectionChip>
          <GiPortrait size={16} className="text-primary" />
        </div>
      )}

      {/* Profile picture — account-wide avatar that shows across Engine C */}
      <MemberAvatarEditor />

      {/* Username */}
      <div>
        <FieldLabel hint={`${form.username.length}/50`}>Guild Username</FieldLabel>
        <Input
          value={form.username}
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
          placeholder="Your name in this guild"
          maxLength={50}
          className={FIELD_CLASS}
        />
        <p className="text-[10px] font-black uppercase tracking-wider text-black/40 mt-1.5">How teammates see you</p>
      </div>

      {/* Description / Bio */}
      <div>
        <FieldLabel hint={`${form.description.length}/500`}>Bio · Optional</FieldLabel>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Tell your guild about yourself, your goals, when you're most active…"
          rows={3}
          maxLength={500}
          className={cn(FIELD_AREA_CLASS, "min-h-[100px]")}
        />
      </div>

      {/* Links */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <SectionChip>LINKS · MAX 5</SectionChip>
          {form.links.length < 5 && !showGiLinkedRingsForm && (
            <button
              onClick={() => setShowGiLinkedRingsForm(true)}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border-2 border-primary/40 text-primary font-black uppercase tracking-wider text-[10px] hover:bg-primary/5 transition-colors"
            >
              <GiCrossedSwords size={12} /> Add Link
            </button>
          )}
        </div>
        {form.links.map((link, idx) => (
          <div key={idx} className="flex items-center gap-2.5 border-2 border-black/10 rounded-lg px-3.5 py-2.5 bg-white">
            <GiLinkedRings size={13} className="text-black/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-black truncate">{link.label}</div>
              <div className="text-[10px] text-black/40 truncate">{link.url}</div>
            </div>
            <button
              onClick={() => removeGiLinkedRings(idx)}
              className="text-black/40 hover:text-destructive shrink-0 transition-colors"
              aria-label={`Remove ${link.label} link`}
            >
              <GiCrossedAxes size={13} />
            </button>
          </div>
        ))}
        {showGiLinkedRingsForm && (
          <PremiumCard interactive={false} className="p-3.5 space-y-2.5 border-2 border-black/10">
            <Input
              placeholder="Label (e.g. LinkedIn)"
              value={newGiLinkedRings.label}
              onChange={e => setNewGiLinkedRings(l => ({ ...l, label: e.target.value }))}
              className={cn(FIELD_CLASS, "h-10")}
              maxLength={50}
            />
            <Input
              placeholder="URL (https://...)"
              value={newGiLinkedRings.url}
              onChange={e => setNewGiLinkedRings(l => ({ ...l, url: e.target.value }))}
              className={cn(FIELD_CLASS, "h-10")}
            />
            <div className="flex gap-2 pt-0.5">
              <Button className={cn(OUTLINE_CLASS, "flex-1 h-9")} onClick={() => { setShowGiLinkedRingsForm(false); setNewGiLinkedRings({ label: "", url: "" }); }}>
                Cancel
              </Button>
              <Button className={cn(CTA_CLASS, "flex-1 h-9")} onClick={addGiLinkedRings}>Add</Button>
            </div>
          </PremiumCard>
        )}
      </div>

      {/* Favorite member */}
      {activeMembers.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <GiLaurelsTrophy size={12} className="text-primary" />
            <FieldLabel className="mb-0">Favorite Teammate · Optional</FieldLabel>
          </div>
          <SelectField
            value={form.favoriteMemberId ?? ""}
            onChange={e => setForm(f => ({ ...f, favoriteMemberId: e.target.value || null }))}
          >
            <option value="">— None —</option>
            {activeMembers.map((m: any) => (
              <option key={m.userId} value={m.userId}>
                {m.firstName || m.identity || "Member"}
              </option>
            ))}
          </SelectField>
        </div>
      )}

      {/* Save */}
      <div className="flex gap-3 pt-1">
        {mode === "wizard" && onDone && (
          <Button className={cn(OUTLINE_CLASS, "flex-1")} onClick={onDone}>
            Skip for Now
          </Button>
        )}
        <Button
          className={mode === "wizard" ? cn(CTA_CLASS, "flex-1") : cn(CTA_CLASS, "w-full")}
          disabled={!form.username.trim() || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <GiSwordSpin size={14} className="animate-spin" />
          ) : (
            <GiRoundShield size={14} />
          )}
          {mode === "wizard" ? "Create Profile" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export default GuildProfileWizard;
