<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { type FilterOptions, useSearchStore } from '../../stores/search'
import { getCardSuggestions } from '../../services/scryfall'
import { formatOptions, getKeywordLabel } from '../../utils/filterKeywords'
import AdvancedFilterModal, { type AdvancedFilters } from './AdvancedFilterModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import IconV2 from '../ui/IconV2.vue'
import ManaIcon from '../ui/ManaIcon.vue'
import HelpTooltip from '../ui/HelpTooltip.vue'

const props = withDefaults(defineProps<{
  autoSearch?: boolean
  syncWithRouter?: boolean
  hideNameInput?: boolean
  externalName?: string
}>(), {
  autoSearch: true,
  syncWithRouter: true,
  hideNameInput: false,
  externalName: undefined,
})

const emit = defineEmits<{
  'search': [filters: FilterOptions]
  'clear': []
}>()

const route = useRoute()
const { t } = useI18n()
const searchStore = useSearchStore()
const showAdvancedFilters = ref(false)

// Form state
const filters = reactive<FilterOptions>({
  name: '',
  colors: [],
  types: [],
  manaValue: { min: undefined, max: undefined, values: undefined },
  rarity: [],
  sets: [],
  power: { min: undefined, max: undefined },
  toughness: { min: undefined, max: undefined },
  formatLegal: [],
  priceUSD: { min: undefined, max: undefined },
  keywords: [],
  creatureTypes: [],
  isFoil: false,
  isFullArt: false,
  onlyReleased: true,
})

// Bridge: FilterOptions reactive <-> AdvancedFilters for the modal
const advancedFiltersForModal = computed<AdvancedFilters>(() => ({
  colors: filters.colors ?? [],
  types: filters.types ?? [],
  manaValue: filters.manaValue ?? { min: undefined, max: undefined, values: undefined },
  rarity: filters.rarity ?? [],
  sets: filters.sets ?? [],
  power: filters.power ?? { min: undefined, max: undefined },
  toughness: filters.toughness ?? { min: undefined, max: undefined },
  formatLegal: filters.formatLegal ?? [],
  priceUSD: filters.priceUSD ?? { min: undefined, max: undefined },
  keywords: filters.keywords ?? [],
  creatureTypes: filters.creatureTypes ?? [],
  isFoil: filters.isFoil ?? false,
  isFullArt: filters.isFullArt ?? false,
}))

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const handleAdvancedFiltersUpdate = (updated: AdvancedFilters) => {
  filters.colors = updated.colors
  filters.types = updated.types
  filters.manaValue = updated.manaValue
  filters.rarity = updated.rarity
  filters.sets = updated.sets
  filters.power = updated.power
  filters.toughness = updated.toughness
  filters.formatLegal = updated.formatLegal
  filters.priceUSD = updated.priceUSD
  filters.keywords = updated.keywords
  filters.creatureTypes = updated.creatureTypes
  filters.isFoil = updated.isFoil
  filters.isFullArt = updated.isFullArt
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const handleAdvancedReset = () => {
  filters.colors = []
  filters.types = []
  filters.manaValue = { min: undefined, max: undefined, values: undefined }
  filters.rarity = []
  filters.sets = []
  filters.power = { min: undefined, max: undefined }
  filters.toughness = { min: undefined, max: undefined }
  filters.formatLegal = []
  filters.priceUSD = { min: undefined, max: undefined }
  filters.keywords = []
  filters.creatureTypes = []
  filters.isFoil = false
  filters.isFullArt = false
  selectedManaValues.value = []
}

// Sugerencias de nombres
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
const suppressSuggestions = ref(false)
const nameInputContainer = ref<HTMLElement | null>(null)
let suggestionTimeout: ReturnType<typeof setTimeout>

// Debounce para auto-búsqueda
let filterDebounceTimeout: ReturnType<typeof setTimeout>

// Watch para auto-búsqueda cuando cambian los filtros (excepto nombre)
watch(
  () => [
    filters.colors, filters.types, filters.rarity, filters.formatLegal, filters.sets,
    filters.manaValue?.min, filters.manaValue?.max, filters.manaValue?.values,
    filters.power?.min, filters.power?.max, filters.toughness?.min, filters.toughness?.max,
    filters.priceUSD?.min, filters.priceUSD?.max, filters.keywords,
    filters.isFoil, filters.isFullArt, filters.onlyReleased,
  ],
  () => {
    if (activeFilterCount() > 0 || filters.name?.trim()) {
      clearTimeout(filterDebounceTimeout)
      filterDebounceTimeout = setTimeout(() => {
        void handleSearch()
      }, 500)
    }
  },
  { deep: true }
)

/**
 * Generation token for the autocomplete request (bug report 2026-08-07).
 * Cancelling suggestionTimeout only helps while the request has not been SENT.
 * Once it is in flight, erasing or retyping left it current, so an out-of-order
 * response for an older prefix won permanently. Same pattern as stores/search.ts
 * (TASK-108) and useSearchSuggestions.
 */
let suggestionReqId = 0

/**
 * Single cancellation path for every "the name field is being emptied" case —
 * the X button, the CLEAR pill, and anything else that blanks filters.name.
 * Blanking the field inline (as both used to) left the armed debounce and the
 * in-flight request alive, so a stale dropdown reopened over an empty input.
 */
const handleClearName = () => {
  clearTimeout(suggestionTimeout)
  suggestionReqId++
  suppressSuggestions.value = true
  filters.name = ''
  suggestions.value = []
  showSuggestions.value = false
}

const handleNameInput = (value: string) => {
  filters.name = value
  suppressSuggestions.value = false
  clearTimeout(suggestionTimeout)
  const reqId = ++suggestionReqId
  if (value.length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }
  suggestionTimeout = setTimeout(() => {
    void (async () => {
      try {
        const results = await getCardSuggestions(value)
        if (reqId !== suggestionReqId) return // superseded — query changed or was cleared
        suggestions.value = results.slice(0, 8)
        showSuggestions.value = !suppressSuggestions.value && suggestions.value.length > 0
      } catch (err) {
        if (reqId !== suggestionReqId) return
        console.error('Error obteniendo sugerencias:', err)
        suggestions.value = []
      }
    })()
  }, 300)
}

const selectSuggestion = (suggestion: string) => {
  filters.name = suggestion
  clearTimeout(suggestionTimeout)
  suggestionReqId++
  suppressSuggestions.value = true
  showSuggestions.value = false
  suggestions.value = []
  void handleSearch()
}

const handleClickOutside = (e: MouseEvent) => {
  if (nameInputContainer.value && !nameInputContainer.value.contains(e.target as Node)) {
    showSuggestions.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  if (props.syncWithRouter) {
    // If URL has ?q= param, populate the name filter and search
    const q = route.query.q
    if (q && typeof q === 'string' && q.trim()) {
      filters.name = q.trim()
      void handleSearch()
    }
  }
  if (props.externalName?.trim()) {
    filters.name = props.externalName.trim()
    void handleSearch()
  }
})
onUnmounted(() => { document.removeEventListener('click', handleClickOutside) })

// Sync externalName → filters.name (debounced by the auto-search watcher downstream)
watch(() => props.externalName, (val) => {
  const next = (val ?? '').trim()
  if (next === (filters.name ?? '').trim()) return
  filters.name = next
  // Use the debounce-aware flow: any non-empty name triggers a search through handleSearch,
  // and an empty name clears it.
  if (next) {
    void handleSearch()
  } else if (!props.autoSearch) {
    emit('clear')
  }
})

// Opciones predefinidas
const colorOptions = [
  { value: 'w', label: '⚪ White' },
  { value: 'u', label: '🔵 Blue' },
  { value: 'b', label: '⚫ Black' },
  { value: 'r', label: '🔴 Red' },
  { value: 'g', label: '🟢 Green' },
  { value: 'c', label: '⚪ Colorless' },
]

const typeOptions = [
  { value: 'creature', label: 'Creature' },
  { value: 'instant', label: 'Instant' },
  { value: 'sorcery', label: 'Sorcery' },
  { value: 'enchantment', label: 'Enchantment' },
  { value: 'artifact', label: 'Artifact' },
  { value: 'planeswalker', label: 'Planeswalker' },
  { value: 'land', label: 'Land' },
]

const rarityOptions = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'mythic', label: 'Mythic' },
]

const selectedManaValues = ref<number[]>([])

const toggleColor = (color: string) => {
  filters.colors ??= []
  const index = filters.colors.indexOf(color)
  if (index > -1) filters.colors.splice(index, 1)
  else filters.colors.push(color)
}

const toggleType = (type: string) => {
  filters.types ??= []
  const index = filters.types.indexOf(type)
  if (index > -1) filters.types.splice(index, 1)
  else filters.types.push(type)
}

const toggleRarity = (rarity: string) => {
  filters.rarity ??= []
  const index = filters.rarity.indexOf(rarity)
  if (index > -1) filters.rarity.splice(index, 1)
  else filters.rarity.push(rarity)
}

const handleSearch = async () => {
  suppressSuggestions.value = true
  showSuggestions.value = false
  if (props.autoSearch) {
    await searchStore.search(filters)
  }
  // Emitted regardless of autoSearch (TASK-111): consumers that own a ?q= URL
  // param (e.g. SearchView) need to hear about every committed search — not
  // just the non-autoSearch ones — so the URL and any term-driven sections
  // stay in sync with whatever was actually searched.
  emit('search', { ...filters })
}

const handleClear = () => {
  // Parallel sibling of the X button — same cancellation path, or the CLEAR pill
  // resurrects a stale suggestion dropdown the same way.
  handleClearName()
  handleAdvancedReset()
  filters.onlyReleased = true
  if (props.autoSearch) {
    searchStore.clearSearch()
  } else {
    emit('clear')
  }
}

// Contar filtros activos
const activeFilterCount = () => {
  let count = 0
  if (filters.name?.trim()) count++
  if (filters.colors?.length) count++
  if (filters.types?.length) count++
  if (filters.manaValue?.min || filters.manaValue?.max || filters.manaValue?.values?.length) count++
  if (filters.rarity?.length) count++
  if (filters.sets?.length) count++
  if (filters.power?.min || filters.power?.max) count++
  if (filters.toughness?.min || filters.toughness?.max) count++
  if (filters.formatLegal?.length) count++
  if (filters.priceUSD?.min || filters.priceUSD?.max) count++
  if (filters.keywords?.length) count++
  if (filters.isFoil) count++
  if (filters.isFullArt) count++
  return count
}

// Label helpers for pills
const getColorLabel = (value: string): string => colorOptions.find(c => c.value === value)?.label ?? value
const getTypeLabel = (value: string): string => typeOptions.find(t => t.value === value)?.label ?? value
const getRarityLabel = (value: string): string => rarityOptions.find(r => r.value === value)?.label ?? value
const getFormatLabel = (value: string): string => formatOptions.find(f => f.value === value)?.label ?? value

const removeFilter = (type: string, value?: string) => {
  switch (type) {
    case 'color': if (value) filters.colors = filters.colors?.filter(c => c !== value); break
    case 'type': if (value) filters.types = filters.types?.filter(t => t !== value); break
    case 'rarity': if (value) filters.rarity = filters.rarity?.filter(r => r !== value); break
    case 'format': if (value) filters.formatLegal = filters.formatLegal?.filter(f => f !== value); break
    case 'set': if (value) filters.sets = filters.sets?.filter(s => s !== value); break
    case 'keyword': if (value) filters.keywords = filters.keywords?.filter(k => k !== value); break
    case 'manaValue': filters.manaValue = { min: undefined, max: undefined, values: undefined }; selectedManaValues.value = []; break
    case 'power': filters.power = { min: undefined, max: undefined }; break
    case 'toughness': filters.toughness = { min: undefined, max: undefined }; break
    case 'priceUSD': filters.priceUSD = { min: undefined, max: undefined }; break
    case 'isFoil': filters.isFoil = false; break
    case 'isFullArt': filters.isFullArt = false; break
  }
}

// Get set name (for pills - uses search store or just code)
const getSetName = (code: string): string => code.toUpperCase()

// v2 redesign — rarity square badge palette (design→app v2 F6, cranial-design/prototype/73-advanced-filters-*.html)
const RARITY_ON_CLASSES: Record<string, string> = {
  common: 'bg-white border-white text-black',
  uncommon: 'bg-[#C0C0C0] border-[#C0C0C0] text-black',
  rare: 'bg-gold border-gold text-black',
  mythic: 'bg-[#CD7F32] border-[#CD7F32] text-black',
}
const RARITY_OFF_CLASSES: Record<string, string> = {
  common: 'bg-surface-1 border-line text-silver hover:border-line-strong',
  uncommon: 'bg-surface-1 border-line text-[#C0C0C0] hover:border-line-strong',
  rare: 'bg-surface-1 border-line text-gold hover:border-line-strong',
  mythic: 'bg-surface-1 border-line text-[#CD7F32] hover:border-line-strong',
}
const pillClasses = 'inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-neon-10 border border-neon-40 text-neon text-tiny font-semibold hover:bg-rust-10 hover:border-rust hover:text-[#C4553F] transition-all duration-200 ease-v2'
</script>

<template>
  <div class="space-y-4">
    <!-- ========== BARRA DE BÚSQUEDA HORIZONTAL ========== -->
    <div class="bg-surface-1 border border-line rounded-lg p-4">
      <!-- Fila 1: Input + Botón Buscar (oculto en modo embebido si hideNameInput) -->
      <div v-if="!hideNameInput" class="flex gap-3 mb-4">
        <div ref="nameInputContainer" class="relative flex-1">
          <input
              :value="filters.name"
              @input="handleNameInput(($event.target as HTMLInputElement).value)"
              @keydown.enter="handleSearch"
              :placeholder="t('search.filterPanel.placeholder')"
              type="text"
              class="w-full min-h-[44px] bg-surface-1 border border-line rounded-md px-4 pr-10 text-body text-silver placeholder:text-silver-30 focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2"
          />
          <button
              v-if="filters.name && filters.name.length > 0"
              @click="handleClearName"
              :aria-label="t('common.actions.clear')"
              class="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-silver-30 hover:text-silver transition-colors duration-200 ease-v2 rounded-full hover:bg-surface-2"
              type="button"
          >
            <IconV2 name="x" :size="14" />
          </button>
          <div
              v-if="showSuggestions && suggestions.length > 0"
              class="absolute top-full left-0 right-0 mt-1 bg-[#0d0d0f] border border-line-strong rounded-md max-h-48 overflow-y-auto z-20 shadow-strong"
          >
            <button
                v-for="suggestion in suggestions"
                :key="suggestion"
                type="button"
                @click="selectSuggestion(suggestion)"
                class="w-full px-4 py-2 text-left hover:bg-neon-10 cursor-pointer text-small text-silver border-b border-line last:border-b-0 transition-colors duration-200 ease-v2"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>
        <BaseButton
            variant="filled"
            @click="handleSearch"
            :disabled="searchStore.loading"
            class="px-6 flex items-center gap-2 uppercase tracking-[.1em] !text-[12px]"
        >
          <IconV2 v-if="searchStore.loading" name="sync" :size="16" class="animate-spin" />
          {{ searchStore.loading ? '' : t('search.filterPanel.searchButton') }}
        </BaseButton>
      </div>

      <!-- Advanced syntax hint (TASK-109): -word / "exact" / o:text / t:type -->
      <div v-if="!hideNameInput" class="flex items-center gap-1.5 -mt-2.5 mb-4 ml-0.5">
        <span class="text-tiny text-silver-30">{{ t('search.filterPanel.syntaxHintLabel') }}</span>
        <HelpTooltip
            :text="t('help.tooltips.search.advancedSyntax')"
            :title="t('help.titles.advancedSyntax')"
        />
      </div>

      <!-- Fila 2: Filtros rápidos horizontales -->
      <div class="flex flex-wrap gap-2 items-center">
        <!-- Colores -->
        <div class="flex gap-1.5" role="group" :aria-label="t('search.modal.sections.colors')">
          <button
              v-for="color in colorOptions"
              :key="color.value"
              type="button"
              @click="toggleColor(color.value)"
              :class="[
                'w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 ease-v2',
                filters.colors?.includes(color.value)
                  ? 'border-neon shadow-glow-neon'
                  : 'border-line-strong hover:border-silver-30'
              ]"
              :title="color.label"
              :aria-pressed="filters.colors?.includes(color.value)"
          >
            <ManaIcon :symbol="color.value.toUpperCase()" size="small" />
          </button>
        </div>

        <span class="hidden sm:block w-px h-6 bg-line" aria-hidden="true"></span>

        <!-- Tipos rápidos -->
        <div class="flex flex-wrap gap-1.5">
          <button
              v-for="type in typeOptions.slice(0, 4)"
              :key="type.value"
              type="button"
              @click="toggleType(type.value)"
              :class="[
                'min-h-[32px] px-3 rounded-full text-tiny font-semibold border transition-all duration-200 ease-v2',
                filters.types?.includes(type.value)
                  ? 'text-neon bg-neon-10 border-neon-40'
                  : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong'
              ]"
          >
            {{ type.label }}
          </button>
        </div>

        <span class="hidden sm:block w-px h-6 bg-line" aria-hidden="true"></span>

        <!-- Rarezas -->
        <div class="flex gap-1.5">
          <button
              v-for="rarity in rarityOptions"
              :key="rarity.value"
              type="button"
              @click="toggleRarity(rarity.value)"
              :class="[
                'w-8 h-7 rounded-md font-display text-tiny font-bold border transition-all duration-200 ease-v2 flex items-center justify-center',
                filters.rarity?.includes(rarity.value) ? RARITY_ON_CLASSES[rarity.value] : RARITY_OFF_CLASSES[rarity.value]
              ]"
              :title="rarity.label"
          >
            {{ rarity.label.charAt(0) }}
          </button>
        </div>

        <span v-if="!hideNameInput" class="hidden sm:block w-px h-6 bg-line" aria-hidden="true"></span>

        <!-- Only Released checkbox (hidden when embedded to keep UI lean) -->
        <label v-if="!hideNameInput" class="flex items-center gap-2 cursor-pointer">
          <input v-model="filters.onlyReleased" type="checkbox" class="w-4 h-4 accent-neon rounded" />
          <span class="text-tiny text-silver-70">{{ t('search.filterPanel.onlyReleased') }}</span>
          <HelpTooltip :text="t('help.tooltips.search.onlyReleased')" :title="t('help.titles.onlyReleased')" />
        </label>

        <span class="hidden sm:block w-px h-6 bg-line" aria-hidden="true"></span>

        <!-- Toggle Filtros Avanzados -->
        <button
            type="button"
            @click="showAdvancedFilters = !showAdvancedFilters"
            :class="[
              'min-h-[34px] px-3.5 rounded-full text-tiny font-bold uppercase tracking-[.06em] flex items-center gap-2 border transition-all duration-200 ease-v2',
              showAdvancedFilters || activeFilterCount() > 3
                ? 'text-neon bg-neon-10 border-neon-40'
                : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong'
            ]"
        >
          <IconV2 name="filter" :size="15" />
          {{ t('search.filterPanel.moreFilters') }}
          <span v-if="activeFilterCount() > 0" class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-neon text-primary font-display text-[11px] font-bold">{{ activeFilterCount() }}</span>
        </button>

        <!-- Limpiar -->
        <button
            v-if="activeFilterCount() > 0"
            type="button"
            @click="handleClear"
            class="min-h-[34px] px-3.5 rounded-full text-tiny font-bold uppercase tracking-[.06em] text-[#C4553F] border border-rust hover:bg-rust hover:text-silver transition-all duration-200 ease-v2"
        >
          {{ t('search.filterPanel.clear') }}
        </button>
      </div>

      <!-- Pills de filtros seleccionados -->
      <div v-if="activeFilterCount() > 0" class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line">
        <button v-for="color in filters.colors" :key="`color-${color}`" type="button" @click="removeFilter('color', color)" :class="pillClasses">
          {{ getColorLabel(color) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="type in filters.types" :key="`type-${type}`" type="button" @click="removeFilter('type', type)" :class="pillClasses">
          {{ getTypeLabel(type) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="rarity in filters.rarity" :key="`rarity-${rarity}`" type="button" @click="removeFilter('rarity', rarity)" :class="pillClasses">
          {{ getRarityLabel(rarity) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="format in filters.formatLegal" :key="`format-${format}`" type="button" @click="removeFilter('format', format)" :class="pillClasses">
          {{ getFormatLabel(format) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="setCode in filters.sets" :key="`set-${setCode}`" type="button" @click="removeFilter('set', setCode)" :class="pillClasses">
          {{ getSetName(setCode) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="keyword in filters.keywords" :key="`keyword-${keyword}`" type="button" @click="removeFilter('keyword', keyword)" :class="pillClasses">
          {{ getKeywordLabel(keyword) }} <IconV2 name="x" :size="12" />
        </button>
        <button
            v-if="filters.manaValue?.values?.length || filters.manaValue?.min !== undefined || filters.manaValue?.max !== undefined"
            type="button" @click="removeFilter('manaValue')" :class="pillClasses"
        >
          MV: {{ filters.manaValue?.values?.length ? filters.manaValue.values.map(v => v === 10 ? '10+' : v).join(', ') : `${filters.manaValue?.min ?? '?'}-${filters.manaValue?.max ?? '?'}` }} <IconV2 name="x" :size="12" />
        </button>
        <button v-if="filters.power?.min !== undefined || filters.power?.max !== undefined" type="button" @click="removeFilter('power')" :class="pillClasses">
          POW: {{ filters.power?.min ?? '?' }}-{{ filters.power?.max ?? '?' }} <IconV2 name="x" :size="12" />
        </button>
        <button v-if="filters.toughness?.min !== undefined || filters.toughness?.max !== undefined" type="button" @click="removeFilter('toughness')" :class="pillClasses">
          TOU: {{ filters.toughness?.min ?? '?' }}-{{ filters.toughness?.max ?? '?' }} <IconV2 name="x" :size="12" />
        </button>
        <button v-if="filters.priceUSD?.min !== undefined || filters.priceUSD?.max !== undefined" type="button" @click="removeFilter('priceUSD')" :class="pillClasses">
          ${{ filters.priceUSD?.min ?? '?' }}-${{ filters.priceUSD?.max ?? '?' }} <IconV2 name="x" :size="12" />
        </button>
        <button v-if="filters.isFoil" type="button" @click="removeFilter('isFoil')" :class="pillClasses">
          Foil <IconV2 name="x" :size="12" />
        </button>
        <button v-if="filters.isFullArt" type="button" @click="removeFilter('isFullArt')" :class="pillClasses">
          Full Art <IconV2 name="x" :size="12" />
        </button>
      </div>

      <!-- Indicador de auto-búsqueda -->
      <div v-if="activeFilterCount() > 0" class="mt-2 text-tiny text-silver-30">
        {{ t('search.filterPanel.autoSearch') }}
      </div>
    </div>

    <!-- ========== FILTROS AVANZADOS (Modal compartido) ========== -->
    <AdvancedFilterModal
        :show="showAdvancedFilters"
        :filters="advancedFiltersForModal"
        mode="scryfall"
        @close="showAdvancedFilters = false"
        @update:filters="handleAdvancedFiltersUpdate"
        @reset="handleAdvancedReset"
    />
  </div>
</template>

<style scoped>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(238, 238, 238, 0.2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(238, 238, 238, 0.4); }
</style>
