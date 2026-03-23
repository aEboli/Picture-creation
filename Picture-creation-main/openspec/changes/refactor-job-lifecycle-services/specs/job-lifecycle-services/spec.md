## ADDED Requirements

### Requirement: Job lifecycle creation SHALL run through reusable server-only services
The system SHALL expose creation of queued jobs through reusable server-only job lifecycle services so create flows do not persist and enqueue jobs by calling DB primitives inline.

#### Scenario: Generate flow creates a queued job
- **WHEN** the generation create flow finishes building a `CreateJobInput`
- **THEN** it MUST delegate persistence and queue enqueueing to a reusable server-only job lifecycle service

#### Scenario: Lifecycle service preserves provider override enqueueing
- **WHEN** a create flow includes a temporary provider override
- **THEN** the job lifecycle service MUST enqueue the created job with that override without requiring the Route Handler to own persistence logic

### Requirement: Retry Route Handlers SHALL delegate retry orchestration to reusable server-only services
The system SHALL keep retry orchestration in reusable server-only job lifecycle services while the App Router retry Route Handler remains focused on HTTP input and response translation.

#### Scenario: Retry existing job
- **WHEN** `/api/jobs/[id]/retry` receives a request for an existing job
- **THEN** the Route Handler MUST delegate loading job details, building retry input, creating the new job, and enqueueing it to a reusable server-only lifecycle service

#### Scenario: Retry missing job
- **WHEN** `/api/jobs/[id]/retry` receives a request for a non-existent job
- **THEN** the Route Handler MUST return a not-found response based on the server-only lifecycle service result instead of duplicating retry rules inline

### Requirement: Queue recovery SHALL run through explicit server-only recovery services
The system SHALL expose queue recovery through reusable server-only services so infrastructure code does not directly manage persisted recovery state with DB primitives.

#### Scenario: Recover queued jobs on startup
- **WHEN** queue initialization looks for recoverable jobs
- **THEN** it MUST call a reusable server-only recovery service that returns the recoverable job IDs after restoring persisted queued state

#### Scenario: Recovery service uses centralized data access
- **WHEN** queue recovery needs persisted job IDs or status resets
- **THEN** it MUST perform those reads and writes through a server-only job store boundary rather than calling `lib/db.ts` directly from queue infrastructure
