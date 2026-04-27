<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCollectionStore } from '../../stores/collection'
import { useDecksStore } from '../../stores/decks'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { type CardHistoryPoint, usePriceHistory } from '../../composables/usePriceHistory'
import { useI18n } from '../../composables/useI18n'
import { type ScryfallCard, searchCards } from '../../services/scryfall'
import { cleanCardName } from '../../utils/cardHelpers'
import { type CardIdentity, computeStatusOperations } from '../../utils/cardSaveDiff'
import { buildOriginalSlots, computeDeckSlotOps, type DeckSlot } from '../../utils/deckSlotDiff'
import BaseButton from '../ui/BaseButton.vue'
import SvgIcon from '../ui/SvgIcon.vue'
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
const cardFaceIndex = ref(0)

// Print selection
const availablePrints = ref<ScryfallCard[]>([])
const selectedPrint = ref<ScryfallCard | null>(null)

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

// SCRUM-35 D2: Deck allocations matrix per deck — { mb, sb }. Each slot represents the
// TOTAL qty (owned + wishlist) assigned to that board location. allocateCardToDeck splits
// owned vs wishlist automatically based on availability, so the modal only edits totals.
const deckAllocations = ref<Record<string, DeckSlot>>({})

// Card Kingdom prices
const {
  loading: loadingCKPrices,
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => selectedPrint.value?.id ?? props.card?.scryfallId,
  () => selectedPrint.value?.set ?? props.card?.setCode
)

// ========== PRICE HISTORY CHART ==========
const { loadCardHistory } = usePriceHistory()
const showPriceChart = ref(false)
const chartHistory = ref<CardHistoryPoint[]>([])
const chartLoading = ref(false)
type ChartSource = 'tcg' | 'ck' | 'buylist'
const chartSource = ref<ChartSource>('ck')

const chartHasData = computed(() => chartHistory.value.length >= 2)

const chartSourceColor = computed(() => {
  if (chartSource.value === 'ck') return '#4CAF50'
  if (chartSource.value === 'buylist') return '#FF9800'
  return '#5AC168'
})

const getChartValue = (p: { ck: number; buylist: number; tcg: number }) => {
  if (chartSource.value === 'ck') return p.ck
  if (chartSource.value === 'buylist') return p.buylist
  return p.tcg
}

const chartData = computed(() => {
  return chartHistory.value.map(p => ({
    date: p.date,
    value: getChartValue(p),
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

// Card type line from selected print or original card
const cardTypeLine = computed(() => {
  return selectedPrint.value?.type_line ?? props.card?.type_line ?? ''
})

// Total quantity across all statuses
const totalQuantity = computed(() => {
  return Object.values(statusDistribution.value).reduce((sum, qty) => sum + qty, 0)
})

// Split card detection and face toggle
const isSplitCard = computed(() => {
  if (selectedPrint.value?.card_faces && selectedPrint.value.card_faces.length > 1) {
    return selectedPrint.value.card_faces.filter(f => f.image_uris).length > 1
  }
  // Fallback: check card.image JSON for card_faces
  if (props.card?.image) {
    try {
      const parsed = JSON.parse(props.card.image) as { card_faces?: { image_uris?: Record<string, string> }[] }
      return !!(parsed.card_faces && parsed.card_faces.length > 1)
    } catch { /* plain URL */ }
  }
  return false
})

const toggleCardFace = () => {
  if (isSplitCard.value) {
    cardFaceIndex.value = cardFaceIndex.value === 0 ? 1 : 0
  }
}

// Current image from selected print or original card
const currentImage = computed(() => {
  if (selectedPrint.value) {
    const face = selectedPrint.value.card_faces?.[cardFaceIndex.value]
    if (face?.image_uris?.normal) return face.image_uris.normal
    return selectedPrint.value.image_uris?.normal
           ?? selectedPrint.value.card_faces?.[0]?.image_uris?.normal ?? ''
  }
  // Fallback: parse card.image JSON for card_faces
  if (props.card?.image) {
    try {
      const parsed = JSON.parse(props.card.image) as { card_faces?: { image_uris?: Record<string, string> }[] }
      if (parsed.card_faces?.[cardFaceIndex.value]?.image_uris?.normal) {
        return parsed.card_faces[cardFaceIndex.value]!.image_uris!.normal!
      }
    } catch { /* plain URL */ }
  }
  return props.card?.image ?? ''
})

// Large image for zoom view
const zoomImage = computed(() => {
  if (selectedPrint.value) {
    const face = selectedPrint.value.card_faces?.[cardFaceIndex.value]
    if (face?.image_uris) return face.image_uris.large ?? face.image_uris.normal ?? ''
    return selectedPrint.value.image_uris?.large
           ?? selectedPrint.value.image_uris?.normal
           ?? selectedPrint.value.card_faces?.[0]?.image_uris?.large
           ?? selectedPrint.value.card_faces?.[0]?.image_uris?.normal ?? ''
  }
  if (props.card?.image) {
    try {
      const parsed = JSON.parse(props.card.image) as { card_faces?: { image_uris?: Record<string, string> }[] }
      const face = parsed.card_faces?.[cardFaceIndex.value]
      if (face?.image_uris) return face.image_uris.large ?? face.image_uris.normal ?? ''
    } catch { /* plain URL */ }
  }
  return props.card?.image ?? ''
})

// Current price from selected print or original card (prefer CK)
const currentPrice = computed(() => {
  if (cardKingdomRetail.value != null) {
    return cardKingdomRetail.value
  }
  if (selectedPrint.value?.prices?.usd) {
    return Number.parseFloat(selectedPrint.value.prices.usd)
  }
  return props.card?.price ?? 0
})

// All available decks
const allDecks = computed(() => decksStore.decks)

// Total allocated from deckAllocations state (mb + sb across all decks)
const totalAllocated = computed(() => {
  return Object.values(deckAllocations.value).reduce((sum, slot) => sum + slot.mb + slot.sb, 0)
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
  return statusDistribution.value.sale > 0 || statusDistribution.value.trade > 0 || statusDistribution.value.wishlist > 0
})

// ========== METHODS ==========

// Initialize form when modal opens
const initializeForm = async () => {
  if (!props.card) return

  // Get fresh card data from store (props.card might be stale reference)
  const freshCard = collectionStore.cards.find(c => c.id === props.card?.id) ?? props.card

  // SCRUM-35 D: identidad relajada por (scryfallId, condition, foil). scryfallId ya
  // identifica el print de forma única en MTG real. Filtrar por edition aquí escondía
  // duplicados legacy con edition mismatched ("ECL" vs "Lorwyn Eclipsed") creados por
  // bug previo, que aparecían como "missing" en el modal y se re-creaban al guardar.
  // Phase B1 (NM vs LP isolation) sigue intacta porque condition/foil siguen estrictos.
  relatedCards.value = collectionStore.cards.filter(c =>
    c.scryfallId === freshCard.scryfallId &&
    c.condition === freshCard.condition &&
    c.foil === freshCard.foil
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
  isPublic.value = freshCard.public ?? false

  // SCRUM-35 D2: load deck allocations as { mb, sb } slots per deck. Sums across ALL
  // related cards (owned rows + wishlist rows) since they share the same physical card
  // identity. The previous flat { quantity, isInSideboard } shape collapsed mb+sb into
  // a single bucket and lost half the allocation data on save.
  deckAllocations.value = {}
  for (const card of relatedCards.value) {
    const allocations = getAllocationsForCard(card.id)
    for (const alloc of allocations) {
      const cur = deckAllocations.value[alloc.deckId] ?? { mb: 0, sb: 0 }
      if (alloc.isInSideboard) cur.sb += alloc.quantity
      else cur.mb += alloc.quantity
      deckAllocations.value[alloc.deckId] = cur
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
    selectedPrint.value = currentPrint ?? results[0] ?? null
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
  // eslint-disable-next-line security/detect-object-injection
  const newValue = statusDistribution.value[status] + delta
  if (newValue >= 0) {
    // eslint-disable-next-line security/detect-object-injection
    statusDistribution.value[status] = newValue
  }
}

// ========== DECK ALLOCATION METHODS ==========

// SCRUM-35 D2: per-slot getters/mutators. Each deck has independent mb and sb counters.
type Board = 'mb' | 'sb'

const getSlotQty = (deckId: string, board: Board): number => {
  // eslint-disable-next-line security/detect-object-injection
  return deckAllocations.value[deckId]?.[board] ?? 0
}

const adjustSlot = (deckId: string, board: Board, delta: number) => {
  // eslint-disable-next-line security/detect-object-injection
  const cur = deckAllocations.value[deckId] ?? { mb: 0, sb: 0 }
  // eslint-disable-next-line security/detect-object-injection
  const next = Math.max(0, cur[board] + delta)
  const updated = { ...cur, [board]: next }
  if (updated.mb === 0 && updated.sb === 0) {
    // eslint-disable-next-line security/detect-object-injection
    delete deckAllocations.value[deckId]
  } else {
    // eslint-disable-next-line security/detect-object-injection
    deckAllocations.value[deckId] = updated
  }
}

const getDeckTotal = (deckId: string): number => {
  // eslint-disable-next-line security/detect-object-injection
  const slot = deckAllocations.value[deckId]
  return slot ? slot.mb + slot.sb : 0
}

// SCRUM-35 fix: aplica ops calculadas por computeStatusOperations (util pura).
// Cada op opera sobre la fila exacta (scryfallId, edition, condition, foil, status).
// Devuelve mapping status → cardId para que el sync de allocations sepa cuál usar.
const applyStatusOperations = async (
  ops: ReturnType<typeof computeStatusOperations>,
  cardData: { name: string; scryfallId: string; edition: string; setCode: string; image: string; price: number; condition: CardCondition; foil: boolean; isPublic: boolean },
): Promise<Record<CardStatus, string | null>> => {
  const idsByStatus: Record<CardStatus, string | null> = { collection: null, sale: null, trade: null, wishlist: null }
  // SCRUM-35 D: snapshot canonical id por status — ignora edition (identidad relajada)
  // para que survive cards con edition stale legacy. Prefiere la fila con edition
  // canónica si existe; si todas son stale, agarra la primera (que será actualizada
  // por la op de update con cardData.edition canónica → self-heal).
  for (const status of ['collection', 'sale', 'trade', 'wishlist'] as CardStatus[]) {
    // eslint-disable-next-line security/detect-object-injection
    const matches = collectionStore.cards.filter(c =>
      c.status === status &&
      c.scryfallId === cardData.scryfallId &&
      c.condition === cardData.condition &&
      c.foil === cardData.foil
    )
    const canonical = matches.find(c => c.edition === cardData.edition) ?? matches[0]
    // eslint-disable-next-line security/detect-object-injection
    if (canonical) idsByStatus[status] = canonical.id
  }
  for (const op of ops) {
    if (op.type === 'delete' && op.cardId) {
      await collectionStore.deleteCard(op.cardId)
      // eslint-disable-next-line security/detect-object-injection
      idsByStatus[op.status] = null
    } else if (op.type === 'update' && op.cardId) {
      await collectionStore.updateCard(op.cardId, {
        quantity: op.quantity, condition: cardData.condition, foil: cardData.foil,
        scryfallId: cardData.scryfallId, edition: cardData.edition, setCode: cardData.setCode,
        image: cardData.image, price: cardData.price, public: cardData.isPublic,
      })
      // eslint-disable-next-line security/detect-object-injection
      idsByStatus[op.status] = op.cardId
    } else if (op.type === 'create') {
      const newId = await collectionStore.addCard({
        scryfallId: cardData.scryfallId, name: cardData.name, edition: cardData.edition,
        setCode: cardData.setCode, quantity: op.quantity, condition: cardData.condition,
        foil: cardData.foil, price: cardData.price, image: cardData.image, status: op.status, public: cardData.isPublic,
      })
      // eslint-disable-next-line security/detect-object-injection
      if (newId) idsByStatus[op.status] = newId
    }
  }
  return idsByStatus
}

// SCRUM-35 D2: snapshot allocations grouped by (deckId × board) across ALL related
// cards (owned + wishlist). The previous version filtered out wishlist rows and
// collapsed mb/sb into a single bucket, losing data on save.
const buildOriginalSlotsForRelated = (savedRelatedCards: Card[]): Map<string, DeckSlot> => {
  const allocsByCardId = new Map<string, readonly { deckId: string; quantity: number; isInSideboard: boolean }[]>()
  for (const card of savedRelatedCards) {
    allocsByCardId.set(card.id, getAllocationsForCard(card.id))
  }
  return buildOriginalSlots(savedRelatedCards.map(c => c.id), allocsByCardId)
}

// Save changes
const handleSave = async () => {
  if (isLoading.value) return
  isLoading.value = true

  if (!props.card || !canSave.value) {
    isLoading.value = false
    return
  }

  try {
    const savedCard = props.card
    const savedDistribution = { ...statusDistribution.value }
    const savedRelatedCards = [...relatedCards.value]
    const savedTotalAllocated = totalAllocated.value

    const cardData = {
      name: savedCard.name,
      scryfallId: selectedPrint.value?.id ?? savedCard.scryfallId,
      edition: selectedPrint.value?.set_name ?? savedCard.edition,
      setCode: selectedPrint.value?.set?.toUpperCase() ?? savedCard.setCode ?? '',
      image: currentImage.value,
      price: currentPrice.value,
      condition: condition.value,
      foil: foil.value,
      isPublic: isPublic.value,
    }

    // SCRUM-35: identidad estricta. Diff calculado por util pura (cardSaveDiff.ts).
    // Identidad = (scryfallId, edition, condition, foil) — del print/condition NUEVOS si
    // el usuario cambio en el modal, no del savedCard original.
    const identity: CardIdentity = {
      scryfallId: cardData.scryfallId,
      edition: cardData.edition,
      condition: cardData.condition,
      foil: cardData.foil,
    }

    const newOwnedQty = savedDistribution.collection + savedDistribution.sale + savedDistribution.trade

    // SCRUM-35 D2: snapshot per-deck (mb, sb) totals BEFORE any mutation. We sum
    // across ALL related cards (owned + wishlist) since they share identity. This is
    // the original truth that the diff compares against.
    const originalSlots = buildOriginalSlotsForRelated(savedRelatedCards)

    // STEP 1: reduce deck allocations if owned drops below allocated (owned path only).
    if (savedCard.status !== 'wishlist' && newOwnedQty < savedTotalAllocated) {
      await decksStore.reduceAllocationsForCard(savedCard, newOwnedQty)
    }

    // STEP 2: apply status diff. Strict identity per (scryfallId, edition, condition, foil)
    // with print-relaxed self-heal for legacy duplicates (see cardSaveDiff.ts).
    const ops = computeStatusOperations(savedDistribution, identity, collectionStore.cards)
    const idsByStatus = await applyStatusOperations(ops, cardData)

    // SCRUM-35 D2: STEP 3 unified — diff (mb, sb) per deck and dispatch ops.
    // ownedCardId prefers collection > sale > trade > wishlist (any cardId works as
    // the destination — allocateCardToDeck splits owned/wishlist via card.quantity).
    // We deallocate ALL related cardIds for any board that changed so legacy rows
    // (post-Fase D dupes still mid-flight, wishlist rows from prior bugs) get cleaned.
    const ownedCardId =
      idsByStatus.collection ??
      idsByStatus.sale ??
      idsByStatus.trade ??
      idsByStatus.wishlist ??
      null
    const relatedCardIdsAfterStep2 = Array.from(new Set([
      ...savedRelatedCards.map(c => c.id),
      ...Object.values(idsByStatus).filter((v): v is string => !!v),
    ]))
    const slotOps = computeDeckSlotOps({
      decks: allDecks.value.map(d => ({ deckId: d.id })),
      originalSlots,
      targetSlots: deckAllocations.value,
      relatedCardIds: relatedCardIdsAfterStep2,
      ownedCardId,
    })
    for (const op of slotOps) {
      if (op.type === 'deallocate') {
        await decksStore.deallocateCard(op.deckId, op.cardId, op.isInSideboard)
      } else {
        await decksStore.allocateCardToDeck(op.deckId, op.cardId, op.quantity, op.isInSideboard)
      }
    }

    // NOTE: do NOT call collectionStore.loadCollection() here.
    // Each individual op (addCard, updateCard, deleteCard, ensureCollectionWishlistCard)
    // already applies optimistic updates to cards.value in-place.
    // loadCollection() reads from the Firestore card_index which is rebuilt by a Cloud
    // Function — it lags behind and would wipe freshly-created wishlist cards from
    // cards.value, turning deck allocation references into dangling pointers and causing
    // the xN badge to drop back to the owned-only count. (SCRUM-36 Part 8)
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
  cardFaceIndex.value = 0
  showPriceChart.value = false
  chartHistory.value = []
  chartSource.value = 'tcg'
  emit('close')
}

// ========== WATCHERS ==========

watch(() => props.show, (show) => {
  if (show && props.card) {
    void initializeForm()
  }
}, { immediate: true })

// Fetch CK prices when print changes
watch(selectedPrint, (print: ScryfallCard | null) => {
  if (print?.id && print?.set) {
    void fetchCKPrices()
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
              class="relative group cursor-zoom-in focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded"
          >
            <img
                :src="currentImage"
                :alt="card.name"
                loading="lazy"
                class="w-28 sm:w-32 aspect-[2/3] object-cover border border-silver-30 rounded group-hover:border-neon transition-colors"
            />
            <div class="absolute inset-0 bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
              <span class="text-tiny text-silver font-bold">🔍 Zoom</span>
            </div>
            <!-- Flip button for dual-faced cards -->
            <button
                v-if="isSplitCard"
                @click.stop="toggleCardFace"
                class="absolute top-1 left-1 bg-primary/90 border border-neon px-1.5 py-0.5 hover:bg-neon/20 transition-all rounded z-10"
                :title="t('cards.grid.flipTitle')"
            >
              <SvgIcon name="flip" size="tiny" />
            </button>
          </button>
          <div v-else class="w-28 sm:w-32 aspect-[2/3] bg-primary border border-silver-30 flex items-center justify-center rounded">
            <span class="text-tiny text-silver-50">{{ t('cards.detailModal.noImage') }}</span>
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 space-y-3">
          <div>
            <p class="font-bold text-silver text-h3">{{ card.name }}</p>
            <p v-if="cardTypeLine" class="text-tiny text-silver-50 mt-0.5">{{ cardTypeLine }}</p>

            <!-- Multi-source prices -->
            <div class="mt-2 space-y-1">
              <div class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">CK:</span>
                <span v-if="hasCardKingdomPrices" class="text-body font-bold text-neon">{{ formatPrice(cardKingdomRetail) }}</span>
                <span v-else-if="loadingCKPrices" class="text-small text-silver-50">...</span>
                <span v-else class="text-small text-silver-50">-</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">TCG:</span>
                <span class="text-body text-silver">${{ (props.card?.price ?? 0).toFixed(2) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">BL:</span>
                <span v-if="cardKingdomBuylist" class="text-body font-bold text-silver">{{ formatPrice(cardKingdomBuylist) }}</span>
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
                <span class="text-[14px]">{{ showPriceChart ? '▲' : '▼' }}</span>
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
                        'px-1.5 py-0.5 text-[14px] font-bold rounded transition-colors uppercase',
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
                  <div class="flex items-center justify-between text-[14px] text-silver-50 -mt-1">
                    <span>{{ chartFirstDate }}</span>
                    <span class="font-bold" :style="{ color: chartSourceColor }">{{ chartLastValue }}</span>
                    <span>{{ chartLastDate }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edition / Print Selector -->
      <div v-if="availablePrints.length > 1" class="bg-secondary border border-silver-30 p-4 rounded">
        <p class="text-small font-bold text-silver mb-2">{{ t('cards.detailModal.editionPrintLabel') }}</p>
        <select
            id="detail-print-select"
            :value="selectedPrint?.id"
            @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
            class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-sans text-small focus:outline-none focus:border-neon focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary transition-150 rounded"
        >
          <option
              v-for="print in availablePrints"
              :key="print.id"
              :value="print.id"
          >
            {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd ?? 'N/A' }}
          </option>
        </select>
        <p class="text-tiny text-silver-50 mt-1">{{ t('cards.detailModal.printsAvailable', { count: availablePrints.length }) }}</p>
      </div>
      <p v-else-if="loadingPrints" class="text-tiny text-silver-50">{{ t('cards.detailModal.loadingPrints') }}</p>

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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="text-neon flex-shrink-0"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
                class="w-8 h-8 bg-neon text-primary font-bold border border-neon hover:brightness-110 transition-150 rounded"
              >
+
</button>
            </div>
          </div>

          <!-- Sale -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="text-yellow-400 flex-shrink-0"><circle cx="12" cy="12" r="10"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="#000">$</text></svg>
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
                class="w-8 h-8 bg-neon text-primary font-bold border border-neon hover:brightness-110 transition-150 rounded"
              >
+
</button>
            </div>
          </div>

          <!-- Trade -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400 flex-shrink-0"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
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
                class="w-8 h-8 bg-neon text-primary font-bold border border-neon hover:brightness-110 transition-150 rounded"
              >
+
</button>
            </div>
          </div>

          <!-- Wishlist -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-400 flex-shrink-0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
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
                class="w-8 h-8 bg-neon text-primary font-bold border border-neon hover:brightness-110 transition-150 rounded"
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
      </div>

      <!-- Publish to Profile -->
      <div v-if="showPublicOption" class="bg-secondary border border-silver-30 p-4 rounded">
        <label class="flex items-center gap-3 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neon flex-shrink-0">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <div class="flex-1">
            <span class="text-small text-silver font-bold">{{ t('cards.statusModal.publishLabel') }}</span>
            <p class="text-tiny text-silver-50">{{ t('cards.statusModal.publishHint') }}</p>
          </div>
          <input
              v-model="isPublic"
              type="checkbox"
              class="w-4 h-4 cursor-pointer flex-shrink-0"
          />
        </label>
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
              class="flex items-center justify-between p-2 border transition-150 gap-2"
              :class="getDeckTotal(deck.id) > 0 ? 'border-neon bg-neon-5' : 'border-silver-20'"
          >
            <!-- Deck info -->
            <div class="flex-1 min-w-0 pr-2">
              <p class="text-small font-bold text-silver truncate">{{ deck.name }}</p>
              <p class="text-tiny text-silver-50">{{ deck.format.toUpperCase() }}</p>
            </div>

            <!-- MB / SB slot controls -->
            <div class="flex items-center gap-3">
              <div class="flex flex-col items-center">
                <span class="text-tiny text-silver-50 font-bold mb-0.5">{{ t('cards.detailModal.slotMb') }}</span>
                <div class="flex items-center gap-1">
                  <button
                    @click="adjustSlot(deck.id, 'mb', -1)"
                    :disabled="getSlotQty(deck.id, 'mb') === 0"
                    class="w-6 h-6 flex items-center justify-center border border-silver-30 text-silver hover:border-neon hover:text-neon transition-150 disabled:opacity-30 text-tiny"
                  >
-
</button>
                  <span class="w-5 text-center text-small font-bold" :class="getSlotQty(deck.id, 'mb') > 0 ? 'text-neon' : 'text-silver-50'">
                    {{ getSlotQty(deck.id, 'mb') }}
                  </span>
                  <button
                    @click="adjustSlot(deck.id, 'mb', 1)"
                    class="w-6 h-6 flex items-center justify-center bg-neon text-primary font-bold border border-neon hover:brightness-110 transition-150 rounded text-tiny"
                  >
+
</button>
                </div>
              </div>

              <div class="flex flex-col items-center">
                <span class="text-tiny text-silver-50 font-bold mb-0.5">{{ t('cards.detailModal.slotSb') }}</span>
                <div class="flex items-center gap-1">
                  <button
                    @click="adjustSlot(deck.id, 'sb', -1)"
                    :disabled="getSlotQty(deck.id, 'sb') === 0"
                    class="w-6 h-6 flex items-center justify-center border border-silver-30 text-silver hover:border-amber hover:text-amber transition-150 disabled:opacity-30 text-tiny"
                  >
-
</button>
                  <span class="w-5 text-center text-small font-bold" :class="getSlotQty(deck.id, 'sb') > 0 ? 'text-amber' : 'text-silver-50'">
                    {{ getSlotQty(deck.id, 'sb') }}
                  </span>
                  <button
                    @click="adjustSlot(deck.id, 'sb', 1)"
                    class="w-6 h-6 flex items-center justify-center bg-amber text-primary font-bold border border-amber hover:brightness-110 transition-150 rounded text-tiny"
                  >
+
</button>
                </div>
              </div>
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
            loading="lazy"
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
  border-color: rgba(90, 193, 104, 0.3);
}

.bg-neon-5 {
  background-color: rgba(90, 193, 104, 0.05);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
