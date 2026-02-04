<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseButton from '../ui/BaseButton.vue'
import { useCollectionStore } from '../../stores/collection'
import { useToastStore } from '../../stores/toast'
import { useAuthStore } from '../../stores/auth'
import { usePreferencesStore } from '../../stores/preferences'
import { useDecksStore } from '../../stores/decks'
import { useI18n } from '../../composables/useI18n'
import { getCardSuggestions, searchCards } from '../../services/scryfall'
import { useCardPrices } from '../../composables/useCardPrices'
import type { CardCondition, CardStatus } from '../../types/card'

interface Props {
  show: boolean
  scryfallCard?: any
  selectedDeckId?: string
}

const props = defineProps<Props>()
const emit = defineEmits(['close', 'added'])

const { t } = useI18n()

// Search state (when no card pre-selected)
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searching = ref(false)
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
const suggestLoading = ref(false)

const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const authStore = useAuthStore()
const preferencesStore = usePreferencesStore()
const decksStore = useDecksStore()

const loading = ref(false)

// Prints disponibles
const availablePrints = ref<any[]>([])
const selectedPrint = ref<any>(null)
const loadingPrints = ref(false)

// Cargar todos los prints cuando cambia la carta
watch(() => props.scryfallCard, async (card) => {
  if (card) {
    selectedPrint.value = card
    loadingPrints.value = true
    try {
      // Cargar prints y mazos en paralelo
      const [results] = await Promise.all([
        searchCards(`!"${card.name}"`),
        decksStore.loadDecks()
      ])
      availablePrints.value = results
    } catch {
      availablePrints.value = [card]
    } finally {
      loadingPrints.value = false
    }
  } else {
    availablePrints.value = []
    selectedPrint.value = null
  }
}, { immediate: true })

// Pre-seleccionar deck cuando se abre el modal
watch(() => props.show, (isVisible) => {
  if (isVisible && props.selectedDeckId) {
    form.deckName = props.selectedDeckId
  }
}, { immediate: true })

// Cambiar el print seleccionado
const handlePrintChange = (scryfallId: string) => {
  const newPrint = availablePrints.value.find(p => p.id === scryfallId)
  if (newPrint) {
    selectedPrint.value = newPrint
  }
}

// Card Kingdom prices
const {
  loading: loadingCKPrices,
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => selectedPrint.value?.id,
  () => selectedPrint.value?.set
)

// Fetch CK prices when print changes
watch(selectedPrint, (print) => {
  if (print?.id && print?.set) {
    fetchCKPrices()
  }
})

const form = reactive<{
  quantity: number
  condition: CardCondition
  foil: boolean
  status: CardStatus
  deckName: string
  public: boolean
}>({
  quantity: 1,
  condition: 'NM',
  foil: false,
  status: 'collection',
  deckName: '',
  public: true,
})

// ✅ NUEVO: Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref(0)
const showZoom = ref(false)

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

// ✅ NUEVO: Función para obtener imagen correcta de split cards
const getCardImage = (card: any): string => {
  if (card.card_faces && card.card_faces.length > 0) {
    return card.card_faces[0].image_uris?.normal || ''
  }
  return card.image_uris?.normal || ''
}

// ✅ NUEVO: Verificar si es split card
const isSplitCard = computed(() => {
  return selectedPrint.value?.card_faces && selectedPrint.value.card_faces.length > 1
})

// ✅ NUEVO: Obtener imagen actual según el lado
const currentCardImage = computed(() => {
  if (!selectedPrint.value) return ''
  if (selectedPrint.value.card_faces?.[cardFaceIndex.value]) {
    return selectedPrint.value.card_faces[cardFaceIndex.value].image_uris?.normal || ''
  }
  return getCardImage(selectedPrint.value)
})

// Large image for zoom view
const zoomImage = computed(() => {
  if (!selectedPrint.value) return ''
  if (selectedPrint.value.card_faces?.[cardFaceIndex.value]) {
    return selectedPrint.value.card_faces[cardFaceIndex.value].image_uris?.large ||
           selectedPrint.value.card_faces[cardFaceIndex.value].image_uris?.normal || ''
  }
  return selectedPrint.value.image_uris?.large || selectedPrint.value.image_uris?.normal || ''
})

// ✅ NUEVO: Obtener nombre del lado actual
const currentCardName = computed(() => {
  if (!selectedPrint.value) return ''
  if (selectedPrint.value.card_faces?.[cardFaceIndex.value]) {
    return selectedPrint.value.card_faces[cardFaceIndex.value].name
  }
  return selectedPrint.value.name
})

// ✅ NUEVO: Toggle entre lados
const toggleCardFace = () => {
  if (isSplitCard.value) {
    cardFaceIndex.value = cardFaceIndex.value === 0 ? 1 : 0
  }
}

const statusOptions = computed(() => [
  { value: 'collection', label: t('cards.addModal.statusOptions.collection') },
  { value: 'sale', label: t('cards.addModal.statusOptions.sale') },
  { value: 'trade', label: t('cards.addModal.statusOptions.trade') },
  { value: 'wishlist', label: t('cards.addModal.statusOptions.wishlist') },
])

// Show public checkbox only for sale/trade
// Public option available for all statuses (default: true)
const showPublicOption = computed(() => true)

const deckOptions = computed(() => [
  { value: '', label: 'Sin asignar' },
  ...decksStore.decks.map(deck => ({ value: deck.id, label: deck.name }))
])

const handleAddCard = async () => {
  if (!selectedPrint.value || !authStore.user) return

  loading.value = true
  try {
    // ✅ CORREGIDO: Guardar el nombre del lado actual (para split cards)
    const cardName = isSplitCard.value
        ? selectedPrint.value.card_faces[cardFaceIndex.value].name
        : selectedPrint.value.name

    const imageToSave = currentCardImage.value || ''

    console.log('✅ GUARDANDO CARTA:', {
      name: cardName,
      image: imageToSave,
      isSplitCard: isSplitCard.value,
      cardFaceIndex: cardFaceIndex.value,
      edition: selectedPrint.value.set_name,
    })

    const cardId = await collectionStore.addCard({
      scryfallId: selectedPrint.value.id,
      name: cardName,
      edition: selectedPrint.value.set_name,
      setCode: selectedPrint.value.set,
      quantity: form.quantity,
      condition: form.condition,
      foil: form.foil,
      status: form.status,
      price: Number.parseFloat(selectedPrint.value.prices?.usd || '0'),
      image: imageToSave,
      public: form.public,
      cmc: selectedPrint.value.cmc,
      type_line: selectedPrint.value.type_line,
      colors: selectedPrint.value.colors || [],
    })

    // Si se seleccionó un deck, asignar la carta al deck
    if (cardId && form.deckName) {
      await decksStore.allocateCardToDeck(
        form.deckName,  // deckId
        cardId,
        form.quantity,
        false  // isInSideboard
      )
      console.log(`✅ Carta asignada al deck: ${form.deckName}`)
    }

    // Si es wishlist, crear preferencia BUSCO automáticamente
    if (form.status === 'wishlist') {
      await preferencesStore.addPreference({
        scryfallId: selectedPrint.value.id,
        name: cardName,
        type: 'BUSCO',
        quantity: form.quantity,
        condition: form.condition,
        edition: selectedPrint.value.set_name,
        image: imageToSave,
      })
      console.log('✅ Preferencia BUSCO creada automáticamente')
    }

    toastStore.show(t('cards.addModal.success', { name: selectedPrint.value.name }), 'success')
    emit('added')
    handleClose()
  } catch (err) {
    console.error('Error agregando carta:', err)
    toastStore.show(t('collection.messages.addError'), 'error')
  } finally {
    loading.value = false
  }
}

// Search functions for when no card is pre-selected
const handleSearchInput = async () => {
  const query = searchQuery.value.trim()
  if (query.length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }

  suggestLoading.value = true
  try {
    const results = await getCardSuggestions(query)
    suggestions.value = results.slice(0, 8)
    showSuggestions.value = suggestions.value.length > 0
  } catch {
    suggestions.value = []
  } finally {
    suggestLoading.value = false
  }
}

const selectSuggestion = async (cardName: string) => {
  searchQuery.value = cardName
  showSuggestions.value = false
  await performSearch()
}

const performSearch = async () => {
  const query = searchQuery.value.trim()
  if (!query) return

  searching.value = true
  showSuggestions.value = false
  try {
    const results = await searchCards(`!"${query}"`)
    searchResults.value = results.slice(0, 12)
  } catch {
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

const selectSearchResult = (card: any) => {
  selectedPrint.value = card
  searchResults.value = []
  searchQuery.value = ''
}

const hideSuggestionsDelayed = () => {
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

const handleClose = () => {
  form.quantity = 1
  form.condition = 'NM'
  form.foil = false
  form.status = 'collection'
  form.deckName = ''
  form.public = true
  cardFaceIndex.value = 0
  showZoom.value = false
  availablePrints.value = []
  selectedPrint.value = null
  // Reset search state
  searchQuery.value = ''
  searchResults.value = []
  suggestions.value = []
  showSuggestions.value = false
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" @close="handleClose" :close-on-click-outside="false">
    <div class="space-y-4">
      <!-- Título -->
      <h2 class="text-xl font-bold text-[#EEEEEE]">{{ t('cards.addModal.title') }}</h2>

      <!-- Search Section (when no card pre-selected) -->
      <div v-if="!selectedPrint" class="space-y-4">
        <!-- Search Input -->
        <div class="relative">
          <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('cards.addModal.searchPlaceholder')"
              class="w-full bg-primary border border-silver-30 px-3 py-2 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none rounded"
              @input="handleSearchInput"
              @keyup.enter="performSearch"
              @blur="hideSuggestionsDelayed"
          />
          <!-- Auto-suggest dropdown -->
          <div
              v-if="showSuggestions && suggestions.length > 0"
              class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-20 rounded"
          >
            <div
                v-for="suggestion in suggestions"
                :key="suggestion"
                @mousedown.prevent="selectSuggestion(suggestion)"
                class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-30 transition-all"
            >
              {{ suggestion }}
            </div>
          </div>
        </div>

        <!-- Search Button -->
        <BaseButton
            variant="secondary"
            size="small"
            @click="performSearch"
            :disabled="searching || !searchQuery.trim()"
            class="w-full"
        >
          {{ searching ? t('common.actions.searching') : t('common.actions.search') }}
        </BaseButton>

        <!-- Search Results Grid -->
        <div v-if="searchResults.length > 0" class="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
          <button
              v-for="card in searchResults"
              :key="card.id"
              @click="selectSearchResult(card)"
              class="relative group cursor-pointer rounded overflow-hidden border border-silver-30 hover:border-neon transition-colors"
          >
            <img
                :src="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
                :alt="card.name"
                class="w-full aspect-[2/3] object-cover"
            />
            <div class="absolute bottom-0 left-0 right-0 bg-primary/80 px-1 py-0.5">
              <p class="text-tiny text-silver truncate">{{ card.name }}</p>
            </div>
          </button>
        </div>

        <!-- No Results Message -->
        <p v-if="searchResults.length === 0 && searchQuery && !searching" class="text-center text-silver-50 text-small">
          {{ t('cards.addModal.noResults') }}
        </p>
      </div>

      <!-- Datos de la carta (when card is selected) -->
      <div v-else class="border border-[#EEEEEE]/30 p-4 space-y-4 rounded">
        <!-- Imagen y Formulario - responsive: columna en móvil, fila en desktop -->
        <div class="flex flex-col md:flex-row gap-4 md:gap-6">
          <!-- IZQUIERDA: Imagen -->
          <div class="flex flex-col items-center gap-4 flex-shrink-0">
            <!-- Imagen con botón toggle encima para split cards (clickable for zoom) -->
            <div class="relative w-full max-w-[200px] md:max-w-[256px]">
              <button
                  v-if="currentCardImage"
                  @click="showZoom = true"
                  class="relative group cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-neon rounded w-full"
              >
                <img
                    :src="currentCardImage"
                    :alt="currentCardName"
                    class="w-full aspect-[2/3] object-cover border border-[#EEEEEE]/20 rounded group-hover:border-neon transition-colors"
                />
                <div class="absolute inset-0 bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                  <span class="text-tiny text-silver font-bold">🔍 Zoom</span>
                </div>
              </button>
              <div v-else class="w-full aspect-[2/3] bg-[#333333] border border-[#EEEEEE]/20 flex items-center justify-center rounded">
                <span class="text-[#EEEEEE]/50">{{ t('cards.detailModal.noImage') }}</span>
              </div>

              <!-- ✅ Botón toggle flotante en esquina (SOLO para split cards) -->
              <button
                  v-if="isSplitCard"
                  @click.stop="toggleCardFace"
                  class="absolute top-2 right-2 bg-[#000000]/80 border-2 border-[#CCFF00] p-2 hover:bg-[#CCFF00]/20 transition-all rounded z-10"
                  :title="`Ver lado ${cardFaceIndex === 0 ? 2 : 1}`"
                  aria-label="Ver otro lado de la carta"
              >
                <svg class="w-5 h-5 text-[#CCFF00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
              </button>
            </div>

            <!-- Info bajo la imagen -->
            <div class="text-center w-full">
              <p class="font-bold text-[#EEEEEE]">{{ currentCardName }}</p>
              <p v-if="isSplitCard" class="text-xs text-[#CCFF00] mt-1">
                {{ t('cards.addModal.splitCardSide', { current: cardFaceIndex + 1, total: selectedPrint?.card_faces?.length }) }}
              </p>

              <!-- Prices Section -->
              <div class="mt-3 space-y-1">
                <!-- TCGPlayer Price -->
                <div class="flex justify-between items-center text-sm">
                  <span class="text-[#EEEEEE]/70">TCG:</span>
                  <span class="text-[#CCFF00] font-bold">${{ selectedPrint?.prices?.usd || 'N/A' }}</span>
                </div>

                <!-- Card Kingdom Prices -->
                <div class="flex justify-between items-center text-sm">
                  <span class="text-[#EEEEEE]/70">CK:</span>
                  <span v-if="hasCardKingdomPrices" class="text-[#4CAF50] font-bold">{{ formatPrice(cardKingdomRetail) }}</span>
                  <span v-else-if="loadingCKPrices" class="text-[#EEEEEE]/50">...</span>
                  <span v-else class="text-[#EEEEEE]/50">-</span>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span class="text-[#EEEEEE]/70">BL:</span>
                  <span v-if="cardKingdomBuylist" class="text-[#FF9800] font-bold">{{ formatPrice(cardKingdomBuylist) }}</span>
                  <span v-else class="text-[#EEEEEE]/50">-</span>
                </div>
              </div>

              <!-- Print Selector -->
              <div v-if="availablePrints.length > 1" class="mt-3">
                <label for="print-select" class="text-xs text-[#EEEEEE]/70 block mb-1">{{ t('cards.addModal.editionLabel') }}</label>
                <select
                    id="print-select"
                    :value="selectedPrint?.id"
                    @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                    class="w-full px-2 py-1 bg-[#000000] border border-[#EEEEEE]/30 text-[#EEEEEE] text-xs focus:outline-none focus:border-[#CCFF00] rounded"
                >
                  <option
                      v-for="print in availablePrints"
                      :key="print.id"
                      :value="print.id"
                  >
                    {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd || 'N/A' }}
                  </option>
                </select>
                <p class="text-xs text-[#EEEEEE]/50 mt-1">{{ t('cards.addModal.printsAvailable', { count: availablePrints.length }) }}</p>
              </div>
              <p v-else-if="loadingPrints" class="text-xs text-[#EEEEEE]/50 mt-2">{{ t('cards.editModal.loadingPrints') }}</p>
              <p v-else class="text-xs text-[#EEEEEE]/70 mt-2">{{ selectedPrint?.set_name }}</p>
            </div>
          </div>

          <!-- DERECHA: Formulario -->
          <div class="flex-1 space-y-4">
            <!-- Cantidad -->
            <div>
              <label for="quantity" class="text-sm text-[#EEEEEE]">{{ t('cards.addModal.quantityLabel') }}</label>
              <input
                  id="quantity"
                  v-model.number="form.quantity"
                  type="number"
                  min="1"
                  class="w-full mt-1 bg-[#000000] border border-[#EEEEEE] text-[#EEEEEE] px-3 py-2 rounded"
              />
            </div>

            <!-- Condición -->
            <div>
              <label for="condition" class="text-sm text-[#EEEEEE]">{{ t('cards.addModal.conditionLabel') }}</label>
              <BaseSelect
                  id="condition"
                  v-model="form.condition"
                  :options="conditionOptions"
                  class="mt-1"
              />
            </div>

            <!-- Foil -->
            <div class="flex items-center gap-2">
              <input
                  v-model="form.foil"
                  type="checkbox"
                  id="foil"
                  class="w-4 h-4"
              />
              <label for="foil" class="text-sm text-[#EEEEEE]">{{ t('cards.addModal.foilLabel') }}</label>
            </div>

            <!-- Estado -->
            <div>
              <label for="status" class="text-sm text-[#EEEEEE]">{{ t('cards.addModal.statusLabel') }}</label>
              <BaseSelect
                  id="status"
                  v-model="form.status"
                  :options="statusOptions"
                  class="mt-1"
              />
            </div>

            <!-- Publicar en perfil (solo para sale/trade) -->
            <div v-if="showPublicOption" class="flex items-center gap-2 p-3 bg-[#111111] border border-[#CCFF00]/30 rounded">
              <input
                  v-model="form.public"
                  type="checkbox"
                  id="public"
                  class="w-4 h-4"
              />
              <div>
                <label for="public" class="text-sm text-[#EEEEEE] cursor-pointer">{{ t('cards.addModal.publishLabel') }}</label>
                <p class="text-xs text-[#EEEEEE]/50">{{ t('cards.addModal.publishHint', { username: authStore.user?.username ?? '' }) }}</p>
              </div>
            </div>

            <!-- Deck (opcional) -->
            <div>
              <label for="deck" class="text-sm text-[#EEEEEE]">{{ t('cards.addModal.assignDeck') }}</label>
              <BaseSelect
                  id="deck"
                  v-model="form.deckName"
                  :options="deckOptions"
                  class="mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Botones -->
      <div class="flex gap-2 justify-end pt-4 border-t border-[#EEEEEE]/20">
        <BaseButton variant="secondary" @click="handleClose">
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton @click="handleAddCard" :disabled="loading">
          {{ loading ? t('cards.addModal.submitting') : t('cards.addModal.submit') }}
        </BaseButton>
      </div>
    </div>

    <!-- Zoom Overlay -->
    <Teleport to="body">
      <div
          v-if="showZoom"
          class="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-zoom-out p-4"
          @click="showZoom = false"
      >
        <img
            :src="zoomImage"
            :alt="currentCardName"
            class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            @click.stop
        />
        <button
            @click="showZoom = false"
            class="absolute top-4 right-4 text-silver hover:text-neon transition-colors p-2"
            aria-label="Cerrar zoom"
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <p class="absolute bottom-4 left-1/2 -translate-x-1/2 text-silver-70 text-small">
          Click para cerrar
        </p>
      </div>
    </Teleport>
  </BaseModal>
</template>