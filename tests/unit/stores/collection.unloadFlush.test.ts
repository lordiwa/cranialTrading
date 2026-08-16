/**
 * TASK-237 AC1 (regression test, written BEFORE the fix — see the RED run
 * captured in the ticket/commit): a status-change mutation followed by the
 * JS context being destroyed (reload/navigate/close) BEFORE the 2s
 * scheduleCardIndexDeltaFlush debounce elapses must not lose the
 * card_index write.
 *
 * This reproduces the exact mechanism measured in production (TASK-237:
 * Corpses of the Lost saved because 3.5s elapsed before reload; Dreadmobile
 * was lost because the reload was immediate). The test never advances the
 * fake timer past the 2000ms debounce — that IS "reload immediately": the
 * pending delta must go out some other way, or it is gone for good (TASK-232
 * removed the client-side card_index write path this used to fall back on).
 *
 * pagehide is dispatched directly (rather than actually tearing down jsdom)
 * because that's the real signal a browser fires as a page unloads — the
 * fix is expected to listen for it (and/or visibilitychange) and flush the
 * pending deltas via a fetch(..., { keepalive: true }) beacon, since a
 * plain httpsCallable invoked from beforeunload gets cancelled by the
 * browser (TASK-237 AC2's known trap).
 */

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

const mockApplyCardIndexDelta = vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
const mockSendCardIndexDeltaBeacon = vi.fn()

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn().mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false }),
  buildCardIndex: vi.fn(),
  applyCardIndexDelta: (...args: unknown[]) => mockApplyCardIndexDelta(...args),
  sendCardIndexDeltaBeacon: (...args: unknown[]) => mockSendCardIndexDeltaBeacon(...args),
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
  getCountFromServer: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
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
    user: { id: 'test-user-id', email: 'test@example.com', username: 'testuser' },
  })),
}))

vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({ show: vi.fn() })),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore } from '@/stores/collection'
import { makeCard } from '../helpers/fixtures'

// Every describe block below creates its own store instance per test via
// useCollectionStore(). The store's pagehide/visibilitychange listeners are
// registered on the real `window`/`document` (module-scope side effect in
// collection.ts, not tied to a component), and Pinia never disposes a
// store's effect scope on its own just because a NEW pinia becomes active in
// the next test — so without an explicit $dispose() here, every previous
// test's listener stays attached to window/document and ALSO fires on the
// next test's pagehide/visibilitychange dispatch (measured: caused an extra,
// unexplained 3rd beacon call in a batch-chunking test written against this
// file before this helper existed). disposeStoreAfterEach() captures
// whichever store the test creates and stops its effect scope afterward,
// which runs the store's onScopeDispose cleanup (removing both listeners)
// before the next test starts.
function disposeStoreAfterEach() {
  let active: ReturnType<typeof useCollectionStore> | null = null
  afterEach(() => {
    active?.$dispose()
    active = null
  })
  return (store: ReturnType<typeof useCollectionStore>) => {
    active = store
    return store
  }
}

describe('collection store: TASK-237 AC1 — a mutation lost to unload before the debounce must be flushed on pagehide', () => {
  const trackStore = disposeStoreAfterEach()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes the pending server delta via a keepalive beacon when pagehide fires before the 2s debounce elapses', async () => {
    vi.useFakeTimers()

    const store = trackStore(useCollectionStore())
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    const ok = await store.updateCard('card-1', { status: 'trade' })
    expect(ok).toBe(true)

    // "Reload immediately": advance well short of the 2000ms debounce.
    await vi.advanceTimersByTimeAsync(500)

    // The normal debounced path has not had a chance to fire.
    expect(mockApplyCardIndexDelta).not.toHaveBeenCalled()

    // The page is torn down (reload/navigate/close) right now. Switch back
    // to real timers first — the flush handler resolves a dynamic import(),
    // which needs real microtask/task turns to settle, not fake-timer ticks.
    vi.useRealTimers()
    window.dispatchEvent(new Event('pagehide'))

    await vi.waitFor(() => {
      expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalled()
    })
    expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalledWith([
      { cardId: 'card-1', action: 'update' },
    ])
    // The delta went out via the beacon, not the normal debounced call —
    // there is nothing left for the (now-cancelled) 2s timer to do.
    expect(mockApplyCardIndexDelta).not.toHaveBeenCalled()
  })

  it('does nothing on pagehide when there is no pending delta (nothing to lose)', async () => {
    vi.useFakeTimers()

    const store = trackStore(useCollectionStore())
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)

    expect(mockSendCardIndexDeltaBeacon).not.toHaveBeenCalled()
  })
})

/**
 * TASK-237 M-2 (reviewer-measured gap): the AC1 tests above only ever
 * dispatch pagehide. visibilitychange->hidden is the ONLY reliable teardown
 * signal on mobile Safari (see the doc comment on _handleVisibilityHidden in
 * collection.ts) and had no test of its own — removing just that listener
 * left the suite fully green. This is the mirror of the pagehide test above,
 * dispatching visibilitychange with document.visibilityState forced to
 * 'hidden' instead.
 */
describe('collection store: TASK-237 M-2 — visibilitychange->hidden must flush too, independently of pagehide', () => {
  const trackStore = disposeStoreAfterEach()

  const setVisibilityState = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
    setVisibilityState('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    setVisibilityState('visible')
  })

  it('flushes the pending server delta via the keepalive beacon when visibilitychange fires with visibilityState hidden, before the 2s debounce elapses', async () => {
    vi.useFakeTimers()

    const store = trackStore(useCollectionStore())
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    const ok = await store.updateCard('card-1', { status: 'trade' })
    expect(ok).toBe(true)

    await vi.advanceTimersByTimeAsync(500)
    expect(mockApplyCardIndexDelta).not.toHaveBeenCalled()

    vi.useRealTimers()
    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    await vi.waitFor(() => {
      expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalled()
    })
    expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalledWith([
      { cardId: 'card-1', action: 'update' },
    ])
    expect(mockApplyCardIndexDelta).not.toHaveBeenCalled()
  })

  it('does NOT flush on a visibilitychange that leaves the tab visible (e.g. regaining focus)', async () => {
    // Real timers throughout — mirrors the M-1 test below (same file): under
    // fake timers the beacon reference preload kicked off by
    // queueCardIndexDelta (a dynamic import()) never gets a chance to
    // resolve within the test, so "the beacon was not called" would hold
    // even with the visibilityState guard deleted from production code —
    // the assertion wouldn't be discriminating between "guarded correctly"
    // and "nothing could fire regardless". Real timers plus a 50ms real
    // wait (same as M-1) let the preload actually settle first, so this
    // negative assertion means something.
    const store = trackStore(useCollectionStore())
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    const ok = await store.updateCard('card-1', { status: 'trade' })
    expect(ok).toBe(true)

    await new Promise((resolve) => { setTimeout(resolve, 50) })

    mockSendCardIndexDeltaBeacon.mockClear()
    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((resolve) => { setTimeout(resolve, 50) })

    expect(mockSendCardIndexDeltaBeacon).not.toHaveBeenCalled()

    // Drain the real 2000ms debounce this test's updateCard scheduled
    // (scheduleCardIndexDeltaFlush) instead of leaving it to fire on its own
    // real-time schedule after the test returns. onScopeDispose (triggered by
    // trackStore's afterEach $dispose()) removes the pagehide/visibilitychange
    // listeners but does NOT clear this timer — it is a plain closure-local
    // setTimeout, not tied to the effect scope — so without this wait it
    // survives store disposal and phantom-fires ~2s later, landing inside
    // whichever later test happens to be running by then and satisfying THAT
    // test's own applyCardIndexDelta/beacon expectations for the wrong
    // reason. Measured: this contaminated the M-3 "in-flight" test below
    // (reviewer-caught, TASK-237 review round r4) — that test's
    // `expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)` wait was
    // satisfied by this phantom timer ~120ms before that test's own 2000ms
    // debounce could have fired it, so the beacon merge path it exists to
    // prove (_inFlightServerDeltas) was never actually exercised in the
    // full-file run. Waiting for this test's own timer to fire for real (it
    // has nothing pending to flush by now — the debounce's own
    // applyCardIndexDelta call handles that) drains it deterministically
    // before the test ends.
    await vi.waitFor(() => {
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
    }, { timeout: 3000, interval: 50 })
  })
})

/**
 * TASK-237 M-1: the unload path must resolve the beacon synchronously once a
 * delta has already been queued earlier in the page's life —
 * queueCardIndexDelta preloads the sendCardIndexDeltaBeacon reference the
 * moment there's something to flush, so by the time an unload signal
 * actually fires there is no await/dynamic import() left standing between
 * the event and the fetch() call. A pagehide/visibilitychange handler is not
 * guaranteed to get scheduled time after an await, so this synchronicity is
 * the whole point of the fix, not an incidental detail.
 */
describe('collection store: TASK-237 M-1 — the unload flush is synchronous once the beacon reference is preloaded', () => {
  const trackStore = disposeStoreAfterEach()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
  })

  it('calls the beacon synchronously on pagehide — no pending microtask left in the unload path once preloaded', async () => {
    const store = trackStore(useCollectionStore())
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    const ok = await store.updateCard('card-1', { status: 'trade' })
    expect(ok).toBe(true)

    // Give the preload kicked off by queueCardIndexDelta (inside updateCard,
    // above) real turns to settle — this is exactly what happens for real:
    // the reference resolves seconds before any conceivable unload, not in
    // the same tick as the mutation. A single generous real-time wait
    // (rather than polling inside vi.waitFor, which would have to dispatch
    // pagehide on every retry and drain the pending queue on the first
    // successful attempt, making later retries misleading) is enough — the
    // preload is just an already-cached module's dynamic import(), not a
    // real network round trip.
    await new Promise((resolve) => { setTimeout(resolve, 50) })

    mockSendCardIndexDeltaBeacon.mockClear()
    window.dispatchEvent(new Event('pagehide'))
    // Deliberately NO await between dispatch and this assertion — if the
    // unload handler still depended on a dynamic import() (which always
    // defers by at least one microtask, even for an already-cached module),
    // this synchronous check would go red while an await-wrapped one would
    // pass.
    expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalledWith([
      { cardId: 'card-1', action: 'update' },
    ])
  })
})

/**
 * TASK-237 M-3: a batch that _runServerDeltaFlush has already pulled off
 * _pendingServerDeltas (because the 2s debounce elapsed) and is awaiting
 * applyCardIndexDelta for is invisible to the OLD flushPendingCardIndexDeltasOnUnload
 * — if the page tears down while that call is still in flight, the browser
 * cancels the non-keepalive httpsCallable fetch backing it, and the delta
 * would be lost exactly like the original TASK-237 bug, just on a narrower
 * window (debounce elapsed, RTT still pending — real seconds on slow 4G).
 */
describe('collection store: TASK-237 M-3 — an in-flight applyCardIndexDelta call must still be recoverable on unload', () => {
  const trackStore = disposeStoreAfterEach()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recovers the delta via the beacon when the page tears down while applyCardIndexDelta is still in flight', async () => {
    // Real timers throughout — no vi.useFakeTimers() in this test. Both
    // applyCardIndexDelta's wrapper (collection.ts's lazy TASK-232 wrapper)
    // and sendCardIndexDeltaBeacon's preload each resolve their own dynamic
    // import() of cloudFunctions.ts, and a dynamic import started while fake
    // timers are active does not reliably resolve while they stay fake
    // (measured while writing this test: it can silently stall, or a second
    // concurrent import() of the same specifier can bypass the module mock
    // entirely). Real timers throughout side-steps that class of flake at
    // the cost of actually waiting out the 2s debounce.

    // applyCardIndexDelta never resolves in this test — it is still
    // "in flight" for the whole test, standing in for the real RTT window
    // between the 2s debounce firing and the server actually replying.
    let releaseApplyCardIndexDelta: (() => void) | null = null
    mockApplyCardIndexDelta.mockImplementation(
      () => new Promise((resolve) => {
        releaseApplyCardIndexDelta = () => resolve({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 })
      })
    )

    const store = trackStore(useCollectionStore())
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    const ok = await store.updateCard('card-1', { status: 'trade' })
    expect(ok).toBe(true)

    // Let the 2s debounce fire for real — this pulls the batch out of
    // _pendingServerDeltas into _inFlightServerDeltas and starts the
    // (held-open) applyCardIndexDelta call.
    await vi.waitFor(() => {
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
    }, { timeout: 3000, interval: 50 })
    // Nothing left in the plain pending queue for the old code path to see.
    mockSendCardIndexDeltaBeacon.mockClear()

    // The page tears down right now, mid-call.
    window.dispatchEvent(new Event('pagehide'))

    await vi.waitFor(() => {
      expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalledWith([
        { cardId: 'card-1', action: 'update' },
      ])
    })

    // Let the held call resolve so its own finally-block runs before this
    // test (and its store's teardown) ends.
    releaseApplyCardIndexDelta?.()
    await vi.waitFor(() => {
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
    })
  }, 10000)

  it('does not re-send an already-settled call — the in-flight snapshot clears once applyCardIndexDelta resolves', async () => {
    // Real timers throughout — see the doc comment on the sibling test above
    // for why. This test holds applyCardIndexDelta open with the same
    // controlled-promise pattern as the sibling test, rather than relying on
    // its default auto-resolve, so "settled" is a moment THIS test controls
    // explicitly (release()) instead of a race against however long the
    // store's own dynamic-import-based wrapper takes to get there — once
    // release() fires, everything left in the chain (call(mutations)
    // resolving, the chunk loop finishing, the finally block clearing
    // _inFlightServerDeltas) is plain promise resolution with no further
    // import() involved, so a couple of real ticks is reliably enough.
    let release: (() => void) | null = null
    mockApplyCardIndexDelta.mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 })
      })
    )

    const store = trackStore(useCollectionStore())
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    await store.updateCard('card-1', { status: 'trade' })

    // Let the 2s debounce fire for real, pulling the batch into the
    // (held-open) applyCardIndexDelta call.
    await vi.waitFor(() => {
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
    }, { timeout: 3000, interval: 50 })

    // Now let it settle — no more dynamic import() left in this chain.
    release?.()
    await new Promise((resolve) => { setTimeout(resolve, 50) })

    mockSendCardIndexDeltaBeacon.mockClear()
    window.dispatchEvent(new Event('pagehide'))
    await new Promise((resolve) => { setTimeout(resolve, 50) })

    expect(mockSendCardIndexDeltaBeacon).not.toHaveBeenCalled()
  }, 10000)
})

/**
 * TASK-237 LOW-1: the server rejects any single applyCardIndexDelta call
 * above 500 mutations (functions/index.js) but the beacon used to send the
 * whole pending batch as one fetch — an oversized pending batch would be
 * rejected outright instead of partially applied. Verifies the unload flush
 * chunks to the same 500-per-call size _runServerDeltaFlush already uses.
 */
describe('collection store: TASK-237 LOW-1 — the unload beacon chunks to 500 mutations per call', () => {
  const trackStore = disposeStoreAfterEach()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('splits a 501-entry pending batch into two beacon calls of 500 and 1', async () => {
    vi.useFakeTimers()

    const store = trackStore(useCollectionStore())
    const cards = Array.from({ length: 501 }, (_, i) => makeCard({ id: `card-${i}`, status: 'collection' }))
    store.cards = cards as any
    store.paginatedCards = cards as any

    for (const c of cards) {
      // updateCard resolves synchronously enough under fake timers that we
      // don't need to await each one individually for queueCardIndexDelta's
      // purposes — only the LAST one needs to be awaited so the preload has
      // definitely been kicked off before we advance timers.
      // eslint-disable-next-line no-await-in-loop
      await store.updateCard(c.id, { status: 'trade' })
    }

    vi.useRealTimers()
    window.dispatchEvent(new Event('pagehide'))

    await vi.waitFor(() => {
      expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalledTimes(2)
    })
    const [firstCallArg] = mockSendCardIndexDeltaBeacon.mock.calls[0]
    const [secondCallArg] = mockSendCardIndexDeltaBeacon.mock.calls[1]
    expect(firstCallArg).toHaveLength(500)
    expect(secondCallArg).toHaveLength(1)
  })
})
