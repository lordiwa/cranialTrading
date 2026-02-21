<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCollectionStore } from '../stores/collection'
import { useSearchStore } from '../stores/search'
import { useI18n } from '../composables/useI18n'
import AddCardModal from '../components/collection/AddCardModal.vue'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import FilterPanel from '../components/search/FilterPanel.vue'
import SearchResultCard from '../components/search/SearchResultCard.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'

const router = useRouter()
const collectionStore = useCollectionStore()
const searchStore = useSearchStore()
const { t } = useI18n()

const selectedScryfallCard = ref<any>(null)
const showAddCardModal = ref(false)

const getOwnedCount = (scryfallCard: any): number => {
  const cardName = scryfallCard.name?.toLowerCase()
  if (!cardName) return 0
  return collectionStore.cards
    .filter(c => c.name.toLowerCase() === cardName)
    .reduce((sum, c) => sum + c.quantity, 0)
}

const handleCardSelected = (card: any) => {
  selectedScryfallCard.value = card
  showAddCardModal.value = true
}

const handleBack = () => {
  router.push({ path: '/collection' })
}
</script>

<template>
  <AppContainer>
    <div class="mb-4 flex items-center gap-3">
      <BaseButton variant="secondary" size="small" @click="handleBack">
        <SvgIcon name="back" size="tiny" />
        {{ t('search.view.backToCollection') }}
      </BaseButton>
      <h1 class="text-h3 font-bold text-neon">{{ t('search.view.title') }}</h1>
    </div>

    <FilterPanel />

    <div v-if="searchStore.hasResults" class="mt-6 space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-small text-silver-70">
          {{ t('collection.searchResults.subtitle', { count: searchStore.totalResults }) }}
        </p>
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

    <AddCardModal
      :show="showAddCardModal"
      :scryfall-card="selectedScryfallCard"
      @close="showAddCardModal = false; selectedScryfallCard = null"
      @added="showAddCardModal = false; selectedScryfallCard = null"
    />
  </AppContainer>
</template>
