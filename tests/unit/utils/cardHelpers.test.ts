import {
  cleanCardName,
  parseDeckLine,
  isCsvFormat,
  parseCsvDeckImport,
  buildMoxfieldCsv,
  buildManaboxCsv,
} from '@/utils/cardHelpers'
import { makeCsvCard } from '../helpers/fixtures'

// ─── cleanCardName ───────────────────────────────────────────────

describe('cleanCardName', () => {
  it('removes *F* foil indicator', () => {
    expect(cleanCardName('Card Name *F*')).toBe('Card Name')
  })

  it('removes *f* foil indicator (lowercase)', () => {
    expect(cleanCardName('Card Name *f*')).toBe('Card Name')
  })

  it('removes *F foil indicator (no closing asterisk)', () => {
    expect(cleanCardName('Card Name *F')).toBe('Card Name')
  })

  it('removes (SET) suffix', () => {
    expect(cleanCardName('Card Name (M21)')).toBe('Card Name')
  })

  it('removes (SET) collector-number suffix', () => {
    expect(cleanCardName('Card Name (M21) 123')).toBe('Card Name')
  })

  it('removes (PLST) collector patterns like KHM-275', () => {
    expect(cleanCardName('Card Name (PLST) KHM-275')).toBe('Card Name')
  })

  it('returns empty string for empty input', () => {
    expect(cleanCardName('')).toBe('')
  })

  it('trims whitespace from both sides', () => {
    expect(cleanCardName('   Card Name   ')).toBe('Card Name')
  })
})

// ─── parseDeckLine ───────────────────────────────────────────────

describe('parseDeckLine', () => {
  it('parses a simple card line', () => {
    expect(parseDeckLine('4 Lightning Bolt')).toEqual({
      quantity: 4,
      cardName: 'Lightning Bolt',
      setCode: null,
      isFoil: false,
    })
  })

  it('parses "4x" quantity prefix', () => {
    expect(parseDeckLine('4x Lightning Bolt')).toEqual({
      quantity: 4,
      cardName: 'Lightning Bolt',
      setCode: null,
      isFoil: false,
    })
  })

  it('extracts set code in parentheses', () => {
    expect(parseDeckLine('4 Lightning Bolt (M21)')).toEqual({
      quantity: 4,
      cardName: 'Lightning Bolt',
      setCode: 'M21',
      isFoil: false,
    })
  })

  it('detects foil indicator *F*', () => {
    const result = parseDeckLine('4 Lightning Bolt *F*')
    expect(result).not.toBeNull()
    expect(result!.isFoil).toBe(true)
  })

  it('returns null for empty string', () => {
    expect(parseDeckLine('')).toBeNull()
  })

  it('returns null for sideboard marker', () => {
    expect(parseDeckLine('Sideboard')).toBeNull()
  })

  it('returns null for non-card text without leading quantity', () => {
    expect(parseDeckLine('not a card line')).toBeNull()
  })

  it('handles card names with commas', () => {
    const result = parseDeckLine('1 Jace, the Mind Sculptor')
    expect(result).not.toBeNull()
    expect(result!.cardName).toBe('Jace, the Mind Sculptor')
  })
})

// ─── isCsvFormat ─────────────────────────────────────────────────

describe('isCsvFormat', () => {
  it('detects ManaBox header with "Name,Set code"', () => {
    const csv = 'Name,Set code,Set name,Collector number,Foil\n"Sol Ring","C21","Commander 2021","",""'
    expect(isCsvFormat(csv)).toBe(true)
  })

  it('detects Moxfield header with "Count,Name,Edition"', () => {
    const csv = 'Count,Name,Edition,Condition,Language,Foil,Collector Number\n1,Sol Ring,C21,Near Mint,EN,,,'
    expect(isCsvFormat(csv)).toBe(true)
  })

  it('returns false for plain deck list text', () => {
    expect(isCsvFormat('4 Lightning Bolt')).toBe(false)
  })

  it('returns false for deck list without CSV headers', () => {
    const text = '4 Lightning Bolt\n2 Counterspell\nSideboard\n1 Negate'
    expect(isCsvFormat(text)).toBe(false)
  })
})

// ─── parseCsvDeckImport ──────────────────────────────────────────

describe('parseCsvDeckImport', () => {
  it('parses ManaBox CSV with standard columns', () => {
    const csv = [
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency',
      'Sol Ring,C21,,,,rare,2,,scryfall-sol,3.99,,,near_mint,en,',
    ].join('\n')

    const result = parseCsvDeckImport(csv)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: 'Sol Ring',
      setCode: 'C21',
      quantity: 2,
      condition: 'NM',
      scryfallId: 'scryfall-sol',
    })
  })

  it('parses Moxfield CSV with Count,Name,Edition,Condition', () => {
    const csv = [
      'Count,Name,Edition,Condition,Language,Foil,Collector Number,Alter,Proxy,Purchase Price',
      '3,Lightning Bolt,M21,Lightly Played,EN,,199,,,1.50',
    ].join('\n')

    const result = parseCsvDeckImport(csv)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: 'Lightning Bolt',
      setCode: 'M21',
      quantity: 3,
      condition: 'LP',
      price: 1.50,
    })
  })

  it('detects foil from Foil column', () => {
    const csv = [
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency',
      'Sol Ring,C21,,,,rare,1,,,,foil,,near_mint,en,',
    ].join('\n')

    // Foil column is at index 4 in ManaBox header
    // Let's build it properly
    const csv2 = [
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency',
      'Sol Ring,C21,,,foil,rare,1,,scryfall-sol,3.99,,,near_mint,en,',
    ].join('\n')

    const result = parseCsvDeckImport(csv2)
    expect(result).toHaveLength(1)
    expect(result[0]!.foil).toBe(true)
  })

  it('returns empty array for empty input', () => {
    expect(parseCsvDeckImport('')).toEqual([])
  })

  it('returns empty array for header-only CSV (no data lines)', () => {
    const csv = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency'
    expect(parseCsvDeckImport(csv)).toEqual([])
  })

  it('parses price as a number', () => {
    const csv = [
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency',
      'Sol Ring,C21,,,,,1,,scryfall-sol,3.99,,,near_mint,en,',
    ].join('\n')

    const result = parseCsvDeckImport(csv)
    expect(result[0]!.price).toBe(3.99)
  })

  it('populates language field', () => {
    const csv = [
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency',
      'Sol Ring,C21,,,,,1,,scryfall-sol,,,,near_mint,en,',
    ].join('\n')

    const result = parseCsvDeckImport(csv)
    expect(result[0]!.language).toBe('en')
  })

  it('skips rows with quantity 0 or negative', () => {
    const csv = [
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency',
      'Sol Ring,C21,,,,,0,,scryfall-sol,,,,near_mint,en,',
      'Bad Card,C21,,,,,-1,,scryfall-bad,,,,near_mint,en,',
    ].join('\n')

    expect(parseCsvDeckImport(csv)).toEqual([])
  })

  it('handles card names with commas (quoted CSV field)', () => {
    const csv = [
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency',
      '"Jace, the Mind Sculptor",2XM,,,,,1,,scryfall-jace,,,,near_mint,en,',
    ].join('\n')

    const result = parseCsvDeckImport(csv)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Jace, the Mind Sculptor')
  })

  it('populates scryfallId from Scryfall ID column', () => {
    const csv = [
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency',
      'Sol Ring,C21,,,,,1,,abc-def-123,,,,near_mint,en,',
    ].join('\n')

    const result = parseCsvDeckImport(csv)
    expect(result[0]!.scryfallId).toBe('abc-def-123')
  })
})

// ─── buildMoxfieldCsv ───────────────────────────────────────────

describe('buildMoxfieldCsv', () => {
  it('produces correct header and data line for a single card', () => {
    const csv = buildMoxfieldCsv([makeCsvCard()])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Count,Name,Edition,Condition,Language,Foil,Collector Number,Alter,Proxy,Purchase Price')
    expect(lines[1]).toContain('Sol Ring')
    expect(lines[1]).toContain('C21')
  })

  it('includes all cards for multiple entries', () => {
    const cards = [
      makeCsvCard({ name: 'Sol Ring' }),
      makeCsvCard({ name: 'Lightning Bolt', setCode: 'M21' }),
    ]
    const csv = buildMoxfieldCsv(cards)
    expect(csv).toContain('Sol Ring')
    expect(csv).toContain('Lightning Bolt')
  })

  it('marks foil card with "foil" in Foil column', () => {
    const csv = buildMoxfieldCsv([makeCsvCard({ foil: true })])
    const lines = csv.split('\n')
    const fields = lines[1]!.split(',')
    // Foil is column index 5
    expect(fields[5]).toBe('foil')
  })

  it('maps condition codes to Moxfield labels', () => {
    const cases: Array<[string, string]> = [
      ['NM', 'Near Mint'],
      ['LP', 'Lightly Played'],
      ['HP', 'Heavily Played'],
      ['PO', 'Damaged'],
    ]
    for (const [code, label] of cases) {
      const csv = buildMoxfieldCsv([makeCsvCard({ condition: code as any })])
      expect(csv).toContain(label)
    }
  })

  it('formats price with two decimal places', () => {
    const csv = buildMoxfieldCsv([makeCsvCard({ price: 3.99 })])
    expect(csv).toContain('3.99')
  })
})

// ─── buildManaboxCsv ────────────────────────────────────────────

describe('buildManaboxCsv', () => {
  it('produces correct ManaBox header and data line for a single card', () => {
    const csv = buildManaboxCsv([makeCsvCard()])
    const lines = csv.split('\n')
    expect(lines[0]).toContain('Name,Set code')
    expect(lines[1]).toContain('Sol Ring')
  })

  it('includes all cards for multiple entries', () => {
    const cards = [
      makeCsvCard({ name: 'Sol Ring' }),
      makeCsvCard({ name: 'Mana Crypt', setCode: '2XM' }),
    ]
    const csv = buildManaboxCsv(cards)
    expect(csv).toContain('Sol Ring')
    expect(csv).toContain('Mana Crypt')
  })

  it('marks foil card with "foil" in Foil column', () => {
    const csv = buildManaboxCsv([makeCsvCard({ foil: true })])
    const lines = csv.split('\n')
    const fields = lines[1]!.split(',')
    // Foil is column index 4 in ManaBox format
    expect(fields[4]).toBe('foil')
  })

  it('maps condition codes to ManaBox labels', () => {
    const cases: Array<[string, string]> = [
      ['NM', 'near_mint'],
      ['LP', 'excellent'],
      ['HP', 'played'],
      ['PO', 'poor'],
    ]
    for (const [code, label] of cases) {
      const csv = buildManaboxCsv([makeCsvCard({ condition: code as any })])
      expect(csv).toContain(label)
    }
  })

  it('escapes card names with commas using quotes', () => {
    const csv = buildManaboxCsv([makeCsvCard({ name: 'Jace, the Mind Sculptor' })])
    expect(csv).toContain('"Jace, the Mind Sculptor"')
  })
})

// ─── CSV roundtrip tests ─────────────────────────────────────────

describe('CSV roundtrip', () => {
  it('Moxfield: build then parse preserves name, quantity, condition', () => {
    const original = makeCsvCard({ name: 'Sol Ring', quantity: 3, condition: 'LP' })
    const csv = buildMoxfieldCsv([original])
    const parsed = parseCsvDeckImport(csv)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.name).toBe('Sol Ring')
    expect(parsed[0]!.quantity).toBe(3)
    expect(parsed[0]!.condition).toBe('LP')
  })

  it('ManaBox: build then parse preserves name, quantity, scryfallId', () => {
    const original = makeCsvCard({ name: 'Sol Ring', quantity: 2, scryfallId: 'scryfall-sol' })
    const csv = buildManaboxCsv([original])
    const parsed = parseCsvDeckImport(csv)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.name).toBe('Sol Ring')
    expect(parsed[0]!.quantity).toBe(2)
    expect(parsed[0]!.scryfallId).toBe('scryfall-sol')
  })

  it('foil flag survives roundtrip through ManaBox CSV', () => {
    const original = makeCsvCard({ foil: true })
    const csv = buildManaboxCsv([original])
    const parsed = parseCsvDeckImport(csv)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.foil).toBe(true)
  })
})
