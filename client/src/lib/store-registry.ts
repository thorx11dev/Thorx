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
  /** Overlays for the dashboard-card grid (DashboardCards.tsx consumes this). */
  cardClass: string;
  headClass: string;
  valueClass: string;
  preview: { surface: string; ink: string; accent: string; border: string };
}

export const COMPONENT_VARIANT_DEFS: Record<string, ComponentVariantDef> = {
  dashboard_cards_editorial: {
    refKey: "dashboard_cards_editorial",
    componentType: "dashboard_cards",
    title: "Editorial Ledger",
    tagline: "Oversized numerals · hairline grid",
    description:
      "Magazine-style stat cards: huge tabular numerals, mono micro-labels and hairline rules. Quiet confidence, print-grade rhythm.",
    cardClass: "!rounded-none !border-0 border-t-2 border-t-black/70 bg-transparent !shadow-none px-0 md:px-2",
    headClass: "!mb-3 tracking-[0.35em]",
    valueClass: "!text-4xl md:!text-6xl !tracking-tighter font-serif",
    preview: { surface: "#FFFFFF", ink: "#141413", accent: "#141413", border: "#141413" },
  },
  dashboard_cards_brutal: {
    refKey: "dashboard_cards_brutal",
    componentType: "dashboard_cards",
    title: "Neo Brutal",
    tagline: "Hard shadows · thick ink",
    description:
      "Experimental brutalist cards: heavy 3px ink borders, hard offset shadows and zero softness. Loud, confident, unmissable.",
    cardClass: "!rounded-lg !border-[3px] !border-black !shadow-[6px_6px_0px_0px_rgba(20,20,19,1)]",
    headClass: "!tracking-[0.3em]",
    valueClass: "!text-4xl !tracking-tighter",
    preview: { surface: "#FFFFFF", ink: "#141413", accent: "#D97757", border: "#141413" },
  },
  dashboard_cards_minimal: {
    refKey: "dashboard_cards_minimal",
    componentType: "dashboard_cards",
    title: "Quiet Glass",
    tagline: "Borderless calm · soft depth",
    description:
      "Minimal SaaS cards: no borders, whisper-soft elevation and generous breathing room. The calmest way to read your numbers.",
    cardClass: "!border-0 !shadow-[0_2px_16px_rgba(20,20,19,0.07)] hover:!shadow-[0_8px_28px_rgba(20,20,19,0.10)]",
    headClass: "!mb-4 !text-black/40",
    valueClass: "!text-3xl md:!text-4xl !tracking-tight",
    preview: { surface: "#FFFFFF", ink: "#141413", accent: "#8A8A85", border: "#E5E2D6" },
  },
};

export const COMPONENT_SLOT_LABELS: Record<string, string> = {
  dashboard_cards: "Dashboard Cards",
};
