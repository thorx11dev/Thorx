/**
 * THORX Store — user marketplace + admin catalog management routes.
 *
 * USER (session-auth):
 *   GET  /api/store                      → published catalog + ownership + active customization
 *   POST /api/store/purchase             → atomic TX-Points spend → ownership (idempotent)
 *   POST /api/store/activate             → activate an OWNED item (theme or component variant)
 *   POST /api/store/deactivate           → revert to default (theme or component slot)
 *
 * ADMIN (founder/admin/team role):
 *   GET   /api/admin/store/items         → full catalog including drafts/archived
 *   POST  /api/admin/store/items         → create catalog entry
 *   PATCH /api/admin/store/items/:id     → edit metadata / status transitions
 *
 * SAFETY MODEL (Spec §17): the catalog here is metadata-only. Visual
 * definitions live in a validated registry (ref_key must match a known key)
 * — admin edits can never inject CSS/JS into the user's browser. The client
 * registry is the single source of visual truth; this API manages commerce.
 *
 * ECONOMY RULE (Spec §2): the Store CONSUMES TX-Points only. There is no
 * endpoint here that can credit points — earning stays exclusively inside the
 * task-completion pipeline (recordEarnEvent).
 */

import type { Express, Request } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireSessionAuth } from "../routes";
import { logger } from "../lib/logger";

// ─── Validated registry keys (mirror of client/src/lib/store-registry.ts) ────
// A catalog entry whose ref_key is not listed here is rejected — this is what
// makes admin input safe: unknown keys cannot render. The Store sells UI
// COMPONENT VARIANTS only — full themes were retired (default THORX look is
// the single visual language), so theme keys are no longer purchasable.
export const COMPONENT_VARIANT_REGISTRY: Record<string, string[]> = {
  dashboard_cards: ["dashboard_cards_serif", "dashboard_cards_mono", "dashboard_cards_sticker"],
};

function isKnownRefKey(itemType: string, refKey: string, componentType?: string): boolean {
  if (itemType === "theme") return false; // themes retired — never creatable again
  if (itemType === "component") {
    if (!componentType) return false;
    return (COMPONENT_VARIANT_REGISTRY[componentType] ?? []).includes(refKey);
  }
  return false;
}

function getPrincipal(req: Request): string | undefined {
  return (req as any).session?.userId;
}

function requireStoreAdmin(req: Request): boolean {
  const role = (req as any).userProfile?.role;
  return role === "founder" || role === "admin" || role === "team";
}

const createStoreItemSchema = z.object({
  itemType: z.enum(["theme", "component"]),
  refKey: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/),
  componentType: z.string().regex(/^[a-z0-9_]+$/).optional(),
  title: z.string().min(2).max(120),
  description: z.string().max(600).default(""),
  category: z.string().max(40).default("general"),
  pricePoints: z.number().int().min(0).max(10_000_000),
  status: z.enum(["draft", "published", "unpublished", "archived"]).default("draft"),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(100),
  version: z.number().int().min(1).max(1000).default(1),
});

const updateStoreItemSchema = createStoreItemSchema.partial().omit({ itemType: true, refKey: true, componentType: true });

export function registerStoreRoutes(app: Express): void {
  // ── User: store front ─────────────────────────────────────────────────────
  app.get("/api/store", requireSessionAuth, async (req, res) => {
    try {
      const userId = getPrincipal(req);
      if (!userId) return res.status(401).json({ error: "NO_SESSION" });

      const [items, ownership] = await Promise.all([
        storage.listStoreItems(), // published only
        storage.getUserStoreOwnership(userId),
      ]);

      res.json({
        items: items.map((i) => ({
          id: i.id,
          itemType: i.itemType,
          refKey: i.refKey,
          title: i.title,
          description: i.description,
          category: i.category,
          pricePoints: i.pricePoints,
          featured: i.featured,
          version: i.version,
          owned: ownership.ownedItemIds.includes(i.id),
        })),
        ownedItemIds: ownership.ownedItemIds,
        active: {
          themeItemId: ownership.activeThemeItemId,
          components: ownership.activeComponents,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "[Store] Failed to load store");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  // Atomic purchase: server-authoritative price/ownership/balance (Spec §19).
  app.post("/api/store/purchase", requireSessionAuth, async (req, res) => {
    try {
      const userId = getPrincipal(req);
      if (!userId) return res.status(401).json({ error: "NO_SESSION" });

      const schema = z.object({
        itemId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(64).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

      const result = await storage.purchaseStoreItem({
        userId,
        itemId: parsed.data.itemId,
        idempotencyKey: parsed.data.idempotencyKey,
      });

      logger.info({ userId, itemId: parsed.data.itemId, outcome: result.outcome }, "[Store] Purchase");
      res.json({
        success: true,
        outcome: result.outcome, // purchased | already_owned | duplicate_request
        item: { id: result.item.id, title: result.item.title, refKey: result.item.refKey, itemType: result.item.itemType },
        txPointsBalance: result.txPointsBalance,
      });
    } catch (error: any) {
      const msg = String(error?.message ?? "");
      if (msg.startsWith("INSUFFICIENT_TX_POINTS")) {
        return res.status(400).json({ error: "INSUFFICIENT_TX_POINTS", message: msg.split(": ")[1] });
      }
      if (msg === "STORE_ITEM_NOT_FOUND") return res.status(404).json({ error: "STORE_ITEM_NOT_FOUND" });
      if (msg === "STORE_ITEM_NOT_AVAILABLE") return res.status(400).json({ error: "STORE_ITEM_NOT_AVAILABLE" });
      if (error?.code === "23505") {
        // Concurrent duplicate hit the UNIQUE index — treat as already owned.
        return res.status(200).json({ success: true, outcome: "already_owned" });
      }
      logger.error({ err: error }, "[Store] Purchase failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  // Activate an OWNED item. null-safe: server re-validates ownership.
  app.post("/api/store/activate", requireSessionAuth, async (req, res) => {
    try {
      const userId = getPrincipal(req);
      if (!userId) return res.status(401).json({ error: "NO_SESSION" });
      const parsed = z.object({ itemId: z.string().uuid() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

      const active = await storage.activateStoreItem({ userId, itemId: parsed.data.itemId });
      res.json({ success: true, active });
    } catch (error: any) {
      const msg = String(error?.message ?? "");
      if (msg === "NOT_OWNED") return res.status(403).json({ error: "NOT_OWNED" });
      if (msg === "STORE_ITEM_NOT_FOUND") return res.status(404).json({ error: "STORE_ITEM_NOT_FOUND" });
      logger.error({ err: error }, "[Store] Activate failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  // Revert a slot to default. Ownership of the deactivated item is preserved.
  app.post("/api/store/deactivate", requireSessionAuth, async (req, res) => {
    try {
      const userId = getPrincipal(req);
      if (!userId) return res.status(401).json({ error: "NO_SESSION" });
      const parsed = z.object({ itemId: z.string().uuid() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

      const active = await storage.deactivateStoreItem({ userId, itemId: parsed.data.itemId });
      res.json({ success: true, active });
    } catch (error) {
      logger.error({ err: error }, "[Store] Deactivate failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  // ── Admin: catalog management (drafts/archives never reach /api/store) ────
  app.get("/api/admin/store/items", requireSessionAuth, async (req, res) => {
    if (!requireStoreAdmin(req)) return res.status(403).json({ error: "FORBIDDEN" });
    try {
      const items = await storage.listStoreItems({ includeUnlisted: true });
      res.json({ items });
    } catch (error) {
      logger.error({ err: error }, "[Store][Admin] List failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/admin/store/items", requireSessionAuth, async (req, res) => {
    if (!requireStoreAdmin(req)) return res.status(403).json({ error: "FORBIDDEN" });
    try {
      const parsed = createStoreItemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.errors });
      const { componentType, ...data } = parsed.data;
      // ref_key must resolve to a real visual definition — unknown keys rejected.
      if (!isKnownRefKey(data.itemType, data.refKey, componentType)) {
        return res.status(400).json({ error: "UNKNOWN_REF_KEY", message: "refKey must match a validated store registry entry" });
      }
      // Store the component slot inside category for component items so the
      // client can group variants by componentType without another column.
      const category = data.itemType === "component" && componentType ? componentType : data.category;
      const item = await storage.createStoreItem({ ...data, category });
      logger.info({ itemId: item.id, refKey: item.refKey }, "[Store][Admin] Item created");
      res.status(201).json({ item });
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ error: "REF_KEY_EXISTS" });
      logger.error({ err: error }, "[Store][Admin] Create failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  app.patch("/api/admin/store/items/:id", requireSessionAuth, async (req, res) => {
    if (!requireStoreAdmin(req)) return res.status(403).json({ error: "FORBIDDEN" });
    try {
      const parsed = updateStoreItemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.errors });
      const item = await storage.updateStoreItem(req.params.id, parsed.data);
      if (!item) return res.status(404).json({ error: "STORE_ITEM_NOT_FOUND" });
      logger.info({ itemId: item.id, updates: Object.keys(parsed.data) }, "[Store][Admin] Item updated");
      res.json({ item });
    } catch (error) {
      logger.error({ err: error }, "[Store][Admin] Update failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });
}
