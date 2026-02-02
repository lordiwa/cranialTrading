<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../composables/useI18n'
import type { Deck } from '../../types/deck'
import BaseBadge from '../ui/BaseBadge.vue'

const { t } = useI18n()

const props = defineProps<{
  deck: Deck
}>()

const emit = defineEmits<{
  edit: [deckId: string]
  delete: [deckId: string]
}>()

const formatLabel = computed(() => {
  const labels: Record<string, string> = {
    vintage: 'VINTAGE',
    modern: 'MODERN',
    commander: 'COMMANDER',
    standard: 'STANDARD',
    custom: 'CUSTOM',
  }
  return labels[props.deck.format] || 'CUSTOM'
})

const completionPercent = computed(() => {
  return Math.round(props.deck.stats.completionPercentage * 100)
})
</script>

<template>
  <div class="bg-primary border border-silver-30 hover:border-neon-40 transition-300 overflow-hidden rounded-md">
    <!-- Thumbnail -->
    <div
        v-if="deck.thumbnail"
        class="relative w-full h-40 bg-secondary overflow-hidden group cursor-pointer"
        @click="emit('edit', deck.id)"
    >
      <img :src="deck.thumbnail" :alt="deck.name" class="w-full h-full object-cover group-hover:scale-105 transition-300" />
      <div class="absolute inset-0 bg-black-80 opacity-0 group-hover:opacity-100 transition-300 flex items-center justify-center">
        <span class="px-4 py-2 bg-neon text-primary font-bold text-small">
          {{ t('decks.actions.editDeck') }}
        </span>
      </div>
    </div>

    <!-- Placeholder thumbnail -->
    <div v-else class="w-full h-40 bg-secondary border-b border-silver-30 flex items-center justify-center">
      <div class="text-center">
        <p class="text-h3 font-bold text-silver-50">{{ deck.stats.totalCards }}</p>
        <p class="text-tiny text-silver-70">{{ t('decks.card.stats.cards').toLowerCase() }}</p>
      </div>
    </div>

    <!-- Content -->
    <div class="p-4 md:p-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-2 mb-3">
        <h3 class="text-h3 font-bold text-silver truncate flex-1">{{ deck.name }}</h3>
        <BaseBadge variant="cambio" class="flex-shrink-0">{{ formatLabel }}</BaseBadge>
      </div>

      <!-- Description -->
      <p class="text-small text-silver-70 line-clamp-2 mb-4">
        {{ deck.description || t('decks.card.noDescription') }}
      </p>

      <!-- Stats -->
      <div class="grid grid-cols-3 gap-2 mb-4 pb-4 border-b border-silver-20">
        <div class="text-center">
          <p class="text-tiny text-silver-70">{{ t('decks.card.stats.cards') }}</p>
          <p class="text-h3 font-bold text-neon">{{ deck.stats.totalCards }}</p>
        </div>
        <div class="text-center">
          <p class="text-tiny text-silver-70">{{ t('decks.card.stats.cost') }}</p>
          <p class="text-h3 font-bold text-neon">${{ deck.stats.totalPrice.toFixed(0) }}</p>
        </div>
        <div class="text-center">
          <p class="text-tiny text-silver-70">{{ t('decks.card.stats.collection') }}</p>
          <p class="text-h3 font-bold" :class="completionPercent >= 80 ? 'text-neon' : 'text-silver-70'">
            {{ completionPercent }}%
          </p>
        </div>
      </div>

      <!-- Completion bar -->
      <div class="w-full h-1.5 bg-secondary border border-silver-30 mb-4 overflow-hidden rounded">
        <div
            class="h-full bg-neon transition-300"
            :style="{ width: `${deck.stats.completionPercentage * 100}%` }"
        />
      </div>

      <!-- Date -->
      <p class="text-tiny text-silver-50 mb-4">
        {{ t('decks.card.updated', { date: deck.updatedAt.toLocaleDateString() }) }}
      </p>

      <!-- Buttons -->
      <div class="flex gap-2">
        <button
            @click="emit('edit', deck.id)"
            class="flex-1 px-3 py-2 border-2 border-neon text-neon font-bold text-tiny hover:bg-neon-10 transition-150 rounded"
        >
          {{ t('decks.card.edit') }}
        </button>
        <button
            @click="emit('delete', deck.id)"
            class="flex-1 px-3 py-2 border border-secondary text-silver-70 font-bold text-tiny hover:border-ruby hover:text-ruby transition-150 rounded"
        >
          {{ t('decks.card.delete') }}
        </button>
      </div>
    </div>
  </div>
</template>