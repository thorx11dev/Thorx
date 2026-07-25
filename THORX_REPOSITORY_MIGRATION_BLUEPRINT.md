# THORX Repository Migration Blueprint

**Status:** Approved for reversible local execution  
**Date:** 2026-07-25

## Target repositories

### `thorx-app`

The default production repository will contain only the deployable THORX product:

```text
client/
  src/
  public/                    # runtime assets only
server/
shared/
migrations/
scripts/
package.json
package-lock.json
README.md
replit.md
.replit
.env.example
.gitignore
Dockerfile
components.json
drizzle.config.ts
postcss.config.js
tailwind.config.ts
tsconfig.json
vite.config.ts
vitest.config.ts
```

`client/public/payment-assets/` will contain the six payment/transfer images
currently imported through Vite's `@assets` alias. Existing avatar and FAQ
assets remain in `client/public/`.

### `thorx-docs-audits`

This repository/branch will preserve:

- audit and remediation reports;
- prompt and task transcripts;
- screenshots and historical attached assets;
- handoffs, certifications, and investigation documents;
- `.agent/`, `.agents/`, and project memory history;
- alternate deployment/integration experiments and legacy files;
- the complete machine-generated migration manifest.

### `legacy/full-repository`

An immutable local rollback reference points at the pre-migration repository
tree. It is not deleted or force-rewritten.

## Exact action rules

| Classification | App action | Archive action |
|---|---|---|
| Production Code | Keep | Legacy branch retains original |
| Runtime Assets | Keep in `client/public` | Legacy branch retains original |
| Build Critical | Keep if used by current Replit build | Legacy branch retains original |
| Development Only | Keep tests and required scripts | Legacy branch retains original |
| Documentation | Remove from app tree | Preserve in docs branch |
| Audit Reports | Remove from app tree | Preserve in docs branch |
| Historical Artifacts | Remove from app tree | Preserve in docs branch |
| Screenshots | Remove from app tree | Preserve in docs branch |
| Prompt Transcripts | Remove from app tree | Preserve in docs branch |
| Agent Memories | Untrack from app while keeping local Replit copy | Preserve in docs branch |
| Future Architecture Files | Remove from app tree | Preserve in docs branch |
| Temporary/Dead Files | Remove from app tree | Preserve in legacy/docs history |

The complete file-by-file mapping is generated as
`MIGRATION_FILE_MANIFEST.tsv` on the `thorx-docs-audits` branch. It includes
size, category, action, import-impact score, runtime-dependency score, and
grep-level reference evidence.

## Runtime dependency decisions

The following attached assets are runtime-critical and are relocated rather
than archived:

```text
attached_assets/stock_images/jazzcash_logo_offici_d1da53e5.jpg
attached_assets/stock_images/easypaisa_logo_offic_b5f9d6fc.jpg
attached_assets/stock_images/bank_transfer_icon_m_996396c5.jpg
attached_assets/unnamed-removebg-preview.png
attached_assets/download-removebg-preview (1).png
attached_assets/download-removebg-preview.png
```

`client/src/components/ui/payment-icons.tsx` is updated to reference
`/payment-assets/...` URLs. Once that is done, Vite's `@assets` alias is
removed because grep found no other runtime imports.

All `client/public` avatars and background assets remain in the app because
they are runtime-served public assets. All `server`, `client/src`, `shared`,
`migrations`, and required `scripts` remain.

## Zero-downtime migration sequence

1. Create `legacy/full-repository` and a dated rollback tag at the current
   commit.
2. Generate the complete manifest from the original tracked tree.
3. Create the `thorx-docs-audits` branch/worktree from the legacy reference and
   preserve archive files there without altering their contents.
4. Return to `main`, relocate the six runtime payment assets, and update their
   imports.
5. Remove archive/development-history files from the application tree while
   preserving them in the legacy and docs branches.
6. Untrack local `.agent`, `.agents`, and root `AGENTS.md` from the app
   repository while leaving the local Replit copies intact.
7. Add concise app README/replit instructions and future archive hygiene rules.
8. Commit the lean app tree and create the `thorx-app` branch at the same
   commit.
9. Run `npm install`, `npm run check`, `npm test`, `npm run build`, restart the
   workflow, and smoke-test port 5000.
10. Do not push to GitHub or rewrite any remote branch without a confirmed
    destination and explicit remote-access validation.

The running database, environment secrets, workflow, and production code
remain in place during this operation. Only repository paths and one static
asset import boundary change.

## Rollback

If any validation fails:

```bash
git switch legacy/full-repository
git switch main
git reset --hard legacy/full-repository
```

The preferred rollback is to open the checkpoint created before migration.
The legacy branch and tag are retained so no archive is permanently deleted.

## GitHub handoff

This workspace can prepare local branches and commits. Creating new GitHub
repositories requires a connected GitHub account and destination names/URLs;
those are not assumed. After destinations are confirmed:

```bash
git push origin main:main                 # cleaned app repo only
git push origin thorx-docs-audits:main    # archive repo
git push origin legacy/full-repository:main  # optional legacy repo
```

These pushes must target separate repositories. Never force-push the cleaned
tree over the existing historical default branch.

## Acceptance criteria

- No database schema or data changes.
- No runtime feature imports from archived paths.
- `npm run check` exits 0.
- `npm test` exits 0.
- `npm run build` exits 0.
- Workflow serves port 5000.
- Production assets appear in `dist/public`.
- Legacy branch contains the original complete tree.
- Docs branch contains the complete archive and manifest.
- App branch contains no tracked archive/screenshot/prompt directories.