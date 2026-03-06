import { extractDeckId, moxfieldToCardList, getMoxfieldDeckCounts } from '@/services/moxfield'
import { makeMoxfieldDeck } from '../helpers/fixtures'

describe('extractDeckId', () => {
  it('extracts ID from a full Moxfield URL', () => {
    expect(extractDeckId('https://www.moxfield.com/decks/tiIftnM5wUC29k6F5KisRw'))
      .toBe('tiIftnM5wUC29k6F5KisRw')
  })

  it('returns a bare deck ID as-is', () => {
    expect(extractDeckId('tiIftnM5wUC29k6F5KisRw')).toBe('tiIftnM5wUC29k6F5KisRw')
  })

  it('returns null for an invalid URL', () => {
    expect(extractDeckId('https://google.com/foo')).toBeNull()
  })

  it('trims whitespace from a bare ID', () => {
    expect(extractDeckId(' tiIftnM5wUC29k6F5KisRw  ')).toBe('tiIftnM5wUC29k6F5KisRw')
  })

  it('returns null for an empty string', () => {
    expect(extractDeckId('')).toBeNull()
  })
})

describe('moxfieldToCardList', () => {
  it('returns mainboard and sideboard cards by default', () => {
    const deck = makeMoxfieldDeck()
    const cards = moxfieldToCardList(deck)

    expect(cards).toHaveLength(2)
    expect(cards.find(c => c.name === 'Lightning Bolt')?.isInSideboard).toBe(false)
    expect(cards.find(c => c.name === 'Negate')?.isInSideboard).toBe(true)
  })

  it('excludes sideboard cards when includeSideboard is false', () => {
    const deck = makeMoxfieldDeck()
    const cards = moxfieldToCardList(deck, false)

    expect(cards).toHaveLength(1)
    expect(cards[0].name).toBe('Lightning Bolt')
  })

  it('marks commander cards with isCommander: true', () => {
    const deck = makeMoxfieldDeck({
      boards: {
        commanders: {
          count: 1,
          cards: {
            'atraxa-1': {
              quantity: 1,
              boardType: 'commanders',
              card: { name: 'Atraxa', set: 'one', cn: '190', scryfall_id: 'cmd-789' },
            },
          },
        },
      },
    })
    const cards = moxfieldToCardList(deck)
    const commander = cards.find(c => c.name === 'Atraxa')

    expect(commander).toBeDefined()
    expect(commander!.isCommander).toBe(true)
    expect(commander!.isInSideboard).toBe(false)
  })

  it('returns an empty array when all boards are empty', () => {
    const deck = makeMoxfieldDeck({
      boards: {
        mainboard: { count: 0, cards: {} },
        sideboard: { count: 0, cards: {} },
        commanders: { count: 0, cards: {} },
      },
    })
    expect(moxfieldToCardList(deck)).toEqual([])
  })

  it('uppercases the set code', () => {
    const deck = makeMoxfieldDeck()
    const cards = moxfieldToCardList(deck)
    const bolt = cards.find(c => c.name === 'Lightning Bolt')

    expect(bolt!.setCode).toBe('M21')
  })

  it('preserves the original quantity', () => {
    const deck = makeMoxfieldDeck()
    const cards = moxfieldToCardList(deck)
    const bolt = cards.find(c => c.name === 'Lightning Bolt')

    expect(bolt!.quantity).toBe(4)
  })
})

describe('getMoxfieldDeckCounts', () => {
  it('returns counts from a full deck', () => {
    const deck = makeMoxfieldDeck()
    expect(getMoxfieldDeckCounts(deck)).toEqual({
      mainboard: 1,
      sideboard: 1,
      commanders: 0,
    })
  })

  it('returns zeros for empty boards', () => {
    const deck = makeMoxfieldDeck({
      boards: {
        mainboard: { count: 0, cards: {} },
        sideboard: { count: 0, cards: {} },
        commanders: { count: 0, cards: {} },
      },
    })
    expect(getMoxfieldDeckCounts(deck)).toEqual({
      mainboard: 0,
      sideboard: 0,
      commanders: 0,
    })
  })

  it('returns zeros when boards are undefined', () => {
    const deck = { name: 'Empty', boards: {} } as any
    expect(getMoxfieldDeckCounts(deck)).toEqual({
      mainboard: 0,
      sideboard: 0,
      commanders: 0,
    })
  })

  it('returns the commanders count when present', () => {
    const deck = makeMoxfieldDeck({
      boards: {
        commanders: {
          count: 2,
          cards: {
            'cmd-1': {
              quantity: 1,
              boardType: 'commanders',
              card: { name: 'Atraxa', set: 'one', cn: '190', scryfall_id: 'cmd-789' },
            },
            'cmd-2': {
              quantity: 1,
              boardType: 'commanders',
              card: { name: 'Thrasios', set: 'c16', cn: '46', scryfall_id: 'cmd-000' },
            },
          },
        },
      },
    })
    expect(getMoxfieldDeckCounts(deck).commanders).toBe(2)
  })
})
