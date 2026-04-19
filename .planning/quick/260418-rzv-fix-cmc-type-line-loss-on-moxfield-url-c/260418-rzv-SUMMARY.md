---
phase: quick-260418-rzv
plan: 01
subsystem: import
tags: [bug-fix, data-integrity, import, scryfall, self-heal, scrum-27]
requires: []
provides:
  - buildRawMoxfieldCard / buildRawCsvCard accept optional ExtractedScryfallData (importHelpers.ts)
  - useCollectionImport flows batch-fetch Scryfall metadata before building ImportCardData
  - DecksView handleImportDirect + handleImportCsv preserve cmc/type_line/colors
  - enrichCardsWithMissingMetadata self-heals legacy collections (writes cmc/type_line to user doc + syncs local index)
affects:
  - src/utils/importHelpers.ts
  - src/composables/useCollectionImport.ts
  - src/views/DecksView.vue
  - src/stores/collection.ts
tech-stack:
  added: []
  patterns:
    - "optional scryfallData passthrough on raw builders (mirrors buildCollectionCardFromScryfall)"
    - "!== undefined guards to preserve real cmc=0 (Mox Pearl)"
    - "syncIndexLocal + persistIndexToFirestore after enrichment → index stays consistent"
    - "CACHE_ONLY_FIELDS narrowed to {oracle_text, keywords, legalities} (large shared fields only)"
files-modified:
  - src/utils/importHelpers.ts
  - tests/unit/utils/importHelpers.test.ts
  - src/composables/useCollectionImport.ts
  - src/views/DecksView.vue
  - src/stores/collection.ts
key-decisions:
  - "CACHE_ONLY_FIELDS shrunk to only {oracle_text, keywords, legalities} — cmc/type_line/colors/rarity/power/toughness/full_art/produced_mana now flow to user doc so local consumers (mana curve, filter, cardToIndex) read them without cache merge."
  - "Sentinel-based cm encoding in cardToIndex (-1 for missing) deferred to follow-up ticket — requires server-side buildCardIndex Cloud Function verification out of scope for this quick task."
  - "parseLinesIntoCards (text-paste in DecksView) included in fix — 5-line clean change to extractCardData + cardData build, matches pattern of other paths."
metrics:
  duration: "~90 min (includes 1 cancelled executor + recovery + inline application of Tasks 3-4)"
  completed: "2026-04-18"
  new-tests: 10
  total-tests: 763
  commits: 4
---

# Quick Task 260418-rzv: Fix CMC/type_line loss on Moxfield URL + CSV import flows (SCRUM-27)

Imports preserve mana-cost metadata end-to-end; legacy broken collections self-heal on next load. Unblocks SCRUM-10 (mana curve) — the curve and mana filter now render correct data after any import flow.

## Commits

| Hash | Task | Message |
|------|------|---------|
| `e4a6316` | 1 | feat(import): buildRaw* helpers accept Scryfall metadata (SCRUM-27) |
| `430616a` | 2 | feat(import): pass Scryfall metadata through useCollectionImport flows (SCRUM-27) |
| `6ce7c25` | — | chore: salvage tasks 1-2 from cancelled executor 260418-rzv |
| `98a72df` | 3 | feat(import): DecksView handleImportDirect/handleImportCsv preserve metadata (SCRUM-27) |
| `e4467fe` | 4 | fix(enrichment): write cmc/type_line to user doc for legacy self-heal (SCRUM-27) |

## What changed

### Task 1 — `src/utils/importHelpers.ts`
`buildRawMoxfieldCard` and `buildRawCsvCard` now accept optional `scryfallData?: ExtractedScryfallData` and copy `cmc`, `type_line`, `colors`, `rarity`, `oracle_text`, `keywords`, `legalities`, `full_art`, `produced_mana`, `power`, `toughness` when present. Shared helper `applyScryfallMetadata` preserves `cmc=0` via direct assignment (no `||` coercion).

Tests: 10 new cases in `tests/unit/utils/importHelpers.test.ts` covering both builders with/without Scryfall data, and explicit `cmc=0` preservation (Mox Pearl, Ornithopter).

### Task 2 — `src/composables/useCollectionImport.ts`
All 4 flows (`handleImport`, `handleImportCsv`, `handleImportBinder`, `handleImportBinderCsv`) now:
1. Batch-fetch Scryfall via `getCardsByIds` BEFORE the build loop.
2. Build a `scryfallMap: Map<scryfallId, ScryfallCard>`.
3. Pass `scryfallMap.get(card.scryfallId)` into the builders.

Shared helper `batchFetchScryfallMap` DRY's the batching logic. Existing text-paste paths (`handleImport` plain, `handleImportBinder` plain) untouched — they already worked via `buildCollectionCardFromScryfall`.

### Task 3 — `src/views/DecksView.vue`
Four edits to align DecksView's local flows with the pattern:
- `ImportedCardData` interface: added optional `cmc`, `type_line`, `colors`.
- `extractCardData`: returns `cmc`, `type_line`, `colors` from Scryfall.
- `parseLinesIntoCards`: propagates to `cardData` with `!== undefined` guard on cmc.
- `handleImportDirect` (Moxfield URL): `collectionCardData` includes `colors` inline + conditional `cmc`/`type_line`.
- `buildCsvCardData`: reads `sc?.cmc`, `sc?.type_line`, `sc?.colors` from `scryfallDataMap`.

### Task 4 — `src/stores/collection.ts` (the self-heal)
- `CACHE_ONLY_FIELDS` shrunk from 11 fields to 3: `{oracle_text, keywords, legalities}`. All other Scryfall metadata now lands in the user doc too.
- `enrichCardsWithMissingMetadata`: after `cards.value = newCards`, loops `syncIndexLocal(card, 'update')` per updated card and calls `persistIndexToFirestore()`. Ensures `cardToIndex` captures the enriched cmc/type_line/colors — mana curve and mana filter become correct without page reload cycles.

## Test Results

- **New tests:** 10 (all in Task 1).
- **Full suite:** 51 files, **763 tests, all passing** (baseline before SCRUM-27: 753).
- **Regressions:** none.

## Type-check + Build

- `npx vue-tsc --noEmit`: clean on all touched files.
- `npx vite build`: succeeds in ~29s.

## Anti-loop rule evidence

- **Rule 6 (atomic siblings):** Task 1 updates both `buildRawMoxfieldCard` + `buildRawCsvCard` in one commit. Task 2 updates all 4 flows in one commit. Task 3 updates all 4 DecksView touchpoints in one commit.
- **Rule 1 (read before touching):** every edit preceded by Read of the relevant range.
- **Rule 7 (build + tests = done):** `npm run test:unit` and `npx vite build` green after every task.
- **cmc=0 preservation (Rafael's edge case):** `!== undefined` checks used in DecksView.vue lines updated (NOT `||` coercion). Explicit test in `importHelpers.test.ts` locks the contract.

## Deviations from plan

1. **Executor cancelled mid-flight after Tasks 1-2.** Rafael interpreted silence as hung. Recovery: salvaged Tasks 1-2 commits via worktree merge, then applied Tasks 3-4 inline (orchestrator directly) — faster than re-spawning executor.
2. **Sentinel-based `cm` encoding in `cardToIndex` (plan Task 5 bonus)** — deferred. Needs server-side `buildCardIndex` Cloud Function inspection to ensure the -1 sentinel doesn't break index rebuilds. Logged as follow-up intent in this summary; not a SCRUM-10 blocker.

## Manual verification checklist (Task 5 — for Rafael)

Run on `npm run dev` OR `cranial-trading-dev.web.app` after push:

### Smoke 1: Fresh Moxfield URL import → correct mana curve
1. Go to `/decks` → `Import` → paste any public Moxfield deck URL.
2. Wait for import → click into the deck.
3. Open mana curve panel.
4. **Expected:** bars match deck contents, non-0 CMCs show correctly, NOT everything in bucket 0.

### Smoke 2: Fresh CSV import → correct mana curve
1. Export a small ManaBox CSV (~20 cards with varied CMCs).
2. Go to `/decks` → `Import` → CSV tab → upload.
3. Click into the deck.
4. **Expected:** mana curve renders correctly.

### Smoke 3: Legacy self-heal (the critical one)
1. Identify an existing deck in your collection that has broken CMCs (curve flat at 0).
2. Hard refresh the page to trigger `loadCollection`.
3. Wait ~5-10 seconds for background enrichment.
4. Watch browser console for `[Enrichment] Updated N cards with Scryfall metadata`.
5. **Expected:** mana curve becomes correct without re-importing. Mana filter in CollectionView also shows correct distribution.

### Smoke 4: cmc=0 preservation (Mox Pearl edge case)
1. Import a deck containing a 0-cmc card (Mox Pearl, Black Lotus, Mishra's Bauble, Ornithopter).
2. Open mana curve.
3. **Expected:** 0-cmc bar shows the correct count (NOT missing, NOT rolled into 1).

## Next steps for Rafael

1. Run Smokes 1-4 above on `npm run dev` OR let CI deploy to `cranial-trading-dev.web.app`.
2. If all pass → reply `approved`.
3. Then standard flow: `npm version patch --no-git-tag-version` (bug fix → patch), commit version bump, push to `develop` for dev-env auto-deploy.
4. Close SCRUM-27 in Jira.
5. Verify SCRUM-10 curva also works correctly now → close SCRUM-10.
6. Merge `develop` → `main` for production once verified on dev.

## Jira

- **SCRUM-27** (this ticket): ready to close after manual verification.
- **SCRUM-10** (mana curve): blocker cleared — can close once Smoke 1 passes.
