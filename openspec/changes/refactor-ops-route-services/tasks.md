## 1. OpenSpec and scope setup

- [x] 1.1 Create the operations route service change under `openspec/changes/refactor-ops-route-services`
- [x] 1.2 Record the fifth-phase change scope in `doc/进展记录.md`

## 2. Operations route service refactor

- [x] 2.1 Add server-only stores/services for templates, brands, settings, assets, and job-item review
- [x] 2.2 Update the affected `app/api/*` routes to thin adapters over the new services
- [x] 2.3 Reuse the new settings snapshot boundary in `lib/queue.ts` and `lib/storage.ts`

## 3. Verification and delivery sync

- [x] 3.1 Verify with `npm run typecheck`, `npm run build`, direct import scans, and focused route behavior checks
- [x] 3.2 Update `doc/进展记录.md` and the OpenSpec task status with the final route-service refactor outcome
