<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { type FilterOptions, useSearchStore } from '../../stores/search'
import { getCardSuggestions } from '../../services/scryfall'
import { formatOptions, getKeywordLabel } from '../../utils/filterKeywords'
import AdvancedFilterModal, { type AdvancedFilters } from './AdvancedFilterModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import SvgIcon from '../ui/SvgIcon.vue'
import ManaIcon from '../ui/ManaIcon.vue'
import HelpTooltip from '../ui/HelpTooltip.vue'

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
  isFoil: false,
  isFullArt: false,
  onlyReleased: true,
})

// Bridge: FilterOptions reactive <-> AdvancedFilters for the modal
const advancedFiltersForModal = computed<AdvancedFilters>(() => ({
  colors: filters.colors || [],
  types: filters.types || [],
  manaValue: filters.manaValue || { min: undefined, max: undefined, values: undefined },
  rarity: filters.rarity || [],
  sets: filters.sets || [],
  power: filters.power || { min: undefined, max: undefined },
  toughness: filters.toughness || { min: undefined, max: undefined },
  formatLegal: filters.formatLegal || [],
  priceUSD: filters.priceUSD || { min: undefined, max: undefined },
  keywords: filters.keywords || [],
  isFoil: filters.isFoil || false,
  isFullArt: filters.isFullArt || false,
}))

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
  filters.isFoil = updated.isFoil
  filters.isFullArt = updated.isFullArt
}

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
        handleSearch()
      }, 500)
    }
  },
  { deep: true }
)

const handleNameInput = async (value: string) => {
  filters.name = value
  suppressSuggestions.value = false
  clearTimeout(suggestionTimeout)
  if (value.length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }
  suggestionTimeout = setTimeout(() => {
    void (async () => {
      try {
        const results = await getCardSuggestions(value)
        suggestions.value = results.slice(0, 8)
        showSuggestions.value = !suppressSuggestions.value && suggestions.value.length > 0
      } catch (err) {
        console.error('Error obteniendo sugerencias:', err)
        suggestions.value = []
      }
    })()
  }, 300)
}

const selectSuggestion = (suggestion: string) => {
  filters.name = suggestion
  suppressSuggestions.value = true
  showSuggestions.value = false
  suggestions.value = []
  handleSearch()
}

const handleClickOutside = (e: MouseEvent) => {
  if (nameInputContainer.value && !nameInputContainer.value.contains(e.target as Node)) {
    showSuggestions.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  // If URL has ?q= param, populate the name filter and search
  const q = route.query.q
  if (q && typeof q === 'string' && q.trim()) {
    filters.name = q.trim()
    handleSearch()
  }
})
onUnmounted(() => { document.removeEventListener('click', handleClickOutside) })

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
  const index = filters.colors!.indexOf(color)
  if (index > -1) filters.colors!.splice(index, 1)
  else filters.colors!.push(color)
}

const toggleType = (type: string) => {
  const index = filters.types!.indexOf(type)
  if (index > -1) filters.types!.splice(index, 1)
  else filters.types!.push(type)
}

const toggleRarity = (rarity: string) => {
  const index = filters.rarity!.indexOf(rarity)
  if (index > -1) filters.rarity!.splice(index, 1)
  else filters.rarity!.push(rarity)
}

const handleSearch = async () => {
  suppressSuggestions.value = true
  showSuggestions.value = false
  await searchStore.search(filters)
}

const handleClear = () => {
  filters.name = ''
  handleAdvancedReset()
  filters.onlyReleased = true
  searchStore.clearSearch()
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
const getColorLabel = (value: string): string => colorOptions.find(c => c.value === value)?.label || value
const getTypeLabel = (value: string): string => typeOptions.find(t => t.value === value)?.label || value
const getRarityLabel = (value: string): string => rarityOptions.find(r => r.value === value)?.label || value
const getFormatLabel = (value: string): string => formatOptions.find(f => f.value === value)?.label || value

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
</script>

<template>
  <div class="space-y-4">
    <!-- ========== BARRA DE BÚSQUEDA HORIZONTAL ========== -->
    <div class="bg-primary border border-silver-30 p-4 rounded-md">
      <!-- Fila 1: Input + Botón Buscar -->
      <div class="flex gap-3 mb-4">
        <div ref="nameInputContainer" class="relative flex-1">
          <input
              :value="filters.name"
              @input="handleNameInput(($event.target as HTMLInputElement).value)"
              @keydown.enter="handleSearch"
              :placeholder="t('search.filterPanel.placeholder')"
              type="text"
              class="w-full bg-primary border border-silver-30 px-4 pr-10 py-3 text-body text-silver placeholder-silver-50 focus:border-neon focus:outline-none transition-fast rounded"
          />
          <button
              v-if="filters.name && filters.name.length > 0"
              @click="filters.name = ''; showSuggestions = false; suggestions = []"
              class="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-silver-20"
              type="button"
          >
            ✕
          </button>
          <div
              v-if="showSuggestions && suggestions.length > 0"
              class="absolute top-full left-0 right-0 bg-primary border border-neon mt-1 max-h-48 overflow-y-auto z-20 rounded"
          >
            <div
                v-for="suggestion in suggestions"
                :key="suggestion"
                @click="selectSuggestion(suggestion)"
                class="px-4 py-2 hover:bg-neon-10 cursor-pointer text-small text-silver border-b border-silver-30 transition-fast"
            >
              {{ suggestion }}
            </div>
          </div>
        </div>
        <BaseButton
            @click="handleSearch"
            :disabled="searchStore.loading"
            class="px-6 flex items-center gap-2"
        >
          <SvgIcon :name="searchStore.loading ? 'loading' : 'search'" size="tiny" />
          {{ searchStore.loading ? '' : t('search.filterPanel.searchButton') }}
        </BaseButton>
      </div>

      <!-- Fila 2: Filtros rápidos horizontales -->
      <div class="flex flex-wrap gap-2 items-center">
        <!-- Colores -->
        <div class="flex gap-1">
          <button
              v-for="color in colorOptions"
              :key="color.value"
              @click="toggleColor(color.value)"
              :class="[
                'w-8 h-8 text-sm font-bold transition-fast flex items-center justify-center rounded',
                filters.colors?.includes(color.value)
                  ? 'bg-neon text-primary border-2 border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
              :title="color.label"
          >
            <ManaIcon :symbol="color.value.toUpperCase()" size="small" />
          </button>
        </div>

        <span class="text-silver-30">|</span>

        <!-- Tipos rápidos -->
        <div class="flex flex-wrap gap-1">
          <button
              v-for="type in typeOptions.slice(0, 4)"
              :key="type.value"
              @click="toggleType(type.value)"
              :class="[
                'px-2 py-1 text-tiny font-bold transition-fast',
                filters.types?.includes(type.value)
                  ? 'bg-neon text-primary border border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
          >
            {{ type.label }}
          </button>
        </div>

        <span class="text-silver-30">|</span>

        <!-- Rarezas -->
        <div class="flex gap-1">
          <button
              v-for="rarity in rarityOptions"
              :key="rarity.value"
              @click="toggleRarity(rarity.value)"
              :class="[
                'px-2 py-1 text-tiny font-bold transition-fast border',
                filters.rarity?.includes(rarity.value)
                  ? rarity.value === 'common' ? 'bg-white text-black border-white'
                    : rarity.value === 'uncommon' ? 'bg-[#C0C0C0] text-black border-[#C0C0C0]'
                    : rarity.value === 'rare' ? 'bg-[#FFD700] text-black border-[#FFD700]'
                    : 'bg-[#CD7F32] text-black border-[#CD7F32]'
                  : rarity.value === 'common' ? 'bg-silver-10 border-silver-30 text-white hover:border-white'
                    : rarity.value === 'uncommon' ? 'bg-silver-10 border-silver-30 text-[#C0C0C0] hover:border-[#C0C0C0]'
                    : rarity.value === 'rare' ? 'bg-silver-10 border-silver-30 text-[#FFD700] hover:border-[#FFD700]'
                    : 'bg-silver-10 border-silver-30 text-[#CD7F32] hover:border-[#CD7F32]'
              ]"
          >
            {{ rarity.label.charAt(0) }}
          </button>
        </div>

        <span class="text-silver-30">|</span>

        <!-- Only Released checkbox -->
        <label class="flex items-center gap-1 cursor-pointer">
          <input v-model="filters.onlyReleased" type="checkbox" class="w-4 h-4 accent-neon" />
          <span class="text-tiny text-silver-70">{{ t('search.filterPanel.onlyReleased') }}</span>
          <HelpTooltip :text="t('help.tooltips.search.onlyReleased')" :title="t('help.titles.onlyReleased')" />
        </label>

        <span class="text-silver-30">|</span>

        <!-- Toggle Filtros Avanzados -->
        <button
            @click="showAdvancedFilters = !showAdvancedFilters"
            :class="[
              'px-3 py-1 text-tiny font-bold transition-fast flex items-center gap-2',
              showAdvancedFilters || activeFilterCount() > 3
                ? 'bg-neon-10 border border-neon text-neon'
                : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
            ]"
        >
          <SvgIcon name="settings" size="tiny" />
          {{ t('search.filterPanel.moreFilters') }}
          <span v-if="activeFilterCount() > 0" class="bg-neon text-primary px-1 rounded text-tiny">{{ activeFilterCount() }}</span>
        </button>

        <!-- Limpiar -->
        <button
            v-if="activeFilterCount() > 0"
            @click="handleClear"
            class="px-3 py-1 text-tiny font-bold text-rust border border-rust hover:bg-rust hover:text-primary transition-fast"
        >
          {{ t('search.filterPanel.clear') }}
        </button>
      </div>

      <!-- Pills de filtros seleccionados -->
      <div v-if="activeFilterCount() > 0" class="flex flex-wrap gap-1 mt-3 pt-3 border-t border-silver-20">
        <button v-for="color in filters.colors" :key="`color-${color}`" @click="removeFilter('color', color)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getColorLabel(color) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="type in filters.types" :key="`type-${type}`" @click="removeFilter('type', type)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getTypeLabel(type) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="rarity in filters.rarity" :key="`rarity-${rarity}`" @click="removeFilter('rarity', rarity)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getRarityLabel(rarity) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="format in filters.formatLegal" :key="`format-${format}`" @click="removeFilter('format', format)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getFormatLabel(format) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="setCode in filters.sets" :key="`set-${setCode}`" @click="removeFilter('set', setCode)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getSetName(setCode) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="keyword in filters.keywords" :key="`keyword-${keyword}`" @click="removeFilter('keyword', keyword)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getKeywordLabel(keyword) }} <span class="opacity-70">×</span>
        </button>
        <button v-if="filters.manaValue?.values?.length || filters.manaValue?.min !== undefined || filters.manaValue?.max !== undefined"
            @click="removeFilter('manaValue')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          MV: {{ filters.manaValue?.values?.length ? filters.manaValue.values.map(v => v === 10 ? '10+' : v).join(', ') : `${filters.manaValue?.min ?? '?'}-${filters.manaValue?.max ?? '?'}` }} <span class="opacity-70">×</span>
        </button>
        <button v-if="filters.power?.min !== undefined || filters.power?.max !== undefined" @click="removeFilter('power')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          POW: {{ filters.power?.min ?? '?' }}-{{ filters.power?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>
        <button v-if="filters.toughness?.min !== undefined || filters.toughness?.max !== undefined" @click="removeFilter('toughness')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          TOU: {{ filters.toughness?.min ?? '?' }}-{{ filters.toughness?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>
        <button v-if="filters.priceUSD?.min !== undefined || filters.priceUSD?.max !== undefined" @click="removeFilter('priceUSD')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          ${{ filters.priceUSD?.min ?? '?' }}-${{ filters.priceUSD?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>
        <button v-if="filters.isFoil" @click="removeFilter('isFoil')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          Foil <span class="opacity-70">×</span>
        </button>
        <button v-if="filters.isFullArt" @click="removeFilter('isFullArt')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          Full Art <span class="opacity-70">×</span>
        </button>
      </div>

      <!-- Indicador de auto-búsqueda -->
      <div v-if="activeFilterCount() > 0" class="mt-2 text-tiny text-silver-50">
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
