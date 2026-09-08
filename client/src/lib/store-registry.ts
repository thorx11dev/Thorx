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
  preview: { bg: string; surface: string; ink: string; accent: string; border: string; radius?: string };
}

export const THEME_DEFS: Record<string, ThemeDef> = {
  theme_blueprint: {
    refKey: "theme_blueprint",
    title: "Blueprint",
    tagline: "Technical paper · drafting grid",
    description:
      "An architect's canvas: warm technical paper with a faint drafting grid, hairline rules, blueprint-blue signals and near-sharp precision corners. Thorx as a studio instrument.",
    preview: { bg: "#F6F4EE", surface: "#FCFBF8", ink: "#1C1F24", accent: "#2F5AA8", border: "#DCD8CC", radius: "4px" },
  },
  theme_pitch: {
    refKey: "theme_pitch",
    title: "Pitch Black",
    tagline: "Brutalist dark · acid signal",
    description:
      "Pure brutalist energy: pitch-black surfaces, razor-sharp edges, oversized type presence and a single acid-lime signal carrying every highlight. For users who like it loud.",
    preview: { bg: "#0A0A0A", surface: "#121212", ink: "#F2F2ED", accent: "#C6F135", border: "#262626", radius: "0px" },
  },
  theme_stage: {
    refKey: "theme_stage",
    title: "Stage Light",
    tagline: "Gallery white · serif display",
    description:
      "A monochrome editorial stage: gallery white, ink-black type in serif display, hairline frames and zero-radius gallery framing. Headline-grade typography everywhere.",
    preview: { bg: "#FAFAF7", surface: "#FFFFFF", ink: "#141414", accent: "#141414", border: "#E5E4DE", radius: "0px" },
  },
  theme_scrapbook: {
    refKey: "theme_scrapbook",
    title: "Sticker Album",
    tagline: "Bubblegum joy · sticker outlines",
    description:
      "A playful scrapbook world: warm cream pages, deep-plum sticker outlines, bubblegum-pink signals and chunky soft cards. Your Thorx, with the personality turned all the way up.",
    preview: { bg: "#FDF3E7", surface: "#FFFFFF", ink: "#2D2440", accent: "#FF5C8A", border: "#2D2440", radius: "20px" },
  },
  theme_terminal: {
    refKey: "theme_terminal",
    title: "Quiet Terminal",
    tagline: "Lab dark · mono type · restrained cyan",
    description:
      "A focused lab environment: neutral near-black surfaces, monospace display type, data-dense calm and a restrained cyan signal. Built for long, deep work sessions.",
    preview: { bg: "#0F1113", surface: "#16191D", ink: "#DCE1E6", accent: "#62C1CE", border: "#262B31", radius: "4px" },
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
  dashboard_cards_serif: {
    refKey: "dashboard_cards_serif",
    componentType: "dashboard_cards",
    title: "Serif Ledger",
    tagline: "Editorial numerals · hairline rule",
    description:
      "Print-grade stat columns: card chrome removed, a strong hairline rule on top, mono micro-labels and oversized serif numerals. Your numbers read like a magazine spread.",
    cardClass:
      "!rounded-none !border-0 !bg-transparent !shadow-none hover:!shadow-none !border-t-2 !border-t-[rgb(var(--tone-black))] px-0 md:px-2 pt-5",
    headClass: "!mb-4 !text-[10px] !tracking-[0.35em] font-mono",
    valueClass: "!text-5xl md:!text-6xl !tracking-tighter font-serif !font-black",
    preview: { bg: "#FAFAF7", surface: "#FFFFFF", ink: "#141414", accent: "#141414", border: "#141414", radius: "0px" },
  },
  dashboard_cards_mono: {
    refKey: "dashboard_cards_mono",
    componentType: "dashboard_cards",
    title: "Terminal Row",
    tagline: "Mono data · instrument panel",
    description:
      "Instrument-panel stat rows: monospace numerals, a left data-rule instead of a full frame and tight uppercase labels. Reads like a lab readout, stays perfectly calm.",
    cardClass:
      "!rounded-none !border-0 !shadow-none hover:!shadow-none !border-l-2 !border-l-[rgb(var(--tone-black))] !bg-black/[0.03] px-4 md:px-5",
    headClass: "!mb-3 !tracking-[0.3em] font-mono !text-[9px]",
    valueClass: "!text-3xl md:!text-4xl font-mono !tracking-tight",
    preview: { bg: "#0F1113", surface: "#16191D", ink: "#DCE1E6", accent: "#62C1CE", border: "#262B31", radius: "2px" },
  },
  dashboard_cards_sticker: {
    refKey: "dashboard_cards_sticker",
    componentType: "dashboard_cards",
    title: "Sticker Pop",
    tagline: "Chunky outline · candy shadow",
    description:
      "Scrapbook-stat stickers: thick ink outlines, extra-soft corners and a candy offset shadow that lifts each card off the page. Playful without ever getting in the way.",
    cardClass:
      "!rounded-[20px] !border-[2.5px] !border-[rgb(var(--tone-black))] !shadow-[5px_5px_0px_0px_rgb(var(--tone-black))] hover:!shadow-[8px_8px_0px_0px_rgb(var(--tone-black))]",
    headClass: "!tracking-[0.2em]",
    valueClass: "!text-3xl md:!text-4xl !tracking-tight",
    preview: { bg: "#FDF3E7", surface: "#FFFFFF", ink: "#2D2440", accent: "#FF5C8A", border: "#2D2440", radius: "20px" },
  },
};

export const COMPONENT_SLOT_LABELS: Record<string, string> = {
  dashboard_cards: "Dashboard Cards",
};
