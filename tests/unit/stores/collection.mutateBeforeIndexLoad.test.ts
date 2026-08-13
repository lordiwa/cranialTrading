/**
 * Regression tests for TASK-185: deleting a card right after opening
 * /collection did nothing at all — no delete, no error, no toast.
 *
 * Root cause: the grid renders `paginatedCards`, which is fed by the server-side
 * card_index query and arrives almost immediately (TASK-153 deliberately
 * decoupled it from loadCollection). `cards.value`, on the other hand, is only
 * assigned at the END of loadFromIndex, after all ~30 index chunks have been
 * read and mapped. Between those two moments the user can see cards and act on
 * them — and `deleteCard` opened with
 *
 *     const cardIndex = cards.value.findIndex(c => c.id === cardId)
 *     if (cardIndex === -1 || !deletedCard) return false
 *
 * so every delete in that window was a silent no-op. CollectionView.handleDelete
 * only toasts on `true`, so nothing surfaced. The bigger the collection, the
 * wider the window; on a 190k-card account it is many seconds.
 *
 * The bulk path (`batchDeleteCards`) never had the gate — it deletes the ids it
 * is given — which is why bulk delete worked and single delete did not.
 *
 * Second defect found while tracing the first, same window, worse consequence:
 * any mutation that reaches `persistIndexToFirestore()` before the index has
 * loaded persists whatever `cardIndexRaw` holds at that moment — an empty or
 * near-empty array — as the WHOLE index, overwriting chunk_0 (2000 real cards)
 * with one entry. So mutations landing in this window must not derive index
 * state from an unloaded index; they queue and are applied once the real index
 * arrives.
 */

// Mock Firebase BEFORE any imports that use it
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

const mockBuildCardIndex = vi.fn().mockResolvedValue({ totalCards: 0, chunks: 0 })
const mockQueryCardIndex = vi.fn().mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
const mockLoadCollectionChunk = vi.fn()

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: (...args: unknown[]) => mockQueryCardIndex(...args),
  buildCardIndex: (...args: unknown[]) => mockBuildCardIndex(...args),
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
  loadCollectionChunk: (...args: unknown[]) => mockLoadCollectionChunk(...args),
  loadCardPage: vi.fn(),
}))

vi.mock('@/services/publicCards', () => ({
  batchSyncCardsToPublic: vi.fn().mockResolvedValue(undefined),
  removeCardFromPublic: vi.fn().mockResolvedValue(undefined),
  syncAllUserCards: vi.fn(),
  syncAllUserPreferences: vi.fn(),
  syncCardToPublic: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/scryfallCache', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

const mockGetDocs = vi.fn()
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-card' })

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  getCountFromServer: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com', username: 'testuser' },
  })),
}))

vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({ show: vi.fn() })),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore, type IndexCard } from '@/stores/collection'
import { makeCard } from '../helpers/fixtures'

/** Minimal IndexCard — only the fields loadFromIndex/indexToCard actually read. */
function makeIndexCard(id: string): IndexCard {
  return {
    i: id, s: `scryfall-${id}`, n: `Card ${id}`, st: 'collection', q: 1, p: 0,
    cm: 0, co: [], r: 'c', t: 'Creature', f: false, sc: 'tst', e: 'Test Set',
    pw: '', to: '', fa: false, pm: [], kw: [], lg: [], ca: 0, cn: 'NM', pb: false,
  } as IndexCard
}

function chunkDoc(id: string, cards: IndexCard[]) {
  return {
    id,
    ref: { path: `users/test-user-id/card_index/${id}` },
    data: () => ({ cards, count: cards.length, version: 3 }),
  }
}

function snapshotOf(docs: ReturnType<typeof chunkDoc>[]) {
  return { empty: docs.length === 0, docs, size: docs.length }
}

/**
 * Put a collection load IN FLIGHT and hand back the release valve.
 *
 * This is the real window and it matters that the test reproduces it rather
 * than faking an empty `cards.value`: CollectionView calls loadCollection() on
 * mount, and the whole bug lives between "the grid is painted from the server
 * index" and "loadFromIndex assigns cards.value / cardIndexRaw at the end".
 */
function startGatedLoad(store: ReturnType<typeof useCollectionStore>, chunks: IndexCard[]) {
  let release!: () => void
  const gate = new Promise<void>((res) => { release = res })
  mockGetDocs.mockImplementationOnce(async () => {
    await gate
    return snapshotOf([chunkDoc('chunk_0', chunks)])
  })
  const loadPromise = store.loadCollection()
  return {
    finish: async () => {
      release()
      await loadPromise
    },
  }
}

/** card_index chunk writes only — ignores any other setDoc target. */
function indexChunkWrites() {
  return mockSetDoc.mock.calls.filter(([ref]) =>
    typeof (ref as { path?: string })?.path === 'string' &&
    (ref as { path: string }).path.includes('card_index')
  )
}

describe('collection store: mutating BEFORE the card_index has loaded (TASK-185)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocs.mockResolvedValue(snapshotOf([]))
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'new-card' })
    mockBuildCardIndex.mockResolvedValue({ totalCards: 0, chunks: 0 })
    mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
    mockLoadCollectionChunk.mockReset()
  })

  describe('deleteCard', () => {
    it('deletes the card even though loadCollection has not populated cards.value yet', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      // Exactly the state the user sees: the grid (paginatedCards) is already
      // painted from the server index, the full in-memory index is not in yet.
      store.cards = [] as never
      store.paginatedCards = [card] as never

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(true)
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
      const [ref] = mockDeleteDoc.mock.calls[0] as [{ path: string }]
      expect(ref.path).toBe('users/test-user-id/cards/card-1')
      // ...and it leaves the grid, like any other successful delete.
      expect(store.paginatedCards).toEqual([])
    })

    it('does not overwrite the stored card_index while the load is still in flight', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const load = startGatedLoad(store, [makeIndexCard('card-1'), makeIndexCard('card-2')])
        store.paginatedCards = [makeCard({ id: 'card-1' })] as never

        await store.deleteCard('card-1')
        await vi.advanceTimersByTimeAsync(2100) // past the persist debounce

        // cardIndexRaw is still empty here — persisting it would write chunk_0
        // as a 0/1-entry array over the 2000 real cards stored there.
        expect(indexChunkWrites()).toHaveLength(0)

        await load.finish()
      } finally {
        vi.useRealTimers()
      }
    })

    it('the deleted card does not come back when the load finishes with the pre-delete index', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        // The server still holds the card — this load started before the delete.
        const load = startGatedLoad(store, [makeIndexCard('card-1'), makeIndexCard('card-2')])
        store.paginatedCards = [makeCard({ id: 'card-1' })] as never

        await store.deleteCard('card-1')
        await load.finish()

        expect(store.cards.map(c => c.id)).toEqual(['card-2'])
        expect(store.paginatedCards.map((c: { id: string }) => c.id)).toEqual([])

        await vi.advanceTimersByTimeAsync(2100)

        const writes = indexChunkWrites()
        expect(writes.length).toBeGreaterThan(0)
        const persisted = (writes[0]?.[1] as { cards: IndexCard[] }).cards
        expect(persisted.map(c => c.i)).toEqual(['card-2'])
      } finally {
        vi.useRealTimers()
      }
    })

    it('still reports failure and restores the grid when the Firestore delete fails', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [] as never
      store.paginatedCards = [card] as never
      mockDeleteDoc.mockRejectedValueOnce(new Error('delete failed'))

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(false)
      expect(store.paginatedCards.map((c: { id: string }) => c.id)).toEqual(['card-1'])
    })

    it('returns false for an id that exists nowhere (no card to delete)', async () => {
      const store = useCollectionStore()
      store.cards = [] as never
      store.paginatedCards = [] as never

      const ok = await store.deleteCard('never-existed')

      expect(ok).toBe(false)
      expect(mockDeleteDoc).not.toHaveBeenCalled()
    })
  })

  describe('addCard', () => {
    it('does not persist a one-card card_index over the real one while the load is in flight', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const load = startGatedLoad(store, [makeIndexCard('card-2')])
        const { id: _id, updatedAt: _u, ...cardData } = makeCard({ id: 'ignored' })

        await store.addCard(cardData as never)
        await vi.advanceTimersByTimeAsync(2100)

        // Persisting here would set chunk_0 = [the new card] and destroy the
        // 2000 cards actually stored there.
        expect(indexChunkWrites()).toHaveLength(0)

        await load.finish()
      } finally {
        vi.useRealTimers()
      }
    })

    it('lands the new card in the index once the load finishes', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const load = startGatedLoad(store, [makeIndexCard('card-2')])
        const { id: _id, updatedAt: _u, ...cardData } = makeCard({ id: 'ignored' })

        await store.addCard(cardData as never)
        await load.finish()
        await vi.advanceTimersByTimeAsync(2100)

        expect(store.cards.map(c => c.id).sort()).toEqual(['card-2', 'new-card'])
        const writes = indexChunkWrites()
        expect(writes.length).toBeGreaterThan(0)
        const persisted = (writes[0]?.[1] as { cards: IndexCard[] }).cards
        expect(persisted.map(c => c.i).sort()).toEqual(['card-2', 'new-card'])
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('loadCollection FAILS entirely (TASK-219 HIGH-2)', () => {
    /**
     * Gate the FULL-CARDS fallback path (loadFromIndex already returned false
     * because the index doesn't exist) and hand back a `fail()` that rejects
     * it, so `loadCollection`'s own try/catch runs with `cardIndexRaw` left
     * empty/stale — exactly the state that used to get persisted as the
     * "whole" index over the real one.
     */
    function startGatedFullCardsFailure(store: ReturnType<typeof useCollectionStore>) {
      let reject!: (e: Error) => void
      const gate = new Promise<never>((_res, rej) => { reject = rej })
      gate.catch(() => {}) // the `fail()`/loadPromise chain below is the real consumer; this just silences the unhandled-rejection warning on `gate` itself
      mockLoadCollectionChunk.mockImplementationOnce(async () => gate)
      const loadPromise = store.loadCollection()
      return {
        fail: async (message = 'full load failed') => {
          reject(new Error(message))
          await loadPromise.catch(() => {}) // loadCollection itself never rejects — it catches internally
        },
      }
    }

    it('a mutation queued while the load is in flight is NOT replayed/persisted once the load fails', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const load = startGatedFullCardsFailure(store)
        store.paginatedCards = [makeCard({ id: 'card-1' })] as never

        // Lands while _indexLoadInFlight is still true -> queued, not applied.
        await store.deleteCard('card-1')
        expect(mockDeleteDoc).toHaveBeenCalledTimes(1) // the Firestore doc delete itself still happens
        expect(indexChunkWrites()).toHaveLength(0) // queued, no persist attempted yet

        await load.fail()
        await vi.advanceTimersByTimeAsync(2100) // past the persist debounce, in case anything got scheduled

        // Pre-fix: the `finally` ran `applyPendingIndexMutations()` unconditionally,
        // which would filter the (empty) cardIndexRaw and persist chunk_0 as a
        // near-empty index. Post-fix: a failed load must not replay/persist at all.
        expect(indexChunkWrites()).toHaveLength(0)
      } finally {
        vi.useRealTimers()
      }
    })

    it('a mutation that resolves AFTER the failed load\'s finally still queues instead of persisting over the stale index', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const load = startGatedFullCardsFailure(store)
        await load.fail()

        // The load is fully settled now (loading.value is false). Without the
        // fix, `_indexLoadInFlight` would already be false too, so this next
        // mutation's `syncIndexOrQueue` would persist immediately against the
        // still-empty `cardIndexRaw` — a second, independent path to the same
        // corruption (the reviewer's "segundo camino").
        store.paginatedCards = [makeCard({ id: 'card-2' })] as never
        await store.deleteCard('card-2')
        await vi.advanceTimersByTimeAsync(2100)

        expect(indexChunkWrites()).toHaveLength(0)
      } finally {
        vi.useRealTimers()
      }
    })

    it('queued mutations from a failed load are picked up by the next SUCCESSFUL load, not lost', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const failedLoad = startGatedFullCardsFailure(store)
        store.paginatedCards = [makeCard({ id: 'card-1' })] as never
        await store.deleteCard('card-1')
        await failedLoad.fail()

        // A real retry (e.g. the user revisits /collection) succeeds this time.
        const retry = startGatedLoad(store, [makeIndexCard('card-1'), makeIndexCard('card-2')])
        await retry.finish()

        // The queued delete replays against the now-real index.
        expect(store.cards.map(c => c.id)).toEqual(['card-2'])

        await vi.advanceTimersByTimeAsync(2100)
        const writes = indexChunkWrites()
        expect(writes.length).toBeGreaterThan(0)
        const persisted = (writes[0]?.[1] as { cards: IndexCard[] }).cards
        expect(persisted.map(c => c.i)).toEqual(['card-2'])
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
