## Context

The current codebase already moved generation request and execution orchestration into `lib/server/generation/*`, but job lifecycle orchestration is still split across transport and infrastructure modules:

- `app/api/jobs/[id]/retry/route.ts` reads job details from `lib/db.ts`, builds retry input, creates a new job, and enqueues it inline.
- `lib/queue.ts` performs queue recovery by directly reading recoverable job IDs and mutating persisted statuses with `lib/db.ts`.
- `lib/server/generation/create-job.ts` still persists a created job by importing `createJob` directly.

Context7 guidance for Next.js App Router recommends a DAL-style layer that centralizes request-time data access and business checks in reusable server modules. That makes this a good point to introduce a job lifecycle service boundary without fully decomposing `lib/db.ts`.

## Goals / Non-Goals

**Goals:**
- Introduce a server-only job store boundary for the DB operations used by create, retry, and recovery flows.
- Introduce reusable job lifecycle services that encapsulate create-and-enqueue, retry-by-id, and queue recovery orchestration.
- Make the retry Route Handler thin and focused on HTTP concerns.
- Reduce direct `lib/db.ts` imports from `app/api` and queue infrastructure code.
- Preserve current job lifecycle behavior and queue semantics.

**Non-Goals:**
- Full decomposition of all `lib/db.ts` reads and writes.
- Refactoring every jobs-related route in this pass.
- Changing DB schema, retry semantics, or queue concurrency policy.
- Reworking generation execution internals again in this change.

## Decisions

### 1. Introduce `lib/server/jobs/store.ts` as a DAL-style boundary over selected DB primitives

Why:
- It follows the Next.js guidance to centralize request-time data access in a reusable server module.
- It lets retry and recovery orchestration depend on a stable interface instead of importing DB primitives everywhere.
- It keeps `lib/db.ts` as the persistence implementation while shrinking its direct call surface.

Alternatives considered:
- Continue importing `lib/db.ts` directly from routes and queue modules. Rejected because it preserves the current coupling.
- Fully split `lib/db.ts` in this change. Rejected because that scope is too large for the current refactor pass.

### 2. Introduce `lib/server/jobs/lifecycle.ts` for create and retry orchestration

Why:
- Job creation from the generate flow and retry creation are the same lifecycle concern: persist a new queued job and enqueue it.
- A shared lifecycle service avoids duplicating create-and-enqueue logic across routes and generation services.

Alternatives considered:
- Keep retry logic only in the route. Rejected because it would leave transport code owning lifecycle behavior.
- Add separate helper functions inside each route. Rejected because this does not establish a reusable boundary.

### 3. Introduce `lib/server/jobs/recovery.ts` for queue recovery orchestration

Why:
- Queue recovery is infrastructure logic, but it still needs coordinated persisted state transitions before pending jobs are resumed.
- A dedicated recovery service makes `lib/queue.ts` depend on one clear orchestration boundary instead of low-level DB mutations.

Alternatives considered:
- Leave recovery inline in `lib/queue.ts`. Rejected because it keeps queue internals coupled to persistence details.

## Risks / Trade-offs

- [Risk] Moving lifecycle orchestration may subtly change retry or recovery order. -> Mitigation: preserve current sequencing and verify with smoke checks plus typecheck.
- [Risk] We may create a thin DAL that still wraps a large `lib/db.ts`. -> Mitigation: treat this as a deliberate intermediate boundary and use it to drive later decomposition.
- [Risk] Some jobs routes will still import `lib/db.ts` directly after this pass. -> Mitigation: limit this change to create, retry, and recovery flows so the scope stays reviewable.

## Migration Plan

1. Create server-only job store and lifecycle modules under `lib/server/jobs/`.
2. Update generation create service to use shared create-and-enqueue orchestration.
3. Update retry route to use the lifecycle service.
4. Update queue recovery to use the recovery service.
5. Verify with `npm run typecheck` and focused runtime endpoint smoke checks.

## Open Questions

- Should the next change extend the DAL boundary to read-heavy jobs routes such as detail fetch and Feishu sync?
- After job lifecycle services are in place, do we want a third pass that splits `lib/db.ts` by domain module?
