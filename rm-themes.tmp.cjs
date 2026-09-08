const fs = require("fs");
let s = fs.readFileSync("client/src/lib/store-registry.ts", "utf8");
const start = s.indexOf("// ── Themes");
const end = s.indexOf("// ── Component variants");
if (start === -1 || end === -1) { console.error("markers missing", start, end); process.exit(1); }
const repl = `// ── Component variants ───────────────────────────────────────────────────────
// The Store sells UI COMPONENT VARIANTS only (themes were retired — the
// default THORX design language is the single visual system). Every variant
// is Inter typography + THORX brand colors (#D97757 / #141413 / #FAF9F5).
// Variants change surface/border/shadow/accent treatment ONLY — padding,
// grid, responsive behavior and content are untouched.

`;
fs.writeFileSync("client/src/lib/store-registry.ts", s.slice(0, start) + repl + s.slice(end));
console.log("THEME_DEFS removed OK");
