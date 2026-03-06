import {
  getCardRarityCategory,
  getCardTypeCategory,
  getCardManaCategory,
  getCardColorCategory,
  passesColorFilter,
  extractCreatureSubtypes,
} from '@/composables/useCardFilter'
import { makeFilterableCard } from '../helpers/fixtures'

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
