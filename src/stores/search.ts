import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { type ScryfallCard, searchAdvancedWithMeta } from '../services/scryfall'
import { useToastStore } from './toast'
import { t } from '../composables/useI18n'
import { buildQuery, type FilterOptions } from '../utils/scryfallQuery'
import { buildSortParams, type SearchSortOption, shouldApplyPricedFirst } from '../utils/searchSort'
import {
    clampPage,
    DEFAULT_PER_PAGE,
    paginateResults,
    resultsRange,
    type SearchPerPage,
    totalLoadedPages,
} from '../utils/searchPagination'
import { sortPricedFirst } from '../utils/searchSections'
import { logSanitizedError } from '../utils/logSanitizedError'

// Cache para búsquedas (5 minutos) — la key incluye el sort porque order/dir
// cambian el resultado devuelto por Scryfall (TASK-108)
const searchCache = new Map<string, { results: ScryfallCard[], totalCards: number, timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

export type { FilterOptions }
export type { SearchSortOption } from '../utils/searchSort'
export type { SearchPerPage } from '../utils/searchPagination'

const cacheKeyFor = (query: string, sort: SearchSortOption | undefined): string => {
    const { order, dir } = buildSortParams(sort)
    return `${query}::${order}:${dir ?? ''}`
}

export const useSearchStore = defineStore('search', () => {
    const toastStore = useToastStore()

    // State
    const results = ref<ScryfallCard[]>([])
    const loading = ref(false)
    const lastQuery = ref('')
    const lastFilters = ref<FilterOptions | null>(null)

    // Monotonic request token (review fix, TASK-108): setSort can fire a new
    // search() while a previous one is still in flight. If the stale response
    // resolves after the newer one, it must be discarded instead of clobbering
    // results/totalCards with out-of-order data.
    let lastReqId = 0

    // Sort/pagination state (TASK-108) — Scryfall-only, does not affect the
    // in-collection / other-users sections on SearchView
    const sort = ref<SearchSortOption | undefined>(undefined)
    const perPage = ref<SearchPerPage>(DEFAULT_PER_PAGE)
    const page = ref(1)
    const totalCards = ref(0)

    // Computed
    const totalResults = computed(() => results.value.length)
    const hasResults = computed(() => results.value.length > 0)
    const pagedResults = computed(() => paginateResults(results.value, page.value, perPage.value))
    const totalPages = computed(() => totalLoadedPages(results.value.length, perPage.value))
    const range = computed(() => resultsRange(page.value, perPage.value, results.value.length, totalCards.value))

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

        // Review fix (HIGH): reqId is bumped only past the empty-filters no-op —
        // that early-return path must not invalidate a real in-flight request.
        const reqId = ++lastReqId

        const query = buildQuery(filters)
        lastQuery.value = query
        lastFilters.value = { ...filters }

        const cacheKey = cacheKeyFor(query, sort.value)

        // Verificar caché
        const cached = searchCache.get(cacheKey)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.info('Usando caché para:', cacheKey)
            results.value = cached.results
            totalCards.value = cached.totalCards
            page.value = 1
            // Review fix (HIGH): this cache-hit request just superseded whatever was
            // in flight (its reqId is newer) — the superseded request's own finally
            // will see a stale reqId and skip resetting loading, so this branch must
            // do it instead or a still-in-flight older request leaves loading stuck true.
            loading.value = false
            return
        }

        loading.value = true
        try {
            console.info('Buscando con query:', query)

            const sortParams = buildSortParams(sort.value)
            const meta = await searchAdvancedWithMeta(query, {
                unique: 'prints',
                order: sortParams.order,
                dir: sortParams.dir,
            })

            // Stale response guard (review fix, TASK-108): a newer search() started
            // (e.g. setSort firing while this request was in flight) — discard.
            if (reqId !== lastReqId) return

            // Priced printings first — unpriced reprint noise sinks to the tail.
            // Only applied for the default (no explicit sort chosen), which must stay
            // byte-identical to pre-TASK-108 behavior. An explicit sort choice is
            // respected as-is — Scryfall's order is not re-shuffled (2026-07-16 decision).
            const searchResults = shouldApplyPricedFirst(sort.value)
                ? sortPricedFirst(meta.results)
                : meta.results

            // Guardar en caché
            searchCache.set(cacheKey, { results: searchResults, totalCards: meta.totalCards, timestamp: Date.now() })

            // Limpiar caché viejo (máximo 50 queries)
            if (searchCache.size > 50) {
                const oldestKey = searchCache.keys().next().value
                if (oldestKey) searchCache.delete(oldestKey)
            }

            results.value = searchResults
            totalCards.value = meta.totalCards
            page.value = 1

            if (searchResults.length === 0) {
                toastStore.show(t('search.messages.noResults'), 'info')
            } else {
                console.info(`${searchResults.length} cartas encontradas`)
            }
        } catch (err) {
            if (reqId !== lastReqId) return
            logSanitizedError('Error en búsqueda', err)
            toastStore.show(t('search.messages.searchError'), 'error')
        } finally {
            if (reqId === lastReqId) loading.value = false
        }
    }

    /** Cambia el criterio de orden y relanza la última búsqueda (TASK-108). */
    const setSort = (value: SearchSortOption | undefined) => {
        if (sort.value === value) return
        sort.value = value
        if (lastFilters.value) void search(lastFilters.value)
    }

    /** Cambia cuántos resultados se muestran por página (slice client-side, TASK-108). */
    const setPerPage = (value: SearchPerPage) => {
        perPage.value = value
        page.value = 1
    }

    /** Navega a una página local, clamped a lo ya cargado (TASK-108). */
    const setPage = (value: number) => {
        page.value = clampPage(value, results.value.length, perPage.value)
    }

    const nextPage = () => { setPage(page.value + 1) }
    const prevPage = () => { setPage(page.value - 1) }

    /**
     * Limpiar resultados y filtros
     */
    const clearSearch = () => {
        // Invalidate whatever is in flight. Without this a request started before the
        // clear kept its reqId current, so it sailed through the guard and repopulated
        // results for a query the user had already erased — and because lastFilters was
        // left null, setSort() had nothing to replay and the sort control silently died.
        lastReqId++
        // The superseded request's own finally sees a stale reqId and skips this, so
        // clearing has to do it — same reasoning as the cache-hit branch above.
        loading.value = false
        results.value = []
        lastQuery.value = ''
        lastFilters.value = null
        totalCards.value = 0
        page.value = 1
    }

    return {
        // State
        results,
        loading,
        lastQuery,
        sort,
        perPage,
        page,
        totalCards,

        // Computed
        totalResults,
        hasResults,
        pagedResults,
        totalPages,
        range,

        // Methods
        search,
        clearSearch,
        setSort,
        setPerPage,
        setPage,
        nextPage,
        prevPage,
    }
})