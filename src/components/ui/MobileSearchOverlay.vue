<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { useGlobalSearch } from '../../composables/useGlobalSearch'
import SvgIcon from './SvgIcon.vue'
import IconV2 from './IconV2.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const {
  searchQuery,
  loading,
  suggestions,
  handleInput,
  clearSearch,
  // ARIA combobox wiring (parallel with GlobalSearch — Rule 6)
  activeDescendantId,
  ariaLiveMessage,
  isExpanded,
  moveHighlight,
  selectHighlighted,
  // Route resolver for RouterLink :to= binding (parallel with GlobalSearch — Rule 6)
  resolveSuggestionRoute,
} = useGlobalSearch()

const inputRef = ref<HTMLInputElement | null>(null)

// Auto-focus input when overlay opens (setTimeout for iOS compatibility — D-18 unchanged)
watch(() => props.open, (isOpen) => {
  // Clear on BOTH transitions, not just on close. Closing already cleared, but a
  // response still in flight could refill the state afterwards, and re-opening never
  // cleared again — so the next open showed the previous session's suggestions.
  // (clearSearch now also invalidates the in-flight request; this keeps the overlay
  // correct even if that response lands between close and re-open.)
  clearSearch()
  if (isOpen) {
    void nextTick(() => {
      setTimeout(() => inputRef.value?.focus(), 100)
    })
  }
})

// Input-scoped keyboard nav handler (arrow/home/end/enter + IME guard)
const handleInputKeydown = (e: KeyboardEvent) => {
  // IME composition safety (CJK input — Q6)
  if (e.isComposing) return
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    selectHighlighted()
    emit('close')   // ensure mobile overlay closes after Enter-selection
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

const close = () => {
  clearSearch()
  emit('close')
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
        :aria-busy="loading ? 'true' : 'false'"
      >
        <!-- sr-only live region for screen reader announcements (D-12, D-15 — parallel with GlobalSearch) -->
        <span aria-live="polite" aria-atomic="true" class="sr-only">{{ ariaLiveMessage }}</span>

        <!-- Top bar -->
        <div class="flex items-center gap-2 px-3 py-2 border-b border-silver-20 flex-shrink-0">
          <button
            @click="close"
            class="p-1.5 text-silver-50 hover:text-silver transition-colors flex-shrink-0"
            type="button"
            :aria-label="t('common.actions.back')"
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
              role="combobox"
              :aria-expanded="isExpanded ? 'true' : 'false'"
              :aria-controls="isExpanded ? 'search-listbox-suggestions' : undefined"
              aria-haspopup="listbox"
              aria-autocomplete="list"
              :aria-activedescendant="activeDescendantId ?? undefined"
              :aria-label="t('header.search.placeholder')"
              :placeholder="t('header.search.placeholder')"
              class="w-full bg-primary border border-silver-30 pl-10 pr-8 py-2.5 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-none transition-all"
              @input="handleInput"
              @keydown="handleInputKeydown"
            />
            <button
              v-if="searchQuery.length > 0"
              @click.stop="clearSearch"
              class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-silver-20 focus-visible:outline-none focus-visible:shadow-glow-neon"
              type="button"
              :aria-label="t('header.search.clearAriaLabel')"
            >
              <IconV2 name="x" :size="14" />
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

        <!-- Results area -->
        <div class="flex-1 overflow-y-auto">
          <!-- Loading -->
          <div v-if="loading" class="p-6 text-center">
            <span class="text-small text-silver-50">{{ t('common.actions.loading') }}...</span>
          </div>

          <!-- Empty state -->
          <div v-else-if="searchQuery.length >= 2 && suggestions.length === 0" class="p-6 text-center">
            <p class="text-small text-silver-50">{{ t('header.search.noResults') }}</p>
          </div>

          <!-- Suggestions listbox (name-only autocomplete — TASK-076) -->
          <div
            v-else-if="suggestions.length > 0"
            id="search-listbox-suggestions"
            role="listbox"
            :aria-label="t('header.search.placeholder')"
          >
            <RouterLink
              v-for="(name, index) in suggestions"
              :key="name"
              :id="`option-suggestion-${index}`"
              role="option"
              :aria-selected="activeDescendantId === `option-suggestion-${index}` ? 'true' : 'false'"
              :to="resolveSuggestionRoute(name)"
              @click="close"
              :class="[
                'block w-full px-4 py-3 text-small text-silver hover:bg-silver-10 active:bg-silver-10 transition-colors border-b border-silver-20 last:border-0 truncate',
                activeDescendantId === `option-suggestion-${index}` ? 'bg-silver-10' : ''
              ]"
              translate="no"
            >
              {{ name }}
            </RouterLink>
            <!-- View all results -->
            <RouterLink
              :to="{ path: '/search', query: { q: searchQuery } }"
              @click="close"
              class="block w-full px-4 py-3 text-center text-small text-silver-50 hover:text-neon transition-colors"
            >
              {{ t('header.search.viewAllResults') }} →
            </RouterLink>
          </div>
        </div>

        <!-- Advanced Search link at bottom -->
        <div class="border-t border-silver-20 px-4 py-3 flex-shrink-0">
          <RouterLink
            :to="'/search'"
            @click="emit('close')"
            class="w-full block text-center text-small text-silver-50 hover:text-neon transition-colors"
          >
            {{ t('header.search.advancedSearch') }} →
          </RouterLink>
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
