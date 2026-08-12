/**
 * Regression tests for TASK-223: curing "ghost" cards — card_index entries
 * whose Firestore document no longer exists. A mutation against a ghost
 * throws `not-found`; the app must self-heal (remove the ghost from every
 * in-memory place it lives + persist the index) instead of reverting the UI
 * and showing an error. See src/stores/collection.ts updateCard/deleteCard/
 * batchUpdateCards/batchDeleteCards (~lines 1277/1371/1493/1641).
 *
 * SOLO the exact Firestore error code 'not-found' may trigger the cure —
 * AC4 below asserts every OTHER code (permission-denied, unavailable,
 * deadline-exceeded, resource-exhausted, and a generic error with no code
 * at all) behaves exactly as before: rollback + error, nothing removed.
 */

// Mock Firebase BEFORE any imports that use it
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn(),
  buildCardIndex: vi.fn(),
  loadCollectionChunk: vi.fn(),
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

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue(undefined)
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'card-1' })
const mockGetDocs = vi.fn().mockResolvedValue({ empty: true, docs: [] })

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: vi.fn(),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
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

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      username: 'testuser',
    },
  })),
}))

// A single shared mock fn: the factory below used to create a NEW `vi.fn()`
// on every useToastStore() call. The store calls useToastStore() once
// internally (at store setup); a test calling useToastStore() again to grab
// `.show` got a DIFFERENT mock object with its own separate, always-empty
// call history — `expect(toastStore.show).not.toHaveBeenCalled()` was
// vacuously true no matter what the store actually did. Hoisting one shared
// mockToastShow and always returning it fixes that.
const mockToastShow = vi.fn()
vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({
    show: mockToastShow,
  })),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore, type IndexCard } from '@/stores/collection'
import { queryCardIndex } from '@/services/cloudFunctions'
import { makeCard } from '../helpers/fixtures'

const mockQueryCardIndex = vi.mocked(queryCardIndex)

/** A Firestore-shaped error carrying an exact `.code`, the only signal the cure may react to. */
const firestoreError = (code: string, message = `simulated ${code}`): Error & { code: string } => {
  const err = new Error(message) as Error & { code: string }
  err.code = code
  return err
}

const OTHER_CODES = ['permission-denied', 'unavailable', 'deadline-exceeded', 'resource-exhausted']

/** Minimal IndexCard — only the fields loadFromIndex/indexToCard actually read. */
function makeIndexCard(id: string): IndexCard {
  return {
    i: id, s: `scryfall-${id}`, n: `Card ${id}`, st: 'collection', q: 1, p: 0,
    cm: 0, co: [], r: 'c', t: 'Creature', f: false, sc: 'tst', e: 'Test Set',
    pw: '', to: '', fa: false, pm: [], kw: [], lg: [], ca: 0, cn: 'NM', pb: false,
  } as IndexCard
}

/**
 * Put a collection load IN FLIGHT (same technique as
 * collection.mutateBeforeIndexLoad.test.ts, TASK-185) and hand back the
 * release valve. Reproduces the real window: paginatedCards is already
 * painted from the server query, cardIndexRaw/cards.value are still empty.
 */
function startGatedLoad(store: ReturnType<typeof useCollectionStore>, chunkCards: IndexCard[]) {
  let release!: () => void
  const gate = new Promise<void>((res) => { release = res })
  mockGetDocs.mockImplementationOnce(async () => {
    await gate
    return {
      empty: false,
      docs: [{ id: 'chunk_0', ref: {}, data: () => ({ cards: chunkCards, count: chunkCards.length, version: 3 }) }],
    }
  })
  const loadPromise = store.loadCollection()
  return {
    finish: async () => {
      release()
      await loadPromise
    },
  }
}

describe('collection store: ghost card cure (TASK-223)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // .mockReset() (not just clearAllMocks) on the mock fns THIS file queues
    // once-implementations onto: clearAllMocks only wipes call history — any
    // unconsumed `.mockRejectedValueOnce`/`.mockResolvedValueOnce` queued by
    // a previous test (e.g. a batchUpdateCards test whose per-card updateDoc
    // fallback isn't reached yet under the pre-fix code) would otherwise
    // survive into the next test and silently swap its result. Scoped to
    // these five (not vi.resetAllMocks()) so the firebase/firestore factory's
    // other default implementations (doc/collection/getDocs/writeBatch) stay
    // intact.
    mockUpdateDoc.mockReset().mockResolvedValue(undefined)
    mockDeleteDoc.mockReset().mockResolvedValue(undefined)
    mockSetDoc.mockReset().mockResolvedValue(undefined)
    mockCommit.mockReset().mockResolvedValue(undefined)
    mockAddDoc.mockReset().mockResolvedValue({ id: 'card-1' })
    mockGetDocs.mockReset().mockResolvedValue({ empty: true, docs: [] })
    mockQueryCardIndex.mockReset()
    mockToastShow.mockReset()
  })

  describe('updateCard — AC1', () => {
    it('cures the ghost (removes from cards, cardIndex, and paginatedCards) instead of reverting, on a not-found update', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1', status: 'collection' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found', 'No document to update: .../cards/ghost-1'))

      const ok = await store.updateCard('ghost-1', { status: 'sale' })

      expect(ok).toBe(true)
      expect(store.cards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
      expect(store.paginatedCards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
    })

    it('does not show the generic updateError toast for a not-found ghost', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1' })
      store.cards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found'))

      await store.updateCard('ghost-1', { status: 'sale' })

      expect(mockToastShow).not.toHaveBeenCalled()
    })

    it('persists the cured index to Firestore (debounced)', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        // cardIndexRaw is NOT exposed on the store's return object — a direct
        // `store.cardIndexRaw = [...]` assignment is a silent no-op (dead
        // write to a stray property, not the real internal ref). Seed it for
        // real the only way a test can: run an actual (gated) load through
        // loadFromIndex, same technique as the HIGH-1 in-flight-load tests
        // below. Without this the assertion below passed for the WRONG
        // reason — the real (still-empty) cardIndexRaw trivially "doesn't
        // contain ghost-1" regardless of whether the cure did anything.
        const load = startGatedLoad(store, [makeIndexCard('ghost-1')])
        await load.finish()
        mockSetDoc.mockClear() // ignore any chunk write the load itself may have caused
        mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found'))

        await store.updateCard('ghost-1', { status: 'sale' })
        await vi.advanceTimersByTimeAsync(2100)

        expect(mockSetDoc).toHaveBeenCalled()
        const [, chunkData] = mockSetDoc.mock.calls[0]
        expect((chunkData.cards as Array<{ i: string }>).find(c => c.i === 'ghost-1')).toBeUndefined()
      } finally {
        vi.useRealTimers()
      }
    })

    it('reuses the SAME gen/timer-gated ordering as deleteCard/addCard (TASK-113/116): refreshCurrentPage() cannot run until the cure\'s own persist write has actually resolved', async () => {
      // NOTE (team-lead review, TASK-223 hand-off point 1, two iterations):
      // v1 mocked queryCardIndex to unconditionally return an empty page —
      // that only proved queryCardIndex was called at the right TIME, never
      // capable of failing from an actual resurrection. v2 tied the mocked
      // response to whatever setDoc last wrote, but let the write and the
      // query race on NATURAL microtask scheduling — verified LIVE (by
      // deliberately firing refreshCurrentPage() before the write, the same
      // mutation AC5 uses) that this is NOT reliable: queryPage() does
      // `await import(...)` before calling queryCardIndex, an extra
      // microtask hop that let the write "win" the race even with the
      // ordering guard disabled — a false negative that stayed green.
      //
      // This version gates mockSetDoc behind a promise WE control (same
      // technique as the "stale in-flight persist" tests below and in
      // collection.paginatedSync.test.ts, TASK-116 PEDIDO #2). While the gate
      // is held closed the write CANNOT have resolved, so if queryCardIndex
      // fires anyway, it is provably premature — no race, no ambiguity.
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const card = makeCard({ id: 'ghost-1' })
        store.cards = [card] as any
        store.paginatedCards = [card] as any
        const seededIndexCard = { i: 'ghost-1', s: 's1', n: 'Ghost', st: 'collection', q: 1, p: 0, cm: 0, co: [], r: 'c', t: '', f: false, sc: '', pw: '', to: '', fa: false, pm: [], kw: [], lg: [], ca: Date.now(), cn: 'NM', pb: true }
        store.cardIndexRaw = [seededIndexCard] as any

        let resolveSetDoc!: () => void
        const setDocGate = new Promise<void>((res) => { resolveSetDoc = res })
        // "Server" = whatever the write last landed. Starts WITH the ghost —
        // the pre-cure state — and only updates once the gate is released.
        let serverChunk: Array<{ i: string }> = [seededIndexCard]
        mockSetDoc.mockImplementation(async (_ref: unknown, data: { cards: Array<{ i: string }> }) => {
          await setDocGate
          serverChunk = data.cards
        })
        mockQueryCardIndex.mockImplementation(async () => ({
          cards: serverChunk,
          total: serverChunk.length,
          page: 0,
          pageSize: 50,
          hasMore: false,
        }))
        mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found'))

        await store.updateCard('ghost-1', { status: 'sale' })
        // Local cure already applied — the ghost is gone from the grid right away.
        expect(store.paginatedCards).toEqual([])

        // Debounce fires — persist starts and blocks on the (still-closed) setDoc
        // gate. The write provably has NOT landed yet, so the deferred re-query
        // must not have run either.
        await vi.advanceTimersByTimeAsync(2000)
        expect(mockQueryCardIndex).not.toHaveBeenCalled()
        expect(store.paginatedCards).toEqual([])

        // Release the gate — the write lands (server no longer has the ghost) —
        // only THEN does the deferred re-query run.
        resolveSetDoc()
        await vi.advanceTimersByTimeAsync(0)
        expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
        expect(store.paginatedCards).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('deleteCard — AC2', () => {
    it('terminates successfully (ok=true) and the card stays gone from the grid when the doc is already gone (not-found)', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(firestoreError('not-found'))

      const ok = await store.deleteCard('ghost-1')

      expect(ok).toBe(true)
      expect(store.cards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
      expect(store.paginatedCards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
    })

    it('does not restore the card on a not-found delete (unlike a genuine failure)', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1' })
      store.cards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(firestoreError('not-found'))

      await store.deleteCard('ghost-1')

      expect(store.cards).toHaveLength(0)
    })
  })

  describe('batchUpdateCards — AC3', () => {
    it('applies the update to surviving cards and cures the one ghost inside the same lot', async () => {
      const store = useCollectionStore()
      const good = makeCard({ id: 'good-1', status: 'collection' })
      const ghost = makeCard({ id: 'ghost-1', status: 'collection' })
      store.cards = [good, ghost] as any
      store.paginatedCards = [good, ghost] as any
      // Atomic batch.commit() fails because ghost-1 doesn't exist server-side.
      mockCommit.mockRejectedValueOnce(firestoreError('not-found'))
      // Fallback per-card retry: good-1 succeeds, ghost-1 fails not-found again.
      mockUpdateDoc
        .mockResolvedValueOnce(undefined) // good-1
        .mockRejectedValueOnce(firestoreError('not-found')) // ghost-1

      const ok = await store.batchUpdateCards(['good-1', 'ghost-1'], { status: 'sale' })

      expect(ok).toBe(true)
      expect(store.cards.find((c: any) => c.id === 'good-1')?.status).toBe('sale')
      expect(store.cards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
      expect(store.paginatedCards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
    })

    it('MEDIUM-1: persists the cured index and defers a corrective re-query (membership changed) — same as deleteCard/batchDeleteCards', async () => {
      vi.useFakeTimers()
      try {
        mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
        const store = useCollectionStore()
        // cardIndexRaw is not exposed on the store — seed it for real via an
        // actual (gated) load, same as the HIGH-1 tests below. A direct
        // `store.cardIndexRaw = [...]` assignment is a silent no-op.
        const load = startGatedLoad(store, [makeIndexCard('good-1'), makeIndexCard('ghost-1')])
        await load.finish()
        mockSetDoc.mockClear()
        store.paginatedCards = [makeCard({ id: 'good-1' }), makeCard({ id: 'ghost-1' })] as any
        mockCommit.mockRejectedValueOnce(firestoreError('not-found'))
        mockUpdateDoc
          .mockResolvedValueOnce(undefined) // good-1
          .mockRejectedValueOnce(firestoreError('not-found')) // ghost-1

        await store.batchUpdateCards(['good-1', 'ghost-1'], { status: 'sale' })

        // Not yet re-queried — deferred until the debounced persist settles
        // (same TASK-113/116 gate every other cure path reuses).
        await vi.advanceTimersByTimeAsync(0)
        expect(mockQueryCardIndex).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2100)
        expect(mockSetDoc).toHaveBeenCalled()
        const [, chunkData] = mockSetDoc.mock.calls[0]
        expect((chunkData.cards as Array<{ i: string }>).map(c => c.i)).toEqual(['good-1'])
        expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('batchUpdateCards ghost cure during an in-flight load (TASK-223 HIGH-1 fix)', () => {
    // Reviewer HIGH-1: the ghost branch used to write cardIndexRaw.value and
    // call persistIndexToFirestore() UNCONDITIONALLY, never consulting
    // _indexLoadInFlight (TASK-185) the way cureGhostCard/deleteCard already
    // do. During the multi-second load window cardIndexRaw is empty, so that
    // persist would set chunk_0 = {cards: [], count: 0} over the real cards
    // stored there — a NEW clobber door this ticket had not previously had.
    it('does not persist over the real index while the load is still in flight — queues the ghost instead', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const load = startGatedLoad(store, [makeIndexCard('good-1'), makeIndexCard('ghost-1')])
        store.paginatedCards = [makeCard({ id: 'good-1' }), makeCard({ id: 'ghost-1' })] as any
        mockCommit.mockRejectedValueOnce(firestoreError('not-found'))
        mockUpdateDoc
          .mockResolvedValueOnce(undefined) // good-1
          .mockRejectedValueOnce(firestoreError('not-found')) // ghost-1

        const ok = await store.batchUpdateCards(['good-1', 'ghost-1'], { status: 'sale' })
        await vi.advanceTimersByTimeAsync(2100) // past the persist debounce, in case anything got scheduled

        // Pre-fix: this would have set chunk_0 to a near-empty array over the
        // real cards actually stored there.
        expect(mockSetDoc).not.toHaveBeenCalled()
        // AC5 gap found while mutation-testing this test itself: `mockSetDoc`
        // not being called is ALSO true if the whole cure is disabled and the
        // ghost's not-found rethrows out of batchUpdateCards entirely (caught
        // by the outer try/catch, which also persists nothing) — that path
        // returns `false` and never reaches the queue-not-persist branch at
        // all, so the assertion above passed for the wrong reason too. These
        // two assertions are the actual discriminator: only the correct
        // "queued, not thrown" behavior returns true and clears the ghost
        // from paginatedCards optimistically.
        expect(ok).toBe(true)
        expect(store.paginatedCards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()

        await load.finish()
      } finally {
        vi.useRealTimers()
      }
    })

    it('the ghost cure IS applied once the load finishes — replayed against the real index, not lost', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const load = startGatedLoad(store, [makeIndexCard('good-1'), makeIndexCard('ghost-1')])
        store.paginatedCards = [makeCard({ id: 'good-1' }), makeCard({ id: 'ghost-1' })] as any
        mockCommit.mockRejectedValueOnce(firestoreError('not-found'))
        mockUpdateDoc
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(firestoreError('not-found'))

        await store.batchUpdateCards(['good-1', 'ghost-1'], { status: 'sale' })
        await load.finish()

        expect(store.cards.map((c: any) => c.id)).toEqual(['good-1'])

        await vi.advanceTimersByTimeAsync(2100)
        expect(mockSetDoc).toHaveBeenCalled()
        const [, chunkData] = mockSetDoc.mock.calls[0]
        expect((chunkData.cards as Array<{ i: string }>).map(c => c.i)).toEqual(['good-1'])
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('batchDeleteCards — AC3', () => {
    it('survives a ghost inside the batch: the lot is reported deleted, nothing is restored', async () => {
      const store = useCollectionStore()
      const good = makeCard({ id: 'good-1' })
      const ghost = makeCard({ id: 'ghost-1' })
      store.cards = [good, ghost] as any
      store.paginatedCards = [good, ghost] as any
      // The delete batch (delete-only) hits not-found because ghost-1's doc is
      // already gone — Firestore delete is idempotent, so the objective (both
      // docs absent) is already true; this must not be treated as a failure
      // requiring restore.
      //
      // PERSISTENT reject (not .mockRejectedValueOnce): commitBatchWithRetry
      // has its own internal retry loop (up to 3 attempts). With only ONE
      // rejection queued, disabling the not-found short-circuit would still
      // pass this test — attempt 2 would silently hit the default resolved
      // mock and "succeed" by retry luck, never proving the fix did anything
      // (team-lead review finding, MEDIUM-2). Persistent reject means EVERY
      // attempt sees not-found, so only the short-circuit (not exhausted
      // retries) can produce success here.
      mockCommit.mockRejectedValue(firestoreError('not-found'))

      const result = await store.batchDeleteCards(['good-1', 'ghost-1'])

      expect(result.success).toBe(true)
      expect(result.failed).toBe(0)
      expect(store.cards).toHaveLength(0)
      expect(store.paginatedCards).toHaveLength(0)
    })
  })

  describe('AC4 — only the exact not-found code triggers the cure', () => {
    it.each(OTHER_CODES)('updateCard: %s does NOT cure — rolls back and reports failure like before', async (code) => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(firestoreError(code))

      const ok = await store.updateCard('card-1', { status: 'sale' })

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
      expect(store.cards.find((c: any) => c.id === 'card-1')?.status).toBe('collection')
    })

    it('updateCard: a generic error with no code at all does NOT cure', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(new Error('some transient failure'))

      const ok = await store.updateCard('card-1', { status: 'sale' })

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
    })

    it.each(OTHER_CODES)('deleteCard: %s does NOT cure — restores the card and reports failure like before', async (code) => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(firestoreError(code))

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
    })

    it('deleteCard: a generic error with no code at all does NOT cure', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(new Error('some transient failure'))

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
    })

    it.each(OTHER_CODES)('batchUpdateCards: %s does NOT cure — the whole call reports failure, nothing removed', async (code) => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      mockCommit.mockRejectedValueOnce(firestoreError(code))

      const ok = await store.batchUpdateCards(['card-1'], { status: 'sale' })

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
      expect(store.cards.find((c: any) => c.id === 'card-1')?.status).toBe('collection')
    })

    it('batchUpdateCards: a generic error with no code at all does NOT cure (AC4/LOW-1)', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      mockCommit.mockRejectedValueOnce(new Error('some transient failure'))

      const ok = await store.batchUpdateCards(['card-1'], { status: 'sale' })

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
      expect(store.cards.find((c: any) => c.id === 'card-1')?.status).toBe('collection')
    })

    it.each(OTHER_CODES)('batchDeleteCards: %s does NOT cure — reports failure and restores the card', async (code) => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const card = makeCard({ id: 'card-1' })
        store.cards = [card] as any
        store.paginatedCards = [card] as any
        // Genuine failure codes still exhaust commitBatchWithRetry's retries
        // (up to 2 retries at 500ms apart, or a single 30s resource-exhausted
        // drain wait) — fake-timer-advance past the slowest case either way.
        mockCommit.mockRejectedValue(firestoreError(code))

        const resultPromise = store.batchDeleteCards(['card-1'])
        await vi.advanceTimersByTimeAsync(31000)
        const result = await resultPromise

        expect(result.success).toBe(false)
        expect(result.failed).toBe(1)
        expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
      } finally {
        vi.useRealTimers()
      }
    })

    it('batchDeleteCards: a generic error with no code at all does NOT cure (AC4/LOW-1)', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const card = makeCard({ id: 'card-1' })
        store.cards = [card] as any
        store.paginatedCards = [card] as any
        mockCommit.mockRejectedValue(new Error('some transient failure'))

        const resultPromise = store.batchDeleteCards(['card-1'])
        await vi.advanceTimersByTimeAsync(31000)
        const result = await resultPromise

        expect(result.success).toBe(false)
        expect(result.failed).toBe(1)
        expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
