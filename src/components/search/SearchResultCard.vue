<script setup lang="ts">
import { onMounted } from 'vue'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'
import type { ScryfallCard } from '../../services/scryfall'
import IconV2 from '../ui/IconV2.vue'
import ManaCost from '../ui/ManaCost.vue'

const props = withDefaults(defineProps<{
  card: ScryfallCard
  ownedCount?: number
}>(), {
  ownedCount: 0
})

const emit = defineEmits<{
  click: [card: ScryfallCard]
}>()

const { t } = useI18n()

// Card Kingdom prices
const {
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => props.card?.id,
  () => props.card?.set
)

// Fetch CK prices on mount
onMounted(() => {
  if (props.card?.id && props.card?.set) {
    void fetchCKPrices()
  }
})

const getCardImage = (card: ScryfallCard): string => {
  return card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.small ?? card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? ''
}
</script>

<template>
  <div
      class="flex flex-col gap-2 bg-surface-1 border border-line rounded-lg p-3 transition-all duration-200 ease-v2 hover:bg-surface-2 hover:border-line-strong hover:-translate-y-0.5 hover:shadow-medium group"
      data-testid="search-result-card"
  >
    <button
        type="button"
        :aria-label="card.name"
        class="relative aspect-[63/88] w-full block rounded-md overflow-hidden border border-line bg-surface-2 focus-visible:outline-none focus-visible:shadow-glow-neon"
        @click="emit('click', card)"
    >
      <img
          v-if="getCardImage(card)"
          :src="getCardImage(card)"
          :alt="card.name"
          loading="lazy"
          class="w-full h-full object-cover"
      />
      <!-- Owned badge -->
      <span
          v-if="ownedCount > 0"
          class="absolute top-2 right-2 px-2.5 py-0.5 rounded-full bg-neon-15 border border-neon-40 text-neon font-display text-[11px] font-bold"
          data-testid="owned-badge"
      >
        {{ t('search.owned', { count: ownedCount }) }}
      </span>
    </button>

    <p translate="no" class="text-small font-semibold text-silver leading-tight truncate group-hover:text-neon transition-colors duration-200 ease-v2">{{ card.name }}</p>
    <ManaCost v-if="card.mana_cost" :cost="card.mana_cost" size="tiny" />

    <!-- Multi-source prices -->
    <div class="mt-auto space-y-0.5">
      <p v-if="hasCardKingdomPrices" class="font-display font-tnum text-small font-bold text-neon">
        <small class="text-silver-30 font-bold text-[11px] mr-1">CK</small>{{ formatPrice(cardKingdomRetail) }}
      </p>
      <p v-else class="font-display font-tnum text-small font-bold text-silver-50">CK: -</p>
      <p class="text-tiny text-silver-50">TCG: ${{ card.prices?.usd ?? 'N/A' }}</p>
      <p v-if="cardKingdomBuylist" class="text-tiny text-silver-50">BL: {{ formatPrice(cardKingdomBuylist) }}</p>
    </div>

    <!-- design→app v2 F6 — explicit "+ Agregar" affordance opening the shared AddCardModal
         (DESIGN-DIRECTION.md §8.4: only the button's style changes here, not the modal flow) -->
    <button
        type="button"
        class="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-md border border-neon bg-neon-10 text-neon text-tiny font-bold uppercase tracking-[.06em] transition-all duration-200 ease-v2 hover:bg-neon-15 hover:shadow-glow-neon"
        @click="emit('click', card)"
    >
      <IconV2 name="plus" :size="15" />
      {{ t('search.view.addButton') }}
    </button>
  </div>
</template>
