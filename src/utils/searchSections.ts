/**
 * Pure helpers for the /search results sections (TASK-075).
 */

import type { Card } from '../types/card'
import type { ScryfallCard } from '../services/scryfall'

/**
 * In-memory filter for the "In your collection" section:
 * case-insensitive substring match on card name, capped at `max`.
 */
export function filterCollectionByTerm(cards: Card[], term: string, max = 12): Card[] {
  const normalized = term.trim().toLowerCase()
  if (normalized.length < 2) return []

  return cards
    .filter(card => card.name.toLowerCase().includes(normalized))
    .slice(0, max)
}

const hasPrice = (card: ScryfallCard): boolean => {
  const usd = parseFloat(card.prices?.usd ?? '')
  if (usd > 0) return true
  const usdFoil = parseFloat(card.prices?.usd_foil ?? '')
  return usdFoil > 0
}

/**
 * Stable partition of Scryfall catalog results: priced printings (usd > 0,
 * or usd_foil for foil-only printings) first, the unpriced tail after.
 * Relative order within each group is preserved (newest-first from the API).
 */
export function sortPricedFirst(cards: ScryfallCard[]): ScryfallCard[] {
  const priced: ScryfallCard[] = []
  const unpriced: ScryfallCard[] = []
  for (const card of cards) {
    (hasPrice(card) ? priced : unpriced).push(card)
  }
  return [...priced, ...unpriced]
}
