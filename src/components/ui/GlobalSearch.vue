<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCollectionStore } from '../../stores/collection'
import { useI18n } from '../../composables/useI18n'
import { searchCards } from '../../services/scryfall'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuthStore } from '../../stores/auth'
import SvgIcon from './SvgIcon.vue'
import ManaCost from './ManaCost.vue'
import { getAvatarUrlForUser } from '../../utils/avatar'

const router = useRouter()
const collectionStore = useCollectionStore()
const authStore = useAuthStore()
const { t } = useI18n()

const searchQuery = ref('')
const isOpen = ref(false)
const loading = ref(false)
const activeTab = ref<'collection' | 'users' | 'scryfall'>('collection')

// Results
const collectionResults = ref<any[]>([])
const usersResults = ref<any[]>([])
const scryfallResults = ref<any[]>([])

const inputRef = ref<HTMLInputElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const handleInput = () => {
  if (searchTimeout) clearTimeout(searchTimeout)

  if (searchQuery.value.length < 2) {
    clearResults()
    return
  }

  searchTimeout = setTimeout(() => {
    performSearch()
  }, 300)
}

const clearResults = () => {
  collectionResults.value = []
  usersResults.value = []
  scryfallResults.value = []
}

const performSearch = async () => {
  if (searchQuery.value.length < 2) return

  loading.value = true
  isOpen.value = true

  const query = searchQuery.value.toLowerCase()

  try {
    // Search in parallel
    await Promise.all([
      searchCollection(query),
      searchUsers(query),
      searchScryfall(query)
    ])

    // Auto-select first tab with results
    if (collectionResults.value.length > 0) {
      activeTab.value = 'collection'
    } else if (usersResults.value.length > 0) {
      activeTab.value = 'users'
    } else if (scryfallResults.value.length > 0) {
      activeTab.value = 'scryfall'
    }
  } finally {
    loading.value = false
  }
}

const searchCollection = async (query: string) => {
  // Search in local collection
  collectionResults.value = collectionStore.cards
    .filter(card => card.name.toLowerCase().includes(query))
    .slice(0, 8)
}

const searchUsers = async (searchQuery: string) => {
  if (!authStore.user) return

  try {
    // Search public_cards collection
    const publicCardsRef = collection(db, 'public_cards')
    const snapshot = await getDocs(publicCardsRef)

    usersResults.value = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((card: any) =>
        card.cardName?.toLowerCase().includes(searchQuery) &&
        card.userId !== authStore.user?.id
      )
      .slice(0, 8)
  } catch (error) {
    console.error('Error searching users:', error)
    usersResults.value = []
  }
}

const searchScryfall = async (query: string) => {
  try {
    const results = await searchCards(query)
    scryfallResults.value = results.slice(0, 8)
  } catch (error) {
    scryfallResults.value = []
  }
}

const totalResults = computed(() =>
  collectionResults.value.length + usersResults.value.length + scryfallResults.value.length
)

const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    isOpen.value = false
    inputRef.value?.blur()
  }
}

// Clear search
const clearSearch = () => {
  searchQuery.value = ''
  clearResults()
  isOpen.value = false
  inputRef.value?.focus()
}

// Navigation
const goToCollection = (card: any) => {
  isOpen.value = false
  searchQuery.value = ''
  router.push({ path: '/collection', query: { search: card.name } })
}

const goToUserCard = (card: any) => {
  isOpen.value = false
  searchQuery.value = ''
  router.push(`/@${card.username}`)
}

const goToScryfall = (card: any) => {
  isOpen.value = false
  searchQuery.value = ''
  // Navigate to collection with the card name to add it
  router.push({ path: '/collection', query: { addCard: card.name } })
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})

// Expose focus method for keyboard shortcut
defineExpose({
  focus: () => inputRef.value?.focus()
})
</script>

<template>
  <div ref="containerRef" class="relative">
    <!-- Search Input -->
    <div class="relative">
      <SvgIcon
        name="search"
        size="small"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-silver-50 pointer-events-none"
      />
      <input
        ref="inputRef"
        v-model="searchQuery"
        type="text"
        :placeholder="t('header.search.placeholder')"
        class="w-56 lg:w-72 bg-primary border border-silver-30 pl-12 pr-8 py-2 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none rounded transition-all"
        @input="handleInput"
        @focus="searchQuery.length >= 2 && (isOpen = true)"
      />
      <!-- Clear button (shows when there's text) -->
      <button
        v-if="searchQuery.length > 0"
        @click.stop="clearSearch"
        class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-silver-20"
        type="button"
      >
        ✕
      </button>
      <!-- Keyboard hint (shows when no text) -->
      <span
        v-else
        class="absolute right-3 top-1/2 -translate-y-1/2 text-tiny text-silver-50 hidden lg:inline pointer-events-none"
      >
        /
      </span>
    </div>

    <!-- Results Dropdown -->
    <div
      v-if="isOpen && (loading || totalResults > 0)"
      class="absolute top-full left-0 right-0 mt-2 bg-primary border border-silver-30 rounded shadow-lg max-h-[70vh] overflow-hidden z-50"
    >
      <!-- Tabs -->
      <div class="flex border-b border-silver-20">
        <button
          @click="activeTab = 'collection'"
          :class="[
            'flex-1 px-3 py-2 text-tiny font-bold transition-colors',
            activeTab === 'collection' ? 'text-neon border-b-2 border-neon' : 'text-silver-50 hover:text-silver'
          ]"
        >
          {{ t('header.search.tabs.collection') }} ({{ collectionResults.length }})
        </button>
        <button
          @click="activeTab = 'users'"
          :class="[
            'flex-1 px-3 py-2 text-tiny font-bold transition-colors',
            activeTab === 'users' ? 'text-neon border-b-2 border-neon' : 'text-silver-50 hover:text-silver'
          ]"
        >
          {{ t('header.search.tabs.users') }} ({{ usersResults.length }})
        </button>
        <button
          @click="activeTab = 'scryfall'"
          :class="[
            'flex-1 px-3 py-2 text-tiny font-bold transition-colors',
            activeTab === 'scryfall' ? 'text-neon border-b-2 border-neon' : 'text-silver-50 hover:text-silver'
          ]"
        >
          {{ t('header.search.tabs.scryfall') }} ({{ scryfallResults.length }})
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="p-4 text-center">
        <span class="text-small text-silver-50">{{ t('common.actions.loading') }}...</span>
      </div>

      <!-- Results -->
      <div v-else class="max-h-80 overflow-y-auto">
        <!-- Collection Results -->
        <div v-if="activeTab === 'collection'">
          <div v-if="collectionResults.length === 0" class="p-4 text-center text-small text-silver-50">
            {{ t('header.search.noResults') }}
          </div>
          <button
            v-for="card in collectionResults"
            :key="card.id"
            @click="goToCollection(card)"
            class="w-full px-4 py-3 flex items-center gap-3 hover:bg-silver-10 transition-colors text-left border-b border-silver-20 last:border-0"
          >
            <img
              v-if="card.image"
              :src="card.image"
              :alt="card.name"
              class="w-10 h-14 object-cover rounded"
            />
            <div class="flex-1 min-w-0">
              <p class="text-small font-bold text-silver truncate">{{ card.name }}</p>
              <p class="text-tiny text-silver-50">{{ card.edition }} · x{{ card.quantity }}</p>
            </div>
            <span class="text-tiny text-neon font-bold">${{ card.price?.toFixed(2) || 'N/A' }}</span>
          </button>
        </div>

        <!-- Users Results -->
        <div v-if="activeTab === 'users'">
          <div v-if="usersResults.length === 0" class="p-4 text-center text-small text-silver-50">
            {{ t('header.search.noResults') }}
          </div>
          <button
            v-for="card in usersResults"
            :key="card.id"
            @click="goToUserCard(card)"
            class="w-full px-4 py-3 flex items-center gap-3 hover:bg-silver-10 transition-colors text-left border-b border-silver-20 last:border-0"
          >
            <img
              v-if="card.image"
              :src="card.image"
              :alt="card.cardName"
              class="w-10 h-14 object-cover rounded"
            />
            <div class="flex-1 min-w-0">
              <p class="text-small font-bold text-silver truncate">{{ card.cardName }}</p>
              <p class="text-tiny text-silver-50 flex items-center gap-1">
                <img
                  :src="getAvatarUrlForUser(card.username, 14, card.avatarUrl)"
                  class="w-3.5 h-3.5 rounded-full"
                />
                @{{ card.username }} · {{ card.status }}
              </p>
            </div>
            <span class="text-tiny text-neon font-bold">${{ card.price?.toFixed(2) || 'N/A' }}</span>
          </button>
        </div>

        <!-- Scryfall Results -->
        <div v-if="activeTab === 'scryfall'">
          <div v-if="scryfallResults.length === 0" class="p-4 text-center text-small text-silver-50">
            {{ t('header.search.noResults') }}
          </div>
          <button
            v-for="card in scryfallResults"
            :key="card.id"
            @click="goToScryfall(card)"
            class="w-full px-4 py-3 flex items-center gap-3 hover:bg-silver-10 transition-colors text-left border-b border-silver-20 last:border-0"
          >
            <img
              v-if="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
              :src="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
              :alt="card.name"
              class="w-10 h-14 object-cover rounded"
            />
            <div class="flex-1 min-w-0">
              <p class="text-small font-bold text-silver truncate">{{ card.name }}</p>
              <div class="flex items-center gap-2">
                <ManaCost v-if="card.mana_cost" :cost="card.mana_cost" size="tiny" />
                <span class="text-tiny text-silver-50">{{ card.set_name }}</span>
              </div>
            </div>
            <span class="text-tiny text-neon">+ {{ t('header.search.addToCollection') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
