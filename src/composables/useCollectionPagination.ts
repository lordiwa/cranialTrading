/**
 * useCollectionPagination — Debounced server-side pagination watcher.
 *
 * Extracted from CollectionView.vue (Plan 03-B, ARCH-02).
 * Watches filter state refs, debounces 300ms, then calls collectionStore.queryPage.
 * Cleanup timer on onScopeDispose.
 * Exposes triggerQuery() for immediate initial mount call.
 */

import { watch, onScopeDispose, type Ref } from 'vue'
import { buildPaginationFilters, buildPaginationSort, type PaginationFilterParams } from '../utils/collectionFilters'

export interface PaginationFilterState {
  filterQuery: Ref<string>
  statusFilter: Ref<string>
  sortBy: Ref<string>
  selectedColors: Ref<Set<string>>
  selectedManaValues: Ref<Set<string>>
  selectedTypes: Ref<Set<string>>
  selectedRarities: Ref<Set<string>>
  advFoilFilter: Ref<string>
  advSelectedSets: Ref<string[]>
  advPriceMin: Ref<number | undefined>
  advPriceMax: Ref<number | undefined>
}

export interface UseCollectionPaginationOptions {
  filterState: PaginationFilterState
  collectionStore: {
    queryPage: (filters: ReturnType<typeof buildPaginationFilters>, sort: ReturnType<typeof buildPaginationSort>) => void
  }
  /** Optional guard ref — if provided, queryPage is only called when viewMode === 'collection' */
  viewMode?: Ref<string>
}

export function useCollectionPagination(opts: UseCollectionPaginationOptions) {
  const { filterState, collectionStore, viewMode } = opts

  let _debounceTimer: ReturnType<typeof setTimeout> | null = null

  const buildFilters = () => {
    const params: PaginationFilterParams = {
      statusFilter: filterState.statusFilter.value as PaginationFilterParams['statusFilter'],
      selectedColors: filterState.selectedColors.value,
      selectedTypes: filterState.selectedTypes.value,
      selectedRarities: filterState.selectedRarities.value,
      selectedManaValues: filterState.selectedManaValues.value,
      filterQuery: filterState.filterQuery.value,
      advFoilFilter: filterState.advFoilFilter.value as PaginationFilterParams['advFoilFilter'],
      advSelectedSets: filterState.advSelectedSets.value,
      advPriceMin: filterState.advPriceMin.value,
      advPriceMax: filterState.advPriceMax.value,
    }
    return buildPaginationFilters(params)
  }

  const buildSort = () => buildPaginationSort(filterState.sortBy.value)

  /** Immediately triggers a queryPage call (for initial mount). */
  const triggerQuery = () => {
    if (viewMode && viewMode.value !== 'collection') return
    collectionStore.queryPage(buildFilters(), buildSort())
  }

  // Debounced watcher: fires queryPage 300ms after any filter ref changes
  // flush: 'sync' ensures watcher fires synchronously on ref mutation
  // (required for debounce timer tests with vi.useFakeTimers)
  watch(
    [
      filterState.filterQuery,
      filterState.statusFilter,
      filterState.sortBy,
      filterState.selectedColors,
      filterState.selectedManaValues,
      filterState.selectedTypes,
      filterState.selectedRarities,
      filterState.advFoilFilter,
      filterState.advSelectedSets,
      filterState.advPriceMin,
      filterState.advPriceMax,
    ],
    () => {
      if (_debounceTimer) clearTimeout(_debounceTimer)
      _debounceTimer = setTimeout(() => {
        if (viewMode && viewMode.value !== 'collection') return
        collectionStore.queryPage(buildFilters(), buildSort())
      }, 300)
    },
    { deep: true, flush: 'sync' }
  )

  // Cleanup timer on scope dispose (component unmount or app teardown)
  onScopeDispose(() => {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer)
      _debounceTimer = null
    }
  })

  return {
    triggerQuery,
  }
}
