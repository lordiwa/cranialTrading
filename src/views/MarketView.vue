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
import SvgIcon from '../components/ui/SvgIcon.vue'

const { t } = useI18n()
const marketStore = useMarketStore()
const authStore = useAuthStore()
const collectionStore = useCollectionStore()

const formatOptions = [
  { value: 'standard', label: 'Standard' },
  { value: 'modern', label: 'Modern' },
  { value: 'pioneer', label: 'Pioneer' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'pauper', label: 'Pauper' },
  { value: 'commander', label: 'Commander' },
]

const moverTypeOptions = [
  { value: 'average_regular', label: 'Avg Regular' },
  { value: 'average_foil', label: 'Avg Foil' },
  { value: 'market_regular', label: 'Market Regular' },
  { value: 'market_foil', label: 'Market Foil' },
]

const categoryOptions: { value: StapleCategory; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'creatures', label: 'Creatures' },
  { value: 'spells', label: 'Spells' },
  { value: 'lands', label: 'Lands' },
]

// --- Searchable set filter state ---
const setFilterQuery = ref('')
const showSetDropdown = ref(false)
const setFilterRef = ref<HTMLElement | null>(null)

const filteredSetOptions = computed(() => {
  const q = setFilterQuery.value.toLowerCase().trim()
  if (!q) return marketStore.availableSets
  return marketStore.availableSets.filter(s => s.toLowerCase().includes(q))
})

function selectSet(set: string) {
  marketStore.moversSetFilter = set
  setFilterQuery.value = set
  showSetDropdown.value = false
}

// Reset set filter query when direction changes (different sets for winners/losers)
watch(() => marketStore.moversDirection, () => {
  setFilterQuery.value = ''
  marketStore.moversSetFilter = ''
})

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

// --- Click-outside detection ---
function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node
  if (setFilterRef.value && !setFilterRef.value.contains(target)) {
    showSetDropdown.value = false
  }
  if (moversSearchRef.value && !moversSearchRef.value.contains(target)) {
    showMoversSuggestions.value = false
  }
  if (staplesSearchRef.value && !staplesSearchRef.value.contains(target)) {
    showStaplesSuggestions.value = false
  }
  if (portfolioSearchRef.value && !portfolioSearchRef.value.contains(target)) {
    showPortfolioSuggestions.value = false
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

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`
}

function formatPercent(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function formatDollarChange(val: number): string {
  const sign = val > 0 ? '+' : ''
  return `${sign}$${val.toFixed(2)}`
}

function formatUpdatedAt(timestamp: any): string {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleString()
}

function handleMoverTypeChange(val: string) {
  marketStore.loadMovers(val as MoverType)
}

function handleFormatChange(val: string) {
  marketStore.loadStaples(val as FormatKey)
}

// Load initial data based on active tab
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  if (marketStore.activeTab === 'movers') {
    marketStore.loadMovers()
  } else if (marketStore.activeTab === 'staples') {
    marketStore.loadStaples()
  } else if (marketStore.activeTab === 'portfolio') {
    if (!marketStore.movers) marketStore.loadMovers()
    if (authStore.user && !collectionStore.cards.length) collectionStore.loadCollection()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Load data when tab changes
watch(() => marketStore.activeTab, (tab) => {
  if (tab === 'movers' && !marketStore.movers) {
    marketStore.loadMovers()
  } else if (tab === 'staples' && !marketStore.staples) {
    marketStore.loadStaples()
  } else if (tab === 'portfolio') {
    if (!marketStore.movers) marketStore.loadMovers()
    if (authStore.user && !collectionStore.cards.length) collectionStore.loadCollection()
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
    <div class="flex gap-1 mb-6 border-b border-silver-20">
      <button
          @click="marketStore.activeTab = 'movers'"
          :class="[
            'px-4 py-2.5 text-small font-bold transition-fast',
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
            'px-4 py-2.5 text-small font-bold transition-fast',
            marketStore.activeTab === 'staples'
              ? 'text-neon border-b-2 border-neon'
              : 'text-silver-50 hover:text-silver'
          ]"
      >
        {{ t('market.tabs.staples') }}
      </button>
      <button
          @click="marketStore.activeTab = 'portfolio'"
          :class="[
            'px-4 py-2.5 text-small font-bold transition-fast',
            marketStore.activeTab === 'portfolio'
              ? 'text-neon border-b-2 border-neon'
              : 'text-silver-50 hover:text-silver'
          ]"
      >
        {{ t('market.tabs.portfolio') }}
      </button>
    </div>

    <!-- MOVERS TAB -->
    <div v-if="marketStore.activeTab === 'movers'">
      <!-- Controls Row 1: Price type, Set filter, Sort, Direction -->
      <div class="flex flex-wrap items-end gap-3 mb-3">
        <div class="w-48">
          <label for="movers-type-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.movers.typeLabel') }}</label>
          <BaseSelect
              id="movers-type-select"
              :modelValue="marketStore.selectedMoverType"
              :options="moverTypeOptions"
              @update:modelValue="handleMoverTypeChange"
          />
        </div>
        <div ref="setFilterRef" class="w-48 relative" @focusin="showSetDropdown = true">
          <label for="movers-set-filter" class="text-tiny text-silver-50 mb-1 block">{{ t('market.setFilter.label') }}</label>
          <BaseInput
              id="movers-set-filter"
              :modelValue="setFilterQuery"
              @update:modelValue="(val: string | number) => { setFilterQuery = String(val); showSetDropdown = true; if (!String(val)) { marketStore.moversSetFilter = '' } }"
              placeholder="All sets"
              :clearable="true"
          />
          <div
              v-if="showSetDropdown && filteredSetOptions.length"
              class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-20 rounded"
          >
            <div
                @mousedown.prevent="selectSet('')"
                class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small border-b border-silver-10 transition-all"
                :class="marketStore.moversSetFilter === '' ? 'text-neon' : 'text-silver'"
            >
              All sets
            </div>
            <div
                v-for="set in filteredSetOptions"
                :key="set"
                @mousedown.prevent="selectSet(set)"
                class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small border-b border-silver-10 transition-all"
                :class="marketStore.moversSetFilter === set ? 'text-neon' : 'text-silver'"
            >
              {{ set }}
            </div>
          </div>
        </div>
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

      <!-- Controls Row 2: Search -->
      <div ref="moversSearchRef" class="mb-4 relative" @focusin="showMoversSuggestions = true">
        <BaseInput
            :modelValue="marketStore.moversSearch"
            @update:modelValue="(val: string | number) => { marketStore.moversSearch = String(val); showMoversSuggestions = true }"
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
                  :class="mover.percentChange > 0 ? 'text-neon' : 'text-rust'"
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

    <!-- STAPLES TAB -->
    <div v-if="marketStore.activeTab === 'staples'">
      <!-- Controls Row 1: Format, Category -->
      <div class="flex flex-wrap items-end gap-3 mb-3">
        <div class="w-48">
          <label for="staples-format-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.staples.formatLabel') }}</label>
          <BaseSelect
              id="staples-format-select"
              :modelValue="marketStore.selectedFormat"
              :options="formatOptions"
              @update:modelValue="handleFormatChange"
          />
        </div>
        <div class="w-40">
          <label for="staples-category-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.staples.categoryLabel') }}</label>
          <BaseSelect
              id="staples-category-select"
              :modelValue="marketStore.currentStapleCategory"
              :options="categoryOptions"
              @update:modelValue="(val: string) => marketStore.currentStapleCategory = val as any"
          />
        </div>
      </div>

      <!-- Controls Row 2: Search -->
      <div ref="staplesSearchRef" class="mb-4 relative" @focusin="showStaplesSuggestions = true">
        <BaseInput
            :modelValue="marketStore.staplesSearch"
            @update:modelValue="(val: string | number) => { marketStore.staplesSearch = String(val); showStaplesSuggestions = true }"
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

    <!-- PORTFOLIO (MY CARDS) TAB -->
    <div v-if="marketStore.activeTab === 'portfolio'">
      <!-- Login required state -->
      <div v-if="!authStore.user" class="py-12 text-center">
        <SvgIcon name="fire" size="large" class="text-silver-30 mx-auto mb-3" />
        <p class="text-small text-silver-50">{{ t('market.portfolio.loginRequired') }}</p>
      </div>

      <template v-else>
        <!-- Controls Row 1: Mover type + sort toggle -->
        <div class="flex flex-wrap items-end gap-3 mb-3">
          <div class="w-48">
            <label for="portfolio-type-select" class="text-tiny text-silver-50 mb-1 block">{{ t('market.movers.typeLabel') }}</label>
            <BaseSelect
                id="portfolio-type-select"
                :modelValue="marketStore.selectedMoverType"
                :options="moverTypeOptions"
                @update:modelValue="handleMoverTypeChange"
            />
          </div>
          <div>
            <span class="text-tiny text-silver-50 mb-1 block">{{ t('market.sort.label') }}</span>
            <div class="flex gap-1">
              <button
                  @click="marketStore.portfolioSort = 'impact'"
                  :class="[
                    'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                    marketStore.portfolioSort === 'impact'
                      ? 'bg-neon text-primary'
                      : 'bg-silver-10 text-silver-50 hover:text-silver'
                  ]"
              >
                {{ t('market.portfolio.sortImpact') }}
              </button>
              <button
                  @click="marketStore.portfolioSort = 'percent'"
                  :class="[
                    'px-3 py-2 text-small font-bold rounded-sm transition-fast',
                    marketStore.portfolioSort === 'percent'
                      ? 'bg-neon text-primary'
                      : 'bg-silver-10 text-silver-50 hover:text-silver'
                  ]"
              >
                {{ t('market.portfolio.sortPercent') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Controls Row 2: Search -->
        <div ref="portfolioSearchRef" class="mb-4 relative" @focusin="showPortfolioSuggestions = true">
          <BaseInput
              :modelValue="marketStore.portfolioSearch"
              @update:modelValue="(val: string | number) => { marketStore.portfolioSearch = String(val); showPortfolioSuggestions = true }"
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

        <!-- Summary banner -->
        <div v-if="marketStore.portfolioImpacts.length > 0" class="flex flex-wrap gap-4 mb-4 p-3 border border-silver-20 rounded bg-silver-5">
          <div>
            <p class="text-tiny text-silver-50">{{ t('market.portfolio.totalChange') }}</p>
            <p
                class="text-h3 font-bold"
                :class="marketStore.portfolioSummary.totalChange >= 0 ? 'text-neon' : 'text-rust'"
            >
              {{ formatDollarChange(marketStore.portfolioSummary.totalChange) }}
            </p>
          </div>
          <div class="border-l border-silver-20 pl-4">
            <p class="text-tiny text-silver-50">{{ t('market.portfolio.affected', { count: marketStore.portfolioSummary.affectedCards }) }}</p>
            <div class="flex gap-3 mt-1">
              <span class="text-small font-bold text-neon">{{ t('market.portfolio.up', { count: marketStore.portfolioSummary.gainers }) }}</span>
              <span class="text-small font-bold text-rust">{{ t('market.portfolio.down', { count: marketStore.portfolioSummary.losers }) }}</span>
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
                <th class="py-2 px-2 text-right">{{ t('market.portfolio.table.qty') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.portfolio.table.was') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.portfolio.table.now') }}</th>
                <th class="py-2 px-2 text-right hidden sm:table-cell">{{ t('market.portfolio.table.change') }}</th>
                <th class="py-2 px-2 text-right">{{ t('market.portfolio.table.impact') }}</th>
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
                <td class="py-2.5 px-2 text-right text-silver-50">{{ item.card.quantity }}</td>
                <td class="py-2.5 px-2 text-right text-silver-50">{{ formatPrice(item.mover.pastPrice) }}</td>
                <td class="py-2.5 px-2 text-right text-silver font-medium">{{ formatPrice(item.mover.presentPrice) }}</td>
                <td
                    class="py-2.5 px-2 text-right font-bold hidden sm:table-cell"
                    :class="item.mover.percentChange > 0 ? 'text-neon' : 'text-rust'"
                >
                  {{ formatPercent(item.mover.percentChange) }}
                </td>
                <td
                    class="py-2.5 px-2 text-right font-bold"
                    :class="item.totalImpact > 0 ? 'text-neon' : 'text-rust'"
                >
                  {{ formatDollarChange(item.totalImpact) }}
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

    <!-- Bottom padding for mobile nav -->
    <div class="h-16 md:hidden"></div>
  </AppContainer>
</template>
