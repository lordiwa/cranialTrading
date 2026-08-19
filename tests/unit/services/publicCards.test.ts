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
import { batchSyncCardsToPublic, buildPublicCardDoc, chunkList, getUserPublicCardsCount, getUserPublicCardsPage, getUserPublicCardStatusCounts, mapWithConcurrency, searchUserPublicCards, syncAllUserCards, syncCardToPublic } from '@/services/publicCards'

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

    // Each writer above also fires its own fire-and-forget reconcile
    // (dynamic import — see scheduleIndexReconcile's doc comment). Wait for
    // all 3 to settle here rather than leaving them pending: an unresolved
    // one would otherwise land mid-flight during the NEXT test and inflate
    // ITS reconcileCallableMock count (measured — see the "reconcile
    // trigger" describe block's own comment on this exact failure mode).
    await vi.waitFor(() => expect(reconcileCallableMock).toHaveBeenCalledTimes(3))
  })
})

/**
 * TASK-247 tanda 2c: nothing drove reconciliation of the public index
 * before this — the profile served whatever the last manual script run
 * left behind. Each writer now fires the self-only `reconcilePublicCardIndex`
 * callable (functions/index.js) once per sync operation, not per card, so
 * the fanout stays proportional to how often the public set changes.
 */
describe('reconcilePublicCardIndex trigger', () => {
  // scheduleIndexReconcile fires a dynamic import('./cloudFunctions') (see
  // its doc comment — same TASK-232 reason stores/collection.ts's
  // applyCardIndexDelta wrapper does it), so the reconcile call itself
  // lands after the `await syncCardToPublic(...)` in these tests, on
  // whatever tick the dynamic import actually resolves. A fixed setTimeout
  // flush was flaky here — the FIRST dynamic import in the whole file does
  // real module transform work and can take longer than a short fixed
  // delay, and a leftover pending call then lands during the NEXT test and
  // inflates ITS count instead. vi.waitFor polls until the expected count
  // is reached (or its own timeout fails the test for a real reason),
  // which is exact rather than a specific number of milliseconds — and by
  // blocking on it, it also guarantees each test's dynamic import has
  // fully settled before the next test starts, so nothing bleeds across.
  const waitForReconcileCalls = (n: number) =>
    vi.waitFor(() => expect(reconcileCallableMock).toHaveBeenCalledTimes(n))

  it('syncCardToPublic triggers a reconcile after a successful publish', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    await waitForReconcileCalls(1)
  })

  it('syncCardToPublic triggers a reconcile after a delete (card left the public set)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'collection', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(deleteDocMock).toHaveBeenCalledTimes(1)
    await waitForReconcileCalls(1)
  })

  it('batchSyncCardsToPublic triggers exactly one reconcile for the whole batch, not one per card', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Black Lotus', status: 'sale', public: true }),
      makeCard({ id: 'c2', name: 'Mox Ruby', status: 'trade', public: true }),
    ]

    await batchSyncCardsToPublic(cards, 'user-1', 'alice')

    await waitForReconcileCalls(1)
  })

  it('syncAllUserCards triggers exactly one reconcile for the whole sync', async () => {
    const cards = [makeCard({ id: 'c1', name: 'Time Walk', status: 'sale', public: true })]

    await syncAllUserCards(cards, 'user-1', 'alice')

    await waitForReconcileCalls(1)
  })

  it('a reconcile failure does not reject the write (fire-and-forget, non-fatal)', async () => {
    reconcileCallableMock.mockRejectedValueOnce(new Error('reconcile boom'))
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true })

    await expect(syncCardToPublic(card, 'user-1', 'alice')).resolves.toBeUndefined()
    await waitForReconcileCalls(1) // let the rejected call settle before the next test
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
