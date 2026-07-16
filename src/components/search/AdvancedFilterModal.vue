<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { allCommonEffects, allCreatureTypes, allSetMechanics, combatAbilities, commonEffects, formatOptions, getKeywordLabel, setMechanics, specialTypes, triggerKeywords } from '../../utils/filterKeywords'
import { getAllSets, type ScryfallSet } from '../../services/scryfall'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
import IconV2 from '../ui/IconV2.vue'
import ManaIcon from '../ui/ManaIcon.vue'
import HelpTooltip from '../ui/HelpTooltip.vue'

export interface AdvancedFilters {
  colors: string[]
  types: string[]
  manaValue: { min?: number; max?: number; values?: number[] }
  rarity: string[]
  sets: string[]
  power: { min?: number; max?: number }
  toughness: { min?: number; max?: number }
  formatLegal: string[]
  priceUSD: { min?: number; max?: number }
  keywords: string[]
  creatureTypes: string[]
  isFoil: boolean
  isFullArt: boolean
}

const props = withDefaults(defineProps<{
  show: boolean
  filters: AdvancedFilters
  /** When 'local', sets come from localSets prop. When 'scryfall', sets load from API. */
  mode?: 'scryfall' | 'local'
  /** Sets available in the user's collection (only used when mode='local') */
  localSets?: { code: string; name: string }[]
  /** Creature types available in the user's collection (only used when mode='local') */
  localCreatureTypes?: { value: string; label: string; count: number }[]
  /** ANY/EXACT color filter mode (only used when mode='local') */
  exactColorMode?: boolean
}>(), {
  mode: 'scryfall',
  localSets: () => [],
  localCreatureTypes: () => [],
  exactColorMode: false,
})

const emit = defineEmits<{
  close: []
  'update:filters': [filters: AdvancedFilters]
  'reset': []
  'update:exactColorMode': [value: boolean]
}>()

const { t } = useI18n()

// ========== Internal mutable copy of filters ==========
// We work on a local copy and emit changes on every mutation
const f = ref<AdvancedFilters>({ ...props.filters })

// Sync from parent when filters prop changes
watch(() => props.filters, (newVal) => {
  f.value = { ...newVal }
}, { deep: true })

const emitUpdate = () => {
  emit('update:filters', { ...f.value })
}

// ========== Accordions ==========
const openAccordions = ref<Set<string>>(new Set())
const toggleAccordion = (id: string) => {
  if (openAccordions.value.has(id)) openAccordions.value.delete(id)
  else openAccordions.value.add(id)
}
const isAccordionOpen = (id: string) => openAccordions.value.has(id)

// ========== Filter search ==========
const filterSearchQuery = ref('')
const filterSearchResults = computed(() => {
  const query = filterSearchQuery.value.toLowerCase().trim()
  if (!query || query.length < 2) return []
  const creatureTypeSource = props.mode === 'local' && props.localCreatureTypes.length > 0
    ? props.localCreatureTypes.map(ct => ({ value: ct.value, label: ct.label }))
    : allCreatureTypes
  const allFilters = [
    ...combatAbilities.map(k => ({ ...k, category: 'Combate', isCreatureType: false })),
    ...allCommonEffects.map(k => ({ ...k, category: 'Efectos', isCreatureType: false })),
    ...triggerKeywords.map(k => ({ ...k, category: 'Triggers', isCreatureType: false })),
    ...allSetMechanics.map(k => ({ ...k, category: 'Mecánicas', isCreatureType: false })),
    ...specialTypes.map(k => ({ ...k, category: 'Tipos', isCreatureType: false })),
    ...creatureTypeSource.map(k => ({ ...k, category: 'Creature Types', isCreatureType: true })),
  ]
  return allFilters
    .filter(k => k.label.toLowerCase().includes(query) || k.value.toLowerCase().includes(query))
    .slice(0, 10)
})

// ========== Sets (Scryfall mode) ==========
const allSets = ref<ScryfallSet[]>([])
const setsLoading = ref(false)
const setSearchQuery = ref('')

const loadSets = async () => {
  if (props.mode !== 'scryfall' || allSets.value.length > 0) return
  setsLoading.value = true
  try {
    allSets.value = await getAllSets()
  } finally {
    setsLoading.value = false
  }
}

const displaySets = computed(() => {
  if (props.mode === 'local') {
    const q = setSearchQuery.value.toLowerCase().trim()
    if (!q) return props.localSets
    return props.localSets.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    )
  }
  // Scryfall mode
  const q = setSearchQuery.value.toLowerCase().trim()
  if (!q) return allSets.value.slice(0, 50)
  return allSets.value.filter(s =>
    s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
  ).slice(0, 50)
})

const getSetName = (code: string): string => {
  if (props.mode === 'local') {
    return props.localSets.find(s => s.code === code)?.name ?? code.toUpperCase()
  }
  return allSets.value.find(s => s.code === code)?.name ?? code.toUpperCase()
}

// ========== Mana values ==========
const manaValueOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const isManaValueSelected = (value: number) => {
  return f.value.manaValue.values?.includes(value) ?? false
}

const toggleManaValue = (value: number) => {
  const current = f.value.manaValue.values ?? []
  const index = current.indexOf(value)
  if (index > -1) {
    current.splice(index, 1)
  } else {
    current.push(value)
  }
  f.value.manaValue = current.length > 0
    ? { values: [...current].sort((a, b) => a - b) }
    : { min: undefined, max: undefined, values: undefined }
  emitUpdate()
}

const clearManaValueSelection = () => {
  f.value.manaValue = { min: undefined, max: undefined, values: undefined }
  emitUpdate()
}

// ========== Toggle helpers ==========
const toggleInArray = (arr: string[], value: string): string[] => {
  const index = arr.indexOf(value)
  if (index > -1) {
    arr.splice(index, 1)
  } else {
    arr.push(value)
  }
  return [...arr]
}

const toggleColor = (color: string) => { f.value.colors = toggleInArray(f.value.colors, color); emitUpdate() }
const toggleType = (type: string) => { f.value.types = toggleInArray(f.value.types, type); emitUpdate() }
const toggleRarity = (rarity: string) => { f.value.rarity = toggleInArray(f.value.rarity, rarity); emitUpdate() }
const toggleFormat = (format: string) => { f.value.formatLegal = toggleInArray(f.value.formatLegal, format); emitUpdate() }
const toggleKeyword = (keyword: string) => { f.value.keywords = toggleInArray(f.value.keywords, keyword); emitUpdate() }
const toggleSet = (setCode: string) => { f.value.sets = toggleInArray(f.value.sets, setCode); emitUpdate() }
const toggleCreatureType = (type: string) => { f.value.creatureTypes = toggleInArray(f.value.creatureTypes, type); emitUpdate() }

// ========== Creature Types ==========
const creatureTypeSearchQuery = ref('')
const showAllCreatureTypes = ref(false)

const displayCreatureTypes = computed(() => {
  const source = props.mode === 'local' && props.localCreatureTypes.length > 0
    ? props.localCreatureTypes
    : allCreatureTypes.map(ct => ({ ...ct, count: 0 }))
  const q = creatureTypeSearchQuery.value.toLowerCase().trim()
  const filtered = q
    ? source.filter(ct => ct.label.toLowerCase().includes(q) || ct.value.toLowerCase().includes(q))
    : source
  if (showAllCreatureTypes.value || q) return filtered
  return filtered.slice(0, 20)
})

const totalCreatureTypeCount = computed(() => {
  if (props.mode === 'local' && props.localCreatureTypes.length > 0) return props.localCreatureTypes.length
  return allCreatureTypes.length
})

const getCreatureTypeLabel = (value: string): string => {
  if (props.mode === 'local') {
    const found = props.localCreatureTypes.find(ct => ct.value === value)
    if (found) return found.label
  }
  return allCreatureTypes.find(ct => ct.value === value)?.label ?? value.charAt(0).toUpperCase() + value.slice(1)
}

// ========== Counting ==========
const countSelectedInCategory = (categoryKeywords: { value: string }[]) => {
  if (!f.value.keywords?.length) return 0
  return categoryKeywords.filter(kw => f.value.keywords.includes(kw.value)).length
}

const activeFilterCount = computed(() => {
  let count = 0
  if (f.value.colors?.length) count++
  if (f.value.types?.length) count++
  if (f.value.manaValue?.min || f.value.manaValue?.max || f.value.manaValue?.values?.length) count++
  if (f.value.rarity?.length) count++
  if (f.value.sets?.length) count++
  if (f.value.power?.min !== undefined || f.value.power?.max !== undefined) count++
  if (f.value.toughness?.min !== undefined || f.value.toughness?.max !== undefined) count++
  if (f.value.formatLegal?.length) count++
  if (f.value.priceUSD?.min !== undefined || f.value.priceUSD?.max !== undefined) count++
  if (f.value.keywords?.length) count++
  if (f.value.creatureTypes?.length) count++
  if (f.value.isFoil) count++
  if (f.value.isFullArt) count++
  return count
})

// ========== Options ==========
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

const getColorLabel = (value: string): string => colorOptions.find(c => c.value === value)?.label ?? value
const getTypeLabel = (value: string): string => typeOptions.find(t => t.value === value)?.label ?? value
const getRarityLabel = (value: string): string => rarityOptions.find(r => r.value === value)?.label ?? value
const getFormatLabel = (value: string): string => formatOptions.find(f => f.value === value)?.label ?? value

// ========== Remove individual filter ==========
const removeFilter = (type: string, value?: string) => {
  switch (type) {
    case 'color':
      if (value) f.value.colors = f.value.colors.filter(c => c !== value)
      break
    case 'type':
      if (value) f.value.types = f.value.types.filter(t => t !== value)
      break
    case 'rarity':
      if (value) f.value.rarity = f.value.rarity.filter(r => r !== value)
      break
    case 'format':
      if (value) f.value.formatLegal = f.value.formatLegal.filter(fl => fl !== value)
      break
    case 'set':
      if (value) f.value.sets = f.value.sets.filter(s => s !== value)
      break
    case 'keyword':
      if (value) f.value.keywords = f.value.keywords.filter(k => k !== value)
      break
    case 'creatureType':
      if (value) f.value.creatureTypes = f.value.creatureTypes.filter(ct => ct !== value)
      break
    case 'manaValue':
      f.value.manaValue = { min: undefined, max: undefined, values: undefined }
      break
    case 'power':
      f.value.power = { min: undefined, max: undefined }
      break
    case 'toughness':
      f.value.toughness = { min: undefined, max: undefined }
      break
    case 'priceUSD':
      f.value.priceUSD = { min: undefined, max: undefined }
      break
    case 'isFoil':
      f.value.isFoil = false
      break
    case 'isFullArt':
      f.value.isFullArt = false
      break
  }
  emitUpdate()
}

const handleReset = () => {
  f.value = {
    colors: [], types: [], manaValue: { min: undefined, max: undefined, values: undefined },
    rarity: [], sets: [], power: { min: undefined, max: undefined },
    toughness: { min: undefined, max: undefined }, formatLegal: [],
    priceUSD: { min: undefined, max: undefined }, keywords: [], creatureTypes: [],
    isFoil: false, isFullArt: false,
  }
  emit('reset')
  emitUpdate()
}

// v2 redesign — rarity square badge palette + shared pill treatment
// (design→app v2 F6, cranial-design/prototype/73-advanced-filters-*.html)
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
const chipClasses = (active: boolean) => [
  'min-h-[34px] px-3.5 rounded-full text-tiny font-semibold border transition-all duration-200 ease-v2',
  active
    ? 'text-neon bg-neon-10 border-neon-40'
    : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong',
]
const inputClasses = 'w-full min-h-[40px] bg-surface-1 border border-line rounded-md px-3 text-small text-silver placeholder:text-silver-30 focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2'
</script>

<template>
  <BaseModal
      :show="show"
      @close="emit('close'); filterSearchQuery = ''"
  >
    <div class="space-y-5">
      <!-- Header -->
      <div class="flex items-center gap-3 pr-8">
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('search.modal.title') }}</h2>
        <template v-if="activeFilterCount > 0">
          <span class="inline-flex items-center justify-center min-w-[22px] h-[22px] px-2 rounded-full bg-neon text-primary font-display text-tiny font-bold">{{ activeFilterCount }}</span>
          <span class="text-small text-silver-50">{{ t('search.modal.activeFilters') }}</span>
        </template>
      </div>

      <!-- Buscador de filtros -->
      <div class="relative">
        <IconV2 name="search" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-silver-30 pointer-events-none" />
        <input
            v-model="filterSearchQuery"
            type="text"
            :placeholder="t('search.filterPanel.filterSearchPlaceholder')"
            class="w-full min-h-[46px] bg-surface-1 border border-neon-40 rounded-md pl-11 pr-10 text-body text-silver placeholder:text-silver-50 focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2"
        />
        <button
            v-if="filterSearchQuery.length > 0"
            @click="filterSearchQuery = ''"
            :aria-label="t('common.actions.clear')"
            class="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-silver-50 hover:text-silver transition-colors duration-200 ease-v2 rounded-full hover:bg-surface-2"
            type="button"
        >
          <IconV2 name="x" :size="14" />
        </button>
        <div
            v-if="filterSearchResults.length > 0"
            class="absolute top-full left-0 right-0 mt-1 bg-[#0d0d0f] border border-line-strong rounded-md max-h-64 overflow-y-auto z-20 shadow-strong"
        >
          <button
              v-for="result in filterSearchResults"
              :key="result.value"
              type="button"
              @click="result.isCreatureType ? toggleCreatureType(result.value) : toggleKeyword(result.value)"
              class="w-full px-4 py-2 flex items-center justify-between hover:bg-neon-10 transition-colors duration-200 ease-v2 border-b border-line last:border-b-0"
          >
            <span class="text-small text-silver">
              {{ result.label }}
              <span class="text-tiny text-silver-50 ml-2">{{ result.category }}</span>
            </span>
            <IconV2 v-if="result.isCreatureType ? f.creatureTypes?.includes(result.value) : f.keywords?.includes(result.value)" name="check" :size="14" class="text-neon" />
          </button>
        </div>
        <div
            v-if="filterSearchQuery.length >= 2 && filterSearchResults.length === 0"
            class="absolute top-full left-0 right-0 mt-1 bg-[#0d0d0f] border border-line-strong rounded-md px-4 py-3 text-small text-silver-50 z-20 shadow-strong"
        >
          {{ t('search.filterPanel.noFilterResults', { query: filterSearchQuery }) }}
        </div>
      </div>

      <!-- Active filter pills -->
      <div v-if="activeFilterCount > 0" class="flex flex-wrap gap-1.5">
        <button v-for="color in f.colors" :key="`c-${color}`" type="button" @click="removeFilter('color', color)" :class="pillClasses">
          {{ getColorLabel(color) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="type in f.types" :key="`t-${type}`" type="button" @click="removeFilter('type', type)" :class="pillClasses">
          {{ getTypeLabel(type) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="rarity in f.rarity" :key="`r-${rarity}`" type="button" @click="removeFilter('rarity', rarity)" :class="pillClasses">
          {{ getRarityLabel(rarity) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="format in f.formatLegal" :key="`f-${format}`" type="button" @click="removeFilter('format', format)" :class="pillClasses">
          {{ getFormatLabel(format) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="setCode in f.sets" :key="`s-${setCode}`" type="button" @click="removeFilter('set', setCode)" :class="pillClasses">
          {{ getSetName(setCode) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="keyword in f.keywords" :key="`k-${keyword}`" type="button" @click="removeFilter('keyword', keyword)" :class="pillClasses">
          {{ getKeywordLabel(keyword) }} <IconV2 name="x" :size="12" />
        </button>
        <button v-for="ct in f.creatureTypes" :key="`ct-${ct}`" type="button" @click="removeFilter('creatureType', ct)" :class="pillClasses">
          {{ getCreatureTypeLabel(ct) }} <IconV2 name="x" :size="12" />
        </button>
        <button
            v-if="f.manaValue?.values?.length || f.manaValue?.min !== undefined || f.manaValue?.max !== undefined"
            type="button" @click="removeFilter('manaValue')" :class="pillClasses"
        >
          MV: {{ f.manaValue?.values?.length ? f.manaValue.values.map(v => v === 10 ? '10+' : v).join(', ') : `${f.manaValue?.min ?? '?'}-${f.manaValue?.max ?? '?'}` }} <IconV2 name="x" :size="12" />
        </button>
        <button v-if="f.power?.min !== undefined || f.power?.max !== undefined" type="button" @click="removeFilter('power')" :class="pillClasses">
          POW: {{ f.power?.min ?? '?' }}-{{ f.power?.max ?? '?' }} <IconV2 name="x" :size="12" />
        </button>
        <button v-if="f.toughness?.min !== undefined || f.toughness?.max !== undefined" type="button" @click="removeFilter('toughness')" :class="pillClasses">
          TOU: {{ f.toughness?.min ?? '?' }}-{{ f.toughness?.max ?? '?' }} <IconV2 name="x" :size="12" />
        </button>
        <button v-if="f.priceUSD?.min !== undefined || f.priceUSD?.max !== undefined" type="button" @click="removeFilter('priceUSD')" :class="pillClasses">
          ${{ f.priceUSD?.min ?? '?' }}-${{ f.priceUSD?.max ?? '?' }} <IconV2 name="x" :size="12" />
        </button>
        <button v-if="f.isFoil" type="button" @click="removeFilter('isFoil')" :class="pillClasses">
          Foil <IconV2 name="x" :size="12" />
        </button>
        <button v-if="f.isFullArt" type="button" @click="removeFilter('isFullArt')" :class="pillClasses">
          Full Art <IconV2 name="x" :size="12" />
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <!-- Colores -->
        <div>
          <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
            {{ t('search.modal.sections.colors') || 'Colors' }}
          </span>
          <div class="flex gap-1.5 flex-wrap">
            <button
                v-for="color in colorOptions"
                :key="color.value"
                type="button"
                @click="toggleColor(color.value)"
                :class="[
                  'w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-200 ease-v2',
                  f.colors?.includes(color.value) ? 'border-neon shadow-glow-neon' : 'border-line-strong hover:border-silver-30'
                ]"
                :title="color.label"
            >
              <ManaIcon :symbol="color.value.toUpperCase()" size="small" />
            </button>
          </div>
          <!-- ANY / EXACT toggle (local mode only) -->
          <div v-if="mode === 'local' && f.colors && f.colors.length > 0" class="flex gap-1.5 mt-2.5">
            <button
                type="button"
                @click="emit('update:exactColorMode', false)"
                :class="[
                  'px-2.5 py-1 rounded-full text-tiny font-bold transition-all duration-200 ease-v2',
                  !exactColorMode ? 'bg-neon text-primary' : 'bg-surface-1 border border-line text-silver-50 hover:border-line-strong'
                ]"
            >
              {{ t('collection.filters.colorModeAny') }}
            </button>
            <button
                type="button"
                @click="emit('update:exactColorMode', true)"
                :class="[
                  'px-2.5 py-1 rounded-full text-tiny font-bold transition-all duration-200 ease-v2',
                  exactColorMode ? 'bg-neon text-primary' : 'bg-surface-1 border border-line text-silver-50 hover:border-line-strong'
                ]"
            >
              {{ t('collection.filters.colorModeExact') }}
            </button>
          </div>
        </div>

        <!-- Todos los tipos -->
        <div>
          <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
            {{ t('search.modal.sections.types') }}
            <HelpTooltip :text="t('help.tooltips.search.types')" :title="t('help.titles.types')" />
          </span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="type in typeOptions" :key="type.value" type="button" @click="toggleType(type.value)" :class="chipClasses(!!f.types?.includes(type.value))">
              {{ type.label }}
            </button>
          </div>
        </div>

        <!-- Rarezas -->
        <div>
          <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
            {{ t('search.modal.sections.rarity') || 'Rarity' }}
          </span>
          <div class="flex gap-1.5">
            <button
                v-for="rarity in rarityOptions"
                :key="rarity.value"
                type="button"
                @click="toggleRarity(rarity.value)"
                :class="[
                  'w-9 h-8 rounded-md font-display text-tiny font-bold border transition-all duration-200 ease-v2 flex items-center justify-center',
                  f.rarity?.includes(rarity.value) ? RARITY_ON_CLASSES[rarity.value] : RARITY_OFF_CLASSES[rarity.value]
                ]"
                :title="rarity.label"
            >
              {{ rarity.label.charAt(0) }}
            </button>
          </div>
        </div>

        <!-- Mana Value -->
        <div class="md:col-span-2 lg:col-span-3">
          <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
            {{ t('search.modal.sections.manaValue') }}
            <HelpTooltip :text="t('help.tooltips.search.manaValue')" :title="t('help.titles.manaValue')" />
          </span>
          <div class="flex flex-wrap gap-1.5 items-center">
            <button
                v-for="mv in manaValueOptions"
                :key="mv"
                type="button"
                @click="toggleManaValue(mv)"
                :class="[
                  'w-9 h-9 rounded-md border flex items-center justify-center transition-all duration-200 ease-v2 font-display text-tiny font-bold',
                  isManaValueSelected(mv) ? 'text-neon bg-neon-10 border-neon-40' : 'text-silver-50 bg-surface-1 border-line hover:border-line-strong'
                ]"
                :title="mv === 10 ? '10+' : String(mv)"
            >
              <ManaIcon v-if="mv < 10" :symbol="String(mv)" size="small" />
              <span v-else>10+</span>
            </button>
            <button
                v-if="f.manaValue?.values?.length"
                type="button"
                @click="clearManaValueSelection"
                class="ml-2 px-2.5 py-1.5 rounded-full text-tiny font-bold text-[#C4553F] border border-rust hover:bg-rust hover:text-silver transition-all duration-200 ease-v2"
            >
              <IconV2 name="x" :size="12" />
            </button>
          </div>
          <p v-if="f.manaValue?.values?.length" class="text-tiny text-silver-50 mt-1.5 font-tnum">
            MV: {{ [...f.manaValue.values].sort((a, b) => a - b).map(v => v === 10 ? '10+' : v).join(', ') }}
          </p>
        </div>

        <!-- Precio USD -->
        <div>
          <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
            {{ t('search.modal.sections.priceUSD') }}
            <HelpTooltip :text="t('help.tooltips.search.priceUSD')" :title="t('help.titles.priceUSD')" />
          </span>
          <div class="flex gap-2">
            <input v-model.number="f.priceUSD.min" @change="emitUpdate()" type="number" placeholder="Min" step="0.01" :class="inputClasses" />
            <input v-model.number="f.priceUSD.max" @change="emitUpdate()" type="number" placeholder="Max" step="0.01" :class="inputClasses" />
          </div>
        </div>

        <!-- Power -->
        <div>
          <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
            {{ t('search.modal.sections.power') }}
            <HelpTooltip :text="t('help.tooltips.search.power')" :title="t('help.titles.power')" />
          </span>
          <div class="flex gap-2">
            <input v-model.number="f.power.min" @change="emitUpdate()" type="number" placeholder="Min" :class="inputClasses" />
            <input v-model.number="f.power.max" @change="emitUpdate()" type="number" placeholder="Max" :class="inputClasses" />
          </div>
        </div>

        <!-- Toughness -->
        <div>
          <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
            {{ t('search.modal.sections.toughness') }}
            <HelpTooltip :text="t('help.tooltips.search.toughness')" :title="t('help.titles.toughness')" />
          </span>
          <div class="flex gap-2">
            <input v-model.number="f.toughness.min" @change="emitUpdate()" type="number" placeholder="Min" :class="inputClasses" />
            <input v-model.number="f.toughness.max" @change="emitUpdate()" type="number" placeholder="Max" :class="inputClasses" />
          </div>
        </div>

        <!-- Formato Legal -->
        <div class="md:col-span-2 lg:col-span-3">
          <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
            {{ t('search.modal.sections.format') }}
            <HelpTooltip :text="t('help.tooltips.search.format')" :title="t('help.titles.format')" />
          </span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="format in formatOptions" :key="format.value" type="button" @click="toggleFormat(format.value)" :class="chipClasses(!!f.formatLegal?.includes(format.value))">
              {{ format.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- ========== EDICIONES / SETS ========== -->
      <div class="border border-line rounded-lg bg-surface-1 overflow-hidden">
        <button
            type="button"
            @click="toggleAccordion('sets'); loadSets()"
            class="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors duration-200 ease-v2"
        >
          <span class="text-small font-semibold text-silver flex items-center gap-2">
            {{ t('search.accordions.sets') }}
            <HelpTooltip :text="t('help.tooltips.search.sets')" :title="t('help.titles.sets')" />
          </span>
          <span class="flex items-center gap-2.5 text-silver-50">
            <span v-if="f.sets?.length" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neon text-primary font-display text-[11px] font-bold">{{ f.sets.length }}</span>
            <IconV2 name="chev-d" :size="16" class="transition-transform duration-200 ease-v2" :class="{ '-rotate-180': isAccordionOpen('sets') }" />
          </span>
        </button>
        <div v-if="isAccordionOpen('sets')" class="px-3.5 py-3 border-t border-line">
          <div class="relative mb-2.5">
            <input
                v-model="setSearchQuery"
                type="text"
                :placeholder="t('search.filterPanel.setSearchPlaceholder')"
                class="w-full min-h-[40px] bg-surface-2 border border-line rounded-md px-3 pr-8 text-small text-silver placeholder:text-silver-30 focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2"
            />
            <button v-if="setSearchQuery.length > 0" type="button" @click="setSearchQuery = ''"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-silver-50 hover:text-silver transition-colors duration-200 ease-v2 rounded-full hover:bg-surface-2">
              <IconV2 name="x" :size="12" />
            </button>
          </div>
          <div v-if="setsLoading" class="text-center py-4 text-silver-50 text-small">{{ t('common.actions.loading') }}...</div>
          <div v-if="f.sets?.length" class="flex flex-wrap gap-1.5 mb-2.5 pb-2.5 border-b border-line">
            <button v-for="setCode in f.sets" :key="`selected-${setCode}`" type="button" @click="toggleSet(setCode)" :class="pillClasses">
              {{ getSetName(setCode) }} <IconV2 name="x" :size="12" />
            </button>
          </div>
          <div v-if="!setsLoading" class="max-h-48 overflow-y-auto space-y-0.5">
            <button
                v-for="set in displaySets"
                :key="set.code"
                type="button"
                @click="toggleSet(set.code)"
                :class="[
                  'w-full px-2.5 py-2 text-left text-small transition-colors duration-200 ease-v2 flex items-center gap-2 rounded-md',
                  f.sets?.includes(set.code) ? 'bg-neon-10 border border-neon-40 text-neon font-semibold' : 'text-silver hover:bg-surface-2'
                ]"
            >
              <span class="flex-1 truncate">{{ set.name }}</span>
              <span class="font-display text-tiny text-silver-50">{{ set.code.toUpperCase() }}</span>
            </button>
            <p v-if="displaySets.length === 0 && setSearchQuery" class="text-tiny text-silver-50 py-2">
              {{ t('search.filterPanel.noSetsFound') }}
            </p>
          </div>
        </div>
      </div>

      <!-- ========== ACORDEONES DE KEYWORDS ========== -->
      <div class="border border-line rounded-lg bg-surface-1 overflow-hidden divide-y divide-line">
        <!-- 1. COMBAT -->
        <div>
          <button type="button" @click="toggleAccordion('combat')" class="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors duration-200 ease-v2">
            <span class="text-small font-semibold text-silver flex items-center gap-2">
              {{ t('search.accordions.combat') }}
              <HelpTooltip :text="t('help.tooltips.search.combat')" :title="t('help.titles.combat')" />
            </span>
            <span class="flex items-center gap-2.5 text-silver-50">
              <span v-if="countSelectedInCategory(combatAbilities) > 0" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neon text-primary font-display text-[11px] font-bold">{{ countSelectedInCategory(combatAbilities) }}</span>
              <IconV2 name="chev-d" :size="16" class="transition-transform duration-200 ease-v2" :class="{ '-rotate-180': isAccordionOpen('combat') }" />
            </span>
          </button>
          <div v-if="isAccordionOpen('combat')" class="px-3.5 py-3 border-t border-line space-y-2">
            <div class="flex flex-wrap gap-1.5">
              <button v-for="keyword in combatAbilities.slice(0, 6)" :key="keyword.value" type="button" @click="toggleKeyword(keyword.value)" :class="chipClasses(!!f.keywords?.includes(keyword.value))">
                {{ keyword.label }}
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5 pt-2 border-t border-line/50">
              <button v-for="keyword in combatAbilities.slice(6)" :key="keyword.value" type="button" @click="toggleKeyword(keyword.value)" :class="chipClasses(!!f.keywords?.includes(keyword.value))">
                {{ keyword.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 2. EFFECTS -->
        <div>
          <button type="button" @click="toggleAccordion('effects')" class="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors duration-200 ease-v2">
            <span class="text-small font-semibold text-silver flex items-center gap-2">
              {{ t('search.accordions.effects') }}
              <HelpTooltip :text="t('help.tooltips.search.effects')" :title="t('help.titles.effects')" />
            </span>
            <span class="flex items-center gap-2.5 text-silver-50">
              <span v-if="countSelectedInCategory(allCommonEffects) > 0" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neon text-primary font-display text-[11px] font-bold">{{ countSelectedInCategory(allCommonEffects) }}</span>
              <IconV2 name="chev-d" :size="16" class="transition-transform duration-200 ease-v2" :class="{ '-rotate-180': isAccordionOpen('effects') }" />
            </span>
          </button>
          <div v-if="isAccordionOpen('effects')" class="px-3.5 py-3 border-t border-line space-y-3">
            <div v-for="(keywords, catKey) in commonEffects" :key="catKey">
              <span class="text-tiny text-silver-50 uppercase tracking-[.08em] block mb-1.5">{{ t(`search.effectCategories.${catKey}`) }}</span>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="keyword in keywords" :key="keyword.value" type="button" @click="toggleKeyword(keyword.value)" :class="chipClasses(!!f.keywords?.includes(keyword.value))">
                  {{ keyword.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. TRIGGERS -->
        <div>
          <button type="button" @click="toggleAccordion('triggers')" class="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors duration-200 ease-v2">
            <span class="text-small font-semibold text-silver flex items-center gap-2">
              {{ t('search.accordions.triggers') }}
              <HelpTooltip :text="t('help.tooltips.search.triggers')" :title="t('help.titles.triggers')" />
            </span>
            <span class="flex items-center gap-2.5 text-silver-50">
              <span v-if="countSelectedInCategory(triggerKeywords) > 0" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neon text-primary font-display text-[11px] font-bold">{{ countSelectedInCategory(triggerKeywords) }}</span>
              <IconV2 name="chev-d" :size="16" class="transition-transform duration-200 ease-v2" :class="{ '-rotate-180': isAccordionOpen('triggers') }" />
            </span>
          </button>
          <div v-if="isAccordionOpen('triggers')" class="px-3.5 py-3 border-t border-line">
            <div class="flex flex-wrap gap-1.5">
              <button v-for="keyword in triggerKeywords" :key="keyword.value" type="button" @click="toggleKeyword(keyword.value)" :class="chipClasses(!!f.keywords?.includes(keyword.value))">
                {{ keyword.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 4. SET MECHANICS -->
        <div>
          <button type="button" @click="toggleAccordion('setMechanics')" class="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors duration-200 ease-v2">
            <span class="text-small font-semibold text-silver flex items-center gap-2">
              {{ t('search.accordions.setMechanics') }}
              <HelpTooltip :text="t('help.tooltips.search.setMechanics')" :title="t('help.titles.setMechanics')" />
            </span>
            <span class="flex items-center gap-2.5 text-silver-50">
              <span v-if="countSelectedInCategory(allSetMechanics) > 0" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neon text-primary font-display text-[11px] font-bold">{{ countSelectedInCategory(allSetMechanics) }}</span>
              <IconV2 name="chev-d" :size="16" class="transition-transform duration-200 ease-v2" :class="{ '-rotate-180': isAccordionOpen('setMechanics') }" />
            </span>
          </button>
          <div v-if="isAccordionOpen('setMechanics')" class="px-3.5 py-3 border-t border-line space-y-3">
            <div v-for="(keywords, catKey) in setMechanics" :key="catKey">
              <span class="text-tiny text-silver-50 uppercase tracking-[.08em] block mb-1.5">{{ t(`search.mechanicCategories.${catKey}`) }}</span>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="keyword in keywords" :key="keyword.value" type="button" @click="toggleKeyword(keyword.value)" :class="chipClasses(!!f.keywords?.includes(keyword.value))">
                  {{ keyword.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== CREATURE TYPES ACCORDION ========== -->
      <div class="border border-line rounded-lg bg-surface-1 overflow-hidden">
        <button
            type="button"
            @click="toggleAccordion('creatureTypes')"
            class="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors duration-200 ease-v2"
        >
          <span class="text-small font-semibold text-silver flex items-center gap-2">
            {{ t('search.accordions.creatureTypes') }}
            <HelpTooltip :text="t('help.tooltips.search.creatureTypes')" :title="t('help.titles.creatureTypes')" />
          </span>
          <span class="flex items-center gap-2.5 text-silver-50">
            <span v-if="f.creatureTypes?.length" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-neon text-primary font-display text-[11px] font-bold">{{ f.creatureTypes.length }}</span>
            <IconV2 name="chev-d" :size="16" class="transition-transform duration-200 ease-v2" :class="{ '-rotate-180': isAccordionOpen('creatureTypes') }" />
          </span>
        </button>
        <div v-if="isAccordionOpen('creatureTypes')" class="px-3.5 py-3 border-t border-line">
          <div class="relative mb-2.5">
            <input
                v-model="creatureTypeSearchQuery"
                type="text"
                :placeholder="t('search.filterPanel.creatureTypeSearchPlaceholder')"
                class="w-full min-h-[40px] bg-surface-2 border border-line rounded-md px-3 pr-8 text-small text-silver placeholder:text-silver-30 focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2"
            />
            <button v-if="creatureTypeSearchQuery.length > 0" type="button" @click="creatureTypeSearchQuery = ''"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-silver-50 hover:text-silver transition-colors duration-200 ease-v2 rounded-full hover:bg-surface-2">
              <IconV2 name="x" :size="12" />
            </button>
          </div>
          <div v-if="f.creatureTypes?.length" class="flex flex-wrap gap-1.5 mb-2.5 pb-2.5 border-b border-line">
            <button v-for="ct in f.creatureTypes" :key="`selected-ct-${ct}`" type="button" @click="toggleCreatureType(ct)" :class="pillClasses">
              {{ getCreatureTypeLabel(ct) }} <IconV2 name="x" :size="12" />
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
                v-for="ct in displayCreatureTypes"
                :key="ct.value"
                type="button"
                @click="toggleCreatureType(ct.value)"
                :class="chipClasses(!!f.creatureTypes?.includes(ct.value))"
            >
              {{ ct.label }}<span v-if="ct.count" class="ml-1 opacity-70">({{ ct.count }})</span>
            </button>
          </div>
          <button
              v-if="!creatureTypeSearchQuery && totalCreatureTypeCount > 20"
              type="button"
              @click="showAllCreatureTypes = !showAllCreatureTypes"
              class="mt-2.5 text-tiny text-neon hover:underline"
          >
            {{ showAllCreatureTypes ? t('common.actions.close') : `Show all (${totalCreatureTypeCount})` }}
          </button>
          <p v-if="displayCreatureTypes.length === 0 && creatureTypeSearchQuery" class="text-tiny text-silver-50 py-2">
            {{ t('search.filterPanel.noCreatureTypesFound') }}
          </p>
        </div>
      </div>

      <!-- Tipos Especiales -->
      <div>
        <span class="text-tiny font-bold text-silver-50 uppercase tracking-[.1em] mb-2.5 flex items-center gap-1.5">
          {{ t('search.modal.sections.specialTypes') }}
          <HelpTooltip :text="t('help.tooltips.search.specialTypes')" :title="t('help.titles.specialTypes')" />
        </span>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="keyword in specialTypes" :key="keyword.value" type="button" @click="toggleKeyword(keyword.value)" :class="chipClasses(!!f.keywords?.includes(keyword.value))">
            {{ keyword.label }}
          </button>
        </div>
      </div>

      <!-- Opciones especiales (switches v2) -->
      <div class="flex flex-wrap gap-6 pt-4 border-t border-line items-center">
        <label class="flex items-center gap-3 text-small text-silver cursor-pointer select-none">
          <span class="relative inline-flex w-11 h-6 rounded-full border transition-all duration-200 ease-v2 flex-shrink-0" :class="f.isFoil ? 'bg-neon-15 border-neon-40' : 'bg-surface-3 border-line-strong'">
            <input v-model="f.isFoil" @change="emitUpdate()" type="checkbox" class="absolute inset-0 opacity-0 cursor-pointer" />
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ease-v2" :class="f.isFoil ? 'translate-x-[18px] bg-neon' : 'bg-silver-50'"></span>
          </span>
          {{ t('search.modal.options.foilOnly') }}
        </label>
        <label class="flex items-center gap-3 text-small text-silver cursor-pointer select-none">
          <span class="relative inline-flex w-11 h-6 rounded-full border transition-all duration-200 ease-v2 flex-shrink-0" :class="f.isFullArt ? 'bg-neon-15 border-neon-40' : 'bg-surface-3 border-line-strong'">
            <input v-model="f.isFullArt" @change="emitUpdate()" type="checkbox" class="absolute inset-0 opacity-0 cursor-pointer" />
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ease-v2" :class="f.isFullArt ? 'translate-x-[18px] bg-neon' : 'bg-silver-50'"></span>
          </span>
          {{ t('search.modal.options.fullArt') }}
        </label>
        <HelpTooltip :text="t('help.tooltips.search.foilFullArt')" :title="t('help.titles.foilFullArt')" />
      </div>

      <!-- Footer -->
      <div class="flex justify-between items-center pt-4 border-t border-line">
        <BaseButton
            v-if="activeFilterCount > 0"
            variant="danger"
            class="uppercase tracking-[.1em] !text-[12px]"
            @click="handleReset"
        >
          {{ t('search.filterPanel.clear') }}
        </BaseButton>
        <div v-else></div>
        <BaseButton variant="filled" class="uppercase tracking-[.1em] !text-[12px]" @click="emit('close')">
          {{ t('search.modal.apply') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(238, 238, 238, 0.2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(238, 238, 238, 0.4); }
</style>
