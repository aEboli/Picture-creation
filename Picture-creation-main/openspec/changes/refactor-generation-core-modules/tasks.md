## 1. OpenSpec and architecture setup

- [x] 1.1 Create server-only generation service module structure under `lib/server/generation`
- [x] 1.2 Add OpenSpec artifacts for the refactor scope and record the phase in `doc/进展记录.md`

## 2. Job creation refactor

- [x] 2.1 Extract generation request normalization and validation into dedicated server-only helpers
- [x] 2.2 Extract create-job orchestration into a reusable server-only service and make `app/api/generate/route.ts` a thin adapter

## 3. Job processing refactor

- [x] 3.1 Extract generation execution entrypoint into a server-only pipeline module
- [x] 3.2 Extract shared execution helpers for job-status settlement and dimension warnings
- [x] 3.3 Update queue integration to depend on the new pipeline boundary while preserving behavior

## 4. Verification and documentation

- [x] 4.1 Verify the refactor with `npm run typecheck` and a focused runtime smoke check
- [x] 4.2 Update `doc/进展记录.md` and relevant release-facing notes with the refactor outcome
