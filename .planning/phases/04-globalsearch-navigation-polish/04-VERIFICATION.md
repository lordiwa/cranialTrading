---
phase: 04-globalsearch-navigation-polish
verified: 2026-04-17T00:00:00Z
status: human_needed
score: 13/13 must-haves verified (automated); 3 items require live-browser confirmation
overrides_applied: 0
re_verification: null
gaps: []
human_verification:
  - test: "Screen reader announces combobox role and result count in live browser"
    expected: "Focusing the GlobalSearch input announces 'combobox, collapsed'. After typing 2+ chars, the live region announces 'Searching…' then '{N} results in collection' (or equivalent in locale). ArrowDown changes focus announcement to the highlighted option name."
    why_human: "ARIA live regions and role announcements require a running browser with a screen reader (ChromeVox, VoiceOver, or NVDA). Cannot be verified by static grep or unit tests."
  - test: "Cmd+click / Ctrl+click / middle-click on converted links opens destination in a new tab"
    expected: "Cmd+clicking a collection result in GlobalSearch opens /collection?search=<name> in a new tab while the dropdown closes in the current tab. Same behavior for user results (/@username), Scryfall results (/collection?addCard=<name>), advanced search (/search), FAQ link, match notifications, AddCardModal advanced search, and CardFilterBar advanced search."
    why_human: "Browser modifier-click behavior (guardEvent in Vue Router) requires a live browser. The static code pattern (RouterLink :to= without .prevent) is verified correct, but the actual new-tab behavior cannot be asserted programmatically."
  - test: "MobileSearchOverlay Enter-key closes the overlay after selection"
    expected: "On a narrow viewport (<768px), opening the mobile search overlay, typing a query, pressing ArrowDown once, and pressing Enter navigates to the correct route AND closes the mobile overlay."
    why_human: "MobileSearchOverlay is controlled by a parent-provided open prop. The Enter path calls selectHighlighted() then emit('close'). Verifying the overlay actually closes requires a rendered Vue component tree in a browser, not a unit test."
---

# Phase 04: GlobalSearch & Navigation Polish — Verification Report

**Phase Goal:** GlobalSearch exposes a fully keyboard-navigable ARIA combobox and navigation actions support Cmd+click / middle-click browser behavior.
**Verified:** 2026-04-17
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Screen reader announces GlobalSearch as combobox with expanded/collapsed state and result count | VERIFIED (automated partial) | `role="combobox"`, `aria-expanded` bound to `isExpanded` computed, `aria-live="polite"` live region rendering `ariaLiveMessage` — present in both GlobalSearch.vue and MobileSearchOverlay.vue. Live-region messaging wired in `useGlobalSearch.ts` (immediate 'searching', debounced count after finally). Human test required for actual SR announcement. |
| 2 | Keyboard users can navigate GlobalSearch suggestions with arrow keys and select with Enter | VERIFIED | `handleInputKeydown` in both components dispatches ArrowDown/Up/Home/End/Enter to `moveHighlight`/`selectHighlighted`. IME guard (`e.isComposing`) present. 31 unit tests cover wrap logic, activeDescendantId tracking, and all selectHighlighted paths — all passing. |
| 3 | Navigation actions open in new tab when Cmd+clicked or middle-clicked | VERIFIED (automated partial) | All 15 user-triggered navigation sites converted to `<RouterLink :to="...">` with no `.prevent` modifier. Grep confirms zero `@click.prevent` on RouterLink elements. Human test required for actual new-tab behavior confirmation. |

**Score:** 3/3 truths verified (automated); 3 human checks required before status can be promoted to `passed`.

---

## Requirement Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ARCH-10 | 04-01, 04-02, 04-03 | GlobalSearch implements ARIA combobox pattern (role, aria-expanded, aria-controls, keyboard nav) | SATISFIED | `role="combobox"`, `role="listbox"`, `role="option"`, `aria-activedescendant`, `aria-haspopup="listbox"`, `aria-autocomplete="list"`, `aria-expanded` bound to `isExpanded` computed present in both GlobalSearch.vue and MobileSearchOverlay.vue. 10 new exports in `useGlobalSearch.ts` (moveHighlight, selectHighlighted, etc.). 31 unit tests green. |
| NICE-11 | 04-03 | Navigation actions use anchor elements instead of button + router.push for Cmd+click support | SATISFIED | 15 `<RouterLink :to="...">` conversions across GlobalSearch.vue, MobileSearchOverlay.vue, AppHeader.vue (2 FAQ links), MatchNotificationsDropdown.vue (2 match links), AddCardModal.vue (1 advanced search), CardFilterBar.vue (1 advanced search). D-07 cleanup: `handleOpenAdvancedSearch` removed from CollectionView/DeckView/BinderView; `open-advanced-search` emit removed from CardFilterBar. Zero `@click.prevent` on any RouterLink. |

No orphaned requirements. REQUIREMENTS.md maps both ARCH-10 and NICE-11 to Phase 4 and both are addressed.

---

## Automated Checks

### Plan 01 — Composable Extension (useGlobalSearch.ts)

| Check | Result |
|-------|--------|
| `moveHighlight` exported | PASS — line 217, returned at line 393 |
| `selectHighlighted` exported | PASS — line 242, returned at line 394 |
| `resolveCollectionRoute` / `resolveUserRoute` / `resolveScryfallRoute` exported | PASS — lines 264-275, returned at lines 395-397 |
| `ariaLiveMessage` exported | PASS — line 58, returned at line 391 |
| `isExpanded` computed exported | PASS — line 62, returned at line 392 |
| `activeDescendantId` exported | PASS — line 55, returned at line 390 |
| `scheduleLiveRegionUpdate` exported | PASS — line 74, returned at line 395 |
| `watch(activeTab, ...)` resets highlight | PASS — line 278 |
| `header.search.searching` immediate assignment in performSearch | PASS — line 107 |
| `scheduleLiveRegionUpdate` called in performSearch finally block | PASS — lines 132-138 |
| Two-key ternary pattern (no `tc()`, no pipe) | PASS — grep returns 0 matches for pipe/tc pattern |
| `@click.prevent` absent from composable | PASS — only match is a code comment documenting the anti-pattern |
| Total new exports: 10 | PASS — all 10 present in return block |

### Plan 02 — ARIA Template Wiring (GlobalSearch.vue + MobileSearchOverlay.vue)

| Check | GlobalSearch.vue | MobileSearchOverlay.vue |
|-------|-----------------|------------------------|
| `role="combobox"` on input | PASS (1 match) | PASS (1 match) |
| `aria-expanded` bound to `isExpanded` | PASS | PASS |
| `aria-controls` conditional on `isExpanded` | PASS | PASS |
| `aria-haspopup="listbox"` | PASS | PASS |
| `aria-autocomplete="list"` | PASS | PASS |
| `aria-activedescendant` bound to `activeDescendantId` | PASS | PASS |
| `role="listbox"` on results container | PASS (1 match) | PASS (3 matches — one per tab container) |
| `role="option"` on each result row | PASS (3 matches) | PASS (3 matches) |
| `aria-busy` on wrapper | PASS | PASS |
| `aria-live="polite"` sr-only live region | PASS | PASS |
| `ariaLiveMessage` bound in live region | PASS (2 matches) | PASS (2 matches) |
| `handleInputKeydown` dispatching arrows/home/end/enter | PASS (9 matches) | PASS (9 matches) |
| `e.isComposing` IME guard | PASS | PASS |
| `aria-hidden="true"` on `/` shortcut hint | PASS (GlobalSearch only — mobile has no hint) | N/A |
| `header.search.clearAriaLabel` on clear button | PASS | PASS |
| `v-if="isExpanded"` (not compound condition) | PASS | N/A (mobile uses `v-if="open"` on Teleport, individual listboxes use `v-else-if`) |
| `isExpanded` in destructure | PASS | PASS |
| No `role="tab"` / `role="tablist"` introduced | PASS | PASS |

### Plan 03 — RouterLink Conversions + i18n + D-07 Cleanup

| Check | Result |
|-------|--------|
| `clearAriaLabel` in en.json | PASS — line 360 |
| `clearAriaLabel` in es.json | PASS — line 360 |
| `clearAriaLabel` in pt.json | PASS — line 360 |
| `searching` key in all 3 locales | PASS — en line 361, es line 361, pt line 361 |
| `resultsCount` key in all 3 locales | PASS |
| `resultsCountSingular` key in all 3 locales | PASS |
| `tabNames` block in all 3 locales | PASS |
| All 3 locale files parse as valid JSON | PASS — verified via `node -e "JSON.parse(...)"` |
| Pipe-pluralization (`|`) absent from new keys | PASS |
| `<RouterLink` count in GlobalSearch.vue | PASS — 4 matches (collection, user inner link, scryfall, advanced search) |
| `<RouterLink` count in MobileSearchOverlay.vue | PASS — 4 matches (collection, user inner link, scryfall, advanced search) |
| `resolveCollectionRoute` / `resolveUserRoute` / `resolveScryfallRoute` in GlobalSearch.vue | PASS — 6 matches |
| `resolveCollectionRoute` / `resolveUserRoute` / `resolveScryfallRoute` in MobileSearchOverlay.vue | PASS — 6 matches |
| FAQ RouterLinks in AppHeader.vue | PASS — 2 matches at `:to="'/faq'"` (desktop + mobile) |
| Match notification RouterLinks in MatchNotificationsDropdown.vue | PASS — 2 RouterLinks with `closeDropdown()` on click |
| AddCardModal.vue advanced search RouterLink | PASS — `<RouterLink :to="'/search'" @click="handleClose()">` |
| CardFilterBar.vue advanced search RouterLink | PASS — `<RouterLink v-if="viewMode === 'collection'" :to="'/search'" @click="clearSuggestions(); dropdownDismissed = true">` |
| `handleOpenAdvancedSearch` removed from CollectionView / DeckView / BinderView | PASS — grep returns 0 matches across all 3 files |
| `@open-advanced-search` binding removed from all files | PASS — grep returns 0 matches |
| `open-advanced-search` emit declaration removed from CardFilterBar | PASS — grep returns 0 matches |
| `@click.prevent` on RouterLink elements | PASS — zero matches; only match in codebase is a code comment |
| `goToFaq` function removed from AppHeader | PASS — 0 matches |
| `goToMatches` / `goToMatch` removed from MatchNotificationsDropdown | PASS — 0 matches |
| `common.aria.clearInput` absent from MobileSearchOverlay | PASS — replaced with `header.search.clearAriaLabel` |
| ME INTERESA button outside any RouterLink (D-10) | PASS — in GlobalSearch.vue and MobileSearchOverlay.vue, ME INTERESA is a flex sibling of the RouterLink, not nested inside it |

### Test Suite

| Check | Result |
|-------|--------|
| Unit test file `tests/unit/composables/useGlobalSearch.test.ts` exists | PASS |
| `describe` blocks in test file | PASS — 16 (8 top-level describe blocks) |
| `it(` cases in test file | PASS — 31 tests |
| `npm run test:unit` — 716 tests, 49 files | PASS — exits 0 |
| `npx vite build` | PASS — exits 0 in 11.29s |
| `npm run e2e` (per MEMORY.md `feedback_e2e_before_push.md` gate) | CLAIMED PASS in 04-03-SUMMARY.md (126 passed, 8 skipped, 0 failed) — not re-run in this verification session |

### Commit Verification

All 8 expected commits present in git log:

| Hash | Message | Status |
|------|---------|--------|
| `2e59922` | `test(04-01): add failing tests for moveHighlight, activeTab watcher, isExpanded` | PRESENT |
| `30e448e` | `feat(04-01): implement moveHighlight, selectHighlighted, route resolvers, live-region debounce` | PRESENT |
| `3afcac4` | `feat(04-02): apply ARIA combobox attributes to GlobalSearch and MobileSearchOverlay` | PRESENT |
| `aae6dab` | `i18n(04-03): add header.search ARIA keys to en/es/pt` | PRESENT |
| `0a3eaf0` | `feat(04-03): convert GlobalSearch and MobileSearchOverlay results to RouterLink` | PRESENT |
| `25cf1e7` | `feat(04-03): convert FAQ, match notifications, AddCardModal, CardFilterBar to RouterLink + clean up parent handlers (D-07)` | PRESENT |

---

## Data-Flow Trace (Level 4)

For `GlobalSearch.vue` — the `ariaLiveMessage` ref flows from `useGlobalSearch.ts` where it is populated (1) immediately in `performSearch` as `t('header.search.searching')`, and (2) via `scheduleLiveRegionUpdate(t(countKey, { count, tabName }))` in the `finally` block after real search results are populated. The live region span `<span aria-live="polite">{{ ariaLiveMessage }}</span>` directly binds this ref. Data flows from real search activity to the live region. Status: FLOWING.

For result rows — `collectionResults`, `usersResults`, `scryfallResults` are populated by real queries (`searchCollection` from Pinia store, `searchUsers` from Firestore `getDocs`, `searchScryfall` from Scryfall API). The RouterLink `:to` values are computed from this real data via route resolvers. Status: FLOWING.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No `TODO`, `FIXME`, placeholder comments, empty implementations, or hardcoded empty data found in modified files. The one `@click.prevent` grep match is a code comment documenting the anti-pattern (explicitly NOT the pattern itself).

---

## Human Verification Required

### 1. Screen Reader Combobox Announcements

**Test:** Open the app in Chrome with ChromeVox or in Safari/macOS with VoiceOver. Focus the search input (via mouse click or `/` keyboard shortcut). Then type "bolt" or any 2+ character query.
**Expected:** (a) Focusing the input announces something including "combobox" and "collapsed". (b) After results load, the sr-only live region announces "Searching…" (immediate) followed within ~800ms by "{N} results in collection" (or the locale equivalent). (c) Pressing ArrowDown causes the screen reader to announce the first result's name.
**Why human:** ARIA live region announcements and role announcements require a screen reader attached to a live browser. Grep and unit tests verify the DOM attributes exist and the ref is populated, but cannot verify what a screen reader vocalizes.

### 2. Cmd+click Opens Destination in New Tab

**Test:** In a Chromium-based browser, hold Cmd (macOS) or Ctrl (Windows) and click each of: (a) a GlobalSearch collection result, (b) a GlobalSearch user result, (c) a GlobalSearch Scryfall result, (d) the "Advanced Search" link in GlobalSearch, (e) the FAQ menu item in AppHeader, (f) a match notification in MatchNotificationsDropdown, (g) the "See all matches" footer in MatchNotificationsDropdown, (h) the "Advanced Search" link in AddCardModal, (i) the "Advanced Search" suggestion in CardFilterBar (in CollectionView, DeckView, and BinderView).
**Expected:** Each Cmd+click opens the destination URL in a new browser tab while the current tab runs the click side effect (closes dropdown, clears query, emits close, etc.).
**Why human:** Vue Router's `guardEvent` mechanism defers to the browser for modifier-click events rather than calling `router.push`. The static code pattern (RouterLink without `.prevent`) is verified correct, but the actual new-tab behavior depends on runtime browser behavior that cannot be asserted by grep or unit tests.

### 3. MobileSearchOverlay Enter-Key Closes the Overlay

**Test:** On a narrow viewport or mobile device, open the mobile search overlay, type a query that returns results, press ArrowDown once to highlight the first result, then press Enter.
**Expected:** Navigation occurs to the correct destination AND the mobile overlay closes (not just the dropdown — the entire full-screen overlay).
**Why human:** The `handleInputKeydown` handler in MobileSearchOverlay.vue calls `selectHighlighted()` (router.push + composable isOpen = false) and then `emit('close')`. The composable's `isOpen` is the desktop dropdown state and is separate from the parent-controlled `open` prop driving the mobile overlay. Verifying the overlay actually disappears requires a rendered component tree in a browser.

---

## Gaps Summary

No code-level gaps found. All 13 must-have truths and artifacts verified against actual code (not summaries). All automated acceptance criteria from all three plan task blocks pass. The three items in the human verification section represent behavior that is correct by code structure but requires live-browser confirmation.

The phase goal — "GlobalSearch exposes a fully keyboard-navigable ARIA combobox and navigation actions support Cmd+click / middle-click browser behavior" — is implemented completely in code. Human verification items are smoke tests confirming the code works in a real browser, not fixes for missing implementation.

---

_Verified: 2026-04-17_
_Verifier: Claude (gsd-verifier)_
