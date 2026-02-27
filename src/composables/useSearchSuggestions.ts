import { computed, onUnmounted, type Ref, ref, watch } from 'vue'
import { useCollectionStore } from '../stores/collection'
import { getCardSuggestions } from '../services/scryfall'
import type { Card } from '../types/card'

export function useSearchSuggestions(query: Ref<string>) {
  const collectionStore = useCollectionStore()

  const localMatches = ref<Card[]>([])
  const scryfallSuggestions = ref<string[]>([])
  const isLoading = ref(false)

  let debounceTimeout: ReturnType<typeof setTimeout> | null = null

  // Local: filter collection cards by name (instant, no API)
  const updateLocalMatches = (q: string) => {
    if (!q.trim()) {
      localMatches.value = []
      return
    }
    const lower = q.toLowerCase()
    // Deduplicate by card name, keep first match per name
    const seen = new Set<string>()
    const matches: Card[] = []
    for (const card of collectionStore.cards) {
      if (card.name.toLowerCase().includes(lower) && !seen.has(card.name.toLowerCase())) {
        seen.add(card.name.toLowerCase())
        matches.push(card)
        if (matches.length >= 5) break
      }
    }
    localMatches.value = matches
  }

  // Scryfall: fetch and filter suggestions (called after debounce)
  const fetchScryfallSuggestions = async (q: string) => {
    try {
      const results = await getCardSuggestions(q)
      const localNames = new Set(localMatches.value.map(c => c.name.toLowerCase()))
      scryfallSuggestions.value = results
        .filter(name => !localNames.has(name.toLowerCase()))
        .slice(0, 5)
    } catch (err) {
      console.error('Error fetching suggestions:', err)
      scryfallSuggestions.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Scryfall: debounced API call, filtering out names already in local
  const updateScryfallSuggestions = (q: string) => {
    if (debounceTimeout) clearTimeout(debounceTimeout)

    if (q.trim().length < 2) {
      scryfallSuggestions.value = []
      isLoading.value = false
      return
    }

    isLoading.value = true
    debounceTimeout = setTimeout(() => { void fetchScryfallSuggestions(q) }, 300)
  }

  watch(query, (q) => {
    updateLocalMatches(q)
    updateScryfallSuggestions(q)
  })

  const showDropdown = computed(() => {
    return query.value.trim().length > 0 && (localMatches.value.length > 0 || scryfallSuggestions.value.length > 0)
  })

  const clearSuggestions = () => {
    localMatches.value = []
    scryfallSuggestions.value = []
  }

  onUnmounted(() => {
    if (debounceTimeout) clearTimeout(debounceTimeout)
  })

  return {
    localMatches,
    scryfallSuggestions,
    isLoading,
    showDropdown,
    clearSuggestions,
  }
}
