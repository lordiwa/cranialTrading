<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../composables/useI18n'
import CollectionGridCard from './CollectionGridCard.vue'
import type { Card } from '../../types/card'

const props = withDefaults(defineProps<{
  cards: Card[]
  compact?: boolean
  readonly?: boolean
  showInterest?: boolean
  interestedCards?: Set<string>
  deletingCardIds?: Set<string>
  selectionMode?: boolean
  selectedCardIds?: Set<string>
}>(), {
  compact: false,
  readonly: false,
  showInterest: false,
  selectionMode: false,
})

const emit = defineEmits<{
  cardClick: [card: Card]
  delete: [card: Card]
  interest: [card: Card]
  toggleSelect: [cardId: string]
}>()

const { t } = useI18n()

const PAGE_SIZE = 50
const displayCount = ref(PAGE_SIZE)

// Reset to first page when cards list changes (filter/sort)
watch(() => props.cards, () => {
  displayCount.value = PAGE_SIZE
})

const visibleCards = computed(() => props.cards.slice(0, displayCount.value))
const remaining = computed(() => Math.max(0, props.cards.length - displayCount.value))

const loadMore = () => {
  displayCount.value += PAGE_SIZE
}
</script>

<template>
  <div>
    <div :class="compact
      ? 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2'
      : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4'"
    >
      <CollectionGridCard
          v-for="card in visibleCards"
          :key="card.id"
          :card="card"
          :compact="props.compact"
          :readonly="props.readonly"
          :show-interest="props.showInterest"
          :is-interested="props.interestedCards?.has(card.scryfallId || card.id) || false"
          :is-being-deleted="props.deletingCardIds?.has(card.id) || false"
          :selection-mode="props.selectionMode"
          :is-selected="props.selectedCardIds?.has(card.id) || false"
          @card-click="selectionMode ? emit('toggleSelect', $event.id) : emit('cardClick', $event)"
          @delete="emit('delete', $event)"
          @interest="emit('interest', $event)"
          @toggle-select="emit('toggleSelect', $event)"
      />
    </div>

    <!-- Load More button -->
    <div v-if="remaining > 0" class="flex justify-center mt-6">
      <button
          @click="loadMore"
          class="px-6 py-2 bg-primary border border-neon text-neon text-small font-bold hover:bg-neon/10 transition-colors rounded"
      >
        {{ t('common.actions.loadMore') }} ({{ remaining }})
      </button>
    </div>
  </div>
</template>
