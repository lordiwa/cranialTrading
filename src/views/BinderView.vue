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
import ImportDeckModal from '../components/collection/ImportDeckModal.vue'
import CreateBinderModal from '../components/binders/CreateBinderModal.vue'
import DeckEditorGrid from '../components/decks/DeckEditorGrid.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'
import FloatingActionButton from '../components/ui/FloatingActionButton.vue'
import CardFilterBar from '../components/ui/CardFilterBar.vue'
import AdvancedFilterModal, { type AdvancedFilters } from '../components/search/AdvancedFilterModal.vue'
import DiscoveryPanel from '../components/discovery/DiscoveryPanel.vue'
import { useDiscoveryAddCard } from '../composables/useDiscoveryAddCard'
import type { CreateBinderInput } from '../types/binder'
import { type Card, type CardStatus } from '../types/card'
import type { DisplayDeckCard } from '../types/deck'
import { useBindersStore } from '../stores/binders'
import { useDecksStore } from '../stores/decks'
import { type ScryfallCard } from '../services/scryfallCache'
import { buildManaboxCsv, buildMoxfieldCsv, downloadAsFile } from '../utils/cardHelpers'
import { colorOrder, manaOrder, rarityOrder, typeOrder, useCardFilter } from '../composables/useCardFilter'
import { cancelPriceFetch } from '../composables/useCollectionTotals'
import { useCollectionImport } from '../composables/useCollectionImport'

const route = useRoute()
const router = useRouter()
const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const binderStore = useBindersStore()
const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const { t } = useI18n()

// ========== STATE ==========

const showAddCardModal = ref(false)
const showCardDetailModal = ref(false)
const showCreateBinderModal = ref(false)
const createBinderModalRef = ref<{ setLoading: (v: boolean) => void } | null>(null)
const showImportBinderModal = ref(false)

const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<ScryfallCard | undefined>(undefined)

// Discovery panel state (SCRUM-34)
const discoveryVersionTrigger = ref<{ name: string; key: number } | null>(null)
const discoveryTrigger = ref(0)

// statusFilter + deckFilter unused in binder view but required by composable contracts
const statusFilter = ref<'all' | 'owned' | 'available' | CardStatus>('all')
const deckFilter = ref<string>('all')

const binderFilter = ref<string>('all')
const isDeletingBinder = ref(false)

// ========== COMPUTED ==========

const collectionCards = computed(() => collectionStore.cards)

const bindersList = computed(() => binderStore.binders)

const selectedBinder = computed(() => {
  if (binderFilter.value === 'all') return null
  return binderStore.binders.find(b => b.id === binderFilter.value) ?? null
})

const binderDisplayCards = computed(() => {
  if (!selectedBinder.value) return []
  return binderStore.hydrateBinderCards(selectedBinder.value, collectionCards.value)
})

// ========== IMPORT COMPOSABLE ==========

const {
  handleImportBinder,
  handleImportBinderDirect,
  handleImportBinderCsv,
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
  showImportBinderModal,
})

// ========== CARD FILTER COMPOSABLE ==========
const {
  filterQuery,
  sortBy,
  groupBy: deckGroupBy,
  selectedColors,
  exactColorMode,
  selectedManaValues,
  selectedTypes,
  selectedRarities,
  // Advanced filter state
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
  passesAdvancedFilters,
} = useCardFilter(collectionCards)

// ========== LOCAL FILTERS MODAL (full bridge — same UX as /search and CollectionView) ==========
const showLocalFilters = ref(false)

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

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedColors.value.size < colorOrder.length) count++
  if (selectedManaValues.value.size < manaOrder.length) count++
  if (selectedTypes.value.size < typeOrder.length) count++
  if (selectedRarities.value.size < rarityOrder.length) count++
  count += advancedFilterCount.value
  return count
})

const resetAllFilters = () => {
  selectedColors.value = new Set(colorOrder)
  selectedManaValues.value = new Set(manaOrder)
  selectedTypes.value = new Set(typeOrder)
  selectedRarities.value = new Set(rarityOrder)
  resetAdvancedFilters()
}

// Text-search filtered + advanced-filter applied
const filteredBinderDisplayCards = computed(() => {
  let result = binderDisplayCards.value
  if (filterQuery.value.trim()) {
    const q = filterQuery.value.toLowerCase()
    result = result.filter(c =>
      c.name.toLowerCase().includes(q) || c.edition.toLowerCase().includes(q)
    )
  }
  return result.filter(passesAdvancedFilters)
})

const fabBottomStyle = computed(() => {
  if (!selectedBinder.value) return { bottom: '4rem' }
  return { bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }
})

// ========== METHODS ==========

const handleLocalCardSelect = (card: Card) => {
  if (binderFilter.value !== 'all') {
    filterQuery.value = ''
    void quickAllocateCardToBinder(card)
  } else {
    filterQuery.value = ''
    selectedCard.value = card
    showCardDetailModal.value = true
  }
}

const quickAllocateCardToBinder = async (card: Card) => {
  if (binderFilter.value === 'all') return
  const allocated = await binderStore.allocateCardToBinder(binderFilter.value, card.id, 1)
  if (allocated > 0) {
    toastStore.show(t('binders.cardAdded'), 'success')
  }
}

const handleScryfallSuggestionSelect = (cardName: string) => {
  filterQuery.value = ''
  discoveryVersionTrigger.value = { name: cardName, key: Date.now() }
}

const handleRequestDiscovery = () => {
  discoveryTrigger.value = Date.now()
}

// Discovery panel add-card orchestration (SCRUM-34)
const discoveryAdd = useDiscoveryAddCard('binders', {
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
  selectedBinderId: computed(() => (binderFilter.value !== 'all' ? binderFilter.value : undefined)),
})

const handleDiscoveryAddBinder = (print: ScryfallCard) => { void discoveryAdd.addToBinder(print) }
const handleDiscoveryOpenAddModal = (print: ScryfallCard) => {
  selectedScryfallCard.value = print
  showAddCardModal.value = true
}

const handleAddCardModalClose = () => {
  showAddCardModal.value = false
  selectedScryfallCard.value = undefined
}

const handleCardDetailClosed = () => {
  showCardDetailModal.value = false
  selectedCard.value = null
}

// ========== BINDER EVENT HANDLERS ==========

const handleBinderGridEdit = (displayCard: DisplayDeckCard) => {
  if (!displayCard.isWishlist) {
    const card = collectionStore.cards.find(c => c.id === displayCard.cardId)
    if (card) {
      selectedCard.value = card
      showCardDetailModal.value = true
    }
  }
}

const handleBinderGridRemove = async (displayCard: DisplayDeckCard) => {
  if (!selectedBinder.value) return

  const cardName = displayCard.name
  const cardId = displayCard.cardId
  const confirmed = await confirmStore.show({
    title: t('binders.cardRemoved'),
    message: `Remove "${cardName}" from binder?`,
    confirmText: t('binders.header.delete'),
    cancelText: t('binders.create.cancel'),
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  await binderStore.deallocateCard(selectedBinder.value.id, cardId)

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
      toastStore.show(t('binders.cardRemoved'), 'success')
    }
  } else {
    toastStore.show(t('binders.cardRemoved'), 'success')
  }
}

const handleBinderGridQuantityUpdate = async (displayCard: DisplayDeckCard, newQuantity: number) => {
  if (!selectedBinder.value) return

  const cardId = displayCard.cardId
  if (!cardId) return

  const ok = await binderStore.updateAllocation(selectedBinder.value.id, cardId, newQuantity, true)

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
        toastStore.show(t('binders.quantityUpdated'), 'success')
      }
    } else {
      toastStore.show(t('binders.quantityUpdated'), 'success')
    }
  } else if (!ok && newQuantity > displayCard.allocatedQuantity) {
    const card = collectionStore.getCardById(cardId)
    if (!card) return

    const addToCollection = await confirmStore.show({
      title: displayCard.name,
      message: t('decks.messages.exceedsAvailable', { max: card.quantity }),
      confirmText: t('decks.messages.addToCollectionBtn'),
      cancelText: t('common.actions.cancel'),
    })

    if (addToCollection) {
      await collectionStore.updateCard(cardId, { quantity: card.quantity + 1 })
      await binderStore.updateAllocation(selectedBinder.value.id, cardId, newQuantity)
      toastStore.show(t('decks.messages.addedToCollection'), 'success')
    }
  }
}

const handleBinderGridSetStatus = async (displayCard: DisplayDeckCard, status: string) => {
  const cardId = displayCard.cardId
  if (!cardId) return
  const updates: Record<string, unknown> = { status }
  if (status === 'collection') updates.public = false
  await collectionStore.updateCard(cardId, updates as Partial<Card>)
  toastStore.show(t('cards.grid.statusChanged', { status }), 'success')
}

const handleBinderGridToggleFoil = async (displayCard: DisplayDeckCard) => {
  const cardId = displayCard.cardId
  if (!cardId) return
  await collectionStore.updateCard(cardId, { foil: !displayCard.foil })
}

const handleBinderGridTogglePublic = async (displayCard: DisplayDeckCard) => {
  const cardId = displayCard.cardId
  if (!cardId) return
  const record = displayCard as unknown as Record<string, unknown>
  const newPublic = !record.public
  await collectionStore.updateCard(cardId, { public: newPublic } as Partial<Card>)
  toastStore.show(newPublic ? t('cards.grid.visibleInProfile') : t('cards.grid.hiddenFromProfile'), 'success')
}

// ========== BINDER ACTIONS ==========

const handleCreateBinder = async (data: CreateBinderInput) => {
  const modalRef = createBinderModalRef.value
  try {
    modalRef?.setLoading(true)
    const binderId = await binderStore.createBinder(data)
    if (!binderId) return

    showCreateBinderModal.value = false
    binderFilter.value = binderId
    void router.replace({ path: `/binders/${binderId}` })
  } catch (error) {
    console.error('Error in handleCreateBinder:', error)
    toastStore.show(t('binders.errors.create'), 'error')
  } finally {
    modalRef?.setLoading(false)
  }
}

const toggleBinderPublic = async () => {
  if (!selectedBinder.value) return
  await binderStore.updateBinder(selectedBinder.value.id, { isPublic: !selectedBinder.value.isPublic })
}

const toggleBinderForSale = async () => {
  if (!selectedBinder.value) return
  await binderStore.updateBinder(selectedBinder.value.id, { forSale: !selectedBinder.value.forSale })
}

const executeBinderDeletion = async (binderId: string, cardIds: string[], deleteCards: boolean) => {
  if (deleteCards && cardIds.length > 0) {
    try {
      cancelPriceFetch()
      const result = await collectionStore.batchDeleteCards(cardIds)
      if (result.failed > 0) {
        toastStore.show(t('binders.deletedWithCardWarning', { deleted: result.deleted, failed: result.failed }), 'info')
      } else {
        toastStore.show(t('binders.deletedWithCards', { count: cardIds.length }), 'success')
      }
    } catch (cardErr) {
      console.warn('[DeleteBinder] Card deletion failed, proceeding to delete binder:', cardErr)
      toastStore.show(t('binders.deletedWithCardWarning', { deleted: 0, failed: cardIds.length }), 'error')
    }
  }

  const success = await binderStore.deleteBinder(binderId)
  if (success) {
    const remaining = binderStore.binders
    const firstBinder = remaining[0]
    binderFilter.value = firstBinder ? firstBinder.id : 'all'
  }
}

const handleDeleteBinder = async () => {
  if (!selectedBinder.value) return

  const binderId = selectedBinder.value.id
  const binderName = selectedBinder.value.name
  const cardIds = selectedBinder.value.allocations?.length > 0
    ? [...new Set(selectedBinder.value.allocations.map(a => a.cardId))]
    : []

  const confirmed = await confirmStore.show({
    title: t('binders.header.delete'),
    message: t('binders.header.confirmDelete', { name: binderName }),
    confirmText: t('binders.header.delete'),
    cancelText: t('binders.create.cancel'),
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  let deleteCards = false
  if (cardIds.length > 0) {
    deleteCards = await confirmStore.show({
      title: t('binders.header.deleteCardsTitle'),
      message: t('binders.header.deleteCardsMessage'),
      confirmText: t('binders.header.deleteCardsConfirm'),
      cancelText: t('binders.header.deleteCardsCancel'),
      confirmVariant: 'danger'
    })
  }

  isDeletingBinder.value = true

  // Deselect binder BEFORE deleting to avoid reactive cascade
  binderFilter.value = 'all'

  try {
    await executeBinderDeletion(binderId, cardIds, deleteCards)
  } catch (err) {
    console.error('[DeleteBinder] Error:', err)
    toastStore.show(t('common.messages.loadError'), 'error')
  }

  isDeletingBinder.value = false
}

const handleExportBinder = async () => {
  if (!selectedBinder.value) return

  const setCodeMap = new Map<string, string>()
  for (const c of collectionStore.cards) {
    if (c.setCode) setCodeMap.set(c.id, c.setCode)
  }

  const lines: string[] = []
  for (const card of binderDisplayCards.value) {
    const code = setCodeMap.get(card.cardId)?.toUpperCase() ?? card.edition
    lines.push(`${card.allocatedQuantity} ${card.name} (${code})`)
  }

  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    toastStore.show(t('decks.detail.exportCopied'), 'success')
  } catch {
    toastStore.show(t('decks.detail.exportError'), 'error')
  }
}

const handleExportBinderCsv = async () => {
  if (!selectedBinder.value) return

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

  const csvCards: Parameters<typeof buildMoxfieldCsv>[0] = []
  for (const card of binderDisplayCards.value) {
    const col = cardMap.get(card.cardId)
    const setCode = col?.setCode?.toUpperCase() ?? card.edition

    csvCards.push({
      name: card.name,
      setCode,
      quantity: card.allocatedQuantity,
      foil: card.foil,
      scryfallId: card.scryfallId,
      price: card.price,
      condition: card.condition,
      language: card.language,
    })
  }

  const csv = useMoxfield ? buildMoxfieldCsv(csvCards) : buildManaboxCsv(csvCards)
  const filename = `${selectedBinder.value.name.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}.csv`
  downloadAsFile(csv, filename)
  toastStore.show(t('decks.detail.exportCsvDownloaded'), 'success')
}

// ========== LIFECYCLE ==========

const initView = async () => {
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      binderStore.loadBinders(),
      decksStore.loadDecks(),
    ])

    // Parse route.params.id to auto-select binder
    const paramId = route.params.id
    if (typeof paramId === 'string' && paramId) {
      if (binderStore.binders.some(b => b.id === paramId)) {
        binderFilter.value = paramId
      }
    }

    // Legacy redirect: ?binder= query
    const binderParam = route.query.binder as string | undefined
    if (binderParam && binderStore.binders.some(b => b.id === binderParam)) {
      binderFilter.value = binderParam
      void router.replace({ path: `/binders/${binderParam}` })
    }

    // Check for incomplete imports (shared composable with DeckView)
    const savedImport = loadImportState()
    if (savedImport && savedImport.status !== 'complete') {
      await resumeImport(savedImport)
    } else if (savedImport?.status === 'complete') {
      clearImportState()
    }
  } catch (_err) {
    toastStore.show(t('common.messages.loadError'), 'error')
  }
}

onMounted(() => {
  // NEVER await onMounted — use void pattern per CLAUDE.md
  void initView()
})

// Keep URL in sync with binderFilter
watch(binderFilter, (newId, oldId) => {
  if (newId === oldId) return
  const currentParam = route.params.id
  const targetPath = newId && newId !== 'all' ? `/binders/${newId}` : '/binders'
  const currentPath = typeof currentParam === 'string' && currentParam ? `/binders/${currentParam}` : '/binders'
  if (targetPath !== currentPath) {
    void router.replace({ path: targetPath })
  }
})

// React to external route changes
watch(() => route.params.id, (newId) => {
  if (typeof newId === 'string' && newId) {
    if (binderStore.binders.some(b => b.id === newId) && binderFilter.value !== newId) {
      binderFilter.value = newId
    }
  } else if (!newId && binderFilter.value !== 'all') {
    binderFilter.value = 'all'
  }
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
    } else if (showCreateBinderModal.value) {
      showCreateBinderModal.value = false
    } else if (showImportBinderModal.value) {
      showImportBinderModal.value = false
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
        <BaseButton size="small" variant="secondary" @click="showImportBinderModal = true">
          {{ t('collection.actions.import') }}
        </BaseButton>
        <BaseButton size="small" @click="showCreateBinderModal = true">
          {{ t('collection.actions.newBinder') }}
        </BaseButton>
        <BaseButton size="small" variant="secondary" @click="selectedScryfallCard = undefined; showAddCardModal = true">
          <SvgIcon name="plus" size="tiny" class="inline-block mr-1" />
          {{ t('collection.actions.addCard') }}
        </BaseButton>
      </div>
    </div>

    <div :class="['mt-6', selectedBinder ? 'pb-20' : '']">
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
                to="/decks"
                class="flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center border border-silver-10 text-silver-70 hover:text-silver hover:border-silver-30"
            >
              {{ t('collection.tabs.decks') }}
            </RouterLink>
            <RouterLink
                to="/binders"
                class="flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center bg-neon text-primary"
            >
              {{ t('collection.tabs.binders') }}
              <span class="ml-1 opacity-70">({{ bindersList.length }})</span>
            </RouterLink>
          </div>

          <!-- ========== BINDER SUB-TABS ========== -->
          <div v-if="bindersList.length > 0" class="flex gap-2 overflow-x-auto pb-2 pl-4 border-l-4 border-neon min-w-0 max-w-full">
            <button
                v-for="binder in bindersList"
                :key="binder.id"
                @click="binderFilter = binder.id"
                class="px-4 py-2 text-small font-bold whitespace-nowrap transition-150 border-2"
                :class="[
                  binderFilter === binder.id
                    ? 'bg-neon text-primary border-neon'
                    : 'bg-primary border-silver-30 text-silver-70 hover:border-neon/70'
                ]"
            >
              {{ binder.name }}
              <span class="ml-1 opacity-70">{{ binder.stats?.totalCards ?? 0 }}</span>
            </button>
            <BaseButton size="small" variant="filled" @click="showCreateBinderModal = true">
              {{ t('collection.actions.new') }}
            </BaseButton>
          </div>

          <div v-else class="pl-4 border-l-4 border-neon py-4">
            <p class="text-silver-50 text-small">{{ t('binders.noBinders') }}</p>
            <div class="flex gap-2 mt-3">
              <BaseButton size="small" @click="showCreateBinderModal = true">{{ t('binders.create.submit') }}</BaseButton>
              <BaseButton size="small" variant="secondary" @click="showImportBinderModal = true">{{ t('collection.actions.import') }}</BaseButton>
            </div>
          </div>
        </div>

        <!-- ========== BINDER HEADER ========== -->
        <div v-if="selectedBinder" class="bg-neon/10 border-2 border-neon p-3 md:p-4 mb-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 class="text-body md:text-h3 font-bold text-silver">{{ selectedBinder.name }}</h2>
              <p v-if="selectedBinder.description" class="text-tiny text-silver-50">{{ selectedBinder.description }}</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button
                  @click="toggleBinderPublic"
                  class="flex items-center gap-1 px-2 py-1 text-tiny border transition-150"
                  :class="selectedBinder.isPublic ? 'border-neon text-neon bg-neon/10' : 'border-silver-30 text-silver-50'"
              >
                <span>{{ selectedBinder.isPublic ? '&#x1F441;' : '&#x1F512;' }}</span>
                {{ t('binders.header.public') }}
              </button>
              <button
                  @click="toggleBinderForSale"
                  class="flex items-center gap-1 px-2 py-1 text-tiny border transition-150"
                  :class="selectedBinder.forSale ? 'border-neon text-neon bg-neon/10' : 'border-silver-30 text-silver-50'"
              >
                <span>{{ selectedBinder.forSale ? '&#x1F4B0;' : '&#x1F6AB;' }}</span>
                {{ t('binders.header.forSale') }}
              </button>
              <span class="text-silver-30">|</span>
              <span class="text-tiny text-silver-50">{{ selectedBinder.stats?.totalCards ?? 0 }} cards</span>
              <span class="text-silver-30">|</span>
              <span class="text-tiny text-silver-50">CK: ${{ (selectedBinder.stats?.totalPrice ?? 0).toFixed(2) }}</span>
              <BaseButton size="small" variant="secondary" @click="handleExportBinder">
                <span class="hidden sm:inline">{{ t('decks.detail.export') }}</span>
                <span class="sm:hidden">📋</span>
              </BaseButton>
              <BaseButton size="small" variant="secondary" @click="handleExportBinderCsv">
                <span class="hidden sm:inline">CSV</span>
                <span class="sm:hidden">CSV</span>
              </BaseButton>
              <BaseButton size="small" variant="secondary" @click="handleDeleteBinder" :disabled="isDeletingBinder">
                <template v-if="isDeletingBinder">
                  <span class="animate-spin inline-block">&#x23F3;</span>
                </template>
                <template v-else>
                  <span class="hidden sm:inline">{{ t('binders.header.delete') }}</span>
                  <span class="sm:hidden">&#x1F5D1;&#xFE0F;</span>
                </template>
              </BaseButton>
            </div>
          </div>
        </div>

        <!-- ========== SEARCH ========== -->
        <CardFilterBar
            v-model:filter-query="filterQuery"
            v-model:sort-by="sortBy"
            v-model:group-by="deckGroupBy"
            view-mode="binders"
            :show-bulk-select="false"
            :show-view-type="false"
            :active-filter-count="activeFilterCount"
            :show-discover-button="true"
            @select-local-card="handleLocalCardSelect"
            @select-scryfall-card="handleScryfallSuggestionSelect"
            @open-filters="showLocalFilters = true"
            @request-discovery="handleRequestDiscovery"
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
            @reset="resetAllFilters"
        />

        <!-- ========== DISCOVERY PANEL (SCRUM-34) ========== -->
        <DiscoveryPanel
            scope="binders"
            :selected-binder-id="binderFilter !== 'all' ? binderFilter : undefined"
            :filters="localAdvancedFilters"
            :collection-cards="collectionStore.cards"
            :version-trigger="discoveryVersionTrigger"
            :discover-trigger="discoveryTrigger"
            @add-to-binder="handleDiscoveryAddBinder"
            @open-add-modal="handleDiscoveryOpenAddModal"
            @request-close="discoveryVersionTrigger = null"
        />

        <!-- ========== BINDER GRID ========== -->
        <div v-if="selectedBinder && filteredBinderDisplayCards.length > 0" class="mb-6">
          <DeckEditorGrid
              :cards="filteredBinderDisplayCards"
              :deck-id="selectedBinder.id"
              :binder-mode="true"
              :group-by="deckGroupBy"
              :sort-by="sortBy"
              :selected-colors="selectedColors"
              :exact-color-mode="exactColorMode"
              :selected-mana-values="selectedManaValues"
              :selected-types="selectedTypes"
              :selected-rarities="selectedRarities"
              @edit="handleBinderGridEdit"
              @remove="handleBinderGridRemove"
              @update-quantity="handleBinderGridQuantityUpdate"
              @set-status="handleBinderGridSetStatus"
              @toggle-foil="handleBinderGridToggleFoil"
              @toggle-public="handleBinderGridTogglePublic"
              @add-card="selectedScryfallCard = undefined; showAddCardModal = true"
          />
        </div>

        <!-- Empty binder state -->
        <div v-if="selectedBinder && filteredBinderDisplayCards.length === 0" class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">{{ t('binders.empty') }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== MODALS ========== -->

    <AddCardModal
        :show="showAddCardModal"
        :scryfall-card="selectedScryfallCard"
        :selected-binder-id="binderFilter !== 'all' ? binderFilter : undefined"
        @close="handleAddCardModalClose"
        @added="handleAddCardModalClose"
    />

    <CardDetailModal
        :show="showCardDetailModal"
        :card="selectedCard"
        @close="handleCardDetailClosed"
        @saved="handleCardDetailClosed"
    />

    <CreateBinderModal
        ref="createBinderModalRef"
        :show="showCreateBinderModal"
        @close="showCreateBinderModal = false"
        @create="handleCreateBinder"
    />

    <ImportDeckModal
        :show="showImportBinderModal"
        :is-binder="true"
        default-status="sale"
        @close="showImportBinderModal = false"
        @import="handleImportBinder"
        @import-direct="handleImportBinderDirect"
        @import-csv="handleImportBinderCsv"
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
