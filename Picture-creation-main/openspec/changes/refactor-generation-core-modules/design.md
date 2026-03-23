## Context

The current generation flow is functionally complete but structurally uneven:

- `app/api/generate/route.ts` both parses multipart form data and owns business normalization, validation, asset persistence, job creation, and queue enqueueing.
- `lib/generation.ts` mixes orchestration, provider translation, prompt optimization, template resolution, retry logic, warning construction, asset persistence, and downstream sync.
- `lib/queue.ts` depends directly on the monolithic generation implementation.

Context7 guidance for Next.js App Router recommends keeping server-only business logic in reusable modules outside `app/` and marking those modules with `import 'server-only'` so Client Components cannot accidentally import them. That is a strong fit for this codebase because the generation pipeline is server-only by nature.

## Goals / Non-Goals

**Goals:**
- Make the generate Route Handler thin and focused on HTTP concerns.
- Move generation job creation logic behind a dedicated server-only service boundary.
- Move generation execution logic behind a dedicated server-only pipeline boundary that queue processing can call directly.
- Introduce smaller internal helpers for normalization, validation, warnings, and job-status settlement.
- Preserve current external behavior for create-job submission and queue execution.

**Non-Goals:**
- Full decomposition of `lib/db.ts` in this change.
- A complete redesign of prompts, templates, or Gemini provider behavior.
- Migration from Route Handlers to Server Actions.
- Rewriting all API routes to the new pattern in one pass.

## Decisions

### 1. Introduce `lib/server/generation/*` as the new home for server-only generation logic

Why:
- It matches Next.js App Router guidance for code reuse outside `app/`.
- It makes server-only ownership explicit.
- It lets Route Handlers and background queue code share the same orchestration entrypoints.

Alternatives considered:
- Keep adding helpers under `lib/` without a `server/` boundary. Rejected because the server-only ownership would stay implicit.
- Move everything under `app/api/*`. Rejected because it would keep HTTP and business logic coupled.

### 2. Keep `app/api/generate/route.ts` as a transport adapter only

Why:
- The route should only parse `Request`, call the service, and translate domain errors into HTTP responses.
- This lowers change risk for future feature work such as batch limits, provider overrides, and audit logging.

Alternatives considered:
- Leave route logic in place and only extract helper functions. Rejected because the route would still own too much behavior.

### 3. Keep `lib/generation.ts` as a compatibility facade for one refactor pass

Why:
- The queue and any existing imports can keep working while we move implementation into `lib/server/generation/process-job.ts`.
- This reduces blast radius and lets us refactor in phases.

Alternatives considered:
- Delete `lib/generation.ts` immediately and update every import. Rejected for this pass to keep rollout smaller.

### 4. Extract shared execution helpers instead of leaving them embedded in `processJob`

Why:
- Job status settlement, partial-failure summaries, and dimension warnings are reusable pipeline concerns.
- These helpers have clear boundaries and reduce the cognitive load of the main process function.

Alternatives considered:
- Keep helper functions in the same file. Rejected because the current problem is concentration of responsibilities.

## Risks / Trade-offs

- [Risk] Refactor may subtly change validation or queue behavior. → Mitigation: preserve existing payload rules and verify with `npm run typecheck` plus release smoke tests.
- [Risk] New modules may still depend on large legacy files such as `lib/db.ts`. → Mitigation: accept this as a first-pass boundary refactor and leave DB decomposition for a follow-up change.
- [Risk] `server-only` boundaries could break if imported by client code later. → Mitigation: that failure is desirable because it catches invalid imports at build time.

## Migration Plan

1. Create server-only generation request modules for normalization, validation, and service orchestration.
2. Move queue-facing process orchestration into server-only pipeline modules.
3. Keep a compatibility export from `lib/generation.ts` during this change.
4. Run typecheck and release smoke verification after refactor.
5. Use this new structure as the baseline for later decomposition of DB, Gemini, and template layers.

## Open Questions

- Should the next OpenSpec change target `lib/db.ts` decomposition or `lib/gemini.ts` decomposition first?
- After this pass, do we want to move more API routes to shared server-only service modules for consistency?
