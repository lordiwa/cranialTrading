/**
 * TASK-280 HIGH-1 (reviewer, a9a53f8 round 1). deleteCard resolves the card
 * to delete from memory only (cards.value / cardsById / paginatedCards) and
 * silently `return false`s — no Firestore write at all — when the id isn't
 * found in any of them. CardDetailModal's server-merged save diff
 * (existingCardsForSave) can target a delete op on a row that exists ONLY
 * on the server: memory never held it. Before this fix, that delete
 * silently did nothing, leaving the server doc alive as a live duplicate —
 * exactly the residue the ticket exists to close.
 *
 * Fix: an optional `fallbackCard` param. When the id is not found in memory,
 * deleteCard falls back to it instead of giving up.
 */

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn().mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false }),
  buildCardIndex: vi.fn(),
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
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

const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getCountFromServer: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn((...args: unknown[]) => args),
  setDoc: vi.fn().mockResolvedValue(undefined),
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
  mockDeleteDoc.mockResolvedValue(undefined)
})

describe('collection store deleteCard(): fallbackCard for server-only rows (TASK-280 HIGH-1)', () => {
  it('without a fallback, a card missing from memory silently returns false and never calls deleteDoc', async () => {
    const store = useCollectionStore()
    store.cards = [] as any
    store.paginatedCards = [] as any

    const result = await store.deleteCard('server-only-id')

    expect(result).toBe(false)
    expect(mockDeleteDoc).not.toHaveBeenCalled()
  })

  it('with a fallbackCard, a card missing from memory is still deleted from Firestore', async () => {
    const store = useCollectionStore()
    store.cards = [] as any
    store.paginatedCards = [] as any

    const serverOnlyCard = makeCard({ id: 'server-only-id', status: 'sale', quantity: 5 })
    const result = await store.deleteCard('server-only-id', serverOnlyCard)

    expect(result).toBe(true)
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
    const [ref] = mockDeleteDoc.mock.calls[0]!
    expect(ref.path).toContain('server-only-id')
  })

  it('memory still wins over a stale fallbackCard when the id IS found in memory', async () => {
    const store = useCollectionStore()
    const realCard = makeCard({ id: 'card-1', status: 'collection', quantity: 2 })
    store.cards = [realCard] as any
    store.paginatedCards = [realCard] as any

    const wrongFallback = makeCard({ id: 'card-1', status: 'wishlist', quantity: 99 })
    const result = await store.deleteCard('card-1', wrongFallback)

    expect(result).toBe(true)
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
  })
})
