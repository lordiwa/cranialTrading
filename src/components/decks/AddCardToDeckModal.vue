<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'
import { searchCards } from '../../services/scryfall'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseLoader from '../ui/BaseLoader.vue'
import type { CardCondition } from '../../types/card'

const props = defineProps<{
  show: boolean
  deckId: string
  isSideboard: boolean
}>()

const emit = defineEmits<{
  close: []
  add: [cardData: {
    cardId?: string
    scryfallId: string
    name: string
    edition: string
    quantity: number
    condition: string
    foil: boolean
    price: number
    image: string
    addToCollection: boolean
  }]
}>()

const { t } = useI18n()

const toastStore = useToastStore()
const { findMatchingCollectionCards } = useCardAllocation()

// Card Kingdom prices
const {
  loading: loadingCKPrices,
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => selectedCard.value?.id,
  () => selectedCard.value?.set
)

// Search state (like CollectionView)
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const searchError = ref<string | null>(null)

// Selected card state
const selectedCard = ref<any>(null)
const showForm = ref(false)

// Prints disponibles para la carta seleccionada
const availablePrints = ref<any[]>([])
const loadingPrints = ref(false)

// Mode: 'collection' = allocate from collection, 'wishlist' = add to wishlist, 'new' = add to collection then allocate
const addMode = ref<'collection' | 'wishlist' | 'new'>('wishlist')
const selectedCollectionCard = ref<any>(null)

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearchInput = (query: string) => {
  searchQuery.value = query
  clearTimeout(searchTimeout)

  if (!query.trim()) {
    searchResults.value = []
    return
  }

  searchTimeout = setTimeout(() => {
    void (async () => {
      isSearching.value = true
      searchError.value = null

      try {
        const results = await searchCards(query)
        searchResults.value = results
      } catch (err) {
        searchError.value = err instanceof Error ? err.message : t('decks.addToDeck.searchError')
        searchResults.value = []
      } finally {
        isSearching.value = false
      }
    })()
  }, 300)
}

// Cargar todos los prints de una carta
const loadAllPrints = async (cardName: string) => {
  loadingPrints.value = true
  try {
    const results = await searchCards(`!"${cardName}"`)
    availablePrints.value = results
  } catch (err) {
    console.error('Error loading prints:', err)
    availablePrints.value = []
  } finally {
    loadingPrints.value = false
  }
}

// Matching collection cards for the selected Scryfall card
const matchingCollectionCards = computed(() => {
  if (!selectedCard.value) return []
  return findMatchingCollectionCards({ scryfallId: selectedCard.value.id })
})

// Check if we have any of this card in collection
const hasInCollection = computed(() => matchingCollectionCards.value.length > 0)

// Cambiar el print seleccionado
const handlePrintChange = (scryfallId: string) => {
  const newPrint = availablePrints.value.find(p => p.id === scryfallId)
  if (newPrint) {
    selectedCard.value = newPrint
    selectedCollectionCard.value = null
    addMode.value = hasInCollection.value ? 'collection' : 'wishlist'
  }
}

// Fetch CK prices when selected card changes
watch(selectedCard, (card) => {
  if (card?.id && card?.set) {
    fetchCKPrices()
  }
})

const form = ref({
  quantity: 1,
  condition: 'NM' as CardCondition,
  foil: false,
})

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

// Get card image (handle split cards)
const getCardImage = (card: any): string => {
  if (card.image_uris?.normal) return card.image_uris.normal
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal
  }
  return ''
}

const getCardImageSmall = (card: any): string => {
  if (card.image_uris?.small) return card.image_uris.small
  if (card.card_faces?.[0]?.image_uris?.small) {
    return card.card_faces[0].image_uris.small
  }
  return ''
}

const handleCardSelected = async (card: any) => {
  selectedCard.value = card
  showForm.value = true
  await loadAllPrints(card.name)

  const matches = findMatchingCollectionCards({ scryfallId: card.id })
  if (matches.length > 0) {
    addMode.value = 'collection'
    const available = matches.find(c => c.availableQuantity > 0)
    if (available) {
      selectedCollectionCard.value = available
      form.value.condition = available.condition
      form.value.foil = available.foil
    }
  } else {
    addMode.value = 'wishlist'
    selectedCollectionCard.value = null
  }
}

const selectCollectionCard = (card: any) => {
  selectedCollectionCard.value = card
  form.value.condition = card.condition
  form.value.foil = card.foil
  addMode.value = 'collection'
}

const maxQuantity = computed(() => {
  if (addMode.value === 'collection' && selectedCollectionCard.value) {
    return selectedCollectionCard.value.availableQuantity
  }
  return 99
})

const handleAdd = () => {
  if (!selectedCard.value) {
    toastStore.show(t('decks.addToDeck.selectCard'), 'error')
    return
  }

  if (form.value.quantity < 1) {
    toastStore.show(t('decks.editDeckCard.quantityMin'), 'error')
    return
  }

  if (addMode.value === 'collection' && selectedCollectionCard.value) {
    if (form.value.quantity > selectedCollectionCard.value.availableQuantity) {
      toastStore.show(t('decks.editDeckCard.onlyAvailable', { max: selectedCollectionCard.value.availableQuantity }), 'error')
      return
    }
  }

  const cardImage = getCardImage(selectedCard.value)

  const cardData = {
    cardId: addMode.value === 'collection' && selectedCollectionCard.value
        ? selectedCollectionCard.value.id
        : undefined,
    scryfallId: selectedCard.value.id,
    name: selectedCard.value.name,
    edition: selectedCard.value.set.toUpperCase(),
    quantity: form.value.quantity,
    condition: form.value.condition,
    foil: form.value.foil,
    price: selectedCard.value.prices?.usd ? Number.parseFloat(selectedCard.value.prices.usd) : 0,
    image: cardImage,
    addToCollection: addMode.value === 'new',
  }

  emit('add', cardData)
  resetForm()
}

const resetForm = () => {
  selectedCard.value = null
  showForm.value = false
  availablePrints.value = []
  selectedCollectionCard.value = null
  addMode.value = 'wishlist'
  searchQuery.value = ''
  searchResults.value = []
  form.value = {
    quantity: 1,
    condition: 'NM',
    foil: false,
  }
}

const deselectCard = () => {
  selectedCard.value = null
  showForm.value = false
  selectedCollectionCard.value = null
}

watch(() => props.show, (newVal) => {
  if (!newVal) {
    resetForm()
  }
})
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div class="space-y-6 w-full max-h-[80vh] flex flex-col">
      <!-- Search View -->
      <template v-if="!showForm">
        <div class="space-y-4">
          <!-- Header -->
          <div>
            <h2 class="text-h2 font-bold text-silver mb-1">{{ t('decks.addToDeck.title') }}</h2>
            <p class="text-small text-silver-70">{{ t('decks.addToDeck.subtitle') }}</p>
          </div>

          <!-- Search Input -->
          <div>
            <label for="add-deck-search" class="text-small text-silver-70 block mb-2">{{ t('decks.addToDeck.searchLabel') }}</label>
            <BaseInput
                id="add-deck-search"
                :model-value="searchQuery"
                @update:model-value="(v) => handleSearchInput(String(v))"
                :placeholder="t('decks.addToDeck.searchPlaceholder')"
                type="text"
            />
          </div>

          <!-- Loading -->
          <div v-if="isSearching" class="flex justify-center py-8">
            <BaseLoader size="small" />
          </div>

          <!-- Error -->
          <div v-else-if="searchError" class="text-center py-8">
            <p class="text-small text-rust">{{ searchError }}</p>
          </div>

          <!-- No results -->
          <div v-else-if="searchQuery && searchResults.length === 0" class="text-center py-8">
            <p class="text-small text-silver-70">{{ t('decks.addToDeck.noResults', { query: searchQuery }) }}</p>
          </div>

          <!-- Results Grid -->
          <div v-else-if="searchResults.length > 0" class="space-y-2">
            <p class="text-tiny text-silver-70">{{ t('decks.addToDeck.resultsCount', { count: searchResults.length }) }}</p>

            <div class="grid grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto">
              <div
                  v-for="card in searchResults.slice(0, 12)"
                  :key="card.id"
                  @click="handleCardSelected(card)"
                  class="cursor-pointer group"
              >
                <div class="aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-150">
                  <img
                      v-if="getCardImageSmall(card)"
                      :src="getCardImageSmall(card)"
                      :alt="card.name"
                      loading="lazy"
                      class="w-full h-full object-cover group-hover:scale-105 transition-300"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center text-tiny text-silver-50">
                    {{ t('decks.addToDeck.noImage') }}
                  </div>
                </div>
                <p class="text-tiny text-silver mt-1 truncate group-hover:text-neon">{{ card.name }}</p>
                <p class="text-tiny text-neon font-bold">${{ card.prices?.usd || 'N/A' }}</p>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else class="text-center py-8">
            <p class="text-small text-silver-70">{{ t('decks.addToDeck.emptyState') }}</p>
          </div>

          <!-- Close button -->
          <BaseButton class="w-full" variant="secondary" @click="emit('close')">
            {{ t('common.actions.close') }}
          </BaseButton>
        </div>
      </template>

      <!-- Selected Card Form -->
      <template v-else>
        <div class="space-y-6 flex flex-col h-full">
          <div>
            <h2 class="text-h2 font-bold text-silver mb-1">{{ t('decks.addToDeck.addTo', { section: isSideboard ? 'SIDEBOARD' : 'MAINBOARD' }) }}</h2>
            <p class="text-small text-silver-70">{{ t('decks.addToDeck.configureAdd') }}</p>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div class="bg-secondary border border-silver-30 p-4 space-y-4 rounded">
              <div class="flex gap-4">
                <div class="flex-shrink-0">
                  <img
                      v-if="getCardImage(selectedCard)"
                      :src="getCardImage(selectedCard)"
                      :alt="selectedCard.name"
                      class="w-32 h-44 object-cover border border-silver-30"
                  />
                  <div v-else class="w-32 h-44 bg-primary border border-silver-30 flex items-center justify-center">
                    <span class="text-tiny text-silver-50">{{ t('decks.addToDeck.noImage') }}</span>
                  </div>
                </div>

                <div class="flex-1 space-y-4">
                  <div>
                    <p class="font-bold text-silver mb-1 text-h3">{{ selectedCard.name }}</p>
                    <!-- Multi-source prices -->
                    <div class="mb-3 space-y-1">
                      <div class="flex justify-between items-center">
                        <span class="text-tiny text-silver-70">TCGPlayer:</span>
                        <span class="text-body font-bold text-neon">
                          ${{ selectedCard.prices?.usd ? Number.parseFloat(selectedCard.prices.usd).toFixed(2) : 'N/A' }}
                        </span>
                      </div>
                      <div v-if="hasCardKingdomPrices" class="flex justify-between items-center">
                        <span class="text-tiny text-silver-70">Card Kingdom:</span>
                        <span class="text-body font-bold text-[#4CAF50]">{{ formatPrice(cardKingdomRetail) }}</span>
                      </div>
                      <div v-if="cardKingdomBuylist" class="flex justify-between items-center">
                        <span class="text-tiny text-silver-50">CK Buylist:</span>
                        <span class="text-small text-[#FF9800]">{{ formatPrice(cardKingdomBuylist) }}</span>
                      </div>
                      <div v-else-if="loadingCKPrices" class="text-tiny text-silver-50">
                        {{ t('decks.editDeckCard.loadingCKPrices') }}
                      </div>
                    </div>

                    <div v-if="availablePrints.length > 1">
                      <label for="add-deck-print-select" class="text-tiny text-silver-70 block mb-1">{{ t('decks.editDeckCard.editionPrint') }}</label>
                      <select
                          id="add-deck-print-select"
                          :value="selectedCard.id"
                          @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                          class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-sans text-small focus:outline-none focus:border-neon transition-150"
                      >
                        <option v-for="print in availablePrints" :key="print.id" :value="print.id">
                          {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd || 'N/A' }}
                        </option>
                      </select>
                      <p class="text-tiny text-silver-50 mt-1">{{ t('decks.editDeckCard.printsAvailable', { count: availablePrints.length }) }}</p>
                    </div>
                    <p v-else-if="loadingPrints" class="text-tiny text-silver-50">{{ t('decks.editDeckCard.loadingPrints') }}</p>
                    <p v-else class="text-small text-silver-70">{{ selectedCard.set_name }} ({{ selectedCard.set.toUpperCase() }})</p>
                  </div>

                  <div class="border-t border-silver-20 pt-4">
                    <p class="text-tiny text-silver-70 mb-2">{{ t('decks.addToDeck.cardSource') }}</p>

                    <div v-if="hasInCollection" class="space-y-2">
                      <div
                          v-for="card in matchingCollectionCards"
                          :key="card.id"
                          @click="selectCollectionCard(card)"
                          class="p-2 border cursor-pointer transition-150"
                          :class="[
                            selectedCollectionCard?.id === card.id
                              ? 'border-neon bg-neon-10'
                              : 'border-silver-30 hover:border-silver-50'
                          ]"
                      >
                        <div class="flex justify-between items-center">
                          <div>
                            <span class="text-small text-silver">
                              {{ card.edition }} - {{ card.condition }}
                              <span v-if="card.foil" class="text-neon ml-1">FOIL</span>
                            </span>
                          </div>
                          <div class="text-right">
                            <span class="text-tiny" :class="card.availableQuantity > 0 ? 'text-neon' : 'text-ruby'">
                              {{ t('decks.addToDeck.availableDisp', { available: card.availableQuantity, total: card.quantity }) }}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                          @click="addMode = 'wishlist'; selectedCollectionCard = null"
                          class="p-2 border cursor-pointer transition-150"
                          :class="[
                            addMode === 'wishlist' && !selectedCollectionCard
                              ? 'border-amber bg-amber-5'
                              : 'border-silver-30 hover:border-silver-50'
                          ]"
                      >
                        <span class="text-small text-amber">{{ t('decks.addToDeck.addToWishlist') }}</span>
                      </div>

                      <div
                          @click="addMode = 'new'; selectedCollectionCard = null"
                          class="p-2 border cursor-pointer transition-150"
                          :class="[
                            addMode === 'new' && !selectedCollectionCard
                              ? 'border-neon bg-neon-10'
                              : 'border-silver-30 hover:border-silver-50'
                          ]"
                      >
                        <span class="text-small text-silver">{{ t('decks.addToDeck.addToCollectionFirst') }}</span>
                      </div>
                    </div>

                    <div v-else class="space-y-2">
                      <div class="p-2 bg-secondary border border-silver-30">
                        <p class="text-small text-silver-50">{{ t('decks.addToDeck.noCardInCollection') }}</p>
                      </div>

                      <div class="flex gap-2">
                        <button
                            @click="addMode = 'wishlist'"
                            class="flex-1 p-2 border text-small transition-150"
                            :class="[
                              addMode === 'wishlist'
                                ? 'border-amber text-amber bg-amber-5'
                                : 'border-silver-30 text-silver-70 hover:border-silver-50'
                            ]"
                        >
                          {{ t('decks.addToDeck.wishlistOption') }}
                        </button>
                        <button
                            @click="addMode = 'new'"
                            class="flex-1 p-2 border text-small transition-150"
                            :class="[
                              addMode === 'new'
                                ? 'border-neon text-neon bg-neon-10'
                                : 'border-silver-30 text-silver-70 hover:border-silver-50'
                            ]"
                        >
                          {{ t('decks.addToDeck.addToCollection') }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="space-y-3 border-t border-silver-20 pt-4">
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label for="add-deck-quantity" class="text-tiny text-silver-70 block mb-1">
                          {{ t('decks.addToDeck.quantityLabel') }}
                          <span v-if="addMode === 'collection' && selectedCollectionCard" class="text-neon">
                            {{ t('decks.editDeckCard.maxQty', { max: selectedCollectionCard.availableQuantity }) }}
                          </span>
                        </label>
                        <input
                            id="add-deck-quantity"
                            v-model.number="form.quantity"
                            type="number"
                            min="1"
                            :max="maxQuantity"
                            class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-sans text-small focus:outline-none focus:border-neon transition-150"
                        />
                      </div>

                      <div v-if="addMode !== 'collection' || !selectedCollectionCard">
                        <label for="add-deck-condition" class="text-tiny text-silver-70 block mb-1">{{ t('decks.editDeckCard.conditionLabel') }}</label>
                        <BaseSelect id="add-deck-condition" v-model="form.condition" :options="conditionOptions" />
                      </div>
                      <div v-else>
                        <span class="text-tiny text-silver-70 block mb-1">{{ t('decks.editDeckCard.conditionLabel') }}</span>
                        <div class="px-3 py-2 bg-secondary border border-silver-30 text-silver-70 text-small">
                          {{ selectedCollectionCard.condition }}
                        </div>
                      </div>
                    </div>

                    <div v-if="addMode !== 'collection' || !selectedCollectionCard" class="space-y-2">
                      <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors">
                        <input v-model="form.foil" type="checkbox" class="w-4 h-4" />
                        <span class="text-small text-silver">{{ t('decks.editDeckCard.foilLabel') }}</span>
                      </label>
                    </div>
                    <div v-else class="text-small text-silver-50">
                      <span v-if="selectedCollectionCard.foil" class="text-neon">FOIL</span>
                      <span v-else>{{ t('decks.addToDeck.noFoil') }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-4 border-t border-silver-20">
            <BaseButton
                class="flex-1"
                @click="handleAdd"
                :class="{ 'opacity-50': addMode === 'collection' && !selectedCollectionCard }"
            >
              <template v-if="addMode === 'collection'">{{ t('decks.addToDeck.assignFromCollection') }}</template>
              <template v-else-if="addMode === 'new'">{{ t('decks.addToDeck.addToCollectionAndDeck') }}</template>
              <template v-else>{{ t('decks.addToDeck.addToWishlistBtn') }}</template>
            </BaseButton>
            <BaseButton variant="secondary" class="flex-1" @click="deselectCard">
              {{ t('decks.addToDeck.goBack') }}
            </BaseButton>
          </div>
        </div>
      </template>
    </div>
  </BaseModal>
</template>

<style scoped>
.bg-amber-5 {
  background-color: rgba(245, 158, 11, 0.05);
}
.bg-neon-10 {
  background-color: rgba(0, 255, 136, 0.1);
}
</style>
