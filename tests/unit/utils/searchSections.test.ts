/**
 * Unit tests for filterCollectionByTerm (TASK-075) and sortPricedFirst.
 *
 * filterCollectionByTerm: pure helper that powers the "In your collection"
 * section of /search — case-insensitive substring match over the user's own
 * cards, capped at max.
 *
 * sortPricedFirst: stable partition of Scryfall catalog results — printings
 * with a price (usd, or usd_foil for foil-only printings) come first, the
 * unpriced tail after, preserving relative order within each group.
 */

import { filterCollectionByTerm, sortPricedFirst } from '@/utils/searchSections'
import type { ScryfallCard } from '@/services/scryfall'
import { makeCard } from '../helpers/fixtures'

describe('filterCollectionByTerm', () => {
  it('matches by case-insensitive substring on card name', () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Lightning Bolt' }),
      makeCard({ id: 'c2', name: 'Counterspell' }),
      makeCard({ id: 'c3', name: 'Chain Lightning' }),
    ]

    const result = filterCollectionByTerm(cards, 'LIGHTNING')

    expect(result.map(c => c.id)).toEqual(['c1', 'c3'])
  })

  it('trims the term before matching', () => {
    const cards = [makeCard({ id: 'c1', name: 'Lightning Bolt' })]

    const result = filterCollectionByTerm(cards, '  bolt  ')

    expect(result).toHaveLength(1)
  })

  it('returns [] when the term is shorter than 2 chars', () => {
    const cards = [makeCard({ id: 'c1', name: 'Lightning Bolt' })]

    expect(filterCollectionByTerm(cards, 'l')).toEqual([])
    expect(filterCollectionByTerm(cards, ' ')).toEqual([])
    expect(filterCollectionByTerm(cards, '')).toEqual([])
  })

  it('caps results at 12 by default', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      makeCard({ id: `c${i}`, name: `Lightning Bolt ${i}` })
    )

    const result = filterCollectionByTerm(cards, 'lightning')

    expect(result).toHaveLength(12)
  })

  it('respects a custom max', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      makeCard({ id: `c${i}`, name: `Lightning Bolt ${i}` })
    )

    const result = filterCollectionByTerm(cards, 'lightning', 5)

    expect(result).toHaveLength(5)
  })

  it('returns [] when no card matches', () => {
    const cards = [makeCard({ id: 'c1', name: 'Counterspell' })]

    expect(filterCollectionByTerm(cards, 'bolt')).toEqual([])
  })
})

describe('sortPricedFirst', () => {
  // The Scryfall API returns null prices even though the local type says string|undefined
  const makeScryfall = (
    id: string,
    prices?: { usd?: string | null; usd_foil?: string | null }
  ): ScryfallCard =>
    ({ id, name: `Card ${id}`, prices } as unknown as ScryfallCard)

  it('puts priced printings before unpriced ones', () => {
    const cards = [
      makeScryfall('a'),
      makeScryfall('b', { usd: '1.50' }),
      makeScryfall('c', { usd: null }),
      makeScryfall('d', { usd: '0.25' }),
    ]

    expect(sortPricedFirst(cards).map(c => c.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('is stable: preserves relative order within each group', () => {
    const cards = [
      makeScryfall('p1', { usd: '9.99' }),
      makeScryfall('u1'),
      makeScryfall('p2', { usd: '0.10' }),
      makeScryfall('u2', { usd: '0' }),
      makeScryfall('p3', { usd: '3.00' }),
    ]

    expect(sortPricedFirst(cards).map(c => c.id)).toEqual(['p1', 'p2', 'p3', 'u1', 'u2'])
  })

  it('treats usd_foil as a price for foil-only printings', () => {
    const cards = [
      makeScryfall('unpriced'),
      makeScryfall('foil-only', { usd: null, usd_foil: '12.00' }),
    ]

    expect(sortPricedFirst(cards).map(c => c.id)).toEqual(['foil-only', 'unpriced'])
  })

  it('treats "0" and non-numeric prices as unpriced', () => {
    const cards = [
      makeScryfall('zero', { usd: '0' }),
      makeScryfall('garbage', { usd: 'N/A' }),
      makeScryfall('priced', { usd: '0.01' }),
    ]

    expect(sortPricedFirst(cards).map(c => c.id)).toEqual(['priced', 'zero', 'garbage'])
  })

  it('does not mutate the input array', () => {
    const cards = [makeScryfall('a'), makeScryfall('b', { usd: '1' })]
    const input = [...cards]

    sortPricedFirst(cards)

    expect(cards).toEqual(input)
  })

  it('handles empty input', () => {
    expect(sortPricedFirst([])).toEqual([])
  })
})
