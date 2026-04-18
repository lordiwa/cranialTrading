<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { useGlobalSearch } from '../../composables/useGlobalSearch'
import { getAvatarUrlForUser } from '../../utils/avatar'
import SvgIcon from './SvgIcon.vue'
import ManaCost from './ManaCost.vue'

const router = useRouter()
const { t } = useI18n()

const {
  searchQuery,
  isOpen,
  loading,
  activeTab,
  collectionResults,
  usersResults,
  scryfallResults,
  handleInput,
  clearSearch,
  totalResults,
  goToCollection,
  goToUserCard,
  goToScryfall,
  sentInterestIds,
  sendingInterest,
  sendInterestFromSearch,
  // Plan 04-02: ARIA combobox wiring
  activeDescendantId,
  ariaLiveMessage,
  isExpanded,
  moveHighlight,
  selectHighlighted,
} = useGlobalSearch()

const inputRef = ref<HTMLInputElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

// Document-level handler: Escape only (handles global shortcut + click-outside Escape)
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    isOpen.value = false
    inputRef.value?.blur()
  }
}

// Input-scoped keyboard nav handler (NEW — arrow/home/end/enter + IME guard)
const handleInputKeydown = (e: KeyboardEvent) => {
  // IME composition safety (CJK input — Q6)
  if (e.isComposing || e.keyCode === 229) return
  if (e.key === 'Escape') {
    isOpen.value = false
    inputRef.value?.blur()
    return
  }
  if (!isExpanded.value) return
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); moveHighlight('down'); break
    case 'ArrowUp':   e.preventDefault(); moveHighlight('up'); break
    case 'Home':      e.preventDefault(); moveHighlight('home'); break
    case 'End':       e.preventDefault(); moveHighlight('end'); break
    case 'Enter':     e.preventDefault(); selectHighlighted(); break
  }
}

const handleClearSearch = () => {
  clearSearch()
  inputRef.value?.focus()
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
  <div ref="containerRef" class="relative" :aria-busy="loading ? 'true' : 'false'">
    <!-- sr-only live region for screen reader announcements (D-12, D-15) -->
    <span aria-live="polite" aria-atomic="true" class="sr-only">{{ ariaLiveMessage }}</span>

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
        role="combobox"
        :aria-expanded="isExpanded ? 'true' : 'false'"
        :aria-controls="isExpanded ? `search-listbox-${activeTab}` : undefined"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        :aria-activedescendant="activeDescendantId ?? undefined"
        :aria-label="t('header.search.placeholder')"
        :placeholder="t('header.search.placeholder')"
        class="w-full bg-primary border border-silver-30 pl-10 pr-8 py-2 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded transition-all"
        @input="handleInput"
        @focus="searchQuery.length >= 2 && (isOpen = true)"
        @keydown="handleInputKeydown"
      />
      <!-- Clear button (shows when there's text) -->
      <button
        v-if="searchQuery.length > 0"
        @click.stop="handleClearSearch"
        class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-silver-20"
        type="button"
        :aria-label="t('header.search.clearAriaLabel')"
      >
        ✕
      </button>
      <!-- Keyboard hint (shows when no text) — aria-hidden: decorative shortcut hint -->
      <span
        v-else
        aria-hidden="true"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-tiny text-silver-50 hidden lg:inline pointer-events-none"
      >
        /
      </span>
    </div>
    <!-- Advanced search link -->
    <div class="flex justify-end mt-1">
      <button
          @click="isOpen = false; router.push('/search')"
          class="text-tiny text-silver-50 hover:text-neon transition-colors"
      >
        {{ t('common.actions.advancedSearch') }} →
      </button>
    </div>

    <!-- Results Dropdown — shown when isExpanded (matches popup render condition exactly) -->
    <div
      v-if="isExpanded"
      class="absolute top-full right-0 mt-2 w-[420px] bg-primary border border-silver-30 rounded shadow-lg max-h-[70vh] overflow-hidden z-50"
    >
      <!-- Tabs — plain buttons, NOT role="tab" (combobox owns the widget; no tablist conflict) -->
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

      <!-- Results listbox -->
      <div
        v-else
        :id="`search-listbox-${activeTab}`"
        role="listbox"
        :aria-label="t(`header.search.tabNames.${activeTab}`)"
        class="max-h-80 overflow-y-auto"
      >
        <!-- Collection Results -->
        <div v-if="activeTab === 'collection'">
          <div v-if="collectionResults.length === 0" class="p-4 text-center text-small text-silver-50">
            {{ t('header.search.noResults') }}
          </div>
          <button
            v-for="(card, index) in collectionResults"
            :key="card.id"
            :id="`option-collection-${index}`"
            role="option"
            :aria-selected="activeDescendantId === `option-collection-${index}` ? 'true' : 'false'"
            @click="goToCollection(card)"
            class="w-full px-4 py-3 flex items-center gap-3 hover:bg-silver-10 transition-colors text-left border-b border-silver-20 last:border-0"
          >
            <img
              v-if="card.image"
              :src="card.image"
              :alt="card.name"
              loading="lazy"
              width="40"
              height="56"
              class="w-10 h-14 object-cover rounded"
            />
            <div class="flex-1 min-w-0">
              <p translate="no" class="text-small font-bold text-silver truncate">{{ card.name }}</p>
              <p class="text-tiny text-silver-50">{{ card.edition }} · x{{ card.quantity }}</p>
            </div>
            <span class="text-tiny text-neon font-bold">${{ card.price?.toFixed(2) ?? 'N/A' }}</span>
          </button>
        </div>

        <!-- Users Results -->
        <div v-if="activeTab === 'users'">
          <div v-if="usersResults.length === 0" class="p-4 text-center text-small text-silver-50">
            {{ t('header.search.noResults') }}
          </div>
          <div
            v-for="(card, index) in usersResults"
            :key="card.id"
            :id="`option-users-${index}`"
            role="option"
            :aria-selected="activeDescendantId === `option-users-${index}` ? 'true' : 'false'"
            class="px-4 py-3 flex items-center gap-3 hover:bg-silver-10 transition-colors border-b border-silver-20 last:border-0"
          >
            <button
              type="button"
              class="flex-1 min-w-0 flex items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-neon focus-visible:outline-none rounded"
              @click="goToUserCard(card)"
            >
              <img
                v-if="card.image"
                :src="card.image"
                :alt="card.cardName"
                width="40"
                height="56"
                loading="lazy"
                class="w-10 h-14 object-cover rounded flex-shrink-0"
              />
              <div class="min-w-0">
                <p class="text-small font-bold text-silver truncate" translate="no">{{ card.cardName }}</p>
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
            </button>
            <div class="flex flex-col items-end gap-1 flex-shrink-0">
              <span class="text-tiny text-neon font-bold">${{ card.price?.toFixed(2) ?? 'N/A' }}</span>
              <button
                v-if="!sentInterestIds.has(card.id)"
                @click.stop="sendInterestFromSearch(card)"
                :disabled="sendingInterest"
                class="px-2 py-0.5 bg-neon-10 border border-neon text-neon text-[14px] font-bold hover:bg-neon-20 transition-all rounded whitespace-nowrap"
              >
                ME INTERESA
              </button>
              <span v-else class="text-[14px] text-silver-50 whitespace-nowrap">{{ t('dashboard.searchOthers.sent') }}</span>
            </div>
          </div>
        </div>

        <!-- Scryfall Results -->
        <div v-if="activeTab === 'scryfall'">
          <div v-if="scryfallResults.length === 0" class="p-4 text-center text-small text-silver-50">
            {{ t('header.search.noResults') }}
          </div>
          <button
            v-for="(card, index) in scryfallResults"
            :key="card.id"
            :id="`option-scryfall-${index}`"
            role="option"
            :aria-selected="activeDescendantId === `option-scryfall-${index}` ? 'true' : 'false'"
            @click="goToScryfall(card)"
            class="w-full px-4 py-3 flex items-center gap-3 hover:bg-silver-10 transition-colors text-left border-b border-silver-20 last:border-0"
          >
            <img
              v-if="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
              :src="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
              :alt="card.name"
              loading="lazy"
              width="40"
              height="56"
              class="w-10 h-14 object-cover rounded"
            />
            <div class="flex-1 min-w-0">
              <p translate="no" class="text-small font-bold text-silver truncate">{{ card.name }}</p>
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
