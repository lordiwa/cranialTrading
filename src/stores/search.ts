import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { type ScryfallCard, searchAdvanced } from '../services/scryfall'
import { useToastStore } from './toast'

// Cache para búsquedas (5 minutos)
const searchCache = new Map<string, { results: ScryfallCard[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

export interface FilterOptions {
    // Básicos
    name?: string
    colors?: string[]
    types?: string[]

    // Intermedios
    manaValue?: { min?: number; max?: number; even?: boolean; values?: number[] }
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
    onlyReleased?: boolean
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

        // Colores: mostrar cartas que tengan 1 o más de los colores seleccionados (no otros)
        // id<= usa color identity que es más preciso para Magic
        if (filters.colors && filters.colors.length > 0) {
            const colorQuery = filters.colors.join('')
            parts.push(`id<=${colorQuery}`)
            console.log('🎨 Color query:', `id<=${colorQuery}`)
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
            } else if (filters.manaValue.values && filters.manaValue.values.length > 0) {
                // Discrete values: (mv=3 OR mv=4 OR mv=7)
                // Check if 10 is included (means 10+)
                const values = filters.manaValue.values
                const has10Plus = values.includes(10)
                const regularValues = values.filter(v => v < 10)

                const mvParts: string[] = []
                regularValues.forEach(v => mvParts.push(`mv=${v}`))
                if (has10Plus) {
                    mvParts.push('mv>=10')
                }

                const firstPart = mvParts[0]
                if (mvParts.length === 1 && firstPart) {
                    parts.push(firstPart)
                } else if (mvParts.length > 1) {
                    parts.push(`(${mvParts.join(' OR ')})`)
                }
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

        // Keywords (buscar en texto de la carta con o: oracle text, case-insensitive)
        if (filters.keywords && filters.keywords.length > 0) {
            filters.keywords.forEach(kw => {
                // Si tiene espacios, agregar comillas
                if (kw.includes(' ')) {
                    parts.push(`o:"${kw}"`)
                } else {
                    parts.push(`o:${kw}`)
                }
            })
            console.log('📜 Keywords query:', filters.keywords.map(kw => kw.includes(' ') ? `o:"${kw}"` : `o:${kw}`))
        }

        // Foil
        if (filters.isFoil) {
            parts.push('is:foil')
        }

        // Full art
        if (filters.isFullArt) {
            parts.push('is:full')
        }

        // Only released (exclude preview/spoiler cards)
        if (filters.onlyReleased) {
            parts.push('-is:preview')
        }

        return parts.join(' ')
    }

    /**
     * Ejecutar búsqueda avanzada con caché
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

        const query = buildQuery(filters)
        lastQuery.value = query

        // Verificar caché
        const cached = searchCache.get(query)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('⚡ Usando caché para:', query)
            results.value = cached.results
            currentFilters.value = filters
            return
        }

        loading.value = true
        try {
            console.log('🔍 Buscando con query:', query)

            const searchResults = await searchAdvanced(query, {
                unique: 'prints',
                order: 'released',
                dir: 'desc',
            })

            // Guardar en caché
            searchCache.set(query, { results: searchResults, timestamp: Date.now() })

            // Limpiar caché viejo (máximo 50 queries)
            if (searchCache.size > 50) {
                const oldestKey = searchCache.keys().next().value
                if (oldestKey) searchCache.delete(oldestKey)
            }

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