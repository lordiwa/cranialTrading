import { createPinia, setActivePinia } from 'pinia'
import { computed } from 'vue'
import { vi } from 'vitest'

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

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))

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

/**
 * SCRUM-40 — replicate the array spread fix from decks.ts in binders.ts.
 *
 * After ANY mutation of binder.allocations, binders.value must be a NEW array
 * reference and the binder slot must be replaced with a fresh object so that
 * binderAllocationTotalIndex computed re-evaluates and BinderView re-renders.
 */
describe('binders array spread fix — SCRUM-40 regressions', () => {
  describe('bulkAllocateCardsToBinder', () => {
    it('replaces binders array reference after bulk allocation', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      seedCollection(collectionStore, [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' },
        { id: 'card-2', name: 'Path', quantity: 2, price: 5, status: 'collection' },
      ])

      const decksStore = useDecksStore()
      decksStore.decks = []

      const store = useBindersStore()
      seedBinder(store, [])

      const prevRef = store.binders
      ;(updateDoc as any).mockResolvedValue(undefined)

      await store.bulkAllocateCardsToBinder('binder-1', [
        { cardId: 'card-1', quantity: 2 },
        { cardId: 'card-2', quantity: 1 },
      ])

      expect(store.binders).not.toBe(prevRef)
    })

    it('binderAllocationTotalIndex computed reflects bulk-allocated quantities', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      seedCollection(collectionStore, [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' },
      ])

      const decksStore = useDecksStore()
      decksStore.decks = []

      const store = useBindersStore()
      seedBinder(store, [])

      const totalForCard = computed(() => store.getTotalAllocatedForCard('card-1'))

      expect(totalForCard.value).toBe(0)
      ;(updateDoc as any).mockResolvedValue(undefined)

      await store.bulkAllocateCardsToBinder('binder-1', [{ cardId: 'card-1', quantity: 3 }])

      expect(totalForCard.value).toBe(3)
    })
  })

  describe('bulkDeallocateCardsFromBinder', () => {
    it('replaces binders array reference after bulk deallocation', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      seedCollection(collectionStore, [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' },
        { id: 'card-2', name: 'Path', quantity: 2, price: 5, status: 'collection' },
      ])

      const decksStore = useDecksStore()
      decksStore.decks = []

      const store = useBindersStore()
      seedBinder(store, [
        { cardId: 'card-1', quantity: 2 },
        { cardId: 'card-2', quantity: 1 },
      ])

      const prevRef = store.binders
      ;(updateDoc as any).mockResolvedValue(undefined)

      await store.bulkDeallocateCardsFromBinder('binder-1', ['card-1'])

      expect(store.binders).not.toBe(prevRef)
    })

    it('binderAllocationTotalIndex drops the removed card', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      seedCollection(collectionStore, [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' },
      ])

      const decksStore = useDecksStore()
      decksStore.decks = []

      const store = useBindersStore()
      seedBinder(store, [{ cardId: 'card-1', quantity: 3 }])

      const totalForCard = computed(() => store.getTotalAllocatedForCard('card-1'))

      expect(totalForCard.value).toBe(3)
      ;(updateDoc as any).mockResolvedValue(undefined)

      await store.bulkDeallocateCardsFromBinder('binder-1', ['card-1'])

      expect(totalForCard.value).toBe(0)
    })
  })

  describe('deallocateCard', () => {
    it('replaces binders array reference after single deallocation', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      seedCollection(collectionStore, [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' },
      ])

      const decksStore = useDecksStore()
      decksStore.decks = []

      const store = useBindersStore()
      seedBinder(store, [{ cardId: 'card-1', quantity: 2 }])

      const prevRef = store.binders
      ;(updateDoc as any).mockResolvedValue(undefined)

      await store.deallocateCard('binder-1', 'card-1')

      expect(store.binders).not.toBe(prevRef)
    })

    it('binderAllocationTotalIndex drops the removed card after single deallocation', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      seedCollection(collectionStore, [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' },
      ])

      const decksStore = useDecksStore()
      decksStore.decks = []

      const store = useBindersStore()
      seedBinder(store, [{ cardId: 'card-1', quantity: 2 }])

      const totalForCard = computed(() => store.getTotalAllocatedForCard('card-1'))

      expect(totalForCard.value).toBe(2)
      ;(updateDoc as any).mockResolvedValue(undefined)

      await store.deallocateCard('binder-1', 'card-1')

      expect(totalForCard.value).toBe(0)
    })
  })

  describe('updateAllocation', () => {
    it('replaces binders array reference after quantity update', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      seedCollection(collectionStore, [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' },
      ])

      const decksStore = useDecksStore()
      decksStore.decks = []

      const store = useBindersStore()
      seedBinder(store, [{ cardId: 'card-1', quantity: 2 }])

      const prevRef = store.binders
      ;(updateDoc as any).mockResolvedValue(undefined)

      await store.updateAllocation('binder-1', 'card-1', 3)

      expect(store.binders).not.toBe(prevRef)
    })

    it('binderAllocationTotalIndex reflects the new quantity', async () => {
      const authStore = useAuthStore()
      authStore.user = { id: 'user-1' } as any

      const collectionStore = useCollectionStore()
      seedCollection(collectionStore, [
        { id: 'card-1', name: 'Bolt', quantity: 4, price: 1, status: 'collection' },
      ])

      const decksStore = useDecksStore()
      decksStore.decks = []

      const store = useBindersStore()
      seedBinder(store, [{ cardId: 'card-1', quantity: 2 }])

      const totalForCard = computed(() => store.getTotalAllocatedForCard('card-1'))

      expect(totalForCard.value).toBe(2)
      ;(updateDoc as any).mockResolvedValue(undefined)

      await store.updateAllocation('binder-1', 'card-1', 4)

      expect(totalForCard.value).toBe(4)
    })
  })
})
