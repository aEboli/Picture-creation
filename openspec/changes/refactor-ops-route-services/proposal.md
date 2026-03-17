## Why

After the first four refactor passes, the remaining direct `lib/db.ts` route imports are concentrated in the project’s operations/admin APIs:

- templates CRUD and template matching
- brands CRUD
- settings read/update and connection tests
- asset lookup for downloads/previews
- job item review updates

These routes still mix HTTP adaptation, validation, and business/data orchestration in `route.ts` files. Context7 guidance for Next.js App Router route handlers and `server-only` modules supports keeping `route.ts` files focused on the HTTP layer while moving business logic into reusable server-side services.

## What Changes

- Introduce reusable server-only services for templates, brands, settings, assets, and job-item review operations.
- Move validation and not-found/conflict handling out of route handlers and into service modules.
- Make the affected `app/api/*/route.ts` files thin adapters over the new services.
- Reuse the new settings read boundary in server-side infrastructure modules that only need settings snapshots.

## Capabilities

### New Capabilities
- `ops-route-services`: Defines reusable server-only service boundaries for operations/admin APIs including templates, brands, settings, assets, and job-item review flows.

### Modified Capabilities
- None.

## Impact

- Affected code: `app/api/templates*`, `app/api/brands*`, `app/api/settings*`, `app/api/assets/[assetId]`, `app/api/job-items/[id]/review`, and supporting `lib/server/*`.
- Affected architecture: operations/admin route handlers will consume server-only service modules instead of directly orchestrating DB and provider logic.
- Dependencies and guidance: Next.js App Router route handler thin-adapter pattern and `server-only` guidance, validated through Context7 official docs.
