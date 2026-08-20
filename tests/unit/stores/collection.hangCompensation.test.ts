/**
 * TASK-255. Production incident (2026-08-20, Rafael, mobile): a status
 * change (sale -> collection) got stuck on "GUARDANDO" forever. Measured
 * against production: deleteCard's applyCardIndexDelta('delete') ran and
 * removed the OLD card's index entry, but the follow-up deleteDoc(cardRef)
 * never settled — not rejected, just pending forever. Because a hung await
 * never reaches a catch block, deleteCard's existing TASK-232 gap #1
 * compensation (re-insert the index entry on a genuine deleteDoc failure)
 * never ran either. Result: a live card document with no card_index entry
 * — an invisible card.
 *
 * AC1/AC2 fix under test: deleteDoc is now wrapped in withTimeout
 * (CARD_WRITE_TIMEOUT_MS). A hang that outlives the timeout rejects with a
 * TimeoutError, which is NOT isNotFoundError, so it flows into the SAME
 * existing gap #1 compensation branch that already handles a genuine
 * deleteDoc failure. No new compensation path was added — the fix is that
 * a hang now actually reaches the one that already existed.
 *
 * AC4's hard requirement: the hang must be simulated with a promise that
 * NEVER settles (not one that rejects) — a reject alone would not exercise
 * the timeout path this ticket is about.
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

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue(undefined)
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'card-1' })
const mockGetDocs = vi.fn().mockResolvedValue({ empty: true, docs: [] })
const mockGetCountFromServer = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) })

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: vi.fn(),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getCountFromServer: (...args: unknown[]) => mockGetCountFromServer(...args),
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

/** A promise that never settles — the real production mechanism (a hang, not a rejection). */
function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

describe('collection store: TASK-255 — a hung deleteDoc must not leave an invisible card', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // AC4: the red lock. Simulates the REAL defect — deleteDoc hangs forever.
  it('AC4: compensates (re-inserts the index entry) when deleteDoc HANGS — never resolves, never rejects — instead of leaving the card_index delete unanswered forever', async () => {
    const card = makeCard({ id: 'card-1' })
    const store = useCollectionStore()
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    mockDeleteDoc.mockImplementationOnce(() => neverSettles())

    const resultPromise = store.deleteCard('card-1')
    // Let the delta-before-delete call and the deleteDoc call kick off.
    await vi.advanceTimersByTimeAsync(0)
    // Advance past the write timeout — this is what turns the hang into a
    // terminal outcome (AC1) instead of leaving the promise pending.
    await vi.advanceTimersByTimeAsync(20000)

    const ok = await resultPromise

    // AC1: a terminal, non-hanging outcome.
    expect(ok).toBe(false)

    // AC2 invariant: the delete-delta ran once (removing the old entry),
    // and the SAME gap #1 compensation (allowInsert:true) that already
    // existed for a genuine rejection now also runs for a hang.
    expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(2)
    expect(mockApplyCardIndexDelta).toHaveBeenNthCalledWith(1, [{ cardId: 'card-1', action: 'delete' }])
    expect(mockApplyCardIndexDelta).toHaveBeenNthCalledWith(2, [{ cardId: 'card-1', action: 'update', allowInsert: true }])

    // The card document is never actually gone (deleteDoc never resolved),
    // so the UI must show it again — restore-on-failure, matching a real
    // deleteDoc rejection.
    expect(store.cards.some((c) => c.id === 'card-1')).toBe(true)
  })

  // AC5: control negative. Without this, a "fix" that does nothing at all
  // would look identical to a passing AC4 for the wrong reason.
  it('AC5 (control negative): with a healthy network, deleteDoc resolves normally — no compensation, old doc gone, index stays coherent', async () => {
    const card = makeCard({ id: 'card-1' })
    const store = useCollectionStore()
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    const ok = await store.deleteCard('card-1')

    expect(ok).toBe(true)
    expect(mockApplyCardIndexDelta).toHaveBeenCalledTimes(1)
    expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'card-1', action: 'delete' }])
    expect(store.cards.some((c) => c.id === 'card-1')).toBe(false)
  })

  // AC6: the real incident was TWO cards (Lotus Petal, Ragavan), each
  // moved through the same save flow close together. Each deleteCard call
  // must resolve its own hang/timeout/compensation independently, with no
  // cross-contamination between the two cards' index entries.
  it('AC6: two cards hanging within the same short window are each compensated independently', async () => {
    const cardA = makeCard({ id: 'card-a' })
    const cardB = makeCard({ id: 'card-b' })
    const store = useCollectionStore()
    store.cards = [cardA, cardB] as any
    store.paginatedCards = [cardA, cardB] as any

    mockDeleteDoc.mockImplementation(() => neverSettles())

    const resultA = store.deleteCard('card-a')
    // Fire the second one shortly after the first — well inside the
    // debounce-scale window (2000ms) the original incident's two saves
    // shared conceptually, even though these two calls are each awaited
    // independently (deleteCard's delta call is synchronous-awaited, not
    // routed through the debounced queueCardIndexDelta path).
    await vi.advanceTimersByTimeAsync(500)
    const resultB = store.deleteCard('card-b')

    await vi.advanceTimersByTimeAsync(20000)
    const [okA, okB] = await Promise.all([resultA, resultB])

    expect(okA).toBe(false)
    expect(okB).toBe(false)

    const compensationCalls = mockApplyCardIndexDelta.mock.calls.filter(
      ([mutations]) => mutations[0]?.action === 'update' && mutations[0]?.allowInsert === true,
    )
    const compensatedIds = compensationCalls.map(([mutations]) => mutations[0].cardId).sort()
    expect(compensatedIds).toEqual(['card-a', 'card-b'])

    expect(store.cards.some((c) => c.id === 'card-a')).toBe(true)
    expect(store.cards.some((c) => c.id === 'card-b')).toBe(true)
  })
})
