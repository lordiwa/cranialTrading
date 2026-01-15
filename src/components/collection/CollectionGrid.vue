<script setup lang="ts">
import CollectionGridCard from './CollectionGridCard.vue'
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
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
    <CollectionGridCard
        v-for="card in cards"
        :key="card.id"
        :card="card"
        @card-click="emit('cardClick', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
        @manage-decks="emit('manageDecks', $event)"
    />
  </div>
</template>
