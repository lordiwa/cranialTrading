import { describe, it, expect } from 'vitest'
import { buildPaginationFilters, buildPaginationSort, selectCollectionDisplayCards } from '../../../src/utils/collectionFilters'

describe('collectionFilters', () => {
  describe('buildPaginationFilters', () => {
    it('returns empty filters when no filters active (all defaults)', () => {
      const result = buildPaginationFilters({
        statusFilter: 'all',
        selectedColors: new Set(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']),
        selectedTypes: new Set(['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: '',
        advFoilFilter: 'any',
        advSelectedSets: [],
        advPriceMin: undefined,
        advPriceMax: undefined,
      })
      expect(result.status).toBeUndefined()
      expect(result.color).toBeUndefined()
      expect(result.type).toBeUndefined()
      expect(result.rarity).toBeUndefined()
      expect(result.foil).toBeUndefined()
      expect(result.search).toBeUndefined()
      expect(result.edition).toBeUndefined()
    })

    it('maps statusFilter owned to collection|sale|trade', () => {
      const result = buildPaginationFilters({
        statusFilter: 'owned',
        selectedColors: new Set(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']),
        selectedTypes: new Set(['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: '',
        advFoilFilter: 'any',
        advSelectedSets: [],
        advPriceMin: undefined,
        advPriceMax: undefined,
      })
      expect(result.status).toEqual(['collection', 'sale', 'trade'])
    })

    it('maps statusFilter available to sale|trade', () => {
      const result = buildPaginationFilters({
        statusFilter: 'available',
        selectedColors: new Set(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']),
        selectedTypes: new Set(['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: '',
        advFoilFilter: 'any',
        advSelectedSets: [],
        advPriceMin: undefined,
        advPriceMax: undefined,
      })
      expect(result.status).toEqual(['sale', 'trade'])
    })

    it('maps White to W', () => {
      const result = buildPaginationFilters({
        statusFilter: 'all',
        selectedColors: new Set(['White']),
        selectedTypes: new Set(['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: '',
        advFoilFilter: 'any',
        advSelectedSets: [],
        advPriceMin: undefined,
        advPriceMax: undefined,
      })
      expect(result.color).toEqual(['W'])
    })

    it('maps Creatures to creature', () => {
      const result = buildPaginationFilters({
        statusFilter: 'all',
        selectedColors: new Set(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']),
        selectedTypes: new Set(['Creatures']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: '',
        advFoilFilter: 'any',
        advSelectedSets: [],
        advPriceMin: undefined,
        advPriceMax: undefined,
      })
      expect(result.type).toEqual(['creature'])
    })

    it('maps foil filter correctly', () => {
      const result = buildPaginationFilters({
        statusFilter: 'all',
        selectedColors: new Set(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']),
        selectedTypes: new Set(['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: '',
        advFoilFilter: 'foil',
        advSelectedSets: [],
        advPriceMin: undefined,
        advPriceMax: undefined,
      })
      expect(result.foil).toBe(true)
    })

    it('includes search text when filterQuery is set', () => {
      const result = buildPaginationFilters({
        statusFilter: 'all',
        selectedColors: new Set(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']),
        selectedTypes: new Set(['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: 'Lightning',
        advFoilFilter: 'any',
        advSelectedSets: [],
        advPriceMin: undefined,
        advPriceMax: undefined,
      })
      expect(result.search).toBe('Lightning')
    })

    it('maps edition sets filter', () => {
      const result = buildPaginationFilters({
        statusFilter: 'all',
        selectedColors: new Set(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']),
        selectedTypes: new Set(['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: '',
        advFoilFilter: 'any',
        advSelectedSets: ['M25', 'NEO'],
        advPriceMin: undefined,
        advPriceMax: undefined,
      })
      expect(result.edition).toEqual(['M25', 'NEO'])
    })

    it('maps minPrice and maxPrice', () => {
      const result = buildPaginationFilters({
        statusFilter: 'all',
        selectedColors: new Set(['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']),
        selectedTypes: new Set(['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands']),
        selectedRarities: new Set(['Common', 'Uncommon', 'Rare', 'Mythic']),
        selectedManaValues: new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Lands']),
        filterQuery: '',
        advFoilFilter: 'any',
        advSelectedSets: [],
        advPriceMin: 1,
        advPriceMax: 100,
      })
      expect(result.minPrice).toBe(1)
      expect(result.maxPrice).toBe(100)
    })
  })

  describe('buildPaginationSort', () => {
    it('maps recent to dateAdded desc', () => {
      const result = buildPaginationSort('recent')
      expect(result.field).toBe('dateAdded')
      expect(result.direction).toBe('desc')
    })

    it('maps name to name asc', () => {
      const result = buildPaginationSort('name')
      expect(result.field).toBe('name')
      expect(result.direction).toBe('asc')
    })

    it('maps price to price desc', () => {
      const result = buildPaginationSort('price')
      expect(result.field).toBe('price')
      expect(result.direction).toBe('desc')
    })

    it('maps edition to edition desc', () => {
      const result = buildPaginationSort('edition')
      expect(result.field).toBe('edition')
      expect(result.direction).toBe('desc')
    })

    it('defaults field to name for unknown sort (direction is desc per verbatim logic)', () => {
      // Verbatim from CollectionView.vue: direction = sortBy === 'name' ? 'asc' : 'desc'
      // An unknown sortBy is not 'name', so direction is 'desc'
      const result = buildPaginationSort('unknown')
      expect(result.field).toBe('name')
      expect(result.direction).toBe('desc')
    })
  })

  // TASK-156: regression test for "el buscador devuelve cartas ajenas al termino".
  // Reproduced mechanism: collectionStore.paginatedCards keeps the PREVIOUS query's
  // results until the new response lands — queryPage only replaces the array on
  // success (src/stores/collection.ts). Displaying that stale array while a new
  // search is in flight (loading === true) is exactly the reported symptom: cards
  // unrelated to what the user just typed. This test looks at the CARDS returned,
  // not at any input value.
  describe('selectCollectionDisplayCards', () => {
    const staleUnrelatedCards = [
      { id: 'a', name: 'Emeritus of Conflict' },
      { id: 'b', name: 'Soul-Guide Lantern' },
      { id: 'c', name: 'Szarel, Genesis Shepherd' },
    ]
    const freshMatchingCards = [{ id: 'z', name: 'Lightning Bolt' }]

    it('BUG: does not surface the previous query results while a new one is loading', () => {
      // Grid already mounted with an unrelated default query; user just typed a new
      // search term, debounce fired queryPage(), and the CF round-trip is still in
      // flight (loading === true) — paginatedCards has not been replaced yet.
      const result = selectCollectionDisplayCards({
        usesUnsupportedServerFilter: false,
        loading: true,
        paginatedCards: staleUnrelatedCards,
        filteredCards: freshMatchingCards,
      })
      expect(result).not.toEqual(staleUnrelatedCards)
      expect(result.some(c => c.name === 'Lightning Bolt')).toBe(false) // no stale name leaks in either
      expect(result).toEqual([])
    })

    it('shows paginatedCards once loading has finished and results are present', () => {
      const result = selectCollectionDisplayCards({
        usesUnsupportedServerFilter: false,
        loading: false,
        paginatedCards: freshMatchingCards,
        filteredCards: [],
      })
      expect(result).toEqual(freshMatchingCards)
    })

    it('falls back to filteredCards when not loading and paginatedCards is empty', () => {
      const result = selectCollectionDisplayCards({
        usesUnsupportedServerFilter: false,
        loading: false,
        paginatedCards: [],
        filteredCards: freshMatchingCards,
      })
      expect(result).toEqual(freshMatchingCards)
    })

    it('always uses filteredCards when an unsupported server filter is active, even while loading', () => {
      const result = selectCollectionDisplayCards({
        usesUnsupportedServerFilter: true,
        loading: true,
        paginatedCards: staleUnrelatedCards,
        filteredCards: freshMatchingCards,
      })
      expect(result).toEqual(freshMatchingCards)
    })
  })
})
