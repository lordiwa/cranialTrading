/**
 * RED phase tests for useCollectionImport composable.
 * These tests verify state machine transitions, localStorage persistence, and guards.
 * All Firebase/Scryfall calls are mocked.
 */

import { ref } from 'vue'

vi.mock('@/services/scryfallCache', () => ({
  searchCards: vi.fn().mockResolvedValue([]),
  getCardsByIds: vi.fn().mockResolvedValue([]),
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
import { getCardsByIds } from '@/services/scryfallCache'

const IMPORT_KEY = 'cranial_deck_import_progress'

let capturedConfirmImportCards: any[] = []

function makeStores() {
  return {
    collectionStore: {
      importing: false,
      confirmImport: vi.fn().mockImplementation((cards: any[]) => {
        capturedConfirmImportCards = cards.map(c => ({ ...c }))
        return Promise.resolve(cards.map((_, i) => `card-${i}`))
      }),
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
    capturedConfirmImportCards = []
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

  // TASK-285: the CSV path used to call buildRawCsvCard() unconditionally and
  // never touched Scryfall, so card_index ended up with t='', co=[], r='',
  // cm=0 for every CSV-imported card. Both CSV entry points (handleImportCsv,
  // handleImportBinderCsv — hermanos paralelos, Regla 6) must now batch-fetch
  // Scryfall metadata like the Moxfield path does.
  describe('CSV import batch-fetches Scryfall metadata (TASK-285)', () => {
    const csvCard = {
      name: 'Counterspell',
      setCode: 'MH2',
      quantity: 4,
      foil: false,
      scryfallId: 'xyz-789',
      price: 2.50,
      condition: 'NM' as const,
    }

    const mockScryfallCard = {
      id: 'xyz-789',
      name: 'Counterspell',
      set: 'mh2',
      set_name: 'Modern Horizons 2',
      image_uris: { normal: 'https://cards.scryfall.io/normal/front/x/y/xyz-789.jpg' },
      prices: { usd: '3.10' },
      cmc: 2,
      type_line: 'Instant',
      colors: ['U'],
      rarity: 'uncommon',
      keywords: [],
      legalities: { modern: 'legal' },
      full_art: false,
    }

    // AC2: handleImportCsv (deck CSV import, ~line 602 before the fix) batch-fetches
    // by scryfallId and attaches metadata + _cacheFields to the saved cards.
    it('AC2: handleImportCsv batch-fetches by scryfallId and confirmImport receives metadata + _cacheFields', async () => {
      vi.mocked(getCardsByIds).mockResolvedValueOnce([mockScryfallCard as any])
      const stores = makeStores()
      const { handleImportCsv } = useCollectionImport(stores)

      await handleImportCsv([csvCard], 'Test Deck')

      expect(getCardsByIds).toHaveBeenCalledWith([{ id: 'xyz-789' }])
      const savedCards = capturedConfirmImportCards
      expect(savedCards).toHaveLength(1)
      expect(savedCards[0].type_line).toBe('Instant')
      expect(savedCards[0].colors).toEqual(['U'])
      expect(savedCards[0].rarity).toBe('uncommon')
      expect(savedCards[0].cmc).toBe(2)
      expect(savedCards[0]._cacheFields).toBeDefined()
      expect(savedCards[0]._cacheFields.type_line).toBe('Instant')
    })

    // AC2: handleImportBinderCsv (binder CSV import, ~line 875 before the fix) does
    // the same batch-fetch — hermano paralelo of handleImportCsv.
    it('AC2: handleImportBinderCsv batch-fetches by scryfallId and confirmImport receives metadata + _cacheFields', async () => {
      vi.mocked(getCardsByIds).mockResolvedValueOnce([mockScryfallCard as any])
      const stores = makeStores()
      const { handleImportBinderCsv } = useCollectionImport(stores)

      await handleImportBinderCsv([csvCard], 'Test Binder')

      expect(getCardsByIds).toHaveBeenCalledWith([{ id: 'xyz-789' }])
      const savedCards = capturedConfirmImportCards
      expect(savedCards).toHaveLength(1)
      expect(savedCards[0]._cacheFields).toBeDefined()
      expect(savedCards[0]._cacheFields.rarity).toBe('uncommon')
    })

    // AC3: a row with no scryfallId is not sent to Scryfall by id and still
    // imports through the raw path — not lost, not thrown.
    it('AC3: a CSV row without scryfallId still imports via the raw path', async () => {
      const noIdCard = { ...csvCard, scryfallId: '' }
      const stores = makeStores()
      const { handleImportCsv } = useCollectionImport(stores)

      await handleImportCsv([noIdCard], 'Test Deck')

      const savedCards = capturedConfirmImportCards
      expect(savedCards).toHaveLength(1)
      expect(savedCards[0].name).toBe('Counterspell')
      expect(savedCards[0]._cacheFields).toBeUndefined()
    })

    // AC4: a Scryfall batch-fetch rejection (network/rate-limit/timeout) must not
    // abort the import — cards still land via the raw fallback.
    it('AC4: Scryfall batch-fetch failure does not abort the import', async () => {
      vi.mocked(getCardsByIds).mockRejectedValueOnce(new Error('network timeout'))
      const stores = makeStores()
      const { handleImportCsv } = useCollectionImport(stores)

      await handleImportCsv([csvCard], 'Test Deck')

      expect(stores.toastStore.showProgress).toHaveBeenCalled()
      const savedCards = capturedConfirmImportCards
      expect(savedCards).toHaveLength(1)
      expect(savedCards[0].name).toBe('Counterspell')
      expect(savedCards[0]._cacheFields).toBeUndefined()
    })
  })
})
