/**
 * Pure helpers for the /search v2.1 per-page selector + results-range label (TASK-108).
 *
 * Scryfall paginates fixed at 175 cards/request with no page-size param, so
 * "per page" is resolved client-side by slicing whatever has already been
 * fetched — it does not trigger additional network requests.
 */

export type SearchPerPage = 25 | 50 | 100

export const PER_PAGE_OPTIONS: SearchPerPage[] = [25, 50, 100]
export const DEFAULT_PER_PAGE: SearchPerPage = 25

/** Client-side slice of `items` for the given 1-indexed page and page size. */
export function paginateResults<T>(items: T[], page: number, perPage: number): T[] {
  if (perPage <= 0) return items
  const safePage = Math.max(1, Math.floor(page))
  const start = (safePage - 1) * perPage
  return items.slice(start, start + perPage)
}

/** Number of local pages available over the already-loaded items. */
export function totalLoadedPages(loadedCount: number, perPage: number): number {
  if (perPage <= 0 || loadedCount <= 0) return 1
  return Math.max(1, Math.ceil(loadedCount / perPage))
}

/** Clamps a requested page into [1, totalLoadedPages(loadedCount, perPage)]. */
export function clampPage(page: number, loadedCount: number, perPage: number): number {
  const max = totalLoadedPages(loadedCount, perPage)
  return Math.min(Math.max(1, Math.floor(page)), max)
}

export interface ResultsRange {
  from: number
  to: number
  total: number
}

/**
 * "1–25 of N" range: `total` is Scryfall's real total_cards count (may exceed
 * what's been loaded locally), `loadedCount` bounds `to` so it never overstates
 * what's actually on screen.
 */
export function resultsRange(page: number, perPage: number, loadedCount: number, total: number): ResultsRange {
  if (loadedCount <= 0) return { from: 0, to: 0, total }
  const safePage = clampPage(page, loadedCount, perPage)
  const from = (safePage - 1) * perPage + 1
  const to = Math.min(safePage * perPage, loadedCount)
  return { from, to, total }
}
