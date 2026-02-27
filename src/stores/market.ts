import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { type FormatKey, type FormatStaples, getFormatStaples, getPriceMovers, type MoverType, type PortfolioImpact, type PriceMover, type PriceMovers } from '../services/market'
import { useToastStore } from './toast'
import { useCollectionStore } from './collection'
import { t } from '../composables/useI18n'

// Cache with 10min TTL
const staplesCache = new Map<string, { data: FormatStaples; timestamp: number }>()
const moversCache = new Map<string, { data: PriceMovers; timestamp: number }>()
const CACHE_TTL = 10 * 60 * 1000
const PAGE_SIZE = 15

export const useMarketStore = defineStore('market', () => {
    const toastStore = useToastStore()

    // State
    const activeTab = ref<'movers' | 'staples' | 'portfolio'>('movers')
    const selectedFormat = ref<FormatKey>('modern')
    const staples = ref<FormatStaples | null>(null)
    const staplesLoading = ref(false)

    const selectedMoverType = ref<MoverType>('market_regular')
    const movers = ref<PriceMovers | null>(null)
    const moversLoading = ref(false)
    const moversDirection = ref<'winners' | 'losers'>('winners')

    // Search
    const moversSearch = ref('')
    const staplesSearch = ref('')

    // Pagination
    const moversPage = ref(1)
    const staplesPage = ref(1)

    // Movers sort
    const moversSort = ref<'change' | 'price'>('change')

    // Movers set filter
    const moversSetFilter = ref('')

    const currentStapleCategory = ref<'overall' | 'creatures' | 'spells' | 'lands'>('overall')

    // Portfolio state
    const portfolioSearch = ref('')
    const portfolioPage = ref(1)
    const portfolioSort = ref<'impact' | 'percent'>('impact')

    // Computed — Movers pipeline
    const currentMovers = computed(() => {
        if (!movers.value) return []
        return moversDirection.value === 'winners'
            ? movers.value.winners
            : movers.value.losers
    })

    const availableSets = computed(() => {
        const sets = new Set(currentMovers.value.map(m => m.setName))
        return [...sets].sort((a, b) => a.localeCompare(b))
    })

    const filteredMovers = computed(() => {
        let result = currentMovers.value
        const search = moversSearch.value.toLowerCase().trim()
        if (search) {
            result = result.filter(m => m.name.toLowerCase().includes(search))
        }
        if (moversSetFilter.value) {
            result = result.filter(m => m.setName === moversSetFilter.value)
        }
        return result
    })

    const sortedMovers = computed(() => {
        const arr = [...filteredMovers.value]
        if (moversSort.value === 'price') {
            arr.sort((a, b) => b.presentPrice - a.presentPrice)
        } else {
            arr.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
        }
        return arr
    })

    const totalMoversPages = computed(() => Math.max(1, Math.ceil(sortedMovers.value.length / PAGE_SIZE)))

    const paginatedMovers = computed(() => {
        const start = (moversPage.value - 1) * PAGE_SIZE
        return sortedMovers.value.slice(start, start + PAGE_SIZE)
    })

    // Computed — Staples pipeline
    const currentStaples = computed(() => {
        if (!staples.value) return []
        return staples.value.categories[currentStapleCategory.value] || []
    })

    const filteredStaples = computed(() => {
        const search = staplesSearch.value.toLowerCase().trim()
        if (!search) return currentStaples.value
        return currentStaples.value.filter(s => s.name.toLowerCase().includes(search))
    })

    const totalStaplesPages = computed(() => Math.max(1, Math.ceil(filteredStaples.value.length / PAGE_SIZE)))

    const paginatedStaples = computed(() => {
        const start = (staplesPage.value - 1) * PAGE_SIZE
        return filteredStaples.value.slice(start, start + PAGE_SIZE)
    })

    // Computed — Portfolio pipeline (mover lookup + cross-reference)
    const moverLookup = computed(() => {
        const map = new Map<string, PriceMover[]>()
        if (!movers.value) return map
        for (const m of [...movers.value.winners, ...movers.value.losers]) {
            const key = m.name.toLowerCase()
            const arr = map.get(key)
            if (arr) { arr.push(m) } else { map.set(key, [m]) }
        }
        return map
    })

    const portfolioImpacts = computed((): PortfolioImpact[] => {
        const collectionStore = useCollectionStore()
        if (!movers.value || !collectionStore.cards.length) return []
        const isFoilType = selectedMoverType.value.includes('foil')
        const results: PortfolioImpact[] = []
        for (const card of collectionStore.cards) {
            if (isFoilType !== card.foil) continue
            const matched = moverLookup.value.get(card.name.toLowerCase())
            if (!matched?.length) continue
            const mover = matched[0]!
            const dollarChange = mover.presentPrice - mover.pastPrice
            results.push({ card, mover, dollarChange, totalImpact: dollarChange * card.quantity })
        }
        return results
    })

    const filteredPortfolio = computed(() => {
        const search = portfolioSearch.value.toLowerCase().trim()
        if (!search) return portfolioImpacts.value
        return portfolioImpacts.value.filter(p => p.card.name.toLowerCase().includes(search))
    })

    const sortedPortfolio = computed(() => {
        const arr = [...filteredPortfolio.value]
        if (portfolioSort.value === 'percent') {
            arr.sort((a, b) => Math.abs(b.mover.percentChange) - Math.abs(a.mover.percentChange))
        } else {
            arr.sort((a, b) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact))
        }
        return arr
    })

    const totalPortfolioPages = computed(() => Math.max(1, Math.ceil(sortedPortfolio.value.length / PAGE_SIZE)))

    const paginatedPortfolio = computed(() => {
        const start = (portfolioPage.value - 1) * PAGE_SIZE
        return sortedPortfolio.value.slice(start, start + PAGE_SIZE)
    })

    const portfolioSummary = computed(() => {
        const impacts = portfolioImpacts.value
        return {
            totalChange: impacts.reduce((s, p) => s + p.totalImpact, 0),
            affectedCards: impacts.length,
            gainers: impacts.filter(p => p.totalImpact > 0).length,
            losers: impacts.filter(p => p.totalImpact < 0).length,
        }
    })

    // Reset page to 1 when filters/search/sort/direction change
    watch([moversSearch, moversSetFilter, moversSort, moversDirection], () => {
        moversPage.value = 1
    })

    watch([staplesSearch, currentStapleCategory], () => {
        staplesPage.value = 1
    })

    watch([portfolioSearch, portfolioSort], () => {
        portfolioPage.value = 1
    })

    // Actions
    async function loadStaples(format?: FormatKey) {
        const fmt = format || selectedFormat.value
        selectedFormat.value = fmt

        // Check cache
        const cached = staplesCache.get(fmt)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            staples.value = cached.data
            return
        }

        staplesLoading.value = true
        try {
            const data = await getFormatStaples(fmt)
            if (data) {
                staples.value = data
                staplesCache.set(fmt, { data, timestamp: Date.now() })
            } else {
                staples.value = null
            }
        } catch (err) {
            console.error('Failed to load staples:', err)
            toastStore.show(t('market.errors.loadStaples'), 'error')
        } finally {
            staplesLoading.value = false
        }
    }

    async function loadMovers(type?: MoverType) {
        const mt = type || selectedMoverType.value
        selectedMoverType.value = mt

        // Check cache
        const cached = moversCache.get(mt)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            movers.value = cached.data
            return
        }

        moversLoading.value = true
        try {
            const data = await getPriceMovers(mt)
            if (data) {
                movers.value = data
                moversCache.set(mt, { data, timestamp: Date.now() })
            } else {
                movers.value = null
            }
        } catch (err) {
            console.error('Failed to load movers:', err)
            toastStore.show(t('market.errors.loadMovers'), 'error')
        } finally {
            moversLoading.value = false
        }
    }

    return {
        // State
        activeTab,
        selectedFormat,
        staples,
        staplesLoading,
        selectedMoverType,
        movers,
        moversLoading,
        moversDirection,
        currentStapleCategory,

        // Search / Filter / Sort / Pagination
        moversSearch,
        staplesSearch,
        moversPage,
        staplesPage,
        moversSort,
        moversSetFilter,

        // Portfolio state
        portfolioSearch,
        portfolioPage,
        portfolioSort,

        // Computed
        currentMovers,
        availableSets,
        filteredMovers,
        sortedMovers,
        totalMoversPages,
        paginatedMovers,
        currentStaples,
        filteredStaples,
        totalStaplesPages,
        paginatedStaples,

        // Portfolio computed
        moverLookup,
        portfolioImpacts,
        filteredPortfolio,
        sortedPortfolio,
        totalPortfolioPages,
        paginatedPortfolio,
        portfolioSummary,

        // Actions
        loadStaples,
        loadMovers,
    }
})
