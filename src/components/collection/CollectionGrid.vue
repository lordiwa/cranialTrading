<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Card } from '../../types/card'

const props = defineProps<{
  cards: Card[]
}>()

const emit = defineEmits<{
  cardClick: [card: Card]
  edit: [card: Card]
  delete: [card: Card]
}>()

// ✅ NUEVO: Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref<Record<string, number>>({})

const getCardImage = (card: Card): string => {
  // ✅ CORREGIDO: Intentar obtener imagen de card_faces PRIMERO
  if (card.image && typeof card.image === 'string') {
    try {
      const parsed = JSON.parse(card.image)
      if (parsed.card_faces && parsed.card_faces.length > 0) {
        // Si es split card guardado como JSON
        return parsed.card_faces[cardFaceIndex.value[card.id] || 0]?.image_uris?.normal || parsed.card_faces[0]?.image_uris?.normal || ''
      }
    } catch (e) {
      // Si no es JSON, usar como URL normal
      return card.image
    }
  }
  return card.image || ''
}

// ✅ NUEVO: Detectar split cards
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

// ✅ NUEVO: Toggle entre lados de split card
const toggleCardFace = (cardId: string, isSplit: boolean) => {
  if (!isSplit) return

  const currentIndex = cardFaceIndex.value[cardId] || 0
  const newIndex = currentIndex === 0 ? 1 : 0
  cardFaceIndex.value[cardId] = newIndex
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
    sale: '💰',
    trade: '🔄',
    wishlist: '⭐',
  }
  return icons[status as keyof typeof icons] || '•'
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

        <!-- ✅ NUEVO: Toggle button para split cards -->
        <button
            v-if="isSplitCard(card)"
            @click.stop="toggleCardFace(card.id, true)"
            class="absolute top-2 left-2 bg-primary border border-neon px-2 py-1 text-tiny font-bold text-neon hover:bg-neon-10 transition-all"
            title="Click para ver el otro lado"
        >
          ↔️
        </button>

        <!-- Status Badge (Overlay) -->
        <div class="absolute top-2 right-2 bg-secondary border border-silver-30 px-2 py-1">
          <p class="text-tiny font-bold" :class="getStatusColor(card.status)">
            {{ getStatusIcon(card.status) }} {{ card.status }}
          </p>
        </div>

        <!-- Qty Badge (Bottom Left) -->
        <div class="absolute bottom-2 left-2 bg-secondary border border-silver-30 px-2 py-1">
          <p class="text-tiny font-bold text-neon">x{{ card.quantity }}</p>
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
          {{ card.edition }} • {{ card.condition }}
          <span v-if="card.foil" class="text-neon">✦</span>
        </p>

        <!-- Price -->
        <p class="text-tiny font-bold text-neon">
          ${{ card.price ? card.price.toFixed(2) : 'N/A' }}
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-2 mt-3">
        <button
            @click="emit('edit', card)"
            class="flex-1 px-2 py-1 bg-neon-10 border border-neon text-neon text-tiny font-bold hover:bg-neon-20 transition-150"
        >
          ✏️
        </button>
        <button
            @click="emit('delete', card)"
            class="flex-1 px-2 py-1 bg-rust-10 border border-rust text-rust text-tiny font-bold hover:bg-rust-20 transition-150"
        >
          🗑️
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Responsive grid sizes */
@media (max-width: 768px) {
  /* Already 2 columns via grid-cols-2 */
}

@media (min-width: 768px) {
  /* 3 columns for tablet */
}

@media (min-width: 1024px) {
  /* 5 columns for desktop */
}
</style>