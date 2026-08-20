/**
 * usePublicProfileIndex — the public profile's filter / search / pagination
 * state, answered by the PUBLIC CARD INDEX (Cloud Function
 * `queryPublicCardIndex`) instead of by whatever documents happen to be in
 * memory. TASK-247 tanda 4.
 *
 * ── WHAT THIS REPLACES, AND WHY IT IS A DIFFERENT SHAPE ──
 *
 * The old `usePublicProfileCards` paginated raw `public_cards` documents and
 * left every filter to `useCardFilter`, which runs over the loaded array. So
 * a visitor filtering a seller's profile by black saw the black cards ON THE
 * LOADED PAGE — measured 2026-08-19 against production: 36 shown, 1,488 black
 * documents in the collection. `public_cards` also carries no Scryfall
 * metadata at all, so the view had to enrich card-by-card in the browser
 * (`enrichPublicCardsInMemory`), which an anonymous visitor could not do
 * through `scryfall_cache` (auth-gated) and which never reached past the
 * loaded page either.
 *
 * Here the query is resolved server-side over the whole index, and the two
 * numbers the old path conflated stay separate: `total` counts the seller's
 * WHOLE public collection, `cards` is one page of it. That separation is the
 * fix.
 *
 * ── COLOUR VOCABULARY: OR-INCLUSIVE LETTERS (Rafael, 2026-08-19) ──
 *
 * The chips speak W/U/B/R/G plus C for colourless. A B/G card answers to B
 * AND to G; there is no 'Multicolor' bucket, and lands count by what they
 * PRODUCE (a Swamp is black), which is how the shipped product already
 * behaves. `useCardFilter`'s category vocabulary ('Black' / 'Multicolor' /
 * 'Lands') is NOT used here and is deliberately left untouched for the
 * owner's own collection views, where its semantics are unchanged.
 *
 * ── THREE STATES THE UI NOW HAS TO BE ABLE TO SHOW ──
 *
 *   partial   the index was caught mid-rebuild; `total`, `facets` and
 *             `missing` all come back null. Never invent a count here — a
 *             lying total is this ticket.
 *   missing   entries an active colour filter dropped for having no colour
 *             data (measured 2026-08-18: 7.1% of a real profile). They are
 *             still listed unfiltered and still findable by name, so without
 *             a message they appear to vanish when a chip is pressed.
 *   error     a failed query must be distinguishable from an empty profile.
 *             An empty grid on a 500 is indistinguishable from "this seller
 *             publishes nothing", which is how an outage becomes invisible.
 *
 * The cross-profile generation guard is the same pattern the old composable
 * carried (and stores/collection.ts before it, TASK-113/116): every query
 * bumps a token, and a response that resolves after the visitor has navigated
 * away — or after the filters changed — is discarded rather than applied.
 */

import { onScopeDispose, type Ref, ref, watch } from 'vue'
import { getUserPublicCardStatusCounts, type PublicCardIndexPage, queryUserPublicCardIndex } from '../services/publicCards'
import type { PublicCardIndexFacets, QueryPublicCardIndexRequest } from '../services/cloudFunctions'
import type { Card } from '../types/card'

/** Matches the index's own DEFAULT_PAGE_SIZE, so one scroll goes as far as it did before. */
const DEFAULT_PAGE_SIZE = 60
const SEARCH_DEBOUNCE_MS = 300
/** The server's own MIN_SEARCH_LEN. A shorter term is not a search. */
const MIN_SEARCH_LEN = 2

/** The chip vocabulary. Letters, OR-inclusive; `C` is genuinely colourless. */
export const PUBLIC_COLOR_LETTERS = ['W', 'U', 'B', 'R', 'G', 'C'] as const
export const PUBLIC_RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const
/** Substring-matched against the index's type line (`t`). */
export const PUBLIC_TYPES = ['creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker', 'land'] as const
export const PUBLIC_MANA_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'] as const

export type PublicProfileSort = NonNullable<QueryPublicCardIndexRequest['sort']>
export type PublicProfileFilters = NonNullable<QueryPublicCardIndexRequest['filters']>

export interface UsePublicProfileIndexOptions {
  pageSize?: number
  /** Called (without rethrowing) whenever a query fails. */
  onError?: () => void
}

export interface UsePublicProfileIndex {
  cards: Ref<Card[]>
  /** Matching documents across the seller's WHOLE collection. `null` = mid-rebuild. */
  total: Ref<number | null>
  hasMore: Ref<boolean>
  loading: Ref<boolean>
  loadingMore: Ref<boolean>
  /** True while a debounced text search is in flight. */
  searching: Ref<boolean>
  /** The last query failed — render an error, never an empty grid. */
  error: Ref<boolean>
  /** The index is mid-rebuild: no firm counts are available. */
  partial: Ref<boolean>
  /** A reconciliation is running right now. */
  reconciling: Ref<boolean>
  /** Cards an active colour filter dropped for having no colour data. */
  missing: Ref<number | null>
  facets: Ref<PublicCardIndexFacets | null>
  saleCount: Ref<number>
  tradeCount: Ref<number>
  /** Whether any chip or advanced filter is narrowing the result. */
  activeFilterCount: Ref<number>

  filterQuery: Ref<string>
  selectedColors: Ref<Set<string>>
  selectedRarities: Ref<Set<string>>
  selectedTypes: Ref<Set<string>>
  selectedManaValues: Ref<Set<string>>
  sort: Ref<PublicProfileSort>
  advancedFilters: Ref<PublicProfileFilters>

  colorLetters: readonly string[]
  rarities: readonly string[]
  types: readonly string[]
  manaValues: readonly string[]

  loadFirstPage: () => Promise<void>
  loadMore: () => Promise<void>
  resetFilters: () => void
}

/** A Set that holds everything selectable is not a filter — send nothing. */
function narrowed(selected: Set<string>, all: readonly string[]): string[] | undefined {
  if (selected.size === 0 || selected.size >= all.length) return undefined
  return all.filter(v => selected.has(v))
}

export function usePublicProfileIndex(
  userId: Ref<string | null>,
  options: UsePublicProfileIndexOptions = {}
): UsePublicProfileIndex {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

  const cards = ref<Card[]>([]) as Ref<Card[]>
  const total = ref<number | null>(null)
  const hasMore = ref(false)
  const loading = ref(false)
  const loadingMore = ref(false)
  const searching = ref(false)
  const error = ref(false)
  const partial = ref(false)
  const reconciling = ref(false)
  const missing = ref<number | null>(0)
  const facets = ref<PublicCardIndexFacets | null>(null)
  const saleCount = ref(0)
  const tradeCount = ref(0)
  const activeFilterCount = ref(0)

  const filterQuery = ref('')
  const selectedColors = ref<Set<string>>(new Set(PUBLIC_COLOR_LETTERS))
  const selectedRarities = ref<Set<string>>(new Set(PUBLIC_RARITIES))
  const selectedTypes = ref<Set<string>>(new Set(PUBLIC_TYPES))
  const selectedManaValues = ref<Set<string>>(new Set(PUBLIC_MANA_VALUES))
  const sort = ref<PublicProfileSort>({ field: 'name', direction: 'asc' })
  const advancedFilters = ref<PublicProfileFilters>({})

  let generation = 0
  let page = 0
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

  const clearSearchDebounce = (): void => {
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
  }

  onScopeDispose(clearSearchDebounce)

  /**
   * Everything the server should filter on, in ONE place. A filter that is
   * not narrowing anything is omitted rather than sent as a full list: an
   * explicit colour list would exclude the entries with no colour data (the
   * `missing` group), which must stay visible while no chip is pressed.
   */
  const buildFilters = (): PublicProfileFilters => {
    const filters: PublicProfileFilters = { ...advancedFilters.value }

    const term = filterQuery.value.trim()
    if (term.length >= MIN_SEARCH_LEN) filters.search = term

    const color = narrowed(selectedColors.value, PUBLIC_COLOR_LETTERS)
    if (color) filters.color = color
    const rarity = narrowed(selectedRarities.value, PUBLIC_RARITIES)
    if (rarity) filters.rarity = rarity
    const type = narrowed(selectedTypes.value, PUBLIC_TYPES)
    if (type) filters.type = type
    const manaValue = narrowed(selectedManaValues.value, PUBLIC_MANA_VALUES)
    if (manaValue) filters.manaValue = manaValue

    return filters
  }

  const countActiveFilters = (filters: PublicProfileFilters): number =>
    Object.entries(filters).filter(([key, value]) => {
      if (key === 'search') return false // the search bar shows itself
      if (value === undefined || value === null) return false
      if (Array.isArray(value)) return value.length > 0
      return true
    }).length

  const applyState = (result: PublicCardIndexPage): void => {
    total.value = result.total
    hasMore.value = result.hasMore
    facets.value = result.facets
    partial.value = result.indexState.partial
    reconciling.value = result.indexState.reconciling
    missing.value = result.indexState.missing
    error.value = false
  }

  const loadStatusCounts = async (uid: string, myGeneration: number): Promise<void> => {
    try {
      const counts = await getUserPublicCardStatusCounts(uid)
      if (myGeneration !== generation) return
      saleCount.value = counts.sale
      tradeCount.value = counts.trade
    } catch (err) {
      if (myGeneration !== generation) return
      console.error('[usePublicProfileIndex] Error loading status counts:', err)
      // Deliberately no onError(): the header chips failing is not worth a
      // toast on top of a grid that may have loaded fine.
    }
  }

  /**
   * Page 0 with the current filters. Every filter change, search, and profile
   * navigation lands here — there is one query path, not one per feature.
   */
  const runQuery = async (opts: { statusCounts?: boolean } = {}): Promise<void> => {
    const uid = userId.value
    if (!uid) return

    const myGeneration = ++generation
    page = 0
    clearSearchDebounce()
    loadingMore.value = false
    loading.value = true

    const filters = buildFilters()
    activeFilterCount.value = countActiveFilters(filters)

    if (opts.statusCounts) void loadStatusCounts(uid, myGeneration)

    try {
      const result = await queryUserPublicCardIndex(uid, { filters, sort: sort.value, page: 0, pageSize })
      if (myGeneration !== generation) return
      cards.value = result.cards
      applyState(result)
    } catch (err) {
      if (myGeneration !== generation) return
      console.error('[usePublicProfileIndex] Error querying the public card index:', err)
      cards.value = []
      total.value = null
      hasMore.value = false
      facets.value = null
      error.value = true
      options.onError?.()
    } finally {
      if (myGeneration === generation) {
        loading.value = false
        searching.value = false
      }
    }
  }

  const loadFirstPage = async (): Promise<void> => {
    await runQuery({ statusCounts: true })
  }

  const loadMore = async (): Promise<void> => {
    const uid = userId.value
    if (!uid || loadingMore.value || loading.value || !hasMore.value) return

    const myGeneration = generation
    const nextPage = page + 1
    loadingMore.value = true
    try {
      const result = await queryUserPublicCardIndex(uid, {
        filters: buildFilters(),
        sort: sort.value,
        page: nextPage,
        pageSize,
      })
      if (myGeneration !== generation) return
      page = nextPage
      cards.value = [...cards.value, ...result.cards]
      applyState(result)
    } catch (err) {
      if (myGeneration !== generation) return
      console.error('[usePublicProfileIndex] Error loading more cards:', err)
      options.onError?.()
    } finally {
      if (myGeneration === generation) loadingMore.value = false
    }
  }

  const resetFilters = (): void => {
    selectedColors.value = new Set(PUBLIC_COLOR_LETTERS)
    selectedRarities.value = new Set(PUBLIC_RARITIES)
    selectedTypes.value = new Set(PUBLIC_TYPES)
    selectedManaValues.value = new Set(PUBLIC_MANA_VALUES)
    advancedFilters.value = {}
  }

  // A chip is a server round-trip, not an in-memory pass. Fires immediately:
  // a chip is a single deliberate click, unlike typing.
  watch(
    [selectedColors, selectedRarities, selectedTypes, selectedManaValues, sort, advancedFilters],
    () => { void runQuery() },
    { deep: true }
  )

  // Typing is debounced. A term that drops below the minimum is not "no
  // search pending" — it re-queries WITHOUT a search term, which is how
  // clearing the box restores the full listing.
  watch(filterQuery, (term, previous) => {
    clearSearchDebounce()
    const trimmed = term.trim()
    const previousTrimmed = (previous ?? '').trim()
    if (trimmed.length < MIN_SEARCH_LEN) {
      if (previousTrimmed.length >= MIN_SEARCH_LEN) void runQuery()
      return
    }
    searching.value = true
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null
      void runQuery()
    }, SEARCH_DEBOUNCE_MS)
  })

  return {
    cards,
    total,
    hasMore,
    loading,
    loadingMore,
    searching,
    error,
    partial,
    reconciling,
    missing,
    facets,
    saleCount,
    tradeCount,
    activeFilterCount,
    filterQuery,
    selectedColors,
    selectedRarities,
    selectedTypes,
    selectedManaValues,
    sort,
    advancedFilters,
    colorLetters: PUBLIC_COLOR_LETTERS,
    rarities: PUBLIC_RARITIES,
    types: PUBLIC_TYPES,
    manaValues: PUBLIC_MANA_VALUES,
    loadFirstPage,
    loadMore,
    resetFilters,
  }
}
