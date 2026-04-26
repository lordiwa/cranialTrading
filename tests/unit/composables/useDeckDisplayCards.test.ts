/**
 * Tests for useDeckDisplayCards composable.
 *
 * Pure reactive composable — takes collection & deck refs in, returns
 * hydrated display cards + counts + commander detection.
 */

import { ref, computed } from 'vue'
import { useDeckDisplayCards } from '@/composables/useDeckDisplayCards'
import type { Card, CardCondition, CardStatus } from '@/types/card'
import type { Deck, DeckCardAllocation, DeckWishlistItem } from '@/types/deck'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    scryfallId: 'scryfall-1',
    name: 'Lightning Bolt',
    edition: 'Magic 2021',
    setCode: 'M21',
    quantity: 4,
    condition: 'NM' as CardCondition,
    foil: false,
    language: 'en',
    price: 1.5,
    image: 'https://example.com/bolt.jpg',
    status: 'collection' as CardStatus,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    userId: 'user-1',
    name: 'Test Deck',
    format: 'modern',
    description: '',
    colors: [],
    allocations: [],
    wishlist: [],
    thumbnail: '',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    isPublic: false,
    stats: {
      totalCards: 0,
      sideboardCards: 0,
      ownedCards: 0,
      wishlistCards: 0,
      avgPrice: 0,
      totalPrice: 0,
      completionPercentage: 0,
    },
    ...overrides,
  }
}

function makeAlloc(overrides: Partial<DeckCardAllocation> = {}): DeckCardAllocation {
  return {
    cardId: 'card-1',
    quantity: 1,
    isInSideboard: false,
    addedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function makeWishlistItem(overrides: Partial<DeckWishlistItem> = {}): DeckWishlistItem {
  return {
    scryfallId: 'scryfall-x',
    name: 'Wishlisted Card',
    edition: 'Set X',
    quantity: 1,
    isInSideboard: false,
    price: 5,
    image: '',
    condition: 'NM' as CardCondition,
    foil: false,
    addedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

describe('useDeckDisplayCards', () => {
  describe('null deck handling', () => {
    it('returns empty arrays and zero counts when selectedDeck is null', () => {
      const selectedDeck = computed(() => null)
      const collectionCards = computed(() => [])
      const filterQuery = ref('')
      const {
        mainboardDisplayCards,
        sideboardDisplayCards,
        filteredMainboardDisplayCards,
        filteredSideboardDisplayCards,
        mainboardOwnedCount,
        sideboardOwnedCount,
        mainboardWishlistCount,
        sideboardWishlistCount,
        deckOwnedCards,
        deckAllocWishlistCards,
        deckMainboardWishlist,
        isCommanderFormat,
        commanderNames,
      } = useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })

      expect(mainboardDisplayCards.value).toEqual([])
      expect(sideboardDisplayCards.value).toEqual([])
      expect(filteredMainboardDisplayCards.value).toEqual([])
      expect(filteredSideboardDisplayCards.value).toEqual([])
      expect(mainboardOwnedCount.value).toBe(0)
      expect(sideboardOwnedCount.value).toBe(0)
      expect(mainboardWishlistCount.value).toBe(0)
      expect(sideboardWishlistCount.value).toBe(0)
      expect(deckOwnedCards.value).toEqual([])
      expect(deckAllocWishlistCards.value).toEqual([])
      expect(deckMainboardWishlist.value).toEqual([])
      expect(isCommanderFormat.value).toBe(false)
      expect(commanderNames.value).toEqual([])
    })
  })

  describe('hydration', () => {
    it('hydrates owned allocations into mainboard display cards', () => {
      const card = makeCard({ id: 'c1', name: 'Sol Ring', quantity: 2 })
      const deck = makeDeck({
        allocations: [makeAlloc({ cardId: 'c1', quantity: 1, isInSideboard: false })],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [card])
      const filterQuery = ref('')

      const { mainboardDisplayCards, mainboardOwnedCount } = useDeckDisplayCards({
        selectedDeck,
        collectionCards,
        filterQuery,
      })

      expect(mainboardDisplayCards.value).toHaveLength(1)
      expect(mainboardDisplayCards.value[0].name).toBe('Sol Ring')
      expect(mainboardDisplayCards.value[0].isWishlist).toBe(false)
      expect(mainboardDisplayCards.value[0].allocatedQuantity).toBe(1)
      expect(mainboardOwnedCount.value).toBe(1)
    })

    it('hydrates sideboard allocations separately from mainboard', () => {
      const card = makeCard({ id: 'c1', name: 'Pithing Needle', quantity: 4 })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'c1', quantity: 1, isInSideboard: false }),
          makeAlloc({ cardId: 'c1', quantity: 2, isInSideboard: true }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [card])
      const filterQuery = ref('')

      const { mainboardDisplayCards, sideboardDisplayCards, mainboardOwnedCount, sideboardOwnedCount } =
        useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })

      expect(mainboardDisplayCards.value).toHaveLength(1)
      expect(sideboardDisplayCards.value).toHaveLength(1)
      expect(mainboardOwnedCount.value).toBe(1)
      expect(sideboardOwnedCount.value).toBe(2)
    })

    it('includes legacy wishlist entries from deck.wishlist (no amber: isWishlist=false after SCRUM-36 merge)', () => {
      const deck = makeDeck({
        wishlist: [makeWishlistItem({ name: 'Force of Will', quantity: 3, isInSideboard: false })],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [])
      const filterQuery = ref('')

      const { mainboardDisplayCards, mainboardWishlistCount, deckMainboardWishlist } =
        useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })

      expect(deckMainboardWishlist.value).toHaveLength(1)
      expect(deckMainboardWishlist.value[0].name).toBe('Force of Will')
      expect(mainboardWishlistCount.value).toBe(3)
      // After SCRUM-36 merge: wishlist-only entries render as isWishlist=false (no amber styling)
      const entry = mainboardDisplayCards.value.find(c => c.name === 'Force of Will')
      expect(entry).toBeDefined()
      expect(entry!.isWishlist).toBe(false)
      expect(entry!.allocatedQuantity).toBe(3)
    })

    it('handles wishlist allocations (card.status === "wishlist") — isWishlist=false after merge', () => {
      const wishCard = makeCard({ id: 'w1', name: 'Mana Crypt', status: 'wishlist', quantity: 1 })
      const deck = makeDeck({
        allocations: [makeAlloc({ cardId: 'w1', quantity: 1, isInSideboard: false })],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [wishCard])
      const filterQuery = ref('')

      const { mainboardDisplayCards, deckAllocWishlistCards, mainboardWishlistCount } =
        useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })

      expect(deckAllocWishlistCards.value).toHaveLength(1)
      expect(mainboardWishlistCount.value).toBe(1)
      // After SCRUM-36: wishlist-only entry rendered without amber border
      const entry = mainboardDisplayCards.value.find(c => c.name === 'Mana Crypt')
      expect(entry).toBeDefined()
      expect(entry!.isWishlist).toBe(false)
    })
  })

  describe('wishlist merge (SCRUM-36)', () => {
    it('merges wishlist-alloc quantity into owned entry with matching (scryfallId, edition)', () => {
      // owned: 2 copies allocated, wishlist: 1 copy allocated → badge shows 3
      const ownedCard = makeCard({ id: 'c1', scryfallId: 'sf1', edition: 'M21', quantity: 2, status: 'collection' })
      const wishCard = makeCard({ id: 'w1', scryfallId: 'sf1', edition: 'M21', quantity: 1, status: 'wishlist' })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'c1', quantity: 2, isInSideboard: false }),
          makeAlloc({ cardId: 'w1', quantity: 1, isInSideboard: false }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [ownedCard, wishCard])
      const filterQuery = ref('')

      const { mainboardDisplayCards, mainboardOwnedCount, mainboardWishlistCount } =
        useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })

      // One merged entry (not two separate)
      expect(mainboardDisplayCards.value).toHaveLength(1)
      // Badge quantity = owned + wishlist
      expect(mainboardDisplayCards.value[0]!.allocatedQuantity).toBe(3)
      // No amber styling: isWishlist=false on the merged entry
      expect(mainboardDisplayCards.value[0]!.isWishlist).toBe(false)
      // Counts: owned=2, wishlist=1 (independent of merged display)
      expect(mainboardOwnedCount.value).toBe(2)
      expect(mainboardWishlistCount.value).toBe(1)
    })

    it('keeps separate piles for different editions (same scryfallId but different edition)', () => {
      const cardA = makeCard({ id: 'cA', scryfallId: 'sf1', edition: 'Alpha', quantity: 2, status: 'collection' })
      const cardB = makeCard({ id: 'cB', scryfallId: 'sf1', edition: 'Beta', quantity: 1, status: 'collection' })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'cA', quantity: 2, isInSideboard: false }),
          makeAlloc({ cardId: 'cB', quantity: 1, isInSideboard: false }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [cardA, cardB])
      const filterQuery = ref('')

      const { mainboardDisplayCards } = useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })

      // Two separate piles (different editions = different prints)
      expect(mainboardDisplayCards.value).toHaveLength(2)
      const alphaEntry = mainboardDisplayCards.value.find(c => c.edition === 'Alpha')
      const betaEntry = mainboardDisplayCards.value.find(c => c.edition === 'Beta')
      expect(alphaEntry?.allocatedQuantity).toBe(2)
      expect(betaEntry?.allocatedQuantity).toBe(1)
    })

    it('mainboardOwnedCount is not inflated by merged wishlist quantities', () => {
      const ownedCard = makeCard({ id: 'c1', scryfallId: 'sf1', edition: 'M21', quantity: 2, status: 'collection' })
      const wishCard = makeCard({ id: 'w1', scryfallId: 'sf1', edition: 'M21', quantity: 1, status: 'wishlist' })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'c1', quantity: 2, isInSideboard: false }),
          makeAlloc({ cardId: 'w1', quantity: 1, isInSideboard: false }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [ownedCard, wishCard])
      const filterQuery = ref('')

      const { mainboardOwnedCount } = useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })

      // Must be 2 (owned only), not 3 (badge total)
      expect(mainboardOwnedCount.value).toBe(2)
    })

    it('badge shows 3 after CardDetailModal moves 2 owned copies to wishlist (SCRUM-36 Part 8 regression)', () => {
      // Reproduces Rafael's scenario:
      //   - Started with 3 owned (C1, qty=3, collection), all 3 allocated to deck.
      //   - User opens CardDetailModal, moves 2 copies to wishlist (collection:1, wishlist:2).
      //   - handleSave calls reduceAllocationsForCard → creates W1 (wishlist, qty=2) optimistically
      //     and splits deck alloc to {C1:1, W1:2}.
      //   - handleSave updates C1.quantity=1.
      //   - BUG (fixed): loadCollection() was then called and wiped W1 from cards.value,
      //     making the deck alloc {W1:2} a dangling ref → badge dropped to x1.
      //   - FIX: loadCollection() removed. State after save = C1(qty=1) + W1(qty=2) in cards.value.
      //   This test pins that correct post-save state and verifies badge = 3.
      const ownedCard = makeCard({ id: 'C1', scryfallId: 'sf-bolt', edition: 'M21', quantity: 1, status: 'collection' })
      const wishCard = makeCard({ id: 'W1', scryfallId: 'sf-bolt', edition: 'M21', quantity: 2, status: 'wishlist' })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'C1', quantity: 1, isInSideboard: false }),
          makeAlloc({ cardId: 'W1', quantity: 2, isInSideboard: false }),
        ],
      })
      // collectionCards contains both C1 and W1 (as they would be after optimistic updates,
      // WITHOUT a stale loadCollection() overwrite)
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [ownedCard, wishCard])
      const filterQuery = ref('')

      const { mainboardDisplayCards, mainboardOwnedCount, mainboardWishlistCount } =
        useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })

      // One merged pile (not two separate entries)
      expect(mainboardDisplayCards.value).toHaveLength(1)
      // Badge = owned(1) + wishlist(2) = 3
      expect(mainboardDisplayCards.value[0]!.allocatedQuantity).toBe(3)
      // No amber border on the merged entry
      expect(mainboardDisplayCards.value[0]!.isWishlist).toBe(false)
      // Owned count = 1 (only C1), wishlist count = 2 (only W1)
      expect(mainboardOwnedCount.value).toBe(1)
      expect(mainboardWishlistCount.value).toBe(2)
    })
  })

  describe('deckOwnedCards', () => {
    it('returns unique non-wishlist cards from allocations', () => {
      const c1 = makeCard({ id: 'c1', name: 'A' })
      const c2 = makeCard({ id: 'c2', name: 'B' })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'c1', quantity: 1 }),
          makeAlloc({ cardId: 'c1', quantity: 2, isInSideboard: true }), // dedupe
          makeAlloc({ cardId: 'c2', quantity: 1 }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [c1, c2])
      const filterQuery = ref('')

      const { deckOwnedCards } = useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })
      expect(deckOwnedCards.value).toHaveLength(2)
    })

    it('excludes wishlist-status cards', () => {
      const owned = makeCard({ id: 'c1', name: 'Owned' })
      const wish = makeCard({ id: 'w1', name: 'Wish', status: 'wishlist' })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'c1' }),
          makeAlloc({ cardId: 'w1' }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [owned, wish])
      const filterQuery = ref('')

      const { deckOwnedCards } = useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })
      expect(deckOwnedCards.value).toHaveLength(1)
      expect(deckOwnedCards.value[0].id).toBe('c1')
    })
  })

  describe('filter', () => {
    it('filters mainboard display cards by filterQuery (name)', () => {
      const c1 = makeCard({ id: 'c1', name: 'Lightning Bolt' })
      const c2 = makeCard({ id: 'c2', name: 'Counterspell' })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'c1' }),
          makeAlloc({ cardId: 'c2' }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [c1, c2])
      const filterQuery = ref('')

      const { filteredMainboardDisplayCards } = useDeckDisplayCards({
        selectedDeck,
        collectionCards,
        filterQuery,
      })

      expect(filteredMainboardDisplayCards.value).toHaveLength(2)

      filterQuery.value = 'lightning'
      expect(filteredMainboardDisplayCards.value).toHaveLength(1)
      expect(filteredMainboardDisplayCards.value[0].name).toBe('Lightning Bolt')
    })

    it('filters sideboard display cards by filterQuery (edition)', () => {
      const c1 = makeCard({ id: 'c1', name: 'A', edition: 'Modern Horizons' })
      const c2 = makeCard({ id: 'c2', name: 'B', edition: 'Alpha' })
      const deck = makeDeck({
        allocations: [
          makeAlloc({ cardId: 'c1', isInSideboard: true }),
          makeAlloc({ cardId: 'c2', isInSideboard: true }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [c1, c2])
      const filterQuery = ref('modern')

      const { filteredSideboardDisplayCards } = useDeckDisplayCards({
        selectedDeck,
        collectionCards,
        filterQuery,
      })
      expect(filteredSideboardDisplayCards.value).toHaveLength(1)
      expect(filteredSideboardDisplayCards.value[0].name).toBe('A')
    })
  })

  describe('commander detection', () => {
    it('detects commander format and extracts single commander name', () => {
      const deck = makeDeck({ format: 'commander', commander: 'Atraxa' })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [])
      const filterQuery = ref('')

      const { isCommanderFormat, commanderNames } = useDeckDisplayCards({
        selectedDeck,
        collectionCards,
        filterQuery,
      })

      expect(isCommanderFormat.value).toBe(true)
      expect(commanderNames.value).toEqual(['Atraxa'])
    })

    it('splits partner commanders on "//" (legacy split pattern — also splits on commas)', () => {
      // Preserves legacy DeckView behaviour: regex splits on "//" AND ",", so a comma
      // inside a commander name will also split it. Tests merely pin existing behaviour.
      const deck = makeDeck({ format: 'commander', commander: 'Tymna the Weaver // Thrasios' })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [])
      const filterQuery = ref('')

      const { commanderNames } = useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })
      expect(commanderNames.value).toEqual(['Tymna the Weaver', 'Thrasios'])
    })

    it('returns empty commanderNames for non-commander format', () => {
      const deck = makeDeck({ format: 'modern', commander: 'Something' })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [])
      const filterQuery = ref('')

      const { isCommanderFormat, commanderNames } = useDeckDisplayCards({
        selectedDeck,
        collectionCards,
        filterQuery,
      })

      expect(isCommanderFormat.value).toBe(false)
      expect(commanderNames.value).toEqual([])
    })

    it('hides sideboard display in commander format', () => {
      const card = makeCard({ id: 'c1', name: 'Sol Ring' })
      const deck = makeDeck({
        format: 'commander',
        commander: 'Atraxa',
        allocations: [makeAlloc({ cardId: 'c1', isInSideboard: true })],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [card])
      const filterQuery = ref('')

      const { sideboardDisplayCards } = useDeckDisplayCards({ selectedDeck, collectionCards, filterQuery })
      expect(sideboardDisplayCards.value).toEqual([])
    })

    it('excludes commander from mainboardOwnedCount (commanders tallied separately via selectedDeckStats)', () => {
      const commanderCard = makeCard({ id: 'c1', name: 'Atraxa' })
      const other = makeCard({ id: 'c2', name: 'Sol Ring' })
      const deck = makeDeck({
        format: 'commander',
        commander: 'Atraxa',
        allocations: [
          makeAlloc({ cardId: 'c1', quantity: 1 }),
          makeAlloc({ cardId: 'c2', quantity: 1 }),
        ],
      })
      const selectedDeck = computed(() => deck)
      const collectionCards = computed(() => [commanderCard, other])
      const filterQuery = ref('')

      const { mainboardOwnedCount, mainboardDisplayCards } = useDeckDisplayCards({
        selectedDeck,
        collectionCards,
        filterQuery,
      })

      // Commander is in display list, but excluded from mainboardOwnedCount
      expect(mainboardDisplayCards.value).toHaveLength(2)
      expect(mainboardOwnedCount.value).toBe(1)
    })
  })
})
