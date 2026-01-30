<script setup lang="ts">
import CollectionGridCard from './CollectionGridCard.vue'
import type { Card } from '../../types/card'

const props = withDefaults(defineProps<{
  cards: Card[]
  compact?: boolean
  readonly?: boolean
  showInterest?: boolean
  interestedCards?: Set<string>
  deletingCardIds?: Set<string>
}>(), {
  compact: false,
  readonly: false,
  showInterest: false
})

const emit = defineEmits<{
  cardClick: [card: Card]
  delete: [card: Card]
  interest: [card: Card]
}>()
</script>

<template>
  <div :class="compact
    ? 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2'
    : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4'"
  >
    <CollectionGridCard
        v-for="card in props.cards"
        :key="card.id"
        :card="card"
        :compact="props.compact"
        :readonly="props.readonly"
        :show-interest="props.showInterest"
        :is-interested="props.interestedCards?.has(card.scryfallId || card.id) || false"
        :is-being-deleted="props.deletingCardIds?.has(card.id) || false"
        @card-click="emit('cardClick', $event)"
        @delete="emit('delete', $event)"
        @interest="emit('interest', $event)"
    />
  </div>
</template>
