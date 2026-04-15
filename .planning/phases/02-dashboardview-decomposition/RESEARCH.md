# Phase 02: DashboardView Decomposition — Research

**Researched:** 2026-04-14
**Domain:** Vue 3 Composition API view refactor, Pinia store extraction, composable design
**Confidence:** HIGH (codebase-verified; no external library claims)

## Summary

`src/views/DashboardView.vue` has grown to 1470 lines (up from 1158 at audit time). It bundles six unrelated responsibilities: (1) match calculation from `public_cards`/`public_preferences`, (2) Firestore-backed blocked users management, (3) resumable clear-all-data flow, (4) public-cards search with Scryfall fallback + auto-suggest, (5) public collection sync, (6) send-interest flow that duplicates `src/composables/useGlobalSearch.ts`. Its `onMounted` is **already fully `async`** with seven awaited operations — a direct violation of the CLAUDE.md rule "never use async onMounted with await" (broke anonymous profile loading in production per MEMORY.md).

`src/views/SearchView.vue` is thin (80 lines); the O(n) `getOwnedCount` is the only ARCH-07 work, and the fix is a single-line `computed(() => new Map(...))` keyed by lowercased card name.

**Primary recommendation:** Decompose into 4 plans (A/B/C/D). Plan A is zero-risk pure-logic extraction + test scaffolding (match expiry helper, owned-count Map, `MATCH_LIFETIME_DAYS` consolidation). Plan B extracts Firestore-calling business logic into `useDashboardMatches` composable + extends `useMatchesStore`. Plan C extracts the blocked users + clear data + public search flows into their own composables. Plan D swaps `onMounted` to synchronous-with-fire-and-forget and finalizes DashboardView as a thin orchestrator < 400 lines.

## User Constraints (from Phase context — no CONTEXT.md yet)

### Locked Decisions
- Tech stack: Vue 3 Composition API + TypeScript + Pinia + Firebase modular SDK v9 — no framework changes
- Work on `develop` branch only; version bump per phase in `package.json`
- TDD mandatory per CLAUDE.md: failing tests first for extracted pure logic
- Never use `async onMounted(async () => { await ... })` — breaks anonymous user profile loading in production
- Must respect Anti-loop Rule 1 (READ before touching, trace callers) and Rule 2 (do ONLY what was asked)

### Claude's Discretion
- Composable names/signatures (suggested below, planner may refine)
- Split between "extend existing store" vs. "new composable" for each responsibility
- Exact plan boundaries (A/B/C/D proposed, planner may consolidate)

### Deferred Ideas (OUT OF SCOPE for Phase 02)
- Rewriting the match algorithm itself (still uses `usePriceMatchingStore`)
- Changes to `src/composables/useGlobalSearch.ts` (deduplication can be tackled in a later phase)
- Backend Cloud Function changes (`notifyMatchUser` stays as-is)
- `SavedMatchesView.vue` and `UserProfileView.vue` refactor — they each contain their own `MATCH_LIFETIME_DAYS = 15` copies but are explicitly NOT part of this phase's `files_modified`

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AXSS-07 | DashboardView `onMounted` does not use async/await | Lines 434-472 — `onMounted(async () => { await loadDiscardedMatches(); await Promise.all(...); await calculateMatches() })`. Must become synchronous with `void` fire-and-forget wrapper. |
| ARCH-01 | DashboardView decomposed into composables | 6 logical groups identified (§ DashboardView Inventory below). Target < 400 lines. |
| ARCH-04 | Firestore calls moved behind services/stores | 11 direct `collection/getDocs/addDoc/deleteDoc/query` call sites catalogued (§ Firestore Call Inventory). All migrate to composables or stores. |
| ARCH-07 | `SearchView.getOwnedCount` → O(1) via computed Map | Lines 23-29 of `src/views/SearchView.vue`. One-function change. |
| ARCH-13 | `MATCH_LIFETIME_DAYS` single source | `src/stores/matches.ts:106` is canonical. 3 other files declare/inline the constant (§ MATCH_LIFETIME_DAYS section). DashboardView is the only one in scope this phase; useGlobalSearch, UserProfileView, SavedMatchesView will still duplicate it until a follow-up phase. Plan A will export it from `matches.ts` and consume it in DashboardView + its new composables only. |

## Project Constraints (from CLAUDE.md)

- **TDD mandatory** — pure functions (match expiry calc, owned-count Map builder) need failing unit tests in `tests/unit/` BEFORE implementation. Verify with `npm run test:unit` showing RED, then implement to GREEN.
- **Never async `onMounted`** — profile loading in production breaks for anonymous users. Replace with `onMounted(() => { void init() })` pattern where `init` is a separate async function.
- **`npx vite build`**, not `npm run build` (lint has pre-existing warnings that block `npm run build`).
- **`npm run test:unit`** before committing every logic change.
- **Anti-loop Rule 1**: When touching `MATCH_LIFETIME_DAYS`, verify `useGlobalSearch.ts:209`, `UserProfileView.vue:345`, `SavedMatchesView.vue` (3 sites with `15 * 24 * 60 * 60 * 1000` inline) — list them in plan but do NOT edit (out of scope) unless the requirement text explicitly says otherwise.
- **Anti-loop Rule 2**: Do not "improve" the match-calculation algorithm. Only extract existing logic, preserve behavior exactly.
- **Anti-loop Rule 6**: Parallel siblings to this file: none (DashboardView is unique). The blocked users modal template exists in both `SavedMatchesView` and `DashboardView` — but the `openBlockedUsersModal`/`loadBlockedUsers` logic is duplicated there too. Note for planner: extracted `useBlockedUsers` composable could be reused in SavedMatchesView, but that is a stretch goal, not required.

## DashboardView Inventory

### Line-range map (src/views/DashboardView.vue, 1470 lines)

| Lines | Section | Responsibility | Requirement | Target |
|-------|---------|----------------|-------------|--------|
| 1-32 | Imports | 11 firebase/firestore imports + stores + services | ARCH-04 | Move firestore imports out |
| 33-68 | Types | `CalculatedMatch`, `PublicCardSearchResult` interfaces | — | Move to `src/types/` or composable file |
| 70-99 | Store wiring + `formatLastSync` | Stores + pure time-ago formatter | — | `formatLastSync` → `src/utils/formatDate.ts` or keep |
| 100-144 | Clear-data state (storage key, save/load/clear) | LocalStorage persistence of clear flow | ARCH-01 | `useClearUserData` composable |
| 146-191 | `loadDiscardedMatches` | Firestore read `matches_eliminados` → Set of otherUserIds | ARCH-04, ARCH-01 | `useDashboardMatches` or extend `useMatchesStore` |
| 193-228 | `discardMatchToFirestore` | Firestore `addDoc` to `matches_eliminados` + cleanup from `matches_nuevos` | ARCH-04 | `useDashboardMatches` |
| 230-276 | `syncPublicData` + `debugPublicCollections` | Wrapper around `collectionStore.syncAllToPublic` + dev-only debug | — | Keep syncPublicData trivial (one-liner); **DELETE `debugPublicCollections` + window exposure** (dead code) |
| 278-432 | Blocked users management | Load, unblock, block-by-username; **155 lines** | ARCH-01, ARCH-04 | `useBlockedUsers` composable |
| 434-472 | `onMounted` (async) | 7 awaits: `loadDiscardedMatches`, `loadCollection`, `loadPreferences`, `getDocs(users)`, `calculateMatches` | **AXSS-07** | Convert to `onMounted(() => { void initDashboard() })` |
| 474-476 | `onUnmounted` | Remove click listener | — | Keep as-is |
| 478-631 | Clear data flow | `deleteCollectionStep`, `executeClearData`, `resumeClearData`, `clearAllData`, dev-only `__clearAllData` exposure | ARCH-01, ARCH-04 | `useClearUserData` composable |
| 633-843 | **Match calculation** (210 lines) | `groupMatchesByUser` + `calculateMatches` | ARCH-01, ARCH-04 | `useDashboardMatches` composable |
| 845-914 | `saveMatchesToFirebase` | Writes to `matches_nuevos` + calls `notifyMatchUser` | ARCH-04 | Extend `useMatchesStore` with `persistCalculatedMatches(matches: CalculatedMatch[])` |
| 916-957 | `handleSaveMatch`, `handleDiscardMatch`, `recalculateMatches` | UI event handlers; thin wrappers around store/composable calls | — | Stay in DashboardView as thin orchestrator |
| 959-997 | Auto-suggest flow | `handleSearchInput` (debounced suggestions), `selectSuggestion`, `handleClickOutside` | ARCH-01 | `useDashboardPublicSearch` composable (or reuse `useSearchSuggestions`) |
| 999-1077 | `searchPublicCards` + `addToWishlist` | Public cards lookup + Scryfall fallback + wishlist add | ARCH-04, ARCH-01 | `useDashboardPublicSearch` composable |
| 1079-1158 | `sendInterestFromSearch` | Duplicates `useGlobalSearch.sendInterestFromSearch` almost verbatim | ARCH-04, ARCH-13 | Delegate to `useGlobalSearch` **or** extract a shared `sendInterest` service; planner's call |
| 1161-1470 | Template | 310 lines of template markup | — | Stays largely intact; may split into sub-components (`<DashboardHeader>`, `<DashboardPublicSearch>`, `<BlockedUsersModal>`) as stretch goal |

### Target after decomposition

Estimated DashboardView.vue final line count: ~320-380 lines (meets < 400 criterion).
- Script: ~60 lines (imports, store wiring, thin handlers, onMounted, onUnmounted)
- Template: ~300 lines (unchanged) or split into sub-components (~200 lines if split)

## Firestore Call Inventory (ARCH-04)

All inline `collection()/getDocs()/addDoc()/deleteDoc()/doc()/query()/where()/limit()` calls in DashboardView:

| Line | Call | Purpose | Moves to |
|------|------|---------|----------|
| 175-176 | `collection(db, 'users', ..., 'matches_eliminados')` + `getDocs` | Load discarded user IDs | `useMatchesStore.loadDiscardedMatches()` or `useDashboardMatches` |
| 200-201, 211 | `collection(...)` + `addDoc` → `matches_eliminados` | Discard match | `useMatchesStore.discardMatchToBlocklist(match)` |
| 217-218, 222 | `collection` + `getDocs` + `deleteDoc` loop on `matches_nuevos` | Cleanup after discard | Same as above |
| 255, 257, 264, 265 | `public_cards` + `public_preferences` debug reads | **Dead code** | Delete entirely |
| 301-302 | `matches_eliminados` getDocs for blocked users | Load blocked list | `useBlockedUsers` composable |
| 350 | `deleteDoc(doc(db, 'users', ..., 'matches_eliminados', docId))` | Unblock user | `useBlockedUsers.unblock(user)` |
| 389-391 | `collection('users')` + `query(where username)` + `getDocs` | Lookup user by username | `useBlockedUsers.blockByUsername(name)` |
| 410-411, 417 | `matches_eliminados` addDoc | Block user | `useBlockedUsers.blockByUsername` |
| 459-460 | `collection('users')` + `getDocs` (full users collection!) | Count total users | Move to dedicated `getTotalUserCount()` helper in `src/services/firebase.ts` or a small `stats` store. NOTE: full collection read is expensive — flag for planner to consider `getCountFromServer` (Firestore aggregation query) instead. |
| 495-498 | `collection(...colName)` + `getDocs` + `deleteDoc` loop | Clear user subcollection | `useClearUserData` composable |
| 854, 858, 861, 867 | `matches_nuevos` reads/writes | Persist calculated matches | `useMatchesStore.persistCalculatedMatches` |
| 1015-1016 | `public_cards` getDocs (full!) | Search public cards | `src/services/publicCards.ts` — add `searchPublicCards(query, excludeUserId)` exported function |
| 1088-1095, 1150 | `shared_matches` query + addDoc | Send interest | Reuse `useGlobalSearch.sendInterestFromSearch` |

**Total Firestore call sites to eliminate from DashboardView: 11 distinct operations across 22 line references.**

## Existing Reusable Infrastructure

### Stores already present (`src/stores/`)
- **`useMatchesStore`** (`matches.ts`, 606 lines) — has `saveMatch`, `discardMatch`, `loadAllMatches`, `cleanExpiredMatches`, `notifyOtherUser`, `deleteAllMatches`. **Missing** (Phase 02 will add): `loadDiscardedMatches` (returns Set of otherUserIds), `persistCalculatedMatches(matches)`, `discardMatchToBlocklist(match)` (the two-step flow at DashboardView line 193-228), `blockUserById(userId)`, `unblockUserById(userId)`. Exports `MATCH_LIFETIME_DAYS` for Phase 02 consumers (currently file-private constant at line 106).
- **`useCollectionStore`** (`collection.ts`) — already has `syncAllToPublic` (line 1190), `lastSyncAt` (line 231). DashboardView's `syncPublicData` is already a thin wrapper — can be inlined.
- **`usePriceMatchingStore`** — exposes `calculateBidirectionalMatch`, `calculateUnidirectionalMatch`. Used by new `useDashboardMatches`.
- **`usePreferencesStore`** — `loadPreferences`, `clear`.
- **`useAuthStore`, `useToastStore`, `useConfirmStore`** — leave as-is.
- **`useDecksStore`** — only used in clear-all-data for its `clear()` method.

### Composables already present (`src/composables/`)
- **`useSearchSuggestions`** — already does exactly what DashboardView's `handleSearchInput`/`selectSuggestion` does (lines 959-997). Takes a `Ref<string>` and returns `localMatches`, `scryfallSuggestions`, `isLoading`, `showDropdown`, `clearSuggestions`. **Candidate to replace DashboardView's inline auto-suggest**. DashboardView currently uses plain `getCardSuggestions` from scryfall service + manual debounce — could be replaced wholesale.
- **`useGlobalSearch`** — already contains a near-verbatim copy of `sendInterestFromSearch` (lines 180-259). Planner should delegate DashboardView's `sendInterestFromSearch` to this composable rather than re-extracting.
- **`useI18n`, `useReturnUrl`, `useKeyboardShortcuts`, `useFocusTrap`, etc.** — not directly affected.

### Services already present (`src/services/`)
- **`src/services/publicCards.ts`** — exports `findCardsMatchingPreferences` (line 355) and `findPreferencesMatchingCards` (line 405). Already the matching primitives. Phase 02 proposal: **add `searchPublicCards(term: string, excludeUserId: string): Promise<PublicCardSearchResult[]>`** — currently DashboardView does this inline (line 1015 onwards, full collection scan).
- **`src/services/scryfall.ts`** — `searchCards`, `getCardSuggestions`. No changes.
- **`src/services/cloudFunctions.ts`** — `notifyMatchUser`. Called from within `saveMatchesToFirebase`; movable to store unchanged.

## MATCH_LIFETIME_DAYS Deduplication (ARCH-13)

### Current state

| File | Line | Form | In scope? |
|------|------|------|-----------|
| `src/stores/matches.ts` | 106 | `const MATCH_LIFETIME_DAYS = 15` — **canonical**, file-private | ✅ Export it |
| `src/views/DashboardView.vue` | 210 | `15 * 24 * 60 * 60 * 1000` inline ms | ✅ Replace |
| `src/views/DashboardView.vue` | 417 | `15 * 24 * 60 * 60 * 1000` inline ms | ✅ Replace |
| `src/views/DashboardView.vue` | 815 | `15 * 24 * 60 * 60 * 1000` inline ms | ✅ Replace |
| `src/views/DashboardView.vue` | 1110 | `const MATCH_LIFETIME_DAYS = 15` local | ✅ Replace |
| `src/composables/useGlobalSearch.ts` | 209 | `const MATCH_LIFETIME_DAYS = 15` local | ❌ out of scope (see note) |
| `src/views/UserProfileView.vue` | 345 | `const MATCH_LIFETIME_DAYS = 15` local | ❌ out of scope |
| `src/views/SavedMatchesView.vue` | 235, 385, 555 | `15 * 24 * 60 * 60 * 1000` inline | ❌ out of scope |
| `src/locales/*.json` | various | human copy "15 days" — cosmetic | ❌ out of scope |

### Plan

1. In `src/stores/matches.ts` line 106: change to `export const MATCH_LIFETIME_DAYS = 15`. Also export `getExpirationDate` (currently file-private at line 108) or a new pure helper `addDaysToNow(days: number): Date`.
2. New tiny utility file `src/utils/matchExpiry.ts` (**recommended**):
   ```ts
   export const MATCH_LIFETIME_DAYS = 15
   export const getMatchExpirationDate = (from: Date = new Date()): Date => {
     const d = new Date(from)
     d.setDate(d.getDate() + MATCH_LIFETIME_DAYS)
     return d
   }
   ```
   Then `matches.ts` imports from it. Rationale: the store is 606 lines and should not re-export constants unrelated to its core state; a pure utility is easier to unit-test without Firebase mocks.
3. DashboardView imports from `../utils/matchExpiry` and replaces all 4 occurrences.
4. **Verification (Anti-loop Rule 3/6)**: planner must document that useGlobalSearch/UserProfileView/SavedMatchesView still duplicate this constant and will be cleaned up in a follow-up phase. Do NOT edit those in Phase 02 unless requirement text is expanded.

### Unit test (required BEFORE implementation, per CLAUDE.md TDD)

File: `tests/unit/utils/matchExpiry.test.ts`
- `getMatchExpirationDate(from)` returns a Date exactly 15 calendar days after `from`
- Handles month boundaries (e.g., from = Jan 20 → Feb 4, 2024)
- Handles leap year Feb 15 → Mar 1
- Handles DST transitions (pass from = first Sunday of Nov, 01:30 → assert day part is +15, not off-by-hour)
- Default argument (no `from`) uses `new Date()` — mock with `vi.useFakeTimers()`

## Match Expiry Calculation Extraction

### Currently

`calculateMatches` (DashboardView line 687-843) hard-codes `new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)` at line 815 for each match's `lifeExpiresAt`. The discard flows at lines 210 and 417 do the same. These should all call `getMatchExpirationDate()` from the new utility.

There is **no** separate expiry calculation that's worth extracting beyond the single-function helper — the rest of `calculateMatches` is match-user grouping + price matching + persistence, not expiry math.

### Reachable via unit test without mounting (success criterion #2)

The **pure** pieces inside `calculateMatches` that warrant extraction + unit tests:
1. `groupMatchesByUser(matchingCards, matchingPrefs)` (already a pure function at line 636-681). Currently defined inside `<script setup>` but does not touch any ref/store. **Move to `src/composables/useDashboardMatches.ts` or extract to `src/utils/matchGrouping.ts`** (latter preferred: pure, no Vue deps). Unit-testable standalone.
2. `buildMatchFromCalc(myCards, myPreferences, userMatch, priceMatchingFns, now)` — new function extracted from lines 748-820 (the per-user loop body). Returns a `CalculatedMatch | null`. Unit-testable with mocked `priceMatchingFns`.
3. `createCleanMatchPayload` — already exists in `matches.ts` at line 118, already testable.

## getOwnedCount Fix (ARCH-07)

### Current (src/views/SearchView.vue:23-29)
```ts
const getOwnedCount = (scryfallCard: ScryfallCard): number => {
  const cardName = scryfallCard.name?.toLowerCase()
  if (!cardName) return 0
  return collectionStore.cards
    .filter(c => c.name.toLowerCase() === cardName)
    .reduce((sum, c) => sum + c.quantity, 0)
}
```
Called once per rendered `SearchResultCard` in template (line 67). With N results × M collection cards → O(N·M) on each reactive re-render. `collectionStore.cards` is a `shallowRef<Card[]>` (`collection.ts:226`), so any mutation triggers full re-render.

### Target

```ts
import { computed } from 'vue'
// ...
const ownedCountByName = computed(() => {
  const map = new Map<string, number>()
  for (const card of collectionStore.cards) {
    const key = card.name.toLowerCase()
    map.set(key, (map.get(key) ?? 0) + card.quantity)
  }
  return map
})

const getOwnedCount = (scryfallCard: ScryfallCard): number => {
  const cardName = scryfallCard.name?.toLowerCase()
  if (!cardName) return 0
  return ownedCountByName.value.get(cardName) ?? 0
}
```
One O(M) build per `cards` change, O(1) lookup per card render.

### Unit test (required BEFORE implementation)

File: `tests/unit/views/searchView.ownedCount.test.ts` (or extract helper to `src/utils/ownedCount.ts` for easier testing).

Recommended: extract builder to `src/utils/ownedCount.ts`:
```ts
export const buildOwnedCountMap = (cards: Pick<Card, 'name' | 'quantity'>[]): Map<string, number> => { ... }
```
Test cases:
- Empty collection → empty map
- Single card, quantity 4 → `{ 'black lotus' → 4 }`
- Multiple prints same name (3 + 2) → sum to 5
- Case-insensitive ("Black Lotus" and "BLACK LOTUS" coalesce)
- Large collection (10k cards) runs in < 50ms (perf assertion)

### Callers (Anti-loop Rule 1 trace)

Grep for `getOwnedCount`: only 1 caller — `SearchView.vue:67` in the `SearchResultCard` iteration. No parallel siblings. Safe single-file change.

## async onMounted Fix (AXSS-07)

### Current (DashboardView.vue:434-472)

```ts
onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  if (!authStore.user) return

  const savedClearState = loadClearDataState()
  if (savedClearState?.status === 'in_progress') {
    void resumeClearData(savedClearState)
    return
  } else if (savedClearState?.status === 'complete') {
    clearClearDataState()
  }

  await loadDiscardedMatches()

  loading.value = true
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])

    const usersRef = collection(db, 'users')
    const usersSnapshot = await getDocs(usersRef)
    totalUsers.value = usersSnapshot.docs.length - 1

    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }
})
```

### Target pattern (per CLAUDE.md MEMORY)

```ts
const initDashboard = async (): Promise<void> => {
  if (!authStore.user) return

  const savedClearState = loadClearDataState()
  if (savedClearState?.status === 'in_progress') {
    void resumeClearData(savedClearState)
    return
  }
  if (savedClearState?.status === 'complete') clearClearDataState()

  await loadDiscardedMatches()

  loading.value = true
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])
    totalUsers.value = await getTotalUserCount() // extracted helper
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  void initDashboard()
})
```

**Key:** the `onMounted` callback itself is NOT `async` and contains NO `await`. The async work is delegated to `initDashboard()` and fire-and-forget with `void`. This matches the pattern established for anonymous user profile loading.

### Regression test

Can't unit-test `onMounted` directly without mounting. Instead: Playwright E2E smoke test that loads `/dashboard` as anonymous (no user), verifies no unhandled promise rejections and the dashboard renders empty state. Per MEMORY.md "E2E before push" directive.

## Plan Split (Proposed)

Following Phase 01's precedent (A = foundation, B = shared infra, C = per-surface sweep), Phase 02 suggests 4 plans:

### Plan A — Pure logic foundation (LOW risk, ~200 lines changed)
**Dependencies:** none (foundation).
**Files touched:**
- NEW `src/utils/matchExpiry.ts` — export `MATCH_LIFETIME_DAYS`, `getMatchExpirationDate`
- NEW `src/utils/ownedCount.ts` — export `buildOwnedCountMap`
- NEW `src/utils/matchGrouping.ts` — export `groupMatchesByUser` (moved from DashboardView)
- NEW `tests/unit/utils/matchExpiry.test.ts` (failing first, then green)
- NEW `tests/unit/utils/ownedCount.test.ts` (failing first, then green)
- NEW `tests/unit/utils/matchGrouping.test.ts` (failing first, then green)
- EDIT `src/stores/matches.ts` — import `MATCH_LIFETIME_DAYS`/`getMatchExpirationDate` from util (tiny diff, preserves behavior)
- EDIT `src/views/SearchView.vue` — replace `getOwnedCount` with computed-Map version
- EDIT `src/views/DashboardView.vue` — replace 4 inline expiry calculations with `getMatchExpirationDate()` call. Use imported `groupMatchesByUser`. No other structural changes.

**Requirements closed:** ARCH-07, ARCH-13 (partially — DashboardView only; other duplicates remain by design).
**Risk:** Minimal. Pure extractions with tests.
**Verification:** unit tests pass, `npx vite build` succeeds, dashboard still loads and calculates matches.

### Plan B — Match store extension + useDashboardMatches composable (MEDIUM risk, ~500 lines changed)
**Dependencies:** Plan A.
**Files touched:**
- EDIT `src/stores/matches.ts` — add `loadDiscardedUserIds()`, `persistCalculatedMatches(matches)`, `discardCalculatedMatch(match)` methods. Integrate `notifyMatchUser` call inside `persistCalculatedMatches`.
- NEW `src/composables/useDashboardMatches.ts` — owns `calculatedMatches` ref, `loading`, `progressCurrent`, `progressTotal`, `calculateMatches()`, `recalculateMatches()`, `handleSaveMatch`, `handleDiscardMatch`. Consumes `useMatchesStore`, `usePriceMatchingStore`, `useCollectionStore`, `usePreferencesStore`.
- NEW `src/services/publicCards.ts` — add `searchPublicCards(term, excludeUserId)` function; add `getTotalUserCount()` (or in a separate `stats.ts` service — planner's call; recommend `getCountFromServer` for scalability).
- NEW `tests/unit/composables/useDashboardMatches.test.ts` — test match building logic with mocked stores.
- NEW `tests/unit/stores/matches.persistCalculated.test.ts` — test the new store methods (replicate pure logic, mock firebase).
- EDIT `src/views/DashboardView.vue` — remove `calculateMatches`, `saveMatchesToFirebase`, `loadDiscardedMatches`, `discardMatchToFirestore`, `groupMatchesByUser`, `handleSaveMatch`, `handleDiscardMatch`, `recalculateMatches`. Wire via `const { calculatedMatches, loading, ... } = useDashboardMatches()`. This is the big ~400-line delete from DashboardView.

**Requirements closed:** ARCH-01 (partial — match calc), ARCH-04 (partial — match Firestore calls).
**Risk:** MEDIUM. Behavioral preservation critical. Need regression E2E: login → recalculate → save a match → discard a match → reload → verify state.

### Plan C — useBlockedUsers + useClearUserData + useDashboardPublicSearch composables (MEDIUM risk, ~600 lines changed)
**Dependencies:** Plan A (for `MATCH_LIFETIME_DAYS`, not Plan B).
**Files touched:**
- NEW `src/composables/useBlockedUsers.ts` — extracted from DashboardView lines 278-432. Exposes `blockedUsers`, `loadingBlockedUsers`, `showBlockedUsersModal`, `openBlockedUsersModal`, `loadBlockedUsers`, `unblockUser`, `handleBlockByUsername`, `blockUsernameInput`, `blockingUser`. **NOTE for planner:** This same logic exists in `SavedMatchesView.vue` — extracting here enables future deduplication (stretch goal, document but don't execute).
- NEW `src/composables/useClearUserData.ts` — extracted from DashboardView lines 101-144 + 478-625. Exposes `clearDataProgress`, `executeClearData`, `resumeClearData`, `clearAllData`.
- NEW `src/composables/useDashboardPublicSearch.ts` — extracted from DashboardView lines 149-164 + 959-1077. Exposes `searchQuery`, `searchResults`, `searching`, `searchedOnce`, `sentInterestIds`, `suggestions`, `showSuggestions`, `scryfallResults`, `showScryfallFallback`, `searchPublicCards`, `addToWishlist`, `handleSearchInput`, `selectSuggestion`, `handleClickOutside`, `searchContainer`, `sendInterestFromSearch` (delegating to `useGlobalSearch` when feasible). **Planner decision:** evaluate using `useSearchSuggestions` composable to replace the manual auto-suggest debounce — could save ~40 lines.
- NEW tests `tests/unit/composables/useClearUserData.test.ts` — test state persistence + step progression (mock localStorage, mock Firestore deleteCollectionStep).
- EDIT `src/views/DashboardView.vue` — remove all extracted code; wire via composable destructuring. Delete `debugPublicCollections` (dead code). Delete duplicate `sendInterestFromSearch` (replace with `useGlobalSearch.sendInterestFromSearch`).

**Requirements closed:** ARCH-01 (full), ARCH-04 (full).
**Risk:** MEDIUM. Blocked users and clear-data flows have real user-visible persistence; must preserve exactly. Public search + Scryfall fallback behavior must not regress.

### Plan D — onMounted fix + final cleanup (LOW risk, ~80 lines changed)
**Dependencies:** Plans A, B, C.
**Files touched:**
- EDIT `src/views/DashboardView.vue` — refactor `onMounted` to non-async + `void initDashboard()`. Final verification that file < 400 lines. Remove any remaining Firestore imports from the top.
- NEW Playwright E2E (`e2e/dashboard-anonymous.spec.ts`) — anonymous user loads `/dashboard`, no console errors, empty state renders.
- Version bump in `package.json` (minor — `1.24.0` likely, per semver rules; feature-scope refactor).

**Requirements closed:** AXSS-07, ARCH-01 (final line-count verification).
**Risk:** LOW. Mostly structural; the three preceding plans do the actual work.

### Alternative: 3-plan split
If the planner prefers fewer plans, Plans C's three composables could be merged into Plan B as a single "composable extraction" plan, leaving A/B/D. Tradeoff: bigger Plan B diff (~1000 lines). Recommend keeping 4 plans for reviewability.

## Test Strategy (CLAUDE.md TDD)

### Pure functions (unit tests — Vitest, no Firebase)
| Function | Target file | Test file | Plan |
|----------|-------------|-----------|------|
| `getMatchExpirationDate` | `src/utils/matchExpiry.ts` | `tests/unit/utils/matchExpiry.test.ts` | A |
| `buildOwnedCountMap` | `src/utils/ownedCount.ts` | `tests/unit/utils/ownedCount.test.ts` | A |
| `groupMatchesByUser` | `src/utils/matchGrouping.ts` | `tests/unit/utils/matchGrouping.test.ts` | A |
| Clear-data state serialization | `src/composables/useClearUserData.ts` (extract helpers) | `tests/unit/composables/useClearUserData.test.ts` | C |
| `parseFirestoreMatch` (already tested in matches.dateHelpers.test.ts as characterization) | — | — | — |

### Composable tests (mounted harness or pure)
| Composable | Test file | Plan |
|------------|-----------|------|
| `useDashboardMatches` (build-match per user loop) | `tests/unit/composables/useDashboardMatches.test.ts` — mock `usePriceMatchingStore` + `publicCards` service | B |
| `useBlockedUsers` | optional; could rely on E2E | C |

### E2E (Playwright — mandatory per MEMORY.md `feedback_e2e_before_push.md`)
- `e2e/dashboard-anonymous.spec.ts` — anonymous smoke (no async onMounted regression)
- `e2e/dashboard-match-flow.spec.ts` — login → recalculate → save → discard → reload (covers Plan B regression)
- Existing E2E for blocked users must still pass unchanged

### Do NOT test
- `calculateMatches` end-to-end in unit tests (too many store/firestore dependencies; covered by E2E)
- `syncPublicData` (thin wrapper; covered by collection store tests)
- Template rendering (not changed in this phase)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vitest | unit tests | ✓ | (in devDependencies) | — |
| Playwright | E2E tests | ✓ | (in devDependencies) | — |
| Vue Test Utils | composable tests | ✓ | (in devDependencies) | — |
| `@pinia/testing` | store tests | ✓ (used in existing tests) | — | — |
| Firebase emulator | integration tests | optional | — | tests can mock firebase imports |

No new dependencies needed — all infrastructure exists.

## Risks & Anti-loop Compliance

### Risk 1: Reactivity timing breakage (MEDIUM)
Moving `calculatedMatches`, `loading`, `progressCurrent`, `progressTotal` into `useDashboardMatches` composable preserves Vue's reactive timing because refs stay refs. BUT: destructuring in template (e.g., `const { loading } = useDashboardMatches()`) is safe; accessing `loading.value` in computed still reactive. **Mitigation:** do NOT `toRefs` on a reactive wrapper; keep refs individual. Anti-loop Rule 2 applies: don't rewrite reactive patterns.

### Risk 2: Firestore real-time listener regressions (LOW)
DashboardView currently uses `getDocs` (one-shot reads), not `onSnapshot`. No real-time listeners to break. Confirmed by grep — no `onSnapshot` calls in DashboardView.

### Risk 3: Async onMounted "partial fix" regression (MEDIUM)
If the refactored `onMounted` accidentally stays async (e.g., planner forgets), the bug from production history recurs. **Mitigation:** Plan D has this as the only substantive change. Add an ESLint rule or a test that greps the file for `onMounted(async` and fails build.

### Risk 4: Losing behavior in the two-step discard flow (MEDIUM)
`discardMatchToFirestore` (line 193-228) does BOTH: (a) add to `matches_eliminados`, (b) delete from `matches_nuevos`. If this gets split across composable boundaries, step (b) could be dropped. **Mitigation:** store method `persistCalculatedMatches` and `discardCalculatedMatch` must remain atomic inside `useMatchesStore`. Unit test that verifies both operations are called.

### Risk 5: `totalUsers` expensive query (LOW, but opportunistic)
Line 459-461 does `getDocs(collection(db, 'users'))` to count users — reads ALL user docs. With a growing user base this becomes expensive. **Plan B opportunity:** replace with `getCountFromServer(collection(db, 'users'))` aggregation query (Firestore v9.12+). Check `package.json` for firebase version first. This is a stretch — NOT required by ARCH-04, but align with CLAUDE.md's spirit.

### Risk 6: Anti-loop Rule 6 (Parallelism) — blocked users modal
The blocked users modal template (lines 1406-1469) is duplicated in `SavedMatchesView.vue`. If the planner extracts `BlockedUsersModal.vue` as a component in Plan C, both views benefit. But this is **stretch goal**; the ROADMAP for Phase 02 says DashboardView-only. Flag it as a follow-up phase candidate.

### Risk 7: `debugPublicCollections` removal (LOW)
Lines 251-276 expose a dev-only `debugPublicCollections` on `globalThis`. No external code references it (verified via grep — no other file uses `debugPublicCollections`). Safe to delete. But: Anti-loop Rule 1 says "read before touching"; document in plan that this is dead code being removed and note the rationale.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `useSearchSuggestions` composable could replace DashboardView's inline auto-suggest without behavior change | Plan C, Existing Composables | LOW — behavior differs (useSearchSuggestions combines collection + scryfall; DashboardView only uses scryfall). Planner should verify whether collection-local results are acceptable in public-search context. May need a variant `useScryfallOnlySuggestions`. [ASSUMED] |
| A2 | `getCountFromServer` is available in installed Firebase version | Risk 5 | LOW — fallback is keep current `getDocs` approach. [ASSUMED] |
| A3 | `groupMatchesByUser` is safe to move to a standalone util (no hidden Vue reactivity dependencies) | Plan A | Very low — function reads only its parameters, returns a new Map. Verified pure by reading lines 636-681. [VERIFIED: src/views/DashboardView.vue:636-681] |
| A4 | `notifyMatchUser` Cloud Function signature is stable and can be called from a Pinia store method without import issues | Plan B | LOW — it's already imported and called from DashboardView; moving the call site to the store is a straightforward import move. [VERIFIED: src/services/cloudFunctions.ts] |
| A5 | No E2E test currently relies on `debugPublicCollections` being exposed on `window` | Risk 7 | Very low — dev-only console helper. Grep confirms no non-DashboardView usage. [VERIFIED: grep for `debugPublicCollections` returns only DashboardView.vue] |

## Open Questions

1. **Auto-suggest unification.** Should DashboardView's auto-suggest use `useSearchSuggestions` (collection + scryfall) or a new scryfall-only variant? The public-search context is "find other users' cards" — collection-local results are less relevant. **Recommendation:** Plan C creates a small `useScryfallSuggestions(query: Ref<string>)` composable derived from `useSearchSuggestions` minus the collection part. Planner can decide.

2. **`MATCH_LIFETIME_DAYS` full deduplication scope.** ARCH-13 says "single source". Phase 02's `files_modified` (inferred from ROADMAP) seems DashboardView-centric. Should Plan A also touch `useGlobalSearch.ts`, `UserProfileView.vue`, `SavedMatchesView.vue` to achieve true single-source? **Recommendation:** Plan A imports-only edits to the other 3 files (zero behavior change, just swap constant source). If the planner wants to be conservative, defer to a follow-up phase and document it.

3. **Blocked-user modal extraction as a component.** Stretch goal; could also unlock a Phase 04+ win for SavedMatchesView. Planner's call.

4. **Version bump semantics.** This is a refactor with no user-visible features. Per CLAUDE.md rules, refactors are typically patch bumps, but the "minor" criterion includes "new [features]" which arguably includes new composables. **Recommendation:** patch bump (1.23.x → 1.23.(x+1)).

## Sources

### Primary (HIGH confidence)
- `src/views/DashboardView.vue` — full 1470-line read
- `src/views/SearchView.vue` — full 80-line read
- `src/stores/matches.ts` — full 605-line read
- `src/stores/collection.ts:1185-1234, 222, 226, 231` (syncAllToPublic, shallowRef cards, lastSyncAt)
- `src/composables/useGlobalSearch.ts:1-259` (sendInterestFromSearch duplicate)
- `src/composables/useSearchSuggestions.ts` — full read
- `src/stores/search.ts` — full 208-line read
- `src/services/publicCards.ts:1-60` + grep for exports (findCardsMatchingPreferences, findPreferencesMatchingCards)
- `src/views/UserProfileView.vue:340-400` (MATCH_LIFETIME_DAYS duplicate)
- `tests/unit/stores/matches.dateHelpers.test.ts` (precedent for testing pure logic replicated out of closures)
- `CLAUDE.md` — TDD, branching, anti-loop rules
- `C:\Users\srpar\.claude\projects\...\MEMORY.md` — never-async-onMounted constraint, E2E-before-push
- `.planning/phases/01-global-a11y-css-sweep/01-A-PLAN.md` — front-matter format precedent

### Secondary (MEDIUM confidence)
- Grep output for `MATCH_LIFETIME_DAYS|lifeExpiresAt|15 \* 24 \* 60 \* 60` across `src/`
- `ls` of `src/composables/`, `src/stores/`, `src/services/`, `tests/unit/`

### Tertiary (LOW confidence / not verified)
- Firestore `getCountFromServer` availability — not version-verified against installed `firebase` SDK. Planner should `npm view firebase version` and check package.json if using this optimization.

## Metadata

**Confidence breakdown:**
- DashboardView inventory: HIGH — full file read, line-by-line mapped
- Existing composables/stores: HIGH — directly read all relevant files
- MATCH_LIFETIME_DAYS occurrences: HIGH — grep-verified
- getOwnedCount fix: HIGH — single caller, simple transformation, unit-testable
- async onMounted fix: HIGH — pattern already used elsewhere in codebase per MEMORY.md
- Plan split proposal: MEDIUM — depends on planner's preference for plan granularity
- Risk assessment: MEDIUM — based on code reading, not runtime profiling

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — codebase is active but these files are relatively stable refactor targets)
