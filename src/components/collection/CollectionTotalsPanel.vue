<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useCollectionStore } from '../../stores/collection'
import { useCollectionTotals } from '../../composables/useCollectionTotals'
import { useI18n } from '../../composables/useI18n'
import { type PriceSnapshot, usePriceHistory } from '../../composables/usePriceHistory'

const { t } = useI18n()
const collectionStore = useCollectionStore()
const { saveSnapshot, loadHistory, saveCardPrices } = usePriceHistory()

const {
  loading,
  progress,
  totals,
  cardPrices,
  fetchAllPrices,
} = useCollectionTotals(() => collectionStore.cards)

type PriceSource = 'tcg' | 'ck' | 'buylist'
const priceSource = ref<PriceSource>('tcg')

// Mobile expand/collapse
const mobileExpanded = ref(false)

// Chart state
const showChart = ref(false)
const chartLoading = ref(false)
const history = ref<PriceSnapshot[]>([])

// Fetch prices when collection loads
watch(() => collectionStore.cards.length, (newLen, oldLen) => {
  if (newLen > 0 && oldLen === 0) {
    fetchAllPrices()
  }
})

onMounted(() => {
  if (collectionStore.cards.length > 0) {
    fetchAllPrices()
  }
})

// Auto-save snapshot when prices finish loading
watch(loading, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    saveSnapshot(
      {
        tcg: totals.value.tcgTotal,
        ck: totals.value.ckTotal,
        buylist: totals.value.ckBuylistTotal,
      },
      collectionStore.cards.reduce((sum, c) => sum + c.quantity, 0),
      collectionStore.cards.length,
    )
    saveCardPrices(collectionStore.cards, cardPrices.value)
  }
})

const fmt = (val: number) => `$${val.toFixed(2)}`

// Total card count (sum of quantities)
const totalCardCount = computed(() =>
  collectionStore.cards.reduce((sum, c) => sum + c.quantity, 0)
)

// Unique card count
const uniqueCardCount = computed(() => collectionStore.cards.length)

// Values by selected price source
const collectionValue = computed(() => {
  if (priceSource.value === 'ck') return totals.value.ckCollection
  if (priceSource.value === 'buylist') return totals.value.ckBuylistCollection
  return totals.value.tcgCollection
})

const wishlistValue = computed(() => {
  if (priceSource.value === 'ck') return totals.value.ckWishlist
  if (priceSource.value === 'buylist') return 0
  return totals.value.tcgWishlist
})

const saleValue = computed(() => {
  if (priceSource.value === 'ck') return totals.value.ckSale
  if (priceSource.value === 'buylist') return totals.value.ckBuylistSale
  return totals.value.tcgSale
})

const tradeValue = computed(() => {
  if (priceSource.value === 'ck') return totals.value.ckTrade
  if (priceSource.value === 'buylist') return totals.value.ckBuylistTrade
  return totals.value.tcgTrade
})

const totalValue = computed(() => {
  if (priceSource.value === 'ck') return totals.value.ckTotal
  if (priceSource.value === 'buylist') return totals.value.ckBuylistTotal
  return totals.value.tcgTotal
})

const sourceColor = computed(() => {
  if (priceSource.value === 'ck') return 'text-[#4CAF50]'
  if (priceSource.value === 'buylist') return 'text-[#FF9800]'
  return 'text-neon'
})

const activeSourceLabel = computed(() => {
  if (priceSource.value === 'ck') return 'CK'
  if (priceSource.value === 'buylist') return 'BUY'
  return 'TCG'
})


// Chart helpers
const sourceStrokeColor = computed(() => {
  if (priceSource.value === 'ck') return '#4CAF50'
  if (priceSource.value === 'buylist') return '#FF9800'
  return '#CCFF00'
})

const chartData = computed(() => {
  return history.value.map(s => ({
    date: s.date,
    value: priceSource.value === 'ck' ? s.ck : priceSource.value === 'buylist' ? s.buylist : s.tcg,
  }))
})

const chartHasData = computed(() => chartData.value.length >= 2)

const chartMinMax = computed(() => {
  if (!chartHasData.value) return { min: 0, max: 100 }
  const values = chartData.value.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Add 10% padding
  const padding = (max - min) * 0.1 || 10
  return { min: min - padding, max: max + padding }
})

const svgWidth = 400
const svgHeight = 120
const svgPadding = { top: 10, right: 10, bottom: 20, left: 10 }

const chartPoints = computed(() => {
  if (!chartHasData.value) return ''
  const { min, max } = chartMinMax.value
  const plotW = svgWidth - svgPadding.left - svgPadding.right
  const plotH = svgHeight - svgPadding.top - svgPadding.bottom
  const data = chartData.value
  return data.map((d, i) => {
    const x = svgPadding.left + (i / (data.length - 1)) * plotW
    const y = svgPadding.top + plotH - ((d.value - min) / (max - min)) * plotH
    return `${x},${y}`
  }).join(' ')
})

const chartFirstDate = computed(() => {
  const first = chartData.value[0]
  if (!chartHasData.value || !first) return ''
  return formatShortDate(first.date)
})

const chartLastDate = computed(() => {
  const last = chartData.value[chartData.value.length - 1]
  if (!chartHasData.value || !last) return ''
  return formatShortDate(last.date)
})

const chartLastValue = computed(() => {
  const last = chartData.value[chartData.value.length - 1]
  if (!chartHasData.value || !last) return ''
  return fmt(last.value)
})

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

async function toggleChart() {
  if (showChart.value) {
    showChart.value = false
    return
  }
  if (history.value.length === 0) {
    chartLoading.value = true
    try {
      history.value = await loadHistory()
    } catch (e) {
      console.warn('Failed to load price history:', e)
    } finally {
      chartLoading.value = false
    }
  }
  showChart.value = true
}
</script>

<template>
  <div class="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-primary/95 backdrop-blur border-t border-neon overflow-x-hidden">
    <!-- Loading bar -->
    <div v-if="loading" class="h-1 bg-primary overflow-hidden">
      <div
          class="h-full bg-neon transition-all duration-300"
          :style="{ width: `${progress}%` }"
      ></div>
    </div>

    <!-- Chart panel (slides above the footer, only when expanded) -->
    <div v-if="showChart && mobileExpanded" class="md:hidden border-b border-silver-10 px-4 py-3">
      <div class="container mx-auto max-w-7xl">
        <div class="flex items-center justify-between mb-2">
          <span class="text-tiny font-bold text-silver">{{ t('collection.totals.history.title') }}</span>
          <span v-if="chartHasData" class="text-tiny text-silver-50">
            {{ t('collection.totals.history.days', { count: chartData.length }) }}
          </span>
        </div>
        <div v-if="chartLoading" class="flex items-center justify-center h-[120px]">
          <span class="text-tiny text-silver-50 animate-pulse">...</span>
        </div>
        <div v-else-if="!chartHasData" class="flex items-center justify-center h-[80px]">
          <span class="text-tiny text-silver-50">{{ t('collection.totals.history.noData') }}</span>
        </div>
        <div v-else>
          <svg :viewBox="`0 0 ${svgWidth} ${svgHeight}`" class="w-full h-[120px]" preserveAspectRatio="none">
            <line :x1="svgPadding.left" :y1="svgPadding.top" :x2="svgWidth - svgPadding.right" :y2="svgPadding.top" stroke="#333" stroke-width="0.5" />
            <line :x1="svgPadding.left" :y1="svgHeight - svgPadding.bottom" :x2="svgWidth - svgPadding.right" :y2="svgHeight - svgPadding.bottom" stroke="#333" stroke-width="0.5" />
            <polyline :points="chartPoints" fill="none" :stroke="sourceStrokeColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
          <div class="flex items-center justify-between text-[14px] text-silver-50 -mt-1">
            <span>{{ chartFirstDate }}</span>
            <span class="font-bold" :class="sourceColor">{{ chartLastValue }}</span>
            <span>{{ chartLastDate }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Chart panel (desktop, always available) -->
    <div v-if="showChart" class="hidden md:block border-b border-silver-10 px-4 py-3">
      <div class="container mx-auto max-w-7xl">
        <div class="flex items-center justify-between mb-2">
          <span class="text-tiny font-bold text-silver">{{ t('collection.totals.history.title') }}</span>
          <span v-if="chartHasData" class="text-tiny text-silver-50">
            {{ t('collection.totals.history.days', { count: chartData.length }) }}
          </span>
        </div>
        <div v-if="chartLoading" class="flex items-center justify-center h-[120px]">
          <span class="text-tiny text-silver-50 animate-pulse">...</span>
        </div>
        <div v-else-if="!chartHasData" class="flex items-center justify-center h-[80px]">
          <span class="text-tiny text-silver-50">{{ t('collection.totals.history.noData') }}</span>
        </div>
        <div v-else>
          <svg :viewBox="`0 0 ${svgWidth} ${svgHeight}`" class="w-full h-[120px]" preserveAspectRatio="none">
            <line :x1="svgPadding.left" :y1="svgPadding.top" :x2="svgWidth - svgPadding.right" :y2="svgPadding.top" stroke="#333" stroke-width="0.5" />
            <line :x1="svgPadding.left" :y1="svgHeight - svgPadding.bottom" :x2="svgWidth - svgPadding.right" :y2="svgHeight - svgPadding.bottom" stroke="#333" stroke-width="0.5" />
            <polyline :points="chartPoints" fill="none" :stroke="sourceStrokeColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
          <div class="flex items-center justify-between text-[14px] text-silver-50 -mt-1">
            <span>{{ chartFirstDate }}</span>
            <span class="font-bold" :class="sourceColor">{{ chartLastValue }}</span>
            <span>{{ chartLastDate }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="container mx-auto max-w-7xl">
      <!-- Desktop: fila única (unchanged) -->
      <div class="hidden md:flex items-center gap-4 text-tiny px-4 py-2">
        <div class="flex items-center gap-1 border-r border-silver-30 pr-4">
          <span class="text-silver-50">{{ t('collection.totals.priceSource') }}:</span>
          <button
              v-for="src in (['tcg', 'ck', 'buylist'] as PriceSource[])"
              :key="src"
              @click="priceSource = src"
              :class="[
                'px-2 py-0.5 font-bold rounded transition-colors uppercase',
                priceSource === src
                  ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                  : 'text-silver-50 hover:text-silver hover:bg-silver-5'
              ]"
          >
            {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'Buylist' }}
          </button>
          <button
            @click="toggleChart"
            :class="[
              'ml-1 px-1.5 py-0.5 rounded transition-colors text-[14px]',
              showChart ? 'bg-silver-10 text-silver' : 'text-silver-50 hover:text-silver hover:bg-silver-5'
            ]"
            :title="t('collection.totals.history.title')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </button>
        </div>
        <span class="text-silver-50">{{ t('collection.totals.cards') }} <span class="font-bold text-silver text-small">{{ totalCardCount }}</span></span>
        <span class="text-silver-30">|</span>
        <span class="text-silver-50">{{ t('collection.totals.unique') }} <span class="font-bold text-silver text-small">{{ uniqueCardCount }}</span></span>
        <span class="text-silver-30">|</span>
        <span class="text-silver-50">{{ t('collection.totals.headers.collection') }} <span class="font-bold text-small" :class="sourceColor">{{ fmt(collectionValue) }}</span></span>
        <span class="text-silver-30">|</span>
        <span class="text-silver-50">{{ t('collection.totals.headers.wishlist') }} <span class="font-bold text-yellow-400 text-small">{{ fmt(wishlistValue) }}</span></span>
        <span class="text-silver-30">|</span>
        <span class="text-silver-50">{{ t('collection.totals.headers.forSale') }} <span class="font-bold text-small" :class="sourceColor">{{ fmt(saleValue) }}</span></span>
        <span class="text-silver-30">|</span>
        <span class="text-silver-50">{{ t('collection.totals.headers.forTrade') }} <span class="font-bold text-small" :class="sourceColor">{{ fmt(tradeValue) }}</span></span>
        <span class="text-silver-30">|</span>
        <span class="text-silver-50">{{ t('collection.totals.headers.total') }} <span class="font-bold text-small" :class="sourceColor">{{ fmt(totalValue) }}</span></span>
        <span v-if="loading" class="text-tiny text-silver-50 ml-auto">{{ progress }}%</span>
      </div>

      <!-- Mobile: thin collapsed bar + expandable detail -->
      <div class="md:hidden">
        <!-- Collapsed handle: minimal height -->
        <button
          @click="mobileExpanded = !mobileExpanded"
          class="w-full flex items-center justify-between px-4 py-1"
        >
          <div class="flex items-center gap-1.5 text-[11px]">
            <span class="font-bold uppercase" :class="sourceColor">{{ activeSourceLabel }}</span>
            <span class="text-silver-30">|</span>
            <span class="text-silver-50">{{ fmt(totalValue) }}</span>
            <span v-if="loading" class="text-silver-50">({{ progress }}%)</span>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               class="text-silver-50 transition-transform duration-200" :class="mobileExpanded ? 'rotate-180' : ''">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>

        <!-- Expanded detail panel -->
        <div v-if="mobileExpanded" class="px-4 pb-1.5 space-y-1.5">
          <!-- Row 1: source buttons + chart + counts -->
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1">
              <button
                  v-for="src in (['tcg', 'ck', 'buylist'] as PriceSource[])"
                  :key="src"
                  @click.stop="priceSource = src"
                  :class="[
                    'px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors uppercase',
                    priceSource === src
                      ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                      : 'text-silver-50'
                  ]"
              >
                {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'BUY' }}
              </button>
              <button
                @click.stop="toggleChart"
                :class="[
                  'px-1 py-0.5 rounded transition-colors',
                  showChart ? 'bg-silver-10 text-silver' : 'text-silver-50'
                ]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </button>
            </div>
            <span class="text-silver-30">|</span>
            <span class="text-[11px] text-silver-50">{{ totalCardCount }}<span class="text-silver-30 mx-1">·</span>{{ uniqueCardCount }}u</span>
          </div>
          <!-- Row 2: price breakdowns -->
          <div class="flex items-center gap-2 text-[11px]">
            <span class="flex-shrink-0"><span class="text-silver-50">Col </span><span class="font-bold" :class="sourceColor">{{ fmt(collectionValue) }}</span></span>
            <span class="text-silver-30 flex-shrink-0">|</span>
            <span class="flex-shrink-0"><span class="text-silver-50">Wish </span><span class="font-bold text-yellow-400">{{ fmt(wishlistValue) }}</span></span>
            <span class="text-silver-30 flex-shrink-0">|</span>
            <span class="flex-shrink-0"><span class="text-silver-50">Sale </span><span class="font-bold" :class="sourceColor">{{ fmt(saleValue) }}</span></span>
            <span class="text-silver-30 flex-shrink-0">|</span>
            <span class="flex-shrink-0"><span class="text-silver-50">Trade </span><span class="font-bold" :class="sourceColor">{{ fmt(tradeValue) }}</span></span>
            <span class="text-silver-30 flex-shrink-0">|</span>
            <span class="flex-shrink-0"><span class="text-silver-50">Total </span><span class="font-bold" :class="sourceColor">{{ fmt(totalValue) }}</span></span>
          </div>
        </div>

        <!-- Loading bar -->
        <div v-if="loading" class="h-1 bg-primary overflow-hidden">
          <div class="h-full bg-neon transition-all duration-300" :style="{ width: `${progress}%` }"></div>
        </div>
      </div>
    </div>
  </div>
</template>
