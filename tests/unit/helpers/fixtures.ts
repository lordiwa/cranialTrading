/**
 * Test data factories for unit tests.
 * Each factory returns a valid object with sensible defaults
 * and accepts partial overrides.
 */

import type { Card, CardCondition, CardStatus } from '@/types/card'
import type { Preference, PreferenceType } from '@/types/preferences'
import type { FilterableCard } from '@/composables/useCardFilter'

export function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    scryfallId: 'scryfall-abc',
    name: 'Lightning Bolt',
    edition: 'Magic 2021',
    setCode: 'M21',
    quantity: 4,
    condition: 'NM' as CardCondition,
    foil: false,
    language: 'en',
    price: 1.50,
    image: 'https://example.com/bolt.jpg',
    status: 'collection' as CardStatus,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

export function makePreference(overrides: Partial<Preference> = {}): Preference {
  return {
    id: 'pref-1',
    scryfallId: 'scryfall-xyz',
    name: 'Counterspell',
    type: 'BUSCO' as PreferenceType,
    quantity: 2,
    condition: 'NM' as CardCondition,
    edition: 'Modern Horizons 2',
    image: 'https://example.com/counterspell.jpg',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  }
}

export function makeFilterableCard(overrides: Partial<FilterableCard> = {}): FilterableCard {
  return {
    name: 'Llanowar Elves',
    edition: 'Dominaria',
    setCode: 'DOM',
    price: 0.25,
    cmc: 1,
    type_line: 'Creature — Elf Druid',
    colors: ['G'],
    rarity: 'common',
    condition: 'NM',
    foil: false,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  }
}

/** Build a minimal card for CSV export tests */
export function makeCsvCard(overrides: Partial<{
  name: string
  setCode: string
  quantity: number
  foil: boolean
  scryfallId: string
  price: number
  condition: CardCondition
  language?: string
}> = {}) {
  return {
    name: 'Sol Ring',
    setCode: 'C21',
    quantity: 1,
    foil: false,
    scryfallId: 'scryfall-sol',
    price: 3.99,
    condition: 'NM' as CardCondition,
    ...overrides,
  }
}

/** Build a MoxfieldDeck structure for moxfield service tests */
export function makeMoxfieldDeck(overrides: any = {}) {
  return {
    name: 'Test Deck',
    format: 'modern',
    boards: {
      mainboard: {
        count: 1,
        cards: {
          'bolt-1': {
            quantity: 4,
            boardType: 'mainboard',
            card: {
              name: 'Lightning Bolt',
              set: 'm21',
              cn: '199',
              scryfall_id: 'abc-123',
            },
          },
        },
      },
      sideboard: {
        count: 1,
        cards: {
          'negate-1': {
            quantity: 2,
            boardType: 'sideboard',
            card: {
              name: 'Negate',
              set: 'rix',
              cn: '44',
              scryfall_id: 'def-456',
            },
          },
        },
      },
      commanders: {
        count: 0,
        cards: {},
      },
      ...overrides.boards,
    },
    ...overrides,
  }
}
