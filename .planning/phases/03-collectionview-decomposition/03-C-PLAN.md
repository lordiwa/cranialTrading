---
phase: 03-collectionview-decomposition
plan: C
type: execute
wave: 3
depends_on:
  - B
files_modified:
  - src/views/DeckView.vue
  - src/views/BinderView.vue
  - src/views/CollectionView.vue
  - src/router/index.ts
autonomous: true
requirements:
  - ARCH-02

must_haves:
  truths:
    - "DeckView.vue is a standalone route-level view mounted at /decks/:id? (per D-01, D-02, D-08)"
    - "BinderView.vue is a standalone route-level view mounted at /binders/:id? (per D-01, D-02, D-08)"
    - "CollectionView.vue no longer contains viewMode ref, switchToDecks, switchToCollection, switchToBinders functions (per D-03)"
    - "CollectionView.vue no longer contains ANY deck handler (handleDeckGrid*) or binder handler (handleBinderGrid*) (per D-12)"
    - "The /decks/* redirect routes are replaced with first-class route definitions for DeckView (per D-02)"
    - "Each view is self-contained — no shared layout wrapper needed (per D-04)"
    - "Navigation between collection/decks/binders uses router.push to the respective route"
    - "Users can link directly to /decks/abc123 to open a specific deck (per D-01)"
    - "Users can link directly to /binders/abc123 to open a specific binder (per D-01)"
    - "Deck handlers (handleDeckGridRemove, handleDeckGridEdit, handleDeckGridQuantityUpdate, etc.) live in DeckView — not CollectionView (per D-12)"
    - "Binder handlers (handleBinderGridRemove, handleBinderGridEdit, handleBinderGridQuantityUpdate, etc.) live in BinderView — not CollectionView (per D-12)"
    - "Each view independently loads its data in onMounted (collection, decks, binders)"
    - "CollectionView.vue is under 600 lines after this plan (D-06 acceptable range)"
  artifacts:
    - path: "src/views/DeckView.vue"
      provides: "Deck editor route-level view with deck selection, mainboard/sideboard grids, deck stats footer, import/export/delete actions"
    - path: "src/views/BinderView.vue"
      provides: "Binder editor route-level view with binder selection, binder grid, import/export/delete actions"
    - path: "src/views/CollectionView.vue"
      provides: "Collection-only view — card grid, status filters, bulk selection, wishlist section"
    - path: "src/router/index.ts"
      provides: "First-class routes for /decks/:id? and /binders/:id?"
  key_links:
    - from: "src/router/index.ts"
      to: "src/views/DeckView.vue"
      via: "{ path: '/decks/:id?', component: () => import('../views/DeckView.vue') }"
    - from: "src/router/index.ts"
      to: "src/views/BinderView.vue"
      via: "{ path: '/binders/:id?', component: () => import('../views/BinderView.vue') }"
    - from: "src/views/DeckView.vue"
      to: "src/composables/useCollectionImport.ts"
      via: "const { handleImport, handleImportDirect, handleImportCsv, ... } = useCollectionImport({...})"
    - from: "src/views/DeckView.vue"
      to: "src/composables/useDeckDeletion.ts"
      via: "const { handleDeleteDeck, isDeletingDeck, ... } = useDeckDeletion({...})"
    - from: "src/views/BinderView.vue"
      to: "src/composables/useCollectionImport.ts"
      via: "const { handleImportBinder, handleImportBinderDirect, ... } = useCollectionImport({...})"
---

<objective>
Split CollectionView.vue into 3 route-level views per D-01: CollectionView (card grid), DeckView (deck editor), BinderView (binder editor). Replace the /decks/* redirect routes with first-class routes. Remove the viewMode multiplexing pattern entirely.

Purpose: This is the core architectural deliverable of Phase 03. Users can now link directly to /decks/abc123 or /binders/abc123. The viewMode state machine (which was the root cause of the 4579-line monolith) is eliminated. Each view is self-contained, independently loadable, and under the 600-line target.

Output: 2 new view files, CollectionView thinned to <600 lines, router updated with first-class deck/binder routes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/03-collectionview-decomposition/03-CONTEXT.md
@.planning/phases/03-collectionview-decomposition/RESEARCH.md
@.planning/phases/03-collectionview-decomposition/03-A-SUMMARY.md
@.planning/phases/03-collectionview-decomposition/03-B-SUMMARY.md
@CLAUDE.md

<interfaces>
<!-- From Plan B composables that DeckView and BinderView will consume -->

From src/composables/useCollectionImport.ts (created in Plan B):
```typescript
export function useCollectionImport(deps: {
  collectionStore, decksStore, binderStore, toastStore, confirmStore, t,
  deckFilter: Ref<string>, binderFilter: Ref<string>, statusFilter: Ref<string>
}): {
  importProgress, isDeckImporting, getImportProgress,
  handleImport, handleImportDirect, handleImportCsv,
  handleImportBinder, handleImportBinderDirect, handleImportBinderCsv,
  resumeImport, clearImportState, loadImportState
}
```

From src/composables/useDeckDeletion.ts (created in Plan B):
```typescript
export function useDeckDeletion(deps: {
  decksStore, collectionStore, toastStore, confirmStore, t, deckFilter: Ref<string>
}): {
  deleteDeckProgress, isDeletingDeck, deleteProgress,
  handleDeleteDeck, resumeDeleteDeck, clearDeleteDeckState, loadDeleteDeckState
}
```

From src/composables/useCardFilter.ts (existing):
```typescript
export function useCardFilter<T extends FilterableCard>(cards: Ref<T[]>): { filterQuery, sortBy, groupBy, ... }
```

From src/views/CollectionView.vue — code that moves to DeckView:
- Deck state: deckFilter ref, decksList computed, selectedDeck computed (lines 365-486)
- Deck display cards: mainboardDisplayCards, sideboardDisplayCards, filtered variants (lines 845-1069)
- Deck handlers: handleDeckGridRemove, handleDeckGridEdit, handleDeckGridQuantityUpdate, handleDeckGridAddToWishlist, handleDeckGridToggleCommander, handleDeckGridMoveBoard (lines 1475-1642)
- Deck visibility/price: isDeckPublic, deckPriceSource, deckOwnedCostBySource (lines 1076-1168)
- Deck actions: handleToggleDeckPublic, handleExportDeck, handleExportDeckCsv, handleCreateDeck (lines 2385-2453, 3168-3267)
- Deck template: deck sub-tabs, deck header, mainboard/sideboard grids, deck stats footer (template lines ~3742-3777, 3821-3873, 4220-4278, 4306-4313, 4444-4549)

From src/views/CollectionView.vue — code that moves to BinderView:
- Binder state: binderFilter ref, bindersList computed, selectedBinder computed, binderDisplayCards (lines 146-172)
- Binder handlers: handleDeleteBinder, handleBinderGridEdit, handleBinderGridRemove, handleBinderGridQuantityUpdate, handleBinderGridSetStatus, handleBinderGridToggleFoil, handleBinderGridTogglePublic (lines 2202-2383)
- Binder actions: handleCreateBinder, toggleBinderPublic, toggleBinderForSale, handleExportBinder, handleExportBinderCsv (lines 1719-1862, 3268-3345)
- Binder template: binder sub-tabs, binder header, binder grid (template lines ~3789-3817, 3876-3924, 4314-4343)
</interfaces>

<key_invariants>
- The /decks/* redirect routes at router/index.ts:83-98 are REMOVED and replaced with first-class routes (D-02)
- The /dashboard redirect at router/index.ts:43 is UNTOUCHED
- DeckView and BinderView each call useCollectionImport and useDeckDeletion from Plan B composables
- Both new views independently load collection + decks/binders in onMounted
- Tab navigation (Collection / Decks / Binders) becomes router-link navigation across all 3 views
- The 8 paired deck/binder handlers (D-12) are NO LONGER parallel siblings — deck handlers go to DeckView, binder handlers go to BinderView
- Anti-loop Rule 6 is structurally satisfied: no parallel siblings remain in the same file
- Each view uses useCardFilter for its own filter state independently
- CollectionView's onMounted no longer needs to parse ?from=decks, ?deck=, ?binder= query params (those become route params on the new views)
- async onMounted pattern exists at CollectionView:3496 — if touched, fix AXSS-07 pattern (use void initView() like SavedMatchesView); not a hard gate per CONTEXT.md deferred section
</key_invariants>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create DeckView.vue and BinderView.vue by extracting from CollectionView</name>
  <files>
    src/views/DeckView.vue,
    src/views/BinderView.vue,
    src/views/CollectionView.vue
  </files>
  <action>
**This is the structural heart of Phase 03. Read CollectionView.vue in full before starting.**

Anti-loop Rule 1: Read the ENTIRE CollectionView.vue (post-Plan-B state, ~2800 lines) to map all remaining functions, their callers, and the template sections gated by viewMode.

**Step 1: Create DeckView.vue**

Create a new file at `src/views/DeckView.vue` that is a self-contained deck editor view.

Extract from CollectionView.vue:
1. **Script — Deck state and computeds:**
   - `deckFilter` ref (currently selects which deck is active)
   - `decksList` computed (from decksStore)
   - `selectedDeck` computed
   - `selectedDeckStats` computed
   - All deck display card computeds: `deckOwnedCards`, `deckAllocWishlistCards`, `deckMainboardWishlist`, `mainboardDisplayCards`, `sideboardDisplayCards`, `filteredMainboardDisplayCards`, `filteredSideboardDisplayCards`, `mainboardOwnedCount`, `sideboardOwnedCount`, `mainboardWishlistCount`, `sideboardWishlistCount`
   - Deck visibility/price computeds: `isDeckPublic`, `deckPriceSource`, `deckOwnedCostBySource`, `deckWishlistCostBySource`, `deckTotalCostBySource`, `deckSourceColor`, `deckActiveSourceLabel`, `deckStatsExpanded`, `deckOwnedCount`, `deckWishlistCount`
   - Commander detection: `isCommanderFormat`, `commanderNames`
   - Deck group-by: `deckGroupBy`

2. **Script — Deck handlers:**
   - `handleDeckGridRemove`, `handleDeckGridEdit`, `handleDeckGridQuantityUpdate`, `handleDeckGridAddToWishlist`, `handleDeckGridToggleCommander`, `handleDeckGridMoveBoard`
   - `handleCreateDeck`
   - `handleToggleDeckPublic`, `handleExportDeck`, `handleExportDeckCsv`

3. **Script — Deck lifecycle:**
   - DeckView's own `onMounted`: load collection, load decks, parse `route.params.id` to auto-select deck.
   - If route has `:id` param, set `deckFilter.value = route.params.id`.
   - Wire `useCollectionImport` and `useDeckDeletion` composables from Plan B.
   - Wire `useCardFilter` for deck-specific filtering.

4. **Template — Deck sections:**
   - Page header with deck-specific buttons (import, new deck, add card)
   - Tab navigation bar (Collection | Decks | Binders) — each tab is a router-link to `/collection`, `/decks`, `/binders` respectively. Active tab highlights the current route.
   - Deck sub-tabs (individual deck buttons)
   - Deck header (name, format, public toggle, export, delete)
   - Delete progress bar
   - Search/filter bar (reuse CardFilterBar component)
   - Mainboard grid section
   - Sideboard grid section
   - Empty state when no deck selected or no cards
   - Modals: ImportDeckModal, CreateDeckModal, CardDetailModal, ManageDecksModal, AddCardModal
   - Deck stats footer (Teleport to body)
   - FloatingActionButton

5. **Style — Deck-specific scoped styles** (copy relevant styles from CollectionView).

**Step 2: Create BinderView.vue**

Create a new file at `src/views/BinderView.vue` that is a self-contained binder editor view.

Extract from CollectionView.vue:
1. **Script — Binder state and computeds:**
   - `binderFilter` ref
   - `bindersList` computed, `selectedBinder` computed, `binderDisplayCards` computed, `filteredBinderDisplayCards` computed
   - `isDeletingBinder` ref

2. **Script — Binder handlers:**
   - `handleDeleteBinder`, `handleBinderGridEdit`, `handleBinderGridRemove`, `handleBinderGridQuantityUpdate`, `handleBinderGridSetStatus`, `handleBinderGridToggleFoil`, `handleBinderGridTogglePublic`
   - `handleCreateBinder`
   - `toggleBinderPublic`, `toggleBinderForSale`
   - `handleExportBinder`, `handleExportBinderCsv`
   - `performBulkBinderAllocate`

3. **Script — Binder lifecycle:**
   - BinderView's own `onMounted`: load collection, load binders, parse `route.params.id` to auto-select binder.
   - Wire `useCollectionImport` (binder import entry points) from Plan B.
   - Wire `useCardFilter` for binder-specific filtering.

4. **Template — Binder sections:**
   - Page header with binder-specific buttons
   - Tab navigation bar (same 3-tab pattern, binder tab active)
   - Binder sub-tabs (individual binder buttons)
   - Binder header (name, description, public/forSale toggles, export, delete)
   - Search/filter bar
   - Binder grid section
   - Empty state
   - Modals: ImportBinderModal (same component, different name), CreateBinderModal, CardDetailModal, AddCardModal
   - FloatingActionButton

**Step 3: Thin CollectionView.vue**

After extracting DeckView and BinderView:
1. Delete ALL code gated by `viewMode === 'decks'` or `viewMode === 'binders'` from both script and template.
2. Delete the `viewMode` ref, `ViewMode` type, `switchToDecks`, `switchToCollection`, `switchToBinders` functions.
3. Delete all deck handlers (`handleDeckGrid*`), deck computeds, deck display cards.
4. Delete all binder handlers (`handleBinderGrid*`), binder state/computeds.
5. Delete deck/binder action handlers (`handleCreateDeck`, `handleCreateBinder`, `handleToggleDeckPublic`, export/delete handlers that belong to deck/binder views).
6. Replace the 3-tab button bar with router-link navigation: `<RouterLink to="/collection">`, `<RouterLink to="/decks">`, `<RouterLink to="/binders">`.
7. Remove the deck stats footer Teleport (moved to DeckView).
8. Simplify the header (collection-only buttons).
9. Remove onMounted logic for `?from=decks`, `?deck=`, `?binder=` params (those are now route params on DeckView/BinderView).
10. Keep: collection grid, status filters, bulk selection, wishlist section, AddCardModal, CardDetailModal, CollectionTotalsPanel, FloatingActionButton, keyboard shortcuts.

**Step 4: Verify the tab navigation pattern**

Each view (Collection, Deck, Binder) has a 3-tab navigation bar at the top. The active tab matches the current route. Clicking a tab navigates via router-link. This replaces the internal viewMode switching with standard Vue Router navigation.

The tab bar should be consistent across all 3 views. Consider extracting it to a shared component (`CollectionTabBar.vue`) if it exceeds 20 lines, but inline is acceptable for this plan.

**Anti-loop Rule 1:** Before deleting ANY function from CollectionView, grep to confirm it is NOT called from the remaining collection-mode code. Only delete functions that exclusively serve deck/binder modes.

**Anti-loop Rule 6 (structural satisfaction):** After this task, deck handlers live ONLY in DeckView.vue and binder handlers live ONLY in BinderView.vue. They are no longer parallel siblings in the same file.

**i18n check:** Both new views use the same i18n keys as the original CollectionView (keys like `collection.tabs.decks`, `collection.actions.import`, `decks.messages.*`, `binders.*`). Verify all keys exist in en.json, es.json, pt.json via grep BEFORE using them. No new keys needed — all are existing.
  </action>
  <verify>
    <automated>npm run test:unit && npx vite build 2>&1 | tail -5 && wc -l src/views/CollectionView.vue src/views/DeckView.vue src/views/BinderView.vue</automated>
  </verify>
  <done>DeckView.vue and BinderView.vue exist as standalone views. CollectionView.vue no longer contains viewMode, deck handlers, or binder handlers. All 3 views are independently functional. Tests pass. Build succeeds.</done>
</task>

<task type="auto">
  <name>Task 2: Update router with first-class deck/binder routes and verify navigation</name>
  <files>
    src/router/index.ts
  </files>
  <action>
**Read `src/router/index.ts` in full before editing.**

1. **Remove the 4 /decks/* redirect routes** (lines 82-98):
   ```typescript
   // DELETE these:
   { path: '/decks', redirect: '/collection' },
   { path: '/decks/new', redirect: '/collection' },
   { path: '/decks/:deckId', redirect: to => ({ path: '/collection', query: { deck: to.params.deckId } }) },
   { path: '/decks/:deckId/edit', redirect: to => ({ path: '/collection', query: { deck: to.params.deckId } }) },
   ```

2. **Add first-class DeckView route:**
   ```typescript
   {
       path: '/decks/:id?',
       name: 'decks',
       component: () => import('../views/DeckView.vue'),
       meta: { requiresAuth: true, title: 'seo.pages.decks.title', description: 'seo.pages.decks.description', robots: 'noindex, nofollow' },
   },
   ```

3. **Add first-class BinderView route:**
   ```typescript
   {
       path: '/binders/:id?',
       name: 'binders',
       component: () => import('../views/BinderView.vue'),
       meta: { requiresAuth: true, title: 'seo.pages.binders.title', description: 'seo.pages.binders.description', robots: 'noindex, nofollow' },
   },
   ```

4. **Add i18n keys for new route titles** in en.json, es.json, pt.json:
   - `seo.pages.decks.title` / `seo.pages.decks.description`
   - `seo.pages.binders.title` / `seo.pages.binders.description`
   Verify these keys don't already exist first. Add all 3 locales atomically per CLAUDE.md i18n rule.

5. **Check for hardcoded links to `/collection?deck=`** pattern anywhere in the codebase:
   ```bash
   grep -rn "collection.*deck=\|/collection?deck\|query.*deck" src/ --include="*.vue" --include="*.ts"
   ```
   Update any found references to use the new `/decks/:id` route pattern.

6. **Check for `/decks/new` links** — update to `/decks` (DeckView without :id shows the deck list / create deck prompt).

7. **Preserve backward compatibility:** Consider adding a redirect from `/collection?deck=X` to `/decks/X` for users with old bookmarks. If the `?deck=` param is still used internally, remove it. If external (user bookmarks), add a route guard or redirect.

**CRITICAL:** The `/dashboard` redirect at line 43 is UNTOUCHED. Only `/decks/*` routes change.
  </action>
  <verify>
    <automated>npm run test:unit && npx vite build 2>&1 | tail -5 && grep -n "redirect.*collection" src/router/index.ts | grep -v dashboard</automated>
  </verify>
  <done>Router has first-class /decks/:id? and /binders/:id? routes. Old /decks/* redirects removed. i18n keys added for new routes. Hardcoded /collection?deck= links updated. Build succeeds. Navigation between all 3 views works via router.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Route params → view state | :id param in /decks/:id and /binders/:id used to select deck/binder |
| Cross-view navigation | Users navigate between collection/decks/binders via router-links |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03C-01 | Tampering | Route param :id could be an invalid deck/binder ID | mitigate | DeckView/BinderView check if ID exists in store; show empty state if not found. No Firestore query with unvalidated ID. |
| T-03C-02 | Spoofing | /decks/:id is behind requiresAuth — anonymous users redirected to login | accept | Same auth gate as /collection. No new attack surface. |
| T-03C-03 | Denial of Service | Each view independently loads collection — user navigating between views triggers multiple loads | mitigate | Collection store caches loaded data; subsequent loads are no-ops if already loaded (existing pattern). |
| T-03C-04 | Information Disclosure | Old /collection?deck=X bookmarks could break | mitigate | Add redirect or handle ?deck= param in CollectionView's onMounted to redirect to /decks/X. |
</threat_model>

<verification>
After both tasks complete:

1. `npm run test:unit` — all tests pass
2. `npx vue-tsc --noEmit` — 0 errors
3. `npx vite build` — succeeds
4. **Route verification:**
   - `/decks` renders DeckView with deck list
   - `/decks/abc123` renders DeckView with that deck selected
   - `/binders` renders BinderView with binder list
   - `/binders/abc123` renders BinderView with that binder selected
   - `/collection` renders CollectionView (collection-only, no deck/binder mode)
5. **Navigation:**
   - Collection tab → navigates to /collection
   - Decks tab → navigates to /decks
   - Binders tab → navigates to /binders
   - Clicking a deck sub-tab → navigates to /decks/:deckId
6. **Structural audit:**
   - `grep -n "viewMode" src/views/CollectionView.vue` → 0 matches
   - `grep -n "handleDeckGrid\|handleBinderGrid" src/views/CollectionView.vue` → 0 matches
   - `grep -n "switchToDecks\|switchToCollection\|switchToBinders" src/views/CollectionView.vue` → 0 matches
7. **Line counts:**
   - `wc -l src/views/CollectionView.vue` — under 600 lines (D-06 acceptable)
   - `wc -l src/views/DeckView.vue` — under 600 lines
   - `wc -l src/views/BinderView.vue` — under 400 lines
8. **i18n check:**
   - `grep -l "seo.pages.decks.title" src/locales/en.json src/locales/es.json src/locales/pt.json` → 3 files
</verification>

<success_criteria>
- DeckView.vue exists at /decks/:id? with all deck editing functionality
- BinderView.vue exists at /binders/:id? with all binder editing functionality
- CollectionView.vue contains ONLY collection-mode code (no viewMode, no deck/binder handlers)
- Router has first-class routes for all 3 views
- Old /decks/* redirects removed
- Tab navigation works across all 3 views
- Each view loads independently
- All views under 600 lines (D-06)
- i18n keys exist for new routes in all 3 locales
- All tests pass, build succeeds
</success_criteria>

<output>
After completion, create `.planning/phases/03-collectionview-decomposition/03-C-SUMMARY.md`
</output>
