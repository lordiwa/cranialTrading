/**
 * TASK-299. Production wargaming (2026-09-15, /collection): adding 3
 * Counterspell in `sale` status bumped the card/unique COUNTS instantly
 * (44->47, 17->18) but every money figure in the totals bar (and the hero)
 * never moved — not at t+6s, not at t+51s — only after a full page reload
 * (+$179.97 = 3 x $59.99, the CK retail of the added card).
 *
 * Root cause (CollectionTotalsPanel.vue): the watch on
 * `collectionStore.cards.length` that (re)triggers fetchAllPrices() only
 * fires on the very first `oldLen === 0` transition. A card added after
 * mount changes `cards.length` again, but that transition is NOT
 * `oldLen === 0`, so its price is never fetched and it permanently
 * contributes $0 to every CK-priced total (useCollectionTotals.ts).
 *
 * AC5: this test mounts the panel with one already-priced `sale` card, lets
 * the initial fetch settle, then adds a second `sale` card with a KNOWN
 * price and asserts EN VENTA grows by exactly price * quantity — without
 * ever reloading/remounting.
 */
import { nextTick, reactive } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { Card } from '@/types/card'
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

// A plain reactive() object stands in for the Pinia collection store — its
// `cards` array is deep-reactive on its own, no Pinia instance required, and
// reassigning it (never .push) mirrors how the real store always replaces
// `cards.value` with a new array (see src/stores/collection.ts).
const mockCollectionStore = reactive({
  cards: [] as Card[],
  importing: false,
  getCardById: (id: string) => mockCollectionStore.cards.find(c => c.id === id) ?? null,
  updateCard: mockUpdateCard,
})

vi.mock('@/stores/collection', () => ({
  useCollectionStore: () => mockCollectionStore,
}))

vi.mock('@/composables/usePriceHistory', () => ({
  usePriceHistory: () => ({
    saveSnapshot: vi.fn(),
    loadHistory: vi.fn().mockResolvedValue([]),
    saveCardPrices: vi.fn(),
  }),
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  t: (key: string) => key,
}))

const ckPrices = (retail: number): CardPrices => ({
  cardKingdom: { retail, retailFoil: null, buylist: null, buylistFoil: null },
})

async function loadPanel() {
  const mod = await import('../../../src/components/collection/CollectionTotalsPanel.vue')
  return mod.default
}

function saleTotalText(wrapper: { text: () => string }): string {
  const match = wrapper.text().match(/collection\.totals\.headers\.forSale\s*\$([\d.]+)/)
  return match?.[1] ?? '(no match)'
}

describe('CollectionTotalsPanel — TASK-299 money totals must react to a card added after mount', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockCollectionStore.cards = []
    mockCollectionStore.importing = false
    mockPreloadSetMappings.mockResolvedValue(undefined)
    mockPersist.mockResolvedValue(undefined)
    mockSearchCards.mockResolvedValue([])
    mockUpdateCard.mockResolvedValue(true)
    mockHydrate.mockResolvedValue(new Map())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC5: adding 3 Counterspell at $59.99 bumps EN VENTA by exactly $179.97 without a reload', async () => {
    mockGetCardPrices.mockImplementation(async (scryfallId: string) => {
      if (scryfallId === 'scry-existing') return ckPrices(100)
      if (scryfallId === 'scry-counterspell') return ckPrices(59.99)
      return null
    })

    mockCollectionStore.cards = [
      makeCard({ id: 'card-existing', scryfallId: 'scry-existing', setCode: 'M21', quantity: 1, status: 'sale' }),
    ]

    const CollectionTotalsPanel = await loadPanel()
    const wrapper = mount(CollectionTotalsPanel)

    // Initial mount fetch (onMounted's own 3s-deferred fetchAllPrices).
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(saleTotalText(wrapper)).toBe('100.00')

    // Add the 3 Counterspells — the exact wargaming repro, no reload.
    mockCollectionStore.cards = [
      ...mockCollectionStore.cards,
      makeCard({ id: 'card-counterspell', scryfallId: 'scry-counterspell', setCode: 'MH2', quantity: 3, status: 'sale' }),
    ]

    // t+6s in the wargaming measurement, sin recargar.
    await vi.advanceTimersByTimeAsync(6000)
    await flushPromises()

    expect(saleTotalText(wrapper)).toBe('279.97') // 100.00 + (59.99 * 3)

    wrapper.unmount()
  })

  it('AC4: says the total is pending while a newly-added card\'s price has not resolved, and clears once it has', async () => {
    mockGetCardPrices.mockImplementation(async (scryfallId: string) => {
      if (scryfallId === 'scry-existing') return ckPrices(100)
      if (scryfallId === 'scry-counterspell') return ckPrices(59.99)
      return null
    })

    mockCollectionStore.cards = [
      makeCard({ id: 'card-existing', scryfallId: 'scry-existing', setCode: 'M21', quantity: 1, status: 'sale' }),
    ]

    const CollectionTotalsPanel = await loadPanel()
    const wrapper = mount(CollectionTotalsPanel)

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    // Fully resolved — nothing pending, no ellipsis indicator.
    expect(wrapper.text()).not.toContain('…')

    // Add the new card — price fetch hasn't even started yet (still inside
    // the delayed setTimeout window), but the total is ALREADY incomplete.
    mockCollectionStore.cards = [
      ...mockCollectionStore.cards,
      makeCard({ id: 'card-counterspell', scryfallId: 'scry-counterspell', setCode: 'MH2', quantity: 3, status: 'sale' }),
    ]
    await nextTick()
    expect(wrapper.text()).toContain('…')

    // Once the delayed fetch runs and resolves, the pending marker clears.
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(wrapper.text()).not.toContain('…')

    wrapper.unmount()
  })
})
