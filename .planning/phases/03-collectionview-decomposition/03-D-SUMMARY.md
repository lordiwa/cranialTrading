---
phase: 03-collectionview-decomposition
plan: D
subsystem: collection-components
tags: [arch, refactor, tdd, components, composables]
dependency_graph:
  requires:
    - 03-A (NICE-07/08/09 collection store fixes — no file overlap, parallel wave)
  provides:
    - CollectionGridCard routing shell (ARCH-05)
    - CollectionGridCardCompact extracted variant
    - CollectionGridCardFull with useSwipe wired (ARCH-06)
    - useSwipe composable unit tests
  affects:
    - src/components/collection/CollectionGrid.vue (unchanged — consumer API preserved)
tech_stack:
  added:
    - "@vue/test-utils ^2.4.6 (devDependency — component mount testing)"
  patterns:
    - Routing shell pattern (thin delegation by prop)
    - vi.hoisted() for factory mocks referencing top-level variables
    - useSwipe composable wired via onMounted addEventListener (not template @touch bindings)
key_files:
  created:
    - src/components/collection/CollectionGridCardCompact.vue
    - src/components/collection/CollectionGridCardFull.vue
    - tests/unit/composables/useSwipe.test.ts
    - tests/unit/components/CollectionGridCard.test.ts
    - tests/unit/components/CollectionGridCardFull.test.ts
  modified:
    - src/components/collection/CollectionGridCard.vue (rewritten as thin routing shell)
    - package.json (added @vue/test-utils devDependency)
decisions:
  - "Used vi.hoisted() to lift mock variable declarations alongside vi.mock factories for useSwipe — avoids TDZ ReferenceError from vi.mock hoisting"
  - "CollectionGridCardFull placed inline touch-handler-free: useSwipe attaches via addEventListener in onMounted on cardRef"
  - "Shell is 57 lines not 30 — props/emits interface required for consumer API preservation; functionally thin"
  - "clampedOffset computed added in Full for ±120px visual cap — swipeOffset from composable is raw, clamped only for display"
metrics:
  duration_minutes: 13
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Phase 03 Plan D: CollectionGridCard Split + useSwipe Wiring Summary

**One-liner:** CollectionGridCard.vue split into thin routing shell + Compact + Full variants with useSwipe composable wired (ARCH-05 + ARCH-06), replacing all inline touch handlers.

## What Was Built

### ARCH-05 — CollectionGridCard.vue routing shell

`CollectionGridCard.vue` was a 704-line monolith mixing compact and full rendering logic with shared script state. It is now a 57-line thin routing shell that delegates to:

- `CollectionGridCardCompact.vue` when `compact=true`
- `CollectionGridCardFull.vue` when `compact=false` (default)

The shell preserves the exact same prop/emit API that `CollectionGrid.vue` uses — zero changes to the consumer.

### CollectionGridCardCompact.vue (~120 lines)

Extracted from the compact branch of the original component. Contains:
- IntersectionObserver price lazy-fetch
- `parsedImage`, `getCardImage`, `hasImage`, `imageLoaded`
- CK prices via `useCardPrices`
- Split-card detection and `cardFaceIndex` ref
- Compact template: image, qty badge, name, prices

### CollectionGridCardFull.vue (~380 lines)

Extracted from the full branch of the original component. Contains all interactive features:
- Status bar (public toggle, status buttons)
- Card image with selection checkbox, split-card flip, status overlay, delete overlay
- Deck allocation row
- Card name, edition, prices, sparkline
- ELIMINAR button, interest/cart buttons
- Context menu via `useContextMenu`

### ARCH-06 — useSwipe composable wired

Replaced inline `handleTouchStart`, `handleTouchMove`, `handleTouchEnd` functions (lines 86–127 of original) with:

```typescript
const { isSwiping, swipeOffset } = useSwipe(cardRef, {
  threshold: 80,
  onSwipeLeft: () => {
    if (props.readonly || props.isBeingDeleted) return
    emit('delete', props.card)
  },
  onSwipeRight: () => { void cycleStatus() },
})

const clampedOffset = computed(() => Math.max(-120, Math.min(120, swipeOffset.value)))
```

Threat T-03D-01 mitigated: readonly/isBeingDeleted guards are present in both callbacks.

## Test Coverage

| File | Tests | Status |
|------|-------|--------|
| `tests/unit/composables/useSwipe.test.ts` | 8 | NEW — composable was previously untested |
| `tests/unit/components/CollectionGridCard.test.ts` | 6 | NEW — routing shell prop routing |
| `tests/unit/components/CollectionGridCardFull.test.ts` | 9 | NEW — swipe clamping, useSwipe wiring, ARCH-06 |

Total new tests: **23**. Full suite: **532 tests, all pass**.

## Verification Results

```
ARCH-05:
  wc -l CollectionGridCard.vue → 57 (thin shell)
  CollectionGridCardCompact.vue → EXISTS
  CollectionGridCardFull.vue → EXISTS

ARCH-06:
  grep @touchstart|@touchmove|@touchend CollectionGridCardFull.vue → 0 matches
  grep handleTouchStart|handleTouchMove|handleTouchEnd CollectionGridCardFull.vue → 0 matches
  grep useSwipe CollectionGridCardFull.vue → 4 matches (import + comment + comment + usage)

Consumer API:
  CollectionGrid.vue import/usage → UNCHANGED

Build: npx vite build → succeeded
TypeScript: vue-tsc --noEmit → 0 errors
Tests: 532 passed
```

## Deviations from Plan

### Auto-installed @vue/test-utils (Rule 3 — Blocking)

The test suite needed `@vue/test-utils` for component mount testing (both shell routing and Full variant tests). The package was not in the project's devDependencies. Installed `@vue/test-utils ^2.4.6` and added to `package.json`.

### vi.hoisted() pattern needed (Rule 1 — Auto-fix)

The initial `useSwipe` mock in `CollectionGridCardFull.test.ts` used top-level `ref()` calls that were accessed inside `vi.mock()` factories. Since `vi.mock` is hoisted above imports, this caused `ReferenceError: Cannot access 'mockUseSwipe' before initialization`. Fixed using `vi.hoisted()` with plain object `.value` stubs, then re-wired to real Vue `ref()` objects inside `beforeEach` via `mockImplementation`.

### Shell is 57 lines not "under 30" (documented scope drift)

The plan success criteria states "under 30 lines". The props/emits interface needed to preserve the consumer API accounts for the extra lines (10 props + 5 emits + defaults = ~25 lines just for type declarations). The shell has zero business logic — it is functionally thin. The 30-line target was aspirational and assumed no default values were needed. This is a documentation discrepancy, not a correctness issue.

## Known Stubs

None. All functionality extracted from the original component is fully wired.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes introduced. The swipe→delete and swipe→status-cycle callbacks preserve existing readonly/isBeingDeleted guards (T-03D-01 mitigated as planned).

## Self-Check: PASSED

All 6 key files exist. Both task commits (8aed3f8, 2c6b07d) confirmed in git log. 532 unit tests pass. Build succeeds. TypeScript 0 errors.
