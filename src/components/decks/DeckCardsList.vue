<script setup lang="ts">
import { computed } from 'vue'
import type { DeckCard } from '../../types/deck'

const props = defineProps<{
  cards: DeckCard[]
  deckId: string
  title: string
}>()

const emit = defineEmits<{
  edit: [cardId: string]
  remove: [cardId: string]
}>()

const totalPrice = computed(() => {
  return props.cards.reduce((sum, card) => sum + card.price * card.quantity, 0)
})

const totalCards = computed(() => {
  return props.cards.reduce((sum, card) => sum + card.quantity, 0)
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="bg-secondary border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">CARTAS ÚNICAS</p>
        <p class="text-h3 font-bold text-neon">{{ cards.length }}</p>
      </div>
      <div class="bg-secondary border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">TOTAL CARTAS</p>
        <p class="text-h3 font-bold text-silver">{{ totalCards }}</p>
      </div>
      <div class="bg-secondary border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">COSTO PROMEDIO</p>
        <p class="text-h3 font-bold text-silver">${{ (totalPrice / (totalCards || 1)).toFixed(2) }}</p>
      </div>
      <div class="bg-secondary border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">COSTO TOTAL</p>
        <p class="text-h3 font-bold text-neon">${{ totalPrice.toFixed(2) }}</p>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="cards.length === 0" class="border border-silver-30 p-8 text-center">
      <p class="text-body text-silver-70">No hay cartas en {{ title.toLowerCase() }}</p>
    </div>

    <!-- Cards table -->
    <div v-else class="border border-silver-30 overflow-hidden">
      <!-- Header -->
      <div class="hidden md:grid grid-cols-12 gap-2 bg-secondary border-b border-silver-30 p-3 text-tiny font-bold text-silver-70">
        <div class="col-span-1">QTY</div>
        <div class="col-span-5">CARTA</div>
        <div class="col-span-2">EDICIÓN</div>
        <div class="col-span-1">CONDICIÓN</div>
        <div class="col-span-2">PRECIO</div>
        <div class="col-span-1">ACCIONES</div>
      </div>

      <!-- Cards -->
      <div class="divide-y divide-silver-20">
        <div
            v-for="card in cards"
            :key="card.id"
            class="p-3 md:p-4 hover:bg-secondary-40 transition-150"
        >
          <!-- Mobile layout -->
          <div class="md:hidden space-y-2">
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <p class="font-bold text-silver">{{ card.quantity }}x {{ card.name }}</p>
                <p class="text-tiny text-silver-70">{{ card.edition }}</p>
              </div>
              <p class="text-neon font-bold">${{ (card.price * card.quantity).toFixed(2) }}</p>
            </div>
            <div class="flex gap-2 text-tiny">
              <span class="px-2 py-1 bg-secondary border border-silver-30 text-silver-70">
                {{ card.condition }}
              </span>
              <span v-if="card.foil" class="px-2 py-1 bg-neon-10 border border-neon text-neon">
                FOIL
              </span>
              <button
                  @click="emit('edit', card.id)"
                  class="px-2 py-1 border border-silver-30 text-silver hover:text-neon transition-150"
              >
                EDITAR
              </button>
              <button
                  @click="emit('remove', card.id)"
                  class="px-2 py-1 border border-silver-30 text-silver-70 hover:text-ruby transition-150"
              >
                BORRAR
              </button>
            </div>
          </div>

          <!-- Desktop layout -->
          <div class="hidden md:grid grid-cols-12 gap-2 items-center">
            <div class="col-span-1 font-bold text-neon">{{ card.quantity }}</div>
            <div class="col-span-5">
              <p class="font-bold text-silver truncate">{{ card.name }}</p>
              <p class="text-tiny text-silver-70">{{ card.scryfallId }}</p>
            </div>
            <div class="col-span-2 text-small text-silver-70">{{ card.edition }}</div>
            <div class="col-span-1">
              <span class="text-tiny px-2 py-1 bg-secondary border border-silver-30 text-silver-70">
                {{ card.condition }}
              </span>
            </div>
            <div class="col-span-2">
              <p class="text-small text-silver">{{ card.price.toFixed(2) }}</p>
              <p class="text-tiny text-neon font-bold">${{ (card.price * card.quantity).toFixed(2) }}</p>
            </div>
            <div class="col-span-1 flex gap-1">
              <button
                  @click="emit('edit', card.id)"
                  class="px-2 py-1 text-tiny border border-silver-30 text-silver hover:border-neon hover:text-neon transition-150"
              >
                ✏️
              </button>
              <button
                  @click="emit('remove', card.id)"
                  class="px-2 py-1 text-tiny border border-silver-30 text-silver-70 hover:border-ruby hover:text-ruby transition-150"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>