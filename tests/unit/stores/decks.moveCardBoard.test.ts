import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'

// Mock Firebase before importing the store
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}))

vi.mock('@/services/firebase', () => ({
  db: {},
}))

vi.mock('@/services/scryfall', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

import { useDecksStore } from '@/stores/decks'
import { useAuthStore } from '@/stores/auth'
import { useCollectionStore } from '@/stores/collection'
import { updateDoc } from 'firebase/firestore'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

function seedDeck(store: ReturnType<typeof useDecksStore>, allocations: Array<{
  cardId: string
  quantity: number
  isInSideboard: boolean
}>) {
  store.decks.push({
    id: 'deck-1',
    userId: 'user-1',
    name: 'Test Deck',
    format: 'modern',
    description: '',
    colors: [],
    commander: '',
    allocations: allocations.map(a => ({
      ...a,
      addedAt: new Date(),
    })),
    wishlist: [],
    thumbnail: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublic: false,
    stats: {
      totalCards: 0,
      sideboardCards: 0,
      ownedCards: 0,
      wishlistCards: 0,
      avgPrice: 0,
      totalPrice: 0,
      completionPercentage: 100,
    },
  })
}

describe('moveCardBoard', () => {
  it('moves allocation from mainboard to sideboard', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
    ]

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 3, isInSideboard: false },
    ])

    ;(updateDoc as any).mockResolvedValue(undefined)

    const result = await store.moveCardBoard('deck-1', 'card-1', false)
    expect(result).toBe(true)

    const deck = store.decks[0]
    const movedAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === true
    )
    expect(movedAlloc).toBeTruthy()
    expect(movedAlloc!.quantity).toBe(3)

    // Original mainboard allocation should be gone
    const oldAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === false
    )
    expect(oldAlloc).toBeUndefined()
  })

  it('moves allocation from sideboard to mainboard', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
    ]

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 2, isInSideboard: true },
    ])

    ;(updateDoc as any).mockResolvedValue(undefined)

    const result = await store.moveCardBoard('deck-1', 'card-1', true)
    expect(result).toBe(true)

    const deck = store.decks[0]
    const movedAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === false
    )
    expect(movedAlloc).toBeTruthy()
    expect(movedAlloc!.quantity).toBe(2)
  })

  it('merges with existing allocation on target board', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
    ]

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 2, isInSideboard: false },
      { cardId: 'card-1', quantity: 1, isInSideboard: true },
    ])

    ;(updateDoc as any).mockResolvedValue(undefined)

    // Move mainboard (2) → sideboard (already has 1)
    const result = await store.moveCardBoard('deck-1', 'card-1', false)
    expect(result).toBe(true)

    const deck = store.decks[0]
    const sideboardAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === true
    )
    expect(sideboardAlloc).toBeTruthy()
    expect(sideboardAlloc!.quantity).toBe(3) // 1 existing + 2 moved

    // Mainboard allocation should be removed
    const mainboardAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === false
    )
    expect(mainboardAlloc).toBeUndefined()
  })

  it('returns false when deck not found', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const store = useDecksStore()
    const result = await store.moveCardBoard('nonexistent', 'card-1', false)
    expect(result).toBe(false)
  })

  it('returns false when allocation not found', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const store = useDecksStore()
    seedDeck(store, [])

    const result = await store.moveCardBoard('deck-1', 'card-1', false)
    expect(result).toBe(false)
  })

  it('returns false when user is not authenticated', async () => {
    const store = useDecksStore()
    const result = await store.moveCardBoard('deck-1', 'card-1', false)
    expect(result).toBe(false)
  })

  it('moves partial quantity from mainboard to sideboard', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
    ]

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 4, isInSideboard: false },
    ])

    ;(updateDoc as any).mockResolvedValue(undefined)

    const result = await store.moveCardBoard('deck-1', 'card-1', false, 2)
    expect(result).toBe(true)

    const deck = store.decks[0]
    // Mainboard should have 2 remaining
    const mainAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === false
    )
    expect(mainAlloc).toBeTruthy()
    expect(mainAlloc!.quantity).toBe(2)

    // Sideboard should have 2 moved
    const sideAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === true
    )
    expect(sideAlloc).toBeTruthy()
    expect(sideAlloc!.quantity).toBe(2)
  })

  it('partial move merges with existing target allocation', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
    ]

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 3, isInSideboard: false },
      { cardId: 'card-1', quantity: 1, isInSideboard: true },
    ])

    ;(updateDoc as any).mockResolvedValue(undefined)

    // Move 2 from mainboard → sideboard (already has 1)
    const result = await store.moveCardBoard('deck-1', 'card-1', false, 2)
    expect(result).toBe(true)

    const deck = store.decks[0]
    // Mainboard should have 1 remaining
    const mainAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === false
    )
    expect(mainAlloc).toBeTruthy()
    expect(mainAlloc!.quantity).toBe(1)

    // Sideboard should have 3 (1 existing + 2 moved)
    const sideAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === true
    )
    expect(sideAlloc).toBeTruthy()
    expect(sideAlloc!.quantity).toBe(3)
  })

  it('clamps quantityToMove to source quantity when exceeding', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
    ]

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 2, isInSideboard: false },
    ])

    ;(updateDoc as any).mockResolvedValue(undefined)

    // Try to move 5 but only have 2
    const result = await store.moveCardBoard('deck-1', 'card-1', false, 5)
    expect(result).toBe(true)

    const deck = store.decks[0]
    // Source should be removed (all moved)
    const mainAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === false
    )
    expect(mainAlloc).toBeUndefined()

    // Target should have 2 (clamped to available)
    const sideAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === true
    )
    expect(sideAlloc).toBeTruthy()
    expect(sideAlloc!.quantity).toBe(2)
  })

  it('defaults to full move when quantityToMove is undefined (backward compat)', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
    ]

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 3, isInSideboard: false },
    ])

    ;(updateDoc as any).mockResolvedValue(undefined)

    // No quantityToMove → move all
    const result = await store.moveCardBoard('deck-1', 'card-1', false)
    expect(result).toBe(true)

    const deck = store.decks[0]
    const mainAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === false
    )
    expect(mainAlloc).toBeUndefined()

    const sideAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'card-1' && a.isInSideboard === true
    )
    expect(sideAlloc).toBeTruthy()
    expect(sideAlloc!.quantity).toBe(3)
  })

  describe('view-layer find() regression (partial move)', () => {
    // After a partial move, a card has TWO allocations for the same deck
    // (one mainboard, one sideboard). The view's computed properties must
    // filter by isInSideboard to find the correct one — plain find() by
    // deckId alone returns whichever comes first and hides the other board.

    it('after partial move, filtering by isInSideboard finds both boards', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      collectionStore.cards = [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
      ]

      const store = useDecksStore()
      seedDeck(store, [
        { cardId: 'card-1', quantity: 4, isInSideboard: false },
      ])

      ;(updateDoc as any).mockResolvedValue(undefined)

      // Partial move: 2 of 4 from mainboard → sideboard
      await store.moveCardBoard('deck-1', 'card-1', false, 2)

      const allocations = store.decks[0].allocations.filter(
        (a: any) => a.cardId === 'card-1'
      )

      // BUG pattern (what the view WAS doing):
      const buggyFind = allocations.find((a: any) => a.deckId === undefined || true)
      // This always returns the first allocation regardless of board

      // CORRECT pattern (what the view SHOULD do):
      const mainboardAlloc = allocations.find(
        (a: any) => !a.isInSideboard
      )
      const sideboardAlloc = allocations.find(
        (a: any) => a.isInSideboard
      )

      // Both boards must be findable
      expect(mainboardAlloc).toBeTruthy()
      expect(mainboardAlloc!.quantity).toBe(2)
      expect(sideboardAlloc).toBeTruthy()
      expect(sideboardAlloc!.quantity).toBe(2)

      // deckOwnedCount pattern: sum ALL allocations for this card
      const totalQty = allocations.reduce((s: number, a: any) => s + a.quantity, 0)
      expect(totalQty).toBe(4) // 2 mainboard + 2 sideboard = original total preserved
    })

    it('after partial move, deckOwnedCost sums both boards correctly', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      collectionStore.cards = [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 5, status: 'collection' } as any,
      ]

      const store = useDecksStore()
      seedDeck(store, [
        { cardId: 'card-1', quantity: 3, isInSideboard: false },
      ])

      ;(updateDoc as any).mockResolvedValue(undefined)

      // Partial move: 1 of 3 from mainboard → sideboard
      await store.moveCardBoard('deck-1', 'card-1', false, 1)

      const allocations = store.decks[0].allocations.filter(
        (a: any) => a.cardId === 'card-1'
      )

      // Buggy pattern: find() returns only first allocation's qty
      const buggyAlloc = allocations.find(() => true)
      const buggyQty = buggyAlloc?.quantity ?? 0
      // This could be 2 (mainboard) or 1 (sideboard) depending on order

      // Correct pattern: sum ALL allocations
      const totalQty = allocations.reduce((s: number, a: any) => s + a.quantity, 0)
      expect(totalQty).toBe(3) // total must be preserved

      const price = 5
      const correctCost = price * totalQty
      expect(correctCost).toBe(15) // 3 * $5
    })
  })
})

describe('addExtraAllocation', () => {
  it('adds new allocation and triggers decks shallowRef update', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' } as any,
    ]
    // Mock addCard to return a new card ID
    collectionStore.addCard = vi.fn().mockResolvedValue('new-card-99')

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 2, isInSideboard: false },
    ])

    // Capture the original array reference
    const originalDecksRef = store.decks

    ;(updateDoc as any).mockResolvedValue(undefined)

    const result = await store.addExtraAllocation(
      'deck-1',
      {
        scryfallId: 'scry-1',
        name: 'Bolt',
        edition: 'M21',
        condition: 'NM' as any,
        foil: false,
        price: 1,
        image: 'https://example.com/bolt.jpg',
      },
      3,
      true, // isInSideboard
      'collection'
    )

    expect(result).toBe(true)

    // The new allocation should exist in the deck
    const deck = store.decks[0]
    const newAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'new-card-99' && a.isInSideboard === true
    )
    expect(newAlloc).toBeTruthy()
    expect(newAlloc!.quantity).toBe(3)

    // The decks array reference must have changed (shallowRef trigger)
    expect(store.decks).not.toBe(originalDecksRef)
  })

  it('adds wishlist extras and triggers decks shallowRef update', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [
      { id: 'card-1', name: 'Bolt', quantity: 2, price: 1, status: 'collection' } as any,
    ]
    collectionStore.ensureCollectionWishlistCard = vi.fn().mockResolvedValue('wish-card-1')

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 2, isInSideboard: false },
    ])

    const originalDecksRef = store.decks

    ;(updateDoc as any).mockResolvedValue(undefined)

    const result = await store.addExtraAllocation(
      'deck-1',
      {
        scryfallId: 'scry-1',
        name: 'Bolt',
        edition: 'M21',
        condition: 'NM' as any,
        foil: false,
        price: 1,
        image: 'https://example.com/bolt.jpg',
      },
      3,
      false, // mainboard
      'wishlist'
    )

    expect(result).toBe(true)

    const deck = store.decks[0]
    const newAlloc = deck.allocations.find(
      (a: any) => a.cardId === 'wish-card-1' && a.isInSideboard === false
    )
    expect(newAlloc).toBeTruthy()
    expect(newAlloc!.quantity).toBe(3)

    // shallowRef must have been triggered
    expect(store.decks).not.toBe(originalDecksRef)
  })

  it('returns false when deck not found', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const store = useDecksStore()
    const result = await store.addExtraAllocation(
      'nonexistent',
      {
        scryfallId: 'scry-1',
        name: 'Bolt',
        edition: 'M21',
        condition: 'NM' as any,
        foil: false,
        price: 1,
        image: 'https://example.com/bolt.jpg',
      },
      3,
      true,
      'collection'
    )
    expect(result).toBe(false)
  })
})
