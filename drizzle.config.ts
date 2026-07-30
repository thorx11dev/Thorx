import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // `session` is owned/managed by connect-pg-simple (created via raw SQL, not
  // part of shared/schema.ts). Without this, `drizzle-kit push` treats it as
  // an untracked table and offers to DROP it on every push. Exclude it here.
  tablesFilter: ["!session"],
});
