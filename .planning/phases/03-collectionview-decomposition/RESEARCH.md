# Phase 3: CollectionView Decomposition — Research

**Researched:** 2026-04-15
**Domain:** Vue 3 component decomposition, composable extraction, URL-synced state, TDD
**Confidence:** HIGH (file inventory, patterns, and Phase 02 lessons are all verified file:line)

## RESEARCH COMPLETE

---

## Roadmap Corrections (read first)

| Roadmap claim | Actual | Impact |
|---|---|---|
| "CollectionView.vue is ~1050-line mega-component" (ROADMAP.md:17) | **4579 lines** (`wc -l src/views/CollectionView.vue`) | Phase is ~4.4x larger than roadmap assumed. Success criterion "< 400 lines" means removing ~4180 lines — *not* the ~650 line cut 1050→400 implied. Cannot be done in a single plan. |
| "CollectionView.vue 1050 lines" (ROADMAP.md phase 3 narrative) | Script block alone is 3667 lines (lines 1–3667); template is ~886 lines (3669–4555) | Planner must size plans assuming a 3.6k-line script body. |
| "deck display cards ... extracted into composable" (ROADMAP.md:54 / ARCH-02) | **This phase hosts deck + binder editing** because `/decks/*` routes redirect to `/collection?deck=XXX` (`router/index.ts:83-98`). "Deck display cards" = the 200-line `mainboardDisplayCards` (CollectionView.vue:845-949) + `sideboardDisplayCards` (:952-1044) + `filteredMainboardDisplayCards` / `filteredSideboardDisplayCards` (:1047-1061). | Scope is bigger than "collection" — it's the super-view that hosts 3 modes (collection/decks/binders). |
| "Swipe logic replaced with existing useSwipe" (ARCH-06) | `useSwipe.ts` **exists at src/composables/useSwipe.ts** (78 lines). API: `useSwipe(elementRef, { threshold, onSwipeLeft, onSwipeRight })` returns `{ isSwiping, swipeOffset }`. Attaches listeners in `onMounted`, removes in `onUnmounted`. | `CollectionGridCard.vue:86-127` reimplements the same logic inline with a different threshold (80 vs 50), different clamp (±120), and a 4th behavior branch (status-cycle on right-swipe) — so migrating isn't a pure drop-in; either the composable grows or a thin wrapper handles the status-cycle callback. |
| Phase 2 "Plans B's composable was orphaned" | Confirmed — `useDashboardMatches.ts` built in 02-B, deleted in 02-C after discovering `/dashboard` redirects to `/saved-matches` (02-D-SUMMARY.md:17-21) | The Phase 3 analog: CollectionView IS the route ([router/index.ts:47-51](C:/Users/srpar/WebstormProjects/cranialTrading/src/router/index.ts#L47-L51) mounts CollectionView at `/collection` and four `/decks/*` paths redirect *into* it). Safe to decompose — but must re-verify during Plan A. |

---

## Summary

Phase 3 decomposes the biggest view in the repo (CollectionView.vue, **4579 lines**) into composables and splits CollectionGridCard (**704 lines**) into compact + full variants with a thin routing shell. Phase 2's lessons apply directly: utilities first (02-A pattern), composables second (02-B pattern), view wiring last (02-C pattern), then a closeout plan. The file is actually *three views in one* — collection mode, deck editor mode, and binder mode — multiplexed by `viewMode.value: 'collection' | 'decks' | 'binders'` ([CollectionView.vue:123-124](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L123-L124)). Extracting them requires carving along the viewMode seams, not along an arbitrary line budget.

**Primary recommendation:** Split the phase into **five plans** (A-E) — a pure-utility foundation, an import-state-machine composable, a delete-deck composable + URL-sync composable (parallel with the import one), a CollectionGridCard compact/full split wired to `useSwipe`, and a final view-thinning + NICE-07/08/09 cleanup. Each plan is sized at ~300-500 NET lines out of CollectionView.vue so the 4000+ line target reaches < 400 over the five plans.

---

## User Constraints

No CONTEXT.md exists for Phase 3 yet — `/gsd-discuss-phase` has not run. The planner should expect `<user_constraints>` to be populated by the discuss step and echoed here on re-research.

**Success criteria (from ROADMAP.md:56-59 — these are phase-level constraints):**
1. CollectionView.vue under **400 lines** with no duplicated state machine logic inline.
2. CollectionGridCard renders via a routing shell that delegates to CollectionGridCardCompact or CollectionGridCardFull — no duplicated swipe handlers.
3. Swiping a collection card uses `useSwipe.ts` with no inline touch event listeners remaining in CollectionGridCard.
4. Changing a filter or sort in CollectionView updates the browser URL, and refreshing the page restores the same filtered view.

**Requirements bundled into this phase (REQUIREMENTS.md:22-46):**
- ARCH-02 — overall decomposition
- ARCH-05 — CollectionGridCard compact/full split
- ARCH-06 — swipe uses `useSwipe.ts`
- NICE-07 — CollectionGrid removes redundant `computed(() => props.cards)` wrapper ([CollectionGrid.vue:42](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGrid.vue#L42) — already exists)
- NICE-08 — `useCollectionTotals` calls `useCollectionStore()` at setup, not inside async callbacks ([useCollectionTotals.ts:98](C:/Users/srpar/WebstormProjects/cranialTrading/src/composables/useCollectionTotals.ts#L98) and [:186](C:/Users/srpar/WebstormProjects/cranialTrading/src/composables/useCollectionTotals.ts#L186) — currently inside async)
- NICE-09 — `collectionSummary` becomes a computed derived from cards, not manually synced ([stores/collection.ts:230](C:/Users/srpar/WebstormProjects/cranialTrading/src/stores/collection.ts#L230) — plain `ref` assigned at :330 and :369)
- NICE-10 — CollectionView filter/sort state persisted in URL query params

---

## Project Constraints (from CLAUDE.md)

- **TDD is mandatory** (CLAUDE.md "MANDATORY: TDD Development Workflow"): RED → GREEN → REFACTOR. Every logic change needs a failing test first.
- **Branching:** All work on `develop`; never commit to `main` directly.
- **Build gate:** `npx vite build` must succeed (not `npm run build` — pre-existing lint warnings).
- **Test gate:** `npm run test:unit` must pass before committing.
- **Anti-loop Rule 1:** READ full file + trace callers/callees before modifying. Applies to every function touched.
- **Anti-loop Rule 6:** Parallel changes (e.g., `handleDeckGridRemove` + `handleBinderGridRemove` at [:1497](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L1497) and [:2260](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L2260)) must be atomic — "same step, never later."
- **Anti-loop Rule 2:** Do not "improve" adjacent code. If a line isn't in the plan, leave it.
- **Async onMounted is forbidden for anonymous-user routes.** CollectionView is `requiresAuth: true` ([router/index.ts:50](C:/Users/srpar/WebstormProjects/cranialTrading/src/router/index.ts#L50)), so the existing `onMounted(async` at [:3496](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3496) *cannot* fire the anonymous-user bug today. 02-D-SUMMARY.md:36 logged this as Phase 3+ tech debt. **AXSS-07 is NOT in Phase 3's requirement set** (REQUIREMENTS.md:73 maps it to Phase 2 "Pending"). Still worth fixing if plan-touched, but not a hard gate.
- **i18n:** any new user-visible string lands in en.json + es.json + pt.json atomically.
- **`--no-verify` caveat** (02-D-SUMMARY.md:67 lesson #3): parallel-executor commits can smuggle lint errors past the gate. Run `npm run lint` (or at least `vue-tsc`) once after each wave merges.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ARCH-02** | CollectionView decomposed — import state machine, delete-deck state machine, filter mapping, deck display cards, pagination params into composables | `useCollectionImport` (import state machine + resume) / `useDeckDeletion` (delete state machine + resume) / `useCollectionFilterUrl` (filter mapping + NICE-10) / `useDeckDisplayCards` (mainboard/sideboard hydration) / `useCollectionPagination` (already partly wired to store — see [:647-749](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L647-L749)) |
| **ARCH-05** | CollectionGridCard split into Compact + Full + thin routing shell | Single conditional branch at [:378 vs :419](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGridCard.vue#L378) gated by `compact` prop. Trivial template split. |
| **ARCH-06** | Swipe uses `useSwipe.ts` composable | Composable exists ([useSwipe.ts:1-78](C:/Users/srpar/WebstormProjects/cranialTrading/src/composables/useSwipe.ts)); inline re-impl at [CollectionGridCard.vue:86-127](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGridCard.vue#L86-L127). API gap documented below. |
| **NICE-07** | CollectionGrid removes redundant `computed(() => props.cards)` | Confirmed at [CollectionGrid.vue:42](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGrid.vue#L42). 2-line fix. |
| **NICE-08** | `useCollectionTotals` calls `useCollectionStore()` at setup, not inside async callbacks | Confirmed at [:98](C:/Users/srpar/WebstormProjects/cranialTrading/src/composables/useCollectionTotals.ts#L98) and [:186](C:/Users/srpar/WebstormProjects/cranialTrading/src/composables/useCollectionTotals.ts#L186). Two call sites. |
| **NICE-09** | `collectionSummary` is a `computed` from cards, not manually assigned | Confirmed at [stores/collection.ts:230](C:/Users/srpar/WebstormProjects/cranialTrading/src/stores/collection.ts#L230) (`ref`) + assigns at :330, :369. NOTE: the summary comes from `card_index` chunks (which is cheap) and a fallback Cloud-Function summary ([:369-374](C:/Users/srpar/WebstormProjects/cranialTrading/src/stores/collection.ts#L369-L374)). Converting to `computed(() => cards.value)` changes the input source — be sure the summary matches. Worth a behavior-preservation test. |
| **NICE-10** | CollectionView filter/sort state persisted in URL query params | Current state: URL is read-only for nav params (`deck`, `filter=wishlist`, `addCard`, `action=add`, `from`, `binder`) at [:3510-3603](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3510-L3603). Filter/sort state ONLY lives in refs inside `useCardFilter` ([:178, :196](C:/Users/srpar/WebstormProjects/cranialTrading/src/composables/useCardFilter.ts)). Refresh loses filter state today. |

---

## CollectionView.vue Structural Inventory

**File stats:** 4579 lines total, script 1-3667 (~3659 lines), template 3669-4555 (~886 lines).

### Top-level state buckets (by line range)

| Range | Section | Bucket | LOC |
|---|---|---|---|
| 1-6 | Module-level flags | `isImportRunning` / `isDeleteRunning` (persist across remounts) | 6 |
| 9-53 | Imports + store setup | 11 imports from stores, 6 composables, 15+ components | 45 |
| 57-70 | Modal visibility refs | 9 modal booleans | 13 |
| 73-79 | Collection selection + filter state | `statusFilter`, `deckFilter`, `viewType` | 7 |
| 82-119 | Internal interfaces | `MoxfieldImportCard`, `ImportCardData` | 38 |
| 122-172 | **View mode machine** | `viewMode` ref, `switchToDecks/Collection/Binders`, binder state | ~50 |
| **174-240** | **Import state machine** | `ImportState` interface, `importProgress` ref, localStorage helpers (save/load/clear), `isDeckImporting`, `getImportProgress` | **67** |
| **242-302** | **Delete-deck state machine** | `DeleteDeckState` interface, `deleteDeckProgress` ref, `isDeletingDeck`, `deleteProgress`, save/load/clear | **61** |
| 307-362 | Collection/wishlist/status computeds | `collectionCards`, `statusCounts` (single-pass), `wishlistCards`, count computeds | ~56 |
| 365-486 | Deck display computeds | `decksList`, `selectedDeck`, stats, `deckOwnedCards`, `deckAllocWishlistCards`, commander detection, mainboard/sideboard counts | ~122 |
| **487-545** | **Collection filter pre-filter + composable wiring** | `statusFilteredCards` pre-filter, destructure from `useCardFilter` (18 named exports) | **59** |
| 547-645 | Filter modal bridge + chip filter management | Bidirectional mapping between display and modal value conventions | ~99 |
| **647-749** | **Server-side pagination wiring** | `buildPaginationFilters`, `buildPaginationSort`, debounced watcher | **103** |
| 752-842 | Display card computeds + chip filter helpers | `collectionDisplayCards`, `paginatedCardCount`, `passesChipFilters`, `getCardCategory`, `groupedWishlistCards` | ~91 |
| **845-1069** | **Deck display card hydration** | `mainboardDisplayCards` + `sideboardDisplayCards` + filter wrappers + `filteredBinderDisplayCards` | **225** |
| 1076-1168 | Deck visibility + price-source computeds | `deckOwnedCostBySource`, etc | ~92 |
| 1169-1366 | Bulk selection machinery | 8 handlers | ~198 |
| 1367-1722 | Card operation handlers | `handleLocalCardSelect`, `handleDelete`, `handleDeckGridEdit/Remove/QuantityUpdate/AddToWishlist/ToggleCommander/MoveBoard` | ~356 |
| 1719-1862 | Binder ops + import helpers | `performBulkBinderAllocate`, `handleCreateBinder`, `toggle*`, scryfall helpers | ~144 |
| 1864-2249 | **Import plumbing (helpers)** | `parseTextImportLine`, `buildCollectionCardFromScryfall`, `_processImportCard`, `_applySearchResultToCard`, `_enrichCardsWithFallbackSearch`, `buildRawMoxfieldCard`, `buildRawCsvCard`, `_buildCsvCollectionCard`, `executeCardDeletionStep`, `buildExportLines` | **386** |
| 2202-2383 | **Binder handlers** | `handleDeleteBinder`, `handleBinderGridEdit/Remove/QuantityUpdate/SetStatus/ToggleFoil/TogglePublic` | ~182 |
| 2385-2453 | Create deck + Scryfall helper | `handleCreateDeck`, `fetchCardFromScryfall` | ~69 |
| **2455-3032** | **Import entry points** | `handleImport` (text), `handleImportDirect` (Moxfield API), `handleImportCsv`, `handleImportBinder`, `handleImportBinderDirect`, `handleImportBinderCsv` | **578** |
| **3034-3165** | **Delete deck pipeline** | `executeDeleteDeck`, `resumeDeleteDeck`, `handleDeleteDeck` | **132** |
| 3168-3345 | Deck actions | `handleToggleDeckPublic`, `handleExportDeck`, `handleExportDeckCsv`, `handleExportBinder`, `handleExportBinderCsv` | ~178 |
| **3346-3467** | **Resume import** | `resumeImport` (handles `allocating` / `saving` restart paths) | **122** |
| 3469-3493 | Slow-load toast | `startSlowLoadTimer` + watcher | ~24 |
| **3494-3557** | **Lifecycle — `onMounted(async`** | Loads collection + decks + binders, triggers queryPage, parses 5 query params, resumes import + delete | **63** |
| 3559-3603 | **Route-query watchers** | `route.query.deck`, `route.query.filter`, `route.query.addCard`, `route.query.action` | ~45 |
| 3605-3624 | Before-unload guard | Prevents nav during import/delete | ~19 |
| 3627-3666 | Keyboard shortcuts (`n`, Escape) | | ~40 |
| 3669-4555 | **Template** | 3 top-level mode blocks + 7 modals | **886** |

### Tallest tent poles (candidates for extraction)

1. **Import entry points + resume + plumbing** (~1150 lines total: :174-240 state + :1864-2249 helpers + :2455-3032 entry points + :3346-3467 resume) — by far the single biggest concern.
2. **Deck display card hydration** (:845-1069, ~225 lines)
3. **Filter modal bridge + chip state** (:547-645, ~99 lines) — mostly pure mapping
4. **Card/deck/binder operation handlers** (:1422-2383 total, ~960 lines)
5. **Pagination wiring** (:647-749, ~103 lines)
6. **Delete-deck pipeline** (:3034-3165, ~132 lines)

### Imports requiring tracking

| Import | Line | Note |
|---|---|---|
| `useCollectionStore`, `useDecksStore`, `useBindersStore`, `useToastStore`, `useConfirmStore`, `usePromptStore` | 11-14, 31-32 | All still needed after extraction |
| `useCardAllocation` | 33 | Used in `statusFilteredCards` (deck filter) + throughout; composable survives |
| `useCardFilter` | 41 | Already a composable — keep |
| `useCollectionTotals`, `cancelPriceFetch` | 42 | NICE-08 targets this file |
| `buildManaboxCsv`, `buildMoxfieldCsv`, `cleanCardName`, `downloadAsFile`, `ParsedCsvCard` | 35 | Export helpers; used in import/export plumbing |
| `colorOrder`, `getCardColorCategory`, etc. | 41 | Category helpers; used in filter mapping bridge |

---

## Research Answers (by question)

### Q2: Import state machine

**States** ([:178](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L178)): `'fetching' | 'processing' | 'saving' | 'allocating' | 'complete' | 'error'`.
**Triggers:** `handleImport` ([:2455](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L2455)), `handleImportDirect` (Moxfield [:2518](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L2518)), `handleImportCsv` ([:2680](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L2680)), `handleImportBinder*` ([:2787, :2845, :2940](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L2787)), `resumeImport` ([:3346](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3346)).
**Side effects:** localStorage persist (no card arrays — :192-198 strips them), Scryfall API, `collectionStore.confirmImport`, `decksStore.bulkAllocateCardsToDeck`, toast.showProgress.
**Module-level flag:** `isImportRunning` ([:4](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L4)) prevents duplicate executions across component remounts — **important invariant to preserve**.

**Extractability verdict:**
- The state machine + persistence layer (save/load/clear + `isDeckImporting` + `getImportProgress`) is clean composable material.
- The entry-point orchestration (`handleImport*`) is ~600 lines and calls `decksStore`, `collectionStore`, Scryfall service, and I18n. Composable is feasible but not trivially Firebase-free — mirrors the 02-B pattern where store methods absorb Firebase calls and the composable orchestrates.
- **Recommended:** Composable `useCollectionImport` owns the state machine + resume flow. The `handleImport*` entry points stay in CollectionView as thin adapters OR move into the composable. Prefer moving so CollectionView shrinks.
- The bulk of the plumbing helpers (`parseTextImportLine`, `buildCollectionCardFromScryfall`, `_processImportCard`, `_applySearchResultToCard`, `_enrichCardsWithFallbackSearch`, `buildRawMoxfieldCard`, `buildRawCsvCard`, `_buildCsvCollectionCard`) are **pure functions** ([:1864-2141](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L1864-L2141)) and belong in `src/utils/importHelpers.ts` with unit tests — 02-A pattern.

### Q3: Delete-deck state machine

**States** ([:246](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L246)): `'deleting_cards' | 'deleting_deck' | 'complete' | 'error'`.
**Triggers:** `handleDeleteDeck` ([:3121](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3121), 2 confirm modals) → `executeDeleteDeck` ([:3034](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3034)) → `resumeDeleteDeck` ([:3093](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3093)) from onMounted.
**Side effects:** QuotaExceededError recovery ([:262-276](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L262-L276) — retry after clearing import state, then strip cardIds as last resort), `executeCardDeletionStep` helper ([:2142](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L2142)), `decksStore.deleteDeck`, `deckFilter.value = 'all'` before delete to avoid reactive cascade.
**Module-level flag:** `isDeleteRunning` ([:5](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L5)).

**Extractability verdict:** Near-identical shape to import state machine. Same composable pattern applies. `useDeckDeletion` is smaller (~200 lines once entry points move in) and unblocks the symmetry.

### Q4: Filter mapping

**Pure transformation is already ~60% extracted:**
- `buildPaginationFilters` ([:650-700](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L650-L700)) converts display categories (`'White'`, `'Creatures'`) → server format (`'W'`, `'creature'`). Pure function, zero side effects, testable.
- `buildPaginationSort` ([:703-716](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L703-L716)) converts client sort values → server fields. Pure.
- `localAdvancedFilters` / `handleLocalFiltersUpdate` ([:558-620](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L558-L620)) is a bidirectional bridge between `useCardFilter`'s refs and `AdvancedFilters` modal format. Has side effects (mutating refs).

**Extractability verdict:** `buildPaginationFilters` + `buildPaginationSort` + the 4 mapping constants (`colorToModal` etc. :549-554) move to `src/utils/collectionFilters.ts` with unit tests — 02-A pattern. The bridge mapper is trickier because it writes back into composable refs; simplest to fold it into a `useCollectionFilterBridge` composable or leave in the view.

### Q5: Deck display cards

**What it means in CollectionView context:** the deck editor is hosted inside CollectionView (`viewMode === 'decks'`). "Deck display cards" are the hydrated card objects the template iterates over in the deck editor — `mainboardDisplayCards` ([:845-949](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L845-L949)) and `sideboardDisplayCards` ([:952-1044](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L952-L1044)). Both merge 3 sources (allocation-based owned, legacy wishlist `item[]`, new-model wishlist allocations) into a `DisplayDeckCard[]`.

**Cross-feature dep:** ALSO `filteredMainboardDisplayCards` / `filteredSideboardDisplayCards` / `filteredBinderDisplayCards` ([:1047-1069](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L1047-L1069)) — apply the shared `filterQuery` from `useCardFilter` to the display cards.

**Extractability verdict:** Pure compute that takes `selectedDeck`, `collectionCards`, `isCommanderFormat`, `commanderNames`, `deckMainboardWishlist`, `deckAllocWishlistCards` → `DisplayDeckCard[]`. Not Firebase-touching. Strong candidate for `useDeckDisplayCards(deckRef, collectionCardsRef)` composable returning `{ mainboardDisplayCards, sideboardDisplayCards, filteredMainboardDisplayCards, filteredSideboardDisplayCards, mainboardOwnedCount, sideboardOwnedCount, mainboardWishlistCount, sideboardWishlistCount }`. ~225+ lines of extraction payoff.

### Q6: Pagination params

**Already partially extracted.** CollectionView delegates pagination to `collectionStore.queryPage` and `collectionStore.paginatedCards`. The view retains:
- `buildPaginationFilters` + `buildPaginationSort` helpers (:650-716).
- A debounced watcher ([:721-744](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L721-L744)) that fires `queryPage` on filter changes.
- `onUnmounted` cleanup ([:747-749](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L747-L749)).
- `collectionDisplayCards` / `paginatedCardCount` computeds (:752-768).

**State in URL?** No. Filter state is in-memory refs only (`useCardFilter`). Page state lives in the store's `paginationMeta`. Refresh resets both.

**Extractability verdict:** `useCollectionPagination(filterState, sortState)` wraps the debounced watcher + filter/sort builders + the cleanup timer. Pairs naturally with the URL-sync composable (Q9).

### Q7: CollectionGridCard — compact vs. full

**Single `compact: boolean` prop** ([:18](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGridCard.vue#L18)) gates two entirely disjoint `<template v-if>` branches:
- **Compact branch** (:376-416, ~40 lines): minimal button with image + 2 info lines. Used in deck editor grid + possibly binder.
- **Full branch** (:418-697, ~280 lines): status bar, swipe handlers, selection checkbox, split-card flip, status overlay, deleting overlay, deck allocation row, name, edition, prices, sparkline, ELIMINAR button, interest button, cart button, context menu.

**Shared script logic used by both:** IntersectionObserver price lazy-fetch ([:195-216](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGridCard.vue#L195-L216)), `parsedImage`, `getCardImage`, `hasImage`, `imageLoaded` flag, CK prices, split-card detection, sparkline — ~15 refs and computeds.

**Shared logic only used by full branch:** `cardRef` ([:58](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGridCard.vue#L58)), `swipeOffset`, `isSwiping`, `startX`, `SWIPE_THRESHOLD`, `handleTouchStart/Move/End`, `swipeStyle`, `swipeIndicator`, `STATUS_ORDER`, `setStatus`, `togglePublic`, `allocationInfo`, `isCardAllocated`, `getStatusColor`, `getStatusIconName`, `priceChangeData`, context menu (~150 lines of script only active when `compact === false`).

**Parallel siblings (CLAUDE.md Rule 1 watchpoint):** Compact is used in decks/binders grids (via `AddCardToDeckModal.vue` usage of `CollectionGrid compact` and direct consumption in DeckEditorGrid which is imported at CollectionView:25). Full is used in main collection grid and readonly profile views. **The only consumer of `CollectionGridCard` directly is `CollectionGrid.vue:75`** — verified via Grep. So the routing-shell refactor has a **single-consumer surface**, low blast radius.

**Extractability verdict:** Clean split. Compact variant takes ~40 lines of template + ~80 lines of script (image helpers + price hook). Full variant takes ~280 lines of template + ~150 lines of script. Shell is ~20 lines (`<CompactCard v-if="compact" v-bind="$props" /><FullCard v-else v-bind="$props" v-on="$listeners" />` style, but Vue 3 prefers explicit pass-through).

### Q8: useSwipe.ts API — is the composable sufficient?

**Current inline logic in CollectionGridCard** ([:86-127](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGridCard.vue#L86-L127)):
- threshold: 80 px (composable default: 50, but `threshold` option exists).
- clamps offset to ±120 px (composable does not clamp; its `swipeOffset` can be any delta, caller can clamp downstream).
- on left swipe: `emit('delete', props.card)`.
- on right swipe: **cycles status** through `STATUS_ORDER` (collection → trade → sale → wishlist → collection) and calls `collectionStore.updateCard` + toast.
- `e.preventDefault()` **is not called** in the inline version (useSwipe calls it if |offset| > 10 at :34).
- Short-circuits if `props.readonly || props.isBeingDeleted` at touchstart ([:87](C:/Users/srpar/WebstormProjects/cranialTrading/src/components/collection/CollectionGridCard.vue#L87)) — composable has no such guard; caller must gate via `canSwipe` conditional.

**API gap to resolve:**
- useSwipe already supports threshold override ✓
- useSwipe returns `swipeOffset` for visual indicators ✓
- useSwipe attaches listeners in `onMounted` via `elementRef` ✓ — compatible with migrating to template-ref pattern
- Missing: (a) offset clamping — the FullCard can clamp the returned `swipeOffset` via a `computed` wrapper, no composable change needed; (b) conditional disable (readonly/isBeingDeleted) — caller can skip attaching or just return early in the `onSwipeLeft/Right` callbacks.

**Verdict:** `useSwipe.ts` as-is is sufficient for ARCH-06. The FullCard variant wires `onSwipeLeft: () => emit('delete', ...)` and `onSwipeRight: async () => { cycle status }`. Wrap returned `swipeOffset` in a clamped computed for the visual indicator. No composable change required. Success criterion 3 ("no inline touch event listeners remaining in CollectionGridCard") becomes achievable.

### Q9: URL state for filters/sort (NICE-10)

**Current state — write side:** CollectionView **only** writes to the URL via `router.replace` to clean up one-shot query params (`addCard`, `action`) and to redirect (`action=add` handled at :3598-3603). No filter state is written.

**Current state — read side:** CollectionView reads 5 query params on mount / in watchers:
- `route.query.from === 'decks' | 'binders'` → sets `viewMode` ([:3511-3516](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3511-L3516))
- `route.query.deck` → auto-select deck ([:3519-3523, :3560-3566](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3519))
- `route.query.binder` → auto-select binder ([:3526-3530](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3526))
- `route.query.filter === 'wishlist'` → set `statusFilter` + scroll ([:3572-3588](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3572-L3588))
- `route.query.addCard` → redirect to `/search?q=` ([:3591-3595](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3591-L3595))
- `route.query.action === 'add'` → open AddCardModal ([:3598-3603](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L3598-L3603))

**Minimum viable URL schema for NICE-10:**

| Param | Source ref | Serialization |
|---|---|---|
| `?q=` | `filterQuery` | string, URL-encoded |
| `?status=` | `statusFilter` | enum: `all|owned|available|collection|sale|trade|wishlist` |
| `?sort=` | `sortBy` | enum: `recent|name|price` |
| `?colors=` | `selectedColors` Set | comma-separated: `W,U,B,R,G,C` (omit if all selected = no filter) |
| `?types=` | `selectedTypes` Set | comma-separated: `creature,instant,...` |
| `?rarity=` | `selectedRarities` Set | comma-separated |
| `?mv=` | `selectedManaValues` Set | comma-separated numbers + `10+` |
| `?foil=` | `advFoilFilter` | `foil` (omit if `any`) |
| (existing) | `deck`, `binder`, `filter`, `from`, `addCard`, `action` | **preserve existing behavior** |

**Verdict:** A `useCollectionFilterUrl(filterState)` composable wires a watcher: refs → `router.replace({ query })`, plus an on-mount hydration: `route.query` → refs. Watch out for:
- Round-trip bug risk: the watcher fires → updates query → triggers route-query watcher → updates refs → fires watcher again. Guard with a `isHydrating` flag or compare before writing.
- The existing `watch(() => route.query.filter, ...)` at :3572 already mutates `statusFilter` — the new sync composable must coexist with that specific redirect behavior OR absorb it.
- `useCardFilter`'s refs are owned by the composable — the new URL-sync composable takes those refs as parameters, same way `useDashboardMatches` sharing worked in 02-B Amendment I (pass refs, don't re-instantiate).

### Q11: Risk areas / tech debt magnets

| Risk | Evidence | Impact |
|---|---|---|
| **File size vs roadmap** | 4579 lines, not 1050. | Planner must size for 4000-line cut. Single-plan execution will run out of context. |
| **State machines use module-level flags** | `isImportRunning` ([:4](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L4)), `isDeleteRunning` ([:5](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L5)) at file top — persist across remounts. Composable that re-creates these refs per-instance breaks the singleton invariant. | Must preserve module-level singleton OR move to store. |
| **viewMode state machine** | 3-mode switch (`collection|decks|binders`) embedded throughout template + computeds. | Decomposition must not leak viewMode into extracted composables, or wire it explicitly as a param. |
| **Parallel siblings** (CLAUDE.md Rule 1 + 6) | `handleDeckGridRemove/QuantityUpdate/Edit/etc.` ([:1475-1642](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L1475-L1642)) have binder twins at `handleBinderGridRemove/QuantityUpdate/etc.` ([:2250-2372](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L2250-L2372)). 8 paired handlers. | Every extraction of one handler MUST move its twin in the same commit. |
| **Two `useCollectionTotals()` calls in view** | Line [:1109](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L1109): `useCollectionTotals(() => collectionCards.value)` for shared prices. NICE-08 fixes ownership on the *composable* side but the view invocation stays. | NICE-08 extraction is internal to `useCollectionTotals.ts`, not the view. |
| **Async `onMounted` at :3496** | Matches MEMORY.md CRITICAL rule violation pattern, but `/collection` is behind `requiresAuth: true` ([router/index.ts:50](C:/Users/srpar/WebstormProjects/cranialTrading/src/router/index.ts#L50)) — anonymous repro cannot fire (per 02-D-SUMMARY.md lesson #2). | Fix if plan-touched; not a phase-gate. |
| **Large file = merge conflict magnet** | If Phase 3 runs parallel plans as the 02-B wave did, concurrent edits to CollectionView.vue WILL conflict. | Do NOT run extraction plans in parallel on CollectionView.vue — sequence them. Only the separate-file work (utilities, CollectionGridCard split, stores) can parallel. |
| **Pre-existing lint warnings smuggled by `--no-verify`** (02-D lesson #3) | Plan 02-B introduced a lint error that only surfaced in Plan D | Run `npm run lint` or `vue-tsc --noEmit` after each wave. |
| **Vue reactivity with 59k+ cards** (MEMORY.md `vue_reactivity_large_collections`) | `cards` is `shallowRef<Card[]>` in store ([:226](C:/Users/srpar/WebstormProjects/cranialTrading/src/stores/collection.ts#L226)). | Extractions must not silently convert to deep `ref` — would freeze UI. |
| **NICE-09 behavior change** | `collectionSummary` currently derived from `card_index` chunks ([stores/collection.ts:330](C:/Users/srpar/WebstormProjects/cranialTrading/src/stores/collection.ts#L330)) OR Cloud Function summary (:369-374). Converting to `computed(() => cards.value)` changes the input — `totalCards` would match `cards.length` not index count. | Behavior-preservation test required (cards array may lag index during load). |
| **Orphan-composable risk** (02-B/02-C analog) | useDashboardMatches was orphaned because `/dashboard` redirected away. Verified `/collection` is the live route ([router/index.ts:47-51](C:/Users/srpar/WebstormProjects/cranialTrading/src/router/index.ts#L47-L51)) and hosts deck editing via `/decks/*` redirects. Safe — but re-verify during Plan A. | Re-verify; don't assume. |
| **E2E page object depends on `.grid` selector** ([collection.page.ts:49](C:/Users/srpar/WebstormProjects/cranialTrading/e2e/pages/collection.page.ts#L49)) and `.fixed.inset-0.z-50` modal class | If CollectionGridCard split changes DOM nesting, E2E selectors may break. | Run E2E before pushing. |

### Q12: Phase 02 pitfalls mapped to Phase 3

1. **Read the router before planning.** ✅ Done — `/collection` mounts CollectionView, and `/decks/*` four-way redirect into it. Deck-editor UI IS hosted inside CollectionView.
2. **Type-width gotcha that orphaned useDashboardMatches** — no analog in Phase 3 found in research. The `DisplayDeckCard` type is already a discriminated union of `HydratedDeckCard | HydratedWishlistCard` and flows cleanly from existing helpers. **But watch for:** the `deckFilter.value = 'all'` convention (:3048) before delete to dodge reactive cascade — any composable that owns `deckFilter` must preserve this call-order constraint.
3. **`--no-verify` smuggling lint errors** — use the sequential merge pattern 02-D adopted, or run `npm run lint` after each wave.
4. **"Discussions" (CONTEXT.md) deferred** — the roadmap/requirements don't specify URL schema details. Recommend kicking off `/gsd-discuss-phase` to lock URL param names, default-value handling (should `?status=all` be omitted from URL?), and whether filter-reset (`X` clear button) should replace history (`router.replace`) or push it (`router.push`).

### Q13: Existing test coverage

**Unit tests directly relevant to Phase 3:**
- `tests/unit/composables/useCardFilter.test.ts` — covers filter composable (will be consumed by the URL-sync composable).
- `tests/unit/composables/useVirtualGrid.test.ts` — covers CollectionGrid's virtualization.
- `tests/unit/composables/useContextMenu.test.ts` — context menu used by CollectionGridCard.

**No existing tests for:**
- `CollectionView.vue` directly (view-level, which is expected — views are smoke-tested via E2E).
- `CollectionGridCard.vue`.
- `useCollectionTotals.ts`.
- `useSwipe.ts` (composable has no tests today; adding one during ARCH-06 migration is worthwhile).
- Import state machine (no regression spec).
- Delete-deck state machine (no regression spec — MEMORY.md `card_index_deletion_failures` had 5 failed attempts here historically).

**E2E specs (231 LOC total across 3 specs):**
- `collection-crud.spec.ts` (132 lines) — add/edit/delete CRUD paths.
- `collection-filters.spec.ts` (44 lines) — status filter, search input, sort dropdown.
- `collection-views.spec.ts` (55 lines) — view mode switching.

**Must extend for NICE-10:** `collection-filters.spec.ts` needs one new test: change filter → check URL contains expected query param → reload → filter state restored.

**Must add for ARCH-05/06:** a mobile viewport E2E test for swipe-delete is out of scope (page.touchscreen is unreliable in CI), but a unit test for the extracted CompactCard and FullCard components can be written using `@vue/test-utils`.

### Q14: Dependencies on Phase 4

Phase 4 covers ARCH-10 (GlobalSearch ARIA combobox) + NICE-11 (anchor-based navigation for Cmd+click). Neither touches CollectionView or CollectionGridCard directly. **No Phase 3 → Phase 4 ordering constraint exists.** Phase 4 can start immediately after Phase 3 closes.

One weak link: NICE-11 wants anchor elements for "Go to deck" / "View profile" — CollectionView's deck-switch is currently `deckFilter.value = id` + `router.replace` inside `switchToDecks` ([:127-138](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L127-L138)). If Phase 4 touches deck-link anchors, it may need to know about the URL schema introduced in Phase 3's NICE-10. Low risk; document the URL schema in the phase 3 summary so Phase 4 can consume it.

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| Vue | 3 Composition API (`<script setup>`) | View framework | Project standard per CLAUDE.md |
| Pinia | (current) | Store | Already used for `collection`, `decks`, `binders`, `toast`, `confirm`, `prompt` |
| vue-router | 4.x | Router + URL state | Already owns nav query params |
| Vitest | (current) | Unit tests | Per CLAUDE.md "no `import { describe, it }`" rule |
| Playwright | (current) | E2E | Per `e2e/specs/` structure |
| `@vue/test-utils` | (current) | Component unit tests | Used in existing composable tests |
| `@tanstack/vue-virtual` | via `useVirtualGrid` | Virtualized list | Already in CollectionGrid |

### New composables to create this phase

None from external libs — all extraction.

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|---|---|---|
| Custom `useCollectionFilterUrl` | VueUse's `useUrlSearchParams` | VueUse is already in the project for `useSwipe`-adjacent utilities? **Unverified — grep showed no VueUse import.** Custom keeps the no-dependency invariant. |
| Pinia store for import state machine | Module-level flags (current) | Current approach survives remounts via module scope; Pinia is functionally equivalent but imposes a new surface. Prefer **keep module-level flag in the composable file** to match existing pattern. |
| XState for state machines | Manual status enum (current) | XState is ~40KB minified; overkill for 4 states. Keep manual. |

---

## Architecture Patterns

### Recommended extraction structure

```
src/
├── composables/
│   ├── useCollectionImport.ts         # Import state machine + entry points + resume
│   ├── useDeckDeletion.ts             # Delete-deck state machine + resume
│   ├── useDeckDisplayCards.ts         # mainboard + sideboard + filtered variants
│   ├── useCollectionPagination.ts     # debounced watcher wrapping queryPage
│   ├── useCollectionFilterUrl.ts      # bidirectional URL <-> filter-state sync
│   └── useSwipe.ts                    # (existing, now also consumed by CollectionGridCardFull)
├── utils/
│   ├── collectionFilters.ts           # buildPaginationFilters + buildPaginationSort + mapping constants (pure)
│   └── importHelpers.ts               # parseTextImportLine, buildCollectionCardFromScryfall, etc. (pure)
├── components/collection/
│   ├── CollectionGridCard.vue         # thin routing shell (~20 lines)
│   ├── CollectionGridCardCompact.vue  # compact variant
│   └── CollectionGridCardFull.vue     # full variant with useSwipe wired
└── views/
    └── CollectionView.vue             # < 400 lines — orchestrator only
```

### Pattern 1: State-machine-as-composable

**What:** Wrap state machine + localStorage persistence + side-effect orchestrators in a composable. Expose `{ state, isActive, start(), resume(), cancel() }`.
**When to use:** Import and delete-deck both fit this.
**Phase 02 reference:** `useDashboardMatches.ts` in Plan 02-B — same pattern (though later orphaned for a different reason).

### Pattern 2: Pure-helper extraction (02-A style)

**What:** Move pure functions to `src/utils/`, unit-test them, replace inline uses with imports.
**When to use:** `buildPaginationFilters`, `buildPaginationSort`, `parseTextImportLine`, `buildCollectionCardFromScryfall`, etc.
**Phase 02 reference:** `src/utils/matchExpiry.ts` + `src/utils/matchGrouping.ts` in Plan 02-A.

### Pattern 3: Thin routing shell

**What:** A parent component picks between 2+ variants based on a prop. Variants receive full props and re-emit events unchanged.
**When to use:** ARCH-05 (CollectionGridCard compact/full).

### Pattern 4: URL-state sync composable

**What:** `useXxxUrl(state)` takes refs, sets up bidirectional watcher: state → `router.replace({ query })` and `route.query` → state. Uses a `hydrating` guard to prevent ping-pong.
**When to use:** NICE-10.

### Anti-patterns to avoid

- **Don't re-instantiate composables across plans.** 02-B Amendment I lesson: sharing state (discardedMatchIds Set) requires passing refs into a second composable, NOT calling the first composable again. The plans here must similarly pass shared state (e.g., filter-state refs) between composables, not re-instantiate `useCardFilter`.
- **Don't break module-level singleton flags.** `isImportRunning`/`isDeleteRunning` must remain module-scoped inside the new composable files.
- **Don't parallel-edit CollectionView.vue.** See risks table — merge conflicts.
- **Don't silently widen types.** If `DisplayDeckCard` needs expansion, flag it in Plan README; don't hide it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Touch event listeners | Inline `handleTouchStart/Move/End` (currently at CollectionGridCard:86-127) | Existing `useSwipe.ts` | Already written, 78 lines, supports threshold + callbacks. ARCH-06 is literally this. |
| Custom URL-to-state serializer | JSON.stringify filter object into `?filters=` | Flat top-level query params (`?q=&status=&sort=`) | Browsers, search engines, and Vue Devtools all handle flat params better. |
| LocalStorage wrapper | New abstraction | Keep inline `try/catch + localStorage.getItem/setItem` as in current import/delete code | Works today, survived QuotaExceededError handling. Don't re-abstract. |
| Debounce utility | Custom hook | Keep `setTimeout`/`clearTimeout` as in :719-744 | 25 lines, no new dep. |
| Virtual list | Manual windowing | Already using `@tanstack/vue-virtual` via `useVirtualGrid` | Established. |

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `localStorage['cranial_deck_import_progress']` (import state), `localStorage['cranial_delete_deck_progress']` (delete state). `collectionSummary` lives in store, not localStorage. | **None.** Composable extraction preserves same keys verbatim. Verify with `grep IMPORT_STORAGE_KEY` after extraction. |
| Live service config | None. No external service (n8n, Datadog, etc.) has "CollectionView" or "collection_import_progress" in its config. | None. |
| OS-registered state | None. No Task Scheduler / cron / pm2 entry references these names. | None. |
| Secrets / env vars | None referenced by name in this scope. | None. |
| Build artifacts | CollectionView.vue is dynamic-imported via `router/index.ts:49`. No install-time artifact carries the file name. | None. |

**The canonical question:** After every edit is complete, what survives in localStorage?
- `cranial_deck_import_progress` — key name must not change, or existing in-progress imports across user sessions break on the first deploy after the change.
- `cranial_delete_deck_progress` — same constraint.
- Plan must assert: "Storage keys are byte-identical before and after refactor."

---

## Common Pitfalls

### Pitfall 1: Orphan-composable (Phase 02 replay risk)

**What goes wrong:** Building a composable that turns out to have no consumer because the assumed host view was retired / unreachable / superseded.
**Why it happens:** Plans the composable without verifying routing AND verifying no superseding component exists.
**How to avoid:** Plan A (pure helpers) verifies CollectionView is mounted at `/collection` and hosts deck editing via `/decks/*` redirects. Subsequent plans assert "view rendered" via smoke test BEFORE claiming composable provides value.
**Warning signs:** "Will this actually be consumed? Let me grep again." should be asked at plan end, not later.

### Pitfall 2: Parallel sibling drift

**What goes wrong:** `handleDeckGridRemove` (:1497) gets extracted; `handleBinderGridRemove` (:2260) gets left behind or moved later. Now the extraction of one triggers a cascade of type updates the other doesn't see, or there are 2 inconsistent code paths.
**Why it happens:** The twin is 800 lines away in the same file — out of sight.
**How to avoid:** Plans that touch any `handleDeckGrid*` handler MUST move ALL `handleBinderGrid*` twins in the same commit (Rule 6). Plan README lists the parallel pairs.
**Warning signs:** A plan extracting deck handlers without mentioning binders — reject and rescope.

### Pitfall 3: URL-sync ping-pong (NICE-10 specific)

**What goes wrong:** Filter change → watcher writes to query → route-query watcher fires → tries to write back to filter → loops forever OR loses user input mid-type.
**Why it happens:** Bidirectional watchers without a re-entry guard.
**How to avoid:** Guard with a `isHydrating` ref. On mount: set true → hydrate from URL → nextTick → set false. On state change: skip if `isHydrating.value === true`.
**Warning signs:** Dev console shows same query param being set repeatedly; input field loses focus or characters on rapid typing.

### Pitfall 4: shallowRef broken by deep assignment

**What goes wrong:** A new composable takes `collectionStore.cards` (a `shallowRef<Card[]>`) and mutates it via `.push()` or `.splice()` inside a computed. UI fails to update OR updates on every render.
**Why it happens:** `shallowRef` tracks the top reference only.
**How to avoid:** Never mutate `collectionStore.cards` directly. Use store methods (`updateCard`, `confirmImport`). Computeds are read-only.
**Warning signs:** MEMORY.md `vue_reactivity_large_collections` already logged this class of bug.

### Pitfall 5: NICE-09 behavior change

**What goes wrong:** `collectionSummary` becomes `computed(() => { totalCards: cards.value.length, ... })`. But `totalCards` currently reflects the **card_index** count ([stores/collection.ts:330-335](C:/Users/srpar/WebstormProjects/cranialTrading/src/stores/collection.ts#L330-L335)), which includes cards not yet materialized into `cards.value` during progressive loads.
**Why it happens:** Two sources of truth pre-refactor; the `computed` can only derive from one.
**How to avoid:** Decision needed in discuss-phase: either (a) keep `collectionSummary` tracking the index (manual assign stays but becomes computed-*like* via a helper), or (b) let it track `cards.value` and accept the pre-load value dips. Test must assert expected behavior.
**Warning signs:** Visible total count flickers during load after this change — users may report "my collection looks empty for a second."

### Pitfall 6: Import helper extraction breaks Scryfall rate limiter

**What goes wrong:** `_enrichCardsWithFallbackSearch` ([:2028](C:/Users/srpar/WebstormProjects/cranialTrading/src/views/CollectionView.vue#L2028)) relies on Scryfall rate limiting baked into `searchCards`. Moving it to `src/utils/importHelpers.ts` might work, but only if the util still imports from the service — not from a mock.
**Why it happens:** "Pure function" extraction sometimes pulls in service deps.
**How to avoid:** These helpers are not fully pure; `_enrichCardsWithFallbackSearch` calls `searchCards` (a Scryfall service). Label them as "side-effectful helpers" not "pure." Their tests mock `searchCards`. Only `parseTextImportLine`, `buildCollectionCardFromScryfall`, `buildRawMoxfieldCard`, `buildRawCsvCard` are truly pure.

---

## Code Examples

### Routing shell for CollectionGridCard (ARCH-05)

```vue
<!-- src/components/collection/CollectionGridCard.vue -->
<script setup lang="ts">
import CollectionGridCardCompact from './CollectionGridCardCompact.vue'
import CollectionGridCardFull from './CollectionGridCardFull.vue'
import type { Card } from '../../types/card'

const props = withDefaults(defineProps<{
  card: Card; compact?: boolean; readonly?: boolean
  showInterest?: boolean; isInterested?: boolean
  showCart?: boolean; isInCart?: boolean
  isBeingDeleted?: boolean; selectionMode?: boolean; isSelected?: boolean
}>(), { compact: false, readonly: false, showInterest: false, isInterested: false,
        showCart: false, isInCart: false, isBeingDeleted: false,
        selectionMode: false, isSelected: false })

const emit = defineEmits<{
  cardClick: [card: Card]; delete: [card: Card]; interest: [card: Card]
  addToCart: [card: Card]; toggleSelect: [cardId: string]
}>()
</script>
<template>
  <CollectionGridCardCompact v-if="compact" v-bind="props"
    @card-click="emit('cardClick', $event)" @delete="emit('delete', $event)"
    @interest="emit('interest', $event)" @add-to-cart="emit('addToCart', $event)"
    @toggle-select="emit('toggleSelect', $event)" />
  <CollectionGridCardFull v-else v-bind="props"
    @card-click="emit('cardClick', $event)" @delete="emit('delete', $event)"
    @interest="emit('interest', $event)" @add-to-cart="emit('addToCart', $event)"
    @toggle-select="emit('toggleSelect', $event)" />
</template>
```

### useSwipe consumption in FullCard (ARCH-06)

```typescript
// Inside CollectionGridCardFull.vue <script setup>
import { computed, ref } from 'vue'
import { useSwipe } from '../../composables/useSwipe'

const cardRef = ref<HTMLElement | null>(null)
const STATUS_ORDER: CardStatus[] = ['collection', 'trade', 'sale', 'wishlist']

const cycleStatus = async () => {
  if (props.readonly || props.isBeingDeleted) return
  const i = STATUS_ORDER.indexOf(props.card.status)
  const next = STATUS_ORDER[(i + 1) % STATUS_ORDER.length] ?? 'collection'
  await collectionStore.updateCard(props.card.id, { status: next })
  toastStore.show(t('cards.grid.statusChanged', { status: next }), 'success')
}

const { isSwiping, swipeOffset } = useSwipe(cardRef, {
  threshold: 80,
  onSwipeLeft: () => {
    if (props.readonly || props.isBeingDeleted) return
    emit('delete', props.card)
  },
  onSwipeRight: () => { void cycleStatus() },
})

// Clamped offset for visual indicator
const clampedOffset = computed(() => Math.max(-120, Math.min(120, swipeOffset.value)))
const swipeStyle = computed(() => isSwiping.value
  ? { transform: `translateX(${clampedOffset.value}px)`, transition: 'none' }
  : {})
```

No inline `@touchstart/move/end` handlers in the template — succeeds criterion 3.

### URL-state sync composable sketch (NICE-10)

```typescript
// src/composables/useCollectionFilterUrl.ts
import { ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useCollectionFilterUrl(state: {
  filterQuery: Ref<string>; statusFilter: Ref<string>; sortBy: Ref<string>
  // ... other refs
}) {
  const route = useRoute(); const router = useRouter()
  const isHydrating = ref(true)

  // Hydrate from URL once
  const hydrate = () => {
    const q = route.query
    if (typeof q.q === 'string') state.filterQuery.value = q.q
    if (typeof q.status === 'string') state.statusFilter.value = q.status as never
    if (typeof q.sort === 'string') state.sortBy.value = q.sort as never
    // ...
  }
  hydrate()
  // Allow watchers to fire on next tick
  void Promise.resolve().then(() => { isHydrating.value = false })

  // Watch state, write to URL (replace — do not push history entries on typing)
  watch([state.filterQuery, state.statusFilter, state.sortBy], () => {
    if (isHydrating.value) return
    const query = { ...route.query,
      q: state.filterQuery.value || undefined,
      status: state.statusFilter.value === 'all' ? undefined : state.statusFilter.value,
      sort: state.sortBy.value === 'recent' ? undefined : state.sortBy.value,
    }
    void router.replace({ query })
  })
}
```

---

## Plan-Slicing Recommendation

Based on inventory, file size, parallel siblings, and 02-A/B/C/D lessons.

### Proposed 5-plan structure

**All plans execute sequentially on CollectionView.vue (cannot parallelize edits to one file).** Separate-file work (utilities, CollectionGridCard split) CAN run in parallel if needed, but keeping a single executor avoids the 02-B `--no-verify` lint-smuggling issue.

#### Plan 03-A — Pure-helper foundation (02-A pattern, ~200 lines moved, no view-level impact)

**Provides:**
- `src/utils/collectionFilters.ts` — `buildPaginationFilters`, `buildPaginationSort`, color/type/rarity mapping constants (currently :549-554, :650-716).
- `src/utils/importHelpers.ts` — `parseTextImportLine`, `buildCollectionCardFromScryfall`, `buildRawMoxfieldCard`, `buildRawCsvCard` (pure subset of :1864-2097).
- NICE-07 fix: remove redundant `computed(() => props.cards)` wrapper in CollectionGrid.vue (:42).
- NICE-08 fix: hoist `useCollectionStore()` call to composable setup in useCollectionTotals.ts (:98, :186).
- Unit tests for each util (RED → GREEN).

**Depends on:** nothing.
**Blast radius:** 3 new util files, 3 modified files (CollectionGrid.vue, useCollectionTotals.ts, CollectionView.vue — import swaps only). ~-200 LOC from CollectionView.
**Rationale:** Low-risk warm-up, closes 2 NICE items, gives next plan a proven testing pattern.

#### Plan 03-B — Filter + URL state + pagination composable (ARCH-02 slice, ARCH-06 URL part, NICE-10)

**Provides:**
- `src/composables/useCollectionFilterUrl.ts` — bidirectional URL ↔ filter state sync (NICE-10).
- `src/composables/useCollectionPagination.ts` — wraps debounced watcher + `buildPaginationFilters` from Plan A + cleanup timer (:647-749 moves here).
- Wire both into CollectionView.vue; delete the inline watcher + `buildPagination*` calls (already pure-moved in Plan A).
- Extend `collection-filters.spec.ts` with one E2E: change filter → check URL → reload → filter restored.

**Depends on:** Plan 03-A (consumes `collectionFilters.ts`).
**Blast radius:** 2 new composables, CollectionView.vue, 1 E2E. ~-150 LOC from CollectionView.
**Rationale:** NICE-10 is the visible win; pagination is mechanical.

#### Plan 03-C — State-machine composables (ARCH-02 biggest slice)

**Provides:**
- `src/composables/useCollectionImport.ts` — owns `ImportState`, localStorage layer, `handleImport/Direct/Csv/BinderImport/*`, `resumeImport`. ~1200 lines move here. Module-level `isImportRunning` stays in the file.
- `src/composables/useDeckDeletion.ts` — owns `DeleteDeckState`, persistence, `handleDeleteDeck` / `executeDeleteDeck` / `resumeDeleteDeck`. ~200 lines. Module-level `isDeleteRunning` stays in the file.
- Add regression tests for both state machines (previously zero coverage — MEMORY.md `card_index_deletion_failures` confirms this is risk-surface).
- Wire both into CollectionView.vue `onMounted`.

**Depends on:** Plan 03-A (imports `importHelpers.ts`).
**Blast radius:** 2 large composables, 2 test files, CollectionView.vue. ~-1400 LOC from CollectionView. **Biggest merge-conflict risk.** Cannot parallelize.
**Rationale:** This is the bulk of ARCH-02.

#### Plan 03-D — CollectionGridCard split + useSwipe wiring (ARCH-05, ARCH-06)

**Provides:**
- `src/components/collection/CollectionGridCardCompact.vue` — ~120-line extracted compact variant.
- `src/components/collection/CollectionGridCardFull.vue` — ~500-line full variant with `useSwipe` wired (NO inline touch handlers).
- `src/components/collection/CollectionGridCard.vue` — rewritten as ~25-line shell.
- Add unit tests for both new variants and an expanded `useSwipe` test (composable is currently untested).

**Depends on:** nothing (parallel-safe with Plan 03-C since different files).
**Blast radius:** 3 component files, 2+ new test files. CollectionGrid.vue unchanged (consumer API preserved). CollectionView.vue unchanged.
**Rationale:** Self-contained; leverages `useSwipe`; closes ARCH-05 + ARCH-06 in one shot.

#### Plan 03-E — Deck display cards + final view thinning + NICE-09 (ARCH-02 closeout)

**Provides:**
- `src/composables/useDeckDisplayCards.ts` — extracts `mainboardDisplayCards`, `sideboardDisplayCards`, filtered variants, and the 4 count computeds. ~225 LOC move.
- NICE-09: convert `collectionSummary` to a `computed` in `stores/collection.ts` (behavior-preservation test required — document the intentional change).
- Final view thinning: inline the last cleanup helpers, verify CollectionView.vue < 400 lines, fix any type-width / dead-import fallout.
- Final full E2E suite pass; version bump.

**Depends on:** Plans 03-A, 03-C (transitively).
**Blast radius:** 1 new composable, `stores/collection.ts`, CollectionView.vue, tests.
**Rationale:** Closeout plan modeled on 02-D.

### Sequencing

```
03-A (utils)  ────▶  03-B (filter URL + pagination)
    │                    │
    └──────────▶  03-C (import + delete machines) ──┐
                                                    │
                 03-D (grid card split)  ───────────┼──▶ 03-E (deck display + NICE-09 + thinning)
                   (parallel-safe after A)          │
                                                    │
```

**03-D** can run in parallel with 03-B or 03-C because it only touches `components/collection/`. In practice — prefer sequential execution per the 02-B lint-smuggling lesson.

### Success criteria mapping

| Success criterion (ROADMAP:56-59) | Plan that closes it |
|---|---|
| 1. CollectionView.vue < 400 lines | 03-E (after 03-A: -200, 03-B: -150, 03-C: -1400, 03-E: -225 + cleanup = ~2200 line net reduction; starting from 4579 → ~2380 is not enough). **SIZING RED FLAG — see below.** |
| 2. Routing shell with Compact/Full | 03-D |
| 3. No inline touch listeners | 03-D |
| 4. Filter/sort state in URL survives refresh | 03-B |

### ⚠ Sizing red flag

With current estimates (~200 + 150 + 1400 + 225 = 1975 lines removed from CollectionView.vue), the view lands at ~2600 lines — **still well above the < 400 target.** To hit 400:

- Additional extractions needed: bulk-selection machinery (:1169-1366, ~200 LOC), card-operation handlers (:1422-1722, :2250-2383 ~540 LOC), export handlers (:3194-3345 ~150 LOC), keyboard shortcuts (:3627-3666 ~40 LOC), view-mode switching (:122-172 ~50 LOC).
- Plausible additional composables: `useCollectionBulkActions`, `useDeckGridHandlers` + `useBinderGridHandlers` (parallel siblings!), `useCollectionExport`, `useCollectionKeyboardShortcuts`.

**Planner must either** (a) add a Plan 03-F for these remaining extractions, or (b) reshape 03-C/03-E to absorb them. With ~886 lines of template plus imports and orchestration, the floor for CollectionView.vue is probably ~600-700 lines even with aggressive extraction (the template itself is 886 lines and cannot shrink without splitting into sub-views).

**Recommendation:** Discuss-phase should challenge the "< 400 lines" target. Options:
1. Keep 400 but split the template into sub-view components (`<CollectionModeView />`, `<DecksModeView />`, `<BindersModeView />`) — significant additional work.
2. Relax target to "< 800 lines" (still 5.7x reduction, still meaningful).
3. Keep 400 but scope the phase to 7+ plans.

This is a **user decision** and belongs in CONTEXT.md. Flag prominently.

---

## State of the Art

| Old approach | Current approach | When changed | Impact |
|---|---|---|---|
| Options API mega-view | Composition API with composable extraction | Vue 3 (2020+) | Project already on this path per CLAUDE.md. |
| Manual touch handlers | `useSwipe`-style composable | Existing in this repo since ???? | Just needs consumption. |
| Ad-hoc localStorage | Pinia persistence plugin | Available but not used | Module-level flags + try/catch remain idiomatic for this project. Not worth changing. |

**Deprecated/outdated:**
- Using `computed(() => props.cards)` as a "performance shield" — redundant when `props.cards` is already reactive. NICE-07.
- Calling `useStore()` inside async callbacks — Pinia setup store pattern expects store hooks at composable setup time. NICE-08.
- Manually syncing a `ref<Summary>` from multiple writer paths — `computed` is cheaper and correct-by-construction. NICE-09.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | URL param names (`?q=`, `?status=`, `?sort=`, etc.) not already reserved by any other view / SEO requirement | Q9 / NICE-10 | Schema collision; SEO impact. Discuss-phase should lock. |
| A2 | `collectionSummary` can safely track `cards.value.length` instead of `card_index` count post-refactor | Q7 / NICE-09 | UI shows "0 cards" briefly on load for some users. Mitigate with a fallback or keep `ref` but flag as tech debt. |
| A3 | The template's 886 lines can stay in CollectionView.vue and still hit "< 400 lines" via creative sub-component extraction (not just script extraction) | Plan sizing | Hard blocker. See "Sizing red flag". |
| A4 | `parseTextImportLine`, `buildCollectionCardFromScryfall`, `buildRawMoxfieldCard`, `buildRawCsvCard` are truly pure (don't implicitly rely on the `collectionStore` or similar) | Plan 03-A | Test failure; rollback to in-view helpers. Low risk because they take plain args. |
| A5 | Parallel-sibling pairs (deck/binder handlers) are **all and only** listed at :1475-1642 and :2250-2383 | Plan 03-E (when handlers extract) | Missed sibling → Rule 6 violation → user-visible inconsistency. Re-grep `handleDeck*` vs `handleBinder*` at plan time. |
| A6 | `useSwipe.ts` has not been modified since 2026-04-15 and still matches the 78-line API documented here | Q8 / Plan 03-D | API drift → refactor breaks. Re-read composable at plan time. |
| A7 | No VueUse dependency is pulled in that would offer a cheaper URL-sync primitive | "Alternatives Considered" | Custom composable is ~30 lines — marginal cost even if VueUse offers `useUrlSearchParams`. Low risk. |

**If this table has rows (and it does):** All are candidates for CONTEXT.md discussion points during `/gsd-discuss-phase`.

---

## Open Questions

1. **Hard scope question: is "< 400 lines" literally enforceable?**
   - What we know: template alone is 886 lines; template splitting is out-of-phase-scope per ROADMAP.
   - What's unclear: whether the user meant "< 400 lines of script" or "< 400 lines total including template."
   - Recommendation: Surface in CONTEXT.md as the first question. Without this answered, Plan 03-E cannot know when it's "done."

2. **NICE-09 semantics:** `collectionSummary` — does it track `cards.value` (fastest-changing, loses "total before load" value) or the index (slower-changing, but matches server truth)?
   - What we know: both sources of truth exist; current behavior is index-based.
   - What's unclear: user preference for "progressive loading feel" vs "accurate number immediately."
   - Recommendation: Lock in discuss-phase; add behavior-preservation test.

3. **URL param semantics:** Should clearing a filter (`X` button) replace history or push it?
   - What we know: nothing — this is purely a UX choice.
   - Recommendation: `router.replace` always (prevents back-button spam mid-typing).

4. **URL param omission:** Should defaults (`?status=all`, `?sort=recent`) be written to the URL or omitted?
   - Recommendation: omit defaults — cleaner URLs, easier manual link sharing.

5. **Should `viewMode` (`collection`/`decks`/`binders`) also be URL-synced?** Deep-links like `/collection?mode=decks&deck=abc` would be shareable. Partially exists today (`?deck=` switches mode, `?from=binders` sets mode).
   - Recommendation: Yes — folds into NICE-10 naturally.

---

## Environment Availability

> Phase is pure code/config. No external tooling required beyond standard project commands (`npm`, `npx`, already in use).

Skipped — no dependencies.

---

## Validation Architecture

(`workflow.nyquist_validation` not inspected — including section to be safe.)

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest (unit) + Playwright (E2E) |
| Config file | `vitest.config.ts` (inferred from CLAUDE.md), `playwright.config.ts` |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm run test:unit && npm run e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|---|---|---|---|---|
| ARCH-02 (import) | Import state machine transitions correctly | unit (composable) | `npm run test:unit -- useCollectionImport` | ❌ Plan 03-C |
| ARCH-02 (delete-deck) | Delete-deck resumes from error | unit (composable) | `npm run test:unit -- useDeckDeletion` | ❌ Plan 03-C |
| ARCH-02 (filter-map) | `buildPaginationFilters` converts categories correctly | unit (util) | `npm run test:unit -- collectionFilters` | ❌ Plan 03-A |
| ARCH-02 (deck-display) | `useDeckDisplayCards` hydrates 3 sources | unit (composable) | `npm run test:unit -- useDeckDisplayCards` | ❌ Plan 03-E |
| ARCH-02 (pagination) | Debounced watcher fires queryPage 300ms after filter change | unit (composable) | `npm run test:unit -- useCollectionPagination` | ❌ Plan 03-B |
| ARCH-05 | Shell renders Compact when `compact=true`, Full otherwise | unit (component) | `npm run test:unit -- CollectionGridCard` | ❌ Plan 03-D |
| ARCH-06 | Full card uses `useSwipe`; no inline listener | source grep + unit | `grep "@touchstart\\|@touchmove\\|@touchend" src/components/collection/CollectionGridCardFull.vue` = 0 | ❌ Plan 03-D |
| NICE-07 | CollectionGrid has no redundant `computed(() => props.cards)` | source grep | `grep "computed.*props.cards" src/components/collection/CollectionGrid.vue` = 0 | ❌ Plan 03-A |
| NICE-08 | `useCollectionStore` is called once, at composable setup | source grep | `grep "useCollectionStore" src/composables/useCollectionTotals.ts` = 1 | ❌ Plan 03-A |
| NICE-09 | `collectionSummary` is a `computed`, not a `ref` | source grep + unit | `grep "const collectionSummary = ref" src/stores/collection.ts` = 0 | ❌ Plan 03-E |
| NICE-10 | Filter/sort state round-trips through URL | e2e + unit | `npm run e2e -- collection-filters.spec.ts` (new test) | ✅ extend existing |
| "< 400 lines" | CollectionView.vue line count | shell | `wc -l src/views/CollectionView.vue` < 400 | ❌ Plan 03-E gate |

### Sampling rate
- **Per task commit:** `npm run test:unit -- <changed composable>` (fast, ~seconds).
- **Per wave merge:** `npm run test:unit && npx vue-tsc --noEmit && npx vite build`.
- **Phase gate:** Full `npm run test:unit && npm run e2e` green before `/gsd-verify-work`.

### Wave 0 gaps
- [ ] `tests/unit/utils/collectionFilters.test.ts` — covers ARCH-02 filter-map
- [ ] `tests/unit/utils/importHelpers.test.ts` — covers parseTextImportLine + builders
- [ ] `tests/unit/composables/useCollectionImport.test.ts` — state machine coverage
- [ ] `tests/unit/composables/useDeckDeletion.test.ts` — state machine coverage
- [ ] `tests/unit/composables/useDeckDisplayCards.test.ts` — hydration coverage
- [ ] `tests/unit/composables/useCollectionPagination.test.ts` — debounce coverage
- [ ] `tests/unit/composables/useCollectionFilterUrl.test.ts` — URL sync coverage
- [ ] `tests/unit/composables/useSwipe.test.ts` — composable currently untested
- [ ] `tests/unit/components/CollectionGridCard.test.ts` — shell routing coverage
- [ ] `tests/unit/components/CollectionGridCardCompact.test.ts` — compact variant
- [ ] `tests/unit/components/CollectionGridCardFull.test.ts` — full variant + swipe
- [ ] Extended `e2e/specs/collection/collection-filters.spec.ts` — URL persistence

---

## Security Domain

> Not applicable to this phase — no new auth, crypto, session, or input-validation surface. All changes are structural refactors.

Skipped (treat as reviewed: this phase is scaffolding only).

---

## Signals for the planner

- **Do NOT plan in parallel on CollectionView.vue.** Merge conflict on the 3.6k-line script is near-certain. Separate-file work (utilities, components, stores) can parallelize if desired.
- **Do NOT assume "< 400 lines" is achievable with 5 plans.** Flag it to the user in CONTEXT.md discussion.
- **Do NOT orphan a composable.** Re-verify `/collection` mounts CollectionView before each plan (1-line check).
- **DO move parallel siblings atomically** (deck handler + binder handler in same commit).
- **DO preserve localStorage keys byte-identical.** In-flight imports persist across deploys.
- **DO fix lint after each wave** to avoid 02-B's `--no-verify` smuggling.
- **DO extend the E2E filter spec for NICE-10.** One test is enough; keep it cheap.
- **DO run `grep "onMounted(async"` after every plan touches the view** to catch accidental AXSS-07 regression even though the phase doesn't own it.
- **Consider the template as a line-budget elephant.** 886 lines stay put unless discussed.

---

## Sources

### Primary (HIGH confidence — direct file inspection)
- `src/views/CollectionView.vue` (read lines 1-150, 150-549, 549-769, 845-1069, 2455-2525, 3034-3165, 3346-3625, and Grep full-file handler/state index)
- `src/components/collection/CollectionGridCard.vue` (read complete file, 704 lines)
- `src/components/collection/CollectionGrid.vue` (read complete file, 108 lines)
- `src/composables/useSwipe.ts` (read complete file, 78 lines)
- `src/composables/useCollectionTotals.ts` (read lines 1-80, 80-210, Grep for `useCollectionStore()`)
- `src/composables/useCardFilter.ts` (read lines 1-80, Grep for ref declarations)
- `src/stores/collection.ts` (read lines 1-30, 225-395, Grep for `collectionSummary`)
- `src/router/index.ts` (read complete file, 213 lines)
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- `.planning/phases/02-dashboardview-decomposition/02-A-SUMMARY.md`, `02-B-SUMMARY.md`, `02-D-SUMMARY.md`
- `CLAUDE.md` (project instructions in system prompt)
- `e2e/specs/collection/collection-filters.spec.ts` (read complete)
- `e2e/pages/collection.page.ts` (read lines 1-70)

### Secondary (MEDIUM — MEMORY.md references)
- MEMORY.md `vue_reactivity_large_collections` (informs shallowRef invariant)
- MEMORY.md `card_index_deletion_failures` (informs delete-deck risk area)
- MEMORY.md `html_landmark_uniqueness` (Phase 01 lesson, unrelated to phase 3 directly)

### Tertiary
- None needed — all claims are file-backed.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, versions visible in imports
- Architecture / extraction structure: HIGH — follows 02-A/B/C/D pattern exactly
- Pitfalls: HIGH — drawn from Phase 02 summaries' lessons learned
- Plan sizing: MEDIUM — line-count estimates are educated guesses; the template-size question is unresolved (see Sizing red flag)
- URL schema: MEDIUM — schema is a proposal; locks in discuss-phase

**Research date:** 2026-04-15
**Valid until:** ~2026-04-30 (file is large and may drift; re-verify if research is >2 weeks old at plan time)
