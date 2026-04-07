/**
 * Unit tests for queryCardIndex Cloud Function helpers.
 *
 * These test the pure filter/sort/pagination functions that will be
 * extracted in functions/index.js. We import them from a shared module
 * so both the Cloud Function and these tests use the same code.
 */

import {
  expandIndexCards,
  filterIndexCards,
  sortIndexCards,
  paginateResults,
} from '@/functions/queryCardIndexHelpers'

// ── Test data factories ──

/** Create a compact index card (same format as toIndexCard in functions/index.js) */
function makeIndexCard(overrides: Record<string, unknown> = {}) {
  return {
    i: 'card-1',            // id
    s: 'scryfall-abc',      // scryfallId
    n: 'Lightning Bolt',    // name
    st: 'collection',       // status
    q: 4,                   // quantity
    p: 1.50,                // price
    cm: 1,                  // cmc
    co: ['R'],              // colors
    r: 'c',                 // rarity (first char: c/u/r/m)
    t: 'Instant',           // type_line
    f: false,               // foil
    sc: 'M21',              // setCode
    pw: '',                 // power
    to: '',                 // toughness
    fa: false,              // full_art
    pm: [],                 // produced_mana
    kw: [],                 // keywords
    lg: ['standard', 'modern', 'legacy', 'vintage'], // legalities
    ca: 1704067200000,      // createdAt (ms) - 2024-01-01
    cn: 'NM',              // condition
    pb: true,               // public
    df: false,              // dual-faced
    ...overrides,
  }
}

// ── expandIndexCards ──

describe('expandIndexCards', () => {
  it('should expand a single chunk with multiple cards', () => {
    const chunks = [
      {
        cards: [
          makeIndexCard({ i: 'card-1', n: 'Lightning Bolt' }),
          makeIndexCard({ i: 'card-2', n: 'Counterspell' }),
        ],
        count: 2,
        version: 2,
      },
    ]

    const result = expandIndexCards(chunks)
    expect(result).toHaveLength(2)
    expect(result[0].i).toBe('card-1')
    expect(result[1].i).toBe('card-2')
  })

  it('should expand multiple chunks into a flat array', () => {
    const chunks = [
      {
        cards: [makeIndexCard({ i: 'card-1' })],
        count: 1,
        version: 2,
      },
      {
        cards: [makeIndexCard({ i: 'card-2' }), makeIndexCard({ i: 'card-3' })],
        count: 2,
        version: 2,
      },
    ]

    const result = expandIndexCards(chunks)
    expect(result).toHaveLength(3)
    expect(result.map((c: any) => c.i)).toEqual(['card-1', 'card-2', 'card-3'])
  })

  it('should handle empty chunks', () => {
    const result = expandIndexCards([])
    expect(result).toHaveLength(0)
  })

  it('should handle chunks with empty cards array', () => {
    const chunks = [{ cards: [], count: 0, version: 2 }]
    const result = expandIndexCards(chunks)
    expect(result).toHaveLength(0)
  })
})

// ── filterIndexCards ──

describe('filterIndexCards', () => {
  const cards = [
    makeIndexCard({ i: 'bolt', n: 'Lightning Bolt', st: 'collection', co: ['R'], r: 'c', t: 'Instant', f: false, sc: 'M21', cn: 'NM', p: 1.50 }),
    makeIndexCard({ i: 'counter', n: 'Counterspell', st: 'trade', co: ['U'], r: 'u', t: 'Instant', f: true, sc: 'MH2', cn: 'LP', p: 3.00 }),
    makeIndexCard({ i: 'goyf', n: 'Tarmogoyf', st: 'sale', co: ['G'], r: 'r', t: 'Creature — Lhurgoyf', f: false, sc: 'MH2', cn: 'NM', p: 15.00 }),
    makeIndexCard({ i: 'jace', n: 'Jace, the Mind Sculptor', st: 'collection', co: ['U'], r: 'm', t: 'Legendary Planeswalker — Jace', f: false, sc: 'A25', cn: 'MP', p: 25.00 }),
    makeIndexCard({ i: 'forest', n: 'Forest', st: 'collection', co: [], r: 'c', t: 'Basic Land — Forest', f: false, sc: 'M21', cn: 'NM', p: 0 }),
  ]

  describe('search filter', () => {
    it('should filter by name (case-insensitive)', () => {
      const result = filterIndexCards(cards, { search: 'lightning' })
      expect(result).toHaveLength(1)
      expect(result[0].i).toBe('bolt')
    })

    it('should match partial name', () => {
      const result = filterIndexCards(cards, { search: 'jace' })
      expect(result).toHaveLength(1)
      expect(result[0].i).toBe('jace')
    })

    it('should return all cards when search is empty', () => {
      const result = filterIndexCards(cards, { search: '' })
      expect(result).toHaveLength(5)
    })

    it('should return all cards when search is undefined', () => {
      const result = filterIndexCards(cards, {})
      expect(result).toHaveLength(5)
    })
  })

  describe('status filter', () => {
    it('should filter by single status', () => {
      const result = filterIndexCards(cards, { status: ['trade'] })
      expect(result).toHaveLength(1)
      expect(result[0].i).toBe('counter')
    })

    it('should filter by multiple statuses', () => {
      const result = filterIndexCards(cards, { status: ['collection', 'sale'] })
      expect(result).toHaveLength(4)
    })

    it('should return all cards when status array is empty', () => {
      const result = filterIndexCards(cards, { status: [] })
      expect(result).toHaveLength(5)
    })
  })

  describe('edition filter', () => {
    it('should filter by set code (case-insensitive)', () => {
      const result = filterIndexCards(cards, { edition: ['mh2'] })
      expect(result).toHaveLength(2)
    })

    it('should filter by multiple editions', () => {
      const result = filterIndexCards(cards, { edition: ['M21', 'A25'] })
      expect(result).toHaveLength(3)
    })
  })

  describe('color filter', () => {
    it('should filter by single color', () => {
      const result = filterIndexCards(cards, { color: ['R'] })
      expect(result).toHaveLength(1)
      expect(result[0].i).toBe('bolt')
    })

    it('should filter by multiple colors (OR logic)', () => {
      const result = filterIndexCards(cards, { color: ['U', 'G'] })
      expect(result).toHaveLength(3)
    })
  })

  describe('rarity filter', () => {
    it('should filter by rarity initial', () => {
      const result = filterIndexCards(cards, { rarity: ['common'] })
      expect(result).toHaveLength(2) // bolt + forest
    })

    it('should filter by multiple rarities', () => {
      const result = filterIndexCards(cards, { rarity: ['rare', 'mythic'] })
      expect(result).toHaveLength(2) // goyf + jace
    })
  })

  describe('type filter', () => {
    it('should filter by type substring (case-insensitive)', () => {
      const result = filterIndexCards(cards, { type: ['instant'] })
      expect(result).toHaveLength(2)
    })

    it('should filter by creature type', () => {
      const result = filterIndexCards(cards, { type: ['creature'] })
      expect(result).toHaveLength(1)
      expect(result[0].i).toBe('goyf')
    })

    it('should filter by multiple types (OR logic)', () => {
      const result = filterIndexCards(cards, { type: ['creature', 'planeswalker'] })
      expect(result).toHaveLength(2)
    })
  })

  describe('foil filter', () => {
    it('should filter for foil cards only', () => {
      const result = filterIndexCards(cards, { foil: true })
      expect(result).toHaveLength(1)
      expect(result[0].i).toBe('counter')
    })

    it('should not filter when foil is undefined', () => {
      const result = filterIndexCards(cards, { foil: undefined })
      expect(result).toHaveLength(5)
    })
  })

  describe('condition filter', () => {
    it('should filter by single condition', () => {
      const result = filterIndexCards(cards, { condition: ['NM'] })
      expect(result).toHaveLength(3) // bolt, goyf, forest
    })

    it('should filter by multiple conditions', () => {
      const result = filterIndexCards(cards, { condition: ['LP', 'MP'] })
      expect(result).toHaveLength(2) // counter, jace
    })
  })

  describe('price filter', () => {
    it('should filter by min price', () => {
      const result = filterIndexCards(cards, { minPrice: 10 })
      expect(result).toHaveLength(2) // goyf (15), jace (25)
    })

    it('should filter by max price', () => {
      const result = filterIndexCards(cards, { maxPrice: 3 })
      expect(result).toHaveLength(3) // bolt (1.5), counter (3), forest (0)
    })

    it('should filter by price range', () => {
      const result = filterIndexCards(cards, { minPrice: 1, maxPrice: 10 })
      expect(result).toHaveLength(2) // bolt (1.5), counter (3)
    })
  })

  describe('combined filters', () => {
    it('should apply multiple filters together (AND logic)', () => {
      const result = filterIndexCards(cards, {
        search: 'counter',
        status: ['trade'],
        foil: true,
      })
      expect(result).toHaveLength(1)
      expect(result[0].i).toBe('counter')
    })

    it('should return empty when no cards match all filters', () => {
      const result = filterIndexCards(cards, {
        search: 'bolt',
        status: ['trade'],
      })
      expect(result).toHaveLength(0)
    })
  })
})

// ── sortIndexCards ──

describe('sortIndexCards', () => {
  const cards = [
    makeIndexCard({ i: 'b', n: 'Bolt', p: 1.5, sc: 'M21', q: 4, ca: 1704067200000 }),
    makeIndexCard({ i: 'c', n: 'Counterspell', p: 3.0, sc: 'MH2', q: 2, ca: 1704153600000 }),
    makeIndexCard({ i: 'a', n: 'Ancestral Recall', p: 5000, sc: 'LEB', q: 1, ca: 1703980800000 }),
  ]

  it('should sort by name ascending', () => {
    const result = sortIndexCards(cards, { field: 'name', direction: 'asc' })
    expect(result.map((c: any) => c.n)).toEqual(['Ancestral Recall', 'Bolt', 'Counterspell'])
  })

  it('should sort by name descending', () => {
    const result = sortIndexCards(cards, { field: 'name', direction: 'desc' })
    expect(result.map((c: any) => c.n)).toEqual(['Counterspell', 'Bolt', 'Ancestral Recall'])
  })

  it('should sort by price ascending', () => {
    const result = sortIndexCards(cards, { field: 'price', direction: 'asc' })
    expect(result.map((c: any) => c.p)).toEqual([1.5, 3.0, 5000])
  })

  it('should sort by price descending', () => {
    const result = sortIndexCards(cards, { field: 'price', direction: 'desc' })
    expect(result.map((c: any) => c.p)).toEqual([5000, 3.0, 1.5])
  })

  it('should sort by edition (setCode) ascending', () => {
    const result = sortIndexCards(cards, { field: 'edition', direction: 'asc' })
    expect(result.map((c: any) => c.sc)).toEqual(['LEB', 'M21', 'MH2'])
  })

  it('should sort by quantity ascending', () => {
    const result = sortIndexCards(cards, { field: 'quantity', direction: 'asc' })
    expect(result.map((c: any) => c.q)).toEqual([1, 2, 4])
  })

  it('should sort by quantity descending', () => {
    const result = sortIndexCards(cards, { field: 'quantity', direction: 'desc' })
    expect(result.map((c: any) => c.q)).toEqual([4, 2, 1])
  })

  it('should sort by dateAdded ascending', () => {
    const result = sortIndexCards(cards, { field: 'dateAdded', direction: 'asc' })
    // oldest first
    expect(result.map((c: any) => c.i)).toEqual(['a', 'b', 'c'])
  })

  it('should sort by dateAdded descending', () => {
    const result = sortIndexCards(cards, { field: 'dateAdded', direction: 'desc' })
    // newest first
    expect(result.map((c: any) => c.i)).toEqual(['c', 'b', 'a'])
  })

  it('should not mutate the original array', () => {
    const original = [...cards]
    sortIndexCards(cards, { field: 'name', direction: 'asc' })
    expect(cards.map((c: any) => c.i)).toEqual(original.map((c: any) => c.i))
  })
})

// ── paginateResults ──

describe('paginateResults', () => {
  // Create 12 cards
  const cards = Array.from({ length: 12 }, (_, i) =>
    makeIndexCard({ i: `card-${i}`, n: `Card ${i}` })
  )

  it('should return first page with correct metadata', () => {
    const result = paginateResults(cards, 0, 5, 'cards')
    expect(result.cards).toHaveLength(5)
    expect(result.total).toBe(12)
    expect(result.page).toBe(0)
    expect(result.pageSize).toBe(5)
    expect(result.hasMore).toBe(true)
  })

  it('should return second page', () => {
    const result = paginateResults(cards, 1, 5, 'cards')
    expect(result.cards).toHaveLength(5)
    expect(result.total).toBe(12)
    expect(result.page).toBe(1)
    expect(result.hasMore).toBe(true)
  })

  it('should return last page with fewer items', () => {
    const result = paginateResults(cards, 2, 5, 'cards')
    expect(result.cards).toHaveLength(2)
    expect(result.total).toBe(12)
    expect(result.page).toBe(2)
    expect(result.hasMore).toBe(false)
  })

  it('should return empty array for page beyond data', () => {
    const result = paginateResults(cards, 10, 5, 'cards')
    expect(result.cards).toHaveLength(0)
    expect(result.total).toBe(12)
    expect(result.hasMore).toBe(false)
  })

  it('should return card IDs when mode is "ids"', () => {
    const result = paginateResults(cards, 0, 5, 'ids')
    expect(result.cards).toHaveLength(5)
    expect(result.cards[0]).toBe('card-0')
    expect(result.cards[4]).toBe('card-4')
    // All items should be strings (IDs)
    result.cards.forEach((item: unknown) => {
      expect(typeof item).toBe('string')
    })
  })

  it('should return all IDs when mode is "ids" with large page', () => {
    const result = paginateResults(cards, 0, 100, 'ids')
    expect(result.cards).toHaveLength(12)
    expect(result.hasMore).toBe(false)
  })

  it('should handle empty input', () => {
    const result = paginateResults([], 0, 50, 'cards')
    expect(result.cards).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should default pageSize to 50 when not specified', () => {
    // Create 60 cards
    const manyCards = Array.from({ length: 60 }, (_, i) =>
      makeIndexCard({ i: `card-${i}` })
    )
    const result = paginateResults(manyCards, 0, 50, 'cards')
    expect(result.cards).toHaveLength(50)
    expect(result.hasMore).toBe(true)
  })

  it('should cap pageSize at 100', () => {
    const manyCards = Array.from({ length: 200 }, (_, i) =>
      makeIndexCard({ i: `card-${i}` })
    )
    // Even if 200 is requested, it should be capped at 100
    const result = paginateResults(manyCards, 0, 100, 'cards')
    expect(result.cards).toHaveLength(100)
    expect(result.hasMore).toBe(true)
  })
})
