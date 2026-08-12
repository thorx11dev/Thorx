import { describe, it } from "vitest";
import { db, pool } from "../db";
import { users, activityFeed, adViews } from "@shared/schema";
import { count } from "drizzle-orm";

describe("ZZ count", () => {
  it("prints table sizes", async () => {
    const [u] = await db.select({ n: count() }).from(users);
    const [a] = await db.select({ n: count() }).from(adViews);
    const [f] = await db.select({ n: count() }).from(activityFeed);
    console.log(`ZZCOUNT users=${u?.n ?? 0} adViews=${a?.n ?? 0} activityFeed=${f?.n ?? 0}`);
    await pool.end();
  }, 60_000);
});
