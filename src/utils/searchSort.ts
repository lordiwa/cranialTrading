/**
 * Pure helpers for the /search v2.1 sort selector (TASK-108).
 * Maps a user-facing sort option to the Scryfall `order`/`dir` query params.
 * Scryfall-only: does not apply to the collection or other-users sections.
 */

export type SearchSortOption = 'popular' | 'name' | 'price-asc' | 'price-desc'

export interface ScryfallSortParams {
  order: 'edhrec' | 'name' | 'usd' | 'released'
  dir?: 'asc' | 'desc'
}

/** Current behavior when no sort is selected: newest printings first. */
export const DEFAULT_SORT_PARAMS: ScryfallSortParams = { order: 'released', dir: 'desc' }

/**
 * Builds the Scryfall order/dir params for a given sort option.
 * Undefined (no selection) preserves today's default (released desc).
 */
export function buildSortParams(sort: SearchSortOption | undefined): ScryfallSortParams {
  switch (sort) {
    case 'popular':
      return { order: 'edhrec' }
    case 'name':
      return { order: 'name' }
    case 'price-asc':
      return { order: 'usd', dir: 'asc' }
    case 'price-desc':
      return { order: 'usd', dir: 'desc' }
    default:
      return DEFAULT_SORT_PARAMS
  }
}

/**
 * Whether the store's existing priced-first post-sort (searchSections.sortPricedFirst)
 * should run on top of Scryfall's ordering (2026-07-16 decision, TASK-108).
 * Only true for the default/no-selection case, which must stay byte-identical to the
 * pre-TASK-108 behavior. An explicit user sort choice is respected as-is — Scryfall's
 * order is not re-shuffled.
 */
export function shouldApplyPricedFirst(sort: SearchSortOption | undefined): boolean {
  return sort === undefined
}
