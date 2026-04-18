---
phase: 04-globalsearch-navigation-polish
plan: "01"
subsystem: composables
tags:
  - accessibility
  - aria-combobox
  - keyboard-navigation
  - live-region
  - tdd
dependency_graph:
  requires: []
  provides:
    - useGlobalSearch.highlightedIndex
    - useGlobalSearch.activeDescendantId
    - useGlobalSearch.ariaLiveMessage
    - useGlobalSearch.isExpanded
    - useGlobalSearch.moveHighlight
    - useGlobalSearch.selectHighlighted
    - useGlobalSearch.scheduleLiveRegionUpdate
    - useGlobalSearch.resolveCollectionRoute
    - useGlobalSearch.resolveUserRoute
    - useGlobalSearch.resolveScryfallRoute
  affects:
    - src/components/ui/GlobalSearch.vue (Plan 04-02 consumer)
    - src/components/ui/MobileSearchOverlay.vue (Plan 04-02 consumer)
tech_stack:
  added: []
  patterns:
    - "Two-key pluralization ternary (no tc() — custom useI18n has no pluralization engine)"
    - "setTimeout + clearTimeout debounce pattern (matches existing searchTimeout pattern)"
    - "aria-activedescendant on input — focus stays on input, options never receive DOM focus"
    - "Route resolver pattern — returns descriptor object for RouterLink :to= binding"
key_files:
  created:
    - tests/unit/composables/useGlobalSearch.test.ts
  modified:
    - src/composables/useGlobalSearch.ts
decisions:
  - "D-02: Arrow keys wrap at ends (down on last → first, up on first → last); Home/End jump to first/last"
  - "D-05: aria-activedescendant on input; options never receive DOM focus"
  - "D-09 corrected: No @click.prevent on RouterLink — sets defaultPrevented=true, breaks guardEvent navigation"
  - "D-19 corrected: Two separate keys + ternary for singular/plural (no tc(), no pipe syntax)"
  - "D-21: resolveCollectionRoute/resolveUserRoute/resolveScryfallRoute return route descriptors for :to= binding"
  - "Debounce: 500ms for live-region count; immediate (no debounce) for 'searching' message"
  - "getActiveResults() placed before performSearch to avoid const TDZ reference error"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-18T04:08:30Z"
  tasks_completed: 3
  files_changed: 2
  tests_added: 31
  tests_total_after: 716
---

# Phase 04 Plan 01: Composable Keyboard Nav + Live Region + Route Resolvers Summary

**One-liner:** Extended `useGlobalSearch` with WAI-ARIA combobox keyboard navigation state, 500ms debounced live-region announcement, and route-resolver helpers for RouterLink `:to=` bindings — all TDD-first with 31 unit tests covering wrap logic, debounce coalescing, and route shape correctness.

## What Was Built

### New exports added to `useGlobalSearch.ts`

| Export | Type | Purpose |
|--------|------|---------|
| `highlightedIndex` | `Ref<number>` | Current highlighted option index (-1 = none) |
| `activeDescendantId` | `Ref<string \| null>` | ID for `aria-activedescendant` on input (`option-{tab}-{index}`) |
| `ariaLiveMessage` | `Ref<string>` | Debounced message for `aria-live="polite"` span |
| `isExpanded` | `ComputedRef<boolean>` | `isOpen && (loading \|\| totalResults > 0)` — matches popup render condition |
| `moveHighlight` | `(direction) => void` | Arrow/Home/End navigation with wrap-at-ends |
| `selectHighlighted` | `() => void` | Enter key handler — no-highlight → `/search?q`; valid → existing `goTo*` |
| `scheduleLiveRegionUpdate` | `(message) => void` | Clears prior timeout, fires 500ms later |
| `resolveCollectionRoute` | `(card: Card) => RouteLocation` | `{ path: '/collection', query: { search: card.name } }` |
| `resolveUserRoute` | `(card: PublicCardResult) => string` | `` `/@${card.username}` `` |
| `resolveScryfallRoute` | `(card: ScryfallCard) => RouteLocation` | `{ path: '/collection', query: { addCard: card.name } }` |

### Key implementation details

- `getActiveResults()` helper placed before `performSearch` to avoid `const` temporal dead zone reference error — `performSearch` calls it in its `finally` block.
- `ariaLiveMessage.value = t('header.search.searching')` fires synchronously at the top of `performSearch` (before `loading.value = true`) — immediate feedback per D-13.
- `scheduleLiveRegionUpdate(countMessage)` fires in the `finally` block after `loading.value = false` — avoids Pitfall 4 (announcing before results render).
- `watch(activeTab, ...)` resets `highlightedIndex` and `activeDescendantId` to prevent stale `aria-activedescendant` pointing to non-existent option after tab switch (Pitfall 6).
- Two-key pattern: `count === 1 ? 'header.search.resultsCountSingular' : 'header.search.resultsCount'` — no `tc()` or pipe syntax since this project's `useI18n.ts` has no pluralization engine (D-19 corrected).
- No `@click.prevent` anywhere in the composable — documented in a code comment why it must not be used on RouterLink (D-09 corrected).

## Test Coverage

**File:** `tests/unit/composables/useGlobalSearch.test.ts`

| Describe block | Tests | Key assertions |
|----------------|-------|----------------|
| `moveHighlight` | 9 | down wrap, up wrap, home, end, empty no-op, single-item no-op, activeDescendantId format |
| `activeTab watcher` | 2 | highlightedIndex reset, activeDescendantId reset |
| `isExpanded` | 4 | false when closed, true+loading, true+results, false when open+empty |
| `selectHighlighted` | 5 | no-highlight → /search, out-of-bounds → /search, collection tab, users tab, scryfall tab |
| `route resolvers` | 3 | resolveCollectionRoute shape, resolveUserRoute string, resolveScryfallRoute shape |
| `scheduleLiveRegionUpdate` | 4 | no sync update, 500ms fires, coalesce rapid calls, clears previous timeout |
| `activeTab watcher (extended)` | 2 | plural count key, singular count key |
| `performSearch loading announcement` | 2 | immediate 'searching' message, count after finally |

**Total: 31 tests — all pass**

Coverage on `useGlobalSearch.ts`: 65.51% statements (uncovered: pre-existing `sendInterestFromSearch` Firebase logic — out of plan scope).

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `2e59922` | `test(04-01)` | Add failing tests — RED phase (31 tests across all 8 describe blocks) |
| `30e448e` | `feat(04-01)` | Implement moveHighlight, selectHighlighted, route resolvers, live-region debounce — GREEN phase |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Ordering] `getActiveResults` / `ariaLiveMessage` declared after `performSearch`**
- **Found during:** GREEN phase implementation
- **Issue:** The plan's pseudocode placed all new state after `performSearch`, but `const` declarations have a temporal dead zone — calling `ariaLiveMessage.value` or `getActiveResults()` inside `performSearch` at runtime would throw `ReferenceError`.
- **Fix:** Moved `highlightedIndex`, `activeDescendantId`, `ariaLiveMessage`, `liveRegionTimeout`, `isExpanded`, `getActiveResults`, and `scheduleLiveRegionUpdate` to before `performSearch` and moved `totalResults` computed to the top (it's used by `isExpanded`).
- **Files modified:** `src/composables/useGlobalSearch.ts`
- **Commit:** `30e448e`

### Out-of-scope notes

- `@click.prevent` grep returns 1 match — the match is a code comment (`// Do NOT use @click.prevent on RouterLink`) documenting the anti-pattern. No actual `@click.prevent` usage in the composable.
- `moveHighlight` has 2 grep matches (declaration + return export); the plan says "at least 3 (possibly internal)" — there are no internal call sites in the composable because the function is called from templates/keydown handlers, not internally. Acceptance criteria met.

## Known Stubs

None. All exported functions return concrete values. The i18n keys (`header.search.searching`, `header.search.resultsCount`, `header.search.resultsCountSingular`, `header.search.tabNames.*`) are referenced but not yet added to the locale files — this is intentional scope: Plan 04-03 adds the i18n keys with all three locale files (per the plan split). The tests mock `t()` to return the key string, so tests pass without real locale entries.

## Threat Flags

None. All security-relevant surfaces in this plan were analyzed in the threat model:
- T-04-01-01: `router.push({ query })` URL-encodes user input automatically — accepted
- T-04-01-02: `ariaLiveMessage` contains only i18n strings and counts — accepted
- T-04-01-03: `scheduleLiveRegionUpdate` — mitigated by clearTimeout on re-entry (verified by debounce tests)
- T-04-01-04: `resolveCollectionRoute` query values — accepted (Vue Router encodes)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `tests/unit/composables/useGlobalSearch.test.ts` exists | FOUND |
| `src/composables/useGlobalSearch.ts` exists | FOUND |
| `.planning/phases/04-globalsearch-navigation-polish/04-01-SUMMARY.md` exists | FOUND |
| Commit `2e59922` (RED phase) exists | FOUND |
| Commit `30e448e` (GREEN phase) exists | FOUND |
| `npm run test:unit` — 716 tests pass | PASSED |
| `npx vite build` — exits 0 | PASSED |
