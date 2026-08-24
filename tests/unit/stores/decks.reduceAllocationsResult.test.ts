/**
 * TASK-281 AC4/MEDIUM-2. AC4 changed reduceAllocationsForCard's return type
 * from Promise<void> to Promise<boolean> so CardDetailModal.handleSave can
 * tell whether STEP 1 actually wrote what it needed to. The component-level
 * regression test (CardDetailModal.saveResult.test.ts) only exercises the
 * happy path plus a fully-mocked false; this file verifies the boolean
 * itself, at the store level, for the cases the reviewer named:
 *   - true: legitimate no-op (nothing to reduce)
 *   - false: wishlist-card creation failed (ensureCollectionWishlistCard -> null)
 *   - false: a deck's updateDoc rejected
 */

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-1' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/scryfallCache', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useDecksStore } from '@/stores/decks'
import { useAuthStore } from '@/stores/auth'
import { useCollectionStore } from '@/stores/collection'
import { makeCard } from '../helpers/fixtures'

function seedDeck(store: ReturnType<typeof useDecksStore>, allocations: Array<{ cardId: string; quantity: number; isInSideboard: boolean }>) {
  store.decks.push({
    id: 'deck-1', userId: 'user-1', name: 'Test Deck', format: 'modern', description: '',
    colors: [], commander: '', allocations: allocations.map(a => ({ ...a, addedAt: new Date() })),
    wishlist: [], thumbnail: '', createdAt: new Date(), updatedAt: new Date(), isPublic: false,
    stats: { totalCards: 0, sideboardCards: 0, ownedCards: 0, wishlistCards: 0, avgPrice: 0, totalPrice: 0, completionPercentage: 100 },
  } as any)
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockUpdateDoc.mockResolvedValue(undefined)
})

describe('decksStore.reduceAllocationsForCard — TASK-281 AC4 return value', () => {
  it('returns true when there is nothing to reduce (newQuantity >= totalAllocated) — legitimate no-op', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const card = makeCard({ id: 'card-1', quantity: 4, status: 'collection' })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any

    const store = useDecksStore()
    seedDeck(store, [{ cardId: 'card-1', quantity: 2, isInSideboard: false }])

    const result = await store.reduceAllocationsForCard(card, 3) // 3 >= totalAllocated(2)

    expect(result).toBe(true)
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })

  it('returns false when ensureCollectionWishlistCard fails to create the overflow wishlist card', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const card = makeCard({ id: 'card-1', quantity: 4, status: 'collection' })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    collectionStore.ensureCollectionWishlistCard = vi.fn().mockResolvedValue(null)

    const store = useDecksStore()
    seedDeck(store, [{ cardId: 'card-1', quantity: 4, isInSideboard: false }])

    const result = await store.reduceAllocationsForCard(card, 1) // 1 < totalAllocated(4)

    expect(result).toBe(false)
    expect(mockUpdateDoc).not.toHaveBeenCalled()
  })

  it('returns false when a deck updateDoc rejects', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const card = makeCard({ id: 'card-1', quantity: 4, status: 'collection' })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    collectionStore.ensureCollectionWishlistCard = vi.fn().mockResolvedValue('wish-card-1')

    const store = useDecksStore()
    seedDeck(store, [{ cardId: 'card-1', quantity: 4, isInSideboard: false }])

    mockUpdateDoc.mockRejectedValueOnce(new Error('write failed'))

    const result = await store.reduceAllocationsForCard(card, 1) // 1 < totalAllocated(4)

    expect(result).toBe(false)
  })
})
