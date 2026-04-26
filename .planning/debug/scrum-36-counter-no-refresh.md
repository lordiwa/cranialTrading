---
status: investigating
trigger: "En el editor de decks, al agregar copias adicionales de una carta ya presente vía AddCardModal, el badge `xN` del grid no refresca hasta recargar la vista o tocar +/-. Bug regression. Jira ticket: SCRUM-36."
created: 2026-04-26T00:00:00Z
updated: 2026-04-27T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: PART 9 — Inverse case (wishlist→collection). Rafael reports badge stuck at x1
  after changing 5-wishlist → 8-collection. Exact x1 cause not yet confirmed by evidence;
  need diagnostic console output. Two candidate hypotheses:
  H-A: dangling W1 allocation stays in deck after W1 deleted; C1 alloc created correctly
    → badge should show x5 or x6 (not x1). H-A doesn't explain x1.
  H-B: processDeckAllocations creates the NEW C1 allocation BUT the deck reactivity snapshot
    (decks.value = [...decks.value]) happens AFTER both allocateCardToDeck and deleteCard,
    causing Vue to see the old deck state where only 1 collection copy was allocated.
  H-C: Rafael had C1(qty=1, collection, alloc=1) + W1(qty=5, wishlist, alloc=5). The modal
    deckAllocations = {D1:6}. buildOriginalAllocations captures {D1: {qty:1}} (only C1).
    processDeckAllocations: origAlloc={qty:1} vs newAlloc={qty:6} → deallocateAll([C1]) +
    allocateCardToDeck(C1, 6). But deleteCard(W1) already ran and W1 is gone from cards.value.
    The dangling {W1, qty:5} alloc remains in deck. Display: C1 alloc=6 visible; W1 alloc
    skipped. Badge x6. Still not x1.
  H-D: The call to allocateCardToDeck to add C1 is blocked because C1.id is not found via
    getCardById — timing race where C1 was just created but getCardById lookup misses it.
    toAllocate=0, no alloc created. Deck only has old W1 alloc (dangling) → x0 shown, but
    maybe display shows another card with qty=1 from legacy path.

test: add [SCRUM-36 diag3] console.log in CardDetailModal.handleSave capturing:
  savedRelatedCards, savedDistribution, savedDeckAllocations, then after processStatusEntries:
  updatedCardIds; then after processDeckAllocations: current deck.allocations for affected deck.
expecting: Console output will show exact state and confirm/refute each hypothesis.
next_action: Add diagnostic logging to CardDetailModal.handleSave → ask Rafael to repro → diagnose from output.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Closing AddCardModal after adding +1 copy of a card already in the deck should update the xN badge immediately (<500ms), without reload. DeckStatsFooter total should also update.
actual: Badge stays at old value (e.g. x2 instead of x3) until: (a) page reload, or (b) manual +/- button click. handleDeckGridQuantityUpdate (line 396) works correctly — problem is in the modal flow.
errors: No console errors. Silent reactivity bug.
reproduction: |
  1. Open deck editor with card X present (e.g. Lightning Bolt x2). Route: /decks/{id}.
  2. Click + placeholder or FAB → AddCardModal opens.
  3. Search same card, add +1 copy, close modal with SAVE.
  4. Badge shows x2 still. DB has 3 copies allocated.
  5. Workaround: click +/- on the card → forces recompute → shows x3.
started: Likely regression from Phase 03 route split (CollectionView → DeckView/BinderView, v1.26.x)

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "AddCardModal does not call allocateCardToDeck at all (allocation never happens)"
  evidence: AddCardModal.handleAddCard (line 253-259) explicitly calls decksStore.allocateCardToDeck when cardId && form.deckName are set. The DB does receive the allocation (x3 in Firestore confirmed by user). So allocation IS called.
  timestamp: 2026-04-26T00:10:00Z

- hypothesis: "useDeckDisplayCards computed is not reading allocations at all"
  evidence: mainboardDisplayCards at line 88 iterates selectedDeck.value.allocations directly and reads alloc.quantity at line 114. It would recompute IF Vue detects a change in selectedDeck.value. The computed DOES read the right data.
  timestamp: 2026-04-26T00:10:00Z

- hypothesis: "collectionStore.addCard breaks reactivity (new card not in cards.value)"
  evidence: addCard (collection.ts:674) does cards.value = [...cards.value, newCard] — this IS a new array reference, so collectionCards computed in DeckView WOULD recompute. But recomputing collectionCards does not help if selectedDeck.value.allocations hasn't changed as far as Vue can tell.
  timestamp: 2026-04-26T00:10:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-26T15:00:00Z
  checked: DiscoveryPanel usage in DeckView.vue (lines 1014-1023 desktop, lines 1033-1043 mobile)
  found: Neither instance passes :deck-cards prop. DiscoveryPanel.DiscoveryCard computes inDeckMainboardCount from props.deckCards which defaults to []. So the "N MB" badge on Discovery card images always shows 0 — it can never reflect actual deck allocations.
  implication: If Rafael was watching the Discovery card badge (not the deck grid's xN badge), "no cambio el numero" is fully explained by this missing prop. The deck grid xN badge is fed by a separate computed chain (selectedDeck → mainboardDisplayCards → allocatedQuantity) and is NOT affected by this missing prop.

- timestamp: 2026-04-26T15:01:00Z
  checked: scryfallToCardData in useDiscoveryAddCard.ts (line 45) — always sets quantity: 1
  found: Every card created via Discovery's ensureCollectionCard gets quantity:1. After the first MB click allocates that 1 copy, available = card.quantity - getTotalAllocatedForCard = 1 - 1 = 0. Clicks 2 and 3 hit toAllocate=0, toWishlist=1 — they silently add to wishlist, NOT mainboard. The composable's success check (result.allocated===0 && result.wishlisted===0) passes without error because wishlisted=1>0, and shows the misleading "added to mainboard" toast.
  implication: "Solo creo una" is fully explained — only 1 mainboard allocation can ever be created from Discovery for a card that doesn't already have multiple copies in collection.

- timestamp: 2026-04-26T15:02:00Z
  checked: Fix block in allocateCardToDeck (decks.ts lines 678-682) — uses decks.value.indexOf(deck) where deck = decks.value.find() captured before await updateDoc
  found: For CONCURRENT calls (rapid 3 clicks): after the first call's fix block runs (decks.value[idx] = snapshotDeck(deck); decks.value = [...decks.value]), the original deck reference is no longer in decks.value. Calls 2 and 3 have captured the same original deck reference. Their indexOf(deck) returns -1 — their fix block is skipped. UI may show stale state from call 1's snapshot (which may not yet include calls 2/3 mutations, depending on timing). Diagnostic logging added to confirm this in Rafael's environment.
  implication: Race condition under rapid concurrent clicks. However, if availability limits mean clicks 2-3 produce toWishlist only (not toAllocate), the deck allocations aren't changing on those calls anyway, so the -1 is harmless for the mainboard count specifically.

- timestamp: 2026-04-26T15:03:00Z
  checked: Diagnostic console.log added to allocateCardToDeck fix block (decks.ts)
  found: Build passes (npx vite build ✓). Log prints: deckId, cardId, toAllocate, toWishlist, idx (critical: should be >= 0), allocCount, allocations snapshot. Will confirm whether idx=-1 occurs and whether the fix block actually ran.
  implication: Need Rafael to run npm run dev, repeat the exact MB-click test, and paste the [SCRUM-36 diag] lines from browser console.

- timestamp: 2026-04-26T00:05:00Z
  checked: AddCardModal.handleAddCard (lines 216-297)
  found: On SAVE → calls collectionStore.addCard() → gets back cardId → then calls decksStore.allocateCardToDeck(form.deckName, cardId, form.quantity, false). The form.deckName is pre-populated from props.selectedDeckId (watch at line 80-84).
  implication: The modal DOES trigger allocateCardToDeck. The issue is downstream in how that mutation propagates.

- timestamp: 2026-04-26T00:06:00Z
  checked: decksStore.allocateCardToDeck (decks.ts lines 607-684)
  found: |
    1. Gets deck by reference: `const deck = decks.value.find(d => d.id === deckId)` — this is the same object inside decks.value[].
    2. Calls upsertAllocation(deck.allocations, cardId, toAllocate, ...) which finds the existing entry and does `existing.quantity += quantity` (in-place mutation, line 77).
    3. Recalculates deck.stats (in-place mutation).
    4. Saves to Firestore.
    5. Then: `if (currentDeck.value?.id === deckId) { currentDeck.value = snapshotDeck(deck) }` — only updates currentDeck shallowRef.
    6. CRITICAL: Does NOT do decks.value[idx] = snapshotDeck(deck) or decks.value = [...decks.value].
  implication: The decks.value array still contains the same object reference. Vue's ref() tracks array mutations (push/splice/assignment) and object identity. Mutating deck.allocations[x].quantity in-place does NOT trigger a new array reference, so computed properties that depend on decks.value do NOT invalidate.

- timestamp: 2026-04-26T00:07:00Z
  checked: DeckView.vue selectedDeck computed (line 82-84) and useDeckDisplayCards inputs
  found: |
    selectedDeck = computed(() => decks.value.find(d => d.id === deckFilter.value))
    This reads from decks.value (a ref<Deck[]>). If decks.value array identity doesn't change AND the individual Deck object identity doesn't change, Vue will not re-run selectedDeck.
    useDeckDisplayCards receives selectedDeck as a ComputedRef<Deck | null> and directly reads selectedDeck.value.allocations inside computed(). It will only re-run when selectedDeck.value changes identity.
  implication: Because allocateCardToDeck mutates in-place without replacing the deck object or the array, selectedDeck never changes identity → mainboardDisplayCards never recomputes → badge stays stale.

- timestamp: 2026-04-26T00:08:00Z
  checked: Contrast with moveCardBoard (decks.ts lines 1280-1289) and addExtraAllocation (lines 1372-1379)
  found: |
    Both of these DO the missing step:
      decks.value[idx] = snapshotDeck(deck)
      decks.value = [...decks.value]
    This replaces both the deck object AND the array, forcing Vue to invalidate all dependents.
    handleDeckGridQuantityUpdate uses updateAllocation which does NOT have this pattern — but it mutates alloc.quantity directly (line 1010). HOWEVER, it works because handleDeckGridQuantityUpdate is called after collectionStore.updateCard which triggers cards.value reassignment, causing collectionCards computed to refresh and cascade.
  implication: The fix pattern is already demonstrated in moveCardBoard and addExtraAllocation. allocateCardToDeck is missing this pattern.

- timestamp: 2026-04-26T00:09:00Z
  checked: Why +/- workaround works (handleDeckGridQuantityUpdate → updateAllocation)
  found: |
    updateAllocation mutates alloc.quantity in-place (line 1010) — same problem. But in handleDeckGridQuantityUpdate the handler also calls collectionStore.updateCard OR collectionStore.deleteCard in the success branch. These replace cards.value with a new array. That causes collectionCards (DeckView line 77) to recompute, which causes useDeckDisplayCards to re-read everything including the now-mutated alloc.quantity. This is an accidental side-effect, not intentional.
  implication: The +/- button triggers a collection update that accidentally forces a full recompute. The modal flow via allocateCardToDeck does NOT trigger a collection update (addCard adds a NEW card, not updating the existing one), so the recompute never cascades.

- timestamp: 2026-04-26T00:09:30Z
  checked: BinderView.vue handleAddCardModalClose (lines 161-164) and binderStore.allocateCardToBinder (binders.ts lines 312-370)
  found: |
    BinderView has the identical close handler (no force-refresh). binderStore.allocateCardToBinder:
      - line 340-342: existingAlloc.quantity += toAllocate — same in-place mutation
      - lines 352-353: binder.stats and binder.updatedAt mutated in-place
      - NO binders.value[idx] = ... nor binders.value = [...binders.value] after mutation
    BinderView.binderDisplayCards = computed(() => binderStore.hydrateBinderCards(selectedBinder.value, collectionCards.value))
    selectedBinder = computed(() => binders.value.find(b => b.id === binderFilter.value))
    Same reactivity pattern: binders.value array is not replaced, so selectedBinder never changes, so binderDisplayCards never recomputes.
  implication: BinderView has the SAME bug. The fix must be applied to both allocateCardToDeck (decks store) AND allocateCardToBinder (binders store).

- timestamp: 2026-04-26T00:12:00Z
  checked: Also verified updateAllocation in decks.ts has the same in-place mutation gap (line 1010: alloc.quantity = newQuantity, no array replacement)
  found: updateAllocation is used by handleDeckGridQuantityUpdate which accidentally works due to the collectionStore.updateCard cascade. But updateAllocation itself is also broken for any caller that does NOT trigger a collection update. This is a secondary bug but not the one reported in SCRUM-36.
  implication: The fix to allocateCardToDeck also exposes that updateAllocation should eventually get the same treatment, but that is separate scope.

- timestamp: 2026-04-26T19:00:00Z
  checked: CardDetailModal.handleSave full execution path (lines 546-598), collectionStore.loadCollection (lines 282-310), loadFromIndex (lines 316-358).
  found: |
    Step-by-step trace for Rafael's scenario (3 owned → move 2 to wishlist):
    1. reduceAllocationsForCard(C1, newQty=1) calls ensureCollectionWishlistCard → creates W1
       in Firestore and in cards.value optimistically. Deck alloc split: {C1:1, W1:2}.
    2. processStatusEntries: upsertStatusCard('collection',1,C1) → updates C1.quantity=1.
       upsertStatusCard('wishlist',2,undefined) → savedRelatedCards has no wishlist card
       (snapshot pre-W1) → calls addCard → creates duplicate W2 in Firestore + cards.value.
       (Secondary issue: duplicate wishlist card. Not the display bug.)
    3. processDeckAllocations: origAlloc=3, newAlloc=3 (user didn't change deck count) → no-op.
    4. collectionStore.loadCollection() is called as background refresh (line ~588).
       loadFromIndex reads card_index from Firestore. The Cloud Function that rebuilds the
       index has NOT run yet — index still has only C1 (qty=3, collection) from before the save.
       cards.value is overwritten with this stale index: W1 and W2 are wiped.
    5. useDeckDisplayCards now: alloc {C1,1} → owned entry allocatedQty=1. Alloc {W1,2} →
       cardMap.get('W1') = undefined (wiped) → skipped. deckAllocWishlistCards finds nothing.
       Merge produces nothing. Badge shows x1.
  implication: The loadCollection() call is the sole cause of the display regression in Rafael's
    scenario. Removing it is safe because every individual store operation (addCard, updateCard,
    deleteCard, ensureCollectionWishlistCard) already applies optimistic updates to cards.value.

- timestamp: 2026-04-27T00:00:00Z
  checked: CardDetailModal.handleSave full trace for wishlist→collection case (Part 9).
    Initial state assumed: W1(scryfallId=X, edition=Y, status=wishlist, qty=5) allocated
    to deck D1 qty=5. No collection card for (X,Y). User changes wishlist:5→0, collection:0→8.
  found: |
    1. reduceAllocationsForCard NOT called (newOwnedQty=8 >= savedTotalAllocated=5).
    2. processStatusEntries runs:
       - 'collection': targetQty=8, existingCard=undefined → addCard → C1 created
       - 'wishlist': targetQty=0, existingCard=W1 → deleteCard(W1) → W1 removed from cards.value
    3. buildOriginalAllocations([W1]) → skips W1 (wishlist) → returns empty Map.
    4. processDeckAllocations(C1, [W1], {D1:{qty:5}}, allDecks, {}):
       - nonWishlistCards = [] (W1 is wishlist)
       - syncOneDeckAllocation(D1, C1, [], {qty:5}, undefined) → allocateCardToDeck(D1,C1,5,false)
       - allocateCardToDeck: card=C1(qty=8), totalAllocated(C1)=0, toAllocate=5, toWishlist=0
       - upsertAllocation → deck.allocations = [{W1,5}, {C1,5}]
       - W1 alloc NEVER removed (nonWishlistCards empty, deallocateFromAll skipped)
    5. Display after save: W1 alloc skipped (deleted from cards.value), C1 alloc→qty=5.
       Badge should show x5 (not x1). Static analysis CANNOT reproduce "x1".
  implication: |
    Cannot determine exact path to "x1" without console output. Three questions remain:
    Q1: Did Rafael have a pre-existing C1 (qty=1, collection) before the save?
    Q2: Did the deck allocation counter in the modal show the combined total (W1+C1) or just one?
    Q3: Did allocateCardToDeck actually run — or was C1 not found via getCardById at that moment?
    Need [SCRUM-36 diag3] console output to confirm.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  THREE root causes confirmed by Rafael's diagnostic logs (SCRUM-36):

  RC-1: scryfallToCardData always creates cards with quantity:1. After the first MB
  click allocates that 1 copy, available=0 for all subsequent clicks — they silently
  overflow to wishlist. ensureCollectionCard returned existing.id without ever growing
  the collection quantity, so the availability calculation always starved after click 1.

  RC-2: handleDiscoveryAddMainboard uses `void` (fire-and-forget), so 3 rapid clicks
  spawn 3 concurrent async operations. All three capture the deck reference BEFORE any
  of them complete their Firestore write. After call 1's fix block replaces the deck
  object in decks.value, calls 2 and 3 do indexOf(stale-ref) and get -1 — their
  reactivity update is skipped. Additionally, all three see the pre-mutation availability
  state concurrently.

  RC-3: Both DiscoveryPanel instances in DeckView.vue were missing :deck-cards prop.
  DiscoveryPanel.inMainboardCount reads props.deckCards (defaults to []), so the "N MB"
  badge on discovery card images always showed 0.

fix: |
  Base fix (commit 69240ce, kept):
    RC-2: serialization queue + findIndex(by id) in allocateCardToDeck
    RC-3: discoveryDeckCards computed + :deck-cards on both DiscoveryPanel instances

  Extended fix (v1.27.0, this commit):
    RC-1 REVISED: replaced silent auto-grow with debounced modal (600ms).
      - new DiscoveryAddConfirmModal.vue asks condition/foil/qty after N clicks.
      - new addToMainboardConfirmed() in useDiscoveryAddCard handles confirmed path.
      - DeckView accumulates clicks in pendingDiscoveryClicks Map, clears on unmount.

    SCRUM-37 (visual stack):
      - DeckEditorGrid regular grid renders up to 4 offset layers for qty > 1.
      - Layer key = (scryfallId + edition), binder virtual scroll path untouched.

    Wishlist visual merge:
      - useDeckDisplayCards merges wishlist+collection allocs with same
        (scryfallId, edition) into ONE display entry; badge shows combined total.
      - isWishlist: false on all merged entries — no amber border, no opacity-60.
      - mainboardOwnedCount / sideboardOwnedCount read allocations directly.
      - i18n: discovery.messages.addCancelled added to en/es/pt.

  Tests: 888/888 pass. Build clean.

  Part 8 fix (v1.27.1):
    - Removed collectionStore.loadCollection() background call from CardDetailModal.handleSave.
      Individual ops already apply optimistic updates; loadCollection() was racing the Cloud
      Function index and wiping freshly-created wishlist cards from cards.value.
    - Added regression test in useDeckDisplayCards.test.ts: "merge survives after wishlist
      card is created by reduceAllocationsForCard (no stale-index wipe)".

verification: awaiting Rafael local confirmation (v1.27.1, not yet pushed)
files_changed:
  - src/composables/useDiscoveryAddCard.ts
  - src/composables/useDeckDisplayCards.ts
  - src/components/decks/DeckEditorGrid.vue
  - src/components/discovery/DiscoveryAddConfirmModal.vue (new)
  - src/views/DeckView.vue
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/pt.json
  - tests/unit/composables/useDiscoveryAddCard.test.ts
  - tests/unit/composables/useDeckDisplayCards.test.ts
  - src/components/collection/CardDetailModal.vue
  - package.json
  - package-lock.json