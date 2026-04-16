<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import AppContainer from '../components/layout/AppContainer.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import CardDetailModal from '../components/collection/CardDetailModal.vue'
import ManageDecksModal from '../components/collection/ManageDecksModal.vue'
import CollectionGrid from '../components/collection/CollectionGrid.vue'
import CollectionTotalsPanel from '../components/collection/CollectionTotalsPanel.vue'
import CreateBinderModal from '../components/binders/CreateBinderModal.vue'
import CreateDeckModal from '../components/decks/CreateDeckModal.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import SkeletonCard from '../components/ui/SkeletonCard.vue'
import type { CreateBinderInput } from '../types/binder'
import { type Card, type CardStatus } from '../types/card'
import type { CreateDeckInput } from '../types/deck'
import { useBindersStore } from '../stores/binders'
import { useDecksStore } from '../stores/decks'
import { useCardAllocation } from '../composables/useCardAllocation'
import { type ScryfallCard, searchCards } from '../services/scryfallCache'
import SvgIcon from '../components/ui/SvgIcon.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import FloatingActionButton from '../components/ui/FloatingActionButton.vue'
import CardFilterBar from '../components/ui/CardFilterBar.vue'
import AdvancedFilterModal, { type AdvancedFilters } from '../components/search/AdvancedFilterModal.vue'
import { colorOrder, getCardColorCategory, getCardManaCategory, getCardRarityCategory, getCardTypeCategory, manaOrder, passesColorFilter, rarityOrder, typeOrder, useCardFilter } from '../composables/useCardFilter'
import { cancelPriceFetch } from '../composables/useCollectionTotals'
import { useCollectionFilterUrl } from '../composables/useCollectionFilterUrl'
import { useCollectionPagination } from '../composables/useCollectionPagination'

const route = useRoute()
const router = useRouter()
const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const binderStore = useBindersStore()
const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const { t } = useI18n()
const { getAllocationsForCard } = useCardAllocation()

// ========== STATE ==========

// Modals
const showAddCardModal = ref(false)
const showCardDetailModal = ref(false)
const showManageDecksModal = ref(false)
const showCreateDeckModal = ref(false)
const showCreateBinderModal = ref(false)
const createDeckModalRef = ref<{ setLoading: (v: boolean) => void } | null>(null)
const createBinderModalRef = ref<{ setLoading: (v: boolean) => void } | null>(null)
const showLocalFilters = ref(false)

// Totals panel expanded state (for FAB positioning)
const totalsPanelExpanded = ref(false)

// Selección de cartas
const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<ScryfallCard | undefined>(undefined)

// Filtros de COLECCIÓN
const statusFilter = ref<'all' | 'owned' | 'available' | CardStatus>('all')
const viewType = ref<'visual' | 'texto'>('visual')

// ========== COMPUTED ==========

// Cartas según status (shallowRef protects during import — push in-place is invisible)
const collectionCards = computed(() => collectionStore.cards)

// Single-pass status counts
const statusCounts = computed(() => {
  let owned = 0, collectionSt = 0, available = 0, wishlist = 0
  for (const c of collectionCards.value) {
    if (c.status === 'wishlist') { wishlist++ }
    else {
      owned++
      if (c.status === 'collection') collectionSt++
      else if (c.status === 'sale' || c.status === 'trade') available++
    }
  }
  return { owned, collection: collectionSt, available, wishlist }
})

// Cartas que NECESITO (wishlist) - con filtro de búsqueda y ordenamiento
const wishlistCards = computed(() => {
  let cards = collectionCards.value.filter(c => c.status === 'wishlist')

  // Aplicar filtro de búsqueda (mismo que filteredCards)
  if (filterQuery.value.trim()) {
    const q = filterQuery.value.toLowerCase()
    cards = cards.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.edition.toLowerCase().includes(q)
    )
  }

  // Aplicar ordenamiento (mismo que filteredCards)
  switch (sortBy.value) {
    case 'recent':
      cards = [...cards].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })
      break
    case 'name':
      cards = [...cards].sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'price':
      cards = [...cards].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      break
  }

  return cards
})

// Contadores por status
const ownedCount = computed(() => statusCounts.value.owned)
const collectionCount = computed(() => statusCounts.value.collection)
const availableCount = computed(() => statusCounts.value.available)
const wishlistTotalCount = computed(() => statusCounts.value.wishlist)
const wishlistCount = computed(() => wishlistCards.value.length)

// Función para traducir status
const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'all': t('collection.filters.all'),
    'owned': t('collection.filters.owned'),
    'collection': t('common.status.collection'),
    'available': t('collection.filters.available'),
    'sale': t('common.status.sale'),
    'trade': t('common.status.trade'),
    'wishlist': t('collection.filters.wishlist'),
  }
  // eslint-disable-next-line security/detect-object-injection
  return labels[status] ?? status.toUpperCase()
}

const decksList = computed(() => decksStore.decks)
const bindersList = computed(() => binderStore.binders)

// ========== COLLECTION FILTER (composable) ==========

// Pre-filter: status (collection-specific, before composable)
const statusFilteredCards = computed(() => {
  let cards = collectionCards.value

  if (statusFilter.value === 'owned') {
    cards = cards.filter(c => c.status !== 'wishlist')
  } else if (statusFilter.value === 'available') {
    cards = cards.filter(c => c.status === 'sale' || c.status === 'trade')
  } else if (statusFilter.value !== 'all') {
    cards = cards.filter(c => c.status === statusFilter.value)
  }

  return cards
})

// Shared filter composable (text search, sort, group, chip filters)
const {
  filterQuery,
  sortBy,
  groupBy: collectionGroupBy,
  selectedColors,
  exactColorMode,
  selectedManaValues,
  selectedTypes,
  selectedRarities,
  hasActiveFilters,
  filteredCards,
  groupedCards: groupedFilteredCards,
  translateCategory,
  // Advanced filters
  advPriceMin,
  advPriceMax,
  advFoilFilter,
  advSelectedSets,
  advSelectedKeywords,
  advSelectedFormats,
  advSelectedCreatureTypes,
  advFullArtOnly,
  advPowerMin,
  advPowerMax,
  advToughnessMin,
  advToughnessMax,
  advancedFilterCount,
  collectionSets,
  collectionCreatureTypes,
  resetAdvancedFilters,
} = useCardFilter(statusFilteredCards)

// ========== URL FILTER SYNC (Plan 03-B, NICE-10) ==========
useCollectionFilterUrl({
  filterQuery,
  statusFilter,
  sortBy,
  selectedColors,
  selectedTypes,
  selectedRarities,
  selectedManaValues,
  advFoilFilter,
})

// ========== PAGINATION COMPOSABLE (Plan 03-B, ARCH-02) ==========
const { triggerQuery: triggerPaginationQuery } = useCollectionPagination({
  filterState: {
    filterQuery,
    statusFilter,
    sortBy,
    selectedColors,
    selectedManaValues,
    selectedTypes,
    selectedRarities,
    advFoilFilter,
    advSelectedSets,
    advPriceMin,
    advPriceMax,
  },
  collectionStore,
})

// Bridge: individual refs <-> AdvancedFilters for the shared modal
const colorToModal: Record<string, string> = { White: 'w', Blue: 'u', Black: 'b', Red: 'r', Green: 'g', Colorless: 'c' }
const colorFromModal: Record<string, string> = { w: 'White', u: 'Blue', b: 'Black', r: 'Red', g: 'Green', c: 'Colorless' }
const typeToModal: Record<string, string> = { Creatures: 'creature', Instants: 'instant', Sorceries: 'sorcery', Enchantments: 'enchantment', Artifacts: 'artifact', Planeswalkers: 'planeswalker', Lands: 'land' }
const typeFromModal: Record<string, string> = { creature: 'Creatures', instant: 'Instants', sorcery: 'Sorceries', enchantment: 'Enchantments', artifact: 'Artifacts', planeswalker: 'Planeswalkers', land: 'Lands' }
const rarityToModal: Record<string, string> = { Common: 'common', Uncommon: 'uncommon', Rare: 'rare', Mythic: 'mythic' }
const rarityFromModal: Record<string, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic' }

/* eslint-disable security/detect-object-injection */
const localAdvancedFilters = computed<AdvancedFilters>(() => ({
  colors: selectedColors.value.size < colorOrder.length
    ? [...selectedColors.value].map(c => colorToModal[c]).filter(Boolean) as string[]
    : [],
  types: selectedTypes.value.size < typeOrder.length
    ? [...selectedTypes.value].map(t => typeToModal[t]).filter(Boolean) as string[]
    : [],
  manaValue: selectedManaValues.value.size < manaOrder.length
    ? { values: [...selectedManaValues.value].map(v => v === '10+' ? 10 : Number.parseInt(v, 10)).filter(v => !Number.isNaN(v)) }
    : { min: undefined, max: undefined, values: undefined },
  rarity: selectedRarities.value.size < rarityOrder.length
    ? [...selectedRarities.value].map(r => rarityToModal[r]).filter(Boolean) as string[]
    : [],
  sets: advSelectedSets.value,
  power: { min: advPowerMin.value, max: advPowerMax.value },
  toughness: { min: advToughnessMin.value, max: advToughnessMax.value },
  formatLegal: advSelectedFormats.value,
  priceUSD: { min: advPriceMin.value, max: advPriceMax.value },
  keywords: advSelectedKeywords.value,
  creatureTypes: advSelectedCreatureTypes.value,
  isFoil: advFoilFilter.value === 'foil',
  isFullArt: advFullArtOnly.value,
}))
/* eslint-enable security/detect-object-injection */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, security/detect-object-injection */
const handleLocalFiltersUpdate = (updated: AdvancedFilters) => {
  advSelectedSets.value = [...updated.sets]
  advSelectedKeywords.value = [...updated.keywords]
  advSelectedFormats.value = [...updated.formatLegal]
  advSelectedCreatureTypes.value = [...(updated.creatureTypes ?? [])]
  advPriceMin.value = updated.priceUSD.min
  advPriceMax.value = updated.priceUSD.max
  advPowerMin.value = updated.power.min
  advPowerMax.value = updated.power.max
  advToughnessMin.value = updated.toughness.min
  advToughnessMax.value = updated.toughness.max
  advFoilFilter.value = updated.isFoil ? 'foil' : 'any'
  advFullArtOnly.value = updated.isFullArt
  if (updated.manaValue.values?.length) {
    const mapped = updated.manaValue.values.map(v => v === 10 ? '10+' : String(v))
    selectedManaValues.value = new Set(mapped)
  } else {
    selectedManaValues.value = new Set(manaOrder)
  }
  const mappedColors = updated.colors.map(c => colorFromModal[c]).filter((v): v is string => !!v)
  selectedColors.value = new Set(mappedColors.length > 0 ? mappedColors : colorOrder)
  const mappedTypes = updated.types.map(t => typeFromModal[t]).filter((v): v is string => !!v)
  selectedTypes.value = new Set(mappedTypes.length > 0 ? mappedTypes : typeOrder)
  const mappedRarities = updated.rarity.map(r => rarityFromModal[r]).filter((v): v is string => !!v)
  selectedRarities.value = new Set(mappedRarities.length > 0 ? mappedRarities : rarityOrder)
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, security/detect-object-injection */

// Active chip filter count for badge
const activeChipFilterCount = computed(() => {
  let count = 0
  if (selectedColors.value.size < colorOrder.length) count++
  if (selectedManaValues.value.size < manaOrder.length) count++
  if (selectedTypes.value.size < typeOrder.length) count++
  if (selectedRarities.value.size < rarityOrder.length) count++
  count += advancedFilterCount.value
  return count
})

const resetAllChipFilters = () => {
  selectedColors.value = new Set(colorOrder)
  selectedManaValues.value = new Set(manaOrder)
  selectedTypes.value = new Set(typeOrder)
  selectedRarities.value = new Set(rarityOrder)
  resetAdvancedFilters()
}

const clearAllFilters = () => {
  filterQuery.value = ''
  resetAllChipFilters()
}

// Paginated cards for collection view
const collectionDisplayCards = computed(() => {
  const paginated = collectionStore.paginatedCards
  if (paginated.length > 0 || collectionStore.paginationMeta.loading) {
    return paginated
  }
  return filteredCards.value
})

// Card count display
const paginatedCardCount = computed(() => {
  const meta = collectionStore.paginationMeta
  if (meta.total > 0) {
    return { showing: collectionStore.paginatedCards.length, total: meta.total }
  }
  return { showing: filteredCards.value.length, total: filteredCards.value.length }
})

// Wishlist grouping
const passesChipFilters = (card: Card): boolean => {
  if (selectedColors.value.size > 0 && selectedColors.value.size < colorOrder.length && !passesColorFilter(card, selectedColors.value, exactColorMode.value)) return false
  const mana = getCardManaCategory(card)
  if (selectedManaValues.value.size > 0 && selectedManaValues.value.size < manaOrder.length && !selectedManaValues.value.has(mana)) return false
  const type = getCardTypeCategory(card)
  if (selectedTypes.value.size > 0 && selectedTypes.value.size < typeOrder.length && !selectedTypes.value.has(type)) return false
  const rarity = getCardRarityCategory(card)
  if (selectedRarities.value.size > 0 && selectedRarities.value.size < rarityOrder.length && !selectedRarities.value.has(rarity)) return false
  return true
}

const getCardCategory = (card: Card): string => {
  switch (collectionGroupBy.value) {
    case 'mana': return getCardManaCategory(card)
    case 'color': return getCardColorCategory(card)
    case 'type': return getCardTypeCategory(card)
    default: return 'all'
  }
}

const getCategoryOrder = (): string[] => {
  switch (collectionGroupBy.value) {
    case 'mana': return manaOrder
    case 'color': return colorOrder
    case 'type': return typeOrder
    default: return []
  }
}

const groupedWishlistCards = computed(() => {
  const source = hasActiveFilters.value ? wishlistCards.value.filter(passesChipFilters) : wishlistCards.value

  if (collectionGroupBy.value === 'none') {
    return [{ type: 'all', cards: source }]
  }

  const groups: Record<string, Card[]> = {}
  const order = getCategoryOrder()

  for (const card of source) {
    const category = getCardCategory(card)
    // eslint-disable-next-line security/detect-object-injection
    groups[category] ??= []
    // eslint-disable-next-line security/detect-object-injection
    groups[category].push(card)
  }

  const sortedGroups: { type: string; cards: Card[] }[] = []
  for (const category of order) {
    // eslint-disable-next-line security/detect-object-injection
    const group = groups[category]
    if (group && group.length > 0) {
      sortedGroups.push({ type: category, cards: group })
    }
  }
  for (const category in groups) {
    // eslint-disable-next-line security/detect-object-injection
    const group = groups[category]
    if (!order.includes(category) && group && group.length > 0) {
      sortedGroups.push({ type: category, cards: group })
    }
  }

  return sortedGroups
})

// Count cards in a group
const getGroupCardCount = (cards: Card[]): number => {
  return cards.reduce((sum, card) => sum + card.quantity, 0)
}

// Card IDs currently being deleted (for disabling UI)
const deletingCardIds = computed(() => {
  return new Set<string>()
})

// ========== BULK SELECTION ==========
const selectionMode = ref(false)
const selectedCardIds = ref<Set<string>>(new Set())
const bulkActionLoading = ref(false)
const bulkActionProgress = ref(0)

const toggleSelectionMode = () => {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    selectedCardIds.value = new Set()
  }
}

const toggleCardSelection = (cardId: string) => {
  const next = new Set(selectedCardIds.value)
  if (next.has(cardId)) {
    next.delete(cardId)
  } else {
    next.add(cardId)
  }
  selectedCardIds.value = next
}

const selectAllFiltered = () => {
  const ids = new Set(selectedCardIds.value)
  for (const card of filteredCards.value) {
    ids.add(card.id)
  }
  for (const card of wishlistCards.value) {
    ids.add(card.id)
  }
  selectedCardIds.value = ids
}

const clearSelection = () => {
  selectedCardIds.value = new Set()
}

const handleBulkDelete = async () => {
  if (selectedCardIds.value.size === 0 || bulkActionLoading.value) return

  const confirmed = await confirmStore.show({
    title: t('collection.bulkDelete.title'),
    message: t('collection.bulkDelete.confirm', { count: selectedCardIds.value.size }),
    confirmText: t('common.actions.delete'),
    cancelText: t('common.actions.cancel'),
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  bulkActionLoading.value = true
  try {
    cancelPriceFetch()
    const ids = [...selectedCardIds.value]
    const result = await collectionStore.batchDeleteCards(ids)
    if (result.success) {
      toastStore.show(t('collection.bulkDelete.success', { count: ids.length }), 'success')
      selectedCardIds.value = new Set()
      selectionMode.value = false
    }
  } finally {
    bulkActionLoading.value = false
  }
}

const handleBulkStatusChange = async (status: CardStatus) => {
  if (selectedCardIds.value.size === 0 || bulkActionLoading.value) return
  bulkActionLoading.value = true
  bulkActionProgress.value = 0
  try {
    const ids = [...selectedCardIds.value]
    const ok = await collectionStore.batchUpdateCards(ids, { status }, (p) => { bulkActionProgress.value = p })
    if (ok) {
      toastStore.show(t('collection.bulkEdit.statusSuccess', { count: ids.length, status: t(`common.status.${status}`) }), 'success')
      selectedCardIds.value = new Set()
      selectionMode.value = false
    }
  } finally {
    bulkActionLoading.value = false
    bulkActionProgress.value = 0
  }
}

const handleBulkPublicToggle = async (isPublic: boolean) => {
  if (selectedCardIds.value.size === 0 || bulkActionLoading.value) return
  bulkActionLoading.value = true
  bulkActionProgress.value = 0
  try {
    const ids = [...selectedCardIds.value]
    const filteredIds = isPublic
      ? ids.filter(id => {
          const card = collectionStore.getCardById(id)
          return card && card.status !== 'collection'
        })
      : ids
    if (filteredIds.length === 0) {
      toastStore.show(t('collection.bulkEdit.noPublicEligible'), 'info')
      return
    }
    const ok = await collectionStore.batchUpdateCards(filteredIds, { public: isPublic }, (p) => { bulkActionProgress.value = p })
    if (ok) {
      toastStore.show(t('collection.bulkEdit.publicSuccess', { count: filteredIds.length }), 'success')
      selectedCardIds.value = new Set()
      selectionMode.value = false
    }
  } finally {
    bulkActionLoading.value = false
    bulkActionProgress.value = 0
  }
}

// ---- Bulk allocate to deck/binder ----
const showBulkDeckPicker = ref(false)
const showBulkBinderPicker = ref(false)
const pendingBulkAllocateDeck = ref(false)
const pendingBulkAllocateBinder = ref(false)

const handleBulkAllocateToDeck = async (deckId: string) => {
  if (selectedCardIds.value.size === 0 || bulkActionLoading.value) return
  showBulkDeckPicker.value = false
  bulkActionLoading.value = true
  try {
    const items = [...selectedCardIds.value].map(cardId => ({
      cardId,
      quantity: 1,
      isInSideboard: false,
    }))
    const result = await decksStore.bulkAllocateCardsToDeck(deckId, items)
    if (result.allocated > 0 || result.wishlisted > 0) {
      toastStore.show(t('collection.bulkEdit.deckSuccess', { allocated: result.allocated, wishlisted: result.wishlisted }), 'success')
    } else {
      toastStore.show(t('collection.bulkEdit.deckSuccess', { allocated: 0, wishlisted: 0 }), 'info')
    }
    selectedCardIds.value = new Set()
    selectionMode.value = false
  } finally {
    bulkActionLoading.value = false
  }
}

const performBulkBinderAllocate = async (binderId: string) => {
  const cardIds = [...selectedCardIds.value]

  let totalMoved = 0
  for (const binder of binderStore.binders) {
    if (binder.id === binderId) continue
    const cardsInBinder = cardIds.filter(
      id => binder.allocations?.some(a => a.cardId === id)
    )
    if (cardsInBinder.length > 0) {
      totalMoved += await binderStore.bulkDeallocateCardsFromBinder(binder.id, cardsInBinder)
    }
  }

  const items = cardIds.map(cardId => {
    const card = collectionStore.getCardById(cardId)
    return { cardId, quantity: card?.quantity ?? 1 }
  })
  const allocated = await binderStore.bulkAllocateCardsToBinder(binderId, items)

  if (allocated > 0) {
    const msgKey = totalMoved > 0
      ? 'collection.bulkEdit.binderMoveSuccess'
      : 'collection.bulkEdit.binderSuccess'
    toastStore.show(t(msgKey, { count: allocated }), 'success')
  } else {
    toastStore.show(t('collection.bulkEdit.binderSuccess', { count: 0 }), 'info')
  }

  selectedCardIds.value = new Set()
  selectionMode.value = false
}

const handleBulkAllocateToBinder = async (binderId: string) => {
  if (selectedCardIds.value.size === 0 || bulkActionLoading.value) return
  showBulkBinderPicker.value = false
  bulkActionLoading.value = true
  try {
    await performBulkBinderAllocate(binderId)
  } finally {
    bulkActionLoading.value = false
  }
}

const handleBulkCreateDeck = () => {
  showBulkDeckPicker.value = false
  showCreateDeckModal.value = true
  pendingBulkAllocateDeck.value = true
}

const handleBulkCreateBinder = () => {
  showBulkBinderPicker.value = false
  showCreateBinderModal.value = true
  pendingBulkAllocateBinder.value = true
}

// Create-deck from bulk flow (stays here because it uses selectedCardIds)
const handleCreateDeck = async (deckData: CreateDeckInput) => {
  const modalRef = createDeckModalRef.value
  try {
    modalRef?.setLoading(true)
    const deckId = await decksStore.createDeck(deckData)
    if (!deckId) return

    showCreateDeckModal.value = false

    if (pendingBulkAllocateDeck.value) {
      pendingBulkAllocateDeck.value = false
      bulkActionLoading.value = true
      try {
        const ids = [...selectedCardIds.value]
        const items = ids.map(cardId => ({ cardId, quantity: 1, isInSideboard: false }))
        const result = await decksStore.bulkAllocateCardsToDeck(deckId, items)
        if (result.allocated > 0 || result.wishlisted > 0) {
          toastStore.show(t('collection.bulkEdit.deckSuccess', { allocated: result.allocated, wishlisted: result.wishlisted }), 'success')
        } else {
          toastStore.show(t('collection.bulkEdit.deckSuccess', { allocated: 0, wishlisted: 0 }), 'info')
        }
        selectedCardIds.value = new Set()
        selectionMode.value = false
      } finally {
        bulkActionLoading.value = false
      }
      // After the bulk allocation, navigate to the new deck's view
      void router.push({ path: `/decks/${deckId}` })
    } else {
      void router.push({ path: `/decks/${deckId}` })
      toastStore.show(t('common.import.deckCreated', { name: deckData.name }), 'success')
    }
  } catch (error) {
    console.error('Error in handleCreateDeck:', error)
    toastStore.show(t('decks.messages.createError'), 'error')
  } finally {
    modalRef?.setLoading(false)
  }
}

const handleCreateBinder = async (data: CreateBinderInput) => {
  const modalRef = createBinderModalRef.value
  try {
    modalRef?.setLoading(true)
    const binderId = await binderStore.createBinder(data)
    if (!binderId) return

    showCreateBinderModal.value = false

    if (pendingBulkAllocateBinder.value) {
      pendingBulkAllocateBinder.value = false
      bulkActionLoading.value = true
      try {
        await performBulkBinderAllocate(binderId)
      } finally {
        bulkActionLoading.value = false
      }
    }

    void router.push({ path: `/binders/${binderId}` })
  } catch (error) {
    console.error('Error in handleCreateBinder:', error)
    toastStore.show(t('binders.errors.create'), 'error')
  } finally {
    modalRef?.setLoading(false)
  }
}

// ========== METHODS ==========

// Click on local card suggestion
const handleLocalCardSelect = (card: Card) => {
  filterQuery.value = ''
  selectedCard.value = card
  showCardDetailModal.value = true
}

// Click on Scryfall suggestion → search card and open AddCardModal
const handleScryfallSuggestionSelect = async (cardName: string) => {
  filterQuery.value = ''
  try {
    const results = await searchCards(`!"${cardName}"`)
    if (results.length > 0) {
      selectedScryfallCard.value = results[0]
      showAddCardModal.value = true
    }
  } catch (err) {
    console.error('Error searching card:', err)
  }
}

// Click on "Advanced search" → navigate to /search
const handleOpenAdvancedSearch = () => {
  void router.push({ path: '/search' })
}

// Cerrar modal de agregar carta y limpiar URL
const handleAddCardModalClose = () => {
  showAddCardModal.value = false
  selectedScryfallCard.value = undefined
  if (route.query.addCard) {
    void router.replace({ path: '/collection', query: { ...route.query, addCard: undefined } })
  }
}

// Cuando hace click en una carta de la colección
const handleCardClick = (card: Card) => {
  selectedCard.value = card
  showCardDetailModal.value = true
}

// Eliminar existente (optimistic UI)
const handleDelete = async (card: Card) => {
  const allocations = getAllocationsForCard(card.id)
  const hasAllocations = allocations.length > 0

  const message = hasAllocations
    ? `Esta carta está asignada en ${allocations.length} mazo(s). Se moverá a wishlist en esos mazos.`
    : `¿Eliminar "${card.name}" de tu colección?`

  const confirmed = await confirmStore.show({
    title: `Eliminar "${card.name}"`,
    message,
    confirmText: 'ELIMINAR',
    cancelText: 'CANCELAR',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  const deletePromise = collectionStore.deleteCard(card.id)
  const convertPromise = hasAllocations
    ? decksStore.convertAllocationsToWishlist(card)
    : Promise.resolve()

  const [deleteResult, convertResult] = await Promise.allSettled([deletePromise, convertPromise])

  if (deleteResult.status === 'fulfilled' && deleteResult.value) {
    toastStore.show(`"${card.name}" eliminada`, 'success')
  }

  if (convertResult.status === 'rejected') {
    console.error('Error converting allocations:', convertResult.reason)
    toastStore.show(t('decks.messages.allocateError'), 'error')
  }
}

// Handler cuando se cierra el modal de detalle
const handleCardDetailClosed = () => {
  showCardDetailModal.value = false
  selectedCard.value = null
}

// ========== SLOW-LOAD TOAST ==========
let slowLoadTimer: ReturnType<typeof setTimeout> | null = null

function startSlowLoadTimer() {
  slowLoadTimer = setTimeout(() => {
    toastStore.show(t('collection.pagination.slowLoad'), 'info')
    slowLoadTimer = null
  }, 3000)
}

function cancelSlowLoadTimer() {
  if (slowLoadTimer !== null) {
    clearTimeout(slowLoadTimer)
    slowLoadTimer = null
  }
}

watch(() => collectionStore.loading, (isLoading) => {
  if (!isLoading) {
    cancelSlowLoadTimer()
  }
})

// ========== LIFECYCLE ==========

const initView = async () => {
  startSlowLoadTimer()

  try {
    await Promise.all([
      collectionStore.loadCollection(),
      decksStore.loadDecks(),
      binderStore.loadBinders()
    ])

    // Trigger initial server-side paginated query
    triggerPaginationQuery()

    // Legacy redirect: ?deck= and ?binder= query params (from old /collection?deck=X links)
    const deckParam = route.query.deck as string | undefined
    if (deckParam && decksStore.decks.some(d => d.id === deckParam)) {
      void router.replace({ path: `/decks/${deckParam}` })
      return
    }

    const binderParam = route.query.binder as string | undefined
    if (binderParam && binderStore.binders.some(b => b.id === binderParam)) {
      void router.replace({ path: `/binders/${binderParam}` })
      return
    }

    // Legacy: ?from=decks / ?from=binders → navigate to respective views
    const fromParam = route.query.from as string | undefined
    if (fromParam === 'decks') {
      void router.replace({ path: '/decks' })
    } else if (fromParam === 'binders') {
      void router.replace({ path: '/binders' })
    }
  } catch (_err) {
    toastStore.show(t('common.messages.loadError'), 'error')
  }
}

onMounted(() => {
  // NEVER await onMounted — use void pattern per CLAUDE.md
  void initView()
})

// Ref for wishlist section to scroll to
const wishlistSectionRef = ref<HTMLElement | null>(null)

// Watch for filter query parameter (from navigation links)
watch(() => route.query.filter, (newFilter, oldFilter) => {
  if (newFilter === 'wishlist') {
    statusFilter.value = 'wishlist'
    setTimeout(() => {
      wishlistSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  } else if (oldFilter === 'wishlist' && !newFilter) {
    statusFilter.value = 'all'
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 100)
  }
}, { immediate: true })

// Watch for addCard query parameter (from GlobalSearch) — redirect to search view
watch(() => route.query.addCard, (cardName) => {
  if (cardName && typeof cardName === 'string') {
    void router.replace({ path: '/search', query: { q: cardName } })
  }
}, { immediate: true })

// Watch for action=add query param (from mobile header "+")
watch(() => route.query.action, (action) => {
  if (action === 'add') {
    showAddCardModal.value = true
    void router.replace({ path: '/collection', query: { ...route.query, action: undefined } })
  }
}, { immediate: true })

onUnmounted(() => {
  cancelSlowLoadTimer()
})

// Keyboard shortcut: "n" to open add card modal
const handleKeyboardShortcut = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    showAddCardModal.value = true
  }

  if (e.key === 'Escape') {
    if (showAddCardModal.value) {
      showAddCardModal.value = false
    } else if (showCardDetailModal.value) {
      showCardDetailModal.value = false
      selectedCard.value = null
    } else if (showManageDecksModal.value) {
      showManageDecksModal.value = false
      selectedCard.value = null
    } else if (showCreateDeckModal.value) {
      showCreateDeckModal.value = false
    } else if (showCreateBinderModal.value) {
      showCreateBinderModal.value = false
    }
  }
}

onMounted(() => {
  globalThis.addEventListener('keydown', handleKeyboardShortcut)
})

onUnmounted(() => {
  globalThis.removeEventListener('keydown', handleKeyboardShortcut)
})
</script>

<template>
  <AppContainer>
    <!-- ========== HEADER ========== -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-h1 font-bold text-silver">{{ t('collection.title') }}</h1>
        <p class="text-small text-silver-70">
          {{ t('collection.subtitle', { owned: ownedCount }) }}
          <span v-if="wishlistTotalCount > 0" class="text-yellow-400">• {{ t('collection.wishlistCount', { count: wishlistTotalCount }) }}</span>
        </p>
      </div>
      <div class="flex gap-2" data-tour="add-card-btn">
        <BaseButton size="small" variant="secondary" @click="selectedScryfallCard = undefined; showAddCardModal = true">
          <SvgIcon name="plus" size="tiny" class="inline-block mr-1" />
          {{ t('collection.actions.addCard') }}
        </BaseButton>
      </div>
    </div>

    <!-- ========== CONTENIDO PRINCIPAL ========== -->
    <div class="mt-6 pb-20">
      <div>
        <!-- ========== MAIN TABS: COLECCIÓN / MAZOS / BINDERS ========== -->
        <div class="mb-6">
          <div class="flex gap-1 mb-4">
            <RouterLink
                to="/collection"
                class="flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center bg-neon text-primary"
            >
              {{ t('collection.tabs.collection') }}
            </RouterLink>
            <RouterLink
                data-tour="deck-tab"
                to="/decks"
                class="flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center border border-silver-10 text-silver-70 hover:text-silver hover:border-silver-30"
            >
              {{ t('collection.tabs.decks') }}
              <span class="ml-1 opacity-70">({{ decksList.length }})</span>
            </RouterLink>
            <RouterLink
                to="/binders"
                class="flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center border border-silver-10 text-silver-70 hover:text-silver hover:border-silver-30"
            >
              {{ t('collection.tabs.binders') }}
              <span class="ml-1 opacity-70">({{ bindersList.length }})</span>
            </RouterLink>
          </div>
        </div>

        <!-- ========== STATUS FILTERS ========== -->
        <div data-tour="status-filters" class="flex flex-wrap items-center gap-2 mb-4 pb-2">
          <div
              v-for="(count, status) in {
                'all': collectionCards.length,
                'collection': collectionCount,
                'available': availableCount,
                'wishlist': wishlistTotalCount
              }"
              :key="status"
              class="flex items-center gap-1"
          >
            <button
                @click="statusFilter = status as typeof statusFilter"
                :class="[
                  'px-3 py-1 text-tiny font-bold whitespace-nowrap transition-150 rounded',
                  statusFilter === status
                    ? 'bg-neon text-primary'
                    : 'border border-silver-10 text-silver-50 hover:text-silver hover:border-silver-30'
                ]"
            >
              {{ getStatusLabel(status) }}
              <span class="ml-1" :class="statusFilter === status ? 'text-primary' : 'text-neon'">({{ count }})</span>
            </button>
            <HelpTooltip
                v-if="status === 'collection'"
                :text="t('help.tooltips.collection.statusCollection')"
                :title="t('help.titles.statusCollection')"
            />
            <HelpTooltip
                v-else-if="status === 'available'"
                :text="`${t('help.tooltips.collection.statusSale') } ${ t('help.tooltips.collection.statusTrade')}`"
                :title="t('help.titles.statusAvailable')"
            />
            <HelpTooltip
                v-else-if="status === 'wishlist'"
                :text="t('help.tooltips.collection.statusWishlist')"
                :title="t('help.titles.statusWishlist')"
            />
          </div>
        </div>

        <!-- ========== SEARCH + SORT + VIEW ========== -->
        <CardFilterBar
            v-model:filter-query="filterQuery"
            v-model:sort-by="sortBy"
            v-model:group-by="collectionGroupBy"
            view-mode="collection"
            :show-bulk-select="true"
            :selection-mode="selectionMode"
            :show-view-type="true"
            :view-type="viewType"
            :active-filter-count="activeChipFilterCount"
            @toggle-bulk-select="toggleSelectionMode"
            @change-view-type="viewType = $event"
            @select-local-card="handleLocalCardSelect"
            @select-scryfall-card="handleScryfallSuggestionSelect"
            @open-advanced-search="handleOpenAdvancedSearch"
            @open-filters="showLocalFilters = true"
        />

        <AdvancedFilterModal
            :show="showLocalFilters"
            :filters="localAdvancedFilters"
            mode="local"
            :local-sets="collectionSets"
            :local-creature-types="collectionCreatureTypes"
            :exact-color-mode="exactColorMode"
            @close="showLocalFilters = false"
            @update:filters="handleLocalFiltersUpdate"
            @update:exact-color-mode="exactColorMode = $event"
            @reset="resetAllChipFilters"
        />

        <!-- ========== BULK SELECTION ACTION BAR ========== -->
        <div v-if="selectionMode" class="bg-silver-5 border border-silver-10 p-3 mb-4 rounded space-y-3 relative">
          <div v-if="bulkActionLoading" class="absolute inset-0 bg-primary/70 rounded flex flex-col items-center justify-center z-10 gap-2">
            <span class="text-small font-bold text-neon animate-pulse">
              {{ bulkActionProgress > 0 ? `${bulkActionProgress}%` : t('collection.bulkEdit.processing') }}
            </span>
            <div v-if="bulkActionProgress > 0" class="w-3/4 h-1 bg-silver-10 rounded overflow-hidden">
              <div class="h-full bg-neon transition-all duration-300" :style="{ width: `${bulkActionProgress}%` }"></div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="text-small font-bold text-silver">
                {{ t('collection.bulkDelete.selected', { count: selectedCardIds.size }) }}
              </span>
              <button
                  @click="selectAllFiltered"
                  :disabled="bulkActionLoading"
                  class="text-tiny text-neon hover:text-neon/80 underline transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {{ t('collection.bulkDelete.selectAll') }}
              </button>
              <button
                  v-if="selectedCardIds.size > 0"
                  @click="clearSelection"
                  :disabled="bulkActionLoading"
                  class="text-tiny text-silver-50 hover:text-silver underline transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {{ t('collection.bulkDelete.clearSelection') }}
              </button>
            </div>
            <BaseButton size="small" variant="secondary" :disabled="bulkActionLoading" @click="toggleSelectionMode">
              {{ t('common.actions.cancel') }}
            </BaseButton>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="text-tiny font-bold text-silver-50 uppercase w-14">{{ t('collection.bulkEdit.statusLabel') }}</span>
            <button
                :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                @click="handleBulkStatusChange('collection')"
                class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-neon/50 disabled:opacity-30 disabled:cursor-not-allowed text-neon"
            >
              <SvgIcon name="check" size="tiny" />
              {{ t('common.status.collection').toUpperCase() }}
            </button>
            <button
                :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                @click="handleBulkStatusChange('trade')"
                class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-blue-400/50 disabled:opacity-30 disabled:cursor-not-allowed text-blue-400"
            >
              <SvgIcon name="flip" size="tiny" />
              {{ t('common.status.trade').toUpperCase() }}
            </button>
            <button
                :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                @click="handleBulkStatusChange('sale')"
                class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-yellow-400/50 disabled:opacity-30 disabled:cursor-not-allowed text-yellow-400"
            >
              <SvgIcon name="money" size="tiny" />
              {{ t('common.status.sale').toUpperCase() }}
            </button>
            <button
                :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                @click="handleBulkStatusChange('wishlist')"
                class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-red-400/50 disabled:opacity-30 disabled:cursor-not-allowed text-red-400"
            >
              <SvgIcon name="star" size="tiny" />
              {{ t('common.status.wishlist').toUpperCase() }}
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="text-tiny font-bold text-silver-50 uppercase w-14">{{ t('collection.bulkEdit.visibilityLabel') }}</span>
            <button
                :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                @click="handleBulkPublicToggle(true)"
                class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-neon/50 disabled:opacity-30 disabled:cursor-not-allowed text-neon"
            >
              <SvgIcon name="eye-open" size="tiny" />
              {{ t('collection.bulkEdit.setPublic') }}
            </button>
            <button
                :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                @click="handleBulkPublicToggle(false)"
                class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-silver-50/50 disabled:opacity-30 disabled:cursor-not-allowed text-silver-50"
            >
              <SvgIcon name="eye-closed" size="tiny" />
              {{ t('collection.bulkEdit.setPrivate') }}
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="text-tiny font-bold text-silver-50 uppercase w-14">{{ t('collection.bulkEdit.addLabel') }}</span>

            <div class="relative">
              <button
                  :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                  @click="showBulkDeckPicker = !showBulkDeckPicker; showBulkBinderPicker = false"
                  class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-neon/50 disabled:opacity-30 disabled:cursor-not-allowed text-neon"
              >
                <SvgIcon name="box" size="tiny" />
                {{ t('collection.bulkEdit.deck') }} ▾
              </button>
              <div v-if="showBulkDeckPicker" class="absolute top-full left-0 mt-1 z-20 bg-primary border border-silver-10 rounded shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
                <button
                    v-for="deck in decksList"
                    :key="deck.id"
                    @click="handleBulkAllocateToDeck(deck.id)"
                    class="w-full text-left px-3 py-2 text-tiny text-silver hover:bg-silver-5 transition-colors"
                >
                  {{ deck.name }}
                </button>
                <button
                    @click="handleBulkCreateDeck"
                    class="w-full text-left px-3 py-2 text-tiny text-neon hover:bg-silver-5 transition-colors border-t border-silver-10"
                >
                  {{ t('collection.bulkEdit.newDeck') }}
                </button>
              </div>
            </div>

            <div class="relative">
              <button
                  :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                  @click="showBulkBinderPicker = !showBulkBinderPicker; showBulkDeckPicker = false"
                  class="flex items-center gap-1 px-2 py-1 rounded border border-silver-10 text-tiny font-bold transition-colors hover:border-neon/50 disabled:opacity-30 disabled:cursor-not-allowed text-neon"
              >
                <SvgIcon name="collection" size="tiny" />
                {{ t('collection.bulkEdit.binder') }} ▾
              </button>
              <div v-if="showBulkBinderPicker" class="absolute top-full left-0 mt-1 z-20 bg-primary border border-silver-10 rounded shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
                <button
                    v-for="binder in bindersList"
                    :key="binder.id"
                    @click="handleBulkAllocateToBinder(binder.id)"
                    class="w-full text-left px-3 py-2 text-tiny text-silver hover:bg-silver-5 transition-colors"
                >
                  {{ binder.name }}
                </button>
                <button
                    @click="handleBulkCreateBinder"
                    class="w-full text-left px-3 py-2 text-tiny text-neon hover:bg-silver-5 transition-colors border-t border-silver-10"
                >
                  {{ t('collection.bulkEdit.newBinder') }}
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <BaseButton
                size="small"
                variant="danger"
                :disabled="selectedCardIds.size === 0 || bulkActionLoading"
                @click="handleBulkDelete"
            >
              {{ t('collection.bulkDelete.deleteSelected', { count: selectedCardIds.size }) }}
            </BaseButton>
          </div>
        </div>

        <!-- Loading spinner + skeleton -->
        <div v-if="collectionStore.loading && collectionStore.cards.length === 0">
          <div class="flex flex-col items-center justify-center py-12 mb-6">
            <div class="w-10 h-10 border-4 border-silver-20 border-t-neon rounded-full animate-spin mb-4" />
            <p class="text-small text-silver-70">{{ t('collection.pagination.loading') }}</p>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <SkeletonCard v-for="n in 10" :key="n" />
          </div>
        </div>

        <!-- ========== CARDS GRID ========== -->
        <div v-if="(collectionDisplayCards.length > 0 || collectionStore.paginationMeta.loading) && statusFilter !== 'wishlist'">
          <div class="flex items-center gap-2 mb-4">
            <h3 class="text-body font-bold text-silver">{{ t('collection.sections.myCards') }}</h3>
            <span class="text-small text-silver-50">
              <template v-if="paginatedCardCount.total > paginatedCardCount.showing">
                ({{ t('collection.pagination.showingOf', { count: paginatedCardCount.showing, total: paginatedCardCount.total }) }})
              </template>
              <template v-else>
                ({{ paginatedCardCount.showing }})
              </template>
            </span>
          </div>

          <div v-for="group in groupedFilteredCards" :key="group.type" class="mb-6">
            <div v-if="group.type !== 'all'" class="flex items-center gap-2 mb-3 pb-2 border-b border-silver-20">
              <h4 class="text-tiny font-bold text-neon uppercase">{{ translateCategory(group.type) }}</h4>
              <span class="text-tiny text-silver-50">({{ getGroupCardCount(group.cards) }})</span>
            </div>
            <CollectionGrid
                :cards="group.type === 'all' ? collectionDisplayCards : group.cards"
                :compact="viewType === 'texto'"
                :deleting-card-ids="deletingCardIds"
                :selection-mode="selectionMode"
                :selected-card-ids="selectedCardIds"
                :on-load-more="group.type === 'all' ? collectionStore.loadNextPage : undefined"
                :loading-more="group.type === 'all' ? collectionStore.paginationMeta.loadingMore : false"
                @card-click="handleCardClick"
                @delete="handleDelete"
                @toggle-select="toggleCardSelection"
            />
          </div>
        </div>

        <!-- ========== WISHLIST GENERAL ========== -->
        <div ref="wishlistSectionRef" v-if="wishlistCards.length > 0 && (statusFilter === 'all' || statusFilter === 'wishlist')" class="mt-8">
          <div class="flex items-center gap-2 mb-4">
            <h3 class="text-small font-bold text-yellow-400">{{ t('collection.sections.myWishlist') }}</h3>
            <span class="text-tiny text-silver-50">({{ wishlistCount }})</span>
          </div>

          <div v-for="group in groupedWishlistCards" :key="group.type" class="mb-6">
            <div v-if="group.type !== 'all'" class="flex items-center gap-2 mb-3 pb-2 border-b border-yellow-400/30">
              <h4 class="text-tiny font-bold text-yellow-400 uppercase">{{ translateCategory(group.type) }}</h4>
              <span class="text-tiny text-silver-50">({{ getGroupCardCount(group.cards) }})</span>
            </div>
            <CollectionGrid
                :cards="group.cards"
                :compact="viewType === 'texto'"
                :deleting-card-ids="deletingCardIds"
                :selection-mode="selectionMode"
                :selected-card-ids="selectedCardIds"
                @card-click="handleCardClick"
                @delete="handleDelete"
                @toggle-select="toggleCardSelection"
            />
          </div>
        </div>

        <!-- Empty State: No filter results -->
        <div v-if="!collectionStore.loading
                    && !collectionStore.paginationMeta.loading
                    && collectionStore.cards.length > 0
                    && collectionDisplayCards.length === 0 && wishlistCards.length === 0"
             class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">{{ t('collection.empty.noFilterResults') }}</p>
            <button class="mt-3 text-tiny text-neon hover:underline" @click="clearAllFilters">
              {{ t('collection.empty.clearFilters') }}
            </button>
          </div>
        </div>

        <!-- Empty State: Genuinely empty collection -->
        <div v-if="!collectionStore.loading && collectionStore.cards.length === 0"
             class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">{{ t('collection.empty.noCards') }}</p>
            <p class="text-tiny text-silver-70 mt-1">{{ t('collection.empty.searchToAdd') }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== MODALS ========== -->

    <AddCardModal
        :show="showAddCardModal"
        :scryfall-card="selectedScryfallCard"
        @close="handleAddCardModalClose"
        @added="handleAddCardModalClose"
    />

    <CardDetailModal
        :show="showCardDetailModal"
        :card="selectedCard"
        @close="handleCardDetailClosed"
        @saved="handleCardDetailClosed"
    />

    <ManageDecksModal
        :show="showManageDecksModal"
        :card="selectedCard"
        @close="showManageDecksModal = false; selectedCard = null"
    />

    <CreateDeckModal
        ref="createDeckModalRef"
        :show="showCreateDeckModal"
        @close="showCreateDeckModal = false"
        @create="handleCreateDeck"
    />

    <CreateBinderModal
        ref="createBinderModalRef"
        :show="showCreateBinderModal"
        @close="showCreateBinderModal = false"
        @create="handleCreateBinder"
    />
</AppContainer>

  <!-- Floating Action Button (mobile) -->
  <Teleport to="body">
    <FloatingActionButton
        icon="plus"
        :label="t('collection.fab.addCard')"
        @click="showAddCardModal = true"
        :style="totalsPanelExpanded ? { bottom: 'calc(10rem + env(safe-area-inset-bottom, 0px))' } : { bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }"
    />
  </Teleport>

  <!-- ========== COLLECTION STATS FOOTER ========== -->
  <Teleport to="body">
    <CollectionTotalsPanel @update:expanded="totalsPanelExpanded = $event" />
  </Teleport>
</template>

<style scoped>
button {
  transition: all 150ms ease-out;
}

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
