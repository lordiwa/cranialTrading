<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useCollectionStore } from '../../stores/collection'
import { useCollectionTotals } from '../../composables/useCollectionTotals'
import { useI18n } from '../../composables/useI18n'
import BaseButton from '../ui/BaseButton.vue'

const { t } = useI18n()
const collectionStore = useCollectionStore()

const {
  loading,
  progress,
  totals,
  fetchAllPrices,
} = useCollectionTotals(() => collectionStore.cards)

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
</script>

<template>
  <div class="bg-secondary border border-silver-30 p-4 mb-6 rounded-md">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-h3 font-bold text-silver">{{ t('collection.totals.title') }}</h3>
      <BaseButton
          v-if="!loading"
          size="small"
          variant="secondary"
          @click="fetchAllPrices"
      >
        {{ t('collection.totals.update') }}
      </BaseButton>
      <div v-else class="text-tiny text-silver-50">
        {{ t('collection.totals.loading', { progress }) }}
      </div>
    </div>

    <!-- Loading bar -->
    <div v-if="loading" class="h-1 bg-primary mb-4 overflow-hidden">
      <div
          class="h-full bg-neon transition-all duration-300"
          :style="{ width: `${progress}%` }"
      ></div>
    </div>

    <!-- Totals Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <!-- Collection -->
      <div class="space-y-2">
        <p class="text-tiny text-silver-70 font-bold">{{ t('collection.totals.headers.collection') }}</p>
        <div class="space-y-1">
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">TCG:</span>
            <span class="text-small font-bold text-neon">{{ fmt(totals.tcgCollection) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">CK:</span>
            <span class="text-small font-bold text-[#4CAF50]">{{ fmt(totals.ckCollection) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">Buylist:</span>
            <span class="text-small text-[#FF9800]">{{ fmt(totals.ckBuylistCollection) }}</span>
          </div>
        </div>
      </div>

      <!-- Wishlist -->
      <div class="space-y-2">
        <p class="text-tiny text-silver-70 font-bold">{{ t('collection.totals.headers.wishlist') }}</p>
        <div class="space-y-1">
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">TCG:</span>
            <span class="text-small font-bold text-neon">{{ fmt(totals.tcgWishlist) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">CK:</span>
            <span class="text-small font-bold text-[#4CAF50]">{{ fmt(totals.ckWishlist) }}</span>
          </div>
        </div>
      </div>

      <!-- Sale -->
      <div class="space-y-2">
        <p class="text-tiny text-silver-70 font-bold">{{ t('collection.totals.headers.forSale') }}</p>
        <div class="space-y-1">
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">TCG:</span>
            <span class="text-small font-bold text-neon">{{ fmt(totals.tcgSale) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">CK:</span>
            <span class="text-small font-bold text-[#4CAF50]">{{ fmt(totals.ckSale) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">Buylist:</span>
            <span class="text-small text-[#FF9800]">{{ fmt(totals.ckBuylistSale) }}</span>
          </div>
        </div>
      </div>

      <!-- Total -->
      <div class="space-y-2 border-l border-silver-30 pl-4">
        <p class="text-tiny text-neon font-bold">{{ t('collection.totals.headers.total') }}</p>
        <div class="space-y-1">
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">TCG:</span>
            <span class="text-body font-bold text-neon">{{ fmt(totals.tcgTotal) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">CK:</span>
            <span class="text-body font-bold text-[#4CAF50]">{{ fmt(totals.ckTotal) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-tiny text-silver-50">Buylist:</span>
            <span class="text-body text-[#FF9800]">{{ fmt(totals.ckBuylistTotal) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
