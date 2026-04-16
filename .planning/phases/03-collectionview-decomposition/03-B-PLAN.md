---
phase: 03-collectionview-decomposition
plan: B
type: execute
wave: 2
depends_on:
  - A
files_modified:
  - src/composables/useCollectionImport.ts
  - src/composables/useDeckDeletion.ts
  - src/composables/useCollectionFilterUrl.ts
  - src/composables/useCollectionPagination.ts
  - tests/unit/composables/useCollectionImport.test.ts
  - tests/unit/composables/useDeckDeletion.test.ts
  - tests/unit/composables/useCollectionFilterUrl.test.ts
  - tests/unit/composables/useCollectionPagination.test.ts
  - src/views/CollectionView.vue
autonomous: true
requirements:
  - ARCH-02
  - NICE-10

must_haves:
  truths:
    - "useCollectionImport owns the import state machine (ImportState), localStorage persistence (cranial_deck_import_progress key byte-identical), all handleImport* entry points, and resumeImport"
    - "Module-scoped isImportRunning flag lives in useCollectionImport.ts file scope (not inside the composable function) to persist across remounts (per D-05)"
    - "useDeckDeletion owns the delete-deck state machine (DeleteDeckState), localStorage persistence (cranial_delete_deck_progress key byte-identical), executeDeleteDeck, resumeDeleteDeck, handleDeleteDeck"
    - "Module-scoped isDeleteRunning flag lives in useDeckDeletion.ts file scope (per D-05)"
    - "useCollectionFilterUrl provides bidirectional URL-to-filter sync: changing a filter updates the browser URL via router.replace, refreshing restores the filter state (per D-07, NICE-10)"
    - "Default filter values (status=all, sort=recent) are omitted from URL for clean URLs (per D-07)"
    - "useCollectionPagination wraps the debounced watcher that triggers collectionStore.queryPage on filter changes, consuming buildPaginationFilters and buildPaginationSort from Plan A utils"
    - "URL-sync composable uses an isHydrating guard to prevent ping-pong between state watchers and route-query watchers"
    - "localStorage keys cranial_deck_import_progress and cranial_delete_deck_progress are byte-identical after extraction"
    - "CollectionView.vue is reduced by ~1600 lines after wiring these 4 composables"
  artifacts:
    - path: "src/composables/useCollectionImport.ts"
      provides: "Import state machine composable with state, entry points, resume, localStorage persistence"
      exports: ["useCollectionImport"]
    - path: "src/composables/useDeckDeletion.ts"
      provides: "Delete-deck state machine composable with state, entry points, resume"
      exports: ["useDeckDeletion"]
    - path: "src/composables/useCollectionFilterUrl.ts"
      provides: "Bidirectional URL filter/sort sync (NICE-10)"
      exports: ["useCollectionFilterUrl"]
    - path: "src/composables/useCollectionPagination.ts"
      provides: "Debounced server-side pagination watcher"
      exports: ["useCollectionPagination"]
    - path: "tests/unit/composables/useCollectionImport.test.ts"
      provides: "State machine transition tests + localStorage persistence tests"
    - path: "tests/unit/composables/useDeckDeletion.test.ts"
      provides: "Delete-deck state transitions + resume from error tests"
    - path: "tests/unit/composables/useCollectionFilterUrl.test.ts"
      provides: "URL hydration + state-to-URL sync + isHydrating guard tests"
    - path: "tests/unit/composables/useCollectionPagination.test.ts"
      provides: "Debounce timing + queryPage call verification tests"
  key_links:
    - from: "src/composables/useCollectionImport.ts"
      to: "src/utils/importHelpers.ts"
      via: "import { parseTextImportLine, buildCollectionCardFromScryfall, ... } from '../utils/importHelpers'"
      pattern: "from.*importHelpers"
    - from: "src/composables/useCollectionPagination.ts"
      to: "src/utils/collectionFilters.ts"
      via: "import { buildPaginationFilters, buildPaginationSort } from '../utils/collectionFilters'"
      pattern: "from.*collectionFilters"
    - from: "src/views/CollectionView.vue"
      to: "src/composables/useCollectionImport.ts"
      via: "const { importProgress, isDeckImporting, handleImport, ... } = useCollectionImport()"
    - from: "src/views/CollectionView.vue"
      to: "src/composables/useCollectionFilterUrl.ts"
      via: "useCollectionFilterUrl({ filterQuery, statusFilter, sortBy, ... })"
---

<objective>
Extract the four largest inline concerns from CollectionView.vue into composables: the import state machine (~1200 lines), the delete-deck state machine (~200 lines), the filter URL sync (~100 lines), and the pagination watcher (~100 lines). Each composable is TDD'd and wired into CollectionView as a drop-in replacement.

Purpose: This is the bulk of ARCH-02 ("CollectionView decomposed into composables"). After this plan, CollectionView shrinks by ~1600 lines and the import/delete state machines become independently testable. NICE-10 (URL-synced filter state) is delivered by useCollectionFilterUrl.

Output: 4 new composable files, 4 new test files, CollectionView.vue dramatically thinned.
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
@CLAUDE.md

<interfaces>
<!-- From Plan A artifacts that this plan consumes -->

From src/utils/collectionFilters.ts (created in Plan A):
```typescript
export function buildPaginationFilters(state: FilterState): ServerFilterObject
export function buildPaginationSort(sortBy: string): { field: string; direction: 'asc' | 'desc' }
```

From src/utils/importHelpers.ts (created in Plan A):
```typescript
export function parseTextImportLine(trimmed: string): { quantity: number; cardName: string; setCode: string | null; isFoil: boolean } | null
export function buildCollectionCardFromScryfall(opts: BuildCardOpts): ImportCardData
export function buildRawMoxfieldCard(...): { cardData: ImportCardData; needsSearch: boolean }
export function buildRawCsvCard(...): ImportCardData
export interface ImportCardData { ... }
export interface MoxfieldImportCard { ... }
```

From src/views/CollectionView.vue (lines to extract — read RESEARCH.md structural inventory):

Import state machine (lines 174-240 + 1864-2249 + 2455-3032 + 3346-3467):
- ImportState interface at line 175
- importProgress ref, save/load/clearImportState helpers at lines 178-240
- Import plumbing helpers (non-pure: _enrichCardsWithFallbackSearch, etc.) at lines 1864-2249
- Import entry points (handleImport, handleImportDirect, handleImportCsv, handleImportBinder*) at lines 2455-3032
- resumeImport at lines 3346-3467
- Module-scoped isImportRunning at line 4

Delete-deck state machine (lines 242-302 + 3034-3165):
- DeleteDeckState interface at line 246
- deleteDeckProgress ref, save/load/clearDeleteDeckState helpers at lines 242-302
- executeDeleteDeck, resumeDeleteDeck, handleDeleteDeck at lines 3034-3165
- executeCardDeletionStep helper at line 2142
- Module-scoped isDeleteRunning at line 5

Pagination watcher (lines 647-749):
- buildPaginationFilters and buildPaginationSort already extracted to Plan A utils
- Debounced watcher that calls collectionStore.queryPage at lines 721-744
- onUnmounted cleanup at lines 747-749

useCardFilter refs (from src/composables/useCardFilter.ts — already extracted, consumed):
```typescript
filterQuery: Ref<string>, sortBy: Ref<'recent' | 'name' | 'price'>,
selectedColors: Ref<Set<string>>, selectedTypes: Ref<Set<string>>,
selectedRarities: Ref<Set<string>>, selectedManaValues: Ref<Set<string>>,
advFoilFilter: Ref<'any' | 'foil' | 'nonfoil'>
```
</interfaces>

<key_invariants>
- localStorage key `cranial_deck_import_progress` MUST be byte-identical after extraction
- localStorage key `cranial_delete_deck_progress` MUST be byte-identical after extraction
- Module-scoped `isImportRunning` must remain module-scoped in the NEW file (not a composable-instance ref)
- Module-scoped `isDeleteRunning` must remain module-scoped in the NEW file
- The `deckFilter.value = 'all'` call at line 3048 before deck deletion is a call-order constraint — preserve it in the composable or require the caller to do it
- The QuotaExceededError recovery in delete-deck localStorage (lines 262-276) must be preserved verbatim
- Non-pure helpers like `_enrichCardsWithFallbackSearch` (calls Scryfall service) move WITH the import composable — they are NOT pure utils
- URL-sync composable must NOT cause ping-pong: use isHydrating guard per RESEARCH.md pitfall #3
- The existing `watch(() => route.query.filter, ...)` at line 3572 that handles `?filter=wishlist` must coexist with the new URL-sync composable or be absorbed by it
</key_invariants>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract useCollectionImport + useDeckDeletion composables with TDD</name>
  <files>
    src/composables/useCollectionImport.ts,
    src/composables/useDeckDeletion.ts,
    tests/unit/composables/useCollectionImport.test.ts,
    tests/unit/composables/useDeckDeletion.test.ts,
    src/views/CollectionView.vue
  </files>
  <behavior>
    useCollectionImport:
    - State machine transitions: idle → fetching → processing → saving → allocating → complete
    - State machine transitions: any → error (on failure)
    - saveImportState persists to localStorage key 'cranial_deck_import_progress' (stripped of card arrays per line 192-198)
    - loadImportState reads from localStorage, returns null on parse error
    - clearImportState removes the key
    - isDeckImporting(deckId) returns true when import targets that deck
    - getImportProgress(deckId) returns percentage for that deck
    - resumeImport picks up from 'allocating' or 'saving' states
    - Module-scoped isImportRunning prevents duplicate executions

    useDeckDeletion:
    - State machine transitions: idle → deleting_cards → deleting_deck → complete
    - State machine transitions: any → error (on failure)
    - saveDeleteDeckState persists to localStorage key 'cranial_delete_deck_progress'
    - QuotaExceededError recovery: retries after clearing import state, then strips cardIds
    - resumeDeleteDeck picks up from 'deleting_cards' or 'deleting_deck' states
    - Module-scoped isDeleteRunning prevents duplicate executions
    - handleDeleteDeck shows 2 confirm modals before proceeding
  </behavior>
  <action>
**This is the largest extraction in Phase 03 (~1400 lines moving). Execute carefully.**

**RED phase:**
Write failing tests for both composables. For `useCollectionImport`, test:
- State transitions (mock stores, verify importProgress.value changes)
- localStorage round-trip (save → load returns same shape, clearImportState removes key)
- isDeckImporting returns correct boolean for active vs inactive deck
- Module-scoped isImportRunning prevents re-entry

For `useDeckDeletion`, test:
- State transitions (mock stores, verify deleteDeckProgress.value changes)
- localStorage round-trip for delete state
- QuotaExceededError recovery path
- resumeDeleteDeck from 'deleting_cards' state

Mock all Firebase/Scryfall calls. These are behavior tests, not integration tests.

Run `npm run test:unit` — confirm RED (tests exist, fail because composables don't exist yet).

**GREEN phase:**

1. Create `src/composables/useCollectionImport.ts`:
   - At FILE scope (outside the composable function): `let isImportRunning = false` (D-05).
   - Define `const IMPORT_STORAGE_KEY = 'cranial_deck_import_progress'` (byte-identical).
   - Move the `ImportState` interface, `importProgress` ref, `saveImportState`, `loadImportState`, `clearImportState`, `isDeckImporting`, `getImportProgress` from CollectionView.vue lines 174-240.
   - Move import plumbing helpers from lines 1864-2249: `_processImportCard`, `_applySearchResultToCard`, `_enrichCardsWithFallbackSearch`, `buildExportLines`, `executeCardDeletionStep`, `fetchCardFromScryfall`, `extractScryfallImage`, and all internal types (`ExtractedScryfallData`, etc.). Note: `_enrichCardsWithFallbackSearch` calls `searchCards` from Scryfall service — this is intentional; it's side-effectful but only used during import.
   - Move import entry points from lines 2455-3032: `handleImport`, `handleImportDirect`, `handleImportCsv`, `handleImportBinder`, `handleImportBinderDirect`, `handleImportBinderCsv`.
   - Move `resumeImport` from lines 3346-3467.
   - The composable function takes parameters for stores and refs it needs: `{ collectionStore, decksStore, binderStore, toastStore, confirmStore, t, deckFilter, binderFilter, statusFilter }`. This avoids re-instantiating stores inside the composable.
   - Import `parseTextImportLine`, `buildCollectionCardFromScryfall`, `buildRawMoxfieldCard`, `buildRawCsvCard`, `ImportCardData`, `MoxfieldImportCard` from `../utils/importHelpers` (Plan A artifact).
   - Return: `{ importProgress, isDeckImporting, getImportProgress, handleImport, handleImportDirect, handleImportCsv, handleImportBinder, handleImportBinderDirect, handleImportBinderCsv, resumeImport, clearImportState, loadImportState, isImportRunning: () => isImportRunning }`.

2. Create `src/composables/useDeckDeletion.ts`:
   - At FILE scope: `let isDeleteRunning = false`.
   - Define `const DELETE_STORAGE_KEY = 'cranial_delete_deck_progress'`.
   - Move `DeleteDeckState` interface, `deleteDeckProgress` ref, save/load/clear helpers from lines 242-302.
   - Move `executeDeleteDeck`, `resumeDeleteDeck`, `handleDeleteDeck` from lines 3034-3165.
   - Move `executeCardDeletionStep` helper from line 2142 (if not already moved with import — check if shared).
   - The composable takes `{ decksStore, collectionStore, toastStore, confirmStore, t, deckFilter }`.
   - Preserve the `deckFilter.value = 'all'` call at line 3048 — pass `deckFilter` ref and mutate it.
   - Preserve QuotaExceededError recovery verbatim (lines 262-276).
   - Return: `{ deleteDeckProgress, isDeletingDeck, deleteProgress, handleDeleteDeck, resumeDeleteDeck, clearDeleteDeckState, loadDeleteDeckState }`.

3. Update CollectionView.vue:
   - Delete all moved code blocks (lines 174-302, 1864-2249 import helpers, 2455-3032 import entry points, 3034-3165 delete deck, 3346-3467 resume import).
   - Delete the module-scoped `isImportRunning`/`isDeleteRunning` at lines 4-5.
   - Add composable calls in `<script setup>`:
     ```typescript
     const { importProgress, isDeckImporting, getImportProgress, handleImport, ... } = useCollectionImport({
       collectionStore, decksStore, binderStore, toastStore, confirmStore, t, deckFilter, binderFilter, statusFilter
     })
     const { deleteDeckProgress, isDeletingDeck, deleteProgress, handleDeleteDeck, resumeDeleteDeck, ... } = useDeckDeletion({
       decksStore, collectionStore, toastStore, confirmStore, t, deckFilter
     })
     ```
   - Update the `onMounted` at line 3496 to call composable's `resumeImport` and `resumeDeleteDeck`.
   - Update the `handleBeforeUnload` to reference composable state.

Run `npm run test:unit` — confirm GREEN.

**CRITICAL CHECKS post-extraction:**
- `grep -rn "cranial_deck_import_progress" src/` — must appear in useCollectionImport.ts only
- `grep -rn "cranial_delete_deck_progress" src/` — must appear in useDeckDeletion.ts only
- `grep -n "let isImportRunning\|let isDeleteRunning" src/views/CollectionView.vue` — must be 0
- `grep -n "let isImportRunning" src/composables/useCollectionImport.ts` — must be 1 (file scope)
- `grep -n "let isDeleteRunning" src/composables/useDeckDeletion.ts` — must be 1 (file scope)
  </action>
  <verify>
    <automated>npm run test:unit && npx vite build 2>&1 | tail -5 && grep -c "cranial_deck_import_progress" src/composables/useCollectionImport.ts && grep -c "cranial_delete_deck_progress" src/composables/useDeckDeletion.ts && grep -c "let isImportRunning\|let isDeleteRunning" src/views/CollectionView.vue | grep "^0$"</automated>
  </verify>
  <done>useCollectionImport and useDeckDeletion composables exist with TDD tests. CollectionView wires them via composable calls. Module-scoped flags preserved. localStorage keys byte-identical. ~1400 lines removed from CollectionView. All tests pass. Build succeeds.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extract useCollectionFilterUrl + useCollectionPagination composables with TDD (NICE-10)</name>
  <files>
    src/composables/useCollectionFilterUrl.ts,
    src/composables/useCollectionPagination.ts,
    tests/unit/composables/useCollectionFilterUrl.test.ts,
    tests/unit/composables/useCollectionPagination.test.ts,
    src/views/CollectionView.vue
  </files>
  <behavior>
    useCollectionFilterUrl:
    - On mount: hydrates filter state from URL query params (q, status, sort, colors, types, rarity, mv, foil)
    - State change writes to URL via router.replace (not push, to avoid back-button spam per D-07)
    - Default values (status=all, sort=recent) are OMITTED from URL for clean URLs (per D-07)
    - isHydrating guard prevents infinite loop (state → URL → state → ...)
    - Coexists with existing ?filter=wishlist watcher (absorb it into the URL composable)
    - filterQuery mapped to ?q= param
    - statusFilter mapped to ?status= param
    - sortBy mapped to ?sort= param

    useCollectionPagination:
    - Debounced watcher fires collectionStore.queryPage 300ms after filter state changes
    - Uses buildPaginationFilters and buildPaginationSort from Plan A utils
    - Cleanup timer on unmount (onScopeDispose)
    - Initial query on mount
  </behavior>
  <action>
**RED phase:**
Write failing tests for both composables.

For `useCollectionFilterUrl`, test:
- hydrate: given route.query = { q: 'bolt', status: 'sale', sort: 'price' }, after hydration filterQuery.value === 'bolt', statusFilter.value === 'sale', sortBy.value === 'price'
- hydrate: given empty route.query, filter state remains at defaults
- sync: changing filterQuery.value to 'bolt' causes router.replace with ?q=bolt
- sync: changing statusFilter.value to 'all' removes ?status from URL (default omission)
- guard: changing state during hydration does NOT call router.replace

For `useCollectionPagination`, test:
- Changing filterQuery triggers collectionStore.queryPage after debounce
- Rapid filter changes only trigger one queryPage call (debounce)
- onScopeDispose clears the timer

Mock `useRoute`, `useRouter`, `collectionStore` in tests.

Run `npm run test:unit` — confirm RED.

**GREEN phase:**

1. Create `src/composables/useCollectionFilterUrl.ts`:
   - Accepts `{ filterQuery, statusFilter, sortBy, selectedColors, selectedTypes, selectedRarities, selectedManaValues, advFoilFilter }` — all Ref types from useCardFilter.
   - Uses `useRoute()` and `useRouter()` internally.
   - On creation: reads `route.query`, sets refs accordingly, with `isHydrating = true` initially.
   - After hydration: `void Promise.resolve().then(() => { isHydrating.value = false })`.
   - Watcher on all state refs: if `!isHydrating.value`, compute query object (omit defaults), call `router.replace({ query })`.
   - Absorb the `?filter=wishlist` watcher (CollectionView.vue lines 3572-3588): if `route.query.filter === 'wishlist'`, set `statusFilter.value = 'wishlist'`. On change away from wishlist, reset to 'all'.
   - URL schema per D-07: `?q=`, `?status=`, `?sort=`, `?colors=W,U` (comma-separated), `?types=creature,instant`, `?rarity=rare,mythic`, `?mv=0,1,2`, `?foil=foil`.

2. Create `src/composables/useCollectionPagination.ts`:
   - Accepts `{ filterState, collectionStore }` where filterState includes the refs that affect pagination.
   - Imports `buildPaginationFilters`, `buildPaginationSort` from `../utils/collectionFilters` (Plan A).
   - Sets up a debounced watcher (300ms) on filter state refs that calls `collectionStore.queryPage(buildPaginationFilters(state), buildPaginationSort(state.sortBy.value))`.
   - Cleanup timer on `onScopeDispose`.
   - Expose `triggerQuery()` for initial mount call.

3. Update CollectionView.vue:
   - Delete the inline debounced watcher at lines 721-744 and the onUnmounted cleanup at lines 747-749.
   - Delete the `watch(() => route.query.filter, ...)` at lines 3572-3588 (absorbed by URL composable).
   - Delete the `watch(() => route.query.addCard, ...)` at lines 3591-3595 — keep this one actually, it's a one-shot redirect. Actually re-read: this is a redirect to /search, not a filter sync. KEEP this watcher in CollectionView.
   - Delete the `watch(() => route.query.action, ...)` at lines 3598-3603 — similarly, keep this one-shot modal opener in the view.
   - Wire composables:
     ```typescript
     useCollectionFilterUrl({ filterQuery, statusFilter, sortBy, selectedColors, selectedTypes, selectedRarities, selectedManaValues, advFoilFilter })
     const { triggerQuery } = useCollectionPagination({ filterState: { filterQuery, statusFilter, sortBy, ... }, collectionStore })
     ```
   - In onMounted, replace `collectionStore.queryPage(buildPaginationFilters(), buildPaginationSort())` with `triggerQuery()`.

Run `npm run test:unit` — confirm GREEN. Run `npx vite build`.

**Post-extraction checks:**
- Open dev server, navigate to /collection, change a filter → URL should update
- Refresh → filter should restore
- `?filter=wishlist` deep link should still work
  </action>
  <verify>
    <automated>npm run test:unit && npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>useCollectionFilterUrl and useCollectionPagination composables exist with TDD tests. CollectionView wires them. Changing filter/sort updates browser URL. Refresh restores filtered state. Default values omitted from URL. ~200 more lines removed from CollectionView. All tests pass. Build succeeds.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| URL query params → filter state | User can manipulate URL params to set arbitrary filter values |
| localStorage → import/delete state | Stored state could be tampered with or corrupted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03B-01 | Tampering | URL query params could inject invalid filter values | mitigate | useCollectionFilterUrl validates status against known enum values; invalid values fall back to defaults. filterQuery is sanitized as a plain string (no eval/injection). |
| T-03B-02 | Tampering | localStorage import state could be corrupted | accept | Existing try/catch + JSON.parse fallback to null is preserved. No new risk surface. |
| T-03B-03 | Denial of Service | URL-sync ping-pong could cause infinite loop | mitigate | isHydrating guard prevents re-entry. Watcher skips when hydrating=true. RESEARCH.md pitfall #3 addressed. |
| T-03B-04 | Information Disclosure | Filter state in URL is visible | accept | Filter state is user's own data, not sensitive. URL is same-user-only (requiresAuth route). |
</threat_model>

<verification>
After both tasks complete:

1. `npm run test:unit` — all tests pass (existing + ~20 new composable tests)
2. `npx vue-tsc --noEmit` — 0 errors
3. `npx vite build` — succeeds
4. **Extraction audit greps:**
   - `grep -n "interface ImportState\|const importProgress = ref\|const saveImportState\|const handleImport " src/views/CollectionView.vue` → 0 matches (all moved)
   - `grep -n "interface DeleteDeckState\|const deleteDeckProgress = ref\|const executeDeleteDeck" src/views/CollectionView.vue` → 0 matches (all moved)
   - `grep -rn "cranial_deck_import_progress" src/` → only in useCollectionImport.ts
   - `grep -rn "cranial_delete_deck_progress" src/` → only in useDeckDeletion.ts
5. **URL sync verification:**
   - Change status filter → URL shows `?status=sale`
   - Change sort → URL shows `?sort=price`
   - Default state → clean URL `/collection` (no params)
   - Refresh with params → state restored
6. **Line count:** CollectionView.vue should be ~2800-3000 lines (down from ~4380 after Plan A).
</verification>

<success_criteria>
- 4 new composable files exist and are tested
- CollectionView.vue wires all 4 composables
- Import state machine works identically (localStorage keys preserved byte-identical)
- Delete-deck state machine works identically (QuotaExceededError recovery preserved)
- Filter/sort URL sync works bidirectionally (NICE-10 delivered)
- Pagination fires debounced on filter changes
- ~1600 lines removed from CollectionView
- All tests pass, build succeeds
</success_criteria>

<output>
After completion, create `.planning/phases/03-collectionview-decomposition/03-B-SUMMARY.md`
</output>
