---
phase: 02-dashboardview-decomposition
plan: A
subsystem: utils
tags: [tdd, pure-functions, refactor, dedup, dst-fix, O1-lookup]

# Dependency graph
requires: []
provides:
  - MATCH_LIFETIME_DAYS constant (single source of truth at src/utils/matchExpiry.ts)
  - getMatchExpirationDate(from?) calendar-day helper (DST-safe, defensive copy)
  - buildOwnedCountMap(cards) O(N) pre-aggregator for O(1) ownedCount lookup
  - groupMatchesByUser(cards, prefs) pure grouping helper (Vue/Firebase-free)
  - UserMatchGroup interface exported from utils/matchGrouping
affects:
  - 02-B (useDashboardMatches composable will consume groupMatchesByUser + getMatchExpirationDate)
  - 02-C (useBlockedUsers / clear-data composables share the matchExpiry import)
  - 02-D (onMounted refactor lands on top of this foundation)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD for pure utility extraction: RED (failing imports) -> GREEN (implementation) -> consumer wire-up"
    - "Calendar-day arithmetic (setDate + getDate) instead of fixed +86_400_000 ms math to avoid DST day-shift"
    - "Computed Map for O(1) lookup — rebuilds once per shallowRef change, not per render"

key-files:
  created:
    - src/utils/matchExpiry.ts
    - src/utils/ownedCount.ts
    - src/utils/matchGrouping.ts
    - tests/unit/utils/matchExpiry.test.ts
    - tests/unit/utils/ownedCount.test.ts
    - tests/unit/utils/matchGrouping.test.ts
  modified:
    - src/stores/matches.ts
    - src/views/DashboardView.vue
    - src/composables/useGlobalSearch.ts
    - src/views/UserProfileView.vue
    - src/views/SavedMatchesView.vue
    - src/views/SearchView.vue

key-decisions:
  - "MATCH_LIFETIME_DAYS lives in src/utils/matchExpiry.ts (not re-exported from stores/matches.ts). Utility file has zero Firebase deps, easier to unit-test."
  - "Calendar-day setDate(+15) adopted everywhere — previously 8 sites used +86_400_000*15 ms math which drifts by up to 1 hour over DST transitions. Per RESEARCH behavior note, user-visible impact is zero (UI renders day-granularity only); audit log has no minute-precise expiry dependency."
  - "Removed now-unused PublicCard/PublicPreference type imports from DashboardView.vue after moving groupMatchesByUser (Rule 1 auto-fix: dead imports broke typecheck after extraction)."

patterns-established:
  - "buildOwnedCountMap signature: Pick<Card, 'name' | 'quantity'>[] -> Map<lowercaseName, totalQuantity>; zero-qty entries preserved"
  - "getMatchExpirationDate(from = new Date()): defensive copy, calendar-day arithmetic, never mutates input"
  - "groupMatchesByUser: same userId merges cards + prefs into single entry; missing location -> 'Unknown'; missing email -> ''"

requirements-completed: [ARCH-07, ARCH-13]

# Metrics
duration: 23min
completed: 2026-04-14
---

# Phase 02 Plan A: DashboardView Decomposition — Pure Logic Foundation Summary

**TDD-extracted three Firebase-free utilities (matchExpiry, ownedCount, matchGrouping), deduped MATCH_LIFETIME_DAYS across 5 consumer files, and replaced SearchView's O(N*M) owned-count with O(1) Map lookup — 2 phase requirements closed, 18 new unit tests, 534 total passing.**

## Performance

- **Duration:** ~23 min (1420 seconds)
- **Started:** 2026-04-15T00:52:28Z
- **Completed:** 2026-04-15T01:15:00Z
- **Tasks:** 3
- **New unit tests:** 18 (6 per utility)
- **Total unit tests:** 534 passing (up from 516)
- **Files created:** 6 (3 utils + 3 test suites)
- **Files modified:** 6 (matches.ts, DashboardView, useGlobalSearch, UserProfileView, SavedMatchesView, SearchView)
- **DashboardView.vue:** 1470 -> 1414 lines (-56 lines)

## Accomplishments

- Three new Vue/Firebase-free utilities under `src/utils/` with full unit coverage (18 new tests)
- `MATCH_LIFETIME_DAYS = 15` now exists in exactly ONE place across the whole repo (src/utils/matchExpiry.ts). Previously 8 inline sites across 5 files — all removed.
- `ARCH-07` CLOSED: SearchView.getOwnedCount now uses `computed(() => buildOwnedCountMap(collectionStore.cards))` + `Map.get()` — O(1) lookup per rendered result card. Previously O(N*M) per render (filter + reduce over full collection).
- `ARCH-13` CLOSED: all 5 consumers (`stores/matches.ts`, `views/DashboardView.vue`, `composables/useGlobalSearch.ts`, `views/UserProfileView.vue`, `views/SavedMatchesView.vue`) import `getMatchExpirationDate` from `utils/matchExpiry` — none redeclares the constant or the helper.
- Calendar-day expiry math is now consistent across all 5 sites. Previously 8 inline sites used `Date.now() + 15 * 86_400_000` ms which drifts by up to 1h over DST boundaries; now all use `setDate(+15)` — wall-clock day preserved.
- `groupMatchesByUser` extracted verbatim from DashboardView to `utils/matchGrouping.ts` (pure, importable, unit-tested) — unblocks Plan B's `useDashboardMatches` composable extraction.

## Task Commits

| # | Task | Type | Commit |
|---|------|------|--------|
| 1 | TDD-extract matchExpiry + ownedCount + matchGrouping utilities (RED -> GREEN) | feat | `93612b0` |
| 2 | Wire matchExpiry into matches.ts + DashboardView + the 3 ARCH-13 cleanup files | feat | `8e195b9` |
| 3 | Wire ownedCount + matchGrouping into SearchView and DashboardView | feat | `2b659d7` |

## TDD Evidence (CLAUDE.md mandate)

Task 1 followed strict RED -> GREEN:

1. **RED**: test files committed/written before implementation. `npm run test:unit -- matchExpiry ownedCount matchGrouping` reported:
   ```
   Test Files  3 failed (3)
   Tests       no tests
   [Error: Failed to resolve import "@/utils/matchExpiry" ...]
   [Error: Failed to resolve import "@/utils/ownedCount" ...]
   [Error: Failed to resolve import "@/utils/matchGrouping" ...]
   ```
   Confirms tests existed before implementation (resolution failure, not logic failure).

2. **GREEN**: after writing the three util files, same command:
   ```
   Test Files  3 passed (3)
   Tests       18 passed (18)
   ```

3. **REFACTOR**: not needed — utilities are already minimal and idiomatic.

Both RED and GREEN states live in the same commit `93612b0` (test files + implementations + passing test run are the atomic unit). The RED evidence is the pre-file-creation failure captured in the executor log; the test files exercise behavior not available in any prior commit.

## Verification Audits (from plan's `<verification>` block)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `grep "MATCH_LIFETIME_DAYS = 15" src/` | only `src/utils/matchExpiry.ts` | `src/utils/matchExpiry.ts:13:export const MATCH_LIFETIME_DAYS = 15` | PASS |
| `grep "15 * 24 * 60 * 60" src/` | zero matches | zero matches | PASS |
| `grep "setDate.*getDate.*15" src/` | only `src/utils/matchExpiry.ts` | zero (util uses `+ MATCH_LIFETIME_DAYS`, not `+ 15` literal) | PASS (stronger than plan required) |
| `grep "getExpirationDate" src/` | zero in consumer files | zero | PASS |
| `grep "const groupMatchesByUser\|function groupMatchesByUser" src/views/DashboardView.vue` | zero | zero | PASS |
| `grep "groupMatchesByUser" src/views/DashboardView.vue` | import + call site only | 2 occurrences (line 23 import, line 693 call) | PASS |
| `grep "ownedCountByName\|buildOwnedCountMap" src/views/SearchView.vue` | both present | 3 occurrences | PASS |
| `grep "collectionStore.cards.filter" src/views/SearchView.vue` | zero | zero | PASS |
| `npm run test:unit` | 534 passing | 534 passing, 0 failures | PASS |
| `npx vue-tsc --noEmit` | clean | clean | PASS |
| `npx vite build` | success | success (13.45s) | PASS |

## New MATCH_LIFETIME_DAYS / 15-day sites discovered during execution

RESEARCH (2026-04-14) catalogued 8 inline sites (4 DashboardView + 3 SavedMatchesView + 1 useGlobalSearch + 1 UserProfileView + 1 matches.ts internal). During grep at execution time I discovered **one additional DashboardView site at line 417** (`blockUserByUsername` flow) with the same `Date.now() + 15 * 24 * 60 * 60 * 1000` pattern. It was cleaned up in Task 2 alongside the other sites via `replace_all` — no action needed beyond noting the discrepancy. Total DashboardView sites cleaned: **4 inline + 1 local redeclare block = 5** (RESEARCH said 4). Net effect: MATCH_LIFETIME_DAYS is still defined once, imported everywhere.

No `15*24*60*60*1000`, `setDate + 15`, or private `MATCH_LIFETIME_DAYS` remained after the commits.

## Calendar-day expiry consistency note

Before: 8 sites used `new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)` — fixed-ms math. Across a DST transition, these could land ±1 hour from the nominal wall-clock day, occasionally shifting `getDate()` by one.

After: every site calls `getMatchExpirationDate()` which uses `setDate(getDate() + 15)`. The wall-clock day is always preserved regardless of DST. User-visible impact is zero (UI renders day-granularity only), documented in the threat model (T-02A-05 accept).

## Deviations from Plan

**None structural.** Three minor notes:

1. **Rule 1 auto-fix (dead imports):** After moving `groupMatchesByUser` out of DashboardView, the `PublicCard` and `PublicPreference` type imports were unused, triggering TS6133 errors. Fix applied atomically in Task 3's commit `2b659d7` (deleted two import lines). This is documented as a Rule 1 / ARCH-01 foundation cleanup, not a plan deviation per se — the plan didn't foresee the dead-import side effect but the resolution (remove unused) is unambiguous.
2. **One extra DashboardView site:** RESEARCH listed 4 DashboardView MATCH_LIFETIME_DAYS sites; grep at execution time found 5 (a new `blockUserByUsername` site at L417 appeared between RESEARCH and execution). Cleaned up in the same atomic commit — no behavior change.
3. **Intentional behavior change documented:** 5 sites switch from +ms math to calendar setDate arithmetic. Documented in the plan's `<interfaces>` behavior note; unit-tested via the DST-boundary test case (Nov 3 2024 01:30 local -> expect Nov 18, not Nov 17).

## Issues Encountered

None blocking. One lint-slow-but-passes note: pre-commit hooks (type-check + eslint) take ~3-4 minutes per commit on this repo due to the existing 48 warnings being scanned. Did not investigate — orthogonal to Plan A.

## User Setup Required

None.

## Next Phase Readiness

- `ARCH-07` CLOSED (SearchView O(1) ownedCount)
- `ARCH-13` CLOSED (single source for MATCH_LIFETIME_DAYS)
- Plans B/C/D can now import:
  - `getMatchExpirationDate` from `../utils/matchExpiry`
  - `MATCH_LIFETIME_DAYS` from `../utils/matchExpiry`
  - `groupMatchesByUser` from `../utils/matchGrouping`
  - `buildOwnedCountMap` from `../utils/ownedCount` (available to any future collection-aggregation need)
- DashboardView dropped 56 lines (1470 -> 1414). Plan B will be the big delete (~400 lines more). Plan B can start in parallel with Plan C since both only depend on Plan A.
- Zero `from 'firebase/firestore'` imports in any new utility file — the utilities are clean and unit-testable without mocks.

## Self-Check: PASSED

**Files exist:**
- `src/utils/matchExpiry.ts` FOUND
- `src/utils/ownedCount.ts` FOUND
- `src/utils/matchGrouping.ts` FOUND
- `tests/unit/utils/matchExpiry.test.ts` FOUND
- `tests/unit/utils/ownedCount.test.ts` FOUND
- `tests/unit/utils/matchGrouping.test.ts` FOUND

**Commits exist:**
- `93612b0` FOUND (feat(02-A): add matchExpiry, ownedCount, matchGrouping utils with TDD)
- `8e195b9` FOUND (feat(02-A): dedup MATCH_LIFETIME_DAYS across 5 consumers)
- `2b659d7` FOUND (feat(02-A): wire ownedCount Map + matchGrouping utils)

---
*Phase: 02-dashboardview-decomposition*
*Completed: 2026-04-14*
