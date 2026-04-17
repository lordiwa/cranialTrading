<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'

type DeckPriceSource = 'tcg' | 'ck' | 'buylist'

interface Props {
  ownedCount: number
  wishlistCount: number
  ownedCost: number
  wishlistCost: number
  totalCost: number
  priceSource: DeckPriceSource
  sourceColor: string
  sourceLabel: string
  expanded: boolean
  completionPercentage?: number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:expanded': [value: boolean]
  'change-source': [source: DeckPriceSource]
}>()

const { t } = useI18n()

const onSelectSource = (src: DeckPriceSource) => {
  emit('change-source', src)
}

const onToggleExpanded = () => {
  emit('update:expanded', !props.expanded)
}
</script>

<template>
  <Teleport to="body">
    <div
        class="fixed md:!bottom-0 left-0 right-0 z-40 bg-primary/95 backdrop-blur border-t border-neon overflow-x-hidden"
        :style="{ bottom: 'calc(3rem + env(safe-area-inset-bottom, 0px))' }"
    >
      <div class="container mx-auto max-w-[1200px]">
        <!-- Desktop -->
        <div class="hidden md:flex items-center gap-4 text-tiny px-4 py-2">
          <div class="flex items-center gap-1 border-r border-silver-30 pr-4">
            <span class="text-silver-50">{{ t('collection.totals.priceSource') }}:</span>
            <button
                v-for="src in (['tcg', 'ck', 'buylist'] as DeckPriceSource[])"
                :key="src"
                @click="onSelectSource(src)"
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
          <span class="text-silver-50">{{ t('collection.deckStats.have') }} <span class="font-bold text-neon text-small">{{ ownedCount }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.need') }} <span class="font-bold text-yellow-400 text-small">{{ wishlistCount }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.total') }} <span class="font-bold text-small"><span class="text-neon">{{ ownedCount }}</span><span class="text-silver-30">/</span>{{ ownedCount + wishlistCount }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.valueHave') }} <span class="font-bold" :class="sourceColor">${{ ownedCost.toFixed(2) }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.valueNeed') }} <span class="font-bold text-yellow-400">${{ wishlistCost.toFixed(2) }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.valueTotal') }} <span class="font-bold" :class="sourceColor">${{ totalCost.toFixed(2) }}</span></span>
          <div v-if="completionPercentage !== null && completionPercentage !== undefined" class="flex items-center gap-2 flex-1 ml-2">
            <div class="flex-1 h-2 bg-primary rounded overflow-hidden border border-silver-30/30">
              <div class="h-full bg-neon transition-all" :style="{ width: `${completionPercentage}%` }"></div>
            </div>
            <span class="font-bold text-neon">{{ completionPercentage.toFixed(0) }}%</span>
          </div>
        </div>
        <!-- Mobile -->
        <div class="md:hidden">
          <button
              @click="onToggleExpanded"
              class="w-full flex items-center justify-between px-4 py-1"
          >
            <div class="flex items-center gap-1.5 text-[11px]">
              <span class="font-bold uppercase" :class="sourceColor">{{ sourceLabel }}</span>
              <span class="text-silver-30">|</span>
              <span class="text-neon font-bold">{{ ownedCount }}</span><span class="text-silver-50 text-[11px]">/{{ ownedCount + wishlistCount }}</span>
              <span class="text-silver-30">|</span>
              <span class="text-silver-50">${{ totalCost.toFixed(2) }}</span>
              <span v-if="completionPercentage !== null && completionPercentage !== undefined" class="font-bold text-neon">{{ completionPercentage.toFixed(0) }}%</span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 class="text-silver-50 transition-transform duration-200" :class="expanded ? 'rotate-180' : ''">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>

          <div v-if="expanded" class="px-4 pb-1.5 space-y-1.5">
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                <button
                    v-for="src in (['tcg', 'ck', 'buylist'] as DeckPriceSource[])"
                    :key="src"
                    @click.stop="onSelectSource(src)"
                    :class="[
                      'px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors uppercase',
                      priceSource === src
                        ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                        : 'text-silver-50'
                    ]"
                >
                  {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'BUY' }}
                </button>
              </div>
              <span class="text-silver-30">|</span>
              <span class="text-[11px]"><span class="text-silver-50">Have </span><span class="text-neon font-bold">{{ ownedCount }}</span></span>
              <span class="text-silver-30">|</span>
              <span class="text-[11px]"><span class="text-silver-50">Need </span><span class="text-yellow-400 font-bold">{{ wishlistCount }}</span></span>
            </div>
            <div class="flex items-center gap-2 text-[11px]">
              <span><span class="text-silver-50">Have </span><span class="font-bold" :class="sourceColor">${{ ownedCost.toFixed(2) }}</span></span>
              <span class="text-silver-30">|</span>
              <span><span class="text-silver-50">Need </span><span class="font-bold text-yellow-400">${{ wishlistCost.toFixed(2) }}</span></span>
              <span class="text-silver-30">|</span>
              <span><span class="text-silver-50">Total </span><span class="font-bold" :class="sourceColor">${{ totalCost.toFixed(2) }}</span></span>
            </div>
            <div v-if="completionPercentage !== null && completionPercentage !== undefined" class="flex items-center gap-2">
              <div class="flex-1 h-1.5 bg-primary rounded overflow-hidden border border-silver-30/30">
                <div class="h-full bg-neon transition-all" :style="{ width: `${completionPercentage}%` }"></div>
              </div>
              <span class="text-[11px] font-bold text-neon">{{ completionPercentage.toFixed(0) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
button {
  transition: all 150ms ease-out;
}
</style>
