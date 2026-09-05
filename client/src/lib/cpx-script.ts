// ── THORX Engine B — CPX Research Script Tag loader ──────────────────────────
// Loads https://cdn.cpx-research.com/assets/js/script_tag_v2.0.js with the
// per-user config returned by GET /api/surveys (`cpx` field).
//
// LIFECYCLE CONTRACT (do not break — this is battle-tested against the CPX
// library's internals):
//   • window.config is built ONCE and the script is injected ONCE per SPA
//     session. The library bundles its own React-like renderer that keeps
//     long-lived references + poll timers; re-injecting a second instance
//     (or wiping its DOM) crashes with "removeChild on 'Node'".
//   • Each widget's target div is a PERSISTENT node owned by this module.
//     React never creates/destroys it — on mount it is MOVED into the React
//     ref container (appendChild preserves nodes + listeners), on unmount it
//     is parked in a hidden staging div. CPX's renderer keeps working across
//     portal tab switches.
//   • A different logged-in user (new ext_user_id) in the same session cannot
//     re-use the frozen config — one guarded full reload re-initializes.
// The raw CPX app hash secret never reaches this module — only the per-user
// MD5 digest (secureHash) computed server-side.

import { queryClient } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { captureEvent } from "@/lib/posthog";

const CPX_SCRIPT_URL = "https://cdn.cpx-research.com/assets/js/script_tag_v2.0.js";
const CPX_SCRIPT_ID = "thorx-cpx-script-tag";
const STAGING_ID = "thorx-cpx-staging";
const RELOAD_GUARD_KEY = "thorx:cpx:config-reloaded";

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

/** Per-element UI hooks fired from the shared CPX config functions. */
export interface CpxElementCallbacks {
  /** CPX found zero surveys for this user — render a friendly fallback. */
  onNoSurveys?: () => void;
  /** CPX reported inventory (count_new_surveys) — clear the fallback state. */
  onSurveysAvailable?: (count: number) => void;
}

interface CpxRegistryEntry {
  element: CpxElementConfig;
  /** Persistent container div — created once, moved between React + staging. */
  persistent: HTMLDivElement;
  node: HTMLElement | null;
  callbacks?: CpxElementCallbacks;
}

// ─── Module-level singleton state ─────────────────────────────────────────────
const registry = new Map<string, CpxRegistryEntry>();
let frozenGeneral: CpxGeneralConfig | null = null;
let startTimer: number | null = null;
let scriptStarted = false;

function sameGeneral(a: CpxGeneralConfig, b: CpxGeneralConfig): boolean {
  return a.appId === b.appId && a.extUserId === b.extUserId;
}

/** Hidden parking spot for persistent widget divs whose React host unmounted. */
function getStaging(): HTMLElement {
  let staging = document.getElementById(STAGING_ID);
  if (!staging) {
    staging = document.createElement("div");
    staging.id = STAGING_ID;
    staging.style.display = "none";
    document.body.appendChild(staging);
  }
  return staging;
}

function buildWindowConfig(): void {
  if (!frozenGeneral) return;

  const scriptConfig = Array.from(registry.values()).map((e) => e.element);

  window.config = {
    general_config: {
      app_id: Number(frozenGeneral.appId),
      ext_user_id: frozenGeneral.extUserId,
      email: frozenGeneral.email || "",
      username: frozenGeneral.username || "",
      secure_hash: frozenGeneral.secureHash || "",
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
        const n = Number(count) || 0;
        captureEvent("cpx_surveys_available", { count: n });
        for (const entry of registry.values()) {
          entry.callbacks?.onSurveysAvailable?.(n);
        }
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
        for (const entry of registry.values()) {
          entry.callbacks?.onNoSurveys?.();
        }
      },
    },
  };
}

function injectScript(): void {
  const script = document.createElement("script");
  script.id = CPX_SCRIPT_ID;
  script.src = CPX_SCRIPT_URL;
  script.async = true;
  document.body.appendChild(script);
}

/**
 * Start the library once. Debounced briefly so sibling registrations from the
 * same React commit (wall + portal-wide notification) both make it into the
 * frozen script_config before the library reads window.config (it reads it
 * exactly once, at script execution).
 */
function scheduleStart(): void {
  if (scriptStarted || startTimer !== null) return;
  startTimer = window.setTimeout(() => {
    startTimer = null;
    if (scriptStarted || !frozenGeneral || registry.size === 0) return;
    scriptStarted = true;
    buildWindowConfig();
    injectScript();
  }, 150);
}

/**
 * Register a widget. `node` is the React ref container; the persistent div is
 * MOVED into it (never recreated). Pair with {@link unregisterCpxElement} in
 * cleanup. `primary: true` (the wall) triggers the one-time script start.
 */
export function registerCpxElement(
  general: CpxGeneralConfig,
  element: CpxElementConfig,
  node: HTMLElement,
  callbacks?: CpxElementCallbacks,
  opts?: { primary?: boolean },
): void {
  // Frozen config is per-user. A different ext_user_id in the same SPA session
  // cannot be hot-swapped (the library read window.config already) — reload
  // exactly once so everything re-initializes for the new user.
  if (frozenGeneral && !sameGeneral(frozenGeneral, general)) {
    if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      window.location.reload();
      return;
    }
    // Reload already attempted this session — do not loop; leave state as is.
    return;
  }
  frozenGeneral ??= general;

  let entry = registry.get(element.div_id);
  if (!entry) {
    const persistent = document.createElement("div");
    persistent.id = element.div_id;
    entry = { element, persistent, node: null };
    registry.set(element.div_id, entry);
  }
  entry.node = node;
  entry.callbacks = callbacks;
  // Move (not recreate) — CPX's bundled renderer keeps references to the
  // nodes inside `persistent`; appendChild preserves them all.
  node.appendChild(entry.persistent);

  if (opts?.primary) scheduleStart();
}

/** Unregister: park the persistent div in staging (still alive, CPX keeps it). */
export function unregisterCpxElement(divId: string): void {
  const entry = registry.get(divId);
  if (!entry) return;
  entry.node = null;
  entry.callbacks = undefined;
  getStaging().appendChild(entry.persistent);
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
