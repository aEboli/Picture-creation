## Context

The refactor sequence has already established reusable server-only boundaries for:

- generation create/execute flows
- job lifecycle/recovery flows
- job read/sync flows
- workspace page read models

What remains are the operational APIs that support the app’s management workflows. These routes still own validation and orchestration inline:

- `app/api/templates/route.ts`
- `app/api/templates/[id]/route.ts`
- `app/api/templates/match/route.ts`
- `app/api/brands/route.ts`
- `app/api/brands/[id]/route.ts`
- `app/api/settings/route.ts`
- `app/api/settings/test/route.ts`
- `app/api/settings/test-feishu/route.ts`
- `app/api/assets/[assetId]/route.ts`
- `app/api/job-items/[id]/review/route.ts`

To make the project more deliverable and maintainable, these routes should follow the same pattern as the rest of the app: `route.ts` handles HTTP concerns, while `lib/server/*` owns validation, lookups, conflict rules, and provider calls.

## Goals / Non-Goals

**Goals:**
- Create reusable server-only service/store modules for templates, brands, settings, assets, and job-item review.
- Centralize validation and not-found/conflict handling behind typed service errors.
- Keep route handlers thin and focused on request parsing + HTTP response mapping.
- Reuse the settings snapshot boundary in `lib/queue.ts` and `lib/storage.ts`.

**Non-Goals:**
- Change route response payload shapes except where thin adapters preserve existing behavior.
- Refactor filesystem streaming/Sharp transformation logic out of the asset route in this pass.
- Refactor `lib/db.ts` into smaller physical files.
- Add new UI features or change any existing page layout.

## Decisions

### 1. Group the remaining operations APIs into dedicated server-only modules

Why:
- Templates, brands, settings, assets, and job-item review are all route-facing operational capabilities.
- Grouping them under `lib/server/*` closes most remaining route-level DB coupling in one pass.
- It keeps the app’s refactor trajectory simple: read/write/query/sync logic belongs in server modules, not `route.ts`.

Alternatives considered:
- Refactor each route family in separate changes. Rejected because the code paths are small and closely related, and the user asked to keep moving toward a deliverable state.

### 2. Use typed service errors for route mapping

Why:
- Many of these routes share the same not-found, invalid-input, and conflict patterns.
- Centralizing those semantics reduces repeated `if (!existing)` and ad hoc `400/404/409` branches inside routes.

Alternatives considered:
- Continue throwing raw `Error` from validators. Rejected because the route layer would still need to interpret ambiguous errors.

### 3. Keep asset file streaming and Sharp transformation inside the route

Why:
- The asset route’s DB lookup is the orchestration problem; the file streaming/transformation logic is still specific to the HTTP response.
- Moving the entire binary response pipeline into a service now would add scope with limited architectural benefit.

Alternatives considered:
- Move the whole asset route into a service. Rejected for this pass to keep the final cleanup focused and lower-risk.

## Risks / Trade-offs

- [Risk] Pulling validation into services could unintentionally alter route error messages. -> Mitigation: preserve the current message strings and HTTP status mapping.
- [Risk] The “ops” service scope could become broad. -> Mitigation: keep stores and services split by domain (templates, brands, settings, assets, job-items) even if they ship in one change.
- [Risk] Some non-route internal modules may still type-import from `lib/db.ts`. -> Mitigation: focus this pass on route/business boundaries and opportunistically reroute `queue`/`storage` through the new settings store.

## Migration Plan

1. Create the fifth OpenSpec change and record scope in `doc/进展记录.md`.
2. Add server-only stores/services for templates, brands, settings, assets, and job-item review.
3. Update the affected routes to thin adapters over those services.
4. Reuse settings snapshot helpers in `lib/queue.ts` and `lib/storage.ts`.
5. Verify with typecheck/build, direct import scans, and focused route behavior checks.

## Open Questions

- After this pass, do we want a final cleanup that moves shared validation helpers into a common `lib/server/shared/*` layer, or is the current domain split sufficient for delivery?
- Should the delivery package include a short maintainer note that the project now follows `page/route -> lib/server/* -> lib/db.ts` boundaries?
