import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { type ScryfallCard, searchAdvanced } from '../services/scryfall'
import { useToastStore } from './toast'
import { t } from '../composables/useI18n'

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
    const lastQuery = ref('')

    // Computed
    const totalResults = computed(() => results.value.length)
    const hasResults = computed(() => results.value.length > 0)

    /**
     * Construir query string para Scryfall API desde FilterOptions
     */
    const buildManaValueQuery = (manaValue: FilterOptions['manaValue']): string | null => {
        if (!manaValue) return null
        if (manaValue.even) return 'mv:even'

        if (manaValue.values && manaValue.values.length > 0) {
            const values = manaValue.values
            const has10Plus = values.includes(10)
            const regularValues = values.filter(v => v < 10)

            const mvParts: string[] = []
            regularValues.forEach(v => mvParts.push(`mv=${v}`))
            if (has10Plus) mvParts.push('mv>=10')

            const firstPart = mvParts[0]
            if (mvParts.length === 1 && firstPart) return firstPart
            if (mvParts.length > 1) return `(${mvParts.join(' OR ')})`
            return null
        }

        const parts: string[] = []
        if (manaValue.min !== undefined) parts.push(`mv>=${manaValue.min}`)
        if (manaValue.max !== undefined) parts.push(`mv<=${manaValue.max}`)
        return parts.length > 0 ? parts.join(' ') : null
    }

    const buildRangeQuery = (range: { min?: number; max?: number } | undefined, prefix: string): string[] => {
        if (!range) return []
        const parts: string[] = []
        if (range.min !== undefined) parts.push(`${prefix}>=${range.min}`)
        if (range.max !== undefined) parts.push(`${prefix}<=${range.max}`)
        return parts
    }

    const buildArrayQuery = (items: string[] | undefined, prefix: string): string[] => {
        if (!items || items.length === 0) return []
        return items.map(item => `${prefix}${item}`)
    }

    const buildKeywordsQuery = (keywords: string[] | undefined): string[] => {
        if (!keywords || keywords.length === 0) return []
        return keywords.map(kw => kw.includes(' ') ? `o:"${kw}"` : `o:${kw}`)
    }

    const buildQuery = (filters: FilterOptions): string => {
        const parts: string[] = []

        if (filters.name?.trim()) parts.push(`"${filters.name.trim()}"`)

        if (filters.colors && filters.colors.length > 0) {
            parts.push(`id<=${filters.colors.join('')}`)
        }

        parts.push(...buildArrayQuery(filters.types, 't:'))

        const mvQuery = buildManaValueQuery(filters.manaValue)
        if (mvQuery) parts.push(mvQuery)

        parts.push(
          ...buildArrayQuery(filters.rarity, 'r:'),
          ...buildArrayQuery(filters.sets, 'e:'),
          ...buildRangeQuery(filters.power, 'pow'),
          ...buildRangeQuery(filters.toughness, 'tou'),
          ...buildArrayQuery(filters.formatLegal, 'f:'),
          ...buildRangeQuery(filters.priceUSD, 'usd'),
          ...buildKeywordsQuery(filters.keywords),
        )

        if (filters.isFoil) parts.push('is:foil')
        if (filters.isFullArt) parts.push('is:full')
        if (filters.onlyReleased) parts.push('-is:preview')

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
            toastStore.show(t('search.messages.defineFilter'), 'info')
            return
        }

        const query = buildQuery(filters)
        lastQuery.value = query

        // Verificar caché
        const cached = searchCache.get(query)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('⚡ Usando caché para:', query)
            results.value = cached.results
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

            if (searchResults.length === 0) {
                toastStore.show(t('search.messages.noResults'), 'info')
            } else {
                console.log(`✅ ${searchResults.length} cartas encontradas`)
            }
        } catch (err) {
            console.error('Error en búsqueda:', err)
            toastStore.show(t('search.messages.searchError'), 'error')
        } finally {
            loading.value = false
        }
    }

    /**
     * Limpiar resultados y filtros
     */
    const clearSearch = () => {
        results.value = []
        lastQuery.value = ''
    }

    return {
        // State
        results,
        loading,
        lastQuery,

        // Computed
        totalResults,
        hasResults,

        // Methods
        search,
        clearSearch,
    }
})