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
import { getCardById, searchCards } from '../services/scryfall'
import type { DeckFormat } from '../types/deck'
import { parseDeckLine } from '../utils/cardHelpers'

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

const handleCreateDeck = async (deckData: any) => {
  const { deckList, ...deckInfo } = deckData

  const deckId = await decksStore.createDeck(deckInfo)
  if (deckId) {
    // Si hay una lista de cartas, importarla
    if (deckList) {
      toastStore.show(t('common.actions.loading'), 'info')

      const lines = deckList.split('\n').filter((l: string) => l.trim())
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

        // Buscar en Scryfall
        const scryfallData = await fetchCardFromScryfall(cardName, setCode || undefined)

        // Build card data - only include setCode if it has a value
        const cardData: any = {
          scryfallId: scryfallData?.scryfallId || '',
          name: cardName,
          edition: scryfallData?.edition || setCode || 'Unknown',
          quantity,
          condition: 'NM' as CardCondition,
          foil: isFoil,
          price: scryfallData?.price || 0,
          image: scryfallData?.image || '',
          status: 'collection',
          isInSideboard: inSideboard,
        }

        const finalSetCode = scryfallData?.setCode || setCode
        if (finalSetCode) {
          cardData.setCode = finalSetCode
        }

        collectionCards.push(cardData)
      }

      // Guardar en colección primero
      if (collectionCards.length > 0) {
        await collectionStore.confirmImport(collectionCards)

        // Recargar colección para obtener los IDs
        await collectionStore.loadCollection()

        // Ahora asignar al deck usando allocations
        for (const cardData of collectionCards) {
          // Buscar la carta en la colección por scryfallId
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

        toastStore.show(t('collection.messages.imported', { count: collectionCards.length }), 'success')
      }
    }

    showCreateModal.value = false
    await router.push(`/decks/${deckId}/edit`)
  }
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
      if (results.length > 0) {
        const card = results[0]
        let image = card.image_uris?.normal || ''
        if (!image && card.card_faces && card.card_faces.length > 0) {
          image = card.card_faces[0]?.image_uris?.normal || ''
        }
        const price = card.prices?.usd ? Number.parseFloat(card.prices.usd) : 0

        // If this print has price, use it
        if (price > 0 && image) {
          return {
            scryfallId: card.id,
            image,
            price,
            edition: card.set_name,
            setCode: card.set.toUpperCase(),
          }
        }
      }
    }

    // Search all prints and find one with price
    const allResults = await searchCards(`!"${cleanName}"`)
    if (allResults.length > 0) {
      // Find print with both price and image
      const printWithPrice = allResults.find(r =>
          r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
          (r.image_uris?.normal || r.card_faces?.[0]?.image_uris?.normal)
      ) || allResults.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0)

      if (printWithPrice && printWithPrice.prices?.usd) {
        let image = printWithPrice.image_uris?.normal || ''
        if (!image && printWithPrice.card_faces && printWithPrice.card_faces.length > 0) {
          image = printWithPrice.card_faces[0]?.image_uris?.normal || ''
        }
        return {
          scryfallId: printWithPrice.id,
          image,
          price: Number.parseFloat(printWithPrice.prices.usd),
          edition: printWithPrice.set_name,
          setCode: printWithPrice.set.toUpperCase(),
        }
      }

      // Fallback: at least return image from first result
      const firstCard = allResults[0]
      if (firstCard) {
        let image = firstCard.image_uris?.normal || ''
        if (!image && firstCard.card_faces && firstCard.card_faces.length > 0) {
          image = firstCard.card_faces[0]?.image_uris?.normal || ''
        }
        return {
          scryfallId: firstCard.id,
          image,
          price: firstCard.prices?.usd ? Number.parseFloat(firstCard.prices.usd) : 0,
          edition: firstCard.set_name,
          setCode: firstCard.set.toUpperCase(),
        }
      }
    }
  } catch {
    console.warn(`No se pudo obtener datos de Scryfall para: ${cardName}`)
  }
  return null
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

    // Buscar en Scryfall para obtener imagen y datos
    const scryfallData = await fetchCardFromScryfall(cardName, setCode || undefined)

    // Build card data - only include setCode if it has a value (Firebase rejects undefined)
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

    // Only add setCode if we have one (Firebase doesn't accept undefined)
    const finalSetCode = scryfallData?.setCode || setCode
    if (finalSetCode) {
      cardData.setCode = finalSetCode
    }

    collectionCards.push(cardData)
  }

  // 1. Crear el deck
  const deckId = await decksStore.createDeck({
    name: finalDeckName,
    format: format || 'custom',
    description: '',
    colors: [],
    commander: commander || '',
  })

  // 2. Agregar cartas a la colección primero
  if (collectionCards.length > 0) {
    await collectionStore.confirmImport(collectionCards)

    // Recargar colección para obtener los IDs
    await collectionStore.loadCollection()

    // 3. Asignar al deck usando allocations
    if (deckId) {
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
    let image = ''
    let price = 0
    let finalScryfallId = card.scryfallId || ''
    let finalEdition = card.setCode || 'Unknown'
    let cmc: number | undefined = undefined
    let type_line: string | undefined = undefined
    let colors: string[] = []

    if (card.scryfallId) {
      const scryfallCard = await getCardById(card.scryfallId)
      if (scryfallCard) {
        image = scryfallCard.image_uris?.normal || ''
        if (!image && scryfallCard.card_faces && scryfallCard.card_faces.length > 0) {
          image = scryfallCard.card_faces[0]?.image_uris?.normal || ''
        }
        price = scryfallCard.prices?.usd ? Number.parseFloat(scryfallCard.prices.usd) : 0
        cmc = scryfallCard.cmc
        type_line = scryfallCard.type_line
        colors = scryfallCard.colors || []
      }
    }

    // If no price or no image, search for another print with price
    if (price === 0 || !image) {
      try {
        const results = await searchCards(`!"${cardName}"`)
        // Find a print with price, preferring one with both price and image
        const printWithPrice = results.find(r =>
            r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
            (r.image_uris?.normal || r.card_faces?.[0]?.image_uris?.normal)
        ) || results.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0)

        if (printWithPrice && printWithPrice.prices?.usd) {
          finalScryfallId = printWithPrice.id
          finalEdition = printWithPrice.set.toUpperCase()
          price = Number.parseFloat(printWithPrice.prices.usd)
          image = printWithPrice.image_uris?.normal || ''
          if (!image && printWithPrice.card_faces && printWithPrice.card_faces.length > 0) {
            image = printWithPrice.card_faces[0]?.image_uris?.normal || ''
          }
          cmc = printWithPrice.cmc
          type_line = printWithPrice.type_line
          colors = printWithPrice.colors || []
        } else if (!image) {
          // At least get an image from any print
          const anyPrint = results[0]
          if (anyPrint) {
            image = anyPrint.image_uris?.normal || ''
            if (!image && anyPrint.card_faces && anyPrint.card_faces.length > 0) {
              image = anyPrint.card_faces[0]?.image_uris?.normal || ''
            }
            if (!finalScryfallId) finalScryfallId = anyPrint.id
            if (finalEdition === 'Unknown') finalEdition = anyPrint.set.toUpperCase()
            cmc = anyPrint.cmc
            type_line = anyPrint.type_line
            colors = anyPrint.colors || []
          }
        }
      } catch {
        console.warn(`Could not find alternate print for: ${cardName}`)
      }
    }

    // Agregar al wishlist del deck (se convertirá a allocation cuando se guarde en colección)
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
      />
    </div>
  </AppContainer>
</template>