import { computed, ref, watch } from 'vue'
import {
  searchAdvanced as defaultSearchAdvanced,
  searchCards as defaultSearchCards,
  type ScryfallCard,
} from '@/services/scryfall'
import { buildQuery, type FilterOptions } from '@/utils/scryfallQuery'

export type DiscoveryScope = 'decks' | 'binders' | 'collection'
export type DiscoveryMode = 'idle' | 'version' | 'discovery'

interface DiscoveryPanelDeps {
  searchCards?: (query: string) => Promise<ScryfallCard[]>
  searchAdvanced?: (
    query: string,
    opts?: { unique?: 'cards' | 'prints' | 'art'; order?: string; dir?: 'asc' | 'desc'; page?: number },
  ) => Promise<ScryfallCard[]>
  debounceMs?: number
  pageSize?: number
  maxPages?: number
}

const COLLAPSED_KEY = {
  version: 'scrum34.discovery.collapsed.versions',
  discovery: 'scrum34.discovery.collapsed.discovery',
} as const

export function useDiscoveryPanel(_scope: DiscoveryScope, deps: DiscoveryPanelDeps = {}) {
  const searchCardsFn = deps.searchCards ?? defaultSearchCards
  const searchAdvancedFn = deps.searchAdvanced ?? defaultSearchAdvanced
  const debounceMs = deps.debounceMs ?? 500
  const pageSize = deps.pageSize ?? 175
  const maxPages = deps.maxPages ?? 3

  const mode = ref<DiscoveryMode>('discovery')
  const results = ref<ScryfallCard[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const page = ref(1)
  const hasMore = ref(false)
  const totalEstimate = ref<number | null>(null)
  const versionCardName = ref<string | null>(null)
  const collapsed = ref(false)

  let currentFilters: FilterOptions | null = null
  let requestId = 0
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const readCollapsedFor = (m: DiscoveryMode): boolean => {
    if (m === 'idle') return false
    try {
      return localStorage.getItem(COLLAPSED_KEY[m]) === 'true'
    } catch { return false }
  }

  const writeCollapsedFor = (m: DiscoveryMode, v: boolean): void => {
    if (m === 'idle') return
    try { localStorage.setItem(COLLAPSED_KEY[m], v ? 'true' : 'false') } catch { /* ignore */ }
  }

  watch(mode, (m) => {
    collapsed.value = readCollapsedFor(m)
  })

  const reset = (): void => {
    results.value = []
    page.value = 1
    hasMore.value = false
    totalEstimate.value = null
    error.value = null
  }

  const openVersionMode = async (cardName: string): Promise<void> => {
    const name = cardName.trim()
    if (!name) return
    const myRequest = ++requestId
    mode.value = 'version'
    versionCardName.value = name
    reset()
    loading.value = true
    try {
      const query = `!"${name}" -is:preview`
      const res = await searchCardsFn(query)
      if (myRequest !== requestId) return
      results.value = res
      hasMore.value = false
    } catch (e) {
      if (myRequest !== requestId) return
      error.value = e instanceof Error ? e.message : 'Error loading prints'
    } finally {
      if (myRequest === requestId) loading.value = false
    }
  }

  const openDiscoveryMode = async (filters: FilterOptions): Promise<void> => {
    const query = buildQuery(filters)
    const myRequest = ++requestId
    mode.value = 'discovery'
    versionCardName.value = null
    currentFilters = filters
    reset()
    if (!query.trim()) return
    loading.value = true
    try {
      const res = await searchAdvancedFn(query, { unique: 'prints', order: 'released', dir: 'desc', page: 1 })
      if (myRequest !== requestId) return
      results.value = res
      hasMore.value = res.length >= pageSize && page.value < maxPages
    } catch (e) {
      if (myRequest !== requestId) return
      error.value = e instanceof Error ? e.message : 'Error loading cards'
    } finally {
      if (myRequest === requestId) loading.value = false
    }
  }

  const loadMore = async (): Promise<void> => {
    if (mode.value !== 'discovery' || !currentFilters) return
    if (!hasMore.value) return
    if (page.value >= maxPages) return
    const myRequest = ++requestId
    const nextPage = page.value + 1
    const query = buildQuery(currentFilters)
    loading.value = true
    try {
      const res = await searchAdvancedFn(query, {
        unique: 'prints', order: 'released', dir: 'desc', page: nextPage,
      })
      if (myRequest !== requestId) return
      page.value = nextPage
      results.value = [...results.value, ...res]
      hasMore.value = res.length >= pageSize && nextPage < maxPages
    } catch (e) {
      if (myRequest !== requestId) return
      error.value = e instanceof Error ? e.message : 'Error loading more'
    } finally {
      if (myRequest === requestId) loading.value = false
    }
  }

  const close = (): void => {
    mode.value = 'idle'
    versionCardName.value = null
    currentFilters = null
    reset()
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    requestId++
  }

  const toggleCollapsed = (): void => {
    collapsed.value = !collapsed.value
    writeCollapsedFor(mode.value, collapsed.value)
  }

  const onFiltersChanged = (filters: FilterOptions, localMatchCount: number, threshold: number): void => {
    if (mode.value === 'version') return
    if (localMatchCount >= threshold) return

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void openDiscoveryMode(filters)
    }, debounceMs)
  }

  const totalShowing = computed(() => results.value.length)

  return {
    mode,
    results,
    loading,
    error,
    page,
    hasMore,
    totalEstimate,
    totalShowing,
    versionCardName,
    collapsed,

    openVersionMode,
    openDiscoveryMode,
    loadMore,
    close,
    toggleCollapsed,
    onFiltersChanged,
  }
}
