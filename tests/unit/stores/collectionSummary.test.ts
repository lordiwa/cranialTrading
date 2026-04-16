/**
 * Behavior-preservation tests for collectionSummary in collection store (NICE-09 / D-11).
 *
 * These tests verify that after converting collectionSummary from ref to computed,
 * the observable behavior remains identical for the card_index load path.
 *
 * D-11 caveat: The Cloud Function fallback path sets totalValue=0 and loadedCards=0
 * which differs from what a computed would derive. The computed approach is only valid
 * if we accept that the computed always derives from cards.value (dropping the CF behavior).
 */
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Firebase modules
vi.mock('../../../src/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  Timestamp: { now: vi.fn() },
}))
vi.mock('../../../src/services/publicCards', () => ({
  batchSyncCardsToPublic: vi.fn(),
  removeCardFromPublic: vi.fn(),
  syncAllUserCards: vi.fn(),
  syncAllUserPreferences: vi.fn(),
  syncCardToPublic: vi.fn(),
  getCardsNeedingPublicSync: vi.fn(() => []),
}))
vi.mock('../../../src/services/scryfallCache', () => ({
  getCardsByIds: vi.fn(() => Promise.resolve(new Map())),
}))
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'user-123', username: 'testuser', email: 'test@test.com' },
  })),
}))
vi.mock('../../../src/stores/toast', () => ({
  useToastStore: vi.fn(() => ({
    show: vi.fn(),
  })),
}))

describe('collectionSummary (NICE-09)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns null when cards array is empty', async () => {
    const { useCollectionStore } = await import('../../../src/stores/collection')
    const store = useCollectionStore()
    // Initial state: no cards loaded
    expect(store.collectionSummary).toBeNull()
  })

  it('reflects correct totalCards when cards are set', async () => {
    const { useCollectionStore } = await import('../../../src/stores/collection')
    const store = useCollectionStore()

    const mockCards = [
      { id: '1', name: 'Lightning Bolt', status: 'collection', price: 2.00, quantity: 4 },
      { id: '2', name: 'Counterspell', status: 'trade', price: 5.00, quantity: 2 },
      { id: '3', name: 'Black Lotus', status: 'sale', price: 100.00, quantity: 1 },
    ] as any[]

    // Simulate what loadFromIndex does: set cards.value and then set collectionSummary
    store.cards = mockCards

    // After conversion to computed, collectionSummary should auto-derive from cards
    const summary = store.collectionSummary
    expect(summary).not.toBeNull()
    expect(summary!.totalCards).toBe(3)
    expect(summary!.loadedCards).toBe(3)
  })

  it('tallies statusCounts correctly', async () => {
    const { useCollectionStore } = await import('../../../src/stores/collection')
    const store = useCollectionStore()

    const mockCards = [
      { id: '1', name: 'Card A', status: 'collection', price: 1.00, quantity: 1 },
      { id: '2', name: 'Card B', status: 'collection', price: 2.00, quantity: 1 },
      { id: '3', name: 'Card C', status: 'trade', price: 3.00, quantity: 1 },
      { id: '4', name: 'Card D', status: 'sale', price: 4.00, quantity: 1 },
    ] as any[]

    store.cards = mockCards

    const summary = store.collectionSummary
    expect(summary).not.toBeNull()
    expect(summary!.statusCounts['collection']).toBe(2)
    expect(summary!.statusCounts['trade']).toBe(1)
    expect(summary!.statusCounts['sale']).toBe(1)
  })

  it('computes totalValue as sum of price * quantity for each card', async () => {
    const { useCollectionStore } = await import('../../../src/stores/collection')
    const store = useCollectionStore()

    const mockCards = [
      { id: '1', name: 'Card A', status: 'collection', price: 2.00, quantity: 4 }, // 8.00
      { id: '2', name: 'Card B', status: 'trade', price: 5.00, quantity: 2 },      // 10.00
    ] as any[]

    store.cards = mockCards

    const summary = store.collectionSummary
    expect(summary).not.toBeNull()
    expect(summary!.totalValue).toBeCloseTo(18.00)
  })

  it('returns null when cards array is set back to empty', async () => {
    const { useCollectionStore } = await import('../../../src/stores/collection')
    const store = useCollectionStore()

    store.cards = [{ id: '1', name: 'Test', status: 'collection', price: 1, quantity: 1 }] as any[]
    expect(store.collectionSummary).not.toBeNull()

    store.cards = []
    expect(store.collectionSummary).toBeNull()
  })
})
