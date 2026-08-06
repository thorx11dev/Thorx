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
import TechnicalLabel from "@/components/ui/technical-label";
import { UserCircle, Link, Star, Save, Plus, X, Loader2, AlertCircle } from "lucide-react";

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
      toast({ title: mode === "wizard" ? "Guild Profile Created! 🎉" : "Profile Updated!" });
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
      <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
        <Loader2 size={16} className="animate-spin text-primary" />
        <span className="text-sm font-medium">Loading profile…</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="border-2 border-destructive/30 bg-destructive/5 rounded-xl p-5 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <div>
          <p className="font-bold text-sm text-foreground">Could not load your profile</p>
          <p className="text-xs text-muted-foreground mt-0.5">There was a problem reaching the server.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-red-500 text-xs font-bold uppercase tracking-wider hover:underline"
        >
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
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <UserCircle size={24} className="text-primary" />
          </div>
          <div>
            <h3 className="font-black text-lg md:text-xl tracking-tight text-foreground">Your Guild Profile</h3>
            <p className="text-xs text-muted-foreground mt-1">
              How you appear to your teammates in <strong className="text-foreground">{guildName}</strong>.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
            <UserCircle size={16} className="text-primary" />
          </div>
          <TechnicalLabel text="My Guild Profile" className="text-foreground" />
        </div>
      )}

      {/* Username */}
      <div>
        <TechnicalLabel text="Guild Username" className="text-muted-foreground mb-1.5" />
        <Input
          value={form.username}
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
          placeholder="Your name in this guild"
          maxLength={50}
          className="h-10"
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-[11px] text-muted-foreground">How teammates see you</p>
          <span className="text-[10px] text-muted-foreground">{form.username.length}/50</span>
        </div>
      </div>

      {/* Description / Bio */}
      <div>
        <TechnicalLabel text="Bio (optional)" className="text-muted-foreground mb-1.5" />
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Tell your guild about yourself, your goals, when you're most active…"
          rows={3}
          maxLength={500}
          className="w-full border-2 border-black/20 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-black transition-colors bg-white"
        />
        <div className="text-[10px] text-muted-foreground text-right mt-1">{form.description.length}/500</div>
      </div>

      {/* Links */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <TechnicalLabel text="Links (max 5)" className="text-muted-foreground" />
          {form.links.length < 5 && !showLinkForm && (
            <button
              onClick={() => setShowLinkForm(true)}
              className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              <Plus size={12} /> Add Link
            </button>
          )}
        </div>
        {form.links.map((link, idx) => (
          <div key={idx} className="flex items-center gap-2.5 border-2 border-black/10 rounded-xl px-3.5 py-2.5 bg-muted/30">
            <Link size={13} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-foreground truncate">{link.label}</div>
              <div className="text-[10px] text-muted-foreground truncate">{link.url}</div>
            </div>
            <button
              onClick={() => removeLink(idx)}
              className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
              aria-label={`Remove ${link.label} link`}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {showLinkForm && (
          <PremiumCard interactive={false} className="p-3.5 space-y-2.5">
            <Input
              placeholder="Label (e.g. LinkedIn)"
              value={newLink.label}
              onChange={e => setNewLink(l => ({ ...l, label: e.target.value }))}
              className="h-9 text-sm"
              maxLength={50}
            />
            <Input
              placeholder="URL (https://...)"
              value={newLink.url}
              onChange={e => setNewLink(l => ({ ...l, url: e.target.value }))}
              className="h-9 text-sm"
            />
            <div className="flex gap-2 pt-0.5">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => { setShowLinkForm(false); setNewLink({ label: "", url: "" }); }}
              >
                Cancel
              </Button>
              <Button size="sm" className="flex-1 h-8 text-xs" onClick={addLink}>Add</Button>
            </div>
          </PremiumCard>
        )}
      </div>

      {/* Favorite member */}
      {activeMembers.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Star size={12} className="text-yellow-500" />
            <TechnicalLabel text="Favorite Teammate (optional)" className="text-muted-foreground" />
          </div>
          <select
            value={form.favoriteMemberId ?? ""}
            onChange={e => setForm(f => ({ ...f, favoriteMemberId: e.target.value || null }))}
            className="w-full h-10 text-sm border-2 border-black/20 rounded-xl px-3 bg-white focus:outline-none focus:border-black transition-colors"
          >
            <option value="">— None —</option>
            {activeMembers.map((m: any) => (
              <option key={m.userId} value={m.userId}>
                {m.firstName || m.identity || "Member"}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Save */}
      <div className="flex gap-3 pt-1">
        {mode === "wizard" && onDone && (
          <Button variant="outline" className="flex-1 min-h-[44px]" onClick={onDone}>
            Skip for Now
          </Button>
        )}
        <Button
          className={mode === "wizard" ? "flex-1 min-h-[44px] font-bold" : "w-full min-h-[44px] font-bold"}
          disabled={!form.username.trim() || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <Loader2 size={14} className="animate-spin mr-1.5" />
          ) : (
            <Save size={14} className="mr-1.5" />
          )}
          {mode === "wizard" ? "Create Profile" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export default GuildProfileWizard;
