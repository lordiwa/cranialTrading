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

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

import { useBindersStore } from '@/stores/binders'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

function seedBinders(store: ReturnType<typeof useBindersStore>, bindersData: Array<{
  id: string
  allocations: Array<{ cardId: string; quantity: number }>
}>) {
  for (const data of bindersData) {
    store.binders.push({
      id: data.id,
      userId: 'user-1',
      name: `Binder ${data.id}`,
      description: '',
      allocations: data.allocations.map(a => ({
        ...a,
        addedAt: new Date(),
      })),
      thumbnail: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      stats: { totalCards: 0, totalPrice: 0 },
      isPublic: true,
      forSale: true,
    })
  }
}

describe('getTotalAllocatedForCard (indexed)', () => {
  it('returns 0 for a card not in any binder', () => {
    const store = useBindersStore()
    seedBinders(store, [
      { id: 'b1', allocations: [{ cardId: 'card-A', quantity: 2 }] },
    ])
    expect(store.getTotalAllocatedForCard('card-Z')).toBe(0)
  })

  it('returns the quantity when card is in one binder', () => {
    const store = useBindersStore()
    seedBinders(store, [
      { id: 'b1', allocations: [{ cardId: 'card-A', quantity: 3 }] },
    ])
    expect(store.getTotalAllocatedForCard('card-A')).toBe(3)
  })

  it('sums quantities across multiple binders', () => {
    const store = useBindersStore()
    seedBinders(store, [
      { id: 'b1', allocations: [{ cardId: 'card-A', quantity: 2 }] },
      { id: 'b2', allocations: [{ cardId: 'card-A', quantity: 5 }] },
      { id: 'b3', allocations: [{ cardId: 'card-B', quantity: 1 }] },
    ])
    expect(store.getTotalAllocatedForCard('card-A')).toBe(7)
    expect(store.getTotalAllocatedForCard('card-B')).toBe(1)
  })

  it('handles binders with no allocations', () => {
    const store = useBindersStore()
    seedBinders(store, [
      { id: 'b1', allocations: [] },
    ])
    expect(store.getTotalAllocatedForCard('card-A')).toBe(0)
  })

  it('handles many binders efficiently (O(1) lookup)', () => {
    const store = useBindersStore()
    const binders = Array.from({ length: 100 }, (_, i) => ({
      id: `b${i}`,
      allocations: [{ cardId: 'card-A', quantity: 1 }],
    }))
    seedBinders(store, binders)
    expect(store.getTotalAllocatedForCard('card-A')).toBe(100)
  })
})
