import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";
import { logger } from "./lib/logger";

// L-05 / H-13: Replaced console.log with pino logger for consistent structured output.
export function log(message: string, source = "express") {
  logger.info({ source }, message);
}

export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteConfig = (await import("../vite.config.js")).default;
  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // process.exit(1); // Removed to prevent server from stopping on frontend errors
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Serve public assets (avatars, logos, payment icons) with long-lived cache
  // headers before Vite's dev middleware. Vite's own middleware sends
  // no-cache for everything (needed for HMR), which meant every avatar/logo
  // was re-fetched from the network on every single render. These files are
  // static images that rarely change, so let the browser cache them locally
  // and skip the network entirely on repeat loads.
  const publicDir = path.resolve(import.meta.dirname, "..", "client", "public");
  app.use(
    express.static(publicDir, {
      maxAge: "7d",
      etag: true,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      },
    }),
  );

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Built client + server bundle both live in dist/ (vite outDir = dist, esbuild
  // bundle = dist/index.js). Resolve from cwd so the bundled server
  // (dist/index.js, run from the project root) finds the static assets.
  const distPath = path.resolve(process.cwd(), "dist");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(
    express.static(distPath, {
      maxAge: "7d",
      etag: true,
      setHeaders: (res, filePath) => {
        // Vite build output filenames are content-hashed (e.g. index-abc123.js),
        // so they can safely be cached forever — a content change always means
        // a new filename, never a stale hit.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
        }
      },
    }),
  );

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
