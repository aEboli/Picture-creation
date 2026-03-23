## Context

The first three OpenSpec refactor passes established a pattern:

- generation flows moved behind `lib/server/generation/*`
- job lifecycle moved behind `lib/server/jobs/lifecycle.ts` and `recovery.ts`
- jobs query and Feishu resync flows moved behind `lib/server/jobs/queries.ts` and `feishu-sync.ts`

The remaining high-traffic pages still bypass that pattern. They import `lib/db.ts` directly and also keep request-time derivation in-page:

- homepage composes dashboard stats plus recent jobs
- history page parses filters, pagination, and href derivation inline
- templates page reads template lists directly
- settings page reads settings and brands directly

Context7 guidance for Next.js App Router recommends reusable server-only data access modules, optionally wrapped with React `cache`, so pages stay focused on rendering and transport concerns rather than data orchestration.

## Goals / Non-Goals

**Goals:**
- Introduce a reusable server-only workspace store/query boundary under `lib/server/workspace`.
- Centralize homepage, templates, settings, and history read models outside `app/`.
- Move history filter parsing and pagination derivation into a reusable server-only helper.
- Keep page rendering behavior and existing component props stable.

**Non-Goals:**
- Refactor template, brand, asset, or settings write routes in this pass.
- Change the UI layout or text copy of the four pages.
- Add cross-request caching or revalidation policy changes.
- Refactor client components such as `TemplateCenterClient`, `SettingsForm`, or `BrandLibraryManager`.

## Decisions

### 1. Introduce `lib/server/workspace/store.ts` as the thin DB boundary for page reads

Why:
- It keeps direct `lib/db.ts` access in one place for the workspace pages.
- It matches the pattern already used by `lib/server/jobs/store.ts`.
- It gives future route refactors a stable place to expand without reintroducing page-level DB imports.

Alternatives considered:
- Import `lib/db.ts` directly from `queries.ts`. Rejected because it skips the boundary pattern we already established elsewhere.
- Leave direct imports in pages. Rejected because it preserves data orchestration inside React components.

### 2. Introduce `lib/server/workspace/queries.ts` for page read models

Why:
- It centralizes request-time composition for dashboard, templates, settings, and history data.
- It lets us use React `cache` for request-lifetime reuse on repeated server reads.
- It moves history pagination/href derivation out of `app/history/page.tsx`, making the page a thin presenter.

Alternatives considered:
- Create separate query files per page immediately. Rejected for now because one focused module keeps the surface small while the scope is still only four pages.

### 3. Keep UI language selection in the pages

Why:
- `getUiLanguage()` is a page concern tied to rendering.
- It avoids mixing language choice with page-specific query data that does not depend on locale.

Alternatives considered:
- Move language selection into the query layer. Rejected because it would couple a rendering concern to DAL helpers with little payoff.

## Risks / Trade-offs

- [Risk] Caching history page data by raw parameter objects could miss reuse because object identity changes. -> Mitigation: normalize history params into a stable query-string cache key before calling cached helpers.
- [Risk] The workspace query module could become a grab bag if future scope expands too far. -> Mitigation: keep this pass read-only and limited to the four current pages.
- [Risk] Direct DB imports will still exist in write routes after this pass. -> Mitigation: accept that this is a page-read-model change and leave write-side cleanup for a later OpenSpec change.

## Migration Plan

1. Create the fourth OpenSpec change and document its scope.
2. Add `lib/server/workspace/store.ts` and `lib/server/workspace/queries.ts`.
3. Update the four workspace pages to consume the new query services.
4. Verify with typecheck/build and confirm the page-side direct DB imports are removed.
5. Update the OpenSpec tasks and `doc/进展记录.md`.

## Open Questions

- Should the next read-side pass target write-route boundaries for templates/brands/settings, or should it focus on asset download/file packaging flows?
- Once workspace page read models are stable, do we want to split `queries.ts` into per-page modules or keep one shared workspace boundary?
