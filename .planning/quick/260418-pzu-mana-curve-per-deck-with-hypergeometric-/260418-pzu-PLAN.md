---
phase: quick-260418-pzu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/manaCurve.ts
  - tests/unit/utils/manaCurve.spec.ts
  - src/services/manaCurveLands.ts
  - tests/unit/services/manaCurveLands.spec.ts
  - src/components/decks/DeckManaCurve.vue
  - src/views/DeckView.vue
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/pt.json
autonomous: false
requirements:
  - SCRUM-10
user_setup: []

must_haves:
  truths:
    - "When a deck is selected, the user sees a mana curve bar chart with one bar per CMC value from 0 up to the deck's real max CMC."
    - "Each bar shows the card count (sideboard excluded, wishlist included, commander included)."
    - "Below each bar (CMC ≥ 1) the user sees two percentages: on-play and on-draw probability of having ≥CMC lands in hand by turn CMC."
    - "CMC 0 shows probability 1.0 (100%) explicitly — no division/edge-case failure."
    - "When the deck contains lands whose oracle_text matches the ETB-tapped heuristic, a warning banner `'X tierras ETB tapped detectadas'` appears beside the curve with the detected count."
    - "The curve is rendered inline in DeckView, after the editor grid and before the fixed teleported DeckStatsFooter."
    - "Probability math matches hypergeometric formula with log-factorial cache (no NaN/Infinity on 60–250 card decks)."
  artifacts:
    - path: "src/utils/manaCurve.ts"
      provides: "Pure hypergeometric math + curve builder (buildManaCurve, hypergeomAtLeast, logFactorial)"
      exports: ["buildManaCurve", "hypergeomAtLeast"]
    - path: "tests/unit/utils/manaCurve.spec.ts"
      provides: "Unit tests locking known probability values and curve-builder behavior"
    - path: "src/services/manaCurveLands.ts"
      provides: "Scryfall-powered tapped-land detection (batch /cards/collection, regex + unless-window filter, session cache)"
      exports: ["detectEtbTappedLands"]
    - path: "tests/unit/services/manaCurveLands.spec.ts"
      provides: "Unit tests for regex heuristic with mocked fetch (Guildgate tapped, Glacial Fortress NOT tapped via unless-clause)"
    - path: "src/components/decks/DeckManaCurve.vue"
      provides: "Bar chart + on-play/on-draw probability labels + ETB-tapped warning"
    - path: "src/views/DeckView.vue"
      provides: "Mount point for DeckManaCurve after the editor grid, before the teleported footer"
  key_links:
    - from: "src/components/decks/DeckManaCurve.vue"
      to: "src/utils/manaCurve.ts"
      via: "import { buildManaCurve }"
      pattern: "from.*utils/manaCurve"
    - from: "src/components/decks/DeckManaCurve.vue"
      to: "src/services/manaCurveLands.ts"
      via: "import { detectEtbTappedLands }"
      pattern: "from.*services/manaCurveLands"
    - from: "src/views/DeckView.vue"
      to: "src/components/decks/DeckManaCurve.vue"
      via: "import + <DeckManaCurve> in template after editor grid"
      pattern: "DeckManaCurve"
---

<objective>
Add a mana curve visualization to DeckView that shows card count per CMC bucket alongside the hypergeometric probability of drawing enough lands by turn N, on-play and on-draw. Include an informational warning when ETB-tapped lands are detected in the deck.

Purpose: Give the deckbuilder real, math-backed feedback on how playable their curve is given their land count — not just a decorative bar chart. Addresses SCRUM-10.

Output:
- `src/utils/manaCurve.ts` — pure hypergeometric math + curve builder (fully TDD'd)
- `src/services/manaCurveLands.ts` — Scryfall tapped-land detector with session cache (fully TDD'd)
- `src/components/decks/DeckManaCurve.vue` — inline bar chart UI
- `DeckView.vue` integration + i18n keys in en/es/pt
</objective>

<execution_context>
@C:\Users\srpar\.claude\get-shit-done\workflows\execute-plan.md
@C:\Users\srpar\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src/types/deck.ts
@src/views/DeckView.vue
@src/composables/useDeckDisplayCards.ts
@src/components/decks/DeckStatsFooter.vue
@src/services/scryfall.ts
@src/locales/en.json
@src/locales/es.json
@src/locales/pt.json

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from the codebase so -->
<!-- the executor does NOT need to hunt. -->

From src/types/deck.ts:
```typescript
export interface HydratedDeckCard {
  cardId: string
  scryfallId: string
  name: string
  edition: string
  price: number
  image: string
  cmc?: number
  type_line?: string
  colors?: string[]
  produced_mana?: string[]
  allocatedQuantity: number
  isInSideboard: boolean
  isWishlist: false
  // ...
}

export interface HydratedWishlistCard {
  // same shape as HydratedDeckCard but with:
  isWishlist: true
  requestedQuantity: number
  allocatedQuantity: number // mirrors requestedQuantity
  cmc?: number
  type_line?: string
  // cardId may be '' for legacy pure-wishlist items (no scryfallId hydration guaranteed beyond what's stored)
}

export type DisplayDeckCard = HydratedDeckCard | HydratedWishlistCard

export interface Deck {
  id: string
  name: string
  format: 'vintage' | 'modern' | 'commander' | 'standard' | 'custom'
  commander?: string
  allocations: DeckCardAllocation[]
  wishlist: DeckWishlistItem[]
  stats: DeckStats
  // ...
}
```

From src/composables/useDeckDisplayCards.ts (already wired in DeckView):
- `mainboardDisplayCards: ComputedRef<DisplayDeckCard[]>` — mainboard + commander + wishlist (sideboard EXCLUDED here, matches locked decision 9)
- `sideboardDisplayCards: ComputedRef<DisplayDeckCard[]>` — do NOT use for curve
- `isCommanderFormat: ComputedRef<boolean>`
- `commanderNames: ComputedRef<string[]>`

From src/services/scryfall.ts:
```typescript
export interface ScryfallCard {
  id: string
  name: string
  type_line: string
  oracle_text?: string
  // ...
}
export const getCardsByIds: (
  identifiers: ({ id: string } | { name: string })[],
  onProgress?: (current: number, total: number) => void
) => Promise<ScryfallCard[]>
// Already batches at 75/request, already rate-limits.
```

DeckView.vue mount location (lines ~1037–1046 in current file):
```
<!-- Mainboard grid -->
<!-- Sideboard separator -->
<!-- Sideboard grid -->
<!-- Empty deck state -->
</div> <!-- end of the inner deck container -->
```
Insert `<DeckManaCurve>` AFTER the sideboard block (or after the empty-deck block — same level), BEFORE the closing `</div>`s that lead to the teleported DeckStatsFooter. Must be inside `AppContainer` so it participates in the main page scroll, not the fixed footer layer.
</interfaces>

<i18n-check>
Keys to ADD in all three locales (en.json, es.json, pt.json). Verify none already exist before creating.

New keys (proposed namespace: `decks.manaCurve`):
- `decks.manaCurve.title` — "Mana Curve" / "Curva de Maná" / "Curva de Mana"
- `decks.manaCurve.cards` — "cards" / "cartas" / "cartas"
- `decks.manaCurve.onPlay` — "On play" / "Jugando" / "Na mão inicial"  (short label — executor may refine; keep ≤ 10 chars ideal)
- `decks.manaCurve.onDraw` — "On draw" / "Robando" / "Com compra"
- `decks.manaCurve.landsLabel` — "Lands" / "Tierras" / "Terrenos"
- `decks.manaCurve.tappedWarning` — "{count} ETB-tapped lands detected" / "{count} tierras ETB tapped detectadas" / "{count} terrenos ETB tapped detectados"
- `decks.manaCurve.tappedWarningHelp` — short helper: "They count in the probability, but they slow turns." / "Cuentan en la probabilidad, pero retrasan turnos." / "Elas contam na probabilidade, mas atrasam turnos."
- `decks.manaCurve.noLands` — "No lands detected in this deck." / "No hay tierras en este deck." / "Nenhum terreno detectado neste deck."
- `decks.manaCurve.detecting` — "Detecting tapped lands…" / "Detectando tierras con ETB tapped…" / "Detectando terrenos com ETB tapped…"
- `decks.manaCurve.probabilityLabel` — "P(≥{k} lands by turn {k})" / "P(≥{k} tierras al turno {k})" / "P(≥{k} terrenos no turno {k})"

Before editing, run (conceptually, as part of the i18n-check skill): Grep for each key in `src/locales/en.json`. If any exists with different wording, re-use the existing key and note it in the task summary.
</i18n-check>

</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD pure hypergeometric math + curve builder</name>
  <files>
    src/utils/manaCurve.ts,
    tests/unit/utils/manaCurve.spec.ts
  </files>
  <behavior>
    Test-first. Write these cases FIRST, watch them fail, then implement.

    Probability tests — `hypergeomAtLeast(N, L, n, k)` returns P(X ≥ k) in a hypergeometric(N, L, n) draw:
      - hypergeomAtLeast(60, 24, 9, 3) ≈ 0.6447 (tolerance ±0.001) — 60-card deck, 24 lands, turn 3 on-play (7 + 2 draws = 9 seen).
      - hypergeomAtLeast(60, 24, 7, 1) ≈ 0.9637 (±0.001) — turn 1 on-play.
      - hypergeomAtLeast(60, 24, 9, 0) === 1 — k = 0 is always true.
      - hypergeomAtLeast(60, 24, 9, 25) === 0 — need more lands than exist (L = 24 < k = 25).
      - hypergeomAtLeast(60, 24, 9, 10) === 0 — k > n (can't draw 10 lands in 9 cards).
      - hypergeomAtLeast(60, 0, 9, 1) === 0 — no lands at all.
      - hypergeomAtLeast(60, 60, 9, 1) === 1 — all-lands deck, ≥1 guaranteed.
      - Result is finite and within [0, 1] for a 250-card, 100-land deck, turn 15 (stress test — guards against factorial overflow).

    `buildManaCurve(cards, { handSize, deckSize, landCount })` where `cards` is an array of `{ cmc: number; type_line: string; allocatedQuantity: number }`:
      - Returns `{ buckets: Array<{ cmc: number; count: number; pOnPlay: number; pOnDraw: number }>, totalCards: number, landCount: number, maxCmc: number }`.
      - buckets cover every integer CMC from 0 to maxCmc (inclusive), even if count is 0 (no gaps in the chart).
      - `count` at CMC 0 includes lands (locked decision: commander/wishlist policies are upstream; this fn just sums allocatedQuantity by cmc bucket).
      - Cards with `type_line` containing "Land" (case-insensitive) must be counted both in `landCount` AND in bucket 0 (lands are CMC 0).
      - `pOnPlay` at bucket k = hypergeomAtLeast(deckSize, landCount, 7 + Math.max(0, k - 1), k) — on-play turn k sees 7 + (k-1) cards; CMC 0 → 7 cards seen but k = 0 → P = 1.
      - `pOnDraw` at bucket k = hypergeomAtLeast(deckSize, landCount, 7 + k, k) — on-draw turn k sees 7 + k cards.
      - Given a deck fixture {60 cards, 24 lands, some mix of non-lands at CMC 1/2/3/4/5}, assert pOnPlay at CMC 3 ≈ 0.6447.
      - `buildManaCurve([], {...})` returns `{ buckets: [{ cmc: 0, count: 0, pOnPlay: 1, pOnDraw: 1 }], totalCards: 0, landCount: 0, maxCmc: 0 }` (no crash, sensible empty state).

    Log-factorial guard:
      - Internal `logFactorial(n)` memo array or function MUST handle n up to 260 without Infinity. Asserted by the 250-card stress test above.

    Implementation hints for the executor (write these AFTER all tests are RED):
      - Use `logFactorial(n) = logFactorial(n-1) + Math.log(n)` cached in a module-level array.
      - `logC(n, k) = logFactorial(n) - logFactorial(k) - logFactorial(n - k)`.
      - Then `P(X = i) = exp(logC(L, i) + logC(N - L, n - i) - logC(N, n))`.
      - Sum i from k to min(n, L). Return 0 if k > min(n, L).
      - Clamp the final result into [0, 1] in case of tiny floating-point overshoot.
      - cmc fallback: if `card.cmc` is undefined, treat as 0 for bucketing — but only count it as a land if type_line contains "Land" (many basics ship with cmc = 0 already).
  </behavior>
  <action>
    Follow TDD rigorously per CLAUDE.md:

    1. RED — create `tests/unit/utils/manaCurve.spec.ts` with ALL the test cases in `<behavior>` above. Use Vitest globals (no imports of describe/it/expect). Run `npm run test:unit -- manaCurve` and confirm failures.

    2. GREEN — create `src/utils/manaCurve.ts` with:
       - `logFactorial(n: number): number` — memoized, module-level cache array.
       - `hypergeomAtLeast(N: number, L: number, n: number, k: number): number` — guards: k ≤ 0 → 1; k > min(n, L) → 0; L ≤ 0 → 0 (when k > 0).
       - `buildManaCurve(cards, opts): ManaCurveResult` — opts `{ deckSize: number; landCount: number; handSize?: number }` (handSize defaults to 7, not used directly except via hypergeom inputs).
       - Export TypeScript types: `ManaCurveBucket`, `ManaCurveResult`, `ManaCurveCardInput`.
       - Run `npm run test:unit -- manaCurve` until all GREEN.

    3. REFACTOR — extract helpers if there's duplication; keep functions pure; no Vue imports; no Firebase; no network.

    4. Confirm `npm run test:unit` (full suite) still passes.

    Do NOT touch DeckView or any component in this task.
  </action>
  <verify>
    <automated>npm run test:unit -- manaCurve</automated>
  </verify>
  <done>
    - `src/utils/manaCurve.ts` exports `buildManaCurve`, `hypergeomAtLeast`, and the types.
    - All test cases in `<behavior>` pass.
    - Full `npm run test:unit` suite stays green (no regressions in sibling tests).
    - File is pure TS (no Vue, no fetch, no Firebase imports).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TDD Scryfall tapped-land detection service</name>
  <files>
    src/services/manaCurveLands.ts,
    tests/unit/services/manaCurveLands.spec.ts
  </files>
  <behavior>
    Test-first. Mock `fetch` via `vi.stubGlobal('fetch', ...)` or `vi.fn()`; do NOT import the real Scryfall service's rate limiter in tests — stub it out. Executor may choose to thin-wrap `getCardsByIds` or call the `/cards/collection` endpoint directly; either way the test surface below is the contract.

    Pure regex helper `isEtbTappedOracle(oracleText: string): boolean`:
      - `"Enters tapped."` → true
      - `"enters the battlefield tapped"` → true
      - `"Enters tapped.\nT: Add {G}."` → true (multiline)
      - `"Enters tapped unless you control two or more other lands."` → false (unless-window filter)
      - `"Enters the battlefield tapped unless you control a Plains or Island."` → false
      - `""` / undefined → false
      - `"Add one mana of any color. Spend this mana only to cast creature spells."` → false (no ETB tapped phrase)
      - `"This land enters the battlefield tapped. If you control…"` → true (sentence ends before "unless" appears; unless-clause must be within a small window AFTER the "tapped" match to disqualify)

    Implementation hint: match `/enters (the battlefield )?tapped\b/i`; after a match, scan the next ~60 chars of the same oracle_text; if "unless" appears in that window, treat as NOT ETB tapped.

    Async service `detectEtbTappedLands(scryfallIds: string[]): Promise<{ tappedCount: number; tappedNames: string[] }>`:
      - Input is the list of scryfallIds of cards whose type_line contains "Land" in the current deck (mainboard + wishlist, sideboard already excluded upstream).
      - Deduplicates input (`new Set(scryfallIds)`).
      - Session-memory cache: module-level `Map<scryfallId, boolean>`. On repeat call with same IDs, MUST NOT fetch again (assert via call count on fetch mock).
      - Calls Scryfall `/cards/collection` in batches of up to 75 identifiers as `{ id: scryfallId }` shape. Executor may delegate to `getCardsByIds` from `services/scryfall.ts`.
      - For each returned card: run `isEtbTappedOracle(card.oracle_text)`; if true, increment tappedCount and push `card.name` (deduped).
      - `detectEtbTappedLands([])` returns `{ tappedCount: 0, tappedNames: [] }` without fetching.
      - On fetch error / network failure / Scryfall 5xx → resolves to `{ tappedCount: 0, tappedNames: [] }` and logs a console.warn (do NOT throw; UI must degrade gracefully, just hide the warning).

    Test cases (exact):
      - `isEtbTappedOracle` — the 8 strings above return the expected booleans.
      - `detectEtbTappedLands(['guildgate-id'])` with mocked fetch returning `{ data: [{ id: 'guildgate-id', name: 'Azorius Guildgate', oracle_text: 'Azorius Guildgate enters tapped.\n{T}: Add {W} or {U}.' }] }` → `{ tappedCount: 1, tappedNames: ['Azorius Guildgate'] }`.
      - `detectEtbTappedLands(['glacial-id'])` with mocked fetch returning oracle_text with the "unless you control two or more other lands" clause → `{ tappedCount: 0, tappedNames: [] }`.
      - Calling twice with the same ID only fetches once (cache assertion on fetch mock call count).
      - Empty array → no fetch, returns zero-state.
      - Fetch throws → returns zero-state, no rethrow.

    Executor is free to decide whether to use `getCardsByIds` (needs a mock of that) OR call `fetch` directly. Either choice must make the tests above pass.
  </behavior>
  <action>
    Follow TDD:

    1. RED — write `tests/unit/services/manaCurveLands.spec.ts`. Mock `fetch` (or `getCardsByIds` if the service delegates). Run `npm run test:unit -- manaCurveLands` and confirm failures. Do NOT import real Scryfall service in the test — mock at the module boundary.

    2. GREEN — create `src/services/manaCurveLands.ts`:
       - Exports: `isEtbTappedOracle(oracleText?: string): boolean`, `detectEtbTappedLands(scryfallIds: string[]): Promise<{ tappedCount: number; tappedNames: string[] }>`.
       - Module-level `sessionCache = new Map<string, boolean>()` mapping scryfallId → isEtbTapped.
       - Regex: `const ETB_TAPPED_RX = /enters (the battlefield )?tapped\b/i` — after match, slice `oracleText.slice(match.index + match[0].length, match.index + match[0].length + 60)` and check for `/\bunless\b/i` in that window.
       - On repeat: partition IDs into known (from cache) + unknown (need fetch). Only fetch the unknown subset.
       - Use `getCardsByIds` from `services/scryfall.ts` OR raw fetch — executor's call; must make tests pass.
       - Wrap fetch + mapping in try/catch → zero-state on failure. `console.warn` the error.

    3. REFACTOR — keep exports minimal. No Vue imports.

    4. Run `npm run test:unit` (full suite) to confirm no regressions.
  </action>
  <verify>
    <automated>npm run test:unit -- manaCurveLands</automated>
  </verify>
  <done>
    - `src/services/manaCurveLands.ts` exports `isEtbTappedOracle` and `detectEtbTappedLands`.
    - All behavior-listed test cases pass.
    - Full `npm run test:unit` stays green.
    - Caching verified (second call with same IDs does not re-fetch).
    - Failure path returns zero-state without throwing.
  </done>
</task>

<task type="auto">
  <name>Task 3: Build DeckManaCurve component, integrate into DeckView, add i18n keys</name>
  <files>
    src/components/decks/DeckManaCurve.vue,
    src/views/DeckView.vue,
    src/locales/en.json,
    src/locales/es.json,
    src/locales/pt.json
  </files>
  <action>
    ## Part A — i18n first (atomic 3-locale update)

    Using the `i18n-check` skill: Grep each proposed key (listed in the `<i18n-check>` block of this plan's context) against `src/locales/en.json`. If any collides, reuse the existing key and document the reuse.

    Add new keys under `decks.manaCurve.*` to ALL THREE locale files in the SAME step. Do not commit a partial (anti-loop Rule 6: parallel = atomic).

    Example (en.json shape; mirror in es.json and pt.json with translations from `<i18n-check>`):
    ```json
    "decks": {
      "manaCurve": {
        "title": "Mana Curve",
        "cards": "cards",
        "onPlay": "On play",
        "onDraw": "On draw",
        "landsLabel": "Lands",
        "tappedWarning": "{count} ETB-tapped lands detected",
        "tappedWarningHelp": "They count in the probability, but they slow turns.",
        "noLands": "No lands detected in this deck.",
        "detecting": "Detecting tapped lands…",
        "probabilityLabel": "P(≥{k} lands by turn {k})"
      }
    }
    ```

    ## Part B — DeckManaCurve.vue component

    Create `src/components/decks/DeckManaCurve.vue` with `<script setup lang="ts">`.

    Props:
    ```ts
    interface Props {
      cards: DisplayDeckCard[]   // mainboard + commander + wishlist (sideboard already excluded)
      deckSize: number           // totalCards from the computation (mainboard + wishlist, NOT sideboard)
    }
    ```

    Internal logic:
    - `const input = computed(() => props.cards.map(c => ({ cmc: c.cmc ?? 0, type_line: c.type_line ?? '', allocatedQuantity: c.isWishlist ? c.requestedQuantity : c.allocatedQuantity })))`.
    - `const landCount = computed(() => input.value.filter(c => /land/i.test(c.type_line)).reduce((s, c) => s + c.allocatedQuantity, 0))`.
    - `const curve = computed(() => buildManaCurve(input.value, { deckSize: props.deckSize, landCount: landCount.value }))`.
    - `const landScryfallIds = computed(() => props.cards.filter(c => /land/i.test(c.type_line ?? '')).map(c => c.scryfallId).filter(Boolean))`.
    - `const tappedInfo = ref<{ tappedCount: number; tappedNames: string[] } | null>(null)`.
    - `const isDetectingTapped = ref(false)`.
    - `watch(landScryfallIds, async (ids) => { ... }, { immediate: true })` — debounce inside watch: if the array reference changes but the set of IDs is equal, skip. Otherwise call `detectEtbTappedLands(ids)` and store the result. Set `isDetectingTapped` true while awaiting.
      - CRITICAL per CLAUDE.md anti-loop Rule: DO NOT use `async onMounted` with await — use `watch(..., { immediate: true })` or call `void` on an inner async fn.
    - Use `useI18n()` for all user-facing text.

    Template:
    - Wrapper `<section class="mt-6 mb-6 bg-primary/40 border border-silver-30 p-4">` (fits the existing dark-primary / silver-30 palette; matches DeckStatsFooter aesthetic but inline, NOT teleported).
    - Header row: `{{ t('decks.manaCurve.title') }}` + `{{ t('decks.manaCurve.landsLabel') }}: {{ landCount }} / {{ deckSize }}`.
    - If `curve.buckets.length === 1 && curve.buckets[0].count === 0` → render `{{ t('decks.manaCurve.noLands') }}` empty state, no bars.
    - Bar chart: CSS grid, one column per bucket (scroll-x on narrow screens). Bars use `bg-neon` with height scaled to the max bucket count (e.g. `:style="{ height: `${(bucket.count / maxCount) * 120}px` }"`). Show CMC label above the bar and the count inside/below.
    - Below each bar (for CMC ≥ 1), two small rows:
      - `On play`: `{{ (bucket.pOnPlay * 100).toFixed(0) }}%`
      - `On draw`: `{{ (bucket.pOnDraw * 100).toFixed(0) }}%`
      Use text-tiny and color by threshold: ≥ 0.90 → `text-neon`, 0.70–0.89 → `text-yellow-400`, < 0.70 → `text-rust`. Keep this inline-only, no new config.
      For CMC 0, render `100%` explicitly for both rows (defensive).
    - Tapped warning block: if `isDetectingTapped` → small `{{ t('decks.manaCurve.detecting') }}` spinner; else if `tappedInfo?.tappedCount > 0` → yellow/orange-ish banner (`text-yellow-400 border-yellow-400/40 border p-2`) with `{{ t('decks.manaCurve.tappedWarning', { count: tappedInfo.tappedCount }) }}` and a tiny help line using `tappedWarningHelp`.
    - Accessibility: each bar is a `<div role="img" :aria-label="t('decks.manaCurve.probabilityLabel', { k: bucket.cmc })">` with visible text inside. The chart container is a `<section>` with an h3/h4 heading.
    - Do NOT add any external chart library. Pure CSS + template.

    ## Part C — DeckView.vue integration

    Anti-loop Rule 1 (READ before touching): DeckView has exactly ONE deck editor region (mainboard grid + optional sideboard grid + empty state). There is no parallel sibling in BinderView for this feature — per locked decision 11 and the spec, ONLY DeckView gets the curve. Do NOT replicate in BinderView.

    In `src/views/DeckView.vue`:
    1. Import: `import DeckManaCurve from '../components/decks/DeckManaCurve.vue'`.
    2. Derive a computed `manaCurveDeckSize`:
       ```ts
       const manaCurveDeckSize = computed(() => {
         // Mainboard owned + wishlist (sideboard excluded per locked decision 9)
         return mainboardOwnedCount.value + mainboardWishlistCount.value
       })
       ```
    3. In the template, AFTER the sideboard grid block (and after the empty-deck state) and BEFORE the closing `</div>` chain that leads to the modals / teleported FAB / DeckStatsFooter, add:
       ```vue
       <DeckManaCurve
         v-if="selectedDeck && mainboardDisplayCards.length > 0"
         :cards="mainboardDisplayCards"
         :deck-size="manaCurveDeckSize"
       />
       ```
       The `v-if` gate prevents render when no deck is selected OR the mainboard is empty (no meaningful curve).
    4. Confirm: the curve sits INSIDE `<AppContainer>` (scrollable body), the DeckStatsFooter stays `<Teleport to="body">` (fixed). No overlap.

    ## Part D — Verification (must all pass before marking done)

    1. `npm run test:unit` — no regressions.
    2. `npx vite build` — MUST succeed. Use `npx vite build`, NOT `npm run build` (pre-existing lint errors per CLAUDE.md).
    3. Grep each new i18n key across the 3 locales; every key must appear in all 3.
    4. `npx vue-tsc --noEmit` (or `npm run type-check`) — no new TS errors in the touched files.

    ## Part E — Manual verification checklist (list in Summary for user)

    - Open DeckView with a 60-card deck with ~24 lands; confirm bar chart renders with bars from CMC 0 through max CMC, counts match expectations, on-play/on-draw percentages appear under each bar for CMC ≥ 1 and CMC 0 shows 100%.
    - Add a Guildgate (or any ETB-tapped land) to the deck; confirm the "X ETB-tapped lands detected" banner appears after the Scryfall fetch resolves.
    - Add a Glacial Fortress (checkland) — confirm it is NOT counted as ETB tapped.
    - Empty deck → no curve shown (v-if gate).
    - Sideboard cards do NOT affect the curve (add sideboard cards, watch curve unchanged).
    - Wishlist cards DO affect the curve.
    - Commander card IS in its CMC bucket.
    - Switch language to es/pt and confirm all labels translate.
    - Confirm the curve does NOT overlap DeckStatsFooter on mobile (scroll to the bottom; footer remains fixed while curve scrolls naturally above it).
  </action>
  <verify>
    <automated>npm run test:unit && npx vite build</automated>
  </verify>
  <done>
    - All three locale files have the new `decks.manaCurve.*` keys (atomically, same commit).
    - `src/components/decks/DeckManaCurve.vue` exists and renders a bar chart + probabilities + tapped warning.
    - `src/views/DeckView.vue` mounts the component after the grids, inside AppContainer, before the teleported footer.
    - `npm run test:unit` passes in full.
    - `npx vite build` succeeds.
    - No new TS errors (`npx vue-tsc --noEmit` clean on touched files).
    - Manual checklist in Part E is included verbatim in the SUMMARY for the user to run.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human verification on local dev</name>
  <what-built>
    Mana curve component inline in DeckView with hypergeometric probability overlay and ETB-tapped land detection warning. See Task 3 Part E for the full manual checklist.
  </what-built>
  <how-to-verify>
    1. Run `npm run dev` and open the app.
    2. Select a deck with at least 24 lands across 60 cards. Confirm:
       - Bar chart appears AFTER the mainboard/sideboard grid and BEFORE the fixed footer.
       - Bars span from CMC 0 to the deck's max CMC with correct counts.
       - For CMC ≥ 1, two percentages appear under each bar (on-play / on-draw). CMC 0 shows 100%.
       - On-play at CMC 3 for a 60/24 deck ≈ 64% (within a percent).
    3. Add an ETB-tapped land (e.g., any Guildgate). Wait for Scryfall fetch. Confirm "X tierras ETB tapped detectadas" banner appears.
    4. Add a checkland (Glacial Fortress) — must NOT be counted in the tapped banner.
    5. Sideboard cards (non-commander format) must NOT shift the curve.
    6. Wishlist cards MUST be included.
    7. Switch to es/pt — labels translate correctly.
    8. On mobile viewport, confirm the curve scrolls naturally while the DeckStatsFooter remains fixed at the bottom — no overlap.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues so Task 3 can be revised.</resume-signal>
</task>

</tasks>

<verification>
Phase-wide checks:
- Unit tests: `npm run test:unit` — green.
- Build: `npx vite build` — succeeds (do NOT use `npm run build`, pre-existing lint errors).
- Type-check: `npx vue-tsc --noEmit` — no new errors in touched files.
- i18n coverage: every new `decks.manaCurve.*` key present in en.json, es.json, pt.json (verify via Grep for each key across the 3 files).
- Atomic parallelism (anti-loop Rule 6): all three locale edits and the DeckView integration land in the same commit set.
- No async onMounted with await (anti-loop rule) — tapped detection uses `watch(..., { immediate: true })`.
- Sideboard exclusion verified manually (add sideboard card, curve unchanged).
</verification>

<success_criteria>
- Task 1 tests pass with the locked known values (0.6447 at turn 3 on-play, 0.9637 at turn 1 on-play, P = 1 at CMC 0, P = 0 when k > L).
- Task 2 tests pass with Guildgate true / Glacial Fortress false / unless-clause filter / cache behavior / empty-input short-circuit.
- DeckView integration: curve appears inline after the editor grid, before the teleported footer, only when a deck is selected and has cards.
- Tapped-land banner renders when detected, disappears when none.
- All three locales have the new keys.
- `npm run test:unit` and `npx vite build` both pass.
</success_criteria>

<output>
After completion, create `.planning/quick/260418-pzu-mana-curve-per-deck-with-hypergeometric-/260418-pzu-SUMMARY.md` with:
- Files created / modified.
- Test results (all new tests passing + no regressions in the full suite).
- Build result.
- Confirmation that the 3 locale files were updated atomically.
- The manual verification checklist (copy from Task 3 Part E) for the user to execute on `npm run dev`.
- Any deviations from the locked decisions (there should be none — if any, explain).
- Next steps: after user "approved" on Task 4, bump version (`npm version minor --no-git-tag-version` — new feature), commit, push to `develop` for auto-deploy to `cranial-trading-dev.web.app`.
</output>
