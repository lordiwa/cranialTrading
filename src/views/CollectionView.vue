<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { searchCards } from '../services/scryfall'
import AppContainer from '../components/layout/AppContainer.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import EditCardModal from '../components/collection/EditCardModal.vue'
import CardStatusModal from '../components/collection/CardStatusModal.vue'
import CollectionGrid from '../components/collection/CollectionGrid.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import { Card, CardStatus } from '../types/card'

const collectionStore = useCollectionStore()
const toastStore = useToastStore()

// ========== STATE ==========

// Modals
const showAddCardModal = ref(false)
const showEditModal = ref(false)
const showStatusModal = ref(false)

// Búsqueda Scryfall
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const searching = ref(false)

// Selección de cartas
const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<any>(null)
const editingCard = ref<Card | null>(null)

// ✅ Filtros de COLECCIÓN (no Scryfall)
const statusFilter = ref<'all' | CardStatus>('all')
const deckFilter = ref<string>('all')
const filterQuery = ref('') // Búsqueda por nombre en colección

// Filtros Scryfall avanzados
const filters = ref({
  colors: [] as string[],
  type: '',
  rarity: '',
  cmcMin: '',
  cmcMax: '',
  powerToughness: '',
  foilOnly: false,
})

let searchTimeout: NodeJS.Timeout

// ========== COMPUTED PROPERTIES ==========

// Colección base
const collectionCards = computed(() => collectionStore.cards)

// ✅ Contadores para TABs
const collectionCount = computed(() => collectionStore.cards.filter(c => c.status === 'collection').length)
const saleCount = computed(() => collectionStore.cards.filter(c => c.status === 'sale').length)
const tradeCount = computed(() => collectionStore.cards.filter(c => c.status === 'trade').length)
const wishlistCount = computed(() => collectionStore.cards.filter(c => c.status === 'wishlist').length)

// ✅ Mazos únicos
const uniqueDecks = computed(() => {
  const decks = new Set<string>()
  collectionStore.cards.forEach(card => {
    if (card.deckName) {
      decks.add(card.deckName)
    }
  })
  return Array.from(decks).sort()
})

// ✅ Cartas filtradas (por status + deck + búsqueda)
const filteredCards = computed(() => {
  let cards = collectionStore.cards

  // Filter by status TAB
  if (statusFilter.value !== 'all') {
    cards = cards.filter(card => card.status === statusFilter.value)
  }

  // Filter by deck
  if (deckFilter.value !== 'all') {
    cards = cards.filter(card => card.deckName === deckFilter.value)
  }

  // Filter by search query
  if (filterQuery.value) {
    const query = filterQuery.value.toLowerCase()
    cards = cards.filter(card =>
        card.name.toLowerCase().includes(query) ||
        card.edition.toLowerCase().includes(query) ||
        (card.deckName && card.deckName.toLowerCase().includes(query))
    )
  }

  return cards
})

// ✅ Estadísticas
const deckTotalCost = computed(() => {
  const cards = deckFilter.value !== 'all'
      ? collectionStore.cards.filter(c => c.deckName === deckFilter.value)
      : collectionStore.cards
  return cards.reduce((sum, c) => sum + ((c.price || 0) * (c.quantity || 0)), 0)
})

const wishlistTotalCost = computed(() => {
  const cards = deckFilter.value !== 'all'
      ? collectionStore.cards.filter(c => c.deckName === deckFilter.value && c.status === 'wishlist')
      : collectionStore.cards.filter(c => c.status === 'wishlist')
  return cards.reduce((sum, c) => sum + ((c.price || 0) * (c.quantity || 0)), 0)
})

// ========== MÉTODOS ==========

// ✅ NUEVO: Función para obtener imagen correcta (incluyendo split cards)
const getCardImage = (card: any): string => {
  // Split cards (ej: "Valakut Awakening // Valakut Stoneforge")
  if (card.card_faces && card.card_faces.length > 0) {
    // Tomar la primera cara (front)
    return card.card_faces[0].image_uris?.normal || ''
  }
  // Cartas normales
  return card.image_uris?.normal || ''
}

// Construir query Scryfall
const buildScryfallQuery = (): string => {
  const parts: string[] = []

  if (filters.value.colors.length > 0) {
    const colorQueries = filters.value.colors.map(c => `c:${c}`)
    if (colorQueries.length === 1) {
      parts.push(colorQueries[0])
    } else {
      parts.push(`(${colorQueries.join(' OR ')})`)
    }
  }

  if (filters.value.type) {
    parts.push(`t:${filters.value.type}`)
  }

  if (filters.value.rarity) {
    parts.push(`r:${filters.value.rarity}`)
  }

  if (filters.value.cmcMin) {
    parts.push(`mv>=${filters.value.cmcMin}`)
  }
  if (filters.value.cmcMax) {
    parts.push(`mv<=${filters.value.cmcMax}`)
  }

  if (filters.value.powerToughness) {
    parts.push(`pow=${filters.value.powerToughness.split('/')[0]} tou=${filters.value.powerToughness.split('/')[1]}`)
  }

  if (filters.value.foilOnly) {
    parts.push('is:foil')
  }

  return parts.join(' ')
}

// Búsqueda Scryfall
const handleSearch = () => {
  clearTimeout(searchTimeout)
  if (searchQuery.value.length < 2) {
    searchResults.value = []
    isSearching.value = false
    return
  }

  searching.value = true
  isSearching.value = true
  searchTimeout = setTimeout(async () => {
    try {
      const nameQuery = `${searchQuery.value.trim()}`
      const filterQuery = buildScryfallQuery()
      const fullQuery = filterQuery ? `${nameQuery} ${filterQuery}` : nameQuery

      console.log('🔍 Búsqueda Scryfall:', fullQuery)
      const results = await searchCards(fullQuery)
      let filtered = results.filter(card => {
        const price = card.prices?.usd
        return price && parseFloat(price) > 0
      })

      // Si no hay resultados con precio, mostrar todos
      if (filtered.length === 0) {
        filtered = results
      }

      // Priorizar coincidencias exactas del nombre
      const searchTerm = searchQuery.value.trim().toLowerCase()
      filtered.sort((a, b) => {
        const aMatch = a.name.toLowerCase() === searchTerm ? 0 : 1
        const bMatch = b.name.toLowerCase() === searchTerm ? 0 : 1
        return aMatch - bMatch
      })

      searchResults.value = filtered
    } catch (err) {
      console.error('Error buscando:', err)
      toastStore.show('Error en la búsqueda', 'error')
    } finally {
      searching.value = false
    }
  }, 300)
}

// Seleccionar carta de Scryfall → ABRE AddCardModal CON la carta
const handleSelectCard = (card: any) => {
  selectedScryfallCard.value = card
  showAddCardModal.value = true
  searchQuery.value = ''
  searchResults.value = []
  isSearching.value = false
  console.log('✅ Carta seleccionada para agregar:', card.name)
}

// Limpiar filtros Scryfall
const clearFilters = () => {
  filters.value = {
    colors: [],
    type: '',
    rarity: '',
    cmcMin: '',
    cmcMax: '',
    powerToughness: '',
    foilOnly: false,
  }
  if (searchQuery.value.length >= 2) {
    handleSearch()
  }
  toastStore.show('Filtros limpios', 'success')
}

// Métodos colección
const handleCardClick = (card: Card) => {
  selectedCard.value = card
  showStatusModal.value = true
}

const handleEdit = (card: Card) => {
  editingCard.value = card
  showEditModal.value = true
}

const handleDelete = async (cardId: string) => {
  await collectionStore.deleteCard(cardId)
  showStatusModal.value = false
  selectedCard.value = null
}

const handleSaveEdit = async (updates: Partial<Card>) => {
  if (editingCard.value) {
    await collectionStore.updateCard(editingCard.value.id, updates)
    showEditModal.value = false
    editingCard.value = null
  }
}

const handleUpdateStatus = async (newStatus: any, isPublic: boolean) => {
  if (!selectedCard.value) return
  await collectionStore.updateCard(selectedCard.value.id, {
    status: newStatus,
    public: isPublic
  })
  showStatusModal.value = false
  selectedCard.value = null
}

// ✅ Eliminar mazo completo
const handleDeleteDeck = async () => {
  if (deckFilter.value === 'all') return
  const confirmed = confirm(`Eliminar mazo "${deckFilter.value}"? Esta acción borrará todas las cartas de ese mazo.`)
  if (!confirmed) return

  const ok = await collectionStore.deleteDeck(deckFilter.value)
  if (ok) {
    deckFilter.value = 'all'
    toastStore.show(`Mazo "${deckFilter.value}" eliminado`, 'success')
  }
}

// Lifecycle
onMounted(() => {
  collectionStore.loadCollection()
})

watch(() => filters.value, () => {
  if (searchQuery.value.length >= 2 && isSearching.value) {
    handleSearch()
  }
}, { deep: true })
</script>

<template>
  <AppContainer>
    <div>
      <!-- ========== HEADER ========== -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver">MI COLECCIÓN</h1>
          <p class="text-tiny md:text-small text-silver-70 mt-1">
            {{ collectionStore.cards.length }} cartas físicas
          </p>
        </div>
        <BaseButton size="small" @click="showAddCardModal = true" class="w-full md:w-auto">
          + AGREGAR CARTA
        </BaseButton>
      </div>

      <!-- ========== TAB FILTERS DE ESTADO ========== -->
      <div class="flex flex-wrap gap-2 mb-4 md:mb-6">
        <button
            @click="statusFilter = 'all'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'all'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          TODAS ({{ collectionStore.cards.length }})
        </button>
        <button
            @click="statusFilter = 'collection'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'collection'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          COLECCIÓN ({{ collectionCount }})
        </button>
        <button
            @click="statusFilter = 'sale'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'sale'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          VENTA ({{ saleCount }})
        </button>
        <button
            @click="statusFilter = 'trade'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'trade'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          CAMBIO ({{ tradeCount }})
        </button>
        <button
            @click="statusFilter = 'wishlist'"
            :class="[
              'px-3 py-2 text-tiny font-bold transition-fast flex-shrink-0',
              statusFilter === 'wishlist'
                ? 'bg-neon-10 text-neon border border-neon'
                : 'bg-primary border border-silver-30 text-silver-70'
            ]"
        >
          BUSCO ({{ wishlistCount }})
        </button>
      </div>

      <!-- ========== FILTRO POR MAZO ========== -->
      <div v-if="uniqueDecks.length > 0" class="mb-4 md:mb-6">
        <label class="text-small text-silver-70 block mb-2">Filtrar por mazo</label>
        <div class="flex gap-2 items-center">
          <select
              v-model="deckFilter"
              class="flex-1 bg-primary border border-silver px-3 py-2.5 text-small text-silver transition-fast focus:outline-none focus:border-2 focus:border-neon cursor-pointer"
          >
            <option value="all">Todos los mazos</option>
            <option v-for="deck in uniqueDecks" :key="deck" :value="deck">
              {{ deck }}
            </option>
          </select>

          <button
              v-if="deckFilter !== 'all'"
              @click="handleDeleteDeck"
              class="px-3 py-2.5 bg-rust text-white text-small font-bold hover:opacity-90 transition-fast"
          >
            Eliminar mazo
          </button>
        </div>
      </div>

      <!-- ========== BÚSQUEDA POR NOMBRE EN COLECCIÓN ========== -->
      <div class="mb-4 md:mb-6">
        <BaseInput
            v-model="filterQuery"
            placeholder="Filtrar por nombre, edición o mazo..."
            type="text"
        />
      </div>

      <!-- ========== BARRA DE ESTADÍSTICAS ========== -->
      <div v-if="collectionStore.cards.length > 0" class="bg-primary p-4 md:p-6 rounded-lg mb-4 md:mb-6 border border-silver-30">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
          <div>
            <div class="text-tiny text-silver-70">Total Cartas</div>
            <div class="text-h4 font-bold text-silver">{{ collectionStore.cards.length }}</div>
          </div>
          <div>
            <div class="text-tiny text-silver-70">En Colección</div>
            <div class="text-h4 font-bold text-silver">{{ collectionCount }}</div>
          </div>
          <div>
            <div class="text-tiny text-silver-70">Busco</div>
            <div class="text-h4 font-bold text-silver">{{ wishlistCount }}</div>
          </div>
          <div>
            <div class="text-tiny text-silver-70">Resto</div>
            <div class="text-h4 font-bold text-silver">{{ (collectionStore.cards.length - collectionCount - wishlistCount) }}</div>
          </div>
          <div>
            <div class="text-tiny text-silver-70">Costo Total (Mazo)</div>
            <div class="text-h4 font-bold text-neon">${{ deckTotalCost.toFixed(2) }}</div>
          </div>
          <div>
            <div class="text-tiny text-silver-70">Costo Busco</div>
            <div class="text-h4 font-bold text-neon">${{ wishlistTotalCost.toFixed(2) }}</div>
          </div>
        </div>
      </div>

      <!-- ========== BÚSQUEDA SCRYFALL + SIDEBAR + GRID ========== -->
      <div class="space-y-6">
        <!-- Búsqueda Scryfall -->
        <div class="bg-primary border border-silver-30 p-4 md:p-6">
          <label class="text-small text-silver-70 block mb-4">Agregar cartas desde Scryfall</label>
          <div class="space-y-4">
            <BaseInput
                v-model="searchQuery"
                placeholder="Buscar carta (ej: Black Lotus)..."
                type="text"
                @input="handleSearch"
            />

            <!-- Resultados Scryfall -->
            <div v-if="searchResults.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div v-for="card in searchResults" :key="card.id"
                   @click="handleSelectCard(card)"
                   class="bg-primary-dark border border-silver-20 hover:border-neon cursor-pointer transition-fast p-3">
                <img
                    v-if="getCardImage(card)"
                    :src="getCardImage(card)"
                    :alt="card.name"
                    class="w-full aspect-[3/4] object-cover border border-silver-20 mb-2"
                />
                <p class="text-small font-bold text-silver truncate">{{ card.name }}</p>
                <p class="text-tiny text-silver-70">{{ card.set_name }}</p>
                <p class="text-tiny text-neon font-bold mt-2">{{ card.prices?.usd ? `$${card.prices.usd}` : 'No existen registros de precio' }}</p>
              </div>
            </div>

            <div v-if="searching" class="p-6 text-center">
              <BaseLoader size="small" />
            </div>

            <div v-if="isSearching && searchResults.length === 0 && !searching && searchQuery.length >= 2" class="text-center py-6">
              <p class="text-small text-silver-70">No se encontraron cartas</p>
            </div>
          </div>
        </div>

        <!-- GRID CON SIDEBAR DE FILTROS SCRYFALL -->
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <!-- SIDEBAR FILTROS SCRYFALL -->
          <div class="lg:col-span-1">
            <div class="bg-primary border border-silver-30 p-6 sticky top-20 space-y-6">
              <div class="flex items-center justify-between">
                <h3 class="text-small font-bold text-silver-70 uppercase">Filtros Scryfall</h3>
                <span v-if="filters.colors.length || filters.type || filters.rarity || filters.cmcMin || filters.cmcMax || filters.foilOnly" class="bg-neon text-primary text-tiny font-bold px-2 py-1">
                  {{ [filters.colors.length, filters.type ? 1 : 0, filters.rarity ? 1 : 0, filters.cmcMin ? 1 : 0, filters.cmcMax ? 1 : 0, filters.foilOnly ? 1 : 0].reduce((a, b) => a + b, 0) }}
                </span>
              </div>

              <!-- Color -->
              <div>
                <label class="text-tiny font-bold text-silver-70 uppercase block mb-2">Color</label>
                <div class="space-y-2">
                  <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
                    <input type="checkbox" :checked="filters.colors.includes('W')" @change="e => {
                      const idx = filters.colors.indexOf('W')
                      if ((e.target as HTMLInputElement).checked && idx === -1) filters.colors.push('W')
                      else if (!((e.target as HTMLInputElement).checked) && idx !== -1) filters.colors.splice(idx, 1)
                    }" class="w-4 h-4" />
                    <span>⚪ Blanco</span>
                  </label>
                  <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
                    <input type="checkbox" :checked="filters.colors.includes('U')" @change="e => {
                      const idx = filters.colors.indexOf('U')
                      if ((e.target as HTMLInputElement).checked && idx === -1) filters.colors.push('U')
                      else if (!((e.target as HTMLInputElement).checked) && idx !== -1) filters.colors.splice(idx, 1)
                    }" class="w-4 h-4" />
                    <span>🔵 Azul</span>
                  </label>
                  <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
                    <input type="checkbox" :checked="filters.colors.includes('B')" @change="e => {
                      const idx = filters.colors.indexOf('B')
                      if ((e.target as HTMLInputElement).checked && idx === -1) filters.colors.push('B')
                      else if (!((e.target as HTMLInputElement).checked) && idx !== -1) filters.colors.splice(idx, 1)
                    }" class="w-4 h-4" />
                    <span>⚫ Negro</span>
                  </label>
                  <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
                    <input type="checkbox" :checked="filters.colors.includes('R')" @change="e => {
                      const idx = filters.colors.indexOf('R')
                      if ((e.target as HTMLInputElement).checked && idx === -1) filters.colors.push('R')
                      else if (!((e.target as HTMLInputElement).checked) && idx !== -1) filters.colors.splice(idx, 1)
                    }" class="w-4 h-4" />
                    <span>🔴 Rojo</span>
                  </label>
                  <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
                    <input type="checkbox" :checked="filters.colors.includes('G')" @change="e => {
                      const idx = filters.colors.indexOf('G')
                      if ((e.target as HTMLInputElement).checked && idx === -1) filters.colors.push('G')
                      else if (!((e.target as HTMLInputElement).checked) && idx !== -1) filters.colors.splice(idx, 1)
                    }" class="w-4 h-4" />
                    <span>🟢 Verde</span>
                  </label>
                </div>
              </div>

              <!-- Tipo de carta -->
              <div>
                <label class="text-tiny font-bold text-silver-70 uppercase block mb-2">Tipo</label>
                <select v-model="filters.type" class="w-full bg-primary border border-silver-30 px-3 py-2 text-small text-silver">
                  <option value="">Todos</option>
                  <option value="creature">Criatura</option>
                  <option value="instant">Instante</option>
                  <option value="sorcery">Conjuro</option>
                  <option value="enchantment">Encantamiento</option>
                  <option value="artifact">Artefacto</option>
                  <option value="land">Tierra</option>
                  <option value="planeswalker">Planeswalker</option>
                </select>
              </div>

              <!-- Rareza -->
              <div>
                <label class="text-tiny font-bold text-silver-70 uppercase block mb-2">Rareza</label>
                <select v-model="filters.rarity" class="w-full bg-primary border border-silver-30 px-3 py-2 text-small text-silver">
                  <option value="">Todas</option>
                  <option value="common">Común</option>
                  <option value="uncommon">Infrecuente</option>
                  <option value="rare">Rara</option>
                  <option value="mythic">Mítica</option>
                </select>
              </div>

              <!-- Rango de CMC -->
              <div>
                <label class="text-tiny font-bold text-silver-70 uppercase block mb-2">Costo de maná (CMC)</label>
                <div class="flex gap-2">
                  <input v-model="filters.cmcMin" type="number" min="0" max="10" placeholder="Mín" class="flex-1 bg-primary border border-silver-30 px-2 py-1 text-small text-silver" />
                  <input v-model="filters.cmcMax" type="number" min="0" max="20" placeholder="Máx" class="flex-1 bg-primary border border-silver-30 px-2 py-1 text-small text-silver" />
                </div>
              </div>

              <!-- Poder/Resistencia -->
              <div>
                <label class="text-tiny font-bold text-silver-70 uppercase block mb-2">Poder/Resistencia</label>
                <input v-model="filters.powerToughness" type="text" placeholder="Ej: 2/2 o 3/*" class="w-full bg-primary border border-silver-30 px-3 py-2 text-small text-silver" />
              </div>

              <!-- Foil -->
              <div>
                <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
                  <input v-model="filters.foilOnly" type="checkbox" class="w-4 h-4" />
                  <span>Solo Foil</span>
                </label>
              </div>

              <!-- Botón limpiar filtros -->
              <div class="pt-4 border-t border-silver-30">
                <BaseButton variant="secondary" size="small" @click="clearFilters" class="w-full">
                  🔄 Limpiar filtros
                </BaseButton>
              </div>
            </div>
          </div>

          <!-- GRID DE COLECCIÓN -->
          <div class="lg:col-span-3">
            <BaseLoader v-if="collectionStore.loading" size="large" />

            <div v-else-if="filteredCards.length === 0" class="border border-silver-30 p-12 text-center">
              <p class="text-body text-silver-70 mb-4">📭 No hay cartas con estos filtros</p>
              <p class="text-small text-silver-50">
                {{ statusFilter === 'all' && deckFilter === 'all' ? 'Tu colección está vacía. ¡Agrega cartas!' : 'Intenta cambiar los filtros.' }}
              </p>
            </div>

            <CollectionGrid
                v-else
                :cards="filteredCards"
                @click="handleCardClick"
                @edit="handleEdit"
                @delete="handleDelete"
            />
          </div>
        </div>
      </div>

      <!-- ========== MODALS ========== -->
      <AddCardModal
          :show="showAddCardModal"
          :card="selectedScryfallCard"
          @close="showAddCardModal = false"
          @card-added="showAddCardModal = false"
      />

      <EditCardModal
          :show="showEditModal"
          :card="editingCard"
          @close="showEditModal = false"
          @save="handleSaveEdit"
      />

      <CardStatusModal
          :show="showStatusModal"
          :card="selectedCard"
          @close="showStatusModal = false"
          @update-status="handleUpdateStatus"
          @delete="handleDelete"
      />
    </div>
  </AppContainer>
</template>