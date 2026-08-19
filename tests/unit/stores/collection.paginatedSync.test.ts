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
vi.mock('@/services/firestore', () => ({ db: {} }))

// Mock cloud functions
vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn(),
  buildCardIndex: vi.fn(),
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
  loadCollectionChunk: vi.fn(),
  loadCardPage: vi.fn(),
}))

// Mock publicCards service (imported by collection store)
vi.mock('@/services/publicCards', () => ({
  isPublicCard: vi.fn((card: any) => (card.status === 'sale' || card.status === 'trade') && card.public === true),
  scheduleIndexReconcile: vi.fn(),
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
  getCountFromServer: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
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
import { applyCardIndexDelta, queryCardIndex } from '@/services/cloudFunctions'
import { makeCard } from '../helpers/fixtures'

const mockQueryCardIndex = vi.mocked(queryCardIndex)
const mockApplyCardIndexDelta = vi.mocked(applyCardIndexDelta)

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
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
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

    it('TASK-232: syncs the updated cards via applyCardIndexDelta — no client card_index write', async () => {
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
      mockSetDoc.mockClear()
      mockApplyCardIndexDelta.mockClear()

      store.paginatedCards = store.cards as any

      // 2+ cards updated in the SAME batch call (PEDIDO #2 — H1 regression):
      // the fix must patch card_index in a single applyCardIndexDelta call,
      // not one per card.
      await store.batchUpdateCards(['card-1', 'card-2'], { status: 'sale' })

      expect(mockSetDoc).not.toHaveBeenCalled()
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
      const [mutations] = mockApplyCardIndexDelta.mock.calls[0]

      // Both cards in the batch are in the delta — the untouched third card
      // is NOT (proves the delta only carries what actually changed, rather
      // than re-sending the whole index).
      expect(mutations).toEqual(
        expect.arrayContaining([
          { cardId: 'card-1', action: 'update' },
          { cardId: 'card-2', action: 'update' },
        ])
      )
      expect(mutations).toHaveLength(2)
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

    it('TASK-232: deleteCard triggers the corrective re-query directly — no more debounce to wait for (the index delta is already awaited before the doc delete)', async () => {
      mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      await store.deleteCard('card-1')

      // No debounce left to wait out — applyCardIndexDelta was already
      // awaited (before deleteDoc), so the server index has already caught
      // up by the time deleteCard resolves. The re-query itself is fired
      // fire-and-forget (not awaited by deleteCard), behind the lazy
      // dynamic-import wrapper — wait for it rather than guessing ticks.
      await vi.waitFor(() => expect(mockQueryCardIndex).toHaveBeenCalledTimes(1))
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

  describe('batchDeleteCards (TASK-120 regression)', () => {
    it('removes the deleted cards from paginatedCards immediately for a select-all bulk delete, without an immediate server re-query', async () => {
      const store = useCollectionStore()
      const card1 = makeCard({ id: 'card-1' })
      const card2 = makeCard({ id: 'card-2' })
      const card3 = makeCard({ id: 'card-3' })
      store.cards = [card1, card2, card3] as any
      store.paginatedCards = [card1, card2, card3] as any

      const result = await store.batchDeleteCards(['card-1', 'card-2', 'card-3'])

      expect(result.success).toBe(true)
      expect(result.deleted).toBe(3)
      // Optimistic membership patch — gone from the grid right away, not just cards.value.
      expect(store.paginatedCards).toEqual([])
      // No immediate re-query: hitting the server card_index now would read the
      // still-stale (pre-debounce-persist) chunk and could bring the cards back —
      // the same TASK-113/116 race, now fixed for the bulk path too.
      expect(mockQueryCardIndex).not.toHaveBeenCalled()
    })

    it('removes only the selected subset from paginatedCards for a partial-selection bulk delete', async () => {
      const store = useCollectionStore()
      const card1 = makeCard({ id: 'card-1' })
      const card2 = makeCard({ id: 'card-2' })
      const card3 = makeCard({ id: 'card-3' })
      store.cards = [card1, card2, card3] as any
      store.paginatedCards = [card1, card2, card3] as any

      await store.batchDeleteCards(['card-1', 'card-3'])

      expect(store.paginatedCards.map((c: any) => c.id)).toEqual(['card-2'])
    })

    it('TASK-232: triggers the corrective re-query directly — no more debounce to wait for (the index delta batch is already awaited before Phase 1 deletes the docs)', async () => {
      mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
      const store = useCollectionStore()
      const card1 = makeCard({ id: 'card-1' })
      const card2 = makeCard({ id: 'card-2' })
      store.cards = [card1, card2] as any
      store.paginatedCards = [card1, card2] as any

      await store.batchDeleteCards(['card-1', 'card-2'])

      // No debounce left to wait out — applyCardIndexDelta was already
      // awaited (Phase 0, before Phase 1's doc deletes), so the server
      // index has already caught up by the time batchDeleteCards resolves.
      await vi.waitFor(() => expect(mockQueryCardIndex).toHaveBeenCalledTimes(1))
    })

    it('restores the paginatedCards AND cards.value entries for cards whose Firestore delete permanently fails (symmetric rollback)', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const card1 = makeCard({ id: 'card-1' })
        const card2 = makeCard({ id: 'card-2' })
        store.cards = [card1, card2] as any
        store.paginatedCards = [card1, card2] as any

        // Every writeBatch.commit() attempt fails — commitBatchWithRetry
        // exhausts its retries (2 retries, 500ms backgroundSafeDelay between)
        // and reports the chunk as failed.
        mockCommit.mockRejectedValue(new Error('write failed'))

        const resultPromise = store.batchDeleteCards(['card-1', 'card-2'])
        await vi.advanceTimersByTimeAsync(1500) // flush the 2 internal retry delays
        const result = await resultPromise

        expect(result.success).toBe(false)
        expect(result.failed).toBe(2)
        // Symmetric rollback — both the raw collection AND the paginated grid
        // must restore the cards that were never actually deleted.
        expect(store.cards.map((c: any) => c.id).sort()).toEqual(['card-1', 'card-2'])
        expect(store.paginatedCards.map((c: any) => c.id).sort()).toEqual(['card-1', 'card-2'])
      } finally {
        vi.useRealTimers()
      }
    })

    it('only restores paginatedCards entries that were on the current page before the failed delete (no-op for ids never displayed)', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const card1 = makeCard({ id: 'card-1' })
        const card2 = makeCard({ id: 'card-2' }) // not on the currently displayed page
        store.cards = [card1, card2] as any
        store.paginatedCards = [card1] as any // only card-1 is visible on this page

        mockCommit.mockRejectedValue(new Error('write failed'))

        const resultPromise = store.batchDeleteCards(['card-1', 'card-2'])
        await vi.advanceTimersByTimeAsync(1500)
        const result = await resultPromise

        expect(result.failed).toBe(2)
        expect(store.cards.map((c: any) => c.id).sort()).toEqual(['card-1', 'card-2'])
        // card-2 was never in paginatedCards to begin with — restoring must not introduce it.
        expect(store.paginatedCards.map((c: any) => c.id)).toEqual(['card-1'])
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('batchDeleteCards public_cards cleanup on partial failure (TASK-125 regression)', () => {
    it('does not delete the public_cards doc for a sale/trade card whose Phase 1 collection delete permanently failed', async () => {
      vi.useFakeTimers()
      try {
        const { doc } = await import('firebase/firestore')
        const mockDoc = vi.mocked(doc)
        const store = useCollectionStore()

        // 201 cards forces the internal BATCH_SIZE=200 chunking into two Phase 1
        // chunks: chunk0 = card-0..card-199 (succeeds), chunk1 = card-200 (fails
        // permanently after exhausting retries). card-0 and card-200 are both
        // sale-status so both are candidates for the public_cards Phase 2 cleanup.
        const allCards = Array.from({ length: 201 }, (_, i) =>
          makeCard({ id: `card-${i}`, status: i === 0 || i === 200 ? 'sale' : 'collection' })
        )
        store.cards = allCards as any
        store.paginatedCards = [] as any

        mockCommit
          .mockResolvedValueOnce(undefined) // chunk0 (200 ids) — succeeds first try
          .mockRejectedValueOnce(new Error('write failed')) // chunk1 (card-200) attempt 1
          .mockRejectedValueOnce(new Error('write failed')) // chunk1 attempt 2
          .mockRejectedValueOnce(new Error('write failed')) // chunk1 attempt 3 — exhausted
          .mockResolvedValue(undefined) // Phase 2 public_cards batch(es)

        const cardIds = allCards.map(c => c.id)
        const resultPromise = store.batchDeleteCards(cardIds)
        await vi.advanceTimersByTimeAsync(3000) // flush inter-chunk delay + retry backoffs
        const result = await resultPromise

        expect(result.failed).toBe(1)
        // card-200's collection delete failed permanently — it must be restored
        // locally, and its public_cards listing must survive (still exists in
        // Firestore since Phase 1 never removed the collection doc).
        expect(store.cards.some((c: any) => c.id === 'card-200')).toBe(true)

        const publicCardsDeletes = mockDoc.mock.calls
          .filter(args => args[1] === 'public_cards')
          .map(args => args[2])
        expect(publicCardsDeletes).toContain('test-user-id_card-0')
        expect(publicCardsDeletes).not.toContain('test-user-id_card-200')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('batchUpdateCards membership parity (TASK-120 AC4)', () => {
    it('does NOT trigger a deferred re-query — status changes patch paginatedCards in place like updateCard, matching established precedent', async () => {
      vi.useFakeTimers()
      try {
        mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
        const store = useCollectionStore()
        const card1 = makeCard({ id: 'card-1', status: 'collection' })
        store.cards = [card1] as any
        store.paginatedCards = [card1] as any

        await store.batchUpdateCards(['card-1'], { status: 'sale' })
        await vi.advanceTimersByTimeAsync(2100) // flush the debounced index persist too

        // Same as updateCard (TASK-113): the optimistic in-place patch is
        // considered sufficient; batchUpdateCards never schedules a membership
        // re-query, so a stale server card_index can never revert the patch.
        expect(mockQueryCardIndex).not.toHaveBeenCalled()
        expect(store.paginatedCards[0].status).toBe('sale')
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

    // TASK-232: these two locks used to drive the race via TWO deleteCard
    // calls. deleteCard no longer goes through the debounced client
    // persist/gen-token mechanism at all (it awaits applyCardIndexDelta
    // directly and refreshes right after) — but the mechanism itself
    // (_doPersistIndex/_runPersistLoop's gen-token + _persistRunning guard,
    // and the deferred _pendingMembershipRefresh consumption) is still live
    // code: addCard (out of TASK-232's scope) still drives it. Re-pointed to
    // TWO ADDITIONAL addCard calls per the team-lead's "re-apuntalar, no
    // borrar" rule — same race (a slow, now-stale persist must not consume
    // the deferred refresh ahead of the persist that reflects the newest
    // state), same protection, different trigger.
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
            serverChunk = data.cards // persist-1's write commits (STALE — missing card-D)
          })
          .mockImplementationOnce(async (_ref: unknown, data: { cards: Array<{ i: string }> }) => {
            await secondSetDocGate
            serverChunk = data.cards // persist-2's write commits (correct — has card-D)
          })
        mockQueryCardIndex.mockImplementation(async () => ({
          cards: serverChunk,
          total: serverChunk.length,
          page: 0,
          pageSize: 50,
          hasMore: false,
        }))

        // persist-1: add card-C schedules its debounced persist
        mockAddDoc.mockResolvedValueOnce({ id: 'card-C' })
        const { id: _idC, updatedAt: _uC, ...cardCData } = makeCard({ id: 'ignored-c', name: 'Card C' })
        await store.addCard(cardCData as any)
        await vi.advanceTimersByTimeAsync(2000) // timer-1 fires — persist-1 starts, snapshot missing card-D, blocks on setDoc

        // While persist-1 is still in flight (blocked on its setDoc), add card-D —
        // this is the ~30-sequential-setDoc multi-second window from the real 59k-card
        // case: a mutation lands and re-schedules the debounce WHILE persist-1 hasn't
        // finished writing yet.
        mockAddDoc.mockResolvedValueOnce({ id: 'card-D' })
        const { id: _idD, updatedAt: _uD, ...cardDData } = makeCard({ id: 'ignored-d', name: 'Card D' })
        await store.addCard(cardDData as any)

        await vi.advanceTimersByTimeAsync(2100) // timer-2 fires — persist-2 starts, blocks on its own setDoc

        // Let persist-1 (the STALE one) finish now — its finally must NOT consume the
        // deferred-refresh flag using its own (stale) server read.
        resolveFirstSetDoc()
        await vi.advanceTimersByTimeAsync(0)
        expect(mockQueryCardIndex).not.toHaveBeenCalled() // must NOT have fired off the stale persist

        // Let persist-2 (the CURRENT one) finish — it must be the one to consume the
        // flag and issue the corrective, now-accurate re-query.
        resolveSecondSetDoc()
        await vi.advanceTimersByTimeAsync(0)

        expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('a second mutation landing in the last <2s of persist-1 (timer-2 SCHEDULED but not yet FIRED) must also block persist-1 from consuming the flag (reviewer HIGH, PEDIDO #3 — latest-STARTED is not latest-SCHEDULED)', async () => {
      // GOTCHA (reviewer): prime the dynamic import refreshCurrentPage()/queryPage()
      // use internally BEFORE enabling fake timers — otherwise its resolution can
      // straddle real vs fake timers and land after this test's assertions run,
      // making the test pass for the wrong reason.
      await import('@/services/cloudFunctions')

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
        await vi.advanceTimersByTimeAsync(2100)
        mockSetDoc.mockClear()
        mockQueryCardIndex.mockClear()

        let serverChunk: Array<{ i: string }> = [indexRecordFor('card-A'), indexRecordFor('card-B')]
        let resolveFirstSetDoc!: () => void
        const firstSetDocGate = new Promise<void>((res) => { resolveFirstSetDoc = res })
        mockSetDoc
          .mockImplementationOnce(async (_ref: unknown, data: { cards: Array<{ i: string }> }) => {
            await firstSetDocGate
            serverChunk = data.cards // persist-1's write commits (STALE — missing card-D)
          })
          .mockImplementation(async (_ref: unknown, data: { cards: Array<{ i: string }> }) => {
            serverChunk = data.cards // persist-2+ resolve immediately with correct data
          })
        mockQueryCardIndex.mockImplementation(async () => ({
          cards: serverChunk,
          total: serverChunk.length,
          page: 0,
          pageSize: 50,
          hasMore: false,
        }))

        mockAddDoc.mockResolvedValueOnce({ id: 'card-C' })
        const { id: _idC, updatedAt: _uC, ...cardCData } = makeCard({ id: 'ignored-c', name: 'Card C' })
        await store.addCard(cardCData as any)
        await vi.advanceTimersByTimeAsync(2000) // timer-1 fires — persist-1 starts, blocks on setDoc

        // Second mutation lands DURING persist-1's writes — this SCHEDULES timer-2
        // but does NOT fire it (matches PEDIDO #3's exact gap: the mutation falls
        // in the last <2s of persist-1's writes, so timer-2 is still pending).
        mockAddDoc.mockResolvedValueOnce({ id: 'card-D' })
        const { id: _idD, updatedAt: _uD, ...cardDData } = makeCard({ id: 'ignored-d', name: 'Card D' })
        await store.addCard(cardDData as any)

        // Resolve persist-1's setDoc gate NOW — BEFORE advancing past timer-2's
        // debounce window. gen still matches _persistGen (persist-2 hasn't STARTED
        // yet, only scheduled) — the gen-token alone would wrongly let this consume
        // the flag using persist-1's own stale server read.
        resolveFirstSetDoc()
        await vi.advanceTimersByTimeAsync(0)

        // Must NOT have refreshed: a timer is still PENDING (_indexPersistTimer
        // !== null), which must also supersede a stale persist.
        expect(mockQueryCardIndex).not.toHaveBeenCalled()

        // Now let timer-2 actually fire and persist-2 run to completion.
        await vi.advanceTimersByTimeAsync(2100)

        expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
