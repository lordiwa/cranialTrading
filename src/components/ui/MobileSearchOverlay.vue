<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { useGlobalSearch } from '../../composables/useGlobalSearch'
import { getAvatarUrlForUser } from '../../utils/avatar'
import SvgIcon from './SvgIcon.vue'
import ManaCost from './ManaCost.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const router = useRouter()
const { t } = useI18n()

const {
  searchQuery,
  loading,
  activeTab,
  collectionResults,
  usersResults,
  scryfallResults,
  handleInput,
  clearSearch,
  totalResults,
  goToCollection: _goToCollection,
  goToUserCard: _goToUserCard,
  goToScryfall: _goToScryfall,
  sentInterestIds,
  sendingInterest,
  sendInterestFromSearch,
} = useGlobalSearch()

const inputRef = ref<HTMLInputElement | null>(null)

// Auto-focus input when overlay opens (setTimeout for iOS compatibility)
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    void nextTick(() => {
      setTimeout(() => inputRef.value?.focus(), 100)
    })
  } else {
    clearSearch()
  }
})

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    close()
  }
}

const close = () => {
  clearSearch()
  emit('close')
}

// Navigation wrappers that also close the overlay
const goToCollection = (card: Parameters<typeof _goToCollection>[0]) => {
  _goToCollection(card)
  emit('close')
}

const goToUserCard = (card: Parameters<typeof _goToUserCard>[0]) => {
  _goToUserCard(card)
  emit('close')
}

const goToScryfall = (card: Parameters<typeof _goToScryfall>[0]) => {
  _goToScryfall(card)
  emit('close')
}

const goToAdvancedSearch = () => {
  close()
  void router.push('/search')
}

// Global escape key listener
const onDocKeydown = (e: KeyboardEvent) => {
  if (props.open && e.key === 'Escape') close()
}
document.addEventListener('keydown', onDocKeydown)
onUnmounted(() => { document.removeEventListener('keydown', onDocKeydown) })
</script>

<template>
  <Teleport to="body">
    <Transition name="overlay">
      <div
        v-if="open"
        class="fixed inset-0 z-[60] bg-primary flex flex-col"
      >
        <!-- Top bar -->
        <div class="flex items-center gap-2 px-3 py-2 border-b border-silver-20 flex-shrink-0">
          <button
            @click="close"
            class="p-1.5 text-silver-50 hover:text-silver transition-colors flex-shrink-0"
            type="button"
          >
            <SvgIcon name="chevron-left" size="small" />
          </button>
          <div class="relative flex-1">
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
              class="w-full bg-primary border border-silver-30 pl-10 pr-8 py-2.5 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none rounded transition-all"
              @input="handleInput"
              @keydown="handleKeydown"
            />
            <button
              v-if="searchQuery.length > 0"
              @click.stop="clearSearch"
              class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-silver-20"
              type="button"
            >
              ✕
            </button>
          </div>
          <button
            @click="close"
            class="text-small text-silver-50 hover:text-silver transition-colors flex-shrink-0 px-1"
            type="button"
          >
            {{ t('header.search.cancel') }}
          </button>
        </div>

        <!-- Tabs -->
        <div v-if="loading || totalResults > 0" class="flex border-b border-silver-20 flex-shrink-0">
          <button
            @click="activeTab = 'collection'"
            :class="[
              'flex-1 px-3 py-2.5 text-tiny font-bold transition-colors',
              activeTab === 'collection' ? 'text-neon border-b-2 border-neon' : 'text-silver-50'
            ]"
          >
            {{ t('header.search.tabs.collection') }} ({{ collectionResults.length }})
          </button>
          <button
            @click="activeTab = 'users'"
            :class="[
              'flex-1 px-3 py-2.5 text-tiny font-bold transition-colors',
              activeTab === 'users' ? 'text-neon border-b-2 border-neon' : 'text-silver-50'
            ]"
          >
            {{ t('header.search.tabs.users') }} ({{ usersResults.length }})
          </button>
          <button
            @click="activeTab = 'scryfall'"
            :class="[
              'flex-1 px-3 py-2.5 text-tiny font-bold transition-colors',
              activeTab === 'scryfall' ? 'text-neon border-b-2 border-neon' : 'text-silver-50'
            ]"
          >
            {{ t('header.search.tabs.scryfall') }} ({{ scryfallResults.length }})
          </button>
        </div>

        <!-- Results area -->
        <div class="flex-1 overflow-y-auto">
          <!-- Loading -->
          <div v-if="loading" class="p-6 text-center">
            <span class="text-small text-silver-50">{{ t('common.actions.loading') }}...</span>
          </div>

          <!-- Empty state -->
          <div v-else-if="searchQuery.length >= 2 && totalResults === 0 && !loading" class="p-6 text-center">
            <p class="text-small text-silver-50">{{ t('header.search.noResults') }}</p>
          </div>

          <!-- Collection Results -->
          <div v-else-if="activeTab === 'collection'">
            <div v-if="collectionResults.length === 0 && searchQuery.length >= 2" class="p-6 text-center text-small text-silver-50">
              {{ t('header.search.noResults') }}
            </div>
            <button
              v-for="card in collectionResults"
              :key="card.id"
              @click="goToCollection(card)"
              class="w-full px-4 py-3 flex items-center gap-3 hover:bg-silver-10 active:bg-silver-10 transition-colors text-left border-b border-silver-20 last:border-0"
            >
              <img
                v-if="card.image"
                :src="card.image"
                :alt="card.name"
                loading="lazy"
                class="w-12 h-[67px] object-cover rounded"
              />
              <div class="flex-1 min-w-0">
                <p class="text-small font-bold text-silver truncate">{{ card.name }}</p>
                <p class="text-tiny text-silver-50">{{ card.edition }} · x{{ card.quantity }}</p>
              </div>
              <span class="text-small text-neon font-bold">${{ card.price?.toFixed(2) ?? 'N/A' }}</span>
            </button>
          </div>

          <!-- Users Results -->
          <div v-else-if="activeTab === 'users'">
            <div v-if="usersResults.length === 0 && searchQuery.length >= 2" class="p-6 text-center text-small text-silver-50">
              {{ t('header.search.noResults') }}
            </div>
            <div
              v-for="card in usersResults"
              :key="card.id"
              class="px-4 py-3 flex items-center gap-3 hover:bg-silver-10 active:bg-silver-10 transition-colors border-b border-silver-20 last:border-0"
            >
              <img
                v-if="card.image"
                :src="card.image"
                :alt="card.cardName"
                loading="lazy"
                class="w-12 h-[67px] object-cover rounded cursor-pointer"
                @click="goToUserCard(card)"
              />
              <div class="flex-1 min-w-0 cursor-pointer" @click="goToUserCard(card)">
                <p class="text-small font-bold text-silver truncate">{{ card.cardName }}</p>
                <p class="text-tiny text-silver-50 flex items-center gap-1">
                  <img
                    :src="getAvatarUrlForUser(card.username ?? '', 14, card.avatarUrl)"
                    :alt="`${card.username} avatar`"
                    class="w-3.5 h-3.5 rounded-full"
                  />
                  @{{ card.username }} · {{ card.status }}
                </p>
              </div>
              <div class="flex flex-col items-end gap-1 flex-shrink-0">
                <span class="text-small text-neon font-bold">${{ card.price?.toFixed(2) ?? 'N/A' }}</span>
                <button
                  v-if="!sentInterestIds.has(card.id)"
                  @click.stop="sendInterestFromSearch(card)"
                  :disabled="sendingInterest"
                  class="px-2 py-1 bg-neon-10 border border-neon text-neon text-[12px] font-bold hover:bg-neon-20 transition-all rounded whitespace-nowrap"
                >
                  ME INTERESA
                </button>
                <span v-else class="text-[12px] text-silver-50 whitespace-nowrap">{{ t('dashboard.searchOthers.sent') }}</span>
              </div>
            </div>
          </div>

          <!-- Scryfall Results -->
          <div v-else-if="activeTab === 'scryfall'">
            <div v-if="scryfallResults.length === 0 && searchQuery.length >= 2" class="p-6 text-center text-small text-silver-50">
              {{ t('header.search.noResults') }}
            </div>
            <button
              v-for="card in scryfallResults"
              :key="card.id"
              @click="goToScryfall(card)"
              class="w-full px-4 py-3 flex items-center gap-3 hover:bg-silver-10 active:bg-silver-10 transition-colors text-left border-b border-silver-20 last:border-0"
            >
              <img
                v-if="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
                :src="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
                :alt="card.name"
                loading="lazy"
                class="w-12 h-[67px] object-cover rounded"
              />
              <div class="flex-1 min-w-0">
                <p class="text-small font-bold text-silver truncate">{{ card.name }}</p>
                <div class="flex items-center gap-2">
                  <ManaCost v-if="card.mana_cost" :cost="card.mana_cost" size="tiny" />
                  <span class="text-tiny text-silver-50">{{ card.set_name }}</span>
                </div>
              </div>
              <span class="text-small text-neon font-bold whitespace-nowrap">+ {{ t('header.search.addToCollection') }}</span>
            </button>
          </div>
        </div>

        <!-- Advanced Search link at bottom -->
        <div class="border-t border-silver-20 px-4 py-3 flex-shrink-0">
          <button
            @click="goToAdvancedSearch"
            class="w-full text-center text-small text-silver-50 hover:text-neon transition-colors"
          >
            {{ t('header.search.advancedSearch') }} →
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}
</style>
