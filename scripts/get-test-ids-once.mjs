import pg from "pg";
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const r = await p.query(
  `SELECT id, email, identity, tx_points_balance FROM users WHERE email IN ($1, $2)`,
  ["thorx1111dev@gmail.com", "thorx11dev@gmail.com"],
);
r.rows.forEach((x) => console.log(`${x.email} | userID: ${x.id} | ${x.identity} | ${x.tx_points_balance} pts`));
await p.end();
