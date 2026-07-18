/**
 * TASK-136 round 2 (M1/M4): server-side-paginated /public_cards state for the
 * public profile, extracted out of UserProfileView.vue so the cross-profile
 * race guard is unit testable (views have no unit-test harness in this repo).
 *
 * M1 — a loadMore()/status-count response in flight for profile A resolving
 * AFTER the visitor has already navigated to profile B must never append A's
 * cards onto B's grid, or overwrite B's cursor/hasMore/counts with A's stale
 * values. Guarded via the same generation-token pattern as
 * stores/collection.ts's queryPage/loadNextPage (_queryGeneration, TASK-113/116).
 */

vi.mock('@/services/publicCards', () => ({
  getUserPublicCardsPage: vi.fn(),
  getUserPublicCardStatusCounts: vi.fn(),
  searchUserPublicCards: vi.fn(),
}))

// eslint-disable-next-line import/first
import { getUserPublicCardsPage, getUserPublicCardStatusCounts, type PublicCard, type PublicCardsPage, searchUserPublicCards } from '@/services/publicCards'
// eslint-disable-next-line import/first
import { usePublicProfileCards } from '@/composables/usePublicProfileCards'

const mockGetPage = vi.mocked(getUserPublicCardsPage)
const mockGetCounts = vi.mocked(getUserPublicCardStatusCounts)
const mockSearch = vi.mocked(searchUserPublicCards)

function makePublicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    docId: 'user-1_c1',
    cardId: 'c1',
    userId: 'user-1',
    username: 'alice',
    cardName: 'Lightning Bolt',
    cardNameLower: 'lightning bolt',
    scryfallId: 'scry-1',
    status: 'sale',
    price: 1,
    edition: 'Alpha',
    condition: 'NM',
    foil: false,
    quantity: 1,
    image: 'https://img/bolt.jpg',
    updatedAt: { toDate: () => new Date('2026-01-01T00:00:00Z') } as unknown as PublicCard['updatedAt'],
    ...overrides,
  }
}

function makePage(cards: PublicCard[], cursor: unknown, hasMore: boolean): PublicCardsPage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { cards, cursor: cursor as any, hasMore }
}

beforeEach(() => {
  mockGetPage.mockReset()
  mockGetCounts.mockReset()
  mockSearch.mockReset()
  mockGetCounts.mockResolvedValue({ sale: 0, trade: 0 })
})

describe('usePublicProfileCards', () => {
  describe('loadFirstPage', () => {
    it('populates cards from the first page', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'c1' })], { id: 'c1' }, false))

      const { cards, loadFirstPage } = usePublicProfileCards()
      await loadFirstPage('user-1')

      expect(cards.value).toHaveLength(1)
      expect(cards.value[0].id).toBe('c1')
    })

    it('resets cards, hasMore, and counts at the start of every call', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'a1' })], { id: 'a' }, true))
      const { cards, hasMore, loadFirstPage } = usePublicProfileCards()
      await loadFirstPage('user-A')
      expect(cards.value).toHaveLength(1)
      expect(hasMore.value).toBe(true)

      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      await loadFirstPage('user-B')
      expect(cards.value).toEqual([])
      expect(hasMore.value).toBe(false)
    })

    it('calls onError and does not throw when the page query rejects', async () => {
      mockGetPage.mockRejectedValueOnce(new Error('boom'))
      const onError = vi.fn()
      const { loadFirstPage } = usePublicProfileCards({ onError })

      await expect(loadFirstPage('user-1')).resolves.toBeUndefined()
      expect(onError).toHaveBeenCalledTimes(1)
    })

    it('calls onPageLoaded once after a successful page apply', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      const onPageLoaded = vi.fn()
      const { loadFirstPage } = usePublicProfileCards({ onPageLoaded })

      await loadFirstPage('user-1')

      expect(onPageLoaded).toHaveBeenCalledTimes(1)
    })

    it('populates saleCount/tradeCount from the decoupled aggregate count query', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      mockGetCounts.mockResolvedValueOnce({ sale: 5392, trade: 12 })

      const { saleCount, tradeCount, loadFirstPage } = usePublicProfileCards()
      await loadFirstPage('user-1')

      expect(saleCount.value).toBe(5392)
      expect(tradeCount.value).toBe(12)
    })
  })

  describe('loadMore', () => {
    it('appends to existing cards and requests the next page using the stored cursor', async () => {
      const cursorDoc = { id: 'last' }
      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'c1' })], cursorDoc, true))
      const { cards, loadFirstPage, loadMore } = usePublicProfileCards()
      await loadFirstPage('user-1')

      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'c2' })], null, false))
      await loadMore('user-1')

      expect(cards.value.map(c => c.id)).toEqual(['c1', 'c2'])
      expect(mockGetPage).toHaveBeenLastCalledWith('user-1', expect.any(Number), cursorDoc)
    })

    it('is a no-op when hasMore is false', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      const { loadFirstPage, loadMore } = usePublicProfileCards()
      await loadFirstPage('user-1')

      mockGetPage.mockClear()
      await loadMore('user-1')

      expect(mockGetPage).not.toHaveBeenCalled()
    })

    it('is a no-op while a loadMore is already in flight (loadingMore guard)', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], { id: 'x' }, true))
      const { loadFirstPage, loadMore, loadingMore } = usePublicProfileCards()
      await loadFirstPage('user-1')

      let resolveSecond: (v: PublicCardsPage) => void = () => {}
      const pending = new Promise<PublicCardsPage>((resolve) => { resolveSecond = resolve })
      mockGetPage.mockReturnValueOnce(pending)

      const firstLoadMore = loadMore('user-1')
      expect(loadingMore.value).toBe(true)
      void loadMore('user-1') // should be a no-op — already loadingMore

      resolveSecond(makePage([], null, false))
      await firstLoadMore

      // 1 call from loadFirstPage + exactly 1 from the single accepted loadMore
      expect(mockGetPage).toHaveBeenCalledTimes(2)
    })

    it('calls onError and does not throw when loadMore rejects', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], { id: 'x' }, true))
      const onError = vi.fn()
      const { loadFirstPage, loadMore } = usePublicProfileCards({ onError })
      await loadFirstPage('user-1')

      mockGetPage.mockRejectedValueOnce(new Error('boom'))
      await expect(loadMore('user-1')).resolves.toBeUndefined()

      expect(onError).toHaveBeenCalledTimes(1)
    })
  })

  describe('cross-profile race guard (M1 — TASK-113/116 gen-token pattern)', () => {
    it('discards a stale loadMore(A) response that resolves after loadFirstPage(B) has already applied', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'a1' })], { id: 'a-cursor' }, true))
      const { cards, hasMore, loadFirstPage, loadMore } = usePublicProfileCards()
      await loadFirstPage('user-A')

      let resolveLoadMoreA: (v: PublicCardsPage) => void = () => {}
      const loadMoreAPromise = new Promise<PublicCardsPage>((resolve) => { resolveLoadMoreA = resolve })
      mockGetPage.mockReturnValueOnce(loadMoreAPromise)
      const loadMoreACall = loadMore('user-A') // in flight — not yet resolved

      // Visitor navigates to B before A's loadMore resolves
      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'b1' })], { id: 'b-cursor' }, true))
      await loadFirstPage('user-B')

      expect(cards.value.map(c => c.id)).toEqual(['b1'])

      // A's stale loadMore now resolves — must be discarded entirely
      resolveLoadMoreA(makePage([makePublicCard({ cardId: 'a2' })], { id: 'a-cursor-2' }, false))
      await loadMoreACall

      expect(cards.value.map(c => c.id)).toEqual(['b1']) // not poisoned with a2
      expect(hasMore.value).toBe(true) // still B's hasMore=true, not overwritten by A's false

      // And B's cursor must not have been poisoned by A's stale cursor either —
      // the next loadMore('user-B') must request B's cursor, not A's.
      mockGetPage.mockClear()
      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'b2' })], null, false))
      await loadMore('user-B')

      expect(mockGetPage).toHaveBeenCalledWith('user-B', expect.any(Number), { id: 'b-cursor' })
      expect(cards.value.map(c => c.id)).toEqual(['b1', 'b2'])
    })

    it('discards a stale first-page response from a superseded loadFirstPage call', async () => {
      let resolveFirst: (v: PublicCardsPage) => void = () => {}
      const firstPromise = new Promise<PublicCardsPage>((resolve) => { resolveFirst = resolve })
      mockGetPage.mockReturnValueOnce(firstPromise)

      const { cards, loadFirstPage } = usePublicProfileCards()
      const firstCall = loadFirstPage('user-A') // slow, in flight

      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'b1' })], null, false))
      await loadFirstPage('user-B') // resolves first, applies B

      expect(cards.value.map(c => c.id)).toEqual(['b1'])

      // A's stale response now resolves
      resolveFirst(makePage([makePublicCard({ cardId: 'a1' })], null, false))
      await firstCall

      expect(cards.value.map(c => c.id)).toEqual(['b1']) // untouched by stale A
    })

    it('discards a stale status-count response from a previous profile', async () => {
      let resolveCountsA: (v: { sale: number; trade: number }) => void = () => {}
      const countsAPromise = new Promise<{ sale: number; trade: number }>((resolve) => { resolveCountsA = resolve })
      mockGetCounts.mockReturnValueOnce(countsAPromise)
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))

      const { saleCount, tradeCount, loadFirstPage } = usePublicProfileCards()
      const loadA = loadFirstPage('user-A') // fires the slow status-count query for A

      mockGetCounts.mockResolvedValueOnce({ sale: 3, trade: 1 })
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      await loadFirstPage('user-B') // B applies fully, including its own fast counts
      await loadA

      expect(saleCount.value).toBe(3)
      expect(tradeCount.value).toBe(1)

      // A's stale counts resolve after — must be discarded
      resolveCountsA({ sale: 999, trade: 999 })
      await Promise.resolve()
      await Promise.resolve()

      expect(saleCount.value).toBe(3)
      expect(tradeCount.value).toBe(1)
    })
  })

  /**
   * TASK-138 AC1: setSearchTerm wires the public profile's text search to
   * the server-side prefix query (searchUserPublicCards) instead of only
   * filtering whatever page(s) had already loaded. Debounced ~300ms, guarded
   * by the SAME generation token loadFirstPage/loadMore already share — a
   * search or pagination response resolving after a newer call (new term,
   * cleared term, or profile switch) must never win.
   */
  describe('setSearchTerm', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not query before the debounce window elapses', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      const { loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      setSearchTerm('user-1', 'bolt')
      vi.advanceTimersByTime(299)

      expect(mockSearch).not.toHaveBeenCalled()
    })

    it('queries searchUserPublicCards with the trimmed term after the debounce window', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      mockSearch.mockResolvedValueOnce(makePage([], null, false))
      const { loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300)

      expect(mockSearch).toHaveBeenCalledTimes(1)
      expect(mockSearch).toHaveBeenCalledWith('user-1', 'bolt', expect.any(Number))
    })

    it('coalesces rapid successive calls into a single search using the last term', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      mockSearch.mockResolvedValueOnce(makePage([], null, false))
      const { loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      setSearchTerm('user-1', 'bo')
      vi.advanceTimersByTime(100)
      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300)

      expect(mockSearch).toHaveBeenCalledTimes(1)
      expect(mockSearch).toHaveBeenCalledWith('user-1', 'bolt', expect.any(Number))
    })

    it('populates cards from the search results, replacing whatever was paginated in', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'paged-1' })], { id: 'x' }, true))
      mockSearch.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'found-1' })], null, false))
      const { cards, loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')
      expect(cards.value.map(c => c.id)).toEqual(['paged-1'])

      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300)

      expect(cards.value.map(c => c.id)).toEqual(['found-1'])
    })

    it('sets hasMore=false for search results — search is a single capped page, not further paginated', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], { id: 'x' }, true))
      mockSearch.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'found-1' })], null, false))
      const { hasMore, loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')
      expect(hasMore.value).toBe(true)

      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300)

      expect(hasMore.value).toBe(false)
    })

    it('toggles searching true while the query is in flight, false after it resolves', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      let resolveSearch: (v: PublicCardsPage) => void = () => {}
      const pending = new Promise<PublicCardsPage>((resolve) => { resolveSearch = resolve })
      mockSearch.mockReturnValueOnce(pending)
      const { loadFirstPage, searching, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300)
      expect(searching.value).toBe(true)

      resolveSearch(makePage([], null, false))
      await pending
      expect(searching.value).toBe(false)
    })

    // TASK-138 review addendum M2: a term shorter than MIN_SEARCH_LEN used to
    // call loadFirstPage() UNCONDITIONALLY, even when no search had actually
    // executed yet — so the very first keystroke of any search blanked the
    // grid, refetched page 1 + counts, then ~300ms later got replaced by the
    // real search results (a visible flash + wasted reads). Below-threshold
    // terms must only restore pagination when a search was ACTUALLY applied.
    it('a first keystroke below MIN_SEARCH_LEN is a no-op when no search was ever active (M2 regression)', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'page-1' })], null, false))
      const { loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')
      mockGetPage.mockClear()

      setSearchTerm('user-1', 'b') // 1 char — below MIN_SEARCH_LEN, first keystroke
      await vi.advanceTimersByTimeAsync(300)

      expect(mockSearch).not.toHaveBeenCalled()
      expect(mockGetPage).not.toHaveBeenCalled() // no blank-and-refetch flash
    })

    it('an empty term is a no-op when no search was ever active (M2 regression)', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      const { loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')
      mockGetPage.mockClear()

      setSearchTerm('user-1', '')
      await vi.advanceTimersByTimeAsync(300)

      expect(mockGetPage).not.toHaveBeenCalled()
    })

    it('a term shorter than MIN_SEARCH_LEN restores pagination once a search was actually applied (M2)', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      mockSearch.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'found-1' })], null, false))
      const { cards, loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300) // search actually executes
      expect(cards.value.map(c => c.id)).toEqual(['found-1'])

      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'restored-1' })], null, false))
      setSearchTerm('user-1', 'b') // deleted back down below MIN_SEARCH_LEN
      await vi.advanceTimersByTimeAsync(300)

      expect(mockGetPage).toHaveBeenCalledWith('user-1', expect.any(Number), null)
      expect(cards.value.map(c => c.id)).toEqual(['restored-1'])
    })

    it('an empty term restores pagination once a search was actually applied (M2)', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      mockSearch.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'found-1' })], null, false))
      const { cards, loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300) // search actually executes
      expect(cards.value.map(c => c.id)).toEqual(['found-1'])

      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'restored-1' })], null, false))
      setSearchTerm('user-1', '')
      await vi.advanceTimersByTimeAsync(300)

      expect(mockGetPage).toHaveBeenCalledWith('user-1', expect.any(Number), null)
      expect(cards.value.map(c => c.id)).toEqual(['restored-1'])
    })

    // TASK-138 review addendum M2 (secondary bug): a debounced search that
    // was scheduled but never actually EXECUTED (cleared before the 300ms
    // window elapsed) must not count as "a search was applied" either — no
    // pagination was ever displaced, so there's nothing to restore.
    it('a debounce that gets cleared before it fires does not count as an applied search (M2)', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      const { loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')
      mockGetPage.mockClear()

      setSearchTerm('user-1', 'bo') // schedules a debounce — never fires
      vi.advanceTimersByTime(100)
      setSearchTerm('user-1', 'b') // dropped below threshold before the debounce elapsed
      await vi.advanceTimersByTimeAsync(300)

      expect(mockSearch).not.toHaveBeenCalled()
      expect(mockGetPage).not.toHaveBeenCalled()
    })

    // TASK-138 review addendum M1: runSearch's finally only reset `searching`
    // — a loadMore() left in flight when a search starts sees its generation
    // go stale (via runSearch's ++generation) and skips resetting
    // `loadingMore` itself (same reasoning loadFirstPage already documents),
    // so entering search mode while a loadMore was in flight left
    // loadingMore stuck true — a perpetual "loading more" spinner under
    // every group for as long as search mode was active.
    it('resets loadingMore when a search starts while a loadMore is in flight (M1)', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], { id: 'x' }, true))
      const { loadFirstPage, loadingMore, loadMore, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      let resolveLoadMore: (v: PublicCardsPage) => void = () => {}
      const loadMorePending = new Promise<PublicCardsPage>((resolve) => { resolveLoadMore = resolve })
      mockGetPage.mockReturnValueOnce(loadMorePending)
      const loadMoreCall = loadMore('user-1')
      expect(loadingMore.value).toBe(true) // loadMore in flight

      mockSearch.mockResolvedValueOnce(makePage([], null, false))
      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300)

      expect(loadingMore.value).toBe(false)

      resolveLoadMore(makePage([], null, false)) // let the stale loadMore settle
      await loadMoreCall
    })

    it('clearing the term cancels a pending debounced search — it never fires after the term is cleared', async () => {
      mockGetPage.mockResolvedValue(makePage([], null, false))
      const { loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      setSearchTerm('user-1', 'bolt')
      vi.advanceTimersByTime(100) // still within the debounce window
      setSearchTerm('user-1', '') // cleared before the debounced search fired
      await vi.advanceTimersByTimeAsync(300)

      expect(mockSearch).not.toHaveBeenCalled()
    })

    it('gen-token: a stale search resolving after loadFirstPage(B) never overwrites B\'s cards', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      const { cards, loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-A')

      let resolveSearch: (v: PublicCardsPage) => void = () => {}
      const pending = new Promise<PublicCardsPage>((resolve) => { resolveSearch = resolve })
      mockSearch.mockReturnValueOnce(pending)
      setSearchTerm('user-A', 'bolt')
      await vi.advanceTimersByTimeAsync(300) // search for A is now in flight

      mockGetPage.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'b1' })], null, false))
      await loadFirstPage('user-B') // visitor navigates away before A's search resolves

      resolveSearch(makePage([makePublicCard({ cardId: 'stale-search-result' })], null, false))
      await pending
      await Promise.resolve()

      expect(cards.value.map(c => c.id)).toEqual(['b1']) // not poisoned by A's stale search
    })

    it('gen-token: a stale search resolving after a newer search term supersedes it is discarded', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      const { cards, loadFirstPage, setSearchTerm } = usePublicProfileCards()
      await loadFirstPage('user-1')

      let resolveFirstSearch: (v: PublicCardsPage) => void = () => {}
      const firstPending = new Promise<PublicCardsPage>((resolve) => { resolveFirstSearch = resolve })
      mockSearch.mockReturnValueOnce(firstPending)
      setSearchTerm('user-1', 'bo')
      await vi.advanceTimersByTimeAsync(300) // "bo" search in flight

      mockSearch.mockResolvedValueOnce(makePage([makePublicCard({ cardId: 'bolt-result' })], null, false))
      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300) // "bolt" search resolves first

      expect(cards.value.map(c => c.id)).toEqual(['bolt-result'])

      // The stale "bo" search now resolves — must be discarded
      resolveFirstSearch(makePage([makePublicCard({ cardId: 'stale-bo-result' })], null, false))
      await firstPending
      await Promise.resolve()

      expect(cards.value.map(c => c.id)).toEqual(['bolt-result'])
    })

    it('calls onError and does not throw when the search query rejects', async () => {
      mockGetPage.mockResolvedValueOnce(makePage([], null, false))
      mockSearch.mockRejectedValueOnce(new Error('boom'))
      const onError = vi.fn()
      const { loadFirstPage, searching, setSearchTerm } = usePublicProfileCards({ onError })
      await loadFirstPage('user-1')

      setSearchTerm('user-1', 'bolt')
      await vi.advanceTimersByTimeAsync(300)
      await Promise.resolve()

      expect(onError).toHaveBeenCalledTimes(1)
      expect(searching.value).toBe(false)
    })
  })
})
