const fs = require("fs");
let s = fs.readFileSync("client/src/lib/store-registry.ts", "utf8");
const start = s.indexOf("export const COMPONENT_VARIANT_DEFS");
const end = s.indexOf("export const COMPONENT_SLOT_LABELS");
if (start === -1 || end === -1) { console.error("markers missing"); process.exit(1); }
const repl = `export const COMPONENT_VARIANT_DEFS: Record<string, ComponentVariantDef> = {
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

`;
fs.writeFileSync("client/src/lib/store-registry.ts", s.slice(0, start) + repl + s.slice(end));
console.log("variants replaced OK");
