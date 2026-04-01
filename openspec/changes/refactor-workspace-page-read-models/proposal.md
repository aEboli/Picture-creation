## Why

After the jobs-focused refactors, the main workspace pages still import `lib/db.ts` directly for read-side data:

- `app/page.tsx`
- `app/history/page.tsx`
- `app/templates/page.tsx`
- `app/settings/page.tsx`

That keeps page-level filtering, pagination, and query composition inside React Server Components instead of behind reusable server-only helpers. Context7 guidance for Next.js App Router recommends centralizing request-time data access in reusable DAL/query modules and using React `cache` where repeated server reads benefit from request-lifetime deduplication.

## What Changes

- Introduce reusable server-only workspace read services for homepage, history, templates, and settings page data.
- Move workspace page query composition and history pagination/filter normalization out of `app/` and into `lib/server/workspace/*`.
- Make the four workspace pages thin adapters that focus on language selection and rendering.
- Preserve existing page response shapes and UI behavior while reducing direct `lib/db.ts` coupling.

## Capabilities

### New Capabilities
- `workspace-page-read-models`: Defines reusable server-only read-model services for workspace pages and history pagination/filter derivation.

### Modified Capabilities
- None.

## Impact

- Affected code: `app/page.tsx`, `app/history/page.tsx`, `app/templates/page.tsx`, `app/settings/page.tsx`, and `lib/server/workspace/*`.
- Affected architecture: workspace pages will consume shared server-only query services instead of importing `lib/db.ts` directly.
- Dependencies and guidance: Next.js App Router DAL guidance and React `cache` request-lifetime reuse, validated through Context7 official docs.
