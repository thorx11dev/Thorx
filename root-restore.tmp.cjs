const fs = require("fs");
let css = fs.readFileSync("client/src/index.css", "utf8");

const ORIGINAL_ROOT = `:root {
  --background: #E8E5D8;
  --foreground: #141413;
  --card: #FAF9F5;
  --card-foreground: #141413;
  --popover: #FAF9F5;
  --popover-foreground: #141413;
  --primary: #D97757;
  --primary-foreground: #FAF9F5;
  --secondary: hsl(0, 0%, 15%);
  --secondary-foreground: #FAF9F5;
  --muted: #E8E5D8;
  --muted-foreground: hsl(0, 0%, 40%);
  --accent: #D97757;
  --accent-foreground: #FAF9F5;
  --destructive: hsl(356, 90%, 54%);
  --destructive-foreground: #FAF9F5;
  --border: hsl(0, 0%, 15%);
  --input: hsl(0, 0%, 95%);
  --ring: #D97757;
  --chart-1: #D97757;
  --chart-2: hsl(159, 100%, 36%);
  --chart-3: hsl(42, 93%, 56%);
  --chart-4: hsl(147, 79%, 42%);
  --chart-5: hsl(341, 75%, 51%);
  --sidebar-background: #E8E5D8;
  --sidebar-foreground: #141413;
  --sidebar-primary: #D97757;
  --sidebar-primary-foreground: #FAF9F5;
  --sidebar-accent: #E8E5D8;
  --sidebar-accent-foreground: hsl(0, 0%, 40%);
  --sidebar-border: hsl(0, 0%, 15%);
  --sidebar-ring: #D97757;
  --font-sans: 'Inter', sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: 'Courier New', monospace;
  --radius: 0.5rem;
  /* Store component-variant theming surface (Tailwind black/white route
     through these; values are the EXACT original brand tones). */
  --tone-black: 20 20 19;
  --tone-white: 250 249 245;
}

`;

const start = css.indexOf(":root {");
const end = css.indexOf(".dark {");
if (start === -1 || end === -1) { console.error("markers missing", start, end); process.exit(1); }
fs.writeFileSync("client/src/index.css", css.slice(0, start) + ORIGINAL_ROOT + css.slice(end));
console.log("original :root restored, all theme blocks removed");
