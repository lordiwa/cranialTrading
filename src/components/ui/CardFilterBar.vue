<script setup lang="ts">
import { onMounted, onUnmounted, ref, toRef } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { useSearchSuggestions } from '../../composables/useSearchSuggestions'
import type { Card } from '../../types/card'
import BaseInput from './BaseInput.vue'
import SvgIcon from './SvgIcon.vue'

const props = withDefaults(defineProps<{
  filterQuery: string
  sortBy: string
  groupBy: string
  viewMode?: 'collection' | 'decks'
  showBulkSelect?: boolean
  selectionMode?: boolean
  showViewType?: boolean
  viewType?: 'stack' | 'visual' | 'texto'
}>(), {
  viewMode: 'collection',
})

const emit = defineEmits<{
  'update:filterQuery': [value: string]
  'update:sortBy': [value: string]
  'update:groupBy': [value: string]
  'toggle-bulk-select': []
  'change-view-type': [value: 'stack' | 'visual' | 'texto']
  'select-local-card': [card: Card]
  'select-scryfall-card': [cardName: string]
  'open-advanced-search': []
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

onMounted(() => { document.addEventListener('click', handleClickOutside) })
onUnmounted(() => { document.removeEventListener('click', handleClickOutside) })
</script>

<template>
  <div class="mb-6 space-y-3">
    <div ref="wrapperRef" class="relative">
      <BaseInput
          :model-value="filterQuery"
          @update:model-value="handleInput"
          :placeholder="t('collection.filters.searchPlaceholder')"
          type="text"
          clearable
      />

      <!-- Suggestions dropdown -->
      <div v-if="showDropdown && !dropdownDismissed" class="absolute left-0 right-0 top-full bg-primary border-2 border-neon max-h-80 overflow-y-auto z-20">
        <!-- Local matches section -->
        <div v-if="localMatches.length > 0">
          <div class="px-3 py-1 text-tiny text-silver-50 uppercase bg-silver-10">
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
          <div class="px-3 py-1 text-tiny text-silver-50 uppercase bg-silver-10">
            {{ t('collection.suggestions.scryfallSection') }}
          </div>
          <button v-for="name in scryfallSuggestions" :key="name" @click="emit('select-scryfall-card', name); clearSuggestions(); dropdownDismissed = true"
            class="w-full px-3 py-2 flex items-center justify-between hover:bg-neon-10 text-silver-50 text-left">
            <span class="text-small">{{ name }}</span>
            <span class="text-tiny text-neon">{{ t('collection.suggestions.addLabel') }}</span>
          </button>
        </div>

        <!-- Advanced search link -->
        <button @click="emit('open-advanced-search'); clearSuggestions(); dropdownDismissed = true"
          class="w-full px-3 py-2 text-small text-neon hover:bg-neon-10 border-t border-silver-30 flex items-center gap-1">
          <SvgIcon name="search" size="tiny" />
          {{ t('collection.suggestions.advancedSearch') }} →
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <!-- Sort By dropdown -->
      <select
          :value="sortBy"
          @change="emit('update:sortBy', ($event.target as HTMLSelectElement).value)"
          class="bg-primary border border-silver-30 text-silver text-tiny font-bold px-2 py-1 rounded focus:outline-none focus:border-neon"
      >
        <option value="recent">{{ t('collection.sort.recent') }}</option>
        <option value="name">{{ t('collection.sort.name') }}</option>
        <option value="price">{{ t('collection.sort.price') }}</option>
      </select>

      <!-- Group By dropdown -->
      <select
          :value="groupBy"
          @change="emit('update:groupBy', ($event.target as HTMLSelectElement).value)"
          class="bg-primary border border-silver-30 text-silver text-tiny font-bold px-2 py-1 rounded focus:outline-none focus:border-neon"
      >
        <option value="none">{{ t('collection.group.none') }}</option>
        <option value="type">{{ t('collection.deckStats.type') }}</option>
        <option value="mana">{{ t('collection.deckStats.mana') }}</option>
        <option value="color">{{ t('collection.deckStats.color') }}</option>
      </select>

      <!-- View type dropdown -->
      <select
          v-if="showViewType"
          :value="viewType"
          @change="emit('change-view-type', ($event.target as HTMLSelectElement).value as 'stack' | 'visual' | 'texto')"
          class="bg-primary border border-silver-30 text-silver text-tiny font-bold px-2 py-1 rounded focus:outline-none focus:border-neon"
      >
        <option value="visual">{{ t('collection.view.visual') }}</option>
        <option value="stack">{{ t('collection.view.stack') }}</option>
        <option value="texto">{{ t('collection.view.texto') }}</option>
      </select>

      <!-- Bulk select toggle -->
      <button
          v-if="showBulkSelect"
          @click="emit('toggle-bulk-select')"
          :class="[
            'px-2 py-1 text-tiny font-bold rounded transition-colors flex items-center gap-1',
            selectionMode ? 'bg-rust/20 text-rust' : 'text-silver-50 hover:text-silver'
          ]"
          :title="t('collection.bulkDelete.toggle')"
      >
        <SvgIcon name="check" size="tiny" />
        {{ t('collection.bulkDelete.select') }}
      </button>
    </div>
  </div>
</template>
