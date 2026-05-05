## Context

After the first two refactor passes:

- generation create/execute flows already run through `lib/server/generation/*`
- job create/retry/recovery flows already run through `lib/server/jobs/lifecycle.ts` and `recovery.ts`

But jobs-related read paths still bypass those boundaries:

- `app/api/jobs/route.ts` directly calls `listJobs`
- `app/api/jobs/[id]/route.ts`, `app/jobs/[id]/page.tsx`, and `app/api/jobs/[id]/approved-download/route.ts` directly call `getJobDetails`
- `app/api/jobs/[id]/feishu-sync/route.ts` directly mixes DB reads/writes with Feishu sync orchestration

Context7 guidance for Next.js App Router recommends centralizing request-time data access in reusable DAL/query modules and optionally using React `cache` to deduplicate repeated DB access during a render/request lifetime. That fits this codebase because job detail reads are reused across route handlers, server pages, and sync flows.

## Goals / Non-Goals

**Goals:**
- Extend `lib/server/jobs/store.ts` to cover jobs list, details, settings, and sync-related persistence updates used by jobs routes.
- Introduce reusable jobs query services for list/detail reads and not-found handling.
- Make the jobs detail page and jobs list/detail routes depend on shared query services.
- Move Feishu resync orchestration into a reusable server-only jobs service.
- Reuse the same detail query service in approved-download flow.

**Non-Goals:**
- Refactor dashboard, history, templates, brands, or settings pages in this pass.
- Change the shape of the jobs API responses.
- Change Feishu sync semantics or storage schema.
- Introduce cross-request caching or revalidation policy changes.

## Decisions

### 1. Introduce `lib/server/jobs/queries.ts` for list/detail reads and request-level reuse

Why:
- It gives routes and pages one shared read boundary.
- It allows us to use React `cache` for job detail reads so the server page and helper calls can deduplicate within the request lifecycle.
- It keeps not-found behavior centralized instead of duplicating the same `if (!details)` logic.

Alternatives considered:
- Keep using `store.ts` directly everywhere. Rejected because route/page code would still own read orchestration details.
- Add one-off helpers inside each route. Rejected because it does not establish a reusable pattern.

### 2. Introduce `lib/server/jobs/feishu-sync.ts` for sync orchestration

Why:
- The current route mixes settings checks, Feishu sync invocation, warning repair, and refreshed detail reads.
- Moving this into a service makes the route transport-only and aligns sync with the lifecycle/query boundaries already introduced.

Alternatives considered:
- Leave Feishu sync in the route. Rejected because it preserves direct DB coupling and mixed responsibilities.

### 3. Keep approved-download route-specific zip assembly in the route

Why:
- Its filesystem/zip assembly is still route-specific and not reused elsewhere.
- The refactor target here is query orchestration, not file packaging.

Alternatives considered:
- Move the full zip generation flow into a service now. Rejected because it adds scope without materially improving the DB boundary problem we are solving in this pass.

## Risks / Trade-offs

- [Risk] Cached job detail reads may return stale data if reused after sync writes in the same flow. -> Mitigation: use direct store refresh after Feishu sync writes instead of the cached read helper for the post-write response.
- [Risk] Jobs routes may still partially own parameter parsing. -> Mitigation: centralize only stable read/sync orchestration in this pass and keep simple URL parsing local if it is purely HTTP transport logic.
- [Risk] Some pages outside jobs remain directly coupled to `lib/db.ts`. -> Mitigation: accept this as the jobs-focused third pass and leave broader app DAL cleanup for future changes.

## Migration Plan

1. Extend the jobs store boundary for list/detail/settings/sync update operations.
2. Add jobs query services and Feishu sync service under `lib/server/jobs/`.
3. Update jobs list/detail routes, details page, and approved-download route to use the shared query services.
4. Update Feishu sync route to use the new sync service.
5. Verify with typecheck, build, and focused route-module/runtime smoke checks.

## Open Questions

- Should the next DAL expansion target dashboard/history reads or templates/brands/settings first?
- After jobs query services are stable, do we want a single `lib/server/home/*` read model for the landing/dashboard screens?
