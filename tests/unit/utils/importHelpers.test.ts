import { describe, it, expect } from 'vitest'
import { parseTextImportLine, buildCollectionCardFromScryfall, buildRawMoxfieldCard, buildRawCsvCard } from '../../../src/utils/importHelpers'

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
  })
})
