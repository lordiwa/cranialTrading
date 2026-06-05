# Plan 05-05 Summary — Migration tooling + version bump (UNIQ-05)

**Status:** ✅ Code complete · ⏳ Migration execution (Task 4) is human-gated, NOT yet run
**Date:** 2026-06-05

## What was built

### `scripts/usernameMigration.mjs` (pure, TDD)
- `normalizeUsername(raw)` — byte-equivalent to `src/utils/username.ts`, null-safe.
- `pickCanonical(group)` — most cards; ties → oldest `createdAt`.
- `buildPlan(groups)` — `{ renames: [{uid,from,to}], indexWrites: [{norm,uid}] }`; non-canonical → `${norm}_old{N}` (ordered); exactly one index write per normalized username (full backfill, size-1 groups included).
- Tests: `tests/unit/scripts/usernameMigration.test.ts` — 3 describes, 8 cases, all green.

### `scripts/audit-usernames.mjs` (read-only, D-14)
Admin SDK (`applicationDefault`, `FIREBASE_PROJECT` default `cranial-trading-dev`). Groups `/users` by normalized username, prints duplicate groups + canonical pick, writes timestamped JSON to `scripts/reports/`. **Zero Firestore writes** (verified: the only `.set(` is `groups.set` on a JS Map).

### `scripts/dedup-backfill-usernames.mjs` (dry-run default, D-15)
`APPLY = process.argv.includes('--apply')`. Builds plan via `buildPlan`; renames + index writes both guarded by `if (APPLY)`. Idempotent (skips index docs already pointing at the canonical uid). Default dry-run logs every intended action.

### Dependency + version
- `firebase-admin` added to root `devDependencies` (^12.7.0; lock regenerated).
- Version bumped **1.33.0 → 1.34.0** (D-19); package.json + package-lock.json committed together.

## Verification (code)
- `npm run test:unit`: 79 files / **1080 tests pass**.
- Audit read-only confirmed; dedup has 2 `if (APPLY)` write guards.
- `npx vite build`: ✅.

## Commit
- `feat(05-05): username migration tooling + bump 1.34.0`

## ⏳ Task 4 — D-17 migration rollout (NOT run — human-gated, `autonomous: false`)
Pending, in this order, after rules+code are deployed to dev:
1. `gcloud auth application-default login` (or `GOOGLE_APPLICATION_CREDENTIALS`)
2. `FIREBASE_PROJECT=cranial-trading-dev node scripts/audit-usernames.mjs` (review report)
3. `FIREBASE_PROJECT=cranial-trading-dev node scripts/dedup-backfill-usernames.mjs` (dry-run, review)
4. `... dedup-backfill-usernames.mjs --apply` (dev)
5. Verify on cranial-trading-dev.web.app: previously-duplicated @username resolves to canonical; buy request lands under correct owner (SCRUM-70 regression check)
6. After explicit approval: repeat 2-4 with `FIREBASE_PROJECT=cranial-trading` (prod)

## Note
After backfill, Plan 04's legacy resolution fallback becomes dead for real users (deferred cleanup).
