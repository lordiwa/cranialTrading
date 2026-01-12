<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDecksStore } from '../stores/decks'
import { useToastStore } from '../stores/toast'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseBadge from '../components/ui/BaseBadge.vue'
import DeckCardsList from '../components/decks/DeckCardsList.vue'
import AddCardToDeckModal from '../components/decks/AddCardToDeckModal.vue'

const router = useRouter()
const route = useRoute()
const decksStore = useDecksStore()
const toastStore = useToastStore()

const loading = ref(false)
const showAddCardModal = ref(false)
const activeTab = ref<'mainboard' | 'sideboard'>('mainboard')

const deckId = route.params.deckId as string
const isNewDeck = !deckId || deckId === 'new'

const deck = computed(() => decksStore.currentDeck)

const handleAddCard = async (cardData: any) => {
  if (activeTab.value === 'mainboard') {
    await decksStore.addCardToMainboard(deckId, cardData)
  } else {
    await decksStore.addCardToSideboard(deckId, cardData)
  }
  showAddCardModal.value = false
  toastStore.show(`Carta agregada al ${activeTab.value}`, 'success')
}

const handleRemoveCard = async (cardId: string) => {
  if (confirm('¿Eliminar esta carta del deck?')) {
    await decksStore.removeCard(deckId, cardId, activeTab.value === 'sideboard')
    toastStore.show('Carta eliminada', 'success')
  }
}

const handleSave = async () => {
  // El deck se guarda automáticamente con cada cambio
  // Pero podemos añadir validaciones
  if (!deck.value?.name.trim()) {
    toastStore.show('El nombre del deck es requerido', 'error')
    return
  }

  toastStore.show('Deck actualizado', 'success')
  await router.push(`/decks/${deckId}`)
}

const handleBack = () => {
  router.push('/decks')
}

onMounted(async () => {
  if (!isNewDeck) {
    loading.value = true
    await decksStore.loadDeck(deckId)
    loading.value = false
  }
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
          <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">EDITOR: {{ deck.name }}</h1>
          <p class="text-small text-silver-70">{{ deck.description }}</p>
        </div>

        <div class="flex flex-col gap-2">
          <BaseButton size="small" @click="handleSave">GUARDAR</BaseButton>
          <BaseButton variant="secondary" size="small" @click="handleBack">← VOLVER</BaseButton>
        </div>
      </div>

      <!-- Formato y colores -->
      <div class="bg-secondary border border-silver-30 p-4 md:p-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p class="text-tiny text-silver-70 mb-2">FORMATO</p>
            <p class="text-h3 font-bold text-silver uppercase">{{ deck.format }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70 mb-2">COLORES</p>
            <div class="flex gap-2">
              <span v-if="deck.colors.length === 0" class="text-small text-silver-70">Ninguno</span>
              <BaseBadge v-for="color in deck.colors" :key="color" variant="cambio">
                {{ color }}
              </BaseBadge>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-md border-b border-silver-20">
        <button
            @click="activeTab = 'mainboard'"
            :class="[
              'pb-md border-b-2 font-bold text-small md:text-body transition-fast',
              activeTab === 'mainboard'
                ? 'border-neon text-neon'
                : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          MAINBOARD ({{ deck.mainboard.length }})
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
          SIDEBOARD ({{ deck.sideboard.length }})
        </button>
      </div>

      <!-- Add card button -->
      <BaseButton
          size="small"
          @click="showAddCardModal = true"
          class="w-full md:w-auto"
      >
        + AGREGAR CARTA
      </BaseButton>

      <!-- Cards list -->
      <DeckCardsList
          :cards="activeTab === 'mainboard' ? deck.mainboard : deck.sideboard"
          :deck-id="deckId"
          :title="activeTab === 'mainboard' ? 'MAINBOARD' : 'SIDEBOARD'"
          @remove="handleRemoveCard"
      />

      <!-- Add card modal -->
      <AddCardToDeckModal
          :show="showAddCardModal"
          @close="showAddCardModal = false"
          @add="handleAddCard"
      />
    </div>

    <div v-else class="text-center py-16">
      <p class="text-body text-silver-70 mb-4">No se encontró el mazo</p>
      <BaseButton @click="handleBack">VOLVER A MAZOS</BaseButton>
    </div>
  </AppContainer>
</template>