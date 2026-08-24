/**
 * TASK-280 AC1/AC2 groundwork. `fetchServerCardsByPrint` is the single
 * server read CardDetailModal uses (once per save, once per open — no
 * listener, no new cache, per the ticket's hard rule) to catch identity
 * rows that exist in Firestore but are missing from the stale in-memory
 * `collectionStore.cards` list — the exact gap that let the production
 * incident create a duplicate `collection` doc while a `sale` doc for the
 * same identity silently survived.
 *
 * Query shape: filters by scryfallId only (a single equality where — no
 * composite index needed) and narrows to condition+foil client-side,
 * mirroring the existing samePrint() identity used elsewhere in this file
 * (edition-relaxed).
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

const mockGetDocs = vi.fn().mockResolvedValue({ empty: true, docs: [] })
const mockQuery = vi.fn((...args: unknown[]) => args)
const mockWhere = vi.fn((...args: unknown[]) => args)

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn((...args: unknown[]) => args),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getCountFromServer: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  setDoc: vi.fn().mockResolvedValue(undefined),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: vi.fn().mockResolvedValue(undefined),
  where: (...args: unknown[]) => mockWhere(...args),
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

function docWith(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: () => data,
  }
}

const fakeTimestamp = (ms: number) => ({ toDate: () => new Date(ms) })

describe('collection store: fetchServerCardsByPrint (TASK-280 AC1/AC2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
  })

  it('queries by scryfallId only and returns matching docs as Card objects', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        docWith('server-sale', {
          scryfallId: '86e30ca4', name: 'Grand Abolisher', edition: 'CMM', setCode: 'CMM',
          quantity: 5, condition: 'NM', foil: false, price: 1, image: '', status: 'sale',
          createdAt: fakeTimestamp(1000), updatedAt: fakeTimestamp(1000),
        }),
      ],
    })

    const store = useCollectionStore()
    const result = await store.fetchServerCardsByPrint('86e30ca4', 'NM', false)

    expect(mockWhere).toHaveBeenCalledWith('scryfallId', '==', '86e30ca4')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'server-sale', status: 'sale', quantity: 5, condition: 'NM', foil: false })
    expect(result[0]?.updatedAt).toBeInstanceOf(Date)
  })

  it('filters out docs with a different condition or foil (client-side narrowing)', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        docWith('a', { scryfallId: 'x', condition: 'NM', foil: false, status: 'collection', quantity: 1, createdAt: fakeTimestamp(1), updatedAt: fakeTimestamp(1) }),
        docWith('b', { scryfallId: 'x', condition: 'LP', foil: false, status: 'collection', quantity: 1, createdAt: fakeTimestamp(1), updatedAt: fakeTimestamp(1) }),
        docWith('c', { scryfallId: 'x', condition: 'NM', foil: true, status: 'collection', quantity: 1, createdAt: fakeTimestamp(1), updatedAt: fakeTimestamp(1) }),
      ],
    })

    const store = useCollectionStore()
    const result = await store.fetchServerCardsByPrint('x', 'NM', false)

    expect(result.map(c => c.id)).toEqual(['a'])
  })

  it('returns [] (does not throw) when getDocs rejects', async () => {
    mockGetDocs.mockRejectedValue(new Error('offline'))

    const store = useCollectionStore()
    const result = await store.fetchServerCardsByPrint('x', 'NM', false)

    expect(result).toEqual([])
  })

  it('AC3: a hung getDocs terminates via the write timeout instead of leaving the caller pending forever', async () => {
    vi.useFakeTimers()
    mockGetDocs.mockImplementationOnce(() => new Promise(() => {}))

    const store = useCollectionStore()
    let settled = false
    const resultPromise = store.fetchServerCardsByPrint('x', 'NM', false).then(r => { settled = true; return r })

    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(20000)
    const result = await resultPromise

    expect(settled).toBe(true)
    expect(result).toEqual([])
    vi.useRealTimers()
  })

  it('returns [] with no Firestore call when there is no authenticated user', async () => {
    const { useAuthStore } = await import('@/stores/auth')
    ;(useAuthStore as any).mockReturnValueOnce({ user: null })

    const store = useCollectionStore()
    const result = await store.fetchServerCardsByPrint('x', 'NM', false)

    expect(result).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
  })
})
