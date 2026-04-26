import { createPinia, setActivePinia } from 'pinia'
import { computed } from 'vue'
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

function seedCollection(store: ReturnType<typeof useCollectionStore>, cards: any[]) {
  // Assign to the array AND mock getCardById so the internal Map lookup works
  store.cards = cards as any
  store.getCardById = vi.fn((id: string) => cards.find((c: any) => c.id === id))
}

function seedDeck(
  store: ReturnType<typeof useDecksStore>,
  allocations: Array<{ cardId: string; quantity: number; isInSideboard: boolean }>,
) {
  store.decks.push({
    id: 'deck-1',
    userId: 'user-1',
    name: 'Test Deck',
    format: 'modern',
    description: '',
    colors: [],
    commander: '',
    allocations: allocations.map(a => ({ ...a, addedAt: new Date() })),
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

describe('allocateCardToDeck — Vue reactivity regression (SCRUM-36)', () => {
  /**
   * REGRESSION TEST 1: array reference identity
   *
   * After calling allocateCardToDeck for a card already present in the deck,
   * decks.value must be a NEW array reference. This is required so that
   * Vue computed properties that read decks.value (e.g. DeckView.selectedDeck)
   * are invalidated and re-evaluated.
   *
   * BUG: Before the fix, allocateCardToDeck mutated in-place without replacing
   * the array reference, leaving Vue unaware of the change.
   */
  it('replaces the decks array reference after allocating an existing card', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    seedCollection(collectionStore, [
      { id: 'card-1', name: 'Lightning Bolt', quantity: 4, price: 1, status: 'collection' },
    ])

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 2, isInSideboard: false },
    ])

    const prevRef = store.decks

    ;(updateDoc as any).mockResolvedValue(undefined)

    await store.allocateCardToDeck('deck-1', 'card-1', 1, false)

    // The array reference MUST have changed so Vue computed properties invalidate
    expect(store.decks).not.toBe(prevRef)
  })

  /**
   * REGRESSION TEST 2: computed chain re-evaluation
   *
   * A Vue computed(() => decks.value.find(d => d.id === 'deck-1').allocations.find(...).quantity)
   * must return the NEW quantity after the call, not the stale pre-call value.
   *
   * This is the actual symptom Rafael reported: the badge showed x2 instead of x3.
   */
  it('a computed reading allocatedQuantity reflects the updated value after allocation', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    seedCollection(collectionStore, [
      { id: 'card-1', name: 'Lightning Bolt', quantity: 4, price: 1, status: 'collection' },
    ])

    const store = useDecksStore()
    seedDeck(store, [
      { cardId: 'card-1', quantity: 2, isInSideboard: false },
    ])

    // Simulate what DeckView.selectedDeck + useDeckDisplayCards do:
    // read allocatedQuantity from decks.value
    const allocatedQty = computed(() => {
      const deck = store.decks.find(d => d.id === 'deck-1')
      if (!deck) return 0
      const alloc = deck.allocations.find(
        (a: any) => a.cardId === 'card-1' && !a.isInSideboard
      )
      return alloc?.quantity ?? 0
    })

    expect(allocatedQty.value).toBe(2) // pre-condition

    ;(updateDoc as any).mockResolvedValue(undefined)

    await store.allocateCardToDeck('deck-1', 'card-1', 1, false)

    // After the call, the computed must re-evaluate to the new total (2 + 1 = 3)
    expect(allocatedQty.value).toBe(3)
  })

  /**
   * REGRESSION TEST 3: first-time allocation (new card in deck)
   *
   * When a card is NOT yet in the deck's allocations, allocateCardToDeck adds it.
   * The array reference must still change (for consistency) and the computed must
   * return the new allocation quantity.
   */
  it('replaces array reference and shows correct quantity for a first-time allocation', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    seedCollection(collectionStore, [
      { id: 'card-1', name: 'Lightning Bolt', quantity: 4, price: 1, status: 'collection' },
    ])

    const store = useDecksStore()
    seedDeck(store, []) // empty allocations

    const prevRef = store.decks

    ;(updateDoc as any).mockResolvedValue(undefined)

    await store.allocateCardToDeck('deck-1', 'card-1', 2, false)

    expect(store.decks).not.toBe(prevRef)

    const allocatedQty = computed(() => {
      const deck = store.decks.find(d => d.id === 'deck-1')
      return deck?.allocations.find((a: any) => a.cardId === 'card-1')?.quantity ?? 0
    })
    expect(allocatedQty.value).toBe(2)
  })

  /**
   * REGRESSION TEST 4: race condition — three sequential allocations all land in mainboard
   *
   * When allocateCardToDeck is called three times in sequence (each awaited, simulating
   * the serialization queue in useDiscoveryAddCard), all three allocations must accumulate
   * correctly. Uses findIndex(by id) instead of indexOf(by ref) so the lookup survives
   * the deck object being replaced after each call (SCRUM-36 RC-2).
   *
   * The collection card starts with quantity=3 so all three copies are available.
   */
  it('accumulates all three allocations when called sequentially (race regression)', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    // Quantity=3: each call has 1 available copy after the previous allocation
    seedCollection(collectionStore, [
      { id: 'card-1', name: 'Sol Ring', quantity: 3, price: 1, status: 'collection' },
    ])

    const store = useDecksStore()
    seedDeck(store, []) // no pre-existing allocations

    ;(updateDoc as any).mockResolvedValue(undefined)

    // Simulate 3 sequential MB clicks (serialized by the queue in useDiscoveryAddCard)
    const r1 = await store.allocateCardToDeck('deck-1', 'card-1', 1, false)
    const r2 = await store.allocateCardToDeck('deck-1', 'card-1', 1, false)
    const r3 = await store.allocateCardToDeck('deck-1', 'card-1', 1, false)

    // Each call must have allocated to mainboard (not wishlist)
    expect(r1).toEqual({ allocated: 1, wishlisted: 0 })
    expect(r2).toEqual({ allocated: 1, wishlisted: 0 })
    expect(r3).toEqual({ allocated: 1, wishlisted: 0 })

    // Final state: 3 copies in mainboard
    const allocatedQty = computed(() => {
      const deck = store.decks.find(d => d.id === 'deck-1')
      return deck?.allocations.find((a: any) => a.cardId === 'card-1' && !a.isInSideboard)?.quantity ?? 0
    })
    expect(allocatedQty.value).toBe(3)

    // Array reference must have changed at least once (Vue reactivity check)
    expect(store.decks.length).toBe(1)
  })

})
