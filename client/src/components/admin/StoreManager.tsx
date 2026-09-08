// ── THORX Store Manager (Team Portal) ────────────────────────────────────────
// Full catalog management without code deploys: create/edit store items,
// publish/unpublish/archive, pricing, featured, ordering. Drafts/archived are
// never served to users (server filters by status). ref_key is validated
// against the visual registry — arbitrary code/CSS can never be injected.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TechnicalLabel from "@/components/ui/technical-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Search, Store, ShieldCheck } from "lucide-react";

interface AdminStoreItem {
  id: string;
  itemType: "theme" | "component";
  refKey: string;
  title: string;
  description: string;
  category: string;
  pricePoints: number;
  status: "draft" | "published" | "unpublished" | "archived";
  featured: boolean;
  sortOrder: number;
  version: number;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  published: "bg-green-500/10 text-green-600 border-green-500/30",
  unpublished: "bg-black/5 text-black/50 border-black/15",
  archived: "bg-red-500/10 text-red-500 border-red-500/30",
};

const REGISTRY_KEYS = [
  { value: "theme_blueprint", label: "Theme: Blueprint", type: "theme" },
  { value: "theme_pitch", label: "Theme: Pitch Black", type: "theme" },
  { value: "theme_stage", label: "Theme: Stage Light", type: "theme" },
  { value: "theme_scrapbook", label: "Theme: Sticker Album", type: "theme" },
  { value: "theme_terminal", label: "Theme: Quiet Terminal", type: "theme" },
  { value: "dashboard_cards_serif", label: "Cards: Serif Ledger", type: "component" },
  { value: "dashboard_cards_mono", label: "Cards: Terminal Row", type: "component" },
  { value: "dashboard_cards_sticker", label: "Cards: Sticker Pop", type: "component" },
];

const emptyForm = {
  itemType: "theme" as "theme" | "component",
  refKey: "",
  title: "",
  description: "",
  category: "general",
  pricePoints: 0,
  status: "draft" as AdminStoreItem["status"],
  featured: false,
  sortOrder: 100,
};

export default function StoreManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminStoreItem | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<{ items: AdminStoreItem[] }>({
    queryKey: ["/api/admin/store/items"],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (i) => !q || i.title.toLowerCase().includes(q) || i.refKey.includes(q),
    );
  }, [data, search]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing === "new") {
        const res = await apiRequest("POST", "/api/admin/store/items", form);
        if (!res.ok) throw await res.json().catch(() => ({ message: "Create failed" }));
        return res.json();
      }
      const res = await apiRequest("PATCH", `/api/admin/store/items/${(editing as AdminStoreItem).id}`, form);
      if (!res.ok) throw await res.json().catch(() => ({ message: "Update failed" }));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Store item saved" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/store/items"] });
    },
    onError: (e: any) => {
      toast({
        title: e?.error === "UNKNOWN_REF_KEY" ? "Unknown ref key" : "Save failed",
        description: e?.message ?? "Check the values and try again.",
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AdminStoreItem["status"] }) => {
      const res = await apiRequest("PATCH", `/api/admin/store/items/${id}`, { status });
      if (!res.ok) throw await res.json().catch(() => ({ message: "Status change failed" }));
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/store/items"] }),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditing("new");
  };

  const openEdit = (item: AdminStoreItem) => {
    setForm({
      itemType: item.itemType,
      refKey: item.refKey,
      title: item.title,
      description: item.description,
      category: item.category,
      pricePoints: item.pricePoints,
      status: item.status,
      featured: item.featured,
      sortOrder: item.sortOrder,
    });
    setEditing(item);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
            <Store className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="font-black text-lg tracking-tight">Store Catalog</h2>
            <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">
              {(data?.items ?? []).length} items · drafts never reach users
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or ref key…"
              className="pl-8 h-10 w-52 rounded-xl border-black/15"
            />
          </div>
          <Button onClick={openCreate} className="h-10 px-4 rounded-xl bg-black text-white hover:bg-primary font-black text-[10px] uppercase tracking-widest">
            <Plus className="size-3.5 mr-1" /> New Item
          </Button>
        </div>
      </div>

      {/* Safety note */}
      <div className="flex items-start gap-2.5 rounded-xl border border-green-600/20 bg-green-500/5 px-4 py-3">
        <ShieldCheck className="size-4 text-green-600 shrink-0 mt-0.5" />
        <p className="text-[11px] font-medium text-black/60 leading-relaxed">
          <strong>Design-system marketplace:</strong> ref keys map to validated visual
          definitions. Admin edits change commerce metadata (price, availability, order) —
          they can never inject code or CSS into the user's browser.
        </p>
      </div>

      {/* List */}
      <div className="rounded-2xl border-2 border-black bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Store className="size-6 text-black/25 mx-auto mb-3" />
            <p className="text-sm font-bold text-black/50">No store items yet — create the first one.</p>
          </div>
        ) : (
          <div className="divide-y divide-black/10">
            {filtered.map((item) => (
              <div key={item.id} className="p-4 md:px-6 flex items-center gap-4 flex-wrap md:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-sm tracking-tight truncate">{item.title}</p>
                    <span className={cn("text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border", STATUS_STYLES[item.status])}>
                      {item.status}
                    </span>
                    {item.featured && <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">Featured</span>}
                  </div>
                  <p className="text-[10px] font-mono text-black/35 truncate mt-0.5">
                    {item.itemType} · {item.refKey} · {item.pricePoints.toLocaleString()} PTS · order {item.sortOrder}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.status !== "published" && (
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-[9px] font-black uppercase rounded-lg border-black/15"
                      onClick={() => statusMutation.mutate({ id: item.id, status: "published" })}>
                      Publish
                    </Button>
                  )}
                  {item.status === "published" && (
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-[9px] font-black uppercase rounded-lg border-black/15"
                      onClick={() => statusMutation.mutate({ id: item.id, status: "unpublished" })}>
                      Unpublish
                    </Button>
                  )}
                  {item.status !== "archived" && (
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-[9px] font-black uppercase rounded-lg border-red-200 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500"
                      onClick={() => statusMutation.mutate({ id: item.id, status: "archived" })}>
                      Archive
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-lg border-black/15"
                    onClick={() => openEdit(item)} aria-label={`Edit ${item.title}`}>
                    <Pencil className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="bg-white rounded-2xl border-2 border-black w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 md:p-6">
            <TechnicalLabel text={editing === "new" ? "NEW STORE ITEM" : "EDIT STORE ITEM"} className="mb-4" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <TechnicalLabel text="TYPE" className="mb-1.5" />
                  <select
                    value={form.itemType}
                    disabled={editing !== "new"}
                    onChange={(e) => setForm({ ...form, itemType: e.target.value as any })}
                    className="w-full h-11 rounded-xl border border-black/15 bg-white px-3 text-sm font-bold"
                  >
                    <option value="theme">Theme</option>
                    <option value="component">Component Variant</option>
                  </select>
                </div>
                <div>
                  <TechnicalLabel text="REF KEY (validated)" className="mb-1.5" />
                  <select
                    value={form.refKey}
                    disabled={editing !== "new"}
                    onChange={(e) => setForm({ ...form, refKey: e.target.value })}
                    className="w-full h-11 rounded-xl border border-black/15 bg-white px-3 text-sm font-bold"
                  >
                    <option value="">Select…</option>
                    {REGISTRY_KEYS.filter((k) => k.type === form.itemType).map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <TechnicalLabel text="TITLE" className="mb-1.5" />
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-11 rounded-xl border-black/15" />
              </div>

              <div>
                <TechnicalLabel text="DESCRIPTION" className="mb-1.5" />
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="rounded-xl border-black/15" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <TechnicalLabel text="PRICE (PTS)" className="mb-1.5" />
                  <Input
                    type="number" min={0}
                    value={form.pricePoints}
                    onChange={(e) => setForm({ ...form, pricePoints: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                    className="h-11 rounded-xl border-black/15 tabular-nums"
                  />
                </div>
                <div>
                  <TechnicalLabel text="SORT ORDER" className="mb-1.5" />
                  <Input
                    type="number" min={0}
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                    className="h-11 rounded-xl border-black/15 tabular-nums"
                  />
                </div>
                <div>
                  <TechnicalLabel text="STATUS" className="mb-1.5" />
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    className="w-full h-11 rounded-xl border border-black/15 bg-white px-3 text-sm font-bold"
                  >
                    {["draft", "published", "unpublished", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                  className="w-4 h-4 accent-[#D97757]"
                />
                <span className="text-xs font-bold">Featured (highlight in store)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" className="h-11 px-5 rounded-xl border-black/15 font-black text-[10px] uppercase tracking-widest" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                className="h-11 px-5 rounded-xl bg-black text-white hover:bg-primary font-black text-[10px] uppercase tracking-widest"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.refKey || !form.title.trim()}
              >
                {saveMutation.isPending ? "Saving…" : "Save Item"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
