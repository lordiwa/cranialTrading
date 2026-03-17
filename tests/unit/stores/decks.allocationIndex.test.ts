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

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

function seedDecks(store: ReturnType<typeof useDecksStore>, decksData: Array<{
  id: string
  allocations: Array<{ cardId: string; quantity: number; isInSideboard: boolean }>
}>) {
  for (const data of decksData) {
    store.decks.push({
      id: data.id,
      userId: 'user-1',
      name: `Deck ${data.id}`,
      format: 'modern',
      description: '',
      colors: [],
      commander: '',
      allocations: data.allocations.map(a => ({
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
}

describe('getTotalAllocatedForCard (indexed)', () => {
  it('returns 0 for a card not in any deck', () => {
    const store = useDecksStore()
    seedDecks(store, [
      { id: 'd1', allocations: [{ cardId: 'card-A', quantity: 2, isInSideboard: false }] },
    ])
    expect(store.getTotalAllocatedForCard('card-Z')).toBe(0)
  })

  it('returns the quantity when card is in one deck', () => {
    const store = useDecksStore()
    seedDecks(store, [
      { id: 'd1', allocations: [{ cardId: 'card-A', quantity: 4, isInSideboard: false }] },
    ])
    expect(store.getTotalAllocatedForCard('card-A')).toBe(4)
  })

  it('sums quantities across multiple decks', () => {
    const store = useDecksStore()
    seedDecks(store, [
      { id: 'd1', allocations: [{ cardId: 'card-A', quantity: 2, isInSideboard: false }] },
      { id: 'd2', allocations: [{ cardId: 'card-A', quantity: 3, isInSideboard: true }] },
    ])
    expect(store.getTotalAllocatedForCard('card-A')).toBe(5)
  })

  it('sums mainboard + sideboard in same deck', () => {
    const store = useDecksStore()
    seedDecks(store, [
      {
        id: 'd1',
        allocations: [
          { cardId: 'card-A', quantity: 3, isInSideboard: false },
          { cardId: 'card-A', quantity: 1, isInSideboard: true },
        ],
      },
    ])
    expect(store.getTotalAllocatedForCard('card-A')).toBe(4)
  })

  it('handles decks with no allocations', () => {
    const store = useDecksStore()
    seedDecks(store, [
      { id: 'd1', allocations: [] },
    ])
    expect(store.getTotalAllocatedForCard('card-A')).toBe(0)
  })

  it('handles many decks efficiently (O(1) lookup)', () => {
    const store = useDecksStore()
    const decks = Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`,
      allocations: [{ cardId: 'card-A', quantity: 2, isInSideboard: false }],
    }))
    seedDecks(store, decks)
    expect(store.getTotalAllocatedForCard('card-A')).toBe(100)
  })
})
