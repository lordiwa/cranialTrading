import { setActivePinia, createPinia } from 'pinia'
import { useMarketStore } from '@/stores/market'
import type { PriceMovers, PriceMover } from '@/services/market'

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
    name: 'Web',
    setName: 'Unlimited Edition',
    rarity: 'rare',
    image: 'https://example.com/web.jpg',
    pastPrice: 14.92,
    presentPrice: 32.33,
    percentChange: 116.7,
    foil: false,
    ...overrides,
  }
}

// TASK-312: MEASURED on dev — SUBIDAS page 1 of 18 (Mostrando 1-15 of 263):
// 15 rows, 14 unique keys. The exact duplicate: ranks 8 and 9, both
// "Web | Unlimited Edition | $14.92 | $32.33 | +116.7%", identical except
// for the rank number (which is only the row's screen position, never a
// field on the stored object).
describe('market store — movers dedupe (TASK-312)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('collapses an exact duplicate entry in winners — prevents the same printing rendering as two rows', () => {
    const market = useMarketStore()
    market.movers = {
      winners: [makeMover(), makeMover(), makeMover({ name: 'Other Card' })],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers
    market.moversDirection = 'winners'

    expect(market.currentMovers).toHaveLength(2)
    expect(market.sortedMovers).toHaveLength(2)
  })

  it('collapses an exact duplicate entry in losers too — same defect, opposite direction', () => {
    const market = useMarketStore()
    market.movers = {
      winners: [],
      losers: [makeMover({ percentChange: -50 }), makeMover({ percentChange: -50 })],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers
    market.moversDirection = 'losers'

    expect(market.currentMovers).toHaveLength(1)
  })

  it('keeps two DIFFERENT real printings that share name+edition but differ in price — never over-collapses', () => {
    const market = useMarketStore()
    market.movers = {
      winners: [
        makeMover({ presentPrice: 32.33 }),
        makeMover({ presentPrice: 40.00, percentChange: 168.1 }),
      ],
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers
    market.moversDirection = 'winners'

    expect(market.currentMovers).toHaveLength(2)
  })

  it('totalMoversPages and the "showing" total count deduped rows, not raw printings — prevents the UI claiming more rows exist than are ever reachable', () => {
    const market = useMarketStore()
    const winners = Array.from({ length: 20 }, () => makeMover())
    market.movers = {
      winners,
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers
    market.moversDirection = 'winners'

    // 20 raw entries, all identical → 1 deduped row, 1 page
    expect(market.sortedMovers).toHaveLength(1)
    expect(market.totalMoversPages).toBe(1)
  })

  it('paginating from page 1 to the last page repeats nothing and loses nothing', () => {
    const market = useMarketStore()
    // 40 distinct movers (distinct by presentPrice, so no dedupe collapses them)
    const winners = Array.from({ length: 40 }, (_, i) => makeMover({ name: `Card ${i}`, presentPrice: 1 + i }))
    market.movers = {
      winners,
      losers: [],
      sourceDate: '2024-01-01',
      updatedAt: null,
    } as PriceMovers
    market.moversDirection = 'winners'

    const seenKeys = new Set<string>()
    let totalSeen = 0
    for (let page = 1; page <= market.totalMoversPages; page++) {
      market.moversPage = page
      for (const m of market.paginatedMovers) {
        const key = `${m.name}|${m.presentPrice}`
        expect(seenKeys.has(key)).toBe(false) // never repeated across pages
        seenKeys.add(key)
        totalSeen++
      }
    }
    expect(totalSeen).toBe(40) // nothing lost either
  })
})
