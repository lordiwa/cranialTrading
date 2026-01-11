<script setup lang="ts">
import { ref } from 'vue'
import { Card } from '../../types/card'

interface Props {
  cards: Card[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  click: [card: Card]
  edit: [card: Card]
  delete: [card: Card]
}>()

// Estado para imágenes que fallaron
const failedImages = ref<Set<string>>(new Set())

const getCardImageUrl = (card: Card): string => {
  if (card.image && card.image.trim() && !failedImages.value.has(card.id)) {
    return card.image
  }
  return getPlaceholder()
}

const getPlaceholder = (): string => {
  return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"%3E%3Crect fill="%23333333" width="200" height="280"/%3E%3Ctext x="100" y="140" dominant-baseline="middle" text-anchor="middle" fill="%23888888" font-family="IBM Plex Mono" font-size="14" font-weight="bold"%3ENo Image%3C/text%3E%3C/svg%3E'
}

const handleClick = (card: Card) => {
  emit('click', card)
}

const handleEdit = (e: Event, card: Card) => {
  e.stopPropagation()
  emit('edit', card)
}

const handleDelete = (e: Event, card: Card) => {
  e.stopPropagation()
  emit('delete', card)
}

const handleImageError = (cardId: string) => {
  failedImages.value.add(cardId)
}
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
    <!-- Card por cada carta -->
    <div
        v-for="card in cards"
        :key="card.id"
        @click="handleClick(card)"
        class="bg-[#000000] border border-[#EEEEEE]/30 hover:border-[#CCFF00]/40 cursor-pointer transition-300 overflow-hidden group"
    >
      <!-- Imagen -->
      <div class="relative bg-[#000000] aspect-[3/4] overflow-hidden">
        <img
            :src="getCardImageUrl(card)"
            :alt="card.name"
            class="w-full h-full object-cover group-hover:scale-105 transition-300"
            @error="() => handleImageError(card.id)"
        />

        <!-- Overlay en hover -->
        <div class="absolute inset-0 bg-[#000000]/0 group-hover:bg-[#CCFF00]/5 transition-300" />
      </div>

      <!-- Info de la carta -->
      <div class="p-3 bg-[#000000] space-y-2 border-t border-[#EEEEEE]/20">
        <!-- Nombre -->
        <p class="text-sm font-bold text-[#EEEEEE] truncate">
          {{ card.name }}
        </p>

        <!-- Cantidad | Condición | Foil -->
        <div class="flex items-center justify-between text-xs text-[#EEEEEE]/70">
          <span>x{{ card.quantity }}</span>
          <span>{{ card.condition }}</span>
          <span v-if="card.foil" class="text-[#CCFF00]">✦</span>
        </div>

        <!-- Precio -->
        <p class="text-sm font-bold text-[#CCFF00]">
          ${{ card.price?.toFixed(2) || '0.00' }}
        </p>

        <!-- Edición -->
        <p class="text-xs text-[#EEEEEE]/50 truncate">
          {{ card.edition }}
        </p>

        <!-- Botones de acción -->
        <div class="flex gap-2 pt-2 border-t border-[#EEEEEE]/10">
          <button
              @click="handleEdit($event, card)"
              class="flex-1 px-2 py-1 bg-[#000000] border border-[#EEEEEE]/30 text-[#EEEEEE] text-xs font-bold hover:border-[#CCFF00] hover:text-[#CCFF00] transition-150"
          >
            EDITAR
          </button>
          <button
              @click="handleDelete($event, card)"
              class="flex-1 px-2 py-1 bg-[#000000] border border-[#EEEEEE]/30 text-[#EEEEEE] text-xs font-bold hover:border-[#333333] hover:text-[#333333] transition-150"
          >
            BORRAR
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transition-300 {
  transition: all 300ms ease-in-out;
}

.transition-150 {
  transition: all 150ms ease-out;
}
</style>