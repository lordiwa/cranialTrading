/**
 * TASK-255 AC3. Measured against production (2026-08-20): a newly created
 * card's document DID get written, but its card_index entry never showed
 * up — the client-only debounced full-chunk rewrite (persistIndexToFirestore,
 * fed by cardIndexRaw.value) that addCard relied on as its ONLY path into
 * card_index raced against other client-side state and lost, twice, on the
 * same account within the same production incident.
 *
 * Decision (see collection.ts addCard, "TASK-255 AC3" comment): addCard now
 * ALSO issues a single, synchronously-awaited, server-authoritative
 * applyCardIndexDelta({ action: 'update', allowInsert: true }) call right
 * after addDoc succeeds — the same mechanism deleteCard's gap #1
 * compensation already uses, reading the doc's real chunkId fresh from the
 * server rather than trusting client-side in-memory state or timing. The
 * existing client-side persistIndexToFirestore path is left untouched
 * (paginatedCards/local UI state still need it) — this is a reliability
 * backstop, not a replacement.
 */

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

const mockApplyCardIndexDelta = vi.fn().mockResolvedValue({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 })

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn().mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false }),
  buildCardIndex: vi.fn(),
  applyCardIndexDelta: (...args: unknown[]) => mockApplyCardIndexDelta(...args),
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

describe('collection store addCard(): TASK-255 AC3 — a new card must reach card_index without manual intervention', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockAddDoc.mockResolvedValue({ id: 'new-card' })
    mockSetDoc.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
    mockApplyCardIndexDelta.mockResolvedValue({ applied: 1, skipped: 0, skippedIds: [], fallbackUsed: 0 })
  })

  it('issues an awaited allowInsert applyCardIndexDelta for the new doc id right after addDoc succeeds', async () => {
    const store = useCollectionStore()
    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...cardData } = makeCard({ id: 'ignored' })

    const newId = await store.addCard(cardData as any)

    expect(newId).toBe('new-card')
    expect(mockApplyCardIndexDelta).toHaveBeenCalledWith([{ cardId: 'new-card', action: 'update', allowInsert: true }])
  })

  it('does not fail the add when the backstop insert call itself fails — best-effort, like deleteCard delta calls', async () => {
    const store = useCollectionStore()
    mockApplyCardIndexDelta.mockRejectedValueOnce(new Error('unavailable'))
    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...cardData } = makeCard({ id: 'ignored' })

    const newId = await store.addCard(cardData as any)

    expect(newId).toBe('new-card')
  })
})
