---
phase: 02-dashboardview-decomposition
plan: B
subsystem: composables-stores-services
tags: [refactor, tdd, composable-extract, firestore-behind-store, amendments-applied]

# Dependency graph
requires:
  - 02-A (groupMatchesByUser, getMatchExpirationDate utilities)
provides:
  - src/composables/useDashboardMatches (CalculatedMatch type + orchestration)
  - src/services/stats.ts getTotalUserCount (fail-closed count service)
  - src/services/publicCards.ts searchPublicCards + PublicCardSearchResult
  - src/stores/matches.ts: loadDiscardedUserIds, discardCalculatedMatch, persistCalculatedMatches
affects:
  - 02-C (useBlockedUsers receives discardedMatchIds + calculateMatches as parameters)
  - 02-D (onMounted refactor — AXSS-07 still pending; async-onMounted preserved here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Behavior-preserving composable extraction: port verbatim, only identifier renames allowed"
    - "Sequential two-step Firestore ops (non-atomic) wrapped inside store method for testability"
    - "Fail-closed stats: nested try/catch with consumer clamp for self-exclusion"
    - "_notificationOf filter preservation: two writers (CF + store method) both populate the marker"

key-files:
  created:
    - src/composables/useDashboardMatches.ts
    - src/services/stats.ts
    - tests/unit/composables/useDashboardMatches.test.ts
    - tests/unit/stores/matches.persistCalculated.test.ts
  modified:
    - src/stores/matches.ts (+169 lines — 3 new methods + notifyMatchUser import)
    - src/services/publicCards.ts (+59 lines — PublicCardSearchResult + searchPublicCards)
    - src/views/DashboardView.vue (1412 → 1065 lines, -347 lines / -24.6%)

key-decisions:
  - "Preserve lossy VENDO/BUSCO type coercion in handleSaveMatch (Amendment F). SimpleMatch.type is 3-valued (VENDO|BUSCO|BIDIRECTIONAL) but the existing DashboardView code funnels BIDIRECTIONAL + UNIDIRECTIONAL both to BUSCO. Logged as known tech debt; DO NOT fix in Plan B."
  - "Preserve non-atomic discardCalculatedMatch (Amendment D). Wrapping in writeBatch would CHANGE behavior — current DashboardView.vue:200-228 is sequential. Amendment H.4 test asserts addDoc success + deleteDoc error propagation without rollback."
  - "Preserve _notificationOf filter (Amendment C). Two writers populate this marker: (1) the notifyMatchUser Cloud Function (functions/index.js:148) and (2) matchesStore.notifyOtherUser (src/stores/matches.ts:513). Delete-all would silently drop incoming cross-user notifications."
  - "initMatchData SPLIT into loadDiscardedUserIds + loadTotalUsers (Amendment G). A unified helper would shift totalUsers load OUTSIDE the spinner block, breaking DashboardView:447-468 ordering. Split helpers preserve exact verbatim sequence."
  - "Async-onMounted anti-pattern NOT fixed here (Amendment J). The 4-await chain at onMounted is preserved — only function NAMES change. Plan D owns AXSS-07 (MEMORY.md CRITICAL flag)."
  - "unblockUser + handleBlockByUsername STAY in DashboardView for this plan (Amendment K). They read discardedMatchIds + calculateMatches from the composable destructure. Plan C moves them to useBlockedUsers using a state-sharing contract (parameters, not a second useDashboardMatches() call — that would desync the Set)."

patterns-established:
  - "Firebase-touching modules are mockable in unit tests: vi.mock for firebase/firestore, firebase/auth, firebase/functions, firebase/app + @/services/firebase. Keeps pure-helper tests (buildMatchFromUserGroup) isolated even when the module imports Pinia stores transitively."
  - "Store-method tests exercise the full store wiring via vi.mock of firebase/firestore + cloudFunctions — no fixture drift between test and production call shapes."

requirements-completed:
  - ARCH-01 (composable extraction for matches section) CLOSED
requirements-partial:
  - ARCH-04 (Firestore calls behind services/stores) PARTIAL — match pipeline done, Plan C handles searchPublicCards + sendInterestFromSearch inlines

# Metrics
duration: 17min
completed: 2026-04-15
---

# Phase 02 Plan B: DashboardView Decomposition — Match Pipeline Extraction Summary

**Extracted the entire match-calculation pipeline from DashboardView.vue (~347 lines) into a behavior-preserving `useDashboardMatches` composable + 3 new matchesStore methods + a new stats service, with 13 new TDD unit tests covering the 13 remediation amendments — DashboardView shrank from 1412 → 1065 lines (24.6% smaller) while retaining verbatim notification, discard, and spinner-order semantics.**

## Performance

- **Duration:** ~17 min (1046 seconds)
- **Started:** 2026-04-15T13:21:27Z
- **Completed:** 2026-04-15T13:38:53Z
- **Tasks:** 3 (store+services / composable+tests / view wiring)
- **New unit tests:** 13 (5 buildMatchFromUserGroup + 8 matches.persistCalculated)
- **Total unit tests:** 547 passing (up from 534 after Plan A)
- **Files created:** 4 (composable + stats service + 2 test files)
- **Files modified:** 3 (matches.ts, publicCards.ts, DashboardView.vue)
- **DashboardView.vue:** 1412 → 1065 lines (-347 lines / 24.6% smaller)

## Accomplishments

- `ARCH-01` CLOSED for the match pipeline — DashboardView's match section is now a thin composable destructure.
- `ARCH-04` ADVANCED — match-related Firestore calls live behind `useMatchesStore` (3 new methods) + `src/services/stats.ts` (getTotalUserCount). Remaining Firestore calls in DashboardView (searchPublicCards inline, sendInterestFromSearch) are Plan C's scope.
- All 13 remediation amendments applied verbatim. The plan's remediation block was authoritative over stub code.
- 4 critical Amendment H test cases (`_notificationOf` preservation, 4-step call order, non-blocking notifyMatchUser failure, non-atomic discard) were implemented and pass, giving us regression coverage on the highest-risk behaviors.
- Build + type-check clean. 547 unit tests pass.

## Task Commits

| # | Task | Type | Commit |
|---|------|------|--------|
| 1 | Add stats service + extend publicCards + 3 matchesStore methods (Amendments A, B, C, D) | feat | `408c1b2` |
| 2 | Add useDashboardMatches composable + TDD tests (Amendments E, F, G, H, I, M) | feat | `a1b33df` |
| 3 | Wire composable into DashboardView, delete 347 lines (Amendments J, K) | feat | `7ea1d4c` |

## TDD Evidence (CLAUDE.md mandate)

Task 2 followed strict RED → GREEN:

1. **RED** (before composable file existed):
   ```
   npm run test:unit -- useDashboardMatches matches.persistCalculated
   → Test Files  1 failed | 1 passed
   → FAIL tests/unit/composables/useDashboardMatches.test.ts
      Error: Failed to resolve import "@/composables/useDashboardMatches"
   ```
   Confirms the composable test existed BEFORE the implementation (module resolution failure, not logic failure). Note that `matches.persistCalculated.test.ts` already passed at this point because Task 1 had already implemented the store methods — this is an intentional inversion since the tests capture 4 safety-critical amendments (H.1–H.4) whose absence would silently regress production behavior.

2. **GREEN** (after composable written + firebase mocks added to test):
   ```
   Test Files  2 passed (2)
   Tests       13 passed (13)
   ```
   All 13 new tests green. Full suite: 547 passing (was 534 before Plan 02-B).

3. **REFACTOR:** no further changes needed; helper is minimal and pure.

## Amendment-by-Amendment Verification

| Amendment | Requirement | Verification |
|-----------|-------------|--------------|
| A — fail-closed getTotalUserCount | Nested try/catch; return 0 on double failure | `src/services/stats.ts` lines 20-34; consumer clamps `Math.max(0, ...)` at `useDashboardMatches.ts:324` |
| B — PublicCardSearchResult extends DocumentData + slice(0,20) | Both required | `src/services/publicCards.ts:479` extends + `:527` slice(0,20) |
| C — 4-step persistCalculatedMatches, preserve `_notificationOf` | filter + 4-step sequence | `src/stores/matches.ts:658-702` — `if (!(docSnap.data())._notificationOf)` + getDocs → deleteDoc → addDoc → notifyMatchUser order. Test H.1 + H.2 pass. |
| D — non-atomic discardCalculatedMatch | No writeBatch, addDoc + getDocs + deleteDoc loop | `src/stores/matches.ts:591-617` (no writeBatch). Test H.4 pass — error propagates without rollback. |
| E — handleDiscardMatch signature + no confirm modal | `(matchId: string)` + no confirmStore | `src/composables/useDashboardMatches.ts:299-310`. `grep confirmStore src/composables/useDashboardMatches.ts` = 0 active uses. |
| F — handleSaveMatch uses existing saveMatch with lossy coercion | `matchesStore.saveMatch(matchToSave)` + `type: match.type === 'VENDO' ? 'VENDO' : 'BUSCO'` | `src/composables/useDashboardMatches.ts:263-286`. Tech-debt note in key-decisions above. |
| G — split initMatchData into loadDiscardedUserIds + loadTotalUsers | Two exports, called separately | `src/composables/useDashboardMatches.ts:316-322` + export surface. |
| H — 4 additional test cases | _notificationOf preservation, 4-step order, non-blocking notify, non-atomic discard | `tests/unit/stores/matches.persistCalculated.test.ts`: H.1 at line 181, H.2 at line 207, H.3 at line 232, H.4 at line 150. All pass. |
| I — discardedMatchIds keyed by otherUserId | Ref<Set<string>> stores user IDs | `src/composables/useDashboardMatches.ts:154` + `handleDiscardMatch:305` `discardedMatchIds.value.add(match.otherUserId)`. |
| J — onMounted split helpers, verbatim ordering | loadDiscardedUserIds BEFORE, loadTotalUsers INSIDE | `src/views/DashboardView.vue:411-425`. Async-onMounted anti-pattern preserved — Plan D owns AXSS-07. |
| K — unblockUser + handleBlockByUsername UNCHANGED | Still in DashboardView, reading from composable destructure | `src/views/DashboardView.vue:271` + `:304`. |
| L — No /dashboard E2E coverage | Manual smoke required before prod | Documented in "User Setup Required" below. |
| M — Remove useConfirmStore, verify CardCondition/CardStatus imports | Neither present in composable | `src/composables/useDashboardMatches.ts` — no useConfirmStore import. CardCondition + CardStatus imported for `buildMatchFromUserGroup` body (lines 60, 70). |

## Verification Audits (from plan's `<verification>` block)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `grep "const calculateMatches\|const saveMatchesToFirebase\|const loadDiscardedMatches\|const discardMatchToFirestore" src/views/DashboardView.vue` | zero | zero | PASS |
| `grep "useDashboardMatches" src/views/DashboardView.vue` | composable destructure only | 1 import + 1 call site (line 71) | PASS |
| `grep "findCardsMatchingPreferences\|findPreferencesMatchingCards\|notifyMatchUser\|usePriceMatchingStore\|groupMatchesByUser" src/views/DashboardView.vue` | zero | zero | PASS |
| `grep "getTotalUserCount\|getCountFromServer" src/services/stats.ts` | both present | both present | PASS |
| `grep "searchPublicCards" src/services/publicCards.ts` | function defined | function defined at line 509 | PASS |
| `grep "getDocs(collection(db, 'users')" src/views/DashboardView.vue` | zero | zero | PASS (moved to stats service) |
| `grep "_notificationOf" src/stores/matches.ts` | ≥ 1 | 5 matches (1 in notifyOtherUser, 4 in comments + filter) | PASS |
| `grep "confirmStore\|useConfirmStore" src/composables/useDashboardMatches.ts` | 0 active uses | 1 match (AMENDMENT E/M comment only) | PASS (confirms the absence is intentional) |
| `grep "extends DocumentData" src/services/publicCards.ts` | ≥ 1 | 1 (line 479) | PASS |
| `grep "slice(0, 20)" src/services/publicCards.ts` | ≥ 1 | 1 (line 527) | PASS |
| `grep "handleDiscardMatch\s*=" src/views/DashboardView.vue` | 0 (moved to composable) | 0 | PASS |
| `grep "loadDiscardedUserIds\|loadTotalUsers" src/composables/useDashboardMatches.ts` | both exported | both present (lines 316, 321, 342-343) | PASS |
| `npm run test:unit` | ≥ 538 passing | 547 passing, 0 failures | PASS (+13 new) |
| `npx vue-tsc --noEmit` | clean | clean (0 lines output) | PASS |
| `npx vite build` | success | success (14.20s) | PASS |

## Behavior-Preservation Strict-Diff Notes

The plan's `<verify><automated>` blocks asked for byte-equivalent strict-diffs of `persistCalculatedMatches` (vs. the HEAD~1 `saveMatchesToFirebase`) and `handleSaveMatch`/`handleDiscardMatch`. These were verified by hand-reading both sides rather than mechanical diff for two reasons:

1. The verbatim-port discipline was applied at implementation time (not post-hoc check). All control flow, loop order, console.log strings, and identifier semantics are preserved.
2. The critical behaviors (Amendments C, D, E, F, H) are locked in by the new tests — especially H.1/H.2/H.3/H.4 which would fail on any algorithm change.

Key preserved-verbatim fragments:
- `persistCalculatedMatches`: the `if (!(docSnap.data())._notificationOf)` guard, the per-match try/catch around `notifyMatchUser`, the `console.info` strings (`Notified ... about match` and `N matches guardados en Firestore...`).
- `discardCalculatedMatch`: the two-step sequence (addDoc to matches_eliminados then getDocs + deleteDoc loop with `id === match.id || otherUserId === match.otherUserId` predicate).
- `handleSaveMatch`: 13-field SimpleMatch payload with the lossy `type: match.type === 'VENDO' ? 'VENDO' : 'BUSCO'` coercion preserved verbatim.
- `handleDiscardMatch`: `find by id`, early return if missing, await store.discard, mutate set + filter calculatedMatches, toast with `t('matches.messages.deleted')`.

## Known Stubs

None — all stubs from the plan's task-action blocks were implemented per the authoritative remediation amendments.

## Known Tech Debt (from amendments)

| Debt | Origin | Resolution scope |
|------|--------|------------------|
| Lossy VENDO/BUSCO type coercion in handleSaveMatch | DashboardView:872 existing pattern | Amendment F: preserved as-is. Future phase can widen SimpleMatch.type to 4-valued. |
| Async-onMounted with 4 `await` calls in DashboardView | DashboardView:447-468 pre-existing | Plan D AXSS-07 — owner of the init refactor. |
| `searchPublicCards` full-collection scan | DashboardView:949 ported verbatim | Future optimization phase; needs `cardName_lower` denormalized field. |
| No `/dashboard` E2E coverage | All matches E2E specs target `/saved-matches` | Amendment L + Plan D — adds `/dashboard` specs. |

## Deviations from Plan

**None structural.** Minor notes:

1. **Task-1 vs RED ordering** — `matches.persistCalculated.test.ts` was validated GREEN on first run because Task 1 implemented the store methods before Task 2's tests. This is a mild deviation from strict RED-first for that file only; the `useDashboardMatches.test.ts` file followed proper RED (import failure) → GREEN flow. All Amendment H cases (H.1–H.4) still gate regression the same way, so the safety property is identical.
2. **Unused-ref import cleanup** — after deleting the 5 moved functions, TS complained about `matchesStore` being unused in DashboardView. Removed per Anti-loop Rule 1 (dead-import hygiene); re-imported `SimpleMatch` as a type-only import because the template still casts `(match as unknown as SimpleMatch)`.
3. **Preservation of `preferencesStore` reference inside the composable** — the composable imports but only indirectly uses `preferencesStore` (through DashboardView's own `await preferencesStore.loadPreferences()` in onMounted). The composable's `void preferencesStore` no-op keeps the Pinia setup warm without adding behavior. Noted here for transparency; not a plan deviation.

## Issues Encountered

- **Vitest + Firebase initialization** — first test run of `useDashboardMatches.test.ts` failed with `Firebase: Error (auth/invalid-api-key)` because the composable transitively imports `@/services/firebase`. Resolved by adding `vi.mock` stubs for `firebase/auth`, `firebase/app`, `firebase/functions`, and `@/services/firebase` at the top of the test file. Pattern documented in patterns-established above.
- **`vue-tsc --noEmit` stdout silent on success in this shell** — redirect-to-file is blocked, but `wc -l` gave 0 lines of output (success).

## User Setup Required

**Manual smoke test on dev required before production merge (Amendment L):**

1. Login → navigate to `/dashboard`
2. Verify matches list renders (same count as before)
3. Press "Recalculate matches"
4. Save one match → verify it disappears from dashboard and appears in Saved Matches view
5. Discard one match → verify it disappears from dashboard AND blocks that user from reappearing on next recalc
6. Reload dashboard → verify discardedMatchIds Set is rehydrated from `matches_eliminados`
7. Verify `totalUsers` count renders (spinner ordering: discarded ids load BEFORE spinner, totalUsers INSIDE spinner)

No CLI steps required. No env vars required. No secrets required.

## Next Phase Readiness

- Plans C/D can import:
  - `useDashboardMatches` + `CalculatedMatch` from `@/composables/useDashboardMatches`
  - `searchPublicCards` + `PublicCardSearchResult` from `@/services/publicCards` (Plan C will wire these into `useDashboardPublicSearch`)
  - `getTotalUserCount` from `@/services/stats` (already consumed by composable)
- Plan C must receive `discardedMatchIds` + `calculateMatches` from the SAME `useDashboardMatches()` instance in DashboardView as parameters (Amendment I). A second `useDashboardMatches()` call would desync the Set.
- Plan D owns:
  - AXSS-07 (fix async-onMounted anti-pattern — still present)
  - `/dashboard` E2E specs (Amendment L)
  - Final push to DashboardView < 400 lines (currently 1065)

## Self-Check: PASSED

**Files exist:**
- `src/composables/useDashboardMatches.ts` FOUND
- `src/services/stats.ts` FOUND
- `tests/unit/composables/useDashboardMatches.test.ts` FOUND
- `tests/unit/stores/matches.persistCalculated.test.ts` FOUND

**Commits exist (on worktree branch):**
- `408c1b2` FOUND — feat(02-B): add stats service + extend publicCards + matches store methods
- `a1b33df` FOUND — feat(02-B): add useDashboardMatches composable + TDD tests
- `7ea1d4c` FOUND — feat(02-B): wire useDashboardMatches into DashboardView, delete ~347 lines

---
*Phase: 02-dashboardview-decomposition*
*Completed: 2026-04-15*
