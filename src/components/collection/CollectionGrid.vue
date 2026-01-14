<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCardAllocation } from '../../composables/useCardAllocation'
import type { Card } from '../../types/card'

const props = defineProps<{
  cards: Card[]
}>()

const emit = defineEmits<{
  cardClick: [card: Card]
  edit: [card: Card]
  delete: [card: Card]
  manageDecks: [card: Card]
}>()

const { getTotalAllocated, getAvailableQuantity, getAllocationsForCard } = useCardAllocation()

// Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref<Record<string, number>>({})

const getCardImage = (card: Card): string => {
  if (card.image && typeof card.image === 'string') {
    try {
      const parsed = JSON.parse(card.image)
      if (parsed.card_faces && parsed.card_faces.length > 0) {
        return parsed.card_faces[cardFaceIndex.value[card.id] || 0]?.image_uris?.normal || parsed.card_faces[0]?.image_uris?.normal || ''
      }
    } catch (e) {
      return card.image
    }
  }
  return card.image || ''
}

const isSplitCard = (card: Card): boolean => {
  if (card.image && typeof card.image === 'string') {
    try {
      const parsed = JSON.parse(card.image)
      return parsed.card_faces && parsed.card_faces.length > 1
    } catch (e) {
      return false
    }
  }
  return false
}

const toggleCardFace = (cardId: string, isSplit: boolean) => {
  if (!isSplit) return
  const currentIndex = cardFaceIndex.value[cardId] || 0
  const newIndex = currentIndex === 0 ? 1 : 0
  cardFaceIndex.value[cardId] = newIndex
}

// Get allocation info for a card
const getCardAllocationInfo = (card: Card) => {
  const allocated = getTotalAllocated(card.id)
  const available = getAvailableQuantity(card.id)
  const allocations = getAllocationsForCard(card.id)
  return { allocated, available, allocations }
}

// Check if card is used in any deck
const isCardAllocated = (card: Card): boolean => {
  return getTotalAllocated(card.id) > 0
}

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
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
    <div
        v-for="card in cards"
        :key="card.id"
        class="group cursor-pointer"
    >
      <!-- Card Image Container -->
      <div
          class="relative aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-all"
          :class="{ 'border-neon-30': isCardAllocated(card) }"
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
            v-if="isSplitCard(card)"
            @click.stop="toggleCardFace(card.id, true)"
            class="absolute top-2 left-2 bg-primary border border-neon px-2 py-1 text-tiny font-bold text-neon hover:bg-neon-10 transition-all"
            title="Click para ver el otro lado"
        >
          &#8596;
        </button>

        <!-- Status Badge (Overlay) -->
        <div class="absolute top-2 right-2 bg-secondary border border-silver-30 px-2 py-1">
          <p class="text-tiny font-bold" :class="getStatusColor(card.status)">
            {{ getStatusIcon(card.status) }} {{ card.status }}
          </p>
        </div>

        <!-- Qty Badge (Bottom Left) - Shows allocated info -->
        <div class="absolute bottom-2 left-2 bg-secondary border border-silver-30 px-2 py-1">
          <template v-if="isCardAllocated(card)">
            <p class="text-tiny font-bold">
              <span class="text-neon">{{ getCardAllocationInfo(card).available }}</span>
              <span class="text-silver-50">/{{ card.quantity }}</span>
            </p>
          </template>
          <template v-else>
            <p class="text-tiny font-bold text-neon">x{{ card.quantity }}</p>
          </template>
        </div>

        <!-- Deck indicator (Bottom Right) -->
        <div
            v-if="isCardAllocated(card)"
            class="absolute bottom-2 right-2 bg-neon-10 border border-neon px-2 py-1"
            :title="`En ${getCardAllocationInfo(card).allocations.length} mazo(s)`"
        >
          <p class="text-tiny font-bold text-neon">
            {{ getCardAllocationInfo(card).allocations.length }} deck{{ getCardAllocationInfo(card).allocations.length > 1 ? 's' : '' }}
          </p>
        </div>
      </div>

      <!-- Card Info -->
      <div class="mt-3 space-y-1">
        <!-- Name -->
        <p class="text-tiny font-bold text-silver line-clamp-2 group-hover:text-neon transition-colors">
          {{ card.name }}
        </p>

        <!-- Edition & Condition -->
        <p class="text-tiny text-silver-70">
          {{ card.edition }} - {{ card.condition }}
          <span v-if="card.foil" class="text-neon">FOIL</span>
        </p>

        <!-- Allocation summary if used in decks -->
        <p v-if="isCardAllocated(card)" class="text-tiny text-silver-50">
          {{ getCardAllocationInfo(card).allocated }} en mazos, {{ getCardAllocationInfo(card).available }} disp.
        </p>

        <!-- Price -->
        <p class="text-tiny font-bold text-neon">
          ${{ card.price ? card.price.toFixed(2) : 'N/A' }}
        </p>
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
