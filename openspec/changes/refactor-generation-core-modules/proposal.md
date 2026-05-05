## Why

The image generation project has reached the point where the core pipeline is hard to change safely because request normalization, validation, orchestration, and provider execution are spread across oversized modules. We need a first refactor pass now so future feature work can follow clear server-side boundaries and reuse patterns aligned with Next.js App Router guidance.

## What Changes

- Refactor the job-creation entrypoint into thin Route Handler + reusable server-only generation service modules.
- Refactor generation execution orchestration into server-only pipeline modules so queue processing depends on explicit service boundaries instead of one monolithic implementation file.
- Introduce server-only module markers and shared domain helpers for generation request validation, normalization, and job-status settlement.
- Keep the current product behavior stable while improving module boundaries for future OpenSpec-driven iteration.

## Capabilities

### New Capabilities
- `generation-core-modules`: Defines the server-side module boundaries for generation job creation and execution in the App Router project.

### Modified Capabilities
- None.

## Impact

- Affected code: `app/api/generate/route.ts`, `lib/generation.ts`, `lib/queue.ts`, `lib/job-builder.ts`, new server-side generation modules under `lib/server/`.
- Affected architecture: request handling, generation orchestration, and server-only code ownership.
- Dependencies and guidance: Next.js App Router server-only module pattern validated through Context7 against Next.js official docs.
