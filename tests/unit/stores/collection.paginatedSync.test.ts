/**
 * Regression tests for TASK-113: status/public toggles (individual + bulk) not
 * reflecting in the collection grid.
 *
 * Root cause: CollectionView renders `paginatedCards` (fed by the server-side
 * card_index), but updateCard/batchUpdateCards only mutated `cards.value`.
 * updateCard also fired an un-awaited refreshCurrentPage() that re-queried the
 * server card_index BEFORE the debounced (2s) index persist had written,
 * reverting the badge back to the stale value. batchUpdateCards never synced
 * the index or the paginated grid at all.
 */

// Mock Firebase BEFORE any imports that use it
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))

// Mock cloud functions
vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn(),
  buildCardIndex: vi.fn(),
  loadCollectionChunk: vi.fn(),
  loadCardPage: vi.fn(),
}))

// Mock publicCards service (imported by collection store)
vi.mock('@/services/publicCards', () => ({
  batchSyncCardsToPublic: vi.fn().mockResolvedValue(undefined),
  removeCardFromPublic: vi.fn(),
  syncAllUserCards: vi.fn(),
  syncAllUserPreferences: vi.fn(),
  syncCardToPublic: vi.fn().mockResolvedValue(undefined),
}))

// Mock scryfall cache (imported by collection store)
vi.mock('@/services/scryfallCache', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
}))

// Mock the i18n composable
vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

// Mock Firestore operations used by collection store
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue(undefined)
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'card-1' })

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: mockCommit,
  })),
}))

// Mock the auth store to provide a test user
vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      username: 'testuser',
    },
  })),
}))

// Mock the toast store
vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({
    show: vi.fn(),
  })),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore } from '@/stores/collection'
import { queryCardIndex } from '@/services/cloudFunctions'
import { makeCard } from '../helpers/fixtures'

const mockQueryCardIndex = vi.mocked(queryCardIndex)

describe('collection store: paginatedCards sync on toggle (TASK-113 regression)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
  })

  describe('updateCard', () => {
    it('patches paginatedCards optimistically (not just cards.value)', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      const ok = await store.updateCard('card-1', { status: 'sale' })

      expect(ok).toBe(true)
      expect(store.paginatedCards[0].status).toBe('sale')
    })

    it('does NOT re-query the server card_index (no more racing the debounced persist)', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      await store.updateCard('card-1', { status: 'sale' })

      // Previously updateCard fired an un-awaited refreshCurrentPage() that hit
      // queryCardIndex against the (still-stale, pre-debounce) server index and
      // reverted the optimistic patch. That call must be gone.
      expect(mockQueryCardIndex).not.toHaveBeenCalled()
      // The optimistic patch must survive — nothing reverted it.
      expect(store.paginatedCards[0].status).toBe('sale')
    })

    it('rolls back the paginatedCards patch if the Firestore write fails', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(new Error('write failed'))

      const ok = await store.updateCard('card-1', { status: 'sale' })

      expect(ok).toBe(false)
      expect(store.paginatedCards[0].status).toBe('collection')
      expect(store.cards[0].status).toBe('collection')
    })

    it('is a no-op on paginatedCards when the card is not on the current page', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      store.paginatedCards = [] as any // card lives on a different page

      const ok = await store.updateCard('card-1', { status: 'sale' })

      expect(ok).toBe(true)
      expect(store.paginatedCards).toEqual([])
      expect(store.cards[0].status).toBe('sale')
    })
  })

  describe('batchUpdateCards', () => {
    it('patches paginatedCards for every updated card id', async () => {
      const store = useCollectionStore()
      const card1 = makeCard({ id: 'card-1', status: 'collection', public: true })
      const card2 = makeCard({ id: 'card-2', status: 'collection', public: true })
      store.cards = [card1, card2] as any
      store.paginatedCards = [card1, card2] as any

      const ok = await store.batchUpdateCards(['card-1', 'card-2'], { public: false })

      expect(ok).toBe(true)
      expect(store.paginatedCards.find((c: any) => c.id === 'card-1')?.public).toBe(false)
      expect(store.paginatedCards.find((c: any) => c.id === 'card-2')?.public).toBe(false)
    })

    it('syncs the updated cards into the card_index (debounced persist fires)', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()

        // Seed cardIndexRaw the way it exists for real users who hit this bug:
        // the cards already live in a previously-built card_index. addCard's
        // syncIndexLocal('add') is the only way to populate it from the public API.
        // Each call must resolve a DISTINCT id — addCard uses docRef.id (from
        // addDoc), not the input card's stripped id, to build the stored card.
        mockAddDoc
          .mockResolvedValueOnce({ id: 'card-1' })
          .mockResolvedValueOnce({ id: 'card-2' })
          .mockResolvedValueOnce({ id: 'card-3' })
        for (const id of ['card-1', 'card-2', 'card-3']) {
          const { id: _id, updatedAt: _updatedAt, ...cardData } = makeCard({ id, status: 'collection' })
          // eslint-disable-next-line no-await-in-loop
          await store.addCard(cardData as any)
        }
        await vi.advanceTimersByTimeAsync(2100) // flush addCard's own debounced persists
        mockSetDoc.mockClear()

        store.paginatedCards = store.cards as any

        // 2+ cards updated in the SAME batch call (PEDIDO #2 — H1 regression):
        // the fix must patch card_index in a single O(n+k) pass over cardIndexRaw,
        // not one syncIndexLocal() call per card (each of which does an O(n)
        // findIndex + full-array copy — with select-all on a 59k-card index that
        // was a guaranteed multi-second freeze / Mali crash).
        await store.batchUpdateCards(['card-1', 'card-2'], { status: 'sale' })

        // Before the debounce fires, no index chunk should have been written yet
        expect(mockSetDoc).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2100)

        expect(mockSetDoc).toHaveBeenCalled()
        const [, chunkData] = mockSetDoc.mock.calls[0]
        const persisted = chunkData.cards as Array<{ i: string; st: string }>

        // Both cards in the batch landed correctly in the persisted index
        expect(persisted.find(c => c.i === 'card-1')?.st).toBe('sale')
        expect(persisted.find(c => c.i === 'card-2')?.st).toBe('sale')
        // The untouched third card must survive the rewrite unchanged — proves the
        // single-pass map preserves entries not present in the batch, rather than
        // dropping/corrupting them.
        expect(persisted.find(c => c.i === 'card-3')?.st).toBe('collection')
        expect(persisted).toHaveLength(3)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
