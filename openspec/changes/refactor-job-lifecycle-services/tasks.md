## 1. OpenSpec and job lifecycle setup

- [x] 1.1 Create server-only job lifecycle module structure under `lib/server/jobs`
- [x] 1.2 Record the second-phase change scope in `doc/进展记录.md`

## 2. Job lifecycle service refactor

- [x] 2.1 Extract DAL-style job store helpers for create, retry, and recovery flows
- [x] 2.2 Extract create-and-enqueue orchestration into a reusable server-only lifecycle service
- [x] 2.3 Extract retry orchestration into a reusable server-only lifecycle service and make `app/api/jobs/[id]/retry/route.ts` thin

## 3. Queue recovery refactor

- [x] 3.1 Extract queue recovery orchestration into a reusable server-only recovery service
- [x] 3.2 Update generation create flow and queue infrastructure to consume the new lifecycle services instead of DB primitives

## 4. Verification and documentation

- [x] 4.1 Verify with `npm run typecheck` and focused runtime smoke checks for generate and retry endpoints
- [x] 4.2 Update `doc/进展记录.md` and the OpenSpec task status with the refactor outcome
