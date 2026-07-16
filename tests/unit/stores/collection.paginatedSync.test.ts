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
  removeCardFromPublic: vi.fn().mockResolvedValue(undefined),
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
    // Sane default so the TASK-116 deferred refreshCurrentPage() (which now
    // fires after any addCard/deleteCard's debounced persist flushes) doesn't
    // hit an unmocked resolved value in tests that don't care about its result.
    mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
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

  describe('addCard / deleteCard (TASK-116 regression)', () => {
    it('deleteCard removes the card from paginatedCards immediately, without an immediate server re-query', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(true)
      // Optimistic membership patch — gone from the grid right away.
      expect(store.paginatedCards).toEqual([])
      // No immediate re-query: hitting the server card_index now would read the
      // still-stale (pre-debounce-persist) chunk and could bring the card back —
      // the same race TASK-113 fixed for updateCard.
      expect(mockQueryCardIndex).not.toHaveBeenCalled()
    })

    it('deleteCard still defers a correcting re-query until AFTER the debounced index persist flushes', async () => {
      vi.useFakeTimers()
      try {
        mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
        const store = useCollectionStore()
        const card = makeCard({ id: 'card-1' })
        store.cards = [card] as any
        store.paginatedCards = [card] as any

        await store.deleteCard('card-1')
        // Flush any dangling un-awaited microtasks (e.g. a fire-and-forget
        // refreshCurrentPage() started synchronously) WITHOUT crossing the 2s
        // persist debounce — this is what makes an immediate (un-deferred) call
        // observable here rather than by scheduling luck.
        await vi.advanceTimersByTimeAsync(0)
        expect(mockQueryCardIndex).not.toHaveBeenCalled()

        // Persist debounce (2s) fires and flushes — only THEN is the deferred
        // re-query allowed to run, per the ticket's design (re-query is still
        // conceptually necessary for membership/order, just no longer racing).
        await vi.advanceTimersByTimeAsync(2100)

        expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('deleteCard restores the paginatedCards entry (not just cards.value) if the Firestore delete fails', async () => {
      const { deleteDoc } = await import('firebase/firestore')
      vi.mocked(deleteDoc).mockRejectedValueOnce(new Error('delete failed'))

      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(false)
      expect(store.paginatedCards).toHaveLength(1)
      expect(store.paginatedCards[0].id).toBe('card-1')
      expect(store.cards).toHaveLength(1)
    })

    it('addCard shows the new card in paginatedCards immediately when on page 0 with no active filters', async () => {
      const store = useCollectionStore()
      store.paginatedCards = [] as any
      const { id: _id, updatedAt: _u, ...cardData } = makeCard({ id: 'ignored' })

      const newId = await store.addCard(cardData as any)

      expect(newId).toBe('card-1') // mockAddDoc resolves { id: 'card-1' }
      expect(store.paginatedCards).toHaveLength(1)
      expect(store.paginatedCards[0].id).toBe('card-1')
      // No immediate re-query needed — the optimistic patch already reflects it.
      expect(mockQueryCardIndex).not.toHaveBeenCalled()
    })

    it('addCard does NOT optimistically guess membership when a filter is active — relies on the deferred re-query instead', async () => {
      vi.useFakeTimers()
      try {
        mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
        const store = useCollectionStore()
        // Establish an active status filter (mirrors the user filtering the grid).
        await store.queryPage({ status: ['sale'] }, { field: 'name', direction: 'asc' }, 0)
        mockQueryCardIndex.mockClear()
        store.paginatedCards = [] as any

        const { id: _id, updatedAt: _u, ...cardData } = makeCard({ id: 'ignored', status: 'collection' })
        await store.addCard(cardData as any)

        // Can't safely guess whether the new 'collection'-status card matches the
        // active 'sale' filter without replicating the server's filter logic —
        // left empty until the deferred re-query (below) supplies the truth.
        expect(store.paginatedCards).toEqual([])
        expect(mockQueryCardIndex).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2100)
        expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('addCard still defers a correcting re-query until AFTER the debounced index persist flushes', async () => {
      vi.useFakeTimers()
      try {
        mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
        const store = useCollectionStore()
        store.paginatedCards = [] as any
        const { id: _id, updatedAt: _u, ...cardData } = makeCard({ id: 'ignored' })

        await store.addCard(cardData as any)
        await vi.advanceTimersByTimeAsync(0) // flush dangling microtasks, still short of the 2s debounce
        expect(mockQueryCardIndex).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2100)

        expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('stale in-flight persist must not consume a newer refresh (reviewer HIGH, PEDIDO #2)', () => {
    /** Minimal IndexCard-shaped record satisfying indexToCard's field access. */
    const indexRecordFor = (id: string): Record<string, unknown> => ({
      i: id, s: 'scryfall-x', n: 'Test Card', st: 'collection', q: 1, p: 1,
      cm: 0, co: [], r: 'c', t: '', f: false, sc: 'M21', e: 'Magic 2021',
      pw: '', to: '', fa: false, pm: [], kw: [], lg: [], ca: Date.now(), cn: 'NM', pb: true, df: false,
    })

    it('a slow persist-1 (in flight when persist-2 starts) must not fire the deferred refresh with its own stale snapshot', async () => {
      vi.useFakeTimers()
      try {
        // --- Seed cardIndexRaw with two cards via addCard, then flush their own persist ---
        mockAddDoc
          .mockResolvedValueOnce({ id: 'card-A' })
          .mockResolvedValueOnce({ id: 'card-B' })
        const { id: _idA, updatedAt: _uA, ...cardAData } = makeCard({ id: 'ignored-a', name: 'Card A' })
        const { id: _idB, updatedAt: _uB, ...cardBData } = makeCard({ id: 'ignored-b', name: 'Card B' })
        const store = useCollectionStore()
        await store.addCard(cardAData as any)
        await store.addCard(cardBData as any)
        await vi.advanceTimersByTimeAsync(2100) // flush the seeding persist + its own deferred refresh
        mockSetDoc.mockClear()
        mockQueryCardIndex.mockClear()

        // --- Simulate the "server" as whatever the LAST-RESOLVED setDoc call wrote ---
        let serverChunk: Array<{ i: string }> = [indexRecordFor('card-A'), indexRecordFor('card-B')]
        let resolveFirstSetDoc!: () => void
        let resolveSecondSetDoc!: () => void
        const firstSetDocGate = new Promise<void>((res) => { resolveFirstSetDoc = res })
        const secondSetDocGate = new Promise<void>((res) => { resolveSecondSetDoc = res })
        mockSetDoc
          .mockImplementationOnce(async (_ref: unknown, data: { cards: Array<{ i: string }> }) => {
            await firstSetDocGate
            serverChunk = data.cards // persist-1's write commits (STALE — still has card-B)
          })
          .mockImplementationOnce(async (_ref: unknown, data: { cards: Array<{ i: string }> }) => {
            await secondSetDocGate
            serverChunk = data.cards // persist-2's write commits (correct — empty)
          })
        mockQueryCardIndex.mockImplementation(async () => ({
          cards: serverChunk,
          total: serverChunk.length,
          page: 0,
          pageSize: 50,
          hasMore: false,
        }))

        // persist-1: delete card-A schedules its debounced persist
        await store.deleteCard('card-A')
        await vi.advanceTimersByTimeAsync(2000) // timer-1 fires — persist-1 starts, snapshot still has card-B, blocks on setDoc

        // While persist-1 is still in flight (blocked on its setDoc), delete card-B —
        // this is the ~30-sequential-setDoc multi-second window from the real 59k-card
        // case: a mutation lands and re-schedules the debounce WHILE persist-1 hasn't
        // finished writing yet.
        await store.deleteCard('card-B')
        expect(store.paginatedCards).toEqual([]) // optimistic removal already correct locally

        await vi.advanceTimersByTimeAsync(2100) // timer-2 fires — persist-2 starts, blocks on its own setDoc

        // Let persist-1 (the STALE one) finish now — its finally must NOT consume the
        // deferred-refresh flag using its own (stale) server read.
        resolveFirstSetDoc()
        await vi.advanceTimersByTimeAsync(0)
        expect(store.paginatedCards).toEqual([]) // must NOT have reverted to include card-B

        // Let persist-2 (the CURRENT one) finish — it must be the one to consume the
        // flag and issue the corrective, now-accurate re-query.
        resolveSecondSetDoc()
        await vi.advanceTimersByTimeAsync(0)

        expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
        expect(store.paginatedCards).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
