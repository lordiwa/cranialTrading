<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { searchCards } from '../services/scryfall'
import AppContainer from '../components/layout/AppContainer.vue'
import CardGridSearch from '../components/common/CardGridSearch.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import EditCardModal from '../components/collection/EditCardModal.vue'
import CardStatusModal from '../components/collection/CardStatusModal.vue'
import CollectionGrid from '../components/collection/CollectionGrid.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseBadge from '../components/ui/BaseBadge.vue'
import { Card, CardStatus } from '../types/card'

const collectionStore = useCollectionStore()
const toastStore = useToastStore()

// ========== STATE ==========

// Vista: 'grid' o 'search'
const viewMode = ref<'grid' | 'search'>('grid')

// Modals
const showAddCardModal = ref(false)
const showEditModal = ref(false)
const showStatusModal = ref(false)

// Selección de cartas
const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<any>(null)
const editingCard = ref<Card | null>(null)

// ✅ Filtros de COLECCIÓN (no Scryfall)
const statusFilter = ref<'all' | CardStatus>('all')
const deckFilter = ref<string>('all')
const filterQuery = ref('')

// ✅ Estado para Scryfall search results
const scryfallResults = ref<any[]>([])
const isSearchingScryfall = ref(false)
const scryfallError = ref<string | null>(null)

// Referencia a CardGridSearch para manipulación directa
const cardGridSearchRef = ref()

// ========== COMPUTED ==========

// Cartas según status
const collectionCards = computed(() => collectionStore.cards)

// Contadores por status
const collectionCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'collection').length
)
const saleCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'sale').length
)
const tradeCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'trade').length
)
const wishlistCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'wishlist').length
)

// Decks únicos
const uniqueDecks = computed(() => {
  const decks = new Set<string>()
  collectionCards.value.forEach(card => {
    if (card.deckId) decks.add(card.deckId)
  })
  return Array.from(decks)
})

// Filtrados según criterios
const filteredCards = computed(() => {
  let cards = collectionCards.value

  // Filtro por status
  if (statusFilter.value !== 'all') {
    cards = cards.filter(c => c.status === statusFilter.value)
  }

  // Filtro por deck
  if (deckFilter.value !== 'all') {
    cards = cards.filter(c => c.deckId === deckFilter.value)
  }

  // Filtro por búsqueda (nombre)
  if (filterQuery.value.trim()) {
    const q = filterQuery.value.toLowerCase()
    cards = cards.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.edition.toLowerCase().includes(q)
    )
  }

  return cards
})

// Precio total del deck actual
const deckTotalCost = computed(() => {
  if (deckFilter.value === 'all') return 0
  return filteredCards.value.reduce((sum, card) => sum + (card.price || 0), 0)
})

// ========== METHODS ==========

// ✅ Manejador para evento 'search' de CardGridSearch
const handleSearchScryfall = async (query: string) => {
  isSearchingScryfall.value = true
  scryfallError.value = null

  try {
    const results = await searchCards(query)
    scryfallResults.value = results

    // ✅ Usar método expuesto de CardGridSearch para actualizar resultados
    cardGridSearchRef.value?.setResults(results)
  } catch (err) {
    scryfallError.value = err instanceof Error ? err.message : 'Error en la búsqueda'
    cardGridSearchRef.value?.setError(scryfallError.value)
    toastStore.showToast('Error buscando carta', 'error')
  } finally {
    isSearchingScryfall.value = false
  }
}

// ✅ Cuando selecciona una carta en CardGridSearch
const handleCardSelected = (card: any) => {
  selectedScryfallCard.value = card
  showAddCardModal.value = true
}

// Cuando hace click en una carta de la colección
const handleCardClick = (card: Card) => {
  selectedCard.value = card
  showStatusModal.value = true
}

// Editar existente
const handleEdit = (card: Card) => {
  editingCard.value = card
  showEditModal.value = true
}

// Eliminar existente
const handleDelete = async (card: Card) => {
  if (!confirm(`¿Eliminar "${card.name}" de tu colección?`)) return

  try {
    await collectionStore.deleteCard(card.id)
    toastStore.showToast(`✓ "${card.name}" eliminada`, 'success')
  } catch (err) {
    toastStore.showToast('Error eliminando carta', 'error')
  }
}

// Guardar cambios en edición
const handleSaveEdit = async (updatedCard: Card) => {
  try {
    await collectionStore.updateCard(updatedCard.id, updatedCard)
    toastStore.showToast(`✓ "${updatedCard.name}" actualizada`, 'success')
    showEditModal.value = false
    editingCard.value = null
  } catch (err) {
    toastStore.showToast('Error actualizando carta', 'error')
  }
}

// Actualizar status desde CardStatusModal
const handleUpdateStatus = async (cardId: string, newStatus: CardStatus) => {
  try {
    await collectionStore.updateCard(cardId, { status: newStatus } as any)
    toastStore.showToast('✓ Status actualizado', 'success')
    showStatusModal.value = false
    selectedCard.value = null
  } catch (err) {
    toastStore.showToast('Error actualizando status', 'error')
  }
}

// Eliminar deck
const handleDeleteDeck = async () => {
  if (deckFilter.value === 'all') return

  const cardsInDeck = filteredCards.value
  if (!confirm(`¿Eliminar ${cardsInDeck.length} cartas de este deck?`)) return

  try {
    for (const card of cardsInDeck) {
      await collectionStore.deleteCard(card.id)
    }
    toastStore.showToast('✓ Deck eliminado', 'success')
    deckFilter.value = 'all'
  } catch (err) {
    toastStore.showToast('Error eliminando deck', 'error')
  }
}

// ========== LIFECYCLE ==========

onMounted(async () => {
  try {
    await collectionStore.loadCollection()
  } catch (err) {
    toastStore.showToast('Error cargando colección', 'error')
  }
})
</script>

<template>
  <AppContainer>
    <!-- ========== HEADER ========== -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-h1 font-bold text-silver">MI COLECCIÓN</h1>
        <p class="text-small text-silver-70">{{ collectionCards.length }} cartas total</p>
      </div>

      <!-- Mode Toggle Button -->
      <div class="flex gap-2">
        <button
            @click="viewMode = 'grid'"
            :class="[
              'px-4 py-2 text-small font-bold transition-150',
              viewMode === 'grid'
                ? 'border-2 border-neon text-neon bg-neon-10'
                : 'border-2 border-silver-50 text-silver-70 hover:border-silver'
            ]"
        >
          COLECCIÓN
        </button>
        <button
            @click="viewMode = 'search'"
            :class="[
              'px-4 py-2 text-small font-bold transition-150',
              viewMode === 'search'
                ? 'border-2 border-neon text-neon bg-neon-10'
                : 'border-2 border-silver-50 text-silver-70 hover:border-silver'
            ]"
        >
          + AGREGAR
        </button>
      </div>
    </div>

    <!-- ========== SEARCH MODE ========== -->
    <template v-if="viewMode === 'search'">
      <CardGridSearch
          ref="cardGridSearchRef"
          title="BUSCAR CARTA PARA AGREGAR"
          subtitle="Escribe el nombre de la carta que deseas agregar a tu colección"
          placeholder="Ej: Black Lotus, Ragavan, Counterspell..."
          :max-results="12"
          :show-price="true"
          @search="handleSearchScryfall"
          @cardSelected="handleCardSelected"
      >
        <template #footer="{ results }">
          <BaseButton
              class="w-full"
              variant="secondary"
              @click="viewMode = 'grid'"
          >
            VOLVER A COLECCIÓN
          </BaseButton>
        </template>
      </CardGridSearch>
    </template>

    <!-- ========== GRID MODE ========== -->
    <template v-else>
      <!-- Status Tabs -->
      <div class="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
            v-for="(count, status) in {
              'all': collectionCards.length,
              'collection': collectionCount,
              'sale': saleCount,
              'trade': tradeCount,
              'wishlist': wishlistCount
            }"
            :key="status"
            @click="statusFilter = status as any"
            :class="[
              'px-4 py-2 text-small font-bold whitespace-nowrap transition-150',
              statusFilter === status
                ? 'border-2 border-neon text-neon'
                : 'border-2 border-silver-30 text-silver-70 hover:border-silver-50'
            ]"
        >
          {{ status === 'all' ? 'TODAS' : status.toUpperCase() }}
          <span class="ml-1 text-neon">{{ count }}</span>
        </button>
      </div>

      <!-- Filters Row -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <!-- Search by name -->
        <BaseInput
            v-model="filterQuery"
            placeholder="Buscar por nombre..."
            type="text"
        />

        <!-- Deck filter -->
        <BaseSelect
            v-model="deckFilter"
            :options="[
              { value: 'all', label: 'Todos los decks' },
              ...uniqueDecks.map(deck => ({ value: deck, label: deck }))
            ]"
        />

        <!-- Delete deck button (if applicable) -->
        <BaseButton
            v-if="deckFilter !== 'all' && filteredCards.length > 0"
            variant="secondary"
            @click="handleDeleteDeck"
        >
          🗑️ ELIMINAR DECK
        </BaseButton>
      </div>

      <!-- Stats Panel -->
      <div v-if="deckFilter !== 'all'" class="bg-secondary border border-silver-30 p-4 mb-6 rounded">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-tiny text-silver-70">Cartas en deck</p>
            <p class="text-h2 font-bold text-neon">{{ filteredCards.length }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70">Costo total estimado</p>
            <p class="text-h2 font-bold text-neon">${{ deckTotalCost.toFixed(2) }}</p>
          </div>
        </div>
      </div>

      <!-- Collection Grid -->
      <div v-if="filteredCards.length > 0">
        <CollectionGrid
            :cards="filteredCards"
            @card-click="handleCardClick"
            @edit="handleEdit"
            @delete="handleDelete"
        />
      </div>

      <!-- Empty State -->
      <div v-else class="flex justify-center items-center h-64">
        <div class="text-center">
          <p class="text-small text-silver-70">Sin cartas</p>
          <p class="text-tiny text-silver-70 mt-1">Agrega cartas desde la pestaña "+ AGREGAR"</p>
        </div>
      </div>
    </template>

    <!-- ========== MODALS ========== -->

    <!-- Add Card Modal -->
    <AddCardModal
        :show="showAddCardModal"
        :scryfall-card="selectedScryfallCard"
        @close="showAddCardModal = false"
        @added="
          showAddCardModal = false;
          cardGridSearchRef?.resetSearch();
          viewMode = 'grid';
        "
    />

    <!-- Edit Card Modal -->
    <EditCardModal
        :show="showEditModal"
        :card="editingCard"
        @close="showEditModal = false"
        @save="handleSaveEdit"
    />

    <!-- Card Status Modal -->
    <CardStatusModal
        :show="showStatusModal"
        :card="selectedCard"
        @close="showStatusModal = false"
        @updateStatus="handleUpdateStatus"
    />
  </AppContainer>
</template>

<style scoped>
/* Smooth transitions */
button {
  transition: all 150ms ease-out;
}

/* Scrollbar styling for filters */
::-webkit-scrollbar {
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #666666;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #888888;
}
</style>