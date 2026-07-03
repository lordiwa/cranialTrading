/**
 * Pure helpers for the anonymous catalog search embedded in LoginView (TASK-084).
 */

import type { ScryfallCard } from '../services/scryfall'
import type { PublicCardResult } from '../services/publicCardSearch'

const parseUsd = (usd?: string | null): number | null => {
  const value = parseFloat(usd ?? '')
  return value > 0 ? value : null
}

/**
 * STRICT priced-first filter (CLAUDE.md "Price Filter Logic"):
 * if ANY result has prices.usd > 0, show ONLY priced cards;
 * if NONE have a price, show all (avoids a wall of N/A results).
 */
export function applyPricedFirstFilter(cards: ScryfallCard[]): ScryfallCard[] {
  const priced = cards.filter(card => parseUsd(card.prices?.usd) !== null)
  return priced.length > 0 ? priced : cards
}

export interface MinimalCardResult {
  id: string
  name: string
  imageUrl: string
  priceUsd: number | null
  setName: string
  typeLine: string
}

/**
 * Normalizes a ScryfallCard into the minimal shape the login-page grid
 * renders. Handles split cards (falls back to the first face's image) and
 * missing images/prices.
 */
export function toMinimalResult(card: ScryfallCard): MinimalCardResult {
  return {
    id: card.id,
    name: card.name,
    imageUrl: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? '',
    priceUsd: parseUsd(card.prices?.usd),
    setName: card.set_name,
    typeLine: card.type_line,
  }
}

/**
 * Marketplace landing (TASK-086): the body toggles between the idle
 * (hero/marketing) section and the active results grid based purely on
 * whether the search query has non-whitespace content.
 */
export function isSearchActive(query: string): boolean {
  return query.trim().length > 0
}

export interface NoResultsGateInput {
  loading: boolean
  query: string
  lastSearchedQuery: string
  resultsCount: number
}

/**
 * Review fix (MEDIUM-1): `active` flips true on the first keystroke, but a
 * search only actually runs on submit/Enter/chip-click. Without this gate,
 * the results grid showed "no results" for a query that was never
 * searched. Only show "no results" once a search has genuinely completed
 * for the CURRENT query (not loading, not stale, not still-typing).
 */
export function shouldShowNoResults({ loading, query, lastSearchedQuery, resultsCount }: NoResultsGateInput): boolean {
  return !loading && resultsCount === 0 && isSearchActive(query) && lastSearchedQuery === query
}

/**
 * Joins a card's set name and type line for the results grid's
 * "set · type" line, guarding against a bare leading/trailing separator
 * (e.g. "· Instant") when either piece is missing or blank.
 */
export function formatCardMeta(setName: string | null | undefined, typeLine: string | null | undefined): string {
  return [setName, typeLine].filter((part): part is string => !!part && part.trim().length > 0).join(' · ')
}

export interface SellerResult {
  id: string
  cardName: string
  username: string
  avatarUrl: string | null
  status: string
  price: number | null
}

/**
 * TASK-085: normalizes a raw public_cards search hit into the minimal shape
 * the landing "Quién la vende" section renders. Price is nulled out when
 * missing/zero so the template can hide the price tag instead of showing
 * "$0.00" (mirrors toMinimalResult's priceUsd handling above).
 *
 * Review fix (M1): includes cardName — the prefix query in searchPublicCards
 * can return a different card than the exact term searched, so the row must
 * say which card a seller is selling.
 */
export function toSellerResult(card: PublicCardResult): SellerResult {
  return {
    id: card.id,
    cardName: card.cardName ?? '',
    username: card.username ?? '',
    avatarUrl: card.avatarUrl ?? null,
    status: card.status ?? '',
    price: typeof card.price === 'number' && card.price > 0 ? card.price : null,
  }
}

export function mapSellers(cards: PublicCardResult[]): SellerResult[] {
  return cards.map(toSellerResult)
}
