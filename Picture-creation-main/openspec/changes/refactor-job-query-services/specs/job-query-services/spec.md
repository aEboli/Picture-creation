## ADDED Requirements

### Requirement: Jobs list and detail reads SHALL run through reusable server-only query services
The system SHALL expose jobs list and detail reads through reusable server-only query services so jobs-related routes and pages do not import DB query primitives directly.

#### Scenario: Jobs list route reads filtered jobs
- **WHEN** `/api/jobs` receives a request with list filters
- **THEN** it MUST delegate filter normalization and list retrieval to a reusable server-only jobs query service

#### Scenario: Jobs detail readers share one query boundary
- **WHEN** a jobs detail route, server page, or download-adjacent route needs a job detail record
- **THEN** it MUST obtain that data through a reusable server-only jobs detail query service

### Requirement: Jobs detail not-found behavior SHALL be centralized in query services
The system SHALL centralize missing-job handling for read flows in reusable jobs query services so routes and pages do not duplicate job existence checks inline.

#### Scenario: Detail API route requests missing job
- **WHEN** `/api/jobs/[id]` requests a non-existent job
- **THEN** it MUST return a not-found response based on the reusable jobs query service result

#### Scenario: Job details page requests missing job
- **WHEN** `/jobs/[id]` is rendered for a non-existent job
- **THEN** the page MUST use the reusable jobs query service to determine that the job is missing before triggering `notFound()`

### Requirement: Feishu resync SHALL run through reusable server-only jobs services
The system SHALL expose Feishu resync orchestration through a reusable server-only jobs service so the Route Handler does not directly combine DB access, sync invocation, and warning repair logic.

#### Scenario: Feishu resync existing job
- **WHEN** `/api/jobs/[id]/feishu-sync` requests a resync for an existing job
- **THEN** it MUST delegate settings checks, sync execution, warning updates, and refreshed detail loading to a reusable server-only jobs service

#### Scenario: Feishu resync missing job
- **WHEN** `/api/jobs/[id]/feishu-sync` requests a non-existent job
- **THEN** it MUST return a not-found response based on the reusable jobs service result
