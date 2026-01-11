import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { searchAdvanced, ScryfallCard } from '../services/scryfall'
import { useToastStore } from './toast'

export interface FilterOptions {
    // Básicos
    name?: string
    colors?: string[]
    types?: string[]

    // Intermedios
    manaValue?: { min?: number; max?: number; even?: boolean }
    rarity?: string[]
    sets?: string[]

    // Avanzados
    power?: { min?: number; max?: number }
    toughness?: { min?: number; max?: number }
    formatLegal?: string[]
    priceUSD?: { min?: number; max?: number }
    keywords?: string[]
    isFoil?: boolean
    isFullArt?: boolean
}

export const useSearchStore = defineStore('search', () => {
    const toastStore = useToastStore()

    // State
    const results = ref<ScryfallCard[]>([])
    const loading = ref(false)
    const currentFilters = ref<FilterOptions>({})
    const lastQuery = ref('')

    // Computed
    const totalResults = computed(() => results.value.length)
    const hasResults = computed(() => results.value.length > 0)

    /**
     * Construir query string para Scryfall API desde FilterOptions
     */
    const buildQuery = (filters: FilterOptions): string => {
        const parts: string[] = []

        // Nombre
        if (filters.name?.trim()) {
            parts.push(`"${filters.name.trim()}"`)
        }

        // Colores
        if (filters.colors && filters.colors.length > 0) {
            const colorQuery = filters.colors.join('')
            parts.push(`c:${colorQuery}`)
        }

        // Tipos
        if (filters.types && filters.types.length > 0) {
            filters.types.forEach(type => {
                parts.push(`t:${type}`)
            })
        }

        // Mana value
        if (filters.manaValue) {
            if (filters.manaValue.even) {
                parts.push('mv:even')
            } else {
                if (filters.manaValue.min !== undefined) {
                    parts.push(`mv>=${filters.manaValue.min}`)
                }
                if (filters.manaValue.max !== undefined) {
                    parts.push(`mv<=${filters.manaValue.max}`)
                }
            }
        }

        // Rarity
        if (filters.rarity && filters.rarity.length > 0) {
            filters.rarity.forEach(r => {
                parts.push(`r:${r}`)
            })
        }

        // Sets/Ediciones
        if (filters.sets && filters.sets.length > 0) {
            filters.sets.forEach(set => {
                parts.push(`e:${set}`)
            })
        }

        // Power
        if (filters.power) {
            if (filters.power.min !== undefined) {
                parts.push(`pow>=${filters.power.min}`)
            }
            if (filters.power.max !== undefined) {
                parts.push(`pow<=${filters.power.max}`)
            }
        }

        // Toughness
        if (filters.toughness) {
            if (filters.toughness.min !== undefined) {
                parts.push(`tou>=${filters.toughness.min}`)
            }
            if (filters.toughness.max !== undefined) {
                parts.push(`tou<=${filters.toughness.max}`)
            }
        }

        // Formato legal
        if (filters.formatLegal && filters.formatLegal.length > 0) {
            filters.formatLegal.forEach(format => {
                parts.push(`f:${format}`)
            })
        }

        // Precio USD
        if (filters.priceUSD) {
            if (filters.priceUSD.min !== undefined) {
                parts.push(`usd>=${filters.priceUSD.min}`)
            }
            if (filters.priceUSD.max !== undefined) {
                parts.push(`usd<=${filters.priceUSD.max}`)
            }
        }

        // Keywords
        if (filters.keywords && filters.keywords.length > 0) {
            filters.keywords.forEach(kw => {
                parts.push(`kw:${kw}`)
            })
        }

        // Foil
        if (filters.isFoil) {
            parts.push('is:foil')
        }

        // Full art
        if (filters.isFullArt) {
            parts.push('is:full')
        }

        return parts.join(' ')
    }

    /**
     * Ejecutar búsqueda avanzada
     */
    const search = async (filters: FilterOptions) => {
        if (!filters.name?.trim() &&
            !filters.colors?.length &&
            !filters.types?.length &&
            !filters.rarity?.length &&
            !filters.sets?.length &&
            !filters.keywords?.length) {
            toastStore.show('Define al menos un filtro', 'info')
            return
        }

        loading.value = true
        try {
            const query = buildQuery(filters)
            lastQuery.value = query

            console.log('🔍 Buscando con query:', query)

            const searchResults = await searchAdvanced(query, {
                unique: 'prints',
                order: 'released',
                dir: 'desc',
            })

            results.value = searchResults
            currentFilters.value = filters

            if (searchResults.length === 0) {
                toastStore.show('No se encontraron cartas con estos filtros', 'info')
            } else {
                console.log(`✅ ${searchResults.length} cartas encontradas`)
            }
        } catch (err) {
            console.error('Error en búsqueda:', err)
            toastStore.show('Error al buscar cartas', 'error')
        } finally {
            loading.value = false
        }
    }

    /**
     * Limpiar resultados y filtros
     */
    const clearSearch = () => {
        results.value = []
        currentFilters.value = {}
        lastQuery.value = ''
    }

    return {
        // State
        results,
        loading,
        currentFilters,
        lastQuery,

        // Computed
        totalResults,
        hasResults,

        // Methods
        buildQuery,
        search,
        clearSearch,
    }
})