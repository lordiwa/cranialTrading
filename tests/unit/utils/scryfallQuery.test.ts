import {
  buildArrayQuery,
  buildKeywordsQuery,
  buildManaValueQuery,
  buildQuery,
  buildRangeQuery,
  type FilterOptions,
} from '@/utils/scryfallQuery'

// ─── buildManaValueQuery ─────────────────────────────────────────

describe('buildManaValueQuery', () => {
  it('returns null when manaValue is undefined', () => {
    expect(buildManaValueQuery(undefined)).toBeNull()
  })

  it('returns "mv:even" when even flag is set', () => {
    expect(buildManaValueQuery({ even: true })).toBe('mv:even')
  })

  it('returns single mv=N when one value is provided', () => {
    expect(buildManaValueQuery({ values: [3] })).toBe('mv=3')
  })

  it('returns OR group when multiple regular values are provided', () => {
    expect(buildManaValueQuery({ values: [1, 2, 3] })).toBe('(mv=1 OR mv=2 OR mv=3)')
  })

  it('maps value 10 to mv>=10', () => {
    expect(buildManaValueQuery({ values: [10] })).toBe('mv>=10')
  })

  it('mixes regular values and 10+ bucket', () => {
    expect(buildManaValueQuery({ values: [7, 10] })).toBe('(mv=7 OR mv>=10)')
  })

  it('returns null for empty values array', () => {
    expect(buildManaValueQuery({ values: [] })).toBeNull()
  })

  it('builds min/max range when no values array', () => {
    expect(buildManaValueQuery({ min: 2, max: 4 })).toBe('mv>=2 mv<=4')
  })

  it('builds only min', () => {
    expect(buildManaValueQuery({ min: 3 })).toBe('mv>=3')
  })

  it('builds only max', () => {
    expect(buildManaValueQuery({ max: 5 })).toBe('mv<=5')
  })

  it('returns null when min/max both undefined and no values', () => {
    expect(buildManaValueQuery({})).toBeNull()
  })
})

// ─── buildRangeQuery ─────────────────────────────────────────────

describe('buildRangeQuery', () => {
  it('returns empty array when range is undefined', () => {
    expect(buildRangeQuery(undefined, 'pow')).toEqual([])
  })

  it('builds both min and max parts', () => {
    expect(buildRangeQuery({ min: 1, max: 5 }, 'pow')).toEqual(['pow>=1', 'pow<=5'])
  })

  it('returns only min when max is undefined', () => {
    expect(buildRangeQuery({ min: 2 }, 'tou')).toEqual(['tou>=2'])
  })

  it('returns only max when min is undefined', () => {
    expect(buildRangeQuery({ max: 7 }, 'usd')).toEqual(['usd<=7'])
  })

  it('returns empty when both min/max are undefined', () => {
    expect(buildRangeQuery({}, 'pow')).toEqual([])
  })
})

// ─── buildArrayQuery ─────────────────────────────────────────────

describe('buildArrayQuery', () => {
  it('returns empty array when items is undefined', () => {
    expect(buildArrayQuery(undefined, 't:')).toEqual([])
  })

  it('returns empty array when items is empty', () => {
    expect(buildArrayQuery([], 't:')).toEqual([])
  })

  it('prefixes each item', () => {
    expect(buildArrayQuery(['creature', 'land'], 't:')).toEqual(['t:creature', 't:land'])
  })

  it('works for any prefix', () => {
    expect(buildArrayQuery(['mh3', 'bro'], 'e:')).toEqual(['e:mh3', 'e:bro'])
  })
})

// ─── buildKeywordsQuery ──────────────────────────────────────────

describe('buildKeywordsQuery', () => {
  it('returns empty when undefined', () => {
    expect(buildKeywordsQuery(undefined)).toEqual([])
  })

  it('returns empty when empty array', () => {
    expect(buildKeywordsQuery([])).toEqual([])
  })

  it('wraps multi-word keywords in quotes', () => {
    expect(buildKeywordsQuery(['first strike'])).toEqual(['o:"first strike"'])
  })

  it('does not quote single-word keywords', () => {
    expect(buildKeywordsQuery(['flying'])).toEqual(['o:flying'])
  })

  it('mixes quoted and unquoted', () => {
    expect(buildKeywordsQuery(['flying', 'first strike'])).toEqual([
      'o:flying',
      'o:"first strike"',
    ])
  })
})

// ─── buildQuery ──────────────────────────────────────────────────

describe('buildQuery', () => {
  it('returns empty string for empty filters', () => {
    expect(buildQuery({})).toBe('')
  })

  it('wraps name in quotes', () => {
    expect(buildQuery({ name: 'Lightning Bolt' })).toBe('"Lightning Bolt"')
  })

  it('trims the name before quoting', () => {
    expect(buildQuery({ name: '  Bolt  ' })).toBe('"Bolt"')
  })

  it('builds color identity from colors array', () => {
    expect(buildQuery({ colors: ['W', 'U'] })).toBe('id<=WU')
  })

  it('adds types with t: prefix', () => {
    expect(buildQuery({ types: ['creature', 'artifact'] })).toBe('t:creature t:artifact')
  })

  it('includes mana value query', () => {
    expect(buildQuery({ manaValue: { values: [3] } })).toBe('mv=3')
  })

  it('adds rarity, sets, and format legal filters', () => {
    const q = buildQuery({ rarity: ['rare'], sets: ['mh3'], formatLegal: ['modern'] })
    expect(q).toBe('r:rare e:mh3 f:modern')
  })

  it('adds power and toughness ranges', () => {
    const q = buildQuery({ power: { min: 3 }, toughness: { max: 4 } })
    expect(q).toBe('pow>=3 tou<=4')
  })

  it('adds USD price range', () => {
    expect(buildQuery({ priceUSD: { min: 1, max: 10 } })).toBe('usd>=1 usd<=10')
  })

  it('adds creature types separately with t: prefix', () => {
    expect(buildQuery({ creatureTypes: ['Goblin', 'Elf'] })).toBe('t:Goblin t:Elf')
  })

  it('adds isFoil flag', () => {
    expect(buildQuery({ isFoil: true })).toBe('is:foil')
  })

  it('adds isFullArt flag', () => {
    expect(buildQuery({ isFullArt: true })).toBe('is:full')
  })

  it('adds onlyReleased as -is:preview', () => {
    expect(buildQuery({ onlyReleased: true })).toBe('-is:preview')
  })

  it('composes a complex query in the documented order', () => {
    const filters: FilterOptions = {
      name: 'bolt',
      colors: ['R'],
      types: ['instant'],
      manaValue: { values: [1] },
      rarity: ['common'],
      sets: ['mh3'],
      keywords: ['flying'],
      isFoil: true,
      onlyReleased: true,
    }
    expect(buildQuery(filters)).toBe(
      '"bolt" id<=R t:instant mv=1 r:common e:mh3 o:flying is:foil -is:preview'
    )
  })

  // ─── TASK-109: advanced Scryfall syntax pass-through in the name field ───
  // The `name` input is the only free-text field a user can type raw Scryfall
  // syntax into (-negation, "exact", o:text, t:type, key:value comparisons).
  // Regression lock: this syntax must survive buildQuery() verbatim instead of
  // being wrapped in quotes (which would turn `-t:land` into the literal name
  // search `"-t:land"`, silently breaking every advanced query).

  it('passes -negation through unquoted (solo)', () => {
    expect(buildQuery({ name: '-t:land' })).toBe('-t:land')
  })

  it('passes -negation through unquoted (combined with an active filter)', () => {
    expect(buildQuery({ name: '-t:land', colors: ['W', 'U'] })).toBe('-t:land id<=WU')
  })

  it('passes a bare "exact match" quoted name through without re-quoting (solo)', () => {
    expect(buildQuery({ name: '"Lightning Bolt"' })).toBe('"Lightning Bolt"')
  })

  it('passes a bare "exact match" quoted name through without re-quoting (combined)', () => {
    expect(buildQuery({ name: '"Lightning Bolt"', rarity: ['common'] })).toBe(
      '"Lightning Bolt" r:common'
    )
  })

  it('passes o:text (rules text search) through unquoted (solo)', () => {
    expect(buildQuery({ name: 'o:flying' })).toBe('o:flying')
  })

  it('passes o:text through unquoted (combined with an active filter)', () => {
    expect(buildQuery({ name: 'o:flying', types: ['creature'] })).toBe('o:flying t:creature')
  })

  it('passes t:type through unquoted (solo)', () => {
    expect(buildQuery({ name: 't:instant' })).toBe('t:instant')
  })

  it('passes t:type through unquoted (combined with an active filter)', () => {
    expect(buildQuery({ name: 't:instant', colors: ['R'] })).toBe('t:instant id<=R')
  })

  it('trims advanced syntax before pass-through', () => {
    expect(buildQuery({ name: '  o:flying  ' })).toBe('o:flying')
  })

  // Regression: a plain card name (no advanced syntax) must still be quoted —
  // the fix must not turn every free-text search into a raw Scryfall query.
  it('still quotes a plain card name with no advanced syntax (solo)', () => {
    expect(buildQuery({ name: 'Lightning Bolt' })).toBe('"Lightning Bolt"')
  })

  it('still quotes a plain card name when combined with an active filter', () => {
    expect(buildQuery({ name: 'Bolt', colors: ['R'] })).toBe('"Bolt" id<=R')
  })
})
