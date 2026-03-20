<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'
import { formatPercent } from '../../utils/formatters'

defineProps<{
  editionName: string
  avgChange: number
  topGainer: string
  topLoser: string
  cardCount: number
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-wrap gap-4 mb-4 p-3 border border-silver-20 rounded bg-silver-5">
    <div>
      <p class="text-tiny text-silver-50">{{ editionName }}</p>
      <p
          class="text-h3 font-bold"
          :class="avgChange >= 0 ? 'text-neon' : 'text-rust'"
      >
        {{ formatPercent(avgChange) }}
      </p>
      <p class="text-tiny text-silver-50">{{ t('market.setTrends.editionSummary.avgChange') }}</p>
    </div>
    <div class="border-l border-silver-20 pl-4">
      <p class="text-tiny text-silver-50">{{ t('market.setTrends.editionSummary.cards', { count: cardCount }) }}</p>
      <div class="mt-1">
        <p class="text-small text-neon">{{ t('market.setTrends.editionSummary.topGainer') }}: {{ topGainer }}</p>
        <p class="text-small text-rust">{{ t('market.setTrends.editionSummary.topLoser') }}: {{ topLoser }}</p>
      </div>
    </div>
  </div>
</template>
