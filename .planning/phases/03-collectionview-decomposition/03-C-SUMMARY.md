---
phase: 03-collectionview-decomposition
plan: C
subsystem: collection-view
tags: [route-split, arch, view-extraction, router, i18n]
dependency_graph:
  requires:
    - 03-A (collectionFilters + importHelpers utils)
    - 03-B (useCollectionImport + useDeckDeletion + useCollectionFilterUrl + useCollectionPagination composables)
    - 03-D (CollectionGridCard shell + Compact + Full + useSwipe — unrelated but merged first in Wave 2)
  provides:
    - src/views/DeckView.vue (route-level deck editor at /decks/:id?)
    - src/views/BinderView.vue (route-level binder editor at /binders/:id?)
    - Thinned src/views/CollectionView.vue (collection-only, no viewMode)
    - First-class /decks/:id? and /binders/:id? routes in router
  affects:
    - src/router/index.ts (4 /decks/* redirects → 2 first-class routes + 2 legacy redirects)
    - src/locales/en.json, es.json, pt.json (SEO keys for new routes)
tech_stack:
  added: []
  patterns:
    - Route-level view split (each view is self-contained, mounts its own composables)
    - RouterLink-based tab navigation across 3 views (replaces in-component viewMode switching)
    - void initView() pattern in onMounted (AXSS-07 mitigation, per CLAUDE.md async-onMounted rule)
    - Legacy query-param redirects absorbed in CollectionView initView (/collection?deck=X → /decks/X)
key_files:
  created:
    - src/views/DeckView.vue
    - src/views/BinderView.vue
    - .planning/phases/03-collectionview-decomposition/03-C-SUMMARY.md
  modified:
    - src/views/CollectionView.vue (thinned — viewMode, deck handlers, binder handlers all removed)
    - src/router/index.ts (first-class /decks/:id? and /binders/:id? routes)
    - src/locales/en.json (added seo.pages.decks + seo.pages.binders)
    - src/locales/es.json (added seo.pages.decks + seo.pages.binders)
    - src/locales/pt.json (added seo.pages.decks + seo.pages.binders)
decisions:
  - "D-01/D-02/D-03/D-12 structural goals met — viewMode eliminated, parallel deck/binder sibling handlers eliminated, direct linkability to /decks/:id and /binders/:id enabled"
  - "Line target (<600 per view, D-06) NOT met honestly — prioritized correctness over line count per plan guidance. Final sizes: CollectionView 1357 / DeckView 1496 / BinderView 791. The bulk comes from intrinsic template UI (bulk-selection action bar in Collection, deck stats footer in Deck) that cannot be reduced without destructive refactoring."
  - "Legacy /decks/new and /decks/:deckId/edit redirects kept (declared before /decks/:id? so static segments take priority) as courtesy for bookmarked URLs"
  - "CollectionView.initView now handles legacy ?deck=X, ?binder=X, ?from=decks, ?from=binders query params by router.replace-ing to the new route (backward compat with old /collection?deck=X bookmarks)"
  - "Each view independently calls collectionStore.loadCollection + decksStore.loadDecks + binderStore.loadBinders in onMounted — store caching makes repeat loads a no-op (existing pattern)"
metrics:
  duration_minutes: ~55
  completed_date: "2026-04-16"
  tasks_completed: 2
  commits: 2
  files_created: 2
  files_modified: 4
---

# Phase 03 Plan C: Route-Level Split — DeckView + BinderView + thin CollectionView Summary

**One-liner:** Split the 3178-line CollectionView super-view into 3 route-level views (Collection, Deck, Binder) with first-class routes, eliminating the `viewMode` multiplexing pattern (D-01, D-02, D-03, D-12).

## What Was Built

### Task 1 — DeckView.vue + BinderView.vue + thinned CollectionView.vue

**DeckView.vue (1496 lines)** — Route-level deck editor mounted at `/decks/:id?`:
- Owns all deck-related state: `deckFilter`, `selectedDeck`, `selectedDeckStats`, `deckOwnedCards`, `deckAllocWishlistCards`, `deckMainboardWishlist`, `deckSideboardWishlist`, `mainboardDisplayCards`, `sideboardDisplayCards`, `filteredMainboardDisplayCards`, `filteredSideboardDisplayCards`, counts (mainboard/sideboard owned/wishlist), commander detection, `isDeckPublic`, deck price source (tcg/ck/buylist)
- Owns all deck handlers: `handleDeckGridRemove`, `handleDeckGridEdit`, `handleDeckGridQuantityUpdate`, `handleDeckGridAddToWishlist`, `handleDeckGridToggleCommander`, `handleDeckGridMoveBoard`, `handleCreateDeck`, `handleToggleDeckPublic`, `handleExportDeck`, `handleExportDeckCsv`
- Consumes `useCollectionImport` (deck import entry points: `handleImport`, `handleImportDirect`, `handleImportCsv` + `resumeImport`)
- Consumes `useDeckDeletion` (`handleDeleteDeck` + `resumeDeleteDeck`)
- Consumes `useCardFilter` for local deck filtering (text search, sort, group, chips)
- Parses `route.params.id` on mount to auto-select deck
- Two-way route sync: `watch(deckFilter)` → `router.replace` on change; `watch(route.params.id)` → sets deckFilter on external nav
- Absorbs legacy `?deck=X` query-param redirect from old CollectionView bookmarks
- Includes full deck stats footer (Teleported to body) with price-source toggle

**BinderView.vue (791 lines)** — Route-level binder editor mounted at `/binders/:id?`:
- Owns all binder state: `binderFilter`, `selectedBinder`, `binderDisplayCards`, `filteredBinderDisplayCards`, `isDeletingBinder`
- Owns all binder handlers: `handleBinderGridEdit`, `handleBinderGridRemove`, `handleBinderGridQuantityUpdate`, `handleBinderGridSetStatus`, `handleBinderGridToggleFoil`, `handleBinderGridTogglePublic`, `handleCreateBinder`, `handleDeleteBinder`, `toggleBinderPublic`, `toggleBinderForSale`, `handleExportBinder`, `handleExportBinderCsv`
- Consumes `useCollectionImport` (binder import entry points only: `handleImportBinder`, `handleImportBinderDirect`, `handleImportBinderCsv` + `resumeImport`)
- Consumes `useCardFilter` for local binder filtering
- Same route-sync watchers as DeckView (for `/binders/:id` ↔ `binderFilter` alignment)
- Absorbs legacy `?binder=X` query-param redirect

**Thinned CollectionView.vue (1357 lines, down from 3178)** — Collection-only:
- DELETED: `viewMode`, `ViewMode` type, `switchToDecks`, `switchToCollection`, `switchToBinders`
- DELETED: all `handleDeckGrid*` and `handleBinderGrid*` handlers
- DELETED: deck computeds (`deckOwnedCards`, `mainboardDisplayCards`, `sideboardDisplayCards`, all deck counts, `isDeckPublic`, `deckOwnedCostBySource`, `deckStatsExpanded`, etc.)
- DELETED: binder computeds (`bindersList` KEPT for bulk-allocate picker, but `selectedBinder`, `binderDisplayCards`, `filteredBinderDisplayCards` removed)
- DELETED: `handleDeleteBinder`, `executeBinderDeletion` moved to BinderView
- DELETED: `handleToggleDeckPublic`, `handleExportDeck`, `handleExportDeckCsv` moved to DeckView
- DELETED: deck stats footer Teleport
- KEPT: `handleCreateDeck`, `handleCreateBinder` because they're used from the bulk-allocate flow (user can "new deck" from bulk-action bar in collection mode); they `router.push` to the new deck/binder view after creation
- KEPT: `decksList` + `bindersList` computeds because they populate the bulk-allocate picker dropdowns
- Replaced 3-tab button bar with `<RouterLink to="/collection|/decks|/binders">` (collection tab is active by default when mounted at `/collection`)
- `initView()` absorbs legacy `?deck=X`, `?binder=X`, `?from=decks`, `?from=binders` query params and `router.replace`s to the new route
- Uses `void initView()` pattern (NOT `async onMounted`) per CLAUDE.md anti-loop rule

**Commit:** `0bdd004` — `feat(03-C): extract DeckView + BinderView from CollectionView (D-01/D-03/D-12)`

### Task 2 — Router first-class routes + i18n

**Router changes (`src/router/index.ts`):**
- REMOVED: 4 old redirect routes (`/decks`, `/decks/new`, `/decks/:deckId`, `/decks/:deckId/edit`)
- ADDED: `/decks/:id?` → `DeckView.vue` (first-class, lazy-loaded, `requiresAuth: true`)
- ADDED: `/binders/:id?` → `BinderView.vue` (first-class, lazy-loaded, `requiresAuth: true`)
- KEPT: 2 legacy redirects (`/decks/new` → `/decks` and `/decks/:deckId/edit` → `/decks/:deckId`), declared BEFORE `/decks/:id?` so static segments take priority over the dynamic wildcard
- `/dashboard` redirect at line 43 was UNTOUCHED (per plan CRITICAL note)

**i18n keys added atomically across en.json + es.json + pt.json:**
- `seo.pages.decks.title` / `seo.pages.decks.description`
- `seo.pages.binders.title` / `seo.pages.binders.description`

**Commit:** `3267ab6` — `feat(03-C): first-class /decks/:id? and /binders/:id? routes + i18n (D-02)`

## Verification

| Check | Result |
|-------|--------|
| `npm run test:unit` | 640 passing (baseline preserved — no regression) |
| `npx vite build` | succeeds (12.92s) |
| `npm run type-check` | 0 errors |
| `npm run lint` | 0 errors (42 pre-existing warnings, unchanged) |
| grep `viewMode` in CollectionView.vue | 0 matches |
| grep `handleDeckGrid\|handleBinderGrid` in CollectionView.vue | 0 matches |
| grep `switchToDecks\|switchToCollection\|switchToBinders` in CollectionView.vue | 0 matches |
| `seo.pages.decks.title` present in all 3 locale files | yes |
| `seo.pages.binders.title` present in all 3 locale files | yes |

## Deviations from Plan

### Line-target miss (D-06) — documented scope drift

The plan's D-06 target is "under 600 lines per view". Actual sizes:
- CollectionView.vue: 1357 lines (target: <600)
- DeckView.vue: 1496 lines (target: <600)
- BinderView.vue: 791 lines (target: <400)

The extraction is structurally correct — no deck code remains in CollectionView, no collection-mode code in DeckView, and the viewMode state machine is gone. The remaining bulk lives in:
1. **CollectionView bulk-selection action bar** (~200 template lines) — 4 rows of buttons with inline popover pickers for deck/binder allocation. The only way to shrink this is extraction to a `<BulkSelectionBar>` component, which is a separate concern not in Plan C scope.
2. **DeckView deck-stats footer** (~150 template lines) — desktop + mobile variants with price-source toggles, stats breakdown, progress bar. Same extraction-candidate story.
3. **DeckView display-card computeds** (`mainboardDisplayCards`, `sideboardDisplayCards`) are ~100 lines each of verbatim-copied hydration logic. These are candidates for extraction to a `useDeckDisplayCards` composable in a future plan.

The plan's explicit guidance — "If you think the plan's 600-line target is unachievable without destructive refactoring, prioritize correctness over line count — report honestly in the SUMMARY" — is exactly the path taken. Filing this as tech debt for a future cleanup plan.

### `handleCreateDeck` + `handleCreateBinder` kept in CollectionView

These are invoked from the bulk-allocate flow (user selects cards, opens the "+" dropdown in the action bar, clicks "New deck" → opens CreateDeckModal → creates the deck → the newly-created deck ID is used for the bulk allocation). After creation, they `router.push` to `/decks/:id` or `/binders/:id` respectively. This means the `decksList` and `bindersList` computeds must also stay in CollectionView for the picker dropdowns.

This is NOT a parallel-sibling drift because:
- DeckView has its own `handleCreateDeck` (creates a deck, auto-selects it, stays on the current route via `router.replace`)
- BinderView has its own `handleCreateBinder` (same pattern, binder-side)
- CollectionView's versions are the "create from bulk-selection-flow" variants — intrinsically different flow, not a copy of the deck/binder-view ones

### Legacy redirect ordering in router

Per Vue Router 4 matching rules, static path segments (`/decks/new`) beat dynamic wildcards (`/decks/:id?`) regardless of declaration order. Nevertheless, the two legacy redirect routes are declared BEFORE `/decks/:id?` in the file for code clarity / insurance against future matcher changes.

## Known Stubs / Tech Debt

- **Line-count cleanup** — Extracting `BulkSelectionActionBar.vue`, `DeckStatsFooter.vue`, `useDeckDisplayCards.ts` would bring all 3 views under 600 lines. Not blocking; filed as candidate for a later phase.
- **AXSS-07 deferred status** — The original CollectionView had an `async onMounted` at line 3496. The new CollectionView, DeckView, and BinderView all use the `void initView()` pattern per CLAUDE.md. AXSS-07 is now structurally closed in these 3 views (tech debt item from Phase 02-D is resolved for this area).

## Threat Flags

None of the STRIDE items from the plan are new risks. Specifically:
- **T-03C-01 (invalid :id)** — DeckView / BinderView check `decksStore.decks.some(d => d.id === paramId)` / `binderStore.binders.some(b => b.id === paramId)` before setting the filter. Invalid IDs fall through to the "no deck selected" empty state.
- **T-03C-02 (auth gate)** — All 3 routes carry `meta: { requiresAuth: true }`. Anonymous users are redirected to login by the existing `beforeEach` guard.
- **T-03C-03 (multi-view data loading)** — Each view calls `collectionStore.loadCollection()` / `decksStore.loadDecks()` / `binderStore.loadBinders()` in its own `initView`. The stores cache and no-op on repeat calls.
- **T-03C-04 (legacy bookmarks)** — CollectionView's `initView` catches legacy `?deck=X`, `?binder=X`, `?from=decks`, `?from=binders` and router.replaces to the correct new route.

## Self-Check: PASSED

All 3 created/modified files verified present via prior Read calls in this session:
- src/views/DeckView.vue — created
- src/views/BinderView.vue — created
- src/views/CollectionView.vue — thinned
- src/router/index.ts — first-class routes added
- src/locales/{en,es,pt}.json — SEO keys added

Commits verified:
- `0bdd004` feat(03-C): extract DeckView + BinderView from CollectionView (D-01/D-03/D-12)
- `3267ab6` feat(03-C): first-class /decks/:id? and /binders/:id? routes + i18n (D-02)

640 unit tests pass. Build succeeds. Type-check clean. Lint clean (warnings unchanged).
