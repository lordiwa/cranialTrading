<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDecksStore } from '../stores/decks'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import DeckCard from '../components/decks/DeckCard.vue'
import CreateDeckModal from '../components/decks/CreateDeckModal.vue'

const router = useRouter()
const decksStore = useDecksStore()

const showCreateModal = ref(false)
const searchQuery = ref('')
const filterFormat = ref<'all' | string>('all')

// Decks filtrados
const filteredDecks = computed(() => {
  let result = decksStore.decks

  // Filtrar por formato
  if (filterFormat.value !== 'all') {
    result = result.filter(d => d.format === filterFormat.value)
  }

  // Filtrar por búsqueda
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.description.toLowerCase().includes(query)
    )
  }

  return result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
})

// Formatos únicos
const formats = computed(() => {
  const set = new Set(decksStore.decks.map(d => d.format))
  return Array.from(set).sort()
})

const handleCreateDeck = async (deckData: any) => {
  const deckId = await decksStore.createDeck(deckData)
  if (deckId) {
    showCreateModal.value = false
    // Redirigir al editor
    await router.push(`/decks/${deckId}/edit`)
  }
}

const handleViewDeck = (deckId: string) => {
  router.push(`/decks/${deckId}`)
}

const handleEditDeck = (deckId: string) => {
  router.push(`/decks/${deckId}/edit`)
}

const handleDeleteDeck = async (deckId: string) => {
  if (confirm('¿Eliminar este deck? Esta acción no se puede deshacer.')) {
    await decksStore.deleteDeck(deckId)
  }
}

onMounted(async () => {
  await decksStore.loadDecks()
})
</script>

<template>
  <AppContainer>
    <div>
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver">MIS MAZOS</h1>
          <p class="text-tiny md:text-small text-silver-70 mt-1">
            {{ decksStore.totalDecks }} mazos creados
          </p>
        </div>
        <BaseButton
            size="small"
            @click="showCreateModal = true"
            class="w-full md:w-auto"
        >
          + NUEVO MAZO
        </BaseButton>
      </div>

      <!-- Filtros -->
      <div class="bg-primary border border-silver-30 p-4 md:p-6 mb-6 space-y-4">
        <!-- Búsqueda -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Buscar</label>
          <BaseInput
              v-model="searchQuery"
              placeholder="Buscar por nombre o descripción..."
              type="text"
          />
        </div>

        <!-- Formato -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Formato</label>
          <div class="flex gap-2 flex-wrap">
            <button
                @click="filterFormat = 'all'"
                :class="[
                  'px-3 py-2 text-tiny font-bold transition-fast',
                  filterFormat === 'all'
                    ? 'bg-neon text-primary border border-neon'
                    : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                ]"
            >
              TODOS
            </button>
            <button
                v-for="format in formats"
                :key="format"
                @click="filterFormat = format"
                :class="[
                  'px-3 py-2 text-tiny font-bold transition-fast uppercase',
                  filterFormat === format
                    ? 'bg-neon text-primary border border-neon'
                    : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                ]"
            >
              {{ format }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading state -->
      <BaseLoader v-if="decksStore.loading" size="large" />

      <!-- Empty state -->
      <div v-else-if="filteredDecks.length === 0" class="border border-silver-30 p-8 md:p-12 text-center">
        <p class="text-body text-silver-70 mb-4">🗂️ No hay mazos</p>
        <p class="text-small text-silver-50 mb-6">
          {{ decksStore.totalDecks === 0
            ? 'Crea tu primer mazo para comenzar'
            : 'No se encontraron mazos con estos filtros'
          }}
        </p>
        <BaseButton v-if="decksStore.totalDecks === 0" @click="showCreateModal = true" size="small">
          CREAR PRIMER MAZO
        </BaseButton>
      </div>

      <!-- Grid de mazos -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <DeckCard
            v-for="deck in filteredDecks"
            :key="deck.id"
            :deck="deck"
            @view="handleViewDeck"
            @edit="handleEditDeck"
            @delete="handleDeleteDeck"
        />
      </div>

      <!-- Modal crear mazo -->
      <CreateDeckModal
          :show="showCreateModal"
          @close="showCreateModal = false"
          @create="handleCreateDeck"
      />
    </div>
  </AppContainer>
</template>