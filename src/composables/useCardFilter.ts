import { computed, type ComputedRef, ref, type Ref, watch } from 'vue'
import { useI18n } from './useI18n'

// Minimal shape a card must satisfy to be filterable
export interface FilterableCard {
  name: string
  edition: string
  setCode?: string
  price?: number
  cmc?: number
  type_line?: string
  colors?: string[]
  rarity?: string
  condition?: string
  foil?: boolean
  createdAt?: Date
  power?: string
  toughness?: string
  oracle_text?: string
  keywords?: string[]
  legalities?: Record<string, string>
  full_art?: boolean
}

// ========== Category helpers ==========

export const getCardRarityCategory = (card: FilterableCard): string => {
  const rarity = card.rarity?.toLowerCase() || ''
  if (rarity === 'common') return 'Common'
  if (rarity === 'uncommon') return 'Uncommon'
  if (rarity === 'rare') return 'Rare'
  if (rarity === 'mythic') return 'Mythic'
  return 'Unknown'
}

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

export const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Mythic', 'Unknown']

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
  const selectedRarities = ref<Set<string>>(new Set(rarityOrder))

  // --- Advanced filter state ---
  const advPriceMin = ref<number | undefined>(undefined)
  const advPriceMax = ref<number | undefined>(undefined)
  const advFoilFilter = ref<'any' | 'foil' | 'nonfoil'>('any')
  const advSelectedSets = ref<string[]>([])
  const advSelectedKeywords = ref<string[]>([])
  const advSelectedFormats = ref<string[]>([])
  const advFullArtOnly = ref(false)
  const advPowerMin = ref<number | undefined>(undefined)
  const advPowerMax = ref<number | undefined>(undefined)
  const advToughnessMin = ref<number | undefined>(undefined)
  const advToughnessMax = ref<number | undefined>(undefined)

  // Reset chip filters when groupBy goes to 'none'
  watch(groupBy, (val) => {
    if (val === 'none') {
      selectedColors.value = new Set(colorOrder)
      selectedManaValues.value = new Set(manaOrder)
      selectedTypes.value = new Set(typeOrder)
      selectedRarities.value = new Set(rarityOrder)
    }
  })

  // --- Toggle helpers ---
  const toggleSetHelper = (set: Set<string>, cat: string): Set<string> => {
    const s = new Set(set)
    if (s.has(cat)) s.delete(cat)
    else s.add(cat)
    return s
  }
  const toggleColor = (cat: string) => { selectedColors.value = toggleSetHelper(selectedColors.value, cat) }
  const toggleMana = (cat: string) => { selectedManaValues.value = toggleSetHelper(selectedManaValues.value, cat) }
  const toggleType = (cat: string) => { selectedTypes.value = toggleSetHelper(selectedTypes.value, cat) }
  const toggleRarity = (cat: string) => { selectedRarities.value = toggleSetHelper(selectedRarities.value, cat) }

  // --- Advanced toggle helpers ---
  const toggleAdvSet = (setCode: string) => {
    const idx = advSelectedSets.value.indexOf(setCode)
    if (idx > -1) advSelectedSets.value.splice(idx, 1)
    else advSelectedSets.value.push(setCode)
  }

  const toggleAdvKeyword = (keyword: string) => {
    const idx = advSelectedKeywords.value.indexOf(keyword)
    if (idx > -1) advSelectedKeywords.value.splice(idx, 1)
    else advSelectedKeywords.value.push(keyword)
  }

  const toggleAdvFormat = (format: string) => {
    const idx = advSelectedFormats.value.indexOf(format)
    if (idx > -1) advSelectedFormats.value.splice(idx, 1)
    else advSelectedFormats.value.push(format)
  }

  // --- Chip filter check ---
  const passesChipFilters = (card: T): boolean => {
    const color = getCardColorCategory(card)
    if (selectedColors.value.size > 0 && selectedColors.value.size < colorOrder.length && !selectedColors.value.has(color)) return false
    const mana = getCardManaCategory(card)
    if (selectedManaValues.value.size > 0 && selectedManaValues.value.size < manaOrder.length && !selectedManaValues.value.has(mana)) return false
    const type = getCardTypeCategory(card)
    if (selectedTypes.value.size > 0 && selectedTypes.value.size < typeOrder.length && !selectedTypes.value.has(type)) return false
    const rarity = getCardRarityCategory(card)
    if (selectedRarities.value.size > 0 && selectedRarities.value.size < rarityOrder.length && !selectedRarities.value.has(rarity)) return false
    return true
  }

  // --- Advanced filter check ---
  const passesAdvancedFilters = (card: T): boolean => {
    // Price range
    if (advPriceMin.value !== undefined && (card.price === undefined || card.price < advPriceMin.value)) return false
    if (advPriceMax.value !== undefined && (card.price === undefined || card.price > advPriceMax.value)) return false

    // Foil filter
    if (advFoilFilter.value === 'foil' && !card.foil) return false
    if (advFoilFilter.value === 'nonfoil' && card.foil) return false

    // Sets
    if (advSelectedSets.value.length > 0) {
      const cardSet = card.setCode?.toLowerCase() || ''
      if (!advSelectedSets.value.some(s => s.toLowerCase() === cardSet)) return false
    }

    // Keywords - check oracle_text and keywords array
    if (advSelectedKeywords.value.length > 0) {
      const oracleText = card.oracle_text?.toLowerCase() || ''
      const cardKeywords = card.keywords?.map(k => k.toLowerCase()) || []
      const typeLine = card.type_line?.toLowerCase() || ''
      for (const kw of advSelectedKeywords.value) {
        const kwLower = kw.toLowerCase()
        if (!oracleText.includes(kwLower) && !cardKeywords.includes(kwLower) && !typeLine.includes(kwLower)) return false
      }
    }

    // Format legality
    if (advSelectedFormats.value.length > 0) {
      if (!card.legalities) return false
      for (const fmt of advSelectedFormats.value) {
        if (card.legalities[fmt] !== 'legal') return false
      }
    }

    // Full art
    if (advFullArtOnly.value && !card.full_art) return false

    // Power range
    if (advPowerMin.value !== undefined || advPowerMax.value !== undefined) {
      const pow = card.power !== undefined ? Number.parseFloat(card.power) : NaN
      if (Number.isNaN(pow)) return false
      if (advPowerMin.value !== undefined && pow < advPowerMin.value) return false
      if (advPowerMax.value !== undefined && pow > advPowerMax.value) return false
    }

    // Toughness range
    if (advToughnessMin.value !== undefined || advToughnessMax.value !== undefined) {
      const tou = card.toughness !== undefined ? Number.parseFloat(card.toughness) : NaN
      if (Number.isNaN(tou)) return false
      if (advToughnessMin.value !== undefined && tou < advToughnessMin.value) return false
      if (advToughnessMax.value !== undefined && tou > advToughnessMax.value) return false
    }

    return true
  }

  const hasActiveFilters = computed(() => {
    return selectedColors.value.size < colorOrder.length
      || selectedManaValues.value.size < manaOrder.length
      || selectedTypes.value.size < typeOrder.length
      || selectedRarities.value.size < rarityOrder.length
  })

  const hasActiveAdvancedFilters = computed(() => {
    return advPriceMin.value !== undefined
      || advPriceMax.value !== undefined
      || advFoilFilter.value !== 'any'
      || advSelectedSets.value.length > 0
      || advSelectedKeywords.value.length > 0
      || advSelectedFormats.value.length > 0
      || advFullArtOnly.value
      || advPowerMin.value !== undefined
      || advPowerMax.value !== undefined
      || advToughnessMin.value !== undefined
      || advToughnessMax.value !== undefined
  })

  const advancedFilterCount = computed(() => {
    let count = 0
    if (advPriceMin.value !== undefined || advPriceMax.value !== undefined) count++
    if (advFoilFilter.value !== 'any') count++
    if (advSelectedSets.value.length > 0) count++
    if (advSelectedKeywords.value.length > 0) count++
    if (advSelectedFormats.value.length > 0) count++
    if (advFullArtOnly.value) count++
    if (advPowerMin.value !== undefined || advPowerMax.value !== undefined) count++
    if (advToughnessMin.value !== undefined || advToughnessMax.value !== undefined) count++
    return count
  })

  // Unique sets from the user's cards
  const collectionSets = computed(() => {
    const setMap = new Map<string, { code: string; name: string }>()
    for (const card of cards.value) {
      const code = card.setCode?.toUpperCase()
      if (code && !setMap.has(code)) {
        setMap.set(code, { code, name: card.edition })
      }
    }
    return [...setMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  })

  const resetAdvancedFilters = () => {
    advPriceMin.value = undefined
    advPriceMax.value = undefined
    advFoilFilter.value = 'any'
    advSelectedSets.value = []
    advSelectedKeywords.value = []
    advSelectedFormats.value = []
    advFullArtOnly.value = false
    advPowerMin.value = undefined
    advPowerMax.value = undefined
    advToughnessMin.value = undefined
    advToughnessMax.value = undefined
  }

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

  // --- Filtered cards (text search + sort + chip filters + advanced filters) ---
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

    // Advanced filters
    if (hasActiveAdvancedFilters.value) {
      result = result.filter(passesAdvancedFilters)
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
    selectedRarities,

    // Toggles
    toggleColor,
    toggleMana,
    toggleType,
    toggleRarity,

    // Advanced filter state
    advPriceMin,
    advPriceMax,
    advFoilFilter,
    advSelectedSets,
    advSelectedKeywords,
    advSelectedFormats,
    advFullArtOnly,
    advPowerMin,
    advPowerMax,
    advToughnessMin,
    advToughnessMax,

    // Advanced toggles
    toggleAdvSet,
    toggleAdvKeyword,
    toggleAdvFormat,

    // Computed
    hasActiveFilters,
    hasActiveAdvancedFilters,
    advancedFilterCount,
    collectionSets,
    filteredCards,
    groupedCards,

    // Advanced reset
    resetAdvancedFilters,

    // Translation
    translateCategory: translate,
  }
}
