/**
 * TASK-286: bulkImportCards writes cards with a scryfallId but no
 * type_line/colors/rarity/cmc when the client's TASK-285 enrichment never
 * ran — measured in production 2026-08-26 (5765 cards, 0 with type_line,
 * scryfall_cache unchanged). enrichCardsForImport is the server-side
 * second net: cache first, Scryfall's /cards/collection second, card
 * always imported either way (AC4).
 *
 * Dependency-free (no firebase-admin, no real network) so this executes
 * under vitest — same technique as cardIndexEntry.test.ts. getCacheMap and
 * fetchScryfallBatch are injected fakes standing in for
 * functions/index.js's fetchScryfallCacheMap and fetchScryfallCollectionBatch.
 */
import { enrichCardsForImport, needsEnrichment } from '../../../functions/lib/enrichImportCards.js'

function completeCard(overrides = {}) {
  // colors is deliberately non-empty here: an empty array is the codebase's
  // existing convention for "no data" (see mergeScryfallMetadata in
  // cardIndexEntry.js, which fills an empty colors array from the cache
  // too) — needsEnrichment follows that same convention on purpose, so a
  // genuinely "complete" fixture needs at least one color to be unambiguous.
  return {
    scryfallId: 'sf-1',
    name: 'Bear Cub',
    type_line: 'Creature — Bear',
    colors: ['G'],
    rarity: 'common',
    cmc: 2,
    quantity: 1,
    ...overrides,
  }
}

function incompleteCard(overrides = {}) {
  return {
    scryfallId: 'sf-1',
    name: 'Forest',
    quantity: 1,
    ...overrides,
  }
}

describe('needsEnrichment', () => {
  it('is false for a card with no scryfallId (nothing to look up)', () => {
    expect(needsEnrichment({ name: 'Forest' })).toBe(false)
  })

  it('is false for a card carrying all four fields, including a legitimate cmc of 0', () => {
    expect(needsEnrichment(completeCard())).toBe(false)
  })

  it('is true when type_line is missing', () => {
    expect(needsEnrichment(completeCard({ type_line: undefined }))).toBe(true)
  })

  it('is true when colors is missing (undefined, not an empty array)', () => {
    expect(needsEnrichment(completeCard({ colors: undefined }))).toBe(true)
  })

  it('is true when rarity is missing', () => {
    expect(needsEnrichment(completeCard({ rarity: '' }))).toBe(true)
  })

  it('is true when cmc is undefined (but NOT when cmc is 0)', () => {
    expect(needsEnrichment(completeCard({ cmc: undefined }))).toBe(true)
    expect(needsEnrichment(completeCard({ cmc: 0 }))).toBe(false)
  })
})

describe('enrichCardsForImport — AC3: cards already complete cost zero calls', () => {
  it('never calls getCacheMap or fetchScryfallBatch when every card is complete', async () => {
    const getCacheMap = vi.fn()
    const fetchScryfallBatch = vi.fn()
    const cards = [completeCard({ scryfallId: 'sf-1' }), completeCard({ scryfallId: 'sf-2' })]

    const result = await enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch })

    expect(getCacheMap).not.toHaveBeenCalled()
    expect(fetchScryfallBatch).not.toHaveBeenCalled()
    expect(result.cards).toEqual(cards)
    expect(result.cacheWrites.size).toBe(0)
    expect(result.unresolvedCount).toBe(0)
  })
})

describe('enrichCardsForImport — cache hit', () => {
  it('fills the card from scryfall_cache and does not call Scryfall or write the cache again', async () => {
    const cacheEntry = { type_line: 'Basic Land — Forest', colors: [], rarity: 'common', cmc: 0 }
    const getCacheMap = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, cacheEntry])))
    const fetchScryfallBatch = vi.fn()
    const cards = [incompleteCard()]

    const result = await enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch })

    expect(getCacheMap).toHaveBeenCalledWith(['sf-1'])
    expect(fetchScryfallBatch).not.toHaveBeenCalled()
    expect(result.cards[0].type_line).toBe('Basic Land — Forest')
    expect(result.cards[0].rarity).toBe('common')
    expect(result.cards[0].cmc).toBe(0)
    // AC2 negative: a cache hit is already in scryfall_cache, no rewrite.
    expect(result.cacheWrites.size).toBe(0)
    expect(result.unresolvedCount).toBe(0)
  })
})

describe('enrichCardsForImport — cache miss, Scryfall OK', () => {
  it('falls through to Scryfall, enriches the card, and queues it for scryfall_cache (AC2)', async () => {
    const getCacheMap = vi.fn(async () => new Map())
    const scryfallCard = { id: 'sf-1', type_line: 'Creature — Bear', colors: ['G'], rarity: 'common', cmc: 2 }
    const fetchScryfallBatch = vi.fn(async () => [scryfallCard])
    const cards = [incompleteCard()]

    const result = await enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch })

    expect(fetchScryfallBatch).toHaveBeenCalledWith(['sf-1'])
    expect(result.cards[0].type_line).toBe('Creature — Bear')
    expect(result.cards[0].colors).toEqual(['G'])
    expect(result.cacheWrites.get('sf-1')).toBe(scryfallCard)
    expect(result.unresolvedCount).toBe(0)
  })

  it('batches ids to Scryfall at 75 per call', async () => {
    const getCacheMap = vi.fn(async () => new Map())
    const fetchScryfallBatch = vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, type_line: 'Land', colors: [], rarity: 'common', cmc: 0 }))
    )
    const cards = Array.from({ length: 150 }, (_, i) => incompleteCard({ scryfallId: `sf-${i}` }))

    const result = await enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch })

    expect(fetchScryfallBatch).toHaveBeenCalledTimes(2)
    expect(fetchScryfallBatch.mock.calls[0][0]).toHaveLength(75)
    expect(fetchScryfallBatch.mock.calls[1][0]).toHaveLength(75)
    expect(result.unresolvedCount).toBe(0)
  })
})

describe('enrichCardsForImport — Scryfall down (AC4)', () => {
  it('imports the card unchanged and counts it as unresolved instead of throwing', async () => {
    const getCacheMap = vi.fn(async () => new Map())
    const fetchScryfallBatch = vi.fn(async () => {
      throw new Error('Scryfall /cards/collection: 503')
    })
    const cards = [incompleteCard()]

    const result = await enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch })

    expect(result.cards).toEqual(cards) // untouched, not dropped
    expect(result.unresolvedCount).toBe(1)
    expect(result.cacheWrites.size).toBe(0)
  })

  it('counts a card as unresolved when Scryfall responds but does not resolve that id', async () => {
    const getCacheMap = vi.fn(async () => new Map())
    const fetchScryfallBatch = vi.fn(async () => []) // not_found
    const cards = [incompleteCard({ scryfallId: 'sf-ghost' })]

    const result = await enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch })

    expect(result.cards[0]).toEqual(cards[0])
    expect(result.unresolvedCount).toBe(1)
  })

  it('omitting fetchScryfallBatch entirely behaves the same as Scryfall being unavailable', async () => {
    const getCacheMap = vi.fn(async () => new Map())
    const cards = [incompleteCard()]

    const result = await enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch: undefined })

    expect(result.unresolvedCount).toBe(1)
  })
})

describe('enrichCardsForImport — mixed batch', () => {
  it('handles complete + cache-hit + scryfall-hit + unresolved cards together, without cross-contamination', async () => {
    const cacheEntry = { type_line: 'Basic Land — Island', colors: [], rarity: 'common', cmc: 0 }
    const getCacheMap = vi.fn(async () => new Map([['sf-cache', cacheEntry]]))
    const scryfallCard = { id: 'sf-net', type_line: 'Creature — Bear', colors: ['G'], rarity: 'common', cmc: 2 }
    const fetchScryfallBatch = vi.fn(async (ids: string[]) =>
      ids.includes('sf-net') ? [scryfallCard] : []
    )

    const cards = [
      completeCard({ scryfallId: 'sf-complete' }),
      incompleteCard({ scryfallId: 'sf-cache' }),
      incompleteCard({ scryfallId: 'sf-net' }),
      incompleteCard({ scryfallId: 'sf-nowhere' }),
    ]

    const result = await enrichCardsForImport(cards, { getCacheMap, fetchScryfallBatch })

    expect(getCacheMap).toHaveBeenCalledWith(
      expect.arrayContaining(['sf-cache', 'sf-net', 'sf-nowhere'])
    )
    expect((getCacheMap.mock.calls[0][0] as string[])).not.toContain('sf-complete')

    expect(result.cards).toHaveLength(4)
    expect(result.cards[0]).toEqual(cards[0]) // complete card untouched
    expect(result.cards[1].type_line).toBe('Basic Land — Island') // cache hit
    expect(result.cards[2].type_line).toBe('Creature — Bear') // scryfall hit
    expect(result.cards[3]).toEqual(cards[3]) // unresolved, untouched

    expect(result.cacheWrites.size).toBe(1)
    expect(result.cacheWrites.get('sf-net')).toBe(scryfallCard)
    expect(result.unresolvedCount).toBe(1)
  })
})
