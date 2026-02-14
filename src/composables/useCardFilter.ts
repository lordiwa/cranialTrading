import { computed, type ComputedRef, ref, type Ref, watch } from 'vue'
import { useI18n } from './useI18n'

// Minimal shape a card must satisfy to be filterable
export interface FilterableCard {
  name: string
  edition: string
  price?: number
  cmc?: number
  type_line?: string
  colors?: string[]
  condition?: string
  foil?: boolean
  createdAt?: Date
}

// ========== Category helpers ==========

export const getCardTypeCategory = (card: FilterableCard): string => {
  const typeLine = card.type_line?.toLowerCase() || ''
  if (typeLine.includes('creature')) return 'Creatures'
  if (typeLine.includes('instant')) return 'Instants'
  if (typeLine.includes('sorcery')) return 'Sorceries'
  if (typeLine.includes('enchantment')) return 'Enchantments'
  if (typeLine.includes('artifact')) return 'Artifacts'
  if (typeLine.includes('planeswalker')) return 'Planeswalkers'
  if (typeLine.includes('land')) return 'Lands'
  return 'Other'
}

export const getCardManaCategory = (card: FilterableCard): string => {
  const typeLine = card.type_line?.toLowerCase() || ''
  if (typeLine.includes('land')) return 'Lands'
  const cmc = card.cmc ?? 0
  if (cmc >= 10) return '10+'
  return String(cmc)
}

export const getCardColorCategory = (card: FilterableCard): string => {
  const typeLine = card.type_line?.toLowerCase() || ''
  if (typeLine.includes('land')) return 'Lands'

  const colors = card.colors || []
  const validColors = colors.filter((c: string) => ['W', 'U', 'B', 'R', 'G'].includes(c?.toUpperCase()))

  if (validColors.length === 0) return 'Colorless'
  if (validColors.length >= 2) return 'Multicolor'

  const color = validColors[0]?.toUpperCase()
  if (color === 'W') return 'White'
  if (color === 'U') return 'Blue'
  if (color === 'B') return 'Black'
  if (color === 'R') return 'Red'
  if (color === 'G') return 'Green'

  return 'Colorless'
}

// ========== Constants ==========

export const typeOrder = ['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands', 'Other']
export const manaOrder = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']
export const colorOrder = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Lands']

export const colorIconMap: Record<string, string> = {
  'White': 'W', 'Blue': 'U', 'Black': 'B', 'Red': 'R', 'Green': 'G',
  'Multicolor': 'G/W', 'Colorless': 'C', 'Lands': 'Y'
}

// ========== Translation helper ==========

export const translateCategory = (category: string, t: (key: string) => string): string => {
  const key = `decks.editorGrid.categories.${category}`
  const translated = t(key)
  // If t() returns the key itself (not found), fall back to the raw category name
  return translated === key ? category : translated
}

// ========== Composable ==========

export function useCardFilter<T extends FilterableCard>(
  cards: Ref<T[]> | ComputedRef<T[]>
) {
  const { t } = useI18n()

  // --- State ---
  const filterQuery = ref('')
  const sortBy = ref<'recent' | 'name' | 'price'>('recent')
  const groupBy = ref<'none' | 'type' | 'mana' | 'color'>('none')

  const selectedColors = ref<Set<string>>(new Set(colorOrder))
  const selectedManaValues = ref<Set<string>>(new Set(manaOrder))
  const selectedTypes = ref<Set<string>>(new Set(typeOrder))

  // Reset chip filters when groupBy goes to 'none'
  watch(groupBy, (val) => {
    if (val === 'none') {
      selectedColors.value = new Set(colorOrder)
      selectedManaValues.value = new Set(manaOrder)
      selectedTypes.value = new Set(typeOrder)
    }
  })

  // --- Toggle helpers ---
  const toggleSet = (set: Set<string>, cat: string): Set<string> => {
    const s = new Set(set)
    if (s.has(cat)) s.delete(cat)
    else s.add(cat)
    return s
  }
  const toggleColor = (cat: string) => { selectedColors.value = toggleSet(selectedColors.value, cat) }
  const toggleMana = (cat: string) => { selectedManaValues.value = toggleSet(selectedManaValues.value, cat) }
  const toggleType = (cat: string) => { selectedTypes.value = toggleSet(selectedTypes.value, cat) }

  // --- Chip filter check ---
  const passesChipFilters = (card: T): boolean => {
    const color = getCardColorCategory(card)
    if (selectedColors.value.size > 0 && selectedColors.value.size < colorOrder.length && !selectedColors.value.has(color)) return false
    const mana = getCardManaCategory(card)
    if (selectedManaValues.value.size > 0 && selectedManaValues.value.size < manaOrder.length && !selectedManaValues.value.has(mana)) return false
    const type = getCardTypeCategory(card)
    if (selectedTypes.value.size > 0 && selectedTypes.value.size < typeOrder.length && !selectedTypes.value.has(type)) return false
    return true
  }

  const hasActiveFilters = computed(() => {
    return selectedColors.value.size < colorOrder.length
      || selectedManaValues.value.size < manaOrder.length
      || selectedTypes.value.size < typeOrder.length
  })

  // --- Sort ---
  const sortCards = (list: T[]): T[] => {
    const sorted = [...list]
    switch (sortBy.value) {
      case 'recent':
        sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : ((a as any).addedAt ? new Date((a as any).addedAt).getTime() : 0)
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : ((b as any).addedAt ? new Date((b as any).addedAt).getTime() : 0)
          return dateB - dateA
        })
        break
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'price':
        sorted.sort((a, b) => (b.price || 0) - (a.price || 0))
        break
    }
    return sorted
  }

  // --- Filtered cards (text search + sort + chip filters) ---
  const filteredCards = computed(() => {
    let result = cards.value

    // Text search
    if (filterQuery.value.trim()) {
      const q = filterQuery.value.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.edition.toLowerCase().includes(q)
      )
    }

    // Chip filters
    if (hasActiveFilters.value) {
      result = result.filter(passesChipFilters)
    }

    // Sort
    result = sortCards(result)

    return result
  })

  // --- Category helper ---
  const getCardCategory = (card: T): string => {
    switch (groupBy.value) {
      case 'mana': return getCardManaCategory(card)
      case 'color': return getCardColorCategory(card)
      case 'type': return getCardTypeCategory(card)
      default: return 'all'
    }
  }

  const getCategoryOrder = (): string[] => {
    switch (groupBy.value) {
      case 'mana': return manaOrder
      case 'color': return colorOrder
      case 'type': return typeOrder
      default: return []
    }
  }

  // --- Grouped cards ---
  const groupedCards = computed(() => {
    const source = filteredCards.value

    if (groupBy.value === 'none') {
      return [{ type: 'all', cards: source }]
    }

    const groups: Record<string, T[]> = {}
    const order = getCategoryOrder()

    for (const card of source) {
      const category = getCardCategory(card)
      if (!groups[category]) groups[category] = []
      groups[category].push(card)
    }

    // Sort within groups
    for (const category in groups) {
      const group = groups[category]
      if (group) {
        groups[category] = sortCards(group)
      }
    }

    const sortedGroups: { type: string; cards: T[] }[] = []
    for (const category of order) {
      const group = groups[category]
      if (group && group.length > 0) {
        sortedGroups.push({ type: category, cards: group })
      }
    }
    // Any categories not in the predefined order
    for (const category in groups) {
      const group = groups[category]
      if (!order.includes(category) && group && group.length > 0) {
        sortedGroups.push({ type: category, cards: group })
      }
    }

    return sortedGroups
  })

  // Translate with local t
  const translate = (category: string): string => translateCategory(category, t)

  return {
    // State
    filterQuery,
    sortBy,
    groupBy,
    selectedColors,
    selectedManaValues,
    selectedTypes,

    // Toggles
    toggleColor,
    toggleMana,
    toggleType,

    // Computed
    hasActiveFilters,
    filteredCards,
    groupedCards,

    // Translation
    translateCategory: translate,
  }
}
