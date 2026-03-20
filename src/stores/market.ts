import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { type FormatKey, type FormatStaples, getFormatStaples, getPriceMovers, type MoverType, type PortfolioImpact, type PriceMover, type PriceMovers } from '../services/market'
import { useToastStore } from './toast'
import { useCollectionStore } from './collection'
import { t } from '../composables/useI18n'
import { getConditionAdjustedPrice } from '../utils/conditionMultiplier'

// Cache with 10min TTL
const staplesCache = new Map<string, { data: FormatStaples; timestamp: number }>()
const moversCache = new Map<string, { data: PriceMovers; timestamp: number }>()
const CACHE_TTL = 10 * 60 * 1000
const PAGE_SIZE = 15

export const useMarketStore = defineStore('market', () => {
    const toastStore = useToastStore()

    // State
    const activeTab = ref<'portfolio' | 'wishlist' | 'movers' | 'staples'>('portfolio')
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
    const portfolioSort = ref<'impact' | 'percent' | 'price' | 'name'>('impact')
    const portfolioSortAsc = ref(false)
    const portfolioStatusFilter = ref<'all' | 'collection' | 'sale' | 'trade'>('all')
    const portfolioEditionFilter = ref('')
    const portfolioDirection = ref<'all' | 'winners' | 'losers'>('all')

    // Wishlist state
    const wishlistSearch = ref('')
    const wishlistPage = ref(1)
    const wishlistSort = ref<'impact' | 'percent' | 'price' | 'name'>('impact')
    const wishlistSortAsc = ref(false)
    const wishlistEditionFilter = ref('')
    const wishlistDirection = ref<'all' | 'winners' | 'losers'>('all')

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

    // Computed — Set Trends summary (when edition selected in movers/Set Trends tab)
    const setTrendSummary = computed(() => {
        if (!moversSetFilter.value || !movers.value) return null
        const allMovers = [...movers.value.winners, ...movers.value.losers]
        const setMovers = allMovers.filter(m => m.setName === moversSetFilter.value)
        if (!setMovers.length) return null
        const avgChange = setMovers.reduce((s, m) => s + m.percentChange, 0) / setMovers.length
        const sorted = [...setMovers].sort((a, b) => b.percentChange - a.percentChange)
        return {
            editionName: moversSetFilter.value,
            avgChange,
            topGainer: sorted[0]?.name ?? '',
            topLoser: sorted[sorted.length - 1]?.name ?? '',
            cardCount: setMovers.length,
        }
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

    /** Build PortfolioImpact array for cards matching the given status filter */
    function buildImpacts(statusFilter: 'owned' | 'wishlist'): PortfolioImpact[] {
        const collectionStore = useCollectionStore()
        if (!movers.value || !collectionStore.cards.length) return []
        const isFoilType = selectedMoverType.value.includes('foil')
        const results: PortfolioImpact[] = []
        for (const card of collectionStore.cards) {
            if (statusFilter === 'wishlist') {
                if (card.status !== 'wishlist') continue
            } else {
                if (card.status === 'wishlist') continue
            }
            if (isFoilType !== card.foil) continue
            const matched = moverLookup.value.get(card.name.toLowerCase())
            if (!matched?.length) continue
            const mover = matched.find(m => m.setName === card.edition) ?? matched[0]
            if (!mover) continue
            const dollarChange = mover.presentPrice - mover.pastPrice
            const adjustedCurrentPrice = getConditionAdjustedPrice(mover.presentPrice, card.condition)
            const adjustedPastPrice = getConditionAdjustedPrice(mover.pastPrice, card.condition)
            const adjustedImpact = Math.round((adjustedCurrentPrice - adjustedPastPrice) * card.quantity * 100) / 100
            results.push({
                card, mover, dollarChange,
                totalImpact: dollarChange * card.quantity,
                adjustedCurrentPrice,
                adjustedPastPrice,
                adjustedImpact,
            })
        }
        return results
    }

    const portfolioImpacts = computed((): PortfolioImpact[] => buildImpacts('owned'))

    const filteredPortfolio = computed(() => {
        let result = portfolioImpacts.value
        const search = portfolioSearch.value.toLowerCase().trim()
        if (search) {
            result = result.filter(p => p.card.name.toLowerCase().includes(search))
        }
        if (portfolioStatusFilter.value !== 'all') {
            result = result.filter(p => p.card.status === portfolioStatusFilter.value)
        }
        if (portfolioEditionFilter.value) {
            result = result.filter(p => p.card.edition === portfolioEditionFilter.value)
        }
        if (portfolioDirection.value === 'winners') {
            result = result.filter(p => p.adjustedImpact > 0)
        } else if (portfolioDirection.value === 'losers') {
            result = result.filter(p => p.adjustedImpact < 0)
        }
        return result
    })

    const sortedPortfolio = computed(() => {
        const arr = [...filteredPortfolio.value]
        const dir = portfolioSortAsc.value ? 1 : -1
        if (portfolioSort.value === 'percent') {
            arr.sort((a, b) => dir * (a.mover.percentChange - b.mover.percentChange))
        } else if (portfolioSort.value === 'price') {
            arr.sort((a, b) => dir * (a.mover.presentPrice - b.mover.presentPrice))
        } else if (portfolioSort.value === 'name') {
            arr.sort((a, b) => dir * a.card.name.localeCompare(b.card.name))
        } else {
            arr.sort((a, b) => dir * (a.adjustedImpact - b.adjustedImpact))
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
            totalChange: Math.round(impacts.reduce((s, p) => s + p.adjustedImpact, 0) * 100) / 100,
            affectedCards: impacts.length,
            gainers: impacts.filter(p => p.adjustedImpact > 0).length,
            losers: impacts.filter(p => p.adjustedImpact < 0).length,
            totalValue: Math.round(impacts.reduce((s, p) => s + p.adjustedCurrentPrice * p.card.quantity, 0) * 100) / 100,
        }
    })

    const portfolioAvailableEditions = computed(() => {
        const editions = new Set(portfolioImpacts.value.map(p => p.card.edition))
        return [...editions].sort((a, b) => a.localeCompare(b))
    })

    // Computed — Wishlist pipeline
    const wishlistImpacts = computed((): PortfolioImpact[] => buildImpacts('wishlist'))

    const filteredWishlist = computed(() => {
        let result = wishlistImpacts.value
        const search = wishlistSearch.value.toLowerCase().trim()
        if (search) {
            result = result.filter(p => p.card.name.toLowerCase().includes(search))
        }
        if (wishlistEditionFilter.value) {
            result = result.filter(p => p.card.edition === wishlistEditionFilter.value)
        }
        if (wishlistDirection.value === 'winners') {
            result = result.filter(p => p.adjustedImpact > 0)
        } else if (wishlistDirection.value === 'losers') {
            result = result.filter(p => p.adjustedImpact < 0)
        }
        return result
    })

    const sortedWishlist = computed(() => {
        const arr = [...filteredWishlist.value]
        const dir = wishlistSortAsc.value ? 1 : -1
        if (wishlistSort.value === 'percent') {
            arr.sort((a, b) => dir * (a.mover.percentChange - b.mover.percentChange))
        } else if (wishlistSort.value === 'price') {
            arr.sort((a, b) => dir * (a.mover.presentPrice - b.mover.presentPrice))
        } else if (wishlistSort.value === 'name') {
            arr.sort((a, b) => dir * a.card.name.localeCompare(b.card.name))
        } else {
            arr.sort((a, b) => dir * (a.adjustedImpact - b.adjustedImpact))
        }
        return arr
    })

    const totalWishlistPages = computed(() => Math.max(1, Math.ceil(sortedWishlist.value.length / PAGE_SIZE)))

    const paginatedWishlist = computed(() => {
        const start = (wishlistPage.value - 1) * PAGE_SIZE
        return sortedWishlist.value.slice(start, start + PAGE_SIZE)
    })

    const wishlistSummary = computed(() => {
        const impacts = wishlistImpacts.value
        return {
            totalChange: Math.round(impacts.reduce((s, p) => s + p.adjustedImpact, 0) * 100) / 100,
            affectedCards: impacts.length,
            gainers: impacts.filter(p => p.adjustedImpact > 0).length,
            losers: impacts.filter(p => p.adjustedImpact < 0).length,
        }
    })

    const wishlistAvailableEditions = computed(() => {
        const editions = new Set(wishlistImpacts.value.map(p => p.card.edition))
        return [...editions].sort((a, b) => a.localeCompare(b))
    })

    // Reset page to 1 when filters/search/sort/direction change
    watch([moversSearch, moversSetFilter, moversSort], () => {
        moversPage.value = 1
    })

    watch(moversDirection, () => {
        moversSetFilter.value = ''
        moversPage.value = 1
    })

    watch([staplesSearch, currentStapleCategory], () => {
        staplesPage.value = 1
    })

    watch([portfolioSearch, portfolioSort, portfolioSortAsc, portfolioStatusFilter, portfolioEditionFilter, portfolioDirection], () => {
        portfolioPage.value = 1
    })

    watch([wishlistSearch, wishlistSort, wishlistSortAsc, wishlistEditionFilter, wishlistDirection], () => {
        wishlistPage.value = 1
    })

    // Actions
    async function loadStaples(format?: FormatKey) {
        const fmt = format ?? selectedFormat.value
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
        const mt = type ?? selectedMoverType.value
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
        portfolioSortAsc,
        portfolioStatusFilter,
        portfolioEditionFilter,
        portfolioDirection,

        // Wishlist state
        wishlistSearch,
        wishlistPage,
        wishlistSort,
        wishlistSortAsc,
        wishlistEditionFilter,
        wishlistDirection,

        // Computed — Movers
        currentMovers,
        availableSets,
        sortedMovers,
        totalMoversPages,
        paginatedMovers,
        setTrendSummary,

        // Computed — Staples
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
        portfolioAvailableEditions,

        // Wishlist computed
        wishlistImpacts,
        filteredWishlist,
        sortedWishlist,
        totalWishlistPages,
        paginatedWishlist,
        wishlistSummary,
        wishlistAvailableEditions,

        // Actions
        loadStaples,
        loadMovers,
    }
})
