import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  // Server-side tests import server/db.ts which requires DATABASE_URL at module
  // load. Vitest does NOT auto-load .env/.env.local into process.env for the
  // Node test environment, so inject them explicitly (Vite's loadEnv parses
  // .env, .env.local, .env.[mode], .env.[mode].local).
  const fileEnv = loadEnv(mode, process.cwd(), "");

  return {
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "shared"),
        "@": path.resolve(__dirname, "client/src"),
      },
    },
    test: {
      // Run only THORX's test suites; broad globs also discover generated
      // dependency tests under Replit's .cache/typescript tree.
      include: ["server/__tests__/**/*.test.ts"],
      exclude: ["node_modules", "dist", "client"],
      environment: "node",
      // Force test-safe cookie settings: isReplit=true on Replit forces secure:true
      // which tough-cookie (supertest) drops on plain HTTP — sessions never persist.
      env: {
        NODE_ENV: "test",
        ...fileEnv,
      },
      // recordEarnEvent() fires ~32 system_config DB round-trips per call;
      // default 5 s is too tight for that path in CI/test environments.
      testTimeout: 30_000,
      hookTimeout: 60_000,
      // Show each individual test name in output
      reporter: "verbose",
      coverage: {
        provider: "v8",
        include: ["server/**/*.ts"],
        exclude: ["server/__tests__", "node_modules"],
      },
    },
  };
});
