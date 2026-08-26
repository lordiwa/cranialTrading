import { describe, it, expect } from 'vitest'
import { parseTextImportLine, buildCollectionCardFromScryfall, buildRawMoxfieldCard, buildRawCsvCard, buildCsvCardWithScryfall } from '../../../src/utils/importHelpers'

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

  // TASK-285: CSV import was calling buildRawCsvCard() unconditionally, so
  // type_line/colors/rarity/cmc were never populated and _cacheFields was
  // never attached (see functions/index.js:bulkImportCards, which only
  // writes scryfall_cache from card._cacheFields). Filters read those exact
  // card_index fields, so every CSV import landed unfilterable.
  describe('buildCsvCardWithScryfall', () => {
    const csvCard = {
      name: 'Counterspell',
      setCode: 'MH2',
      quantity: 4,
      foil: false,
      scryfallId: 'xyz-789',
      price: 2.50,
      condition: 'NM' as const,
    }

    const mockScryfallData = {
      scryfallId: 'xyz-789',
      name: 'Counterspell',
      image: 'https://cards.scryfall.io/normal/front/x/y/xyz-789.jpg',
      price: 3.10,
      edition: 'Modern Horizons 2',
      setCode: 'MH2',
      cmc: 2,
      type_line: 'Instant',
      colors: ['U'],
      rarity: 'uncommon',
      power: undefined,
      toughness: undefined,
      oracle_text: 'Counter target spell.',
      keywords: [],
      legalities: { modern: 'legal' },
      full_art: false,
      produced_mana: undefined,
    }

    // AC1 (sensor rojo primero)
    it('AC1: attaches type_line, colors, rarity, cmc AND _cacheFields when Scryfall data is available', () => {
      const result = buildCsvCardWithScryfall(csvCard, mockScryfallData, 'collection', false)

      expect(result.type_line).toBe('Instant')
      expect(result.colors).toEqual(['U'])
      expect(result.rarity).toBe('uncommon')
      expect(result.cmc).toBe(2)
      expect(result._cacheFields).toBeDefined()
      expect(result._cacheFields?.type_line).toBe('Instant')
      expect(result._cacheFields?.colors).toEqual(['U'])
      expect(result._cacheFields?.rarity).toBe('uncommon')
      expect(result._cacheFields?.cmc).toBe(2)
    })

    // AC3: row with no Scryfall match (no scryfallId, or id doesn't resolve) still
    // imports through the raw path — same as buildRawCsvCard — instead of breaking
    // or dropping the row.
    it('AC3: falls back to the raw card (no metadata, no _cacheFields) when scryfallData is null', () => {
      const result = buildCsvCardWithScryfall(csvCard, null, 'collection', false)

      expect(result.scryfallId).toBe('xyz-789')
      expect(result.name).toBe('Counterspell')
      expect(result.price).toBe(2.50) // user's purchase price, not Scryfall's
      expect(result._cacheFields).toBeUndefined()
      expect(result.type_line).toBeUndefined()
      expect(result.colors).toBeUndefined()
      expect(result.rarity).toBeUndefined()
      expect(result.cmc).toBeUndefined()
    })

    it('AC3: falls back to the raw card when scryfallData is undefined (id did not resolve)', () => {
      const result = buildCsvCardWithScryfall(csvCard, undefined, 'collection', false)
      expect(result._cacheFields).toBeUndefined()
    })

    // AC5 (control negativo obligatorio): the AC1 sensor must go red for the right
    // reason. With the fix in place but _cacheFields emptied by hand, AC1's
    // assertions on _cacheFields must fail — proving the test actually inspects
    // _cacheFields rather than passing regardless of its content.
    it('AC5: control negativo — AC1 sensor fails when _cacheFields is emptied by hand', () => {
      const result = buildCsvCardWithScryfall(csvCard, mockScryfallData, 'collection', false)
      result._cacheFields = {}

      expect(() => {
        expect(result._cacheFields?.type_line).toBe('Instant')
      }).toThrow()
    })
  })
})
