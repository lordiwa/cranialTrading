/**
 * TASK-230: addCard() must write a sticky `chunkId` field on the new card
 * document — the chunk the card_index would put it in TODAY, computed once
 * at creation and never recalculated. This is a data-only ticket: nothing
 * reads the field yet (see the functions/ static-source test for the other
 * creation path), so these tests only assert on the write.
 *
 * chunkId = floor(position / INDEX_CHUNK_SIZE), where position is the
 * SERVER's real card count (via getCountFromServer), matching the
 * bulkImportCards server path — the same INDEX_CHUNK_SIZE (2000) used by
 * src/stores/collection.ts:525 and functions/index.js.
 *
 * Deliberately NOT cards.value.length: cards.value is only fully populated
 * at the END of loadFromIndex (TASK-185's `_indexLoadInFlight` window), so a
 * card added while a load is still in flight would get a wrong, permanently-
 * sticky chunkId from an undercounted local array. getCountFromServer avoids
 * that class of bug entirely (TASK-185/219/223 pattern) by asking Firestore
 * for the truth instead of trusting client-side load state.
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

const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-card' })
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue(undefined)
const mockGetCountFromServer = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) })

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getCountFromServer: (...args: unknown[]) => mockGetCountFromServer(...args),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
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
import { makeCard } from '../helpers/fixtures'

describe('collection store addCard(): sticky chunkId (TASK-230)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockAddDoc.mockResolvedValue({ id: 'new-card' })
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
  })

  it('writes chunkId 0 when the server reports an empty collection', async () => {
    const store = useCollectionStore()
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })

    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...cardData } = makeCard({ id: 'ignored' })
    await store.addCard(cardData as any)

    expect(mockAddDoc).toHaveBeenCalledTimes(1)
    const [, payload] = mockAddDoc.mock.calls[0]
    expect(payload.chunkId).toBe(0)
  })

  it('computes chunkId from the SERVER card count (position-based, floor(N/2000))', async () => {
    const store = useCollectionStore()
    // Server says 2000 existing cards — the 2001st card (index 2000) must land in chunk 1.
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 2000 }) })

    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...cardData } = makeCard({ id: 'ignored' })
    await store.addCard(cardData as any)

    const [, payload] = mockAddDoc.mock.calls[0]
    expect(payload.chunkId).toBe(1)
  })

  it('does NOT derive chunkId from cards.value.length — a card added while the index is still loading (TASK-185 window, cards.value undercounted) must still get the SERVER-true chunkId, not one based on the stale/empty local array', async () => {
    const store = useCollectionStore()
    // Simulate the TASK-185 in-flight-load window: cards.value is empty
    // (load hasn't finished) but the server truthfully has 4000 cards.
    store.cards = [] as any
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 4000 }) })

    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...cardData } = makeCard({ id: 'ignored' })
    await store.addCard(cardData as any)

    const [, payload] = mockAddDoc.mock.calls[0]
    // cards.value.length (0) would wrongly give chunkId 0; the true count (4000) gives chunk 2.
    expect(payload.chunkId).toBe(2)
  })

  it('MEDIUM-2: omits chunkId (does not fail the add) when getCountFromServer rejects — a missing field is backfillable, a wrong sticky value is not, and the app must not gain a hard network dependency for adding a card', async () => {
    const store = useCollectionStore()
    mockGetCountFromServer.mockRejectedValue(new Error('offline'))

    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...cardData } = makeCard({ id: 'ignored' })
    const result = await store.addCard(cardData as any)

    expect(result).toBe('new-card')
    expect(mockAddDoc).toHaveBeenCalledTimes(1)
    const [, payload] = mockAddDoc.mock.calls[0]
    expect(payload).not.toHaveProperty('chunkId')
  })

  it('does not recompute chunkId on updateCard (sticky — TASK-230 scope: only creation writes it)', async () => {
    const store = useCollectionStore()
    const card = makeCard({ id: 'card-1', status: 'collection' })
    store.cards = [card] as any
    store.paginatedCards = [card] as any

    const { updateDoc } = await import('firebase/firestore')
    await store.updateCard('card-1', { status: 'sale' })

    const updateCalls = (updateDoc as any).mock.calls
    expect(updateCalls.length).toBeGreaterThan(0)
    for (const [, updates] of updateCalls) {
      expect(updates).not.toHaveProperty('chunkId')
    }
  })
})
