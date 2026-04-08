/**
 * Tests for selectAllFilteredIds store action.
 *
 * This action returns all card IDs from the loaded card index,
 * optionally filtered by status. It will eventually call a Cloud Function
 * for server-side pagination, but currently works off the local index.
 */

// Mock Firebase BEFORE any imports that use it
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  setDoc: vi.fn(),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}))

vi.mock('@/services/publicCards', () => ({
  syncCardToPublic: vi.fn().mockResolvedValue(undefined),
  removeCardFromPublic: vi.fn().mockResolvedValue(undefined),
  batchSyncCardsToPublic: vi.fn().mockResolvedValue(undefined),
  syncAllUserCards: vi.fn().mockResolvedValue(undefined),
  syncAllUserPreferences: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/scryfallCache', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/utils/publicSyncFilter', () => ({
  getCardsNeedingPublicSync: vi.fn().mockReturnValue([]),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore } from '@/stores/collection'
import { useAuthStore } from '@/stores/auth'
import { makeCard } from '../helpers/fixtures'

describe('collection.selectAllFilteredIds', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    // Set up auth store with a user
    const authStore = useAuthStore()
    authStore.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      username: 'testuser',
    } as any
  })

  it('returns all card IDs when no status filter is provided', () => {
    const store = useCollectionStore()

    // Manually set cards (simulating loaded collection)
    const card1 = makeCard({ id: 'c1', status: 'collection' })
    const card2 = makeCard({ id: 'c2', status: 'sale' })
    const card3 = makeCard({ id: 'c3', status: 'trade' })
    const card4 = makeCard({ id: 'c4', status: 'wishlist' })

    // Access internal cards via the store (shallowRef)
    store.cards = [card1, card2, card3, card4] as any

    const ids = store.selectAllFilteredIds()
    expect(ids).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('returns only card IDs matching the given status filter', () => {
    const store = useCollectionStore()

    const card1 = makeCard({ id: 'c1', status: 'collection' })
    const card2 = makeCard({ id: 'c2', status: 'sale' })
    const card3 = makeCard({ id: 'c3', status: 'trade' })
    const card4 = makeCard({ id: 'c4', status: 'wishlist' })
    store.cards = [card1, card2, card3, card4] as any

    const saleIds = store.selectAllFilteredIds({ status: 'sale' })
    expect(saleIds).toEqual(['c2'])

    const wishlistIds = store.selectAllFilteredIds({ status: 'wishlist' })
    expect(wishlistIds).toEqual(['c4'])
  })

  it('returns IDs for "owned" filter (all except wishlist)', () => {
    const store = useCollectionStore()

    const card1 = makeCard({ id: 'c1', status: 'collection' })
    const card2 = makeCard({ id: 'c2', status: 'sale' })
    const card3 = makeCard({ id: 'c3', status: 'wishlist' })
    store.cards = [card1, card2, card3] as any

    const ownedIds = store.selectAllFilteredIds({ status: 'owned' })
    expect(ownedIds).toEqual(['c1', 'c2'])
  })

  it('returns IDs for "available" filter (sale + trade)', () => {
    const store = useCollectionStore()

    const card1 = makeCard({ id: 'c1', status: 'collection' })
    const card2 = makeCard({ id: 'c2', status: 'sale' })
    const card3 = makeCard({ id: 'c3', status: 'trade' })
    const card4 = makeCard({ id: 'c4', status: 'wishlist' })
    store.cards = [card1, card2, card3, card4] as any

    const ids = store.selectAllFilteredIds({ status: 'available' })
    expect(ids).toEqual(['c2', 'c3'])
  })

  it('returns empty array when no cards are loaded', () => {
    const store = useCollectionStore()
    const ids = store.selectAllFilteredIds()
    expect(ids).toEqual([])
  })

  it('returns empty array when no cards match the filter', () => {
    const store = useCollectionStore()

    const card1 = makeCard({ id: 'c1', status: 'collection' })
    store.cards = [card1] as any

    const ids = store.selectAllFilteredIds({ status: 'wishlist' })
    expect(ids).toEqual([])
  })
})
