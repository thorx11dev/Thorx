import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";


// Env files: `root` is ./client — Vite loads `.env`, `.env.production`, etc. from `client/`
// (see client/.env.production for VITE_API_URL in production builds).
export default defineConfig({
  plugins: [
    react({
      include: "**/*.{jsx,tsx}",
    }),
    ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
      ? [
        await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
          m.default(),
        ),
        await import("@replit/vite-plugin-cartographer").then((m) =>
          m.cartographer(),
        ),
      ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    target: "esnext",
    minify: "esbuild",
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-charts": ["recharts"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-select",
            "@radix-ui/react-popover",
          ],
        },
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    chunkSizeWarningLimit: 500,
    sourcemap: false,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
    host: "0.0.0.0",
    port: 5173,
    cors: true,
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "wouter",
      "recharts",
      "lodash",
      "lodash/get",
      "lodash/isNil",
      "lodash/isFunction",
      "lodash/range",
      "lodash/sortBy",
      "lodash/throttle",
      "lodash/debounce",
      "lodash/isEqual",
      "lodash/upperFirst",
      "lodash/isNumber",
      "lodash/isString",
      "lodash/max",
      "lodash/min",
      "lodash/isArray",
      "lodash/every",
      "lodash/some",
      "lodash/flatMap",
      "lodash/mapValues",
      "lodash/uniqBy",
      "lodash/isBoolean",
      "lodash/isObject",
      "lodash/omit",
      "lodash/last",
      "lodash/first",
    ],
  },
});
