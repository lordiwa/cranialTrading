/**
 * TASK-280 AC3/AC4. Production incident (2026-08-24): CardDetailModal's
 * handleSave chain calls decksStore.reduceAllocationsForCard,
 * allocateCardToDeck, and deallocateCard — none of their Firestore
 * updateDoc() writes had any timeout (grep-verified before this ticket:
 * zero withTimeout calls in src/stores/decks.ts). A single hung updateDoc
 * left handleSave's await permanently pending, so the SAVE button never
 * left "GUARDANDO" and neither the catch nor finally block ever ran.
 *
 * Fix under test: each of these three functions' updateDoc call is now
 * wrapped in withTimeout(CARD_WRITE_TIMEOUT_MS). A hang that outlives the
 * timeout must still terminate the function (reject internally, caught by
 * the function's own try/catch, or resolved via Promise.allSettled) rather
 * than leave it pending forever — this is what lets handleSave's outer
 * finally actually run.
 *
 * AC4 hard requirement: the hang is simulated with a promise that NEVER
 * settles (not one that rejects) — this is the exact production mechanism.
 */

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-1' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/scryfallCache', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useDecksStore } from '@/stores/decks'
import { useAuthStore } from '@/stores/auth'
import { useCollectionStore } from '@/stores/collection'
import { makeCard } from '../helpers/fixtures'

/** A promise that never settles — the real production mechanism (a hang, not a rejection). */
function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

function seedDeck(store: ReturnType<typeof useDecksStore>, allocations: Array<{ cardId: string; quantity: number; isInSideboard: boolean }>) {
  store.decks.push({
    id: 'deck-1',
    userId: 'user-1',
    name: 'Test Deck',
    format: 'modern',
    description: '',
    colors: [],
    commander: '',
    allocations: allocations.map(a => ({ ...a, addedAt: new Date() })),
    wishlist: [],
    thumbnail: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublic: false,
    stats: {
      totalCards: 0, sideboardCards: 0, ownedCards: 0, wishlistCards: 0,
      avgPrice: 0, totalPrice: 0, completionPercentage: 100,
    },
  } as any)
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockUpdateDoc.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('decks store — AC4: writes wrapped in withTimeout must not hang handleSave forever', () => {
  it('allocateCardToDeck: a hung updateDoc still resolves (does not hang past the write timeout)', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    const card = makeCard({ id: 'card-1', quantity: 4, status: 'collection' })
    collectionStore.cards = [card] as any
    collectionStore.getCardById = vi.fn((id: string) => (id === 'card-1' ? card : undefined)) as any

    const store = useDecksStore()
    seedDeck(store, [])

    mockUpdateDoc.mockImplementationOnce(() => neverSettles())

    let settled = false
    const resultPromise = store.allocateCardToDeck('deck-1', 'card-1', 2, false).then(r => { settled = true; return r })

    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false) // still pending — the hang is real before the timeout fires

    await vi.advanceTimersByTimeAsync(20000)
    const result = await resultPromise

    expect(settled).toBe(true)
    // The write never landed — allocateCardToDeck's own catch reports failure.
    expect(result).toEqual({ allocated: 0, wishlisted: 0 })
  })

  it('deallocateCard: a hung updateDoc still resolves to false instead of hanging', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [] as any

    const store = useDecksStore()
    seedDeck(store, [{ cardId: 'card-1', quantity: 2, isInSideboard: false }])

    mockUpdateDoc.mockImplementationOnce(() => neverSettles())

    let settled = false
    const resultPromise = store.deallocateCard('deck-1', 'card-1', false).then(r => { settled = true; return r })

    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(20000)
    const result = await resultPromise

    expect(settled).toBe(true)
    expect(result).toBe(false)
  })

  it('reduceAllocationsForCard: a hung updateDoc inside Promise.allSettled still lets the function return instead of hanging forever', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const card = makeCard({ id: 'card-1', quantity: 4, status: 'collection' })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    collectionStore.ensureCollectionWishlistCard = vi.fn().mockResolvedValue('wish-card-1') as any

    const store = useDecksStore()
    seedDeck(store, [{ cardId: 'card-1', quantity: 4, isInSideboard: false }])
    expect(store.getTotalAllocatedForCard('card-1')).toBe(4)

    mockUpdateDoc.mockImplementationOnce(() => neverSettles())

    let settled = false
    const resultPromise = store.reduceAllocationsForCard(card, 2).then(r => { settled = true; return r })

    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(20000)
    await resultPromise

    expect(settled).toBe(true)
  })
})
