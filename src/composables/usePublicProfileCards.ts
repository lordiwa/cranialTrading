/**
 * usePublicProfileCards — server-side-paginated /public_cards state for the
 * public profile view (TASK-136 round 2, M1/M4).
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
 */

import { type Ref, ref } from 'vue'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { getUserPublicCardsPage, getUserPublicCardStatusCounts } from '../services/publicCards'
import { publicCardToCard } from '../utils/publicCardMapping'
import type { Card } from '../types/card'

const DEFAULT_PAGE_SIZE = 60

export interface UsePublicProfileCardsOptions {
  pageSize?: number
  /** Called (without rethrowing) whenever a page or count query fails. */
  onError?: () => void
  /** Called after a page is successfully applied (first page or loadMore) — never for a discarded stale response. */
  onPageLoaded?: () => void
}

export interface UsePublicProfileCards {
  cards: Ref<Card[]>
  loadingMore: Ref<boolean>
  hasMore: Ref<boolean>
  saleCount: Ref<number>
  tradeCount: Ref<number>
  loadFirstPage: (userId: string) => Promise<void>
  loadMore: (userId: string) => Promise<void>
}

export function usePublicProfileCards(options: UsePublicProfileCardsOptions = {}): UsePublicProfileCards {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

  const cards = ref<Card[]>([]) as Ref<Card[]>
  const loadingMore = ref(false)
  const hasMore = ref(false)
  const saleCount = ref(0)
  const tradeCount = ref(0)

  let cursor: QueryDocumentSnapshot | null = null
  let generation = 0

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
    // A loadMore() left in flight from the previous profile will see its
    // generation is stale and skip resetting this itself (so it doesn't
    // clobber a *newer* loadMore's flag) — so the new profile must clear it.
    loadingMore.value = false

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

  return { cards, loadingMore, hasMore, saleCount, tradeCount, loadFirstPage, loadMore }
}
