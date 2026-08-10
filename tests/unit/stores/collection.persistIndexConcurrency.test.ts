/**
 * TASK-155: _runPersistLoop wrote card_index chunks strictly sequentially
 * (`for (...) { await setDoc(...) }`), one setDoc awaited fully before the
 * next started. Measured live against the 41k-card dev account: each chunk
 * took 4-9s (one took 61s), and a 150s window wasn't enough for the loop
 * (21 chunks) to finish — it was still on chunk 18/21. A page reload before
 * the loop finishes loses the card_index update entirely (the setTimeout/
 * async chain dies with the JS context), even though the card document
 * itself was already saved.
 *
 * Fix: bound-concurrency worker pool instead of one writeBatch. A single
 * writeBatch was ruled out — TASK-116/120's prior attempt at batching 30
 * chunks failed 5 times in a row hitting Firestore's 10 MiB per-batch limit;
 * 21 chunks of 2000 cards each do not fit in one 10 MiB batch either. Bounded
 * concurrency (N setDoc calls in flight at once, each independent) sidesteps
 * the 10 MiB batch ceiling entirely — every write is its own document,
 * already safely under Firestore's 1 MB per-doc limit by construction (that's
 * why INDEX_CHUNK_SIZE is 2000, not larger) — while still cutting the number
 * of serial steps from `totalChunks` down to `ceil(totalChunks / N)`.
 *
 * This test proves two properties of the fix:
 *  1. PARALLELISM: more than one chunk write is in flight at the same time
 *     (the sequential loop never has more than 1).
 *  2. BOUNDED: the number of simultaneously in-flight writes never exceeds
 *     the concurrency cap, regardless of how many chunks exist.
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
const mockSetDoc = vi.fn()
const mockGetDocs = vi.fn()
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'card-1' }),
  collection: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
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

describe('collection store: bounded-concurrency card_index chunk writes (TASK-155)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
  })

  it('writes multiple chunks concurrently, never exceeding the concurrency cap', async () => {
    vi.useFakeTimers()
    try {
      // 12,001 cards -> ceil(12001 / 2000) = 7 chunks, more than any
      // reasonable concurrency cap, to prove BOTH properties at once.
      const CARD_COUNT = 12001
      const cards = Array.from({ length: CARD_COUNT }, (_, idx) => makeIndexCard(idx))

      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        // The doc `id` matters since TASK-168: loadFromIndex orders chunks
        // numerically and decides whether the chunk set is complete (contiguous
        // from 0) before the persist is allowed to delete anything. Real
        // Firestore snapshots always carry an id; this fixture was omitting it.
        docs: [{ id: 'chunk_0', data: () => ({ cards, version: 3 }) }],
      })

      const store = useCollectionStore()
      const loaded = await store.loadCollection()
      void loaded

      // Track concurrency: every setDoc call blocks until manually resolved,
      // and we record the in-flight count at the moment each call starts.
      let inFlight = 0
      let peakInFlight = 0
      const resolvers: Array<() => void> = []
      mockSetDoc.mockImplementation(() => {
        inFlight++
        peakInFlight = Math.max(peakInFlight, inFlight)
        return new Promise<void>((resolve) => {
          resolvers.push(() => {
            inFlight--
            resolve()
          })
        })
      })

      // Trigger a mutation so the debounced persist fires again with the
      // freshly-loaded 7-chunk cardIndexRaw.
      await store.updateCard('card-0', { status: 'sale' })
      await vi.advanceTimersByTimeAsync(2000)

      // Drain all writes in waves, resolving whatever is currently in
      // flight (mirrors a bounded worker pool pulling the next chunk as
      // soon as a slot frees up) until all 7 chunks have been written.
      let totalResolved = 0
      let guard = 0
      while (totalResolved < 7 && guard < 50) {
        guard++
        if (resolvers.length === 0) {
          // eslint-disable-next-line no-await-in-loop
          await vi.advanceTimersByTimeAsync(0)
          continue
        }
        const batch = resolvers.splice(0, resolvers.length)
        batch.forEach((r) => r())
        totalResolved += batch.length
        // eslint-disable-next-line no-await-in-loop
        await vi.advanceTimersByTimeAsync(0)
      }

      expect(mockSetDoc).toHaveBeenCalledTimes(7)
      // PARALLELISM: more than one write was in flight at once (sequential
      // code would never exceed 1).
      expect(peakInFlight).toBeGreaterThan(1)
      // BOUNDED: never runs every chunk at once regardless of chunk count —
      // there is an explicit cap.
      expect(peakInFlight).toBeLessThanOrEqual(7)
      expect(peakInFlight).toBeLessThan(7)
    } finally {
      vi.useRealTimers()
    }
  })
})
