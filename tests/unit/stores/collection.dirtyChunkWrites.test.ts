/**
 * TASK-219 (paso 1 de TASK-176): _runPersistLoop used to rewrite every
 * card_index chunk (0..totalChunks-1) on EVERY persist, even when a mutation
 * only changed one field of one card at one array position — measured live
 * at 10-58s for a single status change on a large account, because the next
 * mutation's write queues behind that unnecessary ~30-chunk rewrite on the
 * client's Firestore write channel.
 *
 * This file locks two independent behaviors:
 *
 *  A) A field-only mutation that does not change cardIndexRaw's length/order
 *     (updateCard, batchUpdateCards on cards whose status/etc. changes but
 *     who stay in place) writes ONLY the chunk(s) actually touched — proven
 *     by counting setDoc calls, not by reading the implementation.
 *
 *  B) The orphan-cleanup getDocs only fires when totalChunks could plausibly
 *     have SHRUNK since the last successful write. When it did not shrink,
 *     the read is skipped entirely; when it did, the cleanup runs exactly as
 *     before (still governed by the TASK-168 indexKnownComplete guard, which
 *     this file does not touch — see collection.loadFromIndexDedup.test.ts
 *     for those locks).
 *
 * A single add/delete is deliberately OUT of scope here (paso 2 per the
 * ticket) and continues to rewrite every chunk — that is exercised by the
 * existing TASK-113/116/123/168 regression suites, left untouched.
 */

// Mock Firebase BEFORE any imports that use it
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn().mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false }),
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
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDocs = vi.fn()
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'card-1' }),
  collection: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
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

function makeIndexCard(i: number): IndexCard {
  return {
    i: `card-${i}`,
    s: `scryfall-${i}`,
    n: `Card ${i}`,
    st: 'collection',
    q: 1,
    p: 1,
    cm: 1,
    co: [],
    r: 'c',
    t: 'Creature',
    f: false,
    sc: 'M21',
    pw: '',
    to: '',
    fa: false,
    pm: [],
    kw: [],
    lg: [],
    ca: Date.now(),
    cn: 'NM',
    pb: true,
  }
}

/** Chunk numbers written this call, read off the mocked setDoc's `doc()` ref path. */
function writtenChunkNumbers(): number[] {
  return mockSetDoc.mock.calls
    .map(([ref]) => (ref as { path: string }).path)
    .map(path => parseInt(/chunk_(\d+)$/.exec(path)?.[1] ?? 'NaN', 10))
    .sort((a, b) => a - b)
}

describe('collection store: write only dirty card_index chunks (TASK-219)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockSetDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
  })

  /** Load a CARD_COUNT-card index (>= 30 chunks) via a single mocked chunk_0 doc. */
  async function loadLargeIndex(cardCount: number) {
    const cards = Array.from({ length: cardCount }, (_, idx) => makeIndexCard(idx))
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'chunk_0', data: () => ({ cards, version: 3 }) }],
    })
    const store = useCollectionStore()
    await store.loadCollection()
    return store
  }

  it('AC1: a single-card, membership-preserving status change writes exactly ONE chunk, not all of them', async () => {
    vi.useFakeTimers()
    try {
      // 60001 cards -> ceil(60001/2000) = 31 chunks. Pre-fix this wrote 31 setDoc calls.
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockGetDocs.mockClear()

      // card-0 lives in chunk_0 only; its status changes but it never leaves
      // the array (updateCard never touches membership).
      await store.updateCard('card-0', { status: 'sale' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockSetDoc).toHaveBeenCalledTimes(1)
      expect(writtenChunkNumbers()).toEqual([0])
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC1: a status change on a card deep in a later chunk writes only THAT chunk', async () => {
    vi.useFakeTimers()
    try {
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockGetDocs.mockClear()

      // card-60000 is the very last card -> position 60000 -> chunk 30
      // (Math.floor(60000 / 2000) === 30), the 31st and last chunk.
      await store.updateCard('card-60000', { status: 'wishlist' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockSetDoc).toHaveBeenCalledTimes(1)
      expect(writtenChunkNumbers()).toEqual([30])
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC1: batchUpdateCards across two different chunks writes exactly those two chunks', async () => {
    vi.useFakeTimers()
    try {
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockGetDocs.mockClear()

      // card-0 -> chunk 0, card-4000 -> chunk 2. Neither changes membership.
      await store.batchUpdateCards(['card-0', 'card-4000'], { status: 'trade' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockSetDoc).toHaveBeenCalledTimes(2)
      expect(writtenChunkNumbers()).toEqual([0, 2])
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC1: two sequential single-card updates in different chunks, once debounced together, write both chunks (not all 31)', async () => {
    vi.useFakeTimers()
    try {
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockGetDocs.mockClear()

      // Both land inside the same 2s debounce window and coalesce into one persist.
      await store.updateCard('card-0', { status: 'sale' })
      await store.updateCard('card-40000', { status: 'trade' }) // position 40000 -> chunk 20
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockSetDoc).toHaveBeenCalledTimes(2)
      expect(writtenChunkNumbers()).toEqual([0, 20])
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC3 (format equivalence): a partially-written chunk keeps the same document shape as a full rewrite', async () => {
    vi.useFakeTimers()
    try {
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockGetDocs.mockClear()

      await store.updateCard('card-0', { status: 'sale' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockSetDoc).toHaveBeenCalledTimes(1)
      const [ref, data] = mockSetDoc.mock.calls[0] as [{ path: string }, { cards: IndexCard[]; count: number; updatedAt: unknown }]
      expect(ref.path.endsWith('/chunk_0')).toBe(true)
      expect(data.count).toBe(data.cards.length)
      expect(data.cards).toHaveLength(2000) // full chunk_0, not just the one changed card
      expect(data.cards.find(c => c.i === 'card-0')?.st).toBe('sale')
      expect(data.updatedAt).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC2: totalChunks unchanged since the last write -> the orphan-cleanup getDocs is skipped on the second persist', async () => {
    vi.useFakeTimers()
    try {
      const store = await loadLargeIndex(60001)
      // First persist of the session still runs the cleanup once (no prior
      // known-good write to compare against) -> establish that baseline.
      mockSetDoc.mockClear()
      mockGetDocs.mockClear()
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

      await store.updateCard('card-0', { status: 'sale' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGetDocs).toHaveBeenCalledTimes(1) // the baseline cleanup read

      mockGetDocs.mockClear()

      // Second persist: totalChunks is identical (still 31, no add/delete in
      // between) -> the cleanup getDocs must NOT fire again.
      await store.updateCard('card-1', { status: 'trade' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockGetDocs).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('AC2: totalChunks SHRANK since the last write -> the orphan-cleanup getDocs still runs, exactly like before', async () => {
    vi.useFakeTimers()
    try {
      // 2001 cards -> ceil(2001/2000) = 2 chunks, so deleting just 2 survivors
      // drops totalChunks to 1 — and stays a single writeBatch (<= 500 ids),
      // no inter-batch delay to fake-timer around.
      const store = await loadLargeIndex(2001)

      // Baseline persist establishes _lastWrittenTotalChunks = 2.
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
      await store.updateCard('card-0', { status: 'sale' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)
      mockGetDocs.mockClear()
      mockSetDoc.mockClear()

      // Delete 2 cards -> 1999 survivors -> totalChunks drops from 2 to 1.
      // batchDeleteCards rebuilds cardIndexRaw wholesale (full rewrite,
      // untouched by this ticket's narrowing) — the cleanup check must still
      // run because totalChunks could plausibly have shrunk.
      await store.batchDeleteCards(['card-0', 'card-1'])
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockGetDocs).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('HIGH-1 (review of 80e2eee): a failed write does not lose dirty-chunk tracking — the chunk merges back into the next persist', async () => {
    vi.useFakeTimers()
    try {
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockGetDocs.mockClear()

      // First persist: only chunk 0 is dirty (card-0), but the write for it
      // fails (e.g. a transient network blip — the normal case on 4G).
      mockSetDoc.mockRejectedValueOnce(new Error('network blip'))
      await store.updateCard('card-0', { status: 'sale' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockSetDoc).toHaveBeenCalledTimes(1) // attempted chunk 0, and it threw

      mockSetDoc.mockClear()
      mockSetDoc.mockResolvedValue(undefined)

      // Second, unrelated mutation touches a DIFFERENT chunk only — nothing
      // re-touches card-0's chunk.
      await store.updateCard('card-40000', { status: 'trade' }) // position 40000 -> chunk 20
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      // Pre-fix: _dirtyChunks was reset to a fresh Set() before the failed
      // write and the snapshot (chunk 0) was discarded in the catch, so only
      // chunk 20 would be written here — chunk 0 never gets a second chance
      // to persist. Post-fix: the failed chunk 0 merges back and is written
      // alongside chunk 20.
      expect(writtenChunkNumbers()).toEqual([0, 20])
    } finally {
      vi.useRealTimers()
    }
  })

  it('HIGH-1: a failed FULL rewrite (dirtySnapshot === null) keeps everything dirty for the next persist', async () => {
    vi.useFakeTimers()
    try {
      // 2001 cards -> 2 chunks, and adding a card forces a full rewrite
      // (membership-changing mutations always mark everything dirty).
      const store = await loadLargeIndex(2001)
      mockSetDoc.mockClear()
      mockGetDocs.mockClear()
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

      mockSetDoc.mockRejectedValueOnce(new Error('network blip'))
      // Any setDoc failing during the full-rewrite loop rejects the whole
      // writeChunksConcurrently Promise.all, so the loop's catch runs even
      // though only the first chunk attempt actually failed.
      const { id: _id, updatedAt: _u, ...cardData } = { status: 'collection' as const, name: 'New Card', scryfallId: 'scryfall-new', edition: 'Test', setCode: 'TST', quantity: 1, condition: 'NM' as const, foil: false, language: 'en', price: 0, image: '', createdAt: new Date(), updatedAt: new Date() }
      await store.addCard(cardData as never)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      mockSetDoc.mockClear()
      mockSetDoc.mockResolvedValue(undefined)

      // A later, single-chunk-only mutation must still trigger a FULL
      // rewrite, because the prior failure left _dirtyChunks === null
      // ("everything dirty"), not narrowed to whatever this mutation alone touches.
      await store.updateCard('card-0', { status: 'sale' })
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(0)

      expect(writtenChunkNumbers()).toEqual([0, 1])
    } finally {
      vi.useRealTimers()
    }
  })
})
