<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useCollectionStore } from '../stores/collection'
import { type FilterOptions, useSearchStore } from '../stores/search'
import { useI18n } from '../composables/useI18n'
import { useSendInterest } from '../composables/useSendInterest'
import type { ScryfallCard } from '../services/scryfall'
import { type PublicCardResult, searchPublicCards } from '../services/publicCardSearch'
import { filterCollectionByTerm } from '../utils/searchSections'
import { buildOwnedCountMap } from '../utils/ownedCount'
import { getAvatarUrlForUser } from '../utils/avatar'
import { PER_PAGE_OPTIONS, type SearchPerPage } from '../utils/searchPagination'
import type { SearchSortOption } from '../utils/searchSort'
import { buildSearchQueryUpdate } from '../utils/searchUrlSync'
import AddCardModal from '../components/collection/AddCardModal.vue'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import FilterPanel from '../components/search/FilterPanel.vue'
import IconV2 from '../components/ui/IconV2.vue'
import SearchResultCard from '../components/search/SearchResultCard.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const collectionStore = useCollectionStore()
const searchStore = useSearchStore()
const { t, locale } = useI18n()
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

// FilterPanel's own name input/button/suggestion (TASK-111): a locally-committed
// search must update ?q= so the URL and the collection/other-users sections react
// to the latest term too — not just the Scryfall catalog. router.replace (not push)
// keeps the header→/search?q= deep-link and browser back/forward behavior intact.
const handleLocalSearch = (filters: FilterOptions) => {
  const update = buildSearchQueryUpdate(route.query, filters.name ?? '')
  if (update) void router.replace({ query: update })
}

// Sort/per-page toolbar (TASK-108, Scryfall catalog only)
const handleSortChange = (e: Event) => {
  const value = (e.target as HTMLSelectElement).value
  searchStore.setSort(value ? (value as SearchSortOption) : undefined)
}

const handlePerPageChange = (e: Event) => {
  const value = Number((e.target as HTMLSelectElement).value) as SearchPerPage
  searchStore.setPerPage(value)
}

// Same locale-aware thousands-grouping pattern as CollectionView's heroCollectionValue
const intlLocaleMap: Record<string, string> = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' }
const formatCount = (n: number): string => {
  const intlLocale = intlLocaleMap[locale.value] ?? 'es-AR'
  return new Intl.NumberFormat(intlLocale).format(n)
}
</script>

<template>
  <AppContainer>
    <!-- Page header -->
    <div class="mb-6">
      <button
          type="button"
          class="inline-flex items-center gap-1.5 text-silver-50 hover:text-neon text-small font-semibold transition-colors duration-200 ease-v2 mb-3"
          @click="handleBack"
      >
        <IconV2 name="chev-l" :size="16" />
        {{ t('search.view.backToCollection') }}
      </button>
      <p class="text-tiny font-bold uppercase tracking-[.18em] text-neon mb-1">{{ t('search.view.kicker') }}</p>
      <h1 class="font-display text-h1 font-bold text-silver tracking-[-0.02em]">{{ t('search.view.title') }}</h1>
    </div>

    <!-- syncWithRouter off: SearchView owns the ?q= param and feeds it reactively
         via externalName, so in-place navigations (header search while already on
         /search) re-trigger the catalog search — onMounted alone misses them. -->
    <FilterPanel :sync-with-router="false" :external-name="searchTerm" @search="handleLocalSearch" />

    <!-- In your collection -->
    <section v-if="collectionMatches.length > 0" class="mt-8">
      <div class="flex items-baseline gap-2.5 mb-3">
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('search.view.inCollectionTitle') }}</h2>
        <span class="text-tiny font-display font-tnum text-silver-30 font-semibold">{{ collectionMatches.length }}</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        <RouterLink
          v-for="card in collectionMatches"
          :key="card.id"
          :to="{ path: '/collection', query: { search: card.name } }"
          class="flex flex-col gap-2 bg-surface-1 border border-line rounded-lg p-3 transition-all duration-200 ease-v2 hover:bg-surface-2 hover:border-line-strong hover:-translate-y-0.5 hover:shadow-medium group focus-visible:outline-none focus-visible:shadow-glow-neon"
        >
          <div class="relative aspect-[63/88] rounded-md overflow-hidden border border-line">
            <img
              v-if="card.image"
              :src="card.image"
              :alt="card.name"
              loading="lazy"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full bg-surface-2"></div>
          </div>
          <p translate="no" class="text-small font-semibold text-silver leading-tight truncate group-hover:text-neon transition-colors duration-200 ease-v2">{{ card.name }}</p>
          <p class="text-tiny text-silver-50">{{ card.edition }} · x{{ card.quantity }}</p>
          <p class="font-display font-tnum text-small font-bold text-neon mt-auto">${{ card.price?.toFixed(2) ?? 'N/A' }}</p>
          <span class="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-md border border-line-strong text-silver-70 text-tiny font-bold uppercase tracking-[.06em] transition-all duration-200 ease-v2 group-hover:border-silver-30 group-hover:text-silver">
            <IconV2 name="eye" :size="15" />
            {{ t('search.view.viewInCollection') }}
          </span>
        </RouterLink>
      </div>
    </section>

    <!-- Other users -->
    <section v-if="searchTerm.length >= 2 && (loadingPublic || publicMatches.length > 0)" class="mt-8">
      <div class="flex items-baseline gap-2.5 mb-3">
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('search.view.otherUsersTitle') }}</h2>
        <span class="text-tiny font-display font-tnum text-silver-30 font-semibold">{{ publicMatches.length }}</span>
      </div>
      <div v-if="loadingPublic" class="p-4 text-center">
        <span class="text-small text-silver-50">{{ t('common.actions.loading') }}...</span>
      </div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        <div
          v-for="card in publicMatches"
          :key="card.id"
          class="flex flex-col gap-2 bg-surface-1 border border-line rounded-lg p-3 transition-all duration-200 ease-v2 hover:bg-surface-2 hover:border-line-strong"
        >
          <RouterLink
            :to="`/@${card.username ?? ''}`"
            class="relative aspect-[63/88] block rounded-md overflow-hidden border border-line focus-visible:outline-none focus-visible:shadow-glow-neon"
          >
            <img
              v-if="card.image"
              :src="card.image"
              :alt="card.cardName"
              loading="lazy"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full bg-surface-2"></div>
          </RouterLink>
          <RouterLink :to="`/@${card.username ?? ''}`" class="min-w-0 focus-visible:outline-none focus-visible:shadow-glow-neon rounded">
            <p translate="no" class="text-small font-semibold text-silver leading-tight truncate hover:text-neon transition-colors duration-200 ease-v2">{{ card.cardName }}</p>
            <p class="text-tiny text-silver-50 flex items-center gap-1.5 mt-0.5">
              <img
                :src="getAvatarUrlForUser(card.username ?? '', 14, card.avatarUrl)"
                :alt="`${card.username} avatar`"
                width="14"
                height="14"
                class="w-3.5 h-3.5 rounded-full flex-shrink-0"
              />
              <span class="truncate">@{{ card.username }} · {{ card.status }}</span>
            </p>
          </RouterLink>
          <p class="font-display font-tnum text-small font-bold text-neon mt-auto">${{ card.price?.toFixed(2) ?? 'N/A' }}</p>
          <button
            v-if="!sentInterestIds.has(card.id)"
            type="button"
            :disabled="sendingInterest"
            class="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-md border border-neon bg-neon-10 text-neon text-tiny font-bold uppercase tracking-[.06em] transition-all duration-200 ease-v2 hover:bg-neon-15 hover:shadow-glow-neon disabled:opacity-50"
            @click="sendInterestFromSearch(card)"
          >
            <IconV2 name="star" :size="15" />
            {{ t('dashboard.searchOthers.interested') }}
          </button>
          <span v-else class="w-full min-h-[40px] inline-flex items-center justify-center rounded-md border border-line text-silver-30 text-tiny font-bold uppercase tracking-[.06em]">
            {{ t('dashboard.searchOthers.sent') }}
          </span>
        </div>
      </div>
    </section>

    <!-- Scryfall catalog -->
    <div v-if="searchStore.hasResults" class="mt-8 space-y-4">
      <div class="flex items-baseline gap-2.5">
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('search.view.catalogTitle') }}</h2>
        <span class="text-tiny font-display font-tnum text-silver-30 font-semibold">{{ formatCount(searchStore.totalCards) }} · Scryfall</span>
      </div>

      <!-- Toolbar: results range (left) + sort/per-page (right) -->
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <p class="text-small text-silver-70 font-tnum">
          {{ t('search.view.toolbar.resultsRange', {
            from: formatCount(searchStore.range.from),
            to: formatCount(searchStore.range.to),
            total: formatCount(searchStore.range.total),
          }) }}
        </p>
        <div class="flex items-center gap-2 flex-wrap">
          <label class="flex items-center gap-1.5">
            <span class="text-tiny text-silver-50 uppercase tracking-[.06em]">{{ t('search.view.toolbar.sortLabel') }}</span>
            <select
                data-testid="search-sort"
                :value="searchStore.sort ?? ''"
                class="appearance-none bg-surface-1 border border-line text-silver text-tiny font-bold px-3 py-2 pr-8 min-h-[36px] rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
                @change="handleSortChange"
            >
              <option value="">{{ t('search.view.toolbar.sortDefault') }}</option>
              <option value="popular">{{ t('search.view.toolbar.sortPopular') }}</option>
              <option value="name">{{ t('search.view.toolbar.sortName') }}</option>
              <option value="price-asc">{{ t('search.view.toolbar.sortPriceAsc') }}</option>
              <option value="price-desc">{{ t('search.view.toolbar.sortPriceDesc') }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1.5">
            <span class="text-tiny text-silver-50 uppercase tracking-[.06em]">{{ t('search.view.toolbar.perPageLabel') }}</span>
            <select
                data-testid="search-per-page"
                :value="searchStore.perPage"
                class="appearance-none bg-surface-1 border border-line text-silver text-tiny font-bold px-3 py-2 pr-8 min-h-[36px] rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
                @change="handlePerPageChange"
            >
              <option v-for="opt in PER_PAGE_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </label>
          <BaseButton size="small" variant="secondary" class="uppercase tracking-[.1em] !text-[12px]" @click="searchStore.clearSearch()">
            {{ t('collection.searchResults.back') }}
          </BaseButton>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        <SearchResultCard
          v-for="card in searchStore.pagedResults"
          :key="card.id"
          :card="card"
          :owned-count="getOwnedCount(card)"
          @click="handleCardSelected(card)"
        />
      </div>

      <!-- Local pagination over the already-loaded Scryfall page -->
      <div v-if="searchStore.totalPages > 1" class="flex items-center justify-center gap-4 pt-2">
        <button
            type="button"
            :disabled="searchStore.page <= 1"
            :aria-label="t('search.view.toolbar.prevPage')"
            class="w-9 h-9 flex items-center justify-center rounded-md border border-line text-silver-70 transition-all duration-200 ease-v2 hover:border-line-strong hover:text-silver disabled:opacity-30 disabled:pointer-events-none"
            @click="searchStore.prevPage()"
        >
          <IconV2 name="chev-l" :size="16" />
        </button>
        <span class="text-tiny font-tnum text-silver-50">
          {{ t('search.view.toolbar.pageIndicator', { page: searchStore.page, totalPages: searchStore.totalPages }) }}
        </span>
        <button
            type="button"
            :disabled="searchStore.page >= searchStore.totalPages"
            :aria-label="t('search.view.toolbar.nextPage')"
            class="w-9 h-9 flex items-center justify-center rounded-md border border-line text-silver-70 transition-all duration-200 ease-v2 hover:border-line-strong hover:text-silver disabled:opacity-30 disabled:pointer-events-none"
            @click="searchStore.nextPage()"
        >
          <IconV2 name="chev-r" :size="16" />
        </button>
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
