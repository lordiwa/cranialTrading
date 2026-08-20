/**
 * Regression test for TASK-168: card_index duplicates itself.
 *
 * loadFromIndex used to getDocs() every document in users/{uid}/card_index and
 * concatenate each chunk's `cards` array with `allIndex.push(...)` — no dedup by
 * card id, no filtering to the expected chunk range. Whatever it found, it added.
 *
 * A single surviving orphan chunk (write loop or orphan cleanup interrupted mid-
 * flight) therefore inflated the loaded collection by up to INDEX_CHUNK_SIZE
 * (2000) phantom cards. Worse, the next mutation persisted the ALREADY-INFLATED
 * array, growing totalChunks so the orphan cleanup (which only deletes indices
 * >= totalChunks) stopped deleting anything. It compounded: the dev E2E account
 * was measured at 41.093 → 59.093 → 43.094 → 47.093 cards in two hours, deltas
 * that are exact multiples of 2000.
 *
 * The fix must live in the READ path: it is the only layer that can defend
 * against a state that is ALREADY corrupt on disk.
 */

// Mock Firebase BEFORE any imports that use it
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

const mockBuildCardIndex = vi.fn().mockResolvedValue({ totalCards: 0, chunks: 0 })

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn(),
  buildCardIndex: (...args: unknown[]) => mockBuildCardIndex(...args),
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
  loadCollectionChunk: vi.fn(),
  loadCardPage: vi.fn(),
}))

vi.mock('@/services/publicCards', () => ({
  isPublicCard: vi.fn((card: any) => (card.status === 'sale' || card.status === 'trade') && card.public === true),
  scheduleIndexReconcile: vi.fn(),
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

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'card-1' }),
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

/**
 * TASK-232: these orphan-cleanup tests used to trigger _runPersistLoop via
 * updateCard — updateCard no longer writes card_index chunks from the
 * browser at all (see collection.dirtyChunkWrites.test.ts). _runPersistLoop
 * itself is still live code (addCard, out of TASK-232's scope, still uses
 * it) — re-pointed to addCard here per the team-lead's "re-apuntalar, no
 * borrar" rule for a still-live mechanism.
 */
function newCardPayload() {
  const { id: _id, updatedAt: _u, ...cardData } = makeCard({ id: 'ignored' })
  return cardData
}

/** Minimal IndexCard — only the fields loadFromIndex/indexToCard actually read. */
function makeIndexCard(id: string): IndexCard {
  return {
    i: id,
    s: `scryfall-${id}`,
    n: `Card ${id}`,
    st: 'collection',
    q: 1,
    p: 0,
    cm: 0,
    co: [],
    r: 'c',
    t: 'Creature',
    f: false,
    sc: 'tst',
    e: 'Test Set',
    pw: '',
    to: '',
    fa: false,
    pm: [],
    kw: [],
    lg: [],
    ca: 0,
    cn: 'NM',
    pb: false,
  }
}

/** A fake card_index chunk document snapshot. */
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

describe('collection store: loadFromIndex must not trust a corrupt card_index (TASK-168)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocs.mockResolvedValue(snapshotOf([]))
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockBuildCardIndex.mockResolvedValue({ totalCards: 0, chunks: 0 })
  })

  it('an orphaned chunk that repeats cards already present must not inflate the loaded count', async () => {
    // The real collection is 3 cards, laid out in chunk_0. chunk_1 is an orphan
    // left behind by an interrupted persist and still holds the OLD tail — the
    // same cards, under the same ids.
    const real = [makeIndexCard('a'), makeIndexCard('b'), makeIndexCard('c')]
    const orphanTail = [makeIndexCard('b'), makeIndexCard('c')]

    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', real), chunkDoc('chunk_1', orphanTail)])
    )

    const store = useCollectionStore()
    await store.loadCollection()

    // With the defect: 5. Real answer: 3.
    expect(store.cards).toHaveLength(3)
    expect(store.cards.map(c => c.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('keeps the FIRST occurrence, so the lowest-numbered (freshest) chunk wins over a stale duplicate', async () => {
    // chunk_10 sorts BEFORE chunk_2 lexicographically — the order getDocs returns
    // them in. Numeric ordering has to be imposed, or a stale chunk_10 entry would
    // shadow the fresh chunk_2 one.
    const fresh = makeIndexCard('dup')
    fresh.q = 7
    const stale = makeIndexCard('dup')
    stale.q = 1

    mockGetDocs.mockResolvedValue(
      snapshotOf([
        chunkDoc('chunk_10', [stale]),
        chunkDoc('chunk_2', [fresh]),
        chunkDoc('chunk_0', [makeIndexCard('x')]),
      ])
    )

    const store = useCollectionStore()
    await store.loadCollection()

    expect(store.cards).toHaveLength(2)
    expect(store.cards.find(c => c.id === 'dup')?.quantity).toBe(7)
  })

  it('a clean index loads untouched and does NOT trigger a rebuild', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([
        chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b')]),
        chunkDoc('chunk_1', [makeIndexCard('c')]),
      ])
    )

    const store = useCollectionStore()
    await store.loadCollection()
    await vi.waitFor(() => expect(store.cards).toHaveLength(3))

    expect(mockBuildCardIndex).not.toHaveBeenCalled()
  })

  it('detecting duplicates self-heals: schedules a background index rebuild', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([
        chunkDoc('chunk_0', [makeIndexCard('a')]),
        chunkDoc('chunk_1', [makeIndexCard('a')]),
      ])
    )

    const store = useCollectionStore()
    await store.loadCollection()

    // The rebuild is fired through a dynamic import, so it lands a microtask later.
    await vi.waitFor(() => expect(mockBuildCardIndex).toHaveBeenCalled())
  })

  it('a card_index with a HOLE never lets the persist delete "orphans" (TASK-168, segunda vuelta)', async () => {
    // Measured live on the dev E2E account: card_index held chunk_0..9 and
    // chunk_16..29 — six chunks missing — summing 47.093 cards while
    // users/{uid}/cards actually held 59.198. The index was 12.105 cards SHORT.
    //
    // The danger is what happens NEXT: the persist derives totalChunks from
    // cardIndexRaw.length, then deletes every chunk numbered >= totalChunks as
    // an orphan. Off a short read that deletes chunks holding REAL cards — the
    // hole widens itself. A load with gaps must disarm the cleanup entirely.
    vi.useFakeTimers()
    try {
      mockGetDocs.mockResolvedValueOnce(
        snapshotOf([
          chunkDoc('chunk_0', [makeIndexCard('a')]),
          // chunk_1 is MISSING — this is the hole.
          chunkDoc('chunk_2', [makeIndexCard('b')]),
        ])
      )

      const store = useCollectionStore()
      await store.loadCollection()

      mockGetDocs.mockResolvedValue(
        snapshotOf([chunkDoc('chunk_0', []), chunkDoc('chunk_2', [])])
      )

      await store.addCard(newCardPayload() as never)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      // chunk_2 is numbered >= totalChunks(1) and WOULD have been deleted.
      expect(mockDeleteDoc).not.toHaveBeenCalled()
      // The chunks it does know about are still written — the data is not lost.
      expect(mockSetDoc).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a gapped index triggers the background rebuild that restores the missing chunks', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([
        chunkDoc('chunk_0', [makeIndexCard('a')]),
        chunkDoc('chunk_2', [makeIndexCard('b')]),
      ])
    )

    const store = useCollectionStore()
    await store.loadCollection()

    await vi.waitFor(() => expect(mockBuildCardIndex).toHaveBeenCalled())
  })

  it('a contiguous PREFIX read mid-rebuild does not count as complete, so nothing gets deleted above it', async () => {
    // buildCardIndex writes chunk_0..N-1 sequentially — measured at 81s for 30
    // chunks. Load inside that window and you read chunk_0..k: contiguous from
    // zero, no duplicates. It passes every structural check and is still only a
    // fraction of the collection. If the cleanup trusts it, it deletes every
    // real chunk above k — which is how a 10-chunk / ~20.000-card state (and
    // then the chunk_10..15 hole) can arise in the first place.
    //
    // The tell is that the highest chunk read is COMPLETELY FULL: in a finished
    // index the last chunk is a remainder.
    vi.useFakeTimers()
    try {
      const CHUNK = 2000
      const full = (n: number, offset: number) =>
        Array.from({ length: n }, (_, i) => makeIndexCard(`c${offset + i}`))

      // Two full chunks: the shape of a rebuild that has written 2 of many.
      mockGetDocs.mockResolvedValueOnce(
        snapshotOf([
          chunkDoc('chunk_0', full(CHUNK, 0)),
          chunkDoc('chunk_1', full(CHUNK, CHUNK)),
        ])
      )

      const store = useCollectionStore()
      await store.loadCollection()

      // Meanwhile the rebuild has finished and written chunk_2 as well.
      mockGetDocs.mockResolvedValue(
        snapshotOf([chunkDoc('chunk_0', []), chunkDoc('chunk_1', []), chunkDoc('chunk_2', [])])
      )

      await store.addCard(newCardPayload() as never)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      // chunk_2 is numbered >= totalChunks(2) and WOULD have been deleted.
      expect(mockDeleteDoc).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('deletes orphan chunks HIGHEST-NUMBER-FIRST, so an interrupted cleanup leaves a contiguous prefix', async () => {
    // getDocs returns chunks lexicographically: chunk_0, chunk_1, chunk_10,
    // chunk_11, ..., chunk_2. Deleting in that order is what punched the
    // chunk_10..15 hole in the dev account — those six are the first six
    // entries of the deletion list when totalChunks is 10. Descending order
    // means an interruption can only ever trim the tail.
    vi.useFakeTimers()
    try {
      mockGetDocs.mockResolvedValueOnce(snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a')])]))

      const store = useCollectionStore()
      await store.loadCollection()

      // Lexicographic order, as Firestore hands them over.
      mockGetDocs.mockResolvedValue(
        snapshotOf([
          chunkDoc('chunk_0', []),
          chunkDoc('chunk_1', []),
          chunkDoc('chunk_10', []),
          chunkDoc('chunk_11', []),
          chunkDoc('chunk_2', []),
        ])
      )

      await store.addCard(newCardPayload() as never)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      const order = mockDeleteDoc.mock.calls.map(c => (c[0] as { path: string }).path.split('/').pop())
      expect(order).toEqual(['chunk_11', 'chunk_10', 'chunk_2', 'chunk_1'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('orphan chunks are deleted even when the chunk write loop fails (AC3)', async () => {
    // The orphan cleanup used to run AFTER the write loop, so anything that
    // interrupted the writes left the orphan behind — which is precisely how the
    // index got corrupt in the first place. A failing write stands in here for
    // the real-world interruption (closed tab / lost connection) that a unit test
    // cannot reproduce directly.
    vi.useFakeTimers()
    try {
      // Seed 3 cards → the next persist lays them out in a single chunk_0,
      // making chunk_1 and chunk_2 orphans.
      mockGetDocs.mockResolvedValueOnce(
        snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b'), makeIndexCard('c')])])
      )

      const store = useCollectionStore()
      await store.loadCollection()

      // What the persist's own getDocs sees: two stale trailing chunks.
      mockGetDocs.mockResolvedValue(
        snapshotOf([chunkDoc('chunk_0', []), chunkDoc('chunk_1', []), chunkDoc('chunk_2', [])])
      )
      // TASK-255 round 1 (HIGH-1 fix): addCard's OWN card-document write now
      // also goes through setDoc (previously addDoc, a separate mock) — let
      // that one succeed so addCard reaches persistIndexToFirestore's chunk
      // write loop at all; only the CHUNK writes (everything after) must
      // fail, to simulate the real-world interruption this test is about.
      mockSetDoc.mockResolvedValueOnce(undefined)
      mockSetDoc.mockRejectedValue(new Error('network died mid-write'))

      await store.addCard(newCardPayload() as never)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      const deletedPaths = mockDeleteDoc.mock.calls
        .map(c => (c[0] as { path: string }).path)
        .sort()
      expect(deletedPaths).toEqual([
        'users/test-user-id/card_index/chunk_1',
        'users/test-user-id/card_index/chunk_2',
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})
