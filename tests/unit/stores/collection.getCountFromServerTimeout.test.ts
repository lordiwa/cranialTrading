/**
 * TASK-280 AC4. addCard()'s getCountFromServer call (used to compute the
 * sticky chunkId, TASK-230) sits inside a try/catch that can only react to
 * a REJECTION — a promise that hangs forever (never resolves, never
 * rejects) sails straight through untouched, permanently stalling addCard
 * and, transitively, CardDetailModal.handleSave's "GUARDANDO" button.
 * Fix under test: the call is wrapped in withTimeout(CARD_WRITE_TIMEOUT_MS)
 * so a hang becomes a TimeoutError rejection, caught by the SAME existing
 * catch that already handles a genuine getCountFromServer failure — chunkId
 * is omitted (MEDIUM-2, pre-existing behavior) and the add still completes.
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
  isPublicCard: vi.fn(() => false),
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
const mockGetCountFromServer = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) })

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args: unknown[]) => (
    args.length === 1 ? { id: 'new-card', path: 'users/test-user-id/cards/new-card' } : { path: args.join('/') }
  )),
  getCountFromServer: (...args: unknown[]) => mockGetCountFromServer(...args),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn((...args: unknown[]) => args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: vi.fn().mockResolvedValue(undefined),
  where: vi.fn((...args: unknown[]) => args),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
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

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockSetDoc.mockResolvedValue(undefined)
  mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('collection store addCard(): a hung getCountFromServer must not stall the whole add forever', () => {
  it('terminates via the write timeout (chunkId omitted) instead of hanging past 20s', async () => {
    mockGetCountFromServer.mockImplementationOnce(() => new Promise(() => {}))

    const store = useCollectionStore()
    const { id: _id, updatedAt: _u, createdAt: _c, ...cardData } = makeCard({ id: 'ignored' })

    let settled = false
    const resultPromise = store.addCard(cardData as any).then(r => { settled = true; return r })

    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(20000)
    const result = await resultPromise

    expect(settled).toBe(true)
    expect(result).toBe('new-card')
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [, payload] = mockSetDoc.mock.calls[0]
    expect(payload).not.toHaveProperty('chunkId')
  })
})
