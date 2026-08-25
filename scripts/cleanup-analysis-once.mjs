/**
 * DB Cleanup ANALYSIS (read-only) — kya delete hoga, kya bachega.
 * Run: node scripts/cleanup-analysis-once.mjs
 */
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Test-only email domains (koi real user in par nahi ho sakta)
const TEST_PATTERNS = [
  "%@thorx-test.local",
  "%@thorx-e2e.local",
  "%@t.local",
  "%@thorx.local",
  "%@test.local",
  "%@thorx.test",
];

try {
  // 1 — Test users
  const { rows: testUsers } = await pool.query(
    `SELECT id, email FROM users
     WHERE email LIKE ANY($1) AND email <> 'thorx11dev@gmail.com'`,
    [TEST_PATTERNS],
  );
  const ids = testUsers.map((r) => r.id);
  console.log(`═══ TEST USERS: ${ids.length} ═══`);

  // 2 — Real users jo BACHENGAY (sanity check)
  const { rows: keep } = await pool.query(
    `SELECT email, role FROM users
     WHERE NOT (email LIKE ANY($1))
     ORDER BY role, email LIMIT 30`,
    [TEST_PATTERNS],
  );
  console.log(`\n═══ KEEP (real users sample): ═══`);
  keep.forEach((r) => console.log(`  ${r.role.padEnd(8)} ${r.email}`));
  const { rows: keepCount } = await pool.query(
    `SELECT count(*)::int AS n FROM users WHERE NOT (email LIKE ANY($1))`,
    [TEST_PATTERNS],
  );
  console.log(`  ... total keep: ${keepCount[0].n}`);

  // 3 — Saari FK constraints jo users ko reference karti hain
  const { rows: fks } = await pool.query(`
    SELECT tc.table_name, kcu.column_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'users'
    ORDER BY tc.table_name
  `);

  console.log(`\n═══ USER-REFERENCING TABLES (${fks.length}) — rows jo delete hongi: ═══`);
  for (const fk of fks) {
    const col = fk.column_name;
    const { rows: cnt } = await pool.query(
      `SELECT count(*)::int AS n FROM "${fk.table_name}" WHERE "${col}" = ANY($1)`,
      [ids],
    );
    if (cnt[0].n > 0 || fk.delete_rule !== "CASCADE") {
      console.log(
        `  ${fk.table_name}.${col} [${fk.delete_rule}] : ${cnt[0].n} rows`,
      );
    }
  }

  // 4 — Guilds jinke captain/members test users hain
  const { rows: guilds } = await pool.query(
    `SELECT count(*)::int AS n FROM guilds WHERE "captainId" = ANY($1)`,
    [ids],
  );
  console.log(`\n═══ GUILDS with test captain: ${guilds[0].n} ═══`);

  // 5 — Sessions of test users
  const { rows: sess } = await pool.query(
    `SELECT count(*)::int AS n FROM session WHERE sess->>'userId' = ANY($1)`,
    [ids],
  );
  console.log(`═══ SESSIONS of test users: ${sess[0].n} ═══`);
} finally {
  await pool.end();
}
