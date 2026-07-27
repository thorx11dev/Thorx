/**
 * GuildProfileWizard — THORX v3 (Phase 5)
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
import { Badge } from "@/components/ui/badge";
import { UserCircle, Link, Star, Save, Plus, X, Loader2 } from "lucide-react";

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

  const { data: profileData, isLoading } = useQuery<any>({
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-zinc-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {mode === "wizard" && (
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mx-auto">
            <UserCircle size={24} className="text-white" />
          </div>
          <div className="font-black text-lg">Your Guild Profile</div>
          <p className="text-xs text-zinc-500">How you appear to your teammates in <strong>{guildName}</strong>.</p>
        </div>
      )}

      {/* Username */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-700 block">Guild Username <span className="text-zinc-400 font-normal">(how teammates see you)</span></label>
        <Input
          value={form.username}
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
          placeholder="Your name in this guild"
          maxLength={50}
        />
        <div className="text-[10px] text-zinc-400 text-right">{form.username.length}/50</div>
      </div>

      {/* Description / Bio */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-700 block">Bio <span className="text-zinc-400 font-normal">(optional)</span></label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Tell your guild about yourself, your goals, when you're most active…"
          rows={3}
          maxLength={500}
          className="w-full border border-zinc-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
        />
        <div className="text-[10px] text-zinc-400 text-right">{form.description.length}/500</div>
      </div>

      {/* Links */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-700">Links <span className="text-zinc-400 font-normal">(max 5)</span></label>
          {form.links.length < 5 && !showLinkForm && (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setShowLinkForm(true)}>
              <Plus size={12} /> Add Link
            </Button>
          )}
        </div>
        {form.links.map((link, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-zinc-50 rounded-lg px-3 py-2">
            <Link size={12} className="text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{link.label}</div>
              <div className="text-[10px] text-zinc-400 truncate">{link.url}</div>
            </div>
            <button onClick={() => removeLink(idx)} className="text-zinc-400 hover:text-red-500 shrink-0">
              <X size={12} />
            </button>
          </div>
        ))}
        {showLinkForm && (
          <div className="rounded-lg border border-zinc-200 p-3 space-y-2">
            <Input placeholder="Label (e.g. LinkedIn)" value={newLink.label} onChange={e => setNewLink(l => ({ ...l, label: e.target.value }))} className="h-8 text-sm" maxLength={50} />
            <Input placeholder="URL (https://...)" value={newLink.url} onChange={e => setNewLink(l => ({ ...l, url: e.target.value }))} className="h-8 text-sm" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setShowLinkForm(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={addLink}>Add</Button>
            </div>
          </div>
        )}
      </div>

      {/* Favorite member */}
      {activeMembers.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1">
            <Star size={12} className="text-yellow-500" /> Favorite Teammate <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <select
            value={form.favoriteMemberId ?? ""}
            onChange={e => setForm(f => ({ ...f, favoriteMemberId: e.target.value || null }))}
            className="w-full h-9 text-sm border border-zinc-200 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-black"
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
      <div className="flex gap-2 pt-2">
        {mode === "wizard" && onDone && (
          <Button variant="outline" className="flex-1" onClick={onDone}>Skip for Now</Button>
        )}
        <Button
          className={mode === "wizard" ? "flex-1" : "w-full"}
          disabled={!form.username.trim() || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
          {mode === "wizard" ? "Create Profile" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export default GuildProfileWizard;
