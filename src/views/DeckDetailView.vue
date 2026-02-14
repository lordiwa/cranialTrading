<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDecksStore } from '../stores/decks'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { useI18n } from '../composables/useI18n'
import { useCardFilter } from '../composables/useCardFilter'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseBadge from '../components/ui/BaseBadge.vue'
import CardFilterBar from '../components/ui/CardFilterBar.vue'
import DeckCardsList from '../components/decks/DeckCardsList.vue'
import DeckCompletionCheck from '../components/decks/DeckCompletionCheck.vue'
import { buildMoxfieldCsv, downloadAsFile } from '../utils/cardHelpers'

const router = useRouter()
const route = useRoute()
const decksStore = useDecksStore()
const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const { t } = useI18n()

const activeTab = ref<'mainboard' | 'sideboard' | 'stats'>('mainboard')
const loading = ref(false)

const deckId = route.params.deckId as string

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
    activeTab.value === 'mainboard' ? mainboardCards.value :
    activeTab.value === 'sideboard' ? sideboardCards.value : []
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
const getCardQuantity = (card: typeof allCards.value[number]): number => {
  if (card.isWishlist) {
    return card.requestedQuantity
  }
  return (card as any).allocatedQuantity
}

// Card counts
const mainboardCount = computed(() =>
    mainboardCards.value.reduce((sum, c) => sum + getCardQuantity(c), 0)
)

const sideboardCount = computed(() =>
    sideboardCards.value.reduce((sum, c) => sum + getCardQuantity(c), 0)
)

const formatLabel = computed(() => {
  const labels: Record<string, string> = {
    vintage: 'VINTAGE',
    modern: 'MODERN',
    commander: 'COMMANDER',
    standard: 'STANDARD',
    custom: 'CUSTOM',
  }
  return labels[deck.value?.format || 'custom'] || 'CUSTOM'
})

const handleEdit = () => {
  router.push(`/decks/${deckId}/edit`)
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

  const getSet = (card: typeof allCards.value[number]): string => {
    if (!card.isWishlist) {
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

  const csvCards: Parameters<typeof buildMoxfieldCsv>[0] = []

  for (const card of allCards.value) {
    const qty = card.isWishlist ? card.requestedQuantity : (card as any).allocatedQuantity
    let setCode = card.edition
    if (!card.isWishlist) {
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
  await collectionStore.loadCollection()
  await decksStore.loadDeck(deckId)
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
          <div class="flex items-center gap-3 mb-2">
            <h1 class="text-h2 md:text-h1 font-bold text-silver">{{ deck.name }}</h1>
            <BaseBadge variant="busco">{{ formatLabel }}</BaseBadge>
          </div>
          <p class="text-small text-silver-70">{{ deck.description }}</p>
          <p class="text-tiny text-silver-50 mt-2">
            {{ t('decks.detail.updated') }} {{ deck.updatedAt.toLocaleDateString() }}
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <BaseButton size="small" @click="handleEdit">{{ t('decks.detail.edit') }}</BaseButton>
          <BaseButton variant="secondary" size="small" @click="handleExport">{{ t('decks.detail.export') }}</BaseButton>
          <BaseButton variant="secondary" size="small" @click="handleExportCsv">CSV</BaseButton>
          <BaseButton variant="secondary" size="small" @click="handleBack">{{ t('decks.detail.back') }}</BaseButton>
        </div>
      </div>

      <!-- Stats bar -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-primary border border-silver-30 p-4">
          <p class="text-tiny text-silver-70">{{ t('decks.detail.stats.total') }}</p>
          <p class="text-h3 font-bold text-neon">{{ deck.stats.totalCards }}</p>
        </div>
        <div class="bg-primary border border-silver-30 p-4">
          <p class="text-tiny text-silver-70">{{ t('decks.detail.stats.inCollection') }}</p>
          <p class="text-h3 font-bold text-neon">{{ deck.stats.ownedCards }}</p>
        </div>
        <div class="bg-primary border border-silver-30 p-4">
          <p class="text-tiny text-silver-70">{{ t('decks.detail.stats.wishlist') }}</p>
          <p class="text-h3 font-bold" :class="deck.stats.wishlistCards > 0 ? 'text-amber' : 'text-silver-50'">
            {{ deck.stats.wishlistCards }}
          </p>
        </div>
        <div class="bg-primary border border-silver-30 p-4">
          <p class="text-tiny text-silver-70">{{ t('decks.detail.stats.totalCost') }}</p>
          <p class="text-h3 font-bold text-neon">${{ deck.stats.totalPrice.toFixed(2) }}</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-sm md:gap-md border-b border-silver-20">
        <button
            @click="activeTab = 'mainboard'"
            :class="[
              'pb-md border-b-2 font-bold text-small md:text-body transition-fast',
              activeTab === 'mainboard'
                ? 'border-neon text-neon'
                : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          {{ t('decks.detail.sections.mainboard') }} ({{ mainboardCount }})
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
          {{ t('decks.detail.sections.sideboard') }} ({{ sideboardCount }})
        </button>
        <button
            @click="activeTab = 'stats'"
            :class="[
              'pb-md border-b-2 font-bold text-small md:text-body transition-fast',
              activeTab === 'stats'
                ? 'border-neon text-neon'
                : 'border-transparent text-silver-70 hover:text-silver'
            ]"
        >
          {{ t('decks.detail.sections.stats') }}
        </button>
      </div>

      <!-- Filter bar (only for mainboard/sideboard tabs) -->
      <CardFilterBar
          v-if="activeTab !== 'stats'"
          v-model:filter-query="filterQuery"
          v-model:sort-by="sortBy"
          v-model:group-by="groupBy"
          v-model:selected-colors="selectedColors"
          v-model:selected-mana-values="selectedManaValues"
          v-model:selected-types="selectedTypes"
      />

      <!-- Content -->
      <div>
        <!-- Mainboard -->
        <DeckCardsList
            v-if="activeTab === 'mainboard'"
            :cards="activeFilteredCards"
            :deck-id="deckId"
            title="MAINBOARD"
        />

        <!-- Sideboard -->
        <DeckCardsList
            v-else-if="activeTab === 'sideboard'"
            :cards="activeFilteredCards"
            :deck-id="deckId"
            title="SIDEBOARD"
        />

        <!-- Stats -->
        <DeckCompletionCheck
            v-else-if="activeTab === 'stats'"
            :deck="deck"
            :collection="collectionStore.cards"
        />
      </div>
    </div>

    <div v-else class="text-center py-16">
      <p class="text-body text-silver-70 mb-4">{{ t('decks.detail.notFound') }}</p>
      <BaseButton @click="handleBack">{{ t('decks.detail.backToDecks') }}</BaseButton>
    </div>
  </AppContainer>
</template>
