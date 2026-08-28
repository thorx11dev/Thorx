import type { Express, Request, Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { leaderboardCache, users } from "@shared/schema";
import { logger } from "../lib/logger";
import { requireSessionAuth } from "../routes";
import { publicApiRateLimiter } from "../middleware/auth-rate-limit";

/**
 * User-facing leaderboard (privacy-safe).
 * Backed by leaderboard_cache (refreshed by the 15-min cron) so reads stay
 * cheap and never expose financial data. Public surface per entry:
 * display name (first name + last initial), rank tier, performance score,
 * avatar slot + self-chosen profile picture (same exposure as the guild
 * roster and referral tree). Emails, balances and trust flags stay
 * server-side only.
 */
export function registerLeaderboardRoutes(app: Express): void {
  app.get("/api/leaderboard", requireSessionAuth, publicApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const requesterId = (req as any).session?.userId as string | undefined;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);

      const rows = await db
        .select({
          userId: leaderboardCache.userId,
          globalRank: leaderboardCache.globalRank,
          performanceScore: leaderboardCache.performanceScore,
          userRankTier: leaderboardCache.userRankTier,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.avatar,
          profilePicture: users.profilePicture,
        })
        .from(leaderboardCache)
        .innerJoin(users, eq(leaderboardCache.userId, users.id))
        .orderBy(leaderboardCache.globalRank)
        .limit(limit);

      const [meta] = await db
        .select({
          totalRanked: sql<number>`COUNT(*)::int`,
          lastUpdated: sql<Date | null>`MAX(${leaderboardCache.recordedAt})`,
        })
        .from(leaderboardCache);

      const leaders = rows.map((row) => {
        const lastInitial = row.lastName ? `${row.lastName.trim().charAt(0).toUpperCase()}.` : "";
        return {
          rank: row.globalRank,
          name: `${row.firstName} ${lastInitial}`.trim(),
          rankTier: row.userRankTier ?? "E-Rank",
          score: Number(row.performanceScore),
          avatar: row.avatar ?? null,
          profilePicture: row.profilePicture ?? null,
          isMe: requesterId === row.userId,
        };
      });

      let me: { rank: number; score: number; rankTier: string } | null = null;
      if (requesterId) {
        const [mine] = await db
          .select({
            globalRank: leaderboardCache.globalRank,
            performanceScore: leaderboardCache.performanceScore,
            userRankTier: leaderboardCache.userRankTier,
          })
          .from(leaderboardCache)
          .where(eq(leaderboardCache.userId, requesterId))
          .limit(1);
        if (mine) {
          me = {
            rank: mine.globalRank,
            score: Number(mine.performanceScore),
            rankTier: mine.userRankTier ?? "E-Rank",
          };
        }
      }

      res.json({
        leaders,
        me,
        totalRanked: Number(meta?.totalRanked ?? 0),
        lastUpdated: meta?.lastUpdated ?? null,
      });
    } catch (error) {
      logger.error({ err: error }, "[Leaderboard] Failed to load public leaderboard");
      res.status(500).json({ message: "Failed to load leaderboard", error: "INTERNAL_ERROR" });
    }
  });
}
