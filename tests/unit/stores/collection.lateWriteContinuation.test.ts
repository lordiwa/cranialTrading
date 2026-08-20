/**
 * TASK-255 round 1 review (ec5f49b) — reviewer-found HIGH-1 and MEDIUM-1.
 *
 * withTimeout does NOT cancel the underlying Firestore write — the web SDK
 * gives no way to abort a pending operation. A write that timed out
 * client-side can still commit on the server LATE (TASK-229 measured
 * pending writes converging as late as ~4 minutes after the client gave
 * up, with the tab still open). This file locks the two continuations that
 * handle that late landing:
 *
 * HIGH-1 (addCard): before this fix, a timed-out addDoc meant the new
 * doc's id was NEVER known client-side — if the write later landed for
 * real, there was no way to backfill its card_index entry at all: a live
 * document, no index entry, permanently invisible, with zero client-side
 * trace. Fix: addCard now pre-generates the id via `doc(colRef)` and
 * writes with `setDoc`, so a late-landing write can still be indexed.
 *
 * MEDIUM-1 (deleteCard): the gap #1 compensation (re-insert the index
 * entry) fires on ANY non-not-found deleteDoc failure, including a
 * TimeoutError. If the delete ALSO lands late (for real, after the
 * compensation already ran), the compensation's reinsert becomes a
 * phantom index entry — a card_index entry with no document behind it.
 * Fix: on a TimeoutError specifically, deleteCard now attaches a
 * continuation to the ORIGINAL deleteDoc promise that removes the entry
 * again if the delete commits late.
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

const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue(undefined)
const mockGetDocs = vi.fn().mockResolvedValue({ empty: true, docs: [] })
const mockGetCountFromServer = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) })
const mockDoc = vi.fn((...args: unknown[]) => (
  args.length === 1 ? { id: 'new-card', path: 'users/test-user-id/cards/new-card' } : { path: args.join('/') }
))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getCountFromServer: (...args: unknown[]) => mockGetCountFromServer(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: vi.fn().mockResolvedValue(undefined),
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

describe('collection store: TASK-255 round 1 — a write that lands AFTER its own timeout must still be reconciled', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockSetDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('HIGH-1: addCard', () => {
    it('indexes a LATE-landing setDoc — the id was pre-generated, so a write that commits after the timeout can still be reconciled', async () => {
      const store = useCollectionStore()
      let settle: (() => void) | null = null
      mockSetDoc.mockImplementationOnce(() => new Promise<void>((resolve) => { settle = resolve }))

      const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...cardData } = makeCard({ id: 'ignored' })
      const addPromise = store.addCard(cardData as any)

      await vi.advanceTimersByTimeAsync(20000) // past CARD_WRITE_TIMEOUT_MS
      const result = await addPromise
      expect(result).toBeNull() // addCard already reported failure to its caller

      // Now the write actually lands, minutes later (TASK-229).
      expect(settle).not.toBeNull()
      settle!()
      await vi.waitFor(() => {
        expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'new-card', action: 'update', allowInsert: true }])
      })
    })

    it('does NOT attempt to index a write that never lands at all', async () => {
      const store = useCollectionStore()
      mockSetDoc.mockImplementationOnce(() => new Promise<void>(() => {})) // never settles, ever

      const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...cardData } = makeCard({ id: 'ignored' })
      const addPromise = store.addCard(cardData as any)
      await vi.advanceTimersByTimeAsync(20000)
      await addPromise

      await vi.advanceTimersByTimeAsync(300000) // 5 more minutes — still nothing
      expect(mockApplyCardIndexDelta).not.toHaveBeenCalled()
    })
  })

  describe('MEDIUM-1: deleteCard', () => {
    it('removes the compensated (phantom) index entry when a timed-out deleteDoc lands late for real', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      let settle: (() => void) | null = null
      mockDeleteDoc.mockImplementationOnce(() => new Promise<void>((resolve) => { settle = resolve }))

      const deletePromise = store.deleteCard('card-1')
      await vi.advanceTimersByTimeAsync(20000)
      const ok = await deletePromise
      expect(ok).toBe(false)

      // Immediate compensation already fired (locked separately in
      // collection.hangCompensation.test.ts) — confirm it happened here too.
      expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'card-1', action: 'update', allowInsert: true }])
      // deleteCard's own NORMAL flow already issues ONE 'delete' delta
      // up front (before ever attempting deleteDoc) — count it here so the
      // assertion below can prove a SECOND one came from the continuation,
      // not just match this pre-existing call again.
      const deleteCallsBeforeLateLanding = mockApplyCardIndexDelta.mock.calls.filter(
        ([mutations]) => mutations[0]?.action === 'delete',
      ).length
      expect(deleteCallsBeforeLateLanding).toBe(1)

      // The delete actually commits late — the phantom entry must be cleaned up.
      expect(settle).not.toBeNull()
      settle!()
      await vi.waitFor(() => {
        const deleteCallsAfter = mockApplyCardIndexDelta.mock.calls.filter(
          ([mutations]) => mutations[0]?.action === 'delete',
        ).length
        expect(deleteCallsAfter).toBe(2)
      })
    })

    it('does NOT attach a late-landing continuation for a GENUINE (non-timeout) deleteDoc failure', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any

      mockDeleteDoc.mockRejectedValueOnce(Object.assign(new Error('permission blip'), { code: 'permission-denied' }))

      const ok = await store.deleteCard('card-1')
      expect(ok).toBe(false)

      mockApplyCardIndexDelta.mockClear()
      // Nothing further should ever fire for this call — advancing time
      // must not surface a delayed 'delete' delta that was never queued.
      await vi.advanceTimersByTimeAsync(300000)
      expect(mockApplyCardIndexDelta).not.toHaveBeenCalled()
    })
  })
})
