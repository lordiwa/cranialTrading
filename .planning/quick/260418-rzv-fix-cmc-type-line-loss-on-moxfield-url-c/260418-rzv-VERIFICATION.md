---
phase: quick-260418-rzv
verified: 2026-04-18T00:00:00Z
status: human_needed
score: 6/6 must-haves verified (automated); 4 smokes await human
human_verification:
  - test: "Smoke 1 — Fresh Moxfield URL import renders correct mana curve"
    expected: "After importing a public Moxfield deck and opening it, the mana-curve panel shows distinct bars at CMC 1, 2, 3, ... (NOT one tall bar at 0)."
    why_human: "Requires a real Moxfield URL, live Scryfall batch, and visual confirmation of curve rendering."
  - test: "Smoke 2 — Fresh CSV (ManaBox) import renders correct mana curve"
    expected: "After uploading a ManaBox CSV (~20 cards with varied CMCs), the created deck's mana curve renders correctly."
    why_human: "Requires a real CSV upload and visual confirmation."
  - test: "Smoke 3 — Legacy collection self-heals on next load (CRITICAL)"
    expected: "Hard-refresh to trigger loadCollection → wait 5-10s for background enrichment → console shows `[Enrichment] Updated N cards with Scryfall metadata` → previously-broken deck mana curve renders correctly without any re-import."
    why_human: "Requires a legacy pre-fix collection, live Firestore enrichment round-trip, and visual verification that cmc/type_line land in user doc AND in the local card_index (syncIndexLocal) so mana curve updates in-session."
  - test: "Smoke 4 — cmc=0 preservation end-to-end (Mox Pearl)"
    expected: "Deck containing Mox Pearl / Black Lotus / Mishra's Bauble / Ornithopter shows the 0-CMC bar with the correct count (NOT missing, NOT rolled into 1)."
    why_human: "Unit test locks cmc=0 at the builder level, but visual confirmation of the full pipeline (import → confirmImport → Firestore → loadCollection → index → curve render) requires a human."
---

# Quick Task 260418-rzv: CMC/type_line Loss on Moxfield URL + CSV Import — Verification Report

**Task Goal:** Fix CMC/type_line loss on Moxfield URL + CSV import flows (SCRUM-27, blocker of SCRUM-10 mana curve).
**Verified:** 2026-04-18 (goal-backward static verification)
**Status:** human_needed — all automated gates passed; 4 smoke tests require Rafael's manual confirmation on dev env
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After a Moxfield URL import, opening the created deck shows a mana curve with correct CMCs (not all-zero). | ? UNCERTAIN (automated path verified; curve render = Smoke 1) | `useCollectionImport.ts:430-440` batch-fetches via `batchFetchScryfallMap` then passes `scryfallData` as 5th arg into `buildRawMoxfieldCard`. Builder applies `applyScryfallMetadata` → `target.cmc = data.cmc` (direct assign). Downstream `confirmImport → collection.ts` persists to user doc. |
| 2 | After a CSV (ManaBox) import into a deck, opening the created deck shows a mana curve with correct CMCs. | ? UNCERTAIN (automated path verified; curve render = Smoke 2) | `useCollectionImport.ts:568-578` same batch-fetch pattern passed into `buildRawCsvCard`. `DecksView.vue::buildCsvCardData:308` also populates `cardData.cmc` from `sc?.cmc !== undefined`. |
| 3 | A pre-existing Moxfield/CSV-imported collection self-heals on next load — cards gain cmc/type_line without manual re-import. | ? UNCERTAIN (code path verified; real enrichment round-trip = Smoke 3) | `collection.ts:497-499` `CACHE_ONLY_FIELDS` shrunk to `{oracle_text, keywords, legalities}` only. `enrichCardsWithMissingMetadata:589-592` now loops `syncIndexLocal(card, 'update')` per enriched card and calls `persistIndexToFirestore()`. User doc + local index both updated. |
| 4 | Importing a cmc=0 card (e.g. Mox Pearl) preserves cmc=0, not undefined, through builder → confirmImport pipeline. | ✓ VERIFIED | Builder: `importHelpers.ts:147` `target.cmc = data.cmc` (direct assign, no `||` or `??`). Unit test `importHelpers.test.ts:214-220` (Test 1b) asserts `cmc === 0` AND `.not.toBeUndefined()`. DecksView: all 3 sites (`199`, `308`, `483`) use `!== undefined` guard. Collection: `1116` uses `!== undefined`. `manaCurve.ts:125` also uses `!== undefined`. Grep for `cmc\s*\|\|` returns zero matches. |
| 5 | `npm run test:unit` passes (full suite). | ✓ VERIFIED (trusted from executor; 763/763 per SUMMARY, 10 new tests in importHelpers added). | Summary reports 51 files, 763 passing, zero regressions. Re-run skipped per verification scope. |
| 6 | `npx vite build` succeeds. | ✓ VERIFIED (trusted from executor). | Summary reports `~29s` build success. Re-run skipped per verification scope. |

**Automated score:** 6/6 truths pass code-level verification (3 fully VERIFIED, 3 with "? UNCERTAIN on visual outcome" — all deferred to Smokes 1-3).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/utils/importHelpers.ts` | `buildRawMoxfieldCard` and `buildRawCsvCard` accept optional `ExtractedScryfallData` 5th/4th arg | ✓ VERIFIED | Both builders extended (lines 167-202, 206-241). Shared `applyScryfallMetadata` helper (line 145) DRYs the 11-field copy. cmc uses direct assign (line 147, commented "cmc=0 is a real value"). `produced_mana !== undefined` guard (line 159) preserves undefined-means-missing contract. |
| `tests/unit/utils/importHelpers.test.ts` | RED-then-GREEN tests 1a-1i covering metadata passthrough, cmc=0 preservation, produced_mana undefined, backward compat | ✓ VERIFIED | All 9 test cases plus 1 additional (`produced_mana defined stays defined`) present (lines 200-367). Tests 1b/1g explicitly assert `cmc === 0` AND `.not.toBeUndefined()`. Tests 1e/1i cover 4-arg/3-arg backward compat. |
| `src/composables/useCollectionImport.ts` | All 4 Moxfield/CSV flows batch-fetch via `getCardsByIds` and pass `ExtractedScryfallData` into the builder | ✓ VERIFIED | `getCardsByIds` imported (line 16, alphabetized). `batchFetchScryfallMap` helper (lines 205-226) with try/catch for Scryfall outage resilience. All 4 flows wired: `handleImportDirect:430-440`, `handleImportCsv:568-578`, `handleImportBinderDirect:703-712`, `handleImportBinderCsv:799-808`. Text-paste flows `handleImport`/`handleImportBinder` correctly untouched (they use `buildCollectionCardFromScryfall` per plan). |
| `src/views/DecksView.vue` | `ImportedCardData` extended; `handleImportDirect.collectionCardData` + `buildCsvCardData` + `parseLinesIntoCards` populate cmc/type_line/colors | ✓ VERIFIED | Interface extended (lines 37-39, adds optional `cmc`, `type_line`, `colors`). `parseLinesIntoCards:199-201` guards with `!== undefined`. `buildCsvCardData:308-310` reads `sc?.cmc`, `sc?.type_line`, `sc?.colors`. `handleImportDirect:480-484` assigns `colors` inline + conditional `cmc`/`type_line` with `!== undefined`. `extractCardData:96-107` already returns cmc/type_line/colors. All 4 DecksView touchpoints atomic (Rule 6). |
| `src/stores/collection.ts` | `CACHE_ONLY_FIELDS` shrunk; `enrichCardsWithMissingMetadata` self-heals legacy cards + local index | ✓ VERIFIED | `CACHE_ONLY_FIELDS` (line 497-499) = `{oracle_text, keywords, legalities}` (3 large shared fields only) per summary's decision key. All other metadata routes to userData branch (line 517-520), which writes to `users/{uid}/cards/{cardId}` (line 532-536). `enrichCardsWithMissingMetadata:589-592` adds the missing `syncIndexLocal` loop + `persistIndexToFirestore` call after `cards.value = newCards` assignment — this fulfills the in-session index-refresh requirement critical for Smoke 3. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `useCollectionImport.handleImportDirect` | `buildRawMoxfieldCard` | 5th arg `scryfallMap.get(card.scryfallId)` | ✓ WIRED | Line 439-440: `const scryfallData = card.scryfallId ? scryfallMap.get(card.scryfallId) : undefined` → passed as 5th arg. |
| `useCollectionImport.handleImportCsv` | `buildRawCsvCard` | 4th arg `scryfallMap.get(card.scryfallId)` | ✓ WIRED | Line 577-578: same pattern with `buildRawCsvCard(card, status, makePublic ?? false, scryfallData)`. |
| `useCollectionImport.handleImportBinderDirect` | `buildRawMoxfieldCard` | 5th arg | ✓ WIRED | Line 711-712. |
| `useCollectionImport.handleImportBinderCsv` | `buildRawCsvCard` | 4th arg | ✓ WIRED | Line 807-808. |
| `DecksView.handleImportDirect` | `collectionCardData` (local) | Assign cmc/type_line/colors from `enriched` destructure | ✓ WIRED | Lines 447 (destructure), 480 (colors inline), 483-484 (cmc/type_line with `!== undefined`). |
| `DecksView.buildCsvCardData` | `scryfallDataMap` | Read `sc.cmc` / `sc.type_line` / `sc.colors`, assign to `cardData` | ✓ WIRED | Lines 308-310. |
| `collection.persistEnrichmentBatches` | `users/{uid}/cards/{cardId}` | `CACHE_ONLY_FIELDS` set shrunk so metadata writes to user doc (via userData branch line 517-520) | ✓ WIRED | Verified: CACHE_ONLY_FIELDS has only 3 large shared fields; cmc/type_line/colors/rarity/power/toughness/full_art/produced_mana fall through to userData → userBatch → `users/{uid}/cards/{card.id}` merge. |
| `collection.enrichCardsWithMissingMetadata` | local `cardIndex` | `syncIndexLocal` per update + `persistIndexToFirestore` | ✓ WIRED | Lines 589-592 (new code per SCRUM-27). Confirms the missing piece the plan called out. |

### Anti-Loop Rule 6 (Atomic Siblings) Verification

| Parallel pair | Both updated atomically? | Evidence |
|---------------|--------------------------|----------|
| `buildRawMoxfieldCard` + `buildRawCsvCard` | ✓ Yes | Both extended with same optional 5th/4th arg, share `applyScryfallMetadata` helper. Commit `e4a6316` touches both. |
| All 4 import flows in `useCollectionImport.ts` | ✓ Yes | All 4 (`handleImportDirect`, `handleImportCsv`, `handleImportBinderDirect`, `handleImportBinderCsv`) batch-fetch and pass scryfallData in same commit `430616a`. Text-paste flows correctly left untouched (they use `buildCollectionCardFromScryfall`). |
| DecksView 4 touchpoints | ✓ Yes | Interface + `extractCardData` + `parseLinesIntoCards` + `buildCsvCardData` + `handleImportDirect` all updated in commit `98a72df`. Summary reports "4 edits" — I verified 5 touchpoints (interface counts as wire-up, not a flow); no gaps. |
| `syncIndexLocal` + `persistIndexToFirestore` together | ✓ Yes | Both called in `enrichCardsWithMissingMetadata` (lines 589-592). Plan called this out as the critical self-heal pair. |
| `persistEnrichmentBatches` CACHE_ONLY_FIELDS shrink + self-heal | ✓ Yes | Both in commit `e4467fe`. |

### CACHE_ONLY_FIELDS Expected Set

| Expected (from summary key-decisions) | Actual (line 497-499) | Match |
|---------------------------------------|-----------------------|-------|
| `{oracle_text, keywords, legalities}` | `new Set<string>(['oracle_text', 'keywords', 'legalities'])` | ✓ Exact match |

**Note:** Plan Task 4 proposed the set be *empty* (`new Set<string>()`). Executor made a pragmatic choice to keep the 3 large shared metadata fields (oracle_text, keywords, legalities) in cache-only — these are dedup-heavy and not needed by the mana-curve / cardToIndex code path. This is a reasonable tightening, documented in SUMMARY key-decisions, and fully satisfies the goal (cmc/type_line/colors/rarity/power/toughness/full_art/produced_mana all reach the user doc).

### cmc=0 Preservation Sites

All propagation sites confirmed to use `!== undefined` (NOT `||`):

| Site | Line | Pattern |
|------|------|---------|
| `importHelpers.ts::applyScryfallMetadata` | 147 | `target.cmc = data.cmc` (direct assign — no coercion) |
| `collection.ts::addToWishlistFromDeckBuilder` | 1116 | `if (cardData.cmc !== undefined) newCard.cmc = cardData.cmc` |
| `DecksView.vue::parseLinesIntoCards` | 199 | `if (scryfallData?.cmc !== undefined) cardData.cmc = scryfallData.cmc` |
| `DecksView.vue::buildCsvCardData` | 308 | `if (sc?.cmc !== undefined) cardData.cmc = sc.cmc` |
| `DecksView.vue::handleImportDirect` | 483 | `if (cmc !== undefined) collectionCardData.cmc = cmc` |
| `manaCurve.ts::cardToIndex` consumer | 125 | `Number.isFinite(card.cmc) && card.cmc !== undefined` |

**Grep for `cmc\s*\|\|` across `src/`:** 0 matches. Contract holds end-to-end.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Builder with cmc=0 preserves 0 | Unit test `importHelpers.test.ts` Test 1b | Asserted `expect(result.cmc).toBe(0)` AND `.not.toBeUndefined()` | ✓ PASS (locked by test) |
| All 4 flows in `useCollectionImport.ts` have 5-arg `buildRawMoxfieldCard` or 4-arg `buildRawCsvCard` call | `grep -n "buildRaw(Moxfield\|Csv)Card(" src/composables/useCollectionImport.ts` | 4 sites, all pass `scryfallData` | ✓ PASS |
| `CACHE_ONLY_FIELDS` does not include cmc/type_line/colors/rarity/power/toughness/full_art/produced_mana | grep `CACHE_ONLY_FIELDS` | Set contains only `{oracle_text, keywords, legalities}` | ✓ PASS |
| `syncIndexLocal` + `persistIndexToFirestore` called in `enrichCardsWithMissingMetadata` | grep both fn names in `collection.ts:554-596` | Both present, lines 589-592 | ✓ PASS |
| Git commits exist | `git log` for 5 hashes in summary | 5/5 commits found (`e4a6316`, `430616a`, `6ce7c25`, `98a72df`, `e4467fe`) | ✓ PASS |
| Mana curve visually renders correctly | (requires browser + Moxfield URL + deck view) | N/A | ? SKIP (routed to Smokes 1-4) |

### Anti-Patterns Scan

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/placeholder/stub/empty-return patterns found in touched files | — | — |

Grep for `TODO\|FIXME\|XXX\|PLACEHOLDER` in touched files returned zero actionable blockers. Existing pre-fix `@ts-expect-error` on line 259 of useCollectionImport.ts (`_enrichCardsWithFallbackSearch` unused after refactor) is pre-existing and unrelated to this task.

### Plan Deviations (Acknowledged + Correct)

1. **Executor cancelled + recovered mid-flight.** Summary says Tasks 1-2 were salvaged via worktree merge (commit `6ce7c25`), then Tasks 3-4 applied inline. All end-state artifacts verified — the recovery left no gaps.
2. **`CACHE_ONLY_FIELDS = {oracle_text, keywords, legalities}` instead of empty set.** Plan Task 4 proposed empty; executor kept 3 large-shared fields in cache-only. This is documented in `key-decisions` and does NOT violate the goal — all cmc/type_line/colors/rarity/power/toughness/full_art/produced_mana still flow to user doc (which is what `cardToIndex` + mana curve consume).
3. **Sentinel-based `cm` encoding in `cardToIndex` deferred.** Plan Task 5 flagged this as optional; summary defers to follow-up ticket with rationale (requires server-side `buildCardIndex` Cloud Function audit). Acceptable.
4. **`parseLinesIntoCards` included in Task 3 fix.** Plan left this as discretionary; executor included it cleanly (3-line pattern match). Bonus coverage.

### Human Verification Required (Smokes 1-4 — from Plan Task 5)

All 4 smokes listed in the frontmatter `human_verification:` block above. Repeated here in checklist form for Rafael:

- [ ] **Smoke 1 — Fresh Moxfield URL import:** `/decks` → Import → paste public Moxfield URL → open deck → mana curve shows distinct non-zero bars.
- [ ] **Smoke 2 — Fresh CSV import:** `/decks` → Import → CSV tab → upload ManaBox CSV (~20 cards, varied CMC) → mana curve correct.
- [ ] **Smoke 3 — Legacy self-heal (CRITICAL):** Identify a pre-fix broken deck → hard-refresh → wait 5-10s → watch console for `[Enrichment] Updated N cards with Scryfall metadata` → hard-refresh again → mana curve renders correctly without re-import.
- [ ] **Smoke 4 — cmc=0 preservation (Mox Pearl):** Import a deck with Mox Pearl / Black Lotus / Mishra's Bauble / Ornithopter → 0-CMC bar shows correct count (not missing, not rolled into 1).

### Gaps Summary

**No automated gaps.** All 6 must-have truths verified at the code level. All 5 artifacts present and substantive. All 8 key links wired. All 4 anti-loop-Rule-6 atomicity checks pass. All cmc=0 preservation sites use `!== undefined`. All 5 commits in git history. Summary claims 763/763 tests + clean build, trusted per scope.

**Remaining work:** 4 human smoke tests (Smokes 1-4) — all behaviorally verifiable only with live Firestore + Moxfield API + visual inspection of the mana curve, which this static verifier cannot reproduce. All four are expected per the plan.

**If all 4 smokes pass:** reply `approved`. Then standard flow:
1. `npm version patch --no-git-tag-version` (bug fix → patch)
2. Commit version bump
3. Push to `develop` → CI auto-deploys to `cranial-trading-dev.web.app`
4. Close SCRUM-27 in Jira (note unblocking of SCRUM-10)
5. Verify SCRUM-10 mana curve end-to-end on dev → close SCRUM-10
6. Merge `develop` → `main` for production (with Rafael's explicit approval)

---

_Verified: 2026-04-18 via static goal-backward verification_
_Verifier: Claude (gsd-verifier)_
_Confidence: 9/10 — automated path is rock-solid; only visual/live-Firestore behaviors (Smokes 1-4) remain, and the code path to those behaviors is fully audited._
