/**
 * GuildProfileWizard — THORX v3 (Phase 5, million-dollar redesign)
 * First-time setup wizard for guild profile. Also used as an edit form.
 * Landing/notification language: mono group labels, icon-chip header, hard shadows.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Link2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PremiumCard } from "@/components/ui/premium-card";
import { CTA_CLASS, OUTLINE_CLASS, FIELD_CLASS, FIELD_AREA_CLASS, FieldLabel, SelectField } from "./GuildPanelShell";
import { MemberAvatarEditor } from "./MemberAvatarEditor";
import { GiPortrait, GiLinkedRings, GiSwordSpin } from "./guild-icons";
import { cn } from "@/lib/utils";

interface GuildProfileWizardProps {
  guildId: string;
  guildName: string;
  onDone?: () => void;
  mode?: "wizard" | "edit";
}

/** Mono group label + hairline — notification-panel section signature. */
function GroupLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/35 uppercase whitespace-nowrap">{text}</span>
      <div className="h-px flex-1 bg-black/10" />
    </div>
  );
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
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [showLinkForm, setShowLinkForm] = useState(false);

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
      toast({ title: mode === "wizard" ? "Guild Profile Created!" : "Profile Updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "profile", "me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guilds", guildId, "profiles"] });
      onDone?.();
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const activeMembers = (membersData?.members ?? []).filter((m: any) => m.status === "active" && m.userId !== user?.id);

  const addLink = () => {
    if (!newLink.label.trim() || !newLink.url.trim()) return;
    try { new URL(newLink.url); } catch { toast({ title: "Invalid URL", variant: "destructive" }); return; }
    setForm(f => ({ ...f, links: [...f.links, { label: newLink.label.trim(), url: newLink.url.trim() }] }));
    setNewLink({ label: "", url: "" });
    setShowLinkForm(false);
  };

  const removeLink = (idx: number) => {
    setForm(f => ({ ...f, links: f.links.filter((_, i) => i !== idx) }));
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10">
        <GiSwordSpin size={15} className="animate-spin text-primary" />
        <span className="text-[10px] font-mono font-bold tracking-[0.3em] text-black/45 uppercase">Loading profile…</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="border-2 border-black/10 bg-white rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 bg-[#EAE5DD] border-2 border-black/10 rounded-2xl flex items-center justify-center">
          <GiPortrait className="w-6 h-6 text-black/25" />
        </div>
        <div>
          <p className="font-black text-sm text-black uppercase tracking-tighter">Could not load your profile</p>
          <p className="text-[10px] font-mono font-bold tracking-[0.2em] text-black/40 uppercase mt-1">Server unreachable</p>
        </div>
        <button onClick={() => refetch()} className={cn(CTA_CLASS, "h-10 px-5 text-[10px]")}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header — icon-chip style (edit mode); centered display (wizard mode) */}
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
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg bg-black text-white border-2 border-black flex items-center justify-center shrink-0">
            <GiPortrait size={16} className="text-primary" />
          </span>
          <div className="font-black text-sm uppercase tracking-tight">Guild Profile</div>
        </div>
      )}

      {/* Profile picture — account-wide avatar that shows across Engine C */}
      <MemberAvatarEditor />

      <div className="space-y-5">
        {/* Identity */}
        <GroupLabel text="Identity" />
        <div>
          <FieldLabel hint={`${form.username.length}/50`}>Guild Username</FieldLabel>
          <Input
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder="Your name in this guild"
            maxLength={50}
            className={FIELD_CLASS}
          />
        </div>

        {/* Bio */}
        <GroupLabel text="About" />
        <div>
          <FieldLabel hint={`${form.description.length}/500`}>Bio · Optional</FieldLabel>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Tell your guild about yourself…"
            rows={3}
            maxLength={500}
            className={cn(FIELD_AREA_CLASS, "min-h-[100px]")}
          />
        </div>

        {/* Links — white cards with mono URLs */}
        <GroupLabel text={`Links · ${form.links.length}/5`} />
        <div className="space-y-2">
          {form.links.map((link, idx) => (
            <div key={idx} className="flex items-center gap-3 border-2 border-black/10 rounded-xl px-3.5 py-2.5 bg-white transition-colors hover:border-black">
              <span className="w-8 h-8 rounded-lg bg-[#EAE5DD] border-2 border-black/10 flex items-center justify-center shrink-0">
                <Link2 size={13} className="text-black/45" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-black text-black truncate">{link.label}</div>
                <div className="text-[10px] font-mono text-black/40 truncate">{link.url}</div>
              </div>
              <button
                onClick={() => removeLink(idx)}
                className="w-8 h-8 rounded-full border-2 border-black/10 hover:border-destructive hover:text-destructive hover:bg-destructive/5 flex items-center justify-center text-black/40 shrink-0 transition-all"
                aria-label={`Remove ${link.label} link`}
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          ))}

          {form.links.length < 5 && !showLinkForm && (
            <button
              onClick={() => setShowLinkForm(true)}
              className="w-full h-11 rounded-xl border-2 border-dashed border-black/20 hover:border-black text-black/45 hover:text-black text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus size={13} strokeWidth={2.5} /> Add Link
            </button>
          )}

          {showLinkForm && (
            <div className="rounded-2xl border-2 border-black p-3.5 space-y-2.5 bg-white">
              <Input
                placeholder="Label"
                value={newLink.label}
                onChange={e => setNewLink(l => ({ ...l, label: e.target.value }))}
                className={cn(FIELD_CLASS, "h-10")}
                maxLength={50}
              />
              <Input
                placeholder="https://…"
                value={newLink.url}
                onChange={e => setNewLink(l => ({ ...l, url: e.target.value }))}
                className={cn(FIELD_CLASS, "h-10")}
              />
              <div className="flex gap-2 pt-0.5">
                <Button className={cn(OUTLINE_CLASS, "flex-1 h-9")} onClick={() => { setShowLinkForm(false); setNewLink({ label: "", url: "" }); }}>
                  Cancel
                </Button>
                <Button className={cn(CTA_CLASS, "flex-1 h-9")} onClick={addLink}>Add</Button>
              </div>
            </div>
          )}
        </div>

        {/* Favorite teammate */}
        {activeMembers.length > 0 && (
          <div>
            <GroupLabel text="Favorite Teammate · Optional" />
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
      </div>

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
          {saveMutation.isPending ? <GiSwordSpin size={14} className="animate-spin" /> : null}
          {mode === "wizard" ? "Create Profile" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export default GuildProfileWizard;
