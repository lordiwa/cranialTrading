/**
 * Unit tests for pagination state and actions in the collection store.
 *
 * Tests queryPage, loadNextPage, and resetPagination actions that call
 * the queryCardIndex Cloud Function for server-side filtering/sorting/pagination.
 */

// Mock Firebase BEFORE any imports that use it
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))

// Mock cloud functions
vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn(),
  // Stub other cloud function exports used by collection store
  buildCardIndex: vi.fn(),
  loadCollectionChunk: vi.fn(),
  loadCardPage: vi.fn(),
}))

// Mock publicCards service (imported by collection store)
vi.mock('@/services/publicCards', () => ({
  batchSyncCardsToPublic: vi.fn(),
  removeCardFromPublic: vi.fn(),
  syncAllUserCards: vi.fn(),
  syncAllUserPreferences: vi.fn(),
  syncCardToPublic: vi.fn(),
}))

// Mock scryfall cache (imported by collection store)
vi.mock('@/services/scryfallCache', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
}))

// Mock the i18n composable
vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

// Mock Firestore operations used by collection store
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  setDoc: vi.fn(),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock the auth store to provide a test user
vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      username: 'testuser',
    },
  })),
}))

// Mock the toast store
vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({
    show: vi.fn(),
  })),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore } from '@/stores/collection'
import { queryCardIndex } from '@/services/cloudFunctions'
import type { QueryCardIndexResponse } from '@/services/cloudFunctions'

const mockQueryCardIndex = vi.mocked(queryCardIndex)

/** Create a mock CF response with IndexCard-shaped records */
function makeCfResponse(
  cardRecords: Record<string, unknown>[],
  overrides: Partial<QueryCardIndexResponse> = {},
): QueryCardIndexResponse {
  return {
    cards: cardRecords,
    total: cardRecords.length,
    page: 0,
    pageSize: 50,
    hasMore: false,
    ...overrides,
  }
}

/** Create a minimal IndexCard-shaped record as returned by the CF */
function makeIndexCardRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    i: 'card-1',
    s: 'scryfall-abc',
    n: 'Lightning Bolt',
    st: 'collection',
    q: 4,
    p: 1.5,
    cm: 1,
    co: ['R'],
    r: 'c',
    t: 'Instant',
    f: false,
    sc: 'M21',
    pw: '',
    to: '',
    fa: false,
    pm: [],
    kw: [],
    lg: ['modern', 'legacy'],
    ca: Date.now(),
    cn: 'NM',
    pb: true,
    ...overrides,
  }
}

describe('collection store: pagination', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('paginatedCards starts as empty array', () => {
      const store = useCollectionStore()
      expect(store.paginatedCards).toEqual([])
    })

    it('paginationMeta has correct defaults', () => {
      const store = useCollectionStore()
      expect(store.paginationMeta).toEqual({
        page: 0,
        pageSize: 50,
        total: 0,
        hasMore: false,
        loading: false,
        loadingMore: false,
      })
    })
  })

  describe('queryPage', () => {
    it('calls queryCardIndex with correct params', async () => {
      const store = useCollectionStore()
      const mockResponse = makeCfResponse([makeIndexCardRecord()])

      mockQueryCardIndex.mockResolvedValueOnce(mockResponse)

      const filters = { search: 'bolt', status: 'collection' }
      const sort = { field: 'name' as const, direction: 'asc' as const }
      await store.queryPage(filters, sort, 0)

      expect(mockQueryCardIndex).toHaveBeenCalledWith({
        userId: 'test-user-id',
        filters,
        sort,
        page: 0,
        pageSize: 50,
      })
    })

    it('populates paginatedCards with mapped Card objects', async () => {
      const store = useCollectionStore()
      const record = makeIndexCardRecord({ i: 'card-42', n: 'Counterspell' })
      const mockResponse = makeCfResponse([record], { total: 1 })

      mockQueryCardIndex.mockResolvedValueOnce(mockResponse)

      await store.queryPage({}, undefined, 0)

      expect(store.paginatedCards).toHaveLength(1)
      expect(store.paginatedCards[0].id).toBe('card-42')
      expect(store.paginatedCards[0].name).toBe('Counterspell')
    })

    it('sets loading = true while fetching, false when done', async () => {
      const store = useCollectionStore()
      const mockResponse = makeCfResponse([])

      let resolvePromise: (value: QueryCardIndexResponse) => void
      const pendingPromise = new Promise<QueryCardIndexResponse>((resolve) => {
        resolvePromise = resolve
      })
      mockQueryCardIndex.mockReturnValueOnce(pendingPromise)

      const queryPromise = store.queryPage({}, undefined, 0)
      expect(store.paginationMeta.loading).toBe(true)
      expect(store.paginationMeta.loadingMore).toBe(false)

      resolvePromise!(mockResponse)
      await queryPromise

      expect(store.paginationMeta.loading).toBe(false)
    })

    it('updates paginationMeta with response data', async () => {
      const store = useCollectionStore()
      const records = [
        makeIndexCardRecord({ i: 'c1' }),
        makeIndexCardRecord({ i: 'c2' }),
      ]
      const mockResponse = makeCfResponse(records, {
        total: 100,
        page: 0,
        pageSize: 50,
        hasMore: true,
      })

      mockQueryCardIndex.mockResolvedValueOnce(mockResponse)

      await store.queryPage({}, undefined, 0)

      expect(store.paginationMeta.page).toBe(0)
      expect(store.paginationMeta.total).toBe(100)
      expect(store.paginationMeta.hasMore).toBe(true)
      expect(store.paginationMeta.pageSize).toBe(50)
    })

    it('replaces paginatedCards on subsequent calls (does not append)', async () => {
      const store = useCollectionStore()

      // First call
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c1' })], { total: 2, hasMore: true })
      )
      await store.queryPage({}, undefined, 0)
      expect(store.paginatedCards).toHaveLength(1)

      // Second call with different filters — should REPLACE
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c2' }), makeIndexCardRecord({ i: 'c3' })], { total: 2, hasMore: false })
      )
      await store.queryPage({ search: 'other' }, undefined, 0)

      expect(store.paginatedCards).toHaveLength(2)
      expect(store.paginatedCards[0].id).toBe('c2')
    })

    it('defaults page to 0 when not specified', async () => {
      const store = useCollectionStore()
      mockQueryCardIndex.mockResolvedValueOnce(makeCfResponse([]))

      await store.queryPage({})

      expect(mockQueryCardIndex).toHaveBeenCalledWith(
        expect.objectContaining({ page: 0 })
      )
    })

    it('resets loading on error', async () => {
      const store = useCollectionStore()
      mockQueryCardIndex.mockRejectedValueOnce(new Error('CF failed'))

      await store.queryPage({}, undefined, 0)

      expect(store.paginationMeta.loading).toBe(false)
    })
  })

  describe('loadNextPage', () => {
    it('appends results to existing paginatedCards', async () => {
      const store = useCollectionStore()

      // First page
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse(
          [makeIndexCardRecord({ i: 'c1' }), makeIndexCardRecord({ i: 'c2' })],
          { total: 4, page: 0, hasMore: true }
        )
      )
      await store.queryPage({}, undefined, 0)
      expect(store.paginatedCards).toHaveLength(2)

      // Load next page
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse(
          [makeIndexCardRecord({ i: 'c3' }), makeIndexCardRecord({ i: 'c4' })],
          { total: 4, page: 1, hasMore: false }
        )
      )
      await store.loadNextPage()

      expect(store.paginatedCards).toHaveLength(4)
      expect(store.paginatedCards[0].id).toBe('c1')
      expect(store.paginatedCards[2].id).toBe('c3')
    })

    it('sets loadingMore = true (not loading) while fetching', async () => {
      const store = useCollectionStore()

      // Set up initial state with hasMore = true
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c1' })], { total: 10, page: 0, hasMore: true })
      )
      await store.queryPage({}, undefined, 0)

      let resolvePromise: (value: QueryCardIndexResponse) => void
      const pendingPromise = new Promise<QueryCardIndexResponse>((resolve) => {
        resolvePromise = resolve
      })
      mockQueryCardIndex.mockReturnValueOnce(pendingPromise)

      const nextPagePromise = store.loadNextPage()
      expect(store.paginationMeta.loadingMore).toBe(true)
      expect(store.paginationMeta.loading).toBe(false)

      resolvePromise!(makeCfResponse([makeIndexCardRecord({ i: 'c2' })], { total: 10, page: 1, hasMore: false }))
      await nextPagePromise

      expect(store.paginationMeta.loadingMore).toBe(false)
    })

    it('guards against duplicate calls when already loading', async () => {
      const store = useCollectionStore()

      // Set up initial state with hasMore = true
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c1' })], { total: 10, page: 0, hasMore: true })
      )
      await store.queryPage({}, undefined, 0)

      // Start a slow next page load
      let resolvePromise: (value: QueryCardIndexResponse) => void
      const pendingPromise = new Promise<QueryCardIndexResponse>((resolve) => {
        resolvePromise = resolve
      })
      mockQueryCardIndex.mockReturnValueOnce(pendingPromise)

      const firstCall = store.loadNextPage()

      // loadingMore is set synchronously before the first await, so the guard works
      expect(store.paginationMeta.loadingMore).toBe(true)

      // Try to call again while still loading — should be a no-op
      store.loadNextPage()

      // Allow the dynamic import microtask to resolve so queryCardIndex gets called
      await new Promise(r => setTimeout(r, 0))

      // queryCardIndex should only have been called twice total (once for queryPage, once for first loadNextPage)
      expect(mockQueryCardIndex).toHaveBeenCalledTimes(2)

      resolvePromise!(makeCfResponse([], { total: 10, page: 1, hasMore: false }))
      await firstCall
    })

    it('guards against calling when hasMore is false', async () => {
      const store = useCollectionStore()

      // Set up initial state with hasMore = false
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c1' })], { total: 1, page: 0, hasMore: false })
      )
      await store.queryPage({}, undefined, 0)

      // Try to load next page — should be a no-op
      await store.loadNextPage()

      // queryCardIndex should only have been called once (for queryPage)
      expect(mockQueryCardIndex).toHaveBeenCalledTimes(1)
    })

    it('increments page number correctly', async () => {
      const store = useCollectionStore()

      // Page 0
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c1' })], { total: 100, page: 0, hasMore: true })
      )
      await store.queryPage({}, undefined, 0)

      // Load page 1
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c2' })], { total: 100, page: 1, hasMore: true })
      )
      await store.loadNextPage()

      expect(mockQueryCardIndex).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 })
      )
      expect(store.paginationMeta.page).toBe(1)
    })

    it('resets loadingMore on error', async () => {
      const store = useCollectionStore()

      // Set up initial state
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c1' })], { total: 10, page: 0, hasMore: true })
      )
      await store.queryPage({}, undefined, 0)

      // Fail on next page
      mockQueryCardIndex.mockRejectedValueOnce(new Error('CF failed'))
      await store.loadNextPage()

      expect(store.paginationMeta.loadingMore).toBe(false)
    })
  })

  describe('resetPagination', () => {
    it('clears paginatedCards', async () => {
      const store = useCollectionStore()

      // Populate some data
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord({ i: 'c1' })])
      )
      await store.queryPage({}, undefined, 0)
      expect(store.paginatedCards).toHaveLength(1)

      store.resetPagination()

      expect(store.paginatedCards).toEqual([])
    })

    it('resets paginationMeta to defaults', async () => {
      const store = useCollectionStore()

      // Set up some state
      mockQueryCardIndex.mockResolvedValueOnce(
        makeCfResponse([makeIndexCardRecord()], { total: 100, page: 2, hasMore: true })
      )
      await store.queryPage({}, undefined, 2)

      store.resetPagination()

      expect(store.paginationMeta).toEqual({
        page: 0,
        pageSize: 50,
        total: 0,
        hasMore: false,
        loading: false,
        loadingMore: false,
      })
    })
  })
})
