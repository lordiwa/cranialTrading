<script setup lang="ts">
import CollectionGridCard from './CollectionGridCard.vue'
import type { Card } from '../../types/card'

withDefaults(defineProps<{
  cards: Card[]
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
</script>

<template>
  <div :class="compact
    ? 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2'
    : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4'"
  >
    <CollectionGridCard
        v-for="card in cards"
        :key="card.id"
        :card="card"
        :compact="compact"
        @card-click="emit('cardClick', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
        @manage-decks="emit('manageDecks', $event)"
    />
  </div>
</template>
