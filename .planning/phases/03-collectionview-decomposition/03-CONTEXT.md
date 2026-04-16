# Phase 3: CollectionView Decomposition - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Decompose the 4579-line CollectionView.vue super-view into 3 route-level views (CollectionView, DeckView, BinderView) with shared composables and services. Split CollectionGridCard into compact/full variants wired to useSwipe. Add URL-synced filter/sort state.

**Key insight:** CollectionView is actually 3 views multiplexed by `viewMode: 'collection' | 'decks' | 'binders'` (line 123). Instead of extracting composables from a monolith, split at the route level — the router becomes the state machine. Each view naturally lands in the 400-line target range after composable extraction.

</domain>

<decisions>
## Implementation Decisions

### Route-Level Split (D-01 — USER LOCKED)
- **D-01:** Split CollectionView.vue into 3 separate route-level views:
  - `/collection` → `CollectionView.vue` (card grid, filters, status tabs, import)
  - `/decks/:id?` → `DeckView.vue` (deck editor, mainboard/sideboard, allocation)
  - `/binders/:id?` → `BinderView.vue` (binder editor, allocation)
- **D-02:** Remove the `/decks/*` → `/collection?deck=XXX` redirect pattern (router/index.ts:83-98). Decks and binders get their own first-class routes. Users can link directly to a deck or binder.
- **D-03:** The `viewMode` ref + `switchToDecks/Collection/Binders` functions (CollectionView.vue:122-172) are replaced by router navigation. No more internal mode multiplexing.
- **D-04:** Shared state (collection store, card filter composable, status counts) is consumed by all 3 views independently via Pinia stores and composables. No shared layout wrapper needed — each view is self-contained.
- **D-05:** Module-scoped flags `isImportRunning` (line 4) and `isDeleteRunning` (line 5) that persist across remounts should move to Pinia store state or a shared module so they survive route transitions (e.g., user starts import on /collection, navigates to /decks, comes back — import should still be tracked).

### Line Target (D-06 — USER LOCKED)
- **D-06:** The "< 400 lines" target applies to EACH of the 3 resulting views (not just the original CollectionView). Composable extraction + route split should achieve this naturally. If a view lands at 400-600 after honest extraction, that's acceptable — don't force artificial splits.

### URL Query-Param Schema (D-07 — Claude's Discretion)
- **D-07:** Filter/sort state persisted in URL query params for each view. Schema: `?status=sale&sort=price&order=desc&search=term`. Default values omitted for clean URLs (e.g., `/collection` = all cards, default sort). `viewMode` is no longer a query param — it's the route itself.
- **D-08:** Deck/binder selection is a route param (`/decks/:id`, `/binders/:id`), not a query param. Deck list page at `/decks` (no `:id`).

### CollectionGridCard Split (D-09 — Claude's Discretion)
- **D-09:** CollectionGridCard split per ARCH-05 proceeds as planned — routing shell delegates to Compact or Full based on the existing `compact` boolean prop. This is independent of the view split and can be done in any plan that doesn't touch CollectionView.vue.
- **D-10:** Swipe migration (ARCH-06) wires useSwipe.ts into the new CollectionGridCardFull. The status-cycle-on-right-swipe behavior (CollectionGridCard.vue:86-127, threshold=80, clamp ±120) is passed as an `onSwipeRight` callback — no composable API changes needed.

### NICE-09 Summary Computed (D-11 — Claude's Discretion)
- **D-11:** Convert `collectionSummary` from manually-assigned ref to computed derived from cards. Write a behavior-preservation test first (TDD). If the computed version produces different results than the card_index/Cloud-Function source, keep the manual sync pattern and document why.

### Parallel Handler Migration (D-12 — STRUCTURAL)
- **D-12:** The 8 paired deck/binder handlers (`handleDeckGridRemove` ↔ `handleBinderGridRemove`, etc. at lines 1475-1642 vs 2250-2383) naturally split — deck handlers go to DeckView, binder handlers go to BinderView. Anti-loop Rule 6 is satisfied structurally: no more parallel siblings in the same file.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Route structure
- `src/router/index.ts` — Current route definitions; `/collection` mount at :47-51, `/decks/*` redirects at :83-98 (to be replaced)
- `src/views/CollectionView.vue` — The 4579-line super-view being decomposed

### Components being split
- `src/components/collection/CollectionGridCard.vue` — 704 lines, compact/full split target (ARCH-05)
- `src/components/collection/CollectionGrid.vue` — Frequently modified together with CollectionView (CLAUDE.md)
- `src/composables/useSwipe.ts` — Existing swipe composable (78 lines) to wire into CollectionGridCard

### Existing composables consumed by CollectionView
- `src/composables/useCardFilter.ts` — Filter state (18 named exports, lines 178/196)
- `src/composables/useCollectionTotals.ts` — NICE-08 target (lines 98, 186)
- `src/composables/useVirtualGrid.ts` — Virtual scrolling

### Store layer
- `src/stores/collection.ts` — `collectionSummary` ref at :230 (NICE-09 target)
- `src/stores/decks.ts` — Deck CRUD operations
- `src/stores/binders.ts` — Binder operations

### Phase 02 lessons (MUST read)
- `.planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md` — Lessons learned section: read router before planning, verify live route, parallel-executor lint escapes

### Project rules
- `CLAUDE.md` — Anti-loop rules, TDD mandate, i18n 3-file rule, async-onMounted prohibition

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useSwipe.ts` — Ready to wire into CollectionGridCard (API: `useSwipe(elementRef, {threshold, onSwipeLeft, onSwipeRight})`)
- `useCardFilter.ts` — Already extracted; will be consumed by all 3 views
- `useVirtualGrid.ts` — Virtual scrolling composable, used by CollectionGrid
- Pinia stores (collection, decks, binders) — shared state layer across all 3 views

### Module-Scoped State Pattern
- `isImportRunning` / `isDeleteRunning` at CollectionView.vue:4-5 are module-scoped (not component-scoped) to persist across remounts. Must be preserved during extraction — either via Pinia store state or a shared module.

### Established Patterns
- Composable extraction pattern from Phase 02: utilities first (02-A), store methods second (02-B), view wiring last (02-C)
- TDD: failing tests before implementation (CLAUDE.md mandate)
- `localStorage` keys (`cranial_deck_import_progress`, `cranial_delete_deck_progress`) must be preserved byte-identical

### Integration Points
- Router: new routes for `/decks/:id?` and `/binders/:id?` replace redirects
- Navigation: any UI that links to deck/binder editing must update to new routes (check: sidebar, deck dropdown, binder selector)
- `UserProfileView.vue:485` has `<RouterLink to="/dashboard">` — confirm no similar hardcoded links to `/collection?deck=XXX` pattern exist elsewhere

</code_context>

<specifics>
## Specific Ideas

- User explicitly requested: "dividing collection into collection, deck, binder view, so users can get a link for a binder or deck just like with collection"
- The primary motivation is linkability — users want to share/bookmark deck and binder URLs directly
- The `viewMode` multiplexing pattern is the root cause of the 4579-line monolith; eliminating it is the right architectural move

</specifics>

<deferred>
## Deferred Ideas

- **AXSS-07 on CollectionView** — async-onMounted at line 3496 is behind `requiresAuth: true`, cannot fire anonymous-user bug today. Logged as Phase 03+ tech debt in 02-D-SUMMARY.md. Fix if plan-touched, but not a hard gate.
- **Blocked-users extraction** — SavedMatchesView still has inline blocked-users code (02-C-SUMMARY.md tech debt). Not in Phase 3 scope.
- **CollectionView as shared layout wrapper** — Considered and rejected per D-04. Each view is self-contained; no `CollectionLayout.vue` wrapper needed.

</deferred>

---

*Phase: 03-collectionview-decomposition*
*Context gathered: 2026-04-15*
