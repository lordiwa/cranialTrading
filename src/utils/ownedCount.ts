import type { Card } from '../types/card'

/**
 * Builds a lowercase-name → total-quantity Map from a card collection.
 * Used by SearchView for O(1) owned-count lookup per rendered result.
 *
 * Pure function — no Vue reactivity, no stores, no Firestore.
 * Zero-quantity entries are preserved (they convey presence info).
 */
export const buildOwnedCountMap = (
  cards: Pick<Card, 'name' | 'quantity'>[],
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const card of cards) {
    const key = card.name.toLowerCase()
    map.set(key, (map.get(key) ?? 0) + card.quantity)
  }
  return map
}
