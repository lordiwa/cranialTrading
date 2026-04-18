<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { usePromptStore } from '../stores/prompt'
import { useI18n } from '../composables/useI18n'
import AppContainer from '../components/layout/AppContainer.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import CardDetailModal from '../components/collection/CardDetailModal.vue'
import ManageDecksModal from '../components/collection/ManageDecksModal.vue'
import ImportDeckModal from '../components/collection/ImportDeckModal.vue'
import CreateDeckModal from '../components/decks/CreateDeckModal.vue'
import DeckEditorGrid from '../components/decks/DeckEditorGrid.vue'
import DeckStatsFooter from '../components/decks/DeckStatsFooter.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import FloatingActionButton from '../components/ui/FloatingActionButton.vue'
import CardFilterBar from '../components/ui/CardFilterBar.vue'
import { type Card, type CardStatus } from '../types/card'
import type { CreateDeckInput, DisplayDeckCard } from '../types/deck'
import { useBindersStore } from '../stores/binders'
import { useDecksStore } from '../stores/decks'
import { useCardAllocation } from '../composables/useCardAllocation'
import { type ScryfallCard, searchCards } from '../services/scryfallCache'
import { buildManaboxCsv, buildMoxfieldCsv, downloadAsFile } from '../utils/cardHelpers'
import { useCardFilter } from '../composables/useCardFilter'
import { useCollectionTotals } from '../composables/useCollectionTotals'
import { useCollectionImport } from '../composables/useCollectionImport'
import { useDeckDeletion } from '../composables/useDeckDeletion'
import { useDeckDisplayCards } from '../composables/useDeckDisplayCards'

const route = useRoute()
const router = useRouter()
const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const binderStore = useBindersStore()
const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const promptStore = usePromptStore()
const { t } = useI18n()
const { getAllocationsForCard } = useCardAllocation()

// ========== STATE ==========

const showAddCardModal = ref(false)
const showCardDetailModal = ref(false)
const showManageDecksModal = ref(false)
const showCreateDeckModal = ref(false)
const createDeckModalRef = ref<{ setLoading: (v: boolean) => void } | null>(null)
const showImportDeckModal = ref(false)

const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<ScryfallCard | undefined>(undefined)

// statusFilter and binderFilter are unused in this view but the composable contracts
// require Refs — use local constants so URL sync / import still compiles cleanly.
const statusFilter = ref<'all' | 'owned' | 'available' | CardStatus>('all')
const binderFilter = ref<string>('all')

const deckFilter = ref<string>('all')

// ========== COMPUTED ==========

const collectionCards = computed(() => collectionStore.cards)

const decksList = computed(() => decksStore.decks)

const selectedDeck = computed(() => {
  if (deckFilter.value === 'all') return null
  return decksStore.decks.find(d => d.id === deckFilter.value) ?? null
})

// ========== IMPORT + DELETE COMPOSABLES ==========

const {
  importProgress,
  isDeckImporting,
  getImportProgress,
  handleImport,
  handleImportDirect,
  handleImportCsv,
  resumeImport,
  clearImportState,
  loadImportState,
} = useCollectionImport({
  collectionStore,
  decksStore,
  binderStore,
  toastStore,
  confirmStore,
  t,
  deckFilter,
  binderFilter,
  statusFilter,
  showImportDeckModal,
})

const {
  deleteDeckProgress,
  isDeletingDeck,
  deleteProgress,
  handleDeleteDeck,
  resumeDeleteDeck,
  clearDeleteDeckState,
  loadDeleteDeckState,
} = useDeckDeletion({
  decksStore,
  collectionStore,
  toastStore,
  confirmStore,
  t,
  deckFilter,
  selectedDeck,
})

// Stats del deck seleccionado
const selectedDeckStats = computed(() => {
  if (!selectedDeck.value) return null
  return selectedDeck.value.stats
})

// Wishlist del deck actual (legacy DeckWishlistItem[]) — used by cost/count computeds below
const deckWishlistCards = computed(() => {
  if (!selectedDeck.value) return []
  return selectedDeck.value.wishlist ?? []
})

// ========== CARD FILTER COMPOSABLE (deck cards) ==========
// Deck view uses useCardFilter for text search / sort; chip filters are forwarded to DeckEditorGrid
const {
  filterQuery,
  sortBy,
  groupBy: deckGroupBy,
  selectedColors,
  exactColorMode,
  selectedManaValues,
  selectedTypes,
  selectedRarities,
} = useCardFilter(collectionCards)

// ========== DECK DISPLAY CARDS (hydration + filtering + counts + commander) ==========
const {
  mainboardDisplayCards,
  sideboardDisplayCards,
  filteredMainboardDisplayCards,
  filteredSideboardDisplayCards,
  mainboardOwnedCount,
  sideboardOwnedCount,
  mainboardWishlistCount,
  sideboardWishlistCount,
  deckOwnedCards,
  deckAllocWishlistCards,
  isCommanderFormat,
  commanderNames,
} = useDeckDisplayCards({
  selectedDeck,
  collectionCards,
  filterQuery,
})

// ¿Todas las cartas del deck son públicas?
const isDeckPublic = computed(() => {
  if (deckOwnedCards.value.length === 0) return true
  return deckOwnedCards.value.every(card => card.public !== false)
})

const deckOwnedCount = computed(() => {
  return deckOwnedCards.value.reduce((sum, card) => {
    const allocations = getAllocationsForCard(card.id)
    const totalQty = allocations
      .filter(a => a.deckId === deckFilter.value)
      .reduce((s, a) => s + a.quantity, 0)
    return sum + totalQty
  }, 0)
})

const deckWishlistCount = computed(() => {
  const legacyCount = deckWishlistCards.value.reduce((sum, item) => sum + item.quantity, 0)
  const allocCount = deckAllocWishlistCards.value.reduce((sum, { alloc }) => sum + alloc.quantity, 0)
  return legacyCount + allocCount
})

// ========== DECK PRICE SOURCE ==========
type DeckPriceSource = 'tcg' | 'ck' | 'buylist'
const deckPriceSource = ref<DeckPriceSource>('ck')

const { cardPrices: sharedCardPrices } = useCollectionTotals(() => collectionCards.value)

const getCardPriceBySource = (cardId: string, cardPrice: number, source: DeckPriceSource): number => {
  if (source === 'tcg') return cardPrice ?? 0
  const prices = sharedCardPrices.value.get(cardId)
  if (!prices) return cardPrice ?? 0
  if (source === 'ck') return prices.cardKingdom?.retail ?? cardPrice ?? 0
  return prices.cardKingdom?.buylist ?? 0
}

const deckOwnedCostBySource = computed(() => {
  if (deckFilter.value === 'all') return 0
  return deckOwnedCards.value.reduce((sum, card) => {
    const allocations = getAllocationsForCard(card.id)
    const totalQty = allocations
      .filter(a => a.deckId === deckFilter.value)
      .reduce((s, a) => s + a.quantity, 0)
    return sum + getCardPriceBySource(card.id, card.price, deckPriceSource.value) * totalQty
  }, 0)
})

const deckWishlistCostBySource = computed(() => {
  if (deckFilter.value === 'all') return 0
  const legacyCost = deckWishlistCards.value.reduce((sum, item) =>
    sum + (item.price ?? 0) * item.quantity, 0
  )
  const allocCost = deckAllocWishlistCards.value.reduce((sum, { card, alloc }) =>
    sum + getCardPriceBySource(card.id, card.price, deckPriceSource.value) * alloc.quantity, 0
  )
  return legacyCost + allocCost
})

const deckTotalCostBySource = computed(() => {
  return deckOwnedCostBySource.value + deckWishlistCostBySource.value
})

const deckSourceColor = computed(() => {
  if (deckPriceSource.value === 'ck') return 'text-[#4CAF50]'
  if (deckPriceSource.value === 'buylist') return 'text-[#FF9800]'
  return 'text-neon'
})

const deckStatsExpanded = ref(false)

const fabBottomStyle = computed(() => {
  if (!selectedDeck.value) return { bottom: '4rem' }
  if (deckStatsExpanded.value) return { bottom: 'calc(10rem + env(safe-area-inset-bottom, 0px))' }
  return { bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }
})

const deckActiveSourceLabel = computed(() => {
  if (deckPriceSource.value === 'ck') return 'CK'
  if (deckPriceSource.value === 'buylist') return 'BUY'
  return 'TCG'
})

// ========== METHODS ==========

const handleLocalCardSelect = (card: Card) => {
  if (deckFilter.value !== 'all') {
    filterQuery.value = ''
    void quickAllocateCardToDeck(card)
  } else {
    filterQuery.value = ''
    selectedCard.value = card
    showCardDetailModal.value = true
  }
}

const quickAllocateCardToDeck = async (card: Card) => {
  if (deckFilter.value === 'all') return
  const result = await decksStore.allocateCardToDeck(deckFilter.value, card.id, 1, false)
  if (result.allocated > 0) {
    toastStore.show(t('collection.quickAdd.allocated', { name: card.name }), 'success')
  } else if (result.wishlisted > 0) {
    toastStore.show(t('collection.quickAdd.wishlisted', { name: card.name }), 'info')
  }
}

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

const handleAddCardModalClose = () => {
  showAddCardModal.value = false
  selectedScryfallCard.value = undefined
}

const handleCardDetailClosed = () => {
  showCardDetailModal.value = false
  selectedCard.value = null
}

// ========== DECK EDITOR GRID HANDLERS ==========

const handleDeckGridEdit = async (displayCard: DisplayDeckCard) => {
  if (displayCard.isWishlist) {
    try {
      const results = await searchCards(`!"${displayCard.name}" set:${displayCard.edition}`)
      if (results.length > 0) {
        selectedScryfallCard.value = results[0]
        showAddCardModal.value = true
      }
    } catch (err) {
      console.error('Error searching wishlist card:', err)
    }
  } else {
    const card = collectionStore.cards.find(c => c.id === displayCard.cardId)
    if (card) {
      selectedCard.value = card
      showCardDetailModal.value = true
    }
  }
}

const handleDeckGridRemove = async (displayCard: DisplayDeckCard) => {
  if (!selectedDeck.value) return

  const cardName = displayCard.name
  const cardId = displayCard.cardId
  const isWishlist = displayCard.isWishlist
  const confirmed = await confirmStore.show({
    title: `Eliminar del deck`,
    message: `¿Eliminar "${cardName}" del deck?`,
    confirmText: 'ELIMINAR',
    cancelText: 'CANCELAR',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  if (isWishlist) {
    if (cardId) {
      await decksStore.deallocateCard(selectedDeck.value.id, cardId, displayCard.isInSideboard)
    } else {
      await decksStore.removeFromWishlist(
        selectedDeck.value.id,
        displayCard.scryfallId,
        displayCard.edition,
        displayCard.condition,
        displayCard.foil,
        displayCard.isInSideboard
      )
    }
  } else {
    await decksStore.deallocateCard(selectedDeck.value.id, cardId, displayCard.isInSideboard)
  }

  if (cardId) {
    const removeFromCollection = await confirmStore.show({
      title: cardName,
      message: t('decks.messages.removeFromCollectionToo'),
      confirmText: t('common.actions.delete'),
      cancelText: t('common.actions.cancel'),
      confirmVariant: 'danger'
    })
    if (removeFromCollection) {
      await collectionStore.deleteCard(cardId)
      toastStore.show(t('decks.messages.removedFromCollectionToo'), 'success')
    } else {
      toastStore.show(t('decks.editor.messages.cardRemoved'), 'success')
    }
  } else {
    toastStore.show(t('decks.editor.messages.cardRemoved'), 'success')
  }
}

const handleDeckGridQuantityUpdate = async (displayCard: DisplayDeckCard, newQuantity: number) => {
  if (!selectedDeck.value) return

  if (!displayCard.isWishlist || displayCard.cardId) {
    const cardId = displayCard.cardId
    if (!cardId) return

    const ok = await decksStore.updateAllocation(
      selectedDeck.value.id,
      cardId,
      displayCard.isInSideboard,
      newQuantity,
      true
    )

    if (ok) {
      const wasDecrement = newQuantity < displayCard.allocatedQuantity
      if (wasDecrement && cardId) {
        const removeFromCollection = await confirmStore.show({
          title: displayCard.name,
          message: t('decks.messages.removeFromCollectionToo'),
          confirmText: t('common.actions.delete'),
          cancelText: t('common.actions.cancel'),
          confirmVariant: 'danger'
        })
        if (removeFromCollection) {
          const card = collectionStore.getCardById(cardId)
          if (card) {
            if (card.quantity <= 1) {
              await collectionStore.deleteCard(cardId)
            } else {
              await collectionStore.updateCard(cardId, { quantity: card.quantity - 1 })
            }
            toastStore.show(t('decks.messages.removedFromCollectionToo'), 'success')
          }
        } else {
          toastStore.show(t('decks.editor.messages.quantityUpdated'), 'success')
        }
      } else {
        toastStore.show(t('decks.editor.messages.quantityUpdated'), 'success')
      }
    } else if (newQuantity > displayCard.allocatedQuantity) {
      const card = collectionStore.getCardById(cardId)
      if (!card) return
      const totalAllocated = decksStore.getTotalAllocatedForCard(cardId)
      const maxAvailable = card.quantity - totalAllocated + (displayCard.allocatedQuantity ?? 0)

      const addToCollection = await confirmStore.show({
        title: displayCard.name,
        message: t('decks.messages.exceedsAvailable', { max: maxAvailable }),
        confirmText: t('decks.messages.addToCollectionBtn'),
        cancelText: t('decks.messages.addToWishlistBtn'),
      })

      if (addToCollection) {
        await collectionStore.updateCard(cardId, { quantity: card.quantity + 1 })
        await decksStore.updateAllocation(selectedDeck.value.id, cardId, displayCard.isInSideboard, newQuantity)
        toastStore.show(t('decks.messages.addedToCollection'), 'success')
      } else {
        await decksStore.addToWishlist(selectedDeck.value.id, {
          scryfallId: displayCard.scryfallId,
          name: displayCard.name,
          edition: displayCard.edition,
          quantity: 1,
          isInSideboard: displayCard.isInSideboard,
          price: displayCard.price ?? 0,
          image: displayCard.image ?? '',
          condition: displayCard.condition,
          foil: displayCard.foil,
        })
        toastStore.show(t('decks.messages.addedToWishlistFromDeck'), 'success')
      }
    }
  }
}

const handleDeckGridAddToWishlist = (_displayCard: DisplayDeckCard) => {
  toastStore.show(t('decks.editor.messages.alreadyInWishlist'), 'info')
}

const handleDeckGridToggleCommander = async (displayCard: DisplayDeckCard) => {
  if (!selectedDeck.value) return
  await decksStore.toggleCommander(selectedDeck.value.id, displayCard.name)
}

const handleDeckGridMoveBoard = async (displayCard: DisplayDeckCard) => {
  if (!selectedDeck.value) return
  const record = displayCard as unknown as Record<string, unknown>
  const isInSideboard = !displayCard.isWishlist && record.isInSideboard === true
  const cardId = (record.cardId as string) ?? displayCard.cardId
  const currentQty = displayCard.isWishlist
    ? displayCard.requestedQuantity
    : displayCard.allocatedQuantity

  if (currentQty <= 1) {
    await decksStore.moveCardBoard(selectedDeck.value.id, cardId, isInSideboard)
    return
  }

  const targetBoard = isInSideboard
    ? t('decks.prompt.mainboard')
    : t('decks.prompt.sideboard')

  const requestedQty = await promptStore.show({
    title: t('decks.prompt.moveBoardTitle'),
    message: t('decks.prompt.moveBoardMessage', { name: displayCard.name, target: targetBoard }),
    inputLabel: t('decks.prompt.quantityLabel'),
    defaultValue: currentQty,
    min: 1,
  })
  if (requestedQty === null) return

  if (requestedQty <= currentQty) {
    await decksStore.moveCardBoard(selectedDeck.value.id, cardId, isInSideboard, requestedQty)
  } else {
    await decksStore.moveCardBoard(selectedDeck.value.id, cardId, isInSideboard, currentQty)

    const extraNeeded = requestedQty - currentQty
    const addExtras = await confirmStore.show({
      title: t('decks.prompt.addExtrasTitle'),
      message: t('decks.prompt.addExtrasMessage', { available: currentQty, extra: extraNeeded }),
    })
    if (!addExtras) return

    const toCollection = await confirmStore.show({
      title: t('decks.prompt.chooseDestination'),
      message: t('decks.prompt.chooseDestination'),
      confirmText: t('decks.prompt.addToCollection'),
      cancelText: t('decks.prompt.addToWishlist'),
    })

    const targetSideboard = !isInSideboard
    await decksStore.addExtraAllocation(
      selectedDeck.value.id,
      {
        scryfallId: displayCard.scryfallId,
        name: displayCard.name,
        edition: displayCard.edition,
        condition: displayCard.condition,
        foil: displayCard.foil,
        price: displayCard.price,
        image: displayCard.image,
        cmc: displayCard.cmc,
        type_line: displayCard.type_line,
        colors: displayCard.colors,
      },
      extraNeeded,
      targetSideboard,
      toCollection ? 'collection' : 'wishlist'
    )
  }
}

// ========== DECK MANAGEMENT ==========

const handleCreateDeck = async (deckData: CreateDeckInput) => {
  const modalRef = createDeckModalRef.value
  try {
    modalRef?.setLoading(true)
    const deckId = await decksStore.createDeck(deckData)
    if (!deckId) return

    showCreateDeckModal.value = false
    deckFilter.value = deckId
    // Update URL to reflect the newly-selected deck
    void router.replace({ path: `/decks/${deckId}` })
    toastStore.show(t('common.import.deckCreated', { name: deckData.name }), 'success')
  } catch (error) {
    console.error('Error in handleCreateDeck:', error)
    toastStore.show(t('decks.messages.createError'), 'error')
  } finally {
    modalRef?.setLoading(false)
  }
}

const handleToggleDeckPublic = async () => {
  if (!selectedDeck.value) return

  const cardIds = deckOwnedCards.value.map(c => c.id)
  if (cardIds.length === 0) {
    toastStore.show(t('decks.messages.noCardsInDeck'), 'info')
    return
  }

  const makePublic = !isDeckPublic.value

  try {
    await collectionStore.batchUpdateCards(cardIds, { public: makePublic })
    toastStore.show(
      makePublic
        ? t('decks.messages.cardsNowPublic', { count: cardIds.length })
        : t('decks.messages.cardsNowPrivate', { count: cardIds.length }),
      'success'
    )
  } catch (err) {
    console.error('Error actualizando visibilidad:', err)
    toastStore.show(t('cards.grid.visibilityError'), 'error')
  }
}

// Shared export-line builder
const buildExportLines = (
  mainboardCards: DisplayDeckCard[],
  sideboardCards: DisplayDeckCard[],
  isCommander: boolean,
  commanderName: string | undefined,
  getQty: (card: DisplayDeckCard) => number,
  getSet: (card: DisplayDeckCard) => string,
): string[] => {
  const lines: string[] = []
  const formatCards = (cards: DisplayDeckCard[]) =>
    cards.map(c => `${getQty(c)} ${c.name} (${getSet(c)})`)

  if (isCommander && commanderName) {
    const commanderCards = mainboardCards.filter(c => c.name === commanderName)
    if (commanderCards.length > 0) {
      lines.push('Commander', ...formatCards(commanderCards), '')
    }
  }

  const deckCards = isCommander && commanderName
    ? mainboardCards.filter(c => c.name !== commanderName)
    : mainboardCards

  if (deckCards.length > 0) {
    if (isCommander && commanderName) lines.push('Deck')
    lines.push(...formatCards(deckCards))
  }

  if (sideboardCards.length > 0) {
    lines.push('', 'Sideboard', ...formatCards(sideboardCards))
  }

  return lines
}

const handleExportDeck = async () => {
  if (!selectedDeck.value) return

  const setCodeMap = new Map<string, string>()
  for (const c of collectionStore.cards) {
    if (c.setCode) setCodeMap.set(c.id, c.setCode)
  }

  const getQty = (card: DisplayDeckCard): number => {
    return card.isWishlist ? card.requestedQuantity : card.allocatedQuantity
  }

  const getSet = (card: DisplayDeckCard): string => {
    if (!card.isWishlist) {
      const code = setCodeMap.get(card.cardId)
      if (code) return code.toUpperCase()
    }
    return card.edition
  }

  const isCommander = selectedDeck.value.format === 'commander'
  const commanderName = selectedDeck.value.commander

  const lines = buildExportLines(
    mainboardDisplayCards.value,
    sideboardDisplayCards.value,
    isCommander,
    commanderName,
    getQty,
    getSet,
  )

  const text = lines.join('\n')

  try {
    await navigator.clipboard.writeText(text)
    toastStore.show(t('decks.detail.exportCopied'), 'success')
  } catch {
    toastStore.show(t('decks.detail.exportError'), 'error')
  }
}

const handleExportDeckCsv = async () => {
  if (!selectedDeck.value) return

  const useMoxfield = await confirmStore.show({
    title: t('decks.detail.exportFormatTitle'),
    message: t('decks.detail.exportFormatMessage'),
    confirmText: 'MOXFIELD',
    cancelText: 'MANABOX',
  })

  const cardMap = new Map<string, typeof collectionStore.cards[number]>()
  for (const c of collectionStore.cards) {
    cardMap.set(c.id, c)
  }

  const allCards = [...mainboardDisplayCards.value, ...sideboardDisplayCards.value]
  const csvCards: Parameters<typeof buildMoxfieldCsv>[0] = []

  for (const card of allCards) {
    const qty = card.isWishlist ? card.requestedQuantity : card.allocatedQuantity
    let setCode = card.edition
    if (!card.isWishlist) {
      const col = cardMap.get(card.cardId)
      if (col?.setCode) setCode = col.setCode.toUpperCase()
    }

    csvCards.push({
      name: card.name,
      setCode,
      quantity: qty,
      foil: card.foil,
      scryfallId: card.scryfallId,
      price: card.price,
      condition: card.condition,
      language: card.language,
    })
  }

  const csv = useMoxfield ? buildMoxfieldCsv(csvCards) : buildManaboxCsv(csvCards)
  const filename = `${selectedDeck.value.name.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}.csv`
  downloadAsFile(csv, filename)
  toastStore.show(t('decks.detail.exportCsvDownloaded'), 'success')
}

// ========== LIFECYCLE ==========

const initView = async () => {
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      decksStore.loadDecks(),
      binderStore.loadBinders(),
    ])

    // Parse route.params.id to auto-select deck
    const paramId = route.params.id
    if (typeof paramId === 'string' && paramId) {
      if (decksStore.decks.some(d => d.id === paramId)) {
        deckFilter.value = paramId
      }
    }

    // Legacy redirect: ?deck= query (from old /collection?deck=X links)
    const deckParam = route.query.deck as string | undefined
    if (deckParam && decksStore.decks.some(d => d.id === deckParam)) {
      deckFilter.value = deckParam
      void router.replace({ path: `/decks/${deckParam}` })
    }

    // Check for incomplete imports
    const savedImport = loadImportState()
    if (savedImport && savedImport.status !== 'complete') {
      await resumeImport(savedImport)
    } else if (savedImport?.status === 'complete') {
      clearImportState()
    }

    // Check for incomplete delete deck operations
    const savedDeleteDeck = loadDeleteDeckState()
    if (savedDeleteDeck && savedDeleteDeck.status !== 'complete') {
      try {
        await resumeDeleteDeck(savedDeleteDeck)
      } catch (err) {
        console.error('[DeleteDeck] Resume failed:', err)
        toastStore.show(t('decks.messages.deleteError'), 'error')
      }
    } else if (savedDeleteDeck?.status === 'complete') {
      clearDeleteDeckState()
    }
  } catch (_err) {
    toastStore.show(t('common.messages.loadError'), 'error')
  }
}

onMounted(() => {
  // NEVER await onMounted — use void pattern per CLAUDE.md (anonymous-user-profile fix)
  void initView()
})

// Keep URL in sync with deckFilter (skip the root /decks when no selection)
watch(deckFilter, (newId, oldId) => {
  if (newId === oldId) return
  const currentParam = route.params.id
  const targetPath = newId && newId !== 'all' ? `/decks/${newId}` : '/decks'
  const currentPath = typeof currentParam === 'string' && currentParam ? `/decks/${currentParam}` : '/decks'
  if (targetPath !== currentPath) {
    void router.replace({ path: targetPath })
  }
})

// React to external route changes (back/forward, direct link)
watch(() => route.params.id, (newId) => {
  if (typeof newId === 'string' && newId) {
    if (decksStore.decks.some(d => d.id === newId) && deckFilter.value !== newId) {
      deckFilter.value = newId
    }
  } else if (!newId && deckFilter.value !== 'all') {
    deckFilter.value = 'all'
  }
})

// Warn before leaving if import or delete is in progress
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  const importInProgress = importProgress.value && importProgress.value.status !== 'complete' && importProgress.value.status !== 'error'
  const deleteInProgress = deleteDeckProgress.value && deleteDeckProgress.value.status !== 'complete' && deleteDeckProgress.value.status !== 'error'

  if (importInProgress || deleteInProgress) {
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
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
    } else if (showImportDeckModal.value) {
      showImportDeckModal.value = false
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
      </div>
      <div class="flex gap-2" data-tour="add-card-btn">
        <BaseButton size="small" variant="secondary" @click="showImportDeckModal = true">
          {{ t('collection.actions.import') }}
        </BaseButton>
        <BaseButton size="small" @click="showCreateDeckModal = true">
          {{ t('collection.actions.newDeck') }}
        </BaseButton>
        <BaseButton size="small" variant="secondary" @click="selectedScryfallCard = undefined; showAddCardModal = true">
          <SvgIcon name="plus" size="tiny" class="inline-block mr-1" />
          {{ t('collection.actions.addCard') }}
        </BaseButton>
      </div>
    </div>

    <div :class="['mt-6', selectedDeck ? 'pb-20' : '']">
      <div>
        <!-- ========== MAIN TABS ========== -->
        <div class="mb-6">
          <div class="flex gap-1 mb-4">
            <RouterLink
                to="/collection"
                class="flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center border border-silver-10 text-silver-70 hover:text-silver hover:border-silver-30"
            >
              {{ t('collection.tabs.collection') }}
            </RouterLink>
            <RouterLink
                data-tour="deck-tab"
                to="/decks"
                class="flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center bg-neon text-primary"
            >
              {{ t('collection.tabs.decks') }}
              <span class="ml-1 opacity-70">({{ decksList.length }})</span>
            </RouterLink>
            <RouterLink
                to="/binders"
                class="flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center border border-silver-10 text-silver-70 hover:text-silver hover:border-silver-30"
            >
              {{ t('collection.tabs.binders') }}
            </RouterLink>
          </div>

          <!-- ========== DECK SUB-TABS ========== -->
          <div v-if="decksList.length > 0" class="flex gap-2 overflow-x-auto pb-2 pl-4 border-l-4 border-neon min-w-0 max-w-full">
            <button
                v-for="deck in decksList"
                :key="deck.id"
                @click="deckFilter = deck.id"
                class="relative overflow-hidden px-4 py-2 text-small font-bold whitespace-nowrap transition-150 border-2"
                :class="[
                  deckFilter === deck.id
                    ? isDeckImporting(deck.id)
                      ? 'bg-primary border-neon text-silver'
                      : 'bg-neon text-primary border-neon'
                    : isDeckImporting(deck.id)
                      ? 'bg-primary border-neon text-silver'
                      : 'bg-primary border-silver-30 text-silver-70 hover:border-neon/70'
                ]"
            >
              <div
                  v-if="isDeckImporting(deck.id)"
                  class="absolute inset-0 bg-neon/30 transition-all duration-300"
                  :style="{ width: `${getImportProgress(deck.id) }%` }"
              ></div>
              <span class="relative z-10">
                {{ deck.name }}
                <span v-if="isDeckImporting(deck.id)" class="ml-1 text-neon font-bold">
                  {{ importProgress?.currentCard ?? 0 }}/{{ importProgress?.totalCards ?? 0 }}
                </span>
                <span v-else class="ml-1 opacity-70">{{ deck.stats?.ownedCards ?? 0 }}</span>
              </span>
            </button>
            <BaseButton size="small" variant="filled" @click="showCreateDeckModal = true">
              {{ t('collection.actions.new') }}
            </BaseButton>
          </div>

          <div v-else class="pl-4 border-l-4 border-neon py-4">
            <p class="text-silver-50 text-small">{{ t('collection.noDecks') }}</p>
            <div class="flex gap-2 mt-3">
              <BaseButton size="small" @click="showCreateDeckModal = true">{{ t('collection.actions.createDeck') }}</BaseButton>
              <BaseButton size="small" variant="secondary" @click="showImportDeckModal = true">{{ t('collection.actions.import') }}</BaseButton>
            </div>
          </div>
        </div>

        <!-- ========== DECK HEADER ========== -->
        <div v-if="selectedDeck" class="bg-neon/10 border-2 border-neon p-3 md:p-4 mb-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 class="text-body md:text-h3 font-bold text-silver">{{ selectedDeck.name }}</h2>
              <p class="text-tiny text-silver-50">{{ selectedDeck.format?.toUpperCase() }}</p>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                <BaseButton
                    size="small"
                    variant="secondary"
                    @click="handleToggleDeckPublic"
                    :class="isDeckPublic ? 'border-neon text-neon' : 'border-silver-50 text-silver-50'"
                    class="flex items-center gap-1 md:gap-2"
                >
                  <SvgIcon :name="isDeckPublic ? 'eye-open' : 'eye-closed'" size="tiny" />
                  <span class="hidden sm:inline">{{ isDeckPublic ? t('collection.visibility.public') : t('collection.visibility.private') }}</span>
                </BaseButton>
                <HelpTooltip :text="isDeckPublic ? t('help.tooltips.collection.deckPublic') : t('help.tooltips.collection.deckPrivate')" :title="t('help.titles.deckVisibility')" />
              </div>
              <BaseButton size="small" variant="secondary" @click="handleExportDeck">
                <span class="hidden sm:inline">{{ t('decks.detail.export') }}</span>
                <span class="sm:hidden">📋</span>
              </BaseButton>
              <BaseButton size="small" variant="secondary" @click="handleExportDeckCsv">
                <span class="hidden sm:inline">CSV</span>
                <span class="sm:hidden">CSV</span>
              </BaseButton>
              <BaseButton size="small" variant="secondary" @click="handleDeleteDeck()" :disabled="isDeletingDeck">
                <template v-if="isDeletingDeck">
                  <span class="animate-spin inline-block">⏳</span>
                </template>
                <template v-else>
                  <span class="hidden sm:inline">ELIMINAR</span>
                  <span class="sm:hidden">🗑️</span>
                </template>
              </BaseButton>
            </div>
          </div>
          <div v-if="isDeletingDeck" class="w-full">
            <div class="flex items-center justify-between mb-1">
              <span class="text-tiny text-silver-50">{{ t('decks.messages.deletingDeck') }}</span>
              <span class="text-tiny text-neon font-bold">{{ deleteProgress }}%</span>
            </div>
            <div class="w-full h-2 bg-primary border border-silver-50/30 rounded-full overflow-hidden">
              <div
                class="h-full bg-neon rounded-full transition-all duration-300"
                :style="{ width: `${deleteProgress}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- ========== SEARCH + SORT ========== -->
        <CardFilterBar
            v-model:filter-query="filterQuery"
            v-model:sort-by="sortBy"
            v-model:group-by="deckGroupBy"
            view-mode="decks"
            :show-bulk-select="false"
            :show-view-type="false"
            :active-filter-count="0"
            @select-local-card="handleLocalCardSelect"
            @select-scryfall-card="handleScryfallSuggestionSelect"
        />

        <!-- ========== MAINBOARD GRID ========== -->
        <div v-if="selectedDeck && filteredMainboardDisplayCards.length > 0" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b-2 border-neon">
            <h3 class="text-body font-bold text-neon">{{ t('collection.sections.mainboard') }}</h3>
            <span class="text-tiny text-silver-50">({{ mainboardOwnedCount + mainboardWishlistCount }} cartas)</span>
          </div>
          <DeckEditorGrid
              :cards="filteredMainboardDisplayCards"
              :deck-id="selectedDeck.id"
              :commander-names="commanderNames"
              :group-by="deckGroupBy"
              :sort-by="sortBy"
              :selected-colors="selectedColors"
              :exact-color-mode="exactColorMode"
              :selected-mana-values="selectedManaValues"
              :selected-types="selectedTypes"
              :selected-rarities="selectedRarities"
              @edit="handleDeckGridEdit"
              @remove="handleDeckGridRemove"
              @update-quantity="handleDeckGridQuantityUpdate"
              @add-to-wishlist="handleDeckGridAddToWishlist"
              @toggle-commander="handleDeckGridToggleCommander"
              @move-board="handleDeckGridMoveBoard"
              @add-card="selectedScryfallCard = undefined; showAddCardModal = true"
          />
        </div>

        <!-- Sideboard separator -->
        <div v-if="selectedDeck && !isCommanderFormat && filteredSideboardDisplayCards.length > 0" class="my-8">
          <div class="border-t-2 border-dashed border-blue-400/50"></div>
        </div>

        <!-- ========== SIDEBOARD GRID ========== -->
        <div v-if="selectedDeck && !isCommanderFormat && filteredSideboardDisplayCards.length > 0" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-blue-400/30">
            <h3 class="text-small font-bold text-blue-400">{{ t('collection.sections.sideboard') }}</h3>
            <span class="text-tiny text-silver-50">({{ sideboardOwnedCount + sideboardWishlistCount }} cartas)</span>
          </div>
          <DeckEditorGrid
              :cards="filteredSideboardDisplayCards"
              :deck-id="selectedDeck.id"
              :commander-names="commanderNames"
              :group-by="deckGroupBy"
              :sort-by="sortBy"
              :selected-colors="selectedColors"
              :exact-color-mode="exactColorMode"
              :selected-mana-values="selectedManaValues"
              :selected-types="selectedTypes"
              :selected-rarities="selectedRarities"
              @edit="handleDeckGridEdit"
              @remove="handleDeckGridRemove"
              @update-quantity="handleDeckGridQuantityUpdate"
              @add-to-wishlist="handleDeckGridAddToWishlist"
              @toggle-commander="handleDeckGridToggleCommander"
              @move-board="handleDeckGridMoveBoard"
              @add-card="selectedScryfallCard = undefined; showAddCardModal = true"
          />
        </div>

        <!-- Empty deck state -->
        <div v-if="selectedDeck && filteredMainboardDisplayCards.length === 0 && filteredSideboardDisplayCards.length === 0" class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">{{ t('collection.empty.deckEmpty') }}</p>
            <p class="text-tiny text-silver-70 mt-1">{{ t('collection.empty.deckNoCards') }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== MODALS ========== -->

    <AddCardModal
        :show="showAddCardModal"
        :scryfall-card="selectedScryfallCard"
        :selected-deck-id="deckFilter !== 'all' ? deckFilter : undefined"
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

    <ImportDeckModal
        :show="showImportDeckModal"
        @close="showImportDeckModal = false"
        @import="handleImport"
        @import-direct="handleImportDirect"
        @import-csv="handleImportCsv"
    />
</AppContainer>

  <!-- Floating Action Button (mobile) -->
  <Teleport to="body">
    <FloatingActionButton
        icon="plus"
        :label="t('collection.fab.addCard')"
        @click="showAddCardModal = true"
        :style="fabBottomStyle"
    />
  </Teleport>

  <!-- ========== DECK STATS FOOTER ========== -->
  <DeckStatsFooter
      v-if="selectedDeck"
      :owned-count="deckOwnedCount"
      :wishlist-count="deckWishlistCount"
      :owned-cost="deckOwnedCostBySource"
      :wishlist-cost="deckWishlistCostBySource"
      :total-cost="deckTotalCostBySource"
      :price-source="deckPriceSource"
      :source-color="deckSourceColor"
      :source-label="deckActiveSourceLabel"
      :expanded="deckStatsExpanded"
      :completion-percentage="selectedDeckStats?.completionPercentage ?? null"
      @update:expanded="deckStatsExpanded = $event"
      @change-source="deckPriceSource = $event"
  />
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
