## ADDED Requirements

### Requirement: Operations routes MUST delegate business logic to reusable server-only services

Operations/admin APIs for templates, brands, settings, assets, and job-item review MUST delegate validation, data access, and orchestration to reusable server-only services instead of directly importing `lib/db.ts` from `route.ts`.

#### Scenario: Template and brand routes use domain services
- **GIVEN** the templates and brands APIs need to validate input, check conflicts, and read or mutate stored records
- **WHEN** those route handlers execute
- **THEN** they MUST call reusable server-only domain services
- **AND** the route handlers MUST NOT import `lib/db.ts` directly

#### Scenario: Settings routes use reusable settings services
- **GIVEN** the settings APIs need to read settings, persist settings, and run provider or Feishu connection tests
- **WHEN** those route handlers execute
- **THEN** they MUST delegate the validation and orchestration work to reusable server-only settings services
- **AND** the route handlers MUST stay focused on HTTP request/response adaptation

### Requirement: Operations services MUST preserve existing error semantics

The new server-only operations services MUST preserve the current not-found, invalid-input, and conflict semantics expected by the route handlers.

#### Scenario: Service returns route-compatible status for a missing record
- **GIVEN** a requested template, brand, asset, or job item does not exist
- **WHEN** the corresponding service is called
- **THEN** it MUST surface a route-compatible error with the same effective HTTP semantics as before

### Requirement: Settings-only infrastructure reads SHOULD reuse the settings store boundary

Server-side infrastructure modules that only need a settings snapshot SHOULD read through the reusable settings store boundary rather than importing `lib/db.ts` directly.

#### Scenario: Queue and storage modules read settings through the settings store
- **GIVEN** internal server-side infrastructure modules need settings data
- **WHEN** they request the current settings snapshot
- **THEN** they SHOULD use the reusable settings store helper instead of importing `getSettings` from `lib/db.ts` directly
