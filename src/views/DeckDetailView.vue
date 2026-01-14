<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDecksStore } from '../stores/decks'
import { useCollectionStore } from '../stores/collection'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseBadge from '../components/ui/BaseBadge.vue'
import DeckCardsList from '../components/decks/DeckCardsList.vue'
import DeckCompletionCheck from '../components/decks/DeckCompletionCheck.vue'

const router = useRouter()
const route = useRoute()
const decksStore = useDecksStore()
const collectionStore = useCollectionStore()

const activeTab = ref<'mainboard' | 'sideboard' | 'stats'>('mainboard')
const loading = ref(false)

const deckId = route.params.deckId as string

const deck = computed(() => decksStore.currentDeck)

// Hydrated cards for display
const allCards = computed(() => {
  if (!deck.value) return []
  return decksStore.hydrateDeckCards(deck.value, collectionStore.cards)
})

const mainboardCards = computed(() =>
    allCards.value.filter(c => !c.isInSideboard)
)

const sideboardCards = computed(() =>
    allCards.value.filter(c => c.isInSideboard)
)

// Type guard and helper to get quantity from either type
const getCardQuantity = (card: typeof allCards.value[number]): number => {
  if (card.isWishlist === true) {
    return card.requestedQuantity
  }
  return (card as any).allocatedQuantity
}

// Card counts
const mainboardCount = computed(() =>
    mainboardCards.value.reduce((sum, c) => sum + getCardQuantity(c), 0)
)

const sideboardCount = computed(() =>
    sideboardCards.value.reduce((sum, c) => sum + getCardQuantity(c), 0)
)

const formatLabel = computed(() => {
  const labels: Record<string, string> = {
    vintage: 'VINTAGE',
    modern: 'MODERN',
    commander: 'COMMANDER',
    standard: 'STANDARD',
    custom: 'CUSTOM',
  }
  return labels[deck.value?.format || 'custom'] || 'CUSTOM'
})

const handleEdit = () => {
  router.push(`/decks/${deckId}/edit`)
}

const handleBack = () => {
  router.push('/decks')
}

onMounted(async () => {
  loading.value = true
  await collectionStore.loadCollection()
  await decksStore.loadDeck(deckId)
  loading.value = false
})
</script>

<template>
  <AppContainer>
    <div v-if="loading" class="flex justify-center py-16">
      <BaseLoader size="large" />
    </div>

    <div v-else-if="deck" class="space-y-8">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-silver-20">
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-2">
            <h1 class="text-h2 md:text-h1 font-bold text-silver">{{ deck.name }}</h1>
            <BaseBadge variant="busco">{{ formatLabel }}</BaseBadge>
          </div>
          <p class="text-small text-silver-70">{{ deck.description }}</p>
          <p class="text-tiny text-silver-50 mt-2">
            Actualizado: {{ deck.updatedAt.toLocaleDateString() }}
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <BaseButton size="small" @click="handleEdit">EDITAR</BaseButton>
          <BaseButton variant="secondary" size="small" @click="handleBack">← VOLVER</BaseButton>
        </div>
      </div>

      <!-- Stats bar -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-primary border border-silver-30 p-4">
          <p class="text-tiny text-silver-70">TOTAL</p>
          <p class="text-h3 font-bold text-neon">{{ deck.stats.totalCards }}</p>
        </div>
        <div class="bg-primary border border-silver-30 p-4">
          <p class="text-tiny text-silver-70">EN COLECCIÓN</p>
          <p class="text-h3 font-bold text-neon">{{ deck.stats.ownedCards }}</p>
        </div>
        <div class="bg-primary border border-silver-30 p-4">
          <p class="text-tiny text-silver-70">WISHLIST</p>
          <p class="text-h3 font-bold" :class="deck.stats.wishlistCards > 0 ? 'text-amber' : 'text-silver-50'">
            {{ deck.stats.wishlistCards }}
          </p>
        </div>
        <div class="bg-primary border border-silver-30 p-4">
          <p class="text-tiny text-silver-70">COSTO TOTAL</p>
          <p class="text-h3 font-bold text-neon">${{ deck.stats.totalPrice.toFixed(2) }}</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-sm md:gap-md border-b border-silver-20">
        <button
            @click="activeTab = 'mainboard'"
            :class="[
              'pb-md border-b-2 font-bold text-small md:text-body transition-fast',
              activeTab === 'mainboard'
                ? 'border-neon text-neon'
                : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          MAINBOARD ({{ mainboardCount }})
        </button>
        <button
            @click="activeTab = 'sideboard'"
            :class="[
              'pb-md border-b-2 font-bold text-small md:text-body transition-fast',
              activeTab === 'sideboard'
                ? 'border-neon text-neon'
                : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          SIDEBOARD ({{ sideboardCount }})
        </button>
        <button
            @click="activeTab = 'stats'"
            :class="[
              'pb-md border-b-2 font-bold text-small md:text-body transition-fast',
              activeTab === 'stats'
                ? 'border-neon text-neon'
                : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          ESTADÍSTICAS
        </button>
      </div>

      <!-- Content -->
      <div>
        <!-- Mainboard -->
        <DeckCardsList
            v-if="activeTab === 'mainboard'"
            :cards="mainboardCards"
            :deck-id="deckId"
            title="MAINBOARD"
        />

        <!-- Sideboard -->
        <DeckCardsList
            v-else-if="activeTab === 'sideboard'"
            :cards="sideboardCards"
            :deck-id="deckId"
            title="SIDEBOARD"
        />

        <!-- Stats -->
        <DeckCompletionCheck
            v-else-if="activeTab === 'stats'"
            :deck="deck"
            :collection="collectionStore.cards"
        />
      </div>
    </div>

    <div v-else class="text-center py-16">
      <p class="text-body text-silver-70 mb-4">No se encontró el mazo</p>
      <BaseButton @click="handleBack">VOLVER A MAZOS</BaseButton>
    </div>
  </AppContainer>
</template>
