<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDecksStore } from '../stores/decks'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import DeckCardComponent from '../components/decks/DeckCard.vue'
import CreateDeckModal from '../components/decks/CreateDeckModal.vue'
import ImportDeckModal from '../components/collection/ImportDeckModal.vue'
import { CardCondition } from '../types/card'
import { searchCards, getCardById } from '../services/scryfall'
import type { DeckCard } from '../types/deck'

const router = useRouter()
const decksStore = useDecksStore()
const collectionStore = useCollectionStore()
const toastStore = useToastStore()

const showCreateModal = ref(false)
const showImportModal = ref(false)
const searchQuery = ref('')
const filterFormat = ref<'all' | string>('all')

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
      toastStore.show('Importando cartas...', 'info')

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

        const match = trimmed.match(/^(\d+)x?\s+(.+?)(?:\s+\(([A-Z0-9]+)\))?(?:\s+\d+)?$/i)
        if (!match) continue

        const quantity = parseInt(match[1])
        const cardName = match[2].trim()
        const setCode = match[3] || undefined

        // Buscar en Scryfall
        const scryfallData = await fetchCardFromScryfall(cardName, setCode)

        // Agregar a colección primero
        collectionCards.push({
          scryfallId: scryfallData?.scryfallId || '',
          name: cardName,
          edition: scryfallData?.edition || setCode || 'Unknown',
          quantity,
          condition: 'NM' as CardCondition,
          foil: false,
          price: scryfallData?.price || 0,
          image: scryfallData?.image || '',
          status: 'collection',
          isInSideboard: inSideboard,
        })
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

        toastStore.show(`${collectionCards.length} cartas importadas`, 'success')
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
  if (confirm('¿Eliminar este deck? Esta acción no se puede deshacer.')) {
    await decksStore.deleteDeck(deckId)
  }
}

// Helper: Buscar carta en Scryfall y obtener datos completos
const fetchCardFromScryfall = async (cardName: string, setCode?: string) => {
  try {
    // Buscar por nombre (y set si está disponible)
    const query = setCode ? `"${cardName}" e:${setCode}` : `"${cardName}"`
    const results = await searchCards(query)
    if (results.length > 0) {
      const card = results[0]
      // Obtener imagen (considerar split cards)
      let image = card.image_uris?.normal || ''
      if (!image && card.card_faces && card.card_faces.length > 0) {
        image = card.card_faces[0]?.image_uris?.normal || ''
      }
      return {
        scryfallId: card.id,
        image,
        price: card.prices?.usd ? parseFloat(card.prices.usd) : 0,
        edition: card.set.toUpperCase(),
      }
    }
  } catch (e) {
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
  makePublic?: boolean
) => {
  const finalDeckName = deckName || `Deck${Date.now()}`
  toastStore.show('Importando cartas...', 'info')

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

    const match = trimmed.match(/^(\d+)x?\s+(.+?)(?:\s+\(([A-Z0-9]+)\))?(?:\s+\d+)?$/i)
    if (!match) continue

    const quantity = parseInt(match[1])
    const cardName = match[2].trim()
    const setCode = match[3] || undefined

    // Skip sideboard if not included
    if (inSideboard && !includeSideboard) continue

    // Buscar en Scryfall para obtener imagen y datos
    const scryfallData = await fetchCardFromScryfall(cardName, setCode)

    // Agregar a colección
    collectionCards.push({
      scryfallId: scryfallData?.scryfallId || '',
      name: cardName,
      edition: scryfallData?.edition || setCode || 'Unknown',
      quantity,
      condition,
      foil: false,
      price: scryfallData?.price || 0,
      image: scryfallData?.image || '',
      status: 'collection',
      public: makePublic || false,
      isInSideboard: inSideboard,
    })
  }

  // 1. Crear el deck
  const deckId = await decksStore.createDeck({
    name: finalDeckName,
    format: 'custom',
    description: '',
    colors: [],
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

  toastStore.show(`Deck "${finalDeckName}" importado con ${collectionCards.length} cartas`, 'success')
  showImportModal.value = false

  if (deckId) {
    await router.push(`/decks/${deckId}/edit`)
  }
}

// Importar directamente desde Moxfield API
const handleImportDirect = async (
  cards: any[],
  deckName: string | undefined,
  condition: CardCondition,
  makePublic?: boolean
) => {
  const finalDeckName = deckName || `Deck${Date.now()}`
  toastStore.show('Importando cartas desde Moxfield...', 'info')

  // 1. Crear el deck
  const deckId = await decksStore.createDeck({
    name: finalDeckName,
    format: 'custom',
    description: '',
    colors: [],
  })

  const collectionCards: any[] = []

  // 2. Procesar cada carta
  for (const card of cards) {
    // Obtener imagen desde Scryfall usando el scryfallId
    let image = ''
    let price = 0

    if (card.scryfallId) {
      const scryfallCard = await getCardById(card.scryfallId)
      if (scryfallCard) {
        image = scryfallCard.image_uris?.normal || ''
        if (!image && scryfallCard.card_faces && scryfallCard.card_faces.length > 0) {
          image = scryfallCard.card_faces[0]?.image_uris?.normal || ''
        }
        price = scryfallCard.prices?.usd ? parseFloat(scryfallCard.prices.usd) : 0
      }
    }

    const cardData: DeckCard = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      scryfallId: card.scryfallId || '',
      name: card.name,
      edition: card.setCode || 'Unknown',
      quantity: card.quantity,
      condition,
      foil: false,
      price,
      image,
      isInSideboard: false,
      addedAt: new Date(),
    }

    // Agregar al wishlist del deck (se convertirá a allocation cuando se guarde en colección)
    if (deckId) {
      await decksStore.addToWishlist(deckId, {
        scryfallId: cardData.scryfallId,
        name: cardData.name,
        edition: cardData.edition,
        quantity: cardData.quantity,
        isInSideboard: cardData.isInSideboard,
        price: cardData.price,
        image: cardData.image,
        condition: cardData.condition,
        foil: cardData.foil,
      })
    }

    // Agregar a colección
    collectionCards.push({
      ...cardData,
      status: 'collection',
      deckName: finalDeckName,
      public: makePublic || false,
    })
  }

  // 3. Guardar en colección
  if (collectionCards.length > 0) {
    await collectionStore.confirmImport(collectionCards)
  }

  toastStore.show(`Deck "${finalDeckName}" importado con ${cards.length} cartas`, 'success')
  showImportModal.value = false

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
          <h1 class="text-h2 md:text-h1 font-bold text-silver">MIS MAZOS</h1>
          <p class="text-tiny md:text-small text-silver-70 mt-1">
            {{ decksStore.totalDecks }} mazos creados
          </p>
        </div>
        <div class="flex gap-2 w-full md:w-auto">
          <BaseButton
              size="small"
              @click="showCreateModal = true"
              class="flex-1 md:flex-none"
          >
            + NUEVO MAZO
          </BaseButton>
          <BaseButton
              size="small"
              variant="secondary"
              @click="showImportModal = true"
              class="flex-1 md:flex-none"
          >
            IMPORTAR
          </BaseButton>
        </div>
      </div>

      <!-- Filtros -->
      <div class="bg-primary border border-silver-30 p-4 md:p-6 mb-6 space-y-4">
        <!-- Búsqueda -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Buscar</label>
          <BaseInput
              v-model="searchQuery"
              placeholder="Buscar por nombre o descripción..."
              type="text"
          />
        </div>

        <!-- Formato -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Formato</label>
          <div class="flex gap-2 flex-wrap">
            <button
                @click="filterFormat = 'all'"
                :class="[
                  'px-3 py-2 text-tiny font-bold transition-fast',
                  filterFormat === 'all'
                    ? 'bg-neon text-primary border border-neon'
                    : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                ]"
            >
              TODOS
            </button>
            <button
                v-for="format in formats"
                :key="format"
                @click="filterFormat = format"
                :class="[
                  'px-3 py-2 text-tiny font-bold transition-fast uppercase',
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
      <div v-else-if="filteredDecks.length === 0" class="border border-silver-30 p-8 md:p-12 text-center">
        <p class="text-body text-silver-70 mb-4">🗂️ No hay mazos</p>
        <p class="text-small text-silver-50 mb-6">
          {{ decksStore.totalDecks === 0
            ? 'Crea tu primer mazo para comenzar'
            : 'No se encontraron mazos con estos filtros'
          }}
        </p>
        <BaseButton v-if="decksStore.totalDecks === 0" @click="showCreateModal = true" size="small">
          CREAR PRIMER MAZO
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