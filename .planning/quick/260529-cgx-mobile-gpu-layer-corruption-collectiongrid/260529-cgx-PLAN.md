---
quick_id: 260529-cgx
slug: mobile-gpu-layer-corruption-collectiongrid
date: 2026-05-29
status: complete
---

# Quick Task 260529-cgx: Fix mobile GPU layer corruption in CollectionGrid (Visual mode)

## Problem

On Android (Chrome), the Collection grid in **Visual** mode shows a band of corrupted/torn
pixels (horizontal noise stripes) between the filter bar and the cards. User-reported with a
screenshot at `public/cranialBugColl.jpeg`.

Observed signals (from user):
- Moves with scroll / appears at different vertical positions ("se rompe más abajo, se scrollea")
- Present from initial load (50 cards already render a ~15,500px container in Visual mode)
- Only in Visual mode (rows estimated at 620px → tallest virtual container; Texto/compact is ~300px)

## Root cause

`CollectionGrid.vue` virtualizes rows via `@tanstack/vue-virtual` (window virtualizer). Each
virtual row was absolutely positioned with `transform: translateY(${vRow.start}px)`. On
Android, `transform` promotes **each row to its own GPU composite layer**. Stacked inside a
`position: relative` container of tens of thousands of px (grows as pages load: 50→100→150
cards), the browser tiles those layers past the GPU max texture/layer size, rendering garbage
stripes.

## Fix

Single style change in `src/components/collection/CollectionGrid.vue` — position rows with
`top: ${vRow.start}px` instead of `transform: translateY(...)`. Geometrically identical offset,
but no per-row GPU layer promotion, so rows paint on the main layer without corruption.

```diff
  :style="{
    position: 'absolute',
-   top: 0,
+   top: `${vRow.start}px`,
    left: 0,
    width: '100%',
-   transform: `translateY(${vRow.start}px)`,
  }"
```

## Scope

- Files: `src/components/collection/CollectionGrid.vue` (1 style block)
- Test type: none — pure UI/CSS, no logic (per CLAUDE.md TDD skip rule for template-only style edits)
- No change to virtualization, `measureElement`, `totalSize`, or scroll behavior

## Verification

- `npx vite build` succeeds
- Device verification pending: Rafael to confirm on his Android in local before considering done.
  Mitigator is the canonical fix for this pattern but cannot be reproduced off-device.
- Fallback plan B (if not resolved): normal-flow rows with spacer divs (no giant transformed
  container) — more invasive, deferred unless needed.
