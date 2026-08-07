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

  /**
   * Generation token. Cancelling the debounce only helps while the request has not
   * been SENT yet; once it is in flight, erasing or retyping used to leave it
   * current, so whichever response landed last won regardless of which query it
   * belonged to. Same pattern as stores/search.ts (TASK-108) and queryPage
   * (_queryGeneration, TASK-113/116).
   */
  let reqGen = 0

  /** Cancel the pending debounce AND invalidate anything already in flight. */
  const invalidatePending = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
      debounceTimeout = null
    }
    reqGen++
  }

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
  const fetchScryfallSuggestions = async (q: string, gen: number) => {
    try {
      const results = await getCardSuggestions(q)
      if (gen !== reqGen) return // superseded — the query changed or was erased
      const localNames = new Set(localMatches.value.map(c => c.name.toLowerCase()))
      scryfallSuggestions.value = results
        .filter(name => !localNames.has(name.toLowerCase()))
        .slice(0, 5)
    } catch (err) {
      if (gen !== reqGen) return
      console.error('Error fetching suggestions:', err)
      scryfallSuggestions.value = []
    } finally {
      // Only the newest request owns the flag — otherwise a stale response clears
      // it while a newer request is still pending.
      if (gen === reqGen) isLoading.value = false
    }
  }

  // Scryfall: debounced API call, filtering out names already in local
  const updateScryfallSuggestions = (q: string) => {
    invalidatePending()

    if (q.trim().length < 2) {
      scryfallSuggestions.value = []
      isLoading.value = false
      return
    }

    const gen = reqGen
    isLoading.value = true
    debounceTimeout = setTimeout(() => { void fetchScryfallSuggestions(q, gen) }, 300)
  }

  watch(query, (q) => {
    updateLocalMatches(q)
    updateScryfallSuggestions(q)
  })

  const showDropdown = computed(() => {
    return query.value.trim().length > 0 && (localMatches.value.length > 0 || scryfallSuggestions.value.length > 0)
  })

  const clearSuggestions = () => {
    invalidatePending()
    isLoading.value = false
    localMatches.value = []
    scryfallSuggestions.value = []
  }

  onUnmounted(() => {
    invalidatePending()
  })

  return {
    localMatches,
    scryfallSuggestions,
    isLoading,
    showDropdown,
    clearSuggestions,
  }
}
