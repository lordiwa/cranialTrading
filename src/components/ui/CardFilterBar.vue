<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { useSearchSuggestions } from '../../composables/useSearchSuggestions'
import type { Card } from '../../types/card'
import BaseInput from './BaseInput.vue'
import SvgIcon from './SvgIcon.vue'

const props = withDefaults(defineProps<{
  filterQuery: string
  sortBy: string
  groupBy: string
  viewMode?: 'collection' | 'decks' | 'binders'
  showBulkSelect?: boolean
  selectionMode?: boolean
  showViewType?: boolean
  viewType?: 'visual' | 'texto'
  showSuggestions?: boolean
  showMobileDiscover?: boolean
  mobileDiscoverActive?: boolean
  showAdvancedFilters?: boolean
  activeFilterCount?: number
  // v2 redesign — opt-in only (design→app v2, DESIGN-DIRECTION.md §5). Defaults to false so
  // Deck/Binder/UserProfile/DiscoveryPanel callers keep the exact v1 look until their own tickets land.
  v2?: boolean
}>(), {
  viewMode: 'collection',
  showSuggestions: true,
  viewType: undefined,
  showMobileDiscover: false,
  mobileDiscoverActive: false,
  showAdvancedFilters: false,
  activeFilterCount: 0,
  v2: false,
})

const emit = defineEmits<{
  'update:filterQuery': [value: string]
  'update:sortBy': [value: string]
  'update:groupBy': [value: string]
  'toggle-bulk-select': []
  'change-view-type': [value: 'visual' | 'texto']
  'select-local-card': [card: Card]
  'select-scryfall-card': [cardName: string]
  'open-discovery-sheet': []
  'open-filters': []
  'open-add-modal-with-name': [name: string]
}>()

const { t } = useI18n()

const filterQueryRef = toRef(props, 'filterQuery')
const { localMatches, scryfallSuggestions, showDropdown, clearSuggestions } = useSearchSuggestions(filterQueryRef)

const onFilterQueryUpdate = (val: string | number) => { emit('update:filterQuery', String(val)) }

// Click-outside handler to close dropdown
const wrapperRef = ref<HTMLElement | null>(null)
const dropdownDismissed = ref(false)

const handleClickOutside = (e: MouseEvent) => {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    dropdownDismissed.value = true
  }
}

// Reset dismiss when query changes
const handleInput = (val: string | number) => {
  dropdownDismissed.value = false
  onFilterQueryUpdate(val)
}

// SCRUM-66: in collection mode, when the user typed something but there are no
// local matches AND no Scryfall suggestions, offer an "add as new card" action.
const showAddAsNew = computed(() =>
  props.viewMode === 'collection'
  && filterQueryRef.value.trim().length > 0
  && localMatches.value.length === 0
  && scryfallSuggestions.value.length === 0,
)

// The composable's showDropdown is false when there are zero local + zero scryfall
// results, which would hide the container before the add-as-new item can render.
// Widen visibility for collection mode only — Deck/Binder keep the original behavior.
const dropdownVisible = computed(() => showDropdown.value || showAddAsNew.value)

const handleAddAsNew = () => {
  emit('open-add-modal-with-name', filterQueryRef.value.trim())
  clearSuggestions()
  dropdownDismissed.value = true
}

onMounted(() => { document.addEventListener('click', handleClickOutside) })
onUnmounted(() => { document.removeEventListener('click', handleClickOutside) })
</script>

<template>
  <div class="mb-6 space-y-3">
    <div class="flex items-center gap-2">
      <div ref="wrapperRef" class="relative flex-1" :class="v2 ? 'max-w-[420px]' : ''">
        <BaseInput
            v-if="!v2"
            :model-value="filterQuery"
            @update:model-value="handleInput"
            :placeholder="t('collection.filters.searchPlaceholder')"
            type="text"
            clearable
        />
        <!-- v2 redesign: input surface-1 + focus glow (DESIGN-DIRECTION.md §5) -->
        <label
            v-else
            class="flex items-center gap-2.5 min-h-11 px-3.5 bg-surface-1 border border-line rounded-md transition-all duration-200 ease-v2 focus-within:border-neon focus-within:shadow-glow-neon"
        >
          <SvgIcon name="search" size="tiny" class="text-silver-30 flex-shrink-0" />
          <input
              :value="filterQuery"
              @input="handleInput(($event.target as HTMLInputElement).value)"
              type="text"
              :placeholder="t('collection.filters.searchPlaceholder')"
              class="flex-1 min-w-0 bg-transparent border-none outline-none text-silver text-small placeholder:text-silver-30"
          />
          <button
              v-if="filterQuery.length > 0"
              type="button"
              @click.stop="handleInput('')"
              :aria-label="t('common.aria.clearInput')"
              class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-surface-2"
          >
            ✕
          </button>
        </label>

        <!-- Suggestions dropdown -->
        <div
            v-if="showSuggestions && dropdownVisible && !dropdownDismissed"
            class="absolute left-0 right-0 top-full max-h-80 overflow-y-auto z-20"
            :class="v2 ? 'mt-1 bg-primary border border-line-strong rounded-md shadow-strong' : 'bg-primary border-2 border-neon'"
        >
        <!-- Local matches section -->
        <div v-if="localMatches.length > 0">
          <div class="px-3 py-1 text-tiny text-silver-50 uppercase" :class="v2 ? 'bg-surface-2' : 'bg-silver-10'">
            {{ t('collection.suggestions.localSection') }}
          </div>
          <button v-for="card in localMatches" :key="card.id" @click="emit('select-local-card', card); clearSuggestions(); dropdownDismissed = true"
            class="w-full px-3 py-2 flex items-center gap-2 hover:bg-neon-10 text-silver text-left">
            <span class="text-small truncate">{{ card.name }}</span>
            <span class="text-tiny text-silver-50 ml-auto whitespace-nowrap">{{ card.edition }} ×{{ card.quantity }}</span>
          </button>
        </div>

        <!-- Scryfall suggestions section -->
        <div v-if="scryfallSuggestions.length > 0">
          <div class="px-3 py-1 text-tiny text-silver-50 uppercase" :class="v2 ? 'bg-surface-2' : 'bg-silver-10'">
            {{ t('collection.suggestions.scryfallSection') }}
          </div>
          <button v-for="name in scryfallSuggestions" :key="name" @click="emit('select-scryfall-card', name); clearSuggestions(); dropdownDismissed = true"
            class="w-full px-3 py-2 flex items-center justify-between hover:bg-neon-10 text-silver-50 text-left">
            <span class="text-small">{{ name }}</span>
            <span class="text-tiny text-neon">{{ t('collection.suggestions.addLabel') }}</span>
          </button>
        </div>

        <!-- Add as new card (collection mode only, no local + no scryfall matches) -->
        <button v-if="showAddAsNew" type="button" @click="handleAddAsNew"
          class="w-full px-3 py-2 flex items-center justify-between hover:bg-neon-10 text-silver text-left">
          <span class="text-small truncate">{{ filterQuery }}</span>
          <span class="text-tiny text-neon ml-auto whitespace-nowrap">{{ t('collection.suggestions.addAsNew') }}</span>
        </button>

        <!-- Advanced search link (collection mode only) -->
        <RouterLink v-if="viewMode === 'collection'" :to="'/search'" @click="clearSuggestions(); dropdownDismissed = true"
          class="w-full px-3 py-2 text-small text-neon hover:bg-neon-10 border-t flex items-center gap-1" :class="v2 ? 'border-line' : 'border-silver-30'">
          <SvgIcon name="search" size="tiny" />
          {{ t('collection.suggestions.advancedSearch') }} →
        </RouterLink>
        </div>
      </div>
      <button
          v-if="showAdvancedFilters"
          type="button"
          :class="v2
            ? [
                'inline-flex items-center gap-2 min-h-11 px-3.5 rounded-md border text-tiny font-bold uppercase tracking-wide transition-all duration-200 ease-v2',
                activeFilterCount > 0 ? 'bg-neon-10 text-neon border-neon-40' : 'bg-surface-1 text-silver-50 border-line hover:border-line-strong hover:text-silver'
              ]
            : [
                'flex items-center gap-1 px-3 min-h-[44px] md:min-h-0 md:py-1 rounded-none border text-tiny font-bold transition-150',
                activeFilterCount > 0 ? 'bg-neon text-primary border-neon' : 'bg-primary text-silver border-silver-30 hover:border-neon hover:text-neon'
              ]"
          :aria-label="t('discovery.mobile.openSheetFilter')"
          aria-haspopup="dialog"
          data-testid="cardfilterbar-open-filters"
          @click="emit('open-filters')"
      >
        <SvgIcon name="filter" size="tiny" />
        <span>{{ t('discovery.mobile.openSheetFilter') }}</span>
        <span
            v-if="activeFilterCount > 0"
            class="ml-1 px-1.5 rounded-none bg-primary text-neon text-tiny font-bold"
        >{{ activeFilterCount }}</span>
      </button>
      <button
          v-if="showMobileDiscover"
          type="button"
          class="md:hidden flex items-center gap-1 px-3 min-h-[44px] rounded-none border text-tiny font-bold transition-150"
          :class="mobileDiscoverActive
            ? 'bg-neon text-primary border-neon'
            : 'bg-primary text-neon border-neon hover:bg-neon hover:text-primary'"
          :aria-label="t('discovery.mobile.openSheetDiscover')"
          aria-haspopup="dialog"
          :aria-expanded="mobileDiscoverActive"
          data-testid="cardfilterbar-open-discovery-sheet"
          @click="emit('open-discovery-sheet')"
      >
        <SvgIcon name="search" size="tiny" />
        <span>{{ t('discovery.mobile.openSheetDiscover') }}</span>
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <!-- Sort By dropdown -->
      <div class="relative">
        <select
            :value="sortBy"
            @change="emit('update:sortBy', ($event.target as HTMLSelectElement).value)"
            :class="v2
              ? 'appearance-none bg-surface-1 border border-line text-silver text-tiny font-bold px-3 py-2 pr-8 min-h-[36px] rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon'
              : 'appearance-none bg-primary border border-silver-10 text-silver text-tiny font-bold px-2 py-1 pr-7 h-[32px] rounded-none cursor-pointer focus:outline-none focus:border-neon focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary'"
        >
          <option value="recent">{{ t('collection.sort.recent') }}</option>
          <option value="name">{{ t('collection.sort.name') }}</option>
          <option value="price">{{ t('collection.sort.price') }}</option>
        </select>
        <SvgIcon name="chevron-down" size="tiny" class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
      </div>

      <!-- Group By dropdown -->
      <div class="relative">
        <select
            :value="groupBy"
            @change="emit('update:groupBy', ($event.target as HTMLSelectElement).value)"
            :class="v2
              ? 'appearance-none bg-surface-1 border border-line text-silver text-tiny font-bold px-3 py-2 pr-8 min-h-[36px] rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon'
              : 'appearance-none bg-primary border border-silver-10 text-silver text-tiny font-bold px-2 py-1 pr-7 h-[32px] rounded-none cursor-pointer focus:outline-none focus:border-neon focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary'"
        >
          <option value="none">{{ t('collection.group.none') }}</option>
          <option value="name">{{ t('collection.group.name') }}</option>
          <option value="type">{{ t('collection.deckStats.type') }}</option>
          <option value="mana">{{ t('collection.deckStats.mana') }}</option>
          <option value="color">{{ t('collection.deckStats.color') }}</option>
        </select>
        <SvgIcon name="chevron-down" size="tiny" class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
      </div>

      <!-- View type dropdown -->
      <div v-if="showViewType" class="relative">
        <select
            :value="viewType"
            @change="emit('change-view-type', ($event.target as HTMLSelectElement).value as 'visual' | 'texto')"
            :class="v2
              ? 'appearance-none bg-surface-1 border border-line text-silver text-tiny font-bold px-3 py-2 pr-8 min-h-[36px] rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon'
              : 'appearance-none bg-primary border border-silver-10 text-silver text-tiny font-bold px-2 py-1 pr-7 h-[32px] rounded-none cursor-pointer focus:outline-none focus:border-neon focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary'"
        >
          <option value="visual">{{ t('collection.view.visual') }}</option>
          <option value="texto">{{ t('collection.view.texto') }}</option>
        </select>
        <SvgIcon name="chevron-down" size="tiny" class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
      </div>

      <!-- Bulk select toggle -->
      <button
          v-if="showBulkSelect"
          @click="emit('toggle-bulk-select')"
          :class="v2
            ? [
                'inline-flex items-center gap-1.5 px-3.5 min-h-[34px] rounded-full text-small font-semibold transition-all duration-200 ease-v2 border',
                selectionMode ? 'bg-rust/15 text-[#C4553F] border-rust/40' : 'bg-surface-1 text-silver-50 border-line hover:text-silver hover:border-line-strong'
              ]
            : [
                'px-2 py-1 text-tiny font-bold rounded-none transition-colors flex items-center gap-1',
                selectionMode ? 'bg-rust/20 text-rust' : 'border border-silver-10 text-silver-50 hover:text-silver hover:border-silver-30'
              ]"
          :title="t('collection.bulkDelete.toggle')"
      >
        <SvgIcon name="check" size="tiny" />
        {{ t('collection.bulkDelete.select') }}
      </button>
    </div>
  </div>
</template>
