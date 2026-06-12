import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from './useI18n'
import { getCardSuggestions } from '../services/scryfall'

export type { PublicCardResult } from '../services/publicCardSearch'

const MAX_SUGGESTIONS = 8
const SEARCH_DEBOUNCE_MS = 300

/**
 * Lightweight header search (TASK-076) — Card Kingdom style.
 *
 * While typing, the only network traffic is Scryfall's /cards/autocomplete
 * endpoint (name strings, ~1KB, cached in the service). No Firestore reads,
 * no card images. Selecting a suggestion or pressing Enter navigates to the
 * /search results page, which owns the heavy multi-source search.
 */
export function useGlobalSearch() {
  const router = useRouter()
  const { t } = useI18n()

  const searchQuery = ref('')
  const isOpen = ref(false)
  const loading = ref(false)
  const suggestions = ref<string[]>([])

  // ── Keyboard nav state (ARIA combobox — D-05, D-20) ─────────────────────────
  const highlightedIndex = ref(-1)
  const activeDescendantId = ref<string | null>(null)

  // ── Live region state (D-12, D-15) ───────────────────────────────────────────
  const ariaLiveMessage = ref('')
  let liveRegionTimeout: ReturnType<typeof setTimeout> | null = null

  // ── isExpanded — popup actually rendered (D-06 Pitfall 1) ────────────────────
  const isExpanded = computed(() =>
    isOpen.value && (loading.value || suggestions.value.length > 0)
  )

  // ── Debounced live-region update (D-12) ──────────────────────────────────────
  const scheduleLiveRegionUpdate = (message: string): void => {
    if (liveRegionTimeout) clearTimeout(liveRegionTimeout)
    liveRegionTimeout = setTimeout(() => {
      ariaLiveMessage.value = message
    }, 500)
  }

  // Debounced search + stale-response guard
  let searchTimeout: ReturnType<typeof setTimeout> | null = null
  let searchSeq = 0

  const resetHighlight = () => {
    highlightedIndex.value = -1
    activeDescendantId.value = null
  }

  const clearResults = () => {
    suggestions.value = []
    resetHighlight()
  }

  const handleInput = () => {
    if (searchTimeout) clearTimeout(searchTimeout)

    if (searchQuery.value.length < 2) {
      clearResults()
      return
    }

    searchTimeout = setTimeout(() => {
      void performSearch()
    }, SEARCH_DEBOUNCE_MS)
  }

  const performSearch = async () => {
    if (searchQuery.value.length < 2) return

    // Immediate "searching" announcement (no debounce — D-13)
    ariaLiveMessage.value = t('header.search.searching')

    loading.value = true
    isOpen.value = true

    const seq = ++searchSeq
    try {
      const names = await getCardSuggestions(searchQuery.value)
      if (seq !== searchSeq) return // a newer search owns the results now
      suggestions.value = names.slice(0, MAX_SUGGESTIONS)
      resetHighlight()
    } finally {
      if (seq === searchSeq) {
        loading.value = false
        const count = suggestions.value.length
        const countKey = count === 1
          ? 'header.search.suggestionsCountSingular'
          : 'header.search.suggestionsCount'
        scheduleLiveRegionUpdate(t(countKey, { count }))
      }
    }
  }

  const clearSearch = () => {
    searchQuery.value = ''
    clearResults()
    isOpen.value = false
  }

  // ── Navigation — every selection lands on the /search results page ──────────
  const goToResults = (name?: string) => {
    const q = (name ?? searchQuery.value).trim()
    isOpen.value = false
    searchQuery.value = ''
    clearResults()
    if (!q) return
    void router.push({ path: '/search', query: { q } })
  }

  // ── Keyboard movement (D-02 — wrap + home/end) ───────────────────────────────
  const moveHighlight = (direction: 'up' | 'down' | 'home' | 'end'): void => {
    if (suggestions.value.length === 0) {
      resetHighlight()
      return
    }
    const lastIndex = suggestions.value.length - 1
    if (direction === 'home') {
      highlightedIndex.value = 0
    } else if (direction === 'end') {
      highlightedIndex.value = lastIndex
    } else if (direction === 'down') {
      highlightedIndex.value = highlightedIndex.value >= lastIndex
        ? 0
        : highlightedIndex.value + 1
    } else {
      // up
      highlightedIndex.value = highlightedIndex.value <= 0
        ? lastIndex
        : highlightedIndex.value - 1
    }
    activeDescendantId.value = `option-suggestion-${highlightedIndex.value}`
  }

  // ── Enter key handler (D-03) ──────────────────────────────────────────────────
  const selectHighlighted = (): void => {
    const index = highlightedIndex.value
    if (index >= 0 && index < suggestions.value.length) {
      goToResults(suggestions.value[index])
      return
    }
    goToResults()
  }

  // ── Route resolver for :to= binding on RouterLink (D-21) ─────────────────────
  // Templates bind :to="resolveSuggestionRoute(name)" for Cmd+click / middle-click
  // support. Do NOT use @click.prevent on RouterLink (D-09).
  const resolveSuggestionRoute = (name: string) => ({
    path: '/search',
    query: { q: name },
  })

  return {
    searchQuery,
    isOpen,
    loading,
    suggestions,
    handleInput,
    performSearch,
    clearResults,
    clearSearch,
    goToResults,
    highlightedIndex,
    activeDescendantId,
    ariaLiveMessage,
    isExpanded,
    moveHighlight,
    selectHighlighted,
    scheduleLiveRegionUpdate,
    resolveSuggestionRoute,
  }
}
