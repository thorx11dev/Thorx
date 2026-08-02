/**
 * Phase 3 redesign — temporary design/dev preview mode for the User Portal.
 *
 * `DEV_UNLOCK_ALL_VIEWS` removes client-side rank/role lock overlays so every
 * tab, engine, and Guild view can be inspected visually while the portal
 * redesign is in progress. It is derived from Vite's `import.meta.env.DEV`,
 * so it is automatically `false` in production builds (`vite build`) and can
 * never ship to the published app — it only ever applies while running the
 * dev workflow (`npm run dev`).
 *
 * IMPORTANT — this flag is rendering-only:
 * - It never touches server-side authorization. Every guild/captain/
 *   withdrawal action is independently re-verified against the authenticated
 *   session and the database on the backend (see `server/storage.ts`), so
 *   previewing a locked view here cannot grant real permissions an account
 *   doesn't actually have — restricted actions still get rejected server-side.
 * - Remove this flag (and its call sites) once the redesign ships and the
 *   temporary "preview everything" behavior is no longer needed.
 */
export const DEV_UNLOCK_ALL_VIEWS: boolean = import.meta.env.DEV;

/** The 3 Engine-C guild roles a preview session can force-render. */
export type GuildViewRole = "simple" | "member" | "captain";

export const GUILD_VIEW_ROLES: { value: GuildViewRole; label: string }[] = [
  { value: "simple", label: "Discovery (no guild)" },
  { value: "member", label: "Guild Member" },
  { value: "captain", label: "Guild Captain" },
];
