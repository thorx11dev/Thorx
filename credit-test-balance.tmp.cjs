const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const email = "thorx1111dev@gmail.com";
  const CREDIT = "5000000.00";

  const { rows } = await pool.query(
    `UPDATE users
       SET available_balance = available_balance + $2,
           updated_at = now()
     WHERE email = $1
     RETURNING id, identity, available_balance`,
    [email, CREDIT]
  );

  if (rows.length === 0) {
    console.log("USER NOT FOUND:", email);
    await pool.end();
    process.exit(1);
  }
  console.log("credited Rs." + CREDIT + " →", rows[0].identity);
  console.log("new available_balance:", rows[0].available_balance);
  await pool.end();
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
