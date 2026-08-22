/**
 * THORX Multi-Network Ad Infrastructure
 *
 * Architecture-ready registry for 5 ad networks:
 *   • HilltopAds   — fully implemented (API key via DB)
 *   • Monetag       — infrastructure ready (API key slot reserved)
 *   • Adsterra      — infrastructure ready
 *   • PropellerAds  — infrastructure ready
 *   • AdMaven       — infrastructure ready
 *
 * Each network implements the AdNetworkAdapter interface.
 * The registry exposes the active adapter list for the AI router.
 *
 * To activate a new network: add its API key via admin panel
 * (NETWORK_KEYS_JSON system_config key), the adapter will pick
 * it up automatically on the next request.
 */

import { logger } from "./lib/logger";
import { storage } from "./storage";

// ─── Base Interface ───────────────────────────────────────────────────────────

export interface AdNetworkAdapter {
  readonly id: string;
  readonly name: string;

  /** Returns true if the network has an API key configured. */
  isConfigured(): Promise<boolean>;

  /**
   * Fetch an ad tag/code for the given zone.
   * Returns null if network is unavailable.
   */
  getAdCode(zoneId: string, format: "video" | "banner" | "pop_under"): Promise<string | null>;

  /**
   * Report ad completion to the network (for publisher revenue tracking).
   * Fire-and-forget — errors logged but not propagated.
   */
  reportCompletion(zoneId: string, adId: string, userId: string): Promise<void>;

  /**
   * Verify that a given ad completion is legitimate (server-side check).
   * Return true if reward should be granted.
   */
  verifyCompletion(params: {
    adId: string;
    userId: string;
    sessionToken?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<boolean>;
}

// ─── HilltopAds Adapter ───────────────────────────────────────────────────────

class HilltopAdsAdapter implements AdNetworkAdapter {
  readonly id = "hilltop-1";
  readonly name = "HilltopAds";

  async isConfigured(): Promise<boolean> {
    const config = await storage.getHilltopAdsConfig();
    return !!(config?.apiKey && config.isActive);
  }

  async getAdCode(zoneId: string): Promise<string | null> {
    try {
      const { hilltopAdsService } = await import("./hilltopads-service");
      const code = await hilltopAdsService.getAntiAdBlockCode(zoneId);
      return code;
    } catch (err) {
      logger.warn({ err, zoneId }, "[HilltopAds] getAdCode failed");
      return null;
    }
  }

  async reportCompletion(_zoneId: string, _adId: string, _userId: string): Promise<void> {
    // HilltopAds tracks via their own pixel — no explicit completion callback needed
  }

  async verifyCompletion(params: {
    adId: string; userId: string; sessionToken?: string; ipAddress?: string;
  }): Promise<boolean> {
    // HilltopAds uses HMAC webhook verification — this is the pre-webhook
    // client-side path. Timing + session checks are done at route level.
    return true;
  }
}

// ─── Monetag Adapter (Stub — API key not yet configured) ─────────────────────

class MonetagAdapter implements AdNetworkAdapter {
  readonly id = "monetag-1";
  readonly name = "Monetag";

  async isConfigured(): Promise<boolean> {
    const keys = await getNetworkKeys();
    return !!(keys["monetag-1"]?.apiKey);
  }

  async getAdCode(zoneId: string, format: "video" | "banner" | "pop_under"): Promise<string | null> {
    const keys = await getNetworkKeys();
    const key = keys["monetag-1"]?.apiKey;
    if (!key) return null;

    // Monetag uses a standard script-tag integration
    return `<!-- Monetag Zone ${zoneId} -->\n<script async src="https://monetag.com/tag/${zoneId}/${format}.js"></script>`;
  }

  async reportCompletion(_zoneId: string, _adId: string, _userId: string): Promise<void> {
    // Monetag uses server-to-server postback URL
    logger.debug({ _zoneId, _adId }, "[Monetag] Completion reported (stub)");
  }

  async verifyCompletion(): Promise<boolean> {
    // HARD GATE (beta security audit): until Monetag's real postback + HMAC
    // verification is implemented there is NO way to prove a completion, so
    // the network must never be eligible for rewards. The previous stub
    // returned true unconditionally — activating the network would have let
    // any client claim fake completions for free credit (Golden Rule: no
    // verification = no reward).
    logger.warn("[Monetag] verifyCompletion called but integration not implemented — refusing reward");
    return false;
  }
}

// ─── Adsterra Adapter (Stub) ──────────────────────────────────────────────────

class AdsterraAdapter implements AdNetworkAdapter {
  readonly id = "adsterra-1";
  readonly name = "Adsterra";

  async isConfigured(): Promise<boolean> {
    const keys = await getNetworkKeys();
    return !!(keys["adsterra-1"]?.apiKey);
  }

  async getAdCode(zoneId: string): Promise<string | null> {
    const keys = await getNetworkKeys();
    if (!keys["adsterra-1"]?.apiKey) return null;
    return `<!-- Adsterra Zone ${zoneId} -->\n<script async src="//www.topcreativeformat.com/${zoneId}/invoke.js"></script>`;
  }

  async reportCompletion(): Promise<void> {}
  async verifyCompletion(): Promise<boolean> {
    // HARD GATE: see Monetag adapter — stubs must never verify rewards.
    logger.warn("[Adsterra] verifyCompletion called but integration not implemented — refusing reward");
    return false;
  }
}

// ─── PropellerAds Adapter (Stub) ─────────────────────────────────────────────

class PropellerAdsAdapter implements AdNetworkAdapter {
  readonly id = "propeller-1";
  readonly name = "PropellerAds";

  async isConfigured(): Promise<boolean> {
    const keys = await getNetworkKeys();
    return !!(keys["propeller-1"]?.apiKey);
  }

  async getAdCode(zoneId: string): Promise<string | null> {
    const keys = await getNetworkKeys();
    if (!keys["propeller-1"]?.apiKey) return null;
    return `<!-- PropellerAds Zone ${zoneId} -->\n<script async src="https://mariosf.com/pfe/current/tag.min.js" data-zone="${zoneId}"></script>`;
  }

  async reportCompletion(): Promise<void> {}
  async verifyCompletion(): Promise<boolean> {
    // HARD GATE: see Monetag adapter — stubs must never verify rewards.
    logger.warn("[PropellerAds] verifyCompletion called but integration not implemented — refusing reward");
    return false;
  }
}

// ─── AdMaven Adapter (Stub) ───────────────────────────────────────────────────

class AdMavenAdapter implements AdNetworkAdapter {
  readonly id = "admaven-1";
  readonly name = "AdMaven";

  async isConfigured(): Promise<boolean> {
    const keys = await getNetworkKeys();
    return !!(keys["admaven-1"]?.apiKey);
  }

  async getAdCode(zoneId: string): Promise<string | null> {
    const keys = await getNetworkKeys();
    if (!keys["admaven-1"]?.apiKey) return null;
    return `<!-- AdMaven Zone ${zoneId} -->\n<script type="text/javascript" src="//cdn.ad-maven.com/ads/${zoneId}.js"></script>`;
  }

  async reportCompletion(): Promise<void> {}
  async verifyCompletion(): Promise<boolean> {
    // HARD GATE: see Monetag adapter — stubs must never verify rewards.
    logger.warn("[AdMaven] verifyCompletion called but integration not implemented — refusing reward");
    return false;
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const ADAPTERS: AdNetworkAdapter[] = [
  new HilltopAdsAdapter(),
  new MonetagAdapter(),
  new AdsterraAdapter(),
  new PropellerAdsAdapter(),
  new AdMavenAdapter(),
];

const ADAPTER_MAP = new Map(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(networkId: string): AdNetworkAdapter | undefined {
  return ADAPTER_MAP.get(networkId);
}

export function getAllAdapters(): AdNetworkAdapter[] {
  return ADAPTERS;
}

/** Returns only adapters that have an API key configured. */
export async function getConfiguredAdapters(): Promise<AdNetworkAdapter[]> {
  const results = await Promise.all(
    ADAPTERS.map(async (a) => ({ adapter: a, ok: await a.isConfigured() })),
  );
  return results.filter((r) => r.ok).map((r) => r.adapter);
}

// ─── Keys helper ─────────────────────────────────────────────────────────────

interface NetworkKeyConfig {
  apiKey?: string;
  publisherId?: string;
  webhookSecret?: string;
}

async function getNetworkKeys(): Promise<Record<string, NetworkKeyConfig>> {
  const raw = await storage.getSystemConfigValue<string>("NETWORK_KEYS_JSON", "{}");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ─── Ad Code Serving (used by routes.ts) ─────────────────────────────────────

/**
 * Returns ad code from the specified network, falling back through
 * the priority list if the requested network fails.
 */
export async function serveAdCode(
  networkId: string,
  zoneId: string,
  format: "video" | "banner" | "pop_under" = "video",
): Promise<{ code: string; networkUsed: string } | null> {
  // Try requested network first
  const primary = getAdapter(networkId);
  if (primary) {
    try {
      const code = await primary.getAdCode(zoneId, format);
      if (code) return { code, networkUsed: networkId };
    } catch (err) {
      logger.warn({ err, networkId }, "[AdRegistry] Primary network failed; trying fallbacks");
    }
  }

  // Fallback through configured adapters in order
  const fallbacks = await getConfiguredAdapters();
  for (const adapter of fallbacks) {
    if (adapter.id === networkId) continue;
    try {
      const code = await adapter.getAdCode(zoneId, format);
      if (code) {
        logger.info({ primary: networkId, fallback: adapter.id }, "[AdRegistry] Using fallback network");
        return { code, networkUsed: adapter.id };
      }
    } catch { /* try next */ }
  }

  return null;
}
