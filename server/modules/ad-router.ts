/**
 * THORX Smart AI Ad Router (Rule-Based)
 *
 * Selects the best ad network based on real performance stats.
 * Scoring formula (Q5 spec weights):
 *   score = (revenue × 0.4) + (fillRate × 0.3) + (completionRate × 0.2) + (latency × 0.1)
 *
 * Revenue:         40% — normalised CPM PKR (max ~10 PKR assumed)
 * Fill Rate:       30% — % of ad requests filled
 * Completion Rate: 20% — % of served ads completed
 * Latency:         10% — inverted priority score (lower priority# = faster = higher score)
 *
 * Result is cached 5 minutes. Falls back to AD_NETWORKS priority order if no stats available.
 */

import { db } from "../db";
import { adNetworkPerformance, systemConfig } from "@shared/schema";
import { desc, gte, sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../lib/logger";

export interface NetworkScore {
  networkId: string;
  networkName: string;
  score: number;
  cpmPkr: number;
  fillRatePct: number;
  completionRatePct: number;
  isActive: boolean;
  priority: number;
  zoneId: string;
  type: string;
}

export interface RouterRecommendation {
  rankedNetworks: NetworkScore[];
  primaryNetworkId: string;
  scoredAt: string;
  cached: boolean;
  fallbackReason?: string;
}

// ─── In-memory cache ─────────────────────────────────────────────────────────
let _cache: { data: RouterRecommendation; expiresAt: number } | null = null;

export function invalidateRouterCache(): void {
  _cache = null;
}

// ─── Main router function ─────────────────────────────────────────────────────

export async function getAdRouterRecommendation(
  forceRefresh = false,
): Promise<RouterRecommendation> {
  const cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  if (!forceRefresh && _cache && Date.now() < _cache.expiresAt) {
    return { ..._cache.data, cached: true };
  }

  try {
    // Load configured networks from system_config
    const configuredNetworks = await storage.getSystemConfigValue<AdNetworkConfig[]>(
      "AD_NETWORKS",
      DEFAULT_NETWORKS,
    );

    const activeNetworks = configuredNetworks.filter((n) => n.isActive);
    if (activeNetworks.length === 0) {
      return buildFallback(configuredNetworks, "No active networks configured");
    }

    // Fetch last 7 days performance per network
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const perfRows = await db
      .select({
        networkId: adNetworkPerformance.networkId,
        networkName: adNetworkPerformance.networkName,
        avgCpm: sql<string>`AVG(${adNetworkPerformance.cpmPkr})`,
        avgFillRate: sql<string>`AVG(${adNetworkPerformance.fillRatePct})`,
        avgCompletionRate: sql<string>`AVG(${adNetworkPerformance.completionRatePct})`,
        totalImpressions: sql<string>`SUM(${adNetworkPerformance.impressions})`,
      })
      .from(adNetworkPerformance)
      .where(gte(adNetworkPerformance.date, since.toISOString().slice(0, 10) as any))
      .groupBy(adNetworkPerformance.networkId, adNetworkPerformance.networkName);

    // Build scored list
    const perfMap = new Map(perfRows.map((r) => [r.networkId, r]));

    const scored: NetworkScore[] = activeNetworks.map((network) => {
      const perf = perfMap.get(network.id);
      const cpm = perf ? parseFloat(perf.avgCpm ?? "0") : 0;
      const fill = perf ? parseFloat(perf.avgFillRate ?? "0") : 0;
      const completion = perf ? parseFloat(perf.avgCompletionRate ?? "0") : 0;

      // Q5 spec weights: Revenue 40%, Fill Rate 30%, Completion Rate 20%, Latency 10%.
      // CPM normalised to 0-100 assuming max CPM ~10 PKR.
      // Latency proxied from priority: priority 1 → 100 pts, priority 10 → 10 pts (inverted scale).
      const cpmNorm = Math.min(100, (cpm / 10) * 100);
      const latencyScore = Math.max(0, 110 - network.priority * 10); // lower priority# = faster
      const score =
        cpmNorm * 0.4 + fill * 0.3 + completion * 0.2 + latencyScore * 0.1;

      return {
        networkId: network.id,
        networkName: network.name,
        score: Math.round(score * 100) / 100,
        cpmPkr: cpm,
        fillRatePct: fill,
        completionRatePct: completion,
        isActive: network.isActive,
        priority: network.priority,
        zoneId: network.zoneId,
        type: network.type,
      };
    });

    // Networks with no stats: use priority as tiebreaker (lower priority number = better)
    const hasStats = (n: NetworkScore) => n.cpmPkr > 0 || n.fillRatePct > 0;
    scored.sort((a, b) => {
      const aHas = hasStats(a);
      const bHas = hasStats(b);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      if (!aHas && !bHas) return a.priority - b.priority;
      return b.score - a.score;
    });

    const primary = scored[0];
    const fallbackReason =
      !hasStats(primary)
        ? "No performance data; using priority order"
        : undefined;

    const recommendation: RouterRecommendation = {
      rankedNetworks: scored,
      primaryNetworkId: primary?.networkId ?? "hilltop-1",
      scoredAt: new Date().toISOString(),
      cached: false,
      fallbackReason,
    };

    _cache = { data: recommendation, expiresAt: Date.now() + cacheTtlMs };

    logger.info(
      { primary: primary?.networkId, score: primary?.score, fallbackReason },
      "[AdRouter] Recommendation computed",
    );

    return recommendation;
  } catch (err) {
    logger.error({ err }, "[AdRouter] Error computing recommendation; using fallback");
    return buildFallback(DEFAULT_NETWORKS, "Internal error; using default priority");
  }
}

// ─── Record performance data (called by ad completion endpoints) ──────────────

export async function recordNetworkCompletion(
  networkId: string,
  networkName: string,
  cpmPkr: number,
): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(adNetworkPerformance)
      .values({
        networkId,
        networkName,
        date: today as any,
        completions: 1,
        impressions: 1,
        completionRatePct: "100.00",
        fillRatePct: "100.00",
        cpmPkr: cpmPkr.toFixed(4),
        revenuePkr: cpmPkr.toFixed(4),
        routerScore: "0.0000",
      })
      .onConflictDoUpdate({
        target: [adNetworkPerformance.networkId, adNetworkPerformance.date],
        set: {
          completions: sql`${adNetworkPerformance.completions} + 1`,
          impressions: sql`${adNetworkPerformance.impressions} + 1`,
          revenuePkr: sql`${adNetworkPerformance.revenuePkr} + ${cpmPkr.toFixed(4)}`,
        },
      });
    // Recalculate derived stats
    await updateNetworkRates(networkId, today);
    // Invalidate router cache so next request sees fresh data
    invalidateRouterCache();
  } catch (err) {
    logger.warn({ err, networkId }, "[AdRouter] Failed to record completion stat");
  }
}

async function updateNetworkRates(networkId: string, date: string): Promise<void> {
  // Recompute fill rate and completion rate from current impressions/completions
  await db.execute(
    sql`UPDATE ad_network_performance
        SET fill_rate_pct       = CASE WHEN impressions > 0 THEN ROUND((completions::numeric / impressions) * 100, 2) ELSE 0 END,
            completion_rate_pct = CASE WHEN impressions > 0 THEN ROUND((completions::numeric / impressions) * 100, 2) ELSE 0 END
        WHERE network_id = ${networkId} AND date = ${date}`,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface AdNetworkConfig {
  id: string;
  name: string;
  zoneId: string;
  type: string;
  priority: number;
  isActive: boolean;
}

const DEFAULT_NETWORKS: AdNetworkConfig[] = [
  { id: "hilltop-1",     name: "HilltopAds",    zoneId: "default", type: "video", priority: 1, isActive: true },
  { id: "monetag-1",     name: "Monetag",        zoneId: "default", type: "video", priority: 2, isActive: false },
  { id: "adsterra-1",    name: "Adsterra",       zoneId: "default", type: "video", priority: 3, isActive: false },
  { id: "propeller-1",   name: "PropellerAds",   zoneId: "default", type: "video", priority: 4, isActive: false },
  { id: "admaven-1",     name: "AdMaven",        zoneId: "default", type: "banner", priority: 5, isActive: false },
];

function buildFallback(
  networks: AdNetworkConfig[],
  reason: string,
): RouterRecommendation {
  const sorted = [...networks].sort((a, b) => a.priority - b.priority);
  const scored: NetworkScore[] = sorted.map((n) => ({
    networkId: n.id,
    networkName: n.name,
    score: 0,
    cpmPkr: 0,
    fillRatePct: 0,
    completionRatePct: 0,
    isActive: n.isActive,
    priority: n.priority,
    zoneId: n.zoneId,
    type: n.type,
  }));
  return {
    rankedNetworks: scored,
    primaryNetworkId: sorted[0]?.id ?? "hilltop-1",
    scoredAt: new Date().toISOString(),
    cached: false,
    fallbackReason: reason,
  };
}
