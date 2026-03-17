<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'
import { formatDollarChange, formatPrice } from '../../utils/formatters'

withDefaults(defineProps<{
  totalChange: number
  affectedCards: number
  gainers: number
  losers: number
  totalValue?: number
  keyPrefix?: string
}>(), {
  keyPrefix: 'market.portfolio',
})

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-wrap gap-4 mb-4 p-3 border border-silver-20 rounded bg-silver-5">
    <div>
      <p class="text-tiny text-silver-50">{{ t(`${keyPrefix}.totalChange`) }}</p>
      <p
          class="text-h3 font-bold"
          :class="totalChange >= 0 ? 'text-neon' : 'text-rust'"
      >
        {{ formatDollarChange(totalChange) }}
      </p>
    </div>
    <div v-if="totalValue !== undefined" class="border-l border-silver-20 pl-4">
      <p class="text-tiny text-silver-50">{{ t(`${keyPrefix}.totalValue`) }}</p>
      <p class="text-h3 font-bold text-silver">
        {{ formatPrice(totalValue) }}
      </p>
    </div>
    <div class="border-l border-silver-20 pl-4">
      <p class="text-tiny text-silver-50">{{ t(`${keyPrefix}.affected`, { count: affectedCards }) }}</p>
      <div class="flex gap-3 mt-1">
        <span class="text-small font-bold text-neon">{{ t(`${keyPrefix}.up`, { count: gainers }) }}</span>
        <span class="text-small font-bold text-rust">{{ t(`${keyPrefix}.down`, { count: losers }) }}</span>
      </div>
    </div>
  </div>
</template>
