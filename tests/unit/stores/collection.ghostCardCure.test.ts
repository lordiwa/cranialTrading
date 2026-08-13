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
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
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
import { applyCardIndexDelta, queryCardIndex } from '@/services/cloudFunctions'
import { makeCard } from '../helpers/fixtures'

const mockQueryCardIndex = vi.mocked(queryCardIndex)
const mockApplyCardIndexDelta = vi.mocked(applyCardIndexDelta)

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
    mockApplyCardIndexDelta.mockReset().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
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

    it('TASK-232: cures the index via applyCardIndexDelta instead of a client card_index write', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found'))

      await store.updateCard('ghost-1', { status: 'sale' })
      // cureGhostCard fires the delta fire-and-forget, behind the lazy
      // dynamic import wrapper (an extra, not-precisely-countable microtask
      // hop) — wait for it rather than guessing a tick count.
      await vi.waitFor(() => expect(mockApplyCardIndexDelta).toHaveBeenCalled())

      expect(mockSetDoc).not.toHaveBeenCalled()
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'ghost-1', action: 'delete' }])
    })

    it('reuses the SAME "wait for the server call to settle before refreshing" discipline as deleteCard/addCard (TASK-113/116), now anchored on applyCardIndexDelta instead of setDoc', async () => {
      // NOTE (team-lead review, TASK-223 hand-off point 1, two iterations):
      // v1 mocked queryCardIndex to unconditionally return an empty page —
      // that only proved queryCardIndex was called at the right TIME, never
      // capable of failing from an actual resurrection. v2 tied the mocked
      // response to whatever the write last landed, but let the write and
      // the query race on NATURAL microtask scheduling — verified LIVE that
      // this is NOT reliable: queryPage() does `await import(...)` before
      // calling queryCardIndex, an extra microtask hop that let the write
      // "win" the race even with the ordering guard disabled — a false
      // negative that stayed green.
      //
      // TASK-232: the write moved from a debounced client setDoc to
      // applyCardIndexDelta, and the ordering guarantee moved with it —
      // cureGhostCard chains refreshCurrentPage() off THAT call's own
      // settlement (.finally()), not off a shared gen-token/debounce timer.
      // This version gates the MOCKED applyCardIndexDelta behind a promise
      // WE control. While the gate is held closed the delta CANNOT have
      // resolved, so if queryCardIndex fires anyway, it is provably
      // premature — no race, no ambiguity.
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      let resolveDelta!: () => void
      const deltaGate = new Promise<void>((res) => { resolveDelta = res })
      mockApplyCardIndexDelta.mockImplementationOnce(async () => {
        await deltaGate
        return { applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 1 }
      })
      mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
      mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found'))

      await store.updateCard('ghost-1', { status: 'sale' })
      // Local cure already applied — the ghost is gone from the grid right away.
      expect(store.paginatedCards).toEqual([])

      // Wait until the (gated-closed) delta call has actually been INVOKED —
      // it provably has NOT resolved yet (the gate is still held), so the
      // deferred re-query must not have run either.
      await vi.waitFor(() => expect(mockApplyCardIndexDelta).toHaveBeenCalled())
      expect(mockQueryCardIndex).not.toHaveBeenCalled()

      // Release the gate — the delta call resolves — only THEN does the
      // deferred re-query run.
      resolveDelta()
      await vi.waitFor(() => expect(mockQueryCardIndex).toHaveBeenCalledTimes(1))
      expect(store.paginatedCards).toEqual([])
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

    it('MEDIUM-1 (TASK-232): cures via applyCardIndexDelta and defers a corrective re-query (membership changed) — same discipline as deleteCard/batchDeleteCards, no client card_index write', async () => {
      const store = useCollectionStore()
      const load = startGatedLoad(store, [makeIndexCard('good-1'), makeIndexCard('ghost-1')])
      await load.finish()
      mockSetDoc.mockClear()
      mockApplyCardIndexDelta.mockClear()
      mockQueryCardIndex.mockClear()
      store.paginatedCards = [makeCard({ id: 'good-1' }), makeCard({ id: 'ghost-1' })] as any
      mockCommit.mockRejectedValueOnce(firestoreError('not-found'))
      mockUpdateDoc
        .mockResolvedValueOnce(undefined) // good-1
        .mockRejectedValueOnce(firestoreError('not-found')) // ghost-1

      let resolveDelta!: () => void
      const deltaGate = new Promise<void>((res) => { resolveDelta = res })
      // Gate the GHOST's delta call specifically (the 2nd applyCardIndexDelta
      // invocation: good-1's update patch happens first, inside the
      // per-chunk loop, before the ghost-handling block runs).
      let deltaCallCount = 0
      mockApplyCardIndexDelta.mockImplementation(async (mutations) => {
        deltaCallCount++
        if (mutations.some(m => m.action === 'delete')) {
          await deltaGate
        }
        return { applied: mutations.length, skipped: 0, skippedIds: [], fallbackUsed: 0 }
      })
      mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })

      await store.batchUpdateCards(['good-1', 'ghost-1'], { status: 'sale' })

      expect(mockSetDoc).not.toHaveBeenCalled()
      // good-1's update patch is awaited inline inside batchUpdateCards, so
      // it's already landed by the time the call above resolves.
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'good-1', action: 'update' }])

      // The ghost-1 delete patch is fire-and-forget behind the lazy dynamic
      // import wrapper — wait for it to actually be invoked.
      await vi.waitFor(() => expect(deltaCallCount).toBe(2))
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'ghost-1', action: 'delete' }])

      // Not yet re-queried — deferred until the ghost's delta call settles
      // (still gated closed).
      expect(mockQueryCardIndex).not.toHaveBeenCalled()

      resolveDelta()
      await vi.waitFor(() => expect(mockQueryCardIndex).toHaveBeenCalledTimes(1))
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
