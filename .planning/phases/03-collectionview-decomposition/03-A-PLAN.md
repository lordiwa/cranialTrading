---
phase: 03-collectionview-decomposition
plan: A
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/collectionFilters.ts
  - src/utils/importHelpers.ts
  - tests/unit/utils/collectionFilters.test.ts
  - tests/unit/utils/importHelpers.test.ts
  - src/components/collection/CollectionGrid.vue
  - src/composables/useCollectionTotals.ts
  - src/stores/collection.ts
  - tests/unit/stores/collectionSummary.test.ts
autonomous: true
requirements:
  - NICE-07
  - NICE-08
  - NICE-09

must_haves:
  truths:
    - "buildPaginationFilters converts display categories (White, Creatures) to server format (W, creature) correctly"
    - "buildPaginationSort converts client sort values (recent, name, price) to server fields"
    - "parseTextImportLine parses quantity, card name, set code, and foil flag from text lines"
    - "buildCollectionCardFromScryfall produces a complete ImportCardData from Scryfall results"
    - "CollectionGrid does NOT wrap props.cards in a redundant computed (NICE-07)"
    - "useCollectionTotals calls useCollectionStore() at composable setup, not inside async callbacks (NICE-08)"
    - "collectionSummary in collection store is a computed derived from cards, with behavior-preservation test (NICE-09 per D-11)"
    - "All new utilities have failing-first unit tests committed before implementation (TDD per CLAUDE.md)"
  artifacts:
    - path: "src/utils/collectionFilters.ts"
      provides: "buildPaginationFilters, buildPaginationSort, color/type/rarity/mana mapping constants"
      exports: ["buildPaginationFilters", "buildPaginationSort", "colorToModalMap", "typeToServerMap", "rarityToServerMap", "manaToServerMap"]
    - path: "src/utils/importHelpers.ts"
      provides: "parseTextImportLine, buildCollectionCardFromScryfall, buildRawMoxfieldCard, buildRawCsvCard — pure functions"
      exports: ["parseTextImportLine", "buildCollectionCardFromScryfall", "buildRawMoxfieldCard", "buildRawCsvCard"]
    - path: "tests/unit/utils/collectionFilters.test.ts"
      provides: "Unit tests for filter/sort mapping"
    - path: "tests/unit/utils/importHelpers.test.ts"
      provides: "Unit tests for import helper pure functions"
    - path: "tests/unit/stores/collectionSummary.test.ts"
      provides: "Behavior-preservation test for collectionSummary computed (NICE-09)"
  key_links:
    - from: "src/views/CollectionView.vue"
      to: "src/utils/collectionFilters.ts"
      via: "import { buildPaginationFilters, buildPaginationSort } from '../utils/collectionFilters'"
      pattern: "from.*collectionFilters"
    - from: "src/views/CollectionView.vue"
      to: "src/utils/importHelpers.ts"
      via: "import { parseTextImportLine, buildCollectionCardFromScryfall } from '../utils/importHelpers'"
      pattern: "from.*importHelpers"
---

<objective>
Establish the pure-logic foundation for Phase 03 by extracting pure helper functions into utility modules and fixing three NICE-item code quality issues. This plan produces the building blocks that Plans B and C will consume.

Purpose: Plans B (state machine composables) and C (route split) depend on filter-mapping helpers and import helpers being importable from standalone modules. Fixing NICE-07/08/09 now prevents these small changes from being lost in the noise of later structural work.

Output: 2 new util files with TDD, 3 modified files (CollectionGrid, useCollectionTotals, collection store), 3 new test files.
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
@CLAUDE.md

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/views/CollectionView.vue (lines to extract):

Filter mapping constants (lines 549-554):
```typescript
// These are the display→server mapping objects used by buildPaginationFilters
const colorToModal = { 'White': 'W', 'Blue': 'U', 'Black': 'B', 'Red': 'R', 'Green': 'G', 'Multicolor': 'M', 'Colorless': 'C', 'Lands': 'L' }
// Similar objects for type, rarity, mana
```

buildPaginationFilters (lines 650-700): Takes filter state refs → returns server-format filter object for collectionStore.queryPage.
buildPaginationSort (lines 703-716): Takes sortBy string → returns server sort field/direction.

Import helpers (lines 1864-2097):
```typescript
parseTextImportLine(trimmed: string): { quantity: number; cardName: string; setCode: string | null; isFoil: boolean } | null
buildCollectionCardFromScryfall(opts: { cardName, quantity, condition, isFoil, setCode, scryfallData, status, makePublic, isInSideboard }): ImportCardData
buildRawMoxfieldCard(card: MoxfieldImportCard, scryfallDataMap: Map<string, ScryfallCard>, condition, status, makePublic): { cardData: ImportCardData; needsSearch: boolean }
buildRawCsvCard(parsedCard: ParsedCsvCard, ...): ImportCardData
```

From src/stores/collection.ts (line 230):
```typescript
const collectionSummary = ref<{ totalCards: number; totalValue: number; statusCounts: Record<string, number>; loadedCards: number } | null>(null)
```
Currently assigned at lines 330 and 369 from card_index and Cloud Function respectively.

From src/composables/useCollectionTotals.ts (lines 98 and 186):
```typescript
// NICE-08: These two call useCollectionStore() INSIDE async callbacks instead of at setup
const collectionStore = useCollectionStore()  // Should be at top of composable, not inside fetchAllPrices
```

From src/components/collection/CollectionGrid.vue (line 42):
```typescript
const cardsRef = computed(() => props.cards)  // NICE-07: redundant — props.cards is already reactive
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract pure helpers with TDD — collectionFilters.ts + importHelpers.ts</name>
  <files>
    src/utils/collectionFilters.ts,
    src/utils/importHelpers.ts,
    tests/unit/utils/collectionFilters.test.ts,
    tests/unit/utils/importHelpers.test.ts,
    src/views/CollectionView.vue
  </files>
  <behavior>
    collectionFilters.ts:
    - buildPaginationFilters({statusFilter, selectedColors, selectedTypes, selectedRarities, selectedManaValues, filterQuery, advFoilFilter}) returns correct server-format object
    - buildPaginationFilters maps 'White' to 'W', 'Creatures' to 'creature', etc.
    - buildPaginationFilters omits empty/default filters from result
    - buildPaginationSort('recent') returns { field: 'createdAt', direction: 'desc' }
    - buildPaginationSort('name') returns { field: 'name', direction: 'asc' }
    - buildPaginationSort('price') returns { field: 'price', direction: 'desc' }

    importHelpers.ts:
    - parseTextImportLine('2x Lightning Bolt (M25)') returns { quantity: 2, cardName: 'Lightning Bolt', setCode: 'M25', isFoil: false }
    - parseTextImportLine('1 Black Lotus *F*') returns { quantity: 1, cardName: 'Black Lotus', setCode: null, isFoil: true }
    - parseTextImportLine('invalid') returns null
    - parseTextImportLine('') returns null
    - buildCollectionCardFromScryfall produces ImportCardData with all fields populated from scryfallData
    - buildCollectionCardFromScryfall handles null/undefined scryfallData gracefully (defaults)
    - buildRawMoxfieldCard extracts scryfallId-based data from the scryfallDataMap
    - buildRawCsvCard produces ImportCardData from ParsedCsvCard input
  </behavior>
  <action>
**RED phase:** Write failing tests in `tests/unit/utils/collectionFilters.test.ts` and `tests/unit/utils/importHelpers.test.ts` covering the behaviors above. Run `npm run test:unit` to confirm RED.

**GREEN phase:**

1. Create `src/utils/collectionFilters.ts`:
   - Read CollectionView.vue lines 549-554 for the 4 mapping constants (colorToModal, typeToServer, rarityToServer, manaToServer).
   - Read lines 650-716 for `buildPaginationFilters` and `buildPaginationSort`.
   - Copy these functions verbatim into the new file. Export them. Add TypeScript types for the filter-state parameter shape.
   - These are PURE functions with zero side effects — no store imports, no composable calls.

2. Create `src/utils/importHelpers.ts`:
   - Read CollectionView.vue lines 1864-1920 for `parseTextImportLine` and `buildCollectionCardFromScryfall`.
   - Read lines 1922-2097 for `buildRawMoxfieldCard` and `buildRawCsvCard` (skip `_processImportCard` which is unused/commented).
   - Copy verbatim. Export. Import shared types (`ImportCardData`, `MoxfieldImportCard`, etc.) — these interfaces may need to move to a types file or be re-exported from importHelpers.
   - The `MoxfieldImportCard` and `ImportCardData` interfaces (CollectionView.vue lines 82-119) should also move here since they're consumed by import helpers.
   - NOTE: `_enrichCardsWithFallbackSearch` (line 2028) is NOT pure — it calls Scryfall service. Do NOT extract it here; it stays for Plan B.

3. Update CollectionView.vue:
   - Replace inline `buildPaginationFilters`/`buildPaginationSort` with imports from `../utils/collectionFilters`.
   - Replace inline `parseTextImportLine`/`buildCollectionCardFromScryfall`/`buildRawMoxfieldCard`/`buildRawCsvCard` with imports from `../utils/importHelpers`.
   - Move `MoxfieldImportCard` and `ImportCardData` interfaces to importHelpers.ts; import them back.
   - Delete the inline definitions. Keep the mapping constants in collectionFilters.ts.
   - The 4 mapping constants at lines 549-554 move to collectionFilters.ts.

Run `npm run test:unit` to confirm GREEN. Run `npx vite build` to confirm no type errors.

**Anti-loop Rule 1:** Read the full function signatures AND their callers within CollectionView.vue before extracting. The callers stay in the view — only the pure function definitions move.

**Anti-loop Rule 2:** Do NOT improve the extracted functions. Copy verbatim, even if the code could be cleaner.
  </action>
  <verify>
    <automated>npm run test:unit && npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Two new util files exist with exported pure functions. CollectionView.vue imports them instead of defining inline. All existing tests pass. Build succeeds. New test files cover the extracted functions with RED-first methodology.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fix NICE-07, NICE-08, NICE-09 with behavior-preservation TDD</name>
  <files>
    src/components/collection/CollectionGrid.vue,
    src/composables/useCollectionTotals.ts,
    src/stores/collection.ts,
    tests/unit/stores/collectionSummary.test.ts
  </files>
  <behavior>
    NICE-09 behavior-preservation test (per D-11):
    - collectionSummary returns null when cards is empty and no index loaded
    - collectionSummary returns { totalCards, totalValue, statusCounts, loadedCards } matching cards array
    - totalCards equals cards.value.length
    - statusCounts tallies each card.status correctly
    - totalValue sums price * quantity for each card
    - If computed version produces different results than card_index source, keep manual sync and document why (D-11 fallback)
  </behavior>
  <action>
**NICE-07 — CollectionGrid.vue (2-line fix, no test needed — template-only):**

Read `src/components/collection/CollectionGrid.vue` line 42:
```typescript
const cardsRef = computed(() => props.cards)
```
Replace with:
```typescript
const cardsRef = toRef(props, 'cards')
```
This removes the redundant computed wrapper. `toRef` already produces a reactive ref from props. Verify that `useVirtualGrid` still receives it correctly (line 44 passes `cardsRef` as `items`).

**NICE-08 — useCollectionTotals.ts (hoist store call to setup):**

Read `src/composables/useCollectionTotals.ts`. Currently there is NO `useCollectionStore()` call at module/composable setup level. Instead, it is called inside the async `fetchAllPrices` function (line ~186) and inside `autoFixCard` (line ~98).

Fix: Add `const collectionStore = useCollectionStore()` at the top of the `useCollectionTotals` function body (right after `const loading = ref(false)`). Then remove the `useCollectionStore()` calls inside `autoFixCard` (line ~98) and `fetchAllPrices` (line ~186), replacing them with the outer `collectionStore` reference.

This ensures the store is resolved during Vue's setup phase, not lazily inside an async callback.

**NICE-09 — collection store collectionSummary (per D-11):**

**RED phase:** Write `tests/unit/stores/collectionSummary.test.ts` with behavior-preservation tests. Mock the Pinia store setup. Test that after `cards.value` is set to a known array, `collectionSummary` reflects the correct totalCards, totalValue, statusCounts, and loadedCards.

**IMPORTANT (D-11 caveat):** Read `src/stores/collection.ts` lines 320-375. Currently `collectionSummary` is assigned from `card_index` chunks (line 330) which gives the index count, and from Cloud Function fallback (line 369). The index count may differ from `cards.value.length` during progressive loads because `loadFromIndex` maps index → cards synchronously (line 320: `cards.value = allIndex.map(indexToCard)`), meaning `cards.value.length === allIndex.length` at assignment time.

Since both sources set `cards.value` and `collectionSummary` in the same synchronous block, converting to `computed(() => { ... derive from cards.value ... })` should produce identical results. But verify by reading both assignment sites.

**GREEN phase:** Convert `collectionSummary` from `ref` to `computed`:
```typescript
const collectionSummary = computed(() => {
  const cardList = cards.value
  if (cardList.length === 0) return null
  const statusCounts: Record<string, number> = {}
  let totalValue = 0
  for (const card of cardList) {
    statusCounts[card.status] = (statusCounts[card.status] || 0) + 1
    totalValue += (card.price || 0) * card.quantity
  }
  return {
    totalCards: cardList.length,
    totalValue,
    statusCounts,
    loadedCards: cardList.length,
  }
})
```

Then DELETE the manual assignment at lines 330-335 and lines 369-375. The computed auto-derives.

If the test reveals a behavior difference (e.g., the Cloud Function summary includes cards not yet in `cards.value`), KEEP the `ref` pattern and document the incompatibility per D-11 fallback clause.

Run `npm run test:unit` to confirm GREEN. Run `npx vite build` to confirm no type errors.
  </action>
  <verify>
    <automated>npm run test:unit && npx vite build 2>&1 | tail -5 && grep -c "computed(() => props.cards)" src/components/collection/CollectionGrid.vue | grep "^0$" && grep -c "const collectionStore = useCollectionStore()" src/composables/useCollectionTotals.ts | grep "^1$"</automated>
  </verify>
  <done>NICE-07: CollectionGrid no longer wraps props.cards in redundant computed. NICE-08: useCollectionTotals calls useCollectionStore() once at setup. NICE-09: collectionSummary is a computed derived from cards (or documented why it was kept as ref). All tests pass. Build succeeds.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| None new | This plan extracts existing code into new files. No new auth/input boundaries. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03A-01 | Tampering | collectionSummary computed may differ from card_index source | mitigate | Behavior-preservation test compares computed output against known card arrays. D-11 fallback clause: keep ref if mismatch detected. |
| T-03A-02 | Denial of Service | useCollectionTotals store call moved to setup — could fail if composable called outside Vue setup context | accept | Pinia composables are always called during setup per project convention. No new risk surface. |
| T-03A-03 | Information Disclosure | Import helper types moved to importHelpers.ts | accept | Types are internal to the app, not exposed to users. No auth/data boundary change. |
</threat_model>

<verification>
After both tasks complete:

1. `npm run test:unit` — all tests pass (542+ existing + new util tests)
2. `npx vue-tsc --noEmit` — 0 errors
3. `npx vite build` — succeeds
4. **Extraction audit greps:**
   - `grep -n "const buildPaginationFilters\|const buildPaginationSort" src/views/CollectionView.vue` → 0 matches (moved to util)
   - `grep -n "const parseTextImportLine\|const buildCollectionCardFromScryfall" src/views/CollectionView.vue` → 0 matches (moved to util)
   - `grep -c "computed(() => props.cards)" src/components/collection/CollectionGrid.vue` → 0 (NICE-07 fixed)
   - `grep -n "const collectionStore = useCollectionStore()" src/composables/useCollectionTotals.ts` → exactly 1 match at setup level (NICE-08 fixed)
5. **Line count delta:** CollectionView.vue should be ~200-250 lines shorter (pure function definitions removed).
</verification>

<success_criteria>
- Two new util files exist at src/utils/collectionFilters.ts and src/utils/importHelpers.ts
- CollectionView.vue imports from these utils instead of defining inline
- NICE-07: CollectionGrid uses toRef instead of redundant computed
- NICE-08: useCollectionTotals has one useCollectionStore() at setup level
- NICE-09: collectionSummary is computed from cards (or documented fallback per D-11)
- All tests pass including new behavior-preservation tests
- Build succeeds
</success_criteria>

<output>
After completion, create `.planning/phases/03-collectionview-decomposition/03-A-SUMMARY.md`
</output>
