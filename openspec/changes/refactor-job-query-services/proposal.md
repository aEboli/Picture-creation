## Why

The job lifecycle refactor reduced write-side coupling, but job detail queries, job list routes, and Feishu resync still reach into `lib/db.ts` directly from Route Handlers and pages. We should finish the next pass now so jobs-related reads and route-side orchestration follow the same server-only query service pattern recommended by Context7 for Next.js App Router.

## What Changes

- Introduce reusable server-only jobs query modules for list, detail, and not-found handling outside `app/`.
- Extend the existing jobs store boundary so jobs-related routes and pages can read through DAL-style helpers instead of importing `lib/db.ts` directly.
- Make jobs list/detail routes and the job details page depend on shared query services.
- Move Feishu resync orchestration behind a reusable server-only jobs service while preserving current warning and record update behavior.
- Reuse the shared job detail query service in approved-download flow to keep route-side DB access thin.

## Capabilities

### New Capabilities
- `job-query-services`: Defines reusable server-only query and sync services for jobs list, details, download-adjacent reads, and Feishu resync flows.

### Modified Capabilities
- None.

## Impact

- Affected code: `app/api/jobs/route.ts`, `app/api/jobs/[id]/route.ts`, `app/api/jobs/[id]/feishu-sync/route.ts`, `app/api/jobs/[id]/approved-download/route.ts`, `app/jobs/[id]/page.tsx`, and `lib/server/jobs/*`.
- Affected architecture: jobs-related routes and pages will consume shared server-only query services rather than direct `lib/db.ts` imports.
- Dependencies and guidance: Next.js App Router DAL and request-time query reuse guidance validated through Context7 official docs, including React `cache` for server-side data access helpers.
