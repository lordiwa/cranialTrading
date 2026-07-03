/**
 * Unit tests for the anonymous login-page catalog search (TASK-084).
 *
 * applyPricedFirstFilter: STRICT priced-first rule from CLAUDE.md "Price
 * Filter Logic" — if ANY result has prices.usd > 0, show ONLY priced cards;
 * if NONE have a price, show all (avoids spamming unpriced N/A results).
 *
 * toMinimalResult: normalizes a ScryfallCard into the minimal shape the
 * login-page grid renders (id, name, imageUrl, priceUsd), handling split
 * cards (card_faces) and missing images/prices.
 */

import { applyPricedFirstFilter, formatCardMeta, isSearchActive, mapSellers, shouldShowNoResults, toMinimalResult, toSellerResult } from '@/utils/loginCardSearch'
import type { ScryfallCard } from '@/services/scryfall'
import type { PublicCardResult } from '@/services/publicCardSearch'

const makeCard = (overrides: Partial<ScryfallCard> = {}): ScryfallCard => ({
  id: 'c1',
  name: 'Lightning Bolt',
  set: 'lea',
  set_name: 'Limited Edition Alpha',
  collector_number: '1',
  rarity: 'common',
  type_line: 'Instant',
  ...overrides,
})

describe('applyPricedFirstFilter', () => {
  it('returns only priced cards when at least one has prices.usd > 0', () => {
    const cards = [
      makeCard({ id: 'a', prices: { usd: '1.50' } }),
      makeCard({ id: 'b' }),
      makeCard({ id: 'c', prices: { usd: '0' } }),
    ]

    const result = applyPricedFirstFilter(cards)

    expect(result.map(c => c.id)).toEqual(['a'])
  })

  it('returns all cards when none have a price', () => {
    const cards = [
      makeCard({ id: 'a' }),
      makeCard({ id: 'b', prices: { usd: '0' } }),
      makeCard({ id: 'c', prices: { usd: undefined } }),
    ]

    const result = applyPricedFirstFilter(cards)

    expect(result.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('treats non-numeric prices as unpriced', () => {
    const cards = [makeCard({ id: 'a', prices: { usd: 'N/A' } })]

    expect(applyPricedFirstFilter(cards).map(c => c.id)).toEqual(['a'])
  })

  it('preserves relative order of the priced subset', () => {
    const cards = [
      makeCard({ id: 'a', prices: { usd: '5.00' } }),
      makeCard({ id: 'b' }),
      makeCard({ id: 'c', prices: { usd: '2.00' } }),
    ]

    expect(applyPricedFirstFilter(cards).map(c => c.id)).toEqual(['a', 'c'])
  })

  it('returns [] for empty input', () => {
    expect(applyPricedFirstFilter([])).toEqual([])
  })
})

describe('toMinimalResult', () => {
  it('maps a normal card with image and price', () => {
    const card = makeCard({
      id: 'c1',
      name: 'Lightning Bolt',
      image_uris: { normal: 'https://example.com/bolt.jpg' },
      prices: { usd: '3.25' },
    })

    expect(toMinimalResult(card)).toEqual({
      id: 'c1',
      name: 'Lightning Bolt',
      imageUrl: 'https://example.com/bolt.jpg',
      priceUsd: 3.25,
      setName: 'Limited Edition Alpha',
      typeLine: 'Instant',
    })
  })

  it('includes setName and typeLine for the results grid "set · type" line', () => {
    const card = makeCard({ id: 'c7', set_name: 'Lorwyn Eclipsed', type_line: 'Legendary Creature — Human Wizard' })

    const result = toMinimalResult(card)

    expect(result.setName).toBe('Lorwyn Eclipsed')
    expect(result.typeLine).toBe('Legendary Creature — Human Wizard')
  })

  it('falls back to the first card_face image for split cards', () => {
    const card = makeCard({
      id: 'c2',
      name: 'Fire // Ice',
      image_uris: undefined,
      card_faces: [
        { name: 'Fire', image_uris: { normal: 'https://example.com/fire.jpg' } },
        { name: 'Ice', image_uris: { normal: 'https://example.com/ice.jpg' } },
      ],
    })

    expect(toMinimalResult(card).imageUrl).toBe('https://example.com/fire.jpg')
  })

  it('returns an empty imageUrl when no image is available anywhere', () => {
    const card = makeCard({ id: 'c3', image_uris: undefined, card_faces: undefined })

    expect(toMinimalResult(card).imageUrl).toBe('')
  })

  it('returns priceUsd null when prices.usd is missing', () => {
    const card = makeCard({ id: 'c4', prices: undefined })

    expect(toMinimalResult(card).priceUsd).toBeNull()
  })

  it('returns priceUsd null for "0" or non-numeric prices', () => {
    expect(toMinimalResult(makeCard({ id: 'c5', prices: { usd: '0' } })).priceUsd).toBeNull()
    expect(toMinimalResult(makeCard({ id: 'c6', prices: { usd: 'N/A' } })).priceUsd).toBeNull()
  })
})

describe('isSearchActive', () => {
  it('returns false for an empty query', () => {
    expect(isSearchActive('')).toBe(false)
  })

  it('returns false for a whitespace-only query', () => {
    expect(isSearchActive('   ')).toBe(false)
  })

  it('returns true for a query with non-whitespace content', () => {
    expect(isSearchActive('bolt')).toBe(true)
  })

  it('returns true for a query with leading/trailing whitespace around content', () => {
    expect(isSearchActive('  lightning bolt  ')).toBe(true)
  })
})

describe('shouldShowNoResults', () => {
  it('returns false while loading, even with 0 results for the current query', () => {
    expect(shouldShowNoResults({ loading: true, query: 'bolt', lastSearchedQuery: 'bolt', resultsCount: 0 })).toBe(false)
  })

  it('returns false for a query that has not been searched yet (regression: typing flash)', () => {
    // User typed "b" but no search ran yet (lastSearchedQuery is stale from a prior search, or empty)
    expect(shouldShowNoResults({ loading: false, query: 'b', lastSearchedQuery: '', resultsCount: 0 })).toBe(false)
    expect(shouldShowNoResults({ loading: false, query: 'bolt', lastSearchedQuery: 'bol', resultsCount: 0 })).toBe(false)
  })

  it('returns true once a search has completed for the current query with 0 results', () => {
    expect(shouldShowNoResults({ loading: false, query: 'asdfghjkl', lastSearchedQuery: 'asdfghjkl', resultsCount: 0 })).toBe(true)
  })

  it('returns false when results exist for the current query', () => {
    expect(shouldShowNoResults({ loading: false, query: 'bolt', lastSearchedQuery: 'bolt', resultsCount: 3 })).toBe(false)
  })

  it('returns false for an empty/whitespace-only query', () => {
    expect(shouldShowNoResults({ loading: false, query: '', lastSearchedQuery: '', resultsCount: 0 })).toBe(false)
    expect(shouldShowNoResults({ loading: false, query: '   ', lastSearchedQuery: '   ', resultsCount: 0 })).toBe(false)
  })
})

describe('formatCardMeta', () => {
  it('joins set name and type line with a middle dot', () => {
    expect(formatCardMeta('Lorwyn Eclipsed', 'Instant')).toBe('Lorwyn Eclipsed · Instant')
  })

  it('omits the separator when setName is missing (regression: bare leading "· Instant")', () => {
    expect(formatCardMeta(undefined, 'Instant')).toBe('Instant')
    expect(formatCardMeta(null, 'Instant')).toBe('Instant')
    expect(formatCardMeta('', 'Instant')).toBe('Instant')
    expect(formatCardMeta('   ', 'Instant')).toBe('Instant')
  })

  it('omits the separator when typeLine is missing', () => {
    expect(formatCardMeta('Lorwyn Eclipsed', undefined)).toBe('Lorwyn Eclipsed')
    expect(formatCardMeta('Lorwyn Eclipsed', '')).toBe('Lorwyn Eclipsed')
  })

  it('returns an empty string when both are missing', () => {
    expect(formatCardMeta(undefined, undefined)).toBe('')
    expect(formatCardMeta('', '')).toBe('')
  })
})

/**
 * TASK-085: pure mapping for the anonymous landing's "Quién la vende"
 * section — turns a raw public_cards search hit into the minimal shape
 * the seller row renders (username, avatar, status, price).
 */
const makePublicCardResult = (overrides: Partial<PublicCardResult> = {}): PublicCardResult => ({
  id: 'doc-1',
  cardName: 'Lightning Bolt',
  userId: 'user-a',
  username: 'alice',
  status: 'sale',
  price: 1.5,
  ...overrides,
})

describe('toSellerResult', () => {
  it('maps username, cardName, avatar, status and price from a public card result', () => {
    const card = makePublicCardResult({ cardName: 'Lightning Bolt', username: 'alice', avatarUrl: 'https://example.com/a.png', status: 'trade', price: 2.5 })

    expect(toSellerResult(card)).toEqual({
      id: 'doc-1',
      cardName: 'Lightning Bolt',
      username: 'alice',
      avatarUrl: 'https://example.com/a.png',
      status: 'trade',
      price: 2.5,
    })
  })

  // Review fix (M1): the prefix query in searchPublicCards can return a
  // different card name than what the user searched for. Without cardName
  // on the row, there's no way to tell which card a seller is selling.
  it('defaults cardName to empty string when missing', () => {
    expect(toSellerResult(makePublicCardResult({ cardName: undefined })).cardName).toBe('')
  })

  it('returns null price when price is missing (renders no price tag)', () => {
    expect(toSellerResult(makePublicCardResult({ price: undefined })).price).toBeNull()
  })

  it('returns null price when price is 0 (renders no price tag)', () => {
    expect(toSellerResult(makePublicCardResult({ price: 0 })).price).toBeNull()
  })

  it('returns null avatarUrl when missing (component falls back to generated avatar)', () => {
    expect(toSellerResult(makePublicCardResult({ avatarUrl: undefined })).avatarUrl).toBeNull()
  })

  it('defaults username to empty string when missing', () => {
    expect(toSellerResult(makePublicCardResult({ username: undefined })).username).toBe('')
  })
})

describe('mapSellers', () => {
  it('maps every card in the list', () => {
    const cards = [
      makePublicCardResult({ id: 'a', username: 'alice' }),
      makePublicCardResult({ id: 'b', username: 'bob' }),
    ]

    expect(mapSellers(cards).map(s => s.username)).toEqual(['alice', 'bob'])
  })

  it('returns [] for an empty list', () => {
    expect(mapSellers([])).toEqual([])
  })
})
