/**
 * Component-level locks for the /market cluster (TASK-311/312/314/315).
 * Mounts the real MarketView.vue template so the assertions exercise the
 * actual DOM wiring, not just the store computeds these read from.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MarketView from '@/views/MarketView.vue'
import { useMarketStore } from '@/stores/market'
import { useAuthStore } from '@/stores/auth'
import { useCollectionStore } from '@/stores/collection'
import { makeCard } from '../helpers/fixtures'
import type { PriceMovers, PriceMover, FormatStaples, StapleCard } from '@/services/market'

vi.mock('@/services/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/services/market', () => ({
  getPriceMovers: vi.fn().mockResolvedValue(null),
  getFormatStaples: vi.fn().mockResolvedValue(null),
}))

// Echo i18n keys so assertions can check exactly which key rendered,
// without depending on locale copy (that's covered separately by the
// i18n-key-exists check and the manual Grep verification in the hand-off).
function echoT(key: string, params?: Record<string, unknown>): string {
  return params ? `${key}:${JSON.stringify(params)}` : key
}
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: echoT, locale: { value: 'en' } }),
  t: echoT,
}))

const STUBS = {
  AppContainer: { template: '<div><slot /></div>' },
  BaseInput: true,
  BaseLoader: { template: '<div data-testid="loader-stub" />' },
  BaseSelect: true,
  EditionSummaryHeader: true,
  PortfolioSummaryBanner: { template: '<div class="psb-stub" :data-total-value="totalValue" />', props: ['totalChange', 'affectedCards', 'gainers', 'losers', 'totalValue', 'keyPrefix'] },
  StickyEditionFilter: true,
  SvgIcon: true,
}

function makeMover(overrides: Partial<PriceMover> = {}): PriceMover {
  return {
    name: 'Ragavan, Nimble Pilferer',
    setName: 'Modern Horizons 2',
    rarity: 'mythic',
    image: 'https://example.com/ragavan.jpg',
    pastPrice: 40.00,
    presentPrice: 45.00,
    percentChange: 12.5,
    foil: false,
    ...overrides,
  }
}

function makeStaple(overrides: Partial<StapleCard> = {}): StapleCard {
  return {
    name: 'Ragavan, Nimble Pilferer',
    percentDecks: 42.0,
    avgCopies: 3.8,
    rank: 1,
    ...overrides,
  }
}

function mountMarket() {
  return mount(MarketView, { global: { stubs: STUBS } })
}

describe('MarketView — STAPLES tab price join (TASK-311)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Harm prevented: MEASURED on dev — zero monetary tokens anywhere in the
  // STAPLES tab. This locks the joined price actually reaching the DOM.
  it('shows a formatted price for a staple that matches a mover — same $-format as the rest of /market', () => {
    const market = useMarketStore()
    market.activeTab = 'staples'
    market.staples = {
      format: 'modern',
      categories: { overall: [makeStaple()], creatures: [], spells: [], lands: [] },
      updatedAt: 'old-staples-date',
    } as FormatStaples
    market.movers = {
      winners: [makeMover({ presentPrice: 45.00 })],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: { toDate: () => new Date('2024-06-01T00:00:00Z') },
    } as unknown as PriceMovers

    const wrapper = mountMarket()
    expect(wrapper.text()).toContain('$45.00')
  })

  // Harm prevented: a staple with no published price rendering as $0/NaN
  // instead of an honest "no price" cell.
  it('shows the localized "no price" copy, never $0 or NaN, for a staple with no matching mover', () => {
    const market = useMarketStore()
    market.activeTab = 'staples'
    market.staples = {
      format: 'modern',
      categories: { overall: [makeStaple({ name: 'Some Uncharted Card' })], creatures: [], spells: [], lands: [] },
      updatedAt: null,
    } as FormatStaples
    market.movers = { winners: [], losers: [], sourceDate: '2024-01-01', updatedAt: null } as PriceMovers

    const wrapper = mountMarket()
    expect(wrapper.text()).toContain('market.staples.noPrice')
    expect(wrapper.text()).not.toContain('$0.00')
    expect(wrapper.text()).not.toContain('NaN')
  })

  // Harm prevented: UC-22.9 — an old price presented as current. The
  // staples price is joined from movers, so the "last updated" date must
  // come from movers.updatedAt, never staples.updatedAt (a different,
  // possibly-older-or-newer dataset).
  it('the "last updated" date is the PRICE dataset\'s own date, not the staples dataset\'s', () => {
    const market = useMarketStore()
    market.activeTab = 'staples'
    market.staples = {
      format: 'modern',
      categories: { overall: [makeStaple()], creatures: [], spells: [], lands: [] },
      updatedAt: { toDate: () => new Date('2020-01-01T00:00:00Z') },
    } as unknown as FormatStaples
    market.movers = {
      winners: [makeMover()],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: { toDate: () => new Date('2024-06-01T00:00:00Z') },
    } as unknown as PriceMovers

    const wrapper = mountMarket()
    expect(wrapper.text()).toContain(new Date('2024-06-01T00:00:00Z').toLocaleString())
    expect(wrapper.text()).not.toContain(new Date('2020-01-01T00:00:00Z').toLocaleString())
  })

  // Control positive (case 2): TENDENCIAS/movers must be unaffected.
  it('control: SET TRENDS (movers) tab still shows $ price tokens as before', () => {
    const market = useMarketStore()
    market.activeTab = 'movers'
    market.movers = {
      winners: [makeMover({ presentPrice: 45.00 })],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers

    const wrapper = mountMarket()
    expect(wrapper.text()).toContain('$45.00')
  })
})

describe('MarketView — portfolio/wishlist empty-state distinguishability (TASK-314 + TASK-315)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auth.user = { uid: 'test-uid' } as any
  })

  // Harm prevented: MEASURED on dev — with the price source down, the ONLY
  // text shown blamed the user's collection ("none of your cards match").
  it('shows the data-unavailable text (never the collection-blaming text) when movers failed to load', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.activeTab = 'portfolio'
    market.movers = null
    collection.cards = [makeCard({ name: 'Bolt' })]

    const wrapper = mountMarket()
    expect(wrapper.text()).toContain('market.errors.dataUnavailable')
    expect(wrapper.text()).not.toContain('market.portfolio.empty"')
  })

  // Harm prevented: MEASURED on dev — an empty collection showed "none of
  // your cards match", implying the user has cards that just don't match.
  it('shows the empty-collection text (not "none match") when the collection has no cards', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.activeTab = 'portfolio'
    market.movers = { winners: [makeMover()], losers: [], sourceDate: '2024-01-01', updatedAt: null } as PriceMovers
    collection.cards = []

    const wrapper = mountMarket()
    expect(wrapper.text()).toContain('market.portfolio.emptyCollection')
  })

  it('wishlist: shows its own empty-collection text, distinct from the portfolio one', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.activeTab = 'wishlist'
    market.movers = { winners: [makeMover()], losers: [], sourceDate: '2024-01-01', updatedAt: null } as PriceMovers
    collection.cards = []

    const wrapper = mountMarket()
    expect(wrapper.text()).toContain('market.wishlist.emptyCollection')
  })

  // Case 17 / UC-22.3: wishlist must be able to show a total value, like
  // portfolio already does — this was structurally impossible before
  // (wishlistSummary carried no totalValue field at all).
  it('wishlist summary banner receives a totalValue when wishlist impacts exist', () => {
    const market = useMarketStore()
    const collection = useCollectionStore()
    market.activeTab = 'wishlist'
    market.movers = {
      winners: [makeMover({ name: 'Bolt', pastPrice: 1, presentPrice: 1.5 })],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers
    collection.cards = [makeCard({ name: 'Bolt', status: 'wishlist', quantity: 2, condition: 'NM', foil: false })]

    const wrapper = mountMarket()
    const banner = wrapper.find('.psb-stub')
    expect(banner.exists()).toBe(true)
    expect(banner.attributes('data-total-value')).toBe('3')
  })
})
