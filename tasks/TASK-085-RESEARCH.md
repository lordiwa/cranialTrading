# TASK-085 Research — Anonymous "quién vende" en el buscador de login

Read-only research. No source, rules, or config files were modified.

## 1. How does the app find "users who have a card" today (authenticated)?

There are **two unrelated code paths**, and one of them is a live production bug.

### 1a. Live search path — `SearchView.vue` "Other users" section
- `src/views/SearchView.vue:44-63` drives a debounced `loadPublicMatches()` off the `?q=` term, calling `searchPublicCards(searchTerm, authStore.user?.id ?? null)` imported from `src/services/publicCardSearch.ts:10`.
- `publicCardSearch.ts:32-57` queries the **root `public_cards` collection** (not `users/{uid}/cards`, no `collectionGroup`) with a prefix range query on `cardNameLower` (`>=`/`<=`) and an always-present `limit(max=20)` (`publicCardSearch.ts:44-47`). It already accepts `currentUserId: string | null` and explicitly supports the anonymous case: `filter(card => currentUserId === null || card.userId !== currentUserId)` (`publicCardSearch.ts:52`) — this function was clearly built to also work logged-out.
- Rendered at `SearchView.vue:133-188`: username, avatar, status, price, and a `RouterLink` to `/@{{username}}`.

**Bug found (blocking for reuse):** `cardNameLower` is **never written** to any `public_cards` document. I grepped every writer:
  - `src/services/publicCards.ts:75-113` (`syncCardToPublic`), `:119-171` (`batchSyncCardsToPublic`), `:224-282` (`syncAllUserCards`) — all three write `cardName` but not `cardNameLower`.
  - Whole-repo grep for `cardNameLower` (excluding node_modules) only turns up: the field's own definition/query in `publicCardSearch.ts`, its unit test mocks (`tests/unit/services/publicCardSearch.test.ts`), and two unrelated local variables of the same name in `DeckEditorGrid.vue`/`stores/decks.ts` (commander-name matching, nothing to do with Firestore).
  - There is no Cloud Functions directory doing this server-side either — `functions/` in this repo contains only `index.js` and `populateScryfallCache.cjs`, no Firestore triggers.
  - **Conclusion: the "Other users" section on `/search` returns `[]` in production today**, silently (the `where('cardNameLower', ...)` range query matches zero docs since the field doesn't exist). This must be fixed as a prerequisite — see §4.

### 1b. VENDO/BUSCO match engine (not a live search — background matching)
- `findCardsMatchingPreferences` / `findPreferencesMatchingCards` / `getUserPublicCards` / `getUserPublicPreferences` in `src/services/publicCards.ts:356-470`, consumed by `src/stores/preferences.ts`, `src/stores/collection.ts`, `src/views/SavedMatchesView.vue`, `src/utils/matchGrouping.ts`. This does exact-name `where('cardName', 'in', chunk-of-30)` queries to compute standing matches between a user's own cards/preferences and everyone else's — it is not a card-name search box, so it's not the pattern to imitate for a live "type a name, see sellers" box.
- A second, older `searchPublicCards()` also exists at `services/publicCards.ts:508-528` (full `getDocs(collection(db,'public_cards'))` scan + client-side substring match on `cardName`, capped `.slice(0,20)` — explicitly documented as "formerly defined in DashboardView.vue"). **It is dead code**: I grepped every importer of `services/publicCards.ts` (`preferences.ts`, `SavedMatchesView.vue`, `collection.ts`, `utils/matchGrouping.ts`) and none of them call this function. Ignore it; do not resurrect it (downloading the whole collection per keystroke doesn't scale).

### What it does NOT do
- It does **not** read `users/{uid}/cards` subcollections for cross-user search. That per-user full-subcollection read pattern exists only in `src/views/UserProfileView.vue:162-188` (`loadAllPublicCards`), and only for **one already-known user** (via `/@username` route) — not a name-based search across all users.
- No `collectionGroup()` query exists anywhere in the codebase (grepped `collectionGroup` — zero hits).
- `card_index` (`firestore.rules:89-93`) is a **per-user** pagination/filter index for that user's own collection view (`requiresAuth`, own-collection pagination) — unrelated to cross-user search, and rules require auth on it regardless.

## 2. Is there a collection already queryable without auth?

Read `firestore.rules` end-to-end (208 lines). What `request.auth == null` can read today:
- `users/{userId}` → `allow read: if true` (`firestore.rules:9`) — public profile doc.
- `users/{userId}/cards/{cardId}` → `allow read: if true` (`firestore.rules:22`), comment: *"Lectura pública para permitir ver perfiles sin login. El cliente filtra por public === true"*. **Important: the rule itself does not enforce `public == true` or `status != collection` — it is unconditionally `true`.** The filtering is a client-side convention only, not a database guarantee.
- `usernames/{username}` → `allow read: if true` (`firestore.rules:109`), the username→uid index added for TASK-073.
- `platform_stats/{docId}` → `allow read: if true` (`firestore.rules:182`).
- Everything else (`public_cards`, `public_preferences`, `decks`, `matches_*`, `savedContacts`, `card_index`, `market_data`, `scryfall_cache`, `conversations`, `shared_matches`, …) requires `request.auth != null`, and the final catch-all (`firestore.rules:204-206`) denies anything unmatched.

**`public_cards` (`firestore.rules:117-122`) and `public_preferences` (`firestore.rules:125-130`) both currently require `request.auth != null`.** These are exactly the denormalized, write-time-filtered collections described in the ticket ("índice/colección denormalizada"), and they already exist — they just aren't opened to anonymous reads yet.

`UserProfileView.vue` is the existing precedent for "public profile without login" (`showCartMode = computed(() => !authStore.user)`, `UserProfileView.vue:63`, plus the whole anonymous cart/buyRequest flow) — it proves the app already treats one user's public cards as anonymous-readable. But it does so via the broad, rule-unenforced `users/{uid}/cards` read, not via `public_cards`.

## 3. Minimal safe rules change

**Recommendation: open `public_cards` to anonymous reads. Do not touch `users/{uid}/cards` or add a `collectionGroup` query.**

```diff
     match /public_cards/{docId} {
-      allow read: if request.auth != null;
+      allow read: if true;
       // Solo el dueño puede crear/actualizar (userId debe coincidir)
       allow create, update: if request.auth != null && request.resource.data.userId == request.auth.uid;
       allow delete: if request.auth != null && resource.data.userId == request.auth.uid;
     }
```

`public_preferences` does **not** need to change for this ticket — the AC only asks for "quién vende" (sale/trade sellers), not BUSCO preferences.

**Why this is the safe option, and why the alternative isn't:**
- `public_cards` documents are populated exclusively through `syncCardToPublic`/`batchSyncCardsToPublic`/`syncAllUserCards` (`publicCards.ts:87`, `:141`, `:233`), each of which gates the write with `card.status !== 'collection' && card.public === true` *before* the doc is created, and **deletes** the doc the moment that stops being true. So the collection is safe-by-construction — there is no `where()` clause the client needs to add for privacy; every doc in `public_cards` is already meant to be public. Opening read access here is the same shape of decision already made for `usernames` (TASK-073) and `users/{userId}`.
- The alternative — reading `users/{uid}/cards` cross-user (via `collectionGroup('cards')`) — looks tempting since the rule there is already `allow read: if true`, but **Firestore security rules validate each returned document, they cannot require that a client query included a specific `where()` filter.** Since that rule is unconditionally `true` with no data check, an anonymous `collectionGroup('cards')` query with no filters (or a spoofed/missing filter) would be equally "allowed" by rules and would return **every user's private `collection`/`wishlist` cards**, not just public sale/trade ones. That gap already exists today for any authenticated OR anonymous caller creative enough to run that query directly against the SDK — it is a pre-existing exposure, independent of this ticket, worth a separate follow-up ticket to tighten (`allow read: if request.auth != null && ...` won't fix it either, since the same unconditional-rule problem applies to authenticated collectionGroup reads too; the real fix would be adding `resource.data.public == true` type checks to that rule). **TASK-085 should not build a new anonymous feature on top of that gap** — it should use `public_cards`, which has no such gap.

## 4. Cost/scale of the anonymous query

- **Prerequisite fix (blocking):** add `cardNameLower: card.name.toLowerCase()` to the three write paths in `publicCards.ts` (`syncCardToPublic`, `batchSyncCardsToPublic`, `syncAllUserCards`), matching the field `publicCardSearch.ts` already queries. Without this, the feature ships against an always-empty index. Existing `public_cards` docs (already live in prod/dev) will also need a one-time backfill (a small admin-SDK script setting `cardNameLower` from the existing `cardName` field on every doc) — otherwise sellers who haven't touched their card since before this fix stay invisible until their next edit re-syncs the doc.
- **Indexes:** none new required. `cardNameLower` range query (`>=`/`<=` on a single field) is covered by Firestore's automatic single-field index — `firestore.indexes.json` has no `disabled`/exempt entry for it, so it already exists. The two composite indexes already in `firestore.indexes.json:19-34` (`userId+cardName`, `cardName+updatedAt`) belong to the VENDO/BUSCO matcher (§1b), not to this feature — no changes needed there either.
- **Query shape to reuse verbatim:** `searchPublicCards(term, null, max)` from `publicCardSearch.ts:32` — it already special-cases `currentUserId === null` to skip exclusion (`publicCardSearch.ts:52`), so the anonymous landing can call it exactly as SearchView.vue does, just passing `null` instead of `authStore.user?.id`.
- **Pagination/limit for the landing:** reuse the existing `limit(max)` parameter (default 20). Given TASK-084 kept the landing's catalog list intentionally minimal, recommend a smaller `max` for the landing teaser (e.g. 5-6) versus the full 20 already used on `/search` — pass an explicit `max` argument, no new plumbing needed.
- **No doc-path/uid leak concern:** `public_cards` doc IDs are `${userId}_${cardId}` and the doc body already stores `userId` in plaintext. This is already exposed today to any authenticated user via the same collection, and `uid` is not treated as a secret anywhere else in the app (it's visible via `users/{userId}` reads, which are already `allow read: if true`). No new information class is exposed.
- **Landing wiring:** `LoginView.vue:57-61` (`runSearch`) currently only calls `searchStore.search()` (Scryfall catalog, TASK-084). The right shape to add the sellers list is the same one `SearchView.vue:44-63` already uses: an independent `ref`/`watch` pair calling the capped `searchPublicCards` query, decoupled from the catalog's own loading state, so a slow Firestore read never blocks the Scryfall catalog render (or vice versa).

## Refined acceptance criteria

- [ ] `public_cards` read rule changed to `allow read: if true` (no other rule changes) and deployed to dev manually: **`firebase deploy --only firestore:rules --project dev`** (per `project_ci_no_firestore_rules_deploy` memory — CI does not deploy rules).
- [ ] `cardNameLower` is written by all three `public_cards` sync paths (`syncCardToPublic`, `batchSyncCardsToPublic`, `syncAllUserCards` in `src/services/publicCards.ts`), with a regression test proving it's present in the synced payload.
- [ ] One-time backfill executed against dev (and later prod) so existing `public_cards` docs gain `cardNameLower` without waiting for their next edit.
- [ ] Anonymous landing search (`LoginView.vue`) calls `searchPublicCards(term, null, <small max>)` on the same debounced term driving the Scryfall catalog section, rendering username + avatar + status (sale/trade) + price, capped and independent from catalog loading state.
- [ ] Anonymous result never includes a `collection`- or `wishlist`-status card (guaranteed structurally by `public_cards` only ever containing sale/trade+public docs — no client-side filter needed, but add a unit test asserting the sync functions never write collection/wishlist cards, as a regression lock).
- [ ] Tests for the pure "build sellers list" logic (mapping/capping/exclusion) written RED first, mirroring `tests/unit/services/publicCardSearch.test.ts`.
- [ ] i18n keys added to `en.json`/`es.json`/`pt.json` together (e.g. `landing.sellers.title`, empty state, loading state).
- [ ] **Follow-up ticket (not in this scope):** tighten `users/{userId}/cards/{cardId}` rule (`firestore.rules:22`) so it isn't an unconditional `allow read: if true` — today nothing in the rules layer stops a direct/`collectionGroup` query from reading any user's private `collection`/`wishlist` cards; only client-side convention prevents it. Flag to Rafael as a pre-existing security gap discovered during this research, separate from TASK-085.

## Files referenced (evidence index)
- `src/views/SearchView.vue:44-63,133-188`
- `src/services/publicCardSearch.ts:1-57` (live, capped, anon-ready shape — but broken)
- `src/services/publicCards.ts:75-113,119-171,224-282,356-470,508-528` (sync writers; VENDO/BUSCO matcher; dead full-scan search)
- `src/utils/publicSyncFilter.ts` (public-sync eligibility helper used alongside the writers)
- `src/views/UserProfileView.vue:63,162-188` (existing anonymous-profile precedent)
- `src/composables/useGlobalSearch.ts` (header autocomplete — Scryfall only, not part of this flow)
- `src/views/LoginView.vue:40-61` (landing search state to extend)
- `firestore.rules:1-208` (full file read; relevant: 8-24 users/cards, 89-93 card_index, 105-113 usernames, 115-130 public_cards/public_preferences, 180-184 platform_stats, 204-206 default-deny)
- `firestore.indexes.json:1-38` (existing public_cards composite indexes, unrelated to this feature)
- `tests/unit/services/publicCardSearch.test.ts` (mocks assume `cardNameLower` exists — confirms the intended contract, contradicts the actual writers)
- Repo-wide greps confirming no `functions/` Firestore triggers, no `collectionGroup()` usage, no other `cardNameLower` writer.
