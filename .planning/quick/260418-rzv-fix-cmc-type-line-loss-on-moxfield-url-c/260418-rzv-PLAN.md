---
phase: quick-260418-rzv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/importHelpers.ts
  - tests/unit/utils/importHelpers.test.ts
  - src/composables/useCollectionImport.ts
  - src/views/DecksView.vue
  - src/stores/collection.ts
autonomous: false
requirements:
  - SCRUM-27
user_setup: []

must_haves:
  truths:
    - "After a Moxfield URL import, opening the created deck shows a mana curve with correct CMCs (not all-zero)."
    - "After a CSV (ManaBox) import into a deck, opening the created deck shows a mana curve with correct CMCs."
    - "A pre-existing Moxfield/CSV-imported collection (broken before this fix) self-heals on the next load — cards gain cmc/type_line without a manual re-import."
    - "Importing a card whose true cmc is 0 (e.g. Mox Pearl) preserves cmc=0, not undefined, through the builder → confirmImport pipeline."
    - "`npm run test:unit` passes (full suite)."
    - "`npx vite build` succeeds."
  artifacts:
    - path: "src/utils/importHelpers.ts"
      provides: "buildRawMoxfieldCard and buildRawCsvCard accepting optional ExtractedScryfallData"
      contains: "scryfallData"
    - path: "tests/unit/utils/importHelpers.test.ts"
      provides: "RED-then-GREEN tests covering: builder with scryfallData populates cmc/type_line/colors/rarity/oracle_text/keywords/legalities/full_art/produced_mana; without scryfallData preserves existing behavior (backward compat); cmc=0 is preserved (not undefined)."
      contains: "scryfallData"
    - path: "src/composables/useCollectionImport.ts"
      provides: "handleImportDirect, handleImportCsv, handleImportBinderDirect, handleImportBinderCsv all batch-fetch via getCardsByIds and pass ExtractedScryfallData into the builder."
      contains: "getCardsByIds"
    - path: "src/views/DecksView.vue"
      provides: "handleImportDirect.collectionCardData and buildCsvCardData populate cmc/type_line/colors from already-fetched Scryfall data."
      contains: "cmc"
    - path: "src/stores/collection.ts"
      provides: "CACHE_ONLY_FIELDS no longer blocks cmc/type_line/colors/rarity/power/toughness/oracle_text/keywords/legalities/full_art/produced_mana from reaching the user doc; enrichment self-heals legacy broken cards."
      contains: "CACHE_ONLY_FIELDS"
  key_links:
    - from: "src/composables/useCollectionImport.ts::handleImportDirect"
      to: "src/utils/importHelpers.ts::buildRawMoxfieldCard"
      via: "pass scryfallMap.get(card.scryfallId) as 5th arg"
      pattern: "buildRawMoxfieldCard\\("
    - from: "src/composables/useCollectionImport.ts::handleImportCsv"
      to: "src/utils/importHelpers.ts::buildRawCsvCard"
      via: "pass scryfallMap.get(card.scryfallId) as 4th arg"
      pattern: "buildRawCsvCard\\("
    - from: "src/views/DecksView.vue::handleImportDirect"
      to: "collectionCardData (local object)"
      via: "assign cmc/type_line/colors from enriched destructure (lines 435-468)"
      pattern: "collectionCardData\\.cmc"
    - from: "src/views/DecksView.vue::buildCsvCardData"
      to: "scryfallDataMap"
      via: "read sc.cmc / sc.type_line / sc.colors and assign to ImportedCardData"
      pattern: "sc\\?\\.cmc"
    - from: "src/stores/collection.ts::persistEnrichmentBatches"
      to: "users/{uid}/cards/{cardId}"
      via: "CACHE_ONLY_FIELDS set shrunk so metadata writes to BOTH scryfall_cache and user doc"
      pattern: "CACHE_ONLY_FIELDS"
---

<objective>
Fix cmc and type_line (and other Scryfall metadata) being lost during Moxfield URL and CSV import flows.

SCRUM-27 is a direct blocker of SCRUM-10 (mana curve per deck, shipped in 260418-pzu). Curves render nothing because imported cards have `cmc=undefined` → `cardToIndex` collapses to 0 → mana curve sees a flat bar at 0.

**Root causes (locked, confirmed in SCRUM-27):**

1. `buildRawMoxfieldCard` and `buildRawCsvCard` were designed as "enrich-later" helpers that never populate metadata — unlike `buildCollectionCardFromScryfall`, which is the pattern to mirror.
2. The background enricher (`enrichCardsWithMissingMetadata` → `persistEnrichmentBatches`) writes cmc/type_line ONLY to `scryfall_cache` via `CACHE_ONLY_FIELDS`, not to the user's card doc. So even after enrichment runs, the user doc stays bare.
3. DecksView's `handleImportDirect` already destructures `{cmc, type_line, colors}` from `enrichCardFromScryfall` and uses them in `addToWishlist`, but forgets to copy them into `collectionCardData` (lines 456-468). `buildCsvCardData` has the Scryfall card in hand via `scryfallDataMap` and never reads cmc/type_line/colors off it.

**Fix direction:** mirror the `buildCollectionCardFromScryfall` pattern in the two sibling builders, pass Scryfall data through from existing/new batch fetches, and unblock metadata from the user doc so legacy collections self-heal.

Purpose: Unblock SCRUM-10 mana curve feature by ensuring cmc/type_line land in the Card object at import time AND propagate on enrichment for pre-existing broken collections.

Output: Two sibling builders accept optional `ExtractedScryfallData`; four import entry points wire through Scryfall data already available (or add a batch fetch); DecksView's two import handlers populate cmc/type_line/colors; `CACHE_ONLY_FIELDS` shrinks so metadata lands in user doc.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

# The helper-pattern reference (do NOT modify — only mirror)
@src/utils/importHelpers.ts

# Target files for this fix
@src/composables/useCollectionImport.ts
@src/views/DecksView.vue
@src/stores/collection.ts

# Type contracts used throughout
@src/types/card.ts

<interfaces>
<!-- Extracted from src/utils/importHelpers.ts — the shape builders consume/produce -->

```ts
export interface ExtractedScryfallData {
  scryfallId: string
  image: string
  price: number
  edition: string
  setCode: string
  cmc: number | undefined       // <-- NOTE: undefined is legitimate; 0 is a real value (Mox Pearl)
  type_line: string
  colors: string[]
  rarity: string
  power: string | undefined
  toughness: string | undefined
  oracle_text: string | undefined
  keywords: string[]
  legalities: Record<string, string> | undefined
  full_art: boolean
  produced_mana: string[] | undefined
}

export interface ImportCardData {
  scryfallId: string
  name: string
  edition: string
  quantity: number
  condition: CardCondition
  foil: boolean
  price: number
  image: string
  status: CardStatus
  public: boolean
  isInSideboard?: boolean
  setCode?: string
  language?: string
  cmc?: number
  type_line?: string
  colors?: string[]
  rarity?: string
  power?: string
  toughness?: string
  oracle_text?: string
  keywords?: string[]
  legalities?: Record<string, string>
  full_art?: boolean
  produced_mana?: string[]
  updatedAt: Date
}
```

From src/services/scryfallCache.ts:
```ts
export async function getCardsByIds(
  identifiers: ({ id: string } | { name: string })[],
  onProgress?: (current: number, total: number) => void
): Promise<ScryfallCard[]>  // Already batches L1 → L2 → Scryfall (30/chunk); safe to call with all import IDs at once.
```

From src/composables/useCollectionImport.ts:
```ts
// Already exists — REUSE, do not duplicate
const extractScryfallCardData = (card: ScryfallCard): ExtractedScryfallData => { ... }
```
</interfaces>

<locked_root_cause_analysis>
| Flow | Builder | cmc populated? | Needs |
|---|---|---|---|
| Individual (AddCardModal) | `addCard()` explicit | YES | — |
| Text paste (`handleImport`, `handleImportBinder`) | `buildCollectionCardFromScryfall` | YES (pattern to follow) | — |
| Moxfield URL deck (`handleImportDirect`) | `buildRawMoxfieldCard` | **NO** | batch fetch + pass-through |
| Moxfield URL binder (`handleImportBinderDirect`) | `buildRawMoxfieldCard` | **NO** | batch fetch + pass-through |
| CSV deck (`handleImportCsv` in composable + DecksView) | `buildRawCsvCard` / `buildCsvCardData` | **NO** | already has batch; just pass-through |
| CSV binder (`handleImportBinderCsv`) | `buildRawCsvCard` | **NO** | batch fetch + pass-through |
| DecksView `handleImportDirect` (legacy copy) | inline `ImportedCardData` object | **NO** (has data but drops it) | assign 3 fields |
</locked_root_cause_analysis>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend buildRawMoxfieldCard and buildRawCsvCard to accept optional ExtractedScryfallData (TDD, RED → GREEN)</name>
  <files>src/utils/importHelpers.ts, tests/unit/utils/importHelpers.test.ts</files>

  <behavior>
    RED tests (write FIRST, confirm they fail before implementing):

    `buildRawMoxfieldCard` with scryfallData:
    - Test 1a: Given scryfallData `{ cmc: 3, type_line: 'Creature — Human Wizard', colors: ['W','U'], rarity: 'rare', oracle_text: 'Draw a card.', keywords: ['flying'], legalities: { modern: 'legal' }, full_art: false, produced_mana: undefined, power: '2', toughness: '3', price: 4.99, image: 'https://...', edition: 'Modern Horizons 2', setCode: 'MH2', scryfallId: 'abc-123' }` → returned ImportCardData has cmc=3, type_line='Creature — Human Wizard', colors=['W','U'], rarity='rare', oracle_text='Draw a card.', keywords=['flying'], legalities={modern:'legal'}, full_art=false, power='2', toughness='3'.
    - Test 1b: cmc=0 edge case (Mox Pearl). Given scryfallData with cmc=0, type_line='Artifact' → returned card has cmc=0 (NOT undefined, NOT 1). This pins the "real 0" contract.
    - Test 1c: produced_mana=undefined must stay undefined (do NOT default to []), since undefined is how `enrichCardsWithMissingMetadata` detects "missing".
    - Test 1d: When scryfallData provides a price > 0, prefer it over the hard-coded 0. When scryfallData provides a non-empty image, prefer it over the constructed CDN URL. When scryfallData provides edition/setCode, prefer them (uppercased consistently) over the moxfield-derived values.

    `buildRawMoxfieldCard` backward compat (the critical RED that proves we don't break the existing callers):
    - Test 1e: Called with the existing 4-arg signature `buildRawMoxfieldCard(card, 'NM', 'collection', false)` (no 5th arg) → behaves EXACTLY like the current implementation: cmc/type_line/colors/rarity/etc all undefined/empty as before. Price=0, image=constructed CDN URL, edition=setCode.toUpperCase(). This test must pass both BEFORE and AFTER the change.

    `buildRawCsvCard` with scryfallData (sibling symmetry per anti-loop Rule 6):
    - Test 1f: Same shape as Test 1a for a ParsedCsvCard input. Scryfall metadata populates cmc/type_line/colors/rarity/etc.
    - Test 1g: cmc=0 preserved.
    - Test 1h: When scryfallData price > 0, prefer over CSV's price. When scryfallData image non-empty, prefer. When scryfallData edition non-empty, prefer.
    - Test 1i: Backward compat with existing 3-arg signature `buildRawCsvCard(card, 'collection', false)` — no scryfallData → identical to current behavior.
  </behavior>

  <action>
    ## Step 1: RED (write failing tests first)

    Add the test cases described in `<behavior>` to `tests/unit/utils/importHelpers.test.ts` under the existing `describe('buildRawMoxfieldCard', …)` and `describe('buildRawCsvCard', …)` groups. Use Vitest globals (NO imports of describe/it/expect — existing file already has the import at line 1; leave it alone per project TDD convention).

    Use these fixture shapes (mirror existing test literals for type-safety):

    ```ts
    const mockScryfallData = {
      scryfallId: 'abc-123',
      image: 'https://cards.scryfall.io/normal/front/a/b/abc-123.jpg',
      price: 4.99,
      edition: 'Modern Horizons 2',
      setCode: 'MH2',
      cmc: 3,
      type_line: 'Creature — Human Wizard',
      colors: ['W', 'U'],
      rarity: 'rare',
      power: '2',
      toughness: '3',
      oracle_text: 'Draw a card.',
      keywords: ['flying'],
      legalities: { modern: 'legal' },
      full_art: false,
      produced_mana: undefined,
    }
    const moxPearlData = { ...mockScryfallData, cmc: 0, type_line: 'Artifact', colors: [] }
    ```

    Run `npm run test:unit -- importHelpers` and confirm Tests 1a–1d and 1f–1h FAIL (they should — signature doesn't accept the arg yet). Tests 1e and 1i PASS (backward compat — existing behavior). Commit the RED state.

    ## Step 2: GREEN (implement)

    In `src/utils/importHelpers.ts`, extend both builder signatures (Rule 6 — atomic sibling update):

    ```ts
    export const buildRawMoxfieldCard = (
      card: MoxfieldImportCard,
      condition: CardCondition,
      status: CardStatus | undefined,
      makePublic: boolean,
      scryfallData?: ExtractedScryfallData | null,
    ): ImportCardData => {
      // ... existing name/isFoil extraction unchanged ...

      const base: ImportCardData = {
        scryfallId: scryfallData?.scryfallId || card.scryfallId || '',
        name: cardName,
        edition: scryfallData?.edition || card.setCode?.toUpperCase() || 'Unknown',
        setCode: (scryfallData?.setCode || card.setCode?.toUpperCase()),
        quantity: card.quantity,
        condition,
        foil: isFoil,
        price: scryfallData?.price ?? 0,
        image: scryfallData?.image || (card.scryfallId
          ? `https://cards.scryfall.io/normal/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg`
          : ''),
        status: status ?? 'collection',
        public: makePublic,
        updatedAt: new Date(),
      }

      if (scryfallData) {
        // Do NOT coerce undefined → 0 for cmc — preserve tri-state (number | undefined)
        base.cmc = scryfallData.cmc
        base.type_line = scryfallData.type_line || undefined
        base.colors = scryfallData.colors
        base.rarity = scryfallData.rarity || undefined
        base.power = scryfallData.power
        base.toughness = scryfallData.toughness
        base.oracle_text = scryfallData.oracle_text
        base.keywords = scryfallData.keywords
        base.legalities = scryfallData.legalities
        base.full_art = scryfallData.full_art
        if (scryfallData.produced_mana !== undefined) {
          base.produced_mana = scryfallData.produced_mana
        }
      }

      return base
    }
    ```

    Apply the same pattern to `buildRawCsvCard` (5th arg, same merge rules). Preserve the `if (card.setCode) cardData.setCode = ...` and `if (card.language) cardData.language = ...` blocks that currently exist.

    **Critical:** Test 1b/1g (cmc=0) — use `scryfallData.cmc` direct assignment, NOT `scryfallData.cmc ?? undefined` and NOT `scryfallData.cmc || undefined` (the `||` would nuke 0). Comment this line: `// cmc=0 is a real value (e.g. Mox Pearl) — do not coerce`.

    Run `npm run test:unit -- importHelpers` → all green. Commit.

    ## Step 3: REFACTOR (optional)

    If there's an obvious dedup between the two builders (e.g. a private `applyScryfallMetadata(card: ImportCardData, data: ExtractedScryfallData)` helper), extract it and rerun tests. Do NOT over-engineer.
  </action>

  <verify>
    <automated>npm run test:unit -- importHelpers</automated>
  </verify>

  <done>
    - `importHelpers.test.ts` contains tests 1a–1i; all pass.
    - Both `buildRawMoxfieldCard` and `buildRawCsvCard` accept optional 5th arg `scryfallData?: ExtractedScryfallData | null` and populate cmc/type_line/colors/rarity/power/toughness/oracle_text/keywords/legalities/full_art/produced_mana when present.
    - cmc=0 is preserved (NOT coerced to undefined).
    - 4-arg (resp. 3-arg) legacy calls unchanged in behavior.
    - Full unit suite green: `npm run test:unit`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire useCollectionImport.ts — batch-fetch Scryfall data up front and pass it into buildRaw* for all 4 Moxfield/CSV flows</name>
  <files>src/composables/useCollectionImport.ts</files>

  <action>
    **Anti-loop Rule 1 (READ before touching):** Before editing, grep `src/composables/useCollectionImport.ts` for EVERY call to `buildRawMoxfieldCard` and `buildRawCsvCard`. Expected matches: 4 sites — `handleImportDirect` (moxfield deck), `handleImportCsv` (CSV deck), `handleImportBinderDirect` (moxfield binder), `handleImportBinderCsv` (CSV binder). Confirm no others; if a 5th exists, update it too.

    **Anti-loop Rule 6 (atomic sibling update):** All 4 flows get wired in THIS task. Do not land 2 now and "fix the other 2 later".

    For each of the 4 flows, BEFORE the build loop that currently does `collectionCardsToAdd.push(buildRaw*...)`:

    1. Build the identifier list (dedup by scryfallId):
       ```ts
       const identifiers = [...new Map(
         cards.filter(c => c.scryfallId).map(c => [c.scryfallId, { id: c.scryfallId }])
       ).values()]
       ```
    2. Batch fetch with a progress update (keep user informed — the existing progress bands have slack between 15%–45%):
       ```ts
       const scryfallCards = uniqueIds.length > 0
         ? await getCardsByIds(identifiers)
         : []
       const scryfallMap = new Map<string, ExtractedScryfallData>()
       for (const sc of scryfallCards) {
         scryfallMap.set(sc.id, extractScryfallCardData(sc))
       }
       ```
       Reuse the existing `extractScryfallCardData` helper (line 179 — already imports `ExtractedScryfallData`). Do NOT duplicate the extraction logic.

    3. Inside the existing build loop, replace:
       ```ts
       collectionCardsToAdd.push(buildRawMoxfieldCard(card, condition, status, makePublic ?? false))
       ```
       with:
       ```ts
       const scryfallData = card.scryfallId ? scryfallMap.get(card.scryfallId) : undefined
       collectionCardsToAdd.push(buildRawMoxfieldCard(card, condition, status, makePublic ?? false, scryfallData))
       ```
       Same pattern for `buildRawCsvCard` (one fewer arg: `buildRawCsvCard(card, status, makePublic ?? false, scryfallData)`).

    **Already imported:** `getCardsByIds` is NOT currently imported in `useCollectionImport.ts` — add to the existing import line: `import { type ScryfallCard, getCardsByIds, searchCards } from '../services/scryfallCache'`. Keep alphabetical order per project convention (sort-imports rule).

    **DRY option (dev discretion):** If the four flows' batch-fetch block is byte-identical, extract a local helper inside the composable:
    ```ts
    const batchFetchScryfallMap = async (items: { scryfallId?: string }[]): Promise<Map<string, ExtractedScryfallData>> => { ... }
    ```
    Acceptable but not required. Do not over-engineer — a 4-line copy-paste is fine if extraction adds noise.

    **Progress toast timing:** The batch fetch happens between "processing" (15%) and "saving" (45%). Insert an interim update so users see activity for large imports:
    ```ts
    progressToast.update(25, t('common.import.fetchingMetadata')) // NEW key? see note below
    ```
    **i18n exception (confirmed — task notes say "this task does NOT touch i18n"):** DO NOT add a new i18n key. Reuse the existing `t('common.import.processing')` for the metadata-fetch interim update OR simply omit the interim update and keep the existing 15%→45% jump. Preserving existing i18n surface is the explicit constraint.

    **Handle partial failures:** If `getCardsByIds` throws, catch it, log `console.warn`, and proceed with an empty `scryfallMap`. The builders gracefully degrade to raw behavior. Do NOT let a Scryfall outage kill an import. Example:
    ```ts
    let scryfallMap = new Map<string, ExtractedScryfallData>()
    try {
      if (identifiers.length > 0) {
        const scryfallCards = await getCardsByIds(identifiers)
        for (const sc of scryfallCards) scryfallMap.set(sc.id, extractScryfallCardData(sc))
      }
    } catch (e) {
      console.warn('[Import] Batch Scryfall fetch failed; proceeding without metadata', e)
    }
    ```

    **Do NOT remove the background `enrichCardsWithMissingMetadata` call** at the bottom of each handler — it remains the safety net for cards that failed the batch fetch or for legacy broken collections.

    **Do NOT touch** `handleImport` / `handleImportBinder` (text-paste flows) — they already use `buildCollectionCardFromScryfall` and are working per the locked analysis table.
  </action>

  <verify>
    <automated>npm run test:unit &amp;&amp; npx vite build</automated>
  </verify>

  <done>
    - All 4 target flows (`handleImportDirect`, `handleImportCsv`, `handleImportBinderDirect`, `handleImportBinderCsv`) batch-fetch via `getCardsByIds` BEFORE the build loop and pass `scryfallMap.get(card.scryfallId)` into the builder.
    - `getCardsByIds` imported (alphabetized correctly).
    - Scryfall fetch failure is caught → empty map → import proceeds (resilience).
    - No new i18n keys added.
    - `handleImport` / `handleImportBinder` untouched.
    - Unit suite green; `npx vite build` succeeds.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire DecksView.vue — populate cmc/type_line/colors in handleImportDirect and buildCsvCardData</name>
  <files>src/views/DecksView.vue</files>

  <action>
    **Anti-loop Rule 1 (READ before touching):** DecksView.vue has TWO independent import paths that drop cmc/type_line/colors. Trace both first:
    - `handleImportDirect` (line ~393) — already destructures `{image, price, finalScryfallId, finalEdition, cmc, type_line, colors}` from `enrichCardFromScryfall`/`findBestPrintFallback` (line 435), USES them in `addToWishlist` (lines 449-451), but DROPS them when building `collectionCardData` (lines 456-468).
    - `buildCsvCardData` (line 281) — has `sc: ScryfallCard | undefined` in hand from `scryfallDataMap.get(card.scryfallId)`, reads `sc?.prices.usd` and `sc?.set_name`, but never reads `sc?.cmc`, `sc?.type_line`, or `sc?.colors`.

    ### Change 1 — `handleImportDirect` (around line 456-468)

    Add cmc/type_line/colors to `collectionCardData`. The `enriched` destructure already supplies them; just copy-through.

    ```ts
    const collectionCardData: ImportedCardData = {
      scryfallId: finalScryfallId,
      name: cardName,
      edition: finalEdition,
      quantity: card.quantity,
      condition,
      foil: isFoil,
      price,
      image,
      status: 'collection',
      deckName: finalDeckName,
      public: makePublic ?? false,
      isInSideboard: false,
    }

    // NEW: propagate Scryfall metadata (fixes SCRUM-27 for DecksView's moxfield path)
    if (cmc !== undefined) collectionCardData.cmc = cmc  // preserve 0 (Mox Pearl)
    if (type_line) collectionCardData.type_line = type_line
    if (colors.length > 0) collectionCardData.colors = colors
    ```

    **Extend the local `ImportedCardData` interface** (lines 22-37) to include the optional metadata fields. Currently it's missing `cmc`, `type_line`, `colors`. Add:
    ```ts
    interface ImportedCardData {
      // ... existing fields ...
      cmc?: number;
      type_line?: string;
      colors?: string[];
    }
    ```
    Note the interface is local to this file (not the shared one in importHelpers.ts). TypeScript will error at the assignment lines above without this. Verify with `npm run type-check`.

    ### Change 2 — `buildCsvCardData` (around line 281-306)

    Populate cmc/type_line/colors from the already-available `sc: ScryfallCard`:

    ```ts
    const buildCsvCardData = (card: ParsedCsvCard, scryfallDataMap: Map<string, ScryfallCard>, makePublic: boolean): ImportedCardData => {
      const sc = scryfallDataMap.get(card.scryfallId)
      const image = extractScryfallImage(sc)
      const price = sc?.prices?.usd ? Number.parseFloat(sc.prices.usd) : card.price

      const cardData: ImportedCardData = {
        scryfallId: card.scryfallId ?? '',
        name: card.name,
        edition: sc?.set_name ?? card.setCode ?? 'Unknown',
        quantity: card.quantity,
        condition: card.condition,
        foil: card.foil,
        price,
        image,
        status: 'collection',
        public: makePublic,
        isInSideboard: false,
      }
      if (card.setCode) cardData.setCode = card.setCode.toUpperCase()
      if (card.language) cardData.language = card.language

      // NEW: propagate Scryfall metadata (fixes SCRUM-27 for DecksView's CSV path)
      if (sc) {
        if (sc.cmc !== undefined) cardData.cmc = sc.cmc  // preserve 0
        if (sc.type_line) cardData.type_line = sc.type_line
        if (sc.colors) cardData.colors = sc.colors
      }

      return cardData
    }
    ```

    **Do NOT touch** `parseLinesIntoCards` (line 152) — it's the text-paste flow; that path is currently broken the same way (uses its own local `ImportedCardData` without cmc), BUT parseLinesIntoCards is only invoked from `handleCreateDeck` and `handleImport` inside DecksView, and both have the `scryfallData` in hand via `fetchCardFromScryfall`. If scope allows, consider adding cmc/type_line/colors to `parseLinesIntoCards`'s built `cardData` (lines 180-197) — this is a free win since the data is already extracted. If it blows the 30-minute budget, defer to a follow-up and document in the summary.

    **Decision:** include parseLinesIntoCards cmc/type_line/colors in this task IF the change is a clean 3-line addition (mirrors Change 2 pattern). Otherwise, skip and flag in summary.
  </action>

  <verify>
    <automated>npm run test:unit &amp;&amp; npm run type-check &amp;&amp; npx vite build</automated>
  </verify>

  <done>
    - `ImportedCardData` interface (local to DecksView) gains optional cmc/type_line/colors fields.
    - `handleImportDirect` copies cmc/type_line/colors from `enriched` destructure into `collectionCardData`.
    - `buildCsvCardData` reads cmc/type_line/colors off `sc` and writes to `cardData`.
    - cmc=0 preserved (use `!== undefined` check, not truthy).
    - `parseLinesIntoCards` either updated (3-line addition) or explicitly deferred in the summary with rationale.
    - TypeScript check, unit suite, and `npx vite build` all green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Shrink CACHE_ONLY_FIELDS so enrichment writes cmc/type_line/colors/etc. to the user doc (self-heals legacy broken collections)</name>
  <files>src/stores/collection.ts</files>

  <behavior>
    This task is the MOST IMPORTANT for existing users — Tasks 1-3 fix new imports, but legacy collections imported before this fix are already broken. `enrichCardsWithMissingMetadata` has been running in the background after every import for months, but because `CACHE_ONLY_FIELDS` routes cmc/type_line/etc. to `scryfall_cache` only, the user doc never gets enriched → `cardToIndex` keeps seeing `undefined → 0`.

    After this change, the next time a user loads their collection:
    1. `enrichCardsWithMissingMetadata` runs (already called post-import and can be triggered on load).
    2. It writes cmc/type_line/colors/rarity/etc. to BOTH `scryfall_cache` AND the user's `cards/{cardId}` doc.
    3. Next `loadCollection` sees the populated fields in the user doc / index.
    4. Mana curve renders correctly for legacy broken decks without any user action.

    No unit tests required for this task — the change is a 1-line Set shrink, and `persistEnrichmentBatches` interacts with live Firestore (integration-test territory, explicitly out of scope per planning constraints). The behavioral validation happens in Task 5 (human verify).
  </behavior>

  <action>
    **Anti-loop Rule 1:** Trace readers of `scryfall_cache` before shrinking the set. Grep for `'scryfall_cache'` across the codebase to understand who depends on the cache-only path.

    ```bash
    # (for the dev agent to run)
    grep -rn "scryfall_cache" src/ | grep -v "\.test\."
    ```

    Expected hits: `persistEnrichmentBatches` (writer, this file), possibly `loadFromIndex` / hydration code, and server-side Cloud Functions (out of scope — don't touch). Key question: does any reader REQUIRE fields to be absent from the user doc? Answer: no — `scryfall_cache` is a dedup/performance store; mirroring to user doc is additive and only costs user-doc storage.

    ### Change: `src/stores/collection.ts` line 493-497

    Shrink `CACHE_ONLY_FIELDS` to an empty set (or delete the whole cache-splitting branch) so ALL enrichment fields flow to the user doc. Simplest correct change — keep the cache write (for dedup lookups + existing readers) but ALSO write the same fields to the user doc.

    ```ts
    const persistEnrichmentBatches = async (updates: { card: Card; data: Partial<Card> }[], userId: string) => {
      const BATCH_SIZE = 400

      // NOTE (SCRUM-27 2026-04-18): CACHE_ONLY_FIELDS previously blocked cmc/type_line/colors
      // from reaching the user doc, breaking cardToIndex (cmc ?? 0 collapsed undefined → 0)
      // and mana curve rendering. We now mirror Scryfall metadata into BOTH the cache
      // (for dedup/hydration) AND the user doc (for index + mana curve).
      const CACHE_ONLY_FIELDS = new Set<string>() // shrunk — see note above

      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const chunk = updates.slice(i, i + BATCH_SIZE)
        const cacheBatch = writeBatch(db)
        const userBatch = writeBatch(db)
        let hasCacheWrites = false
        let hasUserWrites = false
        const writtenCacheIds = new Set<string>()

        for (const { card, data } of chunk) {
          const cacheData: Record<string, unknown> = {}
          const userData: Record<string, unknown> = {}

          for (const [key, value] of Object.entries(data)) {
            // Metadata goes to BOTH cache (dedup) and user doc (index)
            // Only skip cache for truly user-specific fields
            const isUserSpecific = key === 'price' || key === 'image' || key === 'updatedAt'
            if (!isUserSpecific) cacheData[key] = value
            userData[key] = value
          }
          // ... rest of loop unchanged (keep writtenCacheIds dedup, both batch commits) ...
        }
        // ... existing commit logic ...
      }
    }
    ```

    **Equivalent minimal change** (if the dev prefers surgical): just replace the 3 lines of `CACHE_ONLY_FIELDS` with `new Set<string>()` AND duplicate the inner assignment so BOTH `cacheData` and `userData` receive every non-price/image field. Functionally identical; choose whichever reads clearer.

    ### Update `cards.value` mirror already happens (line 575-582)

    Confirm that `enrichCardsWithMissingMetadata` already updates `cards.value` in memory with the patch BEFORE calling `persistEnrichmentBatches`. It does (lines 567-579). No change needed.

    ### Verify `syncIndexLocal` triggers on enrichment

    `enrichCardsWithMissingMetadata` assigns `cards.value = newCards` (line 582) but does NOT call `syncIndexLocal` for each updated card. The card_index will remain stale with `cm: 0` until the next full `buildCardIndex` Cloud Function run.

    **Decision (scope-bound):** Add a loop at the end of `enrichCardsWithMissingMetadata` that calls `syncIndexLocal(enriched, 'update')` for each enriched card, then `persistIndexToFirestore()` once. This ensures the index self-heals locally AND persists. Copy the pattern from existing mutation handlers (e.g. `addCard`). ~5 lines.

    ```ts
    // After persistEnrichmentBatches completes:
    for (const { card } of updates) {
      syncIndexLocal(card, 'update')
    }
    persistIndexToFirestore()
    ```

    Place this INSIDE the function after the existing `await persistEnrichmentBatches(...)` call (line 584). The debounced persist (2s) will coalesce with any concurrent writes.

    ### Verify no integration tests break

    Run `npm run test:unit` — this file is unit-tested for logic like filters, not for Firestore persistence, so tests should be unaffected. If any unit test stubs `persistEnrichmentBatches` or inspects `CACHE_ONLY_FIELDS`, update the stub.
  </action>

  <verify>
    <automated>npm run test:unit &amp;&amp; npx vite build</automated>
  </verify>

  <done>
    - `CACHE_ONLY_FIELDS` is empty (or removed); metadata writes to both cache and user doc.
    - Comment at the site explains the SCRUM-27 rationale.
    - `enrichCardsWithMissingMetadata` now calls `syncIndexLocal` + `persistIndexToFirestore` so the local card_index self-heals.
    - `price` and `image` (and `updatedAt`) remain user-doc-only (not replicated to shared cache, since they're user-specific).
    - Unit suite green; `npx vite build` succeeds.
    - No integration tests triggered (per constraints).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: Human verification — Moxfield URL + CSV imports show correct mana curves; legacy collection self-heals</name>

  <what-built>
    Four import flows (Moxfield URL deck, Moxfield URL binder, CSV deck, CSV binder) now batch-fetch Scryfall metadata and populate cmc/type_line/colors at card-creation time. DecksView's two import paths do the same. The collection store's background enrichment now writes metadata to the user doc (not just scryfall_cache), so legacy collections self-heal on next load.
  </what-built>

  <how-to-verify>
    **Prerequisites:** Work is on `develop`; run locally via `npm run dev` OR wait for CI auto-deploy to `cranial-trading-dev.web.app`.

    ### Smoke 1: Fresh Moxfield URL import → correct mana curve
    1. Log in as a test user (can use the existing dev account).
    2. Go to `/decks` → click `Import` → paste a public Moxfield deck URL (e.g. any commander deck with a known mana curve like `https://www.moxfield.com/decks/…`).
    3. Wait for import to complete. Toast should say "X cards imported".
    4. Click into the created deck (`/decks/{deckId}/edit`).
    5. Open the mana curve panel (Phase 260418-pzu feature).
    6. **Expected:** Curve shows distinct bars at CMC 1, 2, 3, … matching the deck's actual curve. **NOT** a single tall bar at 0.

    ### Smoke 2: Fresh CSV import → correct mana curve
    1. Export a small ManaBox CSV (~20 cards with varied CMCs) OR use a fixture CSV.
    2. Go to `/decks` → `Import` → CSV tab → upload the CSV.
    3. Wait for completion. Click into the deck.
    4. **Expected:** Mana curve renders correctly.

    ### Smoke 3: Legacy self-heal (the critical one)
    1. Before this fix, import a Moxfield deck (or identify an existing legacy deck in the test account that has broken cmc — the curve shows flat at 0).
       - Shortcut: any deck imported before today (2026-04-18) with non-creature-spells will have broken cmc if it came from Moxfield URL or CSV.
    2. Deploy this fix to dev.
    3. Hard refresh the page to trigger `loadCollection`.
    4. Wait ~5-10 seconds for background `enrichCardsWithMissingMetadata` to complete (watch browser console for `[Enrichment] Updated N cards with Scryfall metadata`).
    5. Hard refresh AGAIN (forces reload from now-enriched user doc / rebuilt index).
    6. Open the previously-broken deck's mana curve.
    7. **Expected:** Curve renders correctly without any re-import.

    ### Smoke 4: cmc=0 preservation
    1. Import a deck containing a 0-cmc card (Mox Pearl, Black Lotus, Mishra's Bauble).
    2. Check the mana curve.
    3. **Expected:** 0-cmc bar shows the correct count (NOT missing, NOT rolled into 1).

    ### Automated gates (orchestrator / dev agent should already have run these)
    - `npm run test:unit` → full suite green.
    - `npx vite build` → succeeds.
    - Grep confirms `CACHE_ONLY_FIELDS = new Set<string>()` (empty) in `src/stores/collection.ts`.
    - Grep confirms `buildRawMoxfieldCard(` and `buildRawCsvCard(` callers in `useCollectionImport.ts` pass a 5th arg.

    ### E2E (per Rafael's feedback rule — E2E before push)
    Run `npm run e2e` locally OR monitor CI after push. Existing deck-import and collection E2Es should still pass — no user-facing text changed.
  </how-to-verify>

  <resume-signal>Type "approved" after Smokes 1-4 pass, or describe which smoke failed and what you observed (include browser console output if errors).</resume-signal>
</task>

</tasks>

<verification>
### Automated gates (any task failing these blocks progression)

1. `npm run test:unit -- importHelpers` → all new + existing tests green (Task 1 RED → GREEN complete).
2. `npm run test:unit` → full suite green (no regression from wiring in Tasks 2-4).
3. `npm run type-check` → no TS errors (Task 3 extends local interface).
4. `npx vite build` → succeeds (project convention: use `npx vite build`, not `npm run build` which includes lint w/ pre-existing warnings).
5. `npm run e2e` (before push) — existing deck-import and collection E2Es still pass.

### Grep verification (run after Task 4)

- `grep -n "CACHE_ONLY_FIELDS" src/stores/collection.ts` → set is empty OR the splitting branch is removed. No cmc/type_line/colors in the blocking list.
- `grep -n "buildRawMoxfieldCard(" src/composables/useCollectionImport.ts` → every call has 5 arguments (5th is `scryfallData` or `scryfallMap.get(...)`).
- `grep -n "buildRawCsvCard(" src/composables/useCollectionImport.ts` → every call has 4 arguments (4th is `scryfallData`).
- `grep -n "collectionCardData.cmc" src/views/DecksView.vue` → present (Task 3).
- `grep -n "sc\\?\\.cmc\\|sc\\.cmc" src/views/DecksView.vue` → present inside `buildCsvCardData` (Task 3).

### Anti-loop Rule 6 verification

Both `buildRawMoxfieldCard` and `buildRawCsvCard` were updated atomically in Task 1. All 4 import flows in `useCollectionImport.ts` were updated atomically in Task 2.
</verification>

<success_criteria>
- **Fresh Moxfield URL import** produces a deck whose mana curve renders correctly (Smoke 1).
- **Fresh CSV import** produces a deck whose mana curve renders correctly (Smoke 2).
- **Legacy broken collections self-heal** after a load+refresh cycle (Smoke 3) — this unblocks existing Phase 260418-pzu mana-curve consumers without forcing users to re-import.
- **cmc=0 preserved** end-to-end (Smoke 4) — Mox Pearl and friends show under the 0-cmc bucket, not missing.
- **SCRUM-27 resolved in Jira** — note in the final summary that this unblocks SCRUM-10.
- Full unit suite green + build green + (after push) E2E green.
- Human approval at Task 5 checkpoint.
</success_criteria>

<output>
After all tasks complete, create `.planning/quick/260418-rzv-fix-cmc-type-line-loss-on-moxfield-url-c/260418-rzv-SUMMARY.md` following the standard quick-task summary template. Include:

- Root cause summary (3 findings from the locked analysis).
- Per-task diff summary (files touched, LOC, tests added).
- Verification results (unit counts, build time, E2E status).
- Any scope decisions (e.g. whether `parseLinesIntoCards` was updated in Task 3 or deferred).
- Known follow-ups:
  - **Deferred:** Sentinel-based `cm` in `cardToIndex` / `indexToCard` (using -1 for "unknown") — Rafael flagged as optional; skip unless time-positive. If skipped, propose as follow-up ticket.
  - **Deferred:** Server-side `buildCardIndex` Cloud Function verification that it reads cmc/type_line/colors off the user doc (should be automatic now that those fields land in the user doc; manual verify post-deploy is sufficient).
- Version bump: this is a **patch** (bug fix, no new features) — bump `package.json` via `npm version patch --no-git-tag-version` in the commit that lands Task 4 or in a dedicated commit right before push.
- Mark SCRUM-27 as Done in Jira with a comment linking the commit(s) and noting that SCRUM-10's mana curve is now usable for freshly-imported decks.
</output>
