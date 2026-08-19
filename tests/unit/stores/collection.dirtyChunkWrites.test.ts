/**
 * TASK-219 (paso 1 de TASK-176) narrowed card_index chunk writes from
 * updateCard/batchUpdateCards to only the chunk(s) actually touched,
 * instead of rewriting the whole index on every mutation.
 *
 * TASK-232 SUPERSEDES that narrowing for update/delete mutations, not by
 * weakening it but by making it categorical: updateCard, batchUpdateCards,
 * deleteCard and batchDeleteCards no longer write ANY card_index chunk from
 * the browser at all — the write moves server-side (applyCardIndexDelta,
 * functions/index.js), resolved from the card's own sticky `chunkId`
 * (TASK-230). "Write only the dirty chunk" and "write zero chunks" protect
 * the same thing (an update must not trigger a client write proportional to
 * the whole index) — the second is strictly stronger, so this is a
 * migration, not a downgrade. Team-lead sign-off, TASK-232 hand-off
 * 2026-08-13.
 *
 * PART A (below) replaces the old AC1/AC3 (narrow single-chunk write)
 * assertions — there is nothing left to narrow: updateCard/batchUpdateCards/
 * deleteCard/batchDeleteCards no longer call setDoc on card_index at all.
 *
 * PART B keeps the old AC2 (orphan-cleanup skip/run) and HIGH-1 (a failed
 * chunk write is not lost) locks alive by RE-POINTING them to addCard —
 * per the team-lead's explicit rule ("no borres un candado cuyo mecanismo
 * sigue vivo, re-apuntalo"): _runPersistLoop, the debounce/gen-token
 * machinery it drives, and the orphan-cleanup logic it runs are all still
 * live code, exercised by addCard (out of this ticket's scope) and by the
 * TASK-185 in-flight-load replay. addCard always does a FULL rewrite
 * (`markAllChunksDirty()`), so the narrow-vs-full DISTINCTION these two
 * locks used to probe via updateCard no longer has a live call site to
 * exercise it through — every remaining caller of _runPersistLoop forces a
 * full rewrite unconditionally. What both locks still meaningfully protect
 * (totalChunks-tracking for the cleanup skip, and "a failed write is
 * retried, not dropped") is real and stays tested below, just simplified to
 * a full-rewrite-only shape.
 *
 * Every assertion in this file was verified to go RED under the
 * pre-TASK-232 client-write behavior (temporarily restoring
 * persistIndexToFirestore()/setDoc calls to updateCard/batchUpdateCards/
 * deleteCard/batchDeleteCards makes PART A fail) — see TASK-232 hand-off
 * for the mutation-testing run.
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
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
  loadCollectionChunk: vi.fn(),
  loadCardPage: vi.fn(),
}))

vi.mock('@/services/publicCards', () => ({
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

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDocs = vi.fn()
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue(undefined)
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'card-1' })

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
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
import { useCollectionStore, type IndexCard } from '@/stores/collection'
import { applyCardIndexDelta } from '@/services/cloudFunctions'
import { makeCard } from '../helpers/fixtures'

const mockApplyCardIndexDelta = vi.mocked(applyCardIndexDelta)

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

describe('collection store: update/delete mutations write ZERO card_index chunks from the browser (TASK-232, supersedes TASK-219)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockSetDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
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

  describe('PART A — TASK-232', () => {
    it('updateCard: a status change writes ZERO card_index chunks; the delta moves server-side (debounced)', async () => {
      vi.useFakeTimers()
      try {
        const store = await loadLargeIndex(60001)
        mockSetDoc.mockClear()
        mockApplyCardIndexDelta.mockClear()

        await store.updateCard('card-0', { status: 'sale' })
        await vi.advanceTimersByTimeAsync(2100)

        expect(mockSetDoc).not.toHaveBeenCalled()
        expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
        expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'card-0', action: 'update' }])
      } finally {
        vi.useRealTimers()
      }
    })

    it('updateCard: two edits inside the same debounce window coalesce into ONE applyCardIndexDelta call', async () => {
      vi.useFakeTimers()
      try {
        const store = await loadLargeIndex(60001)
        mockSetDoc.mockClear()
        mockApplyCardIndexDelta.mockClear()

        await store.updateCard('card-0', { status: 'sale' })
        await store.updateCard('card-40000', { status: 'trade' })
        await vi.advanceTimersByTimeAsync(2100)

        expect(mockSetDoc).not.toHaveBeenCalled()
        expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
        const [mutations] = mockApplyCardIndexDelta.mock.calls[0]
        expect(mutations.map(m => m.cardId).sort()).toEqual(['card-0', 'card-40000'])
      } finally {
        vi.useRealTimers()
      }
    })

    it('batchUpdateCards: writes ZERO card_index chunks; applies via applyCardIndexDelta for the whole lot', async () => {
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockApplyCardIndexDelta.mockClear()

      await store.batchUpdateCards(['card-0', 'card-4000'], { status: 'trade' })

      expect(mockSetDoc).not.toHaveBeenCalled()
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
      const [mutations] = mockApplyCardIndexDelta.mock.calls[0]
      expect(mutations).toEqual(
        expect.arrayContaining([
          { cardId: 'card-0', action: 'update' },
          { cardId: 'card-4000', action: 'update' },
        ])
      )
    })

    it('deleteCard: writes ZERO card_index chunks; the delta is applied BEFORE the doc is deleted', async () => {
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockApplyCardIndexDelta.mockClear()
      mockDeleteDoc.mockClear()

      const ok = await store.deleteCard('card-0')

      expect(ok).toBe(true)
      expect(mockSetDoc).not.toHaveBeenCalled()
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'card-0', action: 'delete' }])
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
      // Ordering matters (TASK-232 design): the delta call reads chunkId off
      // the card doc, so it must run while the doc still exists.
      const deltaOrder = mockApplyCardIndexDelta.mock.invocationCallOrder[0]
      const deleteOrder = mockDeleteDoc.mock.invocationCallOrder[0]
      expect(deltaOrder).toBeLessThan(deleteOrder)
    })

    it('batchDeleteCards: writes ZERO card_index chunks; the delta batch is applied BEFORE Phase 1 deletes the docs', async () => {
      const store = await loadLargeIndex(60001)
      mockSetDoc.mockClear()
      mockApplyCardIndexDelta.mockClear()
      mockCommit.mockClear()

      const result = await store.batchDeleteCards(['card-0', 'card-4000'])

      expect(result.success).toBe(true)
      expect(mockSetDoc).not.toHaveBeenCalled()
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
      const [mutations] = mockApplyCardIndexDelta.mock.calls[0]
      expect(mutations).toEqual(
        expect.arrayContaining([
          { cardId: 'card-0', action: 'delete' },
          { cardId: 'card-4000', action: 'delete' },
        ])
      )
      const deltaOrder = mockApplyCardIndexDelta.mock.invocationCallOrder[0]
      const commitOrder = mockCommit.mock.invocationCallOrder[0]
      expect(deltaOrder).toBeLessThan(commitOrder)
    })
  })

  describe('PART B — the surviving _runPersistLoop protections, re-pointed to addCard (still live code)', () => {
    it('AC2: totalChunks unchanged since the last write -> the orphan-cleanup getDocs is skipped on the second persist', async () => {
      vi.useFakeTimers()
      try {
        const store = await loadLargeIndex(60001)
        mockGetDocs.mockClear()
        mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

        // Baseline addCard persist establishes _lastWrittenTotalChunks.
        mockAddDoc.mockResolvedValueOnce({ id: 'new-card-1' })
        const { id: _id1, updatedAt: _u1, ...cardData1 } = makeCard({ id: 'ignored-1' })
        await store.addCard(cardData1 as never)
        await vi.advanceTimersByTimeAsync(2100)
        expect(mockGetDocs).toHaveBeenCalledTimes(1) // the baseline cleanup read

        mockGetDocs.mockClear()

        // Second addCard: still well under the next chunk boundary, so
        // totalChunks is unchanged -> the cleanup getDocs must NOT fire.
        mockAddDoc.mockResolvedValueOnce({ id: 'new-card-2' })
        const { id: _id2, updatedAt: _u2, ...cardData2 } = makeCard({ id: 'ignored-2' })
        await store.addCard(cardData2 as never)
        await vi.advanceTimersByTimeAsync(2100)

        expect(mockGetDocs).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    // AC2 SHRINK (team-lead HIGH-2, review of the first cut of this file):
    // batchDeleteCards no longer calls persistIndexToFirestore itself
    // (TASK-232), but it STILL shrinks cardIndexRaw locally (in-memory
    // filter, no Firestore write — see batchDeleteCards' "Sync LOCAL
    // in-memory index only" block). That local shrink is real and live: the
    // NEXT addCard-triggered persist computes totalChunks off the
    // now-smaller cardIndexRaw, which can fall below
    // _lastWrittenTotalChunks — exactly the condition the orphan-cleanup
    // guard exists to catch. My first cut of this file wrongly concluded
    // there was no live shrink trigger left and omitted this case; there is
    // one, it just moved from "batchDeleteCards' own persist" to "the next
    // addCard's persist inheriting a locally-shrunk cardIndexRaw".
    it('AC2: totalChunks SHRANK since the last write (via batchDeleteCards shrinking cardIndexRaw locally) -> the next persist still runs the cleanup', async () => {
      vi.useFakeTimers()
      try {
        const store = await loadLargeIndex(2001)
        mockGetDocs.mockClear()
        mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

        // Baseline addCard persist: 2001 -> 2002 cards, still 2 chunks.
        // Establishes _lastWrittenTotalChunks = 2.
        mockAddDoc.mockResolvedValueOnce({ id: 'new-card-1' })
        const { id: _id1, updatedAt: _u1, ...cardData1 } = makeCard({ id: 'ignored-1' })
        await store.addCard(cardData1 as never)
        await vi.advanceTimersByTimeAsync(2100)
        expect(mockGetDocs).toHaveBeenCalledTimes(1) // baseline cleanup read
        mockGetDocs.mockClear()
        mockSetDoc.mockClear()

        // Shrink via batchDeleteCards: 2002 -> 1997 cards. No client
        // card_index write here (TASK-232) — cardIndexRaw shrinks locally.
        await store.batchDeleteCards(['card-0', 'card-1', 'card-2', 'card-3', 'card-4'])
        expect(mockSetDoc).not.toHaveBeenCalled() // confirms TASK-232 holds: still zero client writes
        mockGetDocs.mockClear()

        // Next addCard: 1997 -> 1998 cards -> ceil(1998/2000) = 1 chunk,
        // down from the baseline's 2 -> the cleanup getDocs MUST fire.
        mockAddDoc.mockResolvedValueOnce({ id: 'new-card-2' })
        const { id: _id2, updatedAt: _u2, ...cardData2 } = makeCard({ id: 'ignored-2' })
        await store.addCard(cardData2 as never)
        await vi.advanceTimersByTimeAsync(2100)

        expect(mockGetDocs).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    // HIGH-1 "failed chunk write is not lost, merges into the next persist"
    // (the `_dirtyChunks` snapshot/merge-back logic in _runPersistLoop's
    // catch block) is DELIBERATELY NOT TESTED here — a reviewer in fresh
    // context (TASK-232 review) measured that the version of this test that
    // used to live here was VACUOUS: it drove the scenario via addCard,
    // and addCard always calls markAllChunksDirty() first — so
    // `dirtySnapshot` at the merge-back site is always `null`, the `if`
    // branch (not the `else` that actually merges a narrow set) is the only
    // one ever taken, and "chunk 0 appears in the next full rewrite" is
    // true unconditionally regardless of whether the merge-back code exists
    // at all. Deleting the mechanism is out of this ticket's scope (it's
    // still correct if a narrow-dirty caller returns — see TASK-176) and
    // cheap to leave in place; a test that cannot fail when the thing it
    // claims to protect is broken is worse than no test, so it was removed
    // instead of kept green for the wrong reason. Making it "real" again
    // would require a live caller that narrows `_dirtyChunks` to a proper
    // subset before a persist fails — none exists post-TASK-232 (updateCard/
    // batchUpdateCards no longer reach _runPersistLoop at all). Restore this
    // lock if/when TASK-176 (or similar) reintroduces one.
  })
})
