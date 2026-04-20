import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { type ScryfallCard, searchAdvanced } from '../services/scryfall'
import { useToastStore } from './toast'
import { t } from '../composables/useI18n'
import { buildQuery, type FilterOptions } from '../utils/scryfallQuery'

// Cache para búsquedas (5 minutos)
const searchCache = new Map<string, { results: ScryfallCard[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

export type { FilterOptions }

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
            console.info('Usando caché para:', query)
            results.value = cached.results
            return
        }

        loading.value = true
        try {
            console.info('Buscando con query:', query)

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
                console.info(`${searchResults.length} cartas encontradas`)
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