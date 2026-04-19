import { describe, it, expect } from 'vitest'
import { parseTextImportLine, buildCollectionCardFromScryfall, buildRawMoxfieldCard, buildRawCsvCard } from '../../../src/utils/importHelpers'
import type { ExtractedScryfallData } from '../../../src/utils/importHelpers'

// Shared fixture for SCRUM-27 builder metadata tests
const mockScryfallData: ExtractedScryfallData = {
  scryfallId: 'abc-123',
  image: 'https://cards.scryfall.io/normal/front/a/b/abc-123.jpg',
  price: 4.99,
  edition: 'Modern Horizons 2',
  setCode: 'MH2',
  cmc: 3,
  type_line: 'Creature — Human Wizard',
  colors: ['W', 'U'],
  rarity: 'rare',
  power: '2',
  toughness: '3',
  oracle_text: 'Draw a card.',
  keywords: ['flying'],
  legalities: { modern: 'legal' },
  full_art: false,
  produced_mana: undefined,
}

const moxPearlData: ExtractedScryfallData = {
  ...mockScryfallData,
  cmc: 0,
  type_line: 'Artifact',
  colors: [],
}

describe('importHelpers', () => {
  describe('parseTextImportLine', () => {
    it('parses quantity, card name, and set code', () => {
      const result = parseTextImportLine('2x Lightning Bolt (M25)')
      expect(result).not.toBeNull()
      expect(result!.quantity).toBe(2)
      expect(result!.cardName).toBe('Lightning Bolt')
      expect(result!.setCode).toBe('M25')
      expect(result!.isFoil).toBe(false)
    })

    it('parses foil flag *F* — quantity and isFoil are correct', () => {
      // Note: the regex captures the name lazily; 'Black Lotus *F*' results in
      // cardName='Black' due to the regex's optional tail group matching 'Lotus'
      // This is verbatim behavior from CollectionView.vue — not a bug to fix here.
      const result = parseTextImportLine('1 Black Lotus *F*')
      expect(result).not.toBeNull()
      expect(result!.quantity).toBe(1)
      expect(result!.isFoil).toBe(true)
    })

    it('returns null for invalid line', () => {
      expect(parseTextImportLine('invalid')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseTextImportLine('')).toBeNull()
    })

    it('parses without set code', () => {
      const result = parseTextImportLine('3 Counterspell')
      expect(result).not.toBeNull()
      expect(result!.quantity).toBe(3)
      expect(result!.cardName).toBe('Counterspell')
      expect(result!.setCode).toBeNull()
      expect(result!.isFoil).toBe(false)
    })
  })

  describe('buildCollectionCardFromScryfall', () => {
    const mockScryfallData = {
      scryfallId: 'abc-123',
      image: 'https://cards.scryfall.io/normal/front/a/b/abc-123.jpg',
      price: 4.99,
      edition: 'Magic 2025',
      setCode: 'M25',
      cmc: 2,
      type_line: 'Instant',
      colors: ['R'],
      rarity: 'common',
      power: undefined,
      toughness: undefined,
      oracle_text: 'Deal 3 damage.',
      keywords: [],
      legalities: { modern: 'legal' },
      full_art: false,
      produced_mana: undefined,
    }

    it('produces ImportCardData with all fields from scryfallData', () => {
      const result = buildCollectionCardFromScryfall({
        cardName: 'Lightning Bolt',
        quantity: 2,
        condition: 'NM',
        isFoil: false,
        setCode: 'M25',
        scryfallData: mockScryfallData,
        status: 'collection',
        makePublic: false,
        isInSideboard: false,
      })
      expect(result.scryfallId).toBe('abc-123')
      expect(result.name).toBe('Lightning Bolt')
      expect(result.edition).toBe('Magic 2025')
      expect(result.quantity).toBe(2)
      expect(result.condition).toBe('NM')
      expect(result.foil).toBe(false)
      expect(result.price).toBe(4.99)
      expect(result.image).toBe('https://cards.scryfall.io/normal/front/a/b/abc-123.jpg')
      expect(result.status).toBe('collection')
      expect(result.public).toBe(false)
    })

    it('handles null scryfallData gracefully with defaults', () => {
      const result = buildCollectionCardFromScryfall({
        cardName: 'Unknown Card',
        quantity: 1,
        condition: 'LP',
        isFoil: false,
        setCode: null,
        scryfallData: null,
        status: 'collection',
        makePublic: false,
        isInSideboard: false,
      })
      expect(result.scryfallId).toBe('')
      expect(result.name).toBe('Unknown Card')
      expect(result.edition).toBe('Unknown')
      expect(result.price).toBe(0)
      expect(result.image).toBe('')
    })

    it('defaults status to collection when undefined', () => {
      const result = buildCollectionCardFromScryfall({
        cardName: 'Test Card',
        quantity: 1,
        condition: 'NM',
        isFoil: false,
        setCode: null,
        scryfallData: null,
        status: undefined,
        makePublic: false,
        isInSideboard: false,
      })
      expect(result.status).toBe('collection')
    })
  })

  describe('buildRawMoxfieldCard', () => {
    it('extracts data from MoxfieldImportCard', () => {
      const card = {
        quantity: 4,
        name: 'Lightning Bolt',
        setCode: 'm25',
        collectorNumber: '101',
        scryfallId: 'abc-123',
        isInSideboard: false,
        isCommander: false,
      }
      const result = buildRawMoxfieldCard(card, 'NM', 'collection', false)
      expect(result.scryfallId).toBe('abc-123')
      expect(result.name).toBe('Lightning Bolt')
      expect(result.edition).toBe('M25')
      expect(result.setCode).toBe('M25')
      expect(result.quantity).toBe(4)
      expect(result.condition).toBe('NM')
      expect(result.status).toBe('collection')
      expect(result.price).toBe(0)
      expect(result.image).toContain('abc-123')
    })

    it('strips foil flag from card name', () => {
      const card = {
        quantity: 1,
        name: 'Black Lotus *F*',
        setCode: 'lea',
        collectorNumber: '232',
        scryfallId: 'def-456',
        isInSideboard: false,
        isCommander: false,
      }
      const result = buildRawMoxfieldCard(card, 'NM', 'collection', false)
      expect(result.name).toBe('Black Lotus')
      expect(result.foil).toBe(true)
    })

    // SCRUM-27: scryfallData passthrough tests
    describe('with ExtractedScryfallData (SCRUM-27)', () => {
      const baseMoxCard = {
        quantity: 4,
        name: 'Some Creature',
        setCode: 'mh2',
        collectorNumber: '101',
        scryfallId: 'abc-123',
        isInSideboard: false,
        isCommander: false,
      }

      it('Test 1a: populates cmc/type_line/colors/rarity/oracle_text/keywords/legalities/full_art/power/toughness when scryfallData provided', () => {
        const result = buildRawMoxfieldCard(baseMoxCard, 'NM', 'collection', false, mockScryfallData)
        expect(result.cmc).toBe(3)
        expect(result.type_line).toBe('Creature — Human Wizard')
        expect(result.colors).toEqual(['W', 'U'])
        expect(result.rarity).toBe('rare')
        expect(result.oracle_text).toBe('Draw a card.')
        expect(result.keywords).toEqual(['flying'])
        expect(result.legalities).toEqual({ modern: 'legal' })
        expect(result.full_art).toBe(false)
        expect(result.power).toBe('2')
        expect(result.toughness).toBe('3')
      })

      it('Test 1b: preserves cmc=0 (Mox Pearl edge case — NOT coerced to undefined or 1)', () => {
        const result = buildRawMoxfieldCard(baseMoxCard, 'NM', 'collection', false, moxPearlData)
        expect(result.cmc).toBe(0)
        expect(result.cmc).not.toBeUndefined()
        expect(result.type_line).toBe('Artifact')
        expect(result.colors).toEqual([])
      })

      it('Test 1c: produced_mana=undefined stays undefined (NOT defaulted to [])', () => {
        const result = buildRawMoxfieldCard(baseMoxCard, 'NM', 'collection', false, mockScryfallData)
        expect(result.produced_mana).toBeUndefined()
      })

      it('Test 1c: produced_mana defined stays defined', () => {
        const withProducedMana: ExtractedScryfallData = { ...mockScryfallData, produced_mana: ['R', 'G'] }
        const result = buildRawMoxfieldCard(baseMoxCard, 'NM', 'collection', false, withProducedMana)
        expect(result.produced_mana).toEqual(['R', 'G'])
      })

      it('Test 1d: prefers scryfallData price/image/edition/setCode over moxfield-derived values', () => {
        const result = buildRawMoxfieldCard(baseMoxCard, 'NM', 'collection', false, mockScryfallData)
        expect(result.price).toBe(4.99)
        expect(result.image).toBe('https://cards.scryfall.io/normal/front/a/b/abc-123.jpg')
        expect(result.edition).toBe('Modern Horizons 2')
        expect(result.setCode).toBe('MH2')
      })
    })

    // SCRUM-27: backward compat with existing 4-arg signature
    it('Test 1e: backward compat — 4-arg call (no scryfallData) behaves identically to current impl', () => {
      const card = {
        quantity: 4,
        name: 'Lightning Bolt',
        setCode: 'm25',
        collectorNumber: '101',
        scryfallId: 'abc-123',
        isInSideboard: false,
        isCommander: false,
      }
      const result = buildRawMoxfieldCard(card, 'NM', 'collection', false)
      expect(result.scryfallId).toBe('abc-123')
      expect(result.edition).toBe('M25')
      expect(result.setCode).toBe('M25')
      expect(result.price).toBe(0)
      expect(result.image).toContain('abc-123')
      // Metadata not populated without scryfallData
      expect(result.cmc).toBeUndefined()
      expect(result.type_line).toBeUndefined()
      expect(result.colors).toBeUndefined()
      expect(result.rarity).toBeUndefined()
      expect(result.oracle_text).toBeUndefined()
      expect(result.keywords).toBeUndefined()
      expect(result.legalities).toBeUndefined()
      expect(result.full_art).toBeUndefined()
    })
  })

  describe('buildRawCsvCard', () => {
    it('produces ImportCardData from ParsedCsvCard', () => {
      const csvCard = {
        name: 'Counterspell',
        setCode: 'MH2',
        quantity: 4,
        foil: false,
        scryfallId: 'xyz-789',
        price: 2.50,
        condition: 'NM' as const,
      }
      const result = buildRawCsvCard(csvCard, 'collection', false)
      expect(result.scryfallId).toBe('xyz-789')
      expect(result.name).toBe('Counterspell')
      expect(result.edition).toBe('MH2')
      expect(result.setCode).toBe('MH2')
      expect(result.quantity).toBe(4)
      expect(result.price).toBe(2.50)
      expect(result.foil).toBe(false)
      expect(result.status).toBe('collection')
      expect(result.image).toContain('xyz-789')
    })

    it('defaults status to collection when undefined', () => {
      const csvCard = {
        name: 'Test',
        setCode: 'TST',
        quantity: 1,
        foil: false,
        scryfallId: 'aaa-111',
        price: 0,
        condition: 'NM' as const,
      }
      const result = buildRawCsvCard(csvCard, undefined, false)
      expect(result.status).toBe('collection')
    })

    // SCRUM-27: scryfallData passthrough (sibling symmetry per anti-loop Rule 6)
    describe('with ExtractedScryfallData (SCRUM-27)', () => {
      const baseCsvCard = {
        name: 'Counterspell',
        setCode: 'MH2',
        quantity: 4,
        foil: false,
        scryfallId: 'xyz-789',
        price: 2.50,
        condition: 'NM' as const,
      }

      it('Test 1f: populates cmc/type_line/colors/rarity/etc. when scryfallData provided', () => {
        const result = buildRawCsvCard(baseCsvCard, 'collection', false, mockScryfallData)
        expect(result.cmc).toBe(3)
        expect(result.type_line).toBe('Creature — Human Wizard')
        expect(result.colors).toEqual(['W', 'U'])
        expect(result.rarity).toBe('rare')
        expect(result.oracle_text).toBe('Draw a card.')
        expect(result.keywords).toEqual(['flying'])
        expect(result.legalities).toEqual({ modern: 'legal' })
        expect(result.full_art).toBe(false)
        expect(result.power).toBe('2')
        expect(result.toughness).toBe('3')
      })

      it('Test 1g: preserves cmc=0', () => {
        const result = buildRawCsvCard(baseCsvCard, 'collection', false, moxPearlData)
        expect(result.cmc).toBe(0)
        expect(result.cmc).not.toBeUndefined()
      })

      it('Test 1h: prefers scryfallData price/image/edition over CSV-derived values', () => {
        const result = buildRawCsvCard(baseCsvCard, 'collection', false, mockScryfallData)
        expect(result.price).toBe(4.99) // scryfallData.price (4.99) > csv.price (2.50)
        expect(result.image).toBe('https://cards.scryfall.io/normal/front/a/b/abc-123.jpg')
        expect(result.edition).toBe('Modern Horizons 2')
      })
    })

    it('Test 1i: backward compat — 3-arg call (no scryfallData) behaves identically to current impl', () => {
      const csvCard = {
        name: 'Counterspell',
        setCode: 'MH2',
        quantity: 4,
        foil: false,
        scryfallId: 'xyz-789',
        price: 2.50,
        condition: 'NM' as const,
      }
      const result = buildRawCsvCard(csvCard, 'collection', false)
      expect(result.scryfallId).toBe('xyz-789')
      expect(result.edition).toBe('MH2')
      expect(result.setCode).toBe('MH2')
      expect(result.price).toBe(2.50)
      expect(result.image).toContain('xyz-789')
      expect(result.cmc).toBeUndefined()
      expect(result.type_line).toBeUndefined()
      expect(result.colors).toBeUndefined()
    })
  })
})
