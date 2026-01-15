<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import AppContainer from '../components/layout/AppContainer.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import EditCardModal from '../components/collection/EditCardModal.vue'
import CardStatusModal from '../components/collection/CardStatusModal.vue'
import ManageDecksModal from '../components/collection/ManageDecksModal.vue'
import CollectionGrid from '../components/collection/CollectionGrid.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { Card, CardStatus } from '../types/card'
import { useDecksStore } from '../stores/decks'
import { useSearchStore } from '../stores/search'
import { usePreferencesStore } from '../stores/preferences'
import { useCardAllocation } from '../composables/useCardAllocation'
import FilterPanel from '../components/search/FilterPanel.vue'

const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const searchStore = useSearchStore()
const preferencesStore = usePreferencesStore()
const toastStore = useToastStore()
const { getAllocationsForCard } = useCardAllocation()

// ========== STATE ==========

// Modals
const showAddCardModal = ref(false)
const showEditModal = ref(false)
const showStatusModal = ref(false)
const showManageDecksModal = ref(false)

// Selección de cartas
const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<any>(null)
const editingCard = ref<Card | null>(null)

// ✅ Filtros de COLECCIÓN (no Scryfall)
const statusFilter = ref<'all' | CardStatus>('all')
const deckFilter = ref<string>('all')
const filterQuery = ref('')

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

// Cuando selecciona una carta de búsqueda para agregar
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

// Gestionar mazos
const handleManageDecks = (card: Card) => {
  selectedCard.value = card
  showManageDecksModal.value = true
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
    const card = collectionStore.getCardById(cardId)
    if (!card) return

    const oldStatus = card.status

    // Actualizar status en colección
    await collectionStore.updateCard(cardId, { status: newStatus } as any)

    // Gestionar preferencias automáticamente
    if (newStatus === 'wishlist' && oldStatus !== 'wishlist') {
      // Crear preferencia BUSCO
      await preferencesStore.addPreference({
        scryfallId: card.scryfallId,
        name: card.name,
        type: 'BUSCO',
        quantity: card.quantity,
        condition: card.condition,
        edition: card.edition,
        image: card.image || '',
      })
      console.log('✅ Preferencia BUSCO creada')
    } else if (oldStatus === 'wishlist' && newStatus !== 'wishlist') {
      // Eliminar preferencia BUSCO
      await preferencesStore.deletePreferenceByCard(card.scryfallId, card.edition)
      console.log('✅ Preferencia BUSCO eliminada')
    }

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
    <div class="mb-6">
      <h1 class="text-h1 font-bold text-silver">MI COLECCIÓN</h1>
      <p class="text-small text-silver-70">{{ collectionCards.length }} cartas total</p>
    </div>

    <!-- ========== BARRA DE BÚSQUEDA HORIZONTAL ========== -->
    <FilterPanel />

    <!-- ========== CONTENIDO PRINCIPAL ========== -->
    <div class="mt-6">
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
              ...decksList.map(deck => ({ value: deck.id, label: deck.name }))
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
            @manage-decks="handleManageDecks"
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

    <!-- ========== MODALS ========== -->

    <!-- Add Card Modal -->
    <AddCardModal
        :show="showAddCardModal"
        :scryfall-card="selectedScryfallCard"
        @close="showAddCardModal = false"
        @added="showAddCardModal = false"
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
        @update-status="handleUpdateStatus"
    />

    <!-- Manage Decks Modal -->
    <ManageDecksModal
        :show="showManageDecksModal"
        :card="selectedCard"
        @close="showManageDecksModal = false; selectedCard = null"
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