import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useMarketStore } from '@/stores/market'
import { useCollectionStore } from '@/stores/collection'
import { makeCard } from '../helpers/fixtures'
import type { PriceMovers, PriceMover } from '@/services/market'

// Mock firebase before any store import
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: {},
}))

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

describe('market store — portfolio enhancements', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('portfolioImpacts with condition-adjusted values', () => {
    it('includes adjustedCurrentPrice, adjustedPastPrice, adjustedImpact', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      // Inject movers data
      market.movers = {
        winners: [makeMover({ name: 'Lightning Bolt', pastPrice: 1.00, presentPrice: 1.50, percentChange: 50 })],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      // Inject a LP card into collection
      collection.cards = [makeCard({ name: 'Lightning Bolt', condition: 'LP', quantity: 4, foil: false })]

      const impacts = market.portfolioImpacts
      expect(impacts).toHaveLength(1)

      const impact = impacts[0]
      // adjustedCurrentPrice = 1.50 * 0.85 = 1.275 → 1.27 (JS float)
      expect(impact.adjustedCurrentPrice).toBe(1.27)
      // adjustedPastPrice = 1.00 * 0.85 = 0.85
      expect(impact.adjustedPastPrice).toBe(0.85)
      // adjustedImpact = (1.27 - 0.85) * 4 = 1.68
      expect(impact.adjustedImpact).toBe(1.68)
    })

    it('uses full price for NM cards', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Bolt', pastPrice: 2.00, presentPrice: 3.00, percentChange: 50 })],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [makeCard({ name: 'Bolt', condition: 'NM', quantity: 1, foil: false })]

      const impact = market.portfolioImpacts[0]
      expect(impact.adjustedCurrentPrice).toBe(3.00)
      expect(impact.adjustedPastPrice).toBe(2.00)
      expect(impact.adjustedImpact).toBe(1.00)
    })
  })

  describe('portfolioStatusFilter', () => {
    it('defaults to all', () => {
      const market = useMarketStore()
      expect(market.portfolioStatusFilter).toBe('all')
    })

    it('filters by collection status', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Card A', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Card B', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Card A', status: 'collection', foil: false }),
        makeCard({ id: '2', name: 'Card B', status: 'sale', foil: false }),
      ]

      market.portfolioStatusFilter = 'collection'
      expect(market.filteredPortfolio).toHaveLength(1)
      expect(market.filteredPortfolio[0].card.name).toBe('Card A')
    })
  })

  describe('portfolioEditionFilter', () => {
    it('filters by edition', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Card A', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Card B', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Card A', edition: 'Magic 2021', foil: false }),
        makeCard({ id: '2', name: 'Card B', edition: 'Innistrad', foil: false }),
      ]

      market.portfolioEditionFilter = 'Innistrad'
      expect(market.filteredPortfolio).toHaveLength(1)
      expect(market.filteredPortfolio[0].card.name).toBe('Card B')
    })
  })

  describe('portfolioDirection filter', () => {
    it('defaults to all', () => {
      const market = useMarketStore()
      expect(market.portfolioDirection).toBe('all')
    })

    it('filters to winners only', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Winner', pastPrice: 1, presentPrice: 2, percentChange: 100 })],
        losers: [makeMover({ name: 'Loser', pastPrice: 2, presentPrice: 1, percentChange: -50 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Winner', foil: false }),
        makeCard({ id: '2', name: 'Loser', foil: false }),
      ]

      market.portfolioDirection = 'winners'
      expect(market.filteredPortfolio).toHaveLength(1)
      expect(market.filteredPortfolio[0].card.name).toBe('Winner')
    })

    it('filters to losers only', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Winner', pastPrice: 1, presentPrice: 2, percentChange: 100 })],
        losers: [makeMover({ name: 'Loser', pastPrice: 2, presentPrice: 1, percentChange: -50 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Winner', foil: false }),
        makeCard({ id: '2', name: 'Loser', foil: false }),
      ]

      market.portfolioDirection = 'losers'
      expect(market.filteredPortfolio).toHaveLength(1)
      expect(market.filteredPortfolio[0].card.name).toBe('Loser')
    })
  })

  describe('portfolioAvailableEditions', () => {
    it('returns unique editions from cards with mover data', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Card A', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Card B', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Card A', edition: 'Magic 2021', foil: false }),
        makeCard({ id: '2', name: 'Card B', edition: 'Innistrad', foil: false }),
        makeCard({ id: '3', name: 'Card A', edition: 'Magic 2021', foil: false }),
      ]

      const editions = market.portfolioAvailableEditions
      expect(editions).toEqual(['Innistrad', 'Magic 2021'])
    })
  })

  describe('portfolioSort extended options', () => {
    it('sorts by price', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Cheap', pastPrice: 0.50, presentPrice: 1.00, percentChange: 100 }),
          makeMover({ name: 'Expensive', pastPrice: 5.00, presentPrice: 10.00, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Cheap', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'Expensive', foil: false, quantity: 1 }),
      ]

      market.portfolioSort = 'price'
      expect(market.sortedPortfolio[0].card.name).toBe('Expensive')
    })

    it('sorts by name ascending', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Zebra Card', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Alpha Card', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Zebra Card', foil: false }),
        makeCard({ id: '2', name: 'Alpha Card', foil: false }),
      ]

      market.portfolioSort = 'name'
      market.portfolioSortAsc = true
      expect(market.sortedPortfolio[0].card.name).toBe('Alpha Card')
    })
  })

  describe('portfolioSummary includes totalValue', () => {
    it('calculates total adjusted value of portfolio cards', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Bolt', pastPrice: 1.00, presentPrice: 1.50, percentChange: 50 })],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [makeCard({ name: 'Bolt', condition: 'LP', quantity: 4, foil: false })]

      // adjustedCurrentPrice = 1.50 * 0.85 = 1.27 (JS float), * 4 = 5.08
      expect(market.portfolioSummary.totalValue).toBe(5.08)
    })
  })

  describe('wishlist pipeline', () => {
    it('wishlistImpacts only includes wishlist cards', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Owned Card', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Wanted Card', pastPrice: 5, presentPrice: 3, percentChange: -40 }),
        ],
        losers: [makeMover({ name: 'Wanted Card', pastPrice: 5, presentPrice: 3, percentChange: -40 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Owned Card', status: 'collection', foil: false }),
        makeCard({ id: '2', name: 'Wanted Card', status: 'wishlist', foil: false }),
      ]

      expect(market.wishlistImpacts).toHaveLength(1)
      expect(market.wishlistImpacts[0].card.name).toBe('Wanted Card')
    })

    it('wishlistSummary has correct stats', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Up Card', pastPrice: 1, presentPrice: 2, percentChange: 100 })],
        losers: [makeMover({ name: 'Down Card', pastPrice: 5, presentPrice: 3, percentChange: -40 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Up Card', status: 'wishlist', quantity: 1, foil: false }),
        makeCard({ id: '2', name: 'Down Card', status: 'wishlist', quantity: 2, foil: false }),
      ]

      const summary = market.wishlistSummary
      expect(summary.affectedCards).toBe(2)
      expect(summary.gainers).toBe(1)
      expect(summary.losers).toBe(1)
    })

    it('wishlistAvailableEditions returns sorted unique editions', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Card A', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Card B', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Card A', status: 'wishlist', edition: 'Zendikar', foil: false }),
        makeCard({ id: '2', name: 'Card B', status: 'wishlist', edition: 'Dominaria', foil: false }),
      ]

      expect(market.wishlistAvailableEditions).toEqual(['Dominaria', 'Zendikar'])
    })
  })

  describe('setTrendSummary', () => {
    it('computes avg change, top gainer, top loser for selected set', () => {
      const market = useMarketStore()
      market.movers = {
        winners: [
          makeMover({ name: 'Big Win', setName: 'Set A', pastPrice: 1, presentPrice: 3, percentChange: 200 }),
          makeMover({ name: 'Small Win', setName: 'Set A', pastPrice: 1, presentPrice: 1.5, percentChange: 50 }),
          makeMover({ name: 'Other Set', setName: 'Set B', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
        ],
        losers: [
          makeMover({ name: 'Big Loss', setName: 'Set A', pastPrice: 5, presentPrice: 2, percentChange: -60 }),
        ],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      market.moversSetFilter = 'Set A'
      const summary = market.setTrendSummary
      expect(summary).not.toBeNull()
      expect(summary!.cardCount).toBe(3)
      expect(summary!.topGainer).toBe('Big Win')
      expect(summary!.topLoser).toBe('Big Loss')
      // avg change = (200 + 50 + -60) / 3 = 63.33...
      expect(summary!.avgChange).toBeCloseTo(63.33, 1)
    })

    it('returns null when no set is selected', () => {
      const market = useMarketStore()
      market.movers = {
        winners: [makeMover()],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      market.moversSetFilter = ''
      expect(market.setTrendSummary).toBeNull()
    })
  })

  describe('activeTab defaults to portfolio', () => {
    it('defaults to portfolio', () => {
      const market = useMarketStore()
      expect(market.activeTab).toBe('portfolio')
    })
  })

  describe('portfolioSortAsc — ascending/descending toggle', () => {
    function setupTwoCards() {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Small Impact', pastPrice: 1, presentPrice: 1.10, percentChange: 10 }),
          makeMover({ name: 'Big Impact', pastPrice: 1, presentPrice: 2.00, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Small Impact', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'Big Impact', foil: false, quantity: 1 }),
      ]

      return market
    }

    it('defaults to descending (false)', () => {
      const market = useMarketStore()
      expect(market.portfolioSortAsc).toBe(false)
    })

    it('sorts impact descending by default (biggest first)', () => {
      const market = setupTwoCards()
      market.portfolioSort = 'impact'
      market.portfolioSortAsc = false
      expect(market.sortedPortfolio[0].card.name).toBe('Big Impact')
    })

    it('sorts impact ascending when toggled (smallest first)', () => {
      const market = setupTwoCards()
      market.portfolioSort = 'impact'
      market.portfolioSortAsc = true
      expect(market.sortedPortfolio[0].card.name).toBe('Small Impact')
    })

    it('sorts percent descending by default', () => {
      const market = setupTwoCards()
      market.portfolioSort = 'percent'
      market.portfolioSortAsc = false
      expect(market.sortedPortfolio[0].card.name).toBe('Big Impact')
    })

    it('sorts percent ascending when toggled', () => {
      const market = setupTwoCards()
      market.portfolioSort = 'percent'
      market.portfolioSortAsc = true
      expect(market.sortedPortfolio[0].card.name).toBe('Small Impact')
    })
  })

  describe('wishlistSortAsc — ascending/descending toggle', () => {
    it('defaults to descending (false)', () => {
      const market = useMarketStore()
      expect(market.wishlistSortAsc).toBe(false)
    })

    it('sorts wishlist impact ascending when toggled', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Small', pastPrice: 1, presentPrice: 1.10, percentChange: 10 }),
          makeMover({ name: 'Big', pastPrice: 1, presentPrice: 2.00, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Small', status: 'wishlist', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'Big', status: 'wishlist', foil: false, quantity: 1 }),
      ]

      market.wishlistSort = 'impact'
      market.wishlistSortAsc = true
      expect(market.sortedWishlist[0].card.name).toBe('Small')
    })
  })

  // ====== C1: adjustedImpact used throughout ======
  describe('C1 — adjustedImpact used in summary, sort, and direction filter', () => {
    it('portfolioSummary.totalChange uses adjustedImpact (not raw totalImpact)', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Bolt', pastPrice: 1.00, presentPrice: 1.50, percentChange: 50 })],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      // LP card: adjustedImpact = (1.27 - 0.85) * 4 = 1.68
      // raw totalImpact = (1.50 - 1.00) * 4 = 2.00
      collection.cards = [makeCard({ name: 'Bolt', condition: 'LP', quantity: 4, foil: false })]

      expect(market.portfolioSummary.totalChange).toBe(1.68)
    })

    it('wishlistSummary.totalChange uses adjustedImpact', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Bolt', pastPrice: 1.00, presentPrice: 1.50, percentChange: 50 })],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [makeCard({ name: 'Bolt', condition: 'LP', quantity: 4, foil: false, status: 'wishlist' })]

      expect(market.wishlistSummary.totalChange).toBe(1.68)
    })

    it('direction filter uses adjustedImpact', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Gainer', pastPrice: 1, presentPrice: 2, percentChange: 100 })],
        losers: [makeMover({ name: 'Loser', pastPrice: 2, presentPrice: 1, percentChange: -50 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Gainer', foil: false }),
        makeCard({ id: '2', name: 'Loser', foil: false }),
      ]

      market.portfolioDirection = 'winners'
      expect(market.filteredPortfolio).toHaveLength(1)
      expect(market.filteredPortfolio[0].adjustedImpact).toBeGreaterThan(0)

      market.portfolioDirection = 'losers'
      expect(market.filteredPortfolio).toHaveLength(1)
      expect(market.filteredPortfolio[0].adjustedImpact).toBeLessThan(0)
    })

    it('portfolioSummary gainers/losers counts use adjustedImpact', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Gainer', pastPrice: 1, presentPrice: 2, percentChange: 100 })],
        losers: [makeMover({ name: 'Loser', pastPrice: 2, presentPrice: 1, percentChange: -50 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Gainer', foil: false }),
        makeCard({ id: '2', name: 'Loser', foil: false }),
      ]

      expect(market.portfolioSummary.gainers).toBe(1)
      expect(market.portfolioSummary.losers).toBe(1)
    })
  })

  // ====== C3: Edition-aware mover matching ======
  describe('C3 — edition-aware mover matching', () => {
    it('prefers mover matching the card edition over arbitrary match', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      // Same card name in two sets with different prices
      market.movers = {
        winners: [
          makeMover({ name: 'Lightning Bolt', setName: 'Alpha', pastPrice: 100, presentPrice: 200, percentChange: 100 }),
          makeMover({ name: 'Lightning Bolt', setName: 'Magic 2021', pastPrice: 1.00, presentPrice: 1.50, percentChange: 50 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [makeCard({ name: 'Lightning Bolt', edition: 'Magic 2021', foil: false, quantity: 1 })]

      const impact = market.portfolioImpacts[0]
      // Should match the Magic 2021 mover, not Alpha
      expect(impact.mover.setName).toBe('Magic 2021')
      expect(impact.mover.presentPrice).toBe(1.50)
    })

    it('falls back to first match when no edition match exists', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Lightning Bolt', setName: 'Alpha', pastPrice: 100, presentPrice: 200, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      // Card edition doesn't match any mover's setName
      collection.cards = [makeCard({ name: 'Lightning Bolt', edition: 'Revised', foil: false, quantity: 1 })]

      const impact = market.portfolioImpacts[0]
      expect(impact.mover.setName).toBe('Alpha')
    })
  })

  // ====== M1: moversSetFilter reset on direction change ======
  describe('M1 — moversSetFilter resets on direction change', () => {
    it('clears moversSetFilter when moversDirection changes', async () => {
      const market = useMarketStore()
      market.movers = {
        winners: [makeMover({ setName: 'Set A' })],
        losers: [makeMover({ setName: 'Set B' })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      market.moversSetFilter = 'Set A'
      expect(market.moversSetFilter).toBe('Set A')

      market.moversDirection = 'losers'
      await nextTick()
      expect(market.moversSetFilter).toBe('')
    })
  })

  // ====== M2: Signed sort (no Math.abs) ======
  describe('M2 — signed sort comparators (no Math.abs)', () => {
    function setupMixedCards() {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Gainer', pastPrice: 1, presentPrice: 1.10, percentChange: 10 })],
        losers: [makeMover({ name: 'Loser', pastPrice: 2, presentPrice: 1, percentChange: -50 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Gainer', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'Loser', foil: false, quantity: 1 }),
      ]

      return market
    }

    it('sorts impact descending: most positive first', () => {
      const market = setupMixedCards()
      market.portfolioSort = 'impact'
      market.portfolioSortAsc = false
      expect(market.sortedPortfolio[0].card.name).toBe('Gainer')
    })

    it('sorts impact ascending: most negative first', () => {
      const market = setupMixedCards()
      market.portfolioSort = 'impact'
      market.portfolioSortAsc = true
      expect(market.sortedPortfolio[0].card.name).toBe('Loser')
    })

    it('sorts percent descending: most positive first', () => {
      const market = setupMixedCards()
      market.portfolioSort = 'percent'
      market.portfolioSortAsc = false
      expect(market.sortedPortfolio[0].card.name).toBe('Gainer')
    })

    it('sorts percent ascending: most negative first', () => {
      const market = setupMixedCards()
      market.portfolioSort = 'percent'
      market.portfolioSortAsc = true
      expect(market.sortedPortfolio[0].card.name).toBe('Loser')
    })

    it('wishlist: sorts impact descending: most positive first', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Gainer', pastPrice: 1, presentPrice: 1.10, percentChange: 10 })],
        losers: [makeMover({ name: 'Loser', pastPrice: 2, presentPrice: 1, percentChange: -50 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Gainer', status: 'wishlist', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'Loser', status: 'wishlist', foil: false, quantity: 1 }),
      ]

      market.wishlistSort = 'impact'
      market.wishlistSortAsc = false
      expect(market.sortedWishlist[0].card.name).toBe('Gainer')
    })

    it('wishlist: sorts percent ascending: most negative first', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Gainer', pastPrice: 1, presentPrice: 1.10, percentChange: 10 })],
        losers: [makeMover({ name: 'Loser', pastPrice: 2, presentPrice: 1, percentChange: -50 })],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Gainer', status: 'wishlist', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'Loser', status: 'wishlist', foil: false, quantity: 1 }),
      ]

      market.wishlistSort = 'percent'
      market.wishlistSortAsc = true
      expect(market.sortedWishlist[0].card.name).toBe('Loser')
    })
  })

  // ====== M8: totalChange rounding ======
  describe('M8 — totalChange rounding in summaries', () => {
    it('portfolioSummary.totalChange is rounded to 2 decimal places', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      // Set up cards that produce floating point artifacts
      market.movers = {
        winners: [
          makeMover({ name: 'A', pastPrice: 1.00, presentPrice: 1.33, percentChange: 33 }),
          makeMover({ name: 'B', pastPrice: 1.00, presentPrice: 1.33, percentChange: 33 }),
          makeMover({ name: 'C', pastPrice: 1.00, presentPrice: 1.33, percentChange: 33 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'A', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'B', foil: false, quantity: 1 }),
        makeCard({ id: '3', name: 'C', foil: false, quantity: 1 }),
      ]

      const tc = market.portfolioSummary.totalChange
      // Should be cleanly rounded, no floating point artifacts
      expect(tc).toBe(Math.round(tc * 100) / 100)
    })

    it('wishlistSummary.totalChange is rounded to 2 decimal places', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'A', pastPrice: 1.00, presentPrice: 1.33, percentChange: 33 }),
          makeMover({ name: 'B', pastPrice: 1.00, presentPrice: 1.33, percentChange: 33 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'A', status: 'wishlist', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'B', status: 'wishlist', foil: false, quantity: 1 }),
      ]

      const tc = market.wishlistSummary.totalChange
      expect(tc).toBe(Math.round(tc * 100) / 100)
    })
  })

  // ====== Test gaps ======
  describe('combined filter composition', () => {
    it('applies status + edition + direction + search simultaneously', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Target Card', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Wrong Name', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Target Other', pastPrice: 2, presentPrice: 1, percentChange: -50 }),
        ],
        losers: [
          makeMover({ name: 'Target Other', pastPrice: 2, presentPrice: 1, percentChange: -50 }),
        ],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Target Card', status: 'collection', edition: 'Set A', foil: false }),
        makeCard({ id: '2', name: 'Wrong Name', status: 'collection', edition: 'Set A', foil: false }),
        makeCard({ id: '3', name: 'Target Other', status: 'sale', edition: 'Set A', foil: false }),
        makeCard({ id: '4', name: 'Target Card', status: 'sale', edition: 'Set B', foil: false }),
      ]

      market.portfolioStatusFilter = 'collection'
      market.portfolioEditionFilter = 'Set A'
      market.portfolioDirection = 'winners'
      market.portfolioSearch = 'Target'

      expect(market.filteredPortfolio).toHaveLength(1)
      expect(market.filteredPortfolio[0].card.name).toBe('Target Card')
    })
  })

  describe('wishlist sort all types + asc/desc', () => {
    function setupWishlistCards() {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Cheap', pastPrice: 0.50, presentPrice: 1.00, percentChange: 100 }),
          makeMover({ name: 'Expensive', pastPrice: 5.00, presentPrice: 10.00, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Cheap', status: 'wishlist', foil: false, quantity: 1 }),
        makeCard({ id: '2', name: 'Expensive', status: 'wishlist', foil: false, quantity: 1 }),
      ]

      return market
    }

    it('sorts by price descending', () => {
      const market = setupWishlistCards()
      market.wishlistSort = 'price'
      market.wishlistSortAsc = false
      expect(market.sortedWishlist[0].card.name).toBe('Expensive')
    })

    it('sorts by price ascending', () => {
      const market = setupWishlistCards()
      market.wishlistSort = 'price'
      market.wishlistSortAsc = true
      expect(market.sortedWishlist[0].card.name).toBe('Cheap')
    })

    it('sorts by name descending', () => {
      const market = setupWishlistCards()
      market.wishlistSort = 'name'
      market.wishlistSortAsc = false
      expect(market.sortedWishlist[0].card.name).toBe('Expensive')
    })

    it('sorts by name ascending', () => {
      const market = setupWishlistCards()
      market.wishlistSort = 'name'
      market.wishlistSortAsc = true
      expect(market.sortedWishlist[0].card.name).toBe('Cheap')
    })
  })

  describe('page reset watchers', () => {
    it('resets portfolioPage when portfolioSearch changes', async () => {
      const market = useMarketStore()
      market.portfolioPage = 3
      market.portfolioSearch = 'test'
      await nextTick()
      expect(market.portfolioPage).toBe(1)
    })

    it('resets portfolioPage when portfolioStatusFilter changes', async () => {
      const market = useMarketStore()
      market.portfolioPage = 3
      market.portfolioStatusFilter = 'collection'
      await nextTick()
      expect(market.portfolioPage).toBe(1)
    })

    it('resets portfolioPage when portfolioEditionFilter changes', async () => {
      const market = useMarketStore()
      market.portfolioPage = 3
      market.portfolioEditionFilter = 'Set A'
      await nextTick()
      expect(market.portfolioPage).toBe(1)
    })

    it('resets portfolioPage when portfolioDirection changes', async () => {
      const market = useMarketStore()
      market.portfolioPage = 3
      market.portfolioDirection = 'winners'
      await nextTick()
      expect(market.portfolioPage).toBe(1)
    })

    it('resets wishlistPage when wishlistSearch changes', async () => {
      const market = useMarketStore()
      market.wishlistPage = 3
      market.wishlistSearch = 'test'
      await nextTick()
      expect(market.wishlistPage).toBe(1)
    })

    it('resets wishlistPage when wishlistDirection changes', async () => {
      const market = useMarketStore()
      market.wishlistPage = 3
      market.wishlistDirection = 'winners'
      await nextTick()
      expect(market.wishlistPage).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('handles empty collection gracefully', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover()],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = []

      expect(market.portfolioImpacts).toHaveLength(0)
      expect(market.portfolioSummary.totalChange).toBe(0)
      expect(market.portfolioSummary.affectedCards).toBe(0)
      expect(market.portfolioAvailableEditions).toEqual([])
    })

    it('handles no movers data gracefully', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = null
      collection.cards = [makeCard({ name: 'Bolt', foil: false })]

      expect(market.portfolioImpacts).toHaveLength(0)
      expect(market.wishlistImpacts).toHaveLength(0)
    })

    it('handles all cards filtered out', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [makeMover({ name: 'Card A', pastPrice: 1, presentPrice: 2, percentChange: 100 })],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [makeCard({ id: '1', name: 'Card A', status: 'collection', foil: false })]

      // Filter to a status that excludes the card
      market.portfolioStatusFilter = 'sale'
      expect(market.filteredPortfolio).toHaveLength(0)
      expect(market.paginatedPortfolio).toHaveLength(0)
      expect(market.totalPortfolioPages).toBe(1)
    })
  })

  describe('search filter', () => {
    it('portfolioSearch filters by card name', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Lightning Bolt', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Dark Ritual', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Lightning Bolt', foil: false }),
        makeCard({ id: '2', name: 'Dark Ritual', foil: false }),
      ]

      market.portfolioSearch = 'bolt'
      expect(market.filteredPortfolio).toHaveLength(1)
      expect(market.filteredPortfolio[0].card.name).toBe('Lightning Bolt')
    })

    it('wishlistSearch filters by card name', () => {
      const market = useMarketStore()
      const collection = useCollectionStore()

      market.movers = {
        winners: [
          makeMover({ name: 'Lightning Bolt', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
          makeMover({ name: 'Dark Ritual', pastPrice: 1, presentPrice: 2, percentChange: 100 }),
        ],
        losers: [],
        sourceDate: '2024-01-01',
        updatedAt: null,
      } as PriceMovers

      collection.cards = [
        makeCard({ id: '1', name: 'Lightning Bolt', status: 'wishlist', foil: false }),
        makeCard({ id: '2', name: 'Dark Ritual', status: 'wishlist', foil: false }),
      ]

      market.wishlistSearch = 'ritual'
      expect(market.filteredWishlist).toHaveLength(1)
      expect(market.filteredWishlist[0].card.name).toBe('Dark Ritual')
    })
  })
})
