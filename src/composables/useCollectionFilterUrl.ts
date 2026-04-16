/**
 * useCollectionFilterUrl — Bidirectional URL filter/sort sync composable.
 *
 * Extracted from CollectionView.vue (Plan 03-B, NICE-10).
 * On mount: hydrates filter state from URL query params.
 * On state change: updates URL via router.replace (not push).
 * Default values (status=all, sort=recent) are OMITTED from URL for clean URLs.
 * isHydrating guard prevents ping-pong between state watchers and route-query watchers.
 */

import { type Ref, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// Known valid status values (threat model T-03B-01: validate URL params)
const VALID_STATUS_VALUES = ['all', 'owned', 'available', 'collection', 'sale', 'trade', 'wishlist'] as const
const VALID_SORT_VALUES = ['recent', 'name', 'price', 'edition', 'quantity'] as const

export interface UseCollectionFilterUrlOptions {
  filterQuery: Ref<string>
  statusFilter: Ref<string>
  sortBy: Ref<string>
  selectedColors: Ref<Set<string>>
  selectedTypes: Ref<Set<string>>
  selectedRarities: Ref<Set<string>>
  selectedManaValues: Ref<Set<string>>
  advFoilFilter: Ref<string>
}

export function useCollectionFilterUrl(opts: UseCollectionFilterUrlOptions) {
  const {
    filterQuery,
    statusFilter,
    sortBy,
    selectedColors,
    selectedTypes,
    selectedRarities,
    selectedManaValues,
    advFoilFilter,
  } = opts

  const route = useRoute()
  const router = useRouter()

  // isHydrating guard: prevents state watchers from writing to URL during hydration
  // (pitfall #3 from RESEARCH.md: ping-pong prevention)
  const isHydrating = ref(true)

  // ============================================================
  // Hydrate from URL on creation
  // ============================================================

  const hydrateFromUrl = () => {
    const query = route.query

    // q= → filterQuery
    if (typeof query.q === 'string' && query.q) {
      filterQuery.value = query.q
    }

    // status= → statusFilter (with validation — T-03B-01)
    if (typeof query.status === 'string') {
      const status = query.status
      if ((VALID_STATUS_VALUES as readonly string[]).includes(status)) {
        statusFilter.value = status
      } else {
        statusFilter.value = 'all' // invalid value → default
      }
    }

    // sort= → sortBy (with validation)
    if (typeof query.sort === 'string') {
      const sort = query.sort
      if ((VALID_SORT_VALUES as readonly string[]).includes(sort)) {
        sortBy.value = sort
      }
    }

    // colors= → selectedColors (comma-separated)
    if (typeof query.colors === 'string' && query.colors) {
      selectedColors.value = new Set(query.colors.split(','))
    }

    // types= → selectedTypes
    if (typeof query.types === 'string' && query.types) {
      selectedTypes.value = new Set(query.types.split(','))
    }

    // rarity= → selectedRarities
    if (typeof query.rarity === 'string' && query.rarity) {
      selectedRarities.value = new Set(query.rarity.split(','))
    }

    // mv= → selectedManaValues
    if (typeof query.mv === 'string' && query.mv) {
      selectedManaValues.value = new Set(query.mv.split(','))
    }

    // foil= → advFoilFilter
    if (typeof query.foil === 'string' && query.foil) {
      advFoilFilter.value = query.foil
    }

    // Absorb ?filter=wishlist watcher (from original CollectionView.vue lines 3357-3373)
    if (query.filter === 'wishlist') {
      statusFilter.value = 'wishlist'
    }
  }

  // Hydrate synchronously
  hydrateFromUrl()

  // Release hydrating guard asynchronously (after watchers have a chance to set up)
  void Promise.resolve().then(() => {
    isHydrating.value = false
  })

  // ============================================================
  // State-to-URL sync
  // ============================================================

  const buildQuery = (): Record<string, string | undefined> => {
    const query: Record<string, string | undefined> = {}

    // filterQuery → ?q= (omit if empty)
    if (filterQuery.value) query.q = filterQuery.value

    // statusFilter → ?status= (omit if 'all' — default)
    if (statusFilter.value && statusFilter.value !== 'all') query.status = statusFilter.value

    // sortBy → ?sort= (omit if 'recent' — default)
    if (sortBy.value && sortBy.value !== 'recent') query.sort = sortBy.value

    // Colors — omit if empty
    if (selectedColors.value.size > 0) {
      query.colors = [...selectedColors.value].join(',')
    }

    // Types — omit if empty
    if (selectedTypes.value.size > 0) {
      query.types = [...selectedTypes.value].join(',')
    }

    // Rarities — omit if empty
    if (selectedRarities.value.size > 0) {
      query.rarity = [...selectedRarities.value].join(',')
    }

    // Mana values — omit if empty
    if (selectedManaValues.value.size > 0) {
      query.mv = [...selectedManaValues.value].join(',')
    }

    // Foil filter — omit if 'any' (default)
    if (advFoilFilter.value && advFoilFilter.value !== 'any') {
      query.foil = advFoilFilter.value
    }

    return query
  }

  // Watch all state refs — update URL when any changes (but not during hydration)
  watch(
    [filterQuery, statusFilter, sortBy, selectedColors, selectedTypes, selectedRarities, selectedManaValues, advFoilFilter],
    () => {
      if (isHydrating.value) return
      void router.replace({ query: buildQuery() })
    },
    { deep: true }
  )

  return {
    isHydrating,
  }
}
