/**
 * DB Cleanup EXECUTION — test users + unka data, FK-safe order, single transaction.
 * Koi bhi FK error = poora ROLLBACK (zero partial state).
 * Run: node scripts/cleanup-exec-once.mjs
 */
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TEST_PATTERNS = [
  "%@thorx-test.local",
  "%@thorx-e2e.local",
  "%@t.local",
  "%@thorx.local",
  "%@test.local",
  "%@thorx.test",
  "%@example.com",
];

async function main() {
  const client = await pool.connect();
  const log = [];
  try {
    await client.query("BEGIN");

    // 0 — test user ids (founder/tester/real users kabhi match nahi hote)
    const { rows: tu } = await client.query(
      `SELECT id FROM users WHERE email LIKE ANY($1)`,
      [TEST_PATTERNS],
    );
    const ids = tu.map((r) => r.id);
    console.log(`Test users: ${ids.length}`);
    if (ids.length === 0) { console.log("Kuch clean karne ko nahi."); await client.query("COMMIT"); return; }

    const step = async (label, sql, params = []) => {
      const r = await client.query(sql, params);
      log.push(`${label}: ${r.rowCount}`);
      return r;
    };

    // ── Phase A: RESTRICT/NO ACTION children (test-user scoped) ────────────
    await step("earnings", `DELETE FROM earnings WHERE user_id = ANY($1)`, [ids]);
    await step("user_transactions", `DELETE FROM user_transactions WHERE user_id = ANY($1)`, [ids]);
    await step("withdrawals", `DELETE FROM withdrawals WHERE user_id = ANY($1)`, [ids]);
    await step("ad_views", `DELETE FROM ad_views WHERE user_id = ANY($1)`, [ids]);
    await step("survey_records", `DELETE FROM survey_records WHERE user_id = ANY($1)`, [ids]);
    await step("engine_b_records", `DELETE FROM engine_b_records WHERE user_id = ANY($1)`, [ids]);
    await step("points_ledger", `DELETE FROM points_ledger WHERE user_id = ANY($1)`, [ids]);
    await step("referrals", `DELETE FROM referrals WHERE referrer_id = ANY($1) OR referred_id = ANY($1)`, [ids]);
    await step("referral_commissions", `DELETE FROM referral_commissions WHERE referrer_id = ANY($1) OR invitee_id = ANY($1)`, [ids]);
    await step("referral_earn_commissions", `DELETE FROM referral_earn_commissions WHERE referrer_id = ANY($1) OR earner_id = ANY($1)`, [ids]);
    await step("commission_logs", `DELETE FROM commission_logs WHERE source_user_id = ANY($1) OR beneficiary_id = ANY($1)`, [ids]);
    await step("risk_cases", `DELETE FROM risk_cases WHERE user_id = ANY($1)`, [ids]);
    await step("audit_logs", `DELETE FROM audit_logs WHERE admin_id = ANY($1)`, [ids]);
    await step("team_invitations", `DELETE FROM team_invitations WHERE created_by = ANY($1)`, [ids]);
    await step("guild_war_participants(user-scope)", `DELETE FROM guild_war_participants WHERE user_id = ANY($1)`, [ids]);
    await step("activity_feed", `DELETE FROM activity_feed WHERE user_id = ANY($1)`, [ids]);
    await step("notifications", `DELETE FROM notifications WHERE user_id = ANY($1)`, [ids]);
    await step("score_history", `DELETE FROM score_history WHERE user_id = ANY($1)`, [ids]);
    await step("leaderboard_cache", `DELETE FROM leaderboard_cache WHERE user_id = ANY($1)`, [ids]);
    await step("rank_logs", `DELETE FROM rank_logs WHERE user_id = ANY($1)`, [ids]);
    await step("device_fingerprints", `DELETE FROM device_fingerprints WHERE user_id = ANY($1)`, [ids]);
    await step("guild_members(user-scope)", `DELETE FROM guild_members WHERE user_id = ANY($1)`, [ids]);
    await step("guild_creation_requests(user-scope)", `DELETE FROM guild_creation_requests WHERE user_id = ANY($1)`, [ids]);
    await step("guild_war_approvals(user-scope)", `DELETE FROM guild_war_approvals WHERE user_id = ANY($1)`, [ids]);
    await step("weekly_task_records", `DELETE FROM weekly_task_records WHERE user_id = ANY($1)`, [ids]);
    await step("engine_c_messages", `DELETE FROM engine_c_messages WHERE sender_id = ANY($1)`, [ids]);
    await step("captain_messages", `DELETE FROM captain_messages WHERE from_user_id = ANY($1) OR to_user_id = ANY($1)`, [ids]);

    // ── Phase B: test guilds (captain = test user) + unka children ─────────
    const { rows: g } = await client.query(
      `SELECT id FROM guilds WHERE captain_id = ANY($1)`, [ids],
    );
    const gids = g.map((r) => r.id);
    console.log(`Test guilds: ${gids.length}`);
    if (gids.length > 0) {
      await step("guild_wars(children-scope)", `
        DELETE FROM guild_war_approvals WHERE war_id IN (
          SELECT id FROM guild_wars WHERE "challengerGuildId" = ANY($1) OR "challengedGuildId" = ANY($1))`, [gids]);
      await step("guild_war_participants(war-scope)", `
        DELETE FROM guild_war_participants WHERE war_id IN (
          SELECT id FROM guild_wars WHERE "challengerGuildId" = ANY($1) OR "challengedGuildId" = ANY($1))`, [gids]);
      await step("guild_wars", `DELETE FROM guild_wars WHERE "challengerGuildId" = ANY($1) OR "challengedGuildId" = ANY($1)`, [gids]);
      await step("guild_badges", `DELETE FROM guild_badges WHERE guild_id = ANY($1)`, [gids]);
      await step("guild_hall_of_fame", `DELETE FROM guild_hall_of_fame WHERE guild_id = ANY($1)`, [gids]);
      await step("guild_weekly_cycles", `DELETE FROM guild_weekly_cycles WHERE guild_id = ANY($1)`, [gids]);
      await step("guild_weekly_snapshots", `DELETE FROM guild_weekly_snapshots WHERE guild_id = ANY($1)`, [gids]);
      await step("guild_profiles", `DELETE FROM guild_profiles WHERE guild_id = ANY($1)`, [gids]);
      await step("guild_strikes", `DELETE FROM guild_strikes WHERE guild_id = ANY($1)`, [gids]);
      await step("engine_c_messages(guild-scope)", `DELETE FROM engine_c_messages WHERE guild_id = ANY($1)`, [gids]);
      await step("guild_members(guild-scope)", `DELETE FROM guild_members WHERE guild_id = ANY($1)`, [gids]);
      await step("guilds", `DELETE FROM guilds WHERE id = ANY($1)`, [gids]);
    }

    // ── Phase C: users (baqi sab CASCADE ho jayega) ─────────────────────────
    await step("USERS", `DELETE FROM users WHERE id = ANY($1)`, [ids]);

    // ── Phase D: sessions ────────────────────────────────────────────────────
    await step("sessions", `DELETE FROM session WHERE sess->>'userId' = ANY($1)`, [ids]);

    await client.query("COMMIT");
    console.log("\n═══ CLEANUP COMMITTED ═══");
    log.forEach((l) => console.log("  " + l));

    // Post-checks
    const { rows: remain } = await client.query(`SELECT count(*)::int AS n FROM users`);
    const { rows: fnd } = await client.query(`SELECT email FROM users WHERE role='founder' AND email='thorx11dev@gmail.com'`);
    console.log(`\nRemaining users: ${remain[0].n}`);
    console.log(`Founder intact: ${fnd.length === 1 ? "✅ thorx11dev@gmail.com" : "❌ MISSING!"}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ ROLLBACK — koi cheez fail hui:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
