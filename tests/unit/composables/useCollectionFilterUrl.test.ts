/**
 * RED phase tests for useCollectionFilterUrl composable.
 * Verifies URL hydration, state-to-URL sync, and isHydrating guard.
 * Mocks useRoute and useRouter.
 */

import { ref, nextTick } from 'vue'

// We need to mock vue-router before importing the composable
const mockRoute = {
  query: {} as Record<string, string | null>,
}
const mockReplace = vi.fn()
const mockRouter = {
  replace: mockReplace,
}

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter,
}))

import { useCollectionFilterUrl } from '@/composables/useCollectionFilterUrl'

function makeRefs() {
  return {
    filterQuery: ref(''),
    statusFilter: ref<string>('all'),
    sortBy: ref<string>('recent'),
    selectedColors: ref(new Set<string>()),
    selectedTypes: ref(new Set<string>()),
    selectedRarities: ref(new Set<string>()),
    selectedManaValues: ref(new Set<string>()),
    advFoilFilter: ref<string>('any'),
  }
}

describe('useCollectionFilterUrl', () => {
  beforeEach(() => {
    mockRoute.query = {}
    mockReplace.mockClear()
  })

  describe('URL hydration on mount', () => {
    it('hydrates filterQuery from ?q= param', async () => {
      mockRoute.query = { q: 'bolt' }
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick()
      expect(refs.filterQuery.value).toBe('bolt')
    })

    it('hydrates statusFilter from ?status= param', async () => {
      mockRoute.query = { status: 'sale' }
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick()
      expect(refs.statusFilter.value).toBe('sale')
    })

    it('hydrates sortBy from ?sort= param', async () => {
      mockRoute.query = { sort: 'price' }
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick()
      expect(refs.sortBy.value).toBe('price')
    })

    it('leaves refs at defaults when route query is empty', async () => {
      mockRoute.query = {}
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      expect(refs.filterQuery.value).toBe('')
      expect(refs.statusFilter.value).toBe('all')
      expect(refs.sortBy.value).toBe('recent')
    })

    it('validates status against known values — invalid falls back to all', async () => {
      mockRoute.query = { status: 'INVALID_STATUS_XYZ' }
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick()
      expect(refs.statusFilter.value).toBe('all')
    })
  })

  describe('state-to-URL sync', () => {
    it('calls router.replace with ?q= when filterQuery changes', async () => {
      mockRoute.query = {}
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick() // let hydration finish

      refs.filterQuery.value = 'bolt'
      await nextTick()
      await nextTick()

      expect(mockReplace).toHaveBeenCalled()
      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]
      expect(lastCall[0].query.q).toBe('bolt')
    })

    it('omits ?status from URL when status is default (all)', async () => {
      mockRoute.query = {}
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick()

      // Change to sale then back to all
      refs.statusFilter.value = 'sale'
      await nextTick()
      await nextTick()

      refs.statusFilter.value = 'all'
      await nextTick()
      await nextTick()

      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]
      expect(lastCall[0].query.status).toBeUndefined()
    })

    it('omits ?sort from URL when sort is default (recent)', async () => {
      mockRoute.query = {}
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick()

      // Change to price then back to recent
      refs.sortBy.value = 'price'
      await nextTick()
      await nextTick()

      refs.sortBy.value = 'recent'
      await nextTick()
      await nextTick()

      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]
      expect(lastCall[0].query.sort).toBeUndefined()
    })

    it('includes ?status when set to non-default value', async () => {
      mockRoute.query = {}
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick()

      refs.statusFilter.value = 'sale'
      await nextTick()
      await nextTick()

      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1]
      expect(lastCall[0].query.status).toBe('sale')
    })
  })

  describe('isHydrating guard', () => {
    it('does NOT call router.replace during hydration', async () => {
      mockRoute.query = { q: 'bolt', status: 'sale', sort: 'price' }
      const refs = makeRefs()
      useCollectionFilterUrl(refs)

      // During synchronous hydration (before nextTick resolves), router.replace should not be called
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('?filter=wishlist watcher absorption', () => {
    it('sets statusFilter to wishlist when ?filter=wishlist', async () => {
      mockRoute.query = { filter: 'wishlist' }
      const refs = makeRefs()
      useCollectionFilterUrl(refs)
      await nextTick()
      await nextTick()
      expect(refs.statusFilter.value).toBe('wishlist')
    })
  })
})
