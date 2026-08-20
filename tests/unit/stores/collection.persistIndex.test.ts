/**
 * Regression test for TASK-123: two _doPersistIndex writes in flight at once
 * can interleave their chunk writes on the wire — a STALE write can resolve
 * AFTER a NEWER write and clobber it, leaving Firestore's card_index holding
 * older data than what the user's last mutation actually produced.
 *
 * Root cause (reviewer MEDIUM finding on TASK-116): _doPersistIndex is a
 * fire-and-forget async IIFE that snapshots cardIndexRaw at call time, then
 * writes ~30 sequential chunks for 59k cards (a multi-second window). If the
 * debounced timer fires again and calls _doPersistIndex a second time before
 * the first invocation's writes have settled, TWO write loops run
 * concurrently. Firestore network requests can resolve out of order, so the
 * OLDER (stale) loop's write can land on the wire after the NEWER loop's
 * write — leaving the stale snapshot as the final persisted state.
 *
 * The fix must serialize persists: at most one write loop in flight at a
 * time. A call that arrives while one is running is coalesced into a single
 * rerun that re-snapshots cardIndexRaw once the in-flight loop settles —
 * guaranteeing the final Firestore state always reflects the newest local
 * data, regardless of how the underlying network requests happen to resolve.
 *
 * TASK-232: this used to drive the race via TWO updateCard calls.
 * updateCard no longer writes card_index chunks from the browser at all
 * (see collection.dirtyChunkWrites.test.ts) — but the serialization
 * mechanism this test locks (_doPersistIndex/_runPersistLoop's
 * gen-token/_persistRunning guard) is still live code: addCard (out of
 * TASK-232's scope) still drives it. Re-pointed to two addCard calls per
 * the team-lead's "re-apuntalar, no borrar" rule — the race and the
 * property under test (newest snapshot always wins, regardless of network
 * resolution order) are identical, only the trigger changed.
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
const mockSetDoc = vi.fn()
const mockCommit = vi.fn().mockResolvedValue(undefined)

// TASK-255 round 1 (HIGH-1 fix): addCard pre-generates the new doc's id via
// `doc(colRef)` (ONE arg) — queueNewCardIds replaces the old
// `mockAddDoc.mockResolvedValueOnce({id:...})` chaining.
let mockNewCardIdQueue: string[] = []
const queueNewCardIds = (...ids: string[]) => { mockNewCardIdQueue = [...ids] }
const nextNewCardId = () => (mockNewCardIdQueue.length > 0 ? mockNewCardIdQueue.shift()! : 'card-1')

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args: unknown[]) => (
    args.length === 1 ? { id: nextNewCardId(), path: 'ignored' } : { path: args.join('/') }
  )),
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
import { queryCardIndex } from '@/services/cloudFunctions'
import { makeCard } from '../helpers/fixtures'

const mockQueryCardIndex = vi.mocked(queryCardIndex)

describe('collection store: serialize card_index persist (TASK-123 regression)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockNewCardIdQueue = []
    mockQueryCardIndex.mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false })
  })

  it('a stale in-flight write that resolves AFTER a newer one must not clobber the newest chunk (no interleaved persists)', async () => {
    vi.useFakeTimers()
    try {
      // Seed cardIndexRaw with a single card via addCard, then flush its own
      // seeding persist so it doesn't interfere with the scenario below.
      mockSetDoc.mockResolvedValue(undefined)
      queueNewCardIds('card-1')
      const { id: _id, updatedAt: _u, ...cardData } = makeCard({ id: 'ignored', status: 'collection' })
      const store = useCollectionStore()
      await store.addCard(cardData as any)
      await vi.advanceTimersByTimeAsync(2100)
      mockSetDoc.mockClear()

      // Every CHUNK setDoc call now blocks until the test explicitly resolves
      // it — simulating in-flight Firestore writes whose network responses
      // can arrive in any order. `serverChunk` mirrors whatever chunk write
      // was last RESOLVED (i.e. last to "land" on the server), which is
      // exactly the property that must always match the newest local
      // snapshot.
      //
      // TASK-255 round 1 (HIGH-1 fix): addCard's OWN card-document write now
      // ALSO goes through setDoc — gating every call unconditionally would
      // hang card-2/card-3's own doc creation forever (their payload has no
      // `cards` array). Dispatch on payload shape: only a chunk write
      // (payload.cards is an array) gets queued into `pending`; a card-doc
      // write resolves immediately, untouched.
      let serverChunk: Array<{ i: string; st: string }> | null = null
      const pending: Array<{ resolved: boolean; resolve: () => void }> = []
      mockSetDoc.mockImplementation((_ref: unknown, data: { cards?: Array<{ i: string; st: string }> }) => {
        if (!Array.isArray(data.cards)) return Promise.resolve() // the new card's own document write
        const cards = data.cards
        return new Promise<void>((resolve) => {
          pending.push({
            resolved: false,
            resolve: () => {
              serverChunk = cards
              resolve()
            },
          })
        })
      })

      // Mutation 1: add card-2. Its debounced persist fires and starts
      // writing (blocks on the mocked setDoc) — the snapshot at this point
      // is [card-1, card-2].
      queueNewCardIds('card-2')
      const { id: _id2, updatedAt: _u2, ...cardData2 } = makeCard({ id: 'ignored-2' })
      await store.addCard(cardData2 as any)
      await vi.advanceTimersByTimeAsync(2000)
      expect(pending.length).toBeGreaterThanOrEqual(1)

      // Mutation 2 lands WHILE the first write is still in flight — the
      // ~30-sequential-setDoc multi-second window from the real 59k-card
      // case. Its own debounced persist then fires too, with the NEWER
      // snapshot [card-1, card-2, card-3].
      queueNewCardIds('card-3')
      const { id: _id3, updatedAt: _u3, ...cardData3 } = makeCard({ id: 'ignored-3' })
      await store.addCard(cardData3 as any)
      await vi.advanceTimersByTimeAsync(2100)

      // Drain every write, always resolving the MOST RECENTLY ISSUED
      // unresolved write first (out-of-order network arrival) — the exact
      // scenario the ticket describes. Serialized code never has more than
      // one unresolved write at a time, so this degenerates into resolving
      // each write as it appears; unserialized code has two simultaneously
      // in flight, and resolving the newer one first exposes the bug when
      // the older one resolves afterwards and overwrites it.
      let guard = 0
      while (pending.some(p => !p.resolved) && guard < 20) {
        guard++
        let lastUnresolvedIdx = -1
        for (let i = pending.length - 1; i >= 0; i--) {
          if (!pending[i].resolved) { lastUnresolvedIdx = i; break }
        }
        if (lastUnresolvedIdx === -1) break
        pending[lastUnresolvedIdx].resolved = true
        pending[lastUnresolvedIdx].resolve()
        // eslint-disable-next-line no-await-in-loop
        await vi.advanceTimersByTimeAsync(0)
      }

      // The final persisted state must reflect the NEWEST snapshot (all
      // three cards), never the stale intermediate one (missing card-3) —
      // regardless of how many separate write loops ran or in what order
      // their writes resolved.
      expect(serverChunk).not.toBeNull()
      const finalIds = (serverChunk as unknown as Array<{ i: string; st: string }>).map(c => c.i).sort()
      expect(finalIds).toEqual(['card-1', 'card-2', 'card-3'])
    } finally {
      vi.useRealTimers()
    }
  })
})
