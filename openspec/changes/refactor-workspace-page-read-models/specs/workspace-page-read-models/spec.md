## ADDED Requirements

### Requirement: Workspace pages MUST use reusable server-only read-model services

The homepage, history page, templates page, and settings page MUST consume data through reusable server-only services under `lib/server/workspace/*` instead of importing `lib/db.ts` directly.

#### Scenario: Homepage reads dashboard data through a workspace query service
- **GIVEN** the homepage needs dashboard stats and recent jobs
- **WHEN** `app/page.tsx` renders
- **THEN** it MUST read that data through a reusable server-only workspace query helper
- **AND** `app/page.tsx` MUST NOT import `lib/db.ts` directly

#### Scenario: Templates and settings pages read through workspace query services
- **GIVEN** the templates page needs template records and the settings page needs settings plus brand records
- **WHEN** those pages render
- **THEN** each page MUST consume a reusable server-only workspace query helper
- **AND** neither page MUST import `lib/db.ts` directly

### Requirement: History page MUST centralize filter and pagination derivation outside the page component

The history page MUST obtain its filters, pagination state, hrefs, and jobs/summary payload from a reusable server-only helper rather than deriving them inline inside `app/history/page.tsx`.

#### Scenario: History page derives pagination through the workspace query layer
- **GIVEN** incoming search params for history filters and pagination
- **WHEN** the history page resolves its request-time data
- **THEN** a reusable server-only helper MUST normalize the filters and current page
- **AND** it MUST return the summary, job list, pagination links, and page-number window needed by the page
- **AND** `app/history/page.tsx` MUST NOT import `lib/db.ts` directly

### Requirement: Workspace read-model helpers SHOULD support request-lifetime query reuse

Reusable workspace query helpers SHOULD use request-lifetime caching where repeated reads benefit from deduplication inside a single server render/request.

#### Scenario: Stable history params are reused through a cached helper
- **GIVEN** the history page read model is requested multiple times during the same server render/request
- **WHEN** the same normalized query-string key is used
- **THEN** the reusable workspace helper SHOULD reuse the same request-lifetime result instead of recomputing the underlying DB reads
