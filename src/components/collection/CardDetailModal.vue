<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useCollectionStore } from '../../stores/collection'
import { useDecksStore } from '../../stores/decks'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { searchCards } from '../../services/scryfall'
import { cleanCardName } from '../../utils/cardHelpers'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { Card, CardCondition, CardStatus } from '../../types/card'

const props = defineProps<{
  show: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const toastStore = useToastStore()
const { getAllocationsForCard } = useCardAllocation()

// ========== STATE ==========

const isLoading = ref(false)
const loadingPrints = ref(false)

// Print selection
const availablePrints = ref<any[]>([])
const selectedPrint = ref<any>(null)

// Card properties (shared across all status entries)
const condition = ref<CardCondition>('NM')
const foil = ref(false)
const isPublic = ref(true)

// Status distribution - how many copies in each status
const statusDistribution = ref<Record<CardStatus, number>>({
  collection: 0,
  sale: 0,
  trade: 0,
  wishlist: 0,
})

// Related cards (same scryfallId + edition, different status)
const relatedCards = ref<Card[]>([])

// Deck allocations: deckId -> { quantity, isInSideboard }
const deckAllocations = ref<Record<string, { quantity: number; isInSideboard: boolean }>>({})

// Card Kingdom prices
const {
  loading: loadingCKPrices,
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => selectedPrint.value?.id || props.card?.scryfallId,
  () => selectedPrint.value?.set || props.card?.setCode
)

// ========== COMPUTED ==========

const conditionOptions = [
  { value: 'M', label: 'Mint (M)' },
  { value: 'NM', label: 'Near Mint (NM)' },
  { value: 'LP', label: 'Light Play (LP)' },
  { value: 'MP', label: 'Moderate Play (MP)' },
  { value: 'HP', label: 'Heavy Play (HP)' },
  { value: 'PO', label: 'Poor (PO)' },
]

// Total quantity across all statuses
const totalQuantity = computed(() => {
  return Object.values(statusDistribution.value).reduce((sum, qty) => sum + qty, 0)
})

// Current image from selected print or original card
const currentImage = computed(() => {
  if (selectedPrint.value) {
    return selectedPrint.value.image_uris?.normal ||
           selectedPrint.value.card_faces?.[0]?.image_uris?.normal || ''
  }
  return props.card?.image || ''
})

// Current price from selected print or original card
const currentPrice = computed(() => {
  if (selectedPrint.value?.prices?.usd) {
    return Number.parseFloat(selectedPrint.value.prices.usd)
  }
  return props.card?.price || 0
})

// All available decks
const allDecks = computed(() => decksStore.decks)

// Total allocated from deckAllocations state
const totalAllocated = computed(() => {
  return Object.values(deckAllocations.value).reduce((sum, a) => sum + a.quantity, 0)
})

// Available quantity for deck assignment (owned cards minus allocated)
const availableForAllocation = computed(() => {
  const ownedQty = totalQuantity.value - statusDistribution.value.wishlist
  return Math.max(0, ownedQty - totalAllocated.value)
})

// Validation: allow reducing below allocated (will convert to wishlist)
const canSave = computed(() => {
  return totalQuantity.value > 0
})

const validationError = computed(() => {
  if (totalQuantity.value === 0) {
    return 'Debes tener al menos 1 copia'
  }
  return null
})

// Warning when reducing below allocated (will convert to wishlist)
const allocationWarning = computed(() => {
  const ownedQty = totalQuantity.value - statusDistribution.value.wishlist
  if (ownedQty < totalAllocated.value) {
    const excess = totalAllocated.value - ownedQty
    return `${excess} carta(s) asignadas a mazos pasarán a wishlist`
  }
  return null
})

// Show public option when there are cards for sale or trade
const showPublicOption = computed(() => {
  return statusDistribution.value.sale > 0 || statusDistribution.value.trade > 0
})

// ========== METHODS ==========

// Find all cards with same scryfallId + edition (grouped entries)
const findRelatedCards = () => {
  if (!props.card) return []

  return collectionStore.cards.filter(c =>
    c.scryfallId === props.card!.scryfallId &&
    c.edition === props.card!.edition
  )
}

// Initialize form when modal opens
const initializeForm = async () => {
  if (!props.card) return

  // Get fresh card data from store (props.card might be stale reference)
  const freshCard = collectionStore.cards.find(c => c.id === props.card!.id) || props.card

  // Find all related cards (same scryfallId + edition) from store
  relatedCards.value = collectionStore.cards.filter(c =>
    c.scryfallId === freshCard.scryfallId &&
    c.edition === freshCard.edition
  )

  // Initialize status distribution from related cards
  statusDistribution.value = {
    collection: 0,
    sale: 0,
    trade: 0,
    wishlist: 0,
  }

  for (const card of relatedCards.value) {
    statusDistribution.value[card.status] += card.quantity
  }

  // Use condition and foil from the fresh card
  condition.value = freshCard.condition
  foil.value = freshCard.foil
  isPublic.value = freshCard.public ?? true

  // Load deck allocations for all related cards
  deckAllocations.value = {}
  for (const card of relatedCards.value) {
    const allocations = getAllocationsForCard(card.id)
    for (const alloc of allocations) {
      deckAllocations.value[alloc.deckId] = {
        quantity: (deckAllocations.value[alloc.deckId]?.quantity || 0) + alloc.quantity,
        isInSideboard: alloc.isInSideboard || false
      }
    }
  }

  // Load available prints
  loadingPrints.value = true
  try {
    const cardName = cleanCardName(freshCard.name)
    const results = await searchCards(`!"${cardName}"`)
    availablePrints.value = results

    // Find current print
    const currentPrint = results.find(p => p.id === freshCard.scryfallId)
    selectedPrint.value = currentPrint || results[0] || null
  } catch (err) {
    console.error('Error loading prints:', err)
    availablePrints.value = []
  } finally {
    loadingPrints.value = false
  }
}

// Handle print change
const handlePrintChange = (scryfallId: string) => {
  const newPrint = availablePrints.value.find(p => p.id === scryfallId)
  if (newPrint) {
    selectedPrint.value = newPrint
  }
}

// Adjust quantity for a status
const adjustQuantity = (status: CardStatus, delta: number) => {
  const newValue = statusDistribution.value[status] + delta
  if (newValue >= 0) {
    statusDistribution.value[status] = newValue
  }
}

// ========== DECK ALLOCATION METHODS ==========

// Get allocation for a specific deck
const getDeckAllocation = (deckId: string) => {
  return deckAllocations.value[deckId]?.quantity || 0
}

// Check if deck allocation is in sideboard
const isInSideboard = (deckId: string) => {
  return deckAllocations.value[deckId]?.isInSideboard || false
}

// Increment deck allocation (no limit - excess goes to deck wishlist)
const incrementDeckAllocation = (deckId: string) => {
  const current = getDeckAllocation(deckId)
  deckAllocations.value[deckId] = {
    quantity: current + 1,
    isInSideboard: deckAllocations.value[deckId]?.isInSideboard || false
  }
}

// Decrement deck allocation
const decrementDeckAllocation = (deckId: string) => {
  const current = getDeckAllocation(deckId)
  if (current <= 0) return

  if (current === 1) {
    delete deckAllocations.value[deckId]
  } else {
    deckAllocations.value[deckId] = {
      quantity: current - 1,
      isInSideboard: deckAllocations.value[deckId]?.isInSideboard || false
    }
  }
}

// Toggle sideboard for a deck
const toggleSideboard = (deckId: string) => {
  if (deckAllocations.value[deckId]) {
    deckAllocations.value[deckId].isInSideboard = !deckAllocations.value[deckId].isInSideboard
  }
}

// Save changes
const handleSave = async () => {
  // Prevent double-click
  if (isLoading.value) return
  isLoading.value = true

  if (!props.card || !canSave.value) {
    isLoading.value = false
    return
  }

  try {
    // Snapshot values at save time to prevent reactivity issues
    const savedCard = props.card
    const savedDistribution = { ...statusDistribution.value }
    const savedRelatedCards = [...relatedCards.value]
    const savedCondition = condition.value
    const savedFoil = foil.value
    const savedIsPublic = isPublic.value
    const savedTotalAllocated = totalAllocated.value

    const newScryfallId = selectedPrint.value?.id || savedCard.scryfallId
    const newEdition = selectedPrint.value?.set_name || savedCard.edition
    const newSetCode = selectedPrint.value?.set?.toUpperCase() || savedCard.setCode
    const newImage = currentImage.value
    const newPrice = currentPrice.value

    // Calculate new owned quantity (non-wishlist)
    const newOwnedQty = (savedDistribution.collection + savedDistribution.sale + savedDistribution.trade)

    // If reducing below allocated, convert excess to wishlist in decks
    if (newOwnedQty < savedTotalAllocated) {
      await decksStore.reduceAllocationsForCard(savedCard, newOwnedQty)
    }

    // Track cards that were updated/created for allocation purposes
    const updatedCardIds: string[] = []

    // Process each status
    const statuses: CardStatus[] = ['collection', 'sale', 'trade', 'wishlist']

    for (const status of statuses) {
      const targetQty = savedDistribution[status]
      const existingCard = savedRelatedCards.find(c => c.status === status)

      if (targetQty > 0) {
        if (existingCard) {
          // Update existing entry
          const publicValue = (status === 'sale' || status === 'trade') ? savedIsPublic : false
          await collectionStore.updateCard(existingCard.id, {
            quantity: targetQty,
            condition: savedCondition,
            foil: savedFoil,
            scryfallId: newScryfallId,
            edition: newEdition,
            setCode: newSetCode,
            image: newImage,
            price: newPrice,
            public: publicValue,
          })
          if (status !== 'wishlist') {
            updatedCardIds.push(existingCard.id)
          }
        } else {
          // Create new entry for this status
          const publicValue = (status === 'sale' || status === 'trade') ? savedIsPublic : false
          const newCardId = await collectionStore.addCard({
            scryfallId: newScryfallId,
            name: savedCard.name,
            edition: newEdition,
            setCode: newSetCode,
            quantity: targetQty,
            condition: savedCondition,
            foil: savedFoil,
            price: newPrice,
            image: newImage,
            status: status,
            public: publicValue,
          })
          if (status !== 'wishlist' && newCardId) {
            updatedCardIds.push(newCardId)
          }
        }
      } else if (existingCard) {
        // Delete entry if quantity is 0
        await collectionStore.deleteCard(existingCard.id)
      }
    }

    // Save deck allocations
    // First, get the primary card ID (collection status preferred, then sale, then trade)
    const primaryCardId = updatedCardIds[0]
    const savedDeckAllocations = { ...deckAllocations.value }
    const savedAllDecks = [...allDecks.value]

    if (primaryCardId) {
      // Get original allocations
      const originalAllocations = new Map<string, { quantity: number; isInSideboard: boolean }>()
      for (const card of savedRelatedCards) {
        if (card.status === 'wishlist') continue
        const allocations = getAllocationsForCard(card.id)
        for (const alloc of allocations) {
          originalAllocations.set(alloc.deckId, {
            quantity: alloc.quantity,
            isInSideboard: alloc.isInSideboard
          })
        }
      }

      // Process deck allocations
      for (const deck of savedAllDecks) {
        const newAlloc = savedDeckAllocations[deck.id]
        const origAlloc = originalAllocations.get(deck.id)

        if (newAlloc && newAlloc.quantity > 0) {
          if (origAlloc) {
            // Update existing allocation
            if (origAlloc.quantity !== newAlloc.quantity || origAlloc.isInSideboard !== newAlloc.isInSideboard) {
              // Remove old and add new
              for (const card of savedRelatedCards) {
                if (card.status !== 'wishlist') {
                  await decksStore.deallocateCard(deck.id, card.id, origAlloc.isInSideboard)
                }
              }
              await decksStore.allocateCardToDeck(deck.id, primaryCardId, newAlloc.quantity, newAlloc.isInSideboard)
            }
          } else {
            // Add new allocation
            await decksStore.allocateCardToDeck(deck.id, primaryCardId, newAlloc.quantity, newAlloc.isInSideboard)
          }
        } else if (origAlloc) {
          // Remove allocation
          for (const card of savedRelatedCards) {
            if (card.status !== 'wishlist') {
              await decksStore.deallocateCard(deck.id, card.id, origAlloc.isInSideboard)
            }
          }
        }
      }
    }

    // Force reload collection from Firebase to ensure sync
    await collectionStore.loadCollection()

    toastStore.show('Carta actualizada', 'success')
    emit('saved')
    emit('close')
  } catch (err) {
    console.error('Error saving card:', err)
    toastStore.show('Error guardando cambios', 'error')
  } finally {
    isLoading.value = false
  }
}

const handleClose = () => {
  availablePrints.value = []
  selectedPrint.value = null
  relatedCards.value = []
  deckAllocations.value = {}
  emit('close')
}

// ========== WATCHERS ==========

watch(() => props.show, (show) => {
  if (show && props.card) {
    initializeForm()
  }
}, { immediate: true })

// Fetch CK prices when print changes
watch(selectedPrint, (print) => {
  if (print?.id && print?.set) {
    fetchCKPrices()
  }
})
</script>

<template>
  <BaseModal :show="show" :close-on-click-outside="false" @close="handleClose">
    <div class="space-y-5 w-full max-w-xl">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">DETALLE DE CARTA</h2>
        <p class="text-small text-silver-70">Gestiona tu carta y distribúyela por status</p>
      </div>

      <!-- Card Preview -->
      <div v-if="card" class="flex gap-4">
        <!-- Image -->
        <div class="flex-shrink-0">
          <img
              v-if="currentImage"
              :src="currentImage"
              :alt="card.name"
              class="w-32 h-44 object-cover border border-silver-30"
          />
          <div v-else class="w-32 h-44 bg-primary border border-silver-30 flex items-center justify-center">
            <span class="text-tiny text-silver-50">No image</span>
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 space-y-3">
          <div>
            <p class="font-bold text-silver text-h3">{{ card.name }}</p>

            <!-- Multi-source prices -->
            <div class="mt-2 space-y-1">
              <div class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">TCGPlayer:</span>
                <span class="text-body font-bold text-neon">${{ currentPrice.toFixed(2) }}</span>
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
                Cargando precios CK...
              </div>
            </div>
          </div>

          <!-- Print Selector -->
          <div v-if="availablePrints.length > 1">
            <label for="detail-print-select" class="text-tiny text-silver-70 block mb-1">Edición / Print</label>
            <select
                id="detail-print-select"
                :value="selectedPrint?.id"
                @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-mono text-small focus:outline-none focus:border-neon transition-150"
            >
              <option
                  v-for="print in availablePrints"
                  :key="print.id"
                  :value="print.id"
              >
                {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd || 'N/A' }}
              </option>
            </select>
            <p class="text-tiny text-silver-50 mt-1">{{ availablePrints.length }} prints disponibles</p>
          </div>
          <p v-else-if="loadingPrints" class="text-tiny text-silver-50">Cargando prints...</p>
        </div>
      </div>

      <!-- Status Distribution -->
      <div class="bg-secondary border border-silver-30 p-4">
        <div class="flex justify-between items-center mb-3">
          <p class="text-small font-bold text-silver">DISTRIBUCIÓN POR STATUS</p>
          <p class="text-small text-neon font-bold">Total: {{ totalQuantity }}</p>
        </div>

        <div class="space-y-2">
          <!-- Collection -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-neon">✓</span>
              <span class="text-small text-silver">Colección</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustQuantity('collection', -1)"
                class="w-8 h-8 bg-primary border border-silver-30 text-silver hover:border-neon transition-150"
                :disabled="statusDistribution.collection <= 0"
              >
-
</button>
              <span class="w-8 text-center text-small font-bold text-neon">{{ statusDistribution.collection }}</span>
              <button
                @click="adjustQuantity('collection', 1)"
                class="w-8 h-8 bg-primary border border-silver-30 text-silver hover:border-neon transition-150"
              >
+
</button>
            </div>
          </div>

          <!-- Sale -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-yellow-400">$</span>
              <span class="text-small text-silver">Venta</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustQuantity('sale', -1)"
                class="w-8 h-8 bg-primary border border-silver-30 text-silver hover:border-neon transition-150"
                :disabled="statusDistribution.sale <= 0"
              >
-
</button>
              <span class="w-8 text-center text-small font-bold text-yellow-400">{{ statusDistribution.sale }}</span>
              <button
                @click="adjustQuantity('sale', 1)"
                class="w-8 h-8 bg-primary border border-silver-30 text-silver hover:border-neon transition-150"
              >
+
</button>
            </div>
          </div>

          <!-- Trade -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-blue-400">~</span>
              <span class="text-small text-silver">Cambio</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustQuantity('trade', -1)"
                class="w-8 h-8 bg-primary border border-silver-30 text-silver hover:border-neon transition-150"
                :disabled="statusDistribution.trade <= 0"
              >
-
</button>
              <span class="w-8 text-center text-small font-bold text-blue-400">{{ statusDistribution.trade }}</span>
              <button
                @click="adjustQuantity('trade', 1)"
                class="w-8 h-8 bg-primary border border-silver-30 text-silver hover:border-neon transition-150"
              >
+
</button>
            </div>
          </div>

          <!-- Wishlist -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-red-400">*</span>
              <span class="text-small text-silver">Deseado</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustQuantity('wishlist', -1)"
                class="w-8 h-8 bg-primary border border-silver-30 text-silver hover:border-neon transition-150"
                :disabled="statusDistribution.wishlist <= 0"
              >
-
</button>
              <span class="w-8 text-center text-small font-bold text-red-400">{{ statusDistribution.wishlist }}</span>
              <button
                @click="adjustQuantity('wishlist', 1)"
                class="w-8 h-8 bg-primary border border-silver-30 text-silver hover:border-neon transition-150"
              >
+
</button>
            </div>
          </div>
        </div>

        <!-- Validation Error -->
        <p v-if="validationError" class="text-tiny text-rust mt-3">
          {{ validationError }}
        </p>

        <!-- Allocation Warning -->
        <p v-if="allocationWarning && !validationError" class="text-tiny text-yellow-400 mt-3">
          ⚠️ {{ allocationWarning }}
        </p>

        <!-- Public option (shown when sale or trade > 0) -->
        <div v-if="showPublicOption" class="mt-4 pt-3 border-t border-silver-20">
          <label class="flex items-center gap-3 cursor-pointer p-2 border border-neon/30 hover:border-neon transition-150">
            <input
                v-model="isPublic"
                type="checkbox"
                class="w-4 h-4 cursor-pointer"
            />
            <div>
              <span class="text-small text-silver">Publicar en mi perfil</span>
              <p class="text-tiny text-silver-50">Visible para otros usuarios en tu perfil público</p>
            </div>
          </label>
        </div>
      </div>

      <!-- Condition & Foil -->
      <div class="bg-secondary border border-silver-30 p-4 space-y-4">
        <p class="text-small font-bold text-silver">PROPIEDADES</p>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="detail-condition" class="text-tiny text-silver-70 block mb-1">Condición</label>
            <BaseSelect
                id="detail-condition"
                v-model="condition"
                :options="conditionOptions"
            />
          </div>

          <div class="flex items-end">
            <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors pb-2">
              <input
                  v-model="foil"
                  type="checkbox"
                  class="w-4 h-4 cursor-pointer"
              />
              <span class="text-small text-silver">Foil</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Deck Allocations -->
      <div v-if="allDecks.length > 0" class="bg-secondary border border-silver-30 p-4">
        <div class="flex justify-between items-center mb-3">
          <p class="text-small font-bold text-silver">ASIGNAR A MAZOS</p>
          <p class="text-tiny" :class="availableForAllocation > 0 ? 'text-neon' : 'text-silver-50'">
            {{ availableForAllocation }} disponible{{ availableForAllocation !== 1 ? 's' : '' }}
          </p>
        </div>

        <div class="space-y-2 max-h-[200px] overflow-y-auto">
          <div
              v-for="deck in allDecks"
              :key="deck.id"
              class="flex items-center justify-between p-2 border transition-150"
              :class="getDeckAllocation(deck.id) > 0 ? 'border-neon bg-neon-5' : 'border-silver-20'"
          >
            <!-- Deck info -->
            <div class="flex-1 min-w-0 pr-2">
              <p class="text-small font-bold text-silver truncate">{{ deck.name }}</p>
              <p class="text-tiny text-silver-50">{{ deck.format.toUpperCase() }}</p>
            </div>

            <!-- Quantity controls -->
            <div class="flex items-center gap-1">
              <button
                @click="decrementDeckAllocation(deck.id)"
                :disabled="getDeckAllocation(deck.id) === 0"
                class="w-7 h-7 flex items-center justify-center border border-silver-30 text-silver hover:border-neon hover:text-neon transition-150 disabled:opacity-30"
              >
-
</button>

              <span class="w-6 text-center text-small font-bold" :class="getDeckAllocation(deck.id) > 0 ? 'text-neon' : 'text-silver-50'">
                {{ getDeckAllocation(deck.id) }}
              </span>

              <button
                @click="incrementDeckAllocation(deck.id)"
                class="w-7 h-7 flex items-center justify-center border border-silver-30 text-silver hover:border-neon hover:text-neon transition-150"
              >
+
</button>

              <!-- Sideboard toggle -->
              <button
                v-if="getDeckAllocation(deck.id) > 0"
                @click="toggleSideboard(deck.id)"
                class="ml-1 px-2 py-1 text-tiny border transition-150"
                :class="isInSideboard(deck.id) ? 'border-amber text-amber' : 'border-silver-30 text-silver-50 hover:border-silver'"
              >
                {{ isInSideboard(deck.id) ? 'SB' : 'MB' }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="totalAllocated > 0" class="text-tiny text-silver-50 mt-2 pt-2 border-t border-silver-20">
          Total asignadas: {{ totalAllocated }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton
            class="flex-1"
            :disabled="isLoading || !canSave"
            @click="handleSave"
        >
          {{ isLoading ? 'GUARDANDO...' : 'GUARDAR' }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            :disabled="isLoading"
            @click="handleClose"
        >
          CANCELAR
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.border-neon-30 {
  border-color: rgba(0, 255, 136, 0.3);
}

.bg-neon-5 {
  background-color: rgba(204, 255, 0, 0.05);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
