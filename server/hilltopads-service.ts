import { storage } from "./storage";
import { logger } from "./lib/logger";
import type { InsertHilltopAdsStat } from "@shared/schema";

interface HilltopAdsStatsResponse {
  data: Array<{
    date: string;
    zone_id: string;
    impressions: number;
    clicks: number;
    cpm: number;
    revenue: number;
    ctr: number;
  }>;
}

interface HilltopAdsInventoryResponse {
  sites: Array<{
    id: string;
    name: string;
    zones: Array<{
      id: string;
      name: string;
      format: string;
      status: string;
    }>;
  }>;
}

interface HilltopAdsBalanceResponse {
  balance: number;
  currency: string;
}

interface HilltopAdsAntiAdBlockResponse {
  code: string;
  expires_at: string;
}

export class HilltopAdsService {
  private baseUrl = "https://api.hilltopads.com";
  private apiKey: string | null = null;

  async initialize(): Promise<void> {
    const config = await storage.getHilltopAdsConfig();
    if (config && config.isActive) {
      this.apiKey = config.apiKey;
    }
  }

  /**
   * True when a HilltopAds API key is configured and active. Lets callers
   * (e.g. the scheduler) skip work cleanly with an info log instead of
   * surfacing a startup error when the key hasn't been set yet.
   */
  async isConfigured(): Promise<boolean> {
    if (this.apiKey) return true;
    await this.initialize();
    return Boolean(this.apiKey);
  }

  /**
   * Execute a GET request against the HilltopAds API with exponential-backoff
   * retry logic.  Transient 429 / 5xx errors are retried up to MAX_RETRIES
   * times; 4xx client errors (except 429) are surfaced immediately.
   */
  private async makeRequest<T>(
    endpoint: string,
    params?: Record<string, string>,
    { maxRetries = 3, baseDelayMs = 500 }: { maxRetries?: number; baseDelayMs?: number } = {},
  ): Promise<T> {
    if (!this.apiKey) {
      await this.initialize();
      if (!this.apiKey) {
        throw new Error("HilltopAds API key not configured");
      }
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    let lastError: Error = new Error("Unknown error");
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Exponential backoff with full-jitter: delay = rand(0, base * 2^attempt)
      if (attempt > 0) {
        const cap = baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * cap;
        await new Promise(r => setTimeout(r, jitter));
        logger.warn(
          { endpoint, attempt, maxRetries },
          "[HilltopAds] Retrying after transient error",
        );
      }

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          // Abort after 10 s to avoid hanging the scheduler indefinitely
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) {
          return await response.json() as T;
        }

        const body = await response.text();
        // Rate-limit (429) and server errors (5xx) are retryable
        const isRetryable = response.status === 429 || response.status >= 500;
        if (!isRetryable || attempt === maxRetries) {
          throw new Error(`HilltopAds API error: ${response.status} - ${body}`);
        }
        lastError = new Error(`HilltopAds API error: ${response.status} - ${body}`);
      } catch (err) {
        // Network / timeout errors are retryable
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === maxRetries) throw lastError;
      }
    }
    throw lastError;
  }

  async getBalance(): Promise<number> {
    const response = await this.makeRequest<HilltopAdsBalanceResponse>("/publisher/balance");
    return response.balance;
  }

  async getInventory(): Promise<HilltopAdsInventoryResponse> {
    return await this.makeRequest<HilltopAdsInventoryResponse>("/publisher/inventory");
  }

  async getAntiAdBlockCode(zoneId: string): Promise<string> {
    const response = await this.makeRequest<HilltopAdsAntiAdBlockResponse>(
      "/publisher/antiAdBlock",
      { zone_id: zoneId }
    );
    return response.code;
  }

  async getStats(startDate?: string, endDate?: string, zoneId?: string): Promise<HilltopAdsStatsResponse> {
    const params: Record<string, string> = {};
    
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (zoneId) params.zone_id = zoneId;

    return await this.makeRequest<HilltopAdsStatsResponse>("/publisher/listStats", params);
  }

  async syncInventory(): Promise<void> {
    try {
      const inventory = await this.getInventory();
      
      for (const site of inventory.sites) {
        for (const zone of site.zones) {
          const existingZone = await storage.getHilltopAdsZoneById(zone.id);
          
          if (!existingZone) {
            await storage.createHilltopAdsZone({
              zoneId: zone.id,
              siteName: site.name,
              zoneName: zone.name,
              adFormat: zone.format,
              status: zone.status,
              settings: {}
            });
          } else if (existingZone.status !== zone.status) {
            await storage.updateHilltopAdsZone(existingZone.id, {
              status: zone.status
            });
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to sync HilltopAds inventory");
      throw error;
    }
  }

  async syncStats(startDate?: string, endDate?: string): Promise<void> {
    try {
      const stats = await this.getStats(startDate, endDate);
      
      for (const stat of stats.data) {
        const zone = await storage.getHilltopAdsZoneById(stat.zone_id);
        
        if (zone) {
          const statData: InsertHilltopAdsStat = {
            zoneId: zone.id,
            date: new Date(stat.date),
            impressions: stat.impressions,
            clicks: stat.clicks,
            cpm: stat.cpm.toString(),
            revenue: stat.revenue.toString(),
            ctr: stat.ctr.toString(),
            metadata: {}
          };

          await storage.createHilltopAdsStat(statData);

          await storage.updateHilltopAdsZone(zone.id, {
            totalImpressions: (zone.totalImpressions || 0) + stat.impressions,
            totalClicks: (zone.totalClicks || 0) + stat.clicks,
            totalRevenue: (parseFloat(zone.totalRevenue || "0") + stat.revenue).toFixed(2)
          });
        }
      }

      const config = await storage.getHilltopAdsConfig();
      if (config) {
        await storage.updateHilltopAdsConfig(config.id, {
          lastSyncedAt: new Date()
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to sync HilltopAds stats");
      throw error;
    }
  }

  async syncDailyStats(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    await this.syncStats(dateStr, dateStr);
  }
}

export const hilltopAdsService = new HilltopAdsService();
