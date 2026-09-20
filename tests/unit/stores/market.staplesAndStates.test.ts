import { setActivePinia, createPinia } from 'pinia'
import { useMarketStore } from '@/stores/market'
import { useCollectionStore } from '@/stores/collection'
import { useToastStore } from '@/stores/toast'
import { makeCard } from '../helpers/fixtures'
import * as marketService from '@/services/market'
import type { PriceMovers, PriceMover, FormatStaples } from '@/services/market'

// Mock firebase before any store import
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: {},
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/market', () => ({
  getPriceMovers: vi.fn(),
  getFormatStaples: vi.fn(),
}))

function makeMover(overrides: Partial<PriceMover> = {}): PriceMover {
  return {
    name: 'Lightning Bolt',
    setName: 'Magic 2021',
    rarity: 'uncommon',
    image: 'https://example.com/bolt.jpg',
    pastPrice: 1.00,
    presentPrice: 1.50,
    percentChange: 50,
    foil: false,
    ...overrides,
  }
}

describe('market store — staple price join (TASK-311)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Harm prevented: a staple row silently showing no price (or, if code
  // regresses to a naive lookup, $0/NaN) even though the SAME movers dataset
  // the rest of /market already uses has a matching card.
  it('stapleMoverMatch finds the mover by name — same source as the rest of /market', () => {
    const market = useMarketStore()
    market.movers = {
      winners: [makeMover({ name: 'Ragavan, Nimble Pilferer', presentPrice: 45.00 })],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers

    const match = market.stapleMoverMatch('Ragavan, Nimble Pilferer')
    expect(match?.presentPrice).toBe(45.00)
  })

  it('stapleMoverMatch is case-insensitive on the card name', () => {
    const market = useMarketStore()
    market.movers = {
      winners: [makeMover({ name: 'Ragavan, Nimble Pilferer', presentPrice: 45.00 })],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers

    expect(market.stapleMoverMatch('ragavan, nimble pilferer')?.presentPrice).toBe(45.00)
  })

  // Harm prevented: a staple with no published price rendering as a
  // fabricated $0.00/NaN instead of an honest "no price" state.
  it('stapleMoverMatch returns null for a staple with no matching mover', () => {
    const market = useMarketStore()
    market.movers = {
      winners: [makeMover({ name: 'Some Other Card' })],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers

    expect(market.stapleMoverMatch('Ragavan, Nimble Pilferer')).toBeNull()
  })

  it('stapleMoverMatch returns null when no movers data has loaded at all', () => {
    const market = useMarketStore()
    market.movers = null
    expect(market.stapleMoverMatch('Anything')).toBeNull()
  })
})

describe('market store — price source failure surfaces a toast (TASK-314)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // Harm prevented: MEASURED on dev — a failed Firestore read used to be
  // swallowed inside services/market.ts (catch → return null), so the
  // store's own try/catch (which shows this toast) never ran: 2 aborted
  // requests, 0 toasts shown. This locks the propagation path so a future
  // regression back to swallow-and-return-null goes red here.
  it('loadMovers shows an error toast when the price source throws', async () => {
    vi.mocked(marketService.getPriceMovers).mockRejectedValueOnce(new Error('unavailable'))
    const market = useMarketStore()
    const toastStore = useToastStore()
    const showSpy = vi.spyOn(toastStore, 'show')

    await market.loadMovers('market_regular')

    expect(showSpy).toHaveBeenCalledWith(expect.any(String), 'error')
    expect(market.movers).toBeNull()
  })

  it('loadStaples shows an error toast when the price source throws', async () => {
    vi.mocked(marketService.getFormatStaples).mockRejectedValueOnce(new Error('unavailable'))
    const market = useMarketStore()
    const toastStore = useToastStore()
    const showSpy = vi.spyOn(toastStore, 'show')

    await market.loadStaples('modern')

    expect(showSpy).toHaveBeenCalledWith(expect.any(String), 'error')
    expect(market.staples).toBeNull()
  })
})

describe('market store — portfolio/wishlist view state (TASK-314 + TASK-315, atomic)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Harm prevented: with the price source down, the portfolio/wishlist tabs
  // used to fall through to "none of your cards match" — MEASURED on dev as
  // the one text on screen blaming the user's collection for a data-source
  // failure. This must be distinguishable from both real empty states.
  it('portfolioViewState is dataUnavailable when movers failed to load, regardless of collection state', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.movers = null
    collection.cards = [makeCard({ name: 'Bolt' })]
    expect(market.portfolioViewState).toBe('dataUnavailable')
  })

  it('portfolioViewState is emptyCollection when the user has no non-wishlist cards', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.movers = { winners: [makeMover()], losers: [], sourceDate: '2024-01-01', updatedAt: null } as PriceMovers
    collection.cards = []
    expect(market.portfolioViewState).toBe('emptyCollection')
  })

  it('portfolioViewState is noMatches only when the user has cards AND prices loaded AND none matched', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.movers = { winners: [makeMover({ name: 'Unrelated Card' })], losers: [], sourceDate: '2024-01-01', updatedAt: null } as PriceMovers
    collection.cards = [makeCard({ name: 'Bolt', status: 'collection' })]
    expect(market.portfolioViewState).toBe('noMatches')
  })

  it('wishlistViewState is emptyCollection when the user has no wishlist cards', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.movers = { winners: [makeMover()], losers: [], sourceDate: '2024-01-01', updatedAt: null } as PriceMovers
    collection.cards = [makeCard({ name: 'Bolt', status: 'collection' })]
    expect(market.wishlistViewState).toBe('emptyCollection')
  })

  // Harm prevented: UC-22.3 asks for total value + variation on the cards
  // the user actually has; wishlistSummary never carried totalValue, unlike
  // portfolioSummary — so the wishlist banner had no way to show it.
  it('wishlistSummary.totalValue sums adjusted current price × quantity, like portfolioSummary', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.movers = {
      winners: [makeMover({ name: 'Bolt', pastPrice: 1.00, presentPrice: 1.50 })],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers
    collection.cards = [makeCard({ name: 'Bolt', condition: 'NM', quantity: 2, foil: false, status: 'wishlist' })]

    expect(market.wishlistSummary.totalValue).toBe(3.00)
  })
})
