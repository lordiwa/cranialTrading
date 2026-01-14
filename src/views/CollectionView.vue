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
import { useDecksStore } from '../stores/decks'
import { useSearchStore } from '../stores/search'
import { useCardAllocation } from '../composables/useCardAllocation'
import FilterPanel from '../components/search/FilterPanel.vue'

const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const searchStore = useSearchStore()
const toastStore = useToastStore()
const { getAllocationsForCard } = useCardAllocation()

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

// ✅ NUEVO: Función para traducir status a español
const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'all': 'TODAS',
    'collection': 'COLECCIÓN',
    'sale': 'VENTA',
    'trade': 'CAMBIO',
    'wishlist': 'DESEADO',
  }
  return labels[status] || status.toUpperCase()
}

// Decks del store de decks
const decksList = computed(() => decksStore.decks)

// Filtrados según criterios
const filteredCards = computed(() => {
  let cards = collectionCards.value

  // Filtro por status
  if (statusFilter.value !== 'all') {
    cards = cards.filter(c => c.status === statusFilter.value)
  }

  // Filtro por deck (usando allocaciones)
  if (deckFilter.value !== 'all') {
    cards = cards.filter(c => {
      const allocations = getAllocationsForCard(c.id)
      return allocations.some(a => a.deckId === deckFilter.value)
    })
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
    toastStore.show('Error buscando carta', 'error')
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
  // Check if card has allocations in decks
  const allocations = getAllocationsForCard(card.id)
  const hasAllocations = allocations.length > 0

  const message = hasAllocations
    ? `¿Eliminar "${card.name}" de tu colección?\n\nEsta carta está asignada en ${allocations.length} mazo(s). Se moverá a wishlist en esos mazos.`
    : `¿Eliminar "${card.name}" de tu colección?`

  if (!confirm(message)) return

  try {
    // Convert allocations to wishlist BEFORE deleting the card
    if (hasAllocations) {
      await decksStore.convertAllocationsToWishlist(card)
    }

    await collectionStore.deleteCard(card.id)
    toastStore.show(`✓ "${card.name}" eliminada`, 'success')
  } catch (err) {
    toastStore.show('Error eliminando carta', 'error')
  }
}

// Guardar cambios en edición
const handleSaveEdit = async (updatedCard: Card) => {
  try {
    // Check if quantity is being reduced and needs allocation adjustment
    const currentCard = collectionStore.getCardById(updatedCard.id)
    if (currentCard && updatedCard.quantity < currentCard.quantity) {
      // Reduce allocations if quantity is being lowered
      await decksStore.reduceAllocationsForCard(currentCard, updatedCard.quantity)
    }

    await collectionStore.updateCard(updatedCard.id, updatedCard)
    toastStore.show(`✓ "${updatedCard.name}" actualizada`, 'success')
    showEditModal.value = false
    editingCard.value = null
  } catch (err) {
    toastStore.show('Error actualizando carta', 'error')
  }
}

// Actualizar status desde CardStatusModal
const handleUpdateStatus = async (cardId: string, newStatus: CardStatus) => {
  try {
    await collectionStore.updateCard(cardId, { status: newStatus } as any)
    toastStore.show('✓ Status actualizado', 'success')
    showStatusModal.value = false
    selectedCard.value = null
  } catch (err) {
    toastStore.show('Error actualizando status', 'error')
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
    toastStore.show('✓ Deck eliminado', 'success')
    deckFilter.value = 'all'
  } catch (err) {
    toastStore.show('Error eliminando deck', 'error')
  }
}

// ========== LIFECYCLE ==========

onMounted(async () => {
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      decksStore.loadDecks()
    ])
  } catch (err) {
    toastStore.show('Error cargando datos', 'error')
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

    <!-- ========== LAYOUT PRINCIPAL ========== -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- Panel de filtros avanzados (siempre visible) -->
      <div class="lg:col-span-1">
        <FilterPanel />
      </div>

      <!-- Contenido principal -->
      <div class="lg:col-span-3">
        <!-- Resultados de búsqueda Scryfall (cuando hay resultados) -->
        <div v-if="searchStore.hasResults" class="space-y-4">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-h3 font-bold text-neon">RESULTADOS DE BÚSQUEDA</h2>
              <p class="text-small text-silver-70">
                {{ searchStore.totalResults }} cartas encontradas - Click para agregar
              </p>
            </div>
            <BaseButton size="small" variant="secondary" @click="searchStore.clearSearch()">
              VER MI COLECCIÓN
            </BaseButton>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div
                v-for="card in searchStore.results"
                :key="card.id"
                @click="handleCardSelected(card)"
                class="cursor-pointer group"
            >
              <div class="aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-150">
                <img
                    v-if="card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal"
                    :src="card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal"
                    :alt="card.name"
                    class="w-full h-full object-cover group-hover:scale-105 transition-300"
                />
              </div>
              <p class="text-tiny text-silver mt-2 truncate group-hover:text-neon">{{ card.name }}</p>
              <p class="text-tiny text-neon font-bold">${{ card.prices?.usd || 'N/A' }}</p>
            </div>
          </div>
        </div>

        <!-- Vista de colección (cuando NO hay resultados de búsqueda) -->
        <div v-else>
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
          {{ getStatusLabel(status) }}
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
              ...decksList.map(deck => ({ value: deck.name, label: deck.name }))
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
        </div>
      </div>
    </div>

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