## 1. OpenSpec and jobs query setup

- [x] 1.1 Create the jobs query service scope under `lib/server/jobs`
- [x] 1.2 Record the third-phase change scope in `doc/进展记录.md`

## 2. Jobs query refactor

- [x] 2.1 Extend the jobs store boundary for list/detail/settings/sync update operations
- [x] 2.2 Extract reusable jobs query services for list/detail reads and not-found handling
- [x] 2.3 Update jobs list/detail routes, approved-download route, and job details page to consume the new query services

## 3. Feishu sync refactor

- [x] 3.1 Extract Feishu resync orchestration into a reusable server-only jobs service
- [x] 3.2 Make `app/api/jobs/[id]/feishu-sync/route.ts` a thin adapter over the new jobs sync service

## 4. Verification and documentation

- [x] 4.1 Verify with `npm run typecheck`, `npm run build`, and focused route-module/runtime smoke checks
- [x] 4.2 Update `doc/进展记录.md` and the OpenSpec task status with the refactor outcome
