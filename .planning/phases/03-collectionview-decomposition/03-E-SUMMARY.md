---
phase: 03-collectionview-decomposition
plan: E
subsystem: closeout
tags: [cleanup, verification, release, e2e, version-bump, docs]
dependency_graph:
  requires:
    - 03-A (NICE-07/08/09 collection-store fixes)
    - 03-B (composables: useCollectionImport, useDeckDeletion, useCollectionFilterUrl, useCollectionPagination)
    - 03-C (DeckView + BinderView route-level split, thin CollectionView, router redirects, i18n)
    - 03-D (CollectionGridCard shell + Compact + Full with useSwipe)
  provides:
    - Verified Phase 03 deliverables (all 7 requirements)
    - Version 1.23.0 tagged in package.json
    - CLAUDE.md updated for 3-view architecture
    - E2E suite adapted to the new /decks and /binders route pattern
  affects:
    - e2e/pages/decks.page.ts (goto now targets /decks directly, not /collection + tab click)
    - e2e/pages/binders.page.ts (goto now targets /binders directly, not /collection + tab click)
    - e2e/specs/smoke/navigation.spec.ts (tab-switching test uses ensureLoggedIn + expects RouterLink nav)
    - CLAUDE.md (3-view architecture section, parallelism checklist, Files Often Modified Together)
    - package.json, package-lock.json (1.22.0 → 1.23.0)
tech_stack:
  added: []
  patterns:
    - Direct-route E2E navigation (goto '/decks' instead of goto '/collection' + click tab)
    - ensureLoggedIn helper preserves mounted-view wait vs domcontentloaded + goto
key_files:
  created:
    - .planning/phases/03-collectionview-decomposition/03-E-SUMMARY.md
  modified:
    - e2e/pages/decks.page.ts
    - e2e/pages/binders.page.ts
    - e2e/specs/smoke/navigation.spec.ts
    - CLAUDE.md
    - package.json
    - package-lock.json
decisions:
  - "Did NOT attempt destructive refactors to hit line-count targets (CollectionView 1356, DeckView 1496, BinderView 791) — these deviations from D-06 are already documented as tech debt in 03-C-SUMMARY with future extraction candidates (BulkSelectionActionBar.vue, DeckStatsFooter.vue, useDeckDisplayCards.ts). Preserved Rafael's honesty requirement over artificial line-count compliance."
  - "Dead-code audit showed ZERO unused imports / orphaned refs / orphaned functions across all 3 views — every identifier is referenced in either script or template"
  - "Minor-bump (1.22.0 → 1.23.0) per plan — Phase 03 introduces new routes (/decks, /binders) + new views + new composables + new components, all additive feature surface (no breaking changes)"
  - "E2E page objects now navigate directly to /decks and /binders instead of /collection + tab click. The old pattern still works (CollectionView has RouterLinks), but direct navigation is faster and clearer — and matches the Phase 03 architecture"
  - "smoke/navigation.spec.ts 'tab switching' test was pre-existing flaky on domcontentloaded (page not fully mounted before assertion). Phase 03's additional store init (loads 3 stores via Promise.all) made it more deterministic-fail. Fixed by using ensureLoggedIn + 15s timeout + RouterLink URL assertion."
  - "Task 2 (user verification on cranial-trading-dev.web.app) is PENDING — user must manually verify before merging to main for production"
metrics:
  duration_minutes: ~45
  completed_date: "2026-04-16"
  tasks_completed: 1
  tasks_pending: 1
  commits: 3
  version_before: "1.22.0"
  version_after: "1.23.0"
  unit_tests_passed: 640
  e2e_tests_passed: 54
  e2e_tests_run_scope: "decks + binders + smoke + collection + contacts + matches"
---

# Phase 03 Plan E: Closeout — Final Cleanup, E2E Adaptation, Version Bump Summary

**One-liner:** Closeout plan E verified Phase 03 deliverables, adapted E2E tests to the new /decks and /binders route pattern, updated CLAUDE.md for the 3-view architecture, and bumped version to 1.23.0. User verification on dev environment remains pending.

## What Was Done

### Task 1 — Dead code audit, line count verification, E2E adaptation, version bump

#### 1. Dead Code Audit

Read `CollectionView.vue`, `DeckView.vue`, `BinderView.vue` in full. Traced every import, `ref`, `computed`, and method:

- **CollectionView.vue (1356 lines):** All imports referenced in script/template. All refs + computeds + methods consumed. Zero orphans.
- **DeckView.vue (1496 lines):** All imports referenced. All deck-specific state + handlers + composable destructures consumed. Zero orphans.
- **BinderView.vue (791 lines):** All imports referenced. All binder state + handlers + composable destructures consumed. Zero orphans.

`npx vue-tsc --noEmit` reported **0 errors** and **0 unused declarations**. No code was removed in this plan.

#### 2. Line Count Verification (honest — targets NOT met, deviation documented in 03-C-SUMMARY)

```
  1356 src/views/CollectionView.vue            (D-06 target: <400 ideal, <600 acceptable — MISSED)
  1496 src/views/DeckView.vue                   (D-06 target: <600 — MISSED)
   791 src/views/BinderView.vue                 (D-06 target: <400 — MISSED)
    57 src/components/collection/CollectionGridCard.vue   (target: <30 shell — 57 is functional-thin,
                                                              extra lines are props/emits API preservation)
   157 src/components/collection/CollectionGridCardCompact.vue
   630 src/components/collection/CollectionGridCardFull.vue
```

Per Plan E explicit guidance ("do NOT attempt destructive refactors to hit the line targets"), no reshuffling was performed. The structural goals of Phase 03 (D-01, D-02, D-03, D-12 — viewMode elimination, route-level split, parallel-sibling elimination, direct linkability) are all delivered; the intrinsic template weight (bulk-selection action bar, deck stats footer, deck editor grid wiring) is what pushes line counts up. Future extraction candidates were already identified in 03-C-SUMMARY (`BulkSelectionActionBar.vue`, `DeckStatsFooter.vue`, `useDeckDisplayCards.ts`).

#### 3. Requirements Verification Grep Checklist

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `grep -c viewMode src/views/CollectionView.vue` | 0 | **0** | PASS (D-03) |
| `grep -c "handleDeckGrid\|handleBinderGrid" src/views/CollectionView.vue` | 0 | **0** | PASS (D-12) |
| `grep -c useCollectionFilterUrl src/views/CollectionView.vue` | >=1 | **2** | PASS (NICE-10) |
| `grep -c useSwipe src/components/collection/CollectionGridCardFull.vue` | >=1 | **4** | PASS (ARCH-06) |
| `grep -c "@touchstart\|@touchmove\|@touchend" src/components/collection/CollectionGridCardFull.vue` | 0 | **0** | PASS (ARCH-06) |
| `grep -c "let isImportRunning" src/composables/useCollectionImport.ts` | 1 | **1** | PASS (D-05) |
| `grep -c "let isDeleteRunning" src/composables/useDeckDeletion.ts` | 1 | **1** | PASS (D-05) |
| `grep "DeckView\|BinderView" src/router/index.ts` | route entries | **Line 94 DeckView, Line 100 BinderView** | PASS (D-01/D-02) |
| Full type-check (`npx vue-tsc --noEmit`) | 0 errors | **0 errors** | PASS |
| Full lint (`npm run lint`) | 0 errors | **0 errors, 42 pre-existing warnings** | PASS |
| Full build (`npx vite build`) | succeeds | **succeeded in 10.24s** | PASS |

Note on `seo.pages.decks.title` locale key: the plan's grep spec said "expect 3 files", but neither DeckView.vue nor BinderView.vue currently reference SEO keys (no `useSeoMeta` / `useHead` in those files). This is out-of-scope for Phase 03 (which is architectural, not SEO). Left as future-work for the SEO phase.

#### 4. E2E Test Adaptation

Phase 03's route-level split changed the navigation model from "goto /collection, click tab" to "goto /decks" / "goto /binders" directly. Updated three files:

- **`e2e/pages/decks.page.ts`** — `goto()` now calls `page.goto('/decks')` + `ensureLoggedIn(page, '/decks')` (was `/collection` + `deckTab.click()`)
- **`e2e/pages/binders.page.ts`** — `goto()` now calls `page.goto('/binders')` + `ensureLoggedIn(page, '/binders')` (was `/collection` + `binderTab.click()`)
- **`e2e/specs/smoke/navigation.spec.ts`** — the "tab switching renders correct content" test previously called `page.goto(ROUTES.collection)` + `waitForLoadState('domcontentloaded')` which raced against Vue mount. Rewrote to use `ensureLoggedIn(page, ROUTES.collection)` + 15s timeout + `await expect(page).toHaveURL(/\/decks/)` assertion (because deck tab is now a `<RouterLink>`, clicking it navigates to `/decks`).

**Commit:** `9f8c1a4` — `fix(03-E): update E2E tests for /decks and /binders route pattern`

#### 5. CLAUDE.md Updates

Three sections updated:

1. **Architecture → Three-View Architecture (Phase 03)** — new subsection documenting the route-level split, what each view owns, `<RouterLink>` tab navigation, legacy query-param redirect behavior, and the `CollectionGridCard` shell + `useSwipe` pattern.
2. **Files Often Modified Together** — added:
   - `DeckView.vue` ↔ `DeckEditorGrid.vue` ↔ `stores/decks.ts`
   - `BinderView.vue` ↔ `DeckEditorGrid.vue` (binder-mode) ↔ `stores/binders.ts`
   - `DeckView.vue` ↔ `BinderView.vue` ↔ `composables/useCollectionImport.ts` (shared import flow)
   - `CollectionGridCard.vue` ↔ `Compact.vue` ↔ `Full.vue` (shell + variants)
   - `CollectionView.vue` ↔ `useCollectionFilterUrl.ts` ↔ `useCollectionPagination.ts`
   - `en.json` ↔ `es.json` ↔ `pt.json` (explicit locale-parallelism reminder)
3. **Anti-Loop Rule 6 parallelism checklist** — noted deck/binder handlers now live in separate views, added `CollectionGridCardCompact.vue` ↔ `CollectionGridCardFull.vue` pair.

**Commit:** `c75659a` — `chore(03-E): update CLAUDE.md for 3-view architecture`

#### 6. Version Bump

```
1.22.0 → 1.23.0 (minor — new routes, views, components, composables; no breaking changes)
```

**Commit:** `a7b2a16` — `chore(release): bump version to 1.23.0 (Phase 03 minor)`

#### 7. Full Test Suite Results

**Unit tests (`npm run test:unit`):**
```
Test Files  45 passed (45)
     Tests  640 passed (640)
  Duration  21.32s
```

**E2E tests (`npx playwright test` — focused on Phase-03-affected suites):**
```
54 passed (9.8m)
Suites: decks + binders + smoke + collection + contacts + matches
```

**Type-check (`npx vue-tsc --noEmit`):** 0 errors
**Lint (`npm run lint`):** 0 errors, 42 pre-existing warnings (object-injection, nullish-coalescing — unrelated to Phase 03)
**Build (`npx vite build`):** succeeded in 10.24s

### Task 2 — PENDING (blocking human-verify gate)

**User verification on cranial-trading-dev.web.app is REQUIRED before merging to main.**

Per the plan's gating criteria, the user must manually verify on the dev environment:

1. Navigation between Collection, Decks, and Binders tabs works via route changes (not internal state)
2. Direct linking to `/decks/:id` and `/binders/:id` loads the correct content
3. Filter state persists in URL and survives page refresh
4. Card swipe on mobile still works (left=delete, right=cycle status)
5. Import and delete-deck operations work from DeckView
6. Binder operations work from BinderView

Changes are committed on local `develop` (4 commits ahead of origin: `9f8c1a4`, `c75659a`, `a7b2a16`, plus any pre-existing unpushed commits from Plans 03-A/B/C/D). They have NOT been pushed — the user will push and manually verify on dev before approving merge to main.

## Commits Produced in Plan E

| Hash | Subject |
|------|---------|
| `9f8c1a4` | `fix(03-E): update E2E tests for /decks and /binders route pattern` |
| `c75659a` | `chore(03-E): update CLAUDE.md for 3-view architecture` |
| `a7b2a16` | `chore(release): bump version to 1.23.0 (Phase 03 minor)` |

_04-E-SUMMARY.md itself will be committed as the 4th commit: `docs(03-E): complete plan E summary — Phase 03 closeout`._

## Deviations from Plan

### Line-count targets NOT met (D-06)

The plan success criteria listed line-count targets (CollectionView <600 ideal, DeckView <600, BinderView <400). Actual: 1356 / 1496 / 791. Per explicit Plan E guidance ("do NOT attempt destructive refactors to hit the line targets"), preserved as tech debt. The 03-C-SUMMARY already identified extraction candidates (`BulkSelectionActionBar.vue`, `DeckStatsFooter.vue`, `useDeckDisplayCards.ts`) for future phases.

### `seo.pages.decks.title` locale-key grep did not match (3 files → 0 files)

The plan's verification checklist expected this key in all 3 locale files. DeckView.vue and BinderView.vue do not currently consume any `seo.pages.*` keys (they do not call `useHead` / `useSeoMeta`). This is out-of-scope for a route-decomposition phase — SEO keys were added by 03-C to en/es/pt but aren't wired yet. Left as future-work.

### Smoke test fix was not explicitly in Plan E's scope

The `smoke/navigation.spec.ts:37-51` "tab switching" test failed on the fresh E2E pass. Per the plan's "If E2E tests are broken by route changes, fix them in your commits" directive, fixed in `9f8c1a4` alongside the decks/binders page-object updates. Root cause was a pre-existing race (domcontentloaded fires before Vue mount), made worse by Phase 03's 3-store `Promise.all` load in `initView`.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes.

## Files Changed in Plan E

| File | Change |
|------|--------|
| `e2e/pages/decks.page.ts` | `goto()` navigates to `/decks` directly |
| `e2e/pages/binders.page.ts` | `goto()` navigates to `/binders` directly |
| `e2e/specs/smoke/navigation.spec.ts` | Tab-switching test uses `ensureLoggedIn` + asserts RouterLink navigation |
| `CLAUDE.md` | Three-View Architecture section, expanded parallelism checklists |
| `package.json` | Version 1.22.0 → 1.23.0 |
| `package-lock.json` | Version bump mirror |
| `.planning/phases/03-collectionview-decomposition/03-E-SUMMARY.md` | This file |

## Self-Check: PASSED (with Task 2 explicitly pending user action)

- Dead-code audit: no code removed, none needed removing
- All verification greps pass (8/8 in-scope; 1 out-of-scope for Phase 03 flagged honestly)
- Unit: 640/640 pass
- E2E: 54/54 pass across decks, binders, smoke, collection, contacts, matches
- Type-check: 0 errors
- Lint: 0 errors (42 pre-existing warnings)
- Build: succeeds
- Version: bumped 1.22.0 → 1.23.0
- CLAUDE.md: updated for Phase 03 architecture
- **Task 2 (user verification on dev env): PENDING — user must approve before prod merge**
