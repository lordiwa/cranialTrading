import { describe, it, expect } from 'vitest'
import { buildPaginationFilters, buildPaginationSort } from '../../../src/utils/collectionFilters'

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
})
