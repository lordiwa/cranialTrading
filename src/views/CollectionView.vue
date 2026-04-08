<script lang="ts">
// Module-level flags that persist across component remounts
// These prevent duplicate executions when navigating away and back
let isImportRunning = false
let isDeleteRunning = false
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCollectionStore } from '../stores/collection'
import { type ToastType, useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { usePromptStore } from '../stores/prompt'
import { useI18n } from '../composables/useI18n'
import AppContainer from '../components/layout/AppContainer.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import CardDetailModal from '../components/collection/CardDetailModal.vue'
import ManageDecksModal from '../components/collection/ManageDecksModal.vue'
import CollectionGrid from '../components/collection/CollectionGrid.vue'
import CollectionTotalsPanel from '../components/collection/CollectionTotalsPanel.vue'
import ImportDeckModal from '../components/collection/ImportDeckModal.vue'
import CreateBinderModal from '../components/binders/CreateBinderModal.vue'
import CreateDeckModal from '../components/decks/CreateDeckModal.vue'
import DeckEditorGrid from '../components/decks/DeckEditorGrid.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import SkeletonCard from '../components/ui/SkeletonCard.vue'
import type { CreateBinderInput } from '../types/binder'
import { type Card, type CardCondition, type CardStatus } from '../types/card'
import type { CreateDeckInput, DeckCardAllocation, DeckFormat, DisplayDeckCard, HydratedDeckCard, HydratedWishlistCard } from '../types/deck'
import { useBindersStore } from '../stores/binders'
import { useDecksStore } from '../stores/decks'
import { useCardAllocation } from '../composables/useCardAllocation'
import { type ScryfallCard, searchCards } from '../services/scryfallCache'
import { buildManaboxCsv, buildMoxfieldCsv, cleanCardName, downloadAsFile, type ParsedCsvCard } from '../utils/cardHelpers'
import SvgIcon from '../components/ui/SvgIcon.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import FloatingActionButton from '../components/ui/FloatingActionButton.vue'
import CardFilterBar from '../components/ui/CardFilterBar.vue'
import AdvancedFilterModal, { type AdvancedFilters } from '../components/search/AdvancedFilterModal.vue'
import { colorOrder, getCardColorCategory, getCardManaCategory, getCardRarityCategory, getCardTypeCategory, manaOrder, passesColorFilter, rarityOrder, typeOrder, useCardFilter } from '../composables/useCardFilter'
import { cancelPriceFetch, useCollectionTotals } from '../composables/useCollectionTotals'

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

// Modals
const showAddCardModal = ref(false)
const showCardDetailModal = ref(false)
const showManageDecksModal = ref(false)
const showCreateDeckModal = ref(false)
const showCreateBinderModal = ref(false)
const createDeckModalRef = ref<{ setLoading: (v: boolean) => void } | null>(null)
const createBinderModalRef = ref<{ setLoading: (v: boolean) => void } | null>(null)
const showImportDeckModal = ref(false)
const showImportBinderModal = ref(false)
const showLocalFilters = ref(false)

// Totals panel expanded state (for FAB positioning)
const totalsPanelExpanded = ref(false)

// Selección de cartas
const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<ScryfallCard | undefined>(undefined)

// ✅ Filtros de COLECCIÓN (no Scryfall)
const statusFilter = ref<'all' | 'owned' | 'available' | CardStatus>('all')
const deckFilter = ref<string>('all')
const viewType = ref<'visual' | 'texto'>('visual')

// Moxfield import card shape (from moxfieldToCardList)
interface MoxfieldImportCard {
  quantity: number
  name: string
  setCode: string
  collectorNumber: string
  scryfallId: string
  isInSideboard: boolean
  isCommander: boolean
}

// Shape of a collection card being built for import (before it gets an id)
interface ImportCardData {
  scryfallId: string
  name: string
  edition: string
  quantity: number
  condition: CardCondition
  foil: boolean
  price: number
  image: string
  status: CardStatus
  public: boolean
  isInSideboard?: boolean
  setCode?: string
  language?: string
  cmc?: number
  type_line?: string
  colors?: string[]
  rarity?: string
  power?: string
  toughness?: string
  oracle_text?: string
  keywords?: string[]
  legalities?: Record<string, string>
  full_art?: boolean
  produced_mana?: string[]
  updatedAt: Date
}


// Vista principal: Colección, Mazos o Carpetas
type ViewMode = 'collection' | 'decks' | 'binders'
const viewMode = ref<ViewMode>('collection')

// Cambiar a modo mazos y seleccionar un deck
const switchToDecks = (deckId?: string) => {
  viewMode.value = 'decks'
  if (deckId) {
    deckFilter.value = deckId
  } else {
    const firstDeck = decksList.value[0]
    if (firstDeck && deckFilter.value === 'all') {
      // Auto-seleccionar primer deck si no hay ninguno seleccionado
      deckFilter.value = firstDeck.id
    }
  }
}

// Cambiar a modo colección
const switchToCollection = () => {
  viewMode.value = 'collection'
  deckFilter.value = 'all'
}

// ========== BINDER STATE ==========
const binderFilter = ref<string>('all')
const isDeletingBinder = ref(false)

const switchToBinders = (binderId?: string) => {
  viewMode.value = 'binders'
  if (binderId) {
    binderFilter.value = binderId
  } else {
    const first = binderStore.binders[0]
    if (first && binderFilter.value === 'all') {
      binderFilter.value = first.id
    }
  }
}

const bindersList = computed(() => binderStore.binders)

const selectedBinder = computed(() => {
  if (binderFilter.value === 'all') return null
  return binderStore.binders.find(b => b.id === binderFilter.value) ?? null
})

const binderDisplayCards = computed(() => {
  if (!selectedBinder.value) return []
  return binderStore.hydrateBinderCards(selectedBinder.value, collectionCards.value)
})

// ========== IMPORT PROGRESS STATE ==========
interface ImportState {
  deckId: string
  deckName: string
  status: 'fetching' | 'processing' | 'saving' | 'allocating' | 'complete' | 'error'
  totalCards: number
  currentCard: number
  cards: Omit<Card, 'id'>[]
  cardMeta: { quantity: number; isInSideboard: boolean }[]
  createdCardIds: string[]
  allocatedCount: number
}

const IMPORT_STORAGE_KEY = 'cranial_deck_import_progress'
const importProgress = ref<ImportState | null>(null)

// localStorage helpers
const saveImportState = (state: ImportState) => {
  try {
    // Don't persist cards/cardMeta arrays — they're too large for localStorage
    const { cards: _c, cardMeta: _m, ...lightweight } = state
    localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify({
      ...lightweight,
      cards: [],
      cardMeta: [],
    }))
    importProgress.value = state
  } catch (e) {
    console.warn('[Import] Failed to save state to localStorage:', e)
  }
}

const loadImportState = (): ImportState | null => {
  try {
    const saved = localStorage.getItem(IMPORT_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved) as ImportState
    }
  } catch (e) {
    console.warn('[Import] Failed to load state from localStorage:', e)
  }
  return null
}

const clearImportState = () => {
  try {
    localStorage.removeItem(IMPORT_STORAGE_KEY)
    importProgress.value = null
  } catch (e) {
    console.warn('[Import] Failed to clear state from localStorage:', e)
  }
}

// Check if a deck is currently importing
const isDeckImporting = (deckId: string): boolean => {
  return importProgress.value?.deckId === deckId &&
         importProgress.value?.status !== 'complete' &&
         importProgress.value?.status !== 'error'
}

// Get import progress percentage for a deck
const getImportProgress = (deckId: string): number => {
  if (importProgress.value?.deckId !== deckId) return 100
  if (importProgress.value.status === 'complete') return 100
  if (importProgress.value.totalCards === 0) return 0
  return Math.round((importProgress.value.currentCard / importProgress.value.totalCards) * 100)
}

// ========== DELETE DECK PROGRESS STATE ==========
interface DeleteDeckState {
  deckId: string
  deckName: string
  status: 'deleting_cards' | 'deleting_deck' | 'complete' | 'error'
  deleteCards: boolean
  cardCount: number
  cardIds: string[]
}

const DELETE_DECK_STORAGE_KEY = 'cranial_delete_deck_progress'
const deleteDeckProgress = ref<DeleteDeckState | null>(null)
const isDeletingDeck = ref(false)
const deleteProgress = ref(0)

const saveDeleteDeckState = (state: DeleteDeckState) => {
  try {
    localStorage.setItem(DELETE_DECK_STORAGE_KEY, JSON.stringify(state))
    deleteDeckProgress.value = state
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Retry after clearing stale import state
      try {
        localStorage.removeItem(IMPORT_STORAGE_KEY)
        localStorage.setItem(DELETE_DECK_STORAGE_KEY, JSON.stringify(state))
        deleteDeckProgress.value = state
        return
      } catch { /* ignore first retry */ }
      // Fallback: save without cardIds (better partial than nothing)
      try {
        const fallback = { ...state, cardIds: [] }
        localStorage.setItem(DELETE_DECK_STORAGE_KEY, JSON.stringify(fallback))
        deleteDeckProgress.value = state
        return
      } catch { /* ignore */ }
    }
    console.warn('[DeleteDeck] Failed to save state:', e)
    deleteDeckProgress.value = state
  }
}

const loadDeleteDeckState = (): DeleteDeckState | null => {
  try {
    const saved = localStorage.getItem(DELETE_DECK_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved) as DeleteDeckState
    }
  } catch (e) {
    console.warn('[DeleteDeck] Failed to load state:', e)
  }
  return null
}

const clearDeleteDeckState = () => {
  try {
    localStorage.removeItem(DELETE_DECK_STORAGE_KEY)
    deleteDeckProgress.value = null
  } catch (e) {
    console.warn('[DeleteDeck] Failed to clear state:', e)
  }
}

// ========== COMPUTED ==========

// Cartas según status (shallowRef protects during import — push in-place is invisible)
const collectionCards = computed(() => collectionStore.cards)

// Single-pass status counts (avoids 4 separate filter passes over 10k cards)
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

// Contadores por status (totales, sin filtrar por búsqueda) — from single-pass statusCounts
const ownedCount = computed(() => statusCounts.value.owned)
const collectionCount = computed(() => statusCounts.value.collection)
const availableCount = computed(() => statusCounts.value.available)
const wishlistTotalCount = computed(() => statusCounts.value.wishlist)
// Wishlist filtrada (para mostrar en la sección)
const wishlistCount = computed(() => wishlistCards.value.length)

// Función para traducir status a español
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

// Decks del store de decks
const decksList = computed(() => decksStore.decks)

// Deck seleccionado actualmente
const selectedDeck = computed(() => {
  if (deckFilter.value === 'all') return null
  return decksStore.decks.find(d => d.id === deckFilter.value) ?? null
})

// Stats del deck seleccionado
const selectedDeckStats = computed(() => {
  if (!selectedDeck.value) return null
  return selectedDeck.value.stats
})

// Cartas del deck actual (owned) — iterates allocations (O(60-100)) instead of collection (O(3000))
const deckOwnedCards = computed(() => {
  if (!selectedDeck.value?.allocations) return []
  const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
  const seen = new Set<string>()
  const result: Card[] = []
  for (const alloc of selectedDeck.value.allocations) {
    if (seen.has(alloc.cardId)) continue
    seen.add(alloc.cardId)
    const card = cardMap.get(alloc.cardId)
    if (card && card.status !== 'wishlist') result.push(card)
  }
  return result
})

// Wishlist del deck actual (legacy DeckWishlistItem[])
const deckWishlistCards = computed(() => {
  if (!selectedDeck.value) return []
  return selectedDeck.value.wishlist ?? []
})

// Wishlist cards del nuevo modelo: allocations que apuntan a cartas de colección con status='wishlist'
const deckAllocWishlistCards = computed((): { card: Card; alloc: DeckCardAllocation }[] => {
  if (!selectedDeck.value?.allocations) return []
  const results: { card: Card; alloc: DeckCardAllocation }[] = []
  for (const alloc of selectedDeck.value.allocations) {
    const card = collectionCards.value.find(c => c.id === alloc.cardId && c.status === 'wishlist')
    if (card) results.push({ card, alloc })
  }
  return results
})

// Es formato Commander?
const isCommanderFormat = computed(() => {
  return selectedDeck.value?.format === 'commander'
})

// Lista de nombres de commanders (puede haber varios con Partner)
const commanderNames = computed((): string[] => {
  if (!selectedDeck.value || !isCommanderFormat.value || !selectedDeck.value.commander) return []
  // Split by " // " for partner commanders or return single name
  const names = selectedDeck.value.commander.split(/\s*\/\/\s*|\s*,\s*/)
  return names.map(n => n.trim()).filter(n => n.length > 0)
})

// Wishlist del mainboard
const deckMainboardWishlist = computed(() => {
  if (!selectedDeck.value) return []
  return (selectedDeck.value.wishlist ?? []).filter(w => !w.isInSideboard)
})

// Wishlist del sideboard
const deckSideboardWishlist = computed(() => {
  if (!selectedDeck.value || isCommanderFormat.value) return []
  return (selectedDeck.value.wishlist ?? []).filter(w => w.isInSideboard)
})

// Conteo de cartas por sección — derived from display cards (no redundant allocation lookups)
const mainboardOwnedCount = computed(() => {
  return mainboardDisplayCards.value
    .filter(c => !c.isWishlist)
    .reduce((sum, c) => {
      // Exclude commander cards from mainboard count (matches previous behavior)
      if (isCommanderFormat.value && commanderNames.value.length > 0 &&
        commanderNames.value.some(name => name.toLowerCase() === c.name.toLowerCase())) {
        return sum
      }
      return sum + c.allocatedQuantity
    }, 0)
})

const sideboardOwnedCount = computed(() => {
  return sideboardDisplayCards.value
    .filter(c => !c.isWishlist)
    .reduce((sum, c) => sum + c.allocatedQuantity, 0)
})

const mainboardWishlistCount = computed(() => {
  const legacy = deckMainboardWishlist.value.reduce((sum, item) => sum + item.quantity, 0)
  const alloc = deckAllocWishlistCards.value
      .filter(({ alloc }) => !alloc.isInSideboard)
      .reduce((sum, { alloc }) => sum + alloc.quantity, 0)
  return legacy + alloc
})

const sideboardWishlistCount = computed(() => {
  const legacy = deckSideboardWishlist.value.reduce((sum, item) => sum + item.quantity, 0)
  const alloc = deckAllocWishlistCards.value
      .filter(({ alloc }) => alloc.isInSideboard)
      .reduce((sum, { alloc }) => sum + alloc.quantity, 0)
  return legacy + alloc
})

// ========== COLLECTION FILTER (composable) ==========

// Pre-filter: status + deck (collection-specific, before composable)
const statusFilteredCards = computed(() => {
  let cards = collectionCards.value

  // Status filter
  if (statusFilter.value === 'owned') {
    cards = cards.filter(c => c.status !== 'wishlist')
  } else if (statusFilter.value === 'available') {
    cards = cards.filter(c => c.status === 'sale' || c.status === 'trade')
  } else if (statusFilter.value !== 'all') {
    cards = cards.filter(c => c.status === statusFilter.value)
  }

  // Deck filter (using allocations) — only for owned cards
  if (deckFilter.value !== 'all') {
    cards = cards.filter(c => {
      if (c.status === 'wishlist') return false
      const allocations = getAllocationsForCard(c.id)
      return allocations.some(a => a.deckId === deckFilter.value)
    })
  }

  return cards
})

// Shared filter composable (text search, sort, group, chip filters)
const {
  filterQuery,
  sortBy,
  groupBy: deckGroupBy,
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

// Bridge: individual refs <-> AdvancedFilters for the shared modal
// Modal uses Scryfall-style values (w, u, creature, common), collection uses display categories (White, Blue, Creatures, Common)
const colorToModal: Record<string, string> = { White: 'w', Blue: 'u', Black: 'b', Red: 'r', Green: 'g', Colorless: 'c' }
const colorFromModal: Record<string, string> = { w: 'White', u: 'Blue', b: 'Black', r: 'Red', g: 'Green', c: 'Colorless' }
const typeToModal: Record<string, string> = { Creatures: 'creature', Instants: 'instant', Sorceries: 'sorcery', Enchantments: 'enchantment', Artifacts: 'artifact', Planeswalkers: 'planeswalker', Lands: 'land' }
const typeFromModal: Record<string, string> = { creature: 'Creatures', instant: 'Instants', sorcery: 'Sorceries', enchantment: 'Enchantments', artifact: 'Artifacts', planeswalker: 'Planeswalkers', land: 'Lands' }
const rarityToModal: Record<string, string> = { Common: 'common', Uncommon: 'uncommon', Rare: 'rare', Mythic: 'mythic' }
const rarityFromModal: Record<string, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic' }

// When all items are selected (= no filter), pass empty array so the modal shows nothing selected
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
  // Sync sets
  advSelectedSets.value = [...updated.sets]
  // Sync keywords
  advSelectedKeywords.value = [...updated.keywords]
  // Sync formats
  advSelectedFormats.value = [...updated.formatLegal]
  // Sync creature types
  advSelectedCreatureTypes.value = [...(updated.creatureTypes ?? [])]
  // Sync price
  advPriceMin.value = updated.priceUSD.min
  advPriceMax.value = updated.priceUSD.max
  // Sync power/toughness
  advPowerMin.value = updated.power.min
  advPowerMax.value = updated.power.max
  advToughnessMin.value = updated.toughness.min
  advToughnessMax.value = updated.toughness.max
  // Sync foil
  advFoilFilter.value = updated.isFoil ? 'foil' : 'any'
  // Sync full art
  advFullArtOnly.value = updated.isFullArt
  // Sync mana values — modal uses numbers [0..10], collection uses strings ['0'..'9','10+','Lands']
  if (updated.manaValue.values?.length) {
    const mapped = updated.manaValue.values.map(v => v === 10 ? '10+' : String(v))
    selectedManaValues.value = new Set(mapped)
  } else {
    selectedManaValues.value = new Set(manaOrder)
  }
  // Sync chip filters — map modal values back to collection categories
  // Empty array from modal = no filter = select all
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

// ========== SERVER-SIDE PAGINATION WIRING ==========

/** Build a filters object for queryCardIndex from current filter state */
const buildPaginationFilters = () => {
  // Map status filter to server format
  let statusArr: string[] | undefined
  if (statusFilter.value === 'owned') {
    statusArr = ['collection', 'sale', 'trade']
  } else if (statusFilter.value === 'available') {
    statusArr = ['sale', 'trade']
  } else if (statusFilter.value !== 'all') {
    statusArr = [statusFilter.value]
  }

  // Map color display categories to color letters for server
  const colorMap: Record<string, string> = { White: 'W', Blue: 'U', Black: 'B', Red: 'R', Green: 'G', Colorless: 'C' }
  const colorArr = selectedColors.value.size < colorOrder.length
    ? [...selectedColors.value].map(c => colorMap[c]).filter(Boolean) as string[] // eslint-disable-line security/detect-object-injection
    : undefined

  // Map rarity display categories to server format
  const rarityMap: Record<string, string> = { Common: 'common', Uncommon: 'uncommon', Rare: 'rare', Mythic: 'mythic' }
  const rarityArr = selectedRarities.value.size < rarityOrder.length
    ? [...selectedRarities.value].map(r => rarityMap[r]).filter(Boolean) as string[] // eslint-disable-line security/detect-object-injection
    : undefined

  // Map type display categories to server format
  const typeMap: Record<string, string> = { Creatures: 'creature', Instants: 'instant', Sorceries: 'sorcery', Enchantments: 'enchantment', Artifacts: 'artifact', Planeswalkers: 'planeswalker', Lands: 'land' }
  const typeArr = selectedTypes.value.size < typeOrder.length
    ? [...selectedTypes.value].map(t => typeMap[t]).filter(Boolean) as string[] // eslint-disable-line security/detect-object-injection
    : undefined

  // Map foil filter
  const foilVal = advFoilFilter.value === 'foil' ? true : undefined

  // Map condition — not currently tracked as chip filter; skip if not filtered
  const conditionArr = undefined

  // Map edition (advanced sets filter)
  const editionArr = advSelectedSets.value.length > 0 ? advSelectedSets.value : undefined

  return {
    search: filterQuery.value.trim() || undefined,
    status: statusArr,
    edition: editionArr,
    color: colorArr,
    rarity: rarityArr,
    type: typeArr,
    foil: foilVal,
    condition: conditionArr,
    minPrice: advPriceMin.value,
    maxPrice: advPriceMax.value,
  }
}

/** Build a sort object for queryCardIndex from current sort state */
const buildPaginationSort = (): { field: 'name' | 'price' | 'edition' | 'quantity' | 'dateAdded'; direction: 'asc' | 'desc' } => {
  // Map client sort values to server field names
  const fieldMap: Record<string, 'name' | 'price' | 'edition' | 'quantity' | 'dateAdded'> = {
    name: 'name',
    price: 'price',
    recent: 'dateAdded',
    edition: 'edition',
    quantity: 'quantity',
  }
  return {
    field: fieldMap[sortBy.value] ?? 'name',
    direction: sortBy.value === 'name' ? 'asc' : 'desc',
  }
}

// Debounced watcher: when any filter/sort changes, re-query the server
let _paginationDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [
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
  ],
  () => {
    if (_paginationDebounceTimer) clearTimeout(_paginationDebounceTimer)
    _paginationDebounceTimer = setTimeout(() => {
      if (viewMode.value === 'collection') {
        collectionStore.queryPage(buildPaginationFilters(), buildPaginationSort())
      }
    }, 300)
  },
  { deep: true }
)

// Clean up debounce timer on unmount
onUnmounted(() => {
  if (_paginationDebounceTimer) clearTimeout(_paginationDebounceTimer)
})

// Computed: use paginated cards for collection mode, filtered cards for deck/binder
const collectionDisplayCards = computed(() => {
  const paginated = collectionStore.paginatedCards
  // If pagination has data, use it; otherwise fall back to filteredCards
  if (paginated.length > 0 || collectionStore.paginationMeta.loading) {
    return paginated
  }
  return filteredCards.value
})

// Card count display for paginated mode
const paginatedCardCount = computed(() => {
  const meta = collectionStore.paginationMeta
  if (meta.total > 0) {
    return { showing: collectionStore.paginatedCards.length, total: meta.total }
  }
  return { showing: filteredCards.value.length, total: filteredCards.value.length }
})

// Wishlist grouping — reuses the same filter state from the main composable
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
  switch (deckGroupBy.value) {
    case 'mana': return getCardManaCategory(card)
    case 'color': return getCardColorCategory(card)
    case 'type': return getCardTypeCategory(card)
    default: return 'all'
  }
}

const getCategoryOrder = (): string[] => {
  switch (deckGroupBy.value) {
    case 'mana': return manaOrder
    case 'color': return colorOrder
    case 'type': return typeOrder
    default: return []
  }
}

const groupedWishlistCards = computed(() => {
  const source = hasActiveFilters.value ? wishlistCards.value.filter(passesChipFilters) : wishlistCards.value

  if (deckGroupBy.value === 'none') {
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

// Convert owned cards to DisplayDeckCard format for DeckEditorGrid
// Consolidated: iterates deck allocations directly (O(allocations)) instead of going through
// deckMainboardCards chain which filtered the entire collection
const mainboardDisplayCards = computed((): DisplayDeckCard[] => {
  if (!selectedDeck.value) return []

  const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
  const commanderDisplay: HydratedDeckCard[] = []
  const mainboardOwned: HydratedDeckCard[] = []

  // Iterate allocations directly (O(60-100)) instead of filtering collection (O(3000))
  for (const alloc of selectedDeck.value.allocations ?? []) {
    if (alloc.isInSideboard) continue
    const card = cardMap.get(alloc.cardId)
    if (!card || card.status === 'wishlist') continue

    const hydratedCard: HydratedDeckCard = {
      cardId: card.id,
      scryfallId: card.scryfallId,
      name: card.name,
      edition: card.edition,
      condition: card.condition,
      foil: card.foil,
      price: card.price,
      image: card.image,
      cmc: card.cmc,
      type_line: card.type_line,
      colors: card.colors,
      produced_mana: card.produced_mana,
      allocatedQuantity: alloc.quantity,
      isInSideboard: false,
      notes: undefined,
      addedAt: card.createdAt ?? new Date(),
      isWishlist: false as const,
      availableInCollection: card.quantity - alloc.quantity,
      totalInCollection: card.quantity,
    }

    // Separate commander cards (displayed first in mainboard)
    const isCommander = isCommanderFormat.value && commanderNames.value.length > 0 &&
      commanderNames.value.some(name => name.toLowerCase() === card.name.toLowerCase())

    if (isCommander) {
      commanderDisplay.push(hydratedCard)
    } else {
      mainboardOwned.push(hydratedCard)
    }
  }

  // Convert legacy wishlist items to HydratedWishlistCard format
  const wishlistDisplay: HydratedWishlistCard[] = deckMainboardWishlist.value.map(item => ({
    cardId: '',
    scryfallId: item.scryfallId,
    name: item.name,
    edition: item.edition,
    condition: item.condition,
    foil: item.foil,
    price: item.price,
    image: item.image,
    cmc: item.cmc,
    type_line: item.type_line,
    colors: item.colors,
    requestedQuantity: item.quantity,
    allocatedQuantity: item.quantity,
    isInSideboard: false,
    notes: item.notes,
    addedAt: item.addedAt,
    isWishlist: true as const,
    availableInCollection: 0,
    totalInCollection: 0,
  }))

  // Convert new-model wishlist allocation cards (collection cards with status='wishlist')
  // Look up actual owned count (non-wishlist cards) by scryfallId for proxy detection
  const ownedByScryfallId = new Map<string, number>()
  for (const c of collectionCards.value) {
    if (c.status !== 'wishlist') {
      ownedByScryfallId.set(c.scryfallId, (ownedByScryfallId.get(c.scryfallId) ?? 0) + c.quantity)
    }
  }

  const allocWishlistDisplay: HydratedWishlistCard[] = deckAllocWishlistCards.value
      .filter(({ alloc }) => !alloc.isInSideboard)
      .map(({ card, alloc }) => ({
        cardId: card.id,
        scryfallId: card.scryfallId,
        name: card.name,
        edition: card.edition,
        condition: card.condition,
        foil: card.foil,
        price: card.price,
        image: card.image,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors,
        produced_mana: card.produced_mana,
        requestedQuantity: alloc.quantity,
        allocatedQuantity: alloc.quantity,
        isInSideboard: false,
        notes: alloc.notes,
        addedAt: alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt),
        isWishlist: true as const,
        availableInCollection: 0,
        totalInCollection: ownedByScryfallId.get(card.scryfallId) ?? 0,
      }))

  return [...commanderDisplay, ...mainboardOwned, ...wishlistDisplay, ...allocWishlistDisplay]
})

// Consolidated: iterates deck allocations directly for sideboard
const sideboardDisplayCards = computed((): DisplayDeckCard[] => {
  if (!selectedDeck.value || isCommanderFormat.value) return []

  const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
  const sideboardOwned: HydratedDeckCard[] = []

  // Iterate allocations directly (O(allocations)) instead of filtering collection
  for (const alloc of selectedDeck.value.allocations ?? []) {
    if (!alloc.isInSideboard) continue
    const card = cardMap.get(alloc.cardId)
    if (!card || card.status === 'wishlist') continue

    sideboardOwned.push({
      cardId: card.id,
      scryfallId: card.scryfallId,
      name: card.name,
      edition: card.edition,
      condition: card.condition,
      foil: card.foil,
      price: card.price,
      image: card.image,
      cmc: card.cmc,
      type_line: card.type_line,
      colors: card.colors,
      produced_mana: card.produced_mana,
      allocatedQuantity: alloc.quantity,
      isInSideboard: true,
      notes: undefined,
      addedAt: card.createdAt ?? new Date(),
      isWishlist: false as const,
      availableInCollection: card.quantity - alloc.quantity,
      totalInCollection: card.quantity,
    })
  }

  // Convert legacy wishlist items to HydratedWishlistCard format
  const wishlistDisplay: HydratedWishlistCard[] = deckSideboardWishlist.value.map(item => ({
    cardId: '',
    scryfallId: item.scryfallId,
    name: item.name,
    edition: item.edition,
    condition: item.condition,
    foil: item.foil,
    price: item.price,
    image: item.image,
    cmc: item.cmc,
    type_line: item.type_line,
    colors: item.colors,
    requestedQuantity: item.quantity,
    allocatedQuantity: item.quantity,
    isInSideboard: true,
    notes: item.notes,
    addedAt: item.addedAt,
    isWishlist: true as const,
    availableInCollection: 0,
    totalInCollection: 0,
  }))

  // Convert new-model wishlist allocation cards
  const ownedByScryfallId = new Map<string, number>()
  for (const c of collectionCards.value) {
    if (c.status !== 'wishlist') {
      ownedByScryfallId.set(c.scryfallId, (ownedByScryfallId.get(c.scryfallId) ?? 0) + c.quantity)
    }
  }

  const allocWishlistDisplay: HydratedWishlistCard[] = deckAllocWishlistCards.value
      .filter(({ alloc }) => alloc.isInSideboard)
      .map(({ card, alloc }) => ({
        cardId: card.id,
        scryfallId: card.scryfallId,
        name: card.name,
        edition: card.edition,
        condition: card.condition,
        foil: card.foil,
        price: card.price,
        image: card.image,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors,
        produced_mana: card.produced_mana,
        requestedQuantity: alloc.quantity,
        allocatedQuantity: alloc.quantity,
        isInSideboard: true,
        notes: alloc.notes,
        addedAt: alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt),
        isWishlist: true as const,
        availableInCollection: 0,
        totalInCollection: ownedByScryfallId.get(card.scryfallId) ?? 0,
      }))

  return [...sideboardOwned, ...wishlistDisplay, ...allocWishlistDisplay]
})

// Text-search filtered versions of deck/binder display cards (filterQuery is handled by useCardFilter for collection mode only)
const filteredMainboardDisplayCards = computed(() => {
  if (!filterQuery.value.trim()) return mainboardDisplayCards.value
  const q = filterQuery.value.toLowerCase()
  return mainboardDisplayCards.value.filter(c =>
    c.name.toLowerCase().includes(q) || c.edition.toLowerCase().includes(q)
  )
})

const filteredSideboardDisplayCards = computed(() => {
  if (!filterQuery.value.trim()) return sideboardDisplayCards.value
  const q = filterQuery.value.toLowerCase()
  return sideboardDisplayCards.value.filter(c =>
    c.name.toLowerCase().includes(q) || c.edition.toLowerCase().includes(q)
  )
})

const filteredBinderDisplayCards = computed(() => {
  if (!filterQuery.value.trim()) return binderDisplayCards.value
  const q = filterQuery.value.toLowerCase()
  return binderDisplayCards.value.filter(c =>
    c.name.toLowerCase().includes(q) || c.edition.toLowerCase().includes(q)
  )
})

// filteredCards is provided by useCardFilter composable (text search + sort + chip filters)

// Deck costs are now calculated in the DECK PRICE SOURCE section below (deckOwnedCostBySource, etc.)

// Card IDs currently being deleted (for disabling UI)
const deletingCardIds = computed(() => {
  return new Set<string>()
})

// ¿Todas las cartas del deck son públicas?
const isDeckPublic = computed(() => {
  if (deckOwnedCards.value.length === 0) return true
  return deckOwnedCards.value.every(card => card.public !== false)
})

// Cantidad de cartas owned en el deck
const deckOwnedCount = computed(() => {
  return deckOwnedCards.value.reduce((sum, card) => {
    const allocations = getAllocationsForCard(card.id)
    const totalQty = allocations
      .filter(a => a.deckId === deckFilter.value)
      .reduce((s, a) => s + a.quantity, 0)
    return sum + totalQty
  }, 0)
})

// Cantidad de cartas wishlist en el deck (legacy + nuevo modelo)
const deckWishlistCount = computed(() => {
  const legacyCount = deckWishlistCards.value.reduce((sum, item) => sum + item.quantity, 0)
  const allocCount = deckAllocWishlistCards.value.reduce((sum, { alloc }) => sum + alloc.quantity, 0)
  return legacyCount + allocCount
})

// ========== DECK PRICE SOURCE ==========
type DeckPriceSource = 'tcg' | 'ck' | 'buylist'
const deckPriceSource = ref<DeckPriceSource>('ck')

// Access shared card prices from useCollectionTotals (populated by CollectionTotalsPanel)
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
  const hasPanel = viewMode.value === 'collection' || (viewMode.value === 'decks' && selectedDeck.value) || (viewMode.value === 'binders' && selectedBinder.value)
  if (!hasPanel) return { bottom: '4rem' }
  const panelExpanded = viewMode.value === 'collection' ? totalsPanelExpanded.value : deckStatsExpanded.value
  if (panelExpanded) return { bottom: 'calc(10rem + env(safe-area-inset-bottom, 0px))' }
  return { bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }
})

const deckActiveSourceLabel = computed(() => {
  if (deckPriceSource.value === 'ck') return 'CK'
  if (deckPriceSource.value === 'buylist') return 'BUY'
  return 'TCG'
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
    // Only set public:true on non-collection cards; for public:false, apply to all
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

const handleBulkAllocateToBinder = async (binderId: string) => {
  if (selectedCardIds.value.size === 0 || bulkActionLoading.value) return
  showBulkBinderPicker.value = false
  bulkActionLoading.value = true
  try {
    const cardIds = [...selectedCardIds.value]

    // Move: deallocate selected cards from any OTHER binders first
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

    // Now allocate to target binder (availability freed up), using full card quantity
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

// ========== METHODS ==========

// Get how many copies of a card the user owns (by name, any edition)
// Click on local card suggestion
const handleLocalCardSelect = (card: Card) => {
  if (viewMode.value === 'decks' && deckFilter.value !== 'all') {
    filterQuery.value = ''
    void quickAllocateCardToDeck(card)
  } else if (viewMode.value === 'binders' && binderFilter.value !== 'all') {
    filterQuery.value = ''
    void quickAllocateCardToBinder(card)
  } else {
    filterQuery.value = ''
    selectedCard.value = card
    showCardDetailModal.value = true
  }
}

// Quick add to deck (1 copy, mainboard)
const quickAllocateCardToDeck = async (card: Card) => {
  if (deckFilter.value === 'all') return
  const result = await decksStore.allocateCardToDeck(deckFilter.value, card.id, 1, false)
  if (result.allocated > 0) {
    toastStore.show(t('collection.quickAdd.allocated', { name: card.name }), 'success')
  } else if (result.wishlisted > 0) {
    toastStore.show(t('collection.quickAdd.wishlisted', { name: card.name }), 'info')
  }
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

// Click on "Advanced search" → navigate to /search (collection mode only)
const handleOpenAdvancedSearch = () => {
  void router.push({ path: '/search' })
}

// Cerrar modal de agregar carta y limpiar URL
const handleAddCardModalClose = () => {
  showAddCardModal.value = false
  selectedScryfallCard.value = undefined
  // Clear addCard query param if present
  if (route.query.addCard) {
    void router.replace({ path: '/collection', query: { ...route.query, addCard: undefined } })
  }
}

// Cuando hace click en una carta de la colección (o editar)
const handleCardClick = (card: Card) => {
  selectedCard.value = card
  showCardDetailModal.value = true
}

// Eliminar existente (optimistic UI - visual inmediato, toast después de DB)
const handleDelete = async (card: Card) => {
  // Check if card has allocations in decks
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

  // Delete card + convert allocations in parallel
  const deletePromise = collectionStore.deleteCard(card.id)
  const convertPromise = hasAllocations
    ? decksStore.convertAllocationsToWishlist(card)
    : Promise.resolve()

  const [deleteResult, convertResult] = await Promise.allSettled([deletePromise, convertPromise])

  if (deleteResult.status === 'fulfilled' && deleteResult.value) {
    toastStore.show(`"${card.name}" eliminada`, 'success')
  }
  // If delete failed, store already shows error toast and restores card

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

// ========== DECK EDITOR GRID HANDLERS ==========

// Handle edit from deck grid
const handleDeckGridEdit = async (displayCard: DisplayDeckCard) => {
  if (displayCard.isWishlist) {
    // Wishlist card: search on Scryfall and offer to add to collection
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

// Handle remove from deck grid
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

  // Offer to also remove from collection (promise resolves after leave transition)
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

// Handle quantity update from deck grid
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
      true // silent — we handle the max-exceeded case ourselves
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
      // Allocation failed likely due to max available — offer to add to collection or wishlist
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
        // Bump collection quantity, then retry allocation
        await collectionStore.updateCard(cardId, { quantity: card.quantity + 1 })
        await decksStore.updateAllocation(selectedDeck.value.id, cardId, displayCard.isInSideboard, newQuantity)
        toastStore.show(t('decks.messages.addedToCollection'), 'success')
      } else {
        // Add as wishlist allocation
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

// Handle add to wishlist from deck grid (card is already in wishlist)
const handleDeckGridAddToWishlist = (_displayCard: DisplayDeckCard) => {
  toastStore.show(t('decks.editor.messages.alreadyInWishlist'), 'info')
}

// Handle toggle commander from deck grid
const handleDeckGridToggleCommander = async (displayCard: DisplayDeckCard) => {
  if (!selectedDeck.value) return
  await decksStore.toggleCommander(selectedDeck.value.id, displayCard.name)
}

// Handle move between mainboard/sideboard from deck grid
const handleDeckGridMoveBoard = async (displayCard: DisplayDeckCard) => {
  if (!selectedDeck.value) return
  const record = displayCard as unknown as Record<string, unknown>
  const isInSideboard = !displayCard.isWishlist && record.isInSideboard === true
  const cardId = (record.cardId as string) ?? displayCard.cardId
  const currentQty = displayCard.isWishlist
    ? displayCard.requestedQuantity
    : displayCard.allocatedQuantity

  // qty=1 → skip prompt, move directly
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
    // Normal partial/full move
    await decksStore.moveCardBoard(selectedDeck.value.id, cardId, isInSideboard, requestedQty)
  } else {
    // Move all available first
    await decksStore.moveCardBoard(selectedDeck.value.id, cardId, isInSideboard, currentQty)

    const extraNeeded = requestedQty - currentQty
    // Ask to add extras
    const addExtras = await confirmStore.show({
      title: t('decks.prompt.addExtrasTitle'),
      message: t('decks.prompt.addExtrasMessage', { available: currentQty, extra: extraNeeded }),
    })
    if (!addExtras) return

    // Ask: collection or wishlist?
    const toCollection = await confirmStore.show({
      title: t('decks.prompt.chooseDestination'),
      message: t('decks.prompt.chooseDestination'),
      confirmText: t('decks.prompt.addToCollection'),
      cancelText: t('decks.prompt.addToWishlist'),
    })

    // Add extras — target board is the destination (opposite of source)
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

// ========== BINDER EVENT HANDLERS ==========

/** Deallocate selected cards from other binders, then allocate to target binder */
const performBulkBinderAllocate = async (binderId: string) => {
  const cardIds = [...selectedCardIds.value]

  // Move: deallocate selected cards from any OTHER binders first
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

  const msgKey = allocated > 0
    ? (totalMoved > 0 ? 'collection.bulkEdit.binderMoveSuccess' : 'collection.bulkEdit.binderSuccess')
    : 'collection.bulkEdit.binderSuccess'
  const msgType: ToastType = allocated > 0 ? 'success' : 'info'
  toastStore.show(t(msgKey, { count: allocated }), msgType)

  selectedCardIds.value = new Set()
  selectionMode.value = false
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

    viewMode.value = 'binders'
    binderFilter.value = binderId
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

// ========== SHARED HELPERS (reduce cognitive complexity) ==========

/** Extract the normal image URL from a Scryfall card object */
const extractScryfallImage = (card: ScryfallCard | null | undefined): string => {
  return card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal ?? ''
}

/** Extracted card data from Scryfall for building collection cards */
interface ExtractedScryfallData {
  scryfallId: string
  image: string
  price: number
  edition: string
  setCode: string
  cmc: number | undefined
  type_line: string
  colors: string[]
  rarity: string
  power: string | undefined
  toughness: string | undefined
  oracle_text: string | undefined
  keywords: string[]
  legalities: Record<string, string> | undefined
  full_art: boolean
  produced_mana: string[] | undefined
}

/** Extract all relevant card data fields from a Scryfall result */
const extractScryfallCardData = (card: ScryfallCard): ExtractedScryfallData => {
  return {
    scryfallId: card.id,
    image: extractScryfallImage(card),
    price: card.prices?.usd ? Number.parseFloat(card.prices.usd) : 0,
    edition: card.set_name,
    setCode: card.set.toUpperCase(),
    cmc: card.cmc,
    type_line: card.type_line,
    colors: card.colors ?? [],
    rarity: card.rarity,
    power: card.power,
    toughness: card.toughness,
    oracle_text: card.oracle_text,
    keywords: card.keywords ?? [],
    legalities: card.legalities,
    full_art: card.full_art ?? false,
    produced_mana: card.produced_mana,
  }
}

/** Execute the actual binder deletion (card deletion + binder doc deletion) */
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

/** Parse a single text line into card data for import (shared by deck and binder text import) */
const parseTextImportLine = (trimmed: string): { quantity: number; cardName: string; setCode: string | null; isFoil: boolean } | null => {
  // eslint-disable-next-line security/detect-unsafe-regex
  const match = /^(\d+)x?\s+(.+?)(?:\s+\((\w+)\))?(?:\s+[\w-]+)?(?:\s+\*f\*?)?$/i.exec(trimmed)
  const matchQty = match?.[1]
  const matchName = match?.[2]
  if (!match || !matchQty || !matchName) return null

  return {
    quantity: Number.parseInt(matchQty, 10),
    cardName: cleanCardName(matchName.trim()),
    setCode: match[3] ?? null,
    isFoil: /\*[fF]\*?\s*$/.test(trimmed),
  }
}

/** Build a collection card object from text import line data + Scryfall results */
const buildCollectionCardFromScryfall = (opts: {
  cardName: string,
  quantity: number,
  condition: CardCondition,
  isFoil: boolean,
  setCode: string | null,
  scryfallData: ExtractedScryfallData | null | undefined,
  status: CardStatus | undefined,
  makePublic: boolean,
  isInSideboard: boolean,
}): ImportCardData => {
  const { cardName, quantity, condition, isFoil, setCode, scryfallData, status, makePublic, isInSideboard } = opts
  const cardData: ImportCardData = {
    scryfallId: scryfallData?.scryfallId ?? '',
    name: cardName,
    edition: scryfallData?.edition ?? setCode ?? 'Unknown',
    quantity,
    condition,
    foil: isFoil,
    price: scryfallData?.price ?? 0,
    image: scryfallData?.image ?? '',
    status: status ?? 'collection',
    public: makePublic,
    isInSideboard,
    cmc: scryfallData?.cmc,
    type_line: scryfallData?.type_line,
    colors: scryfallData?.colors ?? [],
    rarity: scryfallData?.rarity,
    power: scryfallData?.power,
    toughness: scryfallData?.toughness,
    oracle_text: scryfallData?.oracle_text,
    keywords: scryfallData?.keywords ?? [],
    legalities: scryfallData?.legalities,
    full_art: scryfallData?.full_art ?? false,
    updatedAt: new Date(),
  }
  if (scryfallData?.setCode ?? setCode) {
    cardData.setCode = scryfallData?.setCode ?? setCode ?? undefined
  }
  return cardData
}

// @ts-expect-error — unused after progressive import refactor, kept for reference
const _processImportCard = (
  card: MoxfieldImportCard,
  scryfallDataMap: Map<string, ScryfallCard>,
  condition: CardCondition,
  status: CardStatus | undefined,
  makePublic: boolean,
): { cardData: ImportCardData; needsSearch: boolean } => {
  let cardName: string = card.name
  const isFoil = /\*[fF]\*?\s*$/.test(cardName)
  if (isFoil) cardName = cardName.replace(/\s*\*[fF]\*?\s*$/, '').trim()

  let image = ''
  let price = 0
  const finalScryfallId = card.scryfallId ?? ''
  let finalEdition = card.setCode ?? 'Unknown'
  let cmc: number | undefined = undefined
  let type_line: string | undefined = undefined
  let colors: string[] = []
  let rarity: string | undefined = undefined
  let power: string | undefined = undefined
  let toughness: string | undefined = undefined
  let oracle_text: string | undefined = undefined
  let keywords: string[] = []
  let legalities: Record<string, string> | undefined = undefined
  let full_art = false
  let produced_mana: string[] = []

  if (card.scryfallId && scryfallDataMap.has(card.scryfallId)) {
    const scryfallCard = scryfallDataMap.get(card.scryfallId)
    image = extractScryfallImage(scryfallCard)
    price = scryfallCard?.prices?.usd ? Number.parseFloat(scryfallCard.prices.usd) : 0
    finalEdition = scryfallCard?.set?.toUpperCase() ?? finalEdition
    cmc = scryfallCard?.cmc
    type_line = scryfallCard?.type_line
    colors = scryfallCard?.colors ?? []
    rarity = scryfallCard?.rarity
    power = scryfallCard?.power
    toughness = scryfallCard?.toughness
    oracle_text = scryfallCard?.oracle_text
    keywords = scryfallCard?.keywords ?? []
    legalities = scryfallCard?.legalities
    full_art = scryfallCard?.full_art ?? false
    produced_mana = scryfallCard?.produced_mana ?? []
  }

  const cardData: ImportCardData = {
    scryfallId: finalScryfallId,
    name: cardName,
    edition: finalEdition,
    quantity: card.quantity,
    condition,
    foil: isFoil,
    price,
    image,
    status: status ?? 'collection',
    public: makePublic,
    cmc,
    type_line,
    colors,
    rarity,
    power,
    toughness,
    oracle_text,
    keywords,
    legalities,
    full_art,
    produced_mana,
    updatedAt: new Date(),
  }

  return { cardData, needsSearch: price === 0 || !image }
}

const _applySearchResultToCard = (cardData: ImportCardData, results: ScryfallCard[]) => {
  const printWithPrice = results.find(r =>
    r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
    (r.image_uris?.normal ?? r.card_faces?.[0]?.image_uris?.normal)
  ) ?? results.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0)

  if (printWithPrice?.prices?.usd) {
    Object.assign(cardData, extractScryfallCardData(printWithPrice))
    return
  }

  if (results.length === 0 || cardData.image) return
  const anyPrint = results[0]
  if (!anyPrint) return

  const extracted = extractScryfallCardData(anyPrint)
  cardData.image = extracted.image
  if (!cardData.scryfallId) cardData.scryfallId = extracted.scryfallId
  if (cardData.edition === 'Unknown') cardData.edition = extracted.setCode
  cardData.cmc = extracted.cmc
  cardData.type_line = extracted.type_line
  cardData.colors = extracted.colors
  cardData.rarity = extracted.rarity
  cardData.power = extracted.power
  cardData.toughness = extracted.toughness
  cardData.oracle_text = extracted.oracle_text
  cardData.keywords = extracted.keywords
  cardData.legalities = extracted.legalities
  cardData.full_art = extracted.full_art
}

// @ts-expect-error — unused after progressive import refactor
const _enrichCardsWithFallbackSearch = async (collectionCardsToAdd: ImportCardData[], cardsNeedingSearch: number[]) => {
  for (const idx of cardsNeedingSearch) {
    // eslint-disable-next-line security/detect-object-injection
    const cardData = collectionCardsToAdd[idx]
    if (!cardData) continue
    try {
      const results = await searchCards(`!"${cardData.name}"`)
      _applySearchResultToCard(cardData, results)
    } catch (e) {
      console.warn(`[Import] Failed to search for "${cardData.name}":`, e)
    }
  }
}

/** Build a minimal card from Moxfield import data (no Scryfall fetch needed) */
const buildRawMoxfieldCard = (
  card: MoxfieldImportCard,
  condition: CardCondition,
  status: CardStatus | undefined,
  makePublic: boolean,
): ImportCardData => {
  let cardName = card.name
  const isFoil = /\*[fF]\*?\s*$/.test(cardName)
  if (isFoil) cardName = cardName.replace(/\s*\*[fF]\*?\s*$/, '').trim()

  // User-specific fields + convenience copies (name, edition, image)
  // Scryfall metadata (colors, keywords, etc.) lives in scryfall_cache
  return {
    scryfallId: card.scryfallId ?? '',
    name: cardName,
    edition: card.setCode?.toUpperCase() ?? 'Unknown',
    setCode: card.setCode?.toUpperCase(),
    quantity: card.quantity,
    condition,
    foil: isFoil,
    price: 0,
    image: card.scryfallId ? `https://cards.scryfall.io/normal/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg` : '',
    status: status ?? 'collection',
    public: makePublic,
    updatedAt: new Date(),
  }
}

/** Build a minimal card from CSV import data (no Scryfall fetch needed) */
const buildRawCsvCard = (
  card: ParsedCsvCard,
  status: CardStatus | undefined,
  makePublic: boolean,
): ImportCardData => {
  // User-specific fields + convenience copies (name, edition, image)
  // Scryfall metadata (colors, keywords, etc.) lives in scryfall_cache
  const cardData: ImportCardData = {
    scryfallId: card.scryfallId ?? '',
    name: card.name,
    edition: card.setCode?.toUpperCase() ?? 'Unknown',
    quantity: card.quantity,
    condition: card.condition,
    foil: card.foil,
    price: card.price ?? 0,
    image: card.scryfallId ? `https://cards.scryfall.io/normal/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg` : '',
    status: status ?? 'collection',
    public: makePublic,
    updatedAt: new Date(),
  }
  if (card.setCode) cardData.setCode = card.setCode.toUpperCase()
  if (card.language) cardData.language = card.language
  return cardData
}

// @ts-expect-error — unused after progressive import refactor
const _buildCsvCollectionCard = (
  card: ParsedCsvCard,
  scryfallDataMap: Map<string, ScryfallCard>,
  status: CardStatus | undefined,
  makePublic: boolean,
): ImportCardData => {
  const sc = scryfallDataMap.get(card.scryfallId)
  const image = extractScryfallImage(sc)
  const price = sc?.prices?.usd ? Number.parseFloat(sc.prices.usd) : card.price

  const cardData: ImportCardData = {
    scryfallId: card.scryfallId ?? '',
    name: card.name,
    edition: sc?.set_name ?? card.setCode ?? 'Unknown',
    quantity: card.quantity,
    condition: card.condition,
    foil: card.foil,
    price,
    image,
    status: status ?? 'collection',
    public: makePublic,
    cmc: sc?.cmc,
    type_line: sc?.type_line,
    colors: sc?.colors ?? [],
    rarity: sc?.rarity,
    power: sc?.power,
    toughness: sc?.toughness,
    oracle_text: sc?.oracle_text,
    keywords: sc?.keywords ?? [],
    legalities: sc?.legalities,
    full_art: sc?.full_art ?? false,
    produced_mana: sc?.produced_mana ?? [],
    updatedAt: new Date(),
  }
  if (card.setCode) {
    cardData.setCode = card.setCode.toUpperCase()
  }
  if (card.language) {
    cardData.language = card.language
  }
  return cardData
}

/** Execute the card deletion step of deck deletion (shared logic extracted from executeDeleteDeck) */
const executeCardDeletionStep = async (
  state: DeleteDeckState,
  isResume: boolean,
  onProgress: (percent: number) => void,
): Promise<void> => {
  if (!state.deleteCards || state.cardIds.length === 0) return

  cancelPriceFetch()
  saveDeleteDeckState(state)
  const result = await collectionStore.batchDeleteCards(state.cardIds, (percent) => {
    onProgress(5 + Math.round(percent * 0.8))
  })

  if (result.failed > 0) {
    console.warn(`[DeleteDeck] ${result.failed} cards failed to delete`)
    toastStore.show(t('decks.messages.deletedWithCardWarning', { deleted: result.deleted, failed: result.failed }), 'info')
    if (!isResume) {
      throw new Error(`Card deletion incomplete: ${result.failed} failed`)
    }
  } else {
    toastStore.show(t('decks.messages.deletedWithCards', { count: state.cardIds.length }), 'success')
  }
}

/** Build export lines for deck text export (shared logic extracted from handleExportDeck) */
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

const handleDeleteBinder = async () => {
  if (!selectedBinder.value) return

  // Capture references BEFORE any async operation (computed may change)
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

  // Ask if user also wants to delete cards from collection
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

  // Deselect binder BEFORE deleting cards to avoid reactive cascade
  // (each card splice would re-trigger binderDisplayCards computed otherwise)
  binderFilter.value = 'all'

  try {
    await executeBinderDeletion(binderId, cardIds, deleteCards)
  } catch (err) {
    console.error('[DeleteBinder] Error:', err)
    toastStore.show(t('common.messages.loadError'), 'error')
  }

  isDeletingBinder.value = false
}

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

  // Offer to also remove from collection (promise resolves after leave transition)
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

const quickAllocateCardToBinder = async (card: Card) => {
  if (binderFilter.value === 'all') return
  const allocated = await binderStore.allocateCardToBinder(binderFilter.value, card.id, 1)
  if (allocated > 0) {
    toastStore.show(t('binders.cardAdded'), 'success')
  }
}

// ========== DECK MANAGEMENT ==========

// Crear deck
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
      viewMode.value = 'decks'
      deckFilter.value = deckId
    } else {
      deckFilter.value = deckId
      toastStore.show(t('common.import.deckCreated', { name: deckData.name }), 'success')
    }
  } catch (error) {
    console.error('Error in handleCreateDeck:', error)
    toastStore.show(t('decks.messages.createError'), 'error')
  } finally {
    modalRef?.setLoading(false)
  }
}

// Helper: Buscar carta en Scryfall
const fetchCardFromScryfall = async (cardName: string, setCode?: string): Promise<ExtractedScryfallData | null> => {
  try {
    const cleanName = cleanCardName(cardName)
    if (setCode) {
      const results = await searchCards(`"${cleanName}" e:${setCode}`)
      const card = results[0]
      if (card) {
        const extracted = extractScryfallCardData(card)
        if (extracted.price > 0 && extracted.image) {
          return extracted
        }
      }
    }
    const allResults = await searchCards(`!"${cleanName}"`)
    if (allResults.length > 0) {
      const printWithPrice = allResults.find(r =>
        r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
        (r.image_uris?.normal ?? r.card_faces?.[0]?.image_uris?.normal)
      ) ?? allResults.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0) ?? allResults[0]
      if (!printWithPrice) return null
      return extractScryfallCardData(printWithPrice)
    }
  } catch (e) {
    console.warn(`No se pudo obtener datos de Scryfall para: ${cardName}`)
  }
  return null
}

// Importar deck desde texto
const handleImport = async (opts: {
  deckText: string, condition: CardCondition, includeSideboard: boolean,
  deckName?: string, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus,
}) => {
  const { deckText, condition, includeSideboard, deckName, makePublic, format, commander, status } = opts
  const finalDeckName = deckName ?? `Deck${Date.now()}`
  showImportDeckModal.value = false
  toastStore.show(t('common.import.importing', { name: finalDeckName }), 'info')

  const lines = deckText.split('\n').filter(l => l.trim())
  const collectionCardsToAdd: ImportCardData[] = []
  let inSideboard = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.toLowerCase().includes('sideboard')) { inSideboard = true; continue }

    const parsed = parseTextImportLine(trimmed)
    if (!parsed) continue
    if (inSideboard && !includeSideboard) continue

    const scryfallData = await fetchCardFromScryfall(parsed.cardName, parsed.setCode ?? undefined)
    const cardData = buildCollectionCardFromScryfall({
      cardName: parsed.cardName, quantity: parsed.quantity, condition, isFoil: parsed.isFoil, setCode: parsed.setCode,
      scryfallData, status, makePublic: makePublic ?? false, isInSideboard: inSideboard,
    })
    collectionCardsToAdd.push(cardData)
  }

  const deckId = await decksStore.createDeck({
    name: finalDeckName,
    format: format ?? 'custom',
    description: '',
    colors: [],
    commander: commander ?? '',
  })

  if (collectionCardsToAdd.length > 0) {
    await collectionStore.confirmImport(collectionCardsToAdd)
    await collectionStore.loadCollection()

    if (deckId) {
      const bulkItems = collectionCardsToAdd
        .map(cardData => {
          const collectionCard = collectionStore.cards.find(
            c => c.scryfallId === cardData.scryfallId && c.edition === cardData.edition
          )
          return collectionCard ? { cardId: collectionCard.id, quantity: cardData.quantity, isInSideboard: cardData.isInSideboard ?? false } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await decksStore.bulkAllocateCardsToDeck(deckId, bulkItems)
    }
  }

  toastStore.show(t('common.import.deckComplete', { name: finalDeckName, count: collectionCardsToAdd.length }), 'success')
  if (deckId) {
    deckFilter.value = deckId
  }
}

// Importar desde Moxfield (OPTIMIZADO con batch API y progress tracking)
const handleImportDirect = async (
  cards: MoxfieldImportCard[],
  deckName: string | undefined,
  condition: CardCondition,
  makePublic?: boolean,
  format?: DeckFormat,
  commander?: string,
  status?: CardStatus
) => {
  // Prevent duplicate executions
  if (isImportRunning) {
    return
  }
  isImportRunning = true

  const finalDeckName = deckName ?? `Deck${Date.now()}`
  showImportDeckModal.value = false

  // Create progress toast
  const progressToast = toastStore.showProgress(t('common.import.importing', { name: finalDeckName }), 0)

  try {
    collectionStore.importing = true

    // PASO 1: Crear el deck primero
    progressToast.update(5, t('common.import.creatingDeck', { name: finalDeckName }))
    const deckId = await decksStore.createDeck({
      name: finalDeckName,
      format: format ?? 'custom',
      description: '',
      colors: [],
      commander: commander ?? '',
    })

    if (!deckId) {
      progressToast.error(t('common.import.errorCreatingDeck'))
      return
    }

    // Inicializar estado de importación
    const initialState: ImportState = {
      deckId,
      deckName: finalDeckName,
      status: 'fetching',
      totalCards: cards.length,
      currentCard: 0,
      cards: [],
      cardMeta: [],
      createdCardIds: [],
      allocatedCount: 0,
    }
    saveImportState(initialState)

    // Cambiar a modo mazos para ver el progreso
    viewMode.value = 'decks'
    deckFilter.value = deckId

    // Cancel price fetch to free the write stream for import
    cancelPriceFetch()

    // PASO 2: Build raw cards (no Scryfall fetch — enrichment happens in background after)
    progressToast.update(15, t('common.import.processing'))
    saveImportState({ ...initialState, status: 'processing' })

    const collectionCardsToAdd: ImportCardData[] = []
    const cardMeta: { quantity: number; isInSideboard: boolean }[] = []

    for (let i = 0; i < cards.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      const card = cards[i]
      if (!card) continue
      collectionCardsToAdd.push(buildRawMoxfieldCard(card, condition, status, makePublic ?? false))
      cardMeta.push({
        quantity: card.quantity,
        isInSideboard: card.isInSideboard ?? false
      })

      // Update progress (15-40% range for processing)
      if (i % 100 === 0) {
        const processPercent = 15 + Math.round((i / cards.length) * 25)
        progressToast.update(processPercent, t('common.import.processingProgress', { current: i + 1, total: cards.length }))
      }
    }

    // PASO 3: Importar cartas a la colección
    progressToast.update(45, t('common.import.saving', { count: collectionCardsToAdd.length }))
    saveImportState({
      deckId,
      deckName: finalDeckName,
      status: 'saving',
      totalCards: cards.length,
      currentCard: 0,
      cards: [],
      cardMeta,
      createdCardIds: [],
      allocatedCount: 0,
    })

    let allocatedCount = 0
    if (collectionCardsToAdd.length > 0) {
      const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true, (current, total) => {
        const pct = 45 + Math.round((current / total) * 25)
        progressToast.update(pct, t('common.import.savingProgress', { current, total }))
      })
      collectionCardsToAdd.length = 0

      // PASO 4: Allocate cards to deck (getCardById works — push in-place in confirmImport)
      progressToast.update(75, t('common.import.allocatingToDeck'))
      const bulkItems = createdCardIds
        .map((cardId, i) => {
          // eslint-disable-next-line security/detect-object-injection
          const meta = cardMeta[i]
          return cardId && meta ? { cardId, quantity: meta.quantity, isInSideboard: meta.isInSideboard } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      progressToast.update(80, t('common.import.allocatingToDeckCount', { count: bulkItems.length }))
      const bulkResult = await decksStore.bulkAllocateCardsToDeck(deckId, bulkItems)
      allocatedCount = bulkResult.allocated
    }

    await decksStore.loadDecks()

    saveImportState({
      deckId,
      deckName: finalDeckName,
      status: 'complete',
      totalCards: cards.length,
      currentCard: cards.length,
      cards: [],
      cardMeta: [],
      createdCardIds: [],
      allocatedCount,
    })

    setTimeout(() => {
      clearImportState()
      isImportRunning = false
    }, 2000)

    progressToast.complete(t('common.import.deckComplete', { name: finalDeckName, count: allocatedCount }))

    // Trigger reactive cascade (same pattern as page reload: ~160-220ms)
    collectionStore.refreshCards()
    collectionStore.importing = false

    // Background enrichment
    collectionStore.enrichCardsWithMissingMetadata().catch((err: unknown) => {
      console.warn('[Import] Background enrichment failed:', err)
    })
  } catch (error) {
    console.error('[Import] Error during import:', error)
    collectionStore.importing = false
    if (importProgress.value) {
      saveImportState({ ...importProgress.value, status: 'error' })
    }
    progressToast.error(t('common.import.errorDeck'))
    isImportRunning = false
  }
}

// Importar desde CSV de ManaBox (batch Scryfall lookup)
const handleImportCsv = async (
  cards: ParsedCsvCard[],
  deckName?: string,
  makePublic?: boolean,
  format?: DeckFormat,
  commander?: string,
  status?: CardStatus
) => {
  const finalDeckName = deckName ?? `CSV Import ${Date.now()}`
  showImportDeckModal.value = false
  collectionStore.importing = true

  // Progress toast like handleImport
  const progressToast = toastStore.showProgress(t('common.import.importing', { name: finalDeckName }), 0)

  try {
    // PASO 1: Crear deck
    progressToast.update(5, t('common.import.creatingDeck', { name: finalDeckName }))
    const deckId = await decksStore.createDeck({
      name: finalDeckName,
      format: format ?? 'custom',
      description: '',
      colors: [],
      commander: commander ?? '',
    })

    if (!deckId) {
      progressToast.error(t('common.import.errorCreatingDeck'))
      return
    }

    viewMode.value = 'decks'
    deckFilter.value = deckId

    // Cancel price fetch to free the write stream for import
    cancelPriceFetch()

    // PASO 2: Build raw cards (no Scryfall fetch — enrichment happens in background after)
    progressToast.update(15, t('common.import.processing'))
    const collectionCardsToAdd: ImportCardData[] = []
    const cardMeta: { quantity: number; isInSideboard: boolean }[] = []

    for (let i = 0; i < cards.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      const card = cards[i]
      if (!card) continue
      collectionCardsToAdd.push(buildRawCsvCard(card, status, makePublic ?? false))
      cardMeta.push({ quantity: card.quantity, isInSideboard: false })

      if (i % 100 === 0) {
        const pct = 15 + Math.round((i / cards.length) * 25)
        progressToast.update(pct, t('common.import.processingProgress', { current: i + 1, total: cards.length }))
      }
    }

    // PASO 3: Guardar en colección
    progressToast.update(45, t('common.import.saving', { count: collectionCardsToAdd.length }))
    let allocatedCount = 0

    if (collectionCardsToAdd.length > 0) {
      const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true, (current, total) => {
        const pct = 45 + Math.round((current / total) * 25)
        progressToast.update(pct, t('common.import.savingProgress', { current, total }))
      })
      // Release memory
      collectionCardsToAdd.length = 0

      progressToast.update(75, t('common.import.allocatingToDeck'))

      // PASO 4: Asignar al deck (bulk — single Firestore write)
      const bulkItems = createdCardIds
        .map((cardId, i) => {
          // eslint-disable-next-line security/detect-object-injection
          const meta = cardMeta[i]
          return cardId && meta ? { cardId, quantity: meta.quantity, isInSideboard: meta.isInSideboard } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      const bulkResult = await decksStore.bulkAllocateCardsToDeck(deckId, bulkItems, (current, total) => {
        const pct = 75 + Math.round((current / total) * 20)
        progressToast.update(pct, t('common.import.allocatingProgress', { current, total }))
      })
      allocatedCount = bulkResult.allocated
    }

    // PASO 5: Completar
    await decksStore.loadDecks()
    progressToast.complete(t('common.import.deckComplete', { name: finalDeckName, count: allocatedCount }))

    // PASO 6: Background enrichment — fetch Scryfall metadata (images, types, prices)
    // Flush reactive state AFTER UI shows "complete" — triggers one computed cascade
    collectionStore.refreshCards()
    collectionStore.importing = false

    collectionStore.enrichCardsWithMissingMetadata().catch((err: unknown) => {
      console.warn('[CSV Import] Background enrichment failed:', err)
    })
  } catch (error) {
    console.error('[CSV Import] Error:', error)
    collectionStore.importing = false
    progressToast.error(t('common.import.errorCsv'))
  }
}

// ========== BINDER IMPORT HANDLERS ==========

// Import binder from text list
const handleImportBinder = async (opts: {
  deckText: string, condition: CardCondition, includeSideboard: boolean,
  deckName?: string, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus,
}) => {
  const { deckText, condition, includeSideboard, deckName, makePublic, status } = opts
  const finalName = deckName ?? `Binder${Date.now()}`
  showImportBinderModal.value = false
  toastStore.show(t('common.import.importing', { name: finalName }), 'info')

  const lines = deckText.split('\n').filter(l => l.trim())
  const collectionCardsToAdd: ImportCardData[] = []
  let inSideboard = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.toLowerCase().includes('sideboard')) { inSideboard = true; continue }

    const parsed = parseTextImportLine(trimmed)
    if (!parsed) continue
    if (inSideboard && !includeSideboard) continue

    const scryfallData = await fetchCardFromScryfall(parsed.cardName, parsed.setCode ?? undefined)
    const cardData = buildCollectionCardFromScryfall({
      cardName: parsed.cardName, quantity: parsed.quantity, condition, isFoil: parsed.isFoil, setCode: parsed.setCode,
      scryfallData, status, makePublic: makePublic ?? false, isInSideboard: false,
    })
    collectionCardsToAdd.push(cardData)
  }

  const binderId = await binderStore.createBinder({ name: finalName, description: '' })

  if (collectionCardsToAdd.length > 0) {
    await collectionStore.confirmImport(collectionCardsToAdd)
    await collectionStore.loadCollection()

    if (binderId) {
      const bulkItems = collectionCardsToAdd
        .map(cardData => {
          const collectionCard = collectionStore.cards.find(
            c => c.scryfallId === cardData.scryfallId && c.edition === cardData.edition
          )
          return collectionCard ? { cardId: collectionCard.id, quantity: cardData.quantity } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await binderStore.bulkAllocateCardsToBinder(binderId, bulkItems)
    }
  }

  toastStore.show(t('common.import.binderComplete', { name: finalName, count: collectionCardsToAdd.length }), 'success')
  if (binderId) {
    viewMode.value = 'binders'
    binderFilter.value = binderId
  }
}

// Import binder from Moxfield (batch API)
const handleImportBinderDirect = async (
  cards: MoxfieldImportCard[],
  deckName: string | undefined,
  condition: CardCondition,
  makePublic?: boolean,
  _format?: DeckFormat,
  _commander?: string,
  status?: CardStatus
) => {
  const finalName = deckName ?? `Binder${Date.now()}`
  showImportBinderModal.value = false
  collectionStore.importing = true

  const progressToast = toastStore.showProgress(t('common.import.importing', { name: finalName }), 0)

  try {
    viewMode.value = 'binders'

    // Cancel price fetch to free the write stream for import
    cancelPriceFetch()

    // Build raw cards (no Scryfall fetch — enrichment happens in background after)
    progressToast.update(15, t('common.import.processing'))
    const collectionCardsToAdd: ImportCardData[] = []

    for (let i = 0; i < cards.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      const card = cards[i]
      if (!card) continue
      collectionCardsToAdd.push(buildRawMoxfieldCard(card, condition, status, makePublic ?? false))

      if (i % 100 === 0) {
        const processPercent = 15 + Math.round((i / cards.length) * 25)
        progressToast.update(processPercent, t('common.import.processingProgress', { current: i + 1, total: cards.length }))
      }
    }

    // Import cards to collection
    progressToast.update(45, t('common.import.saving', { count: collectionCardsToAdd.length }))
    let allocatedCount = 0

    if (collectionCardsToAdd.length > 0) {
      const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true, (current, total) => {
        const pct = 45 + Math.round((current / total) * 25)
        progressToast.update(pct, t('common.import.savingProgress', { current, total }))
      })
      progressToast.update(75, t('common.import.allocatingToBinder'))

      const bulkItems = createdCardIds
        .map((cardId, i) => {
          // eslint-disable-next-line security/detect-object-injection
          const meta = collectionCardsToAdd[i]
          return cardId && meta ? { cardId, quantity: meta.quantity } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      // Split into multiple binders if >35k to stay under Firestore 1MB doc limit (compact JSON string format)
      const MAX_PER_BINDER = 35000
      if (bulkItems.length > MAX_PER_BINDER) {
        const totalBinders = Math.ceil(bulkItems.length / MAX_PER_BINDER)
        for (let b = 0; b < totalBinders; b++) {
          const binderName = `${finalName} ${b + 1}/${totalBinders}`
          const chunk = bulkItems.slice(b * MAX_PER_BINDER, (b + 1) * MAX_PER_BINDER)
          const chunkBinderId = await binderStore.createBinder({ name: binderName, description: '' })
          if (chunkBinderId) {
            allocatedCount += await binderStore.bulkAllocateCardsToBinder(chunkBinderId, chunk)
          }
          progressToast.update(75 + Math.round(((b + 1) / totalBinders) * 20), t('common.import.allocatingToBinderCount', { count: allocatedCount }))
        }
      } else {
        const binderId = await binderStore.createBinder({ name: finalName, description: '' })
        if (binderId) {
          allocatedCount = await binderStore.bulkAllocateCardsToBinder(binderId, bulkItems)
        }
      }
      collectionCardsToAdd.length = 0
    }

    await binderStore.loadBinders()
    progressToast.complete(t('common.import.binderComplete', { name: finalName, count: allocatedCount }))

    collectionStore.refreshCards()
    collectionStore.importing = false

    collectionStore.enrichCardsWithMissingMetadata().catch((err: unknown) => {
      console.warn('[Binder Import] Background enrichment failed:', err)
    })
  } catch (error) {
    console.error('[Binder Import] Error:', error)
    collectionStore.importing = false
    progressToast.error(t('common.import.errorBinder'))
  }
}

// Import binder from CSV
const handleImportBinderCsv = async (
  cards: ParsedCsvCard[],
  deckName?: string,
  makePublic?: boolean,
  _format?: DeckFormat,
  _commander?: string,
  status?: CardStatus
) => {
  const finalName = deckName ?? `Binder CSV ${Date.now()}`
  showImportBinderModal.value = false
  collectionStore.importing = true

  const progressToast = toastStore.showProgress(t('common.import.importing', { name: finalName }), 0)

  try {
    viewMode.value = 'binders'

    // Cancel price fetch to free the write stream for import
    cancelPriceFetch()

    // Build raw cards (no Scryfall fetch — enrichment happens in background after)
    progressToast.update(15, t('common.import.processing'))
    const collectionCardsToAdd: ImportCardData[] = []

    for (let i = 0; i < cards.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      const card = cards[i]
      if (!card) continue
      collectionCardsToAdd.push(buildRawCsvCard(card, status, makePublic ?? false))

      if (i % 100 === 0) {
        const pct = 15 + Math.round((i / cards.length) * 25)
        progressToast.update(pct, t('common.import.processingProgress', { current: i + 1, total: cards.length }))
      }
    }

    // Save to collection
    progressToast.update(45, t('common.import.saving', { count: collectionCardsToAdd.length }))
    let allocatedCount = 0

    if (collectionCardsToAdd.length > 0) {
      const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true, (current, total) => {
        const pct = 45 + Math.round((current / total) * 25)
        progressToast.update(pct, t('common.import.savingProgress', { current, total }))
      })
      progressToast.update(75, t('common.import.allocatingToBinder'))

      const bulkItems = createdCardIds
        .map((cardId, i) => {
          // eslint-disable-next-line security/detect-object-injection
          const meta = collectionCardsToAdd[i]
          return cardId && meta ? { cardId, quantity: meta.quantity } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      // Split into multiple binders if >35k to stay under Firestore 1MB doc limit (compact JSON string format)
      const MAX_PER_BINDER = 35000
      if (bulkItems.length > MAX_PER_BINDER) {
        const totalBinders = Math.ceil(bulkItems.length / MAX_PER_BINDER)
        for (let b = 0; b < totalBinders; b++) {
          const binderName = `${finalName} ${b + 1}/${totalBinders}`
          const chunk = bulkItems.slice(b * MAX_PER_BINDER, (b + 1) * MAX_PER_BINDER)
          const chunkBinderId = await binderStore.createBinder({ name: binderName, description: '' })
          if (chunkBinderId) {
            allocatedCount += await binderStore.bulkAllocateCardsToBinder(chunkBinderId, chunk)
          }
          progressToast.update(75 + Math.round(((b + 1) / totalBinders) * 20), t('common.import.allocatingToBinderCount', { count: allocatedCount }))
        }
      } else {
        const binderId = await binderStore.createBinder({ name: finalName, description: '' })
        if (binderId) {
          allocatedCount = await binderStore.bulkAllocateCardsToBinder(binderId, bulkItems)
        }
      }
      collectionCardsToAdd.length = 0
    }

    await binderStore.loadBinders()
    progressToast.complete(t('common.import.binderComplete', { name: finalName, count: allocatedCount }))

    collectionStore.refreshCards()
    collectionStore.importing = false

    collectionStore.enrichCardsWithMissingMetadata().catch((err: unknown) => {
      console.warn('[Binder CSV Import] Background enrichment failed:', err)
    })
  } catch (error) {
    console.error('[Binder CSV Import] Error:', error)
    collectionStore.importing = false
    progressToast.error(t('common.import.errorCsv'))
  }
}

// Execute delete deck with progress tracking (can resume)
const executeDeleteDeck = async (state: DeleteDeckState, isResume = false) => {
  // Prevent duplicate executions (only check if not a resume with existing toast)
  if (!isResume && isDeleteRunning) {
    return
  }
  isDeleteRunning = true

  isDeletingDeck.value = true
  deleteProgress.value = 0

  const cardIds = state.cardIds

  // Deselect deck BEFORE deleting cards to avoid reactive cascade
  // (each card splice would re-trigger deckOwnedCards computed otherwise)
  deckFilter.value = 'all'

  try {
    // Step 1: Delete cards (if pending)
    if (state.status === 'deleting_cards') {
      await executeCardDeletionStep(state, isResume, (percent) => {
        deleteProgress.value = percent
      })
      // Advance to deleting_deck (also handles resume with empty cardIds)
      state.status = 'deleting_deck'
      saveDeleteDeckState(state)
    }

    // Step 2: Delete the deck document
    if (state.status === 'deleting_deck') {
      deleteProgress.value = 90
      const deckDeleted = await decksStore.deleteDeck(state.deckId, true)
      if (!deckDeleted) {
        throw new Error('Failed to delete deck document')
      }
    }

    if (!state.deleteCards || cardIds.length === 0) {
      toastStore.show(t('decks.messages.deletedCardsKept'), 'success')
    }

    state.status = 'complete'
    deleteProgress.value = 100
    clearDeleteDeckState()

    isDeleteRunning = false
    isDeletingDeck.value = false
    deleteProgress.value = 0
  } catch (err) {
    console.error('[DeleteDeck] Error:', err)
    state.status = 'error'
    saveDeleteDeckState(state)
    toastStore.show(t('decks.messages.deleteError'), 'error')
    isDeleteRunning = false
    isDeletingDeck.value = false
    deleteProgress.value = 0
  }
}

// Resume incomplete delete deck operation
const resumeDeleteDeck = async (savedState: DeleteDeckState) => {
  // Prevent duplicate executions
  if (isDeleteRunning) {
    return
  }

  if (savedState.status === 'complete') {
    clearDeleteDeckState()
    return
  }

  // Ensure cardIds array exists (backwards compat with old state format)
  if (!savedState.cardIds) {
    savedState.cardIds = []
  }

  // On resume after error: retry from the step that failed
  if (savedState.status === 'error') {
    // If we still have cardIds and deleteCards was requested, retry from cards
    savedState.status = savedState.deleteCards && savedState.cardIds.length > 0
      ? 'deleting_cards'
      : 'deleting_deck'
  }

  await executeDeleteDeck(savedState, true)
}

// Eliminar deck
const handleDeleteDeck = async () => {
  if (!selectedDeck.value || isDeletingDeck.value) return

  // Guardar referencias ANTES de cualquier operación (el computed puede cambiar)
  const deckId = selectedDeck.value.id
  const deckName = selectedDeck.value.name
  const cardIds = selectedDeck.value.allocations?.length > 0
    ? [...new Set(selectedDeck.value.allocations.map(a => a.cardId))]
    : []

  // Primera confirmación: eliminar el deck
  const confirmDelete = await confirmStore.show({
    title: `Eliminar deck`,
    message: `¿Eliminar el deck "${deckName}"?`,
    confirmText: 'ELIMINAR',
    cancelText: 'CANCELAR',
    confirmVariant: 'danger'
  })

  if (!confirmDelete) return

  // Segunda confirmación: eliminar también las cartas de la colección
  let deleteCards = false
  if (cardIds.length > 0) {
    deleteCards = await confirmStore.show({
      title: '¿Eliminar cartas también?',
      message: 'SÍ = Eliminar deck y cartas de la colección\nNO = Solo eliminar deck (cartas permanecen)',
      confirmText: 'SÍ, ELIMINAR CARTAS',
      cancelText: 'NO, CONSERVAR',
      confirmVariant: 'danger'
    })
  }

  const state: DeleteDeckState = {
    deckId,
    deckName,
    status: deleteCards && cardIds.length > 0 ? 'deleting_cards' : 'deleting_deck',
    deleteCards,
    cardCount: deleteCards ? cardIds.length : 0,
    cardIds: deleteCards ? cardIds : [],
  }
  saveDeleteDeckState(state)

  await executeDeleteDeck(state)
}

// Toggle visibilidad de todas las cartas del deck
const handleToggleDeckPublic = async () => {
  if (!selectedDeck.value) return

  const cardIds = deckOwnedCards.value.map(c => c.id)
  if (cardIds.length === 0) {
    toastStore.show(t('decks.messages.noCardsInDeck'), 'info')
    return
  }

  const makePublic = !isDeckPublic.value

  try {
    // Use batch update for efficiency (single Firestore call instead of N calls)
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

const handleExportDeck = async () => {
  if (!selectedDeck.value) return

  // Build cardId → setCode map for fast lookup
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

// ========== BINDER EXPORT ==========

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

// ========== RESUME IMPORT ==========

const resumeImport = async (savedState: ImportState) => {
  // Prevent duplicate executions
  if (isImportRunning) {
    return
  }

  // Restaurar el estado en memoria
  importProgress.value = savedState

  // Si ya estaba completo, solo limpiar
  if (savedState.status === 'complete') {
    setTimeout(() => { clearImportState(); }, 2000)
    return
  }

  // Si hubo error, preguntar si quiere reintentar
  if (savedState.status === 'error') {
    toastStore.show(t('common.import.resumeFailed', { name: savedState.deckName }), 'error')
    clearImportState()
    return
  }

  // Mark as running
  isImportRunning = true

  // Cambiar a modo mazos y seleccionar el deck
  viewMode.value = 'decks'
  deckFilter.value = savedState.deckId

  // Calculate initial progress for resume based on status
  let initialProgress = 0
  if (savedState.status === 'allocating' && savedState.createdCardIds.length > 0) {
    initialProgress = 60 + Math.round((savedState.currentCard / savedState.createdCardIds.length) * 35)
  } else if (savedState.status === 'saving') {
    initialProgress = 50
  } else if (savedState.status === 'processing') {
    initialProgress = 25 + Math.round((savedState.currentCard / savedState.totalCards) * 20)
  }

  const progressToast = toastStore.showProgress(
    t('common.import.resuming', { name: savedState.deckName }),
    initialProgress
  )

  try {
    // Si estaba en 'allocating', continuar desde donde quedó
    if (savedState.status === 'allocating' && savedState.createdCardIds.length > 0) {
      const startIndex = savedState.currentCard
      const remaining = savedState.createdCardIds.slice(startIndex)

      const bulkItems = remaining
        .map((cardId, i) => {
          const meta = savedState.cardMeta[startIndex + i]
          return cardId && meta ? { cardId, quantity: meta.quantity, isInSideboard: meta.isInSideboard } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      progressToast.update(65, t('common.import.allocatingToDeckCount', { count: bulkItems.length }))
      const bulkResult = await decksStore.bulkAllocateCardsToDeck(savedState.deckId, bulkItems)
      const allocatedCount = savedState.allocatedCount + bulkResult.allocated

      // Completar
      await decksStore.loadDecks()
      saveImportState({ ...savedState, status: 'complete', currentCard: savedState.totalCards, allocatedCount })
      setTimeout(() => {
        clearImportState()
        isImportRunning = false
      }, 2000)
      progressToast.complete(t('common.import.resumeComplete', { name: savedState.deckName, count: allocatedCount }))

    } else if (savedState.status === 'saving' && savedState.cards.length > 0) {
      // Si estaba guardando cartas, reiniciar desde guardado
      progressToast.update(55, t('common.import.saving', { count: savedState.cards.length }))

      const createdCardIds = await collectionStore.confirmImport(savedState.cards, true, (current, total) => {
        const pct = 55 + Math.round((current / total) * 5)
        progressToast.update(pct, t('common.import.savingProgress', { current, total }))
      })
      progressToast.update(60, t('common.import.allocatingToDeck'))

      saveImportState({
        ...savedState,
        status: 'allocating',
        totalCards: createdCardIds.length,
        currentCard: 0,
        createdCardIds,
      })

      // Continuar con allocations (bulk — single Firestore write)
      const bulkItems = createdCardIds
        .map((cardId, i) => {
          // eslint-disable-next-line security/detect-object-injection
          const meta = savedState.cardMeta[i]
          return cardId && meta ? { cardId, quantity: meta.quantity, isInSideboard: meta.isInSideboard } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      progressToast.update(65, t('common.import.allocatingToDeckCount', { count: bulkItems.length }))
      const bulkResult = await decksStore.bulkAllocateCardsToDeck(savedState.deckId, bulkItems)
      const allocatedCount = bulkResult.allocated

      await decksStore.loadDecks()
      saveImportState({ ...savedState, status: 'complete', currentCard: savedState.totalCards, allocatedCount })
      setTimeout(() => {
        clearImportState()
        isImportRunning = false
      }, 2000)
      progressToast.complete(t('common.import.resumeComplete', { name: savedState.deckName, count: allocatedCount }))

    } else {
      // Para otros estados (fetching, processing), limpiar y avisar
      progressToast.error(t('common.import.resumeIncomplete'))
      clearImportState()
      isImportRunning = false
    }
  } catch (error) {
    console.error('[Import] Error resuming import:', error)
    saveImportState({ ...savedState, status: 'error' })
    progressToast.error(t('common.import.resumeError'))
    isImportRunning = false
  }
}

// ========== LIFECYCLE ==========

onMounted(async () => {
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      decksStore.loadDecks(),
      binderStore.loadBinders()
    ])

    // Trigger initial server-side paginated query (fire-and-forget, no await)
    collectionStore.queryPage(buildPaginationFilters(), buildPaginationSort())

    // Check for view mode query param (from search redirect)
    const fromParam = route.query.from as string
    if (fromParam === 'decks') {
      viewMode.value = 'decks'
    } else if (fromParam === 'binders') {
      viewMode.value = 'binders'
    }

    // Check for deck query param (from redirected deck routes)
    const deckParam = route.query.deck as string
    if (deckParam && decksStore.decks.some(d => d.id === deckParam)) {
      viewMode.value = 'decks'
      deckFilter.value = deckParam
    }

    // Check for binder query param (from search redirect)
    const binderParam = route.query.binder as string
    if (binderParam && binderStore.binders.some(b => b.id === binderParam)) {
      viewMode.value = 'binders'
      binderFilter.value = binderParam
    }

    // Check for incomplete imports
    const savedImport = loadImportState()
    if (savedImport && savedImport.status !== 'complete') {
      await resumeImport(savedImport)
    } else if (savedImport?.status === 'complete') {
      // Clean up completed import
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
      // Clean up completed delete
      clearDeleteDeckState()
    }
  } catch (err) {
    toastStore.show(t('common.messages.loadError'), 'error')
  }
})

// Watch for route changes to handle deck selection via URL
watch(() => route.query.deck, (newDeckId) => {
  if (newDeckId && typeof newDeckId === 'string') {
    if (decksStore.decks.some(d => d.id === newDeckId)) {
      deckFilter.value = newDeckId
    }
  }
})

// Ref for wishlist section to scroll to
const wishlistSectionRef = ref<HTMLElement | null>(null)

// Watch for filter query parameter (from navigation links)
watch(() => route.query.filter, (newFilter, oldFilter) => {
  if (newFilter === 'wishlist') {
    // Wishlist: select wishlist filter and scroll to wishlist section
    statusFilter.value = 'wishlist'
    viewMode.value = 'collection'
    setTimeout(() => {
      wishlistSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  } else if (oldFilter === 'wishlist' && !newFilter) {
    // Coming from wishlist to collection: reset to all and scroll to top
    statusFilter.value = 'all'
    viewMode.value = 'collection'
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

// Watch for action=add query param (from mobile header "+") — open AddCardModal
watch(() => route.query.action, (action) => {
  if (action === 'add') {
    showAddCardModal.value = true
    void router.replace({ path: '/collection', query: { ...route.query, action: undefined } })
  }
}, { immediate: true })

// Warn before leaving if import or delete is in progress
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  const importInProgress = importProgress.value && importProgress.value.status !== 'complete' && importProgress.value.status !== 'error'
  const deleteInProgress = deleteDeckProgress.value && deleteDeckProgress.value.status !== 'complete' && deleteDeckProgress.value.status !== 'error'

  if (importInProgress || deleteInProgress) {
    e.preventDefault()
    // Note: returnValue is deprecated but required for cross-browser compatibility
    // Modern browsers only show generic message anyway
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
  // Don't trigger if typing in input fields
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  // "n" opens add card modal
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    showAddCardModal.value = true
  }

  // "Escape" closes modals
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
        <p class="text-small text-silver-70">
          {{ t('collection.subtitle', { owned: ownedCount }) }}
          <span v-if="wishlistTotalCount > 0" class="text-yellow-400">• {{ t('collection.wishlistCount', { count: wishlistTotalCount }) }}</span>
        </p>
      </div>
      <div class="flex gap-2" data-tour="add-card-btn">
        <BaseButton size="small" variant="secondary" @click="viewMode === 'binders' ? showImportBinderModal = true : showImportDeckModal = true">
          {{ t('collection.actions.import') }}
        </BaseButton>
        <BaseButton v-if="viewMode === 'binders'" size="small" @click="showCreateBinderModal = true">
          {{ t('collection.actions.newBinder') }}
        </BaseButton>
        <BaseButton v-else size="small" @click="showCreateDeckModal = true">
          {{ t('collection.actions.newDeck') }}
        </BaseButton>
        <BaseButton size="small" variant="secondary" @click="selectedScryfallCard = undefined; showAddCardModal = true">
          <SvgIcon name="plus" size="tiny" class="inline-block mr-1" />
          {{ t('collection.actions.addCard') }}
        </BaseButton>
      </div>
    </div>

    <!-- ========== CONTENIDO PRINCIPAL ========== -->
    <div :class="['mt-6', viewMode === 'collection' || (viewMode === 'decks' && selectedDeck) || (viewMode === 'binders' && selectedBinder) ? 'pb-20' : '']">
      <div>
        <!-- ========== MAIN TABS: COLECCIÓN / MAZOS ========== -->
        <div class="mb-6">
          <div class="flex gap-1 mb-4">
            <button
                @click="switchToCollection"
                :class="[
                  'flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center',
                  viewMode === 'collection'
                    ? 'bg-neon text-primary'
                    : 'border border-silver-10 text-silver-70 hover:text-silver hover:border-silver-30'
                ]"
            >
              {{ t('collection.tabs.collection') }}
            </button>
            <button
                data-tour="deck-tab"
                @click="switchToDecks()"
                :class="[
                  'flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center',
                  viewMode === 'decks'
                    ? 'bg-neon text-primary'
                    : 'border border-silver-10 text-silver-70 hover:text-silver hover:border-silver-30'
                ]"
            >
              {{ t('collection.tabs.decks') }}
              <span class="ml-1 opacity-70">({{ decksList.length }})</span>
            </button>
            <button
                @click="switchToBinders()"
                :class="[
                  'flex-1 min-w-0 px-2 md:px-6 py-2 md:py-3 text-small md:text-body font-bold transition-150 rounded text-center',
                  viewMode === 'binders'
                    ? 'bg-neon text-primary'
                    : 'border border-silver-10 text-silver-70 hover:text-silver hover:border-silver-30'
                ]"
            >
              {{ t('collection.tabs.binders') }}
              <span class="ml-1 opacity-70">({{ bindersList.length }})</span>
            </button>
          </div>

          <!-- ========== DECK SUB-TABS (solo en modo mazos) ========== -->
          <div v-if="viewMode === 'decks'" class="flex gap-2 overflow-x-auto pb-2 pl-4 border-l-4 border-neon min-w-0 max-w-full">
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
              <!-- Progress bar background -->
              <div
                  v-if="isDeckImporting(deck.id)"
                  class="absolute inset-0 bg-neon/30 transition-all duration-300"
                  :style="{ width: `${getImportProgress(deck.id) }%` }"
              ></div>
              <!-- Content -->
              <span class="relative z-10">
                {{ deck.name }}
                <span v-if="isDeckImporting(deck.id)" class="ml-1 text-neon font-bold">
                  {{ importProgress?.currentCard ?? 0 }}/{{ importProgress?.totalCards ?? 0 }}
                </span>
                <span v-else class="ml-1 opacity-70">{{ deck.stats?.ownedCards ?? 0 }}</span>
              </span>
            </button>
            <!-- Botón nuevo deck -->
            <BaseButton size="small" variant="filled" @click="showCreateDeckModal = true">
              {{ t('collection.actions.new') }}
            </BaseButton>
          </div>

          <!-- Mensaje si no hay mazos -->
          <div v-if="viewMode === 'decks' && decksList.length === 0" class="pl-4 border-l-4 border-neon py-4">
            <p class="text-silver-50 text-small">{{ t('collection.noDecks') }}</p>
            <div class="flex gap-2 mt-3">
              <BaseButton size="small" @click="showCreateDeckModal = true">{{ t('collection.actions.createDeck') }}</BaseButton>
              <BaseButton size="small" variant="secondary" @click="showImportDeckModal = true">{{ t('collection.actions.import') }}</BaseButton>
            </div>
          </div>

          <!-- ========== BINDER SUB-TABS (solo en modo binders) ========== -->
          <div v-if="viewMode === 'binders'" class="flex gap-2 overflow-x-auto pb-2 pl-4 border-l-4 border-neon min-w-0 max-w-full">
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
            <!-- Botón nueva carpeta -->
            <BaseButton size="small" variant="filled" @click="showCreateBinderModal = true">
              {{ t('collection.actions.new') }}
            </BaseButton>
          </div>

          <!-- Mensaje si no hay binders -->
          <div v-if="viewMode === 'binders' && bindersList.length === 0" class="pl-4 border-l-4 border-neon py-4">
            <p class="text-silver-50 text-small">{{ t('binders.noBinders') }}</p>
            <div class="flex gap-2 mt-3">
              <BaseButton size="small" @click="showCreateBinderModal = true">{{ t('binders.create.submit') }}</BaseButton>
              <BaseButton size="small" variant="secondary" @click="showImportBinderModal = true">{{ t('collection.actions.import') }}</BaseButton>
            </div>
          </div>
        </div>

        <!-- ========== DECK HEADER (cuando hay deck seleccionado en modo mazos) ========== -->
        <div v-if="viewMode === 'decks' && selectedDeck" class="bg-neon/10 border-2 border-neon p-3 md:p-4 mb-6">
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
              <BaseButton size="small" variant="secondary" @click="handleDeleteDeck" :disabled="isDeletingDeck">
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
          <!-- Delete progress bar -->
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

        <!-- ========== BINDER HEADER (cuando hay binder seleccionado) ========== -->
        <div v-if="viewMode === 'binders' && selectedBinder" class="bg-neon/10 border-2 border-neon p-3 md:p-4 mb-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 class="text-body md:text-h3 font-bold text-silver">{{ selectedBinder.name }}</h2>
              <p v-if="selectedBinder.description" class="text-tiny text-silver-50">{{ selectedBinder.description }}</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Public toggle -->
              <button
                  @click="toggleBinderPublic"
                  class="flex items-center gap-1 px-2 py-1 text-tiny border transition-150"
                  :class="selectedBinder.isPublic ? 'border-neon text-neon bg-neon/10' : 'border-silver-30 text-silver-50'"
              >
                <span>{{ selectedBinder.isPublic ? '&#x1F441;' : '&#x1F512;' }}</span>
                {{ t('binders.header.public') }}
              </button>
              <!-- For Sale toggle -->
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
              <span class="text-tiny text-silver-50">${{ (selectedBinder.stats?.totalPrice ?? 0).toFixed(2) }}</span>
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

        <!-- ========== STATUS FILTERS (solo en modo colección) ========== -->
        <div v-if="viewMode === 'collection'" data-tour="status-filters" class="flex flex-wrap items-center gap-2 mb-4 pb-2">
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
            v-model:group-by="deckGroupBy"
            :view-mode="viewMode"
            :show-bulk-select="viewMode === 'collection'"
            :selection-mode="selectionMode"
            :show-view-type="viewMode === 'collection'"
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
        <div v-if="selectionMode && viewMode === 'collection'" class="bg-silver-5 border border-silver-10 p-3 mb-4 rounded space-y-3 relative">
          <!-- Loading overlay -->
          <div v-if="bulkActionLoading" class="absolute inset-0 bg-primary/70 rounded flex flex-col items-center justify-center z-10 gap-2">
            <span class="text-small font-bold text-neon animate-pulse">
              {{ bulkActionProgress > 0 ? `${bulkActionProgress}%` : t('collection.bulkEdit.processing') }}
            </span>
            <div v-if="bulkActionProgress > 0" class="w-3/4 h-1 bg-silver-10 rounded overflow-hidden">
              <div class="h-full bg-neon transition-all duration-300" :style="{ width: `${bulkActionProgress}%` }"></div>
            </div>
          </div>

          <!-- Row 1: Selection info -->
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

          <!-- Row 2: Status change -->
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

          <!-- Row 3: Visibility -->
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

          <!-- Row 4: Allocate to deck/binder -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-tiny font-bold text-silver-50 uppercase w-14">{{ t('collection.bulkEdit.addLabel') }}</span>

            <!-- Deck picker -->
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

            <!-- Binder picker -->
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

          <!-- Row 5: Delete -->
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

        <!-- Loading skeleton -->
        <div v-if="viewMode === 'collection' && collectionStore.loading && collectionStore.cards.length === 0">
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <SkeletonCard v-for="n in 10" :key="n" />
          </div>
        </div>

        <!-- ========== CARDS GRID: MODO COLECCIÓN ========== -->
        <div v-if="viewMode === 'collection' && (collectionDisplayCards.length > 0 || collectionStore.paginationMeta.loading) && statusFilter !== 'wishlist'">
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

          <!-- ========== GRID VIEW ========== -->
          <!-- Grouped view -->
            <div v-for="group in groupedFilteredCards" :key="group.type" class="mb-6">
              <!-- Category Header (hidden when no grouping) -->
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

        <!-- ========== DECK VIEW: MAZO PRINCIPAL (Visual Grid) ========== -->
        <div v-if="viewMode === 'decks' && selectedDeck && filteredMainboardDisplayCards.length > 0" class="mb-6">
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
          />
        </div>

        <!-- ========== SEPARADOR SIDEBOARD ========== -->
        <div v-if="viewMode === 'decks' && selectedDeck && !isCommanderFormat && filteredSideboardDisplayCards.length > 0" class="my-8">
          <div class="border-t-2 border-dashed border-blue-400/50"></div>
        </div>

        <!-- ========== DECK VIEW: SIDEBOARD (Visual Grid) - solo no-commander ========== -->
        <div v-if="viewMode === 'decks' && selectedDeck && !isCommanderFormat && filteredSideboardDisplayCards.length > 0" class="mb-6">
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
          />
        </div>

        <!-- ========== WISHLIST GENERAL (solo en modo colección) ========== -->
        <div ref="wishlistSectionRef" v-if="viewMode === 'collection' && wishlistCards.length > 0 && (statusFilter === 'all' || statusFilter === 'wishlist')" class="mt-8">
          <div class="flex items-center gap-2 mb-4">
            <h3 class="text-small font-bold text-yellow-400">{{ t('collection.sections.myWishlist') }}</h3>
            <span class="text-tiny text-silver-50">({{ wishlistCount }})</span>
          </div>

          <!-- Grouped view -->
          <div v-for="group in groupedWishlistCards" :key="group.type" class="mb-6">
            <!-- Category Header (hidden when no grouping) -->
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

        <!-- Empty State: Deck sin cartas -->
        <div v-if="viewMode === 'decks' && selectedDeck && filteredMainboardDisplayCards.length === 0 && filteredSideboardDisplayCards.length === 0" class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">{{ t('collection.empty.deckEmpty') }}</p>
            <p class="text-tiny text-silver-70 mt-1">{{ t('collection.empty.deckNoCards') }}</p>
          </div>
        </div>

        <!-- ========== BINDER VIEW: Card Grid ========== -->
        <div v-if="viewMode === 'binders' && selectedBinder && filteredBinderDisplayCards.length > 0" class="mb-6">
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
          />
        </div>

        <!-- Empty State: Binder sin cartas -->
        <div v-if="viewMode === 'binders' && selectedBinder && filteredBinderDisplayCards.length === 0" class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">{{ t('binders.empty') }}</p>
          </div>
        </div>

        <!-- Empty State: No filter results (cards exist but all hidden by filters) -->
        <div v-if="viewMode === 'collection' && !collectionStore.loading
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
        <div v-if="viewMode === 'collection' && !collectionStore.loading
                    && collectionStore.cards.length === 0"
             class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">{{ t('collection.empty.noCards') }}</p>
            <p class="text-tiny text-silver-70 mt-1">{{ t('collection.empty.searchToAdd') }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== MODALS ========== -->

    <!-- Add Card Modal -->
    <AddCardModal
        :show="showAddCardModal"
        :scryfall-card="selectedScryfallCard"
        :selected-deck-id="deckFilter !== 'all' ? deckFilter : undefined"
        :selected-binder-id="viewMode === 'binders' && binderFilter !== 'all' ? binderFilter : undefined"
        @close="handleAddCardModalClose"
        @added="handleAddCardModalClose"
    />

    <!-- Card Detail Modal (unified edit + status) -->
    <CardDetailModal
        :show="showCardDetailModal"
        :card="selectedCard"
        @close="handleCardDetailClosed"
        @saved="handleCardDetailClosed"
    />

    <!-- Manage Decks Modal -->
    <ManageDecksModal
        :show="showManageDecksModal"
        :card="selectedCard"
        @close="showManageDecksModal = false; selectedCard = null"
    />

    <!-- Create Deck Modal -->
    <CreateDeckModal
        ref="createDeckModalRef"
        :show="showCreateDeckModal"
        @close="showCreateDeckModal = false"
        @create="handleCreateDeck"
    />

    <!-- Create Binder Modal -->
    <CreateBinderModal
        ref="createBinderModalRef"
        :show="showCreateBinderModal"
        @close="showCreateBinderModal = false"
        @create="handleCreateBinder"
    />

    <!-- Import Deck Modal -->
    <ImportDeckModal
        :show="showImportDeckModal"
        @close="showImportDeckModal = false"
        @import="handleImport"
        @import-direct="handleImportDirect"
        @import-csv="handleImportCsv"
    />

    <!-- Import Binder Modal -->
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

  <!-- Floating Action Button (mobile) — teleported for z-index above panels -->
  <Teleport to="body">
    <FloatingActionButton
        icon="plus"
        :label="t('collection.fab.addCard')"
        @click="showAddCardModal = true"
        :style="fabBottomStyle"
    />
  </Teleport>

  <!-- ========== DECK STATS FOOTER (fijo abajo cuando hay deck seleccionado) ========== -->
  <Teleport to="body">
    <div v-if="viewMode === 'decks' && selectedDeck"
         class="fixed md:!bottom-0 left-0 right-0 z-40 bg-primary/95 backdrop-blur border-t border-neon overflow-x-hidden" :style="{ bottom: 'calc(3rem + env(safe-area-inset-bottom, 0px))' }">
      <div class="container mx-auto max-w-[1200px]">
        <!-- Desktop: fila única (unchanged) -->
        <div class="hidden md:flex items-center gap-4 text-tiny px-4 py-2">
          <div class="flex items-center gap-1 border-r border-silver-30 pr-4">
            <span class="text-silver-50">{{ t('collection.totals.priceSource') }}:</span>
            <button
                v-for="src in (['tcg', 'ck', 'buylist'] as DeckPriceSource[])"
                :key="src"
                @click="deckPriceSource = src"
                :class="[
                  'px-2 py-0.5 font-bold rounded transition-colors uppercase',
                  deckPriceSource === src
                    ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                    : 'text-silver-50 hover:text-silver hover:bg-silver-5'
                ]"
            >
              {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'Buylist' }}
            </button>
          </div>
          <span class="text-silver-50">{{ t('collection.deckStats.have') }} <span class="font-bold text-neon text-small">{{ deckOwnedCount }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.need') }} <span class="font-bold text-yellow-400 text-small">{{ deckWishlistCount }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.total') }} <span class="font-bold text-small"><span class="text-neon">{{ deckOwnedCount }}</span><span class="text-silver-30">/</span>{{ deckOwnedCount + deckWishlistCount }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.valueHave') }} <span class="font-bold" :class="deckSourceColor">${{ deckOwnedCostBySource.toFixed(2) }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.valueNeed') }} <span class="font-bold text-yellow-400">${{ deckWishlistCostBySource.toFixed(2) }}</span></span>
          <span class="text-silver-30">|</span>
          <span class="text-silver-50">{{ t('collection.deckStats.valueTotal') }} <span class="font-bold" :class="deckSourceColor">${{ deckTotalCostBySource.toFixed(2) }}</span></span>
          <div v-if="selectedDeckStats" class="flex items-center gap-2 flex-1 ml-2">
            <div class="flex-1 h-2 bg-primary rounded overflow-hidden border border-silver-30/30">
              <div class="h-full bg-neon transition-all" :style="{ width: `${selectedDeckStats.completionPercentage ?? 0}%` }"></div>
            </div>
            <span class="font-bold text-neon">{{ (selectedDeckStats.completionPercentage ?? 0).toFixed(0) }}%</span>
          </div>
        </div>
        <!-- Mobile: thin collapsed bar + expandable detail -->
        <div class="md:hidden">
          <!-- Collapsed handle: minimal height -->
          <button
            @click="deckStatsExpanded = !deckStatsExpanded"
            class="w-full flex items-center justify-between px-4 py-1"
          >
            <div class="flex items-center gap-1.5 text-[11px]">
              <span class="font-bold uppercase" :class="deckSourceColor">{{ deckActiveSourceLabel }}</span>
              <span class="text-silver-30">|</span>
              <span class="text-neon font-bold">{{ deckOwnedCount }}</span><span class="text-silver-50 text-[11px]">/{{ deckOwnedCount + deckWishlistCount }}</span>
              <span class="text-silver-30">|</span>
              <span class="text-silver-50">${{ deckTotalCostBySource.toFixed(2) }}</span>
              <span v-if="selectedDeckStats" class="font-bold text-neon">{{ (selectedDeckStats.completionPercentage ?? 0).toFixed(0) }}%</span>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 class="text-silver-50 transition-transform duration-200" :class="deckStatsExpanded ? 'rotate-180' : ''">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>

          <!-- Expanded detail panel -->
          <div v-if="deckStatsExpanded" class="px-4 pb-1.5 space-y-1.5">
            <!-- Row 1: source buttons + counts -->
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                <button
                    v-for="src in (['tcg', 'ck', 'buylist'] as DeckPriceSource[])"
                    :key="src"
                    @click.stop="deckPriceSource = src"
                    :class="[
                      'px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors uppercase',
                      deckPriceSource === src
                        ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                        : 'text-silver-50'
                    ]"
                >
                  {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'BUY' }}
                </button>
              </div>
              <span class="text-silver-30">|</span>
              <span class="text-[11px]"><span class="text-silver-50">Have </span><span class="text-neon font-bold">{{ deckOwnedCount }}</span></span>
              <span class="text-silver-30">|</span>
              <span class="text-[11px]"><span class="text-silver-50">Need </span><span class="text-yellow-400 font-bold">{{ deckWishlistCount }}</span></span>
            </div>
            <!-- Row 2: price breakdowns -->
            <div class="flex items-center gap-2 text-[11px]">
              <span><span class="text-silver-50">Have </span><span class="font-bold" :class="deckSourceColor">${{ deckOwnedCostBySource.toFixed(2) }}</span></span>
              <span class="text-silver-30">|</span>
              <span><span class="text-silver-50">Need </span><span class="font-bold text-yellow-400">${{ deckWishlistCostBySource.toFixed(2) }}</span></span>
              <span class="text-silver-30">|</span>
              <span><span class="text-silver-50">Total </span><span class="font-bold" :class="deckSourceColor">${{ deckTotalCostBySource.toFixed(2) }}</span></span>
            </div>
            <!-- Progress bar -->
            <div v-if="selectedDeckStats" class="flex items-center gap-2">
              <div class="flex-1 h-1.5 bg-primary rounded overflow-hidden border border-silver-30/30">
                <div class="h-full bg-neon transition-all" :style="{ width: `${selectedDeckStats.completionPercentage ?? 0}%` }"></div>
              </div>
              <span class="text-[11px] font-bold text-neon">{{ (selectedDeckStats.completionPercentage ?? 0).toFixed(0) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ========== COLLECTION STATS FOOTER (fijo abajo en modo colección) ========== -->
  <Teleport to="body">
    <CollectionTotalsPanel v-if="viewMode === 'collection'" @update:expanded="totalsPanelExpanded = $event" />
  </Teleport>
</template>

<style scoped>
/* Smooth transitions */
button {
  transition: all 150ms ease-out;
}

/* Scrollbar styling for filters */
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