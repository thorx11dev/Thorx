// ── THORX Engine B — CPX Research Script Tag loader ──────────────────────────
// Loads https://cdn.cpx-research.com/assets/js/script_tag_v2.0.js with the
// per-user config returned by GET /api/surveys (`cpx` field). The script reads
// window.config exactly once per execution, so any mount-order change (portal
// tab switches, React StrictMode double-mount) re-syncs: the registry below
// rebuilds window.config from the currently-mounted widget divs, clears their
// rendered content, and re-injects a fresh script element. The raw CPX app
// hash secret never reaches this module — only the per-user MD5 digest
// (secureHash) computed server-side.
//
// Designs used (per CPX script-tag docs):
//   • theme_style 1 (fullscreen widget) — embedded in the Work tab
//   • theme_style 4 (notification popup, bottom-right) — portal-wide
// Multiple designs on one page is officially supported via script_config[].

import { queryClient } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { captureEvent } from "@/lib/posthog";

const CPX_SCRIPT_URL = "https://cdn.cpx-research.com/assets/js/script_tag_v2.0.js";
const CPX_SCRIPT_ID = "thorx-cpx-script-tag";

export interface CpxGeneralConfig {
  appId: string;
  extUserId: string;
  secureHash: string;
  email: string;
  username: string;
}

export interface CpxElementConfig {
  div_id: string;
  theme_style: number;
  order_by?: number;
  limit_surveys?: number;
  /** theme_style 4 only: 1 top-center 2 top-left 3 top-right 4 bottom-left 5 bottom-right 6 bottom-center */
  position?: number;
  text?: string;
  link?: string;
  newtab?: boolean;
  /** theme_style 3 only: behaviour when no surveys are available */
  display_mode?: number;
}

interface CpxRegistryEntry {
  element: CpxElementConfig;
  node: HTMLElement;
}

// ─── Module-level registry (one page = one script = one window.config) ───────
const registry = new Map<string, CpxRegistryEntry>();
let generalConfig: CpxGeneralConfig | null = null;
let syncTimer: number | null = null;

function buildWindowConfig(): void {
  if (!generalConfig || registry.size === 0) return;

  const scriptConfig = Array.from(registry.values()).map((e) => e.element);

  window.config = {
    general_config: {
      app_id: Number(generalConfig.appId),
      ext_user_id: generalConfig.extUserId,
      email: generalConfig.email || "",
      username: generalConfig.username || "",
      secure_hash: generalConfig.secureHash || "",
      subid_1: "",
      subid_2: "",
    },
    style_config: {
      // THORX brand: primary #D97757 on the industrial black/white base.
      text_color: "#141413",
      survey_box: {
        topbar_background_color: "#D97757",
        box_background_color: "#ffffff",
        rounded_borders: true,
        stars_filled: "#D97757",
      },
    },
    script_config: scriptConfig as unknown as Array<Record<string, unknown>>,
    debug: false,
    useIFrame: true,
    iFramePosition: 1,
    functions: {
      // NEVER use window.alert here (CPX docs: infinite-loop guard).
      count_new_surveys: (count: unknown) => {
        captureEvent("cpx_surveys_available", { count: Number(count) || 0 });
      },
      get_transaction: (transactions: unknown) => {
        // A completion/bonus landed for this user — refresh the money queries
        // so the balance and daily progress update without a manual reload.
        captureEvent("cpx_transaction", { transactions });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.earnings });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardStats });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.user });
        void queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      },
      no_surveys_available: () => {
        captureEvent("cpx_no_surveys");
      },
    },
  };
}

function injectScript(): void {
  // Fresh element each sync — the library initializes from window.config at
  // execution time, so a new execution picks up registry changes.
  document.getElementById(CPX_SCRIPT_ID)?.remove();
  const script = document.createElement("script");
  script.id = CPX_SCRIPT_ID;
  script.src = CPX_SCRIPT_URL;
  script.async = true;
  document.body.appendChild(script);
}

function clearRenderedContent(): void {
  // The re-executed library re-renders into the divs; stale markup would
  // duplicate widget content.
  for (const entry of registry.values()) {
    entry.node.innerHTML = "";
  }
}

/** Coalesced re-sync: rebuild config + re-inject (debounced across mounts). */
function scheduleSync(): void {
  if (syncTimer !== null) return;
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    if (!generalConfig || registry.size === 0) {
      // Nothing wants the widget — tear the script down entirely.
      document.getElementById(CPX_SCRIPT_ID)?.remove();
      delete window.config;
      return;
    }
    buildWindowConfig();
    clearRenderedContent();
    injectScript();
  }, 80);
}

/**
 * Register a widget div. Call from a component's effect after its div exists;
 * pair with {@link unregisterCpxElement} in cleanup. Returns nothing — the
 * div stays owned by React, only its innerHTML is managed by the CPX lib.
 */
export function registerCpxElement(
  general: CpxGeneralConfig,
  element: CpxElementConfig,
  node: HTMLElement,
): void {
  generalConfig = general;
  registry.set(element.div_id, { element, node });
  scheduleSync();
}

export function unregisterCpxElement(divId: string): void {
  registry.delete(divId);
  scheduleSync();
}

// ─── Global type for the CPX script tag v2.0 contract ────────────────────────
declare global {
  interface Window {
    config?: {
      general_config: Record<string, unknown>;
      style_config: Record<string, unknown>;
      script_config: Array<Record<string, unknown>>;
      debug: boolean;
      useIFrame: boolean;
      iFramePosition: number;
      functions: Record<string, ((...args: unknown[]) => void) | undefined>;
    };
  }
}
