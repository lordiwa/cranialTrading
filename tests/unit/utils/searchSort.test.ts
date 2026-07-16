import { buildSortParams, DEFAULT_SORT_PARAMS, shouldApplyPricedFirst } from '@/utils/searchSort'

describe('buildSortParams', () => {
  it('returns released desc (current behavior) when sort is undefined', () => {
    expect(buildSortParams(undefined)).toEqual({ order: 'released', dir: 'desc' })
    expect(buildSortParams(undefined)).toEqual(DEFAULT_SORT_PARAMS)
  })

  it('maps "popular" to order=edhrec with no explicit dir', () => {
    expect(buildSortParams('popular')).toEqual({ order: 'edhrec' })
  })

  it('maps "name" to order=name with no explicit dir', () => {
    expect(buildSortParams('name')).toEqual({ order: 'name' })
  })

  it('maps "price-asc" to order=usd dir=asc', () => {
    expect(buildSortParams('price-asc')).toEqual({ order: 'usd', dir: 'asc' })
  })

  it('maps "price-desc" to order=usd dir=desc', () => {
    expect(buildSortParams('price-desc')).toEqual({ order: 'usd', dir: 'desc' })
  })
})

describe('shouldApplyPricedFirst', () => {
  it('is true for the default (no sort selected) — byte-identical to pre-TASK-108 behavior', () => {
    expect(shouldApplyPricedFirst(undefined)).toBe(true)
  })

  it('is false for every explicit sort choice — Scryfall order is respected as-is', () => {
    expect(shouldApplyPricedFirst('popular')).toBe(false)
    expect(shouldApplyPricedFirst('name')).toBe(false)
    expect(shouldApplyPricedFirst('price-asc')).toBe(false)
    expect(shouldApplyPricedFirst('price-desc')).toBe(false)
  })
})
