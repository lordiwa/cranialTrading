<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import type { Card } from '../../types/card'

const props = withDefaults(defineProps<{
  card: Card
  compact?: boolean
}>(), {
  compact: false
})

const emit = defineEmits<{
  cardClick: [card: Card]
  edit: [card: Card]
  delete: [card: Card]
  manageDecks: [card: Card]
}>()

const { getTotalAllocated, getAvailableQuantity, getAllocationsForCard } = useCardAllocation()

// Card Kingdom prices
const {
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => props.card.scryfallId,
  () => props.card.setCode
)

// Fetch CK prices on mount (useCardPrices handles missing setCode by fetching from Scryfall)
onMounted(() => {
  if (props.card.scryfallId) {
    fetchCKPrices()
  }
})

// Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref(0)

const getCardImage = (card: Card): string => {
  if (card.image && typeof card.image === 'string') {
    try {
      const parsed = JSON.parse(card.image)
      if (parsed.card_faces && parsed.card_faces.length > 0) {
        return parsed.card_faces[cardFaceIndex.value]?.image_uris?.normal || parsed.card_faces[0]?.image_uris?.normal || ''
      }
    } catch {
      return card.image
    }
  }
  return card.image || ''
}

const isSplitCard = computed((): boolean => {
  if (props.card.image && typeof props.card.image === 'string') {
    try {
      const parsed = JSON.parse(props.card.image)
      return parsed.card_faces && parsed.card_faces.length > 1
    } catch {
      return false
    }
  }
  return false
})

const toggleCardFace = () => {
  if (isSplitCard.value) {
    cardFaceIndex.value = cardFaceIndex.value === 0 ? 1 : 0
  }
}

// Get allocation info for a card
const allocationInfo = computed(() => {
  const allocated = getTotalAllocated(props.card.id)
  const available = getAvailableQuantity(props.card.id)
  const allocations = getAllocationsForCard(props.card.id)
  return { allocated, available, allocations }
})

// Check if card is used in any deck
const isCardAllocated = computed((): boolean => {
  return getTotalAllocated(props.card.id) > 0
})

const getStatusColor = (status: string) => {
  const colors = {
    collection: 'text-neon',
    sale: 'text-yellow-400',
    trade: 'text-blue-400',
    wishlist: 'text-red-400',
  }
  return colors[status as keyof typeof colors] || 'text-silver-70'
}

const getStatusIcon = (status: string) => {
  const icons = {
    collection: '✓',
    sale: '$',
    trade: '~',
    wishlist: '*',
  }
  return icons[status as keyof typeof icons] || '-'
}
</script>

<template>
  <!-- COMPACT MODE: For deck view -->
  <div v-if="compact" class="group cursor-pointer min-h-[180px]" @click="emit('cardClick', card)">
    <div class="relative aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-all">
      <img
          v-if="getCardImage(card)"
          :src="getCardImage(card)"
          :alt="card.name"
          loading="lazy"
          class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center bg-primary">
        <span class="text-[10px] text-silver-50">No img</span>
      </div>

      <!-- Qty Badge - BIGGER for compact -->
      <div class="absolute bottom-1 left-1 bg-primary/90 border border-neon px-2 py-1">
        <p class="text-small font-bold text-neon">x{{ card.quantity }}</p>
      </div>
    </div>

    <!-- Minimal Card Info -->
    <div class="mt-1 min-h-[50px]">
      <p class="text-[10px] font-bold text-silver line-clamp-2 group-hover:text-neon transition-colors leading-tight">
        {{ card.name }}
      </p>
      <p class="text-[10px] text-silver-70">${{ card.price ? card.price.toFixed(2) : 'N/A' }} c/u</p>
      <p class="text-[10px] text-neon font-bold">${{ card.price ? (card.price * card.quantity).toFixed(2) : 'N/A' }}</p>
    </div>
  </div>

  <!-- FULL MODE: For collection view -->
  <div v-else class="group cursor-pointer">
    <!-- Card Image Container -->
    <div
        class="relative aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-all"
        :class="{ 'border-neon-30': isCardAllocated }"
        @click="emit('cardClick', card)"
    >
      <img
          v-if="getCardImage(card)"
          :src="getCardImage(card)"
          :alt="card.name"
          loading="lazy"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
      />
      <div v-else class="w-full h-full flex items-center justify-center bg-primary">
        <span class="text-tiny text-silver-50">No image</span>
      </div>

      <!-- Toggle button para split cards -->
      <button
          v-if="isSplitCard"
          @click.stop="toggleCardFace"
          class="absolute top-2 left-2 bg-primary border border-neon px-2 py-1 text-tiny font-bold text-neon hover:bg-neon-10 transition-all"
          title="Click para ver el otro lado"
          aria-label="Ver otro lado de la carta"
      >
        &#8596;
      </button>

      <!-- Status Badge (Overlay) -->
      <div class="absolute top-2 right-2 bg-primary/90 border border-silver-30 px-2 py-1">
        <p class="text-tiny font-bold" :class="getStatusColor(card.status)">
          {{ getStatusIcon(card.status) }} {{ card.status }}
        </p>
      </div>

      <!-- Qty Badge (Bottom Left) - Shows allocated info -->
      <div class="absolute bottom-2 left-2 bg-secondary border border-silver-30 px-2 py-1">
        <template v-if="isCardAllocated">
          <p class="text-tiny font-bold">
            <span class="text-neon">{{ allocationInfo.available }}</span>
            <span class="text-silver-50">/{{ card.quantity }}</span>
          </p>
        </template>
        <template v-else>
          <p class="text-tiny font-bold text-neon">x{{ card.quantity }}</p>
        </template>
      </div>

      <!-- Deck badges (Bottom Right) -->
      <div
          v-if="isCardAllocated"
          class="absolute bottom-2 right-2 flex flex-wrap gap-1 justify-end max-w-[60%]"
      >
        <div
            v-for="alloc in allocationInfo.allocations.slice(0, 3)"
            :key="alloc.deckId"
            class="bg-neon-10 border border-neon px-1.5 py-0.5"
            :title="`${alloc.quantity}x en ${alloc.deckName}${alloc.isInSideboard ? ' (SB)' : ''}`"
        >
          <p class="text-[10px] font-bold text-neon truncate max-w-[60px]">
            {{ alloc.quantity }}x {{ alloc.deckName.slice(0, 6) }}{{ alloc.deckName.length > 6 ? '..' : '' }}
          </p>
        </div>
        <div
            v-if="allocationInfo.allocations.length > 3"
            class="bg-neon-10 border border-neon px-1.5 py-0.5"
            :title="`Y ${allocationInfo.allocations.length - 3} mazos más`"
        >
          <p class="text-[10px] font-bold text-neon">+{{ allocationInfo.allocations.length - 3 }}</p>
        </div>
      </div>
    </div>

    <!-- Card Info -->
    <div class="mt-3 space-y-1 min-h-[120px]">
      <!-- Name -->
      <p class="text-tiny font-bold text-silver line-clamp-2 group-hover:text-neon transition-colors min-h-[32px]">
        {{ card.name }}
      </p>

      <!-- Edition & Condition -->
      <p class="text-tiny text-silver-70">
        {{ card.edition }} - {{ card.condition }}
        <span v-if="card.foil" class="text-neon">FOIL</span>
      </p>

      <!-- Allocation summary if used in decks -->
      <p v-if="isCardAllocated" class="text-tiny text-silver-50">
        {{ allocationInfo.allocated }} en mazos, {{ allocationInfo.available }} disp.
      </p>
      <p v-else class="text-tiny text-silver-50 invisible">-</p>

      <!-- Multi-source Prices -->
      <div class="space-y-0.5 min-h-[48px]">
        <!-- TCGPlayer Price -->
        <p class="text-tiny font-bold text-neon">
          ${{ card.price ? card.price.toFixed(2) : 'N/A' }}
        </p>
        <!-- Card Kingdom Price -->
        <p v-if="hasCardKingdomPrices" class="text-tiny font-bold text-[#4CAF50]">
          CK: {{ formatPrice(cardKingdomRetail) }}
        </p>
        <p v-else class="text-tiny text-transparent">-</p>
        <!-- CK Buylist -->
        <p v-if="cardKingdomBuylist" class="text-tiny text-[#FF9800]">
          BL: {{ formatPrice(cardKingdomBuylist) }}
        </p>
        <p v-else class="text-tiny text-transparent">-</p>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-1 mt-3">
      <button
          @click="emit('manageDecks', card)"
          class="flex-1 px-2 py-1 bg-blue-10 border border-blue-400 text-blue-400 text-tiny font-bold hover:bg-blue-20 transition-150"
          title="Asignar a mazos"
      >
        MAZOS
      </button>
      <button
          @click="emit('edit', card)"
          class="flex-1 px-2 py-1 bg-neon-10 border border-neon text-neon text-tiny font-bold hover:bg-neon-20 transition-150"
      >
        EDITAR
      </button>
      <button
          @click="emit('delete', card)"
          class="flex-1 px-2 py-1 bg-rust-10 border border-rust text-rust text-tiny font-bold hover:bg-rust-20 transition-150"
      >
        BORRAR
      </button>
    </div>
  </div>
</template>

<style scoped>
.border-neon-30 {
  border-color: rgba(0, 255, 136, 0.3);
}
.bg-neon-10 {
  background-color: rgba(0, 255, 136, 0.1);
}
.bg-neon-20 {
  background-color: rgba(0, 255, 136, 0.2);
}
.bg-rust-10 {
  background-color: rgba(183, 65, 14, 0.1);
}
.bg-rust-20 {
  background-color: rgba(183, 65, 14, 0.2);
}
.bg-blue-10 {
  background-color: rgba(96, 165, 250, 0.1);
}
.bg-blue-20 {
  background-color: rgba(96, 165, 250, 0.2);
}
</style>
