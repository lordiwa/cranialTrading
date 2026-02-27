<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDecksStore } from '../stores/decks'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import DeckCardComponent from '../components/decks/DeckCard.vue'
import CreateDeckModal from '../components/decks/CreateDeckModal.vue'
import ImportDeckModal from '../components/collection/ImportDeckModal.vue'
import { type CardCondition } from '../types/card'
import { getCardById, getCardsByIds, searchCards } from '../services/scryfall'
import type { DeckFormat } from '../types/deck'
import { type ParsedCsvCard, parseDeckLine } from '../utils/cardHelpers'

const router = useRouter()
const decksStore = useDecksStore()
const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const { t } = useI18n()

const showCreateModal = ref(false)
const showImportModal = ref(false)
const searchQuery = ref('')
const filterFormat = ref<string>('all')

// Decks filtrados
const filteredDecks = computed(() => {
  let result = decksStore.decks

  // Filtrar por formato
  if (filterFormat.value !== 'all') {
    result = result.filter(d => d.format === filterFormat.value)
  }

  // Filtrar por búsqueda
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.description.toLowerCase().includes(query)
    )
  }

  return result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
})

// Formatos únicos
const formats = computed(() => {
  const set = new Set(decksStore.decks.map(d => d.format))
  return Array.from(set).sort()
})

// --- Shared helpers to reduce cognitive complexity ---

// Extract image from a Scryfall card, handling split/dual-faced cards
const extractScryfallImage = (card: any): string => {
  return card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal || ''
}

// Extract standardized card data from a Scryfall card object
const extractCardData = (card: any) => {
  return {
    scryfallId: card.id,
    image: extractScryfallImage(card),
    price: card.prices?.usd ? Number.parseFloat(card.prices.usd) : 0,
    edition: card.set_name,
    setCode: card.set.toUpperCase(),
  }
}

// Find a print with price from a list of Scryfall results, preferring one with both price and image
const findPrintWithPrice = (results: any[]) => {
  return results.find(r =>
    r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
    (r.image_uris?.normal || r.card_faces?.[0]?.image_uris?.normal)
  ) || results.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0)
}

// Helper: Buscar carta en Scryfall y obtener datos completos
// Prioriza prints con precio, nunca devuelve N/A si hay alternativas
const fetchCardFromScryfall = async (cardName: string, setCode?: string) => {
  try {
    // Clean card name (remove *f foil indicator if present)
    const cleanName = cardName.replace(/\s*\*f$/, '').trim()

    // First try with specific set if provided
    if (setCode) {
      const query = `"${cleanName}" e:${setCode}`
      const results = await searchCards(query)
      const card = results[0]
      if (card) {
        const data = extractCardData(card)
        if (data.price > 0 && data.image) {
          return data
        }
      }
    }

    // Search all prints and find one with price
    const allResults = await searchCards(`!"${cleanName}"`)
    if (allResults.length === 0) return null

    const printWithPrice = findPrintWithPrice(allResults)
    if (printWithPrice?.prices?.usd) {
      return extractCardData(printWithPrice)
    }

    // Fallback: at least return image from first result
    const firstCard = allResults[0]
    if (firstCard) {
      return extractCardData(firstCard)
    }
  } catch {
    console.warn(`No se pudo obtener datos de Scryfall para: ${cardName}`)
  }
  return null
}

// Parse deck lines into collection card data objects
const parseLinesIntoCards = async (
  lines: string[],
  condition: CardCondition,
  makePublic: boolean,
  includeSideboard: boolean
) => {
  const collectionCards: any[] = []
  let inSideboard = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.toLowerCase().includes('sideboard')) {
      inSideboard = true
      continue
    }

    const parsed = parseDeckLine(trimmed)
    if (!parsed) continue

    const { quantity, cardName, setCode, isFoil } = parsed

    // Skip sideboard if not included
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
      public: makePublic,
      isInSideboard: inSideboard,
    }

    const finalSetCode = scryfallData?.setCode || setCode
    if (finalSetCode) {
      cardData.setCode = finalSetCode
    }

    collectionCards.push(cardData)
  }

  return collectionCards
}

// Allocate parsed collection cards to a deck by matching scryfallId+edition
const allocateCollectionCardsToDeck = async (deckId: string, collectionCards: any[]) => {
  await collectionStore.loadCollection()
  for (const cardData of collectionCards) {
    const collectionCard = collectionStore.cards.find(
      c => c.scryfallId === cardData.scryfallId && c.edition === cardData.edition
    )
    if (collectionCard) {
      await decksStore.allocateCardToDeck(
        deckId,
        collectionCard.id,
        cardData.quantity,
        cardData.isInSideboard
      )
    }
  }
}

// Enrich a single card with Scryfall data (used in handleImportDirect)
const enrichCardFromScryfall = async (card: any) => {
  let image = ''
  let price = 0
  const finalScryfallId = card.scryfallId || ''
  const finalEdition = card.setCode || 'Unknown'
  let cmc: number | undefined = undefined
  let type_line: string | undefined = undefined
  let colors: string[] = []

  if (card.scryfallId) {
    const scryfallCard = await getCardById(card.scryfallId)
    if (scryfallCard) {
      image = extractScryfallImage(scryfallCard)
      price = scryfallCard.prices?.usd ? Number.parseFloat(scryfallCard.prices.usd) : 0
      cmc = scryfallCard.cmc
      type_line = scryfallCard.type_line
      colors = scryfallCard.colors || []
    }
  }

  return { image, price, finalScryfallId, finalEdition, cmc, type_line, colors }
}

// Fallback search for a better print when price=0 or image is missing
const findBestPrintFallback = async (
  cardName: string,
  current: { image: string; price: number; finalScryfallId: string; finalEdition: string; cmc: number | undefined; type_line: string | undefined; colors: string[] }
) => {
  const result = { ...current }
  try {
    const results = await searchCards(`!"${cardName}"`)
    const printWithPrice = findPrintWithPrice(results)

    if (printWithPrice?.prices?.usd) {
      result.finalScryfallId = printWithPrice.id
      result.finalEdition = printWithPrice.set.toUpperCase()
      result.price = Number.parseFloat(printWithPrice.prices.usd)
      result.image = extractScryfallImage(printWithPrice)
      result.cmc = printWithPrice.cmc
      result.type_line = printWithPrice.type_line
      result.colors = printWithPrice.colors || []
    } else if (!result.image && results[0]) {
      const anyPrint = results[0]
      result.image = extractScryfallImage(anyPrint)
      if (!result.finalScryfallId) result.finalScryfallId = anyPrint.id
      if (result.finalEdition === 'Unknown') result.finalEdition = anyPrint.set.toUpperCase()
      result.cmc = anyPrint.cmc
      result.type_line = anyPrint.type_line
      result.colors = anyPrint.colors || []
    }
  } catch {
    console.warn(`Could not find alternate print for: ${cardName}`)
  }
  return result
}

// Build a single collection card data object from CSV card + Scryfall data map
const buildCsvCardData = (card: ParsedCsvCard, scryfallDataMap: Map<string, any>, makePublic: boolean) => {
  const sc = scryfallDataMap.get(card.scryfallId)
  const image = extractScryfallImage(sc)
  const price = sc?.prices?.usd ? Number.parseFloat(sc.prices.usd) : card.price

  const cardData: any = {
    scryfallId: card.scryfallId || '',
    name: card.name,
    edition: sc?.set_name || card.setCode || 'Unknown',
    quantity: card.quantity,
    condition: card.condition,
    foil: card.foil,
    price,
    image,
    status: 'collection',
    public: makePublic,
  }
  if (card.setCode) {
    cardData.setCode = card.setCode.toUpperCase()
  }
  if (card.language) {
    cardData.language = card.language
  }
  return cardData
}

// --- End shared helpers ---

const handleCreateDeck = async (deckData: any) => {
  const { deckList, ...deckInfo } = deckData

  const deckId = await decksStore.createDeck(deckInfo)
  if (!deckId) return

  // Si hay una lista de cartas, importarla
  if (deckList) {
    toastStore.show(t('common.actions.loading'), 'info')

    const lines = deckList.split('\n').filter((l: string) => l.trim())
    const collectionCards = await parseLinesIntoCards(lines, 'NM' as CardCondition, false, true)

    if (collectionCards.length > 0) {
      await collectionStore.confirmImport(collectionCards)
      await allocateCollectionCardsToDeck(deckId, collectionCards)
      toastStore.show(t('collection.messages.imported', { count: collectionCards.length }), 'success')
    }
  }

  showCreateModal.value = false
  await router.push(`/decks/${deckId}/edit`)
}

const handleEditDeck = (deckId: string) => {
  router.push(`/decks/${deckId}/edit`)
}

const handleDeleteDeck = async (deckId: string) => {
  const confirmed = await confirmStore.show({
    title: t('decks.card.delete'),
    message: t('decks.messages.deleteError'),
    confirmText: t('common.actions.delete'),
    cancelText: t('common.actions.cancel'),
    confirmVariant: 'danger'
  })

  if (confirmed) {
    await decksStore.deleteDeck(deckId)
  }
}

// Importar desde texto (lista de cartas)
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

  // Close modal immediately and show background toast
  showImportModal.value = false
  toastStore.show(t('decks.importModal.analyzing'), 'info')

  // Parsear el texto
  const lines = deckText.split('\n').filter(l => l.trim())
  const collectionCards = await parseLinesIntoCards(lines, condition, makePublic || false, includeSideboard)

  // 1. Crear el deck
  const deckId = await decksStore.createDeck({
    name: finalDeckName,
    format: format || 'custom',
    description: '',
    colors: [],
    commander: commander || '',
  })

  // 2. Agregar cartas a la colección y asignar al deck
  if (collectionCards.length > 0) {
    await collectionStore.confirmImport(collectionCards)
    if (deckId) {
      await allocateCollectionCardsToDeck(deckId, collectionCards)
    }
  }

  toastStore.show(t('decks.messages.created', { name: finalDeckName }), 'success')

  if (deckId) {
    await router.push(`/decks/${deckId}/edit`)
  }
}

// Importar directamente desde Moxfield API
const handleImportDirect = async (
  cards: any[],
  deckName: string | undefined,
  condition: CardCondition,
  makePublic?: boolean,
  format?: DeckFormat,
  commander?: string
) => {
  const finalDeckName = deckName || `Deck${Date.now()}`

  // Close modal immediately and show background toast
  showImportModal.value = false
  toastStore.show(t('decks.importModal.analyzing'), 'info')

  // 1. Crear el deck
  const deckId = await decksStore.createDeck({
    name: finalDeckName,
    format: format || 'custom',
    description: '',
    colors: [],
    commander: commander || '',
  })

  const collectionCards: any[] = []

  // 2. Procesar cada carta
  for (const card of cards) {
    // Check if card name ends with foil indicator (*f, *F, *f*, *F*)
    let cardName = card.name
    const isFoil = /\*[fF]\*?\s*$/.test(cardName)
    if (isFoil) {
      cardName = cardName.replace(/\s*\*[fF]\*?\s*$/, '').trim()
    }

    // Obtener imagen y precio desde Scryfall
    let enriched = await enrichCardFromScryfall(card)

    // If no price or no image, search for another print with price
    if (enriched.price === 0 || !enriched.image) {
      enriched = await findBestPrintFallback(cardName, enriched)
    }

    const { image, price, finalScryfallId, finalEdition, cmc, type_line, colors } = enriched

    // Agregar al wishlist del deck
    if (deckId) {
      await decksStore.addToWishlist(deckId, {
        scryfallId: finalScryfallId,
        name: cardName,
        edition: finalEdition,
        quantity: card.quantity,
        isInSideboard: false,
        price,
        image,
        condition,
        foil: isFoil,
        cmc,
        type_line,
        colors,
      })
    }

    // Agregar a colección - only include setCode if it's a valid set code (not 'Unknown')
    const collectionCardData: any = {
      scryfallId: finalScryfallId,
      name: cardName,
      edition: finalEdition,
      quantity: card.quantity,
      condition,
      foil: isFoil,
      price,
      image,
      status: 'collection',
      deckName: finalDeckName,
      public: makePublic || false,
    }

    // Only add setCode if we have a valid one (Firebase rejects undefined)
    if (finalEdition && finalEdition !== 'Unknown') {
      collectionCardData.setCode = finalEdition
    }

    collectionCards.push(collectionCardData)
  }

  // 3. Guardar en colección
  if (collectionCards.length > 0) {
    await collectionStore.confirmImport(collectionCards)
  }

  toastStore.show(t('decks.messages.created', { name: finalDeckName }), 'success')

  if (deckId) {
    await router.push(`/decks/${deckId}/edit`)
  }
}

// Importar desde CSV de ManaBox (batch Scryfall lookup)
const handleImportCsv = async (
  cards: ParsedCsvCard[],
  deckName?: string,
  makePublic?: boolean,
  format?: DeckFormat,
  commander?: string
) => {
  const finalDeckName = deckName || `CSV Import ${Date.now()}`
  showImportModal.value = false
  toastStore.show(t('decks.importModal.analyzing'), 'info')

  // 1. Create deck
  const deckId = await decksStore.createDeck({
    name: finalDeckName,
    format: format || 'custom',
    description: '',
    colors: [],
    commander: commander || '',
  })

  // 2. Batch fetch Scryfall data using IDs from CSV
  const identifiers = cards
    .filter(c => c.scryfallId)
    .map(c => ({ id: c.scryfallId }))
  // Deduplicate
  const uniqueIds = [...new Map(identifiers.map(i => [i.id, i])).values()]

  const scryfallDataMap = new Map<string, any>()
  if (uniqueIds.length > 0) {
    const scryfallCards = await getCardsByIds(uniqueIds)
    for (const sc of scryfallCards) {
      scryfallDataMap.set(sc.id, sc)
    }
  }

  // 3. Build collection cards
  const collectionCards = cards.map(card => buildCsvCardData(card, scryfallDataMap, makePublic || false))

  // 4. Save to collection and allocate to deck
  if (collectionCards.length > 0) {
    await collectionStore.confirmImport(collectionCards)
    await collectionStore.loadCollection()

    if (deckId) {
      const bulkItems = collectionCards
        .map(cardData => {
          const collectionCard = collectionStore.cards.find(
            c => c.scryfallId === cardData.scryfallId && c.edition === cardData.edition
          )
          return collectionCard ? { cardId: collectionCard.id, quantity: cardData.quantity, isInSideboard: false } : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      await decksStore.bulkAllocateCardsToDeck(deckId, bulkItems)
    }
  }

  toastStore.show(t('decks.messages.created', { name: finalDeckName }), 'success')

  if (deckId) {
    await router.push(`/decks/${deckId}/edit`)
  }
}

onMounted(async () => {
  await decksStore.loadDecks()
})
</script>

<template>
  <AppContainer>
    <div>
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver">{{ t('decks.title') }}</h1>
          <p class="text-tiny md:text-small text-silver-70 mt-1">
            {{ t('decks.subtitle', { count: decksStore.totalDecks }) }}
          </p>
        </div>
        <div class="flex gap-2 w-full md:w-auto items-center">
          <BaseButton
              size="small"
              @click="showCreateModal = true"
              class="flex-1 md:flex-none"
          >
            {{ t('decks.actions.newDeck') }}
          </BaseButton>
          <BaseButton
              size="small"
              variant="secondary"
              @click="showImportModal = true"
              class="flex-1 md:flex-none"
          >
            {{ t('decks.actions.import') }}
          </BaseButton>
          <HelpTooltip
              :text="t('help.tooltips.collection.importDeck')"
              :title="t('help.titles.importDeck')"
          />
        </div>
      </div>

      <!-- Filtros -->
      <div class="bg-primary border border-silver-30 p-4 md:p-6 mb-6 space-y-4 rounded-md">
        <!-- Búsqueda -->
        <div>
          <label for="decks-search" class="text-small text-silver-70 block mb-2">{{ t('common.actions.search') }}</label>
          <BaseInput
              id="decks-search"
              v-model="searchQuery"
              :placeholder="t('decks.filters.searchPlaceholder')"
              type="text"
          />
        </div>

        <!-- Formato -->
        <div>
          <span class="text-small text-silver-70 block mb-2">{{ t('decks.filters.format') }}</span>
          <div class="flex gap-2 flex-wrap">
            <button
                @click="filterFormat = 'all'"
                :class="[
                  'px-3 py-2 text-tiny font-bold transition-fast rounded',
                  filterFormat === 'all'
                    ? 'bg-neon text-primary border border-neon'
                    : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                ]"
            >
              {{ t('decks.filters.all') }}
            </button>
            <button
                v-for="format in formats"
                :key="format"
                @click="filterFormat = format"
                :class="[
                  'px-3 py-2 text-tiny font-bold transition-fast uppercase rounded',
                  filterFormat === format
                    ? 'bg-neon text-primary border border-neon'
                    : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                ]"
            >
              {{ format }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading state -->
      <BaseLoader v-if="decksStore.loading" size="large" />

      <!-- Empty state -->
      <div v-else-if="filteredDecks.length === 0" class="border border-silver-30 p-8 md:p-12 text-center rounded-md">
        <p class="text-body text-silver-70 mb-4">{{ t('decks.empty.noDecks') }}</p>
        <p class="text-small text-silver-50 mb-6">
          {{ decksStore.totalDecks === 0
            ? t('decks.empty.createFirst')
            : t('decks.empty.noResults')
          }}
        </p>
        <BaseButton v-if="decksStore.totalDecks === 0" @click="showCreateModal = true" size="small">
          {{ t('decks.empty.createButton') }}
        </BaseButton>
      </div>

      <!-- Grid de mazos -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <DeckCardComponent
            v-for="deck in filteredDecks"
            :key="deck.id"
            :deck="deck"
            @edit="handleEditDeck"
            @delete="handleDeleteDeck"
        />
      </div>

      <!-- Modal crear mazo -->
      <CreateDeckModal
          :show="showCreateModal"
          @close="showCreateModal = false"
          @create="handleCreateDeck"
      />

      <!-- Modal importar mazo -->
      <ImportDeckModal
          :show="showImportModal"
          @close="showImportModal = false"
          @import="handleImport"
          @import-direct="handleImportDirect"
          @import-csv="handleImportCsv"
      />
    </div>
  </AppContainer>
</template>