---
phase: quick-260418-pzu
plan: 01
subsystem: decks
tags: [mana-curve, deck-stats, hypergeometric, scryfall, i18n, a11y]
requires: []
provides:
  - src/utils/manaCurve.ts (buildManaCurve, hypergeomAtLeast, logFactorial)
  - src/services/manaCurveLands.ts (detectEtbTappedLands, isEtbTappedOracle, __resetTappedLandsCache)
  - src/components/decks/DeckManaCurve.vue (inline bar chart + probability overlay + tapped-land banner)
  - decks.manaCurve.* i18n keys in en/es/pt (10 keys each)
affects:
  - src/views/DeckView.vue (mounts DeckManaCurve after editor grids)
tech-stack:
  added: []
  patterns:
    - "module-level memoized logFactorial cache (stable up to n >= 260)"
    - "hypergeometric P(X >= k) via log-binomial sum to avoid factorial overflow"
    - "session cache keyed by scryfallId for tapped-land detection (partition cached/unknown, only fetch unknown)"
    - "watch(..., { immediate: true }) instead of async onMounted (anti-loop rule)"
files-created:
  - src/utils/manaCurve.ts
  - tests/unit/utils/manaCurve.test.ts
  - src/services/manaCurveLands.ts
  - tests/unit/services/manaCurveLands.test.ts
  - src/components/decks/DeckManaCurve.vue
files-modified:
  - src/views/DeckView.vue
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/pt.json
key-decisions:
  - "Corrected plan's reference probability values (0.9637, 0.6447) to the mathematically correct standard hypergeometric values (0.9784, 0.7887) — the plan's own formula description produces the corrected values; the original numbers came from a Karsten-style mulligan-adjusted model."
  - "Used tests/unit/utils/manaCurve.test.ts (.test.ts) instead of the plan's .spec.ts — vitest.config.ts restricts the unit project to `tests/unit/**/*.test.ts`."
metrics:
  duration: "~35 min"
  completed: "2026-04-18"
  new-tests: 37
  total-tests: 753
  commits: 3
---

# Quick Task 260418-pzu: Mana Curve per Deck with Hypergeometric — Summary

Inline mana-curve bar chart for DeckView powered by standard hypergeometric probability and Scryfall-backed ETB-tapped land detection. Addresses SCRUM-10.

## Commits

| Hash | Message |
|------|---------|
| `62f2918` | feat(manaCurve): add pure hypergeometric math + curve builder util |
| `e759587` | feat(manaCurve): add Scryfall ETB-tapped land detection service |
| `670b47d` | feat(manaCurve): DeckManaCurve component + DeckView integration + i18n |

## Files

**Created:**
- `src/utils/manaCurve.ts` — pure hypergeometric math (`logFactorial`, `hypergeomAtLeast`) + curve builder (`buildManaCurve`). No Vue / no Firebase / no network imports.
- `tests/unit/utils/manaCurve.test.ts` — 20 tests locking probability values, empty-state, no-gap buckets, land detection, CMC 0 guard, factorial-overflow stress test.
- `src/services/manaCurveLands.ts` — Scryfall-backed `detectEtbTappedLands(ids)` with module-level session cache and regex heuristic `isEtbTappedOracle(text)`.
- `tests/unit/services/manaCurveLands.test.ts` — 17 tests covering Guildgate true / Glacial Fortress (checkland) false / cache behavior / dedup / empty short-circuit / fetch-error zero-state.
- `src/components/decks/DeckManaCurve.vue` — inline bar chart + per-bucket probability labels + ETB-tapped warning banner.

**Modified:**
- `src/views/DeckView.vue` — imported component, added `manaCurveDeckSize` computed, mounted `<DeckManaCurve>` after the editor grids and empty-deck state (inside `AppContainer`, BEFORE the teleported `DeckStatsFooter`).
- `src/locales/en.json`, `src/locales/es.json`, `src/locales/pt.json` — `decks.manaCurve.*` namespace added atomically (10 keys each).

## Test Results

- **Per-task**:
  - Task 1 (`manaCurve`): 20/20 tests green.
  - Task 2 (`manaCurveLands`): 17/17 tests green (one expected `console.warn` on the deliberate fetch-error test).
- **Full suite**: `npm run test:unit` — **51 files, 753 tests, all passing** (baseline before task: 49/716; +37 new tests).
- **Regressions**: none.

## Type-check

`npx vue-tsc --noEmit` — clean, no new errors on any touched file.

## Build

`npx vite build` — succeeded in ~13.7s. DeckView chunk is now 42.91 kB (gzip 12.95 kB). No new errors.

## i18n Coverage

All 10 `decks.manaCurve.*` keys present in `en.json`, `es.json`, and `pt.json` with matching key sets (parity verified programmatically via `Object.keys().sort()` equality). Anti-loop Rule 6 respected — all 3 locale edits landed in the same commit (`670b47d`).

Keys added:
- `decks.manaCurve.title`
- `decks.manaCurve.cards`
- `decks.manaCurve.onPlay`
- `decks.manaCurve.onDraw`
- `decks.manaCurve.landsLabel`
- `decks.manaCurve.tappedWarning` (with `{count}` interpolation)
- `decks.manaCurve.tappedWarningHelp`
- `decks.manaCurve.noLands`
- `decks.manaCurve.detecting`
- `decks.manaCurve.probabilityLabel` (with `{k}` interpolation)

## Deviations from Plan

### 1. [Rule 1 - Bug] Plan's reference probability values corrected

**Found during:** Task 1 RED → first GREEN attempt.

**Issue:** The plan's test-case truth values (`hypergeomAtLeast(60, 24, 9, 3) ≈ 0.6447`, `hypergeomAtLeast(60, 24, 7, 1) ≈ 0.9637`) are inconsistent with the plan's own implementation description (standard hypergeometric via `logC(L, i) + logC(N-L, n-i) - logC(N, n)` summed over `i = k..min(n, L)`).

Standard hypergeometric P(X ≥ 1 | N=60, L=24, n=7) = `1 - C(36,7)/C(60,7)` = `1 - 8,347,680/386,206,920` = **0.9784**, not 0.9637.
Standard hypergeometric P(X ≥ 3 | N=60, L=24, n=9) = **0.7887**, not 0.6447.

The plan's numbers look like Frank Karsten's mulligan-adjusted tables (Karsten's method assumes the player mulligans poor hands — a different probability model than plain hypergeometric).

**Fix:** Kept the mathematically correct standard-hypergeometric formula exactly as described in the plan's implementation hints, and updated the test expected values to the values the formula actually produces (0.9784, 0.7887). Added an inline comment in the test file documenting the discrepancy.

**Files modified:** `tests/unit/utils/manaCurve.test.ts`.
**Commit:** `62f2918`.

### 2. [Rule 3 - Blocker] Test file uses `.test.ts`, not `.spec.ts`

**Found during:** Task 1 RED phase, running vitest.

**Issue:** The plan names test files `manaCurve.spec.ts` / `manaCurveLands.spec.ts`, but `vitest.config.ts` scopes the unit project to `include: ['tests/unit/**/*.test.ts']`. Files matching `.spec.ts` are NOT picked up — the tests would silently never run.

**Fix:** Renamed to `tests/unit/utils/manaCurve.test.ts` and `tests/unit/services/manaCurveLands.test.ts` to match the project convention. All other existing unit tests in the repo follow this pattern.

**Files modified:** test file names only.
**Commits:** `62f2918`, `e759587`.

### 3. [Minor] Added `__resetTappedLandsCache()` export for tests

The module-level `sessionCache` needs to be reset between test cases (otherwise the "does not re-fetch" and fresh-error tests contaminate each other). Added a test-only `__resetTappedLandsCache()` export. Runtime code never calls it.

**Commit:** `e759587`.

_No other deviations — locked decisions (sideboard excluded, no BinderView curve, inline mount before teleported footer, no async onMounted) all respected._

## Manual Verification Checklist (copied verbatim from Task 3 Part E)

Rafael, please run `npm run dev` and step through this list:

1. Open DeckView with a 60-card deck with ~24 lands; confirm bar chart renders with bars from CMC 0 through max CMC, counts match expectations, on-play/on-draw percentages appear under each bar for CMC ≥ 1 and CMC 0 shows 100%.
2. Add a Guildgate (or any ETB-tapped land) to the deck; confirm the "X tierras ETB tapped detectadas" banner appears after the Scryfall fetch resolves.
3. Add a Glacial Fortress (checkland) — confirm it is NOT counted as ETB tapped.
4. Empty deck → no curve shown (v-if gate).
5. Sideboard cards do NOT affect the curve (add sideboard cards, watch curve unchanged).
6. Wishlist cards DO affect the curve.
7. Commander card IS in its CMC bucket.
8. Switch language to es/pt and confirm all labels translate.
9. Confirm the curve does NOT overlap DeckStatsFooter on mobile (scroll to the bottom; footer remains fixed while curve scrolls naturally above it).

Additional spot-checks (from Task 4 of the plan):
- On-play at CMC 3 for a 60/24 deck should be ~79% (was ~64% in the plan — see Deviation 1 above; the 79% figure is the correct standard-hypergeometric value).
- On mobile viewport, confirm the curve scrolls naturally while the `DeckStatsFooter` remains fixed at the bottom — no overlap.

## Next Steps

After user types "approved" (or reports issues):
1. Bump version: `npm version minor --no-git-tag-version` (new feature surface).
2. Commit the version bump.
3. Push to `develop` to auto-deploy to `cranial-trading-dev.web.app`.
4. Verify on the dev environment (Rafael's call on production promotion).

## Self-Check: PASSED

- [x] `src/utils/manaCurve.ts` exists — verified.
- [x] `src/services/manaCurveLands.ts` exists — verified.
- [x] `src/components/decks/DeckManaCurve.vue` exists — verified.
- [x] `tests/unit/utils/manaCurve.test.ts` exists (20 tests green) — verified.
- [x] `tests/unit/services/manaCurveLands.test.ts` exists (17 tests green) — verified.
- [x] Commit `62f2918` present in git log — verified.
- [x] Commit `e759587` present in git log — verified.
- [x] Commit `670b47d` present in git log — verified.
- [x] 10 `decks.manaCurve.*` keys present in en.json, es.json, pt.json with identical key sets — verified programmatically.
- [x] `DeckManaCurve` imported + mounted in `src/views/DeckView.vue` — verified.
- [x] `npm run test:unit` full suite: 753/753 green — verified.
- [x] `npx vite build` succeeds — verified.
- [x] `npx vue-tsc --noEmit` clean — verified.
