<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useCollectionStore } from '../../stores/collection'
import { useCollectionTotals } from '../../composables/useCollectionTotals'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()
const collectionStore = useCollectionStore()

const {
  loading,
  progress,
  totals,
  fetchAllPrices,
} = useCollectionTotals(() => collectionStore.cards)

type PriceSource = 'tcg' | 'ck' | 'buylist'
const priceSource = ref<PriceSource>('tcg')

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
</script>

<template>
  <div class="fixed bottom-0 left-0 right-0 z-40 bg-primary/95 backdrop-blur border-t-2 border-neon">
    <!-- Loading bar -->
    <div v-if="loading" class="h-1 bg-primary overflow-hidden">
      <div
          class="h-full bg-neon transition-all duration-300"
          :style="{ width: `${progress}%` }"
      ></div>
    </div>

    <div class="container mx-auto max-w-7xl px-4 py-2">
      <!-- Desktop: fila única -->
      <div class="hidden md:flex items-center gap-4 text-tiny">
        <!-- Price source selector -->
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

      <!-- Mobile: 2 filas compactas -->
      <div class="md:hidden">
        <!-- Price source selector + total cards -->
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-1">
            <button
                v-for="src in (['tcg', 'ck', 'buylist'] as PriceSource[])"
                :key="src"
                @click="priceSource = src"
                :class="[
                  'px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors uppercase',
                  priceSource === src
                    ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                    : 'text-silver-50 hover:text-silver hover:bg-silver-5'
                ]"
            >
              {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'BUY' }}
            </button>
          </div>
          <span class="text-tiny text-silver-50">{{ totalCardCount }} {{ t('collection.totals.cards').toLowerCase() }} · {{ uniqueCardCount }} {{ t('collection.totals.unique').toLowerCase() }}</span>
        </div>
        <!-- Values grid -->
        <div class="grid grid-cols-4 gap-2 text-center text-tiny">
          <div>
            <span class="text-silver-50 block text-[10px]">{{ t('collection.totals.headers.collection') }}</span>
            <span class="font-bold" :class="sourceColor">{{ fmt(collectionValue) }}</span>
          </div>
          <div>
            <span class="text-silver-50 block text-[10px]">{{ t('collection.totals.headers.forSale') }}</span>
            <span class="font-bold" :class="sourceColor">{{ fmt(saleValue) }}</span>
          </div>
          <div>
            <span class="text-silver-50 block text-[10px]">{{ t('collection.totals.headers.wishlist') }}</span>
            <span class="font-bold text-yellow-400">{{ fmt(wishlistValue) }}</span>
          </div>
          <div>
            <span class="text-silver-50 block text-[10px]">TOTAL</span>
            <span class="font-bold" :class="sourceColor">{{ fmt(totalValue) }}</span>
          </div>
        </div>
        <div v-if="loading" class="mt-1 h-1 bg-primary overflow-hidden rounded">
          <div class="h-full bg-neon transition-all duration-300" :style="{ width: `${progress}%` }"></div>
        </div>
      </div>
    </div>
  </div>
</template>
