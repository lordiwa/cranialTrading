import { ref, nextTick, effectScope } from 'vue'
import {
  getCardRarityCategory,
  getCardTypeCategory,
  getCardTypeCategories,
  passesTypeFilter,
  getCardManaCategory,
  getCardColorCategory,
  passesColorFilter,
  extractCreatureSubtypes,
  useCardFilter,
} from '@/composables/useCardFilter'
import { makeFilterableCard } from '../helpers/fixtures'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('getCardRarityCategory', () => {
  it('returns Common for common rarity', () => {
    expect(getCardRarityCategory(makeFilterableCard({ rarity: 'common' }))).toBe('Common')
  })

  it('returns Uncommon for uncommon rarity', () => {
    expect(getCardRarityCategory(makeFilterableCard({ rarity: 'uncommon' }))).toBe('Uncommon')
  })

  it('returns Rare for rare rarity', () => {
    expect(getCardRarityCategory(makeFilterableCard({ rarity: 'rare' }))).toBe('Rare')
  })

  it('returns Mythic for mythic rarity', () => {
    expect(getCardRarityCategory(makeFilterableCard({ rarity: 'mythic' }))).toBe('Mythic')
  })

  it('returns Unknown when rarity is undefined', () => {
    expect(getCardRarityCategory(makeFilterableCard({ rarity: undefined }))).toBe('Unknown')
  })
})

describe('getCardTypeCategory', () => {
  it('returns Creatures for creature type line', () => {
    expect(getCardTypeCategory(makeFilterableCard({ type_line: 'Creature — Human Wizard' }))).toBe('Creatures')
  })

  it('returns Instants for instant type line', () => {
    expect(getCardTypeCategory(makeFilterableCard({ type_line: 'Instant' }))).toBe('Instants')
  })

  it('returns Sorceries for sorcery type line', () => {
    expect(getCardTypeCategory(makeFilterableCard({ type_line: 'Sorcery' }))).toBe('Sorceries')
  })

  it('returns Enchantments for enchantment type line', () => {
    expect(getCardTypeCategory(makeFilterableCard({ type_line: 'Enchantment' }))).toBe('Enchantments')
  })

  it('returns Artifacts for artifact type line', () => {
    expect(getCardTypeCategory(makeFilterableCard({ type_line: 'Artifact' }))).toBe('Artifacts')
  })

  it('returns Planeswalkers for planeswalker type line', () => {
    expect(getCardTypeCategory(makeFilterableCard({ type_line: 'Legendary Planeswalker — Jace' }))).toBe('Planeswalkers')
  })

  it('returns Lands for land type line', () => {
    expect(getCardTypeCategory(makeFilterableCard({ type_line: 'Land' }))).toBe('Lands')
  })

  it('returns Other for unrecognized type line', () => {
    expect(getCardTypeCategory(makeFilterableCard({ type_line: 'Tribal' }))).toBe('Other')
  })
})

// TASK-288: getCardTypeCategory returns a single PRIMARY category (cascade,
// first match wins) — still correct for grouping, but wrong for filtering,
// which needs getCardTypeCategories / passesTypeFilter below.
describe('getCardTypeCategories', () => {
  it('returns only Artifacts for a plain artifact (single category, unaffected)', () => {
    expect(getCardTypeCategories(makeFilterableCard({ type_line: 'Artifact' }))).toEqual(['Artifacts'])
  })

  // Real fixtures measured in production (TASK-288 description) — an
  // Artifact Land is BOTH categories, not just whichever the cascade hits first.
  it('returns both Artifacts and Lands for "Artifact Land"', () => {
    expect(getCardTypeCategories(makeFilterableCard({ type_line: 'Artifact Land' }))).toEqual(['Artifacts', 'Lands'])
  })

  it('returns both Instants and Lands for "Instant // Land"', () => {
    expect(getCardTypeCategories(makeFilterableCard({ type_line: 'Instant // Land' }))).toEqual(['Instants', 'Lands'])
  })

  it('returns both Creatures and Lands for "Creature — Eldrazi // Land"', () => {
    expect(getCardTypeCategories(makeFilterableCard({ type_line: 'Creature — Eldrazi // Land' }))).toEqual(['Creatures', 'Lands'])
  })

  it('returns both Enchantments and Lands for "Enchantment Land — Urza\'s Saga"', () => {
    expect(getCardTypeCategories(makeFilterableCard({ type_line: "Enchantment Land — Urza's Saga" }))).toEqual(['Enchantments', 'Lands'])
  })

  it('returns both Creatures and Lands for "Land Creature — Forest Dryad"', () => {
    expect(getCardTypeCategories(makeFilterableCard({ type_line: 'Land Creature — Forest Dryad' }))).toEqual(['Creatures', 'Lands'])
  })

  it('returns Sorceries and Lands for "Land — Town // Sorcery — Adventure"', () => {
    expect(getCardTypeCategories(makeFilterableCard({ type_line: 'Land — Town // Sorcery — Adventure' }))).toEqual(['Sorceries', 'Lands'])
  })

  it('returns Other for an unrecognized type line', () => {
    expect(getCardTypeCategories(makeFilterableCard({ type_line: 'Tribal' }))).toEqual(['Other'])
  })
})

describe('passesTypeFilter', () => {
  // AC2: the 49 cards from production must appear when the Lands filter is applied.
  const landsFilter = new Set(['Lands'])

  it.each([
    'Artifact Land',
    'Instant // Land',
    'Creature — Eldrazi // Land',
    "Enchantment Land — Urza's Saga",
    'Land Creature — Forest Dryad',
    'Land — Town // Sorcery — Adventure',
  ])('"%s" passes the Lands filter', (typeLine) => {
    expect(passesTypeFilter(makeFilterableCard({ type_line: typeLine }), landsFilter)).toBe(true)
  })

  // AC3: the mirror case — these same cards must NOT disappear from their
  // other type's filter. This is the check that rules out reordering the
  // cascade (which would only move the bug, not fix it).
  it('"Artifact Land" still passes the Artifacts filter', () => {
    expect(passesTypeFilter(makeFilterableCard({ type_line: 'Artifact Land' }), new Set(['Artifacts']))).toBe(true)
  })

  it('"Creature — Eldrazi // Land" still passes the Creatures filter', () => {
    expect(passesTypeFilter(makeFilterableCard({ type_line: 'Creature — Eldrazi // Land' }), new Set(['Creatures']))).toBe(true)
  })

  it('"Instant // Land" still passes the Instants filter', () => {
    expect(passesTypeFilter(makeFilterableCard({ type_line: 'Instant // Land' }), new Set(['Instants']))).toBe(true)
  })

  it('"Land — Town // Sorcery — Adventure" still passes the Sorceries filter', () => {
    expect(passesTypeFilter(makeFilterableCard({ type_line: 'Land — Town // Sorcery — Adventure' }), new Set(['Sorceries']))).toBe(true)
  })

  it('a plain Instant does NOT pass the Lands filter', () => {
    expect(passesTypeFilter(makeFilterableCard({ type_line: 'Instant' }), landsFilter)).toBe(false)
  })
})

describe('getCardManaCategory', () => {
  it('returns "0" for zero cmc non-land', () => {
    expect(getCardManaCategory(makeFilterableCard({ cmc: 0, type_line: 'Artifact' }))).toBe('0')
  })

  it('returns stringified cmc for values below 10', () => {
    expect(getCardManaCategory(makeFilterableCard({ cmc: 5, type_line: 'Creature' }))).toBe('5')
  })

  it('returns "10+" for cmc of exactly 10', () => {
    expect(getCardManaCategory(makeFilterableCard({ cmc: 10, type_line: 'Creature' }))).toBe('10+')
  })

  it('returns "10+" for cmc above 10', () => {
    expect(getCardManaCategory(makeFilterableCard({ cmc: 15, type_line: 'Sorcery' }))).toBe('10+')
  })

  it('returns Lands for land type regardless of cmc', () => {
    expect(getCardManaCategory(makeFilterableCard({ cmc: 0, type_line: 'Land' }))).toBe('Lands')
    expect(getCardManaCategory(makeFilterableCard({ cmc: 5, type_line: 'Land' }))).toBe('Lands')
  })
})

describe('getCardColorCategory', () => {
  it('returns White for single white card', () => {
    expect(getCardColorCategory(makeFilterableCard({ colors: ['W'] }))).toBe('White')
  })

  it('returns Blue for single blue card', () => {
    expect(getCardColorCategory(makeFilterableCard({ colors: ['U'] }))).toBe('Blue')
  })

  it('returns Black for single black card', () => {
    expect(getCardColorCategory(makeFilterableCard({ colors: ['B'] }))).toBe('Black')
  })

  it('returns Red for single red card', () => {
    expect(getCardColorCategory(makeFilterableCard({ colors: ['R'] }))).toBe('Red')
  })

  it('returns Green for single green card', () => {
    expect(getCardColorCategory(makeFilterableCard({ colors: ['G'] }))).toBe('Green')
  })

  it('returns Multicolor for multi-colored card', () => {
    expect(getCardColorCategory(makeFilterableCard({ colors: ['W', 'U'] }))).toBe('Multicolor')
  })

  it('returns Colorless for card with empty colors', () => {
    expect(getCardColorCategory(makeFilterableCard({ colors: [], type_line: 'Artifact' }))).toBe('Colorless')
  })

  it('returns Multicolor for land with multiple produced_mana colors', () => {
    expect(getCardColorCategory(makeFilterableCard({
      type_line: 'Land',
      colors: [],
      produced_mana: ['G', 'U'],
    }))).toBe('Multicolor')
  })

  it('returns Lands for land with no produced_mana', () => {
    expect(getCardColorCategory(makeFilterableCard({
      type_line: 'Land',
      colors: [],
      produced_mana: [],
    }))).toBe('Lands')
  })
})

describe('passesColorFilter', () => {
  it('passes when card color matches selected set', () => {
    const card = makeFilterableCard({ colors: ['R'], type_line: 'Creature' })
    expect(passesColorFilter(card, new Set(['Red']))).toBe(true)
  })

  it('fails when card color is not in selected set', () => {
    const card = makeFilterableCard({ colors: ['R'], type_line: 'Creature' })
    expect(passesColorFilter(card, new Set(['Blue']))).toBe(false)
  })

  it('passes multicolor card when Multicolor is selected', () => {
    const card = makeFilterableCard({ colors: ['W', 'U'], type_line: 'Creature' })
    expect(passesColorFilter(card, new Set(['Multicolor']))).toBe(true)
  })

  it('passes land with produced_mana in ANY mode when one color matches', () => {
    const card = makeFilterableCard({
      type_line: 'Land',
      colors: [],
      produced_mana: ['G'],
    })
    expect(passesColorFilter(card, new Set(['Green']))).toBe(true)
  })

  it('passes land with multiple produced_mana in ANY mode when one color matches', () => {
    const card = makeFilterableCard({
      type_line: 'Land',
      colors: [],
      produced_mana: ['G', 'U'],
    })
    expect(passesColorFilter(card, new Set(['Green']), false)).toBe(true)
  })

  it('fails land with multiple produced_mana in EXACT mode when not all colors selected', () => {
    const card = makeFilterableCard({
      type_line: 'Land',
      colors: [],
      produced_mana: ['G', 'U'],
    })
    expect(passesColorFilter(card, new Set(['Green']), true)).toBe(false)
  })

  it('passes colorless card when Colorless is selected', () => {
    const card = makeFilterableCard({ colors: [], type_line: 'Artifact' })
    expect(passesColorFilter(card, new Set(['Colorless']))).toBe(true)
  })
})

describe('extractCreatureSubtypes', () => {
  it('extracts multiple subtypes from legendary creature', () => {
    expect(extractCreatureSubtypes('Legendary Creature — Human Wizard')).toEqual(['human', 'wizard'])
  })

  it('extracts single subtype', () => {
    expect(extractCreatureSubtypes('Creature — Elf')).toEqual(['elf'])
  })

  it('returns empty array when no dash is present', () => {
    expect(extractCreatureSubtypes('Instant')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractCreatureSubtypes('')).toEqual([])
  })
})

describe('filterQuery debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const makeCards = () => ref([
    makeFilterableCard({ name: 'Lightning Bolt', edition: 'M21' }),
    makeFilterableCard({ name: 'Llanowar Elves', edition: 'DOM' }),
    makeFilterableCard({ name: 'Counterspell', edition: 'MH2' }),
  ])

  it('filteredCards does not update immediately when filterQuery changes', async () => {
    const scope = effectScope()
    const result = scope.run(() => useCardFilter(makeCards()))!

    result.filterQuery.value = 'lightning'
    await nextTick()

    expect(result.filteredCards.value).toHaveLength(3)
    scope.stop()
  })

  it('filteredCards updates after 200ms debounce', async () => {
    const scope = effectScope()
    const result = scope.run(() => useCardFilter(makeCards()))!

    result.filterQuery.value = 'lightning'
    await nextTick() // flush the watch
    vi.advanceTimersByTime(200) // fire the setTimeout
    await nextTick() // flush computed re-evaluation

    expect(result.filteredCards.value).toHaveLength(1)
    expect(result.filteredCards.value[0].name).toBe('Lightning Bolt')
    scope.stop()
  })

  it('clearing filterQuery updates filteredCards immediately', async () => {
    const scope = effectScope()
    const result = scope.run(() => useCardFilter(makeCards()))!

    result.filterQuery.value = 'lightning'
    await nextTick()
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(result.filteredCards.value).toHaveLength(1)

    result.filterQuery.value = ''
    await nextTick() // watch fires synchronously for instant-clear path
    await nextTick()

    // Should immediately show all cards without waiting 200ms
    expect(result.filteredCards.value).toHaveLength(3)
    scope.stop()
  })

  it('rapid typing only applies the last value', async () => {
    const scope = effectScope()
    const result = scope.run(() => useCardFilter(makeCards()))!

    result.filterQuery.value = 'l'
    await nextTick()
    vi.advanceTimersByTime(100)
    result.filterQuery.value = 'll'
    await nextTick()
    vi.advanceTimersByTime(100)
    result.filterQuery.value = 'llanowar'
    await nextTick()
    vi.advanceTimersByTime(200)
    await nextTick()

    expect(result.filteredCards.value).toHaveLength(1)
    expect(result.filteredCards.value[0].name).toBe('Llanowar Elves')
    scope.stop()
  })
})

describe("groupedCards with groupBy='name'", () => {
  it('groups cards with the same name into a single group regardless of edition', () => {
    const cards = ref([
      makeFilterableCard({ name: 'Lightning Bolt', edition: 'Limited Edition Alpha', setCode: 'LEA' }),
      makeFilterableCard({ name: 'Lightning Bolt', edition: 'Magic 2011', setCode: 'M11' }),
      makeFilterableCard({ name: 'Counterspell', edition: 'Modern Horizons 2', setCode: 'MH2' }),
    ])

    const scope = effectScope()
    const result = scope.run(() => useCardFilter(cards))!
    result.groupBy.value = 'name'

    const groups = result.groupedCards.value
    expect(groups).toHaveLength(2)

    const bolt = groups.find(g => g.type === 'Lightning Bolt')
    expect(bolt).toBeDefined()
    expect(bolt!.cards).toHaveLength(2)

    const counter = groups.find(g => g.type === 'Counterspell')
    expect(counter).toBeDefined()
    expect(counter!.cards).toHaveLength(1)
    scope.stop()
  })

  it('orders name groups alphabetically', () => {
    const cards = ref([
      makeFilterableCard({ name: 'Lightning Bolt', edition: 'M11' }),
      makeFilterableCard({ name: 'Ancestral Recall', edition: 'LEA' }),
      makeFilterableCard({ name: 'Counterspell', edition: 'MH2' }),
    ])

    const scope = effectScope()
    const result = scope.run(() => useCardFilter(cards))!
    result.groupBy.value = 'name'

    const names = result.groupedCards.value.map(g => g.type)
    expect(names).toEqual(['Ancestral Recall', 'Counterspell', 'Lightning Bolt'])
    scope.stop()
  })

  it('returns a single all-group when groupBy is none', () => {
    const cards = ref([
      makeFilterableCard({ name: 'Lightning Bolt' }),
      makeFilterableCard({ name: 'Lightning Bolt' }),
    ])

    const scope = effectScope()
    const result = scope.run(() => useCardFilter(cards))!
    // Default is 'none'
    expect(result.groupedCards.value).toHaveLength(1)
    expect(result.groupedCards.value[0].type).toBe('all')
    expect(result.groupedCards.value[0].cards).toHaveLength(2)
    scope.stop()
  })
})
