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
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import AppContainer from '../components/layout/AppContainer.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import CardDetailModal from '../components/collection/CardDetailModal.vue'
import ManageDecksModal from '../components/collection/ManageDecksModal.vue'
import CollectionGrid from '../components/collection/CollectionGrid.vue'
import CollectionTotalsPanel from '../components/collection/CollectionTotalsPanel.vue'
import ImportDeckModal from '../components/collection/ImportDeckModal.vue'
import CreateDeckModal from '../components/decks/CreateDeckModal.vue'
import DeckEditorGrid from '../components/decks/DeckEditorGrid.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { type Card, type CardCondition, type CardStatus } from '../types/card'
import type { DeckFormat, DisplayDeckCard, HydratedDeckCard, HydratedWishlistCard } from '../types/deck'
import { useDecksStore } from '../stores/decks'
import { useSearchStore } from '../stores/search'
import { useCardAllocation } from '../composables/useCardAllocation'
import { getCardsByIds, searchCards } from '../services/scryfall'
import { cleanCardName } from '../utils/cardHelpers'
import FilterPanel from '../components/search/FilterPanel.vue'
import SearchResultCard from '../components/search/SearchResultCard.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import FloatingActionButton from '../components/ui/FloatingActionButton.vue'

const route = useRoute()
const router = useRouter()
const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const searchStore = useSearchStore()
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
const showImportDeckModal = ref(false)

// Selección de cartas
const selectedCard = ref<Card | null>(null)
const selectedScryfallCard = ref<any>(null)

// ✅ Filtros de COLECCIÓN (no Scryfall)
const statusFilter = ref<'all' | 'owned' | 'available' | CardStatus>('all')
const deckFilter = ref<string>('all')
const filterQuery = ref('')
const sortBy = ref<'recent' | 'name' | 'price'>('recent')
const viewType = ref<'grid' | 'compact'>('grid')

// ========== STACK VARIANTS (group by card name) ==========
const stackVariants = ref(false)
const expandedCardNames = ref<Set<string>>(new Set())

// Interface for stacked card groups
interface CardGroup {
  name: string
  variants: Card[]
  totalQuantity: number
  totalValue: number
  representativeCard: Card  // First variant, used for image
}

// Toggle expansion of a card group
const toggleCardGroup = (cardName: string) => {
  if (expandedCardNames.value.has(cardName)) {
    expandedCardNames.value.delete(cardName)
  } else {
    expandedCardNames.value.add(cardName)
  }
  // Force reactivity
  expandedCardNames.value = new Set(expandedCardNames.value)
}

// Group cards by name for stacked view
const stackedCards = computed((): CardGroup[] => {
  if (!stackVariants.value) return []

  const groups: Record<string, Card[]> = {}

  for (const card of filteredCards.value) {
    const name = card.name
    if (!groups[name]) groups[name] = []
    groups[name].push(card)
  }

  // Convert to array and calculate totals
  const result: CardGroup[] = []
  for (const name in groups) {
    const variants = groups[name]
    if (!variants || variants.length === 0) continue

    // Sort variants by price descending
    variants.sort((a, b) => (b.price || 0) - (a.price || 0))

    const totalQuantity = variants.reduce((sum, c) => sum + c.quantity, 0)
    const totalValue = variants.reduce((sum, c) => sum + (c.price || 0) * c.quantity, 0)

    result.push({
      name,
      variants,
      totalQuantity,
      totalValue,
      representativeCard: variants[0]!
    })
  }

  // Sort by sortBy preference
  switch (sortBy.value) {
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'price':
      result.sort((a, b) => b.totalValue - a.totalValue)
      break
    case 'recent':
    default:
      result.sort((a, b) => {
        const aDate = a.representativeCard.createdAt?.getTime() || 0
        const bDate = b.representativeCard.createdAt?.getTime() || 0
        return bDate - aDate
      })
  }

  return result
})

// Count unique card names
const uniqueCardCount = computed(() => {
  const names = new Set(filteredCards.value.map(c => c.name))
  return names.size
})

// Vista principal: Colección o Mazos
type ViewMode = 'collection' | 'decks'
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

// ========== IMPORT PROGRESS STATE ==========
interface ImportState {
  deckId: string
  deckName: string
  status: 'fetching' | 'processing' | 'saving' | 'allocating' | 'complete' | 'error'
  totalCards: number
  currentCard: number
  cards: any[]
  cardMeta: { quantity: number; isInSideboard: boolean }[]
  createdCardIds: string[]
  allocatedCount: number
}

const IMPORT_STORAGE_KEY = 'cranial_deck_import_progress'
const importProgress = ref<ImportState | null>(null)

// localStorage helpers
const saveImportState = (state: ImportState) => {
  try {
    localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(state))
    importProgress.value = state
  } catch (e) {
    console.warn('[Import] Failed to save state to localStorage:', e)
  }
}

const loadImportState = (): ImportState | null => {
  try {
    const saved = localStorage.getItem(IMPORT_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
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
  status: 'deleting_deck' | 'deleting_cards' | 'complete' | 'error'
  deleteCards: boolean
  cardIds: string[]
  deletedCardIds: string[]
}

const DELETE_DECK_STORAGE_KEY = 'cranial_delete_deck_progress'
const deleteDeckProgress = ref<DeleteDeckState | null>(null)

const saveDeleteDeckState = (state: DeleteDeckState) => {
  try {
    localStorage.setItem(DELETE_DECK_STORAGE_KEY, JSON.stringify(state))
    deleteDeckProgress.value = state
  } catch (e) {
    console.warn('[DeleteDeck] Failed to save state:', e)
  }
}

const loadDeleteDeckState = (): DeleteDeckState | null => {
  try {
    const saved = localStorage.getItem(DELETE_DECK_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
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

// Cartas según status
const collectionCards = computed(() => collectionStore.cards)

// Cartas que TENGO (no wishlist)
const ownedCards = computed(() =>
    collectionCards.value.filter(c => c.status !== 'wishlist')
)

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
      cards = [...cards].sort((a, b) => (b.price || 0) - (a.price || 0))
      break
  }

  return cards
})

// Contadores por status (totales, sin filtrar por búsqueda)
const ownedCount = computed(() => ownedCards.value.length)
const collectionCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'collection').length
)
// Combinamos sale + trade en "disponible" (para venta o cambio)
const availableCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'sale' || c.status === 'trade').length
)
// Total de wishlist (sin filtrar, para mostrar en badges)
const wishlistTotalCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'wishlist').length
)
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
  return labels[status] || status.toUpperCase()
}

// Decks del store de decks
const decksList = computed(() => decksStore.decks)

// Deck seleccionado actualmente
const selectedDeck = computed(() => {
  if (deckFilter.value === 'all') return null
  return decksStore.decks.find(d => d.id === deckFilter.value) || null
})

// Stats del deck seleccionado
const selectedDeckStats = computed(() => {
  if (!selectedDeck.value) return null
  return selectedDeck.value.stats
})

// Cartas del deck actual (owned)
const deckOwnedCards = computed(() => {
  if (deckFilter.value === 'all') return []
  return ownedCards.value.filter(c => {
    const allocations = getAllocationsForCard(c.id)
    return allocations.some(a => a.deckId === deckFilter.value)
  })
})

// Wishlist del deck actual
const deckWishlistCards = computed(() => {
  if (!selectedDeck.value) return []
  return selectedDeck.value.wishlist || []
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

// Cartas del comandante (owned) - puede haber varias
// Solo busca en cartas asignadas al deck
const deckCommanderCards = computed(() => {
  if (!selectedDeck.value || !isCommanderFormat.value || commanderNames.value.length === 0) return []
  return deckOwnedCards.value.filter(c =>
    commanderNames.value.some(name => c.name.toLowerCase() === name.toLowerCase())
  )
})

// Cartas del mainboard (owned, no sideboard, no commander)
const deckMainboardCards = computed(() => {
  if (deckFilter.value === 'all') return []
  return deckOwnedCards.value.filter(c => {
    // Excluir comandantes (pueden ser varios con Partner)
    if (isCommanderFormat.value && commanderNames.value.length > 0) {
      const cardNameLower = c.name.toLowerCase()
      if (commanderNames.value.some(name => name.toLowerCase() === cardNameLower)) {
        return false
      }
    }
    const allocations = getAllocationsForCard(c.id)
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value)
    return deckAlloc && !deckAlloc.isInSideboard
  })
})

// Cartas del sideboard (owned)
const deckSideboardCards = computed(() => {
  if (deckFilter.value === 'all' || isCommanderFormat.value) return []
  return deckOwnedCards.value.filter(c => {
    const allocations = getAllocationsForCard(c.id)
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value)
    return deckAlloc?.isInSideboard
  })
})

// Wishlist del mainboard
const deckMainboardWishlist = computed(() => {
  if (!selectedDeck.value) return []
  return (selectedDeck.value.wishlist || []).filter(w => !w.isInSideboard)
})

// Wishlist del sideboard
const deckSideboardWishlist = computed(() => {
  if (!selectedDeck.value || isCommanderFormat.value) return []
  return (selectedDeck.value.wishlist || []).filter(w => w.isInSideboard)
})

// Conteo de cartas por sección
const mainboardOwnedCount = computed(() => {
  return deckMainboardCards.value.reduce((sum, card) => {
    const allocations = getAllocationsForCard(card.id)
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value && !a.isInSideboard)
    return sum + (deckAlloc?.quantity || 0)
  }, 0)
})

const sideboardOwnedCount = computed(() => {
  return deckSideboardCards.value.reduce((sum, card) => {
    const allocations = getAllocationsForCard(card.id)
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value && a.isInSideboard)
    return sum + (deckAlloc?.quantity || 0)
  }, 0)
})

const mainboardWishlistCount = computed(() => {
  return deckMainboardWishlist.value.reduce((sum, item) => sum + item.quantity, 0)
})

const sideboardWishlistCount = computed(() => {
  return deckSideboardWishlist.value.reduce((sum, item) => sum + item.quantity, 0)
})

// Deck grouping
type DeckGroupOption = 'none' | 'type' | 'mana' | 'color'
const deckGroupBy = ref<DeckGroupOption>('none')

// ========== COLLECTION GROUPING ==========

// Category helper functions for collection cards
const getCardTypeCategory = (card: Card): string => {
  const typeLine = card.type_line?.toLowerCase() || ''
  if (typeLine.includes('creature')) return 'Creatures'
  if (typeLine.includes('instant')) return 'Instants'
  if (typeLine.includes('sorcery')) return 'Sorceries'
  if (typeLine.includes('enchantment')) return 'Enchantments'
  if (typeLine.includes('artifact')) return 'Artifacts'
  if (typeLine.includes('planeswalker')) return 'Planeswalkers'
  if (typeLine.includes('land')) return 'Lands'
  return 'Other'
}

const getCardManaCategory = (card: Card): string => {
  const typeLine = card.type_line?.toLowerCase() || ''
  if (typeLine.includes('land')) return 'Lands'
  const cmc = card.cmc ?? 0
  if (cmc >= 7) return '7+'
  return String(cmc)
}

const getCardColorCategory = (card: Card): string => {
  const typeLine = card.type_line?.toLowerCase() || ''
  if (typeLine.includes('land')) return 'Lands'

  const colors = card.colors || []
  const validColors = colors.filter((c: string) => ['W', 'U', 'B', 'R', 'G'].includes(c?.toUpperCase()))

  if (validColors.length === 0) return 'Colorless'
  if (validColors.length >= 2) return 'Multicolor'

  const color = validColors[0]?.toUpperCase()
  if (color === 'W') return 'White'
  if (color === 'U') return 'Blue'
  if (color === 'B') return 'Black'
  if (color === 'R') return 'Red'
  if (color === 'G') return 'Green'

  return 'Colorless'
}

const getCardCategory = (card: Card): string => {
  switch (deckGroupBy.value) {
    case 'mana': return getCardManaCategory(card)
    case 'color': return getCardColorCategory(card)
    case 'type': return getCardTypeCategory(card)
    default: return 'all'
  }
}

// Category orders
const typeOrder = ['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Lands', 'Other']
const manaOrder = ['0', '1', '2', '3', '4', '5', '6', '7+', 'Lands']
const colorOrder = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Lands']

const getCategoryOrder = (): string[] => {
  switch (deckGroupBy.value) {
    case 'mana': return manaOrder
    case 'color': return colorOrder
    case 'type': return typeOrder
    default: return []
  }
}

// Translate category name
const translateCategory = (category: string): string => {
  const translations: Record<string, string> = {
    'Creatures': 'Criaturas',
    'Instants': 'Instantáneos',
    'Sorceries': 'Conjuros',
    'Enchantments': 'Encantamientos',
    'Artifacts': 'Artefactos',
    'Planeswalkers': 'Planeswalkers',
    'Lands': 'Tierras',
    'Other': 'Otros',
    'White': 'Blanco',
    'Blue': 'Azul',
    'Black': 'Negro',
    'Red': 'Rojo',
    'Green': 'Verde',
    'Multicolor': 'Multicolor',
    'Colorless': 'Incoloro',
  }
  return translations[category] || category
}

// Grouped cards for collection view
const groupedFilteredCards = computed(() => {
  if (deckGroupBy.value === 'none') {
    return [{ type: 'all', cards: filteredCards.value }]
  }

  const groups: Record<string, Card[]> = {}
  const order = getCategoryOrder()

  for (const card of filteredCards.value) {
    const category = getCardCategory(card)
    if (!groups[category]) groups[category] = []
    groups[category].push(card)
  }

  // Build sorted groups array
  const sortedGroups: { type: string; cards: Card[] }[] = []

  for (const category of order) {
    const group = groups[category]
    if (group && group.length > 0) {
      sortedGroups.push({ type: category, cards: group })
    }
  }

  // Add any categories not in the order
  for (const category in groups) {
    const group = groups[category]
    if (!order.includes(category) && group && group.length > 0) {
      sortedGroups.push({ type: category, cards: group })
    }
  }

  return sortedGroups
})

// Grouped wishlist cards
const groupedWishlistCards = computed(() => {
  if (deckGroupBy.value === 'none') {
    return [{ type: 'all', cards: wishlistCards.value }]
  }

  const groups: Record<string, Card[]> = {}
  const order = getCategoryOrder()

  for (const card of wishlistCards.value) {
    const category = getCardCategory(card)
    if (!groups[category]) groups[category] = []
    groups[category].push(card)
  }

  // Build sorted groups array
  const sortedGroups: { type: string; cards: Card[] }[] = []

  for (const category of order) {
    const group = groups[category]
    if (group && group.length > 0) {
      sortedGroups.push({ type: category, cards: group })
    }
  }

  // Add any categories not in the order
  for (const category in groups) {
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
const mainboardDisplayCards = computed((): DisplayDeckCard[] => {
  if (!selectedDeck.value) return []

  // Include commander cards if applicable (can have multiple with Partner)
  const cardsToConvert = [...deckMainboardCards.value]
  if (isCommanderFormat.value && deckCommanderCards.value.length > 0) {
    cardsToConvert.unshift(...deckCommanderCards.value)
  }

  // Convert owned cards to HydratedDeckCard format
  const ownedDisplay: HydratedDeckCard[] = cardsToConvert.map(card => {
    const allocations = getAllocationsForCard(card.id)
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value && !a.isInSideboard)
    return {
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
      allocatedQuantity: deckAlloc?.quantity || 0,
      isInSideboard: false,
      notes: undefined,
      addedAt: card.createdAt || new Date(),
      isWishlist: false as const,
      availableInCollection: card.quantity - (deckAlloc?.quantity || 0),
      totalInCollection: card.quantity,
    }
  })

  // Convert wishlist items to HydratedWishlistCard format
  const wishlistDisplay: HydratedWishlistCard[] = deckMainboardWishlist.value.map(item => ({
    scryfallId: item.scryfallId,
    name: item.name,
    edition: item.edition,
    condition: item.condition,
    foil: item.foil,
    price: item.price,
    image: item.image,
    cmc: item.cmc,
    type_line: item.type_line,
    colors: (item as any).colors,
    requestedQuantity: item.quantity,
    isInSideboard: false,
    notes: item.notes,
    addedAt: item.addedAt,
    isWishlist: true as const,
  }))

  return [...ownedDisplay, ...wishlistDisplay]
})

const sideboardDisplayCards = computed((): DisplayDeckCard[] => {
  if (!selectedDeck.value || isCommanderFormat.value) return []

  // Convert owned cards to HydratedDeckCard format
  const ownedDisplay: HydratedDeckCard[] = deckSideboardCards.value.map(card => {
    const allocations = getAllocationsForCard(card.id)
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value && a.isInSideboard)
    return {
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
      allocatedQuantity: deckAlloc?.quantity || 0,
      isInSideboard: true,
      notes: undefined,
      addedAt: card.createdAt || new Date(),
      isWishlist: false as const,
      availableInCollection: card.quantity - (deckAlloc?.quantity || 0),
      totalInCollection: card.quantity,
    }
  })

  // Convert wishlist items to HydratedWishlistCard format
  const wishlistDisplay: HydratedWishlistCard[] = deckSideboardWishlist.value.map(item => ({
    scryfallId: item.scryfallId,
    name: item.name,
    edition: item.edition,
    condition: item.condition,
    foil: item.foil,
    price: item.price,
    image: item.image,
    cmc: item.cmc,
    type_line: item.type_line,
    colors: (item as any).colors,
    requestedQuantity: item.quantity,
    isInSideboard: true,
    notes: item.notes,
    addedAt: item.addedAt,
    isWishlist: true as const,
  }))

  return [...ownedDisplay, ...wishlistDisplay]
})

// Filtrados según criterios
const filteredCards = computed(() => {
  let cards = collectionCards.value

  // Filtro por status
  if (statusFilter.value === 'owned') {
    cards = cards.filter(c => c.status !== 'wishlist')
  } else if (statusFilter.value === 'available') {
    // 'available' incluye tanto 'sale' como 'trade'
    cards = cards.filter(c => c.status === 'sale' || c.status === 'trade')
  } else if (statusFilter.value !== 'all') {
    cards = cards.filter(c => c.status === statusFilter.value)
  }

  // Filtro por deck (usando allocaciones) - solo para cartas owned
  if (deckFilter.value !== 'all') {
    cards = cards.filter(c => {
      if (c.status === 'wishlist') return false // wishlist se muestra aparte
      const allocations = getAllocationsForCard(c.id)
      return allocations.some(a => a.deckId === deckFilter.value)
    })
  }

  // Filtro por búsqueda (nombre)
  if (filterQuery.value.trim()) {
    const q = filterQuery.value.toLowerCase()
    cards = cards.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.edition.toLowerCase().includes(q)
    )
  }

  // Sort
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
      cards = [...cards].sort((a, b) => (b.price || 0) - (a.price || 0))
      break
  }

  return cards
})

// Precio de cartas owned en el deck
const deckOwnedCost = computed(() => {
  if (deckFilter.value === 'all') return 0
  return deckOwnedCards.value.reduce((sum, card) => {
    const allocations = getAllocationsForCard(card.id)
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value)
    return sum + (card.price || 0) * (deckAlloc?.quantity || 0)
  }, 0)
})

// Precio de cartas wishlist en el deck
const deckWishlistCost = computed(() => {
  if (deckFilter.value === 'all') return 0
  return deckWishlistCards.value.reduce((sum, item) =>
    sum + (item.price || 0) * item.quantity, 0
  )
})

// Precio total del deck actual (owned + wishlist)
const deckTotalCost = computed(() => {
  return deckOwnedCost.value + deckWishlistCost.value
})

// Card IDs currently being deleted (for disabling UI)
const deletingCardIds = computed(() => {
  if (!deleteDeckProgress.value || deleteDeckProgress.value.status === 'complete') {
    return new Set<string>()
  }
  // Return all card IDs that are pending deletion (not yet deleted)
  const pendingIds = deleteDeckProgress.value.cardIds.filter(
    id => !deleteDeckProgress.value!.deletedCardIds.includes(id)
  )
  return new Set(pendingIds)
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
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value)
    return sum + (deckAlloc?.quantity || 0)
  }, 0)
})

// Cantidad de cartas wishlist en el deck
const deckWishlistCount = computed(() => {
  return deckWishlistCards.value.reduce((sum, item) => sum + item.quantity, 0)
})

// ========== METHODS ==========

// Get how many copies of a card the user owns (by name, any edition)
const getOwnedCount = (scryfallCard: any): number => {
  const cardName = scryfallCard.name?.toLowerCase()
  if (!cardName) return 0
  return collectionStore.cards
    .filter(c => c.name.toLowerCase() === cardName)
    .reduce((sum, c) => sum + c.quantity, 0)
}

// Cuando selecciona una carta de búsqueda para agregar
const handleCardSelected = (card: any) => {
  selectedScryfallCard.value = card
  showAddCardModal.value = true
}

// Cerrar modal de agregar carta y limpiar URL
const handleAddCardModalClose = () => {
  showAddCardModal.value = false
  selectedScryfallCard.value = null
  // Clear addCard query param if present
  if (route.query.addCard) {
    router.replace({ path: '/collection', query: { ...route.query, addCard: undefined } })
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

  // Delete card optimistically (UI updates immediately, toast after DB)
  const deletePromise = collectionStore.deleteCard(card.id)

  // Convert allocations to wishlist in background (non-blocking)
  if (hasAllocations) {
    decksStore.convertAllocationsToWishlist(card)
      .catch((err: unknown) => { console.error('Error converting allocations:', err); })
  }

  // Wait for delete to complete, then show toast
  const success = await deletePromise
  if (success) {
    toastStore.show(`"${card.name}" eliminada`, 'success')
  }
  // If failed, store already shows error toast and restores card
}

// Handler cuando se cierra el modal de detalle
const handleCardDetailClosed = () => {
  showCardDetailModal.value = false
  selectedCard.value = null
}

// ========== DECK EDITOR GRID HANDLERS ==========

// Handle edit from deck grid
const handleDeckGridEdit = (displayCard: DisplayDeckCard) => {
  if (!displayCard.isWishlist) {
    const hydratedCard = displayCard
    const card = collectionStore.cards.find(c => c.id === hydratedCard.cardId)
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
  const confirmed = await confirmStore.show({
    title: `Eliminar del deck`,
    message: `¿Eliminar "${cardName}" del deck?`,
    confirmText: 'ELIMINAR',
    cancelText: 'CANCELAR',
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  if (displayCard.isWishlist) {
    // Remove from wishlist
    await decksStore.removeFromWishlist(
      selectedDeck.value.id,
      displayCard.scryfallId,
      displayCard.edition,
      displayCard.condition,
      displayCard.foil,
      displayCard.isInSideboard
    )
  } else {
    // Deallocate from deck (card stays in collection)
    const ownedCard = displayCard
    await decksStore.deallocateCard(selectedDeck.value.id, ownedCard.cardId, ownedCard.isInSideboard)
  }

  toastStore.show(t('decks.editor.messages.cardRemoved'), 'success')
}

// Handle quantity update from deck grid
const handleDeckGridQuantityUpdate = async (displayCard: DisplayDeckCard, newQuantity: number) => {
  if (!selectedDeck.value) return

  if (!displayCard.isWishlist) {
    const hydratedCard = displayCard
    await decksStore.updateAllocation(
      selectedDeck.value.id,
      hydratedCard.cardId,
      hydratedCard.isInSideboard,
      newQuantity
    )
    toastStore.show(t('decks.editor.messages.quantityUpdated'), 'success')
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

// ========== DECK MANAGEMENT ==========

// Crear deck
const handleCreateDeck = async (deckData: any) => {
  const deckId = await decksStore.createDeck(deckData)
  if (deckId) {
    showCreateDeckModal.value = false
    deckFilter.value = deckId
    toastStore.show(`Deck "${deckData.name}" creado`, 'success')
  }
}

// Helper: Buscar carta en Scryfall
const fetchCardFromScryfall = async (cardName: string, setCode?: string) => {
  try {
    const cleanName = cleanCardName(cardName)
    if (setCode) {
      const results = await searchCards(`"${cleanName}" e:${setCode}`)
      const card = results[0]
      if (card) {
        const image = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || ''
        const price = card.prices?.usd ? Number.parseFloat(card.prices.usd) : 0
        if (price > 0 && image) {
          return {
            scryfallId: card.id,
            image,
            price,
            edition: card.set_name,
            setCode: card.set.toUpperCase(),
            cmc: card.cmc,
            type_line: card.type_line,
            colors: card.colors || [],
          }
        }
      }
    }
    const allResults = await searchCards(`!"${cleanName}"`)
    if (allResults.length > 0) {
      const printWithPrice = allResults.find(r =>
        r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
        (r.image_uris?.normal || r.card_faces?.[0]?.image_uris?.normal)
      ) || allResults.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0) || allResults[0]
      if (!printWithPrice) return null
      const image = printWithPrice.image_uris?.normal || printWithPrice.card_faces?.[0]?.image_uris?.normal || ''
      return {
        scryfallId: printWithPrice.id,
        image,
        price: printWithPrice.prices?.usd ? Number.parseFloat(printWithPrice.prices.usd) : 0,
        edition: printWithPrice.set_name,
        setCode: printWithPrice.set.toUpperCase(),
        cmc: printWithPrice.cmc,
        type_line: printWithPrice.type_line,
        colors: printWithPrice.colors || [],
      }
    }
  } catch (e) {
    console.warn(`No se pudo obtener datos de Scryfall para: ${cardName}`)
  }
  return null
}

// Importar deck desde texto
const handleImport = async (
  deckText: string,
  condition: CardCondition,
  includeSideboard: boolean,
  deckName?: string,
  makePublic?: boolean,
  format?: DeckFormat,
  commander?: string
) => {
  const finalDeckName = deckName || `Deck${Date.now()}`
  showImportDeckModal.value = false
  toastStore.show(`Importando "${finalDeckName}" en segundo plano...`, 'info')

  const lines = deckText.split('\n').filter(l => l.trim())
  const collectionCardsToAdd: any[] = []
  let inSideboard = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.toLowerCase().includes('sideboard')) { inSideboard = true; continue }

    const match = /^(\d+)x?\s+(.+?)(?:\s+\(([A-Z0-9]+)\))?(?:\s+[\dA-Z]+-?\d*[a-z]?)?(?:\s+\*[fF]\*?)?$/i.exec(trimmed)
    const matchQty = match?.[1]
    const matchName = match?.[2]
    if (!match || !matchQty || !matchName) continue

    const quantity = Number.parseInt(matchQty)
    let cardName = matchName.trim()
    const setCode = match[3] || null
    const isFoil = /\*[fF]\*?\s*$/.test(trimmed)

    cardName = cleanCardName(cardName)
    if (inSideboard && !includeSideboard) continue

    const scryfallData = await fetchCardFromScryfall(cardName, setCode || undefined)

    const cardData: any = {
      scryfallId: scryfallData?.scryfallId || '',
      name: cardName,
      edition: scryfallData?.edition || setCode || 'Unknown',
      quantity,
      condition,
      foil: isFoil,
      price: scryfallData?.price || 0,
      image: scryfallData?.image || '',
      status: 'collection',
      public: makePublic || false,
      isInSideboard: inSideboard,
      cmc: scryfallData?.cmc,
      type_line: scryfallData?.type_line,
      colors: scryfallData?.colors || [],
    }
    if (scryfallData?.setCode || setCode) {
      cardData.setCode = scryfallData?.setCode || setCode
    }
    collectionCardsToAdd.push(cardData)
  }

  const deckId = await decksStore.createDeck({
    name: finalDeckName,
    format: format || 'custom',
    description: '',
    colors: [],
    commander: commander || '',
  })

  if (collectionCardsToAdd.length > 0) {
    await collectionStore.confirmImport(collectionCardsToAdd)
    await collectionStore.loadCollection()

    if (deckId) {
      for (const cardData of collectionCardsToAdd) {
        const collectionCard = collectionStore.cards.find(
          c => c.scryfallId === cardData.scryfallId && c.edition === cardData.edition
        )
        if (collectionCard) {
          await decksStore.allocateCardToDeck(deckId, collectionCard.id, cardData.quantity, cardData.isInSideboard)
        }
      }
    }
  }

  toastStore.show(`Deck "${finalDeckName}" importado con ${collectionCardsToAdd.length} cartas`, 'success')
  if (deckId) {
    deckFilter.value = deckId
  }
}

// Importar desde Moxfield (OPTIMIZADO con batch API y progress tracking)
const handleImportDirect = async (
  cards: any[],
  deckName: string | undefined,
  condition: CardCondition,
  makePublic?: boolean,
  format?: DeckFormat,
  commander?: string
) => {
  // Prevent duplicate executions
  if (isImportRunning) {
    console.log('[Import] Already running, skipping...')
    return
  }
  isImportRunning = true

  const finalDeckName = deckName || `Deck${Date.now()}`
  showImportDeckModal.value = false

  // Create progress toast
  const progressToast = toastStore.showProgress(`Importando "${finalDeckName}"...`, 0)

  try {
    // PASO 1: Crear el deck primero
    progressToast.update(5, `Creando deck "${finalDeckName}"...`)
    const deckId = await decksStore.createDeck({
      name: finalDeckName,
      format: format || 'custom',
      description: '',
      colors: [],
      commander: commander || '',
    })

    if (!deckId) {
      progressToast.error('Error al crear el deck')
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

    // PASO 2: Recolectar todos los scryfallIds para batch request
    progressToast.update(10, `Preparando ${cards.length} cartas...`)
    const identifiers: { id: string }[] = []
    const cardIndexMap = new Map<string, number[]>()

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      if (card.scryfallId) {
        if (!cardIndexMap.has(card.scryfallId)) {
          cardIndexMap.set(card.scryfallId, [])
          identifiers.push({ id: card.scryfallId })
        }
        cardIndexMap.get(card.scryfallId)!.push(i)
      }
    }

    // PASO 3: Obtener todos los datos de Scryfall en batch
    progressToast.update(15, `Obteniendo datos de ${identifiers.length} cartas...`)
    const scryfallDataMap = new Map<string, any>()
    if (identifiers.length > 0) {
      const scryfallCards = await getCardsByIds(identifiers)
      for (const sc of scryfallCards) {
        scryfallDataMap.set(sc.id, sc)
      }
    }
    progressToast.update(25, `Procesando cartas...`)

    // PASO 4: Procesar cada carta con los datos obtenidos
    saveImportState({ ...initialState, status: 'processing' })

    const collectionCardsToAdd: any[] = []
    const cardMeta: { quantity: number; isInSideboard: boolean }[] = []
    const cardsNeedingSearch: number[] = []

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      let cardName = card.name
      const isFoil = /\*[fF]\*?\s*$/.test(cardName)
      if (isFoil) cardName = cardName.replace(/\s*\*[fF]\*?\s*$/, '').trim()

      let image = ''
      let price = 0
      const finalScryfallId = card.scryfallId || ''
      let finalEdition = card.setCode || 'Unknown'
      let cmc: number | undefined = undefined
      let type_line: string | undefined = undefined
      let colors: string[] = []

      if (card.scryfallId && scryfallDataMap.has(card.scryfallId)) {
        const scryfallCard = scryfallDataMap.get(card.scryfallId)
        image = scryfallCard.image_uris?.normal || scryfallCard.card_faces?.[0]?.image_uris?.normal || ''
        price = scryfallCard.prices?.usd ? Number.parseFloat(scryfallCard.prices.usd) : 0
        finalEdition = scryfallCard.set?.toUpperCase() || finalEdition
        cmc = scryfallCard.cmc
        type_line = scryfallCard.type_line
        colors = scryfallCard.colors || []
      }

      if (price === 0 || !image) {
        cardsNeedingSearch.push(i)
      }

      collectionCardsToAdd.push({
        scryfallId: finalScryfallId,
        name: cardName,
        edition: finalEdition,
        quantity: card.quantity,
        condition,
        foil: isFoil,
        price,
        image,
        status: 'collection',
        public: makePublic || false,
        cmc,
        type_line,
        colors,
      })
      cardMeta.push({
        quantity: card.quantity,
        isInSideboard: card.isInSideboard || false
      })

      // Update progress (25-45% range for processing)
      const processPercent = 25 + Math.round((i / cards.length) * 20)
      progressToast.update(processPercent, `Procesando ${i + 1}/${cards.length}...`)
      saveImportState({
        ...initialState,
        status: 'processing',
        currentCard: i + 1,
        cards: collectionCardsToAdd,
        cardMeta,
      })
    }

    // PASO 5: Búsqueda individual para cartas sin precio/imagen
    progressToast.update(45, `Buscando precios adicionales...`)
    if (cardsNeedingSearch.length > 0) {
      for (const idx of cardsNeedingSearch) {
        const cardData = collectionCardsToAdd[idx]
        try {
          const results = await searchCards(`!"${cardData.name}"`)
          const printWithPrice = results.find(r =>
            r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
            (r.image_uris?.normal || r.card_faces?.[0]?.image_uris?.normal)
          ) || results.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0)

          if (printWithPrice?.prices?.usd) {
            cardData.scryfallId = printWithPrice.id
            cardData.edition = printWithPrice.set.toUpperCase()
            cardData.price = Number.parseFloat(printWithPrice.prices.usd)
            cardData.image = printWithPrice.image_uris?.normal || printWithPrice.card_faces?.[0]?.image_uris?.normal || ''
            cardData.cmc = printWithPrice.cmc
            cardData.type_line = printWithPrice.type_line
            cardData.colors = printWithPrice.colors || []
          } else if (results.length > 0 && !cardData.image) {
            const anyPrint = results[0]
            if (anyPrint) {
              cardData.image = anyPrint.image_uris?.normal || anyPrint.card_faces?.[0]?.image_uris?.normal || ''
              if (!cardData.scryfallId) cardData.scryfallId = anyPrint.id
              if (cardData.edition === 'Unknown') cardData.edition = anyPrint.set.toUpperCase()
              cardData.cmc = anyPrint.cmc
              cardData.type_line = anyPrint.type_line
              cardData.colors = anyPrint.colors || []
            }
          }
        } catch (e) {
          console.warn(`[Import] Failed to search for "${cardData.name}":`, e)
        }
      }
    }

    // PASO 6: Importar cartas a la colección
    progressToast.update(50, `Guardando ${collectionCardsToAdd.length} cartas...`)
    saveImportState({
      deckId,
      deckName: finalDeckName,
      status: 'saving',
      totalCards: cards.length,
      currentCard: 0,
      cards: collectionCardsToAdd,
      cardMeta,
      createdCardIds: [],
      allocatedCount: 0,
    })

    let allocatedCount = 0
    if (collectionCardsToAdd.length > 0) {
      const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true)
      progressToast.update(60, `Asignando cartas al deck...`)

      // PASO 7: Asignar cartas al deck con progreso
      saveImportState({
        deckId,
        deckName: finalDeckName,
        status: 'allocating',
        totalCards: createdCardIds.length,
        currentCard: 0,
        cards: collectionCardsToAdd,
        cardMeta,
        createdCardIds,
        allocatedCount: 0,
      })

      for (let i = 0; i < createdCardIds.length; i++) {
        const cardId = createdCardIds[i]
        const meta = cardMeta[i]
        if (cardId && meta) {
          const result = await decksStore.allocateCardToDeck(deckId, cardId, meta.quantity, meta.isInSideboard)
          allocatedCount += result.allocated

          // Update progress for each allocation (60-95% range)
          const allocPercent = 60 + Math.round((i / createdCardIds.length) * 35)
          progressToast.update(allocPercent, `Asignando ${i + 1}/${createdCardIds.length}...`)
          saveImportState({
            deckId,
            deckName: finalDeckName,
            status: 'allocating',
            totalCards: createdCardIds.length,
            currentCard: i + 1,
            cards: collectionCardsToAdd,
            cardMeta,
            createdCardIds,
            allocatedCount,
          })
        }
      }
    }

    // PASO 8: Completar importación
    await decksStore.loadDecks()

    // Marcar como completo en localStorage antes de limpiar
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

    // Limpiar después de un momento para que el UI muestre 100%
    setTimeout(() => {
      clearImportState()
      isImportRunning = false
    }, 2000)

    progressToast.complete(`"${finalDeckName}" importado con ${allocatedCount} cartas`)
  } catch (error) {
    console.error('[Import] Error during import:', error)
    if (importProgress.value) {
      saveImportState({ ...importProgress.value, status: 'error' })
    }
    progressToast.error('Error al importar el deck')
    isImportRunning = false
  }
}

// Execute delete deck with progress tracking (can resume)
const executeDeleteDeck = async (state: DeleteDeckState, progressToast?: ReturnType<typeof toastStore.showProgress>, isResume = false) => {
  // Prevent duplicate executions (only check if not a resume with existing toast)
  if (!isResume && isDeleteRunning) {
    console.log('[DeleteDeck] Already running, skipping...')
    return
  }
  isDeleteRunning = true

  // Create progress toast if not provided (new operation vs resume)
  const progress = progressToast || (state.deleteCards && state.cardIds.length > 0
    ? toastStore.showProgress(`Eliminando "${state.deckName}"...`, 0)
    : null)

  try {
    // Step 1: Delete deck (if not already done)
    if (state.status === 'deleting_deck') {
      await decksStore.deleteDeck(state.deckId)
      deckFilter.value = 'all'

      // If no cards to delete, we're done
      if (!state.deleteCards || state.cardIds.length === 0) {
        state.status = 'complete'
        saveDeleteDeckState(state)
        if (progress) {
          progress.complete(t('decks.messages.deleted'))
        } else {
          toastStore.show(t('decks.messages.deletedCardsKept'), 'success')
        }
        clearDeleteDeckState()
        isDeleteRunning = false
        return
      }

      // Move to deleting cards
      state.status = 'deleting_cards'
      saveDeleteDeckState(state)
    }

    // Step 2: Delete cards one by one with progress tracking
    if (state.status === 'deleting_cards') {
      const totalCards = state.cardIds.length
      const remainingCardIds = state.cardIds.filter(id => !state.deletedCardIds.includes(id))

      for (const cardId of remainingCardIds) {
        try {
          await collectionStore.deleteCard(cardId)
          state.deletedCardIds.push(cardId)
          saveDeleteDeckState(state)

          // Update progress toast
          if (progress) {
            const percent = Math.round((state.deletedCardIds.length / totalCards) * 100)
            progress.update(percent, `Eliminando cartas... ${state.deletedCardIds.length}/${totalCards}`)
          }
        } catch (e) {
          console.error(`[DeleteDeck] Error deleting card ${cardId}:`, e)
          // Continue with other cards
        }
      }

      state.status = 'complete'
      saveDeleteDeckState(state)
      if (progress) {
        progress.complete(t('decks.messages.deletedWithCards', { count: state.deletedCardIds.length }))
      } else {
        toastStore.show(t('decks.messages.deletedWithCards', { count: state.deletedCardIds.length }), 'success')
      }
      clearDeleteDeckState()
      isDeleteRunning = false
    }
  } catch (err) {
    console.error('[DeleteDeck] Error:', err)
    state.status = 'error'
    saveDeleteDeckState(state)
    if (progress) {
      progress.error(t('decks.messages.deleteError'))
    } else {
      toastStore.show(t('decks.messages.deleteError'), 'error')
    }
    isDeleteRunning = false
  }
}

// Resume incomplete delete deck operation
const resumeDeleteDeck = async (savedState: DeleteDeckState) => {
  console.log('[DeleteDeck] Resuming delete operation for:', savedState.deckName)

  // Prevent duplicate executions
  if (isDeleteRunning) {
    console.log('[DeleteDeck] Already running, skipping resume...')
    return
  }

  if (savedState.status === 'complete') {
    clearDeleteDeckState()
    return
  }

  if (savedState.status === 'error') {
    savedState.status = savedState.deletedCardIds.length > 0 ? 'deleting_cards' : 'deleting_deck'
  }

  // Calculate initial progress for resume
  const initialProgress = savedState.cardIds.length > 0
    ? Math.round((savedState.deletedCardIds.length / savedState.cardIds.length) * 100)
    : 0

  const progress = toastStore.showProgress(
    `Continuando eliminación de "${savedState.deckName}"...`,
    initialProgress
  )

  await executeDeleteDeck(savedState, progress, true)
}

// Eliminar deck
const handleDeleteDeck = async () => {
  if (!selectedDeck.value) return

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

  // Initialize state and execute
  const state: DeleteDeckState = {
    deckId,
    deckName,
    status: 'deleting_deck',
    deleteCards,
    cardIds: deleteCards ? cardIds : [],
    deletedCardIds: []
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

// ========== RESUME IMPORT ==========

const resumeImport = async (savedState: ImportState) => {
  console.log('[Import] Resuming import:', savedState.deckName, 'status:', savedState.status)

  // Prevent duplicate executions
  if (isImportRunning) {
    console.log('[Import] Already running, skipping resume...')
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
    toastStore.show(`Import de "${savedState.deckName}" falló. Limpiando...`, 'error')
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
    `Continuando "${savedState.deckName}"...`,
    initialProgress
  )

  try {
    // Si estaba en 'allocating', continuar desde donde quedó
    if (savedState.status === 'allocating' && savedState.createdCardIds.length > 0) {
      let allocatedCount = savedState.allocatedCount
      const startIndex = savedState.currentCard

      for (let i = startIndex; i < savedState.createdCardIds.length; i++) {
        const cardId = savedState.createdCardIds[i]
        const meta = savedState.cardMeta[i]
        if (cardId && meta) {
          const result = await decksStore.allocateCardToDeck(savedState.deckId, cardId, meta.quantity, meta.isInSideboard)
          allocatedCount += result.allocated

          const allocPercent = 60 + Math.round((i / savedState.createdCardIds.length) * 35)
          progressToast.update(allocPercent, `Asignando ${i + 1}/${savedState.createdCardIds.length}...`)
          saveImportState({
            ...savedState,
            currentCard: i + 1,
            allocatedCount,
          })
        }
      }

      // Completar
      await decksStore.loadDecks()
      saveImportState({ ...savedState, status: 'complete', currentCard: savedState.totalCards, allocatedCount })
      setTimeout(() => {
        clearImportState()
        isImportRunning = false
      }, 2000)
      progressToast.complete(`"${savedState.deckName}" completado con ${allocatedCount} cartas`)

    } else if (savedState.status === 'saving' && savedState.cards.length > 0) {
      // Si estaba guardando cartas, reiniciar desde guardado
      progressToast.update(55, `Guardando ${savedState.cards.length} cartas...`)

      const createdCardIds = await collectionStore.confirmImport(savedState.cards, true)
      progressToast.update(60, `Asignando cartas al deck...`)

      saveImportState({
        ...savedState,
        status: 'allocating',
        totalCards: createdCardIds.length,
        currentCard: 0,
        createdCardIds,
      })

      // Continuar con allocations
      let allocatedCount = 0
      for (let i = 0; i < createdCardIds.length; i++) {
        const cardId = createdCardIds[i]
        const meta = savedState.cardMeta[i]
        if (cardId && meta) {
          const result = await decksStore.allocateCardToDeck(savedState.deckId, cardId, meta.quantity, meta.isInSideboard)
          allocatedCount += result.allocated

          const allocPercent = 60 + Math.round((i / createdCardIds.length) * 35)
          progressToast.update(allocPercent, `Asignando ${i + 1}/${createdCardIds.length}...`)
          saveImportState({
            ...savedState,
            status: 'allocating',
            totalCards: createdCardIds.length,
            currentCard: i + 1,
            createdCardIds,
            allocatedCount,
          })
        }
      }

      await decksStore.loadDecks()
      saveImportState({ ...savedState, status: 'complete', currentCard: savedState.totalCards, allocatedCount })
      setTimeout(() => {
        clearImportState()
        isImportRunning = false
      }, 2000)
      progressToast.complete(`"${savedState.deckName}" completado con ${allocatedCount} cartas`)

    } else {
      // Para otros estados (fetching, processing), limpiar y avisar
      progressToast.error(`Import incompleto. El deck puede estar vacío.`)
      clearImportState()
      isImportRunning = false
    }
  } catch (error) {
    console.error('[Import] Error resuming import:', error)
    saveImportState({ ...savedState, status: 'error' })
    progressToast.error('Error al resumir importación')
    isImportRunning = false
  }
}

// ========== LIFECYCLE ==========

onMounted(async () => {
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      decksStore.loadDecks()
    ])

    // Check for deck query param (from redirected deck routes)
    const deckParam = route.query.deck as string
    if (deckParam && decksStore.decks.some(d => d.id === deckParam)) {
      deckFilter.value = deckParam
    }

    // Check for incomplete imports
    const savedImport = loadImportState()
    if (savedImport && savedImport.status !== 'complete') {
      // Resume the import
      resumeImport(savedImport)
    } else if (savedImport?.status === 'complete') {
      // Clean up completed import
      clearImportState()
    }

    // Check for incomplete delete deck operations
    const savedDeleteDeck = loadDeleteDeckState()
    if (savedDeleteDeck && savedDeleteDeck.status !== 'complete') {
      // Resume the delete
      resumeDeleteDeck(savedDeleteDeck)
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

// Watch for filter query parameter (from wishlist links)
watch(() => route.query.filter, (newFilter) => {
  if (newFilter === 'wishlist') {
    statusFilter.value = 'wishlist'
    viewMode.value = 'collection'
    // Scroll to wishlist section after DOM updates
    setTimeout(() => {
      wishlistSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
}, { immediate: true })

// Watch for addCard query parameter (from GlobalSearch)
watch(() => route.query.addCard, async (cardName) => {
  if (cardName && typeof cardName === 'string') {
    try {
      // Search for the card in Scryfall
      const results = await searchCards(`!"${cardName}"`)
      if (results.length > 0) {
        selectedScryfallCard.value = results[0]
        showAddCardModal.value = true
      }
    } catch (err) {
      console.error('Error searching card:', err)
    }
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
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyboardShortcut)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboardShortcut)
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
      <div class="flex gap-2">
        <BaseButton size="small" variant="secondary" @click="showImportDeckModal = true">
          {{ t('collection.actions.import') }}
        </BaseButton>
        <BaseButton size="small" @click="showCreateDeckModal = true">
          {{ t('collection.actions.newDeck') }}
        </BaseButton>
      </div>
    </div>

    <!-- ========== BARRA DE BÚSQUEDA HORIZONTAL ========== -->
    <FilterPanel />

    <!-- ========== CONTENIDO PRINCIPAL ========== -->
    <div class="mt-6">
      <!-- Resultados de búsqueda Scryfall (cuando hay resultados) -->
      <div v-if="searchStore.hasResults" class="space-y-4">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-h3 font-bold text-neon">{{ t('collection.searchResults.title') }}</h2>
            <p class="text-small text-silver-70">
              {{ t('collection.searchResults.subtitle', { count: searchStore.totalResults }) }}
            </p>
          </div>
          <BaseButton size="small" variant="secondary" @click="searchStore.clearSearch()">
            {{ t('collection.searchResults.back') }}
          </BaseButton>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <SearchResultCard
              v-for="card in searchStore.results"
              :key="card.id"
              :card="card"
              :owned-count="getOwnedCount(card)"
              @click="handleCardSelected(card)"
          />
        </div>
      </div>

      <!-- Vista de colección (cuando NO hay resultados de búsqueda) -->
      <div v-else>
        <!-- ========== MAIN TABS: COLECCIÓN / MAZOS ========== -->
        <div class="mb-6">
          <div class="flex gap-1 mb-4">
            <button
                @click="switchToCollection"
                :class="[
                  'px-6 py-3 text-body font-bold transition-150 border-2',
                  viewMode === 'collection'
                    ? 'bg-neon text-primary border-neon'
                    : 'bg-primary border-silver-30 text-silver-70 hover:border-silver-50'
                ]"
            >
              {{ t('collection.tabs.collection') }}
            </button>
            <button
                @click="switchToDecks()"
                :class="[
                  'px-6 py-3 text-body font-bold transition-150 border-2',
                  viewMode === 'decks'
                    ? 'bg-neon text-primary border-neon'
                    : 'bg-primary border-silver-30 text-silver-70 hover:border-silver-50'
                ]"
            >
              {{ t('collection.tabs.decks') }}
              <span class="ml-1 opacity-70">{{ decksList.length }}</span>
            </button>
          </div>

          <!-- ========== DECK SUB-TABS (solo en modo mazos) ========== -->
          <div v-if="viewMode === 'decks'" class="flex gap-2 overflow-x-auto pb-2 pl-4 border-l-4 border-neon">
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
                  {{ importProgress?.currentCard || 0 }}/{{ importProgress?.totalCards || 0 }}
                </span>
                <span v-else class="ml-1 opacity-70">{{ deck.stats?.ownedCards || 0 }}</span>
              </span>
            </button>
            <!-- Botón nuevo deck -->
            <button
                @click="showCreateDeckModal = true"
                class="px-4 py-2 text-small font-bold whitespace-nowrap transition-150 border-2 border-dashed border-silver-30 text-silver-50 hover:border-neon hover:text-neon"
            >
              {{ t('collection.actions.new') }}
            </button>
          </div>

          <!-- Mensaje si no hay mazos -->
          <div v-if="viewMode === 'decks' && decksList.length === 0" class="pl-4 border-l-4 border-neon py-4">
            <p class="text-silver-50 text-small">{{ t('collection.noDecks') }}</p>
            <div class="flex gap-2 mt-3">
              <BaseButton size="small" @click="showCreateDeckModal = true">{{ t('collection.actions.createDeck') }}</BaseButton>
              <BaseButton size="small" variant="secondary" @click="showImportDeckModal = true">{{ t('collection.actions.import') }}</BaseButton>
            </div>
          </div>
        </div>

        <!-- Totals Panel (solo en modo colección) -->
        <CollectionTotalsPanel v-if="viewMode === 'collection'" />

        <!-- ========== DECK STATS (cuando hay deck seleccionado en modo mazos) ========== -->
        <div v-if="viewMode === 'decks' && selectedDeck" class="bg-neon/10 border-2 border-neon p-3 md:p-4 mb-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
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
              <BaseButton size="small" variant="secondary" @click="handleDeleteDeck">
                <span class="hidden sm:inline">ELIMINAR</span>
                <span class="sm:hidden">🗑️</span>
              </BaseButton>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <p class="text-tiny text-silver-50">{{ t('collection.deckStats.have') }}</p>
              <p class="text-h3 font-bold text-neon">{{ deckOwnedCount }}</p>
            </div>
            <div>
              <p class="text-tiny text-silver-50">{{ t('collection.deckStats.need') }}</p>
              <p class="text-h3 font-bold text-yellow-400">{{ deckWishlistCount }}</p>
            </div>
            <div>
              <p class="text-tiny text-silver-50">{{ t('collection.deckStats.total') }}</p>
              <p class="text-h3 font-bold text-silver">
                <span class="text-neon">{{ deckOwnedCount }}</span>
                <span class="text-silver-50">/</span>
                <span>{{ deckOwnedCount + deckWishlistCount }}</span>
              </p>
            </div>
            <div>
              <p class="text-tiny text-silver-50">{{ t('collection.deckStats.valueHave') }}</p>
              <p class="text-body font-bold text-neon">TCG: ${{ deckOwnedCost.toFixed(2) }}</p>
            </div>
            <div>
              <p class="text-tiny text-silver-50">{{ t('collection.deckStats.valueNeed') }}</p>
              <p class="text-body font-bold text-yellow-400">TCG: ${{ deckWishlistCost.toFixed(2) }}</p>
            </div>
            <div>
              <p class="text-tiny text-silver-50">{{ t('collection.deckStats.valueTotal') }}</p>
              <p class="text-body font-bold text-silver">TCG: ${{ deckTotalCost.toFixed(2) }}</p>
            </div>
          </div>
          <div v-if="selectedDeckStats" class="mt-4 pt-4 border-t border-neon/30">
            <div class="flex items-center gap-2">
              <span class="text-tiny text-silver-50">{{ t('collection.deckStats.completed') }}:</span>
              <div class="flex-1 h-2 bg-primary rounded overflow-hidden">
                <div
                    class="h-full bg-neon transition-all"
                    :style="{ width: `${selectedDeckStats.completionPercentage || 0}%` }"
                ></div>
              </div>
              <span class="text-tiny text-neon font-bold">{{ (selectedDeckStats.completionPercentage || 0).toFixed(0) }}%</span>
            </div>
          </div>

                  </div>

        <!-- ========== STATUS FILTERS (solo en modo colección) ========== -->
        <div v-if="viewMode === 'collection'" class="flex flex-wrap items-center gap-2 mb-4 pb-2">
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
                @click="statusFilter = status as any"
                :class="[
                  'px-3 py-1 text-tiny font-bold whitespace-nowrap transition-150 rounded',
                  statusFilter === status
                    ? status === 'wishlist' ? 'border border-yellow-400 text-yellow-400' : 'border border-neon text-neon'
                    : 'border border-silver-30 text-silver-50 hover:border-silver-50'
                ]"
            >
              {{ getStatusLabel(status) }}
              <span class="ml-1" :class="status === 'wishlist' ? 'text-yellow-400' : 'text-neon'">{{ count }}</span>
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
        <div class="mb-6 space-y-3">
          <BaseInput
              v-model="filterQuery"
              :placeholder="t('collection.filters.searchPlaceholder')"
              type="text"
              clearable
          />

          <!-- Sort & View controls -->
          <div class="flex flex-wrap items-center justify-between gap-2">
            <!-- Sort -->
            <div class="flex items-center gap-2">
              <span class="text-tiny text-silver-50">{{ t('collection.sort.label') }}:</span>
              <button
                  v-for="opt in ['recent', 'name', 'price']"
                  :key="opt"
                  @click="sortBy = opt as 'recent' | 'name' | 'price'"
                  :class="[
                    'px-2 py-1 text-tiny font-bold rounded transition-colors',
                    sortBy === opt ? 'bg-neon-10 text-neon' : 'text-silver-50 hover:text-silver'
                  ]"
              >
                {{ t(`collection.sort.${opt}`) }}
              </button>
            </div>

            <!-- Group by -->
            <div class="flex items-center gap-2">
              <span class="text-tiny text-silver-50">{{ t('collection.deckStats.groupBy') }}:</span>
              <button
                  v-for="opt in [
                    { value: 'none', label: t('collection.group.none') },
                    { value: 'type', label: t('collection.deckStats.type') },
                    { value: 'mana', label: t('collection.deckStats.mana') },
                    { value: 'color', label: t('collection.deckStats.color') }
                  ]"
                  :key="opt.value"
                  @click="deckGroupBy = opt.value as DeckGroupOption"
                  :class="[
                    'px-2 py-1 text-tiny font-bold rounded transition-colors',
                    deckGroupBy === opt.value ? 'bg-neon-10 text-neon' : 'text-silver-50 hover:text-silver'
                  ]"
              >
                {{ opt.label }}
              </button>
            </div>

            <!-- Stack variants toggle (only in collection mode) -->
            <div v-if="viewMode === 'collection'" class="flex items-center gap-2">
              <button
                  @click="stackVariants = !stackVariants"
                  :class="[
                    'px-2 py-1 text-tiny font-bold rounded transition-colors flex items-center gap-1',
                    stackVariants ? 'bg-neon-10 text-neon' : 'text-silver-50 hover:text-silver'
                  ]"
                  :title="t('collection.stack.tooltip')"
              >
                <SvgIcon name="stack" size="tiny" />
                {{ t('collection.stack.label') }}
              </button>
            </div>

            <!-- View type (only in collection mode, hidden when stacking) -->
            <div v-if="viewMode === 'collection' && !stackVariants" class="flex items-center gap-1">
              <button
                  @click="viewType = 'grid'"
                  :class="[
                    'p-2 rounded transition-colors',
                    viewType === 'grid' ? 'bg-neon-10 text-neon' : 'text-silver-50 hover:text-silver'
                  ]"
                  :title="t('collection.view.grid')"
              >
                <SvgIcon name="collection" size="small" />
              </button>
              <button
                  @click="viewType = 'compact'"
                  :class="[
                    'p-2 rounded transition-colors',
                    viewType === 'compact' ? 'bg-neon-10 text-neon' : 'text-silver-50 hover:text-silver'
                  ]"
                  :title="t('collection.view.compact')"
              >
                <SvgIcon name="settings" size="small" />
              </button>
            </div>
          </div>
        </div>

        <!-- ========== CARDS GRID: MODO COLECCIÓN ========== -->
        <div v-if="viewMode === 'collection' && filteredCards.length > 0 && statusFilter !== 'wishlist'">
          <div class="flex items-center gap-2 mb-4">
            <h3 class="text-small font-bold text-silver">{{ t('collection.sections.myCards') }}</h3>
            <span class="text-tiny text-silver-50">
              ({{ stackVariants ? `${uniqueCardCount} ${t('collection.stack.unique')}` : filteredCards.length }})
            </span>
          </div>

          <!-- ========== STACKED VIEW (group by card name) ========== -->
          <div v-if="stackVariants" class="space-y-2">
            <div
                v-for="group in stackedCards"
                :key="group.name"
                class="bg-secondary border border-silver-20 rounded overflow-hidden"
            >
              <!-- Card Group Header (always visible) -->
              <div
                  class="flex items-center gap-3 p-3 cursor-pointer hover:bg-silver-10 transition-colors"
                  @click="toggleCardGroup(group.name)"
              >
                <!-- Card Image Thumbnail -->
                <div class="w-12 h-16 flex-shrink-0 rounded overflow-hidden border border-silver-30">
                  <img
                      v-if="group.representativeCard.image"
                      :src="typeof group.representativeCard.image === 'string' && group.representativeCard.image.startsWith('{')
                        ? JSON.parse(group.representativeCard.image)?.card_faces?.[0]?.image_uris?.small || group.representativeCard.image
                        : group.representativeCard.image"
                      :alt="group.name"
                      class="w-full h-full object-cover"
                  />
                </div>

                <!-- Card Info -->
                <div class="flex-1 min-w-0">
                  <p class="text-small font-bold text-silver truncate">{{ group.name }}</p>
                  <p class="text-tiny text-silver-50">
                    {{ group.variants.length }} {{ group.variants.length === 1 ? t('collection.stack.variant') : t('collection.stack.variants') }}
                    · {{ group.totalQuantity }} {{ t('collection.stack.copies') }}
                  </p>
                </div>

                <!-- Total Value -->
                <div class="text-right flex-shrink-0">
                  <p class="text-small font-bold text-neon">${{ group.totalValue.toFixed(2) }}</p>
                </div>

                <!-- Expand/Collapse Icon -->
                <div class="flex-shrink-0">
                  <SvgIcon
                      :name="expandedCardNames.has(group.name) ? 'chevron-up' : 'chevron-down'"
                      size="small"
                      class="text-silver-50"
                  />
                </div>
              </div>

              <!-- Expanded Variants List -->
              <div
                  v-if="expandedCardNames.has(group.name)"
                  class="border-t border-silver-20 bg-primary"
              >
                <div
                    v-for="card in group.variants"
                    :key="card.id"
                    class="flex items-center gap-3 px-3 py-2 hover:bg-silver-10 transition-colors cursor-pointer border-b border-silver-10 last:border-b-0"
                    @click="handleCardClick(card)"
                >
                  <!-- Variant Details -->
                  <div class="w-12 flex-shrink-0"></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-tiny text-silver">
                      <span class="font-bold">{{ card.edition }}</span>
                      · {{ card.condition }}
                      <span v-if="card.foil" class="text-neon ml-1">FOIL</span>
                    </p>
                  </div>
                  <div class="text-tiny text-silver-50 flex-shrink-0">
                    x{{ card.quantity }}
                  </div>
                  <div class="text-tiny font-bold text-neon flex-shrink-0 w-20 text-right">
                    ${{ card.price ? (card.price * card.quantity).toFixed(2) : 'N/A' }}
                  </div>
                  <div class="flex-shrink-0">
                    <button
                        @click.stop="handleDelete(card)"
                        class="p-1 text-silver-50 hover:text-rust transition-colors"
                    >
                      <SvgIcon name="trash" size="tiny" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ========== REGULAR GRID VIEW ========== -->
          <template v-else>
            <!-- Grouped view -->
            <div v-for="group in groupedFilteredCards" :key="group.type" class="mb-6">
              <!-- Category Header (hidden when no grouping) -->
              <div v-if="group.type !== 'all'" class="flex items-center gap-2 mb-3 pb-2 border-b border-silver-20">
                <h4 class="text-tiny font-bold text-neon uppercase">{{ translateCategory(group.type) }}</h4>
                <span class="text-tiny text-silver-50">({{ getGroupCardCount(group.cards) }})</span>
              </div>
              <CollectionGrid
                  :cards="group.cards"
                  :compact="viewType === 'compact'"
                  :deleting-card-ids="deletingCardIds"
                  @card-click="handleCardClick"
                  @delete="handleDelete"
              />
            </div>
          </template>
        </div>

        <!-- ========== DECK VIEW: MAZO PRINCIPAL (Visual Grid) ========== -->
        <div v-if="viewMode === 'decks' && selectedDeck && mainboardDisplayCards.length > 0" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b-2 border-neon">
            <h3 class="text-small font-bold text-neon">{{ t('collection.sections.mainboard') }}</h3>
            <span class="text-tiny text-silver-50">({{ mainboardOwnedCount + mainboardWishlistCount }} cartas)</span>
          </div>
          <DeckEditorGrid
              :cards="mainboardDisplayCards"
              :deck-id="selectedDeck.id"
              :commander-names="commanderNames"
              :group-by="deckGroupBy"
              :sort-by="sortBy"
              @edit="handleDeckGridEdit"
              @remove="handleDeckGridRemove"
              @update-quantity="handleDeckGridQuantityUpdate"
              @add-to-wishlist="handleDeckGridAddToWishlist"
              @toggle-commander="handleDeckGridToggleCommander"
          />
        </div>

        <!-- ========== SEPARADOR SIDEBOARD ========== -->
        <div v-if="viewMode === 'decks' && selectedDeck && !isCommanderFormat && sideboardDisplayCards.length > 0" class="my-8">
          <div class="border-t-2 border-dashed border-blue-400/50"></div>
        </div>

        <!-- ========== DECK VIEW: SIDEBOARD (Visual Grid) - solo no-commander ========== -->
        <div v-if="viewMode === 'decks' && selectedDeck && !isCommanderFormat && sideboardDisplayCards.length > 0" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-blue-400/30">
            <h3 class="text-small font-bold text-blue-400">{{ t('collection.sections.sideboard') }}</h3>
            <span class="text-tiny text-silver-50">({{ sideboardOwnedCount + sideboardWishlistCount }} cartas)</span>
          </div>
          <DeckEditorGrid
              :cards="sideboardDisplayCards"
              :deck-id="selectedDeck.id"
              :commander-names="commanderNames"
              :group-by="deckGroupBy"
              :sort-by="sortBy"
              @edit="handleDeckGridEdit"
              @remove="handleDeckGridRemove"
              @update-quantity="handleDeckGridQuantityUpdate"
              @add-to-wishlist="handleDeckGridAddToWishlist"
              @toggle-commander="handleDeckGridToggleCommander"
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
                :compact="viewType === 'compact'"
                :deleting-card-ids="deletingCardIds"
                @card-click="handleCardClick"
                @delete="handleDelete"
            />
          </div>
        </div>

        <!-- Empty State: Deck sin cartas -->
        <div v-if="viewMode === 'decks' && selectedDeck && mainboardDisplayCards.length === 0 && sideboardDisplayCards.length === 0" class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">{{ t('collection.empty.deckEmpty') }}</p>
            <p class="text-tiny text-silver-70 mt-1">{{ t('collection.empty.deckNoCards') }}</p>
          </div>
        </div>

        <!-- Empty State: Colección sin cartas -->
        <div v-if="viewMode === 'collection' && filteredCards.length === 0 && wishlistCards.length === 0" class="flex justify-center items-center h-64">
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
        :show="showCreateDeckModal"
        @close="showCreateDeckModal = false"
        @create="handleCreateDeck"
    />

    <!-- Import Deck Modal -->
    <ImportDeckModal
        :show="showImportDeckModal"
        @close="showImportDeckModal = false"
        @import="handleImport"
        @import-direct="handleImportDirect"
    />

    <!-- Floating Action Button (mobile) -->
    <FloatingActionButton
        icon="plus"
        :label="t('collection.fab.addCard')"
        @click="showAddCardModal = true"
    />
  </AppContainer>
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