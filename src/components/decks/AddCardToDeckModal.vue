<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'
import { type ScryfallCard, searchCards } from '../../services/scryfall'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseLoader from '../ui/BaseLoader.vue'
import IconV2 from '../ui/IconV2.vue'
import type { CardCondition, CardWithAllocation } from '../../types/card'

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
const searchResults = ref<ScryfallCard[]>([])
const isSearching = ref(false)
const searchError = ref<string | null>(null)

// Selected card state
const selectedCard = ref<ScryfallCard | null>(null)
const showForm = ref(false)

// Prints disponibles para la carta seleccionada
const availablePrints = ref<ScryfallCard[]>([])
const loadingPrints = ref(false)

// Mode: 'collection' = allocate from collection, 'wishlist' = add to wishlist, 'new' = add to collection then allocate
const addMode = ref<'collection' | 'wishlist' | 'new'>('wishlist')
const selectedCollectionCard = ref<CardWithAllocation | null>(null)

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
watch(selectedCard, (card: ScryfallCard | null) => {
  if (card?.id && card?.set) {
    void fetchCKPrices()
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
const getCardImage = (card: ScryfallCard): string => {
  if (card.image_uris?.normal) return card.image_uris.normal
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal
  }
  return ''
}

const getCardImageSmall = (card: ScryfallCard): string => {
  if (card.image_uris?.small) return card.image_uris.small
  if (card.card_faces?.[0]?.image_uris?.small) {
    return card.card_faces[0].image_uris.small
  }
  return ''
}

const handleCardSelected = async (card: ScryfallCard) => {
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

const selectCollectionCard = (card: CardWithAllocation) => {
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
    price: cardKingdomRetail.value ?? (selectedCard.value.prices?.usd ? Number.parseFloat(selectedCard.value.prices.usd) : 0),
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
    <div class="space-y-4 w-full max-h-[80vh] flex flex-col">
      <!-- Search View -->
      <template v-if="!showForm">
        <div class="space-y-4">
          <!-- Header -->
          <div>
            <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('decks.addToDeck.title') }}</h2>
            <p class="text-small text-silver-70 mt-1">{{ t('decks.addToDeck.subtitle') }}</p>
          </div>

          <!-- Search Input -->
          <div>
            <label for="add-deck-search" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.addToDeck.searchLabel') }}</label>
            <label class="flex items-center gap-2.5 min-h-[46px] px-3.5 bg-surface-1 border border-line rounded-md transition-all duration-200 ease-v2 focus-within:border-neon focus-within:shadow-glow-neon">
              <IconV2 name="search" :size="18" class="text-silver-30 flex-shrink-0" />
              <input
                  id="add-deck-search"
                  :value="searchQuery"
                  type="text"
                  :placeholder="t('decks.addToDeck.searchPlaceholder')"
                  class="flex-1 min-w-0 bg-transparent border-none outline-none text-silver placeholder:text-silver-30 text-small"
                  @input="handleSearchInput(($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <!-- Loading -->
          <div v-if="isSearching" class="flex justify-center py-8">
            <BaseLoader size="small" />
          </div>

          <!-- Error -->
          <div v-else-if="searchError" class="text-center py-8">
            <p class="text-small text-[#C4553F]">{{ searchError }}</p>
          </div>

          <!-- No results -->
          <div v-else-if="searchQuery && searchResults.length === 0" class="text-center py-8">
            <p class="text-small text-silver-70">{{ t('decks.addToDeck.noResults', { query: searchQuery }) }}</p>
          </div>

          <!-- Results Grid -->
          <div v-else-if="searchResults.length > 0" class="space-y-2">
            <p class="text-tiny text-silver-50">{{ t('decks.addToDeck.resultsCount', { count: searchResults.length }) }}</p>

            <div class="grid grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[50vh] overflow-y-auto">
              <button
                  v-for="card in searchResults.slice(0, 12)"
                  :key="card.id"
                  type="button"
                  class="relative group cursor-pointer text-left rounded-md overflow-hidden border border-line hover:border-neon transition-colors duration-200 ease-v2"
                  @click="handleCardSelected(card)"
              >
                <div class="aspect-[3/4] bg-surface-1 overflow-hidden">
                  <img
                      v-if="getCardImageSmall(card)"
                      :src="getCardImageSmall(card)"
                      :alt="card.name"
                      loading="lazy"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-v2"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center text-tiny text-silver-50 px-2 text-center">
                    {{ t('decks.addToDeck.noImage') }}
                  </div>
                </div>
                <div class="absolute bottom-0 left-0 right-0 bg-black/55 px-1.5 py-1">
                  <p class="text-tiny text-silver truncate">{{ card.name }}</p>
                  <p class="text-tiny text-silver-50">${{ card.prices?.usd ?? 'N/A' }}</p>
                </div>
              </button>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else class="text-center py-8">
            <p class="text-small text-silver-70">{{ t('decks.addToDeck.emptyState') }}</p>
          </div>

          <!-- Close button -->
          <BaseButton class="w-full uppercase tracking-[.1em] !text-[12px]" variant="secondary" @click="emit('close')">
            {{ t('common.actions.close') }}
          </BaseButton>
        </div>
      </template>

      <!-- Selected Card Form -->
      <template v-else-if="selectedCard">
        <div class="space-y-4 flex flex-col h-full">
          <div>
            <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('decks.addToDeck.addTo', { section: isSideboard ? 'SIDEBOARD' : 'MAINBOARD' }) }}</h2>
            <p class="text-small text-silver-70 mt-1">{{ t('decks.addToDeck.configureAdd') }}</p>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div class="bg-surface-1 border border-line rounded-lg p-4 space-y-4">
              <div class="flex flex-col md:flex-row gap-4">
                <div class="flex-shrink-0 flex justify-center">
                  <img
                      v-if="getCardImage(selectedCard)"
                      :src="getCardImage(selectedCard)"
                      :alt="selectedCard.name"
                      loading="lazy"
                      class="w-32 aspect-[2/3] object-cover border border-line rounded-lg"
                  />
                  <div v-else class="w-32 aspect-[2/3] bg-surface-2 border border-line rounded-lg flex items-center justify-center">
                    <span class="text-tiny text-silver-50">{{ t('decks.addToDeck.noImage') }}</span>
                  </div>
                </div>

                <div class="flex-1 space-y-4">
                  <div>
                    <p class="font-display font-bold text-silver mb-1 text-h3">{{ selectedCard.name }}</p>
                    <!-- Multi-source prices -->
                    <div class="mb-3 space-y-1">
                      <div class="flex justify-between items-center text-sm">
                        <span class="text-silver-50">CK:</span>
                        <span v-if="hasCardKingdomPrices" class="font-display font-tnum text-neon font-bold">{{ formatPrice(cardKingdomRetail) }}</span>
                        <span v-else-if="loadingCKPrices" class="text-silver-50">...</span>
                        <span v-else class="text-silver-50">-</span>
                      </div>
                      <div class="flex justify-between items-center text-sm">
                        <span class="text-silver-50">TCG:</span>
                        <span class="font-display font-tnum text-silver-50">
                          ${{ selectedCard.prices?.usd ? Number.parseFloat(selectedCard.prices.usd).toFixed(2) : 'N/A' }}
                        </span>
                      </div>
                      <div class="flex justify-between items-center text-sm">
                        <span class="text-silver-50">BL:</span>
                        <span v-if="cardKingdomBuylist" class="font-display font-tnum text-silver font-bold">{{ formatPrice(cardKingdomBuylist) }}</span>
                        <span v-else class="text-silver-50">-</span>
                      </div>
                    </div>

                    <div v-if="availablePrints.length > 1">
                      <label for="add-deck-print-select" class="text-xs text-silver-70 font-semibold block mb-1.5">{{ t('decks.editDeckCard.editionPrint') }}</label>
                      <div class="relative">
                        <select
                            id="add-deck-print-select"
                            :value="selectedCard.id"
                            class="w-full appearance-none px-3 py-2 pr-8 bg-surface-1 border border-line text-silver text-xs rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
                            @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                        >
                          <option v-for="print in availablePrints" :key="print.id" :value="print.id">
                            {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd ?? 'N/A' }}
                          </option>
                        </select>
                        <IconV2 name="chev-d" :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
                      </div>
                      <p class="text-xs text-silver-30 mt-1">{{ t('decks.editDeckCard.printsAvailable', { count: availablePrints.length }) }}</p>
                    </div>
                    <p v-else-if="loadingPrints" class="text-xs text-silver-50 mt-2">{{ t('decks.editDeckCard.loadingPrints') }}</p>
                    <p v-else class="text-xs text-silver-70 mt-2">{{ selectedCard.set_name }} ({{ selectedCard.set.toUpperCase() }})</p>
                  </div>

                  <div class="border-t border-line pt-4">
                    <p class="text-[11px] font-bold uppercase tracking-[.08em] text-silver-30 mb-2">{{ t('decks.addToDeck.cardSource') }}</p>

                    <div v-if="hasInCollection" class="space-y-2">
                      <button
                          v-for="card in matchingCollectionCards"
                          :key="card.id"
                          type="button"
                          class="w-full flex justify-between items-center gap-2 p-2.5 border rounded-md text-left transition-all duration-200 ease-v2"
                          :class="[
                            selectedCollectionCard?.id === card.id
                              ? 'border-neon-40 bg-neon-10'
                              : 'border-line bg-surface-2 hover:border-line-strong'
                          ]"
                          @click="selectCollectionCard(card)"
                      >
                        <span class="text-small text-silver">
                          {{ card.edition }} - {{ card.condition }}
                          <span v-if="card.foil" class="text-neon ml-1 font-bold">FOIL</span>
                        </span>
                        <span class="text-tiny font-display font-tnum" :class="card.availableQuantity > 0 ? 'text-neon' : 'text-[#C4553F]'">
                          {{ t('decks.addToDeck.availableDisp', { available: card.availableQuantity, total: card.quantity }) }}
                        </span>
                      </button>

                      <button
                          type="button"
                          class="w-full p-2.5 border rounded-md text-left transition-all duration-200 ease-v2"
                          :class="[
                            addMode === 'wishlist' && !selectedCollectionCard
                              ? 'border-gold bg-[rgba(212,168,67,.08)]'
                              : 'border-line bg-surface-2 hover:border-line-strong'
                          ]"
                          @click="addMode = 'wishlist'; selectedCollectionCard = null"
                      >
                        <span class="text-small text-gold font-semibold">{{ t('decks.addToDeck.addToWishlist') }}</span>
                      </button>

                      <button
                          type="button"
                          class="w-full p-2.5 border rounded-md text-left transition-all duration-200 ease-v2"
                          :class="[
                            addMode === 'new' && !selectedCollectionCard
                              ? 'border-neon-40 bg-neon-10'
                              : 'border-line bg-surface-2 hover:border-line-strong'
                          ]"
                          @click="addMode = 'new'; selectedCollectionCard = null"
                      >
                        <span class="text-small text-silver font-semibold">{{ t('decks.addToDeck.addToCollectionFirst') }}</span>
                      </button>
                    </div>

                    <div v-else class="space-y-2">
                      <div class="p-2.5 bg-surface-2 border border-line rounded-md">
                        <p class="text-small text-silver-50">{{ t('decks.addToDeck.noCardInCollection') }}</p>
                      </div>

                      <div class="flex gap-2">
                        <button
                            type="button"
                            class="flex-1 p-2.5 border rounded-md text-small font-semibold transition-all duration-200 ease-v2"
                            :class="[
                              addMode === 'wishlist'
                                ? 'border-gold text-gold bg-[rgba(212,168,67,.08)]'
                                : 'border-line text-silver-70 hover:border-line-strong'
                            ]"
                            @click="addMode = 'wishlist'"
                        >
                          {{ t('decks.addToDeck.wishlistOption') }}
                        </button>
                        <button
                            type="button"
                            class="flex-1 p-2.5 border rounded-md text-small font-semibold transition-all duration-200 ease-v2"
                            :class="[
                              addMode === 'new'
                                ? 'border-neon-40 text-neon bg-neon-10'
                                : 'border-line text-silver-70 hover:border-line-strong'
                            ]"
                            @click="addMode = 'new'"
                        >
                          {{ t('decks.addToDeck.addToCollection') }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="space-y-4 border-t border-line pt-4">
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label for="add-deck-quantity" class="text-xs text-silver-70 font-semibold block mb-1.5">
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
                            class="no-spinner w-full min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md text-silver font-display font-tnum text-small focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2"
                        />
                      </div>

                      <div v-if="addMode !== 'collection' || !selectedCollectionCard">
                        <label for="add-deck-condition" class="text-xs text-silver-70 font-semibold block mb-1.5">{{ t('decks.editDeckCard.conditionLabel') }}</label>
                        <div class="relative">
                          <select
                              id="add-deck-condition"
                              v-model="form.condition"
                              class="w-full appearance-none px-3 py-2 pr-8 bg-surface-1 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
                          >
                            <option v-for="opt in conditionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                          </select>
                          <IconV2 name="chev-d" :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
                        </div>
                      </div>
                      <div v-else>
                        <span class="text-xs text-silver-70 font-semibold block mb-1.5">{{ t('decks.editDeckCard.conditionLabel') }}</span>
                        <div class="min-h-[44px] flex items-center px-3.5 bg-surface-2 border border-line rounded-md text-silver-70 text-small">
                          {{ selectedCollectionCard.condition }}
                        </div>
                      </div>
                    </div>

                    <button
                        v-if="addMode !== 'collection' || !selectedCollectionCard"
                        type="button"
                        role="switch"
                        :aria-checked="form.foil"
                        class="w-full flex items-center justify-between gap-3.5 min-h-[46px] px-3.5 bg-surface-1 border border-line rounded-md"
                        @click="form.foil = !form.foil"
                    >
                      <span class="text-[14px] font-semibold text-silver">{{ t('decks.editDeckCard.foilLabel') }}</span>
                      <span
                          class="relative w-[44px] h-[26px] rounded-full border flex-shrink-0 transition-colors duration-200 ease-v2"
                          :class="form.foil ? 'bg-neon border-neon' : 'bg-surface-3 border-line'"
                      >
                        <span
                            class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ease-v2"
                            :class="form.foil ? 'right-0.5' : 'left-0.5'"
                        ></span>
                      </span>
                    </button>
                    <p v-else class="text-small text-silver-50">
                      <span v-if="selectedCollectionCard.foil" class="text-neon font-bold">FOIL</span>
                      <span v-else>{{ t('decks.addToDeck.noFoil') }}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-2 justify-end pt-4 border-t border-line">
            <BaseButton variant="secondary" class="uppercase tracking-[.1em] !text-[12px]" @click="deselectCard">
              {{ t('decks.addToDeck.goBack') }}
            </BaseButton>
            <BaseButton
                variant="filled"
                class="uppercase tracking-[.1em] !text-[12px] gap-2"
                :class="{ 'opacity-50': addMode === 'collection' && !selectedCollectionCard }"
                @click="handleAdd"
            >
              <IconV2 name="plus" :size="14" />
              <template v-if="addMode === 'collection'">{{ t('decks.addToDeck.assignFromCollection') }}</template>
              <template v-else-if="addMode === 'new'">{{ t('decks.addToDeck.addToCollectionAndDeck') }}</template>
              <template v-else>{{ t('decks.addToDeck.addToWishlistBtn') }}</template>
            </BaseButton>
          </div>
        </div>
      </template>
    </div>
  </BaseModal>
</template>
