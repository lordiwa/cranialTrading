/**
 * RED phase tests for TASK-137: useCollectionTotals hydrates/persists resolved
 * card prices (scryfallId -> CardPrices) through the cardPricesCache module so
 * a warm page load shows CK totals without re-fetching fresh entries.
 *
 * Module-level singletons in useCollectionTotals.ts (pricesCache, setCodeCache,
 * sharedCardPrices, the abort controller, and the new "hydrated once per
 * session" flag) require a fresh module instance per test — hence
 * vi.resetModules() + dynamic import in every test.
 */
import type { CardPrices } from '@/services/mtgjson'
import { makeCard } from '../helpers/fixtures'

const mockGetCardPrices = vi.fn()
const mockPreloadSetMappings = vi.fn()
const mockHydrate = vi.fn()
const mockPersist = vi.fn()
const mockGetCardById = vi.fn()
const mockSearchCards = vi.fn()
const mockUpdateCard = vi.fn()

vi.mock('@/services/mtgjson', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/mtgjson')>()
  return {
    ...actual,
    getCardPrices: mockGetCardPrices,
    preloadSetMappings: mockPreloadSetMappings,
  }
})
vi.mock('@/services/cardPricesCache', () => ({
  hydrateCardPricesCache: mockHydrate,
  persistCardPricesBatch: mockPersist,
}))
vi.mock('@/services/scryfallCache', () => ({
  getCardById: mockGetCardById,
  searchCards: mockSearchCards,
}))
vi.mock('@/stores/collection', () => ({
  useCollectionStore: () => ({
    importing: false,
    getCardById: vi.fn(),
    updateCard: mockUpdateCard,
  }),
}))

const ckPrices = (retail: number): CardPrices => ({
  cardKingdom: { retail, retailFoil: null, buylist: null, buylistFoil: null },
})

async function loadFresh() {
  return import('@/composables/useCollectionTotals')
}

describe('useCollectionTotals — persistent price cache (TASK-137)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockPreloadSetMappings.mockResolvedValue(undefined)
    mockPersist.mockResolvedValue(undefined)
    mockSearchCards.mockResolvedValue([])
    mockUpdateCard.mockResolvedValue(true)
    mockHydrate.mockResolvedValue(new Map())
  })

  it('hydrates the price cache once at the start of fetchAllPrices and skips network fetch for fresh cached cards', async () => {
    mockHydrate.mockResolvedValue(new Map([
      ['scry-1', ckPrices(7)],
    ]))
    const { useCollectionTotals } = await loadFresh()
    const cards = [makeCard({ id: 'card-1', scryfallId: 'scry-1', setCode: 'M21', quantity: 1 })]
    const { fetchAllPrices, cardPrices, totals } = useCollectionTotals(() => cards)

    await fetchAllPrices()

    expect(mockHydrate).toHaveBeenCalledTimes(1)
    expect(mockGetCardPrices).not.toHaveBeenCalled()
    expect(cardPrices.value.get('card-1')).toEqual(ckPrices(7))
    expect(totals.value.ckCollection).toBeCloseTo(7)
  })

  it('fetches from network for cards missing from the persistent cache', async () => {
    mockGetCardPrices.mockResolvedValue(ckPrices(3))
    const { useCollectionTotals } = await loadFresh()
    const cards = [makeCard({ id: 'card-1', scryfallId: 'scry-1', setCode: 'M21' })]
    const { fetchAllPrices, cardPrices } = useCollectionTotals(() => cards)

    await fetchAllPrices()

    expect(mockGetCardPrices).toHaveBeenCalledWith('scry-1', 'M21')
    expect(cardPrices.value.get('card-1')).toEqual(ckPrices(3))
  })

  it('persists newly-fetched prices in batches, and never re-persists cards that were already fresh in the cache', async () => {
    mockHydrate.mockResolvedValue(new Map([['scry-hydrated', ckPrices(1)]]))
    mockGetCardPrices.mockImplementation(async (scryfallId: string) =>
      ckPrices(Number(scryfallId.split('-').pop()))
    )

    const { useCollectionTotals } = await loadFresh()
    const cards = [
      makeCard({ id: 'card-hydrated', scryfallId: 'scry-hydrated', setCode: 'M21' }),
      ...Array.from({ length: 26 }, (_, i) => makeCard({
        id: `card-new-${i}`,
        scryfallId: `scry-new-${i}`,
        setCode: 'M21',
      })),
    ]
    const { fetchAllPrices } = useCollectionTotals(() => cards)

    await fetchAllPrices()

    // 26 new cards, BATCH_TRIGGER_SIZE=25 -> one full batch flush + one final flush of 1
    expect(mockPersist).toHaveBeenCalledTimes(2)
    const allPersistedIds = mockPersist.mock.calls.flatMap(
      ([batch]) => Array.from((batch as Map<string, unknown>).keys())
    )
    expect(allPersistedIds).toHaveLength(26)
    expect(allPersistedIds).not.toContain('scry-hydrated')
    expect(new Set(allPersistedIds).size).toBe(26)
  })

  it('on abort mid-fetch, only persists cards that fully resolved before the abort — no partial entries', async () => {
    const { useCollectionTotals, cancelPriceFetch } = await loadFresh()
    const cards = [
      makeCard({ id: 'card-1', scryfallId: 'scry-1', setCode: 'M21' }),
      makeCard({ id: 'card-2', scryfallId: 'scry-2', setCode: 'M21' }),
      makeCard({ id: 'card-3', scryfallId: 'scry-3', setCode: 'M21' }),
    ]
    mockGetCardPrices.mockImplementation(async (scryfallId: string) => {
      if (scryfallId === 'scry-1') {
        // Simulate the user navigating away / cancelling while this card's
        // price request is still in flight.
        cancelPriceFetch()
      }
      return ckPrices(1)
    })

    const { fetchAllPrices, cardPrices } = useCollectionTotals(() => cards)
    await fetchAllPrices()

    // card-1 was already in flight when aborted, so it completes; card-2/3 never start.
    expect(cardPrices.value.has('card-1')).toBe(true)
    expect(cardPrices.value.has('card-2')).toBe(false)
    expect(cardPrices.value.has('card-3')).toBe(false)

    expect(mockPersist).toHaveBeenCalledTimes(1)
    const [batch] = mockPersist.mock.calls[0]
    expect(Array.from((batch as Map<string, unknown>).keys())).toEqual(['scry-1'])
  })

  it('does not break fetchAllPrices if cache hydration itself fails unexpectedly', async () => {
    mockHydrate.mockRejectedValue(new Error('boom'))
    mockGetCardPrices.mockResolvedValue(ckPrices(2))
    const { useCollectionTotals } = await loadFresh()
    const cards = [makeCard({ id: 'card-1', scryfallId: 'scry-1', setCode: 'M21' })]
    const { fetchAllPrices, cardPrices, loading } = useCollectionTotals(() => cards)

    await fetchAllPrices()

    expect(loading.value).toBe(false)
    expect(cardPrices.value.get('card-1')).toEqual(ckPrices(2))
  })
})
