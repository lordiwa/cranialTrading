/**
 * Pure filter/sort mapping utilities for CollectionView server-side pagination.
 * These functions have zero side effects — no store imports, no composable calls.
 *
 * Extracted from CollectionView.vue (Plan 03-A) for reuse by Plans B and C.
 */

import type { CardStatus } from '../types/card'

// ============================================================
// Filter parameter shape
// ============================================================

export interface PaginationFilterParams {
  statusFilter: 'all' | 'owned' | 'available' | CardStatus
  selectedColors: Set<string>
  selectedTypes: Set<string>
  selectedRarities: Set<string>
  selectedManaValues: Set<string>
  filterQuery: string
  advFoilFilter: 'any' | 'foil'
  advSelectedSets: string[]
  advPriceMin: number | undefined
  advPriceMax: number | undefined
}

// ============================================================
// Mapping constants
// ============================================================

/** Display category → color letter for Scryfall/server color filter */
export const colorToServerMap: Record<string, string> = { White: 'W', Blue: 'U', Black: 'B', Red: 'R', Green: 'G', Colorless: 'C' }

/** Display category → server type string */
export const typeToServerMap: Record<string, string> = {
  Creatures: 'creature',
  Instants: 'instant',
  Sorceries: 'sorcery',
  Enchantments: 'enchantment',
  Artifacts: 'artifact',
  Planeswalkers: 'planeswalker',
  Lands: 'land',
}

/** Display category → server rarity string */
export const rarityToServerMap: Record<string, string> = {
  Common: 'common',
  Uncommon: 'uncommon',
  Rare: 'rare',
  Mythic: 'mythic',
}

/** Mana display value to server map — mana values are passed as-is */
export const manaToServerMap: Record<string, number | string> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10+': 10,
}

// ============================================================
// Pure helper functions (verbatim extraction from CollectionView.vue)
// ============================================================

/** Build a filters object for queryCardIndex from current filter state */
export const buildPaginationFilters = (params: PaginationFilterParams): {
  search?: string
  status?: string[]
  edition?: string[]
  color?: string[]
  rarity?: string[]
  type?: string[]
  foil?: boolean
  condition?: undefined
  minPrice?: number
  maxPrice?: number
} => {
  const {
    statusFilter,
    selectedColors,
    selectedTypes,
    selectedRarities,
    filterQuery,
    advFoilFilter,
    advSelectedSets,
    advPriceMin,
    advPriceMax,
  } = params

  // All possible color/type/rarity values (for "no filter" detection)
  const colorOrder = ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']
  const typeOrder = ['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']
  const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Mythic']

  // Map status filter to server format
  let statusArr: string[] | undefined
  if (statusFilter === 'owned') {
    statusArr = ['collection', 'sale', 'trade']
  } else if (statusFilter === 'available') {
    statusArr = ['sale', 'trade']
  } else if (statusFilter !== 'all') {
    statusArr = [statusFilter]
  }

  // Map color display categories to color letters for server
  const colorMap: Record<string, string> = { White: 'W', Blue: 'U', Black: 'B', Red: 'R', Green: 'G', Colorless: 'C' }
  const colorArr = selectedColors.size < colorOrder.length
    ? [...selectedColors].map(c => colorMap[c]).filter(Boolean) as string[] // eslint-disable-line security/detect-object-injection
    : undefined

  // Map rarity display categories to server format
  const rarityMap: Record<string, string> = { Common: 'common', Uncommon: 'uncommon', Rare: 'rare', Mythic: 'mythic' }
  const rarityArr = selectedRarities.size < rarityOrder.length
    ? [...selectedRarities].map(r => rarityMap[r]).filter(Boolean) as string[] // eslint-disable-line security/detect-object-injection
    : undefined

  // Map type display categories to server format
  const typeMap: Record<string, string> = { Creatures: 'creature', Instants: 'instant', Sorceries: 'sorcery', Enchantments: 'enchantment', Artifacts: 'artifact', Planeswalkers: 'planeswalker', Lands: 'land' }
  const typeArr = selectedTypes.size < typeOrder.length
    ? [...selectedTypes].map(t => typeMap[t]).filter(Boolean) as string[] // eslint-disable-line security/detect-object-injection
    : undefined

  // Map foil filter
  const foilVal = advFoilFilter === 'foil' ? true : undefined

  // Map condition — not currently tracked as chip filter; skip if not filtered
  const conditionArr = undefined

  // Map edition (advanced sets filter)
  const editionArr = advSelectedSets.length > 0 ? advSelectedSets : undefined

  return {
    search: filterQuery.trim() || undefined,
    status: statusArr,
    edition: editionArr,
    color: colorArr,
    rarity: rarityArr,
    type: typeArr,
    foil: foilVal,
    condition: conditionArr,
    minPrice: advPriceMin,
    maxPrice: advPriceMax,
  }
}

/** Build a sort object for queryCardIndex from current sort state */
export const buildPaginationSort = (sortBy: string): { field: 'name' | 'price' | 'edition' | 'quantity' | 'dateAdded'; direction: 'asc' | 'desc' } => {
  // Map client sort values to server field names
  const fieldMap: Record<string, 'name' | 'price' | 'edition' | 'quantity' | 'dateAdded'> = {
    name: 'name',
    price: 'price',
    recent: 'dateAdded',
    edition: 'edition',
    quantity: 'quantity',
  }
  return {
    field: fieldMap[sortBy] ?? 'name', // eslint-disable-line security/detect-object-injection
    direction: sortBy === 'name' ? 'asc' : 'desc',
  }
}
