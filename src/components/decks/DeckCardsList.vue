<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../composables/useI18n'
import type { DisplayDeckCard, HydratedWishlistCard } from '../../types/deck'
import BaseBadge from '../ui/BaseBadge.vue'

const props = defineProps<{
  cards: DisplayDeckCard[]
  deckId: string
  title: string
}>()

const emit = defineEmits<{
  edit: [card: DisplayDeckCard]
  remove: [card: DisplayDeckCard]
}>()

const { t } = useI18n()

// Type guard for wishlist cards
const isWishlistCard = (card: DisplayDeckCard): card is HydratedWishlistCard => {
  return card.isWishlist
}

// Helper to get quantity from either type
const getQuantity = (card: DisplayDeckCard): number => {
  if (isWishlistCard(card)) {
    return card.requestedQuantity
  }
  return (card).allocatedQuantity
}

// Helper to get card key for v-for
const getCardKey = (card: DisplayDeckCard, index: number): string => {
  if (isWishlistCard(card)) {
    return `wish-${card.scryfallId}-${index}`
  }
  return `own-${(card).cardId}`
}

const totalCards = computed(() => {
  return props.cards.reduce((sum, card) => sum + getQuantity(card), 0)
})

const ownedCards = computed(() => {
  return props.cards
      .filter(c => !c.isWishlist)
      .reduce((sum, c) => sum + getQuantity(c), 0)
})

const wishlistCards = computed(() => {
  return props.cards
      .filter(c => c.isWishlist)
      .reduce((sum, c) => sum + getQuantity(c), 0)
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="bg-secondary border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">{{ t('decks.cardsList.uniqueCards') }}</p>
        <p class="text-h3 font-bold text-neon">{{ cards.length }}</p>
      </div>
      <div class="bg-secondary border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">{{ t('decks.cardsList.totalCards') }}</p>
        <p class="text-h3 font-bold text-silver">{{ totalCards }}</p>
      </div>
      <div class="bg-secondary border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">{{ t('decks.cardsList.inCollection') }}</p>
        <p class="text-h3 font-bold text-neon">{{ ownedCards }}</p>
      </div>
      <div class="bg-secondary border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">{{ t('decks.cardsList.wishlist') }}</p>
        <p class="text-h3 font-bold" :class="wishlistCards > 0 ? 'text-amber' : 'text-silver-50'">
          {{ wishlistCards }}
        </p>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="cards.length === 0" class="border border-silver-30 p-8 text-center">
      <p class="text-body text-silver-70">{{ t('decks.cardsList.noCardsIn', { section: title.toLowerCase() }) }}</p>
    </div>

    <!-- Cards table -->
    <div v-else class="border border-silver-30 overflow-hidden">
      <!-- Header -->
      <div class="hidden md:grid grid-cols-12 gap-2 bg-secondary border-b border-silver-30 p-3 text-tiny font-bold text-silver-70">
        <div class="col-span-1">{{ t('decks.cardsList.headers.qty') }}</div>
        <div class="col-span-5">{{ t('decks.cardsList.headers.card') }}</div>
        <div class="col-span-2">{{ t('decks.cardsList.headers.edition') }}</div>
        <div class="col-span-1">{{ t('decks.cardsList.headers.status') }}</div>
        <div class="col-span-2">{{ t('decks.cardsList.headers.price') }}</div>
        <div class="col-span-1">{{ t('decks.cardsList.headers.actions') }}</div>
      </div>

      <!-- Cards -->
      <div class="divide-y divide-silver-20">
        <div
            v-for="(card, index) in cards"
            :key="getCardKey(card, index)"
            class="p-3 md:p-4 hover:bg-secondary-40 transition-150"
            :class="{ 'bg-amber-5 border-l-2 border-amber': card.isWishlist }"
        >
          <!-- Mobile layout -->
          <div class="md:hidden space-y-2">
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <p class="font-bold text-silver">{{ getQuantity(card) }}x {{ card.name }}</p>
                  <BaseBadge v-if="card.isWishlist" variant="deseado" class="text-tiny">
                    WISHLIST
                  </BaseBadge>
                </div>
                <p class="text-tiny text-silver-70">{{ card.edition }}</p>
              </div>
              <div class="text-right">
                <p class="text-tiny text-silver-50">${{ card.price.toFixed(2) }} {{ t('decks.cardsList.perUnit') }}</p>
                <p class="font-bold" :class="card.isWishlist ? 'text-amber' : 'text-neon'">${{ (card.price * getQuantity(card)).toFixed(2) }}</p>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 text-tiny">
              <span class="px-2 py-1 bg-secondary border border-silver-30 text-silver-70">
                {{ card.condition }}
              </span>
              <span v-if="card.foil" class="px-2 py-1 bg-neon-10 border border-neon text-neon">
                FOIL
              </span>
              <span v-if="!card.isWishlist" class="px-2 py-1 bg-secondary border border-silver-30 text-silver-50">
                {{ (card as any).availableInCollection }} {{ t('decks.cardsList.available') }}
              </span>
              <button
                  @click="emit('edit', card)"
                  class="px-2 py-1 border border-silver-30 text-silver hover:text-neon transition-150"
              >
                {{ t('decks.cardsList.edit') }}
              </button>
              <button
                  @click="emit('remove', card)"
                  class="px-2 py-1 border border-silver-30 text-silver-70 hover:text-ruby transition-150"
              >
                {{ t('decks.cardsList.remove') }}
              </button>
            </div>
          </div>

          <!-- Desktop layout -->
          <div class="hidden md:grid grid-cols-12 gap-2 items-center">
            <div class="col-span-1 font-bold" :class="card.isWishlist ? 'text-amber' : 'text-neon'">
              {{ getQuantity(card) }}
            </div>
            <div class="col-span-5">
              <div class="flex items-center gap-2">
                <p class="font-bold text-silver truncate">{{ card.name }}</p>
                <BaseBadge v-if="card.isWishlist" variant="deseado" class="text-tiny flex-shrink-0">
                  WISHLIST
                </BaseBadge>
                <BaseBadge v-if="card.foil" variant="cambio" class="text-tiny flex-shrink-0">
                  FOIL
                </BaseBadge>
              </div>
              <p v-if="!card.isWishlist" class="text-tiny text-silver-50">
                {{ t('decks.cardsList.inCollectionCount', { total: (card as any).totalInCollection, available: (card as any).availableInCollection }) }}
              </p>
            </div>
            <div class="col-span-2 text-small text-silver-70">{{ card.edition }}</div>
            <div class="col-span-1">
              <span class="text-tiny px-2 py-1 bg-secondary border border-silver-30 text-silver-70">
                {{ card.condition }}
              </span>
            </div>
            <div class="col-span-2">
              <p class="text-small text-silver">${{ card.price.toFixed(2) }} {{ t('decks.cardsList.perUnit') }}</p>
              <p class="text-tiny font-bold" :class="card.isWishlist ? 'text-amber' : 'text-neon'">
                ${{ (card.price * getQuantity(card)).toFixed(2) }}
              </p>
            </div>
            <div class="col-span-1 flex gap-1">
              <button
                  @click="emit('edit', card)"
                  class="px-2 py-1 text-tiny border border-silver-30 text-silver hover:border-neon hover:text-neon transition-150"
                  :title="t('decks.cardsList.editTitle')"
              >
                ✏️
              </button>
              <button
                  @click="emit('remove', card)"
                  class="px-2 py-1 text-tiny border border-silver-30 text-silver-70 hover:border-ruby hover:text-ruby transition-150"
                  :title="t('decks.cardsList.removeTitle')"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex gap-4 text-tiny text-silver-50">
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 bg-neon"></span>
        <span>{{ t('decks.cardsList.legend.inCollection') }}</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 bg-amber"></span>
        <span>{{ t('decks.cardsList.legend.wishlist') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bg-amber-5 {
  background-color: rgba(245, 158, 11, 0.05);
}
</style>
