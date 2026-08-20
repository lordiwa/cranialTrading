/**
 * TASK-247 tanda 4 — the public profile's filter/search/pagination state,
 * backed by the public card INDEX (Cloud Function) instead of by whatever
 * ~60 documents happened to be in memory.
 *
 * Everything asserted here is a property the OLD path could not hold:
 *   - `total` is over the seller's whole public collection, never cards.length;
 *   - the colour vocabulary is OR-INCLUSIVE LETTERS (W/U/B/R/G/C), so a B/G
 *     card answers to both B and G and there is no 'Multicolor' bucket
 *     (Rafael, 2026-08-19 — decided, not up for relitigation);
 *   - a mid-rebuild index (`partial`) yields NO number at all rather than a
 *     confident wrong one;
 *   - a failed query is distinguishable from an empty profile.
 */
import { nextTick, ref } from 'vue'

vi.mock('@/services/publicCards', () => ({
  queryUserPublicCardIndex: vi.fn(),
  getUserPublicCardStatusCounts: vi.fn(),
}))

// eslint-disable-next-line import/first
import { getUserPublicCardStatusCounts, type PublicCardIndexPage, queryUserPublicCardIndex } from '@/services/publicCards'
// eslint-disable-next-line import/first
import { usePublicProfileIndex } from '@/composables/usePublicProfileIndex'
// eslint-disable-next-line import/first
import type { Card } from '@/types/card'

const mockQuery = vi.mocked(queryUserPublicCardIndex)
const mockCounts = vi.mocked(getUserPublicCardStatusCounts)

function makeCard(i: number, overrides: Partial<Card> = {}): Card {
  return {
    id: `card-${i}`,
    scryfallId: `scry-${i}`,
    name: `Card ${i}`,
    edition: 'Test Set',
    quantity: 1,
    condition: 'NM',
    foil: false,
    price: 1,
    image: `/img/thumb/front/scry-${i}.webp`,
    status: 'sale',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Card
}

function makePage(overrides: Partial<PublicCardIndexPage> = {}): PublicCardIndexPage {
  return {
    cards: [makeCard(1)],
    total: 1,
    page: 0,
    pageSize: 60,
    hasMore: false,
    facets: { color: {}, status: {}, rarity: {}, type: {} },
    indexState: {
      schemaVersion: 1,
      totalChunks: 1,
      count: 1,
      reconciling: false,
      partial: false,
      missing: 0,
    },
    ...overrides,
  }
}

/** Lets every pending microtask (and the composable's own awaits) settle. */
async function flush(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  mockQuery.mockReset()
  mockCounts.mockReset()
  mockCounts.mockResolvedValue({ sale: 0, trade: 0 })
  mockQuery.mockResolvedValue(makePage())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePublicProfileIndex — loading', () => {
  it('queries the index for the seller and populates cards', async () => {
    mockQuery.mockResolvedValue(makePage({ cards: [makeCard(1), makeCard(2)], total: 2 }))
    const userId = ref<string | null>('seller-1')
    const profile = usePublicProfileIndex(userId)

    await profile.loadFirstPage()

    expect(mockQuery).toHaveBeenCalledWith('seller-1', expect.objectContaining({ page: 0 }))
    expect(profile.cards.value).toHaveLength(2)
  })

  it('reports the collection-wide total, not the size of the page it received', async () => {
    mockQuery.mockResolvedValue(makePage({ cards: [makeCard(1), makeCard(2)], total: 1488 }))
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))

    await profile.loadFirstPage()

    expect(profile.total.value).toBe(1488)
    expect(profile.cards.value).toHaveLength(2)
  })

  it('appends the next page on loadMore without dropping the active filters', async () => {
    mockQuery.mockResolvedValue(makePage({ cards: [makeCard(1)], total: 2, hasMore: true }))
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()

    profile.selectedColors.value = new Set(['B'])
    await flush()
    mockQuery.mockResolvedValue(makePage({ cards: [makeCard(2)], total: 2, page: 1, hasMore: false }))

    await profile.loadMore()

    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1]
    expect(lastCall[1]?.page).toBe(1)
    expect(lastCall[1]?.filters?.color).toEqual(['B'])
    expect(profile.cards.value.map(c => c.id)).toEqual(['card-1', 'card-2'])
  })

  it('discards a response that belongs to a profile the visitor already left', async () => {
    let resolveFirst: ((p: PublicCardIndexPage) => void) | undefined
    mockQuery.mockImplementationOnce(() => new Promise<PublicCardIndexPage>(res => { resolveFirst = res }))
    const userId = ref<string | null>('seller-1')
    const profile = usePublicProfileIndex(userId)

    const inFlight = profile.loadFirstPage()
    userId.value = 'seller-2'
    mockQuery.mockResolvedValue(makePage({ cards: [makeCard(9)], total: 1 }))
    await profile.loadFirstPage()

    resolveFirst?.(makePage({ cards: [makeCard(1), makeCard(2)], total: 2 }))
    await inFlight
    await flush()

    expect(profile.cards.value.map(c => c.id)).toEqual(['card-9'])
  })
})

describe('usePublicProfileIndex — colour chips are OR-inclusive letters', () => {
  it('sends the selected colours as letters, not useCardFilter category names', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()

    profile.selectedColors.value = new Set(['B'])
    await flush()

    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1]
    expect(lastCall[1]?.filters?.color).toEqual(['B'])
  })

  it('sends no colour filter at all when every colour is selected', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()

    expect(mockQuery.mock.calls[0][1]?.filters?.color).toBeUndefined()
  })

  it('offers no Multicolor chip — a B/G card answers to B and to G', () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))

    expect(profile.colorLetters).toEqual(['W', 'U', 'B', 'R', 'G', 'C'])
    expect(profile.colorLetters).not.toContain('Multicolor')
    expect(profile.colorLetters).not.toContain('Lands')
  })

  it('re-queries the server when a chip changes instead of filtering in memory', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()
    const callsBefore = mockQuery.mock.calls.length

    profile.selectedRarities.value = new Set(['rare'])
    await flush()

    expect(mockQuery.mock.calls.length).toBe(callsBefore + 1)
  })
})

describe('usePublicProfileIndex — search', () => {
  it('sends a debounced substring term to the server', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()

    profile.filterQuery.value = 'blight'
    await flush()
    vi.advanceTimersByTime(300)
    await flush()

    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1]
    expect(lastCall[1]?.filters?.search).toBe('blight')
  })

  it('ignores a term below the 2-character minimum', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()
    const callsBefore = mockQuery.mock.calls.length

    profile.filterQuery.value = 'x'
    await flush()
    vi.advanceTimersByTime(300)
    await flush()

    expect(mockQuery.mock.calls.length).toBe(callsBefore)
  })
})

describe('usePublicProfileIndex — states the UI has to be able to show', () => {
  it('exposes partial and refuses to name a total while the index is rebuilding', async () => {
    mockQuery.mockResolvedValue(makePage({
      cards: [makeCard(1)],
      total: null,
      facets: null,
      indexState: { schemaVersion: 1, totalChunks: 32, count: 0, reconciling: true, partial: true, missing: 0 },
    }))
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))

    await profile.loadFirstPage()

    expect(profile.partial.value).toBe(true)
    expect(profile.total.value).toBeNull()
  })

  it('exposes how many cards a colour filter dropped for having no colour data', async () => {
    mockQuery.mockResolvedValue(makePage({
      indexState: { schemaVersion: 1, totalChunks: 1, count: 100, reconciling: false, partial: false, missing: 474 },
    }))
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))

    await profile.loadFirstPage()

    expect(profile.missing.value).toBe(474)
  })

  it('raises an error flag so a failed query is not rendered as an empty profile', async () => {
    mockQuery.mockRejectedValue(new Error('internal'))
    const onError = vi.fn()
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'), { onError })

    await profile.loadFirstPage()

    expect(profile.error.value).toBe(true)
    expect(profile.cards.value).toEqual([])
    expect(onError).toHaveBeenCalled()
  })

  it('clears the error flag on the next successful query', async () => {
    mockQuery.mockRejectedValueOnce(new Error('internal'))
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()
    expect(profile.error.value).toBe(true)

    mockQuery.mockResolvedValue(makePage())
    await profile.loadFirstPage()

    expect(profile.error.value).toBe(false)
  })
})
