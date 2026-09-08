// ── THORX Store — visual registry (the design-system source of truth) ────────
// Catalog metadata (price/status/ownership) lives server-side; THIS file owns
// what each ref_key actually looks like. Every key here mirrors
// server/modules/store-routes.ts COMPONENT_VARIANT_REGISTRY — the server
// rejects catalog entries with unknown keys, so nothing unlisted can ever
// render. Adding a new variant = add here + the server list. No page changes.

// ── Component variants ───────────────────────────────────────────────────────
// The Store sells UI COMPONENT VARIANTS only (themes were retired — the
// default THORX design language is the single visual system). Every variant
// is Inter typography + THORX brand colors (#D97757 / #141413 / #FAF9F5).
// Variants change surface/border/shadow/accent treatment ONLY — padding,
// grid, responsive behavior and content are untouched.

export interface ComponentVariantDef {
  refKey: string;
  componentType: string;
  title: string;
  tagline: string;
  description: string;
  /** Card shell overlay (DashboardCards CardShell). Must keep padding/grid —
   *  only surface/border/shadow/typography change. ! important only where the
   *  base utility would win the cascade. */
  cardClass: string;
  headClass: string;
  valueClass: string;
}

export const COMPONENT_VARIANT_DEFS: Record<string, ComponentVariantDef> = {
  // ── Ember Focus ── warm premium glow: paper-to-ember gradient face, a
  // hairline ember ring, micro-labels in brand orange. The quiet luxury one.
  dashboard_cards_ember: {
    refKey: "dashboard_cards_ember",
    componentType: "dashboard_cards",
    title: "Ember Focus",
    tagline: "Warm gradient glow · ember ring",
    description:
      "The flagship card treatment: a paper-to-ember gradient face, a hairline ember ring and micro-labels in THORX orange. Depth that whispers, never shouts.",
    cardClass:
      "!border !border-[#D97757]/25 !bg-[linear-gradient(180deg,rgb(var(--tone-white))_0%,#FFF6F0_100%)] !shadow-[0_1px_2px_rgba(20,20,19,0.04),0_14px_36px_rgba(217,119,87,0.14)] hover:!shadow-[0_2px_6px_rgba(20,20,19,0.05),0_20px_48px_rgba(217,119,87,0.22)]",
    headClass: "!mb-4 !text-[#D97757] !tracking-[0.28em]",
    valueClass: "!tracking-tight",
  },
  // ── Ink Slab ── THORX's own neo-brutalism: thick ink frame, hard offset
  // shadow that snaps to brand orange on hover. Confident and tactile.
  dashboard_cards_slab: {
    refKey: "dashboard_cards_slab",
    componentType: "dashboard_cards",
    title: "Ink Slab",
    tagline: "Thick ink frame · orange snap shadow",
    description:
      "A chunky 2.5px ink frame with a hard offset shadow that snaps to THORX orange on hover. Maximum presence, zero softness — the statement treatment.",
    cardClass:
      "!rounded-xl !border-[2.5px] !border-[rgb(var(--tone-black))] !shadow-[5px_5px_0px_0px_rgb(var(--tone-black))] hover:!border-[#D97757] hover:!shadow-[8px_8px_0px_0px_#D97757]",
    headClass: "!tracking-[0.3em]",
    valueClass: "!text-4xl md:!text-5xl !tracking-tighter",
  },
  // ── Hairline Precision ── editorial measurement: chrome removed, one strong
  // top rule, ember micro-labels, oversized tabular numerals in pure ink.
  dashboard_cards_hairline: {
    refKey: "dashboard_cards_hairline",
    componentType: "dashboard_cards",
    title: "Hairline Precision",
    tagline: "Chrome-less · top rule · huge numerals",
    description:
      "Editorial measurement: the card box disappears, replaced by a single strong top rule, THORX-orange micro-labels and oversized ink numerals. Pure data, print rhythm.",
    cardClass:
      "!rounded-none !border-0 !bg-transparent !shadow-none hover:!shadow-none !border-t-2 !border-t-[rgb(var(--tone-black))] px-0 md:px-2 pt-5",
    headClass: "!mb-4 !text-[10px] !tracking-[0.35em] !text-[#D97757]",
    valueClass: "!text-5xl md:!text-6xl !tracking-tighter",
  },
  // ── Soft Depth ── the calm minimal one: borderless, two-layer soft shadow,
  // hairline ember underline that blooms on hover. The everyday driver.
  dashboard_cards_depth: {
    refKey: "dashboard_cards_depth",
    componentType: "dashboard_cards",
    title: "Soft Depth",
    tagline: "Borderless · two-layer elevation",
    description:
      "The calm everyday driver: borders gone, replaced by two layers of whisper-soft elevation and a hairline ember underline that blooms in on hover.",
    cardClass:
      "!border-0 !border-b-2 !border-b-transparent !shadow-[0_1px_2px_rgba(20,20,19,0.04),0_12px_32px_rgba(20,20,19,0.08)] hover:!border-b-[#D97757]/60 hover:!shadow-[0_2px_6px_rgba(20,20,19,0.05),0_20px_44px_rgba(20,20,19,0.11)]",
    headClass: "!mb-4 !text-black/45",
    valueClass: "!text-3xl md:!text-4xl !tracking-tight",
  },
};

export const COMPONENT_SLOT_LABELS: Record<string, string> = {
  dashboard_cards: "Dashboard Cards",
};
