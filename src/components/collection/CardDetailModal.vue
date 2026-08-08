<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBindersStore } from '../../stores/binders'
import { useCollectionStore } from '../../stores/collection'
import { useDecksStore } from '../../stores/decks'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { type CardHistoryPoint, usePriceHistory } from '../../composables/usePriceHistory'
import { useI18n } from '../../composables/useI18n'
import { type ScryfallCard, searchCards } from '../../services/scryfall'
import { cleanCardName } from '../../utils/cardHelpers'
import { buildOriginalBinderSlots, computeBinderSlotOps } from '../../utils/binderSlotDiff'
import { type CardIdentity, computeStatusOperations } from '../../utils/cardSaveDiff'
import { buildOriginalSlots, computeDeckSlotOps, type DeckSlot } from '../../utils/deckSlotDiff'
import BaseButton from '../ui/BaseButton.vue'
import IconV2 from '../ui/IconV2.vue'
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

const bindersStore = useBindersStore()
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

// SCRUM-40 (QA gap): per-binder totals. Binders have no mb/sb, just one quantity per binder.
// Mirrors deckAllocations shape but flat. Save flow: STEP 3.5 diffs vs original and applies
// allocate/deallocate ops via bindersStore.
const binderAllocations = ref<Record<string, number>>({})

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

// All available binders (SCRUM-40)
const allBinders = computed(() => bindersStore.binders)

// Total allocated from deckAllocations state (mb + sb across all decks) + binder allocations
const totalAllocated = computed(() => {
  const deckTotal = Object.values(deckAllocations.value).reduce((sum, slot) => sum + slot.mb + slot.sb, 0)
  const binderTotal = Object.values(binderAllocations.value).reduce((sum, qty) => sum + qty, 0)
  return deckTotal + binderTotal
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
  // SCRUM-40 (QA gap): useCardAllocation merges deck+binder allocations into one map keyed
  // by the SAME deckId field (binders also use it). Split them up front using bindersStore
  // ids to avoid binder allocs ending up in deckAllocations[binderId] (orphaned, never saved).
  deckAllocations.value = {}
  binderAllocations.value = {}
  const binderIds = new Set(bindersStore.binders.map(b => b.id))
  for (const card of relatedCards.value) {
    const allocations = getAllocationsForCard(card.id)
    for (const alloc of allocations) {
      if (binderIds.has(alloc.deckId)) {
        binderAllocations.value[alloc.deckId] = (binderAllocations.value[alloc.deckId] ?? 0) + alloc.quantity
      } else {
        const cur = deckAllocations.value[alloc.deckId] ?? { mb: 0, sb: 0 }
        if (alloc.isInSideboard) cur.sb += alloc.quantity
        else cur.mb += alloc.quantity
        deckAllocations.value[alloc.deckId] = cur
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

// SCRUM-40 (QA gap): per-binder getter/mutator. Each binder has 1 quantity slot.
const getBinderQty = (binderId: string): number => {
  // eslint-disable-next-line security/detect-object-injection
  return binderAllocations.value[binderId] ?? 0
}

const adjustBinder = (binderId: string, delta: number) => {
  // eslint-disable-next-line security/detect-object-injection
  const cur = binderAllocations.value[binderId] ?? 0
  const next = Math.max(0, cur + delta)
  if (next === 0) {
    // eslint-disable-next-line security/detect-object-injection
    delete binderAllocations.value[binderId]
  } else {
    // eslint-disable-next-line security/detect-object-injection
    binderAllocations.value[binderId] = next
  }
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
// SCRUM-40 (QA gap): excludes binder ids — those go via buildOriginalBinderSlotsForRelated.
const buildOriginalSlotsForRelated = (savedRelatedCards: Card[]): Map<string, DeckSlot> => {
  const binderIds = new Set(bindersStore.binders.map(b => b.id))
  const allocsByCardId = new Map<string, readonly { deckId: string; quantity: number; isInSideboard: boolean }[]>()
  for (const card of savedRelatedCards) {
    const onlyDecks = getAllocationsForCard(card.id).filter(a => !binderIds.has(a.deckId))
    allocsByCardId.set(card.id, onlyDecks)
  }
  return buildOriginalSlots(savedRelatedCards.map(c => c.id), allocsByCardId)
}

// SCRUM-40 (QA gap): snapshot binder allocations per binder across ALL related cards.
const buildOriginalBinderSlotsForRelated = (savedRelatedCards: Card[]): Map<string, number> => {
  const binderIds = new Set(bindersStore.binders.map(b => b.id))
  const allocsByCardId = new Map<string, { binderId: string; quantity: number }[]>()
  for (const card of savedRelatedCards) {
    const onlyBinders = getAllocationsForCard(card.id)
      .filter(a => binderIds.has(a.deckId))
      .map(a => ({ binderId: a.deckId, quantity: a.quantity }))
    allocsByCardId.set(card.id, onlyBinders)
  }
  return buildOriginalBinderSlots(savedRelatedCards.map(c => c.id), allocsByCardId)
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

    // SCRUM-40 (QA gap): snapshot per-binder totals BEFORE mutation, same shape as deck slots.
    const originalBinderSlots = buildOriginalBinderSlotsForRelated(savedRelatedCards)

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

    // SCRUM-40 (QA gap): STEP 3.5 — diff per-binder totals and dispatch ops via bindersStore.
    // Same pattern as deck slots: deallocate ALL related cardIds for a binder when total
    // changed, then re-allocate target qty against ownedCardId. Binders cap at available
    // collection qty internally — STEP 2 already updated collection above, so the cap reflects
    // the new owned total.
    const binderSlotOps = computeBinderSlotOps({
      binders: allBinders.value.map(b => ({ binderId: b.id })),
      originalSlots: originalBinderSlots,
      targetSlots: binderAllocations.value,
      relatedCardIds: relatedCardIdsAfterStep2,
      ownedCardId,
    })
    for (const op of binderSlotOps) {
      if (op.type === 'deallocate') {
        await bindersStore.deallocateCard(op.binderId, op.cardId)
      } else {
        await bindersStore.allocateCardToBinder(op.binderId, op.cardId, op.quantity)
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
  binderAllocations.value = {}
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
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('cards.detailModal.title') }}</h2>
        <p class="text-small text-silver-50 mt-1">{{ t('cards.detailModal.subtitle') }}</p>
      </div>

      <!-- Card Preview -->
      <div v-if="card" class="flex flex-col sm:flex-row gap-5">
        <!-- Image (clickable for zoom) -->
        <div class="flex-shrink-0 mx-auto sm:mx-0">
          <button
              v-if="currentImage"
              @click="showZoom = true"
              class="relative group cursor-zoom-in focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-lg block w-[130px] sm:w-[150px]"
          >
            <img
                :src="currentImage"
                :alt="card.name"
                loading="lazy"
                class="w-full aspect-[2/3] object-cover border border-line rounded-lg group-hover:border-neon transition-colors"
            />
            <span class="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 text-tiny text-silver-70 bg-black/60 border border-line rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <IconV2 name="eye" :size="14" />{{ t('cards.addModal.zoomHint') }}
            </span>
            <!-- Flip button for dual-faced cards -->
            <button
                v-if="isSplitCard"
                @click.stop="toggleCardFace"
                class="absolute top-2 left-2 bg-black/80 border border-neon p-1.5 hover:bg-neon-10 transition-all rounded-md z-10"
                :title="t('cards.grid.flipTitle')"
            >
              <IconV2 name="swap" :size="16" class="text-neon" />
            </button>
          </button>
          <div v-else class="w-[130px] sm:w-[150px] aspect-[2/3] bg-surface-2 border border-line flex items-center justify-center rounded-lg">
            <span class="text-tiny text-silver-50">{{ t('cards.detailModal.noImage') }}</span>
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <p class="font-display text-h3 font-bold text-silver">{{ card.name }}</p>
          <p v-if="cardTypeLine" class="text-small text-silver-50 mt-0.5">{{ cardTypeLine }}</p>

          <!-- Multi-source prices -->
          <div class="flex items-baseline gap-4 flex-wrap mt-3.5">
            <div class="flex flex-col">
              <span class="text-tiny uppercase tracking-wide text-silver-50">Card Kingdom</span>
              <span v-if="hasCardKingdomPrices" class="font-display font-tnum text-[26px] sm:text-[30px] font-bold text-neon leading-none">{{ formatPrice(cardKingdomRetail) }}</span>
              <span v-else-if="loadingCKPrices" class="text-small text-silver-50">...</span>
              <span v-else class="text-small text-silver-50">-</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <div class="flex gap-2 items-baseline">
                <span class="text-tiny uppercase text-silver-50 min-w-[46px]">TCG</span>
                <span class="font-display font-tnum text-small font-semibold text-silver-70">${{ (props.card?.price ?? 0).toFixed(2) }}</span>
              </div>
              <div class="flex gap-2 items-baseline">
                <span class="text-tiny uppercase text-silver-50 min-w-[46px]">Buylist</span>
                <span v-if="cardKingdomBuylist" class="font-display font-tnum text-small font-semibold text-silver-70">{{ formatPrice(cardKingdomBuylist) }}</span>
                <span v-else class="text-small text-silver-50">-</span>
              </div>
            </div>
          </div>

          <!-- Price History Toggle -->
          <div class="mt-3">
            <button
              @click="togglePriceChart"
              class="flex items-center gap-1.5 text-tiny text-silver-50 hover:text-silver transition-colors"
            >
              <IconV2 name="chev-d" :size="14" :class="['transition-transform duration-200 ease-v2', showPriceChart ? '-rotate-180' : '']" />
              <span>{{ t('cards.detailModal.priceHistory.toggle') }}</span>
            </button>

            <!-- Chart panel -->
            <div v-if="showPriceChart" class="mt-2.5 bg-surface-1 border border-line rounded-lg p-3.5">
              <div v-if="chartLoading" class="flex items-center justify-center h-[60px]">
                <span class="text-tiny text-silver-50 animate-pulse">...</span>
              </div>
              <div v-else-if="!chartHasData" class="text-tiny text-silver-50 py-2">
                {{ t('cards.detailModal.priceHistory.noData') }}
              </div>
              <div v-else>
                <!-- Source selector -->
                <div class="flex items-center gap-1.5 mb-2">
                  <button
                    v-for="src in (['tcg', 'ck', 'buylist'] as ChartSource[])"
                    :key="src"
                    @click="chartSource = src"
                    :class="[
                      'px-2.5 py-0.5 text-[11px] font-bold rounded-full transition-colors uppercase tracking-wide',
                      chartSource === src
                        ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                        : 'text-silver-50 border border-line hover:text-silver hover:bg-surface-2'
                    ]"
                  >
                    {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'BUY' }}
                  </button>
                </div>

                <!-- SVG Chart -->
                <svg
                  :viewBox="`0 0 ${chartSvgW} ${chartSvgH}`"
                  class="w-full h-[80px]"
                  preserveAspectRatio="none"
                >
                  <line
                    :x1="chartPad.left" :y1="chartPad.top"
                    :x2="chartSvgW - chartPad.right" :y2="chartPad.top"
                    stroke="rgba(255,255,255,.1)" stroke-width="0.5"
                  />
                  <line
                    :x1="chartPad.left" :y1="chartSvgH - chartPad.bottom"
                    :x2="chartSvgW - chartPad.right" :y2="chartSvgH - chartPad.bottom"
                    stroke="rgba(255,255,255,.1)" stroke-width="0.5"
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
                <div class="flex items-center justify-between text-tiny text-silver-50 -mt-1">
                  <span>{{ chartFirstDate }}</span>
                  <span class="font-bold" :style="{ color: chartSourceColor }">{{ chartLastValue }}</span>
                  <span>{{ chartLastDate }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edition / Print Selector -->
      <div v-if="availablePrints.length > 1" class="bg-surface-1 border border-line rounded-lg p-4">
        <p class="text-[11px] font-bold uppercase tracking-[.12em] text-silver-50 mb-2.5">{{ t('cards.detailModal.editionPrintLabel') }}</p>
        <div class="relative">
          <select
              id="detail-print-select"
              :value="selectedPrint?.id"
              @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
              class="w-full appearance-none px-3 py-2 pr-8 bg-surface-2 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
          >
            <option
                v-for="print in availablePrints"
                :key="print.id"
                :value="print.id"
            >
              {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd ?? 'N/A' }}
            </option>
          </select>
          <IconV2 name="chev-d" :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
        </div>
        <p class="text-tiny text-silver-30 mt-1.5">{{ t('cards.detailModal.printsAvailable', { count: availablePrints.length }) }}</p>
      </div>
      <p v-else-if="loadingPrints" class="text-tiny text-silver-50">{{ t('cards.detailModal.loadingPrints') }}</p>

      <!-- Status Distribution -->
      <div class="bg-surface-1 border border-line rounded-lg p-4">
        <div class="flex justify-between items-center mb-3">
          <p class="text-[11px] font-bold uppercase tracking-[.12em] text-silver-50">{{ t('cards.detailModal.distribution') }}</p>
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-surface-3 text-silver-70">
            {{ t('cards.detailModal.totalLabel', { qty: totalQuantity }) }}
          </span>
        </div>

        <div class="space-y-1">
          <!-- Collection -->
          <div class="flex items-center justify-between py-1.5" data-testid="qty-row-collection">
            <div class="flex items-center gap-2.5">
              <span class="w-[9px] h-[9px] rounded-full bg-neon flex-shrink-0"></span>
              <span class="text-small text-silver">{{ t('common.status.collection') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustQuantity('collection', -1)"
                class="w-[34px] h-[34px] flex items-center justify-center border border-line-strong text-silver rounded-md hover:border-neon-40 hover:text-neon transition-all duration-200 ease-v2 disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="statusDistribution.collection <= 0"
              >
                <IconV2 name="minus" :size="14" />
              </button>
              <span class="w-7 text-center font-display font-tnum font-bold text-neon">{{ statusDistribution.collection }}</span>
              <button
                @click="adjustQuantity('collection', 1)"
                class="w-[34px] h-[34px] flex items-center justify-center bg-neon text-primary border border-neon rounded-md hover:brightness-110 transition-all duration-200 ease-v2"
              >
                <IconV2 name="plus" :size="14" />
              </button>
            </div>
          </div>

          <!-- Sale -->
          <div class="flex items-center justify-between py-1.5" data-testid="qty-row-sale">
            <div class="flex items-center gap-2.5">
              <span class="w-[9px] h-[9px] rounded-full bg-[#C4553F] flex-shrink-0"></span>
              <span class="text-small text-silver">{{ t('common.status.sale') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustQuantity('sale', -1)"
                class="w-[34px] h-[34px] flex items-center justify-center border border-line-strong text-silver rounded-md hover:border-neon-40 hover:text-neon transition-all duration-200 ease-v2 disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="statusDistribution.sale <= 0"
              >
                <IconV2 name="minus" :size="14" />
              </button>
              <span class="w-7 text-center font-display font-tnum font-bold text-[#C4553F]">{{ statusDistribution.sale }}</span>
              <button
                @click="adjustQuantity('sale', 1)"
                class="w-[34px] h-[34px] flex items-center justify-center bg-neon text-primary border border-neon rounded-md hover:brightness-110 transition-all duration-200 ease-v2"
              >
                <IconV2 name="plus" :size="14" />
              </button>
            </div>
          </div>

          <!-- Trade -->
          <div class="flex items-center justify-between py-1.5" data-testid="qty-row-trade">
            <div class="flex items-center gap-2.5">
              <span class="w-[9px] h-[9px] rounded-full bg-[#60A5FA] flex-shrink-0"></span>
              <span class="text-small text-silver">{{ t('common.status.trade') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustQuantity('trade', -1)"
                class="w-[34px] h-[34px] flex items-center justify-center border border-line-strong text-silver rounded-md hover:border-neon-40 hover:text-neon transition-all duration-200 ease-v2 disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="statusDistribution.trade <= 0"
              >
                <IconV2 name="minus" :size="14" />
              </button>
              <span class="w-7 text-center font-display font-tnum font-bold text-[#60A5FA]">{{ statusDistribution.trade }}</span>
              <button
                @click="adjustQuantity('trade', 1)"
                class="w-[34px] h-[34px] flex items-center justify-center bg-neon text-primary border border-neon rounded-md hover:brightness-110 transition-all duration-200 ease-v2"
              >
                <IconV2 name="plus" :size="14" />
              </button>
            </div>
          </div>

          <!-- Wishlist -->
          <div class="flex items-center justify-between py-1.5" data-testid="qty-row-wishlist">
            <div class="flex items-center gap-2.5">
              <span class="w-[9px] h-[9px] rounded-full bg-gold flex-shrink-0"></span>
              <span class="text-small text-silver">{{ t('common.status.wishlist') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustQuantity('wishlist', -1)"
                class="w-[34px] h-[34px] flex items-center justify-center border border-line-strong text-silver rounded-md hover:border-neon-40 hover:text-neon transition-all duration-200 ease-v2 disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="statusDistribution.wishlist <= 0"
              >
                <IconV2 name="minus" :size="14" />
              </button>
              <span class="w-7 text-center font-display font-tnum font-bold text-gold">{{ statusDistribution.wishlist }}</span>
              <button
                @click="adjustQuantity('wishlist', 1)"
                class="w-[34px] h-[34px] flex items-center justify-center bg-neon text-primary border border-neon rounded-md hover:brightness-110 transition-all duration-200 ease-v2"
              >
                <IconV2 name="plus" :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- Validation Error -->
        <p v-if="validationError" class="text-tiny text-[#C4553F] mt-3 pt-3 border-t border-line">
          {{ validationError }}
        </p>

        <!-- Allocation Warning -->
        <p v-if="allocationWarning && !validationError" class="flex items-center gap-1.5 text-tiny text-warning mt-3 pt-3 border-t border-line">
          <IconV2 name="alert" :size="16" class="flex-shrink-0" />
          {{ allocationWarning }}
        </p>
      </div>

      <!-- Publish to Profile -->
      <div v-if="showPublicOption" class="bg-surface-1 border border-line rounded-lg p-4">
        <label class="flex items-center gap-3 cursor-pointer">
          <IconV2 name="eye" :size="18" class="text-neon flex-shrink-0" />
          <div class="flex-1">
            <span class="text-small text-silver font-bold">{{ t('cards.statusModal.publishLabel') }}</span>
            <p class="text-tiny text-silver-50">{{ t('cards.statusModal.publishHint') }}</p>
          </div>
          <input
              v-model="isPublic"
              type="checkbox"
              class="w-[18px] h-[18px] cursor-pointer accent-neon flex-shrink-0"
          />
        </label>
      </div>

      <!-- Condition & Foil -->
      <div class="bg-surface-1 border border-line rounded-lg p-4">
        <p class="text-[11px] font-bold uppercase tracking-[.12em] text-silver-50 mb-3">{{ t('cards.detailModal.properties') }}</p>

        <div class="grid grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <label for="detail-condition" class="text-tiny text-silver-70 font-semibold block mb-1.5">{{ t('cards.detailModal.conditionLabel') }}</label>
            <div class="relative">
              <select
                  id="detail-condition"
                  v-model="condition"
                  class="w-full appearance-none px-3 py-2 pr-8 bg-surface-2 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
              >
                <option v-for="opt in conditionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <IconV2 name="chev-d" :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
            </div>
          </div>

          <label class="flex items-center gap-2.5 pb-2 cursor-pointer select-none">
            <span class="text-small text-silver">{{ t('cards.detailModal.foilLabel') }}</span>
            <span class="relative inline-flex items-center flex-shrink-0">
              <input v-model="foil" type="checkbox" class="peer sr-only" />
              <span class="w-[44px] h-[26px] rounded-full border border-line bg-surface-3 peer-checked:bg-neon peer-checked:border-neon transition-colors duration-200 ease-v2 peer-focus-visible:ring-2 peer-focus-visible:ring-neon peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-primary"></span>
              <span class="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ease-v2 peer-checked:translate-x-[18px]"></span>
            </span>
          </label>
        </div>
      </div>

      <!-- Deck Allocations -->
      <div v-if="allDecks.length > 0" class="bg-surface-1 border border-line rounded-lg p-4">
        <div class="flex justify-between items-center mb-3">
          <p class="text-[11px] font-bold uppercase tracking-[.12em] text-silver-50">{{ t('cards.detailModal.assignToDecks') }}</p>
          <p class="text-tiny" :class="availableForAllocation > 0 ? 'text-neon' : 'text-silver-50'">
            {{ t('cards.detailModal.available', { qty: availableForAllocation }) }}
          </p>
        </div>

        <div class="space-y-2 max-h-[200px] overflow-y-auto">
          <div
              v-for="deck in allDecks"
              :key="deck.id"
              class="flex items-center justify-between p-2.5 border rounded-md transition-all duration-200 ease-v2 gap-2"
              :class="getDeckTotal(deck.id) > 0 ? 'border-neon-40 bg-neon-5' : 'border-line bg-surface-2'"
          >
            <!-- Deck info -->
            <div class="flex-1 min-w-0 pr-2">
              <p class="text-small font-bold text-silver truncate">{{ deck.name }}</p>
              <p class="text-tiny text-silver-50 uppercase tracking-wide">{{ deck.format }}</p>
            </div>

            <!-- MB / SB slot controls -->
            <div class="flex items-center gap-4">
              <div class="flex flex-col items-center gap-0.5">
                <span class="text-tiny text-silver-50 font-bold">{{ t('cards.detailModal.slotMb') }}</span>
                <div class="flex items-center gap-1.5">
                  <button
                    @click="adjustSlot(deck.id, 'mb', -1)"
                    :disabled="getSlotQty(deck.id, 'mb') === 0"
                    class="w-[26px] h-[26px] flex items-center justify-center border border-line-strong text-silver rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <IconV2 name="minus" :size="12" />
                  </button>
                  <span class="w-4 text-center font-display font-tnum font-bold text-small" :class="getSlotQty(deck.id, 'mb') > 0 ? 'text-neon' : 'text-silver-50'">
                    {{ getSlotQty(deck.id, 'mb') }}
                  </span>
                  <button
                    @click="adjustSlot(deck.id, 'mb', 1)"
                    class="w-[26px] h-[26px] flex items-center justify-center bg-neon text-primary border border-neon rounded font-bold"
                  >
                    <IconV2 name="plus" :size="12" />
                  </button>
                </div>
              </div>

              <div class="flex flex-col items-center gap-0.5">
                <span class="text-tiny text-silver-50 font-bold">{{ t('cards.detailModal.slotSb') }}</span>
                <div class="flex items-center gap-1.5">
                  <button
                    @click="adjustSlot(deck.id, 'sb', -1)"
                    :disabled="getSlotQty(deck.id, 'sb') === 0"
                    class="w-[26px] h-[26px] flex items-center justify-center border border-line-strong text-silver rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <IconV2 name="minus" :size="12" />
                  </button>
                  <span class="w-4 text-center font-display font-tnum font-bold text-small" :class="getSlotQty(deck.id, 'sb') > 0 ? 'text-gold' : 'text-silver-50'">
                    {{ getSlotQty(deck.id, 'sb') }}
                  </span>
                  <button
                    @click="adjustSlot(deck.id, 'sb', 1)"
                    class="w-[26px] h-[26px] flex items-center justify-center bg-gold text-primary border border-gold rounded font-bold"
                  >
                    <IconV2 name="plus" :size="12" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-if="totalAllocated > 0" class="text-tiny text-silver-50 mt-3 pt-3 border-t border-line">
          {{ t('cards.detailModal.totalAssigned', { qty: totalAllocated }) }}
        </p>
      </div>

      <!-- Binder Allocations (SCRUM-40) -->
      <div v-if="allBinders.length > 0" class="bg-surface-1 border border-line rounded-lg p-4">
        <div class="flex justify-between items-center mb-3">
          <p class="text-[11px] font-bold uppercase tracking-[.12em] text-silver-50">{{ t('cards.detailModal.assignToBinders') }}</p>
          <p class="text-tiny" :class="availableForAllocation > 0 ? 'text-neon' : 'text-silver-50'">
            {{ t('cards.detailModal.available', { qty: availableForAllocation }) }}
          </p>
        </div>

        <div class="space-y-2 max-h-[200px] overflow-y-auto">
          <div
              v-for="binder in allBinders"
              :key="binder.id"
              class="flex items-center justify-between p-2.5 border rounded-md transition-all duration-200 ease-v2 gap-2"
              :class="getBinderQty(binder.id) > 0 ? 'border-neon-40 bg-neon-5' : 'border-line bg-surface-2'"
          >
            <div class="flex-1 min-w-0 pr-2">
              <p class="text-small font-bold text-silver truncate">{{ binder.name }}</p>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                @click="adjustBinder(binder.id, -1)"
                :disabled="getBinderQty(binder.id) === 0"
                class="w-[26px] h-[26px] flex items-center justify-center border border-line-strong text-silver rounded disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <IconV2 name="minus" :size="12" />
              </button>
              <span class="w-4 text-center font-display font-tnum font-bold text-small" :class="getBinderQty(binder.id) > 0 ? 'text-neon' : 'text-silver-50'">
                {{ getBinderQty(binder.id) }}
              </span>
              <button
                @click="adjustBinder(binder.id, 1)"
                class="w-[26px] h-[26px] flex items-center justify-center bg-neon text-primary border border-neon rounded font-bold"
              >
                <IconV2 name="plus" :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 justify-end pt-4 border-t border-line">
        <BaseButton
            variant="secondary"
            class="uppercase tracking-[.1em] !text-[12px]"
            :disabled="isLoading"
            @click="handleClose"
        >
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton
            variant="filled"
            class="uppercase tracking-[.1em] !text-[12px]"
            :disabled="isLoading || !canSave"
            @click="handleSave"
        >
          {{ isLoading ? t('common.actions.saving') : t('common.actions.save') }}
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
            :aria-label="t('common.aria.closeModal')"
        >
          <IconV2 name="x" :size="28" />
        </button>
        <p class="absolute bottom-4 left-1/2 -translate-x-1/2 text-silver-70 text-small">
          {{ t('cards.addModal.zoomCloseHint') }}
        </p>
      </div>
    </Teleport>
  </BaseModal>
</template>
