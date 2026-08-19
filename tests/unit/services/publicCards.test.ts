/**
 * Unit tests for the public_cards sync writers (TASK-085).
 *
 * Regression: `searchPublicCards` (publicCardSearch.ts) queries `cardNameLower`
 * but none of the three writers here (syncCardToPublic, batchSyncCardsToPublic,
 * syncAllUserCards) ever wrote that field, so the "Other users" search silently
 * returned []. These tests lock the field into every write payload.
 *
 * Also locks the pre-existing (and still required) invariant that these
 * writers NEVER publish a 'collection' or 'wishlist' status card, or a card
 * with public !== true — public_cards must stay safe-by-construction now
 * that TASK-085 opens it to anonymous reads.
 */

import { vi } from 'vitest'
import { makeCard } from '../helpers/fixtures'

const setDocMock = vi.fn().mockResolvedValue(undefined)
const deleteDocMock = vi.fn().mockResolvedValue(undefined)
const docMock = vi.fn((_db: unknown, col: string, id: string) => ({ col, id }))
const getDocsMock = vi.fn().mockResolvedValue({ docs: [] })
const queryMock = vi.fn((...args: unknown[]) => ({ __type: 'query', args }))
const collectionMock = vi.fn((_db: unknown, name: string) => ({ __type: 'collection', name }))
const whereMock = vi.fn((...args: unknown[]) => ({ __type: 'where', args }))
const orderByMock = vi.fn((...args: unknown[]) => ({ __type: 'orderBy', args }))
const limitMock = vi.fn((...args: unknown[]) => ({ __type: 'limit', args }))
const startAfterMock = vi.fn((...args: unknown[]) => ({ __type: 'startAfter', args }))
const getCountFromServerMock = vi.fn()

const batchSetMock = vi.fn()
const batchDeleteMock = vi.fn()
const batchCommitMock = vi.fn().mockResolvedValue(undefined)
const writeBatchMock = vi.fn(() => ({
  set: batchSetMock,
  delete: batchDeleteMock,
  commit: batchCommitMock,
}))

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  doc: (...args: unknown[]) => docMock(...(args as [unknown, string, string])),
  getCountFromServer: (...args: unknown[]) => getCountFromServerMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  limit: (...args: unknown[]) => limitMock(...args),
  orderBy: (...args: unknown[]) => orderByMock(...args),
  query: (...args: unknown[]) => queryMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  startAfter: (...args: unknown[]) => startAfterMock(...args),
  Timestamp: { now: () => 'FIXED_TIMESTAMP' },
  where: (...args: unknown[]) => whereMock(...args),
  writeBatch: () => writeBatchMock(),
}))
vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('@/services/firestore', () => ({ db: {} }))

// TASK-247 tanda 2c: the three write functions now trigger the server-side
// public-index reconcile via a dynamic `import('./cloudFunctions')` (see
// that function's doc comment for why it's dynamic, not static). Mocking
// '@/services/cloudFunctions' wholesale here raced against that dynamic
// import in practice — resolution order between a vi.mock'd alias
// specifier and the SUT's relative specifier was not reliable, some calls
// hit the mock and some hit the REAL module (observed: "No Firebase App
// '[DEFAULT]'" errors from real cloudFunctions.ts, non-deterministically,
// even though every assertion still happened to pass). Mocking at the same
// low level cloudFunctions.test.ts itself uses — firebase/functions +
// firebase/app + firebase/auth — sidesteps the race entirely: the REAL
// cloudFunctions.ts module always loads (deterministic), and it's firebase/
// functions' httpsCallable that's mocked underneath it.
const reconcileCallableMock = vi.fn().mockResolvedValue({ data: { strategy: 'noop' } })
const httpsCallableMock = vi.fn((..._args: unknown[]) => reconcileCallableMock)
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (...args: unknown[]) => httpsCallableMock(...args),
}))
vi.mock('firebase/app', () => ({
  getApp: () => ({}),
}))
vi.mock('firebase/auth', () => ({
  onIdTokenChanged: () => () => {},
}))

// eslint-disable-next-line import/first
import { __resetReconcileStateForTests, batchSyncCardsToPublic, buildPublicCardDoc, chunkList, getUserPublicCardsCount, getUserPublicCardsPage, getUserPublicCardStatusCounts, mapWithConcurrency, RECONCILE_DEBOUNCE_MS, removeCardFromPublic, searchUserPublicCards, syncAllUserCards, syncCardToPublic } from '@/services/publicCards'
// Static (not dynamic) import purely to pre-warm the module cache — the SUT's
// scheduleIndexReconcile/triggerIndexReconcileNow reach cloudFunctions.ts via
// `import('./cloudFunctions')` (see that function's doc comment for why it's
// dynamic). A dynamic import's FIRST resolution goes through real module
// transform/instantiation work that is NOT a timer and NOT a plain
// microtask, so vi.advanceTimersByTimeAsync's per-tick microtask flush does
// not wait for it — measured: every debounce test below read 0 calls
// immediately after advancing, because the module was still mid-load. This
// import forces that one-time cost to happen during module setup, before
// any test's fake-timer clock starts, so every dynamic import afterwards
// resolves against an already-instantiated module (microtask-only, no real
// I/O) and advanceTimersByTimeAsync's flush is enough.
// eslint-disable-next-line import/first
import '@/services/cloudFunctions'

beforeEach(() => {
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  docMock.mockClear()
  getDocsMock.mockClear()
  queryMock.mockClear()
  collectionMock.mockClear()
  whereMock.mockClear()
  orderByMock.mockClear()
  limitMock.mockClear()
  startAfterMock.mockClear()
  getCountFromServerMock.mockClear()
  batchSetMock.mockClear()
  batchDeleteMock.mockClear()
  batchCommitMock.mockClear()
  writeBatchMock.mockClear()
  reconcileCallableMock.mockClear()
  httpsCallableMock.mockClear()
  // LOW-A (TASK-247 review round 3): the debounce/in-flight state
  // (_reconcileWindowTimer, _reconcileTrailingPending, _reconcileInFlight,
  // _reconcileQueuedWhileInFlight) lives in module-level singletons with no
  // reset previously exported — this file was relying on test EXECUTION
  // ORDER to never leave state dirty across tests, which is exactly the
  // kind of implicit coupling that breaks the moment tests get reordered
  // or run individually. Resetting explicitly here removes that coupling.
  __resetReconcileStateForTests()
})

/**
 * TASK-247 tanda 2c: single source of truth for the public_cards document
 * shape. Before this, syncCardToPublic, batchSyncCardsToPublic, and
 * syncAllUserCards each had their own object literal — the exact drift risk
 * a `PUBLIC_CARD_FIELDS` catalog on the server side (functions/lib/
 * publicCardIndexReconciler.js) is guarding against.
 *
 * The doc comment on PublicCard (src/services/publicCards.ts) states the
 * real field set measured against 6,647 production documents: avatarUrl,
 * cardId, cardName, cardNameLower, condition, edition, foil, image,
 * location, price, quantity, scryfallId, setCode, status, updatedAt,
 * userId, username. No `name` field exists — confusing it with cardName
 * cost a full round in tanda 1.
 */
describe('buildPublicCardDoc', () => {
  it('writes exactly the 17 known public_cards fields — no more, no less, and never `name`', () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true, setCode: 'lea' })

    const payload = buildPublicCardDoc(card, 'user-1', 'alice', 'Montevideo', 'https://avatar')

    expect(Object.keys(payload).sort()).toEqual([
      'avatarUrl', 'cardId', 'cardName', 'cardNameLower', 'condition', 'edition',
      'foil', 'image', 'location', 'price', 'quantity', 'scryfallId', 'setCode',
      'status', 'updatedAt', 'userId', 'username',
    ])
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('email')
  })

  it('carries userId/username/avatarUrl/location straight from the arguments', () => {
    const card = makeCard({ name: 'Sol Ring', status: 'trade', public: true })

    const payload = buildPublicCardDoc(card, 'user-9', 'bob', 'Buenos Aires', 'https://avatar-9')

    expect(payload.userId).toBe('user-9')
    expect(payload.username).toBe('bob')
    expect(payload.avatarUrl).toBe('https://avatar-9')
    expect(payload.location).toBe('Buenos Aires')
  })

  it('defaults avatarUrl to null when omitted', () => {
    const card = makeCard({ status: 'sale', public: true })

    const payload = buildPublicCardDoc(card, 'user-1', 'alice')

    expect(payload.avatarUrl).toBeNull()
  })

  // Behavior unification: syncCardToPublic/batchSyncCardsToPublic used to
  // write `location: undefined` when no location was passed (Firestore
  // rejects undefined field values by default — this project's db has no
  // ignoreUndefinedProperties override, see src/services/firestore.ts).
  // syncAllUserCards already defaulted to '' — that's the safe variant this
  // unification adopts for all three call sites.
  it('defaults location to an empty string when omitted (never leaves it undefined)', () => {
    const card = makeCard({ status: 'sale', public: true })

    const payload = buildPublicCardDoc(card, 'user-1', 'alice')

    expect(payload.location).toBe('')
  })

  it('defaults setCode to an empty string when the card has none', () => {
    const card = makeCard({ status: 'sale', public: true, setCode: undefined })

    const payload = buildPublicCardDoc(card, 'user-1', 'alice')

    expect(payload.setCode).toBe('')
  })

  it('produces the identical payload from all three writers for the same card', async () => {
    // Fake timers so the debounced reconcile trigger (fired by these
    // writers as a side effect — see the "reconcilePublicCardIndex
    // trigger" describe below) doesn't leave a real 2s setTimeout pending
    // past this test.
    vi.useFakeTimers()
    const card = makeCard({ id: 'c1', name: 'Time Walk', status: 'sale', public: true, setCode: 'lea' })

    await syncCardToPublic(card, 'user-1', 'alice', 'Montevideo', 'https://avatar')
    const fromSingle = setDocMock.mock.calls[0]?.[1] as Record<string, unknown>

    await batchSyncCardsToPublic([card], 'user-1', 'alice', 'Montevideo', 'https://avatar')
    const fromBatch = batchSetMock.mock.calls[0]?.[1] as Record<string, unknown>

    await syncAllUserCards([card], 'user-1', 'alice', 'Montevideo', 'https://avatar')
    const fromSyncAll = batchSetMock.mock.calls.at(-1)?.[1] as Record<string, unknown>

    // updatedAt is stamped independently per call (Timestamp.now() is
    // mocked to a fixed value here, so this also incidentally locks that
    // every writer stamps it the same way) — compare the rest field by field.
    expect(fromBatch).toEqual(fromSingle)
    expect(fromSyncAll).toEqual(fromSingle)

    // Each writer above also fires its own reconcile trigger — see the
    // "reconcilePublicCardIndex trigger" describe block below for the
    // leading+trailing debounce mechanics and their fake-timer tests. All
    // 3 calls share ONE coalescing window: the first (syncCardToPublic)
    // fires immediately (leading edge), the other two land WITHIN that
    // window and coalesce into a single trailing call once it elapses.
    // Advancing here drains that trailing call so nothing leaks into the
    // next test as a real (2s) pending setTimeout.
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(2) // 1 leading (immediate) + 1 trailing (coalesced)
    vi.useRealTimers()
  })
})

/**
 * TASK-247 tanda 2c: nothing drove reconciliation of the public index
 * before this — the profile served whatever the last manual script run
 * left behind. Each writer now fires the self-only `reconcilePublicCardIndex`
 * callable (functions/index.js) once per sync operation, not per card, so
 * the fanout stays proportional to how often the public set changes.
 *
 * Review round 2 (HIGH-1/HIGH-2/MED-1): the FIRST version of this trigger
 * had no debounce (a burst of edits fired one full reconcile per edit) and
 * two writers — removeCardFromPublic and stores/collection.ts's
 * deletePublicCardBatches — never triggered a reconcile at all, so a
 * deleted/sold card stayed listed in the index ("ghost cards", this
 * project's own recurring bug family) until an unrelated edit happened to
 * reconcile as a side effect.
 *
 * Review round 3 (HIGH-A): the round-2 debounce was TRAILING-ONLY (fire
 * once RECONCILE_DEBOUNCE_MS after the LAST call in a burst) — copied only
 * the setTimeout half of the sibling card_index delta debounce
 * (queueCardIndexDelta/scheduleCardIndexDeltaFlush), not the
 * flushPendingCardIndexDeltasOnUnload half that survives a tab close. A
 * trailing-only debounce is WORSE than no debounce at all for this
 * failure mode: before it existed, a reconcile fired immediately (loss
 * window = one RTT); after it, the loss window became RTT + 2s, landing
 * exactly when the user has just finished editing and is most likely to
 * navigate away or close the tab — with no server-side safety net
 * (no onDocumentWritten/onSchedule reconcile exists). Fixed with a
 * LEADING+TRAILING debounce instead: the FIRST call in a burst fires
 * immediately (restores the original RTT-only loss window — nothing is
 * lost even if the tab closes a millisecond later), and any calls that
 * land while that leading call's coalescing window is still open are
 * coalesced into a single trailing call once the window elapses. A real
 * keepalive-beacon-on-unload (mirroring sendCardIndexDeltaBeacon) would
 * close the trailing call's residual loss window too, but is out of this
 * tanda's scope — the trailing call only ever coalesces work the leading
 * call didn't already cover.
 *
 * These tests use real fake timers (vi.useFakeTimers + advanceTimersByTimeAsync)
 * instead of vi.waitFor — LOW-3 from review round 2: vi.waitFor's guarantee
 * is "eventually true", which is the wrong tool once the thing under test
 * IS a timer. advanceTimersByTimeAsync(0) is used to flush the pending
 * microtask chain (dynamic import resolution + its .then()) for an
 * immediate (leading-edge) call, without waiting out any real delay —
 * proving it fired immediately, not after RECONCILE_DEBOUNCE_MS.
 */
describe('reconcilePublicCardIndex trigger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('HIGH-A regression lock: the leading edit in a burst reconciles immediately — NOT lost if the coalescing window never elapses (tab closed first)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')
    // Deliberately do NOT advance by RECONCILE_DEBOUNCE_MS — this simulates
    // the tab closing/navigating away before the trailing window would
    // ever elapse. Only flush the leading call's own microtask chain.
    await vi.advanceTimersByTimeAsync(0)

    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)
  })

  it('HIGH-1 regression lock: coalesces a burst of edits into a leading call plus at most ONE trailing call — never one per edit', async () => {
    for (let i = 0; i < 5; i++) {
      const card = makeCard({ id: `c${i}`, name: 'Lightning Bolt', status: 'sale', public: true })
      // eslint-disable-next-line no-await-in-loop -- simulating 5 rapid-fire edits, must stay sequential
      await syncCardToPublic(card, 'user-1', 'alice')
    }
    await vi.advanceTimersByTimeAsync(0) // flush the leading call (edit #1)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS) // window elapses — one trailing call for edits #2-5

    expect(reconcileCallableMock).toHaveBeenCalledTimes(2) // NOT 5
  })

  it('a single edit does not ALSO fire a trailing call once its window elapses (no phantom second call)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')
    await vi.advanceTimersByTimeAsync(0)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS) // window elapses with nothing queued

    expect(reconcileCallableMock).toHaveBeenCalledTimes(1) // still 1 — no trailing call was queued
  })

  it('syncCardToPublic triggers an immediate reconcile after a delete (card left the public set)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'collection', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(deleteDocMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)
  })

  it('batchSyncCardsToPublic triggers exactly one immediate reconcile for the whole batch, not one per card', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Black Lotus', status: 'sale', public: true }),
      makeCard({ id: 'c2', name: 'Mox Ruby', status: 'trade', public: true }),
    ]

    await batchSyncCardsToPublic(cards, 'user-1', 'alice')

    await vi.advanceTimersByTimeAsync(0)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)
  })

  // LOW-C (TASK-247 review round 3): batchSyncCardsToPublic didn't catch a
  // mid-loop batch.commit() failure — the exception propagated straight
  // out, skipping the scheduleIndexReconcile() call at the end and leaving
  // whatever chunks DID commit successfully un-reconciled. BATCH_SIZE is
  // 400, so 401 cards forces a second chunk/commit.
  it('LOW-C regression lock: still reconciles the successfully-committed chunk(s) even when a later chunk fails', async () => {
    const cards = Array.from({ length: 401 }, (_, i) =>
      makeCard({ id: `c${i}`, name: 'Lightning Bolt', status: 'sale', public: true }))
    batchCommitMock.mockResolvedValueOnce(undefined) // chunk 1: succeeds
    batchCommitMock.mockRejectedValueOnce(new Error('chunk 2 commit boom')) // chunk 2: fails

    await expect(batchSyncCardsToPublic(cards, 'user-1', 'alice')).rejects.toThrow('chunk 2 commit boom')

    await vi.advanceTimersByTimeAsync(0)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1) // chunk 1's write still needs to be reflected in the index
  })

  it('LOW-C: does not reconcile at all when EVERY chunk fails (nothing was actually written)', async () => {
    const cards = [makeCard({ id: 'c1', name: 'Lightning Bolt', status: 'sale', public: true })]
    batchCommitMock.mockRejectedValueOnce(new Error('commit boom'))

    await expect(batchSyncCardsToPublic(cards, 'user-1', 'alice')).rejects.toThrow('commit boom')

    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS)
    expect(reconcileCallableMock).not.toHaveBeenCalled()
  })

  it('syncAllUserCards triggers a reconcile immediately when no window is open', async () => {
    const cards = [makeCard({ id: 'c1', name: 'Time Walk', status: 'sale', public: true })]

    await syncAllUserCards(cards, 'user-1', 'alice')
    await vi.advanceTimersByTimeAsync(0)

    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)
  })

  /**
   * TASK-247 tanda 2c review round 4 (MEDIUM-2): syncAllUserCards used to
   * call triggerIndexReconcileNow() directly (guaranteed RTT-only loss
   * window, no debounce). Round 3 (MED-B) switched it to the shared
   * scheduleIndexReconcile() for consistency — but that regressed the
   * guarantee: if an earlier edit's coalescing window was still open,
   * syncAllUserCards's own reconcile became `_reconcileTrailingPending`
   * instead of firing, waiting out whatever was left of that window with
   * no unload flush and no server-side safety net — HIGH-A's exact tab-
   * close failure mode, reintroduced on the one path the original code
   * kept immediate on purpose. The OLD test here ("through the same shared
   * leading+trailing mechanism") passed identically before and after this
   * regression because it never opened a window first — a vacuous sensor
   * for this specific property, called out by review. This one does.
   */
  it('MEDIUM-2 regression lock: syncAllUserCards STILL fires immediately even when an earlier edit already opened a coalescing window', async () => {
    // Open a window: this fires its own leading call immediately.
    const priorEdit = makeCard({ id: 'prior', name: 'Lightning Bolt', status: 'sale', public: true })
    await syncCardToPublic(priorEdit, 'user-1', 'alice')
    await vi.advanceTimersByTimeAsync(0)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1) // the prior edit's leading call

    // The window from that edit is still open (RECONCILE_DEBOUNCE_MS hasn't
    // elapsed) when syncAllUserCards runs.
    const cards = [makeCard({ id: 'c1', name: 'Time Walk', status: 'sale', public: true })]
    await syncAllUserCards(cards, 'user-1', 'alice')
    await vi.advanceTimersByTimeAsync(0)

    // Must have fired its OWN immediate call — not merely queued the window's trailing slot.
    expect(reconcileCallableMock).toHaveBeenCalledTimes(2)

    // And the window it flushed must not ALSO fire a redundant trailing
    // call once it would have elapsed — syncAllUserCards's flush cancels
    // the pending window outright rather than leaving it dangling.
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(2)
  })

  it('HIGH-2 regression lock: removeCardFromPublic triggers an immediate reconcile — deletes must not be silently unindexed', async () => {
    await removeCardFromPublic('c1', 'user-1')

    await vi.advanceTimersByTimeAsync(0)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)
  })

  it('a reconcile failure does not reject the write (fire-and-forget, non-fatal)', async () => {
    reconcileCallableMock.mockRejectedValueOnce(new Error('reconcile boom'))
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    await vi.advanceTimersByTimeAsync(0)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)
  })

  it('MED-1 regression lock: a call that lands while a reconcile is still in flight is queued, not dropped, and fires once the in-flight call settles', async () => {
    let resolveFirst: (value: { data: unknown }) => void = () => {}
    reconcileCallableMock.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))

    const cardA = makeCard({ id: 'a', name: 'Lightning Bolt', status: 'sale', public: true })
    await syncCardToPublic(cardA, 'user-1', 'alice')
    await vi.advanceTimersByTimeAsync(0) // leading call fires immediately and stays in flight (unresolved)
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)

    const cardB = makeCard({ id: 'b', name: 'Mox Ruby', status: 'sale', public: true })
    await syncCardToPublic(cardB, 'user-1', 'alice') // lands inside the coalescing window — queued as trailing
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS) // window elapses WHILE the leading call is still in flight
    // The trailing call itself is now blocked by the in-flight guard (not
    // sent — queued a second time, at the triggerIndexReconcileNow level).
    expect(reconcileCallableMock).toHaveBeenCalledTimes(1)

    resolveFirst({ data: { strategy: 'noop' } })
    await vi.advanceTimersByTimeAsync(0) // let the queued retry (fired from .finally()) run
    expect(reconcileCallableMock).toHaveBeenCalledTimes(2)
  })
})

describe('syncCardToPublic', () => {
  it('writes cardNameLower alongside cardName for an eligible sale card', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [, payload] = setDocMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.cardName).toBe('Lightning Bolt')
    expect(payload.cardNameLower).toBe('lightning bolt')
  })

  it('lowercases mixed-case and accented-looking names consistently', async () => {
    const card = makeCard({ name: 'Sol Ring', status: 'trade', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    const [, payload] = setDocMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.cardNameLower).toBe('sol ring')
  })

  it('regression lock: never writes a collection-status card to public_cards (deletes instead)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'collection', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(setDocMock).not.toHaveBeenCalled()
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })

  // Review fix (M3): single-card-edit path pinning for the wishlist case —
  // e.g. a public sale card moved to wishlist while still public:true must
  // be deleted from public_cards, not re-published under 'wishlist'.
  it('regression lock: never writes a wishlist-status card to public_cards (deletes instead)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'wishlist', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(setDocMock).not.toHaveBeenCalled()
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })

  it('regression lock: never writes a card that is not marked public', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: false })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(setDocMock).not.toHaveBeenCalled()
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })

  // TASK-138 AC3: PublicCard never carried setCode, so exchangeCart's CK price
  // upgrade (exchangeCart.ts:52,76) always fell back to the TCG price for
  // cards added from a public profile. Write path fix — additive, existing
  // docs without setCode still work via the in-memory Scryfall enrichment
  // already wired in UserProfileView.enrichPublicCardsInMemory.
  it('writes setCode alongside cardName for an eligible card', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true, setCode: 'lea' })

    await syncCardToPublic(card, 'user-1', 'alice')

    const [, payload] = setDocMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.setCode).toBe('lea')
  })

  it('falls back to an empty string when the card has no setCode (Firestore rejects undefined)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true, setCode: undefined })

    await syncCardToPublic(card, 'user-1', 'alice')

    const [, payload] = setDocMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.setCode).toBe('')
  })
})

describe('batchSyncCardsToPublic', () => {
  it('writes cardNameLower for every eligible card in the batch', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Black Lotus', status: 'sale', public: true }),
      makeCard({ id: 'c2', name: 'Mox Ruby', status: 'trade', public: true }),
    ]

    await batchSyncCardsToPublic(cards, 'user-1', 'alice')

    expect(batchSetMock).toHaveBeenCalledTimes(2)
    const payloads = batchSetMock.mock.calls.map(call => call[1] as Record<string, unknown>)
    expect(payloads.map(p => p.cardNameLower)).toEqual(['black lotus', 'mox ruby'])
  })

  // TASK-138 AC3 (Rule 6 — parallel write-path point alongside syncCardToPublic)
  it('writes setCode for every eligible card in the batch', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Black Lotus', status: 'sale', public: true, setCode: 'lea' }),
      makeCard({ id: 'c2', name: 'Mox Ruby', status: 'trade', public: true, setCode: undefined }),
    ]

    await batchSyncCardsToPublic(cards, 'user-1', 'alice')

    const payloads = batchSetMock.mock.calls.map(call => call[1] as Record<string, unknown>)
    expect(payloads.map(p => p.setCode)).toEqual(['lea', ''])
  })

  it('regression lock: batches collection/wishlist cards as deletes, never as sets', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Black Lotus', status: 'collection', public: true }),
      makeCard({ id: 'c2', name: 'Mox Ruby', status: 'wishlist', public: true }),
    ]

    await batchSyncCardsToPublic(cards, 'user-1', 'alice')

    expect(batchSetMock).not.toHaveBeenCalled()
    expect(batchDeleteMock).toHaveBeenCalledTimes(2)
  })
})

describe('syncAllUserCards', () => {
  it('writes cardNameLower for every eligible card', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Time Walk', status: 'sale', public: true }),
    ]

    await syncAllUserCards(cards, 'user-1', 'alice')

    expect(batchSetMock).toHaveBeenCalledTimes(1)
    const [, payload] = batchSetMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.cardNameLower).toBe('time walk')
  })

  // TASK-138 AC3 (Rule 6 — third parallel write-path point)
  it('writes setCode for every eligible card', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Time Walk', status: 'sale', public: true, setCode: 'lea' }),
    ]

    await syncAllUserCards(cards, 'user-1', 'alice')

    const [, payload] = batchSetMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.setCode).toBe('lea')
  })

  it('regression lock: never includes a collection/wishlist card in the synced batch', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Time Walk', status: 'collection', public: true }),
      makeCard({ id: 'c2', name: 'Ancestral Recall', status: 'wishlist', public: true }),
      makeCard({ id: 'c3', name: 'Timetwister', status: 'sale', public: true }),
    ]

    await syncAllUserCards(cards, 'user-1', 'alice')

    expect(batchSetMock).toHaveBeenCalledTimes(1)
    const [, payload] = batchSetMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.cardName).toBe('Timetwister')
  })
})

/**
 * TASK-136: perfil público paginado vía /public_cards.
 *
 * Regression lock — the public profile MUST fetch cards through this
 * server-side-paginated query against the denormalized /public_cards
 * collection, and MUST NEVER fall back to a full getDocs() scan of the
 * private users/{uid}/cards subcollection (the pre-fix bug: 5654 docs
 * downloaded per profile visit, including private ones, filtered
 * client-side).
 */
describe('getUserPublicCardsPage', () => {
  const makeDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data })

  it('queries the public_cards collection filtered by userId — never users/{uid}/cards', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    await getUserPublicCardsPage('user-1', 60, null)

    expect(collectionMock).toHaveBeenCalledWith({}, 'public_cards')
    expect(collectionMock).not.toHaveBeenCalledWith(expect.anything(), 'users')
    expect(whereMock).toHaveBeenCalledWith('userId', '==', 'user-1')
  })

  it('orders by cardName (matches the deployed composite index) and requests pageSize+1 docs to detect hasMore without a count query', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    await getUserPublicCardsPage('user-1', 60, null)

    expect(orderByMock).toHaveBeenCalledWith('cardName')
    expect(limitMock).toHaveBeenCalledWith(61)
  })

  it('does not call startAfter on the first page (cursor null)', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    await getUserPublicCardsPage('user-1', 60, null)

    expect(startAfterMock).not.toHaveBeenCalled()
  })

  it('passes startAfter(cursor) when paging past the first page', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })
    const cursor = makeDoc('prev-last-doc', { cardName: 'Zzz' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getUserPublicCardsPage('user-1', 60, cursor as any)

    expect(startAfterMock).toHaveBeenCalledWith(cursor)
  })

  it('trims to pageSize and reports hasMore=true when more docs than pageSize come back', async () => {
    const docs = [
      makeDoc('c0', { cardId: 'c0', userId: 'user-1', cardName: 'Card 0', status: 'sale' }),
      makeDoc('c1', { cardId: 'c1', userId: 'user-1', cardName: 'Card 1', status: 'trade' }),
      makeDoc('c2', { cardId: 'c2', userId: 'user-1', cardName: 'Card 2', status: 'sale' }),
    ]
    getDocsMock.mockResolvedValueOnce({ docs })

    const page = await getUserPublicCardsPage('user-1', 2, null)

    expect(page.cards).toHaveLength(2)
    expect(page.cards.map(c => c.docId)).toEqual(['c0', 'c1'])
    expect(page.hasMore).toBe(true)
    expect(page.cursor).toBe(docs[1])
  })

  it('reports hasMore=false and keeps all docs when fewer than pageSize+1 come back', async () => {
    const docs = [makeDoc('c0', { cardId: 'c0', userId: 'user-1', cardName: 'Card 0', status: 'sale' })]
    getDocsMock.mockResolvedValueOnce({ docs })

    const page = await getUserPublicCardsPage('user-1', 2, null)

    expect(page.cards).toHaveLength(1)
    expect(page.hasMore).toBe(false)
    expect(page.cursor).toBe(docs[0])
  })

  it('returns an empty page with a null cursor and hasMore=false when the user has no public cards', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    const page = await getUserPublicCardsPage('user-1', 60, null)

    expect(page.cards).toEqual([])
    expect(page.cursor).toBeNull()
    expect(page.hasMore).toBe(false)
  })
})

/**
 * TASK-136 M4 (round 2): exact sale/trade totals for the profile header chips,
 * decoupled from pagination. Uses two equality-only getCountFromServer
 * aggregate queries (userId== + status==) — deliberately NOT a single query
 * with an orderBy, so it never needs a new composite index beyond the
 * single-field automatic indexes Firestore already maintains.
 */
describe('getUserPublicCardStatusCounts', () => {
  it('queries public_cards filtered by userId AND status=sale, and separately userId AND status=trade', async () => {
    getCountFromServerMock.mockResolvedValue({ data: () => ({ count: 0 }) })

    await getUserPublicCardStatusCounts('user-1')

    expect(collectionMock).toHaveBeenCalledWith({}, 'public_cards')
    expect(whereMock).toHaveBeenCalledWith('userId', '==', 'user-1')
    expect(whereMock).toHaveBeenCalledWith('status', '==', 'sale')
    expect(whereMock).toHaveBeenCalledWith('status', '==', 'trade')
  })

  it('runs exactly two aggregate count queries (sale + trade), in parallel', async () => {
    getCountFromServerMock.mockResolvedValue({ data: () => ({ count: 0 }) })

    await getUserPublicCardStatusCounts('user-1')

    expect(getCountFromServerMock).toHaveBeenCalledTimes(2)
  })

  it('returns the sale and trade counts read from the two aggregate snapshots', async () => {
    getCountFromServerMock
      .mockResolvedValueOnce({ data: () => ({ count: 12 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 7 }) })

    const counts = await getUserPublicCardStatusCounts('user-1')

    expect(counts).toEqual({ sale: 12, trade: 7 })
  })
})

/**
 * TASK-139: UserProfileHoverCard's total-count query. Regression lock —
 * the hover card MUST count via this single equality-only aggregate query
 * against /public_cards, and MUST NEVER fall back to downloading the
 * visited user's private users/{uid}/cards subcollection (the pre-fix bug:
 * a full getDocs(where('public','==',true)) scan of that subcollection just
 * to read snapshot.size — the last residual reader blocking TASK-087's
 * firestore.rules tightening).
 */
describe('getUserPublicCardsCount', () => {
  it('queries public_cards filtered by userId only — never users/{uid}/cards', async () => {
    getCountFromServerMock.mockResolvedValue({ data: () => ({ count: 0 }) })

    await getUserPublicCardsCount('user-1')

    expect(collectionMock).toHaveBeenCalledWith({}, 'public_cards')
    expect(collectionMock).not.toHaveBeenCalledWith(expect.anything(), 'users')
    expect(whereMock).toHaveBeenCalledWith('userId', '==', 'user-1')
  })

  it('runs exactly one aggregate count query', async () => {
    getCountFromServerMock.mockResolvedValue({ data: () => ({ count: 0 }) })

    await getUserPublicCardsCount('user-1')

    expect(getCountFromServerMock).toHaveBeenCalledTimes(1)
  })

  it('returns the count read from the aggregate snapshot', async () => {
    getCountFromServerMock.mockResolvedValueOnce({ data: () => ({ count: 42 }) })

    const count = await getUserPublicCardsCount('user-1')

    expect(count).toBe(42)
  })
})

/**
 * TASK-138 AC1: server-side prefix search over a single user's public cards,
 * so text search on a public profile can find cards NOT yet loaded into the
 * grid (the pre-fix bug: text search only filtered whatever ~60-card page(s)
 * had already been scrolled into view).
 *
 * Filters on the SAME composite index as getUserPublicCardsPage's userId
 * equality, but ranges on cardNameLower instead of ordering by cardName —
 * requires the NEW composite index `public_cards: userId ASC, cardNameLower
 * ASC` added to firestore.indexes.json in this same commit (deploy is manual,
 * done by the team lead after this commit lands).
 *
 * Deliberately capped at a single page (no cursor/hasMore pagination of
 * search results themselves, unlike getUserPublicCardsPage) — see
 * usePublicProfileCards.ts for why.
 */
describe('searchUserPublicCards', () => {
  const makeDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data })

  it('queries public_cards filtered by userId with a cardNameLower prefix range, ordered by cardNameLower', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    await searchUserPublicCards('user-1', 'Light', 50)

    expect(collectionMock).toHaveBeenCalledWith({}, 'public_cards')
    expect(whereMock).toHaveBeenCalledWith('userId', '==', 'user-1')
    expect(whereMock).toHaveBeenCalledWith('cardNameLower', '>=', 'light')
    expect(whereMock).toHaveBeenCalledWith('cardNameLower', '<=', 'light')
    expect(orderByMock).toHaveBeenCalledWith('cardNameLower')
  })

  it('normalizes the search term to lowercase before querying (regression: uppercase input must still match lowercased cardNameLower)', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    await searchUserPublicCards('user-1', 'LIGHTNING', 50)

    expect(whereMock).toHaveBeenCalledWith('cardNameLower', '>=', 'lightning')
    expect(whereMock).toHaveBeenCalledWith('cardNameLower', '<=', 'lightning')
  })

  it('requests pageSize+1 docs and trims to pageSize with hasMore=true when the cap is exceeded', async () => {
    const docs = [
      makeDoc('c0', { cardId: 'c0', userId: 'user-1', cardName: 'Card 0', status: 'sale' }),
      makeDoc('c1', { cardId: 'c1', userId: 'user-1', cardName: 'Card 1', status: 'trade' }),
      makeDoc('c2', { cardId: 'c2', userId: 'user-1', cardName: 'Card 2', status: 'sale' }),
    ]
    getDocsMock.mockResolvedValueOnce({ docs })

    const page = await searchUserPublicCards('user-1', 'car', 2)

    expect(limitMock).toHaveBeenCalledWith(3)
    expect(page.cards).toHaveLength(2)
    expect(page.hasMore).toBe(true)
  })

  it('reports hasMore=false when results are fewer than pageSize', async () => {
    const docs = [makeDoc('c0', { cardId: 'c0', userId: 'user-1', cardName: 'Card 0', status: 'sale' })]
    getDocsMock.mockResolvedValueOnce({ docs })

    const page = await searchUserPublicCards('user-1', 'car', 50)

    expect(page.cards).toHaveLength(1)
    expect(page.hasMore).toBe(false)
  })

  it('returns an empty page without querying when the term is shorter than 2 characters', async () => {
    const page = await searchUserPublicCards('user-1', 'a', 50)

    expect(page.cards).toEqual([])
    expect(page.hasMore).toBe(false)
    expect(getDocsMock).not.toHaveBeenCalled()
  })

  it('returns an empty page without querying for a blank/whitespace-only term', async () => {
    const page = await searchUserPublicCards('user-1', '   ', 50)

    expect(page.cards).toEqual([])
    expect(getDocsMock).not.toHaveBeenCalled()
  })
})

// ─── perf: bounded-concurrency chunk fanout (bug report 2026-08-07) ──────────
//
// findCardsMatchingPreferences and findPreferencesMatchingCards each split the
// card-name list into 30-name Firestore 'in' chunks and awaited them ONE AT A
// TIME. On a 59k collection that is thousands of serial round-trips on the
// post-login landing. These two helpers make the fanout concurrent while keeping
// a cap, so Firestore is not hit with unbounded parallelism.

describe('chunkList', () => {
  it('splits into chunks of the given size', () => {
    expect(chunkList([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns one chunk when the list is shorter than the size', () => {
    expect(chunkList([1, 2], 30)).toEqual([[1, 2]])
  })

  it('returns no chunks for an empty list', () => {
    expect(chunkList([], 30)).toEqual([])
  })

  it('does not drop the remainder on an exact multiple', () => {
    expect(chunkList([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })
})

describe('mapWithConcurrency', () => {
  it('preserves input order in the results regardless of completion order', async () => {
    const delays = [30, 0, 20, 10]
    const out = await mapWithConcurrency(delays, 4, async (ms, i) => {
      await new Promise(r => setTimeout(r, ms))
      return i
    })
    expect(out).toEqual([0, 1, 2, 3])
  })

  it('never runs more than `limit` tasks at once', async () => {
    let inFlight = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 1))
      inFlight--
      return null
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('actually runs concurrently — 4 tasks at limit 4 are not serialised', async () => {
    let peak = 0
    let inFlight = 0
    await mapWithConcurrency([1, 2, 3, 4], 4, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      return null
    })
    expect(peak).toBe(4)
  })

  it('returns an empty array for no items without invoking the worker', async () => {
    const worker = vi.fn()
    expect(await mapWithConcurrency([], 4, worker)).toEqual([])
    expect(worker).not.toHaveBeenCalled()
  })

  it('rejects if any task rejects', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      }),
    ).rejects.toThrow('boom')
  })
})

/**
 * TASK-169: public_cards and public_preferences are readable by ANYONE with no
 * login (TASK-085 opened them on purpose so anonymous visitors can see who
 * sells a card). Both writers were also copying the owner's email address into
 * every document, which made the whole user base's emails harvestable in bulk
 * by an unauthenticated REST call — verified live against dev before this fix.
 *
 * The contact email now lives in contact_info/{userId}, which requires auth to
 * read. Nothing published to an anonymous-readable collection may carry it.
 */
describe('public_cards / public_preferences never publish the owner email (TASK-169)', () => {
  const emailArg = 'victima@example.com'

  it('syncCardToPublic writes no email field', async () => {
    await syncCardToPublic(
      makeCard({ id: 'c1', name: 'Lightning Bolt', status: 'sale', public: true }),
      'user-1', 'seller', 'Montevideo', null,
    )
    expect(setDocMock).toHaveBeenCalled()
    const payload = setDocMock.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('email')
    expect(JSON.stringify(payload)).not.toContain(emailArg)
  })

  it('batchSyncCardsToPublic writes no email field', async () => {
    await batchSyncCardsToPublic(
      [makeCard({ id: 'c2', name: 'Counterspell', status: 'trade', public: true })],
      'user-1', 'seller', 'Montevideo', null,
    )
    expect(batchSetMock).toHaveBeenCalled()
    const payload = batchSetMock.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('email')
    expect(JSON.stringify(payload)).not.toContain(emailArg)
  })

  it('syncAllUserCards writes no email field', async () => {
    await syncAllUserCards(
      [makeCard({ id: 'c3', name: 'Brainstorm', status: 'sale', public: true })],
      'user-1', 'seller', 'Montevideo', null,
    )
    expect(batchSetMock).toHaveBeenCalled()
    const payload = batchSetMock.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('email')
    expect(JSON.stringify(payload)).not.toContain(emailArg)
  })
})
