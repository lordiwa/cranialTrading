<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDecksStore } from '../stores/decks'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import { useCardFilter } from '../composables/useCardFilter'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseBadge from '../components/ui/BaseBadge.vue'
import CardFilterBar from '../components/ui/CardFilterBar.vue'
import DeckEditorGrid from '../components/decks/DeckEditorGrid.vue'
import AddCardToDeckModal from '../components/decks/AddCardToDeckModal.vue'
import EditDeckCardModal from '../components/decks/EditDeckCardModal.vue'
import type { DisplayDeckCard, HydratedDeckCard } from '../types/deck'
import { buildMoxfieldCsv, downloadAsFile } from '../utils/cardHelpers'

const router = useRouter()
const route = useRoute()
const decksStore = useDecksStore()
const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const { t } = useI18n()

const loading = ref(false)
const showAddCardModal = ref(false)
const showEditCardModal = ref(false)
const editingCard = ref<DisplayDeckCard | null>(null)
const activeTab = ref<'mainboard' | 'sideboard'>('mainboard')

const deckId = route.params.deckId as string
const isNewDeck = !deckId || deckId === 'new'

const deck = computed(() => decksStore.currentDeck)

// Hydrated cards for display
const allCards = computed(() => {
  if (!deck.value) return []
  return decksStore.hydrateDeckCards(deck.value, collectionStore.cards)
})

const mainboardCards = computed(() =>
    allCards.value.filter(c => !c.isInSideboard)
)

const sideboardCards = computed(() =>
    allCards.value.filter(c => c.isInSideboard)
)

// Active tab cards for filtering
const activeTabCards = computed(() =>
    activeTab.value === 'mainboard' ? mainboardCards.value : sideboardCards.value
)

// Card filter composable
const {
  filterQuery,
  sortBy,
  groupBy,
  selectedColors,
  selectedManaValues,
  selectedTypes,
  filteredCards: activeFilteredCards,
} = useCardFilter(activeTabCards)

// Type guard and helper to get quantity from either type
const getCardQuantity = (card: DisplayDeckCard): number => {
  if (card.isWishlist) {
    return card.requestedQuantity
  }
  return (card).allocatedQuantity
}

// Stats
const mainboardCount = computed(() =>
    mainboardCards.value.reduce((sum, c) => sum + getCardQuantity(c), 0)
)

const sideboardCount = computed(() =>
    sideboardCards.value.reduce((sum, c) => sum + getCardQuantity(c), 0)
)

const completionPercent = computed(() =>
    deck.value?.stats.completionPercentage.toFixed(0) || '100'
)

/**
 * Handle adding a card from the modal
 * The modal now handles the logic of checking collection and allocating
 */
const handleAddCard = async (cardData: {
  cardId?: string        // If from collection
  scryfallId: string
  name: string
  edition: string
  quantity: number
  condition: string
  foil: boolean
  price: number
  image: string
  addToCollection: boolean
  cmc?: number
  type_line?: string
  colors?: string[]
}) => {
  const isInSideboard = activeTab.value === 'sideboard'

  if (cardData.cardId) {
    // Card exists in collection - allocate it
    const result = await decksStore.allocateCardToDeck(
        deckId,
        cardData.cardId,
        cardData.quantity,
        isInSideboard
    )

    if (result.allocated > 0 || result.wishlisted > 0) {
      showAddCardModal.value = false
      toastStore.show(t('decks.editor.messages.cardAdded', { section: activeTab.value }), 'success')
    }
  } else if (cardData.addToCollection) {
    // Add to collection first, then allocate
    const newCardId = await collectionStore.addCard({
      scryfallId: cardData.scryfallId,
      name: cardData.name,
      edition: cardData.edition,
      quantity: cardData.quantity,
      condition: cardData.condition as any,
      foil: cardData.foil,
      price: cardData.price,
      image: cardData.image,
      status: 'collection',
      cmc: cardData.cmc,
      type_line: cardData.type_line,
      colors: cardData.colors || [],
    })

    if (newCardId) {
      await decksStore.allocateCardToDeck(
          deckId,
          newCardId,
          cardData.quantity,
          isInSideboard
      )
      showAddCardModal.value = false
      toastStore.show(t('decks.editor.messages.cardAddedToCollection', { section: activeTab.value }), 'success')
    }
  } else {
    // Not in collection → create wishlist card in collection + allocate to deck
    const wishCardId = await collectionStore.ensureCollectionWishlistCard({
      scryfallId: cardData.scryfallId,
      name: cardData.name,
      edition: cardData.edition,
      quantity: cardData.quantity,
      condition: cardData.condition as any,
      foil: cardData.foil,
      price: cardData.price,
      image: cardData.image,
      cmc: cardData.cmc,
      type_line: cardData.type_line,
      colors: cardData.colors,
    })

    if (wishCardId) {
      await decksStore.allocateCardToDeck(deckId, wishCardId, cardData.quantity, isInSideboard)
      showAddCardModal.value = false
      toastStore.show(t('decks.editor.messages.cardAddedToWishlist', { section: activeTab.value }), 'info')
    }
  }
}

/**
 * Handle removing a card from the deck
 */
const handleRemoveCard = async (card: DisplayDeckCard) => {
  const cardName = card.name

  const confirmed = await confirmStore.show({
    title: t('decks.editor.removeFromDeck'),
    message: t('decks.editor.confirmRemove', { name: cardName }),
    confirmText: t('common.actions.delete'),
    cancelText: t('common.actions.cancel'),
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  if (card.isWishlist && card.cardId) {
    // Wishlist card backed by collection — deallocate from deck
    await decksStore.deallocateCard(deckId, card.cardId, card.isInSideboard)
  } else if (card.isWishlist) {
    // Legacy wishlist item (no cardId) — remove from deck wishlist array
    await decksStore.removeFromWishlist(
        deckId,
        card.scryfallId,
        card.edition,
        card.condition,
        card.foil,
        card.isInSideboard
    )
  } else {
    // Deallocate from deck (card stays in collection)
    await decksStore.deallocateCard(deckId, card.cardId, card.isInSideboard)
  }

  toastStore.show(t('decks.editor.messages.cardRemoved'), 'success')
}

/**
 * Handle editing a card
 */
const handleEditCard = (card: DisplayDeckCard) => {
  editingCard.value = card
  showEditCardModal.value = true
}

/**
 * Handle saving edited card
 * For owned cards, this edits the collection card (syncs everywhere)
 * For wishlist cards, this updates the wishlist item
 */
const handleSaveEditedCard = async (updatedData: any) => {
  if (!editingCard.value) return

  if (!editingCard.value.isWishlist) {
    // Update collection card - changes reflect automatically in deck
    const hydratedCard = editingCard.value as HydratedDeckCard
    await collectionStore.updateCard(hydratedCard.cardId, {
      scryfallId: updatedData.scryfallId,
      edition: updatedData.edition,
      condition: updatedData.condition,
      foil: updatedData.foil,
      price: updatedData.price,
      image: updatedData.image,
    })

    // Update allocation quantity if changed
    if (updatedData.quantity !== hydratedCard.allocatedQuantity) {
      await decksStore.updateAllocation(
          deckId,
          hydratedCard.cardId,
          hydratedCard.isInSideboard,
          updatedData.quantity
      )
    }
  }

  showEditCardModal.value = false
  editingCard.value = null
  toastStore.show(t('decks.editor.messages.cardUpdated'), 'success')
}

/**
 * Handle quantity update from grid popup
 */
const handleUpdateQuantity = async (card: DisplayDeckCard, newQuantity: number) => {
  if (!card.isWishlist) {
    const hydratedCard = card
    await decksStore.updateAllocation(
      deckId,
      hydratedCard.cardId,
      hydratedCard.isInSideboard,
      newQuantity
    )
    toastStore.show(t('decks.editor.messages.quantityUpdated'), 'success')
  }
  // TODO: Handle wishlist quantity update
}

/**
 * Handle add to wishlist from grid
 */
const handleAddToWishlistFromGrid = async (_card: DisplayDeckCard) => {
  // Card is already in wishlist, this is just a reminder
  toastStore.show(t('decks.editor.messages.alreadyInWishlist'), 'info')
}

const handleSave = async () => {
  if (!deck.value?.name.trim()) {
    toastStore.show(t('decks.editor.messages.nameRequired'), 'error')
    return
  }

  toastStore.show(t('decks.editor.messages.saved'), 'success')
  await router.push('/decks')
}

const handleBack = () => {
  router.push('/decks')
}

const handleExport = async () => {
  if (!deck.value) return

  const setCodeMap = new Map<string, string>()
  for (const c of collectionStore.cards) {
    if (c.setCode) setCodeMap.set(c.id, c.setCode)
  }

  const getSet = (card: DisplayDeckCard): string => {
    if (!card.isWishlist && 'cardId' in card) {
      const code = setCodeMap.get((card as any).cardId)
      if (code) return code.toUpperCase()
    }
    return card.edition
  }

  const lines: string[] = []
  const isCommander = deck.value.format === 'commander'
  const commanderName = deck.value.commander

  if (isCommander && commanderName) {
    const commanderCards = mainboardCards.value.filter(c => c.name === commanderName)
    if (commanderCards.length > 0) {
      lines.push('Commander')
      for (const card of commanderCards) {
        lines.push(`${getCardQuantity(card)} ${card.name} (${getSet(card)})`)
      }
      lines.push('')
    }
  }

  const deckCards = isCommander && commanderName
      ? mainboardCards.value.filter(c => c.name !== commanderName)
      : mainboardCards.value

  if (deckCards.length > 0) {
    if (isCommander && commanderName) {
      lines.push('Deck')
    }
    for (const card of deckCards) {
      lines.push(`${getCardQuantity(card)} ${card.name} (${getSet(card)})`)
    }
  }

  if (sideboardCards.value.length > 0) {
    lines.push('')
    lines.push('Sideboard')
    for (const card of sideboardCards.value) {
      lines.push(`${getCardQuantity(card)} ${card.name} (${getSet(card)})`)
    }
  }

  const text = lines.join('\n')

  try {
    await navigator.clipboard.writeText(text)
    toastStore.show(t('decks.detail.exportCopied'), 'success')
  } catch {
    toastStore.show(t('decks.detail.exportError'), 'error')
  }
}

const handleExportCsv = async () => {
  if (!deck.value) return

  const cardMap = new Map<string, typeof collectionStore.cards[number]>()
  for (const c of collectionStore.cards) {
    cardMap.set(c.id, c)
  }

  const allCards = [...mainboardCards.value, ...sideboardCards.value]
  const csvCards: Parameters<typeof buildMoxfieldCsv>[0] = []

  for (const card of allCards) {
    const qty = card.isWishlist ? card.requestedQuantity : (card as any).allocatedQuantity
    let setCode = card.edition
    if (!card.isWishlist && 'cardId' in card) {
      const col = cardMap.get((card as any).cardId)
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

  const csv = buildMoxfieldCsv(csvCards)
  const filename = `${deck.value.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`
  downloadAsFile(csv, filename)
  toastStore.show(t('decks.detail.exportCsvDownloaded'), 'success')
}

onMounted(async () => {
  loading.value = true

  // Load collection first (needed for hydration)
  await collectionStore.loadCollection()

  if (!isNewDeck) {
    await decksStore.loadDeck(deckId)
  }

  loading.value = false
})
</script>

<template>
  <AppContainer>
    <div v-if="loading" class="flex justify-center py-16">
      <BaseLoader size="large" />
    </div>

    <div v-else-if="deck" class="space-y-8">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-silver-20">
        <div class="flex-1">
          <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">{{ t('decks.editor.title', { name: deck.name }) }}</h1>
          <p class="text-small text-silver-70">{{ deck.description }}</p>

          <!-- Completion indicator -->
          <div class="flex items-center gap-2 mt-2">
            <div class="w-32 h-2 bg-secondary border border-silver-30 overflow-hidden">
              <div
                  class="h-full bg-neon transition-300"
                  :style="{ width: `${completionPercent}%` }"
              />
            </div>
            <span class="text-tiny text-silver-70">{{ completionPercent }}% {{ t('decks.editor.complete') }}</span>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <BaseButton size="small" @click="handleSave">{{ t('decks.editor.save') }}</BaseButton>
          <BaseButton variant="secondary" size="small" @click="handleExport">{{ t('decks.detail.export') }}</BaseButton>
          <BaseButton variant="secondary" size="small" @click="handleExportCsv">CSV</BaseButton>
          <BaseButton variant="secondary" size="small" @click="handleBack">{{ t('decks.editor.back') }}</BaseButton>
        </div>
      </div>

      <!-- Stats -->
      <div class="bg-secondary border border-silver-30 p-4 md:p-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p class="text-tiny text-silver-70 mb-1">{{ t('decks.editor.stats.format') }}</p>
            <p class="text-body font-bold text-silver uppercase">{{ deck.format }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70 mb-1">{{ t('decks.editor.stats.cards') }}</p>
            <p class="text-body font-bold text-neon">{{ deck.stats.totalCards }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70 mb-1">{{ t('decks.editor.stats.inCollection') }}</p>
            <p class="text-body font-bold text-neon">{{ deck.stats.ownedCards }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70 mb-1">{{ t('decks.editor.stats.wishlist') }}</p>
            <p class="text-body font-bold" :class="deck.stats.wishlistCards > 0 ? 'text-amber' : 'text-silver-50'">
              {{ deck.stats.wishlistCards }}
            </p>
          </div>
        </div>

        <!-- Colors -->
        <div class="mt-4 pt-4 border-t border-silver-20">
          <p class="text-tiny text-silver-70 mb-2">{{ t('decks.editor.colors') }}</p>
          <div class="flex gap-2">
            <span v-if="deck.colors.length === 0" class="text-small text-silver-70">{{ t('decks.editor.noColors') }}</span>
            <BaseBadge v-for="color in deck.colors" :key="color" variant="cambio">
              {{ color }}
            </BaseBadge>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-md border-b border-silver-20">
        <button
            @click="activeTab = 'mainboard'"
            :class="[
              'pb-md border-b-2 font-bold text-small md:text-body transition-fast',
              activeTab === 'mainboard'
                ? 'border-neon text-neon'
                : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          {{ t('decks.editor.sections.mainboard') }} ({{ mainboardCount }})
        </button>
        <button
            @click="activeTab = 'sideboard'"
            :class="[
              'pb-md border-b-2 font-bold text-small md:text-body transition-fast',
              activeTab === 'sideboard'
                ? 'border-neon text-neon'
                : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          {{ t('decks.editor.sections.sideboard') }} ({{ sideboardCount }})
        </button>
      </div>

      <!-- Add card button -->
      <BaseButton
          size="small"
          @click="showAddCardModal = true"
          class="w-full md:w-auto"
      >
        {{ t('decks.editor.addCard') }}
      </BaseButton>

      <!-- Filter bar -->
      <CardFilterBar
          v-model:filter-query="filterQuery"
          v-model:sort-by="sortBy"
          v-model:group-by="groupBy"
          v-model:selected-colors="selectedColors"
          v-model:selected-mana-values="selectedManaValues"
          v-model:selected-types="selectedTypes"
      />

      <!-- Cards Grid (Visual Editor) -->
      <DeckEditorGrid
          :cards="activeFilteredCards"
          :deck-id="deckId"
          :group-by="groupBy"
          :sort-by="sortBy"
          :selected-colors="selectedColors"
          :selected-mana-values="selectedManaValues"
          :selected-types="selectedTypes"
          @edit="handleEditCard"
          @remove="handleRemoveCard"
          @update-quantity="handleUpdateQuantity"
          @add-to-wishlist="handleAddToWishlistFromGrid"
      />

      <!-- Add card modal -->
      <AddCardToDeckModal
          :show="showAddCardModal"
          :deck-id="deckId"
          :is-sideboard="activeTab === 'sideboard'"
          @close="showAddCardModal = false"
          @add="handleAddCard"
      />

      <!-- Edit card modal -->
      <EditDeckCardModal
          :show="showEditCardModal"
          :card="editingCard"
          :deck-id="deckId"
          @close="showEditCardModal = false; editingCard = null"
          @save="handleSaveEditedCard"
      />
    </div>

    <div v-else class="text-center py-16">
      <p class="text-body text-silver-70 mb-4">{{ t('decks.editor.messages.notFound') }}</p>
      <BaseButton @click="handleBack">{{ t('decks.detail.backToDecks') }}</BaseButton>
    </div>
  </AppContainer>
</template>
