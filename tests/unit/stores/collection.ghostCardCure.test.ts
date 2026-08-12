/**
 * Regression tests for TASK-223: curing "ghost" cards — card_index entries
 * whose Firestore document no longer exists. A mutation against a ghost
 * throws `not-found`; the app must self-heal (remove the ghost from every
 * in-memory place it lives + persist the index) instead of reverting the UI
 * and showing an error. See src/stores/collection.ts updateCard/deleteCard/
 * batchUpdateCards/batchDeleteCards (~lines 1277/1371/1493/1641).
 *
 * SOLO the exact Firestore error code 'not-found' may trigger the cure —
 * AC4 below asserts every OTHER code (permission-denied, unavailable,
 * deadline-exceeded, resource-exhausted, and a generic error with no code
 * at all) behaves exactly as before: rollback + error, nothing removed.
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
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue(undefined)
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'card-1' })

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: vi.fn(),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
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

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      username: 'testuser',
    },
  })),
}))

vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({
    show: vi.fn(),
  })),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore } from '@/stores/collection'
import { makeCard } from '../helpers/fixtures'

/** A Firestore-shaped error carrying an exact `.code`, the only signal the cure may react to. */
const firestoreError = (code: string, message = `simulated ${code}`): Error & { code: string } => {
  const err = new Error(message) as Error & { code: string }
  err.code = code
  return err
}

const OTHER_CODES = ['permission-denied', 'unavailable', 'deadline-exceeded', 'resource-exhausted']

describe('collection store: ghost card cure (TASK-223)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // .mockReset() (not just clearAllMocks) on the mock fns THIS file queues
    // once-implementations onto: clearAllMocks only wipes call history — any
    // unconsumed `.mockRejectedValueOnce`/`.mockResolvedValueOnce` queued by
    // a previous test (e.g. a batchUpdateCards test whose per-card updateDoc
    // fallback isn't reached yet under the pre-fix code) would otherwise
    // survive into the next test and silently swap its result. Scoped to
    // these five (not vi.resetAllMocks()) so the firebase/firestore factory's
    // other default implementations (doc/collection/getDocs/writeBatch) stay
    // intact.
    mockUpdateDoc.mockReset().mockResolvedValue(undefined)
    mockDeleteDoc.mockReset().mockResolvedValue(undefined)
    mockSetDoc.mockReset().mockResolvedValue(undefined)
    mockCommit.mockReset().mockResolvedValue(undefined)
    mockAddDoc.mockReset().mockResolvedValue({ id: 'card-1' })
  })

  describe('updateCard — AC1', () => {
    it('cures the ghost (removes from cards, cardIndex, and paginatedCards) instead of reverting, on a not-found update', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1', status: 'collection' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found', 'No document to update: .../cards/ghost-1'))

      const ok = await store.updateCard('ghost-1', { status: 'sale' })

      expect(ok).toBe(true)
      expect(store.cards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
      expect(store.paginatedCards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
    })

    it('does not show the generic updateError toast for a not-found ghost', async () => {
      const { useToastStore } = await import('@/stores/toast')
      const toastStore = useToastStore()
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1' })
      store.cards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found'))

      await store.updateCard('ghost-1', { status: 'sale' })

      expect(toastStore.show).not.toHaveBeenCalled()
    })

    it('persists the cured index to Firestore (debounced)', async () => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const card = makeCard({ id: 'ghost-1' })
        store.cards = [card] as any
        // Seed cardIndexRaw the same way real sessions populate it.
        store.cardIndexRaw = [{ i: 'ghost-1', s: 's1', n: 'Ghost', st: 'collection', q: 1, p: 0, cm: 0, co: [], r: 'c', t: '', f: false, sc: '', pw: '', to: '', fa: false, pm: [], kw: [], lg: [], ca: Date.now(), cn: 'NM', pb: true }] as any
        mockUpdateDoc.mockRejectedValueOnce(firestoreError('not-found'))

        await store.updateCard('ghost-1', { status: 'sale' })
        await vi.advanceTimersByTimeAsync(2100)

        expect(mockSetDoc).toHaveBeenCalled()
        const [, chunkData] = mockSetDoc.mock.calls[0]
        expect((chunkData.cards as Array<{ i: string }>).find(c => c.i === 'ghost-1')).toBeUndefined()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('deleteCard — AC2', () => {
    it('terminates successfully (ok=true) and the card stays gone from the grid when the doc is already gone (not-found)', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(firestoreError('not-found'))

      const ok = await store.deleteCard('ghost-1')

      expect(ok).toBe(true)
      expect(store.cards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
      expect(store.paginatedCards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
    })

    it('does not restore the card on a not-found delete (unlike a genuine failure)', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'ghost-1' })
      store.cards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(firestoreError('not-found'))

      await store.deleteCard('ghost-1')

      expect(store.cards).toHaveLength(0)
    })
  })

  describe('batchUpdateCards — AC3', () => {
    it('applies the update to surviving cards and cures the one ghost inside the same lot', async () => {
      const store = useCollectionStore()
      const good = makeCard({ id: 'good-1', status: 'collection' })
      const ghost = makeCard({ id: 'ghost-1', status: 'collection' })
      store.cards = [good, ghost] as any
      store.paginatedCards = [good, ghost] as any
      // Atomic batch.commit() fails because ghost-1 doesn't exist server-side.
      mockCommit.mockRejectedValueOnce(firestoreError('not-found'))
      // Fallback per-card retry: good-1 succeeds, ghost-1 fails not-found again.
      mockUpdateDoc
        .mockResolvedValueOnce(undefined) // good-1
        .mockRejectedValueOnce(firestoreError('not-found')) // ghost-1

      const ok = await store.batchUpdateCards(['good-1', 'ghost-1'], { status: 'sale' })

      expect(ok).toBe(true)
      expect(store.cards.find((c: any) => c.id === 'good-1')?.status).toBe('sale')
      expect(store.cards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
      expect(store.paginatedCards.find((c: any) => c.id === 'ghost-1')).toBeUndefined()
    })
  })

  describe('batchDeleteCards — AC3', () => {
    it('survives a ghost inside the batch: the lot is reported deleted, nothing is restored', async () => {
      const store = useCollectionStore()
      const good = makeCard({ id: 'good-1' })
      const ghost = makeCard({ id: 'ghost-1' })
      store.cards = [good, ghost] as any
      store.paginatedCards = [good, ghost] as any
      // The delete batch (delete-only) hits not-found because ghost-1's doc is
      // already gone — Firestore delete is idempotent, so the objective (both
      // docs absent) is already true; this must not be treated as a failure
      // requiring restore.
      mockCommit.mockRejectedValueOnce(firestoreError('not-found'))

      const result = await store.batchDeleteCards(['good-1', 'ghost-1'])

      expect(result.success).toBe(true)
      expect(result.failed).toBe(0)
      expect(store.cards).toHaveLength(0)
      expect(store.paginatedCards).toHaveLength(0)
    })
  })

  describe('AC4 — only the exact not-found code triggers the cure', () => {
    it.each(OTHER_CODES)('updateCard: %s does NOT cure — rolls back and reports failure like before', async (code) => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      store.paginatedCards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(firestoreError(code))

      const ok = await store.updateCard('card-1', { status: 'sale' })

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
      expect(store.cards.find((c: any) => c.id === 'card-1')?.status).toBe('collection')
    })

    it('updateCard: a generic error with no code at all does NOT cure', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      mockUpdateDoc.mockRejectedValueOnce(new Error('some transient failure'))

      const ok = await store.updateCard('card-1', { status: 'sale' })

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
    })

    it.each(OTHER_CODES)('deleteCard: %s does NOT cure — restores the card and reports failure like before', async (code) => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(firestoreError(code))

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
    })

    it('deleteCard: a generic error with no code at all does NOT cure', async () => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1' })
      store.cards = [card] as any
      mockDeleteDoc.mockRejectedValueOnce(new Error('some transient failure'))

      const ok = await store.deleteCard('card-1')

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
    })

    it.each(OTHER_CODES)('batchUpdateCards: %s does NOT cure — the whole call reports failure, nothing removed', async (code) => {
      const store = useCollectionStore()
      const card = makeCard({ id: 'card-1', status: 'collection' })
      store.cards = [card] as any
      mockCommit.mockRejectedValueOnce(firestoreError(code))

      const ok = await store.batchUpdateCards(['card-1'], { status: 'sale' })

      expect(ok).toBe(false)
      expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
      expect(store.cards.find((c: any) => c.id === 'card-1')?.status).toBe('collection')
    })

    it.each(OTHER_CODES)('batchDeleteCards: %s does NOT cure — reports failure and restores the card', async (code) => {
      vi.useFakeTimers()
      try {
        const store = useCollectionStore()
        const card = makeCard({ id: 'card-1' })
        store.cards = [card] as any
        store.paginatedCards = [card] as any
        // Genuine failure codes still exhaust commitBatchWithRetry's retries
        // (up to 2 retries at 500ms apart, or a single 30s resource-exhausted
        // drain wait) — fake-timer-advance past the slowest case either way.
        mockCommit.mockRejectedValue(firestoreError(code))

        const resultPromise = store.batchDeleteCards(['card-1'])
        await vi.advanceTimersByTimeAsync(31000)
        const result = await resultPromise

        expect(result.success).toBe(false)
        expect(result.failed).toBe(1)
        expect(store.cards.find((c: any) => c.id === 'card-1')).toBeDefined()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
