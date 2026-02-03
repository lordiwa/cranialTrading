<script setup lang="ts">
import { onMounted } from 'vue'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  card: any
  ownedCount?: number
}>(), {
  ownedCount: 0
})

const emit = defineEmits<{
  click: [card: any]
}>()

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
    fetchCKPrices()
  }
})

const getCardImage = (card: any): string => {
  return card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || ''
}
</script>

<template>
  <div
      @click="emit('click', card)"
      class="cursor-pointer group"
  >
    <div class="relative aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-150 rounded">
      <img
          v-if="getCardImage(card)"
          :src="getCardImage(card)"
          :alt="card.name"
          loading="lazy"
          class="w-full h-full object-cover group-hover:scale-105 transition-300"
      />
      <!-- Owned badge -->
      <div
          v-if="ownedCount > 0"
          class="absolute top-2 right-2 bg-neon text-primary text-[10px] font-bold px-1.5 py-0.5 rounded"
      >
        {{ t('search.owned', { count: ownedCount }) }}
      </div>
    </div>
    <p class="text-tiny text-silver mt-2 truncate group-hover:text-neon">{{ card.name }}</p>

    <!-- Multi-source prices -->
    <div class="space-y-0.5 mt-1">
      <p class="text-tiny font-bold text-neon">${{ card.prices?.usd || 'N/A' }}</p>
      <p v-if="hasCardKingdomPrices" class="text-tiny font-bold text-[#4CAF50]">
        CK: {{ formatPrice(cardKingdomRetail) }}
      </p>
      <p v-if="cardKingdomBuylist" class="text-tiny text-[#FF9800]">
        BL: {{ formatPrice(cardKingdomBuylist) }}
      </p>
    </div>
  </div>
</template>
