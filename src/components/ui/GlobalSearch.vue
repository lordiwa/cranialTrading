<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { useGlobalSearch } from '../../composables/useGlobalSearch'
import SvgIcon from './SvgIcon.vue'

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

    <!-- Search Input (promoted header search — big, square, neon border) -->
    <div class="flex items-stretch bg-primary border-[1.5px] border-neon/50 focus-within:border-neon transition-colors">
      <SvgIcon
        name="search"
        size="small"
        class="self-center ml-3 mr-1 text-neon pointer-events-none flex-shrink-0"
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
        class="flex-1 min-w-0 bg-transparent border-none px-2 py-2.5 text-body text-silver placeholder-silver-50 focus:outline-none"
        @input="handleInput"
        @focus="searchQuery.length >= 2 && (isOpen = true)"
        @keydown="handleInputKeydown"
      />
      <!-- Clear button (shows when there's text) -->
      <button
        v-if="searchQuery.length > 0"
        @click.stop="handleClearSearch"
        class="self-center w-6 h-6 flex items-center justify-center text-silver-50 hover:text-silver transition-colors flex-shrink-0"
        type="button"
        :aria-label="t('header.search.clearAriaLabel')"
      >
        ✕
      </button>
      <!-- Keyboard hint (shows when no text) — aria-hidden: decorative shortcut hint -->
      <kbd
        v-else
        aria-hidden="true"
        class="self-center text-tiny text-silver-50 px-2 hidden lg:inline flex-shrink-0"
      >
        /
      </kbd>
      <div class="w-px bg-silver-20 my-2 hidden sm:block flex-shrink-0"></div>
      <!-- BUSCAR button -->
      <RouterLink
        :to="searchQuery.length > 0 ? { path: '/search', query: { q: searchQuery } } : '/search'"
        @click="isOpen = false"
        class="flex items-center bg-neon text-primary font-bold text-tiny uppercase tracking-wide px-4 hover:bg-neon/90 transition-colors flex-shrink-0"
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
      class="absolute top-full left-0 right-0 mt-2 bg-primary border border-silver-30 rounded-none shadow-lg max-h-[70vh] overflow-hidden z-50"
    >
      <!-- Loading -->
      <div v-if="loading" class="p-4 text-center">
        <span class="text-small text-silver-50">{{ t('common.actions.loading') }}...</span>
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
            'block w-full px-4 py-2.5 text-small text-silver hover:bg-silver-10 transition-colors border-b border-silver-20 last:border-0 truncate',
            activeDescendantId === `option-suggestion-${index}` ? 'bg-silver-10' : ''
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
        class="block w-full px-4 py-2.5 text-center text-tiny text-silver-50 hover:text-neon border-t border-silver-20 transition-colors"
      >
        {{ t('header.search.viewAllResults') }} →
      </RouterLink>
    </div>
  </div>
</template>
