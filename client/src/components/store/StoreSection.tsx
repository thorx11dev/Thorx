// ── THORX Store — UI component marketplace ───────────────────────────────────
// Sells polished UI COMPONENT VARIANTS for TX-Points (themes retired — the
// default THORX design language is the single visual system). Every variant
// renders its REAL className treatment in the preview card, so what you see
// is exactly what installs. Ownership ≠ activation (server-enforced).

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Layers, X, ShoppingBag, Crown, Sparkles } from "lucide-react";
import TechnicalLabel from "@/components/ui/technical-label";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStore, usePurchaseStoreItem, useActivateStoreItem, type StoreItemDto } from "@/lib/store-api";
import { COMPONENT_VARIANT_DEFS, COMPONENT_SLOT_LABELS } from "@/lib/store-registry";
import { captureEvent } from "@/lib/posthog";

type StoreTab = "components" | "collection";

function PriceTag({ price, owned }: { price: number; owned: boolean }) {
  if (owned) return <span className="text-[10px] font-black uppercase tracking-wider text-green-600">Owned</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-black text-foreground tabular-nums">
      {price === 0 ? "FREE" : `${price.toLocaleString()} PTS`}
    </span>
  );
}

/** Live variant preview — renders the ACTUAL component markup with the
 *  variant's REAL className treatment. Not a mockup: exactly what installs. */
function VariantPreview({ variant }: { variant: { cardClass: string; headClass: string; valueClass: string } }) {
  const sample = [
    { label: "TX-POINTS", value: "12,480" },
    { label: "REFERRALS", value: "27" },
    { label: "PS SCORE", value: "3,140" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 md:gap-4" data-testid="variant-live-preview">
      {sample.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "group bg-white border-2 border-black rounded-2xl p-4 md:p-5 text-left transition-all duration-300",
            variant.cardClass,
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <span className={cn("text-[9px] font-black text-muted-foreground pt-0.5", variant.headClass)}>{s.label}</span>
          </div>
          <p className={cn("text-2xl font-black text-foreground mb-0.5 tracking-tighter tabular-nums", i === 0 && "text-primary", variant.valueClass)}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function StoreSection() {
  const { data, isLoading } = useStore();
  const purchase = usePurchaseStoreItem();
  const activate = useActivateStoreItem();
  const [tab, setTab] = useState<StoreTab>("components");
  const [previewItem, setPreviewItem] = useState<StoreItemDto | null>(null);

  const components = useMemo(() => (data?.items ?? []).filter((i) => i.itemType === "component"), [data]);
  const ownedItems = useMemo(
    () => (data?.items ?? []).filter((i) => data?.ownedItemIds.includes(i.id)),
    [data],
  );
  const activeVariant = components.find((c) => data?.active.components[c.category] === c.id);

  const renderItemCard = (item: StoreItemDto) => {
    const def = COMPONENT_VARIANT_DEFS[item.refKey];
    if (!def) return null;
    const isActive = data?.active.components[item.category] === item.id;

    return (
      <motion.button
        key={item.id}
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => { captureEvent("store_preview", { item: item.refKey }); setPreviewItem(item); }}
        className={cn(
          "group text-left rounded-2xl border-2 bg-white p-4 transition-all",
          isActive ? "border-primary shadow-[6px_6px_0px_0px_rgba(217,119,87,0.25)]" : "border-black/10 hover:border-black",
        )}
        data-testid={`store-item-${item.refKey}`}
      >
        {/* Live variant preview — real treatment, scaled-down data */}
        <div className="scale-[0.92] origin-top-left pointer-events-none">
          <VariantPreview variant={{ cardClass: def.cardClass, headClass: def.headClass, valueClass: def.valueClass }} />
        </div>

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-black text-sm text-foreground tracking-tight truncate">{def.title}</p>
            <p className="text-[10px] font-bold text-muted-foreground truncate">{def.tagline}</p>
          </div>
          {isActive ? (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-white text-[8px] font-black uppercase tracking-wider">
              <Check className="size-2.5" /> Active
            </span>
          ) : item.owned ? (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/5 text-black/50 text-[8px] font-black uppercase tracking-wider">
              <Crown className="size-2.5" /> Owned
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <PriceTag price={item.pricePoints} owned={item.owned} />
          <span className="text-[9px] font-black uppercase tracking-widest text-primary group-hover:underline">
            Preview
          </span>
        </div>
      </motion.button>
    );
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
      className="max-w-[1600px] mx-auto px-4 md:px-12 py-8 md:pt-4 md:pb-12 relative z-10 w-full"
    >
      {/* Hero */}
      <motion.div
        initial={false}
        className="rounded-2xl p-6 md:p-12 mb-0 relative overflow-hidden border-2 bg-[#141413] h-[160px] md:h-[220px] flex items-center justify-center md:justify-start"
      >
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -left-16 -bottom-24 w-56 h-56 bg-primary/5 rounded-full blur-3xl" />
        <div className="relative z-10 text-center md:text-left">
          <div className="text-[10px] font-black uppercase tracking-[0.35em] text-white/40 mb-2">Personalize your environment</div>
          <h1 className="font-black tracking-tighter uppercase leading-none text-[clamp(2rem,10vw,4.5rem)] text-white">
            STO<span className="text-primary">RE</span>
          </h1>
        </div>
      </motion.div>

      <div className="my-10" />

      {/* Tabs */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div className="flex gap-2">
          {([
            { id: "components", label: "Components", icon: Layers },
            { id: "collection", label: "My Thorx", icon: Crown },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 md:px-5 h-11 rounded-xl border-2 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all",
                tab === t.id ? "bg-black text-white border-black" : "bg-white text-black/50 border-black/10 hover:border-black hover:text-black",
              )}
              data-testid={`store-tab-${t.id}`}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-black/40">
          <ThorxSpinner size={16} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Loading store…</span>
        </div>
      ) : tab === "components" ? (
        <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 max-w-4xl">
          {components.map(renderItemCard)}
          {components.length === 0 && (
            <div className="col-span-full rounded-2xl border-2 border-dashed border-black/15 py-14 text-center">
              <Sparkles className="w-6 h-6 text-black/25 mx-auto mb-3" />
              <p className="text-sm font-bold text-black/50">New component variants are being crafted. Check back soon.</p>
            </div>
          )}
        </motion.div>
      ) : (
        /* My Thorx — collection + active slots */
        <div className="space-y-6 max-w-3xl">
          <div className="rounded-2xl border-2 border-black bg-white p-5 md:p-6">
            <TechnicalLabel text="ACTIVE CUSTOMIZATION" className="text-black/40 mb-4" />
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
                <Layers className="size-4 text-primary" />
              </span>
              <div>
                <p className="font-black text-sm">{activeVariant ? COMPONENT_VARIANT_DEFS[activeVariant.refKey]?.title ?? activeVariant.title : "Thorx Classic"}</p>
                <p className="text-[10px] font-bold text-black/40">
                  Dashboard Cards {activeVariant ? "· variant live" : "· original look"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-black bg-white p-5 md:p-6">
            <TechnicalLabel text={`COLLECTION · ${ownedItems.length}`} className="text-black/40 mb-4" />
            {ownedItems.length === 0 ? (
              <p className="text-xs font-medium text-black/40">Nothing installed yet — earn TX-Points in Work, then make this place yours.</p>
            ) : (
              <div className="space-y-2.5">
                {ownedItems.map((item) => {
                  const def = COMPONENT_VARIANT_DEFS[item.refKey];
                  const isActive = data?.active.components[item.category] === item.id;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ShoppingBag className="size-4 text-black/30 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-black text-xs truncate">{def?.title ?? item.title}</p>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-black/35">
                            {COMPONENT_SLOT_LABELS[item.category] ?? "Component"}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isActive ? "outline" : "default"}
                        className={cn(
                          "h-8 px-3 text-[9px] font-black uppercase tracking-wider rounded-lg",
                          isActive ? "border-black/15 text-black/50" : "bg-black text-white hover:bg-primary",
                        )}
                        onClick={() => activate.mutate({ itemId: item.id, deactivate: Boolean(isActive) })}
                        disabled={activate.isPending}
                      >
                        {isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview / install dialog — live variant preview at full size */}
      <AnimatePresence>
        {previewItem && (() => {
          const def = COMPONENT_VARIANT_DEFS[previewItem.refKey];
          if (!def) return null;
          const isActive = data?.active.components[previewItem.category] === previewItem.id;
          const error = (purchase.error as any)?.code || (activate.error as any)?.code;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={(e) => { if (e.target === e.currentTarget) setPreviewItem(null); }}
              role="dialog"
              aria-modal="true"
              aria-label={`${def.title} preview`}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="bg-white rounded-2xl border-2 border-black w-full max-w-xl overflow-hidden max-h-[90vh] overflow-y-auto"
              >
                {/* Live full-size preview */}
                <div className="bg-[#FAF9F5] border-b-2 border-black p-5 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <TechnicalLabel text="LIVE PREVIEW — EXACTLY WHAT INSTALLS" className="text-black/40" />
                  </div>
                  <VariantPreview variant={{ cardClass: def.cardClass, headClass: def.headClass, valueClass: def.valueClass }} />
                </div>

                <div className="p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="font-black text-lg tracking-tight">{def.title}</h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">{def.tagline}</p>
                    </div>
                    <button
                      onClick={() => setPreviewItem(null)}
                      aria-label="Close preview"
                      className="w-9 h-9 shrink-0 rounded-full bg-black/5 hover:bg-black hover:text-white text-black/50 transition-colors flex items-center justify-center"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <p className="text-sm font-medium text-black/60 leading-relaxed mb-5">{def.description}</p>

                  {/* What changes */}
                  <div className="rounded-xl border border-black/10 bg-muted/40 p-3.5 mb-5">
                    <TechnicalLabel text="WHAT THIS CHANGES" className="text-black/40 mb-1.5" />
                    <p className="text-[11px] font-medium text-black/55 leading-relaxed">
                      Redraws the Dashboard stat cards in this treatment — surface, frame, shadow and accent.
                      Layout, data, responsiveness and everything else stay exactly the same.
                    </p>
                  </div>

                  {error === "INSUFFICIENT_TX_POINTS" && (
                    <p className="mb-3 text-xs font-black text-red-500">Not enough TX-Points — earn more in the Work tab.</p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <PriceTag price={previewItem.pricePoints} owned={previewItem.owned} />
                    <div className="flex gap-2">
                      {previewItem.owned ? (
                        <Button
                          className="h-11 px-5 rounded-xl bg-black text-white hover:bg-primary font-black text-[10px] uppercase tracking-widest"
                          onClick={() => activate.mutate(
                            { itemId: previewItem.id, deactivate: Boolean(isActive) },
                            { onSuccess: () => setPreviewItem(null) },
                          )}
                          disabled={activate.isPending}
                          data-testid="store-activate-btn"
                        >
                          {activate.isPending ? <ThorxSpinner size={14} /> : isActive ? "Deactivate" : "Activate"}
                        </Button>
                      ) : (
                        <Button
                          className="h-11 px-5 rounded-xl bg-primary text-white hover:bg-black font-black text-[10px] uppercase tracking-widest"
                          onClick={() => handlePurchase(previewItem)}
                          disabled={purchase.isPending}
                          data-testid="store-install-btn"
                        >
                          {purchase.isPending ? <ThorxSpinner size={14} /> : <>Install · {previewItem.pricePoints.toLocaleString()} PTS</>}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );

  function handlePurchase(item: StoreItemDto) {
    purchase.mutate(item.id, { onSuccess: () => setPreviewItem(null) });
  }
}
