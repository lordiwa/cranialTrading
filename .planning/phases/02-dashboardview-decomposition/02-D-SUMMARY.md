---
phase: 02-dashboardview-decomposition
plan: D
status: completed
completed_at: 2026-04-15
commits:
  - edc47e2 # chore(lint): unblock pre-commit hook — Array<T> → T[]
  - 9510993 # Task 1: SavedMatchesView sync onMounted + void initView (AXSS-07)
  - e0d9cc7 # Task 2: bump version 1.23.0 → 1.24.0
  - THIS_COMMIT # Task 3: phase SUMMARY
phase_version: 1.24.0
---

# Plan 02-D — Phase 02 Closeout

## Scope pivot callout

> Phase 02 began as "DashboardView decomposition" but **investigation during Plan D discovered `/dashboard` redirects to `/saved-matches`** (`router/index.ts:43-45`, added commit `212488f` on 2026-02-09) — `DashboardView.vue` was **unrouted dead code since that date**. The "decompose DashboardView" premise was misaimed from day one.
>
> **Scope pivoted at Plan C** to migrate the LIVE view (`SavedMatchesView.vue`, mounted at `/saved-matches`) to consume the utils/services/store-methods produced by Plans 02-A and 02-B.
>
> **Plan D closes the `onMounted(async` anti-pattern on that same live view** (requirement AXSS-07), bumps version, and writes this summary.
>
> `DashboardView.vue` was deleted in Plan C. The `useDashboardMatches` composable (built in Plan B as the originally-planned extraction target) was also deleted in Plan C after investigation showed it was orphaned — no view actually consumed it.

---

## Requirements — honest disposition

| Requirement | Disposition | Notes |
|-------------|-------------|-------|
| **ARCH-01** (match pipeline extraction) | **Partial** | Plan 02-B created `useDashboardMatches` composable — deleted in Plan C as orphaned. Utility helpers (`matchExpiry`, `ownedCount`, `matchGrouping`) from Plan 02-A ARE consumed by SearchView and SavedMatchesView; services (`stats`, `publicCards`) from Plan 02-B ARE consumed by SavedMatchesView. Net delivery: infrastructure exists and is used, but not via the composable pattern originally envisioned. |
| **ARCH-04** (no inline Firestore wrappers) | **Closed** for SavedMatchesView. Plan 02-C replaced 3 inline Firestore wrappers (`loadDiscardedMatches`, `saveMatchesToFirebase`, `discardMatchToFirestore`) with `matchesStore` delegation. SavedMatchesView's inline `calculateMatches` still reaches Firestore via `matchesStore` methods — that's delegation, not inline logic. |
| **ARCH-07** (O(1) `ownedCount` in SearchView) | **Closed** in Plan 02-A. |
| **ARCH-13** (single `MATCH_LIFETIME_DAYS`) | **Closed** in Plan 02-A (dedup across 5 consumers). |
| **AXSS-07** (async `onMounted` anti-pattern) | **Closed for SavedMatchesView** in Plan D. **NOT fixed** in `MessagesView:69`, `DecksView:556`, `CollectionView:3496`, `MatchCard:50` — all 4 are behind `requiresAuth: true` routes; anonymous-user repro cannot fire today. Logged as Phase 03+ tech debt. |

---

## What was built (Plan D)

### Task 1 — `SavedMatchesView.vue` onMounted refactor (commit `9510993`)

Converted the async onMounted body into a new `const initView = async () => { ... }` helper. The lifecycle hook is now synchronous and uses fire-and-forget:

```typescript
onMounted(() => {
  void initView().then(() => {
    const matchId = route.query.match
    if (matchId && typeof matchId === 'string') {
      activeTab.value = 'new'
      void scrollToMatch(matchId)
      void router.replace({ query: { ...route.query, match: undefined } })
    }
  })
})
```

**Pattern rationale:** The `.then()` callback preserves ordering — `scrollToMatch` queries the DOM via `document.querySelector('[data-match-id=...]')`, and those elements don't exist until `calculateMatches()` inside `initView` completes. Running the query-param handler inline before `initView()` would silently no-op.

### Task 2 — version bump (commit `e0d9cc7`)

`package.json` 1.23.0 → 1.24.0 (minor). Rationale: Phase 02 added new exported public APIs (services/stats, services/publicCards.searchPublicCards, three matchesStore methods, three utility helpers). Per CLAUDE.md semver: minor = new features/API integrations.

### Extra — pre-existing lint fix (commit `edc47e2`)

Discovered during Plan D's pre-commit hook: `src/stores/matches.ts:655` used `Array<{...}>` syntax instead of `{...}[]`, a lint error introduced by Plan 02-B (commit `408c1b2`) that slipped through because parallel-executor commits use `--no-verify`. One-character fix to unblock Plan D's commit pipeline.

---

## Phase 02 aggregate metrics

### Line deltas (approximate)

| Plan | Added | Removed | Net |
|------|-------|---------|-----|
| 02-A (helpers + dedup) | ~+400 | ~-60 | +340 |
| 02-B (composable + services + store methods) | ~+900 | ~-350 | +550 |
| 02-C (migrate + delete dead code) | ~+100 | ~-1570 | **-1470** |
| 02-D (refactor + version) | ~+15 | ~-10 | +5 |
| **Total** | ~+1415 | ~-1990 | **~-575** |

Note: Plan C's -1570 includes `DashboardView.vue` (-1066), `useDashboardMatches.ts` (-345), composable test (-157), and ~-160 from SavedMatchesView trimming.

### Test count evolution

| Milestone | Tests | Delta |
|-----------|-------|-------|
| Pre-Phase-02 | ~516 | — |
| After 02-A | 534 | +18 (utils + stats seeds) |
| After 02-B | 547 | +13 (6 composable + 7 store) |
| After 02-C | 542 | -6 (composable tests deleted; ±1 from drift elsewhere) |
| After 02-D | 542 | 0 |

### Version

1.22.0 → **1.24.0** (minor bump reflecting the new API surface across Plans 02-A and 02-B).

### Files touched across all 4 plans

**Added:**
- `src/utils/matchExpiry.ts`, `src/utils/ownedCount.ts`, `src/utils/matchGrouping.ts`
- `src/services/stats.ts`, `src/services/publicCards.ts` (as a searchable module)
- `tests/unit/utils/matchExpiry.test.ts`, `ownedCount.test.ts`, `matchGrouping.test.ts`, tests for store methods and services
- Six plan-artifact files under `.planning/phases/02-dashboardview-decomposition/` (A/B/C/D plans + summaries)

**Modified:**
- `src/views/SavedMatchesView.vue` (major: migrated to new infrastructure + async-onMounted fix)
- `src/stores/matches.ts` (three new methods added in Plan B; one-line lint fix in Plan D)
- `src/views/SearchView.vue`, `src/components/matches/MatchCard.vue`, `src/composables/useGlobalSearch.ts` (wired to matchExpiry / ownedCount)
- `CLAUDE.md` (parallel-sibling references updated in Plan C)

**Deleted (Plan C):**
- `src/views/DashboardView.vue`
- `src/composables/useDashboardMatches.ts`
- `tests/unit/composables/useDashboardMatches.test.ts`

---

## Known tech debt (logged for Phase 03+)

1. **4 `onMounted(async` sites remain** — `src/views/MessagesView.vue:69`, `src/views/DecksView.vue:556`, `src/views/CollectionView.vue:3496`, `src/components/matches/MatchCard.vue:50`. All four are behind `requiresAuth: true` routes so the anonymous-user reproduction path cannot fire today. A dedicated phase with per-site regression specs is the right vehicle.
2. **Blocked-users inline code** in `SavedMatchesView.vue` (BlockedUser interface, `blockedUsers` ref, `loadBlockedUsers`, `unblockUser`, `handleBlockByUsername`, `openBlockedUsersModal`, `<BaseModal>` template) — candidate for extraction into a `BlockedUsersModal` component once another feature needs the same logic.
3. **SavedMatchesView's inline `calculateMatches`** retains an `as unknown as 'VENDO'` type coercion at ~line 554. The real fix needs `SimpleMatch.type` widened to 4-valued or `MatchCard`'s `match` prop widened — both cross-cutting and out of Phase 02's scope.
4. **Stale docstrings:**
   - `src/stores/matches.ts:577` JSDoc says *"Used by useDashboardMatches to filter out previously-discarded matches"* — `useDashboardMatches` is deleted; update when next touched.
   - `src/utils/matchGrouping.ts:14` and `src/views/SavedMatchesView.vue:49` reference DashboardView historically — lineage description, not load-bearing.

---

## Lessons learned (for future phases)

1. **Read the router before planning a view decomposition.** The DashboardView plan was scoped in 02-CONTEXT.md without checking `router/index.ts:43-45`'s `/dashboard → /saved-matches` redirect. ~1-2 hours of Plan 02-B went into building infrastructure (the `useDashboardMatches` composable) that was ultimately deleted unused.
2. **MEMORY.md rules are universal coding standards — verify the live repro path before treating them as bug-fix tickets.** AXSS-07's "async onMounted breaks anonymous user profile loading" was logged from a past UserProfileView incident. Of the 5 remaining sites, 4 cannot fire the bug today (auth-gated). Still worth fixing — but as pattern hygiene, not urgent hotfix.
3. **Parallel-executor `--no-verify` commits can smuggle lint errors past the gate.** Plan 02-B's `Array<{...}>` typed error was caught only during Plan 02-D's sequential pre-commit hook. Consider running `npm run lint` once after each parallel wave merges back, even if individual agents used `--no-verify`.
4. **Sequential inline execution is more reliable than parallel subagents for tight 1-plan waves** (especially after a prior agent hits a Bash-permission denial). The orchestrator executed Plan 02-D inline on `develop` after the 02-C subagent's stream idle timeout + Bash-denial sequence — no further issues.

---

## Commits (Phase 02 total — most recent first)

### Plan 02-D
- `e0d9cc7` — chore(release): bump version to 1.24.0 (Phase 02 minor)
- `9510993` — fix(02-D): SavedMatchesView onMounted sync wrapper + void initView (AXSS-07)
- `edc47e2` — chore(lint): use T[] instead of Array<T> in persistCalculatedMatches

### Plan 02-C
- `47e91ed` — docs(02-C): complete plan C summary — SavedMatchesView migration + dead-code deletion
- `ce1f00d` — feat(02-C): delete DashboardView + useDashboardMatches dead code
- `46ac68a` — feat(02-C): SavedMatchesView uses matchesStore methods for match pipeline
- `392d2ff` — feat(02-C): SavedMatchesView imports groupMatchesByUser + getTotalUserCount

### Plan 02-B
- `2526daf` — docs(02-B): complete plan B summary — match pipeline extraction
- `7ea1d4c` — feat(02-B): wire useDashboardMatches into DashboardView, delete ~347 lines *(DashboardView itself later deleted in Plan C)*
- `a1b33df` — feat(02-B): add useDashboardMatches composable + TDD tests *(composable later deleted in Plan C)*
- `408c1b2` — feat(02-B): add stats service + extend publicCards + matches store methods
- `d668c9a` — docs(02-B): remediate plan with 13 behavior-preservation amendments

### Plan 02-A
- `8edcf56` — docs(02-A): complete plan A summary
- `2b659d7` — feat(02-A): wire ownedCount Map + matchGrouping utils (ARCH-07, ARCH-01 foundation)
- `8e195b9` — feat(02-A): dedup MATCH_LIFETIME_DAYS across 5 consumers (ARCH-13)
- `93612b0` — feat(02-A): add matchExpiry, ownedCount, matchGrouping utils with TDD

### Phase setup
- `8787b54` — docs(02-C,02-D): rewrite plans after phase scope pivot
- `c318899` — docs(02): create Phase 02 planning artifacts (DashboardView decomposition)

---

## Self-check

- [x] `npm run test:unit` — **542 passed**
- [x] `npx vue-tsc --noEmit` — clean
- [x] `npx vite build` — succeeds (13.89s last run)
- [x] `grep -n "onMounted(async" src/views/SavedMatchesView.vue` → **0 matches**
- [x] `grep -n "void initView()" src/views/SavedMatchesView.vue` → **1 match**
- [x] `grep -n "const initView = async" src/views/SavedMatchesView.vue` → **1 match**
- [x] `package.json` version = **1.24.0**
- [x] This SUMMARY exists with scope-pivot narrative, honest requirements table, tech debt log, lessons, commit list
- [ ] **Manual dev smoke (user action required before merging develop → main):**
  - [ ] Login → `/saved-matches` → spinner shows → matches render
  - [ ] Recalculate → progress indicator → matches update
  - [ ] Save a match → appears in Saved tab
  - [ ] Discard a match → removes; does NOT reappear on recalc
  - [ ] Navigate with `?match=xyz` query → scroll lands on the match
  - [ ] `/dashboard` → redirects to `/saved-matches`

---

## Phase 02 status: **COMPLETE** pending user dev-smoke and production merge

Next action per CLAUDE.md "Dev-First Development": push `develop`, verify on `cranial-trading-dev.web.app`, then user explicitly approves merge to `main`.
