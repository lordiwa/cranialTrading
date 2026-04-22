<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import AppContainer from '../components/layout/AppContainer.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import BulkSelectionActionBar from '../components/collection/BulkSelectionActionBar.vue'
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
import { type ScryfallCard } from '../services/scryfallCache'
import SvgIcon from '../components/ui/SvgIcon.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import FloatingActionButton from '../components/ui/FloatingActionButton.vue'
import CardFilterBar from '../components/ui/CardFilterBar.vue'
import DiscoveryPanel from '../components/discovery/DiscoveryPanel.vue'
import { useDiscoveryAddCard } from '../composables/useDiscoveryAddCard'
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
// Search text that drives ONLY the DiscoveryPanel (Scryfall search),
// deliberately decoupled from the local grid so typing doesn't shrink the collection view.
const discoverQuery = ref('')

// Totals panel expanded state (for FAB positioning)
const totalsPanelExpanded = ref(false)

// Selección de cartas
const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<ScryfallCard | undefined>(undefined)

// Discovery panel state (SCRUM-34)
const discoveryVersionTrigger = ref<{ name: string; key: number } | null>(null)

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
  // Advanced filter state still consumed by useCollectionPagination's filterState
  advPriceMin,
  advPriceMax,
  advFoilFilter,
  advSelectedSets,
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

const clearAllFilters = () => {
  discoverQuery.value = ''
  filterQuery.value = ''
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
    case 'name': return card.name ?? 'Unknown'
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
  const remaining = Object.keys(groups).filter(c => !order.includes(c)).sort((a, b) => a.localeCompare(b))
  for (const category of remaining) {
    // eslint-disable-next-line security/detect-object-injection
    const group = groups[category]
    if (group && group.length > 0) {
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
const pendingBulkAllocateDeck = ref(false)
const pendingBulkAllocateBinder = ref(false)

const handleBulkAllocateToDeck = async (deckId: string) => {
  if (selectedCardIds.value.size === 0 || bulkActionLoading.value) return
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
  bulkActionLoading.value = true
  try {
    await performBulkBinderAllocate(binderId)
  } finally {
    bulkActionLoading.value = false
  }
}

const handleBulkCreateDeck = () => {
  showCreateDeckModal.value = true
  pendingBulkAllocateDeck.value = true
}

const handleBulkCreateBinder = () => {
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

// Click on local card suggestion → feed its name to the search input so Discovery searches it
const handleLocalCardSelect = (card: Card) => {
  discoverQuery.value = card.name
}

// Click on Scryfall suggestion → place text in the search input so the DiscoveryPanel picks it up
const handleScryfallSuggestionSelect = (cardName: string) => {
  discoverQuery.value = cardName
}

// Discovery panel add-card orchestration (SCRUM-34)
const discoveryAdd = useDiscoveryAddCard('collection', {
  collectionStore: {
    addCard: collectionStore.addCard,
    cards: computed(() => collectionStore.cards),
  },
  decksStore: { allocateCardToDeck: decksStore.allocateCardToDeck },
  bindersStore: {
    allocateCardToBinder: binderStore.allocateCardToBinder,
    binders: computed(() => binderStore.binders),
  },
  toastStore: { show: (m, k) => toastStore.show(m, k ?? 'info') },
  t,
  selectedDeckId: computed(() => undefined),
  selectedBinderId: computed(() => undefined),
})

const handleDiscoveryAddCollection = (print: ScryfallCard, status: CardStatus) => {
  void discoveryAdd.addToCollection(print, status)
}
const handleDiscoveryOpenAddModal = (print: ScryfallCard) => {
  selectedScryfallCard.value = print
  showAddCardModal.value = true
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
            v-model:filter-query="discoverQuery"
            v-model:sort-by="sortBy"
            v-model:group-by="collectionGroupBy"
            view-mode="collection"
            :show-bulk-select="true"
            :selection-mode="selectionMode"
            :show-view-type="true"
            :view-type="viewType"
            @toggle-bulk-select="toggleSelectionMode"
            @change-view-type="viewType = $event"
            @select-local-card="handleLocalCardSelect"
            @select-scryfall-card="handleScryfallSuggestionSelect"
        />

        <!-- ========== DISCOVERY PANEL (SCRUM-34) ========== -->
        <DiscoveryPanel
            scope="collection"
            :search-query="discoverQuery"
            :collection-cards="collectionStore.cards"
            :version-trigger="discoveryVersionTrigger"
            :default-collection-status="statusFilter === 'all' || statusFilter === 'owned' || statusFilter === 'available' ? 'collection' : statusFilter"
            @add-to-collection="handleDiscoveryAddCollection"
            @open-add-modal="handleDiscoveryOpenAddModal"
        />

        <!-- ========== BULK SELECTION ACTION BAR ========== -->
        <BulkSelectionActionBar
            v-if="selectionMode"
            :selected-count="selectedCardIds.size"
            :bulk-action-loading="bulkActionLoading"
            :bulk-action-progress="bulkActionProgress"
            :decks="decksList"
            :binders="bindersList"
            @toggle-selection-mode="toggleSelectionMode"
            @select-all="selectAllFiltered"
            @clear-selection="clearSelection"
            @change-status="handleBulkStatusChange"
            @toggle-public="handleBulkPublicToggle"
            @allocate-to-deck="handleBulkAllocateToDeck"
            @allocate-to-binder="handleBulkAllocateToBinder"
            @create-deck="handleBulkCreateDeck"
            @create-binder="handleBulkCreateBinder"
            @delete="handleBulkDelete"
        />

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
              <span v-if="collectionGroupBy === 'name'" class="text-tiny text-silver-50">
                ({{ t('collection.group.prints', { n: group.cards.length }) }})
              </span>
              <span v-else class="text-tiny text-silver-50">({{ getGroupCardCount(group.cards) }})</span>
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
              <span v-if="collectionGroupBy === 'name'" class="text-tiny text-silver-50">
                ({{ t('collection.group.prints', { n: group.cards.length }) }})
              </span>
              <span v-else class="text-tiny text-silver-50">({{ getGroupCardCount(group.cards) }})</span>
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
