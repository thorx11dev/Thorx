import posthog from "posthog-js";

/**
 * THORX analytics — PostHog wrapper.
 * Activates only when VITE_POSTHOG_KEY is present at build time; every helper
 * is a safe no-op otherwise so the app runs key-less in dev/sandbox.
 *
 * Funnel: user_registered → earn_completed → withdrawal_requested → payout_paid
 */

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

let initialized = false;

export function initPosthog(): void {
  if (!key || initialized) return;
  posthog.init(key, {
    api_host: host,
    // SPA: pageviews are captured per-section via captureEvent, not URL changes
    capture_pageview: false,
    autocapture: true,
    capture_exceptions: true,
  });
  initialized = true;
}

export function isPosthogEnabled(): boolean {
  return Boolean(key);
}

export function identifyUser(
  id: string,
  props?: { email?: string; name?: string; role?: string; rankTier?: string },
): void {
  if (!key || !id) return;
  posthog.identify(id, props);
}

export function captureEvent(name: string, props?: Record<string, unknown>): void {
  if (!key) return;
  posthog.capture(name, props);
}

/** Call on logout so the next login on a shared device isn't misattributed. */
export function resetPosthog(): void {
  if (!initialized) return;
  posthog.reset();
}
