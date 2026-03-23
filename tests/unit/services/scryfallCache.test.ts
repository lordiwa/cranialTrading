import type { ScryfallCard } from '@/services/scryfall'

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock firebase/firestore
const mockGetDoc = vi.fn()
const mockGetDocs = vi.fn()
const mockSetDoc = vi.fn()
const mockUpdateDoc = vi.fn()
const mockDoc = vi.fn((_db: unknown, _col: string, id: string) => ({ id, path: `scryfall_cache/${id}` }))
const mockQuery = vi.fn((..._args: unknown[]) => ({ _query: true }))
const mockWhere = vi.fn((..._args: unknown[]) => ({ _where: true }))
const mockDocumentId = vi.fn(() => '__documentId__')
const mockCollection = vi.fn((..._args: unknown[]) => ({ _collection: true }))
const mockTimestamp = { now: vi.fn(() => ({ toMillis: () => Date.now() })) }
const mockBatchCommit = vi.fn().mockResolvedValue(undefined)
const mockBatchSet = vi.fn()
const mockWriteBatch = vi.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit }))

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  documentId: () => mockDocumentId(),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  Timestamp: mockTimestamp,
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  writeBatch: (...args: unknown[]) => mockWriteBatch(...args),
}))

vi.mock('@/services/firebase', () => ({
  db: {},
}))

// Mock the raw scryfall service
const mockRawGetCardById = vi.fn()
const mockRawGetCardsByIds = vi.fn()

vi.mock('@/services/scryfall', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/scryfall')>()
  return {
    ...actual,
    getCardById: (...args: unknown[]) => mockRawGetCardById(...args),
    getCardsByIds: (...args: unknown[]) => mockRawGetCardsByIds(...args),
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeScryfallCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: 'abc-123',
    name: 'Lightning Bolt',
    set: 'm21',
    set_name: 'Core Set 2021',
    collector_number: '199',
    rarity: 'uncommon',
    type_line: 'Instant',
    mana_cost: '{R}',
    cmc: 1,
    colors: ['R'],
    image_uris: { small: 'https://example.com/small.jpg', normal: 'https://example.com/normal.jpg' },
    prices: { usd: '1.50' },
    ...overrides,
  }
}

function makeFirestoreDoc(card: ScryfallCard, opts: {
  metadataAge?: number
  pricesAge?: number
} = {}) {
  const now = Date.now()
  const metaUpdated = now - (opts.metadataAge ?? 0)
  const pricesUpdated = now - (opts.pricesAge ?? 0)

  return {
    exists: () => true,
    data: () => ({
      ...card,
      _cachedAt: { toMillis: () => now },
      _metadataUpdatedAt: { toMillis: () => metaUpdated },
      _pricesUpdatedAt: { toMillis: () => pricesUpdated },
    }),
  }
}

function makeMissingDoc() {
  return {
    exists: () => false,
    data: () => null,
  }
}

function makeQuerySnapshot(cards: ScryfallCard[], opts: {
  metadataAge?: number
  pricesAge?: number
} = {}) {
  const now = Date.now()
  const metaUpdated = now - (opts.metadataAge ?? 0)
  const pricesUpdated = now - (opts.pricesAge ?? 0)
  return {
    docs: cards.map(card => ({
      id: card.id,
      data: () => ({
        ...card,
        _cachedAt: { toMillis: () => now },
        _metadataUpdatedAt: { toMillis: () => metaUpdated },
        _pricesUpdatedAt: { toMillis: () => pricesUpdated },
      }),
    })),
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

// Import after mocks are set up
let getCardById: typeof import('@/services/scryfallCache').getCardById
let getCardsByIds: typeof import('@/services/scryfallCache').getCardsByIds
let _resetCacheForTesting: typeof import('@/services/scryfallCache')._resetCacheForTesting

beforeAll(async () => {
  const mod = await import('@/services/scryfallCache')
  getCardById = mod.getCardById
  getCardsByIds = mod.getCardsByIds
  _resetCacheForTesting = mod._resetCacheForTesting
})

beforeEach(() => {
  vi.clearAllMocks()
  _resetCacheForTesting()
})

// ── getCardById ────────────────────────────────────────────────────────────────

describe('getCardById', () => {
  it('returns from L1 cache when available (no Firestore or Scryfall calls)', async () => {
    const card = makeScryfallCard()

    // First call: L2 miss → Scryfall
    mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
    mockRawGetCardById.mockResolvedValueOnce(card)
    mockSetDoc.mockResolvedValueOnce(undefined)

    await getCardById('abc-123')

    // Second call: should come from L1
    const result = await getCardById('abc-123')

    expect(result).toEqual(card)
    // Scryfall only called once (first call)
    expect(mockRawGetCardById).toHaveBeenCalledTimes(1)
    // Firestore getDoc only called once (first call)
    expect(mockGetDoc).toHaveBeenCalledTimes(1)
  })

  it('reads from Firestore (L2) on L1 miss with fresh metadata', async () => {
    const card = makeScryfallCard()
    mockGetDoc.mockResolvedValueOnce(makeFirestoreDoc(card))

    const result = await getCardById('abc-123')

    expect(result).toEqual(card)
    expect(mockGetDoc).toHaveBeenCalledTimes(1)
    expect(mockRawGetCardById).not.toHaveBeenCalled()
  })

  it('falls through to Scryfall on L2 miss', async () => {
    const card = makeScryfallCard()
    mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
    mockRawGetCardById.mockResolvedValueOnce(card)
    mockSetDoc.mockResolvedValueOnce(undefined)

    const result = await getCardById('abc-123')

    expect(result).toEqual(card)
    expect(mockGetDoc).toHaveBeenCalledTimes(1)
    expect(mockRawGetCardById).toHaveBeenCalledWith('abc-123')
  })

  it('writes to L1 and L2 on Scryfall fetch', async () => {
    const card = makeScryfallCard()
    mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
    mockRawGetCardById.mockResolvedValueOnce(card)
    mockSetDoc.mockResolvedValueOnce(undefined)

    await getCardById('abc-123')

    // L2 write
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'abc-123' }),
      expect.objectContaining({ id: 'abc-123', name: 'Lightning Bolt' }),
    )

    // L1 write verified by second call not hitting Firestore/Scryfall
    const result2 = await getCardById('abc-123')
    expect(result2).toEqual(card)
    expect(mockGetDoc).toHaveBeenCalledTimes(1)
    expect(mockRawGetCardById).toHaveBeenCalledTimes(1)
  })

  it('treats stale metadata as L2 miss and re-fetches from Scryfall', async () => {
    const card = makeScryfallCard()
    const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000
    mockGetDoc.mockResolvedValueOnce(makeFirestoreDoc(card, { metadataAge: THIRTY_ONE_DAYS }))
    mockRawGetCardById.mockResolvedValueOnce(card)
    mockSetDoc.mockResolvedValueOnce(undefined)

    const result = await getCardById('abc-123')

    expect(result).toEqual(card)
    expect(mockRawGetCardById).toHaveBeenCalledWith('abc-123')
  })

  it('fires background price refresh when prices are stale but metadata is fresh', async () => {
    const card = makeScryfallCard()
    const TWENTY_FIVE_HOURS = 25 * 60 * 60 * 1000
    const freshCard = makeScryfallCard({ prices: { usd: '2.00' } })

    mockGetDoc.mockResolvedValueOnce(makeFirestoreDoc(card, { pricesAge: TWENTY_FIVE_HOURS }))
    mockRawGetCardById.mockResolvedValueOnce(freshCard)
    mockUpdateDoc.mockResolvedValueOnce(undefined)

    const result = await getCardById('abc-123')

    // Should return cached data immediately (not wait for refresh)
    expect(result).toEqual(card)
    // Firestore read happened
    expect(mockGetDoc).toHaveBeenCalledTimes(1)

    // Wait for background refresh
    await vi.waitFor(() => {
      expect(mockRawGetCardById).toHaveBeenCalledTimes(1)
    })
  })

  it('gracefully falls through to Scryfall when Firestore read fails', async () => {
    const card = makeScryfallCard()
    mockGetDoc.mockRejectedValueOnce(new Error('Firestore unavailable'))
    mockRawGetCardById.mockResolvedValueOnce(card)
    mockSetDoc.mockResolvedValueOnce(undefined)

    const result = await getCardById('abc-123')

    expect(result).toEqual(card)
    expect(mockRawGetCardById).toHaveBeenCalledWith('abc-123')
  })

  it('returns null when Scryfall returns null (card not found)', async () => {
    mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
    mockRawGetCardById.mockResolvedValueOnce(null)

    const result = await getCardById('nonexistent')

    expect(result).toBeNull()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })
})

// ── getCardsByIds ──────────────────────────────────────────────────────────────

describe('getCardsByIds', () => {
  it('returns empty array for empty identifiers', async () => {
    const result = await getCardsByIds([])
    expect(result).toEqual([])
    expect(mockGetDocs).not.toHaveBeenCalled()
    expect(mockRawGetCardsByIds).not.toHaveBeenCalled()
  })

  it('partitions L1 hits from misses', async () => {
    const card1 = makeScryfallCard({ id: 'id-1', name: 'Card 1' })
    const card2 = makeScryfallCard({ id: 'id-2', name: 'Card 2' })

    // Warm L1 for card1
    mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
    mockRawGetCardById.mockResolvedValueOnce(card1)
    mockSetDoc.mockResolvedValueOnce(undefined)
    await getCardById('id-1')

    vi.clearAllMocks()

    // card2 from Firestore via bulk query
    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([card2]))

    const result = await getCardsByIds([{ id: 'id-1' }, { id: 'id-2' }])

    expect(result).toHaveLength(2)
    expect(result.map(c => c.id)).toContain('id-1')
    expect(result.map(c => c.id)).toContain('id-2')
    // Only card2 needed Firestore lookup
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    expect(mockRawGetCardsByIds).not.toHaveBeenCalled()
  })

  it('uses bulk query for L2 batch reads', async () => {
    const card1 = makeScryfallCard({ id: 'id-1', name: 'Card 1' })
    const card2 = makeScryfallCard({ id: 'id-2', name: 'Card 2' })

    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([card1, card2]))

    const result = await getCardsByIds([{ id: 'id-1' }, { id: 'id-2' }])

    expect(result).toHaveLength(2)
    // Single bulk query instead of individual getDoc calls
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockRawGetCardsByIds).not.toHaveBeenCalled()
  })

  it('passes { name } identifiers directly to Scryfall', async () => {
    const card = makeScryfallCard({ id: 'id-name', name: 'Counterspell' })
    mockRawGetCardsByIds.mockResolvedValueOnce([card])
    mockSetDoc.mockResolvedValue(undefined)

    const result = await getCardsByIds([{ name: 'Counterspell' }])

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Counterspell')
    expect(mockRawGetCardsByIds).toHaveBeenCalledWith([{ name: 'Counterspell' }], undefined)
    // No Firestore reads for name-based lookups
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('calls Scryfall only for L2 misses (not for L2 hits)', async () => {
    const card1 = makeScryfallCard({ id: 'id-cached', name: 'Cached Card' })
    const card2 = makeScryfallCard({ id: 'id-uncached', name: 'Uncached Card' })

    // card1 is in Firestore, card2 is not (missing from snapshot)
    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([card1]))

    // Scryfall returns card2
    mockRawGetCardsByIds.mockResolvedValueOnce([card2])
    mockSetDoc.mockResolvedValue(undefined)

    const result = await getCardsByIds([{ id: 'id-cached' }, { id: 'id-uncached' }])

    expect(result).toHaveLength(2)
    // Only uncached card goes to Scryfall
    expect(mockRawGetCardsByIds).toHaveBeenCalledWith([{ id: 'id-uncached' }], undefined)
  })

  it('writes Scryfall results to L1 and L2', async () => {
    const card = makeScryfallCard({ id: 'id-new', name: 'New Card' })

    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([]))
    mockRawGetCardsByIds.mockResolvedValueOnce([card])

    await getCardsByIds([{ id: 'id-new' }])

    // L2 write via writeBatch (not individual setDoc)
    expect(mockWriteBatch).toHaveBeenCalled()
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-new' }),
      expect.objectContaining({ id: 'id-new', name: 'New Card' }),
    )

    // L1 write: second call should not hit Firestore
    vi.clearAllMocks()
    const result2 = await getCardsByIds([{ id: 'id-new' }])
    expect(result2).toHaveLength(1)
    expect(mockGetDocs).not.toHaveBeenCalled()
    expect(mockRawGetCardsByIds).not.toHaveBeenCalled()
  })

  it('handles mixed id and name identifiers', async () => {
    const card1 = makeScryfallCard({ id: 'id-1', name: 'Card A' })
    const card2 = makeScryfallCard({ id: 'id-2', name: 'Card B' })

    // id-1 from Firestore
    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([card1]))
    // Card B by name from Scryfall
    mockRawGetCardsByIds.mockResolvedValueOnce([card2])
    mockSetDoc.mockResolvedValue(undefined)

    const result = await getCardsByIds([{ id: 'id-1' }, { name: 'Card B' }])

    expect(result).toHaveLength(2)
    expect(mockRawGetCardsByIds).toHaveBeenCalledWith([{ name: 'Card B' }], undefined)
  })

  it('gracefully falls through when Firestore batch read fails', async () => {
    const card = makeScryfallCard({ id: 'id-1', name: 'Card 1' })

    mockGetDocs.mockRejectedValueOnce(new Error('Firestore down'))
    mockRawGetCardsByIds.mockResolvedValueOnce([card])
    mockSetDoc.mockResolvedValue(undefined)

    const result = await getCardsByIds([{ id: 'id-1' }])

    expect(result).toHaveLength(1)
    expect(mockRawGetCardsByIds).toHaveBeenCalledWith([{ id: 'id-1' }], undefined)
  })

  it('fail-fast: skips remaining L2 chunks after first failure', async () => {
    // 35 IDs → 2 chunks (30 + 5). First chunk fails → second chunk should be skipped entirely.
    const ids = Array.from({ length: 35 }, (_, i) => ({ id: `id-${i}` }))
    const cards = ids.map(({ id }) => makeScryfallCard({ id, name: `Card ${id}` }))

    mockGetDocs.mockRejectedValueOnce(new Error('Firestore permissions'))
    mockRawGetCardsByIds.mockResolvedValueOnce(cards)
    mockSetDoc.mockResolvedValue(undefined)

    const result = await getCardsByIds(ids)

    expect(result).toHaveLength(35)
    // Only 1 getDocs call — the second chunk was skipped by fail-fast
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    // All 35 IDs forwarded to Scryfall
    expect(mockRawGetCardsByIds).toHaveBeenCalledWith(ids, undefined)
  })

  it('skips remaining L2 chunks after 3 consecutive all-miss chunks', async () => {
    // 150 IDs → 5 chunks of 30. All chunks return empty.
    // After 3 consecutive all-miss chunks, remaining 2 chunks should be skipped.
    const ids = Array.from({ length: 150 }, (_, i) => ({ id: `id-${i}` }))
    const cards = ids.map(({ id }) => makeScryfallCard({ id, name: `Card ${id}` }))

    // 3 empty snapshots for the first 3 chunks
    mockGetDocs
      .mockResolvedValueOnce(makeQuerySnapshot([]))
      .mockResolvedValueOnce(makeQuerySnapshot([]))
      .mockResolvedValueOnce(makeQuerySnapshot([]))

    mockRawGetCardsByIds.mockResolvedValueOnce(cards)
    mockSetDoc.mockResolvedValue(undefined)

    const result = await getCardsByIds(ids)

    expect(result).toHaveLength(150)
    // Only 3 getDocs calls — remaining 2 chunks skipped by miss-rate early exit
    expect(mockGetDocs).toHaveBeenCalledTimes(3)
    // All 150 IDs forwarded to Scryfall
    expect(mockRawGetCardsByIds).toHaveBeenCalledWith(ids, undefined)
  })

  it('resets miss counter when a chunk has hits', async () => {
    // 150 IDs → 5 chunks of 30.
    // Chunk 1: all miss, Chunk 2: all miss, Chunk 3: has hits → resets counter
    // Chunk 4: all miss, Chunk 5: all miss — only 2 consecutive misses, no early exit
    const ids = Array.from({ length: 150 }, (_, i) => ({ id: `id-${i}` }))
    const hitCard = makeScryfallCard({ id: 'id-60', name: 'Card id-60' })
    const remainingCards = ids
      .filter(({ id }) => id !== 'id-60')
      .map(({ id }) => makeScryfallCard({ id, name: `Card ${id}` }))

    mockGetDocs
      .mockResolvedValueOnce(makeQuerySnapshot([]))       // chunk 1: all miss
      .mockResolvedValueOnce(makeQuerySnapshot([]))       // chunk 2: all miss
      .mockResolvedValueOnce(makeQuerySnapshot([hitCard])) // chunk 3: 1 hit → reset
      .mockResolvedValueOnce(makeQuerySnapshot([]))       // chunk 4: all miss
      .mockResolvedValueOnce(makeQuerySnapshot([]))       // chunk 5: all miss

    mockRawGetCardsByIds.mockResolvedValueOnce(remainingCards)
    mockSetDoc.mockResolvedValue(undefined)

    const result = await getCardsByIds(ids)

    expect(result).toHaveLength(150)
    // All 5 chunks queried — miss counter reset at chunk 3
    expect(mockGetDocs).toHaveBeenCalledTimes(5)
  })

  it('treats stale metadata as L2 miss in bulk reads', async () => {
    const card = makeScryfallCard({ id: 'id-stale', name: 'Stale Card' })
    const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000

    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([card], { metadataAge: THIRTY_ONE_DAYS }))
    mockRawGetCardsByIds.mockResolvedValueOnce([card])
    mockSetDoc.mockResolvedValue(undefined)

    const result = await getCardsByIds([{ id: 'id-stale' }])

    expect(result).toHaveLength(1)
    expect(mockRawGetCardsByIds).toHaveBeenCalledWith([{ id: 'id-stale' }], undefined)
  })
})

// ── onProgress callback ─────────────────────────────────────────────────────

describe('getCardsByIds onProgress', () => {
  it('fires after L1 partition', async () => {
    const card = makeScryfallCard({ id: 'id-1', name: 'Card 1' })

    // Warm L1
    mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
    mockRawGetCardById.mockResolvedValueOnce(card)
    mockSetDoc.mockResolvedValueOnce(undefined)
    await getCardById('id-1')

    vi.clearAllMocks()

    const onProgress = vi.fn()
    const result = await getCardsByIds([{ id: 'id-1' }], onProgress)

    expect(result).toHaveLength(1)
    // Should fire with all resolved from L1
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it('fires after L2 chunk resolves', async () => {
    const card1 = makeScryfallCard({ id: 'id-1', name: 'Card 1' })
    const card2 = makeScryfallCard({ id: 'id-2', name: 'Card 2' })

    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([card1, card2]))

    const onProgress = vi.fn()
    await getCardsByIds([{ id: 'id-1' }, { id: 'id-2' }], onProgress)

    // L1 partition: 0 hits → onProgress(0, 2)
    // L2 chunk: 2 hits → onProgress(2, 2)
    expect(onProgress).toHaveBeenCalledWith(0, 2)
    expect(onProgress).toHaveBeenCalledWith(2, 2)
  })

  it('forwards translated callback to raw Scryfall call for L3', async () => {
    const card = makeScryfallCard({ id: 'id-miss', name: 'Missed Card' })

    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([]))
    mockRawGetCardsByIds.mockImplementation(async (
      _ids: unknown[],
      cb?: (current: number, total: number) => void
    ) => {
      cb?.(1, 1)
      return [card]
    })
    mockSetDoc.mockResolvedValue(undefined)

    const onProgress = vi.fn()
    await getCardsByIds([{ id: 'id-miss' }], onProgress)

    // L1 partition: 0 hits → onProgress(0, 1)
    // L2 chunk: 0 hits → onProgress(0, 1)
    // L3 callback: offset=0 + cur=1 → onProgress(1, 1)
    expect(onProgress).toHaveBeenCalledWith(0, 1)
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it('progress values are monotonically increasing', async () => {
    const card1 = makeScryfallCard({ id: 'id-1', name: 'Card 1' })
    const card2 = makeScryfallCard({ id: 'id-2', name: 'Card 2' })
    const card3 = makeScryfallCard({ id: 'id-3', name: 'Card 3' })

    // card1 in L1
    mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
    mockRawGetCardById.mockResolvedValueOnce(card1)
    mockSetDoc.mockResolvedValueOnce(undefined)
    await getCardById('id-1')

    vi.clearAllMocks()

    // card2 from L2, card3 from Scryfall
    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([card2]))
    mockRawGetCardsByIds.mockImplementation(async (
      _ids: unknown[],
      cb?: (current: number, total: number) => void
    ) => {
      cb?.(1, 1)
      return [card3]
    })
    mockSetDoc.mockResolvedValue(undefined)

    const progressValues: number[] = []
    await getCardsByIds([{ id: 'id-1' }, { id: 'id-2' }, { id: 'id-3' }], (current) => {
      progressValues.push(current)
    })

    // Values should be monotonically non-decreasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]!)
    }
    // Final value should cover all cards
    expect(progressValues[progressValues.length - 1]).toBe(3)
  })
})

// ── L1 eviction ────────────────────────────────────────────────────────────────

describe('L1 cache eviction', () => {
  it('evicts oldest entries when exceeding 500 items', async () => {
    // Fill L1 with 500 cards via getCardById
    for (let i = 0; i < 500; i++) {
      const card = makeScryfallCard({ id: `card-${i}`, name: `Card ${i}` })
      mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
      mockRawGetCardById.mockResolvedValueOnce(card)
      mockSetDoc.mockResolvedValueOnce(undefined)
      await getCardById(`card-${i}`)
    }

    vi.clearAllMocks()

    // Add one more — should evict card-0
    const newCard = makeScryfallCard({ id: 'card-500', name: 'Card 500' })
    mockGetDoc.mockResolvedValueOnce(makeMissingDoc())
    mockRawGetCardById.mockResolvedValueOnce(newCard)
    mockSetDoc.mockResolvedValueOnce(undefined)
    await getCardById('card-500')

    vi.clearAllMocks()

    // card-0 should be evicted — needs Firestore lookup
    mockGetDoc.mockResolvedValueOnce(makeFirestoreDoc(makeScryfallCard({ id: 'card-0' })))
    await getCardById('card-0')
    expect(mockGetDoc).toHaveBeenCalledTimes(1)

    // card-2 should still be in L1 — no Firestore
    // (card-1 was evicted when card-0 was re-added, since cache was already at capacity)
    vi.clearAllMocks()
    await getCardById('card-2')
    expect(mockGetDoc).not.toHaveBeenCalled()
  })
})

// ── l2WriteBatch ─────────────────────────────────────────────────────────────

describe('getCardsByIds L2 batch writes', () => {
  it('uses writeBatch instead of individual setDoc for Scryfall results', async () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      makeScryfallCard({ id: `id-${i}`, name: `Card ${i}` })
    )

    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([]))
    mockRawGetCardsByIds.mockResolvedValueOnce(cards)

    await getCardsByIds(cards.map(c => ({ id: c.id })))

    // Should NOT use individual setDoc for L2 writes
    expect(mockSetDoc).not.toHaveBeenCalled()
    // Should use writeBatch
    expect(mockWriteBatch).toHaveBeenCalled()
    expect(mockBatchSet).toHaveBeenCalledTimes(5)
    expect(mockBatchCommit).toHaveBeenCalled()
  })

  it('chunks large batches into groups of 200', async () => {
    vi.useFakeTimers()
    const cards = Array.from({ length: 850 }, (_, i) =>
      makeScryfallCard({ id: `id-${i}`, name: `Card ${i}` })
    )

    mockGetDocs.mockResolvedValue(makeQuerySnapshot([]))
    mockRawGetCardsByIds.mockResolvedValueOnce(cards)

    await getCardsByIds(cards.map(c => ({ id: c.id })))

    // Flush the fire-and-forget async batches (500ms delay between chunks)
    await vi.advanceTimersByTimeAsync(3000)

    // 850 cards → 5 batches (200 + 200 + 200 + 200 + 50)
    expect(mockWriteBatch).toHaveBeenCalledTimes(5)
    expect(mockBatchCommit).toHaveBeenCalledTimes(5)
    expect(mockBatchSet).toHaveBeenCalledTimes(850)

    vi.useRealTimers()
  })

  it('skips L2 batch writes for large result sets (>2000)', async () => {
    const cards = Array.from({ length: 2001 }, (_, i) =>
      makeScryfallCard({ id: `id-${i}`, name: `Card ${i}` })
    )

    mockGetDocs.mockResolvedValue(makeQuerySnapshot([]))
    mockRawGetCardsByIds.mockResolvedValueOnce(cards)

    await getCardsByIds(cards.map(c => ({ id: c.id })))

    // L2 batch writes should be completely skipped
    expect(mockWriteBatch).not.toHaveBeenCalled()
    expect(mockBatchCommit).not.toHaveBeenCalled()
    expect(mockBatchSet).not.toHaveBeenCalled()
  })

  it('stops L2 batch writes on first commit failure', async () => {
    vi.useFakeTimers()
    const cards = Array.from({ length: 500 }, (_, i) =>
      makeScryfallCard({ id: `id-${i}`, name: `Card ${i}` })
    )

    mockGetDocs.mockResolvedValue(makeQuerySnapshot([]))
    mockRawGetCardsByIds.mockResolvedValueOnce(cards)
    // First batch commit fails
    mockBatchCommit.mockRejectedValueOnce(new Error('Write stream exhausted'))

    await getCardsByIds(cards.map(c => ({ id: c.id })))

    // Flush timers to let fire-and-forget complete
    await vi.advanceTimersByTimeAsync(3000)

    // Only 1 commit attempted — aborted after first failure
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('does not block return while batches commit', async () => {
    const card = makeScryfallCard({ id: 'id-1', name: 'Card 1' })

    // Make batch commit hang (never resolve)
    mockBatchCommit.mockReturnValue(new Promise(() => {}))
    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([]))
    mockRawGetCardsByIds.mockResolvedValueOnce([card])

    // Should return results without waiting for batch commit
    const result = await getCardsByIds([{ id: 'id-1' }])

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('id-1')
  })
})
