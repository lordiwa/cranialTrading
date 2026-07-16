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
import BinderStatsFooter from '../components/binders/BinderStatsFooter.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'
import FloatingActionButton from '../components/ui/FloatingActionButton.vue'
import BottomSheet from '../components/ui/BottomSheet.vue'
import CardFilterBar from '../components/ui/CardFilterBar.vue'
import DiscoveryPanel from '../components/discovery/DiscoveryPanel.vue'
import { useDiscoveryAddCard } from '../composables/useDiscoveryAddCard'
import type { CreateBinderInput } from '../types/binder'
import { type Card, type CardStatus } from '../types/card'
import type { DisplayDeckCard } from '../types/deck'
import { useBindersStore } from '../stores/binders'
import { useDecksStore } from '../stores/decks'
import { type ScryfallCard } from '../services/scryfallCache'
import { buildManaboxCsv, buildMoxfieldCsv, downloadAsFile } from '../utils/cardHelpers'
import { useCardFilter } from '../composables/useCardFilter'
import { cancelPriceFetch, useCollectionTotals } from '../composables/useCollectionTotals'
import { useCollectionImport } from '../composables/useCollectionImport'
import { sumCkFirst } from '../utils/priceAggregation'

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

// Mobile discovery bottom sheet (mobile <md)
const showDiscoverySheet = ref(false)

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
  sortBy,
  groupBy: deckGroupBy,
  selectedColors,
  exactColorMode,
  selectedManaValues,
  selectedTypes,
  selectedRarities,
  passesAdvancedFilters,
} = useCardFilter(collectionCards)

// Search text bound to CardFilterBar + DiscoveryPanel only; decoupled from the binder grid.
const discoverQuery = ref('')

// Advanced-filter predicate still runs (chip state stays neutral since the filter button was removed).
const filteredBinderDisplayCards = computed(() => {
  return binderDisplayCards.value.filter(passesAdvancedFilters)
})

const fabBottomStyle = computed(() => {
  if (!selectedBinder.value) return { bottom: '4rem' }
  return { bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }
})

// ========== BINDER STATS FOOTER (design→app v2 F4a — same footer anatomy as DeckStatsFooter) ==========
// Binder cards don't carry a status field of their own — status (sale/trade/collection) lives on
// the underlying collection Card, so it's cross-referenced by cardId here (read-only, no store change).
const binderForSaleCount = computed(() => {
  return binderDisplayCards.value.reduce((sum, c) => {
    const card = collectionStore.getCardById(c.cardId)
    return card?.status === 'sale' ? sum + c.allocatedQuantity : sum
  }, 0)
})

const binderTradeCount = computed(() => {
  return binderDisplayCards.value.reduce((sum, c) => {
    const card = collectionStore.getCardById(c.cardId)
    return card?.status === 'trade' ? sum + c.allocatedQuantity : sum
  }, 0)
})

// TASK-114: CK-first binder total. Same client-side override pattern DeckView already
// uses for deckOwnedCostBySource (DeckView.vue) — this composable instance reads the
// shared module-level price map but never calls fetchAllPrices() itself, so it never
// triggers a second full-collection price fetch. Falls back per-card to card.price
// (TCG) when CK hasn't loaded/has no data. binder.stats.totalPrice (stores/binders.ts
// calculateStats) is left untouched — it's a separate, TCG-only Firestore-persisted
// field out of this ticket's scope; this is a view-only display override.
const { cardPrices: binderCardPrices } = useCollectionTotals(() => collectionCards.value)

const binderTotalValueCk = computed(() => {
  const binder = selectedBinder.value
  if (!binder?.allocations) return 0
  const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
  const entries = binder.allocations
    .map(a => {
      const card = cardMap.get(a.cardId)
      return card ? { price: card.price, quantity: a.quantity, cardId: card.id } : null
    })
    .filter((e): e is { price: number; quantity: number; cardId: string } => e !== null)
  return sumCkFirst(entries, e => binderCardPrices.value.get(e.cardId)?.cardKingdom?.retail)
})

// ========== METHODS ==========

const handleLocalCardSelect = (card: Card) => {
  discoverQuery.value = card.name
}

const handleScryfallSuggestionSelect = (cardName: string) => {
  discoverQuery.value = cardName
}

// Discovery panel add-card orchestration (SCRUM-34)
const discoveryAdd = useDiscoveryAddCard('binders', {
  collectionStore: {
    addCard: collectionStore.addCard,
    updateCard: collectionStore.updateCard,
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
    title: t('binders.header.confirmRemoveCardTitle'),
    message: t('binders.header.confirmRemoveCardMessage', { name: cardName }),
    confirmText: t('common.actions.delete'),
    cancelText: t('common.actions.cancel'),
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
    title: t('binders.header.confirmDeleteTitle'),
    message: t('binders.header.confirmDelete', { name: binderName }),
    confirmText: t('binders.header.confirmDeleteCta'),
    cancelText: t('common.actions.cancel'),
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
    <!-- ========== HERO ========== -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
      <div>
        <p class="font-display text-[11px] font-bold tracking-[.18em] uppercase text-neon mb-1">
          {{ selectedBinder ? t('binders.hero.kicker') : t('collection.hero.kicker') }}
        </p>
        <div class="flex items-center gap-3 flex-wrap mt-1">
          <h1 class="font-display text-h1 font-bold text-silver">{{ selectedBinder ? selectedBinder.name : t('collection.title') }}</h1>
          <span
              v-if="selectedBinder"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-[.06em] uppercase before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current"
              :class="selectedBinder.forSale ? 'bg-rust-10 text-rust' : 'bg-surface-2 text-silver-70'"
          >
            {{ selectedBinder.forSale ? t('binders.header.forSale') : t('binders.header.public') }}
          </span>
        </div>
        <p v-if="selectedBinder?.description" class="text-tiny text-silver-50 mt-1">{{ selectedBinder.description }}</p>
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

    <div :class="['mt-6', selectedBinder ? 'pb-24 sm:pb-20' : '']">
      <div>
        <!-- ========== SEGMENTED CONTROL: COLECCIÓN / MAZOS / BINDERS ========== -->
        <div class="mb-6">
          <div class="inline-flex bg-surface-1 border border-line rounded-lg p-[3px] gap-0.5 mb-4">
            <RouterLink
                to="/collection"
                class="inline-flex items-center justify-center gap-2 min-h-[38px] px-4 rounded-md text-small font-semibold text-silver-50 transition-all duration-200 ease-v2 hover:text-silver focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              {{ t('collection.tabs.collection') }}
            </RouterLink>
            <RouterLink
                to="/decks"
                class="inline-flex items-center justify-center gap-2 min-h-[38px] px-4 rounded-md text-small font-semibold text-silver-50 transition-all duration-200 ease-v2 hover:text-silver focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              {{ t('collection.tabs.decks') }}
            </RouterLink>
            <RouterLink
                to="/binders"
                class="inline-flex items-center justify-center gap-2 min-h-[38px] px-4 rounded-md text-small font-semibold text-neon bg-surface-3 transition-all duration-200 ease-v2 focus-visible:outline-none focus-visible:shadow-glow-neon"
            >
              {{ t('collection.tabs.binders') }}
              <span class="font-display font-tnum text-tiny" style="color:inherit">{{ bindersList.length }}</span>
            </RouterLink>
          </div>

          <!-- ========== BINDER SUB-TABS (switcher) ========== -->
          <div v-if="bindersList.length > 0" class="flex gap-2 overflow-x-auto pb-2 pl-4 border-l-4 border-neon min-w-0 max-w-full">
            <button
                v-for="binder in bindersList"
                :key="binder.id"
                @click="binderFilter = binder.id"
                class="px-4 py-3 min-h-[44px] md:min-h-0 md:py-2 rounded-full text-small font-semibold whitespace-nowrap transition-all duration-200 ease-v2 border"
                :class="[
                  binderFilter === binder.id
                    ? 'text-neon bg-neon-10 border-neon-40'
                    : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong'
                ]"
            >
              {{ binder.name }}
              <span class="font-display font-tnum ml-1" style="color:inherit">{{ binder.stats?.totalCards ?? 0 }}</span>
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

        <!-- ========== BINDER TOOLBAR (Público/En venta toggles — the one anatomy difference vs. Mazos — + export/delete actions) ========== -->
        <!-- gap-3 (vs. Mazos' gap-2): two switch-fields need more breathing room than Mazos' single visibility button -->
        <div v-if="selectedBinder" class="flex flex-wrap items-center gap-3 pb-4 mb-6 border-b border-line">
          <button
              type="button"
              role="switch"
              :aria-checked="selectedBinder.isPublic"
              @click="toggleBinderPublic"
              class="flex items-center gap-2 px-1 py-1 text-tiny transition-150 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              :class="selectedBinder.isPublic ? 'text-neon' : 'text-silver-50'"
          >
            {{ t('binders.header.public') }}
            <span
                class="relative inline-block w-10 h-[22px] rounded-full flex-shrink-0 transition-colors duration-150"
                :class="selectedBinder.isPublic ? 'bg-neon' : 'bg-silver-10 border border-silver-30'"
            >
              <span
                  class="absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-silver transition-transform duration-150"
                  :class="selectedBinder.isPublic ? 'translate-x-[18px]' : 'translate-x-0'"
              ></span>
            </span>
          </button>
          <button
              type="button"
              role="switch"
              :aria-checked="selectedBinder.forSale"
              @click="toggleBinderForSale"
              class="flex items-center gap-2 px-1 py-1 text-tiny transition-150 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              :class="selectedBinder.forSale ? 'text-neon' : 'text-silver-50'"
          >
            {{ t('binders.header.forSale') }}
            <span
                class="relative inline-block w-10 h-[22px] rounded-full flex-shrink-0 transition-colors duration-150"
                :class="selectedBinder.forSale ? 'bg-neon' : 'bg-silver-10 border border-silver-30'"
            >
              <span
                  class="absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-silver transition-transform duration-150"
                  :class="selectedBinder.forSale ? 'translate-x-[18px]' : 'translate-x-0'"
              ></span>
            </span>
          </button>
          <span class="flex-1"></span>
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

        <!-- ========== SEARCH ========== -->
        <CardFilterBar
            v-model:filter-query="discoverQuery"
            v-model:sort-by="sortBy"
            v-model:group-by="deckGroupBy"
            view-mode="binders"
            :v2="true"
            :show-bulk-select="false"
            :show-view-type="false"
            :show-mobile-discover="true"
            :mobile-discover-active="showDiscoverySheet"
            @select-local-card="handleLocalCardSelect"
            @select-scryfall-card="handleScryfallSuggestionSelect"
            @open-discovery-sheet="showDiscoverySheet = true"
        />

        <!-- ========== DISCOVERY PANEL (SCRUM-34) — desktop inline ========== -->
        <div class="hidden md:block">
          <DiscoveryPanel
              scope="binders"
              :selected-binder-id="binderFilter !== 'all' ? binderFilter : undefined"
              :search-query="discoverQuery"
              :collection-cards="collectionStore.cards"
              :version-trigger="discoveryVersionTrigger"
              @add-to-binder="handleDiscoveryAddBinder"
              @open-add-modal="handleDiscoveryOpenAddModal"
          />
        </div>

        <!-- ========== DISCOVERY BOTTOM SHEET — mobile only ========== -->
        <BottomSheet
            :show="showDiscoverySheet"
            :title="t('discovery.panel.titleDiscover')"
            class="md:hidden"
            @close="showDiscoverySheet = false"
        >
          <DiscoveryPanel
              v-if="showDiscoverySheet"
              scope="binders"
              :selected-binder-id="binderFilter !== 'all' ? binderFilter : undefined"
              :search-query="discoverQuery"
              :collection-cards="collectionStore.cards"
              :version-trigger="discoveryVersionTrigger"
              @add-to-binder="handleDiscoveryAddBinder"
              @open-add-modal="handleDiscoveryOpenAddModal"
          />
        </BottomSheet>

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

  <!-- ========== BINDER STATS FOOTER (same footer anatomy as DeckStatsFooter — design→app v2 F4a) ========== -->
  <BinderStatsFooter
      v-if="selectedBinder"
      :total-cards="selectedBinder.stats?.totalCards ?? 0"
      :for-sale-count="binderForSaleCount"
      :trade-count="binderTradeCount"
      :total-value="binderTotalValueCk"
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
