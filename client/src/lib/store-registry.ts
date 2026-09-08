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
      "!rounded-none !border-0 !bg-transparent !shadow-none hover:!shadow-none !border-t-2 !border-t-[rgb(var(--tone-black))] px-0 md:px-2 pt-5",
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
      "!rounded-lg !border-[3px] !border-[rgb(var(--tone-black))] !shadow-[6px_6px_0px_0px_rgb(var(--tone-black))] hover:!shadow-[9px_9px_0px_0px_rgb(var(--tone-black))]",
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
