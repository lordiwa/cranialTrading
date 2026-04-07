/**
 * Pure helper functions for the queryCardIndex Cloud Function.
 *
 * These handle expanding index chunks, filtering, sorting, and pagination.
 * They are framework-agnostic (no Vue, no Firebase) so they can be:
 * 1. Unit tested with Vitest
 * 2. Copied into functions/index.js for the Cloud Function runtime
 *
 * Index card compact format (from toIndexCard in functions/index.js):
 *   i  = id            s  = scryfallId    n  = name
 *   st = status        q  = quantity      p  = price
 *   cm = cmc           co = colors[]      r  = rarity (first char: c/u/r/m)
 *   t  = type_line     f  = foil          sc = setCode
 *   pw = power         to = toughness     fa = full_art
 *   pm = produced_mana kw = keywords      lg = legalities (legal format names)
 *   ca = createdAt(ms) cn = condition     pb = public
 *   df = dual-faced
 */

export interface IndexCard {
  i: string
  s: string
  n: string
  st: string
  q: number
  p: number
  cm: number
  co: string[]
  r: string
  t: string
  f: boolean
  sc: string
  pw: string
  to: string
  fa: boolean
  pm: string[]
  kw: string[]
  lg: string[]
  ca: number
  cn: string
  pb: boolean
  df: boolean
}

export interface IndexChunk {
  cards: IndexCard[]
  count: number
  version: number
}

export interface QueryFilters {
  search?: string
  status?: string[]
  edition?: string[]
  color?: string[]
  rarity?: string[]
  type?: string[]
  foil?: boolean
  condition?: string[]
  minPrice?: number
  maxPrice?: number
}

export interface QuerySort {
  field: string    // 'name' | 'price' | 'edition' | 'quantity' | 'dateAdded'
  direction: 'asc' | 'desc'
}

export interface PaginatedResult {
  cards: IndexCard[] | string[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// ── Rarity mapping: full name to first character ──

const RARITY_INITIAL: Record<string, string> = {
  common: 'c',
  uncommon: 'u',
  rare: 'r',
  mythic: 'm',
}

// ── expandIndexCards ──

/**
 * Flatten chunked index documents into a single array of index cards.
 */
export function expandIndexCards(chunks: IndexChunk[]): IndexCard[] {
  const result: IndexCard[] = []
  for (const chunk of chunks) {
    if (chunk.cards && chunk.cards.length > 0) {
      for (const card of chunk.cards) {
        result.push(card)
      }
    }
  }
  return result
}

// ── filterIndexCards ──

/**
 * Apply filters to an array of index cards. All filters use AND logic
 * (a card must pass every active filter). Within array-valued filters
 * (status, edition, color, rarity, type, condition), OR logic is used
 * (card must match at least one value in the array).
 */
export function filterIndexCards(cards: IndexCard[], filters: QueryFilters): IndexCard[] {
  let result = cards

  // Search filter: case-insensitive substring match on name
  if (filters.search && filters.search.trim() !== '') {
    const q = filters.search.toLowerCase()
    result = result.filter(c => c.n.toLowerCase().includes(q))
  }

  // Status filter
  if (filters.status && filters.status.length > 0) {
    const statusSet = new Set(filters.status)
    result = result.filter(c => statusSet.has(c.st))
  }

  // Edition filter: match setCode (case-insensitive)
  if (filters.edition && filters.edition.length > 0) {
    const editionSet = new Set(filters.edition.map(e => e.toUpperCase()))
    result = result.filter(c => editionSet.has(c.sc.toUpperCase()))
  }

  // Color filter: card has at least one color in the filter (OR)
  if (filters.color && filters.color.length > 0) {
    const colorSet = new Set(filters.color.map(c => c.toUpperCase()))
    result = result.filter(c => {
      // Colorless cards: match if filter contains an empty-array indicator
      // or if the card has no colors and the filter isn't restricting
      if (c.co.length === 0) {
        // Only include colorless if no specific colors are requested
        // (colorless is not in the color list, so exclude)
        return false
      }
      return c.co.some(color => colorSet.has(color.toUpperCase()))
    })
  }

  // Rarity filter: map full names to first char, then match
  if (filters.rarity && filters.rarity.length > 0) {
    const rarityChars = new Set(
      filters.rarity.map(r => RARITY_INITIAL[r.toLowerCase()] || r.charAt(0).toLowerCase())
    )
    result = result.filter(c => rarityChars.has(c.r.toLowerCase()))
  }

  // Type filter: substring match on type_line (OR across types)
  if (filters.type && filters.type.length > 0) {
    const typeTerms = filters.type.map(t => t.toLowerCase())
    result = result.filter(c => {
      const typeLine = c.t.toLowerCase()
      return typeTerms.some(term => typeLine.includes(term))
    })
  }

  // Foil filter
  if (filters.foil !== undefined && filters.foil !== null) {
    result = result.filter(c => c.f === filters.foil)
  }

  // Condition filter
  if (filters.condition && filters.condition.length > 0) {
    const conditionSet = new Set(filters.condition.map(c => c.toUpperCase()))
    result = result.filter(c => conditionSet.has(c.cn.toUpperCase()))
  }

  // Price range filter
  if (filters.minPrice !== undefined && filters.minPrice !== null) {
    result = result.filter(c => c.p >= filters.minPrice!)
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== null) {
    result = result.filter(c => c.p <= filters.maxPrice!)
  }

  return result
}

// ── sortIndexCards ──

/**
 * Sort index cards by a given field and direction.
 * Returns a new array (does not mutate the input).
 */
export function sortIndexCards(cards: IndexCard[], sort: QuerySort): IndexCard[] {
  const sorted = [...cards]
  const dir = sort.direction === 'desc' ? -1 : 1

  switch (sort.field) {
    case 'name':
      sorted.sort((a, b) => dir * a.n.localeCompare(b.n))
      break
    case 'price':
      sorted.sort((a, b) => dir * (a.p - b.p))
      break
    case 'edition':
      sorted.sort((a, b) => dir * a.sc.localeCompare(b.sc))
      break
    case 'quantity':
      sorted.sort((a, b) => dir * (a.q - b.q))
      break
    case 'dateAdded':
      sorted.sort((a, b) => dir * (a.ca - b.ca))
      break
    default:
      // Default to dateAdded descending (newest first)
      sorted.sort((a, b) => b.ca - a.ca)
      break
  }

  return sorted
}

// ── paginateResults ──

/**
 * Slice the filtered+sorted array for the requested page.
 * If mode is 'ids', return only card IDs instead of full index card objects.
 */
export function paginateResults(
  cards: IndexCard[],
  page: number,
  pageSize: number,
  mode: 'cards' | 'ids' = 'cards',
): PaginatedResult {
  const total = cards.length
  const start = page * pageSize
  const end = start + pageSize
  const pageCards = cards.slice(start, end)
  const hasMore = end < total

  return {
    cards: mode === 'ids'
      ? pageCards.map(c => c.i)
      : pageCards,
    total,
    page,
    pageSize,
    hasMore,
  }
}
