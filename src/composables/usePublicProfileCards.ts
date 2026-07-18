/**
 * usePublicProfileCards — server-side-paginated /public_cards state for the
 * public profile view (TASK-136 round 2, M1/M4; TASK-138 AC1 search).
 *
 * Extracted out of UserProfileView.vue so the cross-profile race guard is
 * unit testable — this project has no view-level unit-test harness (see
 * tests/unit/{components,composables,services,stores,utils}, no /views dir).
 *
 * M1: a loadMore() or status-count response in flight for a previously
 * viewed profile resolving AFTER the visitor has already navigated to a
 * different profile must never append the old profile's cards onto the new
 * one, or overwrite its cursor/hasMore/counts with stale values. Guarded via
 * the same generation-token pattern as stores/collection.ts's
 * queryPage/loadNextPage (_queryGeneration, TASK-113/116): every
 * loadFirstPage() call bumps the generation, and a response is only applied
 * if the generation is still current when it resolves.
 *
 * M4: saleCount/tradeCount come from a decoupled Firestore aggregate count
 * query (getUserPublicCardStatusCounts), not from cards.length — so the
 * header chips show the profile's true totals rather than only however many
 * cards have been scrolled into view.
 *
 * TASK-138 AC1: setSearchTerm() debounces (~300ms) into a server-side prefix
 * query (searchUserPublicCards) scoped to userId, so text search reaches
 * cards regardless of pagination state instead of only filtering whatever
 * page(s) had already loaded. It shares the SAME generation token as
 * loadFirstPage/loadMore — entering search mode, switching search terms, or
 * navigating to a different profile all bump `generation`, so a stale
 * response from any of the three paths is discarded the same way. Search
 * results replace `cards` outright and set hasMore=false (a single capped
 * page, not further paginated — see searchUserPublicCards's doc comment).
 * Clearing the term (or dropping below MIN_SEARCH_LEN) cancels any pending
 * debounce and restores normal pagination via loadFirstPage() — this resets
 * to page 1 rather than caching pre-search state, trading "back to exactly
 * where you were scrolled" for a much smaller amount of new code; documented
 * here as the known limitation.
 */

import { onScopeDispose, type Ref, ref } from 'vue'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { getUserPublicCardsPage, getUserPublicCardStatusCounts, searchUserPublicCards } from '../services/publicCards'
import { publicCardToCard } from '../utils/publicCardMapping'
import type { Card } from '../types/card'

const DEFAULT_PAGE_SIZE = 60
const SEARCH_PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300
const MIN_SEARCH_LEN = 2

export interface UsePublicProfileCardsOptions {
  pageSize?: number
  /** Called (without rethrowing) whenever a page, count, or search query fails. */
  onError?: () => void
  /** Called after a page or search is successfully applied — never for a discarded stale response. */
  onPageLoaded?: () => void
}

export interface UsePublicProfileCards {
  cards: Ref<Card[]>
  loadingMore: Ref<boolean>
  hasMore: Ref<boolean>
  saleCount: Ref<number>
  tradeCount: Ref<number>
  /** True while a debounced server-side search (setSearchTerm) is in flight. */
  searching: Ref<boolean>
  loadFirstPage: (userId: string) => Promise<void>
  loadMore: (userId: string) => Promise<void>
  /** Debounced entry point for profile text search (TASK-138 AC1). Fire-and-forget. */
  setSearchTerm: (userId: string, term: string) => void
}

export function usePublicProfileCards(options: UsePublicProfileCardsOptions = {}): UsePublicProfileCards {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

  const cards = ref<Card[]>([]) as Ref<Card[]>
  const loadingMore = ref(false)
  const hasMore = ref(false)
  const saleCount = ref(0)
  const tradeCount = ref(0)
  const searching = ref(false)

  let cursor: QueryDocumentSnapshot | null = null
  let generation = 0
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

  const clearSearchDebounce = (): void => {
    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
  }

  onScopeDispose(clearSearchDebounce)

  const loadStatusCounts = async (userId: string, myGeneration: number): Promise<void> => {
    try {
      const counts = await getUserPublicCardStatusCounts(userId)
      if (myGeneration !== generation) return // stale — navigated to another profile
      saleCount.value = counts.sale
      tradeCount.value = counts.trade
    } catch (err) {
      if (myGeneration !== generation) return
      console.error('[usePublicProfileCards] Error loading status counts:', err)
      options.onError?.()
    }
  }

  const loadFirstPage = async (userId: string): Promise<void> => {
    const myGeneration = ++generation
    cursor = null
    cards.value = []
    hasMore.value = false
    saleCount.value = 0
    tradeCount.value = 0
    // A loadMore()/search left in flight from the previous profile or a
    // previous search term will see its generation is stale and skip
    // resetting these itself (so it doesn't clobber a *newer* call's flag)
    // — so a fresh loadFirstPage must clear them.
    loadingMore.value = false
    searching.value = false
    clearSearchDebounce()

    // Fire-and-forget — decoupled from the page fetch so it never blocks the
    // first-page render (perf goal, AC5).
    void loadStatusCounts(userId, myGeneration)

    try {
      const page = await getUserPublicCardsPage(userId, pageSize, null)
      if (myGeneration !== generation) return // stale — navigated to another profile
      cards.value = page.cards.map(publicCardToCard)
      cursor = page.cursor
      hasMore.value = page.hasMore
      options.onPageLoaded?.()
    } catch (err) {
      if (myGeneration !== generation) return
      console.error('[usePublicProfileCards] Error loading first page:', err)
      options.onError?.()
    }
  }

  const loadMore = async (userId: string): Promise<void> => {
    if (loadingMore.value || !hasMore.value) return

    const myGeneration = generation
    loadingMore.value = true
    try {
      const page = await getUserPublicCardsPage(userId, pageSize, cursor)
      if (myGeneration !== generation) return // stale — navigated to another profile
      cards.value = [...cards.value, ...page.cards.map(publicCardToCard)]
      cursor = page.cursor
      hasMore.value = page.hasMore
      options.onPageLoaded?.()
    } catch (err) {
      if (myGeneration !== generation) return
      console.error('[usePublicProfileCards] Error loading more cards:', err)
      options.onError?.()
    } finally {
      if (myGeneration === generation) {
        loadingMore.value = false
      }
    }
  }

  const runSearch = async (userId: string, term: string): Promise<void> => {
    const myGeneration = ++generation
    cursor = null
    hasMore.value = false // search is a single capped page — never further paginated
    searching.value = true
    try {
      const page = await searchUserPublicCards(userId, term, SEARCH_PAGE_SIZE)
      if (myGeneration !== generation) return // stale — term/profile changed since this fired
      cards.value = page.cards.map(publicCardToCard)
      options.onPageLoaded?.()
    } catch (err) {
      if (myGeneration !== generation) return
      console.error('[usePublicProfileCards] Error searching public cards:', err)
      options.onError?.()
    } finally {
      if (myGeneration === generation) {
        searching.value = false
      }
    }
  }

  const setSearchTerm = (userId: string, term: string): void => {
    clearSearchDebounce()
    const trimmed = term.trim()
    if (trimmed.length < MIN_SEARCH_LEN) {
      // Below threshold (including empty) — no server-side search to debounce.
      // Restores normal pagination from page 1 (see file-level doc comment
      // for why this resets to page 1 instead of caching pre-search state).
      void loadFirstPage(userId)
      return
    }
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null
      void runSearch(userId, trimmed)
    }, SEARCH_DEBOUNCE_MS)
  }

  return { cards, loadingMore, hasMore, saleCount, tradeCount, searching, loadFirstPage, loadMore, setSearchTerm }
}
