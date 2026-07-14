<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '../../composables/useI18n'

// Binder equivalent of DeckStatsFooter (design→app v2 F4a) — same fixed-bottom-bar
// anatomy as decks/DeckStatsFooter.vue, but binder-specific stats (no price source,
// no wishlist/completion — binders don't have those concepts) instead of the mana curve.
interface Props {
  totalCards: number
  forSaleCount: number
  tradeCount: number
  totalValue: number
}

defineProps<Props>()

const { t } = useI18n()

const expanded = ref(false)
const toggleExpanded = () => { expanded.value = !expanded.value }
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
          <span class="text-silver-50">{{ t('binders.stats.cards') }} <span class="font-display font-tnum font-bold text-silver text-small">{{ totalCards }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('binders.stats.forSale') }} <span class="font-display font-tnum font-bold text-rust text-small">{{ forSaleCount }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('binders.stats.trade') }} <span class="font-display font-tnum font-bold text-neon text-small">{{ tradeCount }}</span></span>
          <span class="flex-1"></span>
          <span class="text-silver-50 text-right">{{ t('binders.stats.value') }} <span class="font-display font-tnum font-bold text-neon text-h3">${{ totalValue.toFixed(2) }}</span></span>
        </div>
        <!-- Mobile -->
        <div class="md:hidden">
          <button
              @click="toggleExpanded"
              class="w-full flex items-center justify-between px-4 py-1"
          >
            <div class="flex items-center gap-1.5 text-[11px]">
              <span class="font-display font-tnum font-bold text-silver">{{ totalCards }}</span>
              <span class="text-silver-30">|</span>
              <span class="font-display font-tnum text-rust font-bold">{{ forSaleCount }}</span>
              <span class="text-silver-30">|</span>
              <span class="font-display font-tnum text-neon font-bold">${{ totalValue.toFixed(2) }}</span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 class="text-silver-50 transition-transform duration-200" :class="expanded ? 'rotate-180' : ''">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>

          <div v-if="expanded" class="px-4 pb-1.5 flex items-center gap-3 text-[11px]">
            <span><span class="text-silver-50">{{ t('binders.stats.cards') }} </span><span class="font-display font-tnum font-bold text-silver">{{ totalCards }}</span></span>
            <span><span class="text-silver-50">{{ t('binders.stats.forSale') }} </span><span class="font-display font-tnum font-bold text-rust">{{ forSaleCount }}</span></span>
            <span><span class="text-silver-50">{{ t('binders.stats.trade') }} </span><span class="font-display font-tnum font-bold text-neon">{{ tradeCount }}</span></span>
            <span><span class="text-silver-50">{{ t('binders.stats.value') }} </span><span class="font-display font-tnum font-bold text-neon">${{ totalValue.toFixed(2) }}</span></span>
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
