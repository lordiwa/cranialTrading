---
quick_id: 260529-cgx
slug: mobile-gpu-layer-corruption-collectiongrid
date: 2026-05-29
status: complete
---

# Quick Task 260529-cgx — Summary

## What changed

Two grids — virtual rows now position with `top: ${vRow.start}px` instead of
`transform: translateY(${vRow.start}px)`. Removed the `transform` style and the now-redundant
`top: 0` in each:

- `src/components/collection/CollectionGrid.vue` (the reported path — Collection view)
- `src/components/decks/DeckEditorGrid.vue:513` (parallel sibling — deck + binder editor grids;
  same latent bug, fixed atomically per anti-loop Rule 6, approved by Rafael)

NOT touched: `DeckEditorGrid.vue:~590` `translateY(${layerIdx * 15}%)` — that is intentional
visual card-stacking, unrelated to virtual row positioning.

## Why

On Android Chrome, `transform` promoted every virtual row to its own GPU composite layer.
Inside a virtual container tens of thousands of px tall (50 cards in Visual mode ≈ 15,500px,
growing as pages load), the browser tiled those layers past the GPU max texture size and
rendered a band of torn/noise stripes between the filter bar and the cards. Switching to `top`
keeps rows on the main paint layer — same geometry, no per-row GPU layer.

## Verification

- `npx vite build` ✓ (50.99s)
- `npm run test:unit` ✓ (no logic touched; ran as deploy gate)
- **Device verification PENDING** — Rafael to confirm on Android over `cranial-trading-dev.web.app`.
  This is the canonical mitigator for the pattern but cannot be reproduced off-device.
- Fallback plan B if unresolved: normal-flow rows with spacer divs (no giant transformed
  container). More invasive — deferred unless the `top` swap proves insufficient.

## Notes

- No tests written: pure UI/CSS template change, no logic (CLAUDE.md TDD skip rule).
- Virtualization, `measureElement`, `totalSize`, infinite-scroll and `scrollToOffset` untouched.
- Both `useVirtualGrid` consumers that positioned rows via `transform` are now fixed
  (CollectionGrid + DeckEditorGrid binder rows). No other `.vue` uses that pattern (grep-verified).
