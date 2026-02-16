<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCollectionStore } from '../../stores/collection'
import { useDecksStore } from '../../stores/decks'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { type CardHistoryPoint, usePriceHistory } from '../../composables/usePriceHistory'
import { useI18n } from '../../composables/useI18n'
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

const { t } = useI18n()

const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const toastStore = useToastStore()
const { getAllocationsForCard } = useCardAllocation()

// ========== STATE ==========

const isLoading = ref(false)
const loadingPrints = ref(false)
const showZoom = ref(false)

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

// ========== PRICE HISTORY CHART ==========
const { loadCardHistory } = usePriceHistory()
const showPriceChart = ref(false)
const chartHistory = ref<CardHistoryPoint[]>([])
const chartLoading = ref(false)
type ChartSource = 'tcg' | 'ck' | 'buylist'
const chartSource = ref<ChartSource>('tcg')

const chartHasData = computed(() => chartHistory.value.length >= 2)

const chartSourceColor = computed(() => {
  if (chartSource.value === 'ck') return '#4CAF50'
  if (chartSource.value === 'buylist') return '#FF9800'
  return '#CCFF00'
})

const chartData = computed(() => {
  return chartHistory.value.map(p => ({
    date: p.date,
    value: chartSource.value === 'ck' ? p.ck : chartSource.value === 'buylist' ? p.buylist : p.tcg,
  }))
})

const chartMinMax = computed(() => {
  if (!chartHasData.value) return { min: 0, max: 100 }
  const values = chartData.value.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = (max - min) * 0.1 || 1
  return { min: min - padding, max: max + padding }
})

const chartSvgW = 300
const chartSvgH = 100
const chartPad = { top: 8, right: 8, bottom: 16, left: 8 }

const chartPolyline = computed(() => {
  if (!chartHasData.value) return ''
  const { min, max } = chartMinMax.value
  const plotW = chartSvgW - chartPad.left - chartPad.right
  const plotH = chartSvgH - chartPad.top - chartPad.bottom
  const data = chartData.value
  return data.map((d, i) => {
    const x = chartPad.left + (i / (data.length - 1)) * plotW
    const y = chartPad.top + plotH - ((d.value - min) / (max - min)) * plotH
    return `${x},${y}`
  }).join(' ')
})

const chartFirstDate = computed(() => {
  const first = chartData.value[0]
  if (!first) return ''
  const [, m, d] = first.date.split('-')
  return `${m}/${d}`
})

const chartLastDate = computed(() => {
  const last = chartData.value[chartData.value.length - 1]
  if (!last) return ''
  const [, m, d] = last.date.split('-')
  return `${m}/${d}`
})

const chartLastValue = computed(() => {
  const last = chartData.value[chartData.value.length - 1]
  if (!last) return ''
  return `$${last.value.toFixed(2)}`
})

async function togglePriceChart() {
  if (showPriceChart.value) {
    showPriceChart.value = false
    return
  }
  if (chartHistory.value.length === 0 && props.card?.scryfallId) {
    chartLoading.value = true
    try {
      chartHistory.value = await loadCardHistory(props.card.scryfallId)
    } catch {
      // silent
    } finally {
      chartLoading.value = false
    }
  }
  showPriceChart.value = true
}

// ========== COMPUTED ==========

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

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

// Large image for zoom view
const zoomImage = computed(() => {
  if (selectedPrint.value) {
    return selectedPrint.value.image_uris?.large ||
           selectedPrint.value.image_uris?.normal ||
           selectedPrint.value.card_faces?.[0]?.image_uris?.large ||
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
    return t('cards.detailModal.validationMinCopy')
  }
  return null
})

// Warning when reducing below allocated (will convert to wishlist)
const allocationWarning = computed(() => {
  const ownedQty = totalQuantity.value - statusDistribution.value.wishlist
  if (ownedQty < totalAllocated.value) {
    const excess = totalAllocated.value - ownedQty
    return t('cards.detailModal.allocationWarning', { excess })
  }
  return null
})

// Show public option when there are cards for sale or trade
const showPublicOption = computed(() => {
  return statusDistribution.value.sale > 0 || statusDistribution.value.trade > 0
})

// ========== METHODS ==========

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
          // Update existing entry - public defaults to true for all statuses
          await collectionStore.updateCard(existingCard.id, {
            quantity: targetQty,
            condition: savedCondition,
            foil: savedFoil,
            scryfallId: newScryfallId,
            edition: newEdition,
            setCode: newSetCode,
            image: newImage,
            price: newPrice,
            public: savedIsPublic,
          })
          if (status !== 'wishlist') {
            updatedCardIds.push(existingCard.id)
          }
        } else {
          // Create new entry for this status - public defaults to true
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
            status,
            public: savedIsPublic,
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

    toastStore.show(t('cards.detailModal.updated'), 'success')
    emit('saved')
    emit('close')
  } catch (err) {
    console.error('Error saving card:', err)
    toastStore.show(t('cards.detailModal.saveError'), 'error')
  } finally {
    isLoading.value = false
  }
}

const handleClose = () => {
  availablePrints.value = []
  selectedPrint.value = null
  relatedCards.value = []
  deckAllocations.value = {}
  showZoom.value = false
  showPriceChart.value = false
  chartHistory.value = []
  chartSource.value = 'tcg'
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
        <h2 class="text-h2 font-bold text-silver mb-1">{{ t('cards.detailModal.title') }}</h2>
        <p class="text-small text-silver-70">{{ t('cards.detailModal.subtitle') }}</p>
      </div>

      <!-- Card Preview -->
      <div v-if="card" class="flex flex-col sm:flex-row gap-4">
        <!-- Image (clickable for zoom) -->
        <div class="flex-shrink-0 mx-auto sm:mx-0">
          <button
              v-if="currentImage"
              @click="showZoom = true"
              class="relative group cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-neon rounded"
          >
            <img
                :src="currentImage"
                :alt="card.name"
                class="w-28 sm:w-32 aspect-[2/3] object-cover border border-silver-30 rounded group-hover:border-neon transition-colors"
            />
            <div class="absolute inset-0 bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
              <span class="text-tiny text-silver font-bold">🔍 Zoom</span>
            </div>
          </button>
          <div v-else class="w-28 sm:w-32 aspect-[2/3] bg-primary border border-silver-30 flex items-center justify-center rounded">
            <span class="text-tiny text-silver-50">{{ t('cards.detailModal.noImage') }}</span>
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 space-y-3">
          <div>
            <p class="font-bold text-silver text-h3">{{ card.name }}</p>

            <!-- Multi-source prices -->
            <div class="mt-2 space-y-1">
              <div class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">TCG:</span>
                <span class="text-body font-bold text-neon">${{ currentPrice.toFixed(2) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">CK:</span>
                <span v-if="hasCardKingdomPrices" class="text-body font-bold text-[#4CAF50]">{{ formatPrice(cardKingdomRetail) }}</span>
                <span v-else-if="loadingCKPrices" class="text-small text-silver-50">...</span>
                <span v-else class="text-small text-silver-50">-</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">BL:</span>
                <span v-if="cardKingdomBuylist" class="text-body font-bold text-[#FF9800]">{{ formatPrice(cardKingdomBuylist) }}</span>
                <span v-else class="text-small text-silver-50">-</span>
              </div>
            </div>

            <!-- Price History Toggle -->
            <div class="mt-2">
              <button
                @click="togglePriceChart"
                class="flex items-center gap-1 text-tiny text-silver-50 hover:text-silver transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <span>{{ t('cards.detailModal.priceHistory.toggle') }}</span>
                <span class="text-[10px]">{{ showPriceChart ? '▲' : '▼' }}</span>
              </button>

              <!-- Chart panel -->
              <div v-if="showPriceChart" class="mt-2">
                <div v-if="chartLoading" class="flex items-center justify-center h-[60px]">
                  <span class="text-tiny text-silver-50 animate-pulse">...</span>
                </div>
                <div v-else-if="!chartHasData" class="text-tiny text-silver-50 py-2">
                  {{ t('cards.detailModal.priceHistory.noData') }}
                </div>
                <div v-else>
                  <!-- Source selector -->
                  <div class="flex items-center gap-1 mb-1">
                    <button
                      v-for="src in (['tcg', 'ck', 'buylist'] as ChartSource[])"
                      :key="src"
                      @click="chartSource = src"
                      :class="[
                        'px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors uppercase',
                        chartSource === src
                          ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                          : 'text-silver-50 hover:text-silver hover:bg-silver-5'
                      ]"
                    >
                      {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'BUY' }}
                    </button>
                  </div>

                  <!-- SVG Chart -->
                  <svg
                    :viewBox="`0 0 ${chartSvgW} ${chartSvgH}`"
                    class="w-full h-[100px]"
                    preserveAspectRatio="none"
                  >
                    <line
                      :x1="chartPad.left" :y1="chartPad.top"
                      :x2="chartSvgW - chartPad.right" :y2="chartPad.top"
                      stroke="#333" stroke-width="0.5"
                    />
                    <line
                      :x1="chartPad.left" :y1="chartSvgH - chartPad.bottom"
                      :x2="chartSvgW - chartPad.right" :y2="chartSvgH - chartPad.bottom"
                      stroke="#333" stroke-width="0.5"
                    />
                    <polyline
                      :points="chartPolyline"
                      fill="none"
                      :stroke="chartSourceColor"
                      stroke-width="2"
                      stroke-linejoin="round"
                      stroke-linecap="round"
                    />
                  </svg>

                  <!-- Labels -->
                  <div class="flex items-center justify-between text-[10px] text-silver-50 -mt-1">
                    <span>{{ chartFirstDate }}</span>
                    <span class="font-bold" :style="{ color: chartSourceColor }">{{ chartLastValue }}</span>
                    <span>{{ chartLastDate }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Print Selector -->
          <div v-if="availablePrints.length > 1">
            <label for="detail-print-select" class="text-tiny text-silver-70 block mb-1">{{ t('cards.detailModal.editionPrintLabel') }}</label>
            <select
                id="detail-print-select"
                :value="selectedPrint?.id"
                @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-mono text-small focus:outline-none focus:border-neon transition-150 rounded"
            >
              <option
                  v-for="print in availablePrints"
                  :key="print.id"
                  :value="print.id"
              >
                {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd || 'N/A' }}
              </option>
            </select>
            <p class="text-tiny text-silver-50 mt-1">{{ t('cards.detailModal.printsAvailable', { count: availablePrints.length }) }}</p>
          </div>
          <p v-else-if="loadingPrints" class="text-tiny text-silver-50">{{ t('cards.detailModal.loadingPrints') }}</p>
        </div>
      </div>

      <!-- Status Distribution -->
      <div class="bg-secondary border border-silver-30 p-4 rounded">
        <div class="flex justify-between items-center mb-3">
          <p class="text-small font-bold text-silver">{{ t('cards.detailModal.distribution') }}</p>
          <p class="text-small text-neon font-bold">{{ t('cards.detailModal.totalLabel', { qty: totalQuantity }) }}</p>
        </div>

        <div class="space-y-2">
          <!-- Collection -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-neon">✓</span>
              <span class="text-small text-silver">{{ t('common.status.collection') }}</span>
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
              <span class="text-small text-silver">{{ t('common.status.sale') }}</span>
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
              <span class="text-small text-silver">{{ t('common.status.trade') }}</span>
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
              <span class="text-small text-silver">{{ t('common.status.wishlist') }}</span>
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
              <span class="text-small text-silver">{{ t('cards.statusModal.publishLabel') }}</span>
              <p class="text-tiny text-silver-50">{{ t('cards.statusModal.publishHint') }}</p>
            </div>
          </label>
        </div>
      </div>

      <!-- Condition & Foil -->
      <div class="bg-secondary border border-silver-30 p-4 space-y-4 rounded">
        <p class="text-small font-bold text-silver">{{ t('cards.detailModal.properties') }}</p>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="detail-condition" class="text-tiny text-silver-70 block mb-1">{{ t('cards.detailModal.conditionLabel') }}</label>
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
              <span class="text-small text-silver">{{ t('cards.detailModal.foilLabel') }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Deck Allocations -->
      <div v-if="allDecks.length > 0" class="bg-secondary border border-silver-30 p-4 rounded">
        <div class="flex justify-between items-center mb-3">
          <p class="text-small font-bold text-silver">{{ t('cards.detailModal.assignToDecks') }}</p>
          <p class="text-tiny" :class="availableForAllocation > 0 ? 'text-neon' : 'text-silver-50'">
            {{ t('cards.detailModal.available', { qty: availableForAllocation }) }}
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
                {{ isInSideboard(deck.id) ? t('cards.detailModal.sideboardToggle.sideboard') : t('cards.detailModal.sideboardToggle.mainboard') }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="totalAllocated > 0" class="text-tiny text-silver-50 mt-2 pt-2 border-t border-silver-20">
          {{ t('cards.detailModal.totalAssigned', { qty: totalAllocated }) }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton
            class="flex-1"
            :disabled="isLoading || !canSave"
            @click="handleSave"
        >
          {{ isLoading ? t('common.actions.saving') : t('common.actions.save') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            :disabled="isLoading"
            @click="handleClose"
        >
          {{ t('common.actions.cancel') }}
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
            :alt="card?.name"
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
