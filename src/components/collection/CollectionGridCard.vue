<script setup lang="ts">
import CollectionGridCardCompact from './CollectionGridCardCompact.vue'
import CollectionGridCardFull from './CollectionGridCardFull.vue'
import type { Card } from '../../types/card'

const props = withDefaults(defineProps<{
  card: Card
  compact?: boolean
  readonly?: boolean
  showInterest?: boolean
  isInterested?: boolean
  showCart?: boolean
  isInCart?: boolean
  isBeingDeleted?: boolean
  selectionMode?: boolean
  isSelected?: boolean
}>(), {
  compact: false,
  readonly: false,
  showInterest: false,
  isInterested: false,
  showCart: false,
  isInCart: false,
  isBeingDeleted: false,
  selectionMode: false,
  isSelected: false,
})

const emit = defineEmits<{
  cardClick: [card: Card]
  delete: [card: Card]
  interest: [card: Card]
  addToCart: [card: Card]
  toggleSelect: [cardId: string]
}>()
</script>

<template>
  <CollectionGridCardCompact
    v-if="compact"
    v-bind="props"
    @card-click="emit('cardClick', $event)"
    @delete="emit('delete', $event)"
    @interest="emit('interest', $event)"
    @add-to-cart="emit('addToCart', $event)"
    @toggle-select="emit('toggleSelect', $event)"
  />
  <CollectionGridCardFull
    v-else
    v-bind="props"
    @card-click="emit('cardClick', $event)"
    @delete="emit('delete', $event)"
    @interest="emit('interest', $event)"
    @add-to-cart="emit('addToCart', $event)"
    @toggle-select="emit('toggleSelect', $event)"
  />
</template>
