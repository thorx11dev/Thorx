// ── THORX Store — visual registry (the design-system source of truth) ────────
// Catalog metadata (price/status/ownership) lives server-side; THIS file owns
// what each ref_key actually looks like. Every key here mirrors
// server/modules/store-routes.ts THEME_REGISTRY_KEYS / COMPONENT_VARIANT_REGISTRY —
// the server rejects catalog entries with unknown keys, so nothing unlisted can
// ever render. Adding a new theme/variant = add here + a [data-theme] token
// block in index.css (+ server registry list). No page code changes.

// ── Themes ───────────────────────────────────────────────────────────────────
export interface ThemeDef {
  refKey: string;
  title: string;
  tagline: string;
  description: string;
  /** Mini-preview swatch colors (store UI only — not applied to the app). */
  preview: { bg: string; surface: string; ink: string; accent: string; border: string; radius: string };
}

export const THEME_DEFS: Record<string, ThemeDef> = {
  theme_midnight: {
    refKey: "theme_midnight",
    title: "Midnight Foundry",
    tagline: "Deep-space dark · steel glow",
    description:
      "A premium dark environment: near-black blue steel surfaces, glowing cobalt accents and floating depth. Built for night owls and long sessions.",
    preview: { bg: "#0B0E17", surface: "#121626", ink: "#E7EAF3", accent: "#6E8BFF", border: "#2A3152", radius: "12px" },
  },
  theme_nordic: {
    refKey: "theme_nordic",
    title: "Nordic Frost",
    tagline: "Calm light · ink & sage",
    description:
      "A quiet, airy light system: warm paper surfaces, ink typography, hairline borders and a grounded sage accent. Max focus, zero noise.",
    preview: { bg: "#F4F4F1", surface: "#FFFFFF", ink: "#1C2420", accent: "#2F6F62", border: "#D8DAD3", radius: "14px" },
  },
  theme_ember: {
    refKey: "theme_ember",
    title: "Ember Editorial",
    tagline: "Paper & ink · sharp serif",
    description:
      "An editorial design language: cream paper, high-contrast ink, razor-sharp corners and a burning ember accent. Typography leads, everything else follows.",
    preview: { bg: "#F3EDDF", surface: "#FBF7EC", ink: "#1B1610", accent: "#C2451E", border: "#C9BEA4", radius: "0px" },
  },
  theme_velvet: {
    refKey: "theme_velvet",
    title: "Velvet Luxe",
    tagline: "Plum depth · warm gold",
    description:
      "A rich, luxurious environment: plum-graphite surfaces, warm gold accents and jewel-toned depth. Your Thorx, dressed for the evening.",
    preview: { bg: "#14101B", surface: "#1D1727", ink: "#F1EAD8", accent: "#C9A227", border: "#332A44", radius: "6px" },
  },
};

// ── Component variants ───────────────────────────────────────────────────────
// Each variant is a distinct design language applied to a REAL portal
// component (not a recolor). Variants are className overlays so layout,
// responsive behavior and accessibility stay intact.

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
  /** Same shape as ThemeDef.preview — one shared PreviewStrip renderer. */
  preview: { bg: string; surface: string; ink: string; accent: string; border: string; radius?: string };
}

export const COMPONENT_VARIANT_DEFS: Record<string, ComponentVariantDef> = {
  dashboard_cards_editorial: {
    refKey: "dashboard_cards_editorial",
    componentType: "dashboard_cards",
    title: "Editorial Ledger",
    tagline: "Oversized serif numerals · hairline grid",
    description:
      "A print-grade stat column: card chrome removed, a strong hairline rule on top, mono micro-labels and oversized serif numerals. Numbers read like a financial magazine spread.",
    // Border removed → thin top rule; transparent surface lets the page
    // background breathe (true editorial column, not a box).
    cardClass:
      "!rounded-none !border-0 !bg-transparent !shadow-none hover:!shadow-none !border-t-2 !border-t-[rgb(var(--tone-ink,20,20,19))] px-0 md:px-2 pt-5",
    headClass: "!mb-4 !text-[10px] !tracking-[0.35em] font-mono",
    valueClass: "!text-5xl md:!text-6xl !tracking-tighter font-serif !font-black",
    preview: { bg: "#F4F4F1", surface: "#FFFFFF", ink: "#141413", accent: "#141413", border: "#141413", radius: "0px" },
  },
  dashboard_cards_brutal: {
    refKey: "dashboard_cards_brutal",
    componentType: "dashboard_cards",
    title: "Neo Brutal",
    tagline: "Hard shadows · thick ink frame",
    description:
      "Experimental brutalism: a heavy 3px ink frame, an uncompromising offset shadow and a paper-white face. Loud, confident, impossible to miss.",
    cardClass:
      "!rounded-lg !border-[3px] !border-[rgb(var(--tone-ink,20,20,19))] !shadow-[6px_6px_0px_0px_rgb(var(--tone-ink,20,20,19))] hover:!shadow-[9px_9px_0px_0px_rgb(var(--tone-ink,20,20,19))]",
    headClass: "!tracking-[0.3em]",
    valueClass: "!text-4xl md:!text-5xl !tracking-tighter",
    preview: { bg: "#FAF9F5", surface: "#FFFFFF", ink: "#141413", accent: "#D97757", border: "#141413", radius: "8px" },
  },
  dashboard_cards_minimal: {
    refKey: "dashboard_cards_minimal",
    componentType: "dashboard_cards",
    title: "Quiet Glass",
    tagline: "Borderless calm · layered depth",
    description:
      "Minimal SaaS stat cards: chrome disappears entirely, replaced by two layers of whisper-soft elevation and extra breathing room. The calmest way to read your numbers.",
    cardClass:
      "!border-0 !shadow-[0_1px_2px_rgba(16,16,15,0.05),0_10px_28px_rgba(16,16,15,0.07)] hover:!shadow-[0_2px_4px_rgba(16,16,15,0.05),0_16px_40px_rgba(16,16,15,0.10)]",
    headClass: "!mb-4 !text-black/40",
    valueClass: "!text-3xl md:!text-4xl !tracking-tight",
    preview: { bg: "#F7F6F1", surface: "#FFFFFF", ink: "#141413", accent: "#8A8A85", border: "#E5E2D6", radius: "16px" },
  },
};

export const COMPONENT_SLOT_LABELS: Record<string, string> = {
  dashboard_cards: "Dashboard Cards",
};
