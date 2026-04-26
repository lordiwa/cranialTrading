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
  deleteField: vi.fn(() => '__DELETE__'),
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

import { useBindersStore } from '@/stores/binders'
import { useAuthStore } from '@/stores/auth'
import { useCollectionStore } from '@/stores/collection'
import { useDecksStore } from '@/stores/decks'
import { updateDoc } from 'firebase/firestore'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

function seedCollection(store: ReturnType<typeof useCollectionStore>, cards: any[]) {
  store.cards = cards as any
  store.getCardById = vi.fn((id: string) => cards.find((c: any) => c.id === id))
}

function seedBinder(
  store: ReturnType<typeof useBindersStore>,
  allocations: Array<{ cardId: string; quantity: number }>,
) {
  store.binders.push({
    id: 'binder-1',
    userId: 'user-1',
    name: 'Test Binder',
    description: '',
    allocations: allocations.map(a => ({ ...a, addedAt: new Date() })),
    thumbnail: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    stats: { totalCards: 0, totalPrice: 0 },
    isPublic: true,
    forSale: false,
  })
}

describe('allocateCardToBinder — Vue reactivity regression (SCRUM-36)', () => {
  /**
   * REGRESSION TEST 1: array reference identity
   *
   * After calling allocateCardToBinder for a card already present in the binder,
   * binders.value must be a NEW array reference so that Vue computed properties
   * depending on binders.value (e.g. BinderView.selectedBinder) are invalidated.
   *
   * BUG: Before the fix, allocateCardToBinder mutated existingAlloc.quantity in-place
   * without ever replacing the binder object or the binders.value array.
   */
  it('replaces the binders array reference after allocating an existing card', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    seedCollection(collectionStore, [
      { id: 'card-1', name: 'Lightning Bolt', quantity: 4, price: 1, status: 'collection' },
    ])

    // decksStore needed by allocateCardToBinder to calculate deck-allocated qty
    const decksStore = useDecksStore()
    decksStore.decks = []

    const store = useBindersStore()
    seedBinder(store, [{ cardId: 'card-1', quantity: 2 }])

    const prevRef = store.binders

    ;(updateDoc as any).mockResolvedValue(undefined)

    await store.allocateCardToBinder('binder-1', 'card-1', 1)

    // The array reference MUST have changed
    expect(store.binders).not.toBe(prevRef)
  })

  /**
   * REGRESSION TEST 2: computed chain re-evaluation
   *
   * A Vue computed reading allocatedQuantity from binders.value must return
   * the updated quantity after the call (not the stale value).
   *
   * Mirrors the xN badge bug in DeckView — same root cause in BinderView.
   */
  it('a computed reading allocatedQuantity reflects the updated value after allocation', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    seedCollection(collectionStore, [
      { id: 'card-1', name: 'Lightning Bolt', quantity: 4, price: 1, status: 'collection' },
    ])

    const decksStore = useDecksStore()
    decksStore.decks = []

    const store = useBindersStore()
    seedBinder(store, [{ cardId: 'card-1', quantity: 2 }])

    // Simulate what BinderView.selectedBinder + hydrateBinderCards do
    const allocatedQty = computed(() => {
      const binder = store.binders.find(b => b.id === 'binder-1')
      if (!binder) return 0
      return binder.allocations?.find((a: any) => a.cardId === 'card-1')?.quantity ?? 0
    })

    expect(allocatedQty.value).toBe(2) // pre-condition

    ;(updateDoc as any).mockResolvedValue(undefined)

    await store.allocateCardToBinder('binder-1', 'card-1', 1)

    // Must re-evaluate to 3 (2 existing + 1 added)
    expect(allocatedQty.value).toBe(3)
  })

  /**
   * REGRESSION TEST 3: first-time allocation (new card in binder)
   */
  it('replaces array reference and shows correct quantity for a first-time allocation', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    seedCollection(collectionStore, [
      { id: 'card-1', name: 'Lightning Bolt', quantity: 4, price: 1, status: 'collection' },
    ])

    const decksStore = useDecksStore()
    decksStore.decks = []

    const store = useBindersStore()
    seedBinder(store, []) // empty allocations

    const prevRef = store.binders

    ;(updateDoc as any).mockResolvedValue(undefined)

    await store.allocateCardToBinder('binder-1', 'card-1', 2)

    expect(store.binders).not.toBe(prevRef)

    const allocatedQty = computed(() => {
      const binder = store.binders.find(b => b.id === 'binder-1')
      return binder?.allocations?.find((a: any) => a.cardId === 'card-1')?.quantity ?? 0
    })
    expect(allocatedQty.value).toBe(2)
  })
})
