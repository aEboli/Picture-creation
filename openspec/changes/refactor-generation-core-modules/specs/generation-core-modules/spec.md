## ADDED Requirements

### Requirement: Route Handlers SHALL delegate generation job creation to reusable server modules
The system SHALL keep generation job creation business logic in reusable server-only modules outside `app/`, while the App Router Route Handler remains focused on HTTP request parsing and response translation.

#### Scenario: Create job from generate route
- **WHEN** the `/api/generate` Route Handler receives a valid multipart request
- **THEN** it MUST delegate payload normalization, validation, asset persistence, job creation, and queue enqueueing to a reusable server-side generation service

#### Scenario: Reject invalid create request
- **WHEN** the request payload fails generation-specific validation
- **THEN** the Route Handler MUST return the service-provided validation error without duplicating generation business rules inline

### Requirement: Generation execution SHALL run through explicit server-only pipeline modules
The system SHALL expose generation execution through server-only pipeline modules so queue processing can call a stable orchestration boundary instead of a monolithic mixed-responsibility module.

#### Scenario: Queue processes a job
- **WHEN** the background queue starts generation for a job
- **THEN** it MUST invoke a dedicated server-only process entrypoint for the generation pipeline

#### Scenario: Shared pipeline helpers stay reusable
- **WHEN** generation execution needs status settlement, warning construction, or retry-related helper logic
- **THEN** those concerns MUST live in reusable pipeline helper modules instead of only inside one monolithic implementation body

### Requirement: Server-only generation modules SHALL be protected from client imports
The system SHALL mark generation business modules that depend on filesystem, database, queue, or provider secrets as server-only modules.

#### Scenario: Server-only boundary is declared
- **WHEN** a generation service or pipeline module is intended only for server execution
- **THEN** the module MUST declare a server-only boundary so accidental client imports fail at build time
