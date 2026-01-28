<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import AppContainer from '../components/layout/AppContainer.vue'
import AddCardModal from '../components/collection/AddCardModal.vue'
import CardDetailModal from '../components/collection/CardDetailModal.vue'
import ManageDecksModal from '../components/collection/ManageDecksModal.vue'
import CollectionGrid from '../components/collection/CollectionGrid.vue'
import CollectionTotalsPanel from '../components/collection/CollectionTotalsPanel.vue'
import ImportDeckModal from '../components/collection/ImportDeckModal.vue'
import CreateDeckModal from '../components/decks/CreateDeckModal.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { Card, CardStatus, CardCondition } from '../types/card'
import { useDecksStore } from '../stores/decks'
import { useSearchStore } from '../stores/search'
import { useCardAllocation } from '../composables/useCardAllocation'
import { searchCards, getCardsByIds } from '../services/scryfall'
import { cleanCardName } from '../utils/cardHelpers'
import FilterPanel from '../components/search/FilterPanel.vue'
import SearchResultCard from '../components/search/SearchResultCard.vue'
import type { DeckFormat } from '../types/deck'

const route = useRoute()
const collectionStore = useCollectionStore()
const decksStore = useDecksStore()
const searchStore = useSearchStore()
const toastStore = useToastStore()
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

// ========== COMPUTED ==========

// Cartas según status
const collectionCards = computed(() => collectionStore.cards)

// Cartas que TENGO (no wishlist)
const ownedCards = computed(() =>
    collectionCards.value.filter(c => c.status !== 'wishlist')
)

// Cartas que NECESITO (wishlist)
const wishlistCards = computed(() =>
    collectionCards.value.filter(c => c.status === 'wishlist')
)

// Contadores por status
const ownedCount = computed(() => ownedCards.value.length)
const collectionCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'collection').length
)
// Combinamos sale + trade en "disponible" (para venta o cambio)
const availableCount = computed(() =>
    collectionCards.value.filter(c => c.status === 'sale' || c.status === 'trade').length
)
const wishlistCount = computed(() => wishlistCards.value.length)

// Función para traducir status a español
const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'all': 'TODAS',
    'owned': 'TENGO',
    'collection': 'COLECCIÓN',
    'available': 'DISPONIBLE',
    'sale': 'VENTA',
    'trade': 'CAMBIO',
    'wishlist': 'NECESITO',
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

// Carta del comandante (owned)
const deckCommanderCard = computed(() => {
  if (!selectedDeck.value || !isCommanderFormat.value || !selectedDeck.value.commander) return null
  // Buscar en cartas owned que coincida con el nombre del comandante
  return deckOwnedCards.value.find(c =>
    c.name.toLowerCase() === selectedDeck.value!.commander?.toLowerCase()
  )
})

// Cartas del mainboard (owned, no sideboard, no commander)
const deckMainboardCards = computed(() => {
  if (deckFilter.value === 'all') return []
  return deckOwnedCards.value.filter(c => {
    // Excluir comandante
    if (isCommanderFormat.value && selectedDeck.value?.commander &&
        c.name.toLowerCase() === selectedDeck.value.commander.toLowerCase()) {
      return false
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
    return deckAlloc && deckAlloc.isInSideboard
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

// Deck sorting
type DeckSortOption = 'name' | 'manaValue' | 'type' | 'price'
const deckSort = ref<DeckSortOption>('name')

// Helper to check if card is a land
const isLand = (card: any): boolean => {
  const typeLine = card.type_line?.toLowerCase() || ''
  return typeLine.includes('land')
}

// Helper to extract mana value from card (lands go to end)
const getManaValue = (card: any): number => {
  // Lands always at the end (high number)
  if (isLand(card)) return 999
  // If card has cmc stored, use it
  if (card.cmc !== undefined) return card.cmc
  // Default to 0 if unknown
  return 0
}

// Helper to get card type for sorting
const getCardType = (card: any): number => {
  const typeLine = card.type_line?.toLowerCase() || ''
  // Order: Creature, Planeswalker, Instant, Sorcery, Enchantment, Artifact, Land, Other
  if (typeLine.includes('creature')) return 1
  if (typeLine.includes('planeswalker')) return 2
  if (typeLine.includes('instant')) return 3
  if (typeLine.includes('sorcery')) return 4
  if (typeLine.includes('enchantment')) return 5
  if (typeLine.includes('artifact')) return 6
  if (typeLine.includes('land')) return 7
  return 8 // Unknown/Other
}

// Sorted deck cards
const sortedMainboardCards = computed(() => {
  const cards = [...deckMainboardCards.value]
  switch (deckSort.value) {
    case 'manaValue':
      return cards.sort((a, b) => getManaValue(a) - getManaValue(b))
    case 'type':
      return cards.sort((a, b) => getCardType(a) - getCardType(b))
    case 'price':
      return cards.sort((a, b) => (b.price || 0) - (a.price || 0))
    default:
      return cards.sort((a, b) => a.name.localeCompare(b.name))
  }
})

const sortedSideboardCards = computed(() => {
  const cards = [...deckSideboardCards.value]
  switch (deckSort.value) {
    case 'manaValue':
      return cards.sort((a, b) => getManaValue(a) - getManaValue(b))
    case 'type':
      return cards.sort((a, b) => getCardType(a) - getCardType(b))
    case 'price':
      return cards.sort((a, b) => (b.price || 0) - (a.price || 0))
    default:
      return cards.sort((a, b) => a.name.localeCompare(b.name))
  }
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

  return cards
})

// Precio total del deck actual (owned + wishlist)
const deckTotalCost = computed(() => {
  if (deckFilter.value === 'all') return 0
  const ownedPrice = deckOwnedCards.value.reduce((sum, card) => {
    const allocations = getAllocationsForCard(card.id)
    const deckAlloc = allocations.find(a => a.deckId === deckFilter.value)
    return sum + (card.price || 0) * (deckAlloc?.quantity || 0)
  }, 0)
  const wishlistPrice = deckWishlistCards.value.reduce((sum, item) =>
    sum + (item.price || 0) * item.quantity, 0
  )
  return ownedPrice + wishlistPrice
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

// Cuando selecciona una carta de búsqueda para agregar
const handleCardSelected = (card: any) => {
  selectedScryfallCard.value = card
  showAddCardModal.value = true
}

// Cuando hace click en una carta de la colección (o editar)
const handleCardClick = (card: Card) => {
  selectedCard.value = card
  showCardDetailModal.value = true
}

// Editar existente - same as click, opens unified modal
const handleEdit = (card: Card) => {
  selectedCard.value = card
  showCardDetailModal.value = true
}

// Gestionar mazos
const handleManageDecks = (card: Card) => {
  selectedCard.value = card
  showManageDecksModal.value = true
}

// Eliminar existente (optimistic UI - visual inmediato, toast después de DB)
const handleDelete = async (card: Card) => {
  // Check if card has allocations in decks
  const allocations = getAllocationsForCard(card.id)
  const hasAllocations = allocations.length > 0

  const message = hasAllocations
    ? `¿Eliminar "${card.name}" de tu colección?\n\nEsta carta está asignada en ${allocations.length} mazo(s). Se moverá a wishlist en esos mazos.`
    : `¿Eliminar "${card.name}" de tu colección?`

  if (!confirm(message)) return

  // Delete card optimistically (UI updates immediately, toast after DB)
  const deletePromise = collectionStore.deleteCard(card.id)

  // Convert allocations to wishlist in background (non-blocking)
  if (hasAllocations) {
    decksStore.convertAllocationsToWishlist(card)
      .catch(err => console.error('Error converting allocations:', err))
  }

  // Wait for delete to complete, then show toast
  const success = await deletePromise
  if (success) {
    toastStore.show(`✓ "${card.name}" eliminada`, 'success')
  }
  // If failed, store already shows error toast and restores card
}

// Handler cuando se cierra el modal de detalle
const handleCardDetailClosed = () => {
  showCardDetailModal.value = false
  selectedCard.value = null
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
      if (results.length > 0) {
        const card = results[0]
        const image = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || ''
        const price = card.prices?.usd ? Number.parseFloat(card.prices.usd) : 0
        if (price > 0 && image) {
          return { scryfallId: card.id, image, price, edition: card.set_name, setCode: card.set.toUpperCase() }
        }
      }
    }
    const allResults = await searchCards(`!"${cleanName}"`)
    if (allResults.length > 0) {
      const printWithPrice = allResults.find(r =>
        r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
        (r.image_uris?.normal || r.card_faces?.[0]?.image_uris?.normal)
      ) || allResults.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0) || allResults[0]
      const image = printWithPrice.image_uris?.normal || printWithPrice.card_faces?.[0]?.image_uris?.normal || ''
      return {
        scryfallId: printWithPrice.id,
        image,
        price: printWithPrice.prices?.usd ? Number.parseFloat(printWithPrice.prices.usd) : 0,
        edition: printWithPrice.set_name,
        setCode: printWithPrice.set.toUpperCase(),
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

    const match = trimmed.match(/^(\d+)x?\s+(.+?)(?:\s+\(([A-Z0-9]+)\))?(?:\s+[\dA-Z]+-?\d*[a-z]?)?(?:\s+\*[fF]\*?)?$/i)
    if (!match) continue

    const quantity = Number.parseInt(match[1])
    let cardName = match[2].trim()
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

// Importar desde Moxfield (OPTIMIZADO con batch API)
const handleImportDirect = async (
  cards: any[],
  deckName: string | undefined,
  condition: CardCondition,
  makePublic?: boolean,
  format?: DeckFormat,
  commander?: string
) => {
  const finalDeckName = deckName || `Deck${Date.now()}`
  showImportDeckModal.value = false

  // Toast persistente mientras importa
  let currentToastId = toastStore.show(`Importando "${finalDeckName}"... Obteniendo datos...`, 'info', true)

  try {
    // PASO 1: Crear el deck primero
    const deckId = await decksStore.createDeck({
      name: finalDeckName,
      format: format || 'custom',
      description: '',
      colors: [],
      commander: commander || '',
    })

    if (!deckId) {
      toastStore.remove(currentToastId)
      toastStore.show('Error al crear el deck', 'error')
      return
    }

    // PASO 2: Recolectar todos los scryfallIds para batch request
    const identifiers: Array<{ id: string }> = []
    const cardIndexMap = new Map<string, number[]>() // scryfallId -> indices en cards[]

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

    // PASO 3: Obtener todos los datos de Scryfall en batch (75 por request)
    toastStore.remove(currentToastId)
    currentToastId = toastStore.show(`Importando "${finalDeckName}"... Obteniendo ${identifiers.length} cartas...`, 'info', true)

    const scryfallDataMap = new Map<string, any>()
    if (identifiers.length > 0) {
      const scryfallCards = await getCardsByIds(identifiers)
      for (const sc of scryfallCards) {
        scryfallDataMap.set(sc.id, sc)
      }
    }

    // PASO 4: Procesar cada carta con los datos obtenidos
    toastStore.remove(currentToastId)
    currentToastId = toastStore.show(`Importando "${finalDeckName}"... Procesando cartas...`, 'info', true)

    const collectionCardsToAdd: any[] = []
    const cardMeta: Array<{ quantity: number; isInSideboard: boolean }> = []
    const cardsNeedingSearch: number[] = [] // Indices de cartas que necesitan búsqueda individual

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

      // Usar datos del batch si existen
      if (card.scryfallId && scryfallDataMap.has(card.scryfallId)) {
        const scryfallCard = scryfallDataMap.get(card.scryfallId)
        image = scryfallCard.image_uris?.normal || scryfallCard.card_faces?.[0]?.image_uris?.normal || ''
        price = scryfallCard.prices?.usd ? Number.parseFloat(scryfallCard.prices.usd) : 0
        finalEdition = scryfallCard.set?.toUpperCase() || finalEdition
        cmc = scryfallCard.cmc
        type_line = scryfallCard.type_line
      }

      // Si falta precio o imagen, marcar para búsqueda individual
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
      })
      cardMeta.push({
        quantity: card.quantity,
        isInSideboard: card.isInSideboard || false
      })
    }

    // PASO 5: Búsqueda individual solo para cartas sin precio/imagen (fallback)
    if (cardsNeedingSearch.length > 0) {
      toastStore.remove(currentToastId)
      currentToastId = toastStore.show(`Importando "${finalDeckName}"... Completando ${cardsNeedingSearch.length} cartas...`, 'info', true)

      for (const idx of cardsNeedingSearch) {
        const cardData = collectionCardsToAdd[idx]
        try {
          const results = await searchCards(`!"${cardData.name}"`)
          const printWithPrice = results.find(r =>
            r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
            (r.image_uris?.normal || r.card_faces?.[0]?.image_uris?.normal)
          ) || results.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0)

          if (printWithPrice) {
            cardData.scryfallId = printWithPrice.id
            cardData.edition = printWithPrice.set.toUpperCase()
            cardData.price = Number.parseFloat(printWithPrice.prices.usd)
            cardData.image = printWithPrice.image_uris?.normal || printWithPrice.card_faces?.[0]?.image_uris?.normal || ''
            cardData.cmc = printWithPrice.cmc
            cardData.type_line = printWithPrice.type_line
          } else if (results.length > 0 && !cardData.image) {
            const anyPrint = results[0]
            cardData.image = anyPrint.image_uris?.normal || anyPrint.card_faces?.[0]?.image_uris?.normal || ''
            if (!cardData.scryfallId) cardData.scryfallId = anyPrint.id
            if (cardData.edition === 'Unknown') cardData.edition = anyPrint.set.toUpperCase()
            cardData.cmc = anyPrint.cmc
            cardData.type_line = anyPrint.type_line
          }
        } catch (e) {
          console.warn(`[Import] Failed to search for "${cardData.name}":`, e)
        }
      }
    }

    // PASO 6: Importar cartas a la colección
    toastStore.remove(currentToastId)
    currentToastId = toastStore.show(`Importando "${finalDeckName}"... Guardando...`, 'info', true)

    let allocatedCount = 0
    if (collectionCardsToAdd.length > 0) {
      const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true)

      // Asignar cada carta al deck (con sideboard flag)
      for (let i = 0; i < createdCardIds.length; i++) {
        const cardId = createdCardIds[i]
        const meta = cardMeta[i]
        await decksStore.allocateCardToDeck(deckId, cardId, meta.quantity, meta.isInSideboard)
        allocatedCount += meta.quantity
      }
    }

    // Recargar para actualizar stats
    await decksStore.loadDecks()

    toastStore.remove(currentToastId)
    toastStore.show(`Deck "${finalDeckName}" importado con ${allocatedCount} cartas`, 'success')
    deckFilter.value = deckId
  } catch (error) {
    console.error('[Import] Error during import:', error)
    toastStore.remove(currentToastId)
    toastStore.show('Error al importar el deck', 'error')
  }
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
  if (!confirm(`¿Eliminar el deck "${deckName}"?`)) return

  // Segunda confirmación: eliminar también las cartas de la colección
  const deleteCards = cardIds.length > 0 && confirm('¿También deseas eliminar las cartas de tu colección?\n\nSÍ = Eliminar deck y cartas\nNO = Solo eliminar deck (cartas permanecen)')

  try {
    // Primero eliminar el deck
    await decksStore.deleteDeck(deckId)
    deckFilter.value = 'all'

    // Luego eliminar las cartas si el usuario lo solicitó (en paralelo para mayor velocidad)
    if (deleteCards) {
      await Promise.all(cardIds.map(cardId => collectionStore.deleteCard(cardId)))
      toastStore.show(`Deck y ${cardIds.length} cartas eliminadas`, 'success')
    } else {
      toastStore.show('Deck eliminado (cartas conservadas)', 'success')
    }
  } catch (err) {
    console.error('Error eliminando deck:', err)
    toastStore.show('Error eliminando deck', 'error')
  }
}

// Toggle visibilidad de todas las cartas del deck
const handleToggleDeckPublic = async () => {
  if (!selectedDeck.value) return

  const cardIds = deckOwnedCards.value.map(c => c.id)
  if (cardIds.length === 0) {
    toastStore.show('No hay cartas en el deck', 'info')
    return
  }

  const makePublic = !isDeckPublic.value

  try {
    await Promise.all(cardIds.map(cardId =>
      collectionStore.updateCard(cardId, { public: makePublic })
    ))
    toastStore.show(
      makePublic
        ? `${cardIds.length} cartas ahora son públicas`
        : `${cardIds.length} cartas ahora son privadas`,
      'success'
    )
  } catch (err) {
    console.error('Error actualizando visibilidad:', err)
    toastStore.show('Error actualizando visibilidad', 'error')
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
  } catch (err) {
    toastStore.show('Error cargando datos', 'error')
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
</script>

<template>
  <AppContainer>
    <!-- ========== HEADER ========== -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-h1 font-bold text-silver">MI COLECCIÓN</h1>
        <p class="text-small text-silver-70">
          {{ ownedCount }} cartas propias
          <span v-if="wishlistCount > 0" class="text-yellow-400">• {{ wishlistCount }} en wishlist</span>
        </p>
      </div>
      <div class="flex gap-2">
        <BaseButton size="small" variant="secondary" @click="showImportDeckModal = true">
          IMPORTAR
        </BaseButton>
        <BaseButton size="small" @click="showCreateDeckModal = true">
          + NUEVO DECK
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
            <h2 class="text-h3 font-bold text-neon">RESULTADOS DE BÚSQUEDA</h2>
            <p class="text-small text-silver-70">
              {{ searchStore.totalResults }} cartas encontradas - Click para agregar
            </p>
          </div>
          <BaseButton size="small" variant="secondary" @click="searchStore.clearSearch()">
            VER MI COLECCIÓN
          </BaseButton>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <SearchResultCard
              v-for="card in searchStore.results"
              :key="card.id"
              :card="card"
              @click="handleCardSelected(card)"
          />
        </div>
      </div>

      <!-- Vista de colección (cuando NO hay resultados de búsqueda) -->
      <div v-else>
        <!-- Totals Panel (solo cuando no hay deck seleccionado) -->
        <CollectionTotalsPanel v-if="deckFilter === 'all'" />

        <!-- ========== DECK TABS ========== -->
        <div class="mb-6">
          <p class="text-tiny text-silver-50 mb-2">MAZOS</p>
          <div class="flex gap-2 overflow-x-auto pb-2">
            <button
                @click="deckFilter = 'all'"
                :class="[
                  'px-4 py-2 text-small font-bold whitespace-nowrap transition-150',
                  deckFilter === 'all'
                    ? 'bg-neon text-primary border-2 border-neon'
                    : 'bg-primary border-2 border-silver-30 text-silver-70 hover:border-silver-50'
                ]"
            >
              TODOS
            </button>
            <button
                v-for="deck in decksList"
                :key="deck.id"
                @click="deckFilter = deck.id"
                :class="[
                  'px-4 py-2 text-small font-bold whitespace-nowrap transition-150',
                  deckFilter === deck.id
                    ? 'bg-neon text-primary border-2 border-neon'
                    : 'bg-primary border-2 border-silver-30 text-silver-70 hover:border-silver-50'
                ]"
            >
              {{ deck.name }}
              <span class="ml-1 opacity-70">{{ deck.stats?.ownedCards || 0 }}</span>
            </button>
          </div>
        </div>

        <!-- ========== DECK STATS (cuando hay deck seleccionado) ========== -->
        <div v-if="selectedDeck" class="bg-secondary border border-silver-30 p-4 mb-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-h3 font-bold text-silver">{{ selectedDeck.name }}</h2>
              <p class="text-tiny text-silver-50">{{ selectedDeck.format?.toUpperCase() }}</p>
            </div>
            <div class="flex gap-2">
              <BaseButton
                  size="small"
                  variant="secondary"
                  @click="handleToggleDeckPublic"
                  :class="isDeckPublic ? 'border-neon text-neon' : 'border-silver-50 text-silver-50'"
              >
                {{ isDeckPublic ? '👁 PÚBLICO' : '👁‍🗨 PRIVADO' }}
              </BaseButton>
              <BaseButton size="small" variant="secondary" @click="handleDeleteDeck">
                ELIMINAR
              </BaseButton>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-tiny text-silver-50">Tengo</p>
              <p class="text-h3 font-bold text-neon">{{ deckOwnedCount }}</p>
            </div>
            <div>
              <p class="text-tiny text-silver-50">Necesito</p>
              <p class="text-h3 font-bold text-yellow-400">{{ deckWishlistCount }}</p>
            </div>
            <div>
              <p class="text-tiny text-silver-50">Total</p>
              <p class="text-h3 font-bold text-silver">{{ deckOwnedCount + deckWishlistCount }}</p>
            </div>
            <div>
              <p class="text-tiny text-silver-50">Valor</p>
              <p class="text-h3 font-bold text-neon">${{ deckTotalCost.toFixed(2) }}</p>
            </div>
          </div>
          <div v-if="selectedDeckStats" class="mt-4 pt-4 border-t border-silver-20">
            <div class="flex items-center gap-2">
              <span class="text-tiny text-silver-50">Completado:</span>
              <div class="flex-1 h-2 bg-primary rounded overflow-hidden">
                <div
                    class="h-full bg-neon transition-all"
                    :style="{ width: `${selectedDeckStats.completionPercentage || 0}%` }"
                ></div>
              </div>
              <span class="text-tiny text-neon font-bold">{{ (selectedDeckStats.completionPercentage || 0).toFixed(0) }}%</span>
            </div>
          </div>

          <!-- Sorting controls -->
          <div class="mt-4 pt-4 border-t border-silver-20">
            <div class="flex items-center gap-2">
              <span class="text-tiny text-silver-50">Ordenar por:</span>
              <button
                  v-for="opt in [
                    { value: 'name', label: 'Nombre' },
                    { value: 'manaValue', label: 'Mana' },
                    { value: 'type', label: 'Tipo' },
                    { value: 'price', label: 'Precio' }
                  ]"
                  :key="opt.value"
                  @click="deckSort = opt.value as any"
                  :class="[
                    'px-2 py-1 text-tiny font-bold transition-150',
                    deckSort === opt.value
                      ? 'bg-neon text-primary'
                      : 'bg-secondary border border-silver-30 text-silver-50 hover:border-neon'
                  ]"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- ========== STATUS FILTERS ========== -->
        <div class="flex gap-2 mb-4 overflow-x-auto pb-2">
          <button
              v-for="(count, status) in {
                'all': collectionCards.length,
                'collection': collectionCount,
                'available': availableCount,
                'wishlist': wishlistCount
              }"
              :key="status"
              @click="statusFilter = status as any"
              :class="[
                'px-3 py-1 text-tiny font-bold whitespace-nowrap transition-150',
                statusFilter === status
                  ? status === 'wishlist' ? 'border border-yellow-400 text-yellow-400' : 'border border-neon text-neon'
                  : 'border border-silver-30 text-silver-50 hover:border-silver-50'
              ]"
          >
            {{ getStatusLabel(status) }}
            <span class="ml-1" :class="status === 'wishlist' ? 'text-yellow-400' : 'text-neon'">{{ count }}</span>
          </button>
        </div>

        <!-- ========== SEARCH ========== -->
        <div class="mb-6">
          <BaseInput
              v-model="filterQuery"
              placeholder="Buscar por nombre..."
              type="text"
          />
        </div>

        <!-- ========== CARDS GRID: SIN DECK SELECCIONADO ========== -->
        <div v-if="!selectedDeck && filteredCards.length > 0 && statusFilter !== 'wishlist'">
          <div class="flex items-center gap-2 mb-4">
            <h3 class="text-small font-bold text-silver">CARTAS QUE TENGO</h3>
            <span class="text-tiny text-silver-50">({{ filteredCards.length }})</span>
          </div>
          <CollectionGrid
              :cards="filteredCards"
              @card-click="handleCardClick"
              @edit="handleEdit"
              @delete="handleDelete"
              @manage-decks="handleManageDecks"
          />
        </div>

        <!-- ========== DECK VIEW: COMANDANTE ========== -->
        <div v-if="selectedDeck && isCommanderFormat && deckCommanderCard" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-purple-400/30">
            <h3 class="text-small font-bold text-purple-400">COMANDANTE</h3>
          </div>
          <CollectionGrid
              :cards="[deckCommanderCard]"
              :compact="true"
              @card-click="handleCardClick"
              @edit="handleEdit"
              @delete="handleDelete"
              @manage-decks="handleManageDecks"
          />
        </div>

        <!-- ========== DECK VIEW: MAZO PRINCIPAL (owned) ========== -->
        <div v-if="selectedDeck && sortedMainboardCards.length > 0 && statusFilter !== 'wishlist'" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-neon/30">
            <h3 class="text-small font-bold text-neon">MAZO PRINCIPAL</h3>
            <span class="text-tiny text-silver-50">({{ mainboardOwnedCount }} cartas)</span>
          </div>
          <CollectionGrid
              :cards="sortedMainboardCards"
              :compact="true"
              @card-click="handleCardClick"
              @edit="handleEdit"
              @delete="handleDelete"
              @manage-decks="handleManageDecks"
          />
        </div>

        <!-- ========== DECK VIEW: MAZO PRINCIPAL - NECESITO ========== -->
        <div v-if="selectedDeck && deckMainboardWishlist.length > 0 && (statusFilter === 'all' || statusFilter === 'wishlist')" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-yellow-400/30">
            <h3 class="text-small font-bold text-yellow-400">NECESITO - MAINBOARD</h3>
            <span class="text-tiny text-silver-50">({{ mainboardWishlistCount }})</span>
          </div>
          <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            <div
                v-for="item in deckMainboardWishlist"
                :key="item.scryfallId + '-main'"
                class="min-h-[180px] bg-secondary border border-yellow-400/30 hover:border-yellow-400 transition-150 cursor-pointer"
            >
              <div class="relative aspect-[3/4]">
                <img
                    v-if="item.image"
                    :src="item.image"
                    :alt="item.name"
                    class="w-full h-full object-cover"
                />
                <div class="absolute bottom-1 left-1 bg-primary/90 border border-yellow-400 px-2 py-1">
                  <span class="text-small font-bold text-yellow-400">x{{ item.quantity }}</span>
                </div>
              </div>
              <div class="p-1 min-h-[40px]">
                <p class="text-[10px] font-bold text-silver line-clamp-2 leading-tight">{{ item.name }}</p>
                <p class="text-[10px] text-neon font-bold">${{ item.price?.toFixed(2) || 'N/A' }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ========== SEPARADOR SIDEBOARD ========== -->
        <div v-if="selectedDeck && !isCommanderFormat && (sortedSideboardCards.length > 0 || deckSideboardWishlist.length > 0)" class="my-8">
          <div class="border-t-2 border-dashed border-blue-400/50"></div>
        </div>

        <!-- ========== DECK VIEW: SIDEBOARD (owned) - solo no-commander ========== -->
        <div v-if="selectedDeck && !isCommanderFormat && sortedSideboardCards.length > 0 && statusFilter !== 'wishlist'" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-blue-400/30">
            <h3 class="text-small font-bold text-blue-400">SIDEBOARD</h3>
            <span class="text-tiny text-silver-50">({{ sideboardOwnedCount }} cartas)</span>
          </div>
          <CollectionGrid
              :cards="sortedSideboardCards"
              :compact="true"
              @card-click="handleCardClick"
              @edit="handleEdit"
              @delete="handleDelete"
              @manage-decks="handleManageDecks"
          />
        </div>

        <!-- ========== DECK VIEW: SIDEBOARD - NECESITO - solo no-commander ========== -->
        <div v-if="selectedDeck && !isCommanderFormat && deckSideboardWishlist.length > 0 && (statusFilter === 'all' || statusFilter === 'wishlist')" class="mb-6">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-yellow-400/30">
            <h3 class="text-small font-bold text-yellow-400">NECESITO - SIDEBOARD</h3>
            <span class="text-tiny text-silver-50">({{ sideboardWishlistCount }})</span>
          </div>
          <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            <div
                v-for="item in deckSideboardWishlist"
                :key="item.scryfallId + '-side'"
                class="min-h-[180px] bg-secondary border border-yellow-400/30 hover:border-yellow-400 transition-150 cursor-pointer"
            >
              <div class="relative aspect-[3/4]">
                <img
                    v-if="item.image"
                    :src="item.image"
                    :alt="item.name"
                    class="w-full h-full object-cover"
                />
                <div class="absolute bottom-1 left-1 bg-primary/90 border border-yellow-400 px-2 py-1">
                  <span class="text-small font-bold text-yellow-400">x{{ item.quantity }}</span>
                </div>
              </div>
              <div class="p-1 min-h-[40px]">
                <p class="text-[10px] font-bold text-silver line-clamp-2 leading-tight">{{ item.name }}</p>
                <p class="text-[10px] text-neon font-bold">${{ item.price?.toFixed(2) || 'N/A' }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ========== WISHLIST GENERAL (cuando no hay deck seleccionado) ========== -->
        <div v-if="!selectedDeck && wishlistCards.length > 0 && (statusFilter === 'all' || statusFilter === 'wishlist')" class="mt-8">
          <div class="flex items-center gap-2 mb-4">
            <h3 class="text-small font-bold text-yellow-400">MI WISHLIST</h3>
            <span class="text-tiny text-silver-50">({{ wishlistCount }})</span>
          </div>
          <CollectionGrid
              :cards="wishlistCards"
              @card-click="handleCardClick"
              @edit="handleEdit"
              @delete="handleDelete"
              @manage-decks="handleManageDecks"
          />
        </div>

        <!-- Empty State: Deck sin cartas -->
        <div v-if="selectedDeck && deckMainboardCards.length === 0 && deckMainboardWishlist.length === 0 && deckSideboardCards.length === 0 && deckSideboardWishlist.length === 0 && !deckCommanderCard" class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">Deck vacío</p>
            <p class="text-tiny text-silver-70 mt-1">Este deck no tiene cartas asignadas</p>
          </div>
        </div>

        <!-- Empty State: Colección sin cartas -->
        <div v-if="!selectedDeck && filteredCards.length === 0 && wishlistCards.length === 0" class="flex justify-center items-center h-64">
          <div class="text-center">
            <p class="text-small text-silver-70">Sin cartas</p>
            <p class="text-tiny text-silver-70 mt-1">Busca cartas arriba para agregarlas</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== MODALS ========== -->

    <!-- Add Card Modal -->
    <AddCardModal
        :show="showAddCardModal"
        :scryfall-card="selectedScryfallCard"
        @close="showAddCardModal = false"
        @added="showAddCardModal = false"
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