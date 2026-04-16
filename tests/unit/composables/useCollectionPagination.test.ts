/**
 * RED phase tests for useCollectionPagination composable.
 * Verifies debounced watcher behavior and cleanup.
 */

import { ref } from 'vue'

vi.mock('@/utils/collectionFilters', () => ({
  buildPaginationFilters: vi.fn().mockReturnValue({ search: undefined }),
  buildPaginationSort: vi.fn().mockReturnValue({ field: 'dateAdded', direction: 'desc' }),
}))

import { useCollectionPagination } from '@/composables/useCollectionPagination'

function makeFilterState() {
  return {
    filterQuery: ref(''),
    statusFilter: ref('all'),
    sortBy: ref('recent'),
    selectedColors: ref(new Set<string>()),
    selectedManaValues: ref(new Set<string>()),
    selectedTypes: ref(new Set<string>()),
    selectedRarities: ref(new Set<string>()),
    advFoilFilter: ref('any'),
    advSelectedSets: ref<string[]>([]),
    advPriceMin: ref<number | undefined>(undefined),
    advPriceMax: ref<number | undefined>(undefined),
  }
}

function makeCollectionStore() {
  return {
    queryPage: vi.fn(),
  }
}

describe('useCollectionPagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('triggerQuery', () => {
    it('exposes triggerQuery function', () => {
      const filterState = makeFilterState()
      const collectionStore = makeCollectionStore()
      const { triggerQuery } = useCollectionPagination({ filterState, collectionStore })
      expect(typeof triggerQuery).toBe('function')
    })

    it('triggerQuery calls collectionStore.queryPage immediately', () => {
      const filterState = makeFilterState()
      const collectionStore = makeCollectionStore()
      const { triggerQuery } = useCollectionPagination({ filterState, collectionStore })

      triggerQuery()

      expect(collectionStore.queryPage).toHaveBeenCalledTimes(1)
    })
  })

  describe('debounced watcher', () => {
    it('queryPage is called after 300ms debounce on filterQuery change', async () => {
      const filterState = makeFilterState()
      const collectionStore = makeCollectionStore()
      useCollectionPagination({ filterState, collectionStore })

      filterState.filterQuery.value = 'bolt'

      // Not called immediately
      expect(collectionStore.queryPage).not.toHaveBeenCalled()

      // Called after 300ms
      vi.advanceTimersByTime(300)
      expect(collectionStore.queryPage).toHaveBeenCalledTimes(1)
    })

    it('rapid filter changes only trigger one queryPage call (debounce)', async () => {
      const filterState = makeFilterState()
      const collectionStore = makeCollectionStore()
      useCollectionPagination({ filterState, collectionStore })

      filterState.filterQuery.value = 'a'
      vi.advanceTimersByTime(100)
      filterState.filterQuery.value = 'ab'
      vi.advanceTimersByTime(100)
      filterState.filterQuery.value = 'abc'
      vi.advanceTimersByTime(300)

      // Only one call after final debounce settles
      expect(collectionStore.queryPage).toHaveBeenCalledTimes(1)
    })
  })
})
