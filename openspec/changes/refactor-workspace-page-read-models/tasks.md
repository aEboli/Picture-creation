## 1. OpenSpec and workspace scope setup

- [x] 1.1 Create the workspace page read-model change under `openspec/changes/refactor-workspace-page-read-models`
- [x] 1.2 Record the fourth-phase change scope in `doc/进展记录.md`

## 2. Workspace read-model refactor

- [x] 2.1 Add a reusable workspace page read boundary under `lib/server/workspace`
- [x] 2.2 Extract homepage, history, templates, and settings read models into server-only query helpers
- [x] 2.3 Update the four workspace pages to consume the new query services

## 3. Verification and documentation

- [x] 3.1 Verify with `npm run typecheck`, `npm run build`, and a direct import scan for remaining page-level `lib/db.ts` usage
- [x] 3.2 Update `doc/进展记录.md` and the OpenSpec task status with the refactor outcome
