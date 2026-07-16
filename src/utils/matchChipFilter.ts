// v2 redesign — pure count/filter logic for the Matches hub filter chips
// (design→app v2 F2, see cranial-design/prototype/DESIGN-DIRECTION.md §8.2).
// The 4 former primary tabs (Nuevos/Enviados/Guardados/Eliminados) become filter
// chips inside the MATCHES primary tab. No Vue reactivity, no stores — pure functions
// so the chip counting/filtering/default-expansion rules are unit-testable in isolation.

export type MatchChipId = 'new' | 'sent' | 'saved' | 'deleted'

export const MATCH_CHIP_IDS: readonly MatchChipId[] = ['new', 'sent', 'saved', 'deleted']

export interface MatchChipBuckets<T> {
  new: T[]
  sent: T[]
  saved: T[]
  deleted: T[]
}

export interface MatchChipSummary {
  id: MatchChipId
  count: number
}

/**
 * Builds the { id, count } list for the filter chips row, in display order.
 */
export const buildMatchChipSummaries = <T>(buckets: MatchChipBuckets<T>): MatchChipSummary[] =>
  // eslint-disable-next-line security/detect-object-injection -- id is a MatchChipId union, not user input
  MATCH_CHIP_IDS.map((id) => ({ id, count: buckets[id].length }))

/**
 * Returns the matches belonging to the given chip. Never mutates the source buckets.
 */
export const selectMatchesForChip = <T>(chip: MatchChipId, buckets: MatchChipBuckets<T>): T[] =>
  // eslint-disable-next-line security/detect-object-injection -- chip is a MatchChipId union, not user input
  [...buckets[chip]]

/**
 * Type guard for chip ids coming from untyped sources (e.g. route query params).
 */
export const isValidMatchChip = (value: string): value is MatchChipId =>
  (MATCH_CHIP_IDS as readonly string[]).includes(value)

/**
 * First group of a chip's dataset expands by default, the rest stay collapsed —
 * "nunca una pantalla de puros headers colapsados" (DESIGN-DIRECTION.md §8.2).
 */
export const defaultExpandedGroupIds = (groupIds: string[]): Set<string> => {
  const [first] = groupIds
  return new Set(first !== undefined ? [first] : [])
}

/**
 * Sums the value of what you'd receive across a set of matches, for the
 * "Valor potencial" stat-chip in the page header.
 */
export const sumPotentialValue = (matches: { theirTotalValue?: number }[]): number =>
  matches.reduce((sum, m) => sum + (m.theirTotalValue ?? 0), 0)
