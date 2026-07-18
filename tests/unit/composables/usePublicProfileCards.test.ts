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
}))

// eslint-disable-next-line import/first
import { getUserPublicCardsPage, getUserPublicCardStatusCounts, type PublicCard, type PublicCardsPage } from '@/services/publicCards'
// eslint-disable-next-line import/first
import { usePublicProfileCards } from '@/composables/usePublicProfileCards'

const mockGetPage = vi.mocked(getUserPublicCardsPage)
const mockGetCounts = vi.mocked(getUserPublicCardStatusCounts)

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
})
