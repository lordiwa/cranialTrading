/**
 * TASK-232 gap #1 (team-lead review of the initial design): calling
 * applyCardIndexDelta('delete') BEFORE deleteDoc creates a new failure
 * window — if the delta succeeds but the actual Firestore doc delete then
 * fails for a REAL reason (not not-found), the card document survives but
 * its card_index entry is already gone: an invisible card (exists, but
 * missing from every filtered/paginated view fed by the index).
 *
 * Fix: on a genuine deleteDoc failure, compensate by calling
 * applyCardIndexDelta again with { action: 'update', allowInsert: true } —
 * the doc still exists at that point with its real chunkId, so re-inserting
 * its entry is grounded in a fresh server read, not a guess.
 *
 * This file locks that compensation for both deleteCard (single) and
 * batchDeleteCards (bulk, for the subset of ids whose Phase 1 delete
 * permanently failed).
 */

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
import { applyCardIndexDelta } from '@/services/cloudFunctions'
import { makeCard } from '../helpers/fixtures'

const mockApplyCardIndexDelta = vi.mocked(applyCardIndexDelta)

describe('collection store: TASK-232 gap #1 — a failed doc delete must not leave an invisible card', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 })
  })

  describe('deleteCard', () => {
    it('compensates with an allowInsert restore when the delta succeeded but the real deleteDoc failed', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      // A REAL failure (not not-found) — the doc delete genuinely failed,
      // so the card document is still there.
      mockDeleteDoc.mockRejectedValueOnce(Object.assign(new Error('network blip'), { code: 'unavailable' }))

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(false)
      // 1st call: the normal pre-delete removal. 2nd call: the compensation
      // that re-inserts the entry the first call just removed.
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(2)
      expect(mockApplyCardIndexDelta).toHaveBeenNthCalledWith(1, [{ cardId: 'card-1', action: 'delete' }])
      expect(mockApplyCardIndexDelta).toHaveBeenNthCalledWith(2, [{ cardId: 'card-1', action: 'update', allowInsert: true }])
    })

    it('does NOT compensate when deleteDoc succeeds — only the normal delete delta runs', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(true)
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'card-1', action: 'delete' }])
    })

    it('does NOT compensate on a not-found deleteDoc failure — the doc is legitimately already gone, nothing to restore', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'not-found' }))

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(true)
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
    })
  })

  describe('batchDeleteCards', () => {
    it('compensates only the ids whose Phase 1 delete permanently failed, not the ones that succeeded', async () => {
      const store = useCollectionStore()
      const card1 = makeCard({ id: 'card-1' })
      const card2 = makeCard({ id: 'card-2' })
      store.cards = [card1, card2] as any
      store.paginatedCards = [card1, card2] as any

      // commitBatchWithRetry: the whole writeBatch fails, so it's retried
      // one-by-one — simulate the split by having the aggregate ALWAYS fail,
      // forcing per-chunk failure reporting for both ids (BATCH_SIZE=200
      // means both land in ONE chunk here, so both get marked failed).
      mockCommit.mockRejectedValue(Object.assign(new Error('permission'), { code: 'permission-denied' }))

      const result = await store.batchDeleteCards(['card-1', 'card-2'])

      expect(result.failed).toBe(2)
      // Phase 0: both removed from card_index up front.
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([
        { cardId: 'card-1', action: 'delete' },
        { cardId: 'card-2', action: 'delete' },
      ])
      // Compensation: both restored, since both permanently failed.
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([
        { cardId: 'card-1', action: 'update', allowInsert: true },
        { cardId: 'card-2', action: 'update', allowInsert: true },
      ])
    })

    it('does NOT compensate when every doc delete succeeds', async () => {
      const store = useCollectionStore()
      const card1 = makeCard({ id: 'card-1' })
      const card2 = makeCard({ id: 'card-2' })
      store.cards = [card1, card2] as any
      store.paginatedCards = [card1, card2] as any

      const result = await store.batchDeleteCards(['card-1', 'card-2'])

      expect(result.failed).toBe(0)
      // Only the Phase 0 delete delta — no compensation call.
      expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([
        { cardId: 'card-1', action: 'delete' },
        { cardId: 'card-2', action: 'delete' },
      ])
    })
  })
})

describe('collection store: TASK-232 gap #2 — a missing/unresolvable chunkId must never be silent', () => {
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

  it('logs a warning client-side when applyCardIndexDelta reports a skipped mutation — never a silent stale/missing card_index entry', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mockApplyCardIndexDelta.mockResolvedValueOnce({ applied: 0, skipped: 1, skippedIds: ['card-1'], fallbackUsed: 0 })
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(true)
      // The store's applyCardIndexDelta wrapper (every call site funnels
      // through it) must surface a non-zero `skipped` — a skip is not a
      // thrown error, so without this the response would otherwise be
      // silently discarded (every call site does `await
      // applyCardIndexDelta(...)` and ignores the return value beyond this
      // check).
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('could not resolve 1 mutation'),
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('card-1'))
    } finally {
      consoleWarnSpy.mockRestore()
    }
  })

  it('does NOT log when nothing was skipped — silence only when there is genuinely nothing to report', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mockApplyCardIndexDelta.mockResolvedValueOnce({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 })
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      await store.deleteCard('card-1')

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    } finally {
      consoleWarnSpy.mockRestore()
    }
  })
})
