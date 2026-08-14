/**
 * TASK-237 AC1 (regression test, written BEFORE the fix — see the RED run
 * captured in the ticket/commit): a status-change mutation followed by the
 * JS context being destroyed (reload/navigate/close) BEFORE the 2s
 * scheduleCardIndexDeltaFlush debounce elapses must not lose the
 * card_index write.
 *
 * This reproduces the exact mechanism measured in production (TASK-237:
 * Corpses of the Lost saved because 3.5s elapsed before reload; Dreadmobile
 * was lost because the reload was immediate). The test never advances the
 * fake timer past the 2000ms debounce — that IS "reload immediately": the
 * pending delta must go out some other way, or it is gone for good (TASK-232
 * removed the client-side card_index write path this used to fall back on).
 *
 * pagehide is dispatched directly (rather than actually tearing down jsdom)
 * because that's the real signal a browser fires as a page unloads — the
 * fix is expected to listen for it (and/or visibilitychange) and flush the
 * pending deltas via a fetch(..., { keepalive: true }) beacon, since a
 * plain httpsCallable invoked from beforeunload gets cancelled by the
 * browser (TASK-237 AC2's known trap).
 */

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

const mockApplyCardIndexDelta = vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
const mockSendCardIndexDeltaBeacon = vi.fn()

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn().mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false }),
  buildCardIndex: vi.fn(),
  applyCardIndexDelta: (...args: unknown[]) => mockApplyCardIndexDelta(...args),
  sendCardIndexDeltaBeacon: (...args: unknown[]) => mockSendCardIndexDeltaBeacon(...args),
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
import { makeCard } from '../helpers/fixtures'

describe('collection store: TASK-237 AC1 — a mutation lost to unload before the debounce must be flushed on pagehide', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockAddDoc.mockResolvedValue({ id: 'card-1' })
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes the pending server delta via a keepalive beacon when pagehide fires before the 2s debounce elapses', async () => {
    vi.useFakeTimers()

    const store = useCollectionStore()
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    const ok = await store.updateCard('card-1', { status: 'trade' })
    expect(ok).toBe(true)

    // "Reload immediately": advance well short of the 2000ms debounce.
    await vi.advanceTimersByTimeAsync(500)

    // The normal debounced path has not had a chance to fire.
    expect(mockApplyCardIndexDelta).not.toHaveBeenCalled()

    // The page is torn down (reload/navigate/close) right now. Switch back
    // to real timers first — the flush handler resolves a dynamic import(),
    // which needs real microtask/task turns to settle, not fake-timer ticks.
    vi.useRealTimers()
    window.dispatchEvent(new Event('pagehide'))

    await vi.waitFor(() => {
      expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalled()
    })
    expect(mockSendCardIndexDeltaBeacon).toHaveBeenCalledWith([
      { cardId: 'card-1', action: 'update' },
    ])
    // The delta went out via the beacon, not the normal debounced call —
    // there is nothing left for the (now-cancelled) 2s timer to do.
    expect(mockApplyCardIndexDelta).not.toHaveBeenCalled()
  })

  it('does nothing on pagehide when there is no pending delta (nothing to lose)', async () => {
    vi.useFakeTimers()

    const store = useCollectionStore()
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)

    expect(mockSendCardIndexDeltaBeacon).not.toHaveBeenCalled()
  })
})
