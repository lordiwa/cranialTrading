/**
 * TASK-247 tanda 3/5 — the CLIENT side of the public query layer.
 *
 * The server function is only half the fix. Today the public profile calls
 * `getUserPublicCardsPage` (60 whole public_cards documents at a time) and
 * `searchUserPublicCards` (a Firestore PREFIX query capped at 50), then
 * filters colours over whatever happens to be in memory — which is how a
 * profile with 1,412 black documents reports 36. This is the client entry
 * point that replaces both: one callable, a true `total`, and a row that
 * carries only what the grid draws.
 *
 * Two things are asserted here that are easy to get wrong and expensive to
 * discover in production:
 *   - `image` never travels. The row has an `s` (scryfallId) and the client
 *     derives the URL with cardImageProxyUrl (TASK-241). ~90 B/row x 60 rows
 *     is 5.4 KB per page saved against a 160 KB boot budget on slow 4G.
 *   - `total: null` is a real value, not an error. It is what the server
 *     answers while the index is mid-rebuild, and it must survive the
 *     mapping intact — collapsing it to 0 would put "0 results" on screen
 *     over a full grid, and collapsing it to `cards.length` would recreate
 *     exactly the lie this ticket exists to end.
 *
 * Rewiring UserProfileView / usePublicProfileCards onto this is tanda 4.
 */

const mockCallable = vi.fn()
const mockHttpsCallable = vi.fn(() => mockCallable)

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}))

vi.mock('firebase/app', () => ({ getApp: () => ({}) }))
vi.mock('firebase/auth', () => ({ onIdTokenChanged: () => () => {} }))
vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('@/services/firestore', () => ({ db: {} }))

import { queryPublicCardIndex } from '@/services/cloudFunctions'
import type { PublicIndexCard } from '@/services/cloudFunctions'
import { publicIndexCardToCard, queryUserPublicCardIndex } from '@/services/publicCards'

function makeRow(overrides: Partial<PublicIndexCard> = {}): PublicIndexCard {
  return {
    s: '00000000-0000-4000-8000-000000000001',
    i: 'card-1',
    n: 'Marauding Blight-Priest',
    q: 2,
    p: 1.5,
    st: 'sale',
    f: false,
    cn: 'NM',
    sc: 'M21',
    ed: 'Core Set 2021',
    co: ['B'],
    r: 'u',
    t: 'Creature — Human Cleric',
    ...overrides,
  }
}

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    cards: [makeRow()],
    total: 1412,
    page: 0,
    pageSize: 60,
    hasMore: true,
    facets: { color: { B: 1412, G: 1161 }, status: {}, rarity: {}, type: {} },
    indexState: {
      schemaVersion: 1,
      totalChunks: 32,
      count: 6647,
      reconciling: false,
      partial: false,
      missing: 474,
    },
    ...overrides,
  }
}

describe('queryPublicCardIndex (callable client)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('targets the queryPublicCardIndex function', async () => {
    mockCallable.mockResolvedValue({ data: makeResponse() })
    await queryPublicCardIndex({ userId: 'seller-1', filters: {}, page: 0, pageSize: 60 })
    expect(mockHttpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      'queryPublicCardIndex',
      expect.anything()
    )
  })

  it('passes the seller userId through — this is a PUBLIC profile, not the caller', async () => {
    mockCallable.mockResolvedValue({ data: makeResponse() })
    await queryPublicCardIndex({
      userId: 'seller-1',
      filters: { color: ['B'], search: 'blight' },
      page: 2,
      pageSize: 60,
    })
    expect(mockCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'seller-1',
        filters: { color: ['B'], search: 'blight' },
        page: 2,
      })
    )
  })

  it('returns the response payload unchanged, including a null total', async () => {
    mockCallable.mockResolvedValue({ data: makeResponse({ total: null }) })
    const res = await queryPublicCardIndex({ userId: 'seller-1', filters: {}, page: 0, pageSize: 60 })
    expect(res.total).toBeNull()
    expect(res.indexState.count).toBe(6647)
  })

  it('surfaces an invalid-argument rejection with its message', async () => {
    mockCallable.mockRejectedValue({
      code: 'functions/invalid-argument',
      message: 'userId must be a string of 1-128 characters',
    })
    await expect(
      queryPublicCardIndex({ userId: 'a/b', filters: {}, page: 0, pageSize: 60 })
    ).rejects.toThrow(/userId/)
  })
})

describe('publicIndexCardToCard', () => {
  it('derives the image from the scryfallId instead of shipping a URL', () => {
    const card = publicIndexCardToCard(makeRow())
    expect(card.image).toBe('/img/thumb/front/00000000-0000-4000-8000-000000000001.webp')
  })

  it('maps every field the grid and the filters read', () => {
    const card = publicIndexCardToCard(makeRow())
    expect(card).toMatchObject({
      id: 'card-1',
      scryfallId: '00000000-0000-4000-8000-000000000001',
      name: 'Marauding Blight-Priest',
      edition: 'Core Set 2021',
      setCode: 'M21',
      quantity: 2,
      condition: 'NM',
      foil: false,
      price: 1.5,
      status: 'sale',
      public: true,
      colors: ['B'],
      type_line: 'Creature — Human Cleric',
    })
  })

  it('expands the single-character rarity back to the name the UI shows', () => {
    expect(publicIndexCardToCard(makeRow({ r: 'c' })).rarity).toBe('common')
    expect(publicIndexCardToCard(makeRow({ r: 'u' })).rarity).toBe('uncommon')
    expect(publicIndexCardToCard(makeRow({ r: 'r' })).rarity).toBe('rare')
    expect(publicIndexCardToCard(makeRow({ r: 'm' })).rarity).toBe('mythic')
    expect(publicIndexCardToCard(makeRow({ r: '' })).rarity).toBeUndefined()
  })

  it('maps an empty setCode to undefined so cardEnrichment still patches it', () => {
    expect(publicIndexCardToCard(makeRow({ sc: '' })).setCode).toBeUndefined()
  })

  it('keeps a split card name intact, // included', () => {
    const card = publicIndexCardToCard(
      makeRow({ n: 'Blightreaper Thallid // Blightsower Thallid' })
    )
    expect(card.name).toBe('Blightreaper Thallid // Blightsower Thallid')
  })
})

describe('queryUserPublicCardIndex', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns mapped Cards plus the true total, not the page length', async () => {
    mockCallable.mockResolvedValue({ data: makeResponse() })
    const page = await queryUserPublicCardIndex('seller-1', { filters: { color: ['B'] } })
    expect(page.cards).toHaveLength(1)
    expect(page.cards[0]!.name).toBe('Marauding Blight-Priest')
    // The whole point of the ticket: delivered !== total.
    expect(page.total).toBe(1412)
    expect(page.cards.length).not.toBe(page.total)
  })

  it('preserves a null total from a mid-rebuild index rather than inventing one', async () => {
    mockCallable.mockResolvedValue({
      data: makeResponse({ total: null, indexState: { ...makeResponse().indexState, partial: true } }),
    })
    const page = await queryUserPublicCardIndex('seller-1', {})
    expect(page.total).toBeNull()
    expect(page.indexState.partial).toBe(true)
  })

  it('defaults to page 0 and the 60-row page size the profile already scrolls by', async () => {
    mockCallable.mockResolvedValue({ data: makeResponse() })
    await queryUserPublicCardIndex('seller-1', {})
    expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({ page: 0, pageSize: 60 }))
  })

  it('forwards filters, sort, page and mode', async () => {
    mockCallable.mockResolvedValue({ data: makeResponse() })
    await queryUserPublicCardIndex('seller-1', {
      filters: { search: 'blight' },
      sort: { field: 'price', direction: 'desc' },
      page: 3,
      pageSize: 120,
      mode: 'facets',
    })
    expect(mockCallable).toHaveBeenCalledWith({
      userId: 'seller-1',
      filters: { search: 'blight' },
      sort: { field: 'price', direction: 'desc' },
      page: 3,
      pageSize: 120,
      mode: 'facets',
    })
  })

  it('carries the facets and indexState through untouched', async () => {
    mockCallable.mockResolvedValue({ data: makeResponse() })
    const page = await queryUserPublicCardIndex('seller-1', {})
    expect(page.facets.color.B).toBe(1412)
    expect(page.indexState.missing).toBe(474)
    expect(page.indexState.totalChunks).toBe(32)
  })
})
