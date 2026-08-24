/**
 * TASK-280 AC3/AC4. Mirrors decks.writeTimeout.test.ts for the binder side
 * of CardDetailModal.handleSave's chain (allocateCardToBinder,
 * deallocateCard) — grep-verified before this ticket: zero withTimeout
 * calls in src/stores/binders.ts. See decks.writeTimeout.test.ts for the
 * full incident writeup; Rule 6 (parallel changes) requires these two
 * stores be fixed together.
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
  deleteField: vi.fn(() => '__DELETE__'),
  doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useBindersStore } from '@/stores/binders'
import { useAuthStore } from '@/stores/auth'
import { useCollectionStore } from '@/stores/collection'
import { useDecksStore } from '@/stores/decks'
import { makeCard } from '../helpers/fixtures'

function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

function seedBinder(store: ReturnType<typeof useBindersStore>, allocations: Array<{ cardId: string; quantity: number }>) {
  store.binders.push({
    id: 'binder-1',
    userId: 'user-1',
    name: 'Test Binder',
    description: '',
    allocations: allocations.map(a => ({ ...a, addedAt: new Date() })),
    thumbnail: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    stats: { totalCards: 0, totalPrice: 0 },
    isPublic: true,
    forSale: false,
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

describe('binders store — AC4: writes wrapped in withTimeout must not hang handleSave forever', () => {
  it('allocateCardToBinder: a hung updateDoc still resolves (does not hang past the write timeout)', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    const card = makeCard({ id: 'card-1', quantity: 4, status: 'collection' })
    collectionStore.cards = [card] as any
    collectionStore.getCardById = vi.fn((id: string) => (id === 'card-1' ? card : undefined)) as any

    const decksStore = useDecksStore()
    decksStore.decks = []

    const store = useBindersStore()
    seedBinder(store, [])

    mockUpdateDoc.mockImplementationOnce(() => neverSettles())

    let settled = false
    const resultPromise = store.allocateCardToBinder('binder-1', 'card-1', 2).then(r => { settled = true; return r })

    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(20000)
    const result = await resultPromise

    expect(settled).toBe(true)
    // TASK-281 HIGH-1: allocateCardToBinder now distinguishes a real write
    // failure (this case — the withTimeout wrapped write timed out) from
    // the availability cap, both of which used to collapse into a bare 0.
    expect(result).toEqual({ allocated: 0, failed: true })
  })

  it('deallocateCard: a hung updateDoc still resolves to false instead of hanging', async () => {
    const authStore = useAuthStore()
    authStore.user = { id: 'user-1' } as any

    const collectionStore = useCollectionStore()
    collectionStore.cards = [] as any

    const store = useBindersStore()
    seedBinder(store, [{ cardId: 'card-1', quantity: 2 }])

    mockUpdateDoc.mockImplementationOnce(() => neverSettles())

    let settled = false
    const resultPromise = store.deallocateCard('binder-1', 'card-1').then(r => { settled = true; return r })

    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(20000)
    const result = await resultPromise

    expect(settled).toBe(true)
    expect(result).toBe(false)
  })
})
