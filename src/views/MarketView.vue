<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMarketStore } from '../stores/market'
import { useAuthStore } from '../stores/auth'
import { useCollectionStore } from '../stores/collection'
import { useI18n } from '../composables/useI18n'
import type { FormatKey, MoverType, StapleCategory } from '../services/market'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import EditionSummaryHeader from '../components/market/EditionSummaryHeader.vue'
import PortfolioSummaryBanner from '../components/market/PortfolioSummaryBanner.vue'
import StickyEditionFilter from '../components/market/StickyEditionFilter.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'

const { t } = useI18n()
const marketStore = useMarketStore()
const authStore = useAuthStore()
const collectionStore = useCollectionStore()

const formatOptions = computed(() => [
  { value: 'standard', label: t('market.staples.formats.standard') },
  { value: 'modern', label: t('market.staples.formats.modern') },
  { value: 'pioneer', label: t('market.staples.formats.pioneer') },
  { value: 'legacy', label: t('market.staples.formats.legacy') },
  { value: 'vintage', label: t('market.staples.formats.vintage') },
  { value: 'pauper', label: t('market.staples.formats.pauper') },
  { value: 'commander', label: t('market.staples.formats.commander') },
])

const moverTypeOptions = computed(() => [
  { value: 'average_regular', label: t('market.movers.types.average_regular') },
  { value: 'average_foil', label: t('market.movers.types.average_foil') },
  { value: 'market_regular', label: t('market.movers.types.market_regular') },
  { value: 'market_foil', label: t('market.movers.types.market_foil') },
])

const categoryOptions = computed((): { value: StapleCategory; label: string }[] => [
  { value: 'overall', label: t('market.staples.categories.overall') },
  { value: 'creatures', label: t('market.staples.categories.creatures') },
  { value: 'spells', label: t('market.staples.categories.spells') },
  { value: 'lands', label: t('market.staples.categories.lands') },
])

// --- Movers search autocomplete ---
const showMoversSuggestions = ref(false)
const moversSearchRef = ref<HTMLElement | null>(null)

const moversSuggestions = computed(() => {
  const q = marketStore.moversSearch.toLowerCase().trim()
  if (!q) return []
  const seen = new Set<string>()
  return marketStore.currentMovers
      .filter(m => {
        const name = m.name.toLowerCase()
        if (!name.includes(q) || seen.has(name)) return false
        seen.add(name)
        return true
      })
      .map(m => m.name)
      .slice(0, 8)
})

function selectMoverSuggestion(name: string) {
  marketStore.moversSearch = name
  showMoversSuggestions.value = false
}

// --- Staples search autocomplete ---
const showStaplesSuggestions = ref(false)
const staplesSearchRef = ref<HTMLElement | null>(null)

const staplesSuggestions = computed(() => {
  const q = marketStore.staplesSearch.toLowerCase().trim()
  if (!q) return []
  const seen = new Set<string>()
  return marketStore.currentStaples
      .filter(s => {
        const name = s.name.toLowerCase()
        if (!name.includes(q) || seen.has(name)) return false
        seen.add(name)
        return true
      })
      .map(s => s.name)
      .slice(0, 8)
})

function selectStapleSuggestion(name: string) {
  marketStore.staplesSearch = name
  showStaplesSuggestions.value = false
}

// --- Portfolio search autocomplete ---
const showPortfolioSuggestions = ref(false)
const portfolioSearchRef = ref<HTMLElement | null>(null)

const portfolioSuggestions = computed(() => {
  const q = marketStore.portfolioSearch.toLowerCase().trim()
  if (!q) return []
  const seen = new Set<string>()
  return marketStore.portfolioImpacts
      .filter(p => {
        const name = p.card.name.toLowerCase()
        if (!name.includes(q) || seen.has(name)) return false
        seen.add(name)
        return true
      })
      .map(p => p.card.name)
      .slice(0, 8)
})

function selectPortfolioSuggestion(name: string) {
  marketStore.portfolioSearch = name
  showPortfolioSuggestions.value = false
}

// --- Wishlist search autocomplete ---
const showWishlistSuggestions = ref(false)
const wishlistSearchRef = ref<HTMLElement | null>(null)

const wishlistSuggestions = computed(() => {
  const q = marketStore.wishlistSearch.toLowerCase().trim()
  if (!q) return []
  const seen = new Set<string>()
  return marketStore.wishlistImpacts
      .filter(p => {
        const name = p.card.name.toLowerCase()
        if (!name.includes(q) || seen.has(name)) return false
        seen.add(name)
        return true
      })
      .map(p => p.card.name)
      .slice(0, 8)
})

function selectWishlistSuggestion(name: string) {
  marketStore.wishlistSearch = name
  showWishlistSuggestions.value = false
}

// --- Click-outside detection ---
function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node
  if (moversSearchRef.value && !moversSearchRef.value.contains(target)) {
    showMoversSuggestions.value = false
  }
  if (staplesSearchRef.value && !staplesSearchRef.value.contains(target)) {
    showStaplesSuggestions.value = false
  }
  if (portfolioSearchRef.value && !portfolioSearchRef.value.contains(target)) {
    showPortfolioSuggestions.value = false
  }
  if (wishlistSearchRef.value && !wishlistSearchRef.value.contains(target)) {
    showWishlistSuggestions.value = false
  }
}

// Movers pagination helpers
const moversFrom = computed(() => {
  if (marketStore.sortedMovers.length === 0) return 0
  return (marketStore.moversPage - 1) * 15 + 1
})
const moversTo = computed(() => Math.min(marketStore.moversPage * 15, marketStore.sortedMovers.length))

// Staples pagination helpers
const staplesFrom = computed(() => {
  if (marketStore.filteredStaples.length === 0) return 0
  return (marketStore.staplesPage - 1) * 15 + 1
})
const staplesTo = computed(() => Math.min(marketStore.staplesPage * 15, marketStore.filteredStaples.length))

// Portfolio pagination helpers
const portfolioFrom = computed(() => {
  if (marketStore.sortedPortfolio.length === 0) return 0
  return (marketStore.portfolioPage - 1) * 15 + 1
})
const portfolioTo = computed(() => Math.min(marketStore.portfolioPage * 15, marketStore.sortedPortfolio.length))

// Wishlist pagination helpers
const wishlistFrom = computed(() => {
  if (marketStore.sortedWishlist.length === 0) return 0
  return (marketStore.wishlistPage - 1) * 15 + 1
})
const wishlistTo = computed(() => Math.min(marketStore.wishlistPage * 15, marketStore.sortedWishlist.length))

import { formatDollarChange, formatPercent, formatPrice } from '../utils/formatters'

function formatUpdatedAt(timestamp: unknown): string {
  if (!timestamp) return ''
  const ts = timestamp as { toDate?: () => Date }
  const date: Date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(timestamp as string | number)
  return date.toLocaleString()
}

// Column-header sort toggle: click once → desc, click again → asc, click a different column → desc
function togglePortfolioColumnSort(col: 'impact' | 'percent') {
  if (marketStore.portfolioSort === col) {
    marketStore.portfolioSortAsc = !marketStore.portfolioSortAsc
  } else {
    marketStore.portfolioSort = col
    marketStore.portfolioSortAsc = false
  }
}

function toggleWishlistColumnSort(col: 'impact' | 'percent') {
  if (marketStore.wishlistSort === col) {
    marketStore.wishlistSortAsc = !marketStore.wishlistSortAsc
  } else {
    marketStore.wishlistSort = col
    marketStore.wishlistSortAsc = false
  }
}

function sortArrow(isActive: boolean, isAsc: boolean): string {
  if (!isActive) return ''
  return isAsc ? ' \u25B2' : ' \u25BC'
}

function handleMoverTypeChange(val: string) {
  void marketStore.loadMovers(val as MoverType)
}

function handleFormatChange(val: string) {
  void marketStore.loadStaples(val as FormatKey)
}

function ensurePortfolioData() {
  if (!marketStore.movers) void marketStore.loadMovers()
  if (authStore.user && !collectionStore.cards.length) void collectionStore.loadCollection()
}

// Load initial data based on active tab
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  if (marketStore.activeTab === 'movers') {
    void marketStore.loadMovers()
  } else if (marketStore.activeTab === 'staples') {
    void marketStore.loadStaples()
  } else if (marketStore.activeTab === 'portfolio' || marketStore.activeTab === 'wishlist') {
    ensurePortfolioData()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Load data when tab changes
watch(() => marketStore.activeTab, (tab) => {
  if (tab === 'movers' && !marketStore.movers) {
    void marketStore.loadMovers()
  } else if (tab === 'staples' && !marketStore.staples) {
    void marketStore.loadStaples()
  } else if (tab === 'portfolio' || tab === 'wishlist') {
    ensurePortfolioData()
  }
})
</script>

<template>
  <AppContainer>
    <div class="mb-6">
      <h1 class="text-h2 font-bold text-neon">{{ t('market.title') }}</h1>
      <p class="text-small text-silver-50 mt-1">{{ t('market.subtitle') }}</p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 border-b border-silver-20 overflow-x-auto">
      <button
          @click="marketStore.activeTab = 'portfolio'"
          :class="[
            'px-4 py-2.5 text-small font-bold transition-fast whitespace-nowrap',
            marketStore.activeTab === 'portfolio'
              ? 'text-neon border-b-2 border-neon'
              : 'text-silver-50 hover:text-silver'
          ]"
      >
        {{ t('market.tabs.portfolio') }}
      </button>
      <button
          @click="marketStore.activeTab = 'wishlist'"
          :class="[
            'px-4 py-2.5 text-small font-bold transition-fast whitespace-nowrap',
            marketStore.activeTab === 'wishlist'
              ? 'text-neon border-b-2 border-neon'
              : 'text-silver-50 hover:text-silver'
          ]"
      >
        {{ t('market.tabs.wishlist') }}
      </button>
      <button
          @click="marketStore.activeTab = 'movers'"
          :class="[
            'px-4 py-2.5 text-small font-bold transition-fast whitespace-nowrap',
            marketStore.activeTab === 'movers'
              ? 'text-neon border-b-2 border-neon'
              : 'text-silver-50 hover:text-silver'
          ]"
      >
        {{ t('market.tabs.movers') }}
      </button>
      <button
          @click="marketStore.activeTab = 'staples'"
          :class="[
            'px-4 py-2.5 text-small font-bold transition-fast whitespace-nowrap',
            marketStore.activeTab === 'staples'
              ? 'text-neon border-b-2 border-neon'
              : 'text-silver-50 hover:text-silver'
          ]"
      >
        {{ t('market.tabs.staples') }}
      </button>
    </div>

    <!-- ==================== MY PORTFOLIO TAB ==================== -->
    <div v-if="marketStore.activeTab === 'portfolio'">
      <!-- Login required state -->
      <div v-if="!authStore.user" class="py-12 text-center">
        <SvgIcon name="fire" size="large" class="text-silver-30 mx-auto mb-3" />
        <p class="text-small text-silver-50">{{ t('market.portfolio.loginRequired') }}</p>
      </div>

      <template v-else>
        <!-- Summary Banner -->
        <PortfolioSummaryBanner
            v-if="marketStore.portfolioImpacts.length > 0"
            :total-change="marketStore.portfolioSummary.totalChange"
            :affected-cards="marketStore.portfolioSummary.affectedCards"
            :gainers="marketStore.portfolioSummary.gainers"
            :losers="marketStore.portfolioSummary.losers"
            :total-value="marketStore.portfolioSummary.totalValue"
        />

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-end gap-3 mb-3">
          <!-- Status pills -->
          <div>
            <span class="text-tiny text-silver-50 mb-1 block">{{ t('market.portfolio.statusLabel') }}</span>
            <div class="flex gap-1">
              <button
                  v-for="status in (['all', 'collection', 'sale', 'trade'] as const)"
                  :key="status"
                  @click="marketStore.portfolioStatusFilter = status"
                  :class="[
                    'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                    marketStore.portfolioStatusFilter === status
                      ? 'bg-neon text-primary'
                      : 'bg-silver-10 text-silver-50 hover:text-silver'
                  ]"
              >
                {{ t(`market.portfolio.statusFilter.${status}`) }}
              </button>
            </div>
          </div>

          <!-- Direction pills -->
          <div>
            <span class="text-tiny text-silver-50 mb-1 block">{{ t('market.portfolio.directionLabel') }}</span>
            <div class="flex gap-1">
              <button
                  v-for="dir in (['all', 'winners', 'losers'] as const)"
                  :key="dir"
                  @click="marketStore.portfolioDirection = dir"
                  :class="[
                    'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                    marketStore.portfolioDirection === dir
                      ? (dir === 'losers' ? 'bg-rust text-silver' : 'bg-neon text-primary')
                      : 'bg-silver-10 text-silver-50 hover:text-silver'
                  ]"
              >
                {{ t(`market.portfolio.directionFilter.${dir}`) }}
              </button>
            </div>
          </div>

          <!-- Edition filter -->
          <StickyEditionFilter
              :model-value="marketStore.portfolioEditionFilter"
              :editions="marketStore.portfolioAvailableEditions"
              @update:model-value="marketStore.portfolioEditionFilter = $event"
          />

          <!-- Price type -->
          <div class="w-48">
            <label for="portfolio-type-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.movers.typeLabel') }}</label>
            <BaseSelect
                id="portfolio-type-select"
                :model-value="marketStore.selectedMoverType"
                :options="moverTypeOptions"
                @update:model-value="handleMoverTypeChange"
            />
          </div>

          <!-- Sort -->
          <div>
            <span class="text-tiny text-silver-50 mb-1 block">{{ t('market.sort.label') }}</span>
            <div class="flex gap-1">
              <button
                  v-for="sort in (['impact', 'percent', 'price', 'name'] as const)"
                  :key="sort"
                  @click="marketStore.portfolioSort = sort; marketStore.portfolioSortAsc = false"
                  :class="[
                    'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                    marketStore.portfolioSort === sort
                      ? 'bg-neon text-primary'
                      : 'bg-silver-10 text-silver-50 hover:text-silver'
                  ]"
              >
                {{ t(`market.portfolio.sort${sort.charAt(0).toUpperCase() + sort.slice(1)}`) }}
              </button>
            </div>
          </div>
        </div>

        <!-- Search -->
        <div ref="portfolioSearchRef" class="mb-4 relative" @focusin="showPortfolioSuggestions = true">
          <BaseInput
              :model-value="marketStore.portfolioSearch"
              @update:model-value="(val: string | number) => { marketStore.portfolioSearch = String(val); showPortfolioSuggestions = true }"
              :placeholder="t('market.search')"
              :clearable="true"
          />
          <div
              v-if="showPortfolioSuggestions && portfolioSuggestions.length"
              class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-20 rounded"
          >
            <div
                v-for="name in portfolioSuggestions"
                :key="name"
                @mousedown.prevent="selectPortfolioSuggestion(name)"
                class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-10 transition-all"
            >
              {{ name }}
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="marketStore.moversLoading || collectionStore.loading" class="py-12">
          <BaseLoader />
        </div>

        <!-- Empty state -->
        <div v-else-if="marketStore.paginatedPortfolio.length === 0" class="py-12 text-center">
          <SvgIcon name="fire" size="large" class="text-silver-30 mx-auto mb-3" />
          <p class="text-small text-silver-50">{{ t('market.portfolio.empty') }}</p>
        </div>

        <!-- Portfolio table -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-small">
            <thead>
              <tr class="border-b border-silver-20 text-silver-50">
                <th class="py-2 px-2 text-left w-8">#</th>
                <th class="py-2 px-2 text-left">{{ t('market.portfolio.table.card') }}</th>
                <th class="py-2 px-2 text-left hidden sm:table-cell">{{ t('market.portfolio.table.set') }}</th>
                <th class="py-2 px-2 text-center hidden sm:table-cell">{{ t('market.portfolio.table.condition') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.portfolio.table.qty') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.portfolio.table.was') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.portfolio.table.now') }}</th>
                <th class="py-2 px-2 text-right hidden sm:table-cell">{{ t('market.portfolio.table.adjValue') }}</th>
                <th
                    class="py-2 px-2 text-right hidden sm:table-cell cursor-pointer select-none hover:text-neon transition-fast"
                    @click="togglePortfolioColumnSort('percent')"
                >
                  {{ t('market.portfolio.table.change') }}{{ sortArrow(marketStore.portfolioSort === 'percent', marketStore.portfolioSortAsc) }}
                </th>
                <th
                    class="py-2 px-2 text-right cursor-pointer select-none hover:text-neon transition-fast"
                    @click="togglePortfolioColumnSort('impact')"
                >
                  {{ t('market.portfolio.table.impact') }}{{ sortArrow(marketStore.portfolioSort === 'impact', marketStore.portfolioSortAsc) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                  v-for="(item, idx) in marketStore.paginatedPortfolio"
                  :key="item.card.id"
                  class="border-b border-silver-10 hover:bg-silver-5 transition-fast"
              >
                <td class="py-2.5 px-2 text-silver-50">{{ portfolioFrom + idx }}</td>
                <td class="py-2.5 px-2 text-silver font-medium">
                  {{ item.card.name }}
                  <span v-if="item.card.foil" class="text-tiny text-neon ml-1">FOIL</span>
                </td>
                <td class="py-2.5 px-2 text-silver-50 hidden sm:table-cell">{{ item.card.edition }}</td>
                <td class="py-2.5 px-2 text-center hidden sm:table-cell">
                  <span
                      class="inline-block px-1.5 py-0.5 text-tiny font-bold rounded-sm"
                      :class="{
                        'bg-neon/20 text-neon': item.card.condition === 'M' || item.card.condition === 'NM',
                        'bg-silver-20 text-silver': item.card.condition === 'LP',
                        'bg-silver-30 text-silver-50': item.card.condition === 'MP',
                        'bg-rust/20 text-rust': item.card.condition === 'HP' || item.card.condition === 'PO',
                      }"
                  >
                    {{ t(`market.conditionLabel.${item.card.condition}`) }}
                  </span>
                </td>
                <td class="py-2.5 px-2 text-right text-silver-50">{{ item.card.quantity }}</td>
                <td class="py-2.5 px-2 text-right text-silver-50">{{ formatPrice(item.mover.pastPrice) }}</td>
                <td class="py-2.5 px-2 text-right text-silver font-medium">{{ formatPrice(item.mover.presentPrice) }}</td>
                <td class="py-2.5 px-2 text-right text-silver-50 hidden sm:table-cell">{{ formatPrice(item.adjustedCurrentPrice) }}</td>
                <td
                    class="py-2.5 px-2 text-right font-bold hidden sm:table-cell"
                    :class="item.mover.percentChange >= 0 ? 'text-neon' : 'text-rust'"
                >
                  {{ formatPercent(item.mover.percentChange) }}
                </td>
                <td
                    class="py-2.5 px-2 text-right font-bold"
                    :class="item.adjustedImpact >= 0 ? 'text-neon' : 'text-rust'"
                >
                  {{ formatDollarChange(item.adjustedImpact) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Pagination -->
          <div v-if="marketStore.totalPortfolioPages > 1" class="flex items-center justify-between mt-4">
            <span class="text-tiny text-silver-50">
              {{ t('market.pagination.showing', { from: portfolioFrom, to: portfolioTo, total: marketStore.sortedPortfolio.length }) }}
            </span>
            <div class="flex items-center gap-2">
              <button
                  :disabled="marketStore.portfolioPage === 1"
                  @click="marketStore.portfolioPage--"
                  class="px-2 py-1 text-small rounded-sm transition-fast"
                  :class="marketStore.portfolioPage === 1 ? 'text-silver-30 cursor-not-allowed' : 'text-silver hover:text-neon'"
              >
                &#9664;
              </button>
              <span class="text-small text-silver">
                {{ t('market.pagination.page', { current: marketStore.portfolioPage, total: marketStore.totalPortfolioPages }) }}
              </span>
              <button
                  :disabled="marketStore.portfolioPage === marketStore.totalPortfolioPages"
                  @click="marketStore.portfolioPage++"
                  class="px-2 py-1 text-small rounded-sm transition-fast"
                  :class="marketStore.portfolioPage === marketStore.totalPortfolioPages ? 'text-silver-30 cursor-not-allowed' : 'text-silver hover:text-neon'"
              >
                &#9654;
              </button>
            </div>
          </div>

          <!-- Last updated -->
          <p v-if="marketStore.movers?.updatedAt" class="text-tiny text-silver-30 mt-4">
            {{ t('market.lastUpdated', { date: formatUpdatedAt(marketStore.movers.updatedAt) }) }}
          </p>
        </div>
      </template>
    </div>

    <!-- ==================== WISHLIST TAB ==================== -->
    <div v-if="marketStore.activeTab === 'wishlist'">
      <!-- Login required state -->
      <div v-if="!authStore.user" class="py-12 text-center">
        <SvgIcon name="fire" size="large" class="text-silver-30 mx-auto mb-3" />
        <p class="text-small text-silver-50">{{ t('market.wishlist.loginRequired') }}</p>
      </div>

      <template v-else>
        <!-- Summary Banner -->
        <PortfolioSummaryBanner
            v-if="marketStore.wishlistImpacts.length > 0"
            :total-change="marketStore.wishlistSummary.totalChange"
            :affected-cards="marketStore.wishlistSummary.affectedCards"
            :gainers="marketStore.wishlistSummary.gainers"
            :losers="marketStore.wishlistSummary.losers"
            key-prefix="market.wishlist"
        />

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-end gap-3 mb-3">
          <!-- Direction pills -->
          <div>
            <span class="text-tiny text-silver-50 mb-1 block">{{ t('market.wishlist.directionLabel') }}</span>
            <div class="flex gap-1">
              <button
                  v-for="dir in (['all', 'winners', 'losers'] as const)"
                  :key="dir"
                  @click="marketStore.wishlistDirection = dir"
                  :class="[
                    'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                    marketStore.wishlistDirection === dir
                      ? (dir === 'losers' ? 'bg-rust text-silver' : 'bg-neon text-primary')
                      : 'bg-silver-10 text-silver-50 hover:text-silver'
                  ]"
              >
                {{ t(`market.wishlist.directionFilter.${dir}`) }}
              </button>
            </div>
          </div>

          <!-- Edition filter -->
          <StickyEditionFilter
              :model-value="marketStore.wishlistEditionFilter"
              :editions="marketStore.wishlistAvailableEditions"
              @update:model-value="marketStore.wishlistEditionFilter = $event"
          />

          <!-- Price type -->
          <div class="w-48">
            <label for="wishlist-type-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.movers.typeLabel') }}</label>
            <BaseSelect
                id="wishlist-type-select"
                :model-value="marketStore.selectedMoverType"
                :options="moverTypeOptions"
                @update:model-value="handleMoverTypeChange"
            />
          </div>

          <!-- Sort -->
          <div>
            <span class="text-tiny text-silver-50 mb-1 block">{{ t('market.sort.label') }}</span>
            <div class="flex gap-1">
              <button
                  v-for="sort in (['impact', 'percent', 'price', 'name'] as const)"
                  :key="sort"
                  @click="marketStore.wishlistSort = sort; marketStore.wishlistSortAsc = false"
                  :class="[
                    'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                    marketStore.wishlistSort === sort
                      ? 'bg-neon text-primary'
                      : 'bg-silver-10 text-silver-50 hover:text-silver'
                  ]"
              >
                {{ t(`market.wishlist.sort${sort.charAt(0).toUpperCase() + sort.slice(1)}`) }}
              </button>
            </div>
          </div>
        </div>

        <!-- Search -->
        <div ref="wishlistSearchRef" class="mb-4 relative" @focusin="showWishlistSuggestions = true">
          <BaseInput
              :model-value="marketStore.wishlistSearch"
              @update:model-value="(val: string | number) => { marketStore.wishlistSearch = String(val); showWishlistSuggestions = true }"
              :placeholder="t('market.search')"
              :clearable="true"
          />
          <div
              v-if="showWishlistSuggestions && wishlistSuggestions.length"
              class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-20 rounded"
          >
            <div
                v-for="name in wishlistSuggestions"
                :key="name"
                @mousedown.prevent="selectWishlistSuggestion(name)"
                class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-10 transition-all"
            >
              {{ name }}
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="marketStore.moversLoading || collectionStore.loading" class="py-12">
          <BaseLoader />
        </div>

        <!-- Empty state -->
        <div v-else-if="marketStore.paginatedWishlist.length === 0" class="py-12 text-center">
          <SvgIcon name="fire" size="large" class="text-silver-30 mx-auto mb-3" />
          <p class="text-small text-silver-50">{{ t('market.wishlist.empty') }}</p>
        </div>

        <!-- Wishlist table -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-small">
            <thead>
              <tr class="border-b border-silver-20 text-silver-50">
                <th class="py-2 px-2 text-left w-8">#</th>
                <th class="py-2 px-2 text-left">{{ t('market.wishlist.table.card') }}</th>
                <th class="py-2 px-2 text-left hidden sm:table-cell">{{ t('market.wishlist.table.set') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.wishlist.table.qty') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.wishlist.table.was') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.wishlist.table.now') }}</th>
                <th
                    class="py-2 px-2 text-right hidden sm:table-cell cursor-pointer select-none hover:text-neon transition-fast"
                    @click="toggleWishlistColumnSort('percent')"
                >
                  {{ t('market.wishlist.table.change') }}{{ sortArrow(marketStore.wishlistSort === 'percent', marketStore.wishlistSortAsc) }}
                </th>
                <th
                    class="py-2 px-2 text-right cursor-pointer select-none hover:text-neon transition-fast"
                    @click="toggleWishlistColumnSort('impact')"
                >
                  {{ t('market.wishlist.table.impact') }}{{ sortArrow(marketStore.wishlistSort === 'impact', marketStore.wishlistSortAsc) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                  v-for="(item, idx) in marketStore.paginatedWishlist"
                  :key="item.card.id"
                  class="border-b border-silver-10 hover:bg-silver-5 transition-fast"
              >
                <td class="py-2.5 px-2 text-silver-50">{{ wishlistFrom + idx }}</td>
                <td class="py-2.5 px-2 text-silver font-medium">
                  {{ item.card.name }}
                  <span v-if="item.card.foil" class="text-tiny text-neon ml-1">FOIL</span>
                </td>
                <td class="py-2.5 px-2 text-silver-50 hidden sm:table-cell">{{ item.card.edition }}</td>
                <td class="py-2.5 px-2 text-right text-silver-50">{{ item.card.quantity }}</td>
                <td class="py-2.5 px-2 text-right text-silver-50">{{ formatPrice(item.mover.pastPrice) }}</td>
                <td class="py-2.5 px-2 text-right text-silver font-medium">{{ formatPrice(item.mover.presentPrice) }}</td>
                <td
                    class="py-2.5 px-2 text-right font-bold hidden sm:table-cell"
                    :class="item.mover.percentChange >= 0 ? 'text-neon' : 'text-rust'"
                >
                  {{ formatPercent(item.mover.percentChange) }}
                </td>
                <td
                    class="py-2.5 px-2 text-right font-bold"
                    :class="item.adjustedImpact >= 0 ? 'text-neon' : 'text-rust'"
                >
                  {{ formatDollarChange(item.adjustedImpact) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Pagination -->
          <div v-if="marketStore.totalWishlistPages > 1" class="flex items-center justify-between mt-4">
            <span class="text-tiny text-silver-50">
              {{ t('market.pagination.showing', { from: wishlistFrom, to: wishlistTo, total: marketStore.sortedWishlist.length }) }}
            </span>
            <div class="flex items-center gap-2">
              <button
                  :disabled="marketStore.wishlistPage === 1"
                  @click="marketStore.wishlistPage--"
                  class="px-2 py-1 text-small rounded-sm transition-fast"
                  :class="marketStore.wishlistPage === 1 ? 'text-silver-30 cursor-not-allowed' : 'text-silver hover:text-neon'"
              >
                &#9664;
              </button>
              <span class="text-small text-silver">
                {{ t('market.pagination.page', { current: marketStore.wishlistPage, total: marketStore.totalWishlistPages }) }}
              </span>
              <button
                  :disabled="marketStore.wishlistPage === marketStore.totalWishlistPages"
                  @click="marketStore.wishlistPage++"
                  class="px-2 py-1 text-small rounded-sm transition-fast"
                  :class="marketStore.wishlistPage === marketStore.totalWishlistPages ? 'text-silver-30 cursor-not-allowed' : 'text-silver hover:text-neon'"
              >
                &#9654;
              </button>
            </div>
          </div>

          <!-- Last updated -->
          <p v-if="marketStore.movers?.updatedAt" class="text-tiny text-silver-30 mt-4">
            {{ t('market.lastUpdated', { date: formatUpdatedAt(marketStore.movers.updatedAt) }) }}
          </p>
        </div>
      </template>
    </div>

    <!-- ==================== SET TRENDS TAB (was MOVERS) ==================== -->
    <div v-if="marketStore.activeTab === 'movers'">
      <!-- Controls Row 1: Price type, Set filter, Sort, Direction -->
      <div class="flex flex-wrap items-end gap-3 mb-3">
        <div class="w-48">
          <label for="movers-type-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.movers.typeLabel') }}</label>
          <BaseSelect
              id="movers-type-select"
              :model-value="marketStore.selectedMoverType"
              :options="moverTypeOptions"
              @update:model-value="handleMoverTypeChange"
          />
        </div>
        <StickyEditionFilter
            :model-value="marketStore.moversSetFilter"
            :editions="marketStore.availableSets"
            @update:model-value="marketStore.moversSetFilter = $event"
        />
        <div>
          <span class="text-tiny text-silver-50 mb-1 block">{{ t('market.sort.label') }}</span>
          <div class="flex gap-1">
            <button
                @click="marketStore.moversSort = 'change'"
                :class="[
                  'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                  marketStore.moversSort === 'change'
                    ? 'bg-neon text-primary'
                    : 'bg-silver-10 text-silver-50 hover:text-silver'
                ]"
            >
              {{ t('market.sort.change') }}
            </button>
            <button
                @click="marketStore.moversSort = 'price'"
                :class="[
                  'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                  marketStore.moversSort === 'price'
                    ? 'bg-neon text-primary'
                    : 'bg-silver-10 text-silver-50 hover:text-silver'
                ]"
            >
              {{ t('market.sort.price') }}
            </button>
          </div>
        </div>
        <div class="flex gap-1 ml-auto">
          <button
              @click="marketStore.moversDirection = 'winners'"
              :class="[
                'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                marketStore.moversDirection === 'winners'
                  ? 'bg-neon text-primary'
                  : 'bg-silver-10 text-silver-50 hover:text-silver'
              ]"
          >
            {{ t('market.movers.winners') }}
          </button>
          <button
              @click="marketStore.moversDirection = 'losers'"
              :class="[
                'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                marketStore.moversDirection === 'losers'
                  ? 'bg-rust text-silver'
                  : 'bg-silver-10 text-silver-50 hover:text-silver'
              ]"
          >
            {{ t('market.movers.losers') }}
          </button>
        </div>
      </div>

      <!-- Edition Summary Header -->
      <EditionSummaryHeader
          v-if="marketStore.setTrendSummary"
          :edition-name="marketStore.setTrendSummary.editionName"
          :avg-change="marketStore.setTrendSummary.avgChange"
          :top-gainer="marketStore.setTrendSummary.topGainer"
          :top-loser="marketStore.setTrendSummary.topLoser"
          :card-count="marketStore.setTrendSummary.cardCount"
      />

      <!-- Controls Row 2: Search -->
      <div ref="moversSearchRef" class="mb-4 relative" @focusin="showMoversSuggestions = true">
        <BaseInput
            :model-value="marketStore.moversSearch"
            @update:model-value="(val: string | number) => { marketStore.moversSearch = String(val); showMoversSuggestions = true }"
            :placeholder="t('market.search')"
            :clearable="true"
        />
        <div
            v-if="showMoversSuggestions && moversSuggestions.length"
            class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-20 rounded"
        >
          <div
              v-for="name in moversSuggestions"
              :key="name"
              @mousedown.prevent="selectMoverSuggestion(name)"
              class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-10 transition-all"
          >
            {{ name }}
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="marketStore.moversLoading" class="py-12">
        <BaseLoader />
      </div>

      <!-- Empty state -->
      <div v-else-if="marketStore.paginatedMovers.length === 0" class="py-12 text-center">
        <SvgIcon name="fire" size="large" class="text-silver-30 mx-auto mb-3" />
        <p class="text-small text-silver-50">{{ t('market.movers.empty') }}</p>
      </div>

      <!-- Movers table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-small">
          <thead>
            <tr class="border-b border-silver-20 text-silver-50">
              <th class="py-2 px-2 text-left w-8">{{ t('market.movers.table.rank') }}</th>
              <th class="py-2 px-2 text-left">{{ t('market.movers.table.card') }}</th>
              <th class="py-2 px-2 text-left hidden sm:table-cell">{{ t('market.movers.table.set') }}</th>
              <th class="py-2 px-2 text-right">{{ t('market.movers.table.was') }}</th>
              <th class="py-2 px-2 text-right">{{ t('market.movers.table.now') }}</th>
              <th class="py-2 px-2 text-right">{{ t('market.movers.table.change') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
                v-for="(mover, idx) in marketStore.paginatedMovers"
                :key="idx"
                class="border-b border-silver-10 hover:bg-silver-5 transition-fast"
            >
              <td class="py-2.5 px-2 text-silver-50">{{ moversFrom + idx }}</td>
              <td class="py-2.5 px-2 text-silver font-medium">
                {{ mover.name }}
                <span v-if="mover.foil" class="text-tiny text-neon ml-1">FOIL</span>
              </td>
              <td class="py-2.5 px-2 text-silver-50 hidden sm:table-cell">{{ mover.setName }}</td>
              <td class="py-2.5 px-2 text-right text-silver-50">{{ formatPrice(mover.pastPrice) }}</td>
              <td class="py-2.5 px-2 text-right text-silver font-medium">{{ formatPrice(mover.presentPrice) }}</td>
              <td
                  class="py-2.5 px-2 text-right font-bold"
                  :class="mover.percentChange >= 0 ? 'text-neon' : 'text-rust'"
              >
                {{ formatPercent(mover.percentChange) }}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div v-if="marketStore.totalMoversPages > 1" class="flex items-center justify-between mt-4">
          <span class="text-tiny text-silver-50">
            {{ t('market.pagination.showing', { from: moversFrom, to: moversTo, total: marketStore.sortedMovers.length }) }}
          </span>
          <div class="flex items-center gap-2">
            <button
                :disabled="marketStore.moversPage === 1"
                @click="marketStore.moversPage--"
                class="px-2 py-1 text-small rounded-sm transition-fast"
                :class="marketStore.moversPage === 1 ? 'text-silver-30 cursor-not-allowed' : 'text-silver hover:text-neon'"
            >
              &#9664;
            </button>
            <span class="text-small text-silver">
              {{ t('market.pagination.page', { current: marketStore.moversPage, total: marketStore.totalMoversPages }) }}
            </span>
            <button
                :disabled="marketStore.moversPage === marketStore.totalMoversPages"
                @click="marketStore.moversPage++"
                class="px-2 py-1 text-small rounded-sm transition-fast"
                :class="marketStore.moversPage === marketStore.totalMoversPages ? 'text-silver-30 cursor-not-allowed' : 'text-silver hover:text-neon'"
            >
              &#9654;
            </button>
          </div>
        </div>

        <!-- Last updated -->
        <p v-if="marketStore.movers?.updatedAt" class="text-tiny text-silver-30 mt-4">
          {{ t('market.lastUpdated', { date: formatUpdatedAt(marketStore.movers.updatedAt) }) }}
        </p>
      </div>
    </div>

    <!-- ==================== STAPLES TAB ==================== -->
    <div v-if="marketStore.activeTab === 'staples'">
      <!-- Controls Row 1: Format, Category -->
      <div class="flex flex-wrap items-end gap-3 mb-3">
        <div class="w-48">
          <label for="staples-format-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.staples.formatLabel') }}</label>
          <BaseSelect
              id="staples-format-select"
              :model-value="marketStore.selectedFormat"
              :options="formatOptions"
              @update:model-value="handleFormatChange"
          />
        </div>
        <div class="w-40">
          <label for="staples-category-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.staples.categoryLabel') }}</label>
          <BaseSelect
              id="staples-category-select"
              :model-value="marketStore.currentStapleCategory"
              :options="categoryOptions"
              @update:model-value="(val: string) => marketStore.currentStapleCategory = val as any"
          />
        </div>
      </div>

      <!-- Controls Row 2: Search -->
      <div ref="staplesSearchRef" class="mb-4 relative" @focusin="showStaplesSuggestions = true">
        <BaseInput
            :model-value="marketStore.staplesSearch"
            @update:model-value="(val: string | number) => { marketStore.staplesSearch = String(val); showStaplesSuggestions = true }"
            :placeholder="t('market.search')"
            :clearable="true"
        />
        <div
            v-if="showStaplesSuggestions && staplesSuggestions.length"
            class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-20 rounded"
        >
          <div
              v-for="name in staplesSuggestions"
              :key="name"
              @mousedown.prevent="selectStapleSuggestion(name)"
              class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-10 transition-all"
          >
            {{ name }}
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="marketStore.staplesLoading" class="py-12">
        <BaseLoader />
      </div>

      <!-- Empty state -->
      <div v-else-if="marketStore.paginatedStaples.length === 0" class="py-12 text-center">
        <SvgIcon name="fire" size="large" class="text-silver-30 mx-auto mb-3" />
        <p class="text-small text-silver-50">{{ t('market.staples.empty') }}</p>
      </div>

      <!-- Staples table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-small">
          <thead>
            <tr class="border-b border-silver-20 text-silver-50">
              <th class="py-2 px-2 text-left w-8">{{ t('market.staples.table.rank') }}</th>
              <th class="py-2 px-2 text-left">{{ t('market.staples.table.card') }}</th>
              <th class="py-2 px-2 text-right">{{ t('market.staples.table.percentDecks') }}</th>
              <th class="py-2 px-2 text-right">{{ t('market.staples.table.avgCopies') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
                v-for="(staple, idx) in marketStore.paginatedStaples"
                :key="staple.rank"
                class="border-b border-silver-10 hover:bg-silver-5 transition-fast"
            >
              <td class="py-2.5 px-2 text-silver-50">{{ staplesFrom + idx }}</td>
              <td class="py-2.5 px-2 text-silver font-medium">{{ staple.name }}</td>
              <td class="py-2.5 px-2 text-right text-neon font-medium">{{ staple.percentDecks.toFixed(1) }}%</td>
              <td class="py-2.5 px-2 text-right text-silver-50">{{ staple.avgCopies.toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div v-if="marketStore.totalStaplesPages > 1" class="flex items-center justify-between mt-4">
          <span class="text-tiny text-silver-50">
            {{ t('market.pagination.showing', { from: staplesFrom, to: staplesTo, total: marketStore.filteredStaples.length }) }}
          </span>
          <div class="flex items-center gap-2">
            <button
                :disabled="marketStore.staplesPage === 1"
                @click="marketStore.staplesPage--"
                class="px-2 py-1 text-small rounded-sm transition-fast"
                :class="marketStore.staplesPage === 1 ? 'text-silver-30 cursor-not-allowed' : 'text-silver hover:text-neon'"
            >
              &#9664;
            </button>
            <span class="text-small text-silver">
              {{ t('market.pagination.page', { current: marketStore.staplesPage, total: marketStore.totalStaplesPages }) }}
            </span>
            <button
                :disabled="marketStore.staplesPage === marketStore.totalStaplesPages"
                @click="marketStore.staplesPage++"
                class="px-2 py-1 text-small rounded-sm transition-fast"
                :class="marketStore.staplesPage === marketStore.totalStaplesPages ? 'text-silver-30 cursor-not-allowed' : 'text-silver hover:text-neon'"
            >
              &#9654;
            </button>
          </div>
        </div>

        <!-- Last updated -->
        <p v-if="marketStore.staples?.updatedAt" class="text-tiny text-silver-30 mt-4">
          {{ t('market.lastUpdated', { date: formatUpdatedAt(marketStore.staples.updatedAt) }) }}
        </p>
      </div>
    </div>

    <!-- Bottom padding for mobile nav -->
    <div class="h-16 md:hidden"></div>
  </AppContainer>
</template>
