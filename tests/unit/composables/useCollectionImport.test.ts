/**
 * RED phase tests for useCollectionImport composable.
 * These tests verify state machine transitions, localStorage persistence, and guards.
 * All Firebase/Scryfall calls are mocked.
 */

import { ref } from 'vue'

vi.mock('@/services/scryfallCache', () => ({
  searchCards: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/composables/useCollectionTotals', () => ({
  cancelPriceFetch: vi.fn(),
  useCollectionTotals: vi.fn(),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

// We import after mocks are set up
import { useCollectionImport } from '@/composables/useCollectionImport'

const IMPORT_KEY = 'cranial_deck_import_progress'

function makeStores() {
  return {
    collectionStore: {
      importing: false,
      confirmImport: vi.fn().mockResolvedValue([]),
      refreshCards: vi.fn(),
      enrichCardsWithMissingMetadata: vi.fn().mockResolvedValue(undefined),
      queryPage: vi.fn(),
    },
    decksStore: {
      createDeck: vi.fn().mockResolvedValue('deck-1'),
      loadDecks: vi.fn().mockResolvedValue(undefined),
      bulkAllocateCardsToDeck: vi.fn().mockResolvedValue({ allocated: 0 }),
    },
    binderStore: {
      createBinder: vi.fn().mockResolvedValue('binder-1'),
      loadBinders: vi.fn().mockResolvedValue(undefined),
      bulkAllocateCardsToBinder: vi.fn().mockResolvedValue(0),
    },
    toastStore: {
      show: vi.fn(),
      showProgress: vi.fn().mockReturnValue({ update: vi.fn(), complete: vi.fn(), error: vi.fn() }),
    },
    confirmStore: { show: vi.fn().mockResolvedValue(true) },
    t: (key: string) => key,
    deckFilter: ref('all'),
    binderFilter: ref('all'),
    statusFilter: ref('all'),
    viewMode: ref('collection'),
  }
}

describe('useCollectionImport', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('localStorage persistence', () => {
    it('loadImportState returns null when nothing stored', () => {
      const stores = makeStores()
      const { loadImportState } = useCollectionImport(stores)
      expect(loadImportState()).toBeNull()
    })

    it('saveImportState persists to cranial_deck_import_progress key', () => {
      const stores = makeStores()
      const { saveImportState, importProgress } = useCollectionImport(stores)

      const state = {
        deckId: 'deck-1',
        deckName: 'Test Deck',
        status: 'fetching' as const,
        totalCards: 10,
        currentCard: 0,
        cards: [],
        cardMeta: [],
        createdCardIds: [],
        allocatedCount: 0,
      }

      saveImportState(state)

      const saved = localStorage.getItem(IMPORT_KEY)
      expect(saved).not.toBeNull()
      const parsed = JSON.parse(saved!)
      expect(parsed.deckId).toBe('deck-1')
      expect(parsed.deckName).toBe('Test Deck')
    })

    it('saveImportState strips cards and cardMeta arrays for lightweight storage', () => {
      const stores = makeStores()
      const { saveImportState } = useCollectionImport(stores)

      const state = {
        deckId: 'deck-1',
        deckName: 'Test',
        status: 'saving' as const,
        totalCards: 5,
        currentCard: 0,
        cards: [{ name: 'Black Lotus' } as any],
        cardMeta: [{ quantity: 1, isInSideboard: false }],
        createdCardIds: [],
        allocatedCount: 0,
      }

      saveImportState(state)

      const saved = localStorage.getItem(IMPORT_KEY)
      const parsed = JSON.parse(saved!)
      // Cards and cardMeta should be empty arrays in storage
      expect(parsed.cards).toEqual([])
      expect(parsed.cardMeta).toEqual([])
    })

    it('loadImportState returns parsed state after save', () => {
      const stores = makeStores()
      const { saveImportState, loadImportState } = useCollectionImport(stores)

      const state = {
        deckId: 'deck-2',
        deckName: 'My Deck',
        status: 'allocating' as const,
        totalCards: 20,
        currentCard: 10,
        cards: [],
        cardMeta: [],
        createdCardIds: ['card-1', 'card-2'],
        allocatedCount: 5,
      }

      saveImportState(state)
      const loaded = loadImportState()

      expect(loaded).not.toBeNull()
      expect(loaded!.deckId).toBe('deck-2')
      expect(loaded!.status).toBe('allocating')
      expect(loaded!.createdCardIds).toEqual(['card-1', 'card-2'])
    })

    it('loadImportState returns null on JSON parse error', () => {
      localStorage.setItem(IMPORT_KEY, 'not-valid-json{{}')
      const stores = makeStores()
      const { loadImportState } = useCollectionImport(stores)
      expect(loadImportState()).toBeNull()
    })

    it('clearImportState removes key and resets importProgress ref', () => {
      const stores = makeStores()
      const { saveImportState, clearImportState, importProgress } = useCollectionImport(stores)

      saveImportState({
        deckId: 'd', deckName: 'D', status: 'complete',
        totalCards: 0, currentCard: 0, cards: [], cardMeta: [], createdCardIds: [], allocatedCount: 0,
      })

      clearImportState()

      expect(localStorage.getItem(IMPORT_KEY)).toBeNull()
      expect(importProgress.value).toBeNull()
    })
  })

  describe('isDeckImporting', () => {
    it('returns false when importProgress is null', () => {
      const stores = makeStores()
      const { isDeckImporting } = useCollectionImport(stores)
      expect(isDeckImporting('deck-1')).toBe(false)
    })

    it('returns true when import targets that deck and is in-progress', () => {
      const stores = makeStores()
      const { saveImportState, isDeckImporting } = useCollectionImport(stores)

      saveImportState({
        deckId: 'deck-1', deckName: 'D', status: 'fetching',
        totalCards: 10, currentCard: 0, cards: [], cardMeta: [], createdCardIds: [], allocatedCount: 0,
      })

      expect(isDeckImporting('deck-1')).toBe(true)
    })

    it('returns false for a different deck', () => {
      const stores = makeStores()
      const { saveImportState, isDeckImporting } = useCollectionImport(stores)

      saveImportState({
        deckId: 'deck-1', deckName: 'D', status: 'fetching',
        totalCards: 10, currentCard: 0, cards: [], cardMeta: [], createdCardIds: [], allocatedCount: 0,
      })

      expect(isDeckImporting('deck-2')).toBe(false)
    })

    it('returns false when import is complete', () => {
      const stores = makeStores()
      const { saveImportState, isDeckImporting } = useCollectionImport(stores)

      saveImportState({
        deckId: 'deck-1', deckName: 'D', status: 'complete',
        totalCards: 10, currentCard: 10, cards: [], cardMeta: [], createdCardIds: [], allocatedCount: 10,
      })

      expect(isDeckImporting('deck-1')).toBe(false)
    })

    it('returns false when import is in error state', () => {
      const stores = makeStores()
      const { saveImportState, isDeckImporting } = useCollectionImport(stores)

      saveImportState({
        deckId: 'deck-1', deckName: 'D', status: 'error',
        totalCards: 10, currentCard: 3, cards: [], cardMeta: [], createdCardIds: [], allocatedCount: 0,
      })

      expect(isDeckImporting('deck-1')).toBe(false)
    })
  })

  describe('getImportProgress', () => {
    it('returns 100 when deckId does not match', () => {
      const stores = makeStores()
      const { saveImportState, getImportProgress } = useCollectionImport(stores)

      saveImportState({
        deckId: 'deck-1', deckName: 'D', status: 'fetching',
        totalCards: 10, currentCard: 5, cards: [], cardMeta: [], createdCardIds: [], allocatedCount: 0,
      })

      expect(getImportProgress('deck-2')).toBe(100)
    })

    it('returns 0 when totalCards is 0', () => {
      const stores = makeStores()
      const { saveImportState, getImportProgress } = useCollectionImport(stores)

      saveImportState({
        deckId: 'deck-1', deckName: 'D', status: 'fetching',
        totalCards: 0, currentCard: 0, cards: [], cardMeta: [], createdCardIds: [], allocatedCount: 0,
      })

      expect(getImportProgress('deck-1')).toBe(0)
    })

    it('calculates percentage correctly', () => {
      const stores = makeStores()
      const { saveImportState, getImportProgress } = useCollectionImport(stores)

      saveImportState({
        deckId: 'deck-1', deckName: 'D', status: 'processing',
        totalCards: 100, currentCard: 50, cards: [], cardMeta: [], createdCardIds: [], allocatedCount: 0,
      })

      expect(getImportProgress('deck-1')).toBe(50)
    })
  })

  describe('module-scoped isImportRunning', () => {
    it('exposes isImportRunning as a getter function', () => {
      const stores = makeStores()
      const { isImportRunning } = useCollectionImport(stores)
      // Should be a function that returns boolean
      expect(typeof isImportRunning).toBe('function')
      expect(typeof isImportRunning()).toBe('boolean')
    })
  })
})
