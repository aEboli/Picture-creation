## Why

The first generation refactor made `/api/generate` thin, but retry orchestration and queue recovery still reach directly into `lib/db.ts` from transport and infrastructure code. We should make a second pass now so job lifecycle actions follow the same server-only service and DAL-style boundary that Context7 recommends for Next.js App Router projects.

## What Changes

- Introduce reusable server-only job lifecycle modules for create, retry, and recovery orchestration outside `app/`.
- Introduce a server-only job store boundary that centralizes the `lib/db.ts` operations used by retry and queue recovery flows.
- Make the retry Route Handler a thin adapter that delegates lifecycle orchestration to a shared server module.
- Update generation create flow and queue recovery flow to consume the new job lifecycle services instead of calling DB primitives inline.
- Preserve current job creation, retry, and queue recovery behavior while reducing direct `lib/db.ts` coupling in transport-layer modules.

## Capabilities

### New Capabilities
- `job-lifecycle-services`: Defines reusable server-only job lifecycle services and DAL-style access for create, retry, and queue recovery flows.

### Modified Capabilities
- None.

## Impact

- Affected code: `app/api/jobs/[id]/retry/route.ts`, `lib/queue.ts`, `lib/server/generation/create-job.ts`, new modules under `lib/server/jobs/`.
- Affected architecture: Route Handlers and queue infrastructure will depend on server-only job lifecycle services rather than direct DB primitives.
- Dependencies and guidance: Next.js App Router DAL and server-only reuse guidance validated through Context7 against Next.js official docs.
