<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useCollectionStore } from '../stores/collection'
import { useSearchStore } from '../stores/search'
import { useI18n } from '../composables/useI18n'
import { useSendInterest } from '../composables/useSendInterest'
import type { ScryfallCard } from '../services/scryfall'
import { type PublicCardResult, searchPublicCards } from '../services/publicCardSearch'
import { filterCollectionByTerm } from '../utils/searchSections'
import { buildOwnedCountMap } from '../utils/ownedCount'
import { getAvatarUrlForUser } from '../utils/avatar'
import AddCardModal from '../components/collection/AddCardModal.vue'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import FilterPanel from '../components/search/FilterPanel.vue'
import SearchResultCard from '../components/search/SearchResultCard.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const collectionStore = useCollectionStore()
const searchStore = useSearchStore()
const { t } = useI18n()
const { sendInterestFromSearch, sendingInterest, sentInterestIds } = useSendInterest()

const selectedScryfallCard = ref<ScryfallCard | undefined>(undefined)
const showAddCardModal = ref(false)

// Term driving the collection/users sections — the ?q= the header navigated with.
// FilterPanel refinements only affect the Scryfall catalog section.
const searchTerm = computed(() => {
  const q = route.query.q
  return typeof q === 'string' ? q.trim() : ''
})

// ── "In your collection" section (in-memory, no network) ────────────────────
const collectionMatches = computed(() =>
  filterCollectionByTerm(collectionStore.cards, searchTerm.value)
)

// ── "Other users" section (single capped Firestore query per term) ──────────
const publicMatches = ref<PublicCardResult[]>([])
const loadingPublic = ref(false)

const loadPublicMatches = async () => {
  if (searchTerm.value.length < 2) {
    publicMatches.value = []
    return
  }
  loadingPublic.value = true
  try {
    publicMatches.value = await searchPublicCards(searchTerm.value, authStore.user?.id ?? null)
  } finally {
    loadingPublic.value = false
  }
}

watch(searchTerm, () => {
  void loadPublicMatches()
})

onMounted(() => {
  if (authStore.user && !collectionStore.cards.length) void collectionStore.loadCollection()
  void loadPublicMatches()
})

const ownedCountByName = computed(() => buildOwnedCountMap(collectionStore.cards))

const getOwnedCount = (scryfallCard: ScryfallCard): number => {
  const cardName = scryfallCard.name?.toLowerCase()
  if (!cardName) return 0
  return ownedCountByName.value.get(cardName) ?? 0
}

const handleCardSelected = (card: ScryfallCard) => {
  selectedScryfallCard.value = card
  showAddCardModal.value = true
}

const handleBack = () => {
  void router.push({ path: '/collection' })
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

    <!-- syncWithRouter off: SearchView owns the ?q= param and feeds it reactively
         via externalName, so in-place navigations (header search while already on
         /search) re-trigger the catalog search — onMounted alone misses them. -->
    <FilterPanel :sync-with-router="false" :external-name="searchTerm" />

    <!-- In your collection -->
    <section v-if="collectionMatches.length > 0" class="mt-6">
      <h2 class="text-h4 font-bold text-silver mb-3">
        {{ t('search.view.inCollectionTitle') }} ({{ collectionMatches.length }})
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <RouterLink
          v-for="card in collectionMatches"
          :key="card.id"
          :to="{ path: '/collection', query: { search: card.name } }"
          class="px-4 py-3 flex items-center gap-3 bg-primary border border-silver-20 hover:border-neon transition-colors rounded"
        >
          <img
            v-if="card.image"
            :src="card.image"
            :alt="card.name"
            loading="lazy"
            width="40"
            height="56"
            class="w-10 h-14 object-cover rounded flex-shrink-0"
          />
          <div class="flex-1 min-w-0">
            <p translate="no" class="text-small font-bold text-silver truncate">{{ card.name }}</p>
            <p class="text-tiny text-silver-50">{{ card.edition }} · x{{ card.quantity }}</p>
          </div>
          <span class="text-tiny text-neon font-bold">${{ card.price?.toFixed(2) ?? 'N/A' }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- Other users -->
    <section v-if="searchTerm.length >= 2 && (loadingPublic || publicMatches.length > 0)" class="mt-6">
      <h2 class="text-h4 font-bold text-silver mb-3">
        {{ t('search.view.otherUsersTitle') }} ({{ publicMatches.length }})
      </h2>
      <div v-if="loadingPublic" class="p-4 text-center">
        <span class="text-small text-silver-50">{{ t('common.actions.loading') }}...</span>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div
          v-for="card in publicMatches"
          :key="card.id"
          class="px-4 py-3 flex items-center gap-3 bg-primary border border-silver-20 rounded"
        >
          <RouterLink
            :to="`/@${card.username ?? ''}`"
            class="flex-1 min-w-0 flex items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-neon focus-visible:outline-none rounded"
          >
            <img
              v-if="card.image"
              :src="card.image"
              :alt="card.cardName"
              loading="lazy"
              width="40"
              height="56"
              class="w-10 h-14 object-cover rounded flex-shrink-0"
            />
            <div class="min-w-0">
              <p translate="no" class="text-small font-bold text-silver truncate">{{ card.cardName }}</p>
              <p class="text-tiny text-silver-50 flex items-center gap-1">
                <img
                  :src="getAvatarUrlForUser(card.username ?? '', 14, card.avatarUrl)"
                  :alt="`${card.username} avatar`"
                  width="14"
                  height="14"
                  class="w-3.5 h-3.5 rounded-full"
                />
                @{{ card.username }} · {{ card.status }}
              </p>
            </div>
          </RouterLink>
          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <span class="text-tiny text-neon font-bold">${{ card.price?.toFixed(2) ?? 'N/A' }}</span>
            <button
              v-if="!sentInterestIds.has(card.id)"
              @click="sendInterestFromSearch(card)"
              :disabled="sendingInterest"
              class="px-2 py-0.5 bg-neon-10 border border-neon text-neon text-[14px] font-bold hover:bg-neon-20 transition-all rounded whitespace-nowrap"
            >
              {{ t('dashboard.searchOthers.interested') }}
            </button>
            <span v-else class="text-[14px] text-silver-50 whitespace-nowrap">{{ t('dashboard.searchOthers.sent') }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Scryfall catalog -->
    <div v-if="searchStore.hasResults" class="mt-6 space-y-4">
      <h2 class="text-h4 font-bold text-silver">{{ t('search.view.catalogTitle') }}</h2>
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
      @close="showAddCardModal = false; selectedScryfallCard = undefined"
      @added="showAddCardModal = false; selectedScryfallCard = undefined"
    />
  </AppContainer>
</template>
