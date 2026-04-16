---
phase: 03-collectionview-decomposition
plan: B
subsystem: collection-view
tags: [composable-extraction, tdd, url-sync, pagination, state-machine, localStorage]
dependency_graph:
  requires:
    - 03-A (collectionFilters.ts + importHelpers.ts pure utils)
  provides:
    - useCollectionImport (import state machine, localStorage, all handleImport* entry points)
    - useDeckDeletion (delete-deck state machine, localStorage, QuotaExceededError recovery)
    - useCollectionFilterUrl (bidirectional URL filter/sort sync — NICE-10 delivered)
    - useCollectionPagination (debounced server-side pagination watcher)
  affects:
    - CollectionView.vue (dramatically reduced, 4579 → 3178 lines total after Plans A+B)
tech_stack:
  added:
    - useCollectionImport composable (module-scoped isImportRunning flag, localStorage state machine)
    - useDeckDeletion composable (module-scoped isDeleteRunning flag, QuotaExceededError recovery)
    - useCollectionFilterUrl composable (isHydrating guard, router.replace, URL validation)
    - useCollectionPagination composable (flush:sync watcher, debounce 300ms, onScopeDispose)
  patterns:
    - Module-scoped flags (let isImportRunning/isDeleteRunning) for singleton behavior across remounts
    - isHydrating guard pattern to prevent URL-state ping-pong
    - flush:'sync' on debounced watchers for testability with vi.useFakeTimers
    - onScopeDispose for timer cleanup (replaces onUnmounted in composables)
key_files:
  created:
    - src/composables/useCollectionImport.ts
    - src/composables/useDeckDeletion.ts
    - src/composables/useCollectionFilterUrl.ts
    - src/composables/useCollectionPagination.ts
    - tests/unit/composables/useCollectionImport.test.ts
    - tests/unit/composables/useDeckDeletion.test.ts
    - tests/unit/composables/useCollectionFilterUrl.test.ts
    - tests/unit/composables/useCollectionPagination.test.ts
  modified:
    - src/views/CollectionView.vue (wired all 4 composables, ~1400 lines removed)
decisions:
  - "Used flush:'sync' on useCollectionPagination watcher so vi.useFakeTimers() debounce tests work without nextTick"
  - "Kept ?filter=wishlist reactive watcher in CollectionView (has scroll + viewMode side effects not in composable); composable absorbs initial URL hydration only"
  - "useCollectionFilterUrl's isHydrating guard uses Promise.resolve().then() to release after microtask tick — prevents sync watcher from writing to URL during hydration"
  - "QuotaExceededError recovery in useDeckDeletion preserved verbatim from original CollectionView lines"
  - "buildPaginationFilters/buildPaginationSort wrapper functions removed from CollectionView — pagination composable calls utils directly"
metrics:
  duration: "~70 minutes (two context windows)"
  completed: "2026-04-15"
  tasks_completed: 2
  tests_added: 29
  files_created: 8
  files_modified: 1
  lines_removed_from_collectionview: "~1400 (4579 original → 3178 after Plans A+B)"
---

# Phase 03 Plan B: CollectionView Composable Extraction (Import + Delete + URL Sync + Pagination) Summary

Extracted four composables from CollectionView.vue using TDD: import state machine (`useCollectionImport`), delete-deck state machine (`useDeckDeletion`), bidirectional URL filter sync (`useCollectionFilterUrl`, NICE-10), and debounced pagination watcher (`useCollectionPagination`). Each composable is independently testable with 29 new unit tests.

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | Extract useCollectionImport + useDeckDeletion with TDD | `75f66df` | 15/15 pass |
| 2 | Extract useCollectionFilterUrl + useCollectionPagination with TDD (NICE-10) | `9742e69` | 14/14 pass (+ 603 pre-existing) |

## What Was Built

### useCollectionImport (`src/composables/useCollectionImport.ts`)
- Module-scoped `let isImportRunning = false` (singleton across component remounts — D-05)
- localStorage key `cranial_deck_import_progress` (byte-identical to original)
- Import state machine: idle → fetching → processing → saving → allocating → complete/error
- Entry points: `handleImport`, `handleImportDirect`, `handleImportCsv`, `handleImportBinder`, `handleImportBinderDirect`, `handleImportBinderCsv`
- `resumeImport` picks up from saved state on page reload
- `saveImportState` strips card arrays (too large for localStorage) before persisting
- Accepts opts: `{ collectionStore, decksStore, binderStore, toastStore, confirmStore, t, deckFilter, binderFilter, statusFilter, viewMode, showImportDeckModal, showImportBinderModal }`

### useDeckDeletion (`src/composables/useDeckDeletion.ts`)
- Module-scoped `let isDeleteRunning = false` (singleton — D-05)
- localStorage key `cranial_delete_deck_progress` (byte-identical to original)
- Delete-deck state machine: idle → deleting_cards → deleting_deck → complete/error
- QuotaExceededError recovery: clears import localStorage key, then retries; falls back to stripping cardIds
- `resumeDeleteDeck` handles backwards-compat missing `cardIds` field
- `handleDeleteDeck` shows two confirm modals before proceeding

### useCollectionFilterUrl (`src/composables/useCollectionFilterUrl.ts`)
- Bidirectional: hydrates filter state from URL on creation, updates URL via `router.replace` on state changes
- `isHydrating` guard prevents ping-pong between state watchers and route watchers (RESEARCH.md pitfall #3)
- Validates `?status=` against known enum values — invalid falls back to `'all'` (T-03B-01)
- Default values omitted from URL: `status=all` → no `?status=`, `sort=recent` → no `?sort=`
- URL schema: `?q=`, `?status=`, `?sort=`, `?colors=W,U`, `?types=creature`, `?rarity=rare`, `?mv=0,1`, `?foil=foil`
- Absorbs `?filter=wishlist` initial hydration

### useCollectionPagination (`src/composables/useCollectionPagination.ts`)
- Debounced watcher (300ms) on all filter state refs → calls `collectionStore.queryPage`
- `flush: 'sync'` so watcher fires synchronously when a ref changes (required for `vi.useFakeTimers()` debounce tests)
- `onScopeDispose` cleanup (vs. `onUnmounted` — composables use scope disposal)
- Exposes `triggerQuery()` for initial mount call
- Optional `viewMode` ref guard — only fires when `viewMode === 'collection'`

### CollectionView.vue changes
- Added imports for all 4 composables
- Wired `useCollectionFilterUrl` after `useCardFilter` (needs filterQuery, sortBy, etc.)
- Wired `useCollectionPagination` with full filterState object including advPriceMin/Max, advSelectedSets
- Removed inline debounced watcher (~52 lines: wrapper functions + watch block + onUnmounted cleanup)
- Replaced `collectionStore.queryPage(buildPaginationFilters(), buildPaginationSort())` in `onMounted` with `triggerPaginationQuery()`
- Removed now-unused `buildPaginationFilters as _buildPaginationFilters` import

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useCollectionPagination debounce tests failed with async Vue watcher**
- **Found during:** Task 2 GREEN phase
- **Issue:** Vue watchers default to `flush: 'pre'` (batched on microtask queue). Tests using `vi.useFakeTimers()` + `vi.advanceTimersByTime(300)` never saw the watcher fire because Vue's internal scheduler hadn't flushed
- **Fix:** Added `flush: 'sync'` to the watcher so ref mutations trigger the debounce callback synchronously
- **Files modified:** `src/composables/useCollectionPagination.ts`
- **Commit:** `9742e69`

**2. [Rule 2 - Scope] ?filter=wishlist watcher kept in CollectionView**
- **Found during:** Task 2 GREEN phase
- **Issue:** The plan says to absorb the `?filter=wishlist` watcher into `useCollectionFilterUrl`. The original watcher also sets `viewMode.value = 'collection'` and scrolls to the wishlist section — behavior the composable doesn't expose. Removing the watcher would lose scroll behavior
- **Fix:** The composable absorbs the initial URL hydration case (`hydrateFromUrl` checks `query.filter === 'wishlist'`). The reactive watcher with scroll remains in CollectionView. The plan's key_invariants state the watcher "must coexist with the new URL-sync composable OR be absorbed by it" — coexistence chosen
- **Files modified:** None (kept existing watcher)

## Known Stubs

None — all four composables are fully wired and functional.

## Threat Flags

None — all threat model items from the plan were addressed:
- T-03B-01 (URL param validation): `useCollectionFilterUrl` validates `?status=` against `VALID_STATUS_VALUES`
- T-03B-02 (localStorage corruption): existing try/catch + JSON.parse fallback preserved
- T-03B-03 (URL sync ping-pong): `isHydrating` guard prevents re-entry
- T-03B-04 (filter state in URL): accepted — user's own data, requiresAuth route

## Self-Check: PASSED

All 8 created files verified present via Read tool.
Commits 75f66df and 9742e69 confirmed in git log during session.
617/617 unit tests pass. `npx vite build` succeeds (13.74s).
