import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        // Brand color lockdown: one orange, one black, one white sitewide.
        black: "#141413",
        white: "#FAF9F5",
        orange: {
          "50": "#D97757",
          "100": "#D97757",
          "200": "#D97757",
          "300": "#D97757",
          "400": "#D97757",
          "500": "#D97757",
          "600": "#D97757",
          "700": "#D97757",
          "800": "#D97757",
          "900": "#D97757",
          "950": "#D97757",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shake: "shake 0.5s ease-in-out",
      },
      // 3.1 — Canonical z-index token system.
      // Every layer must use one of these values so stacking order is
      // deterministic and reviewable in a single place.
      //
      // Layer            Token         Value
      // ─────────────────────────────────────
      // Loading screen   z-loading     9999
      // Cursor / FX      z-cursor      9000
      // Notification      z-notif       800
      // Toast            z-toast       750  ← above all modals so toasts are
      //                                         always visible while a modal is open
      // Profile modal    z-profile     700
      // Daily goal modal z-goal        600
      // Ad panel         z-ad          500
      // Dropdowns        z-dropdown    200
      // Beta trust gate  z-gate        8200 ← mandatory honesty-rules screen;
      //                                   above profile/toast layers so nothing can
      //                                   be interacted with before acknowledging,
      //                                   below cursor FX (9000) + loading (9999).
      zIndex: {
        loading: "9999",
        cursor: "9000",
        notif: "800",
        toast: "750",
        profile: "700",
        goal: "600",
        ad: "500",
        dropdown: "200",
        gate: "8200",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
