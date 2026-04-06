<script setup lang="ts">
import { computed, toRef } from 'vue'
import CollectionGridCard from './CollectionGridCard.vue'
import type { Card } from '../../types/card'
import { useVirtualGrid } from '../../composables/useVirtualGrid'

const props = withDefaults(defineProps<{
  cards: Card[]
  compact?: boolean
  readonly?: boolean
  showInterest?: boolean
  interestedCards?: Set<string>
  showCart?: boolean
  cartItemIds?: Set<string>
  deletingCardIds?: Set<string>
  selectionMode?: boolean
  selectedCardIds?: Set<string>
}>(), {
  compact: false,
  readonly: false,
  showInterest: false,
  interestedCards: () => new Set<string>(),
  showCart: false,
  cartItemIds: () => new Set<string>(),
  deletingCardIds: () => new Set<string>(),
  selectionMode: false,
  selectedCardIds: () => new Set<string>(),
})

const emit = defineEmits<{
  cardClick: [card: Card]
  delete: [card: Card]
  interest: [card: Card]
  addToCart: [card: Card]
  toggleSelect: [cardId: string]
}>()

const cardsRef = computed(() => props.cards)

const { containerRef, virtualRows, totalSize, virtualizer } = useVirtualGrid({
  items: cardsRef,
  compact: toRef(props, 'compact'),
})

const gridClass = computed(() =>
  props.compact
    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3'
    : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4',
)
</script>

<template>
  <div ref="containerRef">
    <div :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
      <div
          v-for="vRow in virtualRows"
          :key="vRow.index"
          :data-index="vRow.index"
          :ref="(el: any) => { if (el) virtualizer.measureElement(el as HTMLElement) }"
          :class="compact ? 'pb-3' : 'pb-4'"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${vRow.start}px)`,
          }"
      >
        <div :class="gridClass">
          <CollectionGridCard
              v-for="card in vRow.items"
              :key="card.id"
              :card="card"
              :compact="props.compact"
              :readonly="props.readonly"
              :show-interest="props.showInterest"
              :is-interested="props.interestedCards?.has(card.scryfallId || card.id) || false"
              :show-cart="props.showCart"
              :is-in-cart="props.cartItemIds?.has(card.scryfallId || card.id) || false"
              :is-being-deleted="props.deletingCardIds?.has(card.id) || false"
              :selection-mode="props.selectionMode"
              :is-selected="props.selectedCardIds?.has(card.id) || false"
              @card-click="selectionMode ? emit('toggleSelect', $event.id) : emit('cardClick', $event)"
              @delete="emit('delete', $event)"
              @interest="emit('interest', $event)"
              @add-to-cart="emit('addToCart', $event)"
              @toggle-select="emit('toggleSelect', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
