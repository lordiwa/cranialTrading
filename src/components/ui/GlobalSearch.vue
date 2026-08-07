<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { useGlobalSearch } from '../../composables/useGlobalSearch'
import IconV2 from './IconV2.vue'

const { t } = useI18n()

const {
  searchQuery,
  isOpen,
  loading,
  suggestions,
  handleInput,
  clearSearch,
  // ARIA combobox wiring
  activeDescendantId,
  ariaLiveMessage,
  isExpanded,
  moveHighlight,
  selectHighlighted,
  // Route resolver for RouterLink :to= binding (Cmd+click / middle-click support)
  resolveSuggestionRoute,
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

// Input-scoped keyboard nav handler (arrow/home/end/enter + IME guard)
const handleInputKeydown = (e: KeyboardEvent) => {
  // IME composition safety (CJK input — Q6)
  if (e.isComposing) return
  if (e.key === 'Escape') {
    isOpen.value = false
    inputRef.value?.blur()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    selectHighlighted()
    return
  }
  if (!isExpanded.value) return
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); moveHighlight('down'); break
    case 'ArrowUp':   e.preventDefault(); moveHighlight('up'); break
    case 'Home':      e.preventDefault(); moveHighlight('home'); break
    case 'End':       e.preventDefault(); moveHighlight('end'); break
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

    <!-- Search input — v2 pill, same vocabulary as the logged-out LandingHeader
         (LandingHeader.vue:119) so the search affordance is identical across the
         whole site instead of the app header keeping the pre-v2 square neon box. -->
    <div class="flex items-center gap-2 border border-line rounded-full pl-4 pr-1.5 py-1.5 bg-surface-1 focus-within:border-neon focus-within:shadow-glow-neon transition-all duration-200 ease-v2">
      <IconV2
        name="search"
        :size="18"
        class="text-silver-30 pointer-events-none flex-shrink-0"
      />
      <input
        ref="inputRef"
        v-model="searchQuery"
        type="text"
        role="combobox"
        :aria-expanded="isExpanded ? 'true' : 'false'"
        :aria-controls="isExpanded ? 'search-listbox-suggestions' : undefined"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        :aria-activedescendant="activeDescendantId ?? undefined"
        :aria-label="t('header.search.placeholder')"
        :placeholder="t('header.search.placeholder')"
        class="flex-1 min-w-0 bg-transparent border-none py-1 text-body text-silver placeholder-silver-30 outline-none focus:outline-none"
        @input="handleInput"
        @focus="searchQuery.length >= 2 && (isOpen = true)"
        @keydown="handleInputKeydown"
      />
      <!-- Clear button (shows when there's text) -->
      <button
        v-if="searchQuery.length > 0"
        @click.stop="handleClearSearch"
        class="self-center w-6 h-6 flex items-center justify-center rounded-full text-silver-30 hover:text-silver transition-all duration-200 ease-v2 flex-shrink-0 focus-visible:outline-none focus-visible:shadow-glow-neon"
        type="button"
        :aria-label="t('header.search.clearAriaLabel')"
      >
        <IconV2 name="x" :size="16" />
      </button>
      <!-- Keyboard hint (shows when no text) — aria-hidden: decorative shortcut hint -->
      <kbd
        v-else
        aria-hidden="true"
        class="self-center text-tiny text-silver-30 px-1 hidden lg:inline flex-shrink-0"
      >
        /
      </kbd>
      <!-- BUSCAR button — v2 neon pill (LandingHeader.vue:138) -->
      <RouterLink
        :to="searchQuery.length > 0 ? { path: '/search', query: { q: searchQuery } } : '/search'"
        @click="isOpen = false"
        class="flex items-center px-4 py-1.5 bg-neon text-primary font-bold text-[11px] uppercase tracking-[.1em] rounded-full hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2 flex-shrink-0"
      >
        {{ t('header.nav.search') }}
      </RouterLink>
    </div>
    <!-- Advanced search link -->
    <div class="flex justify-end mt-1">
      <RouterLink
          :to="'/search'"
          @click="isOpen = false"
          class="text-tiny text-silver-50 hover:text-neon transition-colors"
      >
        {{ t('common.actions.advancedSearch') }} →
      </RouterLink>
    </div>

    <!-- Suggestions dropdown — name-only autocomplete (TASK-076) -->
    <div
      v-if="isExpanded"
      class="absolute top-full left-0 right-0 mt-2 bg-primary border border-line-strong rounded-md shadow-strong max-h-[70vh] overflow-hidden z-50"
    >
      <!-- Loading -->
      <div v-if="loading" class="p-4 text-center">
        <span class="text-small text-silver-30">{{ t('common.actions.loading') }}...</span>
      </div>

      <!-- Suggestions listbox -->
      <div
        v-else
        id="search-listbox-suggestions"
        role="listbox"
        :aria-label="t('header.search.placeholder')"
        class="max-h-80 overflow-y-auto"
      >
        <RouterLink
          v-for="(name, index) in suggestions"
          :key="name"
          :id="`option-suggestion-${index}`"
          role="option"
          :aria-selected="activeDescendantId === `option-suggestion-${index}` ? 'true' : 'false'"
          :to="resolveSuggestionRoute(name)"
          @click="clearSearch"
          :class="[
            'block w-full px-4 py-2.5 text-small text-silver hover:bg-surface-2 transition-colors duration-200 ease-v2 border-b border-line last:border-0 truncate',
            activeDescendantId === `option-suggestion-${index}` ? 'bg-surface-2' : ''
          ]"
          translate="no"
        >
          {{ name }}
        </RouterLink>
      </div>

      <!-- View all results -->
      <RouterLink
        v-if="!loading && searchQuery.length >= 2"
        :to="{ path: '/search', query: { q: searchQuery } }"
        @click="clearSearch"
        class="block w-full px-4 py-2.5 text-center text-tiny text-silver-50 hover:text-neon border-t border-line transition-colors duration-200 ease-v2"
      >
        {{ t('header.search.viewAllResults') }} →
      </RouterLink>
    </div>
  </div>
</template>
